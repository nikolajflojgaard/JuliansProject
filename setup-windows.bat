@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0setup-windows.ps1"
if errorlevel 1 (
  echo.
  echo Setup failed. Read the PowerShell output above.
  pause
)
endlocal
