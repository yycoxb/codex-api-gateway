import fs from 'node:fs/promises';
import path from 'node:path';
import { APP_DIR } from './constants.js';

export async function ensureAppDir() {
  await fs.mkdir(APP_DIR, { recursive: true });
}

export async function readJson(file, fallback = null) {
  try {
    const content = await fs.readFile(file, 'utf8');
    return JSON.parse(content.replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

export async function writeJson(file, value, options = {}) {
  await ensureAppDir();
  const space = Object.prototype.hasOwnProperty.call(options, 'space') ? options.space : 2;
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`;
  let renamed = false;
  try {
    await fs.writeFile(tmp, JSON.stringify(value, null, space), 'utf8');
    await fs.rename(tmp, file);
    renamed = true;
  } finally {
    if (!renamed) {
      await fs.rm(tmp, { force: true }).catch(() => {});
    }
  }
}

export async function cleanupJsonTempFiles(file, {
  maxAgeMs = 10 * 60 * 1000,
  maxFiles = 5000,
} = {}) {
  const directory = path.dirname(file);
  const prefix = `${path.basename(file)}.tmp.`;
  const now = Date.now();
  let entries = [];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return { deleted: 0, bytes: 0 };
  }

  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith(prefix)) continue;
    const fullPath = path.join(directory, entry.name);
    const stat = await fs.stat(fullPath).catch(() => null);
    if (!stat?.isFile()) continue;
    if (now - stat.mtimeMs < maxAgeMs) continue;
    candidates.push({ path: fullPath, mtimeMs: stat.mtimeMs, size: stat.size });
  }

  candidates.sort((left, right) => left.mtimeMs - right.mtimeMs);
  let deleted = 0;
  let bytes = 0;
  for (const candidate of candidates.slice(0, Math.max(0, maxFiles))) {
    try {
      await fs.rm(candidate.path, { force: true });
      deleted += 1;
      bytes += candidate.size;
    } catch {
      // Best-effort cleanup only.
    }
  }
  return { deleted, bytes };
}
