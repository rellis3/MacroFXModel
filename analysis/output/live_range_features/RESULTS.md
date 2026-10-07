# LIVE-RANGE-FEATURES — results

Pre-registration: `forge/LIVE_RANGE_FEATURES_PREREG.md`. Test = last 40% of dates per class, 34 instruments, 1.8M instrument-hour rows. Checkpoints 02:00-21:00 (20): 01:00 has too few 5-minute bars for RSI(14); the registered ≥ 14 bar is kept unchanged.

## T1 — one feature added to the page's model (B + feature ÷ B; < 1 = the feature helps)

| class | feature | checkpoints that beat B (need 14) | median ratio 02-07 / 08-14 / 15-21 | verdict |
|---|---|---|---|---|
| fx_gold | vwap |dist| | 8/20 | 1.000 / 0.997 / 0.932 | no |
| fx_gold | roc 1h |.| | 0/20 | 1.000 / 1.000 / 0.998 | no |
| fx_gold | roc 3h |.| | 6/20 | 1.000 / 0.999 / 0.983 | no |
| fx_gold | accel |.| | 0/20 | 1.000 / 1.000 / 1.001 | no |
| fx_gold | WaveTrend |WT1| | 6/20 | 1.000 / 1.000 / 0.981 | no |
| fx_gold | WaveTrend |WT1-WT2| | 0/20 | 1.000 / 1.000 / 0.996 | no |
| fx_gold | RSI |.-50| | 0/20 | 1.000 / 1.000 / 0.998 | no |
| fx_gold | age of extreme | 8/20 | 1.000 / 0.997 / 0.942 | no |
| fx_gold | range position extremity | 9/20 | 1.000 / 0.995 / 0.891 | no |
| fx_gold | weekday | 2/20 | 0.994 / 0.991 / 0.995 | no |
| fx_gold | relative volume | 0/20 | 0.998 / 1.000 / 1.000 | no |
| fx_gold | IV÷σ | 14/20 | 0.968 / 0.970 / 1.002 | ADDS |
| indices | vwap |dist| | 6/20 | 1.003 / 1.002 / 0.954 | no |
| indices | roc 1h |.| | 1/20 | 1.003 / 1.002 / 1.000 | no |
| indices | roc 3h |.| | 6/20 | 1.003 / 1.004 / 0.988 | no |
| indices | accel |.| | 0/20 | 1.003 / 1.004 / 1.002 | no |
| indices | WaveTrend |WT1| | 3/20 | 1.004 / 1.004 / 0.990 | no |
| indices | WaveTrend |WT1-WT2| | 0/20 | 1.004 / 1.002 / 0.997 | no |
| indices | RSI |.-50| | 1/20 | 1.004 / 1.003 / 1.000 | no |
| indices | age of extreme | 7/20 | 1.004 / 1.004 / 0.962 | no |
| indices | range position extremity | 6/20 | 1.005 / 1.002 / 0.936 | no |
| indices | weekday | 1/20 | 1.004 / 1.002 / 0.995 | no |
| indices | relative volume | 0/20 | 0.998 / 0.994 / 1.003 | no |

Feature × class tests examined: 23; adding information: **1**.

## T2 — combined gradient-boosted quantile model on R (all features) vs B and vs the clock

| class | checkpoints that beat B (need 14) | median ÷B 02-07 / 08-14 / 15-21 | median ÷C 02-07 / 08-14 / 15-21 | verdict |
|---|---|---|---|---|
| fx_gold | 19/20 | 0.988 / 0.978 / 0.860 | 0.980 / 0.963 / 0.850 | ADDS |
| indices | 10/20 | 0.994 / 0.991 / 0.914 | 0.998 / 0.982 / 0.903 | no |

## T3 — is the running high / low already in? (exhaustion outcome). Brier skill of the model over the hour × used × pace base rate

| class | base Brier | model Brier | skill [95% date-block] | base rate of 'in' | verdict |
|---|---|---|---|---|---|
| fx_gold | 0.1842 | 0.1434 | +22.15% [+21.57%, +22.72%] | 56.5% | ADDS |

fx_gold skill by hour group: 02-07: +12.59%, 08-14: +24.05%, 15-21: +32.18%

| indices | 0.1834 | 0.1489 | +18.83% [+18.03%, +19.62%] | 44.7% | ADDS |

indices skill by hour group: 02-07: +4.84%, 08-14: +16.35%, 15-21: +32.88%
