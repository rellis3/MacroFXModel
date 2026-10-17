# Registry deflation — 2026-10-17

Family: 68 extractable p-values of 155 entries; BH-FDR 10% threshold **0.0609**, 44 rejected.

Validated 36 → **4 lose status** (prediction: 3–8). Kept with a p or re-run: 17. Not deflatable (no p or CI reported): 15.

| entry | p | basis | BH | re-run (Sharpe / PF / p / DSR) | outcome |
|---|---|---|---|---|---|
| vix-inversion | 0.0029 | ci95, doc S1: SPX500 next-5 +0.76 [+0.29, +1.29] | pass |  | **kept** |
| surprise-size | 6.9e-7 | ci95, doc S7: rate decisions EUR/USD +0.38 [+0.24, +0.54] | pass |  | **kept** |
| nq-down-week | 4.8e-7 | ci95, doc: growth down & rates quiet +0.185 [+0.118, +0.262] | pass |  | **kept** |
| event-impact-map | — | descriptive map (spike ratios); no test | — |  | **not-deflatable** |
| post-fomc-usd-drift | 0.0040 | placebo: event mean at the 99.8th percentile of 10,000 → two-sided 0.004 | pass |  | **kept** |
| yield-spread-sleeve | — | no p reported; Sharpe-type | — | 0.089 / 1.077 / 0.9091 / 0.2034 | **deflated** — deflated Sharpe 0.2034 < 0.95 (N=14); harness re-run on point-in-time asofs does not clear its own bar (OOS profitable, PF > 1, years positive): OOS Sharpe 0.089, PF 1.077, p 0.9091; the banked result reproduces only under the engine's +2-day assumption on GS2 — a monthly average FRED first publishes a median 32 days after its date (forge/HARNESS_REGISTRY_ADDENDUM_A.md) |
| multi-spread-sleeve | — | no p reported; Sharpe-type | — | 0.759 / 1.714 / 0.0979 / 0.8459 | **deflated** — deflated Sharpe 0.8459 < 0.95 (N=13) |
| spread-sleeve-factor-audit | — | book-layer audit of the two sleeves; its sanity gate reproduces the sleeve engines (same inputs) | — |  | **deflated** — rests on the return streams of yield-spread-sleeve and multi-spread-sleeve, which lost validated status |
| tape-speed-persistence | — | 68/68 cells monotonic — a count, not converted | — |  | **not-deflatable** |
| execution-gate | — | 0/30 cells profitable — descriptive | — |  | **not-deflatable** |
| reversal-hour | — | +10pp above base, no interval reported | — |  | **not-deflatable** |
| mv-vixterm-range | 0.00091 | ci95, larger p of SPX500 / NQ (n=14 firings) | pass |  | **kept** |
| mv-dispersion-range | 1.6e-11 | ci95, larger p of SPX500 / NQ (n=9 firings) | pass |  | **kept** |
| first-hour-fraction | — | descriptive shares, no test | — |  | **not-deflatable** |
| fast-start-rest-of-day | 0.0011 | ci95, doc T3: EUR/USD +0.15 [+0.07, +0.25], the smallest effect with a stated interval | pass |  | **kept** |
| iv-over-rv-wider | 0.015 | ci95, larger p of NAS100 next-5 / SPX500 next-20 | pass |  | **kept** |
| breadth-all-down | 0.000014 | ci95, larger p of SPX500 / NAS100 next-5 | pass |  | **kept** |
| dispersion-reset | 0.028 | ci95, the gate needed 4/4 cells: largest p (SPX500 5-session +0.186 [+0.017, +0.349]) | pass |  | **kept** |
| band-reach-from-here | — | odds ratios, no interval reported | — |  | **not-deflatable** |
| gex-range | 0.00080 | stated p 0.0008 | pass |  | **kept** |
| vol-curve-front | 9.6e-7 | logistic z, weakest of the four (−4.9) | pass |  | **kept** |
| horizon-reversion | — | 33/33 instruments better — a count, not converted | — |  | **not-deflatable** |
| combined-range | — | 6/6 and 7/7 instruments better — counts | — |  | **not-deflatable** |
| cross-iv | — | 15/15 crosses better — a count | — |  | **not-deflatable** |
| us-extras-confirm | — | 3/4 better — a count | — |  | **not-deflatable** |
| intraday-range | — | 21/21, 19/21 checkpoints — counts | — |  | **not-deflatable** |
| line-touch-reach | — | calibration (20/22 cells within 5pp) — not a test | — |  | **not-deflatable** |
| extreme-in-probability | 0.0 | ci95, Brier skill +20.9% [+20.5, +21.3] | pass |  | **kept** |
| iv-ladder-gold | — | 5/6 folds — a count | — |  | **not-deflatable** |
| iv-ladder | — | 5/7 instruments — a count | — |  | **not-deflatable** |
| ladder-calibration | — | calibration miss, one test year — not a test | — |  | **not-deflatable** |
| vol-target | 0.00049 | ci95, TREND Sharpe +0.32 [+0.14, +0.50] | pass |  | **kept** |
| iv-forecast | 0.050 | bound: "4/7 DM p<0.05" (3/7 did not) | pass |  | **kept** |
| forecast-persistence-fix | 0.0 | ci95, pinball 0.976 [0.970, 0.981] vs 1 | pass |  | **kept** |
| forecast-pick | 1.0e-12 | ci95, pinball 0.980 [0.974, 0.985] vs 1 | pass |  | **kept** |
| ys-long-confirm | 0.038 | ci95, +0.243% [+0.005, +0.464] per trade | pass | -0.053 / 0.935 / 0.8731 / 0.1833 | **deflated** — deflated Sharpe 0.1833 < 0.95 (N=3); harness re-run on point-in-time asofs does not clear its own bar (mean > 0 with interval above 0): OOS Sharpe -0.053, PF 0.935, p 0.8731; the banked result reproduces only under the engine's +2-day assumption on GS2 — a monthly average FRED first publishes a median 32 days after its date (forge/HARNESS_REGISTRY_ADDENDUM_A.md) |

