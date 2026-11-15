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
| Owner-only switch for the new terminal features (command line, linked selection, workspaces, dense mode) | DONE 03da9ef8 | New registry hide reason `preview` (js/terminal/tabRegistry.js): the owner always sees a preview feature, the desk login only when switched on, from the Access page or the Preview features panel at the top of the Info map tab (js/terminal/previewSwitches.js). js/terminal/terminalFeel.js imports a feature only after the registry check, so a desk login with the switch off gets no button, no key handler, no code. To add the next feature (workspaces, dense mode, alerts): register it as a `preview` surface, load it from terminalFeel.js, add its id to the preview list in tabRegistry.test.mjs. |
| Command line (`/` opens it: EURUSD, FED, CPI US, MACRO RATES, REPLAY NQ 12 NOV) | DONE 03da9ef8 | `/`, backtick or Ctrl+K. Commands are generated from the surface registry and the Macro sections (js/terminal/commandCore.js) plus aliases; every command has help, an example and an opens note, and a guard test types each example back through the matcher. `?` lists all. A new TAB needs an entry in TAB_WORDS. Not verified in a real browser: look on the six themes, phone width. |
| Linked selection (pick an instrument once, all open boards follow) | DONE 03da9ef8 | js/terminal/selectionCore.js + linkedSelection.js. Followers: Pair page, Replay (same moment), asset cards and vol-clock tiles (glow ring), strength board (rings the two currencies), candle-size pills. Top-bar chip links/unlinks. Drivers follow the Pair page. Not wired: Currencies tab and Charts. Not verified in a real browser. |
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
