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
