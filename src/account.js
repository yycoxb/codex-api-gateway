import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { ACCOUNT_PATH, ACCOUNTS_PATH, CLIENT_ID, TOKEN_ENDPOINT } from './constants.js';
import { readJson, writeJson } from './storage.js';
import { nowMs } from './utils.js';
import { decodeJwtPayload, extractAccountId, extractEmail, isTokenExpired } from './jwt.js';

const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;
const PROACTIVE_REFRESH_INTERVAL_MS = 8 * 24 * 60 * 60 * 1000;
const REFRESH_REAUTH_PATTERNS = [
  'refresh_token_reused',
  'token_invalidated',
  'invalid_grant',
  'invalid refresh token',
  'authentication token has been invalidated',
];

const accountTokenLocks = new Map();

export function codexHome() {
  const raw = process.env.CODEX_HOME?.trim();
  return raw ? raw.replace(/^["']|["']$/g, '') : path.join(os.homedir(), '.codex');
}

function stableHash(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function buildAccountId({ email, accountId, idToken, accessToken }) {
  const payload = decodeJwtPayload(idToken);
  const subject = payload?.sub || '';
  return `acct_${stableHash([accountId || '', email || '', subject, accessToken || ''].join('|'))}`;
}

function accountSummary(account) {
  const tokenInfo = account.tokens ? extractAuthInfo(account.tokens) : {};
  return {
    id: account.id,
    email: account.email,
    accountId: account.accountId,
    authMode: account.authMode || 'oauth',
    authProvider: account.authProvider || tokenInfo.authProvider,
    userId: account.userId || tokenInfo.userId,
    teamName: account.teamName || tokenInfo.teamName || '个人账户',
    accountName: account.accountName || account.account_name,
    accountStructure: account.accountStructure,
    planType: account.planType || tokenInfo.planType,
    subscriptionActiveUntil: account.subscriptionActiveUntil || tokenInfo.subscriptionActiveUntil,
    tokenGeneration: account.tokenGeneration ?? account.token_generation,
    tokenSourceMode: account.tokenSourceMode || account.token_source_mode,
    requiresReauth: Boolean(account.requiresReauth || account.requires_reauth),
    reauthReason: account.reauthReason || account.reauth_reason || null,
    tags: Array.isArray(account.tags) ? account.tags : null,
    quota: summarizeQuota(account.quota),
    quotaError: account.quotaError || null,
    usageUpdatedAt: account.usageUpdatedAt,
    tokenUpdatedAt: account.tokenUpdatedAt,
    createdAt: account.createdAt,
    importedFrom: account.importedFrom,
    importedAt: account.importedAt,
    updatedAt: account.updatedAt,
    lastUsedAt: account.lastUsedAt,
  };
}

function msToEpochSeconds(value) {
  const ms = epochToMs(value);
  return ms ? Math.floor(ms / 1000) : null;
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  );
}

function accountExportObject(account) {
  const tokenInfo = account.tokens ? extractAuthInfo(account.tokens) : {};
  const authMode = account.authMode || account.auth_mode || 'oauth';
  const exported = {
    id: account.sourceId || account.source_id || account.id,
    email: account.email,
    auth_mode: authMode,
    api_provider_mode: account.apiProviderMode || account.api_provider_mode || 'openai_builtin',
    api_base_url: account.apiBaseUrl || account.api_base_url || undefined,
    api_provider_id: account.apiProviderId || account.api_provider_id || undefined,
    api_provider_name: account.apiProviderName || account.api_provider_name || undefined,
    user_id: account.userId || account.user_id || tokenInfo.userId || null,
    plan_type: account.planType || account.plan_type || tokenInfo.planType || null,
    subscription_active_until: account.subscriptionActiveUntil || account.subscription_active_until || tokenInfo.subscriptionActiveUntil || null,
    account_id: account.accountId || account.account_id || null,
    organization_id: account.organizationId || account.organization_id || null,
    account_structure: account.accountStructure || account.account_structure || 'personal',
    tokens: account.tokens ? {
      id_token: account.tokens.id_token,
      access_token: account.tokens.access_token,
      refresh_token: account.tokens.refresh_token || null,
    } : undefined,
    openai_api_key: account.openaiApiKey || account.openai_api_key || undefined,
    token_generation: Number(account.tokenGeneration ?? account.token_generation ?? 0) || 0,
    token_updated_at: msToEpochSeconds(account.tokenUpdatedAt || account.token_updated_at),
    token_source_mode: account.tokenSourceMode || account.token_source_mode || 'managed',
    quota: account.quota || null,
    usage_updated_at: msToEpochSeconds(account.usageUpdatedAt || account.usage_updated_at),
    tags: Array.isArray(account.tags) ? account.tags : [],
    created_at: msToEpochSeconds(account.createdAt || account.created_at || account.importedAt || account.imported_at),
    last_used: msToEpochSeconds(account.lastUsedAt || account.last_used),
  };
  return compactObject(exported);
}

function summarizeQuota(quota) {
  if (!quota || typeof quota !== 'object') return null;
  return {
    hourly_percentage: quota.hourly_percentage,
    hourly_reset_time: quota.hourly_reset_time,
    hourly_window_minutes: quota.hourly_window_minutes,
    hourly_window_present: quota.hourly_window_present,
    weekly_percentage: quota.weekly_percentage,
    weekly_reset_time: quota.weekly_reset_time,
    weekly_window_minutes: quota.weekly_window_minutes,
    weekly_window_present: quota.weekly_window_present,
  };
}

function epochToMs(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return number < 10_000_000_000 ? Math.round(number * 1000) : Math.round(number);
}

function extractAuthInfo(tokens) {
  const idPayload = decodeJwtPayload(tokens.id_token) || {};
  const accessPayload = decodeJwtPayload(tokens.access_token) || {};
  const idAuth = idPayload['https://api.openai.com/auth'] || {};
  const accessAuth = accessPayload['https://api.openai.com/auth'] || {};
  const organizations = Array.isArray(idAuth.organizations) ? idAuth.organizations : [];
  const defaultOrg = organizations.find((item) => item?.is_default) || organizations[0] || null;
  return {
    authProvider: idPayload.auth_provider || null,
    userId: accessAuth.user_id || accessAuth.chatgpt_user_id || idAuth.user_id || idAuth.chatgpt_user_id || null,
    teamName: defaultOrg?.title || (idAuth.chatgpt_account_id || accessAuth.chatgpt_account_id ? '个人账户' : null),
    planType: accessAuth.chatgpt_plan_type || idAuth.chatgpt_plan_type || null,
    subscriptionActiveUntil: idAuth.chatgpt_subscription_active_until || null,
  };
}

function tokenExpMs(token) {
  const exp = Number(decodeJwtPayload(token)?.exp || 0);
  return exp > 0 ? exp * 1000 : 0;
}

function normalizeOptional(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function parseLastRefreshMs(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return epochToMs(value);
  if (value instanceof Date) return value.getTime();
  const text = String(value).trim();
  if (!text) return null;
  const asNumber = Number(text);
  if (Number.isFinite(asNumber) && asNumber > 0) return epochToMs(asNumber);
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function emailFromTokens(tokens) {
  const idEmail = tokens?.id_token ? extractEmail(tokens.id_token) : null;
  if (idEmail && idEmail !== 'local-codex-account') return idEmail;
  const accessPayload = decodeJwtPayload(tokens?.access_token) || {};
  return accessPayload?.['https://api.openai.com/profile']?.email || null;
}

function userIdFromTokens(tokens) {
  const tokenInfo = extractAuthInfo(tokens || {});
  if (tokenInfo.userId) return tokenInfo.userId;
  const idPayload = decodeJwtPayload(tokens?.id_token) || {};
  return idPayload.sub || null;
}

function authTokensFromObject(auth, fallbackAccount = null) {
  const source = auth?.tokens || auth || {};
  const idToken = source.id_token || source.idToken || fallbackAccount?.tokens?.id_token || null;
  const accessToken = source.access_token || source.accessToken || null;
  const refreshToken = source.refresh_token || source.refreshToken || null;
  if (!accessToken) return null;
  return {
    id_token: idToken,
    access_token: accessToken,
    refresh_token: refreshToken,
    account_id: source.account_id || source.accountId || auth?.account_id || auth?.accountId || auth?.account?.id || null,
  };
}

function buildOfficialAuthSnapshot(auth, fallbackAccount = null) {
  if (!auth || auth.auth_mode === 'apikey' || auth.OPENAI_API_KEY) return null;
  const tokens = authTokensFromObject(auth, fallbackAccount);
  if (!tokens?.access_token || !tokens?.id_token) return null;

  const tokenInfo = extractAuthInfo(tokens);
  const accountId = normalizeOptional(
    tokens.account_id ||
    extractAccountId(tokens.access_token, tokens.id_token) ||
    auth.account_id ||
    auth.accountId ||
    auth.account?.id
  );
  const email = normalizeOptional(
    auth.email ||
    auth.user?.email ||
    emailFromTokens(tokens) ||
    fallbackAccount?.email
  );
  if (!email) return null;

  return {
    tokens: {
      id_token: tokens.id_token,
      access_token: tokens.access_token,
      refresh_token: normalizeOptional(tokens.refresh_token),
    },
    email,
    accountId,
    userId: normalizeOptional(auth.user_id || auth.userId || auth.user?.id || tokenInfo.userId || userIdFromTokens(tokens)),
    planType: normalizeOptional(auth.plan_type || auth.planType || auth.account?.planType || tokenInfo.planType),
    subscriptionActiveUntil: normalizeOptional(
      auth.subscription_active_until ||
      auth.subscriptionActiveUntil ||
      auth.account?.subscription_active_until ||
      auth.account?.subscriptionActiveUntil ||
      tokenInfo.subscriptionActiveUntil
    ),
    lastRefreshAt: parseLastRefreshMs(auth.last_refresh || auth.lastRefresh || auth.updated_at || auth.updatedAt),
  };
}

function officialSnapshotMatchesAccount(snapshot, account) {
  if (!snapshot || !account) return false;
  if (snapshot.email && account.email && snapshot.email.toLowerCase() !== account.email.toLowerCase()) {
    return false;
  }

  const accountId = normalizeOptional(account.accountId || account.account_id);
  if (snapshot.accountId && accountId && snapshot.accountId !== accountId) return false;

  const userId = normalizeOptional(account.userId || account.user_id);
  if (snapshot.userId && userId && snapshot.userId !== userId) return false;

  return Boolean(snapshot.email || snapshot.accountId || snapshot.userId);
}

function officialSnapshotHasTokenDelta(account, snapshot) {
  if (!account?.tokens || !snapshot?.tokens) return false;
  return (
    (snapshot.tokens.id_token && account.tokens.id_token !== snapshot.tokens.id_token) ||
    (snapshot.tokens.access_token && account.tokens.access_token !== snapshot.tokens.access_token) ||
    (snapshot.tokens.refresh_token && normalizeOptional(account.tokens.refresh_token) !== snapshot.tokens.refresh_token)
  );
}

function shouldAcceptOfficialSnapshot(account, snapshot, { allowStale = false } = {}) {
  if (!officialSnapshotHasTokenDelta(account, snapshot)) return false;
  if (allowStale) return true;

  const accountUpdatedAt = epochToMs(account.tokenUpdatedAt || account.token_updated_at) || 0;
  if (snapshot.lastRefreshAt && snapshot.lastRefreshAt + 5_000 >= accountUpdatedAt) return true;

  const accountExpired = isTokenExpired(account.tokens.access_token);
  const snapshotFresh = !isTokenExpired(snapshot.tokens.access_token);
  if (accountExpired && snapshotFresh) return true;

  const accountExp = tokenExpMs(account.tokens.access_token);
  const snapshotExp = tokenExpMs(snapshot.tokens.access_token);
  if (snapshotExp && accountExp && snapshotExp > accountExp + TOKEN_REFRESH_SKEW_MS) return true;

  return false;
}

function applyOfficialSnapshot(account, snapshot) {
  let changed = false;
  let tokenChanged = false;
  const nextTokens = { ...(account.tokens || {}) };

  if (snapshot.tokens.id_token && nextTokens.id_token !== snapshot.tokens.id_token) {
    nextTokens.id_token = snapshot.tokens.id_token;
    changed = true;
    tokenChanged = true;
  }
  if (snapshot.tokens.access_token && nextTokens.access_token !== snapshot.tokens.access_token) {
    nextTokens.access_token = snapshot.tokens.access_token;
    changed = true;
    tokenChanged = true;
  }
  if (snapshot.tokens.refresh_token && normalizeOptional(nextTokens.refresh_token) !== snapshot.tokens.refresh_token) {
    nextTokens.refresh_token = snapshot.tokens.refresh_token;
    changed = true;
    tokenChanged = true;
  }

  if (changed) account.tokens = nextTokens;
  if (snapshot.accountId && normalizeOptional(account.accountId) !== snapshot.accountId) {
    account.accountId = snapshot.accountId;
    changed = true;
  }
  if (snapshot.userId && normalizeOptional(account.userId) !== snapshot.userId) {
    account.userId = snapshot.userId;
    changed = true;
  }
  if (snapshot.planType && normalizeOptional(account.planType) !== snapshot.planType) {
    account.planType = snapshot.planType;
    changed = true;
  }
  if (snapshot.subscriptionActiveUntil && normalizeOptional(account.subscriptionActiveUntil) !== snapshot.subscriptionActiveUntil) {
    account.subscriptionActiveUntil = snapshot.subscriptionActiveUntil;
    changed = true;
  }

  if (tokenChanged) {
    account.tokenGeneration = Number(account.tokenGeneration ?? account.token_generation ?? 0) + 1;
    account.tokenUpdatedAt = snapshot.lastRefreshAt || nowMs();
    account.tokenSourceMode = 'managed';
    account.requiresReauth = false;
    account.reauthReason = null;
  }
  if (changed) account.updatedAt = nowMs();
  return changed;
}

function extractTokenErrorCode(bodyText) {
  try {
    const value = JSON.parse(bodyText);
    const direct = typeof value?.error === 'string' ? value.error : null;
    return (
      direct ||
      value?.error?.code ||
      value?.code ||
      value?.error_code ||
      null
    );
  } catch {
    return null;
  }
}

export function isReauthRequiredRefreshError(message) {
  const lower = String(message || '').toLowerCase();
  return REFRESH_REAUTH_PATTERNS.some((pattern) => lower.includes(pattern));
}

function formatRefreshFailure(status, bodyText) {
  const code = extractTokenErrorCode(bodyText);
  return `刷新 token 失败: status=${status}${code ? `, error_code=${code}` : ''}, body_len=${bodyText.length}`;
}

async function requestTokenRefresh(refreshToken, currentIdToken) {
  const jsonResp = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  const jsonText = await jsonResp.text();
  if (!jsonResp.ok) {
    const code = String(extractTokenErrorCode(jsonText) || '').toLowerCase();
    const lower = jsonText.toLowerCase();
    const canFallbackToForm = [400, 415].includes(Number(jsonResp.status)) &&
      !isReauthRequiredRefreshError(code || lower) &&
      /unsupported|content-type|invalid_request|json|parse/.test(lower);
    if (!canFallbackToForm) {
      throw new Error(formatRefreshFailure(jsonResp.status, jsonText));
    }

    const formBody = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    });
    const formResp = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: formBody,
    });
    const formText = await formResp.text();
    if (!formResp.ok) throw new Error(formatRefreshFailure(formResp.status, formText));
    return parseTokenRefreshResponse(formText, refreshToken, currentIdToken);
  }

  return parseTokenRefreshResponse(jsonText, refreshToken, currentIdToken);
}

