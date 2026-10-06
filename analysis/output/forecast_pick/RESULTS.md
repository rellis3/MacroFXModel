# STEP A — pick ONE forecast (results)

Pre-registration: `forge/FORECAST_PICK_PREREG.md`. Walk-forward folds 0–5, out-of-sample 2020-08 → 2026-08; widths refit per fold for every candidate; pinball over 12 rungs ÷ plain σ; 95% date-block intervals. Eligible = beats plain (interval below 1), regime miss no worse, no class worse by > 0.5%.

## All 34 instruments (52,486 instrument-sessions, 1,558 dates)

| candidate | pinball ÷ plain [95%] | HL p75 quiet / normal / busy % | regime miss pp | worst class | eligible |
|---|---|---|---|---|---|
| plain export | 1.0000 [1.0000, 1.0000] | 29.8 / 22.6 / 18.2 | 6.8 | 1.0000 | — |
| HAR-800 | 0.9836 [0.9772, 0.9897] | 26.9 / 25.6 / 27.5 | 2.5 | 0.9977 | yes |
| persistence | 0.9799 [0.9738, 0.9848] | 23.9 / 22.6 / 23.8 | 2.4 | 0.9880 | yes |

**Pick: persistence**

## The 13 instruments with implied vol (19,831 instrument-sessions, 1,557 dates)

| candidate | pinball ÷ plain [95%] | HL p75 quiet / normal / busy % | regime miss pp | worst class | eligible |
|---|---|---|---|---|---|
| plain export | 1.0000 [1.0000, 1.0000] | 30.5 / 22.9 / 18.6 | 6.4 | 1.0000 | — |
| IV-adjusted | 0.9760 [0.9718, 0.9800] | 24.0 / 21.8 / 22.7 | 3.2 | 0.9792 | yes |
| HAR-800 | 0.9837 [0.9759, 0.9913] | 27.9 / 24.9 / 26.9 | 2.9 | 0.9966 | yes |
| persistence | 0.9800 [0.9736, 0.9858] | 24.5 / 22.1 / 22.9 | 2.9 | 0.9878 | yes |
| persistence + IV | 0.9682 [0.9605, 0.9751] | 23.8 / 21.6 / 22.7 | 3.4 | 0.9752 | yes |

**Pick: persistence + IV**

