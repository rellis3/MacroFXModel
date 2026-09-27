@echo off
REM ============================================================================
REM  One-shot launcher for the 4 currently-traded bots:
REM    fib_atlas_bot     (fib v1)
REM    fib_atlas_bot_v2  (fib v2)
REM    volatility_bot_v2 (Vote Atlas v2)
REM    volatility_bot_v3 (Vote Atlas v3)
REM
REM  fib v2 and Vote Atlas v3 each need their own local decision engine
REM  running on this machine (fib_local_decision_engine on :4501,
REM  local_decision_engine on :4500) -- this script starts whichever of
REM  those two aren't already up, waits for /health, THEN opens one
REM  persistent window per bot. fib v1 and Vote Atlas v2 poll a server-side
REM  KV plan instead and don't need either local engine.
REM
REM  Every bot is launched via .venv\Scripts\python.exe explicitly, never
REM  bare `python` -- this machine has several python.exe on PATH and only
REM  .venv has the MetaTrader5 package installed; a shell that hadn't
REM  activated .venv would silently fall back to PAPER even with live
REM  creds saved (root-caused 2026-09-27, see fib_atlas_bot_v2\start.bat).
REM
REM    start_live_all.bat            -> each bot uses ITS OWN saved dashboard
REM                                      paper/live toggle (whatever's in its
REM                                      KV config right now)
REM    start_live_all.bat --live     -> forces --live on all 4, overriding
REM                                      each bot's saved toggle, same as
REM                                      passing --live to it individually
REM
REM  NOTE: without --live this is NOT a guaranteed all-paper run -- it mirrors
REM  each bot's own CLI contract, where --live is the only thing that forces
REM  paper_mode=False. If a bot's dashboard config already has "paper trade"
REM  unchecked (live saved), it starts live either way. Check each bot's
REM  config tab in bot-config.html before running this if you're not sure.
REM
REM  To stop: close each bot's own window (or Ctrl+C in it). Leave the two
REM  local-decision-engine windows running between bot restarts unless
REM  you're changing fib_local_decision_engine/local_decision_engine
REM  themselves.
REM ============================================================================
setlocal
cd /d "%~dp0"

set "LIVE_FLAG="
if /i "%~1"=="--live" set "LIVE_FLAG=--live"

set "VENV_PY=.venv\Scripts\python.exe"
if not exist "%VENV_PY%" (
    echo ERROR: %VENV_PY% not found - is the project venv set up at .venv?
    exit /b 1
)

if not defined DASHBOARD_URL set DASHBOARD_URL=https://macrofxmodel-production.up.railway.app
echo Using DASHBOARD_URL=%DASHBOARD_URL%

if defined LIVE_FLAG (
    echo.
    echo ============================================================
    echo   LIVE MODE -- this trades real money on real MT5 accounts.
    echo   fib v1 / fib v2 / Vote Atlas v2 / Vote Atlas v3, all 4.
    echo ============================================================
    echo.
    pause
)

echo.
call :ensure_engine "local_decision_engine" 4500 "local-decision" "Vote Atlas v3"
call :ensure_engine "fib_local_decision_engine" 4501 "fib-local-decision" "fib v2"

REM ---- the 4 bots, each its own persistent window, pinned to venv python ----
REM  Staggered a few seconds apart, not fired all at once -- fib v1/v2 share
REM  one MT5 account+terminal and Vote Atlas v2/v3 share a different one
REM  (see each bot's MT5 ACCOUNT card), and launching a pair of bots on the
REM  SAME account/terminal in the SAME instant has been observed to make
REM  both die silently on startup (2026-09-27) even though either runs fine
REM  alone or staggered by a couple seconds.
echo.
echo Starting fib_atlas_bot (v1)...
start "fib-atlas-v1" cmd /k "%VENV_PY%" fib_atlas_bot\fib_atlas_bot.py %LIVE_FLAG% --url %DASHBOARD_URL%
timeout /t 4 /nobreak >nul

echo Starting fib_atlas_bot_v2...
start "fib-atlas-v2" cmd /k "%VENV_PY%" fib_atlas_bot_v2\fib_atlas_bot_v2.py %LIVE_FLAG% --url %DASHBOARD_URL%
timeout /t 4 /nobreak >nul

echo Starting volatility_bot_v2 (Vote Atlas v2)...
start "vote-atlas-v2" cmd /k "%VENV_PY%" volatility_bot_v2\volatility_bot_v2.py %LIVE_FLAG% --url %DASHBOARD_URL%
timeout /t 4 /nobreak >nul

echo Starting volatility_bot_v3 (Vote Atlas v3)...
start "vote-atlas-v3" cmd /k "%VENV_PY%" volatility_bot_v3\volatility_bot_v3.py %LIVE_FLAG% --url %DASHBOARD_URL%

echo.
echo All 4 bots launched (each its own window), plus any local-decision-engine
echo windows that weren't already up. Check each window's first few log lines
echo for "MetaTrader5 missing" -- there should be none of them now.
goto :eof

REM ---- ensure_engine <dir> <port> <window-title-prefix> <label> ----
REM  No goto/label inside a parenthesized if-block here -- that combination
REM  corrupts cmd.exe's parser state and breaks the NEXT `call` to this same
REM  label (hit this 2026-09-27: the 2nd call died with "cannot find batch
REM  label specified"). Every branch below is a single-line `if ... goto`.
:ensure_engine
setlocal
set "ENGDIR=%~1"
set "PORT=%~2"
set "TITLE=%~3"
set "LABEL=%~4"
echo Checking %ENGDIR% (port %PORT%, %LABEL%)...
powershell -NoProfile -Command "try { Invoke-RestMethod -Uri 'http://127.0.0.1:%PORT%/health' -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if not errorlevel 1 goto ensure_engine_already_up

pushd "%ENGDIR%"
start "%TITLE%-sync" cmd /k node sync.mjs --loop
start "%TITLE%-server" cmd /k node server.mjs
popd
echo Waiting for %ENGDIR% to come up...
:ensure_engine_wait
timeout /t 2 /nobreak >nul
powershell -NoProfile -Command "try { Invoke-RestMethod -Uri 'http://127.0.0.1:%PORT%/health' -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 goto ensure_engine_wait
goto ensure_engine_done

:ensure_engine_already_up
echo Already up.

:ensure_engine_done
endlocal
goto :eof
