@echo off
REM ============================================================================
REM  Launches SignalCopier\signal_copier.py with the PROJECT VENV's python.exe,
REM  never whatever bare `python` resolves to on PATH (only .venv has
REM  MetaTrader5 -- see fib_atlas_bot_v2\start.bat). Same flags as the .py:
REM    start.bat --url https://macrofxmodel-production.up.railway.app          (paper)
REM    start.bat --url ... --live
REM    start.bat --url ... --backfill-since 2025-01-01
REM  First run on a new venv: .venv\Scripts\python.exe -m pip install -r SignalCopier\requirements.txt
REM ============================================================================
setlocal
cd /d "%~dp0.."

set "VENV_PY=.venv\Scripts\python.exe"
if not exist "%VENV_PY%" (
    echo ERROR: %VENV_PY% not found - is the project venv set up at .venv?
    exit /b 1
)

"%VENV_PY%" SignalCopier\signal_copier.py %*
