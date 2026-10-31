# MacroFXModel — presentation-layer map and why unification hasn't stuck

Repo state: `main` @ 2026-10-31, 6,840 commits since 2026-05-03 (about 1,000–1,500 a month). Authors: "Claude" 2,750, rellis/rellis3 about 4,000, plus 1,636 merges of Claude Code session branches. Most of the code was written by AI sessions.

Companion data files (all in this folder):

| file | contents |
|---|---|
| `pages.csv` | one row per top-level `*.html` (244). Columns: title, purpose, category, unification flag, lines, endpoints, static files, js modules, hard-coded flag, first/last commit, commit count, Oct-2026 commits, inbound links, nav menus, reachability |
| `api.csv` | one row per backend route (859). Columns: where it is defined, the upstream feeds a heuristic found, consuming pages, other consumers |
| `scan.py`, `api.py`, `feeds.py`, `build_csv.py` | the scripts that produced them (static analysis; nothing in the repo was modified) |

Method caveats:
- Endpoints were found by static string matching on pages and on the js modules they import (followed recursively). Template-literal URLs are matched by prefix.
- "Hard-coded" means numeric `<td>` cells, long numeric arrays, or embedded `const DATA = {...}` blobs in the HTML.
- Commit counts come from `git log --name-only` with renames not followed. Merge commits are not counted.
- "Inbound" counts other top-level pages that link to the page. Links from nav modules are reported separately as nav membership.

---

## 1. Inventory: 244 top-level pages (the "~300" includes theory-lab/, cog/, education/)

