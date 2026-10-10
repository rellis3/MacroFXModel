# STIR-COMPOSITE-NQ results

Run once per forge/STIR_COMPOSITE_NQ_PREREG.md.

## Coverage

- C1 front pair: 57% explore / 55% confirm
- C2 strip mean: 57% explore / 60% confirm
- C3 PCA level: 57% explore / 60% confirm
- C4 PCA slope: 57% explore / 60% confirm
- C5 US-DE 2y: 56% explore / 59% confirm
- C1 front pair [Euribor]: 57% explore / 55% confirm
- C2 strip mean [Euribor]: 57% explore / 60% confirm
- C3 PCA level [Euribor]: 57% explore / 60% confirm
- C4 PCA slope [Euribor]: 57% explore / 60% confirm
- C5 US-DE 2y [Euribor]: 56% explore / 59% confirm
- NQ: 66% explore / 68% confirm

PCA weights fitted on explore (Z6 H7 M7 U7): level [0.495 0.504 0.504 0.496], slope [-0.69  -0.204  0.242  0.651]

## Power (planted signals, explore half, detection = the planted cell survives BH-FDR 10%)

| test | planted size | detected | of |
|---|---|---|---|
| H-A | corr +0.03 | 0 | 10 |
| H-A | corr +0.05 | 0 | 10 |
| H-A | corr +0.08 | 0 | 10 |
| H-B | +0.05% per event | 10 | 10 |
| H-B | +0.10% per event | 10 | 10 |

Power under 50% at the middle size (H-A 0.05, H-B +0.05%) means a null below is 'insufficient data'.

## H-A divergence catch-up (45 cells)

Explore: 0 of 45 pass BH-FDR 10%. Largest |corr| 0.065. Days 57.

| construction | L h | H h | explore corr | t | confirm-ex-video corr | t | one-sided p (sign fixed) | confirm full corr |
|---|---|---|---|---|---|---|---|---|

**H-A: FAIL** (survivors in explore: 0).

All explore cells (corr / t):

| construction   |   (4, 1) |   (4, 2) |   (4, 4) |   (8, 1) |   (8, 2) |   (8, 4) |   (12, 1) |   (12, 2) |   (12, 4) |
|:---------------|---------:|---------:|---------:|---------:|---------:|---------:|----------:|----------:|----------:|
| C1 front pair  |    0.018 |    0.039 |    0.065 |    0.003 |    0.011 |    0.03  |    -0.01  |     0.002 |     0.025 |
| C2 strip mean  |    0.005 |    0.014 |    0.025 |   -0.028 |   -0.031 |   -0.027 |    -0.039 |    -0.044 |    -0.028 |
| C3 PCA level   |    0.005 |    0.014 |    0.025 |   -0.028 |   -0.031 |   -0.027 |    -0.039 |    -0.044 |    -0.028 |
| C4 PCA slope   |    0.024 |    0.036 |    0.047 |    0.01  |    0.015 |   -0.001 |    -0.005 |    -0.019 |    -0.034 |
| C5 US-DE 2y    |    0.012 |    0.023 |    0.03  |   -0.034 |   -0.032 |   -0.022 |    -0.041 |    -0.045 |    -0.03  |

All confirm-ex-video cells (corr):

| construction   |   (4, 1) |   (4, 2) |   (4, 4) |   (8, 1) |   (8, 2) |   (8, 4) |   (12, 1) |   (12, 2) |   (12, 4) |
|:---------------|---------:|---------:|---------:|---------:|---------:|---------:|----------:|----------:|----------:|
| C1 front pair  |    0.092 |    0.078 |    0.032 |    0.057 |    0.055 |    0.074 |     0.079 |     0.079 |     0.08  |
| C2 strip mean  |    0.043 |    0.02  |   -0.008 |    0.024 |    0.016 |    0.023 |     0.028 |     0.028 |     0.013 |
| C3 PCA level   |    0.043 |    0.021 |   -0.008 |    0.024 |    0.016 |    0.023 |     0.028 |     0.028 |     0.013 |
| C4 PCA slope   |    0.011 |    0.013 |    0.013 |    0.016 |    0.026 |    0.029 |    -0.016 |    -0.014 |    -0.038 |
| C5 US-DE 2y    |    0.038 |    0.015 |   -0.009 |    0.027 |    0.018 |    0.034 |     0.039 |     0.035 |     0.021 |

## H-B confirmed turning point (20 cells)

Explore: 0 of 20 pass (scramble p, BH-FDR 10%).

