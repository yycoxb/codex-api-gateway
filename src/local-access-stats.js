import { LOCAL_ACCESS_STATS_PATH } from './constants.js';
import { cleanupJsonTempFiles, readJson, writeJson } from './storage.js';
import { nowMs } from './utils.js';

const DAY_WINDOW_MS = 24 * 60 * 60 * 1000;
const WEEK_WINDOW_MS = 7 * DAY_WINDOW_MS;
const MONTH_WINDOW_MS = 30 * DAY_WINDOW_MS;
const MAX_RECENT_USAGE_EVENTS = 50_000;
const STATS_TMP_MAX_AGE_MS = 10 * 60 * 1000;
const STATS_TMP_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

let statsWriteQueue = Promise.resolve();
let lastStatsTmpCleanupAt = 0;
let statsTmpCleanupPromise = null;

async function cleanupStaleStatsTemps(now = nowMs()) {
  if (statsTmpCleanupPromise) return statsTmpCleanupPromise;
  if (now - lastStatsTmpCleanupAt < STATS_TMP_CLEANUP_INTERVAL_MS) return null;
  lastStatsTmpCleanupAt = now;
  statsTmpCleanupPromise = cleanupJsonTempFiles(LOCAL_ACCESS_STATS_PATH, {
    maxAgeMs: STATS_TMP_MAX_AGE_MS,
  }).catch(() => null).finally(() => {
    statsTmpCleanupPromise = null;
  });
  return statsTmpCleanupPromise;
}

function enqueueStatsWrite(task) {
  const next = statsWriteQueue.then(task, task);
  statsWriteQueue = next.catch(() => {});
  return next;
}

function emptyUsageStats() {
  return {
    requestCount: 0,
    successCount: 0,
    failureCount: 0,
    totalLatencyMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cachedTokens: 0,
    reasoningTokens: 0,
    statusCodes: {},
  };
}

function emptyStatsWindow(since, updatedAt) {
  return {
    since,
    updatedAt,
    totals: emptyUsageStats(),
    accounts: [],
  };
}

function emptyStatsSnapshot(now = nowMs()) {
  return {
    since: now,
    updatedAt: now,
    totals: emptyUsageStats(),
    accounts: [],
    daily: emptyStatsWindow(now - DAY_WINDOW_MS, now),
    weekly: emptyStatsWindow(now - WEEK_WINDOW_MS, now),
    monthly: emptyStatsWindow(now - MONTH_WINDOW_MS, now),
    events: [],
  };
}

function positiveInteger(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.round(number);
}

function normalizeStatusCode(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) return String(Math.round(number));
  const text = String(value || '').trim().toLowerCase();
  if (!text) return null;
  return text.replace(/[^a-z0-9_-]/g, '_').slice(0, 40) || null;
}

function normalizeStatusCodes(value) {
  const output = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return output;
  for (const [key, count] of Object.entries(value)) {
    const status = normalizeStatusCode(key);
    const amount = positiveInteger(count);
    if (status && amount) output[status] = amount;
  }
  return output;
}

function incrementStatusCode(target, statusCode) {
  const status = normalizeStatusCode(statusCode);
  if (!status) return;
  target.statusCodes = normalizeStatusCodes(target.statusCodes);
  target.statusCodes[status] = positiveInteger(target.statusCodes[status]) + 1;
}

function sanitizeFailureReason(value) {
  const text = String(value || '').trim()
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/ig, 'Bearer [redacted]')
    .replace(/sk-[A-Za-z0-9_-]{8,}/ig, 'sk-[redacted]')
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, '[jwt-redacted]');
  return text.slice(0, 160);
}

function normalizeFailure(value) {
  if (!value || typeof value !== 'object') return null;
  const reason = sanitizeFailureReason(value.reason || value.failureReason || value.failure_reason);
  return {
    timestamp: positiveInteger(value.timestamp || value.updatedAt || value.updated_at),
    statusCode: normalizeStatusCode(value.statusCode || value.status_code),
    reason: reason || null,
    model: String(value.model || '').trim() || null,
    cooldownMs: positiveInteger(value.cooldownMs || value.cooldown_ms),
    skipped: value.skipped === true,
  };
}

