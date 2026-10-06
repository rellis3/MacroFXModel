# STEP B — stop and size numbers (results)

Spec: `forge/HOW_MUCH_SPEC.md` (thresholds fixed first). σ = the chosen forecast's daily σ, walk-forward. Out-of-sample sessions 2020-08 → 2026-08.

| class | side | minimum stop (σ) | one bar crosses it on % of days [95%] | overshoot allowance p90 (σ) | planned loss per unit risk (σ) |
|---|---|---|---|---|---|
| fx_crosses | long | 0.55 | 4.6 [4.0, 5.3] | 0.77 | 1.31 |
| fx_crosses | short | 0.55 | 4.2 [3.6, 4.8] | 0.66 | 1.21 |
| fx_majors | long | 0.60 | 4.0 [3.4, 4.8] | 0.83 | 1.43 |
| fx_majors | short | 0.60 | 4.3 [3.7, 4.9] | 0.66 | 1.25 |
| gold | long | 0.60 | 4.3 [3.3, 5.5] | 0.41 | 1.01 |
| gold | short | 0.55 | 4.8 [3.8, 5.9] | 0.38 | 0.93 |
| indices | long | 0.55 | 3.9 [3.1, 4.7] | 0.70 | 1.25 |
| indices | short | 0.55 | 3.7 [3.0, 4.6] | 0.70 | 1.25 |

| class | Monday gap p90 (σ) | Tue–Fri gap p90 (σ) |
|---|---|---|
| fx_crosses | 0.49 | 0.22 |
| fx_majors | 0.53 | 0.19 |
| gold | 0.61 | 0.18 |
| indices | 0.55 | 0.24 |

How often one 5-minute bar crosses a stop at d σ (long side):

| class | 0.25 | 0.5 | 0.75 | 1.0 | 1.5 |
|---|---|---|---|---|---|
| fx_crosses | 36.6% | 5.8% | 2.1% | 1.1% | 0.3% |
| fx_majors | 37.8% | 6.5% | 2.4% | 1.2% | 0.3% |
| gold | 47.8% | 6.9% | 1.9% | 0.5% | 0.0% |
| indices | 45.8% | 5.2% | 1.6% | 0.7% | 0.3% |
