@echo off
REM Copy the freshly built bridge server DLL into NinjaTrader 8's Custom folder.
REM NinjaTrader must be CLOSED (it locks the DLL). Build first: cd nt8_bridge\server && dotnet build -c Release
setlocal
set SRC=%~dp0server\bin\Release\net48\stage\NT8ZmqBridge.Server.dll
set DST=%USERPROFILE%\OneDrive\Documents\NinjaTrader 8\bin\Custom
tasklist /FI "IMAGENAME eq NinjaTrader.exe" | find /I "NinjaTrader.exe" >nul && (echo NinjaTrader is running - close it first, then run this again. & exit /b 1)
if not exist "%SRC%" (echo Build output not found: %SRC% & exit /b 1)
if exist "%DST%\NT8ZmqBridge.Server.dll" copy /Y "%DST%\NT8ZmqBridge.Server.dll" "%DST%\NT8ZmqBridge.Server.dll.bak" >nul
copy /Y "%SRC%" "%DST%\" && echo Installed. Start NinjaTrader, connect your data, and the bridge starts with it.
endlocal
