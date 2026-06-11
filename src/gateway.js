import http from 'node:http';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { ACCOUNT_PATH, CORS_ALLOW_HEADERS, DEFAULT_CODEX_ORIGINATOR, DEFAULT_CODEX_USER_AGENT, DEFAULT_MODELS, OPENAI_API_BASE, UPSTREAM_BASE } from './constants.js';
import {
  codexHome,
  convertAccountsJsonContent,
  deleteAccount,
  exportAccountsFormatted,
  importFromCodexAuth,
  importFromJsonContent,
  importFromOAuthTokens,
  getAccountById,
  listAccounts,
  loadAccount,
  refreshAccountIfNeeded,
  setCurrentAccount,
} from './account.js';
import { rotateApiKey } from './config.js';
import { readJson } from './storage.js';
import { mask } from './utils.js';
import { getLocalApiKey, jsonResponse, localModels, optionsResponse, readBody } from './http-utils.js';
import {
  buildResponsesBodyFromChat,
  isChatCompletionsPath,
  rewriteModelAliasInJsonBody,
  writeChatCompletionsResponseFromResponses,
  writeChatCompletionsStreamFromResponses,
} from './chat-completions.js';
import { parseSseFrame, splitSseFrames } from './sse.js';
import { renderAdminHtml } from './admin-ui.js';
import { loadWakeupHistory, loadWakeupSchedule, runWakeup, runWakeupScheduleNow, saveWakeupSchedule } from './wakeup.js';
import { loadQuotaRefreshSchedule, refreshAccountQuota, refreshAccountQuotas, runQuotaRefreshNow, saveQuotaRefreshSchedule } from './quota.js';
import { getCodexAppState, saveCodexQuickConfig, switchCodexAppAccount, activateCodexApiService } from './codex-app.js';
import { scheduleCodexAppRestart, scheduleCodexAppRestartWithTask } from './codex-process.js';
import { getProxyAccountIdsForRequest, loadLocalAccessConfig, saveLocalAccessConfig } from './local-access.js';
import {
  clearLocalAccessAccountFailure,
  clearLocalAccessStats,
  extractUsageCapture,
  loadLocalAccessStats,
  recordLocalAccessStats,
  summarizeLocalAccessStats,
} from './local-access-stats.js';
import { killNodeProcessCleanupCandidates, listNodeProcessCleanupCandidates } from './process-cleaner.js';
import { repairSessionVisibility } from './session-visibility.js';
import { deleteCodexSessions, listCodexSessions, repairCodexSessionVisibility } from './session-manager.js';
import { getTokenKeeperState, runTokenKeeperNow } from './token-keeper.js';
import {
  cancelCodexOAuthLogin,
  completeCodexOAuthLogin,
  getCodexOAuthStatus,
  startCodexOAuthLogin,
  submitCodexOAuthCallbackUrl,
} from './codex-oauth.js';

const RESPONSE_AFFINITY_TTL_MS = 24 * 60 * 60 * 1000;
const MODEL_COOLDOWN_MAX_MS = 14 * 24 * 60 * 60 * 1000;
const UPSTREAM_SEND_RETRY_ATTEMPTS = 2;
const UPSTREAM_SEND_RETRY_BASE_DELAY_MS = 200;
const MAX_FALLBACK_DIAGNOSTIC_ATTEMPTS = 12;
const MAX_RUNTIME_COOLDOWNS = 12;
const CODEX_THREAD_LOOKUP_WINDOW_MS = 10 * 60 * 1000;
const MAX_LOCAL_ACCESS_CALL_HISTORY = 50;

const responseAffinity = new Map();
const modelCooldowns = new Map();
const activeLocalAccessRequests = new Map();
const recentLocalAccessCalls = [];
let localAccessRequestSequence = 0;
let lastLocalAccessRequest = null;
const execFileAsync = promisify(execFile);
let codexSessionIndexCache = { mtimeMs: 0, names: new Map() };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runtimeAccountSummary(account) {
  if (!account) return null;
  return {
    id: account.id,
    email: account.email,
    accountId: account.accountId || account.account_id || null,
    planType: account.planType || account.plan_type || null,
  };
}

function runtimeAccountRef(account, fallbackId = null) {
  const summary = runtimeAccountSummary(account);
  if (summary) return summary;
  const id = String(fallbackId || '').trim();
  return id ? { id, email: null, accountId: null, planType: null } : null;
}

function maskResponseId(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.length <= 12) return mask(raw);
  return `${raw.slice(0, 8)}...${raw.slice(-6)}`;
}

function redactDiagnosticText(value) {
  return String(value || '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/ig, 'Bearer [redacted]')
    .replace(/sk-[A-Za-z0-9_-]{8,}/ig, 'sk-[redacted]')
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, '[jwt-redacted]')
    .slice(0, 160);
}

function safeFailureReason(reason, fallback = 'request failed') {
  const text = redactDiagnosticText(reason || fallback).trim();
  return text || fallback;
}

function safeErrorReason(err, fallback = 'request failed') {
  const code = err?.code || err?.cause?.code || err?.name || '';
  return safeFailureReason(code ? `${fallback} (${code})` : fallback, fallback);
}

function isTailscaleIpv4Address(address) {
  const parts = String(address || '').trim().split('.').map((part) => Number(part));
  return parts.length === 4
    && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    && parts[0] === 100
    && parts[1] >= 64
    && parts[1] <= 127;
}

function detectTailscaleIpv4() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry && entry.family === 'IPv4' && !entry.internal && isTailscaleIpv4Address(entry.address)) {
        return entry.address;
      }
    }
  }
  return null;
}

function gatewayNetworkState(config) {
  return {
    listenHost: config.host,
    listenPort: config.port,
    tailscaleIpv4: detectTailscaleIpv4(),
  };
}

function nestedErrorText(err) {
  const parts = [];
  let current = err;
  const seen = new Set();
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    if (current.name) parts.push(String(current.name));
    if (current.code) parts.push(String(current.code));
    if (current.errno) parts.push(String(current.errno));
    if (current.message) parts.push(String(current.message));
    current = current.cause;
  }
  return parts.join(' ').toLowerCase();
}

function upstreamNetworkDiagnostics(err) {
  const text = nestedErrorText(err);
  const code = String(err?.code || err?.cause?.code || err?.cause?.cause?.code || '').trim().toUpperCase();
  let category = 'network';
  let detail = 'Codex 上游网络或代理连接失败';
  if (/enotfound|eai_again|dns|getaddrinfo/.test(text)) {
    category = 'dns';
    detail = 'Codex 上游域名解析失败';
  } else if (/econnrefused|refused/.test(text)) {
    category = 'refused';
    detail = 'Codex 上游连接被拒绝，通常是代理端口不可用或被拦截';
  } else if (/etimedout|timeout|timed out|headers timeout|body timeout/.test(text)) {
    category = 'timeout';
    detail = 'Codex 上游连接超时';
  } else if (/econnreset|socket hang up|terminated|aborted/.test(text)) {
    category = 'reset';
    detail = 'Codex 上游连接被重置';
  } else if (/proxy|socks|tunnel|connect/.test(text)) {
    category = 'proxy';
    detail = '代理连接到 Codex 上游失败';
  } else if (/fetch failed/.test(text)) {
    category = 'fetch_failed';
  }
  const hint = '请检查网络、系统代理/HTTP(S)_PROXY/NO_PROXY 设置，以及 chatgpt.com 是否可访问';
  return {
    category,
    code: code || null,
    message: safeFailureReason(`${detail}${code ? ` (${code})` : ''}；${hint}`, detail),
  };
}

function safeDiagnosticValue(value) {
  if (value === undefined || value === null) return null;
  if (['string', 'number', 'boolean'].includes(typeof value)) return value;
  return Array.isArray(value) ? `[array:${value.length}]` : '[object]';
}

function collectSafeDiagnosticFields(value, prefix = '', output = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return output;
  for (const [key, item] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const lower = path.toLowerCase();
    if (/(message|messages|input|prompt|content|instruction|instructions|tool|tools)/i.test(path)) continue;
    if (/(token|secret|key|auth|credential|password|cookie)/i.test(path)) continue;
    if (/(model|speed|tier|effort|reasoning|priority|thread|conversation|session[_-]?id|cwd|workspace|project|repo|repository|originator|source|client|request[_-]?id)/i.test(path)) {
      output[path] = safeDiagnosticValue(item);
    }
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      collectSafeDiagnosticFields(item, path, output);
    }
    if (Object.keys(output).length >= 24) break;
    if (!lower) continue;
  }
  return output;
}

function safeHeaderDiagnostics(req) {
  const output = {};
  const headers = req?.headers || {};
  for (const [key, value] of Object.entries(headers)) {
    if (!/(speed|tier|model|effort|reasoning|priority|beta)/i.test(key)) continue;
    output[key] = Array.isArray(value) ? value.join(', ') : String(value || '');
  }
  return output;
}

function parseHeaderNumber(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null || raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function bufferBytes(value) {
  if (Buffer.isBuffer(value)) return value.length;
  return Buffer.byteLength(String(value || ''), 'utf8');
}

function requestSizeDiagnostics(req, body, meta = {}) {
  const bodyBytes = Number.isFinite(meta.bodyBytes) ? Number(meta.bodyBytes) : bufferBytes(body);
  const upstreamBodyBytes = Number.isFinite(meta.upstreamBodyBytes)
    ? Number(meta.upstreamBodyBytes)
    : bodyBytes;
  const contentLengthBytes = parseHeaderNumber(req?.headers?.['content-length']);
  const output = {
    bodyBytes,
    bodyMb: Number((bodyBytes / 1024 / 1024).toFixed(3)),
    upstreamBodyBytes,
    upstreamBodyMb: Number((upstreamBodyBytes / 1024 / 1024).toFixed(3)),
  };
  if (contentLengthBytes !== null) {
    output.contentLengthBytes = contentLengthBytes;
    output.contentLengthMb = Number((contentLengthBytes / 1024 / 1024).toFixed(3));
  }
  return output;
}

function socketConnectionDiagnostics(req) {
  const socket = req?.socket;
  if (!socket) return null;
  const localPort = Number(socket.localPort || 0);
  const remotePort = Number(socket.remotePort || 0);
  return {
    localAddress: socket.localAddress || null,
    localPort: Number.isFinite(localPort) && localPort > 0 ? localPort : null,
    remoteAddress: socket.remoteAddress || null,
    remotePort: Number.isFinite(remotePort) && remotePort > 0 ? remotePort : null,
  };
}

function isLoopbackAddress(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw === '127.0.0.1' || raw === '::1' || raw === '::ffff:127.0.0.1' || raw === 'localhost';
}

function normalizeProcessName(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  return raw.replace(/[^\w .()[\]-]/g, '').slice(0, 80) || null;
}

function normalizeDiagnosticText(value, max = 120) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  return raw.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').slice(0, max) || null;
}

