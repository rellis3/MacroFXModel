# Layer 1 — Data specification (Forecaster system)

Part of `plans/FORECASTER_SYSTEM_BLUEPRINT.md`. Every higher layer reads data through these definitions. When code and
this file disagree, that is a layer-1 fault: record it here, then fix the code (side by side if it is live).
Integrity report: `node scripts/data_integrity.mjs` → `analysis/output/data_integrity/REPORT.md`.

## 1. The session (the unit everything is scored on)

| | Definition | Code |
|---|---|---|
| Session date | London calendar date | `bucketM1IntoSessions(packed, 'Europe/London')` |
| Open | first M1 bar at/after 00:00 Europe/London (23:00 UTC in BST, 00:00 UTC in GMT) | `londonMidnightSec`, `fetchSessionOpenLondon` |
| Live realised window | London midnight → audit time (~22:00 UTC, i.e. 23:00 London in BST / 22:00 in GMT) | `vol_session_<date>` (H1, OANDA) |
| Research realised window | London 00:00 → 22:00 (`london22`) | `forge.vol.load_daily(session="london22")` |
| Weekends | excluded; Sunday-evening bars belong to Monday | — |

Known gap: the live window ends at the audit time, research at 22:00 London; the extra ≤ 1 h is quiet and changes HL
by ~0 (median ratio 1.000), but it is a difference, not an identity.

## 2. Daily bars for σ (forecast input)

| Use | Bars | Note |
|---|---|---|
| Live forecast | OANDA `granularity=D`, 800 bars, 17:00 New York close | no Sunday stub |
| Research (must match live) | **NY-close bars built from M1**: `nyCloseDailyBars(packed)`, keep `n >= 60` | `scripts/rangebook/ny_close_d1.mjs` dumps them |
| **Do not use for σ** | `VolRangeForecaster/data/m1/*_d1.parquet` | UTC-midnight days **with Sunday stubs**; a UTC day also overlaps the first London hour in BST |

A σ estimate is only valid for the bar shape it was fitted on (widths are quantiles of realised ÷ σ for one σ series).

## 3. Sources per instrument

| Instruments | Live σ / forecast | Research history | Status |
|---|---|---|---|
| 27 FX pairs (live runs 22 of them), GOLD | OANDA mid | OANDA M1 (`VolRangeForecaster/data/m1/<pair>_m1.parquet`) | consistent |
| NQ, SPX500, US30, US2000, DE30, UK100 | **Yahoo** (`preferYahoo`: NQ=F, ^GSPC, ^DJI, ^RUT, ^GDAXI, ^FTSE) | OANDA M1 (`portfolioBacktest/cache`) | **inconsistent** — exchange sessions and roll vs 24h CFD; index ladders provisional |
| BTCUSD | Yahoo | none | no research history |
| Commodities (SILVER … SUGAR) | OANDA | none local | no research history |
| Implied vol | QuikStrike capture (live), CME settlement inversion `oi_research_book/data/iv_daily_*.parquet` (2020-09 →), CBOE VIX/VXN/GVZ CSVs `analysis/surfaces/cboe/` | — | GVZ also fetched from FRED in the HAR-IV shadow (second source) |
| Calendar | ForexFactory (live), `calendar_events.csv` proxy (research, ends 2026-07-02) | — | research event tags unknown after 2026-07-02 |

## 4. Realised quantities (layer 2 reads these)

All as % of the session open: **HL** = (high − low), **OH** = (high − open), **OL** = (open − low), **OC** = |close − open|.
`vol_session_<date>` stores `oc` **signed** (close − open): take the absolute value before comparing to ladder `oc` rungs.

## 5. Faults found and their state

| # | Fault | Found | State |
|---|---|---|---|
| 1 | `*_d1.parquet` are UTC days with Sunday stubs | 2026-10-05 (LADDER_CALIBRATION Amendment 2) | research switched to NY-close bars. IV-adjusted refit on NY-close bars done side by side (`forge/export_iv_adjusted_params_ny.py` → `js/forecastLadderIvAdjParamsNY.js`, CALIBRATION_NY.md: passes all classes, B÷A 0.92 / 0.95 / 0.97). Refit widths are **~10% smaller** (median 0.90): the stub days biased σ low, the shipped fit compensated with wider widths, and live feeds stub-free bars — so the **live IV-adjusted lines are likely ~10% too wide**. Switching the live export to the NY params is a live change awaiting the user's decision |
| 2 | Live index σ from Yahoo vs research OANDA | 2026-10-04 | **quantified 2026-10-06** (`analysis/system/index_source_gap.py`, training years): Yahoo **cash-index** σ is 14–28% below the OANDA CFD σ the ladders were fitted on (SPX500 0.78, US30 0.81, US2000 0.72, DE30 0.82, UK100 0.86; cash sessions miss the overnight moves). With Yahoo σ the HL p75 line is passed **40–58%** of days instead of 25% (US2000 58%). NQ is fine (NQ=F futures, ratio 1.02, 23%). Live index ladders for those five are far too narrow. Fix (live, user decision): feed them OANDA CFD bars or 24-hour futures (ES=F, YM=F, RTY=F, FDAX/FDXM, Z=F) instead of the cash tickers |
| 3 | vol_session audits after London midnight recorded the next session (6 of 15) | 2026-10-05 | **fixed** cf47b9a0 (late audit pins its own window); the 6 bad records stay bad — readers skip them (`auditUsable` in js/harShadowCore.js and js/dailyReadCore.js; Daily Read unscored them, 5cac377d) |
| 4 | vol_session `oc` signed | 2026-10-05 | documented; readers take abs |
| 5 | Calendar proxy ends 2026-07-02 | 2026-10-04 | open |
| 6 | `inverseVolWeights` full-sample variance (lookahead) | 2026-10-05 | open (outside this system) |
| 7 | Local M1 cache ends 2026-08-21 (46 days stale at 2026-10-05); DE30/UK100 one day earlier | 2026-10-05 (integrity report) | open — top-up exists (`AnalogML/refresh_m1.py`, OANDA) but needs `OANDA_KEY`, not set on this machine |

First integrity report (2026-10-05): no missing weekdays on FX; gold/index gaps are exchange holidays (Good Friday,
DE/UK bank holidays); NY-close stub sessions (< 60 bars) 2–28 per instrument over 10 years, all dropped by the n ≥ 60
rule; SPX500 has 95 short days (< 600 M1 bars), mostly US half-days — check before using SPX intraday paths.
