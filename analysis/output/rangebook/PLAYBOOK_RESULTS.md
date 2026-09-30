# The exhaustion playbook on EURUSD

Rule: forge/EXHAUSTION_PLAYBOOK_EURUSD_PREREG.md. 31,024 passes of every line, 2016–2026. Net R after spread, R = each trade's own stop. Fade target = the line behind, stop = the next line out; follow is the mirror.

## 1. Each piece, then the playbook

| rule | trades | win % | 2016–22 net R (t) | 2023–26 net R (t) | full net R (t) |
|---|---|---|---|---|---|
| all passes — fade at the touch (baseline) | 31024 | 48% | -0.045 (-7.1) | -0.042 (-4.6) | -0.044 (-8.4) |
| all passes — follow at the touch (baseline) | 31024 | 50% | -0.033 (-6.1) | -0.039 (-5.0) | -0.035 (-7.9) |
| WT stretched — fade at the touch | 5887 | 50% | -0.011 (-0.8) | -0.022 (-1.1) | -0.015 (-1.2) |
| WT stretched — confirmed fade | 4976 | 53% | -0.026 (-1.9) | -0.011 (-0.6) | -0.021 (-1.9) |
| USD-aligned — fade at the touch | 15548 | 47% | -0.061 (-6.8) | -0.084 (-6.6) | -0.068 (-9.4) |
| USD-opposed — fade at the touch | 15476 | 49% | -0.029 (-3.2) | +0.001 (+0.1) | -0.019 (-2.6) |
| WT stretched AND USD-aligned — fade at the touch | 2626 | 50% | -0.027 (-1.2) | -0.019 (-0.6) | -0.024 (-1.4) |
| WT stretched AND USD-aligned — confirmed fade | 2198 | 54% | -0.017 (-0.8) | -0.004 (-0.1) | -0.013 (-0.8) |
| not stretched — follow at the touch | 25137 | 50% | -0.026 (-4.3) | -0.035 (-4.0) | -0.029 (-5.9) |
| expansion day, not stretched — follow at the touch | 8851 | 49% | -0.079 (-7.9) | -0.042 (-2.9) | -0.067 (-8.1) |
| **THE PLAYBOOK** | 11049 | 50% | -0.067 (-7.4) | -0.035 (-2.7) | -0.056 (-7.6) |

## 2. The playbook by line family

| line | trades | win % | 2016–22 | 2023–26 | full |
|---|---|---|---|---|---|
| OHOL_p50 | 2876 | 50% | -0.060 (-3.4) | -0.058 (-2.3) | -0.059 (-4.1) |
| OHOL_p75 | 1333 | 49% | -0.115 (-4.3) | -0.006 (-0.2) | -0.079 (-3.5) |
| OHOL_p90 | 505 | 51% | +0.014 (+0.4) | +0.058 (+1.0) | +0.028 (+0.9) |
| Close_p50 | 2854 | 50% | -0.058 (-3.3) | -0.053 (-2.1) | -0.057 (-3.9) |
| Close_p75 | 1270 | 51% | -0.073 (-2.7) | +0.005 (+0.1) | -0.048 (-2.1) |
| Proj_p50 | 1545 | 50% | -0.068 (-3.1) | -0.032 (-1.1) | -0.056 (-3.2) |
| Proj_p75 | 666 | 45% | -0.080 (-2.2) | -0.070 (-1.1) | -0.077 (-2.5) |

## Verdict (pre-registered): **FAIL** — playbook -0.056R (t -7.6, n 11049); 2016–22 -0.067, 2023–26 -0.035. About the 13th level test on these lines.
