import crypto from 'node:crypto';
import http from 'node:http';
import {
  AUTH_ENDPOINT,
  CLIENT_ID,
  OAUTH_CALLBACK_PORT,
  OAUTH_PENDING_PATH,
  TOKEN_ENDPOINT,
} from './constants.js';
import { readJson, writeJson } from './storage.js';
import { nowMs } from './utils.js';

const SCOPES = 'openid profile email offline_access';
const ORIGINATOR = 'codex_vscode';
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;
const OAUTH_PORT_IN_USE_CODE = 'CODEX_OAUTH_PORT_IN_USE';

let oauthState = null;
let callbackServer = null;
let callbackTimer = null;

function base64Url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

function randomToken() {
  return base64Url(crypto.randomBytes(32));
}

function codeChallenge(codeVerifier) {
  return base64Url(crypto.createHash('sha256').update(codeVerifier).digest());
}

function safeJsonResponse(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload, null, 2));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
  });
  res.end(body);
}

function htmlResponse(res, status, title, message) {
  const body = Buffer.from(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: linear-gradient(135deg, #667eea, #764ba2); color: white; }
    main { max-width: 620px; padding: 32px; text-align: center; }
    h1 { margin: 0 0 12px; font-size: 34px; }
    p { margin: 0; font-size: 16px; opacity: .9; line-height: 1.6; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p>${message}</p>
  </main>
</body>
</html>`);
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
  });
  res.end(body);
}

function publicState(state = oauthState) {
  if (!state) return null;
  return {
    loginId: state.loginId,
    authUrl: state.authUrl,
    callbackUrl: state.redirectUri,
    expiresAt: state.expiresAt,
    createdAt: state.createdAt,
    completed: Boolean(state.code),
    expired: Number(state.expiresAt || 0) <= nowMs(),
    port: state.port,
  };
}

async function persistState() {
  await writeJson(OAUTH_PENDING_PATH, oauthState || {});
}

async function hydrateStateIfNeeded() {
  if (oauthState) return;
  const saved = await readJson(OAUTH_PENDING_PATH, null);
  if (!saved?.loginId || !saved?.state || !saved?.codeVerifier) return;
  if (Number(saved.expiresAt || 0) <= nowMs()) {
    await clearOAuthState();
    return;
  }
  oauthState = saved;
}

async function clearOAuthState() {
  oauthState = null;
  stopCallbackServer();
  await writeJson(OAUTH_PENDING_PATH, {});
}

function stopCallbackServer() {
  if (callbackTimer) {
    clearTimeout(callbackTimer);
    callbackTimer = null;
  }
  if (callbackServer) {
    try {
      callbackServer.close();
    } catch {
      // ignore
    }
    callbackServer = null;
  }
}

function parseCallbackLikeUrl(callbackUrl, port = OAUTH_CALLBACK_PORT) {
  const trimmed = String(callbackUrl || '').trim();
  if (!trimmed) throw new Error('回调地址不能为空');
  if (/^https?:\/\//i.test(trimmed)) return new URL(trimmed);
  if (trimmed.startsWith('/')) return new URL(trimmed, `http://localhost:${port}`);
  return new URL(`/auth/callback?${trimmed.replace(/^\?/, '')}`, `http://localhost:${port}`);
}

function applyCallbackCode(loginId, callbackUrl) {
  if (!oauthState) throw new Error('OAuth 状态不存在，请重新发起授权');
  if (oauthState.loginId !== loginId) throw new Error('OAuth loginId 不匹配');
  if (Number(oauthState.expiresAt || 0) <= nowMs()) throw new Error('OAuth 登录已超时，请重新发起授权');

  const parsed = parseCallbackLikeUrl(callbackUrl, oauthState.port);
  if (parsed.pathname !== '/auth/callback') {
    throw new Error('回调地址路径无效，必须为 /auth/callback');
  }
  const code = parsed.searchParams.get('code')?.trim();
  const state = parsed.searchParams.get('state')?.trim();
  if (!code) throw new Error('回调地址中缺少 code 参数');
  if (!state) throw new Error('回调地址中缺少 state 参数');
  if (state !== oauthState.state) {
    throw new Error('回调 state 校验失败，请确认粘贴的是当前登录会话的回调地址');
  }

  oauthState = {
    ...oauthState,
    code,
    completedAt: nowMs(),
  };
}

function buildAuthUrl(redirectUri, verifierChallenge, stateToken) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    scope: SCOPES,
    code_challenge: verifierChallenge,
    code_challenge_method: 'S256',
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
    state: stateToken,
    originator: ORIGINATOR,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

function ensureCallbackServerForCurrentState() {
  if (!oauthState) return;
  if (callbackServer?.listening) return;

  const expectedLoginId = oauthState.loginId;
  const port = oauthState.port;
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
      if (url.pathname === '/cancel') {
        htmlResponse(res, 200, '已取消授权', '可以关闭此页面。');
        return;
      }
      if (url.pathname !== '/auth/callback') {
        htmlResponse(res, 404, 'Not Found', '未知 OAuth 回调路径。');
        return;
      }

      const state = oauthState;
      if (!state || state.loginId !== expectedLoginId) {
        htmlResponse(res, 400, '授权状态已失效', '请回到管理页重新发起授权。');
        return;
      }
      try {
        applyCallbackCode(expectedLoginId, url.toString());
        await persistState();
      } catch (err) {
        htmlResponse(res, 400, '授权失败', String(err?.message || err));
        return;
      }
      htmlResponse(res, 200, '授权成功', '请回到 Codex API Gateway 管理页，账号会自动完成导入。');
      stopCallbackServer();
    } catch (err) {
      safeJsonResponse(res, 500, { error: String(err?.message || err) });
    }
  });

  server.on('error', (err) => {
    if (err?.code === 'EADDRINUSE') {
      console.warn(`[oauth] callback port ${port} is in use`);
    } else {
      console.warn(`[oauth] callback server error: ${err?.message || err}`);
    }
  });

  server.listen(port, '127.0.0.1');
  callbackServer = server;
  const waitMs = Math.max(1, Number(oauthState.expiresAt || 0) - nowMs());
  callbackTimer = setTimeout(() => {
    stopCallbackServer();
  }, waitMs);
}

