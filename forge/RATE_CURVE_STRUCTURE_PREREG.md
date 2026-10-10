# RATE-CURVE-STRUCTURE: does the SHAPE of repricing across the short-rate futures curve carry advance information about Nasdaq?

*Pre-registered 2026-10-11 before any curve factor was computed. Question (owner): can the speed, magnitude and
cross-maturity pattern of a repricing (broad / front-concentrated / deferred-concentrated / parallel vs steepening,
flattening, curvature) be identified from the 1-min contract data, and do the different patterns have different
relationships with subsequent Nasdaq returns, realised volatility and breakout probability — beyond any single
contract or two-contract spread, and beyond Nasdaq-only baselines?*

## Data (existing, `analysis/output/stir_1m/`)

SOFR U6 Z6 H7 M7 U7 (CME SR3), €STR U6 Z6 H7 M7 U7 (ICE ER3), Euribor Z6 H7 M7 U7 (ICE I), US 2y (ZT) and Schatz
(FGBS) as a cross-check, Nasdaq = CME NQ front (M6/U6/Z6, roll 7 days before expiry; the OANDA 1-min file after
2026-08-20 is another pre-registration's lockbox). 2026-04-13 → 2026-10-09. 15-min bars (label right, last midpoint,
≥ 10 minutes present), rate = 100 − price, changes in bp. **Explore 2026-04-13 → 07-17, confirm 2026-07-20 → 10-09.**
A second check uses monthly walk-forward refits over the whole window.

## Curve factors (per currency, from the five quarterly changes over window W ∈ {1 h, 4 h})

- **level** = mean change of the five (parallel move)
- **slope** = U7 − U6 (steepening > 0)
- **curvature** = 2·H7 − U6 − U7 (butterfly)
- **front share** = |mean(U6, Z6)| / (|mean(U6, Z6)| + |mean(M7, U7)|) ∈ [0, 1]
- **speed** = change over the last 1 h ÷ change over the last 4 h, same sign (1 = all of it in the last hour)
- **US − EU** versions of level, slope, curvature; and PCA-1/2/3 of the ten changes, weights fitted on explore only.

Each factor is standardised by its rolling 20-day RMS computed from days **before** the bar.

**Move types** (fired at bar t from data ≤ t, |z| thresholds fixed at 2 for the leading factor and < 1 for the
others): BROAD = |level z| ≥ 2 and |slope z| < 1; FRONT = front share ≥ 0.75 and |front z| ≥ 2; DEFERRED = front share
≤ 0.25 and |back z| ≥ 2; STEEPEN / FLATTEN = slope z ≥ 2 / ≤ −2 with |level z| < 1; TWIST = |curvature z| ≥ 2 with
|level z|, |slope z| < 1. Types are computed for US, EU and US−EU curves, at W = 1 h and 4 h. Signed by the direction
of the leading factor.

## Targets (Nasdaq, from the bar's close, horizons H ∈ {15 m, 1 h, 2 h, 4 h})

- forward log return; forward **realised volatility** (root sum of squared 15-min returns over H) ÷ trailing 20-day
  same-hour realised vol; **breakout** = forward H-window high or low exceeds the prior 4-hour range (0/1).

## Tests

1. **Conditional outcomes (event study).** For each type × curve × W × H: mean signed return (sign = leading factor's
   direction), mean relative vol, breakout rate, vs 1,000 hour-of-day-matched random bars in the same half. Explore:
   BH-FDR 10 % within each target family. Confirm: survivors only, sign fixed, one-sided 5 %.
2. **Lead times.** Day-clustered correlation of each factor's 15-min change with Nasdaq returns at leads 1–16 bars,
   explore and confirm; and after each type event, the first horizon at which Nasdaq's cumulative |move| or breakout
   rate departs from its matched baseline.
3. **Structure vs single contract vs spread, out of sample.** Ridge (returns, vol) and logistic (breakout) models fitted
   on explore, scored on confirm, with nested feature sets: (a) Nasdaq-only — trailing 1 h / 4 h return, trailing
   relative vol, hour of day; (b) + the single best contract's W-change (chosen on explore); (c) + two-contract spreads
   (SOFR U6 − €STR U6; US slope); (d) + the full curve set (level, slope, curvature, front share, speed, for US, EU and
   US−EU, plus the type dummies). Skill = out-of-sample R² (returns, vol) and AUC / log-loss (breakout) **relative to
   (a)**, with 95 % day-block bootstrap intervals on the difference. The claim "structure tells more" needs
   (d) > (c) ≥ (b) with the (d) − (a) interval above zero on confirm.
4. **Regimes.** The same event study split by stock–rates sign regime (rolling 20-day same-bar correlation from prior
   data), Nasdaq vol tercile and session (Asia / London / US). Stability = same sign in explore and confirm within regime.

Overlapping windows: day-clustered statistics and day-block bootstraps throughout. Look-ahead: every normalisation uses
prior days; PCA weights, thresholds and model fits come from explore only; events use data ≤ t.

## Reading rule

- "Structure carries advance information" = at least one type survives test 1 in both halves AND test 3 shows
  (d) − (a) > 0 on confirm with the interval above zero, for the same target.
- Nulls are classified with the planted-signal power of test 1 (event mean shifts of +0.05 % / +0.10 %; vol ratio ×1.1;
  breakout +5 pp), reported before the real results are read.
- Cells, thresholds, horizons and types are fixed here; nothing is added after the first number.

Script `scripts/rate_curve/curve_structure.py`; output `analysis/output/rate_curve_structure/RESULTS.md` + figures;
ledger id `rate-curve-structure`.

## Addendum A (2026-10-11, after the main result, before any addendum number): magnitude-only vol test

Owner's refinement: not direction — does the *size and distribution* of repricing across contracts forecast how much
Nasdaq moves? The main run's vol result (spreads +0.03 R², interval straddling zero; full set overfit) used signed
factors and 63 features. This addendum fixes a small unsigned set and a stronger baseline.

- **Features (per bar, from data ≤ t; W = 1 h and 4 h):** |z| of each contract's outright change (5 SOFR + 5 €STR);
  mean |z| per curve; dispersion = std of the ten |z|; front share per curve; mean |z| of the four month-to-month
  spread changes per curve (outright vs curve repricing); co-movement = sign(US level)·sign(EU level)·min(|z|). 18
  features at W=1h plus the two curve means at 4h = 20.
- **Baseline:** log trailing realised vol over 1 h, 4 h and 1 day, |return 1 h|, hour sin/cos, session dummies (9).
- **Targets:** log forward realised vol, log |forward return| and signed return at 15 m, 1 h, 2 h.
- **Models:** ridge (α=10) on standardised features; explore→confirm split and monthly walk-forward (Jun–Oct, refit on
  all prior data). Skill = OOS R² of baseline+rates minus baseline, day-block bootstrap 95 %. Regime split of the gain
  by trailing-vol tercile and session.
- **Keep rule (owner's):** gain > 0 with the interval above zero on confirm AND on walk-forward, same sign in ≥ 2 of 3
  vol terciles. Then a shadow record before any use in the vol forecast or sizing. Otherwise document and stop.
