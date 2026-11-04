# swing-walk-track: results

Prereg `forge/SWING_WALK_TRACK_PREREG.md`. Run 2026-11-04. Seed 20261104, B = 2000 cluster bootstrap over expiry months. Expiries 2020-10-01 to 2026-08-21, horizons 1-40 sessions, the page-default walk (small books left out). Instruments: AUDUSD, EURUSD, GBPUSD, NAS100, SPX500, USDCAD, USDCHF, USDJPY.

β = how much of the gap from today's price to the dot price has travelled by the expiry-date close (1 = the dot is the expected price, 0 = no information). Skill = share of the squared miss of "price stays where it is" that the dot removes (negative = worse than doing nothing).

## P1: does price go to the dot? (scored, Holm over 5)

| Anchor | Steps (months) | β [95% CI] | Holm p | β beyond the trailing move [CI] | Halves | Placebo pct | Skill | RMS miss: dot / no-move | MDE | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| gamma centre | 17,909 (71) | +0.102 [-0.065, +0.277] | 0.733 | +0.126 [-0.030, +0.289] | +0.02 / +0.15 | 100.0 | -0.101 | 1.04 / 0.99 | 0.089 | **UNDERPOWERED** |
| gamma best strike | 17,909 (71) | +0.037 [-0.035, +0.113] | 0.733 | +0.039 [-0.027, +0.109] | +0.07 / +0.01 | 100.0 | -0.311 | 1.14 / 0.99 | 0.052 | **NULL** |
| strongest strike | 17,909 (71) | +0.008 [-0.006, +0.022] | 0.733 | +0.010 [-0.004, +0.026] | +0.00 / +0.01 | 100.0 | -16.913 | 4.20 / 0.99 | 0.013 | **NULL** |
| max pain | 17,908 (71) | +0.036 [-0.011, +0.081] | 0.590 | +0.049 [+0.007, +0.094] | -0.01 / +0.07 | 100.0 | -2.418 | 1.84 / 0.99 | 0.028 | **NULL** |
| OI centre | 17,909 (71) | +0.018 [-0.007, +0.044] | 0.700 | +0.030 [+0.002, +0.064] | +0.00 / +0.04 | 100.0 | -6.526 | 2.72 / 0.99 | 0.029 | **NULL** |

## P2: does the gap close as the date nears? (descriptive, BH q = 0.10)

Gap = how far the dot sits from price, in expected moves to that expiry (σ√h). A dot that means something keeps that bounded and its miss below the no-move miss in the near buckets.

