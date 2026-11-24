# close-level-reversal: results

Prereg: `forge/CLOSE_LEVEL_REVERSAL_PREREG.md` (pushed 57e96a55, no amendments). Seed 20261124, B = 2000, 63-session
date-aligned blocks. Script `scripts/close-level-reversal/race.py`; numbers `results.json`; per instrument
`per_instrument.csv`; day-clock tables `day_clock.csv` (instrument × line × τ × unit × hours) and `day_clock_pooled.csv`;
log `report.txt`. Per-touch files (`touches/`, 16 MB) are not committed and regenerate in ~15 min.

Jordan's step 2 (a C.OG group member): "we use the close level as reversing points". At each instrument's own per-line
QLIKE levels (Close+, Close−, OH, OL; median/75th/90th), the first touch of the session raced "back toward the open by
a quarter of the line's daily σ" against "through the line by the same", next to a placebo level at 0.75–0.90 or
1.10–1.25 × the distance, raced the same way. 25 futures (primary, ~65,000 resolved Close± touches) and 40 CFDs
(replication, ~113,000), 2020 → 2026-08-21.

## Controls

1. Levels reproduce the races' walk-forward picks on 100% of line-years, all 65 instruments.
2. Hit rates near 50/25/10% everywhere; dropped per the ±6 pp rule: ZF Close− and CHFJPY Close+ only.
3. Placebo touched at rates beside the real lines (real 51/26/11%, placebo 51/27/12%).

Mechanics: ties 0.1%; unresolved by 22:00 5% (0.25σ) and 24% (0.5σ), same for line and placebo.

## H1, Close+ / Close− as reversing points: **NULL**

Reversal share at the line minus at the placebo (pp), mean over instruments:

| | All | 2020–22 | 2023–26 | Line share | Placebo share |
|---|---|---|---|---|---|
| Futures | +0.30 [−0.09, +0.72] | +0.57 [+0.05, +1.15] | +0.08 [−0.48, +0.68] | 49.2% | 48.9% |
| CFDs | +0.10 [−0.17, +0.32] | +0.17 [−0.27, +0.49] | +0.04 [−0.30, +0.37] | 48.9% | 48.8% |

Both CIs sit under +1 pp, so the registered word is NULL. Graded weight: **against**. Price turns at the close lines at
the same rate as at any level the same distance from the open: about 49 reversals in 100 resolved touches, a coin
flip less the touch-bar tilt.

## H2, OH / OL (projected high/low) as reversing points: **NULL**

| | All | 2020–22 | 2023–26 | Line share | Placebo share |
|---|---|---|---|---|---|
| Futures | +0.33 [+0.03, +0.66] | +0.47 [+0.04, +0.84] | +0.18 [−0.25, +0.69] | 49.2% | 48.8% |
| CFDs | −0.14 [−0.53, +0.23] | −0.68 [−1.24, −0.18] | +0.31 [−0.17, +0.75] | 48.8% | 49.0% |

NULL (both CI uppers < +1 pp). Graded weight: **against**. A faint futures lean (+0.3 pp) is a third of a reversal per
100 touches and is not repeated on the CFDs.

## Descriptive (cannot change a verdict)

- **Half-σ race** (does price go back further?): same picture, line and placebo within 0.3 pp on every line.
- **Back move in the hour after a touch:** median 0.67 quarter-σ for lines and 0.66 for placebo.
- **Day clock:** 0 of 2,649 instrument × line × τ × hours cells (n ≥ 40) beat placebo at BH q = 0.10, so no candidates.
  The pooled futures 00–07 London cells lean (Close+ +4.0 pp, OH +2.9 pp more reversal; Close− −3.6 pp, OL −4.3 pp
  less). Above-open lines turn more and below-open lines turn less in the same hours, which looks like overnight drift
  rather than the lines. 07–10 London Close+/OH lean +1 to +3 pp on both families. Read these as context only.
- **By instrument:** excess spreads −2.7 to +3.1 pp, centred on zero (H1 futures median +0.25, CFDs +0.20).

## What it means

The per-line levels are where the day's high, low and close tend to land: they are good **range and exhaustion**
lines, which is step 1 of Jordan's list. Arriving at one says nothing extra about which way price goes next. A Close±
or OH/OL touch is a coin flip, the same as a level placed 10–25% nearer or further. If they are used as reversing
points, the edge has to come from something that isn't the level itself (order flow, a confirmation, the hour, the
vol layers), and that would need its own test. Nothing on the site or the export changes.
