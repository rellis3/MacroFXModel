# Lego Module Registry — MacroFXModel

> **The central list of every reusable "lego brick" module**: what it owns, where
> it's used, and its build status. This is the durable index referenced by
> `CLAUDE.md` ("The Lego Principle"). The goal of the brick architecture is that
> **backtests, systems and live bots all import the same piece**, so the research
> number and the live behaviour can never silently disagree (the "bit-identical
> port" failure documented in `TRADABILITY_REVIEW.md` / `SYSTEM_ASSESSMENT.md §2.3`).
>
> **How to use this doc**
> - Building something new? Find the brick here and **import it** — never copy.
> - Found duplicated logic? Add it to the *Candidate* tables with file:line
>   evidence, then promote it to *Built* when extracted + tested.
> - Every brick must be **pure, horizon-agnostic where applicable, no-lookahead,
>   and unit-tested on synthetic data** (no network) — see `CLAUDE.md`.
>
> Status legend: ✅ Built & wired · 🟡 Built, adoption in progress · 🔲 Candidate
> (mapped, not yet extracted) · 📄 Documentation-only brick (a contract, not code).
> Risk = damage if the duplicate copies drift apart.

Last updated: 2026-06-27. Maintained as bricks are built.

---

## 1. Built bricks (the baseplate — import these)

### 1a. Pre-existing core (the original baseplate)

| Brick | File | Owns | Imported by | Status |
|---|---|---|---|---|
| Vol/range engine | `js/volBacktestEngine.js` | vol-σ series (HV20/GARCH/Yang-Zhang), `ASSET_PARAMS`, `classifyRegime`, BM/HN band constants (`BM_P50/75`, `HN_P50/75`), `fetchD1` | `forecastCore`, `honestForecastEngine`, `weeklyVolBacktestEngine`, `volBacktestM1Engine`, `server.js` | ✅ |
| Day-type classifier | `js/dayTypeCore.js` | reversion-vs-continuation score (`ESTIMATORS`, `DAYTYPE_PRESETS`, `classifyDayType`, `dayTypeScore`) **+ realized-outcome labeler** (`OUTCOME_LABELERS`, `labelOutcome` — the ground-truth CONTINUATION/REVERSION tag the score is graded against; default `closeVsOcMed` ~50/50) | `forecastCore` (re-exported), `forecastAnalyser` | ✅ |
| Forecast primitive | `js/forecastCore.js` | `computeBands`, `walkBars` (fill walker), `simulateEntry` (the one entry primitive), `selectStrategy`, `volSigmaSeries`, `HORIZONS` | `volBacktestV2Engine`, forecast family | ✅ |
| Honest metrics | `js/honestForecastEngine.js` | `summarize`, `summarizeSplit` (metrics + IS/OOS split) | forecast family | ✅ |
| Touch features | `js/touchFeatures.js` | at-the-moment fade-vs-continuation features (`createTouchFeatures(cfg)` factory + `TOUCH_FEATURES`: approach efficiency/velocity, WaveTrend, **volume climax, candle rejection, round-number proximity**); price + tick-volume proxies, no order-book; config set on import | `forecastAnalyser`; imports `vumanchuCore` | ✅ |
| Per-line strategy | `js/perLineStrategy.js` | per-line confidence engine — `extractTouches`, `buildPolicy` (fade/follow/skip per cell, IS-learned, **after-cost expectancy gate**), `pnlFor` (triple-barrier + honest mark-to-close), `runPerLine` (pooled-IS → per-pair OOS book + equity + trade log + **portfolio** stats + **`survivors`** live-universe block), **`buildSurvivors`** (keep pairs whose OOS net expectancy clears their own spread by a margin, re-aggregate just their daily PnL into an honest portfolio), **`runRigor`** (walk-forward / per-year / cost-sensitivity / IS-vs-OOS) | `forecastAnalyserStore` (orchestrator + routes); imports `metricsCore`, `backtestStats` | ✅ |
| Backtest stats | `js/backtestStats.js` | the standard battery for a trade-PnL series — Sharpe/Sortino/Calmar/CAGR/PF/payoff/win-rate/expectancy/max-DD+duration, **bootstrap CIs**, **Monte-Carlo** drawdown, **`portfolioStats`** (honest daily-aggregated Sharpe ×√252 + vol-targeted CAGR/DD + **Probabilistic Sharpe**); deterministic seeded PRNG | `perLineStrategy`; imports `metricsCore` | ✅ |
| Confluence core | `js/confluence-core.js` | `detectConfluencesCore`, `mergeCrossSessionConfs` (already shared by dashboard + Pine export) | dashboards, Pine export, backtests | ✅ |
| Walk-forward / MC | `js/sys-backtest-shared.js` | walk-forward & Monte-Carlo helpers, `sharpe`, `maxDD` (P-series) | `system-*.html` | ✅ |
| M1 data loader (ref) | `js/volBacktestM1Engine.js` | `loadM1ForPair`, `BT_M1_DIR`, R2/Drive/parquet pipeline — **v1, read-only production** | session-range engines | ✅ (ref) |

### 1b. New bricks extracted in this pass (2026-06-27)

All six are pure, dependency-free, and covered by `js/legoBricks.test.mjs`
(28 synthetic checks, including a **golden test** that proves the metrics brick
reproduces `honestForecastEngine.summarize` bit-for-bit).

| Brick | File | Owns | Replaces copies in | Status |
|---|---|---|---|---|
| **Bar utils** | `js/barUtils.js` | `bisect`, `extractBars`, `resampleTo`, `bodyRange`, `calcATR` (resampled true-range mean), `groupByDate` — the M1 packed-array hot path | `asiaRangeEngine` ✅, `rangeFibEngine` ✅, `confluenceModules` ✅ | ✅ |
| **Stats core** | `js/statsCore.js` | `mean`, `variance`/`stdev` (ddof), `rollingZScore` (array, faithful to nasdaqTransforms), `rollingZAt` (scalar, faithful to hmm5m), `rollingPercentile`, `linregSlope`, `ewma` | `nasdaqTransforms`, `globalLiquidityEngine`, `macroEquityEngine`, `zscoreSpreadEngine`, `hmm5m*` 🔲 | 🟡 |
| **Indicator core** | `js/indicatorCore.js` | `ema`, `trueRange`, `atrWilder` (faithful to hmm5m), `atrEma` (alpha variant), `adxWilder` (faithful to hmm5m), `rsiWilder` | `hmm5m`, `hmm5m-v2`, regime backtests, `range-bias`, `backtest-engine` 🔲 | 🟡 |
| **Metrics core** | `js/metricsCore.js` | `sharpeRatio`, `sortinoRatio`, `calmar`, `maxDrawdownFromPnls`/`FromEquity`, `profitFactor`, `winRate`, `expectancy`, `summarizeTrades` (== honestForecast.summarize) | `honestForecastEngine`, `nasdaqPerformance`, `zscoreSpreadEngine`, `macroEquityEngine`, `rangeFibEngine`, `gold-backtest-worker`, `backtest.js` 🔲 | 🟡 |
| **Fib projection** | `js/fibProjection.js` | `FIB_LEVELS` (45-level grid), `KEY_LEVELS`, `calcFibs` (`low + range × level`) | `asiaRangeEngine` ✅, `rangeFibEngine` ✅, `confluenceModules` ✅ | ✅ |
| **Instrument registry** | `js/instrumentRegistry.js` | canonical pip size, price digits, asset class, symbol aliases (display/OANDA/Yahoo/MT5/code) + accessors (`pipSize`, `instrument`, `resolveKey`…) | server.js `PIP_SIZE`, `js/config.js`, `volBacktestEngine` `INSTRUMENTS`, `asiaRangeEngine`/`rangeFibEngine` `PIP_SIZE`, Python `_PIP_SIZES` 🔲 | 🟡 |

> **Wired:** `asiaRangeEngine.js`, `rangeFibEngine.js` and `confluenceModules.js`
> all import `barUtils` + `fibProjection` instead of their private copies, and
> `honestForecastEngine.summarize` delegates to `metricsCore` (verified
> `node --check` + brick tests; full backtest re-run needs M1 data/network not
> available in the sandbox). Remaining adoption is tracked in §2 and §5.

### 1c. Tier-2 level-source bricks (2026-06-28)

These are the **strategy-building** bricks: pluggable modules that each EMIT a
list of price levels, built ON the Tier-1 primitives above. The repo already
proved the pluggable pattern in `confluenceModules.js` ({`buildPairCache`,
`buildDayState`, `check`}) — but that interface only answers "is this price near
a level?", so the levels stay trapped in the Asia-range engine. The level-source
contract instead **emits** the levels so one list feeds three consumers: a
confluence scorer (cluster), the chart viewer (render), a strategy (trade).

**Contract**

```
LevelSource = { id, label, kind, defaultParams, levels(ctx) → Level[] }
Level       = { price, kind, label, weight, meta }       // + `source` when via collectLevels
ctx         = { dailyBars, instrument, price?, intraday?, params? }
```

`dailyBars` = chronological completed D1 bars; the LAST element is the most
recent completed day, so "over past x days" = the last x. No lookahead — a
module only reads what it's given. Pip size comes from `instrumentRegistry`.

| Brick | File | Owns | Status |
|---|---|---|---|
| **Level sources** | `js/levelSources.js` | `LEVEL_SOURCES` registry + `collectLevels` (aggregate to one tagged list) + `clusterLevels` (merge to scored zones). **Seven** sources: `daily_open`, `prior_hilo` (PDH/PDL, PWH/PWL, N-day extremes), `pivots` (classic + camarilla), `volume_profile` (POC/VAH/VAL over x days), `swing_sr` (N-bar pivots, clustered), `round_number` (big/half figures), `vwap` (session VWAP anchors over x days). Tested in `js/levelSources.test.mjs` (POC + swing logic checked against a verbatim reference). | ✅ built |
| **Render brick** | `js/levelChart.js` | reusable Lightweight-Charts viewer — `createLevelChart(el).setCandles().setLevels(Level[]).setZones(zones)`; pure `styleForKind` / `levelToPriceLineOptions` / `zoneToPriceLineOptions` (colour keyed by `Level.kind`). Lifted from `gold-zones.html`. Demo: `level-chart-demo.html`. Consumers: `level-chart-demo.html` ✅, **`forecast-analysis.html` Book-tab trade viewer** ✅ (click a trade → its M1 session with Close/Proj-H/L forecast lines + entry/TP/SL marked, fed by `getSessionChart`). Pure helpers + factory wiring tested headless against a mock in `js/levelChart.test.mjs`. | ✅ built |
| **VuManChu core** | `js/vumanchuCore.js` | ONE WaveTrend / Money-Flow / VWAP compute, consumed two ways: `waveTrendSeries` (raw WT1[] for backtest gating) and `waveTrendReading` (latest-bar OB/OS/cross signal) — same compute, mode selects the shape. Standardizes the divide-by-zero guard on `WT_EPS = 1e-10`. Wired into `js/vumanchu.js` ✅ (re-exports `computeWT`/`computeMF`/`computeVWAP`/`ema`/`sma`) and `asiaRangeEngine._computeWT1Series` ✅. Golden test (`js/vumanchuCore.test.mjs`) proves it reproduces BOTH former copies bit-for-bit. | ✅ built |
| **Range-bias core** | `js/rangeBiasCore.js` | the live entry-bias features — `computeADX`, `computeHurst`, `ema`, `featureADX`/`SwingRegime`/`Twap`/`EmaRsi`/`Hurst`, `computeRangeBiasServer`, `computeWeeklyPivots`. Extracted verbatim from `levels.js`; wired into `levels.js` ✅ (live) + `asiaRangeEngine` ✅ (backtest). Golden test (`js/rangeBiasCore.test.mjs`) proves bit-for-bit equality. | ✅ built |
| **Entry-grade core** | `js/entryGradeCore.js` | the live star rating + `signalScore` weighting — `computeStars`, `computeStructScore`, `momScoreFrom`, `rbScoreFrom`, `computeSignalScore` (38/25/25/12 + FRED 25/25/20/20/10). A/B/C grade stays in `trade-grade.js`. Wired into `levels.js` ✅ + `asiaRangeEngine` ✅. Golden test (`js/entryGradeCore.test.mjs`, 108 combos). | ✅ built |
| **Gate analysis** | `js/gateAnalysis.js` | `compareGates` / `bestGate` — compares candidate trade gates (entry grade vs vol-forecast HL75 stretch vs day-type T) on a true IS/OOS split with thin-sample flags; honest "no gate adds OOS edge" result. Renders as Panel 0 in `asia-range-analysis.html`. Test `js/gateAnalysis.test.mjs`. | ✅ built |

**Where each source consolidates existing copies** (extract / unify targets):

| Level source | Existing JS (confluenceModules) | Existing Python (Gold bot) — unify later |
|---|---|---|
| `daily_open` | `daily_opens`, partial `session_open_range` | `session_engine.py` |
| `prior_hilo` | `pdh_pdl`, `pwh_pwl`, `ath_52wk`, `monday_range` | `session_engine.py` |
| `pivots` | *(none in JS)* | `session_engine.py:_pivots` (Camarilla variant — formulas differ; document before unifying) |
| `volume_profile` | `vah_val`, `naked_poc` (no nPOC-age in JS) | `volume_profile.py` (age-weighted nPOC stack — port into JS as a param) |
| `swing_sr` | `sr_level` (N=5 on 30m) | `fib_engine.py` swing pivots |
| `round_number` | `round_number` | — |
| `vwap` | *(none in JS — backtests omit VWAP anchors entirely)* | `session_engine.py` `compute_vwap_anchors` |
| VuManChu WT/MF/VWAP | `js/vumanchu.js` `computeWT`, `asiaRangeEngine._computeWT1Series` → **both now share `js/vumanchuCore.js`** ✅ | `Gold/modules/vumanchu.py`, `backtestSystem/indicators.py`, `bot/utils/indicators.py` (Python — later) |

> **VuManChu / WaveTrend — done (JS).** The two JS copies (`js/vumanchu.js`
> `computeWT` and `asiaRangeEngine._computeWT1Series`) now share
> `js/vumanchuCore.js`. They had drifted only on the channel-index divide guard
> (`d > 0` vs `d > 1e-10`); the core standardizes on `1e-10`, which is not just a
> merge but an **improvement** — on a flat/dead market float rounding leaves `d`
> at ~1e-16, and the old `d > 0` guard divided by that noise to emit spurious
> ±66 oscillator spikes, while `1e-10` suppresses them (proven in
> `js/vumanchuCore.test.mjs`). `asiaRangeEngine` is bit-identical (it already
> used `1e-10`). The Python copies remain a later unification target.

---

## 2. Candidate bricks — mapped, prioritized, not yet extracted

Ranked by **drift risk × reuse**. "Live" = a copy runs in a production bot, so a
drift directly desyncs trading from its backtest (the worst case).

### P0 — highest leverage (live ↔ backtest disagreement, or PnL-corrupting)

| # | Candidate brick | What it owns | Duplicated in (file:line) | Risk | Notes |
|---|---|---|---|---|---|
| 1 | **`assetParams` + BM/HN constants (single source)** | Brownian range constants + per-asset-class correction factors | `volBacktestEngine.js:22-34` (canonical) vs **divergent** copies: `volForecast.js:45-50,115-120` (Jun-26 recal), `forecaster-backtest.html:471-481`, `VolRangeForecaster/vol_*.py`, `ForecasterOptimizer/engine.py`, **live** `TradingBot/dyn_anchor_bot.py:44-47`, **live** `DynAnchorBot/dyn_anchor_mt5_bot.py:46-62` | 🔴 CRITICAL | 6+ correction-factor sets from a June recalibration applied unevenly → live bots forecast different ranges than backtests. Make `volBacktestEngine` the source; Python imports via a generated JSON. |
| 2 | **GARCH(1,1) σ series** | close-to-close GARCH vol | `volBacktestEngine.js:152-164` (α=0.06,β=0.91) vs **live** `js/vol.js:54-68` (**α=0.10,β=0.85,ω=1e-7**); Python ports match backtest | 🔴 CRITICAL | Live `vol.js` is structurally different from every backtest. Decide the canonical (α,β) and parameterise. |
| 3 | **Instrument registry (Python side)** | pip size, point value, MT5/OANDA/Yahoo symbols | `js/instrumentRegistry.js` ✅ (JS) but Python still has `bot/main.py:91-110`, `bot/regime_bot.py:59-93` (**only place with `_PIP_VALUES`**), `bot/{backtest,hedge_bot,position_hedge_bot}.py`, `VolRangeForecaster`, `portfolioBacktest` | 🔴 CRITICAL | A single wrong pip = 10× PnL error. Port the JS registry to a `instruments.json` both sides read. |
| 4 | **Python indicator core** | EMA/ATR/ADX/RSI/WaveTrend for the bots | `bot/utils/indicators.py` (ATR alpha=0.15) vs `backtestSystem/indicators.py` (Wilder ATR) vs inline `bot/regime_bot.py:252-271`, `Gold/main.py`, `Gold/modules/fib_engine.py:89-97` | 🔴 VERY HIGH | ATR smoothing differs bot vs backtest → stops differ. Mirror of `js/indicatorCore.js`. |
| 5 | **Regime composite score** | 7-component HMM+BOCPD+session+DXY+consensus+vol+credit → 0-100 | `RegimeV2/regime_score.py` vs `RegimeV4/regime_score_v4.py` (adds `bocpd_trend`, consensus fix) vs `js/regime-confidence.js` (6, no credit) vs inline in `regime-backtest.html` | 🔴 CRITICAL | V2 and V4 bots score the *same* regime differently. Pick V4 as canonical; port to JS for backtests. |
| 6 | **BOCPD change-point detector** | run-length change-point prob | `RegimeV2/bocpd.py` (full, used by V2/V4/V7 bots) vs simplified scalar in `js/regime-confidence.js` / `regime-backtest.html` | 🔴 CRITICAL | Live exit gates fire on BOCPD; backtests compute it differently (or not). Port `bocpd.py` → `js/bocpd.js`. |
| 7 | **Cost/friction model** | round-trip spread + commission + slippage (limit vs stop asymmetry, borrow) | `forecastCore.js:45-47`, `honestForecastEngine.js:39-41`, `backtest-worker.js`, Python `vix-vol-carry`/`macro-regime-conditional` constants, `RegimeV2/backtest_v3.py` | 🔴 CRITICAL | When/how costs are applied differs; only honest-forecast models stop-entry slippage. One `applyCosts(...)`. |

### P1 — high value (shared within research/systems)

| # | Candidate brick | What it owns | Duplicated in | Risk |
|---|---|---|---|---|
| 8 | **Macro tier score (T1–T8)** | rate/VIX/DXY/credit/carry/NFCI/momentum/session → sizing band | `js/macro.js:69-792` (canonical; T4/T7/T8 JS-only) vs `RegimeV2/regime_score.py`, `macroEquityEngine.js`, `GlobalLiquidity/gli.py` | 🟠 HIGH |
| 9 | **Position-sizing band** | conviction → risk% / lots | `nasdaqSizing.js:77-93`, `RegimeV2/regime_score.py:84-89`, `GlobalLiquidity/sizer.py:36-83`, `DecisionEngine/decisionEngine.js:46-133` (scales 13 vs 55 vs 0.5 — incommensurable) | 🟠 HIGH |
| 10 | **Fill walker (generalised)** | intrabar SL/TP resolution, limit/stop fill, slippage, breach-reclaim | `forecastCore.js:72-96` (canonical `walkBars`) vs inline `honestForecastEngine:84-120`, `asiaRangeEngine:278-301`, `zscoreSpreadEngine:172-187`, `backtest-viewer:312+` | 🟠 HIGH |
| 11 | **Walk-forward / IS-OOS split** | date-fraction & window-count splitting | `honestForecastEngine.summarizeSplit`, `nasdaqPerformance:326-391`, `backtest.js:687-844`, Python `GlobalLiquidity`/`vix-vol-carry`/`macro-regime-conditional` (504/63/21) | 🟠 MEDIUM |
| 12 | **Volume profile (POC/VAH/VAL/nPOC)** | value-area + age-weighted naked POC | `confluenceModules.js:266-312` (no nPOC age) vs `Gold/modules/volume_profile.py:52-147` (full nPOC stack) | 🟠 HIGH |
| 13 | **Pivots / VWAP anchors** | Camarilla pivots, session VWAP, session-open anchors | `Gold/modules/session_engine.py:66-201` (only full impl); backtests omit VWAP anchors entirely | 🟠 HIGH (backtest↔live gap) |
| 14 | **Confluence scorer** | weighted zone ranking across level types | `Gold/modules/confluence_scorer.py:56-186` vs `asiaRangeEngine.runModuleChecks` (module-hit-count, no cross-impulse/nPOC-age/VWAP) | 🟠 VERY HIGH (backtest↔live gap) |
| 15 | **Swing-pivot detection** | N-bar high/low S/R | `confluenceModules:209-223`, `backtest-engine:189-203`, `range-bias:288-303`, `backtestSystem/indicators.py:111-122`, `Gold/modules/fib_engine.py:100-113` (N varies) | 🟠 MEDIUM |

### P2 — useful consolidation (cleanliness, lower drift risk)

| # | Candidate brick | What it owns | Duplicated in | Risk |
|---|---|---|---|---|
| 16 | **OANDA D1 fetcher** | daily OHLC + 22:00 session-day shift + retry | `volBacktestEngine.js:51-84` (no retry) vs `cogHistoricalDataLoader.js:72-110` (retry/backoff) | 🟡 MEDIUM |
| 17 | **FRED fetcher + publication lag** | series fetch, lag shift, forward-fill | `nasdaqDataSources`, `cogDataSources`, `nasdaqTransforms:172-189`, `server.js:3882-3958` (local re-impl), `GlobalLiquidity/backtestCore.mjs` (3 different FRED_ID maps) | 🟡 MEDIUM |
| 18 | **COT/CFTC parser** | TFF + disaggregated parse, symbol map | `_worker.js:67-175` (parse) vs `js/cot.js:7-52` (client transform); two symbol maps drift | 🟡 LOW-MED |
| 19 | **Session/timezone bucketing** | London-session day, Asia/London/NY classify, BST | `utils.js:103-150`, `volBacktestM1Engine:217-224`, `cogHistoricalDataLoader:40-64`, `nasdaqSessions:25-80` (DST-aware), `cogTradingDay:18-54` (DST-blind) | 🟡 MEDIUM |
| 20 | **COG/Nasdaq exit engine** | direction-aligned continuation score → exit | `cogExitEngine.js:32-100` vs `nasdaqExitEngine.js:29-100` (share `compositeRampScore`) | 🟠 HIGH |
| 21 | **COG/Nasdaq liquidity gate** | balance-sheet+credit → [-5,+5] | `cogLiquidityGate.js:18-76` ≈ `cogThreshold1Gate.js:69-97` (self-admitted copy) vs `nasdaqLiquidityEngine.js:56-80` (simpler voting) | 🟠 HIGH |
| 22 | **Async job-queue helper** | `POST /run`→jobId, `GET /status/:id` boilerplate | repeated ~5× in `server.js` (`:2976`, `:3199`, `:3256`) + `analyserRoutes.js:54-99` | 🟢 LOW |

### Python-bot shared utilities (live-bot territory — **document only, do not edit live bots yet**)

These are real duplications but live inside production bots, so per the current
task they are catalogued, not extracted. See `a5819a3c`/`a8ce0949` survey notes.

| Candidate | Duplicated in | Risk |
|---|---|---|
| MT5 position serialization (`_serialize_open_positions`) | `bot/main.py:123-145`, `bot/regime_bot.py`, RegimeV2/V4/V7, DynAnchorBot — 6+ copies | 🟠 HIGH |
| Python position sizing (risk% → lots, decay) | `bot/regime_bot.py:252-264` vs `RegimeV2` (`×0.5` decay variant), V7, DynAnchorBot | 🟠 HIGH |
| MT5 connect/login + account check | `bot/main.py`, `bot/regime_bot.py:178-231`, RegimeV2/V7, DynAnchorBot | 🟡 MEDIUM |
| KV client (get/put/status push) | `bot/main.py`, `bot/regime_bot.py`, `RegimeV2:189-209`, V7; partial `bot/utils/state_reader.py` | 🟡 MEDIUM |
| RiskGuard (daily/monthly DD lockout) | `bot/regime_bot.py:397-450`, RegimeV2/V7, DynAnchorBot; unwired `safety/risk_gate.py:116-309` | 🟠 HIGH |
| Telegram alerting | `bot/main.py:316-357`, RegimeV2 `formatter.py` (reused by V7), DynAnchorBot inline | 🟡 MEDIUM |
| Logging setup | `bot/main.py:65`, `bot/regime_bot.py:97`, RegimeV2/V7 | 🟢 LOW |

---

## 3. Known drifts this registry exists to retire

Concrete, evidenced divergences found during the mapping. Each is a latent
"backtest says X, live does Y" bug. **Documented, not silently auto-fixed** —
unifying them changes existing numbers, so adopt deliberately with an OOS re-run.

1. **Gold pip size:** `1.0` (server.js, asiaRangeEngine) vs `0.1` (rangeFibEngine).
   `instrumentRegistry` canon = `1.0`. *(rangeFibEngine's local `PIP_SIZE` left
   untouched for now — changing it shifts that backtest's pip math.)*
2. **GARCH (α,β):** backtest `(0.06, 0.91)` vs live `js/vol.js (0.10, 0.85)`.
3. **ASSET_PARAMS correction factors:** ≥6 sets across JS/HTML/Python/live bots
   from an unevenly-applied June-2026 recalibration.
4. **News multiplier:** JS includes "Fed Chair Speech"; `VolRangeForecaster` Python
   does not → Python under-forecasts on those days.
5. **ATR smoothing:** Wilder (regime/hmm) vs EMA-alpha-0.15 (Python bots) vs
   simple-mean (session-range backtests) — all named separately in
   `indicatorCore` so the caller can't pick the wrong one by accident.
6. **Regime score:** V2 vs V4 (`bocpd_trend` penalty + consensus fix) — different
   sizing/exits for the same regime.
7. **Rolling z-score:** population stddev + clip (nasdaqTransforms) vs sample
   stddev no-clip (GlobalLiquidity mathx). `statsCore.rollingZScore` makes `ddof`
   and `clipAt` explicit arguments.
8. **🔴 Confluence engine — live ≠ backtest (the big one).** The LIVE alert path
   and the Asia-range BACKTEST use **different confluence code**:
   - **Live / telegram:** `levels.js` → `confluence-core.js`
     (`detectConfluencesCore` / `mergeCrossSessionConfs`) → writes `ai_entries_{PAIR}`
     to KV → `cron-worker.js:51` proximity alerts + `bot/main.py:1005`
     `evaluate_pair_telegram` + `bot/modules/macro_regime.py`. This is what the
     index.html cards show and what the bot trades.
   - **Backtest:** `asiaRangeEngine.js` → its own local `detectConfluence` + the
     `confluenceModules.js` 16-module stack, served at `/api/asia-range-backtest/*`.
     `asiaRangeEngine` does **not** import `confluence-core.js`.
   ⇒ **The Asia-range backtest does not validate the live alert logic.** The real
   prize is one shared confluence brick both `levels.js` and the backtest call —
   equivalence-first, A/B'd on M1 + the live KV path (it changes live behaviour,
   so highest caution). Note: repointing `confluenceModules → levelSources` is a
   *backtest-internal* cleanup and does NOT touch this live path.
   **Full gap analysis + the Asia-backtest inventory: `CONFLUENCE_LIVE_VS_BACKTEST.md`.**
   ✅ **Steps 1–3 done** (the backtest now grades like the live bot):
   (1) confluence detection via the LIVE `confluence-core.detectConfluencesCore`
   (range-cap + clustering); (2) Monday is its own strategy (Monday-vs-prev-Monday)
   with an opt-in `crossSessionMerge` overlay; (3) every trade records `live_stars`
   / `live_signal_score` / `live_grade` via the SHARED `hmm.js` + `rangeBiasCore` +
   `entryGradeCore` + `trade-grade.js` (additive, no-lookahead). ⚠ Macro/COT/retail
   factors omitted (no history) → grade is a faithful *approximation*. This changes
   the backtest's confluence/selectivity on purpose; re-run on M1 to see it. Full
   detail + remaining UI-filter work in `CONFLUENCE_LIVE_VS_BACKTEST.md`.
   `confluence-core.js`, `range-bias.js`, `structural-fibs.js`, `ranges.js` are
   **live, not dead** — don't delete. Archived: the MD-files ZSCORE export +
   `Zoo/asia_range_backtest.py` → `archive/`.

---

## 4. Conventions for bricks (from `CLAUDE.md`)

- **Import, never copy.** A second copy is a future drift bug.
- **One primitive, parameterised** — express new ideas as params/selectors, not
  new bespoke functions.
- **Horizon-agnostic & no-lookahead** where the brick touches time series.
- **Pure + unit-tested on synthetic data** (no network). Add cases to
  `js/legoBricks.test.mjs` (or a sibling `*.test.mjs`).
- **Costs honest by default**; report sample size next to any win-rate claim.
- **Validate before commit:** `node --check` the module + every file you rewired,
  and run the brick tests.
- **Don't edit v1 production** (`volBacktestM1Engine.js`) or live Python bots in
  place — build alongside and migrate deliberately.
- **Know the tier and the bar.** Is it a Tier-1 primitive, a Tier-2 level source,
  a render brick, or a selector? Does it clear the "what IS a brick" bar (≥2 uses
  or clean contract, stable I/O, pure, synthetic-testable)? See CLAUDE.md "Brick
  tiers & what counts as a brick".
- **Keep THIS registry current** — updating it is part of "done" for any brick
  add/change (Lego Principle 6): a row in §1, status + consumers, and any copy
  you couldn't yet retire logged in §2 / §3.

---

## 5. Adoption checklist (next steps, in order)

Tier-1 primitives
- [x] Wire `confluenceModules.js` to `barUtils` + `fibProjection`.
- [x] Wire `metricsCore` into `honestForecastEngine.summarize` (golden test proves equivalence).
- [ ] Wire `metricsCore` into `nasdaqPerformance` / `zscoreSpreadEngine` / `macroEquityEngine`.
- [ ] Wire `statsCore` into `nasdaqTransforms.rollingZScore/rollingPercentile`
      (bit-faithful), then `globalLiquidityEngine` / `macroEquityEngine`.
- [ ] Wire `indicatorCore` into `hmm5m.js` / `hmm5m-v2.js` (ATR/ADX/rollingZ).
- [ ] Generate `instruments.json` from `instrumentRegistry` and have the Python
      bots + backtests read it (single pip/symbol source across languages).

Tier-2 level sources (`js/levelSources.js`)
- [x] Build the level-source contract + registry (7 sources) + `collectLevels` / `clusterLevels`.
- [x] Add a **VWAP/anchor** source (`vwap`).
- [x] Build the **render brick** (`js/levelChart.js`) + demo (`level-chart-demo.html`).
- [x] Unify **VuManChu/WaveTrend** — `js/vumanchuCore.js` (one compute, two use
      cases); `js/vumanchu.js` + `asiaRangeEngine` wired; guard standardized on
      `1e-10` (golden-tested). Python copies still to unify.
- [ ] Point the Asia-range confluence modules at `levelSources` (thin
      `levels()`→`check()` adapters) to delete the duplicate level math. ⚠ **NOT a
      bit-identical swap** — confluenceModules and levelSources differ in algorithm
      (e.g. `round_number` 0.1 vs 0.01 grid), timeframe (`sr_level` 30m vs daily)
      and aggregation (`vah_val` per-session vs composite), so it **changes the
      backtest's confluence results**. Do it equivalence-first (make levelSources
      reproduce each module exactly) and **A/B on M1 data** — not a headless swap.
- [ ] Unify the Gold bot's Python copies (`volume_profile.py` nPOC-age, `session_engine.py`
      pivots/VWAP) with these sources — **behind an OOS re-run**, since it touches live code.

P0 cross-language unification
- [ ] `ASSET_PARAMS` + GARCH params + BOCPD/regime score — each behind an OOS
      re-run, per `SYSTEM_ASSESSMENT.md` P0.