function normalizeUsage(usage = {}) {
  const inputTokens = positiveInteger(usage.inputTokens ?? usage.input_tokens ?? usage.prompt_tokens ?? usage.promptTokens);
  const outputTokens = positiveInteger(usage.outputTokens ?? usage.output_tokens ?? usage.completion_tokens ?? usage.completionTokens);
  const cachedTokens = positiveInteger(
    usage.cachedTokens
      ?? usage.cached_tokens
      ?? usage.input_tokens_details?.cached_tokens
      ?? usage.prompt_tokens_details?.cached_tokens
      ?? usage.promptTokensDetails?.cachedTokens,
  );
  const reasoningTokens = positiveInteger(
    usage.reasoningTokens
      ?? usage.reasoning_tokens
      ?? usage.output_tokens_details?.reasoning_tokens
      ?? usage.completion_tokens_details?.reasoning_tokens
      ?? usage.completionTokensDetails?.reasoningTokens,
  );
  const explicitTotal = positiveInteger(usage.totalTokens ?? usage.total_tokens);
  return {
    inputTokens,
    outputTokens,
    totalTokens: explicitTotal || inputTokens + outputTokens + reasoningTokens,
    cachedTokens,
    reasoningTokens,
  };
}

function readUsageNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

function nonNullChild(value, key) {
  const child = value && typeof value === 'object' ? value[key] : null;
  return child && typeof child === 'object' ? child : null;
}

export function extractUsageCapture(value) {
  const usage = nonNullChild(value, 'usage')
    || nonNullChild(value?.response, 'usage')
    || nonNullChild(value?.response?.response, 'usage')
    || nonNullChild(value, 'usageMetadata')
    || nonNullChild(value, 'usage_metadata')
    || nonNullChild(value?.response, 'usageMetadata')
    || nonNullChild(value?.response, 'usage_metadata');
  if (!usage) return null;

  const inputTokens = readUsageNumber(
    usage.input_tokens
      ?? usage.prompt_tokens
      ?? usage.promptTokenCount,
  ) || 0;
  const outputTokens = readUsageNumber(
    usage.output_tokens
      ?? usage.completion_tokens
      ?? usage.candidatesTokenCount,
  ) || 0;
  const cachedTokens = readUsageNumber(
    usage.cached_tokens
      ?? usage.input_tokens_details?.cached_tokens
      ?? usage.prompt_tokens_details?.cached_tokens
      ?? usage.cachedContentTokenCount,
  ) || 0;
  const reasoningTokens = readUsageNumber(
    usage.reasoning_tokens
      ?? usage.output_tokens_details?.reasoning_tokens
      ?? usage.completion_tokens_details?.reasoning_tokens
      ?? usage.thoughtsTokenCount,
  ) || 0;
  const explicitTotal = readUsageNumber(usage.total_tokens ?? usage.totalTokenCount) || 0;

  return {
    inputTokens,
    outputTokens,
    totalTokens: explicitTotal || inputTokens + outputTokens + reasoningTokens,
    cachedTokens,
    reasoningTokens,
  };
}

function applyUsageStats(target, success, latencyMs, usage) {
  target.requestCount = positiveInteger(target.requestCount) + 1;
  if (success) target.successCount = positiveInteger(target.successCount) + 1;
  else target.failureCount = positiveInteger(target.failureCount) + 1;
  target.totalLatencyMs = positiveInteger(target.totalLatencyMs) + positiveInteger(latencyMs);
  if (!usage) return;
  target.inputTokens = positiveInteger(target.inputTokens) + positiveInteger(usage.inputTokens);
  target.outputTokens = positiveInteger(target.outputTokens) + positiveInteger(usage.outputTokens);
  target.totalTokens = positiveInteger(target.totalTokens) + positiveInteger(usage.totalTokens);
  target.cachedTokens = positiveInteger(target.cachedTokens) + positiveInteger(usage.cachedTokens);
  target.reasoningTokens = positiveInteger(target.reasoningTokens) + positiveInteger(usage.reasoningTokens);
}

function upsertAccountUsageStats(accounts, accountId, email, success, latencyMs, usage, updatedAt) {
  const id = String(accountId || '').trim();
  if (!id) return null;
  const normalizedEmail = String(email || '').trim();
  let item = accounts.find((entry) => entry.accountId === id);
  if (!item) {
    item = {
      accountId: id,
      email: normalizedEmail,
      usage: emptyUsageStats(),
      recentFailure: null,
      updatedAt,
    };
    accounts.push(item);
  }
  if (normalizedEmail) item.email = normalizedEmail;
  item.updatedAt = updatedAt;
  applyUsageStats(item.usage, success, latencyMs, usage);
  return item;
}

