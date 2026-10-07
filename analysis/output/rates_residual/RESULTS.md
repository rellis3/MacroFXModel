# Rates residual book (results)

Pre-registration: `forge/RATES_RESIDUAL_PREREG.md`. OANDA M15 2018-01 → 2026-10. I = rates-implied 4h move, O = own 4h move, F = next 4h, all in σ units; b = how much of the rates-implied move price adds over the next 4h (controlling for its own move, c). Sampled every 4h; day-block bootstrap.

## S1 — natural drivers (bond CFDs): **FAIL**

- b (catch-up to the implied move): **-0.0007 [-0.0578, +0.0596]**; c (own move): +0.0093 [-0.0177, +0.0364]; n 17912
- halves b: +0.0443 / -0.0189; by target: EUR_USD +0.0871, GBP_USD -0.0584, NAS100_USD +0.1075, SPX500_USD -0.1150, USD_JPY -0.0559, XAU_USD -0.0333
- placebo (drivers shifted): median +0.0522, 95th +0.4943, real beats 41.0%
- gap trade (|I−O| > 1.5, 4h, after costs): +0.19 bp/trade, hit 49.2%, n 1853; EUR_USD -0.44, GBP_USD +3.37, USD_JPY -2.94, XAU_USD +0.05, NAS100_USD -1.46, SPX500_USD +4.59

## S2 — PCA of every other instrument: **FAIL**

- b (catch-up to the implied move): **+0.3453 [-0.0835, +0.7061]**; c (own move): +0.0133 [-0.1121, +0.1335]; n 2790
- halves b: +0.4233 / +0.2937; by target: EUR_USD -0.1000, GBP_USD +0.2693, NAS100_USD +0.2913, SPX500_USD +0.5333, USD_JPY +0.6222, XAU_USD +0.5206
- placebo (drivers shifted): median -0.0277, 95th +1.2439, real beats 71.5%
- gap trade (|I−O| > 1.5, 4h, after costs): +6.92 bp/trade, hit 51.7%, n 207; EUR_USD +0.73, GBP_USD +8.35, USD_JPY -8.47, XAU_USD +3.45, NAS100_USD +55.97, SPX500_USD +13.89

## S3 — the S1 gap as the direction at C.OG's lines: **FAIL**

- Kept (price behind rates in the trade's direction, |gap| > 0.5): -0.0582 [-0.0970, -0.0233] R, n 1682 of 5794
- Kept minus all: -0.0087 [-0.0449, +0.0257]; opposite filter -0.0231; all -0.0495
- Halves kept: -0.0576 / -0.0585
- Kept by setup|instrument [R, n] vs all: A|EURUSD -0.058 (513) vs -0.068; A|GOLD -0.044 (448) vs -0.093; A|NQ -0.075 (584) vs -0.043; C|EURUSD +0.055 (41) vs -0.061; C|GOLD +0.027 (32) vs -0.021; C|NQ -0.118 (64) vs -0.020

## S6 — direction vote (forge/DIRECTION_VOTE_PREREG.md): **FAIL**

- v ≥ 2 kept: -0.0188 [-0.0726, +0.0336] R, n 1016 of 5794; minus all +0.0307 [-0.0205, +0.0820]
- halves: -0.0704 / +0.0027
- ladder (mean R, n): v>=2 -0.019 (1016); v=1 -0.039 (1168); v=0 -0.044 (1426); v=-1 -0.065 (1168); v<=-2 -0.082 (1016)
- without the rates gap, 2016-10 →: v>=2 -0.013 (1203); v=1 -0.017 (4247); v=0 -0.064 (1384); v=-1 -0.076 (4247); v<=-2 -0.100 (1203)
- kept by setup|instrument: A|EURUSD -0.050 (301); A|GOLD +0.045 (227); A|NQ -0.034 (285); C|EURUSD -0.002 (157); C|GOLD -0.150 (21); C|NQ -0.043 (25)

## S7a — vote (|v| ≥ 2) vs the London session direction: **FAIL**

- mean signed open→22:00 return: +0.0037 [-0.0467, +0.0521] σ after cost, hit 49.0%, n 1534 days
- halves +0.0004 / +0.0067; by instrument EURUSD -0.0001, GOLD +0.0319
- |v| ≥ 1 (any lean): +0.0058 σ (n 4175)

## S7b — median-line entry in the vote's direction, stop 0.6σ, out 22:00: **FAIL**

- mean R +0.0219 [-0.0397, +0.0884], n 1126; halves +0.0303 / +0.0143; by instrument EURUSD +0.0096, GOLD +0.1063; |v| ≥ 1: +0.0019

## S2 variant (Amendment 1: the 14 ~23h instruments): **FAIL**

- b: **-0.0555 [-0.2108, +0.0998]**; c: +0.0012 [-0.0301, +0.0342]; n 13512
- halves b: -0.1264 / -0.0372; by target: EUR_USD -0.0665, GBP_USD -0.1153, NAS100_USD -0.0273, SPX500_USD -0.0584, USD_JPY -0.0290, XAU_USD -0.0407
- placebo: median +0.0434, 95th +0.6315, real beats 43.5%
- gap trade: -0.52 bp/trade, hit 47.5%, n 2057; EUR_USD +0.14, GBP_USD -2.11, USD_JPY -0.42, XAU_USD -1.27, NAS100_USD +0.03, SPX500_USD +0.92
