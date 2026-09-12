# Daily-Open research: EURUSD

Data: 3,840,908 M1 bars, 2016-01-04 to 2026-08-20, 2757 anchored days. Anchor `broker` = 17:00 America/New_York. Median ADR20 = 0.00701. Round-trip cost assumed = 0.00015 (price units). Major-news days flagged: 1093 (USD/EUR).

All distances are in ADR units (trailing 20-day median daily range, strictly prior) unless stated. R = risk multiple net of cost. CI = Wilson 95%. 'p' = two-sided binomial test against 50%.

## 1. Which open? Anchor comparison

| anchor | days | first-60m share of day range (median) | day high/low set in first 60m | first-60m direction = day close |
|---|---|---|---|---|
| broker | 2736 | 0.090 | 12.4% [11.2-13.6] n=2736 | 51.0% [49.1-52.9] n=2736 |
| london23 | 2736 | 0.089 | 13.6% [12.4-14.9] n=2736 | 51.3% [49.4-53.1] n=2736 |
| utc22 | 2747 | 0.088 | 13.2% [12.0-14.5] n=2747 | 51.3% [49.4-53.1] n=2747 |
| london00 | 2747 | 0.107 | 14.5% [13.2-15.9] n=2747 | 51.9% [50.1-53.8] n=2747 |
| tokyo | 2747 | 0.146 | 19.4% [17.9-20.9] n=2747 | 52.3% [50.4-54.1] n=2747 |
| london08 | 2744 | 0.283 | 39.4% [37.6-41.3] n=2744 | 59.7% [57.8-61.5] n=2744 |

## 2. Where is the volatility? (anchor = broker open)

| window after open | share of day range (median) | day high or low inside window | uniform expectation |
|---|---|---|---|
| first 5m | 0.030 | 4.0% [3.3-4.8] n=2736 | 0.7% |
| first 15m | 0.052 | 6.7% [5.8-7.6] n=2736 | 2.2% |
| first 30m | 0.066 | 8.7% [7.7-9.8] n=2736 | 4.3% |
| first 60m | 0.090 | 12.4% [11.2-13.6] n=2736 | 8.5% |
| first 120m | 0.127 | 18.1% [16.7-19.5] n=2736 | 16.6% |
| first 240m | 0.226 | 31.1% [29.4-32.8] n=2736 | 31.8% |
| shuffled-returns null, first 60m | | 22.0% [20.5-23.6] n=2736 | |
| control: last 60m | 0.099 | 10.3% [9.2-11.5] n=2736 | |
| control: interior 60m at 6h | 0.097 | 2.5% [2.0-3.1] n=2736 | |

Mean 1-minute true range in ADR units, by 15-minute block after the open (first 8h):

| 0h00 | 0h15 | 0h30 | 0h45 | 1h00 | 1h15 | 1h30 | 1h45 | 2h00 | 2h15 | 2h30 | 2h45 | 3h00 | 3h15 | 3h30 | 3h45 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 14.4 | 11.8 | 10.9 | 13.3 | 12.4 | 10.4 | 9.8 | 10.2 | 12.5 | 11.4 | 11.6 | 14.8 | 18.0 | 16.0 | 15.3 | 17.8 |
| 4h00 | 4h15 | 4h30 | 4h45 | 5h00 | 5h15 | 5h30 | 5h45 | 6h00 | 6h15 | 6h30 | 6h45 | 7h00 | 7h15 | 7h30 | 7h45 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 16.7 | 16.0 | 16.2 | 15.5 | 14.2 | 13.2 | 12.8 | 12.7 | 12.0 | 11.2 | 10.9 | 11.1 | 10.9 | 10.7 | 11.0 | 12.5 |

