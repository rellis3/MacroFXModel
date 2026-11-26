@echo off
REM Weekdays 06:30 ("Jarvis Desk Run"): start the day's desk run once the OI pull has finished. See desk_run.py. ONE paid attempt a day, never retried.
cd /d "%~dp0"
REM 26 Nov 2026: the venv OUTSIDE OneDrive comes first, and when it exists nothing under OneDrive is touched: even an "if exist" on the
REM OneDrive-linked .venv hung for minutes (the 23:46 25 Nov rehearsal never started). Only without it, the older venvs, then python.
set "PY=%~dp0.venv-local\Scripts\python.exe"
if exist "%PY%" goto havepy
set "PY=python"
if exist "%~dp0..\.venv\Scripts\python.exe" set "PY=%~dp0..\.venv\Scripts\python.exe"
if exist "%~dp0.venv\Scripts\python.exe" set "PY=%~dp0.venv\Scripts\python.exe"
:havepy
"%PY%" desk_run.py %*
