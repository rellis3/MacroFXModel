@echo off
REM ============================================================================
REM  Fib Atlas's own copy of local_decision_engine\start.bat. Starts this
REM  engine's two processes (sync.mjs --loop and server.mjs) as persistent
REM  background windows. Runs on port 4501 (Vote Atlas's own local engine
REM  uses 4500) so both can run on the same machine at once without
REM  colliding. Independent of any trading bot's own start/stop.
REM
REM  Then start whichever bot(s) need it, separately, whenever you want them
REM  trading.
REM
REM  To stop: close (or Ctrl+C in) the two windows this opens.
REM ============================================================================
setlocal
cd /d "%~dp0"

if not defined DASHBOARD_URL set DASHBOARD_URL=https://macrofxmodel-production.up.railway.app
echo Using DASHBOARD_URL=%DASHBOARD_URL%

echo Starting sync.mjs --loop (pulls Asia+Monday books and the shared M1 tail from Railway)...
start "fib-local-decision-sync" cmd /k node sync.mjs --loop

echo Starting server.mjs (serves /decide and /plan on 127.0.0.1:4501)...
start "fib-local-decision-server" cmd /k node server.mjs

echo.
echo Waiting for server.mjs to come up...
:wait
timeout /t 2 /nobreak >nul
powershell -NoProfile -Command "try { Invoke-RestMethod -Uri 'http://127.0.0.1:4501/health' -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 goto wait

echo.
echo Fib Atlas local decision engine is up -- two windows are now running, leave them open.
echo Start your bot(s) separately now.
