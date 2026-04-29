import crypto from 'node:crypto';

export function nowSec() {
  return Math.floor(Date.now() / 1000);
}

export function nowMs() {
  return Date.now();
}

export function mask(value) {
  if (!value) return '';
  if (value.length <= 12) return `${value.slice(0, 3)}****`;
  return `${value.slice(0, 10)}****${value.slice(-4)}`;
}

export function generateApiKey() {
  return `agt_codex_${crypto.randomBytes(24).toString('base64url')}`;
}
