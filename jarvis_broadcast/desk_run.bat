@echo off
REM Weekdays 06:30 ("Jarvis Desk Run"): start the day's desk run once the OI pull has finished. See desk_run.py. ONE paid attempt a day, never retried.
cd /d "%~dp0"
set "PY=python"
if exist "%~dp0..\.venv\Scripts\python.exe" set "PY=%~dp0..\.venv\Scripts\python.exe"
if exist "%~dp0.venv\Scripts\python.exe" set "PY=%~dp0.venv\Scripts\python.exe"
"%PY%" desk_run.py %*
