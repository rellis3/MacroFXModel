# Laptop tasks: what feeds the terminal from your machine, what is running, what is not

Hand-kept, 2026-11-16. Written after the owner asked "why is so much out of date?". The short answer: about a dozen feeds are pushed
from the laptop (IBKR needs a logged-in TWS or Gateway, so there is no cloud version), and one scheduled task was never created.

## First, see what Windows is actually running

PowerShell on the laptop (lists every scheduled task that runs something in the repo, when it last ran and whether it succeeded;
a `LastTaskResult` of 0 is success, 267009 means it is running now, anything else is a failure):

```powershell
Get-ScheduledTask | Where-Object { $_.Actions.Execute -like '*MacroFXModel*' -or $_.Actions.Arguments -like '*MacroFXModel*' } |
  ForEach-Object { $i = $_ | Get-ScheduledTaskInfo; [pscustomobject]@{ Task = $_.TaskName; State = $_.State; LastRun = $i.LastRunTime; Result = $i.LastTaskResult; NextRun = $i.NextRunTime } } |
  Sort-Object Task | Format-Table -AutoSize
```

## The table

| Task (script) | Feeds | Live evidence 2026-11-16 15:00 UTC | Schedule it should have | Check it ran |
|---|---|---|---|---|
| **Central-bank futures, cross-currency basis, options skew**: `scripts\rates_line\run_cb_expectations.bat` (one script runs all three pulls) | `/api/cb-expectations` (what each bank's futures price), `/api/xccy-basis`, `/api/options-skew`; the desk analysts' rates, credit and vol reads | **NOT SCHEDULED.** All three are about 12 days old (`kv:cb_rate_futures_v1` 11.9 days, `kv:options_skew_v1` 11.9 days, `xccy-basis` empty). The last good push was around 4 Nov. | 07:30 and 17:30 UK, daily, IB Gateway logged in | `/api/data-health` rows `kv:cb_rate_futures_v1` and `kv:options_skew_v1` go `fresh`; log in `scripts\rates_line\logs\cb_expectations_YYYY-MM-DD.log` |
| **Fed funds path (ZQ)**: `fedwatch\run_zq.bat` ("download ZQ data") | `/api/fed-path` per-meeting strip, the Fed path boards and the time machine | Running: `kv:zq_path_v1` is 2.7 days old, i.e. Friday's settle. A Monday afternoon reads old because the next run is 22:30 UK tonight; weekends are correct no-ops. | 22:30 UK, daily | `kv:zq_path_v1` age under 1 day after 22:30; `fedwatch\logs\zq_*.log` |
| **Atlanta Fed rate-probability file**: `fedwatch\run_daily.bat` ("Rate hike pull") | `/api/fed-path` window odds (`mpt`) | `mpt` is 4.6 days old on a 2-day rhythm: either the laptop was off on Friday and Monday or the file has not changed (the script uses the ETag, so an early run costs nothing). Check the log. | 16:30, 18:30, 20:30 UK on business days | `/api/data-health` row `mpt`; `fedwatch\logs\*.log` shows 304 (unchanged) or the new rows |
| **OI capture**: `oi_recon\run_daily.bat`, then `oi_recon\run_secondary.bat` | `/api/oi-store`, OI levels, IV term structure, the terrain, the ghost walk | Healthy: `oi_store` 0.3 days. | 06:30 UK or later (run_daily), 07:30 UK (run_secondary); not just after midnight | `oi_store`, `kv:oi_capture_freshness` fresh |
| **C.OG line (SOFR and Euribor 1-minute bars)**: `scripts\rates_line\run_cog_line.bat` or `run_cog_legs.bat` | `/api/cog-line`, the rate legs | `kv:cog_line_live_v1` reports no time, so it cannot be judged from here | every 30 minutes, all day | the Rates page card age |
| **Release Reaction live**: `scripts\release_layer1\run_release_live.bat` | the Release Reaction page | not judged from here | every 5 minutes | the page's "bars" age |
| **Release Reaction layer 2 sheet**: `scripts\release_layer2\run_release_why.bat` | `kv:release_layer2_v1` (going-in factor sheet) | 20.7 days old: not running | twice a day (more is pointless) | `kv:release_layer2_v1` fresh |

## The one task to create now (copy, paste, run in an ordinary PowerShell on the laptop)

The repo path below is the one on your machine. Both triggers run the same script (central-bank futures, cross-currency basis and options skew);
it needs TWS or IB Gateway logged in, so it is created for your logged-in user (no "run whether logged on or not").

```powershell
$bat = 'C:\Users\relli\OneDrive\Documents\Programming\Trading\v2 trading model\MacroFXModel\scripts\rates_line\run_cb_expectations.bat'
schtasks /Create /TN "MacroFX CB expectations 0730" /TR "`"$bat`"" /SC DAILY /ST 07:30 /F
schtasks /Create /TN "MacroFX CB expectations 1730" /TR "`"$bat`"" /SC DAILY /ST 17:30 /F
# run it once now to fill the feeds (IB Gateway must be logged in on port 4002):
schtasks /Run /TN "MacroFX CB expectations 0730"
```

In Task Scheduler's UI, also tick "Run task as soon as possible after a scheduled start is missed" on both (it catches up after the laptop was off).
After a run, wait a minute, then check: `https://macrofxmodel-production.up.railway.app/api/options-skew` and `/api/cb-expectations` should show today's date, and
`/api/data-health` should show those two rows as `fresh`. If the script cannot reach IBKR it says so and exits with code 2 without writing anything: the log shows it.

Release layer 2 (optional, same shape):

```powershell
$bat2 = 'C:\Users\relli\OneDrive\Documents\Programming\Trading\v2 trading model\MacroFXModel\scripts\release_layer2\run_release_why.bat'
schtasks /Create /TN "MacroFX Release layer2 0800" /TR "`"$bat2`"" /SC DAILY /ST 08:00 /F
schtasks /Create /TN "MacroFX Release layer2 1800" /TR "`"$bat2`"" /SC DAILY /ST 18:00 /F
```

## Central-bank futures: what changed on 2026-11-16 (ECB, BoE, BoJ meeting by meeting)

- **SONIA (the BoE) had never arrived.** `refresh_cb_expectations.py` passed ICE Futures Europe contracts to IBKR with a last-trade string like `20261215 18:00:00 GB`;
  IBKR refuses that in a data request (error 10372), the pull read it as "no prices" and the note in the script ("no ICE data in the account") was wrong: with just the
  date the same contracts return prices (live check on the owner's Gateway). Fixed: GBP now comes back (SO3 on ICEEU), and the ICE €STR (ER3) and 3M Euribor also return data.
- The pull now also stores each rung's 1-day, 1-week and 4-week closes, so the card shows how the priced path moved.
- The ECB, BoE and BoJ are solved meeting by meeting from the same strip (`js/cbMeetingPath.js`), shown on the Macro > Policy "What the futures price" card.
  Meeting calendars (ECB, BoE, BoJ official lists, 2026-12 to 2027-12) are hand-kept in that file with a stale guard (the card says "meeting calendar needs refreshing" within
  120 days of the last date).
- Scheduling: the single task above (`run_cb_expectations.bat`, 07:30 and 17:30 weekdays or daily) is the right cadence. Do not run it every 30 minutes: each rung is one historical
  request at the IBKR pacing of one per 10.5 seconds (about 10 to 12 minutes a run for all banks), shared with the 30-minute CogLegs task. For only the three banks, `--only EUR,GBP,JPY`
  takes about 3 to 4 minutes (the .bat passes extra arguments through).

## Not a laptop task, but needs you

- **RBNZ statements**: the RBNZ site blocks the server's address, so `/api/rbnz/latest` has no analysis (decisions still come from the RSS feed). Either send the allowlist
  request to the RBNZ service desk (the server's outbound address is on the Railway dashboard), or open the RBNZ page and press "Fetch now" from a browser session if the
  page offers it. Nothing on the laptop fetches it today.
- **Paid model reads written by hand, by design** (the morning brief, the evening review, the chain read, the weekly view): they read as "old" because nothing runs them
  unless you press the button. The data-health map now says so instead of "check the job".

## Why a laptop at all

IBKR has no cloud endpoint: its data comes from a logged-in TWS or IB Gateway on a machine you control. Moving these to an always-on small Windows machine is the clean fix
(see the parked note in memory: project_laptop_dependencies); until then, a laptop that is asleep means these feeds age, and the chips now say "updated by a task on your laptop".
