# Volatility Intelligence — Course Notes (Lessons 1–5)

> **Purpose of this file.** My working study notes on the Colez Trades
> "Volatility Intelligence" course, written for future me: revision before
> building anything, exam-style self-testing, and a map of where each concept
> already lives in this codebase. Treated like a university module: lecture
> summary → key points → critique → connections to MacroFXModel → open
> questions / research ideas.
>
> **House-rules lens.** Per `CLAUDE.md`, every claim gets tagged
> **[REPLICATED]** (documented in the literature), **[FOLKLORE]** (practitioner
> heuristic, weak after-cost evidence), or **[INFRA]** (a measurement/plumbing
> concept, not an edge claim). The course's core thesis — volatility is
> persistent and forecastable — is **[REPLICATED]**; several of its trading
> applications are not.

---

## Course thesis in one paragraph

Returns are ~unforecastable (directional accuracy ≈ coin flip); volatility is
strongly forecastable (lag-1 autocorrelation of |returns|/ranges ≈ 0.3–0.7,
directional accuracy of vol forecasts ≈ 60–75%). Therefore: stop trying to
predict direction, predict *range*. Forecast tomorrow's expected range before
the open, classify the volatility regime (low / normal / high) to decide which
strategy families are viable, and size positions inversely to expected
volatility so dollar risk per trade is constant. That asymmetry — vol
predictable, returns not — is the entire foundation of the course and of this
repo's forecaster.

---

## Lesson 1 — Why Volatility Is Predictable

### Lecture summary

- Return forecasting ≈ 51% directional accuracy; vol forecasting ≈ 70%+.
- **Volatility clustering**: large moves follow large moves, small follow
  small. Robust across assets, periods, regimes. **[REPLICATED]** — this is
  Mandelbrot (1963) / Engle's ARCH (1982); one of the best-documented
  stylized facts in finance.
- Mechanisms for clustering: information arrives in bursts; fear is
  contagious; leverage/margin cascades; slow adaptation to new vol levels.
- Returns: near-zero autocorrelation. Volatility: strong positive
  autocorrelation, decaying over 5–20 days.
- Transitions are asymmetric: low→high is abrupt (shock), high→low is gradual
  (fear decays slowly).
- Simple models capture most of the predictable variation — a 10-day ATR gets
  you most of the way; GARCH adds little in practice.

### Key points to remember

1. **The asymmetry is the whole game.** Don't spend effort on direction;
   spend it on range. (This is literally what the vol forecaster here does.)
2. Persistence test recipe: `corr(range_t, range_{t-1})`, expect 0.3–0.7;
   MAE of naive forecast 20–40% of actual range; directional accuracy 60–75%.
3. Persistence strength **varies by instrument** — FX majors strong, single
   stocks noisier. Always verify on the instrument before relying on it.
4. A null on one instrument is information, not failure (matches the
   falsification-harness mindset in `CLAUDE.md`).

### Critique / honest read

- The "~70%+ accuracy" number is presented without a benchmark. Per house
  rules: *name the floor*. The proper comparison is vs the unconditional
  (long-run average) forecast, not vs zero. Persistence is real, but the
  headline number is marketing-shaped.
- "This knowledge is directly actionable" — true for **risk** (sizing, stops),
  which is **[REPLICATED]**; it does **not** by itself create entry edge.
  Vol forecasting is a risk tool. A method is not a strategy.

### Where this already lives in MacroFXModel

- `js/volBacktestEngine.js` — the vol-sigma series (EWMA/HV20, GARCH,
  Yang-Zhang via `ewmaVarSeries`, `garchSigmas`, `yzVolSeries`) IS the
  persistence principle, formalized. EWMA = the lesson's "exponential
  weighting"; GARCH = the lesson's "complex model".
- The Feller range constants (`BM_P50 = 1.572`, `HN_P50 = 0.6745`) convert a
  σ forecast into an expected High–Low / Open–Close range — the course stops
  at "forecast the range"; this repo goes further and derives the range
  *distribution* from σ.
- `VOL_LEVEL_LESSONS.md` and `TRADABILITY_REVIEW.md` document what happened
  when we tested trading on top of these forecasts — read before assuming
  "forecastable range" ⇒ "tradeable levels".

### Self-test (exam questions)

- Q: Why does vol cluster? Name three mechanisms. *(bursty information,
  contagious fear/uncertainty, leverage & margin cascades, slow adaptation)*
