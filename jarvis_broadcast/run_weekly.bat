@echo off
REM Fridays 22:00 ("Helix Weekly Recap"): the H.E.L.I.X. weekly recap, recorded AFTER the Friday evening briefing (that one still goes out at 21:00); queues behind it if it is still recording.
REM Registered by setup_tasks.ps1 (new tasks only; the 07:00 / 21:00 briefing tasks are not touched). See README.md "The extra programmes".
cd /d "%~dp0"
REM the same Python as run_daily.bat: the venv OUTSIDE OneDrive first (an "if exist" on the OneDrive-linked .venv hung for minutes on 25 Nov), then the older venvs, then python.
set "PY=%~dp0.venv-local\Scripts\python.exe"
if exist "%PY%" goto havepy
set "PY=python"
if exist "%~dp0..\.venv\Scripts\python.exe" set "PY=%~dp0..\.venv\Scripts\python.exe"
if exist "%~dp0.venv\Scripts\python.exe" set "PY=%~dp0.venv\Scripts\python.exe"
:havepy
"%PY%" record_broadcast.py --part weekly --wait-busy %*
exit /b %ERRORLEVEL%
