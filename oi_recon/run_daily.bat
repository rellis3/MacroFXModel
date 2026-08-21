@echo off
REM ============================================================================
REM  DAILY OI PULL - for Windows Task Scheduler
REM
REM  Captures all 11 instruments from QuikStrike, builds the store entries, logs
REM  what every level claimed, writes KV, and compares against your manual paste.
REM  ~8 minutes.
REM
REM  Set up in Task Scheduler:
REM    Program/script:  C:\...\MacroFXModel\oi_recon\run_daily.bat
REM    Start in:        C:\...\MacroFXModel\oi_recon      <- set this, some tasks
REM                                                          start in system32
REM    Run whether user is logged on or not:  NO. It drives a real browser; a
REM      non-interactive session has no desktop for Chrome to render into.
REM
REM  FOR AN UNATTENDED RUN (holiday), also tick:
REM    Conditions > "Wake the computer to run this task"
REM    Conditions > UNTICK "Start the task only if the computer is on AC power"
REM      (only matters on a laptop, but a dead battery is a silent fortnight)
REM    Settings   > "Run task as soon as possible after a scheduled start is missed"
REM  and set the machine's power plan to never sleep. The scraper needs a desktop.
REM
REM  WHERE IT PUBLISHES is decided by the toggle in the OI modal (KV oi_auto_target),
REM  NOT here - so the feed can be handed back to manual pasting from a phone without
REM  touching this machine. Default is the oi_store_py shadow.
REM
REM  WHEN TO RUN IT — 06:30 UK OR LATER, NOT JUST AFTER MIDNIGHT.
REM
REM  Two different publication times, and the earlier one is a trap:
REM    * OI matrices (rawOI / rawChg / rawVol) are up shortly after the CME
REM      evening settle and captured fine at 00:36 UK.
REM    * The SETTLEMENTS view is gated by CME itself, in its own words:
REM        "Today's settlements are not available for viewing until after
REM         12:00am CT"
REM      Midnight CT = 06:00 UK (BST). A 00:36 UK run is 18:36 CT the PREVIOUS
REM      day, five and a half hours early.
REM
REM  Before that window the Settles view still renders its HEADING ("Gold (OG|GC)
REM  Settles") over an empty shell: no selects, no table, zero rows. So the run
REM  looks like it reached the right view and then fails on the table, which is
REM  a confusing way to be told "come back later". Measured 2026-08-21: rawIVTerm
REM  0/11, and with it every per-strike smile, because phase 2 drives the same view.
REM
REM  06:30 UK gives a margin over the 06:00 boundary and still lands well before
REM  the London session. Do NOT move it earlier to "get in before the market" —
REM  the data does not exist yet.
REM
REM  Exit code is 0 only if every stage succeeded, so Task Scheduler's "Last Run
REM  Result" is meaningful instead of always 0x0. A failure also pings Telegram via
REM  the Railway server, which owns the token - nothing secret lives on this box.
REM ============================================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

set PY=..\.venv\Scripts\python.exe
if not exist "%PY%" set PY=python
set BASE=https://macrofxmodel-production.up.railway.app

REM --- one at a time -----------------------------------------------------------
REM Playwright locks the Chrome profile directory to a single process. A second run
REM would fail on the lock, so refuse early with a clear message rather than a stack.
REM
REM BUT A STALE LOCK MUST NOT DEADLOCK THE FORTNIGHT. If a run dies hard - power cut,
REM Chrome crash, a Windows Update reboot mid-capture - the lock outlives the process
REM that made it, and every subsequent night would exit 2 without ever touching the
REM browser. Unattended, that turns one bad night into thirteen. A full run takes ~8
REM minutes, so a lock older than an hour cannot belong to a live run: clear it.
REM Age, not a process check - the user's own Chrome is a different profile and
REM killing by image name would close their real browser.
if exist ".chrome-profile\SingletonLock" (
  for /f %%a in ('powershell -NoProfile -Command "[int]((Get-Date) - (Get-Item '.chrome-profile\SingletonLock' -Force).LastWriteTime).TotalMinutes"') do set LOCKAGE=%%a
  if !LOCKAGE! GTR 60 (
    echo [%date% %time%] stale browser lock ^(!LOCKAGE! min old^) - clearing and continuing.
    del /f /q ".chrome-profile\SingletonLock" 2>nul
  ) else (
    echo [%date% %time%] ANOTHER RUN IS ALREADY USING THE BROWSER PROFILE ^(!LOCKAGE! min^) - skipping.
    exit /b 2
  )
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

REM --- heartbeat + alert --------------------------------------------------------
REM Posted EVERY run, pass or fail. The stamp is what makes a task that silently
REM stopped firing visible: a failure shouts, but a machine that never woke up says
REM nothing at all, and only a last-seen time that stops advancing reveals it.
REM Telegram is sent by the server, which holds the token.
if %RC% NEQ 0 (set OKFLAG=false) else (set OKFLAG=true)
for /f "delims=" %%v in ('powershell -NoProfile -Command "(Select-String -Path '%LOGFILE%' -Pattern 'VERDICT|tables captured|complete .*skipped|level\(s\) across' | Select-Object -Last 6 | ForEach-Object { $_.Line.Trim() }) -join ' | '"') do set DETAIL=%%v
powershell -NoProfile -Command ^
  "try { Invoke-RestMethod -Uri '%BASE%/api/oi/sweep-alert' -Method Post -ContentType 'application/json' -TimeoutSec 30 -Body (@{ ok = [bool]::Parse('%OKFLAG%'); detail = $env:DETAIL; target = 'run_daily' } | ConvertTo-Json) | Out-Null } catch { Write-Host ('heartbeat post failed: ' + $_.Exception.Message) }" >> "%LOGFILE%" 2>&1

REM Echo the verdict to the console too, so a manual run shows the result without
REM opening the log.
echo.
findstr /C:"capture " /C:"ingest " /C:"expect " /C:"compare " /C:"VERDICT" "%LOGFILE%"
echo.
echo Full log: %~dp0%LOGFILE%

if %RC% NEQ 0 (
  echo RESULT: FAILED ^(exit %RC%^) - see the log above.
) else (
  echo RESULT: OK
)

endlocal & exit /b %RC%
