import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const CLASH_VERGE_EXE_PATH = 'E:\\BaiduNetdiskDownload\\clash-verge.exe';
const CLASH_VERGE_PIPE = '\\\\.\\pipe\\verge-mihomo';
const CLASH_PROCESS_NAMES = new Set(['clash-verge.exe', 'clash-verge-service.exe', 'verge-mihomo.exe']);
const CLASH_UI_PROCESS_NAME = 'clash-verge.exe';

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

async function runPowerShell(script, timeoutMs = 10_000) {
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

function normalizeProcessEntry(entry) {
  return {
    pid: Number(entry.pid ?? entry.ProcessId ?? entry.processId),
    name: String(entry.name ?? entry.Name ?? ''),
    executablePath: String(entry.executablePath ?? entry.ExecutablePath ?? ''),
  };
}

export async function listClashVergeProcesses() {
  if (process.platform !== 'win32') return [];
  const script = String.raw`
$names = @('clash-verge.exe', 'clash-verge-service.exe', 'verge-mihomo.exe')
$items = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object { $names -contains $_.Name } |
  ForEach-Object {
    [PSCustomObject]@{
      pid = [int]$_.ProcessId
      name = [string]$_.Name
      executablePath = [string]$_.ExecutablePath
    }
  })
ConvertTo-Json -InputObject $items -Compress
`;
  const raw = await runPowerShell(script, 8_000).catch(() => '');
  return parseJsonOutput(raw)
    .map(normalizeProcessEntry)
    .filter((entry) => Number.isFinite(entry.pid) && entry.pid > 0)
    .filter((entry) => CLASH_PROCESS_NAMES.has(entry.name.toLowerCase()))
    .sort((a, b) => a.pid - b.pid);
}

function chunkedBodyToString(text) {
  let offset = 0;
  let output = '';
  while (offset < text.length) {
    const lineEnd = text.indexOf('\r\n', offset);
    if (lineEnd < 0) break;
    const sizeText = text.slice(offset, lineEnd).split(';')[0].trim();
    const size = Number.parseInt(sizeText, 16);
    if (!Number.isFinite(size) || size < 0) break;
    offset = lineEnd + 2;
    if (size === 0) break;
    output += text.slice(offset, offset + size);
    offset += size + 2;
  }
  return output;
}

function parseHttpResponse(buffer) {
  const separator = Buffer.from('\r\n\r\n');
  const index = buffer.indexOf(separator);
  const headText = (index >= 0 ? buffer.subarray(0, index) : buffer).toString('utf8');
  const bodyBuffer = index >= 0 ? buffer.subarray(index + separator.length) : Buffer.alloc(0);
  const status = Number((/^HTTP\/\S+\s+(\d+)/i.exec(headText) || [])[1] || 0);
  const headers = {};
  for (const line of headText.split(/\r?\n/).slice(1)) {
    const splitAt = line.indexOf(':');
    if (splitAt <= 0) continue;
    headers[line.slice(0, splitAt).trim().toLowerCase()] = line.slice(splitAt + 1).trim();
  }
  let bodyText = bodyBuffer.toString('utf8');
  if (/chunked/i.test(headers['transfer-encoding'] || '')) {
    bodyText = chunkedBodyToString(bodyText);
  }
  return { status, headers, bodyText };
}

async function mihomoPipeRequest(method, path, body = null, timeoutMs = 5_000) {
  const bodyText = body == null ? '' : JSON.stringify(body);
  const headers = [
    `${method} ${path} HTTP/1.1`,
    'Host: 127.0.0.1',
    'Connection: close',
  ];
  if (bodyText) {
    headers.push('Content-Type: application/json');
    headers.push(`Content-Length: ${Buffer.byteLength(bodyText)}`);
  }
  const requestText = `${headers.join('\r\n')}\r\n\r\n${bodyText}`;

  return await new Promise((resolve, reject) => {
    const chunks = [];
    const client = net.createConnection(CLASH_VERGE_PIPE);
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      client.destroy();
      reject(new Error('mihomo pipe request timeout'));
    }, timeoutMs);

    client.on('connect', () => client.write(requestText));
    client.on('data', (chunk) => chunks.push(chunk));
    client.on('end', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const response = parseHttpResponse(Buffer.concat(chunks));
      if (response.status < 200 || response.status >= 300) {
        reject(new Error(`mihomo API returned HTTP ${response.status || 'unknown'}`));
        return;
      }
      resolve(response);
    });
    client.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
  });
}

function summarizeClashConfig(config) {
  return {
    tunEnabled: Boolean(config?.tun?.enable),
    mode: config?.mode || null,
    mixedPort: config?.['mixed-port'] ?? null,
  };
}

