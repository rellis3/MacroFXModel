# Step 3: run the banked pipeline (response study -> control study -> control report), unchanged
# except for directories, on a planted M1 directory.
#   pwsh run_plant_pipeline.ps1 <plantedDir> [pairs]
param([string]$Dir, [string]$Pairs = 'eurusd,gbpusd,usdjpy,gold,nq,de30')
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:PLANT_M1_DIR = $Dir
$env:PLANT_OUT = Join-Path $Dir 'out'
$env:LA_PAIRS = $Pairs
$sw = [Diagnostics.Stopwatch]::StartNew()
node (Join-Path $here 'study_copy/line_touch_response_study.mjs') 2>&1 | Select-Object -Last 14
node (Join-Path $here 'study_copy/line_touch_control_study.mjs') 2>&1 | Select-Object -Last 14
node (Join-Path $here 'study_copy/line_touch_control_report.mjs') 2>&1 | Select-Object -First 24
"elapsed {0:n0}s" -f $sw.Elapsed.TotalSeconds