| construction | K bars | H h | events | explore mean % | p | confirm-ex-video events | mean % | net % | p | lead frac |
|---|---|---|---|---|---|---|---|---|---|---|

**H-B: FAIL**.

All explore cells (mean signed % / scramble p / raw lead fraction):

| construction   |   K |   H |   events |   mean_pct |   p_scramble |   lead_frac |
|:---------------|----:|----:|---------:|-----------:|-------------:|------------:|
| C1 front pair  |  16 |   1 |      398 |     -0.005 |        0.614 |       0.389 |
| C1 front pair  |  16 |   2 |      380 |      0.004 |        0.424 |       0.408 |
| C1 front pair  |  32 |   1 |      206 |      0     |        0.497 |       0.359 |
| C1 front pair  |  32 |   2 |      193 |     -0.008 |        0.564 |       0.383 |
| C2 strip mean  |  16 |   1 |      398 |      0.026 |        0.045 |       0.397 |
| C2 strip mean  |  16 |   2 |      377 |      0.015 |        0.265 |       0.419 |
| C2 strip mean  |  32 |   1 |      206 |      0.026 |        0.17  |       0.359 |
| C2 strip mean  |  32 |   2 |      191 |     -0.027 |        0.794 |       0.387 |
| C3 PCA level   |  16 |   1 |      395 |      0.024 |        0.079 |       0.405 |
| C3 PCA level   |  16 |   2 |      372 |      0.025 |        0.147 |       0.43  |
| C3 PCA level   |  32 |   1 |      202 |      0.02  |        0.214 |       0.356 |
| C3 PCA level   |  32 |   2 |      186 |     -0.014 |        0.662 |       0.387 |
| C4 PCA slope   |  16 |   1 |      456 |     -0.007 |        0.7   |       0.357 |
| C4 PCA slope   |  16 |   2 |      431 |     -0.009 |        0.661 |       0.378 |
| C4 PCA slope   |  32 |   1 |      248 |     -0.019 |        0.825 |       0.306 |
| C4 PCA slope   |  32 |   2 |      229 |     -0     |        0.498 |       0.332 |
| C5 US-DE 2y    |  16 |   1 |      376 |      0.012 |        0.237 |       0.386 |
| C5 US-DE 2y    |  16 |   2 |      352 |     -0.001 |        0.529 |       0.412 |
| C5 US-DE 2y    |  32 |   1 |      190 |      0.024 |        0.21  |       0.368 |
| C5 US-DE 2y    |  32 |   2 |      176 |     -0.027 |        0.779 |       0.398 |

All confirm-ex-video cells:

| construction   |   K |   H |   events |   mean_pct |   net_pct |   p_scramble |   lead_frac |
|:---------------|----:|----:|---------:|-----------:|----------:|-------------:|------------:|
| C1 front pair  |  16 |   1 |      286 |     -0.001 |    -0.006 |        0.611 |       0.36  |
| C1 front pair  |  16 |   2 |      273 |      0.008 |     0.003 |        0.404 |       0.377 |
| C1 front pair  |  32 |   1 |      144 |      0.005 |     0     |        0.431 |       0.25  |
| C1 front pair  |  32 |   2 |      135 |      0.03  |     0.025 |        0.183 |       0.267 |
| C2 strip mean  |  16 |   1 |      302 |      0     |    -0.005 |        0.499 |       0.374 |
| C2 strip mean  |  16 |   2 |      288 |      0.018 |     0.013 |        0.222 |       0.392 |
| C2 strip mean  |  32 |   1 |      160 |     -0.003 |    -0.008 |        0.551 |       0.269 |
| C2 strip mean  |  32 |   2 |      154 |      0.021 |     0.016 |        0.261 |       0.279 |
| C3 PCA level   |  16 |   1 |      308 |      0.003 |    -0.002 |        0.433 |       0.364 |
| C3 PCA level   |  16 |   2 |      293 |      0.022 |     0.017 |        0.168 |       0.382 |
| C3 PCA level   |  32 |   1 |      159 |     -0     |    -0.005 |        0.464 |       0.27  |
| C3 PCA level   |  32 |   2 |      152 |      0.019 |     0.014 |        0.314 |       0.283 |
| C4 PCA slope   |  16 |   1 |      335 |     -0     |    -0.005 |        0.43  |       0.358 |
| C4 PCA slope   |  16 |   2 |      314 |     -0     |    -0.005 |        0.509 |       0.382 |
| C4 PCA slope   |  32 |   1 |      180 |      0.004 |    -0.001 |        0.378 |       0.233 |
| C4 PCA slope   |  32 |   2 |      166 |      0.017 |     0.012 |        0.257 |       0.253 |
| C5 US-DE 2y    |  16 |   1 |      313 |      0.01  |     0.005 |        0.248 |       0.339 |
| C5 US-DE 2y    |  16 |   2 |      295 |      0.023 |     0.018 |        0.156 |       0.359 |
| C5 US-DE 2y    |  32 |   1 |      163 |      0.028 |     0.023 |        0.094 |       0.209 |
| C5 US-DE 2y    |  32 |   2 |      156 |      0.033 |     0.028 |        0.158 |       0.218 |

