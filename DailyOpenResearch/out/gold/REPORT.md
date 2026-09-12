# Daily-Open research: Gold (XAUUSD)

Data: 3,722,340 M1 bars, 2016-01-04 to 2026-08-20, 2744 anchored days. Anchor `broker` = 17:00 America/New_York. Median ADR20 = 20.85. Round-trip cost assumed = 0.3 (price units). Major-news days flagged: 1023 (USD).

All distances are in ADR units (trailing 20-day median daily range, strictly prior) unless stated. R = risk multiple net of cost. CI = Wilson 95%. 'p' = two-sided binomial test against 50%.

## 1. Which open? Anchor comparison

| anchor | days | first-60m share of day range (median) | day high/low set in first 60m | first-60m direction = day close |
|---|---|---|---|---|
| broker | 2723 | 0.123 | 19.8% [18.3-21.3] n=2723 | 52.8% [51.0-54.7] n=2723 |
| london23 | 2723 | 0.121 | 19.7% [18.2-21.2] n=2723 | 52.5% [50.6-54.3] n=2723 |
| utc22 | 2734 | 0.123 | 19.8% [18.3-21.3] n=2734 | 52.8% [50.9-54.7] n=2734 |
| london00 | 2734 | 0.127 | 18.2% [16.8-19.7] n=2734 | 54.0% [52.1-55.8] n=2734 |
| tokyo | 2734 | 0.153 | 22.9% [21.4-24.5] n=2734 | 55.9% [54.1-57.8] n=2734 |
| london08 | 2733 | 0.218 | 31.2% [29.5-33.0] n=2733 | 59.3% [57.5-61.1] n=2733 |

## 2. Where is the volatility? (anchor = broker open)

| window after open | share of day range (median) | day high or low inside window | uniform expectation |
|---|---|---|---|
| first 5m | 0.056 | 9.2% [8.2-10.3] n=2723 | 0.7% |
| first 15m | 0.075 | 12.5% [11.3-13.8] n=2723 | 2.2% |
| first 30m | 0.094 | 15.6% [14.3-17.0] n=2723 | 4.3% |
| first 60m | 0.123 | 19.8% [18.3-21.3] n=2723 | 8.5% |
| first 120m | 0.179 | 27.3% [25.7-29.0] n=2723 | 16.6% |
| first 240m | 0.333 | 48.1% [46.2-50.0] n=2723 | 31.8% |
| shuffled-returns null, first 60m | | 25.9% [24.2-27.5] n=2723 | |
| control: last 60m | 0.102 | 10.1% [9.0-11.3] n=2723 | |
| control: interior 60m at 6h | 0.116 | 2.7% [2.2-3.4] n=2723 | |

Mean 1-minute true range in ADR units, by 15-minute block after the open (first 8h):

| 0h00 | 0h15 | 0h30 | 0h45 | 1h00 | 1h15 | 1h30 | 1h45 | 2h00 | 2h15 | 2h30 | 2h45 | 3h00 | 3h15 | 3h30 | 3h45 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 24.7 | 17.8 | 16.5 | 16.4 | 17.9 | 16.6 | 16.9 | 19.6 | 25.7 | 22.3 | 21.4 | 22.8 | 28.2 | 23.9 | 24.1 | 22.0 |
| 4h00 | 4h15 | 4h30 | 4h45 | 5h00 | 5h15 | 5h30 | 5h45 | 6h00 | 6h15 | 6h30 | 6h45 | 7h00 | 7h15 | 7h30 | 7h45 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 20.8 | 18.4 | 18.8 | 17.6 | 17.4 | 16.2 | 14.9 | 14.5 | 14.8 | 14.9 | 16.8 | 16.4 | 18.0 | 18.4 | 21.7 | 21.3 |

