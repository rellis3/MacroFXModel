@echo off
REM Launch the OI Gamma bot with the repo venv's python explicitly.
REM Bare `python` on this machine resolves to the system Python, which has no MetaTrader5 package -> the bot logs
REM "live requested but MetaTrader5 missing" and silently falls back to PAPER (same root cause as fib_atlas_bot_v2\start.bat).
REM Usage:  oi_bot\start.bat            (live, as the bot is normally run)
REM         oi_bot\start.bat --paper    (extra args are passed straight through)
setlocal
cd /d "%~dp0.."
if not exist ".venv\Scripts\python.exe" (
  echo .venv\Scripts\python.exe not found - cannot start with MetaTrader5.
  pause
  exit /b 1
)
.venv\Scripts\python.exe oi_bot\oi_bot.py --live --url https://macrofxmodel-production.up.railway.app %*
pause
