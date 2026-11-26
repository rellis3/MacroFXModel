# jordan-level-history-select: results

**Setup**
- Prereg: `forge/JORDAN_LEVEL_HISTORY_SELECT_PREREG.md` (cf1f36ae). Script: `scripts/jordan-level-history-select/score.py`. Seed 20261126.
- Jordan's lines only: Close+, Close−, HL moving projections; Median / P75 / P90. Each level is kept per instrument.
- Data: `level-context-engine` touch events. 25 NT8 futures (net 2.5 ticks), 40 CFDs (gross), 2020 → 2026-08-21.
- Trade years 2022–2026. Each year's choice uses only the years before it.
- The rule, per instrument × line × tier × (1st touch / later):
  - choose fade or follow, whichever earned more in that level's history;
  - trade it next year only if the history has ≥ 50 touches, mean > 0 and t > 1.
- The same rule is run on placebo levels.

## Verdicts (futures, net)

| Test | Result [90% CI] | Halves (2022–23 / 2024–26) | Verdict |
|---|---|---|---|
| **S1** selected trades net R | **−0.031R** [−0.052, −0.009] (5,413 trades, 95 cells) | −0.013 / −0.045 | **NULL** |
| **S2** line engine − placebo engine | **−0.015R** [−0.046, +0.013] (placebo engine −0.016R, 6,878 trades) | +0.009 / −0.035 | **NULL** |

**Context:**

| | Futures, net | CFDs, gross |
|---|---|---|
| Every touch, fade | −0.151R | −0.006R |
| Every touch, follow | −0.130R | +0.004R |
| History-selected trades | −0.031R (gross +0.004R) | +0.011R [+0.008, +0.015] (172,885 trades) |
| Same selection on placebo levels | −0.016R | +0.014R |
| Line − placebo | — | −0.002R [−0.007, +0.002] |

- **Selection does something, but the same thing at placebo levels.**
  - It mostly avoids expensive contracts and trades about 0 gross.
  - On CFDs it lifts gross R from about 0 to +0.011R out of sample. Placebo levels lift it the same (+0.014R).
- **Each level's history only weakly predicts which side wins next year:**
  - the side chosen from history is the one that wins next year 54% of the time (all cells);
  - and 57% for the cells that pass the selection.
  - That isn't enough to clear costs, and the placebo selection does just as well.

## Variants (descriptive, futures net, line − placebo)

| Variant | Trades | Net R | Line − placebo |
|---|---|---|---|
| primary | 5,413 | −0.031 | −0.015 [−0.042, +0.015] |
| rolling 2-year history | 8,391 | −0.022 | +0.013 [−0.011, +0.035] |
| t > 0 | 29,579 | −0.037 | +0.003 [−0.010, +0.016] |
| t > 2 | 351 | −0.059 | −0.031 |
| min n 30 / 100 | 5,694 / 4,901 | −0.027 / −0.029 | −0.014 / −0.014 |
| no 1st/later touch split | 3,619 | −0.010 | −0.001 |

On CFDs, every variant is +0.006 to +0.022R gross, and every line − placebo is −0.001 to −0.003R.

## What gets selected (futures)

- **Follow is chosen 2:1 over fade** (3,673 vs 1,740 trades), led by Close+ follow (1,604).
  - Fade is chosen mostly at Close− (966) and the lower HL projection (600).
- **NQ supplies 47% of the trades**, at −0.012R net. It's the cheapest contract, so its history most often clears costs.
- Positive net, but on small samples:

| Instrument | Trades | Net R | Placebo |
|---|---|---|---|
| COPPER | 267 | +0.10 | −0.17 |
| DE30 | 286 | +0.02 | +0.34 |

- **By year:** 2022 −0.03, 2023 +0.00, 2024 −0.06, 2025 −0.07, 2026 +0.01.

## MAE: does selection get us to Jordan's medians?

`mae60` (60 minutes after the touch, every selected touch), median:

| | Every touch | History-selected | Jordan |
|---|---|---|---|
| NQ (ticks) | 160 | 150 | 114 |
| GC (ticks) | 44 | 38 | 34 |

- Selection pulls the median down a little (in σ it is unchanged: 0.19 → 0.19 NQ, 0.18 → 0.18 GC). The smaller tick figures come from trading quieter years, not from cleaner entries.
- 6E and 6J had no selected cells, because their history never cleared costs.
- So Jordan's lower median isn't reproduced by selecting levels on their history (as we can reconstruct it). His MAE is in-trade, capped by his stop (part E of `jordan-vwap-band-tp`), so this is only a rough comparison.

## Answer

Picking each level's side from its own history, as close to Jordan's description as we can build it, doesn't make his
lines tradeable after futures costs. It doesn't beat the same selection on placebo levels either, on futures or CFDs.

**Graded weight:** against history-selected level trading as an edge. Weak, generic support for "follow on cheap
contracts" (it shows up at placebo levels too).

**Next:** ask Jordan which statistic he looks at in the history. Is it the win rate at his 1R, the MAE versus his
stop, or how many days back he looks? Is it per line and tier, or by time of day? This test used net R at a ±0.25σ
bracket, and his exact KPI may differ.
