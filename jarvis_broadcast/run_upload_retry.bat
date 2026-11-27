@echo off
REM Every 2 h, 08:15-23:15 ("Helix Upload Retry"): retries uploads that failed (out\upload_queue.json); exits at once when the queue is empty. No browser.
REM Registered by setup_tasks.ps1 (new tasks only; the 07:00 / 21:00 briefing tasks are not touched). See README.md "The extra programmes".
cd /d "%~dp0"
REM the same Python as run_daily.bat: the venv OUTSIDE OneDrive first (an "if exist" on the OneDrive-linked .venv hung for minutes on 25 Nov), then the older venvs, then python.
set "PY=%~dp0.venv-local\Scripts\python.exe"
if exist "%PY%" goto havepy
set "PY=python"
if exist "%~dp0..\.venv\Scripts\python.exe" set "PY=%~dp0..\.venv\Scripts\python.exe"
if exist "%~dp0.venv\Scripts\python.exe" set "PY=%~dp0.venv\Scripts\python.exe"
:havepy
"%PY%" record_broadcast.py --retry-queue %*
exit /b %ERRORLEVEL%
