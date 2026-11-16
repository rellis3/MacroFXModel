# Proof pack for vol-layer-rule-a-confirm (run once, on the laptop)

The Python test job is red on one test: `forge/verdict_gate_test.py::test_banked_vol_layer_studies_have_passing_proofs`, "no checks.json"
for the five banked cells (`vol-layer-rule-a-confirm-s1 / s2 / s3 / z1 / k1`). A banked verdict needs a proof file next to its results:
planted edges recovered, a shuffle that shows nothing, power, and a check that the re-run reproduces the banked numbers.
`proof.py` builds that from the study's own trade table. It never edits a verdict: if the proof disagrees with a banked word it stops and
writes nothing the test would accept.

## What you need on the laptop
- The confirm run's output: `analysis/output/vol-layer-rule-a-confirm/confirm/trades.parquet` (written by `run.py --window confirm`, not in git).
- The M1 bid/ask files in `data/m1_bidask/` (only the `time` column is read, to rebuild the 943 book days).
- `backtest-data/line-backtest/*.json.gz` (Rule A's signals, as run.py reads them).
- Python 3 with numpy, pandas and pyarrow (the ones run.py already uses).
If `trades.parquet` is missing, the script says so and stops; run `python -X utf8 scripts/vol-layer-rule-a-confirm/run.py --window confirm`
first (about 7 minutes in the banked run, and it is the registered once-only confirm run: it reproduces the banked numbers, it does not change them).

## Run it (Windows PowerShell)
```powershell
cd "C:\Users\relli\OneDrive\Documents\Programming\Trading\v2 trading model\MacroFXModel"
git pull --rebase origin main        # if it refuses because of uncommitted files, tell me; do not use --hard or stash

# 1. optional, about 5 to 10 minutes: prove the harness itself on synthetic data (no real data needed)
python -X utf8 scripts/vol-layer-rule-a-confirm/proof.py --selftest

# 2. the real proof, about 20 to 40 minutes (it re-runs the study's own statistics, then the random skips and the planted checks)
python -X utf8 scripts/vol-layer-rule-a-confirm/proof.py

# 3. the test that was red
python scripts/run_py_tests.py

# 4. commit the proof file only
git add -f analysis/output/vol-layer-rule-a-confirm/checks.json
git commit -m "vol-layer-rule-a-confirm: proof pack (planted edges, shuffles, power, reproduction)"
git push origin HEAD:main
```

## What a pass looks like
Step 2 prints, in order: the `analyse` re-run, `reproduction of the banked numbers: OK`, one line per cell (estimate, interval, planted
shifts, shuffle interval), then the five verdicts next to the banked words, and ends with
`PASS: wrote ...checks.json`. Expected verdicts: S1 UNDERPOWERED, S2 UNDERPOWERED, S3 NULL, Z1 NULL, K1 UNDERPOWERED.
Step 3 then shows the vol-layer proof test passing.

## What a stop looks like
- `reproduction of the banked numbers: FAILED`: the trade table or book days differ from the banked run (different data files, or run.py was
  re-run on different inputs). It lists which numbers differ. Send me that output.
- `STOP: [...] disagree with the banked verdict`: it writes `checks_MISMATCH_do_not_commit.json` and exits with code 2.
  Do not rename that file. A proof that contradicts a banked verdict is a finding to look at, not something to edit.
- A cell INVALID: the planted edge was missed, the shuffle showed an effect, or a diagnostic failed. The reason is printed.

## What the checks do and do not prove
They act on the trade table after the bid/ask simulation: they prove the book aggregation and the date-block bootstrap recover an edge of a
known size and show nothing under a shuffle. The stop simulator itself is covered by `--selftest` (hand-built bar paths) and by the study's own
parity check (the bid/ask re-run matches the registered mid grid on 1,135 of 1,135 trades). K1 has no registered minimum effect, so its minimum
is the gain over the random-skip mean that the registered p < 0.05 needs (stated in the file).
