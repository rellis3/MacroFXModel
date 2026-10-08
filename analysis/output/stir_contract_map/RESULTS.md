# STIR contract map — what each part of the rate curve does to markets

IBKR 15-min short-rate futures vs OANDA 15-min markets, 2026-04 → 2026-10. Rates in rate terms (100 − price): **+1 bp = the market prices HIGHER rates**. Descriptive: every number is shown for Apr–Jul and Aug–Oct separately; trust what holds in both. Confirmation on older contracts comes next.

## 1. Which part of the curve moves markets most (same 15 min)

Average R² across the 8 markets (share of a market's 15-min moves that the contract's move explains):

| contract | Apr–Jul | Aug–Oct |
|---|---|---|
| SR3H7 | 28.2% | 23.0% |
| SR3M7 | 28.1% | 24.9% |
| SR3Z6 | 26.6% | 19.3% |
| SR3U6 | 20.8% | 11.5% |
| IZ6 | 19.6% | 10.4% |
| ER3U6 | 14.5% | 3.7% |
| Fed path (M7-Z6) | 3.3% | 8.6% |
| US-EU (Z6) | 1.4% | 2.8% |

## 2. Expected move per 1 bp (same 15 min)

% move in the market for a +1 bp rise in the contract's rate, Apr–Jul / Aug–Oct:

| contract | NAS100_USD | SPX500_USD | DE30_EUR | EUR_USD | GBP_USD | USD_JPY | XAU_USD | USB02Y_USD |
|---|---|---|---|---|---|---|---|---|
| SR3U6 | -0.052 / -0.062 | -0.044 / -0.043 | -0.065 / -0.043 | -0.032 / -0.031 | -0.034 / -0.031 | +0.024 / +0.043 | -0.117 / -0.129 | -0.015 / -0.018 |
| SR3Z6 | -0.054 / -0.047 | -0.042 / -0.033 | -0.064 / -0.032 | -0.028 / -0.022 | -0.030 / -0.022 | +0.022 / +0.033 | -0.108 / -0.102 | -0.013 / -0.015 |
| SR3H7 | -0.052 / -0.041 | -0.041 / -0.030 | -0.062 / -0.031 | -0.026 / -0.020 | -0.028 / -0.021 | +0.021 / +0.031 | -0.100 / -0.093 | -0.012 / -0.014 |
| SR3M7 | -0.049 / -0.041 | -0.039 / -0.030 | -0.063 / -0.032 | -0.025 / -0.018 | -0.027 / -0.019 | +0.020 / +0.030 | -0.097 / -0.089 | -0.012 / -0.013 |
| IZ6 | -0.057 / -0.043 | -0.044 / -0.032 | -0.082 / -0.048 | -0.018 / -0.010 | -0.021 / -0.014 | +0.019 / +0.030 | -0.081 / -0.076 | -0.008 / -0.011 |
| ER3U6 | -0.060 / -0.048 | -0.047 / -0.033 | -0.090 / -0.071 | -0.018 / -0.012 | -0.022 / -0.014 | +0.019 / +0.028 | -0.084 / -0.082 | -0.008 / -0.011 |
| US-EU (Z6) | +0.016 / -0.011 | +0.011 / -0.006 | +0.033 / +0.006 | -0.006 / -0.012 | -0.003 / -0.010 | -0.001 / +0.009 | -0.005 / -0.035 | -0.003 / -0.005 |
| Fed path (M7-Z6) | -0.025 / -0.032 | -0.022 / -0.025 | -0.045 / -0.031 | -0.012 / -0.012 | -0.013 / -0.014 | +0.011 / +0.025 | -0.048 / -0.070 | -0.007 / -0.011 |

## 3. After a sharp move (top 5% of 15-min rate moves): does the market keep going the expected way?

Expected way = the direction the same-bar relationship (Apr–Jul) says. Follow-through measured from the END of the sharp bar. 50% = no information. Averaged over the 8 markets.

| contract | period | sharp bars | P(follow) 15m | 1h | 4h | mean follow % 15m | 1h | 4h |
|---|---|---|---|---|---|---|---|---|
| ER3U6 | Apr-Jul | 208 | 47% | 50% | 50% | +0.002 | +0.003 | +0.004 |
| ER3U6 | Aug-Oct | 5 | 68% | 68% | 69% | +0.048 | +0.064 | +0.121 |
| Fed path (M7-Z6) | Apr-Jul | 227 | 46% | 47% | 45% | -0.000 | -0.004 | -0.022 |
| Fed path (M7-Z6) | Aug-Oct | 234 | 49% | 50% | 50% | +0.008 | +0.014 | +0.005 |
| IZ6 | Apr-Jul | 292 | 47% | 49% | 49% | +0.002 | +0.006 | +0.004 |
| IZ6 | Aug-Oct | 47 | 51% | 48% | 49% | +0.012 | +0.014 | +0.026 |
| SR3H7 | Apr-Jul | 273 | 45% | 45% | 48% | +0.004 | -0.006 | -0.005 |
| SR3H7 | Aug-Oct | 122 | 51% | 53% | 55% | +0.012 | +0.023 | +0.048 |
| SR3M7 | Apr-Jul | 293 | 45% | 47% | 48% | +0.005 | +0.009 | +0.009 |
| SR3M7 | Aug-Oct | 180 | 49% | 50% | 51% | +0.010 | +0.015 | +0.019 |
| SR3U6 | Apr-Jul | 231 | 49% | 49% | 50% | +0.006 | -0.006 | -0.011 |
| SR3U6 | Aug-Oct | 26 | 50% | 45% | 57% | -0.002 | -0.006 | +0.057 |
| SR3Z6 | Apr-Jul | 182 | 44% | 46% | 48% | +0.000 | +0.002 | +0.006 |
| SR3Z6 | Aug-Oct | 55 | 54% | 52% | 53% | +0.021 | +0.014 | +0.041 |
| US-EU (Z6) | Apr-Jul | 224 | 49% | 49% | 49% | +0.001 | +0.006 | +0.005 |
| US-EU (Z6) | Aug-Oct | 91 | 49% | 49% | 52% | -0.001 | -0.004 | -0.006 |

## 4. Single contract → market pairs that followed through at 1 h in BOTH periods (> 55%)

| contract | market | Apr–Jul P / mean % / n | Aug–Oct P / mean % / n |
|---|---|---|---|
| US-EU (Z6) | DE30_EUR | 56% / +0.033 / 211 | 56% / +0.007 / 89 |

(64 contract-market pairs checked; with ~10–40 sharp bars per cell, a pair clears 55% in both periods by luck fairly often, so treat these as candidates for the older-contract check, not results.)
