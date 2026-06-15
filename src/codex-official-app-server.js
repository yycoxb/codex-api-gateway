import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { listCodexProcesses } from './codex-process.js';

const execFileAsync = promisify(execFile);
const DEFAULT_RESPONSE_TIMEOUT_MS = 20_000;

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function appServerPathFromLaunchPath(value) {
  const launchPath = String(value || '').trim();
  if (!launchPath) return null;
  const fileName = path.basename(launchPath).toLowerCase();
  const parentName = path.basename(path.dirname(launchPath)).toLowerCase();
  if ((fileName === 'codex.exe' || fileName === 'codex') && parentName === 'resources') {
    return launchPath;
  }
  if (process.platform === 'win32' && fileName === 'codex.exe') {
    return path.join(path.dirname(launchPath), 'resources', 'codex.exe');
  }
  if (process.platform === 'darwin' && fileName === 'codex' && parentName === 'macos') {
    return path.join(path.dirname(path.dirname(launchPath)), 'Resources', 'codex');
  }
  return null;
}

async function windowsAppxAppServerPath() {
  const script = String.raw`
$pkg = Get-AppxPackage -Name 'OpenAI.Codex' -ErrorAction SilentlyContinue |
  Sort-Object -Property Version -Descending |
  Select-Object -First 1
if ($pkg -and -not [string]::IsNullOrWhiteSpace($pkg.InstallLocation)) {
  $candidate = Join-Path ([string]$pkg.InstallLocation.Trim()) 'app\resources\codex.exe'
  if (Test-Path -LiteralPath $candidate) {
    Write-Output $candidate
  }
}
`;
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true, timeout: 10_000, maxBuffer: 256 * 1024 },
  ).catch(() => ({ stdout: '' }));
  const candidate = String(stdout || '').trim();
  return candidate && await exists(candidate) ? candidate : null;
}

async function resolveOfficialAppServerExecutable() {
  const candidates = [];
  const configured = String(process.env.CODEX_APP_SERVER_EXECUTABLE || '').trim();
  if (configured) candidates.push({ path: configured, source: 'environment' });

  const running = await listCodexProcesses().catch(() => []);
  for (const entry of running) {
    const candidate = appServerPathFromLaunchPath(entry.executablePath);
    if (candidate) candidates.push({ path: candidate, source: 'running_codex_app' });
  }

  if (process.platform === 'win32') {
    const candidate = await windowsAppxAppServerPath();
    if (candidate) candidates.push({ path: candidate, source: 'windows_appx' });
  } else if (process.platform === 'darwin') {
    candidates.push({
      path: '/Applications/Codex.app/Contents/Resources/codex',
      source: 'macos_application',
    });
  }

  const seen = new Set();
  for (const candidate of candidates) {
    const key = String(candidate.path || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (await exists(candidate.path)) return candidate;
  }
  throw new Error('Official Codex app-server executable was not found');
}

function safeError(error) {
  const message = String(error?.message || error || 'Unknown official app-server error')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return message.slice(0, 240);
}

function createResponseWaiter(waiters, id, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiters.delete(id);
      reject(new Error(`Official Codex app-server response timed out (id=${id})`));
    }, timeoutMs);
    timer.unref?.();
    waiters.set(id, {
      resolve(value) {
        clearTimeout(timer);
        resolve(value);
      },
      reject(error) {
        clearTimeout(timer);
        reject(error);
      },
    });
  });
}

function writeRequest(child, request) {
  return new Promise((resolve, reject) => {
    child.stdin.write(`${JSON.stringify(request)}\n`, 'utf8', (error) => {
      if (error) reject(new Error('Failed to write to official Codex app-server'));
      else resolve();
    });
  });
}

async function sendRequestAndWait(child, waiters, request, timeoutMs) {
  const id = Number(request?.id);
  const response = createResponseWaiter(waiters, id, timeoutMs);
  try {
    await writeRequest(child, request);
    return await response;
  } catch (error) {
    const waiter = waiters.get(id);
    waiters.delete(id);
    waiter?.reject(error);
    await response.catch(() => {});
    throw error;
  }
}

async function stopChild(child) {
  if (!child || child.exitCode != null || child.killed) return;
  child.kill();
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2_000);
    timer.unref?.();
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export async function rebuildOfficialCodexThreadMetadata({
  dataDir,
  timeoutMs = DEFAULT_RESPONSE_TIMEOUT_MS,
} = {}) {
  let child = null;
  try {
    const executable = await resolveOfficialAppServerExecutable();
    const waiters = new Map();
    let stdoutBuffer = '';
    child = spawn(executable.path, ['app-server', '--listen', 'stdio://'], {
      env: { ...process.env, CODEX_HOME: path.resolve(dataDir) },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || '';
      for (const line of lines) {
        let response = null;
        try { response = JSON.parse(line); } catch {}
        const id = Number(response?.id);
        if (!Number.isFinite(id) || !waiters.has(id)) continue;
        const waiter = waiters.get(id);
        waiters.delete(id);
        if (response?.error) waiter.reject(new Error(`Official Codex app-server returned an error (id=${id})`));
        else if (Object.prototype.hasOwnProperty.call(response || {}, 'result')) waiter.resolve(response.result);
        else waiter.reject(new Error(`Official Codex app-server response has no result (id=${id})`));
      }
    });
    child.stderr.resume();
    child.once('error', () => {
      for (const waiter of waiters.values()) waiter.reject(new Error('Official Codex app-server failed to start'));
      waiters.clear();
    });
    child.once('exit', () => {
      for (const waiter of waiters.values()) waiter.reject(new Error('Official Codex app-server exited before rebuilding metadata'));
      waiters.clear();
    });

    await sendRequestAndWait(child, waiters, {
      method: 'initialize',
      id: 1,
      params: {
        clientInfo: { name: 'codex-api-gateway', version: '0.1.0' },
        capabilities: null,
      },
    }, timeoutMs);

    await sendRequestAndWait(child, waiters, {
      method: 'thread/list',
      id: 2,
      params: {
        cursor: null,
        limit: 1,
        sortKey: 'updated_at',
        sortDirection: 'desc',
        modelProviders: null,
        sourceKinds: [],
        archived: false,
      },
    }, timeoutMs);

    return {
      ok: true,
      method: 'official_app_server_thread_list',
      executableSource: executable.source,
    };
  } catch (error) {
    return {
      ok: false,
      method: 'official_app_server_thread_list',
      error: safeError(error),
    };
  } finally {
    await stopChild(child);
  }
}