function parseTokenRefreshResponse(text, refreshToken, currentIdToken) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`解析 token 刷新响应失败: ${err.message}`);
  }
  if (!data.access_token) throw new Error('刷新 token 响应缺少 access_token');
  return {
    id_token: data.id_token || currentIdToken,
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
  };
}

async function reloadAccountForRefresh(account) {
  if (!account?.id) return account;
  const store = await loadAccountStore();
  return store.accounts.find((item) => item.id === account.id) || account;
}

async function withAccountTokenLock(account, fn) {
  const key = String(account?.id || account?.accountId || account?.email || 'default');
  const previous = accountTokenLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  const chained = previous.catch(() => {}).then(() => current);
  accountTokenLocks.set(key, chained);
  await previous.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
    if (accountTokenLocks.get(key) === chained) accountTokenLocks.delete(key);
  }
}

function normalizeStore(raw) {
  if (raw && Array.isArray(raw.accounts)) {
    return {
      version: raw.version || 1,
      currentAccountId: raw.currentAccountId || raw.accounts[0]?.id || null,
      accounts: raw.accounts,
    };
  }
  return { version: 1, currentAccountId: null, accounts: [] };
}

async function migrateLegacyAccountIfNeeded(store) {
  if (store.accounts.length > 0) return store;
  const legacy = await readJson(ACCOUNT_PATH, null);
  if (!legacy?.tokens?.access_token || !legacy?.tokens?.id_token) return store;
  const account = {
    id: legacy.id || buildAccountId({
      email: legacy.email,
      accountId: legacy.accountId,
      idToken: legacy.tokens.id_token,
      accessToken: legacy.tokens.access_token,
    }),
    ...legacy,
    importedAt: legacy.importedAt || nowMs(),
    updatedAt: legacy.updatedAt || nowMs(),
  };
  store.accounts.push(account);
  store.currentAccountId = account.id;
  await saveAccountStore(store);
  return store;
}