export async function getClashVergeState() {
  const processes = await listClashVergeProcesses();
  let config = null;
  let controlOk = false;
  let controlError = null;
  try {
    const response = await mihomoPipeRequest('GET', '/configs', null, 3_000);
    config = response.bodyText ? JSON.parse(response.bodyText) : {};
    controlOk = true;
  } catch (error) {
    controlError = String(error?.message || error);
  }
  return {
    ok: true,
    exePath: CLASH_VERGE_EXE_PATH,
    pipe: CLASH_VERGE_PIPE,
    processes,
    running: processes.some((entry) => entry.name.toLowerCase() === CLASH_UI_PROCESS_NAME),
    coreRunning: processes.some((entry) => entry.name.toLowerCase() === 'verge-mihomo.exe'),
    controlOk,
    controlError,
    config: config ? summarizeClashConfig(config) : null,
  };
}

async function waitForMihomoControl(timeoutMs = 15_000) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    const state = await getClashVergeState();
    if (state.controlOk) return state;
    lastError = state.controlError;
    await sleep(400);
  }
  throw new Error(`mihomo control is not ready: ${lastError || 'timeout'}`);
}

async function setClashTunEnabled(enabled) {
  await mihomoPipeRequest('PATCH', '/configs', { tun: { enable: Boolean(enabled) } }, 6_000);
  await sleep(300);
  const state = await getClashVergeState();
  const actual = Boolean(state.config?.tunEnabled);
  if (actual !== Boolean(enabled)) {
    throw new Error(`TUN state did not change to ${enabled ? 'enabled' : 'disabled'}`);
  }
  return state;
}

function startClashVergeProcess() {
  if (!fs.existsSync(CLASH_VERGE_EXE_PATH)) {
    throw new Error(`未找到 Clash Verge 程序: ${CLASH_VERGE_EXE_PATH}`);
  }
  const child = spawn(CLASH_VERGE_EXE_PATH, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();
}

async function waitForNoClashVergeUi(timeoutMs = 8_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const processes = await listClashVergeProcesses();
    if (!processes.some((entry) => entry.name.toLowerCase() === CLASH_UI_PROCESS_NAME)) {
      return { ok: true, processes };
    }
    await sleep(300);
  }
  return { ok: false, processes: await listClashVergeProcesses() };
}

async function closeClashVergeUi(processes) {
  const targets = [...new Set((processes || [])
    .filter((entry) => entry.name.toLowerCase() === CLASH_UI_PROCESS_NAME)
    .map((entry) => entry.pid))]
    .sort((a, b) => a - b);
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
  const wait = await waitForNoClashVergeUi();
  return {
    ok: wait.ok,
    requestedPids: targets,
    remaining: wait.processes.filter((entry) => entry.name.toLowerCase() === CLASH_UI_PROCESS_NAME),
    errors,
  };
}

export async function openClashVergeAndEnableTun() {
  if (process.platform !== 'win32') {
    return { ok: false, error: `当前平台暂不支持控制 Clash Verge: ${process.platform}` };
  }
  const startedAt = Date.now();
  const before = await listClashVergeProcesses();
  const wasRunning = before.some((entry) => entry.name.toLowerCase() === CLASH_UI_PROCESS_NAME);
  if (!wasRunning) startClashVergeProcess();
  await waitForMihomoControl(18_000);
  const state = await setClashTunEnabled(true);
  const after = await listClashVergeProcesses();
  return {
    ok: Boolean(state.config?.tunEnabled),
    action: 'open-and-enable-tun',
    started: !wasRunning,
    exePath: CLASH_VERGE_EXE_PATH,
    before,
    after,
    state,
    startedAt,
    finishedAt: Date.now(),
  };
}

export async function disableTunAndCloseClashVerge() {
  if (process.platform !== 'win32') {
    return { ok: false, error: `当前平台暂不支持控制 Clash Verge: ${process.platform}` };
  }
  const startedAt = Date.now();
  const before = await listClashVergeProcesses();
  if (!before.length) {
    return {
      ok: true,
      action: 'disable-tun-and-close',
      alreadyStopped: true,
      before,
      state: null,
      close: { ok: true, requestedPids: [], remaining: [], errors: [] },
      after: [],
      startedAt,
      finishedAt: Date.now(),
    };
  }
  let state = null;
  try {
    state = await setClashTunEnabled(false);
  } catch (error) {
    return {
      ok: false,
      action: 'disable-tun-and-close',
      stage: 'disable-tun',
      error: String(error?.message || error),
      before,
      startedAt,
      finishedAt: Date.now(),
    };
  }
  const close = await closeClashVergeUi(before.length ? before : await listClashVergeProcesses());
  const after = await listClashVergeProcesses();
  return {
    ok: state.config?.tunEnabled === false && close.ok,
    action: 'disable-tun-and-close',
    exePath: CLASH_VERGE_EXE_PATH,
    before,
    state,
    close,
    after,
    startedAt,
    finishedAt: Date.now(),
  };
}
