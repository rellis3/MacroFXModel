# Verification sweep, 2026-11-17

Hand-kept. What was checked, what was found, what was fixed, what only a real login or phone can settle.
Harness: `scripts/sweep-matrix.mjs` (headless Chromium against the LIVE read-only API, the page served from a local copy of main, the role stubbed client-side). Not part of CI (needs a browser and the network).
Not a real login, not a real phone, not the live static files (those sit behind the login).

## 1. Deploy state

- Live `/api/version` sha = `origin/main` HEAD (checked at the start: `8ee24c55`, and again at the end: `cabf1129`). Nothing is waiting to deploy.
- New routes, probed on the live site:

| Route | Result |
|---|---|
| `/api/cb-path/boe` | 200, 8 meetings, Bank Rate 4.00% (5 Nov hike), ticks d1/w1/m1 set |
| `/api/cb-expectations` | 200, 7 banks (USD, EUR, GBP, CHF, CAD, AUD, JPY); a priced path on EUR, GBP, JPY only (the others have no meeting calendar yet) |
| `/api/replay/smile?sym=SPX`, `/api/replay/path-days?inst=GOLD`, `/api/replay/oi-days?inst=NQ`, `/api/replay/ghosts?inst=NQ`, `/api/release-history?country=US&event=CPI`, `/api/spread-extras` | 200 with their parameters (400 with a plain message without them) |
| `/api/ci-status` | 403 without the owner session (as intended) |
| `/api/gold-etf-flow` | 200, dollar series 1 point, tonnes block present, fetch.ok true |
| `/api/ccy-strength` | 200; 1H, 4H, 1W available; **1D unavailable at Mon 22:48 UTC** (see defect 1) |
| `/api/desk-snapshots/status`, `/api/boe/latest` (5 Nov hike), `/api/cot-source` (current), `/api/vol-clock`, `/api/live-layer` | 200 |
| `/api/leading-indicators` | **502** ("sdmx.oecd.org HTTP 500": the OECD source is down, not our code) |
| `/api/bias-engine?market=BTCUSD` and `CORN` | 404 (no engine for those markets; the Pair tab asks anyway) |

## 2. What was swept

838 page states: 3 roles (owner, desk login, desk login with every preview switched on) x 6 themes (Deep navy, Daylight, Amber, Green console, Colour-blind, High contrast) x widths 1440, 768 and 390, over all 22 tab buttons and every sub-pill (Overview sections, Macro sections, Insight pills, Analytics pills). The key tabs (Overview, Assets, Monitor, Pair, Options, Macro, Insight) got the full theme grid; the rest got navy, Daylight and High contrast at 1440 and 390.
Measured per state: console errors and warnings, failed requests, whole-page overflow and the root offender, cards that overflow, loading cards that never finish (re-measured after 6 s), text under 4.5:1 (3:1 for large text), header height, the docked time bar against Ask the desk, tab order.

## 3. Role correctness (the desk login)

