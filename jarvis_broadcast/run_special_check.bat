@echo off
REM Weekdays every 10 min, 07:00-22:30 ("Helix Release Special"): exits at once unless a rank-3 release printed 30-80 min ago has no special yet; then records one.
REM Registered by setup_tasks.ps1 (new tasks only; the 07:00 / 21:00 briefing tasks are not touched). See README.md "The extra programmes".
cd /d "%~dp0"
REM the same Python as run_daily.bat: the venv OUTSIDE OneDrive first (an "if exist" on the OneDrive-linked .venv hung for minutes on 25 Nov), then the older venvs, then python.
set "PY=%~dp0.venv-local\Scripts\python.exe"
if exist "%PY%" goto havepy
set "PY=python"
if exist "%~dp0..\.venv\Scripts\python.exe" set "PY=%~dp0..\.venv\Scripts\python.exe"
if exist "%~dp0.venv\Scripts\python.exe" set "PY=%~dp0.venv\Scripts\python.exe"
:havepy
"%PY%" special_check.py  %*
exit /b %ERRORLEVEL%
