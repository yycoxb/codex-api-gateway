import { nowSec } from './utils.js';

function base64UrlDecodeJson(part) {
  const padded = part + '='.repeat((4 - (part.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}

export function decodeJwtPayload(token) {
  if (!token || !token.includes('.')) return null;
  try {
    return base64UrlDecodeJson(token.split('.')[1]);
  } catch {
    return null;
  }
}

export function isTokenExpired(token, skew = 300) {
  const payload = decodeJwtPayload(token);
  const exp = Number(payload?.exp || 0);
  return !exp || exp <= nowSec() + skew;
}

export function extractAccountId(accessToken, idToken) {
  const access = decodeJwtPayload(accessToken);
  const id = decodeJwtPayload(idToken);
  const accessAuth = access?.['https://api.openai.com/auth'];
  const idAuth = id?.['https://api.openai.com/auth'];
  return (
    accessAuth?.chatgpt_account_id ||
    accessAuth?.account_id ||
    idAuth?.chatgpt_account_id ||
    idAuth?.account_id ||
    null
  );
}

export function extractEmail(idToken) {
  const payload = decodeJwtPayload(idToken);
  return payload?.email || 'local-codex-account';
}
