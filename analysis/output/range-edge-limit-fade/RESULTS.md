# range-edge-limit-fade — results

Prereg: `forge/RANGE_EDGE_LIMIT_FADE_PREREG.md` (registered `7097eaf5`, 2026-10-20; amendment A1 `8cc0fe9e`). Run
2026-10-20, seed 20261020, B = 2000, 21-session date blocks. Branch `main`. Ledger id: `range-edge-limit-fade`. Full
tables: `RESULTS_TABLES.md`; numbers: `results.json`; every trade: `trades.csv`.

## Verdict: NULL

Neither cell passes, and both 95% CI upper bounds are below the registered +0.05R line (they are below zero).

| Cell | Trades | Mean net R | 95% CI | t |
|---|---|---|---|---|
| T1 sell A_1 / buy A_0, target range mid (1:1) | 24,006 | **−0.109** | −0.124 … −0.093 | −13.6 |
| T2 same, target opposite edge (2:1) | 24,006 | **−0.119** | −0.139 … −0.099 | −11.7 |
| T1 stress fill (through by one spread) | 23,363 | −0.169 | −0.184 … −0.153 | −21.3 |
| T1 placebo ladders (control C1) | 73,990 | −0.090 | −0.101 … −0.078 | |
| T1 real − placebo | | **−0.019** | −0.033 … −0.003 | −2.6 |
| T2 real − placebo | | −0.026 | −0.043 … −0.006 | −2.8 |

Every gate condition fails for both cells: negative in both halves (T1 −0.131 / −0.100), in the seen 19 (−0.111) and
the unseen 15 (−0.097), under the stress fill, in every year 2016–2026, and on 32 of 34 instruments (the two positives
are eurcad, 153 trades, and eurgbp, 24 trades). Removing the top 1% of days makes it worse (T1 −0.125).

## What the numbers say

- **The race itself loses before costs.** T1 wins 44.4% at 1:1; 51.1% of trades take the full stop. Mean spread at
  the fill minute is 0.066R, so the mid-price result is about −0.04R per trade before any cost. The spread then makes
  it −0.11R. Once the bid has traded through the Asia high (or the ask through the low), price continues more often
  than it comes back to the middle.
- **The real edges are slightly worse than shifted ladders**, by −0.02R (CI excludes zero). The +3 pp of extra
  reversion `range-ladder-placebo` measured at the edges does not show up as P&L in this trade form.
- **Fill rate is 98.5%**, so at the edges the hairline problem that hit Fib Atlas is small. The
  touched-not-filled diagnostic (99.7% reach the mid) is mechanically biased and is not evidence: a touch counts as
  not-filled only if price never traded through the level again before 20:00, which also stops it reaching the stop
  line first.
- **The spread filter removes most sessions**: 57,896 of 76,245 session-instrument days have spread > 0.10 × R at
  placement; 9,733 more had price outside the range at placement and 481 had no usable bars; 18,135 were placed. On the days where the Asia range is narrow, the trade is not executable at all.
- **The mirror is not free money.** A fade at −0.04R gross implies a break-follow at about +0.04R gross, which pays
  roughly the same spread on entry and is then below zero. Not scored here; a break-follow at the Asia edge needs
  its own prereg, and `paper-record` rule A already trades breaks on rich-IV days.

## Descriptive, POST-HOC (results seen; not a test)

Why a validated location effect (`range-ladder-placebo-confirm`: +2.92 pp, 15/15 instruments) gives no trade. I
expected the effect to sit on narrow-range days the spread filter removes. It does not:
`scripts/range-edge-limit-fade/explain_by_cost.mjs` (the book's own mid-price race at A_0/A_1, all 34 instruments,
K = 4 placebo ladders) split by spread ÷ R at placement:

| spread ÷ R | sessions | edge touches | revert real | revert placebo | Δ (pp) |
|---|---|---|---|---|---|
| ≤ 0.10 (placed by the rule) | 20,641 | 28,248 | 50.07% | 46.37% | +3.70 |
| 0.10–0.20 | 31,112 | 46,488 | 50.34% | 47.26% | +3.08 |
| 0.20–0.40 | 26,021 | 42,076 | 51.02% | 48.32% | +2.71 |
| > 0.40 | 7,990 | 13,822 | 53.73% | 50.84% | +2.89 |

The location effect is present, and largest, on the tradeable days. But it moves the race from about 46% (a random
level, where the day's push-through wins) to about 50%: a coin flip before costs. The trade form here lands lower
still (46.7% from the fill) because a trade-through fill picks the touches that went a little further, and the
spread does the rest. **The edge cancels continuation; it does not create reversal.**

## What this changes

- **The Asia range ladder is closed as a stand-alone fade**, at both exits, with a resting order, on real bid/ask.
  No more exit variants on it (`feedback_lessons_on_track`).
- **Fib Atlas's lesson, in one line:** its money was never in the levels. The honest race at the most informative
  rung loses before costs, and the backtest's win rate came from look-ahead and hairline touches.
- What the Atlas work keeps: the machinery (point-in-time walk, barrier pricing, one-account simulation, live-vs-
  backtest alignment) and the bid/ask fill simulator built here (`scripts/range-edge-limit-fade/run.mjs`), which any
  future level or break study can reuse to price fills honestly.
