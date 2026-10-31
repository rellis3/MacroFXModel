# direction-bar — what must a directional forecast beat, can our data see it, and where do the existing direction cells stand against the right baseline?

**Pre-registered 2026-10-31, before any outcome was computed.** Phase 0 of `plans/MACRO_DIRECTION_RESEARCH_PROPOSAL.md`,
approved by the owner 2026-10-31 with four corrections, all adopted here:
1. Detectability is measured **relative to each instrument's own baseline**, never relative to 50%. The proposal's
   §0 table did the opposite (e.g. NQ 20-day "detectable 0.586" was 0.5 + 2.8·√(0.25/267), below NQ's own 0.653
   base rate). That table is withdrawn and replaced by this study's output.
2. Minimum detectable effect, statistical evidence and economic break-even are three separate numbers, never merged.
3. The existing validated direction cells are re-scored against the right baseline, with historical validation kept
   apart from genuine out-of-sample evidence and the multiple-testing history counted.
4. The forward ledger records baseline forecasts beside every research forecast (probability, model version,
   horizon, realised outcome) and is the permanent evidence record.

| | |
|---|---|
| ID / ledger id | `direction-bar` (one entry, CONTEXT: a measuring instrument and infrastructure, no directional claim) |
| Branch | `claude/direction-bar` |
| Register row | `plans/RESEARCH_REGISTER.md` → `direction-bar` |
| Data | `features/px_d1_*` (OANDA daily mid closes, 17:00 New York): NAS100, SPX500, XAUUSD, EURUSD, GBPUSD, USDJPY, plus AUDUSD, NZDUSD, USDCAD, USDCHF for the FX cross-section; `rate3m_*` (ALFRED vintages, point-in-time by `asof`) for carry; `spread_profile` and `analysis/output/cost-verification/cost_table.json` for costs. Window 2006-01-01 → **2026-08-21** (lockbox respected; nothing after is read). Weekend rows dropped (DATA_SPEC fault #9) |
| Seed | `20261031` (every script in this study) |
| Uncertainty | empirical placebo distributions on the real data (R = 2,000 sparse, 500 regime, 500 always-on per cell); moving-block bootstrap, block = max(2h, 20) rows, B = 2,000 for baseline score differences |
| Scripts / outputs | `scripts/direction-bar/` → `analysis/output/direction-bar/` |
| Harness | own script (`bar.py`, `scoreboard.py`): the placebo-null MDE and the planted-signal control are not in `runStudy.mjs` |

## 1. The claim

This is not a directional claim. It builds the bar every later directional claim is judged against, and checks the
instrument works:

- **Baselines** B0–B3 for 6 instruments × horizons 1, 5, 20 and 60 trading closes.
- **Statistical detectability**: the minimum detectable effect (MDE) *relative to B0*, given dependence,
  non-stationarity and the effective sample size.
- **Economic break-even**: kept separate from the MDE.
- **A positive control**, showing the MDE machinery is calibrated.
- **A scoreboard**: the existing direction cells re-scored on that scale.
- **The forward ledger.**

## 2. Why it is not already settled

- The proposal's §0 detectability table measured against a coin flip. For drifting instruments that is the wrong
  comparator, and the owner caught it.
- Each banked direction cell was scored against its own baseline: zero, a placebo, random dates or "the other side".
  None was scored against a common point-in-time climatology. The Evidence Book cannot say which cells beat plain drift.
- No forward record of probabilistic direction forecasts exists. `pair_ledger` collects tags, but does not score
  them against baselines.

Nearest Evidence Book entries (not re-tested here, only re-expressed):
- `post-fomc-usd-drift` family
- `positioning-into-release`
- `cot-crowding-programme` (state D)
- `vix-nasdaq-beta`
- `vvix-nasdaq-ratio` / `vix-calculus`
- reversal hour
- carry
- `overnight-hold-nq` / `overnight-hold-gold`

The exact sources are in §4.S.

## 3. Definitions, fixed in advance

- **Close series.** The `px_d1` value (OANDA D mid close), with weekday rows only. A Saturday or Sunday row is
  dropped; the Friday→Monday return absorbs it.
- **Outcome.** `r_h(t) = ln(P[t+h] / P[t])`, h rows ahead; `y_t = 1{r_h(t) > 0}`. Scored only where
  t + h ≤ 2026-08-21.
- **Point-in-time σ.** `σ_h(t) = √h · σ_d(t)`, where σ_d is the EWMA (λ 0.94) of daily log returns up to and
  including t. Standardised outcome: `zr_t = r_h(t) / σ_h(t)`.
- **B0, climatology.** `p0_t` is the mean of y_s over s ≤ t − h (outcomes known at t). `μ0_t` and `m0_t` are the
  same means of r_h and zr. B0 needs ≥ 504 known outcomes, otherwise it issues nothing. Decision: NO-TRADE.
- **B1, buy & hold.** P(up) = p0_t, decision LONG.
- **B2, 12-month momentum.** `p2_t = P(y | sign of ln(P_t / P_{t−252}))`: an expanding conditional climatology over
  known outcomes. It needs ≥ 100 per sign, otherwise it equals p0_t. Decision: LONG or SHORT by the sign.
- **B3, carry (EURUSD, GBPUSD, USDJPY).** `p3_t = P(y | sign of the 3m-rate differential)`, base minus quote
  currency. Rates are point-in-time by ALFRED `asof`, so B3 starts when vintages exist. B3 is not in ledger v0,
  because no live 3m-rate source matches the historical definition. It is added when one is wired.
- **Excess over B0 on a set of dates D:**
  - `e_hit(D) = mean_{t∈D}(y_t − p0_t)` (percentage points of P(up));
  - `e_sd(D) = mean_{t∈D}(zr_t − m0_t)` (σ_h units).
- **MDE (statistics).** For a design and a significance level α:
  `MDE = |mean_null| + (z_{1−α/2} + z_{0.80}) · SD_null`, 80% power, two-sided.
  - mean_null and SD_null are the mean and SD of the excess over R **placebo** date sets with the same design, drawn
    from the real data.
  - The placebo carries the real overlap, autocorrelation and drift in the baseline (non-stationarity).
  - mean_null is the bias that the expanding B0 shows when its level drifts.
  - The analytic `√(p̄0(1−p̄0)/K)` (and `1/√K` in σ units) is reported beside it, with the inflation ratio.
- **Designs:**
  - **Sparse cell:** K events spaced ≥ h rows apart, K ∈ {20, 50, 100, 200, 500}, wherever K ≤ half the
    non-overlapping grid. "Historical K" = 10% of non-overlapping periods.
  - **Regime cell:** runs of L = max(h, 20) consecutive rows covering 10% or 25% of the sample. Every day in a run is
    scored, so overlap is real.
  - **Always-on signal:** information coefficient (IC) between an AR(1) signal (half-life 1, h or 60 rows) and
    `zr − m0`.
- **Pooling.** `m_eff = m / (1 + (m−1)·ρ̄)`, from the mean pairwise correlation of non-overlapping h-day returns.
  Groups: the 6 main instruments; the 7 USD pairs. Pooled MDE = single MDE / √m_eff.
  - This assumes the signal is no more correlated across instruments than the returns. If the same macro signal is
    applied to all of them, pooling gains less; this is stated with every pooled number.
- **FX cross-section (the Phase 1 gate).** 8 currencies (7 USD pairs plus USD), monthly returns relative to the
  equal-weight basket. Mean monthly rank IC of a random signal with month-to-month persistence φ ∈ {0, 0.9}.
  Its MDE is compared with the published FX-premia IC range (0.05–0.10).
- **Multiplicity levels.** Three, for every MDE:
  - single test, α = 0.05;
  - a family of 10, α = 0.005;
  - the whole trial ledger, α = 0.05/217.
- **Plausible effect sizes**, fixed now and used for labels:
  - sparse/regime cells: **0.25 σ_h**, the top of the validated cells' range (+0.21 to +0.27 SD);
  - always-on IC: **0.05** at 1 and 5 closes, **0.10** at 20 and 60.
- **Economics**, separate from the above:
  - Round trip by venue:
    - **Futures:** 1 tick a side plus $5 commission, as a % of one contract at the last pre-lockbox price;
      financing is in the price.
    - **CFD:** the measured spread at 22:00 UTC (`spread_profile`; NQ/ES use the `cost_table` OANDA model, ES
      flagged UNMEASURED), plus financing per night × h·7/5 nights. Financing: NQ and gold from `cost_table` group B;
      FX UNMEASURED, at an assumed 1%/yr markup.
  - **Break-even**, for a long and a short call separately:
    - in hit-rate terms: `p_long = (c + L)/(G + L)` and `p_short_down = (c + G)/(G + L)`, using the historical
      average up-move G and down-move L, reported as excess over B0;
    - in σ_h units: long `(c − μ)/σ`, short `−(c + μ)/σ`;
    - for an always-on sign call: `IC_be = c / (σ_h·√(2/π))`.
- **Cell labels** (sparse design, per venue):
  - **(c) not economically meaningful:** the smaller of the long and short break-even excess exceeds the plausible
    0.25 σ_h.
  - **(a) meaningful and detectable in history:** not (c), and the single-instrument MDE at historical K ≤ 0.25 σ_h.
  - **(b) meaningful, detectable only pooled or forward:** otherwise. The number of years of forward events needed is
    stated.

## 4. Hypotheses, expectation first

| # | Question | Expectation | Pass / acceptance |
|---|---|---|---|
| Q1 | Baselines reproduce known drift | NQ 20d P(up) ≈ 0.65; EURUSD ≈ 0.50 | NQ 20d full-sample P(up) within ±0.01 of 0.653 (measured in the proposal on the same store); EURUSD 20d within 0.47–0.53 |
| Q2 | The MDE machinery is calibrated | yes | Plant an effect of exactly the single-α MDE in a copy of the data and test it against the placebo band: power within 0.75–0.85 over 1,000 replications. Sparse cells NQ 20d K=50, gold 5d K=200, EURUSD 1d K=500, USDJPY 60d K=20 (σ-unit plant by adding δ·σ_h; hit-rate plant by selection tilt). Always-on: NQ 20d half-life 20, EURUSD 5d half-life 60. A control outside 0.75–0.85 is reported; if more than one fails, the MDE map is labelled UNCALIBRATED and not used to gate Phase 1 |
| Q3 | Costs agree across sources | futures ≪ CFD | Reported per instrument × venue × horizon. CFD spread vs `cost_table.json` for NQ and gold: within 10%, or the gap is explained |
| Q4 | B2 momentum and B3 carry vs B0 | small, unstable | Described only (Brier skill vs B0 with a block-bootstrap CI, by period FIT / CHECK / test year). CONTEXT, no verdict |
| Q5 | Each instrument × horizon gets a label | most (b); short-side NQ/ES long horizons (c) | Every cell labelled (a), (b) or (c) per venue |
| S | Scoreboard (§4.S) | most cells hold vs B0, few survive ledger-level multiplicity, almost none have forward evidence | Descriptive, **may only demote**, never promote |

### 4.S Scoreboard: the existing direction cells against B0

For each cell, its own event dates and direction are taken from its banked output, or rebuilt exactly as its prereg
specifies. Each cell is then scored on the same scale:
- excess hit `e_hit` and `e_sd` versus **B0**, in the cell's own direction, at the cell's own horizon;
- the **block-bootstrap 95% CI**;
- the **placebo p-value**: the same number of dates and spacing, from the same instrument's history;
- **net EV** per event at futures cost.

Evidence is split by class:
- **H (historical, in-sample):** the sample the rule was found or fitted on.
- **C (historical, held out):** years named as held out in the cell's own prereg before it was scored.
- **F (forward):** events after the cell's registration date and up to 2026-08-21. Anything later is the lockbox and
  is not read.

**Multiplicity:**
- the placebo p is multiplied by the cell's family size from `MD files/TRIAL_LEDGER.md` (Bonferroni);
- it is also compared with the ledger level (217 claims);
- the effect is compared with the MDE at both levels.

**Outcome words (descriptive):**
- **holds vs B0:** the CI excludes 0 in the cell's direction.
- **weakened vs B0:** the effect is the same sign, but the CI includes 0.
- **not distinguishable from drift:** the effect is < 0.5× the cell's originally reported effect in the same units,
  or the wrong sign.

A demotion is *proposed* to the owner. Evidence Book verdicts are not edited by this study.

The three evidence classes, refined before running (the owner asked for historical validation to be kept apart from
genuine out-of-sample evidence):
- **H-D:** discovered or peeked on this sample.
- **H-R:** pre-registered before scoring, but on history that already existed.
- **F:** genuinely forward, after the registration date and up to 2026-08-21.

**Placebo, time-series cells:** circular shift of the cell's own date set by a random offset (R = 2,000) over the
eligible dates. This keeps the cell's clustering.
**Panel cells:** a block bootstrap clustered by date/week gives the CI. The p-value is the bootstrap share on the
wrong side × 2.

Multiplicity:
- **Family size:** the Holm family stated in each cell's own results.
- **Ledger level:** 241 claims on main (`MD files/TRIAL_LEDGER.md`, generated 2026-10-30). This replaces the 217 used
  in §3 for the scoreboard only. The MDE map keeps 217, the count the proposal quoted.

| Cell | Evidence id | Dates, direction, outcome (from the banked output) | B0 for this cell | Class |
|---|---|---|---|---|
| S1 post-FOMC USD drift | `post-fomc-usd-drift` | `analysis/fomc_event_study/stage1_events.csv` (join_ok), long USD basket, r5 (14:30 ET D → 14:00 ET D+5) | expanding mean / P(up) of `baseline_r5.csv` windows already complete before the event (≥ 100); σ = their expanding SD | H-D (peeked before the 2026-08-20 registration); harness 2016–21 / 2022+ split shown, both seen; F = FOMC after 2026-08-20 and ≤ 2026-08-21: none |
| S2 positioning into release (D) | `positioning-into-release-direction` | panel rebuilt with `scripts/positioning-into-release/run.py` `build_panel()` (unchanged code); crowded non-rate event days; direction against the crowd; outcome `mv` (ATR) | expanding mean / P(up) of `mv` on all non-rate event days of the same pair before the date (≥ 50) | H-R (registered 2026-10-14, 2018 → 2025-04-07); F none (window ends 2025-04-07, calendar seam). Also reproduce its own matched-control effect (+0.064) |
| S3 COT state D | `cot-crowding-p5` | `analysis/output/cot-crowding-programme/phase23_rows.csv.gz`, state D; direction = trend (`dir`); outcome raw = r4·dir (σ_w units) | per market, expanding mean / P(up) of raw over rows whose 4-week outcome was known (entry date ≤ t − 28 days, ≥ 52) | discovery markets H-D; holdout markets H-R; F none (registered 2026-10-24) |
| S4 VIX-beta change | `vix-beta-change` | `analysis/output/vix-nasdaq-beta/panel.parquet` flag `B_change_lo`; long Nasdaq; `ln NDX[t+6] − ln NDX[t+1]` | expanding over all panel days with the outcome known (t' + 6 ≤ t, ≥ 504) | H-R overall (its chronological discover / validate / test splits shown); F none (registered 2026-10-23) |
| S5 VVIX/VXN derivative | `vix-second-derivative` | `analysis/output/vix-calculus/panel_daily.parquet` flag `dRimp_hi`; long Nasdaq; `ln NDX[t+21] − ln NDX[t+1]` | as S4 at 20 sessions | H-R; F none |
| S6 carry | (inside `rate-diff-xsmom`) | `analysis/output/rate_xsmom/monthly_returns.csv` column `carry` (long-short book, no net drift by construction) | zero, plus the book's own expanding mean | 1979–2014 H-D (construction check); 2015–2026 seen; F none |
| S7 overnight hold NQ / gold | `overnight-hold-nq` / `overnight-hold-gold` | `analysis/output/overnight-hold/honest_trades_{nq,gold}.csv` (gross, net) | expanding mean of the daily close-to-close return (`page_trades.json` daily bars) before the date × 18.5/24 (drift per hour held) | H-R; post-cutoff 32 trades are after the lockbox: not read |
| S8 reversal hour | `reversal-hour` | no prereg, no per-event output; a conditional reversal rate, not a signed drift | — | **not scored**, listed with the reason |

**Net EV:**
- S1 uses the harness cost of 1.6bp.
- S4, S5 and S7 use NQ futures cost for the horizon (S7: both NQ and GC).
- S2 and S3 are reported gross in their native units, because their costs were never in ATR/σ units. This is said.

### §L The forward ledger (v0)

- **Job:** `directionLedger` on the server (`js/directionLedger.js`, tests in `js/directionLedger.test.mjs`).
- **When it issues:** after each New York close, for NQ, ES, gold, EURUSD, GBPUSD and USDJPY at h = 1, 5, 20 and 60.
- **What it issues:** B0 / B1 / B2 from `js/directionLedgerBaselines.json`. These are frozen at 2026-08-21 by
  `bar.py`, version `b0b2-frozen-20260821`, and frozen because forecasts must not refit on lockbox data. It also issues
  any research forecaster registered in `RESEARCH_FORECASTERS` (none in v0).
- **What each forecast records:**
  - id, issue date, issued_at, code commit and baselines version;
  - model_id, model_version, family (baseline or research) and its prereg;
  - target definition, horizon, P(up), mean log return where the model has one;
  - decision (LONG, SHORT or NO-TRADE);
  - inputs (close, 252-close momentum).
- **Outcomes:** written once per (issue date, h) when h closes exist: the realised log return, up/down, and each
  forecast's Brier and log score.
- **Write-once R2, never overwritten, never back-issued.** A missed day is a gap.
- **Summary:** `/api/direction-ledger?summary=1` gives, per model × instrument × horizon:
  - n, Brier, and Brier skill vs B0 on the same rows;
  - mean log-score difference vs B0, and its CUSUM drop from peak (degradation);
  - hit count of LONG/SHORT calls.
- **Every later research forecast enters through this ledger.** Its forward record is judged against the B0 and B1
  rows of the same days.

## 5. Power: what this design can and cannot find

This study *is* the power analysis for the programme. Its own checks:
- **Q1 and Q3** are reproductions.
- **Q2** is a calibration test whose acceptance band (0.75–0.85) is wide enough for 1,000 replications: the binomial
  SD at 0.8 is 0.013.
- **The scoreboard** inherits each cell's n. Cells with fewer than 30 events are reported, labelled "n < 30", and given
  no outcome word.

## 6. Multiplicity

- **Q1–Q5** are measurements, not tests.
- **The scoreboard** counts as one descriptive family of about 8 cells, with three multiplicity levels shown for each.
- **No cell is promoted**, so false positives cannot enter the Evidence Book through this study.

## 7. What this does NOT test

- No new directional hypothesis.
- No FX factor stack (Phase 1).
- No event expansion.
- No combination modelling.
- No intraday horizons.
- No lockbox data.
- No HMM.

B3 is not in the live ledger v0. The CFD financing for FX is an assumption, not a measurement.

## 8. What each verdict changes

- **The MDE map and labels gate Phase 1 and later phases:**
  - **(a) cells** are where historical direction research can work.
  - **(b) cells** need pooling or a forward record, and the years needed are stated.
  - **(c) cells** drop out of directional research for that side.
- **Phase 1 gate:** the FX cross-sectional MDE at φ = 0.9, compared with IC 0.05–0.10. The owner reviews before
  Phase 1 starts.
- **Scoreboard demotions** go to the owner as proposals.
- **The ledger runs from deploy** and is the record every later claim is judged on.
- **Banked as CONTEXT.**

## Amendments

### A1 — 2026-10-31 — POST-HOC (results seen)

Four faults were found by auditing the first run. Each fix can only widen intervals or lower the pooled gain, so
none of them promotes anything. The original outputs are kept beside the fixed ones.

1. **Pooled effective N** (`bar.py` `pooled_meff`, and the FX cross-section).
   - **Fault:** `m/(1+(m−1)ρ̄)` depends on sign. USD pairs are quoted both ways (EURUSD vs USDCHF), so their
     correlations cancel. The 7 USD pairs looked like 8–9 independent instruments, and the demeaned cross-section
     like 30 out of 7.
   - **Fix:** the sign-free `m²/Σρ_ij²` from A1 on. The original is kept as `m_eff_original_A0`.
   - The cross-sectional Phase 1 gate itself is a direct placebo and never used m_eff, so it is unaffected.
2. **Hit-rate positive control** (Q2).
   - **Fault:** the selection-tilt plant under-delivered. Sampling without replacement diluted the tilt, so the
     planted excess came out 10–20% below the MDE, and power came out 0.65–0.73 instead of about 0.80. The power at the
     effect actually planted is about 0.69, which is consistent with what was observed.
   - **What passed:** the σ-unit plants (4/4, 0.78–0.82) and the always-on IC plants (2/2, 0.81–0.83) were inside the
     0.75–0.85 band on the first run.
   - **Fix:** an exact plant (`control_hit_flip`): flip down outcomes with probability MDE / (share of downs). It is
     reported beside the original. Under the Q2 rule as written, the original hit-rate controls are 4 fails. The MDE
     map is therefore judged calibrated in σ and IC units on the first run, and in hit-rate units only through the
     exact plant (this is stated in RESULTS).
3. **Scoreboard CIs for overlapping daily cells** (S4, S5, S7).
   - **Fault:** a row bootstrap treated overlapping 5- and 20-session windows as independent. The S4 row-bootstrap p
     was about 0.000, against a circular-shift placebo p of 0.039.
   - **Fix:** these cells now bootstrap by calendar-month clusters.

4. **Finite-population shrink in the sparse placebo.**
   - **Fault:** drawing K of the G ≈ n/h non-overlapping periods without replacement shrinks the placebo spread by
     √(1 − K/G). At 20 days with K = 100 of about 245 periods, the placebo was 0.79× the analytic value. A new sample
     has no such shrink, and the "historical K" MDEs were scaled from the largest K, so the 5- to 60-day MDEs were
     understated by up to about 20%.
   - **Fix:** the spread is divided by √(1 − K/G). The uncorrected MDEs are kept as `*_raw_A0`.
   - The positive controls test calibration within the same finite history, so they are unaffected.

Not changed: B0 / B2 / B3, costs, labels logic, the frozen ledger baselines.

## RESULTS