| cat | meaning | count |
|---|---|---|
| a | macro / market-state data view (CPI, GDP, ISM, CB sentiment ×8, yield curve, regime, release reaction...) | 26 |
| b | analysis-layer view (vol forecast v2/v3, OI ×6, COT, liquidity, credit, bank credit, rates, VIX, correlations, surfaces, shadows) | 40 |
| c | backtest / result / research page | 85 |
| d | live trading tool / bot UI (bot-config, bot-audit, trade cards, hedge signals, journal, sizer...) | 21 |
| e | education (top level only; the real education lives in theory-lab/ and cog/) | 3 |
| f | unification / central dashboard attempt | 17 |
| g | dead / duplicate / superseded (owner's own "Archived" menu, redirect stubs, RETIRED, legacy, v1 of v2) | 52 |

Headline numbers:
- **136 / 244 pages (56 %) have not been touched since 1 Sep**, and 103 not since 1 Aug. 67 pages have exactly one commit: built once, never revisited.
- October activity is concentrated in a few pages. 85 pages were touched in October, but `today.html` (63), `atlas.html` (51) and `oi-dashboard-v2.html` (45) account for 38 % of all October page commits. Next come oi-dashboard (17), bot-config (15) and vol-forecast-v3 (13).
- **88 pages have zero inbound links from other pages.** Their only entry is the Command Hub dropdown. 8 pages are in no nav and no registry at all: `claim-watch`, `drift`, `exhaustion-surface`, `forecaster-system`, `ips-shadow`, `level-atlas-vote-portfolio-v2`, `live-range-shadow`, `portfolio-book`. 58 are reachable only through the "🗄 Archived" menu.
- Hard-coded results inside the HTML are rare: 5 pages embed data blobs and 8 more have notable numeric tables. The blob pages are `results.html` (12.6k lines of CURVE arrays), `exhaustion-surface.html` (63 KB `const D=/*DATA*/`), `price-slowdown-lab.html`, `diversification.html` and `forecast-line-backtest.html`. The real hard-coding sits elsewhere:
  - **48 pages read frozen JSON/CSV snapshots** from `analysis/output/**` or `backtest-data/**`.
  - **The Evidence Book is source code**: `js/deskEvidence.js` holds 2,236 lines and 293 hand-written verdict entries.
  - Result numbers are written into prose. For example, `regime-backtest.html` has 47 "Sharpe/PF/n=" literals, `today.html` 35, and the vote-portfolio pages about 20 each.
- `today.html` alone is 14,584 lines and uses 109 endpoints. Total top-level HTML is 182k lines.

## 2. Navigation: 10 competing nav surfaces, all hand-maintained except one

| # | nav | where it lives | where it is mounted | coverage |
|---|---|---|---|---|
| 1 | **Command Hub** dropdown bar (Favs / Live / Vol / FX BT / Research / Equity / Gold / Systems / Learn / WIP / Archived, drag-reorder synced via `/api/nav-layout`) | `js/commandHub.js` (671 lines, 61 commits) | **only 5 pages**: index, indexv2, today, market-review, flow-chain | 220 pages. "Live" alone holds 102 items; "Archived" holds 61 |
| 2 | 🗺 Site Map / 🔌 API Map modals | `js/siteApiMap.js` (1,071 lines) mirrored by hand in `MD files/SITE_MAP.md` | index, today | 212 pages. SITE_MAP.md lists 193, and the two differ by 21 |
| 3 | 🗄 Data Map (the **only** auto-generated registry: feeds from `js/dataFeeds.js`, freshness from `/api/data-health`) | `js/dataMap.js` | the Command Hub pill, index, today | data feeds, not pages |
| 4 | `hub.html` "Risk Hub" card index | `hub.html` (916 lines, static) | 7 pages still link to it | 56 pages. `MD files/CLAUDE.md:374` says **"hub.html IS NOT A USEFUL PAGE. DO NOT TOUCH IT"** |
| 5 | Macro `hbtn` strip, copy-pasted inline | 19 pages (cpi, gdp, ism, 8 × CB sentiment, ...) | — | about 22 macro pages |
| 6 | The Feed tab bar | `js/feedChrome.js` | 15 pages | the 9 "complexes" |
| 7 | Atlas rail / tab bar (Global / Currency / Pair lenses) | inline in `atlas.html:412` (drawNav) | atlas | its own views |
| 8 | today.html views + jump rail | `js/viewNav.js` (Now / Pairs / Macro / Events / Deep) + `js/jumpNav.js` | today | today's 25+ panels |
| 9 | "← Dashboard" / "← Today" back-links | inline | 72 pages link to index, 47 to today | — |
| 10 | Theory Lab / cog nav | theory-lab/assets | education zone | separate auth zone |

Three registries (commandHub, siteApiMap, SITE_MAP.md) plus hub.html all list pages by hand, and they disagree. 16 pages are in the Hub but not the Site Map; 8 are in the Site Map but not the Hub. The comments in `js/commandHub.js:6-11` and `js/siteApiMap.js:3-8` both say they were extracted precisely because copies had drifted. The drift then reappeared between the registries themselves.

Dead links: one. `atlas.html:282` links to `data-map.html`, which does not exist; the Data Map is a modal, `js/dataMap.js`. Every Command Hub and Site Map link resolves.

## 3. The unification dashboards

The table runs in chronological order of creation. "Oct" is the number of commits in October 2026.

| page | born | last | commits (Oct) | lines | endpoints | what it calls "market state" | decision logic? | freshness |
|---|---|---|---|---|---|---|---|---|
| `index.html` "Command Centre" | 05-03 | 10-03 | 221 (1) | 2,212 + about 40 modules | 45 | 7-tier macro score per pair (`js/macro.js` `calculateTierScores`, PCA-ish discounting), HMM regimes, OI/GEX, COT, compass | weighted tier score (uncalibrated) → bias per pair | almost none (1 match) |
| `analysis.html` | 05-16 | 10-02 | 16 (1) | 1,264 | 1 | 5-year pattern discovery (client worker) | n/a, a research tool | — |
| `indexv2.html` "The Board" | 06-06 | 10-24 | 28 (1) | 1,748 (+61 KB base64 fonts) | 25 | per-pair composite (`js/pairCompositeEngine.js`), macro scorecard, HMM | arithmetic combiner, "not backtested" (header) | light |
| `hub.html` "Risk Hub" | 06-15 | 09-15 | 27 (0) | 916 | 0 | none (link index) | none | none |
| `today.html` "Daily Trading Brief" | 07-03 | 10-29 | **341 (63)** | **14,584** | **109** | many layers: Global Read Day Read (server), desk watch, outlook 5d/20d (`js/outlookEngine.js`), pair composite, macro chain, HMM state strips, regime line, risk panel | **yes**: consumes `/api/global-read` (the one real state model, see §5). It also still renders the client-side Outlook built on inputs that model zero-weights | heavy (197 freshness mentions) |
| `desk.html` "The Desk" | 07-24 | 07-24 | **2 (0)** | 169 + `js/deskApp.js` 758 | 28 | weather (risk flags, events), board, zones, book, exceptions; reuses index's tier score | composition only ("computes nothing new") | staleness display arithmetic |
| `analytics-desk.html` | 07-25 | 07-25 | 2 (0) | 170 | 2 | per-instrument range, regime, Hurst, tails (`js/analyticsDesk.js`) | measurement only | — |
| `Todayv3.html` | 08-18 | 08-18 | 1 (0) | 245 | 0 | an iframe of today.html with injected light CSS | — | — |
| `market-sense.html` | 09-18 | 09-18 | 1 (0) | 315 | 4 | runner for study jobs | — | — |
| `market-view.html` | 09-22 | 10-26 | 29 (6) | 2,061 + 19 modules | 7 | `js/marketState.js` rule labels ("not a regime model", conditions met vs failed), `js/deskRead.js` template narration, sector breadth | labels plus counts of supporting and contradicting conditions | uses its own `/api/drill-series` bundle and walks back up to 6 sessions |
| `terminal.html` | 09-23 | 09-24 | 7 (0) | 601 + `js/terminal.js` | 9 | same engines as market-view: six risk gauges, counted, "NO COMPOSITE SCORE, DELIBERATELY" | count of elevated gauges | some |
| `chapters.html` | 09-27 | 10-26 | 4 (1) | 265 | 1 | composite gauges per complex showing coverage / agreement / loudest member (`js/gaugeRead.js`) | gauge with fragility | — |
| `daily-read.html` | 10-03 | 10-03 | 1 (1) | 168 | 2 | nightly continuation / exhaustion tags (IV vs forecast σ) | tags | nightly |
| `daily-plan.html` | 10-07 | 10-07 | 3 (3) | 393 | 6 | forecast lines, room left, stop and size | sizing rules | — |
| `market-review.html` | 10-24 | 10-26 | 3 (3) | 431 | 2 | weekly review from **static** `analysis/output/market-review/*.json` | none | static snapshot |
| `feed.html` "The Feed" | 10-25 | 10-29 | 3 (3) | 827 | 3 (`/api/feed`) | C.OG-style options / rates / commodities / liquidity tabs | none | some |
| `atlas.html` "Desk Atlas (v2 preview)" | 10-22 | 10-29 | **51 (51)** | 1,023 + 34 modules | **52** | Global / Currency / Pair lenses over `/api/global-read`, `/api/regime`, macro-changes and more; it has become the **newsletter builder** (V1–V4 layouts, PDF, Telegram) | inherits Global Read | `js/dataFreshness.js` per-feed rhythm checks |

Also central-ish: `macro-scorecard.html` (an equal-weight cross-currency mean of the macro and CB engines, linked from 21 macro pages), `weekmap.html`, `flow-chain.html`, `regime.html`, `evidence.html`, `drill.html`.

### Endpoint overlap between the main dashboards

The counts below exclude the generic nav and KV endpoints.

```
            index indexv2 today desk terminal mktview atlas feed
index         41     10    15    11     0      0      5    0
indexv2       10     21    11    10     1      0      4    0
today         15     11   105    11     8      6     40    0
desk          11     10    11    26     1      0      6    0
terminal       0      1     8     1     9      6      6    0
market-view    0      0     6     0     6      7      4    0
atlas          5      4    40     6     6      4     52    0
feed           0      0     0     0     0      0      0    3
```

The 8 dashboards use 161 distinct endpoints between them, and only 10 appear in 4 or more of them (ohlc, vol-forecast, cot-extremes, oanda_ohlc5m, events, fred, daily-brief, oi-today, calendar-feed, intl-yields).
- 47 endpoints appear only on today.
- Atlas is about 80 % a re-skin of today's data (40 of 52 shared). Its additions are the newsletter, AI A/B, earnings, Fed speakers and Treasury auctions.
- market-view/terminal and feed share almost nothing with the rest. They are separate pipelines.

### Which ones the owner actually uses

- The default route `/` serves **`index.html`**: `server.js:39376` (`express.static` with `index:'index.html'`) plus an SPA fallback at `server.js:39389`. Yet index has had 1 commit since 3 Oct.
- Measured by commits, the working surfaces are **`today.html`** (341 lifetime commits and 129 in September, the most of any page) and, since 22 Oct, **`atlas.html`** (51 commits in 8 days, mostly newsletter work).
- Abandoned after one build: desk.html (2 commits), analytics-desk (2), terminal (7, dead after two days), Todayv3 (1), market-sense (1), daily-read (1).
- The documents contradict each other on which page is the front door:
  - `MD files/CLAUDE.md:377` says "index.html is THE Dashboard".
  - Three lines later, `MD files/CLAUDE.md:381-382` says the two actively used nav surfaces are "both on today.html".
  - `js/siteApiMap.js:4` describes today.html as "becoming the main hub".
  - `INDEX_DECOM_QUESTIONS.md` (24 Aug) wants today.html to be the front door. `PER_PAIR_VIEW_PROPOSAL.md:253` notes the repo "has twice decided" the opposite.
  - `MD files/MARKET_DESK_PROPOSAL.md:236-250` proposed desk.html as the landing page and said indexv2 "should be retired/redirected once The Desk ships, so there aren't three landings". Neither happened: desk.html froze on day 1 and indexv2 was still being edited on 24 Oct.

## 4. Backend API surface

| where | routes | notes |
|---|---|---|
| `server.js` (41,758 lines) | 742 | Express on Railway. The `app.all('/api/*')` at `server.js:39041` forwards everything unmatched to `_worker.js` |
| `_worker.js` (3,016 lines, CF Pages worker) | 36 (+3 granularity aliases) | OANDA quote/ohlc/stream/book, FRED, ECB SDW, KV get/set, COT, events/surprise, telegram, regime-history, trade-history. Also imported **by** server.js |
| `js/*Routes.js` (19 modules) | 81 | analyser (16), level-atlas (13), asia/monday fib atlas (20), session path/handoff (10), feed (4), surface-lab (3), shadows (5), daily-read, paper-record, vix-capture, yield-shape-regime |
| template routes `/api/${key}/...` | 7 × 4 banks | rbnz/rba/boc/snb engines (`server.js:8471` `_registerCbEngine`) |
| `cron-worker/cron-worker.js` | 1 (`/diag`) | cron every minute. It reads entry levels **"computed by the browser dashboard"** from KV and fires Telegram alerts. Unchanged since 13 Jun |
| `server-analyser.js` | 0 own | a separate public service that mounts the analyser routes only |

**Total: 859 routes.**
- **671** have at least one page consumer.
- **492 are used by exactly one page.** The API is shaped per page, not per domain object.
- **180** are `/run` + `/status/:jobId` backtest job endpoints.
- **188** have no page consumer.
  - 123 of these are still called by js modules, the server itself or python bots: internal fan-out like `/api/global-read` pulling 33 endpoints over `127.0.0.1`, plus bots reading `/api/...`.
  - **65 have no consumer anywhere in the repo.** Most are ops or admin (`*/tick`, `*/debug-fetch`, `*/refresh`, `*/backfill`). There are also orphaned data routes: `/api/claim-watch`, `/api/digest`, `/api/macro-scorecard/history` (and `/record`), `/api/vol-forecast/ladder`, `/api/oi-history-raw`, `/api/analogml/shape-state`, `/api/vol-reversion/:sym`, `/api/rates-regime/tick`, `/api/bank-credit/tick`, `/api/feed/notes/:week`, `/api/{boc,rba,rbnz,snb}/latest`. The full list is `api.csv` rows with `n_pages=0` and an empty `other_consumers`.
- **Pages calling endpoints that don't exist: none found statically.** Every page fetch resolves to a defined route once template routes and worker aliases are included. The only broken link is the `data-map.html` href.
- Upstream feeds (keyword heuristic over each handler body): KV 251, OANDA 240, FRED 102, R2 85, static files 54, CBOE/options 49, CFTC 18, AI/LLM 15, Treasury/BLS 14, Yahoo/Stooq 15.

**The browser is still a producer.** `index.html` loads `js/alerts.js`. On every price tick it writes `ai_goldmodel` (`js/alerts.js:926`), `arima_price_*`, `ai_decision_meta_*`, `decision_audit_log` and the `ai_alert_cfg` / caps config to KV. No server-side writer of `ai_goldmodel` exists; grep of server.js, levels.js and js/ finds only alerts.js. Gold, GoldV2 and ConfluenceBot read these keys. `INDEX_DECOM_QUESTIONS.md` §0 documented this on 24 Aug, and it is still unresolved. **index.html cannot be retired until that loop moves to the server**, which is one concrete reason it has survived every replacement.

## 5. Diagnosis: why the unification attempts don't stick

**1. Each attempt is additive by policy, so nothing is ever replaced.**
- Atlas's own header says "Additive: today.html is untouched" (`atlas.html:12`), and the first commit (22 Oct) repeats it.
- 82 commit subjects contain "additive / untouched / unchanged / beside / preview / side by side". The newsletter alone carries V1, V2, V3 and V4 layouts "built beside" each other.
- Todayv3 is an iframe around today.html. indexv2 was meant to be retired by desk.html (`MARKET_DESK_PROPOSAL.md:249`), and neither was retired.
- The result is 17 central pages and 52 superseded ones that stay live. The "Archived" menu holds 61 links, but the files are never deleted.

**2. No single owner of "market state". There are at least six parallel state producers with different inputs and philosophies.**
- **Server-side** `/api/global-read` (`js/globalReadCore.js`, evidence-weighted, five axes, scenarios). Only today and atlas consume it.
- **Client-side** in parallel:
  - `js/macro.js` 7-tier score (index, desk)
  - `js/pairCompositeEngine.js` (indexv2, today)
  - `js/outlookEngine.js` (today)
  - `js/marketState.js` + `js/deskRead.js` (market-view, terminal, fed by a separate `/api/drill-series` bundle)
  - `js/gaugeRead.js` (chapters)
  - `js/stateStrip.js` / HMM (today, atlas)
  - `/api/regime` growth × inflation quadrant (regime, terminal, atlas, today)
  - `/api/macro-scorecard` (indexv2, macro-scorecard, atlas, today)
  - `/api/daily-brief` and `/api/morning-brief`
  - `/api/risk-flags`
- Each dashboard was built around whichever producer was newest. They also disagree by design: terminal.js says "NO COMPOSITE SCORE, DELIBERATELY"; marketState.js says "not a regime model"; index's tier score *is* a weighted composite; Global Read is a regression frame.

**3. The repo's own evidence says the inputs the dashboards were built to show are worth zero.**
- `js/globalReadCore.js:57-75` sets `tier:'null', ic:0` for the yield-spread sleeve (deflated 17 Oct), the macro scorecard, COT, CB tone and the trend basket. Only post-FOMC drift (validated, IC 0.30) and range inputs carry weight.
- `js/deskRead.js:21` says: "Every forward claim this desk has tested has died except range."
- Yet the long-lived surfaces still lead with those signals:
  - the index 7-tier macro score
  - today's 20-day Outlook built from composite + COT + yield-spread + macro (`today.html:6086`, `js/outlookEngine.js:1-25`)
  - the macro scorecard as the hub of 21 macro pages
- A dashboard whose centerpiece is a number the evidence says is noise has nothing stable to organize around. Each new attempt therefore pivots to a new framing: weather, story, chain, lenses, chapters, newsletter.

**4. Evidence is hard-coded twice and frozen in places.**
- The Evidence Book is 293 hand-written entries in `js/deskEvidence.js`.
- Global Read hard-codes its own tier and IC strings in `REGISTRY` (`js/globalReadCore.js:50+`) and does not import deskEvidence. A re-banked verdict has to be edited in two places.
- 48 pages render static `analysis/output` snapshots, for example market-review, research-log and portfolio-book. Results pages show whatever was true on the day they were built.

**5. The API is page-shaped, not model-shaped.**
- 492 of 859 endpoints have exactly one page consumer.
- Every new dashboard brings its own aggregation endpoints (`/api/feed`, `/api/chapters`, `/api/flow-chain`, `/api/weekmap`, `/api/analytics-desk/:pair`, `/api/daily-read`, `/api/today-reads`, `/api/surface-lab`, `/api/drill-series`) instead of reading one state document.
- `server.js` has grown to 41.8k lines with 742 routes.

**6. Navigation is hand-maintained in four registries, and the global nav is mounted on only 5 pages.**
- Most pages carry only "← Dashboard". 88 pages have no inbound page link at all.
- Discoverability depends on a 102-item "Live" dropdown that lives on pages the owner is moving away from. A new dashboard therefore cannot become "the" entry point by navigation alone.

**7. Guidance is contradictory and not auto-loaded.**
- On 1 Aug (commit `69d56464` "zoo") `CLAUDE.md` moved to `MD files/CLAUDE.md`. Claude Code sessions, which wrote about 40 % of the commits, no longer pick up the house rules automatically.
- Those rules contradict themselves anyway: index is THE dashboard, yet both active navs are on today. hub.html is "not useful" yet still linked from 7 pages.
- Each session takes the front-door question afresh and usually builds a new page rather than change the incumbent.

**8. Design is driven by outside references, not by a state spec.**
- feed.html is "C.OG's ... feed on one page".
- market-view/deskRead reference "both reference designs".
- Atlas pivoted within 48 h into a newsletter product.
- Todayv3 is an uploaded visual redesign.
- Each one re-skins the same data with a new IA, so the work adds layouts and leaves the state definition unchanged.

### What would make the next attempt stick (brief)

1. **Pick the state model first, the page second.** `/api/global-read` is already the most principled candidate (evidence-weighted, freshness-aware, server-side). Make it the single "market state" document. Have it import `deskEvidence.js` for tiers instead of its own `REGISTRY` strings. Drop or demote any page panel that shows a null-tier direction signal.
2. **Move the browser producers** (`js/alerts.js` KV writes, cron-worker's browser-computed levels) **to the server.** index.html then becomes retirable. Point `/` at the chosen hub (`server.js:39376`).
3. **One generated page registry**, built the way `js/dataMap.js` is generated, replacing commandHub, siteApiMap, SITE_MAP.md and hub.html. Mount it on every page.
4. **Retire by redirect** (the pattern of `claim-watch.html` / `backtest-monitor.html`): the 52 (g) pages and the dead dashboards desk, terminal, Todayv3, indexv2, analytics-desk, market-sense and hub. Restore `CLAUDE.md` at the repo root with one unambiguous front-door rule.