function normalizeDiagnosticPath(value, max = 180) {
  const text = normalizeDiagnosticText(value, max);
  if (!text) return null;
  return text.replace(/^\\\\\?\\/, '');
}

function shortDiagnosticId(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.length <= 16) return raw;
  return `${raw.slice(0, 8)}...${raw.slice(-6)}`;
}

function rowUpdatedAtMs(row) {
  const precise = Number(row?.updated_at_ms || 0);
  if (Number.isFinite(precise) && precise > 0) return precise;
  const seconds = Number(row?.updated_at || 0);
  if (Number.isFinite(seconds) && seconds > 0) return seconds > 100000000000 ? seconds : seconds * 1000;
  return 0;
}

function codexSessionIndexNames() {
  const indexPath = path.join(codexHome(), 'session_index.jsonl');
  try {
    const stat = fs.statSync(indexPath);
    if (codexSessionIndexCache.mtimeMs === stat.mtimeMs) return codexSessionIndexCache.names;
    const names = new Map();
    const content = fs.readFileSync(indexPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const raw = line.trim();
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        const id = String(parsed?.id || '').trim();
        const name = normalizeDiagnosticText(parsed?.thread_name, 80);
        if (id && name) names.set(id, name);
      } catch {}
    }
    codexSessionIndexCache = { mtimeMs: stat.mtimeMs, names };
    return names;
  } catch {
    codexSessionIndexCache = { mtimeMs: 0, names: new Map() };
    return codexSessionIndexCache.names;
  }
}

function codexSidebarThreadName(threadId) {
  const id = String(threadId || '').trim();
  return id ? (codexSessionIndexNames().get(id) || null) : null;
}

function fallbackThreadTitle(row) {
  const title = normalizeDiagnosticText(row?.title, 80);
  if (!title) return null;
  const firstLine = title.split(/\s*[\r\n]+\s*/)[0] || title;
  return normalizeDiagnosticText(firstLine, 80);
}

function threadDiagnosticsFromRow(row, startedAt) {
  const updatedAtMs = rowUpdatedAtMs(row);
  const cwd = normalizeDiagnosticPath(row?.cwd, 180);
  const sidebarTitle = codexSidebarThreadName(row?.id);
  return {
    lookup: 'ok',
    id: shortDiagnosticId(row?.id),
    title: sidebarTitle || fallbackThreadTitle(row),
    sidebarTitle,
    titleSource: sidebarTitle ? 'session_index' : 'threads',
    cwd,
    project: cwd ? normalizeDiagnosticText(path.basename(cwd), 80) : null,
    source: normalizeDiagnosticText(row?.source || row?.thread_source, 40),
    modelProvider: normalizeDiagnosticText(row?.model_provider, 60),
    updatedAt: updatedAtMs || null,
    updatedAgeMs: updatedAtMs && startedAt ? Math.max(0, Math.round(startedAt - updatedAtMs)) : null,
  };
}

function lookupRecentCodexThread(startedAt = Date.now()) {
  const dbPath = path.join(codexHome(), 'state_5.sqlite');
  if (!fs.existsSync(dbPath)) return { lookup: 'not_found' };
  let db = null;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    const rows = db.prepare(`
      SELECT id, title, cwd, source, model_provider, updated_at, updated_at_ms, thread_source
      FROM threads
      WHERE COALESCE(archived, 0) = 0
      ORDER BY COALESCE(updated_at_ms, updated_at * 1000, created_at_ms, 0) DESC
      LIMIT 12
    `).all();
    let best = null;
    let bestDistance = Infinity;
    for (const row of rows) {
      const updatedAtMs = rowUpdatedAtMs(row);
      if (!updatedAtMs) continue;
      const distance = Math.abs(startedAt - updatedAtMs);
      if (distance < bestDistance) {
        best = row;
        bestDistance = distance;
      }
    }
    if (!best || bestDistance > CODEX_THREAD_LOOKUP_WINDOW_MS) return { lookup: 'not_found' };
    return threadDiagnosticsFromRow(best, startedAt);
  } catch {
    return { lookup: 'failed' };
  } finally {
    try { db?.close(); } catch {}
  }
}

function endpointPort(value) {
  const raw = String(value || '').trim();
  const idx = raw.lastIndexOf(':');
  if (idx < 0) return null;
  const port = Number(raw.slice(idx + 1));
  return Number.isFinite(port) && port > 0 ? port : null;
}

function firstCsvValue(line) {
  const raw = String(line || '').trim();
  if (!raw) return null;
  if (!raw.startsWith('"')) return raw.split(',')[0]?.trim() || null;
  let value = '';
  for (let i = 1; i < raw.length; i += 1) {
    if (raw[i] === '"') {
      if (raw[i + 1] === '"') {
        value += '"';
        i += 1;
        continue;
      }
      break;
    }
    value += raw[i];
  }
  return value.trim() || null;
}

async function lookupWindowsClientProcess(connection) {
  if (process.platform !== 'win32') return null;
  const serverPort = Number(connection?.localPort || 0);
  const clientPort = Number(connection?.remotePort || 0);
  if (!Number.isFinite(serverPort) || !Number.isFinite(clientPort) || serverPort <= 0 || clientPort <= 0) return null;

  try {
    const { stdout } = await execFileAsync('netstat.exe', ['-ano', '-p', 'TCP'], {
      timeout: 1800,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    let match = null;
    for (const line of String(stdout || '').split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/).filter(Boolean);
      if (parts.length < 5 || parts[0].toUpperCase() !== 'TCP') continue;
      const pid = Number(parts[parts.length - 1]);
      const state = parts[parts.length - 2] || null;
      const foreign = parts[parts.length - 3] || '';
      const local = parts[parts.length - 4] || '';
      if (endpointPort(local) === clientPort && endpointPort(foreign) === serverPort) {
        match = { pid, state };
        break;
      }
    }
    const pid = Number(match?.pid || 0);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    let name = null;
    try {
      const task = await execFileAsync('tasklist.exe', ['/FO', 'CSV', '/NH', '/FI', `PID eq ${pid}`], {
        timeout: 1800,
        windowsHide: true,
        maxBuffer: 128 * 1024,
      });
      const taskLine = String(task.stdout || '').split(/\r?\n/).find((line) => line.trim().startsWith('"'));
      name = normalizeProcessName(firstCsvValue(taskLine));
    } catch {}
    return {
      pid,
      name: name || null,
      state: normalizeProcessName(match.state) || null,
    };
  } catch {
    return null;
  }
}

function attachClientProcessDiagnostics(req, diagnostics) {
  if (!diagnostics) return;
  const connection = socketConnectionDiagnostics(req);
  if (!connection) return;
  diagnostics.client = {
    connection,
    process: null,
    processLookup: process.platform === 'win32' && isLoopbackAddress(connection.remoteAddress) ? 'pending' : 'unsupported',
  };
  if (diagnostics.client.processLookup !== 'pending') return;
  lookupWindowsClientProcess(connection)
    .then((clientProcess) => {
      if (!diagnostics.client) return;
      if (clientProcess) {
        diagnostics.client.process = clientProcess;
        diagnostics.client.processLookup = 'ok';
      } else {
        diagnostics.client.processLookup = 'not_found';
      }
    })
    .catch(() => {
      if (diagnostics.client) diagnostics.client.processLookup = 'failed';
    });
}

function safeRequestDiagnostics(req, body, target, meta = {}) {
  const parsed = parseRequestJson(body) || {};
  const startedAt = Number(meta.startedAt || Date.now());
  const diagnostics = {
    method: req.method,
    path: target || upstreamPath(req.url) || req.url,
    size: requestSizeDiagnostics(req, body, meta),
    body: collectSafeDiagnosticFields(parsed),
    headers: safeHeaderDiagnostics(req),
    codexThread: lookupRecentCodexThread(startedAt),
  };
  attachClientProcessDiagnostics(req, diagnostics);
  return diagnostics;
}

function classifyUpstreamFailure(status, bodyText = '') {
  const code = Number(status || 0);
  const text = String(bodyText || '');
  if (code === 400) {
    if (/context|length|too.large|maximum|token/i.test(text)) return 'HTTP 400: request rejected by upstream limits';
    return 'HTTP 400: upstream rejected request';
  }
  if (code === 401) return 'HTTP 401: authorization expired or rejected';
  if (code === 403) {
    if (/usage_limit|rate_limit|limit_reached|resets_in_seconds|quota|capacity/i.test(text)) {
      return 'HTTP 403: usage or quota limited';
    }
    return 'HTTP 403: upstream denied access';
  }
  if (code === 408) return 'HTTP 408: upstream timeout';
  if (code === 429) return 'HTTP 429: rate or quota limited';
  if ([500, 502, 503, 504].includes(code)) return `HTTP ${code}: upstream temporarily unavailable`;
  return code ? `HTTP ${code}: upstream request failed` : 'upstream request failed';
}

function createRoutingDiagnostics(hint, affinityBinding, accountIds) {
  const responseAffinity = responseAffinityLookupDiagnostics(hint.previousResponseId, affinityBinding);
  if (responseAffinity.matched) {
    responseAffinity.inPool = accountIds.includes(responseAffinity.binding?.accountId);
  }
  return {
    accountCount: accountIds.length,
    model: hint.modelKey || null,
    responseAffinity,
    attempts: [],
    final: null,
  };
}

function pushRoutingAttempt(diagnostics, item = {}) {
  if (!diagnostics || diagnostics.attempts.length >= MAX_FALLBACK_DIAGNOSTIC_ATTEMPTS) return null;
  const account = runtimeAccountRef(item.account, item.accountId);
  const attempt = {
    timestamp: Date.now(),
    accountId: account?.id || String(item.accountId || '').trim() || null,
    email: account?.email || null,
    account,
    model: item.model || null,
    success: item.success === true,
    statusCode: item.statusCode ?? null,
    reason: item.reason ? safeFailureReason(item.reason) : null,
    retryable: item.retryable === true,
    skipped: item.skipped === true,
    recovered: item.recovered === true,
  };
  if (Number.isFinite(item.cooldownMs) && item.cooldownMs > 0) attempt.cooldownMs = Math.round(item.cooldownMs);
  diagnostics.attempts.push(attempt);
  return attempt;
}

function lastFailedRoutingAttempt(diagnostics) {
  const attempts = Array.isArray(diagnostics?.attempts) ? diagnostics.attempts : [];
  for (let i = attempts.length - 1; i >= 0; i -= 1) {
    if (attempts[i] && attempts[i].success !== true && attempts[i].recovered !== true) return attempts[i];
  }
  return null;
}

function finalizeRoutingDiagnostics(diagnostics, upstream, account) {
  if (!diagnostics) return diagnostics;
  const failed = lastFailedRoutingAttempt(diagnostics);
  diagnostics.final = {
    ok: Boolean(upstream?.ok),
    statusCode: upstream?.status ?? null,
    account: runtimeAccountRef(account),
    reason: upstream?.ok ? null : (failed?.reason || classifyUpstreamFailure(upstream?.status)),
  };
  return diagnostics;
}

function applyServiceTierMode(body, mode = 'normal') {
  const raw = Buffer.isBuffer(body) ? body.toString('utf8') : String(body || '');
  if (!raw.trim()) return { body: Buffer.isBuffer(body) ? body : Buffer.from(raw), rewrite: null };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { body: Buffer.isBuffer(body) ? body : Buffer.from(raw), rewrite: null };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { body: Buffer.isBuffer(body) ? body : Buffer.from(raw), rewrite: null };
  }
  const tier = String(parsed.service_tier || '').trim().toLowerCase();
  const normalizedMode = String(mode || 'normal').trim().toLowerCase();
  if (normalizedMode === 'fast') {
    parsed.service_tier = 'priority';
    return {
      body: Buffer.from(JSON.stringify(parsed)),
      rewrite: tier === 'priority'
        ? { 'gateway.service_tier_mode': 'fast' }
        : { 'gateway.service_tier_rewrite': `${tier || '<missing>'}->priority` },
    };
  }
  if (normalizedMode === 'passthrough') {
    return {
      body: Buffer.isBuffer(body) ? body : Buffer.from(raw),
      rewrite: { 'gateway.service_tier_mode': 'passthrough' },
    };
  }
  if (!tier) return {
    body: Buffer.isBuffer(body) ? body : Buffer.from(raw),
    rewrite: { 'gateway.service_tier_mode': 'normal' },
  };
  delete parsed.service_tier;
  return {
    body: Buffer.from(JSON.stringify(parsed)),
    rewrite: { 'gateway.service_tier_rewrite': `${tier}->removed` },
  };
}

