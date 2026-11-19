# ladder-v2-lockbox — the one-shot holdout for the ladder-v2 forecast and exhaustion (NQ, GOLD, EURUSD; CFD + futures)

**Pre-registered 2026-11-19, before any post-2026-08-21 session was scored for ladder-v2.**

| | |
|---|---|
| ID / ledger id | `ladder-v2-lockbox` (forecast), `exhaustion-v2-lockbox` (exhaustion) |
| Register row | `plans/RESEARCH_REGISTER.md` → `ladder-v2-lockbox` |
| Holdout | London sessions **2026-08-24 → 2026-11-18** (about 60 weekdays). C: OANDA mid M1 (fetched read-only with `--price M`). F: NT8 continuous (already stitched to 2026-11-19). |
| Order | Runs **only after** `forge/LOCKBOX_PROTOCOL.md`'s one-shot evaluation (layers 3, 5, 6; `python -m forge.lockbox_check --evaluate`) has been logged. The two holdouts share these sessions, and the frozen protocol has precedence. |
| Seed | `20261119` |
| Runs | **Once.** Results are appended to the results file. Nothing is refitted or re-run after seeing them. |

## What is frozen (hashes recorded in `analysis/output/ladder-v2-lockbox/manifest.json` before scoring)

- **σ per instrument and track** (the banked race winners):
  - NQ: har_rv_log, both tracks
  - GOLD: HAR-CJ (C); HAR-RV 5-min on GC (F)
  - EURUSD: HAR-CJ, both tracks
- **Widths:** `forge.vol.fit_width_multiplier` on every session ≤ 2026-08-21. The regressions are fitted on the same
  window. This is the research `rvfeat` / `rows` state as banked.
- **The baseline:** the live σ yz_10, with widths fitted the same way on the same window.
- **Exhaustion:** the X7 logistic blend (refitted on all touches ≤ 2026-08-21 with the banked code) and the X0 plain
  ladder odds (rates ≤ 2026-08-21).

## Tests (per track, pooled over the three instruments, and per instrument reported)

| | Rule on the holdout |
|---|---|
| **L1 forecast** | The ladder-v2 HL/OH/OL p75+p90 regime miss (5 σ-fifths × 6 cells; fifths from the holdout pool) is **lower than yz_10's**, **and** the 12-rung unconditional miss ≤ yz_10's + 1pp. Reported for each rung: hit rate with a 90% binomial CI against 50 / 25 / 10. |
| **L2 exhaustion** | X7's calibration miss over the 4 London time buckets × 2 targets is **lower than X0's**, **and** X7's log loss < X0's. |

**Verdict words:**
- **VALIDATED:** the rule holds on both tracks.
- **NULL:** v2 is worse than the baseline on both tracks.
- **UNDERPOWERED:** otherwise (likely for small differences at about 60 sessions).

## Power

About 60 sessions per instrument and 180 pooled per track. That's too few to confirm the 1pp-scale gains seen in
the walk-forward. The holdout can catch a model that is broken out of sample, such as a p75 hit rate far from 25% or
v2 clearly worse than live. It can't prove the size of the gain. That limit is the reason for the forward record
(runbook 1.8).

## What it changes

- **VALIDATED, or UNDERPOWERED with no sign of breakage:** the owner can sign off the switch (runbook 1.9).
- **NULL:** no switch, and the failure is investigated on new data.
