@echo off
REM ============================================================================
REM  ATLANTA FED MARKET PROBABILITY TRACKER - for Windows Task Scheduler
REM
REM  Downloads mpt_histdata.xlsx (CME 3-month SOFR options -> fed-path hike/cut
REM  probabilities), parses it, and writes a compact blob to KV mpt_store_v1.
REM  Seconds, not minutes. No browser, so unlike run_daily.bat next door this one
REM  CAN run whether the user is logged on or not.
REM
REM  Set up in Task Scheduler:
REM    Program/script:  C:\...\MacroFXModel\fedwatch\run_daily.bat
REM    Start in:        C:\...\MacroFXModel\fedwatch     <- set this, some tasks
REM                                                         start in system32
REM    Run whether user is logged on or not:  YES (no desktop needed)
REM    Settings > "Run task as soon as possible after a scheduled start is missed"
REM
REM  WHEN TO RUN IT - SEVERAL TIMES, AND DO NOT TRY TO GUESS THE HOUR.
REM
REM  The file is published on business day D carrying D-1's data. ONE observed
REM  Last-Modified was 14:57 GMT. That is a single observation and is NOT enough
REM  to schedule against: the OI job next door ran at 00:36 UK for four nights
REM  capturing settlements that did not exist yet, and looked successful doing it.
REM
REM  Instead, exploit the ETag. A conditional GET returns 304 WITH ZERO BYTES when
REM  nothing has changed, so a run that is too early costs nothing at all. Schedule
REM  three triggers and let the misses be free:
REM
REM      16:30, 18:30, 20:30 UK
REM
REM  The first one to see a new ETag writes KV; the rest exit 0 having transferred
REM  nothing. Add more triggers rather than moving them if the publication time
REM  turns out to drift.
REM
REM  CADENCE, MEASURED FROM THE DATA AND NOT THE WEBSITE'S CLAIM: 883 distinct
REM  dates over 917 business days (96.3%), and every one of the 34 absences is a
REM  US market holiday. So it updates EVERY TRADING DAY, and a weekend or a US
REM  holiday with no new data is correct behaviour, not a failure.
REM
REM  EGRESS: the workbook is 7 MB. That is nothing once a day and ruinous on a
REM  request path - which is exactly why this is a scheduled job writing tens of
REM  KB to KV, rather than anything the server fetches live.
REM
REM  Exit code is 0 only if the run succeeded OR the file was unchanged, so Task
REM  Scheduler's "Last Run Result" is meaningful. A heartbeat is posted EVERY run,
REM  pass or fail: a failure shouts, but a machine that simply stopped waking up
REM  says nothing at all, and only a last-seen time that stops advancing shows it.
REM ============================================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

set PY=..\.venv\Scripts\python.exe
if not exist "%PY%" set PY=python
set BASE=https://macrofxmodel-production.up.railway.app

if not exist "logs" mkdir "logs"
REM Ask PowerShell for the date rather than slicing %date%, whose format follows the
REM machine's locale - the token order that is right here would silently produce a
REM wrong filename on a box set to mm/dd/yyyy.
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set DSTAMP=%%d
set LOGFILE=logs\mpt_%DSTAMP%.log

echo. >> "%LOGFILE%"
echo ================================================== >> "%LOGFILE%"
echo  RUN STARTED %date% %time% >> "%LOGFILE%"
echo ================================================== >> "%LOGFILE%"

"%PY%" fetch_mpt.py %* >> "%LOGFILE%" 2>&1
set RC=%ERRORLEVEL%

echo [%date% %time%] finished with exit code %RC% >> "%LOGFILE%"

REM --- heartbeat + alert --------------------------------------------------------
REM Reuses the OI sweep-alert endpoint, which owns the Telegram token - nothing
REM secret lives on this box. `target` distinguishes it in the alert text.
if %RC% NEQ 0 (set OKFLAG=false) else (set OKFLAG=true)
for /f "delims=" %%v in ('powershell -NoProfile -Command "(Select-String -Path '%LOGFILE%' -Pattern 'asOf=|HTTP |unchanged|REFUSING' ^| Select-Object -Last 4 ^| ForEach-Object { $_.Line.Trim() }) -join ' ^| '"') do set DETAIL=%%v
powershell -NoProfile -Command ^
  "try { Invoke-RestMethod -Uri '%BASE%/api/oi/sweep-alert' -Method Post -ContentType 'application/json' -TimeoutSec 30 -Body (@{ ok = [bool]::Parse('%OKFLAG%'); detail = $env:DETAIL; target = 'mpt' } | ConvertTo-Json) | Out-Null } catch { Write-Host ('heartbeat post failed: ' + $_.Exception.Message) }" >> "%LOGFILE%" 2>&1

echo.
findstr /C:"[mpt]" "%LOGFILE%"
echo.
echo Full log: %~dp0%LOGFILE%
if %RC% NEQ 0 (echo RESULT: FAILED ^(exit %RC%^)) else (echo RESULT: OK)

endlocal & exit /b %RC%
