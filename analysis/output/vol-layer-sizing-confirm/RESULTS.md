# vol-layer-sizing-confirm — results

Prereg: `forge/VOL_LAYER_SIZING_CONFIRM_PREREG.md` (committed in `2f63c51a`, 2026-11-16). Run 2026-11-16, seed 20261116, B = 2000.
Branch `main`. Ledger ids: `vol-layer-sizing-confirm-a`, `-b`, `-c`, `-e`. Cell d is descriptive and has no verdict.
Script: `scripts/vol-layer-sizing-confirm/run.py` (`--mode discovery`, then `--mode confirm` once).

## Verdict: VALIDATED (a, b, e); CONTEXT (c, demoted post-hoc by amendment A2: clearly below 0 but short of its own 0.25pp bar)

The test used a fixed, direction-free daily London hold on 34 instruments, scored on unseen 2023-01-01 → 2026-08-20 (44 months, 32,000 sessions). The point-in-time σ (`pit_sig_used`) was primary and is out of sample on every confirm row. Every cell passed Holm and every gate part:
- σ sizing steadies monthly risk against unscaled: −0.075 [−0.106, −0.053].
- RV20 matches σ within ±0.02: +0.004 [−0.005, +0.014], TOST p 0.0015.
- The level floor cuts quiet-day 3-sd days by −0.23pp [−0.31, −0.16]. It does not raise them over all days.
- 1/σ² is less steady than 1/σ: +0.097 [+0.077, +0.119].

Every confirm interval is narrower than the prereg's planning SEs assumed. Each MDE came out below its pass bar.

## Step 0 (discovery, before confirm was opened)

- **Reproduction: exact.** Live σ with stage 3's filters gave U 0.2630, F 0.1524, F − U −0.1106, MM − F +0.1152, T20 − F −0.0013 (54,433 rows, 34 instruments).
- **Positive control** (r = σ × t₅): F − U −0.127 [−0.172, −0.096], below −0.08. **Null control** (r = N(0,1)): +0.119 [+0.094, +0.148], above +0.08.
- **Mirror** (whole-month σ shuffle, 200): real F − U was −0.109 (pit). The shuffles' 2.5th percentile was +0.048. Pass.
- Discovery pit numbers, for reference: a −0.109, b −0.003, c −0.29pp, e +0.125.

## Scored cells (confirm)

| Cell | n | Estimate | 95% CI | MDE | Pass bar | Holm p | Cell verdict |
|---|---|---|---|---|---|---|---|
| a: dev_F − dev_U | 44 months | −0.0753 | [−0.1055, −0.0529] | 0.045 | 0.05 | < 0.001 | **VALIDATED** |
| b: dev_T20 − dev_F (equivalence) | 44 months | +0.0039 | [−0.0046, +0.0137] | 0.016 (TOST) | margin ±0.02 | 0.0015 | **VALIDATED** |
| c: quiet-day % beyond 3 sd, FA − F | 931 quiet-day dates | −0.232pp | [−0.307, −0.163] | 0.12pp | 0.25pp | < 0.001 | **CONTEXT** (A2) |
| e: dev_MM − dev_F | 44 months | +0.0967 | [+0.0771, +0.1190] | 0.036 | 0.05 | < 0.001 | **VALIDATED** |

The bootstrap p is 0/2000 replicates for a, c and e, so it is reported as < 0.001.

### Gate parts

| Cell | Plateau | +1 lag | Years (same sign / inside margin) | Extra |
|---|---|---|---|---|
| a | σ^0.75 − U −0.075, σ^1.25 − U −0.064: pass | −0.063 [−0.088, −0.044]: pass | 4 of 4 (2023 −0.065, 2024 −0.059, 2025 −0.116, 2026 −0.055) | Mirror on confirm: real −0.075 vs shuffles 2.5th percentile +0.038 (min +0.035). Pass |
| b | none (RV20 by name). RV10 −0.010, RV40 +0.041 | +0.004 [−0.003, +0.013], inside ±0.02: pass | 4 of 4 inside (−0.002, −0.006, +0.015, +0.011) | — |
| c | a = 0.10 −0.12pp, a = 0.50 −0.34pp: same sign, pass | −0.23pp [−0.32, −0.15]: pass | 4 of 4 (−0.20, −0.22, −0.26, −0.30) | All days −0.02pp [−0.10, +0.06]: reaches 0, pass |
| e | σ^1.75 − F +0.064, σ^2.25 − F +0.131: pass | +0.096 [+0.074, +0.121]: pass | 4 of 4 (+0.106, +0.100, +0.068, +0.120) | Its mirror is (a), which passed |

## Controls on the confirm σ path (read no confirm outcome; run first)

- Positive: F − U −0.088 [−0.110, −0.070], below −0.08. Pass, but narrowly.
- Null: +0.096 [+0.078, +0.118], above +0.08. Pass.

## Deviations from the prereg

