# HORIZON-REVERSION: weekly/monthly bands that know vol shocks fade

*Pre-registered 2026-10-05, before any result was computed. Source: Forecaster Portfolio
Lesson 03 §02 (GARCH persistence and the half-life of a volatility shock), applied to the
forecaster v3 calculation. Research only: the export and the live ladder are not changed
by this test.*

## The question

Today the weekly and monthly ladders use `σ_h = σ_t · √h` (h = 5 or 20) times a width
multiplier fitted per horizon (`forge/vol.py` `fit_horizon_widths`). The fitted multiplier
absorbs the *average* mean reversion of volatility inside the horizon. It cannot adapt to
the *state*:
- after a vol spike, σ should fall back over the week, so the band should be narrower;
- after a quiet spell, σ should rise, so the band should be wider.

Lesson 03 §02 says a variance shock decays geometrically with a half-life. Does using
that improve the multi-day bands out of sample?

## Arms

- **A, incumbent.** `σ_h = σ_t · √h`.
- **B, mean-reverting.** `σ_h² = Σ_{k=0}^{h−1} [ V̄_t + φ^k (σ_t² − V̄_t) ]`, with
  `φ = 0.5^(1/HL)`.
  - `V̄_t` = mean of the forecast-ready daily σ² over the trailing 250 days up to t
    (causal, no fitting).
  - `HL = ∞` gives arm A exactly, so A is nested in B.

In both arms:
- σ_t is each instrument's **frozen production estimator** (`js/forecastLadderParams.js`),
  forecast-ready via `as_of_yesterday`.
- Width multipliers are refit on the train span only, with the same quantile-of-ratio
  method as production.
- Windows are the same as production: weekly non-overlapping 5 sessions, monthly
  overlapping 20 sessions, `london22` sessions.

## Search (Lesson 02: logged trials)

- HL grid: {5, 10, 20, 40, 80} trading days, five trials.
- **One pooled HL per horizon**, chosen on the TRAIN span only. Criterion: mean across
  instruments of (B's HL p50 + p75 pinball) ÷ (A's same), on train.
- No per-instrument tuning.

## Split

Per instrument, windows are ordered by start date. **Train = first 60%, test = last 40%.**
Widths and HL are chosen on train and frozen for test.

## Pass rule (per horizon, decided separately for weekly and monthly)

**Primary.** On test, take the H-L p50 + p75 pinball loss ratio B ÷ A per instrument.
PASS if **both** hold:
1. the median ratio across instruments is **< 0.98**;
2. B beats A on **≥ 60%** of instruments.

**Secondary** (reported; it must not contradict the primary). Split test windows into
terciles of `σ_t / √V̄_t` (calm / normal / stressed, edges from train). H-L p75 exceedance
spread = max − min across terciles, pooled over instruments. B's spread should be smaller
than A's. If the primary passes but B's spread is **larger**, the verdict is MIXED.

**Decision.**
- PASS: propose B as an *option* in `forecastLadder.js` for the weekly/monthly horizons,
  behind a flag. The export changes only if the owner decides.
- FAIL or MIXED: record it here; the incumbent stays.

## Universe

Every instrument in `LADDER_PARAMS.pairs` with local M1:
- FX and gold: `VolRangeForecaster/data/m1/`;
- indices: `portfolioBacktest/cache/`.

Any instrument with fewer than 100 weekly windows is dropped and listed.

Script: `forge/run_horizon_reversion.py`. Output:
`analysis/output/horizon_reversion/RESULTS.md`.
