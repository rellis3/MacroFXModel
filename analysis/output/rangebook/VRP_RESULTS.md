# Your vol forecast vs implied vol — variance risk premium

Rule: forge/VRP_FORECAST_PREREG.md. Monthly short-variance proxy, payoff (IV² − RV²)/(2·IV) in vol points, entered at each month's last NY close, 21-day horizon. IV = CME CVOL; F = your forecast σ (annualised).

## Cost 0.4 vol points per trade

| instrument | months | A always short: mean (t) | B only when IV > F: months traded | B mean per traded month | B mean over all months (t) | B − A paired (t) |
|---|---|---|---|---|---|---|
| EURUSD | 124 | +0.15 (+0.9) | 100 | +0.11 | +0.09 (+0.5) | -0.06 (-1.2) |
| GBPUSD | 124 | -0.15 (-0.4) | 93 | +0.15 | +0.11 (+0.5) | +0.26 (+0.8) |
| AUDUSD | 93 | +0.25 (+0.7) | 83 | +0.19 | +0.17 (+0.5) | -0.08 (-1.1) |
| USDCAD | 93 | +0.07 (+0.3) | 75 | +0.06 | +0.05 (+0.2) | -0.01 (-0.2) |
| USDCHF | 93 | -0.34 (-0.9) | 77 | -0.47 | -0.39 (-1.1) | -0.05 (-0.7) |
| USDJPY | 124 | +0.58 (+1.9) | 109 | +0.42 | +0.37 (+1.3) | -0.21 (-2.4) |
| GOLD | 124 | +0.48 (+1.1) | 104 | +0.54 | +0.46 (+1.1) | -0.02 (-0.1) |
| **pooled** | 775 | +0.17 (+1.3) | — | — | +0.14 (+1.3) | -0.02 (-0.4) |

B by period: 2016–2022 +0.21 (t +1.6); 2023–2026 +0.03 (t +0.2).

## Cost 0.8 vol points per trade

| instrument | months | A always short: mean (t) | B only when IV > F: months traded | B mean per traded month | B mean over all months (t) | B − A paired (t) |
|---|---|---|---|---|---|---|
| EURUSD | 124 | -0.25 (-1.5) | 100 | -0.29 | -0.24 (-1.5) | +0.01 (+0.3) |
| GBPUSD | 124 | -0.55 (-1.4) | 93 | -0.25 | -0.19 (-0.8) | +0.36 (+1.1) |
| AUDUSD | 93 | -0.15 (-0.4) | 83 | -0.21 | -0.18 (-0.5) | -0.04 (-0.5) |
| USDCAD | 93 | -0.33 (-1.4) | 75 | -0.34 | -0.27 (-1.2) | +0.06 (+1.0) |
| USDCHF | 93 | -0.74 (-2.1) | 77 | -0.87 | -0.72 (-2.1) | +0.01 (+0.2) |
| USDJPY | 124 | +0.18 (+0.6) | 109 | +0.02 | +0.02 (+0.1) | -0.16 (-2.0) |
| GOLD | 124 | +0.08 (+0.2) | 104 | +0.14 | +0.12 (+0.3) | +0.04 (+0.2) |
| **pooled** | 775 | -0.23 (-1.8) | — | — | -0.19 (-1.7) | +0.05 (+0.7) |

B by period: 2016–2022 -0.12 (t -0.9); 2023–2026 -0.30 (t -1.5).

## Descriptive

- Implied vol above realised (the market's premium): 75% of months; mean IV − RV +0.98 vol points.
- Implied vol above YOUR forecast: 83% of months; mean IV − F +0.97.
- Does the gap (IV − your forecast) predict the premium (IV − RV)? correlation -0.12.
- Forecast accuracy for next month's realised vol: mean |F − RV| 2.27 vs mean |IV − RV| 2.17 vol points.
- Always-short tail: worst month -37.83, 5th percentile -4.50, best +13.35 (vol points).

## Verdict (pre-registered, cost 0.4): **FAIL**
- Forecast-filtered beats always-short (paired t ≥ 2): no; net positive in both halves: yes
