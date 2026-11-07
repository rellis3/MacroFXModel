@echo off
REM ============================================================================
REM  Footprint capture: records the front NQ, ES, YM, RTY, FDAX, GC, CL, 6E, 6B, 6J, 6A, 6C, 6S and 6N contracts from NinjaTrader and feeds footprint.html.
REM  Double-click it and leave the window open. It waits for NT8, restarts the recorder if NT8 restarts, and rolls contracts itself.
REM  Read-only market data: this does NOT start any trading bot (that is start_live_all.bat).
REM
REM  To start it at login: Win+R, shell:startup, and put a shortcut to this file there.
REM  Other markets: start_footprint_capture.bat --roots NQ ES GC SI ZN
REM ============================================================================
setlocal
cd /d "%~dp0"
set PY=..\..\.venv\Scripts\python.exe
if not exist "%PY%" set PY=python
set LOGDIR=%LOCALAPPDATA%\MacroFXModel\nt8_live\logs
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
title Footprint capture
"%PY%" -u footprint_capture.py %* 2>&1 | powershell -NoProfile -Command "$input | Tee-Object -FilePath '%LOGDIR%\capture.log' -Append"
pause
