import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const NODE_PROCESS_NAMES = new Set(['node.exe', 'node', 'npx.exe', 'npx', 'npm.exe', 'npm', 'pnpm.exe', 'pnpm', 'yarn.exe', 'yarn']);
const COMMAND_PREVIEW_MAX = 360;
const MCP_PATTERNS = [
  'mcp',
  'modelcontextprotocol',
  'chrome-devtools',
  'playwright',
  'puppeteer',
  'drawio',
  'sequential-thinking',
  'shrimp-task-manager',
  'exa',
  'context7',
  'filesystem',
  'desktop-commander',
  'node_repl',
  'paper_downloader',
  'remote_server',
  'windows_info',
  'browser-use',
  'browser',
  'openai-bundled',
  'openai-primary-runtime',
  'openai-curated',
];

function normalizeSlash(value) {
  return String(value || '').replace(/\\/g, '/').toLowerCase();
}

function currentRepoMarkers() {
  const cwd = normalizeSlash(process.cwd());
  const markers = new Set([
    cwd,
    normalizeSlash(path.basename(process.cwd())),
    'codex-api-gateway',
    'src/server.js',
    'src\\server.js',
  ]);
  return [...markers].filter(Boolean);
}

function maskSecrets(value) {
  let text = String(value || '');
  text = text.replace(/(bearer\s+)[^\s"']+/ig, '$1[redacted]');
  text = text.replace(/((?:api[_-]?key|token|secret|password|authorization|refresh[_-]?token|access[_-]?token)\s*[=:]\s*)["']?[^"'\s]+/ig, '$1[redacted]');
  text = text.replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, 'sk-[redacted]');
  text = text.replace(/\b(agt_[A-Za-z0-9_-]{12,})\b/g, 'agt_[redacted]');
  const home = os.homedir();
  if (home) text = text.replaceAll(home, '%USERPROFILE%');
  text = text.replace(/%USERPROFILE%[^\s"']*(?:auth|accounts|config)\.json/ig, '%USERPROFILE%\\[sensitive-json]');
  text = text.replace(/%USERPROFILE%[^\s"']*\.env\b/ig, '%USERPROFILE%\\[sensitive-env]');
  return text;
}

function commandPreview(commandLine) {
  const text = maskSecrets(commandLine).replace(/\s+/g, ' ').trim();
  if (text.length <= COMMAND_PREVIEW_MAX) return text;
  return `${text.slice(0, COMMAND_PREVIEW_MAX - 1)}…`;
}

function numberValue(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function parseJsonArray(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed);
  if (!parsed) return [];
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function listWindowsProcessesRaw() {
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    "$items = Get-CimInstance Win32_Process | Where-Object { @('node.exe','npx.exe','npm.exe','pnpm.exe','yarn.exe') -contains $_.Name } | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine,WorkingSetSize",
    'if ($items) { $items | ConvertTo-Json -Depth 3 -Compress } else { "[]" }',
  ].join('; ');
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script,
  ], {
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
    timeout: 15000,
  });
  return parseJsonArray(stdout);
}

async function listUnixProcessesRaw() {
  const { stdout } = await execFileAsync('ps', ['-eo', 'pid=,ppid=,rss=,comm=,args='], {
    maxBuffer: 8 * 1024 * 1024,
    timeout: 15000,
  });
  const rows = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    if (!match) continue;
    const name = path.basename(match[4]);
    if (!NODE_PROCESS_NAMES.has(name.toLowerCase())) continue;
    rows.push({
      ProcessId: Number(match[1]),
      ParentProcessId: Number(match[2]),
      Name: name,
      ExecutablePath: match[4],
      CommandLine: match[5],
      WorkingSetSize: Number(match[3]) * 1024,
    });
  }
  return rows;
}

async function listProcessesRaw() {
  if (process.platform === 'win32') return await listWindowsProcessesRaw();
  return await listUnixProcessesRaw();
}

function classifyProcess(row) {
  const pid = numberValue(row.ProcessId ?? row.processId ?? row.pid);
  const ppid = numberValue(row.ParentProcessId ?? row.parentProcessId ?? row.ppid);
  const name = String(row.Name || row.name || '').trim();
  const commandLine = String(row.CommandLine || row.commandLine || '');
  const commandLower = normalizeSlash(commandLine);
  const executablePath = String(row.ExecutablePath || row.executablePath || '').trim();
  const memoryBytes = numberValue(row.WorkingSetSize ?? row.workingSetSize ?? row.rssBytes);

  const reasons = [];
  const matches = MCP_PATTERNS.filter((pattern) => commandLower.includes(pattern));
  const repoMarkers = currentRepoMarkers();
  const protectedByRepo = repoMarkers.some((marker) => marker && commandLower.includes(marker));
  const protectedByPid = pid === process.pid;

  if (protectedByPid) reasons.push('current_gateway_process');
  if (protectedByRepo) reasons.push('gateway_or_repo_process');
  if (!matches.length) reasons.push('not_recognized_as_mcp');

  const protectedProcess = protectedByPid || protectedByRepo;
  const killable = !protectedProcess && matches.length > 0;
  const category = protectedProcess ? 'protected' : (killable ? 'suspected_mcp' : 'node_other');

  return {
    pid,
    parentPid: ppid || null,
    name,
    memoryBytes,
    memoryMb: Math.round(memoryBytes / 1024 / 1024 * 10) / 10,
    commandPreview: commandPreview(commandLine || executablePath || name),
    executableName: executablePath ? path.basename(executablePath) : name,
    category,
    killable,
    protected: protectedProcess,
    mcpMatches: matches.slice(0, 5),
    reasons,
  };
}

export async function listNodeProcessCleanupCandidates() {
  const startedAt = Date.now();
  const rows = await listProcessesRaw();
  const processes = rows
    .map(classifyProcess)
    .filter((item) => item.pid > 0)
    .sort((a, b) => (
      Number(b.killable) - Number(a.killable) ||
      b.memoryBytes - a.memoryBytes ||
      a.pid - b.pid
    ));
  const killable = processes.filter((item) => item.killable);
  return {
    ok: true,
    platform: process.platform,
    count: processes.length,
    killableCount: killable.length,
    totalMemoryMb: Math.round(processes.reduce((sum, item) => sum + item.memoryBytes, 0) / 1024 / 1024 * 10) / 10,
    killableMemoryMb: Math.round(killable.reduce((sum, item) => sum + item.memoryBytes, 0) / 1024 / 1024 * 10) / 10,
    processes,
    startedAt,
    finishedAt: Date.now(),
  };
}

async function killOneProcess(pid) {
  if (process.platform === 'win32') {
    await execFileAsync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
      windowsHide: true,
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    });
    return;
  }
  await execFileAsync('kill', ['-TERM', String(pid)], { timeout: 10000 });
}

export async function killNodeProcessCleanupCandidates({ pids = [], confirmed = false } = {}) {
  if (!confirmed) return { ok: false, error: 'confirmation_required', killedCount: 0 };
  const requested = [...new Set((Array.isArray(pids) ? pids : []).map((pid) => Number(pid)).filter((pid) => Number.isInteger(pid) && pid > 0))];
  if (!requested.length) return { ok: false, error: 'No process ids selected', killedCount: 0 };

  const snapshot = await listNodeProcessCleanupCandidates();
  const byPid = new Map(snapshot.processes.map((item) => [item.pid, item]));
  const killed = [];
  const rejected = [];

  for (const pid of requested) {
    const item = byPid.get(pid);
    if (!item) {
      rejected.push({ pid, reason: 'not_found' });
      continue;
    }
    if (!item.killable) {
      rejected.push({ pid, reason: 'not_killable', details: item.reasons });
      continue;
    }
    try {
      await killOneProcess(pid);
      killed.push({
        pid,
        memoryMb: item.memoryMb,
        mcpMatches: item.mcpMatches,
        commandPreview: item.commandPreview,
      });
    } catch (err) {
      rejected.push({ pid, reason: 'kill_failed', error: String(err?.message || err) });
    }
  }

  return {
    ok: killed.length > 0,
    killedCount: killed.length,
    requestedCount: requested.length,
    rejected,
    killed,
  };
}
