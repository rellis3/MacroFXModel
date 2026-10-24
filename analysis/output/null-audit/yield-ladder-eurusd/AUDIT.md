# Null audit: `yield-ladder-eurusd`

Audited 2026-10-24 on branch `worktree-agent-ae310e62f19327b77`. Nothing banked was edited: not `js/deskEvidence.js`,
not the prereg, not the results files. The re-run overwrote the study's outputs in this worktree and they matched
byte for byte, so `git status` showed no changes to them.

- **Banked verdict:** NULL at 5 and 20 days. The stated reason is "rate forecasts were *anti*-predictive OOS,
  IC −0.10..−0.21, intervals below 0". The 1-day horizon was already demoted to UNDERPOWERED by Amendment A2.
- **Prereg:** `forge/YIELD_PREDICTIVE_LADDER_PREREG.md`, plus A1 (pre-results) and A2 (post-hoc, demote-only).
- **Code:** `scripts/yield-predictive-ladder/panel.py`, `run.py`, `planted.py`.
- **Results:** `analysis/output/yield-predictive-ladder/RESULTS.md`, `results_eurusd.json`, `planted.json`.
- **Audit scripts:** `scripts/null-audit/yield-ladder-eurusd/`:
  - `compare.py`: re-run vs banked;
  - `diag.py`: diagnostics of the study's own pipeline;
  - `reimpl.py`: independent re-implementation and planted power;
  - `planted_mech.py`: why the ladder is blind;
  - `fred_drift.py`;
  - `accounting.py`.
- **Audit outputs:** `diag.json`, `reimpl.json`, `planted_mech.json` (this folder).

## Bottom line

**The code has no lookahead, alignment, unit or indexing bug.** The data pipeline is clean. I rebuilt it from the raw
CSVs with independent code: every target and rate feature matched to 1e-13. The run reproduces exactly.

**The reason given for NULL is wrong.** The −0.10..−0.21 out-of-sample ICs are not a rate view. They are the
**intercept**: the expanding historical mean of EURUSD's h-day return, refitted once a year. The no-signal model M0
(expanding mean only) has the same IC:

- **5 days:** −0.111 in Test, −0.116 in Validation;
- **20 days:** −0.204 in Test, −0.228 in Validation.

That matches M2–M5. Cross-validated ridge picks λ = 100–1000 in most years. At that λ the penalty, `lam·n`
(`run.py:38`), shrinks every coefficient by 100–1000×. What's left of the forecast is mostly the training mean, and that
mean steps once a year:

- At 20 days, 65–83% of the M2/M3 Test forecast variance lies **between** years.
- Ranked within each year, M2/M3 at 20 days have a Test IC of **+0.015 / +0.016**.
- The part rates add (M3 − M1) has a Test IC of +0.009 at 5 days and −0.035 at 20 days.

The independent re-implementation puts the rate-specific OOS IC near zero, with intervals that include the
registered bars. Expanding OLS of y_h on the US−DE 2y differential change plus momentum, slope part only, 63-row
block bootstrap:

| | 5 days | 20 days | Bar |
|---|---|---|---|
| Rate-specific OOS IC | +0.015 [−0.07, +0.10] | +0.044 [−0.11, +0.20] | 0.10 / 0.15 |

So:

- the prereg's own §5 rule ("a null at 5d or 20d is UNDERPOWERED unless the realised Test IC interval excludes the
  bar");
- read together with A2's positive control (the ladder misses ρ = 0.10 at 5 days);

make the right word for EURUSD 5d/20d **UNDERPOWERED**, not NULL. No evidence of a positive edge appeared anywhere
(Clark–West t ≤ 1.15, nothing near the gate), so this is a demotion of the *word*. It is not a missed VALIDATED.

## 1. Trace (data load → verdict)

### Data and point-in-time handling

`panel.py`

