# Fix the "Download OI data" scheduled task so it survives a sleeping or
# rebooting machine. MUST be run as Administrator (right-click > Run with
# PowerShell will NOT be enough - see the check below).
#
# Why each one, from what actually went wrong:
#   WakeToRun            - 11-18 Aug: the laptop slept and the task had no
#                          permission to wake it. Eight nights lost.
#   StartWhenAvailable   - 19/20 Aug: Windows Update rebooted the machine at
#                          00:06-00:13 and the 00:36 slot simply passed. This
#                          setting retries a run missed while the box was busy
#                          or down, and is the one that would have saved it.
#   *OnBatteries         - a task that stops the moment you unplug is a task
#                          that will not run on a trip.
$ErrorActionPreference = 'Stop'
$name = 'Download OI data'

if (-not ([Security.Principal.WindowsPrincipal] `
      [Security.Principal.WindowsIdentity]::GetCurrent()
    ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host "NOT running as Administrator - nothing changed." -ForegroundColor Red
  Write-Host "Close this, then right-click Start > Terminal (Admin), and run:"
  Write-Host "    & '$PSCommandPath'"
  Read-Host "Press Enter to close"
  exit 1
}

$t = Get-ScheduledTask -TaskName $name
$s = $t.Settings
$s.WakeToRun                 = $true
$s.StartWhenAvailable        = $true
$s.StopIfGoingOnBatteries    = $false
$s.DisallowStartIfOnBatteries= $false
Set-ScheduledTask -TaskName $name -Settings $s | Out-Null

$v = (Get-ScheduledTask -TaskName $name).Settings
Write-Host ""
Write-Host "Applied to '$name':" -ForegroundColor Green
"  WakeToRun                  = {0}" -f $v.WakeToRun
"  StartWhenAvailable         = {0}" -f $v.StartWhenAvailable
"  StopIfGoingOnBatteries     = {0}" -f $v.StopIfGoingOnBatteries
"  DisallowStartIfOnBatteries = {0}" -f $v.DisallowStartIfOnBatteries
Write-Host ""
Write-Host "Next run: $((Get-ScheduledTask -TaskName $name | Get-ScheduledTaskInfo).NextRunTime)"
Read-Host "Press Enter to close"
