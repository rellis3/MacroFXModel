# Day reconstruction M6: next-level reach, p90 outer boundary and touch timing (pre-registration)

**Status:** FROZEN 2026-10-29 (v6, owner-approved). Committed with `forge/DAY_RECON_PATH_BOOK_DECISION_RULES.md` before any M6 outcome code existed.

**Register id:** `day-recon-reach-calibration`
**Data:** M2 archive only (`analysis/output/day-reconstruction/ARCHIVE.md`), GOLD, NQ and EURUSD. Nothing after 2026-08-20 exists in it; the lockbox is sealed.
**Commit order:** this file and `forge/DAY_RECON_PATH_BOOK_DECISION_RULES.md` are pushed before any outcome code exists. Then one run.

**Role in the programme:** M6 is supporting evidence for the fade-versus-continuation book: reach probabilities, the p90 boundary and touch timing. It makes no claim about fade or continuation, and none about expectancy. Post-touch path behaviour, forecast-specificity of path behaviour and expectancy are M7's questions, under `forge/DAY_RECON_PATH_BOOK_DECISION_RULES.md`. That file is frozen with this one, and no M6 result may be used to amend it.

### P. Prior art and what it predicts for M6

Results on this ladder (point-in-time production parameters):

| # | Claim | Source |
|---|---|---|
| P1 | The rungs match their promised exceedance out of sample, e.g. OH p90 10.4–11.1%, HL p90 8.8–9.8% (2020-08-21 → 2025-04-07, tagged days) | `analysis/output/day-reconstruction/VALIDATION.md` (calibration table) |
| P2 | After a first touch the next rung is reached about 50% of the time from p50 and about 40% from p75. The median wait is 2–3 h from p50 and 1.5–2 h from p75 | `analysis/output/day-reconstruction/m3/REPORT.md` §2 |
| P3 | Projected levels are first touched later than fixed (median 14:45–16:16 vs 12:56–14:53 London) | m3/REPORT.md §3 |
| P4 | Touch time and range used change absolute probabilities a lot (open revisit about 49% → 11% by range used) but not direction | m3/REPORT.md §4 |
| P5 | Behaviour at forecast levels equals phantom lines: 1 of 378 cells survives Benjamini–Hochberg (BH), and it flips sign 2016–20. The B2 curvature-corrected baseline was introduced there | m3/REPORT.md §1, §5 |
| P6 | Approach path: no forecast-specific effect found (0 of 12, underpowered). Market-wide effects in 5 of 12 change how much happens, not which way | `analysis/output/day-reconstruction/m5/REPORT.md`; `forge/DAY_RECON_APPROACH_PATH_PREREG.md` (RESULTS) |
| P7 | NQ continuation execution: null, equal to phantom and random | `analysis/output/day-reconstruction/m4/REPORT.md` |

Results on **other** line constructions (not the point-in-time production ladder):

| # | Claim | Source |
|---|---|---|
| P8 | Calibrated geometry reach plus time accepted; at 22:00 London, calibration error 5.7 → 0.9pp | `analysis/output/level_p2/RESULTS.md` §1, §3; `forge/LEVEL_P2_PREREG.md` |
| P9 | The level's identity adds no reach information: family dummies give Brier skill −0.01% [−0.03, +0.02], across 13 level families | level_p2/RESULTS.md §2; `plans/LEVEL_REGISTRY_V1.md` |
| P10 | EURUSD reach cells (checkpoint × distance × range used): Brier skill +0.188 [+0.174, +0.200] out of sample; "running extreme exceeded" +0.331 | `analysis/output/rangebook/eurusd_RESULTS.md` |
| P11 | Path variables add no reach skill beyond time × distance × range used | `analysis/output/rangebook/eurusd_SEQUENCE_RESULTS.md` (Question 2) |
| P12 | Approach features predict continuation, Brier +0.046 [+0.031, +0.061], but the trade loses | `analysis/output/rangebook/eurusd_APPROACH_RESULTS.md` §2a |
| P13 | Excursions at the EURUSD export lines: pullback before continuing has median 0.15σ and 90th percentile 0.45σ; overshoot before fading has median 0.14σ and 90th percentile 0.37σ (OH/OL p50, test period) | `analysis/output/rangebook/eurusd_TOUCH_RESULTS.md` |
| P14 | Continued vs faded touches: a combined model has AUC 0.578, identical to line, distances, time, range used and touch number alone. Every decile loses after costs, every year | `analysis/output/rangebook/FINGERPRINT_RESULTS.md` (Combined) |
| P15 | Race after a touch equals placebo lines: Path Map 0 of 314 cells; Live Range 7 of 255 cells, "PATH-NEUTRAL" | `forge/PATH_MAP_SPEC.md`, `analysis/output/path_map_summary.log`; `analysis/output/live_range_history/RESULTS.md` |
| P16 | Slow-arrival "dwell" appears equally at random non-level prices | `MD files/APPROACH_SPEED_CONTROL_TEST.md` |
| P17 | Per-line EURUSD touch tests could detect only about 4.7pp (0.075R) at 80% power | `analysis/output/rangebook/eurusd_AUDIT.md` |

