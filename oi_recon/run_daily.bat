@echo off
REM ============================================================================
REM  DAILY OI PULL - for Windows Task Scheduler
REM
REM  Captures all 11 instruments from QuikStrike, builds the store entries, writes
REM  the shadow key, and compares against your manual paste. ~8 minutes.
REM
REM  Set up in Task Scheduler:
REM    Program/script:  C:\...\MacroFXModel\oi_recon\run_daily.bat
REM    Start in:        C:\...\MacroFXModel\oi_recon      <- set this, some tasks
REM                                                          start in system32
REM    Run whether user is logged on or not:  NO. It drives a real browser; a
REM      non-interactive session has no desktop for Chrome to render into.
REM
REM  WHEN TO RUN IT. CME settlements publish about 23:55 UK (the updateTime on the
REM  captured payloads), so schedule AFTER that or you capture yesterday's book.
REM  Something like 00:30 is safe.
REM
REM  Exit code is 0 only if capture, build and comparison all succeeded, so Task
REM  Scheduler's "Last Run Result" is meaningful instead of always 0x0.
REM ============================================================================
setlocal
cd /d "%~dp0"

set PY=..\.venv\Scripts\python.exe
if not exist "%PY%" set PY=python

REM --- one at a time -----------------------------------------------------------
REM Playwright locks the Chrome profile directory to a single process. A second
REM run (a manual one, or a retry firing while the first is still going) would
REM fail on the lock, so refuse early with a clear message rather than a stack.
if exist ".chrome-profile\SingletonLock" (
  echo [%date% %time%] ANOTHER RUN IS ALREADY USING THE BROWSER PROFILE - skipping.
  echo   If nothing is running, delete .chrome-profile\SingletonLock and retry.
  exit /b 2
)

REM --- log to a dated file ------------------------------------------------------
if not exist "logs" mkdir "logs"
REM Ask PowerShell for the date rather than slicing %date%, whose format follows the
REM machine's locale - the token order that is right here (dd/mm/yyyy) would silently
REM produce a wrong filename on a box set to mm/dd/yyyy.
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set DSTAMP=%%d
set LOGFILE=logs\daily_%DSTAMP%.log

echo. >> "%LOGFILE%"
echo ================================================== >> "%LOGFILE%"
echo  RUN STARTED %date% %time% >> "%LOGFILE%"
echo ================================================== >> "%LOGFILE%"

REM --headless parks the browser window off-screen rather than using Chrome's real
REM headless mode, which the site blocks outright. It is still a rendering browser.
REM Extra arguments pass straight through, so a smoke test can run
REM   run_daily.bat --skip-sweep --dir out\YYYY-MM-DD\quikstrike
REM without waiting for a full capture.
"%PY%" run_daily.py --write --headless %* >> "%LOGFILE%" 2>&1
set RC=%ERRORLEVEL%

echo [%date% %time%] finished with exit code %RC% >> "%LOGFILE%"

REM Echo the verdict to the console too, so a manual run shows the result without
REM opening the log.
echo.
findstr /C:"capture " /C:"ingest " /C:"compare " /C:"VERDICT" "%LOGFILE%"
echo.
echo Full log: %~dp0%LOGFILE%

if %RC% NEQ 0 (
  echo RESULT: FAILED ^(exit %RC%^) - see the log above.
) else (
  echo RESULT: OK
)

endlocal & exit /b %RC%
