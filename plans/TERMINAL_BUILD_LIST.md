# Desk Terminal build list

Hand-kept. One row per thing we agreed to build or decided not to. The Info map (plans/INFO_MAP.md) lists the DATA families;
this lists the FEATURES and the data still to be found. Update the row in the same commit that changes it.
Status: TODO, DOING, DONE (with commit), PARKED (with why), DROPPED (with why).
Rules that apply to every row: analysis only for the viewer (no trades, cost or private tooling); direction claims keep their
evidence chip and are never turned into signals; every new surface is registered in js/terminal/tabRegistry.js and every new
feed goes in js/infoMap.js with its status.

## 1. Terminal feel (2026-11-15, agreed)
| Item | Status | Notes |
|---|---|---|
| Owner-only switch for the new terminal features (command line, linked selection, workspaces, dense mode) | TODO | Owner request 2026-11-15: only the owner sees them until ready, so viewers are not disturbed. Register each as a surface hidden from viewers and add an on/off setting under the Info view or admin panel. Flip to viewers when agreed. |
| Command line (`/` opens it: EURUSD, FED, CPI US, MACRO RATES, REPLAY NQ 12 NOV) | TODO | Every command has a one-line help, an example and a "what it opens" note, generated from the surface registry so a new surface cannot ship without them. A guard test fails on a command with no help text. `?` lists everything; typing shows matches with their help. |
| Linked selection (pick an instrument once, all open boards follow) | TODO | Chart, strength, vol clock, drivers, Replay. |
| Workspaces (grid layouts, saved by name) | TODO | Built on the surface registry and admin visibility. |
| Dense monitor mode | TODO | A density setting on the existing themes. |
| Alerts (range used, Fed path move, data-age red) | TODO | Conditions on numbers already computed; delivery from Railway, never the cron-worker. |
| "What changed since I last looked" feed | TODO | Uses the snapshot store. |

## 2. Queued from "build all" (Info map Part C)
| Item | Status |
|---|---|
| Calendar drills: release small multiples, similar setups, release scorecard, earnings chips, nowcast gap | TODO |
| Where money sits; edges active | TODO |
| What is unusual right now (ranked by percentile), cross-asset matrix, sector rotation | TODO |
| Daily Read tags, weekmap strip, OI drills, BIS heat strip, risk-flag history, world economies tiles, Market Sense list | TODO |

## 3. Rework
| Item | Status | Notes |
|---|---|---|
| Replay tab | TODO | Owner said it was not what they imagined. Waiting on which of: whole-terminal time machine / OI-gamma level path replay around price / other. |

## 4. Data not yet held
| Item | Status | Notes |
|---|---|---|
| Headline and news tape tagged by currency and bank | TODO | Needs a source decision from the owner. |
| Consensus and surprise history on the calendar | TODO | Surprise store is US vintages only. |
| CFTC positioning board | TODO | Check dataCatalogue first, it may exist. |
| Cross-currency basis and swap spreads as boards | TODO | Some feeds exist. |
| Earnings and sector rotation calendar | TODO | |
| CDS or sovereign spreads | TODO | Needs a source. |

## 5. Open decisions and housekeeping
| Item | Status |
|---|---|
| Python test job red: forge proof gate has no checks.json for the five vol-layer-rule-a-confirm entries | PARKED, needs owner decision |
| Info map guard goes red when parallel builds land between a regeneration and its push (CI or the test should regenerate) | TODO |
| Move the Atlanta Fed pull to Railway (with a stale guard); laptop task for central-bank futures and skew | PARKED, see memory project_laptop_dependencies |
