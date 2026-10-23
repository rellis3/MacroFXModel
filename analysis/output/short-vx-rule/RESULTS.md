# short-vx-rule — results

Prereg: `forge/SHORT_VX_RULE_PREREG.md` (registered `0a6655d7`; A1 PRE-RESULTS power `6945c946`; A2 POST-HOC sampler
fix). Seed 20261023. Files: `results.json`, `trades.csv`, `power.json`. Page: `research-log.html`.

**Verdict: UNDERPOWERED.**

- The rule makes money after costs.
- It has **not** been shown to beat shorting VX on random days, which is the contango roll anyone short VX collects.

## The rule

On the banked flag (VVIX- or VIX-to-Nasdaq ratio in its top 10%):

- short the nearest VX with ≥ 35 days left at the next settle;
- stop at +25% on settles;
- hold 20 sessions, one position at a time;
- costs 0.10 points round trip (+0.05 on stops);
- risk 1% of equity at the stop.

Sample: 2013-05 → 2026-08-21.

| | Flag rule | Random-entry shorting (same count per year) |
|---|---|---|
| Trades | 52 | 2,000 matched sets |
| Mean net R per trade | **+0.22R** (95% CI +0.06 to +0.35) | +0.12R |
| Mean net return per trade | +5.5% of entry | — |
| Winners | 77% | — |
| Stops hit | 1 of 52 | — |
| Worst / best trade | -2.19R / +0.89R | — |
| 2013–16 / 2017–20 / 2021–26 | +0.11 / +0.28 / +0.24 R | — |
| Equity at 1% risk, whole sample | ×1.119, max drawdown -2.4% | median ×1.058 |

**Flag minus random:** +0.10R per trade, 95% interval -0.04 to
+0.25, one-sided p **0.096**.

**Gate:**

| Condition | Result |
|---|---|
| CI excludes 0 | **pass** |
| Beats random | **fail** |
| All periods positive | **pass** |

The interval is wider than ±0.15R, so the verdict is UNDERPOWERED, not NULL. A1 had expected this: the minimum
detectable difference was about 0.28R.

**The stop barely matters, and doesn't protect.**

- +25% was hit once in 52 trades.
- That trade, February 2018, gapped from below the stop to **-2.19R** between two settles.
- Results with other stops and holds (descriptive):

| Variant | Trades | Mean R | Winners | Worst R | Random-entry mean R |
|---|---|---|---|---|---|
| stop +15% | 56 | +0.16 | 70% | -0.98 | +0.04 |
| stop +40% | 52 | +0.22 | 77% | -2.19 | +0.09 |
| no stop | 52 | +0.22 | 77% | -2.18 | +0.10 |
| hold 10, stop +25% | 84 | +0.12 | 64% | -0.76 | +0.03 |

## Deviation (Amendment A2, post-hoc)

The registered random-entry sampler rejected any draw with overlapping positions, and in crowded years (eight trades
in 2021) it often failed. The first run also kept sets that were missing a year's trades: a bug, which is mine.

- Requiring complete sets left 539 of the 2,000 registered.
- A sequential sampler that always completes gives p 0.096.
- The first, buggy run gave p 0.061.

Every version fails the p < 0.05 bar. Post-hoc changes can only demote, so the verdict stays UNDERPOWERED.

## What it means

Shorting VX after "fear has run ahead of the Nasdaq" has worked: +5.5% a trade, 77% winners, positive in every
period. But **most of that is the roll that shorting VX earns on any day**: random entries made +0.12R.
The flag's extra +0.10R a trade isn't proven, and one trade in 52 lost 2.2× its planned risk
through a gap.

This is not a trading rule yet. The forward record (`forge/VIX_SIGNALS_FORWARD_PREREG.md`) keeps paper-trading it and
judges it at 15 trades.
