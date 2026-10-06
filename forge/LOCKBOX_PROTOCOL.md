# Lockbox protocol — the one-shot holdout for layers 3, 5 and 6

Written and frozen 2026-10-06 (plans/LESSON_COMPLIANCE_REVIEW.md, action A7; Lesson 1 institutional checks 03 and
10; Lesson 2 §05). Frozen; this file is not amended. A later lockbox needs its own file and a new holdout.

## Why

The 2025-09-05 → 2026-08-21 test year has been scored across about ten variants (ladder candidates 1–4, remaining
travel R0–R5, confidence M1/M2), and R3 was designed after seeing how R0–R2 failed on it. It is now research data.
Lesson 2: from a 4% base rate one independent pass lifts the chance of a real effect to about 40%, a second to about
91% — but only if the second test never informed the design. This lockbox is that independent test.

## What is frozen

`forge/lockbox_manifest.json` records the SHA-256 (line endings normalised) of every file below at commit time.
`python -m forge.lockbox_check` verifies them; any mismatch voids the lockbox for the layer that file belongs to.

| layer | frozen model | files |
|---|---|---|
| 3 | HAR-800 ladder: σ = forecastSigma(last 800 NY-close bars, 'har_rv_log'), widths js/forecastLadderParamsHar800.js; baseline = live ladder js/forecastLadderParams.js | forecastLadderParamsHar800.js, har800_sigma.mjs, forecastSigma.js, forecastLadder.js, forecastLadderParams.js |
| 5 | R3 per-hour multipliers, js/remainingTravelParamsR3.js (trained < 2025-09-05) | remainingTravelParamsR3.js, remaining_travel_build.mjs |
| 6 | M2 recipe in analysis/pathmap/confidence_fit.py (deterministic: train < 2024-09-05, calibrate on 2024-09-05 → 2025-09-04, random_state 0) | confidence_fit.py |

No parameter, width, multiplier, threshold or recipe in these files changes until the evaluation below is done.

## The holdout

- **H-A (history not yet seen):** every London session **after 2026-08-21** in the OANDA M1 data, once downloaded
  (`AnalogML/refresh_m1.py`, needs `OANDA_KEY`). None of this has been loaded locally or used in any fit or score.
- **H-B (forward):** the shadow screens' sessions **from 2026-10-07**.

## When it is examined — once

The evaluation runs **once**, on the first date when H-A + H-B together hold **≥ 60 sessions** with usable data
(expected late November 2026). Until then:
- the shadow screens may be watched for operation (is it running, is data arriving) — **no model, parameter or
  rule may be changed because of what they show**;
- no script may score layers 3, 5 or 6 on H-A.

`python -m forge.lockbox_check --evaluate` is the only sanctioned evaluation: it verifies the hashes, scores each
layer with its own pre-registered rule, appends the result to `forge/lockbox_log.json`, and refuses to run again.

## Pass rules (unchanged from each layer's pre-registration)

| layer | rule on the holdout |
|---|---|
| 3 | HAR-800 vs live: 30-cell σ-quintile miss lower than live, and 12-rung miss ≤ live + 1pp (LADDER_CALIBRATION) |
| 5 | R3: 90-cell miss ≤ 2.5pp and no band × regime cell off by > 5pp at p75/p90; 21:00 reported, flagged (REMAINING_TRAVEL) |
| 6 | M2: Brier skill 95% lower bound > 0 for p50 and p75, max decile miss ≤ 3pp (CONFIDENCE) |

A layer that passes on the holdout is **validated**. One that fails is recorded as failed and redesigned on new
data; the holdout is never re-used.
