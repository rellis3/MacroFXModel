# jordan-system-race: results

Prereg `forge/JORDAN_SYSTEM_RACE_PREREG.md` (20513766). Script `scripts/jordan-system-race/run.py` (`summarise` re-runs
the tables). Seed 20261125. Files: `results.json`, `report.txt`, `calcs_<family>_<system>.csv` (per instrument:
hindsight-best calc, QLIKE pick, mean and SD over calcs), `picks_<family>_<system>.csv` (the SYS and QL pick per
instrument × year). Per-trade files are not committed.

**Question (Jordan's clue, 2026-11-19):** "The best forecaster will not result in the best system." Every calc pick so
far was made on forecast score. Here each instrument's HL calc (16 site calcs) was instead chosen by the trade
result in earlier years. That choice was then scored on the next year (2021 → 2026-08-21), against the QLIKE pick.

**Systems** (on Jordan's HL moving projections; futures net of 2.5 ticks, CFDs gross):
- **S1:** follow the break of the HL p90 projection, stop at the p75 projection, exit 22:00.
- **S2:** fade the HL p75 projection, stop at the p90 projection, target the Close± median line.

## Verdicts

| | SYS pick minus QLIKE pick (R per trade) | 2021–23 | 2024–26 | Verdict |
|---|---|---|---|---|
| Futures, S1 follow p90 | −0.010 [−0.040, +0.022] | −0.016 | −0.002 | **UNDERPOWERED** (upper CI just above +0.02) |
| Futures, S2 fade p75 → Close± | −0.003 [−0.020, +0.012] | +0.006 | −0.016 | **NULL** |
| CFDs, S1 | −0.013 [−0.036, +0.011] | −0.016 | −0.011 | **NULL** |
| CFDs, S2 | −0.008 [−0.021, +0.004] | −0.010 | −0.006 | **NULL** |

Choosing the calc by past trade results does **not** beat choosing it by QLIKE. The point estimate is slightly
worse in all four tests and both halves. Graded weight: against.

## Why: the "best calc for the system" is luck that doesn't repeat

- **In hindsight, the best calc looks much better:** about +0.10R per trade over the QLIKE pick on S1, and +0.05–0.06R
  on S2, averaged over instruments.
- **That gap doesn't carry forward.**
  - The calc that did best in earlier years is a different calc from QLIKE 92–95% of the time.
  - It changes from one year to the next about half the time.
  - Next year it does no better than QLIKE.
- **The spread between calcs is noise.** The SD of R across the 16 calcs (about 0.06R on S1, 0.03R on S2 per
  instrument) is the same size as the sampling noise of a few hundred trades. Pooled over instruments, every calc
  sits within about ±0.04R of the others. No family wins consistently:
  - GARCH is marginally top on futures S1.
  - EWMA 0.90 is top on CFD S1.
  - The fast naive σ (closest to Jordan's fast-ATR recipe) is the worst on futures S1.

So for these trades, tuning the calc to past trade results is **overfitting**. This is the owner's worry of
2026-11-25, and here it is measured.

## The systems themselves (QLIKE pick, descriptive)

| | Futures (net) | CFDs (gross) |
|---|---|---|
| S1 follow HL p90 | −0.011 [−0.077, +0.054] (2021–23 −0.021, 2024–26 +0.001) | +0.028 [−0.037, +0.091] |
| S2 fade HL p75 → Close± median | **−0.101 [−0.126, −0.075]**, both halves | −0.014 [−0.034, +0.010] |

- **Following the HL p90 break** on the moving projections is around zero net. It is not the +0.054R of the banked
  `futures-qlike-trades` B (fixed OH/OL p90 lines, 4 contracts). Per instrument it ranges from +0.16 (NQ) and +0.15
  (USDCHF) down to −0.23 (ZB).
- **Fading the HL p75 projection back to the Close± median** is about zero gross (CFDs −0.01R). On futures it loses
  0.10R after costs, because the stop (p90 − p75 projection) is narrow, so costs are a large share of R.

## What it means

- **Jordan's clue is not about the calc.** With trade-picked calcs, the system gets no better out of sample; the
  QLIKE picks stay. If "the best forecaster isn't the best system" holds, the difference has to come from **how the
  lines are traded**: the entry, the timing and the context. That is what `close-reversal-confirm` tests.
- **The site keeps its QLIKE per-line picks.** No "system pick" option is added.