function recordLocalAccessCall(entry, success = null) {
  if (!entry) return;
  const finishedAt = Number(entry.finishedAt || Date.now());
  const startedAt = Number(entry.startedAt || finishedAt);
  const request = entry.request || null;
  recentLocalAccessCalls.unshift({
    id: entry.requestId || `${finishedAt}_${recentLocalAccessCalls.length}`,
    account: entry.account || null,
    target: entry.target || null,
    model: entry.model || request?.body?.model || null,
    startedAt,
    finishedAt,
    durationMs: Math.max(0, finishedAt - startedAt),
    success,
    statusCode: request?.upstream?.statusCode ?? null,
    request,
  });
  if (recentLocalAccessCalls.length > MAX_LOCAL_ACCESS_CALL_HISTORY) {
    recentLocalAccessCalls.length = MAX_LOCAL_ACCESS_CALL_HISTORY;
  }
}

function getLocalAccessCallHistory(limit = 20) {
  const max = Math.max(1, Math.min(Number(limit || 20), MAX_LOCAL_ACCESS_CALL_HISTORY));
  return recentLocalAccessCalls.slice(0, max).map((item) => {
    const request = item.request || {};
    return {
      id: item.id,
      account: item.account || null,
      target: item.target || request.path || null,
      model: item.model || request.body?.model || null,
      startedAt: item.startedAt || null,
      finishedAt: item.finishedAt || null,
      durationMs: item.durationMs || null,
      success: item.success,
      statusCode: item.statusCode ?? request.upstream?.statusCode ?? null,
      thread: request.codexThread || null,
      client: request.client || null,
      request: {
        body: request.body || {},
        headers: request.headers || {},
        size: request.size || {},
        upstream: request.upstream || null,
        responseAffinity: request.responseAffinity || null,
      },
    };
  });
}

function beginLocalAccessRequest(account, startedAt = Date.now(), meta = {}) {
  if (!account?.id) return null;
  const requestId = `${Date.now()}_${++localAccessRequestSequence}`;
  const entry = {
    requestId,
    account: runtimeAccountSummary(account),
    target: meta.target || null,
    model: meta.model || null,
    request: meta.request || null,
    startedAt,
    updatedAt: Date.now(),
  };
  activeLocalAccessRequests.set(requestId, entry);
  lastLocalAccessRequest = { ...entry };
  return (success = null) => {
    const current = activeLocalAccessRequests.get(requestId) || entry;
    activeLocalAccessRequests.delete(requestId);
    lastLocalAccessRequest = {
      ...current,
      success,
      finishedAt: Date.now(),
      updatedAt: Date.now(),
    };
    recordLocalAccessCall(lastLocalAccessRequest, success);
  };
}

function getLocalAccessRuntimeState() {
  const activeRequests = Array.from(activeLocalAccessRequests.values())
    .sort((a, b) => Number(b.startedAt || 0) - Number(a.startedAt || 0));
  const current = activeRequests[0] || null;
  return {
    activeCount: activeRequests.length,
    currentAccount: current?.account || null,
    currentStartedAt: current?.startedAt || null,
    currentRequest: current?.request || null,
    activeRequests,
    lastAccount: lastLocalAccessRequest?.account || null,
    lastRequest: lastLocalAccessRequest?.request || null,
    lastStartedAt: lastLocalAccessRequest?.startedAt || null,
    lastFinishedAt: lastLocalAccessRequest?.finishedAt || null,
    lastSuccess: lastLocalAccessRequest?.success ?? null,
    callHistory: getLocalAccessCallHistory(),
    cooldowns: cooldownRuntimeState(),
    responseAffinityCount: responseAffinity.size,
  };
}

function pruneRuntimeRoutingState() {
  const now = Date.now();
  for (const [responseId, binding] of responseAffinity.entries()) {
    if (now - Number(binding.updatedAt || 0) > RESPONSE_AFFINITY_TTL_MS) {
      responseAffinity.delete(responseId);
    }
  }
  for (const [key, cooldown] of modelCooldowns.entries()) {
    if (Number(cooldown.until || 0) <= now) modelCooldowns.delete(key);
  }
}

function cooldownKey(accountId, modelKey) {
  const a = String(accountId || '').trim();
  const m = String(modelKey || '').trim().toLowerCase();
  return a && m ? `${a}\u001f${m}` : null;
}

function getModelCooldownWait(accountId, modelKey) {
  const key = cooldownKey(accountId, modelKey);
  if (!key) return 0;
  pruneRuntimeRoutingState();
  const until = Number(modelCooldowns.get(key)?.until || 0);
  return Math.max(0, until - Date.now());
}

function setModelCooldown(accountId, modelKey, waitMs) {
  const key = cooldownKey(accountId, modelKey);
  if (!key || !Number.isFinite(waitMs) || waitMs <= 0) return;
  modelCooldowns.set(key, {
    until: Date.now() + Math.min(waitMs, MODEL_COOLDOWN_MAX_MS),
  });
}

function clearModelCooldown(accountId, modelKey) {
  const key = cooldownKey(accountId, modelKey);
  if (key) modelCooldowns.delete(key);
}

function parseCooldownKeyValue(key) {
  const [accountId, ...rest] = String(key || '').split('\u001f');
  return { accountId, model: rest.join('\u001f') || null };
}

function cooldownRuntimeState() {
  pruneRuntimeRoutingState();
  const now = Date.now();
  return Array.from(modelCooldowns.entries())
    .map(([key, value]) => {
      const parsed = parseCooldownKeyValue(key);
      const until = Number(value?.until || 0);
      return {
        accountId: parsed.accountId || null,
        model: parsed.model || null,
        until,
        remainingMs: Math.max(0, until - now),
      };
    })
    .filter((item) => item.accountId && item.remainingMs > 0)
    .sort((a, b) => Number(a.remainingMs || 0) - Number(b.remainingMs || 0))
    .slice(0, MAX_RUNTIME_COOLDOWNS);
}

function responseAffinityBindingDiagnostics(responseId, binding) {
  if (!responseId || !binding) return null;
  const ageMs = Math.max(0, Date.now() - Number(binding.updatedAt || 0));
  return {
    responseId: maskResponseId(responseId),
    accountId: binding.accountId || null,
    account: binding.account || runtimeAccountRef(null, binding.accountId),
    updatedAt: binding.updatedAt || null,
    expiresInMs: Math.max(0, RESPONSE_AFFINITY_TTL_MS - ageMs),
  };
}

