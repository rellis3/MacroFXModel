# Cross-pair Range Book — results

Rule: forge/CROSSPAIR_RANGE_BOOK_PREREG.md. 16 instruments, train 2016 → 2022, test 2023 → 2026-08. Skill = Brier improvement on the instrument's TEST rows; 95% day-bootstrap interval.

## 1. Each instrument on its own (test period)

| instrument | days | range ≥ p50 / p75 / p90 (nominal 50 / 25 / 10) | Book A skill vs unconditional | Book C skill vs unconditional |
|---|---|---|---|---|
| EURUSD | 943 | 47% / 23% / 10% | +0.188 | +0.331 |
| GBPUSD | 943 | 49% / 24% / 10% | +0.201 | +0.344 |
| USDJPY | 943 | 43% / 21% / 7% | +0.211 | +0.311 |
| AUDUSD | 943 | 50% / 23% / 9% | +0.217 | +0.323 |
| USDCAD | 943 | 51% / 24% / 9% | +0.202 | +0.290 |
| USDCHF | 943 | 46% / 22% / 10% | +0.203 | +0.326 |
| NZDUSD | 943 | 50% / 24% / 11% | +0.220 | +0.328 |
| EURGBP | 943 | 51% / 25% / 10% | +0.221 | +0.366 |
| EURJPY | 943 | 46% / 21% / 11% | +0.211 | +0.332 |
| GBPJPY | 943 | 47% / 23% / 9% | +0.223 | +0.337 |
| EURAUD | 943 | 51% / 24% / 10% | +0.244 | +0.339 |
| EURCHF | 943 | 48% / 24% / 11% | +0.202 | +0.356 |
| AUDJPY | 943 | 49% / 22% / 10% | +0.222 | +0.322 |
| CADJPY | 943 | 48% / 22% / 9% | +0.206 | +0.310 |
| CHFJPY | 943 | 41% / 22% / 9% | +0.214 | +0.344 |
| GOLD | 938 | 53% / 26% / 10% | +0.207 | +0.307 |

## 2. Q1 — is one pooled book as good as each pair's own?

Pooled = fitted on the other 15 instruments' train rows. Skill of pooled vs own on this instrument's test rows: ≥ 0 means the shared book is at least as good. "OK" = not significantly worse (interval reaches 0 or above).

| instrument | Book A: pooled vs own | OK? | Book C: pooled vs own | OK? |
|---|---|---|---|---|
| EURUSD | +0.0107 (+0.0050 to +0.0166) | yes | +0.0093 (+0.0018 to +0.0164) | yes |
| GBPUSD | +0.0087 (+0.0052 to +0.0127) | yes | +0.0205 (+0.0133 to +0.0282) | yes |
| USDJPY | -0.0102 (-0.0184 to -0.0031) | **no** | -0.0033 (-0.0120 to +0.0050) | yes |
| AUDUSD | +0.0023 (-0.0042 to +0.0080) | yes | +0.0111 (+0.0062 to +0.0162) | yes |
| USDCAD | -0.0027 (-0.0097 to +0.0047) | yes | -0.0009 (-0.0109 to +0.0095) | yes |
| USDCHF | +0.0143 (+0.0088 to +0.0201) | yes | +0.0151 (+0.0071 to +0.0229) | yes |
| NZDUSD | +0.0071 (+0.0039 to +0.0104) | yes | +0.0124 (+0.0067 to +0.0181) | yes |
| EURGBP | +0.0055 (+0.0019 to +0.0094) | yes | +0.0113 (+0.0057 to +0.0174) | yes |
| EURJPY | +0.0075 (+0.0010 to +0.0142) | yes | +0.0061 (-0.0011 to +0.0131) | yes |
| GBPJPY | +0.0041 (-0.0026 to +0.0106) | yes | +0.0011 (-0.0058 to +0.0081) | yes |
| EURAUD | -0.0029 (-0.0105 to +0.0041) | yes | +0.0090 (+0.0033 to +0.0145) | yes |
| EURCHF | +0.0061 (+0.0014 to +0.0108) | yes | +0.0080 (-0.0018 to +0.0170) | yes |
| AUDJPY | -0.0079 (-0.0193 to +0.0028) | yes | +0.0033 (-0.0027 to +0.0100) | yes |
| CADJPY | +0.0224 (+0.0165 to +0.0281) | yes | +0.0195 (+0.0131 to +0.0262) | yes |
| CHFJPY | +0.0076 (+0.0034 to +0.0117) | yes | +0.0224 (+0.0174 to +0.0274) | yes |
| GOLD | +0.0198 (+0.0142 to +0.0259) | yes | +0.0206 (+0.0127 to +0.0278) | yes |

**Q1 verdict:** Book A — one book serves all (15/16 OK); Book C — one book serves all (16/16 OK). Threshold 13/16.

