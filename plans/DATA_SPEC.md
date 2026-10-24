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
| 1 | `*_d1.parquet` are UTC days with Sunday stubs | 2026-10-05 (LADDER_CALIBRATION Amendment 2) | research switched to NY-close bars. IV-adjusted refit on NY-close bars done side by side (`forge/export_iv_adjusted_params_ny.py` → `js/forecastLadderIvAdjParamsNY.js`, CALIBRATION_NY.md: passes all classes, B÷A 0.92 / 0.95 / 0.97). Refit widths are **~10% smaller** (median 0.90): the stub days biased σ low, the shipped fit compensated with wider widths, and live feeds stub-free bars — so the **live IV-adjusted lines are likely ~10% too wide**. **Switched 2026-10-06**: js/forecastLadderIvAdj.js now uses the NY params (old file kept for the record) |
| 2 | Live index σ from Yahoo vs research OANDA | 2026-10-04 | **quantified 2026-10-06** (`analysis/system/index_source_gap.py`, training years): Yahoo **cash-index** σ is 14–28% below the OANDA CFD σ the ladders were fitted on (SPX500 0.78, US30 0.81, US2000 0.72, DE30 0.82, UK100 0.86; cash sessions miss the overnight moves). With Yahoo σ the HL p75 line is passed **40–58%** of days instead of 25% (US2000 58%). NQ is fine (NQ=F futures, ratio 1.02, 23%). Live index ladders for those five are far too narrow. **Fixed 2026-10-06**: for these five the scheduler also fetches OANDA NY-close bars; the ladder family, the HAR shadow and the IV-adjusted export are built from them (`ladder_sigma_source: 'oanda'`), the old Yahoo-σ daily ladder is kept beside it as `ladder_yahoo`, and the incumbent range bands stay on Yahoo (what they were calibrated on) |
| 3 | vol_session audits after London midnight recorded the next session (6 of 15) | 2026-10-05 | **fixed** cf47b9a0 (late audit pins its own window); the 6 bad records stay bad — readers skip them (`auditUsable` in js/harShadowCore.js and js/dailyReadCore.js; Daily Read unscored them, 5cac377d) |
| 4 | vol_session `oc` signed | 2026-10-05 | documented; readers take abs |
| 5 | Calendar proxy ends 2026-07-02 | 2026-10-04 | open |
| 6 | `inverseVolWeights` full-sample variance (lookahead) | 2026-10-05 | open (outside this system) |
| 7 | Local M1 cache ends 2026-08-21 (46 days stale at 2026-10-05); DE30/UK100 one day earlier | 2026-10-05 (integrity report) | open — top-up exists (`AnalogML/refresh_m1.py`, OANDA) but needs `OANDA_KEY`, not set on this machine |
| 8 | Net liquidity units: FRED ships WALCL **and WTREGEN** in $ millions, RRPONTSYD in $ billions. The 2026-07-02 "WALCL fix" assumed WTREGEN was in billions and converted WALCL only, so the live liquidity gate, macroEquityEngine, globalLiquidityEngine's USD block and liquidityNetRegressionCore computed roughly −TGA (21-day change correlates −0.19 with the correct series; direction agrees 26% of days since 2021). Older copies dropped RRP instead (corr +0.90, 77%). | 2026-10-17 (fredgraph CSV magnitudes) | **fixed** in code: one definition `js/netLiquidity.js` (+ test); classic-script and Python copies use the same arithmetic inline. Results banked on the old series need a re-run: Q6 macro-equity, liquidity-gate backtest, and the three 2026-10-03 macro-confluence verdicts (RRP dropped). The G1 tide null used correct units and stands. |
| 9 | Feature store `px_d1_*` for FX and gold carries **Saturday/Sunday rows** 2002-2013 (EURUSD 38-98 a year, then 1-2 in 2015/17/19; indices have none). Prices are continuous so P&L sums are kept, but anything that counts rows as trading days is off: annualisation at 252 (Sharpe ~7% low, CAGR low, years too many), EWMA vol (diluted by near-zero weekend returns), `horizonDays` forward windows (shorter in calendar time) and daily-rebalance decisions (extra ones on weekends) | 2026-10-19 (portfolio-book: grid had 5,373 dates for 18.5 years) | open in the store and in `runStudy`. `scripts/portfolio-book/run.mjs` folds weekend rows into the next weekday (A4). Fix belongs in `analysis/features/build_features.py` (drop weekend dates, carry their move into Monday) then re-run the harness studies with pre-2014 FX windows (register row `harness-weekend-rows`) |
| 10 | Range-line **Monday ladder** is built from the wrong day in one place per season. Design (owner, 2026-10-19): Monday's own session, complete at London Tuesday midnight; Tue–Fri use this week's Monday, Monday uses last week's. (a) **Backtest at `boundaryHour 0`**: `bucketM1IntoSessions` labels every UTC day one day late (`getUTCHours() >= 0` is always true), so `runRangeLineAnalyser`'s Monday session is **Sunday evening's stub** (EURUSD label 2026-08-03: 174 bars, Sun 21:04–23:59 UTC). Correct at 22/23. Affects `/api/range-line/run` at its default 0 and the policy freeze when `_rlBoundaryHour()` is 0 (GMT). (b) **Live bot at `boundaryHour 23` (BST)**: `monday_anchor_epoch` takes the weekday of the 23:00 UTC session open, which is the previous UTC day, so it builds "Monday" from the London **Tuesday** session (Mon 23:00 → Tue 23:00 UTC) and on Tuesday still uses last week's. Correct at 0 (GMT): checked on 2026-11-02..06. Net: in BST the bot trades a different Monday ladder from the one its policy was learned on; in GMT the backtest is the wrong one | 2026-10-19 (range-ladder-placebo A1; live rule checked by running `monday_anchor_epoch`) **2026-10-24 (owner rule): range-line sessions are London midnight on the London calendar**: plan/route/confluence/bot use `boundaryHour: 'Europe/London'` (DST-aware, no re-freeze at clock changes); fixed UTC hours remain only as an explicit override or a comparison option. Tests: `js/rangeLineConfluenceProducer.test.mjs`, `range_line_bot/london_anchor_test.py` |
| 11 | **OI book next-day targets** (`oi_research_book/scripts/01_build_daily_dataset.py`): (a) "next day" = next row of a UTC D1 file with Sunday stubs, so Friday rows target the Sunday-evening stub (NQ: 164 of 168 Fridays, mean DR 0.24 vs ~1.05) and rv20 runs across stub returns; (b) OI for trade date D is published ~15:00-16:00 UTC on D+1, but range tests pair OI(D) with session D+1, so the predictor arrives mid-session. Touches `gex-range` (NQ; dropping Fridays moves raw ΔDR +0.176 → +0.204, so (a) adds noise, not the effect) and every OI-book daily test built on `fwd_hi_1d`/`fwd_lo_1d` | 2026-10-20 (gex-range-es prep) | **open**: re-run of `gex-range` registered as Q2 of `oi_research_book/GEX_RANGE_ES_PREREG.md` (New York-close M1 sessions, OI(D) → session D+2). Builder not changed (banked results stay reproducible) |

First integrity report (2026-10-05): no missing weekdays on FX; gold/index gaps are exchange holidays (Good Friday,
DE/UK bank holidays); NY-close stub sessions (< 60 bars) 2–28 per instrument over 10 years, all dropped by the n ≥ 60
rule; SPX500 has 95 short days (< 600 M1 bars), mostly US half-days — check before using SPX intraday paths.
