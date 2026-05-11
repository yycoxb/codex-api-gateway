import { DEFAULT_CODEX_ORIGINATOR, DEFAULT_CODEX_USER_AGENT, UPSTREAM_BASE, WAKEUP_HISTORY_PATH, WAKEUP_SCHEDULE_PATH } from './constants.js';
import { getAccountById, listAccounts, refreshAccountIfNeeded } from './account.js';
import { parseSseFrame, splitSseFrames } from './sse.js';
import { readJson, writeJson } from './storage.js';
import { nowMs } from './utils.js';

const DEFAULT_WAKEUP_PROMPT = 'Reply with exactly: OK';
const MAX_HISTORY_ITEMS = 200;
const DEFAULT_INTERVAL_MINUTES = 240;
const MIN_INTERVAL_MINUTES = 1;
const MAX_INTERVAL_MINUTES = 60 * 24 * 14;
const DEFAULT_SCHEDULE_MODE = 'daily';
const DEFAULT_DAILY_TIME = '20:00';

let wakeupScheduleTimer = null;
let wakeupScheduleRunning = false;

function buildWakeupBody({ model, prompt, reasoningEffort }) {
  return {
    instructions: '',
    stream: true,
    store: false,
    model: model || 'gpt-5.5',
    input: [
      {
        role: 'user',
        content: [{ type: 'input_text', text: prompt || DEFAULT_WAKEUP_PROMPT }],
      },
    ],
    parallel_tool_calls: true,
    reasoning: {
      effort: reasoningEffort || 'medium',
      summary: 'auto',
    },
    include: ['reasoning.encrypted_content'],
  };
}

function extractUsage(response) {
  const usage = response?.usage;
  if (!usage) return null;
  const input = usage.input_tokens ?? usage.prompt_tokens ?? 0;
  const output = usage.output_tokens ?? usage.completion_tokens ?? 0;
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: usage.total_tokens ?? input + output,
    cachedTokens: usage.input_tokens_details?.cached_tokens ?? usage.cached_tokens ?? 0,
    reasoningTokens: usage.output_tokens_details?.reasoning_tokens ?? usage.reasoning_tokens ?? 0,
  };
}

function sseFrameInfo(frame) {
  const parsed = parseSseFrame(frame);
  if (parsed.data) return parsed;
  const trimmed = String(frame || '').trim();
  return { event: parsed.event, data: trimmed || null };
}

function responseEventType(event, sseEventName) {
  return String(event?.type || sseEventName || '').trim();
}

function isResponseCompletionEvent(type) {
  return type === 'response.completed' || type === 'response.done';
}

async function consumeWakeupStream(upstream) {
  let buffer = '';
  let outputText = '';
  let responseId = null;
  let usage = null;

  if (!upstream.body) return { outputText, responseId, usage };

  for await (const chunk of upstream.body) {
    buffer += Buffer.from(chunk).toString('utf8');
    const parsed = splitSseFrames(buffer);
    buffer = parsed.rest;

    for (const frame of parsed.frames) {
      const sse = sseFrameInfo(frame);
      const data = sse.data;
      if (!data || data === '[DONE]') continue;
      let event;
      try { event = JSON.parse(data); } catch { continue; }
      const type = responseEventType(event, sse.event);
      if (type === 'response.created' && event.response) {
        responseId = event.response.id || responseId;
      } else if (type === 'response.output_text.delta') {
        outputText += event.delta || '';
      } else if (isResponseCompletionEvent(type)) {
        const response = event.response || event || {};
        responseId = response.id || responseId;
        usage = extractUsage(response);
      }
    }
  }

  return { outputText, responseId, usage };
}

async function sendWakeupRequest(account, { model, prompt, reasoningEffort }) {
  const body = JSON.stringify(buildWakeupBody({ model, prompt, reasoningEffort }));
  const headers = {
    authorization: `Bearer ${account.tokens.access_token.trim()}`,
    accept: 'text/event-stream',
    'content-type': 'application/json',
    'user-agent': DEFAULT_CODEX_USER_AGENT,
    originator: DEFAULT_CODEX_ORIGINATOR,
  };
  if (account.accountId) headers['ChatGPT-Account-Id'] = account.accountId;

  return await fetch(`${UPSTREAM_BASE}/responses`, {
    method: 'POST',
    headers,
    body,
  });
}

async function appendWakeupHistory(items) {
  const history = Array.isArray(await readJson(WAKEUP_HISTORY_PATH, []))
    ? await readJson(WAKEUP_HISTORY_PATH, [])
    : [];
  const next = [...items, ...history].slice(0, MAX_HISTORY_ITEMS);
  await writeJson(WAKEUP_HISTORY_PATH, next);
  return next;
}

export async function loadWakeupHistory() {
  const history = await readJson(WAKEUP_HISTORY_PATH, []);
  return Array.isArray(history) ? history : [];
}

