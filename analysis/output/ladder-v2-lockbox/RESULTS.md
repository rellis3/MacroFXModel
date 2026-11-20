# ladder-v2-lockbox — results (one-shot holdout)

Prereg: `forge/LADDER_V2_LOCKBOX_PREREG.md` (2026-11-19, A1 2026-11-20 pre-results). Run once, 2026-11-20.
Script: `scripts/ladder-v2-lockbox/run.py`, which refuses a second run. Inputs are hashed in `manifest.json`.
Numbers: `results.json`. Log: `report.txt`.
Holdout: London sessions 2026-08-24 → 2026-11-18. That's 63 sessions per instrument on the CFD and 62 on futures,
for NQ, GOLD and EURUSD.

## Verdicts

| | CFD | Futures | Verdict |
|---|---|---|---|
| **Exhaustion** (X7 vs plain odds, 4 London buckets × 2 targets) | miss 2.4 vs 9.9; log loss 0.6179 vs 0.6451 | miss 2.1 vs 10.7; log loss 0.6133 vs 0.6447 | **VALIDATED** |
| **Forecast** (30-cell regime miss vs live yz_10; 12-rung guard) | 5.76 vs 5.39 (guard 4.33 vs 4.39) | 5.33 vs 5.63 (guard 4.65 vs 4.75) | **UNDERPOWERED** (split) |

## Exhaustion on unseen days

Next-rung odds after a touch, shown as **observed / plain odds / X7**:

| London time | CFD | Futures |
|---|---|---|
| 00–07 | 59 / 48 / 65 | 63 / 48 / 64 |
| 07–12 | 56 / 47 / 56 | 57 / 46 / 55 |
| 12–16 | 43 / 44 / 48 | 43 / 44 / 48 |
| 16–22 | **25 / 45 / 28** | **27 / 44 / 28** |

The 0.25σ target behaves the same way: about 50% after 16:00, against about 66% for the plain odds. The time-of-day
effect and the model's calibration both carry over to new days.

## Forecast on unseen days

- **v2 hit rates pooled (target 50 / 25 / 10):**

  | Line | CFD | Futures |
  |---|---|---|
  | HL | 53 / 25 / 11 | 54 / 25 / 11 |
  | OH | 42 / 20 / 5 | 40 / 20 / 6 |
  | OL | 59 / 33 / 16 | 59 / 33 / 17 |

- **The range ladder is on target.** The live σ's HL p75 hit 29–30% on NQ and gold CFD; v2's was 25%.
- **The OH/OL imbalance is the holdout's direction.** These weeks fell more than they rose. It affects both calcs
  equally, since neither forecasts direction.
- **The regime score can't separate the two calcs.** With 189 sessions, each of the 30 cells holds about 38, which
  puts the noise floor near 5pp. Both calcs sit at it: v2 is slightly worse on the CFD and slightly better on futures.
  As registered, that is UNDERPOWERED, with no sign of breakage.

## What it changes

- **Exhaustion:** the out-of-sample check passes. It's ready for owner sign-off on the shadow export and indicator.
- **Forecast:** no breakage, and HL calibration is on target. The case for switching rests on the walk-forward race
  (8.6 years) plus the forward record. 60 days can't add to or subtract from it.
