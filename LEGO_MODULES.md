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

Last updated: 2026-07-10. Maintained as bricks are built.

---

## 1. Built bricks (the baseplate — import these)

### 1a. Pre-existing core (the original baseplate)

| Brick | File | Owns | Imported by | Status |
|---|---|---|---|---|
| Vol/range engine | `js/volBacktestEngine.js` | vol-σ series (HV20/GARCH/Yang-Zhang), `ASSET_PARAMS`, `classifyRegime`, BM/HN band constants (`BM_P50/75`, `HN_P50/75`), `fetchD1`, `fetchSessionOpenLondon` (today's open from the FIRST M1 bar at 00:00 Europe/London — deterministic, matches the forecaster; not the 22:00-UTC D1 open) + `londonMidnightSec` (DST-safe London-midnight epoch, the single anchor definition) | `forecastCore`, `honestForecastEngine`, `weeklyVolBacktestEngine`, `volBacktestM1Engine`, `server.js` | ✅ |
| Day-type classifier | `js/dayTypeCore.js` | reversion-vs-continuation score (`ESTIMATORS`, `DAYTYPE_PRESETS`, `classifyDayType`, `dayTypeScore`) **+ realized-outcome labeler** (`OUTCOME_LABELERS`, `labelOutcome` — the ground-truth CONTINUATION/REVERSION tag the score is graded against; default `closeVsOcMed` ~50/50) | `forecastCore` (re-exported), `forecastAnalyser`, `weeklyVolBacktestEngine` (opt-in regime fade/follow gate) | ✅ |
| Forecast primitive | `js/forecastCore.js` | `computeBands`, `walkBars` (fill walker), `simulateEntry` (the one entry primitive), `selectStrategy`, `volSigmaSeries`, **`nextSigma`** (one-step-ahead σ for TODAY's session — the plan producer's contract; golden-tested `nextSigma(bars[0..n-1]) === volSigmaSeries(bars[0..n])[n]`), `HORIZONS`. **2026-07 honesty fixes** (tested in `js/forecastCore.test.mjs`): limit-entry TP is no longer resolvable on the fill bar (the TP region is traversed on the way TO the band — was fatal on D1 window bars: weekly/monthly + daily D1-fallback); `walkDynamicHL` anchors on extremes STRICTLY BEFORE the tested bar, seeded with the open (was self-anchoring = BUG_LIST #8's defect in the v2 core). Re-run any A/B built on the old numbers before citing them. | `volBacktestV2Engine`, forecast family, `volatilityBotProducer` (via `nextSigma`) | ✅ |
| Honest metrics | `js/honestForecastEngine.js` | `summarize`, `summarizeSplit` (metrics + IS/OOS split) | forecast family | ✅ |
| Touch features | `js/touchFeatures.js` | at-the-moment fade-vs-continuation features (`createTouchFeatures(cfg)` factory + `TOUCH_FEATURES`: approach efficiency/velocity, WaveTrend, **volume climax, candle rejection, round-number proximity**); price + tick-volume proxies, no order-book; config set on import | `forecastAnalyser`; imports `vumanchuCore` | ✅ |
| Per-line strategy | `js/perLineStrategy.js` | per-line confidence engine — `extractTouches`, `buildPolicy` (fade/follow/skip per cell, IS-learned, **after-cost expectancy gate**, pluggable `pricer` — Lego Principle 2, one primitive parameterised), `pnlFor` (triple-barrier + honest mark-to-close — the DEFAULT pricer), `pnlHeld` (prices a touch under the **§13 held-chandelier trail** instead, reusing the analyser's precomputed `fChand`/`fChandFade` — pass as `buildPolicy`'s `pricer` to gate/grade on the proven exit; used by `levelsV2Learn.js`'s v3 per-instrument learner and available to `runPerLine`), `runPerLine` (pooled-IS → per-pair OOS book + equity + trade log + **portfolio** stats + **`survivors`** live-universe block), **`buildSurvivors`** (keep pairs whose OOS net expectancy clears their own spread by a margin, re-aggregate just their daily PnL into an honest portfolio), **`runRigor`** (walk-forward / per-year / cost-sensitivity / IS-vs-OOS), **`runSensitivity`** (OAT parameter grid → per-combo Sharpe/breadth + per-obs trial Sharpes for deflation), **`runExitStudy`** (OOS A/B/C/D/E of the exit RULE — fixed triple-barrier vs chandelier trail vs walk-forward breakeven stop vs **ride** (chandelier, NO TP cap, session-close fallback) vs **ridehold** (ride that holds past session close into the next day[s]) — holding the IS-learned entry policy fixed and swapping only the exit; aggregates each rule overall/fade-only/follow-only via `portfolioStats`+`summarizeTrades`, prices from the analyser's pre-simulated `ex*` gross PnLs, nets **cost + follow entry-slip + ride exit-slip** (the rides exit ~99% on a trailing/disaster STOP → charged a market-exit slip leg the fixed TP is not, via each ride trade's `why`), counts records missing the fields, marks the best-Sharpe rule per group at n≥30; also emits **`costStress`** (overall Sharpe re-netted at 1×/2×/3× cost — the make-or-break for a thin-expectancy edge) and, for the two rides, **`composition`** (% of taken OOS trades exiting on the trail / disaster-stop / session-or-horizon **close** — a high close% ⇒ really "hold-to-close", needs a live EOD close)); **`runExitGateSweep`** (re-learns the entry policy at several `marginPct` gates and reports the ride/ridehold overall Sharpe + its 2×/3× cost-stress + trade count at each — tests whether concentrating on fewer, higher-expectancy fade cells makes the thin ride edge survive 2× cost, i.e. whether a tradeable subset exists); **`runRideRigor`** (walk-forward folds + per-year + per-pair **breadth** + IS→OOS retention on the STRICT-GATE ride, pricing the ride exit via `priceRideTrades` with the honest cost — the guard against single-split luck / gate-overfit before the ride goes to paper; `buildExitStudy` attaches it as `rideRigor` at the gate-sweep's cost-robust winner, default marginPct 0.05); **`extractTouches` supports a `dayType` condition** — a SIGNED **ex-ante** trend-day bucket (`tU`/`rng`/`tD`) derived from the window's `signedT` (`|signedT|≥dtThresh`, default 0.33), attached to every touch and usable in the cell key (window-level, no lookahead: `signedT` is `classifyDayType`'s pre-session forecast); **`runDayTypeStudy`** (OOS A/B — velocity-only vs velocity×day-type — runs `runPerLine` twice on the SAME data/split/costs, reports each book's OOS Sharpe/CAGR/maxDD/expectancy + fade/follow/skip breadth, marks `gatedWinsOos` at Sharpe≥baseline ∧ n≥30, plus the **fade-into-trend diagnostic**: the OOS touches the baseline FADES against the forecast trend — the "selling into a rally" losers — with baseline vs gated net PnL and the gate's skip/flip/fade counts); **`runStopStudy`** + **`pnlAtSL`** (per-pair STOP-LOSS study — the fade stop is currently the outer band line; re-prices every OOS fade under a TIGHTER candidate SL off the stored `extPct` adverse excursion with **no M1 re-sim**: `extPct>s`→stopped `−s`, else keeps its original outcome; **tightening-only** — candidate clamped per-touch to `min(s,distOut)`, wider stops need M1 re-simulation (follow-up); **conservative** ordering; grounds the grid in each pair's **winners'-MAE** percentiles + σ-fractions of the median band; picks `bestSL`=argmax OOS Sharpe (tie-break expectancy) among candidates at n≥30 else falls back to the band SL; returns per-pair {winners-MAE p50/75/90/95, bandSL, bestSL, exp/Sharpe band vs best} + a portfolio A/B **band vs per-pair-optimal vs asset-class-optimal** with deltas; `pnlAtSL(t,distOut)` reconciles with `pnlFor`'s fade result); `runPerLine` also emits a **`missed`** summary (skipped OOS touches by reason: unseen-in-IS / low-N / edge-below-cost) | `forecastAnalyserStore` (orchestrator + routes; `buildDayTypeStudy` → `/api/forecast-analysis/daytype-study/:horizon`, Day-Type tab §(d); `buildStopStudy` → `/api/forecast-analysis/stop-study/:horizon`, **Stops** tab); imports `metricsCore`, `backtestStats`; tested `js/dayTypeGate.test.mjs`, `js/stopStudy.test.mjs` | ✅ |
| Backtest stats | `js/backtestStats.js` | the standard battery for a trade-PnL series — Sharpe/Sortino/Calmar/CAGR/PF/payoff/win-rate/expectancy/max-DD+duration, **bootstrap CIs**, **Monte-Carlo** drawdown (**IID reshuffle + stationary block bootstrap** — `blockResample`, Politis–Romano, preserves regime clustering so it doesn't understate tails; `portfolioStats({mc:true})` returns both `volTarget.mcMaxDD` and `volTarget.mcMaxDDBlock`, plus **raw 1× (unscaled)** MC under `raw.*` and the daily lag-1 autocorr **`acf1`** whose sign explains block ≶ IID), **`portfolioStats`** (honest daily-aggregated Sharpe ×√252 + vol-targeted CAGR/DD + **Probabilistic Sharpe**), **`deflatedSharpe`** (López de Prado DSR — discounts Sharpe for the number of trials/search, via inverse-normal expected-max-Sharpe); deterministic seeded PRNG | `perLineStrategy`, `forecastAnalyserStore`; imports `metricsCore` | ✅ |
| Volatility-bot plan | `js/volatilityBotPlan.js` | `buildVolatilityPlan(book, volByPair)` — turns the frozen per-line book + today's live per-pair σ/open into the compact artifact the live `volatility_bot` consumes (survivor universe, fade/follow policy cells, per-pair band fractions via canonical `computeBands`). Category-A "ship it a file" contract (PYTHON_LEGO.md §0) — the bot never re-implements the vol math. Pure, tested in `legoBricks.test.mjs`. | `volatilityBotProducer`; imports `forecastCore` | ✅ |
| Volatility-bot producer | `js/volatilityBotProducer.js` | `refreshVolatilityPlan({getBook,fetchD1,sigmaSeries,kvPut})` — assembles the plan from the locked book + live D1 σ + the **London-midnight session open** (`fetchSessionOpen`, the anchor the bands hang off — D1's 22:00-UTC open is only a fallback) (σ computed via `volSigmaSeries`, the SAME path the book learned on — not the drifted `volForecast.js`) and writes KV `volatility_bot_plan`. Network injected → offline-tested. Wired in `server.js` (`POST /api/volatility-bot/refresh-plan`, `GET /api/volatility-bot/plan`, daily scheduler). | `server.js`; imports `volatilityBotPlan`, `instrumentRegistry` | ✅ |
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
| **Indicator core** | `js/indicatorCore.js` | `ema`, `trueRange`, `atrWilder` (faithful to hmm5m), `atrEma` (alpha variant), `adxWilder` (faithful to hmm5m), `rsiWilder` | `hmm5m`, `hmm5m-v2`, regime backtests, `range-bias`, `backtest-engine`, `weeklyVolBacktestEngine` (ADX regime source) 🔲 | 🟡 |
| **Metrics core** | `js/metricsCore.js` | `sharpeRatio`, `sortinoRatio`, `calmar`, `maxDrawdownFromPnls`/`FromEquity`, `profitFactor`, `winRate`, `expectancy`, `summarizeTrades` (== honestForecast.summarize) | `honestForecastEngine`, `nasdaqPerformance`, `zscoreSpreadEngine`, `macroEquityEngine`, `rangeFibEngine`, `gold-backtest-worker`, `backtest.js` 🔲 | 🟡 |
| **Fib projection** | `js/fibProjection.js` | `FIB_LEVELS` (45-level grid), `KEY_LEVELS`, `calcFibs` (`low + range × level`) | `asiaRangeEngine` ✅, `rangeFibEngine` ✅, `confluenceModules` ✅ | ✅ |
| **M1 gap-fill** | `js/m1GapFill.js` | `computeGap`/`lastPackedEpoch`/`toEpochSec`, `chunkMinuteRange` (≤5000-bar OANDA pages), `fetchM1Gap` (paginated, injected `fetchCandles`, skips a failing chunk), `mergeBarsIntoPacked` (append-only, deduped, non-mutating), `gapFillPacked` — tops a frozen R2 M1 `packed` series up to "now" at book-rebuild time (no parquet writer) | `forecastAnalyserStore.refreshPair`/`runRefresh` (opt-in `gapFill`) ✅; OANDA M1 fetcher = `volBacktestEngine.fetchM1Range`. Test `js/m1GapFill.test.mjs` | ✅ |
| **Instrument registry** | `js/instrumentRegistry.js` | canonical pip size, price digits, asset class, symbol aliases (display/OANDA/Yahoo/MT5/code) + accessors (`pipSize`, `instrument`, `resolveKey`…) | server.js `PIP_SIZE`, `js/config.js`, `volBacktestEngine` `INSTRUMENTS`, `asiaRangeEngine`/`rangeFibEngine` `PIP_SIZE`, Python `_PIP_SIZES` 🔲 | 🟡 |
| **Credit core** | `js/creditCore.js` | the corporate-credit-spread ("credit-Greeks") feature set + risk-appetite gate from an HY OAS series (oldest→newest, pct-points): `creditFeatures` (position percentile · velocity 1d/5d/20d Δbps · acceleration sign · persistence days-in-regime · CCC−BB quality) + `creditGateFromFeatures`/`creditGate` (→ RISK-ON/NEUTRAL/CAUTION/RISK-OFF). Pure; imports `statsCore` (`rollingPercentile`); change/percentile-based so the liquidity-premium level washes out. Design: `docs/CREDIT_SIGNAL_SPEC.md`. Unit-tested `js/creditCore.test.mjs` (28 cases). | `today.html` credit gate (module → `window.creditBrick`) ✅; `creditLeadLagEngine` (predictor) ✅; **TDE** — `server.js` `_tdeCreditContext` → `buildSnapshot({credit})` → logged-inert `credit_*` features + Telegram flip alert ✅; intended: `macroCore` (its own inline HY rule) 🔲 | 🟡 |
| **Credit HMM** | `js/creditHmm.js` | standalone 2-state Gaussian HMM for a 1-D series (spread level or ΔOAS): `fitGaussianHMM2` (log-space Baum-Welch EM + Viterbi, deterministic init) + `creditRegime` (→ current regime, stress posterior, self-transition persistence, expected duration = 1/(1−p_stay) — the principled "theta"). Pure, no deps. Unit-tested `js/creditHmm.test.mjs` (18 cases, recovers planted regimes). **Known related copy:** repo-root `hmm.js` has a scaling-based 2-state Gaussian EM (`baumWelch`/`viterbi`, unexported, log-return observable) — candidate to unify onto this log-space brick. | `creditLeadLagEngine` (persistence predictor) ✅; intended: `today.html` credit persistence term 🔲 | 🟡 |
| **Credit lead-lag engine** | `js/creditLeadLagEngine.js` | the honest study — does credit-Δ lead NQ realized vol, beyond vol's own persistence? `creditPredictors` (features + HMM stress prob, causal), `forwardRealizedVol`/`trailingRealizedVol`, `leadLagTable` (corr by lag, lag>0 = credit leads), `pearson`/`spearman`, `runCreditLeadLag` (IS/OOS information-coefficient + hit-rate vs the past-vol benchmark), `alignByDate`. Pure/injected (offline-testable). Imports `creditCore` + `creditHmm`. Unit-tested `js/creditLeadLagEngine.test.mjs` (17 cases, recovers a planted lead + beats benchmark). | `server.js` `/api/credit-leadlag/*` (async job; fetches FRED `BAMLH0A0HYM2` full history + OANDA `NAS100_USD` D1) → `credit-leadlag.html` ✅ | 🟡 |

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
| **Level sources** | `js/levelSources.js` | `LEVEL_SOURCES` registry + `collectLevels` (aggregate to one tagged list) + `clusterLevels` (merge to scored zones). **Eight** sources: `daily_open`, `prior_hilo` (PDH/PDL, PWH/PWL, N-day extremes), `pivots` (classic + camarilla), `volume_profile` (POC/VAH/VAL over x days), `swing_sr` (N-bar pivots, clustered), `swing_fib` (multi-swing fib projections incl. golden pocket 0.618/0.65; emits a level only where ≥`minConfluence` **distinct** swing pairs agree — distinct-pair guard kills the density confound), `round_number` (big/half figures), `vwap` (session VWAP anchors over x days). Tested in `js/levelSources.test.mjs` + `js/telegramV2.test.mjs` (swing_fib distinct-pair confluence). | ✅ built |
| **Render brick** | `js/levelChart.js` | reusable Lightweight-Charts viewer — `createLevelChart(el).setCandles().setLevels(Level[]).setZones(zones)`; pure `styleForKind` / `levelToPriceLineOptions` / `zoneToPriceLineOptions` (colour keyed by `Level.kind`). Lifted from `gold-zones.html`. Demo: `level-chart-demo.html`. Consumers: `level-chart-demo.html` ✅, **`forecast-analysis.html` Book-tab trade viewer** ✅ (click a trade → its M1 session with Close/Proj-H/L forecast lines + entry/TP/SL marked, fed by `getSessionChart`), **`telegram-v2.html` zone chart** ✅ (click a v2 zone → M5 candles + entry/SL/TP price lines, fed by `/api/oanda_ohlc5m`), **`bot-config.html` volatility-bot live-lines modal** ✅ (click a pair → today's M1 session + the 8 forecast lines colour-coded by live trade state, fed by `GET /api/volatility-bot/session-m1/:pair`). `KIND_STYLE` gained a documented vol-bot state family — `vbBuy`/`vbSell`/`vbMixed`/`vbActed`/`vbIdle`/`vbOpen`/`vbPrice` — kept generic so any bot page can render the same key. Pure helpers + factory wiring tested headless against a mock in `js/levelChart.test.mjs`. | ✅ built |
| **VuManChu core** | `js/vumanchuCore.js` | ONE WaveTrend / Money-Flow / VWAP compute, consumed two ways: `waveTrendSeries` (raw WT1[] for backtest gating) and `waveTrendReading` (latest-bar OB/OS/cross signal) — same compute, mode selects the shape. Standardizes the divide-by-zero guard on `WT_EPS = 1e-10`. Wired into `js/vumanchu.js` ✅ (re-exports `computeWT`/`computeMF`/`computeVWAP`/`ema`/`sma`) and `asiaRangeEngine._computeWT1Series` ✅. Golden test (`js/vumanchuCore.test.mjs`) proves it reproduces BOTH former copies bit-for-bit. | ✅ built |
| **Range-bias core** | `js/rangeBiasCore.js` | the live entry-bias features — `computeADX`, `computeHurst`, `ema`, `featureADX`/`SwingRegime`/`Twap`/`EmaRsi`/`Hurst`, `computeRangeBiasServer`, `computeWeeklyPivots`. Extracted verbatim from `levels.js`; wired into `levels.js` ✅ (live) + `asiaRangeEngine` ✅ (backtest). Golden test (`js/rangeBiasCore.test.mjs`) proves bit-for-bit equality. | ✅ built |
| **Entry-grade core** | `js/entryGradeCore.js` | the live star rating + `signalScore` weighting — `computeStars`, `computeStructScore`, `momScoreFrom`, `rbScoreFrom`, `computeSignalScore` (38/25/25/12 + FRED 25/25/20/20/10). A/B/C grade stays in `trade-grade.js`. Wired into `levels.js` ✅ + `asiaRangeEngine` ✅. Golden test (`js/entryGradeCore.test.mjs`, 108 combos). | ✅ built |
| **Gate analysis** | `js/gateAnalysis.js` | `compareGates` / `bestGate` — compares candidate trade gates (entry grade vs vol-forecast HL75 stretch vs day-type T vs approachVel) on a true IS/OOS split with thin-sample flags; honest "no gate adds OOS edge" result. Renders as Panel 0 in `asia-range-analysis.html`. Test `js/gateAnalysis.test.mjs`. | ✅ built |
| **Profile-shape core** | `js/profileShapeCore.js` | the Market-Profile **day-SHAPE selector** (`b`/`p`/`D`/`B`) layered on the existing volume-profile output — `buildHistogram` (zero-filled volume-at-price from OHLC, body-midpoint proxy faithful to `volumeProfileLevels`), `valueArea` (histogram → POC/VAH/VAL greedy walk), `classifyProfileShape` (POC position + bimodality/LVN-waist detection → `P` low-base/bullish, `b` high-cap/bearish, `D` balance, `B` double-distribution, with `pocPos`/`skew`/`confidence`/`lvn`/`peaks`), `profileShapeBias` (shape → **fade/follow** entry bias: follow long/short on P/b, fade both edges to POC on D, follow the LVN break on B — parallels `dayTypeScore → selectStrategy`), `classifyBars`. Pure, no DOM/network; test `js/profileShapeCore.test.mjs` (synthetic P/b/D/B histograms, 26 assertions). Not yet wired into a live strategy — the selector brick to A/B on the OOS card next. | ✅ built |
| **Range-line analyser** | `js/rangeLineAnalyser.js` | the Forecast-Level per-line strategy applied to RANGE levels, **modules stripped** — `analyseRangeWindow` (emits perLineStrategy-shaped line records off Asia/Monday fib ladders, triple-barrier), `runRangeLineAnalyser`, `runRangeLineBook` (packed M1 → records → pooled-IS policy → per-pair OOS), `recordsForPair`/`touchesForPair` (split so the route caches the expensive records and re-derives touches per `conditions`), **no-lookahead `validFrom` gate** (Asia levels tradeable only after the formation window closes; Monday levels never on Monday itself), plus exported `buildRangeLadder` / `LADDER_LEVELS` (shared with the v2 live producer so live & offline build the identical ladder). `analyseRangeWindow` also records **MFE/MAE excursion to session close** (`excMid`/`excAway`) and **`eRatioByCell`** computes the per-cell E-ratio (does price run past the level → trailing-exit study), plus **path-simulated follow trail PnLs** (`fStruct` structural ratchet / `fChand` chandelier, via the now-EXPORTED `walkChandelierExit` — reused by `js/entryLedgerV2.js` to resolve live v2 ledger records against the SAME trail, never a second implementation), **`runExitAB`** (same learned policy, four exits — fixed / structural / chandelier / scale-out — each scored on OOS daily-portfolio Sharpe + cost-stress; fade keeps the fixed barrier; prices each touch independently so trades/day is unchanged), **`runHeldPosition`** (the HONEST model — one held position per day/direction/source, re-entry suppressed while open → collapses the per-touch over-count so trades/day and the Sharpe become tradeable), **`runBadLevelScan`** (per-(pair × level) IS/OOS expectancy scan + an IS-learned, OOS-applied veto of reliably-losing pair-levels the pooled gate hides), and **`runZoneWalk`** (the policy used as the live exit oracle at EVERY zone — full ladder, fade+follow, continuation→hold / reversal→close, re-entry after flat; a fade can flip into a multi-zone runner). Re-exports the forecast rigor battery (`runRigor`/`runSensitivity`/`deflatedSharpe`) so the route judges robustness the same honest way. Also emits a **structural-confluence condition** — `confluenceBucketAt` + `CONFLUENCE_SOURCES` tag each line by how many DISTINCT sources (pivots / PDH-PDL / POC-VAH-VAL / swing-S&R / swing-fib / round / VWAP via the `levelSources` brick) sit within a range-fraction tolerance (`1·none`/`2·single`/`3·multi`), computed **no-lookahead** from completed prior days and gated behind `opts.confluence.enabled` — so the per-line policy can learn to trade confluence-backed lines and skip bare ones (`conditions:['confluence']`), scored OOS through the same rigor. Includes a **15-minute swing-fib source** (`fib15` — resamples the prior sessions' M1 to 15m and projects swing-fib clusters, the trader's actual tool) and an optional **naked-levels source** (`naked` param — imports the `nakedLevels` brick to add UNTESTED prior highs/lows, i.e. virgin extremes no later session traded through, as one extra distinct `naked_hilo` source over a ~30-session scan; nPOC deferred — needs per-session volume profiles the daily path doesn't load. Off by default; A/B via the `confNaked` toggle. **Validated 2026-07 (FX book): naked DILUTES — keep OFF.** Strong (≥2) @2× +12.19 vs +12.56 off, @3× +9.42 vs +9.93, trades/day 26.9→29.3 (LESS selective), expectancy +0.1390 vs +0.1477, multi-bucket expectancy +0.0995→+0.0902 with win% inverting below single — worse every year and every walk-forward fold. Same failure mode as touch: virgin extremes coincide with `prior_hilo`, so `naked_hilo` mostly duplicates it and inflates the bucket without an independent signal. nPOC not pursued — if the cleaner virgin-H/L half dilutes, the age-weighted variant won't rescue it. Lever stays for the record; live never ships it.). **`runConfluenceFilter`** applies confluence as a pure QUALITY GATE (hold the direction policy, trade all → confluent≥1 → strong≥2 levels) priced on the honest held-position chandelier and split by fade/follow — answers "do stronger levels trade better?" WITHOUT the per-bucket policy fragmentation of the condition, and carries **per-year + anchored walk-forward rigor on the filtered (≥2) book** (retrains the direction policy each fold, applies the filter at trade time — the last stability check before it goes live) (route `confluenceFilter:true`; UI checkbox + card). The touch carries a `confluence` field even when it isn't the cell key (`perLineStrategy.extractTouches`) so the filter can read it. (Distinct from the read-only `confluenceTest` reaction study — this conditions/filters the actual fade/follow policy.) Reuses `touchFeatures` + `perLineStrategy` + `barUtils` + `fibProjection` + `levelSources.collectLevels`/`swingFibLevels` + `forecastAnalyser.bucketM1IntoSessions`. Route `/api/range-line/run` (params `confTolFrac`/`confLookbackDays`/`confSources`/`confluenceFilter`); UI `range-line-strategy.html`. Test `js/rangeLineAnalyser.test.mjs`. | ✅ built |
| **Level-confidence core (v2)** | `js/levelConfidenceCore.js` | the Telegram-v2 confidence decision — `decide` (frozen per-cell **after-cost expectancy**, priced on the §13 held-chandelier trail via `pnlHeld` → grade/verdict), `cellKey` (reproduces `perLineStrategy.extractTouches`' key), `directionFor`/`exitsFor` (fade/follow→long/short + **chandelier-trail exit** — `sl`/`rung`/`trailFrac`, no fixed tp/rr — matching `pnlHeld`), `DEFAULT_GRADE_BANDS`. Pure; the heart of v2. Test `js/telegramV2.test.mjs`. **v3 correction (see `TELEGRAM_V2.md`): dropped the fixed adjacent-line exit + `rr` gate — RANGE_EXTENSION_GUIDE.md §12 found it loses to the chandelier.** | ✅ built |
| **Grade-level v2** | `js/gradeLevelV2.js` | the single LIVE grader — ladder + intraday path → graded entries, rebuilding the IDENTICAL offline cell key (same `buildRangeLadder`, `condFields` defaults to `[]` — §14 found no live touch-read beats the unconditioned cell) → `levelConfidenceCore.decide`. Live==backtest by construction. Test `js/telegramV2.test.mjs` (incl. live↔offline cell-parity check, both conditioned and unconditioned). | ✅ built |
| **Alert formatter v2** | `js/alertFormatterV2.js` | pure `formatV2Entry` — expectancy-first Telegram HTML message; initial-SL + chandelier-trail description (no fixed TP/RR line). Test `js/telegramV2.test.mjs`. | ✅ built |
| **Levels-v2 offline learner** | `js/levelsV2Learn.js` | `learnAndFreeze` / `freezePolicy` / `flattenPolicy` / `isUsablePolicy` — **v3: learns PER INSTRUMENT** (injected `getTouches` loader, no cross-pair pooling — §15) via `perLineStrategy.buildPolicy({pricer:pnlHeld})`, the SAME bricks `js/rangeLineBotProducer.js` freezes for the live `range_line_bot`. `freezePolicy` snapshots `{perInstrument:{instr:{policy,splitDate,...}}}` + bands fit over the flattened union of every instrument's cells. Previously (v2) ran the pooled `runRangeLineBook`/`runPerLine` book conditioned on `approachVel` with a fixed-barrier pricer — closes the split this file and `rangeLineBotProducer` had drifted into (both learned the SAME Asia/Monday touches with DIFFERENT policies). | ✅ built |
| **Range-line bot plan** | `js/rangeLineBotPlan.js` | pure `buildRangeLineBotPlan` — assembles the frozen `range_line_bot_plan` artifact from per-instrument policies + ladder meta (sources/ladderFibs/boundaryHour/asiaHrs/chandFrac). Drops skip cells + zero-cell instruments. Mirrors `volatilityBotPlan`. Tested `js/rangeLineBot.test.mjs`. | ✅ built |
| **Range-line bot producer** | `js/rangeLineBotProducer.js` | `refreshRangeLineBotPlan` — freezes the §13/§15 policy PER INSTRUMENT (each learns on its own M1 via `recordsForPair`→`extractTouches`(none)→`buildPolicy`), writes `range_line_bot_plan` to KV. Injected I/O (offline-testable); refuses to publish an empty plan. Mirrors `volatilityBotProducer`. Routes `/api/range-line-bot/{refresh-plan,plan}`, daily schedule ~06:15 UTC. The Python `range_line_bot` consumes the artifact (PYTHON_LEGO "ship it a file"). Tested `js/rangeLineBot.test.mjs`. | ✅ built |
| **Range-line zones view-model** | `js/rangeLineZones.js` | pure `buildRangeZones({status,plan,confluence})` — joins the live bot status (today's Asia/Monday ladders + price), the frozen plan (fade/follow/skip per cell) and the confluence artifact (which sources back each level) into the per-pair "tradeable zones" the `range-zones.html` page renders: per zone → decision, confluence bucket + source list, SL (protective stop) + trail target, `gated` (would the live ≥N gate take it), taken flag, distance-in-pips. No network; tested `js/rangeLineZones.test.mjs`. Route `/api/range-line-bot/zones`; page `range-zones.html` (chart + per-zone cards, linked from index + the bot-config Range-Line tab). | ✅ built |
| **Range-line confluence producer** | `js/rangeLineConfluenceProducer.js` | `refreshRangeLineConfluence` — ships TODAY's structural-confluence level PRICES per instrument (via `rangeLineAnalyser.sessionConfluenceLevels`, the SAME validated code the OOS confluence quality-filter used — no drift) to KV `range_line_confluence`, so the bot's optional confluence entry-gate is checked against the exact levels the backtest validated. Ships level prices (not a source port): the bot does only the trivial proximity count. No-lookahead (prior D1 + prior M1). Plus `packLiveM1`/`sessionStartEpoch` (pure, tested) — pack FRESH OANDA M1 into the store's identical packed shape and DROP the still-forming session, so the server's 6am-London daily refresh runs the validated path on current data instead of the weeks-stale M1 store (static/session confluence only — the touch/intraday-dynamic mode validated worse and was dropped). Pure, injected I/O; tested `js/rangeLineConfluenceProducer.test.mjs`. Consumed by the ≥N confluence gate in `range_line_bot` (default OFF). | ✅ built |
| **OI forward-test tagging** | `js/oiConfluence.js` | `parseOILevels` (pasted `price type` lines → `[{price,type}]`, `normOIType` slugs put/call-wall/max-pain/gamma-flip/hvl), `tagTradeOI` (is an OI level within tol of an entry), `tradePctReturn` (size-independent %), `nearRoundNumber` (the independence flag), `oiAudit` (join accumulated trade log × per-date OI artifact → tagged-vs-untagged expectancy, per type, + the **not-at-round-#** slice that guards against the naked-levels redundancy trap). Pure/offline-tested (`js/oiConfluence.test.mjs`). **Forward test, not backtest** — no historical options-OI exists for spot FX, so the day's OI is captured each morning (no lookahead) via `POST /api/range-line-bot/oi` → KV `range_line_oi`; a 10-min server tick rolls the bot's transient `today_closed_trades` into `range_line_trade_log`; `/api/range-line-bot/oi-audit` serves the tally. UI on `range-zones.html` (paste box + running tally). | 🔬 forward-testing |
| **Levels-v2 live producer** | `levelsV2Engine.js` (root) | `refreshAllPairsV2` / `refreshPairV2` / `loadPolicy` — fetch OANDA M1 (approach path)/M5/M30/D, build the shared ladders, look up **this symbol's own `frozen.perInstrument[instr]` policy** (no pooling) via `gradeLevelV2`, write `ai_entries_v2_*`, and record+resolve the ledger. A symbol outside the learned universe (e.g. an index) correctly finds no policy rather than falling back to a pool it was never part of. One producer, one KV namespace. Auto-runs inside the Railway `runLevelsRefresh` loop (not the Cloudflare cron-worker). Routes `/api/levels-v2/{learn,refresh,entries,ledger,status}`; UI `telegram-v2.html`. Full design: `TELEGRAM_V2.md`. | ✅ built |
| **Entry ledger v2** | `js/entryLedgerV2.js` | the daily-learning loop — `recordEntries` (append live signals, dedup standing levels, stores `sl`/`rung`/`trailFrac`), `resolvePair` (honest **limit-fill + held-chandelier trail walk**, reusing `rangeLineAnalyser.walkChandelierExit` — never a second trail implementation — → win/loss/expired/timeout + after-cost `realizedPct`; still-open positions stay unresolved rather than force-closing at a fixed barrier that no longer exists), `ledgerStats` (realized vs policy expectancy per grade), `refitFromLedger` (review-only candidate from realized fills; never auto-overwrites the frozen policy). Pure; tested in `js/telegramV2.test.mjs`. | ✅ built |
| **Confluence count** | `js/confluenceCount.js` | pure `countWithin` (partners within a pip tolerance of a price) + `confluenceBucket` (0·solo / 1·pair / 2·triple+) — tests the "confluence amplifies probability" hypothesis. Tested in `js/telegramV2.test.mjs`. | ✅ built |
| **Confluence test** | `js/confluenceTest.js` | `runConfluenceTest` / `confluenceForPair` / `mergeConfluence` — backtest of "does multi-source S/R make price react?". v2 methodology (un-confounded): confluence = **distinct external source kinds** within tol (`levelSources` PDH/PWH/pivots/round/daily-open/**swing_sr**/**swing_fib**) — **fib ladder excluded** (its density was the confound), and `swing_fib` itself counts distinct swing pairs so it can't re-introduce density; **three-way split** isolates the multi-swing-fib thesis — `fib(cluster)` (a swing_fib cluster aligns) vs `confluent(no fib)` (≥2 other kinds, the generic control) vs `plain(<2)` — so the golden-pocket signal can't be diluted into a generic count; **location-controlled** by fib band (core/mid/outer); reaction measured by **bounce toward mid** (`excMid`) alongside reversion% + after-cost fade edge. Read-only research (does NOT change the live policy). Reuses `runRangeLineAnalyser` (untouched) + `pnlFor` + `collectLevels`. Route `/api/levels-v2/confluence-test`; panel on `telegram-v2.html`. | ✅ built |
| **Alert-v2 core** | `js/alertV2Core.js` | the pure "should this v2 zone alert now?" decision — `selectAlerts` (proximity + min-grade + per-pair filter + per-level cooldown → alerts to send + updated cooldowns), `alertKey`, `pruneCooldowns`, `DEFAULT_V2_ALERT_CFG`. v2's OWN alert config, separate from v1 `ai_alert_cfg`; transport/formatting stay out. Wired into `levelsV2Engine` (sends via Telegram using shared `tg_config`, alerts-only). Routes `/api/levels-v2/alert-config`; config panel in `telegram-v2.html`. Pure; tested in `js/telegramV2.test.mjs`. | ✅ built |
| **Hedge-signal v2 engine** | `js/hedgeSignalV2Engine.js` | the honest rebuild of the v1 correlation hedge — a market-neutral **cointegration** pairs engine. `olsFit`/`halfLife` (Ornstein-Uhlenbeck λ + t-stat), `cointegrationTest` (Engle-Granger: static logA=α+β·logB regression → residual stationarity gate, returns the cointegrating β for money-matching), `rollingSpread`, `backtestPair` (static-residual z, β LOCKED at entry, exits on revert / z-stop / **half-life time-stop**, costs on), `backtestBaseline` (the v1-style plain-spread/all-history-mean/z-only-exit comparator), `runComparison` (per-pair cointegration table + **IS/OOS A/B** v2-vs-baseline), `liveSignal` (latest-bar reading: z, β, half-life, money-match notional ratio, direction). One code path for live + backtest (Lego Principle 1). Reuses `metricsCore`. Pure; tested on synthetic cointegrated/random-walk series in `js/hedgeSignalV2Engine.test.mjs` (9 tests). Server: live producer `computeHedgeSignalsV2` + routes `/api/hedge-signals-v2{,/check,/config,/backtest/run,/backtest/status/:id}`; UI `hedge-signals-v2.html`; index ⚡ Signals dropdown (v1/v2). Rationale: `HEDGING_VS_SPREAD.md`. | ✅ built |
| **Trade-decision fast loop** | `Trade_Decision_Engine/decisionCore.js` | the per-event go/skip scorer (meta-labeling shape): `decide(snapshot, request)` — hard gates (staleness/news/no-zone, fail-closed) → `buildEventFeatures` (bounded 0..1, **relative units** — level type / σ-distance / confluence count, never absolute price; SHARED by live scoring and any future training fit so they can't drift) → `scoreLogistic` → `{decision, direction, probability, size_multiplier, top_factors}`. Action/direction defaulting reuses `selectStrategy` (forecastCore). **Macro socket (platform-review #7, TDE half):** `macroState(riskSens, regime, direction) → ±1|0` resolves the snapshot's direction-agnostic macro context per-direction inside `buildEventFeatures` → ONE signed `macro_align ∈ {−1,0,+1}` feature (sign convention + `MACRO_RISK_SENS_MIN=0.4` frozen pre-registration; `riskSens` must derive from `fx-macro-model` `PAIR_DRIVERS`, never a hand copy; v0 carries NO macro weight — it enters scoring only via a promoted fit). **`htf_align` (HTF_FEATURES) — the research-arc SURVIVOR:** signed ±1/0 trend-alignment (does the trade direction agree with the pair's trailing-20d trend, `snapshot.htfTrend`) — the one feature that beat the chance baseline on honest OOS+cost testing (aligned−opposed ≈ +0.05%/touch IS & OOS; improved the fit's OOS Brier ~10× more than the intraday block). Zero-weighted in v0 like the rest; it's a directional FILTER (separation), net-positive only pooled-OOS — not a standalone signal (ARCHITECTURE §8b). Model weights live in `modelV0.js` (hand-set prior, `calibrated:false` in every response — v1 = fit on the decision log, walk-forward + calibration proof). Pure, deterministic given (snapshot, request, nowMs); tested `Trade_Decision_Engine/decisionCore.test.mjs` (114 assertions, incl. prior monotonicity + macro + htf resolution). Design: `Trade_Decision_Engine/ARCHITECTURE.md` (§7c macro contract, §8b research findings). | ✅ built |
| **News gate** | `Trade_Decision_Engine/newsGate.js` | pure hard/soft news decision over a supplied calendar — `newsGate(events, now, currencies, cfg)` (high-impact within 45m-before/15m-after → hard block; within 4h → soft `news_soon` feature) + `pairCurrencies` (fx base/quote via instrumentRegistry). No fetching in the brick; the slow loop supplies events (Finnhub mapper in `featureState.fetchCalendar`). Candidate consumers to unify later: `nqFetchNewsRisk` (server.js), DecisionEngine event gate. | ✅ built |
| **Trade-decision backfill** | `Trade_Decision_Engine/backfill.js` | day-one training data + candidate fit — `deriveD1Packed` (packed M1 → D1, one typed pass), `backfillPair` (walk-forward replay: per-day `buildSnapshot` on D1 < i → first M1 touch per top zone → the SAME `decide()` the live API serves → `labelOutcome` triple-barrier: SL-first intrabar, TP, else honest mark-to-day-close, after-cost), `fitLogistic` (time-ordered split + embargo → per-decile OOS calibration + Brier, fitted vs v0 prior; **`features` param = ablation socket** — e.g. ±`macro_align` with `embargoDays:30` and `l2ExemptFeatures` for rare features, since L2 shrinkage biases a rare feature toward "it fails"; candidate NEVER self-promotes — `calibrated:false` until a human reads the evidence), **`macroBucketReport` + `MACRO_BUCKET_BAR`** (the PRIMARY macro evidence: per-bucket win/expectancy/per-year + **episode count** — ≤7-day-gap runs; events inside one macro episode are ONE observation; pre-registered bar n≥30 ∧ ≥8 episodes ∧ ≥3 years), **`contextByDate` socket** on `backfillPair`/`runBackfill` (per-day `{macro, calendar}` — how obs-dated FRED history, and later a historical calendar, reach the replay), `runBackfill` (incremental orchestrator: `backfill_state.json` last-date per pair, events JSONL, report JSON; **gap-fills the stored parquet from live OANDA M1 first** via `m1GapFill`+`fetchM1Range`, so the nightly run never waits on the R2 refresh). Reuses `loadM1ForPair`, `gapFillPacked`, `bisect`, `DEFAULT_COST_PCT`. Routes `/api/trade-decision/backfill/{run,status/:jobId,report}` (async-job pattern); nightly top-up ON by default, schedule in KV runtime config `trade_decision_cfg` (`GET/POST /api/trade-decision/config`, caps pattern — env `TDE_BACKFILL_*` = defaults only); UI section on `trade-decision-engine.html`. Pure core tested `Trade_Decision_Engine/backfill.test.mjs` (38 assertions). | ✅ built |
| **Trade-decision slow loop** | `Trade_Decision_Engine/featureState.js` | per-pair `FeatureSnapshot` maintainer — `buildSnapshot` (PURE: D1 bars + calendar → σ via `volSigmaSeries`, regime via `classifyRegime`, T via `dayTypeScore`, σ-percentile via `rollingPercentile`, zone map via `collectLevels`+`clusterLevels` with σ-scaled tolerance; all imported bricks, zero copies), `syntheticSnapshot` (deterministic, no-network demo/test path), `refreshPair` (OANDA `fetchD1` + today's M1 since London midnight (`fetchM1Range`+`londonMidnightSec`) + Finnhub; `macro` passthrough for the KV-`fred`-resolved context — fail-NEUTRAL + `stale:true` when the mirror is old, macro is a modifier never a gate), `startRefresher` (opt-in via `TDE_PAIRS`). `buildSnapshot` accepts an optional pre-resolved `macro` context object (`{regime, riskSens, asOf, stale?}` — never raw FRED; malformed ⇒ null, not a wrong sign), optional `intradayBars`/`sessionOpen` (→ TRUE session open replaces the last-close dayOpen approximation), and **`computeIntradayState`** (pure: today's bars → range-used vs the forecaster's median expected range (`computeBands.hl50` — one source of truth), position-in-range, session VWAP distance in σ, approach speed; live = snapshot block ≤ staleness gate old, backfill = exact per-touch via the decide request; the four `intraday_*` features are ZERO-WEIGHTED in v0, promoted only via ablation fit — the macro discipline). **`computeSessionLadders`** (pure): the RANGE-LINE BOT's Asia/Monday fib ladders via the bot's own `buildRangeLadder`+`bodyRange` bricks (Asia first-6h 5m-bodies with the analyser's validFrom no-lookahead gate; Monday 15m-bodies, never on Monday itself; reach-filtered to ±1.5σ; ≥5-pip min range) **+ the previous session's Asia ladder (`prevAsia`, valid all day) and the today-vs-yesterday 2-pip ALIGNMENT (`asiaAlign`) via `detectConfluencesCore` — the same brick the dashboard/Asia backtest/Pine export share, at the live defaults (2.0 pips, tight 10%, merge 0.3×, session-range cap); aligned clusters carry count 2 and subsume their constituents** → `snapshot.ladders`, merged as time-valid DYNAMIC zones in `decisionCore.dynamicZones` alongside today's developing `session_hilo` extremes (per-source consolidation within ~2 pips — a grid cannot confirm itself), with cross-boundary confluence merge; ladder lines double as backfill touch candidates (0 validFrom violations over a 12y replay). Zone map also carries the `vol_band` source (the volatility bot's six plan lines off the same `computeBands`). D1-only level sources for now (volume_profile/vwap need an intraday feed — flagged, not faked). Routes `/api/trade-decision/{decide,state/:pair,refresh,log,health}`; UI `trade-decision-engine.html`; decisions logged to JSONL (`decisionLog.js`) as the future training set. | ✅ built |

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

### 1d. Python baseplate bricks (`pylego/`) — 2026-06-29

The Python sibling of the JS bricks: a shared `pylego/` package the bots import
from instead of copy-pasting tables/plumbing into every island. **Full plan +
the two-category strategy (generate-don't-port for math/data, consolidate for
execution) is in `PYTHON_LEGO.md`.** Key rule: for **Category-A** (math/data)
bricks the data has ONE source — the JS registry — serialized to JSON and read by
both languages; we do **not** hand-port JS math into Python (that mints copy #7,
the drift bug). **Category-B** (MT5 connect / enter / stop / risk / sizing) are
inherently Python, duplicated across bots, and get consolidated here as new code.

| Brick | File | Owns | Status |
|---|---|---|---|
| **Instruments (Python)** | `pylego/instruments.py` + `pylego/instruments.json` | pip size / digits / asset class / venue symbols / alias resolution, mirroring the JS accessor API (`pip_size`, `resolve_key`, `instrument`, `mt5_symbol`, …); fail-loud on unknown. JSON is **generated** from `js/instrumentRegistry.js` by `scripts/gen_instruments_json.mjs` (one source of truth, both languages). Adopted by `bot/main.py` ✅ (its inline `_PIP_SIZES` now built from the brick); golden-tested in `pylego/instruments_test.py`. | 🟡 built, adoption in progress |
| **JS→JSON bridge** | `scripts/gen_instruments_json.mjs` | serializes the JS registry → `pylego/instruments.json`; `--check` mode guards staleness in CI. The mechanism for every future Category-A bridge (`asset_params.json`, GARCH, regime score). | ✅ built |
| **Point values (Python)** | `pylego/point_values.py` + `pylego/point_values.json` | approximate cash value per pip per lot (sizing input). **Python-owned, NOT JS-sourced** — account-currency dependent, so it's not instrument identity and stays out of the price registry. Canonical = regime_bot == RegimeV2 set. `point_value`/`point_values_for` with explicit default. Adopted by `bot/regime_bot.py` ✅ (non-live). ⚠ DynAnchorBot's values differ → live adoption behind a sizing review. Golden-tested in `pylego/instruments_test.py`. | 🟡 built, adoption in progress |
| **Sizing (Python)** | `pylego/sizing.py` | the `position_size` primitive (risk% → lots, decay discount, min/max clamp). Pure: caller passes pip + pip_value (no globals/MT5). Replaces the per-bot copies. Adopted by `bot/regime_bot.py` ✅; tested in `pylego/sizing_test.py` (incl. golden vs old formula). | 🟡 built, adoption in progress |
| **RiskGuard (Python)** | `pylego/risk_guard.py` | daily/monthly DD lockout + per-pair cooldown state machine, lifted verbatim from `bot/regime_bot.py` (logger injected). Consolidates 4 copies + unwired `safety/risk_gate.py`. Adopted by `bot/regime_bot.py` ✅; tested in `pylego/risk_guard_test.py`. | 🟡 built, adoption in progress |
| **Volatility strategy (Python)** | `pylego/strategy/volatility.py` | the ONLY Category-A logic the Volatility Bot runs: `approach_velocity` (policy cell-key bucket), `line_levels` (OC static / HL dynamic, mirrors `analyseWindow.levelAt`), `neighbours` (inner/outer), `trade_spec` (fade/follow triple-barrier), `cell_key`. **Golden-tested** vs JS vectors generated by `scripts/gen_volatility_vectors.mjs` → `volatility_vectors.json`, so it can't drift from `touchFeatures.approachVelocity`. Everything else is read from the frozen `volatility_bot_plan`. | `volatility_bot` (next slice); `pylego/strategy/volatility_test.py` | ✅ built |
| **Range-line strategy (Python)** | `pylego/strategy/rangeline.py` | the ONLY Category-A logic the Range-Line Bot runs: `body_range`/`resample_to` (session range, == `barUtils.bodyRange`), `build_ladder` (== `rangeLineAnalyser.buildRangeLadder` — same labels → same cell keys), `ladder_side` (above/below mid), `neighbours` (inner toward mid / outer away), `trade_spec` (fade/follow → entry/protect-stop/rung, no fixed TP), `chandelier_stop` (peak ∓ ½·rung floored at protect, == the `c`-path of `_trailExits`), `cell_key`. Everything else read from the frozen `range_line_bot_plan`. Offline-tested in `range_line_bot/engine_test.py`. | `range_line_bot`; `range_line_bot/engine_test.py` | ✅ built |
| **Range-line bot (Python)** | `range_line_bot/` | `engine.py` (`RangeSession` — builds the Asia/Monday ladders, one-shot touches, held-position one-per-(src,side) suppression; `session_anchor_epoch` fixed-UTC window matching the freeze) + `range_line_bot.py` (the live loop: three cadences, reuses pylego `KvClient`/`PaperBroker`/`Mt5Broker`/`position_size`/`instruments`/`point_values`, publishes `range_line_bot_status`). **Exit = the chandelier trailed on the BROKER'S native SL** (`broker.modify` ratchets it through break-even and beyond, no TP) so it survives the bot going offline; **no entries during the 00:00–06:00 formation window**; **skips closed markets** (`broker.tradable`) and **only burns a held-slot on a filled order**. `single_position_per_pair` config flag (default **True**, matches today's live behaviour: the broker blocks a 2nd position on a pair regardless of which ladder slot wants it) — set **False** to pass a per-(src,side) `dedupe_tag` through to the broker instead, so an Asia-ladder and Monday-ladder position can be held concurrently on the same pair, matching the offline held-position backtest (`js/rangeLineAnalyser.js runHeldPosition`, keyed per slot not per instrument — see 2026-07 divergence note). Paper by default, `--live` for MT5. Tested `engine_test.py` (28) + `smoke_test.py` (19: entry→native-SL-trail→broker-exit→journal). | consumes `range_line_bot_plan`; imports the rangeline brick + pylego | ✅ built |
| **MT5 broker (Python)** | `pylego/broker/mt5.py` | `Mt5Broker` — connect/login/account-check, price/ATR/balance, `serialize_open_positions`/`serialize_closed_trades` (the dashboard positions-tab payload, §7), and order `enter`/`stop`/`modify` (trailing-SL, `TRADE_ACTION_SLTP`)/`tradable` (market-hours guard, avoids retcode-10017)/`filling_mode`. Lifted from `bot/regime_bot.py` with magic / symbol-resolver / pip-resolver / MT5 module injected. `enter()` takes an optional `dedupe_tag` (2026-07): unset (every existing caller) blocks on ANY open position for the pair with this magic, unchanged; a caller that passes it narrows the duplicate guard to positions whose comment contains `[{dedupe_tag}]`, so several concurrent positions per pair are possible when each comes from a distinct tag — `range_line_bot` is the first consumer (its `single_position_per_pair` config flag). Adopted by `bot/regime_bot.py` ✅ **and `volatility_bot` + `range_line_bot`** (live path); 12 offline tests against a fake MT5 in `pylego/broker/mt5_test.py`. | `bot/regime_bot.py`, `volatility_bot`, `range_line_bot` | 🟡 built, adoption in progress |
| **Paper broker (Python)** | `pylego/broker/paper.py` | `PaperBroker` — in-memory broker exposing the SAME surface as `Mt5Broker` (`enter`/`stop`/`serialize_open_positions`/`serialize_closed_trades`/`account_balance`/`price`) so a bot swaps live↔paper with no code change, plus `modify`/`tradable` (mirror `Mt5Broker`) and `check_barriers` which executes the SL/TP (a falsy TP = none, so the trailed SL is the sole exit). `enter()` mirrors `Mt5Broker`'s optional `dedupe_tag` (2026-07, unset = no duplicate check at all, same as before). Fully offline-tested (`paper_test.py`). | `volatility_bot`, `range_line_bot` (paper mode) | ✅ built |
| **KV client (Python)** | `pylego/kv.py` | `KvClient.get_json` / `put_json` / `put_status` — dashboard KV reads/writes + the `{data,timestamp}` status envelope; HTTP injected → offline-tested (`pylego/kv_test.py`). | `volatility_bot`; (regime bots later) | ✅ built |
| telegram | `pylego/telegram.py` | alert transport — still a candidate. | — | 🔲 planned |

### 1e. Vol-forecast evaluation brick (2026-06-29)

Built to answer a question the strategy stack *assumed* rather than measured:
which σ estimator actually predicts realised range best, per asset class, OOS.
σ is the ruler bands and "extension past the mean" are measured in, so this grades
the ruler itself. Pure, no-network, covered by `js/volForecastBench.test.mjs`
(24 synthetic checks incl. a no-lookahead contract test on every estimator and an
OLS-recovers-a-known-law test for HAR-RV).

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Vol-forecast bench** | `js/volForecastBench.js` | σ-estimator **evaluation** registry (`ESTIMATORS`) — EWMA(0.90/0.94), HV20/HV30, Yang-Zhang(30), GARCH(1,1) all **imported** from `volBacktestEngine.js` (no copies, re-aligned to a `predictVar(bars)→Float64Array` no-lookahead contract) plus the one new entrant **HAR-RV** (`harRvPred`, walk-forward OLS via incremental normal equations + `solve4`); realised-variance proxies (`realizedVarSeries`: Garman-Klass / squared-return / Parkinson); QLIKE+MSE scoring with full/IS/OOS split (`scoreSeries`); `runBench` ranks by OOS QLIKE; **next-session forecast** for the winning estimator (`latestSigmaForecast`, `sigmaSeriesForExport`, `harRvForecastNext`, `benchCtx`) | `server.js` `/api/vol-forecast-bench/*` + `vol-forecast-bench.html` (linked from `hub.html`) | ✅ |
| **Forecast drift comparator** | `js/forecastDriftCompare.js` | `compareForecastLines(bars, assetClass)` — measures the gap between the **PLAN** forecaster (frozen `nextSigma`/`volSigmaSeries` + `forecastCore` corrections — what the live vol bot's entry LINES are built from) and the **REFERENCE** forecaster (`volForecast.computeForecast` — recalibrated YZ/GARCH σ + its own corrections — what the dashboard chart shows). Returns each band's size (% of price) from both + the signed per-line drift `(plan−ref)/ref` and the σ drift. `+` = plan wider (bot enters later), `−` = narrower (bot line inside the reference → enters early). The two disagree because commodity σ is HV20 (plan) vs YZ (ref) **and** the correction sets differ (even fx, same σ, drifts ~7%). Pure, no-network, tested in `js/forecastDriftCompare.test.mjs` | `server.js` `GET /api/forecast-drift/:pair` (live D1) + `bot-config.html` Volatility tab "Forecast drift vs reference" readout | ✅ |
| **Forecast export** | `js/forecastExport.js` | reproduce the live forecaster's export TEXT for an arbitrary daily σ (e.g. the bench winner): `forecastFields` (delegates band math to `volForecast.js`'s `_buildOutput` + the v2 drift block via imported `_driftD`/`_bmMaxQuantile`/`ASSET_PARAMS` — **never copies the recalibrated correction factors**) + the format builders `buildExportText`/`buildExportV2Text`/`buildExtendedText`/`buildExportHarText` (verbatim copies of the page functions, **golden-tested** byte-identical in `js/forecastExport.test.mjs`); **`harShadowFields` (2026-07-03)** — the daily HAR-RV challenger: bench `sigmaSeriesForExport('harRV')` σ through `forecastFields`, attached as `f.har` per instrument by the scheduler (purely additive — primary fields never move; kill switch `VOL_FORECAST_HAR=0`; delegation golden-tested byte-equal to hand-composing the two bricks) | `server.js` `/api/vol-forecast-bench/*` (export strings in the job result) + `vol-forecast-bench.html` copy buttons + `js/volForecastScheduler.js` (`f.har` shadow block in `/api/vol-forecast`) + `vol-forecast.html` ⬇ Export HAR button | ✅ |

> Imports the incumbent estimators from `volBacktestEngine.js` rather than copying
> them, so the benchmark and the live forecaster cannot silently disagree (Lego
> Principle 1). HAR-RV is a *candidate* estimator — it only earns a place in the
> forecaster if it beats the asset-class incumbent **out-of-sample**; the bench is
> how that's decided, not an automatic adoption.
>
> **HAR-RV daily shadow (2026-07-03):** while that OOS case accumulates, the daily
> forecast run now attaches a HAR-RV *shadow* block (`f.har`) beside every
> instrument's primary fields (`harShadowFields`), and vol-forecast.html grows an
> "⬇ Export HAR" button emitting the same text structure as the main export — so
> incumbent vs HAR-RV vs the reference forecast can be compared line-for-line every
> session. The primary forecast, the per-line book and the bot plan are untouched;
> back-out = `VOL_FORECAST_HAR=0` (or drop the field render).
>
> **Additive exports (visibility-only, zero behaviour change):** to let
> `forecastExport.js` reuse the forecaster's exact band math instead of copying the
> drift-prone numbers, `export` keywords were added to `_buildOutput`, `_driftD`,
> `_bmMaxQuantile`, `ASSET_PARAMS` in `volForecast.js` and `G_ALPHA`/`G_BETA` in
> `volBacktestEngine.js`. No logic changed; `computeForecast` output verified
> identical. The export text is **golden-tested byte-identical** to vol-forecast.html
> so the same Pine indicator consumes it; only the σ comes from the bench winner.

### 1f. Intraday mark-to-market drawdown brick (2026-06-30)

Built to answer an institutional reviewer's audit: the headline portfolio
drawdown is read off the **closed-trade daily-netted** equity curve, which omits
(i) **intratrade MAE** — a fade that runs most of the way to its stop before
reverting to target books as a clean win, its unrealised drawdown invisible — and
(ii) **intraday concurrency** — many positions open at once net to one daily
number, hiding simultaneous open-position drawdown. Both make the closed-trade DD
a *lower bound*; this brick computes the honest tradeable number. Pure, no-network,
covered by `js/intradayDrawdown.test.mjs` (synthetic checks: MAE exposure on a
winning trade, concurrency stacking vs sequential non-stacking, loss = its DD,
midpoint default, malformed→0, MTM deeper than closed, and **coverage** — zero-
duration trades expose no MAE and are counted so a stale dataset can't quote a
flattering ≈1× DD as if it were the correction).

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Intraday MTM drawdown** | `js/intradayDrawdown.js` | `intradayMtmDrawdown(trades)` — portfolio mark-to-market drawdown including intratrade MAE + concurrency. Each trade is a 3-point unrealised-PnL path (0 @entry → −maePct @maeTime → finalPnl @exit, linear between) anchored on its **actual** peak adverse excursion; an active-set sweep over the breakpoint grid sums concurrent open marks + realised PnL and takes peak-to-trough. Self-coerces bar times (epoch-sec / epoch-ms / ISO) to one ms clock so cross-pair concurrency is meaningful. MAE-anchored approximation (real worst excursion + real timing), **not** a tick replay. Also returns **`coverage`/`nPlaced`/`nZeroDur`** (fraction of trades with a real duration — the ones that can expose MAE; zero-duration records contribute realised PnL only and quietly pull the DD back to the closed floor). Also exports **`tradeTimingStats`** (avg/median duration, %zero-duration, avg/median/p95 maePct) — the discriminator proving the intraday uplift is real short-lived mean-reversion, not missing-timestamp zero-duration records | `perLineStrategy.js` `runPerLine` (book `intradayDD`) + `buildSurvivors` (survivor `intradayDD`) — `intradayDDBlock` adds a **`valid`** flag (false when %zero-duration > 5); **`withMtmDD`** (exported) folds the MTM DD into the portfolio stats as the **PRIMARY** drawdown/Calmar basis (`volTarget.maxDDMtm`/`calmarMtm` at 10% vol **plus** `maxDDMtmRaw` = the FULL leverage-free magnitude at realised vol, shown as "max DD (MTM · FULL)"), keeping the closed daily-net figure as a labelled **lower bound** (`maxDDClosed`/`calmarClosed`). The **headline** on both `forecast-analysis.html` (Book tab) and `forecast-book-report.html` is the **standard backtest** battery (`backtestStats`/`metricsCore` — one equity curve, per-trade Sharpe, additive max-DD, Calmar — the same method every other system reports, so it's comparable/explainable); `buildSurvivors` gains a `book` field for the live-universe standard stats. The concurrency-adjusted portfolio Sharpe + MTM DD/Calmar (`withMtmDD` → `volTarget.maxDDMtm`/`calmarMtm`, closed as `maxDDClosed`/`calmarClosed`) are the labelled **secondary** view (§2b "concurrency-adjusted risk"); MTM shows **n/a** on a stale/pre-MTM book. A **timing floor** (in `forecastAnalyser.js`'s barrier walk **and** mirrored defensively in `runPerLine`) gives a same-bar barrier resolution a one-bar minimum hold so `exitTime` never equals `fillTime` — otherwise ~40%+ of trades were zero-duration and the MTM read n/a (timing fields only; outcomes untouched). §2b also carries **`concentrationStats`** (exported): average pairwise daily-PnL correlation, **effective independent bets** `N/(1+(N-1)ρ)`, and single-/top-3-instrument gross-PnL share — quantifying why "N/M pairs profitable" breadth and the per-trade Sharpe both flatter (the USD complex moves as one; gold can carry a week's drawdown). Tested in `js/perLineMtmDD.test.mjs` + `js/perLineConcurrency.test.mjs` | ✅ |

> `forecastAnalyser.js` also exports **`simulateExitVariants(bars, touchIdx, {…})`**
> — a PURE exit-rule simulator that walks the same real M1 path from a touch and
> returns the ten {fade,follow}×{fixed,chandelier,walk,**ride**,**ridehold**} gross
> %-of-price PnLs + an exit-reason (`*Why` ∈ trail/stop/tp/close) for the two rides
> (conservative intrabar ordering: stop-first, then TP, then trail/BE update; no
> intrabar lookahead). **`ride`** = chandelier trail with **no TP cap** (the
> range-line bot's winning exit — `rangeline.chandelier_stop`): a reversion runs
> past the inner line instead of capping there, with a **session-close** fallback.
> **`ridehold`** = the same but walks into `forwardBars` (next day[s]) instead of
> closing at session end — "leave it running past 22:00". `analyseWindow` calls it
> on every hit touch and stamps the `ex*` fields (+ `forwardBars` from `runAnalyser`,
> `rideHoldDays` default 1); `perLineStrategy.extractTouches` carries them through and
> `runExitStudy` prices the OOS A/B/C/D/E off them. Fixed variants match `pnlFor`'s
> pre-cost gross for the same touch. Tested in `js/exitStudy.test.mjs`.
>
> Consumes the analyser's already-computed adverse excursion (`extPct` = the
> continuation extreme for a fade) plus newly-captured `extTime`/`exitTime` timing
> from `forecastAnalyser.js`'s barrier walk — no new MAE math, just timing on the
> existing geometry. The brick reports the raw intraday DD, the raw closed-trade DD
> (same % units) and their **multiple**, so the tearsheet scales the vol-targeted
> headline DD up by that multiple to show a like-for-like honest figure rather than
> mixing raw and vol-targeted units.

### 1g. Event gate + MT5 magic registry (2026-07-02)

The first macro-layer wiring that actually reaches a live entry decision: a
scheduled-event blackout gate for the volatility bot (risk control, not alpha —
the bot no longer sits on fade limits through NFP/CPI/FOMC), plus the registry
that ended the MT5 magic-number collisions found in `PLATFORM_REVIEW_2026-07.md`.

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Event gate core** | `js/eventGateCore.js` | `buildEventWindows(events, cfg)` (Finnhub calendar → per-CURRENCY blackout windows, default 45m pre / 15m post high-impact; explicit-UTC `parseFinnhubTimeUTC` — `new Date('YYYY-MM-DD HH:MM:SS')` parses LOCAL in V8, a 1–5h silent shift), `eventGate(ccys, nowMs, windows)`, `pairCcys` (any symbol form → event currencies; metals/indices → quote leg). Pure, tested `js/eventGateCore.test.mjs` | `server.js` `_refreshEventWindows` (hourly → KV `event_windows_v1`) | ✅ |
| **Event gate (Python consumer)** | `pylego/events.py` | `blackout(ccys, now_ms, windows)`, `pair_ccys`, `stale_reason` — reads the server's PRECOMPUTED windows ("ship timestamps, not logic": no calendar parsing in Python, nothing to drift). Fail-OPEN on stale/missing, loudly. Tested `pylego/events_test.py` | `volatility_bot` (touch during blackout is **deferred, not burned** — the line re-arms after the window; priming ignores blackout; see `engine_test.py`) | ✅ |
| **MT5 magic registry** | `pylego/magics.py` | The ONE table of bot → magic number. `pylego/magics_test.py` parses every registered bot source and fails on mismatch/duplicate/unregistered magic. 2026-07 de-collision: DynAnchorBot 20260006→**20260009**, MacroEquityBot 20260006→**20260010** (legacy read-set until its book turns over), bot/hedge_bot 20260007→**20260011** (legacy read-set; pre-change legs stay in RegimeV7's magic-space until closed) | all MT5 bots (data + CI check; no runtime import) | ✅ |

### 1h. Macro regime brick (2026-07-03) — platform review #7, TDE §7c

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Macro core** | `js/macroCore.js` | `macroRegime(fredHistory, asOfMs)` — the PRE-REGISTERED risk-regime classifier (VIXCLS level+trend, HY OAS 20-obs change; `MACRO_THRESHOLDS` **frozen 2026-07-03 before any backfill result** — editing them after seeing results voids the falsification test); `effectiveDate` (+1-business-day publication lag, Fri→Mon); `macroContext(pair, …)` → the TDE §7c snapshot object (stale >3d ⇒ NEUTRAL + `stale:true`, fail-neutral never fail-closed); `macroContextByDate(pair, …)` → the backfill injection map (per PAIR — riskSens is pair-specific; golden identity: map ≡ `macroRegime` pointwise); `riskSensFor` — **derived from `fx-macro-model.PAIR_DRIVERS` via `resolveKey` at import, zero hand copies** (golden-equality-tested, both key forms). Tested `js/macroCore.test.mjs` (25 asserts incl. end-to-end with `decisionCore.macroState`) | `server.js` (live slow loop `refreshPair(p,{macro})`, backfill route per-pair `contextByDate`, `_loadMacroFredHistoryFull` KV cache) | ✅ |

The verdict machinery lives TDE-side (`macroBucketReport` PRIMARY, ablation
SECONDARY — §7c #5). Sequencing (frozen): one full macro-OFF rebuild on the
`nextSigma` σ (the incumbent baseline — `POST /api/trade-decision/backfill/run
{full:true, macro:false}`), then the macro-ON run, then the two tests. Both
fail ⇒ macro stays out of the feature vector permanently.

Also in this pass (fixes, not bricks — full detail in `PLATFORM_REVIEW_2026-07.md`):
the vol-plan scheduler now fires at **00:05 Europe/London** (fixed 23:05 UTC was
55 min BEFORE London midnight all GMT season → every winter plan anchored on the
prior session's open), the bot **fail-closes on a stale plan** (`_plan_is_current`),
the producer's σ off-by-one is fixed via `nextSigma`, `computeMacroScore`'s
safe-haven sign is scored per-currency and mapped by leg (`js/macroScore.test.mjs`),
net-liquidity now converts WALCL $M→$B before subtracting TGA/RRP (4 sites, with a
unit sentinel + synthetic generators that reproduce the real units mismatch), and
`refreshFredDashboard` mirrors KV `fred` so the Level Bot's `vol_gate` VIX block
can actually fire (with a 24h staleness refusal in `bot/modules/vol_gate.py`).

---

### 1i. Yield-coupling brick (2026-07-04) — measure-first

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Yield-coupling core** | `js/yieldCouplingCore.js` | the price↔yield-spread coupling compute — `standardize` (population-z overlay), `alignByTime` (inner-join two/N `{t,v}` series on common timestamps), `buildSpread` (signed bond-PRICE legs → a yield spread oriented FX-bullish-when-positive; bond price is inverse yield, so the yield sign is the leg coefficient `k`, never a hidden default), `pearson`/`rollingCorr` (**candidates to promote into `statsCore`** once a 2nd consumer wants them), `gapSeries` (standardized price − spread = the error-correction residual in σ-units), `bestLag` (cross-correlation lead-lag scan; +lag ⇒ spread leads price), `directionSignal` (recent standardized-spread slope, gated by \|coupling\| and flipped on inverse coupling), `computeCoupling` (one call → priceZ/spreadZ + the four primitives). Pure, horizon/-resolution-agnostic, no network/DOM. Tested `js/yieldCouplingCore.test.mjs` (29 asserts on synthetic data). | `server.js` `/api/yield-coupling` (measure-first overlay endpoint — fetches the FX pair + OANDA bond-CFD legs, reports per-instrument data availability, returns the overlay + primitives per tenor); `yield-coupling.html` viewer | ✅ built (measure-first) |

The core also runs the **projection gate** (`computeProjectionGate`) — the
trader's ACTUAL method (FOLLOW, not fade): yesterday's yield path is projected
onto today; if price tracks it early in the session, trade ALONG it. Per day it
aligns today's price path vs YESTERDAY's yield path by time-of-day, splits at a
gate hour, and reports whether EARLY tracking predicts LATE tracking
(persistence) and whether high-early-tracking ("gate ON") days show better
afternoon tracking + a >50% follow-through of the projection's direction vs
"gate OFF" days. Intraday only (`/api/yield-coupling` non-daily; `?gateHour=`
tunable); neutral, no verdict. Distinct from the divergence/reversion tests — this
is the confidence-to-follow gate. Panel on `yield-coupling.html`.

The core also runs a **neutral walk-forward** (`walkForwardDivergence`) — the RAW
per-time-fold behaviour with NO trade bias: for each fold it reports the event
count, **reverted%** (the *sign of what price did* — >50% mean-reversion, <50%
momentum — measured, not assumed), mean forward move gross AND net-of-cost, and
Sharpe. No verdict; the numbers are the user's to judge (they flagged that baked-in
trade bias/verdicts were unwanted). Per-fold |gap| threshold, non-overlapping.
Rendered as a data-only per-fold table on `yield-coupling-real.html`
(`?wfQuantile=&wfHorizon=&wfFolds=` tunable). Purpose: is the tail edge stable
across time or one lucky fold.

The core also runs the **convexity analyzer** (`computeConvexity`) — the payoff
SHAPE a hit-rate hides: for each big-divergence event it records **MFE** (max
favorable excursion) and **MAE** (max adverse), normalised by the expected move
(σ·√H), then simulates a **stop + target with PATH-AWARE first-touch** (walk the
bars; whichever hits first wins) across a stop×target grid, netting cost, and
reports EV + hit-rate per cell + the best cell. A green cell = **positive EV even
at a low hit-rate** (the user's convexity thesis, measured) — it can't rescue
symmetric noise after cost. Panels on both `yield-coupling.html` (intraday) and
`yield-coupling-real.html` (daily).

The core also runs the **fade-to-yield backtest** (`backtestDivergenceFade`) —
the actual trade, not a diagnostic: enter when |divergence gap| ≥ an **IS-learned**
threshold (no OOS lookahead), fade toward the yield (gap>0 ⇒ long FX), hold N days,
**mark-to-close** (no intrabar path assumption), net of round-trip cost;
non-overlapping trades; true IS/OOS split; reuses `metricsCore.summarizeTrades`
(+ avgWin/avgLoss/R:R) and reports OOS **cost-stress** (1×/2×/3×). Measures EV/R:R,
which the direction hit-rate couldn't. Surfaced on `yield-coupling-real.html` with
an IS/OOS card, cost-sensitivity, and a horizon×gap-size **robustness sweep**
(lucky-cell guard). Ships only on OOS Sharpe ≥ incumbent at n≥30 surviving 2× cost.

The same core is also run on the **REAL DE–US yields** (not the CFD proxy):
`server.js` `/api/yield-coupling-real` fetches actual daily yields — US from FRED
(`DGS2`/`DGS10`), German (euro-area AAA) from the ECB yield curve, EUR/USD from
FRED (`DEXUSEU`) — builds `spread = DE − US` and runs `computeDivergenceEvents` +
`computeDailyLeadLag` on it. This is the only path that can test the **2Y**
(OANDA has no German 2Y CFD — the 2Y is the lesson's stated *direction* leg).
Viewer `yield-coupling-real.html` (2Y/10Y toggle). `_fetchFredDaily` /
`_fetchEcbDaily` are full-history fetchers (the existing `_worker.js` ECB fetch
only pulls the latest 5 obs).

The core also emits the **divergence-events** test (`computeDivergenceEvents`) —
the CONDITIONAL edge an unconditional correlation can't see: buckets days by the
SIZE of the spread-vs-FX divergence (vol-scaled trailing gap) and reports, per
forward horizon, how often FX moves to CLOSE the gap. The signature of a real
discretionary edge is a hit-rate RISING with divergence size (the ~5% of big-move
days that a per-day Pearson correlation averages into 95% noise). Rendered as a
size-bucket × horizon table (daily + intraday). Diagnostic, in-sample — the test
that matches "big spread move, FX hasn't followed, fade the gap".

The core also emits the **daily lead-lag** test (`computeDailyLeadLag`, endpoint
`granularity=D`) — the macro "spread leads EUR/USD by days" thesis (Cole/
Transatlantic-spread): cross-correlation of daily FX returns vs daily spread
returns across lags 0–30d (optimal lead + full profile) + a spread-momentum →
forward-return test (past N-day spread move → next M-day FX direction, hit vs
50%). Intraday everything was ~coincident (matches the ±2h finding); this tests
the DAILY horizon where the flows thesis says the lead actually lives.
Diagnostic, in-sample.

The core also emits the **prior-day projection** test (`computePriorDayProjection`)
— does TODAY's price path follow YESTERDAY's yield path? (the user's indicator
projects yesterday's yield forward). Groups bars by UTC date, matches consecutive
days by time-of-day, reports pooled/per-day shape correlation (% of days price
tracks) + a "calls the day" hit-rate (yesterday net yield dir → today net price
dir vs 50%). This is a **~1-day-lagged** relationship — outside the ≤2h intraday
lead-lag everything else measured, so the earlier "coincident / weak direction"
verdict never tested it. Diagnostic, in-sample; needs a deep `days=` pull.

The core also emits the **live confirmation reading** (`couplingState`) — the
daily-brief "rates-backed / divergent / decoupled" flag for the newest bar
(regime coupling + session + whether the latest move is rates-corroborated).
**Wired into the daily brief (lens 1, shipped):** `/api/yield-context?symbol=`
(lightweight, cached, reuses the M5 fetch + `couplingState` + a spread percentile)
feeds a "Rates context" section in the `today.html` per-pair drawer — CONTEXT
only, explicitly no direction call (the 22yr conclusion: yield confirms moves, it
does not forecast them).
Measured verdict that scoped it: coupling is real + regime is predictable
(1h autocorr ≈0.82) but **coincident, weak direction** → confirmation/conviction
grade, not a price forecast; `couplingState` is deliberately a context flag, not
a direction call. Lens-1 engine (surfaced on `yield-coupling.html`; daily-brief
`today.html` wiring is the next step).

The core also emits **regime persistence** (`computeCouplingPersistence`,
`laggedAutocorr`) — the "can we predict WHEN price follows the yield" test:
autocorrelation of the rolling coupling (is the regime sticky?), conditional
forward coupling (coupled-now → coupled-later?), and a directional hit-rate
(trailing yield-vs-price divergence → forward price direction, coupled vs
decoupled bucket, no-lookahead). Diagnostic (in-sample, no costs) — proves the
edge EXISTS before any harness.

The core also emits **returns-based coupling** (`toReturns`, `computeReturnsCoupling`,
`sessionBreakdown`, `sessionOfUTCHour`, `SESSIONS`) — correlating price *changes*
vs spread *changes* (the trading-relevant test; level correlation is spurious for
two drifting series) plus a per-session (Asia/London/Overlap/NY, UTC-hour)
coincident-corr breakdown, so we can see whether the coupling concentrates in the
active rates-lead-FX hours. Measured finding (EUR/USD, ~5mo M5): level coupling
washes out to ~0 over months (the +0.55 one-week reading was a transient regime);
returns/session is the deciding test for whether any tradeable edge survives.

The `/api/yield-coupling` endpoint also has a **deep-history mode** (`?days=`):
date-paginated forward fetch (`_fetchCouplingRange`, ≤30k bars) plus a cheap
earliest-available-bar probe per instrument (`_probeEarliestBar`), yielding a
**history-ceiling verdict** (feasible ≥24mo / marginal ≥6mo / too-shallow) — the
binding limit for any lens-2 backtest. Deep-pull plot arrays are downsampled to
~2500 pts; the coupling stats are computed on the full series.

The measure-first stage: prove the coupling is real on 5m and learn how much
intraday bond-CFD history OANDA actually serves, **before** wiring the planned
consumers (daily brief reading, coupling-gated z-score strategy, directional
drift hook into `dayTypeScore`/`selectStrategy`, regime filter, divergence
alert). Data reality it surfaces: OANDA carries US Treasury CFDs (2/5/10/30Y) +
the Bund (`DE10YB_EUR`) and Gilt (`UK10YB_GBP`) 10Y only — **no German/UK 2Y
CFD**, so 2Y spreads are US-leg-only (flagged `partial`). The 10Y spread is the
fully-constructible one. A backtest consumer is gated on the bond M1 history
depth the tool reports; the live/display consumers are not.

---

### 1j. Trend-basket engine (2026-07-05) — the honest factor strategy

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Trend basket** | `js/trendBasketEngine.js` | diversified G10-FX time-series-momentum backtest — `alignSeries` (inner-join `{ccy:[{t,v}]}`), `runTrendBasket` (per-currency 12-mo trend sign → long up / short down, **inverse-vol / equal-risk** sizing to a target vol, weekly rebalance, **round-trip cost on turnover**, true IS/OOS split, equity curve, per-year, current positions, + an **equal-weight long-basket benchmark** so we know it's the *factor* not a USD bet). Pure; reuses `statsCore` + `metricsCore` (`sharpeRatio`, `maxDrawdownFromEquity`). Tested `js/trendBasketEngine.test.mjs` (10 asserts incl. trends-profit + cost-drag). | `server.js` `/api/trend-basket` (fetches ~20yr D1 for 7 ccys vs USD via `fetchOandaD1Range`, `USD_*` inverted); `trend-basket.html` viewer (IS/OOS card, equity curve, per-year, positions, honest "diversifier not wealth-engine" framing) | ✅ built |

The pivot after the yield investigation nulled: instead of hunting a directional
signal on one liquid pair (the picked-clean spot), harvest the **replicated,
diversified** momentum premium across many currencies — small Sharpe, real
drawdowns, honest. Distinct family from the yield work; new engine + page. Phase 2
(carry: rank by short-rate, blend 50/50 with trend) needs G10 short-rate data
(FRED/ECB partial; the rest is the sourcing work).

### 1k. Z-Score V2 confidence core (2026-07-06) — macro as confidence, not gate

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Z-Score confidence core** | `js/zscoreConfidenceCore.js` | pure, network-free confidence-scoring bricks for the "z as confidence, not gate" reframe. **Phase 1:** `zAlignScore` (nominal carry confirms/vetoes the fade), `riskOffScore` (VIX+HY carry-crash veto), `approachVelRangeScaled`/`velToScore` (OOS-proven approach spike), `structScore` (fib depth — folklore, ablate-first). **Phase 1.5** (cross-asset macro docs): `realRateAlignScore`+`usdRole` (US 10Y real-yield DFII10 USD bias — the literature's preferred read over nominal), `coherenceScore` (fraction of directional macro lenses agreeing — the docs' "coherence→conviction"), `positioningBoostScore` (COT extreme the fade opposes), `isNfpFriday`/`eventVetoActive` (FOMC/NFP/CPI hard veto — NFP intrinsic). `compositeConfidence` is evidence-tiered + **null-skipping** (weight-0 OR no-data → factor drops out, rest renormalise). Plus `confBucketOf`/`computeConfBuckets` (monotonicity falsification), `buildSingleRollingZByDate`/`buildRiskOffByDate`, `splitTradesByDate` (IS/OOS). Tested `js/zscoreSpreadV2Engine.test.mjs` (40 asserts). | `js/zscoreSpreadV2Engine.js` (I/O engine: imports v1's FRED/session/fill helpers — now exported — + this core; fetches GS2/foreign-short/VIX/HY/DFII10; `runFullZScoreV2Backtest`); `server.js` `/api/zscore-v2/*` (A/B vs v1 gate); `zscore-v2.html` (OOS A/B card + 7 ablation weights + event-veto + bucket falsification) | 🟡 built, **not yet validated** (needs live `FRED_KEY` on Railway — sandbox can't reach FRED, and synthetic FRED is unreliable for this exact change). Positioning factor is null until a historical COT series is wired. |

Phase 1 of the zone→direction→confidence build. Reframes v1's binary z-gate:
the fib zone is the **structure**, direction comes from **fade geometry**, and the
yield-spread z-score is demoted to **one weighted confidence factor** beside a
research-backed **risk-off veto** (the literature's carry-crash gate) and the
internally-OOS-proven **approach-velocity**. Every factor is evidence-tiered and
independently ablatable so the A/B can *invalidate* ideas on the OOS card. v1's
`fetchFredObservations`/`_shiftDate`/`buildRollingZSeries`/`buildDayIndex`/
`analyzeDay`/`walkTrade` were exported (no logic change) so V2 imports, never copies.
**Built ≠ proven** — the real "does confidence beat the gate?" A/B must run on
Railway; do not read any local run as edge.

---

### 1l. Macro-direction predictiveness test (2026-07-07) — falsification-first, before levels/z

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Macro-direction core** | `js/macroDirectionCore.js` | pure, network-free scoring for "does macro DIRECTION lead forward FX drift?": `pairLegs`/`usdRole`/`havenTilt`/`CURRENCY_HAVEN` (pair orientation), `carryVote`/`realVote`/`riskVote` (replicated FX-directional factors as ±1 votes — 2Y-diff momentum, US real-yield momentum, VIX momentum by haven leg), `macroDirScore` (mean of votes, null/0-weight drops out), `forwardReturn`, `spearman` (rank corr), `summarizeDirection` (hit%, mean ret, Sharpe, corr — non-overlapping samples), `splitByDate` (IS/OOS). Tested `js/macroDirectionCore.test.mjs` (18 asserts). | `js/macroDirectionEngine.js` (I/O: reuses z-engine's `fetchFredObservations`/`buildDayIndex` + `loadM1ForPair` for M1→daily closes; per-horizon 1/5/20d, per-factor attribution, buy-&-hold benchmark, cross-pair pooled OOS); `server.js` `/api/macro-direction/*`; `macro-direction.html` (pooled OOS verdict + per-pair + per-factor) | 🟡 built, **not yet run** (needs live FRED + M1 on Railway) |

This is the **falsification-first** step under the "macro sets direction, levels time the entry, z-score exits" bot: test the *foundation* (does macro direction predict drift at all) before building level entries or the z-exit on top. No fib levels, no z-gate — just macro→forward return. If it's null, the premise is dead cheaply; if it leads, the entry/exit build has a load-bearing base. Z-score is explicitly demoted here to a future **exit** (z-exit), not part of this direction test.

---

### 1m. Range-level edge test (2026-07-07) — the S/R folklore falsification

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Range-level core** | `js/rangeLevelCore.js` | pure test of "does a 5m range level have ANY standalone edge vs a placebo": `FIB_LADDER`/`buildLadder` (half-integer grid off a session range), `findConfluence` (today∩yesterday ladder match within tol), `mulberry32` (seeded PRNG for reproducible placebo shifts), `barrierRace` (symmetric ±D bounce-vs-break race, same-bar tie → break), `summarizeRace` (bounce rate + after-cost expectancy over resolved races), `edgeVsPlacebo` (real − placebo bounce delta). Re-exports `splitByDate`. Tested `js/rangeLevelCore.test.mjs` (13 asserts). | `js/rangeLevelEdgeEngine.js` (I/O: reuses `loadM1ForPair` + the z-engine's `analyzeDay`/`buildDayIndex`; real levels = Asia edges + today∩yesterday confluence, each with a shifted PLACEBO control; per-pair + pooled OOS); `server.js` `/api/range-level-edge/*`; `range-level-edge.html` | 🟡 built, **not yet run** (needs M1 on Railway) |

The **foundation-below-the-foundation** test: before macro/z/confidence, does price "respect" a range level more than a random price? The only honest S/R test is vs a **placebo** (same level shifted to the wrong spot) — if real ≈ placebo, "levels work" is folklore. Symmetric barrier (no R:R to game), after-cost, IS/OOS. Ordered after the macro-direction null: prove the *level* has edge before asking whether a (weak) macro filter improves entry selection.

### 1n. Cross-pair forecast-behaviour research (2026-07-08) — the "trend spotter"

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Cross-pair research** | `js/crossPairResearch.js` | pure SYNTHESIS over the already-persisted per-pair research JSON (`vfr_research` + optional `intraday_research`) — reads the AGGREGATES, does not re-run engines. `pairType`/`PAIR_TYPE_LABELS` (major/eur-cross/jpy-cross/other-cross/gold/index), `signTestP` (two-sided binomial), `analyzeCrossPair(vfr, intraday, opts)` → `{ reliability, trust, byType, consistency, hidden, hypotheses }`: (A) cross-pair **consistency** — per-metric sign test → Benjamini–Hochberg → `robust` only if it also spans ≥2 pair types; (B) **trust tiers** trade/caution/exclude via hard rules + robust-z (median/MAD) outliers + bottom-tertile; (C) **pair-type profiles**; (D) percentile-ranked composite **reliability score** (calibration/skill/sharpness/low-error, weights 0.30/0.30/0.25/0.15); **(Phase 2) `hidden`** — aggregates each pair's `featureScan` into cross-pair predictor→miss relationships + pooled day-types; **(Phase 2b) `hidden.session`** — within-day session-share→miss relationships (same discipline); **(2c) `touchBehaviour`** — folds the intraday touch study cross-pair (touch rate, fade-vs-follow sign test, MFE/MAE, fade-in-range/follow-in-trend split) — the BOT-relevant layer; **`costSurvival`** — the Q8 make-or-break screen (each touch → ±20-pip symmetric bracket, per-touch net = `20×|revFrac−contFrac| − cost` at cost ×1/×2/×3, `COST_PIPS` table); **FX-aware verdict** (indices discounted) and **`byLine`** comparison of **five fade lines** — **median** (≡ open-close: note `oh/ol_median` alias `oc_median` in the forecaster), **75th**, **calm-day median** (`touches.conditionalCalm`, the short-gamma tail filter), and the **dynamic H-L range** median + 75th (`touches.dynExtension`/`dynP75Extension` — the opposite extreme projected from the RUNNING high/low, moving intrabar via `_dynLevelOutcome`, the M1-justifying level set; see `CONDITIONAL_FADE_DESIGN.md`); the touch study now runs on **walk-forward recalibrated** bands (level distances scaled by trailing realized÷forecast H-L — the bands a bot would trade, not the too-wide raw lines; `touches.bandsRecalibrated`/`recalFactor`, opt-out `recalibrate:false`); **the three GATES**: `touchBehaviour.placebo` (G1 — is the forecast level > a jittered placebo? sign test + type spread), `touchBehaviour.payoffShape` (G2 — is fading short-gamma? median skew + avg-win/avg-loss across pairs), and `portfolioIndependence(returnsByPair)` (G3 — effective independent bets = participation ratio n²/ΣC²ᵢⱼ of the daily-return correlation matrix); **`botQuestions`** — 3 gates + the 8-question funnel, tagged answerable/GAP; **`trust`** tiers are now RELATIVE terciles of reliability + a sharpness≤0 floor (the old absolute skill/calibration gates wrongly excluded the whole universe); **`recal`** passthrough surfaces the reference-forecaster drift. Tested `js/crossPairResearch.test.mjs` (11 asserts incl. touch-behaviour + relative tiers). | `server.js` `GET /api/cross-pair-research`; **`cross-pair-research.html`** (canonical page, linked from `index.html`; see `BOT_DECISION_QUESTIONS.md`) + `vol-research-book.html` chapter (summary + link) | ✅ built (Phase 1+2+2b+2c) |
| **Per-hit line-fade study** | `js/intradayForecastResearch.js` (`touches.perHit`) | for each STATIC forecast line (O-H/O-L median & 75th, O-C median & 75th) the post-touch excursion is now measured **separately from each of the first N taps** (`_perHitExcursions`, `MAX_HITS=6`), so the fade (MAE, reversion back toward the interior) vs blow-through (MFE continuation, `continuePct`) can be read **per hit** — bucketed 1st / 2nd / 3rd+ and sliced by BULL/BEAR/RANGE. Each bucket: `{ n, continuePct, reversePct, meanFadePct, meanContPct, meanFadePips, meanContPips }` (% is vs the line price so it composes cross-pair). Tests the "3rd hit blows through" folklore — a rising `continuePct` by the 3rd+ tap = the line has stopped holding; a `good` finding fires when 1st→3rd+ blow-through rises >5pp. Dynamic day-H/L lines are excluded (they move intrabar). Tested `js/intradayForecastResearch.test.mjs` (per-hit partition + hand-crafted 1st-fades/3rd-blows-through). | `server.js` `/api/intraday-research` (auto-serialized via `evaluateIntradayAllHorizons`); **`today.html`** per-pair drawer "Line fade by hit" table (daily/weekly toggle, regime selector, 1st/2nd/3rd+ columns) | ✅ built |
| **Band-calc A/B** | `js/bandCalcAB.js` | `bandCalcAB(dailyBars, assetClass)` — walk-forward evaluation of candidate range CALCS (Feller×corr ≈ current page, pure Feller on YZ/HV20/EWMA σ, **climatology** trailing-HL quantiles, **empirical ratio × σ** self-scaling) scored by **calibration** (exceed-median→50 / exceed-75→25), **sharpness** (corr forecast↔realized), MAE/bias; ranks by calibration miss (sharpness tiebreak). Answers "is the Feller-constant band right, or is an empirical calc better?" Reuses σ estimators + BM constants from `volBacktestEngine` (never copied). Tested `js/bandCalcAB.test.mjs` (empirical calcs self-calibrate ~50/25, ranker orders by calib, no-lookahead). | `server.js` vfr run attaches `summary.bandCalcAB`; `crossPairResearch._bandCalcFold` → `bandCalc` (cross-pair median per calc); `cross-pair-research.html` "Base calc" section | ✅ |
| **Forecast feature scan** | `js/forecastFeatureScan.js` | pure per-pair "hidden relationships" + day-type layer over the engine's per-day `rows` — `scanFeatures(rows, {sessionByDate})` → `{ correlations, importance, missProfile, dayTypes, sessionRelationships }`. Only **causal** predictors (regime, forecast-time vol/vov, trailing climatology, recent÷baseline realized range, yesterday's outcome) — never same-day realized features (lookahead). Spearman corr vs miss-size + completion; feature-importance rank; big-miss profile; seeded (deterministic) k-means day-type clustering; **(2b) `sessionRelationships`** — when a per-day session series is joined, Asia/London/NY share correlations vs miss (labelled within-day / descriptive, NOT pre-open). Tested `js/forecastFeatureScan.test.mjs` (8 asserts incl. planted vov→miss + planted Asia-share→miss recovery). | `server.js` vol-forecast-research run attaches `summary.featureScan = scanFeatures(ev.rows, {sessionByDate})` per pair (session series from `dailySessionContributions`); consumed by `crossPairResearch.hidden` | ✅ built (Phase 2+2b) |

The **anti-overfit layer** over the per-pair book: not "was one pair's forecast right?" but "which patterns hold across pairs of different *types* (worth trusting) vs pair-specific noise, and which pairs to discount." Analysis, **not** a strategy — the decision/selector layer is an explicitly deferred Phase 3, gated on this surfacing robust, type-diverse structure (see `CROSS_PAIR_RESEARCH_DESIGN.md`). **Phase 2** runs the per-day feature scan where the engine's `rows` exist (server run-time, attached as `summary.featureScan`) rather than persisting 65k raw rows; **Phase 2b** joins the per-day session series (`dailySessionContributions`) for within-day session→miss relationships. Remaining boundary (2b-ii/2c): session-contribution *accuracy* needs the forecaster to emit an Asia/London/NY split; macro/news conditioning needs an economic-calendar join.

### 1o. Vol-forecast level-proximity alert brick (2026-07-09)

| Brick | File | Owns | Consumers | Status |
|---|---|---|---|---|
| **Vol-level alert core** | `js/volLevelAlertCore.js` | the pure decision + message logic for the vol-forecast-v2 level-proximity Telegram alerts — a **selector/formatter** brick that owns NO math, only composes existing bricks: `approachSpeed` (net-displacement-over-ATR "blasting vs drifting" via `indicatorCore.atrWilder`), `momentumZ` (WaveTrend WT1 latest z-score via `vumanchuCore.waveTrendSeries` + `statsCore.rollingZAt`), `divergenceLabel` (regular/hidden divergence via the `vumanchu.detectDivergence` brick), `scanNearLevels` (live price → forecast levels within a per-pair pip threshold; O-H/O-L med+75th direct, H-L med+75th projected into upper/lower price extremes from the session open), `formatAlert`/`evaluatePair` (pretty informational Telegram text — `pairIcon` country-flags/🥇/index glyphs, `LEVEL_NARRATIVE` plain-English level meaning, explicit current + level price). `LEVEL_LABELS`/`ALERT_LEVEL_KEYS` registry. All pure (bars/levels/price in → object/string out) — tested `js/volLevelAlertCore.test.mjs` (10 asserts, synthetic bars, no network). | `server.js` `checkVolLevelAlertsNow` loop (90s) + `/api/vol-forecast/level-alerts/*` config/creds/test/scan endpoints, reading levels from the extracted `computeDailyBrief()` (one source of truth with the dashboard); config UI on `vol-forecast-v2.html` (🔔 Level Alerts panel, dedicated Telegram bot) | ✅ built |

The alert loop reads its levels from `computeDailyBrief()` (the `/api/daily-brief` builder extracted into a reusable function in this pass) so the alerts fire on the *exact* prices the dashboard shows — no second copy of the level math. Uses its OWN dedicated Telegram bot (`tg_vollevel_config` KV) separate from v1 + levels-v2; config in `vol_level_alert_cfg`. Enrichment candles come from the shared OANDA candle path (M5). All alerts are explicitly informational — no trade signal.

---

## 2. Candidate bricks — mapped, prioritized, not yet extracted

Ranked by **drift risk × reuse**. "Live" = a copy runs in a production bot, so a
drift directly desyncs trading from its backtest (the worst case).

### P0 — highest leverage (live ↔ backtest disagreement, or PnL-corrupting)

| # | Candidate brick | What it owns | Duplicated in (file:line) | Risk | Notes |
|---|---|---|---|---|---|
| 1 | **`assetParams` + BM/HN constants (single source)** | Brownian range constants + per-asset-class correction factors | `volBacktestEngine.js:22-34` (canonical) vs **divergent** copies: `volForecast.js:45-50,115-120` (Jun-26 recal), `forecaster-backtest.html:471-481`, `VolRangeForecaster/vol_*.py`, `ForecasterOptimizer/engine.py`, **live** `TradingBot/dyn_anchor_bot.py:44-47`, **live** `DynAnchorBot/dyn_anchor_mt5_bot.py:46-62` | 🔴 CRITICAL | 6+ correction-factor sets from a June recalibration applied unevenly → live bots forecast different ranges than backtests. Make `volBacktestEngine` the source; Python imports via a generated JSON. |
| 2 | **GARCH(1,1) σ series** | close-to-close GARCH vol | `volBacktestEngine.js:152-164` (α=0.06,β=0.91) vs **live** `js/vol.js:54-68` (**α=0.10,β=0.85,ω=1e-7**); Python ports match backtest | 🔴 CRITICAL | Live `vol.js` is structurally different from every backtest. Decide the canonical (α,β) and parameterise. |
| 3 | **Instrument registry (Python side)** | pip size, point value, MT5/OANDA/Yahoo symbols | 🟡 **IN PROGRESS** — `pylego/instruments.py` reads generated `instruments.json`; `bot/main.py` adopted (pip size). Still inline: `bot/regime_bot.py:59-93` (**only place with `_PIP_VALUES`**), `RegimeV2/regime_bot_v2.py`, `bot/{backtest,hedge_bot,position_hedge_bot}.py`, `VolRangeForecaster`, `portfolioBacktest`. **pointValue/`_PIP_VALUES` NOT yet bridged — drifted (EUR/JPY 6.5 vs 9.0) + account-currency dependent → sizing change behind risk review.** | 🔴 CRITICAL | A single wrong pip = 10× PnL error. `instruments.json` (JS→JSON) is the bridge; adopt one bot at a time (PYTHON_LEGO.md §5). |
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
| 12 | **Volume profile (POC/VAH/VAL/nPOC)** | value-area + age-weighted naked POC | `js/profileShapeCore.js` `valueArea` (new pure JS home for the histogram→POC/VAH/VAL walk) vs inline copies in `levelSources.volumeProfileLevels:145-170` + `confluenceModules.js:266-312` (no nPOC age) vs `Gold/modules/volume_profile.py:52-147` (full nPOC stack) vs `GoldV2/modules/volume_profile.py` (verbatim copy of Gold's — V1 is frozen so no drift *yet*; retire both into `pylego` when adopted). Next unification: retire the `levelSources`/`confluenceModules` inline walks onto `profileShapeCore.valueArea`. | 🟠 HIGH |
| 13 | **Pivots / VWAP anchors** | Camarilla pivots, session VWAP, session-open anchors | `Gold/modules/session_engine.py:66-201` (only full impl) vs `GoldV2/modules/session_engine.py` (verbatim copy); backtests omit VWAP anchors entirely | 🟠 HIGH (backtest↔live gap) |
| 14 | **Confluence scorer** | weighted zone ranking across level types | `Gold/modules/confluence_scorer.py:56-186` vs `asiaRangeEngine.runModuleChecks` (module-hit-count, no cross-impulse/nPOC-age/VWAP) | 🟠 VERY HIGH (backtest↔live gap) |
| 15 | **Swing-pivot detection** | N-bar high/low S/R | `confluenceModules:209-223`, `backtest-engine:189-203`, `range-bias:288-303`, `backtestSystem/indicators.py:111-122`, `Gold/modules/fib_engine.py:100-113`, `GoldV2/modules/level_matrix.py:_find_pivots` + `GoldV2/modules/htf_bias.py:_find_pivots` (N varies) | 🟠 MEDIUM |
| 15b | **Gold-bot fork copies (V1→V2)** | GoldV2 is a versioned fork of Gold (house rule: version, don't overwrite). `volume_profile.py` / `session_engine.py` / `trendline_engine.py` are verbatim copies; `vumanchu.py` diverges deliberately (WT-mandatory + fuel veto); `level_matrix.py` replaces `fib_engine.py`+`confluence_scorer.py`. V1 is frozen, so copies can't drift while it lives — but when V2 wins the A/B, extract the three verbatim modules into `pylego` instead of letting a V3 copy them again. | `Gold/modules/*` vs `GoldV2/modules/*` | 🟡 MEDIUM (frozen incumbent) |

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
| MT5 position serialization (`_serialize_open_positions`) | 🟡 **extracted** → `pylego/broker/mt5.py` (`Mt5Broker.serialize_*`); `bot/regime_bot.py` adopted. Still inline: `bot/main.py:123-145`, RegimeV2/V4/V7, DynAnchorBot | 🟠 HIGH |
| Python position sizing (risk% → lots, decay) | 🟡 **extracted** → `pylego/sizing.py`; `bot/regime_bot.py` adopted. Still inline: `RegimeV2` (`×0.5` decay variant), V7, DynAnchorBot | 🟠 HIGH |
| MT5 connect/login + account check | 🟡 **extracted** → `pylego/broker/mt5.py` (`Mt5Broker.connect`); `bot/regime_bot.py` adopted. Still inline: `bot/main.py`, RegimeV2/V7, DynAnchorBot | 🟡 MEDIUM |
| KV client (get/put/status push) | `bot/main.py`, `bot/regime_bot.py`, `RegimeV2:189-209`, V7; partial `bot/utils/state_reader.py` | 🟡 MEDIUM |
| RiskGuard (daily/monthly DD lockout) | 🟡 **extracted** → `pylego/risk_guard.py`; `bot/regime_bot.py` adopted. Still inline: RegimeV2/V7, DynAnchorBot; unwired `safety/risk_gate.py:116-309` | 🟠 HIGH |
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
9. **✅ CLOSED — Telegram-v2 vs the range-line bot learned the SAME Asia/Monday
   touches with TWO DIFFERENT policies.** `js/rangeLineBotProducer.js` (feeding the
   LIVE `range_line_bot`) already used the RANGE_EXTENSION_GUIDE.md §13 spec
   (per-instrument, no condition, held-chandelier pricing). `js/levelsV2Learn.js`
   (feeding telegram-v2) instead ran a pooled cross-pair policy conditioned on
   `approachVel`, priced by a fixed adjacent-line barrier — both §12 and §14 (which
   landed in the SAME build window as v2, but were never fed back in) later proved
   that variant loses on the honest single-pair unit. Symptom: every live v2 grade
   capped out around B (edge scale ~0.02%/touch vs the §13 book's ~0.095–0.48%).
   **Fix:** `levelsV2Learn.js` now calls `perLineStrategy.buildPolicy({pricer:
   pnlHeld})` per instrument — the SAME bricks `rangeLineBotProducer` freezes —
   so telegram-v2 and the bot grade one edge, not two drifted copies of it. Detail:
   `TELEGRAM_V2.md`'s "v3 correction" note.

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
- [~] Generate `instruments.json` from `instrumentRegistry` and have the Python
      bots + backtests read it (single pip/symbol source across languages).
      ✅ bridge built (`scripts/gen_instruments_json.mjs` → `pylego/instruments.json`),
      ✅ `pylego/instruments.py` + `bot/main.py` adopted (pip size). Remaining bots
      + `_PIP_VALUES` unification tracked in `PYTHON_LEGO.md §5`.

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

---

## 5. Market Valuation Engine (MVE) — isolated subsystem (`js/mve/`)

> A self-contained set of bricks implementing the fair-value / mispricing engine
> designed in `MARKET_VALUATION_ENGINE.md`. **Isolated by design:** nothing live
> imports it, it adds no route, and it's unit-tested on synthetic data
> (`node js/mve/mve.test.mjs`, 59 assertions). Reuses `statsCore` + `backtestStats`
> (`deflatedSharpe`) read-only — copies nothing. Usage: `MVE_RUN_GUIDE.md`.
> Status ✅ = built & tested (edge **unproven** — needs a live data adapter + OOS run).

| Brick | File | Owns | Status |
|---|---|---|---|
| Linear algebra | `js/mve/linalg.js` | solve/inv/transpose/quad for OLS/Kalman/Mahalanobis | ✅ |
| Multi-factor OLS | `js/mve/ols.js` | fit + **prediction σ** (β-estimation error); generalizes `compassDivergence` | ✅ |
| Validation harness | `js/mve/validation.js` | purged/embargoed walk-forward, band calibration, `deflatedSharpe` re-export | ✅ |
| Emitter contract | `js/mve/contract.js` | `estimate()→{fairValue,σ,confidence}`, Bucket A/B/C split | ✅ 📄 |
| Fair-value emitters | `js/mve/emitters.js` | regression (BEER-lite), AR1, vol/positioning weights | ✅ |
| OU convergence | `js/mve/ou.js` | half-life, P(revert)/magnitude/CI, empirical snap-back | ✅ |
| Mispricing | `js/mve/mispricing.js` | standardized residual, **Mahalanobis**, Bayesian posterior | ✅ |
| Regime weights | `js/mve/regimeWeights.js` | regime-adaptive weight table (generalizes `gold-model.js REGIME_WEIGHTS`) | ✅ |
| Ensemble | `js/mve/ensemble.js` | precision/min-variance consensus + dispersion + effN | ✅ |
| Kalman SSM | `js/mve/ssm.js` | hidden-state fair-value fusion (emitters = observations) | ✅ |
| Factor model | `js/mve/factorModel.js` | shared-factor cross-asset loadings + coherence (safe Relationship Engine) | ✅ |
| Confidence engine | `js/mve/confidence.js` | logistic over agreement/fit/calibration/regime/reversion | ✅ |
| Orchestrator + card | `js/mve/index.js` | `runMVE()`, `valuationCard()`, `valuationText()` | ✅ |
| Signal adapter (opt-in) | `js/mve/signalAdapter.js` | blend MVE into `computeSignalScore` — **not wired** | ✅ 📄 |
| Live data adapter | `js/mve/liveAdapter.js` | real OANDA D1 + FRED → `runMVE` ctx (FX=rate diffs, gold=real yield+DXY); injected fetchers, pure `buildContext` | ✅ |
| Live endpoint | `server.js` `/api/mve/:sym` | additive read-only route (1h cache); does NOT feed any signal/bot | ✅ |
| Demo page | `mve.html` | synthetic sandbox + **live** (OANDA+FRED) toggle | ✅ |

**Not yet built (deliberate next steps, per `MVE_RUN_GUIDE.md` §7):** dashboard wiring
(signal score / entry scanner / AI summary — the opt-in `signalAdapter` shows the blend),
and OOS proof on real feeds before any real capital. The live endpoint is surfacing-only.
