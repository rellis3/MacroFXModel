# EURUSD Touch Book part 2 — entry timing

Rule: forge/ENTRY_TIMING_EURUSD_PREREG.md. Train 2016-03 → 2022-12, test 2023-01 → 2026-08. Fade = limit order beyond the line, target the line behind. Follow = limit order back from the line after a pullback, target the next line out. Net R after spread, in units of the stop.

## 1. All lines pooled

| variant | fill rate | trades train / test | win % train / test | net R train (t) | net R test (t) |
|---|---|---|---|---|---|
| fade beyond 0.0σ, stop 0.25σ | 96% | 6892 / 3396 | 31% / 33% | -0.171 (-10.3) | -0.124 (-5.1) |
| fade beyond 0.0σ, stop 0.50σ | 96% | 6892 / 3396 | 45% / 47% | -0.093 (-8.2) | -0.063 (-3.9) |
| fade beyond 0.1σ, stop 0.25σ | 81% | 5839 / 2825 | 31% / 31% | -0.116 (-6.0) | -0.097 (-3.5) |
| fade beyond 0.1σ, stop 0.50σ | 81% | 5839 / 2825 | 44% / 44% | -0.066 (-5.1) | -0.047 (-2.5) |
| fade beyond 0.2σ, stop 0.25σ | 68% | 4899 / 2345 | 31% / 30% | -0.101 (-4.6) | -0.099 (-3.1) |
| fade beyond 0.2σ, stop 0.50σ | 68% | 4899 / 2345 | 44% / 44% | -0.054 (-3.7) | -0.037 (-1.7) |
| fade beyond 0.3σ, stop 0.25σ | 57% | 4130 / 1983 | 30% / 32% | -0.119 (-4.8) | -0.057 (-1.6) |
| fade beyond 0.3σ, stop 0.50σ | 57% | 4130 / 1983 | 42% / 45% | -0.063 (-3.9) | -0.008 (-0.4) |
| follow back 0.0σ, stop 0.25σ | 96% | 6854 / 3375 | 32% / 33% | -0.168 (-10.6) | -0.162 (-7.2) |
| follow back 0.0σ, stop 0.50σ | 96% | 6854 / 3375 | 47% / 46% | -0.071 (-6.6) | -0.092 (-6.0) |
| follow back 0.1σ, stop 0.25σ | 82% | 5857 / 2869 | 34% / 33% | -0.049 (-2.6) | -0.067 (-2.5) |
| follow back 0.1σ, stop 0.50σ | 82% | 5857 / 2869 | 46% / 45% | -0.023 (-1.8) | -0.040 (-2.3) |
| follow back 0.2σ, stop 0.25σ | 67% | 4820 / 2328 | 33% / 31% | -0.047 (-2.1) | -0.125 (-4.1) |
| follow back 0.2σ, stop 0.50σ | 67% | 4820 / 2328 | 46% / 44% | -0.004 (-0.3) | -0.051 (-2.5) |
| follow back 0.3σ, stop 0.25σ | 55% | 3931 / 1924 | 32% / 31% | -0.059 (-2.4) | -0.083 (-2.4) |
| follow back 0.3σ, stop 0.50σ | 55% | 3931 / 1924 | 44% / 45% | -0.028 (-1.7) | -0.031 (-1.4) |

## 2. Pre-registered selection (per line × variant, 112 cells)

Cells selected on train (n ≥ 100, net R > 0, t ≥ 3.0): **0**.


**Verdict: FAIL** — 0 of 0 selected cells confirmed on test.

## 3. Best and worst cells on train, with test (for reading, not selection)

| line | variant | train net R (t, n) | test net R (t, n) |
|---|---|---|---|
| OHOL_p75 | follow back 0.2σ, stop 0.50σ | +0.064 (+1.6, 609) | -0.112 (-2.0, 302) |
| Close_p75 | follow back 0.2σ, stop 0.50σ | +0.054 (+1.4, 594) | -0.105 (-1.9, 286) |
| Close_p75 | follow back 0.2σ, stop 0.25σ | +0.080 (+1.3, 594) | -0.215 (-2.6, 286) |
| Proj_p50 | follow back 0.2σ, stop 0.50σ | +0.043 (+1.2, 671) | -0.028 (-0.6, 347) |
| OHOL_p75 | follow back 0.2σ, stop 0.25σ | +0.075 (+1.2, 609) | -0.235 (-2.8, 302) |
| Close_p75 | follow back 0.3σ, stop 0.50σ | +0.050 (+1.1, 476) | -0.107 (-1.7, 230) |
| OHOL_p90 | fade beyond 0.2σ, stop 0.50σ | +0.052 (+0.8, 249) | -0.172 (-1.8, 103) |
| Close_p75 | follow back 0.3σ, stop 0.25σ | +0.048 (+0.7, 476) | -0.356 (-4.0, 230) |
| Proj_p75 | fade beyond 0.1σ, stop 0.50σ | +0.029 (+0.7, 381) | -0.143 (-2.1, 168) |
| OHOL_p90 | fade beyond 0.3σ, stop 0.50σ | +0.040 (+0.6, 199) | -0.110 (-1.0, 86) |
| OHOL_p50 | fade beyond 0.0σ, stop 0.25σ | -0.155 (-4.4, 1719) | -0.182 (-3.7, 865) |
| OHOL_p90 | follow back 0.0σ, stop 0.25σ | -0.303 (-4.6, 355) | -0.064 (-0.6, 162) |
| Proj_p50 | fade beyond 0.0σ, stop 0.25σ | -0.216 (-4.9, 991) | -0.061 (-0.9, 475) |
| Close_p75 | follow back 0.0σ, stop 0.25σ | -0.218 (-4.9, 825) | -0.222 (-3.5, 403) |
| Proj_p50 | follow back 0.0σ, stop 0.25σ | -0.192 (-4.9, 983) | -0.343 (-6.5, 468) |

Cells positive in BOTH periods: 1 of 112.
