@echo off
setlocal
title Update Codex API Gateway

cd /d "%~dp0"
echo.
echo Updating Codex API Gateway in:
echo   %CD%
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo ERROR: git was not found in PATH.
  echo Please install Git or open this script from a Git-enabled terminal.
  echo.
  pause
  exit /b 1
)

git pull --ff-only
set "PULL_EXIT=%ERRORLEVEL%"
echo.

if not "%PULL_EXIT%"=="0" (
  echo Update failed. Please check the message above.
  echo If you have local changes, commit/stash them or ask Codex to handle it.
  echo.
  pause
  exit /b %PULL_EXIT%
)

echo Update finished successfully.
echo.
pause
endlocal
