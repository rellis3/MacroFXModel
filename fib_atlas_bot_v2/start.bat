@echo off
REM ============================================================================
REM  Launches fib_atlas_bot_v2 with the PROJECT VENV's python.exe explicitly,
REM  never whatever bare `python` resolves to on PATH.
REM
REM  Root cause this works around (2026-09-27): this machine has multiple
REM  python.exe on PATH (C:\Python314, the WindowsApps stub, an AppData
REM  per-user install) and only .venv has the `MetaTrader5` package installed.
REM  A plain `python fib_atlas_bot_v2\fib_atlas_bot_v2.py --live` in a shell
REM  that hadn't run .venv\Scripts\Activate.ps1 silently picked one of the
REM  OTHER interpreters, so Mt5Broker's `import MetaTrader5` failed and the
REM  bot fell back to PAPER even with valid live credentials saved in KV.
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

"%VENV_PY%" fib_atlas_bot_v2\fib_atlas_bot_v2.py %*
