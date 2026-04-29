import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_CLOSE_TIMEOUT_MS = 20_000;
const DEFAULT_START_TIMEOUT_MS = 15_000;

let lastRestartResult = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function execHidden(file, args, options = {}) {
  return await execFileAsync(file, args, {
    windowsHide: true,
    maxBuffer: 2 * 1024 * 1024,
    ...options,
  });
}

async function runPowerShell(script, timeoutMs = 15_000) {
  const { stdout } = await execHidden(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { timeout: timeoutMs },
  );
  return String(stdout || '').trim();
}

function parseJsonOutput(raw, fallback = []) {
  const text = String(raw || '').trim();
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return fallback;
  }
}

function isHelperCommandLine(commandLine) {
  const lower = String(commandLine || '').toLowerCase();
  return lower.includes('--type=')
    || lower.includes('crashpad_handler')
    || lower.includes('\\resources\\codex.exe')
    || lower.includes('/resources/codex.exe')
    || lower.includes(' app-server');
}

function isWindowsCodexMainProcess(entry) {
  const commandLine = entry?.commandLine || entry?.CommandLine || '';
  const executablePath = entry?.executablePath || entry?.ExecutablePath || '';
  const combined = `${commandLine} ${executablePath}`.toLowerCase();
  if (isHelperCommandLine(combined)) return false;
  if (!combined.includes('codex.exe')) return false;
  return true;
}

function normalizeProcessEntry(entry) {
  return {
    pid: Number(entry.pid ?? entry.ProcessId ?? entry.processId),
    parentPid: Number(entry.parentPid ?? entry.ParentProcessId ?? entry.parentProcessId) || null,
    commandLine: String(entry.commandLine ?? entry.CommandLine ?? ''),
    executablePath: String(entry.executablePath ?? entry.ExecutablePath ?? ''),
  };
}

export async function listCodexProcesses() {
  if (process.platform === 'win32') return await listWindowsCodexProcesses();
  if (process.platform === 'darwin') return await listMacCodexProcesses();
  return [];
}

async function listWindowsCodexProcesses() {
  const script = String.raw`
$items = @(Get-CimInstance Win32_Process -Filter "Name='Codex.exe'" -ErrorAction SilentlyContinue |
  ForEach-Object {
    [PSCustomObject]@{
      pid = [int]$_.ProcessId
      parentPid = [int]$_.ParentProcessId
      commandLine = [string]$_.CommandLine
      executablePath = [string]$_.ExecutablePath
    }
  })
ConvertTo-Json -InputObject $items -Compress
`;
  const raw = await runPowerShell(script, 8_000).catch(() => '');
  return parseJsonOutput(raw)
    .map(normalizeProcessEntry)
    .filter((entry) => Number.isFinite(entry.pid) && entry.pid > 0)
    .filter(isWindowsCodexMainProcess)
    .sort((a, b) => a.pid - b.pid);
}

async function listMacCodexProcesses() {
  const { stdout } = await execHidden('ps', ['-axww', '-o', 'pid=,command='], { timeout: 8_000 })
    .catch(() => ({ stdout: '' }));
  const result = [];
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = /^(\d+)\s+(.+)$/.exec(trimmed);
    if (!match) continue;
    const commandLine = match[2];
    const lower = commandLine.toLowerCase();
    if (!lower.includes('codex.app/contents/macos/codex')) continue;
    if (isHelperCommandLine(lower)) continue;
    result.push({
      pid: Number(match[1]),
      parentPid: null,
      commandLine,
      executablePath: '',
    });
  }
  return result.sort((a, b) => a.pid - b.pid);
}

async function waitForNoCodexProcesses(timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const running = await listCodexProcesses();
    if (!running.length) return { ok: true, running };
    await sleep(300);
  }
  return { ok: false, running: await listCodexProcesses() };
}

async function waitForCodexProcesses(timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const running = await listCodexProcesses();
    if (running.length) return { ok: true, running };
    await sleep(350);
  }
  return { ok: false, running: await listCodexProcesses() };
}