**What this predicts for M6, as hypotheses, not findings:**
- Q1: a time-only model is reasonably calibrated (P8, P10).
- Q2: range used adds skill for fixed levels (P10). For projected levels it is pinned by construction (A8).
- Q3: approach adds little (P6, P11, P14).
- Q4: no forecast-specific reach difference (P5, P9).
- B1: p90 rates near 10% (P1).

M6's new contribution:
- these questions on the point-in-time production ladder, with fixed and projected separated;
- the projected HL p90 event and untagged days, which P1 didn't cover;
- p90 overshoot distributions including zeros;
- touch-time distributions against placebo lines.

### 0. Questions

| # | Question | Part |
|---|---|---|
| Q1 | How likely is the next outward rung to be reached by 22:00 London, given touch time? | A (p50, p75) |
| Q2 | Does range used improve that out of sample? | A |
| Q3 | Does approach add further predictive value? | A |
| Q4 | Are forecast levels reached differently from comparable placebo lines? | A |
| Q5 | Does p90 act as a useful statistical boundary for the day's range? | B |
| Q6 | When are p50/p75/p90 first reached, by instrument, family and year, compared with lines at the same distance? | C (descriptive) |

- GOLD, NQ, EURUSD; Fixed OH/OL and Projected H/L are separate throughout. These are research questions, not trading rules.
- Whether behaviour after a touch depends on its time is answered in Part A (T and the Q1 curve) and B4.
- Post-touch path behaviour is outside M6; it is M7, governed by the decision-rules file.
- **Prior exposure:**
  - test years Y3–Y6 were examined descriptively in M3 and M5;
  - p90 exceedance was reported in M1 (2020-08-21 → 2025-04-07, tagged days);
  - p90 one-more-step and close-back-inside rates were reported in M3.

  So M6 is held out from fitting, not untouched validation.

### Part A: next-rung reach from p50 and p75

**A1. Unit.** The first touch of a p50 or p75 level per day, using M5's touch set and exclusions.

**A2. Event.** `reach = 1` if price trades through the next rung (p50 → p75, p75 → p90) before the session's last bar, from the archive's `next_<level>_min`. That field starts at bar k+1 and counts from the side the touch bar closed on. It is reach, not a race.

**A3. Session end.** Part of the event: no reach by 22:00 is a 0. There is no other censoring. Time remaining is `min_to_end`.

**A4. Variables** (all pre-touch):

| Variable | Definition |
|---|---|
| T | log(1 + `min_to_end`) |
| u | `hl_before` ÷ forecast HL p50 |
| P1 | log(1 + minutes since price was last at or behind the previous reference), M5 definition, continuous |
| P2 | largest approach pullback in σ, M5 definition, continuous |
| d (G only) | distance from the touched level to the next level ÷ `scale` |

- u, P1, P2 and d are winsorised at the training window's 1st/99th percentiles.
- All fits use a ridge of 1e-6 × n.

**A5. Models** (logistic, per instrument × family):

| Model | Terms |
|---|---|
| M0 | rung + T + rung×T |
| M1 | M0 + u + u² |
| M2 | M1 + P1 + P2 |

