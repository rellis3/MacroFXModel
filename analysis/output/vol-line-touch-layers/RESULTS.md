# vol-line-touch-layers: results

**Pre-registered** (`forge/VOL_LINE_TOUCH_LAYERS_PREREG.md`, prereg 3b7ce6e5, A1 49fe2f06 + ced2c183, all pushed before any
outcome was read; discovery fit frozen 5a5b9af0 before scoring). Seed 20261117. Confirm scored once, 2026-11-17.

**Verdicts: map `vol-line-touch-layers-map` NULL · meta `vol-line-touch-layers-meta` UNDERPOWERED · add
`vol-line-touch-layers-add` UNDERPOWERED** (A2 post-hoc: the shared gate said INVALID for meta and add, see below).

Data: 137,524 first touches of the production PIT vol lines (O→H / O→L p50, p75, p90), 34 instruments, M1 bid/ask,
01:00–19:00 London. Every trade is net of the real spread at entry and exit, and gaps through stops are charged.
Discovery 2016-10-24 → 2022-12-30: 88,049 touches. Confirm 2023-01-01 → 2026-08-20: 49,475 touches on 943 dates.

## In one paragraph

Every touch trade loses after spread, fade or follow, at every rung: −0.09 to −0.19R a trade. A model can **avoid**
much of that loss: its top fifth loses only −0.04 to −0.08R. But no top fifth is profitable. The confirm
interval sits wholly below zero in all six combos. The avoidance comes mainly from **trading cheaper instruments**
(indices and gold, about half the spread in R), not from better timing. The confirmed vol-layer inputs add nothing
over the existing meta inputs (−0.011 to +0.005R, intervals within ±0.025R). But the proof pack shows the pipeline
could not have seen a small (+0.06R) layer edge, because the spread dominates its ranking. So "the layers carry no
small edge" is not proven. Large layer edges (+0.30R on a third of touches) would have been found.

## A. Layer-state map (NULL on discovery)

984 eligible cells (layer input × state × time block × rung × side × shape, ≥ 300 touches each). **0 pass BH at
q = 0.10, so there are 0 candidates.** Only 4 of 984 cells have a positive mean net R. Nothing was carried to
the confirm window. Closest cells (discovery, description only): err10 top third, 13–19, p90, fade S2 (−0.057R,
p 0.010); spread bottom third, 01–07, p75, fade S1 (+0.061R, n 403, p 0.017). This matches `raw-line-touch-clock-hour`:
no condition turns a vol-line touch into a net-positive trade.

## B1. Meta-model top fifth (confirm, layered model)

| Combo | All touches | Taken (top fifth by discovery threshold) | Skipped | Lift (taken − all) | Kind |
|---|---|---|---|---|---|
| fade S1 (1:1 0.25σ) | −0.175 [−0.191, −0.159] | −0.063 [−0.087, −0.038], n 6,950 | −0.194 | +0.113 [+0.088, +0.138] | avoids |
| fade S2 (1:1 0.5σ) | −0.097 [−0.113, −0.081] | −0.054 [−0.078, −0.030], n 12,104 | −0.110 | +0.042 [+0.022, +0.064] | avoids |
| fade S3 (2:1) | −0.183 [−0.203, −0.162] | −0.080 [−0.110, −0.047], n 11,096 | −0.212 | +0.103 [+0.077, +0.130] | avoids |
| follow S1 | −0.194 [−0.213, −0.176] | −0.076 [−0.100, −0.054], n 16,084 | −0.251 | +0.118 [+0.101, +0.137] | avoids |
| **follow S2 (headline)** | −0.094 [−0.112, −0.077] | **−0.038 [−0.062, −0.014]**, n 13,994, 943 dates | −0.117 | +0.057 [+0.039, +0.073] | avoids |
| follow S3 | −0.189 [−0.211, −0.167] | −0.055 [−0.086, −0.025], n 14,529 | −0.244 | +0.134 [+0.107, +0.161] | avoids |

R per trade, 95% date-block bootstrap intervals. Every combo is **avoids**, none **picks**. Holm: 0 of 6. +1 lag:
negative in all six. Years: 0 of 4 positive in every combo (headline: 2023 −0.026, 2024 −0.045, 2025 −0.055,
2026 −0.022). The base model is the same within ±0.011R (headline −0.037 [−0.061, −0.015]).

