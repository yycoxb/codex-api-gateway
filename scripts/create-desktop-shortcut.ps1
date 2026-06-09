param(
  [switch]$IncludeStopShortcut
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
    [Parameter(Mandatory = $true)][string]$Target
  )

  $shortcutPath = Join-Path $desktop "$Name.lnk"
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $Target
  $shortcut.WorkingDirectory = $repoRoot
  $shortcut.IconLocation = "$Target,0"
  $shortcut.Description = $Name
  $shortcut.Save()
  Write-Host "Created shortcut: $shortcutPath"
}

New-Shortcut -Name 'Codex API Gateway' -Target $startCmd

if ($IncludeStopShortcut) {
  if (-not (Test-Path -LiteralPath $stopCmd)) {
    throw "Stop script not found: $stopCmd"
  }
  New-Shortcut -Name 'Stop Codex API Gateway' -Target $stopCmd
}
