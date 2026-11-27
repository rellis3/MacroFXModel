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