function responseAffinityLookupDiagnostics(previousResponseId, binding) {
  const requested = Boolean(String(previousResponseId || '').trim());
  if (!requested) return { requested: false, matched: false };
  return {
    requested: true,
    previousResponseId: maskResponseId(previousResponseId),
    matched: Boolean(binding),
    binding: responseAffinityBindingDiagnostics(previousResponseId, binding),
  };
}

function bindResponseAffinity(responseId, account) {
  const rid = String(responseId || '').trim();
  const aid = String(account?.id || account || '').trim();
  if (!rid || !aid) return;
  pruneRuntimeRoutingState();
  const binding = { accountId: aid, account: runtimeAccountRef(account, aid), updatedAt: Date.now() };
  responseAffinity.set(rid, binding);
  return responseAffinityBindingDiagnostics(rid, binding);
}

function resolveAffinityBinding(previousResponseId) {
  const rid = String(previousResponseId || '').trim();
  if (!rid) return null;
  pruneRuntimeRoutingState();
  return responseAffinity.get(rid) || null;
}

function parseRequestJson(body) {
  try {
    return body?.length ? JSON.parse(body.toString('utf8')) : null;
  } catch {
    return null;
  }
}

function requestRoutingHint(body) {
  const parsed = parseRequestJson(body);
  const modelKey = String(parsed?.model || '').trim().toLowerCase();
  const previousResponseId = parsed?.previous_response_id || parsed?.previousResponseId || null;
  return { modelKey, previousResponseId };
}

function pinPreferredAccount(ids, preferredAccountId) {
  const preferred = String(preferredAccountId || '').trim();
  if (!preferred || !ids.includes(preferred)) return ids;
  return [preferred, ...ids.filter((id) => id !== preferred)];
}

function parseRetryAfterFromBody(status, bodyText = '') {
  if (![403, 429].includes(Number(status))) return 0;
  try {
    const data = JSON.parse(bodyText);
    const candidates = [
      data?.error?.resets_in_seconds,
      data?.detail?.resets_in_seconds,
      data?.resets_in_seconds,
      data?.error?.reset_after_seconds,
      data?.detail?.reset_after_seconds,
      data?.reset_after_seconds,
      data?.retry_after,
    ];
    for (const value of candidates) {
      const number = Number(value);
      if (Number.isFinite(number) && number > 0) return Math.round(number * 1000);
    }
  } catch {}
  return 0;
}

function extractResponseIdFromValue(value) {
  const direct = value?.id;
  const nested = value?.response?.id;
  return String(nested || direct || '').trim() || null;
}

function createResponseCapture(streamMode) {
  return {
    streamMode,
    buffer: '',
    bodyText: '',
    responseId: null,
    usage: null,
    feed(chunk) {
      const text = Buffer.from(chunk).toString('utf8');
      if (!this.streamMode) {
        this.bodyText += text;
        return;
      }
      this.buffer += text;
      const parsed = splitSseFrames(this.buffer);
      this.buffer = parsed.rest;
      for (const frame of parsed.frames) this.processFrame(frame);
    },
    processFrame(frame) {
      const { event, data } = parseSseFrame(frame);
      if (!data || data === '[DONE]') return;
      try {
        const value = JSON.parse(data);
        if (event && value && typeof value === 'object' && !value.type) value.type = event;
        this.responseId = this.responseId || extractResponseIdFromValue(value);
        this.usage = extractUsageCapture(value) || this.usage;
      } catch {}
    },
    finish() {
      if (this.streamMode && this.buffer.trim()) this.processFrame(this.buffer);
      if (!this.streamMode && this.bodyText.trim()) {
        try {
          const value = JSON.parse(this.bodyText);
          this.responseId = this.responseId || extractResponseIdFromValue(value);
          this.usage = extractUsageCapture(value) || this.usage;
        } catch {}
      }
      return { responseId: this.responseId, usage: this.usage };
    },
  };
}

function isStreamRequest(req, body) {
  const accept = String(req.headers.accept || '').toLowerCase();
  if (accept.includes('text/event-stream')) return true;
  try {
    return JSON.parse(body.toString('utf8')).stream === true;
  } catch {
    return false;
  }
}

function upstreamPath(url) {
  const u = new URL(url, 'http://localhost');
  if (!u.pathname.startsWith('/v1/')) return null;
  return u.pathname.slice(3) + u.search;
}

function isOpenAiImagesPath(reqUrl) {
  const u = new URL(reqUrl, 'http://localhost');
  return u.pathname === '/v1/images/generations' || u.pathname === '/v1/images/edits';
}

function configuredOpenAiApiKey() {
  const key = process.env.CODEX_GATEWAY_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
  return String(key).trim() || null;
}

function hasHeader(headers, name) {
  const lower = String(name || '').toLowerCase();
  return Object.keys(headers || {}).some((key) => key.toLowerCase() === lower);
}

function copyOpenAiApiHeaders(req, body) {
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase();
    if ([
      'authorization',
      'host',
      'content-length',
      'connection',
      'accept-encoding',
      'transfer-encoding',
      'expect',
      'x-api-key',
      'chatgpt-account-id',
    ].includes(lower)) {
      continue;
    }
    headers[key] = Array.isArray(value) ? value.join(', ') : String(value);
  }

  headers.accept = headers.accept || 'application/json';
  if (body?.length && !hasHeader(headers, 'content-type')) headers['content-type'] = 'application/json';
  headers.authorization = `Bearer ${configuredOpenAiApiKey()}`;
  if (process.env.OPENAI_ORG_ID && !hasHeader(headers, 'OpenAI-Organization')) {
    headers['OpenAI-Organization'] = process.env.OPENAI_ORG_ID;
  }
  if (process.env.OPENAI_PROJECT_ID && !hasHeader(headers, 'OpenAI-Project')) {
    headers['OpenAI-Project'] = process.env.OPENAI_PROJECT_ID;
  }
  return headers;
}

function openAiResponseHeaders(upstream) {
  const headers = {
    'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': CORS_ALLOW_HEADERS,
  };
  for (const key of ['cache-control', 'openai-processing-ms', 'openai-version', 'x-request-id']) {
    const value = upstream.headers.get(key);
    if (value) headers[key] = value;
  }
  return headers;
}

async function proxyOpenAiImageRequest(req, res, body) {
  if (req.method !== 'POST') {
    return jsonResponse(res, 405, { error: 'Only POST is allowed for image generation/edit endpoints' });
  }

  if (!configuredOpenAiApiKey()) {
    return jsonResponse(res, 501, {
      error: 'Images API proxy requires OPENAI_API_KEY or CODEX_GATEWAY_OPENAI_API_KEY in the Gateway process environment',
      endpoints: ['POST /v1/images/generations', 'POST /v1/images/edits'],
      model: 'gpt-image-2',
    });
  }

  const target = upstreamPath(req.url);
  const upstream = await fetch(`${OPENAI_API_BASE}${target}`, {
    method: req.method,
    headers: copyOpenAiApiHeaders(req, body),
    body: body.length ? body : undefined,
  });

  res.writeHead(upstream.status, openAiResponseHeaders(upstream));
  if (!upstream.body) return res.end();
  try {
    for await (const chunk of upstream.body) res.write(chunk);
  } finally {
    res.end();
  }
}

function copyUpstreamHeaders(req, streamMode) {
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase();
    if ([
      'authorization',
      'host',
      'content-length',
      'connection',
      'accept-encoding',
      'transfer-encoding',
      'expect',
      'x-api-key',
    ].includes(lower)) {
      continue;
    }
    headers[key] = Array.isArray(value) ? value.join(', ') : String(value);
  }

  headers.accept = streamMode ? 'text/event-stream' : (headers.accept || 'application/json');
  headers['content-type'] = headers['content-type'] || 'application/json';
  headers['user-agent'] = headers['user-agent'] || DEFAULT_CODEX_USER_AGENT;
  headers.originator = headers.originator || DEFAULT_CODEX_ORIGINATOR;
  return headers;
}

async function sendUpstream({ req, body, account, target, streamMode }) {
  const headers = copyUpstreamHeaders(req, streamMode);
  headers.authorization = `Bearer ${account.tokens.access_token.trim()}`;
  if (account.accountId) headers['ChatGPT-Account-Id'] = account.accountId;

  let lastError = null;
  for (let attempt = 0; attempt <= UPSTREAM_SEND_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await fetch(`${UPSTREAM_BASE}${target}`, {
        method: req.method,
        headers,
        body: body.length ? body : undefined,
      });
    } catch (err) {
      lastError = err;
      if (attempt >= UPSTREAM_SEND_RETRY_ATTEMPTS) break;
      await sleep(Math.min(1200, UPSTREAM_SEND_RETRY_BASE_DELAY_MS * (2 ** attempt)));
    }
  }
  const err = lastError || new Error('fetch failed');
  err.upstreamNetworkDiagnostics = upstreamNetworkDiagnostics(err);
  err.statusCode = 502;
  throw err;
}

