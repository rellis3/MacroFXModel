# gold-rolling-mae-window: results (gold)

**Setup**
- Prereg: `forge/GOLD_ROLLING_MAE_WINDOW_PREREG.md` (2b7e2279, amendment A1 pre-results 27ca48b2). Script:
  `scripts/gold-rolling-mae-window/run.py`. Seed 20261127.
- **Lines:** gold's 18 shadow lines (OH, OL, Close+, Close−, HL projection up and down × P50/75/90).
- **Data:** GC M1, 1,659 sessions 2020 → 2026-08-21; 7,199 first touches (4.3 a session). Scored from 2021:
  IS 2021–22, OOS 2023 → 2026-08-21.
- **MAE (Jordan's line-to-line method):** from the touch until the line inside, the next line out (capped there) or
  22:00.
  - Median $3.79. Jordan's own GC median is 33.8 ticks = $3.38, so the measurement matches his.
  - P75 $7.80, P90 $15.08. By year (median): 2021 $2.88 → 2024 $2.75 → 2025 $7.35 → 2026 $16.99.

## W: which window (verdict CONTEXT)

Miss = |stop − the next 21 sessions' median MAE| / that median, mean over sessions (per-level: also over the 18 levels).

| Window | Pooled $, IS | Pooled $, OOS | Pooled σ-scaled, OOS | Per-level $, IS | Per-level $, OOS |
|---|---|---|---|---|---|
| 1 day | 57.9% | 61.7% | 62.2% | 79.5% | 84.2% |
| 2 days | 50.3% | 52.6% | 53.3% | 77.5% | 82.0% |
| 1 week | 38.2% | 40.4% | 41.1% | 70.3% | 76.9% |
| 2 weeks | 28.7% | 33.3% | 33.3% | 62.7% | 69.5% |
| 3 weeks | 25.3% | 29.8% | 30.5% | 58.2% | 63.4% |
| 1 month | 23.2% | 27.8% | 28.8% | 55.1% | 59.5% |
| 2 months | 23.0% | **27.7%** | 26.6% | 51.5% | 55.0% |
| 3 months | 21.6% | 28.7% | 25.8% | **49.8%** (IS-chosen) | 54.0% |
| 6 months | 22.3% | 28.4% | 25.1% | 50.8% | **53.9%** |
| 12 months | **20.4%** | 31.8% | **25.0%** | 51.4% | 55.6% |

- **Jordan's question, answered on our lines:** anything from 1 to 6 months is about equally good. 1 day to 1 week is
  noise. This is the same shape as Ken's table.
  - The per-level IS choice (3 months) ranks 2nd of 10 OOS.
  - In $, 12 months lags gold's 2025–26 price jump: OOS 31.8%, worst year 2026.
- **Scaling by the day's forecast σ fixes the lag of the long windows:** 6 to 12 months at 25% OOS, the best of all.
  That is the layer idea: size the stop from the σ, and let the window set only the ratio.
- **Per-level stops miss by about twice as much as one pooled stop** (50–55% vs 25–30%). There are too few touches
  per level type per month for its own median to be stable.
- **Stop today (2026-08-21), pooled, 3 months:** $13.97. Per level (3 months): $3.43–$35.37. The OH/OL/Close
  P50 lines are ≈ $17–25, the HL P50 lines $8–11, and the P75/P90 lines mostly $4–14.

## T: the trade (pre-registered: 3 months, per-level $, BE on)

| | Mean net R [90% CI] | Trades | Total R | Win % | Target / stop / BE / time % |
|---|---|---|---|---|---|
| IS 2021–22 | −0.150 | 2,072 | −311 | | |
| **OOS 2023–26** | **−0.089 [−0.152, −0.041]** | 4,078 | **−362** | 28% | 24 / 47 / 22 / 6 |
| Shuffled-lines placebo (OOS, 100 runs) | mean −0.095, p95 −0.059 | | | | |

**NULL.**
- The real lines are no better than shuffled lines (−0.089 vs −0.095).
- **All 80 arms are negative**, in-sample and out (10 windows × per-level / pooled × BE on / off × $ / σ), from
  −0.067 to −0.216R. Total R is negative in every one. Break-even changes nothing (±0.01R).
- **Why:**
  - With the stop at the median MAE, about half the trades are stopped by construction (47%), and only a quarter reach
    the line inside.
  - Costs ($0.32 a round trip on a median ≈ $4.5 stop) are ≈ 0.07R of the loss. Gross is close to 0, as at every
    line-touch fade before.

## Answer

- **Jordan's jackets question (how much past data sets today's stop):** 1–6 months, ideally scaled by the day's σ.
  On gold's lines, a 6- to 12-month σ-scaled stop tracks next month's MAE best, at about 25% error. CONTEXT: use it
  to size stops.
- **Fading every first touch with that stop doesn't make money:** −0.09R a trade OOS, the same as fake lines. NULL.
- **On Ken's result:** his stops (≈ $23–28) are about twice our median MAE, so his MAE is measured differently
  (perhaps uncapped, or not first touch only). Jordan's "total R is positive" comment refers to Ken's run, not this
  one. On our lines and costs, total R is negative under every window.

## E: Jordan's entry (prereg amendment A2, run after T was seen)

