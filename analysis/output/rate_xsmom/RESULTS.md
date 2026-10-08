# RATE-XSMOM — results

Pre-registration: `forge/RATE_XSMOM_PREREG.md`. FRED monthly 3-month rates (45-day lag) + daily spot, 9 currencies vs USD; long top third / short bottom third; spot + carry − 0.02% turnover cost. 12-month block bootstrap.

## FX book, signal = 3-month change in the short-rate differential: **FAIL**

Checks: {'p1_ci_above_0': False, 'p2_mean_above_0': True, 'alpha_t_ge_2': False}

| book | period | months | mean % / month [95%] | ann. % | Sharpe | max DD % | months up |
|---|---|---|---|---|---|---|---|
| **rate-diff momentum L3** | 1976-2014 | 427 | +0.081 [-0.110, +0.276] | +0.97 | +0.12 | -35.3 | 51% |
| **rate-diff momentum L3** | 2015-2026 | 141 | +0.073 [-0.110, +0.259] | +0.88 | +0.18 | -11.6 | 50% |
| **rate-diff momentum L3** | all | 568 | +0.079 [-0.069, +0.233] | +0.95 | +0.13 | -35.3 | 51% |
| rate-diff momentum L1 | 1976-2014 | 429 | +0.026 [-0.169, +0.224] | +0.32 | +0.04 | -50.7 | 48% |
| rate-diff momentum L1 | 2015-2026 | 141 | -0.145 [-0.369, +0.066] | -1.74 | -0.36 | -30.2 | 46% |
| rate-diff momentum L6 | 1976-2014 | 424 | +0.114 [-0.086, +0.320] | +1.36 | +0.16 | -36.9 | 52% |
| rate-diff momentum L6 | 2015-2026 | 141 | +0.022 [-0.128, +0.186] | +0.27 | +0.06 | -9.1 | 50% |
| rate-diff momentum L12 | 1976-2014 | 418 | +0.160 [-0.056, +0.367] | +1.92 | +0.22 | -36.3 | 53% |
| rate-diff momentum L12 | 2015-2026 | 141 | -0.087 [-0.269, +0.095] | -1.04 | -0.21 | -24.6 | 50% |
| carry (rate level) | 1976-2014 | 430 | +0.416 [+0.142, +0.665] | +5.00 | +0.54 | -36.0 | 62% |
| carry (rate level) | 2015-2026 | 141 | +0.132 [-0.108, +0.380] | +1.58 | +0.26 | -11.1 | 58% |
| FX price momentum | 1976-2014 | 430 | +0.188 [-0.047, +0.424] | +2.26 | +0.25 | -29.1 | 53% |
| FX price momentum | 2015-2026 | 141 | -0.417 [-0.647, -0.166] | -5.01 | -0.82 | -69.8 | 36% |

- **Beyond carry and FX momentum:** alpha +0.077% / month, Newey-West t +0.81 (568 months); betas {'carry': -0.007, 'fx_mom': 0.132}
- Correlations of the L3 book with: {'carry': -0.02, 'fx_momentum': 0.151, 'yield_spread_book': 0.114}

## NASDAQ: long when US short rates are falling (else T-bills): **FAIL**

Checks (rule A): {'all_ci_above_0': False, 'both_periods_positive': False}

| rule | period | rule Sharpe | buy & hold Sharpe | difference [95%] | rule ann. excess % | B&H ann. excess % |
|---|---|---|---|---|---|---|
| A: US T-bill falling | 1976-2014 | +0.19 | +0.26 | -0.068 [-0.281, +0.156] | +2.94 | +5.63 |
| A: US T-bill falling | 2015-2026 | +0.49 | +0.70 | -0.212 [-0.777, +0.296] | +5.51 | +12.68 |
| A: US T-bill falling | all | +0.24 | +0.35 | -0.104 [-0.313, +0.098] | +3.54 | +7.26 |
| A: US T-bill falling | time in market | 46% | | | | |
| B: US − others falling | 1976-2014 | +0.03 | +0.26 | -0.226 [-0.480, +0.030] | +0.54 | +5.63 |
| B: US − others falling | 2015-2026 | +0.37 | +0.70 | -0.327 [-0.884, +0.111] | +4.66 | +12.68 |
| B: US − others falling | all | +0.10 | +0.35 | -0.249 [-0.460, -0.039] | +1.49 | +7.26 |
| B: US − others falling | time in market | 46% | | | | |
