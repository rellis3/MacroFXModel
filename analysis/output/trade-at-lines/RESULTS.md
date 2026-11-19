# trade-at-lines — results

Prereg: `forge/TRADE_AT_LINES_PREREG.md` (2026-11-19). Seed 20261119, B = 2000, 63-session blocks within instrument.
Script: `scripts/trade-at-lines/score.py`. Trades: `trades.parquet` (local). Numbers: `results.json`; log: `report.txt`.
Ledger: `trade-at-lines` (NULL).

## Verdict: NULL — every rule loses after real spreads, and the real lines do no better than shifted copies

Data: NQ, GOLD and EURUSD CFD, 2018 → 2026-08, 6,698 sessions. Fills are on OANDA bid/ask M1, which means:
- limits fill only on a trade-through
- stops fill at the gap open when price gaps through them
- if a bar hits both stop and target, the stop counts first

| Rule (pooled) | Rung | Trades | Net R (90% CI) | Gross R (mid) | Win % | vs shifted lines |
|---|---|---|---|---|---|---|
| Fade at the line, stop past the outer zone, 1R target | p50 | 6,580 | −0.099 [−0.115, −0.079] | −0.048 | 47.2 | −0.017 |
| | p75 | 3,322 | −0.105 [−0.126, −0.083] | −0.056 | 46.7 | +0.009 |
| | p90 | 1,302 | −0.108 [−0.152, −0.063] | −0.060 | 45.6 | −0.013 |
| Fade at the zone (line + typical run-past), target the line | p50 | 5,152 | −0.146 [−0.165, −0.123] | −0.070 | 52.2 | −0.034 |
| | p75 | 2,499 | −0.140 [−0.163, −0.110] | −0.065 | 51.9 | −0.009 |
| | p90 | 930 | −0.106 [−0.152, −0.051] | −0.021 | 53.7 | −0.010 |
| Follow the break, 0.25σ stop, next-rung target | p50 | 6,716 | −0.092 [−0.116, −0.071] | +0.011 | 34.3 | +0.004 |
| | p75 | 3,404 | −0.056 [−0.093, −0.019] | +0.055 | 33.2 | −0.002 |
| | p90 | 1,329 | −0.089 [−0.137, −0.035] | +0.009 | 46.0 | −0.001 |

The exhaustion-odds filter (fade only when next-line odds ≤ 35%; follow only when ≥ 55%) doesn't help. Its net R ranges
from −0.097 to −0.201, and it is no better than the shifted lines. That holds even though the odds were fitted on this
same history. At p90 the odds never fall to 35% or below, so the filtered fade cells have no trades.

Per instrument, all-touch net R, ordered p50 / p75 / p90:

| Instrument | Fade at the line | Fade at the zone | Follow the break |
|---|---|---|---|
| NQ | −0.05 / −0.09 / −0.10 | −0.12 / −0.14 / −0.06 | −0.01 / +0.13 / +0.00 |
| GOLD | −0.11 / −0.13 / −0.10 | −0.15 / −0.16 / −0.17 | −0.13 / −0.12 / −0.13 |
| EURUSD | −0.14 / −0.09 / −0.13 | −0.17 / −0.12 / −0.08 | −0.14 / −0.19 / −0.14 |

## Reading

- **Before costs, every rule is close to zero.**
  - Fades run slightly negative, because price usually goes a bit further than the line.
  - Follows run slightly positive at p75 (+0.06R), and that is NQ's upward drift.
- **After the spread, everything is negative.** That is what a random walk at the lines predicts. It agrees with the
  three earlier results in the same family: turn-at-lines, reversal-zones and the old-line fade/follow tests.
- **The real lines never beat their shifted copies.** The line placement adds nothing to a trade.
- **NQ follow-the-p75-break at +0.13R net** is a single-instrument cell, and its direction matches NQ's long-run
  drift (`nq-line-touch-hold-to-close`). Treat it as a pointer only. It would need its own pre-registration on new data.
- **What the levels are good for:** sizing the day (how far it is likely to go, by regime), setting realistic targets
  and stops (the zones and the next-line odds), and knowing when a move is probably spent late in the session. They
  aren't a signal for where to enter.
