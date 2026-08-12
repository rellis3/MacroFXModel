# Lego Utilisation Review — July 2026

> **The question this answers:** across every brick in `LEGO_MODULES.md`, every
> main page/engine, and the nine live bots — where are we *not* using the bricks
> to their full potential, and where have newer bricks built better analysis
> that an older bot/page should adopt?
>
> Method: full read of `LEGO_MODULES.md` + `PYTHON_LEGO.md`, an import-level
> grep audit of every brick's real consumers, a per-bot audit of all nine live
> bots, and a page/engine audit of the main surfaces (Vol Forecaster v2, Daily
> Brief, Gold zones, TDE, the range/forecast engines). Cross-checked against
> `PLATFORM_REVIEW_2026-07.md` and the commit log to 2026-07-18 so already-fixed
> items are not re-flagged.
>
> **Honesty note (working agreement):** everything below is an
> *infrastructure* finding — adopting a brick removes drift risk and makes
> numbers comparable; it does not create edge. Where a finding touches a
> validated edge (the range-line/§13 book, the vol book), the recommendation is
> explicitly "re-run the study before changing anything live."

---

## 0. Executive scorecard

| Area | State |
|---|---|
| **Best brick citizens** | TDE (`featureState.js` → `levelSources` + `confluence-core` + `statsCore` + `forecastCore`), the per-line book (`perLineStrategy` + `forecastAnalyserStore` → `portfolioStats`/`deflatedSharpe`/MC), and the four plan-consuming bots (Volatility, Range-Line, OI Gamma, Yield-Spread) |
| **Biggest under-adoption (JS)** | `indicatorCore` — **2 importers vs ~16 private ATR/ADX/RSI/EMA copies**; two parallel stats ecosystems (`statsCore` vs the `nasdaqTransforms` fork feeding the whole COG gate chain) |
| **Biggest under-adoption (Python)** | Gold V1 and Backtest bots: **zero pylego**; MacroFX V1: one brick despite a ready template in its own `bot/regime_bot.py`; ~11 files still carry private `_PIP_SIZES` despite a golden-tested shared table |
| **Newest analysis not yet rolled out** | `sharpeStdError` + `minTrackRecordLength` (built 2026-07-17, on ONE card); `portfolioStats` as the OOS acceptance number (still only the per-line book); stop/exit/day-type studies scoped to the forecast analyser only |
| **Weakest surface** | The gold stack — **three parallel private zone engines** (Gold/, GoldV2/, ConfluenceBot/ carry bit-identical module copies) + ad-hoc inline metrics, no `confluence-core`/`levelSources`/`backtestStats` |
| **Deliberate, do-not-"fix" items** | live-forecaster vs book σ drift (`VOL_ESTIMATOR_DRIFT.md`), the two chandelier rules, vol-sizing overlay (validated null), naked levels (validated dilutive), MVE isolation |

---

## 1. The nine bots — brick usage tier list

The bots split cleanly into two tiers.

### Tier 1 — assembled from bricks, consume a frozen server plan (the target pattern)

| Bot | Plan artifact (JS producer) | pylego stack | Gaps |
|---|---|---|---|
| **Volatility** (`volatility_bot/`) | `volatility_bot_plan` ← `volatilityBotProducer` (σ via `volSigmaSeries`, bit-identical to the book) | kv, sizing, risk_guard, quotes, broker, costs, **events**, strategy.volatility, instruments, point_values | none significant — **this is the template** |
| **Range-Line** (`range_line_bot/`) | `range_line_bot_plan` ← `rangeLineBotProducer` | full stack + strategy.rangeline + audit log | **no `pylego.events`** — trades through NFP/CPI while the vol bot doesn't |
| **OI Gamma** (`oi_bot/`) | `oi_bot_zones` ← `server.js buildOIZones` | full stack | **no `pylego.events`**, **no audit-log key** (vol/range-line both have one), private Telegram sender |
| **Yield Spread** (`YieldSpreadBot/`) | `yield_spread_plan` ← `yieldSpreadProducer` | kv, sizing, risk_guard, quotes, broker, instruments, point_values | **no `pylego.events`**, **no `pylego.costs`** (only plan bot without a slippage model), no audit-log key, private Telegram |

