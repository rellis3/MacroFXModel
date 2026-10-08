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
