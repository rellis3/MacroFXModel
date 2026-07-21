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
before adding a module so you import an existing brick instead of copying), and
`PYTHON_LEGO.md` (extending the brick architecture to the Python bots — the
`pylego/` baseplate, the generate-don't-port rule for shared math/data, and the
one-bot-at-a-time adoption plan).

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

## Backtest build discipline — approach, data modeling, output analysis

Distilled from reviewing an external macro-signal build (`Dax Base IFO
System/`, reviewed 2026-07-20) — techniques worth keeping regardless of
whether that particular signal survives OOS (it didn't: strong 2006–2019,
flat-to-negative Sharpe 2020–2025 — the full-sample average hid the decay).
Apply these to any new signal, Python throwaway or JS engine alike.

**Approach**
- **Escalate in stages, don't write the tearsheet first.** Prove the merge/join
  is sane (row count, date range) before any PnL exists; get the zero-parameter
  version of the rule's raw CAGR/Sharpe/DD readable before adding the full
  metrics suite; add statistical inference last. A polished tearsheet on a
  broken join is worse than no tearsheet.
- **Start with the minimal-DOF version of the signal.** A bare sign/zero-crossing
  rule with no lookback, no threshold, no smoothing constant is close to
  impossible to overfit because there's nothing to fit. Get that number honestly
  first; only add tunable parameters after, knowing each one you add is overfit
  risk you're buying.
- **Know whether you're exploring or confirming.** A regression/statistical check
  run *before* the rule is designed should inform its functional form
  (magnitude-weighted? regime-conditional?); one run *after* the rule is already
  fixed only confirms an existing intuition. Both are fine — don't blur which
  one you're doing, and don't let a confirming regression stand in for real OOS
  validation (Lego Principle 5 still applies regardless).

**Data modeling**
- **Match resample/trading frequency to the signal's true update cadence.**
  Don't hold a monthly (or weekly) number "live" against daily bars — that
  implies information the series doesn't actually have day-to-day. Resample
  the faster series down to the slower one's release frequency instead.
- **Do the boring parsing correctly and visibly, up top.** Strip currency
  commas/whitespace before casting, pin explicit date formats, handle BOM
  encodings (`utf-8-sig`) — this is exactly the kind of silent corruption that
  invalidates a backtest without ever raising an error.

**Output analysis**
- **Add residual diagnostics to any regression-based signal**: Durbin-Watson
  (autocorrelation), Jarque-Bera (residual normality), Breusch-Pagan
  (heteroskedasticity) before trusting its p-value/coefficient. A
  statistically "significant" coefficient on a heteroskedastic fit has
  optimistic standard errors — check before leaning on it.
- **Report distributional shape, not just Sharpe.** Skew, excess kurtosis,
  historical VaR/CVaR are cheap, pure functions of a return series and catch
  fat left tails a single Sharpe number hides. **Built 2026-07-21** as Tier-1
  primitives in `js/metricsCore.js` (`skewness`, `excessKurtosis`, `histVaR`,
  `histCVaR`; hand-checked in `legoBricks.test.mjs`). `summarizeTrades` emits
  `skew`/`excessKurt`/`var95`/`cvar95` and feeds the real skew/kurt into
  `minTrackRecordLength`, so its `minTrackYears` is now fat-tail-adjusted rather
  than Gaussian. Note VaR/CVaR on a per-trade pnl series are per-trade tail
  stats, not portfolio VaR over a horizon.
- **A monthly/yearly return heatmap is a cheap concentration check — use it.**
  If a handful of months or one multi-year stretch is carrying the whole
  result, a heatmap makes that visible in seconds. Generating the diagnostic
  isn't the same as looking at it — actually read it before reporting a
  headline number, especially the most recent 1–3 years in isolation. (This is
  what would have caught the ifo/DAX signal's post-2019 decay that the
  full-sample average hid.)
- **Don't let Monte Carlo stand in for OOS.** Resampling from a strategy's own
  realized return distribution shows the range of outcomes consistent with
  that mean/std — it says nothing about whether the signal generalizes to data
  it hasn't seen. It's a legitimate expectation-setting tool; label it as that,
  not as robustness evidence.

---

## House conventions

