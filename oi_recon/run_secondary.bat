@echo off
REM ============================================================================
REM  SECONDARY OI PULL (commodities) - a SECOND Windows Task Scheduler task.
REM
REM  Runs AFTER run_daily.bat and is walled off from it (see run_secondary.py):
REM  its own product list, its own capture folder, no KV writes, no heartbeat.
REM  Nothing about the main run changes.
REM
REM  Set up a second task, same settings as the main one:
REM    Program/script:  C:\...\MacroFXModel\oi_recon\run_secondary.bat
REM    Start in:        C:\...\MacroFXModel\oi_recon
REM    Trigger:         daily, 07:30 UK  (the main run starts 06:25 and has taken
REM                     12-40 min; this one also WAITS for it below, so an overlap
REM                     is harmless - it just starts later)
REM    Run only when user is logged on (it drives a real browser).
REM
REM  First, once per product (pick it in Chrome, then close Chrome):
REM    python run_secondary.py --learn "XAG/USD"
REM ============================================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

set PY=..\.venv\Scripts\python.exe
if not exist "%PY%" set PY=python

if not exist "logs" mkdir "logs"
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set DSTAMP=%%d
set LOGFILE=logs\secondary_%DSTAMP%.log

echo. >> "%LOGFILE%"
echo ================================================== >> "%LOGFILE%"
echo  SECONDARY RUN STARTED %date% %time% >> "%LOGFILE%"
echo ================================================== >> "%LOGFILE%"

REM --- wait for the main run --------------------------------------------------
REM Both runs share ONE Chrome profile and Playwright locks it to a single process.
REM The main run comes first, always: if it still holds the lock, wait (up to an
REM hour, checking each minute). A lock older than 60 min is a dead run's leftover
REM (same rule as run_daily.bat) and is cleared.
set /a WAITED=0
:waitlock
if exist ".chrome-profile\SingletonLock" (
  for /f %%a in ('powershell -NoProfile -Command "[int]((Get-Date) - (Get-Item '.chrome-profile\SingletonLock' -Force).LastWriteTime).TotalMinutes"') do set LOCKAGE=%%a
  if !LOCKAGE! GTR 60 (
    echo [%date% %time%] stale browser lock ^(!LOCKAGE! min^) - clearing. >> "%LOGFILE%"
    del /f /q ".chrome-profile\SingletonLock" 2>nul
  ) else (
    if !WAITED! GEQ 60 (
      echo [%date% %time%] main run still holds the browser after 60 min - giving up today. >> "%LOGFILE%"
      endlocal & exit /b 2
    )
    if !WAITED! EQU 0 echo [%date% %time%] main run is using the browser - waiting for it. >> "%LOGFILE%"
    set /a WAITED+=1
    timeout /t 60 /nobreak >nul
    goto waitlock
  )
)

"%PY%" run_secondary.py --headless %* >> "%LOGFILE%" 2>&1
set RC=%ERRORLEVEL%
echo [%date% %time%] finished with exit code %RC% >> "%LOGFILE%"

echo.
findstr /C:"capture " /C:"no pid yet" /C:"VERDICT" "%LOGFILE%"
echo Full log: %~dp0%LOGFILE%
endlocal & exit /b %RC%
