# Stacking H1 trend state and spread conditions on the rich-IV break rule — results

Pre-registration: forge/STACK_RICHIV_TREND_PREREG.md (bee95be). Rich-IV break trades; R = mean of the four stop/target cells unless stated. Net of spread.

## FX + gold

| group | trades | net R | 2016–22 | 2023–26 | shorts |
|---|---|---|---|---|---|
| all rich-IV breaks (base) | 5,591 | +0.119 | +0.099 | +0.161 | +0.084 |
| H1: counter-trend break | 670 | +0.301 | +0.017 | +0.864 | +0.321 |
| H1: with-trend break | 3,162 | +0.162 | +0.238 | -0.002 | +0.120 |
| H1: neutral | 1,759 | -0.029 | -0.126 | +0.171 | -0.087 |
| H4: counter-trend break | 1,598 | +0.102 | -0.121 | +0.535 | +0.169 |
| H4: with-trend break | 2,344 | +0.108 | +0.178 | -0.049 | +0.029 |
| spread conditions: 0.2σ stops, signal ≥ 02:00 | 4,942 | +0.105 | +0.126 | +0.060 | +0.066 |
| both: H1 counter × spread conditions | 481 | +0.031 | +0.063 | -0.038 | +0.146 |

## Indices

| group | trades | net R | 2016–22 | 2023–26 | shorts |
|---|---|---|---|---|---|
| all rich-IV breaks (base) | 1,142 | +0.070 | +0.080 | +0.054 | +0.059 |
| H1: counter-trend break | 199 | +0.624 | +0.604 | +0.654 | +1.136 |
| H1: with-trend break | 616 | -0.036 | -0.057 | -0.009 | -0.193 |
| H1: neutral | 327 | -0.067 | +0.019 | -0.288 | +0.409 |
| H4: counter-trend break | 332 | +0.176 | +0.132 | +0.259 | +0.520 |
| H4: with-trend break | 422 | -0.112 | +0.085 | -0.394 | -0.011 |
| spread conditions: 0.2σ stops, signal ≥ 02:00 | 1,020 | +0.074 | +0.153 | -0.044 | +0.068 |
| both: H1 counter × spread conditions | 170 | +0.580 | +0.473 | +0.706 | +0.368 |

BH 10% over 6 H1 rows: 3 survive.

**Test 1 (trend stack): FAIL** · **Test 2 (spread conditions): FAIL** · **Test 3 (both): not applicable**

## Post-hoc audit of the counter-trend cells (not pre-registered)
| | FX + gold | Indices |
|---|---|---|
| trades / instrument-days | 670 / 288 | 199 / 84 |
| mean R, median R | +0.301, −1.07 | +0.624, −1.03 |
| day-clustered 95% CI | [+0.007, +0.597] | [+0.007, +1.305] |
| share of total from the best 5% of trades | **123%** (without them −0.074) | 60% (without them +0.263) |
| by year | 2024 alone +2.21R/trade (n=87) carries it; 2018 −0.49, 2021 −0.58, 2023 −0.37 | 2019 −1.07, 2022 −0.74; all four instruments positive (DOW +0.25 … US2000 +1.12) |
| longs / shorts | +0.28 / +0.32 | +0.44 / **+1.14** (n=53) |

## Reading
- **By the pre-registered rule: FAIL.** FX/gold's counter-trend group did not beat the base in 2016–22 (+0.017 vs +0.099), and
  its whole result is five percent of its trades, mostly from 2024. Spread conditions (0.2σ stops, signals from 02:00) do not
  improve the base either (+0.105 vs +0.119 FX; +0.074 vs +0.070 indices).
- **The index cell is the strongest single number in this research**: +0.624R, positive in both halves, positive on every one of
  the four indices, shorts +1.14R (so not long drift), and still +0.263R without its best 5%. But it rests on 199 trades across
  84 instrument-days and its CI lower bound is +0.007R. That is a lead, not a rule.
- **Action taken:** the paper record now logs the H1 trend state on every signal (a recorded field, not a filter), so the forward
  data decides whether "break against the H1 trend on a rich-vol day" is real. Nothing in the live rule changes.
