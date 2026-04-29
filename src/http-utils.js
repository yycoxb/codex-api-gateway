import { CORS_ALLOW_HEADERS, DEFAULT_MODELS } from './constants.js';

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

function defaultBodyLimitBytes() {
  const mb = Number(process.env.CODEX_GATEWAY_BODY_LIMIT_MB || 64);
  const clamped = Number.isFinite(mb) ? Math.max(1, Math.min(512, mb)) : 64;
  return Math.round(clamped * 1024 * 1024);
}

export async function readBody(req, limit = defaultBodyLimitBytes()) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) throw new Error(`请求体过大: ${total} bytes > ${limit} bytes`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function localModels() {
  return {
    object: 'list',
    data: DEFAULT_MODELS.map((id) => ({ id, object: 'model', created: 0, owned_by: 'openai' })),
  };
}