function upsertAccountDiagnosticStats(accounts, accountId, email, updatedAt) {
  const id = String(accountId || '').trim();
  if (!id) return null;
  const normalizedEmail = String(email || '').trim();
  let item = accounts.find((entry) => entry.accountId === id);
  if (!item) {
    item = {
      accountId: id,
      email: normalizedEmail,
      usage: emptyUsageStats(),
      recentFailure: null,
      updatedAt,
    };
    accounts.push(item);
  }
  if (normalizedEmail) item.email = normalizedEmail;
  item.updatedAt = Math.max(positiveInteger(item.updatedAt), positiveInteger(updatedAt));
  return item;
}

function normalizeAttempt(value = {}, fallback = {}) {
  const account = value.account && typeof value.account === 'object' ? value.account : {};
  const reason = sanitizeFailureReason(value.reason || value.failureReason || value.failure_reason || fallback.failureReason);
  return {
    timestamp: positiveInteger(value.timestamp || fallback.timestamp),
    accountId: String(value.accountId || value.account_id || account.id || fallback.accountId || '').trim(),
    email: String(value.email || account.email || fallback.email || '').trim(),
    success: value.success === true,
    statusCode: normalizeStatusCode(value.statusCode ?? value.status_code ?? fallback.statusCode),
    reason: reason || null,
    model: String(value.model || fallback.model || '').trim() || null,
    cooldownMs: positiveInteger(value.cooldownMs || value.cooldown_ms),
    skipped: value.skipped === true,
    recovered: value.recovered === true,
  };
}

function normalizeAttempts(attempts, fallback = {}) {
  const raw = Array.isArray(attempts) && attempts.length ? attempts : [fallback];
  return raw
    .slice(0, 12)
    .map((item) => normalizeAttempt(item, fallback))
    .filter((item) => item.statusCode || item.accountId || item.reason);
}

function applyAttemptDiagnostics(totals, accounts, attempts, updatedAt) {
  for (const attempt of attempts) {
    incrementStatusCode(totals, attempt.statusCode);
    const item = upsertAccountDiagnosticStats(accounts, attempt.accountId, attempt.email, updatedAt);
    if (!item) continue;
    incrementStatusCode(item.usage, attempt.statusCode);
    if (attempt.success !== true && attempt.recovered !== true) {
      item.recentFailure = normalizeFailure({
        timestamp: attempt.timestamp || updatedAt,
        statusCode: attempt.statusCode,
        reason: attempt.reason,
        model: attempt.model,
        cooldownMs: attempt.cooldownMs,
        skipped: attempt.skipped,
      });
    }
  }
}

function sortAccountStats(accounts = []) {
  accounts.sort((left, right) => (
    positiveInteger(right.usage?.requestCount) - positiveInteger(left.usage?.requestCount)
    || positiveInteger(right.updatedAt) - positiveInteger(left.updatedAt)
    || String(left.accountId || '').localeCompare(String(right.accountId || ''))
  ));
}

function applyEventToWindow(window, event) {
  const usage = normalizeUsage(event);
  applyUsageStats(window.totals, Boolean(event.success), event.latencyMs, usage);
  upsertAccountUsageStats(
    window.accounts,
    event.accountId,
    event.email,
    Boolean(event.success),
    event.latencyMs,
    usage,
    event.timestamp,
  );
  applyAttemptDiagnostics(window.totals, window.accounts, normalizeAttempts(event.attempts, {
    timestamp: event.timestamp,
    accountId: event.accountId,
    email: event.email,
    success: Boolean(event.success),
    statusCode: event.statusCode,
    failureReason: event.failureReason,
    model: event.model,
  }), event.timestamp);
  window.updatedAt = Math.max(positiveInteger(window.updatedAt), positiveInteger(event.timestamp));
}

function recomputeTimeWindows(stats, now = nowMs()) {
  const daySince = now - DAY_WINDOW_MS;
  const weekSince = now - WEEK_WINDOW_MS;
  const monthSince = now - MONTH_WINDOW_MS;
  stats.events = Array.isArray(stats.events) ? stats.events : [];
  stats.events = stats.events
    .filter((event) => positiveInteger(event.timestamp) >= monthSince)
    .sort((left, right) => positiveInteger(left.timestamp) - positiveInteger(right.timestamp));
  if (stats.events.length > MAX_RECENT_USAGE_EVENTS) {
    stats.events = stats.events.slice(stats.events.length - MAX_RECENT_USAGE_EVENTS);
  }

  const daily = emptyStatsWindow(daySince, Math.max(positiveInteger(stats.updatedAt), daySince));
  const weekly = emptyStatsWindow(weekSince, Math.max(positiveInteger(stats.updatedAt), weekSince));
  const monthly = emptyStatsWindow(monthSince, Math.max(positiveInteger(stats.updatedAt), monthSince));
  for (const event of stats.events) {
    const timestamp = positiveInteger(event.timestamp);
    if (timestamp >= monthSince) applyEventToWindow(monthly, event);
    if (timestamp >= weekSince) applyEventToWindow(weekly, event);
    if (timestamp >= daySince) applyEventToWindow(daily, event);
  }
  sortAccountStats(daily.accounts);
  sortAccountStats(weekly.accounts);
  sortAccountStats(monthly.accounts);
  stats.daily = daily;
  stats.weekly = weekly;
  stats.monthly = monthly;
}