- Q: Which has near-zero lag-1 autocorrelation — returns or |returns|? Why
  does that distinction matter?
- Q: What is the correct naive benchmark for a vol forecast? *(the
  unconditional long-run average, not zero)*

---

## Lesson 2 — Daily Volatility Forecasting

### Lecture summary

**Measurement (the building blocks) [INFRA]:**

- Simple range = High − Low. Misses gaps.
- **True Range** = `max(H−L, |H−C₋₁|, |L−C₋₁|)` — captures gaps; use it for
  anything held overnight.
- Std-dev of returns: the statistical classic, outlier-sensitive.
- (Parkinson mentioned as the research-grade range estimator.)

**Forecasting (three methods):**

| Method | Formula | Note |
|---|---|---|
| SMA of TR (classic ATR) | `Σ TR / N` | stable, slow to react |
| **EMA of TR (recommended)** | `EMA = α·TR + (1−α)·EMA₋₁` | responsive, one knob |
| Wilder's smoothing | `(ATR₋₁·(N−1) + TR)/N` | industry standard; is an EMA with α = 1/N |

- α ↔ period: `α = 2/(N+1)`. Recommended start: **α = 0.15 (~12 days)**.
- Calibration: grid-search α ∈ [0.05, 0.40] minimizing MAE of one-step-ahead
  forecast; validate out-of-sample; be suspicious if optimum is far from
  0.10–0.20 (overfit smell).
- Think in **confidence bands**, not point forecasts — e.g. "68% of the time
  actual is within ±25% of forecast".
- Daily 2-minute workflow: update EMA with yesterday's TR → note forecast →
  rising or falling? → apply to sizing/stops/targets → end-of-day log
  forecast vs actual.

### Key points to remember

1. **True Range, not simple range**, for anything with overnight exposure —
   the gap IS risk you carried.
2. Wilder's ATR ≡ EMA — they're the same family, don't treat "ATR vs EMA" as
   a real choice, only the effective period matters.
3. **Don't over-calibrate.** The MAE-optimal α on history is fit to that
   history. This is the course's own version of `CLAUDE.md`'s anti-overfit
   rule: prefer a principled default over a tuned knob.
4. Forecast misses cluster at regime shifts — a big miss is itself a signal
   (see Lesson 3).

### Critique / honest read

- The lesson's typical-range table (EUR/USD 50–80 pips etc.) is a snapshot;
  it goes stale. The percentile approach in Lesson 3 is the durable version
  of the same idea. Use distributions, not memorized constants.
- No costs appear anywhere in the course. Fine for a *measurement* lesson,
  but remember: nothing in these notes is a result until it passes the
  costs-on OOS harness.

### Where this already lives in MacroFXModel

- `js/indicatorCore.js` — `trueRange`, `atrWilder`, `atrEma` (deliberately
  named so variants are never silently swapped; exactly the Wilder≡EMA point
  above), `ema`.
- `js/volBacktestEngine.js` — `ewmaVarSeries` with `LAMBDA` is the
  variance-space version of the lesson's EMA-of-TR (RiskMetrics-style;
  λ ≈ 1−α on squared returns rather than ranges).
- The lesson's "calibrate α by MAE" is what `estimator-ab.html` /
  `vol-forecast-bench.html` do properly: A/B vol estimators on a held-out
  split rather than one in-sample MAE grid.
- **Known drift warning:** `VOL_ESTIMATOR_DRIFT.md` /
  `FUTURE_FIX_VOL_ESTIMATOR.md` — the live `/api/vol-forecast` correction
  constants are flagged drift vs the backtest math. The lesson's "one EMA,
  updated daily" sounds trivial; keeping *one* definition across live and
  backtest is the actual hard part (Lego Principle 1 exists because of this).

### Self-test

- Q: Yesterday close 100, today O=105 H=106 L=103. Simple range? True Range?
  *(3 vs 6)*
- Q: Convert α = 0.15 to an equivalent SMA period. *(N = 2/α − 1 ≈ 12.3)*
- Q: Why prefer α = 0.15 default over the MAE-optimal α = 0.31 you just
  fitted? *(out-of-sample degradation; atypical optima are overfit smell)*

---

## Lesson 3 — Weekly Regimes & Multi-Day Structure

### Lecture summary

- Three regimes: **High** (crisis; 1.5–3× normal range, gaps, reversals,
  days–weeks), **Normal** (trends follow through; weeks–months), **Low**
  (compression, complacency; weeks–months).
