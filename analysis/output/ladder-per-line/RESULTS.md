# ladder-per-line — results

Prereg: `forge/LADDER_PER_LINE_PREREG.md` (2026-11-20, A1 pre-results 2026-11-22). Seed 20261120, B = 2000,
63-session blocks.
- Script: `scripts/ladder-per-line/score.py`
- Numbers: `results.json`
- Log: `report.txt`
- Trades: `trades.parquet` (local)
- Test years: 2019 → 2026-08-21. Models are chosen each year on earlier out-of-sample years only.

## Verdicts

| Part | Question | Verdict |
|---|---|---|
| A (`ladder-per-line`) | Does a separate σ model per line type (HL / OH / OL), chosen on each line's own pinball score, beat one model for all lines? | **UNDERPOWERED**: about zero difference |
| B1 (`ladder-per-line-oc`) | Does an OC model chosen on OC's own score beat the one model's OC lines? | **UNDERPOWERED**: about zero difference |
| B2 (`ladder-per-line-oc-tp`) | Fade the first touch of OH/OL p75 and take profit at the OC p50 line: does it make money, and does the OC level beat other take-profit distances? | **NULL** |

## Control

PC-A passed. A planted arm with informed OH lines was picked for OH in 8 of 8 years on all three instruments, and the
loss fell by 14.2% [−15.3, −13.0]. The scorer finds a better per-line model when one exists.

## Part A: per-line models (relative change in HL + OH + OL pinball; negative = better)

| Track | All | 2019–22 | 2023–26 | Regime miss: one model → per line |
|---|---|---|---|---|
| CFD | −0.26% [−0.63, +0.03] | −0.49% [−1.20, +0.08] | −0.03% [−0.15, +0.05] | 2.13 → 2.01pp |
| Futures | +0.12% [+0.00, +0.22] | +0.24% [+0.08, +0.45] | −0.01% [−0.12, +0.04] | 1.75 → 1.72pp |

- **The best model for each line is mostly the same model.**
  - NQ: SHAR for HL, OH and OL, apart from a few OL years on HAR-CJ.
  - EURUSD: HAR-CJ for HL and OL, SHAR for OH.
  - Gold: IV-adjusted for HL and OL, SHAR for OH.
- Where the picks differ, the difference is worth 0.0–0.7% of the loss, inside the noise. The futures came out slightly
  *worse*: OL on 6E +0.31% [+0.09, +0.60].
- Gold CFD is the only hint of a gain (−0.70% [−1.80, +0.13]), and it doesn't hold on GC futures (+0.01%).

## Part B1: the OC model

- OC chosen on its own score vs the one model's OC lines:
  - CFD −0.02% [−0.20, +0.13]
  - futures +0.29% [+0.06, +0.56]
- **The OC p50 line sits 0.01–0.05σ from the OH/OL p50 line** on every instrument and track, for example
  EURUSD 0.014σ / 0.022σ and NQ 0.03σ / 0.045σ. That confirms Jordan's observation. It's what a random walk implies:
  the furthest point reached and the closing distance share one distribution.

## Part B2: fade p75 → take profit at OC p50 (CFD, real bid/ask)

| | |
|---|---|
| Trades | 2,990 (NQ 1,033, GOLD 1,016, EURUSD 941); 0 skipped |
| Net R | **−0.086R [−0.105, −0.065]**; both halves negative (−0.091, −0.081) |
| Gross R (mid) | −0.048R |
| Take-profit hit first | 54.7%, vs 56.3% for a driftless walk with the same stop and target |
| vs take-profits at 0.7× / 1.3× the distance | +0.005R [−0.002, +0.011]: the OC level is no better a target than any other distance |
| Control PC-B2 | mid hit share 55.3% vs benchmark 57.4% over all real and placebo exits: ok |

The fade loses money before costs (the take-profit is hit slightly *less* often than chance), and costs make it worse.
This matches `trade-at-lines` and `reversal-zones`: price after touching a line behaves like a random walk.

## Reading

- **Jordan's first idea, the best HL/OH/OL model each, is already what we have.** On these three instruments the best
  model for every line type is essentially the same model, so one well-chosen model per instrument gives the per-line
  answer. Splitting by line type adds nothing measurable.
- **His second point is right, and here's why.** OC lines carry no information beyond the OH/OL lines (0.01–0.05σ
  apart). Using OC p50 as a take-profit after an OH/OL p75 fade loses, and the OC level is no better than any other
  target distance.
- **What would make the lines more useful isn't a different σ model.** It's information about the day as it unfolds:
  `extreme-in-probability`, `intraday-range` and the exhaustion odds, which are all validated.
