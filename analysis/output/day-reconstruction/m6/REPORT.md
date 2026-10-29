# Day reconstruction M6: next-rung reach, p90 outer boundary and touch timing (results)

**Register id:** `day-recon-reach-calibration`. **Prereg:** `forge/DAY_RECON_REACH_CALIBRATION_PREREG.md` (v6), frozen with
`forge/DAY_RECON_PATH_BOOK_DECISION_RULES.md` in `d7ce9e06` before any outcome code existed. **Code:**
`scripts/day-reconstruction/m6_analysis.py` (committed `8cb62869` before the run) and `m6_tables.py`. **Run:** one run,
B = 2000, seed 20261030, 2,878 s. **Full cell-level tables:** `TABLES.md` (every pre-registered cell); raw numbers incl.
per-year reliability and every bootstrap summary: `results.json`.

**Scope.** GOLD, NQ and EURUSD; Fixed OH/OL and Projected H/L separate; M2 archive only; lockbox (after 2026-08-21) not
accessed. M6 makes no claim about fade, continuation or expectancy; those are M7's questions under the frozen rules, which
no M6 result amends.

**Prior exposure.** Test years Y3–Y6 were examined descriptively in M3 and M5, and p90 exceedance was reported in M1. M6
is held out from fitting, not untouched validation.

## 1. Summary

| Question | Pre-registered result | What it supports | What it rules out (95%) | What stays open |
|---|---|---|---|---|
| Q1 Is time-only reach probability calibrated? (A9) | **CITL inconclusive in 6 of 6** cells. Points −1.5 to +1.5pp | The time-only model is close on average: pooled bias points within ±1.5pp | Pooled bias beyond about −5.5 / +4.9pp (widest cell) | ±3pp can't be confirmed at this sample (prereg power note: projected can't be "supported" at all). Year-level bias swings −7.9 to +8.8pp |
| Q2 Does range used add skill? (A8, M1 vs M0) | **No material improvement in 5 of 6**; NQ projected inconclusive. 0 of 6 BH-significant | Fixed levels: range used adds less than 1% log-loss skill on top of time and rung, out of sample, all three instruments | Fixed: gains above +0.10 to +0.59% | Projected: range used is pinned by construction at the touch, so this does **not** show range used is irrelevant there |
| Q3 Does approach add skill? (A8, M2 vs M1) | **Inconclusive in 5 of 6**; NQ fixed no material improvement. 0 of 6 BH-significant | Nothing positive. Points +0.12 to +1.84% | NQ fixed: gain above +0.75% | Gains of 1–3.5% not excluded in the other five cells |
| Q4 Are forecast lines reached differently from placebo lines? (A10) | **0 forecast-specific.** "No difference beyond ±3pp" in 4 of 6 (GOLD, NQ, EURUSD fixed; EURUSD projected, the last not robust to untagged days); **inconclusive** in GOLD and NQ projected | Fixed levels on all three instruments: next-rung reach equals placebo lines after the curvature-corrected adjustment | Fixed: differences beyond about ±1.3 to ±2.2pp. EURUSD projected: beyond −2.0 / +2.6pp | GOLD projected up to +3.2pp and NQ projected down to −4.0pp not excluded |
| Q5 Is p90 a 10% boundary? (B1) | **Consistent with 10% ±3pp in 9 of 9** referenced events. Robust to untagged days | Each p90 event happens about 8.6–10.7% of days, as promised | Rates outside about 7.2–12.1% | — |
| Q5 overshoot (B2–B6) | Descriptive | Once p90 is reached, price goes on past it by a median 0.37–0.53σ; 58–67% of touches extend ≥ 0.25σ; 14–22% stay within 0.10σ | — | Touch-time effect on overshoot mostly reflects time remaining; the 120-minute horizon shrinks it. Forecast-vs-placebo containment: mixed signs, descriptive only |
| Q6 When are levels first reached? (C) | Descriptive | Forecast and placebo lines are first reached at the same clock times: median differences within ±0.5 h, window-share differences mostly within ±2pp (largest −3.7pp at p50/p75) | — | Strong year-to-year shifts (GOLD fixed p50 median 11:01–12:30 in Y1–Y4, 08:13 and 06:59 in Y5–Y6) |

