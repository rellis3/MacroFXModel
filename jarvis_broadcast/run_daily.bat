@echo off
REM ============================================================================
REM  DAILY JARVIS BROADCAST -> YOUTUBE (UNLISTED) - for Windows Task Scheduler
REM
REM  Records Jarvis's MORNING BROADCAST (picture + voice, 1080x1920) from the desk
REM  site and uploads it to your channel as UNLISTED. ~4-6 minutes.
REM  The link is written to out\last_run.json and out\run.log.
REM
REM  WHEN: 07:00 UK, after the 06:30 OI pull (oi_recon\run_daily.bat) has finished,
REM  so the gamma views have today's option books.
REM
REM  Set up in Task Scheduler (same as the OI pull):
REM    Program/script:  C:\...\MacroFXModel\jarvis_broadcast\run_daily.bat
REM    Start in:        C:\...\MacroFXModel\jarvis_broadcast   <- set this
REM    Run whether user is logged on or not:  NO. It drives a real browser window.
REM    Conditions > "Wake the computer to run this task"
REM    Settings   > "Run task as soon as possible after a scheduled start is missed"
REM  One-off setup first (README.md):  python record_broadcast.py --login
REM                                    python record_broadcast.py --youtube-auth
REM ============================================================================
cd /d "%~dp0"
REM Task Scheduler's plain "python" is the system one (no Playwright): use a venv. Here first (a copy of this
REM folder can hold a .venv or a junction to one), then the repo's .venv one level up, then whatever is on PATH.
REM 26 Nov 2026: the venv OUTSIDE OneDrive comes first, and when it exists nothing under OneDrive is touched: even an "if exist" on the
REM OneDrive-linked .venv hung for minutes (the 23:46 25 Nov rehearsal never started). Only without it, the older venvs, then python.
set "PY=%~dp0.venv-local\Scripts\python.exe"
if exist "%PY%" goto havepy
set "PY=python"
if exist "%~dp0..\.venv\Scripts\python.exe" set "PY=%~dp0..\.venv\Scripts\python.exe"
if exist "%~dp0.venv\Scripts\python.exe" set "PY=%~dp0.venv\Scripts\python.exe"
:havepy
"%PY%" record_broadcast.py %*
exit /b %ERRORLEVEL%
