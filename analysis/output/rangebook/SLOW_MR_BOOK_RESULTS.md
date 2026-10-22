# Slow mean-reversion book — results

Rule: forge/SLOW_MR_BOOK_PREREG.md. Continuous fade of the 20-day stretch (s = −clip(z/2, ±1)), decided at 07:00 London, held to the next 07:00, sized to equal daily risk, 28 instruments, net of spread on every position change.

## 1. The book (equal risk, primary)

| period | days | annualised Sharpe | mean per day (risk units) | worst drawdown (risk units) |
|---|---|---|---|---|
| full | 2661 | +0.11 | +0.00187 | -10.317 |
| 2016–2022 | 1725 | -0.17 | -0.00290 | -10.317 |
| 2023–2026-08 | 936 | +0.65 | +0.01066 | -8.920 |

By year (Sharpe): 2016 +0.61, 2017 -0.39, 2018 -0.55, 2019 +0.23, 2020 -0.32, 2021 +0.07, 2022 -0.67, 2023 +1.62, 2024 -0.45, 2025 +0.94, 2026 +1.35

Deflated Sharpe ratio: **0.246** at N = 4 trials (benchmark Sharpe 0.32); 0.062 at N = 20 (benchmark 0.59). Sleeves with a positive Sharpe: 14/28.

## 2. Secondary

- **2× cost:** Sharpe -0.11 (2016–22 -0.39, 2023–26 +0.41)
- **HRP + Ledoit-Wolf** (from 2017-04-14): Sharpe -0.04 vs equal-risk over the same days +0.07
- Average correlation between sleeves: 0.18 (breadth: 28 sleeves ≈ 4.7 independent bets)

## 3. Each instrument's sleeve (full-period Sharpe)

EURGBP +0.56, EURCAD +0.54, AUDCAD +0.45, CADCHF +0.40, EURUSD +0.34, NZDCAD +0.29, GBPCAD +0.26, EURJPY +0.21, AUDCHF +0.19, EURCHF +0.17, GBPUSD +0.16, AUDUSD +0.16, USDCAD +0.11, CADJPY +0.06, GBPNZD -0.00, USDCHF -0.00, EURAUD -0.03, GBPAUD -0.04, USDJPY -0.05, NZDUSD -0.06, CHFJPY -0.10, GBPJPY -0.14, AUDJPY -0.17, NZDJPY -0.19, AUDNZD -0.19, GBPCHF -0.20, EURNZD -0.33, GOLD -0.62

## Verdict (pre-registered): **FAIL**
- Sharpe > 0 in both halves: no; deflated Sharpe ≥ 0.95 (N=4): no (0.246); ≥ 17/28 sleeves positive: no (14)