| Step | Lines | Check | Finding |
|---|---|---|---|
| FRED load | 18–25 | cached CSVs, `.` → NaN, dropna, window 2004-01-01..2026-08-21 | OK. A fresh download of DEXUSEU, DGS2 and DGS10 today is identical to the cache: same rows, 0 values differ (`fred_drift.py`). |
| DE yields | 28–35 | Bundesbank BBSIS Svensson 2y/10y from `dynlead/yields_daily.parquet` (`scripts/dynlead/build_panels.py:35–43`), in %, 2 dp | Units are % like H.15, so ×100 gives bp (`panel.py:89`). DE starts 2005-01-03 with no 2004 warm-up, so the first 21 rows of 2005 have no 20-obs differential change. Those rows are dropped from M2–M5 only (see §5). **Minor.** |
| As-of join | 59–66 | value at `d − BDay(1+lag)`, searchsorted right, stale > 7 d → NaN | Correct. A Monday row reads Friday. US holidays fall back to the last print. TP uses d−6 and the dollar d−7, as A1 says. Changes are taken over each series' own observations (`changes`, 69–71) and then joined, which is the right order. My `merge_asof` rebuild matches to 5e-14. |
| Differentials | 80–82 | US−DE on joint dates, dropna | Correct. Sign is US minus DE. EURUSD is USD per EUR, so a positive differential change should mean EURUSD down. The gate is sign-free (IC > 0 of the fitted forecast), so a sign error could not move it anyway. |
| Print-time alignment | 87–90, 107–108 | features ≤ d−1 (yields 15:30 NY d−1, Bund EOD d−1); target `ln P(d+h) − ln P(d)` with P = DEXUSEU noon NY | **No overlap in the models.** The latest input is 15:30 NY d−1; the target starts at noon d. The noon/15:30 overlap that RESULTS flags affects only the Phase B lag-profile cell (`run.py:204`, return d−1→d against the d−1 change). A2 already treats it as descriptive. Bundesbank publication time before noon NY on d is assumed in the prereg and not verified here. Even a one-day delay is covered by the d−2 robustness run. **Minor, unverified.** |
| Baseline | 99–103 | own returns ending at d−1, rv20 on returns to d−1, log VIX as-of d−1 | No lookahead. It is conservative: the d−1→d move is knowable at the noon print and is left out. That can only weaken M1. **Minor, cannot favour rates.** |
| Oil | 105–106 | `max(price, 1)` before the log | As A1 says. |
| Regimes | 112–116 | R1 60-obs DFII10 change; R2 from `r_US2_d20`; R3 VIX vs 252-row median | Known at d−1. OK. |
| Targets | 118–120 | `lp.shift(-h) − lp` on DEXUSEU rows (holidays already dropped) | Correct. h counts trading rows. Rows past the lockbox are NaN because the series is cut at END before shifting. Lockbox respected. |

### Models, scoring and gate

`run.py`

