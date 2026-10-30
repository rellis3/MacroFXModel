# vmc-nq-vol-increment — does VuManChu Cipher B add material, repeatable information about NQ's next-hour range that a properly built price-only forecast cannot already provide?

**DRAFT v2, 2026-10-30, for the owner's final review. Not yet registered; no outcome has been computed.**
v2 incorporates the owner's seven amendments of 2026-10-30. Registration = the commit that changes this line and the
register row to REGISTERED. Nothing runs before it.

| | |
|---|---|
| ID / ledger ids | `vmc-nq-vol-decomposition` (Stage 2, a **reassessment**), `vmc-nq-vol-increment` (Stages 3 and 5), `vmc-nq-vol-transition` (Stage 4) |
| Branch | `main` (detached worktree of origin/main) |
| Register row | `plans/RESEARCH_REGISTER.md` → `vmc-nq-vol-increment` |
| Data | the `vmc-nq-cipher` NQ futures dataset (`analysis/output/vmc-nq-cipher/SPEC.md`), timeframes 1, 3, 5, 30 min (where the banked effect validated). **Fit** 2016-01-04 → 2022-12-31; **test** 2023-01-01 → 2026-08-20. **Lockbox (trade dates ≥ 2026-08-21) stays sealed**: `vmcds.load` refuses it without the owner's explicit approval, and nothing in this study requests it |
| Seed | `20261031` (one for every script) |
| Uncertainty | trade-date block bootstrap, blocks of 20 consecutive trade dates resampled with replacement, B = 2000, percentile intervals; every comparison is paired (same bars, same bootstrap draw for both models) |
| Scripts / outputs | `scripts/vmc-nq-vol-increment/` → `analysis/output/vmc-nq-vol-increment/` |
| Harness | own scripts; reuse `scripts/vmc-nq-cipher/vmcds.py` (lockbox guard) and the Stage 0 feature tables |

## 1. The claim

Banked as `vmc-nq-cipher-volatility` (validated, small): after a mid-range WaveTrend cross (|wt1| < 20), the next 12
bars' range was +5-8% above a simple matched baseline (NY hour × σ tercile × prior 12-bar move). Post-hoc, it was
+3-5% with the recent 12-bar range added to that baseline, and mid-range bars without a cross carried about half of it.

The question (owner, 2026-10-30): **does Cipher B provide material, repeatable, incremental information about future
volatility and volatility transitions that a properly constructed price-only model cannot already provide?**

The objective is research. It is **not** to find a trading rule, optimise stops, adjust position sizing or produce a
successful result. "No" is a full answer.

## 2. Prior work, and what has already been seen

**Nearest entries**:
- `vmc-nq-cipher-volatility` (above).
- Live Range features (`forge/LIVE_RANGE_FEATURES_PREREG.md`): indicators including WaveTrend, VWAP and ROC added
  about +0.3% Brier skill beyond price geometry (for whether the extreme is in).
- `forge/FUTURES_VOL_RESULT.md`: a better price-only σ (HAR on 5-minute realised variance) improved NQ daily forecasts
  by 1.3%.
- `forge/CONFIDENCE_PREREG.md`: time of day and realised volatility so far carry nearly all skill in range reach.

**Already seen on the test period**. In `vmc-nq-cipher` amendment A1 (post-hoc), the level-vs-cross split was computed
on 2023 → 2026-08-20 against the simple baseline plus recent range:

| Cell | Effect (1 / 3 / 5 / 30m) |
|---|---|
| mid-range with a cross | +0.034 / +0.043 / +0.036 / +0.050 |
| mid-range without a cross | +0.020 / +0.028 / +0.018 / +0.025 |

**Classification**:
- **Stage 2 is a reassessment of those findings against a stronger baseline on a period already explored. It is not
  discovery and not independent confirmation.** Its results will be reported with that label everywhere they appear
  (report, register, Evidence Book). A Stage 2 "pass" can only say the previewed pattern survives a richer price
  model; it cannot raise the evidence grade of the banked result. Independent confirmation would need the lockbox
  (owner approval, ≥ 60 sessions; 36 now).
