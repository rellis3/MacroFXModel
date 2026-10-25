@echo off
REM Release Reaction page: rebuild the live Layer 1 record and push it to the server (KV release_layer1_v1).
REM Windows Task Scheduler runs this every 5 minutes. Inside a release window (10 min before to 4 h 10 min after) it first pulls fresh
REM 1-minute bars for SOFR, Euribor, 2y, 10y, dollar and Nasdaq from IB Gateway (port 4002); outside a window it only rebuilds from disk.
REM If the Gateway is closed the pull is skipped and the push still goes, so the page shows how stale the bars are.
setlocal
cd /d "%~dp0"
set PY=..\..\.venv\Scripts\python.exe
if not exist "%PY%" set PY=python
if not exist "..\rates_line\logs" mkdir "..\rates_line\logs"
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set DSTAMP=%%d
set LOGFILE=..\rates_line\logs\release_live_%DSTAMP%.log
echo [%date% %time%] run >> "%LOGFILE%"
set PYTHONIOENCODING=utf-8
"%PY%" live_push.py %* >> "%LOGFILE%" 2>&1
set RC=%ERRORLEVEL%
echo [%date% %time%] exit %RC% >> "%LOGFILE%"
endlocal & exit /b %RC%
