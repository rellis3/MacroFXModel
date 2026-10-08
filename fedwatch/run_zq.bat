@echo off
REM ============================================================================
REM  FED FUNDS PATH (ZQ) - daily feed, for Windows Task Scheduler
REM
REM  Pulls 12 consecutive ZQ months from your TWS/Gateway, merges the day's bars
REM  into analysis/output/stir/, and pushes the rungs to KV zq_path_v1. Seconds,
REM  not minutes -- this is the FEED, not the history pull next door.
REM
REM  Set up in Task Scheduler:
REM    Program/script:  C:\...\MacroFXModel\fedwatch\run_zq.bat
REM    Start in:        C:\...\MacroFXModel\fedwatch     <- set this, some tasks
REM                                                         start in system32
REM    Run whether user is logged on or not:  NO.
REM      It needs a LOGGED-IN TWS or Gateway session on this machine. There is no
REM      cloud endpoint for IBKR data -- that is the whole reason this is a local
REM      task pushing to KV rather than something the server fetches.
REM    Settings > "Run task as soon as possible after a scheduled start is missed"
REM
REM  WHEN TO RUN IT: after the CME close, so the day's settle is in.
REM      22:30 UK is comfortably past the 21:00 UK / 16:00 ET equity close and the
REM      17:00 ET futures settle, and before the 23:00 ET reopen.
REM  A weekend or US holiday run that finds the same bars as yesterday is CORRECT,
REM  not a failure -- the archive merge is a no-op and the rungs are unchanged.
REM
REM  IF TWS IS CLOSED the script exits with a clear message and writes nothing. It
REM  does NOT write a stale snapshot: an empty pull refuses rather than publishing
REM  yesterday's path as today's.
REM
REM  Heartbeat is posted every run, pass or fail. A failure shouts; a machine that
REM  simply stopped waking up says nothing at all, and only a last-seen time that
REM  stops advancing reveals it.
REM ============================================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

set PY=..\.venv\Scripts\python.exe
if not exist "%PY%" set PY=python
set BASE=https://macrofxmodel-production.up.railway.app

if not exist "logs" mkdir "logs"
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set DSTAMP=%%d
set LOGFILE=logs\zq_%DSTAMP%.log

echo. >> "%LOGFILE%"
echo ================================================== >> "%LOGFILE%"
echo  RUN STARTED %date% %time% >> "%LOGFILE%"
echo ================================================== >> "%LOGFILE%"

"%PY%" pull_zq_path.py %* >> "%LOGFILE%" 2>&1
set RC=%ERRORLEVEL%
echo [%date% %time%] finished with exit code %RC% >> "%LOGFILE%"

if %RC% NEQ 0 (set OKFLAG=false) else (set OKFLAG=true)
for /f "delims=" %%v in ('powershell -NoProfile -Command "(Select-String -Path '%LOGFILE%' -Pattern 'rungs|HTTP |REFUSING|could not connect' ^| Select-Object -Last 3 ^| ForEach-Object { $_.Line.Trim() }) -join ' ^| '"') do set DETAIL=%%v
powershell -NoProfile -Command ^
  "try { Invoke-RestMethod -Uri '%BASE%/api/oi/sweep-alert' -Method Post -ContentType 'application/json' -TimeoutSec 30 -Body (@{ ok = [bool]::Parse('%OKFLAG%'); detail = $env:DETAIL; target = 'zq_path' } | ConvertTo-Json) | Out-Null } catch { Write-Host ('heartbeat post failed: ' + $_.Exception.Message) }" >> "%LOGFILE%" 2>&1

echo.
findstr /C:"implied" /C:"rungs" /C:"HTTP" "%LOGFILE%"
echo.
echo Full log: %~dp0%LOGFILE%
if %RC% NEQ 0 (echo RESULT: FAILED ^(exit %RC%^)) else (echo RESULT: OK)

endlocal & exit /b %RC%
