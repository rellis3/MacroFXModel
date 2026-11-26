# level-context-engine: results

**Setup**
- Prereg: `forge/LEVEL_CONTEXT_ENGINE_PREREG.md` (48aa8e5e, with A1 pre-results 072777ff).
- Scripts: `scripts/level-context-engine/build.py` and `score.py`. Seed 20261125.
- Universe: 25 NT8 futures (primary, net of 2.5 ticks) and 40 CFDs (replication, gross), 2020-01-02 → 2026-08-21.
- Event counts: 645,114 futures and 1,112,841 CFD line touches, each with a placebo copy.
- Every touch is its own event, with its context recorded:
  - time and session, minutes since the open;
  - touch number and approach side;
  - the prior 30-minute move, range consumed, vol regime, the previous day's trend;
  - sequence state: the previous touch of the same line, how the inner tier's first touch ended, ladder speed.
- Outcome race: ±0.25 line-σ. The through side is counted from the touch bar, the back side from the next bar, with a 120-minute cap.
- MFE and MAE are recorded at 15, 30, 60 and 120 minutes.

**Files**
- `matrix_{F,C}.csv`: the full matrix (family × tier × time × touch × approach), with:
  - n;
  - continuation, rejection and consolidation shares;
  - net continue and fade R with cluster-robust SEs;
  - line − placebo;
  - MFE and MAE at 15–120 minutes (median, P75, P90);
  - BH q-values.
- `margin_*.csv`: one-factor-at-a-time margins.
- `engine_cells_*.csv`: the cells chosen by the engine.
- `ladder_race_*.csv`: the ladder race.

## Verdicts (futures, primary)

| Test | Line | Line − placebo | Halves (vs placebo) | BH q | Verdict |
|---|---|---|---|---|---|
| **H1** early Median continues (1st inside touch, 00–10 London), continue net R | −0.146R [−0.161, −0.132] (gross +0.002) | −0.001 [−0.010, +0.008] | +0.001 / −0.003 | 0.85 | **NULL** |
| **H2** late P75/P90 reject (inside, 13–22 London), fade net R | −0.182R [−0.192, −0.172] (gross −0.012) | +0.005 [−0.003, +0.014] | +0.010 / +0.001 | 0.34 | **NULL** |
| **H3** range consumed (>1.2 vs <0.6), P(rejection) | +2.7 pp [+1.9, +3.5] | −0.8 pp [−1.4, −0.1] | +0.4 / −1.9 | 0.16 | **NULL** |
| **H4** touch 2+ vs touch 1, P(continuation) | −2.8 pp [−3.3, −2.3] | −0.3 pp [−0.5, +0.0] | −0.3 / −0.3 | 0.27 | **NULL** |
| **H5** P90 after a fast ladder (P75 ≤ 30 min earlier) vs slow, P(continuation) | +12.1 pp [+10.6, +13.7] | +4.4 pp [+2.9, +5.8] | +5.5 / +3.4 | < 0.01 | **CONTEXT** (see A2 caveat) |
| **H6** cell engine fitted 2020–23, traded 2024–26 | no cell passes the train screen after costs | — | — | — | **NULL** |

**CFD replication (gross):**

| | Line | Line − placebo |
|---|---|---|
| H1 | +0.025R | −0.002 |
| H2 | −0.001 | −0.004 |
| H3 | +3.5 pp | −0.3 |
| H4 | −3.2 pp | −0.3 |
| H5 | +12.4 pp | +3.8 [+2.4, +5.1] |

Every sign matches the futures.

### H6, the decision engine, in detail

| | Fitted on | Cells | Test trades | Test R | Engine − placebo engine |
|---|---|---|---|---|---|
| Futures, net (the test) | 2020–23 | 0 of 1,080 | 0 | — | — |
| Futures, **before costs** (descriptive) | 2020–23 | 56 | 25,079 | +0.010 [−0.001, +0.021] | +0.005 [−0.007, +0.017] |
| CFDs, gross | 2020–23 | 86 | 57,997 | +0.011 [+0.003, +0.019] | **−0.002** [−0.011, +0.007] |
| Futures ridge model (all context), net | 2020–23 | — | 7,729 | −0.012 [−0.031, +0.007] | +0.033 [+0.011, +0.054] |

- The ridge model's out-of-sample AUC is **0.503** (placebo 0.500).
- On CFDs, before costs, a context engine picks a small edge out of sample (+0.011R). **The same procedure fitted on placebo levels earns the same.** That edge is intraday time and momentum behaviour, not the levels.
- The ridge "beats placebo" only because the placebo version loses more. On its own it is −0.012R.

## What the matrix shows (futures, line; continuation − rejection, in pp)

**Time of day.**
- Continuation and rejection stay within ±2 pp at Median and P75 in every session, and the placebo matches each cell within about 1 pp.
- What changes with the clock is **how decisive** the touch is, not its direction. Consolidation (neither ±0.25σ within 120 minutes) runs:
  - 7% in the 13–16 NY overlap;
  - 24–28% in Asia and the London open;
  - **35% after 16:00**.
- P90 between 07:00 and 13:00 London is the one area that leans continuation:

| | Continuation − rejection | Placebo | Line − placebo |
|---|---|---|---|
| P90, 07–10 London | +6.7 pp | +1.9 | +3.4 pp ± 1.6 |
| P90, 10–13 London | +4.4 pp | +1.4 | +2.5 pp ± 1.4 |

