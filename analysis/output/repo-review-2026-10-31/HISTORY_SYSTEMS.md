# MacroFXModel: mission archaeology and systems inventory

*Read-only review, 2026-10-31. Repo HEAD has 6,840 commits (5,091 non-merge, 1,749 merges) from 2026-05-03 to 2026-10-31. Inventory CSV: `systems.csv`, in the same folder as this file.*

---

## Part 1: Mission archaeology

### 1a. The original design intent (sources)

The first commit (`be32b5d7`, 2026-05-03, "Add files via upload") added `_worker.js`, `index.html` (5,958 lines) and `journal.html`, a Cloudflare Pages app ported in from an earlier site. The founding documents say what it was for:

- **`MD files/Fxmacro dashboard handover.md`** (the pre-repo site, "Last updated: April 2026"):
  > "A team FX morning scorecard built on the C.OG cross-asset framework. It scores 9 currency pairs (+ gold) across 8 macro and technical tiers, generates a GARCH volatility forecast, classifies the volatility regime, and produces a Claude-written morning briefing that incorporates live FRED data, OHLC technicals, economic calendar events, and Finnhub news headlines."
- **`MD files/CLAUDE_HANDOVER.md`** (commit `59603412`, 2026-05-04, "handover doc created"):
  > "A Cloudflare Pages web app that provides multi-timeframe macro analysis and entry signals for FX and Gold trading."
  It describes a **7-tier macro score** in `js/macro.js` (T1 rate differential/TIPS, T2 risk sentiment, T3 trend, T4 momentum, T5 COT positioning, T6 seasonality, T7 valuation, plus a coherence bonus, with LONG/SHORT/NEUTRAL at ±4). On top of that sit a signal engine (macro surprise, cross-pair USD conflict), a USD-strength composite, a GARCH/ATR vol module, Asia/Monday ranges, confluences, an ARMA regime model, the Finnhub calendar, COT, an OI sidebar and an AI brief.
- **`MD files/CODEBASE_OVERVIEW.md`** (2026-08-01) still names the first organising idea as "**Macro context first**: a multi-tier macro score (rates, vol, USD, credit, carry, financial conditions) gates and sizes everything", then "Regime detection: HMMs classify markets as BULL/BEAR/RANGE/CHOP".

So the owner's stated vision matches the first week of code: a macro and market-state scorecard (rates, risk, USD, COT, OI, calendar) as the base layer, with entry signals and analysis layered on top. Two points from the founding doc matter for what followed:

1. **C.OG was part of the plan from before day 1** ("built on the C.OG cross-asset framework"). The later C.OG replication work was not a random detour. It came from a seed in the founding concept.
2. **Entry signals were in the first scope too.** Within 48 hours the repo had range-fix commits and "backtest start" (2026-05-04). Day-trading levels were never secondary.

### 1b. Timeline by month: themes and pivots

Shares are the % of **non-merge** commits per month whose message matches each theme's keyword regex. One commit can match several themes. A second table counts commits that touched each family's **paths**. Method: `themes.py`, in the same folder as this report.

### Commit-message keyword share (non-merge commits; a commit can hit several themes)

| theme | 2026-05 | 2026-06 | 2026-07 | 2026-08 | 2026-09 | 2026-10 |
|---|---|---|---|---|---|---|
| forecast/vol-range | 11% (53) | 23% (178) | 25% (202) | 16% (117) | 10% (92) | 29% (402) |
| cog | 0% (0) | 1% (7) | 9% (74) | 3% (22) | 1% (6) | 9% (131) |
| oi/gamma/options | 2% (11) | 1% (7) | 13% (105) | 11% (82) | 5% (43) | 12% (167) |
| cot | 2% (8) | 1% (6) | 1% (9) | 3% (26) | 0% (1) | 3% (38) |
| education/lesson | 0% (1) | 1% (4) | 8% (61) | 8% (60) | 7% (62) | 20% (272) |
| bot/execution | 8% (36) | 10% (79) | 10% (82) | 5% (37) | 7% (66) | 4% (57) |
| backtest/research | 10% (46) | 17% (131) | 15% (124) | 16% (122) | 21% (187) | 31% (437) |
| macro/regime | 13% (62) | 15% (118) | 11% (91) | 9% (70) | 11% (94) | 18% (254) |
| liquidity/credit/flows | 1% (3) | 4% (28) | 3% (28) | 3% (19) | 1% (13) | 10% (144) |
| dashboard/today/desk | 7% (33) | 9% (69) | 9% (75) | 19% (145) | 26% (231) | 15% (213) |
| fib/levels/confluence | 12% (54) | 10% (82) | 13% (101) | 22% (164) | 14% (124) | 10% (137) |
| infra/data/fix | 36% (167) | 32% (255) | 19% (157) | 19% (140) | 20% (176) | 17% (238) |
| **non-merge commits** | 465 | 787 | 807 | 750 | 890 | 1392 |

### Files-touched share (non-merge commits touching paths of that family)

| theme | 2026-05 | 2026-06 | 2026-07 | 2026-08 | 2026-09 | 2026-10 |
|---|---|---|---|---|---|---|
| forecast/vol-range | 15% (68) | 28% (217) | 23% (189) | 8% (62) | 7% (62) | 3% (48) |
| cog | 0% (0) | 1% (5) | 3% (28) | 0% (0) | 0% (4) | 1% (13) |
| oi/gamma/options | 2% (7) | 1% (6) | 12% (98) | 9% (64) | 6% (52) | 8% (113) |
| cot | 2% (8) | 1% (4) | 1% (8) | 3% (25) | 0% (0) | 2% (25) |
| education/lesson | 0% (0) | 0% (0) | 7% (60) | 13% (100) | 9% (80) | 17% (237) |
| bot/execution | 23% (108) | 16% (129) | 8% (64) | 3% (22) | 8% (67) | 1% (16) |
| macro/regime | 11% (53) | 14% (108) | 5% (44) | 5% (34) | 4% (36) | 3% (47) |
| **non-merge commits** | 465 | 787 | 807 | 750 | 890 | 1392 |


**Other monthly markers:**
- **New root HTML pages added:** May 13, Jun 46, Jul 81, Aug 43, Sep 24, Oct 42. There are 244 root pages today, and 159 of them have not been touched since Oct 1.
- **First appearance in commit messages:** OI 05-05 · gamma/GEX 05-11 · Global Liquidity 05-13 · HMM 05-14 · MT5 05-15 · credit 05-24 · Forecaster 05-29 · lesson 06-01 · C.OG 06-16 · pre-registration 06-25 · theory-lab 07-26 · Fib Atlas 08-26 · Vote Atlas 08-28 · Global Decision/Read 09-02 · Evidence Book 09-17 · Daily Read 09-24 · lockbox 10-04.
- **Branch-name vocabulary of merged PRs:** May "range, backtest, volatility, forecaster, gold"; Jun "range, forecaster, regime, optimizer, macro, nasdaq"; Jul "review, backtest, weekly, validation"; Aug "analysis, fomc, sentiment, education"; Sep "education, micro, analogueml, telegram, theory"; Oct mostly session ids.

**Phases:**