async function closeWindowsCodex(processes, timeoutMs = DEFAULT_CLOSE_TIMEOUT_MS) {
  const targets = [...new Set(processes.map((item) => item.pid).filter(Boolean))].sort((a, b) => a - b);
  const errors = [];
  for (const pid of targets) {
    await execHidden('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { timeout: 10_000 })
      .catch((error) => {
        errors.push({
          pid,
          message: String(error?.stderr || error?.message || error),
        });
      });
  }
  const wait = await waitForNoCodexProcesses(timeoutMs);
  return {
    ok: wait.ok,
    requestedPids: targets,
    remaining: wait.running,
    errors,
  };
}

async function closeMacCodex(processes, timeoutMs = DEFAULT_CLOSE_TIMEOUT_MS) {
  const targets = [...new Set(processes.map((item) => item.pid).filter(Boolean))].sort((a, b) => a - b);
  const errors = [];
  for (const pid of targets) {
    await execHidden('kill', ['-TERM', String(pid)], { timeout: 5_000 }).catch((error) => {
      errors.push({ pid, message: String(error?.message || error) });
    });
  }
  let wait = await waitForNoCodexProcesses(Math.min(timeoutMs, 8_000));
  if (!wait.ok) {
    for (const item of wait.running) {
      await execHidden('kill', ['-KILL', String(item.pid)], { timeout: 5_000 }).catch((error) => {
        errors.push({ pid: item.pid, message: String(error?.message || error) });
      });
    }
    wait = await waitForNoCodexProcesses(Math.max(1_000, timeoutMs - 8_000));
  }
  return {
    ok: wait.ok,
    requestedPids: targets,
    remaining: wait.running,
    errors,
  };
}

async function closeCodexApp(processes, timeoutMs = DEFAULT_CLOSE_TIMEOUT_MS) {
  if (!processes.length) {
    return { ok: true, requestedPids: [], remaining: [], errors: [] };
  }
  if (process.platform === 'win32') return await closeWindowsCodex(processes, timeoutMs);
  if (process.platform === 'darwin') return await closeMacCodex(processes, timeoutMs);
  return {
    ok: false,
    requestedPids: processes.map((item) => item.pid),
    remaining: processes,
    errors: [{ message: `当前平台暂不支持自动关闭 Codex App: ${process.platform}` }],
  };
}

async function startWindowsCodexApp(timeoutMs = DEFAULT_START_TIMEOUT_MS) {
  const script = String.raw`
$ErrorActionPreference = 'Stop'
$entry = Get-StartApps | Where-Object { $_.AppID -like 'OpenAI.Codex_*' } | Select-Object -First 1
if ($entry -and -not [string]::IsNullOrWhiteSpace($entry.AppID)) {
  $target = 'shell:AppsFolder\' + [string]$entry.AppID.Trim()
  Start-Process -FilePath $target
  Write-Output ('STARTED|store-appid|' + $target)
  exit 0
}
$pkg = Get-AppxPackage -Name 'OpenAI.Codex' -ErrorAction SilentlyContinue |
  Sort-Object -Property Version -Descending |
  Select-Object -First 1
if ($pkg -and -not [string]::IsNullOrWhiteSpace($pkg.PackageFamilyName)) {
  $target = 'shell:AppsFolder\' + [string]($pkg.PackageFamilyName.Trim() + '!App')
  Start-Process -FilePath $target
  Write-Output ('STARTED|appx-family|' + $target)
  exit 0
}
if ($pkg -and -not [string]::IsNullOrWhiteSpace($pkg.InstallLocation)) {
  $exe = Join-Path ([string]$pkg.InstallLocation.Trim()) 'app\Codex.exe'
  if (Test-Path $exe) {
    Start-Process -FilePath $exe
    Write-Output ('STARTED|exe-path|' + $exe)
    exit 0
  }
}
throw '未找到 Codex App 的系统启动入口'
`;
  const stdout = await runPowerShell(script, 15_000);
  const wait = await waitForCodexProcesses(timeoutMs);
  return {
    ok: wait.ok,
    method: stdout.includes('STARTED|') ? stdout.split('|')[1] : 'unknown',
    target: stdout.includes('STARTED|') ? stdout.split('|').slice(2).join('|') : stdout,
    pids: wait.running.map((item) => item.pid),
    running: wait.running,
  };
}

async function startMacCodexApp(timeoutMs = DEFAULT_START_TIMEOUT_MS) {
  await execHidden('open', ['-n', '-a', 'Codex'], { timeout: 10_000 });
  const wait = await waitForCodexProcesses(timeoutMs);
  return {
    ok: wait.ok,
    method: 'open-app',
    target: 'Codex',
    pids: wait.running.map((item) => item.pid),
    running: wait.running,
  };
}

async function startCodexApp(timeoutMs = DEFAULT_START_TIMEOUT_MS) {
  if (process.platform === 'win32') return await startWindowsCodexApp(timeoutMs);
  if (process.platform === 'darwin') return await startMacCodexApp(timeoutMs);
  return {
    ok: false,
    method: 'unsupported',
    target: null,
    pids: [],
    running: [],
    error: `当前平台暂不支持自动启动 Codex App: ${process.platform}`,
  };
}

export async function restartCodexApp(options = {}) {
  const startedAt = Date.now();
  const closeTimeoutMs = Number(options.closeTimeoutMs || DEFAULT_CLOSE_TIMEOUT_MS);
  const startTimeoutMs = Number(options.startTimeoutMs || DEFAULT_START_TIMEOUT_MS);
  const before = await listCodexProcesses();
  const close = await closeCodexApp(before, closeTimeoutMs);
  let beforeStartTask = null;
  if (typeof options.beforeStart === 'function') {
    try {
      beforeStartTask = await options.beforeStart({ before, close });
    } catch (error) {
      beforeStartTask = {
        ok: false,
        error: String(error?.message || error),
      };
    }
  }
  await sleep(Number(options.startDelayMs || 500));
  const start = await startCodexApp(startTimeoutMs);
  const result = {
    ok: close.ok && start.ok && (beforeStartTask ? beforeStartTask.ok !== false : true),
    platform: process.platform,
    before,
    close,
    beforeStartTask,
    start,
    startedAt,
    finishedAt: Date.now(),
  };
  lastRestartResult = result;
  return result;
}

export function scheduleCodexAppRestart(options = {}) {
  const delayMs = Number(options.delayMs || 900);
  const scheduledAt = Date.now();
  setTimeout(() => {
    restartCodexApp(options).catch((error) => {
      lastRestartResult = {
        ok: false,
        platform: process.platform,
        scheduledAt,
        finishedAt: Date.now(),
        error: String(error?.message || error),
      };
      console.error('[codex-app] restart failed:', error);
    });
  }, delayMs).unref?.();
  return {
    ok: true,
    scheduled: true,
    delayMs,
    scheduledAt,
  };
}

export function scheduleCodexAppRestartWithTask(options = {}, beforeStart) {
  return scheduleCodexAppRestart({
    ...options,
    beforeStart,
  });
}

export function getLastCodexAppRestartResult() {
  return lastRestartResult;
}
