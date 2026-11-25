# level-stack-stop: results (exploratory, not pre-registered)

Register row `level-stack-stop` (EXPLORATORY, dc2a8a76). Script `scripts/level-stack-stop/run.py` (`summarise` re-runs
the tables). Tables: `stacks.csv`, `stack_share_by_instrument.csv`, `noise_threshold.csv`,
`noise_threshold_by_hour.csv`, `stops.csv`; `results.json`; log `report.txt`. Per-touch files (`touches/`) are not
committed.

**Questions.** Jordan (a C.OG group member) to the owner, 2026-11-17:
- "Switch your stops to median ticks."
- "Do you trade every level?"
- "What happens if 2 levels are within proximity of a few ticks?"

C.OG's earlier answer on stop tables (2026-09-26): use none of mean, median, p75 or p90. Find the noise threshold
instead, per look-back horizon.

**Setup.** The same touches as `level-touch-excursions`: every touch of each instrument's per-line QLIKE levels
(Close+, Close−, OH, OL; median, 75th and 90th), with placebo levels beside them. 25 futures and 40 CFDs, 2020 →
2026-08-21. The fade is entered at the level. Results are in the line's own daily σ or in R, **gross (no costs)**.

## 1. Two lines within a few ticks is the normal case, not a special one

At the same percentile, the Close+ line and the OH line nearly coincide, and so do Close− and OL. The typical gap is
0.01–0.05σ.

| | Another line ≤ 0.05σ away | ≤ 0.15σ away |
|---|---|---|
| Share of futures touches | 66% | 96% |
| Share of CFD touches | 65% | 94% |

**In ticks (futures), the share within 5 ticks depends on the tick size, not the market:**
- ZB, ZF, ZN, ZT: 98%
- 6E: 86%
- Gold: 44%
- ES: 38%
- NQ: 13% (the median gap is 32 ticks)

So "a few ticks" means very different things across instruments. Rates and FX ticks are large next to σ; NQ ticks are
tiny. USDCAD, USDCHF and USDJPY futures are quoted inverted, so their tick counts are approximate.

**Stacked vs isolated touches:**

| | Futures, Close± | Futures, OH/OL | CFDs |
|---|---|---|---|
| Stacked: MAE60 p50 | 0.17σ | | |
| Isolated (> 0.15σ, 4–8% of touches): MAE60 p50 | 0.21σ | 0.19σ | |
| Back 0.25σ before through 0.25σ, isolated line minus its placebo | +1.9 pp | +2.6 pp | +1.0 to +2.3 pp |
| Same, stacked line minus its placebo | about −1 to 0 pp | | |

- Isolated lines move about 20% more than stacked ones.
- The placebo buckets differ in where they sit (far-from-line placebos are mostly beyond the 90th), so the
  isolated-line lean is a pointer only.
- **A stack does not make the level stronger.** It is mostly the Close and OH/OL calcs agreeing, which is what they
  usually do.

**Practical read:** treat a Close+/OH pair (and a Close−/OL pair) at the same percentile as one zone, not two signals.

## 2. Noise threshold (C.OG's way): none found

For each stop distance X from 0.025σ to 1.5σ, take the touches that went X through the line. Then ask where price is at
22:00, measured from the stop price.
- On a random walk this averages zero.
- If going X through were "just noise", price would tend to come back (positive).
- If it were information, price would keep going (negative).

| X through | Futures Close±: mean after-stop move / share positive | CFDs Close± | Line minus placebo |
|---|---|---|---|
| 0.10σ | −0.018σ / 49.7% | −0.009σ / 50.7% | within ±0.005σ |
| 0.25σ | −0.020σ / 49.9% | −0.007σ / 51.2% | within ±0.005σ |
| 0.50σ | −0.023σ / 50.3% | −0.002σ / 51.7% | within ±0.01σ |
| 1.00σ | −0.034σ / 50.6% | +0.016σ / 52.7% | within ±0.01σ |

The after-stop move is flat at every distance, in every London hour (`noise_threshold_by_hour.csv`), and the same at
lines and placebos.
- There is no distance where adverse movement switches from noise to information.
- Wherever the stop sits, what happens after it is a coin flip.
- Futures drift very slightly on through (−0.02σ); CFDs slightly back beyond 0.75σ (+0.01 to +0.05σ). Both are tiny.

## 3. Stops: "median ticks" vs fixed σ, 1R and 2R targets

The "median ticks" stop is the trailing median 60-minute MAE, in price, over the last W sessions (W = 10, 21, 32, 42,
63, 126, 252), from earlier sessions only. It works out to about 0.15–0.17σ. Each touch is raced to 22:00; unresolved
trades are marked at the close, and ties count as stops.

| Stop | Target | Win % (line / placebo) | R per trade, line | Line minus placebo |
|---|---|---|---|---|
| Median MAE60, 63 days | 1R | 47% / 47% | −0.011 | −0.003 to +0.006R |
| Median MAE60, 63 days | 2R | 30% / 30% | −0.002 to −0.014 | −0.007 to +0.014R |
| Fixed 0.20σ | 1R | 47% / 47% | −0.007 to −0.010 | −0.005 to +0.010R |
| Fixed 0.50σ | 1R | 34% / 34% | −0.008 | −0.003 to +0.002R |

- Gross R is about −0.01 everywhere. That is the touch-bar tilt (the touch bar can only hit the stop).
- The look-back window changes nothing: 10 days through 252 days all give the same distribution.
- The median-ticks stop is no better or worse than a σ stop. **It only trades win rate for payoff**, the same result as
  the 2026-11-18 VWAP check on the old lines.
- One faint lean: futures Close± at 2R runs +0.01 to +0.02R over placebo. That is 1–2% of the risk, gross, and smaller
  than costs.

**Audit note.** The first summary showed the trailing stop beating placebo by +0.02–0.04R everywhere. That was a bug:
the stop was only defined on sessions where the real line was touched, which dropped placebo touches on other days. It
was fixed before this write-up, and the numbers above are the corrected ones.

## 4. "Do you trade every level?"

Every touch was traded here, and no level type turns the fade positive. By percentile, with a fixed 0.20σ stop (gross R
per trade, line; then line minus placebo with its 90% CI):

| | 1R futures | 1R CFDs | 2R futures | 2R CFDs |
|---|---|---|---|---|
| Median line | −0.003; +0.008 [+0.002, +0.014] | −0.008; +0.001 | −0.000; +0.012 [+0.003, +0.022] | −0.011; −0.001 |
| 75th | −0.018; +0.002 | −0.015; −0.006 | −0.021; −0.002 | −0.020; −0.012 |
| 90th | −0.018; +0.009 | −0.008; +0.001 | −0.016; +0.014 | −0.001; +0.007 |

- The futures median line is the only CI above zero: +0.01R gross, and it doesn't replicate on the CFDs.
- Skipping the 75th and 90th lines removes nothing that wins.
- What to trade has to be decided by the entry condition, not by the line.

## What it means

1. **Stop size:** use σ, not ticks. Ticks mean different things per contract and drift as price moves. About 0.15–0.20σ
   is the median 60-minute overshoot. No stop size, fixed or trailing, creates an edge by itself.
2. **Stacked levels:** a Close+/OH pair is one zone. Stacks are slightly quieter but turn no more often.
3. **No noise threshold** exists at the level alone. That is C.OG's test, and it says the edge has to come from the
   entry condition (what Jordan sees at the level), not from where the stop goes.
