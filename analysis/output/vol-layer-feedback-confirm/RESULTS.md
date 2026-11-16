# vol-layer-feedback-confirm — results

Prereg: `forge/VOL_LAYER_FEEDBACK_CONFIRM_PREREG.md` (committed in `2f63c51a`, 2026-11-16). Run 2026-11-16, seed 20261116, B = 2000.
Branch `main` (run in a worktree off origin/main `9f998208`). Ledger ids: `vol-layer-feedback-confirm-persist`, `-morning`, `-qlike-plain`, `-qlike-chosen`, `-cov75`.
Script `scripts/vol-layer-feedback-confirm/run.py`. Numbers: `confirm/numbers.json`, `confirm/cells.csv`, `results.json`.

## Verdict: VALIDATED (all five cells)

The scored window ran from 2023-01-02 to 2026-08-20. It holds 943 London dates and 31,815 instrument-sessions on 34 instruments. All five cells cleared every registered gate.
- The forecast's misses still carry over: slope 0.46 for the plain σ and 0.22 for the chosen σ.
- A big morning still means a big afternoon: slope 0.49.
- The frozen feedback rule cut QLIKE loss by 24% on the plain σ and by 10% on the chosen σ.
- The chosen p75 line was passed on 24.1% of sides, inside 22.5-27.5 overall and in every σ tercile.

Every Holm p is 0.0025, the floor for five cells at B = 2000. Every effect beat all of its shuffles and month placebos.

## Step 0 (discovery reproduction)

Passed before any 2023+ row was read (`discovery/reproduce.json`):

| Check | Stage 3 / prereg | This script |
|---|---|---|
| Persistence, plain / chosen | 0.4949 / 0.2453 | 0.4949 / 0.2453 |
| Morning → afternoon | 0.5637 | 0.5637 (hourly RV rebuilt from M1) |
| Plateau hl 1, plain / chosen (yearly refit) | 0.7002 / 0.9137 | 0.7002 / 0.9137 |
| Chosen p75 coverage | 25.5866% | 25.5866% |
| Frozen b₁ refit, plain / chosen | 0.67559 / 0.42989 | 0.675588 / 0.429893 |
| In-sample frozen QLIKE ratio, plain / chosen | 0.696 / 0.903 | 0.6958 / 0.9030 |

## Scored cells

MDE (registered) comes from the prereg's power table. MDE (realised) = 2.80 × the confirm interval width ÷ 3.92.

| Cell | n rows / dates | Estimate | 95% CI | MDE reg. / realised | Pass bar | Holm p | Verdict |
|---|---|---|---|---|---|---|---|
| A `-persist`, plain σ | 31,815 / 943 | 0.465 | [0.397, 0.534] | 0.070 / 0.098 | slope ≥ 0.10 | 0.0025 | VALIDATED |
| A `-persist`, chosen σ | 31,815 / 943 | 0.217 | [0.160, 0.279] | 0.057 / 0.085 | slope ≥ 0.10 | (cell) | VALIDATED |
| B `-morning` | 31,815 / 943 | 0.487 | [0.412, 0.574] | 0.083 / 0.116 | slope ≥ 0.10 | 0.0025 | VALIDATED |
| C1 `-qlike-plain` | 31,815 / 943 | 0.758 (−24.2%) | [0.683, 0.826] | 0.090 / 0.102 | ratio ≤ 0.95 | 0.0025 | VALIDATED |
| C2 `-qlike-chosen` | 31,815 / 943 | 0.903 (−9.8%) | [0.864, 0.937] | 0.043 / 0.052 | ratio ≤ 0.95 | 0.0025 | VALIDATED |
| D `-cov75` | 63,630 sides / 943 | 24.08% | [23.31, 24.93] | 1.34 / 1.15 pp | CI in 22.5-27.5 | 0.0025 (TOST) | VALIDATED |

The realised intervals came out about 1.2-1.4 times wider than the power table assumed. So the realised MDE for B (0.116) and C2 (0.052) is just above the bar. No verdict depends on this: every estimate sits well past its bar, and every interval excludes both the bar and no effect.

