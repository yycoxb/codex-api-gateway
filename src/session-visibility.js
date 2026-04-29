import fs from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { codexHome } from './account.js';
import { nowMs } from './utils.js';

const DEFAULT_PROVIDER_ID = 'openai';
const CONFIG_FILE = 'config.toml';
const STATE_DB_FILE = 'state_5.sqlite';
const SESSION_DIRS = ['sessions', 'archived_sessions'];

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function timestampForPath() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    '-',
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds()),
  ].join('');
}

function readTopLevelTomlString(toml, key) {
  const text = String(toml || '');
  const match = /^\s*\[[^\]]+\]/m.exec(text);
  const head = match ? text.slice(0, match.index) : text;
  const re = new RegExp(`^\\s*${key}\\s*=\\s*["']([^"']+)["']\\s*$`, 'm');
  return head.match(re)?.[1] || null;
}

async function readTargetProvider(dataDir) {
  const configPath = path.join(dataDir, CONFIG_FILE);
  if (!(await exists(configPath))) return DEFAULT_PROVIDER_ID;
  const content = await fs.readFile(configPath, 'utf8').catch(() => '');
  return readTopLevelTomlString(content, 'model_provider') || DEFAULT_PROVIDER_ID;
}

async function listRolloutFiles(rootDir) {
  const result = [];
  if (!(await exists(rootDir))) return result;
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      result.push(...await listRolloutFiles(full));
    } else if (entry.isFile() && entry.name.startsWith('rollout-') && entry.name.endsWith('.jsonl')) {
      result.push(full);
    }
  }
  return result.sort();
}

function firstLineBoundary(buffer) {
  for (let i = 0; i < buffer.length; i += 1) {
    if (buffer[i] === 10) {
      const crlf = i > 0 && buffer[i - 1] === 13;
      return {
        lineEnd: crlf ? i - 1 : i,
        nextOffset: i + 1,
        separator: crlf ? '\r\n' : '\n',
      };
    }
  }
  return { lineEnd: buffer.length, nextOffset: buffer.length, separator: '' };
}

async function collectRolloutProviderChanges(dataDir, targetProvider) {
  const changes = [];
  for (const dirName of SESSION_DIRS) {
    const root = path.join(dataDir, dirName);
    const files = await listRolloutFiles(root);
    for (const file of files) {
      const buffer = await fs.readFile(file);
      if (!buffer.length) continue;
      const boundary = firstLineBoundary(buffer);
      const firstLine = buffer.subarray(0, boundary.lineEnd).toString('utf8');
      if (!firstLine.trim()) continue;

      let parsed;
      try {
        parsed = JSON.parse(firstLine);
      } catch {
        continue;
      }
      if (parsed?.type !== 'session_meta' || !parsed?.payload || typeof parsed.payload !== 'object') {
        continue;
      }
      if ((parsed.payload.model_provider || '') === targetProvider) continue;

      const originalFirstLine = JSON.stringify(parsed);
      parsed.payload.model_provider = targetProvider;
      changes.push({
        absolutePath: file,
        relativePath: path.relative(dataDir, file),
        originalFirstLine,
        updatedFirstLine: JSON.stringify(parsed),
        nextOffset: boundary.nextOffset,
        separator: boundary.separator,
      });
    }
  }
  return changes;
}

async function copyIfExists(source, target) {
  if (!(await exists(source))) return false;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
  return true;
}

async function backupFiles(dataDir, rolloutChanges, includeSqlite, targetProvider) {
  const backupDir = path.join(dataDir, `backup-${timestampForPath()}-session-visibility-repair`);
  await fs.mkdir(backupDir, { recursive: true });
  const files = [];

  for (const change of rolloutChanges) {
    files.push(change.relativePath);
  }

  const sqliteBackups = [];
  if (includeSqlite) {
    for (const name of [STATE_DB_FILE, `${STATE_DB_FILE}-wal`, `${STATE_DB_FILE}-shm`]) {
      const copied = await copyIfExists(path.join(dataDir, name), path.join(backupDir, name));
      if (copied) sqliteBackups.push(name);
    }
  }

  await fs.writeFile(path.join(backupDir, 'manifest.json'), `${JSON.stringify({
    instanceRoot: dataDir,
    targetProvider,
    createdAt: new Date().toISOString(),
    note: 'Rollout files are not copied. Only the original first JSONL line is stored because this repair only changes session_meta.payload.model_provider.',
    rolloutFiles: files,
    rolloutLineBackups: rolloutChanges.map((change) => ({
      relativePath: change.relativePath,
      originalFirstLine: change.originalFirstLine,
      updatedFirstLine: change.updatedFirstLine,
    })),
    sqliteBackups,
  }, null, 2)}\n`, 'utf8');

  return backupDir;
}

