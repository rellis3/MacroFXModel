@echo off
REM ============================================================================
REM  Starts the local decision engine's two processes (sync.mjs --loop and
REM  server.mjs) as persistent background windows. Run this ONCE and leave
REM  both windows open -- it is independent of any trading bot's own
REM  start/stop (Fib Atlas will share this same engine later, see
REM  MD files/LOCAL_DECISION_ENGINE_ARCHITECTURE.md), so it doesn't get
REM  spawned/killed by volatility_bot_v3.py itself.
REM
REM  Then start whichever bot(s) need it, separately, whenever you want them
REM  trading, e.g.:
REM    python volatility_bot_v3\volatility_bot_v3.py --url <dashboard-url>
REM
REM  To stop: close (or Ctrl+C in) the two windows this opens.
REM ============================================================================
setlocal
cd /d "%~dp0"

echo Starting sync.mjs --loop (pulls book/M1 tail from Railway)...
start "local-decision-sync" cmd /k node sync.mjs --loop

echo Starting server.mjs (serves /decide and /plan on 127.0.0.1:4500)...
start "local-decision-server" cmd /k node server.mjs

echo.
echo Waiting for server.mjs to come up...
:wait
timeout /t 2 /nobreak >nul
powershell -NoProfile -Command "try { Invoke-RestMethod -Uri 'http://127.0.0.1:4500/health' -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 goto wait

echo.
echo Local decision engine is up -- two windows are now running, leave them open.
echo Start your bot(s) separately now.
