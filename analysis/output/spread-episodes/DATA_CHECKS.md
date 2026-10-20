# spread-episodes: data checks

Computed before any setup outcome. Window ends 2026-08-20 (lockbox).

## Case 1: SOFR Sep26 (SR3U6) − Euribor Mar27 (IH7), bp, vs NAS100 (OANDA), 15-min

- Window 2024-04-15 → 2026-08-20; weekdays 614; days failing the ≥3-distinct-prices screen 18; usable 15-min bars 47166.

| series | share of bars unchanged from the previous bar |
|---|---|
| SR3U6 1m | 88.1% |
| IH7 1m | 87.3% |
| NAS100 1m | 5.3% |
| SR3U6 15m | 59.2% |
| IH7 15m | 57.6% |
| spread 15m | 43.1% |

Unchanged share by UTC hour (15-min bars), and how often the Euribor leg prints at all in that hour:

| UTC hour | SR3U6 unchanged | IH7 unchanged | IH7 bar present |
|---|---|---|---|
| 00 | 62% | 56% | 65% |
| 01 | 67% | 72% | 100% |
| 02 | 73% | 78% | 100% |
| 03 | 73% | 80% | 100% |
| 04 | 77% | 76% | 100% |
| 05 | 73% | 68% | 100% |
| 06 | 64% | 51% | 100% |
| 07 | 55% | 42% | 100% |
| 08 | 59% | 45% | 100% |
| 09 | 62% | 47% | 100% |
| 10 | 62% | 50% | 100% |
| 11 | 54% | 52% | 100% |
| 12 | 42% | 46% | 100% |
| 13 | 40% | 42% | 99% |
| 14 | 44% | 45% | 99% |
| 15 | 47% | 44% | 99% |
| 16 | 51% | 54% | 99% |
| 17 | 53% | 63% | 99% |
| 18 | 54% | 69% | 99% |
| 19 | 56% | 69% | 99% |
| 20 | 59% | 71% | 35% |
| 21 | 63% | nan% | 0% |
| 22 | 75% | nan% | 0% |
| 23 | 71% | nan% | 0% |

Timestamp alignment: correlation of the 15-min spread change with the NAS100 log change L bars later (L<0 = price earlier). A correctly aligned pair peaks at 0:

| L | -3 | -2 | -1 | 0 | 1 | 2 | 3 |
|---|---|---|---|---|---|---|---|
| corr | +0.002 | +0.000 | +0.017 | +0.180 | +0.009 | -0.014 | +0.007 |

Spread-only event counts (confirmed zig-zag turns), and the median delay from turn to confirmation:

| k | period | turns | median turn→confirm (bars of 15 min) | p90 |
|---|---|---|---|---|
| 0.5 | discover | 2818 | 2 | 8 |
| 0.5 | validate | 1257 | 3 | 11 |
| 0.5 | final | 1476 | 3 | 9 |
| 0.75 | discover | 1458 | 4 | 14 |
| 0.75 | validate | 724 | 5 | 17 |
| 0.75 | final | 809 | 4 | 17 |
| 1.0 | discover | 934 | 6 | 23 |
| 1.0 | validate | 446 | 8 | 28 |
| 1.0 | final | 507 | 6 | 24 |
| 1.5 | discover | 484 | 11 | 44 |
| 1.5 | validate | 219 | 18 | 58 |
| 1.5 | final | 254 | 14 | 47 |

## Case 2: US 2Y / 10Y (FRED DGS2, DGS10) vs EURUSD (FRED DEXUSEU, noon New York), daily

- Rows 6901 (1999-01-04 → 2026-08-20); spacing: 78% one day, 18% three days (weekend), max gap 5 days. The FRED series are daily by construction.

| series | share of days unchanged |
|---|---|
| DGS2 | 16.8% |
| DGS10 | 7.5% |
| AVG | 4.1% |
| SLOPE | 8.9% |
| DEXUSEU | 0.9% |

- DEXUSEU daily log change vs OANDA EURUSD at 12:00 New York, 2016 → 2026-08: correlation 0.986 on 2646 days (source check).

