# Forward log — our gates vs COG's actual

One row per trading day. Our shadow output is emitted and stamped **before**
COG's alerts arrive, so the comparison is honest by construction — log his as
they land, never reconstruct them afterwards.

Two things this record settles that no backtest can:

- **`Match?`** — does our OI-derived direction agree with his?
- **Runs** — do his directions arrive in *runs* (slow macro bias) or *alternate*
  (fast positioning read)? At ~30 rows this discriminates the two, with no model
  of his system required.

| Date | Our G1 bias | Our G2 stop% / tier | Our G3 dir + target | COG G1 | COG G2 | COG dir | Agree w/ COG? | **Who was RIGHT?** | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 2026-07-31 | VALID LONG (09:00) — TIDE LONG / FLOW SHORT | 0.48%/2.4% std — **CLAMPED at ceiling** | **SHORT**, target 27,897 (put wall, OI 2141 v 630) | VALID 10:55 | 14:23 — 0.43%/2.25% std, 0.22%/1.00% cons | **LONG 14:25** | **direction: NO** | **OURS.** He went LONG and stopped out (−76.1, R:R 2.42). Price 28,436 → ~28,070, toward our 27,897 target. | G2 envelope HELD (his 0.43% inside 0.20–0.48%); structure confirmed 0.43/0.22=1.95, lev 5.23x/4.55x. But ours CLAMPED to the ceiling — we look close only because the clamp drags us there. Our own call was NO_TRADE (G1/G3 conflict), so we would NOT have taken the winning short. G2→entry 2 min today vs 33 min on 21/07. |
| 2026-07-30 | VALID LONG (09:00) | VALID | VALID **SHORT** (14:15) | — none | — | — none | inaction: MATCH | n/a — neither traded | Our call was NO_TRADE on a G1/G3 conflict; he produced nothing. Both stood aside. |

## Scoring correction (2026-07-31)

I first scored 31 Jul as a "direction miss" because we disagreed with COG.
Wrong metric, and this file already said so: **agreeing with COG is not the
goal, being right is.** He was wrong that day and we were right — scored on
agreement alone, that would have gone in the book as OUR failure.

Two columns now: *Agree w/ COG?* and *Who was RIGHT?*. If those diverge often,
replicating him is the wrong objective and the premise needs revisiting —
better found early than after months of matching a losing signal.

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
