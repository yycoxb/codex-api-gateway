import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_CLOSE_TIMEOUT_MS = 20_000;
const DEFAULT_START_TIMEOUT_MS = 15_000;

let lastRestartResult = null;
let lastControlResult = null;

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

function safePowerShellErrorMessage(error, fallback = '启动 Codex App 失败') {
  const raw = String(error?.stderr || error?.stdout || error?.message || error || '').trim();
  if (!raw) return fallback;
  if (raw.includes('未找到 Codex App 的系统启动入口')) return '未找到 Codex App 的系统启动入口';
  const line = raw
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item && !item.includes('-Command') && !item.startsWith('At line:'));
  return (line || fallback).slice(0, 240);
}

async function startWindowsCodexApp(timeoutMs = DEFAULT_START_TIMEOUT_MS) {
  const script = String.raw`
$ErrorActionPreference = 'Stop'
function Start-CodexTarget([string]$kind, [string]$target) {
  if ([string]::IsNullOrWhiteSpace($target)) { return }
  if ($target -like 'shell:AppsFolder\*') {
    Start-Process -FilePath 'explorer.exe' -ArgumentList $target
  } else {
    Start-Process -FilePath $target
  }
  Write-Output ('STARTED|' + $kind + '|' + $target)
  exit 0
}
$entry = Get-StartApps | Where-Object {
  $_.AppID -like 'OpenAI.Codex_*' -or $_.AppID -match 'Codex' -or $_.Name -match 'Codex'
} | Select-Object -First 1
if ($entry -and -not [string]::IsNullOrWhiteSpace($entry.AppID)) {
  $target = 'shell:AppsFolder\' + [string]$entry.AppID.Trim()
  Start-CodexTarget 'start-apps' $target
}
$pkg = Get-AppxPackage -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -eq 'OpenAI.Codex' -or $_.Name -match 'Codex' -or $_.PackageFamilyName -match 'Codex' } |
  Sort-Object -Property Version -Descending |
  Select-Object -First 1
if ($pkg -and -not [string]::IsNullOrWhiteSpace($pkg.PackageFamilyName)) {
  $target = 'shell:AppsFolder\' + [string]($pkg.PackageFamilyName.Trim() + '!App')
  Start-CodexTarget 'appx-family' $target
}
$candidates = @()
if ($pkg -and -not [string]::IsNullOrWhiteSpace($pkg.InstallLocation)) {
  $candidates += (Join-Path ([string]$pkg.InstallLocation.Trim()) 'app\Codex.exe')
}
$runningExe = Get-CimInstance Win32_Process -Filter "Name='Codex.exe'" -ErrorAction SilentlyContinue |
  Where-Object { [string]$_.ExecutablePath -and [string]$_.ExecutablePath -notlike '*\resources\codex.exe' } |
  Select-Object -ExpandProperty ExecutablePath -First 1
if ($runningExe) { $candidates += [string]$runningExe }
$windowsApps = Join-Path $env:ProgramFiles 'WindowsApps'
if (Test-Path $windowsApps) {
  $candidates += @(Get-ChildItem -LiteralPath $windowsApps -Directory -Filter 'OpenAI.Codex_*' -ErrorAction SilentlyContinue |
    Sort-Object -Property LastWriteTime -Descending |
    ForEach-Object { Join-Path $_.FullName 'app\Codex.exe' })
}
if ($env:LOCALAPPDATA) {
  $candidates += (Join-Path $env:LOCALAPPDATA 'Programs\Codex\Codex.exe')
  $candidates += (Join-Path $env:LOCALAPPDATA 'Programs\codex\Codex.exe')
  $candidates += (Join-Path $env:LOCALAPPDATA 'Programs\OpenAI Codex\Codex.exe')
}
foreach ($exe in @($candidates | Where-Object { $_ } | Select-Object -Unique)) {
  if (Test-Path $exe) { Start-CodexTarget 'exe-path' $exe }
}
throw '未找到 Codex App 的系统启动入口'
`;
  let stdout = '';
  try {
    stdout = await runPowerShell(script, 15_000);
  } catch (error) {
    throw new Error(safePowerShellErrorMessage(error));
  }
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

export async function closeCodexAppWindow(options = {}) {
  const startedAt = Date.now();
  const closeTimeoutMs = Number(options.closeTimeoutMs || DEFAULT_CLOSE_TIMEOUT_MS);
  const before = await listCodexProcesses();
  const close = await closeCodexApp(before, closeTimeoutMs);
  const result = {
    ok: close.ok,
    action: 'close',
    platform: process.platform,
    before,
    close,
    startedAt,
    finishedAt: Date.now(),
  };
  lastControlResult = result;
  return result;
}

export async function openCodexAppWindow(options = {}) {
  const startedAt = Date.now();
  const startTimeoutMs = Number(options.startTimeoutMs || DEFAULT_START_TIMEOUT_MS);
  const before = await listCodexProcesses();
  let start = null;
  let alreadyRunning = false;
  let error = null;
  if (before.length) {
    alreadyRunning = true;
  } else {
    try {
      start = await startCodexApp(startTimeoutMs);
    } catch (err) {
      error = String(err?.message || err);
      start = {
        ok: false,
        method: 'error',
        target: null,
        pids: [],
        running: [],
        error,
      };
    }
  }
  const running = alreadyRunning ? before : (start?.running || []);
  const result = {
    ok: alreadyRunning || Boolean(start?.ok),
    action: 'open',
    platform: process.platform,
    alreadyRunning,
    before,
    start,
    running,
    error,
    startedAt,
    finishedAt: Date.now(),
  };
  lastControlResult = result;
  return result;
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

export function getLastCodexAppControlResult() {
  return lastControlResult;
}
