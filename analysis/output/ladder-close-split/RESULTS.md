# ladder-close-split: results

Prereg: `forge/LADDER_CLOSE_SPLIT_PREREG.md` (pushed 1007fa64; A1 reopen 4893fb10, both before any result). Seed
20261124, B = 2000, 63-session blocks. Script `scripts/ladder-close-split/score.py`; `results.json`, `report.txt`.
Futures NQ, GC, 6E, 6J, test 2020 → 2026-08-21.

Close+ = how far above the 00:00 open price closed, on days that closed up. Close− = how far below, on days that
closed down. Each line has its own walk-forward model race (~55 models) and its own multipliers, and each is scored
on its own days only.

Controls: |signed close| matches the build on 100% of sessions; up + down + flat cover every session. Up/down days:
NQ 1204/992, GOLD 1127/1028, EURUSD 1047/1127, USDJPY 1176/982.

## Verdict: **NULL**. A separate Close+ / Close− lands no nearer the actual close than one symmetric line

Abs error of the median line vs the actual close (negative = split nearer):

| | SPLIT (old + wide field) | SPLIT, old field only |
|---|---|---|
| All | +0.21% [−0.16, +0.57] | +0.40% [+0.03, +0.77] |
| 2020–22 / 2023–26 | +0.06% / +0.45% | +0.12% / +0.69% |
| Close+ / Close− | +0.29% / +0.14% | +0.09% / +0.74% |
| NQ / GOLD / EURUSD / USDJPY | **−0.9% [−1.9, +0.2]** / +0.2% / +0.6% / +0.9% | 0.0% / +0.1% / +0.5% / +1.0% |

## Each side does pick its own calc

| | Close+ (2026 pick) | Close− (2026 pick) | One line now |
|---|---|---|---|
| NQ | RV EWMA 0.50 (SHAR 2023–25) | RV EWMA 0.50 every year | SHAR |
| GOLD | SHAR / HAR + weekday | V4 (implied vol) | V3 (implied vol) |
| EURUSD | HAR-all | HAR-all / HAR + weekday | HAR-CJ |
| USDJPY | HAR + weekday | RV EWMA 0.85 | R5 |

## Hit rates on each side's own days (targets 50 / 25 / 10) and the median line

| | Close+ split · one line | Close− split · one line | Median line up / down (split) |
|---|---|---|---|
| NQ | 49/24/9 · 55/27/9 | 52/24/9 · 54/29/13 | 0.93% / 0.84% |
| GOLD | 53/28/11 · 53/27/11 | 50/27/10 · 51/27/11 | 0.60% / 0.60% |
| EURUSD | 54/28/12 · 52/26/10 | 47/23/10 · 49/24/9 | 0.26% / 0.29% |
| USDJPY | 50/24/11 · 51/24/11 | 54/29/11 · 53/29/12 | 0.32% / 0.29% |

## Reading

- The up/down asymmetry in the close is small: the median lines differ by 0–0.1% of price. One symmetric line is
  already about as near the actual close as two separate ones.
- NQ is the one place the split leans better (−0.9%, not significant). It mostly fixes the current NQ close line
  sitting a little low (beaten on 55% of up-close days vs 49% split).
- The close stays hard to land for everyone. Graded weight: against overall, faint lean on NQ.
