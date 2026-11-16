# rule-a-teardown: results (EXPLORATORY, not pre-registered)

- **Register row:** `rule-a-teardown` (EXPLORATORY). Every year used here has been seen before, so nothing below is a verdict beyond **CONTEXT**. Anything that looks useful goes to the forward record, never to money.
- **Run:** 2026-11-15, seed 20261115, date bootstrap B = 2000.
- **Scripts:**
  - `scripts/rule-a-teardown/build.py` rebuilds every break on every day, rich or not, for 2020-08-24 → 2026-08-20.
  - `scripts/rule-a-teardown/analyse.py` decomposes them.
- **Data:**
  - 2016-20 uses the frozen backcast breaks from `rule-a-pre2020`.
  - The lockbox is untouched.
- **Unit:** net R per trade at 0.2σ / 5R, with 2× the spread table, the same in every era.
- **Parity:** the rebuild's rich subset matches the locked Rule A record on 2,057 of 2,057 trades.

## The short version
1. **How rich implied vol is (IV ÷ RV) is the part that carries Rule A, and it is a gradient, not a switch.**
   - Net R per trade rises with the ratio relative to the rule's threshold. FX + gold, 2016-26:

     | Ratio vs threshold | Net R per trade | Trades |
     |---|---|---|
     | < 1.00 | −0.13 | 4,829 |
     | 1.00–1.15 | +0.02 | 1,726 |
     | 1.15–1.35 | +0.14 | 964 |
     | > 1.35 | +0.28 | 439 |

   - Breaks above 1.15× the threshold are positive in 9 of 11 years. The exceptions are 2017 and 2023.
   - Breaks in the band from 1.00× to 1.15× (just over the line) are about zero, and they make up half of Rule A's trades.
2. **Direction is real, not just a volatility payoff.**
   - The mirror trade (same minute, same risk, opposite way) is about zero in every richness band: −0.01 to +0.01R gross.
   - The break itself makes +0.15 to +0.41R gross on rich days and 0.00 on non-rich days.
3. **Rich days beat non-rich days in all three eras:** by +0.11R in 2016-20, +0.27R in 2020-22 and +0.25R in 2023-26.
   - What changes between eras is the level, not the gap.
   - Non-rich breaks lose in every era (−0.03 to −0.15R).
4. **The 2016-20 failure is mostly gold and the US large-cap indices.**
   - Gold lost −0.33R on 289 trades, SPX500 −0.31R and US30 −0.11R.
   - FX ex-gold was mildly positive.
   - The indices stay weak at every richness level except NQ (small n).
5. **The runner pays.**
   - At 2R the edge is about zero (+0.04 / −0.01).
   - At 5R and 10R it is positive.
   - A wider stop keeps it: 0.6σ / 5R gives +0.19R at 1.15–1.35× and +0.15R above 1.35×.
6. **There is no regime switch.**
   - A trailing 60-session market "trend-day" measure doesn't sort the trades consistently. It favours trendy markets in 2023-26 and the opposite in 2020-22.
   - Rule A's own trailing 100-trade record doesn't sort them either: +0.13 vs +0.04, with overlapping intervals.
   - Same-day trendiness correlates 0.40 with the trade, but that isn't knowable in advance.
7. **2023-26 is thinner because of what it was dealt, not because the parts broke.**
   - It had fewer very rich days.
   - Its profit is more concentrated: the top 10 trades are 46% of profit, against 22% in 2020-22.
   - The stop rate (71%) and the 5R hit rate (12–16%) are the same as before.

## Key tables
**Rich vs non-rich by era (net R per trade, 95% CI):**

| Era | Rich | Non-rich |
|---|---|---|
| 2016-20 (backcast) | −0.04 [−0.19, +0.12], n 1,386 | −0.15 [−0.26, −0.04], n 2,356 |
| 2020-22 | +0.24 [+0.03, +0.46], n 922 | −0.03 [−0.18, +0.13], n 1,744 |
| 2023-26 | +0.10 [−0.09, +0.28], n 1,135 | −0.15 [−0.26, −0.05], n 2,497 |

**Breaks above 1.15× the threshold, by year (net R per trade, n):**

| Year | Net R | n |
|---|---|---|
| 2016 | +0.17 | 63 |
| 2017 | −0.40 | 141 |
| 2018 | +0.06 | 201 |
| 2019 | +0.12 | 199 |
| 2020 | +0.32 | 328 |
| 2021 | +0.09 | 139 |
| 2022 | +0.59 | 155 |
| 2023 | −0.05 | 92 |
| 2024 | +0.30 | 134 |
| 2025 | +0.14 | 152 |
| 2026 | +0.34 | 100 |

**Gross R by richness, 2020-26: the break vs its mirror**

| Ratio vs threshold | Break 0.2σ/5R | Mirror | Break 0.6σ/5R (net) |
|---|---|---|---|
| ≤ 1.00 | +0.00 | −0.01 | −0.08 |
| 1.00–1.15 | +0.15 | +0.01 | +0.02 |
| 1.15–1.35 | +0.41 | +0.01 | +0.19 |
| > 1.35 | +0.40 | +0.01 | +0.15 |

## Cautions
- **The bands were chosen after seeing the data.** The 1.15× cut is a reading of this table, not a rule.
- **The ratio is measured differently before and after 2020.** FX before 2020 uses CME CVOL; from 2020 it uses settlement IV. The gradient shows under both measures.
- **Costs are 2× the spread table.** The real bid/ask in `vol-layer-rule-a-confirm` came out slightly worse for 2023-26: +0.08R against +0.10R here.
- **The very rich band has few trades:** 549 over ten years, about 50 a year, with gold and USDJPY over half of them.

## Where it points
1. **A stricter-richness arm for the forward record.** Rule A with the threshold at about 1.15× (FX/gold IV ÷ RV ≥ about 1.36, indices ≥ about 1.76), paper only, beside the existing arm and judged on fresh sessions. This needs its own prereg before any session is scored.
2. **Drop gold and the US large-cap indices (SPX500, US30) as a pre-registered variant.** These are the instruments where the rich condition hasn't carried in any era. The check is the same forward test.
3. **A wide-stop base for the Vol-Layer stage 4.** Rich breaks at 0.6σ / 5R hold +0.15 to +0.19R. That is the kind of base system the stage 3 risk layers were measured for, which Rule A at 0.2σ was not.
4. **Not worth chasing:** regime timing (trend-day or own-momentum switches) and 2R targets.
