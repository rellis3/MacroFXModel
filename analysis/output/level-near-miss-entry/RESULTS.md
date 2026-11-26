# level-near-miss-entry: results

**Setup**
- Prereg: `forge/LEVEL_NEAR_MISS_ENTRY_PREREG.md` (5751d129). Scripts: `scripts/level-near-miss-entry/{build,score,ar1}.py`. Seed 20261125.
- 25 NT8 futures, net of 2.5 ticks, 2020-01-02 → 2026-08-21.
- 645k line approach episodes (plus placebo) and 2.1M pre-touch states.
- Train 2020–22, validation 2023, test 2024 → 2026-08-21 (scored once).
- Levels: High/Low, Close±, HL projections; Median / P75 / P90.

**Files**
- Near misses: `nearmiss_*.csv`.
- First passage: `fpt_*.csv`.
- Brownian bridge: `bridge_reliability.csv`.
- OU: `ar1_ou.csv`. Drift toward the level: `drift_toward_level_*.csv`.
- Competing risks: `hazard_*.csv`, `cif_touch_retreat.csv`.
- Calibration: `calibration_*.csv`.
- Execution methods: `methods_test*.csv`.

## Verdicts

| Test | Result | BH q | Verdict |
|---|---|---|---|
| **P1** price turns before real lines more than placebo (P(retreat) after coming within 0.10 W) | line 15.9% vs placebo 15.8%, **+0.14 pp [−0.05, +0.32]**, halves +0.18 / +0.11 | 0.56 | **NULL** |
| **P2** probability entry (D) beats touch entry (A), test net R | D −0.032R [−0.048, −0.017] vs A −0.184R; D − A +0.152 [+0.131, +0.174]; **D itself < 0** | < 0.01 | **UNDERPOWERED** by the gate → **NULL** by A1 (post-hoc: the gap is cost selection) |
| **P3** fixed proximity (B 15% W, chosen on 2023) − A | +0.001R [−0.010, +0.011] | 0.89 | **NULL** |
| **P4** vol-adjusted proximity (C 0.75 σ_rem30, chosen on 2023) − A | +0.002R [−0.007, +0.010] | 0.89 | **NULL** |
| **P5** confirmation: E − D | −0.002R [−0.012, +0.008] | 0.89 | **NULL** |

## 1. Near misses

- An approach that gets within 0.25 W of a line ends in:
  - a touch about 25–30% of the time;
  - a retreat (near miss) 52–54%;
  - neither 16–23%.
- The placebo is the same at every tier (Median 24.7 / 52.2 / 23.0% vs placebo 24.4 / 52.1 / 23.5%).
- **Price does not turn before our levels more often than before levels placed nowhere special.**
- 12% of near misses come within 0.10 W of the line. Only **4.4%** come within 2 ticks, which is the feed-ambiguous share.
- At the 0.10 W state, approaches that go on to touch and ones that turn look almost the same:

| | Z distance | 15-min velocity | VWAP deviation |
|---|---|---|---|
| Went on to touch | 0.63 | 2.40 | 0.59 |
| Turned (near miss) | 0.68 | 2.45 | 0.60 |

  Only the "neither" group stands out: slower and further away.
- **Distance scale** (test AUC for reaching the line within 30 minutes):

| Distance measure | AUC |
|---|---|
| Z (÷ σ_remaining) | **0.738** |
| % of forecast range | 0.716 |
| raw ticks | 0.590 |

- Normalised distance is far better than raw points.
- For predicting a retreat, % of range does better (0.696 vs Z 0.613).

## 2. First passage (driftless Brownian vs observed, test)

| Horizon | Brownian μ = 0, predicted | Observed | Brier (BM / base rate) | AUC |
|---|---|---|---|---|
| 5 min | 5.8% | 12.0% | 0.090 / 0.106 | 0.81 |
| 15 min | 14.7% | 23.3% | 0.154 / 0.179 | 0.77 |
| 30 min | 24.3% | 32.5% | 0.190 / 0.219 | 0.74 |
| 60 min | 36.5% | 42.4% | 0.214 / 0.244 | 0.72 |