| Step | Lines | Check | Finding |
|---|---|---|---|
| Ridge fit | 35–44 | standardised on the training window only; intercept = training mean; penalty `lam·n·I` | No leak. **Scaling:** with standardised Z, Z'Z ≈ n·I, so the shrink factor ≈ 1/(1+λ). The grid 10^−2..10^3 therefore runs from ≈ OLS to 1/1001 of OLS. The prereg names the grid but not the scaling. This is a legitimate choice, but the top of the grid is extreme: under sklearn's unscaled `alpha` convention, λ = 1000 at n = 2,500 would be a 0.7× shrink. **Design, see finding F1.** |
| λ CV | 47–57 | 5 blocks, forward chaining (4 test folds), h-row purge, ≥ 200 training rows, SSE | Coded correctly. Winsor bounds come from the full training window, not each fold, but that only affects λ selection inside training. It picks λ = 1000 in 9/12 years at 5d and 5/12 at 20d. `planted_mech.py` shows it still picks 100–1000 when a ρ = 0.10 feature is planted, even with only 8 inputs (`m3_small`). That is genuine CV preference, not a bug: overlapping targets cut the effective n by h, the baseline relationships are non-stationary, and one λ shrinks every input alike. |
| Walk-forward | 60–79 | annual expanding refits 2015–2026; `tr_end = searchsorted(start) − h` purge; winsor bounds from training only | Purge correct: the last training row's target ends on the last day before the forecast year. No refit leakage. **But `ok_all` is per model.** M1 trains on 21 more early-2005 rows than M2–M5, so its intercept differs by ≈ 5e-5 at 5d (`diag.json`, `train_rows_and_intercepts`). That gap is comparable to the forecast dispersion (sd 8.5e-5) and leaks into M3 − M1. Training both on the same rows (`planted_mech.py`, `aligned_rows`) moves the planted ρ = 0.10 at 5d CW t from 0.41 to 0.87. That is real, but it is not why the control fails. **Minor (F4).** |
| Scoring | 82–92 | Clark–West `e1² − (e2² − (a−b)²)`, NW lag h, one-sided; Spearman IC of the big model's forecast; IC interval ±1.96·√(h/n) | CW is coded correctly, and NW lag h is conservative versus h−1. **The IC is the IC of the whole forecast, intercept included, pooled across 12 annual refits.** Under heavy shrinkage it measures the intercept (F2). The √(h/n) interval also ignores that the forecast is a near-constant step per year. Block and year-block bootstraps give different but similarly located intervals for the pooled IC (`diag.json`). The problem is what the IC measures, not its width. |
| M5 selection | 102–112 | same sign in both halves, \|t\| ≥ 2 | Uses `t = IC·√(n/h)`, not Newey–West as the prereg says. **Minor deviation.** It selects DIFF2 at 5d, and nothing at 20d (that cell is empty). |
| Placebo | 115–121, 277–289 | `np.roll` of the rate block by a random 250..n−250, keeping autocorrelation | Correct. Regimes and `m_de2_d20` are not rolled (minor). |
| `lag2` | 118–119 | shifts the rate, base and macro inputs by one row | Regime columns are not shifted. **Minor.** |
| Gate | 291–298 | Val and Test: R² gain > 0, CW p < 0.05, IC > 0; Test R² gain > placebo p95; Holm on Test CW p | **Matches the prereg literally.** But the "IC > 0" leg uses the full-forecast IC, which M0 alone fails at 5d/20d (−0.11/−0.20). Any heavily shrunk model inherits that. With a planted ρ = 0.10 at 5d, M3's IC is still −0.068 (`planted_mech.json`, `as_coded`), so that leg fails even when a real signal is present (F2). |
| Trading rule | 139–154, 300–319 | sign(f) in h overlapping tranches; ret_next = noon d → noon d+1; 1 bp per unit turnover | Correct and costed. Under heavy shrinkage, sign(f) ≈ sign(training mean), so the rules are near-constant. Descriptive only. |
| Phase C and F robustness | 232–247, 333–355 | forward-M3 IC by regime and by variant | Every one of these is the full-forecast M3 IC, so every one inherits the intercept. That is why "no TP", "d−2", "drop top 1%" and the regime splits all report the same −0.10 / −0.18. **They are not independent evidence that the rate view is wrong (F3).** |

### Findings