**Overall.** M6 supports the M1–M5 picture with tighter bounds. The forecast ladder works as a **distance ruler**: p90 is
exceeded about 10% of the time, a time-only model gets next-rung reach right on average, and on fixed levels the forecast
lines are reached no differently from placebo lines (differences larger than about 1.3–2.2pp are ruled out). Range used
adds nothing material for fixed levels. Approach adds nothing demonstrable. No forecast-specific reach behaviour was
found anywhere. Projected-level cells are underpowered on Q1 and partly on Q4.

## 2. Part A: next-rung reach from p50 and p75

**Sample.** Test Y3–Y6 first touches after M5's exclusions: GOLD 1,603 fixed / 899 projected; NQ 1,524 / 886; EURUSD
1,458 / 754 (identical to the counts frozen from features before the run). Exclusions (A11): 13–26 next-rung-same-minute
touches per instrument × family in the point-in-time era; no other exclusion in that era. Full counts in `TABLES.md` §A11.

### A8. Q2 and Q3: out-of-sample skill (12 comparisons, BH q < 0.10)

| Cell | M1 vs M0 (range used): log-loss skill % [95%], class | M2 vs M1 (approach): skill % [95%], class |
|---|---|---|
| GOLD fixed | +0.06 [−0.69, +0.42], No material improvement | +0.48 [−0.29, +1.09], Inconclusive* |
| GOLD projected | −0.27 [−2.28, +0.32], No material improvement | +1.35 [−0.53, +2.87], Inconclusive |
| NQ fixed | −0.05 [−1.05, +0.59], No material improvement* | +0.12 [−0.87, +0.75], No material improvement |
| NQ projected | +0.59 [−0.99, +1.75], Inconclusive | +1.84 [−0.16, +3.45], Inconclusive |
| EURUSD fixed | −0.16 [−1.12, +0.10], No material improvement | +1.11 [−0.10, +2.22], Inconclusive |
| EURUSD projected | −0.95 [−3.54, −0.01], No material improvement | +0.98 [−1.52, +3.02], Inconclusive |

- 0 of 12 BH-significant (smallest raw p 0.049, EURUSD projected range used, a **negative** skill; next 0.071, NQ
  projected approach). Brier skill agrees in sign everywhere.
- The block bootstrap gave the same class in all 12 cells.
- \* **Not robust to untagged days:** GOLD fixed approach becomes "no material improvement", and NQ fixed range used
  becomes "inconclusive".
- 2016–20 sign check (`TABLES.md`): range-used skill is −1.22 to +0.82%, approach skill −0.57 to +2.32%. Same picture.
- "No material improvement" means the out-of-sample gain is shown to be below 1%. It does not mean range used has no
  relationship with reach: it is mostly already carried by touch time and rung.
- Projected: range used sits in a narrow band at a projected touch (by construction), so those three cells can't speak to
  whether range used matters there.

### A9. Q1: calibration

| Cell | Working model | CITL pp [95%] | Class | Slope [95%] | ECE pp (noise mean / p95) | AUC |
|---|---|---|---|---|---|---|
| GOLD fixed | M0 | +0.4 [−2.4, +3.2] | inconclusive | 0.90 [0.69, 1.10] | 1.4 (2.1 / 3.4) | 0.653 |
| GOLD projected | M0 | +1.4 [−2.2, +4.9] | inconclusive | 0.88 [0.62, 1.13] | 3.2 (2.8 / 4.5) | 0.679 |
| NQ fixed | M0 | +0.4 [−2.2, +3.2] | inconclusive | 1.00 [0.77, 1.22] | 1.3 (2.2 / 3.4) | 0.662 |
| NQ projected | M0 | +0.1 [−3.4, +3.7] | inconclusive | 0.84 [0.61, 1.06] | **5.7** (2.7 / 4.5) | 0.706 |
| EURUSD fixed | M0 | +1.5 [−1.1, +4.3] | inconclusive | **0.79 [0.58, 0.97]** | 2.9 (2.2 / 3.5) | 0.638 |
| EURUSD projected | M0 | −1.5 [−5.5, +2.3] | inconclusive | **0.70 [0.47, 0.94]** | 4.7 (3.0 / 4.9) | 0.666 |

