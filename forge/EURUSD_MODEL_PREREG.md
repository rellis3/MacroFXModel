# EURUSD model step — pre-registration

Committed 2026-09-30 before any model was fitted.

## Why
The range and touch books used condition tables, one or two conditions at a time. An
outside review (and the audit, analysis/output/rangebook/eurusd_AUDIT.md) pointed out
that (a) day size should be modelled continuously / as reach probabilities at the real
lines, (b) inputs should be combined in one regularised model with the σ forecast as a
feature, and (c) the forecast only ties an EWMA of daily range, so new information —
implied vol — is the obvious candidate. This is that test, on EURUSD only.

## Data (all already built, same days and touches as the books)
- Days: analysis/output/rangebook/eurusd.json (2,697 London days, 2016-03 → 2026-08).
- Touches: analysis/output/rangebook/eurusd_touches.json (10,672 non-same-bar first touches).
- Implied vol: CME CVOL EURUSD (js/data/cmeCvolEod.json, 2016-01 → 2026-08): cvol, atm,
  skew, convexity. A London day uses ONLY the latest settle dated strictly before it.
- Not included: COT (no local history), OI (60–90 days only), AI bias (never stored).

## Features
**Price/calendar (set P):** forecast σ (sigma_daily_pct), σ ÷ its 20-day median, EWMA
(λ=0.94) of daily range ÷ today's hl p50, yesterday's range ÷ hl p50, 5- and 20-day mean
range ÷ hl p50, yesterday's close-from-open in σ, HMM state (RANGE / TREND_up / TREND_dn),
event tier (none/high/tier1), weekday, month.
**Implied vol (set IV):** cvol, atm, skew, convexity, cvol ÷ forecast σ annualised,
1-day and 5-day change in cvol.
**Touch situation (touch model only):** line family and rung, side, London minutes,
range used, lines already touched, 60-min momentum, distance to next line and line behind (σ).
All day-level features come only from days completed before the London open.

## Targets
- **Day size:** log(day range ÷ hl p50) (quantile regression at 0.5/0.75/0.9), and the
  reach events day range ≥ hl p50 / p75 / p90.
- **Direction:** close > open; OH p50 reached (up side) vs OL p50 reached (down side), per side.
- **Touch:** follow net R and fade net R per touch (as defined in the touch book).

## Models (sklearn HistGradientBoosting, fixed settings, NO tuning)
max_depth 3, learning_rate 0.05, max_iter 300, l2_regularization 1.0, min_samples_leaf 100.
- **M0 — your lines:** reach probability = the train-period frequency of that line
  (≈ nominal); quantiles = the fitted hl widths.
- **M1 — EWMA baseline:** logistic / linear-quantile on log(EWMA ÷ hl p50) only.
- **M2 — GBM on set P.**
- **M3 — GBM on sets P + IV.**

## Walk-forward (the scoring)
Test years 2023, 2024, 2025, 2026 (to 08-20). For each, fit on all days before
1 January of that year minus a 5-trading-day embargo, predict that year. Pool the four
years' predictions and score them once.

## Scores and pass rules
Brier (reach/direction), pinball loss (quantiles), with 95% intervals from a 1,000×
bootstrap over days.
1. **Day size beyond the lines:** M3 beats M0 on Brier for range ≥ p50, p75 and p90, each
   interval above 0.
2. **Implied vol adds information:** M3 beats M2 on the same three, each interval above 0.
3. **Beyond the simple average:** M3 beats M1 on the same three.
4. **Direction:** M3 beats a 50% / train-frequency baseline for close > open (expected null).
5. **Touch trading:** walk-forward GBM (P + IV + touch situation) predicts follow and fade
   net R; take a touch in whichever direction is predicted > 0 (skip if neither). PASS if
   the taken trades' test net R > 0 with t ≥ 2.0.

If 1–3 pass and 5 fails, the next registered step is a decision check: whether the day-size
probabilities, used to choose WHICH touches to follow, lift the follow trade above spread.