There is one PRE-RESULTS amendment (2026-11-16), fixed in the script before confirm was opened. It covers:
- (b)'s lag gate, read as "inside ±0.02".
- The mirror run on confirm too.
- The row filters.
- The turnover definition.
- The p and MDE formulas.
- The wrong-sign and Holm-fail cases.

None changes a scored statistic. There are no post-hoc amendments.

## Sensitivities (descriptive)

| | a | b | c (pp) | e |
|---|---|---|---|---|
| live σ | −0.080 [−0.113, −0.057] | +0.009 [−0.000, +0.019] | −0.29 [−0.37, −0.21] | +0.092 [+0.074, +0.114] |
| discovery-frozen scale | −0.120 [−0.142, −0.098] | −0.001 [−0.010, +0.008] | −0.25 [−0.35, −0.17] | +0.150 [+0.126, +0.173] |
| random sign | −0.071 [−0.102, −0.049] | +0.004 [−0.005, +0.014] | −0.23 [−0.30, −0.15] | +0.099 [+0.080, +0.121] |

- With live σ, (b)'s upper bound is 0.019. That is close to the margin, but still inside it.
- With the frozen scale, unscaled risk drifts more against its discovery level (dev_U 0.282). So σ's gain is bigger there.

## Descriptive (not part of the verdict)

**Smaller effect than in discovery.** Monthly deviation, unscaled vs σ:
- Confirm: 0.232 vs 0.156, a gain of 0.075.
- Discovery (pit σ): 0.263 vs 0.154, a gain of 0.109.

In 2023–26, unscaled risk was already steadier, so σ had less to fix.

**By class and instrument** (BH q = 0.10, 38 slices per cell):
- (a): 34 of 34 instruments have the right sign, and 30 survive BH. All 4 classes survive. Metals −0.165 and indices −0.123 gain most; FX majors gain least, −0.055.
- (e): 34 of 34 have the right sign, and all survive BH.
- (c): 22 instruments are negative and 12 are exactly 0 (no quiet-day 3-sd day under either sizing). None is positive. No single instrument survives BH (3 raw p < 0.05 vs 1.9 expected). FX majors, crosses and indices survive at class level. Metals is 0.

**Loud-day mirror for (c):** +0.27pp [+0.10, +0.46]. The floor adds tail days on loud sessions, as expected (opposite sign).

**Tails and turnover** (pooled z):

| | U | F | T20 | FA | MM |
|---|---|---|---|---|---|
| ES 1% (sd) | −3.32 | −3.37 | −3.54 | −3.35 | −3.82 |
| 1st percentile (sd) | −2.52 | −2.60 | −2.65 | −2.56 | −2.73 |
| % days beyond 3 sd (all days) | 1.00 | 0.92 | 1.08 | 0.89 | 1.34 |
| turnover | 0 | 0.065 | 0.039 | 0.050 | 0.129 |

On quiet days, the share of 3-sd days was U 0.54%, F 1.28% and FA 1.05%. Quiet days are 45.7% of sessions on the trailing-250 labels.

**Cell d (book, 943 sessions, descriptive):**
- **D1.** R² of the 14-leg book on the dollar factor is 0.72, against 0.49 shuffled.
  - By year: 2023 0.75, 2024 0.74, 2025 0.64, 2026 0.76.
  - By trailing dollar-vol tercile: low 0.72, mid 0.78, high 0.67.
- **D2.** The all-to-1 cap at L = 2 never binds on 2023–26: 1/model-vol ranges 1.27–1.72 (5th–95th percentile, median 1.54). So the ES change is 0. At L = 1.5 the cap binds on 57% of sessions:
  - ES change +0.04 sd [−0.14, +0.31].
  - Monthly deviation 0.111 vs 0.124.
  - 99% VaR breaches are 1.27% on model vol and 0.21% on stress vol.
- **D3** (transfer). σ delivers 63% of the steadiness reachable with the hindsight own-session √rv5 (dev_O 0.113). RV20 delivers 60%.

## What this changes

- **(a)** The Assembly "Size" row can say σ sizing steadies risk on unseen data, on 34 of 34 instruments. It should quote −0.075 [−0.106, −0.053]. This is a near-replication: `vol-target` already covered most of this window. There is no live change.
- **(b)** RV20 is a valid stand-in for σ in sizing where there is no forecast. This holds for RV20 by name only: RV40 is outside the margin and RV10 is borderline. The forecast earns its keep on the lines, not on size.
- **(c)** The floor goes to the position sizer as a side-by-side shadow only, labelled with its loud-day cost (+0.27pp). It never edits live sizing. Its t ≈ 6, above the |t| ≥ 3 bar for a shadow proposal.
- **(e)** 1/σ² is closed for sizing in this repo.
- **(d)** Update the "Book risk" row with the confirm descriptions above. Say plainly that the L = 2 cap was idle in 2023–26.
- **What would reopen it:** a lockbox (H-A) read that reverses a sign, or a σ spec change.

Files: `discovery/discovery.json`, `discovery/frozen_sd.json`, `confirm/confirm.json`, `confirm/slices.csv`, `results.json`, `discovery.log`, `confirm.log`.