## Robustness: Euribor legs, explore H-A corr (not scored)

| construction            |   (4, 1) |   (4, 2) |   (4, 4) |   (8, 1) |   (8, 2) |   (8, 4) |   (12, 1) |   (12, 2) |   (12, 4) |
|:------------------------|---------:|---------:|---------:|---------:|---------:|---------:|----------:|----------:|----------:|
| C1 front pair [Euribor] |    0.023 |    0.039 |    0.074 |    0.024 |    0.037 |    0.056 |     0.006 |     0.022 |     0.048 |
| C2 strip mean [Euribor] |    0.003 |    0.012 |    0.024 |   -0.027 |   -0.029 |   -0.023 |    -0.037 |    -0.04  |    -0.023 |
| C3 PCA level [Euribor]  |    0.003 |    0.012 |    0.025 |   -0.027 |   -0.029 |   -0.022 |    -0.037 |    -0.04  |    -0.023 |
| C4 PCA slope [Euribor]  |    0.025 |    0.036 |    0.047 |    0.007 |    0.012 |   -0.006 |    -0.008 |    -0.02  |    -0.035 |
| C5 US-DE 2y [Euribor]   |    0.012 |    0.023 |    0.03  |   -0.034 |   -0.032 |   -0.022 |    -0.041 |    -0.045 |    -0.03  |

## Addendum (same session, after the run): power diagnostic and the lead-count baseline

**H-A power.** The pre-registered planted sizes (0.03 / 0.05 / 0.08) were all undetectable, so the H-A null is
classified **insufficient data**, as the rule says. Where detection starts (planted into C2, L=8 h, H=2 h, explore half):

| planted corr | achieved corr | day-clustered t | p |
|---|---|---|---|
| 0.05 | +0.014 | 0.13 | 0.89 |
| 0.08 | +0.041 | 0.42 | 0.67 |
| 0.12 | +0.077 | 0.87 | 0.38 |
| 0.20 | +0.149 | 2.05 | 0.04 |
| 0.30 | +0.234 | 3.87 | 0.00 |

Overlapping 8-hour windows on 57 days leave about 60 independent observations per cell, so only a correlation of
roughly **0.2 or more** (very large for a market lead) would have been found. The 2026 archive cannot rule out a small
hours-scale divergence effect; it can rule out a large one. Note the power loop's 10 "reps" were identical runs
(no day resampling was implemented), so each row above is one deterministic number, not a rate.

**H-B power** was 10/10 at +0.05 % per event, so the H-B null **is** informative: a confirmed turn in any of the five
spreads is followed by no measurable Nasdaq move in the same direction over 1–2 h (explore means −0.03 % to +0.03 %,
none passing FDR; confirm, video week removed, +0.00 to +0.03 %, scramble p 0.09–0.61).

**Raw lead count, with its baseline** (C2 strip, explore): after a confirmed spread low/high, Nasdaq prints a fresh
same-side K-bar extreme within the next 2 h in 41.9 % of cases (K=16) vs a scramble median of 40.8 % (95th pct 44.5 %),
and 38.7 % vs 35.1 % (95th 40.0 %) for K=32. Inside the noise band both times. The video's "spread turned, then
Nasdaq turned" sequence happens about as often after the spread turns as after any bar at the same hour.

**Unregistered, flagged only:** in the confirm half C1 (his literal SOFR U6 − €STR U6 pair) shows positive
divergence→catch-up correlations in all nine cells (+0.03 to +0.09) that are absent in explore (−0.01 to +0.07, mixed).
Not tested, not scored; at the power above it would need its own pre-registration on 2027 data.

## Classification (per the diagnostic brief)

- **H-A divergence catch-up (hours):** insufficient data. Interval on the largest explore cell: |corr| ≤ 0.065.
- **H-B confirmed turning point:** genuinely little predictive information, at the power the test had.
- The five composite spreads behave like the single legs did: same-bar co-movement only. They stay as context
  (regime read, attribution), not a signal.
