@echo off
REM ============================================================================
REM  Launches volatility_bot_v2 (Vote Atlas v2) with the PROJECT VENV's
REM  python.exe explicitly, never whatever bare `python` resolves to on PATH.
REM
REM  See fib_atlas_bot_v2\start.bat for the root cause this works around:
REM  multiple python.exe on this machine's PATH, only .venv has MetaTrader5.
REM
REM  Usage (same flags as the .py file):
REM    start.bat                 (paper mode)
REM    start.bat --live
REM    start.bat --live --url https://macrofxmodel-production.up.railway.app
REM ============================================================================
setlocal
cd /d "%~dp0.."

set "VENV_PY=.venv\Scripts\python.exe"
if not exist "%VENV_PY%" (
    echo ERROR: %VENV_PY% not found - is the project venv set up at .venv?
    exit /b 1
)

"%VENV_PY%" volatility_bot_v2\volatility_bot_v2.py %*
