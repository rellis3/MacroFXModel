# The yield-spread book on 40 untouched years: an independent confirmation (Lesson 02 §05)

*Pre-registered 2026-10-07, before the long dataset was built or any trade simulated. Part of
`plans/WEEK_BEFORE_LESSON_4.md` (item 2). No Vote Atlas input.*

## Why

The yield-spread book is the only directional edge that has survived (`MD files/YIELD_SPREAD_STRATEGY.md`). It was
found and validated on **2015 onwards**. Lesson 02 §05: one passed test lifts the odds of a real edge to ~40% from a
4% base; **an independent second test** lifts it to ~91%. The years before 2015 were never used, so they are that
second test, if the data exists. It does: FRED's free daily FX (H.10, from 1971) and monthly rates (US 2-year from
1976).

## Data (`scripts/ys_long/build.mjs`, FRED public download, no key)

| Pair | FX series | Foreign rate | Start (both legs + z warm-up) |
|---|---|---|---|
| USDJPY | DEXJPUS | IRSTCI01JPM156N (the strategy's own) | 1985 |
| GBPUSD | DEXUSUK | IR3TIB01GBM156N | 1976 |
| AUDUSD | DEXUSAL | IR3TIB01AUM156N | 1976 |
| USDCAD | DEXCAUS | IRSTCI01CAM156N | 1976 |
| USDCHF | DEXSZUS | IRSTCI01CHM156N to 1999-06, then IR3TIB01CHM156N (the strategy's current series) | 1976 |
| EURUSD | DEXUSEU | IRSTCI01DEM156N | 1999 (no daily DEM in the keyless download) |

- **US leg:** GS2 (the strategy's own).
- **FX price:** the noon New York rate, close-only. The strategy only uses daily closes, so nothing is lost.
- **Publication lags:** +2 days (US) / +45 days (foreign), as the strategy.

## The strategy, exactly as validated (no tuning)

- Engine functions reused:
  - `buildRollingZSeries`, z-window 126;
  - entry |z| ≥ 2.0, exit |z| ≤ 1.5 or 20 days;
  - side = `directionFromZ(z, resolveInverted(usdRole))`;
  - cost 0.02% round trip.
- Flat size (the validated honest stream).
- One position per pair at a time, as the engine.

## Test period

**1976-01-01 → 2014-12-31**, the six original pairs. Nothing in this window was used to find, validate or tune the
strategy.

## PASS (all three)

1. Pooled mean net return per trade > 0, with its 95% month-block bootstrap interval wholly above 0.
2. Win rate > 50%.
3. Consistency: mean net return per trade positive in **≥ 3 of the 4 decades** (1976–85, 1986–95, 1996–2005,
   2006–14) **and** in **≥ 4 of the 6 pairs**.

## Reported, no pass weight

- Annualised Sharpe of the daily flat book.
- Per pair and per decade tables.
- The same strategy on the validated era 2015–2026 rebuilt from this FRED data, as a cross-check that the FRED
  rebuild reproduces the M1 version's character (296 trades, 58% wins, PF 1.57).

## Breadth check (separate, same rule)

NZDUSD (DEXUSNZ, IR3TIB01NZM156N), USDNOK (DEXNOUS, IR3TIB01NOM156N), USDSEK (DEXSDUS, IR3TIB01SEM156N), never tested
anywhere, full span 1976/79/82 → 2026.

## What it decides

- **PASS:** the book's edge is confirmed on independent data (odds of a real edge ~40% → ~90% by Lesson 02's
  arithmetic). The long data then also gives meta-labelling the sample it lacked (`plans/WEEK_BEFORE_LESSON_4.md`
  item 4, after a power check).
- **FAIL:** the 2015+ edge did not hold in earlier decades. Treat it as regime-specific; the forward record decides.

## Variant log

| # | Variant | Why | Run? |
|---|---|---|---|
| 0 | as above | registered | — |