- No cell "Improves", so the working model is M0 (rung, time left, their interaction) everywhere.
- **CITL is inconclusive in all six**: the point bias is small (−1.5 to +1.5pp), but every interval reaches slightly past
  ±3pp. Block bootstrap and untagged-day sensitivity give the same class. As the prereg's power note said, fixed cells
  could be "supported" only with CITL near 0 and low same-day dependence; projected cells couldn't be "supported" at all.
- **Departures (diagnostic):** the slope interval excludes 1 for EURUSD fixed and projected. Predictions there are too
  spread out: high predictions too high (fixed top quintile 64.3% predicted vs 58.6% observed) and low ones too low.
  NQ projected's ECE (5.7pp) is above its noise p95 (4.5pp); its reliability table is non-monotone in the middle bins.
- **By test year the bias is not stable.** Several single-year intervals exclude 0: GOLD fixed Y6 +6.0 [+1.0, +11.3];
  NQ fixed Y4 −7.9 [−13.3, −2.3] and Y6 +5.8 [+0.6, +11.0]; GOLD projected Y5 +8.8 [+2.1, +15.7]. The pooled
  near-zero bias averages over year-level swings of about ±6–9pp.
- By side: NQ fixed down-touches +3.9 [+0.4, +7.5], up-touches −3.3 [−6.8, +0.2]; others within intervals spanning 0.

**Q1 answer: M0's predicted next-rung reach by London clock time** (fit on Y1–Y5), %:

| Cell | Rung | 08:00 | 12:00 | 16:00 | 20:00 |
|---|---|---|---|---|---|
| GOLD fixed | p50 / p75 | 59 / 54 | 50 / 45 | 35 / 33 | 13 / 14 |
| GOLD projected | p50 / p75 | 67 / 67 | 57 / 53 | 41 / 32 | 14 / 7 |
| NQ fixed | p50 / p75 | 66 / 61 | 58 / 53 | 47 / 40 | 24 / 19 |
| NQ projected | p50 / p75 | 71 / 70 | 62 / 61 | 48 / 46 | 20 / 18 |
| EURUSD fixed | p50 / p75 | 59 / 54 | 49 / 44 | 34 / 29 | 12 / 9 |
| EURUSD projected | p50 / p75 | 68 / 69 | 57 / 56 | 39 / 37 | 12 / 9 |

Intervals are in `TABLES.md`; early projected values are wide, since few projected touches come before 08:00.

### A10. Q4: forecast vs placebo (6 cells, second BH family)

| Cell | n forecast | Observed % | G predicted % | Δ_adj pp [95%] | p | Class | Ruled out |
|---|---|---|---|---|---|---|---|
| GOLD fixed | 1,603 | 47.4 | 47.5 | +0.0 [−1.3, +1.3] | 0.98 | No difference beyond ±3pp | beyond ±1.3pp |
| GOLD projected | 899 | 43.5 | 42.6 | +0.7 [−1.7, +3.2] | 0.57 | Inconclusive | below −1.7 or above +3.2pp |
| NQ fixed | 1,524 | 46.6 | 46.4 | −0.7 [−2.2, +0.6] | 0.27 | No difference beyond ±3pp | below −2.2 or above +0.6pp |
| NQ projected | 886 | 40.6 | 42.1 | −1.6 [−4.0, +0.7] | 0.16 | Inconclusive | below −4.0 or above +0.7pp |
| EURUSD fixed | 1,458 | 44.1 | 46.2 | −0.6 [−2.1, +0.8] | 0.35 | No difference beyond ±3pp | below −2.1 or above +0.8pp |
| EURUSD projected | 754 | 44.7 | 44.7 | +0.2 [−2.0, +2.6] | 0.84 | No difference beyond ±3pp (**not robust**: inconclusive with untagged days excluded) | below −2.0 or above +2.6pp |