| period | dominant work | what it means for the mission |
|---|---|---|
| **May (wk 1–2)** | Port of the Cloudflare macro scorecard: 7-tier score, yield curve, TIPS, COT, NAS added, OANDA data move, AI brief. Railway/`server.js` arrives 05-13. | **On-mission.** This is the macro dashboard. |
| **May (wk 2–4)** | Asia/Monday range zones with a 15-feature "range-bias engine", HMM regime files, level bot, Gold bot, `backtestSystem/`, `VolRangeForecaster/`. | First pivot: the range/levels **entry engine** and live MT5 bots take over from the macro score. Infra/fix commits are 36%. |
| **June** | Peak bot and engine building: RegimeV2 → V4 → V7, RegimeOptimizer, DecisionEngine, GlobalLiquidity, ForecasterOptimizer, vol-forecast pages, 46 new pages. Bots touch 16% of commits; forecast/vol-range 23–28%. | The market-state idea is tried as **regime bots** (trading HMM states), not as a dashboard state. |
| **July** | Biggest page sprawl (81 new pages). C.OG work starts (9%), OI/gamma rises (13%), Theory Lab and education begin (8%), ConfluenceBot/GoldV2/volatility_bot, Trade_Decision_Engine. PR branches are named "review/validation". | Splits three ways: COG replication, OI layer, education. Validation work starts to expose nulls. |
| **August** | Audit month: `august analysis.md` / `august action plan.md` (08-22), OI quant review, FOMC/CB sentiment studies, AnalogML, Fib Atlas and Vote Atlas. Dashboard/fib-levels keywords peak (19%/22%). | The repo's own audit finds "seven regime classifiers, four live regime bots, five competing dashboards", and macro is "decoration, not a judge". |
| **September** | Evidence Book (09-17), Market Sense tests, growth×inflation regime (`js/regimeCore.js`), Global Decision Engine, Daily Read. Local decision engines and Vote Atlas v3 / Fib Atlas v2 bots. **HMM schedulers switched off on 09-16.** Dashboard/today keywords reach 26%. | A second, more honest attempt at "global state": a descriptive macro regime plus an evidence-weighted read. Bots fork again. |
| **October** | Most commits of any month (1,496). Research/pre-registration 31%, education/lessons 20% (theory-lab 205 commits, the Forecaster Portfolio course), forecast/vol-range 29% (HAR-800 ladder, lockbox, path map), liquidity/credit 10% (bank credit, funding, financing). Work moves into `forge/`, `plans/`, `analysis/`. | Pivot to a **"quant forecaster system"** that copies a course's 7-layer architecture. The macro engine becomes one of ~40 inputs scored by evidence. Direction is formally conceded (QUANT_SYSTEM_BUILD_PLAN: "Variance is predictable; the daily mean is not"). |

### 1c. Where and why it drifted

1. **Toward entry levels and range forecasting (May–June, again in October).** Range/levels work started on day 2, because the founding app already emitted "entry signals". Once backtests ran, the only things that kept validating were range and volatility results. The Evidence Book shows **volatility 27 validated vs macro 0 validated (50 null, 17 context, 11 underpowered)**. The work followed the evidence. `plans/QUANT_SYSTEM_BUILD_PLAN.md` (10-17) says so directly: *"This is the published result for daily-horizon direction in FX majors and index futures from public data, rediscovered with rigour. Variance is predictable; the daily mean is not."* The October contract outputs range quantiles and "sleeves on", not a macro state.
2. **Toward execution bots (May–September).** Every validated or half-validated idea got its own MT5 bot, usually forked rather than merged ("versioned, not overwritten" is a stated house rule in the GoldV2 and ConfluenceBot headers). The result is 25 bot-class directories. Bots took 23% of May commits (by path) and kept forking through September.
3. **Toward C.OG replication (from July).** This was seeded by the founding concept. It became reverse-engineering his daily lines, gates and course (`cog/`, `cog-replication/`, `cog-standalone/`, 7 `cog-*.html` pages, 364 commit messages). It peaked in July and October at 9% of commits.
4. **Toward education (from July, dominant in October).** Theory Lab (378 lessons, micro decks, 115MB of audio), `education/` (175MB, course transcriptions), and `cog/` lessons. In October 20% of commit messages are lesson/course work. The Forecaster blueprint makes the course the *architecture source* for the trading system, so education now steers what gets built.
5. **Process over product (from late July).** Pre-registration, the research register, the Evidence Book, lockbox and trial ledgers. This is valuable rigour, but in October research/prereg is 31% of commits and the outputs are verdict files, not a state engine.

**Why the drift happened:** (i) the macro score never earned a predictive test, so effort moved to what did validate (vol/range); (ii) there was no single owner-level contract for "market state" until October's LAYER_INTERFACES, which has no macro layer (the macro tier is absent; the "primary direction" row reads "not built"); (iii) each new idea got a new page, bot or directory instead of a slot in an existing engine (244 pages, and `server.js` with 41,758 lines, ~752 routes and ~60 schedulers); (iv) the C.OG and course material supplied fresh agendas faster than old ones were closed.

### 1d. Was a "market state" model ever built? What happened to each attempt

Yes, about eight times, and none survives as the one central engine.

