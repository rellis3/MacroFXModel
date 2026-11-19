# turn-at-lines — results

Prereg: `forge/TURN_AT_LINES_PREREG.md` (2026-11-19). Run 2026-11-19, seed 20261119, B = 2000, 63-session blocks
(within each instrument). Script `scripts/turn-at-lines/score.py`. Numbers are in `results.json`; the log is in
`report.txt`. Ledger: `turn-at-lines-close` (UNDERPOWERED), `turn-at-lines-proj` (NULL).

## Verdicts (CFD, pooled NQ + GOLD + EURUSD, chosen-arm lines, k = 0.05σ)

Turns are 13,396 session highs and lows (6,698 sessions, 2018 → 2026-08-21). "Hit" means the turn landed within
0.05σ of a line. The placebo is the same line moved ±0.15σ and ±0.30σ.

| Family | Hit at line | Hit at offset copies | Excess, 90% CI | Halves 2018–22 / 2023–26 | BH | Verdict |
|---|---|---|---|---|---|---|
| CLOSE (median/75th of open→close, up for highs, down for lows) | 11.2% | 10.7% | +0.51pp [+0.01, +1.02] | [+0.25, +1.53] / [−0.85, +0.59] | no | **UNDERPOWERED** |
| PROJ (projected H/L at the time of the turn) | 6.7% | 6.9% | −0.25pp [−0.67, +0.16] | [−0.59, +0.51] / [−1.10, +0.21] | no | **NULL** |
| EXT (OH/OL p50/75/90) | 13.3% | 12.8% | +0.59pp [−0.13, +1.07] | — | no | UNDERPOWERED |
| ALL | 21.6% | 21.2% | +0.34pp [−0.38, +0.89] | — | no | NULL |

The live estimator's lines (A0) give the same picture: every family is NULL, with excesses between −0.25 and +0.38pp.

## Reported (no rule)

- **Per instrument (hit / offsets, %):**

  | Instrument | EXT | CLOSE | PROJ |
  |---|---|---|---|
  | NQ | 13.9 / 13.1 | 11.0 / 10.6 | 7.1 / 7.1 |
  | GOLD | 13.2 / 12.1 | 11.2 / 10.5 | 6.1 / 6.9 |
  | EURUSD | 12.9 / 13.1 | 11.4 / 11.1 | 6.8 / 6.8 |

- **Tolerance:** at k = 0.03, CLOSE is +0.13pp; at k = 0.10 it is +0.93pp.
- **Opening minutes:** dropping turns in the first 15 minutes leaves CLOSE at +0.55pp.
- **Futures:** CLOSE is +0.46pp.
- **The screenshot benchmark was wrong.** I had measured "chance" as the distance from a random point in the day's
  range to the nearest line. Across every turn in our history, our own nearest line sits at a median **0.31×** that
  figure, and 54% of turns fall within a third of it. That's because highs and lows sit at the range ends, which is
  where ladder lines are. The rival's 8 screenshot days (0.1–0.4×) are typical for any ladder, so that benchmark
  can't show who is more accurate.

## Reading

- Highs and lows don't land **at** ladder lines meaningfully more than right **beside** them. That holds for her line
  type (close-distribution lines), for projected lines, and for our own range lines alike.
- If close lines have any attraction, it is about half a point, and it isn't established.
- How "accurate" a ladder's lines look against a day's turns comes mostly from line density and where the lines are
  placed. It doesn't come from lines that attract turns.
- The rival comparison therefore needs her unselected daily record (logged from 2026-11-20), scored with ours on the
  same days and the same yardstick (calibration by vol regime, plus distance to turn against this history).
