param(
  [string] $Target,

  [switch] $Force,

  [switch] $DryRun,

  [switch] $CleanUntracked
)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent $ScriptDir
Set-Location -LiteralPath $Root

function Invoke-GitChecked {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]] $GitArgs)
  & git @GitArgs
  if ($LASTEXITCODE -ne 0) {
    throw "git $($GitArgs -join ' ') failed with exit code $LASTEXITCODE"
  }
}

function Get-GitOutputChecked {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]] $GitArgs)
  $output = & git @GitArgs
  if ($LASTEXITCODE -ne 0) {
    throw "git $($GitArgs -join ' ') failed with exit code $LASTEXITCODE"
  }
  return $output
}

Invoke-GitChecked rev-parse --is-inside-work-tree | Out-Null

$gitDir = (Get-GitOutputChecked rev-parse --git-dir | Select-Object -First 1).Trim()
$metaPath = Join-Path $gitDir 'codex-last-checkpoint'

if (-not $Target) {
  if (Test-Path -LiteralPath $metaPath) {
    $meta = Get-Content -LiteralPath $metaPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $Target = [string] $meta.commit
    Write-Host "Using latest checkpoint: $Target"
  } else {
    $Target = 'HEAD~1'
    Write-Host 'No checkpoint metadata found; defaulting to HEAD~1.' -ForegroundColor Yellow
  }
}

$targetCommit = (Get-GitOutputChecked rev-parse --verify "$Target^{commit}" | Select-Object -First 1).Trim()
$currentCommit = (Get-GitOutputChecked rev-parse HEAD | Select-Object -First 1).Trim()
$statusLines = @(& git -c core.quotepath=false status --porcelain=v1 -uall)
if ($LASTEXITCODE -ne 0) { throw 'git status failed' }

Write-Host "Current: $currentCommit"
Write-Host "Target : $targetCommit"
Write-Host 'Runtime account data under %USERPROFILE%\.codex-api-gateway is not touched by this script.'

if ($statusLines.Count -gt 0 -and -not $Force -and -not $DryRun) {
  Write-Host 'Working tree has uncommitted changes:' -ForegroundColor Yellow
  $statusLines | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
  $answer = Read-Host 'Type ROLLBACK to reset tracked files, or anything else to cancel'
  if ($answer -ne 'ROLLBACK') {
    Write-Host 'Rollback cancelled.'
    exit 1
  }
}

$safetyBranch = 'rollback-safety/' + (Get-Date -Format 'yyyyMMdd-HHmmss')

if ($DryRun) {
  Write-Host "[dry-run] would create safety branch $safetyBranch at $currentCommit"
  Write-Host "[dry-run] would run: git reset --hard $targetCommit"
  if ($CleanUntracked) { Write-Host '[dry-run] would run: git clean -fd' }
  exit 0
}

Invoke-GitChecked branch $safetyBranch $currentCommit
Write-Host "Created safety branch: $safetyBranch" -ForegroundColor Green

Invoke-GitChecked reset --hard $targetCommit

if ($CleanUntracked) {
  Invoke-GitChecked clean -fd
}

Write-Host 'Rollback complete.' -ForegroundColor Green
Write-Host "If needed, recover previous HEAD with: git reset --hard $safetyBranch"

