import fs from 'node:fs/promises';
import path from 'node:path';
import { codexHome, getAccountById, listAccounts, refreshAccountIfNeeded, setCurrentAccount } from './account.js';
import { getLastCodexAppRestartResult, listCodexProcesses } from './codex-process.js';
import { decodeJwtPayload, extractAccountId, extractEmail } from './jwt.js';
import { nowMs } from './utils.js';

const AUTH_FILE = 'auth.json';
const CONFIG_FILE = 'config.toml';
const PROJECTION_FILE = '.cockpit_codex_auth.json';
const PROJECTION_WRITER = 'cockpit';
const API_SERVICE_PROVIDER_ID = 'codex_local_access';
const API_SERVICE_PROVIDER_NAME = 'Codex API Service';
const CONTEXT_WINDOW_1M = 1_000_000;
const AUTO_COMPACT_DEFAULT_LIMIT = 900_000;

function paths() {
  const home = codexHome();
  return {
    codexHome: home,
    authPath: path.join(home, AUTH_FILE),
    configPath: path.join(home, CONFIG_FILE),
    projectionPath: path.join(home, PROJECTION_FILE),
  };
}

async function readTextIfExists(file) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return '';
  }
}

async function readJsonIfExists(file) {
  try {
    return JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function writeTextAtomic(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, file);
}

async function backupFile(file) {
  if (!(await exists(file))) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${file}.bak.${stamp}`;
  await fs.copyFile(file, backupPath);
  return backupPath;
}

function buildAuthFileValue(account) {
  if (account.authMode === 'apikey' || account.openaiApiKey || account.openai_api_key) {
    const apiKey = account.openaiApiKey || account.openai_api_key;
    if (!apiKey) throw new Error('API Key 账号缺少 OPENAI_API_KEY');
    return {
      auth_mode: 'apikey',
      OPENAI_API_KEY: apiKey,
    };
  }

  if (!account.tokens?.id_token || !account.tokens?.access_token) {
    throw new Error('OAuth 账号缺少 id_token/access_token，无法写入 Codex App auth.json');
  }

  return {
    OPENAI_API_KEY: null,
    tokens: {
      id_token: account.tokens.id_token,
      access_token: account.tokens.access_token,
      refresh_token: account.tokens.refresh_token || null,
      account_id: account.accountId || null,
    },
    last_refresh: new Date().toISOString(),
  };
}

function buildProjection(account) {
  return {
    version: 1,
    writer: PROJECTION_WRITER,
    account_id: account.id,
    email: account.email,
    token_generation: account.tokenGeneration || account.token_generation || null,
    written_at: Math.floor(Date.now() / 1000),
  };
}

function authInfoFromAuthJson(auth) {
  if (!auth || typeof auth !== 'object') return null;
  if (auth.auth_mode === 'apikey' || auth.OPENAI_API_KEY) {
    return {
      authMode: 'apikey',
      email: 'API Key',
      accountId: null,
    };
  }
  const tokens = auth.tokens || auth;
  const idToken = tokens?.id_token;
  const accessToken = tokens?.access_token;
  if (!idToken || !accessToken) return null;
  const idPayload = decodeJwtPayload(idToken) || {};
  const authPayload = idPayload['https://api.openai.com/auth'] || {};
  return {
    authMode: 'oauth',
    email: extractEmail(idToken),
    accountId: tokens.account_id || extractAccountId(accessToken, idToken),
    userId: authPayload.chatgpt_user_id || authPayload.user_id || idPayload.sub || null,
    planType: authPayload.chatgpt_plan_type || null,
  };
}

function splitTopLevelToml(toml) {
  const text = String(toml || '');
  const match = /^\s*\[[^\]]+\]/m.exec(text);
  if (!match) return { head: text, rest: '' };
  return { head: text.slice(0, match.index), rest: text.slice(match.index) };
}

function insertTopLevelLine(toml, line) {
  const parts = splitTopLevelToml(toml);
  const head = parts.head.trimEnd();
  const rest = parts.rest.trimStart();
  if (rest) return `${head ? `${head}\n` : ''}${line}\n\n${rest}`;
  return (head ? `${head}\n` : '') + `${line}\n`;
}

function parseTopLevelInt(toml, key) {
  const re = new RegExp(`^\\s*${key}\\s*=\\s*([0-9]+)\\s*$`, 'm');
  const match = splitTopLevelToml(toml).head.match(re);
  return match ? Number(match[1]) : null;
}

function setTopLevelValue(toml, key, value) {
  const re = new RegExp(`^\\s*${key}\\s*=.*$`, 'm');
  const parts = splitTopLevelToml(toml);
  if (value === null || value === undefined || value === '') {
    const head = parts.head.replace(re, '').replace(/\n{3,}/g, '\n\n').trimEnd();
    return (head ? `${head}\n` : '') + (parts.rest ? `${head ? '\n' : ''}${parts.rest.trimStart()}` : '');
  }
  const line = `${key} = ${Number(value)}`;
  if (re.test(parts.head)) return parts.head.replace(re, line) + parts.rest;
  return insertTopLevelLine(toml, line);
}


function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tomlString(value) {
  return `"${String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function removeTopLevelKey(toml, key) {
  const parts = splitTopLevelToml(toml);
  const re = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=.*(?:\\r?\\n|$)`, 'gm');
  return parts.head.replace(re, '') + parts.rest;
}

function setTopLevelString(toml, key, value) {
  const line = `${key} = ${tomlString(value)}`;
  const re = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=.*$`, 'm');
  const parts = splitTopLevelToml(toml);
  if (re.test(parts.head)) return parts.head.replace(re, line) + parts.rest;
  return insertTopLevelLine(toml, line);
}

