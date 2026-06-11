import os from 'node:os';
import path from 'node:path';

export const APP_DIR = path.join(os.homedir(), '.codex-api-gateway');
export const CONFIG_PATH = path.join(APP_DIR, 'config.json');
export const ACCOUNT_PATH = path.join(APP_DIR, 'account.json');
export const ACCOUNTS_PATH = path.join(APP_DIR, 'accounts.json');
export const WAKEUP_HISTORY_PATH = path.join(APP_DIR, 'wakeup-history.json');
export const WAKEUP_SCHEDULE_PATH = path.join(APP_DIR, 'wakeup-schedule.json');
export const QUOTA_REFRESH_SCHEDULE_PATH = path.join(APP_DIR, 'quota-refresh-schedule.json');
export const TOKEN_KEEPER_PATH = path.join(APP_DIR, 'token-keeper.json');
export const LOCAL_ACCESS_PATH = path.join(APP_DIR, 'local-access.json');
export const LOCAL_ACCESS_STATS_PATH = path.join(APP_DIR, 'local-access-stats.json');
export const DEFAULT_PORT = Number(process.env.CODEX_GATEWAY_PORT || 18080);

export const UPSTREAM_BASE = 'https://chatgpt.com/backend-api/codex';
export const OPENAI_API_BASE = String(process.env.CODEX_GATEWAY_OPENAI_API_BASE || 'https://api.openai.com/v1').replace(/\/+$/, '');
export const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
export const TOKEN_ENDPOINT = 'https://auth.openai.com/oauth/token';
export const AUTH_ENDPOINT = 'https://auth.openai.com/oauth/authorize';
export const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
export const CODEX_OAUTH_SCOPES = 'openid profile email offline_access api.connectors.read api.connectors.invoke';
export const OAUTH_CALLBACK_PORT = Number(process.env.CODEX_GATEWAY_OAUTH_PORT || 1455);
export const OAUTH_PENDING_PATH = path.join(APP_DIR, 'codex-oauth-pending.json');
export const DEFAULT_CODEX_USER_AGENT = 'codex-tui/0.118.0 (standalone-gateway; node)';
export const DEFAULT_CODEX_ORIGINATOR = 'codex-tui';

export const CORS_ALLOW_HEADERS = [
  'Authorization',
  'Content-Type',
  'X-API-Key',
  'OpenAI-Beta',
  'X-Codex-Beta-Features',
  'X-Client-Request-Id',
  'Originator',
  'Session_id',
  'ChatGPT-Account-Id',
  'OpenAI-Organization',
  'OpenAI-Project',
].join(', ');

export const CODEX_AUTO_REVIEW_MODEL_ID = 'codex-auto-review';

export const DEFAULT_MODELS = [
  'gpt-5.5',
  'gpt-5-codex',
  'gpt-5-codex-mini',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.3-codex',
  'gpt-5.3-codex-spark',
  'gpt-5.2',
  'gpt-5.2-codex',
  'gpt-5.1-codex-max',
  'gpt-5.1-codex-mini',
  'gpt-image-2',
  CODEX_AUTO_REVIEW_MODEL_ID,
];
