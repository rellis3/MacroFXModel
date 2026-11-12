@echo off
REM ============================================================================
REM  residual-fx8-forward: nightly paper record of the FX8 residual threshold book
REM  (forge/RESIDUAL_FX8_FORWARD_PREREG.md). Fetches OANDA daily closes (17:00 New York),
REM  logs tonight's financing rates, appends the new day(s) and pushes the summary to KV.
REM  Task Scheduler: "MacroFX ResidualFX8 forward", daily 22:30 and 23:30 UK (always after the
REM  17:00 NY close; the second run only re-pushes). Runs hidden via scripts\run_hidden.vbs.
REM ============================================================================
setlocal
cd /d "%~dp0"
set PY=..\..\.venv\Scripts\python.exe
if not exist "%PY%" set PY=python
if not exist "logs" mkdir "logs"
"%PY%" record.py --push >> "logs\record.log" 2>&1
exit /b %ERRORLEVEL%