- **Regime asymmetry**: low regimes are longer/stabler; low→high transitions
  are sudden, high→low gradual. The dangerous one is **low→high** — sizing
  set during quiet markets meets an explosion.
- **Classifier: percentile rank of current ATR vs 6–12 months of history.**
  <25th pct = LOW, 25–75 = NORMAL, >75th = HIGH. Simple, robust,
  interpretable. **[INFRA]**, and honest — no fitted parameters.
- Weekly persistence mirrors daily: last week's range forecasts this week's.
- **Weekly ≠ daily × 5.** Actual weekly range ≈ 2–3× daily range because of
  overlap and intraweek mean reversion.
- Regime → behavior table: low vol = can size up, tighter stops (0.75×ATR),
  mean reversion viable; normal = baseline, trend-following; high = cut size
  30–50%, 1.5–2×ATR stops, take profits fast, momentum/breakout conditions.
- Cadence: regime check weekly (or after a shock); ATR daily; thresholds
  reviewed monthly.

### Key points to remember

1. Percentile-vs-own-history is the regime classifier worth keeping: it
   auto-adapts per instrument, needs no tuning, and its two thresholds
   (25/75) are convention, not fit.
2. The **√5 rule connects here**: the course says weekly ≈ 2–3× daily; this
   repo scales σ by `√5 ≈ 2.24` (`HORIZONS.weekly.sigmaScale` in
   `js/forecastCore.js`). The course's empirical rule of thumb and the
   Brownian √-time scaling are the *same statement* — nice independent
   confirmation of the horizon-agnostic design.
3. Regime dictates the **strategy family** (fade vs follow, size, stop
   width), not the entry. This is "the brain is a selector, not more knobs".
4. Big forecast misses (Lesson 2 log) are the early-warning input for
   regime-transition detection.

### Critique / honest read

- The regime→strategy table ("mean reversion works in low vol",
  "trend-following shines in normal") is stated as fact but is
  **[FOLKLORE]-leaning** until tested per instrument — plausible priors, not
  results. This repo's `dayTypeCore.js` fade-vs-follow classifier is the
  testable version of the same intuition; `REVERSION_CONTINUATION_EVIDENCE.md`
  records what actually survived.
- Percentile thresholds at 25/75 are arbitrary but *honestly* arbitrary —
  better than fitted thresholds. Resist the urge to optimize them.

### Where this already lives in MacroFXModel

- `classifyRegime` in `js/volBacktestEngine.js` — note it's a **trend/price
  regime** classifier (EMA slope), not a vol-percentile classifier. The
  course's vol-percentile regime is a *different axis* (vol level vs trend
  direction). Both are legitimate; don't conflate them.
- `rollingPercentile` in `js/statsCore.js` is exactly the brick a
  vol-percentile regime gate would import — no new code needed for the core
  math.
- `js/dayTypeCore.js` (`dayTypeScore`, trend-day-ness `T` = drift÷diffusion)
  is the intraday cousin: regime classification at the day scale deciding
  fade vs follow.
- The weekly horizon already exists end-to-end via `HORIZONS` — any regime
  idea must run at daily/weekly/20-day through the same code path.

### Self-test

- Q: Current ATR is higher than 82% of the last 8 months of ATRs. Regime?
  What two sizing changes follow? *(HIGH; cut base risk 30–50%, widen stops
  to 1.5–2×ATR)*
- Q: Why is weekly range ~2.2× daily rather than 5×? *(range grows ~√time
  for diffusive prices; overlap + intraweek reversion)*
- Q: Which transition kills accounts and why? *(low→high: complacent sizing
  meets sudden expansion, stops gap/slip)*

---

## Lesson 4 — Session Structure: Asia Range as Daily Anchor

### Lecture summary

- 24h FX day = Asia (quiet, range-forming) → London (direction established,
  vol surge at open) → London/NY overlap (~12:00–16:00 GMT, peak vol, most
  of the daily range prints) → NY afternoon fade.
- **Asia range × expansion ratio ≈ expected daily range.** Typical ratios
  2–3.5× (EUR/USD 2–3×, Gold 2.5–4×). Ratio is regime-dependent: high-vol
  regimes expand more (3×+), low-vol less (1.5–2×). Calibrate over 20–30
  days per instrument.
- Interpretation grid: Asia range <70% of its own average → expect a quiet
  day; >130% → vol already elevated (overnight news?), size accordingly.
