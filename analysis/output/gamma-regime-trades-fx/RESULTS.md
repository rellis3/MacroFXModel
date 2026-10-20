# gamma-regime-trades-fx (results)

Pre-registration: `forge/GAMMA_REGIME_TRADES_FX_PREREG.md`. Seed 20261020. EUR/USD, GBP/USD, AUD/USD, 2020-09 → 2026-08; rules exactly as the OI page's daily hedge plan; costs 0.01% round trip; R = net ÷ stop distance.

**Verdict: NULL.**

| | sessions | trades | fade, long gamma | fade, short gamma | follow, long gamma | follow, short gamma | **plan (switch)** | always fade | always follow |
|---|---|---|---|---|---|---|---|---|---|
| EURUSD | 1,544 | 701 | +0.066 | -0.061 | -0.276 | -0.108 | **-0.062** | -0.027 | -0.153 |
| GBPUSD | 1,544 | 690 | -0.086 | -0.052 | -0.036 | -0.076 | **-0.080** | -0.066 | -0.060 |
| AUDUSD | 1,544 | 572 | -0.065 | +0.055 | -0.057 | -0.168 | **-0.107** | -0.017 | -0.102 |
| **pooled** | 4,632 | 1,963 | -0.042 | -0.035 | -0.100 | -0.109 | **-0.081** | -0.038 | -0.105 |

- Plan, pooled: **-0.081 R per trade** [-0.124, -0.039]; vs always-fade [-0.111, +0.019]; vs always-follow [-0.021, +0.072]; regime interaction -0.016 [-0.172, +0.141]
- Halves: plan -0.036 (≤2022) / -0.113 (≥2023)
- Mirror (regime shifted 125 sessions): plan -0.060 R
- Pairs with the plan > 0: 0 of 3
