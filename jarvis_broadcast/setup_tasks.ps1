# jarvis_broadcast/setup_tasks.ps1: registers the NEW H.E.L.I.X. scheduled tasks on the laptop. It only ADDS tasks that do not exist yet:
# the existing "Jarvis Broadcast" (07:00), "Jarvis Broadcast Evening" (21:00) and "Jarvis Desk Run" (06:30) tasks are never read, changed or removed.
#
#   powershell -ExecutionPolicy Bypass -File jarvis_broadcast\setup_tasks.ps1 -WhatIf    show what would be registered, change nothing
#   powershell -ExecutionPolicy Bypass -File jarvis_broadcast\setup_tasks.ps1            register the missing ones
#
# Tasks (all "run only when the user is logged on": they drive a real browser window):
#   Helix Weekly Recap     Fridays 22:00                         run_weekly.bat         the weekly recap, after the Friday evening briefing (queues behind it)
#   Helix Release Special  weekdays 07:00, every 10 min to 22:30 run_special_check.bat  exits at once unless a rank-3 release printed 30-80 min ago has no special
#   Helix Upload Retry     daily 08:15, every 2 h to 23:15       run_upload_retry.bat   retries failed uploads; exits at once when there are none
# The Short and the podcast episode need no task: they are made by the morning / evening runs.
param([switch]$WhatIf)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$user = "$env:USERDOMAIN\$env:USERNAME"

function Add-HelixTask([string]$Name, [string]$Bat, $Trigger, [bool]$Wake, [bool]$CatchUp, [TimeSpan]$Limit, [string]$What) {
  if (Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue) { Write-Host "exists, left as it is: $Name"; return }
  $path = Join-Path $here $Bat
  if (-not (Test-Path $path)) { throw "missing $path" }
  if ($WhatIf) { Write-Host "would register: $Name -> $path  ($What)"; return }
  $action = New-ScheduledTaskAction -Execute $path -WorkingDirectory $here
  $set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit $Limit -MultipleInstances IgnoreNew
  $set.WakeToRun = $Wake
  $set.StartWhenAvailable = $CatchUp
  $prin = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $Name -Description $What -Action $action -Trigger $Trigger -Settings $set -Principal $prin | Out-Null
  Write-Host "registered: $Name"
}

# Friday 22:00, after the 21:00 evening briefing (which takes ~30-40 min frame by frame). A missed start may run late; the recorder's window (18:00-23:59, Fridays) skips it after midnight.
$weekly = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Friday -At '22:00'
Add-HelixTask 'Helix Weekly Recap' 'run_weekly.bat' $weekly $true $true (New-TimeSpan -Hours 2 -Minutes 30) 'H.E.L.I.X. weekly recap to YouTube (unlisted), after the Friday evening briefing. Telegram note from the server.'

# Weekdays from 07:00, every 10 minutes for 15 h 30 min (to 22:30). No wake (it would wake the laptop 90 times a day) and no catch-up (a missed check does not matter).
$special = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday, Tuesday, Wednesday, Thursday, Friday -At '07:00'
$special.Repetition = (New-ScheduledTaskTrigger -Once -At '07:00' -RepetitionInterval (New-TimeSpan -Minutes 10) -RepetitionDuration (New-TimeSpan -Hours 15 -Minutes 30)).Repetition
Add-HelixTask 'Helix Release Special' 'run_special_check.bat' $special $false $false (New-TimeSpan -Hours 1 -Minutes 45) 'H.E.L.I.X. release special: records one short video 30-80 min after payrolls / CPI / a rate decision. Exits at once otherwise.'

# Every day from 08:15, every 2 hours for 15 h (to 23:15).
$retry = New-ScheduledTaskTrigger -Daily -At '08:15'
$retry.Repetition = (New-ScheduledTaskTrigger -Once -At '08:15' -RepetitionInterval (New-TimeSpan -Hours 2) -RepetitionDuration (New-TimeSpan -Hours 15)).Repetition
Add-HelixTask 'Helix Upload Retry' 'run_upload_retry.bat' $retry $false $true (New-TimeSpan -Minutes 45) 'H.E.L.I.X. upload retry queue: uploads a recorded video whose upload failed. Exits at once when the queue is empty.'
