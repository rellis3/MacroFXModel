# MacroFXModel — Project Memory

This file is auto-loaded by Claude Code (CLI **and** the VS Code / JetBrains
plugins) at the start of every session. It is the durable contract for how
strategy code is built here. **Read it before writing or reviewing strategy
code, and follow it.**

Orientation docs (read when you need them, not every time):
`CODEBASE_OVERVIEW.md` (the map), `SYSTEM_ASSESSMENT.md` (honest critique),
`TRADABILITY_REVIEW.md` (what's real vs in-sample),
`REVERSION_CONTINUATION_CONCEPT.md` (the fade/follow design basis),
`ENTRY_ZONE_CONFIDENCE.md` (how the per-line strategy decides entry zone /
direction / confidence — the built fade-vs-follow engine and its modules), and
**`LEGO_MODULES.md` (the central brick registry** — every reusable module, where
it's used, what it does, and the candidate bricks still to extract; read it
before adding a module so you import an existing brick instead of copying).

---

## The Lego Principle (non-negotiable)

Strategies here are **built by connecting reusable core pieces**, not by writing
a new bespoke engine each time. If a piece works, keep it connected; if it
doesn't, disconnect it — without disturbing the rest. Concretely:

1. **One shared core, imported — never copied.** Volatility math, band
   construction, the fill walker, the regime classifier, the day-type score and
   the metrics/OOS split live in shared modules. New work **imports** them.
   Copy-pasting these is forbidden — the moment two copies drift, the backtest
   and the live forecaster silently disagree (this exact "bit-identical port"
   failure is documented in `TRADABILITY_REVIEW.md`).

2. **One entry primitive, parameterised.** Do not add a new bespoke "leg"
   function per idea. A trade is `{ band, action(fade|follow), entryType(limit|
   stop), exit }`. Express new ideas as parameters of the single
   `simulateEntry`, not as new functions. (v1's seven legs were really one
   primitive in disguise — see `js/forecastCore.js`.)

3. **Horizon-agnostic.** Daily / weekly / 20-day differ only by σ scale
   (×1 / ×√5 / ×√20) and window length. Anything you add must work at all three
   horizons through the same code path. Never hard-code "daily".

4. **The brain is a selector, not more knobs.** New decision logic should be a
   *score → choice* selector (like `dayTypeScore → selectStrategy`), added on top
   of the primitive. Adding tunable parameters to optimise is the overfitting
   path; adding a principled selector and proving it OOS is the lego path.

5. **Validate the same way every time.** Every strategy is judged through the
   honest harness discipline: realistic fills, real costs, and a **true
   in-sample / out-of-sample split**. A change "wins" only if it beats the
   incumbent on **OOS** Sharpe with a **non-trivial OOS trade count (≥30)**.
   In-sample improvement is not evidence.

6. **Register every brick — the registry is part of "done".** `LEGO_MODULES.md`
   is the single index of what bricks exist, where they're used and why. Adding
   or materially changing a brick is **not complete** until that doc is updated
   (new row / status / consumer list / known-drift note). Read it before adding a
   module so you import an existing brick instead of starting a new copy.

---

## Brick tiers & what counts as a brick

Bricks come in tiers; know which you're building.

- **Tier 1 — primitives.** Pure math/plumbing with a stable input→output contract
  and no strategy opinion: vol math, the fill walker, metrics, z-scores/indicators,
  bar utilities, the instrument registry, the WaveTrend/VWAP compute. These are
  the *studs* everything snaps onto. (`js/volBacktestEngine.js`, `barUtils`,
  `statsCore`, `indicatorCore`, `metricsCore`, `fibProjection`,
  `instrumentRegistry`, `vumanchuCore`.)
- **Tier 2 — feature / level-source plug-ins.** Built **on** Tier 1, these EMIT
  something a strategy composes: a `Level[]` (daily-open, pivots, VAH/VAL/POC,
  swing S&R, round numbers, VWAP) via the `levels(ctx) → Level[]` contract, so one
  list feeds a confluence scorer, the chart viewer and a strategy. (`levelSources`.)
- **Render bricks.** Reusable viewers that take a brick's output and draw it
  (`levelChart` takes a `Level[]`). UI, not strategy logic.
- **The brain (selectors).** `score → choice` logic layered on top
  (`dayTypeScore → selectStrategy`). Not a brick to copy — a small principled
  selector, proven OOS.

**What IS a brick** (extract it): logic that is (a) used in ≥2 places, or provably
will be; (b) has a **stable, documented contract** (fixed input/output shape);
(c) is **pure** (no hidden global/DOM/network state — data is passed in); and
(d) is **unit-testable on synthetic data** without the network. If two copies
already exist, that alone qualifies — divergence is the bug we're preventing.

**What is NOT a brick** (leave it inline): one-off glue used in a single place;
anything fused to a specific page's DOM or a specific data feed; a thin
re-parameterisation of an existing brick (just pass the parameter); or a "brick"
that would need to reach into global state to work. Don't fragment a single-use
helper into a module for its own sake — that adds surface without removing
duplication.

When unsure, default to: **extract if it removes a real second copy or has a
clean contract two callers want; otherwise keep it inline and note it as a
candidate in `LEGO_MODULES.md §2`.**

---

## The core modules (the baseplate — import these)

| Module | Owns | Import for |
|---|---|---|
| `js/volBacktestEngine.js` | vol-sigma series (HV20 / GARCH / Yang-Zhang), `ASSET_PARAMS`, `classifyRegime`, band constants (`BM_P50/75`, `HN_P50/75`), `fetchD1` | the forecaster's vol math — single source of truth |
| `js/dayTypeCore.js` | the reversion-vs-continuation classifier — `ESTIMATORS` registry, `DAYTYPE_PRESETS`, `classifyDayType`, `dayTypeScore` (trend-day-ness `T` = drift÷diffusion) | any system that must decide fade-vs-follow at a level — the forecaster **and** future bots, never copied |
| `js/forecastCore.js` | `computeBands`, `walkBars` (fill walker), `simulateEntry` (the one primitive), `selectStrategy`, `volSigmaSeries`, `HORIZONS` (re-exports `dayTypeScore` from `dayTypeCore.js`) | all new forecast-family strategy logic |
| `js/honestForecastEngine.js` | `summarize`, `summarizeSplit` (metrics + IS/OOS) — `summarize` now delegates to `metricsCore` | reporting — reuse, don't re-implement |
| `js/volBacktestV2Engine.js` | thin per-horizon orchestration + A/B vs fixed legs | the template for wiring a new strategy |

**Shared utility bricks** (extracted 2026-06; pure, unit-tested in
`js/legoBricks.test.mjs`; full catalogue in `LEGO_MODULES.md`):

| Module | Owns | Import for |
|---|---|---|
| `js/barUtils.js` | `bisect`, `extractBars`, `resampleTo`, `bodyRange`, `calcATR`, `groupByDate` — the M1 packed-array hot path | any session-range backtest (already wired into `asiaRangeEngine`/`rangeFibEngine`/`confluenceModules`) |
| `js/statsCore.js` | `rollingZScore`/`rollingZAt`, `rollingPercentile`, `linregSlope`, `ewma`, moments (`ddof`) | z-score/percentile gates — never re-inline a z-score |
| `js/indicatorCore.js` | `ema`, `atrWilder`/`atrEma`, `adxWilder`, `rsiWilder`, `trueRange` (ATR variants named, never silently swapped) | regime/indicator math shared by HMM engines + backtests |
| `js/metricsCore.js` | `sharpeRatio`, `sortinoRatio`, `calmar`, `maxDrawdown*`, `profitFactor`, `winRate`, `summarizeTrades` (== old `summarize`) | every performance card — one definition of Sharpe/DD |
| `js/fibProjection.js` | `FIB_LEVELS`, `KEY_LEVELS`, `calcFibs` (range-extension grid) | any Asia/Monday range-extension engine |
| `js/instrumentRegistry.js` | canonical pip/digits/asset-class + symbol aliases (`pipSize`, `instrument`, `resolveKey`…) | anything that needs a pip size or symbol — a wrong pip is a 10× PnL bug |

**Tier-2 level-source bricks** (strategy-building plug-ins that EMIT price levels,
built on the Tier-1 bricks; contract + module map in `LEGO_MODULES.md §1c`):

| Module | Owns | Import for |
|---|---|---|
| `js/levelSources.js` | `LEVEL_SOURCES` registry (`daily_open`, `prior_hilo`, `pivots`, `volume_profile`, `swing_sr`, `round_number`, `vwap`), each `levels(ctx) → Level[]`, plus `collectLevels` + `clusterLevels` | building a strategy/chart from pluggable level sources — one `Level[]` feeds the scorer, the viewer and the strategy |
| `js/levelChart.js` | reusable Lightweight-Charts viewer — `createLevelChart(el).setCandles().setLevels(Level[]).setZones()`; colour keyed by `Level.kind` (demo: `level-chart-demo.html`) | rendering a strategy's levels/zones on any page — pass in the `Level[]`, don't re-wire the chart |
| `js/vumanchuCore.js` | one WaveTrend/Money-Flow/VWAP compute, two use cases: `waveTrendSeries` (raw WT1[] for gating) + `waveTrendReading` (latest-bar signal); guard standardized on `WT_EPS=1e-10` | VuManChu math anywhere — `js/vumanchu.js` + `asiaRangeEngine` already share it; never re-inline the WaveTrend formula |
| `js/rangeBiasCore.js` | the live entry-bias features (ADX / swing-CHoCH-BOS / TWAP / EMA-RSI / Hurst) + `computeRangeBiasServer` + `computeWeeklyPivots` | grading an entry by range-bias conviction — `levels.js` (live) + `asiaRangeEngine` (backtest) share it |
| `js/entryGradeCore.js` | the live star rating + `signalScore` weighting (`computeStars`, `computeStructScore`, `computeSignalScore`); A/B/C grade stays in `trade-grade.js` | scoring/grading a level the SAME way the bot does — `levels.js` + `asiaRangeEngine` share it |

> `js/volBacktestM1Engine.js` is the mature **v1** engine (M1 walk-forward, the
> realistic fill walker, the seven legs). Treat it as **read-only reference** —
> it runs in production. Build new versions alongside it (v2, v3…), like the
> regime-backtest versioning. Do not refactor v1 in place.

**The vol math must always match the live forecaster.** It is derived from the
driftless-Brownian range distribution (Feller): `HL = BM_const × corr × σ`,
`OC = HN_const × corr × σ`. If you change it, you change the forecaster — don't,
unless that is explicitly the task.

---

## Adding a new strategy — checklist

1. **Reuse the baseplate.** Import vol math, `simulateEntry`, `walkBars`,
   `summarizeSplit`. Write only the *new* idea.
2. **Express the idea as a selector or a spec**, not a new leg or new tunables.
3. **No lookahead.** σ/regime/score for window `i` use data `< i` only. The
   existing series helpers already guarantee this — keep it that way.
4. **Costs on by default.** Round-trip spread + commission, plus slippage on
   stop/breakout entries. Free fills are not honest.
5. **Make it horizon-agnostic.** Parameterise by `HORIZONS[horizon]`.
6. **Version it, don't overwrite.** New file `…V{n}Engine.js`, new route
   `/api/<name>-v{n}/run` + `/status`, new `…-v{n}.html` page. Leave the prior
   version running.
7. **A/B on the OOS card** against the incumbent. Ship the comparison, not just
   the new equity curve.
8. **Link it from `hub.html`** so it's discoverable.
9. **Update `LEGO_MODULES.md`.** If you added or changed a brick, record it (row,
   status, consumers, why) — and add any new copy you couldn't yet retire to the
   candidate/known-drift tables. The registry is part of "done" (Lego Principle 6).

---

## House conventions

- **Backtest endpoints** use the async-job pattern: `POST /run` returns a
  `jobId`; the engine runs in the background and stores into a `Map`;
  `GET /status/:jobId` returns `running | done | error`. Copy an existing block
  (`/api/honest-forecast/*`, `/api/vol-backtest-v2/*`).
- **Dashboard pages** are self-contained HTML, dark theme, vanilla JS, served
  statically from repo root. Reuse the IS/OOS + cost-sensitivity card layout.
- **Data**: OANDA D1 via `fetchD1` (needs `OANDA_KEY`); M1 via `loadM1ForPair`
  (R2 / parquet / Drive). OANDA is reachable in Railway, not in the sandbox
  (expect 403 locally — that's environment, not a bug).
- **Validate locally before committing**: `node --check` the engine + `server.js`,
  and unit-test the core on synthetic data (no network needed).

## Anti-patterns (do not do)

- Copying the vol math or the fill walker into a new file.
- Adding a seventh, eighth… bespoke leg instead of a parameter/selector.
- Reporting in-sample numbers as if they were edge.
- Assuming the intrabar take-profit was hit on a daily bar (path is unknown) —
  prefer M1 fills or mark-to-window-close.
- Hard-coding the daily horizon.
- Editing v1 (`volBacktestM1Engine.js`) in place to add an experiment.

---

## Git / workflow

- Develop on a feature branch; never commit straight to `main`.
- One logical change per PR; open as **draft**; link new tools from `hub.html`.
- Keep commits scoped and messages descriptive.
