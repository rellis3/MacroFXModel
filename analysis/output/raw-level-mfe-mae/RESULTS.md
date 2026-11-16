# raw-level-mfe-mae: how far price runs for and against you after touching a line

**Status: exploratory, not pre-registered (owner request 2026-11-15).** Register row `raw-level-mfe-mae`.
Follows `raw-level-revert-continue`. Seed 20261115. Data 2019-01 → 2026-08-21 (lockbox respected).
Full tables: `RESULTS_TABLES.md`; every cell: `grid_cells.csv`; numbers: `results.json`.
Code: `scripts/raw-level-mfe-mae/run.py`, `analyse.py` (`touches.parquet` and the `.npy` grids are gitignored; `run.py`
rebuilds them in about a minute).

## What was measured

For **every first touch of every line**, I measured from the touch to 22:00 London:

- **MFE** (max favourable excursion): the furthest price went in your favour.
- **MAE** (max adverse excursion): the furthest it went against you.

The lines are p50, p75 and p90 of the three raw line families from the parent study (no vol forecast), plus yesterday's
high and low: 11 line groups, 12 instruments and **139,507 touches**. Figures are given for a **fade**. A **follow** is
the mirror trade: its MFE is the fade's MAE.

Everything is in **U = one typical day's range** (that instrument's trailing-250-session median high-low), so FX, gold
and NQ read on one scale. Today's U in price terms: EURUSD 51 pips, GBPUSD 70, USDJPY 76, gold $83, NQ 428 points,
SPX 74, DAX 283 (full list in table C).

Each touch is compared with a **placebo**: the same trade at the same time of day in a random nearby session.

Every stop × target pair was also priced on the real path: 6 stops (0.05–0.40 U) × 7 targets (0.05–0.60 U), fade and
follow, for each line group, which is 1,008 cells. Unresolved trades are closed at 22:00 and kept. One spread per
round trip is deducted.

## Findings

### 1. After a touch, a fade and a follow have the same odds

| | MFE p50 / p75 / p90 | MAE p50 / p75 / p90 | MFE > MAE |
|---|---|---|---|
| All lines, real touches | 0.29 / 0.65 / 1.17 U | 0.30 / 0.67 / 1.21 U | **50.0%** |
| Placebo (random point) | 0.38 / 0.56 / 0.78 U | 0.38 / 0.56 / 0.78 U | 50.1% |

Every line group is the same: between 48.7% and 51.8% of touches go further for the fade than against it. Yesterday's
low comes out highest at 51.8% (placebo 49.3%), but that is small and it doesn't survive costs (see 3).

### 2. What a line changes is the spread of outcomes, not the direction

Compared with a random point, after a touch the **typical move is smaller** (median 0.29 vs 0.38 U) and the **big move
is bigger** (p90 1.17 vs 0.78 U), **in both directions equally**. Price either stalls near the line or runs hard; which
way it runs is a coin flip. The p90 lines show this most (p90 MAE 1.40 U against 0.77 for the placebo).

### 3. No stop/target combination makes money, at any line

On 15-minute closes a stop can be filled two ways, so every cell was priced under both:

- **kind**: the stop fills at the stop price, ignoring how far the 15-minute close went through it.
- **harsh**: the stop fills at the 15-minute close that broke it.

The truth lies between the two.

- **0 of 1,008 cells is profitable under both.** The "kind" fill makes tight-stop, wide-target trades look positive
  for **both** fade and follow (e.g. stop 0.05 U / target 0.6 U, +0.03 U a trade). Because fade and follow are mirror
  trades, that can only come from the fill assumption. The "harsh" fill turns the same cells to −0.03 U or worse.
- **Pooled across all lines, with stops of 0.2 U or wider, every cell loses under both fills.** The losses run from
  −0.003 to −0.09 U a trade.
- **Where the line differs from random, it hurts.** In 174 cells line-vs-placebo passes BH q = 0.10 under both fill
  models, and **all 174 are negative**. They cluster in **small target (0.05–0.15 U) with a wide stop**, for follow
  (124) and fade (50), mostly at p75 and p90. This is finding 2 in practice: after a touch the big runs are bigger, so
  "scalp a little, give it room" gets hit by the tail more often than at a random point.

### 4. Heat numbers, for sizing stops on a signal from somewhere else

- **Total heat (MAE) to the close:** median 0.30 U, p75 0.67 U, p90 1.21 U. Each instrument's own figures at today's U: NQ about
  133 / 304 / 552 points, EURUSD about 14 / 31 / 55 pips, gold about $27 / $59 / $105.
- **Heat taken before the best price:** median 0.07 U, p75 0.21 U. Three quarters of trades reach their best price
  without going more than about 0.2 U against you first. With a real directional signal, a stop around 0.2 U would
  rarely cut a winner before it peaks. Here there is no directional signal, so that alone makes no money.
- **Time to the best price:** median 3 hours. For p90 lines it is 1.75 hours, for yesterday's high and low about
  5 hours.
- **Instruments:** all 12 look the same in U (median MAE 0.27–0.33 U). FX majors sit slightly lower than indices and
  metals at p75/p90.

## How this ties to the parent study

`raw-level-revert-continue` found that fading and following at the lines both lose about one spread. This study shows
why. After a touch the excursion odds are 50/50 for fade and follow at every line and every stop and target size,
with fatter tails both ways. The line marks a point where price is more likely to make a big move, but not which way
it goes. A strategy needs something else to choose the direction.

## Caveats

1. **15-minute closes, not M1.** Wicks are missed and the stop fill is uncertain, which is why two models were run.
   Cells with stops of 0.10 U or less are not judgeable on this data. Re-run on M1 with bid/ask on the laptop.
2. Costs: median OANDA spread by instrument and year. Silver and Brent spreads are flat assumptions.
3. 1,008 cells were searched. Results are reported only where both fill models agree, with BH applied. Nothing here
   is `VALIDATED`.
4. U changes slowly (250-session median), so on very busy days U understates the day's real range.

## Next options

- **M1 re-run** of the tight-stop cells (0.05–0.10 U): the only place where the fill model decides the answer.
- **The finding is that lines flag big moves, not direction**, and that is testable. Does touching a p75 or p90 line
  predict a bigger rest of the day than the time of day already does? If so, the lines could support a
  direction-neutral options-style or breakout-straddle idea, or a vol input. That needs its own prereg.
- Anything directional at the lines has to come from **outside** the lines (for example macro, positioning or the
  4-hour trend from the bias work), then be scored with the heat numbers above.