export async function loadAccountStore() {
  const store = normalizeStore(await readJson(ACCOUNTS_PATH, null));
  return await migrateLegacyAccountIfNeeded(store);
}

export async function saveAccountStore(store) {
  await writeJson(ACCOUNTS_PATH, normalizeStore(store));
}

async function saveCurrentProjection(account) {
  if (account) await writeJson(ACCOUNT_PATH, account);
}

function accountFromAuthObject(auth, importedFrom = 'json') {
  if (!auth) throw new Error('导入内容为空');
  if (auth.auth_mode === 'apikey' || auth.OPENAI_API_KEY) {
    throw new Error('API Key 模式暂不支持导入到账号池，请使用 OAuth tokens');
  }

  const tokens = auth.tokens || auth;
  if (!tokens?.access_token || !tokens?.id_token) {
    throw new Error('导入内容缺少 tokens.access_token / tokens.id_token');
  }

  const tokenInfo = extractAuthInfo(tokens);
  const email = auth.email || extractEmail(tokens.id_token);
  const accountId = auth.accountId || auth.account_id || tokens.account_id || extractAccountId(tokens.access_token, tokens.id_token) || null;
  const account = {
    id: auth.id || buildAccountId({ email, accountId, idToken: tokens.id_token, accessToken: tokens.access_token }),
    sourceId: auth.sourceId || auth.id || null,
    email,
    accountId,
    authMode: auth.authMode || auth.auth_mode || 'oauth',
    authProvider: auth.authProvider || auth.auth_provider || tokenInfo.authProvider,
    userId: auth.userId || auth.user_id || tokenInfo.userId,
    teamName: auth.teamName || auth.team_name || tokenInfo.teamName || '个人账户',
    accountName: auth.accountName || auth.account_name || null,
    accountStructure: auth.accountStructure || auth.account_structure || 'personal',
    planType: auth.planType || auth.plan_type || tokenInfo.planType,
    subscriptionActiveUntil: auth.subscriptionActiveUntil || auth.subscription_active_until || tokenInfo.subscriptionActiveUntil,
    tokenGeneration: Number(auth.tokenGeneration ?? auth.token_generation ?? 0) || 0,
    tokenSourceMode: auth.tokenSourceMode || auth.token_source_mode || 'managed',
    requiresReauth: Boolean(auth.requiresReauth || auth.requires_reauth),
    reauthReason: auth.reauthReason || auth.reauth_reason || null,
    tags: Array.isArray(auth.tags) ? auth.tags : null,
    tokens: {
      id_token: tokens.id_token,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
    },
    quota: auth.quota || null,
    quotaError: auth.quotaError || auth.quota_error || null,
    usageUpdatedAt: epochToMs(auth.usageUpdatedAt || auth.usage_updated_at),
    tokenUpdatedAt: epochToMs(auth.tokenUpdatedAt || auth.token_updated_at),
    createdAt: epochToMs(auth.createdAt || auth.created_at),
    lastUsedAt: epochToMs(auth.lastUsedAt || auth.last_used),
    importedFrom,
    importedAt: auth.importedAt || nowMs(),
    updatedAt: nowMs(),
  };
  return account;
}

