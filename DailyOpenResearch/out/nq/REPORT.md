# Daily-Open research: Nasdaq (NAS100)

Data: 3,693,815 M1 bars, 2016-01-04 to 2026-08-20, 2744 anchored days. Anchor `broker` = 17:00 America/New_York. Median ADR20 = 209.9. Round-trip cost assumed = 1.5 (price units). Major-news days flagged: 1026 (USD).

All distances are in ADR units (trailing 20-day median daily range, strictly prior) unless stated. R = risk multiple net of cost. CI = Wilson 95%. 'p' = two-sided binomial test against 50%.

## 1. Which open? Anchor comparison

| anchor | days | first-60m share of day range (median) | day high/low set in first 60m | first-60m direction = day close |
|---|---|---|---|---|
| broker | 2724 | 0.116 | 18.2% [16.8-19.7] n=2724 | 53.8% [51.9-55.7] n=2724 |
| london23 | 2724 | 0.114 | 17.7% [16.3-19.2] n=2724 | 53.5% [51.6-55.4] n=2724 |
| utc22 | 2735 | 0.116 | 18.2% [16.8-19.7] n=2735 | 53.9% [52.0-55.7] n=2735 |
| london00 | 2735 | 0.102 | 15.8% [14.4-17.2] n=2735 | 52.2% [50.3-54.0] n=2735 |
| tokyo | 2735 | 0.125 | 18.9% [17.5-20.4] n=2735 | 54.7% [52.8-56.5] n=2735 |
| london08 | 2732 | 0.174 | 25.5% [23.9-27.1] n=2732 | 55.9% [54.1-57.8] n=2732 |

## 2. Where is the volatility? (anchor = broker open)

| window after open | share of day range (median) | day high or low inside window | uniform expectation |
|---|---|---|---|
| first 5m | 0.053 | 9.4% [8.4-10.6] n=2724 | 0.7% |
| first 15m | 0.076 | 12.4% [11.3-13.7] n=2724 | 2.2% |
| first 30m | 0.094 | 15.0% [13.7-16.4] n=2724 | 4.3% |
| first 60m | 0.116 | 18.2% [16.8-19.7] n=2724 | 8.5% |
| first 120m | 0.158 | 23.7% [22.1-25.3] n=2724 | 16.6% |
| first 240m | 0.253 | 35.8% [34.0-37.6] n=2724 | 31.8% |
| shuffled-returns null, first 60m | | 27.4% [25.7-29.1] n=2724 | |
| control: last 60m | 0.129 | 21.8% [20.3-23.4] n=2724 | |
| control: interior 60m at 6h | 0.076 | 1.6% [1.2-2.2] n=2723 | |

Mean 1-minute true range in ADR units, by 15-minute block after the open (first 8h):

| 0h00 | 0h15 | 0h30 | 0h45 | 1h00 | 1h15 | 1h30 | 1h45 | 2h00 | 2h15 | 2h30 | 2h45 | 3h00 | 3h15 | 3h30 | 3h45 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 19.7 | 12.8 | 11.9 | 11.0 | 13.3 | 11.7 | 11.7 | 12.2 | 17.8 | 15.6 | 15.2 | 14.2 | 15.0 | 14.9 | 15.8 | 13.9 |
| 4h00 | 4h15 | 4h30 | 4h45 | 5h00 | 5h15 | 5h30 | 5h45 | 6h00 | 6h15 | 6h30 | 6h45 | 7h00 | 7h15 | 7h30 | 7h45 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 13.4 | 12.2 | 12.0 | 10.9 | 10.7 | 10.1 | 10.2 | 9.3 | 10.0 | 9.4 | 9.8 | 9.4 | 12.2 | 11.0 | 11.8 | 11.6 |