(values x1000; e.g. 20 = a 1-minute bar moves 2% of a day's range on average)

Median 60-minute range by UK clock hour (price units):

| 00 | 01 | 02 | 03 | 04 | 05 | 06 | 07 | 08 | 09 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2.385 | 3.295 | 3.669 | 2.761 | 2.265 | 2.396 | 3.154 | 3.889 | 4.301 | 3.759 | 3.33 | 3.338 | 3.955 | 6.955 | 7.324 | 6.806 | 4.915 | 3.845 | 3.707 | 3.134 | 2.956 | 2.047 | 2.369 | 2.275 |

## 3. The open as a level

| first N minutes direction | agrees with day close (overlapping) | agrees with REST of day (overlap-free) |
|---|---|---|
| first_15m | 52.2% [50.3-54.1] n=2713 p=0.0235 | 48.8% [46.9-50.6] n=2713 p=0.205 |
| first_30m | 52.1% [50.2-54.0] n=2715 p=0.0287 | 48.3% [46.4-50.1] n=2714 p=0.0742 |
| first_60m | 52.9% [51.0-54.8] n=2721 p=0.00278 | 48.4% [46.5-50.3] n=2720 p=0.103 |
| first_120m | 55.6% [53.7-57.5] n=2723 p=5.49e-09 | 49.6% [47.7-51.4] n=2722 p=0.659 |

- Open crosses per day: med 20.0 (p25 10.0, p75 34.0, mean 23.6, n=2723)
- Share of bars above the open: med 0.542 (p25 0.239, p75 0.853, mean 0.532, n=2723)
- Close minus open (ADR): med 0.056 (p25 -0.364, p75 0.452, mean 0.039, n=2723)

Once price has moved X ADR away from the open, does it come back?

| distance | never returns to open that day | minutes until return (when it does) |
|---|---|---|
| 0.1_ADR | 12.3% [11.1-13.6] n=2723 | med 84.0 (p25 32.0, p75 260.0, mean 198.0, n=2388) |
| 0.2_ADR | 26.3% [24.7-28.0] n=2721 | med 244.0 (p25 87.0, p75 460.0, mean 307.0, n=2006) |
| 0.3_ADR | 41.3% [39.4-43.2] n=2658 | med 283.0 (p25 115.0, p75 472.0, mean 325.0, n=1561) |
| 0.5_ADR | 66.3% [64.2-68.3] n=2138 | med 281.0 (p25 119.0, p75 436.0, mean 317.0, n=721) |

Judas swing (early extreme then trend):

- P(day low in first 60m | up close): 19.9% [17.9-22.0] n=1452
- P(day high in first 60m | down close): 18.3% [16.2-20.5] n=1271
- shuffled_null_P(low in first 60m | up close): 23.9% [21.8-26.2] n=1446
- shuffled_null_P(high in first 60m | down close): 22.6% [20.4-25.0] n=1276

Where the day's HIGH forms (% of days, 30-min buckets after open, first 24 shown):

| bucket | 0h00 | 0h30 | 1h00 | 1h30 | 2h00 | 2h30 | 3h00 | 3h30 | 4h00 | 4h30 | 5h00 | 5h30 | 6h00 | 6h30 | 7h00 | 7h30 | 8h00 | 8h30 | 9h00 | 9h30 | 10h00 | 10h30 | 11h00 | 11h30 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| high | 6.9 | 2.0 | 1.7 | 1.9 | 3.1 | 2.0 | 3.0 | 2.3 | 1.6 | 0.7 | 0.6 | 0.5 | 0.5 | 0.6 | 0.9 | 1.1 | 1.5 | 1.8 | 2.1 | 1.7 | 1.4 | 0.9 | 1.2 | 1.1 |
| low | 8.8 | 2.2 | 1.9 | 2.0 | 3.4 | 2.5 | 3.4 | 1.7 | 1.6 | 1.5 | 1.1 | 0.6 | 0.9 | 0.8 | 0.8 | 1.0 | 1.5 | 1.5 | 2.8 | 1.5 | 1.2 | 1.1 | 1.1 | 0.8 |

Trend-day checkpoints: at 07:00 / 13:00 UK, given travel from the open and whether price sits at the day's extreme:

| checkpoint | travel | position | n | closes further in direction | closes back through open | further MFE (ADR, median) |
|---|---|---|---|---|---|---|
| 0700UK | 0.15-0.30 | at extreme | 281 | 52.7% [46.8-58.4] n=281 | 27.0% [22.2-32.5] n=281 | 0.014 |
| 0700UK | 0.15-0.30 | off extreme | 545 | 50.3% [46.1-54.5] n=545 | 32.1% [28.3-36.1] n=545 | 0.055 |
| 0700UK | 0.30-0.50 | at extreme | 237 | 48.1% [41.8-54.4] n=237 | 24.9% [19.8-30.8] n=237 | -0.007 |
| 0700UK | 0.30-0.50 | off extreme | 243 | 53.5% [47.2-59.7] n=243 | 27.2% [22.0-33.1] n=243 | 0.019 |
| 0700UK | <0.15 ADR | at extreme | 156 | 51.3% [43.5-59.0] n=156 | 40.4% [33.0-48.2] n=156 | -0.063 |
| 0700UK | <0.15 ADR | off extreme | 988 | 47.2% [44.1-50.3] n=988 | 46.3% [43.2-49.4] n=988 | -0.01 |
| 0700UK | >0.50 ADR | at extreme | 161 | 53.4% [45.7-61.0] n=161 | 9.3% [5.7-14.8] n=161 | 0.192 |
| 0700UK | >0.50 ADR | off extreme | 112 | 52.7% [43.5-61.7] n=112 | 14.3% [9.0-22.0] n=112 | 0.103 |
| 1300UK | 0.15-0.30 | at extreme | 131 | 53.4% [44.9-61.8] n=131 | 32.1% [24.7-40.5] n=131 | 0.147 |
| 1300UK | 0.15-0.30 | off extreme | 559 | 51.3% [47.2-55.5] n=559 | 28.8% [25.2-32.7] n=559 | 0.074 |
| 1300UK | 0.30-0.50 | at extreme | 190 | 50.5% [43.5-57.6] n=190 | 16.3% [11.7-22.2] n=190 | 0.16 |
| 1300UK | 0.30-0.50 | off extreme | 401 | 49.4% [44.5-54.3] n=401 | 20.2% [16.6-24.4] n=401 | 0.026 |
| 1300UK | <0.15 ADR | at extreme | 65 | 58.5% [46.3-69.6] n=65 | 40.0% [29.0-52.1] n=65 | 0.052 |
| 1300UK | <0.15 ADR | off extreme | 769 | 51.0% [47.4-54.5] n=769 | 43.2% [39.7-46.7] n=769 | 0.004 |
| 1300UK | >0.50 ADR | at extreme | 358 | 52.5% [47.3-57.6] n=358 | 5.9% [3.9-8.8] n=358 | 0.025 |
| 1300UK | >0.50 ADR | off extreme | 250 | 52.8% [46.6-58.9] n=250 | 10.0% [6.9-14.3] n=250 | 0.07 |

Gap at the open: |gap| med 0.026 (p25 0.011, p75 0.051, mean 0.05, n=2650); fill rate 95.1% [94.2-95.9] n=2650; minutes to fill med 4.0 (p25 0.0, p75 54.0, mean 79.0, n=2520)

| gap size | fill rate | filled within 60m |
|---|---|---|
| <0.05 ADR | 98.0% [97.3-98.5] n=1969 | 81.6% [79.8-83.2] n=1969 |
| 0.05-0.15 | 92.9% [90.4-94.7] n=547 | 56.5% [52.3-60.6] n=547 |
| 0.15-0.30 | 74.0% [62.9-82.7] n=73 | 24.7% [16.2-35.6] n=73 |
| >0.30 ADR | 45.9% [34.0-58.3] n=61 | 4.9% [1.7-13.5] n=61 |

| weekday | median gap (ADR) | fill rate |
|---|---|---|
| Mon | 0.061 | 86.0% [82.8-88.7] n=528 |
| Tue | 0.02 | 97.0% [95.2-98.2] n=536 |
| Wed | 0.022 | 97.9% [96.3-98.8] n=534 |
| Thu | 0.023 | 97.2% [95.4-98.3] n=535 |
| Fri | 0.024 | 97.3% [95.5-98.4] n=517 |

## 4. Opening-range breakout

| OR window | OR size (ADR, med) | breakout rate | min to break (med) | day closes on breakout side | both sides taken | race +1 OR vs opposite edge | MFE (OR units, med) |
|---|---|---|---|---|---|---|---|
| or_5m | 0.056 | 99.9% | 4.0 | 48.9% [47.0-50.7] n=2716 | 88.4% [87.2-89.6] n=2716 | 57.3% [55.4-59.1] n=2711 p=3.45e-14 (RW null 58.0%) | 6.938 |
| or_15m | 0.076 | 99.9% | 10.0 | 48.7% [46.8-50.6] n=2715 | 85.2% [83.8-86.4] n=2715 | 53.8% [51.9-55.6] n=2699 p=0.0001 (RW null 55.1%) | 5.027 |
| or_30m | 0.095 | 99.9% | 16.0 | 49.7% [47.9-51.6] n=2706 | 81.9% [80.4-83.3] n=2706 | 52.5% [50.6-54.4] n=2680 p=0.0091 (RW null 54.2%) | 4.011 |
| or_60m | 0.121 | 99.9% | 23.0 | 49.1% [47.2-50.9] n=2707 | 77.7% [76.1-79.3] n=2707 | 54.4% [52.6-56.3] n=2665 p=4.78e-06 (RW null 53.9%) | 3.12 |

Trade sims (entry = first close outside OR, stop = opposite OR edge, exit at day end):

| OR window | sim | all | IS (first 60%) | OOS (last 40%) |
|---|---|---|---|---|
| or_5m | target_1.0R_stop_opposite | n=2716 win 47.8% avg -0.317R, gross -0.026R (t -1.37, cost 0.29R) PF 0.52 t=-16.12 maxDD -865.63R | n=1624 win 46.4% avg -0.353R PF 0.49 t=-13.96 maxDD -573.95R | n=1092 win 50.0% avg -0.264R PF 0.58 t=-8.45 maxDD -291.23R |
| or_5m | target_2.0R_stop_opposite | n=2716 win 32.1% avg -0.329R, gross -0.038R (t -1.41, cost 0.29R) PF 0.62 t=-12.12 maxDD -904.65R | n=1624 win 31.4% avg -0.353R PF 0.6 t=-10.13 maxDD -575.21R | n=1092 win 33.2% avg -0.292R PF 0.66 t=-6.77 maxDD -328.09R |
| or_15m | target_1.0R_stop_opposite | n=2715 win 47.9% avg -0.247R, gross -0.035R (t -1.84, cost 0.21R) PF 0.61 t=-12.75 maxDD -674.65R | n=1623 win 46.6% avg -0.292R PF 0.55 t=-11.66 maxDD -474.8R | n=1092 win 49.9% avg -0.180R PF 0.69 t=-5.91 maxDD -199.46R |
| or_15m | target_2.0R_stop_opposite | n=2715 win 32.4% avg -0.242R, gross -0.030R (t -1.14, cost 0.21R) PF 0.7 t=-9.01 maxDD -657.89R | n=1623 win 31.5% avg -0.285R PF 0.66 t=-8.21 maxDD -462.46R | n=1092 win 33.6% avg -0.179R PF 0.77 t=-4.21 maxDD -196.42R |
| or_30m | target_1.0R_stop_opposite | n=2706 win 48.6% avg -0.195R, gross -0.023R (t -1.2, cost 0.17R) PF 0.67 t=-10.11 maxDD -535.53R | n=1614 win 46.7% avg -0.252R PF 0.6 t=-10.12 maxDD -408.75R | n=1092 win 51.5% avg -0.110R PF 0.8 t=-3.63 maxDD -129.23R |
| or_30m | target_2.0R_stop_opposite | n=2706 win 34.4% avg -0.149R, gross +0.023R (t 0.84, cost 0.17R) PF 0.8 t=-5.5 maxDD -444.29R | n=1614 win 32.8% avg -0.212R PF 0.73 t=-6.12 maxDD -342.06R | n=1092 win 36.6% avg -0.056R PF 0.92 t=-1.29 maxDD -123.06R |
| or_60m | target_1.0R_stop_opposite | n=2707 win 50.0% avg -0.127R, gross +0.005R (t 0.25, cost 0.13R) PF 0.77 t=-6.61 maxDD -376.49R | n=1615 win 48.9% avg -0.166R PF 0.71 t=-6.69 maxDD -272.74R | n=1092 win 51.6% avg -0.069R PF 0.87 t=-2.28 maxDD -106.32R |
| or_60m | target_2.0R_stop_opposite | n=2707 win 34.2% avg -0.126R, gross +0.006R (t 0.21, cost 0.13R) PF 0.83 t=-4.7 maxDD -434.9R | n=1615 win 32.4% avg -0.195R PF 0.74 t=-5.72 maxDD -320.95R | n=1092 win 36.9% avg -0.024R PF 0.97 t=-0.55 maxDD -115.52R |

ORB conditioning - by or size (30m OR):

| group | n | closes on side | both sides taken | sim 1R |
|---|---|---|---|---|
| 0.10-0.20 | 875 | 50.7% [47.4-54.0] n=875 | 78.5% [75.7-81.1] n=875 | n=875 win 46.1% avg -0.202R PF 0.67 t=-6.0 maxDD -179.4R |
| 0.20-0.35 | 249 | 49.4% [43.2-55.6] n=249 | 63.5% [57.3-69.2] n=249 | n=249 win 58.2% avg +0.109R PF 1.25 t=1.75 maxDD -6.14R |
| <0.10 ADR | 1458 | 49.0% [46.5-51.6] n=1458 | 90.3% [88.7-91.7] n=1458 | n=1458 win 48.7% avg -0.258R PF 0.59 t=-9.82 maxDD -380.58R |
| >0.35 ADR | 124 | 51.6% [42.9-60.2] n=124 | 42.7% [34.4-51.5] n=124 | n=124 win 46.8% avg -0.005R PF 0.99 t=-0.06 maxDD -13.2R |

ORB conditioning - by break timing (30m OR):

| group | n | closes on side | both sides taken | sim 1R |
|---|---|---|---|---|
| break<=30min | 1812 | 49.5% [47.2-51.8] n=1812 | 85.5% [83.8-87.0] n=1812 | n=1812 win 47.7% avg -0.237R PF 0.62 t=-10.09 maxDD -430.22R |
| break>30min | 894 | 50.2% [47.0-53.5] n=894 | 74.5% [71.5-77.2] n=894 | n=894 win 50.6% avg -0.108R PF 0.8 t=-3.24 maxDD -122.48R |

ORB conditioning - by weekday (30m OR):

| group | n | closes on side | both sides taken | sim 1R |
|---|---|---|---|---|
| Fri | 536 | 50.6% [46.3-54.8] n=536 | 84.1% [80.8-87.0] n=536 | n=536 win 49.8% avg -0.194R PF 0.67 t=-4.51 maxDD -106.91R |
| Mon | 529 | 48.2% [44.0-52.5] n=529 | 69.6% [65.5-73.3] n=529 | n=529 win 49.7% avg -0.089R PF 0.83 t=-2.08 maxDD -69.79R |
| Thu | 550 | 49.6% [45.5-53.8] n=550 | 83.6% [80.3-86.5] n=550 | n=550 win 47.8% avg -0.215R PF 0.65 t=-5.0 maxDD -122.23R |
| Tue | 547 | 53.0% [48.8-57.2] n=547 | 84.6% [81.4-87.4] n=547 | n=547 win 47.2% avg -0.256R PF 0.6 t=-5.92 maxDD -143.97R |
| Wed | 544 | 47.2% [43.1-51.4] n=544 | 86.9% [83.9-89.5] n=544 | n=544 win 48.7% avg -0.216R PF 0.64 t=-5.02 maxDD -126.01R |

ORB conditioning - by vol regime (30m OR):

| group | n | closes on side | both sides taken | sim 1R |
|---|---|---|---|---|
| heavy | 386 | 51.0% [46.1-56.0] n=386 | 76.7% [72.2-80.6] n=386 | n=386 win 50.5% avg -0.072R PF 0.86 t=-1.42 maxDD -43.26R |
| normal | 1848 | 49.8% [47.6-52.1] n=1848 | 83.1% [81.3-84.8] n=1848 | n=1848 win 47.9% avg -0.218R PF 0.64 t=-9.4 maxDD -405.33R |
| quiet | 442 | 48.4% [43.8-53.1] n=442 | 82.1% [78.3-85.4] n=442 | n=442 win 50.0% avg -0.200R PF 0.67 t=-4.18 maxDD -95.35R |
| unknown | 30 | 46.7% [30.2-63.9] n=30 | 66.7% [48.8-80.8] n=30 | n=30 win 46.7% avg -0.226R PF 0.64 t=-1.17 maxDD -9.81R |

ORB conditioning - by news day (30m OR):

| group | n | closes on side | both sides taken | sim 1R |
|---|---|---|---|---|
| major news day | 1016 | 49.1% [46.0-52.2] n=1016 | 84.4% [82.1-86.5] n=1016 | n=1016 win 49.8% avg -0.179R PF 0.69 t=-5.71 maxDD -196.93R |
| no major news | 1655 | 50.2% [47.7-52.6] n=1655 | 80.1% [78.1-82.0] n=1655 | n=1655 win 48.1% avg -0.203R PF 0.66 t=-8.24 maxDD -345.89R |
| unknown | 35 | 48.6% [33.0-64.4] n=35 | 88.6% [74.0-95.5] n=35 | n=35 win 40.0% avg -0.246R PF 0.61 t=-1.47 maxDD -9.03R |

ORB conditioning - by year (30m OR):

| group | n | closes on side | both sides taken | sim 1R |
|---|---|---|---|---|
| 2016 | 247 | 51.4% [45.2-57.6] n=247 | 81.0% [75.6-85.4] n=247 | n=247 win 45.7% avg -0.242R PF 0.62 t=-3.79 maxDD -66.36R |
| 2017 | 256 | 48.0% [42.0-54.2] n=256 | 76.6% [71.0-81.3] n=256 | n=256 win 49.6% avg -0.187R PF 0.68 t=-2.99 maxDD -51.8R |
| 2018 | 257 | 49.4% [43.4-55.5] n=257 | 80.9% [75.7-85.3] n=257 | n=257 win 45.9% avg -0.300R PF 0.55 t=-4.78 maxDD -81.56R |
| 2019 | 246 | 50.0% [43.8-56.2] n=246 | 82.9% [77.7-87.1] n=246 | n=246 win 50.0% avg -0.265R PF 0.58 t=-4.13 maxDD -65.49R |
| 2020 | 255 | 48.2% [42.2-54.3] n=255 | 77.3% [71.7-82.0] n=255 | n=255 win 44.7% avg -0.191R PF 0.68 t=-3.08 maxDD -58.88R |
| 2021 | 257 | 44.4% [38.4-50.5] n=257 | 89.1% [84.7-92.4] n=257 | n=257 win 45.9% avg -0.298R PF 0.54 t=-4.77 maxDD -79.27R |
| 2022 | 256 | 49.2% [43.2-55.3] n=256 | 85.2% [80.3-89.0] n=256 | n=256 win 51.6% avg -0.162R PF 0.72 t=-2.58 maxDD -50.12R |
| 2023 | 256 | 52.3% [46.2-58.4] n=256 | 86.7% [82.0-90.3] n=256 | n=256 win 55.5% avg -0.114R PF 0.79 t=-1.84 maxDD -35.72R |
| 2024 | 258 | 54.7% [48.6-60.6] n=258 | 86.0% [81.3-89.7] n=258 | n=258 win 45.7% avg -0.245R PF 0.61 t=-3.98 maxDD -63.76R |
| 2025 | 256 | 50.0% [43.9-56.1] n=256 | 77.3% [71.8-82.0] n=256 | n=256 win 50.8% avg -0.049R PF 0.91 t=-0.78 maxDD -24.3R |
| 2026 | 162 | 49.4% [41.8-57.0] n=162 | 74.7% [67.5-80.8] n=162 | n=162 win 50.0% avg -0.031R PF 0.94 t=-0.39 maxDD -17.28R |

## 5. Impulse leg then fib pullback

Legs >= 0.12 ADR whose fib became drawable (23.6% pullback) within 240 min of the open. Depth = fraction of the leg given back (TradingView low->high fib shows 1 - depth).

**all legs**: n=25670, leg med 0.169 ADR (p25 0.14, p75 0.218, mean 0.191, n=25670), duration med 21.0 min (p25 7.0, p75 50.0, mean 36.0, n=25670). Continuation 69.2%, failed 30.7%.

| pullback reached | P(continuation to new extreme) | random-walk null (1-d) | RW null at actual bar close |
|---|---|---|---|
| 0.236 | 69.2% [68.6-69.7] n=25670 | 76.4% | 67.4% |
| 0.382 | 56.3% [55.6-57.1] n=18120 | 61.8% | 53.9% |
| 0.5 | 45.6% [44.8-46.4] n=14535 | 50.0% | 42.8% |
| 0.618 | 35.3% [34.4-36.1] n=12223 | 38.2% | 31.9% |
| 0.786 | 19.9% [19.1-20.7] n=9873 | 21.4% | 16.6% |

Deepest pullback that HELD (continuations only): 0.236-0.382: 42.5%, 0.382-0.5: 20.2%, 0.5-0.618: 13.0%, 0.618-0.786: 13.2%, 0.786-1.0: 11.1%

Extension reached after continuation: >= 1.1: 82.5%, >= 1.2: 71.3%, >= 1.272: 64.9%, >= 1.5: 50.7%, >= 1.618: 45.8%, >= 2.0: 34.5%

Trade sims (limit at depth, stop tight = +0.236 depth / at origin / origin+10%, targets old extreme / 1.272 / 1.618):

| sim | result |
|---|---|
| entry_0.382|stop_origin+10%|target_1.618 | n=18120 win 39.7% avg -0.176R, gross -0.051R (t -5.92, cost 0.12R) PF 0.74 t=-20.26 maxDD -3204.22R |
| entry_0.5|stop_origin+10%|target_1.618 | n=14535 win 33.7% avg -0.184R, gross -0.035R (t -3.15, cost 0.15R) PF 0.76 t=-16.35 maxDD -2682.39R |
| entry_0.382|stop_origin+10%|target_1.272 | n=18120 win 49.1% avg -0.187R, gross -0.062R (t -8.78, cost 0.12R) PF 0.67 t=-26.32 maxDD -3395.75R |
| entry_0.382|stop_origin|target_1.618 | n=18120 win 36.6% avg -0.187R, gross -0.042R (t -4.47, cost 0.14R) PF 0.74 t=-19.92 maxDD -3400.03R |
| entry_0.618|stop_origin+10%|target_1.618 | n=12223 win 27.9% avg -0.193R, gross -0.008R (t -0.57, cost 0.18R) PF 0.77 t=-13.32 maxDD -2367.13R |
| entry_0.5|stop_origin+10%|target_1.272 | n=14535 win 41.7% avg -0.195R, gross -0.046R (t -4.94, cost 0.15R) PF 0.71 t=-20.75 maxDD -2832.84R |
| entry_0.5|stop_origin|target_1.618 | n=14535 win 30.3% avg -0.197R, gross -0.019R (t -1.53, cost 0.18R) PF 0.76 t=-15.93 maxDD -2893.62R |
| entry_0.382|stop_origin+10%|target_extreme | n=18120 win 60.4% avg -0.199R, gross -0.074R (t -13.34, cost 0.12R) PF 0.55 t=-35.65 maxDD -3609.52R |
| entry_0.382|stop_origin|target_1.272 | n=18120 win 45.8% avg -0.202R, gross -0.057R (t -7.43, cost 0.14R) PF 0.67 t=-26.38 maxDD -3659.47R |
| entry_0.618|stop_origin|target_1.618 | n=12223 win 24.3% avg -0.207R, gross +0.026R (t 1.6, cost 0.23R) PF 0.78 t=-12.55 maxDD -2544.34R |
| entry_0.5|stop_origin|target_1.272 | n=14535 win 38.0% avg -0.212R, gross -0.033R (t -3.26, cost 0.18R) PF 0.71 t=-20.57 maxDD -3091.93R |
| entry_0.618|stop_origin+10%|target_1.272 | n=12223 win 34.2% avg -0.212R, gross -0.027R (t -2.21, cost 0.18R) PF 0.73 t=-17.28 maxDD -2591.63R |
| entry_0.382|stop_origin|target_extreme | n=18120 win 57.3% avg -0.218R, gross -0.073R (t -12.27, cost 0.14R) PF 0.55 t=-36.5 maxDD -3953.13R |
| entry_0.5|stop_origin+10%|target_extreme | n=14535 win 50.7% avg -0.219R, gross -0.071R (t -9.29, cost 0.15R) PF 0.61 t=-28.7 maxDD -3186.17R |
| entry_0.618|stop_origin|target_1.272 | n=12223 win 30.1% avg -0.232R, gross +0.001R (t 0.07, cost 0.23R) PF 0.73 t=-16.72 maxDD -2843.61R |
| entry_0.618|stop_origin+10%|target_extreme | n=12223 win 41.5% avg -0.239R, gross -0.054R (t -5.32, cost 0.18R) PF 0.66 t=-23.38 maxDD -2921.94R |
| entry_0.5|stop_origin|target_extreme | n=14535 win 46.8% avg -0.242R, gross -0.064R (t -7.76, cost 0.18R) PF 0.61 t=-29.13 maxDD -3525.01R |
| entry_0.786|stop_origin+10%|target_1.618 | n=9873 win 18.8% avg -0.259R, gross +0.024R (t 1.13, cost 0.28R) PF 0.75 t=-12.01 maxDD -2559.73R |
| entry_0.618|stop_origin|target_extreme | n=12223 win 36.9% avg -0.268R, gross -0.035R (t -3.08, cost 0.23R) PF 0.66 t=-23.35 maxDD -3283.18R |
| entry_0.786|stop_origin+10%|target_1.272 | n=9873 win 23.0% avg -0.279R, gross +0.004R (t 0.21, cost 0.28R) PF 0.72 t=-15.03 maxDD -2757.28R |
| entry_0.786|stop_tight|target_1.618 | n=9873 win 15.7% avg -0.290R, gross +0.086R (t 3.4, cost 0.38R) PF 0.75 t=-11.37 maxDD -2883.35R |
| entry_0.786|stop_origin|target_1.618 | n=9873 win 14.7% avg -0.305R, gross +0.110R (t 4.08, cost 0.41R) PF 0.75 t=-11.28 maxDD -3035.6R |
| entry_0.618|stop_tight|target_1.618 | n=12223 win 17.2% avg -0.306R, gross +0.071R (t 3.32, cost 0.38R) PF 0.73 t=-14.32 maxDD -3765.71R |
| entry_0.786|stop_origin+10%|target_extreme | n=9873 win 27.8% avg -0.310R, gross -0.027R (t -1.72, cost 0.28R) PF 0.67 t=-19.53 maxDD -3060.46R |
| entry_0.786|stop_tight|target_1.272 | n=9873 win 19.3% avg -0.318R, gross +0.058R (t 2.68, cost 0.38R) PF 0.71 t=-14.53 maxDD -3145.91R |
| entry_0.618|stop_tight|target_1.272 | n=12223 win 22.0% avg -0.329R, gross +0.048R (t 2.69, cost 0.38R) PF 0.69 t=-18.26 maxDD -4035.38R |
| entry_0.786|stop_origin|target_1.272 | n=9873 win 18.2% avg -0.337R, gross +0.078R (t 3.4, cost 0.41R) PF 0.71 t=-14.52 maxDD -3332.04R |
| entry_0.786|stop_tight|target_extreme | n=9873 win 23.5% avg -0.359R, gross +0.017R (t 0.93, cost 0.38R) PF 0.66 t=-19.3 maxDD -3548.43R |
| entry_0.618|stop_tight|target_extreme | n=12223 win 27.9% avg -0.367R, gross +0.010R (t 0.71, cost 0.38R) PF 0.63 t=-24.71 maxDD -4490.91R |
| entry_0.786|stop_origin|target_extreme | n=9873 win 22.1% avg -0.382R, gross +0.033R (t 1.7, cost 0.41R) PF 0.65 t=-19.41 maxDD -3772.78R |
| entry_0.5|stop_tight|target_1.618 | n=14535 win 17.2% avg -0.390R, gross -0.012R (t -0.69, cost 0.38R) PF 0.66 t=-21.54 maxDD -5696.69R |
| entry_0.5|stop_tight|target_1.272 | n=14535 win 23.0% avg -0.397R, gross -0.019R (t -1.3, cost 0.38R) PF 0.63 t=-26.37 maxDD -5819.44R |
| entry_0.5|stop_tight|target_extreme | n=14535 win 30.5% avg -0.426R, gross -0.049R (t -4.12, cost 0.38R) PF 0.55 t=-35.34 maxDD -6203.8R |
| entry_0.382|stop_tight|target_1.618 | n=18120 win 17.8% avg -0.448R, gross -0.068R (t -4.57, cost 0.38R) PF 0.61 t=-29.88 maxDD -8127.55R |
| entry_0.382|stop_tight|target_1.272 | n=18120 win 24.5% avg -0.457R, gross -0.077R (t -6.41, cost 0.38R) PF 0.56 t=-37.55 maxDD -8297.47R |
| entry_0.382|stop_tight|target_extreme | n=18120 win 35.0% avg -0.463R, gross -0.083R (t -8.96, cost 0.38R) PF 0.48 t=-49.09 maxDD -8393.69R |

**impulsive legs**: n=10754, leg med 0.168 ADR (p25 0.14, p75 0.217, mean 0.191, n=10754), duration med 7.0 min (p25 3.0, p75 13.0, mean 9.0, n=10754). Continuation 68.2%, failed 31.8%.

| pullback reached | P(continuation to new extreme) | random-walk null (1-d) | RW null at actual bar close |
|---|---|---|---|
| 0.236 | 68.2% [67.3-69.0] n=10754 | 76.4% | 66.0% |
| 0.382 | 57.4% [56.3-58.5] n=8041 | 61.8% | 53.7% |
| 0.5 | 47.4% [46.2-48.6] n=6506 | 50.0% | 42.8% |
| 0.618 | 37.0% [35.7-38.3] n=5434 | 38.2% | 31.9% |
| 0.786 | 21.0% [19.8-22.2] n=4332 | 21.4% | 16.4% |

Deepest pullback that HELD (continuations only): 0.236-0.382: 37.0%, 0.382-0.5: 20.9%, 0.5-0.618: 14.6%, 0.618-0.786: 15.0%, 0.786-1.0: 12.4%

Extension reached after continuation: >= 1.1: 81.6%, >= 1.2: 70.4%, >= 1.272: 64.0%, >= 1.5: 50.0%, >= 1.618: 45.3%, >= 2.0: 34.5%

**grind legs**: n=14916, leg med 0.17 ADR (p25 0.141, p75 0.219, mean 0.192, n=14916), duration med 43.0 min (p25 25.0, p75 75.0, mean 55.0, n=14916). Continuation 69.9%, failed 29.9%.

| pullback reached | P(continuation to new extreme) | random-walk null (1-d) | RW null at actual bar close |
|---|---|---|---|
| 0.236 | 69.9% [69.2-70.6] n=14916 | 76.4% | 68.4% |
| 0.382 | 55.5% [54.5-56.4] n=10079 | 61.8% | 54.0% |
| 0.5 | 44.1% [43.0-45.2] n=8029 | 50.0% | 42.7% |
| 0.618 | 33.9% [32.8-35.0] n=6789 | 38.2% | 31.9% |
| 0.786 | 19.1% [18.1-20.1] n=5541 | 21.4% | 16.8% |

Deepest pullback that HELD (continuations only): 0.236-0.382: 46.4%, 0.382-0.5: 19.7%, 0.5-0.618: 11.9%, 0.618-0.786: 11.9%, 0.786-1.0: 10.1%

Extension reached after continuation: >= 1.1: 83.2%, >= 1.2: 72.0%, >= 1.272: 65.6%, >= 1.5: 51.2%, >= 1.618: 46.1%, >= 2.0: 34.5%

**first leg of day only**: n=2696, leg med 0.142 ADR (p25 0.129, p75 0.17, mean 0.16, n=2696), duration med 36.0 min (p25 11.0, p75 71.0, mean 47.0, n=2696). Continuation 70.5%, failed 29.5%.

| pullback reached | P(continuation to new extreme) | random-walk null (1-d) | RW null at actual bar close |
|---|---|---|---|
| 0.236 | 70.5% [68.7-72.2] n=2696 | 76.4% | 68.7% |
| 0.382 | 56.8% [54.5-59.0] n=1842 | 61.8% | 55.1% |
| 0.5 | 46.1% [43.5-48.6] n=1476 | 50.0% | 43.9% |
| 0.618 | 35.8% [33.2-38.5] n=1240 | 38.2% | 32.9% |
| 0.786 | 20.4% [18.0-23.0] n=999 | 21.4% | 17.4% |

Deepest pullback that HELD (continuations only): 0.236-0.382: 44.9%, 0.382-0.5: 19.3%, 0.5-0.618: 12.4%, 0.618-0.786: 12.6%, 0.786-1.0: 10.7%

Extension reached after continuation: >= 1.1: 82.4%, >= 1.2: 69.8%, >= 1.272: 62.5%, >= 1.5: 47.6%, >= 1.618: 42.8%, >= 2.0: 31.9%

IS / OOS continuation given pullback reached:

| depth | IS | OOS |
|---|---|---|
| 0.236 | 69.9% n=15501 (null 67.9%) | 68.1% n=10169 (null 66.6%) |
| 0.382 | 56.9% n=10851 (null 54.3%) | 55.4% n=7269 (null 53.2%) |
| 0.5 | 46.1% n=8675 (null 43.1%) | 44.7% n=5860 (null 42.2%) |
| 0.618 | 35.9% n=7294 (null 32.2%) | 34.3% n=4929 (null 31.4%) |
| 0.786 | 20.6% n=5875 (null 16.7%) | 19.0% n=3998 (null 16.4%) |

Fib conditioning - by leg size:

| group | n | continuation (or P(cont|reached)) | best sim |
|---|---|---|---|
| 0.12-0.2 ADR | 17400 | n/a | entry_0.382|stop_origin+10%|target_1.618: n=12494 win 39.1% avg -0.208R, gross -0.064R (t -6.13, cost 0.14R) PF 0.7 t=-19.91 maxDD -2606.71R |
| 0.2-0.35 | 7299 | n/a | entry_0.382|stop_origin|target_1.618: n=4967 win 38.2% avg -0.099R, gross +0.001R (t 0.06, cost 0.10R) PF 0.85 t=-5.48 maxDD -528.61R |
| >0.35 ADR | 971 | n/a | entry_0.786|stop_origin|target_1.618: n=386 win 18.4% avg +0.175R, gross +0.342R (t 2.35, cost 0.17R) PF 1.18 t=1.2 maxDD -38.2R |

Fib conditioning - by regime:

| group | n | continuation (or P(cont|reached)) | best sim |
|---|---|---|---|
| quiet | 4459 | 68.9% [67.5-70.3] n=4459 | entry_0.382|stop_origin+10%|target_1.272: n=3169 win 49.4% avg -0.231R, gross -0.055R (t -3.26, cost 0.18R) PF 0.61 t=-13.55 maxDD -734.3R |
| normal | 16157 | 70.3% [69.6-71.0] n=16157 | entry_0.382|stop_origin+10%|target_1.618: n=11191 win 40.2% avg -0.169R, gross -0.040R (t -3.59, cost 0.13R) PF 0.75 t=-15.24 maxDD -1903.26R |
| heavy | 4702 | 65.2% [63.9-66.6] n=4702 | entry_0.786|stop_origin|target_1.618: n=2015 win 15.0% avg -0.075R, gross +0.137R (t 2.27, cost 0.21R) PF 0.93 t=-1.24 maxDD -168.58R |

Fib conditioning - by direction:

| group | n | continuation (or P(cont|reached)) | best sim |
|---|---|---|---|
| up_legs | 13116 | 69.5% [68.7-70.2] n=13116 | entry_0.382|stop_origin+10%|target_1.618: n=9166 win 39.3% avg -0.184R, gross -0.060R (t -4.91, cost 0.12R) PF 0.73 t=-15.1 maxDD -1698.95R |
| down_legs | 12554 | 68.9% [68.1-69.7] n=12554 | entry_0.382|stop_origin+10%|target_1.618: n=8954 win 40.0% avg -0.168R, gross -0.043R (t -3.46, cost 0.12R) PF 0.75 t=-13.55 maxDD -1524.75R |

Fib conditioning - by news day:

| group | n | continuation (or P(cont|reached)) | best sim |
|---|---|---|---|
| major news day | 8933 | 45.5% [44.2-46.9] n=5113 (RW null 50.0%) | entry_0.382|stop_origin+10%|target_1.618: n=6371 win 40.0% avg -0.154R, gross -0.044R (t -2.97, cost 0.11R) PF 0.77 t=-10.48 maxDD -991.16R |
| no major news | 16392 | 45.6% [44.6-46.7] n=9261 (RW null 50.0%) | entry_0.382|stop_origin+10%|target_1.618: n=11547 win 39.6% avg -0.188R, gross -0.054R (t -4.92, cost 0.14R) PF 0.73 t=-17.26 maxDD -2193.36R |

Fib by year (continuation rate, best 0.382-entry sim):

| year | n | continuation | entry 0.382, stop origin+10%, target 1.618 |
|---|---|---|---|
| 2016 | 2825 | 68.9% [67.2-70.6] n=2825 | n=2016 win 39.4% avg -0.217R, gross -0.059R (t -2.27, cost 0.16R) PF 0.69 t=-8.31 maxDD -448.42R |
| 2017 | 2430 | 74.4% [72.6-76.1] n=2430 | n=1593 win 43.1% avg -0.175R, gross +0.032R (t 1.09, cost 0.21R) PF 0.74 t=-5.89 maxDD -282.04R |
| 2018 | 2781 | 75.5% [73.9-77.1] n=2781 | n=1789 win 41.9% avg -0.228R, gross +0.003R (t 0.11, cost 0.23R) PF 0.68 t=-8.14 maxDD -411.57R |
| 2019 | 1864 | 66.6% [64.4-68.7] n=1864 | n=1348 win 37.4% avg -0.290R, gross -0.107R (t -3.39, cost 0.18R) PF 0.61 t=-9.15 maxDD -394.78R |
| 2020 | 3137 | 63.7% [62.0-65.4] n=3137 | n=2379 win 38.0% avg -0.209R, gross -0.090R (t -3.81, cost 0.12R) PF 0.7 t=-8.72 maxDD -498.88R |
| 2021 | 1699 | 71.3% [69.1-73.4] n=1699 | n=1174 win 40.9% avg -0.132R, gross -0.020R (t -0.59, cost 0.11R) PF 0.8 t=-3.84 maxDD -156.89R |
| 2022 | 1656 | 71.8% [69.6-73.9] n=1656 | n=1131 win 42.3% avg -0.104R, gross +0.011R (t 0.3, cost 0.11R) PF 0.84 t=-2.94 maxDD -133.25R |
| 2023 | 1652 | 71.1% [68.9-73.3] n=1652 | n=1130 win 39.0% avg -0.189R, gross -0.066R (t -1.89, cost 0.12R) PF 0.72 t=-5.46 maxDD -220.05R |
| 2024 | 1932 | 70.1% [68.0-72.1] n=1932 | n=1357 win 40.5% avg -0.118R, gross -0.032R (t -1.0, cost 0.09R) PF 0.82 t=-3.7 maxDD -170.09R |
| 2025 | 3108 | 67.6% [65.9-69.2] n=3108 | n=2253 win 39.8% avg -0.098R, gross -0.048R (t -1.96, cost 0.05R) PF 0.84 t=-3.98 maxDD -235.74R |
| 2026 | 2586 | 63.3% [61.4-65.1] n=2586 | n=1950 win 35.9% avg -0.163R, gross -0.140R (t -5.38, cost 0.02R) PF 0.75 t=-6.28 maxDD -332.05R |

## 6. Session VWAP and bands

| event | n | back to VWAP within 60m | within 120m | by day end |
|---|---|---|---|---|
| 1.0_sigma | 2723 | 52.3% [50.4-54.1] n=2723 | 70.1% [68.4-71.8] n=2723 | 98.5% [98.0-98.9] n=2723 |
| 2.0_sigma | 2722 | 42.6% [40.7-44.4] n=2722 | 60.1% [58.2-61.9] n=2722 | 97.1% [96.4-97.7] n=2722 |
| baseline_random_bar | 2723 | 34.3% [32.6-36.1] n=2723 | 44.8% [43.0-46.7] n=2723 | 69.1% [67.3-70.8] n=2723 |

| checkpoint | days with abs(z) >= 1.5 | closes even further from VWAP | closes back through VWAP | z p10/p90 |
|---|---|---|---|---|
| minute 60 | 783 | 42.1% [38.7-45.6] n=783 | 51.6% [48.1-55.1] n=783 | -1.77 / 1.7 |
| minute 120 | 802 | 42.4% [39.0-45.8] n=802 | 48.4% [44.9-51.8] n=802 | -1.68 / 1.76 |
| minute 240 | 798 | 36.5% [33.2-39.9] n=798 | 45.5% [42.1-49.0] n=798 | -1.68 / 1.78 |

- VWAP bounce after a 1.5-sigma push (race +1 sigma vs -1 sigma): 50.1% [48.2-52.0] n=2667 p=0.908 (RW null 49.7%); sim: n=2667 win 48.8% avg -0.253R, gross +0.021R (t 0.97, cost 0.28R) PF 0.61 t=-10.9 maxDD -695.54R
- Fade 2 sigma back to VWAP (stop 3.5 sigma): n=2722 win 31.6% avg -0.595R, gross +0.083R (t 1.48, cost 0.68R) PF 0.53 t=-6.51 maxDD -1671.75R
- Side of VWAP predicts rest of day, at_london_open_0700UK: 51.2% [49.3-53.1] n=2723 p=0.22
- Side of VWAP predicts rest of day, at_ny_open_1430UK: 51.8% [49.9-53.7] n=2723 p=0.0658
- Side of VWAP predicts rest of day, vwap_slope_h1_to_h2_vs_rest: 48.7% [46.8-50.6] n=2722 p=0.186

| year | fade 2 sigma | VWAP bounce |
|---|---|---|
| 2016 | n=247 win 38.5% avg -0.255R PF 0.75 t=-1.42 maxDD -65.77R | n=241 win 44.8% avg -0.390R PF 0.44 t=-5.5 maxDD -99.95R |
| 2017 | n=256 win 26.6% avg -0.944R PF 0.31 t=-7.92 maxDD -240.74R | n=251 win 54.2% avg -0.351R PF 0.49 t=-4.19 maxDD -95.48R |
| 2018 | n=257 win 27.2% avg -1.225R PF 0.26 t=-3.94 maxDD -313.82R | n=251 win 45.8% avg -0.489R PF 0.37 t=-6.82 maxDD -124.02R |
| 2019 | n=257 win 35.0% avg -0.659R PF 0.45 t=-4.68 maxDD -170.81R | n=253 win 44.3% avg -0.452R PF 0.44 t=-5.31 maxDD -113.66R |
| 2020 | n=258 win 35.3% avg -0.159R PF 0.84 t=-0.7 maxDD -63.62R | n=254 win 52.0% avg -0.107R PF 0.82 t=-1.45 maxDD -33.58R |
| 2021 | n=257 win 30.0% avg -0.649R PF 0.46 t=-3.97 maxDD -180.63R | n=253 win 45.8% avg -0.279R PF 0.58 t=-3.68 maxDD -77.86R |
| 2022 | n=257 win 30.7% avg -0.654R PF 0.46 t=-4.1 maxDD -178.32R | n=255 win 46.3% avg -0.248R PF 0.62 t=-3.59 maxDD -64.75R |
| 2023 | n=256 win 30.9% avg -0.942R PF 0.39 t=-2.22 maxDD -242.35R | n=248 win 52.8% avg -0.112R PF 0.81 t=-1.26 maxDD -44.22R |
| 2024 | n=258 win 30.2% avg -0.674R PF 0.62 t=-1.01 maxDD -260.23R | n=250 win 48.4% avg -0.224R PF 0.63 t=-3.47 maxDD -56.36R |
| 2025 | n=257 win 30.7% avg -0.267R PF 0.71 t=-1.82 maxDD -89.85R | n=249 win 50.2% avg -0.059R PF 0.89 t=-0.82 maxDD -30.05R |
| 2026 | n=162 win 33.3% avg +0.183R PF 1.25 t=0.85 maxDD -25.7R | n=162 win 54.3% avg +0.018R PF 1.04 t=0.23 maxDD -12.46R |

## 7. Asia range (23:00-07:00 UK) into London / NY

Asia range: med 0.419 ADR (p25 0.325, p75 0.576, mean 0.501, n=2723). Outcomes: high only 33.4%, low only 28.9%, both 34.8%, neither 2.9%. Minutes from 07:00 to first break: med 68.0 (p25 20.0, p75 180.0, mean 131.0, n=2643).

After the first break: day closes beyond the broken side 52.4% [50.5-54.3] n=2643; closes back inside at some point 93.9% [92.9-94.8] n=2643; opposite side also taken 35.8% [34.0-37.7] n=2643; MFE med 0.877 ranges (p25 0.406, p75 1.623, mean 1.226, n=2643).

- Breakout sim (first close beyond, stop mid-range, target 1x range): n=2643 win 40.3% avg -0.045R, gross +0.028R (t 1.14, cost 0.07R) PF 0.93 t=-1.87 maxDD -191.64R
- Sweep-fade sim (first close back inside after a break, stop beyond sweep extreme, target other side; avg RR 4.912): n=2482 win 23.2% avg -0.173R, gross +0.034R (t 0.75, cost 0.21R) PF 0.81 t=-3.77 maxDD -428.89R
- IS: breakout n=1582 win 38.7% avg -0.085R PF 0.87 t=-2.68 maxDD -142.25R; sweep-fade n=1489 win 24.5% avg -0.183R PF 0.81 t=-3.1 maxDD -290.09R
- OOS: breakout n=1061 win 42.7% avg +0.013R PF 1.02 t=0.34 maxDD -57.73R; sweep-fade n=993 win 21.1% avg -0.158R PF 0.82 t=-2.17 maxDD -162.23R

Asia conditioning - by asia range size:

| group | n | closes beyond | opposite also taken | breakout sim | sweep-fade sim |
|---|---|---|---|---|---|
| 0.25-0.40 | 1003 | 49.8% [46.7-52.8] n=1003 | 47.7% [44.6-50.8] n=1003 | n=1003 win 38.4% avg -0.073R PF 0.89 t=-1.78 maxDD -102.12R | n=956 win 24.6% avg -0.193R PF 0.79 t=-2.74 maxDD -187.65R |
| 0.40-0.60 | 870 | 52.3% [49.0-55.6] n=870 | 30.0% [27.0-33.1] n=870 | n=870 win 39.2% avg -0.055R PF 0.91 t=-1.3 maxDD -75.74R | n=820 win 22.1% avg -0.177R PF 0.81 t=-2.18 maxDD -151.73R |
| <0.25 ADR | 221 | 56.6% [50.0-62.9] n=221 | 59.3% [52.7-65.5] n=221 | n=221 win 38.0% avg -0.111R PF 0.84 t=-1.25 maxDD -36.51R | n=211 win 24.2% avg -0.356R PF 0.64 t=-2.73 maxDD -81.34R |
| >0.60 ADR | 549 | 55.7% [51.6-59.8] n=549 | 14.0% [11.4-17.2] n=549 | n=549 win 46.6% avg +0.047R PF 1.1 t=0.98 maxDD -20.27R | n=495 win 21.8% avg -0.050R PF 0.94 t=-0.43 maxDD -36.86R |

Asia conditioning - by break timing:

| group | n | closes beyond | opposite also taken | breakout sim | sweep-fade sim |
|---|---|---|---|---|---|
| 60-180min | 768 | 52.3% [48.8-55.9] n=768 | 40.5% [37.1-44.0] n=768 | n=768 win 38.9% avg -0.065R PF 0.9 t=-1.41 maxDD -68.1R | n=733 win 23.5% avg -0.116R PF 0.87 t=-1.3 maxDD -110.72R |
| >180min | 661 | 54.3% [50.5-58.1] n=661 | 22.7% [19.7-26.0] n=661 | n=661 win 45.2% avg +0.024R PF 1.05 t=0.53 maxDD -24.4R | n=574 win 26.1% avg -0.141R PF 0.83 t=-1.65 maxDD -94.21R |
| break<=60min | 1214 | 51.4% [48.6-54.2] n=1214 | 40.0% [37.3-42.8] n=1214 | n=1214 win 38.6% avg -0.071R PF 0.89 t=-1.92 maxDD -122.23R | n=1175 win 21.5% avg -0.224R PF 0.77 t=-3.32 maxDD -265.28R |

Asia conditioning - by weekday:

| group | n | closes beyond | opposite also taken | breakout sim | sweep-fade sim |
|---|---|---|---|---|---|
| Fri | 524 | 55.3% [51.1-59.5] n=524 | 38.0% [33.9-42.2] n=524 | n=524 win 40.1% avg -0.045R PF 0.93 t=-0.81 maxDD -52.77R | n=494 win 22.7% avg -0.270R PF 0.71 t=-2.91 maxDD -140.73R |
| Mon | 497 | 49.5% [45.1-53.9] n=497 | 23.7% [20.2-27.7] n=497 | n=497 win 40.2% avg -0.056R PF 0.91 t=-1.03 maxDD -58.72R | n=459 win 25.5% avg -0.006R PF 0.99 t=-0.05 maxDD -46.69R |
| Thu | 539 | 54.4% [50.1-58.5] n=539 | 35.4% [31.5-39.6] n=539 | n=539 win 43.4% avg +0.058R PF 1.1 t=1.03 maxDD -18.89R | n=506 win 20.8% avg -0.245R PF 0.74 t=-2.38 maxDD -132.25R |
| Tue | 544 | 53.5% [49.3-57.6] n=544 | 36.0% [32.1-40.1] n=544 | n=544 win 43.2% avg +0.012R PF 1.02 t=0.21 maxDD -39.52R | n=509 win 22.2% avg -0.222R PF 0.76 t=-2.27 maxDD -111.98R |
| Wed | 539 | 49.2% [45.0-53.4] n=539 | 45.1% [40.9-49.3] n=539 | n=539 win 34.7% avg -0.198R PF 0.71 t=-3.78 maxDD -119.54R | n=514 win 24.9% avg -0.109R PF 0.88 t=-1.09 maxDD -78.21R |

Asia conditioning - by vol regime:

| group | n | closes beyond | opposite also taken | breakout sim | sweep-fade sim |
|---|---|---|---|---|---|
| heavy | 368 | 55.7% [50.6-60.7] n=368 | 25.8% [21.6-30.5] n=368 | n=368 win 45.1% avg +0.046R PF 1.09 t=0.75 maxDD -16.31R | n=337 win 23.1% avg -0.140R PF 0.83 t=-1.21 maxDD -69.78R |
| normal | 1822 | 51.4% [49.1-53.7] n=1822 | 37.4% [35.2-39.6] n=1822 | n=1822 win 38.9% avg -0.079R PF 0.88 t=-2.68 maxDD -183.82R | n=1721 win 23.2% avg -0.160R PF 0.83 t=-2.88 maxDD -281.83R |
| quiet | 425 | 53.9% [49.1-58.6] n=425 | 37.9% [33.4-42.6] n=425 | n=425 win 42.1% avg +0.015R PF 1.02 t=0.24 maxDD -21.79R | n=399 win 23.3% avg -0.224R PF 0.77 t=-1.87 maxDD -105.13R |

Asia conditioning - by news day:

| group | n | closes beyond | opposite also taken | breakout sim | sweep-fade sim |
|---|---|---|---|---|---|
| major news day | 1003 | 53.7% [50.6-56.8] n=1003 | 39.6% [36.6-42.6] n=1003 | n=1003 win 41.3% avg -0.028R PF 0.95 t=-0.71 maxDD -72.54R | n=931 win 22.6% avg -0.186R PF 0.8 t=-2.55 maxDD -193.02R |
| no major news | 1606 | 51.2% [48.8-53.7] n=1606 | 33.9% [31.7-36.3] n=1606 | n=1606 win 39.5% avg -0.062R PF 0.9 t=-1.98 maxDD -140.9R | n=1521 win 23.9% avg -0.154R PF 0.83 t=-2.57 maxDD -241.71R |
| unknown | 34 | 67.6% [50.8-80.9] n=34 | 14.7% [6.4-30.1] n=34 | n=34 win 52.9% avg +0.221R PF 1.53 t=1.07 maxDD -3.03R | n=30 win 6.7% avg -0.717R PF 0.17 t=-4.44 maxDD -21.74R |

Asia conditioning - by year:

| group | n | closes beyond | opposite also taken | breakout sim | sweep-fade sim |
|---|---|---|---|---|---|
| 2016 | 234 | 49.6% [43.2-55.9] n=234 | 31.2% [25.6-37.4] n=234 | n=234 win 41.0% avg -0.064R PF 0.89 t=-0.82 maxDD -21.14R | n=221 win 21.7% avg -0.344R PF 0.64 t=-2.58 maxDD -84.03R |
| 2017 | 250 | 57.2% [51.0-63.2] n=250 | 38.8% [33.0-45.0] n=250 | n=250 win 41.6% avg -0.069R PF 0.89 t=-0.86 maxDD -21.37R | n=226 win 26.5% avg -0.139R PF 0.86 t=-0.87 maxDD -54.76R |
| 2018 | 253 | 49.4% [43.3-55.5] n=253 | 34.0% [28.4-40.0] n=253 | n=253 win 38.7% avg -0.062R PF 0.9 t=-0.77 maxDD -25.05R | n=236 win 24.2% avg -0.292R PF 0.7 t=-2.1 maxDD -77.2R |
| 2019 | 251 | 51.8% [45.6-57.9] n=251 | 41.0% [35.1-47.2] n=251 | n=251 win 37.8% avg -0.118R PF 0.82 t=-1.49 maxDD -32.62R | n=239 win 24.7% avg -0.213R PF 0.78 t=-1.4 maxDD -81.96R |
| 2020 | 246 | 54.1% [47.8-60.2] n=246 | 32.9% [27.4-39.0] n=246 | n=246 win 40.7% avg +0.003R PF 1.01 t=0.04 maxDD -20.19R | n=234 win 24.4% avg -0.126R PF 0.86 t=-0.81 maxDD -44.67R |
| 2021 | 252 | 45.6% [39.6-51.8] n=252 | 48.0% [41.9-54.2] n=252 | n=252 win 32.5% avg -0.205R PF 0.71 t=-2.61 maxDD -53.06R | n=243 win 25.1% avg -0.110R PF 0.88 t=-0.77 maxDD -39.19R |
| 2022 | 254 | 56.7% [50.5-62.6] n=254 | 39.4% [33.6-45.5] n=254 | n=254 win 38.2% avg -0.090R PF 0.86 t=-1.12 maxDD -26.18R | n=241 win 20.7% avg -0.128R PF 0.86 t=-0.82 maxDD -62.58R |
| 2023 | 255 | 46.3% [40.3-52.4] n=255 | 43.9% [38.0-50.1] n=255 | n=255 win 37.3% avg -0.080R PF 0.88 t=-0.99 maxDD -34.8R | n=238 win 25.6% avg -0.049R PF 0.95 t=-0.31 maxDD -64.45R |
| 2024 | 253 | 55.3% [49.2-61.3] n=253 | 34.0% [28.4-40.0] n=253 | n=253 win 43.5% avg +0.052R PF 1.09 t=0.64 maxDD -16.01R | n=243 win 21.0% avg -0.146R PF 0.84 t=-1.01 maxDD -46.71R |
| 2025 | 245 | 51.8% [45.6-58.0] n=245 | 27.8% [22.5-33.7] n=245 | n=245 win 43.7% avg +0.024R PF 1.05 t=0.32 maxDD -14.46R | n=228 win 21.9% avg -0.077R PF 0.91 t=-0.48 maxDD -39.18R |
| 2026 | 150 | 62.7% [54.7-70.0] n=150 | 13.3% [8.8-19.7] n=150 | n=150 win 54.7% avg +0.216R PF 1.57 t=2.39 maxDD -7.38R | n=133 win 15.8% avg -0.376R PF 0.55 t=-2.35 maxDD -65.65R |

## 8. Prior-day / prior-week levels

| level | days | distance from open (ADR, med) | touched | min to touch (med) | reject first (0.15 ADR race) | break first | day closes beyond after touch |
|---|---|---|---|---|---|---|---|
| PDH | 2687 | 0.407 | 50.2% [48.3-52.1] n=2687 | 474.0 | 43.9% [41.3-46.6] n=1330 | 56.1% [53.4-58.7] n=1330 | 52.1% [49.4-54.7] n=1348 |
| PDL | 2711 | 0.477 | 44.3% [42.5-46.2] n=2711 | 554.0 | 47.5% [44.7-50.3] n=1192 | 52.5% [49.7-55.3] n=1192 | 46.7% [43.9-49.5] n=1202 |
| PDC | 1579 | 0.045 | 92.2% [90.8-93.4] n=1579 | 14.0 | 51.9% [49.3-54.4] n=1454 | 48.1% [45.6-50.7] n=1454 | 47.0% [44.5-49.6] n=1456 |
| PWH | 2700 | 1.103 | 23.9% [22.3-25.5] n=2700 | 557.0 | 48.5% [44.6-52.4] n=635 | 51.5% [47.6-55.4] n=635 | 51.6% [47.8-55.5] n=645 |
| PWL | 2711 | 1.362 | 18.7% [17.3-20.3] n=2711 | 690.0 | 45.4% [41.1-49.8] n=500 | 54.6% [50.2-58.9] n=500 | 51.4% [47.0-55.7] n=508 |

Touch rate by distance from the open:

| level | distance | n | touched | reject first |
|---|---|---|---|---|
| PDH | <0.25 ADR | 865 | 80.7% [77.9-83.2] n=865 | 45.3% [41.6-49.0] n=696 |
| PDH | 0.25-0.5 | 725 | 57.1% [53.5-60.7] n=725 | 43.2% [38.4-48.1] n=403 |
| PDH | 0.5-1.0 | 739 | 28.7% [25.5-32.1] n=739 | 39.6% [33.2-46.4] n=207 |
| PDH | >1.0 ADR | 358 | 6.7% [4.5-9.8] n=358 | 54.2% [35.1-72.1] n=24 |
| PDL | <0.25 ADR | 644 | 77.3% [73.9-80.4] n=644 | 48.5% [44.1-52.9] n=497 |
| PDL | 0.25-0.5 | 775 | 56.3% [52.7-59.7] n=775 | 47.1% [42.5-51.8] n=433 |
| PDL | 0.5-1.0 | 881 | 26.2% [23.4-29.2] n=881 | 45.3% [39.0-51.9] n=225 |
| PDL | >1.0 ADR | 411 | 9.0% [6.6-12.2] n=411 | 51.4% [35.9-66.6] n=37 |
| PDC | <0.25 ADR | 1499 | 94.3% [93.0-95.3] n=1499 | 51.9% [49.3-54.5] n=1411 |
| PDC | 0.25-0.5 | 58 | 63.8% [50.9-74.9] n=58 | 43.2% [28.7-59.1] n=37 |
| PWH | <0.25 ADR | 300 | 82.0% [77.3-85.9] n=300 | 49.6% [43.4-55.8] n=246 |
| PWH | 0.25-0.5 | 344 | 54.4% [49.1-59.5] n=344 | 49.5% [42.4-56.6] n=186 |
| PWH | 0.5-1.0 | 596 | 27.0% [23.6-30.7] n=596 | 44.4% [36.8-52.4] n=153 |
| PWH | >1.0 ADR | 1460 | 3.5% [2.7-4.6] n=1460 | 52.0% [38.5-65.2] n=50 |
| PWL | <0.25 ADR | 207 | 81.2% [75.3-85.9] n=207 | 48.2% [40.8-55.7] n=168 |
| PWL | 0.25-0.5 | 279 | 55.2% [49.3-60.9] n=279 | 48.7% [40.9-56.6] n=152 |
| PWL | 0.5-1.0 | 544 | 25.0% [21.5-28.8] n=544 | 39.1% [31.2-47.6] n=133 |
| PWL | >1.0 ADR | 1681 | 3.0% [2.3-3.9] n=1681 | 42.6% [29.5-56.7] n=47 |

## 9. First candle of the day, by timeframe

| TF | n | rest of day same direction | opposite extreme holds all day | day extends beyond candle | extension (candle ranges, med) | candle range (ADR, med) |
|---|---|---|---|---|---|---|
| 5m | 2718 | 49.5% [47.6-51.4] n=2717 p=0.618 | 6.4% [5.5-7.4] n=2718 | 97.1% [96.4-97.7] n=2718 | 6.935 | 0.056 |
| 15m | 2711 | 48.8% [46.9-50.7] n=2711 p=0.219 | 8.6% [7.6-9.7] n=2711 | 96.0% [95.2-96.7] n=2711 | 4.882 | 0.076 |
| 30m | 2705 | 48.3% [46.4-50.1] n=2704 p=0.0737 | 10.4% [9.3-11.6] n=2705 | 94.6% [93.6-95.4] n=2705 | 3.768 | 0.095 |
| 60m | 2709 | 48.4% [46.5-50.3] n=2708 p=0.102 | 13.3% [12.1-14.7] n=2709 | 93.4% [92.4-94.3] n=2709 | 2.876 | 0.121 |
| 240m | 2721 | 49.4% [47.5-51.3] n=2721 p=0.54 | 33.7% [31.9-35.5] n=2721 | 84.7% [83.3-86.1] n=2721 | 0.926 | 0.311 |

| TF | body ratio | n | rest same | opposite extreme holds |
|---|---|---|---|---|
| 5m | doji <0.3 | 852 | 48.4% [45.0-51.7] n=852 | 4.3% [3.2-5.9] n=852 |
| 5m | 0.3-0.6 | 954 | 49.8% [46.6-53.0] n=954 | 6.2% [4.8-7.9] n=954 |
| 5m | strong >0.6 | 911 | 50.3% [47.0-53.5] n=911 | 8.6% [6.9-10.6] n=911 |
| 15m | doji <0.3 | 894 | 51.8% [48.5-55.1] n=894 | 5.7% [4.4-7.4] n=894 |
| 15m | 0.3-0.6 | 969 | 48.8% [45.7-52.0] n=969 | 8.5% [6.9-10.4] n=969 |
| 15m | strong >0.6 | 848 | 45.6% [42.3-49.0] n=848 | 11.7% [9.7-14.0] n=848 |
| 30m | doji <0.3 | 925 | 47.9% [44.7-51.1] n=925 | 7.4% [5.8-9.2] n=925 |
| 30m | 0.3-0.6 | 949 | 47.9% [44.8-51.1] n=949 | 9.4% [7.7-11.4] n=949 |
| 30m | strong >0.6 | 830 | 49.0% [45.6-52.4] n=830 | 14.8% [12.6-17.4] n=830 |
| 60m | doji <0.3 | 959 | 49.1% [46.0-52.3] n=959 | 10.0% [8.3-12.1] n=959 |
| 60m | 0.3-0.6 | 994 | 48.4% [45.3-51.5] n=994 | 12.2% [10.3-14.4] n=994 |
| 60m | strong >0.6 | 755 | 47.5% [44.0-51.1] n=755 | 19.1% [16.4-22.0] n=755 |
| 240m | doji <0.3 | 889 | 50.5% [47.2-53.8] n=889 | 26.2% [23.4-29.2] n=889 |
| 240m | 0.3-0.6 | 1008 | 48.2% [45.1-51.3] n=1008 | 33.3% [30.5-36.3] n=1008 |
| 240m | strong >0.6 | 824 | 49.6% [46.2-53.0] n=824 | 42.2% [38.9-45.6] n=824 |

| TF | candle range | n | rest same | opposite extreme holds |
|---|---|---|---|---|
| 5m | small <0.1 ADR | 2123 | 50.1% [48.0-52.2] n=2123 | 4.1% [3.4-5.1] n=2123 |
| 5m | 0.1-0.2 | 450 | 47.1% [42.5-51.7] n=450 | 12.7% [9.9-16.1] n=450 |
| 5m | 0.2-0.35 | 96 | 50.0% [40.2-59.8] n=96 | 16.7% [10.5-25.4] n=96 |
| 5m | large >0.35 | 48 | 43.8% [30.7-57.7] n=48 | 27.1% [16.6-41.0] n=48 |
| 15m | small <0.1 ADR | 1772 | 49.9% [47.6-52.3] n=1772 | 4.7% [3.8-5.8] n=1772 |
| 15m | 0.1-0.2 | 682 | 45.9% [42.2-49.6] n=682 | 12.5% [10.2-15.2] n=682 |
| 15m | 0.2-0.35 | 169 | 52.7% [45.2-60.0] n=169 | 23.1% [17.4-30.0] n=169 |
| 15m | large >0.35 | 88 | 40.9% [31.2-51.4] n=88 | 28.4% [20.0-38.6] n=88 |
| 30m | small <0.1 ADR | 1453 | 49.3% [46.7-51.8] n=1453 | 5.8% [4.7-7.1] n=1453 |
| 30m | 0.1-0.2 | 875 | 47.0% [43.7-50.3] n=875 | 12.5% [10.4-14.8] n=875 |
| 30m | 0.2-0.35 | 249 | 51.0% [44.8-57.2] n=249 | 19.7% [15.2-25.1] n=249 |
| 30m | large >0.35 | 127 | 40.2% [32.0-48.9] n=127 | 29.9% [22.6-38.4] n=127 |
| 60m | small <0.1 ADR | 999 | 48.6% [45.6-51.7] n=999 | 6.4% [5.0-8.1] n=999 |
| 60m | 0.1-0.2 | 1126 | 48.0% [45.1-51.0] n=1126 | 12.9% [11.0-15.0] n=1126 |
| 60m | 0.2-0.35 | 404 | 51.2% [46.4-56.1] n=404 | 22.8% [19.0-27.1] n=404 |
| 60m | large >0.35 | 179 | 43.0% [36.0-50.3] n=179 | 33.5% [27.0-40.7] n=179 |
| 240m | 0.1-0.2 | 346 | 50.6% [45.3-55.8] n=346 | 15.6% [12.2-19.8] n=346 |
| 240m | 0.2-0.35 | 1278 | 49.4% [46.6-52.1] n=1278 | 26.9% [24.6-29.4] n=1278 |
| 240m | large >0.35 | 1096 | 49.1% [46.1-52.0] n=1096 | 47.4% [44.4-50.3] n=1096 |
