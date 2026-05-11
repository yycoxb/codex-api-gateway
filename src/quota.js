import { DEFAULT_CODEX_ORIGINATOR, DEFAULT_CODEX_USER_AGENT, QUOTA_REFRESH_SCHEDULE_PATH, USAGE_URL } from './constants.js';
import { getAccountById, listAccounts, refreshAccountIfNeeded, saveAccount } from './account.js';
import { readJson, writeJson } from './storage.js';
import { nowMs, nowSec } from './utils.js';

const DEFAULT_QUOTA_REFRESH_INTERVAL_MINUTES = 10;
const MIN_QUOTA_REFRESH_INTERVAL_MINUTES = 1;
const MAX_QUOTA_REFRESH_INTERVAL_MINUTES = 60 * 24;

let quotaRefreshTimer = null;
let quotaRefreshRunning = false;

function clampPercent(value, fallback = 100) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function remainingPercentage(window) {
  return 100 - clampPercent(window?.used_percent, 0);
}

function windowMinutes(window) {
  const seconds = Number(window?.limit_window_seconds || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.ceil(seconds / 60);
}

function resetTime(window) {
  const resetAt = Number(window?.reset_at || 0);
  if (Number.isFinite(resetAt) && resetAt > 0) return Math.round(resetAt);
  const resetAfter = Number(window?.reset_after_seconds || 0);
  if (Number.isFinite(resetAfter) && resetAfter >= 0) return nowSec() + Math.round(resetAfter);
  return null;
}

function normalizePlanFamily(planType) {
  const normalized = String(planType || '').trim().toLowerCase().replace(/[_\s-]+/g, '');
  if (!normalized) return null;
  if (normalized.includes('pro')) return 'pro';
  if (normalized.includes('plus')) return 'plus';
  if (normalized.includes('team')) return 'team';
  if (normalized.includes('business')) return 'business';
  if (normalized.includes('enterprise')) return 'enterprise';
  if (normalized.includes('edu')) return 'edu';
  if (normalized.includes('free')) return 'free';
  if (normalized.includes('go')) return 'go';
  return normalized;
}

function planFamilyChanged(previousPlan, nextPlan) {
  const previous = normalizePlanFamily(previousPlan);
  const next = normalizePlanFamily(nextPlan);
  return Boolean(previous && next && previous !== next);
}

function clearStaleSubscriptionExpiry(account, previousPlan, nextPlan) {
  if (!account?.subscriptionActiveUntil && !account?.subscription_active_until) return false;
  account.subscriptionActiveUntil = null;
  account.subscription_active_until = null;
  account.subscriptionPlanType = null;
  account.subscription_plan_type = null;
  account.subscriptionExpiryClearedAt = nowMs();
  account.subscriptionExpiryClearedReason = `plan_changed:${previousPlan || '<unknown>'}->${nextPlan || '<unknown>'}`;
  return true;
}

function parseQuotaFromUsage(usage) {
  const rateLimit = usage?.rate_limit || {};
  const primary = rateLimit.primary_window || null;
  const secondary = rateLimit.secondary_window || null;

  return {
    hourly_percentage: primary ? remainingPercentage(primary) : 100,
    hourly_reset_time: primary ? resetTime(primary) : null,
    hourly_window_minutes: primary ? windowMinutes(primary) : null,
    hourly_window_present: Boolean(primary),
    weekly_percentage: secondary ? remainingPercentage(secondary) : 100,
    weekly_reset_time: secondary ? resetTime(secondary) : null,
    weekly_window_minutes: secondary ? windowMinutes(secondary) : null,
    weekly_window_present: Boolean(secondary),
    raw_data: usage,
  };
}

async function fetchQuota(account) {
  const headers = {
    authorization: `Bearer ${account.tokens.access_token.trim()}`,
    accept: 'application/json',
    'user-agent': DEFAULT_CODEX_USER_AGENT,
    originator: DEFAULT_CODEX_ORIGINATOR,
  };
  if (account.accountId) headers['ChatGPT-Account-Id'] = account.accountId;

  const resp = await fetch(USAGE_URL, { method: 'GET', headers });
  const text = await resp.text();
  if (!resp.ok) {
    let code = null;
    try {
      const data = JSON.parse(text);
      code = data?.detail?.code || data?.error?.code || data?.code || null;
    } catch {}
    throw new Error(`用量接口返回 ${resp.status}${code ? ` (${code})` : ''}: body_len=${text.length}`);
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`用量 JSON 解析失败: ${err.message}`);
  }
}

