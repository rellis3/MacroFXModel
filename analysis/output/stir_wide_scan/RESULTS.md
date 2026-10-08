# STIR wide scan — results

Protocol: `forge/STIR_WIDE_SCAN_PROTOCOL.md`. Discovery 2026-04 → 07, holdout 08 → 10-07; 48,600 tests; 30 scrambled-rates scans.

## The broad view (do rates lead price in many ways at once?)

- Agreement between discovery t and holdout t across all tests: **ρ +0.0178**; scrambled rates: median -0.0029, 95th +0.0692; real beats 73.3%
- ρ by slice (where the agreement lives): **rate** D_ESTR_U6 +0.041, D_H7 -0.017, D_U6 +0.030, D_Z6 +0.030, ER3U6 -0.023, IZ6 -0.025, SLOPE_H7Z6 -0.049, SLOPE_M7Z6 +0.105, SR3H7 -0.015, SR3M7 +0.039, SR3U6 +0.050, SR3Z6 +0.034; **ftype** gap16 +0.019, gap4 -0.069, mom1 +0.011, mom16 -0.069, mom2 +0.031, mom4 +0.072, mom8 +0.104, shock +0.062, turn +0.045; **target** AUD_USD +0.098, BCO_USD +0.038, DE10YB_EUR -0.073, DE30_EUR +0.018, EUR_USD +0.184, GBP_USD +0.040, NAS100_USD +0.001, SPX500_USD -0.055, UK10YB_GBP -0.204, USB02Y_USD +0.133, USB05Y_USD -0.045, USB10Y_USD -0.059, USB30Y_USD -0.204, USD_CAD +0.143, USD_CHF -0.046, USD_JPY +0.004, XAG_USD +0.068, XAU_USD +0.069; **h** 1 +0.015, 2 +0.020, 4 -0.015, 8 +0.079, 16 -0.000; **when** all -0.025, asia +0.133, london_am +0.004, us_data_open -0.086, us_pm +0.067

## Single findings

- Best |t| a scrambled scan reaches (95th pct of 30 runs): **4.45**. Real best discovery |t|: 3.35; tests beyond the threshold: 0
- Of those, confirmed in the holdout (same sign, |t| ≥ 2): **0**
- Top 30 discovery results: 25/30 same sign in the holdout (chance ≈ 15), 0 with holdout |t| ≥ 2

| feature | target | h (bars) | when | t discovery | t holdout |
|---|---|---|---|---|---|
| SLOPE_M7Z6|mom1 | XAG_USD | 2 | london_am | +3.35 | +1.17 |
| IZ6|shock | DE10YB_EUR | 16 | london_am | -3.32 | +1.74 |
| SR3U6|turn | GBP_USD | 2 | us_data_open | -3.32 | -0.14 |
| SLOPE_H7Z6|mom16 | EUR_USD | 16 | asia | +3.28 | +0.74 |
| SLOPE_M7Z6|mom2 | XAG_USD | 1 | london_am | +3.28 | +0.94 |
| IZ6|gap16 | USB05Y_USD | 16 | us_pm | +3.26 | +0.82 |
| ER3U6|mom8 | XAG_USD | 2 | london_am | +3.24 | +0.37 |
| SLOPE_M7Z6|mom1 | EUR_USD | 2 | london_am | +3.20 | +1.85 |
| SLOPE_M7Z6|mom2 | EUR_USD | 1 | london_am | +3.19 | +1.97 |
| SR3M7|turn | GBP_USD | 2 | us_data_open | -3.17 | -0.22 |
| D_H7|mom1 | USB30Y_USD | 2 | asia | -3.17 | -0.57 |
| ER3U6|gap16 | USB05Y_USD | 16 | us_pm | +3.15 | +0.24 |
| SLOPE_M7Z6|mom8 | DE30_EUR | 4 | all | +3.15 | +1.76 |
| SLOPE_H7Z6|shock | BCO_USD | 16 | us_data_open | +3.14 | -1.27 |
| SR3Z6|mom8 | XAU_USD | 2 | asia | +3.09 | +1.25 |
| SLOPE_H7Z6|mom8 | AUD_USD | 1 | london_am | +3.09 | +1.10 |
| SLOPE_H7Z6|mom2 | AUD_USD | 4 | london_am | +3.07 | +1.02 |
| SLOPE_H7Z6|mom16 | USD_CHF | 16 | asia | -3.07 | +1.01 |
| SR3U6|mom16 | USD_CAD | 8 | asia | +3.07 | +1.48 |
| SR3M7|shock | SPX500_USD | 4 | us_data_open | +3.07 | +0.02 |
| ER3U6|shock | DE10YB_EUR | 16 | london_am | -3.07 | -0.84 |
| SLOPE_H7Z6|mom1 | USD_JPY | 1 | asia | +3.03 | -0.91 |
| SR3U6|mom8 | USD_CAD | 8 | asia | +3.03 | +0.76 |
| SLOPE_M7Z6|shock | NAS100_USD | 1 | asia | +3.02 | +1.52 |
| SLOPE_M7Z6|mom4 | DE30_EUR | 8 | all | +3.02 | +1.43 |
| D_Z6|turn | BCO_USD | 1 | us_pm | +3.01 | -0.97 |
| SLOPE_H7Z6|mom8 | AUD_USD | 8 | asia | +3.01 | +0.68 |
| SLOPE_M7Z6|turn | AUD_USD | 4 | asia | -3.00 | -1.45 |
| SLOPE_M7Z6|turn | BCO_USD | 16 | asia | +3.00 | +0.41 |
| IZ6|mom8 | XAG_USD | 2 | london_am | +3.00 | +1.16 |