### Gates, per cell (all hold)

| Gate | A plain | A chosen | B | C1 | C2 | D |
|---|---|---|---|---|---|---|
| 1 Holm < 0.05 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (TOST) |
| 2 at the bar | 0.465 | 0.217 | 0.487 | 0.758 | 0.903 | CI [23.3, 24.9] |
| 3 +1 lag | lag 2 0.363 [0.292, 0.438] | lag 2 0.198 [0.145, 0.257] | 00-13 → 14-22: 0.510 | 0.855 | 0.937 | — |
| 4 plateau | lag 1 > 5 > 10: 0.465 > 0.176 > 0.006 | 0.217 > 0.049 > 0.037 | cut 12: 0.485; cut 14: 0.567 | hl 2 0.790, hl 3 0.820 (≥ half of the 24% cut) | hl 2 0.905, hl 3 0.911 | p50 48.7%, p90 9.4% (descriptive) |
| 5 years (≥ 3 of 4) | 4/4 (0.39-0.51) | 4/4 (0.15-0.24) | 4/4 (0.40-0.61) | 4/4 (0.68-0.81) | 4/4 (0.88-0.93) | 4/4 inside (23.9-24.3) |
| 6 breadth (≥ 26/34) | 34/34 (0.28-0.62) | 34/34 (0.06-0.40) | 34/34 (0.25-0.73) | 34/34 < 1 | 33/34 < 1 (AUDNZD 1.007) | terciles 23.9 / 24.3 / 24.1 |
| 7 placebos | beats 100 shuffles (max 0.017) and 200 months (max 0.028) | shuffles max 0.010, months max 0.018 | months max 0.016 | months min 1.181 | months min 1.029 | — |
| 8 non-event | — | — | 0.614 ≥ ½ × 0.487 | — | — | — |

The placebo-SD rule never triggered. Month-placebo SDs (0.005-0.012) were far below the bootstrap SEs (0.020-0.042), so every p is the bootstrap p.

## Controls

- **Shuffles and month placebos.** Shuffled misses give slopes of about 0 (mean 0.001 plain, 0.000 chosen). Month-moved mornings give −0.001.
- **Moved feedback input.** A feedback input taken from another month makes the forecast worse, not better: QLIKE ratio 1.21 plain, 1.04 chosen. The gain needs the input from the right days.
- **Block 60.** The intervals barely change. A [0.396, 0.535]; B [0.408, 0.581]; C1 [0.678, 0.825]; C2 [0.864, 0.935]; D [23.26, 24.97].
- **Scheduled news.**
  - A plain: event days 0.488, non-event 0.430.
  - B: event days 0.426, non-event 0.614. The morning link is stronger without a release.
  - C1: event 0.760, non-event 0.742. C2: 0.903 / 0.899.
  - D: event 24.7%, non-event 23.3%.
- **Concentration.** Without the top 1% of dates by pooled miss:
  - A plain 0.438, A chosen 0.186.
  - B 0.455.
  - C1 0.792, C2 0.927.
  - D 23.99%.
  - C2 moves closest to its bar (0.927 against 0.95) but still passes.

## Deviations from the prereg

There are no post-hoc changes. Eleven PRE-RESULTS amendments (2026-11-16) were written after step 0 passed and before the confirm step ran. They are in the prereg's `## Amendments` section. Most say how the script reads parts of §3-§6 that the text leaves open:
- the M1 hourly-RV rebuild, in two parts;
- A takes the weaker of its two forecasts' verdicts;
- the C rows in common;
- how the month permutation works;
- the placebo-SD p;
- the event-flag split;
- the "pooled miss" definition;
- BH without `chanceBaseline`;
- the TOST p.

One descriptive item was dropped: the turbulent-onset lag event study.

## Descriptive (not part of the verdict)

- **Mirrors, A.**
  - Plain σ: after a below-forecast day the slope is 0.583; after an above-forecast day it is 0.322 [0.181, 0.447].
  - Chosen σ: 0.253 and 0.167.
  - Quiet days carry over more strongly than loud ones.
