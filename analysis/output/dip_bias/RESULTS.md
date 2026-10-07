# Buy the ~0.8σ dip, only in a trusted direction (results)

Pre-registration: `forge/DIP_WITH_BIAS_PREREG.md`. Six yield-book pairs, M1 fills, 2016-10 → 2026-08. Limit at the open ∓ 0.8σ, target 0.4σ back toward the open, stop 0.6σ, out at 22:00; R = result ÷ the stop, after costs. Breakeven before costs needs 60% targets. 95% month-block bootstrap.

## Verdict (all-day window): **FAIL**

### Fills 00:00–21:00 London (primary)

| trades | n | mean R [95%] | win | hit target | hit stop |
|---|---|---|---|---|---|
| **with the yield bias** | 1574 | -0.048 [-0.088, -0.004] | 55.6% | 47.5% | 30.5% |
| against the bias | 1616 | -0.090 [-0.132, -0.045] | 53.7% | 45.7% | 33.2% |
| no bias that day | 8691 | -0.075 [-0.091, -0.060] | 54.4% | 47.3% | 32.8% |
| all days (no filter) | 11881 | -0.073 [-0.088, -0.058] | 54.5% | | |

With-bias minus no-filter: +0.025 [-0.012, +0.064]
With-bias by pair: AUDUSD -0.092, EURUSD -0.105, GBPUSD +0.003, USDCAD -0.037, USDCHF -0.028, USDJPY -0.024
With-bias by year: 2016 -0.032, 2017 -0.028, 2018 -0.034, 2019 -0.059, 2020 -0.197, 2021 -0.055, 2022 -0.075, 2023 +0.007, 2024 -0.048, 2025 +0.003, 2026 +0.062

### Fills 13:00–16:00 UK (his window)

| trades | n | mean R [95%] | win | hit target | hit stop |
|---|---|---|---|---|---|
| **with the yield bias** | 1066 | -0.044 [-0.096, +0.006] | 50.2% | 41.1% | 36.5% |
| against the bias | 1101 | -0.115 [-0.162, -0.063] | 45.5% | 38.7% | 40.0% |
| no bias that day | 5970 | -0.062 [-0.084, -0.041] | 48.8% | 41.4% | 38.3% |
| all days (no filter) | 8137 | -0.067 [-0.086, -0.048] | 48.6% | | |

With-bias minus no-filter: +0.024 [-0.020, +0.068]
With-bias by pair: AUDUSD -0.052, EURUSD -0.111, GBPUSD -0.016, USDCAD +0.015, USDCHF -0.029, USDJPY -0.072
With-bias by year: 2016 -0.142, 2017 -0.035, 2018 -0.105, 2019 -0.035, 2020 -0.118, 2021 -0.076, 2022 -0.072, 2023 +0.093, 2024 +0.003, 2025 -0.048, 2026 +0.034

