@echo off
REM ============================================================================
REM  DEEPER HISTORY for the rates legs - one-off (or occasional) IBKR pull
REM
REM  Extends the 1-minute history of the live SOFR / Euribor / ESTR contracts
REM  BACKWARDS from the oldest bar on disk, then rebuilds the chart files and
REM  commits + pushes them so the cog-chart page shows the longer history.
REM
REM  Needs IB Gateway open and logged in (API port 4002). Leave it running
REM  overnight: the seven core legs can take several hours (10.5 s per week of
REM  data per contract). If it stops, double-click again: it carries on.
REM
REM  Extra options are passed through, e.g.
REM    run_deep_history.bat --all                    (every live contract, not just the core 7)
REM    run_deep_history.bat --until 2022-01-01       (stop at 2022)
REM    run_deep_history.bat --dry-run                (show the plan only)
REM    run_deep_history.bat --i2-archive             (rolling I2!: fill the roll-week holes, extend to 2024; a few minutes)
REM ============================================================================
setlocal
cd /d "%~dp0"
set PY=..\..\.venv\Scripts\python.exe
if not exist "%PY%" set PY=python
if not exist "logs" mkdir "logs"
"%PY%" pull_deep_history.py --commit %*
set RC=%ERRORLEVEL%
if %RC% NEQ 0 (echo RESULT: stopped with exit %RC% - run again to carry on) else (echo RESULT: OK)
pause
endlocal & exit /b %RC%