function findAccountIndex(accounts, account) {
  return accounts.findIndex((item) => {
    if (item.id === account.id) return true;
    if (account.accountId && item.accountId === account.accountId) return true;
    // 兼容从不同来源导入同一个账号：Cockpit 常用 codex_xxx 作为 id，
    // 本项目从 ~/.codex/auth.json 导入时会生成 acct_xxx。
    if (account.email && item.email === account.email) return true;
    return false;
  });
}

async function upsertAccounts(accounts, makeCurrentSourceId = null) {
  const store = await loadAccountStore();
  const imported = [];
  let resolvedCurrentId = null;

  for (const account of accounts) {
    const index = findAccountIndex(store.accounts, account);
    let saved;
    if (index >= 0) {
      const previous = store.accounts[index];
      saved = {
        ...previous,
        ...account,
        // 如果是同一账号从不同来源重复导入，保留本项目已有 id，避免 UI 选择失效。
        id: previous.id,
        sourceId: previous.sourceId || account.sourceId || (account.id !== previous.id ? account.id : null),
        importedAt: previous.importedAt || account.importedAt,
        updatedAt: nowMs(),
      };
      store.accounts[index] = saved;
    } else {
      saved = account;
      store.accounts.push(saved);
    }

    imported.push(accountSummary(saved));
    if (makeCurrentSourceId && (account.id === makeCurrentSourceId || saved.id === makeCurrentSourceId)) {
      resolvedCurrentId = saved.id;
    }
  }

  if (makeCurrentSourceId) store.currentAccountId = resolvedCurrentId || makeCurrentSourceId;
  if (!store.currentAccountId && store.accounts.length > 0) store.currentAccountId = store.accounts[0].id;

  await saveAccountStore(store);
  const current = store.accounts.find((item) => item.id === store.currentAccountId) || store.accounts[0] || null;
  if (current) await saveCurrentProjection(current);

  const result = {
    imported,
    currentAccountId: store.currentAccountId,
    currentAccount: current ? accountSummary(current) : null,
  };
  Object.defineProperty(result, 'currentAccountRaw', { value: current, enumerable: false });
  return result;
}

