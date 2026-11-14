# post-release-drift-pooled: event table and data audit

Signal side only (calendar values, the 2y CFD move inside [t, t+15]); no price after entry is read here.
- Re-clocked to 08:30 ET (stamp off by <= 1h): 14 PPI 2014-04-11, PPI 2014-05-14, PPI 2014-06-13, PPI 2014-07-16, PPI 2014-08-15, PPI 2014-09-16, PPI 2014-10-15, PPI 2015-04-14, PPI 2015-05-14, PPI 2015-06-12, PPI 2015-07-15, PPI 2015-08-14, PPI 2015-09-11, PPI 2015-10-14
- Dropped as off-schedule (unscheduled FOMC actions, odd stamps): 2 FOMC 2020-03-03 15:00Z, FOMC 2020-03-15 21:00Z
- Dropped after the lockbox date: 10

## Timestamp check: mean |US 2y CFD 15-min log change| (bp) by bar offset from the release bar

| family / era | -4 | -3 | -2 | -1 | 0 | 1 | 2 | 3 | 4 | 5 | peak |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CPI 2010-17 | 0.53 | 0.57 | 0.48 | 0.65 | 2.03 | 0.84 | 0.60 | 0.63 | 0.57 | 0.68 | 0 |
| CPI 2018-26 | 0.59 | 0.94 | 0.91 | 1.16 | 8.11 | 2.06 | 1.82 | 1.42 | 1.66 | 1.30 | 0 |
| FOMC 2010-17 | 0.59 | 0.45 | 0.49 | 1.28 | 4.45 | 1.55 | 1.34 | 1.25 | 0.81 | 0.72 | 0 |
| FOMC 2018-26 | 0.69 | 0.55 | 0.64 | 0.87 | 6.17 | 1.63 | 4.64 | 2.80 | 1.55 | 2.46 | 0 |
| NFP 2010-17 | 0.50 | 0.46 | 0.63 | 1.36 | 5.36 | 1.28 | 0.95 | 0.89 | 0.96 | 0.73 | 0 |
| NFP 2018-26 | 0.71 | 0.96 | 0.96 | 0.94 | 7.82 | 2.21 | 1.55 | 1.43 | 1.61 | 1.29 | 0 |
| PPI 2010-17 | 0.46 | 0.51 | 0.60 | 0.63 | 1.96 | 0.72 | 0.56 | 0.63 | 0.93 | 0.79 | 0 |
| PPI 2018-26 | 0.91 | 0.90 | 1.11 | 1.10 | 2.96 | 1.26 | 1.47 | 1.33 | 1.26 | 1.09 | 0 |

Family x era dropped by the timestamp check: none

## Coverage (exact)

| family | years | events | signal != 0 | in line | no consensus / no 2y move | timestamp-dropped |
|---|---|---|---|---|---|---|
| CPI | 2010-2026 | 198 | 140 | 58 | 0 | 0 |
| NFP | 2010-2026 | 200 | 197 | 2 | 1 | 0 |
| PPI | 2014-2026 | 151 | 139 | 11 | 1 | 0 |
| FOMC | 2010-2026 | 132 | 123 | 0 | 9 | 0 |
| **total** | | 681 | 599 | | | |

Signal events by year: 2010: 27, 2011: 27, 2012: 24, 2013: 25, 2014: 37, 2015: 38, 2016: 38, 2017: 37, 2018: 36, 2019: 41, 2020: 40, 2021: 40, 2022: 43, 2023: 41, 2024: 40, 2025: 38, 2026: 27

Agreement defined (data families): 420 (CPI 121, NFP 184, PPI 115); tercile assigned: 472
Mirror events (signal != 0): MIRROR_EA 62 (2018-2026), MIRROR_UK 80 (2018-2026)

## Spot-check against first prints (prereg §3.1): fill the last column from the BLS / Fed archive

| family | release (UTC) | field | actual | consensus | first print (BLS/Fed) |
|---|---|---|---|---|---|
| CPI | 2020-11-12 13:30 | core | 0.0 | 0.2 | 0.0 (BLS cpi_11122020) match |
| CPI | 2021-03-10 13:30 | core | 0.1 | 0.2 | 0.1 (BLS cpi_03102021) match |
| CPI | 2023-12-12 13:30 | core | 0.3 | 0.3 | 0.3 (BLS cpi_12122023) match |
| CPI | 2024-04-10 12:30 | core | 0.4 | 0.3 | 0.4 (BLS cpi_04102024) match |
| CPI | 2024-07-11 12:30 | core | 0.1 | 0.2 | 0.1 (BLS cpi_07112024) match |
| NFP | 2015-06-05 12:30 | headline | 280000.0 | 222000.0 | +280,000 (BLS empsit_06052015) match |
| NFP | 2015-12-04 13:30 | headline | 211000.0 | 201000.0 | +211,000 (BLS empsit_12042015) match |
| NFP | 2016-06-03 12:30 | headline | 38000.0 | 159000.0 | +38,000 (BLS empsit_06032016) match |
| NFP | 2017-02-03 13:30 | headline | 227000.0 | 170000.0 | +227,000 (BLS empsit_02032017) match |
| NFP | 2018-04-06 12:30 | headline | 103000.0 | 193000.0 | +103,000 (BLS empsit_04062018) match |
| PPI | 2018-10-10 12:30 | headline | 0.2 | 0.2 | +0.2 (BLS ppi_10102018) match |
| PPI | 2019-02-14 13:30 | headline | -0.1 | 0.1 | -0.1 (BLS ppi_02142019) match |
| PPI | 2023-03-15 12:30 | headline | -0.1 | 0.3 | -0.1 (BLS ppi_03152023) match |
| PPI | 2024-01-12 13:30 | headline | -0.1 | 0.1 | -0.1 (BLS ppi_01122024) match |
| PPI | 2025-06-12 12:30 | headline | 0.1 | 0.2 | +0.1 (BLS ppi_06122025) match |
| FOMC | 2018-06-13 18:00 | rate | 2.0 | 2.0 | 1.75-2.00, upper 2.0 (Fed statement 2018-06-13) match |
| FOMC | 2018-11-08 19:00 | rate | 2.25 | 2.25 | 2.00-2.25, upper 2.25 (Fed statement 2018-11-08) match |
| FOMC | 2022-09-21 18:00 | rate | 3.25 | 3.25 | 3.00-3.25, upper 3.25 (Fed statement 2022-09-21) match |
| FOMC | 2025-07-30 18:00 | rate | 4.5 | 4.5 | 4.25-4.50, upper 4.5 (Fed statement 2025-07-30) match |
| FOMC | 2025-12-10 19:00 | rate | 3.75 | 3.75 | 3.50-3.75, upper 3.75 (Fed statement 2025-12-10) match |

Rule: more than 2 of 20 mismatches flags the family; the flag is reported next to its slice.

**Spot-check filled 2026-11-14 (laptop run):** 20 / 20 checked against the archived BLS release text (bls.gov/news.release/archives/{cpi,empsit,ppi}_MMDDYYYY.htm: core CPI m/m, nonfarm payrolls change, PPI final demand m/m, all seasonally adjusted, as first printed) and the FOMC statements (federalreserve.gov monetaryYYYYMMDDa.htm; the `rate` field is the upper bound of the target range). **0 mismatches**: no family is flagged. ALFRED vintages were not used (no FRED key in this shell; fredgraph.csv ignores `vintage_date` and returns revised values).
