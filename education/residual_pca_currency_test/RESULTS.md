# Currency PCA residual reversion — results (2026-09-22)

Pre-registration: `PREREGISTRATION.md` (committed in `7674a3c`, before this run).
Raw output: `data/real_results.json`, `data/real_daily_loop.csv`.

## Verdict: **FAIL** (on the pre-registered rule)

| Check | Result | |
|---|---|---|
| 1. OOS IC > 0 with t ≥ 2 | IC **+0.027**, t **2.11** (Newey-West 2.21) | ✅ |
| 2. OOS extreme buckets have the reverting sign | +0.078 / −0.117 | ✅ |
| 3. OOS low half > high half | yes | ✅ |
| 4. IS IC has the same sign | IC **−0.001**, t −0.09 | ❌ |

The second half (Jul 2021 → Aug 2026) passes every OOS check. The first half (Jun 2016 →
Jul 2021) shows **no relationship** (IC ≈ 0). The rule required both halves, so under our
own pre-registration this is a FAIL. Full sample: IC +0.013, t 1.43, which is not
significant.

## Setup that came out of the data

- **K = 2.** Across in-sample windows, the number of components beating the noise band
  was 1 in 213 windows, **2 in 817** and 3 in 279. Noise-band 95th percentiles by rank:
  21.0%, 18.4%, 16.6%, … So K = 2, the same as the lesson's example.
- 2,617 scored days; OOS starts 2021-07-27.

## The bucket test (lesson slide 28), next-day residual in residual-sd units

| Displacement z | IS obs | IS next-day | OOS obs | OOS next-day |
|---|---|---|---|---|
| below −1.5 | 714 | +0.054 (t 1.4) | 632 | **+0.078** (t 1.7) |
| −1.5 to −0.5 | 2,791 | −0.011 | 2,746 | +0.011 |
| −0.5 to +0.5 | 3,647 | +0.007 | 3,764 | +0.011 |
| +0.5 to +1.5 | 2,716 | −0.007 | 2,706 | −0.029 |
| above +1.5 | 596 | −0.042 (t −1.0) | 624 | **−0.117** (t −2.7) |

- **OOS:** a staircase, weakest in the middle and strongest at the extremes, the shape the
  lesson says a real relationship has.
- **IS:** the extremes point the right way but aren't significant, and the middle is noise.
- For scale, the lesson's simulated example showed about ±0.04 to ±0.08, and our own
  positive control (a 15-day half-life built in) showed ±0.16.

## Disaggregation (one pass, information only)

**IC by year:**

| 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|---|---|---|---|---|---|
| −0.032 | +0.009 | −0.033 | +0.040 | +0.005 | −0.011 | +0.017 | **+0.043** | **+0.047** | +0.007 | +0.037 |

8 of 11 years are positive. The OOS strength is concentrated in **2023–2024**; 2016 and
2018 are negative.

**OOS per-currency correlation:** EUR +0.055, CHF +0.049, NZD +0.043, JPY +0.033,
GBP +0.030, AUD +0.015, CAD +0.013, USD −0.008. That's 7 of 8 positive, all small. By
chance you'd expect about 4 of 8 positive, so 7 of 8 is some breadth, but the cells
aren't independent (they share the same days).

## Secondary readout: the lesson's 16-line loop (information only)

Lesson parameters, no sweep, spot returns only (no swap/carry), house per-pair costs:

| | Sharpe | Ann. return | Ann. vol | Max DD |
|---|---|---|---|---|
| IS gross | 0.07 | +0.15% | 2.0% | −2.7% |
| IS net | **−0.08** | −0.16% | 2.0% | −2.9% |
| OOS gross | 0.64 | +1.27% | 2.0% | −2.6% |
| OOS net | **0.47** | +0.93% | 2.0% | −2.7% |
| OOS net, 2× costs | 0.30 | +0.58% | 2.0% | −2.9% |

- Mean daily turnover is 0.28 of the book, and costs take about 0.35%/yr of a ~1.3%/yr
  gross edge. That matches the lesson's warning that costs bite this model.
- The book runs at about 2% volatility at gross = 1, so any real use would need
  leverage, and the carry/swap P&L missing from spot returns could matter at that size.
- Net P&L by year (%): 2016 −1.87 · 2017 +1.51 · 2018 −1.33 · 2019 +1.41 · 2020 +0.66 ·
  2021 −1.68 · 2022 −0.33 · 2023 **+2.65** · 2024 **+1.88** · 2025 −0.06 · 2026 +1.13.
- The factor exposure after neutralising is ≤ 1.2e-17 every day, so the hedge is exact.

## Bug audit (before accepting the FAIL)

- 0 NaNs in displacement, next-day residuals and loop records.
- Alignment was checked by hand: the next-day residual stored for 2017-12-20 equals the one
  recomputed from the window ending the previous day.
- No lookahead: perturbing all prices after t+1 leaves the displacement at t+1 unchanged.
- The harness passed its null (IC −0.010, FAIL) and positive-control (IC +0.066, PASS)
  checks before the real run.
- A t+2 placebo gives IC +0.011 (t 1.25). It isn't zero, but that fits a slow multi-day
  reversion rather than a misalignment. Treat it as a hint, not evidence.

## What this means

- **Under the rules we set, this is a FAIL.** The effect exists in the recent five years
  and not in the five before. That's either a real change in how currency residuals
  behave (post-2021 rate divergence) or a good half by chance. **This data can't tell
  which**, and deciding that it's "regime-conditional" after seeing the split is exactly
  what the pre-registration forbids.
- It's not a clean null either: 8 of 11 years are positive, 7 of 8 currencies are
  positive OOS, and the bucket shape is right in both halves at the extremes. It's a weak,
  unstable effect, not an absent one.

## The honest next step

The only untouched data left is **the future**. Freeze this exact model (K = 2 by the
noise-band rule, window 120, dead band 0.2, cap 1.5, house costs) and **forward-track it
from 2026-09-22 with no changes**, with the pass bar set now: forward IC > 0 and net
Sharpe > 0 after 12 months. That's the lesson's slide-46 path (paper trading → burn-in),
and at a Sharpe near 0.5 it will need years, not months, to be conclusive.

Any other variant run on this same 2016–2026 history (weekly horizon, adding gold, a
different window) is a **new test**. It needs its own pre-registration, and it counts
against the multiple-testing budget: this was test #1.
