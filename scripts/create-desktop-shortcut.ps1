param(
  [switch]$IncludeStopShortcut,
  [switch]$RemoteAccess,
  [string]$HostAddress = '0.0.0.0',
  [int]$Port = 18080
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$startCmd = Join-Path $repoRoot 'Codex API Gateway.cmd'
$stopCmd = Join-Path $repoRoot 'Stop Codex API Gateway.cmd'

if (-not (Test-Path -LiteralPath $startCmd)) {
  throw "Start script not found: $startCmd"
}

$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell

function New-Shortcut {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Target,
    [string]$Arguments = '',
    [string]$Icon = ''
  )

  $shortcutPath = Join-Path $desktop "$Name.lnk"
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $Target
  if ($Arguments) {
    $shortcut.Arguments = $Arguments
  }
  $shortcut.WorkingDirectory = $repoRoot
  $shortcut.IconLocation = "$(if ($Icon) { $Icon } else { $Target }),0"
  $shortcut.Description = $Name
  $shortcut.Save()
  Write-Host "Created shortcut: $shortcutPath"
}

if ($RemoteAccess) {
  $escapedRepo = $repoRoot.Replace("'", "''")
  $escapedStart = $startCmd.Replace("'", "''")
  $arguments = "-NoProfile -ExecutionPolicy Bypass -Command `"Set-Location -LiteralPath '$escapedRepo'; `$env:CODEX_GATEWAY_HOST='$HostAddress'; `$env:CODEX_GATEWAY_PORT='$Port'; & '$escapedStart'`""
  New-Shortcut -Name 'Codex API Gateway Remote' -Target 'powershell.exe' -Arguments $arguments -Icon $startCmd
} else {
  New-Shortcut -Name 'Codex API Gateway' -Target $startCmd
}

if ($IncludeStopShortcut) {
  if (-not (Test-Path -LiteralPath $stopCmd)) {
    throw "Stop script not found: $stopCmd"
  }
  New-Shortcut -Name 'Stop Codex API Gateway' -Target $stopCmd
}
