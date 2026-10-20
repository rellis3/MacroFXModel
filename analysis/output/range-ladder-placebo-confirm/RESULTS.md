# range-ladder-placebo-confirm — results

Prereg: `forge/RANGE_LADDER_PLACEBO_CONFIRM_PREREG.md` (committed in `7097eaf5`, 2026-10-20). Run 2026-10-20, seed
20261020, B = 2000, 21-session date blocks, K = 8 placebo ladders. Branch `main`. Ledger id:
`range-ladder-placebo-confirm`. Full tables: `RESULTS_TABLES.md`; numbers: `results.json`.

## Verdict: VALIDATED

On 15 instruments `range-ladder-placebo` never loaded (14 FX crosses + UK100, 2,745 session dates 2016–2026), the four
range-edge lines revert more often than the same ladder shifted to the wrong price. The registered gate held on every
condition: pooled Δ +2.92 pp [+2.68, +3.19], p < 0.001, MDE 0.37 pp against a 1.0 pp bar, both halves positive
(+2.70 / +3.12). Control C1 clean (+0.01 pp, tolerance ±0.30).

## Scored cells

| Cell | n (real touches) | Revert real / placebo | Δ (pp) | 95% CI | MDE | Holm p | Halves | Cell verdict |
|---|---|---|---|---|---|---|---|---|
| H1 E pooled edges | 98,412 | 45.31% / 42.38% | **+2.92** | +2.68 … +3.19 | 0.37 | — | +2.70 / +3.12 | pass |
| H2 A_0 (Asia low) | 31,309 | 51.91% / 48.30% | +3.61 | +3.12 … +4.13 | 0.71 | < 0.001 | +3.32 / +3.87 | pass |
| H2 A_1 (Asia high) | 31,454 | 51.59% / 48.37% | +3.22 | +2.75 … +3.74 | 0.69 | < 0.001 | +2.98 / +3.44 | pass |
| H2 M_0 (Monday low) | 17,453 | 33.89% / 32.13% | +1.76 | +1.14 … +2.37 | 0.89 | < 0.001 | +1.02 / +2.42 | pass |
| H2 M_1 (Monday high) | 18,196 | 34.01% / 31.85% | +2.17 | +1.59 … +2.77 | 0.85 | < 0.001 | +2.59 / +1.80 | pass |

## Controls

- **C1** placebo copies 1–4 vs 5–8: +0.01 pp [−0.04, +0.07], clean.
- **C2** extension lines (|fib| ≥ 1.5): +0.26 pp [+0.12, +0.39], a tenth of the edge effect, as expected.
- **Concentration**: positive on 15 of 15 instruments (+1.92 … +4.09 pp) and in every year 2016–2026
  (+1.98 … +3.58 pp).

## Deviations from the prereg

None.

## Descriptive (not part of the verdict)

- **The effect is relative, not absolute.** At the Asia edges the real race reverts 51.6–51.9% against 48.3% for a
  shifted ladder: the edge lifts a race that continuation wins at random levels to about a coin flip. At the Monday
  edges both sit near 33%. A fade at 1:1 is break-even before costs at best, which `range-edge-limit-fade` confirms
  on real bid/ask (NULL, −0.11R net).
- All lines pooled: +0.91 pp, the same as the original study on its 19 instruments (+0.91 pp). The location effect is
  not specific to the range-line bot's chosen pairs.

## What this changes

- The range edges are a **real location** on unseen instruments. The other ladder lines are not (C2 ≈ 0 here, and
  every non-edge cell was flat in the original).
- It is **not a trade**. Its job is context: at the Asia/Monday edges the day's usual push-through is cancelled. Any
  new level or break study may use the edges as a known location without its own placebo, and should treat
  "break-follow into an Asia edge" as the weak spot for breakout entries (a candidate for its own prereg, not a rule).