async function upsertAccount(account, makeCurrent = true) {
  const result = await upsertAccounts([account], makeCurrent ? account.id : null);
  if (makeCurrent) return result.currentAccountRaw;

  const store = await loadAccountStore();
  return store.accounts.find((item) => item.id === result.imported[0]?.id) || account;
}

export async function importFromCodexAuth() {
  const authPath = path.join(codexHome(), 'auth.json');
  const auth = await readJson(authPath, null);
  if (!auth) throw new Error(`未找到或无法解析 ${authPath}`);
  const account = accountFromAuthObject(auth, authPath);
  return await upsertAccount(account, true);
}

export async function importFromOAuthTokens(tokens, metadata = {}) {
  const account = accountFromAuthObject({
    ...metadata,
    tokens,
    authMode: 'oauth',
    auth_mode: 'oauth',
  }, metadata.importedFrom || 'oauth');
  return await upsertAccount(account, true);
}

export async function importFromJsonContent(jsonContent) {
  let parsed;
  try {
    parsed = typeof jsonContent === 'string' ? JSON.parse(jsonContent) : jsonContent;
  } catch (err) {
    throw new Error(`JSON 解析失败: ${err.message}`);
  }
  const items = Array.isArray(parsed)
    ? parsed
    : (Array.isArray(parsed?.accounts) ? parsed.accounts : [parsed]);
  if (!items.length) throw new Error('没有找到可导入的账号');

  const accounts = items.map((item, index) => {
    try {
      return accountFromAuthObject(item, 'pasted-json');
    } catch (err) {
      throw new Error(`第 ${index + 1} 个账号导入失败: ${err.message}`);
    }
  });

  return await upsertAccounts(accounts, accounts[accounts.length - 1]?.id || null);
}