export async function refreshAccountQuota(accountId) {
  let account = await getAccountById(accountId);

  try {
    account = await refreshAccountIfNeeded(account);
    let usage = await fetchQuota(account);
    const quota = parseQuotaFromUsage(usage);

    account.quota = quota;
    account.quotaError = null;
    const previousPlanType = account.planType || account.plan_type || null;
    if (usage.plan_type) {
      account.planType = usage.plan_type;
      if (planFamilyChanged(previousPlanType, usage.plan_type)) {
        clearStaleSubscriptionExpiry(account, previousPlanType, usage.plan_type);
      }
    }
    account.usageUpdatedAt = nowMs();
    account = await saveAccount(account);

    return {
      ok: true,
      account: {
        id: account.id,
        email: account.email,
        accountId: account.accountId,
        planType: account.planType,
        subscriptionActiveUntil: account.subscriptionActiveUntil || null,
        quota: {
          hourly_percentage: quota.hourly_percentage,
          hourly_reset_time: quota.hourly_reset_time,
          hourly_window_minutes: quota.hourly_window_minutes,
          hourly_window_present: quota.hourly_window_present,
          weekly_percentage: quota.weekly_percentage,
          weekly_reset_time: quota.weekly_reset_time,
          weekly_window_minutes: quota.weekly_window_minutes,
          weekly_window_present: quota.weekly_window_present,
        },
        usageUpdatedAt: account.usageUpdatedAt,
      },
    };
  } catch (err) {
    account.quotaError = {
      message: String(err?.message || err),
      timestamp: nowMs(),
    };
    await saveAccount(account);
    throw err;
  }
}

export async function refreshAccountQuotas(accountIds) {
  const ids = Array.isArray(accountIds) ? accountIds.filter(Boolean) : [];
  if (!ids.length) throw new Error('没有选择账号');

  const results = [];
  for (const accountId of ids) {
    try {
      results.push(await refreshAccountQuota(accountId));
    } catch (err) {
      results.push({
        ok: false,
        accountId,
        error: String(err?.message || err),
      });
    }
  }

  return {
    ok: results.every((item) => item.ok),
    count: results.length,
    successCount: results.filter((item) => item.ok).length,
    failureCount: results.filter((item) => !item.ok).length,
    results,
  };
}

function clampQuotaRefreshIntervalMinutes(value) {
  const number = Number(value || DEFAULT_QUOTA_REFRESH_INTERVAL_MINUTES);
  if (!Number.isFinite(number)) return DEFAULT_QUOTA_REFRESH_INTERVAL_MINUTES;
  return Math.max(
    MIN_QUOTA_REFRESH_INTERVAL_MINUTES,
    Math.min(MAX_QUOTA_REFRESH_INTERVAL_MINUTES, Math.round(number)),
  );
}

function normalizeQuotaRefreshSchedule(raw = {}) {
  return {
    enabled: raw.enabled === true,
    intervalMinutes: clampQuotaRefreshIntervalMinutes(raw.intervalMinutes),
    lastRunAt: Number(raw.lastRunAt || 0) || null,
    nextRunAt: Number(raw.nextRunAt || 0) || null,
    lastResult: raw.lastResult && typeof raw.lastResult === 'object' ? raw.lastResult : null,
    updatedAt: Number(raw.updatedAt || 0) || null,
  };
}

function summarizeQuotaRefreshResult(result, reason) {
  return {
    ok: !!result?.ok,
    reason,
    count: Number(result?.count || 0),
    successCount: Number(result?.successCount || 0),
    failureCount: Number(result?.failureCount || 0),
    startedAt: result?.startedAt || null,
    finishedAt: result?.finishedAt || nowMs(),
  };
}

function clearQuotaRefreshTimer() {
  if (quotaRefreshTimer) {
    clearTimeout(quotaRefreshTimer);
    quotaRefreshTimer = null;
  }
}

async function persistQuotaRefreshSchedule(schedule) {
  const normalized = normalizeQuotaRefreshSchedule(schedule);
  normalized.updatedAt = nowMs();
  await writeJson(QUOTA_REFRESH_SCHEDULE_PATH, normalized);
  return normalized;
}

function nextQuotaRefreshAt(schedule, fromMs = nowMs()) {
  const normalized = normalizeQuotaRefreshSchedule(schedule);
  return Number(fromMs || nowMs()) + normalized.intervalMinutes * 60_000;
}