## 3. Q2 — do USD pairs share a book more closely?

| USD pair | Book A: USD-pool vs all-pool | better? | Book C: USD-pool vs all-pool | better? |
|---|---|---|---|---|
| EURUSD | +0.0007 (-0.0010 to +0.0023) | no | -0.0012 (-0.0027 to +0.0001) | no |
| GBPUSD | +0.0003 (-0.0017 to +0.0020) | no | -0.0009 (-0.0026 to +0.0007) | no |
| USDJPY | -0.0151 (-0.0181 to -0.0119) | no | -0.0128 (-0.0157 to -0.0099) | no |
| AUDUSD | -0.0066 (-0.0092 to -0.0043) | no | -0.0045 (-0.0066 to -0.0026) | no |
| USDCAD | +0.0028 (+0.0015 to +0.0038) | **yes** | +0.0007 (-0.0004 to +0.0017) | no |
| USDCHF | -0.0009 (-0.0027 to +0.0007) | no | +0.0002 (-0.0008 to +0.0014) | no |
| NZDUSD | -0.0044 (-0.0066 to -0.0024) | no | -0.0026 (-0.0048 to -0.0006) | no |

**Q2 verdict:** USD grouping does not help (Book A 1/7, Book C 0/7 significantly better; threshold 5/7).

## 4. Timing profile — chance the running high/low is exceeded later (test period)

| instrument | 07:00 | 10:00 | 13:00 | 16:00 |
|---|---|---|---|---|
| EURUSD | 77% | 61% | 54% | 29% |
| GBPUSD | 77% | 61% | 51% | 28% |
| USDJPY | 64% | 54% | 47% | 26% |
| AUDUSD | 63% | 54% | 48% | 27% |
| USDCAD | 78% | 67% | 59% | 33% |
| USDCHF | 77% | 61% | 52% | 28% |
| NZDUSD | 65% | 55% | 48% | 28% |
| EURGBP | 79% | 60% | 48% | 26% |
| EURJPY | 66% | 50% | 42% | 24% |
| GBPJPY | 67% | 52% | 43% | 25% |
| EURAUD | 63% | 51% | 43% | 24% |
| EURCHF | 79% | 59% | 47% | 26% |
| AUDJPY | 60% | 50% | 43% | 26% |
| CADJPY | 67% | 56% | 50% | 30% |
| CHFJPY | 68% | 51% | 43% | 26% |
| GOLD | 67% | 59% | 53% | 27% |

(The pre-registration listed a "time-of-day continuation profile"; touch data was not built for the 15 new instruments, so this Book C timing profile stands in for it.)

## 5. Q3 — does the big-day forecast hold on pairs it was not found on?

Quantile gradient boosting of log(day range ÷ hl p50), walk-forward by year 2023–2026, each instrument's own fitted widths. Skill = pinball-loss improvement; ✔ = 95% bootstrap interval above 0.

| instrument | test days | 0.75: M3 vs your lines | 0.90: M3 vs your lines | 0.90: IV added (M3 vs M2) |
|---|---|---|---|---|
| GBPUSD | 943 | +0.051 (+0.024 to +0.076) ✔ | +0.050 (+0.012 to +0.084) ✔ | +0.037 (+0.006 to +0.066) ✔ |
| AUDUSD | 943 | +0.027 (-0.003 to +0.055) | +0.025 (-0.015 to +0.067) | +0.006 (-0.022 to +0.032) |
| USDCAD | 943 | +0.048 (+0.019 to +0.077) ✔ | +0.047 (+0.001 to +0.091) ✔ | +0.030 (-0.009 to +0.067) |
| USDCHF | 943 | +0.066 (+0.034 to +0.095) ✔ | +0.041 (+0.002 to +0.079) ✔ | +0.012 (-0.018 to +0.040) |
| USDJPY | 943 | +0.047 (+0.016 to +0.075) ✔ | +0.060 (+0.014 to +0.101) ✔ | +0.019 (-0.017 to +0.050) |
| GOLD | 938 | +0.041 (+0.003 to +0.075) ✔ | +0.054 (+0.010 to +0.100) ✔ | +0.046 (+0.007 to +0.081) ✔ |
| EURUSD (seen — not counted) | 943 | +0.039 (+0.012 to +0.063) ✔ | +0.059 (+0.027 to +0.090) ✔ | +0.031 (+0.007 to +0.055) ✔ |

Pooled over the 6 new instruments, 0.90: M3 vs your lines +0.047 (+0.030 to +0.063) ✔; IV added +0.025 (+0.012 to +0.038) ✔. M3 beats the lines at 0.90 on 6 of 6.

**Q3 verdict:** big-day forecast CONFIRMED; implied vol adds information (pooled).
