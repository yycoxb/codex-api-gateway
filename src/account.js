import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { ACCOUNT_PATH, ACCOUNTS_PATH, CLIENT_ID, TOKEN_ENDPOINT } from './constants.js';
import { readJson, writeJson } from './storage.js';
import { nowMs } from './utils.js';
import { decodeJwtPayload, extractAccountId, extractEmail, isTokenExpired } from './jwt.js';

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

export async function refreshAccountIfNeeded(account, force = false) {
  if (!force && !isTokenExpired(account.tokens.access_token)) return account;

  const refreshToken = account.tokens.refresh_token;
  if (!refreshToken) {
    throw new Error('access_token 已过期且没有 refresh_token，请先重新登录 Codex');
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
  });
  const resp = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`刷新 token 失败: status=${resp.status}, body_len=${text.length}`);
  }

  const data = JSON.parse(text);
  account.tokens = {
    id_token: data.id_token || account.tokens.id_token,
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
  };
  account.accountId = account.accountId || extractAccountId(account.tokens.access_token, account.tokens.id_token) || null;
  const tokenInfo = extractAuthInfo(account.tokens);
  account.authProvider = account.authProvider || tokenInfo.authProvider;
  account.userId = account.userId || tokenInfo.userId;
  account.teamName = account.teamName || tokenInfo.teamName || '个人账户';
  account.planType = tokenInfo.planType || account.planType;
  account.subscriptionActiveUntil = tokenInfo.subscriptionActiveUntil || account.subscriptionActiveUntil;
  account.tokenGeneration = Number(account.tokenGeneration ?? account.token_generation ?? 0) + 1;
  account.tokenUpdatedAt = nowMs();
  account.updatedAt = nowMs();

  return await saveAccount(account);
}