function armQuotaRefreshSchedule(schedule) {
  clearQuotaRefreshTimer();
  const normalized = normalizeQuotaRefreshSchedule(schedule);
  if (!normalized.enabled) return;
  const now = nowMs();
  const target = normalized.nextRunAt && normalized.nextRunAt > 0
    ? normalized.nextRunAt
    : nextQuotaRefreshAt(normalized, now);
  const delayMs = Math.max(1_000, target - now);
  quotaRefreshTimer = setTimeout(() => {
    runQuotaRefreshSchedule('timer').catch((err) => {
      console.error('[quota-refresh] timer run failed:', err);
      loadQuotaRefreshSchedule().then(armQuotaRefreshSchedule).catch(() => {});
    });
  }, delayMs);
  quotaRefreshTimer.unref?.();
}

export async function loadQuotaRefreshSchedule() {
  const raw = await readJson(QUOTA_REFRESH_SCHEDULE_PATH, {});
  const schedule = normalizeQuotaRefreshSchedule(raw && typeof raw === 'object' ? raw : {});
  if (schedule.enabled && !schedule.nextRunAt) {
    schedule.nextRunAt = nextQuotaRefreshAt(schedule);
  }
  return {
    ...schedule,
    running: quotaRefreshRunning,
    timerActive: !!quotaRefreshTimer,
    now: nowMs(),
  };
}

export async function saveQuotaRefreshSchedule(payload = {}) {
  const current = normalizeQuotaRefreshSchedule(await readJson(QUOTA_REFRESH_SCHEDULE_PATH, {}));
  const next = normalizeQuotaRefreshSchedule({ ...current, ...payload });
  if (next.enabled) {
    const shouldResetNextRun = payload.resetNextRun !== false || !current.enabled || !current.nextRunAt;
    if (shouldResetNextRun) next.nextRunAt = nextQuotaRefreshAt(next);
  } else {
    next.nextRunAt = null;
  }
  const saved = await persistQuotaRefreshSchedule(next);
  armQuotaRefreshSchedule(saved);
  return await loadQuotaRefreshSchedule();
}

async function refreshAllAccountQuotasForSchedule(reason = 'manual') {
  if (quotaRefreshRunning) throw new Error('额度自动刷新正在运行，请稍后再试');
  quotaRefreshRunning = true;
  try {
    const startedAt = nowMs();
    const accountList = await listAccounts();
    const ids = (accountList.accounts || []).map((account) => account.id).filter(Boolean);
    let result;
    if (!ids.length) {
      result = {
        ok: false,
        error: '没有可刷新的账号',
        startedAt,
        finishedAt: nowMs(),
        count: 0,
        successCount: 0,
        failureCount: 0,
        results: [],
      };
    } else {
      result = await refreshAccountQuotas(ids);
      result.startedAt = startedAt;
      result.finishedAt = nowMs();
    }

    const latest = normalizeQuotaRefreshSchedule(await readJson(QUOTA_REFRESH_SCHEDULE_PATH, {}));
    latest.lastRunAt = result.finishedAt || nowMs();
    latest.lastResult = summarizeQuotaRefreshResult(result, reason);
    latest.nextRunAt = latest.enabled ? nextQuotaRefreshAt(latest, latest.lastRunAt) : null;
    await persistQuotaRefreshSchedule(latest);
    return result;
  } finally {
    quotaRefreshRunning = false;
    armQuotaRefreshSchedule(await loadQuotaRefreshSchedule());
  }
}

export async function runQuotaRefreshSchedule(reason = 'timer') {
  const schedule = normalizeQuotaRefreshSchedule(await readJson(QUOTA_REFRESH_SCHEDULE_PATH, {}));
  if (!schedule.enabled) return { ok: false, skipped: true, reason: 'schedule_disabled' };
  return await refreshAllAccountQuotasForSchedule(reason);
}

export async function runQuotaRefreshNow() {
  return await refreshAllAccountQuotasForSchedule('manual');
}

export async function startQuotaRefreshScheduler() {
  const schedule = normalizeQuotaRefreshSchedule(await readJson(QUOTA_REFRESH_SCHEDULE_PATH, {}));
  if (!schedule.enabled) {
    clearQuotaRefreshTimer();
    return await loadQuotaRefreshSchedule();
  }
  if (!schedule.nextRunAt || schedule.nextRunAt < nowMs()) {
    schedule.nextRunAt = nextQuotaRefreshAt(schedule);
    await persistQuotaRefreshSchedule(schedule);
  }
  armQuotaRefreshSchedule(schedule);
  return await loadQuotaRefreshSchedule();
}