| Anchor | Sessions left | Steps | β [CI] | BH | RMS miss dot / no-move | Median gap (exp. moves) | Gap > 2 moves | Median gap % |
|---|---|---|---|---|---|---|---|---|
| gamma centre | 1-2 | 930 | +0.33 [-0.05, +0.74] |  | 1.20 / 1.19 | 0.18 | 0% | 0.10% |
| gamma centre | 3-5 | 1,331 | +0.31 [+0.03, +0.67] |  | 1.12 / 1.09 | 0.18 | 0% | 0.18% |
| gamma centre | 6-10 | 2,282 | +0.34 [+0.00, +0.70] |  | 1.02 / 1.00 | 0.19 | 0% | 0.27% |
| gamma centre | 11-20 | 4,573 | -0.04 [-0.30, +0.21] |  | 0.99 / 0.93 | 0.17 | 0% | 0.33% |
| gamma centre | 21-40 | 8,793 | +0.05 [-0.18, +0.24] |  | 1.04 / 0.98 | 0.19 | 0% | 0.54% |
| gamma centre | 41+ | 9,481 | +0.13 [-0.13, +0.38] |  | 1.03 / 0.97 | 0.21 | 0% | 0.80% |
| gamma best strike | 1-2 | 930 | -0.01 [-0.18, +0.16] |  | 1.32 / 1.19 | 0.42 | 0% | 0.25% |
| gamma best strike | 3-5 | 1,331 | +0.07 [-0.06, +0.22] |  | 1.23 / 1.09 | 0.40 | 0% | 0.39% |
| gamma best strike | 6-10 | 2,282 | +0.10 [-0.04, +0.23] |  | 1.13 / 1.00 | 0.40 | 1% | 0.55% |
| gamma best strike | 11-20 | 4,573 | +0.03 [-0.07, +0.12] |  | 1.07 / 0.93 | 0.37 | 0% | 0.73% |
| gamma best strike | 21-40 | 8,793 | +0.02 [-0.09, +0.12] |  | 1.14 / 0.98 | 0.39 | 0% | 1.06% |
| gamma best strike | 41+ | 9,481 | +0.06 [-0.05, +0.16] |  | 1.12 / 0.97 | 0.36 | 0% | 1.34% |
| strongest strike | 1-2 | 930 | +0.01 [-0.00, +0.02] |  | 10.52 / 1.19 | 4.45 | 72% | 2.64% |
| strongest strike | 3-5 | 1,331 | +0.01 [-0.00, +0.03] |  | 6.10 / 1.09 | 2.73 | 60% | 2.74% |
| strongest strike | 6-10 | 2,282 | +0.02 [-0.00, +0.04] |  | 4.42 / 1.00 | 1.97 | 49% | 2.75% |
| strongest strike | 11-20 | 4,573 | +0.00 [-0.02, +0.03] |  | 3.32 / 0.93 | 1.41 | 36% | 2.72% |
| strongest strike | 21-40 | 8,793 | -0.00 [-0.04, +0.03] |  | 2.80 / 0.98 | 1.25 | 31% | 3.37% |
| strongest strike | 41+ | 9,481 | +0.02 [-0.02, +0.05] |  | 2.47 / 0.97 | 1.30 | 31% | 5.08% |
| max pain | 1-2 | 930 | +0.05 [+0.01, +0.09] |  | 3.42 / 1.19 | 2.04 | 51% | 1.24% |
| max pain | 3-5 | 1,331 | +0.06 [+0.01, +0.12] |  | 2.51 / 1.09 | 1.37 | 33% | 1.31% |
| max pain | 6-10 | 2,282 | +0.07 [+0.01, +0.13] |  | 2.08 / 1.00 | 0.98 | 20% | 1.38% |
| max pain | 11-20 | 4,572 | -0.01 [-0.10, +0.07] |  | 1.62 / 0.93 | 0.70 | 8% | 1.37% |
| max pain | 21-40 | 8,793 | +0.01 [-0.07, +0.09] |  | 1.48 / 0.98 | 0.53 | 4% | 1.46% |
| max pain | 41+ | 9,481 | +0.06 [-0.06, +0.17] |  | 1.31 / 0.97 | 0.48 | 4% | 1.79% |
| OI centre | 1-2 | 930 | +0.02 [-0.00, +0.03] |  | 6.28 / 1.19 | 3.37 | 68% | 2.08% |
| OI centre | 3-5 | 1,331 | +0.02 [-0.01, +0.05] |  | 3.90 / 1.09 | 2.04 | 51% | 2.10% |
| OI centre | 6-10 | 2,282 | +0.03 [-0.00, +0.07] |  | 2.97 / 1.00 | 1.42 | 37% | 2.03% |
| OI centre | 11-20 | 4,573 | +0.00 [-0.04, +0.05] |  | 2.25 / 0.93 | 0.98 | 23% | 1.96% |
| OI centre | 21-40 | 8,793 | +0.02 [-0.04, +0.08] |  | 1.93 / 0.98 | 0.76 | 16% | 2.14% |
| OI centre | 41+ | 9,481 | +0.04 [-0.02, +0.10] |  | 1.75 / 0.97 | 0.74 | 15% | 2.83% |

## P3: does each expiry's dot hold still night to night? (descriptive)

Moves in one day's σ. A dot that just follows price carries nothing beyond price.

| Anchor | Night pairs | Median dot move | Mean dot move | Median price move | Dot unchanged | Corr(dot move, price move) |
|---|---|---|---|---|---|---|
| gamma centre | 26,828 | 0.49 | 0.83 | 0.62 | 7% | +0.40 |
| gamma best strike | 26,828 | 0.23 | 1.38 | 0.62 | 14% | +0.26 |
| strongest strike | 26,828 | 0.17 | 1.44 | 0.62 | 17% | +0.02 |
| max pain | 26,827 | 0.18 | 1.13 | 0.62 | 16% | +0.02 |
| OI centre | 26,828 | 0.20 | 1.05 | 0.62 | 14% | +0.02 |

