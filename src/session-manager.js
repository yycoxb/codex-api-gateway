import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { DatabaseSync } from 'node:sqlite';
import { APP_DIR } from './constants.js';
import { codexHome } from './account.js';
import { nowMs } from './utils.js';

const STATE_DB_FILE = 'state_5.sqlite';
const CONFIG_FILE = 'config.toml';
const SESSION_INDEX_FILE = 'session_index.jsonl';
const SESSION_DIRS = ['sessions', 'archived_sessions'];
const SESSION_TRASH_ROOT = path.join(APP_DIR, 'session-trash');
const SESSION_VISIBILITY_BACKUP_ROOT = path.join(APP_DIR, 'session-visibility-backups');
const DEFAULT_MODEL_PROVIDER = 'openai';
const DEFAULT_APPROVAL_MODE = 'never';
const DEFAULT_SANDBOX_POLICY = 'danger-full-access';

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

function normalizeText(value, max = 160) {
  const text = String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function normalizePathText(value, max = 220) {
  return normalizeText(value, max)?.replace(/^\\\\\?\\/, '') || null;
}

function metadataText(value, max = 320) {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return normalizeText(value, max);
  }
  if (typeof value === 'object') {
    try {
      return normalizeText(JSON.stringify(value), max);
    } catch {
      return null;
    }
  }
  return null;
}

