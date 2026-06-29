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
| Per-line strategy | `js/perLineStrategy.js` | per-line confidence engine — `extractTouches`, `buildPolicy` (fade/follow/skip per cell, IS-learned, **after-cost expectancy gate**), `pnlFor` (triple-barrier + honest mark-to-close), `runPerLine` (pooled-IS → per-pair OOS book + equity + trade log + **portfolio** stats + **`survivors`** live-universe block), **`buildSurvivors`** (keep pairs whose OOS net expectancy clears their own spread by a margin, re-aggregate just their daily PnL into an honest portfolio), **`runRigor`** (walk-forward / per-year / cost-sensitivity / IS-vs-OOS), **`runSensitivity`** (OAT parameter grid → per-combo Sharpe/breadth + per-obs trial Sharpes for deflation); `runPerLine` also emits a **`missed`** summary (skipped OOS touches by reason: unseen-in-IS / low-N / edge-below-cost) | `forecastAnalyserStore` (orchestrator + routes); imports `metricsCore`, `backtestStats` | ✅ |
| Backtest stats | `js/backtestStats.js` | the standard battery for a trade-PnL series — Sharpe/Sortino/Calmar/CAGR/PF/payoff/win-rate/expectancy/max-DD+duration, **bootstrap CIs**, **Monte-Carlo** drawdown, **`portfolioStats`** (honest daily-aggregated Sharpe ×√252 + vol-targeted CAGR/DD + **Probabilistic Sharpe**), **`deflatedSharpe`** (López de Prado DSR — discounts Sharpe for the number of trials/search, via inverse-normal expected-max-Sharpe); deterministic seeded PRNG | `perLineStrategy`, `forecastAnalyserStore`; imports `metricsCore` | ✅ |
| Volatility-bot plan | `js/volatilityBotPlan.js` | `buildVolatilityPlan(book, volByPair)` — turns the frozen per-line book + today's live per-pair σ/open into the compact artifact the live `volatility_bot` consumes (survivor universe, fade/follow policy cells, per-pair band fractions via canonical `computeBands`). Category-A "ship it a file" contract (PYTHON_LEGO.md §0) — the bot never re-implements the vol math. Pure, tested in `legoBricks.test.mjs`. | `volatilityBotProducer`; imports `forecastCore` | ✅ |
| Volatility-bot producer | `js/volatilityBotProducer.js` | `refreshVolatilityPlan({getBook,fetchD1,sigmaSeries,kvPut})` — assembles the plan from the locked book + live D1 σ/open (computed via `volSigmaSeries`, the SAME path the book learned on — not the drifted `volForecast.js`) and writes KV `volatility_bot_plan`. Network injected → offline-tested. Wired in `server.js` (`POST /api/volatility-bot/refresh-plan`, `GET /api/volatility-bot/plan`, daily scheduler). | `server.js`; imports `volatilityBotPlan`, `instrumentRegistry` | ✅ |
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
| **Render brick** | `js/levelChart.js` | reusable Lightweight-Charts viewer — `createLevelChart(el).setCandles().setLevels(Level[]).setZones(zones)`; pure `styleForKind` / `levelToPriceLineOptions` / `zoneToPriceLineOptions` (colour keyed by `Level.kind`). Lifted from `gold-zones.html`. Demo: `level-chart-demo.html`. Consumers: `level-chart-demo.html` ✅, **`forecast-analysis.html` Book-tab trade viewer** ✅ (click a trade → its M1 session with Close/Proj-H/L forecast lines + entry/TP/SL marked, fed by `getSessionChart`), **`telegram-v2.html` zone chart** ✅ (click a v2 zone → M5 candles + entry/SL/TP price lines, fed by `/api/oanda_ohlc5m`). Pure helpers + factory wiring tested headless against a mock in `js/levelChart.test.mjs`. | ✅ built |
| **VuManChu core** | `js/vumanchuCore.js` | ONE WaveTrend / Money-Flow / VWAP compute, consumed two ways: `waveTrendSeries` (raw WT1[] for backtest gating) and `waveTrendReading` (latest-bar OB/OS/cross signal) — same compute, mode selects the shape. Standardizes the divide-by-zero guard on `WT_EPS = 1e-10`. Wired into `js/vumanchu.js` ✅ (re-exports `computeWT`/`computeMF`/`computeVWAP`/`ema`/`sma`) and `asiaRangeEngine._computeWT1Series` ✅. Golden test (`js/vumanchuCore.test.mjs`) proves it reproduces BOTH former copies bit-for-bit. | ✅ built |
| **Range-bias core** | `js/rangeBiasCore.js` | the live entry-bias features — `computeADX`, `computeHurst`, `ema`, `featureADX`/`SwingRegime`/`Twap`/`EmaRsi`/`Hurst`, `computeRangeBiasServer`, `computeWeeklyPivots`. Extracted verbatim from `levels.js`; wired into `levels.js` ✅ (live) + `asiaRangeEngine` ✅ (backtest). Golden test (`js/rangeBiasCore.test.mjs`) proves bit-for-bit equality. | ✅ built |
| **Entry-grade core** | `js/entryGradeCore.js` | the live star rating + `signalScore` weighting — `computeStars`, `computeStructScore`, `momScoreFrom`, `rbScoreFrom`, `computeSignalScore` (38/25/25/12 + FRED 25/25/20/20/10). A/B/C grade stays in `trade-grade.js`. Wired into `levels.js` ✅ + `asiaRangeEngine` ✅. Golden test (`js/entryGradeCore.test.mjs`, 108 combos). | ✅ built |
| **Gate analysis** | `js/gateAnalysis.js` | `compareGates` / `bestGate` — compares candidate trade gates (entry grade vs vol-forecast HL75 stretch vs day-type T vs approachVel) on a true IS/OOS split with thin-sample flags; honest "no gate adds OOS edge" result. Renders as Panel 0 in `asia-range-analysis.html`. Test `js/gateAnalysis.test.mjs`. | ✅ built |
| **Range-line analyser** | `js/rangeLineAnalyser.js` | the Forecast-Level per-line strategy applied to RANGE levels, **modules stripped** — `analyseRangeWindow` (emits perLineStrategy-shaped line records off Asia/Monday fib ladders, triple-barrier), `runRangeLineAnalyser`, `runRangeLineBook` (packed M1 → records → pooled-IS policy → per-pair OOS), `recordsForPair`/`touchesForPair` (split so the route caches the expensive records and re-derives touches per `conditions`), **no-lookahead `validFrom` gate** (Asia levels tradeable only after the formation window closes; Monday levels never on Monday itself), plus exported `buildRangeLadder` / `LADDER_LEVELS` (shared with the v2 live producer so live & offline build the identical ladder). `analyseRangeWindow` also records **MFE/MAE excursion to session close** (`excMid`/`excAway`) and **`eRatioByCell`** computes the per-cell E-ratio (does price run past the level → trailing-exit study), plus **path-simulated follow trail PnLs** (`fStruct` structural ratchet / `fChand` chandelier), **`runExitAB`** (same learned policy, four exits — fixed / structural / chandelier / scale-out — each scored on OOS daily-portfolio Sharpe + cost-stress; fade keeps the fixed barrier; prices each touch independently so trades/day is unchanged), **`runHeldPosition`** (the HONEST model — one held position per day/direction/source, re-entry suppressed while open → collapses the per-touch over-count so trades/day and the Sharpe become tradeable), and **`runBadLevelScan`** (per-(pair × level) IS/OOS expectancy scan + an IS-learned, OOS-applied veto of reliably-losing pair-levels the pooled gate hides). Re-exports the forecast rigor battery (`runRigor`/`runSensitivity`/`deflatedSharpe`) so the route judges robustness the same honest way. Reuses `touchFeatures` + `perLineStrategy` + `barUtils` + `fibProjection` + `forecastAnalyser.bucketM1IntoSessions`. Route `/api/range-line/run`; UI `range-line-strategy.html`. Test `js/rangeLineAnalyser.test.mjs`. | ✅ built |
| **Level-confidence core (v2)** | `js/levelConfidenceCore.js` | the Telegram-v2 confidence decision — `decide` (frozen per-cell **after-cost expectancy** → grade/verdict), `cellKey` (reproduces `perLineStrategy.extractTouches`' key), `directionFor`/`exitsFor` (fade/follow→long/short + triple-barrier SL/TP, matching `pnlFor`), `DEFAULT_GRADE_BANDS`. Pure; the heart of v2. Test `js/telegramV2.test.mjs`. | ✅ built |
| **Grade-level v2** | `js/gradeLevelV2.js` | the single LIVE grader — ladder + intraday path → graded entries, rebuilding the IDENTICAL offline cell key (same `buildRangeLadder` + same `touchFeatures` approachVel bucket → `levelConfidenceCore.decide`). Live==backtest by construction. Test `js/telegramV2.test.mjs` (incl. live↔offline cell-parity check). | ✅ built |
| **Alert formatter v2** | `js/alertFormatterV2.js` | pure `formatV2Entry` — expectancy-first Telegram HTML message (transport stays out of the brick). Test `js/telegramV2.test.mjs`. | ✅ built |
| **Levels-v2 offline learner** | `js/levelsV2Learn.js` | `learnAndFreeze` / `freezePolicy` / `isUsablePolicy` — run `rangeLineAnalyser.runRangeLineBook` and snapshot its OOS `.policy` + metadata into the frozen artifact the live producer loads. Thin orchestration over existing OOS-honest machinery. | ✅ built |
| **Levels-v2 live producer** | `levelsV2Engine.js` (root) | `refreshAllPairsV2` / `refreshPairV2` / `loadPolicy` — fetch OANDA M1 (approach path, matches the offline learner)/M5/M30/D, build the shared ladders, apply the frozen policy via `gradeLevelV2`, write `ai_entries_v2_*`, and record+resolve the ledger. One producer, one KV namespace. Auto-runs inside the Railway `runLevelsRefresh` loop (not the Cloudflare cron-worker). Routes `/api/levels-v2/{learn,refresh,entries,ledger,status}`; UI `telegram-v2.html`. Full design: `TELEGRAM_V2.md`. | ✅ built |
| **Entry ledger v2** | `js/entryLedgerV2.js` | the daily-learning loop — `recordEntries` (append live signals, dedup standing levels), `resolvePair` (honest **limit-fill + triple-barrier** on live M1 → win/loss/expired/timeout + after-cost `realizedPct`), `ledgerStats` (realized vs policy expectancy per grade), `refitFromLedger` (review-only candidate from realized fills; never auto-overwrites the frozen policy). Pure; tested in `js/telegramV2.test.mjs`. | ✅ built |
| **Confluence count** | `js/confluenceCount.js` | pure `countWithin` (partners within a pip tolerance of a price) + `confluenceBucket` (0·solo / 1·pair / 2·triple+) — tests the "confluence amplifies probability" hypothesis. Tested in `js/telegramV2.test.mjs`. | ✅ built |
| **Confluence test** | `js/confluenceTest.js` | `runConfluenceTest` / `confluenceForPair` / `mergeConfluence` — backtest that tags every session-fib touch by how many INDEPENDENT sources align (cross-session, prior `lookbackDays` ladders, `levelSources` PDH/PWH/pivots/round/daily-open) and reports reversion rate + after-cost fade expectancy per bucket. Read-only research (does NOT change the live policy). Reuses `runRangeLineAnalyser` (untouched) + `pnlFor` + `collectLevels` + `confluenceCount`. Route `/api/levels-v2/confluence-test`; panel on `telegram-v2.html`. | ✅ built |
| **Alert-v2 core** | `js/alertV2Core.js` | the pure "should this v2 zone alert now?" decision — `selectAlerts` (proximity + min-grade + per-pair filter + per-level cooldown → alerts to send + updated cooldowns), `alertKey`, `pruneCooldowns`, `DEFAULT_V2_ALERT_CFG`. v2's OWN alert config, separate from v1 `ai_alert_cfg`; transport/formatting stay out. Wired into `levelsV2Engine` (sends via Telegram using shared `tg_config`, alerts-only). Routes `/api/levels-v2/alert-config`; config panel in `telegram-v2.html`. Pure; tested in `js/telegramV2.test.mjs`. | ✅ built |

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
| **MT5 broker (Python)** | `pylego/broker/mt5.py` | `Mt5Broker` — connect/login/account-check, price/ATR/balance, `serialize_open_positions`/`serialize_closed_trades` (the dashboard positions-tab payload, §7), and order `enter`/`stop`/`filling_mode`. Lifted from `bot/regime_bot.py` with magic / symbol-resolver / pip-resolver / MT5 module injected. Adopted by `bot/regime_bot.py` ✅ **and `volatility_bot`** (live path); 12 offline tests against a fake MT5 in `pylego/broker/mt5_test.py`. | `bot/regime_bot.py`, `volatility_bot` | 🟡 built, adoption in progress |
| **Paper broker (Python)** | `pylego/broker/paper.py` | `PaperBroker` — in-memory broker exposing the SAME surface as `Mt5Broker` (`enter`/`stop`/`serialize_open_positions`/`serialize_closed_trades`/`account_balance`/`price`) so a bot swaps live↔paper with no code change, plus `check_barriers` which runs the triple barrier (what MT5 does natively via SL/TP). Fully offline-tested (`paper_test.py`). | `volatility_bot` (paper mode) | ✅ built |
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
| **Vol-forecast bench** | `js/volForecastBench.js` | σ-estimator **evaluation** registry (`ESTIMATORS`) — EWMA(0.90/0.94), HV20/HV30, Yang-Zhang(30), GARCH(1,1) all **imported** from `volBacktestEngine.js` (no copies, re-aligned to a `predictVar(bars)→Float64Array` no-lookahead contract) plus the one new entrant **HAR-RV** (`harRvPred`, walk-forward OLS via incremental normal equations + `solve4`); realised-variance proxies (`realizedVarSeries`: Garman-Klass / squared-return / Parkinson); QLIKE+MSE scoring with full/IS/OOS split (`scoreSeries`); `runBench` ranks by OOS QLIKE | `server.js` `/api/vol-forecast-bench/*` + `vol-forecast-bench.html` (linked from `hub.html`) | ✅ |

> Imports the incumbent estimators from `volBacktestEngine.js` rather than copying
> them, so the benchmark and the live forecaster cannot silently disagree (Lego
> Principle 1). HAR-RV is a *candidate* estimator — it only earns a place in the
> forecaster if it beats the asset-class incumbent **out-of-sample**; the bench is
> how that's decided, not an automatic adoption.

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
