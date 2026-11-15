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
| Workspaces (grid layouts, saved by name) | DONE (preview, 0a1e9d89) | Workspace tab: drag/resize grid of the terminal's own panels, 3 starters, named layouts shared by the desk (KV desk_workspaces_v1), this browser's current layout, file export/import, phone stack; commands WORKSPACE and SAVE WORKSPACE. Not yet seen in a browser. |
| Chart tab: open-source candle chart with built-in indicators (each with a settings popover) | DONE (preview, aabe7363; tidied 2026-11-15) | KLineChart 10.1.0 (Apache-2.0), pinned jsDelivr + integrity hash, on our bars with the 5m-4h pills; our forecast lines, option walls, session range and dawn chip laid over it; themes repaint it; CHART <market> <size>. Owner saw it render on a phone 2026-11-15 and found the drawing tools clunky and the indicators fixed: drawing tools REMOVED (DROPPED: full TradingView-style tooling judged a step too far); each indicator now has a gear (or right-click) popover for its numbers (MA up to 4 lines, EMA and RSI up to 3, Bollinger bars and width, MACD fast/slow/signal), range-checked, shown in a legend, remembered in this browser, reset to default. KLineChart Pro not used (2023, v9). The new settings reach the library as calcParams and have not been run in a browser: unverified. |
| Dense monitor mode | TODO | A density setting on the existing themes. |
| Alerts (range used, Fed path move, data-age red, level touch, weekend gap closed) | DONE (preview, d89a6e0f) | Rules you set; one Telegram note per episode via Railway sendTelegram (master switch + tgMaster.deskAlertRules); 12 a day, 30 rules; owner changes, desk login reads. Not yet sent live: first real note unverified. Separate from the automatic board alerts (js/deskAlerts.js). |
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

## 5a. Bloomberg gap review (2026-11-15, plans/BLOOMBERG_GAP_REVIEW.md)
| Item | Status | Notes |
|---|---|---|
| What is unusual right now (percentile rank across held series) | DONE (preview, Insight tab > Unusual now) | Rank 1. 75 series from /api/drill-series ranked against their own history (1/5/20-day move, level where it is read by level), sky map, working per row, odds-by-chance line. Risk-flag history strip NOT built (the flags are served live only; the snapshot archive holds them point-in-time but there is no reader yet). |
| Chance-of-reaching-a-level calculator on our IV and calibrated range | TODO | Rank 2. Range and reach validate. |
| Release detail on the Calendar (actual, forecast, prior, revision, surprise history strip) | TODO | Rank 3. Paid consensus feed is an owner decision; US vintages only today. |
| Cross-asset matrix and sector rotation, 20 sessions (Info map: Original terminal) | DONE (preview, Insight tab > Cross-asset, Sector rotation) | 23-market moves grid (colour = direction, brightness = how unusual for that market), 14x14 correlation matrix of daily moves (20 vs 120 sessions, ringed where the change beats noise, chance count printed), 11 US sectors vs the S&P 500 on a relative strength / momentum map with a four-week trail. Same /api/drill-series bundle, no new vendor. |
| Gold board (ETF flows, real yields, dollar, COT, gold vol) | DONE (preview, Insight tab > Gold) | Rank 4. Gold, real yield, dollar, GVZ against realised vol, a fitted description of how much of gold's last 20 sessions the dollar and real yields usually explain (R squared printed, window out of sample), CFTC positioning with its age, ETF holdings with gold's own move taken out. CHECKED LIVE 2026-11-15 23:10 UTC: /api/gold-etf-flow history is EMPTY (0 days) although js/yahooFundAum.js works from a laptop (GLD $131bn): either the 6936abf9 deploy is not live yet or Railway egress to Yahoo fails; the in-memory result is also cached 6h even when empty (server.js, not touched here). COT gold report was 12 days old. |
| Currency rates matrix with strength rank and timeframe change | DONE (preview, Insight tab > Currency matrix) | Rank 5. Eight currencies x 1H/4H/1D/1W (sigma, rank, stronger/weaker lately word) plus an 8x8 who-has-out-run-whom grid per window, clicks open the pair. Live from /api/ccy-strength; windows with no bars yet say so (1H/4H are empty for the first hours after the Sunday open). |
| Monitors: user-chosen list of markets with live columns | DONE (preview, d3ce111d) | Rank 6. Monitor tab (tab.monitor): dense sortable table, add / remove / reorder, last, 24h change, range used, IV over sigma, the morning read (context only), next release, quote age; named monitors saved for the desk (KV desk_monitors_v1, owner writes), this browser keeps the open one; clicking a row selects it through linked selection. Commands MONITOR [name], ADD <market>. The dense theme setting is a separate row. |
| News saved searches and keyword alerts; context-only chip on the arrows | DONE (preview, 1d0003a4) | Rank 7. News tab bar (panel.news.saved): save the filter (words, tier, currency or asset keys, on-the-book) under a name for the desk (KV desk_news_searches_v1, owner writes), apply in one click, turn the words into a keyword alert. New alert kind news_keyword (a NEW headline matching all your words, only headlines after the first look, one note per episode, no direction wording, titles cleaned) runs on the existing two-minute alert tick. Commands NEWS [saved search], ALERT NEWS <words>. The arrows now carry an always-visible 'arrows: context only' chip: the Evidence Book has no validated headline-direction rule (news-asymmetry NULL). |
| Rate probabilities for ECB, BoE, BoJ as deep as the Fed | TODO | Rank 8. Needs a laptop task for the bank futures and the stale guard. |
| Earnings chips on the Calendar, then a sector heat map | TODO | Rank 9. Sector data source is an owner decision. |
| Export: CSV for tables, PNG for charts | TODO | Rank 10. |

## 5. Open decisions and housekeeping
| Item | Status |
|---|---|
| Python test job red: forge proof gate has no checks.json for the five vol-layer-rule-a-confirm entries | PARKED, needs owner decision |
| Info map guard goes red when parallel builds land between a regeneration and its push (CI or the test should regenerate) | TODO |
| Move the Atlanta Fed pull to Railway (with a stale guard); laptop task for central-bank futures and skew | PARKED, see memory project_laptop_dependencies |
