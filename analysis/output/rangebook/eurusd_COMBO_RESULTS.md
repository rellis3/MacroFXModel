# EURUSD combination test — results

Rule: forge/COMBO_EURUSD_PREREG.md. Walk-forward predictions, test years 2023–2026 (to 2026-08-20). 9971 passes; approach says go on 2483, big day on 5781, both on 1602. Follow trades, stop at the line behind, net of spread, R = stop distance.

| rule | condition | target | trades | win % | net R | t | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|---|---|---|---|---|---|
| A | all passes | next line | 9971 | 50% | -0.039 | -5.0 | -0.004 (2679) | -0.054 (2771) | -0.078 (2869) | -0.006 (1652) |
| B | approach says go | next line | 2483 | 52% | -0.060 | -3.5 | +0.016 (642) | -0.063 (756) | -0.170 (681) | +0.008 (404) |
| C | big day | forecast range | 5624 | 44% | -0.056 | -4.6 | +0.061 (1316) | -0.035 (1877) | -0.113 (1527) | -0.174 (904) |
| **D** | approach says go AND big day | forecast range | 1542 | 50% | -0.027 | -1.1 | +0.079 (359) | -0.011 (538) | -0.123 (397) | -0.064 (248) |
| E | approach says go AND big day | next line | 1602 | 54% | -0.013 | -0.6 | +0.100 (378) | -0.029 (566) | -0.163 (403) | +0.092 (255) |

Rule D geometry: median distance to the forecast target 0.75σ, median stop 0.61σ.

**Verdict (rule D): FAIL**