| attempt | built | what it was | fate |
|---|---|---|---|
| **7-tier macro score** `js/macro.js` (+ signal engine) | 05-03 (pre-repo) | Per-pair macro/technical score, ±17, LONG/SHORT bias | Still in the codebase (19 commits, last 10-24) and still feeds the index pages. Never validated as a predictor. Its "macro as signal" descendants are banked nulls (econ-trend, macro-direction, credit gating, CB sentiment, FOMC surprise, GLI). |
| **HMM regimes** `hmm.js`, `hmm5m.js`, `hmm5m-v2.js`, `hmm5m-train.js` | 05-14 to 05-18 | 2-state daily, 3-state 5m, 4-state learned (BULL/BEAR/RANGE/CHOP) | In August, `hmm5m-v2` was named "canonical, the only one in production serving every consumer". **All five HMM schedulers were switched OFF on 2026-09-16** (`js/serviceFlags.js`: ~2,500 fetch+fit per hour, too costly). Only the daily `hmm.js` still runs inside the levels job. The OI Level Lab (10-29) notes "HMM said calm on every session so unused". |
| **Regime bots** `RegimeV2/` → `RegimeV4/` → `RegimeV7/`, `RegimeOptimizer/` | 05-26 to 06-21 | HMM/BOCPD regime-following MT5 bots, Optuna-tuned | All untouched since 08-25. V2 is **still started on Railway** by `start.sh`, even though the HMM jobs it relies on are off. V4 is superseded by V7. V7 (Aug's "canonical") is in no launcher. Optimizer: 46MB of committed cache. |
| **DecisionEngine/** | 06-01 to 06-02 | "Transform MacroFXModel from a data dashboard into a probabilistic permission engine" | Six commits, then abandoned. Still imported by `js/render.js`/`alerts.js`. Its confidence multiplier is anti-predictive (BUG_LIST #32). |
| **GlobalLiquidity/** + `global-liquidity.html` | 06-26 | Money-conditions nowcast → regime classifier → expression engine (Howell/Pal/CrossBorder/Alf) | GLI→FX Sharpe 0.01 (null). Parked since 09-06. There are four separate net-liquidity computations in the repo. |
| **Trade_Decision_Engine/** | 07-02 to 08-19 | Meta-labelling of per-event decisions (logistic, OOS Brier 0.2469) | Served by `server.js`, untouched since August. |
| **macro-conditioner / macro-scorecard / market-sense / market-view** | 07-22 to 09-22 | σ-tercile × macro regime; cross-engine per-currency composite; market-sense tests; market view page | `macro-conditioner.html` was frozen after 2 commits. `macro-scorecard` (Aug verdict: "single macro landing page") is still fed into `today.html`. Market Sense tests are mostly null/context. |
| **Growth×inflation regime** `js/regimeCore.js`, `MD files/REGIME.md` | 09-19 | Monthly FRED quadrant, explicitly "a description, not a claim" | Live as context. `regime-divergence-fx` is a null. |
| **Global Decision Engine / Global Read** `js/globalReadCore.js` | 10-13 | Reads ~40 live engines and weights each by its Evidence Book tier | **The closest thing to the original vision.** Live on `today.html` every 15 minutes with a pre-registered forward test (§6). Its own evidence: direction from combined descriptive reads is h1 41% (worse than a coin flip), so it gives direction zero weight. Its value is range/behaviour. |

---

## Part 2: Systems inventory

Columns: `refs` = number of code files (js/mjs/html/py/sh/bat/toml/yml, excluding `analysis/output`) outside the item that name its path. `(server.js)` = referenced from server.js. `prod / runs` comes from `start.sh` (Railway: Dockerfile → `bash start.sh`), `start_live_all.bat` (local Windows MT5 box), server.js schedulers, or "manual MT5". `30d` = commits since 2026-10-01. MB = size tracked at HEAD. Reference counts for generic names are inflated by false positives: `test` (2,316) and `results.json` (134) match unrelated text, and both files are really orphans.

**What runs in production:**
- **Railway** (`railway.json` → Dockerfile → `start.sh`): `node server.js` (~60 schedulers, toggled by `js/serviceFlags.js`) plus 8 supervised loops: RegimeV2, bot/main.py (level bot), Gold/main.py, PatternBot, levelEngine/live_watch.py, and three AnalogML loops.
- **Local Windows** (`start_live_all.bat`): fib_atlas_bot v1/v2, volatility_bot v2/v3, local_decision_engine (:4500), fib_local_decision_engine (:4501).
- **Started by hand on MT5, in no launcher:** oi_bot, oi_conf_bot, oi_vol_bot, motif_bot, range_line_bot, GoldV2, ConfluenceBot, DynAnchorBot, MacroEquityBot, YieldSpreadBot, RegimeV7, SignalCopier (start.bat).
- **Cloudflare:** `_worker.js` (Pages), and possibly `cron-worker/` (every-minute cron, untouched since June).
- `Procfile` is redundant: Railway uses the Dockerfile.

**Classification counts** (136 items = 75 directories + 61 loose non-HTML files):

| class | dirs | loose files | total | tracked MB |
|---|---|---|---|---|
| CORE | 9 | 14 | 23 | 48 |
| LAYER | 4 | 8 | 12 | 11 |
| RESEARCH | 16 | 3 | 19 | 1,449 |
| BOT | 25 | 1 | 26 | 70 |
| EDUCATION | 3 | 0 | 3 | 318 |
| DOCS | 3 | 7 | 10 | 12 |
| DEAD/SUPERSEDED | 12 | 0 | 12 | 8 |
| JUNK | 3 | 28 | 31 | 25 |

(DEAD/SUPERSEDED = Beta Idea, Chatgpt, Dax IFO, DecisionEngine, ForecasterOptimizer, RegimeV4, TradingBot, Zoo, archive, cog-standalone, cron-worker, volatility_bot. Several "BOT" items are effectively dead: YieldSpreadBot, whose edge was deflated to null on 10-17, and the Vote/Fib Atlas bots, whose strategy family "died of look-ahead bias" according to `plans/FORECASTER_SYSTEM_BLUEPRINT.md`.)

| item | class | purpose | lang (top ext) | MB | first | last commit | commits | 30d | refs | prod / runs | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `AnalogML/` | **BOT** | k-NN price-shape analogs + touch-motif tracker; 3 Railway loops (paper track, motif track, nearing watch) feed motif_bot | .py:37, .json:30, .sh:2, .md:1 | 66.92 | 2026-08-10 | 2026-09-28 | 96 | 0 | 34 (server.js) | Railway (start.sh x3) | Analog k-NN arm is a banked null (self-adjacency bug); motif arm live. 67MB of committed JSON exports |
| `Beta Idea/` | **DEAD** | One README: beta stochastic-control idea note | .md:1 | 0.01 | 2026-05-26 | 2026-05-26 | 1 | 0 | 1 | no | never built |
| `Chatgpt/` | **DEAD** | 21 ChatGPT-written "MacroFXModel Chapter N" design essays (Jul 23) | .md:20, (none):1 | 0.13 | 2026-07-23 | 2026-07-23 | 2 | 0 | 1 | no | superseded by MD files/ + theory-lab |
| `ConfluenceBot/` | **BOT** | Max-style level-matrix confluence bot for any instrument (generalised GoldV2) | .py:12, .md:1, .txt:1 | 0.26 | 2026-07-06 | 2026-09-11 | 19 | 0 | 6 | no (manual MT5) | dup family Gold/GoldV2/ConfluenceBot |
| `ContinuationBot/` | **RESEARCH** | Pullback-continuation backtest (2 commits) | .py:4, .md:1, .txt:1, .json:1 | 0.57 | 2026-08-11 | 2026-08-11 | 2 | 0 | 1 | no | one-off |
| `DailyOpenResearch/` | **RESEARCH** | Daily-open fib study + brief builder (Sep 12-13) | .py:17, .md:7, .json:3, .html:2 | 2.24 | 2026-09-12 | 2026-09-13 | 4 | 0 | 1 | no | feeds scripts/build_daily_open_votetrades.mjs |
| `Dax Base IFO System/` | **DEAD** | DAX vs German IFO system (python + charts) | .png:16, .csv:7, .py:4, .md:1 | 6.29 | 2026-07-20 | 2026-10-25 | 2 | 1 | 2 | no | banked LOOKAHEAD null (dax-ifo-lookahead, 2026-10-25) |
| `DecisionEngine/` | **DEAD** | Session-level "permission engine" (DESIGN.md: turn dashboard into probabilistic permission engine) - market-state attempt | .js:4, .md:1 | 0.05 | 2026-06-01 | 2026-06-02 | 6 | 0 | 6 | JS imported by js/render.js/alerts.js | superseded by Trade_Decision_Engine/ then js/globalReadCore.js; confidence multiplier anti-predictive (BUG_LIST #32) |
| `DynAnchorBot/` | **BOT** | Dynamic-anchor mean-reversion MT5 bot (Calmar 9.97 in-sample claim) | .py:1 | 0.06 | 2026-06-02 | 2026-08-25 | 16 | 0 | 4 | no (manual MT5) | supersedes TradingBot/ |
| `ForecasterOptimizer/` | **DEAD** | Multi-pair forecaster config sweep (Jun 21-22) | .json:27, .py:3, .md:1, .txt:1 | 0.48 | 2026-06-21 | 2026-06-22 | 5 | 0 | 0 | no | superseded by forge/ harness + js/forecastLadderParamsHar800.js |
| `GlobalLiquidity/` | **CORE** | Global-liquidity nowcast -> regime classifier -> expression engine (Howell/Pal/CrossBorder) - market-state attempt | .py:11, .mjs:4, .md:1 | 0.09 | 2026-06-26 | 2026-09-06 | 12 | 0 | 10 (server.js) | server.js imports config/backtest | GLI->FX test Sharpe 0.01 (null); parked since Sep 6 |
| `Gold/` | **BOT** | Gold V1 confluence bot (XAU) | .py:17, .md:2, .csv:2, .example:1 | 0.27 | 2026-05-24 | 2026-09-11 | 125 | 0 | 34 (server.js) | Railway (start.sh botGold) | dup family Gold/GoldV2/ConfluenceBot |
| `GoldV2/` | **BOT** | Gold V2 level-matrix confluence bot | .py:12, .md:1, .txt:1 | 0.21 | 2026-07-02 | 2026-09-11 | 11 | 0 | 10 | no (manual MT5, paper) | V1 kept running "versioned not overwritten" |
| `MD files/` | **DOCS** | 202 design docs, preregs, findings, handovers | .md:201, (none):1 | 8.77 | 2026-05-03 | 2026-10-31 | 720 | 143 | 193 (server.js) | no | overlaps plans/, forge/, docs/ |
| `MacroEquityBot/` | **BOT** | Monthly 5-factor US macro -> equity-index allocation MT5 bot | .py:3 | 0.04 | 2026-06-14 | 2026-10-17 | 12 | 1 | 4 (server.js) | no (manual MT5) | Aug plan: pause unless Q6 re-run passes |
| `NasdaqMacroLead/` | **RESEARCH** | Does macro lead Nasdaq? scan + TradingView export | .md:1, (none):1, .pine:1 | 0.03 | 2026-09-04 | 2026-09-05 | 8 | 0 | 5 (server.js) | server route | one study |
| `PatternBot/` | **BOT** | Pattern live bot (double tops/bottoms, touch patterns) | .mjs:1 | 0.01 | 2026-08-06 | 2026-08-06 | 2 | 0 | 5 (server.js) | Railway (start.sh) |  |
| `RegimeOptimizer/` | **RESEARCH** | Optuna search over regime-bot simulators V1-V6 | .db:5, .py:4, .html:4, .json:4 | 46.31 | 2026-06-07 | 2026-07-18 | 4 | 0 | 1 | no | 46MB committed .pkl cache + .db results |
| `RegimeV2/` | **BOT** | Regime bot V2: BOCPD + 7-component score + HMM; library imported by V4/V7 | .py:7, .md:3, .txt:1 | 0.27 | 2026-05-26 | 2026-08-25 | 49 | 0 | 23 (server.js) | Railway (start.sh botRegimeV2) | still started on Railway although the HMM jobs it relies on were switched off 2026-09-16; Aug review said PARK bot |
| `RegimeV4/` | **DEAD** | Regime bot V4 (V2 + RANGE_HOLD state machine) | .py:2 | 0.08 | 2026-06-07 | 2026-08-25 | 7 | 0 | 1 | no | superseded by RegimeV7 |
| `RegimeV7/` | **BOT** | Regime bot V7 (simulateV7 port, M30 MTF + HTF gate) - canonical regime bot per Aug review | .py:2 | 0.08 | 2026-06-21 | 2026-08-25 | 16 | 0 | 4 | no (manual MT5) | not in start.sh; untouched since Aug 25 |
| `SessionResearch/` | **LAYER** | Session/day-flow research engine, refreshed by server.js timers | .json:313, .html:26, .py:13, .md:1 | 9.24 | 2026-08-17 | 2026-09-27 | 17 | 0 | 5 (server.js) | server.js scheduler |  |
| `SignalCopier/` | **BOT** | Copies external trade signals into a book (Oct 30-31) | .py:8, (none):1, .md:1, .txt:1 | 0.11 | 2026-10-30 | 2026-10-31 | 5 | 5 | 4 (server.js) | start.bat (local) | newest bot |
| `Trade_Decision_Engine/` | **LAYER** | Meta-labelling per-event decision API (logistic on 110,883 events) | .js:7, .mjs:4, .md:2 | 0.19 | 2026-07-02 | 2026-08-19 | 29 | 0 | 6 (server.js) | server.js | superseded as "one read" by js/globalReadCore.js |
| `TradingBot/` | **DEAD** | Dynamic-anchor OANDA paper bot | .py:1, .txt:1 | 0.03 | 2026-06-02 | 2026-06-02 | 1 | 0 | 1 | no | superseded by DynAnchorBot/ |
| `VolRangeForecaster/` | **CORE** | Original Python vol/range forecaster + the M1 parquet cache path many scripts read | .parquet:8, .py:7, .csv:6, .json:6 | 5.82 | 2026-05-29 | 2026-08-11 | 32 | 0 | 110 | path referenced by ~110 files | model superseded by js HAR-800 ladder; dir survives as data path |
| `YieldSpreadBot/` | **BOT** | Yield-spread z-reversion sleeve bot | .py:2 | 0.03 | 2026-07-16 | 2026-07-18 | 2 | 0 | 4 | no (manual MT5) | edge deflated to null 2026-10-17 -> effectively DEAD |
| `Zoo/` | **DEAD** | Readme-only "trading strategy backtests" zoo | .md:2, (none):1, .txt:1 | 0.01 | 2026-06-10 | 2026-06-28 | 3 | 0 | 0 | no | superseded by strategy-lab.html |
| `analysis/` | **RESEARCH** | Study scripts (227 at top level) + output/ (1.28GB of parquet/json results) | .csv:822, .json:778, .md:353, .parquet:243 | 1279.44 | 2026-06-10 | 2026-10-31 | 640 | 388 | 574 (server.js) | no | largest bloat source |
| `archive/` | **DEAD** | Archived pages/scripts | .html:3, .md:1, .py:1, .bak:1 | 0.65 | 2026-06-28 | 2026-09-10 | 4 | 0 | 16 (server.js) | no | archive by design |
| `backfill/` | **CORE** | Event-response / fiscal / surprise history JSON consumed by pages | .json:5 | 4.28 | 2026-09-09 | 2026-10-28 | 7 | 1 | 21 (server.js) | served static |  |
| `backtest-data/` | **RESEARCH** | Line-backtest + decision-lab outputs (Oct) | .gz:35, .json:7, .log:1, .md:1 | 9.03 | 2026-10-18 | 2026-10-27 | 9 | 9 | 9 | served static to pages |  |
| `backtestSystem/` | **RESEARCH** | Python backtest engine for the bots (backfill trade history) | .py:12, .json:2, .example:1, .txt:1 | 0.16 | 2026-05-20 | 2026-10-19 | 114 | 1 | 10 | no |  |
| `bot/` | **BOT** | Level bot (main.py two-speed orchestrator) + hedge bots + modules (cot_filter etc.) | .py:35, .txt:2, .example:1 | 0.39 | 2026-05-15 | 2026-08-25 | 235 | 0 | 122 (server.js) | Railway (start.sh botLevel) | hedge bot dead (5 orphan positions noted Aug) |
| `cog-replication/` | **RESEARCH** | Replicating C.OG lines (G1 tide / G2 GEX / G3 magnet gates) | .md:5, .js:2, .json:1, .py:1 | 0.07 | 2026-07-29 | 2026-10-18 | 12 | 1 | 6 (server.js) | server.js cogShadow job |  |
| `cog-standalone/` | **DEAD** | Standalone COG replay service (own server.js/railway.json) | .json:2, .md:1, .html:1, .js:1 | 0.04 | 2026-07-23 | 2026-07-24 | 5 | 0 | 0 | no | folded into main server (cog-replay.html) |
| `cog/` | **EDUCATION** | COG hub + course-notes lessons | .html:30, .md:1 | 1.71 | 2026-07-26 | 2026-10-24 | 7 | 4 | 8 (server.js) | served static |  |
| `cron-worker/` | **DEAD** | Cloudflare every-minute alert cron worker (May-Jun) | .sqlite:3, .sqlite-shm:3, .sqlite-wal:3, .json:2 | 0.16 | 2026-05-12 | 2026-06-13 | 13 | 0 | 0 | maybe still deployed on CF (separate) | superseded by server.js setInterval schedulers on Railway |
| `css/` | **CORE** | Shared stylesheets | .css:4 | 0.14 | 2026-05-03 | 2026-10-26 | 58 | 1 | 65 (server.js) | served static |  |
| `docs/` | **DOCS** | Strategy/backtest docs (ColezTrades plans, credit signal spec) | .png:17, .md:4 | 2.34 | 2026-06-01 | 2026-07-22 | 7 | 0 | 21 | no | overlaps MD files/ |
| `education/` | **EDUCATION** | Course transcriptions, case studies, slide PNGs (Forecaster Portfolio 86MB PNG) | .json:221, .py:197, .png:160, .md:106 | 174.79 | 2026-07-10 | 2026-10-31 | 198 | 82 | 61 (server.js) | served static | 175MB |
| `fedwatch/` | **CORE** | Fed path / ZQ futures pull (run_daily.bat) | .py:2, .bat:2, (none):1 | 0.03 | 2026-10-05 | 2026-10-29 | 6 | 6 | 5 (server.js) | local bat + server routes | live macro input |
| `fib_atlas_bot/` | **BOT** | Fib Atlas (Asia+Monday range-extension vote) bot v1 | .py:4, .bat:1 | 0.1 | 2026-08-31 | 2026-09-29 | 19 | 0 | 8 | local Windows (start_live_all.bat) | strategy family "died of look-ahead bias" (FORECASTER_SYSTEM_BLUEPRINT) |
| `fib_atlas_bot_v2/` | **BOT** | Fib Atlas bot v2 - fork using local decision engine | .py:4, .bat:1 | 0.1 | 2026-09-18 | 2026-09-29 | 9 | 0 | 6 | local Windows (start_live_all.bat) | fork of v1 |
| `fib_local_decision_engine/` | **BOT** | Fib Atlas local zone-decision server (:4501) | .mjs:5, .md:1, .log:1, .json:1 | 0.04 | 2026-09-18 | 2026-09-27 | 7 | 0 | 7 | local Windows | fork of local_decision_engine |
| `forge/` | **RESEARCH** | Pre-registrations + candle-to-strategy harness (Python) | .md:205, .py:83, .json:14, .csv:6 | 18.45 | 2026-08-13 | 2026-10-31 | 367 | 320 | 409 (server.js) | no | the Oct research engine |
| `js/` | **CORE** | ~1000 ES modules: engines, cores, tests used by server.js and pages | .js:619, .mjs:410, .json:8, .txt:3 | 19.03 | 2026-05-03 | 2026-10-31 | 2445 | 486 | 816 (server.js) | Railway (server.js) |  |
| `levelEngine/` | **LAYER** | Level-touch base rates + live_watch | .json:60, .py:14, .csv:3, (none):1 | 0.82 | 2026-08-09 | 2026-09-12 | 13 | 0 | 7 (server.js) | Railway (start.sh botLevelTouch) |  |
| `local_decision_engine/` | **BOT** | Vote Atlas v3 local zone-decision server (:4500) | .mjs:6, .md:1, .json:1, .bat:1 | 0.05 | 2026-09-18 | 2026-09-27 | 14 | 0 | 17 (server.js) | local Windows |  |
| `logs/` | **JUNK** | Committed bot journals/state/logs (gold_v2 state, bidask fetch logs) | .log:5, .jsonl:1, .json:1, .csv:1 | 6.45 | 2026-05-26 | 2026-10-20 | 123 | 1 | 20 (server.js) | read by server/bot-config | gitignore partially covers it |
| `macro-regime-conditional/` | **RESEARCH** | Macro-regime-conditional equity backtest (python) | .md:1, .py:1 | 0.07 | 2026-06-14 | 2026-10-17 | 5 | 1 | 2 (server.js) | server refs | Q6 macro-equity |
| `motif_bot/` | **BOT** | Touch-motif execution bot (MT5) | .py:3 | 0.06 | 2026-09-16 | 2026-09-23 | 14 | 0 | 5 | no (manual MT5) |  |
| `nt8_bridge/` | **CORE** | NinjaTrader 8 ZMQ bridge to record/backfill futures data | .py:4, .cs:3, .bat:1, .csproj:1 | 0.04 | 2026-10-08 | 2026-10-29 | 2 | 2 | 0 | local | data capture (Oct) |
| `oi_bot/` | **BOT** | OI gamma regime-switch bot | .py:6 | 0.12 | 2026-07-14 | 2026-10-05 | 22 | 2 | 12 | no (manual MT5) | never backtested (OI review H2) |
| `oi_conf_bot/` | **BOT** | OI bot twin: trades OI level x vol line coincidences | .py:2 | 0.07 | 2026-10-16 | 2026-10-19 | 2 | 2 | 3 | no (manual MT5) | identical executor to oi_bot |
| `oi_recon/` | **CORE** | CME OI auto-fetch reconnaissance / as-of checks | .mjs:19, .tsv:15, .py:15, .json:5 | 0.44 | 2026-07-29 | 2026-10-23 | 57 | 10 | 17 (server.js) | Dockerfile copies it; server.js | shadow key only (OI review H6) |
| `oi_research_book/` | **RESEARCH** | OI/GEX research book (preregs, results, 66MB parquet) | .csv:76, .parquet:68, .py:30, .md:22 | 77.64 | 2026-09-08 | 2026-10-27 | 30 | 13 | 30 (server.js) | served static |  |
| `oi_vol_bot/` | **BOT** | OI bot twin: trades reachable OI levels | .py:2 | 0.07 | 2026-10-15 | 2026-10-15 | 2 | 2 | 3 | no (manual MT5) | identical executor to oi_bot |
| `pine/` | **LAYER** | TradingView Pine indicators exporting site levels | .pine:12 | 0.39 | 2026-05-22 | 2026-10-30 | 67 | 31 | 23 (server.js) | manual | 31 commits in Oct |
| `plans/` | **DOCS** | Build plans, register, data spec (RESEARCH_REGISTER.md) | .md:34, .json:1, .png:1 | 0.61 | 2026-06-10 | 2026-10-31 | 277 | 276 | 42 (server.js) | no | 276 commits in Oct |
| `portfolioBacktest/` | **RESEARCH** | Python portfolio backtest (Jun) | .example:1, .md:1, .py:1, .txt:1 | 0.41 | 2026-06-08 | 2026-08-21 | 13 | 0 | 39 | imported by analysis scripts |  |
| `pylego/` | **BOT** | Shared Python "bricks" (broker, risk_guard, sizing) for all bots | .py:79, .json:5 | 0.82 | 2026-06-29 | 2026-10-30 | 100 | 3 | 75 (server.js) | imported by bots |  |
| `range_line_bot/` | **BOT** | Range-line (section 13) range-extension bot | .py:6 | 0.08 | 2026-06-30 | 2026-10-24 | 20 | 2 | 2 | no (manual MT5) | confluence_min drift vs validated book (Aug) |
| `safety/` | **BOT** | Trading safety layer A1 (kill switch, risk gate) | .py:6, .md:1 | 0.04 | 2026-06-27 | 2026-06-27 | 1 | 0 | 3 | no | 1 commit; partly reimplemented in pylego/risk_guard |
| `scratchpad/` | **JUNK** | Committed scratch logs/scripts (173 files) | .log:129, .py:27, .png:12, .txt:2 | 1.81 | 2026-09-23 | 2026-10-31 | 33 | 32 | 23 | no | should be gitignored |
| `scripts/` | **CORE** | Tooling: data fetch, builders, CI checks (599 files) | .py:398, .mjs:183, .sh:5, .bat:5 | 4.54 | 2026-05-31 | 2026-10-31 | 456 | 329 | 159 (server.js) | some via server/CI |  |
| `theory-lab/` | **EDUCATION** | 378 lessons + micro decks + 115MB of .m4a audio | .html:396, .m4a:187, .js:21, .css:3 | 141.39 | 2026-07-26 | 2026-10-29 | 343 | 206 | 57 (server.js) | served static | 141MB |
| `vix-vol-carry/` | **RESEARCH** | VIX vol-carry strategy backtest (P8) | .md:1, .png:1, .py:1 | 0.45 | 2026-06-18 | 2026-06-19 | 5 | 0 | 2 (server.js) | server route |  |
| `vmcResearch/` | **RESEARCH** | VuManChu as a state layer | .py:40, .txt:14, .md:2, .csv:1 | 0.33 | 2026-09-05 | 2026-10-30 | 2 | 1 | 2 | no | null |
| `volatilityExhaustion/` | **RESEARCH** | Volatility-exhaustion measurement study + MARKET_STATE_FINDINGS | .png:78, .py:46, .json:12, .md:3 | 6.76 | 2026-07-15 | 2026-10-02 | 39 | 1 | 30 (server.js) | server refs |  |
| `volatility_bot/` | **DEAD** | Per-line vol-forecast fade bot v1 | .py:10 | 0.12 | 2026-06-29 | 2026-07-20 | 27 | 0 | 5 | no | superseded by volatility_bot_v2/v3 (fades at lines: banked null) |
| `volatility_bot_v2/` | **BOT** | Vote Atlas v2 (Level Atlas vote portfolio) bot | .py:8, .bat:1 | 0.1 | 2026-08-28 | 2026-09-27 | 22 | 0 | 13 (server.js) | local Windows (start_live_all.bat) | Vote Atlas "died of look-ahead bias" |
| `volatility_bot_v3/` | **BOT** | Vote Atlas v3 bot using local decision engine | .py:8, .bat:1 | 0.11 | 2026-09-18 | 2026-09-27 | 12 | 0 | 4 | local Windows (start_live_all.bat) | near-copy of v2 |
| `vumanchuLab/` | **RESEARCH** | VuManChu/WaveTrend direction lab | .py:26, .json:3, (none):1, .md:1 | 7.18 | 2026-07-30 | 2026-08-03 | 11 | 0 | 12 (server.js) | server route | banked null (random-walk reproduces cycle) |
| `wt-m6/` | **JUNK** | Stray committed git worktree gitlink (mode 160000, no .gitmodules), added 2026-10-31 | (none):1 | 0.0 | 2026-10-31 | 2026-10-31 | 1 | 1 | 0 | no | delete |
| `DATA_RECONCILIATION.md` | **DOCS** | Data reconciliation notes (Aug 24) | .md | 0.02 | 2026-08-24 | 2026-08-24 | 1 | 0 | 1 | no | misplaced at root |
| `Dockerfile` | **CORE** | Railway build (Node + Python) |  | 0.0 | 2026-08-17 | 2026-09-15 | 3 | 0 | 1 | Railway |  |
| `INDEX_DECOM_QUESTIONS.md` | **DOCS** | Index decommission questions | .md | 0.01 | 2026-08-24 | 2026-08-24 | 1 | 0 | 0 | no | misplaced at root |
| `OI System Quant Review Aug 2026.md` | **DOCS** | OI desk quant review | .md | 0.04 | 2026-08-25 | 2026-08-25 | 1 | 0 | 0 | no | misplaced at root |
| `PER_PAIR_VIEW_PROPOSAL.md` | **DOCS** | Per-pair view proposal | .md | 0.02 | 2026-08-24 | 2026-08-24 | 1 | 0 | 0 | no | misplaced at root |
| `Procfile` | **CORE** | web: bash start.sh |  | 0.0 | 2026-05-13 | 2026-06-01 | 2 | 0 | 0 | Railway |  |
| `_atlas_run_mod.mjs` | **JUNK** | Scratch atlas runner committed today | .mjs | 0.11 | 2026-10-31 | 2026-10-31 | 1 | 1 | 0 | no |  |
| `_controlled_out.log` | **JUNK** | Stray run log | .log | 0.0 | 2026-09-18 | 2026-09-18 | 1 | 0 | 0 | no |  |
| `_idx_asia_job.json` | **JUNK** | Stray job state | .json | 0.0 | 2026-09-18 | 2026-09-18 | 1 | 0 | 0 | no |  |
| `_idx_asia_retry.json` | **JUNK** | Stray job state | .json | 0.0 | 2026-09-18 | 2026-09-18 | 1 | 0 | 0 | no |  |
| `_idx_monday_job.json` | **JUNK** | Stray job state | .json | 0.0 | 2026-09-18 | 2026-09-18 | 1 | 0 | 0 | no |  |
| `_idx_monday_retry.json` | **JUNK** | Stray job state | .json | 0.0 | 2026-09-18 | 2026-09-18 | 1 | 0 | 0 | no |  |
| `_indices_pilot.log` | **JUNK** | Stray run log | .log | 0.0 | 2026-09-18 | 2026-09-18 | 1 | 0 | 0 | no |  |
| `_severity_out.log` | **JUNK** | Stray run log | .log | 0.0 | 2026-09-18 | 2026-09-18 | 1 | 0 | 0 | no |  |
| `_worker.js` | **CORE** | Original Cloudflare Pages worker (API proxy + KV); still maintained | .js | 0.17 | 2026-05-03 | 2026-10-30 | 216 | 37 | 9 (server.js) | Cloudflare Pages | 37 commits in Oct; parallel backend to server.js |
| `august action plan.md` | **DOCS** | Aug 22 action plan | .md | 0.03 | 2026-08-22 | 2026-08-22 | 1 | 0 | 0 | no | misplaced at root |
| `august analysis.md` | **DOCS** | Aug 22 full repo review (KEEP/MERGE/PARK/CULL) | .md | 0.05 | 2026-08-22 | 2026-10-25 | 2 | 1 | 1 | no | misplaced at root |
| `calendar_events.csv` | **CORE** | Economic calendar 2014+ (10MB) | .csv | 10.36 | 2026-07-14 | 2026-07-14 | 1 | 0 | 44 (server.js) | server.js / js/calendarLoader.js |  |
| `calendar_events_nasdaq.csv` | **CORE** | Nasdaq calendar scrape | .csv | 0.58 | 2026-10-18 | 2026-10-28 | 4 | 4 | 1 | scripts |  |
| `deepseek August review.md` | **DOCS** | External-LLM review | .md | 0.03 | 2026-08-25 | 2026-08-25 | 1 | 0 | 0 | no | misplaced at root |
| `ff.json` | **JUNK** | API dump (ForexFactory calendar) | .json | 0.01 | 2026-08-20 | 2026-08-20 | 1 | 0 | 4 | scripts read it as fixture |  |
| `hedge_bot.log` | **JUNK** | Hedge bot log (2.1MB) | .log | 2.1 | 2026-06-22 | 2026-06-29 | 15 | 0 | 2 | bot writes it |  |
| `hedge_bot_state.json` | **JUNK** | Hedge bot state (5 orphan positions, Jun 26) | .json | 0.0 | 2026-06-23 | 2026-06-29 | 14 | 0 | 3 | bot writes it |  |
| `hmm.js` | **LAYER** | 2-state daily HMM regime (market-state) | .js | 0.01 | 2026-05-14 | 2026-10-16 | 5 | 1 | 25 (server.js) | server.js levels job (on) | Aug: PARK |
| `hmm5m-train.js` | **LAYER** | Baum-Welch trainer for hmm5m-v2 | .js | 0.01 | 2026-05-18 | 2026-05-28 | 2 | 0 | 2 (server.js) | server.js | scheduler OFF 2026-09-16 |
| `hmm5m-v2.js` | **LAYER** | 4-state learned HMM BULL/BEAR/RANGE/CHOP (canonical per Aug) | .js | 0.01 | 2026-05-18 | 2026-07-18 | 6 | 0 | 10 (server.js) | server.js | scheduler OFF 2026-09-16 (cost) |
| `hmm5m.js` | **LAYER** | 3-state 5m HMM v1 | .js | 0.01 | 2026-05-18 | 2026-07-18 | 5 | 0 | 6 (server.js) | server.js | scheduler OFF 2026-09-16; superseded by hmm5m-v2 |
| `hr.json` | **JUNK** | API dump (hit rates, Aug 19) | .json | 0.46 | 2026-08-20 | 2026-08-20 | 1 | 0 | 1 | oi-dashboard mentions |  |
| `ifo.json` | **CORE** | IFO static seed for KV | .json | 0.0 | 2026-06-27 | 2026-06-27 | 1 | 0 | 6 | index.html |  |
| `kv.js` | **CORE** | KV abstraction | .js | 0.06 | 2026-05-13 | 2026-10-30 | 144 | 35 | 29 (server.js) | server.js |  |
| `levels.js` | **CORE** | Level engine v1 (confluence + signalScore) | .js | 0.03 | 2026-05-13 | 2026-08-24 | 17 | 0 | 98 (server.js) | server.js + pages | Aug: MERGE -> v2 |
| `levelsV2Engine.js` | **LAYER** | Level engine v2 | .js | 0.02 | 2026-06-29 | 2026-10-02 | 17 | 1 | 1 (server.js) | server.js |  |
| `oi_probe.json` | **JUNK** | OI API dump (Jul 29) | .json | 0.89 | 2026-07-29 | 2026-07-29 | 1 | 0 | 0 | no |  |
| `package-lock.json` | **CORE** | npm lock | .json | 0.06 | 2026-05-13 | 2026-10-16 | 8 | 1 | 0 | Docker |  |
| `package.json` | **CORE** | npm manifest | .json | 0.0 | 2026-05-13 | 2026-10-16 | 10 | 1 | 3 (server.js) | Docker |  |
| `path-map.json` | **LAYER** | Forecaster layer-4 path map output | .json | 0.2 | 2026-10-06 | 2026-10-06 | 2 | 2 | 2 | path-map.html | output file at root |
| `railway.json` | **CORE** | Railway deploy config | .json | 0.0 | 2026-05-13 | 2026-08-17 | 3 | 0 | 0 | Railway |  |
| `rd.json` | **JUNK** | API dump (range reference, Aug 20) | .json | 0.01 | 2026-08-20 | 2026-08-20 | 1 | 0 | 12 (server.js) | no |  |
| `regime_bot.log` | **JUNK** | RegimeBot v1 log (May 24) | .log | 0.0 | 2026-05-24 | 2026-05-24 | 2 | 0 | 4 (server.js) | server reads bot/regime_bot.log, not this |  |
| `regime_classifier_gold_mtf.png` | **JUNK** | Chart output of regime_classifier_mtf.py | .png | 1.95 | 2026-08-01 | 2026-08-01 | 1 | 0 | 0 | no |  |
| `regime_classifier_mtf.py` | **RESEARCH** | One-off MTF regime classifier (Aug 1) | .py | 0.02 | 2026-08-01 | 2026-08-01 | 1 | 0 | 1 | no | orphan |
| `regime_statistics_gold_mtf.png` | **JUNK** | Chart output | .png | 0.18 | 2026-08-02 | 2026-08-02 | 1 | 0 | 0 | no |  |
| `remaining-travel.json` | **LAYER** | Forecaster layer-5 multipliers | .json | 0.1 | 2026-10-08 | 2026-10-08 | 1 | 1 | 1 | analysis/pathmap | output file at root |
| `requirements.txt` | **CORE** | Python deps for Railway bots | .txt | 0.0 | 2026-06-01 | 2026-08-14 | 3 | 0 | 7 | Docker |  |
| `results.json` | **JUNK** | Stray z-score backtest result (Jun 9) | .json | 0.0 | 2026-06-09 | 2026-06-09 | 1 | 0 | 134 | no |  |
| `scratch_capacity_test.mjs` | **JUNK** | Scratch test | .mjs | 0.0 | 2026-09-05 | 2026-09-05 | 1 | 0 | 0 | no |  |
| `server-analyser.js` | **JUNK** | Stub/scratch server (Jun 27) | .js | 0.0 | 2026-06-27 | 2026-06-27 | 1 | 0 | 0 | no |  |
| `server.js` | **CORE** | Express monolith: 41,758 lines, ~752 routes, ~60 schedulers | .js | 2.54 | 2026-05-13 | 2026-10-31 | 1432 | 223 | 122 | Railway |  |
| `start.sh` | **CORE** | Railway supervisor: 8 bots + node server | .sh | 0.0 | 2026-06-01 | 2026-09-17 | 11 | 0 | 9 (server.js) | Railway |  |
| `start_live_all.bat` | **BOT** | Windows launcher: fib atlas v1/v2, vote atlas v2/v3 + local engines | .bat | 0.01 | 2026-09-27 | 2026-09-27 | 1 | 0 | 1 | local Windows |  |
| `stop-risk.json` | **LAYER** | Layer-7 loss-given-stop table | .json | 0.02 | 2026-10-06 | 2026-10-06 | 1 | 1 | 3 | forecaster.html | output file at root |
| `test` | **JUNK** | Cron worker output dump (May 14), no extension |  | 0.0 | 2026-05-14 | 2026-05-14 | 1 | 0 | 2316 (server.js) | no |  |
| `tools-preview.mjs` | **JUNK** | Scratch | .mjs | 0.0 | 2026-08-24 | 2026-08-24 | 1 | 0 | 0 | no |  |
| `v2_decision_log.json` | **JUNK** | Snapshot input for live_parity study | .json | 0.97 | 2026-09-22 | 2026-09-22 | 1 | 0 | 1 | analysis script arg |  |
| `v3_decision_log.json` | **JUNK** | Snapshot input for live_parity study | .json | 0.02 | 2026-09-22 | 2026-09-22 | 1 | 0 | 1 | analysis script arg |  |
| `vf.json` | **JUNK** | API dump (vol forecast, Aug 20) | .json | 0.03 | 2026-08-20 | 2026-08-20 | 1 | 0 | 0 | no |  |
| `vfr.json` | **JUNK** | API dump (vfr research) | .json | 0.53 | 2026-08-20 | 2026-08-20 | 1 | 0 | 0 | no |  |
| `volatility-classifier-backtest.mjs` | **RESEARCH** | One-off volatility classifier backtest (Aug 1) | .mjs | 0.02 | 2026-08-01 | 2026-08-01 | 1 | 0 | 0 | no | orphan |
| `volatility_classifier_eurusd_results.png` | **JUNK** | Chart output | .png | 0.21 | 2026-08-01 | 2026-08-01 | 1 | 0 | 0 | no |  |
| `volatility_classifier_standalone.py` | **RESEARCH** | One-off vol classifier (Aug 1) | .py | 0.02 | 2026-08-01 | 2026-08-01 | 1 | 0 | 0 | no | orphan |
| `vp2.json` | **JUNK** | 9.2MB Vote Atlas v2 trade-list snapshot | .json | 9.21 | 2026-09-19 | 2026-09-19 | 1 | 0 | 5 | analysis script arg |  |

**Root HTML pages (244):** not listed row by row. Only 2 have no inbound reference (`forecaster-system.html`, `level-atlas-vote-portfolio-v2.html`), and 21 are missing from `hub.html`/`js/commandHub.js`. 136 have not been touched since Sep 1. Prefix families: forecast-* 12, vol-* 9, cog-* 7, system-* 6, level-* 6, asia-* 6. Versioned twins: vol-forecast ×3, vol-backtest ×2, oi-dashboard ×2, hedge-signals ×2, trend ×2, zscore ×2, level-atlas-vote-portfolio ×2, nq-qmr-backtest + .legacy. There are 9 competing "home" dashboards: index.html (Command Centre, the catch-all route), indexv2.html (The Board), today.html (1.1MB, 63 commits in Oct, the de facto main), Todayv3.html, desk.html, terminal.html, hub.html, market-view.html, analytics-desk.html.

### Duplication families

| family | members | state / what supersedes |
|---|---|---|
| **Regime classifiers / bots** | hmm.js, hmm5m.js, hmm5m-v2.js (+train), regime_classifier_mtf.py, volatility_classifier_standalone.py, js/regimeCore.js, macro-conditioner; bots RegimeV2/V4/V7 (+ bot/regime_bot.py v1), RegimeOptimizer | Aug count: "seven regime classifiers, four live regime bots". Canonical: V7 (not launched); live: V2 (on Railway, HMM feed off). |
| **Vol-line bots** | volatility_bot → volatility_bot_v2 → volatility_bot_v3 | v1 retired "left running until the owner stops it"; v2 and v3 both launched by start_live_all.bat; v3 = v2 + local decision engine. |
| **Fib Atlas bots** | fib_atlas_bot, fib_atlas_bot_v2 | v2 is a fork that swaps the plan source; both launched. |
| **Local decision engines** | local_decision_engine, fib_local_decision_engine | Deliberate sideways fork ("Option A"), same express skeleton. |
| **OI bots** | oi_bot, oi_conf_bot, oi_vol_bot | "Identical executor", only the plan key differs. Should be one bot with a `--plan` flag. |
| **Gold / confluence bots** | Gold, GoldV2, ConfluenceBot (+ bot/ level bot) | V1 runs on Railway; V2 and Confluence are manual. Aug also notes "triplicated Gold module trees". |
| **Dyn-anchor** | TradingBot/dyn_anchor_bot.py, DynAnchorBot/dyn_anchor_mt5_bot.py | Paper OANDA → MT5. TradingBot is dead. |
| **Decision engines** | DecisionEngine/, Trade_Decision_Engine/, js/globalReadCore.js, local_*_decision_engine | Global Read is the current "one read". |
| **Level engines** | levels.js (v1), levelsV2Engine.js, levelEngine/, js/structural-fibs etc. | Aug: "six level engines"; v1 to be merged into v2. |
| **Backends** | server.js (Railway) and _worker.js (Cloudflare, 37 commits in Oct) | Two parallel API backends kept in sync by hand. |
| **Docs homes** | MD files/ (202), plans/ (36), forge/ (preregs), docs/, root *.md, Chatgpt/ | Five places for design docs. |
| **Liquidity** | GlobalLiquidity/, global-liquidity, liquidity-pulse, liquidity-gate, liquidity-net-regression | "Four net-liquidity computations". |
| **Dashboards** | 9 home pages (above) | today.html won in practice. |

### Repo weight (the 1.9GB)

- Working tree 1.9GB, with **1,954MB tracked at HEAD across 8,699 files**. Nothing is untracked or ignored, so everything on disk is committed. `.git` is 999MB: a `blob:none` partial clone whose local packs hold almost exactly the HEAD blobs (8,817 blobs, 2,051MB raw / 1,039MB packed). GitHub reports the full repo at **~1.75GB packed** (`gh api repos/... .size` = 1,745,394 KB), so roughly 0.7GB more sits in history-only blobs (rewritten JSON/parquet outputs).
- **By directory:** `analysis/` **1,279MB (65%)**, education/ 175MB, theory-lab/ 141MB, oi_research_book/ 78MB, AnalogML/ 67MB, RegimeOptimizer/ 46MB, root files 43MB, js/ 19MB, forge/ 18MB.
- **By type:** **.parquet 823MB** (319 files; 757MB in analysis/output, 66MB in oi_research_book/data), **.json 523MB** (1,556 files, e.g. daily_open_retest_study.json 47.6MB, dynamic_hl_level_study.json 34.8MB, AnalogML motif export 15.5MB), .csv 167MB, **.png 127MB** (86MB are slide images in education/forecaster-portfolio-case-study), **.m4a 115MB** (theory-lab/audio), .pkl 28MB + .db 17MB (RegimeOptimizer cache/results), .npz 17MB, .log 7MB (294 files).
- **Largest single files:** line_touch_wide_scan/features.parquet 99.6MB, live_range_features/features.parquet 96.3MB, live_range_history/hours.parquet 52MB, daily_open_retest_study.json 47.6MB, live_range_history/hours_ship.parquet 42.4MB, vf3_stage_b/part1_lines.parquet 39.9MB.
- **Largest analysis/output dirs:** line_touch_wide_scan 137MB, live_range_history 123MB, live_range_features 92MB, level-atlas-vote-trades 78MB, rates_residual 69MB, live_range_confluence 58MB, cog_video_0918 58MB.
- `.gitignore` already excludes M1 parquet caches for VolRangeForecaster/vmcResearch/AnalogML, but **not** `analysis/output/**/*.parquet`, the theory-lab audio, education PNGs, `RegimeOptimizer/.cache`, `scratchpad/` or root `_*.log`/`_*.json`. Moving these to R2 (which the repo already uses) or Git LFS would remove about 1.3GB from HEAD. Shrinking history would need a filter-repo rewrite.
