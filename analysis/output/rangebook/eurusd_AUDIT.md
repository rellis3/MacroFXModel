# EURUSD books — power and calibration audit

Descriptive checks prompted by an outside review; no selection happens here. Train = 2016-03 → 2022-12, test = 2023-01 → 2026-08.

## 1. Is the forecast itself calibrated? Share of days each line is reached

| line | nominal | train | test |
|---|---|---|---|
| OH p50 (up side) | 50% | 52% | 49% |
| OL p50 (down side) | 50% | 51% | 49% |
| OH p75 | 25% | 26% | 25% |
| OL p75 | 25% | 26% | 25% |
| OH p90 | 10% | 11% | 10% |
| OL p90 | 10% | 11% | 9% |
| Close p50 (up) | 25% | 51% | 47% |
| Close p50 (down) | 25% | 51% | 49% |

Close lines are a CLOSE forecast (|close − open| ≥ line on 50%/25% of days), so being *touched* intraday is expected to exceed the nominal rate; they are listed for reference, not as a calibration failure.

| day range reaches | nominal | train | test |
|---|---|---|---|
| hl p50 | 50% | 53% | 47% |
| hl p75 | 25% | 27% | 23% |
| hl p90 | 10% | 11% | 10% |
## 2. Your forecast vs simple baselines — quantile loss of the day's range (lower is better)

Each predictor is scaled by a multiplier fitted on train only, at each quantile, so the comparison is about information, not calibration. Scored on TEST. Relative = loss ÷ the forecast's loss.

| predictor | p50 loss (rel) | p75 loss (rel) | p90 loss (rel) |
|---|---|---|---|
| forecast σ (your lines) | 0.1011 (1.00) | 0.0955 (1.00) | 0.0631 (1.00) |
| yesterday's range | 0.1314 (1.30) | 0.1268 (1.33) | 0.0850 (1.35) |
| EWMA of daily range (λ=0.94) | 0.1013 (1.00) | 0.0973 (1.02) | 0.0637 (1.01) |
| 20-day average range | 0.1039 (1.03) | 0.0996 (1.04) | 0.0660 (1.05) |

Unscaled (your lines as drawn) on test: p50 0.1003, p75 0.0948, p90 0.0630.

## 3. How small an edge could the tests have seen?

Minimum detectable effect (MDE) at 80% power, two-sided 5%: ≈ 2.8 × standard error.

| test | sample (test period) | standard error | MDE |
|---|---|---|---|
| OHOL_p50 follow, per trade | 887 touches | 0.027 R (1.7pp continue rate) | 0.075 R (4.7pp) |
| OHOL_p75 follow, per trade | 442 touches | 0.044 R (2.2pp continue rate) | 0.124 R (6.1pp) |
| Proj_p50 follow, per trade | 493 touches | 0.029 R (2.2pp continue rate) | 0.082 R (6.2pp) |
| day range ≥ p50, a pre-day subgroup, e.g. FOMC/NFP/CPI days | 111 days | 4.7pp | 13.3pp |
| day range ≥ p50, a mid-size subgroup (~400 days) | 400 days | 2.5pp | 7.0pp |
| day range ≥ p50, all test days | 943 days | 1.6pp | 4.6pp |

For scale: the round-trip spread is ≈0.020σ, which is ≈0.032R on a follow trade at the OH/OL median (stop at the open, ~0.62σ away) — about 3pp of continue rate.
