# Line-touch wide scan: results (pre-reg forge/LINE_TOUCH_WIDE_SCAN_PREREG.md, amendments 1-2)

Population 396,538 touches, 17 instruments, ~41 pre-touch features, walk-forward gradient boosting, continue/fade/skip,
one trade per instrument-day, ~2/week frozen on discovery. Holdout 2022-06-24 to 2026-08-20.

| | Discovery (out-of-fold) | Holdout |
|---|---|---|
| trades | 570 | 584 (2.7/week) |
| gross R | +0.208 | +0.192 |
| net R at 0.02 of range (0.2R) | +0.008 | -0.008 [-0.120, +0.110] |
| net at 0.05 | -0.29 | -0.31 |

- Halves of holdout net: -0.064 / +0.043. Instruments positive net: 8 of 17. **Pre-registered pass rule: FAIL** (net mean, interval, instruments).
- Rate-matched shuffled-target placebo (30 runs, same 584 trades): gross mean +0.029, p95 +0.089, max +0.126. Real gross +0.192 beats all 30.
  The first (rate-unmatched) placebo was invalid: most runs traded <10 times.
- Selected: touches at a fresh running extreme (since_ext 0, position 0.98) after a fast run-in (15-min move 0.57 sigma, 60-min 0.9 sigma,
  RSI ~80, volume 1.6x), 86% fades. Gross is similar across lines and hours 7-15 UTC.
- Artifacts found on the way (recorded in the pre-reg): post-news-spike bars (+0.52R) and the 21:00-23:59 UTC rollover window (+0.50R).
- Caveats: M1 intrabar order assumed (slightly optimistic); 651 model fits; costs are an assumption (spread data not in M1).

## Cost phase (forge/LINE_TOUCH_COST_PREREG.md): per-instrument spread at 2x the table, stop width 0.10 / 0.20 / 0.30

Score = predicted gross R minus the trade's known cost in R; ~2 trades/week frozen on discovery.

| width | discovery gross | discovery net x2 | holdout n (per week) | holdout gross | holdout net x2 | 95% interval | halves |
|---|---|---|---|---|---|---|---|
| 0.10 | +0.054 | -0.058 | 1056 (4.9) | +0.079 | -0.023 | [-0.10, +0.05] | -0.028 / -0.022 |
| **0.20 (chosen on discovery)** | +0.035 | -0.035 | 117 (0.54) | +0.176 | +0.131 | [-0.09, +0.36] | -0.174 / +0.222 |
| 0.30 | -0.013 | -0.096 | 23 (0.11) | -0.182 | -0.220 | [-0.66, +0.21] | -0.18 / -0.23 |

Chosen width 0.20: **pass rule FAILS** (interval includes zero, first half negative, 0.54 trades/week < 1, 8 of 11 traded instruments positive).
Frozen c does not transfer in scale to the holdout (0.54/week vs 2/week), so holdout counts differ by width. Placebo not run (rule already failed).
Selecting on net cost shrinks the gross edge (+0.21R cost-blind -> +0.05R): the model had been leaning on high-cost trades.
Only a forward record with real server spreads (spread_profile_v1) can decide; spreads here are the repo's table at 2x, crosses estimated.

## Adaptive-stop phase (forge/LINE_TOUCH_ADAPTIVE_STOP_PREREG.md): stop = m x last-60-min range, clamped, cost 2x table

| m | discovery gross | discovery net x2 | holdout n (per week) | holdout gross | holdout net x2 | 95% interval | continue share |
|---|---|---|---|---|---|---|---|
| 0.5 | +0.104 | +0.028 | 66 (0.30) | -0.033 | -0.076 | [-0.36, +0.21] | 73% |
| 1.0 | -0.001 | -0.069 | 136 (0.63) | -0.186 | -0.230 | [-0.42, -0.04] | 96% |
| **1.5 (chosen on discovery)** | +0.101 | +0.035 | 147 (0.68) | -0.174 | -0.223 | [-0.43, -0.04] | 89% |

Chosen m=1.5: **pass rule FAILS** (net -0.22R, interval excludes zero on the negative side, both halves negative, 3 of 17 instruments positive).
With the stop sized to context the selector switches from fades to continuation in discovery, and that does not hold out.
Holdout read for four designs now (flat 0.10 stop, per-instrument cost x3 widths, adaptive stop x3 multiples): the only replicated
effect is the gross fade at fresh extremes with a tight stop, which cost removes.