function rebuildTextResponse(upstream, text) {
  const headers = new Headers();
  upstream.headers.forEach((value, key) => headers.set(key, value));
  return new Response(text, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

function shouldTryNextAccount(status, bodyText = '') {
  if ([408, 429, 500, 502, 503, 504].includes(Number(status))) return true;
  if (![400, 403].includes(Number(status))) return false;
  return /usage_limit|rate_limit|limit_reached|resets_in_seconds|quota|capacity|temporarily|unavailable/i.test(bodyText);
}

async function sendWithAccountPool({ req, body, target, streamMode }) {
  const hint = requestRoutingHint(body);
  const affinityBinding = resolveAffinityBinding(hint.previousResponseId);
  const affinityAccountId = affinityBinding?.accountId || null;
  const ids = pinPreferredAccount(await getProxyAccountIdsForRequest(), affinityAccountId);
  const routingDiagnostics = createRoutingDiagnostics(hint, affinityBinding, ids);
  let lastResponse = null;
  let lastResponseAccount = null;
  let lastError = null;
  let shortestCooldownMs = 0;

  for (const accountId of ids) {
    const cooldownMs = getModelCooldownWait(accountId, hint.modelKey);
    if (cooldownMs > 0) {
      shortestCooldownMs = shortestCooldownMs ? Math.min(shortestCooldownMs, cooldownMs) : cooldownMs;
      pushRoutingAttempt(routingDiagnostics, {
        accountId,
        model: hint.modelKey || null,
        success: false,
        statusCode: 'cooldown',
        reason: 'model cooldown active',
        cooldownMs,
        skipped: true,
      });
      lastError = new Error(`account ${accountId} model cooldown active`);
      continue;
    }

    let account;
    try {
      const candidate = await getAccountById(accountId);
      const authMode = String(candidate.authMode || candidate.auth_mode || 'oauth').trim().toLowerCase();
      if (authMode === 'apikey' || candidate.openaiApiKey || candidate.openai_api_key || !candidate.tokens?.access_token) {
        pushRoutingAttempt(routingDiagnostics, {
          account: candidate,
          accountId,
          model: hint.modelKey || null,
          success: false,
          statusCode: 'skipped',
          reason: 'account is not usable for Codex local access',
          skipped: true,
        });
        lastError = new Error(`account ${accountId} cannot be used by Codex local access`);
        continue;
      }
      account = await refreshAccountIfNeeded(candidate);
    } catch (err) {
      pushRoutingAttempt(routingDiagnostics, {
        accountId,
        model: hint.modelKey || null,
        success: false,
        statusCode: 'account',
        reason: safeErrorReason(err, 'account refresh failed'),
      });
      lastError = err;
      continue;
    }

    let upstream;
    try {
      upstream = await sendUpstream({ req, body, account, target, streamMode });
    } catch (err) {
      const network = err?.upstreamNetworkDiagnostics || upstreamNetworkDiagnostics(err);
      err.statusCode = 502;
      pushRoutingAttempt(routingDiagnostics, {
        account,
        model: hint.modelKey || null,
        success: false,
        statusCode: 502,
        reason: network.message,
        retryable: true,
      });
      lastError = err;
      continue;
    }

    if (upstream.status === 401) {
      try {
        account = await refreshAccountIfNeeded(account, true);
        upstream = await sendUpstream({ req, body, account, target, streamMode });
      } catch (err) {
        const network = err?.upstreamNetworkDiagnostics || null;
        if (network) err.statusCode = 502;
        pushRoutingAttempt(routingDiagnostics, {
          account,
          model: hint.modelKey || null,
          success: false,
          statusCode: network ? 502 : 401,
          reason: network ? network.message : safeErrorReason(err, 'authorization refresh failed'),
          retryable: true,
        });
        lastError = err;
        continue;
      }
    }

    if (upstream.ok) {
      clearModelCooldown(account.id, hint.modelKey);
      pushRoutingAttempt(routingDiagnostics, {
        account,
        model: hint.modelKey || null,
        success: true,
        statusCode: upstream.status,
      });
      return {
        upstream,
        account,
        accountCount: ids.length,
        routingDiagnostics: finalizeRoutingDiagnostics(routingDiagnostics, upstream, account),
      };
    }

    let bodyText = '';
    if (!streamMode || [400, 403].includes(Number(upstream.status)) || shouldTryNextAccount(upstream.status)) {
      bodyText = await upstream.text().catch(() => '');
      upstream = rebuildTextResponse(upstream, bodyText);
    }

    const retryAfterMs = parseRetryAfterFromBody(upstream.status, bodyText);
    if (retryAfterMs > 0) {
      setModelCooldown(account.id, hint.modelKey, retryAfterMs);
      shortestCooldownMs = shortestCooldownMs ? Math.min(shortestCooldownMs, retryAfterMs) : retryAfterMs;
    }

    const retryable = ids.length > 1 && shouldTryNextAccount(upstream.status, bodyText);
    const reason = classifyUpstreamFailure(upstream.status, bodyText);
    pushRoutingAttempt(routingDiagnostics, {
      account,
      model: hint.modelKey || null,
      success: false,
      statusCode: upstream.status,
      reason,
      retryable,
      cooldownMs: retryAfterMs,
    });

    if (ids.length === 1) {
      return {
        upstream,
        account,
        accountCount: ids.length,
        routingDiagnostics: finalizeRoutingDiagnostics(routingDiagnostics, upstream, account),
      };
    }

    if (!retryable) {
      return {
        upstream,
        account,
        accountCount: ids.length,
        routingDiagnostics: finalizeRoutingDiagnostics(routingDiagnostics, upstream, account),
      };
    }

    lastResponse = upstream;
    lastResponseAccount = account;
    lastError = new Error(reason);
  }

  if (lastResponse) {
    return {
      upstream: lastResponse,
      account: lastResponseAccount,
      accountCount: ids.length,
      routingDiagnostics: finalizeRoutingDiagnostics(routingDiagnostics, lastResponse, lastResponseAccount),
    };
  }
  if (shortestCooldownMs > 0) {
    const upstream = new Response(JSON.stringify({
      error: `All available accounts are cooling down; retry in about ${Math.ceil(shortestCooldownMs / 1000)} seconds`,
    }), {
      status: 429,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
    return {
      upstream,
      account: null,
      accountCount: ids.length,
      routingDiagnostics: finalizeRoutingDiagnostics(routingDiagnostics, upstream, null),
    };
  }
  if (!ids.length) {
    pushRoutingAttempt(routingDiagnostics, {
      success: false,
      statusCode: 'pool_empty',
      reason: 'no API service accounts configured',
      skipped: true,
    });
  }
  const err = lastError || new Error('No usable Codex account is available for API service');
  err.routingDiagnostics = finalizeRoutingDiagnostics(routingDiagnostics, null, null);
  if (lastError?.statusCode) err.statusCode = lastError.statusCode;
  if (lastError?.upstreamNetworkDiagnostics) err.upstreamNetworkDiagnostics = lastError.upstreamNetworkDiagnostics;
  if (err.statusCode && err.routingDiagnostics?.final) err.routingDiagnostics.final.statusCode = err.statusCode;
  throw err;
}

async function proxyCodexRequest(req, res, body) {
  const startedAt = Date.now();
  const incomingBodyBytes = bufferBytes(body);
  const chatMode = isChatCompletionsPath(req.url);
  let chatContext = null;
  let account = null;
  let upstream = null;
  let capture = null;
  let finishLocalAccessRequest = null;
  let routingDiagnostics = null;
  let requestDiagnostics = null;

  try {
    if (chatMode) {
      const chatBody = JSON.parse(body.toString('utf8'));
      chatContext = buildResponsesBodyFromChat(chatBody);
      body = Buffer.from(JSON.stringify(chatContext.responsesBody));
    } else if (body.length) {
      body = rewriteModelAliasInJsonBody(body);
    }

    const target = chatMode ? '/responses' : upstreamPath(req.url);
    if (!target) return jsonResponse(res, 404, { error: 'Not Found' });

    // chat/completions is translated to upstream Responses SSE even when the
    // downstream caller requested a non-stream JSON response. Keep upstream and
    // downstream stream semantics separate.
    const downstreamStreamMode = chatMode ? chatContext.stream : isStreamRequest(req, body);
    const upstreamStreamMode = chatMode ? true : downstreamStreamMode;
    const localAccessConfig = await loadLocalAccessConfig();
    const serviceTierRewrite = applyServiceTierMode(body, localAccessConfig.serviceTierMode);
    body = serviceTierRewrite.body;
    requestDiagnostics = safeRequestDiagnostics(req, body, target, {
      startedAt,
      bodyBytes: incomingBodyBytes,
      upstreamBodyBytes: bufferBytes(body),
    });
    if (serviceTierRewrite.rewrite) Object.assign(requestDiagnostics.body, serviceTierRewrite.rewrite);
    ({ upstream, account, routingDiagnostics } = await sendWithAccountPool({ req, body, target, streamMode: upstreamStreamMode }));
    requestDiagnostics.upstream = {
      statusCode: upstream?.status ?? null,
      ok: Boolean(upstream?.ok),
    };
    requestDiagnostics.routing = routingDiagnostics;
    requestDiagnostics.responseAffinity = routingDiagnostics?.responseAffinity || null;
    finishLocalAccessRequest = beginLocalAccessRequest(account, startedAt, {
      target,
      model: requestRoutingHint(body).modelKey,
      request: requestDiagnostics,
    });

    const contentType = downstreamStreamMode
      ? 'text/event-stream; charset=utf-8'
      : (chatMode && upstream.ok
        ? 'application/json; charset=utf-8'
        : (upstream.headers.get('content-type') || 'application/json; charset=utf-8'));

    res.writeHead(upstream.status, {
      'content-type': contentType,
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': CORS_ALLOW_HEADERS,
      ...(downstreamStreamMode ? { 'cache-control': 'no-cache', connection: 'close' } : {}),
    });

    if (!upstream.body) {
      res.end();
    } else {
      try {
        if (chatMode && upstream.ok && downstreamStreamMode) {
          capture = await writeChatCompletionsStreamFromResponses(upstream, res, chatContext);
        } else if (chatMode && upstream.ok) {
          capture = await writeChatCompletionsResponseFromResponses(upstream, res, chatContext);
        } else {
          const responseCapture = createResponseCapture(upstreamStreamMode);
          for await (const chunk of upstream.body) {
            responseCapture.feed(chunk);
            res.write(chunk);
          }
          capture = responseCapture.finish();
        }
        if (account && capture?.responseId) {
          requestDiagnostics.responseAffinity = {
            ...(requestDiagnostics.responseAffinity || {}),
            bound: bindResponseAffinity(capture.responseId, account),
          };
        }
      } finally {
        res.end();
      }
    }

    await recordLocalAccessStats({
      accountId: account?.id,
      email: account?.email,
      success: Boolean(upstream?.ok),
      latencyMs: Date.now() - startedAt,
      usage: capture?.usage,
      statusCode: upstream?.status ?? null,
      failureReason: upstream?.ok ? null : routingDiagnostics?.final?.reason,
      attempts: routingDiagnostics?.attempts,
    }).catch((err) => console.warn('[stats] record failed:', err?.message || err));
  } catch (err) {
    if (!routingDiagnostics && err?.routingDiagnostics) routingDiagnostics = err.routingDiagnostics;
    await recordLocalAccessStats({
      accountId: account?.id,
      email: account?.email,
      success: false,
      latencyMs: Date.now() - startedAt,
      usage: capture?.usage,
      statusCode: upstream?.status ?? err?.statusCode ?? null,
      failureReason: routingDiagnostics?.final?.reason || safeErrorReason(err, 'gateway request failed'),
      attempts: routingDiagnostics?.attempts,
    }).catch(() => {});
    throw err;
  } finally {
    if (finishLocalAccessRequest) finishLocalAccessRequest(upstream ? Boolean(upstream.ok) : false);
  }
}

async function handleAdmin(req, res, config) {
  const account = await readJson(ACCOUNT_PATH, null);
  const accountList = await listAccounts();
  const localAccessStats = await loadLocalAccessStats();
  return jsonResponse(res, 200, {
    ok: true,
    baseUrl: `http://${config.host}:${config.port}/v1`,
    apiKey: config.apiKey,
    apiKeyMasked: mask(config.apiKey),
    account: account
      ? {
          email: account.email,
          accountId: account.accountId,
          planType: account.planType,
          subscriptionActiveUntil: account.subscriptionActiveUntil,
          importedFrom: account.importedFrom,
          updatedAt: account.updatedAt,
      }
      : null,
    accounts: accountList.accounts,
    currentAccountId: accountList.currentAccountId,
    models: DEFAULT_MODELS,
    codexApp: await getCodexAppState(),
    network: gatewayNetworkState(config),
    localAccess: await loadLocalAccessConfig(),
    localAccessRuntime: getLocalAccessRuntimeState(),
    localAccessCallHistory: getLocalAccessCallHistory(),
    localAccessStats: summarizeLocalAccessStats(localAccessStats),
    wakeupSchedule: await loadWakeupSchedule(),
    quotaAutoRefresh: await loadQuotaRefreshSchedule(),
    tokenKeeper: await getTokenKeeperState(),
  });
}

function handleAdminPage(req, res) {
  const body = Buffer.from(renderAdminHtml());
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
  });
  res.end(body);
}

async function handleRotateKey(req, res, config) {
  const apiKey = await rotateApiKey();
  config.apiKey = apiKey;
  return jsonResponse(res, 200, {
    ok: true,
    apiKey,
    apiKeyMasked: mask(apiKey),
  });
}

async function handleImportCurrent(req, res) {
  const account = await importFromCodexAuth({ respectDeleted: false });
  return jsonResponse(res, 200, {
    ok: true,
    account: { id: account.id, email: account.email, accountId: account.accountId },
  });
}

async function handleImportJson(req, res) {
  const body = await readBody(req);
  const payload = JSON.parse(body.toString('utf8'));
  const result = await importFromJsonContent(
    payload.jsonContent || payload.content || '',
    payload.format || payload.importFormat || 'auto'
  );
  return jsonResponse(res, 200, {
    ok: true,
    importFormat: result.importFormat,
    imported: result.imported,
    currentAccount: result.currentAccount,
    currentAccountId: result.currentAccountId,
  });
}

async function handleConvertAccounts(req, res) {
  const body = await readBody(req);
  const payload = body.length ? JSON.parse(body.toString('utf8')) : {};
  const result = await convertAccountsJsonContent(
    payload.jsonContent || payload.content || '',
    payload.inputFormat || payload.format || 'auto',
    payload.outputFormat || payload.exportFormat || 'gateway'
  );
  return jsonResponse(res, 200, result);
}

async function handleExportAccounts(req, res) {
  const body = await readBody(req);
  const payload = body.length ? JSON.parse(body.toString('utf8')) : {};
  const result = await exportAccountsFormatted(
    payload.accountIds || payload.ids || [],
    payload.format || payload.exportFormat || 'gateway'
  );
  return jsonResponse(res, 200, {
    ...result,
  });
}

async function handleCodexOAuthStart(req, res) {
  return jsonResponse(res, 200, {
    ok: true,
    ...(await startCodexOAuthLogin()),
  });
}

async function handleCodexOAuthStatus(req, res, u) {
  const loginId = u.searchParams.get('loginId') || '';
  return jsonResponse(res, 200, {
    ok: true,
    ...(await getCodexOAuthStatus(loginId)),
  });
}

async function handleCodexOAuthCallbackUrl(req, res) {
  const body = await readBody(req);
  const payload = body.length ? JSON.parse(body.toString('utf8')) : {};
  if (!payload.loginId) return jsonResponse(res, 400, { error: 'missing loginId' });
  if (!payload.callbackUrl) return jsonResponse(res, 400, { error: 'missing callbackUrl' });
  return jsonResponse(res, 200, await submitCodexOAuthCallbackUrl(payload.loginId, payload.callbackUrl));
}

async function handleCodexOAuthComplete(req, res) {
  const body = await readBody(req);
  const payload = body.length ? JSON.parse(body.toString('utf8')) : {};
  if (!payload.loginId) return jsonResponse(res, 400, { error: 'missing loginId' });
  const tokens = await completeCodexOAuthLogin(payload.loginId);
  const account = await importFromOAuthTokens(tokens, { importedFrom: 'oauth' });
  return jsonResponse(res, 200, {
    ok: true,
    account: {
      id: account.id,
      email: account.email,
      accountId: account.accountId,
      planType: account.planType,
      subscriptionActiveUntil: account.subscriptionActiveUntil,
    },
  });
}

async function handleCodexOAuthCancel(req, res) {
  const body = await readBody(req);
  const payload = body.length ? JSON.parse(body.toString('utf8')) : {};
  return jsonResponse(res, 200, await cancelCodexOAuthLogin(payload.loginId || null));
}

async function handleUseAccount(req, res) {
  const body = await readBody(req);
  const payload = JSON.parse(body.toString('utf8'));
  const account = await setCurrentAccount(payload.accountId);
  return jsonResponse(res, 200, {
    ok: true,
    account: { id: account.id, email: account.email, accountId: account.accountId },
  });
}

async function handleDeleteAccount(req, res, u) {
  const accountId = u.searchParams.get('accountId');
  if (!accountId) return jsonResponse(res, 400, { error: 'missing accountId' });
  const result = await deleteAccount(accountId);
  const localAccess = await loadLocalAccessConfig();
  const nextAccountIds = (localAccess.accountIds || []).filter((id) => id !== accountId);
  let localAccessUpdated = false;
  if (nextAccountIds.length !== (localAccess.accountIds || []).length) {
    await saveLocalAccessConfig({
      ...localAccess,
      accountIds: nextAccountIds,
      customRoutingRules: (localAccess.customRoutingRules || []).filter((rule) => rule.accountId !== accountId),
    });
    localAccessUpdated = true;
  }
  return jsonResponse(res, 200, { ok: true, ...result, localAccessUpdated });
}

async function handleWakeup(req, res) {
  const body = await readBody(req);
  const payload = body.length ? JSON.parse(body.toString('utf8')) : {};
  return jsonResponse(res, 200, await runWakeup(payload));
}

async function handleWakeupHistory(req, res) {
  return jsonResponse(res, 200, {
    ok: true,
    history: await loadWakeupHistory(),
  });
}


async function handleWakeupSchedule(req, res) {
  if (req.method === 'GET') return jsonResponse(res, 200, await loadWakeupSchedule());
  const body = await readBody(req);
  const payload = body.length ? JSON.parse(body.toString('utf8')) : {};
  return jsonResponse(res, 200, await saveWakeupSchedule(payload));
}

async function handleWakeupScheduleRunNow(req, res) {
  return jsonResponse(res, 200, await runWakeupScheduleNow());
}

async function handleRefreshQuota(req, res) {
  const body = await readBody(req);
  const payload = body.length ? JSON.parse(body.toString('utf8')) : {};
  if (!payload.accountId) return jsonResponse(res, 400, { error: 'missing accountId' });
  return jsonResponse(res, 200, await refreshAccountQuota(payload.accountId));
}

async function handleRefreshQuotas(req, res) {
  const body = await readBody(req);
  const payload = body.length ? JSON.parse(body.toString('utf8')) : {};
  return jsonResponse(res, 200, await refreshAccountQuotas(payload.accountIds || []));
}


async function handleQuotaAutoRefresh(req, res) {
  if (req.method === 'GET') return jsonResponse(res, 200, await loadQuotaRefreshSchedule());
  const body = await readBody(req);
  const payload = body.length ? JSON.parse(body.toString('utf8')) : {};
  return jsonResponse(res, 200, await saveQuotaRefreshSchedule(payload));
}

async function handleQuotaAutoRefreshRunNow(req, res) {
  return jsonResponse(res, 200, await runQuotaRefreshNow());
}

async function handleTokenKeeperState(req, res) {
  return jsonResponse(res, 200, await getTokenKeeperState());
}

async function handleTokenKeeperRunNow(req, res) {
  const body = await readBody(req);
  const payload = body.length ? JSON.parse(body.toString('utf8')) : {};
  return jsonResponse(res, 200, await runTokenKeeperNow({ force: payload.force === true }));
}

async function handleLocalAccessStats(req, res, u) {
  const stats = await loadLocalAccessStats();
  if (u.searchParams.get('full') === '1') return jsonResponse(res, 200, stats);
  return jsonResponse(res, 200, summarizeLocalAccessStats(stats));
}

async function handleClearLocalAccessStats(req, res) {
  return jsonResponse(res, 200, { ok: true, stats: summarizeLocalAccessStats(await clearLocalAccessStats()) });
}

async function handleClearLocalAccessAccountFailure(req, res) {
  const body = await readBody(req);
  const payload = body.length ? JSON.parse(body.toString('utf8')) : {};
  if (!payload.accountId) return jsonResponse(res, 400, { error: 'missing accountId' });
  return jsonResponse(res, 200, { ok: true, stats: summarizeLocalAccessStats(await clearLocalAccessAccountFailure(payload.accountId)) });
}

async function handleLocalAccessRuntime(req, res) {
  return jsonResponse(res, 200, getLocalAccessRuntimeState());
}

function extractHealthOutputPreview(value) {
  const candidates = [
    value?.output_text,
    value?.output?.[0]?.content?.[0]?.text,
    value?.output?.[0]?.content?.[0]?.value,
    value?.response?.output_text,
    value?.choices?.[0]?.message?.content,
  ];
  const text = candidates.find((item) => typeof item === 'string' && item.trim());
  return text ? text.trim().slice(0, 80) : null;
}

async function handleLocalAccessHealth(req, res) {
  const body = await readBody(req);
  const payload = body.length ? JSON.parse(body.toString('utf8')) : {};
  const model = String(payload.model || 'gpt-5.5').trim() || 'gpt-5.5';
  const startedAt = Date.now();
  const fakeReq = {
    method: 'POST',
    url: '/v1/responses',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-codex-beta-features': 'responses',
    },
  };
  let requestBody = Buffer.from(JSON.stringify({
    model,
    input: 'Reply with exactly: OK',
    stream: false,
  }));
  const localAccessConfig = await loadLocalAccessConfig();
  const serviceTierRewrite = applyServiceTierMode(requestBody, localAccessConfig.serviceTierMode);
  requestBody = serviceTierRewrite.body;
  let routingDiagnostics = null;
  try {
    const { upstream, account, routingDiagnostics: routing } = await sendWithAccountPool({
      req: fakeReq,
      body: requestBody,
      target: '/responses',
      streamMode: false,
    });
    routingDiagnostics = routing;
    const text = await upstream.text().catch(() => '');
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch {}
    const ok = Boolean(upstream.ok);
    return jsonResponse(res, 200, {
      ok,
      stage: ok ? 'upstream_response' : 'upstream_status',
      model,
      latencyMs: Date.now() - startedAt,
      statusCode: upstream.status,
      account: runtimeAccountSummary(account),
      outputPreview: parsed ? extractHealthOutputPreview(parsed) : null,
      responseBytes: Buffer.byteLength(text || '', 'utf8'),
      diagnostics: {
        routing: routingDiagnostics,
        serviceTier: serviceTierRewrite.rewrite || null,
      },
      error: ok ? null : classifyUpstreamFailure(upstream.status, text),
    });
  } catch (err) {
    if (!routingDiagnostics && err?.routingDiagnostics) routingDiagnostics = err.routingDiagnostics;
    const network = err?.upstreamNetworkDiagnostics || null;
    return jsonResponse(res, 200, {
      ok: false,
      stage: network ? 'network' : 'gateway',
      model,
      latencyMs: Date.now() - startedAt,
      statusCode: err?.statusCode || null,
      error: network?.message || safeErrorReason(err, 'health check failed'),
      diagnostics: {
        routing: routingDiagnostics,
        network,
      },
    });
  }
}

async function handleLocalAccess(req, res) {
  if (req.method === 'GET') return jsonResponse(res, 200, await loadLocalAccessConfig());
  const body = await readBody(req);
  const payload = body.length ? JSON.parse(body.toString('utf8')) : {};
  return jsonResponse(res, 200, await saveLocalAccessConfig(payload));
}

async function finishCodexAppMutation(result, payload) {
  const shouldRepairSessions = payload.repairSessions !== false;
  const shouldRestartCodexApp = payload.restartCodexApp !== false;
  const rewriteRollouts = payload.rewriteRollouts !== false;

  if (shouldRepairSessions && !shouldRestartCodexApp) {
    try {
      result.sessionVisibilityRepair = await repairSessionVisibility({ rewriteRollouts });
    } catch (err) {
      result.sessionVisibilityRepair = {
        ok: false,
        error: String(err?.message || err),
      };
    }
  }

  if (shouldRestartCodexApp) {
    if (shouldRepairSessions) {
      try {
        result.sessionVisibilityRepairImmediate = await repairSessionVisibility({ rewriteRollouts });
      } catch (err) {
        result.sessionVisibilityRepairImmediate = {
          ok: false,
          error: String(err?.message || err),
        };
      }
    }
    const restartOptions = {
      delayMs: Number(payload.restartDelayMs || 900),
      closeTimeoutMs: Number(payload.closeTimeoutMs || 20000),
      startTimeoutMs: Number(payload.startTimeoutMs || 15000),
    };
    if (shouldRepairSessions) {
      result.sessionVisibilityRepair = {
        ok: true,
        scheduledAfterClose: true,
        message: 'session visibility repair will run after Codex App is closed, before restart',
      };
      result.codexAppRestart = scheduleCodexAppRestartWithTask(restartOptions, () => repairSessionVisibility({ rewriteRollouts }));
    } else {
      result.codexAppRestart = scheduleCodexAppRestart(restartOptions);
    }
  }

  return result;
}

async function handleCodexAppState(req, res) {
  return jsonResponse(res, 200, await getCodexAppState());
}

async function handleCodexAppSwitch(req, res, config) {
  const body = await readBody(req);
  const payload = body.length ? JSON.parse(body.toString('utf8')) : {};
  if (!payload.accountId) return jsonResponse(res, 400, { error: 'missing accountId' });
  const result = await switchCodexAppAccount(payload.accountId, {
    makeGatewayCurrent: payload.makeGatewayCurrent !== false,
    backup: payload.backup !== false,
    apiServiceBaseUrl: `http://${config.host}:${config.port}/v1`,
  });
  await finishCodexAppMutation(result, payload);
  return jsonResponse(res, 200, result);
}

async function handleCodexAppApiService(req, res, config) {
  const body = await readBody(req);
  const payload = body.length ? JSON.parse(body.toString('utf8')) : {};
  const accountIds = Array.isArray(payload.accountIds) ? payload.accountIds : [];
  const currentLocalAccess = await loadLocalAccessConfig();
  const localAccess = await saveLocalAccessConfig({
    enabled: true,
    accountIds,
    restrictFreeAccounts: payload.restrictFreeAccounts ?? currentLocalAccess.restrictFreeAccounts ?? true,
    allowSessionOnlyAccounts: payload.allowSessionOnlyAccounts ?? currentLocalAccess.allowSessionOnlyAccounts ?? true,
    routingStrategy: payload.routingStrategy ?? currentLocalAccess.routingStrategy,
    customRoutingRules: payload.customRoutingRules ?? currentLocalAccess.customRoutingRules,
  });
  const baseUrl = `http://${config.host}:${config.port}/v1`;
  const result = await activateCodexApiService({
    apiKey: config.apiKey,
    baseUrl,
    backup: payload.backup !== false,
  });
  result.localAccess = localAccess;
  await finishCodexAppMutation(result, payload);
  return jsonResponse(res, 200, result);
}

function normalizeRemoteGatewayBaseUrl(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) throw new Error('missing remote API base URL');
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('remote API base URL must start with http:// or https://');
  if (url.pathname === '' || url.pathname === '/') url.pathname = '/v1';
  if (!url.pathname.endsWith('/v1')) {
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/v1`;
  }
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/, '');
}

async function testRemoteGatewayApi({ baseUrl, apiKey }) {
  const normalizedBaseUrl = normalizeRemoteGatewayBaseUrl(baseUrl);
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('missing remote Gateway API Key');
  const startedAt = Date.now();
  const response = await fetch(`${normalizedBaseUrl}/models`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${key}`,
      accept: 'application/json',
    },
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch {}
  return {
    ok: response.ok,
    baseUrl: normalizedBaseUrl,
    statusCode: response.status,
    latencyMs: Date.now() - startedAt,
    modelCount: Array.isArray(parsed?.data) ? parsed.data.length : (Array.isArray(parsed?.models) ? parsed.models.length : null),
    error: response.ok ? null : String(parsed?.error || parsed?.message || text || response.statusText || 'remote Gateway request failed').slice(0, 240),
  };
}

