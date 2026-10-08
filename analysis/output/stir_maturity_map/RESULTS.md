# STIR maturity map — older contracts (2025 → Mar 2026) vs the live ones (Apr → Oct 2026)

Same measures as `analysis/output/stir_contract_map/`, re-cut by months to expiry so expired and live contracts line up. Rates in rate terms: +1 bp = higher rates priced. The older period was never used by any search.

## 1. Share of each market's 15-min moves explained by that part of the curve (mean R² over 8 markets)

| curve | months to expiry | older | recent |
|---|---|---|---|
| Euribor | 0-3m | 13.5% | 12.3% |
| Euribor | 3-6m | 13.1% | 18.2% |
| Euribor | 6-9m | 7.4% | 24.1% |
| Euribor | 9-12m | 9.6% | nan% |
| SOFR | 0-3m | 1.5% | 4.1% |
| SOFR | 3-6m | 12.2% | 13.6% |
| SOFR | 6-9m | 19.7% | 22.5% |
| SOFR | 9-12m | 22.2% | 25.0% |

## 2. % move per +1 bp, same 15 min (SOFR), older / recent

| months to expiry | NAS100_USD | SPX500_USD | DE30_EUR | EUR_USD | GBP_USD | USD_JPY | XAU_USD | USB02Y_USD |
|---|---|---|---|---|---|---|---|---|
| 0-3m | -0.030 / -0.057 | -0.034 / -0.041 | -0.069 / -0.043 | -0.026 / -0.034 | -0.024 / -0.033 | +0.022 / +0.029 | -0.078 / -0.130 | -0.011 / -0.016 |
| 3-6m | -0.016 / -0.044 | -0.020 / -0.036 | -0.036 / -0.046 | -0.032 / -0.028 | -0.030 / -0.028 | +0.040 / +0.027 | -0.062 / -0.111 | -0.015 / -0.014 |
| 6-9m | +0.082 / -0.048 | +0.070 / -0.037 | +0.061 / -0.049 | -0.020 / -0.026 | -0.014 / -0.028 | +0.040 / +0.028 | -0.021 / -0.107 | -0.014 / -0.014 |
| 9-12m | +0.074 / -0.046 | +0.064 / -0.036 | +0.059 / -0.048 | -0.019 / -0.024 | -0.014 / -0.025 | +0.042 / +0.025 | -0.018 / -0.096 | -0.014 / -0.013 |

## 3. After a sharp 15-min rate move (top 5%): P(market keeps going the expected way), mean over 8 markets

| curve | months | period | sharp bars (per market) | 15m | 1h | 4h |
|---|---|---|---|---|---|---|
| Euribor | 0-3m | older 2025-01..2026-03 | 232 | 51% | 49% | 49% |
| Euribor | 0-3m | recent 2026-04..2026-10 | 348 | 46% | 48% | 48% |
| Euribor | 3-6m | older 2025-01..2026-03 | 246 | 54% | 51% | 50% |
| Euribor | 3-6m | recent 2026-04..2026-10 | 285 | 47% | 48% | 48% |
| Euribor | 6-9m | older 2025-01..2026-03 | 894 | 48% | 51% | 51% |
| Euribor | 6-9m | recent 2026-04..2026-10 | 560 | 47% | 50% | 51% |
| Euribor | 9-12m | older 2025-01..2026-03 | 394 | 48% | 50% | 52% |
| SOFR | 0-3m | older 2025-01..2026-03 | 576 | 49% | 49% | 50% |
| SOFR | 0-3m | recent 2026-04..2026-10 | 677 | 46% | 50% | 51% |
| SOFR | 3-6m | older 2025-01..2026-03 | 344 | 49% | 49% | 50% |
| SOFR | 3-6m | recent 2026-04..2026-10 | 337 | 52% | 50% | 51% |
| SOFR | 6-9m | older 2025-01..2026-03 | 518 | 50% | 50% | 50% |
| SOFR | 6-9m | recent 2026-04..2026-10 | 193 | 50% | 51% | 51% |
| SOFR | 9-12m | older 2025-01..2026-03 | 831 | 48% | 50% | 51% |
| SOFR | 9-12m | recent 2026-04..2026-10 | 376 | 46% | 48% | 49% |

Sharp-move cut-offs (bp in 15 min, from the older period): Euribor 0-3m 1.00, Euribor 3-6m 1.25, Euribor 6-9m 1.00, Euribor 9-12m 1.50, SOFR 0-3m 0.25, SOFR 3-6m 1.00, SOFR 6-9m 1.50, SOFR 9-12m 1.50