export async function exportAccounts(accountIds = []) {
  const store = await loadAccountStore();
  const requested = Array.isArray(accountIds)
    ? accountIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  const selected = requested.length
    ? requested.map((id) => store.accounts.find((item) => item.id === id || item.sourceId === id)).filter(Boolean)
    : store.accounts;
  if (!selected.length) throw new Error('没有找到可导出的账号');
  return selected.map(accountExportObject);
}

export async function listAccounts() {
  const store = await loadAccountStore();
  return {
    currentAccountId: store.currentAccountId,
    accounts: store.accounts.map(accountSummary),
  };
}

export async function loadAccount() {
  let store = await loadAccountStore();
  if (store.accounts.length === 0) {
    await importFromCodexAuth();
    store = await loadAccountStore();
  }
  const account = store.accounts.find((item) => item.id === store.currentAccountId) || store.accounts[0];
  if (!account) throw new Error('没有可用 Codex 账号，请先导入账号');
  if (store.currentAccountId !== account.id) {
    store.currentAccountId = account.id;
    await saveAccountStore(store);
  }
  await saveCurrentProjection(account);
  return account;
}

export async function getAccountById(accountId) {
  const store = await loadAccountStore();
  const account = store.accounts.find((item) => item.id === accountId);
  if (!account) throw new Error(`账号不存在: ${accountId}`);
  return account;
}