async function handleRemoteGatewayTest(req, res) {
  const body = await readBody(req);
  const payload = body.length ? JSON.parse(body.toString('utf8')) : {};
  return jsonResponse(res, 200, await testRemoteGatewayApi({
    baseUrl: payload.baseUrl,
    apiKey: payload.apiKey,
  }));
}

async function handleCodexAppRemoteApiService(req, res) {
  const body = await readBody(req);
  const payload = body.length ? JSON.parse(body.toString('utf8')) : {};
  const test = await testRemoteGatewayApi({
    baseUrl: payload.baseUrl,
    apiKey: payload.apiKey,
  });
  if (!test.ok) return jsonResponse(res, 400, test);
  const result = await activateCodexApiService({
    apiKey: String(payload.apiKey || '').trim(),
    baseUrl: test.baseUrl,
    backup: payload.backup !== false,
  });
  result.remoteGateway = {
    baseUrl: test.baseUrl,
    statusCode: test.statusCode,
    latencyMs: test.latencyMs,
    modelCount: test.modelCount,
  };
  await finishCodexAppMutation(result, payload);
  return jsonResponse(res, 200, result);
}

async function handleCodexQuickConfig(req, res) {
  const body = await readBody(req);
  const payload = body.length ? JSON.parse(body.toString('utf8')) : {};
  return jsonResponse(res, 200, {
    ok: true,
    quickConfig: await saveCodexQuickConfig(payload),
  });
}