| # | Finding | Where | Severity | Could it move the verdict? |
|---|---|---|---|---|
| **F1** | Heavy CV ridge shrinkage (λ up to 1000 under `lam·n` scaling = 1/1001 of OLS) makes the forecasts almost entirely the annual training mean. CV is coded correctly; this is the design. With λ fixed at 0.1, the same ladder detects a planted ρ = 0.10 at 5d in 4/5 reps, against 0/5 as coded. | `run.py:12,35–38,47–57,76` | **major** (design) | Yes. It is why the ladder can't see moderate effects, so the 5/20d null is a power failure. |
| **F2** | The reported OOS ICs (−0.10..−0.21) and the gate's "IC > 0" leg measure the intercept, not rates. M0 (expanding mean) has the same Test IC: −0.111 at 5d, −0.204 at 20d. Within-year IC of M2/M3 at 20d is +0.015 / +0.016. The claim in RESULTS and A2(1), that the 5/20d forecasts "carried a rate view whose OOS IC interval lies below 0 and excludes the bar", is false. | `run.py:89,296–297`; `RESULTS.md` (Verdicts, "EURUSD is NULL at 5 and 20 days"); prereg A2(1) | **critical** (for the verdict word) | **Yes: NULL → UNDERPOWERED** at 5/20d. |
| **F3** | The Phase C regime ICs and the Phase F robustness lines are all full-forecast IC, so they repeat F2. Their agreement isn't corroboration. | `run.py:243–246,334–354` | major | Supports F2 |
| **F4** | M1 and M2–M5 train on different rows (21 early-2005 rows), which gives an intercept offset of 3–5e-5 inside M3 − M1. That biases Clark–West slightly. | `run.py:66,72` | minor | No. Alignment moves the planted CW t from 0.4 to 0.9, still not detected. |
| **F5** | DE yields have no 2004 warm-up, so DIFF2/DIFF10 20-obs changes start 2005-02-02. | `panel.py:32–35` | minor | No |
| **F6** | M5 screening uses an IC t of √(n/h), not Newey–West. | `run.py:109` | minor | No |
| **F7** | The `lag2` and placebo variants do not shift or roll the regime columns. | `run.py:118–121` | minor | No |
| **F8** | The baseline leaves out the knowable d−1→d return. | `panel.py:101–102` | minor | No. It can only weaken M1. |
| **F9** | The Bundesbank publication time is assumed, not verified. | prereg §3 | minor | No. The d−2 run gives the same picture. |
| **F10** | The planted control (A2) is correctly coded. Its limits: 3 reps, iid planted feature, M3 only, CW-t detection. It understates how insensitive the IC leg is (F2). | `planted.py` | minor | Supports UNDERPOWERED |

## 2. Reproduce

**Exact match.**

1. `python scripts/yield-predictive-ladder/panel.py` rebuilt the panel from the committed raw CSVs and
   `dynlead/yields_daily.parquet` in 5 s. `panel_eurusd.parquet` came out byte-identical; git saw no change.
2. `python scripts/yield-predictive-ladder/run.py eurusd` ran with NPLAC = 200 and seed 20261021, in 2,299 s (the
   banked run took 1,402 s; this one ran alongside other audit jobs). `results_eurusd.json` is identical in every
   field except `runtime_s` (`compare.py`: 0 differences). That covers the cells, the placebo p95s, the λ choices,
   the rules, Phase A–C and the robustness lines.
3. `python scripts/yield-predictive-ladder/planted.py` took 128 s, and `planted.json` came out byte-identical.

The worktree copy of `results_eurusd.json` was then restored with `git checkout`, which removed only the runtime
field change.

## 3. Plant

**Is the study's control correct?** Yes, as code (`planted.py:17–26`). It plants `feat = ρ·z(y_h) + √(1−ρ²)·noise`,
which is known at d and has correlation ρ with the future h-day return. It enters as a rate feature (so M2–M5 all get
it) and is scored by M3-vs-M1 Clark–West on 2015–26, with t > 1.645 counting as detected. The re-run reproduced
`planted.json` exactly.

**Why is the ladder insensitive?** `planted_mech.json`, EURUSD, 5 reps, M3 vs M1 over 2015–26:

| planted | variant | detected | CW t | IC of M3 | IC of M3 − M1 | within-year IC of M3 |
|---|---|---|---|---|---|---|
| ρ 0.10, 5d | as coded | 0/5 | 0.41 | **−0.068** | +0.010 | −0.006 |
| ρ 0.10, 5d | λ fixed at 0.1 | **4/5** | 1.93 | +0.049 | +0.068 | +0.060 |
| ρ 0.10, 5d | M1 on M3's rows | 0/5 | 0.87 | −0.048 | +0.031 | +0.011 |
| ρ 0.10, 5d | M3 = baseline + plant only | 1/5 | 0.71 | −0.044 | +0.013 | +0.014 |
| ρ 0.10, 20d | as coded | 0/5 | 1.05 | −0.144 | −0.033 | −0.005 |
| ρ 0.10, 20d | λ fixed at 0.1 | 0/5 | 0.86 | +0.012 | +0.037 | +0.046 |
| ρ 0.05, 5d / 20d | any | 0–1/5 | — | — | — | — |

