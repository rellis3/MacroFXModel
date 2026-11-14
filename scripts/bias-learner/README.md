# bias-learner runner

Prereg: `forge/BIAS_LEARNER_PREREG.md` (seed 20261114; §5 power table in Amendment A1). One entry point: `run.py`.
`power_sim.py` is the synthetic power simulation behind A1 (`power_table.json` is the table the runner reads).

## On the laptop (the registered run)

Needs local files only (never the R2 tail; nothing is written to R2). A missing file stops the run with
`MISSING DATA FILE: <path>`.

- M1 mid, 2015-01 (warm-up) → 2026-08-21: `VolRangeForecaster/data/m1/{eurusd,gbpusd,usdjpy,usdcad,audusd,nzdusd,usdchf,eurjpy,gbpjpy,gold}_m1.parquet`,
  `portfolioBacktest/cache/{nq,spx500,us30}_m1.parquet`
- bid/ask M1 for the R table's costs: `data/m1_bidask/{eurusd,...,gold,nq,spx,dow}_m1.parquet` (or pass `--no-R`)
- feature store (`$MFX_DATA_ROOT/features` or `--feature-root`): `rate3m_{usd,eur,gbp,jpy,aud,nzd,cad,chf}.parquet`,
  `effr.parquet`, `rate_on_de.parquet`
- the tier-1 event table: `analysis/output/post-release-drift-pooled/events.parquet`
  (build it first: `python scripts/post-release-drift-pooled/run.py --stage events`)
- in the repo: `analysis/output/cot-crowding-programme/cot_weekly.csv`, `analysis/surfaces/cboe/{VIX,VXN,VXD,GVZ}.csv`,
  `oi_research_book/data/iv_daily_*.parquet`

```bash
cd MacroFXModel
pip install numpy pandas pyarrow scikit-learn     # scikit-learn only for the GBM arm (--no-gbm skips it)
node scripts/data_integrity.mjs                   # data-rules item 8: note what is stale
python -I scripts/bias-learner/run.py --selftest  # ~11 min on 4 cores, synthetic only; must print SELFTEST PASSED
python -I scripts/bias-learner/run.py --smoke     # ~5 min, the real code path on a synthetic file tree; SMOKE PASSED
python -I scripts/bias-learner/run.py             # the scored run
```

Runtime of the scored run (estimate, 8 cores, `--jobs 7` default = cores − 1): readings ~15 min, targets and R
~5 min, 4 horizons × (primary, M0, 13 single readings, 200 shuffles, GBM and descriptive refits) ~30–60 min. RAM:
about 3 GB (13 instruments' M1 held as float32 for the R paths). Options: `--root`, `--m1-root`, `--index-root`,
`--feature-root`, `--out`, `--jobs`, `--no-gbm`, `--no-R`. `--shuffles` other than 200 prints a warning: that run is
not the registered one.

Outputs: `analysis/output/bias-learner/{RESULTS.md, results.json, positive_control.json}`. Edit only the
"What this changes" section of RESULTS.md by hand (prereg §8), then bank per `research-protocol` (three ledger ids:
`bias-learner-fx`, `-gold`, `-idx`).

## What it does

1. Reads each M1 file with a read-time filter `time < 2026-08-21 20:00 UTC` (21:00 London on the last session) and
   asserts no later bar was read; builds the 13 readings of prereg §3.3 from bars completed before 07:00 London.
2. Positive control (§3.8): the exact pipeline on the **real readings** with synthetic targets; planted IC 0.12 must be
   flagged in FX at 21:00 (CI lower > 0 and above the shuffle 95th percentile), IC 0 must not. If not, it stops before
   any real target is computed.
3. Builds targets (07:00 open → 21:00 close at h = 0, 1, 3, 5 sessions), point-in-time B0, the 1σ-stop R paths with
   costs; applies the 2018-fold rule (§3.5); scores the 12 cells with gates G1–G7, Holm, the cell and group words (§4),
   the descriptive arms (§6) and the BH disaggregation.

## Selftest (no market data)

- lockbox read filter; a missing file fails loudly;
- no lookahead in the readings: every M1 bar from 07:00 on a date is perturbed and every reading up to that date must
  be unchanged (and later readings must change);
- path R on a known path (a gap through the stop fills at the bar's open); B0 uses only labels realised before the session;
- the learner on a synthetic panel with the real layout: a weak signal (daily IC 0.12 on a composite of four readings,
  `trD`, `carry`/`sigreg`, `cot`, `asia`, i.e. about 0.06 per reading) must pass G1 and G4 in FX at 21:00; a null panel
  must flag no cell;
- the positive-control routine itself.

`--full-selftest` also runs the GBM and the descriptive refits; `--selftest-shuffles N` (default 20).