async function handleCodexRepairSessions(req, res) {
  const body = await readBody(req);
  const payload = body.length ? JSON.parse(body.toString('utf8')) : {};
  return jsonResponse(res, 200, await repairSessionVisibility({
    rewriteRollouts: payload.rewriteRollouts !== false,
  }));
}

async function handleSessionList(req, res, u) {
  const archivedOnly = u.searchParams.get('archived') !== '0';
  return jsonResponse(res, 200, await listCodexSessions({ archivedOnly }));
}

async function handleSessionDelete(req, res) {
  const body = await readBody(req);
  const payload = body.length ? JSON.parse(body.toString('utf8')) : {};
  const result = await deleteCodexSessions({ sessionIds: payload.sessionIds || payload.session_ids || [] });
  return jsonResponse(res, result.ok ? 200 : 400, result);
}

async function handleSessionRepairVisibility(req, res) {
  const body = await readBody(req);
  const payload = body.length ? JSON.parse(body.toString('utf8')) : {};
  const result = await repairCodexSessionVisibility({
    sessionIds: payload.sessionIds || payload.session_ids || [],
    targetProvider: payload.targetProvider || payload.target_provider || null,
  });
  return jsonResponse(res, result.ok ? 200 : 400, result);
}

async function handleProcessCleanupList(req, res) {
  return jsonResponse(res, 200, await listNodeProcessCleanupCandidates());
}

