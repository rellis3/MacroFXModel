# Rate-spread direction at C.OG's lines (results)

Pre-registration: `forge/COG_SPREAD_DIRECTION_PREREG.md`. EURUSD/GOLD/NQ, 2016-10 → 2026-08. 12 spreads (fed funds, curve, real yields, breakevens, credit, the yield book's USD stance on other pairs) × 4 reads × sign × fade (A) / continue (C) = 192 choices per instrument, picked on past years only, scored on the next year (2019–2026). R after costs.

## Verdict: **FAIL**

- Out-of-sample mean R: **-0.033 [-0.078, +0.015]** (n 1521)
- Minus the same setups with no filter: -0.000 [-0.036, +0.035] (no-filter OOS -0.033)
- Placebo (spreads shifted in time, 500 runs): median -0.041, 95th pct -0.009; real beats 63.0%
- By instrument OOS: EURUSD -0.117 (n 276), GOLD -0.031 (n 489), NQ -0.004 (n 756)

## What each instrument picked each year (stability)

| ins | year | setup | spread:read | sign | train R | test n | test R |
|---|---|---|---|---|---|---|---|
| EURUSD | 2019 | C | T10Y2Y:lvl | +1 | +0.088 | 88 | -0.137 |
| EURUSD | 2020 | C | BOOK-USD:lvl | +1 | +0.045 | 50 | -0.250 |
| EURUSD | 2021 | A | DFF:chg20 | -1 | +0.032 | 32 | -0.197 |
| EURUSD | 2022 | C | 3M-FF:chg1 | -1 | +0.014 | 81 | -0.037 |
| EURUSD | 2023 | A | DFF:chg5 | -1 | +0.060 | 6 | +0.130 |
| EURUSD | 2024 | A | DFF:chg5 | -1 | +0.063 | 6 | +0.038 |
| EURUSD | 2025 | A | DFF:chg5 | -1 | +0.062 | 10 | -0.019 |
| EURUSD | 2026 | A | DFF:chg5 | -1 | +0.057 | 3 | +0.243 |
| GOLD | 2019 | C | 3M-FF:chg1 | -1 | +0.032 | 74 | -0.047 |
| GOLD | 2020 | C | BOOK-USD:chg20 | -1 | +0.030 | 37 | +0.061 |
| GOLD | 2021 | C | BOOK-USD:chg20 | -1 | +0.035 | 58 | +0.105 |
| GOLD | 2022 | C | BOOK-USD:chg20 | -1 | +0.049 | 61 | -0.216 |
| GOLD | 2023 | C | BOOK-USD:chg20 | -1 | +0.002 | 74 | -0.019 |
| GOLD | 2024 | C | BOOK-USD:chg20 | -1 | -0.002 | 69 | -0.142 |
| GOLD | 2025 | C | BAA-AAA:chg1 | +1 | +0.009 | 74 | +0.166 |
| GOLD | 2026 | C | BAA-AAA:chg1 | +1 | +0.024 | 42 | -0.194 |
| NQ | 2019 | C | 3M-FF:chg20 | +1 | +0.147 | 100 | -0.037 |
| NQ | 2020 | C | 3M-FF:chg20 | +1 | +0.095 | 104 | -0.024 |
| NQ | 2021 | C | BAA10Y:chg20 | -1 | +0.070 | 119 | +0.073 |
| NQ | 2022 | C | BAA10Y:chg1 | -1 | +0.073 | 100 | -0.060 |
| NQ | 2023 | C | BAA-AAA:chg1 | -1 | +0.055 | 110 | +0.088 |
| NQ | 2024 | C | BAA-AAA:chg1 | -1 | +0.060 | 65 | +0.045 |
| NQ | 2025 | C | BAA-AAA:chg1 | -1 | +0.059 | 79 | -0.112 |
| NQ | 2026 | C | BAA10Y:chg20 | -1 | +0.055 | 79 | -0.042 |

## In-sample best of 192 on the full period (what cherry-picking would claim; NOT evidence)

- **EURUSD**: A DFF:chg5 -1 +0.060 (n 178); A T10Y2Y:lvl +1 +0.003 (n 964); C T10Y2Y:lvl +1 +0.001 (n 937); A BAA-AAA:lvl -1 -0.006 (n 976); C DGS2:lvl -1 -0.011 (n 920); A DFF:chg20 -1 -0.017 (n 368); A BOOK-USD:chg20 -1 -0.018 (n 531); C BAA-AAA:lvl -1 -0.019 (n 925)
- **GOLD**: C BAA-AAA:chg1 +1 +0.013 (n 818); C BOOK-USD:chg20 -1 +0.011 (n 619); C T10Y2Y:chg20 +1 +0.006 (n 982); C BAA10Y:chg20 +1 +0.000 (n 950); C DGS2:chg20 -1 -0.000 (n 975); C T10Y2Y:lvl +1 -0.003 (n 1041); C BAA10Y:chg5 +1 -0.005 (n 924); C DGS2:chg1 +1 -0.009 (n 842)
- **NQ**: C BAA10Y:chg20 -1 +0.048 (n 1081); C BAA-AAA:chg1 -1 +0.044 (n 902); C 2Y-FF:lvl -1 +0.036 (n 1078); C BAA10Y:chg1 -1 +0.035 (n 884); C T10YIE:lvl -1 +0.026 (n 1076); C T10Y2Y:chg5 +1 +0.025 (n 1007); C DFII10:chg5 -1 +0.024 (n 1094); C DFII10:chg1 -1 +0.023 (n 1033)
