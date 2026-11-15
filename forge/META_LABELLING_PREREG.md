# meta-labelling — Can a second model decide WHETHER to act on the bias-learner's daily call, and earn more per traded day than acting every day?

**Pre-registered 2026-11-15, before any meta-label outcome was computed.**

| | |
|---|---|
| ID / ledger id | `meta-labelling` (one register row; one ledger id; 4 scored cells) |
| Branch | `claude/signal-bot-bias-analysis-bwr1qv` |
| Register row | `plans/RESEARCH_REGISTER.md` → `meta-labelling` (CLAIMED; maintained by the parent session) |
| Source of the question | `plans/DAILY_BIAS_REVIEW.md` §5 test 5; `plans/BIAS_RESEARCH_SYNTHESIS.md` merged order 6–8; López de Prado, *Advances in Financial Machine Learning* ch. 3.6 (meta-labelling) |
| Data | **Primary call:** the bias-learner's out-of-sample probabilities at the 21:00 horizon, `analysis/output/bias-learner/evidence/oos_predictions.parquet` (committed; rebuilt by `scripts/bias-learner/evidence.py` with the registered runner's own functions, BSS reproduces the banked +0.045%), 13 instruments, 2018-01-02 → 2026-08-20. **Outcomes:** local bid/ask M1 `data/m1_bidask/<key>_m1.parquet` and the NY-close daily bars, through the unchanged R machinery of `scripts/slow-bias-clock/run.py` (`read_bidask`, `load_daily_all`, `build_panel`, `M1Inst`, `r_entries`, `trade_R`) — the same E0 trade as `exit-on-fixed-entries` / `coherence-conviction`. **Calendar:** US tier-1 releases `analysis/output/post-release-drift-pooled/events.parquet` (scheduled; known in advance). Everything ends **2026-08-21** (lockbox): M1 cut before 2026-08-21 21:00 UTC and asserted; no price after 2026-08-21 is read. |
| Seed | `20261115` (one for every script in this study) |
| Uncertainty | date-block bootstrap, block 21 sessions, B = 2000 (clusters = dates; the 13 instruments on one date move together) |
| Scripts / outputs | `scripts/meta-labelling/run.py` → `analysis/output/meta-labelling/` (+ `evidence/<cell>/` from `scripts/evidence_pack/pack.py`) |
| Harness | own script; imports `scripts/slow-bias-clock/run.py` for R, unchanged. `python -X utf8 -I`, R2 env unset, local files only, ≤ 2 threads, one process |

## 1. The claim (required)