async function handleProcessCleanupKill(req, res) {
  const body = await readBody(req);
  const payload = body.length ? JSON.parse(body.toString('utf8')) : {};
  const result = await killNodeProcessCleanupCandidates({
    pids: payload.pids || payload.processIds || [],
    confirmed: payload.confirmed === true,
  });
  return jsonResponse(res, result.ok ? 200 : 400, result);
}

function handleShutdown(req, res) {
  jsonResponse(res, 200, { ok: true, message: 'Codex API Gateway 正在停止' });
  setTimeout(() => process.exit(0), 250);
}

function handlePublicHelp(req, res, config) {
  return jsonResponse(res, 200, {
    ok: true,
    name: 'Codex API Gateway',
    message: '服务正在运行。API 请求需要 Authorization: Bearer <apiKey>。',
    baseUrl: `http://${config.host}:${config.port}/v1`,
    admin: `http://${config.host}:${config.port}/_admin`,
    endpoints: {
      models: 'GET /v1/models',
      chatCompletions: 'POST /v1/chat/completions',
      imageGenerations: 'POST /v1/images/generations',
      imageEdits: 'POST /v1/images/edits',
    },
    imageNote: 'Image endpoints use the official OpenAI API and require OPENAI_API_KEY or CODEX_GATEWAY_OPENAI_API_KEY in the Gateway process environment.',
    note: '浏览器直接打开 /v1 不会携带 API Key；请在客户端请求头中设置 Authorization。',
  });
}

export function createServer(config) {
  return http.createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') return optionsResponse(res);
      const u = new URL(req.url, `http://${config.host}:${config.port}`);
      if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/v1')) {
        return handlePublicHelp(req, res, config);
      }
      if (req.method === 'GET' && u.pathname === '/_admin') return handleAdminPage(req, res);
      if (req.method === 'GET' && u.pathname === '/_admin/state') return await handleAdmin(req, res, config);
      if (req.method === 'POST' && u.pathname === '/_admin/rotate-key') return await handleRotateKey(req, res, config);
      if (req.method === 'POST' && u.pathname === '/_admin/import-current') return await handleImportCurrent(req, res);
      if (req.method === 'POST' && u.pathname === '/_admin/import-json') return await handleImportJson(req, res);
      if (req.method === 'POST' && u.pathname === '/_admin/convert-accounts') return await handleConvertAccounts(req, res);
      if (req.method === 'POST' && u.pathname === '/_admin/export-accounts') return await handleExportAccounts(req, res);
      if (req.method === 'POST' && u.pathname === '/_admin/codex/oauth/start') return await handleCodexOAuthStart(req, res);
      if (req.method === 'GET' && u.pathname === '/_admin/codex/oauth/status') return await handleCodexOAuthStatus(req, res, u);
      if (req.method === 'POST' && u.pathname === '/_admin/codex/oauth/callback-url') return await handleCodexOAuthCallbackUrl(req, res);
      if (req.method === 'POST' && u.pathname === '/_admin/codex/oauth/complete') return await handleCodexOAuthComplete(req, res);
      if (req.method === 'POST' && u.pathname === '/_admin/codex/oauth/cancel') return await handleCodexOAuthCancel(req, res);
      if (req.method === 'POST' && u.pathname === '/_admin/use-account') return await handleUseAccount(req, res);
      if (req.method === 'DELETE' && u.pathname === '/_admin/account') return await handleDeleteAccount(req, res, u);
      if (req.method === 'POST' && u.pathname === '/_admin/wakeup') return await handleWakeup(req, res);
      if (req.method === 'GET' && u.pathname === '/_admin/wakeup/history') return await handleWakeupHistory(req, res);
      if ((req.method === 'GET' || req.method === 'POST') && u.pathname === '/_admin/wakeup/schedule') return await handleWakeupSchedule(req, res);
      if (req.method === 'POST' && u.pathname === '/_admin/wakeup/schedule/run-now') return await handleWakeupScheduleRunNow(req, res);
      if (req.method === 'POST' && u.pathname === '/_admin/refresh-quota') return await handleRefreshQuota(req, res);
      if (req.method === 'POST' && u.pathname === '/_admin/refresh-quotas') return await handleRefreshQuotas(req, res);
      if ((req.method === 'GET' || req.method === 'POST') && u.pathname === '/_admin/quota-auto-refresh') return await handleQuotaAutoRefresh(req, res);
      if (req.method === 'POST' && u.pathname === '/_admin/quota-auto-refresh/run-now') return await handleQuotaAutoRefreshRunNow(req, res);
      if (req.method === 'GET' && u.pathname === '/_admin/token-keeper') return await handleTokenKeeperState(req, res);
      if (req.method === 'POST' && u.pathname === '/_admin/token-keeper/run-now') return await handleTokenKeeperRunNow(req, res);
      if ((req.method === 'GET' || req.method === 'POST') && u.pathname === '/_admin/local-access') return await handleLocalAccess(req, res);
      if (req.method === 'GET' && u.pathname === '/_admin/local-access/runtime') return await handleLocalAccessRuntime(req, res);
      if (req.method === 'POST' && u.pathname === '/_admin/local-access/health') return await handleLocalAccessHealth(req, res);
      if (req.method === 'GET' && u.pathname === '/_admin/local-access/stats') return await handleLocalAccessStats(req, res, u);
      if (req.method === 'POST' && u.pathname === '/_admin/local-access/stats/clear') return await handleClearLocalAccessStats(req, res);
      if (req.method === 'POST' && u.pathname === '/_admin/local-access/stats/clear-account-failure') return await handleClearLocalAccessAccountFailure(req, res);
      if (req.method === 'GET' && u.pathname === '/_admin/codex-app/state') return await handleCodexAppState(req, res);
      if (req.method === 'POST' && u.pathname === '/_admin/codex-app/switch') return await handleCodexAppSwitch(req, res, config);
      if (req.method === 'POST' && u.pathname === '/_admin/codex-app/api-service') return await handleCodexAppApiService(req, res, config);
      if (req.method === 'POST' && u.pathname === '/_admin/codex-app/remote-api-service/test') return await handleRemoteGatewayTest(req, res);
      if (req.method === 'POST' && u.pathname === '/_admin/codex-app/remote-api-service') return await handleCodexAppRemoteApiService(req, res);
      if (req.method === 'POST' && u.pathname === '/_admin/codex-app/repair-sessions') return await handleCodexRepairSessions(req, res);
      if (req.method === 'POST' && u.pathname === '/_admin/codex-app/quick-config') return await handleCodexQuickConfig(req, res);
      if (req.method === 'GET' && u.pathname === '/_admin/sessions') return await handleSessionList(req, res, u);
      if (req.method === 'POST' && u.pathname === '/_admin/sessions/delete') return await handleSessionDelete(req, res);
      if (req.method === 'POST' && u.pathname === '/_admin/sessions/repair-visibility') return await handleSessionRepairVisibility(req, res);
      if (req.method === 'GET' && u.pathname === '/_admin/process-cleanup') return await handleProcessCleanupList(req, res);
      if (req.method === 'POST' && u.pathname === '/_admin/process-cleanup/kill') return await handleProcessCleanupKill(req, res);
      if (req.method === 'POST' && u.pathname === '/_admin/shutdown') return handleShutdown(req, res);

      const key = getLocalApiKey(req);
      if (key !== config.apiKey) return jsonResponse(res, 401, { error: 'Invalid or missing API key' });

      if (req.method === 'GET' && (u.pathname === '/v1/models' || u.pathname.startsWith('/v1/models/'))) {
        return jsonResponse(res, 200, localModels(req.url));
      }

      if (!['GET', 'POST'].includes(req.method)) return jsonResponse(res, 405, { error: 'Only GET and POST are allowed' });
      if (!u.pathname.startsWith('/v1/')) return jsonResponse(res, 404, { error: 'Not Found' });

      const body = await readBody(req);
      if (isOpenAiImagesPath(req.url)) return await proxyOpenAiImageRequest(req, res, body);
      return await proxyCodexRequest(req, res, body);
    } catch (err) {
      console.error('[gateway] request failed:', err);
      const status = Number(err?.statusCode || err?.status || 500);
      const diagnostics = err?.upstreamNetworkDiagnostics || null;
      if (!res.headersSent) return jsonResponse(res, Number.isFinite(status) ? status : 500, {
        error: diagnostics?.message || String(err?.message || err),
        ...(diagnostics ? { diagnostics } : {}),
      });
      res.end();
    }
  });
}
