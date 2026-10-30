# vmc-nq-vol-increment — does VuManChu Cipher B add information about NQ's next-hour range beyond what price already says?

**DRAFT 2026-10-30, for the owner's review. Not yet registered; no outcome has been computed.** Registration = the
commit that changes this line and the register row to REGISTERED.

| | |
|---|---|
| ID / ledger ids | `vmc-nq-vol-decomposition` (Stage 2), `vmc-nq-vol-increment` (Stages 3 and 5), `vmc-nq-vol-transition` (Stage 4) |
| Branch | `main` (detached worktree of origin/main) |
| Register row | `plans/RESEARCH_REGISTER.md` → `vmc-nq-vol-increment` |
| Data | the `vmc-nq-cipher` NQ futures dataset (`analysis/output/vmc-nq-cipher/SPEC.md`), timeframes 1, 3, 5, 30 min (where the banked effect validated). **Fit** 2016-01-04 → 2022-12-31; **test** 2023-01-01 → 2026-08-20; lockbox (≥ 2026-08-21) unopened |
| Seed | `20261031` (one for every script; set on the registration date) |
| Uncertainty | trade-date block bootstrap, blocks of 20 dates, B = 2000; all comparisons paired (same bars, same draws) |
| Scripts / outputs | `scripts/vmc-nq-vol-increment/` → `analysis/output/vmc-nq-vol-increment/` |
| Harness | own scripts; reuse `scripts/vmc-nq-cipher/vmcds.py` (lockbox guard), `events.py`, `score.py` outcome code |

## 1. The claim

Banked as `vmc-nq-cipher-volatility` (validated, small): after a mid-range WaveTrend cross (|wt1| < 20), the next 12
bars' range was +5-8% above a matched baseline (NY hour × σ tercile × prior 12-bar move). That fell to +3-5% with the
recent 12-bar range added to the baseline. Mid-range bars without a cross carried about half of it.

The owner's question (2026-10-30): is Cipher B identifying volatility transitions, or describing a market state that
price measures more directly?

## 2. Why it is not already settled, and what has already been seen

**Nearest entries**:
- `vmc-nq-cipher-volatility` (above).
- The Live Range features work (`forge/LIVE_RANGE_FEATURES_PREREG.md`): WaveTrend, VWAP, ROC and similar indicators
  added about +0.3% Brier skill beyond price geometry, for a different target (whether the extreme is in).
- `forge/FUTURES_VOL_RESULT.md`: HAR on 5-minute realised variance improves daily σ forecasts by 1.3% on NQ futures.
  That's a price-only improvement and sets the size scale for "material".
- `forge/CONFIDENCE_PREREG.md`: time of day and realised volatility so far carry nearly all skill in range reach.

None of these asks whether Cipher B adds to a **strong** price-only intraday range forecast. The banked test's baseline
was deliberately simple (24 hours × 3 σ terciles × 10 prior-move bins).

**Already seen on the test period (disclosed)**. The `vmc-nq-cipher` post-hoc checks (amendment A1) computed four
2023-26 numbers relevant to Stage 2:

| Cell | Effect, with the recent 12-bar range in the simple baseline |
|---|---|
| mid-range with a cross | +0.034 / +0.043 / +0.036 / +0.050 (1 / 3 / 5 / 30m) |
| mid-range without a cross | +0.020 / +0.028 / +0.018 / +0.025 |

So **Stage 2's test period is not fresh** for the level-vs-cross split. Stage 2 can describe the decomposition against
a stronger baseline, but its confirmatory weight is reduced: §4 asks only whether those cells survive a richer
baseline, and the genuinely unseen confirmation for Stage 2 is the lockbox. Stages 3-5 (the forecasting models, other
components, transitions) have not been looked at on any period.

## 3. Definitions, fixed in advance

**Observation**: every bar t on timeframe τ ∈ {1, 3, 5, 30} with all features defined. Excluded:
- bars whose window [t − 12, t + 12] contains a contract roll bar (`roll_in_bar`) or a feed join (change in
  `owner_share`);
