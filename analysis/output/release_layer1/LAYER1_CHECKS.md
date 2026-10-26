# Release Reaction, Layer 1: data checks

Releases built: 75 (NFP 28, CPI 25, FOMC 19, RETAIL 2, PCE 1); skipped for no leg data: 0.

## Clock check: which minute holds the largest 1-minute move of the SOFR leg, relative to the stamped release time (0 = the release minute)

| family | era | events | at 0 | within +-1 min | elsewhere | median offset of the elsewhere ones |
|---|---|---|---|---|---|---|
| CPI | US summer time | 19 | 15 | 16 | 3 | 2.0 |
| CPI | US winter time | 6 | 5 | 5 | 1 | 3.0 |
| FOMC | US summer time | 14 | 10 | 11 | 3 | 4.0 |
| FOMC | US winter time | 5 | 4 | 5 | 0 | - |
| NFP | US summer time | 18 | 16 | 17 | 1 | 5.0 |
| NFP | US winter time | 10 | 7 | 7 | 3 | -6.0 |
| PCE | US summer time | 1 | 1 | 1 | 0 | - |
| RETAIL | US summer time | 2 | 1 | 1 | 0 | - |

Releases whose largest SOFR-leg move is more than a minute from the stamped time: 2024-05-01T18:00:00Z|FOMC (+2), 2024-08-14T12:30:00Z|CPI (+2), 2024-10-10T12:30:00Z|CPI (+2), 2024-12-11T13:30:00Z|CPI (+3), 2025-02-07T13:30:00Z|NFP (-6), 2025-03-07T13:30:00Z|NFP (+3), 2025-04-04T12:30:00Z|NFP (+5), 2025-05-07T18:00:00Z|FOMC (+4), 2025-11-07T13:30:00Z|NFP (-10), 2026-03-11T12:30:00Z|CPI (+4), 2026-04-29T18:00:00Z|FOMC (+8)

## Coverage by asset (releases with a path / 1-minute path / 15-minute CFD path / none)

| asset | with a path | 1-minute | 15-minute | none |
|---|---|---|---|---|
| SOFR Sep26 leg (bp) | 75 | 75 | 0 | 0 |
| Euribor Mar27 leg (bp) | 73 | 73 | 0 | 2 |
| SOFR - Euribor line (bp) | 73 | 73 | 0 | 2 |
| US 2y note future (%) | 75 | 13 | 62 | 0 |
| US 10y note future (%) | 75 | 6 | 69 | 0 |
| Dollar index future (%) | 6 | 6 | 0 | 69 |
| Nasdaq (%) | 75 | 75 | 0 | 0 |
| EUR/USD (%) | 75 | 75 | 0 | 0 |
| GBP/USD (%) | 75 | 75 | 0 | 0 |
| USD/JPY (%) | 75 | 75 | 0 | 0 |
| Gold (%) | 74 | 74 | 0 | 1 |
| S&P 500 (%) | 75 | 75 | 0 | 0 |
| VIX (points) | 6 | 6 | 0 | 69 |
| VXN (points) | 1 | 1 | 0 | 74 |

## Quote density in the 30 minutes after the release (1-minute bars present, of 30)

- SOFR leg: median 30, fewer than 20 bars in 0 of 73 releases.
- Euribor leg: median 30, fewer than 20 bars in 0 of 73 releases.
- Euribor leg unchanged at +30 minutes in 9 of 73 releases; of those, 0 had fewer than 20 bars (a stale midpoint, not a measured non-reaction).


## Days view: releases with a daily path (of the releases built)

| series | releases with a path | newest daily close |
|---|---|---|
| SOFR Sep26 leg (bp) | 74 | 2026-10-26 |
| Euribor Mar27 leg (bp) | 73 | 2026-10-26 |
| SOFR - Euribor line (bp) | 73 | 2026-10-26 |
| US 2y yield (bp) | 75 | 2026-10-26 |
| US 10y yield (bp) | 75 | 2026-10-26 |
| 10y real yield (bp) | 75 | 2026-10-26 |
| 10y breakeven (bp) | 75 | 2026-10-26 |
| Dollar index (%) | 74 | 2026-10-26 |
| Nasdaq-100 (%) | 74 | 2026-10-26 |
| EUR/USD (%) | 75 | 2026-10-26 |
| GBP/USD (%) | 75 | 2026-10-26 |
| USD/JPY (%) | 75 | 2026-10-26 |
| Gold (%) | 74 | 2026-10-26 |
| S&P 500 (%) | 73 | 2026-10-26 |
| VIX (points) | 74 | 2026-10-26 |
| VXN (points) | 74 | 2026-10-26 |
