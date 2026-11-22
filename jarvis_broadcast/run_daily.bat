@echo off
REM ============================================================================
REM  DAILY JARVIS BROADCAST -> YOUTUBE (UNLISTED) - for Windows Task Scheduler
REM
REM  Records Jarvis's MORNING BROADCAST (picture + voice, 1080x1920) from the desk
REM  site and uploads it to your channel as UNLISTED. ~4-6 minutes.
REM  The link is written to out\last_run.json and out\run.log.
REM
REM  WHEN: 07:15 UK, after the 06:30 OI pull (oi_recon\run_daily.bat) has finished,
REM  so the gamma views have today's option books.
REM
REM  Set up in Task Scheduler (same as the OI pull):
REM    Program/script:  C:\...\MacroFXModel\jarvis_broadcast\run_daily.bat
REM    Start in:        C:\...\MacroFXModel\jarvis_broadcast   <- set this
REM    Run whether user is logged on or not:  NO. It drives a real browser window.
REM    Conditions > "Wake the computer to run this task"
REM    Settings   > "Run task as soon as possible after a scheduled start is missed"
REM  One-off setup first (README.md):  python record_broadcast.py --login
REM                                    python record_broadcast.py --youtube-auth
REM ============================================================================
cd /d "%~dp0"
python record_broadcast.py %*
exit /b %ERRORLEVEL%
