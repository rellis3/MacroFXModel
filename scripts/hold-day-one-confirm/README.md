# hold-day-one-confirm runner

Prereg: `forge/HOLD_DAY_ONE_CONFIRM_PREREG.md` (seed 20261114). One entry point: `run.py`. `power_sim.py` is the
pre-registration power simulation (§5); it is not part of the scored run.

## On the laptop (the registered run)

Needs the local M1 caches (never the R2 tail; nothing is written to R2), OANDA mid, `--price M`:

- `VolRangeForecaster/data/m1/{eurusd,gbpusd,usdjpy,audusd,usdcad,usdchf,nzdusd,eurjpy,gbpjpy,gold}_m1.parquet`
- `portfolioBacktest/cache/{nq,spx500,us30}_m1.parquet`
- committed input: `analysis/output/vf3_stage_b/part1_lines.parquet` (σ, ladder widths, event tag; US30 is `DOW` there)

```bash
cd MacroFXModel
pip install numpy pandas pyarrow                              # nothing else
python -I scripts/hold-day-one-confirm/run.py --selftest      # ~2.5 min, synthetic only; must print SELFTEST PASSED
python -I scripts/hold-day-one-confirm/run.py                 # the scored run, ~3-10 min (1.7 min on a same-size synthetic set)
```

Options: `--m1-root DIR`, `--index-root DIR` (if the caches live elsewhere), `--out DIR`, `--root DIR`.
Outputs: `analysis/output/hold-day-one-confirm/{RESULTS.md, results.json, positive_control.json, power.json}`.
Edit only the "What this changes" section of RESULTS.md by hand, then bank the six ledger ids per `research-protocol`.

## What it does

1. Checks every input file exists first; a missing one stops with `MISSING DATA FILE: <path>` before anything is scored.
2. Reads `part1_lines.parquet` to 2026-08-21 and the control moments (OC/σ over all days; no forward move).
3. Reads each M1 file with a read-time filter `2020-07-01 <= time < 2026-08-21 20:00 UTC` (21:00 London on the last
   session) and asserts no later bar was read. Builds the DAY-ONE table only (07:00-21:00 London: |z1|, close location,
   time to the p50 level, p90 reach, event tag, the faded mirror).
4. Positive control on synthetic forward paths over that table (planted +0.15σ a session on STRONG days must pass
   G1-G3 on run, close, hold-r; the zero world must flag nothing; the coin-flip hold placebo must sit at -cost). If it
   fails, the run stops before any forward outcome is computed.
5. Monte-Carlo null on the real setup dates -> `power.json` (MDE per cell) and the SE floor.
6. Forward 21:00 -> 21:00 moves at +1/2/3/5 sessions, the hold-R paths on M1 (1σ stop, gap fills at the bar open,
   0.03R cost, one position per instrument), the six scored cells (P̄), block bootstrap by date (21, B 2000), H1/H2,
   all-shift date placebo, Holm over six, gates G1-G5, verdicts; then the descriptive arms (per horizon with BH, per
   instrument with BH + chance baseline, families, k 0.75/1.5, HAR-800 σ, 00:00-anchored bands, true middle, ladders,
   thinned, MFE/MAE, +1σ before -1σ, hold legs and tails, costs and financing, concentration).

## Self-test (run 2026-11-14 in the cloud container)

Synthetic M1 + `part1_lines` for all 13 instruments in the real layouts (2020-08-24 -> 2026-08-21, poison bars and a σ
row after the lockbox on disk). Planted world: after a ≥ 1σ day closing in its outer 10%, the next five sessions drift
+0.30σ a day in its direction. Result: planted `run`, `close`, `hold-r` VALIDATED (P̄ +0.58 / +0.55 / +0.55R); null
world nothing VALIDATED (`close` +0.14 with Holm p 0.39 -> UNDERPOWERED, the rest NULL/UNDERPOWERED); lockbox 0 of 2
poison bars read; a missing M1 file stops the run. `SELFTEST PASSED (143s)`.
