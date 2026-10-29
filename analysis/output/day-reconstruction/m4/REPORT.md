# Milestone 4 — Does NQ continuation produce a tradable edge?

Prereg `forge/NQ_CONTINUATION_EXECUTION_PREREG.md` (pushed `d4da7ea9` before any execution result; amendment A1 after).
Script `scripts/day-reconstruction/m4_nq_execution.py`. Numbers `results.json`. Every base-cost trade:
`trades_real_base.csv`.

## Conclusion: 3 — the evidence is insufficient to justify further work

The rule loses money after realistic costs. It loses the same amount at levels that aren't the forecast's, and the
same amount entering at random times. The pre-registered decision rule gives outcome 3.

## 1. Which result was tested, and the limits on choosing it

- **Source:** milestone 3's +0.05 to +0.07R is the pooled cell **Fixed OH/OL, all rungs, both directions, ±0.25σ**
  (+0.069R gross, 2,668 touches, out-of-sample era).
- **Nothing narrower was justified.** It does not single out a percentile or a direction: p50 +0.06, p75 +0.07,
  p90 +0.12 (n 310); up +0.10, down +0.04; all intervals overlap. So the frozen rule is that pooled cell: long at
  OH p50/p75/p90, short at OL p50/p75/p90.
- **No unseen evaluation period exists.** Milestone 3 read both eras. Everything here is an exploratory, costed
  re-measurement of data already used to choose the rule, **not independent confirmation.** The only unseen data is
  the sealed holdout after 2026-08-21, which was not touched.

## 2. Rule as executed

- **Entry:** a stop order at each level from the London open, on real OANDA NAS100 bid/ask. A long triggers when the ask
  reaches the level and fills at the level, or at the bar's open if it gaps, plus 1 point of slippage. Shorts are
  mirrored on the bid.
- **Exits:** 1:1 at R = 0.25 × the day's σ scale. Target is a limit (no slippage). Stop and session-close exits pay
  1 point of slippage. Everything is flat at 22:00 London.
- **One trade per level per day.** Up to 3 positions at once; that happened.
- **Same-minute ambiguity, never resolved in the trade's favour:**
  - 257 fills (5.9%) where the fill minute also reached the stop: taken as stopped out;
  - 20 fills where the fill minute also reached the target: target not credited;
  - 0 later minutes where stop and target were both hit.
  - The optimistic treatment lifts the overall mean from −0.092R to −0.040R. **It's still negative.**

## 3. Results

| | Point-in-time era 2020-08-21 → 2026-08-20 (primary) | Earlier era 2016-10 → 2020-08-20 |
|---|---|---|
| Trades (per week) | 2,681 (8.6) | 1,660 (8.3) |
| Gross expectancy, mid prices, no costs | +0.018R [−0.021, +0.057] | +0.053R [+0.005, +0.099] |
| **Net expectancy, base costs** | **−0.050R [−0.091, −0.011]** | **−0.159R [−0.207, −0.108]** |
| Win rate / profit factor (net) | 47.6% / 0.90 | 43.9% / 0.72 |
| Max drawdown (cumulative R, 1R per trade) | 145R | 270R |
| Total | −134R | −265R |
| Long / short | −0.029R / −0.070R | −0.114R / −0.208R |
| p50 / p75 / p90 | −0.059 / −0.052 / −0.000R | −0.212 / −0.078 / −0.088R |

By year (net, primary era):

| 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 (to Aug) |
|---|---|---|---|---|---|---|
| −0.03 | −0.03 | −0.11 | −0.02 | +0.04 | −0.11 | −0.10 |

Positive in 1 of 7 years.

**Controls (identical execution and costs, primary era):**

| | Net expectancy | Real minus control [95%] |
|---|---|---|
| Forecast's OH/OL levels | −0.050R | |
| Phantom levels (×0.70 / 0.85 / 1.15 / 1.30, curvature-corrected) | −0.052R | +0.002 [−0.035, +0.037] |
| Random entries at the same clock time on other days, continuing that day's move | −0.046R | −0.004 [−0.044, +0.036] |

The forecast's levels add nothing beyond NQ's general behaviour, and that behaviour itself loses after costs.

**Cost sensitivity, primary era:**

| Slippage per stop/market fill | Net R |
|---|---|
| 0 points (spread only) | −0.021 |
| 1 point (base) | −0.050 |
| 2 points | −0.084 |
| 4 points | −0.152 |
| base + 2 points extra per round trip | −0.094 |

The earlier era is far more cost-sensitive: −0.033R at 0 points, −0.159R at 1 point. NQ's price was lower then, so a
point was a bigger share of R.

## 4. Why milestone 3's +0.07R does not carry over

The +0.069R in milestone 3 was a race measured from the exact level price on mid prices, crediting continuation
inside the touch minute. As an order:
- the fill is on the ask, sometimes beyond the level;
- the touch minute's own adverse extreme can stop the trade (5.9% of fills);
- the gross edge falls to about +0.02R before any cost.

The spread and one point of slippage (about 0.07R in this era) then make it negative.

## 5. Amendment the reader should know about

The pre-registered random-entry control drew entry times within ±2 hours of each real fill. Times *before* the fill
know that price will later reach the level, so that control was conditioned on the future. It showed +0.20R and was
invalid. It was replaced after the first run with the time-matched other-day control above (amendment A1 in the
prereg). The invalid value is kept in `results.json`. The rule and the other control were not changed.

## 6. One next action

**Close NQ continuation at the forecast levels**, and record the milestone 3 and 4 findings as the answer to "can the
existing forecast levels be traded as entries": no, on these three instruments. The forecast's role is then the one the
evidence supports: scaling how far a day travels and how much is left. No further backtest variants of this rule.