(values x1000; e.g. 20 = a 1-minute bar moves 2% of a day's range on average)

Median 60-minute range by UK clock hour (price units):

| 00 | 01 | 02 | 03 | 04 | 05 | 06 | 07 | 08 | 09 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0.00072 | 0.00099 | 0.00094 | 0.00077 | 0.00066 | 0.00067 | 0.00091 | 0.00149 | 0.00181 | 0.00161 | 0.00137 | 0.00134 | 0.00147 | 0.00197 | 0.00198 | 0.00222 | 0.00164 | 0.00129 | 0.00114 | 0.00102 | 0.00086 | 0.00066 | 0.00057 | 0.00062 |

## 3. The open as a level

| first N minutes direction | agrees with day close (overlapping) | agrees with REST of day (overlap-free) |
|---|---|---|
| first_15m | 51.1% [49.2-53.0] n=2656 p=0.286 | 49.4% [47.5-51.3] n=2655 p=0.535 |
| first_30m | 52.6% [50.7-54.4] n=2662 p=0.00887 | 50.5% [48.6-52.4] n=2663 p=0.614 |
| first_60m | 52.0% [50.1-53.9] n=2684 p=0.0427 | 48.8% [46.9-50.7] n=2682 p=0.224 |
| first_120m | 54.1% [52.2-55.9] n=2712 p=2.58e-05 | 49.7% [47.9-51.6] n=2710 p=0.803 |

- Open crosses per day: med 21.0 (p25 11.0, p75 34.0, mean 23.7, n=2736)
- Share of bars above the open: med 0.526 (p25 0.254, p75 0.807, mean 0.522, n=2736)
- Close minus open (ADR): med 0.004 (p25 -0.43, p75 0.438, mean 0.005, n=2736)

Once price has moved X ADR away from the open, does it come back?

| distance | never returns to open that day | minutes until return (when it does) |
|---|---|---|
| 0.1_ADR | 12.2% [11.0-13.4] n=2736 | med 121.0 (p25 45.0, p75 368.0, mean 230.0, n=2403) |
| 0.2_ADR | 25.9% [24.3-27.6] n=2735 | med 251.0 (p25 104.0, p75 426.0, mean 298.0, n=2026) |
| 0.3_ADR | 42.3% [40.4-44.2] n=2687 | med 248.0 (p25 120.0, p75 418.0, mean 293.0, n=1551) |
| 0.5_ADR | 68.4% [66.4-70.3] n=2192 | med 229.0 (p25 111.0, p75 386.0, mean 271.0, n=693) |

Judas swing (early extreme then trend):

- P(day low in first 60m | up close): 13.8% [12.1-15.7] n=1375
- P(day high in first 60m | down close): 10.7% [9.2-12.5] n=1359
- shuffled_null_P(low in first 60m | up close): 21.5% [19.4-23.7] n=1373
- shuffled_null_P(high in first 60m | down close): 21.8% [19.7-24.1] n=1361

Where the day's HIGH forms (% of days, 30-min buckets after open, first 24 shown):

| bucket | 0h00 | 0h30 | 1h00 | 1h30 | 2h00 | 2h30 | 3h00 | 3h30 | 4h00 | 4h30 | 5h00 | 5h30 | 6h00 | 6h30 | 7h00 | 7h30 | 8h00 | 8h30 | 9h00 | 9h30 | 10h00 | 10h30 | 11h00 | 11h30 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| high | 3.7 | 1.7 | 1.6 | 1.0 | 1.2 | 1.5 | 1.8 | 1.6 | 1.9 | 1.9 | 1.2 | 0.7 | 1.0 | 0.7 | 0.7 | 0.5 | 1.2 | 1.5 | 2.2 | 2.6 | 4.1 | 2.6 | 2.2 | 2.1 |
| low | 5.0 | 2.0 | 2.0 | 1.1 | 1.1 | 1.6 | 1.9 | 2.4 | 1.2 | 1.2 | 1.0 | 0.8 | 0.4 | 0.5 | 0.5 | 0.6 | 0.7 | 1.1 | 2.2 | 2.6 | 3.8 | 2.0 | 1.9 | 1.5 |

Trend-day checkpoints: at 07:00 / 13:00 UK, given travel from the open and whether price sits at the day's extreme:

| checkpoint | travel | position | n | closes further in direction | closes back through open | further MFE (ADR, median) |
|---|---|---|---|---|---|---|
| 0700UK | 0.15-0.30 | at extreme | 322 | 51.2% [45.8-56.7] n=322 | 35.1% [30.1-40.5] n=322 | -0.022 |
| 0700UK | 0.15-0.30 | off extreme | 523 | 46.8% [42.6-51.1] n=523 | 37.5% [33.4-41.7] n=523 | 0.054 |
| 0700UK | 0.30-0.50 | at extreme | 195 | 50.3% [43.3-57.2] n=195 | 26.2% [20.5-32.7] n=195 | -0.003 |
| 0700UK | 0.30-0.50 | off extreme | 160 | 50.0% [42.3-57.7] n=160 | 27.5% [21.2-34.9] n=160 | 0.117 |
| 0700UK | <0.15 ADR | at extreme | 223 | 52.9% [46.4-59.4] n=223 | 41.7% [35.4-48.3] n=223 | -0.109 |
| 0700UK | <0.15 ADR | off extreme | 1174 | 49.1% [46.3-52.0] n=1174 | 45.3% [42.5-48.2] n=1174 | 0.051 |
| 0700UK | >0.50 ADR | at extreme | 76 | 52.6% [41.6-63.5] n=76 | 10.5% [5.4-19.4] n=76 | 0.139 |
| 0700UK | >0.50 ADR | off extreme | 55 | 50.9% [38.1-63.6] n=55 | 27.3% [17.3-40.2] n=55 | 0.051 |
| 1300UK | 0.15-0.30 | at extreme | 162 | 38.9% [31.7-46.6] n=162 | 35.2% [28.3-42.8] n=162 | -0.086 |
| 1300UK | 0.15-0.30 | off extreme | 542 | 52.4% [48.2-56.6] n=542 | 28.0% [24.4-32.0] n=542 | 0.0 |
| 1300UK | 0.30-0.50 | at extreme | 258 | 51.6% [45.5-57.6] n=258 | 19.4% [15.0-24.6] n=258 | 0.01 |
| 1300UK | 0.30-0.50 | off extreme | 358 | 51.4% [46.2-56.5] n=358 | 16.8% [13.2-21.0] n=358 | 0.07 |
| 1300UK | <0.15 ADR | at extreme | 71 | 50.7% [39.3-62.0] n=71 | 40.8% [30.2-52.5] n=71 | -0.196 |
| 1300UK | <0.15 ADR | off extreme | 674 | 51.8% [48.0-55.5] n=674 | 41.7% [38.0-45.5] n=674 | 0.013 |
| 1300UK | >0.50 ADR | at extreme | 406 | 48.8% [43.9-53.6] n=406 | 7.4% [5.2-10.4] n=406 | -0.075 |
| 1300UK | >0.50 ADR | off extreme | 264 | 49.2% [43.3-55.2] n=264 | 8.0% [5.3-11.9] n=264 | 0.047 |

Gap at the open: |gap| med 0.022 (p25 0.01, p75 0.044, mean 0.048, n=2507); fill rate 96.6% [95.9-97.3] n=2507; minutes to fill med 9.0 (p25 2.0, p75 47.0, mean 62.0, n=2423)

| gap size | fill rate | filled within 60m |
|---|---|---|
| <0.05 ADR | 99.0% [98.4-99.3] n=1982 | 87.4% [85.9-88.8] n=1982 |
| 0.05-0.15 | 94.5% [91.8-96.4] n=383 | 64.2% [59.3-68.9] n=383 |
| 0.15-0.30 | 81.7% [72.0-88.6] n=82 | 17.1% [10.5-26.6] n=82 |
| >0.30 ADR | 53.3% [40.9-65.4] n=60 | 5.0% [1.7-13.7] n=60 |

| weekday | median gap (ADR) | fill rate |
|---|---|---|
| Mon | 0.076 | 88.0% [84.9-90.5] n=524 |
| Tue | 0.017 | 99.0% [97.6-99.6] n=489 |
| Wed | 0.016 | 99.4% [98.3-99.8] n=504 |
| Thu | 0.017 | 98.2% [96.6-99.1] n=500 |
| Fri | 0.021 | 99.2% [97.9-99.7] n=490 |

## 4. Opening-range breakout

| OR window | OR size (ADR, med) | breakout rate | min to break (med) | day closes on breakout side | both sides taken | race +1 OR vs opposite edge | MFE (OR units, med) |
|---|---|---|---|---|---|---|---|
| or_5m | 0.031 | 100.0% | 4.0 | 50.8% [48.9-52.7] n=2671 | 94.6% [93.6-95.4] n=2671 | 57.3% [55.5-59.2] n=2670 p=3.45e-14 (RW null 66.6%) | 13.143 |
| or_15m | 0.055 | 100.0% | 14.0 | 50.9% [48.9-52.8] n=2510 | 91.1% [89.9-92.1] n=2510 | 50.7% [48.7-52.6] n=2507 p=0.523 (RW null 58.9%) | 7.82 |
| or_30m | 0.070 | 100.0% | 27.0 | 49.5% [47.5-51.5] n=2402 | 89.3% [88.0-90.5] n=2402 | 50.6% [48.6-52.6] n=2397 p=0.567 (RW null 56.7%) | 5.957 |
| or_60m | 0.092 | 100.0% | 21.0 | 49.4% [47.4-51.4] n=2406 | 85.7% [84.2-87.0] n=2406 | 50.3% [48.3-52.3] n=2397 p=0.775 (RW null 54.6%) | 4.424 |

Trade sims (entry = first close outside OR, stop = opposite OR edge, exit at day end):

| OR window | sim | all | IS (first 60%) | OOS (last 40%) |
|---|---|---|---|---|
| or_5m | target_1.0R_stop_opposite | n=2671 win 31.3% avg -0.912R, gross -0.192R (t -10.09, cost 0.72R) PF 0.15 t=-40.92 maxDD -2435.74R | n=1577 win 32.3% avg -0.865R PF 0.17 t=-29.82 maxDD -1364.33R | n=1094 win 30.0% avg -0.979R PF 0.13 t=-28.21 maxDD -1069.85R |
| or_5m | target_2.0R_stop_opposite | n=2671 win 23.6% avg -0.967R, gross -0.247R (t -9.84, cost 0.72R) PF 0.25 t=-35.21 maxDD -2588.53R | n=1577 win 24.4% avg -0.896R PF 0.27 t=-24.95 maxDD -1417.12R | n=1094 win 22.5% avg -1.071R PF 0.21 t=-25.2 maxDD -1169.85R |
| or_15m | target_1.0R_stop_opposite | n=2510 win 40.2% avg -0.567R, gross -0.158R (t -8.04, cost 0.41R) PF 0.31 t=-27.89 maxDD -1424.93R | n=1425 win 41.2% avg -0.511R PF 0.35 t=-18.96 maxDD -729.14R | n=1085 win 39.0% avg -0.642R PF 0.26 t=-20.76 maxDD -694.97R |
| or_15m | target_2.0R_stop_opposite | n=2510 win 25.9% avg -0.629R, gross -0.220R (t -8.4, cost 0.41R) PF 0.4 t=-23.54 maxDD -1581.47R | n=1425 win 26.2% avg -0.565R PF 0.43 t=-15.95 maxDD -807.69R | n=1085 win 25.5% avg -0.714R PF 0.35 t=-17.57 maxDD -776.1R |
| or_30m | target_1.0R_stop_opposite | n=2402 win 43.2% avg -0.441R, gross -0.127R (t -6.26, cost 0.32R) PF 0.4 t=-21.42 maxDD -1061.37R | n=1309 win 42.5% avg -0.409R PF 0.44 t=-14.79 maxDD -536.89R | n=1093 win 44.0% avg -0.480R PF 0.37 t=-15.56 maxDD -523.84R |
| or_30m | target_2.0R_stop_opposite | n=2402 win 28.4% avg -0.463R, gross -0.148R (t -5.39, cost 0.32R) PF 0.51 t=-16.68 maxDD -1114.83R | n=1309 win 27.8% avg -0.429R PF 0.53 t=-11.55 maxDD -565.62R | n=1093 win 29.1% avg -0.504R PF 0.48 t=-12.07 maxDD -549.57R |
| or_60m | target_1.0R_stop_opposite | n=2406 win 46.3% avg -0.308R, gross -0.074R (t -3.67, cost 0.23R) PF 0.53 t=-15.07 maxDD -741.64R | n=1308 win 45.9% avg -0.293R PF 0.55 t=-10.56 maxDD -385.27R | n=1098 win 46.7% avg -0.325R PF 0.51 t=-10.78 maxDD -360.02R |
| or_60m | target_2.0R_stop_opposite | n=2406 win 29.9% avg -0.340R, gross -0.107R (t -3.84, cost 0.23R) PF 0.61 t=-12.19 maxDD -819.75R | n=1308 win 29.7% avg -0.328R PF 0.61 t=-8.69 maxDD -432.46R | n=1098 win 30.2% avg -0.354R PF 0.59 t=-8.55 maxDD -397.33R |

ORB conditioning - by or size (30m OR):

| group | n | closes on side | both sides taken | sim 1R |
|---|---|---|---|---|
| 0.10-0.20 | 530 | 45.7% [41.5-49.9] n=530 | 85.3% [82.0-88.0] n=530 | n=530 win 45.5% avg -0.259R PF 0.59 t=-5.98 maxDD -138.46R |
| 0.20-0.35 | 70 | 51.4% [40.0-62.8] n=70 | 75.7% [64.5-84.2] n=70 | n=70 win 44.3% avg -0.199R PF 0.67 t=-1.67 maxDD -14.78R |
| <0.10 ADR | 1782 | 50.6% [48.3-52.9] n=1782 | 91.5% [90.1-92.7] n=1782 | n=1782 win 42.6% avg -0.506R PF 0.35 t=-21.16 maxDD -901.09R |
| >0.35 ADR | 20 | 40.0% [21.9-61.3] n=20 | 50.0% [29.9-70.1] n=20 | n=20 win 30.0% avg -0.377R PF 0.35 t=-2.1 maxDD -8.5R |

ORB conditioning - by break timing (30m OR):

| group | n | closes on side | both sides taken | sim 1R |
|---|---|---|---|---|
| break<=30min | 1458 | 49.7% [47.1-52.2] n=1458 | 91.2% [89.6-92.5] n=1458 | n=1458 win 41.3% avg -0.516R PF 0.34 t=-19.63 maxDD -754.26R |
| break>30min | 944 | 49.2% [46.0-52.3] n=944 | 86.5% [84.2-88.6] n=944 | n=944 win 46.1% avg -0.326R PF 0.52 t=-9.93 maxDD -306.73R |

ORB conditioning - by weekday (30m OR):

| group | n | closes on side | both sides taken | sim 1R |
|---|---|---|---|---|
| Fri | 480 | 50.4% [46.0-54.9] n=480 | 91.5% [88.6-93.6] n=480 | n=480 win 38.5% avg -0.554R PF 0.32 t=-12.31 maxDD -265.35R |
| Mon | 453 | 49.0% [44.4-53.6] n=453 | 84.3% [80.7-87.4] n=453 | n=453 win 47.5% avg -0.266R PF 0.58 t=-5.69 maxDD -124.83R |
| Thu | 500 | 46.6% [42.3-51.0] n=500 | 90.2% [87.3-92.5] n=500 | n=500 win 45.0% avg -0.417R PF 0.43 t=-9.17 maxDD -207.48R |
| Tue | 476 | 48.9% [44.5-53.4] n=476 | 90.8% [87.8-93.0] n=476 | n=476 win 42.0% avg -0.483R PF 0.37 t=-10.45 maxDD -228.74R |
| Wed | 493 | 52.3% [47.9-56.7] n=493 | 89.7% [86.7-92.0] n=493 | n=493 win 43.0% avg -0.477R PF 0.38 t=-10.34 maxDD -235.77R |

ORB conditioning - by vol regime (30m OR):

| group | n | closes on side | both sides taken | sim 1R |
|---|---|---|---|---|
| heavy | 209 | 48.8% [42.1-55.5] n=209 | 89.0% [84.0-92.6] n=209 | n=209 win 47.4% avg -0.338R PF 0.49 t=-4.91 maxDD -74.62R |
| normal | 1771 | 50.0% [47.7-52.4] n=1771 | 89.4% [87.9-90.8] n=1771 | n=1771 win 42.8% avg -0.447R PF 0.4 t=-18.6 maxDD -790.24R |
| quiet | 393 | 46.3% [41.4-51.3] n=393 | 89.3% [85.9-92.0] n=393 | n=393 win 43.5% avg -0.461R PF 0.39 t=-8.96 maxDD -182.81R |
| unknown | 29 | 62.1% [44.0-77.3] n=29 | 86.2% [69.4-94.5] n=29 | n=29 win 31.0% avg -0.607R PF 0.29 t=-3.41 maxDD -18.51R |

ORB conditioning - by news day (30m OR):

| group | n | closes on side | both sides taken | sim 1R |
|---|---|---|---|---|
| major news day | 999 | 49.7% [46.7-52.8] n=999 | 90.9% [88.9-92.5] n=999 | n=999 win 42.5% avg -0.484R PF 0.37 t=-15.12 maxDD -483.91R |
| no major news | 1368 | 49.3% [46.7-52.0] n=1368 | 88.2% [86.4-89.8] n=1368 | n=1368 win 43.9% avg -0.402R PF 0.44 t=-14.75 maxDD -550.96R |
| unknown | 35 | 45.7% [30.5-61.8] n=35 | 88.6% [74.0-95.5] n=35 | n=35 win 31.4% avg -0.770R PF 0.19 t=-4.72 maxDD -27.86R |

ORB conditioning - by year (30m OR):

| group | n | closes on side | both sides taken | sim 1R |
|---|---|---|---|---|
| 2016 | 232 | 50.0% [43.6-56.4] n=232 | 90.1% [85.6-93.3] n=232 | n=232 win 36.2% avg -0.521R PF 0.35 t=-8.06 maxDD -124.52R |
| 2017 | 253 | 53.8% [47.6-59.8] n=253 | 87.7% [83.1-91.2] n=253 | n=253 win 42.3% avg -0.393R PF 0.45 t=-6.36 maxDD -102.49R |
| 2018 | 247 | 50.2% [44.0-56.4] n=247 | 88.3% [83.6-91.7] n=247 | n=247 win 43.3% avg -0.355R PF 0.49 t=-5.56 maxDD -92.92R |
| 2019 | 183 | 43.2% [36.2-50.4] n=183 | 85.2% [79.4-89.7] n=183 | n=183 win 48.6% avg -0.343R PF 0.5 t=-4.5 maxDD -66.48R |
| 2020 | 157 | 49.7% [42.0-57.4] n=157 | 89.2% [83.3-93.1] n=157 | n=157 win 43.3% avg -0.376R PF 0.46 t=-4.69 maxDD -60.93R |
| 2021 | 147 | 55.8% [47.7-63.6] n=147 | 86.4% [79.9-91.0] n=147 | n=147 win 36.7% avg -0.567R PF 0.31 t=-6.98 maxDD -86.88R |
| 2022 | 249 | 49.0% [42.8-55.2] n=249 | 90.8% [86.5-93.8] n=249 | n=249 win 48.6% avg -0.345R PF 0.5 t=-5.25 maxDD -88.38R |
| 2023 | 256 | 48.4% [42.4-54.5] n=256 | 92.2% [88.2-94.9] n=256 | n=256 win 45.3% avg -0.434R PF 0.4 t=-6.94 maxDD -111.06R |
| 2024 | 257 | 48.2% [42.2-54.3] n=257 | 91.4% [87.4-94.3] n=257 | n=257 win 43.2% avg -0.538R PF 0.33 t=-8.32 maxDD -137.09R |
| 2025 | 257 | 51.4% [45.3-57.4] n=257 | 89.5% [85.1-92.7] n=257 | n=257 win 43.6% avg -0.477R PF 0.37 t=-7.53 maxDD -122.13R |
| 2026 | 164 | 43.3% [35.9-50.9] n=164 | 89.6% [84.0-93.4] n=164 | n=164 win 41.5% avg -0.547R PF 0.32 t=-6.92 maxDD -91.52R |

## 5. Impulse leg then fib pullback

Legs >= 0.12 ADR whose fib became drawable (23.6% pullback) within 240 min of the open. Depth = fraction of the leg given back (TradingView low->high fib shows 1 - depth).

**all legs**: n=12374, leg med 0.161 ADR (p25 0.137, p75 0.202, mean 0.18, n=12374), duration med 38.0 min (p25 13.0, p75 89.0, mean 57.0, n=12374). Continuation 69.6%, failed 30.3%.

| pullback reached | P(continuation to new extreme) | random-walk null (1-d) | RW null at actual bar close |
|---|---|---|---|
| 0.236 | 69.6% [68.8-70.4] n=12374 | 76.4% | 68.9% |
| 0.382 | 56.7% [55.7-57.8] n=8695 | 61.8% | 54.9% |
| 0.5 | 46.2% [45.0-47.3] n=6988 | 50.0% | 43.7% |
| 0.618 | 35.6% [34.4-36.8] n=5842 | 38.2% | 32.7% |
| 0.786 | 20.8% [19.7-22.0] n=4750 | 21.4% | 17.1% |

Deepest pullback that HELD (continuations only): 0.236-0.382: 42.7%, 0.382-0.5: 19.8%, 0.5-0.618: 13.3%, 0.618-0.786: 12.7%, 0.786-1.0: 11.5%

Extension reached after continuation: >= 1.1: 82.6%, >= 1.2: 70.3%, >= 1.272: 63.8%, >= 1.5: 48.6%, >= 1.618: 43.4%, >= 2.0: 32.6%

Trade sims (limit at depth, stop tight = +0.236 depth / at origin / origin+10%, targets old extreme / 1.272 / 1.618):

| sim | result |
|---|---|
| entry_0.382|stop_origin+10%|target_extreme | n=8695 win 61.9% avg -0.245R, gross -0.052R (t -6.53, cost 0.19R) PF 0.46 t=-30.47 maxDD -2128.15R |
| entry_0.382|stop_origin+10%|target_1.272 | n=8695 win 48.8% avg -0.259R, gross -0.067R (t -6.53, cost 0.19R) PF 0.58 t=-25.24 maxDD -2260.79R |
| entry_0.5|stop_origin+10%|target_extreme | n=6988 win 52.4% avg -0.271R, gross -0.039R (t -3.54, cost 0.23R) PF 0.54 t=-24.65 maxDD -1895.05R |
| entry_0.382|stop_origin+10%|target_1.618 | n=8695 win 38.2% avg -0.278R, gross -0.086R (t -6.89, cost 0.19R) PF 0.62 t=-22.27 maxDD -2426.28R |
| entry_0.382|stop_origin|target_extreme | n=8695 win 57.9% avg -0.287R, gross -0.063R (t -7.38, cost 0.22R) PF 0.44 t=-33.25 maxDD -2496.13R |
| entry_0.5|stop_origin+10%|target_1.272 | n=6988 win 41.2% avg -0.291R, gross -0.059R (t -4.35, cost 0.23R) PF 0.6 t=-21.54 maxDD -2036.23R |
| entry_0.5|stop_origin+10%|target_1.618 | n=6988 win 32.4% avg -0.306R, gross -0.074R (t -4.63, cost 0.23R) PF 0.63 t=-19.08 maxDD -2149.02R |
| entry_0.382|stop_origin|target_1.272 | n=8695 win 44.5% avg -0.307R, gross -0.083R (t -7.61, cost 0.22R) PF 0.55 t=-27.89 maxDD -2677.47R |
| entry_0.618|stop_origin+10%|target_extreme | n=5842 win 43.0% avg -0.309R, gross -0.018R (t -1.25, cost 0.29R) PF 0.58 t=-20.85 maxDD -1807.24R |
| entry_0.382|stop_origin|target_1.618 | n=8695 win 34.3% avg -0.327R, gross -0.103R (t -7.72, cost 0.22R) PF 0.59 t=-24.42 maxDD -2847.88R |
| entry_0.5|stop_origin|target_extreme | n=6988 win 47.5% avg -0.329R, gross -0.050R (t -4.2, cost 0.28R) PF 0.51 t=-27.39 maxDD -2299.26R |
| entry_0.618|stop_origin+10%|target_1.272 | n=5842 win 33.8% avg -0.329R, gross -0.038R (t -2.17, cost 0.29R) PF 0.61 t=-18.63 maxDD -1925.38R |
| entry_0.618|stop_origin+10%|target_1.618 | n=5842 win 26.5% avg -0.347R, gross -0.056R (t -2.74, cost 0.29R) PF 0.63 t=-16.82 maxDD -2030.84R |
| entry_0.5|stop_origin|target_1.272 | n=6988 win 36.3% avg -0.354R, gross -0.076R (t -5.18, cost 0.28R) PF 0.56 t=-24.13 maxDD -2483.75R |
| entry_0.5|stop_origin|target_1.618 | n=6988 win 28.1% avg -0.370R, gross -0.091R (t -5.24, cost 0.28R) PF 0.6 t=-21.19 maxDD -2596.56R |
| entry_0.618|stop_origin|target_extreme | n=5842 win 37.1% avg -0.395R, gross -0.028R (t -1.71, cost 0.37R) PF 0.54 t=-23.78 maxDD -2309.92R |
| entry_0.786|stop_origin+10%|target_extreme | n=4750 win 29.8% avg -0.403R, gross +0.043R (t 1.86, cost 0.45R) PF 0.6 t=-17.29 maxDD -1924.15R |
| entry_0.618|stop_origin|target_1.272 | n=5842 win 28.4% avg -0.421R, gross -0.055R (t -2.78, cost 0.37R) PF 0.57 t=-21.38 maxDD -2467.42R |
| entry_0.786|stop_origin+10%|target_1.272 | n=4750 win 23.3% avg -0.427R, gross +0.020R (t 0.74, cost 0.45R) PF 0.61 t=-15.86 maxDD -2040.55R |
| entry_0.618|stop_origin|target_1.618 | n=5842 win 21.9% avg -0.441R, gross -0.074R (t -3.25, cost 0.37R) PF 0.59 t=-19.19 maxDD -2587.18R |
| entry_0.786|stop_origin+10%|target_1.618 | n=4750 win 18.1% avg -0.455R, gross -0.009R (t -0.29, cost 0.45R) PF 0.62 t=-14.85 maxDD -2177.07R |
| entry_0.786|stop_tight|target_extreme | n=4750 win 24.5% avg -0.533R, gross +0.061R (t 2.25, cost 0.59R) PF 0.56 t=-19.66 maxDD -2541.01R |
| entry_0.786|stop_tight|target_1.272 | n=4750 win 18.7% avg -0.567R, gross +0.027R (t 0.86, cost 0.59R) PF 0.56 t=-18.21 maxDD -2710.24R |
| entry_0.786|stop_origin|target_extreme | n=4750 win 22.8% avg -0.590R, gross +0.065R (t 2.29, cost 0.66R) PF 0.54 t=-20.66 maxDD -2814.88R |
| entry_0.786|stop_tight|target_1.618 | n=4750 win 14.3% avg -0.604R, gross -0.010R (t -0.27, cost 0.59R) PF 0.56 t=-17.06 maxDD -2890.66R |
| entry_0.618|stop_tight|target_extreme | n=5842 win 27.3% avg -0.606R, gross -0.013R (t -0.6, cost 0.59R) PF 0.48 t=-28.55 maxDD -3541.39R |
| entry_0.786|stop_origin|target_1.272 | n=4750 win 17.4% avg -0.623R, gross +0.032R (t 0.97, cost 0.66R) PF 0.54 t=-19.01 maxDD -2980.56R |
| entry_0.618|stop_tight|target_1.272 | n=5842 win 20.0% avg -0.639R, gross -0.045R (t -1.81, cost 0.59R) PF 0.5 t=-25.43 maxDD -3733.37R |
| entry_0.5|stop_tight|target_extreme | n=6988 win 30.2% avg -0.649R, gross -0.058R (t -3.41, cost 0.59R) PF 0.42 t=-37.36 maxDD -4532.81R |
| entry_0.786|stop_origin|target_1.618 | n=4750 win 13.1% avg -0.664R, gross -0.009R (t -0.25, cost 0.66R) PF 0.54 t=-17.88 maxDD -3184.82R |
| entry_0.382|stop_tight|target_extreme | n=8695 win 35.1% avg -0.668R, gross -0.082R (t -6.1, cost 0.59R) PF 0.35 t=-48.74 maxDD -5804.16R |
| entry_0.618|stop_tight|target_1.618 | n=5842 win 14.7% avg -0.679R, gross -0.085R (t -2.94, cost 0.59R) PF 0.5 t=-23.37 maxDD -3967.72R |
| entry_0.5|stop_tight|target_1.272 | n=6988 win 21.1% avg -0.688R, gross -0.097R (t -4.66, cost 0.59R) PF 0.45 t=-32.67 maxDD -4804.6R |
| entry_0.382|stop_tight|target_1.272 | n=8695 win 23.7% avg -0.694R, gross -0.108R (t -6.27, cost 0.59R) PF 0.43 t=-39.85 maxDD -6035.65R |
| entry_0.5|stop_tight|target_1.618 | n=6988 win 15.6% avg -0.697R, gross -0.107R (t -4.29, cost 0.59R) PF 0.48 t=-27.82 maxDD -4871.73R |
| entry_0.382|stop_tight|target_1.618 | n=8695 win 16.5% avg -0.723R, gross -0.137R (t -6.6, cost 0.59R) PF 0.45 t=-34.42 maxDD -6296.56R |

**impulsive legs**: n=5261, leg med 0.159 ADR (p25 0.135, p75 0.203, mean 0.182, n=5261), duration med 13.0 min (p25 5.0, p75 22.0, mean 15.0, n=5261). Continuation 68.0%, failed 32.0%.

| pullback reached | P(continuation to new extreme) | random-walk null (1-d) | RW null at actual bar close |
|---|---|---|---|
| 0.236 | 68.0% [66.7-69.2] n=5261 | 76.4% | 67.2% |
| 0.382 | 56.7% [55.1-58.2] n=3887 | 61.8% | 54.0% |
| 0.5 | 47.0% [45.3-48.8] n=3180 | 50.0% | 43.2% |
| 0.618 | 37.5% [35.7-39.3] n=2694 | 38.2% | 32.4% |
| 0.786 | 22.7% [21.0-24.5] n=2178 | 21.4% | 16.7% |

Deepest pullback that HELD (continuations only): 0.236-0.382: 38.4%, 0.382-0.5: 19.8%, 0.5-0.618: 13.6%, 0.618-0.786: 14.4%, 0.786-1.0: 13.8%

Extension reached after continuation: >= 1.1: 81.2%, >= 1.2: 68.5%, >= 1.272: 62.1%, >= 1.5: 48.1%, >= 1.618: 43.2%, >= 2.0: 31.7%

**grind legs**: n=7113, leg med 0.162 ADR (p25 0.138, p75 0.202, mean 0.18, n=7113), duration med 78.0 min (p25 46.0, p75 128.0, mean 89.0, n=7113). Continuation 70.8%, failed 29.1%.

| pullback reached | P(continuation to new extreme) | random-walk null (1-d) | RW null at actual bar close |
|---|---|---|---|
| 0.236 | 70.8% [69.7-71.8] n=7113 | 76.4% | 70.1% |
| 0.382 | 56.8% [55.4-58.2] n=4808 | 61.8% | 55.6% |
| 0.5 | 45.4% [43.9-47.0] n=3808 | 50.0% | 44.1% |
| 0.618 | 34.0% [32.4-35.7] n=3148 | 38.2% | 33.0% |
| 0.786 | 19.3% [17.8-20.9] n=2572 | 21.4% | 17.4% |

Deepest pullback that HELD (continuations only): 0.236-0.382: 45.8%, 0.382-0.5: 19.9%, 0.5-0.618: 13.1%, 0.618-0.786: 11.4%, 0.786-1.0: 9.9%

Extension reached after continuation: >= 1.1: 83.6%, >= 1.2: 71.6%, >= 1.272: 65.1%, >= 1.5: 49.0%, >= 1.618: 43.6%, >= 2.0: 33.1%

**first leg of day only**: n=2529, leg med 0.142 ADR (p25 0.128, p75 0.168, mean 0.156, n=2529), duration med 63.0 min (p25 27.0, p75 116.0, mean 75.0, n=2529). Continuation 70.8%, failed 29.2%.

| pullback reached | P(continuation to new extreme) | random-walk null (1-d) | RW null at actual bar close |
|---|---|---|---|
| 0.236 | 70.8% [69.0-72.5] n=2529 | 76.4% | 69.5% |
| 0.382 | 59.0% [56.7-61.3] n=1804 | 61.8% | 55.7% |
| 0.5 | 48.6% [46.0-51.2] n=1437 | 50.0% | 44.7% |
| 0.618 | 38.2% [35.4-40.9] n=1195 | 38.2% | 33.7% |
| 0.786 | 22.9% [20.4-25.7] n=959 | 21.4% | 17.7% |

Deepest pullback that HELD (continuations only): 0.236-0.382: 40.5%, 0.382-0.5: 20.5%, 0.5-0.618: 13.5%, 0.618-0.786: 13.2%, 0.786-1.0: 12.3%

Extension reached after continuation: >= 1.1: 82.8%, >= 1.2: 70.9%, >= 1.272: 63.9%, >= 1.5: 48.5%, >= 1.618: 43.5%, >= 2.0: 31.8%

IS / OOS continuation given pullback reached:

| depth | IS | OOS |
|---|---|---|
| 0.236 | 69.2% n=7554 (null 68.5%) | 70.3% n=4820 (null 69.5%) |
| 0.382 | 56.6% n=5369 (null 54.6%) | 56.9% n=3326 (null 55.4%) |
| 0.5 | 46.2% n=4331 (null 43.5%) | 46.1% n=2657 (null 44.1%) |
| 0.618 | 36.2% n=3650 (null 32.7%) | 34.6% n=2192 (null 32.7%) |
| 0.786 | 21.7% n=2974 (null 17.1%) | 19.4% n=1776 (null 17.1%) |

Fib conditioning - by leg size:

| group | n | continuation (or P(cont|reached)) | best sim |
|---|---|---|---|
| 0.12-0.2 ADR | 9159 | n/a | entry_0.382|stop_origin+10%|target_extreme: n=6527 win 61.6% avg -0.271R, gross -0.056R (t -6.04, cost 0.21R) PF 0.42 t=-29.2 maxDD -1767.72R |
| 0.2-0.35 | 2893 | n/a | entry_0.382|stop_origin+10%|target_extreme: n=1945 win 63.1% avg -0.164R, gross -0.034R (t -2.0, cost 0.13R) PF 0.61 t=-9.75 maxDD -320.56R |
| >0.35 ADR | 322 | n/a | entry_0.618|stop_origin|target_1.618: n=162 win 26.5% avg -0.028R, gross +0.117R (t 0.8, cost 0.14R) PF 0.97 t=-0.19 maxDD -25.34R |

Fib conditioning - by regime:

| group | n | continuation (or P(cont|reached)) | best sim |
|---|---|---|---|
| quiet | 2301 | 69.1% [67.2-71.0] n=2301 | entry_0.382|stop_origin+10%|target_extreme: n=1641 win 62.6% avg -0.274R, gross -0.040R (t -2.2, cost 0.23R) PF 0.41 t=-14.83 maxDD -452.41R |
| normal | 8810 | 69.6% [68.6-70.6] n=8810 | entry_0.382|stop_origin+10%|target_extreme: n=6188 win 61.5% avg -0.246R, gross -0.058R (t -6.1, cost 0.19R) PF 0.46 t=-25.85 maxDD -1523.49R |
| heavy | 1144 | 69.9% [67.2-72.5] n=1144 | entry_0.382|stop_origin+10%|target_extreme: n=789 win 62.9% avg -0.183R, gross -0.037R (t -1.4, cost 0.15R) PF 0.57 t=-6.91 maxDD -148.65R |

Fib conditioning - by direction:

| group | n | continuation (or P(cont|reached)) | best sim |
|---|---|---|---|
| up_legs | 6464 | 70.9% [69.8-72.0] n=6464 | entry_0.382|stop_origin+10%|target_extreme: n=4519 win 63.3% avg -0.222R, gross -0.030R (t -2.74, cost 0.19R) PF 0.49 t=-20.06 maxDD -1004.62R |
| down_legs | 5910 | 68.2% [67.0-69.4] n=5910 | entry_0.382|stop_origin+10%|target_extreme: n=4176 win 60.3% avg -0.269R, gross -0.076R (t -6.55, cost 0.19R) PF 0.43 t=-23.11 maxDD -1126.39R |

Fib conditioning - by news day:

| group | n | continuation (or P(cont|reached)) | best sim |
|---|---|---|---|
| major news day | 4707 | 46.9% [45.0-48.8] n=2679 (RW null 50.0%) | entry_0.382|stop_origin+10%|target_extreme: n=3299 win 61.8% avg -0.246R, gross -0.053R (t -4.1, cost 0.19R) PF 0.46 t=-18.87 maxDD -813.6R |
| no major news | 7544 | 45.9% [44.4-47.4] n=4250 (RW null 50.0%) | entry_0.382|stop_origin+10%|target_extreme: n=5314 win 62.0% avg -0.242R, gross -0.050R (t -4.92, cost 0.19R) PF 0.47 t=-23.55 maxDD -1284.39R |

Fib by year (continuation rate, best 0.382-entry sim):

| year | n | continuation | entry 0.382, stop origin+10%, target 1.618 |
|---|---|---|---|
| 2016 | 1311 | 66.7% [64.1-69.2] n=1311 | n=963 win 39.1% avg -0.229R, gross -0.062R (t -1.66, cost 0.17R) PF 0.68 t=-6.07 maxDD -227.49R |
| 2017 | 1337 | 72.2% [69.7-74.5] n=1337 | n=903 win 35.7% avg -0.322R, gross -0.145R (t -3.8, cost 0.18R) PF 0.57 t=-8.43 maxDD -291.88R |
| 2018 | 1113 | 71.7% [69.0-74.3] n=1113 | n=777 win 39.6% avg -0.216R, gross -0.051R (t -1.21, cost 0.17R) PF 0.69 t=-5.13 maxDD -177.44R |
| 2019 | 944 | 66.7% [63.7-69.7] n=944 | n=695 win 40.0% avg -0.316R, gross -0.044R (t -1.0, cost 0.27R) PF 0.59 t=-7.07 maxDD -222.24R |
| 2020 | 1237 | 67.5% [64.8-70.1] n=1237 | n=902 win 36.6% avg -0.305R, gross -0.125R (t -3.25, cost 0.18R) PF 0.59 t=-7.93 maxDD -276.47R |
| 2021 | 1121 | 69.3% [66.6-71.9] n=1121 | n=785 win 35.9% avg -0.363R, gross -0.140R (t -3.4, cost 0.22R) PF 0.54 t=-8.83 maxDD -286.52R |
| 2022 | 1044 | 72.6% [69.8-75.2] n=1044 | n=698 win 41.0% avg -0.163R, gross -0.021R (t -0.47, cost 0.14R) PF 0.76 t=-3.66 maxDD -118.23R |
| 2023 | 868 | 73.0% [70.0-75.9] n=868 | n=567 win 41.3% avg -0.201R, gross -0.014R (t -0.27, cost 0.19R) PF 0.71 t=-4.07 maxDD -120.58R |
| 2024 | 995 | 68.9% [66.0-71.7] n=995 | n=721 win 37.6% avg -0.339R, gross -0.101R (t -2.33, cost 0.24R) PF 0.56 t=-7.84 maxDD -249.44R |
| 2025 | 1452 | 68.8% [66.4-71.1] n=1452 | n=1016 win 38.3% avg -0.254R, gross -0.084R (t -2.3, cost 0.17R) PF 0.65 t=-6.95 maxDD -257.71R |
| 2026 | 952 | 68.9% [65.9-71.8] n=952 | n=668 win 36.7% avg -0.346R, gross -0.125R (t -2.81, cost 0.22R) PF 0.55 t=-7.73 maxDD -229.73R |

## 6. Session VWAP and bands

| event | n | back to VWAP within 60m | within 120m | by day end |
|---|---|---|---|---|
| 1.0_sigma | 2736 | 40.3% [38.5-42.1] n=2736 | 61.9% [60.0-63.7] n=2736 | 98.5% [98.0-98.9] n=2736 |
| 2.0_sigma | 2734 | 34.2% [32.4-36.0] n=2734 | 56.1% [54.2-58.0] n=2734 | 98.1% [97.5-98.5] n=2734 |
| baseline_random_bar | 2736 | 36.3% [34.5-38.1] n=2736 | 48.1% [46.2-50.0] n=2736 | 69.6% [67.8-71.3] n=2736 |

| checkpoint | days with abs(z) >= 1.5 | closes even further from VWAP | closes back through VWAP | z p10/p90 |
|---|---|---|---|---|
| minute 60 | 852 | 44.4% [41.1-47.7] n=852 | 51.1% [47.7-54.4] n=852 | -1.57 / 2.03 |
| minute 120 | 843 | 42.3% [39.1-45.7] n=843 | 49.6% [46.2-53.0] n=843 | -1.73 / 1.88 |
| minute 240 | 880 | 37.4% [34.3-40.6] n=880 | 52.3% [49.0-55.6] n=880 | -1.78 / 1.82 |

- VWAP bounce after a 1.5-sigma push (race +1 sigma vs -1 sigma): 50.7% [48.8-52.6] n=2689 p=0.464 (RW null 48.4%); sim: n=2689 win 49.6% avg -0.390R, gross +0.042R (t 1.96, cost 0.43R) PF 0.47 t=-15.72 maxDD -1049.45R
- Fade 2 sigma back to VWAP (stop 3.5 sigma): n=2734 win 31.7% avg -1.446R, gross +0.108R (t 1.77, cost 1.55R) PF 0.3 t=-4.37 maxDD -3956.57R
- Side of VWAP predicts rest of day, at_london_open_0700UK: 49.7% [47.8-51.6] n=2733 p=0.76
- Side of VWAP predicts rest of day, at_ny_open_1430UK: 50.6% [48.7-52.5] n=2730 p=0.528
- Side of VWAP predicts rest of day, vwap_slope_h1_to_h2_vs_rest: 49.8% [47.9-51.7] n=2732 p=0.833

| year | fade 2 sigma | VWAP bounce |
|---|---|---|
| 2016 | n=247 win 23.9% avg -1.380R PF 0.25 t=-5.84 maxDD -341.82R | n=242 win 56.2% avg -0.160R PF 0.72 t=-2.32 maxDD -41.56R |
| 2017 | n=257 win 30.0% avg -1.364R PF 0.31 t=-3.55 maxDD -352.33R | n=250 win 48.8% avg -0.367R PF 0.48 t=-5.29 maxDD -94.4R |
| 2018 | n=258 win 34.5% avg -1.178R PF 0.39 t=-2.83 maxDD -320.08R | n=251 win 51.8% avg -0.299R PF 0.55 t=-4.21 maxDD -76.25R |
| 2019 | n=257 win 32.7% avg -1.547R PF 0.32 t=-2.25 maxDD -397.65R | n=257 win 47.9% avg -0.530R PF 0.37 t=-5.8 maxDD -137.37R |
| 2020 | n=259 win 34.4% avg -1.140R PF 0.32 t=-2.0 maxDD -303.41R | n=255 win 50.2% avg -0.368R PF 0.49 t=-5.16 maxDD -93.4R |
| 2021 | n=259 win 35.5% avg -0.674R PF 0.45 t=-5.62 maxDD -189.03R | n=254 win 49.6% avg -0.431R PF 0.44 t=-4.61 maxDD -111.07R |
| 2022 | n=258 win 30.6% avg -0.621R PF 0.47 t=-4.82 maxDD -165.3R | n=253 win 47.0% avg -0.311R PF 0.55 t=-4.39 maxDD -81.84R |
| 2023 | n=258 win 30.6% avg -0.833R PF 0.37 t=-6.84 maxDD -225.24R | n=254 win 50.0% avg -0.453R PF 0.44 t=-4.09 maxDD -116.48R |
| 2024 | n=259 win 33.6% avg -3.888R PF 0.19 t=-1.21 maxDD -1042.04R | n=256 win 46.1% avg -0.580R PF 0.32 t=-7.52 maxDD -147.62R |
| 2025 | n=258 win 32.6% avg -1.683R PF 0.26 t=-2.47 maxDD -437.56R | n=257 win 49.4% avg -0.361R PF 0.49 t=-5.15 maxDD -93.12R |
| 2026 | n=164 win 29.3% avg -1.674R PF 0.24 t=-2.86 maxDD -276.39R | n=160 win 49.4% avg -0.430R PF 0.44 t=-4.22 maxDD -68.97R |

## 7. Asia range (23:00-07:00 UK) into London / NY

Asia range: med 0.341 ADR (p25 0.268, p75 0.447, mean 0.395, n=2736). Outcomes: high only 26.1%, low only 26.3%, both 46.8%, neither 0.8%. Minutes from 07:00 to first break: med 44.0 (p25 12.0, p75 86.0, mean 76.0, n=2715).

After the first break: day closes beyond the broken side 51.6% [49.8-53.5] n=2715; closes back inside at some point 95.2% [94.4-96.0] n=2715; opposite side also taken 47.2% [45.3-49.1] n=2715; MFE med 1.089 ranges (p25 0.504, p75 2.041, mean 1.492, n=2715).

- Breakout sim (first close beyond, stop mid-range, target 1x range): n=2715 win 37.1% avg -0.157R, gross -0.034R (t -1.39, cost 0.12R) PF 0.77 t=-6.46 maxDD -431.45R
- Sweep-fade sim (first close back inside after a break, stop beyond sweep extreme, target other side; avg RR 4.285): n=2586 win 24.9% avg -0.208R, gross +0.104R (t 2.33, cost 0.31R) PF 0.79 t=-4.63 maxDD -573.43R
- IS: breakout n=1622 win 37.1% avg -0.163R PF 0.77 t=-5.2 maxDD -274.75R; sweep-fade n=1544 win 23.7% avg -0.295R PF 0.71 t=-5.39 maxDD -475.25R
- OOS: breakout n=1093 win 37.1% avg -0.148R PF 0.79 t=-3.85 maxDD -175.19R; sweep-fade n=1042 win 26.8% avg -0.078R PF 0.92 t=-1.03 maxDD -107.89R

Asia conditioning - by asia range size:

| group | n | closes beyond | opposite also taken | breakout sim | sweep-fade sim |
|---|---|---|---|---|---|
| 0.25-0.40 | 1299 | 51.7% [48.9-54.4] n=1299 | 51.1% [48.4-53.8] n=1299 | n=1299 win 35.5% avg -0.188R PF 0.74 t=-5.3 maxDD -248.38R | n=1234 win 24.1% avg -0.232R PF 0.77 t=-3.6 maxDD -348.26R |
| 0.40-0.60 | 658 | 49.7% [45.9-53.5] n=658 | 37.2% [33.6-41.0] n=658 | n=658 win 36.3% avg -0.131R PF 0.81 t=-2.64 maxDD -93.86R | n=634 win 23.0% avg -0.138R PF 0.86 t=-1.41 maxDD -134.47R |
| <0.25 ADR | 499 | 53.1% [48.7-57.4] n=499 | 62.9% [58.6-67.0] n=499 | n=499 win 38.7% avg -0.188R PF 0.74 t=-3.29 maxDD -101.97R | n=476 win 30.9% avg -0.280R PF 0.72 t=-3.13 maxDD -138.65R |
| >0.60 ADR | 259 | 53.7% [47.6-59.6] n=259 | 22.4% [17.7-27.9] n=259 | n=259 win 44.0% avg -0.006R PF 0.99 t=-0.08 maxDD -28.09R | n=242 win 22.7% avg -0.119R PF 0.87 t=-0.77 maxDD -56.44R |

Asia conditioning - by break timing:

| group | n | closes beyond | opposite also taken | breakout sim | sweep-fade sim |
|---|---|---|---|---|---|
| 60-180min | 765 | 51.5% [48.0-55.0] n=765 | 45.4% [41.9-48.9] n=765 | n=765 win 36.3% avg -0.178R PF 0.74 t=-3.95 maxDD -141.83R | n=727 win 26.0% avg -0.221R PF 0.77 t=-2.85 maxDD -229.45R |
| >180min | 298 | 51.0% [45.4-56.6] n=298 | 24.8% [20.3-30.0] n=298 | n=298 win 40.6% avg -0.093R PF 0.84 t=-1.38 maxDD -38.83R | n=271 win 22.5% avg -0.428R PF 0.56 t=-3.96 maxDD -118.77R |
| break<=60min | 1652 | 51.8% [49.4-54.2] n=1652 | 52.1% [49.6-54.5] n=1652 | n=1652 win 36.8% avg -0.158R PF 0.78 t=-4.99 maxDD -267.14R | n=1588 win 24.9% avg -0.164R PF 0.84 t=-2.68 maxDD -302.33R |

Asia conditioning - by weekday:

| group | n | closes beyond | opposite also taken | breakout sim | sweep-fade sim |
|---|---|---|---|---|---|
| Fri | 540 | 53.5% [49.3-57.7] n=540 | 50.7% [46.5-54.9] n=540 | n=540 win 37.6% avg -0.162R PF 0.77 t=-3.0 maxDD -99.44R | n=512 win 23.4% avg -0.310R PF 0.7 t=-3.15 maxDD -168.12R |
| Mon | 527 | 49.0% [44.7-53.2] n=527 | 38.3% [34.3-42.6] n=527 | n=527 win 37.8% avg -0.143R PF 0.79 t=-2.65 maxDD -93.61R | n=505 win 25.3% avg -0.155R PF 0.84 t=-1.45 maxDD -102.86R |
| Thu | 550 | 54.7% [50.5-58.8] n=550 | 46.2% [42.1-50.4] n=550 | n=550 win 37.3% avg -0.136R PF 0.8 t=-2.49 maxDD -83.11R | n=526 win 25.7% avg -0.197R PF 0.8 t=-2.07 maxDD -130.5R |
| Tue | 550 | 46.7% [42.6-50.9] n=550 | 51.1% [46.9-55.2] n=550 | n=550 win 37.3% avg -0.150R PF 0.78 t=-2.76 maxDD -81.39R | n=516 win 25.4% avg -0.241R PF 0.75 t=-2.47 maxDD -152.34R |
| Wed | 548 | 54.2% [50.0-58.3] n=548 | 49.3% [45.1-53.4] n=548 | n=548 win 35.6% avg -0.192R PF 0.73 t=-3.53 maxDD -110.2R | n=527 win 24.9% avg -0.137R PF 0.86 t=-1.33 maxDD -116.43R |

Asia conditioning - by vol regime:

| group | n | closes beyond | opposite also taken | breakout sim | sweep-fade sim |
|---|---|---|---|---|---|
| heavy | 227 | 49.8% [43.3-56.2] n=227 | 42.7% [36.5-49.2] n=227 | n=227 win 36.6% avg -0.153R PF 0.78 t=-1.81 maxDD -40.78R | n=220 win 24.5% avg -0.357R PF 0.63 t=-2.81 maxDD -102.37R |
| normal | 2002 | 52.1% [50.0-54.3] n=2002 | 46.8% [44.6-49.0] n=2002 | n=2002 win 37.7% avg -0.142R PF 0.79 t=-5.02 maxDD -296.06R | n=1900 win 24.9% avg -0.190R PF 0.81 t=-3.59 maxDD -380.09R |
| quiet | 456 | 50.2% [45.6-54.8] n=456 | 50.9% [46.3-55.4] n=456 | n=456 win 34.9% avg -0.228R PF 0.69 t=-3.9 maxDD -105.53R | n=438 win 24.7% avg -0.247R PF 0.77 t=-2.19 maxDD -143.76R |
| unknown | 30 | 53.3% [36.1-69.8] n=30 | 50.0% [33.2-66.8] n=30 | n=30 win 36.7% avg -0.085R PF 0.88 t=-0.35 maxDD -6.11R | n=28 win 35.7% avg +0.367R PF 1.51 t=0.85 maxDD -6.99R |

Asia conditioning - by news day:

| group | n | closes beyond | opposite also taken | breakout sim | sweep-fade sim |
|---|---|---|---|---|---|
| major news day | 1085 | 52.9% [49.9-55.9] n=1085 | 50.2% [47.3-53.2] n=1085 | n=1085 win 37.4% avg -0.149R PF 0.79 t=-3.84 maxDD -175.07R | n=1044 win 24.8% avg -0.245R PF 0.75 t=-3.62 maxDD -290.68R |
| no major news | 1595 | 51.0% [48.6-53.5] n=1595 | 45.1% [42.7-47.5] n=1595 | n=1595 win 36.9% avg -0.161R PF 0.77 t=-5.11 maxDD -261.23R | n=1508 win 24.9% avg -0.182R PF 0.82 t=-3.03 maxDD -310.36R |
| unknown | 35 | 40.0% [25.6-56.4] n=35 | 48.6% [33.0-64.4] n=35 | n=35 win 37.1% avg -0.226R PF 0.69 t=-1.06 maxDD -9.84R | n=34 win 29.4% avg -0.180R PF 0.83 t=-0.41 maxDD -17.19R |

Asia conditioning - by year:

| group | n | closes beyond | opposite also taken | breakout sim | sweep-fade sim |
|---|---|---|---|---|---|
| 2016 | 245 | 54.3% [48.0-60.4] n=245 | 46.9% [40.8-53.2] n=245 | n=245 win 37.1% avg -0.135R PF 0.8 t=-1.69 maxDD -36.98R | n=230 win 26.5% avg -0.055R PF 0.94 t=-0.37 maxDD -34.04R |
| 2017 | 251 | 56.6% [50.4-62.6] n=251 | 43.8% [37.8-50.0] n=251 | n=251 win 40.2% avg -0.105R PF 0.84 t=-1.34 maxDD -37.66R | n=241 win 25.7% avg -0.143R PF 0.85 t=-0.97 maxDD -48.96R |
| 2018 | 257 | 44.4% [38.4-50.5] n=257 | 52.1% [46.0-58.2] n=257 | n=257 win 36.6% avg -0.152R PF 0.78 t=-1.93 maxDD -48.34R | n=245 win 24.5% avg -0.361R PF 0.62 t=-3.06 maxDD -96.92R |
| 2019 | 258 | 46.5% [40.5-52.6] n=258 | 56.2% [50.1-62.1] n=258 | n=258 win 29.5% avg -0.384R PF 0.53 t=-5.07 maxDD -103.76R | n=255 win 20.4% avg -0.621R PF 0.47 t=-5.19 maxDD -157.48R |
| 2020 | 257 | 55.6% [49.5-61.6] n=257 | 47.9% [41.8-54.0] n=257 | n=257 win 40.1% avg -0.075R PF 0.89 t=-0.93 maxDD -27.2R | n=238 win 25.2% avg -0.147R PF 0.84 t=-0.99 maxDD -56.8R |
| 2021 | 258 | 51.9% [45.9-58.0] n=258 | 44.6% [38.6-50.7] n=258 | n=258 win 37.6% avg -0.175R PF 0.75 t=-2.22 maxDD -64.22R | n=242 win 22.3% avg -0.380R PF 0.64 t=-2.71 maxDD -91.72R |
| 2022 | 255 | 54.5% [48.4-60.5] n=255 | 42.7% [36.8-48.9] n=255 | n=255 win 38.0% avg -0.100R PF 0.85 t=-1.25 maxDD -31.45R | n=245 win 23.3% avg -0.189R PF 0.8 t=-1.31 maxDD -63.18R |
| 2023 | 258 | 51.2% [45.1-57.2] n=258 | 49.6% [43.6-55.7] n=258 | n=258 win 35.7% avg -0.176R PF 0.75 t=-2.21 maxDD -47.74R | n=246 win 25.2% avg -0.287R PF 0.71 t=-2.16 maxDD -69.53R |
| 2024 | 259 | 49.0% [43.0-55.1] n=259 | 51.7% [45.7-57.8] n=259 | n=259 win 37.5% avg -0.185R PF 0.74 t=-2.33 maxDD -54.03R | n=249 win 27.7% avg -0.057R PF 0.94 t=-0.34 maxDD -68.67R |
| 2025 | 254 | 51.6% [45.5-57.7] n=254 | 40.6% [34.7-46.7] n=254 | n=254 win 35.8% avg -0.133R PF 0.8 t=-1.68 maxDD -40.19R | n=240 win 28.3% avg +0.103R PF 1.11 t=0.61 maxDD -37.41R |
| 2026 | 163 | 53.4% [45.7-60.9] n=163 | 39.9% [32.7-47.5] n=163 | n=163 win 41.7% avg -0.069R PF 0.89 t=-0.69 maxDD -18.67R | n=155 win 25.8% avg -0.061R PF 0.94 t=-0.28 maxDD -36.04R |

## 8. Prior-day / prior-week levels

| level | days | distance from open (ADR, med) | touched | min to touch (med) | reject first (0.15 ADR race) | break first | day closes beyond after touch |
|---|---|---|---|---|---|---|---|
| PDH | 2713 | 0.454 | 48.1% [46.3-50.0] n=2713 | 598.0 | 46.0% [43.3-48.7] n=1290 | 54.0% [51.3-56.7] n=1290 | 49.2% [46.5-51.9] n=1306 |
| PDL | 2708 | 0.419 | 48.5% [46.6-50.4] n=2708 | 616.0 | 47.9% [45.2-50.6] n=1297 | 52.1% [49.4-54.8] n=1297 | 51.1% [48.4-53.8] n=1314 |
| PDC | 1355 | 0.041 | 94.5% [93.2-95.6] n=1355 | 23.0 | 51.4% [48.7-54.2] n=1281 | 48.6% [45.8-51.3] n=1281 | 49.8% [47.1-52.5] n=1281 |
| PWH | 2719 | 1.233 | 21.8% [20.3-23.4] n=2719 | 714.0 | 45.7% [41.7-49.8] n=580 | 54.3% [50.2-58.3] n=580 | 53.2% [49.2-57.2] n=592 |
| PWL | 2717 | 1.149 | 22.1% [20.6-23.7] n=2717 | 662.0 | 48.7% [44.7-52.8] n=591 | 51.3% [47.2-55.3] n=591 | 51.2% [47.3-55.2] n=601 |

Touch rate by distance from the open:

| level | distance | n | touched | reject first |
|---|---|---|---|---|
| PDH | <0.25 ADR | 745 | 84.2% [81.4-86.6] n=745 | 46.8% [42.9-50.7] n=626 |
| PDH | 0.25-0.5 | 723 | 56.3% [52.7-59.9] n=723 | 48.4% [43.5-53.3] n=403 |
| PDH | 0.5-1.0 | 857 | 28.6% [25.7-31.7] n=857 | 39.6% [33.5-45.9] n=235 |
| PDH | >1.0 ADR | 388 | 7.0% [4.8-9.9] n=388 | 46.2% [28.8-64.5] n=26 |
| PDL | <0.25 ADR | 826 | 81.7% [78.9-84.2] n=826 | 51.7% [47.9-55.5] n=673 |
| PDL | 0.25-0.5 | 734 | 52.9% [49.2-56.4] n=734 | 45.9% [41.0-50.9] n=379 |
| PDL | 0.5-1.0 | 783 | 28.4% [25.3-31.6] n=783 | 38.4% [32.2-45.1] n=216 |
| PDL | >1.0 ADR | 365 | 7.9% [5.6-11.2] n=365 | 55.2% [37.5-71.6] n=29 |
| PDC | <0.25 ADR | 1283 | 96.6% [95.5-97.5] n=1283 | 51.5% [48.7-54.2] n=1240 |
| PDC | 0.25-0.5 | 44 | 68.2% [53.4-80.0] n=44 | 46.7% [30.2-63.9] n=30 |
| PWH | <0.25 ADR | 260 | 83.8% [78.9-87.8] n=260 | 45.4% [38.9-52.0] n=216 |
| PWH | 0.25-0.5 | 306 | 57.8% [52.2-63.2] n=306 | 43.6% [36.4-51.1] n=172 |
| PWH | 0.5-1.0 | 580 | 26.2% [22.8-29.9] n=580 | 45.0% [37.2-53.0] n=149 |
| PWH | >1.0 ADR | 1573 | 2.9% [2.1-3.8] n=1573 | 58.1% [43.3-71.6] n=43 |
| PWL | <0.25 ADR | 293 | 85.0% [80.4-88.6] n=293 | 48.2% [42.1-54.4] n=249 |
| PWL | 0.25-0.5 | 310 | 49.7% [44.1-55.2] n=310 | 51.3% [43.4-59.1] n=152 |
| PWL | 0.5-1.0 | 606 | 24.9% [21.6-28.5] n=606 | 43.4% [35.7-51.6] n=145 |
| PWL | >1.0 ADR | 1508 | 3.1% [2.4-4.1] n=1508 | 60.0% [45.5-73.0] n=45 |

## 9. First candle of the day, by timeframe

| TF | n | rest of day same direction | opposite extreme holds all day | day extends beyond candle | extension (candle ranges, med) | candle range (ADR, med) |
|---|---|---|---|---|---|---|
| 5m | 2544 | 49.5% [47.6-51.5] n=2542 p=0.648 | 2.7% [2.1-3.4] n=2544 | 98.6% [98.0-99.0] n=2544 | 12.485 | 0.031 |
| 15m | 2446 | 49.4% [47.4-51.3] n=2443 p=0.544 | 3.8% [3.1-4.6] n=2446 | 97.1% [96.4-97.7] n=2446 | 6.933 | 0.056 |
| 30m | 2351 | 50.3% [48.3-52.4] n=2350 p=0.757 | 5.4% [4.6-6.4] n=2351 | 96.7% [95.9-97.4] n=2351 | 5.692 | 0.07 |
| 60m | 2368 | 48.9% [46.9-50.9] n=2365 p=0.304 | 8.3% [7.3-9.5] n=2368 | 95.8% [94.9-96.5] n=2368 | 4.096 | 0.092 |
| 240m | 2719 | 49.5% [47.6-51.3] n=2709 p=0.591 | 21.6% [20.1-23.2] n=2719 | 90.4% [89.3-91.5] n=2719 | 1.48 | 0.218 |

| TF | body ratio | n | rest same | opposite extreme holds |
|---|---|---|---|---|
| 5m | doji <0.3 | 718 | 49.7% [46.1-53.4] n=718 | 1.9% [1.2-3.2] n=718 |
| 5m | 0.3-0.6 | 773 | 45.9% [42.4-49.4] n=773 | 2.8% [1.9-4.3] n=773 |
| 5m | strong >0.6 | 1051 | 52.0% [49.0-55.1] n=1051 | 3.0% [2.2-4.3] n=1051 |
| 15m | doji <0.3 | 882 | 49.9% [46.6-53.2] n=882 | 3.1% [2.1-4.4] n=882 |
| 15m | 0.3-0.6 | 813 | 49.0% [45.5-52.4] n=813 | 3.6% [2.5-5.1] n=813 |
| 15m | strong >0.6 | 748 | 49.2% [45.6-52.8] n=748 | 4.8% [3.5-6.6] n=748 |
| 30m | doji <0.3 | 982 | 50.6% [47.5-53.7] n=982 | 5.0% [3.8-6.5] n=982 |
| 30m | 0.3-0.6 | 820 | 51.7% [48.3-55.1] n=820 | 5.4% [4.0-7.1] n=820 |
| 30m | strong >0.6 | 548 | 47.8% [43.7-52.0] n=548 | 6.4% [4.6-8.8] n=548 |
| 60m | doji <0.3 | 993 | 48.8% [45.7-51.9] n=993 | 6.4% [5.1-8.1] n=993 |
| 60m | 0.3-0.6 | 862 | 50.1% [46.8-53.4] n=862 | 8.5% [6.8-10.5] n=862 |
| 60m | strong >0.6 | 510 | 47.1% [42.8-51.4] n=510 | 11.8% [9.3-14.9] n=510 |
| 240m | doji <0.3 | 893 | 53.3% [50.0-56.6] n=893 | 15.6% [13.3-18.1] n=893 |
| 240m | 0.3-0.6 | 1005 | 48.4% [45.3-51.4] n=1005 | 21.0% [18.6-23.6] n=1005 |
| 240m | strong >0.6 | 811 | 46.6% [43.2-50.1] n=811 | 28.9% [25.8-32.1] n=811 |

| TF | candle range | n | rest same | opposite extreme holds |
|---|---|---|---|---|
| 5m | small <0.1 ADR | 2385 | 49.4% [47.3-51.4] n=2385 | 2.2% [1.7-2.9] n=2385 |
| 5m | 0.1-0.2 | 133 | 50.4% [42.0-58.7] n=133 | 7.5% [4.1-13.3] n=133 |
| 15m | small <0.1 ADR | 2031 | 49.1% [46.9-51.3] n=2031 | 2.7% [2.1-3.5] n=2031 |
| 15m | 0.1-0.2 | 348 | 51.1% [45.9-56.4] n=348 | 6.3% [4.2-9.4] n=348 |
| 15m | 0.2-0.35 | 49 | 55.1% [41.3-68.1] n=49 | 22.4% [13.0-35.9] n=49 |
| 30m | small <0.1 ADR | 1739 | 50.4% [48.0-52.7] n=1739 | 3.8% [3.0-4.8] n=1739 |
| 30m | 0.1-0.2 | 521 | 49.7% [45.4-54.0] n=521 | 8.1% [6.0-10.7] n=521 |
| 30m | 0.2-0.35 | 70 | 58.6% [46.9-69.4] n=70 | 18.6% [11.2-29.2] n=70 |
| 60m | small <0.1 ADR | 1361 | 49.5% [46.9-52.2] n=1361 | 6.5% [5.3-8.0] n=1361 |
| 60m | 0.1-0.2 | 830 | 48.7% [45.3-52.1] n=830 | 8.8% [7.1-10.9] n=830 |
| 60m | 0.2-0.35 | 135 | 48.1% [39.9-56.5] n=135 | 17.0% [11.6-24.3] n=135 |
| 60m | large >0.35 | 39 | 35.9% [22.7-51.6] n=39 | 30.8% [18.6-46.4] n=39 |
| 240m | small <0.1 ADR | 38 | 55.3% [39.7-69.9] n=38 | 21.1% [11.1-36.3] n=38 |
| 240m | 0.1-0.2 | 1060 | 50.3% [47.3-53.3] n=1060 | 13.5% [11.6-15.7] n=1060 |
| 240m | 0.2-0.35 | 1210 | 47.8% [45.0-50.6] n=1210 | 21.8% [19.6-24.2] n=1210 |
| 240m | large >0.35 | 401 | 51.9% [47.0-56.7] n=401 | 42.1% [37.4-47.0] n=401 |
