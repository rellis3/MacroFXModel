# Does a rate spread (fed funds, curve, real yields, credit, another pair's yield book) give the DIRECTION at C.OG's lines?

*Pre-registered 2026-10-07, before any signal was joined to a trade. Owner: "the direction matters somehow ... a lagging yield
of a different pair ... a confluence"; and C.OG to the owner directly: "the interesting stuff to look into next could be a
really deep dive on all types of spreads and areas such as fed funds rate".*

## Why this design

forge/COG_SETUPS_PREREG.md: his line locations are real but no PRICE-based direction (20-day trend, prior day) makes them pay;
fading with the 20-day trend is the only consistent tilt. The owner's idea is that direction comes from rates, possibly from a
different market than the one traded. Many spreads × lookbacks × signs × instruments is a large search, so the search itself
is what gets tested: each instrument picks its best spread **on past years only**, is scored on the next year, and the whole
procedure is run again on time-shifted spreads (placebo) to see whether real timing beats luck.

## Trades (fixed, from the setups study)

EURUSD, GOLD, NQ; M1; London sessions 2016-10 → 2026-08; his formula on the rebuilt σ (median line 0.74σ, 75th 1.24σ).

- **A — fade at his median line** (exactly as COG_SETUPS: stop his 75th, target halfway back to the open).
- **C — continue through his median line** (new): stop order at open ± 0.74σ in the breakout direction, stop 0.5σ back
  (open ± 0.24σ), target his 75th line (1:1), else out 22:00. Same fill rules (stop first on the fill bar), same costs.

Each trade has a side (+1 long / −1 short). A direction signal keeps a trade only when its side agrees with the signal.

## Direction signals (FRED daily, no key; cached under analysis/output/cog_yield_dir/fred/)

Twelve rate series / spreads:
1. DGS2 (2y) · 2. DGS10 (10y) · 3. DFII10 (10y real) · 4. T10YIE (10y breakeven) · 5. T10Y2Y (2s10s) · 6. T10Y3M (10y−3m)
7. **DGS2 − DFF** (market Fed path vs fed funds) · 8. **DTB3 − DFF** (bills vs fed funds) · 9. **DFF** (fed funds itself)
10. BAA10Y (credit spread) · 11. BAA10Y − AAA10Y (quality spread)
12. **The yield-spread book's net USD stance on the OTHER pairs** (open trades from ys_run.json; long USDxxx / short xxxUSD =
    +1 each, excluding the traded pair; this is "a lagging yield of a different pair").

Each read four ways: change over 1, 5 and 20 observations, and the level vs its trailing 252-observation median
(sign only). 12 × 4 = 48 signals; the trade side to take is sign(signal) × s, with s = +1 or −1 chosen by the search
(e.g. "real yields up → gold short"). With the two setups: **192 choices per instrument.**

**Point in time:** for London session D, only observations dated strictly before the previous business day (Monday uses
Thursday). FRED prints a day's yield the next US afternoon, after London has opened; this is the conservative reading.
The book's stance uses trades entered at a close before D.

## Walk-forward (the primary)

Test years 2019 … 2026 (2026 = to 08-20). For each instrument and test year: among the 192 choices, take the one with the
best mean net R on all sessions before that year (minimum 150 trades), apply it unchanged to the test year. Concatenate.

## PASS (all three)

1. Pooled out-of-sample mean net R > 0, 95% month-block bootstrap interval above 0.
2. Out-of-sample minus the same setup with no direction filter > 0, interval above 0.
3. **Placebo:** 500 runs with every spread series circularly shifted by an independent random offset of ≥ 250 observations
   (keeps each series' shape and persistence, breaks its timing to the trades), full walk-forward each time. Real OOS mean R
   must beat ≥ 95% of placebo runs.

Reported, not deciding: which spread each instrument picked each year (stability: a real driver keeps being picked), the
in-sample best of 192 (what cherry-picking would have claimed), per instrument, each spread family's fixed-sign results.

## What it decides

- **PASS:** rate direction at his lines is real. The picked spread(s) go into the Signal Journal as a paper forward test:
  "EURUSD at his ↓median: 2s-minus-fed-funds says DOWN → skip the fade / take the continuation".
- **FAIL:** no daily US rate spread, read this way, tells the direction at his lines. Remaining leads: non-US daily rates
  (not on FRED daily; would need a new source), intraday rate moves (same-bar only so far), or his discretion.

Stopping rule: one logged variant at most (e.g. a one-day-earlier timing if the conservative lag is shown to be the issue).
Output `analysis/output/cog_yield_dir/RESULTS.md`; scripts `scripts/cog_yield_dir/build.py` + `score.py`.
