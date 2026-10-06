# STEP 1b — forecast persistence / weekday / IV fix (results)

Pre-registration: `forge/FORECAST_FIX_PREREG.md`. Walk-forward folds 0–5: **52,486 instrument-sessions, 1,558 dates**. Pinball over 12 rungs ÷ σ_used, ratio vs A1 (same σ, widths refit), 95% date-block interval.

| arm | rows | pinball ÷ A1 [95%] | regime miss (HL p75, max |exc − 25%|) arm vs A1 | worst class ratio | verdict |
|---|---|---|---|---|---|
| A0 | 52,486 | 0.9985 [0.9975, 0.9996] | — | 1.0019 | **reference** |
| B | 52,486 | 0.9762 [0.9699, 0.9812] | 1.8 vs 5.6 pp | 0.9875 | **PASS** |
| C | 19,831 | 0.9596 [0.9510, 0.9676] | 1.9 vs 5.7 pp | 0.9711 | **PASS** |

A0 = the export as it was point-in-time; A1 = same σ with widths refit (the control).

## HL p75 exceedance by regime (%, target 25)

| arm | quiet | normal | busy |
|---|---|---|---|
| B | 24.7 | 23.2 | 24.9 |
| A1 | 30.3 | 23.0 | 19.4 |
| C (IV rows) | 24.4 | 23.1 | 23.6 |
| A1 (IV rows) | 29.9 | 23.2 | 19.3 |

## HL p75 exceedance by weekday (%, target 25)

| arm | Mon | Tue | Wed | Thu | Fri |
|---|---|---|---|---|---|
| B | 26.2 | 22.1 | 23.0 | 23.9 | 25.3 |
| A1 | 20.7 | 23.5 | 25.1 | 27.4 | 24.1 |
| C (IV rows) | 25.1 | 20.8 | 21.6 | 24.8 | 25.9 |
| A1 (IV rows) | 20.6 | 22.3 | 23.9 | 28.3 | 25.5 |

## Pinball ratio vs A1 by class and fold

| arm | fx_crosses | fx_majors | gold | indices | fold 0 | fold 1 | fold 2 | fold 3 | fold 4 | fold 5 |
|---|---|---|---|---|---|---|---|---|---|---|
| A0 | 0.9973 | 0.9992 | 1.0019 | 1.0011 | 1.0037 | 0.9969 | 0.9962 | 1.0003 | 0.9962 | 0.9975 |
| B | 0.9746 | 0.9875 | 0.9866 | 0.9664 | 0.9725 | 0.9810 | 0.9787 | 0.9825 | 0.9640 | 0.9784 |
| C | nan | 0.9711 | 0.9708 | 0.9462 | 0.9454 | 0.9614 | 0.9694 | 0.9710 | 0.9550 | 0.9565 |

## β (last fold; per-unit, log σ multiplier)

- fx_crosses|B: regime -0.267, res1 +0.110, res5 +0.315, wd1 +0.090, wd2 +0.104, wd3 +0.113, wd4 +0.057
- fx_majors|C: regime +0.019, res1 +0.058, res5 +0.156, wd1 +0.070, wd2 +0.093, wd3 +0.122, wd4 +0.069, iv_sig +0.741
- fx_majors|B: regime -0.233, res1 +0.087, res5 +0.207, wd1 +0.108, wd2 +0.149, wd3 +0.144, wd4 +0.100
- gold|C: regime -0.036, res1 -0.032, res5 +0.141, wd1 +0.013, wd2 +0.024, wd3 +0.068, wd4 +0.059, iv_sig +0.701
- gold|B: regime -0.336, res1 +0.009, res5 +0.184, wd1 +0.036, wd2 +0.048, wd3 +0.085, wd4 +0.076
- indices|C: regime +0.104, res1 +0.095, res5 +0.215, wd1 +0.029, wd2 +0.023, wd3 +0.072, wd4 +0.005, iv_sig +0.690
- indices|B: regime -0.187, res1 +0.151, res5 +0.311, wd1 +0.042, wd2 +0.039, wd3 +0.080, wd4 +0.016