T used a fill at the first touch. The system's real entry is Jordan's arm-then-retest (ForecastBandFade.cs): overshoot by
10% of the stop, a stop order back at the line, cancel at 1.2× the stop, chase to a further line. Arm E reruns the trade
with that entry and the same rolling-MAE stops. Script `scripts/gold-rolling-mae-window/run_entry.py`.

- **Positive control:** restricted to OH/OL P75/P90 with a $7.50 stop and the open as target, the engine reproduces the
  parent's A2 exactly (936 trades, +0.05479R, the same arm/chase/cancel counts). E then keeps the registered stricter
  rule (no target on the fill bar).

| | Mean net R [90% CI] | Trades | Total R | Before costs | PF | Win % | Target / stop / BE / time % |
|---|---|---|---|---|---|---|---|
| IS 2021–22 | −0.026 | | | +0.097 | | | |
| **OOS 2023–26 (3 months, per line, BE on)** | **+0.059 [−0.007, +0.128]** | 2,136 | **+125R** | +0.153 | 1.12 | 32 | 28 / 41 / 24 / 7 |
| Same entry on shuffled lines (100 runs) | median +0.040, p95 +0.084 | | | | | | |
| Ken's reading (any poke, no cancel, no chase), same stop | −0.123 [−0.175, −0.083] | 2,154 | −265R | −0.024 | 0.78 | | |

**UNDERPOWERED.** It fails three gates: the CI touches 0, IS is negative, and it sits below the placebo's p95 (the real
lines rank at the 85th percentile).

- **The entry flips the sign:**
  - **Every one of the 80 E arms is positive OOS** (+0.013 to +0.127R); 24 have a CI above 0. Best: 1-week per-line
    stops, +0.127 [+0.044, +0.213].
  - Fill at first touch: all 80 arms negative.
  - Ken's reading: all 80 arms negative (−0.07 to −0.25R).
  - So the 10% overshoot, the cancel and the chase are what matter.
- **But most of it is the entry, not the lines:**
  - With shuffled (fake) lines, the same entry makes about +0.04R a trade. The real lines add about +0.02R, which isn't
    significant.
  - The arm-then-retest acts as a reversal-confirmation filter wherever it is placed.
- **The gain is concentrated, and IS doesn't agree:**
  - 2023 alone is +108R of the +125R OOS. By year: 2021 −0.07, 2022 +0.02, 2023 +0.20, 2024 +0.03, 2025 +0.03, 2026
    −0.04. OOS without 2023 is about +0.01R.
  - IS 2021–22 is −0.026 (21 of 80 arms IS > 0).
- **Small effects:** per-line stops do slightly better than pooled (+0.075 vs +0.045 mean OOS over arms); BE adds
  +0.01; $ vs σ is about equal.
- **Costs** take ≈ 0.09R a trade; before costs, OOS is +0.15R and IS +0.10R.

**Reading (graded weight):**
- The arm-then-retest entry is a **reusable candidate component**: it beats the first-touch fill and Ken's poke on every
  arm, and is positive even on fake lines. It is not yet a validated system.
- Where the lines sit adds little on top. The rolling-MAE stop is fine as stop sizing.
- Next, in this order:
  1. NQ / EURUSD with the same script (Jordan's three-way comparison).
  2. The target study, because Jordan says the target is the open question.
  3. An entry-only control (the same arm-then-retest at random prices, not the shuffled forecast lines) to measure how
     much the entry alone is worth.

Files: `GOLD/entry_arms.csv` (160 arms: E and K), `entry_results.json`, `entry_equity.csv`, `entry_examples.json` (two per
year, with the M1 path), `entry_report.txt`. The page `gold-rolling-mae.html` shows the equity curve and the examples on
the chart.


## NQ and EURUSD (amendment A3): Jordan's three-way window comparison

The same script, unchanged. Costs 1 tick in, 1 out, 1 commission.

| Pooled $ miss, OOS | 1d | 1w | 2w | 3w | 1m | 2m | 3m | 6m | 12m | Best σ-scaled | IS-chosen (per line), OOS rank |
|---|---|---|---|---|---|---|---|---|---|---|---|
| GOLD | 61.7 | 40.4 | 33.3 | 29.8 | 27.8 | **27.7** | 28.7 | 28.4 | 31.8 | 12m 25.0 | 3m, 2/10 |
| NQ | 79.9 | 40.2 | 29.3 | 24.4 | 22.1 | **21.4** | 22.7 | 28.1 | 37.3 | 1m 22.9 | 3m, 1/10 |
| EURUSD | 52.7 | 32.8 | 24.6 | 22.6 | **22.2** | 22.6 | 22.8 | 24.6 | 28.6 | 12m 17.6 | 6m, 1/10 |

- **All three agree:**
  - 1 day to 1 week is noise;
  - about **1 to 3 months** is best (NQ and gold best at 2 months, EURUSD at 1 month);
  - 12 months lags.
- This matches Ken's table (gold 7 weeks, NAS 7 weeks, EUR 5 weeks), which is the same range.
- Our stops are smaller than Ken's because our MAE is line to line, capped at the next line out. NQ pooled 3-month stop
  today is 50 points, against Ken's 164.
- **T (fill at the first touch) is NULL on both,** as on gold:
  - NQ OOS −0.033 [−0.069, +0.010], fake lines −0.076;
  - EURUSD −0.201 [−0.258, −0.140].