The take share drifted from the planned 20% to 14–33% on confirm, because the threshold is fixed on discovery and
the inputs' mix moved. This is reported as it fell; nothing was refitted.

**By rung (headline, layered, taken):** p50 −0.037 [−0.063, −0.012] n 7,743; p75 −0.037 [−0.077, −0.002] n 4,433;
p90 −0.042 [−0.095, +0.008] n 1,818. No rung is positive in any combo except one base-model cell at 0.000 (fade S1
p75, base). The p50, p75 and p90 touches behave alike once spread is paid.

## B2. Do the layers add? (confirm)

| Combo | Layered taken − base taken | Overlap of the two take-lists |
|---|---|---|
| fade S1 | −0.007 [−0.026, +0.011] | 65% |
| fade S2 | −0.011 [−0.025, +0.003] | 64% |
| fade S3 | −0.008 [−0.032, +0.013] | 62% |
| follow S1 | −0.005 [−0.017, +0.006] | 80% |
| **follow S2 (headline)** | **−0.001 [−0.011, +0.011]** | 76% |
| follow S3 | +0.005 [−0.009, +0.019] | 82% |

Discovery walk-forward said the same: layered and base taken within ±0.01R in every combo.

## Proof pack (headline combo) and the verdict words

| Check | Result |
|---|---|
| Large plant +0.30R on err10's top third (both windows) | taken mean moved +0.232R (B1), +0.161R (B2): recovered |
| Minimum plant +0.06R | moved +0.005R (B1), −0.009R (B2): **not recovered** |
| Shuffle (outcomes permuted within discovery dates) | taken − all +0.005 [−0.009, +0.019]: shows nothing |
| Reproduction | refit take-list equals the frozen one |

`forge/verdict_gate.py` marks meta and add **INVALID**, because the minimum plant was missed. The reason is visible
above: the model ranks touches mostly by cost. Spread in R differs by 0.1–0.2R between instruments, so a +0.06R
signal on a third of touches barely changes which touches make the top fifth. **A2 (POST-HOC, demotion only):** both
are banked UNDERPOWERED, not NULL. The measured result stands as measured: this model's top fifth loses on unseen
data (interval wholly below zero). What is not proven is that the layers carry no small edge that a cost-neutral
ranking could find.

## What the filter actually picks (post-hoc, description only)

Headline (follow S2), confirm: taken touches have half the spread (0.027σ vs 0.052σ). They are 43% indices and 5%
gold, against 8% and 2.5% in the skipped touches, and 32% crosses against 69%. Before spread (approximately, adding
back one spread), taken touches make about +0.017R against −0.005R for all touches. Fade S1 is the same picture:
spread 0.018σ vs 0.049σ, gross about +0.011R vs +0.004R. **The filter mostly finds where costs are lowest, not when
the line is a good trade.**

## MFE / MAE

Quartiles of the favourable and adverse excursion (σ) at 60 minutes and to 21:00, by time block × rung × side, both
windows: `confirm/describe.json`. Median fade and follow excursions are within about 0.04σ of each other in every
block × rung. In both sides the median adverse excursion at 60 minutes exceeds the favourable one by about
0.03–0.05σ, because excursions are measured from the fill, so the spread shows up as adverse. What changes with the
hour is size: the median excursion to 21:00 falls from about 0.6σ (01–07) to about 0.32σ (13–19), while the 60-minute
excursion rises. This repeats `raw-line-touch-clock`: the hour changes how much is left to move, not which way.

## What this changes

- **The vol lines and the six layers are risk tools.** They tell you how far, how fast, and how likely a stop is
  hit. They do not say which way a line touch resolves, at any hour, in any layer state, alone or combined in a model.
- **Meta-labelling (layer 5) stays blocked on a primary with gross lift.** A filter on a zero-gross-edge primary can
  only pick cheaper trades. The first thing any filter here learns is the spread.
- **The open question this leaves** is whether a spread-neutral ranking (a model of gross R, judged per instrument
  class) can see a small layer edge. That is a different study with its own prereg. Its prior is weak: gross R at
  touches sits within about ±0.02R of zero here and in every earlier touch study.