**A6. Walk-forward.** Y1 = 2020-08-21 → 2021-08-20 … Y6 = 2025-08-21 → 2026-08-20. Test Y3–Y6, each fitted on all earlier years.
- Every fit, bound and placebo model for test year Y uses only touches dated before Y.
- No test-year outcome is used for selection, recalibration or tuning.
- Fitting uses only the point-in-time era; 2016–20 is a sign check.
- Report per test year and pooled.

**A7. Uncertainty.**
- B = 2000, seed 20261030: one Poisson(1) weight per calendar date across the point-in-time era, shared by every touch that date (forecast and placebo, both rungs, both sides).
- All walk-forward models are refitted in each replicate.
- 95% percentile intervals; two-sided p = 2 × min(share ≤ 0, share ≥ 0), floor 1/B.
- **Sensitivity:** a 20-session moving-block bootstrap. If it changes a classification, the wider interval decides.

**A8. Q2/Q3: 12 primary comparisons** (3 instruments × 2 families × [M1 vs M0, M2 vs M1]).
- Out-of-sample log-loss skill = 1 − Σ loss(larger) ÷ Σ loss(smaller), with Brier skill alongside.
- BH at q < 0.10 across the 12.

| Class | Rule |
|---|---|
| Improves | BH-significant **and** skill ≥ 1% |
| No material improvement | upper bound < 1% |
| Inconclusive (banked "underpowered") | anything else |

"No material improvement" means the out-of-sample gain is shown to be below 1%. It does not mean the variable has no relationship with reach.

At projected touches, u sits in a narrow band (central 80%: p50 0.91–1.16, p75 1.21–1.38) because the level itself is a range-used threshold. So a projected "no material improvement" or "inconclusive" **does not show range used is irrelevant**. No variables or models are added to work around this.

**A9. Q1 and calibration.**
- **Working model:** M2 if Q3 improves; else M1 if Q2 improves; else M0. All three are reported.
- **Classification** is on calibration-in-the-large (CITL) only: mean predicted − observed, pooled test years, A7 interval.

| Class | Rule |
|---|---|
| CITL supported (±3pp) | interval within [−3, +3]pp |
| CITL inconsistent | interval entirely outside |
| CITL inconclusive | otherwise |

- **Calibration slope** is a separate diagnostic with its interval, never a basis for "calibrated". An interval excluding 1 is reported as a departure.
- **Wording:** "CITL supported against ±3pp", never "calibrated".
- **Descriptive:** quintile reliability tables with intervals (pooled and per year), ECE with simulated noise floor, AUC.
- **Q1 reporting:** M0's predicted reach at 08:00, 12:00, 16:00 and 20:00 London.

**A10. Q4: forecast vs placebo.**
- **Placebo lines:** M3 phantom ladders (×0.70/0.85/1.15/1.30, same days and path). Their own next-rung reach, same exclusions, u on the real HL p50.
1. G = M2 terms + d + d², fitted on placebo touches before test year Y.
2. Apply to all test-year touches; take residuals r = y − Ĝ.
3. Report pooled: observed forecast rate, G's mean prediction, Δ_raw, and placebo residual means by factor.
4. Δ_adj = mean r_fc − Σ w_f mean r_pl(f), with w = (−1/6, 2/3, 2/3, −1/6).
5. Interval from A7, with forecast and placebo sharing date weights and G refitted per replicate.

There are 6 cells, as a second BH family (q < 0.10 within the 6):

| Class | Rule |
|---|---|
| Forecast-specific | BH-significant, \|Δ_adj\| ≥ 3pp, same sign in 2016–20 |
| No forecast-specific difference beyond ±3pp | interval within ±3pp. This rules out differences larger than 3pp at this sample; it does not prove there is no difference |
| Inconclusive | otherwise |

Rung-level Δ_adj is descriptive.