- **Nothing owner-only is rendered.** Across all desk-login states, 0 elements of a surface hidden for the desk login are visible.
- **The command line offers only visible surfaces.** Owner 166 commands, desk 145. The 21 owner-only: ALERTS, ASOF, BISSTRIP, CHART, DEEP, DENSE, EVENTREPLAY, EXPORT, FLAGHISTORY, GLANCE, INFO, LINK, NEWSLETTER, OIDRILL, OITIME, OVERVIEW sections, RATIOS, READ, ROC, SINCE, SMILE, TF. None appears in the desk list.
- **Hash links to hidden tabs** (`#read`, `#deep`, `#infomap`, `#kchart`) fall back safely: no hidden tab shown, no errors.
- **Preview JS is not loaded** for a desk login where the switch is off (feature status: asof, chart, alerts, linked, oiTime, eventReplay, sinceLast, riskStrip, oiDrill, newsSearches: not requested).
- **FINDING A, hidden is not absent.** The Overview renders Trade watch and Playbooks for everyone and hides them with the Access CSS. For a desk login `panel.ov.playbooks` is `display:none` but its DOM holds 1,437 characters of text including each card's Entry, Target, Invalid and "size 1.00" (the six largest cards). Trade watch holds only its heading (56 characters). The Record and Alerts blocks are empty for the desk login. The API routes answer without a login (e.g. `/api/global-read` returns 200 with no cookie), so the data is also reachable by URL. This is how Access has always worked (CSS hides, the page is behind the login), but it is not "absent from the DOM". Decision for the owner: leave (friends only, behind one login) or stop rendering those two blocks for a desk login.
- **FINDING B, six trade-reason surfaces are switched ON for the desk login** in the live access list (registry default is off, so the owner switched them): `panel.ov.bestpairs` (best pairs: side, gap, carry), `panel.ccy.expressions` (the book's cards on a currency, with size), `panel.asset.plan` (plan lines, entry zone, invalidation), `panel.asset.size` (position size and conviction grade), `panel.asset.beflip` (the engine's flip line), `panel.corr.hedges` (ranked hedges). Probably deliberate ("I've been through the access"), listed so it is on record.
- **FINDING C, the five bias-engine surfaces are visible to the desk login** (`panel.ov.engine`, `panel.ccy.engine`, `panel.asset.engine`, `panel.pair.engine`, `panel.replay.engine`; `panel.macro.engine`, the Macro "Bias engine" pill, is hidden for the desk login). What a desk login sees:
  - Overview: "Currency ranking · bias engine", chips "live read" and "engine vs desk agree on 21 of 38 markets · 2 of 8 currencies", then the eight currencies with scores (USD +1.06 "Bullish 5/10", GBP +0.82, JPY +0.69 ... NZD −0.25) beside the desk's rank.
  - Currency cards: "▲ +2.6 · engine Bullish 5/10 (−5..+5)", no chip.
  - Market cards (76 of them): chips "Macro tilt: Neutral" and "tilt differs".
  - Pair: "Bias engine · AUDJPY", "Macro tilt: Neutral", "live read", score −0.26 of ±2 with coverage 94% and the reasons.
  - Replay: "The bias engine that morning", "Macro tilt: Bearish 3/10 2026-11-16" with the factor lines.
  - **None carries a label that the bias engine's own back-test showed no skill** (the owner's note project_one_desk_bias says the Macro tilt back-test has no skill and is hidden from the desk login). The chips say "live read" and "tilt differs" only. Decision for the owner: hide the five surfaces for the desk login, or add an evidence chip ("back-test: no skill") to each.

## 4. Defects

