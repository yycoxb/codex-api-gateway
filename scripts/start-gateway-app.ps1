param(
  [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent $ScriptDir
$AppDir = Join-Path $env:USERPROFILE '.codex-api-gateway'
$ConfigPath = Join-Path $AppDir 'config.json'
$PidPath = Join-Path $AppDir 'gateway.pid'
$LogPath = Join-Path $AppDir 'gateway.log'
$ErrPath = Join-Path $AppDir 'gateway.err.log'

function Get-GatewayConfig {
  if (Test-Path $ConfigPath) {
    try { return Get-Content $ConfigPath -Raw | ConvertFrom-Json } catch {}
  }
  return [pscustomobject]@{ host = '127.0.0.1'; port = 55417 }
}

function Test-TcpPort([string]$HostName, [int]$Port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $iar = $client.BeginConnect($HostName, $Port, $null, $null)
    if (-not $iar.AsyncWaitHandle.WaitOne(350, $false)) { return $false }
    $client.EndConnect($iar)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Wait-Gateway([string]$HostName, [int]$Port) {
  for ($i = 0; $i -lt 40; $i++) {
    if (Test-TcpPort $HostName $Port) { return $true }
    Start-Sleep -Milliseconds 250
  }
  return $false
}

function Find-Browser {
  $candidates = @(
    "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:LocalAppData\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe",
    "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
  )
  foreach ($item in $candidates) {
    if ($item -and (Test-Path $item)) { return $item }
  }
  return $null
}

New-Item -ItemType Directory -Force $AppDir | Out-Null
$config = Get-GatewayConfig
$hostName = if ($config.host) { [string]$config.host } else { '127.0.0.1' }
$port = if ($config.port) { [int]$config.port } else { 55417 }
$url = "http://${hostName}:$port/_admin"

if (-not (Test-TcpPort $hostName $port)) {
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $node) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show('未找到 node.exe，请先安装 Node.js。', 'Codex API Gateway') | Out-Null
    exit 1
  }

  if (Test-Path $LogPath) { Remove-Item $LogPath -Force -ErrorAction SilentlyContinue }
  if (Test-Path $ErrPath) { Remove-Item $ErrPath -Force -ErrorAction SilentlyContinue }

  $proc = Start-Process -FilePath $node.Source `
    -ArgumentList @('src/server.js') `
    -WorkingDirectory $Root `
    -WindowStyle Hidden `
    -PassThru `
    -RedirectStandardOutput $LogPath `
    -RedirectStandardError $ErrPath

  Set-Content -Encoding ASCII -Path $PidPath -Value $proc.Id

  if (-not (Wait-Gateway $hostName $port)) {
    $err = if (Test-Path $ErrPath) { Get-Content $ErrPath -Raw } else { '' }
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show("服务启动超时。`n`n$err", 'Codex API Gateway') | Out-Null
    exit 1
  }
}

if (-not $NoOpen) {
  $browser = Find-Browser
  if ($browser) {
    Start-Process -FilePath $browser -ArgumentList @("--app=$url") | Out-Null
  } else {
    Start-Process $url | Out-Null
  }
}