export async function runWakeup({ accountIds, model = 'gpt-5.5', prompt = DEFAULT_WAKEUP_PROMPT, reasoningEffort = 'medium' }) {
  let ids = Array.isArray(accountIds) ? accountIds.filter(Boolean) : [];
  if (ids.length === 0) {
    const accountList = await listAccounts();
    if (accountList.currentAccountId) ids = [accountList.currentAccountId];
  }
  if (ids.length === 0) throw new Error('没有选择账号');

  const startedAt = nowMs();
  const results = [];

  for (const accountId of ids) {
    const itemStartedAt = nowMs();
    let account = await getAccountById(accountId);
    try {
      account = await refreshAccountIfNeeded(account);
      let upstream = await sendWakeupRequest(account, { model, prompt, reasoningEffort });
      if (upstream.status === 401) {
        account = await refreshAccountIfNeeded(account, true);
        upstream = await sendWakeupRequest(account, { model, prompt, reasoningEffort });
      }

      if (!upstream.ok) {
        const text = await upstream.text();
        throw new Error(`上游返回 ${upstream.status}: ${text.slice(0, 300)}`);
      }

      const capture = await consumeWakeupStream(upstream);
      results.push({
        ok: true,
        accountId: account.id,
        email: account.email,
        chatgptAccountId: account.accountId,
        model,
        responseId: capture.responseId,
        outputText: capture.outputText,
        usage: capture.usage,
        startedAt: itemStartedAt,
        finishedAt: nowMs(),
      });
    } catch (err) {
      results.push({
        ok: false,
        accountId: account.id,
        email: account.email,
        chatgptAccountId: account.accountId,
        model,
        error: String(err?.message || err),
        startedAt: itemStartedAt,
        finishedAt: nowMs(),
      });
    }
  }

  await appendWakeupHistory(results);
  return {
    ok: results.every((item) => item.ok),
    startedAt,
    finishedAt: nowMs(),
    count: results.length,
    successCount: results.filter((item) => item.ok).length,
    failureCount: results.filter((item) => !item.ok).length,
    results,
  };
}

function clampIntervalMinutes(value) {
  const number = Number(value || DEFAULT_INTERVAL_MINUTES);
  if (!Number.isFinite(number)) return DEFAULT_INTERVAL_MINUTES;
  return Math.max(MIN_INTERVAL_MINUTES, Math.min(MAX_INTERVAL_MINUTES, Math.round(number)));
}

function normalizeScheduleMode(value) {
  return 'daily';
}

