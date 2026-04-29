import fs from 'node:fs/promises';
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

export async function writeJson(file, value) {
  await ensureAppDir();
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(tmp, file);
}
