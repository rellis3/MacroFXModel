# post-release-drift-pooled: runner

Prereg: `forge/POST_RELEASE_DRIFT_POOLED_PREREG.md` (committed `3849e8a7`). Seed `20261114`. Ledger ids
`post-release-drift-pooled` (surprise sign) and `post-release-momentum-pooled` (own first-15-min move).

## Laptop commands (from the repo root)

```bash
# 0. no R2 credentials in this shell: the runner refuses to start if R2_ACCESS_KEY / R2_SECRET_KEY / R2_BUCKET are set
unset R2_ACCESS_KEY R2_SECRET_KEY R2_BUCKET

# 1. self-test on synthetic data (about 15 s): a planted 0.3σ drift must be found, a null world must not be flagged
python scripts/post-release-drift-pooled/run.py --selftest

# 2. event table + placebo + power run. Writes power.json, then STOPS before any event outcome is read
python scripts/post-release-drift-pooled/run.py --stage power
git add analysis/output/post-release-drift-pooled/{power.json,events.parquet,DATA_AUDIT.md} && git commit -m "post-release-drift-pooled: power run"

# 3. score (refuses to run without power.json, or if the event table changed since it was written)
python scripts/post-release-drift-pooled/run.py --stage score
```

`python scripts/post-release-drift-pooled/run.py` with no flags does steps 2 and 3 in one go, still writing
`power.json` before it measures any event. The two-step form leaves a commit that proves the power verdicts came first.
`--stage events` only builds the event table and prints the exact counts per family.

**Expected runtime:** about 10–20 minutes on a laptop, with about 8 GB RAM.
- Loading the parquet files takes about 1–2 minutes (5 M1 files and 5 bid/ask files).
- HAR σ through Node takes under 1 minute.
- The placebo measurement takes 1–3 minutes (about 75k day-clock × instrument paths).
- The power run with the positive control takes 2–5 minutes.
- Scoring with 20,000 sign flips, B = 2000 cluster/month bootstraps and 2,000 placebo replicates takes 3–8 minutes.

**Needs:** Python 3.10+ with numpy, pandas and pyarrow, and Node 18+ (for `js/forecastSigma.js`).

## Files the runner reads (it fails loudly with the path if one is missing)

| What | Path |
|---|---|
| FX + gold M1 (research mid, `--price M`) | `VolRangeForecaster/data/m1/{gold,eurusd,gbpusd,usdjpy}_m1.parquet` |
| NQ M1 (NAS100 CFD) | `portfolioBacktest/cache/nq_m1.parquet`, else the mid of `data/m1_bidask/nq_m1.parquet` |
| NQ before M1 exists | `analysis/output/rate-surprise-events/m15/NAS100_USD.parquet` (in git) |
| Bid/ask (costs) | `data/m1_bidask/{gold,eurusd,gbpusd,usdjpy,nq}_m1.parquet` |
| US 2y CFD M15 | `analysis/output/rate-surprise-events/m15/USB02Y_USD.parquet` (in git) |
| 2010–17 ForexFactory event values | `analysis/output/rate-surprise-events/events.parquet` (in git) |
| Calendars | `calendar_events.csv`, `calendar_events_nasdaq.csv` (in git) |

The runner never fetches anything.
- It does not use `loadM1ForPair`, which merges the R2 nightly tail.
- It has no R2 or OANDA client.
- Every frame is cut to London dates ≤ 2026-08-21, and an assert checks the cut.
- Timestamps before 2000 are rejected (the BAM/1970 fault).

## Outputs (`analysis/output/post-release-drift-pooled/`)

| File | |
|---|---|
| `events.parquet`, `mirror_events.parquet`, `DATA_AUDIT.md` | Event table (signal side). Also holds the exact coverage, the release-bar timestamp check and the 20-event spot-check sample. **Fill its first-print column by hand from the BLS/Fed archive** |
| `placebo.parquet`, `power.json` | Same-clock placebo measurements. Also the placebo-based MDE and power verdict per cell, and the planted-drift positive control |
| `rows.parquet` | Event × instrument rows: prices, σ, every horizon, R/MAE/MFE, cost |
| `RESULTS.md`, `results.json` | Research-protocol format: two verdicts, 8 scored cells, controls, sensitivities, R view, BH slices, deviations |

## Code map

| File | Role |
|---|---|
| `run.py` | Entry point, stage control, `--selftest`, deviations list |
| `events.py` | Event table: surprises, the 2y market surprise, timestamp audit, terciles, agreement, mirror, coverage |
| `common.py` | Constants, lockbox-safe loaders, the `Px` price clock, NY-close bars and σ, horizon clocks, the stop path, statistics |
| `sigma.mjs` | HAR-800 σ via `js/forecastSigma.js` |
| `pipeline.py` | Event/placebo measurement, placebo arrays, power run, scoring, gate and verdict mapping, slices |
| `report.py` | `RESULTS.md` and `results.json` |

## Notes for whoever reads the results

- Entry is at the open of the M1 bar stamped release + 15:00. An exit is the close of the last bar ending at or before
  the horizon clock. If that bar is older than 5 minutes (15 for M15 bars), the row is missing and counted.
- Stops are 0.5σ and fill at the stop level, with no slippage.
- Cost is half the bid/ask spread at entry plus half at exit, at those minutes. Before 2016-10 (no bid/ask), the
  cost is 1.5 × the instrument × family median cost (in R) measured from 2016-10.
- Placebo draws give each event a different placebo day within a draw where possible. Shared days made the momentum
  id's sign-flip test anti-conservative in the self-test (null rejection 9–15%).
- The NFP standardised surprise uses the SD of all prior surprises, as registered, so the 2020 prints inflate it
  afterwards. This only affects NFP terciles, which are descriptive.
- The PPI 2014–15 rows in `calendar_events.csv` were stamped one hour late in summer. They are re-clocked to 08:30 ET,
  and the 2y release-bar audit confirms the release bar for every family and era.
