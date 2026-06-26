# NASDAQ Liquidity Continuation Framework

## What it is

A four-gate, institutional-style macro trading framework for NASDAQ (NQ Futures / QQQ), built entirely from scratch in `js/nasdaq*.js`. It answers a single question on each trading day: *does the current macro-liquidity and trend environment justify entering, holding, or exiting a continuation trade on NASDAQ?*

Every number behind every decision is visible and traceable. No black boxes — the framework's core design principle is that a reader should be able to open `js/nasdaqConfig.js` and follow the logic all the way from raw FRED/Yahoo data to a trade signal without any hidden steps.

---

## Why it was built

The existing dashboard (MacroFX) already had several liquidity and QMR systems, but they were built iteratively on top of each other. This framework was started fresh — explicitly not extending any prior system — to get clean ideas untainted by potentially-flawed prior architecture. The goal: a research-quality, fully auditable NASDAQ continuation model that runs live in the dashboard and surfaces its working to the user, not just its output.

---

## The four gates

### Gate 1 — Liquidity Engine (`nasdaqLiquidityEngine.js`)

Aggregates 14 macro inputs (Fed balance sheet WALCL, Reverse Repo RRP, Treasury General Account TGA, ECB/BOJ/PBOC balance sheets, yield curve, DXY, HY credit spreads, NFCI, HYG/LQD ratio, VIX, VIX3M, VVIX) into a single **LiquidityScore** on a −5 to +5 scale.

**Method:** rolling z-score each input over a 252-day window → sign-adjust so positive always means "more bullish for liquidity" → clip to ±3 std devs → weighted average (weight-present only; missing inputs abstain, not zero) → rescale to [−5, +5] → classify:

- **BULLISH** (score > +2): macro liquidity is expansionary — look for LONG setups
- **BEARISH** (score < −2): macro liquidity is contractionary — look for SHORT setups
- **NEUTRAL**: no directional bias → no trade eligible

Publication lags are respected (e.g. WALCL has a 4-day lag, BOJ 10 days) so the backtest never sees a print before it would have been published in the real world.

---

### Gate 2 — Trend Expression Engine (`nasdaqTrendEngine.js`)

Measures whether price action *right now* is in a trending, high-conviction state consistent with a continuation trade. Produces a **TrendScore** from 0–100 via a weighted composite of seven sub-scores:

| Component | What it measures | Weight |
|---|---|---|
| ADX | Trend strength (directional movement) | 1.2 |
| Hurst exponent | Price persistence (H > 0.5 = trending series) | 1.0 |
| ATR percentile | Participation / volatility health | 0.8 |
| Momentum | Directional session move in ATR units | 1.2 |
| Breadth | Equal-weight vs cap-weight ETF trend | 1.0 |
| VWAP distance | Conviction relative to session VWAP | 0.8 |
| VIX term structure | VIX3M/VIX ratio (contango = calm, backwardation = fear) | 0.7 |

Each raw value is mapped onto a 0–100 sub-score via a **linear ramp** between `[rampLow, rampHigh]` (clipped outside the range). `rampLow > rampHigh` encodes "lower is better." Composite is a weighted average; **TrendScore > 70 → VALID**.

An exhaustion override penalises the ATR percentile sub-score when it falls outside the healthy participation band (25th–90th percentile), catching both dead markets (<25th) and blow-off exhaustion (>90th).

---

### Gate 3 — NY Confirmation Engine (`nasdaqNyConfirmationEngine.js`)

Runs during the 14:20–14:35 UK window (real DST-aware local time) and checks whether a panel of NY-session market moves *agrees* with the directional bias Gate 1 + Gate 2 have already proposed. It cannot invent a direction — only confirm or veto one.

Ten inputs vote (NQ/ES/RTY momentum, DXY inverse, US10Y yield move, price vs session VWAP, breadth proxy, TICK proxy, A/D proxy, TRIN inverse). Each carries an explicit `polarity` sign so the maths stays transparent. **Weighted agreement ≥ 60% → CONFIRMED**, otherwise no trade.