Alignment: correlation of the daily yield change with the EURUSD log change L days later (L=+1: yield of day d vs FX d→d+1). FRED yields are end of day, DEXUSEU is noon, so a same-day yield change partly happens after the noon print; this is why the design enters at day d+1.

| series | L=-1 | L=0 | L=+1 |
|---|---|---|---|
| AVG | -0.004 | -0.132 | -0.056 |
| DGS2 | -0.011 | -0.156 | -0.053 |
| DGS10 | +0.003 | -0.095 | -0.052 |
| SLOPE | +0.020 | +0.078 | -0.003 |

Spread-only event counts:

| series | k | period | turns | median turn→confirm (days) |
|---|---|---|---|---|
| AVG | 0.5 | discover | 597 | 2 |
| AVG | 0.5 | validate | 332 | 2 |
| AVG | 0.5 | final | 307 | 2 |
| AVG | 0.75 | discover | 397 | 2 |
| AVG | 0.75 | validate | 213 | 3 |
| AVG | 0.75 | final | 200 | 2 |
| AVG | 1.0 | discover | 292 | 3 |
| AVG | 1.0 | validate | 148 | 3 |
| AVG | 1.0 | final | 149 | 3 |
| AVG | 1.5 | discover | 165 | 5 |
| AVG | 1.5 | validate | 96 | 5 |
| AVG | 1.5 | final | 75 | 5 |
| DGS2 | 0.5 | discover | 605 | 2 |
| DGS2 | 0.5 | validate | 394 | 2 |
| DGS2 | 0.5 | final | 306 | 2 |
| DGS2 | 0.75 | discover | 377 | 2 |
| DGS2 | 0.75 | validate | 246 | 2 |
| DGS2 | 0.75 | final | 206 | 2 |
| DGS2 | 1.0 | discover | 269 | 3 |
| DGS2 | 1.0 | validate | 171 | 3 |
| DGS2 | 1.0 | final | 139 | 3 |
| DGS2 | 1.5 | discover | 151 | 5 |
| DGS2 | 1.5 | validate | 90 | 5 |
| DGS2 | 1.5 | final | 80 | 4 |
| DGS10 | 0.5 | discover | 623 | 2 |
| DGS10 | 0.5 | validate | 317 | 2 |
| DGS10 | 0.5 | final | 334 | 2 |
| DGS10 | 0.75 | discover | 413 | 2 |
| DGS10 | 0.75 | validate | 205 | 3 |
| DGS10 | 0.75 | final | 217 | 2 |
| DGS10 | 1.0 | discover | 297 | 3 |
| DGS10 | 1.0 | validate | 153 | 4 |
| DGS10 | 1.0 | final | 150 | 3 |
| DGS10 | 1.5 | discover | 167 | 6 |
| DGS10 | 1.5 | validate | 100 | 6 |
| DGS10 | 1.5 | final | 83 | 6 |
| SLOPE | 0.5 | discover | 574 | 2 |
| SLOPE | 0.5 | validate | 320 | 2 |
| SLOPE | 0.5 | final | 348 | 2 |
| SLOPE | 0.75 | discover | 366 | 3 |
| SLOPE | 0.75 | validate | 236 | 3 |
| SLOPE | 0.75 | final | 218 | 2 |
| SLOPE | 1.0 | discover | 280 | 3 |
| SLOPE | 1.0 | validate | 167 | 3 |
| SLOPE | 1.0 | final | 161 | 3 |
| SLOPE | 1.5 | discover | 167 | 5 |
| SLOPE | 1.5 | validate | 86 | 6 |
| SLOPE | 1.5 | final | 76 | 6 |

## The TradingView line in your chart

- The "C.OG Normalised 10Y and 02Y Yields" script is not in this repo, so its source and timeframe cannot be checked here. In the screenshot the line moves within days (e.g. the 15 Oct spike), so it is not a pure daily series; flat stretches look like carried-forward values. Following your instruction the test treats the yields as daily (FRED), which is what can be verified.