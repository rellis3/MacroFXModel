# INTRADAY-RANGE: does an hourly re-forecast beat the morning lines for the rest of the day?

*Pre-registered 2026-10-05, before any result was computed. The intraday layer from the
Forecaster Portfolio comparison: the Evidence Book has validated, one at a time, that what
the session shows early says something about its remaining size (`first-hour-fraction`,
`fast-start-rest-of-day`, `band-reach-from-here`, `tape-speed-persistence`, and the
EXHAUSTION-SCHEDULE clock effect). None of these feeds the lines. Research first; a live
page is built only if this passes.*

## The question

At each hourly checkpoint h of the London session (00:00–22:00 London), given:
- how much range has been used,
- how fast the last hour was,
- the time of day,

does a re-forecast of the day's FINAL high-low beat the morning ladder (floored at the range
already used), out of sample?

## Data

- **Instruments:** every instrument in `LADDER_PARAMS.pairs` with local M1, i.e. FX and gold
  from `VolRangeForecaster/data/m1/` and indices from `portfolioBacktest/cache/`.
- **Session:** London 00:00–22:00. M1 is aggregated to hourly high/low per London date.
- **σ_t:** each instrument's production estimator on OANDA D1 bars (`*_d1.parquet`), last bar
  dated strictly before the session. These are the same live-type inputs as the IV-adjusted
  calibration.
- **Checkpoints:** h = 01:00, 02:00, …, 21:00 London (21 checkpoints). Information used at h is
  only the bars before h.

## Variables (all in units of σ_t × open, so instruments pool)

- `used_h` = (running high − running low) by h.
- `speed_h` = high − low of the hour ending at h.
- `U_h` = final high − running high at h (≥ 0), the upside still to come.
- `D_h` = running low at h − final low (≥ 0), the downside still to come.
- `R_h` = U_h + D_h, so final H-L = used_h + R_h.

## Arms

- **A, morning lines.** Predicted final H-L at quantile q = max(used_h, w_q·σ_t), where w_q is
  the H-L width multiplier refit on train (the ladder's own method).
- **B, intraday re-forecast.**
  - At each checkpoint and per class (FX + gold; indices), split the train days into a
    **3 × 3 grid**: tercile of `used_h` × tercile of `speed_h`, edges from train.
  - Predicted final H-L at q = used_h + Q_q(R_h | cell)·σ_t, where Q_q is the train
    quantile of R in that cell.
  - The grid fits the overlapping findings (share used, fast start) **jointly**, so none is
    double-counted.

## Split

Per class, by date: train = first 60% of dates, test = last 40%. Edges and quantiles are
frozen on train.

## Pass rule (per class)

At each checkpoint, score test pinball loss on final H-L summed over q ∈ {0.50, 0.75, 0.90},
B ÷ A per instrument. A checkpoint passes if the median ratio across the class's instruments
is **< 0.98** and B beats A on **≥ 60%**.

**The class PASSES if ≥ 14 of the 21 checkpoints pass** (two thirds).

**Secondary** (reported, not part of the verdict).
- Test exceedance of B's U and D p50 / p75 / p90 (targets 50 / 25 / 10%) per checkpoint
  group (01–07, 08–14, 15–21). These are the lines the page would draw.
- Calibration of B's "will the morning p75 up / down level still be reached" probability
  against the realised rate, in deciles, pooled.

**Decision.**
- PASS: build the live page. It shows hourly-stepping projected-high / projected-low lines
  hung off the running extremes (B's U / D quantiles), the morning lines faintly, the range
  still expected, and reach probabilities. It is reached from a shortcut on Vol Forecast v3.
- FAIL: record it here; no page.

Script: `forge/run_intraday_range.py`. Output: `analysis/output/intraday_range/RESULTS.md`.

---

## Results (2026-10-05, run after the pre-registration commit 6615a0cd)

Full tables: `analysis/output/intraday_range/RESULTS.md`. 34 instruments, about 2,650–2,790
complete sessions each (2016–2026).

**Implementation notes, not in the pre-registration:**
- A grid cell with fewer than 30 train days uses the whole checkpoint's distribution. This
  is needed where tercile edges tie, e.g. DE30/UK100 before their open.
- Arm A's final-range widths are taken from one row per day, because indices have no
  01:00 row.

| | FX + gold (28) | indices (6) |
|---|---|---|
| checkpoints passed | **21/21** | **19/21** |
| B ÷ A at 08:00 / 10:00 / 12:00 / 14:00 | 0.914 / 0.854 / 0.827 / 0.739 | 0.961 / 0.966 / 0.975 / 0.929 |
| B ÷ A at 21:00 | 0.085 | 0.106 |
| **verdict** | **PASS** | **PASS** |

**Reading.**
- The morning and midday gain is the informative part: FX 9–17% at 08:00–13:00, indices
  3–4%. Late-day ratios are large partly mechanically, because the morning line does not
  know the day is nearly done. That is the EXHAUSTION-SCHEDULE clock effect, now inside a
  forecast.
- **Drawn lines (U / D quantiles), test exceedance:** close to target through 14:00 (FX U
  p75 23–24%, p90 9–10%).
  - Indices' downside runs slightly tight (D p75 29%, p90 13–14%).
  - After 15:00 the p50 "more to come" is usually zero, so its exceedance reads 17–30%: the
    line sits on the current extreme.
- **Reach probability** for the morning p75 levels is calibrated to about 30%. In the top
  decile it understates (38–40% predicted vs 45–46% realised).

**Decision per the pre-registration:** build the live page (`live-range.html`), reached
from a shortcut on Vol Forecast v3. Params: `js/intradayRangeParams.js` (grids fitted on
all data).
