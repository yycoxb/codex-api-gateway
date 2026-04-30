import http from 'node:http';
import { ACCOUNT_PATH, CORS_ALLOW_HEADERS, DEFAULT_CODEX_ORIGINATOR, DEFAULT_CODEX_USER_AGENT, DEFAULT_MODELS, UPSTREAM_BASE } from './constants.js';
import {
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
import { dataPayloadFromSseFrame, splitSseFrames } from './sse.js';
import { renderAdminHtml } from './admin-ui.js';
import { loadWakeupHistory, loadWakeupSchedule, runWakeup, runWakeupScheduleNow, saveWakeupSchedule } from './wakeup.js';
import { loadQuotaRefreshSchedule, refreshAccountQuota, refreshAccountQuotas, runQuotaRefreshNow, saveQuotaRefreshSchedule } from './quota.js';
import { getCodexAppState, saveCodexQuickConfig, switchCodexAppAccount, activateCodexApiService } from './codex-app.js';
import { scheduleCodexAppRestart, scheduleCodexAppRestartWithTask } from './codex-process.js';
import { getProxyAccountIdsForRequest, loadLocalAccessConfig, saveLocalAccessConfig } from './local-access.js';
import { clearLocalAccessStats, extractUsageCapture, loadLocalAccessStats, recordLocalAccessStats } from './local-access-stats.js';
import { repairSessionVisibility } from './session-visibility.js';
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

const responseAffinity = new Map();
const modelCooldowns = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function bindResponseAffinity(responseId, accountId) {
  const rid = String(responseId || '').trim();
  const aid = String(accountId || '').trim();
  if (!rid || !aid) return;
  pruneRuntimeRoutingState();
  responseAffinity.set(rid, { accountId: aid, updatedAt: Date.now() });
}

function resolveAffinityAccount(previousResponseId) {
  const rid = String(previousResponseId || '').trim();
  if (!rid) return null;
  pruneRuntimeRoutingState();
  return responseAffinity.get(rid)?.accountId || null;
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
      const data = dataPayloadFromSseFrame(frame);
      if (!data || data === '[DONE]') return;
      try {
        const value = JSON.parse(data);
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
  throw lastError || new Error('fetch failed');
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
  const affinityAccountId = resolveAffinityAccount(hint.previousResponseId);
  const ids = pinPreferredAccount(await getProxyAccountIdsForRequest(), affinityAccountId);
  let lastResponse = null;
  let lastError = null;
  let shortestCooldownMs = 0;

  for (const accountId of ids) {
    const cooldownMs = getModelCooldownWait(accountId, hint.modelKey);
    if (cooldownMs > 0) {
      shortestCooldownMs = shortestCooldownMs ? Math.min(shortestCooldownMs, cooldownMs) : cooldownMs;
      lastError = new Error(`账号 ${accountId} 的模型 ${hint.modelKey || '<unknown>'} 仍在冷却，剩余约 ${Math.ceil(cooldownMs / 1000)} 秒`);
      continue;
    }

    let account;
    try {
      const candidate = await getAccountById(accountId);
      const authMode = String(candidate.authMode || candidate.auth_mode || 'oauth').trim().toLowerCase();
      if (authMode === 'apikey' || candidate.openaiApiKey || candidate.openai_api_key || !candidate.tokens?.access_token) {
        lastError = new Error(`account ${accountId} cannot be used by Codex local access`);
        continue;
      }
      account = await refreshAccountIfNeeded(candidate);
    } catch (err) {
      lastError = err;
      continue;
    }

    let upstream = await sendUpstream({ req, body, account, target, streamMode });

    if (upstream.status === 401) {
      try {
        account = await refreshAccountIfNeeded(account, true);
        upstream = await sendUpstream({ req, body, account, target, streamMode });
      } catch (err) {
        lastError = err;
        continue;
      }
    }

    if (upstream.ok) {
      clearModelCooldown(account.id, hint.modelKey);
      return { upstream, account, accountCount: ids.length };
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

    if (ids.length === 1) return { upstream, account, accountCount: ids.length };

    if (!shouldTryNextAccount(upstream.status, bodyText)) {
      return { upstream, account, accountCount: ids.length };
    }

    lastResponse = upstream;
    lastError = new Error(`?? ${account.email || account.id} ???? ${upstream.status}`);
  }

  if (lastResponse) return { upstream: lastResponse, account: null, accountCount: ids.length };
  if (shortestCooldownMs > 0) {
    return {
      upstream: new Response(JSON.stringify({
        error: `所有可用账号暂时冷却中，最短约 ${Math.ceil(shortestCooldownMs / 1000)} 秒后可重试`,
      }), {
        status: 429,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      }),
      account: null,
      accountCount: ids.length,
    };
  }
  throw lastError || new Error('???? Codex ???????????? API ????');
}

async function proxyCodexRequest(req, res, body) {
  const startedAt = Date.now();
  const chatMode = isChatCompletionsPath(req.url);
  let chatContext = null;
  let account = null;
  let upstream = null;
  let capture = null;

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
    ({ upstream, account } = await sendWithAccountPool({ req, body, target, streamMode: upstreamStreamMode }));

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
        if (account && capture?.responseId) bindResponseAffinity(capture.responseId, account.id);
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
    }).catch((err) => console.warn('[stats] record failed:', err?.message || err));
  } catch (err) {
    await recordLocalAccessStats({
      accountId: account?.id,
      email: account?.email,
      success: false,
      latencyMs: Date.now() - startedAt,
      usage: capture?.usage,
    }).catch(() => {});
    throw err;
  }
}