- The driftless Brownian ranks well (AUC 0.72–0.81) and beats the base rate on Brier. It **under-predicts** the level being reached by 6–9 pp, because price that is approaching has momentum and fat tails.
- Carrying the 30-minute drift forward **over-predicts** badly (64% vs 32% at 30 minutes). Momentum into a level fades fast.
- A logistic "reach" model does best: Brier 0.173, AUC 0.776 at 30 minutes.

## 3. Brownian bridge (does close-sampled data hide touches?)

- At **1-minute closes**, the bridge predicts 45.7k crossings against 74.5k actual. It misses intraminute spikes at low predicted probabilities (0.05–0.10 bin: predicted 7%, actual 18%) and over-predicts at high ones (actual tops out around 50%).
- At **5-minute closes**, it predicts 131k against 74.7k actual, over-predicting about 1.75×.
- So the bridge is not reliable at our resolution. Close-only checks miss touches, but our touch test uses M1 highs and lows, and only 4.4% of near misses are within 2 ticks. **Data resolution is not creating near misses here.**

## 4. OU vs drift

**Dickey-Fuller fits** (train / test, 1-minute):

| Series | b | t | Half-life | Reading |
|---|---|---|---|---|
| Session price minus the open | −0.00015 / −0.00007 | −2.8 / −1.3 | days | a **random walk** |
| Close minus session VWAP | −0.0034 / −0.0033 | −35 / −32 | **about 3.5 hours** | **stationary** |

- Part of the VWAP-deviation reversion is mechanical: VWAP moves toward price.
- At a 3.5-hour half-life, the pull over a 15–30 minute trade is negligible.
- **Drift toward the level** after a pre-touch state is slightly negative (−0.002 to −0.009 σ_day over 15–30 minutes) across Z, momentum and VWAP-deviation buckets. It is a faint generic pullback, and the **placebo matches it cell for cell**.
- OU on outright price is rejected. OU on the VWAP deviation fits but is too slow to matter. Neither depends on our levels.

## 5. Competing risks

- **The touch hazard per minute** rises steeply as price gets closer:
  - Z < 0.25: 17.5%;
  - Z 0.25–0.5: 2.7%;
  - Z 0.5–0.75: 0.6%;
  - Z > 1.5: under 0.02%.
- **The retreat hazard** is about 0.04% near the line and about 2% far away.
- **Momentum** (the 15-minute move into the level) multiplies the touch hazard about 47× from slow to fast.
- **Time of day:** the 13–16 NY overlap has the highest touch and retreat hazards (CIF at 60 minutes: touch 30%, retreat 52%, neither 7%). After 16:00 is the slowest (17 / 40 / 30%).
- **Elapsed time:** the touch hazard is flat (about 0.5% per minute for 60 minutes), and the retreat hazard falls after 30 minutes.
- **The placebo hazards match the line in every bucket.**

## 6–9. Execution methods (test 2024–26, net, one trade per episode)

| Method | Trades | Win | Net R / trade [90% CI] | PF | Recovered (no touch, win) | False entries (touched, ran through, lost) | Hold (median, min) |
|---|---|---|---|---|---|---|---|
| A touch fade | 77,204 | 46.9% | −0.184 [−0.199, −0.170] | 0.67 | 6,593 | 28,432 | 22 |
| A touch follow | 77,204 | 49.5% | −0.130 [−0.145, −0.116] | 0.75 | — | — | 22 |
| B 5 / 10 / 15 / 20% W | 81k–174k | 46.0–46.5% | −0.180 to −0.184 | 0.66 | 14k–78k | 29k–32k | 26–38 |
| C 0.25–1.0 σ_rem30 | 73k–109k | 46.7–46.8% | −0.182 to −0.184 | 0.67 | 8k–38k | 29k–30k | 24–28 |
| D probability (logit, θ = 0) | 31,934 | 50.0% | −0.032 [−0.048, −0.017] | 0.93 | 8,106 | 3,131 | 25 |
| E D + confirmation | 30,210 | 49.8% | −0.034 [−0.049, −0.020] | 0.93 | 8,098 | 2,421 | 27 |