- **Method, as frozen:** G (the M2 terms plus d and d²) is fitted on phantom touches (×0.70/0.85/1.15/1.30) dated before
  each test year. Δ_adj = mean forecast residual − Σ w_f × mean phantom residual, with w = (−1/6, 2/3, 2/3, −1/6). The
  paired date bootstrap refits G in every replicate.
- 0 BH-significant; 2016–20 Δ_adj −0.6 to −0.0pp. Block bootstrap gives the same class in all six.
- Descriptive splits (`TABLES.md`) by rung, side and year mostly span 0. Two single-year intervals exclude 0 (NQ
  projected Y4 −4.7, EURUSD fixed Y5 −3.1); with 48 descriptive intervals, about 2–3 such are expected by chance.

## 3. Part B: p90 as an outer-range boundary (descriptive)

### B1. Boundary frequency (all point-in-time days, 1,548–1,556 per instrument)

| Instrument | Fixed up % | Fixed down % | Projected HL % | Fixed either | Fixed both | ProjH/ProjL p90 touched (either) |
|---|---|---|---|---|---|---|
| GOLD | 10.4 [8.7, 12.0] | 10.7 [9.4, 12.1] | 9.9 [8.2, 11.4] | 20.9 | 0.1 | 10.0 |
| NQ | 10.0 [8.5, 11.6] | 10.0 [8.4, 11.5] | 8.6 [7.2, 10.2] | 19.9 | 0.1 | 8.5 |
| EURUSD | 8.9 [7.6, 10.2] | 9.4 [8.1, 11.0] | 10.2 [8.8, 11.5] | 18.4 | 0.0 | 10.2 |

- All nine referenced events: **consistent with 10% ±3pp** (block interval), the same with untagged days excluded.
- Halves (Y1–Y3, Y4–Y6) and 2016–20 lie between 8.1% and 11.5%.
- NQ projected HL is the lowest (8.6%); its interval still sits within 7–13%.

### B2–B3. Overshoot beyond p90 (σ = open × σ_used)

- **Unconditional (every day × side, zeros included).** p90 isn't reached on 89.5–90.8% of fixed day-sides and
  94.8–95.3% of projected. P(O_day ≥ 0.25σ) is 6.2–6.8% fixed and 3.0–3.5% projected. P(O_day ≥ 1σ) is 1.7–2.2% fixed and
  1.0–1.3% projected. Mean O_day is 0.054–0.070σ fixed and 0.031–0.039σ projected.
- **Conditional (once p90 is first touched), sides pooled:**

| Cell | n | Median σ | 90th pct σ | Contained < 0.10σ | Extended ≥ 0.25σ | Reaches a further p90−p75 step (B3) |
|---|---|---|---|---|---|---|
| GOLD fixed | 326 | 0.38 [0.32, 0.45] | 1.50 | 14.1% | 65.0% | 37.4% |
| GOLD projected | 162 | 0.45 [0.32, 0.58] | 1.80 | 18.5% | 66.0% | 38.3% |
| NQ fixed | 310 | 0.37 [0.32, 0.44] | 1.43 | 17.7% | 64.8% | 37.1% |
| NQ projected | 146 | 0.53 [0.36, 0.59] | 1.69 | 14.4% | 65.8% | 39.0% |
| EURUSD fixed | 286 | 0.37 [0.33, 0.43] | 1.34 | 15.0% | 67.1% | 36.7% |
| EURUSD projected | 161 | 0.40 [0.24, 0.55] | 1.42 | 21.7% | 58.4% | 47.2% |

- Down-side overshoot is larger than up-side on GOLD and NQ (GOLD fixed OL median 0.45 vs OH 0.33σ; 90th pct 2.01 vs
  1.22σ). Per-side intervals are in `TABLES.md`.
- **Reading:** p90 is a good *frequency* boundary (about 10% of days), but on the days it is reached it isn't a
  ceiling: about two thirds go on at least 0.25σ further.

### B4. By touch time (early = more time left than the median p90 touch)

