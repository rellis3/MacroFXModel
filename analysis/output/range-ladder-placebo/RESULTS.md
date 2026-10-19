# range-ladder-placebo — results

Prereg: `forge/RANGE_LADDER_PLACEBO_PREREG.md` (registered in `13171dda`, 2026-10-19; amendment A1 pre-results in
`4c00a6ca`). Run 2026-10-19, seed 20261019, B = 2000, 21-session date blocks. Branch `main`. Ledger id:
`range-ladder-placebo`. Full tables: `RESULTS_TABLES.md`; numbers: `results.json`.

## Verdict: UNDERPOWERED (no verdict by the registered rule)

The prereg made the control C1 a precondition: two halves of the placebo ladders (copies 1–2 vs 3–4) are
interchangeable by construction, so their difference must have a 95% CI containing 0, "else the design is biased and
no verdict is banked". C1 came out **−0.09 pp, CI [−0.16, −0.02], p 0.008**. By the registered rule there is no
verdict; under the research protocol an unjudgeable test is banked `underpowered`. Nothing below unlocks it.

## Scored cells

| Cell | n (real touches) | Estimate Δ revert, real − placebo | 95% CI | MDE | Pass bar | Gate |
|---|---|---|---|---|---|---|
| P1 pooled | 515,268 (2,745 session dates, 19 instruments) | +0.91 pp | +0.82 … +1.01 | 0.14 pp | ≥ 2.0 pp, p < 0.05, both halves | fails on size (halves +0.91 / +0.91) |
| P2 per line (77 cells ≥ 100 touches) | — | — | — | — | BH q < 0.10, ≥ 3.0 pp, both halves | `A_1` only: +3.07 pp [+2.58, +3.58], halves +2.83 / +3.28 |
| C1 control | 2,074,865 placebo touches | −0.09 pp | −0.16 … −0.02 | — | CI contains 0 | **fails** |

## Controls

- **C1** failed, above. Its size (0.09 pp) is a tenth of the pooled effect and a thirtieth of A_1's, so a design bias
  of that size could not by itself produce the edge-line numbers, but the rule was fixed in advance and is kept.
- Touch counts match: real 515,268 vs placebo 2,074,865 over K = 4 copies (≈ 518,700 per copy). Races marked at the
  session close: real 6.61 %, placebo 6.51 %.
- Concentration: every year 2016–2026 between +0.60 and +1.28 pp; FX +0.96, gold +0.51, indices +0.87.

## Deviations from the prereg

A1 (pre-results): sessions re-dated to their true UTC date, because `bucketM1IntoSessions(packed, 0)` labels every
session one day late and the book's "Monday" ladder was Sunday evening's stub. Recorded as a fault in
`plans/DATA_SPEC.md` §5 #10. Nothing else changed. A first full run that silently loaded M1 from Google Drive instead
of the local cache was stopped and discarded before it finished; the script now refuses anything not in the cache.

## Descriptive (not part of the verdict)

- Both real and placebo lines continue more often than they revert (revert 46.0 % vs 45.1 %): at any line, the
  "next line in vs next line out" race is close to a coin flip.
- What difference there is sits at the range **edges**: `A_0` +2.83, `A_1` +3.07, `M_1` +1.67, `M_0` +1.25 pp, all with
  both halves the same sign. Extension lines (|fib| ≥ 1.5) are indistinguishable from shifted ladders.

## What this changes

- Nothing live. The range-line book's line locations are not shown to carry information beyond a ladder at the wrong
  price; at most a ~3-point tilt toward reversion at the Asia range edges, which is far too small to explain a
  Sharpe of 4.7–6 on its own. If the book's results are real, they come mostly from its exits and policy, which this
  test does not cover.
- Reopen as `range-ladder-placebo-confirm`: a fresh prereg on sessions after 2026-08-21, the edge lines (A_0, A_1,
  M_0, M_1) as the only scored cells, more placebo copies, and a control tolerance fixed in advance.