The insensitivity comes from the **design**, not a coding bug. CV on overlapping, non-stationary daily targets
chooses near-total shrinkage, and one λ shrinks every input alike, so the planted feature is crushed with the noise.
What survives is the yearly intercept. It dominates the pooled IC, which stays negative even with a real ρ = 0.10
signal inside it. The intercept offset from mismatched rows (F4) adds a little noise to Clark–West.

**Would a simpler, correctly specified test see ρ = 0.05?** `reimpl.py`, part D, 20 reps each. The test is expanding
annual OLS of y_h on [planted, US−DE 2y 20d change, momentum]. Detection means the OOS 2015–26 Spearman IC of what
the planted feature *adds* to the slope-only forecast has a 63-row block-bootstrap one-sided p < 0.05.

| planted ρ | iid feature (as the study plants), 1d / 5d / 20d | persistent feature (20-day rolling sum, like a real rate change, put into the target), 1d / 5d / 20d |
|---|---|---|
| 0 (false positives) | 0 / 1 / 2 of 20 | 1 / 0 / 3 of 20 |
| 0.03 | 5 / 6 / 2 | 11 / 2 / 1 |
| **0.05** | **13 / 13 / 12** | **19 / 10 / 4** |
| 0.10 | 20 / 20 / 19 | 20 / 17 / 11 |

So:

- **5 days.** A simple test detects the study's own kind of planted ρ = 0.05 about 65% of the time, and ρ = 0.10
  always. The ladder detects ρ = 0.10 in 0/3. A realistic persistent ρ = 0.05 is seen 50% of the time.
- **20 days.** A persistent ρ = 0.05 is seen only 4/20 of the time, even by the simple test. 20d is underpowered for
  moderate effects on this sample whatever the method. A null there can't be NULL.

## 4. Re-implement

`reimpl.py` imports nothing from the study. It rebuilds the inputs from the cached FRED CSVs and the Bundesbank
parquet with `pd.merge_asof`, using rate data strictly before the FX print date.

**Cross-check against the study's panel:** y1/y5/y20, mom20, DIFF2 5d/20d and DIFF10 20d match on every row. There
are 0 rows mine-only or theirs-only, and the maximum difference is 5.5e-14.

OOS Spearman IC, Test 2020–26 (Validation 2015–19 in brackets), 63-row block-bootstrap 95% intervals:

| Forecast | 5 days | 20 days |
|---|---|---|
| intercept only (expanding mean = M0) | **−0.111** [−0.198, −0.047] (val −0.116) | **−0.204** [−0.362, −0.048] (val −0.228) |
| momentum only, full forecast | −0.089 | −0.174 |
| D2_20 + mom, full forecast | +0.010 [−0.07, +0.10] | +0.021 [−0.13, +0.16] |
| D2_20 + mom, slope only | +0.015 [−0.07, +0.10] | +0.044 [−0.11, +0.20] |
| D2_5 + D2_20 + D10_20 + mom, slope only | +0.012 [−0.06, +0.11] | +0.085 [−0.07, +0.23] (val −0.110) |
| increment of D2_20 over mom | +0.014 [−0.07, +0.10] (val +0.063) | +0.048 [−0.11, +0.20] (val −0.034) |
| raw D2_20 (nothing fitted) | −0.015 | −0.053 [−0.21, +0.11] |

At 1 day, the D2_20 increment has a Validation IC of +0.049 [+0.008, +0.094] and a Test IC of +0.014 [−0.02, +0.06].
That is not stable, and is consistent with the study's 1d UNDERPOWERED.

