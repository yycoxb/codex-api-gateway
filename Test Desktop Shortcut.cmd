@echo off
setlocal
title Test Codex API Gateway Desktop Shortcut

echo.
echo This is a safe test only.
echo It will NOT run git pull and will NOT change any files.
echo.

echo Script location:
echo   %~dp0
echo.

cd /d "%~dp0"
echo Current working directory after cd:
echo   %CD%
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo Git check:
  echo   FAILED - git was not found in PATH.
) else (
  echo Git check:
  echo   OK - git is available.
)

echo.
echo Repository check:
git rev-parse --show-toplevel 2>nul
if errorlevel 1 (
  echo   FAILED - this folder is not detected as a Git repository.
) else (
  echo   OK - this folder is a Git repository.
)

echo.
echo If the path above is your codex-api-gateway folder, the desktop shortcut method works.
echo.
pause
endlocal
