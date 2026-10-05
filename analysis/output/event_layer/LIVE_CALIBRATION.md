# EVENT-LAYER — live-type calibration (ForexFactory vocabulary)

Re-check of `forge/EVENT_LAYER_PREREG.md` (FX + gold PASS) on the inputs the live path uses: ForexFactory High releases (same names as the live feed, all nine currencies), the LIVE IV-adjusted sigma, London 00-22 sessions. First 60% fit, last 40% scored; prereg rule: median B/A < 0.99 and B better on >= 60%.

**FAIL.** Split 2023-03-16. Median B/A **0.9937**, B better on **71%**. Event coefficient (train) 1.476.

| instrument | B/A |
|---|---|
| AUDUSD | 0.9802 |
| EURUSD | 0.9909 |
| GBPUSD | 0.9937 |
| GOLD | 1.0087 |
| USDCAD | 1.0022 |
| USDCHF | 0.9979 |
| USDJPY | 0.9902 |

| test days | n | A p75 exceed | B p75 exceed |
|---|---|---|---|
| top-decile release days | 684 | 35.5% | 17.3% |
| no high release | 1216 | 16.0% | 21.5% |
| all | 3783 | 23.7% | 22.0% |

Release types with an effect (full-data fit): 103. Widest: JPY|BOJ Press Conference +0.351, USD|FOMC Press Conference +0.254, JPY|BOJ Outlook Report +0.251, USD|Federal Funds Rate +0.248, JPY|Monetary Policy Statement +0.246, USD|Treasury Sec Yellen Speaks +0.240, GBP|Monetary Policy Summary +0.218, GBP|BOE Monetary Policy Report +0.203, USD|Core CPI m/m +0.200, GBP|Official Bank Rate +0.198, GBP|MPC Official Bank Rate Votes +0.198, EUR|Main Refinancing Rate +0.194