- **Stages 3-5 have not been examined on any period.** Their hypotheses, features, models, thresholds and gates are
  frozen in this document before any of their test-period outputs exist.

## 3. Definitions, fixed in advance

### 3.1 Observations and exclusions

An observation is a bar t (forecast origin = the close of bar t) on timeframe τ ∈ {1, 3, 5, 30}. The bar is excluded
if:
- any bar in [t − 12, t + 12] is a contract roll bar (`roll_in_bar`);
- any bar in [t − 12, t + 12] has a different feed source (`owner_share` changes, i.e. a join between NinjaTrader and
  the owner's file);
- its 12-bar target window (48 for h = 48) crosses the fit/test boundary (2022-12-31 / 2023-01-01) or the end of the
  exploratory data;
- any feature is undefined (warm-up).

Exclusion counts are reported per timeframe and period.

### 3.2 Target

y_t = log((max H − min L over bars t+1..t+h + 1 tick) / C_t), the log percentage range of the next h bars.
- **Primary h = 12.**
- Stage 4 also uses h = 48 (descriptive only).
- 1 tick = 0.25 index points on the raw contract, converted to the ratio-adjusted scale by C/raw_close.

### 3.3 Information sets (what each forecast may know at the origin)

| Set | Content | Available at the origin because |
|---|---|---|
| **C** clock | NY half-hour of day (48 levels), day of week, session label, minutes since the CME open; whether bars t+1..t+h cross the daily break | the clock and the exchange schedule are known in advance |
| **P** price | all from bars ≤ t on the ratio-adjusted series: log range over the last k ∈ {1, 3, 12, 48, 288} bars; log σ of 1-bar returns over k ∈ {12, 48, 288}; log σ500; log 1-minute realised variance over the last 60 minutes and over the current CME day so far, plus the previous full day (the HAR inputs); expansion ratios log(range₁₂/range₄₈), log(range₁₂ / range₁₂ at t − 12), log(σ₁₂/σ₂₈₈); displacement (C_t − C_{t−k}) / range_k and \|C_t − C_{t−k}\| / (σ500 · C_t · √k) for k ∈ {12, 48}; efficiency \|C_t − C_{t−k}\| / Σ\|ΔC\| for k ∈ {12, 48}; today's CME-day range so far / yesterday's range; log yesterday's range; overnight gap | computed only from bars that had closed by the origin |
| **K** calendar | a US Major release (`calendar_events.csv`, impact "Major") scheduled inside bars t+1..t+h; a release in the last 12 bars; minutes to the next release (capped at 240) | the release **times** are published in advance. Only the scheduled time is used, never `actual`, `consensus`, `previous`, or any surprise measure. Caveat: the file is a historical record, so a rare unscheduled entry (an emergency announcement) would be known only on the day; these are expected to be a negligible share and are not removed |
| **V** VuManChu | the blocks in §3.4 | indicator values at the close of bar t |
| **after the origin** | nothing: no target-window bar, no future σ, no full-sample quantile, no regime label fitted on the whole sample | — |

Leak checks before any test number is computed:
1. The Stage 0 truncation test is extended to every new feature. Features computed on history cut part-way must equal
   the full computation bit-for-bit.
2. A feature-timing test: every feature at t is recomputed with bars after t set to NaN, and must be unchanged.

### 3.4 VuManChu blocks (V)

| Block | Features |
|---|---|
| **WTL** WaveTrend level and slope | wt1, \|wt1\|, the indicator \|wt1\| < 20, wt1_slope, wt1_accel |
| **WTC** the cross | a cross on bar t, bars since the last cross (capped at 48), wt1 at the last cross |
| **SPR** WT spread = the Cipher B "VWAP oscillator" | wt_spread, \|wt_spread\|, spread_slope |
| **MF** Money Flow | mf, \|mf\|, mf_slope, mf_run, an MF zero cross within the last 12 bars |
| **ALN** alignment | the count of agreeing signs among spread, wt1 and mf (−3..3); a disagreement flag |
| **DIV** divergences | any regular / any hidden divergence (wt2, spread, mf) confirmed in the last 12 bars (the banked volatility hint) |

**PVD** (price-VWAP distance: `vwap_dist`, |vwap_dist|) is not Cipher B. It is scored separately as a price-and-volume
feature and is never counted toward "VuManChu adds".

### 3.5 Models (frozen; no tuning)

- **Primary**: scikit-learn `HistGradientBoostingRegressor`, loss squared_error, max_iter 400, learning_rate 0.05,
  max_leaf_nodes 31, min_samples_leaf 500, l2_regularization 1.0, early_stopping False, random_state 20261031.
  Categorical clock features are passed as categorical.
- **Secondary**: OLS on the same features, with the clock as dummies.
- **Stage 4 classifiers**: `HistGradientBoostingClassifier` with the same settings (loss log_loss).
- Training rows: every bar on 5m and 30m; every 3rd bar on 1m and 3m (memory), always the same rows for every model
  being compared. Scoring uses every eligible test bar.
- **Comparisons** (each a separate pair, fitted separately):

| Pair | Question |
|---|---|
| C → C+P | how much price adds to the clock (context) |
| C+P → C+P+K | how much the calendar adds (reported separately, as requested) |
| **C+P+K → C+P+K+V** | **PRIMARY: does VuManChu add beyond the realistic implementable forecast** |
| C+P → C+P+V | does VuManChu add beyond price alone, without the calendar |
| C+P+K → C+P+K+one block | the six block tests (Holm) |
| C+P+K+V → minus one block | ablation (descriptive) |
| C+P+K → C+P+K+PVD | price-VWAP distance (descriptive, not Cipher B) |

### 3.6 Skill, defined exactly

For a timeframe τ and a model pair (base b, augmented a), both fitted once on the fit period, with test-period
predictions ŷ_b and ŷ_a on the same eligible test bars i = 1..N:
- **Loss**: squared error on the log range, e_i = (y_i − ŷ_i)².
- **Aggregation**: MSE = (1/N) Σ e_i, every eligible test bar weighted equally, pooled across all test dates. There is
  no pooling across timeframes; each τ is scored separately.
- **Skill** = 1 − MSE_a / MSE_b. Positive means the augmented forecast has lower error. The denominator is the base
  model's MSE on the same bars.
- **Uncertainty**: the paired block bootstrap. For each of B = 2000 draws, resample 20-date blocks, recompute MSE_a
  and MSE_b on the resampled bars, and take the skill. Report the percentile 95% interval. This handles serial
  dependence and the overlapping 12-bar forward windows (a window never spans more than one block boundary at
  1-30m).
- **Absolute errors, both models, always reported beside skill**:
  - RMSE and MAE of y (log units);
  - the same as a typical % error of the range: exp(RMSE) − 1;
  - mean error (bias);
  - MSE of the naive forecast (last 12-bar range) and of the clock-only model for scale.
- **Calibration, both models**:
  - mean y vs mean ŷ in each decile of ŷ (table and chart);
  - the intercept and slope of y regressed on ŷ;
  - Mincer-Zarnowitz, reported as a description, not a gate.
- **Stage 4 (classification)**:
  - Brier = (1/N) Σ (p_i − o_i)²;
  - Brier skill = 1 − Brier_a / Brier_b on the same bars, with the same bootstrap;
  - also reported: climatology Brier, the reliability table (10 bins), AUC.

### 3.7 Materiality (the registered bar)

- **1.0% skill** (MSE skill for Stages 3 and 5, Brier skill for Stage 4), consistent with LIVE_RANGE and FUTURES_VOL.
- A cell passes only if the **point estimate ≥ 1.0% AND the 95% lower bound > 0**. Statistical significance alone
  never passes.
- 1% MSE skill on the log range is about a 0.5% reduction in the RMSE of the log range. The absolute numbers in §3.6
  will show what that is in index points per timeframe.

### 3.8 Stage 2 cells (reassessment)

With z = |wt1| < 20 (the registered definition, kept for comparability) and x = a WT cross on bar t:

| Group | Definition |
|---|---|
| A | z ∧ x |
| B | z ∧ ¬x |
| C | ¬z ∧ x |
| D | ¬z ∧ ¬x |

The residual r_i = y_i − ŷ_i uses the **C+P+K price-only GBM** fitted on 2016-22, on test-period bars. Group means of
r, with:
- **Level** = B − D;
- **Cross** = C − D;
- **Cross given level** = A − B (the owner's main question: does the cross add beyond the WT level and the price
  features);
- **Interaction** = (A − B) − (C − D).

**Reported for each, per timeframe**: n per group; estimate; paired bootstrap 95% interval; MDE (80% power, two-sided
0.05, from the bootstrap SE: MDE ≈ 2.8 × SE). The same contrasts are also reported against the banked simple baseline,
to tie the numbers to `vmc-nq-cipher`.

**Reading rule**: a contrast whose interval includes 0 **and** extends beyond ±0.02 is **inconclusive** (recorded as
UNDERPOWERED). It is never read as "the cross adds nothing". "Adds nothing material" is stated only when the whole
interval lies inside ±0.02.

### 3.9 Stage 4 states (price only, ex ante)

p_t is the percentile of the current 12-bar range within the trailing 20 trade dates' 12-bar ranges ending at the same
NY half-hour (strictly earlier dates; this removes the intraday seasonal), and p_{t−12} the same 12 bars earlier.

| State | Rule |
|---|---|
| Compression | p_t ≤ 0.2 and p_{t−12} ≤ 0.2 |
| Emerging expansion | p_t ≥ 0.8 and p_{t−12} ≤ 0.5 |
| Established expansion | p_t ≥ 0.8 and p_{t−12} ≥ 0.8 |
| Contraction after expansion | p_t ≤ 0.5 and p_{t−12} ≥ 0.8 |
| Normal | everything else |

The future p_f uses the same reference distribution (the trailing 20 dates at that half-hour) for bars t+1..t+12.

| Target | Population | Measures |
|---|---|---|
| **Onset** = p_f ≥ 0.8 | bars with p_t ≤ 0.5 | forecasting expansion ahead (H4a) |
| Onset | compression only | H4b |
| **Earlier**: p ≥ 0.8 in bars t+13..t+24 | bars with p_t ≤ 0.5 and bars t+1..t+12 not ≥ 0.8 | spotting a transition a window ahead (descriptive) |
| **Recognising**: is bar t's own 12-bar window ≥ 0.8? | all bars | VuManChu's contemporaneous association (AUC of V alone vs P alone); descriptive, cannot pass anything |

### 3.10 Walk-forward (robustness, Stage 5)

- For test year Y ∈ {2023, 2024, 2025, 2026 (to 08-20)}, each model is refitted once using **only observations whose
  whole target window ends before the first bar of trade date Y-01-01** (fit rows from 2016-01-04 on; the last 12/48
  bars before the boundary are purged). It is then scored on Y's eligible bars.
- No refit inside a year. No information from Y or later enters fitting, feature scaling or percentile cutpoints (all
  cutpoints are trailing).
- Overlapping forward windows inside a test year are handled by the block bootstrap (§3.6).
- Rolls and feed joins: the §3.1 exclusion removes any observation whose window touches one. Longer lookbacks (up to
  288 bars) may span a roll on the ratio-adjusted series, which is continuous in percentage terms, so no price jump
  enters. No observation's target window ever contains a roll or a join.

### 3.11 Controls: what each establishes, and what it cannot

| Control | Establishes | Cannot establish |
|---|---|---|
| **Stale indicator**: the V block shifted +12 bars (each bar gets the values from 12 bars earlier), same pair | a real increment must beat this copy. If the stale copy scores the same, the "gain" is a slow state (a regime price features also carry, or a proxy for slow volatility), not timely information | whether a better price feature would do as well (that is the job of the C+P+K baseline); it doesn't rule out that a different lag would help |
| **Shuffled target**: y randomly permuted across bars **within each trade date**, both models refitted, the increment scored | if the pipeline leaks or the comparison is biased, the augmented model would still "win". The increment must be ≈ 0 (interval includes 0). Within-date shuffling keeps day-level volatility, so it tests intraday timing specifically | it can't detect leakage that works at day level, nor prove the absence of every leak; the truncation/timing tests (§3.3) cover that |
| **Clock-only and naive baselines** | the scale of the forecasting problem | nothing about VuManChu |

### 3.12 Exploratory thresholds

Alternative near-zero definitions (|wt1| < 10, < 30, and a continuous spline in |wt1|) are examined **on the fit period
only**. If one is preferred, it is frozen in a PRE-RESULTS amendment before any test-period number for it is computed.
Its test-period result is reported as exploratory, never as a gate, and the registered |wt1| < 20 result is always
reported first.

## 4. Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| S1 | How well do C, C+P and C+P+K forecast the next 12 bars' log range? | C+P well above the clock (R² gain > 0.2); calibration slope near 1. **Described, not gated** |
| H2a (level, reassessment) | B − D > 0 after the C+P+K model | shrinks toward 0 |
| H2b (cross away from zero, reassessment) | C − D > 0 | small or null |
| H2c (cross given level, reassessment) | A − B > 0 | small; the owner's main Stage 2 question |
| H2d (interaction, reassessment) | (A − B) − (C − D) ≠ 0 | null |
| **H3 (primary)** | C+P+K+V beats C+P+K | **below materiality** (< 1%, probably 0-0.5%) |
| H3-noK | C+P+V beats C+P | below materiality |
| H3-blocks | each of the 6 blocks added to C+P+K | mostly null; WTL likeliest non-zero |
| H4a | onset among non-expanded bars: C+P+K+V vs C+P+K, Brier skill | below materiality |
| H4b | onset within compression | below materiality |
| H4c (described) | V recognises the current state well but adds little forward | "merely recognising" pattern |

**THE GATES**:

| Gate | Rule |
|---|---|
| **H2a-d (reassessment)** | interval excludes 0 **and** \|estimate\| ≥ 0.02 on **both 1m and 3m** (the powered timeframes), with 5m and 30m the same sign as point estimates. Label on any outcome: "reassessment on a previously explored period" |
| **H3, H3-noK** | §3.7 materiality (≥ 1.0% and lower bound > 0) on ≥ 3 of 4 timeframes, **and**: skill ≥ 0.5% in ≥ 3 of the 4 test years (walk-forward, §3.10) at each passing timeframe; skill ≥ 0.5% with the top 1% of \|error\| removed; and the full V beats the stale-V copy (paired interval of skill(V) − skill(stale V) above 0) |
| **H3-blocks** | Holm α 0.05 (one-sided, skill > 0) across 6 blocks × 4 timeframes = 24 tests, **and** each passing block ≥ 1.0% skill |
| **H4a, H4b** | Brier skill ≥ 1.0% with the lower bound > 0 on ≥ 3 of 4 timeframes, h = 12, and V beats stale V |
| **Shuffled target** | for every gated pair the shuffled-target increment interval must include 0. If it doesn't, the pipeline is broken and nothing in that pair is read until fixed (a fix is recorded as an amendment) |

**Verdict words** (the repo's four):
- **VALIDATED**: the gate passes.
- **NULL**: the gate fails and the interval rules out the material bar. The upper bound is < 1% skill, or for Stage 2
  inside ±0.02.
- **UNDERPOWERED**: the gate fails but the interval still admits a material effect. This is how "inconclusive" is
  recorded, with that wording in the text.
- **CONTEXT**: descriptive outputs (S1, ablation, PVD, H4c, h = 48).

Stage 2's verdicts carry the reassessment label.

## 5. Power

**Stage 2 test cells** (n per group, 1 / 3 / 5 / 30m):

| Group | n |
|---|---|
| A | 30,195 / 9,902 / 5,939 / 917 |
| B | 21,045 / 7,169 / 4,299 / 704 |
| C, D | many times larger; counted and reported at run time |

With a residual SD of about 0.43 log units and design effect 1.5, the MDE is about:
- A: 0.009 / 0.015 / 0.019 / 0.049;
- B: 0.010 / 0.017 / 0.022 / 0.056.

A 0.02 bar is powered at 1m and 3m only; 5m is borderline and **30m is UNDERPOWERED by design**. Contrasts involving B
(level, A − B, interaction) inherit B's MDE. The reported bootstrap SE replaces these estimates at run time.

**Skill**: the expected 95% half-width at 1-5m is about 0.2-0.4% (LIVE_RANGE / FUTURES_VOL experience), so a 1% bar is
powered there. Before registration, the 30m half-width is measured from a **fit-period-only** split (2016-2019 fit,
2020-2022 score, price-only pair C → C+P, which involves no VuManChu outcome) and written into §5. If it exceeds 1%,
30m is UNDERPOWERED by design for H3 and H4, and the "≥ 3 of 4" gates then need 1, 3 and 5m.

## 6. Multiplicity

**Scored**:
- H2a-d: 4 contrasts, each conjunctive over 1m and 3m; no further correction. They are reassessments either way.
- H3 and H3-noK: 2 conjunctive gates.
- H3-blocks: 24 tests, Holm.
- H4a and H4b: 2 conjunctive gates.

**Descriptive only**:
- S1;
- ablation;
- PVD;
- OLS;
- h = 48;
- the "earlier" and "recognising" targets;
- skill by session, by year and by state;
- the exploratory thresholds.

There are no other variants. Nothing is promoted to any live use from this study.

## 7. What this does NOT test

- Direction.
- Any trading rule, stop or position-sizing rule (excluded by the owner).
- ES or gold.
- Discretionary chart reading.
- Whether an even better price-only model exists. If price-only wins here, a more elaborate VuManChu model is not a
  reason to reopen.
- **No independent confirmation of the banked Stage 2 pattern**: that needs the lockbox, which stays sealed.

## 8. What each verdict changes

- **H3 VALIDATED**: Cipher B carries material incremental range information on NQ. Any next step (lockbox
  confirmation at ≥ 60 sessions, ES/GC replication, any use in sizing or stops) is a separate decision for the owner.
- **H3 NULL**: recorded plainly. Cipher B adds less than 1% to a price-and-calendar forecast of NQ's next-12-bar
  range. The banked `vmc-nq-cipher-volatility` entry stays as run, with a note that it is captured as well or better by
  price features.
- **H3 UNDERPOWERED**: recorded with the interval, and with the timeframes where a material effect could not be ruled
  out.
- **H2 (reassessment)**: describes how much of the banked pattern is the level, the cross or price. Labelled as
  previewed.
- **H4**: records whether Cipher B forecasts compression → expansion beyond price, or only recognises the current
  state.

## Amendments

(none; v2 changes from the first draft are listed in the commit message and below)

**Draft history** (pre-registration, no outcomes):
- v1, 2026-10-30.
- v2, 2026-10-30, after the owner's review:
  1. Stage 2 classified as a reassessment, not confirmation.
  2. Skill defined exactly, absolute errors and calibration required, significance alone never passes.
  3. Information sets C / P / K / V separated, with the calendar increment reported separately.
  4. Stage 2 reporting (n, contrasts, intervals, MDE, the inconclusive rule) and the A − B contrast added.
  5. Walk-forward fitting, overlap and roll/join handling specified; the controls' scope stated.
  6. Verdict wording for inconclusive results.
  7. Registration only after the owner's final review.

## RESULTS

(not run)