| # | Severity | Where | What | Status |
|---|---|---|---|---|
| 1 | Medium | `/api/ccy-strength` 1D | **Every Monday 22:00 to 24:00 UTC the 1D window had no price at its start** (it starts 48 minutes after the weekly reopen, before the first hourly bar finished), so 1D read "only 0 of 28 pairs" and the Overview price read lost a window. Seen live at Mon 22:48 UTC. | **Fixed** (`ccyStrengthCore.js`, 2 tests; one fails without the fix) |
| 2 | Medium | Macro > Credit & liquidity and Markets & FX at 390px | The whole page scrolled sideways (436 to 441 px on 390): a nowrap Evidence Book chip ("TESTED: NULL · unconfirmed · macro-confluence...", 420 px) and a bare table (393 px in a 342 px card). All six themes, every role. | **Fixed** (`terminal-tabs.css`, guard test) |
| 3 | Low | Options cards at 1440 | The calls-against-puts gauge was a fixed-width SVG wider than its card (3 cards, 11 spills). | **Fixed** (`max-width:100%`, guard test) |
| 4 | Low | Options path-walk at 390 and 768 | Fixed-width SVG in a plot box that shrinks (17 states). | **Fixed** (guard test) |
| 5 | Low | Pair "What drives this" at 768 and 1440 | The direction column was a fixed 92 px; "●●○ HEADWIND" needs about 100 px, so it spilled (4 states). | **Fixed** (`humanDrivers.css`, guard test) |
| 6 | Medium | Analytics at 390px | `TypeError: Cannot set properties of null (setting 'onclick')` twice in 12 runs (desk navy, owner Daylight): the book-risk scenario render looked its Run and Reset buttons up on the document, so a second render that replaced the element left it null. | **Fixed** (looks up inside its own element and stops if replaced; guard test) |
| 7 | Decision | Deep navy, muted text | **21% of sampled text is under 4.5:1** (4,513 of 21,482), almost all the `--tx3` token `#6d7599` (3.5 to 4.2 : 1 on cards): tab labels, table headers, the At a glance labels, chips. The other five themes are 0 to 1%. Not changed: it is the original palette the owner likes. The Colour-blind theme already uses `#8088ae` for `--tx3`, which clears 4.5:1; swapping navy's token to it would fix it. | **Owner decision** |
| 8 | Low | Daylight, Amber, Colour-blind | A few buttons and pills under 4.5:1: Daylight `button.btn` 2.0:1 and `.chip` 3.5:1 (text `#394266`), `.fav-pill` 2.9 to 4.1:1 (Daylight, Amber, Green console, Colour-blind), Amber `.btn` 2.6:1, Green console `.btn` 2.9:1, High contrast `.btn` 3.6:1, Colour-blind orange `#e8590c` 4.45:1. About 1% of sampled text. | Listed, not changed |
| 9 | Low | `/api/leading-indicators` 502 | The OECD SDMX source returns HTTP 500; the route reports it honestly. One console error per page that loads the OECD leading-indicators card. | Source outage |
| 10 | Low | `/api/bias-engine?market=BTCUSD` and `CORN` 404 | The Pair tab asks for an engine read on markets that have none, so a 404 and a console error. | Listed (server would answer ok:false) |
| 11 | Info | Harness only | 401 on `/api/desk-monitors`, `/api/desk-workspaces`, `/api/desk-news-searches`, 403 on `/api/desk-asset-analyse` and `/api/ci-status`: owner routes called with no session cookie. Expected here; a real login gets 200. | Not a defect |
| 12 | Info | Harness only | "Reading" and "loading…" counted as loading cards: "Reading" is a column heading on three tables (Assets, Options, Macro > Markets & FX), and Monitor "loading…" is the 401 above. No card was stuck on a spinner. | False positive |

Also: header at rest (phone width) is 106 px for every role at 390 (target 120). At 768 the owner header is 196 px (wraps), the desk 123 px; at 1440, owner 160 to 165, desk 83 to 85. Ask the desk never overlapped the docked time bar in any state. Tab order at 390 reaches the time-bar chip, the More button, then the tabs; at 1440 it usually reaches the command box (it mounts a moment after load), theme, sign-out and the tabs.

## 5. Fixed in this sweep

`js/ccyStrengthCore.js`, `js/ccyStrengthCore.test.mjs`, `js/terminal/terminal-tabs.css`, `js/terminal/optionsView.js`, `js/terminal/humanDrivers.css`, `desk-terminal.html` (book-risk buttons), `js/terminal/pageWidthLayout.test.mjs` (6 new guards), `scripts/sweep-matrix.mjs` (the harness). Re-run after the fixes (owner, navy, 390/768/1440, Macro, Options, Pair, Analytics: 30 states): 0 page overflow, 0 card spill, 0 page errors.

## 6. Only the owner can check

A real owner login and a real desk login (the live static files sit behind the login); touch on a real phone (the header menu, scrubbing the time bar, tapping the command magnifier); the first live run of the evening edition and of the new routes under real load; a live Telegram send (alerts, newsletter); how Amber, Green console and Colour-blind look to your eye (measured, not seen beyond screenshots); the print dialog for the PDF editions.
