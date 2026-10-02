# Break trades when implied vol is rich — results

Pre-registration: forge/BREAK_IVRV_PREREG.md (06414e8). BREAK trades on the 7 CVOL instruments, mean net R over 0.1/0.2σ × 5R/10R. Top third of IV ÷ RV (CVOL edges from 2016–22: 1.05 / 1.27): +0.118R per trade, n=5,604; middle -0.105; bottom -0.138.

| check | result | detail |
|---|---|---|
| 1 independent IV (settlement iv30, 6 FX, 2020-09 →) | holds | +0.212R, n=3,191 (CVOL top third on the same rows: +0.265) |
| 2 instruments (≥ 5 of 7 positive) | holds | AUDUSD +0.119, EURUSD +0.025, GBPUSD +0.057, GOLD +0.065, USDCAD +0.320, USDCHF +0.383, USDJPY +0.087 |
| 3 years (≥ 7 of 10 positive) | holds | 2016 -0.154, 2017 -0.093, 2018 +0.018, 2019 -0.087, 2020 +0.206, 2021 +0.059, 2022 +0.449, 2023 +0.099, 2024 +0.134, 2025 +0.176 |
| 4 mechanism (bottom < top in all 4 cells) | holds | 0.1σ r5: top +0.036 vs bottom -0.145; 0.1σ r10: top +0.154 vs bottom -0.181; 0.2σ r5: top +0.122 vs bottom -0.107; 0.2σ r10: top +0.160 vs bottom -0.118 |
| 5 longs and shorts both positive | holds | longs +0.157, shorts +0.081 |

**Verdict: PASS** (5 of 5 checks hold).

## Post-hoc audit (not pre-registered; scripts/rangebook/break_ivrv_audit.py)
| question | result |
|---|---|
| IV published too late? IV from two days earlier | +0.114R (vs +0.118R), day-clustered 95% CI [+0.010, +0.218] |
| Clustering: resample whole instrument-days (1,926 days) | 95% CI [+0.017, +0.223] |
| One trade per instrument-day (the first break) | +0.095R, n = 1,926 |
| Entries from 01:00 London only | +0.088R, n = 5,383 |
| Without the best 1% of trades | +0.043R; the best 1% carry 64% of the total; median trade −1.09R |
| By period | 2016–19 −0.070R (n = 1,740) · 2020–22 +0.237R (n = 2,052) · 2023–26 +0.163R (n = 1,812) |

## Reading
The first pre-registered pass of this research line, and it survives the lag, clustering and one-per-day checks. Two
honest weaknesses: it rests on rare large winners (most trades lose a full R, as a 5–10R structure should), and it only
works from 2020 on (2016–19 is negative). The day-clustered CI's lower bound is about +0.01R. Treat it as a candidate
for a forward paper record, not a trading rule. Live inputs: implied vol (the settlement-built iv30 passed check 1 on
its own) and realised vol from prices.
