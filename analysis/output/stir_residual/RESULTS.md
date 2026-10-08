# STIR residual — do short-rate futures lead price? (results)

Pre-registration: `forge/STIR_RESIDUAL_PREREG.md`. IBKR 15-min SOFR (SR3Z6, SR3H7) and Euribor (IZ6) futures, OANDA M15 targets, 2026-04 → 2026-10. Day-block bootstrap intervals.

## R1 — residual catch-up, 1 h (primary): **FAIL**

- b (price catches up with the rates-implied move): **+0.1859 [+0.0367, +0.3419]**; c (own move) +0.0147 [-0.0522, +0.0768]; n 11,240 over 134 days
- halves (split 2026-07-22): +0.1791 / +0.2014; by target: EUR_USD +0.2064, NAS100_USD +0.1933, SPX500_USD +0.2180, USD_JPY +0.1693, XAU_USD +0.1719
- placebo (drivers shifted ≥ 5 days): median +0.0150, 95th +0.5179, real beats 68.5%
- checks: {'b_ci_above_0': True, 'both_halves': True, 'targets_3_of_5': True, 'beats_placebo_95': False}
- gap trade (|I−O| > 1.5, after costs): +0.45 bp/trade, hit 49.7%, n 935
- same-bar correlation (sanity): NAS100_USD~SR3Z6 +0.215, NAS100_USD~SR3H7 +0.233, SPX500_USD~SR3Z6 +0.271, SPX500_USD~SR3H7 +0.299, USD_JPY~SR3Z6 -0.278, USD_JPY~SR3H7 -0.311, XAU_USD~SR3Z6 +0.382, XAU_USD~SR3H7 +0.409, EUR_USD~SR3Z6 +0.434, EUR_USD~IZ6 +0.277

## R1 — residual catch-up, 4 h (secondary): **FAIL**

- b (price catches up with the rates-implied move): **+0.1686 [-0.1821, +0.4801]**; c (own move) +0.0641 [-0.0535, +0.1603]; n 1,978 over 112 days
- halves (split 2026-07-22): +0.1988 / +0.2200; by target: EUR_USD +0.0640, NAS100_USD +0.4632, SPX500_USD +0.4522, USD_JPY +0.0357, XAU_USD +0.1488
- placebo (drivers shifted ≥ 5 days): median +0.0632, 95th +1.6644, real beats 54.5%
- checks: {'b_ci_above_0': False, 'both_halves': True, 'targets_3_of_5': True, 'beats_placebo_95': False}
- gap trade (|I−O| > 1.5, after costs): -9.51 bp/trade, hit 44.3%, n 158
- same-bar correlation (sanity): NAS100_USD~SR3Z6 +0.215, NAS100_USD~SR3H7 +0.233, SPX500_USD~SR3Z6 +0.271, SPX500_USD~SR3H7 +0.299, USD_JPY~SR3Z6 -0.278, USD_JPY~SR3H7 -0.311, XAU_USD~SR3Z6 +0.382, XAU_USD~SR3H7 +0.409, EUR_USD~SR3Z6 +0.434, EUR_USD~IZ6 +0.277

## R2 — lead-lag (descriptive)

| pair | same bar | rates → price, next 1 / 2 / 4 bars | price → rates, next 1 / 2 / 4 bars |
|---|---|---|---|
| NAS100_USD~SR3H7 | +0.2325 [+0.1854, +0.2768] | +0.0192 [-0.0062, +0.0458] ; +0.0139 [-0.0088, +0.0386] ; +0.0078 [-0.0187, +0.0371] | -0.0017 [-0.0271, +0.0244] ; -0.0170 [-0.0399, +0.0087] ; -0.0028 [-0.0287, +0.0241] |
| EUR_USD~DIFF | -0.1286 [-0.1989, -0.0608] | +0.0065 [-0.0232, +0.0346] ; +0.0021 [-0.0151, +0.0196] ; -0.0086 [-0.0372, +0.0195] | +0.0099 [-0.0194, +0.0396] ; -0.0077 [-0.0369, +0.0231] ; -0.0110 [-0.0393, +0.0211] |

## R3 — previous day's rate-differential path vs NAS100's path (12:30–18:00 London): **PASS**

- mean correlation, day d rates vs day d+1 NAS100: **+0.0744** over 126 pairs (60% positive)
- placebo (random NAS100 day): median -0.0028, 95th +0.0675; real beats 96.6%
- same day (rates d vs NAS100 d): +0.0980 over 127 days
- Friday → Monday only: 0.1162 (n 24); his example, Fri 2 Oct → Mon 5 Oct: 0.3515