- **Mirror, B.** Below-median mornings 0.530, above-median 0.449. A quiet morning predicts a quiet afternoon at least as strongly as a busy one predicts a busy one.
- **Mirror, D.** OH side 24.6%, OL side 23.6%.
- **By σ tercile.**
  - The feedback gain grows with σ. C1: quiet 0.891, normal 0.745, busy 0.615. C2: 0.944, 0.896, 0.846.
  - So C2 is no longer local to busy markets, as it was in discovery. It now pays in every tercile.
- **By class.**
  - C1: FX majors 0.859 is the weakest class; crosses 0.733, indices 0.730, gold 0.753.
  - C2: all four classes are 0.86-0.92.
  - D: FX majors 23.5%, crosses 23.7%, indices 25.7%, gold 25.9%.
- **Instruments.**
  - D: four of 34 instruments sit outside the band: EURNZD 22.2%, UK100 21.8%, GBPCAD 28.2%, US2000 27.8%. Single instruments carry about ±3.5 pp of noise.
  - AUDNZD is the weakest instrument everywhere: A chosen 0.06, C1 0.94, C2 1.007.
- **Other forecasts.**
  - log-HAR persistence is −0.026 [−0.089, 0.043]. Its misses do not carry over, as the 0.11 in discovery suggested.
  - log-HAR ÷ plain QLIKE is 0.769. The frozen feedback rule (0.758) does as well as a refit log-HAR.
  - Stage 2's three-feature rule, frozen: 0.761 plain, 0.909 chosen.
- **Frozen-scale sensitivity** (scale held at its 2022-12-30 value): C1 0.755, C2 0.881.
- **Chosen σ version of B:** 0.334 [0.274, 0.401].
- **BH at q = 0.10.** 128 of 133 slices pass, against about 13 expected false passes. The five that miss are all single instruments in C: AUDNZD (plain and chosen), and DOW, EURCHF and NZDCAD (chosen).

## What this changes

- **A and B.** The vol-layer page's "Feedback / monitoring" slot can move from "holds in discovery" to "holds out of sample". The Stop and Size layers may use one feedback term, fixed as registered here (EWMA half-life 1, b₁ 0.67559 plain / 0.42989 chosen).
- **C1.** The plain σ is confirmed as a poor RV forecast without feedback. It stays a benchmark only.
- **C2.** `chosen σ + frozen feedback` (b₁ 0.42989, hl 1) becomes a side-by-side shadow σ with its own forward record. It is never an edit to the live lines. The promotion bar (|t| ≥ 3) is met: (1 − 0.9025) ÷ 0.0195 ≈ 5.
- **D.** The chosen lines are recorded as calibrated in 2023-26, pooled and by σ tercile. They sit slightly conservative (24.1% against 25%).

**What would reopen it:**
- a forward record where the chosen-σ feedback shadow fails to beat the chosen σ on QLIKE;
- a data fault in `forecast_history`, `chosen_lines.csv` or `data/m1_bidask` for 2023-26.

## Proof pack

`scripts/vol-layer-feedback-confirm/proof.py` → `checks.json` (log `proof_run.log`).
- It re-scores every cell from run.py's own functions. All five reproduce `confirm/numbers.json` to 1e-4.
- Planted effects are recovered at both sizes (large and minimum) in every cell.
- Shuffles show nothing:
  - slope intervals about ±0.012 around 0;
  - shuffled feedback input makes QLIKE worse, a cut of −0.25 / −0.06;
  - lines from shuffled months fail the band in the worst σ tercile.
- `forge/verdict_gate.py` gives VALIDATED for all five, the same words as above.
- The gate's power at its minimum effect, from the realised interval: persist 0.95, morning 0.78, qlike-plain 0.39, qlike-chosen 0.85, cov75 0.33. The low values for qlike-plain and cov75 reflect wide intervals against small minimums. They do not change a verdict, because each estimate is far past its minimum.
