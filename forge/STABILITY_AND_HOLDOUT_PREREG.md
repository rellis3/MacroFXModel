# STEP D — Parameter stability + the sealed holdout (Lesson 01 cards 07 and 03)

*Pre-registered 2026-10-07, before any perturbation was run. Part of `plans/LESSON_TARGET_REBUILD_PLAN.md`.*

## 1. Parameter stability of the chosen forecast (card 07)

"A peak that collapses when a parameter moves is fitted noise; a plateau of neighbouring settings with similar
results is structure."

- **Base:** the persistence form (forge/FORECAST_FIX_PREREG.md variant 1, live inputs), all 34 instruments, the same
  walk-forward folds, pinball ÷ the refit control A1. Base result: 0.980.
- **Perturbations, one at a time (6 runs):**
  - regime window 250 → **125, 500** sessions;
  - "recent misses" window 5 → **3, 10** sessions;
  - ridge λ 1 → **0.1, 10**.
- **PLATEAU (pass)** if every perturbed ratio is **< 1** (still beats the control) **and** within **±0.5 percentage
  points** of the base. Otherwise the result is fragile, and the most stable neighbour is named (not adopted without
  the owner).
- The IV term is not perturbed: implied vol has no window, and its coefficient is fitted.

## 2. The sealed holdout (card 03)

Everything **after 2026-08-21** (beyond the local M1 cache) was never used to fit or choose anything in this
programme.

- **Frozen now:** the files below, by SHA-256 (`analysis/output/holdout/SEAL.md`). Any change to them after this date
  breaks the seal and must be logged.
  - `js/forecastLadderPersistParams.js` (the chosen forecast);
  - `js/howMuchParams.js` (stop and size);
  - `js/forecastLadderPersist.js` and `js/howMuch.js`.
- **Opened once**, on **2027-01-04** (≈ 4 months of unseen sessions), when the M1 cache is topped up. Computed then,
  and nothing else:
  1. chosen vs plain pinball ratio, with interval;
  2. HL p75 exceedance by regime (quiet / normal / busy);
  3. single-bar stop-crossing rate at each class's minimum stop (should be ≤ ~5%).
- The **forward scorecard** keeps running daily as monitoring. It is not the holdout and does not reopen any
  decision before 2027-01-04 unless a verdict turns "warn".

## Output

`analysis/output/holdout/STABILITY.md`, `analysis/output/holdout/SEAL.md`; script `scripts/forecast_history/stability.py`.
