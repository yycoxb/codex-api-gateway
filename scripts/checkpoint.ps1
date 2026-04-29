param(
  [ValidateSet('auto', 'branch', 'commit')]
  [string] $Mode = 'auto',

  [string] $Message = 'checkpoint before changes',

  [string] $BranchPrefix = 'backup-before-change',

  [switch] $AllowSensitive,

  [switch] $DryRun
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

function Get-StatusLines {
  $lines = & git -c core.quotepath=false status --porcelain=v1 -uall
  if ($LASTEXITCODE -ne 0) {
    throw 'git status failed'
  }
  return @($lines)
}

function Get-StatusPath {
  param([string] $Line)
  if ([string]::IsNullOrWhiteSpace($Line) -or $Line.Length -lt 4) { return $null }
  $path = $Line.Substring(3).Trim()
  if ($path -match ' -> ') {
    $parts = $path -split ' -> '
    $path = $parts[$parts.Count - 1]
  }
  return $path.Trim('"')
}

function Test-SensitivePath {
  param([string] $Path)
  $normalized = ($Path -replace '\\', '/').ToLowerInvariant()
  $patterns = @(
    '(^|/)(auth|account|accounts|config|local-access|local-access-stats|wakeup-history|wakeup-schedule|quota-refresh-schedule|codex-oauth-pending)(-[^/]*)?\.json$',
    '(^|/)\.env(\..*)?$',
    '(^|/)\.codex($|/)',
    '(^|/)\.codex-api-gateway($|/)',
    '\.(token|secret|pem|p12|pfx)$'
  )
  foreach ($pattern in $patterns) {
    if ($normalized -match $pattern) { return $true }
  }
  return $false
}

function New-UniqueBranchName {
  param([string] $Prefix)
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $baseName = "$Prefix/$stamp"
  $name = $baseName
  $i = 1
  while ($true) {
    & git show-ref --verify --quiet "refs/heads/$name"
    if ($LASTEXITCODE -ne 0) { return $name }
    $i += 1
    $name = "$baseName-$i"
  }
}

function Save-CheckpointMeta {
  param(
    [string] $Type,
    [string] $Ref,
    [string] $Commit,
    [string] $Message
  )
  $gitDir = (Get-GitOutputChecked rev-parse --git-dir | Select-Object -First 1).Trim()
  $metaPath = Join-Path $gitDir 'codex-last-checkpoint'
  $meta = [pscustomobject]@{
    type = $Type
    ref = $Ref
    commit = $Commit
    message = $Message
    root = $Root
    createdAt = (Get-Date).ToString('o')
  }
  if (-not $DryRun) {
    $meta | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $metaPath -Encoding UTF8
  }
  Write-Host "checkpoint target: $Commit"
  Write-Host "rollback with: .\scripts\rollback-last.ps1"
}

Invoke-GitChecked rev-parse --is-inside-work-tree | Out-Null

$statusLines = Get-StatusLines
$paths = @($statusLines | ForEach-Object { Get-StatusPath $_ } | Where-Object { $_ })
$sensitive = @($paths | Where-Object { Test-SensitivePath $_ })

if ($sensitive.Count -gt 0 -and -not $AllowSensitive) {
  Write-Host 'Refusing to checkpoint because sensitive-looking files are present:' -ForegroundColor Red
  $sensitive | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
  Write-Host 'Move them outside the repo or add an explicit ignore rule. Use -AllowSensitive only if you are certain.' -ForegroundColor Yellow
  exit 2
}

$head = (Get-GitOutputChecked rev-parse HEAD | Select-Object -First 1).Trim()

if ($statusLines.Count -eq 0) {
  $branch = New-UniqueBranchName -Prefix $BranchPrefix
  if ($DryRun) {
    Write-Host "[dry-run] would create backup branch $branch at $head"
  } else {
    Invoke-GitChecked branch $branch
    Write-Host "Created backup branch: $branch" -ForegroundColor Green
  }
  Save-CheckpointMeta -Type 'branch' -Ref $branch -Commit $head -Message $Message
  exit 0
}

if ($Mode -eq 'branch') {
  $branch = New-UniqueBranchName -Prefix $BranchPrefix
  if ($DryRun) {
    Write-Host "[dry-run] would create branch $branch at $head"
  } else {
    Invoke-GitChecked branch $branch
    Write-Host "Created branch only: $branch" -ForegroundColor Yellow
    Write-Host 'Warning: uncommitted working-tree changes are not saved by branch-only mode.' -ForegroundColor Yellow
  }
  Save-CheckpointMeta -Type 'branch' -Ref $branch -Commit $head -Message $Message
  exit 0
}

Write-Host 'Working tree has changes; creating checkpoint commit.' -ForegroundColor Yellow
Write-Host 'Files:'
$paths | ForEach-Object { Write-Host "  $_" }

if ($DryRun) {
  Write-Host "[dry-run] would run: git add -A"
  Write-Host "[dry-run] would run: git commit -m `"$Message`""
  Save-CheckpointMeta -Type 'commit' -Ref 'DRY_RUN' -Commit $head -Message $Message
  exit 0
}

Invoke-GitChecked add -A
Invoke-GitChecked commit -m $Message
$commit = (Get-GitOutputChecked rev-parse HEAD | Select-Object -First 1).Trim()
Save-CheckpointMeta -Type 'commit' -Ref $commit -Commit $commit -Message $Message

