# Release Reaction, Layer 1: data checks

Releases built: 150 (NFP 28, CPI 25, ECB 20, BOJ 20, BOE 20, FOMC 19, REFUNDING 10, UKFISCAL 5, RETAIL 2, PCE 1); skipped for no leg data: 0.

## Clock check: which minute holds the largest 1-minute move of the clock market (SOFR leg for US releases), relative to the stamped release time (0 = the release minute)

| family | era | events | at 0 | within +-1 min | elsewhere | median offset of the elsewhere ones |
|---|---|---|---|---|---|---|
| BOE | US summer time | 14 | 8 | 10 | 4 | 2.5 |
| BOE | US winter time | 6 | 6 | 6 | 0 | - |
| BOJ | US summer time | 16 | 16 | 16 | 0 | - |
| BOJ | US winter time | 4 | 4 | 4 | 0 | - |
| CPI | US summer time | 19 | 15 | 16 | 3 | 2.0 |
| CPI | US winter time | 6 | 5 | 5 | 1 | 3.0 |
| ECB | US summer time | 15 | 5 | 9 | 5 | -4.0 |
| ECB | US winter time | 5 | 2 | 3 | 2 | 2.0 |
| FOMC | US summer time | 14 | 10 | 11 | 3 | 4.0 |
| FOMC | US winter time | 5 | 4 | 5 | 0 | - |
| NFP | US summer time | 18 | 16 | 17 | 1 | 5.0 |
| NFP | US winter time | 10 | 7 | 7 | 3 | -6.0 |
| PCE | US summer time | 1 | 1 | 1 | 0 | - |
| REFUNDING | US summer time | 7 | 0 | 0 | 0 | - |
| REFUNDING | US winter time | 3 | 0 | 0 | 0 | - |
| RETAIL | US summer time | 2 | 1 | 1 | 0 | - |
| UKFISCAL | US summer time | 3 | 1 | 1 | 2 | 8.5 |
| UKFISCAL | US winter time | 2 | 0 | 0 | 2 | 6.0 |

For the US releases the clock market is the SOFR leg; for the others it is the home market (ECB: Euribor leg, BoE and UK fiscal: gilt, BoJ: USD/JPY, refunding: 10y note). The BoJ minute is itself taken from USD/JPY, so its row is 0 by construction.

BoJ minute found from USD/JPY vs the vendor's to-the-minute stamp (2024-25): 2024-06-14 found 03:23 vendor 02:23, 2024-09-20 found 02:53 vendor 01:52, 2024-12-19 found 02:52 vendor 02:52, 2025-03-19 found 02:30 vendor 02:25


Releases whose largest clock-market move is more than a minute from the stamped time: 2024-05-01T18:00:00Z|FOMC (+2), 2024-08-01T11:00:00Z|BOE (+3), 2024-08-14T12:30:00Z|CPI (+2), 2024-09-12T12:15:00Z|ECB (+3), 2024-10-10T12:30:00Z|CPI (+2), 2024-10-17T12:15:00Z|ECB (-8), 2024-12-11T13:30:00Z|CPI (+3), 2024-12-12T13:15:00Z|ECB (+2), 2025-02-07T13:30:00Z|NFP (-6), 2025-03-07T13:30:00Z|NFP (+3), 2025-03-26T12:30:00Z|UKFISCAL (+8), 2025-04-04T12:30:00Z|NFP (+5), 2025-05-07T18:00:00Z|FOMC (+4), 2025-05-08T11:00:00Z|BOE (+2), 2025-07-24T12:15:00Z|ECB (-4), 2025-10-30T13:15:00Z|ECB (-10), 2025-11-07T13:30:00Z|NFP (-10), 2025-11-26T11:40:00Z|UKFISCAL (+10), 2025-12-18T13:15:00Z|ECB (+2), 2026-03-03T12:30:00Z|UKFISCAL (+2), 2026-03-11T12:30:00Z|CPI (+4), 2026-04-29T18:00:00Z|FOMC (+8), 2026-06-11T12:15:00Z|ECB (+7), 2026-06-18T11:00:00Z|BOE (+9), 2026-07-30T11:00:00Z|BOE (+2), 2026-10-28T12:30:00Z|UKFISCAL (+9)

## Coverage by asset (releases with a path / 1-minute path / 15-minute CFD path / none)

| asset | with a path | 1-minute | 15-minute | none |
|---|---|---|---|---|
| SOFR Sep26 leg (bp) | 148 | 148 | 0 | 2 |
| Euribor Mar27 leg (bp) | 144 | 144 | 0 | 6 |
| SOFR - Euribor line (bp) | 144 | 144 | 0 | 6 |
| US 2y note future (%) | 134 | 27 | 107 | 16 |
| US 10y note future (%) | 130 | 8 | 122 | 20 |
| Dollar index future (%) | 9 | 9 | 0 | 141 |
| Nasdaq (%) | 149 | 149 | 0 | 1 |
| EUR/USD (%) | 149 | 149 | 0 | 1 |
| GBP/USD (%) | 149 | 149 | 0 | 1 |
| USD/JPY (%) | 149 | 149 | 0 | 1 |
| Gold (%) | 148 | 148 | 0 | 2 |
| S&P 500 (%) | 149 | 149 | 0 | 1 |
| VIX (points) | 8 | 8 | 0 | 142 |
| VXN (points) | 1 | 1 | 0 | 149 |
| UK 10y gilt (%) | 113 | 113 | 0 | 37 |
| German 10y Bund (%) | 136 | 136 | 0 | 14 |
| FTSE 100 (%) | 149 | 149 | 0 | 1 |
| DAX (%) | 146 | 146 | 0 | 4 |
| Nikkei 225 (%) | 150 | 150 | 0 | 0 |

## Quote density in the 30 minutes after the release (1-minute bars present, of 30)

- SOFR leg: median 30, fewer than 20 bars in 0 of 144 releases.
- Euribor leg: median 30, fewer than 20 bars in 0 of 144 releases.
- Euribor leg unchanged at +30 minutes in 28 of 144 releases; of those, 0 had fewer than 20 bars (a stale midpoint, not a measured non-reaction).


## Days view: releases with a daily path (of the releases built)

| series | releases with a path | newest daily close |
|---|---|---|
| SOFR Sep26 leg (bp) | 146 | 2026-10-23 |
| Euribor Mar27 leg (bp) | 144 | 2026-10-23 |
| SOFR - Euribor line (bp) | 143 | 2026-10-23 |
| US 2y yield (bp) | 148 | 2026-10-27 |
| US 10y yield (bp) | 148 | 2026-10-27 |
| 10y real yield (bp) | 148 | 2026-10-27 |
| 10y breakeven (bp) | 148 | 2026-10-27 |
| Dollar index (%) | 148 | 2026-10-28 |
| Nasdaq-100 (%) | 148 | 2026-10-28 |
| EUR/USD (%) | 149 | 2026-10-26 |
| GBP/USD (%) | 149 | 2026-10-26 |
| USD/JPY (%) | 149 | 2026-10-26 |
| Gold (%) | 147 | 2026-10-26 |
| S&P 500 (%) | 146 | 2026-10-26 |
| VIX (points) | 148 | 2026-10-28 |
| VXN (points) | 148 | 2026-10-28 |
| UK 10y gilt price (%) | 149 | 2026-10-28 |
| German 10y Bund price (%) | 146 | 2026-10-28 |
| FTSE 100 (%) | 148 | 2026-10-27 |
| DAX (%) | 145 | 2026-10-27 |
| Nikkei 225 (%) | 147 | 2026-10-27 |