The CFDs don't repeat it (−0.1 / +1.8 pp vs placebo). It is a pointer, about 3,600 and 5,800 touches, with no BH pass in the matrix.

**Tier.**
- Further out leans slightly more to continuation: Median +0.5, P75 +0.9, P90 +1.3 pp.
- The placebo is the same, so this is ordinary distance-from-open behaviour.

**Touch number.**
- The 1st touch leans continuation (+2.1 to +2.7 pp at every tier).
- The 2nd and later touches are flat, or lean very slightly to rejection.
- The placebo matches the line (H4 −0.3 pp).
- So the 1st touch is the most likely to carry on. Retests are coin flips. Levels do not "hold more" on retests.

**Approach.**
- A first touch from the open side leans continuation (+1.0 / +1.6 / +2.3 pp).
- A retest from beyond leans rejection (−0.4 / −0.8 / −1.1 pp).
- Both match the placebo.

**Prior move into the level.**
- A fast approach (> 0.35σ in 30 minutes) is more decisive: continuation 47–48%, rejection 45–46%, consolidation 6–9%, compared with 37–39% / 37–38% / 23–26% for a slow approach.
- It barely changes which way the touch goes (+1.9 to +2.7 pp), and the placebo matches.

**Range consumed.**
- More range used means slightly more rejection (+2.7 pp, H3), but less than the placebo shows, so it isn't a level effect.
- P75/P90 reached with < 0.6 of the forecast range used are rare (about 2.6k touches) gap-like days. Continuation runs 59–66% there, and the placebo is also high.

**Sequence.**
- The previous touch of the same line rejected → this touch continuation − rejection +1.9 pp. Previous touch continued → −1.1 pp. The placebo is similar.
- The inner tier's first touch rejecting or continuing changes the P75/P90 outcome by under 1 pp.
- **Ladder speed is the strongest context variable:**

| | Continuation | Rejection | Consolidation |
|---|---|---|---|
| P90, P75 touched ≤ 30 min earlier | 52.5% | 45.8% | 1.5% |
| P90, slow ladder | 40.3% | 39.9% | 19.7% |

- At P75 the gap is smaller (50.2 / 46.3%).
- It is mostly momentum. Placebo ladders show most of it too.

**Ladder race.** From the first P75 touch, P90 is reached before price returns to the median **46.5%** of the time. Two caveats apply (see A2):
- A driftless random walk given the typical tier spacing gives roughly 45–50%, so the ladder runs at about random-walk odds.
- The +10 pp over the placebo is an artefact of the placebo geometry.

**Costs dominate.**
- At a ±0.25 line-σ bracket, a round trip of 2.5 ticks costs about 0.06R on index futures and 0.4R on rates (median about 0.15R).
- Every one of the 315 futures matrix cells with a BH pass is **negative** net (233 cells).
- On the CFDs (gross), 9 cells pass, but none beats the placebo in that cell.

## Amendment A2 — POST-HOC (results seen; demotes only)

The placebo multipliers were drawn independently per tier. That leaves single-line comparisons (H1–H4, the matrix,
the engine) untouched. It does reshape the placebo ladder's spacing, though: placebo P90 can sit closer than placebo P75.

1. **The ladder race's line − placebo (+10 pp) is not evidence.** The race is read against a random walk instead (≈ equal).
2. **H5's level-specific part (+4.4 pp vs placebo) is not separable** from that geometry. H5 stays CONTEXT only as market behaviour: a fast ladder means continuation, which is momentum. It is not a property of our lines.

A per-session single multiplier would be needed to test the level-specific part. That is left to a new prereg.

## Answers to the owner's six questions

1. **Which levels offer the best opportunities?**
   - None stands out after costs.
   - Median, P75, P90, High/Low, Close± and the HL projections all behave like a level placed nowhere special.
   - The only leans are P90 continuation in the London morning and after a fast ladder. Both are mostly momentum, and the morning one doesn't hold on CFDs.
2. **At what times of day?**
   - The clock changes how decisive a touch is (NY overlap 7% consolidation; after 16:00, 35%), not which way it goes.
   - No session favours fading or following once the placebo is subtracted.
3. **Which levels favour continuation vs reversal?**
   - All lean very slightly to continuation on the first inside touch (+1 to +3 pp) and to rejection on retests from beyond.
   - The placebo is the same, so this is price behaviour, not a feature of our levels.
   - Early Median isn't a momentum trade (H1), and late P75/P90 isn't a fade (H2).
4. **Does touch number matter?**
   - Only in that the 1st touch is the most likely to continue and later touches are coin flips.
   - That is the same at placebo levels (H4 NULL).
5. **Does the sequence of earlier touches predict?**
   - Ladder speed does: a fast P75→P90 means continuation (+12 pp). That is momentum, mostly shared with the placebo.
   - The previous touch's result shifts the next by 1–2 pp.
   - Nothing in the sequence turns a level into a trade.
6. **Are we trading at the wrong time or with the wrong logic?**
   - A context engine fitted on 2020–23 finds **no cell worth trading after futures costs**.
   - Before costs it earns about +0.01R out of sample, and the same engine on placebo levels earns the same.
   - So a dynamic model doesn't beat a static one at these levels. The binding constraint is costs against a ±0.25σ move, not timing.

**Graded weight:** against a context-aware level-trading engine. There is weak context for P90 continuation (London morning, fast ladder) as a momentum read.