*Note:* In the daily-bar long-run backtest, true intraday TICK/ADD/TRIN have no free daily proxy — they abstain (NaN) rather than being faked, per the disclosure-over-fabrication principle. This is surfaced clearly in the output.

---

### Gate 4 — Dynamic Exit Engine (`nasdaqExitEngine.js`)

Re-evaluates every 30 minutes while a position is open, computing a **ContinuationScore** (0–100) from 15 inputs aligned to the open trade's direction. The score drives three possible actions:

- **> 70** → stay in, fully sized
- **50–70** → reduce to half position
- **< 40** → close trade (signal queued for next bar's open)

Secondary exit models (fixed-R, ATR trailing, chandelier, momentum deterioration, VWAP loss, breadth deterioration, time exit, hybrid trail/time) run in parallel against every completed trade for research comparison — they never override the primary Gate 4 exit.

---

## Entry rule

All three must align on the **same bar** while flat:

```
Gate 1 bias (BULLISH→LONG / BEARISH→SHORT)
  AND Gate 2 TrendScore > 70 (VALID)
  AND Gate 3 weighted agreement ≥ 60% (CONFIRMED)
```

Fill at the *next* bar's open (signal computed on close, never filled same-bar — no lookahead). One position at a time.

---

## Supporting modules

| File | Role |
|---|---|
| `nasdaqConfig.js` | Single source of truth for every threshold, weight, ramp, sign, ticker. Nothing in the engines hardcodes a magic number. |
| `nasdaqTransforms.js` | Pure math: ATR, ADX, Wilder smoothing, Hurst R/S, GARCH(1,1), rolling z-score, ramp scoring, Spearman/Pearson correlation. |
| `nasdaqDataSources.js` | FRED + Yahoo fetchers, publication-lag alignment, forward-fill onto trading-day calendar, deterministic synthetic dataset for CI/testing. |
| `nasdaqSizing.js` | Volatility regime (5-measure average percentile rank), stop distance, confidence tier (LOW/MEDIUM/HIGH risk %). |
| `nasdaqSessions.js` | DST-aware session slicing (Asia, London, London lunch, NY) using real `Intl.DateTimeFormat` — no fixed UTC offsets. |
| `nasdaqPerformance.js` | Sharpe, Sortino, Calmar, Omega, profit factor, Monte Carlo bootstrap (2000 resamples), walk-forward stability (4 windows), out-of-sample split. |
| `nasdaqResearch.js` | Lead-lag cross-correlation study (tests every lag in [−30,+30] days), feature importance ranking by rank-correlation — answers "does RRP lead NASDAQ?", "which Gate 2 component carries the most signal?" |
| `nasdaqBacktest.js` | Full daily-bar orchestrator: loads data, runs all four gates, executes entries/exits with transaction costs, produces equity curve and trade log. |

---

## Dashboard integration

Lives at `/nasdaq-liquidity-continuation` — a dedicated page in the MacroFX dashboard. The backend runs the full backtest asynchronously via:

- `POST /api/nasdaq-liquidity/run` → returns a `jobId`
- `GET /api/nasdaq-liquidity/status/:jobId` → polls until `done`, then returns the full result JSON

The HTML page (`nasdaq-liquidity-continuation.html`) surfaces:

- Gate 1 LiquidityScore timeline and current state
- Gate 2 TrendScore and VALID rate over time
- **Gate 2 Component Diagnostic** — per-component average sub-score, % days each component is the weakest-link (the dominant qualifier blocking VALID), % days reaching 70+. Designed to make miscalibration visible without re-reading code.
- Trade log with full attribution (LiquidityScore at entry, TrendScore at entry, direction, R outcome, exit reason)
- Performance summary (Sharpe, Calmar, profit factor, Monte Carlo bands, walk-forward stability)
- Lead-lag research table (does liquidity lead price? at what lag?)
- Gate 2 feature importance ranking

---

## Key calibration work done this session

### Gate 2 ramp recalibration (PR #411, merged)

Real-data backtests were producing only 2 trades over ~10–12 years against a design target of 2–3 trades/week. The Gate 2 Component Diagnostic surfaced the root cause: **momentum** and **breadth** were the near-permanent weakest-link components, dragging the composite below 70 on all but the most extreme market days.

Diagnosis: the original ramp anchors were calibrated to crisis-scale raw values. A normal "good trend day" produced:
- Momentum avg sub-score: **35/100** (rampHigh was 1.5 ATR — a crisis-day one-bar move)
- Breadth avg sub-score: **37/100** (rampHigh was 1.5 z — extreme breadth thrust)
- The framework's own documented reference lines (`adxTrendLevel: 25`, `hurstTrendLevel: 0.5`) scored only **50/100 and 40/100** under the old ramps — below the midpoint of what the dashboard itself labels "a real/persistent trend"

**Fix applied** (evidence-based, not goal-seeking):

| Component | Old rampHigh / rampLow | New | Rationale |
|---|---|---|---|
| momentum | rampHigh 1.5 ATR | **0.6 ATR** | Single-day close-to-close move rarely exceeds ~0.6×ATR; 1.5 is a volatile day, not a normal trend day |
| breadth | rampHigh 1.5 z | **1.0 z** | Tightens range so a normal positive breadth day scores above 50 rather than needing a breadth thrust |
| hurst | rampLow 0.40 | **0.32** | `hurstTrendLevel: 0.5` now scores ~55/100 instead of 40/100, consistent with the dashboard's own "trending" label |
| adx | rampHigh 40 | **32** | ADX > 30 is conventionally "a strong trend" in technical analysis; requiring 40 was unusually strict |

**Result (synthetic 12.9-year backtest):**

| | Gate 2 VALID rate | Trades | Avg hold |
|---|---|---|---|
| Before | 4.7% | 12 | 8.3 bars |
| After | 31% | 74 | 11.8 bars |

Verified end-to-end through the live `/api/nasdaq-liquidity/run` route. `validThreshold` (70) is unchanged.

### What the recalibration does not fix

74 trades over 12.9 years (~0.11/week) is still well short of 2–3/week. The remaining gap is **structural**, not a calibration bug:

1. **Single position at a time** — while a trade is open (avg ~12 bars), no new entry is evaluated. A 12-bar average hold + single-position-at-a-time caps the physical maximum at ~3254/12 ≈ 271 trades over the test window.
2. **Three independent gates ANDed on the same bar** — even with Gate 2 valid 31% of the time, Gate 1 bias ~50% of days, and Gate 3 ~60%+ agreement, the joint probability of all three aligning on a specific bar while flat is a product of three independently-rare events.
3. **Daily-bar resolution** — the backtest runs on daily OHLC (the only resolution with 12+ years of free history). The system's live trading mode operates on 30-minute bars with a real intraday Gate 3 NY-window — a genuinely different data resolution that naturally produces more decision opportunities per week.

Closing the remaining gap would require either redesigning concurrency/holding-period behavior or accepting that the literal 2-3/week target is an intraday-mode (live) expectation that the daily-bar long-run backtest structurally cannot replicate. That's an architectural decision, not a config tweak.

---

## Design principles (carried through everything)

- **No black boxes.** Every threshold, weight, sign, and ramp anchor is named and commented in `nasdaqConfig.js`. The Gate 2 Component Diagnostic card in the dashboard makes the maths visible without reading code.
- **Disclosure over fabrication.** Missing data abstains (weight-present coverage policy); the daily-bar backtest's use of proxy indicators for TICK/ADD/TRIN is explicitly surfaced, not silently substituted. Statistical caveats (e.g. overlapping-window t-stat inflation in the research module) are identified rather than hidden.
- **No lookahead.** Publication lags modelled explicitly; signals computed on bar close, filled at next bar's open.
- **Favour simple over complex.** Rank correlation (Spearman) rather than ML for research. Linear ramps rather than non-linear scoring models. Weighted averages rather than neural nets.
- **Fresh, not inherited.** No logic shared with or derived from the repo's pre-existing Liquidity Gate, NQ-QMR, or FX systems.
