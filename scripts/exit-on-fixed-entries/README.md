# exit-on-fixed-entries runner

Prereg: `forge/EXIT_ON_FIXED_ENTRIES_PREREG.md` (seed 20261114). Entry point: `run.py` (`selftest.py` = `run.py --selftest`).

## On the laptop (the registered run)

Local files only (never R2, never the nightly tail; nothing is written to R2):

- `data/m1_bidask/{gold,eurusd,gbpusd,usdjpy,usdcad,audusd,nzdusd,usdchf,eurjpy,gbpjpy,nq,spx,dow}_m1.parquet`
  (research schema + `bid_o..bid_c, ask_o..ask_c`; fetched with `--price BAM --out data/m1_bidask`, see data-rules
  `references/sources.md`)
- `Oanda Parquet Files/Bid and Ask/instrument_meta_log.parquet` (financing snapshot, second cost layer)
- `calendar_events.csv` (+ `calendar_events_nasdaq.csv` if present) for the descriptive event split

A missing file or column stops the run with `STOP: MISSING DATA FILE ...` (exit code 2).

```bash
cd MacroFXModel
pip install numpy pandas pyarrow
node scripts/data_integrity.mjs                              # prereg 3.9 item 1: note anything stale in RESULTS.md
python -I scripts/exit-on-fixed-entries/run.py --selftest    # ~1 min, synthetic only; must print SELFTEST PASSED
python -I scripts/exit-on-fixed-entries/run.py --skip-selftest   # the scored run, ~5-10 min (most of it loading M1)
```

Without `--skip-selftest` the scored run repeats the selftest first (+1 min). Options: `--m1-root DIR`,
`--fin-meta PATH`, `--out DIR`, `--ack-reconciliation` (see below).

Outputs in `analysis/output/exit-on-fixed-entries/`: `selftest.json`, `map.json` (written first), `power_binding.json`
(written before any real Δ), `results.json`, `RESULTS.md`. Write the "What this changes" section of RESULTS.md by
hand, then bank per `research-protocol` (one commit with the results, never the prereg's).

## What it does

1. Reads each bid/ask M1 file with a read-time cut at 2026-08-21 21:00 UTC (22:00 London, the end of the last
   lockbox-eligible session) and asserts no later bar was read. Entries stop at 2026-08-17 so every 5-session path
   ends by 2026-08-21 (asserted).
2. One fixed entry per instrument per weekday at 07:00 London on the 4h EMA20-slope side (the `S.slope()` reading of
   `scripts/h4-trend-hold/backtest.py`, no "only when flat" rule); 1R = 1 σ of 20 NY-close daily log returns.
3. Both sides of every entry, exits E0 (21:00), E1 (slope-hold, Friday flat), E2 (prior-day trail), E3-2/3/5 (time
   stops), E4 (half at +1R, rest on the E2 trail), each on bid/ask fills (and on mid for the design check), the
   Friday-flat variants of E2–E4 and the financing layer.
4. Order of reading: map → lesson-#27 design check (stops on a fault) → binding power rule from 500 shifted-side
   placebos → reconciliation with h4-trend-hold DAY (stops if the gap > 0.03R unless `--ack-reconciliation`; explain
   the gap in RESULTS.md) → scored Δ per exit, Holm, the gate, verdicts → descriptive slices (BH q = 0.10).

## The selftest (synthetic, prereg 3.9 item 2)

Continuous Brownian paths (15-minute bars, exact Brownian-bridge highs/lows, 13 instruments × 2,000 days):
(a) zero drift: no exit validated, every Δ within 3 SE, design check clean; (b) closed form: constant drift, side
forced long, stop at 100R, E3-N − E0 = d(N−1)/(σP) within 2 SE; (c) planted momentum 0.20R/day: E1, E2 and E3-5
must be VALIDATED by the full gate; (c2) momentum 0.10R/day: Δ(E3-5) within 3 SE of the prereg's +0.08;
(d) a path that would read a session after 2026-08-21 must raise. Checked while building: over 10 zero-drift seeds,
no design fault and no false VALIDATED (Δ z-scores sd 0.77).

Note from building it: a coarse random walk (discrete jumps inside a bar) with stops filled at their level biases
long and short alike upward by the overshoot (~+0.005R at E0, ~+0.02R on the trail). Real M1 is close to continuous,
so this is small there, but it is why the selftest uses bridge highs/lows.