export async function setCurrentAccount(accountId) {
  const store = await loadAccountStore();
  const account = store.accounts.find((item) => item.id === accountId);
  if (!account) throw new Error(`账号不存在: ${accountId}`);
  store.currentAccountId = account.id;
  account.lastUsedAt = nowMs();
  await saveAccountStore(store);
  await saveCurrentProjection(account);
  return account;
}

export async function deleteAccount(accountId) {
  const store = await loadAccountStore();
  const before = store.accounts.length;
  store.accounts = store.accounts.filter((item) => item.id !== accountId);
  if (store.accounts.length === before) throw new Error(`账号不存在: ${accountId}`);
  if (store.currentAccountId === accountId) {
    store.currentAccountId = store.accounts[0]?.id || null;
  }
  await saveAccountStore(store);
  const current = store.accounts.find((item) => item.id === store.currentAccountId) || null;
  if (current) await saveCurrentProjection(current);
  return { currentAccountId: store.currentAccountId, deletedAccountId: accountId };
}

export async function saveAccount(account) {
  const store = await loadAccountStore();
  const index = findAccountIndex(store.accounts, account);
  if (index >= 0) {
    store.accounts[index] = {
      ...store.accounts[index],
      ...account,
      updatedAt: nowMs(),
    };
  } else {
    store.accounts.push({
      ...account,
      updatedAt: nowMs(),
      importedAt: account.importedAt || nowMs(),
    });
  }
  if (!store.currentAccountId) store.currentAccountId = account.id;
  await saveAccountStore(store);
  const current = store.accounts.find((item) => item.id === store.currentAccountId);
  if (current) await saveCurrentProjection(current);
  return store.accounts.find((item) => item.id === account.id) || account;
}

export async function syncAccountFromOfficialAuthSnapshot(account, options = {}) {
  const authPath = path.join(codexHome(), 'auth.json');
  const auth = await readJson(authPath, null);
  const snapshot = buildOfficialAuthSnapshot(auth, account);
  if (!snapshot) return { account, changed: false, reason: 'no_oauth_snapshot' };
  if (!officialSnapshotMatchesAccount(snapshot, account)) {
    return { account, changed: false, reason: 'account_mismatch' };
  }
  if (!shouldAcceptOfficialSnapshot(account, snapshot, options)) {
    return { account, changed: false, reason: 'snapshot_not_newer' };
  }

  const next = { ...account, tokens: { ...(account.tokens || {}) } };
  if (!applyOfficialSnapshot(next, snapshot)) {
    return { account, changed: false, reason: 'unchanged' };
  }
  const saved = options.save === false ? next : await saveAccount(next);
  return {
    account: saved,
    changed: true,
    source: authPath,
    tokenGeneration: saved.tokenGeneration ?? saved.token_generation ?? null,
  };
}

