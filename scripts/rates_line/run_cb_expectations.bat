@echo off
REM ============================================================================
REM  CENTRAL-BANK RATE EXPECTATIONS - pull the short-rate futures from IBKR and push them to the server
REM
REM  Reads SONIA, €STR, SARON, CORRA, the ASX 30-day cash-rate and NZ OCR/bank-bill futures (and ZQ for the
REM  Fed) from your TWS / IB Gateway and POSTs them to the server (KV cb_rate_futures_v1), so the Desk
REM  Terminal's Macro tab shows what each market prices for its central bank. Double-click to refresh once.
REM
REM  Task Scheduler: Daily at 07:30 and 17:30 (twice a day is plenty), Start in: this folder,
REM  "Run whether user is logged on or not": NO (it needs your logged-in TWS / Gateway).
REM  First time: run  python refresh_cb_expectations.py --discover  to see which contracts your account can see.
REM  If TWS is closed the script says so, exits with code 2 and changes nothing.
REM ============================================================================
setlocal
cd /d "%~dp0"
set PY=..\..\.venv\Scripts\python.exe
if not exist "%PY%" set PY=python
if not exist "logs" mkdir "logs"
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set DSTAMP=%%d
set LOGFILE=logs\cb_expectations_%DSTAMP%.log
echo ================================================== >> "%LOGFILE%"
echo  RUN STARTED %date% %time% >> "%LOGFILE%"
"%PY%" refresh_cb_expectations.py --push %* >> "%LOGFILE%" 2>&1
set RC=%ERRORLEVEL%
echo [%date% %time%] finished with exit code %RC% >> "%LOGFILE%"
findstr /C:"HTTP" /C:"Could not connect" /C:"not found" /C:"no prices" /C:"wrote" "%LOGFILE%"
if %RC% NEQ 0 (echo RESULT: NOT UPDATED ^(exit %RC%^)) else (echo RESULT: OK)
endlocal & exit /b %RC%