function normalizeDailyTime(value) {
  const raw = String(value || DEFAULT_DAILY_TIME).trim();
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(raw);
  if (!match) return DEFAULT_DAILY_TIME;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return DEFAULT_DAILY_TIME;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function computeNextRunAt(schedule, fromMs = nowMs()) {
  const normalized = normalizeSchedule(schedule);
  const from = Number(fromMs || nowMs());
  if (normalized.mode === 'daily') {
    const [hour, minute] = normalized.dailyTime.split(':').map(Number);
    const target = new Date(from);
    target.setHours(hour, minute, 0, 0);
    if (target.getTime() <= from) target.setDate(target.getDate() + 1);
    return target.getTime();
  }
  return from + normalized.intervalMinutes * 60_000;
}

function normalizeSchedule(raw = {}) {
  const accountIds = Array.isArray(raw.accountIds)
    ? [...new Set(raw.accountIds.map((id) => String(id || '').trim()).filter(Boolean))]
    : [];
  return {
    enabled: raw.enabled === true,
    mode: normalizeScheduleMode(raw.mode),
    intervalMinutes: clampIntervalMinutes(raw.intervalMinutes),
    dailyTime: normalizeDailyTime(raw.dailyTime),
    accountIds,
    model: String(raw.model || 'gpt-5.5').trim() || 'gpt-5.5',
    prompt: String(raw.prompt || DEFAULT_WAKEUP_PROMPT).trim() || DEFAULT_WAKEUP_PROMPT,
    reasoningEffort: String(raw.reasoningEffort || 'medium').trim() || 'medium',
    lastRunAt: Number(raw.lastRunAt || 0) || null,
    nextRunAt: Number(raw.nextRunAt || 0) || null,
    lastResult: raw.lastResult && typeof raw.lastResult === 'object' ? raw.lastResult : null,
    updatedAt: Number(raw.updatedAt || 0) || null,
  };
}

function summarizeScheduleResult(result, reason) {
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

function clearWakeupScheduleTimer() {
  if (wakeupScheduleTimer) {
    clearTimeout(wakeupScheduleTimer);
    wakeupScheduleTimer = null;
  }
}

async function persistWakeupSchedule(schedule) {
  const normalized = normalizeSchedule(schedule);
  normalized.updatedAt = nowMs();
  await writeJson(WAKEUP_SCHEDULE_PATH, normalized);
  return normalized;
}

function armWakeupSchedule(schedule) {
  clearWakeupScheduleTimer();
  const normalized = normalizeSchedule(schedule);
  if (!normalized.enabled || normalized.accountIds.length === 0) return;
  const now = nowMs();
  const target = normalized.nextRunAt && normalized.nextRunAt > 0
    ? normalized.nextRunAt
    : computeNextRunAt(normalized, now);
  const delayMs = Math.max(1_000, target - now);
  wakeupScheduleTimer = setTimeout(() => {
    runScheduledWakeup('timer').catch((err) => {
      console.error('[wakeup-schedule] timer run failed:', err);
      loadWakeupSchedule().then(armWakeupSchedule).catch(() => {});
    });
  }, delayMs);
  wakeupScheduleTimer.unref?.();
}

export async function loadWakeupSchedule() {
  const raw = await readJson(WAKEUP_SCHEDULE_PATH, {});
  const schedule = normalizeSchedule(raw && typeof raw === 'object' ? raw : {});
  if (schedule.enabled && schedule.accountIds.length > 0 && !schedule.nextRunAt) {
    schedule.nextRunAt = computeNextRunAt(schedule);
  }
  return {
    ...schedule,
    running: wakeupScheduleRunning,
    timerActive: !!wakeupScheduleTimer,
    now: nowMs(),
  };
}

export async function saveWakeupSchedule(payload = {}) {
  const current = normalizeSchedule(await readJson(WAKEUP_SCHEDULE_PATH, {}));
  const next = normalizeSchedule({ ...current, ...payload });
  if (next.enabled && next.accountIds.length === 0) {
    throw new Error('\u542f\u7528\u5b9a\u65f6\u5524\u9192\u524d\u8bf7\u81f3\u5c11\u9009\u62e9\u4e00\u4e2a\u8d26\u53f7');
  }
  if (next.enabled) {
    const shouldResetNextRun = payload.resetNextRun !== false || !current.enabled || !current.nextRunAt;
    if (shouldResetNextRun) next.nextRunAt = computeNextRunAt(next);
  } else {
    next.nextRunAt = null;
  }
  const saved = await persistWakeupSchedule(next);
  armWakeupSchedule(saved);
  return await loadWakeupSchedule();
}

async function runScheduleOnce(schedule, reason = 'manual') {
  const normalized = normalizeSchedule(schedule);
  if (normalized.accountIds.length === 0) throw new Error('\u5b9a\u65f6\u5524\u9192\u6ca1\u6709\u9009\u62e9\u8d26\u53f7');
  if (wakeupScheduleRunning) throw new Error('\u5b9a\u65f6\u5524\u9192\u6b63\u5728\u8fd0\u884c\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5');

  wakeupScheduleRunning = true;
  try {
    const startedAt = nowMs();
    let result;
    try {
      result = await runWakeup({
        accountIds: normalized.accountIds,
        model: normalized.model,
        prompt: normalized.prompt,
        reasoningEffort: normalized.reasoningEffort,
      });
    } catch (err) {
      result = {
        ok: false,
        error: String(err?.message || err),
        startedAt,
        finishedAt: nowMs(),
        count: normalized.accountIds.length,
        successCount: 0,
        failureCount: normalized.accountIds.length,
        results: [],
      };
    }

    const latest = normalizeSchedule(await readJson(WAKEUP_SCHEDULE_PATH, {}));
    latest.lastRunAt = result.finishedAt || nowMs();
    latest.lastResult = summarizeScheduleResult(result, reason);
    latest.nextRunAt = latest.enabled ? computeNextRunAt(latest, (latest.lastRunAt || nowMs()) + 1000) : null;
    await persistWakeupSchedule(latest);
    return result;
  } finally {
    wakeupScheduleRunning = false;
    armWakeupSchedule(await loadWakeupSchedule());
  }
}

export async function runScheduledWakeup(reason = 'timer') {
  const schedule = normalizeSchedule(await readJson(WAKEUP_SCHEDULE_PATH, {}));
  if (!schedule.enabled) return { ok: false, skipped: true, reason: 'schedule_disabled' };
  return await runScheduleOnce(schedule, reason);
}

export async function runWakeupScheduleNow() {
  const schedule = normalizeSchedule(await readJson(WAKEUP_SCHEDULE_PATH, {}));
  return await runScheduleOnce(schedule, 'manual');
}

export async function startWakeupScheduler() {
  const schedule = normalizeSchedule(await readJson(WAKEUP_SCHEDULE_PATH, {}));
  if (!schedule.enabled || schedule.accountIds.length === 0) {
    clearWakeupScheduleTimer();
    return await loadWakeupSchedule();
  }
  if (!schedule.nextRunAt || schedule.nextRunAt < nowMs()) {
    schedule.nextRunAt = computeNextRunAt(schedule);
    await persistWakeupSchedule(schedule);
  }
  armWakeupSchedule(schedule);
  return await loadWakeupSchedule();
}