export function isManagedAuthRefreshDue(account) {
  if (!account?.tokens?.access_token) return false;
  if (isTokenExpired(account.tokens.access_token)) return true;
  const tokenUpdatedAt = epochToMs(account.tokenUpdatedAt || account.token_updated_at) || 0;
  return tokenUpdatedAt <= nowMs() - PROACTIVE_REFRESH_INTERVAL_MS;
}

async function markAccountRequiresReauth(account, reason) {
  account.requiresReauth = true;
  account.reauthReason = reason;
  account.updatedAt = nowMs();
  return await saveAccount(account);
}

async function performTokenRefresh(account, reason = 'refresh') {
  const refreshToken = normalizeOptional(account.tokens?.refresh_token);
  if (!refreshToken) {
    const message = 'access_token 已过期且没有 refresh_token，请先重新登录 Codex';
    await markAccountRequiresReauth(account, message);
    throw new Error(message);
  }

  try {
    const refreshedTokens = await requestTokenRefresh(refreshToken, account.tokens.id_token);
    account.tokens = refreshedTokens;
    account.accountId = account.accountId || extractAccountId(account.tokens.access_token, account.tokens.id_token) || null;
    const tokenInfo = extractAuthInfo(account.tokens);
    account.authProvider = account.authProvider || tokenInfo.authProvider;
    account.userId = account.userId || tokenInfo.userId;
    account.teamName = account.teamName || tokenInfo.teamName || '个人账户';
    account.planType = tokenInfo.planType || account.planType;
    account.subscriptionActiveUntil = tokenInfo.subscriptionActiveUntil || account.subscriptionActiveUntil;
    account.tokenGeneration = Number(account.tokenGeneration ?? account.token_generation ?? 0) + 1;
    account.tokenUpdatedAt = nowMs();
    account.tokenSourceMode = 'managed';
    account.requiresReauth = false;
    account.reauthReason = null;
    account.refreshReason = reason;
    account.updatedAt = nowMs();
    return await saveAccount(account);
  } catch (err) {
    const message = String(err?.message || err);
    if (isReauthRequiredRefreshError(message)) {
      await markAccountRequiresReauth(account, message);
    }
    throw err;
  }
}

async function refreshAccountLocked(account, force = false, reason = force ? 'force' : 'prepare') {
  account = await reloadAccountForRefresh(account);
  if (!account?.tokens?.access_token) return account;

  const snapshotBefore = await syncAccountFromOfficialAuthSnapshot(account).catch((err) => ({
    account,
    changed: false,
    error: err,
  }));
  account = snapshotBefore.account || account;

  if (account.requiresReauth) {
    throw new Error(account.reauthReason || '账号需要重新登录 Codex');
  }
  if (!force && !isTokenExpired(account.tokens.access_token)) return account;

  const refreshTokenBefore = normalizeOptional(account.tokens.refresh_token);
  try {
    return await performTokenRefresh(account, reason);
  } catch (err) {
    const synced = await syncAccountFromOfficialAuthSnapshot(account).catch(() => null);
    const syncedAccount = synced?.account || null;
    const refreshTokenAfter = normalizeOptional(syncedAccount?.tokens?.refresh_token);
    if (synced?.changed && refreshTokenAfter && refreshTokenAfter !== refreshTokenBefore) {
      if (!force && !isTokenExpired(syncedAccount.tokens.access_token)) return syncedAccount;
      return await performTokenRefresh(syncedAccount, `${reason}:retry-after-official-snapshot`);
    }
    throw err;
  }
}

export async function refreshAccountIfNeeded(account, force = false) {
  return await withAccountTokenLock(account, async () => refreshAccountLocked(account, force));
}

export async function keepaliveAccount(accountId, reason = 'TokenKeeper 授权保活') {
  const account = await getAccountById(accountId);
  return await withAccountTokenLock(account, async () => {
    const latest = await reloadAccountForRefresh(account);
    if (!isManagedAuthRefreshDue(latest)) {
      await syncAccountFromOfficialAuthSnapshot(latest).catch(() => null);
      const afterSync = await reloadAccountForRefresh(latest);
      if (!isManagedAuthRefreshDue(afterSync)) return afterSync;
    }
    return await refreshAccountLocked(latest, true, reason);
  });
}