function comparablePath(value) {
  return normalizePathText(value, 300)?.toLowerCase() || null;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readTopLevelTomlString(toml, key) {
  const text = String(toml || '');
  const match = /^\s*\[[^\]]+\]/m.exec(text);
  const head = match ? text.slice(0, match.index) : text;
  const re = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*["']([^"']+)["']\\s*$`, 'm');
  return head.match(re)?.[1] || null;
}

async function readCurrentModelProvider(dataDir) {
  const configPath = path.join(dataDir, CONFIG_FILE);
  if (!(await exists(configPath))) return DEFAULT_MODEL_PROVIDER;
  const content = await fs.readFile(configPath, 'utf8').catch(() => '');
  return normalizeText(readTopLevelTomlString(content, 'model_provider'), 80) || DEFAULT_MODEL_PROVIDER;
}

function shortId(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.length <= 18) return raw;
  return `${raw.slice(0, 8)}...${raw.slice(-6)}`;
}

function timestampMs(row, prefix) {
  const precise = Number(row?.[`${prefix}_at_ms`] || 0);
  if (Number.isFinite(precise) && precise > 0) return precise;
  const seconds = Number(row?.[`${prefix}_at`] || 0);
  if (Number.isFinite(seconds) && seconds > 0) return seconds > 100000000000 ? seconds : seconds * 1000;
  return null;
}

function isInside(parent, child) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

async function listRolloutFiles(rootDir) {
  const result = [];
  if (!(await exists(rootDir))) return result;
  const entries = await fs.readdir(rootDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      result.push(...await listRolloutFiles(full));
    } else if (entry.isFile() && entry.name.startsWith('rollout-') && entry.name.endsWith('.jsonl')) {
      result.push(full);
    }
  }
  return result;
}

async function readFirstLine(file, maxBytes = 256 * 1024) {
  const handle = await fs.open(file, 'r');
  try {
    const chunks = [];
    let total = 0;
    let position = 0;
    while (total < maxBytes) {
      const buffer = Buffer.alloc(Math.min(8192, maxBytes - total));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (!bytesRead) break;
      const chunk = buffer.subarray(0, bytesRead);
      const newline = chunk.indexOf(10);
      if (newline >= 0) {
        chunks.push(chunk.subarray(0, newline));
        break;
      }
      chunks.push(chunk);
      total += bytesRead;
      position += bytesRead;
    }
    return Buffer.concat(chunks).toString('utf8').replace(/\r$/, '');
  } finally {
    await handle.close();
  }
}

async function readFirstLineInfo(file, maxBytes = 256 * 1024) {
  const handle = await fs.open(file, 'r');
  try {
    const chunks = [];
    let total = 0;
    let position = 0;
    while (total < maxBytes) {
      const buffer = Buffer.alloc(Math.min(8192, maxBytes - total));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (!bytesRead) break;
      const chunk = buffer.subarray(0, bytesRead);
      const newline = chunk.indexOf(10);
      if (newline >= 0) {
        const crlf = newline > 0 && chunk[newline - 1] === 13;
        chunks.push(chunk.subarray(0, crlf ? newline - 1 : newline));
        return {
          firstLine: Buffer.concat(chunks).toString('utf8'),
          nextOffset: position + newline + 1,
          separator: crlf ? '\r\n' : '\n',
        };
      }
      chunks.push(chunk);
      total += bytesRead;
      position += bytesRead;
    }
    return {
      firstLine: Buffer.concat(chunks).toString('utf8').replace(/\r$/, ''),
      nextOffset: position,
      separator: '',
    };
  } finally {
    await handle.close();
  }
}

function sessionIdFromFilename(file) {
  const name = path.basename(file);
  if (!name.startsWith('rollout-') || !name.endsWith('.jsonl')) return null;
  const stem = name.slice('rollout-'.length, -'.jsonl'.length);
  const uuid = stem.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return uuid ? uuid[0] : stem;
}

function sessionIdFromMeta(parsed, file) {
  const payload = parsed?.payload && typeof parsed.payload === 'object' ? parsed.payload : {};
  return normalizeText(
    payload.id ||
    payload.session_id ||
    payload.sessionId ||
    payload.thread_id ||
    payload.threadId ||
    parsed?.id ||
    parsed?.session_id ||
    sessionIdFromFilename(file),
    120
  );
}

function titleFromMeta(parsed) {
  const payload = parsed?.payload && typeof parsed.payload === 'object' ? parsed.payload : {};
  return normalizeText(payload.title || payload.thread_name || payload.name || parsed?.title || parsed?.thread_name, 120);
}

function modelProviderFromMeta(parsed) {
  const payload = parsed?.payload && typeof parsed.payload === 'object' ? parsed.payload : {};
  return normalizeText(payload.model_provider || payload.modelProvider || parsed?.model_provider || parsed?.modelProvider, 80);
}

function sourceScalar(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    return value.type || value.name || value.id || value.label || value.originator || null;
  }
  return null;
}

function sourceFromMeta(parsed) {
  const payload = parsed?.payload && typeof parsed.payload === 'object' ? parsed.payload : {};
  return normalizeText(sourceScalar(payload.source) || sourceScalar(payload.thread_source) || sourceScalar(parsed?.source) || sourceScalar(parsed?.thread_source), 80);
}

function approvalModeFromMeta(parsed) {
  const payload = parsed?.payload && typeof parsed.payload === 'object' ? parsed.payload : {};
  return metadataText(payload.approval_mode || payload.approval_policy || parsed?.approval_mode || parsed?.approval_policy, 120);
}

function sandboxPolicyFromMeta(parsed) {
  const payload = parsed?.payload && typeof parsed.payload === 'object' ? parsed.payload : {};
  return metadataText(payload.sandbox_policy || payload.sandboxPolicy || parsed?.sandbox_policy || parsed?.sandboxPolicy, 320);
}

function cwdFromMeta(parsed) {
  const payload = parsed?.payload && typeof parsed.payload === 'object' ? parsed.payload : {};
  return normalizePathText(payload.cwd || payload.workspace || payload.workspace_path || parsed?.cwd || parsed?.workspace || parsed?.workspace_path, 220);
}

function indexModelProvider(parsed) {
  return normalizeText(parsed?.model_provider || parsed?.modelProvider || parsed?.provider, 80);
}

function indexArchivedValue(parsed) {
  const value = parsed?.archived ?? parsed?.is_archived ?? parsed?.isArchived;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return /^(1|true|yes)$/i.test(value.trim());
  return false;
}

async function readSessionIndex(dataDir) {
  const indexPath = path.join(dataDir, SESSION_INDEX_FILE);
  if (!(await exists(indexPath))) return new Map();
  const map = new Map();
  const content = await fs.readFile(indexPath, 'utf8').catch(() => '');
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      const id = String(parsed?.id || '').trim();
      if (!id) continue;
      map.set(id, {
        title: normalizeText(parsed.thread_name || parsed.title || parsed.name, 120),
        updatedAt: timestampMs(parsed, 'updated') || timestampMs(parsed, 'last_updated') || null,
        modelProvider: indexModelProvider(parsed),
        archived: indexArchivedValue(parsed),
        cwd: normalizePathText(parsed.cwd || parsed.workspace || parsed.workspace_path, 220),
        source: normalizeText(sourceScalar(parsed.source) || sourceScalar(parsed.thread_source), 80),
        approvalMode: metadataText(parsed.approval_mode || parsed.approval_policy, 120),
        sandboxPolicy: metadataText(parsed.sandbox_policy || parsed.sandboxPolicy, 320),
      });
    } catch {
      // Ignore malformed index rows; never expose raw content.
    }
  }
  return map;
}

async function collectSessionFiles(dataDir) {
  const files = [];
  for (const dirName of SESSION_DIRS) {
    const root = path.join(dataDir, dirName);
    const rolloutFiles = await listRolloutFiles(root);
    for (const file of rolloutFiles) {
      const stat = await fs.stat(file).catch(() => null);
      let parsed = null;
      try {
        const firstLine = await readFirstLine(file);
        parsed = firstLine.trim() ? JSON.parse(firstLine) : null;
      } catch {
        parsed = null;
      }
      const id = sessionIdFromMeta(parsed, file);
      files.push({
        id,
        title: titleFromMeta(parsed),
        modelProvider: modelProviderFromMeta(parsed),
        source: sourceFromMeta(parsed),
        cwd: cwdFromMeta(parsed),
        approvalMode: approvalModeFromMeta(parsed),
        sandboxPolicy: sandboxPolicyFromMeta(parsed),
        rolloutPath: path.relative(dataDir, file),
        absolutePath: file,
        relativePath: path.relative(dataDir, file),
        location: dirName,
        archivedByLocation: dirName === 'archived_sessions',
        sizeBytes: Number(stat?.size || 0),
        mtimeMs: Number(stat?.mtimeMs || 0),
      });
    }
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files;
}

function rowsFromSqlite(dataDir) {
  const dbPath = path.join(dataDir, STATE_DB_FILE);
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout = 3000');
    return db.prepare(`
      SELECT id, title, cwd, source, model_provider, created_at, created_at_ms,
             updated_at, updated_at_ms, archived, thread_source
      FROM threads
      ORDER BY COALESCE(updated_at_ms, updated_at * 1000, created_at_ms, created_at * 1000, 0) DESC
      LIMIT 2000
    `).all();
  } finally {
    db.close();
  }
}

async function readThreadRows(dataDir) {
  const dbPath = path.join(dataDir, STATE_DB_FILE);
  if (!(await exists(dbPath))) return [];
  try {
    return rowsFromSqlite(dataDir);
  } catch {
    return [];
  }
}

function effectiveProvider(item) {
  return item?.modelProvider || item?.fileModelProvider || DEFAULT_MODEL_PROVIDER;
}

function decorateVisibility(item, currentModelProvider) {
  const provider = effectiveProvider(item);
  const providerMismatch = Boolean(currentModelProvider && provider && provider !== currentModelProvider);
  const fileProviderMismatch = Boolean(currentModelProvider && item.fileModelProvider && item.fileModelProvider !== currentModelProvider);
  const indexProviderMismatch = Boolean(currentModelProvider && item.indexModelProvider && item.indexModelProvider !== currentModelProvider);
  const indexProviderMissing = Boolean(item.indexRowExists && !item.indexModelProvider);
  const indexMissing = Boolean(item.threadRowExists && !item.indexRowExists);
  const archived = Boolean(item.archived);
  const indexArchivedMismatch = Boolean(!archived && item.indexArchived);
  const expectedCwd = comparablePath(item.cwd);
  const indexedCwd = comparablePath(item.indexCwd);
  const indexCwdMissing = Boolean(item.threadRowExists && item.indexRowExists && expectedCwd && !indexedCwd);
  const indexCwdMismatch = Boolean(item.threadRowExists && item.indexRowExists && expectedCwd && indexedCwd && expectedCwd !== indexedCwd);
  const sqliteMissing = Boolean(!item.threadRowExists && item.fileExists);
  const visibilityMismatch = providerMismatch || fileProviderMismatch || indexProviderMismatch || indexProviderMissing || indexMissing || indexArchivedMismatch || indexCwdMissing || indexCwdMismatch || sqliteMissing;
  return {
    ...item,
    effectiveModelProvider: provider,
    currentModelProvider,
    providerMismatch,
    fileProviderMismatch,
    indexProviderMismatch,
    indexProviderMissing,
    indexMissing,
    indexArchivedMismatch,
    indexCwdMissing,
    indexCwdMismatch,
    sqliteMissing,
    visibleInCurrentProvider: Boolean(!archived && !visibilityMismatch),
    canRepairVisibility: Boolean(!archived && (item.threadRowExists || item.fileExists) && visibilityMismatch),
    visibilityStatus: archived ? 'archived' : (visibilityMismatch ? 'metadata_mismatch' : 'visible'),
  };
}

function sessionItemFromRow(row, file, indexItem = null) {
  const cwd = normalizePathText(row?.cwd, 220) || indexItem?.cwd || file?.cwd || null;
  const updatedAt = timestampMs(row, 'updated') || file?.mtimeMs || null;
  const createdAt = timestampMs(row, 'created') || null;
  const rowProvider = normalizeText(row.model_provider, 80);
  return {
    id: String(row.id || file?.id || '').trim(),
    shortId: shortId(row.id || file?.id),
    title: indexItem?.title || normalizeText(row.title, 120) || file?.title || '未命名会话',
    cwd,
    project: cwd ? normalizeText(path.basename(cwd), 80) : null,
    source: normalizeText(row.source || row.thread_source, 60) || indexItem?.source || file?.source || null,
    modelProvider: rowProvider,
    sqliteModelProvider: rowProvider,
    fileModelProvider: file?.modelProvider || null,
    indexModelProvider: indexItem?.modelProvider || null,
    indexCwd: indexItem?.cwd || null,
    indexRowExists: Boolean(indexItem),
    indexArchived: Boolean(indexItem?.archived),
    approvalMode: normalizeText(row.approval_mode || row.approval_policy, 120) || indexItem?.approvalMode || file?.approvalMode || null,
    sandboxPolicy: metadataText(row.sandbox_policy || row.sandboxPolicy, 320) || indexItem?.sandboxPolicy || file?.sandboxPolicy || null,
    rolloutPath: normalizePathText(row.rollout_path, 260) || file?.rolloutPath || file?.relativePath || null,
    threadRowExists: true,
    archived: Boolean(Number(row.archived || 0) || file?.archivedByLocation),
    updatedAt,
    createdAt,
    fileRelativePath: file?.relativePath || null,
    fileLocation: file?.location || null,
    fileExists: Boolean(file),
    sizeBytes: file?.sizeBytes || 0,
  };
}

function sessionItemFromFile(file, indexItem = null) {
  const id = String(file.id || file.relativePath || '').trim();
  const cwd = indexItem?.cwd || file.cwd || null;
  return {
    id,
    shortId: shortId(id),
    title: indexItem?.title || file.title || '未命名会话文件',
    cwd,
    project: cwd ? normalizeText(path.basename(cwd), 80) : null,
    source: indexItem?.source || file.source || 'file',
    modelProvider: file.modelProvider || null,
    sqliteModelProvider: null,
    fileModelProvider: file.modelProvider || null,
    indexModelProvider: indexItem?.modelProvider || null,
    indexCwd: indexItem?.cwd || null,
    indexRowExists: Boolean(indexItem),
    indexArchived: Boolean(indexItem?.archived),
    approvalMode: indexItem?.approvalMode || file.approvalMode || null,
    sandboxPolicy: indexItem?.sandboxPolicy || file.sandboxPolicy || null,
    rolloutPath: file.rolloutPath || file.relativePath || null,
    fileSource: file.source || null,
    threadRowExists: false,
    archived: Boolean(file.archivedByLocation),
    updatedAt: indexItem?.updatedAt || file.mtimeMs || null,
    createdAt: null,
    fileRelativePath: file.relativePath,
    fileLocation: file.location,
    fileExists: true,
    sizeBytes: file.sizeBytes || 0,
  };
}

export async function listCodexSessions({ archivedOnly = true } = {}) {
  const startedAt = nowMs();
  const dataDir = path.resolve(codexHome());
  const [rows, files, index, currentModelProvider] = await Promise.all([
    readThreadRows(dataDir),
    collectSessionFiles(dataDir),
    readSessionIndex(dataDir),
    readCurrentModelProvider(dataDir),
  ]);
  const filesById = new Map();
  for (const file of files) {
    if (file.id && !filesById.has(file.id)) filesById.set(file.id, file);
  }

  const items = [];
  const seenIds = new Set();
  for (const row of rows) {
    const id = String(row.id || '').trim();
    const file = filesById.get(id) || null;
    const item = decorateVisibility(sessionItemFromRow(row, file, index.get(id) || null), currentModelProvider);
    if (!item.id) continue;
    seenIds.add(item.id);
    if (!archivedOnly || item.archived) items.push(item);
  }
  for (const file of files) {
    if (file.id && seenIds.has(file.id)) continue;
    const item = decorateVisibility(sessionItemFromFile(file, index.get(file.id) || null), currentModelProvider);
    if (!item.id) continue;
    if (!archivedOnly || item.archived) items.push(item);
  }

  items.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  return {
    ok: true,
    archivedOnly: Boolean(archivedOnly),
    count: items.length,
    currentModelProvider,
    providerMismatchCount: items.filter((item) => item.providerMismatch).length,
    repairableVisibilityCount: items.filter((item) => item.canRepairVisibility).length,
    sessions: items,
    startedAt,
    finishedAt: nowMs(),
  };
}

async function copyIfExists(source, target) {
  if (!(await exists(source))) return false;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
  return true;
}

async function moveFileToTrash(dataDir, trashDir, file) {
  if (!file?.absolutePath || !isInside(dataDir, file.absolutePath)) return null;
  if (!(await exists(file.absolutePath))) return null;
  const target = path.join(trashDir, 'files', file.relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  try {
    await fs.rename(file.absolutePath, target);
  } catch (err) {
    if (err?.code !== 'EXDEV') throw err;
    await fs.copyFile(file.absolutePath, target);
    await fs.rm(file.absolutePath, { force: true });
  }
  return path.relative(trashDir, target);
}

function deleteRowsFromSqlite(dataDir, ids) {
  const dbPath = path.join(dataDir, STATE_DB_FILE);
  const db = new DatabaseSync(dbPath);
  try {
    db.exec('PRAGMA busy_timeout = 3000');
    const columns = new Set(db.prepare('PRAGMA table_info(threads)').all().map((row) => String(row.name || '')));
    const stmt = db.prepare(columns.has('archived')
      ? 'DELETE FROM threads WHERE id = ? AND COALESCE(archived, 0) <> 0'
      : 'DELETE FROM threads WHERE id = ?');
    let changes = 0;
    for (const id of ids) {
      const info = stmt.run(id);
      changes += Number(info.changes || 0);
    }
    return changes;
  } finally {
    db.close();
  }
}

async function rewriteSessionIndex(dataDir, ids, trashDir) {
  const indexPath = path.join(dataDir, SESSION_INDEX_FILE);
  if (!(await exists(indexPath))) return { changed: false, removed: 0 };
  await copyIfExists(indexPath, path.join(trashDir, SESSION_INDEX_FILE));
  const idSet = new Set(ids);
  const content = await fs.readFile(indexPath, 'utf8');
  const lines = content.split(/\r?\n/);
  const kept = [];
  let removed = 0;
  for (const line of lines) {
    if (!line.trim()) {
      kept.push(line);
      continue;
    }
    let parsed = null;
    try { parsed = JSON.parse(line); } catch {}
    const id = String(parsed?.id || '').trim();
    if (id && idSet.has(id)) {
      removed += 1;
      continue;
    }
    kept.push(line);
  }
  if (!removed) return { changed: false, removed: 0 };
  const next = kept.join('\n').replace(/\n+$/, '') + '\n';
  await fs.writeFile(indexPath, next, 'utf8');
  return { changed: true, removed };
}

async function createTrashDir() {
  await fs.mkdir(SESSION_TRASH_ROOT, { recursive: true });
  let dir = path.join(SESSION_TRASH_ROOT, `deleted-${timestampForPath()}`);
  let suffix = 1;
  while (await exists(dir)) {
    dir = path.join(SESSION_TRASH_ROOT, `deleted-${timestampForPath()}-${suffix}`);
    suffix += 1;
  }
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function createVisibilityBackupDir() {
  await fs.mkdir(SESSION_VISIBILITY_BACKUP_ROOT, { recursive: true });
  let dir = path.join(SESSION_VISIBILITY_BACKUP_ROOT, `repair-${timestampForPath()}`);
  let suffix = 1;
  while (await exists(dir)) {
    dir = path.join(SESSION_VISIBILITY_BACKUP_ROOT, `repair-${timestampForPath()}-${suffix}`);
    suffix += 1;
  }
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function quoteSqliteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function sqliteSessionColumnValue(item, targetProvider, columnName) {
  const name = String(columnName || '').toLowerCase();
  const updatedMs = Number(item.updatedAt || Date.now());
  const createdMs = Number(item.createdAt || item.updatedAt || updatedMs);
  const source = normalizeText(item.source || item.fileSource, 80) || 'file';
  if (name === 'id') return item.id;
  if (name === 'title' || name === 'thread_name' || name === 'name') return item.title || item.shortId || item.id;
  if (name === 'cwd' || name === 'workspace' || name === 'workspace_path') return item.cwd || '';
  if (name === 'source' || name === 'thread_source') return source;
  if (name === 'model_provider' || name === 'provider') return targetProvider;
  if (name === 'rollout_path') return item.rolloutPath || item.fileRelativePath || '';
  if (name === 'approval_mode' || name === 'approval_policy') return item.approvalMode || DEFAULT_APPROVAL_MODE;
  if (name === 'sandbox_policy' || name === 'sandbox_mode') return item.sandboxPolicy || DEFAULT_SANDBOX_POLICY;
  if (name === 'archived' || name === 'is_archived') return 0;
  if (name === 'created_at_ms') return Number.isFinite(createdMs) && createdMs > 0 ? createdMs : Date.now();
  if (name === 'updated_at_ms') return Number.isFinite(updatedMs) && updatedMs > 0 ? updatedMs : Date.now();
  if (name === 'created_at') return Math.floor((Number.isFinite(createdMs) && createdMs > 0 ? createdMs : Date.now()) / 1000);
  if (name === 'updated_at') return Math.floor((Number.isFinite(updatedMs) && updatedMs > 0 ? updatedMs : Date.now()) / 1000);
  return undefined;
}

function syncSqliteSessions(dataDir, selected, targetProvider) {
  const dbPath = path.join(dataDir, STATE_DB_FILE);
  const db = new DatabaseSync(dbPath);
  try {
    db.exec('PRAGMA busy_timeout = 3000');
    const columns = db.prepare('PRAGMA table_info(threads)').all();
    const columnNames = new Set(columns.map((row) => String(row.name || '')));
    const hasModelProvider = columnNames.has('model_provider');
    const existingStmt = db.prepare('SELECT id FROM threads WHERE id = ?');
    const missing = [];
    const existingIds = [];
    for (const item of selected) {
      if (existingStmt.get(item.id)) existingIds.push(item.id);
      else missing.push(item);
    }

    let updated = 0;
    if (hasModelProvider && existingIds.length) {
      const updateStmt = db.prepare(`
        UPDATE threads
        SET model_provider = ?
        WHERE id = ? AND COALESCE(model_provider, '') <> ?
      `);
      for (const id of existingIds) {
        const info = updateStmt.run(targetProvider, id, targetProvider);
        updated += Number(info.changes || 0);
      }
    }

    let inserted = 0;
    const skipped = [];
    for (const item of missing) {
      const values = new Map();
      for (const column of columns) {
        const name = String(column.name || '');
        const value = sqliteSessionColumnValue(item, targetProvider, name);
        if (value !== undefined) values.set(name, value);
      }
      const missingRequired = columns
        .filter((column) => !column.pk && column.notnull && column.dflt_value == null)
        .map((column) => String(column.name || ''))
        .filter((name) => !values.has(name) || values.get(name) == null);
      if (!values.has('id') || missingRequired.length) {
        skipped.push({
          id: item.shortId || shortId(item.id),
          reason: 'unsupported_sqlite_schema',
          missingColumns: missingRequired,
        });
        continue;
      }
      const names = [...values.keys()];
      const stmt = db.prepare(`INSERT INTO threads (${names.map(quoteSqliteIdent).join(', ')}) VALUES (${names.map(() => '?').join(', ')})`);
      const info = stmt.run(...names.map((name) => values.get(name)));
      inserted += Number(info.changes || 0);
    }

    return { updated, inserted, skipped };
  } finally {
    db.close();
  }
}

async function rewriteRolloutProvider(file, targetProvider) {
  if (!file?.absolutePath) return null;
  const info = await readFirstLineInfo(file.absolutePath);
  if (!info.firstLine.trim()) return null;
  let parsed = null;
  try {
    parsed = JSON.parse(info.firstLine);
  } catch {
    return null;
  }
  if (parsed?.type && parsed.type !== 'session_meta') return null;
  if (!parsed.payload || typeof parsed.payload !== 'object') parsed.payload = {};
  const previousProvider = normalizeText(parsed.payload.model_provider || parsed.payload.modelProvider, 80) || null;
  if (previousProvider === targetProvider) return null;
  parsed.payload.model_provider = targetProvider;
  delete parsed.payload.modelProvider;

  const dir = path.dirname(file.absolutePath);
  const temp = path.join(dir, `.${path.basename(file.absolutePath)}.visibility-repair.${process.pid}.${Date.now()}`);
  const out = createWriteStream(temp, { encoding: 'utf8' });
  try {
    out.write(JSON.stringify(parsed));
    out.write(info.separator || '\n');
    if (info.nextOffset > 0) {
      await pipeline(createReadStream(file.absolutePath, { start: info.nextOffset }), out, { end: true });
    } else {
      out.end();
      await new Promise((resolve, reject) => {
        out.on('finish', resolve);
        out.on('error', reject);
      });
    }
    await fs.rename(temp, file.absolutePath);
  } catch (err) {
    out.destroy();
    await fs.rm(temp, { force: true }).catch(() => {});
    throw err;
  }

  return {
    relativePath: file.relativePath,
    previousProvider,
    targetProvider,
  };
}

async function repairRolloutProviders(filesById, ids, dataDir, backupDir, targetProvider) {
  const changes = [];
  for (const id of ids) {
    const file = filesById.get(id);
    if (!file?.absolutePath || !isInside(dataDir, file.absolutePath)) continue;
    const changed = await rewriteRolloutProvider(file, targetProvider);
    if (changed) changes.push(changed);
  }
  if (changes.length) {
    await fs.writeFile(path.join(backupDir, 'rollout-provider-changes.json'), `${JSON.stringify({
      note: 'Only first-line session_meta provider values are recorded. Prompt/content/token bodies are not copied or exposed.',
      changes,
    }, null, 2)}\n`, 'utf8');
  }
  return changes;
}

function setIndexProvider(row, targetProvider) {
  row.model_provider = targetProvider;
  if (Object.prototype.hasOwnProperty.call(row, 'modelProvider')) {
    row.modelProvider = targetProvider;
  }
}

function sessionIndexRowForItem(item, existing, targetProvider) {
  const row = existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {};
  row.id = item.id;
  if (!normalizeText(row.thread_name || row.title || row.name, 120)) {
    row.thread_name = item.title || item.shortId || item.id;
  }
  if (item.cwd) row.cwd = item.cwd;
  if (item.source && !normalizeText(row.source || row.thread_source, 80)) row.source = item.source;
  const updatedAt = Number(item.updatedAt || 0);
  if (Number.isFinite(updatedAt) && updatedAt > 0) {
    row.updated_at_ms = updatedAt;
    row.updated_at = Math.floor(updatedAt / 1000);
  }
  row.archived = false;
  if (Object.prototype.hasOwnProperty.call(row, 'is_archived')) row.is_archived = false;
  if (Object.prototype.hasOwnProperty.call(row, 'isArchived')) row.isArchived = false;
  setIndexProvider(row, targetProvider);
  return row;
}

async function rewriteSessionIndexProviders(dataDir, selected, backupDir, targetProvider) {
  const indexPath = path.join(dataDir, SESSION_INDEX_FILE);
  const selectedById = new Map(selected.map((item) => [item.id, item]));
  if (!selectedById.size) return { changed: false, updated: 0, inserted: 0 };

  const latestById = new Map();
  const kept = [];
  let existingMatched = 0;
  let content = '';
  if (await exists(indexPath)) {
    await copyIfExists(indexPath, path.join(backupDir, SESSION_INDEX_FILE));
    content = await fs.readFile(indexPath, 'utf8');
  }

  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let parsed = null;
    try {
      parsed = JSON.parse(line);
    } catch {
      kept.push(line);
      continue;
    }
    const id = String(parsed?.id || '').trim();
    if (id && selectedById.has(id)) {
      latestById.set(id, parsed);
      existingMatched += 1;
      continue;
    }
    kept.push(line);
  }

  const appended = [];
  let updated = 0;
  let inserted = 0;
  for (const item of selected) {
    const existing = latestById.get(item.id) || null;
    if (existing) updated += 1;
    else inserted += 1;
    appended.push(JSON.stringify(sessionIndexRowForItem(item, existing, targetProvider)));
  }

  const next = [...kept, ...appended].join('\n') + '\n';
  await fs.writeFile(indexPath, next, 'utf8');
  return {
    changed: true,
    updated,
    inserted,
    removedDuplicateRows: Math.max(0, existingMatched - updated),
  };
}

export async function repairCodexSessionVisibility({ sessionIds = [], targetProvider = null } = {}) {
  const ids = [...new Set((Array.isArray(sessionIds) ? sessionIds : []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) {
    return { ok: false, error: 'No session ids selected', repairedCount: 0 };
  }

  const dataDir = path.resolve(codexHome());
  const currentModelProvider = normalizeText(targetProvider, 80) || await readCurrentModelProvider(dataDir);
  const all = await listCodexSessions({ archivedOnly: false });
  const byId = new Map(all.sessions.map((item) => [item.id, item]));
  const files = await collectSessionFiles(dataDir);
  const filesById = new Map();
  for (const file of files) {
    if (file.id && !filesById.has(file.id)) filesById.set(file.id, file);
  }

  const selected = [];
  const rejected = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (!item) {
      rejected.push({ id: shortId(id), reason: 'not_found' });
      continue;
    }
    if (item.archived) {
      rejected.push({ id: item.shortId || shortId(id), reason: 'archived' });
      continue;
    }
    const provider = effectiveProvider(item);
    const fileProviderMismatch = Boolean(item.fileModelProvider && item.fileModelProvider !== currentModelProvider);
    const indexProviderMismatch = Boolean(item.indexModelProvider && item.indexModelProvider !== currentModelProvider);
    const indexProviderMissing = Boolean(item.indexRowExists && !item.indexModelProvider);
    const indexMissing = Boolean(!item.indexRowExists);
    const indexArchivedMismatch = Boolean(item.indexArchived);
    const expectedCwd = comparablePath(item.cwd);
    const indexedCwd = comparablePath(item.indexCwd);
    const indexCwdMissing = Boolean(item.indexRowExists && expectedCwd && !indexedCwd);
    const indexCwdMismatch = Boolean(item.indexRowExists && expectedCwd && indexedCwd && expectedCwd !== indexedCwd);
    const sqliteMissing = Boolean(!item.threadRowExists && item.fileExists);
    if (provider === currentModelProvider && !fileProviderMismatch && !indexProviderMismatch && !indexProviderMissing && !indexMissing && !indexArchivedMismatch && !indexCwdMissing && !indexCwdMismatch && !sqliteMissing) {
      rejected.push({ id: item.shortId || shortId(id), reason: 'already_visible' });
      continue;
    }
    selected.push(item);
  }

  if (!selected.length) {
    return {
      ok: false,
      error: 'No sessions need visibility repair',
      repairedCount: 0,
      targetProvider: currentModelProvider,
      rejected,
    };
  }

  const backupDir = await createVisibilityBackupDir();
  const sqliteBackups = [];
  for (const name of [STATE_DB_FILE, `${STATE_DB_FILE}-wal`, `${STATE_DB_FILE}-shm`]) {
    const copied = await copyIfExists(path.join(dataDir, name), path.join(backupDir, name));
    if (copied) sqliteBackups.push(name);
  }

  let sqliteSync = { updated: 0, inserted: 0, skipped: [] };
  const selectedIds = selected.map((item) => item.id);
  const dbPath = path.join(dataDir, STATE_DB_FILE);
  if (await exists(dbPath)) {
    sqliteSync = syncSqliteSessions(dataDir, selected, currentModelProvider);
  }
  const rolloutChanges = await repairRolloutProviders(filesById, selectedIds, dataDir, backupDir, currentModelProvider);
  const sessionIndex = await rewriteSessionIndexProviders(dataDir, selected, backupDir, currentModelProvider);

  await fs.writeFile(path.join(backupDir, 'manifest.json'), `${JSON.stringify({
    createdAt: new Date().toISOString(),
    codexDataRoot: 'CODEX_HOME',
    requestedCount: ids.length,
    repairedCount: selected.length,
    targetProvider: currentModelProvider,
    repairedSessions: selected.map((item) => ({
      id: item.id,
      shortId: item.shortId,
      title: item.title,
      previousProvider: effectiveProvider(item),
      fileProvider: item.fileModelProvider || null,
      indexProvider: item.indexModelProvider || null,
      indexRowExists: Boolean(item.indexRowExists),
      indexArchived: Boolean(item.indexArchived),
      indexCwd: item.indexCwd || null,
      cwd: item.cwd || null,
      rolloutPath: item.rolloutPath || null,
      approvalMode: item.approvalMode || null,
      sandboxPolicy: item.sandboxPolicy || null,
    })),
    rejected,
    sqliteBackups,
    sqliteSync,
    updatedRolloutFileCount: rolloutChanges.length,
    sessionIndex,
    note: 'Session visibility repair only updates Codex sidebar metadata (provider, index, cwd, archived flag, and missing thread rows). Prompt/content/token bodies are not copied or exposed.',
  }, null, 2)}\n`, 'utf8');

  return {
    ok: true,
    repairedCount: selected.length,
    requestedCount: ids.length,
    targetProvider: currentModelProvider,
    rejected,
    updatedSqliteRows: sqliteSync.updated,
    insertedSqliteRows: sqliteSync.inserted,
    skippedSqliteRows: sqliteSync.skipped,
    updatedRolloutFileCount: rolloutChanges.length,
    updatedSessionIndexRows: sessionIndex.updated,
    insertedSessionIndexRows: sessionIndex.inserted,
    removedDuplicateSessionIndexRows: sessionIndex.removedDuplicateRows || 0,
    backupLocation: path.join('session-visibility-backups', path.basename(backupDir)),
  };
}

export async function deleteCodexSessions({ sessionIds = [] } = {}) {
  const ids = [...new Set((Array.isArray(sessionIds) ? sessionIds : []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) {
    return { ok: false, error: 'No session ids selected', deletedCount: 0 };
  }
  const dataDir = path.resolve(codexHome());
  const all = await listCodexSessions({ archivedOnly: false });
  const byId = new Map(all.sessions.map((item) => [item.id, item]));
  const files = await collectSessionFiles(dataDir);
  const filesById = new Map();
  for (const file of files) {
    if (file.id && !filesById.has(file.id)) filesById.set(file.id, file);
  }

  const selected = [];
  const rejected = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (!item) {
      rejected.push({ id: shortId(id), reason: 'not_found' });
      continue;
    }
    if (!item.archived) {
      rejected.push({ id: shortId(id), reason: 'not_archived' });
      continue;
    }
    selected.push(item);
  }
  if (!selected.length) {
    return { ok: false, error: 'No archived sessions can be deleted', deletedCount: 0, rejected };
  }

  const trashDir = await createTrashDir();
  const movedFiles = [];
  const dbPath = path.join(dataDir, STATE_DB_FILE);
  const sqliteBackups = [];
  for (const name of [STATE_DB_FILE, `${STATE_DB_FILE}-wal`, `${STATE_DB_FILE}-shm`]) {
    const copied = await copyIfExists(path.join(dataDir, name), path.join(trashDir, name));
    if (copied) sqliteBackups.push(name);
  }

  for (const item of selected) {
    const file = filesById.get(item.id);
    const moved = await moveFileToTrash(dataDir, trashDir, file);
    if (moved) movedFiles.push(moved);
  }

  let deletedRows = 0;
  if (await exists(dbPath)) {
    deletedRows = deleteRowsFromSqlite(dataDir, selected.map((item) => item.id));
  }
  const index = await rewriteSessionIndex(dataDir, selected.map((item) => item.id), trashDir);

  await fs.writeFile(path.join(trashDir, 'manifest.json'), `${JSON.stringify({
    createdAt: new Date().toISOString(),
    codexDataRoot: 'CODEX_HOME',
    requestedCount: ids.length,
    deletedCount: selected.length,
    deletedIds: selected.map((item) => ({ id: item.id, shortId: item.shortId, title: item.title })),
    rejected,
    movedFiles,
    sqliteBackups,
    deletedRows,
    sessionIndexRemoved: index.removed,
    note: 'Archived sessions were removed from Codex state after this backup. Prompt/content/token bodies are not exposed by the Gateway UI.',
  }, null, 2)}\n`, 'utf8');

  return {
    ok: true,
    deletedCount: selected.length,
    requestedCount: ids.length,
    rejected,
    movedFileCount: movedFiles.length,
    deletedRows,
    sessionIndexRemoved: index.removed,
    backupLocation: path.join('session-trash', path.basename(trashDir)),
  };
}