**Adoption ask #1 (cheap, high-value): bring the other three plan bots up to the
volatility bot's spec.** Concretely: `pylego.events` blackout into Range-Line,
OI Gamma and Yield-Spread (the brick + `event_windows_v1` producer already
exist and are proven in `volatility_bot.py:464-556`); `pylego.costs` into
Yield-Spread; an `*_audit_log` KV key into OI Gamma and Yield-Spread. This is
plumbing reuse, not strategy change — no re-validation needed for a
skip-around-events gate that only *removes* trades, though note it makes live
slightly more conservative than each bot's backtest.

### Tier 2 — legacy islands, recompute their own math

| Bot | pylego usage | Private re-implementations (brick exists) |
|---|---|---|
| **Backtest** (`backtestSystem/`) | **zero** | pip table (`mt5_utils.py:15`), KV via urllib, own KillSwitch/sizing (`risk.py`), full private indicator set (`indicators.py`: EMA/ATR/RSI/ADX), and a chandelier that `config.py:206` *admits* "mirrors `pylego.strategy.rangeline.chandelier_stop`" |
| **MacroFX V1** (`bot/main.py`) | `instruments.pip_sizes_for` only | in-file `RiskGuard` class (`main.py:608`) vs `pylego.risk_guard`; private KV, Telegram, ATR; siblings re-declare `_PIP_SIZES` 5× (`modules/oi_walls.py:3`, `modules/confluence.py:4`, `backtest.py:56`, `hedge_bot.py:63`, `position_hedge_bot.py:61`) |
| **Regime V7** (`RegimeV7/`) | `events` only | private `_PIP_SIZES` (`:116`), private KV/Telegram/sizing/ATR, bespoke simplified `RiskGuardV7` (`:800`) |
| **Gold V1** (`Gold/`) | **zero** (GoldV2: events only) | private KV, ATR ×4 sites, sizing, journal, inline Sharpe (`optimiser.py:162`) |
| **Confluence** (`ConfluenceBot/`) | instruments, point_values, sizing | private KV (`main.py:315,327`), private ATR ×5 sites, **no RiskGuard, no event gate** |