`plans/DAILY_BIAS_REVIEW.md` §5 test 5: *"Meta-labelling: a second model deciding whether to act on a call, not which
side."* The review's step 5 ("abstain unless…") and §7 ("call about 20 to 40% of instrument-days; be right perhaps 55 to
58% of those") both assume that **the days worth acting on can be told apart in advance**. The bias-learner found
the gain it has only in its two extreme deciles; the meta-model asks whether morning context (vol regime, the release
calendar, weekday, the overnight gap, the call's recent record, its strength) separates the call's good days from its
bad ones well enough to raise R per traded day.

**The claim tested here:** a second-stage classifier, fitted walk-forward only on the call's past out-of-sample days,
that outputs act / stand aside, raises (C1) mean R per traded day, (C2) the hit rate per traded day and (C3) the
daily-book Sharpe above acting on every day — **and does so by more than a random stand-aside of the same fraction**
(the placebo that kills the mechanical effect of simply trading less) — and (C4) beats the simplest abstention rule,
acting only when the call itself is strong.

**Edge source (method lesson #4):** none new. The bias-learner call is a tiny forecasting skill (NULL, BSS +0.045%).
Meta-labelling claims no new side information; it claims **conditional skill**: the call may be right in some states
(low vol, no release, after a run of hits) and noise in others. Who is on the other side: nobody in particular. The
honest prior is that a near-zero primary leaves nothing for a meta-model to concentrate.

## 2. Prior art and why it is not already settled (required)

| Ledger entry / note | Verdict | What it answered | What differs here |
|---|---|---|---|
| `meta-label-trust-lines`, `-persist` (2026-10-06, `forge/META_LABEL_PREREG.md`) | NULL | A morning meta-label predicts **whether the p75 range lines are passed** (range, not direction); real skill 4.8% but mis-calibrated; after the forecast's persistence fix, nothing left | range target, not a direction call; no act/stand-aside R |
| `meta-label-yield-spread` (2026-10-06) | NULL (wrong way round) | vol-state meta-sizing of the yield-spread book, 221 trades: Sharpe −0.065 [−0.117, +0.006] | 221 trades, slow book. Here ~24,000 daily rows (≈ 1,900 dates × 13) |
| `meta-label-proper` (2026-10-07) | NULL | AFML pipeline on the yield-spread CUSUM primary: precision +1.0 pp [−1.7, +3.6], Sharpe +0.002 [−0.05, +0.05]; **sanity check failed**; ~395 effective bets. Its `use` line: *"Meta-labelling closed (stopping rule). Effective sample, not method, is the limit."* | the stopping rule closed meta-labelling **of the yield-spread book** for want of sample. This is a different primary (a daily call on 13 instruments) with ~60× the effective sample, so the stopping rule's own condition (more independent data) is met. The sanity-check idea is kept: §3.6(e) |
| `meta-label-long` (2026-10-07) | NULL | same book, 1976+ data, ~754 effective bets: precision gain [−2.0, +2.1 pp] | as above |
| line-confluence meta-label (deskEvidence ~l.1040) / rich-IV break meta-label (~l.1112) | NULL | meta-labels at a line touch / on a rule's trades: no information beyond geometry; taken − all −0.010R [−0.135, +0.113] | intraday trade rules; here the primary is the daily direction call |
| `stress-filter-hold-*` (2026-11-02) | UNDERPOWERED / NULL | VIX-stress stand-aside on an NQ hold: stressed days no worse; adds nothing beyond vol sizing | one hand-picked stand-aside state on a buy-and-hold. Here a fitted, multi-feature filter on a direction call; the stress state enters only as one feature (σ20 percentile) |
| `iv-sizing-filter` (2026-09-23) | NULL | term-structure stress stand-aside: wrong sign, cut good trades | as above |
| `conviction-vote` (2026-07-25) | NULL (anti-predictive) | an unscored internal conviction score was anti-predictive | the filter here is fitted and scored walk-forward against a random-same-fraction placebo before anyone uses it |
| `bias-learner-fx/gold/idx` (2026-11-15) | NULL / UNDERPOWERED | the call is FLAT (BSS +0.045% [−0.017%, +0.102%]); gain only in extreme deciles; accuracy-coverage by |p − 0.5| described, not scored as a filter | that study chose **the side**; this one takes the side as given and scores **whether to act**, with C4 testing whether anything beats "act when the call is strong" |
| `coherence-conviction` (2026-11-15, same branch) | UNDERPOWERED / NULL cells | one hand-specified conditioner (cross-asset agreement) on the 4h lean: ΔR COH − all −0.001R [−0.023, +0.022] | a single fixed state on a different lean; here a fitted multi-feature filter on the bias-learner call |
| `regime-picks-rule` (2026-11-15, same branch) | NULL / UNDERPOWERED | ATR / HMM regime picking fade / follow / break: every rule loses net in every regime | regime picks the rule; here context picks act vs stand aside on a fixed rule |

Not a re-run of a banked null: no ledger entry fits a walk-forward act / stand-aside model on a daily direction call
and scores it against a random stand-aside of the same fraction.

**Method lessons applied** (`education/RESEARCH_METHOD_LESSONS.md`): #1 positive control before the real run
(selftest + full-pipeline planted power stage on the real rows); #4 edge source named (§1); #5 linear baseline first
(logistic is primary; a shallow GBM is a secondary, descriptive arm); #9 date-clustered SEs; #12 what the model gives
up vs the simpler baseline (C4: the strength-only rule); #14 causal labels (every feature from data ≤ 07:00 London on D;
no smoothed HMM — see §3.3); #19 fit window (rolling 3-year arm beside expanding, descriptive); #25 quantile ladder
(R by decile of the meta probability); #27 management fixed (the E0 trade, no stop/exit variants).

## 3. Definitions, fixed in advance (required)

### 3.1 The primary call (picks the side) — the bias-learner's daily call

- **Which lean and why.** The brief names the bias-learner's daily call as the natural primary. It is the only banked
  daily lean with (a) a fitted probability, so it carries a strength, and (b) out-of-sample history on all 13
  instruments from 2018-01 (walk-forward by year, `forge/BIAS_LEARNER_PREREG.md`). The 4h-trend lean is taken by the
  sibling `coherence-conviction` study and has no strength.
- **Side** on instrument i, London date D: **+1 if p > 0.5, −1 if p < 0.5** (the bias-learner's own "call"
  definition, prereg §6 accuracy–coverage and its R table), using p at the **21:00 horizon** (07:00 London → 21:00
  London, the same window as the trade). p = 0.5 exactly → no row.
- Consequence, stated now: on indices (base rate ≈ 0.54–0.58) the call is almost always long, and on EURUSD almost
  always short; the call is mostly each market's base-rate drift plus a small learned lean. That is the call the desk
  would have shown, and it is what the meta-model is asked to filter.

### 3.2 The trade, its R and the meta label

Exactly the E0 trade of `exit-on-fixed-entries` via `slow-bias-clock.r_entries`: entry at the 07:00 London M1 bar (ask
for long, bid for short); stop 1·σ20 (SD of the last 20 NY-close log returns completed before 07:00 London on D);
stop checked on the bid/ask M1 path, a gap through fills at that bar's open; exit at the open of the 21:00 London bar.
Spread is inside every R.
- **R** = R_L if side > 0, R_S if side < 0.
- **Meta label** m = 1{R > 0} (the call made money net of spread).
- Rows: (date, instrument) where both a primary p and an R entry exist, 2018-01-02 → 2026-08-21.

### 3.3 Meta features — all known at 07:00 London on D (k = the last NY close completed before 07:00 London on D)

| # | Feature | Definition | Known because |
|---|---|---|---|
| 1 | `conf` | \|p − 0.5\| | p is built from bars before 07:00 London (bias-learner §3.3, selftest-perturbed) |
| 2 | `beyond` | side · (p − b0): how far the call leans beyond the market's own base rate, in the call's direction | b0 uses only labels realised before D |
| 3 | `atr_pct` | percentile of σ20(k) within its own last 252 values ending at k (min 126) — the ATR-percentile vol regime | NY closes ≤ k |
| 4 | `vol_ratio` | ln(σ20(k) / σ60(k)) — vol rising or falling | NY closes ≤ k |
| 5 | `ev_today` | 1 if a US tier-1 release (NFP, CPI, PPI, FOMC; 681 events 2010-01 → 2026-08-13) is scheduled on London date D, else 0 — the pre-release flag | scheduled calendar, published in advance |
| 6–7 | `mon`, `fri` | weekday dummies | calendar |
| 8 | `gap_side` | side · ln(P(07:00 D) / P(17:00 NY on k)) / σ20(k), both prices M1 mid opens of the same bid/ask file: the overnight move, with (+) or against (−) the call | M1 bars < 07:00 London D |
| 9 | `gap_abs` | \|gap\| in σ20 units | as 8 |
| 10 | `hit20` | the call's hit rate (m) on this instrument over its last 20 rows dated < D (min 10, else missing) — the recent record | each m resolves at 21:00 London on its own date < D |
| 11 | `hit5_all` | mean m over all instruments' rows on the last 5 dates < D | as 10 |
| 12 | `h4_agree` | side · (4h EMA20 slope sign at 07:00 London, `M1Inst.slope`) ∈ {−1, 0, +1} | H1 bars completed before 07:00 |
| 13–14 | `g_gold`, `g_idx` | group dummies (FX is the base) | static |

- **Not included, and why.** A filtered HMM vol state: the repo's HMM code is either Viterbi on the full sample
  (`regime_classifier_mtf.py`, hindsight; lesson #14) or lives inside `regime-picks-rule`'s runner; `atr_pct` and
  `vol_ratio` are the explicit-state stand-ins (lesson #5: the explicit state first). Implied vol, COT, carry and
  surprises are already inside p.
- Missing values (warm-up, US holidays for the gap) are filled with the training mean of that fit; never imputed from
  the future. No missing flag (kept simple).

### 3.4 Meta-model and walk-forward (fixed, not tuned)

- **Model (primary):** logistic regression, features standardised on the training rows, L2 with C = 1.0, `lbfgs`,
  max_iter 1000. No hyperparameter is chosen on any window.
- **Walk-forward:** test years **2019 → 2026** (2026 ends 2026-08-21). For test year Y the model is fitted on all rows
  dated ≥ 2018-01-02 and **< 1 January Y minus a 5-session embargo** (expanding). Labels resolve on their own date
  (21:00 London), so no label overlaps the test year; the embargo also keeps `hit20` / `hit5_all` of the first test
  days from being built from rows the model trained on in the same week. The primary p is itself out-of-sample for
  every row (the bias-learner refits by year with its own embargo), so the meta-model never sees a primary fitted on
  its own scoring window.
- **Act rule:** act on a test row if its meta probability ≥ **the median of the fitted model's probabilities on its own
  training rows** (so ≈ half the days are acted on; set inside the training data only).
- **Strength-only baseline (C4):** act if conf ≥ the median of conf on the same training rows (pooled, one threshold
  per test year).

### 3.5 Scored cells (pooled over the 13 instruments; test rows 2019-01-01 → 2026-08-21)

Act-all = every primary row; meta = rows with act = 1. Daily book: on each date, P&L = Σ_i act_i · R_i / n(date), where
n(date) = number of primary rows that date (stand-aside contributes 0; equal risk per instrument-day). Act-all uses
act ≡ 1. Sharpe = mean / SD of the daily book × √252.

| Cell | Statistic | Bar |
|---|---|---|
| **C1** `dR_meta_all` | R̄(meta acted) − R̄(all rows) — R per traded day | 0.05R |
| **C2** `dhit_meta_all` | hit(meta acted) − hit(all rows) | 0.03 (3 pp) |
| **C3** `dSR_meta_all` | Sharpe(meta book) − Sharpe(act-all book), net of spread | 0.30 |
| **C4** `dR_meta_conf` | R̄(meta acted) − R̄(strength-only acted) | 0.05R |

- **Random same-fraction stand-aside (the key placebo), 1000 draws:** the act flags are permuted within
  instrument × test year (same fraction acted, same instruments, same years; only the choice of days is random) and each
  cell is recomputed. For C1/C2 the placebo centres on 0 by construction; for C3 it does **not** (trading less changes
  the book's Sharpe mechanically: toward 0 if act-all is negative, down by ≈ √f if positive), which is exactly why the
  Sharpe gate is "above the 97.5th percentile of this placebo", not "above 0". For C4 the placebo replaces the meta
  set by a random set of the same fraction.
- **Halves:** test rows split at the middle date (≈ 2022-10).
- **Mirror:** "the days the model stood aside on were better" — the same statistic with act flipped (1 − act); reported;
  if its CI is wholly > 0 the cell is WRONG SIGN, never a pass.
- **Bars.** 0.05R is the desk's bar for a daily trade rule (`exit-on-fixed-entries`, `coherence-conviction`), above a
  round trip of spread (~0.03R). 3 pp lifts the call's ≈ 47–49% net hit rate toward the 51–52% a called day needs to be
  worth its spread. 0.30 Sharpe is `slow-bias-clock`'s book bar.

### 3.6 Positive control before the run (method lesson #1) — `run.py --selftest`

On synthetic data through the same functions as the real run; the real run aborts if any fails:
- (a) **planted act-signal recovered:** synthetic 13-instrument × ~2,000-date panel with real-shaped R (−1 floor,
  date-common component), the 14 features as noise, plus one feature that shifts R by +0.25R per SD: C1 CI lower > 0
  and C1 ≥ 0.05R;
- (b) **zero-effect world = null:** same panel with no planted feature: C1 and C3 CIs include 0 (or no cell VALIDATED);
- (c) **look-ahead canary, outcome fed in:** feeding m (the outcome) as a feature must blow C1 up (> +0.4R);
- (d) **look-ahead canary, future feature:** `hit20` built with the row's own date included (a one-day leak) must lift
  C1 above the clean run on a panel with daily-persistent outcomes; and the real feature builder must be invariant
  when every R dated ≥ D is replaced by noise (features for D unchanged);
- (e) **sanity check (from `meta-label-proper`):** on (a), the top meta-probability quintile has the highest mean of the
  planted feature;
- (f) the R function on a hand-built path returns the known R (stop, gap fill, 21:00 exit) — `slow-bias-clock`'s check.

### 3.7 Power stage on the real rows (before any scored estimate is computed)

The brief's warning applies: planting on top of the real estimate confounds detection with the real sign. So the
**real effect is removed first**: the outcome columns (R, m) are moved by one common circular date shift (a random
offset of 250–1,500 dates on the common date grid, the same for every instrument), which keeps each date's
cross-instrument structure and R's distribution and breaks any link between features and outcomes. A planted feature
z ~ N(0, 1) per row is appended, R' = R_shift + γ·z, m' = 1{R' > 0}, and the **whole walk-forward pipeline** (fit, act
rule, C1 estimate, 21-day block bootstrap B = 300) runs 30 times per γ ∈ {0.05, 0.10, 0.15, 0.25, 0.40}. Detection =
C1 z-statistic ≥ the Holm first-step critical value (2.50). **Simulated MDE** = the mean realised C1 at the smallest γ
detected in ≥ 80% of runs (linear interpolation in detection rate). The same runs report C3's realised Sharpe change.
`power_sim.json` is written before any real C1–C4 estimate.

## 4. Hypotheses, expectation first (required)

| Cell | Pre-registered expectation |
|---|---|
| C1 ΔR meta − all | **≈ 0 (\|Δ\| < 0.02R).** The primary is FLAT; meta-labelling concentrates a primary's skill, it cannot create it. The likeliest non-zero source is the vol regime (a 1σ20 stop is relatively wider/narrower when σ20 lags realised vol), which is about trade shape, not the call |
| C2 Δhit | ≈ 0 (\|Δ\| < 1.5 pp) |
| C3 ΔSharpe | negative or ≈ 0 vs act-all; at the random-same-fraction placebo's centre |
| C4 meta − strength-only | ≈ 0 |
| **THE GATE** per cell | estimate's 95% CI lower > 0 **and** Holm-adjusted p < 0.05 over the 4 cells **and** same sign in both halves **and** above the random-same-fraction placebo's 97.5th percentile **and** the mirror not significantly > 0 |

**Verdict per cell:**

| Condition | Word |
|---|---|
| gate holds and estimate ≥ bar | `VALIDATED` |
| CI lower > 0 and Holm p < 0.05, but estimate < bar, or halves / placebo / mirror fails | `CONTEXT` |
| gate fails, cell POWERED (binding MDE ≤ bar, and the pack's 1× plant found in ≥ 80%), CI upper < bar | `NULL` |
| otherwise | `UNDERPOWERED` |

Binding MDE = max(design MDE §5, 3.34 × the run's SE_used, the simulated MDE §3.7 for C1). SE_used = max(bootstrap SE,
SD of the random-same-fraction placebo); p = two-sided normal from est / SE_used (for C3, from (est − placebo mean) /
SE_used, the excess over trading less). **Ledger-id word:** VALIDATED if C1 or C3 is VALIDATED; else CONTEXT if any
cell is CONTEXT or C2/C4 is VALIDATED; else NULL if every cell is NULL; else UNDERPOWERED.

## 5. Power — what this design can and cannot find (required)

Holm first-step α = 0.05/4 two-sided → z = 2.50; MDE = (2.50 + 0.84) × SE = 3.34 × SE.

Design SEs (before any outcome is read; assumptions stated, calibrated on `coherence-conviction`'s block-bootstrap
intervals for a "subset − all" contrast on the same E0 R, ±0.022R for a 29% subset): ~24,000 test rows over ~1,900
dates, half acted on.

| Cell | Design SE | **Design MDE** | Bar | By design |
|---|---|---|---|---|
| C1 ΔR meta − all | 0.010R | 0.033R | 0.05R | POWERED |
| C2 Δhit | 0.006 | 0.020 | 0.03 | POWERED |
| C3 ΔSharpe | ~0.25 (two ~7.6-year Sharpes, correlated ~0.7) | ~0.85 | 0.30 | **UNDERPOWERED by design**: 7.6 years cannot resolve a 0.3 Sharpe difference; reported, expected UNDERPOWERED unless the effect is very large |
| C4 meta − strength | 0.012R | 0.040R | 0.05R | POWERED (marginal) |

These are rough; the simulated MDE (§3.7) and the run's SE are binding. A meta-filter worth having would lift R per
traded day by ≥ 0.05R; smaller lifts (~0.01–0.02R) are below every MDE and would show as NULL only if the interval also
excludes the bar.

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored cells: 4** (C1–C4), Holm at α = 0.05.
- **Decomposition / description (BH q = 0.10 over the listed tests; candidates only, registered now so none can be
  chosen later):**
  - single-feature stand-aside rules: for each of the 12 non-dummy features, act on the half of days on the side of
    that feature's training median that the training data favours (chosen inside training, same walk-forward): ΔR vs
    all, 12 tests;
  - C1 by group (FX, gold, indices): 3 tests;
- **Described, not tested:** GBM arm (`HistGradientBoostingClassifier`, max_depth 2, max_iter 100, learning_rate 0.05,
  min_samples_leaf 200, seed 20261115) for C1–C4; rolling 3-year training window arm (lesson #19); a sized arm
  (size = 2 × the training-percentile of the meta probability, mean ≈ 1; Sharpe vs act-all); the alternative primary
  side = sign(p − b0) (the call beyond the base rate) through the same pipeline; R and hit by decile of the meta
  probability (lesson #25); the fraction of days acted per year and instrument; logistic coefficients per fit
  (sign stability).
- **Promotion bar:** anything that sizes a live position needs |t| ≥ 3 on its scored cell and a forward pass.

## 7. What this does NOT test (required)

- Not a better side: the side is the bias-learner call, fixed. Not other primaries (4h trend → `coherence-conviction`;
  forward desk / Max calls → bias-scoreboard when 120+ days exist).
- Not other horizons (+1, +3, +5) — the trade is the same-day E0 window only.
- Not trade management (fixed E0; lesson #27), not position sizing beyond the descriptive sized arm.
- Not a tuned model: no hyperparameter search; a tuned or deeper model would need its own prereg with nested CV.
- Not the lockbox (2026-08-22 →), which stays sealed.

## 8. What each verdict changes (required)

- **C1 or C3 VALIDATED** → ledger entry; the morning card shows a research-only "act / stand aside" tag beside the
  bias-learner line, forward-scored on the bias-scoreboard; nothing sizes on it until |t| ≥ 3 or a forward pass.
- **CONTEXT** → described on the card ("the call has done slightly better on days like today"), never a filter.
- **NULL** → the card's "no view" days cannot come from a fitted act/stand-aside model on this call: abstention stays
  rule-based (the review's step 5 thresholds) and is scored as such. Meta-labelling the bias-learner is closed until
  the primary itself shows skill.
- **UNDERPOWERED** → not claimed either way; the meta tag is logged on the forward scoreboard and judged when the forward
  record reaches the MDE.

## Amendments

*(none yet)*

---

## RESULTS — run <YYYY-MM-DD>

*Written to `analysis/output/meta-labelling/RESULTS.md`. Nothing above this line changes after the run.*