- **Backtest endpoints** use the async-job pattern: `POST /run` returns a
  `jobId`; the engine runs in the background and stores into a `Map`;
  `GET /status/:jobId` returns `running | done | error`. Copy an existing block
  (`/api/honest-forecast/*`, `/api/vol-backtest-v2/*`).
- **Dashboard pages** are self-contained HTML, dark theme, vanilla JS, served
  statically from repo root. Reuse the IS/OOS + cost-sensitivity card layout.
- **Every standard backtest results card ships 3 CSV export buttons** —
  one trade-log row per closed trade, in each of these exact schemas:
  - **% Returns**: `Date,Return %,MAE %`
  - **R-Multiples**: `date,R,MAE (R)`
  - **Currency P&L**: `Trade Date,PnL ($),Risk ($)`

  Rules for filling them in:
  - **MAE must come from the real intra-trade path** (OHLC bars between entry
    and exit — Low-vs-entry for longs, High-vs-entry for shorts), never
    approximated from the close-to-close return alone. Same discipline as the
    heatmap/MAE guidance above — a per-trade summary metric is only honest if
    it's read off the actual path.
  - **State the account size and the R-unit definition next to the buttons**,
    don't let them float as hidden constants. R needs an explicit risk-per-trade
    definition (fixed % of equity, vol-based stop, etc.) — if the strategy has
    no native stop/risk concept, say so and pick one deliberately rather than
    inventing a silent default.
  - **Watch for the degenerate case**: if R-unit = fixed % of equity and the
    $ P&L export uses full notional at that same %, the R-multiple column
    becomes numerically identical to the % Return column (found while building
    this for the ifo/DAX system) — it adds no new information, just relabels
    the same number. Either use a per-trade-varying risk unit (e.g. that
    period's realized vol) or note plainly that R and % Return are redundant
    here.
- **`index.html` is THE Dashboard** — the primary landing page. `hub.html` is a
  secondary link index. New user-facing features/links belong on **`index.html`**
  (and the specific page they extend, e.g. the vol-bot lives on `bot-config.html`),
  **not** on `hub.html`. Do not add things to `hub.html` unless explicitly asked.
- **Data**: OANDA D1 via `fetchD1` (needs `OANDA_KEY`); M1 via `loadM1ForPair`
  (R2 / parquet / Drive). OANDA is reachable in Railway, not in the sandbox
  (expect 403 locally — that's environment, not a bug).
- **Validate locally before committing**: `node --check` the engine + `server.js`,
  and unit-test the core on synthetic data (no network needed).
- **KV persistence is opt-in per key — the #1 recurring "my settings vanished on
  deploy" bug.** `kv.js` has two backends: Cloudflare KV (survives Railway
  redeploys) and a local file store (**wiped on every redeploy**). A key only
  reaches CF KV if `isCfKey(key)` says so — i.e. it's in the `_CF_EXACT` set or
  matches a persistent prefix rule (`journal_`, `ai_`, `vol_forecast_`, …).
  **Any new `kv.put` for user-entered data that must outlive a deploy — bot
  tokens/chat IDs, credentials, saved configs, learned policies — MUST be added
  to `_CF_EXACT` in `kv.js`.** If you don't, it silently lands in the ephemeral
  file store and disappears on the next deploy (this is exactly how the
  vol-level-alert Telegram creds were lost). Mirror an existing entry like
  `tg_v2_config` / `volatility_bot_credentials`. Ephemeral caches and
  bot-rewritten-every-30s status keys are deliberately **left out** to protect
  the CF KV free-plan write quota — persist only what a user typed or what's
  expensive/impossible to rebuild. Check with `/api/kv-health`
  (`persistent: true/false`).
  **A second, separate gate exists for the generic `/api/kv/get` and
  `/api/kv/set` routes** (in `_worker.js` — this is the path both `pylego/kv.py`
  bots and the dashboard's generic KV helper use, and it runs on Railway too via
  `server.js`'s `FX_SCORES` shim, not just on Cloudflare Pages). A key must be in
  `isAllowedKVKey()`'s `EXACT` set/prefixes to be read/written **at all**, and —
  independently — in the `PERMANENT_KEYS` set inside the `/api/kv/set` handler
  to skip the 48h `expirationTtl` applied to everything else. Being in `_CF_EXACT`
  does not exempt a key from this second TTL gate. Missing it doesn't 403 or
  error — the write silently succeeds with a 48h TTL, so the key looks fine for
  two days then vanishes from CF KV on its own, which reads exactly like "wiped
  on release" even though no deploy happened. This exact bug hit
  `volatility_bot_config/credentials/plan/audit_log`,
  `range_line_bot_config/credentials/plan/confluence/audit_log`,
  `dyn_anchor_config/credentials`, `macro_equity_config/credentials`, and all
  four QMR bots' `config/audit/status` keys (fixed 2026-07-16) — when adding a
  new persistent bot config/credentials/plan/audit key, add it to **all three**:
  `_CF_EXACT` (`kv.js`), `isAllowedKVKey`'s `EXACT` set, and `PERMANENT_KEYS`
  (both in `_worker.js`).

### Environment variables (set in Railway — values live there, never in git)

These are the **names** the server/worker read; the secret **values** are
configured in the Railway service env (and the Cloudflare worker), never
committed. If a feature returns auth errors or empty data, check the matching
var is set in Railway first.

| Var | Used for |
|---|---|
| `OANDA_KEY`, `OANDA_ENV`, `OANDA_ACCOUNT_ID` | OANDA D1/M1 + live prices (`fetchD1`, vol-forecast). `OANDA_ENV` = `live`/`practice` — must match the key |
| `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET` | R2 store: M1 parquet + the forecast-analysis dataset / per-line book |
| `FRED_KEY`, `FINNHUB_KEY`/`FINHUB_KEY`, `TWELVE_KEY`, `NEWS_KEY`, `MYFXBOOK_SESSION` | macro / quotes / news data feeds |
| `ANT_KEY` | Claude API (AI analysis) |
| `CF_ACCOUNT_ID`, `CF_API_TOKEN` | Cloudflare API (worker/KV ops) |
| `KV_WRITE_SECRET` | **opt-in** auth for credential/config KV writes — if set, the dashboard write path must present it (server.js injects it when proxying). Unset ⇒ writes allowed (see `_worker.js`) |
| `ANALYSER_ADMIN_PASSWORD` | forecast-analyser admin/refresh gate |
| `VOL_PLAN_UTC_HOUR` / `VOL_PLAN_UTC_MIN` | when the volatility-bot daily plan refreshes (default 23:05 UTC) |
| `VOL_FORECAST_UTC` | when the vol-forecast recompute runs |
| `TDE_PAIRS`, `TDE_REFRESH_MIN` | Trade Decision Engine live slow loop — pairs to keep snapshots warm (off if unset) + refresh cadence (default 5 min) |
| `TDE_BACKFILL_UTC`, `TDE_BACKFILL_DAILY` | Trade Decision Engine nightly incremental backfill — time (default `03:05` UTC, **on by default**); `TDE_BACKFILL_DAILY=0` disables |

> The volatility-bot plan producer recomputes σ from OANDA D1 via
> `volSigmaSeries` (the backtest's exact math) — **not** `/api/vol-forecast`,
> whose correction constants are a flagged drift. The plan's lines must be
> bit-identical to the per-line book's, so the producer never sources the live
> forecast. Don't "simplify" it to read `/api/vol-forecast`.

## How we talk about results (working agreement, earned the hard way)

This project is a falsification harness. Most trading ideas are null; the value
is finding that out honestly and cheaply. To keep our conversations real:

- **"Built" ≠ "works" ≠ "has edge."** State which one you mean. Infrastructure
  can be sound while the strategy on top of it is worthless. Never let
  enthusiasm for a *method* imply it produces edge.
- **A method is not a strategy.** Meta-labeling, calibration, an ensemble —
  these size/filter an edge that must already exist. State the dependency
  up front, not after the primary signal tests empty.
- **Name the benchmark before claiming improvement.** A fitted model that beats
  a bad prior but only reaches the *base-rate Brier* has found nothing. An
  equity curve that looks great next to nothing looks worse next to
  buy-and-hold. Always show the floor and the naive benchmark.
- **Pre-register both outcomes before running a test.** Say what "it worked" and
  "it didn't" each look like, so a null can't be re-narrated into a maybe.
- **Pooled nulls hide subset edges — disaggregate before declaring null.** But
  count the cells and state the chance-baseline (multiple testing): finding a
  few "winners" among 70 slices is what noise does. Survivors must beat chance
  *and* be IS-consistent.
- **Costs and a true OOS split are non-negotiable.** An in-sample or no-cost
  number is not a result; do not report it as one.
- **Folklore is not literature.** S/R levels, range-fibs, Asia breakouts are
  practitioner heuristics with weak evidence; momentum/carry/vol-premium are the
  replicated ones. Don't dress the former up as the latter.
- **Lead with what survived, but never inflate it.** Report the green honestly
  and the red honestly; don't bury a real positive under caveats, and don't
  sell a weak survivor as the answer.
- **Data limits beat fake productivity.** If the sandbox can't test something
  honestly (e.g. carry needs FRED rates / swap-inclusive returns, not OANDA
  mids), say so and defer it — don't run a lookalike and call it the thing.
- **Don't oversell the next idea to soften a null.** If the next test is a
  coin-flip, say "coin-flip." Comfort that gets falsified next turn is the
  thing that actually erodes trust.

---

## Working with the owner (the honest-teammate contract)

> This section was earned the hard way, in a long build cycle where an idea got
> sold as a promising trading system up front and came back a null after days of
> work — repeatedly. The owner (a capable builder, **not** a trading expert) asked
> for a real teammate: bring the knowledge, tell the truth on the way in and the
> way out, no falseness. Every chat inherits this. Follow it.

**1. Lead with the honest prior — before writing a line of code.** For any trading
idea, state up front, in words you can defend:
- **Folklore or replicated?** (see the map below)
- **Blunt odds it becomes a tradeable, after-cost edge** — an actual number. If it's
  ~10%, say "10%," not "promising."
- **The default expected outcome, out loud.** For most FX ideas that default is
  **null** — the market is liquid, picked-over, and anything simple enough to
  describe in a chat is usually already arbitraged. A null is the base rate, not a
  failure, and finding it cheaply is a *win*.

Then let the owner decide with clear eyes. It is fine — often correct — to say
*"this is probably a waste of your time; want to do it anyway?"*

**2. Ban the selling words.** Do not use "promising," "worth pursuing,"
"game-changer," "the reframe you want," "real signal," or similar **unless there is
evidence behind them, not enthusiasm.** Interest in a *method* (it's elegant, it's how
real desks think) must never be phrased so it implies the method produces *edge*.
Those are different claims; keep them separate out loud. Do not get excited about one
instrument / one slice before the fuller test (that whipsaw is what erodes trust).

**3. Folklore vs replicated — name it every time.**
- **Replicated (edge genuinely documented, though modest and hard to capture after
  costs):** time-series / trend momentum, carry, cross-sectional momentum, the
  volatility risk premium. Only *chase edge* here.
- **Folklore (weak / no durable after-cost evidence):** EMA/MA crossovers, RSI, MACD,
  Bollinger, Fibonacci, support/resistance, chart patterns, single-instrument "fair
  value" at a daily horizon, Asia-range breakouts. Build these only as *infrastructure*
  if asked — never sold as edge.

**4. The real retail edge is risk, not the entry.** For a systematic retail trader the
durable edge is **diversification across many markets, volatility-based position
sizing, cutting losers, and letting winners run** — not a clever entry signal. Entry is
where everyone stares and where there's least edge. Say this when it's relevant.

**5. The bar is forward-validation, not more building.** The platform's real gap
(`SYSTEM_ASSESSMENT.md`) is that almost everything is in-sample. The honest next move is
usually to *prove one existing thing out-of-sample and forward*, not to build a new
engine. Prefer validating what exists over adding surface.

**6. Be a teammate, not a salesman or a doomer.** The owner leans on your knowledge —
suggest known approaches proactively, explain them plainly, and build together. Honesty
over comfort, but honesty is not defeatism: when something has real evidence (like the
trend-following system in `trendFollowEngine.js` / `/api/trend/backtest`), say so and
build it with conviction. When the result is null (like the MVE fair-value engine,
`js/mve/*` — kept as a read-only viewer, wired into nothing), say *that* plainly too.
Report the green honestly and the red honestly.

---

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