- **To 22:00 (O):** early touches extend more in every cell, by +12 to +38pp, with all intervals above 0.
- **Common 120-minute horizon (O₁₂₀):** the gap shrinks to +6 to +23pp, and the interval stays above 0 only for GOLD
  projected +20.1 [+4.4, +37.1], NQ fixed +13.3 [+0.4, +26.6] and EURUSD fixed +22.9 [+12.7, +32.3].
- So most of the time-of-touch effect is time remaining. Some may be behaviour, but it is not separable at these sizes.

### B5. By range used (fixed only)

- The low-u vs high-u split shows no difference in P(extended), P(contained) or median O on any instrument, for either O
  or O₁₂₀. All intervals span 0 except NQ's O₁₂₀ median, −0.12σ [−0.19, −0.01].
- Projected p90 is not estimable: u is pinned (GOLD 1.66–1.77, NQ 1.70–1.90, EURUSD 1.53–1.64, central 80%).

### B6. Forecast p90 vs B2-weighted phantom p90 (descriptive, no classification)

- 24 differences: contained and extended × two horizons × six cells. Six intervals exclude 0, with **mixed signs**:
  - NQ fixed: extended **+7.2** (full) and +9.0 (120 min);
  - EURUSD fixed: contained −6.7 and extended +9.1 (full);
  - EURUSD projected: contained **+8.5** (full);
  - NQ projected: contained +9.8 (120 min).
- Under the prereg no claim of forecast-specific boundary behaviour is made from a containment difference alone. These
  are uncorrected, and opposite in sign between fixed and projected.

## 4. Part C: when levels are first reached (descriptive)

- **Forecast vs placebo.** Median first-touch clock times differ from the B2 reference by at most 0.46 h (GOLD fixed p50
  OH). For sides pooled, all are within ±0.31 h. Window-share differences for p50/p75 sides-pooled cells are mostly within ±2pp; the largest is −3.7pp (GOLD projected p75, 17:00–22:00).
  A few intervals exclude 0 among the many shown; the largest is EURUSD projected p90, 08:00–13:30, at −5.0pp. Timing
  carries no forecast-specific signal.
- **Typical timing** (point-in-time, sides pooled, medians):
  - fixed p50: GOLD 10:10, NQ 14:27, EURUSD 11:06;
  - fixed p75: 13:34 / 15:21 / 13:45;
  - fixed p90: 14:47 / 16:38 / 15:00;
  - projected levels are reached later (p50: 14:31 / 15:56 / 14:25).

  NQ is reached latest: 15% of NQ fixed p50 touches before 08:00, vs 36% for GOLD.
- **Year-to-year.** GOLD fixed p50 moved from medians of 11:01–12:30 (Y1–Y4) to 08:13 (Y5) and 06:59 (Y6), with 48–54% of
  touches before 08:00 in those years. NQ projected p75 medians range 15:29–18:54 across years. The pooled timing is an
  average over shifting regimes, not a fixed clock.
- **2016–20:** full tables in `results.json` (`C` keys with `2016_20`).

## 5. Checks against the frozen specification

| Item | Frozen spec | As implemented |
|---|---|---|
| Bootstrap | B = 2000, seed 20261030, one Poisson(1) weight per calendar date shared by every touch that date, forecast and phantom | Yes. One weight matrix over the union of calendar dates, shared across forecast, all phantom factors and both families |
| Refit per replicate | All walk-forward models and G | Yes: M0, M1, M2 and G are refitted for every replicate (vectorised Newton, ridge 1e-6 × n, intercept unpenalised) |
| Intervals and p | 95% percentile; p = 2 × min(share ≤ 0, share ≥ 0), floor 1/B | Yes |
| A8 classes | BH q < 0.10 over 12; Improves = BH and skill ≥ 1%; NMI = upper bound < 1% | Yes; block bootstrap run, wider interval decides on disagreement (no disagreements occurred) |
| A9 | Working model rule; CITL ±3pp classes; slope diagnostic only | Yes |
| A10 | G on placebo before Y; Δ_adj with B2 weights; BH within 6; forecast-specific needs BH, \|Δ\| ≥ 3pp, 2016–20 sign | Yes |
| A12 | Untagged excluded; side; year; 2016–20; NQ caveat | Yes, except A8 skill by side (see deviations) |
| B1 | Block bootstrap 7–13% classes, iid shown | Yes |
| B2–B6, C | As specified | Yes |

