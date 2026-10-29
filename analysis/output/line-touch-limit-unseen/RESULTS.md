# line-touch-limit-unseen — results

Prereg: `forge/LINE_TOUCH_LIMIT_UNSEEN_PREREG.md` (registered `de149448`, 2026-10-28). Run 2026-10-28, seed 20261028,
B = 2000, 21-session date blocks. Branch `main`. Ledger id: `line-touch-limit-unseen`. Numbers: `results.json`; the
MAE-rule curve: `dstar.json`; every signal with each cell's result: `trades.csv`; log: `run.log`.

## Verdict: NULL

No cell passes its gate, and all three 95% CI upper bounds are below the registered +0.05R line.

| Cell (17 unseen FX pairs, signals 2018-01-05 → 2026-08-03) | Trades | Mean net R | 95% CI | Holm p | Halves | Pairs > 0 |
|---|---|---|---|---|---|---|
| M market entry at the touch-bar close | 1,045 | **−0.377** | −0.456 … −0.296 | < 0.001 | −0.41 / −0.34 | 0 / 17 |
| L resting limit at the mid, 15 min | 886 (fill 84.8%) | **−0.461** | −0.531 … −0.392 | < 0.001 | −0.49 / −0.43 | 0 / 17 |
| J limit + MAE-rule stop (d* = 0.40 of the day's range) | 886 | **−0.066** | −0.152 … +0.025 | 0.154 | −0.10 / −0.03 | 5 / 17 |
| L stress fill (through by one spread) | 715 | −0.800 | −0.857 … −0.747 | | | |
| J stress fill | 715 | −0.167 | −0.264 … −0.064 | | | |

No signal falls in 2017: the 2017 model, fitted on 2016 alone, scores no touch above c (the original scan had no 2017
selections either). Halves are therefore 2018–2021 and 2022–2026.

Realised MDE: M 0.116R, L 0.097R, J 0.127R (all below the 0.15R line the prereg set for supporting NULL).
Reproduction check D4 passed exactly: the refit's predictions for the scan's discovery rows equal
`preds_discovery.npz` (180,950 rows, max difference 0.0).

## What the numbers say

**1. The selector's edge is real and it transfers.** Frozen on the 17 instruments it was built on, it picked 1,045
signals on 17 pairs it had never seen (2.08 a week, 96% fades of a fresh extreme). On mid prices with the scan's own
exit structure those signals made **+0.241R gross** (seen out-of-fold: +0.197R; the bid/ask mid with this test's
21:55 exit: +0.215R). Against random touches of the same pair, year and hour, traded the same way, the selector adds
**+0.10R** [+0.02, +0.18] (M) and +0.10R [+0.01, +0.19] (J). "Fade the fresh extreme after a fast run-in" carries
information out of sample, as the scan's placebo said.

**2. The spread is bigger than the edge.** With the scan's stop (0.10 of the day's expected range), the median
spread on these pairs is **0.47R**. The scan assumed 0.2R. A market fade pays one spread on the round trip, and the
stop sits on the far quote, so the stop is hit more often too: 70% of M trades take the full stop. Every pair loses,
in every year.

**3. A resting order makes it worse. This answers "who is paying".** The limit fills 85% of signals. The 15% it
misses are the ones where price turned at once and never came back: on mid prices those made **+1.63R**. The 85% it
fills made **−0.04R** before costs. All of the edge sits in the signals a passive order cannot catch. At a fresh
extreme after a fast run, the trader who keeps buying is usually right about the next few minutes. Whoever sells to
them passively is the one paying. A market order buys the right to be in the trades that reverse at once, and that is
worth more than the spread it saves.

**4. The MAE rule (C.OG's answer to Jordan) says the stop was far too tight.** On the seen-set trades, for every
adverse distance up to 0.40 of the day's range, trades that reached it still ended better on average than a stop
there would have (e.g. reached 0.10 → ended −0.06; reached 0.40 → ended −0.31). MAE never started predicting a loser
inside the grid, so the stop went to the cap, 4× the scan's. That cut the spread to 0.12R and moved the result from
−0.46R (L) to −0.07R (J). The lowest-spread third of J trades made +0.02R. Still not positive, and only 5 of 17 pairs
made money.

## Descriptive (not scored)

- **D2, seen holdout re-priced** (2022-06-24 → 2026-08-20, fifth read, description only): 376 signals, gross +0.145R
  on mid; M −0.125R, L −0.338R, J −0.124R at a median spread of 0.31R. The scan's own instruments, mostly USD
  majors and indices, have tighter spreads than the crosses, and still lose.
- **By spread ÷ R tercile (M / L / J)**: lowest −0.21 / −0.24 / +0.02; middle −0.25 / −0.44 / −0.04; highest
  −0.67 / −0.73 / −0.19.
- **By line family**: no family is positive under M or L. Under J only oh50 is above zero (+0.008).
- **Continue trades** (45 of 1,045) were worse than fades in every cell.
- **By year (J)**: positive in 2019, 2022, 2025 and 2026; negative in the other five.
- **Fix before write-up**: the D1 mid-price helper first passed the bar close where the bar open belonged (mid
  stop-outs filled at the close). Fixed and re-run with the same seed. M, L and J use the real opens and were
  unchanged; only D1 and the `mid_R` column moved.

## What this changes

- **The one replicated touch effect does not pay on real spreads in any execution form**, on pairs it never saw. The
  line-touch book is closed for intraday trading on these line families, as the prereg set out. No more backtest
  variants on this selector.
- **What it keeps.** The touch information is real: about +0.1R over a random touch, out of sample. It can be used as
  **context**, e.g. "this extreme looks exhausted, don't chase it", but not as an entry on its own at this stop size.
- **Garin's question has a measured answer for this setup**: the passive side pays. Limit-order versions of fades at
  fresh extremes should be presumed worse than market entries unless a test shows otherwise.
- **For Jordan's MAE table**: C.OG's rule, built properly, says don't put the stop where most trades stop going
  against you. Put it past the point where going against you starts to mean "loser", and for this setup that point is
  beyond 0.40 of a day's range. Tight stops are what made every version of this trade lose.
- **Where it points next, if anywhere** (each needs its own prereg; none are run here): (a) the same
  information on a slower horizon with a stop beyond 0.40 of range, where the spread falls under 0.1R, on the
  liquid USD majors and index futures; (b) the edge as a filter that stops break-follow trades from entering into
  exhausted extremes.
