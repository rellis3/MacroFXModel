# day-type-expansion runner

Prereg: `forge/DAY_TYPE_EXPANSION_PREREG.md` (seed 20261114). One entry point: `run.py`.

## On the laptop (the registered run)

Needs the local M1 caches (never the R2 tail; nothing is written to R2):

- `VolRangeForecaster/data/m1/{eurusd,gbpusd,usdjpy,audusd,usdcad,usdchf,gold}_m1.parquet`
- `portfolioBacktest/cache/{nq,spx500}_m1.parquet`
- committed inputs: `analysis/output/vf3_stage_b/part1_lines.parquet`, `analysis/surfaces/cboe/{VIX,VIX3M,VIX9D}.csv`,
  `oi_research_book/data/gex_range_es/spx500_nyclose_d1.parquet`, `oi_research_book/data/gex_range_es/nyc/daily_master_near_{spx500,nas100}_usd.parquet`

```bash
cd MacroFXModel
pip install numpy pandas pyarrow            # no scipy/statsmodels needed
python -I scripts/day-type-expansion/run.py --selftest    # ~2-3 min, synthetic only; must print SELFTEST PASSED
python -I scripts/day-type-expansion/run.py               # the scored run, ~10-20 min
```

Options: `--m1-root DIR`, `--index-root DIR` (if the caches live elsewhere), `--out DIR`.
Outputs: `analysis/output/day-type-expansion/{RESULTS.md, results.json, positive_control.json}`.
Edit only the "What this changes" section of RESULTS.md by hand, then bank per `research-protocol`.

## What it does

1. Loads the pre-open inputs only and runs the positive control (synthetic labels planted on the real inputs, prereg
   §3.8 / A1). If that fails it stops before any M1 is read.
2. Reads each M1 file with a read-time filter `time < 2026-08-21 20:00 UTC` (21:00 London on the last session) and
   asserts no later bar was read. A missing file stops the run with `MISSING DATA FILE: <path>`.
3. Builds the 07:00–21:00 London label (k = 0.5 / 0.75 / 1.0), fits B1 and M walk-forward (4 yearly folds), scores the
   9 cells with the block bootstrap, P1 shift placebo, P2 month-block permutation, Holm, gates G1–G5, and the verdict
   per family; then the descriptive arms (HAR-800 label, 07–16 window, rolling 3y, event split, years, top-1% trim,
   gamma sign on indices, instrument × k with BH).

Cboe and SPX daily inputs extend past the lockbox on disk; rows after 2026-08-21 are dropped on load and never used.

## Self-test (run 2026-11-14 in the cloud container)

Synthetic M1 + inputs in the real layouts, two worlds: a planted effect on `ivrel` (FX, indices) with gold clean, and a
null world. Result: planted FX and indices VALIDATED (BSS_B1 +2.3% to +4.5%, CI > 0, 100th percentile of both placebos),
gold NULL; null world all NULL; lockbox filter read 0 of 2 post-cut bars; missing file fails loudly. `SELFTEST PASSED (141s)`.
