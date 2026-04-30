import { TOKEN_KEEPER_PATH } from './constants.js';
import { isManagedAuthRefreshDue, keepaliveAccount, loadAccountStore } from './account.js';
import { decodeJwtPayload } from './jwt.js';
import { readJson, writeJson } from './storage.js';
import { nowMs } from './utils.js';

const TOKEN_KEEPER_TICK_MS = 60 * 1000;
const TOKEN_KEEPER_INTERVAL_MS = 8 * 24 * 60 * 60 * 1000;
const TOKEN_REFRESH_LEAD_MS = 5 * 60 * 1000;
const REFRESH_FAILURE_BACKOFF_MS = 15 * 60 * 1000;

let started = false;
let timer = null;
let running = false;

function normalizeState(raw) {
  return {
    enabled: raw?.enabled !== false,
    intervalDays: Number(raw?.intervalDays || 8),
    lastRunAt: Number(raw?.lastRunAt || 0),
    nextRunAt: Number(raw?.nextRunAt || 0),
    running: false,
    accounts: raw?.accounts && typeof raw.accounts === 'object' ? raw.accounts : {},
  };
}

function isOAuthAccount(account) {
  const authMode = String(account?.authMode || account?.auth_mode || 'oauth').toLowerCase();
  return authMode !== 'apikey' &&
    !account?.openaiApiKey &&
    !account?.openai_api_key &&
    Boolean(account?.tokens?.access_token);
}

function accessTokenRefreshDueAt(account) {
  const exp = Number(decodeJwtPayload(account?.tokens?.access_token)?.exp || 0);
  return exp > 0 ? Math.max(0, (exp * 1000) - TOKEN_REFRESH_LEAD_MS) : 0;
}

function proactiveRefreshDueAt(account) {
  const updatedAt = Number(account?.tokenUpdatedAt || account?.token_updated_at || 0);
  return updatedAt > 0 ? updatedAt + TOKEN_KEEPER_INTERVAL_MS : 0;
}

function nextDueAtForAccount(account) {
  const candidates = [
    accessTokenRefreshDueAt(account),
    proactiveRefreshDueAt(account),
  ].filter((value) => Number.isFinite(value) && value > 0);
  return candidates.length ? Math.min(...candidates) : nowMs();
}

export async function loadTokenKeeperState() {
  return normalizeState(await readJson(TOKEN_KEEPER_PATH, null));
}

async function saveTokenKeeperState(state) {
  await writeJson(TOKEN_KEEPER_PATH, normalizeState(state));
}

export async function getTokenKeeperState() {
  const state = await loadTokenKeeperState();
  return {
    ...state,
    started,
    running,
  };
}

export async function runTokenKeeperNow({ force = false } = {}) {
  if (running) {
    return {
      ...(await getTokenKeeperState()),
      ok: false,
      skipped: true,
      error: 'TokenKeeper 正在运行',
    };
  }

  running = true;
  const state = await loadTokenKeeperState();
  const startedAt = nowMs();
  state.lastRunAt = startedAt;
  state.running = true;
  state.accounts = state.accounts || {};

  let checked = 0;
  let refreshed = 0;
  let failed = 0;
  let skipped = 0;

  try {
    const store = await loadAccountStore();
    for (const account of store.accounts || []) {
      if (!isOAuthAccount(account)) continue;
      checked += 1;

      const accountState = state.accounts[account.id] || {};
      const nextDueAt = nextDueAtForAccount(account);
      const nextAttemptAt = Number(accountState.nextAttemptAt || 0);
      if (!force && nextAttemptAt > nowMs()) {
        skipped += 1;
        state.accounts[account.id] = {
          ...accountState,
          nextRunAt: Math.max(nextDueAt, nextAttemptAt),
        };
        continue;
      }

      if (!force && !isManagedAuthRefreshDue(account)) {
        skipped += 1;
        state.accounts[account.id] = {
          ...accountState,
          email: account.email || accountState.email || null,
          ok: accountState.ok !== false,
          error: null,
          lastCheckedAt: nowMs(),
          nextRunAt: nextDueAt,
          tokenGeneration: account.tokenGeneration ?? account.token_generation ?? accountState.tokenGeneration ?? null,
        };
        continue;
      }

      try {
        const updated = await keepaliveAccount(account.id);
        refreshed += 1;
        state.accounts[account.id] = {
          email: updated.email || account.email || null,
          ok: true,
          error: null,
          lastRunAt: nowMs(),
          nextRunAt: nextDueAtForAccount(updated),
          nextAttemptAt: 0,
          tokenGeneration: updated.tokenGeneration ?? updated.token_generation ?? null,
        };
      } catch (err) {
        failed += 1;
        state.accounts[account.id] = {
          ...accountState,
          email: account.email || accountState.email || null,
          ok: false,
          error: String(err?.message || err),
          lastRunAt: nowMs(),
          nextAttemptAt: nowMs() + REFRESH_FAILURE_BACKOFF_MS,
          nextRunAt: nowMs() + REFRESH_FAILURE_BACKOFF_MS,
          tokenGeneration: account.tokenGeneration ?? account.token_generation ?? accountState.tokenGeneration ?? null,
        };
      }
    }

    const nextTimes = Object.values(state.accounts)
      .map((item) => Number(item?.nextRunAt || 0))
      .filter((value) => value > nowMs());
    state.nextRunAt = nextTimes.length ? Math.min(...nextTimes) : nowMs() + TOKEN_KEEPER_TICK_MS;
    state.running = false;
    state.lastResult = { checked, refreshed, failed, skipped, finishedAt: nowMs() };
    await saveTokenKeeperState(state);

    return {
      ok: failed === 0,
      checked,
      refreshed,
      failed,
      skipped,
      state: await getTokenKeeperState(),
    };
  } finally {
    running = false;
  }
}

function scheduleNextRun() {
  if (!started) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    try {
      const state = await loadTokenKeeperState();
      if (state.enabled) await runTokenKeeperNow();
    } catch (err) {
      console.warn('[TokenKeeper] run failed:', err?.message || err);
    } finally {
      scheduleNextRun();
    }
  }, TOKEN_KEEPER_TICK_MS);
  timer.unref?.();
}

export function startTokenKeeper() {
  if (started) return;
  started = true;
  console.log('[TokenKeeper] Codex OAuth token keepalive started');
  const initial = setTimeout(async () => {
    try {
      const state = await loadTokenKeeperState();
      if (state.enabled) await runTokenKeeperNow();
    } catch (err) {
      console.warn('[TokenKeeper] initial run failed:', err?.message || err);
    } finally {
      scheduleNextRun();
    }
  }, 5_000);
  initial.unref?.();
}