function providerSectionRegExp(providerId) {
  return new RegExp(
    `(?:^|\\r?\\n)\\s*\\[model_providers\\.${escapeRegExp(providerId)}\\]\\s*(?:\\r?\\n)[\\s\\S]*?(?=\\r?\\n\\s*\\[[^\\]]+\\]|\\s*$)`,
  );
}

function removeProviderSection(toml, providerId) {
  const text = String(toml || '');
  const lines = text.split(/\r?\n/);
  const sectionRe = new RegExp(`^\\s*\\[\\s*model_providers\\.${escapeRegExp(providerId)}\\s*\\]\\s*$`);
  const anySectionRe = /^\s*\[[^\]]+\]\s*$/;
  const output = [];
  let skipping = false;

  for (const line of lines) {
    if (sectionRe.test(line)) {
      skipping = true;
      continue;
    }
    if (skipping && anySectionRe.test(line)) {
      skipping = false;
    }
    if (!skipping) output.push(line);
  }

  return output.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

function readTopLevelString(toml, key) {
  const re = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*["']([^"']*)["']\\s*$`, 'm');
  return splitTopLevelToml(toml).head.match(re)?.[1] || null;
}

function readProviderField(toml, providerId, field) {
  const match = String(toml || '').match(providerSectionRegExp(providerId));
  if (!match) return null;
  const re = new RegExp(`^\\s*${escapeRegExp(field)}\\s*=\\s*["']([^"']*)["']\\s*$`, 'm');
  return match[0].match(re)?.[1] || null;
}

function readProviderBool(toml, providerId, field) {
  const match = String(toml || '').match(providerSectionRegExp(providerId));
  if (!match) return null;
  const re = new RegExp(`^\\s*${escapeRegExp(field)}\\s*=\\s*(true|false)\\s*$`, 'm');
  const value = match[0].match(re)?.[1];
  return value == null ? null : value === 'true';
}

function buildApiServiceProviderSection(baseUrl) {
  return [
    `[model_providers.${API_SERVICE_PROVIDER_ID}]`,
    `name = ${tomlString(API_SERVICE_PROVIDER_NAME)}`,
    `base_url = ${tomlString(baseUrl)}`,
    'wire_api = "responses"',
    'requires_openai_auth = true',
    '',
  ].join('\n');
}

async function writeOpenAiBuiltinConfig() {
  const { configPath } = paths();
  let content = await readTextIfExists(configPath);
  content = removeTopLevelKey(content, 'model_provider');
  content = removeTopLevelKey(content, 'openai_base_url');
  content = removeProviderSection(content, API_SERVICE_PROVIDER_ID);
  await writeTextAtomic(configPath, content.trimEnd() ? `${content.trimEnd()}\n` : '');
}

async function writeApiServiceConfig(baseUrl) {
  const { configPath } = paths();
  let content = await readTextIfExists(configPath);
  content = removeTopLevelKey(content, 'openai_base_url');
  content = setTopLevelString(content, 'model_provider', API_SERVICE_PROVIDER_ID);
  content = removeProviderSection(content, API_SERVICE_PROVIDER_ID);
  content = `${content.trimEnd()}\n\n${buildApiServiceProviderSection(baseUrl)}`.trimStart();
  await writeTextAtomic(configPath, content.endsWith('\n') ? content : `${content}\n`);
}

export async function readCodexProviderConfig() {
  const { configPath } = paths();
  const content = await readTextIfExists(configPath);
  const modelProvider = readTopLevelString(content, 'model_provider');
  return {
    modelProvider,
    openaiBaseUrl: readTopLevelString(content, 'openai_base_url'),
    providerName: modelProvider ? readProviderField(content, modelProvider, 'name') : null,
    providerBaseUrl: modelProvider ? readProviderField(content, modelProvider, 'base_url') : null,
    wireApi: modelProvider ? readProviderField(content, modelProvider, 'wire_api') : null,
    requiresOpenaiAuth: modelProvider ? readProviderBool(content, modelProvider, 'requires_openai_auth') : null,
  };
}

export async function readCodexQuickConfig() {
  const { configPath } = paths();
  const content = await readTextIfExists(configPath);
  const modelContextWindow = parseTopLevelInt(content, 'model_context_window');
  const autoCompactTokenLimit = parseTopLevelInt(content, 'model_auto_compact_token_limit');
  return {
    configPath,
    contextWindow1m: modelContextWindow === CONTEXT_WINDOW_1M,
    autoCompactTokenLimit: autoCompactTokenLimit || AUTO_COMPACT_DEFAULT_LIMIT,
    detectedModelContextWindow: modelContextWindow,
    detectedAutoCompactTokenLimit: autoCompactTokenLimit,
  };
}

export async function saveCodexQuickConfig({ contextWindow1m, autoCompactTokenLimit }) {
  const { configPath } = paths();
  let content = await readTextIfExists(configPath);
  content = setTopLevelValue(content, 'model_context_window', contextWindow1m ? CONTEXT_WINDOW_1M : null);
  const compact = Number(autoCompactTokenLimit || AUTO_COMPACT_DEFAULT_LIMIT);
  if (!Number.isFinite(compact) || compact <= 0) throw new Error('自动压缩阈值必须大于 0');
  content = setTopLevelValue(content, 'model_auto_compact_token_limit', compact);
  await writeTextAtomic(configPath, content);
  return await readCodexQuickConfig();
}

export async function getCodexAppState() {
  const p = paths();
  const auth = await readJsonIfExists(p.authPath);
  const appAuth = authInfoFromAuthJson(auth);
  const providerConfig = await readCodexProviderConfig();
  const accountList = await listAccounts();
  const matched = appAuth
    ? accountList.accounts.find((account) => {
        if (appAuth.accountId && account.accountId === appAuth.accountId) return true;
        if (appAuth.email && account.email === appAuth.email) return true;
        return false;
      })
    : null;
  const apiServiceActive = appAuth?.authMode === 'apikey'
    && providerConfig.modelProvider === API_SERVICE_PROVIDER_ID
    && providerConfig.wireApi === 'responses';

  return {
    ok: true,
    ...p,
    authExists: await exists(p.authPath),
    configExists: await exists(p.configPath),
    projectionExists: await exists(p.projectionPath),
    appAuth,
    matchedGatewayAccountId: matched?.id || null,
    providerConfig,
    apiService: {
      active: apiServiceActive,
      providerId: API_SERVICE_PROVIDER_ID,
      providerName: API_SERVICE_PROVIDER_NAME,
      baseUrl: providerConfig.providerBaseUrl || null,
    },
    quickConfig: await readCodexQuickConfig(),
    codexProcesses: await listCodexProcesses(),
    lastCodexAppRestart: getLastCodexAppRestartResult(),
  };
}

export async function switchCodexAppAccount(accountId, options = {}) {
  let account = await getAccountById(accountId);
  account = await refreshAccountIfNeeded(account);
  const p = paths();
  const authValue = buildAuthFileValue(account);
  const authBackupPath = options.backup === false ? null : await backupFile(p.authPath);
  await writeTextAtomic(p.authPath, JSON.stringify(authValue, null, 2));
  await writeOpenAiBuiltinConfig();
  await writeTextAtomic(p.projectionPath, JSON.stringify(buildProjection(account), null, 2));
  if (options.makeGatewayCurrent !== false) await setCurrentAccount(account.id);
  return {
    ok: true,
    account: {
      id: account.id,
      email: account.email,
      accountId: account.accountId,
    },
    authPath: p.authPath,
    projectionPath: p.projectionPath,
    authBackupPath,
    state: await getCodexAppState(),
    switchedAt: nowMs(),
  };
}

export async function activateCodexApiService({ apiKey, baseUrl, backup = true } = {}) {
  if (!apiKey || !String(apiKey).trim()) throw new Error('???? API Key');
  if (!baseUrl || !String(baseUrl).trim()) throw new Error('???? API Base URL');
  const p = paths();
  const authValue = {
    auth_mode: 'apikey',
    OPENAI_API_KEY: String(apiKey).trim(),
  };
  const authBackupPath = backup === false ? null : await backupFile(p.authPath);
  const configBackupPath = backup === false ? null : await backupFile(p.configPath);
  await writeTextAtomic(p.authPath, JSON.stringify(authValue, null, 2));
  await writeApiServiceConfig(String(baseUrl).trim());
  await writeTextAtomic(p.projectionPath, JSON.stringify({
    version: 1,
    writer: PROJECTION_WRITER,
    account_id: 'codex_local_access_runtime',
    email: 'api-service-local',
    token_generation: null,
    written_at: Math.floor(Date.now() / 1000),
  }, null, 2));
  return {
    ok: true,
    authPath: p.authPath,
    configPath: p.configPath,
    projectionPath: p.projectionPath,
    authBackupPath,
    configBackupPath,
    baseUrl: String(baseUrl).trim(),
    providerId: API_SERVICE_PROVIDER_ID,
    state: await getCodexAppState(),
    switchedAt: nowMs(),
  };
}