- bars whose 12-bar target window crosses the fit/test boundary or the end of the data.

Daily breaks inside a window are kept, with a feature saying so.

**Target**: y = log((max H − min L over bars t+1..t+12 + 1 tick) / C_t), the log percentage range of the next 12 bars.
- Primary horizon 12 bars.
- Stage 4 also uses 48 bars (secondary).
- The same expression with 12 → h for other horizons.

**Price-only baseline features** (Stage 1). All use bars ≤ t on the ratio-adjusted series.

| Group | Features |
|---|---|
| Recent range | log range over the last k ∈ {1, 3, 12, 48, 288} bars |
| Realised volatility | log σ of 1-bar returns over k ∈ {12, 48, 288}; log σ500 (the study's σ) |
| 5-minute realised variance | log of the 1-minute-squared-return sum over the last 60 minutes and the last trade date (from the 1m base; the HAR input that worked in FUTURES_VOL) |
| Expansion / contraction | log(range₁₂ / range₄₈), log(range₁₂ / range₁₂ at t − 12), log(σ₁₂ / σ₂₈₈) |
| Displacement | (C_t − C_{t−k}) / range_k and \|C_t − C_{t−k}\| / (σ500 · C · √k), for k ∈ {12, 48} |
| Efficiency | \|C_t − C_{t−k}\| / Σ\|ΔC\| over k ∈ {12, 48} |
| Day context | today's CME-day range so far / yesterday's range; log yesterday's range; overnight gap |
| Clock | NY half-hour of day (48 levels), day of week, session label, minutes since the CME open |
| Scheduled news | a US Major release scheduled inside bars t+1..t+12, or inside the last 12 bars (`calendar_events.csv`; schedules are public in advance) |
| Breaks | the target window crosses the daily break |

Percentile-type features use trailing windows only, never full-sample quantiles. Leakage checks: the Stage 0
truncation test is extended to the new features, and a shuffled-target placebo must score ≤ 0 skill.

**VuManChu feature blocks** (Stage 3). Columns are already in the dataset; same timeframe; values at bar t.
- **WTL** (WaveTrend level and slope): wt1, |wt1|, the |wt1| < 20 indicator, wt1_slope, wt1_accel.
- **WTC** (the cross): a cross on bar t, bars since the last cross (capped at 48), the wt1 level at the last cross.
- **SPR** (WT spread = the Cipher B "VWAP oscillator"): wt_spread, |wt_spread|, spread_slope.
- **MF** (Money Flow): mf, |mf|, mf_slope, mf_run, MF zero cross within the last 12 bars.
- **ALN** (alignment): the count of agreeing signs among spread, wt1 and mf (−3..3); a disagreement flag.
- **DIV** (divergences): any regular / any hidden divergence (wt2, spread, mf) confirmed in the last 12 bars. This is
  tied to the banked volatility hint: co-divergence goes with higher volatility.
- **PVD** (price-VWAP distance): `vwap_dist` and |vwap_dist|. It is **not Cipher B**, so it's reported separately as a
  price-and-volume feature. It is never counted toward "VuManChu adds".

**Models**:
- **Primary**: gradient boosting (scikit-learn `HistGradientBoostingRegressor`, squared error). Hyperparameters are
  **fixed now**, with no tuning: max_iter 400, learning_rate 0.05, max_leaf_nodes 31, min_samples_leaf 500,
  l2_regularization 1.0, early stopping off, random_state = seed.
- **Secondary**: OLS on the same features, with the half-hour clock as dummies.
- Training rows: every bar on 5m and 30m; every 3rd bar on 1m and 3m (memory). Scoring uses every test bar.
- Each model is fitted once on the fit period and scored on the test period.
- Walk-forward robustness: expanding annual refits with test years 2023, 2024, 2025, 2026 (to 08-20).

**Forecast metrics**:
- **Skill** = 1 − MSE(augmented) / MSE(price-only), on y, test period, paired.
- Also reported: MAE skill; the QLIKE-type loss on exp(y); calibration (mean y by decile of predicted y, and the slope
  of y on prediction); skill by session, by year, by the Stage 4 volatility state; skill with the top 1% of |error|
  removed.

**Stage 2 cells** (registered |wt1| < 20, kept for comparability), with z = |wt1| < 20 and x = a WT cross on bar t:
- A = z ∧ x
- B = z ∧ ¬x
- C = ¬z ∧ x
- D = ¬z ∧ ¬x

The effect is the mean test-period residual (y − ŷ_price-only) in each cell, from the price-only GBM fitted on 2016-22.
- **Level** = B − D.
- **Cross** = C − D.
- **Interaction** = (A − B) − (C − D).

The same four cells are also scored against the banked simple baseline, to tie the numbers to the original study.

**Stage 4 states** (price only, ex ante). p_t is the percentile of the current 12-bar range within the trailing 20
trade dates' 12-bar ranges ending at the same NY half-hour (removing the intraday seasonal), and p_{t−12} the same 12
bars earlier.

| State | Rule |
|---|---|
| Compression | p_t ≤ 0.2 and p_{t−12} ≤ 0.2 |
| Emerging expansion | p_t ≥ 0.8 and p_{t−12} ≤ 0.5 |
| Established expansion | p_t ≥ 0.8 and p_{t−12} ≥ 0.8 |
| Contraction after expansion | p_t ≤ 0.5 and p_{t−12} ≥ 0.8 |
| Normal | everything else |

The **future** state uses the same percentile machinery on bars t+1..t+12 (p_f).
- **Expansion onset** (the transition to predict) = p_t ≤ 0.5 and p_f ≥ 0.8.
- "Merely recognising" is checked by also scoring the **same-window** classification (is bar t's own window expanded?),
  which VMC can only describe.

## 4. Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| S1 | How well does price alone forecast the next 12 bars' log range? | High skill vs the clock-only model (R² well above 0.3); calibration slope ≈ 1. **Described, not gated** |
| H2a (level) | Mid-range WT without a cross (B − D) has a positive residual after the price-only GBM | **Shrinks toward 0**: the WT level is a smoothed displacement/volatility ratio, which price features carry |
| H2b (cross) | The cross away from zero (C − D) has a positive residual | **Small or null** |
| H2c (interaction) | The cross is worth more near zero ((A − B) − (C − D) > 0) | **Null** |
| H3 (primary) | Price-only + all Cipher B blocks (WTL, WTC, SPR, MF, ALN, DIV) beats price-only, test-period MSE skill | **Below materiality**: skill < 1%, probably 0-0.5% |
| H3-blocks | Each Cipher B block alone added to price-only (6 tests per timeframe) | Mostly null; WTL is the likeliest non-zero |
| H3-ablation | Dropping each block from the full model | Descriptive only |
| H3-PVD | Price-VWAP distance added to price-only (separate; not Cipher B) | Small |
| H4a | Among bars not already expanded (p_t ≤ 0.5), price + Cipher B forecasts expansion onset better than price alone (Brier skill) | **Below materiality** |
| H4b | The same within compression only | **Below materiality**; compression → expansion is mostly the clock (opens, releases) |
| H4c | Cipher B's contemporaneous association with the current state vs its forward skill | Describes the current state well (high same-window AUC) but adds little forward: the "merely recognising" pattern |

**THE GATES**:
- **H2a / H2b / H2c**: the residual's 95% interval excludes 0 **and** |effect| ≥ 0.02 (2% of range) on **both 1m and
  3m** (the powered timeframes, §5), with 5m and 30m the same sign as point estimates. Because this period was partly seen (§2), a pass is labelled **"survives a richer
  baseline on a previewed period"**, and confirmation is reserved for the lockbox (≥ 60 sessions, owner approval).
- **H3 (increment)**: test-period MSE skill ≥ 1.0%, with the 95% interval's lower bound > 0, on ≥ 3 of 4 timeframes.
  It must also be ≥ 0.5% in each test year with data in ≥ 3 of 4 years (stability), and survive removing the top 1%
  of |error|. This is the repo's usual skill bar (Live Range, FUTURES_VOL); the price-only HAR gain there was 1.3%.
- **H3-blocks**: Holm α 0.05 across 6 blocks × 4 timeframes = 24 tests, one-sided (skill > 0), **and** skill ≥ 0.5%.
- **H4a / H4b**: Brier skill ≥ 1.0% with the lower bound > 0 on ≥ 3 of 4 timeframes (h = 12). h = 48 is secondary and
  descriptive.
- **THE MIRROR**: every comparison is also run with the blocks' values **time-shifted by +12 bars** (stale VuManChu,
  same distribution). A real increment must beat the shifted copy; if the shifted copy scores the same, the "gain" is
  a slow-moving state that price already carries.
- **Placebo**: the price-only model with the target shuffled within trade date must score ≤ 0 skill.

**Exploratory, outside the gates**: alternative WT thresholds (|wt1| < 10 / < 30, and a continuous spline in |wt1|).
Discovery period only, and labelled exploratory. A definition chosen from them is frozen in an amendment **before** any
test-period number for it is computed, and its test-period result is reported as exploratory, never as the gate.

## 5. Power

Test-period bars after exclusions, roughly:
- 1m: about 1.25M bars;
- 3m: 420k;
- 5m: 250k;
- 30m: 41k.

Stage 2 test cells: A 30,195 / 9,902 / 5,939 / 917 and B 21,045 / 7,169 / 4,299 / 704 (1 / 3 / 5 / 30m).

The residual SD after a good model will be about 0.40-0.45 log units (measured at registration on the fit period
only). Stage 2 MDEs with a 1.5 design effect are then about:
- A: 0.009 / 0.015 / 0.019 / 0.049;
- B: 0.010 / 0.017 / 0.022 / 0.056.

A 0.02 bar is powered at **1m and 3m** only. 5m is borderline, and **30m is UNDERPOWERED by design** for Stage 2.
The Stage 2 gate is therefore scored on 1m and 3m, with 5m and 30m reported for sign.

For skill, a block-bootstrap 95% half-width on MSE skill of about 0.2-0.4% is expected at 1-5m (the
LIVE_RANGE / FUTURES_VOL experience); a 1% bar is powered there. At 30m the width will be measured on the fit period
before registration and stated in an amendment; if it exceeds 1%, 30m is UNDERPOWERED by design.

## 6. Multiplicity

**Scored**:
- H2a / H2b / H2c: 3 questions, each conjunctive over 1m and 3m; no further correction.
- H3: 1 question, conjunctive across timeframes.
- H3-blocks: 24 tests, Holm.
- H4a / H4b: conjunctive.

Everything else is descriptive:
- ablation;
- PVD;
- OLS;
- h = 48;
- per-session, per-year and per-state skill;
- the exploratory thresholds.

There are no variants beyond those listed. Promotion to anything live is out of scope here (§7).

## 7. What this does NOT test

- Direction.
- Any trading or position-sizing rule. The owner excluded these; a pass here only says the forecast improves.
- ES or gold.
- Discretionary chart reading.
- Whether a better **price-only** model exists than this one. If price-only wins, a more elaborate VMC model is not a
  reason to reopen.

## 8. What each verdict changes

- **H3 VALIDATED**: Cipher B carries incremental range information on NQ. The next step would be a separate,
  approved decision (lockbox confirmation at ≥ 60 sessions, ES/GC replication, any sizing use).
- **H3 NULL**: `vmc-nq-cipher-volatility` is re-described in the Evidence Book as "a price state, captured as well or
  better by price-only range features". VuManChu is recorded as adding nothing material to range forecasting on NQ,
  and the banked entry stays as run.
- **H2 split**: records how much of the banked effect is the level, the cross or price.
- **H4**: records whether Cipher B catches compression → expansion earlier than price does, or only recognises it.

## Amendments

(none)

## RESULTS

(not run)
