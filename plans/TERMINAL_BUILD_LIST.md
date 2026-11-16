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
| Pair favourites (star, Favourites filter, copy/paste, FAV / STAR / UNSTAR, starts a new Monitor) | DONE 161e8f61 | Viewer-visible display preference kept in this browser only (everyone shares one login). Not yet seen in a real browser. |
| Assets favourites (star in each card header, Favourites filter pill with count, copy/paste/clear on the tab, FAV opens it) | DONE a8e1ef97 | Same shared list as the Pair tab; the Assets filter is its own on/off. Viewer-visible display preference kept in this browser only. Tested over a stand-in page, not yet seen in a real browser, with a login, at phone width or in the other themes. |
| Dense monitor mode | TODO | A density setting on the existing themes. |
| Alerts (range used, Fed path move, data-age red, level touch, weekend gap closed) | DONE (preview, d89a6e0f) | Rules you set; one Telegram note per episode via Railway sendTelegram (master switch + tgMaster.deskAlertRules); 12 a day, 30 rules; owner changes, desk login reads. Not yet sent live: first real note unverified. Separate from the automatic board alerts (js/deskAlerts.js). |
| "What changed since I last looked" feed | TODO | Uses the snapshot store. |

## 2. Queued from "build all" (Info map Part C)
| Item | Status |
|---|---|
| Calendar drills: similar setups, release scorecard, earnings chips, nowcast gap | DONE (preview, 08dc7b47): panel.cal.drills. Two cards above the calendar (earnings ahead by day; the Recent releases scorecards: size of each market's 30-minute move against a normal half-hour, the owner's private call hidden from a desk login) and a drill button on every release row: what the release has done to each market before (Event Response Book, size not direction, next-day up% shown as the coin flip) and, on the matching US CPI / core CPI / GDP rows, the nowcast gap with its grade (CPI null, GDP context). Existing routes and data only, no consensus feed. NOT built: release small multiples (a chart per release); a scorecard only shows 30 to 60 minutes after a print, so rows older than that have none. |
| Where money sits; edges active | TODO |
| What is unusual right now (ranked by percentile), cross-asset matrix, sector rotation | TODO |
| World economies tiles (growth, prices, jobs, spending arrows) | DONE (preview, Insight tab > Economies, 0013e19c) | Eight tiles from js/worldEconomies.js; arrows compare a reading with its own anchor (zero, the bank target, prices), levels not trends, said on the board. Not on the Currencies map layer. |
| Market Sense list (only validated range flags, labelled range) | DONE as Insight tab > Risk flags (preview, 0013e19c) | The live flags are /api/risk-flags, not /api/market-sense/last: that route holds the study-run results and last ran 2026-09-19 (57 days before 2026-11-15), so it is not a live feed. Only the VIX-curve flag has a validated range finding (vix-inversion, mv-vixterm-range); credit widening is linked to the nearest test (context only, marked nearest), the other lights say no test of their own. |
| Daily Read tags, weekmap strip, OI drills, BIS heat strip, risk-flag history | TODO | Risk-flag history strip not built: flags are served live only; the snapshot archive holds them point-in-time but nothing reads it yet. |

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
| What is unusual right now (percentile rank across held series) | DONE (preview, Insight tab > Unusual now, 11364634) | Rank 1. 75 series from /api/drill-series ranked against their own history (1/5/20-day move, level where it is read by level), sky map, working per row, odds-by-chance line. Risk-flag history strip NOT built (the flags are served live only; the snapshot archive holds them point-in-time but there is no reader yet). |
| Chance-of-reaching-a-level calculator on our IV and calibrated range | DONE (preview, Insight tab > Level reach, b9e3737f) | Rank 2. Two answers per level: by the end of the London day from the latest checkpoint (the R3 remaining-travel model: mean miss 1.6 points, worst cell 5.1, 21:00 flagged, narrowly missed its own frozen rule so it is shown as a working model with a wider band) and over the whole session from the forecast ladder rungs (off by up to ~3 points by regime). Curve through the p50/p75/p90 rungs, flagged as extrapolated beyond p90; already-touched detection from the session bars; ladder of 0.25-3 sigma levels. 'By tomorrow' is NOT offered: the models cover the current session only, and the OI-wall touch curves (oiReachCalibData) need the server-side path simulation, so they are not used for arbitrary levels. |
| Release detail on the Calendar (actual, forecast, prior, revision, surprise history strip) | TODO | Rank 3. Paid consensus feed is an owner decision; US vintages only today. |
| Cross-asset matrix and sector rotation, 20 sessions (Info map: Original terminal) | DONE (preview, Insight tab > Cross-asset, Sector rotation, 90baa045) | 23-market moves grid (colour = direction, brightness = how unusual for that market), 14x14 correlation matrix of daily moves (20 vs 120 sessions, ringed where the change beats noise, chance count printed), 11 US sectors vs the S&P 500 on a relative strength / momentum map with a four-week trail. Same /api/drill-series bundle, no new vendor. |
| Gold board (ETF flows, real yields, dollar, COT, gold vol) | DONE (preview, Insight tab > Gold, 848f945b) | Rank 4. Gold, real yield, dollar, GVZ against realised vol, a fitted description of how much of gold's last 20 sessions the dollar and real yields usually explain (R squared printed, window out of sample), CFTC positioning with its age, ETF holdings with gold's own move taken out. CHECKED LIVE 2026-11-15 23:10 UTC: /api/gold-etf-flow history is EMPTY (0 days) although js/yahooFundAum.js works from a laptop (GLD $131bn): either the 6936abf9 deploy is not live yet or Railway egress to Yahoo fails; the in-memory result is also cached 6h even when empty (server.js, not touched here). COT gold report was 12 days old. |
| Currency rates matrix with strength rank and timeframe change | DONE (preview, Insight tab > Currency matrix, 10ffd831) | Rank 5. Eight currencies x 1H/4H/1D/1W (sigma, rank, stronger/weaker lately word) plus an 8x8 who-has-out-run-whom grid per window, clicks open the pair. Live from /api/ccy-strength; windows with no bars yet say so (1H/4H are empty for the first hours after the Sunday open). |
| Monitors: user-chosen list of markets with live columns | DONE (preview, d3ce111d) | Rank 6. Monitor tab (tab.monitor): dense sortable table, add / remove / reorder, last, 24h change, range used, IV over sigma, the morning read (context only), next release, quote age; named monitors saved for the desk (KV desk_monitors_v1, owner writes), this browser keeps the open one; clicking a row selects it through linked selection. Commands MONITOR [name], ADD <market>. The dense theme setting is a separate row. |
| News saved searches and keyword alerts; context-only chip on the arrows | DONE (preview, 0d88660d) | Rank 7. News tab bar (panel.news.saved): save the filter (words, tier, currency or asset keys, on-the-book) under a name for the desk (KV desk_news_searches_v1, owner writes), apply in one click, turn the words into a keyword alert. New alert kind news_keyword (a NEW headline matching all your words, only headlines after the first look, one note per episode, no direction wording, titles cleaned) runs on the existing two-minute alert tick. Commands NEWS [saved search], ALERT NEWS <words>. The arrows now carry an always-visible 'arrows: context only' chip: the Evidence Book has no validated headline-direction rule (news-asymmetry NULL). |
| Rate probabilities for ECB, BoE, BoJ as deep as the Fed | TODO | Rank 8. Needs a laptop task for the bank futures and the stale guard. |
| Earnings chips on the Calendar, then a sector heat map | Earnings chips DONE (08dc7b47); sector heat map TODO | Rank 9. Sector data source is an owner decision (the Insight tab's sector rotation map is built from ETFs: see its row). |
| Export: CSV for tables, PNG for charts | DONE (preview, 39357efc) | Rank 10. widget.export: a CSV button on every card that holds a table and a PNG button on every chart of the Monitor, Insight, Calendar and Currencies tabs, and the commands EXPORT / EXPORT PNG. Made in this browser from what the page shows (the viewer copy for a desk login), no server round trip; formula-looking cells are guarded, sort arrows and control columns left out, file names carry the board and the UTC minute. The PNG drawing path (canvas, SVG with theme colours filled in) needs a real browser and is untested here. |

## 5. Open decisions and housekeeping
| Item | Status |
|---|---|
| Python test job red: forge proof gate has no checks.json for the five vol-layer-rule-a-confirm entries | PARKED, needs owner decision |
| Info map guard goes red when parallel builds land between a regeneration and its push (CI or the test should regenerate) | TODO |
| Move the Atlanta Fed pull to Railway (with a stale guard); laptop task for central-bank futures and skew | PARKED, see memory project_laptop_dependencies |
| Gold ETF flow: an empty or failed try is no longer cached 6h; the failure reason is in the response and the health row. First live check after deploy: /api/gold-etf-flow fetch.reason shows whether Railway can reach Yahoo | DONE 1b9ffcbc |

## 6. Replay: visuals / event / whole terminal (2026-11-16, agreed order)
One shared player (js/replayVizCore.js pure + js/terminal/replayPlayer.js), preview switch `widget.replayviz`, command `PLAY <visual>` / `REPLAY <visual>`, route `/api/replay/<visual>`. Each frame is from a series we already hold; the player says how many frames exist and from when; description of history only, never a forecast.
| Item | Status | Notes |
|---|---|---|
| 1. Replay on one visualisation: shared player + yield curve (90 days, ghosts, 2s10s strip) | DONE (preview) | Daily Treasury series from the curve board's in-memory store; dated by the print (H.15 publishes next business day). |
| 1b. Currency strength board (bars race) | DONE (preview) | One London session at a time (last five weekdays), 15-minute steps from /api/replay/strength, 1H/4H/1D window; each step rebuilt from only the bars finished by then. |
| 1c. Fed path strip | DONE (preview) | Atlanta Fed window odds (4 windows, last 180 trading days) from /api/fed-path; the per-meeting futures strip has only a few lookback copies so it is not replayed (said on screen). |
| 1d. Correlation matrix (20 vs 120 sessions over time) | DONE (preview) | Last 90 sessions from the daily market bundle (/api/drill-series, the Insight boards' own fetch); each frame is the board's own corrMatrix on the bundle cut at that day, so no later data; ringed-pair count against chance. |
| 1e. Regime quadrant trail | DONE (preview) | 3, 5 or 10 years of months from /api/regime history (240 months held); each month is the regime as computed today from revised series, said on screen; trail of the last 12 months and a regime-coloured month strip. |
| 1f. Vol clock / range used across the London day | DONE (preview) | Rebuilt from /api/replay/day (one-minute bars + archived forecast) at 15-minute steps for six markets and the last five sessions: price path to that step, forecast median and p75 lines from when the forecast was computed, up and down gauges against the median. Not from the 5-minute snapshots (they hold no range-used section). |
| 1g. Ghost walk (the OI path walk, owner idea 2026-11-16) | DONE (preview, widget.ghostwalk) | One London day of one market in units of that day's archived forecast MEDIAN high-low range from its open (+1 = a whole median day above the open), over the faint paths of EARLIER days in the same units (band = middle 80%, dashed = median; filter: all, same OI regime, same side of the gamma flip; no ghosts below 12 earlier days), with the OI walls, max pain and gamma flip as lines from the time their capture was SAVED and a ring where a bar touched one. Beside the touch count is the same levels mirrored through the open (the by-chance rate), with 95% Wilson intervals. Route /api/replay/ghosts (js/ghostWalkRoutes.js, read-only, 15-minute bars + oi_history + vol_forecast_<date>); pure core js/ghostWalkCore.js; draw js/terminal/ghostWalkDraw.js; player def js/terminal/ghostWalk.js. A 'Ghost walk' button on the OI terrain card (Options tab) and GHOST <market> [date]. It goes back only as far as the OI capture (measured 2026-11-16: 89 capture dates held from 2026-08-20 for each of the 11 OI markets; NQ has 51 usable days of its 61 weekdays since then, 10 dropped for a forecast made later than the first hour and 1 for thin bars, so 50 earlier days for the latest session; the window says the start date and the count); a day whose forecast was computed later than the first hour of the London day is dropped and counted (about a third of the weekdays in a first look at NQ: the forecast is sometimes recomputed late), weekend stubs are skipped. Descriptive only: Evidence Book wall-placebo NULL, oi-max-pain NULL, gex-range-es VALIDATED (range, not direction). Not built: an event-day filter for the ghosts (no stored per-day event calendar to filter on). |
| 2. Event replay: pick a release or meeting, replay the terminal from one hour before to two hours after, last five of the same type as ghosts | TODO | Reuse js/terminal/replayPlayer.js with a different `def`. Timing and size only, never direction. |
| 3. Whole-terminal as-of clock: a time in the top bar, every board redraws as it was | DONE (preview, widget.asof) | Time machine button + banner + scrubber/step/play (x2 x10 x60 x300) + ASOF command + ?asof= in the address. A fetch gate (asofBoot.js) holds market-data reads, then each is answered from the daily FULL record at or before the time (strength scores laid over at 5-minute detail), candles cut at the time, the morning book by date, or REFUSED ('no record at that time'): never a live number in a past view. Headless Chromium against live data: 0 market-data requests reached the server in the past view (46 live). Snapshots start 2026-11-14 17:49 UTC. See plans/TIME_MACHINE.md. Unverified: real login, other themes, play on a live market, lazily built tabs while playing. |

## 7. Flow review (2026-11-16, plans/TERMINAL_FLOW_REVIEW.md)
Decisions needed from the owner are listed at the end of that document (new tab name, asset card click, preview first, how far to take the tab strip, keep Pair favourites).
| Item | Status | Notes |
|---|---|---|
| F1. Star and Favourites pill on the Assets cards, sharing the Pair favourites store | TODO | S. Owner asked 2026-11-16. Pair chip row defaults to starred markets when any exist. |
| F2. Asset card opens the Pair page (the pop-up stays only as a fallback if the Pair module has not loaded) | DONE e42e00c1 | The group desk line that only the pop-up had now sits on the Pair page. Source-level test; the click is an owner click-through. |
| F3. Browser Back works for Pair and the Deep dive (pushState, not replaceState) | DONE 2c10a383 (Deep dive in 8dc165ef) | js/terminal/pairHistory.js: a market you pick adds an entry; a market the page only follows (linked selection) replaces it; Back returns to the previous market or the tab it was opened from. Real Back button: owner click-through. |
| F4. Rename Charts to History; move Positioning history to the Positioning tab | DONE 0e9747c8 | Ids and surface ids unchanged; CHARTS still works as a command. Positioning history is panel.pos.history (shown to the desk login as before). Seasonality stays on History (it is the 12-market grid; the per-market hours card is in the Deep dive). |
| F5. Slim the Pair page and add the Deep dive tab holding the 13 reference cards in four sections, each card with its own panel.deep.* surface row; #deep=GOLD hash; command DEEP | DONE (preview) 8dc165ef | Owner-only preview (tab.deep). With it off a desk login keeps all 13 cards on the Pair page; with it on, Pair carries links and the cards live in the Deep dive. NOT done: collapsing the detail of 'What drives this' to its short form on Pair (it still shows in full). |
| F6. Reorder and group the tab strip (Today, Markets, Macro, Analysis, Charts, Tools); Changed next to Overview, Monitor next to Assets, Replay next to Chart | DONE af5efa7e | Ids and surface ids unchanged; a group with every tab switched off disappears; the phone gets one scrolling row. The strip is not governed by the saved nav layout (that is the site menu). Look: owner click-through. |
| F7. Overview: a 'today at a glance' first screen, fold the rest | TODO | M. |
| F8. Currency strength: one home, four compact views linking to it | TODO | M. |
| F9. Analytics split into 'Market behaviour' and 'The desk's record' pills | TODO | S to M. |
| F10. Spread the Insight boards when promoted (Unusual now to Overview, Gold to Assets, Level reach to Chart) | TODO | M. |

## 8. Terrain live price line (2026-11-16, owner request)
| Item | Status | Notes |
|---|---|---|
| Live price line on the OI terrain chart (Options tab and OI Lab) | DONE 89c8d290 | js/terrainLive.js over js/terrainChart.js. Violet line for the price now with its age; 'at close' with the time while the week is shut; 'last ... old' if the last bar is over 15 minutes old in an open week; distance to the nearest labelled level above and below in points or pips and in the snapshot's expected-move units (description only; walls as targets are null or context). The white snapshot line is relabelled SNAPSHOT SPOT. Only an overlay canvas repaints (30 s read, 15 s age repaint). Own registry switch widget.terrainlive. PNG export composites the overlay. Price scale checked live on 2026-11-16: the stored spot and levels are already in OANDA terms (spot within 0.03% of the OANDA 5m bar at the entry's basisAt on 12 of 13 markets, silver 0.17%), so no offset. No live line for corn, wheat, soybeans, palladium, platinum (no desk bars). Not seen in a real browser. |

## 9. Linked help and the missing Replay/Export buttons (2026-11-16, owner reports)
| Item | Status | Notes |
|---|---|---|
| Linked selection: a ? popover beside the chip, a clear label ('Linked: GOLD', 'Link off'), hover titles on the glow rings, fuller LINK help | DONE (preview) | js/terminal/linkedSelection.js. The popover was checked in a headless browser at phone width. |
| Replay and Export buttons 'not there': diagnosed in a headless browser as the owner. The buttons DO mount (Overview strength board, Macro > Rates & curve curve and Fed odds, Assets vol clock; Export on Monitor, Insight, Calendar, Currencies). No code fault found. Causes found: Export sat at the BOTTOM of cards with no heading row (now on top), both appear only after their board has drawn, and nothing told you where to look | DONE | js/terminal/featureStatus.js, previewSwitches.js, exportView.js. |
| Preview features panel (Info map tab): per feature 'On this page: loaded / failed: reason / waiting' fed by globalThis.__deskFeel, and a 'Where do I see it?' list; the command line says why PLAY or EXPORT did nothing | DONE | js/terminal/terminalFeel.js records start() per feature and fires 'deskfeel'. |

## 8. Owner-reported fixes (2026-11-16)
| Item | Status | Notes |
|---|---|---|
| Alerts are the owner's alone; a desk login's saved searches stay in its own browser | DONE 99594ce6 | Server already refused a desk login's alert writes (403); now tested for add, mute, rename, and the manual /api/desk-alerts/run needs the owner. A desk login saves and deletes its own news searches in localStorage (never sent, never shared) and is no longer sent the owner's list. |
| Strength 1D window on Monday morning | DONE 434202af | A window that starts inside the weekend closure runs from the Friday close and says so, only where a pair has no price at the start. Overview's price read now names the missing window and why, and reads from the other one. Live check after deploy: /api/ccy-strength 1D should be available at Monday 09:12Z. |
| Gold ETF source when Yahoo refuses Railway | DONE 5c6b67d9 | Issuers first (SPDR archive for GLD, iShares page for IAU), Yahoo second; tonnes held is the series (a flow is the change in tonnes); response and data-health row name the source. First live check: /api/gold-etf-flow, fetch.source and tonnes.last. If an issuer also refuses Railway, fetch.reason says which. |

## 9. Terminal newsletter v2 (2026-11-16)
| Item | Status | Notes |
|---|---|---|
| Written terminal edition (yesterday, today, what could happen) from the desk run and the terminal boards | DONE afc0a8ab | about 4,600 words, no model call, plans/NEWSLETTER_TERMINAL_V2.md |
| PDF output and Atlas buttons (Issue as PDF, dark or light) | DONE 7c68d5c6 | print to PDF; A4 portrait |
| Terminal pictogram (vector poster of the key points) | DONE c14872a2 | PNG download and Telegram photo |
| Send a PDF or the pictogram to Telegram | DONE 7c68d5c6 | owner only, one try, no retry; a PDF is saved by the owner first |
| Pictogram setups panel (the desk's setups, labelled not recommendations) | PARKED | switch exists (options.setups), default off; owner decision on trade content in a shared document |
| Delete the classic terminal edition | TODO | after a few weeks of the v2 being used |
| Archive access for the daily and brief kinds (open without a login; classic terminal edition prints trade plans) | DECISION | reported, not changed |

## 9. Layout fixes (2026-11-16, owner screenshots)
| Item | Status | Notes |
|---|---|---|
| Insight pills not showing | DONE 8ab440fe | The pill row's container used .in-bar, which is also the 8px percentile bar (height 8px, overflow hidden): pills clipped to a strip. Level reach's input row had the same collision. Both now .in-tools. |
| Gold board running past its cards | DONE 8ab440fe | The Gold ETF card's two tables were nowrap and not in a scroll box (527px of content in a 293px card; 544px page at phone width). Now in .in-scrollx and wrapping; panel and children can shrink. |
| World stress strip 5px too wide at 390px (every tab) | DONE | Its nowrap chip ('Global rate cycle...') pushed the page to 395px. Chips there may wrap. |
| Overflow checks | DONE | js/terminal/insightLayout.test.mjs (static, CI) and scripts/insight-overflow.mjs (headless Chromium as owner against live data; not CI). After the fixes: 0 offenders on all 8 Insight boards at 1440/1100/390 in Deep navy, Daylight and High contrast; Monitor, Chart, Workspace, Deep dive, Replay and Calendar also 0 offenders at 1440/1100/390 in navy and Daylight. |

