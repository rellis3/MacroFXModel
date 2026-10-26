@echo off
REM Release Reaction Layer 2: rebuild the going-in factor sheet (daily closes, strips, calendar) and push it to the server (KV release_layer2_v1).
REM Run it by hand or from Task Scheduler twice a day; the sheet for the releases ahead moves only with daily closes, so more often is pointless.
setlocal
cd /d "%~dp0"
set PY=..\..\.venv\Scripts\python.exe
if not exist "%PY%" set PY=python
if not exist "..\rates_line\logs" mkdir "..\rates_line\logs"
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set DSTAMP=%%d
set LOGFILE=..\rates_line\logs\release_why_%DSTAMP%.log
echo [%date% %time%] run >> "%LOGFILE%"
set PYTHONIOENCODING=utf-8
"%PY%" build_factors.py --push %* >> "%LOGFILE%" 2>&1
set RC=%ERRORLEVEL%
echo [%date% %time%] exit %RC% >> "%LOGFILE%"
endlocal & exit /b %RC%
