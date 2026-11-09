@echo off
REM Double-click to scan and push. See run_roe.ps1 for what it does and its options.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_roe.ps1" %*
