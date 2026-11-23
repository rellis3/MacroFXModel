# ladder-wide-race: results

Prereg: `forge/LADDER_WIDE_RACE_PREREG.md` (pushed 64388e1e before scoring). Seed 20261123, B = 2000, 63-session
blocks. Script `scripts/ladder-wide-race/race.py`; numbers `results.json`; log `report.txt`; full leaderboard
`leaderboard.csv`. Futures (NT8): NQ, GC, 6E, 6J. Test 2020 → 2026-08-21 (~1,650 sessions each), picks on earlier
years only. 51–55 models per line (about 20 old + 35 new).

**Verdict: UNDERPOWERED.** Choosing from the wider field did not beat choosing from the old one overall.

## Controls

| Control | Result |
|---|---|
| 1. Bar alignment (Yang-Zhang 20 rebuilt vs the build) | 100% of sessions match on all four |
| 2. Old pick reproduces `ladder-qlike-per-line` | +0.000% on all four |
| 3. Planted near-perfect model gets picked | every line, every year, all four |

## H1: wider pick vs old pick (summed QLIKE, negative = wider better)

| | Δ | 90% CI |
|---|---|---|
| **All** | **−0.06%** | [−0.89, +0.29] |
| 2020–22 | −0.64% | [−1.51, +0.08] |
| 2023–26 | +0.42% | [−0.77, +0.87] |
| HL / OH / OL | −0.96% / −0.08% / +0.05% | |
| NQ | **−1.99%** | [−3.40, −0.54] |
| GOLD | +0.02% | [−0.18, +0.31] |
| EURUSD | −0.63% | [−1.26, +0.04] |
| USDJPY | +2.36% | [−0.38, +3.08] (the pick kept switching) |

## Best model per line (hindsight, out of sample 2020–2026.08; descriptive only)

| | HL | OH (Close+) | OL (Close−) |
|---|---|---|---|
| NQ | top-5 combo 0.336 (old best IV blend 0.351, −4.4%) | HAR + leverage 1.208 (SHAR 1.218) | top-5 combo 1.557 (IV blend 1.571) |
| GOLD | HAR-IV 0.325 (V3 0.335, −2.8%) | HAR + weekday 1.286 (HAR-CJ 1.290) | HAR-IV 1.538 (V4 1.558) |
| EURUSD | HAR-all 0.294 (HAR-CJ 0.299) | AR(22) 1.366 (HAR-CJ 1.370) | HAR-all 1.273 (HAR-CJ 1.289) |
| USDJPY | HAR + leverage 0.502 (SHAR 0.505) | ARFIMA 1.419 (SHAR 1.423) | HAR + weekday 1.715 (R5 1.719) |

The new best beats the old best by 0.2–4.4%. The top 8 in every cell are all HAR-family models, IV models or
combinations of them, and sit within ~2% of each other.

## Jordan-like arms (yesterday's realised vol alone)

"Yesterday's 5-min RV" was the closest match to Jordan's NQ σ on 23 Nov. On QLIKE it ranks 43rd–55th of 51–55 in every
cell. That's 4–152% worse than the best model (NQ HL +152%, GOLD HL +104%), and Parkinson 1-day is last or next to
last everywhere. If Jordan's σ is built that way it would score badly on QLIKE. We only know one day of his output,
so this says nothing yet about his actual method.

## Reading

- We already had the right family. Adding GARCH variants, ARIMA, ARFIMA, Realized GARCH, range estimators, boosted
  trees and direct per-line models found nothing that changes the picture overall. The gains are 0.2–4%, and the
  walk-forward picker can't hold onto them reliably.
- NQ is the exception: averaging the top 3–5 models helps (−2.0% [−3.4, −0.5] on the walk-forward pick). That's a
  leaning candidate for the NQ lines.
- Graded weight: faint overall, leaning for NQ combos, and the HAR-IV gain on gold HL/OL is worth a forward check.