function normalizeStats(raw) {
  const now = nowMs();
  const stats = {
    ...emptyStatsSnapshot(now),
    ...(raw && typeof raw === 'object' ? raw : {}),
  };
  stats.since = positiveInteger(stats.since) || now;
  stats.updatedAt = positiveInteger(stats.updatedAt) || stats.since;
  stats.totals = { ...emptyUsageStats(), ...(stats.totals || {}) };
  stats.totals.statusCodes = normalizeStatusCodes(stats.totals.statusCodes);
  stats.accounts = Array.isArray(stats.accounts) ? stats.accounts : [];
  stats.accounts = stats.accounts.map((item) => ({
    accountId: String(item.accountId || item.account_id || '').trim(),
    email: String(item.email || '').trim(),
    usage: {
      ...emptyUsageStats(),
      ...(item.usage || {}),
      statusCodes: normalizeStatusCodes(item.usage?.statusCodes || item.usage?.status_codes),
    },
    recentFailure: normalizeFailure(item.recentFailure || item.recent_failure),
    updatedAt: positiveInteger(item.updatedAt || item.updated_at),
  })).filter((item) => item.accountId);
  sortAccountStats(stats.accounts);
  recomputeTimeWindows(stats, now);
  return stats;
}

export async function loadLocalAccessStats() {
  await cleanupStaleStatsTemps();
  return normalizeStats(await readJson(LOCAL_ACCESS_STATS_PATH, null));
}

export async function clearLocalAccessStats() {
  return enqueueStatsWrite(async () => {
    await cleanupStaleStatsTemps();
    const stats = emptyStatsSnapshot();
    await writeJson(LOCAL_ACCESS_STATS_PATH, stats, { space: 0 });
    return stats;
  });
}

async function recordLocalAccessStatsNow({
  accountId,
  email,
  success,
  latencyMs,
  usage,
  statusCode,
  failureReason,
  attempts,
} = {}) {
  await cleanupStaleStatsTemps();
  const stats = await loadLocalAccessStats();
  const now = nowMs();
  const normalizedUsage = usage ? normalizeUsage(usage) : null;
  const normalizedAttempts = normalizeAttempts(attempts, {
    timestamp: now,
    accountId,
    email,
    success: Boolean(success),
    statusCode,
    failureReason,
  });
  stats.updatedAt = now;
  applyUsageStats(stats.totals, Boolean(success), latencyMs, normalizedUsage);
  upsertAccountUsageStats(stats.accounts, accountId, email, Boolean(success), latencyMs, normalizedUsage, now);
  applyAttemptDiagnostics(stats.totals, stats.accounts, normalizedAttempts, now);
  stats.events.push({
    timestamp: now,
    accountId: String(accountId || '').trim(),
    email: String(email || '').trim(),
    success: Boolean(success),
    latencyMs: positiveInteger(latencyMs),
    statusCode: normalizeStatusCode(statusCode),
    failureReason: Boolean(success) ? null : sanitizeFailureReason(failureReason),
    attempts: normalizedAttempts,
    inputTokens: normalizedUsage?.inputTokens || 0,
    outputTokens: normalizedUsage?.outputTokens || 0,
    totalTokens: normalizedUsage?.totalTokens || 0,
    cachedTokens: normalizedUsage?.cachedTokens || 0,
    reasoningTokens: normalizedUsage?.reasoningTokens || 0,
  });
  sortAccountStats(stats.accounts);
  recomputeTimeWindows(stats, now);
  await writeJson(LOCAL_ACCESS_STATS_PATH, stats, { space: 0 });
  return stats;
}

export async function recordLocalAccessStats(payload = {}) {
  return enqueueStatsWrite(() => recordLocalAccessStatsNow(payload));
}