**A11. Exclusions (M5's set; counts reported).** Next rung reached in the touch minute; `ambiguous_order`; `float32_tie`; first-minute touches.

**A12. Sensitivities** (no reclassification except A7's rule):
- untagged days excluded (33% of test touches). A changed conclusion is flagged "not robust to untagged days";
- by side; by test year;
- 2016–20 sign check (G fitted within that era);
- NQ research levels sit about 2% inside production (caveat).

### Part B: p90 as an outer-range boundary

**B0. Framing.**
- p90 is a percentile, not a maximum; exceeding it is not a forecast failure.
- There is no rung beyond p90; overshoot is a distance.
- No predictive model: whole point-in-time era, halves Y1–Y3 / Y4–Y6, 2016–20 descriptive.
- No hypothesis tests; nothing is BH-corrected.

**B1. Boundary frequency.** Unit: the session (all 1,548–1,556 days per instrument, including days p90 is never reached).

| Event | Definition | 10% reference |
|---|---|---|
| Fixed up | day high ≥ OH p90 level | yes: the 90th percentile of open-to-high |
| Fixed down | day low ≤ OL p90 level | yes: open-to-low |
| Fixed either / both | union / intersection | no (descriptive) |
| Projected HL | `hl_pct ≥ hl_p90` | yes: the 90th percentile of the day's range |
| ProjH / ProjL p90 touched, either | archive first touches | no: they use bar k−1's extreme off the low/high, close to but not identical to the HL event |

Classification of the three referenced events, per instrument, uses a 20-session moving-block bootstrap 95% interval (serial dependence; the iid interval is shown too):

| Class | Rule |
|---|---|
| Consistent with 10% ±3pp | interval within 7–13% |
| Inconsistent | interval entirely outside 7–13% |
| Inconclusive | otherwise |

The untagged-day sensitivity applies.

**B2. Overshoot.**
- **Definition:** O = `cont_max_sig` at the p90 first touch. That's the furthest price travels beyond the level (priced at the touch bar), bar k → 22:00, ÷ `scale` = open × σ_used.
  - For fixed levels: (day extreme − level) ÷ scale.
  - Projected levels are frozen at the touch-bar price.

| | Measures | Describes |
|---|---|---|
| Unconditional (all days) | O_day = O if reached, else 0; P(O_day = 0); P(O_day ≥ x) at x = 0.10, 0.25, 0.50, 1.00σ; mean O_day | overshoot **including how often p90 is reached** |
| Conditional (per p90 touch) | median, 75th, 90th percentile of O; mean with interval; P(contained: O < 0.10σ); P(extended: O ≥ 0.25σ); the band between | what happens **once p90 is reached**, not how often that is |

- 0.10σ and 0.25σ are pre-specified descriptive thresholds, not natural or trading boundaries.
- Reported per instrument × family × side and pooled.

**B3. M3 cross-reference (descriptive).** P(O ≥ step_d), with step_d = that day's (p90 − p75) distance ÷ scale. This is M3's expansion reference, **not a forecast rung**. It differs slightly from M3's 30–44%, which started at k+1 with a trade-through from the close side.

**B4. Time.**
- Early/late split at the median `min_to_end` of p90 touches within instrument × family.
- Differences in P(extended), P(contained) and median O, with intervals.
- Also on O₁₂₀: overshoot within 120 min of the touch (bars k … k+119), for touches with ≥ 120 min left, from the path parquet. Only O₁₂₀ separates behaviour from time running out.

**B5. Range used.**
- Fixed p90: median-u split, as B4.
- Projected p90: not estimable, because u is pinned (central 80%: GOLD 1.66–1.77, NQ 1.70–1.90, EURUSD 1.53–1.64). Distribution only.

**B6. Boundary vs any line (descriptive only).**

| Comparison | Measure | Eligible | Limitation |
|---|---|---|---|
| Full session | P(contained), P(extended) to 22:00 at forecast p90, minus the B2-weighted phantom p90 values on the same days | all p90 first touches | lines are touched at different times, so the difference may reflect time remaining |
| Common horizon | the same on O₁₂₀ | touches with ≥ 120 min left | removes unequal horizons, not differences in touch time of day; drops late touches |

- Eligible n per instrument × family × factor, with paired date-bootstrap intervals.
- No classification. No claim of forecast-specific boundary behaviour from a containment difference alone.

**B7. Handling.**
- Exclusions: day level none; touch level `ambiguous_order` only.
- Sides reported and pooled. Projected per-side n is 56–90, so pooled is the main read.

**B8. Support:**

| Estimate | n per instrument | ~95% half-width | Status |
|---|---|---|---|
| B1 rates | 1,548–1,556 days | ±1.5–2pp | reliable |
| Contained / extended, fixed | 286–326 touches | ±5–6pp | usable |
| Contained / extended, projected | 146–162 | ±8pp | rough |
| Median O, fixed | as above | moderate | usable |
| 90th percentile of O | ~30 / ~15 touches above | wide | descriptive |
| B4/B5 halves | half | ±11pp fixed / ±15pp projected | likely inconclusive except the mechanical time effect |
| B6 | as above, fewer for O₁₂₀ | ±7–8pp fixed / ±10pp projected or more | descriptive |

### Part C: when levels are first reached (descriptive)

**C0.** This is description, not predictive value. Timing reflects intraday volatility and level construction: fixed levels start from 00:00; projected levels need range to build first.

**C1. Unit and period.**
- Unit: the instrument-day, all point-in-time days (including no-touch days), 2016–20 exploratory.
- Levels: OH, OL, ProjH, ProjL × p50, p75, p90. Families separate; sides separate and pooled.

**C2. Measures** (from `first_<level>_min`, clock in Europe/London):

| Measure | Denominator | Definition |
|---|---|---|
| Cumulative reach F(t) | all days | share touched by t = 01:00 … 22:00 |
| Touch-time distribution | touched days | 10/25/50/75/90th percentiles of London clock time and of minutes since open |
| Window shares | all days and touched days | 00:00–08:00, 08:00–13:30, 13:30–17:00, 17:00–22:00 |

The windows are conventional session boundaries, fixed now. US events fall an hour earlier in London for about three weeks each spring and autumn; this is noted, not adjusted.

**C3. Comparisons** (intervals, no tests):
- instruments; fixed vs projected;
- years Y1–Y6 and 2016–20: per-year median and window shares, the range across years, and whether each year's interval overlaps the pooled estimate.

**C4. Reference.** Same measures on the phantom ladders, B2-interpolated to ×1.0, giving forecast − reference with paired intervals (descriptive).

**C5. Uncertainty.**
- 20-session moving-block bootstrap, B = 2000, seed 20261030, with forecast and phantom sharing blocks.
- F(t) about ±2.5pp at worst. Window shares ±3–4pp (p50), ±4–5pp (p75), ±5–8pp (p90).
- Per-year p90 is descriptive (about 25–55 touches a year); year consistency is judged on p50/p75.

**C6. Exclusions.** None. `float32_tie` touches (6) are kept and listed.

**C7. Prior art.** P3 reported medians only. C adds full distributions including zeros, rungs, years and the placebo reference.

### Power and limitations

- **What the 1% bar means:** an added variable that shifts predicted reach with a standard deviation of about 6pp. Q3 at M5-like sizes would give about 0.1–0.7%. These are hypotheses.
- **CITL half-widths** (Y3–Y6, perfect calibration):
  - fixed: ±2.5–3.3pp, so "supported" only if CITL is near 0 with low same-day dependence;
  - projected: ±3.3–4.6pp, so it **can't be "supported"**, only inconsistent or inconclusive.
- **Minimum detectable skill** is not computed: it needs outcomes or simulation code.
- **Part C** is confounded with volatility seasonality and construction; the phantom reference addresses this only in part. No predictive claims.

### What M6 will and won't tell us

**Will:**
- calibration-in-the-large of a time-only reach probability, and whether range used, then approach, add skill out of sample;
- whether forecast lines are reached differently from comparable lines;
- each p90 event against its 10% promise;
- p90 overshoot, unconditional and once reached, by touch time and range used (fixed);
- how p90 compares with comparable lines on a common horizon (descriptive);
- when each level is first reached, by instrument, family and year, against comparable lines (descriptive).

**Won't:**
- direction or profit;
- updating while price waits after a touch;
- predictive value of touch time beyond Part A's T;
- the post-touch path mix (M7);
- the live H1-close rule;
- the production NQ σ basis;
- untouched validation;
- any statement that forecast-specific information is absent in general: each null is reported with the effect sizes its interval rules out, and underpowered cells are listed as such.

### Process

1. Register row; this file plus the decision-rules file, pushed.
2. One run.
3. Bank in the Evidence Book with power rows: the 12 comparisons, the 6 placebo cells, the B1 classes, and Parts B and C as context. Each entry states what it supports, which effect sizes its interval rules out, and what stays underpowered.
4. Stop for review.