- Daily prep: mark Asia H/L before London → project expected range → note
  regime + calendar → watch London's reaction to Asia levels in the first
  1–2 h → downgrade expectations if the projected range is spent by midday.
- The lesson's own caveat (important): **Asia range is context, not a
  signal** — expectation-setting for sizing/targets, not a mechanical entry
  trigger.

### Key points to remember

1. The honest use of Asia range is as a **second, independent estimate of
   today's expected range** — a same-day nowcast that updates the overnight
   EMA/σ forecast. That's the defensible part.
2. Expansion ratio interacts with regime (Lesson 3): one more reason the
   regime tag needs to be computed first each day.
3. Time-of-day matters for fills and stops: the overlap is where daily
   ranges print AND where slippage is worst — relevant to the fill walker's
   realism, not just entries.

### Critique / honest read

- `CLAUDE.md` explicitly files **Asia-range breakouts under [FOLKLORE]** —
  and the repo has receipts: `asiaRangeEngine`, `range-fib-backtest`,
  `RANGE_EXTENSION_GUIDE.md`, `asia fib.md` are prior work in exactly this
  area. Before ANY new session-structure idea, read
  `REVERSION_CONTINUATION_EVIDENCE.md` and the asia-range backtest results
  for what already came back null vs what survived.
- Note the lesson never claims the *breakout* has edge — it claims the
  *range projection* is informative. Those are different claims (a
  measurement claim vs an entry-edge claim). Keep them separate out loud.
- "Expansion ratio 2–3.5×" pooled across all days can hide the interesting
  structure — disaggregate by regime and day-type before using one number
  (pooled nulls hide subset edges; but count the cells).

### Where this already lives in MacroFXModel

- `js/asiaRangeEngine` + `js/barUtils.js` (`extractBars`, session slicing on
  the M1 packed-array hot path) — the plumbing for session ranges exists;
  import, don't rewrite.
- `js/fibProjection.js` (`calcFibs`) — the range-extension grid is a more
  granular version of the lesson's single expansion multiplier.
- `js/rangeBiasCore.js` — the live entry-bias features that grade a
  session-range entry; shared by live (`levels.js`) and backtest
  (`asiaRangeEngine`) — the anti-drift pattern the course doesn't teach.
- M1 data via `loadM1ForPair` is what makes honest session backtests
  possible (daily bars can't tell you what happened inside the day —
  intrabar TP assumptions are a listed anti-pattern).

### Self-test

- Q: Asia range 30 pips, calibrated expansion 2.5×. Expected daily range?
  What does a 150-pip target on today's day trade imply? *(~75 pips;
  target ≈ 2 days of expected movement — unrealistic)*