(values x1000; e.g. 20 = a 1-minute bar moves 2% of a day's range on average)

Median 60-minute range by UK clock hour (price units):

| 00 | 01 | 02 | 03 | 04 | 05 | 06 | 07 | 08 | 09 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 18.4 | 22.6 | 20.4 | 16.2 | 13.4 | 13.6 | 17.85 | 23.1 | 32 | 27.7 | 23.6 | 23.8 | 27 | 34.9 | 71.4 | 69.9 | 54.8 | 44.6 | 44.2 | 45.1 | 47.4 | 23.25 | 24.55 | 20.2 |

## 3. The open as a level

| first N minutes direction | agrees with day close (overlapping) | agrees with REST of day (overlap-free) |
|---|---|---|
| first_15m | 53.2% [51.3-55.1] n=2694 p=0.000982 | 50.1% [48.2-51.9] n=2695 p=0.969 |
| first_30m | 53.4% [51.5-55.2] n=2702 p=0.000495 | 49.8% [48.0-51.7] n=2703 p=0.878 |
| first_60m | 54.4% [52.5-56.2] n=2697 p=6.53e-06 | 49.9% [48.0-51.8] n=2700 p=0.923 |
| first_120m | 55.9% [54.1-57.8] n=2707 p=7.39e-10 | 50.5% [48.6-52.4] n=2708 p=0.604 |

- Open crosses per day: med 19.0 (p25 9.0, p75 32.0, mean 22.1, n=2724)
- Share of bars above the open: med 0.576 (p25 0.273, p75 0.847, mean 0.548, n=2724)
- Close minus open (ADR): med 0.083 (p25 -0.337, p75 0.525, mean 0.057, n=2724)

Once price has moved X ADR away from the open, does it come back?

| distance | never returns to open that day | minutes until return (when it does) |
|---|---|---|
| 0.1_ADR | 14.0% [12.8-15.4] n=2722 | med 170.0 (p25 60.0, p75 514.0, mean 311.0, n=2340) |
| 0.2_ADR | 26.7% [25.1-28.4] n=2703 | med 298.0 (p25 122.0, p75 535.0, mean 363.0, n=1981) |
| 0.3_ADR | 41.2% [39.3-43.1] n=2605 | med 290.0 (p25 110.0, p75 483.0, mean 337.0, n=1532) |
| 0.5_ADR | 65.7% [63.7-67.7] n=2114 | med 246.0 (p25 107.0, p75 431.0, mean 305.0, n=725) |

Judas swing (early extreme then trend):

- P(day low in first 60m | up close): 19.6% [17.7-21.7] n=1527
- P(day high in first 60m | down close): 15.5% [13.6-17.7] n=1194
- shuffled_null_P(low in first 60m | up close): 26.3% [24.2-28.6] n=1523
- shuffled_null_P(high in first 60m | down close): 26.1% [23.7-28.6] n=1201

Where the day's HIGH forms (% of days, 30-min buckets after open, first 24 shown):

| bucket | 0h00 | 0h30 | 1h00 | 1h30 | 2h00 | 2h30 | 3h00 | 3h30 | 4h00 | 4h30 | 5h00 | 5h30 | 6h00 | 6h30 | 7h00 | 7h30 | 8h00 | 8h30 | 9h00 | 9h30 | 10h00 | 10h30 | 11h00 | 11h30 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| high | 6.1 | 1.0 | 1.4 | 0.8 | 2.1 | 0.9 | 1.0 | 1.2 | 0.5 | 0.6 | 0.3 | 0.4 | 0.2 | 0.4 | 0.3 | 0.8 | 1.0 | 1.2 | 1.9 | 1.4 | 1.2 | 0.9 | 0.6 | 1.0 |
| low | 9.0 | 2.2 | 1.5 | 1.8 | 2.3 | 1.8 | 1.5 | 1.3 | 0.7 | 0.6 | 0.4 | 0.4 | 0.6 | 0.4 | 0.5 | 0.5 | 1.0 | 0.8 | 2.0 | 1.6 | 1.4 | 0.7 | 1.0 | 0.9 |

Trend-day checkpoints: at 07:00 / 13:00 UK, given travel from the open and whether price sits at the day's extreme:

| checkpoint | travel | position | n | closes further in direction | closes back through open | further MFE (ADR, median) |
|---|---|---|---|---|---|---|
| 0700UK | 0.15-0.30 | at extreme | 330 | 51.2% [45.8-56.6] n=330 | 36.1% [31.1-41.4] n=330 | 0.154 |
| 0700UK | 0.15-0.30 | off extreme | 439 | 47.6% [43.0-52.3] n=439 | 35.8% [31.4-40.4] n=439 | 0.022 |
| 0700UK | 0.30-0.50 | at extreme | 173 | 52.0% [44.6-59.3] n=173 | 32.4% [25.8-39.7] n=173 | 0.215 |
| 0700UK | 0.30-0.50 | off extreme | 162 | 49.4% [41.8-57.0] n=162 | 27.2% [20.9-34.5] n=162 | -0.029 |
| 0700UK | <0.15 ADR | at extreme | 260 | 50.8% [44.7-56.8] n=260 | 42.7% [36.8-48.8] n=260 | 0.098 |
| 0700UK | <0.15 ADR | off extreme | 1209 | 50.3% [47.5-53.1] n=1209 | 45.3% [42.5-48.1] n=1209 | 0.036 |
| 0700UK | >0.50 ADR | at extreme | 92 | 55.4% [45.3-65.2] n=92 | 19.6% [12.7-28.8] n=92 | 0.174 |
| 0700UK | >0.50 ADR | off extreme | 51 | 54.9% [41.4-67.7] n=51 | 27.5% [17.1-40.9] n=51 | -0.273 |
| 1300UK | 0.15-0.30 | at extreme | 233 | 56.7% [50.2-62.9] n=233 | 26.6% [21.3-32.6] n=233 | 0.167 |
| 1300UK | 0.15-0.30 | off extreme | 530 | 46.4% [42.2-50.7] n=530 | 34.9% [31.0-39.1] n=530 | 0.036 |
| 1300UK | 0.30-0.50 | at extreme | 232 | 53.0% [46.6-59.3] n=232 | 25.4% [20.3-31.4] n=232 | 0.21 |
| 1300UK | 0.30-0.50 | off extreme | 272 | 52.6% [46.6-58.4] n=272 | 25.0% [20.2-30.5] n=272 | 0.003 |
| 1300UK | <0.15 ADR | at extreme | 150 | 47.3% [39.5-55.3] n=150 | 48.7% [40.8-56.6] n=150 | 0.15 |
| 1300UK | <0.15 ADR | off extreme | 924 | 50.0% [46.8-53.2] n=924 | 44.8% [41.6-48.0] n=924 | 0.046 |
| 1300UK | >0.50 ADR | at extreme | 219 | 52.5% [45.9-59.0] n=219 | 15.1% [10.9-20.4] n=219 | 0.128 |
| 1300UK | >0.50 ADR | off extreme | 155 | 51.6% [43.8-59.3] n=155 | 20.0% [14.5-27.0] n=155 | -0.098 |

Gap at the open: |gap| med 0.027 (p25 0.012, p75 0.056, mean 0.062, n=2687); fill rate 92.6% [91.6-93.6] n=2687; minutes to fill med 11.0 (p25 1.0, p75 123.0, mean 151.0, n=2489)

| gap size | fill rate | filled within 60m |
|---|---|---|
| <0.05 ADR | 96.8% [96.0-97.5] n=1926 | 74.4% [72.4-76.3] n=1926 |
| 0.05-0.15 | 88.4% [85.4-90.8] n=533 | 37.5% [33.5-41.7] n=533 |
| 0.15-0.30 | 76.1% [68.2-82.5] n=134 | 14.2% [9.3-21.1] n=134 |
| >0.30 ADR | 54.3% [44.2-64.0] n=94 | 3.2% [1.1-9.0] n=94 |

| weekday | median gap (ADR) | fill rate |
|---|---|---|
| Mon | 0.072 | 81.2% [77.6-84.3] n=531 |
| Tue | 0.023 | 95.6% [93.5-97.0] n=541 |
| Wed | 0.021 | 95.9% [93.9-97.3] n=538 |
| Thu | 0.024 | 94.5% [92.2-96.1] n=544 |
| Fri | 0.024 | 95.9% [93.8-97.3] n=533 |

## 4. Opening-range breakout

| OR window | OR size (ADR, med) | breakout rate | min to break (med) | day closes on breakout side | both sides taken | race +1 OR vs opposite edge | MFE (OR units, med) |
|---|---|---|---|---|---|---|---|
| or_5m | 0.052 | 100.0% | 4.0 | 50.2% [48.3-52.1] n=2720 | 88.6% [87.4-89.8] n=2720 | 59.1% [57.2-60.9] n=2720 p=2.57e-21 (RW null 58.7%) | 7.347 |
| or_15m | 0.073 | 100.0% | 10.0 | 51.0% [49.1-52.9] n=2719 | 85.5% [84.1-86.7] n=2719 | 56.0% [54.1-57.8] n=2715 p=4.8e-10 (RW null 55.7%) | 5.27 |
| or_30m | 0.089 | 100.0% | 19.0 | 50.1% [48.2-52.0] n=2715 | 82.9% [81.4-84.3] n=2715 | 55.7% [53.8-57.6] n=2706 p=2.74e-09 (RW null 54.9%) | 4.127 |
| or_60m | 0.111 | 100.0% | 25.0 | 50.8% [48.9-52.6] n=2718 | 79.8% [78.3-81.3] n=2718 | 54.4% [52.5-56.3] n=2698 p=4.98e-06 (RW null 54.4%) | 3.458 |

Trade sims (entry = first close outside OR, stop = opposite OR edge, exit at day end):

| OR window | sim | all | IS (first 60%) | OOS (last 40%) |
|---|---|---|---|---|
| or_5m | target_1.0R_stop_opposite | n=2720 win 50.1% avg -0.196R, gross +0.017R (t 0.88, cost 0.21R) PF 0.67 t=-10.0 maxDD -538.53R | n=1626 win 49.2% avg -0.275R PF 0.57 t=-10.79 maxDD -446.45R | n=1094 win 51.6% avg -0.078R PF 0.85 t=-2.58 maxDD -96.39R |
| or_5m | target_2.0R_stop_opposite | n=2720 win 34.3% avg -0.186R, gross +0.026R (t 0.97, cost 0.21R) PF 0.77 t=-6.74 maxDD -545.56R | n=1626 win 33.8% avg -0.271R PF 0.68 t=-7.59 maxDD -457.3R | n=1094 win 35.0% avg -0.060R PF 0.92 t=-1.38 maxDD -103.64R |
| or_15m | target_1.0R_stop_opposite | n=2719 win 50.0% avg -0.156R, gross +0.005R (t 0.28, cost 0.16R) PF 0.73 t=-8.04 maxDD -423.16R | n=1625 win 48.9% avg -0.230R PF 0.63 t=-9.15 maxDD -373.27R | n=1094 win 51.6% avg -0.046R PF 0.91 t=-1.51 maxDD -50.87R |
| or_15m | target_2.0R_stop_opposite | n=2719 win 35.2% avg -0.113R, gross +0.048R (t 1.77, cost 0.16R) PF 0.85 t=-4.11 maxDD -359.64R | n=1625 win 34.6% avg -0.188R PF 0.76 t=-5.3 maxDD -305.66R | n=1094 win 36.0% avg -0.001R PF 1.0 t=-0.03 maxDD -56.39R |
| or_30m | target_1.0R_stop_opposite | n=2715 win 50.1% avg -0.129R, gross +0.005R (t 0.25, cost 0.13R) PF 0.77 t=-6.69 maxDD -357.61R | n=1621 win 50.0% avg -0.178R PF 0.7 t=-7.09 maxDD -296.89R | n=1094 win 50.2% avg -0.057R PF 0.89 t=-1.89 maxDD -63.48R |
| or_30m | target_2.0R_stop_opposite | n=2715 win 34.1% avg -0.119R, gross +0.015R (t 0.55, cost 0.13R) PF 0.84 t=-4.4 maxDD -331.53R | n=1621 win 35.0% avg -0.144R PF 0.81 t=-4.06 maxDD -239.42R | n=1094 win 32.7% avg -0.083R PF 0.88 t=-1.97 maxDD -94.37R |
| or_60m | target_1.0R_stop_opposite | n=2718 win 50.1% avg -0.108R, gross +0.003R (t 0.14, cost 0.11R) PF 0.8 t=-5.6 maxDD -297.76R | n=1624 win 51.2% avg -0.127R PF 0.77 t=-5.11 maxDD -216.77R | n=1094 win 48.6% avg -0.078R PF 0.85 t=-2.6 maxDD -86.66R |
| or_60m | target_2.0R_stop_opposite | n=2718 win 34.1% avg -0.102R, gross +0.009R (t 0.33, cost 0.11R) PF 0.86 t=-3.77 maxDD -290.7R | n=1624 win 35.1% avg -0.110R PF 0.85 t=-3.13 maxDD -198.16R | n=1094 win 32.5% avg -0.089R PF 0.87 t=-2.13 maxDD -102.63R |

ORB conditioning - by or size (30m OR):

| group | n | closes on side | both sides taken | sim 1R |
|---|---|---|---|---|
| 0.10-0.20 | 855 | 48.2% [44.9-51.5] n=855 | 80.0% [77.2-82.5] n=855 | n=855 win 50.6% avg -0.074R PF 0.86 t=-2.16 maxDD -68.04R |
| 0.20-0.35 | 241 | 53.1% [46.8-59.3] n=241 | 69.7% [63.6-75.2] n=241 | n=241 win 49.8% avg -0.054R PF 0.9 t=-0.84 maxDD -24.25R |
| <0.10 ADR | 1538 | 50.5% [48.0-52.9] n=1538 | 88.3% [86.6-89.8] n=1538 | n=1538 win 49.8% avg -0.178R PF 0.7 t=-6.89 maxDD -279.07R |
| >0.35 ADR | 81 | 55.6% [44.7-65.9] n=81 | 50.6% [40.0-61.2] n=81 | n=81 win 50.6% avg -0.016R PF 0.97 t=-0.15 maxDD -12.54R |

ORB conditioning - by break timing (30m OR):

| group | n | closes on side | both sides taken | sim 1R |
|---|---|---|---|---|
| break<=30min | 1629 | 50.8% [48.3-53.2] n=1629 | 85.4% [83.6-87.0] n=1629 | n=1629 win 49.5% avg -0.148R PF 0.74 t=-5.92 maxDD -247.74R |
| break>30min | 1086 | 49.2% [46.2-52.1] n=1086 | 79.2% [76.7-81.5] n=1086 | n=1086 win 51.0% avg -0.101R PF 0.81 t=-3.33 maxDD -112.69R |

ORB conditioning - by weekday (30m OR):

| group | n | closes on side | both sides taken | sim 1R |
|---|---|---|---|---|
| Fri | 539 | 52.7% [48.5-56.9] n=539 | 86.1% [82.9-88.8] n=539 | n=539 win 48.8% avg -0.159R PF 0.73 t=-3.62 maxDD -91.69R |
| Mon | 528 | 52.8% [48.6-57.1] n=528 | 69.9% [65.8-73.6] n=528 | n=528 win 52.7% avg -0.032R PF 0.94 t=-0.75 maxDD -32.99R |
| Thu | 549 | 48.6% [44.5-52.8] n=549 | 85.1% [81.8-87.8] n=549 | n=549 win 51.0% avg -0.120R PF 0.79 t=-2.77 maxDD -79.75R |
| Tue | 551 | 49.0% [44.8-53.2] n=551 | 86.4% [83.3-89.0] n=551 | n=551 win 50.5% avg -0.143R PF 0.75 t=-3.34 maxDD -89.31R |
| Wed | 548 | 47.6% [43.5-51.8] n=548 | 86.7% [83.6-89.3] n=548 | n=548 win 47.6% avg -0.190R PF 0.68 t=-4.42 maxDD -104.76R |

ORB conditioning - by vol regime (30m OR):

| group | n | closes on side | both sides taken | sim 1R |
|---|---|---|---|---|
| heavy | 572 | 51.9% [47.8-56.0] n=572 | 80.9% [77.5-84.0] n=572 | n=572 win 48.6% avg -0.118R PF 0.79 t=-2.84 maxDD -72.66R |
| normal | 1498 | 49.5% [47.0-52.1] n=1498 | 83.4% [81.4-85.2] n=1498 | n=1498 win 50.3% avg -0.121R PF 0.78 t=-4.63 maxDD -188.41R |
| quiet | 615 | 49.4% [45.5-53.4] n=615 | 83.6% [80.4-86.3] n=615 | n=615 win 50.6% avg -0.168R PF 0.71 t=-4.1 maxDD -109.14R |
| unknown | 30 | 60.0% [42.3-75.4] n=30 | 83.3% [66.4-92.7] n=30 | n=30 win 60.0% avg +0.019R PF 1.04 t=0.1 maxDD -5.83R |

ORB conditioning - by news day (30m OR):

| group | n | closes on side | both sides taken | sim 1R |
|---|---|---|---|---|
| major news day | 1019 | 50.1% [47.1-53.2] n=1019 | 85.0% [82.7-87.0] n=1019 | n=1019 win 50.0% avg -0.114R PF 0.79 t=-3.62 maxDD -118.38R |
| no major news | 1661 | 50.0% [47.6-52.4] n=1661 | 81.6% [79.7-83.4] n=1661 | n=1661 win 50.5% avg -0.135R PF 0.76 t=-5.48 maxDD -237.85R |
| unknown | 35 | 57.1% [40.9-72.0] n=35 | 82.9% [67.3-91.9] n=35 | n=35 win 37.1% avg -0.284R PF 0.56 t=-1.71 maxDD -8.9R |

ORB conditioning - by year (30m OR):

| group | n | closes on side | both sides taken | sim 1R |
|---|---|---|---|---|
| 2016 | 246 | 45.1% [39.0-51.4] n=246 | 85.8% [80.9-89.6] n=246 | n=246 win 48.0% avg -0.379R PF 0.46 t=-5.82 maxDD -99.55R |
| 2017 | 255 | 50.6% [44.5-56.7] n=255 | 83.5% [78.5-87.6] n=255 | n=255 win 51.8% avg -0.276R PF 0.56 t=-4.34 maxDD -71.18R |
| 2018 | 256 | 45.7% [39.7-51.8] n=256 | 84.8% [79.9-88.7] n=256 | n=256 win 50.0% avg -0.153R PF 0.74 t=-2.43 maxDD -40.17R |
| 2019 | 257 | 52.5% [46.4-58.6] n=257 | 80.9% [75.7-85.3] n=257 | n=257 win 50.2% avg -0.156R PF 0.73 t=-2.49 maxDD -47.77R |
| 2020 | 253 | 54.9% [48.8-61.0] n=253 | 77.9% [72.4-82.5] n=253 | n=253 win 48.2% avg -0.107R PF 0.81 t=-1.7 maxDD -31.11R |
| 2021 | 258 | 55.8% [49.7-61.7] n=258 | 83.7% [78.7-87.7] n=258 | n=258 win 52.3% avg -0.044R PF 0.91 t=-0.71 maxDD -24.73R |
| 2022 | 255 | 47.5% [41.4-53.6] n=255 | 86.3% [81.5-90.0] n=255 | n=255 win 47.8% avg -0.106R PF 0.81 t=-1.7 maxDD -29.32R |
| 2023 | 257 | 43.2% [37.3-49.3] n=257 | 82.9% [77.8-87.0] n=257 | n=257 win 55.6% avg +0.027R PF 1.06 t=0.44 maxDD -13.09R |
| 2024 | 258 | 51.2% [45.1-57.2] n=258 | 84.5% [79.6-88.4] n=258 | n=258 win 50.4% avg -0.059R PF 0.89 t=-0.95 maxDD -19.66R |
| 2025 | 256 | 53.1% [47.0-59.1] n=256 | 80.9% [75.6-85.2] n=256 | n=256 win 48.0% avg -0.087R PF 0.84 t=-1.39 maxDD -33.67R |
| 2026 | 164 | 52.4% [44.8-59.9] n=164 | 79.9% [73.1-85.3] n=164 | n=164 win 47.6% avg -0.077R PF 0.86 t=-0.98 maxDD -19.79R |

## 5. Impulse leg then fib pullback

Legs >= 0.12 ADR whose fib became drawable (23.6% pullback) within 240 min of the open. Depth = fraction of the leg given back (TradingView low->high fib shows 1 - depth).

**all legs**: n=14274, leg med 0.166 ADR (p25 0.139, p75 0.215, mean 0.189, n=14274), duration med 29.0 min (p25 10.0, p75 67.0, mean 46.0, n=14274). Continuation 69.8%, failed 29.8%.

| pullback reached | P(continuation to new extreme) | random-walk null (1-d) | RW null at actual bar close |
|---|---|---|---|
| 0.236 | 69.8% [69.0-70.5] n=14274 | 76.4% | 69.5% |
| 0.382 | 56.5% [55.5-57.5] n=9921 | 61.8% | 55.4% |
| 0.5 | 45.6% [44.5-46.7] n=7930 | 50.0% | 43.9% |
| 0.618 | 34.9% [33.7-36.0] n=6619 | 38.2% | 33.0% |
| 0.786 | 19.4% [18.3-20.5] n=5326 | 21.4% | 17.1% |

Deepest pullback that HELD (continuations only): 0.236-0.382: 43.7%, 0.382-0.5: 20.0%, 0.5-0.618: 13.1%, 0.618-0.786: 12.8%, 0.786-1.0: 10.4%

Extension reached after continuation: >= 1.1: 85.7%, >= 1.2: 74.5%, >= 1.272: 67.7%, >= 1.5: 53.5%, >= 1.618: 48.2%, >= 2.0: 36.5%

Trade sims (limit at depth, stop tight = +0.236 depth / at origin / origin+10%, targets old extreme / 1.272 / 1.618):

| sim | result |
|---|---|
| entry_0.382|stop_origin+10%|target_1.618 | n=9921 win 39.7% avg -0.156R, gross -0.052R (t -4.42, cost 0.10R) PF 0.77 t=-13.19 maxDD -1558.0R |
| entry_0.382|stop_origin|target_1.618 | n=9921 win 36.9% avg -0.156R, gross -0.035R (t -2.78, cost 0.12R) PF 0.78 t=-12.21 maxDD -1568.69R |
| entry_0.382|stop_origin+10%|target_1.272 | n=9921 win 49.4% avg -0.160R, gross -0.056R (t -5.86, cost 0.10R) PF 0.71 t=-16.56 maxDD -1590.54R |
| entry_0.382|stop_origin|target_1.272 | n=9921 win 46.5% avg -0.164R, gross -0.044R (t -4.24, cost 0.12R) PF 0.73 t=-15.81 maxDD -1640.1R |
| entry_0.5|stop_origin|target_1.618 | n=7930 win 30.4% avg -0.168R, gross -0.018R (t -1.08, cost 0.15R) PF 0.79 t=-10.01 maxDD -1361.42R |
| entry_0.5|stop_origin+10%|target_1.618 | n=7930 win 33.4% avg -0.169R, gross -0.044R (t -2.88, cost 0.12R) PF 0.77 t=-11.09 maxDD -1359.28R |
| entry_0.5|stop_origin+10%|target_1.272 | n=7930 win 41.6% avg -0.174R, gross -0.049R (t -3.87, cost 0.12R) PF 0.74 t=-13.67 maxDD -1394.64R |
| entry_0.5|stop_origin|target_1.272 | n=7930 win 38.2% avg -0.177R, gross -0.027R (t -1.96, cost 0.15R) PF 0.75 t=-12.68 maxDD -1426.72R |
| entry_0.382|stop_origin+10%|target_extreme | n=9921 win 60.3% avg -0.179R, gross -0.076R (t -10.04, cost 0.10R) PF 0.59 t=-23.56 maxDD -1777.65R |
| entry_0.382|stop_origin|target_extreme | n=9921 win 57.7% avg -0.186R, gross -0.066R (t -8.22, cost 0.12R) PF 0.61 t=-22.96 maxDD -1849.76R |
| entry_0.618|stop_origin+10%|target_1.618 | n=6619 win 27.0% avg -0.195R, gross -0.039R (t -1.99, cost 0.16R) PF 0.77 t=-10.0 maxDD -1317.66R |
| entry_0.618|stop_origin|target_1.618 | n=6619 win 23.7% avg -0.197R, gross +0.001R (t 0.04, cost 0.20R) PF 0.78 t=-8.85 maxDD -1334.62R |
| entry_0.618|stop_origin+10%|target_1.272 | n=6619 win 33.6% avg -0.199R, gross -0.043R (t -2.58, cost 0.16R) PF 0.74 t=-11.98 maxDD -1334.65R |
| entry_0.5|stop_origin+10%|target_extreme | n=7930 win 50.2% avg -0.204R, gross -0.079R (t -7.7, cost 0.12R) PF 0.64 t=-19.67 maxDD -1622.9R |
| entry_0.618|stop_origin|target_1.272 | n=6619 win 29.9% avg -0.204R, gross -0.006R (t -0.3, cost 0.20R) PF 0.76 t=-10.78 maxDD -1372.07R |
| entry_0.5|stop_origin|target_extreme | n=7930 win 46.9% avg -0.211R, gross -0.061R (t -5.45, cost 0.15R) PF 0.65 t=-18.66 maxDD -1678.48R |
| entry_0.618|stop_origin+10%|target_extreme | n=6619 win 40.2% avg -0.238R, gross -0.082R (t -5.93, cost 0.16R) PF 0.66 t=-17.16 maxDD -1585.76R |
| entry_0.618|stop_origin|target_extreme | n=6619 win 36.3% avg -0.247R, gross -0.049R (t -3.19, cost 0.20R) PF 0.68 t=-15.8 maxDD -1645.13R |
| entry_0.618|stop_tight|target_1.618 | n=6619 win 17.1% avg -0.255R, gross +0.066R (t 2.27, cost 0.32R) PF 0.77 t=-8.74 maxDD -1748.19R |
| entry_0.618|stop_tight|target_1.272 | n=6619 win 22.0% avg -0.272R, gross +0.048R (t 1.99, cost 0.32R) PF 0.74 t=-11.06 maxDD -1847.79R |
| entry_0.5|stop_tight|target_1.618 | n=7930 win 17.9% avg -0.292R, gross +0.027R (t 1.08, cost 0.32R) PF 0.73 t=-11.68 maxDD -2408.15R |
| entry_0.786|stop_origin+10%|target_1.618 | n=5326 win 17.4% avg -0.295R, gross -0.052R (t -1.82, cost 0.24R) PF 0.71 t=-10.33 maxDD -1574.39R |
| entry_0.786|stop_origin+10%|target_1.272 | n=5326 win 21.6% avg -0.298R, gross -0.055R (t -2.25, cost 0.24R) PF 0.69 t=-12.02 maxDD -1592.12R |
| entry_0.5|stop_tight|target_1.272 | n=7930 win 23.5% avg -0.314R, gross +0.005R (t 0.22, cost 0.32R) PF 0.69 t=-15.18 maxDD -2535.63R |
| entry_0.786|stop_tight|target_1.272 | n=5326 win 18.4% avg -0.315R, gross +0.009R (t 0.29, cost 0.32R) PF 0.71 t=-10.73 maxDD -1680.17R |
| entry_0.786|stop_tight|target_1.618 | n=5326 win 14.5% avg -0.318R, gross +0.005R (t 0.16, cost 0.32R) PF 0.72 t=-9.45 maxDD -1703.79R |
| entry_0.786|stop_origin|target_1.272 | n=5326 win 17.3% avg -0.326R, gross +0.030R (t 0.98, cost 0.36R) PF 0.71 t=-10.49 maxDD -1742.86R |
| entry_0.786|stop_origin|target_1.618 | n=5326 win 13.6% avg -0.327R, gross +0.029R (t 0.83, cost 0.36R) PF 0.72 t=-9.15 maxDD -1749.68R |
| entry_0.618|stop_tight|target_extreme | n=6619 win 27.3% avg -0.333R, gross -0.012R (t -0.63, cost 0.32R) PF 0.65 t=-16.49 maxDD -2216.11R |
| entry_0.786|stop_origin+10%|target_extreme | n=5326 win 25.9% avg -0.336R, gross -0.093R (t -4.42, cost 0.24R) PF 0.64 t=-15.8 maxDD -1795.52R |
| entry_0.382|stop_tight|target_1.618 | n=9921 win 18.6% avg -0.344R, gross -0.029R (t -1.42, cost 0.32R) PF 0.68 t=-16.68 maxDD -3423.76R |
| entry_0.786|stop_tight|target_extreme | n=5326 win 22.3% avg -0.356R, gross -0.032R (t -1.31, cost 0.32R) PF 0.65 t=-14.22 maxDD -1899.95R |
| entry_0.5|stop_tight|target_extreme | n=7930 win 30.8% avg -0.358R, gross -0.040R (t -2.49, cost 0.32R) PF 0.61 t=-21.73 maxDD -2844.94R |
| entry_0.382|stop_tight|target_1.272 | n=9921 win 25.2% avg -0.365R, gross -0.049R (t -3.0, cost 0.32R) PF 0.63 t=-21.83 maxDD -3615.08R |
| entry_0.786|stop_origin|target_extreme | n=5326 win 21.1% avg -0.369R, gross -0.012R (t -0.46, cost 0.36R) PF 0.66 t=-13.91 maxDD -1970.06R |
| entry_0.382|stop_tight|target_extreme | n=9921 win 35.5% avg -0.386R, gross -0.071R (t -5.66, cost 0.32R) PF 0.54 t=-29.91 maxDD -3831.96R |

**impulsive legs**: n=6051, leg med 0.166 ADR (p25 0.138, p75 0.218, mean 0.189, n=6051), duration med 10.0 min (p25 4.0, p75 17.0, mean 12.0, n=6051). Continuation 69.9%, failed 29.8%.

| pullback reached | P(continuation to new extreme) | random-walk null (1-d) | RW null at actual bar close |
|---|---|---|---|
| 0.236 | 69.9% [68.8-71.1] n=6051 | 76.4% | 68.1% |
| 0.382 | 58.7% [57.2-60.1] n=4401 | 61.8% | 54.8% |
| 0.5 | 48.4% [46.8-50.0] n=3525 | 50.0% | 43.5% |
| 0.618 | 37.1% [35.4-38.9] n=2893 | 38.2% | 32.6% |
| 0.786 | 20.6% [19.0-22.4] n=2286 | 21.4% | 16.7% |

Deepest pullback that HELD (continuations only): 0.236-0.382: 39.0%, 0.382-0.5: 20.7%, 0.5-0.618: 14.9%, 0.618-0.786: 14.2%, 0.786-1.0: 11.2%

Extension reached after continuation: >= 1.1: 85.6%, >= 1.2: 74.8%, >= 1.272: 67.4%, >= 1.5: 52.8%, >= 1.618: 47.3%, >= 2.0: 35.9%

**grind legs**: n=8223, leg med 0.166 ADR (p25 0.139, p75 0.214, mean 0.188, n=8223), duration med 60.0 min (p25 36.0, p75 98.0, mean 71.0, n=8223). Continuation 69.6%, failed 29.8%.

| pullback reached | P(continuation to new extreme) | random-walk null (1-d) | RW null at actual bar close |
|---|---|---|---|
| 0.236 | 69.6% [68.6-70.6] n=8223 | 76.4% | 70.6% |
| 0.382 | 54.8% [53.4-56.1] n=5520 | 61.8% | 55.8% |
| 0.5 | 43.3% [41.9-44.8] n=4405 | 50.0% | 44.3% |
| 0.618 | 33.1% [31.6-34.6] n=3726 | 38.2% | 33.2% |
| 0.786 | 18.4% [17.1-19.8] n=3040 | 21.4% | 17.3% |

Deepest pullback that HELD (continuations only): 0.236-0.382: 47.2%, 0.382-0.5: 19.5%, 0.5-0.618: 11.8%, 0.618-0.786: 11.8%, 0.786-1.0: 9.8%

Extension reached after continuation: >= 1.1: 85.8%, >= 1.2: 74.2%, >= 1.272: 67.9%, >= 1.5: 54.0%, >= 1.618: 48.8%, >= 2.0: 37.0%

**first leg of day only**: n=2457, leg med 0.144 ADR (p25 0.13, p75 0.172, mean 0.161, n=2457), duration med 46.0 min (p25 14.0, p75 89.0, mean 58.0, n=2457). Continuation 69.2%, failed 30.3%.

| pullback reached | P(continuation to new extreme) | random-walk null (1-d) | RW null at actual bar close |
|---|---|---|---|
| 0.236 | 69.2% [67.3-71.0] n=2457 | 76.4% | 71.0% |
| 0.382 | 54.0% [51.6-56.4] n=1646 | 61.8% | 56.4% |
| 0.5 | 42.3% [39.7-45.0] n=1312 | 50.0% | 44.6% |
| 0.618 | 33.2% [30.5-36.0] n=1131 | 38.2% | 33.5% |
| 0.786 | 18.1% [15.8-20.7] n=916 | 21.4% | 17.3% |

Deepest pullback that HELD (continuations only): 0.236-0.382: 47.7%, 0.382-0.5: 19.6%, 0.5-0.618: 10.6%, 0.618-0.786: 12.3%, 0.786-1.0: 9.8%

Extension reached after continuation: >= 1.1: 86.5%, >= 1.2: 74.5%, >= 1.272: 67.6%, >= 1.5: 53.1%, >= 1.618: 47.3%, >= 2.0: 35.6%

IS / OOS continuation given pullback reached:

| depth | IS | OOS |
|---|---|---|
| 0.236 | 68.9% n=9236 (null 68.8%) | 71.4% n=5038 (null 70.7%) |
| 0.382 | 55.8% n=6502 (null 54.7%) | 57.9% n=3419 (null 56.6%) |
| 0.5 | 45.0% n=5230 (null 43.3%) | 46.6% n=2700 (null 45.2%) |
| 0.618 | 34.5% n=4383 (null 32.5%) | 35.7% n=2236 (null 33.9%) |
| 0.786 | 19.2% n=3543 (null 16.7%) | 19.7% n=1783 (null 17.7%) |

Fib conditioning - by leg size:

| group | n | continuation (or P(cont|reached)) | best sim |
|---|---|---|---|
| 0.12-0.2 ADR | 9823 | n/a | entry_0.382|stop_origin+10%|target_1.618: n=6913 win 39.0% avg -0.186R, gross -0.068R (t -4.84, cost 0.12R) PF 0.73 t=-13.21 maxDD -1293.11R |
| 0.2-0.35 | 3908 | n/a | entry_0.382|stop_origin|target_1.618: n=2635 win 38.6% avg -0.077R, gross +0.007R (t 0.29, cost 0.09R) PF 0.88 t=-3.11 maxDD -277.32R |
| >0.35 ADR | 543 | n/a | entry_0.618|stop_tight|target_1.618: n=246 win 19.9% avg +0.073R, gross +0.224R (t 1.42, cost 0.15R) PF 1.08 t=0.46 maxDD -29.36R |

Fib conditioning - by regime:

| group | n | continuation (or P(cont|reached)) | best sim |
|---|---|---|---|
| quiet | 3244 | 68.7% [67.1-70.3] n=3244 | entry_0.382|stop_origin+10%|target_1.272: n=2272 win 49.3% avg -0.218R, gross -0.059R (t -2.93, cost 0.16R) PF 0.63 t=-10.78 maxDD -499.1R |
| normal | 7364 | 70.6% [69.5-71.6] n=7364 | entry_0.382|stop_origin|target_1.618: n=5050 win 37.5% avg -0.129R, gross -0.018R (t -1.03, cost 0.11R) PF 0.81 t=-7.21 maxDD -668.21R |
| heavy | 3551 | 68.8% [67.3-70.3] n=3551 | entry_0.382|stop_origin+10%|target_1.618: n=2531 win 39.0% avg -0.137R, gross -0.067R (t -2.87, cost 0.07R) PF 0.79 t=-5.88 maxDD -358.33R |

Fib conditioning - by direction:

| group | n | continuation (or P(cont|reached)) | best sim |
|---|---|---|---|
| up_legs | 7283 | 70.9% [69.8-71.9] n=7283 | entry_0.382|stop_origin|target_1.618: n=5006 win 39.0% avg -0.102R, gross +0.020R (t 1.11, cost 0.12R) PF 0.85 t=-5.62 maxDD -533.59R |
| down_legs | 6991 | 68.6% [67.5-69.7] n=6991 | entry_0.382|stop_origin+10%|target_1.272: n=4915 win 48.1% avg -0.183R, gross -0.081R (t -5.95, cost 0.10R) PF 0.68 t=-13.37 maxDD -913.5R |

Fib conditioning - by news day:

| group | n | continuation (or P(cont|reached)) | best sim |
|---|---|---|---|
| major news day | 5368 | 46.5% [44.7-48.3] n=3010 (RW null 50.0%) | entry_0.5|stop_origin|target_1.618: n=3010 win 30.8% avg -0.129R, gross -0.003R (t -0.12, cost 0.12R) PF 0.83 t=-4.7 maxDD -405.86R |
| no major news | 8680 | 45.0% [43.6-46.4] n=4808 (RW null 50.0%) | entry_0.382|stop_origin+10%|target_1.618: n=6062 win 40.0% avg -0.161R, gross -0.045R (t -2.97, cost 0.12R) PF 0.76 t=-10.68 maxDD -996.79R |

Fib by year (continuation rate, best 0.382-entry sim):

| year | n | continuation | entry 0.382, stop origin+10%, target 1.618 |
|---|---|---|---|
| 2016 | 1033 | 64.4% [61.4-67.2] n=1033 | n=744 win 37.6% avg -0.340R, gross -0.099R (t -2.34, cost 0.24R) PF 0.56 t=-7.97 maxDD -255.97R |
| 2017 | 1248 | 72.3% [69.7-74.7] n=1248 | n=856 win 38.3% avg -0.377R, gross -0.084R (t -2.12, cost 0.29R) PF 0.53 t=-9.47 maxDD -322.75R |
| 2018 | 1517 | 69.8% [67.5-72.1] n=1517 | n=1073 win 39.8% avg -0.174R, gross -0.049R (t -1.37, cost 0.12R) PF 0.74 t=-4.86 maxDD -198.48R |
| 2019 | 1509 | 69.1% [66.7-71.3] n=1509 | n=1056 win 40.3% avg -0.172R, gross -0.037R (t -1.02, cost 0.14R) PF 0.75 t=-4.76 maxDD -190.64R |
| 2020 | 2240 | 66.4% [64.4-68.4] n=2240 | n=1625 win 39.3% avg -0.137R, gross -0.060R (t -2.07, cost 0.08R) PF 0.79 t=-4.73 maxDD -228.46R |
| 2021 | 1226 | 71.9% [69.3-74.3] n=1226 | n=806 win 41.7% avg -0.066R, gross -0.005R (t -0.13, cost 0.06R) PF 0.89 t=-1.59 maxDD -61.19R |
| 2022 | 971 | 72.2% [69.3-74.9] n=971 | n=660 win 38.6% avg -0.112R, gross -0.075R (t -1.66, cost 0.04R) PF 0.82 t=-2.48 maxDD -76.89R |
| 2023 | 630 | 70.8% [67.1-74.2] n=630 | n=437 win 39.8% avg -0.108R, gross -0.049R (t -0.87, cost 0.06R) PF 0.83 t=-1.93 maxDD -58.4R |
| 2024 | 1012 | 71.6% [68.8-74.3] n=1012 | n=698 win 41.4% avg -0.060R, gross -0.012R (t -0.26, cost 0.05R) PF 0.9 t=-1.35 maxDD -48.43R |
| 2025 | 1523 | 70.6% [68.2-72.8] n=1523 | n=1050 win 37.8% avg -0.133R, gross -0.097R (t -2.71, cost 0.04R) PF 0.79 t=-3.7 maxDD -144.39R |
| 2026 | 1365 | 71.4% [68.9-73.7] n=1365 | n=916 win 42.0% avg -0.022R, gross +0.006R (t 0.15, cost 0.03R) PF 0.96 t=-0.55 maxDD -46.83R |

## 6. Session VWAP and bands

| event | n | back to VWAP within 60m | within 120m | by day end |
|---|---|---|---|---|
| 1.0_sigma | 2721 | 34.7% [32.9-36.5] n=2721 | 55.5% [53.6-57.4] n=2721 | 97.9% [97.3-98.3] n=2721 |
| 2.0_sigma | 2719 | 25.0% [23.4-26.7] n=2719 | 45.7% [43.8-47.6] n=2719 | 96.7% [95.9-97.3] n=2719 |
| baseline_random_bar | 2724 | 36.1% [34.3-37.9] n=2724 | 48.7% [46.8-50.6] n=2724 | 76.7% [75.1-78.2] n=2724 |

| checkpoint | days with abs(z) >= 1.5 | closes even further from VWAP | closes back through VWAP | z p10/p90 |
|---|---|---|---|---|
| minute 60 | 668 | 47.9% [44.1-51.7] n=668 | 45.5% [41.8-49.3] n=668 | -1.49 / 1.71 |
| minute 120 | 722 | 45.6% [42.0-49.2] n=722 | 45.7% [42.1-49.4] n=722 | -1.62 / 1.7 |
| minute 240 | 683 | 41.7% [38.1-45.5] n=683 | 47.9% [44.2-51.6] n=683 | -1.52 / 1.71 |

- VWAP bounce after a 1.5-sigma push (race +1 sigma vs -1 sigma): 46.9% [45.0-48.8] n=2651 p=0.00126 (RW null 48.9%); sim: n=2651 win 46.0% avg -0.282R, gross -0.040R (t -1.83, cost 0.24R) PF 0.59 t=-10.12 maxDD -759.03R
- Fade 2 sigma back to VWAP (stop 3.5 sigma): n=2719 win 29.6% avg -0.764R, gross -0.062R (t -1.87, cost 0.70R) PF 0.43 t=-7.37 maxDD -2079.8R
- Side of VWAP predicts rest of day, at_london_open_0700UK: 52.6% [50.8-54.5] n=2722 p=0.00612
- Side of VWAP predicts rest of day, at_ny_open_1430UK: 52.1% [50.2-54.0] n=2716 p=0.0301
- Side of VWAP predicts rest of day, vwap_slope_h1_to_h2_vs_rest: 49.6% [47.7-51.5] n=2722 p=0.687

| year | fade 2 sigma | VWAP bounce |
|---|---|---|
| 2016 | n=247 win 31.2% avg -1.449R PF 0.24 t=-4.0 maxDD -356.79R | n=241 win 46.9% avg -0.483R PF 0.38 t=-6.5 maxDD -118.88R |
| 2017 | n=256 win 28.9% avg -2.258R PF 0.16 t=-3.68 maxDD -576.42R | n=249 win 47.0% avg -0.546R PF 0.33 t=-7.31 maxDD -135.69R |
| 2018 | n=257 win 30.7% avg -1.320R PF 0.31 t=-2.16 maxDD -343.34R | n=256 win 48.0% avg -0.226R PF 0.66 t=-2.48 maxDD -60.19R |
| 2019 | n=257 win 30.7% avg -1.012R PF 0.36 t=-2.24 maxDD -260.71R | n=253 win 46.6% avg -0.338R PF 0.51 t=-4.9 maxDD -90.74R |
| 2020 | n=257 win 29.6% avg -0.284R PF 0.68 t=-2.64 maxDD -86.27R | n=252 win 46.4% avg -0.213R PF 0.68 t=-2.43 maxDD -62.95R |
| 2021 | n=258 win 27.5% avg -0.513R PF 0.51 t=-3.38 maxDD -131.13R | n=249 win 43.8% avg -0.240R PF 0.63 t=-3.49 maxDD -59.56R |
| 2022 | n=257 win 31.9% avg -0.266R PF 0.7 t=-2.13 maxDD -83.21R | n=247 win 38.5% avg -0.340R PF 0.49 t=-5.4 maxDD -88.51R |
| 2023 | n=255 win 26.7% avg -0.320R PF 0.7 t=-1.62 maxDD -135.52R | n=253 win 47.8% avg -0.221R PF 0.68 t=-1.58 maxDD -58.91R |
| 2024 | n=258 win 28.3% avg -0.323R PF 0.64 t=-3.04 maxDD -84.54R | n=251 win 46.2% avg -0.249R PF 0.64 t=-1.86 maxDD -70.49R |
| 2025 | n=254 win 31.1% avg -0.198R PF 0.75 t=-2.07 maxDD -69.21R | n=244 win 50.4% avg -0.050R PF 0.91 t=-0.74 maxDD -20.62R |
| 2026 | n=163 win 28.8% avg -0.320R PF 0.62 t=-2.31 maxDD -57.57R | n=156 win 42.9% avg -0.161R PF 0.74 t=-1.53 maxDD -38.57R |

## 7. Asia range (23:00-07:00 UK) into London / NY

Asia range: med 0.305 ADR (p25 0.217, p75 0.437, mean 0.369, n=2724). Outcomes: high only 26.8%, low only 18.5%, both 53.9%, neither 0.8%. Minutes from 07:00 to first break: med 72.0 (p25 22.0, p75 173.0, mean 131.0, n=2701).

After the first break: day closes beyond the broken side 51.1% [49.2-52.9] n=2701; closes back inside at some point 95.5% [94.6-96.2] n=2701; opposite side also taken 54.4% [52.5-56.2] n=2701; MFE med 1.222 ranges (p25 0.574, p75 2.317, mean 1.746, n=2701).

- Breakout sim (first close beyond, stop mid-range, target 1x range): n=2701 win 38.4% avg -0.064R, gross +0.015R (t 0.59, cost 0.08R) PF 0.9 t=-2.54 maxDD -226.92R
- Sweep-fade sim (first close back inside after a break, stop beyond sweep extreme, target other side; avg RR 4.858): n=2579 win 23.3% avg -0.196R, gross +0.021R (t 0.47, cost 0.22R) PF 0.79 t=-4.38 maxDD -517.65R
- IS: breakout n=1617 win 37.4% avg -0.123R PF 0.82 t=-3.83 maxDD -204.84R; sweep-fade n=1537 win 23.8% avg -0.258R PF 0.74 t=-4.44 maxDD -463.22R
- OOS: breakout n=1084 win 39.9% avg +0.024R PF 1.04 t=0.61 maxDD -43.79R; sweep-fade n=1042 win 22.6% avg -0.103R PF 0.88 t=-1.49 maxDD -125.44R

Asia conditioning - by asia range size:

| group | n | closes beyond | opposite also taken | breakout sim | sweep-fade sim |
|---|---|---|---|---|---|
| 0.25-0.40 | 954 | 51.9% [48.7-55.0] n=954 | 53.7% [50.5-56.8] n=954 | n=954 win 38.1% avg -0.041R PF 0.94 t=-0.95 maxDD -70.98R | n=913 win 21.1% avg -0.243R PF 0.75 t=-3.23 maxDD -253.14R |
| 0.40-0.60 | 520 | 49.0% [44.8-53.3] n=520 | 46.2% [41.9-50.5] n=520 | n=520 win 37.5% avg -0.042R PF 0.94 t=-0.73 maxDD -44.99R | n=491 win 25.5% avg +0.053R PF 1.06 t=0.46 maxDD -64.07R |
| <0.25 ADR | 940 | 50.4% [47.2-53.6] n=940 | 66.6% [63.5-69.5] n=940 | n=940 win 38.2% avg -0.102R PF 0.85 t=-2.4 maxDD -105.32R | n=910 win 25.6% avg -0.291R PF 0.7 t=-4.21 maxDD -266.42R |
| >0.60 ADR | 287 | 54.0% [48.2-59.7] n=287 | 31.4% [26.3-36.9] n=287 | n=287 win 41.8% avg -0.051R PF 0.91 t=-0.73 maxDD -25.34R | n=265 win 19.2% avg -0.169R PF 0.81 t=-1.2 maxDD -66.45R |

Asia conditioning - by break timing:

| group | n | closes beyond | opposite also taken | breakout sim | sweep-fade sim |
|---|---|---|---|---|---|
| 60-180min | 937 | 49.3% [46.1-52.5] n=937 | 58.5% [55.3-61.6] n=937 | n=937 win 37.2% avg -0.087R PF 0.87 t=-2.02 maxDD -101.17R | n=906 win 25.6% avg -0.116R PF 0.87 t=-1.54 maxDD -167.05R |
| >180min | 652 | 50.8% [46.9-54.6] n=652 | 43.3% [39.5-47.1] n=652 | n=652 win 40.3% avg -0.056R PF 0.91 t=-1.15 maxDD -74.23R | n=594 win 23.6% avg -0.165R PF 0.82 t=-1.71 maxDD -114.51R |
| break<=60min | 1112 | 52.7% [49.8-55.6] n=1112 | 57.4% [54.4-60.3] n=1112 | n=1112 win 38.2% avg -0.049R PF 0.93 t=-1.23 maxDD -75.92R | n=1079 win 21.3% avg -0.279R PF 0.72 t=-4.14 maxDD -326.37R |

Asia conditioning - by weekday:

| group | n | closes beyond | opposite also taken | breakout sim | sweep-fade sim |
|---|---|---|---|---|---|
| Fri | 533 | 49.2% [44.9-53.4] n=533 | 58.3% [54.1-62.5] n=533 | n=533 win 35.1% avg -0.133R PF 0.81 t=-2.36 maxDD -94.09R | n=512 win 25.6% avg -0.116R PF 0.88 t=-1.12 maxDD -120.81R |
| Mon | 520 | 52.1% [47.8-56.4] n=520 | 43.3% [39.1-47.6] n=520 | n=520 win 40.4% avg -0.028R PF 0.96 t=-0.49 maxDD -45.01R | n=488 win 22.5% avg -0.234R PF 0.74 t=-2.49 maxDD -137.44R |
| Thu | 549 | 50.6% [46.5-54.8] n=549 | 55.2% [51.0-59.3] n=549 | n=549 win 39.2% avg -0.050R PF 0.92 t=-0.9 maxDD -66.75R | n=524 win 23.7% avg -0.123R PF 0.87 t=-1.19 maxDD -97.87R |
| Tue | 551 | 53.4% [49.2-57.5] n=551 | 55.4% [51.2-59.5] n=551 | n=551 win 41.4% avg +0.002R PF 1.0 t=0.03 maxDD -24.07R | n=521 win 21.3% avg -0.322R PF 0.67 t=-3.26 maxDD -183.69R |
| Wed | 548 | 50.0% [45.8-54.2] n=548 | 59.1% [55.0-63.2] n=548 | n=548 win 35.9% avg -0.109R PF 0.84 t=-1.95 maxDD -67.85R | n=534 win 23.6% avg -0.186R PF 0.8 t=-1.88 maxDD -143.43R |

Asia conditioning - by vol regime:

| group | n | closes beyond | opposite also taken | breakout sim | sweep-fade sim |
|---|---|---|---|---|---|
| heavy | 567 | 49.7% [45.6-53.8] n=567 | 53.1% [49.0-57.2] n=567 | n=567 win 40.6% avg +0.032R PF 1.05 t=0.58 maxDD -23.21R | n=534 win 20.4% avg -0.193R PF 0.79 t=-1.96 maxDD -153.83R |
| normal | 1493 | 52.0% [49.5-54.6] n=1493 | 54.6% [52.1-57.1] n=1493 | n=1493 win 38.7% avg -0.053R PF 0.92 t=-1.57 maxDD -120.78R | n=1421 win 23.6% avg -0.159R PF 0.83 t=-2.55 maxDD -230.4R |
| quiet | 611 | 50.4% [46.5-54.4] n=611 | 54.3% [50.4-58.2] n=611 | n=611 win 35.8% avg -0.171R PF 0.76 t=-3.33 maxDD -116.86R | n=594 win 25.3% avg -0.290R PF 0.7 t=-3.45 maxDD -185.76R |
| unknown | 30 | 40.0% [24.6-57.7] n=30 | 66.7% [48.8-80.8] n=30 | n=30 win 33.3% avg -0.217R PF 0.7 t=-0.92 maxDD -6.95R | n=30 win 23.3% avg -0.125R PF 0.87 t=-0.27 maxDD -14.21R |

Asia conditioning - by news day:

| group | n | closes beyond | opposite also taken | breakout sim | sweep-fade sim |
|---|---|---|---|---|---|
| major news day | 1018 | 52.5% [49.4-55.5] n=1018 | 57.8% [54.7-60.8] n=1018 | n=1018 win 38.1% avg -0.046R PF 0.93 t=-1.12 maxDD -86.34R | n=980 win 23.9% avg -0.075R PF 0.92 t=-0.97 maxDD -96.59R |
| no major news | 1648 | 50.2% [47.8-52.6] n=1648 | 52.7% [50.3-55.1] n=1648 | n=1648 win 38.3% avg -0.081R PF 0.88 t=-2.55 maxDD -152.54R | n=1566 win 23.3% avg -0.263R PF 0.73 t=-4.77 maxDD -451.73R |
| unknown | 35 | 51.4% [35.6-67.0] n=35 | 31.4% [18.6-48.0] n=35 | n=35 win 51.4% avg +0.272R PF 1.58 t=1.24 maxDD -4.35R | n=33 win 9.1% avg -0.604R PF 0.36 t=-2.1 maxDD -24.97R |

Asia conditioning - by year:

| group | n | closes beyond | opposite also taken | breakout sim | sweep-fade sim |
|---|---|---|---|---|---|
| 2016 | 244 | 47.5% [41.4-53.8] n=244 | 58.2% [51.9-64.2] n=244 | n=244 win 28.3% avg -0.450R PF 0.48 t=-5.79 maxDD -109.72R | n=238 win 25.2% avg -0.464R PF 0.6 t=-3.21 maxDD -127.51R |
| 2017 | 253 | 54.5% [48.4-60.6] n=253 | 53.0% [46.8-59.0] n=253 | n=253 win 40.7% avg -0.111R PF 0.84 t=-1.32 maxDD -39.5R | n=236 win 22.0% avg -0.632R PF 0.49 t=-4.76 maxDD -147.38R |
| 2018 | 257 | 48.6% [42.6-54.7] n=257 | 53.7% [47.6-59.7] n=257 | n=257 win 38.9% avg -0.033R PF 0.95 t=-0.41 maxDD -31.5R | n=251 win 17.9% avg -0.606R PF 0.43 t=-5.37 maxDD -151.31R |
| 2019 | 254 | 51.6% [45.5-57.7] n=254 | 44.9% [38.9-51.0] n=254 | n=254 win 40.9% avg -0.053R PF 0.92 t=-0.67 maxDD -22.51R | n=240 win 26.2% avg -0.025R PF 0.97 t=-0.15 maxDD -33.6R |
| 2020 | 254 | 49.6% [43.5-55.7] n=254 | 49.2% [43.1-55.3] n=254 | n=254 win 39.0% avg -0.025R PF 0.96 t=-0.31 maxDD -25.07R | n=241 win 26.1% avg +0.102R PF 1.13 t=0.62 maxDD -53.51R |
| 2021 | 258 | 49.6% [43.6-55.7] n=258 | 56.6% [50.5-62.5] n=258 | n=258 win 36.0% avg -0.115R PF 0.83 t=-1.48 maxDD -28.7R | n=240 win 26.7% avg +0.037R PF 1.04 t=0.24 maxDD -56.23R |
| 2022 | 254 | 50.4% [44.3-56.5] n=254 | 57.9% [51.7-63.8] n=254 | n=254 win 37.0% avg -0.046R PF 0.93 t=-0.57 maxDD -14.97R | n=243 win 20.6% avg -0.200R PF 0.77 t=-1.53 maxDD -51.73R |
| 2023 | 256 | 55.1% [49.0-61.1] n=256 | 60.5% [54.4-66.3] n=256 | n=256 win 40.6% avg +0.046R PF 1.07 t=0.54 maxDD -18.42R | n=249 win 22.9% avg -0.201R PF 0.78 t=-1.49 maxDD -68.64R |
| 2024 | 257 | 50.6% [44.5-56.6] n=257 | 62.3% [56.2-68.0] n=257 | n=257 win 37.7% avg -0.022R PF 0.97 t=-0.27 maxDD -41.77R | n=247 win 27.1% avg -0.019R PF 0.98 t=-0.13 maxDD -40.27R |
| 2025 | 253 | 50.6% [44.5-56.7] n=253 | 56.1% [50.0-62.1] n=253 | n=253 win 41.1% avg +0.053R PF 1.09 t=0.64 maxDD -12.99R | n=242 win 24.0% avg +0.131R PF 1.16 t=0.78 maxDD -43.76R |
| 2026 | 161 | 54.7% [46.9-62.2] n=161 | 40.4% [33.1-48.1] n=161 | n=161 win 43.5% avg +0.103R PF 1.18 t=1.0 maxDD -8.27R | n=152 win 15.1% avg -0.323R PF 0.63 t=-2.02 maxDD -56.59R |

## 8. Prior-day / prior-week levels

| level | days | distance from open (ADR, med) | touched | min to touch (med) | reject first (0.15 ADR race) | break first | day closes beyond after touch |
|---|---|---|---|---|---|---|---|
| PDH | 2638 | 0.342 | 56.0% [54.1-57.9] n=2638 | 601.0 | 43.9% [41.3-46.5] n=1426 | 56.1% [53.5-58.7] n=1426 | 54.7% [52.2-57.3] n=1478 |
| PDL | 2694 | 0.528 | 42.2% [40.3-44.0] n=2694 | 716.0 | 45.1% [42.3-48.1] n=1123 | 54.9% [51.9-57.7] n=1123 | 45.8% [42.9-48.7] n=1136 |
| PDC | 1674 | 0.046 | 89.2% [87.7-90.6] n=1674 | 41.0 | 44.8% [42.2-47.3] n=1488 | 55.2% [52.7-57.8] n=1488 | 48.9% [46.4-51.5] n=1494 |
| PWH | 2687 | 0.859 | 28.3% [26.6-30.0] n=2687 | 854.0 | 45.4% [41.8-49.0] n=732 | 54.6% [51.0-58.2] n=732 | 53.0% [49.5-56.6] n=760 |
| PWL | 2712 | 1.674 | 17.7% [16.3-19.2] n=2712 | 868.0 | 47.2% [42.8-51.8] n=472 | 52.8% [48.2-57.2] n=472 | 49.6% [45.1-54.0] n=480 |

Touch rate by distance from the open:

| level | distance | n | touched | reject first |
|---|---|---|---|---|
| PDH | <0.25 ADR | 1087 | 83.3% [80.9-85.4] n=1087 | 44.2% [41.0-47.5] n=886 |
| PDH | 0.25-0.5 | 559 | 55.6% [51.5-59.7] n=559 | 47.5% [41.9-53.1] n=297 |
| PDH | 0.5-1.0 | 616 | 35.9% [32.2-39.7] n=616 | 37.1% [30.8-43.9] n=205 |
| PDH | >1.0 ADR | 376 | 10.9% [8.1-14.5] n=376 | 44.7% [30.1-60.3] n=38 |
| PDL | <0.25 ADR | 593 | 82.3% [79.0-85.2] n=593 | 46.7% [42.3-51.1] n=484 |
| PDL | 0.25-0.5 | 684 | 51.6% [47.9-55.3] n=684 | 44.0% [38.9-49.2] n=350 |
| PDL | 0.5-1.0 | 905 | 26.6% [23.9-29.6] n=905 | 42.2% [36.1-48.6] n=237 |
| PDL | >1.0 ADR | 512 | 10.5% [8.2-13.5] n=512 | 51.9% [38.7-64.9] n=52 |
| PDC | <0.25 ADR | 1559 | 91.7% [90.3-93.0] n=1559 | 45.2% [42.6-47.8] n=1425 |
| PDC | 0.25-0.5 | 72 | 59.7% [48.2-70.3] n=72 | 39.5% [26.4-54.4] n=43 |
| PDC | 0.5-1.0 | 32 | 50.0% [33.6-66.4] n=32 | 25.0% [10.2-49.5] n=16 |
| PWH | <0.25 ADR | 451 | 82.0% [78.2-85.3] n=451 | 46.3% [41.3-51.4] n=365 |
| PWH | 0.25-0.5 | 420 | 50.0% [45.2-54.8] n=420 | 48.7% [41.9-55.6] n=199 |
| PWH | 0.5-1.0 | 617 | 22.0% [18.9-25.5] n=617 | 38.3% [30.3-46.9] n=128 |
| PWH | >1.0 ADR | 1199 | 3.7% [2.7-4.9] n=1199 | 42.5% [28.5-57.8] n=40 |
| PWL | <0.25 ADR | 183 | 84.2% [78.2-88.7] n=183 | 48.1% [40.3-55.9] n=154 |
| PWL | 0.25-0.5 | 201 | 56.7% [49.8-63.4] n=201 | 52.2% [43.1-61.2] n=113 |
| PWL | 0.5-1.0 | 374 | 34.2% [29.6-39.2] n=374 | 41.5% [33.1-50.3] n=123 |
| PWL | >1.0 ADR | 1954 | 4.3% [3.5-5.3] n=1954 | 47.6% [37.1-58.2] n=82 |

## 9. First candle of the day, by timeframe

| TF | n | rest of day same direction | opposite extreme holds all day | day extends beyond candle | extension (candle ranges, med) | candle range (ADR, med) |
|---|---|---|---|---|---|---|
| 5m | 2696 | 50.6% [48.7-52.4] n=2696 p=0.576 | 6.8% [5.9-7.8] n=2696 | 97.3% [96.7-97.9] n=2696 | 7.074 | 0.052 |
| 15m | 2696 | 50.0% [48.2-51.9] n=2694 p=0.985 | 9.0% [8.0-10.1] n=2696 | 96.6% [95.8-97.2] n=2696 | 5.065 | 0.073 |
| 30m | 2701 | 49.8% [47.9-51.7] n=2699 p=0.878 | 10.9% [9.8-12.1] n=2701 | 95.8% [95.0-96.5] n=2701 | 4.06 | 0.09 |
| 60m | 2698 | 49.9% [48.0-51.8] n=2698 p=0.954 | 12.1% [10.9-13.4] n=2698 | 93.9% [93.0-94.8] n=2698 | 3.102 | 0.112 |
| 240m | 2709 | 49.9% [48.0-51.8] n=2708 p=0.923 | 25.6% [24.0-27.3] n=2709 | 89.6% [88.4-90.7] n=2709 | 1.322 | 0.239 |

| TF | body ratio | n | rest same | opposite extreme holds |
|---|---|---|---|---|
| 5m | doji <0.3 | 732 | 51.0% [47.3-54.6] n=732 | 4.8% [3.5-6.6] n=732 |
| 5m | 0.3-0.6 | 906 | 52.0% [48.7-55.2] n=906 | 6.3% [4.9-8.1] n=906 |
| 5m | strong >0.6 | 1058 | 49.1% [46.1-52.1] n=1058 | 8.6% [7.1-10.4] n=1058 |
| 15m | doji <0.3 | 758 | 51.5% [47.9-55.0] n=758 | 5.5% [4.1-7.4] n=758 |
| 15m | 0.3-0.6 | 959 | 48.9% [45.8-52.1] n=959 | 7.9% [6.4-9.8] n=959 |
| 15m | strong >0.6 | 977 | 50.1% [46.9-53.2] n=977 | 12.7% [10.7-14.9] n=977 |
| 30m | doji <0.3 | 810 | 49.5% [46.1-52.9] n=810 | 6.7% [5.1-8.6] n=810 |
| 30m | 0.3-0.6 | 926 | 50.8% [47.5-54.0] n=926 | 11.0% [9.2-13.2] n=926 |
| 30m | strong >0.6 | 963 | 49.2% [46.1-52.4] n=963 | 14.3% [12.3-16.7] n=963 |
| 60m | doji <0.3 | 814 | 49.4% [46.0-52.8] n=814 | 6.0% [4.6-7.9] n=814 |
| 60m | 0.3-0.6 | 1013 | 50.8% [47.8-53.9] n=1013 | 12.1% [10.3-14.3] n=1013 |
| 60m | strong >0.6 | 871 | 49.4% [46.1-52.7] n=871 | 17.7% [15.3-20.4] n=871 |
| 240m | doji <0.3 | 825 | 48.6% [45.2-52.0] n=825 | 18.3% [15.8-21.1] n=825 |
| 240m | 0.3-0.6 | 952 | 49.9% [46.7-53.1] n=952 | 23.4% [20.8-26.2] n=952 |
| 240m | strong >0.6 | 931 | 51.0% [47.8-54.2] n=931 | 34.3% [31.3-37.4] n=931 |

| TF | candle range | n | rest same | opposite extreme holds |
|---|---|---|---|---|
| 5m | small <0.1 ADR | 2222 | 50.4% [48.3-52.4] n=2222 | 4.8% [4.0-5.7] n=2222 |
| 5m | 0.1-0.2 | 364 | 52.2% [47.1-57.3] n=364 | 13.2% [10.1-17.1] n=364 |
| 5m | 0.2-0.35 | 96 | 51.0% [41.2-60.8] n=96 | 27.1% [19.2-36.7] n=96 |
| 15m | small <0.1 ADR | 1859 | 49.8% [47.5-52.1] n=1859 | 6.0% [5.0-7.2] n=1859 |
| 15m | 0.1-0.2 | 628 | 51.3% [47.4-55.2] n=628 | 12.6% [10.2-15.4] n=628 |
| 15m | 0.2-0.35 | 161 | 49.7% [42.1-57.3] n=161 | 21.1% [15.5-28.1] n=161 |
| 15m | large >0.35 | 46 | 43.5% [30.2-57.8] n=46 | 37.0% [24.5-51.4] n=46 |
| 30m | small <0.1 ADR | 1525 | 48.6% [46.1-51.1] n=1525 | 6.7% [5.5-8.1] n=1525 |
| 30m | 0.1-0.2 | 851 | 50.8% [47.4-54.1] n=851 | 12.9% [10.8-15.3] n=851 |
| 30m | 0.2-0.35 | 241 | 53.5% [47.2-59.7] n=241 | 22.4% [17.6-28.1] n=241 |
| 30m | large >0.35 | 82 | 52.4% [41.8-62.9] n=82 | 34.1% [24.8-44.9] n=82 |
| 60m | small <0.1 ADR | 1125 | 49.2% [46.2-52.1] n=1125 | 6.5% [5.2-8.1] n=1125 |
| 60m | 0.1-0.2 | 1084 | 49.9% [46.9-52.9] n=1084 | 11.6% [9.8-13.7] n=1084 |
| 60m | 0.2-0.35 | 343 | 50.7% [45.5-56.0] n=343 | 22.2% [18.1-26.8] n=343 |
| 60m | large >0.35 | 146 | 54.1% [46.0-62.0] n=146 | 34.9% [27.7-43.0] n=146 |
| 240m | small <0.1 ADR | 87 | 51.7% [41.4-61.9] n=87 | 13.8% [8.1-22.6] n=87 |
| 240m | 0.1-0.2 | 863 | 49.5% [46.2-52.8] n=863 | 16.8% [14.5-19.4] n=863 |
| 240m | 0.2-0.35 | 1081 | 49.7% [46.7-52.7] n=1081 | 25.2% [22.7-27.8] n=1081 |
| 240m | large >0.35 | 677 | 50.5% [46.8-54.3] n=677 | 39.0% [35.4-42.7] n=677 |
