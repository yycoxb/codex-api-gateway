import { CODEX_AUTO_REVIEW_MODEL_ID, CORS_ALLOW_HEADERS, DEFAULT_MODELS } from './constants.js';

export function jsonResponse(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload, null, 2));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': CORS_ALLOW_HEADERS,
  });
  res.end(body);
}

export function optionsResponse(res) {
  res.writeHead(204, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': CORS_ALLOW_HEADERS,
  });
  res.end();
}

export function getLocalApiKey(req) {
  const auth = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  if (match) return match[1].trim();
  const xApiKey = req.headers['x-api-key'];
  return Array.isArray(xApiKey) ? xApiKey[0] : xApiKey;
}

const DEFAULT_BODY_LIMIT_MB = 64;
const MAX_BODY_LIMIT_MB = 512;

function formatBytes(bytes) {
  const mb = bytes / 1024 / 1024;
  return `${bytes} bytes (${mb.toFixed(2)} MB)`;
}

function parseContentLength(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function defaultBodyLimitBytes() {
  const mb = Number(process.env.CODEX_GATEWAY_BODY_LIMIT_MB || DEFAULT_BODY_LIMIT_MB);
  const clamped = Number.isFinite(mb) ? Math.max(1, Math.min(MAX_BODY_LIMIT_MB, mb)) : DEFAULT_BODY_LIMIT_MB;
  return Math.round(clamped * 1024 * 1024);
}

export async function readBody(req, limit = defaultBodyLimitBytes()) {
  const contentLength = parseContentLength(req.headers?.['content-length']);
  if (contentLength !== null && contentLength > limit) {
    throw new Error(`请求体过大: ${formatBytes(contentLength)} > ${formatBytes(limit)}`);
  }

  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) throw new Error(`请求体过大: ${formatBytes(total)} > ${formatBytes(limit)}`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const CODEX_CLIENT_HIDDEN_MODELS = new Set([
  CODEX_AUTO_REVIEW_MODEL_ID,
  'gpt-image-2',
]);

const CODEX_CLIENT_REASONING_LEVELS = [
  { effort: 'minimal', description: 'Fastest responses with minimal reasoning' },
  { effort: 'low', description: 'Fast responses with lighter reasoning' },
  { effort: 'medium', description: 'Balances speed and reasoning depth for everyday tasks' },
  { effort: 'high', description: 'Greater reasoning depth for complex problems' },
  { effort: 'xhigh', description: 'Extra high reasoning depth for complex problems' },
];

const CODEX_CLIENT_DISPLAY_NAMES = new Map([
  ['gpt-5.5', 'GPT-5.5'],
  ['gpt-5-codex', 'GPT-5 Codex'],
  ['gpt-5-codex-mini', 'GPT-5 Codex Mini'],
  ['gpt-5.4', 'GPT-5.4'],
  ['gpt-5.4-mini', 'GPT-5.4 Mini'],
  ['gpt-5.3-codex', 'GPT-5.3 Codex'],
  ['gpt-5.3-codex-spark', 'GPT-5.3 Codex Spark'],
  ['gpt-5.2', 'GPT-5.2'],
  ['gpt-5.2-codex', 'GPT-5.2 Codex'],
  ['gpt-5.1-codex-max', 'GPT-5.1 Codex Max'],
  ['gpt-5.1-codex-mini', 'GPT-5.1 Codex Mini'],
  ['gpt-image-2', 'GPT Image 2'],
  [CODEX_AUTO_REVIEW_MODEL_ID, 'Codex Auto Review'],
]);

function isCodexClientModelsRequest(reqUrl) {
  if (!reqUrl) return false;
  try {
    const url = new URL(String(reqUrl), 'http://localhost');
    return url.searchParams.has('client_version');
  } catch {
    return false;
  }
}

function displayNameForModel(id) {
  return CODEX_CLIENT_DISPLAY_NAMES.get(id) || String(id || '').replace(/-/g, ' ');
}

function codexClientModel(id) {
  const displayName = displayNameForModel(id);
  return {
    slug: id,
    display_name: displayName,
    description: `${displayName} via Codex API Gateway`,
    context_window: 272000,
    max_context_window: 1000000,
    default_reasoning_level: 'medium',
    supported_reasoning_levels: CODEX_CLIENT_REASONING_LEVELS.map((item) => ({ ...item })),
    prefer_websockets: true,
    visibility: CODEX_CLIENT_HIDDEN_MODELS.has(id) ? 'hide' : 'show',
  };
}

function codexClientModels() {
  return {
    models: DEFAULT_MODELS.map((id) => codexClientModel(id)),
  };
}

export function localModels(reqUrl = '') {
  if (isCodexClientModelsRequest(reqUrl)) return codexClientModels();
  return {
    object: 'list',
    data: DEFAULT_MODELS.map((id) => ({ id, object: 'model', created: 0, owned_by: 'openai' })),
  };
}
