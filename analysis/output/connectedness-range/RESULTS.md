# connectedness-range — results

Prereg: `forge/CONNECTEDNESS_RANGE_PREREG.md` (committed in `61c10328`, 2026-11-14; A1 PRE-RESULTS in `f5b35b64`). Run 2026-11-14, seed 20261114, B = 2000.
Branch `main`. Ledger id: `connectedness-range`. Scripts `scripts/connectedness-range/` (`run.py`, `finish.py`).

## Verdict: NULL

Total connectedness of the ten markets' London-session log ranges (Diebold-Yilmaz, VAR(1), W = 250 days, H = 10; mean 61.6%, SD 6.5) adds almost nothing to the next session's pooled log range once range persistence (HAR terms), the VIX level, the mean absolute correlation and weekday are in the model: **b_C = +0.003 log points per SD of C, 95% CI [-0.011, +0.017]** (t 0.43, 1800 sessions 2019-01-04 to 2026-08-19), i.e. a more connected state goes with a next-day range about 0.3% wider per SD, and the data rule out anything above about 1.7% per SD. The registered gate (b ≥ +0.02, lower end > 0, real above 95% of shift placebos) fails and the interval's upper end sits below the +0.05 operational bar, so the verdict is `NULL`. The design was powered for it: the MDE was 0.029 to 0.038 per SD, above the +0.02 gate but well below +0.05. Adding C to the baseline raises R² by 0.012%.

## Scored cell

| Cell | n | b_C (per SD) | 95% CI (block bootstrap) | SE | t | MDE | Placebo below real | Verdict |
|---|---|---|---|---|---|---|---|---|
| Pooled ten-market log range, next London session | 1800 | +0.003 | [-0.011, +0.017] | 0.0069 | 0.43 | 0.029-0.038 | 0.65 | NULL |

Controls' coefficients in B1 for scale: pooled log range today +0.192, 5-day +0.287, 20-day +0.094, ln VIX +0.295, mean |rho| +0.146.

## Controls (THE MIRROR) and descriptive

- **The shift placebo:** the all-shift distribution of b_C has mean +0.0000 and SD 0.019 (336 shifts); the real coefficient sits at the 65th percentile (gate 95th).
- **C is a new variable, not a proxy:** rank correlation with ln VIX -0.08, with mean |rho| +0.26; it moves with neither, and it still does not predict.
- **Sensitivities (never scored):** without the VIX control -0.007; 5-day change in C +0.014; W = 120 +0.010; W = 500 +0.010; H = 5 +0.004. All inside ±0.02.
- **Halves:** first -0.033, second +0.012: the first-half estimate is negative; no stable sign.
- **By group target (point estimates, no tests, BH not computed):** FX +0.006, gold +0.052, indices -0.031. Gold's +0.05 is one of three post-hoc looks with no interval and is not a result.

## Deviations from the prereg

A1 (PRE-RESULTS): units clarified (the VAR series and target are ln(ln(H/L)), the log range; a first power-stage run on ln(H/L) read no coefficient and was discarded), the sample starts 2019-01-04 because the ten-market VAR needs all ten markets and the SPX500 minute file has many missing sessions in 2016-18, and the design SE/MDE. Nothing else changed.

## What this changes

Nothing live. The connectedness dial/network idea is only a description of the volatility web: the terminal may draw it, and must say it carries no range information beyond VIX, correlation and range persistence ("connectedness did not predict the next day's range"). It is not a risk-state input. A TVP-VAR version, implied-vol connectedness, or commodity futures are different questions and would need their own prereg.
