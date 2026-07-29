# Forward log — our gates vs COG's actual

One row per trading day. Our shadow output is emitted and stamped **before**
COG's alerts arrive, so the comparison is honest by construction — log his as
they land, never reconstruct them afterwards.

Two things this record settles that no backtest can:

- **`Match?`** — does our OI-derived direction agree with his?
- **Runs** — do his directions arrive in *runs* (slow macro bias) or *alternate*
  (fast positioning read)? At ~30 rows this discriminates the two, with no model
  of his system required.

| Date | Our G1 bias | Our G2 stop% / tier | Our G3 dir + target | COG G1 (time) | COG G2 (time, stop%/risk%) | COG dir (time) | Match? | Outcome | Notes |
|---|---|---|---|---|---|---|---|---|---|
| _(first row lands when the emitter ships)_ | | | | | | | | | |

## Pre-registered bar

Set before any rows exist, so a null cannot be re-narrated later.

- **Direction agreement is real if:** ≥ 70% match at n ≥ 30. Chance is 50%, so
  21/30 is roughly the 2-sigma line.
- **Direction agreement is null if:** ≤ 60% at n ≥ 30 — that is inside noise and
  the OI-magnet hypothesis for his Gate 3 is dropped.
- **His direction is slow-macro-driven if:** observed runs are materially fewer
  than `2·nL·nS/n + 1` (the random-runs expectation).
- **A match on direction is not a match on edge.** Agreeing with COG only matters
  if his calls are also profitable in our own resolved outcomes — log both.

## Prior observations — context, NOT part of the forward record

| Date | Source | Note |
|---|---|---|
| 2026-07-21 | screenshots | COG G1 12:37; G2 13:53 (std 0.44%/2.2%, cons 0.21%/1.00%); SHORT filled 14:26 |
| undated | screenshots | Owner's OI read "lean long toward 28,477 call wall" → COG filled **LONG 14:23** |
| undated | screenshots | Owner's OI read "lean short near 27,891 put wall, target 27,391" → COG filled **SHORT 14:26** |

**2/2 on direction — two observations.** A coin flip returns 2/2 about a quarter
of the time. This is a reason to run the test, not a result.
