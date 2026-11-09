<#
 run_roe.ps1: one-click ROE scan and push (Windows). Double-click run_roe.bat, or run this from PowerShell.
 First run: asks for the push token ONCE and stores it encrypted for your Windows user (DPAPI) in
   %USERPROFILE%\.macrofx\roe_push_token.dat      (outside the repo; only your Windows account on this PC can read it)
 Later runs: no questions. If the server refuses the token, the stored copy is deleted and the next run asks again.
 Options:  -ResetToken   forget the stored token and ask again
           -Schedule     register a daily 08:15 Windows task that runs this script (no window pause)
           -NoPause      do not wait for a key at the end (used by the scheduled task)
#>
param([switch]$ResetToken, [switch]$Schedule, [switch]$NoPause)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$tokenDir  = Join-Path $env:USERPROFILE '.macrofx'
$tokenFile = Join-Path $tokenDir 'roe_push_token.dat'

function Finish([int]$code, [string]$msg) {
  if ($msg) { Write-Host ''; Write-Host $msg }
  if (-not $NoPause -and -not $Schedule) { Write-Host ''; Read-Host 'Press Enter to close' | Out-Null }
  exit $code
}

if ($Schedule) {
  $action  = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -NoPause"
  $trigger = New-ScheduledTaskTrigger -Daily -At 8:15am
  Register-ScheduledTask -TaskName 'ROE scan' -Action $action -Trigger $trigger -Force | Out-Null
  Finish 0 "Scheduled: 'ROE scan' runs every day at 08:15 while you are logged in. Run this script once by hand first so the token is stored."
}

# 1. the token (stored once, encrypted with Windows DPAPI for this user: System.Security.Cryptography.ProtectedData, base64 in a text file)
Add-Type -AssemblyName System.Security
function Get-Plain($secure) {
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}
$scope = [Security.Cryptography.DataProtectionScope]::CurrentUser
if ($ResetToken -and (Test-Path -LiteralPath $tokenFile)) { Remove-Item -LiteralPath $tokenFile -Force }
if (-not (Test-Path -LiteralPath $tokenFile)) {
  if ($NoPause) { Finish 4 'No stored push token. Run run_roe.bat by hand once to enter it.' }
  Write-Host 'First run: paste the push token (the same text as ROE_PUSH_TOKEN on Railway). It will not show as you type.'
  $entered = (Get-Plain (Read-Host 'Push token' -AsSecureString)).Trim()
  if ($entered.Length -lt 24) { Finish 4 'That token is shorter than 24 characters, so it cannot be the right one. Nothing was saved. Run again.' }
  New-Item -ItemType Directory -Force -Path $tokenDir | Out-Null
  $enc = [Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($entered), $null, $scope)
  [IO.File]::WriteAllText($tokenFile, [Convert]::ToBase64String($enc))
  Write-Host "Token stored (encrypted for your Windows user) in $tokenFile"
}
try {
  $enc   = [Convert]::FromBase64String(([IO.File]::ReadAllText($tokenFile)).Trim())
  $plain = [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($enc, $null, $scope)).Trim()
} catch {
  Remove-Item -LiteralPath $tokenFile -Force -ErrorAction SilentlyContinue
  Finish 4 ("The stored token could not be read, so it was removed: run again to enter it. Reason: " + $_.Exception.Message)
}
$env:ROE_PUSH_TOKEN = $plain   # this process only; gone when the window closes

# 2. the python from the project's venv if there is one
$py = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $py)) { $py = 'python' }

# 3. the sources file (your local data paths); created from the default the first time
$src = 'roe_sources.laptop.json'
if (-not (Test-Path -LiteralPath $src)) {
  Copy-Item -LiteralPath 'roe\sources.default.json' -Destination $src
  Finish 3 "Created $src from the default. Open it, point the paths at your real data files, then run this again."
}

# 4. scan and push
Write-Host 'Scanning and pushing...'
$ErrorActionPreference = 'Continue'   # Windows PowerShell 5 turns python's stderr lines into errors when this is 'Stop'
& $py -m roe --sources $src --push 2>&1 | ForEach-Object { "$_" } | Tee-Object -Variable log | Out-Host
$code = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
$text = ($log | Out-String)
if ($code -eq 0) {
  $line = ($log | Where-Object { $_ -match '^push:' } | Select-Object -Last 1)
  Finish 0 ("Done. " + $line + "`nOpen the Research Opportunities page on the site to see the questions.")
}
if ($code -eq 4 -and $text -match 'HTTP 401') {
  Remove-Item -LiteralPath $tokenFile -Force -ErrorAction SilentlyContinue
  Finish 4 'The server refused the token (HTTP 401). The stored copy was deleted. Check the ROE_PUSH_TOKEN variable on Railway (and that its deploy finished), then run this again and paste the token.'
}
if ($code -eq 4) { Finish 4 'The scan finished but the push failed (see the line above). It is saved locally: run   python -m roe --push-only latest   once the server is reachable.' }
if ($code -eq 3) { Finish 3 'A run with this ID already exists with different inputs. Run again later, or after the data files change.' }
Finish $code 'The scan failed (see above).'
