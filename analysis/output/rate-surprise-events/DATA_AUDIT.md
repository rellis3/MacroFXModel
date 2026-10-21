# rate-surprise-events: data and timestamp audit

Computed before any post-signal outcome. All prices: OANDA M15 mid (one source, 2009-11 → 2026-08-21; fetched read-only with an explicit end at the lockbox).

- Events kept: 526 — FOMC 131, CPI 196, NFP 199; by split: discover 256, validate 127, test 143 (discover 2010–17, validate 2018–21, test 2022 → 2026-08-21).
- Sources: ff_calendar for 2010–17 (dates, actual, forecast; clock times taken from the published schedule because many ff rows carry a date-only placeholder stamp), calendar_events.csv for 2018+ (UTC stamps).
- FOMC statement times: 14:00 ET from 2013; 14:15 ET in 2010–12, except the 2011–12 press-conference meetings at 12:30 ET.
- Data surprise available: CPI 94%, NFP 93%; FOMC decisions that differed from consensus: 2 of 131.
- 2y rate surprise available 94% (CFD price unchanged across the window: 6%); 10y 99%.
- Entry price present: EURUSD 100%, NAS100 100%.
- Correlation of the 2y rate surprise with the asset's own window reaction: EURUSD -0.83, NAS100 -0.40; data surprise with reaction: EURUSD -0.14, NAS100 -0.04.

## Timestamp check: mean |US 2y CFD move| (bp of price) per 15-min bar from the release (offset 0 = the bar starting at the release)

| offset | CPI 2010-17 | CPI 2018-26 | FOMC 2010-17 | FOMC 2018-26 | NFP 2010-17 | NFP 2018-26 |
|---|---|---|---|---|---|---|
| -4 | 0.53 | 0.59 | 0.59 | 0.69 | 0.50 | 0.71 |
| -3 | 0.57 | 0.94 | 0.45 | 0.55 | 0.46 | 0.97 |
| -2 | 0.48 | 0.92 | 0.49 | 0.63 | 0.63 | 0.97 |
| -1 | 0.65 | 1.15 | 1.28 | 0.87 | 1.36 | 0.95 |
| 0 | 2.03 | 8.12 | 4.45 | 6.12 | 5.36 | 7.78 |
| 1 | 0.84 | 2.07 | 1.55 | 1.62 | 1.28 | 2.21 |
| 2 | 0.60 | 1.85 | 1.34 | 4.67 | 0.95 | 1.56 |
| 3 | 0.63 | 1.43 | 1.25 | 2.78 | 0.89 | 1.43 |
| 4 | 0.57 | 1.66 | 0.81 | 1.58 | 0.96 | 1.61 |
| 5 | 0.68 | 1.31 | 0.72 | 2.50 | 0.73 | 1.28 |

Peak bar per family/era: {'CPI/2010-17': 0, 'CPI/2018-26': 0, 'FOMC/2010-17': 0, 'FOMC/2018-26': 0, 'NFP/2010-17': 0, 'NFP/2018-26': 0} (0 expected; FOMC can also spike at the press conference).