async function rewriteRolloutProvider(change) {
  const buffer = await fs.readFile(change.absolutePath);
  const next = Buffer.concat([
    Buffer.from(change.updatedFirstLine, 'utf8'),
    Buffer.from(change.separator, 'utf8'),
    buffer.subarray(change.nextOffset),
  ]);
  const dir = path.dirname(change.absolutePath);
  const temp = path.join(dir, `.${path.basename(change.absolutePath)}.provider-repair.${process.pid}.${Date.now()}`);
  await fs.writeFile(temp, next);
  await fs.rename(temp, change.absolutePath);
}

function sqliteCounts(dataDir, targetProvider) {
  const dbPath = path.join(dataDir, STATE_DB_FILE);
  const db = new DatabaseSync(dbPath);
  try {
    db.exec('PRAGMA busy_timeout = 3000');
    const row = db.prepare("SELECT COUNT(*) AS c FROM threads WHERE COALESCE(model_provider, '') <> ?").get(targetProvider);
    return Number(row?.c || 0);
  } finally {
    db.close();
  }
}

function updateSqliteProvider(dataDir, targetProvider) {
  const dbPath = path.join(dataDir, STATE_DB_FILE);
  const db = new DatabaseSync(dbPath);
  try {
    db.exec('PRAGMA busy_timeout = 3000');
    const stmt = db.prepare("UPDATE threads SET model_provider = ? WHERE COALESCE(model_provider, '') <> ?");
    const info = stmt.run(targetProvider, targetProvider);
    return Number(info.changes || 0);
  } finally {
    db.close();
  }
}

export async function repairSessionVisibility({
  dataDir = codexHome(),
  targetProvider = null,
  rewriteRollouts = false,
} = {}) {
  const startedAt = nowMs();
  const resolvedDataDir = path.resolve(dataDir);
  const provider = targetProvider || await readTargetProvider(resolvedDataDir);
  const dbPath = path.join(resolvedDataDir, STATE_DB_FILE);
  const rolloutChanges = rewriteRollouts ? await collectRolloutProviderChanges(resolvedDataDir, provider) : [];
  const sqliteRowsToUpdate = await exists(dbPath) ? sqliteCounts(resolvedDataDir, provider) : 0;

  if (!rolloutChanges.length && sqliteRowsToUpdate === 0) {
    return {
      ok: true,
      changed: false,
      dataDir: resolvedDataDir,
      targetProvider: provider,
      changedRolloutFileCount: 0,
      updatedSqliteRowCount: 0,
      rewriteRollouts,
      rolloutRewriteSkipped: !rewriteRollouts,
      backupDir: null,
      startedAt,
      finishedAt: nowMs(),
      message: 'session visibility metadata already matches current provider',
    };
  }

  const backupDir = await backupFiles(resolvedDataDir, rolloutChanges, sqliteRowsToUpdate > 0, provider);
  let updatedSqliteRowCount = 0;
  try {
    if (sqliteRowsToUpdate > 0) {
      updatedSqliteRowCount = updateSqliteProvider(resolvedDataDir, provider);
    }
    for (const change of rolloutChanges) {
      await rewriteRolloutProvider(change);
    }
  } catch (err) {
    throw new Error(`repair failed after backup=${backupDir}: ${err?.message || err}`);
  }

  return {
    ok: true,
    changed: true,
    dataDir: resolvedDataDir,
    targetProvider: provider,
    changedRolloutFileCount: rolloutChanges.length,
    updatedSqliteRowCount,
    rewriteRollouts,
    rolloutRewriteSkipped: !rewriteRollouts,
    backupDir,
    startedAt,
    finishedAt: nowMs(),
    message: `repaired session visibility: rollout=${rolloutChanges.length}, sqlite=${updatedSqliteRowCount}`,
  };
}