async function assertPortAvailable(port) {
  if (callbackServer?.listening) return;
  await new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.once('error', (err) => {
      reject(err);
    });
    probe.listen(port, '127.0.0.1', () => {
      probe.close(resolve);
    });
  }).catch((err) => {
    if (err?.code === 'EADDRINUSE') throw new Error(`${OAUTH_PORT_IN_USE_CODE}:${port}`);
    throw new Error(`无法绑定 OAuth 回调端口 ${port}: ${err?.message || err}`);
  });
}

export async function startCodexOAuthLogin() {
  await hydrateStateIfNeeded();
  if (oauthState && Number(oauthState.expiresAt || 0) > nowMs()) {
    ensureCallbackServerForCurrentState();
    return publicState();
  }

  await clearOAuthState();
  await assertPortAvailable(OAUTH_CALLBACK_PORT);

  const codeVerifier = randomToken();
  const stateToken = randomToken();
  const loginId = randomToken();
  const redirectUri = `http://localhost:${OAUTH_CALLBACK_PORT}/auth/callback`;
  const authUrl = buildAuthUrl(redirectUri, codeChallenge(codeVerifier), stateToken);

  oauthState = {
    loginId,
    authUrl,
    redirectUri,
    codeVerifier,
    state: stateToken,
    port: OAUTH_CALLBACK_PORT,
    createdAt: nowMs(),
    expiresAt: nowMs() + OAUTH_TIMEOUT_MS,
    code: null,
  };
  await persistState();
  ensureCallbackServerForCurrentState();
  return publicState();
}

export async function getCodexOAuthStatus(loginId) {
  await hydrateStateIfNeeded();
  if (!oauthState) return { active: false, completed: false, expired: false };
  if (loginId && oauthState.loginId !== loginId) {
    return { active: false, completed: false, expired: false, error: 'OAuth loginId 不匹配' };
  }
  return { active: true, ...publicState() };
}

export async function submitCodexOAuthCallbackUrl(loginId, callbackUrl) {
  await hydrateStateIfNeeded();
  applyCallbackCode(loginId, callbackUrl);
  await persistState();
  stopCallbackServer();
  return { ok: true, ...publicState() };
}

export async function completeCodexOAuthLogin(loginId) {
  await hydrateStateIfNeeded();
  if (!oauthState) throw new Error('OAuth 状态不存在，请重新发起授权');
  if (oauthState.loginId !== loginId) throw new Error('OAuth loginId 不匹配');
  if (Number(oauthState.expiresAt || 0) <= nowMs()) throw new Error('OAuth 登录已超时，请重新发起授权');
  if (!oauthState.code) throw new Error('授权尚未完成，请先在浏览器中授权');

  const redirectUri = `http://localhost:${oauthState.port}/auth/callback`;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: oauthState.code,
    redirect_uri: redirectUri,
    client_id: CLIENT_ID,
    code_verifier: oauthState.codeVerifier,
  });
  const resp = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Token 交换失败: status=${resp.status}, body_len=${text.length}`);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`解析 Token 响应失败: ${err.message}`);
  }
  if (!data.id_token || !data.access_token) {
    throw new Error('Token 响应缺少 id_token/access_token');
  }
  const tokens = {
    id_token: data.id_token,
    access_token: data.access_token,
    refresh_token: data.refresh_token || null,
  };
  await clearOAuthState();
  return tokens;
}

export async function cancelCodexOAuthLogin(loginId = null) {
  await hydrateStateIfNeeded();
  if (oauthState && (!loginId || oauthState.loginId === loginId)) {
    await clearOAuthState();
  }
  return { ok: true };
}
