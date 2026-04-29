import { LOCAL_ACCESS_STATS_PATH } from './constants.js';
import { readJson, writeJson } from './storage.js';
import { nowMs } from './utils.js';

const DAY_WINDOW_MS = 24 * 60 * 60 * 1000;
const WEEK_WINDOW_MS = 7 * DAY_WINDOW_MS;
const MONTH_WINDOW_MS = 30 * DAY_WINDOW_MS;
const MAX_RECENT_USAGE_EVENTS = 50_000;

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
  if (!id) return;
  const normalizedEmail = String(email || '').trim();
  let item = accounts.find((entry) => entry.accountId === id);
  if (!item) {
    item = {
      accountId: id,
      email: normalizedEmail,
      usage: emptyUsageStats(),
      updatedAt,
    };
    accounts.push(item);
  }
  if (normalizedEmail) item.email = normalizedEmail;
  item.updatedAt = updatedAt;
  applyUsageStats(item.usage, success, latencyMs, usage);
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
  stats.accounts = Array.isArray(stats.accounts) ? stats.accounts : [];
  stats.accounts = stats.accounts.map((item) => ({
    accountId: String(item.accountId || item.account_id || '').trim(),
    email: String(item.email || '').trim(),
    usage: { ...emptyUsageStats(), ...(item.usage || {}) },
    updatedAt: positiveInteger(item.updatedAt || item.updated_at),
  })).filter((item) => item.accountId);
  sortAccountStats(stats.accounts);
  recomputeTimeWindows(stats, now);
  return stats;
}

export async function loadLocalAccessStats() {
  return normalizeStats(await readJson(LOCAL_ACCESS_STATS_PATH, null));
}

export async function clearLocalAccessStats() {
  const stats = emptyStatsSnapshot();
  await writeJson(LOCAL_ACCESS_STATS_PATH, stats);
  return stats;
}

export async function recordLocalAccessStats({ accountId, email, success, latencyMs, usage } = {}) {
  const stats = await loadLocalAccessStats();
  const now = nowMs();
  const normalizedUsage = usage ? normalizeUsage(usage) : null;
  stats.updatedAt = now;
  applyUsageStats(stats.totals, Boolean(success), latencyMs, normalizedUsage);
  upsertAccountUsageStats(stats.accounts, accountId, email, Boolean(success), latencyMs, normalizedUsage, now);
  stats.events.push({
    timestamp: now,
    accountId: String(accountId || '').trim(),
    email: String(email || '').trim(),
    success: Boolean(success),
    latencyMs: positiveInteger(latencyMs),
    inputTokens: normalizedUsage?.inputTokens || 0,
    outputTokens: normalizedUsage?.outputTokens || 0,
    totalTokens: normalizedUsage?.totalTokens || 0,
    cachedTokens: normalizedUsage?.cachedTokens || 0,
    reasoningTokens: normalizedUsage?.reasoningTokens || 0,
  });
  sortAccountStats(stats.accounts);
  recomputeTimeWindows(stats, now);
  await writeJson(LOCAL_ACCESS_STATS_PATH, stats);
  return stats;
}
