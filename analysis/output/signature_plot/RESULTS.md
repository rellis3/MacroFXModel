# Signature plot: microstructure noise in our M1 data (Lesson 05 §04), 2026-10-18

`python -m forge.signature_plot`. Descriptive, not a hypothesis test. Research M1 cache (OANDA mid prices), London
sessions 00:00–22:00, weekdays, 2016-03 → 2026-08-20, 34 instruments, about 2,650 sessions each.

## Volatility measured from k-minute returns, relative to 30-minute returns (median by class)

| Class | 1-minute | 5-minute | 1-minute, last 2 years |
|---|---|---|---|
| Crosses | **+7.4%** (AUDNZD +12.8%, GBPNZD +9.5%, AUDCAD +10.0%) | +2.8% | +6.5% |
| Majors | +4.3% | +1.9% | +2.5% |
| Gold | +4.1% | +1.7% | +2.5% |
| Indices | +1.3% (UK100 +0.1%, NQ +0.5%) | +1.0% | +1.4% |

**Reading:**
- Squared 1-minute returns overstate volatility: by 4–13% on FX and gold, most on thin crosses, and hardly at all on indices.
- By 15 minutes the bias is about 0.5–1.5%.
- The pattern is the one Lesson 05 predicts: noise adds a fixed amount per observation, so it matters most where true volatility per minute is smallest.

## Hourly share of the day's variance (the vol-time profile), 1-minute vs 15-minute returns
- **Noise lifts the quiet hours' share:** 21:00 London +12% (majors), +14% (crosses), +21% (gold); 00:00 +15% for crosses. It lowers the busy hours slightly.
- **The largest absolute shift in any hour's share is 0.9pp (crosses).** The variance remaining from 16:00 to 22:00 is 0.202 vs 0.192 for crosses and 0.219 vs 0.217 for majors.

## What it means for what is built
- **The daily σ forecast (Daily Plan, chosen lines): not affected.** It is built from daily bars.
- **The vol-time profile behind the IEP and the Level Scenarios reach model:** built from 1-minute returns, so it slightly overstates the vol-time left in quiet evening hours (by about 5% from 16:00 on crosses).
  - The calibrated reach model (M1) is fitted on top of that profile and absorbs the bias in its calibration (≤ 1pp).
  - The plain-geometry baseline carries it, which is a small part of its overstatement.
- **The jump study:** uses 5-minute realised variance (+1–3%). This is minor, and it applies to both its realised and bipower variance.
- **Rule from here:** realised-variance estimates for FX and gold use 5- or 15-minute returns, not 1-minute. No live calculation is changed (side-by-side rule); a profile rebuilt from 15-minute returns is an option if the reach model is refitted.
