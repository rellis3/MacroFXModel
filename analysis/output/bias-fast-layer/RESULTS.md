# bias-fast-layer — results

Prereg: `forge/BIAS_FAST_LAYER_PREREG.md` (A1 pre-results, A2 post-hoc). Seed 20261124, 21-session block bootstrap, B = 1000.
Sample 2016-03-29 → 2026-08-20 (local OANDA H1; lockbox never reached). 274,111 slot × market observations; 81,499 fast calls (|z| ≥ 0.5).
Scripts: `scripts/bias-fast-layer/build.py`, `run.mjs`, scoring through `js/biasFastCore.js` (the module the live shadow uses).

**Unit:** the move over the next 3 hours divided by a typical 3-hour move for that market (σ). Practical bar 0.03σ.

## Positive control
Planted 0.10, recovered 0.105 [0.095, 0.118]. Pass.

## A2: the prereg statistic carries lookahead (read this first)
§3.5 averaged each session's calls and then averaged sessions. A call's weight is then 1 / (calls that session), and the number of calls depends on later slots: whether the dollar and 2-year move kept going. Sessions where the move faded get few calls, each heavily weighted, and the market faded with its drivers after the call. That weighting turns a +0.019 call-level edge into −0.131. The placebo (random session's drivers) sat at −0.0002, because a placebo call's count does not track the real session's path. Prereg-statistic numbers are kept below as computed, but they are not read as evidence. The verdicts rest on the call-weighted statistic: every call weighs the same, its inclusion uses only what was known at its slot, with the same blocks and draws. Under the protocol a post-hoc change can only demote or describe, and none of the verdicts below is promoted by it.

## Hypotheses

| | Call-weighted (A2, read this) | Prereg statistic (contaminated) | Verdict |
|---|---|---|---|
| **H1** fast call, next 3 h | **+0.019 [−0.004, +0.039]**, halves +0.031 / +0.011, 11 of 12 markets, p 0.09 | −0.131 [−0.150, −0.113] | **UNDERPOWERED** (below the 0.03 bar; interval reaches past it) |
| **H2** fast minus following the market's own move since 07:00 | **+0.009 [−0.005, +0.023]**, halves +0.016 / +0.005, 8 of 12 | −0.107 | **NULL** (inside ±0.03) |
| **H3** drivers and market disagree: fast call | **+0.076 [+0.005, +0.143]**, halves +0.084 / +0.070, 8 of 12, p 0.04, n 3,824 calls | +0.084 [+0.024, +0.141], both halves, 8 of 12, BH pass | **VALIDATED** on both statistics, with the scope below |

Placebo (prereg statistic, 50 draws): median −0.0002 [−0.006, +0.006].

## H3 is a dollar-pairs effect, not a gold or index one

| Market | H3 edge (disagree) | strong disagree (|z| ≥ 1), descriptive |
|---|---|---|
| EURUSD | +0.150 | +0.52 |
| GBPUSD | +0.064 | +0.06 |
| AUDUSD | +0.233 | +0.74 |
| NZDUSD | +0.243 | +0.92 |
| USDCAD | +0.227 | +0.54 |
| USDCHF | +0.085 | +0.35 |
| USDJPY | +0.019 | +0.14 |
| GOLD | **−0.055** | −0.32 |
| NQ | −0.021 | +0.59 |
| SPX500 | +0.002 | +0.28 |
| US30 | −0.006 | +0.42 |
| DE30 | −0.014 | −0.16 |

When one dollar pair has gone the other way from the rest of the dollar (the other five pairs) and the 2-year since 07:00, it tends to catch up over the next 3 hours. For gold, "the dollar is up but gold has not fallen yet" does not lead to gold falling: −0.055, and −0.32 on the strong cases (small n). Pooled strong disagreements (|z| ≥ 1, n 640): +0.35 [+0.10, +0.58], both halves, 10 of 12. This is descriptive, a candidate for the forward record.

## Descriptive (call-weighted)

| | edge | interval | halves |
|---|---|---|---|
| following the market's own move since 07:00 | +0.010 | [−0.007, +0.026] | +0.015 / +0.006 |
| fast and own move agree | +0.028 | [−0.001, +0.054] | +0.043 / +0.018 |
| fast call, own move flat | −0.010 | [−0.034, +0.013] | |
| fast call |z| ≥ 1 | +0.055 | [−0.003, +0.118] | +0.091 / +0.036 |
| fast call to 21:00 | +0.022 | [−0.012, +0.056] | +0.044 / +0.007 |
| dollar part only | +0.017 | [−0.011, +0.044] | |
| 2-year part only | +0.044 | [−0.031, +0.110] | |

By slot (fast call, next 3 h): 09:00 +0.048, 10:00 +0.005, 11:00 −0.002, 12:00 +0.016, 13:00 +0.032, 14:00 +0.037, 15:00 +0.021, 16:00 +0.005, 17:00 +0.036, 18:00 −0.008.

## What this means for the desk
- The fast layer on its own (the dollar and the 2-year since this morning, mapped through each market's betas) gives a small positive lean of about 2% of a 3-hour move. That is about one spread on the majors, and no better than following the market's own move. It is shown as context ("what the dollar and 2-year imply now"), not as a call.
- The useful part is the **lag flag on dollar pairs**: the rest of the dollar and the 2-year have moved, and this pair has gone the other way. It tends to catch up over the next 3 hours, by about 0.08σ on average and about 0.35σ when the gap is large. Shown live as a flag on the FX pairs, with a forward record.
- Gold and indices: no lag flag. A dollar move that gold has not followed is not a reason to expect gold to follow within hours.