**Adoption ask #2: `pylego.risk_guard` into every live Tier-2 bot.** The
drawdown-lockout brick is built, tested, and running in four bots; MacroFX V1
and Regime V7 run private variants (V7's is "simplified — no per-pair
cooldown") and Gold V1 / Confluence / Backtest have **none**. A live bot
without a shared, persisted DD lockout is the single riskiest gap in this
review. `bot/regime_bot.py:53-57` is the in-repo migration template.

**Adoption ask #3: retire the ~11 private `_PIP_SIZES` dicts.**
`pylego/instruments_test.py:17-43` already golden-tests that the shared table
reproduces every bot's inline values — the equivalence is *proven*, the
literals just never got deleted. Laggards: RegimeV7 `:116`, RegimeV4 `:97`,
RegimeV2 `:75` + `backtest_v3.py:90`, DynAnchorBot `:94`, `bot/hedge_bot.py:63`,
`bot/backtest.py:56`, `bot/utils/sl_tp_engine.py:9`, `bot/modules/confluence.py:4`,
`bot/modules/oi_walls.py:3`, `backtestSystem/mt5_utils.py:15`. Remember
`_PIP_VALUES` has **already drifted** (EUR/JPY 6.5 vs 9.0 — `PYTHON_LEGO.md`),
which is exactly the failure this table exists to prevent.

**Adoption ask #4: collapse the triple-copied gold/confluence modules.**
`Gold/modules/`, `GoldV2/modules/` and `ConfluenceBot/modules/` carry
near-bit-identical copies of `session_engine._atr`, `vumanchu._ema`,
`htf_bias._ema` (e.g. `session_engine.py:102` is identical in all three). One
shared `pylego` indicator/session module (or GoldV2's modules imported by the
other two) removes two whole copies. This is the Python mirror of the JS
`indicatorCore` problem below.

---

## 2. Main pages & engines

### Vol Forecaster v2 — sound, with one *documented, deliberate* drift
`vol-forecast-v2.html` is a thin front-end; `js/volForecast.js` (the live
forecaster) is deliberately self-contained. The known issue is the
estimator-by-estimator migration of the live forecaster away from the book σ
(`forecastCore.volSigmaSeries`) — fully written up in
`VOL_ESTIMATOR_DRIFT.md`, deferred on purpose because the per-line book (and
therefore the bot plan) must stay bit-identical to the σ it was learned on.
**No action beyond what the drift doc already schedules** (re-bake + OOS A/B
when the book is next refreshed). One caveat worth knowing: `forecastCore.js:7-9`
still *claims* to be the single source of truth — the comment is now
aspirational and should be softened to point at the drift doc.

### Daily Brief — clean
`computeDailyBrief()` reads the **live** forecaster σ (not the drifted book σ),
anchors to London midnight, no metric re-implementation. Only finding:
**`brief-config.html` is one of just two root pages not linked from
`index.html`** (the other is `backtest-monitor.html`). Add both to the
Dashboard.

### Gold zone processing — the weakest surface in the audit
Three parallel private zone stacks, none on the modern bricks:
1. `Gold/modules/fib_engine` + `confluence_scorer` (Python, live).
2. `GoldV2/modules/level_matrix` (Python, parallel edition).
3. `js/gold-app.js` → legacy stateful `confluences.js` — **not**
   `confluence-core.js`, the pure brick that TDE and `asiaRangeEngine` adopted.

Plus ad-hoc analysis code the bricks already own:
- `gold-backtest-worker.js:344-385` — inline Sharpe/winRate/PF/CAGR (named
  offender in `metricsCore.js`'s own header).
- `gold-lab-worker.js:442` — inline winRate.
- `gold-model.js:427-435` — private rolling z-score (`statsCore.rollingZScore`
  exists precisely for this).

**Adoption ask #5:** point the gold JS workers at `metricsCore`/`backtestStats`
and `statsCore` (pure win, changes no strategy), and treat the Python
`modules/` unification (ask #4) as the structural fix. Candidate bricks
P12/P13/P14 in `LEGO_MODULES.md §2` (volume profile, pivots/VWAP anchors,
confluence scorer) are exactly this gap already mapped — this review just
confirms they're still the right next extractions.

### TDE — best-in-class, one inherited caveat
`featureState.js` imports the modern stack end-to-end (`levelSources`,
`confluence-core`, `statsCore`, `forecastCore`, `dayTypeCore`,
`instrumentRegistry`, `rangeLineAnalyser.buildRangeLadder`). Credit context is
correctly **logged-but-inert** until a promoted fit earns weights. Two notes:
- TDE sources σ from `forecastCore.volSigmaSeries`, i.e. the *book* σ — fine
  and consistent with the bot plan, but worth remembering it is not the live
  forecaster's σ.
- The shadow book has been accumulating rows; the deliberately deferred step
  ("a fit on the accumulated shadow rows") is the honest next move for TDE —
  validation of what exists, not new surface.

### Range/forecast engines — a clean split
- **Modern honest stack (hold others to this standard):** `perLineStrategy` +
  `forecastAnalyserStore` → `summarizeTrades`, `portfolioStats`,
  `deflatedSharpe`, block-bootstrap MC, MTM drawdown. Backs
  `forecast-analysis.html` and `forecast-book-report.html`.
- **`asiaRangeEngine.js`** — strong citizen (13+ brick imports, no inline
  metrics found).
- **`rangeFibEngine.js`** — the laggard: inline **√n "total-sample" Sharpe**
  (`:479`, not annualised — incomparable to every other card), inline
  PF/winRate/additive-DD, hard-coded `PIP_SIZE` map (`:38`) with the gold pip
  at 0.1 vs the registry's 1.0 (the four-way gold-pip divergence flagged in
  `PLATFORM_REVIEW_2026-07.md §2.4`).

### Dashboards & stale pages
- Superseded-but-live pairs: `vol-forecast.html`→v2, `hedge-signals`→v2,
  `zscore-backtest`→`zscore-v2`, `trend`→`trend-v2`,
  `system-fx-carry`→`system-fx-carry-factor`. Consider a "legacy" banner or
  section on `index.html` so a stale card is never mistaken for the current
  number.
- Three dashboards coexist (`index.html` canonical, `indexv2.html`,
  `hub.html`) — supersession ambiguity worth resolving once.

---

## 3. Brick-level adoption audit (JS)

Real import counts, from grep — not the registry's aspiration.

### 3.1 `indicatorCore` — the biggest gap in the codebase
**2 importers** (`volLevelAlertCore`, `weeklyVolBacktestEngine` — which imports
`adxWilder` but still re-inlines its own ATR/EMA) versus **~16 files with
private ATR/ADX/RSI/EMA**: `hmm5m.js:38,54`, `hmm5m-v2.js:66,82`,
`backtest-engine.js:46-235` (a full shadow indicator library),
`rangeBiasCore.js:23-146`, `range-bias.js:630`, `utils.js:239,255`,
`nasdaqTransforms.js:70-240`, `weeklyVolBacktestEngine.js:146,163`,
`gold-lab-worker.js:349`, `analysis-worker.js:105`, `journal-app.js:1975`,
`levels.js:325`, `server.js:548`, `volBacktestM1Engine.js:528` (read-only, leave).

This matters beyond cleanliness: `PLATFORM_REVIEW_2026-07.md §1.4` found the
shared ADX brick (and its golden source `hmm5m.js`) shifted one bar into the
future. **Because adoption is so low, fixing the brick fixes almost nothing
downstream** — the copies must be retired for the fix to propagate. Priority
order: `rangeBiasCore` (feeds live entry grading), `backtest-engine`,
`hmm5m`/`hmm5m-v2` (fix + adopt together per the platform review), then the
long tail.

### 3.2 Two parallel stats ecosystems
`statsCore` has healthy adoption in the newer engines (carry, yield-coupling,
trend, rank-IC, credit, TDE) — but `nasdaqTransforms.js` is a complete second
stats library (`mean`/`std`/`rollingPercentile`/`rollingZScore` plus its own
EMA/ATR/ADX), and the **entire COG gate chain** (`nasdaqTrendEngine`,
`cogThreshold1Gate`, `cogDirectionGate`, `cogLiquidityGate`,
`cogLiquidityGate1B`, `cogExecutionTrigger`) imports from the fork.
`statsCore.js` even documents that its `rollingZScore` is bit-faithful to the
fork — the equivalence is established; the collapse never happened. Five more
one-off inline z-scores: `globalLiquidityEngine.js:77`,
`macroEquityEngine.js:59`, `hmm5m.js:102`, `hmm5m-v2.js:129`,
`sys-backtest-shared.js:29`, plus `compass.js:226` and
`creditLeadLagEngine`'s inline `spearman` (registry-documented).

### 3.3 `metricsCore` / `backtestStats` — good new-engine adoption, legacy holdouts
~18 engines import `metricsCore` (all the newer fade/trend/credit engines).
Holdouts with full private metric suites: `macroEquityEngine.js:313-380`,
`nasdaqPerformance.js:65-356`, plus inline Sharpe in `zscoreSpreadEngine:251`,
`rangeFibEngine:479`, `backtest-worker:1207-1236`, `gold-backtest-worker:325-348`,
`macroDirectionCore:129`, `yieldSpreadCore:83`, `sys-backtest-shared:53-69`.
Consequence: **the same word "Sharpe" means at least three different formulas
across cards** (per-trade-annualised, daily×√252, √n-total-sample) — the
platform review's §2.3 finding, still true.

### 3.4 `instrumentRegistry` — server/engine layer adopted, browser layer forked
12+ modern importers, but the whole browser render layer rides
`utils.js:162 getPipSize()` branch logic, and hard-coded `PIP_SIZE` maps
survive in `server.js:200` (which *also* imports the registry — it runs both),
`rangeFibEngine.js:38`, `asiaRangeEngine.js:65`, `weeklyVolBacktestEngine.js:71`,
`_worker.js:1920`, `cron-worker/cron-worker.js:22`. The gold-pip 1.0-vs-0.1
four-way split lives here; per the platform review, **decide the gold pip
once** before any mechanical consolidation (a blind rewire silently rescales
gold costs 10×).

### 3.5 Two hand-written 2-state Gaussian HMMs
Root `hmm.js` (regime detection: `server.js`, `levels.js`, `signal.js`,
`asiaRangeEngine`) and `js/creditHmm.js` (credit calm/stress) each implement
Baum-Welch + Viterbi independently. Registry-documented candidate: unify onto
the log-space `creditHmm` core with the observable parameterised. A bug fixed
in one today does not reach the other.

### 3.6 `levelSources` / `levelChart` — good bones, narrow reach
`levelSources` feeds TDE, the range-line analyser/producers, touchFeatures,
profileShapeCore. `levelChart` reached only the newest pages
(`telegram-v2.html`, `forecast-analysis.html`, `forecast-path.html`,
`bot-config.js`, demo). The big level/zone pages (`levels.html`,
`gold-zones.html`, `range-zones.html`, COG/nasdaq pages) still wire private
charts. Every new page should start from `createLevelChart` — that was the
point of the render brick.

---

## 4. Newer analysis built but not yet adopted (the "better bricks" list)

These are the concrete cases where a newer brick produces a *better analysis*
than what an existing bot/page currently shows.

1. **`sharpeStdError` + `minTrackRecordLength`** (`metricsCore`, 2026-07-17).
   On exactly one card (`trendFollowV2Engine`). The registry's own intent is
   "every IS/OOS card" — a card inside its own error bar of zero has shown
   nothing. **Adopt into:** `summarizeSplit` output (one change reaches the
   whole forecast family), the range-line rigor card, yield-spread,
   hedge-v2, zscore-v2. Cheap: both functions take numbers already on every
   card.
2. **`portfolioStats` as the OOS acceptance number.** The CLAUDE.md win
   condition ("beats incumbent on OOS Sharpe") is still judged on
   `summarizeTrades` per-trade Sharpe in most engines, which inflates under
   26-pair concurrency. The honest daily-aggregated alternative exists and is
   proven in the per-line book. **Adopt into:** every pooled multi-pair OOS
   card, and (per the platform review) make it the acceptance gate.
3. **`deflatedSharpe` after any parameter search.** Only 5 importers. Any card
   born from a sweep (QMR optimizer — which still scores on the inflating
   per-trade-annualised Sharpe, `server.js:2302-2305`; estimator A/Bs;
   gate sweeps) should print DSR next to Sharpe.
4. **Stop / exit / day-type studies** (`runStopStudy`, `runExitStudy`,
   `runExitGateSweep`, `runDayTypeStudy`). Built and proven inside the
   forecast-level analyser only. The same questions apply verbatim to the
   **range-fib book** and the **gold backtest** — both currently have no
   exit-rule A/B at all. The bricks are pluggable-pricer by design; wiring
   them to a second book is the intended reuse.
5. **Rank-IC engines** (`rankICEngine` D1 + `rankICLiveEngine` live-score).
   The pattern "does this score actually sort outcomes?" currently grades the
   day-type and live entry scores. Natural next candidates: the gold
   confluence score and the OI-zone score — both are live scores nothing has
   ever graded against realized PnL.
6. **`pylego.events` event gate** — see adoption ask #1. The most
   macro-blind live systems are the three plan bots without it.
7. **Credit bricks' intended consumers** (registry-documented, still open):
   `macroCore` still runs its own inline HY rule instead of `creditCore`;
   `today.html` still lacks the `creditHmm` persistence term.
8. **`profileShapeCore`** — built, tested, **wired into no strategy**. The
   registry's own note: "the selector brick to A/B on the OOS card next." It
   is a selector (lego path), not a knob — a legitimate candidate experiment,
   default expectation null as always.
9. **`m1GapFill`** — only the analyser and `rankICLiveEngine` use it. Any
   backtest page run intraday on a frozen R2 snapshot silently tests stale
   data; the asia-range engine already has the opt-in flag (default off) —
   surfacing that toggle on the backtest pages is a one-line honesty win.
10. **HAR-RV shadow** (`volForecastBench`) — correctly still a shadow; the
    adoption gate (beat the incumbent OOS per asset class) is pre-registered.
    Nothing to do except keep grading the shadow. Listed here so it isn't
    mistaken for a forgotten brick.

---

## 5. Things that look like gaps but are deliberate — do not "adopt"

- **Two chandelier rules** (`volatility_bot/engine.py` vs
  `pylego/strategy/rangeline.py`) — each matches its own validated book's
  exit. Merging silently changes one bot's strategy (registry L246-253).
- **Live forecaster vs book σ drift** — deferred on purpose
  (`VOL_ESTIMATOR_DRIFT.md`); the fix path is re-bake + A/B, not an import swap.
- **Vol-sizing overlay** — validated null 2026-07; stays unwired.
- **Naked-levels feature** — validated dilutive on the FX book; live never
  ships it.
- **MVE** — isolated by design, edge unproven; wiring it anywhere is gated on
  OOS proof.
- **`volBacktestM1Engine` (v1)** — read-only production reference; its inline
  copies are exempt from consolidation.

---

## 6. Prioritised adoption roadmap

Ordered by (risk removed × cheapness). None of this creates edge; items 1–3
remove live-money risk, the rest remove drift/comparability debt.

**P0 — live-money safety (this week)**
1. `pylego.risk_guard` into Gold V1, ConfluenceBot, backtestSystem, MacroFX V1
   (replace the private class), Regime V7 (replace `RiskGuardV7`). (§1 ask #2)
2. `pylego.events` blackout into Range-Line, OI Gamma, Yield-Spread;
   `pylego.costs` into Yield-Spread. (§1 ask #1)
3. Decide the gold pip once (registry 1.0 vs client 0.1), then retire the
   hard-coded `PIP_SIZE` maps + the ~11 Python `_PIP_SIZES` dicts against the
   golden-tested tables. (§1 ask #3, §3.4)

**P1 — one number per concept (next)**
4. Fix the ADX one-bar shift in `indicatorCore` + `hmm5m` together, then
   migrate `rangeBiasCore` / `backtest-engine` / `hmm5m*` onto the brick so
   the fix actually propagates; re-run the regime backtests. (§3.1)
5. Collapse the metric holdouts (`macroEquityEngine`, `nasdaqPerformance`,
   `zscoreSpreadEngine`, `rangeFibEngine`, gold workers, `backtest-worker`)
   onto `metricsCore`/`backtestStats`; adopt `portfolioStats` as the pooled
   OOS acceptance number and stop the QMR optimizer scoring on
   per-trade-annualised Sharpe. (§3.3, §4.2)
6. Add `sharpeStdError`/`minTrackRecordLength` to `summarizeSplit` so every
   IS/OOS card inherits error bars in one change. (§4.1)
7. Collapse the `nasdaqTransforms` stats fork onto `statsCore` (equivalence
   already documented), then the five one-off inline z-scores. (§3.2)

**P2 — structural consolidation (as touched)**
8. Unify the triple-copied Gold/GoldV2/ConfluenceBot Python modules; extract
   the P12–P14 candidate bricks (volume profile, pivots/VWAP, confluence
   scorer) that this gap maps to. (§1 ask #4, §2 gold)
9. One HMM brick (root `hmm.js` ↔ `creditHmm.js`). (§3.5)
10. Wire the exit/stop/day-type study battery to a second book (range-fib or
    gold) and rank-IC the gold/OI live scores. (§4.4, §4.5)
11. Dashboard hygiene: link `brief-config.html` + `backtest-monitor.html` from
    `index.html`; mark superseded v1 pages; resolve the
    `index`/`indexv2`/`hub` triplication. (§2)

---

*Compiled 2026-07-18 from a four-track audit (registry digest, bot audit,
page/engine audit, import grep). File:line references were verified at audit
time; re-verify before mechanical refactors.*