- Q: Distinguish the two claims in this lesson and tag each: (a) Asia range
  predicts daily range; (b) trading Asia breakouts is profitable.
  *((a) measurement/persistence claim, testable, plausibly [INFRA]-true;
  (b) [FOLKLORE] entry claim, this repo's own backtests are the evidence bar)*
- Q: Why must session backtests use M1 rather than D1 bars?

---

## Lesson 5 — Position Sizing with Volatility

### Lecture summary

- Fixed sizing ("always 1 lot") makes dollar risk drift with vol → P&L
  volatility becomes an accident of the regime, and you can't tell skill
  from vol-timing luck.
- **Core formula:**

  ```
  Position Size = Risk Amount ÷ (ATR × Stop Multiplier × per-unit value)
  ```

  Risk amount = 0.5–2% of account; ATR = current daily forecast (Lesson 2);
  multiplier = stop distance in ATR units (0.75–2× by strategy/regime).
- Worked example: ATR 65→120 pips ⇒ size 0.51→0.28 lots, dollar risk
  identical ($500). **Vol doubles → size halves.**
- Optional regime overlay (Lesson 3): scale base risk % by 0.5–0.75× in HIGH
  regime (gaps/slippage make the ATR estimate itself less reliable there);
  1–1.25× in LOW. Strategy-dependent — some strategies *want* high vol.
- ATR-based stops (0.75×–2×) and targets (1×–3×) keep everything in the same
  units; reality-check targets against expected range.
- Pitfalls: stale ATR after news; oversizing in low vol (**always keep a
  hard max-size cap** — low vol becomes high vol instantly); liquidity/
  depth; gap risk means realized loss > planned loss.

### Key points to remember

1. **This is the [REPLICATED] payoff of the whole course.** Per `CLAUDE.md`
   §4: the durable retail edge is diversification + vol-based sizing +
   cutting losers — *not* the entry. Lesson 5 is that principle made
   mechanical. Highest-value lesson of the five.
2. The formula's beauty: choose the stop multiplier freely; size
   auto-compensates so dollar risk is invariant. Stop width and risk are
   decoupled decisions.
3. The hard cap is not optional. The formula is a linear rule trusted into a
   nonlinear tail; the cap is the guard against the low→high transition
   (Lesson 3's killer scenario).
4. Consistent dollar risk ⇒ consistent P&L vol ⇒ Sharpe/DD statistics
   actually measure the strategy, not the regime path. This matters for the
   *harness*, not just live trading: backtests without vol-sizing conflate
   edge with vol timing.
5. Wrong pip value silently breaks everything — a 10× PnL bug. Pip math
   comes from `js/instrumentRegistry.js`, never hand-coded.

### Where this already lives in MacroFXModel

- `js/instrumentRegistry.js` (`pipSize`, `instrument`) — the per-unit-value
  input to the formula.
- σ from `volSigmaSeries` is a better "ATR" input than ATR itself here —
  same persistence, already the single source of truth, already
  horizon-scaled. Any sizing brick should take σ (or an ATR from
  `indicatorCore`) as a *parameter*, not recompute it.
- `TRADING_SAFETY_LAYER.md` — the live bots' guardrails; the hard-cap rule
  belongs to that layer.
- The volatility bot's daily plan (σ-derived lines, `volatility_bot/`) is
  where a vol-sized stop/target would plug in.

### Self-test

- Q: $50k account, 1% risk, ATR 72 pips, 1.5× stop, $10/pip. Size?
  *(500 ÷ (108×10) ≈ 0.46 lots)*
- Q: ATR doubles overnight. What happens to (a) position size, (b) dollar
  risk, (c) stop distance in pips? *(halves / unchanged / doubles)*
- Q: Why keep a hard max-size cap even though the formula "allows" a big
  position in low vol?
- Q: Why does fixed sizing corrupt backtest statistics, not just live risk?

---

## Cross-lesson synthesis — the pipeline

The five lessons compose into one daily pipeline, and it's (mostly) already
this repo's architecture:

```
measure vol        forecast range          classify regime         nowcast intraday        size & manage
(L2: TR, EMA)  →   (L1/L2: persistence) →  (L3: percentile,     →  (L4: Asia range      →  (L5: risk ÷ (σ×mult),
                                            fade-vs-follow)         × expansion)            ATR stops/targets,
                                                                                            hard cap)
indicatorCore /     volSigmaSeries ×        statsCore.rolling-      asiaRangeEngine /       instrumentRegistry +
statsCore           Feller constants        Percentile; dayType-    fibProjection /         (candidate sizing
                    (volBacktestEngine)     Core (built)            rangeBiasCore           brick — not built)
```

**Honest status of each stage (built ≠ works ≠ has edge):**

- Measure/forecast: **built and validated** — the forecaster's core.
- Regime (vol-percentile flavor): **bricks exist**, the specific
  vol-percentile regime tag is **not** assembled as a named brick.
- Asia nowcast: **built as backtests**; edge claims mostly came back
  null/weak — see the evidence docs.
- Vol-based sizing: **the concept is [REPLICATED]** but there is no single
  shared `positionSize(σ, riskPct, multiplier, instrument)` brick yet — see
  research idea R1.

---

## Future research ideas (pre-registered, per house rules)

Each idea states the prior, the test, and what "worked"/"didn't" look like
**before** running anything. Default expected outcome for anything entry-like:
**null** (that's the base rate).

**R1 — Extract a `positionSizeCore` brick. [INFRA — no edge claim]**
Pure function: `size = f(equity, riskPct, sigma, stopMult, instrument)` +
hard-cap + regime scalar. Consumers: volatility bot plan, backtest engines
(so equity curves are vol-normalized), any future bot. Test: unit tests on
synthetic data; A/B a backtest with fixed vs vol-adjusted sizing — success =
materially more stable rolling P&L vol at equal mean; failure = no
stabilization (would be surprising; this is near-mechanical). Odds it's
worth building: high — it's plumbing, not edge. Register in
`LEGO_MODULES.md` when done.

**R2 — Vol-percentile regime tag as a Tier-2 brick. [INFRA]**
`volRegime(ctx) → {LOW|NORMAL|HIGH, percentile}` from `rollingPercentile`
over the σ series, 6–12-month window, 25/75 thresholds (fixed, not fitted).
Then the *research* question: condition the existing fade-vs-follow OOS
results on the tag. Pre-registration: "worked" = OOS Sharpe of the selector
improves with ≥30 OOS trades per regime cell and the same sign across ≥2/3
horizons; "didn't" = cells too thin or sign flips across horizons — report
as null, keep the tag as risk-plumbing anyway. Blunt odds of *edge* from the
conditioning: ~15–20%. The tag is useful for sizing regardless.

**R3 — Asia-range expansion ratio as a σ-nowcast update. [testable, ~15%]**
Not a breakout strategy (folklore, already picked over here). Question: does
`asiaRange / expectedAsiaRange(σ)` add information to the daily range
forecast beyond yesterday's σ? Test: regression of realized daily range on
(σ forecast, Asia-ratio) with true OOS split; "worked" = OOS MAE improves
≥5% vs σ-only; "didn't" = anything less. Costs irrelevant (it's a forecast,
not a trade). If it works, it upgrades the *forecast*, and only then ask
whether any consumer of the forecast improves.

**R4 — Forecast-miss streaks as a regime-transition early warning. [~10–15%]**
Lesson 2's end-of-day log, systematized: do k consecutive days of
actual > forecast×(1+band) precede HIGH-regime tags? "Worked" = miss-streak
lead time over the percentile tag is positive with useful hit rate on OOS
data; "didn't" = it's coincident, not leading (most likely). Even a null is
useful calibration for the confidence bands.

**R5 — Weekly-horizon calibration check of √5. [INFRA, cheap]**
Measure actual weekly-range ÷ daily-range ratios per pair vs the theoretical
√5·(BM-const correction). Course says 2–3×; theory says ~2.24× before
correction factors. A per-pair table would validate (or flag drift in) the
`hl_corr` constants at the weekly horizon. Pure measurement; no edge claim;
feeds `FUTURE_FIX_VOL_ESTIMATOR.md`.

---

## Areas of interest for further study (reading list)

- **HAR models** (Corsi) — daily+weekly+monthly realized-vol regression;
  natural fit since `HORIZONS` already computes all three scales. The
  "simple beats complex" survivor among fancy vol models.
- **Regime-switching (Markov/HMM)** — the repo already has `hmm.js` /
  `hmm5m*.js`; compare the formal HMM states to the dumb percentile tag —
  does sophistication buy anything OOS? (Prior: little.)
- **Realized vol from intraday data** — we hold M1; realized-variance
  estimators (5-min RV, bipower variation) are strictly more efficient than
  daily-range estimators and would upgrade the σ input. High-value, pure
  [INFRA].
- **Yang-Zhang / Parkinson / Garman-Klass estimator family** — `yzVolSeries`
  exists; know *why* YZ dominates close-close (uses OHLC, drift-robust,
  handles overnight).
- **The volatility risk premium** — the one vol-related *edge* on the
  [REPLICATED] list; not implementable with OANDA spot mids (needs options),
  so defer honestly rather than build a lookalike (`vix-vol-carry/` touches
  the adjacent equity-index version).
- **Forecast evaluation proper** — Mincer-Zarnowitz regressions, QLIKE vs
  MSE loss for vol forecasts; upgrade from MAE before doing R3/R5.

---

## Exam-cram card (one screen)

- Vol predictable (AC 0.3–0.7), returns not (~0). Clustering: bursty info,
  contagion, leverage cascades.
- TR = max(H−L, |H−C₋₁|, |L−C₋₁|). EMA of TR, α=0.15 ≈ 12d; α=2/(N+1).
  Wilder ATR ≡ EMA.
- Regime = percentile of ATR vs 6–12 mo: <25 LOW / >75 HIGH. Low→high is
  the killer transition. Check weekly.
- Weekly range ≈ √5 ≈ 2.24× daily (course: 2–3×). Never ×5.
- Asia range × 2–3.5× ≈ daily range. Context, not signal. Overlap
  (12–16 GMT) prints the range.
- Size = Risk$ ÷ (ATR × mult × $/pip). Vol doubles → size halves; risk
  constant. Hard cap always. Stops 0.75–2× ATR, targets 1–3× ATR.
- House rules: name folklore vs replicated; benchmark before "improvement";
  pre-register outcomes; costs + true OOS or it isn't a result; the edge is
  risk management, not the entry.
