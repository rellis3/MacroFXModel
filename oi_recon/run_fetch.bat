@echo off
REM Overnight OI fetch. Writes only to oi_recon\out\<date>\fetch\ - never to KV.
REM Usage:  run_fetch.bat selftest | discover | eurusd | all
setlocal
cd /d "%~dp0"

set PY=..\.venv\Scripts\python.exe
if not exist "%PY%" set PY=python

if "%1"=="" goto usage
if /i "%1"=="selftest" ( "%PY%" fetch_oi.py --selftest                        & goto end )
if /i "%1"=="discover" ( "%PY%" fetch_oi.py --discover                        & goto end )
if /i "%1"=="eurusd"   ( "%PY%" fetch_oi.py --fetch --pair "EUR/USD"          & goto end )
if /i "%1"=="all"      ( "%PY%" fetch_oi.py --fetch --headless                & goto end )

:usage
echo.
echo   run_fetch.bat selftest  - offline synthesis check, no network
echo   run_fetch.bat discover  - learn CME product ids (run once)
echo   run_fetch.bat eurusd    - fetch EUR/USD only, visible browser
echo   run_fetch.bat all       - every instrument, headless (the overnight run)
echo.

:end
endlocal
pause