## Slices (descriptive, BH q = 0.10): 0 of 55 pass; 2.8 expected by chance at 5%

| Anchor | Slice | Steps | β [CI] | p | BH |
|---|---|---|---|---|---|
| gamma centre | AUDUSD | 2,664 | +0.47 [+0.11, +0.85] | 0.013 |  |
| gamma centre | EURUSD | 2,735 | +0.34 [-0.08, +0.77] | 0.116 |  |
| gamma centre | GBPUSD | 2,732 | +0.19 [-0.22, +0.55] | 0.346 |  |
| gamma centre | NAS100 | 894 | -0.39 [-1.09, +0.43] | 0.313 |  |
| gamma centre | SPX500 | 897 | -0.31 [-1.09, +0.37] | 0.398 |  |
| gamma centre | USDCAD | 2,725 | -0.09 [-0.30, +0.23] | 0.503 |  |
| gamma centre | USDCHF | 2,534 | +0.09 [-0.19, +0.35] | 0.533 |  |
| gamma centre | USDJPY | 2,728 | +0.13 [-0.25, +0.46] | 0.488 |  |
| gamma centre | FX | 16,118 | +0.13 [-0.07, +0.30] | 0.170 |  |
| gamma centre | indices | 1,791 | -0.35 [-1.00, +0.29] | 0.285 |  |
| gamma centre | walk with small books | 18,215 | +0.10 [-0.08, +0.25] | 0.242 |  |
| gamma best strike | AUDUSD | 2,664 | +0.10 [-0.03, +0.24] | 0.162 |  |
| gamma best strike | EURUSD | 2,735 | +0.04 [-0.16, +0.25] | 0.677 |  |
| gamma best strike | GBPUSD | 2,732 | +0.08 [-0.07, +0.21] | 0.279 |  |
| gamma best strike | NAS100 | 894 | -0.18 [-0.47, +0.11] | 0.237 |  |
| gamma best strike | SPX500 | 897 | -0.05 [-0.36, +0.31] | 0.790 |  |
| gamma best strike | USDCAD | 2,725 | -0.08 [-0.21, +0.07] | 0.252 |  |
| gamma best strike | USDCHF | 2,534 | -0.02 [-0.16, +0.16] | 0.821 |  |
| gamma best strike | USDJPY | 2,728 | +0.18 [+0.03, +0.33] | 0.018 |  |
| gamma best strike | FX | 16,118 | +0.05 [-0.03, +0.12] | 0.196 |  |
| gamma best strike | indices | 1,791 | -0.11 [-0.39, +0.11] | 0.381 |  |
| gamma best strike | walk with small books | 18,215 | +0.04 [-0.03, +0.11] | 0.272 |  |
| strongest strike | AUDUSD | 2,664 | +0.03 [-0.00, +0.06] | 0.057 |  |
| strongest strike | EURUSD | 2,735 | -0.01 [-0.04, +0.04] | 0.656 |  |
| strongest strike | GBPUSD | 2,732 | +0.02 [-0.01, +0.06] | 0.247 |  |
| strongest strike | NAS100 | 894 | -0.01 [-0.06, +0.06] | 0.794 |  |
| strongest strike | SPX500 | 897 | +0.01 [-0.03, +0.04] | 0.616 |  |
| strongest strike | USDCAD | 2,725 | -0.00 [-0.02, +0.02] | 0.958 |  |
| strongest strike | USDCHF | 2,534 | +0.04 [-0.00, +0.08] | 0.048 |  |
| strongest strike | USDJPY | 2,728 | -0.01 [-0.05, +0.02] | 0.450 |  |
| strongest strike | FX | 16,118 | +0.01 [-0.01, +0.02] | 0.282 |  |
| strongest strike | indices | 1,791 | +0.01 [-0.04, +0.03] | 0.752 |  |
| strongest strike | walk with small books | 18,215 | +0.01 [-0.00, +0.02] | 0.278 |  |
| max pain | AUDUSD | 2,664 | +0.10 [-0.01, +0.22] | 0.092 |  |
| max pain | EURUSD | 2,735 | +0.04 [-0.05, +0.12] | 0.412 |  |
| max pain | GBPUSD | 2,732 | +0.03 [-0.05, +0.11] | 0.513 |  |
| max pain | NAS100 | 893 | -0.06 [-0.17, +0.08] | 0.381 |  |
| max pain | SPX500 | 897 | -0.01 [-0.09, +0.07] | 0.880 |  |
| max pain | USDCAD | 2,725 | +0.02 [-0.05, +0.11] | 0.644 |  |
| max pain | USDCHF | 2,534 | +0.10 [+0.02, +0.18] | 0.018 |  |
| max pain | USDJPY | 2,728 | +0.01 [-0.07, +0.10] | 0.743 |  |
| max pain | FX | 16,118 | +0.05 [+0.00, +0.10] | 0.061 |  |
| max pain | indices | 1,790 | -0.02 [-0.11, +0.08] | 0.646 |  |
| max pain | walk with small books | 18,214 | +0.04 [-0.01, +0.08] | 0.107 |  |
| OI centre | AUDUSD | 2,664 | +0.05 [-0.00, +0.12] | 0.105 |  |
| OI centre | EURUSD | 2,735 | +0.03 [-0.05, +0.12] | 0.539 |  |
| OI centre | GBPUSD | 2,732 | +0.04 [-0.03, +0.11] | 0.310 |  |
| OI centre | NAS100 | 894 | -0.05 [-0.15, +0.08] | 0.419 |  |
| OI centre | SPX500 | 897 | +0.01 [-0.06, +0.07] | 0.851 |  |
| OI centre | USDCAD | 2,725 | -0.00 [-0.04, +0.04] | 0.993 |  |
| OI centre | USDCHF | 2,534 | +0.08 [+0.01, +0.17] | 0.044 |  |
| OI centre | USDJPY | 2,728 | -0.00 [-0.07, +0.07] | 0.915 |  |
| OI centre | FX | 16,118 | +0.02 [-0.01, +0.05] | 0.138 |  |
| OI centre | indices | 1,791 | -0.01 [-0.08, +0.06] | 0.865 |  |
| OI centre | walk with small books | 18,215 | +0.02 [-0.00, +0.04] | 0.159 |  |