- **Recovered opportunities don't pay for themselves.** Proximity entries add winners in episodes that never touch (up to 78k at 20% W), plus the same number of losers. Net R per trade is unchanged.
- **D's model has no skill at picking winning trades.** Test AUC is 0.505 for the fade win and 0.512 for the follow win. Brier is 0.2504 against a base rate of 0.2500, so the model is calibrated to the base rate and no better.
- Logistic and gradient boosting are tied on validation log loss (0.6940 vs 0.6940), so the more complex model isn't justified.
- The reach, retreat and through-the-level probabilities **are** predictable:

| Outcome | Test AUC | Brier | Base-rate Brier |
|---|---|---|---|
| Reach within 30 min | 0.78 | 0.173 | 0.219 |
| Retreat | 0.73 | 0.166 | 0.190 |
| Continue through | 0.70 | — | — |

  **A predictable path does not mean a predictable profit:** where price goes next (a reach or a turn) can be forecast, but which side of a ±0.25σ bracket wins cannot.

## Amendment A1 — POST-HOC (results seen; demotes only)

D's +0.15R over A is **cost selection, not entry skill.** D's rule (2p − 1 − cost > θ) with p ≈ 0.5 trades only where the cost in R is small, which means NQ, US30, GOLD and US2000.

At matched cost, test, gross:

| Cost per trade | Pre-touch states, fade | Pre-touch states, follow | Touch fade |
|---|---|---|---|
| ≤ 0.03R | +0.003R | −0.004R | −0.039R (touch follow net +0.019R) |
| ≤ 0.10R | +0.000R | −0.001R | −0.016R |

The same cost filter applied to touch entries would close the gap. P2 is demoted to NULL.

## Answers to the owner's final questions

1. **Missed profitable opportunities?**
   - Near misses that would have won exist (8k–78k test-period trades, depending on the proximity), but losers come with them in equal measure.
   - Net, touch-only execution misses nothing.
2. **Are near misses different from touches?**
   - Not at the moment of entry: Z, velocity, VWAP and momentum all look the same.
   - Turns before our lines happen exactly as often as before placebo levels (P1 NULL).
3. **Does first passage predict reaching a level?**
   - Yes, for ranking: driftless Brownian AUC 0.72–0.81. It under-predicts by 6–9 pp.
   - A logistic reach model is better calibrated (Brier 0.173 vs 0.219 base rate).
4. **Can a turn before the level be predicted?**
   - The turn itself, yes: AUC 0.73.
   - Not profitably: after the turn starts, the move is ±0.25σ coin flips.
5. **Is there an optimal probabilistic entry point?** No. Every proximity (5–20% W, 0.25–1 σ_rem) gives the same net R as the touch.
6. **Does normalised distance help?**
   - For predicting reaches, yes (AUC 0.74 vs 0.59 for ticks).
   - For profits, no.
7. **Does probability-driven execution beat exact touch?** Only by avoiding expensive contracts (A1). That is a cost filter, not a better entry.
8. **Which levels and conditions benefit?**
   - None, after placebo and costs.
   - The cheap contracts (NQ, US30, GOLD, US2000) are the only place where costs don't sink a ±0.25σ trade. On them the touch **follow** nets about +0.02R, consistent with the banked momentum pointers.
9. **Is the extra opportunity worth the extra false signals?** No. They cancel.
10. **Should probabilistic entry become an execution method?**
    - No, not as an entry.
    - The **reach and turn probabilities** are good, calibrated context: "how likely price gets to the line in the next 30 minutes". They could be shown on the levels page in shadow.

**Graded weight:**
- Against probabilistic or proximity entry as an edge.
- For first-passage and hazard probabilities as context (well calibrated, and they beat the base rates).
