$ErrorActionPreference = 'Stop'
$AppDir = Join-Path $env:USERPROFILE '.codex-api-gateway'
$PidPath = Join-Path $AppDir 'gateway.pid'

if (-not (Test-Path $PidPath)) {
  Write-Host '未找到托管进程 PID，服务可能没有通过启动器启动。'
  exit 0
}

$pidText = (Get-Content $PidPath -Raw).Trim()
if (-not $pidText) {
  Remove-Item $PidPath -Force -ErrorAction SilentlyContinue
  Write-Host 'PID 文件为空，已清理。'
  exit 0
}

try {
  $proc = Get-Process -Id ([int]$pidText) -ErrorAction Stop
  Stop-Process -Id $proc.Id -Force
  Write-Host "已停止 Codex API Gateway，PID=$($proc.Id)"
} catch {
  Write-Host "进程不存在或已退出，PID=$pidText"
} finally {
  Remove-Item $PidPath -Force -ErrorAction SilentlyContinue
}
