@echo off
REM ============================================================================
REM  C.OG LINE - refresh from IBKR and push to the server, for Windows Task Scheduler
REM
REM  Pulls the latest 1-minute SOFR + Euribor bars from your TWS / IB Gateway, rebuilds
REM  analysis\output\cog_line\cog_line_15m.json and POSTs the newest bars to the server
REM  (KV cog_line_live_v1), so the Rates page card and /api/cog-line are current without a
REM  deploy. Double-click it to refresh once.
REM
REM  Set up in Task Scheduler:
REM    Program/script:  C:\...\MacroFXModel\scripts\rates_line\run_cog_line.bat
REM    Start in:        C:\...\MacroFXModel\scripts\rates_line
REM    Trigger:         Daily, repeat every 30 minutes for 1 day
REM    Run whether user is logged on or not:  NO (it needs your logged-in TWS / Gateway).
REM    Settings > "Run task as soon as possible after a scheduled start is missed"
REM
REM  CATCH-UP: the script works out how far back to pull from the newest bar on disk, so a run
REM  after the laptop was off or asleep fills the gap (IBKR keeps 1-minute history). Nothing
REM  is lost while the laptop is closed; the page simply shows the data age until the next run.
REM  If TWS is closed or logged out the script says so, exits with code 2 and changes nothing.
REM ============================================================================
setlocal
cd /d "%~dp0"
set PY=..\..\.venv\Scripts\python.exe
if not exist "%PY%" set PY=python
if not exist "logs" mkdir "logs"
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set DSTAMP=%%d
set LOGFILE=logs\cog_line_%DSTAMP%.log
echo ================================================== >> "%LOGFILE%"
echo  RUN STARTED %date% %time% >> "%LOGFILE%"
"%PY%" refresh_cog_line.py --days auto --push %* >> "%LOGFILE%" 2>&1
set RC=%ERRORLEVEL%
echo [%date% %time%] finished with exit code %RC% >> "%LOGFILE%"
echo.
findstr /C:"HTTP" /C:"Could not connect" /C:"merged" "%LOGFILE%"
if %RC% NEQ 0 (echo RESULT: NOT UPDATED ^(exit %RC%^)) else (echo RESULT: OK)
endlocal & exit /b %RC%
