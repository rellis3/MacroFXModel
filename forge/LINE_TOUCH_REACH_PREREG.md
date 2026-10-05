# LINE-TOUCH-REACH: after price reaches a Live Range line, how much further does it go?

*Pre-registered 2026-10-05, before any result was computed. The owner asked what to expect
when price hits a Live Range line. This is a SIZE question: how far the day carries on after
a line is reached. It is not a bounce/fade question. Every fade-at-the-line study in this
repo has been null, and none is attempted here. Research only.*

## Setup

Same data, sessions, σ, 3 × 3 cells and train/test split as `forge/INTRADAY_RANGE_PREREG.md`
(first 60% of dates train, last 40% test, per class).

At each hourly checkpoint h, with lines **fixed as drawn at h** until the 22:00 close:
- `U_h` = further upside before the close, in σ units.
- `U50`, `U75`, `U90` = the cell's train quantiles of U (the drawn ↑p50 / ↑p75 / ↑p90).

The same applies to the downside with `D`.

## Measures (test period)

1. **p75 → p90.** Among (day, h) rows where price reached the ↑p75 line (U ≥ U75), the share
   that also reached ↑p90 (U ≥ U90). Model-implied value = the same ratio on train in that
   cell (≈ 10 / 25 = 40% if calibrated).
2. **p50 → p75.** Same, from ↑p50 to ↑p75 (implied ≈ 25 / 50 = 50%).
3. **Overshoot.** Among rows that reached ↑p75: how far beyond the p75 line the day's extreme
   went, as a fraction of the p75→p90 gap. Median and 75th percentile, reported.

Each is computed for up and down separately, per class (FX + gold; indices), in three hour
groups: 01–07, 08–14, 15–21.

## Pass rule

For measures 1 and 2, in each (class × side × hour group) cell with at least 200 touches:

**CALIBRATED** if the realised test share is within **±5 percentage points** of the
model-implied (train) share.

The study as a whole is **CALIBRATED** if ≥ 80% of the eligible cells are. Otherwise it is
**MISCALIBRATED**, and the realised shares, not the implied ones, are what the page may show.

**Decision.** The Live Range page shows a "from here" chip on each card: the chance of
reaching the next line, given the line just reached. If CALIBRATED, it shows the model's
own conditional. If MISCALIBRATED, it shows the realised table from this study (per class ×
hour group). Overshoot is shown as a typical "carries about X% of the way to p90" note.

Script: `forge/run_line_touch_reach.py`. Output: `analysis/output/line_touch_reach/RESULTS.md`.

---

## Results (2026-10-05, run after the pre-registration commit e48d601c)

Full table: `analysis/output/line_touch_reach/RESULTS.md`. **Verdict: CALIBRATED.** 20 of 22
eligible cells are within ±5pp of the model's implied share.

| | FX + gold | indices |
|---|---|---|
| p50 → p75 (implied 50%) | 48–49% | 46–55% |
| p75 → p90 (implied 40%) | 38–41% | 33–47% |
| overshoot past p75, median (share of the p75→p90 gap) | 0.72–0.78 | 0.64–0.93 |
| overshoot past p75, 75th percentile | 1.39–1.51 (beyond p90) | 1.27–1.71 |

**The two misses are both indices:** upside p75 → p90 at 01–07 runs **47%** (vs 40%), and
downside p75 → p90 at 15–21 is **33%**. Late-day p50 → p75 has no rows for FX, because the
late p50 line usually sits on the current extreme.

**Reading.** A Live Range line is not a barrier. From the bold p75 it is about a 2-in-5 chance
of reaching p90 before the close, and the day's extreme typically carries about ¾ of the way
there. This is a size statement only; nothing here tests a bounce.

**Decision per the pre-registration:** CALIBRATED, so the page shows the model's own
conditional chance on each card once a line is reached, plus the typical-overshoot note from
this table.