async function handleAdmin(req, res, config) {
  const account = await readJson(ACCOUNT_PATH, null);
  const accountList = await listAccounts();
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
    localAccess: await loadLocalAccessConfig(),
    localAccessStats: await loadLocalAccessStats(),
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
  const account = await importFromCodexAuth();
  return jsonResponse(res, 200, {
    ok: true,
    account: { id: account.id, email: account.email, accountId: account.accountId },
  });
}

async function handleImportJson(req, res) {
  const body = await readBody(req);
  const payload = JSON.parse(body.toString('utf8'));
  const result = await importFromJsonContent(payload.jsonContent || payload.content || '');
  return jsonResponse(res, 200, {
    ok: true,
    imported: result.imported,
    currentAccount: result.currentAccount,
    currentAccountId: result.currentAccountId,
  });
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
  return jsonResponse(res, 200, { ok: true, ...(await deleteAccount(accountId)) });
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

async function handleLocalAccessStats(req, res) {
  return jsonResponse(res, 200, await loadLocalAccessStats());
}

async function handleClearLocalAccessStats(req, res) {
  return jsonResponse(res, 200, { ok: true, stats: await clearLocalAccessStats() });
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

async function handleCodexAppSwitch(req, res) {
  const body = await readBody(req);
  const payload = body.length ? JSON.parse(body.toString('utf8')) : {};
  if (!payload.accountId) return jsonResponse(res, 400, { error: 'missing accountId' });
  const result = await switchCodexAppAccount(payload.accountId, {
    makeGatewayCurrent: payload.makeGatewayCurrent !== false,
    backup: payload.backup !== false,
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
    routingStrategy: payload.routingStrategy ?? currentLocalAccess.routingStrategy,
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
    },
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
      if (req.method === 'GET' && u.pathname === '/_admin/local-access/stats') return await handleLocalAccessStats(req, res);
      if (req.method === 'POST' && u.pathname === '/_admin/local-access/stats/clear') return await handleClearLocalAccessStats(req, res);
      if (req.method === 'GET' && u.pathname === '/_admin/codex-app/state') return await handleCodexAppState(req, res);
      if (req.method === 'POST' && u.pathname === '/_admin/codex-app/switch') return await handleCodexAppSwitch(req, res);
      if (req.method === 'POST' && u.pathname === '/_admin/codex-app/api-service') return await handleCodexAppApiService(req, res, config);
      if (req.method === 'POST' && u.pathname === '/_admin/codex-app/repair-sessions') return await handleCodexRepairSessions(req, res);
      if (req.method === 'POST' && u.pathname === '/_admin/codex-app/quick-config') return await handleCodexQuickConfig(req, res);
      if (req.method === 'POST' && u.pathname === '/_admin/shutdown') return handleShutdown(req, res);

      const key = getLocalApiKey(req);
      if (key !== config.apiKey) return jsonResponse(res, 401, { error: 'Invalid or missing API key' });

      if (req.method === 'GET' && (u.pathname === '/v1/models' || u.pathname.startsWith('/v1/models/'))) {
        return jsonResponse(res, 200, localModels());
      }

      if (!['GET', 'POST'].includes(req.method)) return jsonResponse(res, 405, { error: 'Only GET and POST are allowed' });
      if (!u.pathname.startsWith('/v1/')) return jsonResponse(res, 404, { error: 'Not Found' });

      const body = await readBody(req);
      return await proxyCodexRequest(req, res, body);
    } catch (err) {
      console.error('[gateway] request failed:', err);
      if (!res.headersSent) return jsonResponse(res, 500, { error: String(err?.message || err) });
      res.end();
    }
  });
}