## Family (non-validated, automatic extraction — status unchanged)

| entry | verdict | p | basis |
|---|---|---|---|
| driver-roundtrip | null | 0.24 | ci95 (auto): +0.33 [-0.22, +0.88] |
| breadth-narrowing | null | 0.13 | ci95 (auto): +0.37 [-0.10, +0.85] |
| rotation-extreme | null | 0.26 | ci95 (auto): −0.31 [−0.86, +0.22] |
| price-vs-spread-divergence | null | 0.15 | ci95 (auto): −0.51 [−1.21, +0.19] |
| fomc-leadup-surprise-table | context | 0.0048 | ci95 (auto): 36 [14, 64] |
| cot-positioning-factor | null | 0.094 | stated p 0.0936 |
| mv-creditstack-range | context | 0.046 | ci95 (auto): +0.16 [0.015, 0.33] |
| mv-dislocation-forward | null | 0.93 | ci95 (auto): +0.01 [-0.11, 0.34] |
| mv-extreme-forward | null | 0.18 | ci95 (auto): +0.15 [-0.04, 0.40] |
| regime-divergence-fx | null | 0.91 | ci95 (auto): +0.03 [-0.48, +0.52] |
| dispersion-crowded-week | null | 0.34 | ci95 (auto): +0.07 [-0.06, +0.23] |
| yield-move-fx-range | null | 0.031 | ci95 (auto): +0.101 [0.013, 0.196] |
| spread-divergence-range | null | 0.000046 | ci95 (auto): +0.132 [0.071, 0.198] |
| fear-gold | null | 0.70 | ci95 (auto): +0.07 [-0.42, +0.30] |
| crack-inflation-channel | context | 0.000020 | ci95 (auto): 0.185 [0.10, 0.27] |
| crack-blowout-range | null | 0.0046 | ci95 (auto): +0.13 [-0.02, +0.16] |
| nonus-yield-gap-label | context | 0.00031 | ci95 (auto): 1.39 [0.69, 2.20] |
| nonus-yield-gap-range | null | 0.061 | ci95 (auto): +0.12 [-0.001, +0.25] |
| repo-stress-range | context | 0.72 | ci95 (auto): +0.14 [-0.54, +0.98] |
| month-end-rebalance | null | 0.60 | ci95 (auto): +0.11 [-0.32, +0.50] |
| curve-inversion | null | 0.057 | stated p 0.057 |
| funding-stress | null | 0.0062 | ci95 (auto): -0.561 [-0.984, -0.181] |
| macro-confluence-baa-credit | null | 0.020 | ci95 (auto): -0.616 [-1.117, -0.080] |
| macro-confluence-range | null | 2.0e-7 | ci95 (auto): -0.977 [-1.349, -0.612] |
| yield-slope-magnitude | null | 5.6e-8 | ci95 (auto): 0.618 [0.343, 0.789] |
| breadth-tilt-semis | null | 0.24 | ci95 (auto): +0.70 [-0.50, +1.82] |
| live-range-jump-through | context | 0.0 | ci95 (auto): 43.5 [39.5, 47.4] |
| live-range-features | null | 8.2e-13 | ci95 (auto): +0.42 [+0.31, +0.54] |
| live-range-confluence-book | null | 0.23 | ci95 (auto): -0.012 [-0.031, +0.008] |
| vol-asia-fib-confluence | null | 0.91 | ci95 (auto): +0.05 [-0.8, +1.0] |
| live-range-break-linestate | null | 0.45 | ci95 (auto): -0.096 [-0.359, +0.144] |
| iv-regime-fade-follow | null | 0.031 | ci95 (auto): +0.095 [+0.008, +0.181] |
| forecast-record-pit | context | 0.0 | ci95 (auto): 24.7 [23.3, 26.1] |
| jump-structure | context | 0.0 | ci95 (auto): 6.6 [6.3, 6.9] |
| jump-p90-event-term | null | 0.0090 | ci95 (auto): 0.8 [0.2, 1.4] |
| meta-label-trust-lines | null | 0.0000014 | ci95 (auto): 1.6 [1.0, 2.3] |
| meta-label-trust-lines-persist | null | 0.61 | ci95 (auto): 0.3 [-0.9, 1.4] |
| meta-label-yield-spread | null | 0.038 | ci95 (auto): -0.065 [-0.117, +0.006] |
| meta-label-proper | null | 0.94 | ci95 (auto): +0.002 [-0.05, +0.05] |
| meta-label-long | null | 0.62 | ci95 (auto): -0.013 [-0.066, +0.036] |
| dip-with-bias | null | 0.025 | ci95 (auto): -0.048 [-0.088, -0.004] |
| cog-setups-direction | null | 9.9e-12 | ci95 (auto): -0.066 [-0.085, -0.047] |
| cog-spread-direction | null | 0.16 | ci95 (auto): -0.033 [-0.078, +0.015] |
| rates-residual-catchup | null | 0.97 | ci95 (auto): -0.001 [-0.058, +0.060] |
| stir-residual-catchup | null | 0.017 | ci95 (auto): +0.186 [+0.037, +0.342] |
| rate-diff-nq-leadlag | null | 0.028 | stated p 0.028 |
| stir-composite-nq | null | 0.090 | stated p 0.09 |
| rate-diff-xsmom | null | 0.020 | ci95 (auto): -0.25 [-0.46, -0.04] |
| policy-direction-at-lines | null | 0.95 | ci95 (auto): +0.002 [-0.066, +0.066] |
| direction-vote-at-lines | context | 0.49 | ci95 (auto): -0.019 [-0.073, +0.034] |

Not extractable (non-validated): 69 entries.