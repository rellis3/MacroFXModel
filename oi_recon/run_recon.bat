@echo off
REM OI recon — read-only. Writes only to oi_recon\out\.
REM Usage:  run_recon.bat probe | login | browse | diff
setlocal
cd /d "%~dp0"

set PY=..\.venv\Scripts\python.exe
if not exist "%PY%" set PY=python

if "%1"=="" goto usage
if /i "%1"=="probe"  ( "%PY%" recon.py --probe --limit 1 --delay 2 & goto end )
if /i "%1"=="login"  ( "%PY%" recon.py --login                      & goto end )
if /i "%1"=="browse" ( "%PY%" recon.py --browse --only "EUR/USD"    & goto end )
if /i "%1"=="diff"   ( "%PY%" recon.py --diff                       & goto end )

:usage
echo.
echo   run_recon.bat probe    - no-login HTTP pass, one product
echo   run_recon.bat login    - opens Chrome, you sign in yourself
echo   run_recon.bat browse   - reuses session, captures EUR/USD endpoints
echo   run_recon.bat diff     - grades captures against js\fixtures\
echo.

:end
endlocal
pause