**Deviations, implementation choices and limitations** (none changes a classification rule):
1. **Smoke test.** Before the real run the script was executed once with B = 20 to check that it ran end to end. Only the
   sample counts were read (they matched the frozen counts exactly); the output was deleted unread. The analysis code
   was committed before the real run and not changed afterwards.
2. **Winsorisation bounds** are the unweighted 1st/99th percentiles of each training window, held fixed across bootstrap
   replicates. The prereg says "training window's 1st/99th percentiles" without specifying per-replicate re-estimation.
3. **Block bootstrap** blocks are drawn on the union calendar of the three instruments' sessions (2016-03 to 2026-08), so
   a block can straddle the 2020-08-21 era boundary. Per-era results use the weights of the dates inside the era.
4. **2016–20 sign checks** use a walk-forward inside that era: years from each 21 August, test years S2–S4, with S1 also
   holding 2016-03-29 → 2016-08-20.
5. **Q1 clock predictions** come from the last walk-forward M0 fit (trained on Y1–Y5). Minutes to the session end use the
   median last bar (21:59).
6. **B1's iid interval** is the normal approximation. It goes slightly below 0 for the rare "fixed both" event, which is
   unclassified.
7. **Quantile references** (B6 is shares only; C medians) are the B2 combination of each phantom factor's quantile.
8. **Part C's "pooled sides"** counts day × side units, so "touched" can exceed the number of days.
9. **O₁₂₀** uses bars k … k+119 as written; across a data gap this spans slightly more than 120 minutes.
10. **Not computed:** A8 skill by side (A12 lists "by side"; CITL and Δ_adj by side are reported). Per-year reliability
    tables are in `results.json` only.
11. **R2 gap rule and R3 cost hurdle (decision-rules file)** are M7 rules. M6 runs no reference race and values nothing at a
    reference price, so no gap counts or hurdle apply to M6. The gap counts and gap-size reporting, and the hurdle as a
    materiality bar for a behavioural statistic (not a trading-cost model), carry into M7 unchanged.
12. **Untagged days** (about 33% of test touches) change three classifications: GOLD fixed approach, NQ fixed range used and
    EURUSD projected Δ_adj. Each is flagged "not robust to untagged days" above.
13. **NQ research levels** sit about 2% inside production (M1 caveat); not adjusted.

## 6. What M6 can and cannot establish

**Establishes, within these bounds:**
- the p90 rungs deliver their promised ~10% exceedance on all three instruments;
- on average, a time-only model of next-rung reach is close (pooled bias within ±1.5pp), though not demonstrably within ±3pp;
- for fixed levels, range used adds under 1% out-of-sample skill;
- next-rung reach at fixed forecast levels is the same as at placebo lines: differences beyond about ±1.3–2.2pp are
  excluded;
- first-touch timing is the same at forecast and placebo lines.

**Rules out:** forecast-specific next-rung reach differences larger than 1.3pp (GOLD fixed), 2.2pp (NQ and EURUSD fixed)
and about 2.6pp (EURUSD projected, not robust); range-used skill gains above about 0.1–0.6% on fixed levels.

**Remains uncertain (underpowered):**
- approach skill of 1–3.5% in five cells;
- calibration within ±3pp in all cells;
- projected-level forecast-specific reach for GOLD (up to +3.2pp) and NQ (down to −4.0pp);
- year-to-year calibration drift.

**Cannot establish:**
- direction, fade or continuation, or expectancy (M7);
- anything about forecast-specific information being absent in general;
- untouched validation (test years were seen descriptively in M3 and M5);
- the effect of range used at projected levels (pinned by construction).

**Bearing on M7 (no rule amended):** the frozen decision rules stand. M6 found nothing that makes the forecast lines
behave differently from placebo lines in reach or timing. That fits the prior art (P5, P9, P15), where next-level reach
and touch timing don't distinguish forecast from comparable lines. Whether to proceed to M7 under the existing rules is
for the owner's review.
