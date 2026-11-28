# atlas-honest-gonogo — results

Prereg: `forge/ATLAS_HONEST_GONOGO_PREREG.md` (registered 2026-11-01; A1 `ef1cd55c` 2026-11-27, A2 `62cb548c`
2026-11-28, both pre-results). Run 2026-11-28, seed 20261101, B = 2000, block 21 session dates, 2000 decision shuffles.
Branch `ccr-c6e5e0a6-jdd5lm`. Ledger ids: `atlas-honest-gonogo-vote`, `atlas-honest-gonogo-asia`, `atlas-honest-gonogo-monday`.

Data: OANDA bid/ask M1, 2016-10 → 2026-08-20 23:59 UTC (lockbox from 2026-08-21 cut by `extract.py`). Scored window
= each pair's real 60/40 split (2021-12 to 2023-01 by pair) → 2026-08-20.

## Verdict: Vote Atlas NULL · Asia Fib UNDERPOWERED · Monday Fib UNDERPOWERED

The registered gate is: mean net R at the production margin above zero (Holm across 3), beating the
decision-shuffle 95th percentile, and both halves positive. Every system loses after the spread.
- **Vote Atlas:** −0.060R [−0.076, −0.044] on 27,480 trades. The interval rules out the +0.05R bar, and the MDE
  (+0.027R) was under it, so this is NULL.
- **Asia and Monday:** larger losses (−0.414R and −0.271R), but their MDEs (A2: +0.075R, +0.129R) were above the bar,
  so §5 makes them UNDERPOWERED by design: description only. Both intervals lie wholly below zero.

## Scored cells

| Cell | n | Mean net R | 95% CI | MDE (A2) | Pass bar | Holm p | Shuffle p95 / real pct | Halves | Cell verdict |
|---|---|---|---|---|---|---|---|---|---|
| vote (m ≥ 3) | 27,480 | −0.0599 | [−0.0757, −0.0436] | 0.027 | +0.05 | 1.00 | −0.069 / 1.00 | −0.072 / −0.050 | **NULL** |
| asia (m ≥ 2) | 4,100 | −0.4142 | [−0.4602, −0.3675] | 0.075 | +0.05 | 1.00 | −0.448 / 1.00 | −0.367 / −0.466 | **UNDERPOWERED** (by design) |
| monday (m ≥ 2) | 650 | −0.2712 | [−0.3508, −0.1878] | 0.129 | +0.05 | 1.00 | −0.211 / 0.004 | −0.234 / −0.309 | **UNDERPOWERED** (by design) |

## Controls

- **Decision shuffle.** Vote and Asia beat their own shuffled decisions (real percentile 1.00). Monday is below its
  shuffle (0.004).
- **Mid fills.** On mid prices the same trades are about break-even: vote −0.004R, Asia +0.015R, Monday −0.017R.
  The losses are the spread.
- **§8 NULL audit** (before banking; script kept in the session scratchpad, logic below):
  - Random-walk guard: the vote pipeline on 4 × 3 years of synthetic M1 scores −0.003R with no spread (m ≥ 3:
    −0.021R, n 1,547, within noise) and −0.030R with a 1-pip spread. The machinery invents no edge.
  - Production route against this script, EURUSD: 2,976 production trades (`js/levelAtlasRoutes.js` runOne, honest
    book, `buildBarrierTrades`) against 2,976 script votes. Same split date (2022-08-12); 100% the same decision and
    100% the same margin.
  - Dropped and unfilled: vote 28,232 voted, 27,480 traded (97.3%), fade fill rate 95%. Asia 4,985 → 4,100, fade
    fill 77%. Monday 670 → 650, fade fill 97%.

## Deviations from the prereg

- **A1** (2026-11-27, PRE-RESULTS): the power table from `--mode count`.
- **A2** (2026-11-28, PRE-RESULTS, owner's decision): the design effect is measured on the voted traded sample, not
  the control sample. It moved the vote's MDE from 0.013 to 0.027 and Asia's from 0.377 to 0.075. It changed no
  powered/underpowered status.
- `run.mjs` ROOT path fix for Windows: it could not find the data before, and the logic is unchanged.

## Descriptive (not part of the verdict)

**Decomposition** (owner's rule for a null):
- **Vote decision.** It beats the shuffle, and on the vote it beats always-follow (−0.050R) and always-fade
  (−0.098R) only by choosing more follows. Vote's fades lose −0.083R [−0.103, −0.064] (n 15,279); its follows lose
  −0.030R [−0.055, −0.004] (n 12,201). Neither is positive.
- **Asia.** Always-fade −0.434R, always-follow −0.833R; vote fades −0.484R, follows −0.229R.
- **Monday.** Always-fade −0.242R, always-follow −0.319R.
- **Cost.** Mid ≈ 0 everywhere, so the spread against the stop distance decides the result. Asia's lines are narrow,
  which is why it loses most.

**By year, vote:** 2022 −0.074 · 2023 −0.069 · 2024 −0.060 · 2025 −0.048 · 2026 −0.059. Every year negative.

**By instrument, vote:** only SPX is above zero (+0.007, n 1,383). No instrument survives BH q = 0.10 in any system.

**Engine as-is, vote** (session-vol inputs not blanked): −0.060R [−0.075, −0.043], n 27,442. Blanking changes
nothing.

**Gap filter:** Asia ≤ 30 min −0.455R (n 1,822); Monday ≤ 180 min −0.307R (n 345).

The cost map (median spread ÷ stop by instrument × UTC hour) is in `cost_map.json`.

## What this changes

- **Vote Atlas.** The bot pages stop implying that the vote's fade/follow trades make money on their own. They lose
  after the spread in every year. The vote does pick better than chance (it beats the shuffle), but not by enough to
  pay the spread at these stop distances.
- **Fib Atlas (Asia, Monday).** It can't be called NULL from this sample, but nothing here supports trading it. The
  mean losses are 8× (Asia) and 5× (Monday) the pass bar.
- **Next step** (§8): present the Atlases as range/level maps. Any structural alternative needs its own prereg: the
  levels for stop and target placement under a separate direction source, or wider stops where spread/stop is small.
- **What would reopen it:** the lockbox (from 2026-08-21) at ≥ 60 sessions, or a forward record, only for a new frozen
  configuration. Not a retune of this vote.