## Verdicts and reading

- **gamma centre: UNDERPOWERED.** β +0.10 [-0.07, +0.28]: the CI reaches the 0.25 bar, so a quarter-gap pull is not ruled
  out, and nothing excludes zero. Skill -0.10: as a forecast it does slightly worse than "price stays where it is". The
  near buckets (1-10 sessions left) sit near +0.3 but none survives BH. It hugs price (median gap 0.1-0.8%, never more
  than two expected moves away) and moves with price night to night (corr +0.40), so it cannot be badly wrong, and it
  carries little beyond price.
- **gamma best strike: NULL.** β +0.04 [-0.04, +0.11]; skill -0.31.
- **strongest strike: NULL.** β +0.008 [-0.006, +0.022]; skill -16.9. The owner's worry is real here: the gap stays at
  ~2.7% at every horizon, so with 1-2 sessions left the median dot is 4.5 expected moves away and 72% of dots are more
  than two away. The dot does not come down as the date nears; price does not go to it.
- **max pain: NULL.** β +0.036 [-0.011, +0.081] (beyond the trailing move +0.049 [+0.007, +0.094]: a sliver, a fifth of
  the bar). Gap ~1.3% flat across horizons, 2 expected moves away with 1-2 sessions left. Confirms `oi-max-pain` with
  numbers.
- **OI centre: NULL.** β +0.018 [-0.007, +0.044]; skill -6.5; gap ~2% flat, 3.4 expected moves away at 1-2 sessions.
- Slices: 0 of 55 pass BH (2.8 expected by chance).

Notes on the method, found in the run:
- The shuffled-dot placebo (row-level shuffle within instrument x bucket) has a far narrower spread than the real
  bootstrap (gamma centre: control SE 0.026 vs real 0.087), because a real dot's offset persists across the nights and
  expiries of a month and the shuffle breaks that. So the placebo percentile (100 for every anchor) only says each β is
  above a near-zero null, and the count-stage MDE was optimistic for the gamma centre. The verdicts use the real
  cluster-bootstrap CIs, which carry the clustering.
- Spot check: EUR/USD night 2023-09-06, 2023-09-08 expiry: max pain recomputed by hand from the raw book (1.0925
  futures, basis +0.0004) equals the walk's dot 1.0921; 17,350 calls at 1.14 drag it 1.8% from price.
