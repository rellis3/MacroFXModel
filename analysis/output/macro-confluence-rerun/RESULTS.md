# macro-confluence-rerun — results

Re-run of the three 2026-10-03 macro-confluence studies after the net-liquidity unit fix
(`plans/DATA_SPEC.md` §5 #8). Preregs (unchanged): `MD files/MACRO_CONFLUENCE_DIRECTION_PREREG.md`,
`MD files/MACRO_CONFLUENCE_BAA_CREDIT_PREREG.md`, `MD files/MACRO_CONFLUENCE_RANGE_PREREG.md` (all committed
2026-10-03 before their harnesses). Run 2026-10-24, seed 20261003, B = 1000, block 5 (the scripts' own constants,
unchanged). Branch `worktree-agent-abe91e57843ba5c43`. Ledger ids: `macro-confluence-direction`,
`macro-confluence-baa-credit`, `macro-confluence-range`.

## Verdicts

| Ledger id | Banked 2026-10-03 | Re-run 2026-10-24 |
|---|---|---|
| macro-confluence-direction | context (UNTESTABLE: 12 + 5 episodes < 30) | **UNDERPOWERED** (UNTESTABLE again: 14 + 7 episodes < 30) |
| macro-confluence-baa-credit | null (one EURUSD cell nominally real, failed the mirror) | **NULL** (no cell clears its interval; gate fails on all 6) |
| macro-confluence-range | null | **not re-run: PARKED** (needs OANDA D1 high/low 2007-2026; see below) |

## What was run

`scripts/macro-confluence-rerun/run.mjs` executes each registered script **unchanged** apart from declared,
string-asserted substitutions:

1. **Prices.** The scripts call OANDA `fetchD1(sym, 5000)`; `OANDA_KEY` is not available to this session. The same
   OANDA D1 candles (granularity D, price M, default 17:00 New York alignment, same close-day label) are in the
   feature store (`features/px_d1_{eurusd,spx500,xauusd}.parquet`, exported by `export_closes.py`). Cut at
   2026-10-02 (the last bar the 2026-10-03 run could see) and the last 5000 rows taken.
   **Check:** with the old net-liquidity line put back (`run.mjs baa_credit old`) the run reproduces the banked
   `analysis/output/macro_confluence_baa_credit.json` exactly: 39/38 episodes, all 12 cells identical in n, diff,
   CI and REAL flag (0 mismatches). The substitution is exact.
2. **FRED** is fetched from fredgraph.csv as the scripts always did. The ICE HY OAS series (direction study only)
   is a rolling ~3-year window on FRED, so its start moved from 2023-10-03 to ~2023-10-24 since the original run:
   the old-units direction run gives 11 + 5 episodes (span from 2023-11-22) against the banked 12 + 5 (from
   2023-11-01). That is FRED's data window, not the substitution.
3. **Net liquidity** uses the scripts' current line (`WALCL/1000 − WTREGEN/1000 − RRPONTSYD`, $bn). The banked runs
   had `WALCL − WTREGEN − RRPONTSYD` in mixed units, which drops RRP (÷1000 weight).

## Bug found while re-running: SPX500 and GOLD outcomes were read at the wrong dates

All three scripts build `dates` from the EURUSD bars and then read each instrument's outcome at **position** `i`
(`L.bars[i]`). The date→row map `L.idx` is built but never used. Each instrument has 5000 rows, but EURUSD carries
Saturday/Sunday rows before 2014 (DATA_SPEC §5 #9) and SPX500/GOLD have different holidays, so `L.bars[i]` is a
different date from `dates[i]`: SPX500's first row is 2007-08-02 against EURUSD's 2008-12-06 (about 16 months
apart at the start, closing to zero by 2026), GOLD's is 2008-08-14 (about 4 months). Every SPX500 and GOLD cell in
the three banked results was scored at a date other than the setup date. EURUSD cells are unaffected.

`run.mjs … aligned` adds one more substitution: join each instrument to the spine **by date** (as the preregs
define the outcome). Spine dates the instrument has no bar for give no outcome: SPX500 control n falls from 2,114
to 1,936 at H5 and GOLD from 2,114 to 2,059 (FX weekend rows and exchange holidays); no confluence event was lost
(n stays 45 / 42). The aligned run is the one this
file scores, because it is what the prereg specifies; the as-coded run is reported beside it and reaches the same
verdict.

## Scored cells: macro-confluence-baa-credit

Forward return difference (event − control, %), block-bootstrap 95% CI; `*` = CI excludes zero.

| Cell | Banked (old units, as coded) | Fixed units, as coded | **Fixed units, date-aligned (scored)** |
|---|---|---|---|
| EURUSD +1 H5 | −0.255 [−0.52, +0.01] | −0.099 [−0.36, +0.15] | −0.099 [−0.36, +0.15] |
| EURUSD +1 H20 | −0.616 [−1.12, −0.08]* | −0.580 [−1.18, +0.04] | −0.580 [−1.18, +0.04] |
| EURUSD −1 H5 | −0.065 [−0.47, +0.29] | +0.102 [−0.30, +0.50] | +0.102 [−0.30, +0.50] |
| EURUSD −1 H20 | −0.023 [−0.81, +0.69] | +0.217 [−0.75, +1.19] | +0.217 [−0.75, +1.19] |
| SPX500 +1 H5 | −0.358 [−1.27, +0.59] | −0.170 [−1.07, +0.66] | +0.178 [−0.28, +0.65] |
| SPX500 +1 H20 | +0.847 [−0.05, +1.77] | +1.007 [−0.04, +1.93] | +0.113 [−1.05, +1.21] |
| SPX500 −1 H5 | +0.177 [−0.62, +0.89] | −0.039 [−0.68, +0.71] | −0.265 [−1.10, +0.55] |
| SPX500 −1 H20 | +0.482 [−0.95, +2.24] | +0.772 [−0.88, +2.41] | −0.804 [−2.41, +0.58] |
| GOLD +1 H5 | +0.190 [−0.35, +0.69] | +0.000 [−0.61, +0.55] | −0.506 [−1.20, +0.10] |
| GOLD +1 H20 | −0.442 [−1.63, +1.03] | −0.715 [−1.54, +0.16] | −0.809 [−1.93, +0.37] |
| GOLD −1 H5 | −0.302 [−1.02, +0.38] | −0.461 [−1.13, +0.15] | −0.336 [−1.26, +0.51] |
| GOLD −1 H20 | +0.224 [−1.09, +1.43] | +0.677 [−0.55, +1.74] | +0.336 [−1.11, +1.86] |
| Episodes (+1 / −1) | 39 / 38 | 45 / 42 | 45 / 42 |

Gate (prereg c: positive cell REAL, halves agree for both signs, mirror opposite-signed): **fails on all 6
instrument × horizon cells in every run**. No cell's interval excludes zero after the fix. The one nominal hit in
the banked run (EURUSD H20 positive confluence) loses it (−0.580 [−1.18, +0.04]).

Old units with date alignment (`baa_credit_old_aligned.json`) is also NULL, so the alignment bug did not decide the
banked verdict either.

What the fix changed in the setup: 2009-01-02 to 2026-10-02 span unchanged (4,975 days); positive episodes 39 → 45
(33 dates common), negative 38 → 42 (23 common). WALCL and WTREGEN were already in the same units in the old line
(the z-score is scale-free), so the whole change comes from RRP entering at full weight.

## Scored cells: macro-confluence-direction

HY OAS window 2023-11-22 to 2026-10-02 (742 days). Fixed units: 14 positive and 7 negative episodes, under the
registered MIN_EVENTS = 30 on every cell, so every cell is UNTESTABLE as the prereg defines it. Banked as
`context`; the protocol's verdict table maps UNTESTABLE to **underpowered**, so the entry is re-banked with that
word. (Alignment cannot change this: the cells are untestable before any outcome is read.)

## macro-confluence-range: PARKED

The range outcome needs daily **high and low** (forward max-high − min-low ÷ ATR14) for 2007-2026. The feature
store holds OANDA closes only, and the local OHLC daily files (`Oanda Parquet Files/`, `portfolioBacktest/cache/`)
start in 2016 on UTC days, which is neither the sample nor the bar the study used. Re-run needs OANDA D1 with
`OANDA_KEY` (e.g. `railway run`), which this session could not use. The range script has the **same position-for-date
bug** (`fwdRange` and `L.atr[i]` read SPX500/GOLD at row `i`), so its banked SPX500 and GOLD cells, including the
headline "SPX500 H=20 −0.977 ATR" narrowing, were scored at the wrong dates. Treat them as unverified until the
re-run. To re-run: `railway run node analysis/macro_confluence_range_study.mjs` after applying the same date join
(`L.idx.get(dates[i])`).

## Deviations from the preregs

- Prices from the feature store instead of a live OANDA call (exactness shown by the reproduction check).
- Outcomes joined by date instead of by row position (a bug fix, which brings the code into line with the prereg; it
  can only describe, and both versions give the same verdict).
- No change to domains, thresholds, horizons, de-clustering, MIN_EVENTS, bootstrap, seed or gate.

## Files

`run.mjs`, `export_closes.py` (scripts/macro-confluence-rerun/); outputs here: `closes.json`,
`{direction,baa_credit}_{old,fixed}[_aligned].json` + `.log`, `results.json`.

## What this changes

Nothing live. The baa-credit null stands and is cleaner (no nominal cell left). Direction stays unanswered for want
of HY OAS history. The range result and its SPX500 "confluence narrows range" observation are now flagged as
scored at misaligned dates. Do not build a prereg on that observation until the range study is re-run with dates
joined.
