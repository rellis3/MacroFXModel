# exit-on-fixed-entries — on the same entries, which exit earns more R than it earns on random entries?

Prereg: `forge/EXIT_ON_FIXED_ENTRIES_PREREG.md`. Seed 20261114. Run 2026-11-15. Entries 32738 (2016-11-21 → 2026-08-17), 13 instruments, OANDA bid/ask M1, spread at the fill minute.

**Verdict: NULL**

## Scored cells (Δ = (exit − 21:00 close) on slope entries minus the same on random entries, R per entry)

| Exit | Δ [95% CI] | SE used | p boot / p shift | Holm p | Half 1 / Half 2 | Gold / FX / Indices | MDE (binding) | Verdict |
|---|---|---|---|---|---|---|---|---|
| E1 | +0.012 [-0.004, +0.029] | 0.0084 | 0.159 / 0.056 | 0.954 | +0.022 / +0.002 | +0.017 / +0.007 / +0.025 | 0.022 | **NULL** |
| E2 | -0.009 [-0.025, +0.009] | 0.0085 | 0.292 / 0.281 | 1.000 | -0.000 / -0.017 | -0.000 / -0.009 / -0.011 | 0.030 | **NULL** |
| E3_2 | -0.002 [-0.014, +0.010] | 0.0062 | 0.732 / 0.749 | 1.000 | +0.006 / -0.010 | -0.000 / -0.007 / +0.013 | 0.021 | **NULL** |
| E3_3 | -0.002 [-0.020, +0.017] | 0.0094 | 0.797 / 0.806 | 1.000 | +0.004 / -0.009 | +0.014 / -0.005 / +0.002 | 0.033 | **NULL** |
| E3_5 | +0.002 [-0.024, +0.031] | 0.0136 | 0.913 / 0.874 | 1.000 | -0.001 / +0.005 | +0.035 / -0.006 / +0.015 | 0.047 | **NULL** |
| E4 | -0.001 [-0.011, +0.010] | 0.0054 | 0.813 / 0.864 | 1.000 | +0.004 / -0.006 | -0.005 / -0.002 / +0.004 | 0.018 | **NULL** |

Pass bar +0.05R; gate = Δ ≥ bar, Holm p < 0.05 (p = max of bootstrap and shift-placebo p), both halves > 0 (split 2021-10-05), ≥ 2 of 3 groups > 0. Promotion to live needs t ≥ 3.

## Components (descriptive)

| Exit | D slope | D random | D counter | Δ spread + financing | Friday-flat Δ |
|---|---|---|---|---|---|
| E1 | +0.016 | +0.004 | -0.011 | +0.010 | — |
| E2 | +0.006 | +0.014 | +0.013 | -0.009 | -0.002 |
| E3_2 | +0.000 | +0.002 | +0.000 | -0.002 | +0.001 |
| E3_3 | +0.005 | +0.007 | -0.000 | -0.002 | +0.003 |
| E3_5 | +0.013 | +0.011 | -0.006 | +0.002 | +0.009 |
| E4 | +0.005 | +0.006 | +0.001 | -0.001 | +0.003 |

## Raw R per exit (spread on)

| Exit | Slope: mean / win / payoff / top-10% share | + financing | Random book mean / win | Counter mean | Mean hours held |
|---|---|---|---|---|---|
| E0 | -0.027 / 46% / 1.08 / -6.32 | -0.027 | -0.024 / 46% | -0.030 | 12.9 |
| E1 | -0.010 / 37% / 1.69 / -29.26 | -0.020 | -0.019 / 41% | -0.041 | 36.2 |
| E2 | -0.021 / 31% / 2.17 / -15.25 | -0.034 | -0.015 / 31% | -0.018 | 53.8 |
| E3_2 | -0.026 / 42% / 1.32 / -9.5 | -0.033 | -0.022 / 42% | -0.030 | 35.4 |
| E3_3 | -0.022 / 38% / 1.59 / -13.87 | -0.033 | -0.020 / 38% | -0.031 | 52.6 |
| E3_5 | -0.014 / 32% / 2.09 / -28.84 | -0.032 | -0.014 / 32% | -0.037 | 80.2 |
| E4 | -0.021 / 41% / 1.36 / -9.95 | -0.030 | -0.019 / 41% | -0.029 | 53.8 |

## MFE / MAE map (ignoring the stop; R on the exit-side quote)

| Session | MFE slope mean (random) | MAE slope mean (random) | R at 21:00 slope (random, counter) |
|---|---|---|---|
| 1 | +0.689 (+0.688) | -0.757 (-0.758) | -0.040 (-0.033, -0.031) |
| 2 | +1.071 (+1.068) | -1.138 (-1.140) | -0.041 (-0.029, -0.032) |
| 3 | +1.355 (+1.355) | -1.427 (-1.427) | -0.044 (-0.025, -0.029) |
| 4 | +1.599 (+1.595) | -1.664 (-1.667) | -0.043 (-0.021, -0.029) |
| 5 | +1.814 (+1.807) | -1.871 (-1.878) | -0.034 (-0.016, -0.039) |

+1R before −1R within 5 sessions: slope 0.477, random 0.471. Quantiles in `map.json`.

## Checks

- Design (lesson #27): gross random-entry Dr per exit E1 +0.0064 (1.0 SE), E2 +0.0175 (1.7 SE), E3_2 +0.0038 (0.9 SE), E3_3 +0.0087 (1.2 SE), E3_5 +0.0132 (1.1 SE), E4 +0.0074 (1.3 SE); no fault.
- Reconciliation with h4-trend-hold DAY: {'n': 1598, 'E0_mid_minus_0.03': -0.04998440814458491, 'h4_trend_hold_DAY': -0.042, 'gap': -0.007984408144584905, 'flag_gt_0.03': False}
- Slices: {'tests': 102, 'passes': 0, 'alpha': 0.1, 'expected': 10.200000000000001, 'pAtLeastObserved': 1.0}; BH survivors are candidates only (results.json `slices`).
- Entry counts and drops per instrument: results.json `counts`.

## What this changes

*(written by hand after reading, per prereg §8)*
