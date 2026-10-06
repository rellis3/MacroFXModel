# STEP 1b — forecast persistence / weekday / IV fix (results) — VARIANT 1, live-computable inputs

Pre-registration: `forge/FORECAST_FIX_PREREG.md`. Walk-forward folds 0–5: **52,486 instrument-sessions, 1,558 dates**. Pinball over 12 rungs ÷ σ_used, ratio vs A1 (same σ, widths refit), 95% date-block interval.

| arm | rows | pinball ÷ A1 [95%] | regime miss (HL p75, max |exc − 25%|) arm vs A1 | worst class ratio | verdict |
|---|---|---|---|---|---|
| A0 | 52,486 | 0.9989 [0.9982, 0.9997] | — | 0.9997 | **reference** |
| B | 52,486 | 0.9799 [0.9738, 0.9848] | 2.4 vs 6.8 pp | 0.9880 | **PASS** |
| C | 19,831 | 0.9682 [0.9605, 0.9751] | 3.4 vs 6.4 pp | 0.9752 | **PASS** |

A0 = the export as it was point-in-time; A1 = same σ with widths refit (the control).

## HL p75 exceedance by regime (%, target 25)

| arm | quiet | normal | busy |
|---|---|---|---|
| B | 23.9 | 22.6 | 23.8 |
| A1 | 29.8 | 22.6 | 18.2 |
| C (IV rows) | 23.8 | 21.6 | 22.7 |
| A1 (IV rows) | 30.5 | 22.9 | 18.6 |

## HL p75 exceedance by weekday (%, target 25)

| arm | Mon | Tue | Wed | Thu | Fri |
|---|---|---|---|---|---|
| B | 25.7 | 21.4 | 21.6 | 23.2 | 24.5 |
| A1 | 20.3 | 22.9 | 24.0 | 27.3 | 23.1 |
| C (IV rows) | 24.5 | 19.9 | 20.5 | 23.4 | 24.9 |
| A1 (IV rows) | 20.8 | 22.1 | 23.3 | 29.0 | 24.8 |

## Pinball ratio vs A1 by class and fold

| arm | fx_crosses | fx_majors | gold | indices | fold 0 | fold 1 | fold 2 | fold 3 | fold 4 | fold 5 |
|---|---|---|---|---|---|---|---|---|---|---|
| A0 | 0.9987 | 0.9991 | 0.9997 | 0.9993 | 0.9993 | 0.9999 | 0.9977 | 0.9989 | 0.9985 | 0.9992 |
| B | 0.9793 | 0.9880 | 0.9864 | 0.9711 | 0.9753 | 0.9869 | 0.9836 | 0.9847 | 0.9679 | 0.9809 |
| C | nan | 0.9752 | 0.9708 | 0.9606 | 0.9578 | 0.9763 | 0.9779 | 0.9734 | 0.9621 | 0.9625 |

## β (last fold; per-unit, log σ multiplier)

- fx_crosses|B: regime -0.273, res1 +0.109, res5 +0.276, wd1 +0.084, wd2 +0.093, wd3 +0.105, wd4 +0.041
- fx_majors|C: regime -0.054, res1 +0.061, res5 +0.206, wd1 +0.072, wd2 +0.090, wd3 +0.121, wd4 +0.057, iv_sig +0.584
- fx_majors|B: regime -0.238, res1 +0.079, res5 +0.207, wd1 +0.101, wd2 +0.133, wd3 +0.135, wd4 +0.076
- gold|C: regime -0.030, res1 -0.021, res5 +0.130, wd1 +0.010, wd2 +0.015, wd3 +0.063, wd4 +0.051, iv_sig +0.709
- gold|B: regime -0.346, res1 +0.019, res5 +0.172, wd1 +0.028, wd2 +0.028, wd3 +0.074, wd4 +0.056
- indices|C: regime -0.067, res1 +0.172, res5 +0.215, wd1 +0.037, wd2 +0.022, wd3 +0.074, wd4 +0.001, iv_sig +0.336
- indices|B: regime -0.193, res1 +0.187, res5 +0.244, wd1 +0.041, wd2 +0.028, wd3 +0.075, wd4 +0.003
