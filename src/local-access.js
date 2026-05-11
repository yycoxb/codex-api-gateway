import { LOCAL_ACCESS_PATH } from './constants.js';
import { loadAccount, loadAccountStore } from './account.js';
import { readJson, writeJson } from './storage.js';
import { nowMs } from './utils.js';

const DEFAULT_LOCAL_ACCESS = {
  version: 1,
  enabled: true,
  accountIds: [],
  routingStrategy: 'auto',
  serviceTierMode: 'normal',
  restrictFreeAccounts: true,
  createdAt: 0,
  updatedAt: 0,
};

const STRATEGIES = new Set([
  'auto',
  'manual',
  'round_robin',
  'quota_high_first',
  'quota_low_first',
  'expiry_soon_first',
  'expiry_late_first',
  'plan_high_first',
  'plan_low_first',
]);

const SERVICE_TIER_MODES = new Set([
  'normal',
  'fast',
  'passthrough',
]);

let roundRobinCursor = 0;

function normalizeAccountIds(accountIds, validIds) {
  const seen = new Set();
  const result = [];
  for (const raw of Array.isArray(accountIds) ? accountIds : []) {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) continue;
    if (validIds && !validIds.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

function normalizeRoutingStrategy(value) {
  const raw = String(value || DEFAULT_LOCAL_ACCESS.routingStrategy).trim().toLowerCase();
  if (raw === 'ordered' || raw === 'priority' || raw === 'manual_first') return 'manual';
  return STRATEGIES.has(raw) ? raw : DEFAULT_LOCAL_ACCESS.routingStrategy;
}

function normalizeServiceTierMode(value) {
  const raw = String(value || DEFAULT_LOCAL_ACCESS.serviceTierMode).trim().toLowerCase();
  if (raw === 'standard' || raw === 'default') return 'normal';
  if (raw === 'priority') return 'fast';
  return SERVICE_TIER_MODES.has(raw) ? raw : DEFAULT_LOCAL_ACCESS.serviceTierMode;
}

function normalizeLocalAccess(raw) {
  const now = nowMs();
  const hasRestrictFreeAccounts = raw && Object.prototype.hasOwnProperty.call(raw, 'restrictFreeAccounts');
  return {
    ...DEFAULT_LOCAL_ACCESS,
    ...(raw && typeof raw === 'object' ? raw : {}),
    version: 1,
    enabled: raw?.enabled !== false,
    accountIds: normalizeAccountIds(raw?.accountIds),
    routingStrategy: normalizeRoutingStrategy(raw?.routingStrategy),
    serviceTierMode: normalizeServiceTierMode(raw?.serviceTierMode || raw?.speedMode),
    restrictFreeAccounts: hasRestrictFreeAccounts ? raw.restrictFreeAccounts !== false : DEFAULT_LOCAL_ACCESS.restrictFreeAccounts,
    createdAt: Number(raw?.createdAt || now),
    updatedAt: Number(raw?.updatedAt || now),
  };
}

function isFreePlan(account) {
  return String(account?.planType || account?.plan_type || '').trim().toLowerCase().includes('free');
}

function isOAuthProxyAccount(account) {
  if (!account || typeof account !== 'object') return false;
  const authMode = String(account.authMode || account.auth_mode || 'oauth').trim().toLowerCase();
  if (authMode === 'apikey' || account.openaiApiKey || account.openai_api_key) return false;
  return Boolean(account.tokens?.access_token);
}

function isUsableProxyAccount(account, restrictFreeAccounts) {
  if (!isOAuthProxyAccount(account)) return false;
  if (restrictFreeAccounts && isFreePlan(account)) return false;
  return true;
}

function normalizePlanKey(planType) {
  const normalized = String(planType || '').trim().toLowerCase();
  if (!normalized) return 'free';
  if (normalized.includes('enterprise')) return 'enterprise';
  if (normalized.includes('business')) return 'business';
  if (normalized.includes('team')) return 'team';
  if (normalized.includes('edu')) return 'edu';
  if (normalized.includes('go')) return 'go';
  if (normalized.includes('plus')) return 'plus';
  if (normalized.includes('pro')) return 'pro';
  if (normalized.includes('free')) return 'free';
  return normalized;
}

function planRank(account) {
  switch (normalizePlanKey(account?.planType || account?.plan_type)) {
    case 'enterprise': return 700;
    case 'business': return 650;
    case 'team': return 640;
    case 'edu': return 630;
    case 'pro': return 540;
    case 'plus': return 420;
    case 'go': return 360;
    case 'free': return 300;
    default: return null;
  }
}

function remainingQuota(account) {
  const quota = account?.quota;
  if (!quota || typeof quota !== 'object') return null;
  const values = [];
  if (quota.hourly_window_present !== false && quota.hourly_percentage != null) values.push(Number(quota.hourly_percentage));
  if (quota.weekly_window_present !== false && quota.weekly_percentage != null) values.push(Number(quota.weekly_percentage));
  const finite = values.filter((value) => Number.isFinite(value)).map((value) => Math.max(0, Math.min(100, Math.round(value))));
  if (!finite.length) return null;
  return Math.min(...finite);
}

function epochToMs(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) {
    return number < 10_000_000_000 ? Math.round(number * 1000) : Math.round(number);
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function subscriptionExpiryMs(account) {
  return epochToMs(
    account?.subscriptionActiveUntil
      ?? account?.subscription_active_until
      ?? account?.chatgpt_subscription_active_until
      ?? account?.subscriptionExpiresAt
      ?? account?.subscription_expires_at
      ?? account?.validUntil
      ?? account?.valid_until,
  );
}

function compareOptionDesc(left, right) {
  if (left != null && right != null) return right - left;
  if (left != null) return -1;
  if (right != null) return 1;
  return 0;
}

function compareOptionAsc(left, right) {
  if (left != null && right != null) return left - right;
  if (left != null) return -1;
  if (right != null) return 1;
  return 0;
}

function strategyComparator(strategy) {
  return (left, right) => {
    if (strategy === 'quota_high_first') {
      return compareOptionDesc(left.remainingQuota, right.remainingQuota)
        || compareOptionDesc(left.planRank, right.planRank)
        || left.originalIndex - right.originalIndex;
    }
    if (strategy === 'quota_low_first') {
      return compareOptionAsc(left.remainingQuota, right.remainingQuota)
        || compareOptionDesc(left.planRank, right.planRank)
        || left.originalIndex - right.originalIndex;
    }
    if (strategy === 'expiry_soon_first') {
      return compareOptionAsc(left.subscriptionExpiryMs, right.subscriptionExpiryMs)
        || compareOptionDesc(left.remainingQuota, right.remainingQuota)
        || compareOptionDesc(left.planRank, right.planRank)
        || left.originalIndex - right.originalIndex;
    }
    if (strategy === 'expiry_late_first') {
      return compareOptionDesc(left.subscriptionExpiryMs, right.subscriptionExpiryMs)
        || compareOptionDesc(left.remainingQuota, right.remainingQuota)
        || compareOptionDesc(left.planRank, right.planRank)
        || left.originalIndex - right.originalIndex;
    }
    if (strategy === 'plan_high_first' || strategy === 'auto') {
      return compareOptionDesc(left.planRank, right.planRank)
        || compareOptionDesc(left.remainingQuota, right.remainingQuota)
        || left.originalIndex - right.originalIndex;
    }
    if (strategy === 'plan_low_first') {
      return compareOptionAsc(left.planRank, right.planRank)
        || compareOptionDesc(left.remainingQuota, right.remainingQuota)
        || left.originalIndex - right.originalIndex;
    }
    return left.originalIndex - right.originalIndex;
  };
}

export async function loadLocalAccessConfig() {
  return normalizeLocalAccess(await readJson(LOCAL_ACCESS_PATH, null));
}

export async function saveLocalAccessConfig(payload = {}) {
  const current = await loadLocalAccessConfig();
  const accountStore = await loadAccountStore();
  const validAccounts = accountStore.accounts.filter((account) => (
    isUsableProxyAccount(account, Boolean(payload.restrictFreeAccounts ?? current.restrictFreeAccounts))
  ));
  const validIds = new Set(validAccounts.map((account) => account.id));
  const next = normalizeLocalAccess({
    ...current,
    ...payload,
    routingStrategy: normalizeRoutingStrategy(payload.routingStrategy ?? current.routingStrategy),
    serviceTierMode: normalizeServiceTierMode(payload.serviceTierMode ?? payload.speedMode ?? current.serviceTierMode),
    accountIds: normalizeAccountIds(payload.accountIds ?? current.accountIds, validIds),
    updatedAt: nowMs(),
  });
  await writeJson(LOCAL_ACCESS_PATH, next);
  return next;
}

export async function getProxyAccountIds() {
  const config = await loadLocalAccessConfig();
  const accountStore = await loadAccountStore();
  const validIds = new Set(
    accountStore.accounts
      .filter((account) => isUsableProxyAccount(account, config.restrictFreeAccounts))
      .map((account) => account.id),
  );
  let ids = normalizeAccountIds(config.enabled ? config.accountIds : [], validIds);

  if (!ids.length) {
    const current = await loadAccount();
    if (validIds.has(current.id)) ids = [current.id];
  }

  return ids;
}

export function orderAccountIdsForRequest(ids, strategy = 'auto', accounts = []) {
  const list = normalizeAccountIds(ids);
  if (list.length <= 1) return list;

  const normalizedStrategy = normalizeRoutingStrategy(strategy);
  if (normalizedStrategy === 'manual') return list;

  const start = roundRobinCursor++ % list.length;
  const ordered = [];
  for (let offset = 0; offset < list.length; offset += 1) {
    ordered.push(list[(start + offset) % list.length]);
  }

  if (normalizedStrategy === 'round_robin') return ordered;

  const byId = new Map(accounts.map((account) => [account.id, account]));
  return ordered
    .map((id, originalIndex) => {
      const account = byId.get(id) || {};
      return {
        id,
        originalIndex,
        planRank: planRank(account),
        remainingQuota: remainingQuota(account),
        subscriptionExpiryMs: subscriptionExpiryMs(account),
      };
    })
    .sort(strategyComparator(normalizedStrategy))
    .map((item) => item.id);
}

export async function getProxyAccountIdsForRequest() {
  const config = await loadLocalAccessConfig();
  const accountStore = await loadAccountStore();
  const ids = await getProxyAccountIds();
  return orderAccountIdsForRequest(ids, config.routingStrategy, accountStore.accounts);
}