**The gap explained.** The reported −0.10..−0.21 is reproduced *exactly* by the intercept-only forecast (−0.111 /
−0.204, the same as the study's M0). Anything rate-specific sits at about 0, with intervals that span both 0 and the
registered bars (0.10 at 5d, 0.15 at 20d). The OLS betas on the differential are negative in every refit year (the
expected sign: a wider US−DE gap means EURUSD down), shrink by about half from 2015 to 2026, and do not forecast out of
sample. That is a plain null *point estimate* with an interval too wide to call NULL.

## 5. Account

| Stage | Rows | Dropped and why |
|---|---|---|
| DEXUSEU file rows, 2004-01-01..2026-08-21 | 5,907 | 232 blank (US holidays) → 5,675 prints |
| Panel, 2005-01-03..2026-08-21 (2004 = warm-up) | 5,422 | — |
| All M3 inputs present | 5,401 | 21 (2005-01-03..2005-02-01): DE yields start 2005-01-03, so no 20-obs differential change yet. M1 keeps all 5,422 (F4). |
| Training before 2015 | 2,513 rows; 2,492 with all inputs | the same 21 |
| Validation 2015–19 | 1,249 | none |
| Test 2020-01-02..2026-08-21 | 1,660 | the last h rows have no target: scored n = 1,659 / 1,655 / 1,640 for h = 1 / 5 / 20 |
| Annual refit purge | h rows before each forecast year | by design |
| Release flag | 724 release days, 4,059 non-release | 639 NaN, outside calendar coverage (before 2007-07 or after 2026-07-02), excluded from the event splits only |

The panel rebuilt today is identical to the committed one (0 values differ, 0 NaN-pattern mismatches).

## Verdict integrity

**BUG-VERDICT-AT-RISK.** The pipeline is mechanically correct and reproduces exactly. But the evidence offered for
NULL at 5 and 20 days is the intercept's IC, not the rates' (F2). Two things count against the rates being measured
at all:

- the ladder can't detect a planted ρ = 0.10 at 5d (F1, and A2's own control);
- the honest rate-specific IC intervals include the registered bars.

The prereg's own §5 rule therefore gives **UNDERPOWERED**, not NULL, for EURUSD at 5d/20d. EURUSD 1d is already
UNDERPOWERED, so the ledger entry should read UNDERPOWERED overall. Nothing here points to a positive edge. That
re-banking is for the owner: this audit does not edit `js/deskEvidence.js`.

If the question is re-opened, it needs a new prereg (`yield-ladder-eurusd-confirm`). The ridge ladder can't decide
it, so the honest instrument is a small fixed-feature OLS or an incremental-IC test like `reimpl.py`. Its power
table should come from a persistent planted signal, not √(h/n).

## Cost of this audit

Wall clock 18:32 → about 19:20, roughly 50 minutes. Most of that was the 38-minute registered re-run, which ran in the
background.

| Step | Analyst time | Compute | Data fetched |
|---|---|---|---|
| 1. Trace (prereg, RESULTS, `panel.py`, `run.py`, `planted.py`, the DE source in `dynlead/build_panels.py`) | ~15 min | — | none |
| 2. Reproduce | ~3 min | panel 5 s, run 38 min (background), planted 2 min | none (raw CSVs committed). Fresh FRED check: 3 public CSVs, ~0.6 MB |
| 3. Plant (`planted_mech.py`, part D of `reimpl.py`) | ~10 min | 2 min + 4 min | none |
| 4. Re-implement (`reimpl.py`) | ~10 min | 4 min, including the planted runs | none |
| 5. Account (`accounting.py`) and write-up | ~10 min | seconds | none |

For a 150-study audit: this study kept its raw inputs in git, so the only fetch was an optional vintage check. Most
of the time went to tracing and to the diagnostic that compares each model's IC with the no-signal M0. That check
took 4 minutes and would catch this failure mode in any study that scores the IC of a shrunk forecast: comparing
against M0 is the cheapest high-yield test.
