# ladder-v2-nq — which σ makes NQ's daily reach ladder right in every vol regime, CFD and futures?

**Pre-registered 2026-11-18, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `ladder-v2-nq` (C track), `ladder-v2-nq-fut` (F track), `ladder-v2-nq-cvf` (C vs F) |
| Branch | `claude/signal-bot-bias-analysis-bwr1qv` (pushed to main) |
| Register row | `plans/RESEARCH_REGISTER.md` → `ladder-v2-nq` |
| Data | **C:** OANDA NAS100 M1 (`portfolioBacktest/cache/nq_m1.parquet`, start-stamped, from 2016-01-04). **F:** CME NQ M1 from NT8 (`analysis/output/nt8/continuous/NQ_1m_unadj.parquet` for levels, `NQ_1m_ratio.parquet` for σ; end-stamped, shifted −1 min to bar start; contract switches at 22:01 UTC, outside the London session). Window: London sessions 2016-01 → **2026-08-21** (lockbox after) |
| Seed | `20261118` |
| Uncertainty | session-date block bootstrap, block 20 sessions, B = 2000 |
| Scripts / outputs | `scripts/ladder-v2-nq/` → `analysis/output/ladder-v2-nq/` |
| Harness | own script. It reuses `forge.vol` ESTIMATORS and `fit_width_multiplier`, and production `forecastSigma` (JS) for HAR-800, so arms are the shipped code |

Part of `plans/VOL_EXHAUSTION_RUNBOOK.md` Phase 1, first instrument. The exhaustion read (Phase 2) gets its own prereg.

## 1. Claim

The daily NQ ladder (OH/OL/HL/OC p50/p75/p90, as % of the London-midnight open) is only as good as its σ. The live
σ (yz_10) gives the right hit rates on average but not by regime: too narrow after quiet spells, too wide after busy
ones. The claim tested is that, among a fixed list of σ inputs, one gives hit rates that stay on target in every σ
regime, walk-forward across 2018–2026. The test runs separately for the CFD (NAS100) and the futures (NQ).

Edge source: none. This is a measurement (forecast calibration), not a trade.

## 2. Why this isn't already settled

- `forge/LADDER_CALIBRATION_PREREG.md` (2026-10-05) scored A0 (live) vs HAR-800 vs IV-adjusted vs pure IV.
  - HAR-800 had the lowest regime miss (1.41pp vs 2.86pp).
  - None met the ±3pp target bar.
  - Its limits: one test year (253 dates), 28 instruments pooled, CFD only, and only 4 arms. For indices, HAR
    overshot on loud days (Q5 HL>p75 29.4%).
  - This study is per instrument, uses 8.6 walk-forward test years, includes the other 6 shipped estimators and a
    5-minute RV HAR, and adds the futures track.
- `forge/vol.py design_vol` chose yz_10 for NQ on pinball alone, with no regime check.
- `vol-layer-feedback-confirm` (VALIDATED): frozen feedback cuts QLIKE. `vol-layer-state-confirm`: HAR-month + HARQ add
  0.16% (CONTEXT). Neither is an arm here. If a passing arm still misses by regime, they are the next amendment.
- `nq-futures-line-race` (EXPLORATORY): NQ futures ≈ CFD on path shares. That supports, but doesn't test, the C vs F
  distribution claim in H3.

## 3. Definitions

- **Session:** London calendar date, weekdays, 00:00–22:00 Europe/London.
  - The open is the first M1 bar at or after 00:00 London.
  - Realised OH, OL, HL and |OC| are % of the open.
  - Sessions with < 600 M1 bars are dropped (count reported per track).
  - During the US/UK DST-mismatch weeks, CME's 1-hour halt falls at 21:00–22:00 London, inside the window. It's left
    as is (no bars, so HL is unaffected).
- **σ bars:** NY-close daily bars (17:00 New York), sessions with ≥ 60 M1 bars, the same rule as JS `nyCloseDailyBars`.
  - The σ for London session D uses bars that closed **before** D's open (as-of, strictly earlier).
  - C bars come from OANDA M1. F bars come from the ratio-adjusted continuous series, so roll gaps aren't returns.
  - The Python bar builder must reproduce `analysis/output/ladder_candidates/d1/NQ.json` (C) exactly on the
    overlapping dates before anything is scored: OHLC match on ≥ 99% of dates (positive control 1).
- **Arms** (σ in daily %). Every arm's widths are fitted by the same procedure, `forge.vol.fit_width_multiplier` per
  quantity × rung, on train rows only:

| Arm | σ |
|---|---|
| A0 | yz_10 (live NQ estimator) |
| E1–E6 | ewma_094, ewma_090, yz_20, yz_30, naive, har_rv_log (forge python) |
| H8 | HAR-800: production `forecastSigma(last 800 bars, 'har_rv_log')` (JS) |
| R5 | HAR-RV on 5-minute realised variance of the NY-close day: log RV_d on log daily / 5-day / 22-day means, OLS refit each walk-forward year on train rows |
| R15 | as R5 with 15-minute returns (lesson 10: a latent proxy on two specs) |
| V3 | IV-adjusted: σ_A0 · exp(k(ln(VXN/σ_A0) − μ)), k and μ fitted on train rows (ridge as `run_ladder_candidates.fit_k`) |
| V4 | pure IV: VXN/√252 (as-of the prior close) |

- **Walk-forward:** test years 2018 … 2026 (2026 ends 2026-08-21). For test year Y, widths, R5/R15 coefficients and
  V3 k/μ are fitted on all sessions before 1 Jan Y (expanding window; 2016–17 is train only).
- **Event multipliers: off in every arm** (identical for all). Re-fitting them is runbook step 1.5.
- **σ regime:** A0 σ ÷ its own trailing 250-session median, shifted one session; quintile edges from the pooled test
  rows of that track. All arms are bucketed on the same days.
- **Exceedance** at rung p: realised > line. Targets: 0.50, 0.25, 0.10.

## 4. Hypotheses and pass rules

Scored separately per track (C and F), on identical session rows within a track.

- **PRIMARY:** the 30-cell regime miss = mean |exceedance − target| over 5 quintiles × {HL, OH, OL} × {p75, p90}.
  Lower is better.
- **GUARD:** the 12-rung unconditional miss (HL/OC/OH/OL × p50/75/90) is no more than 1pp worse than A0's.
- **SHARPNESS:** pinball loss summed over HL/OH/OL × p50/75/90, as a ratio to A0.
- **Noise floor:** the 30-cell miss that a perfectly calibrated forecaster would show at these cell sizes (Bernoulli
  draws at the targets, same n per cell, B = 2000, seed). A miss at or below the floor's 90th percentile counts as
  **"calibrated to noise"**.
- **Selection (H1 C, H2 F):** the winner is the arm with the lowest PRIMARY among those passing GUARD.
  - If the block-bootstrap 90% CI of (PRIMARY_winner − PRIMARY_runner-up) includes 0, the two are tied, and the tie
    goes to the lower SHARPNESS.
  - The verdict vs A0: VALIDATED if the winner's PRIMARY is below A0's with the 90% CI of the difference excluding 0,
    in both halves of the test years (2018–22, 2023–26).
  - NULL if the CI excludes any improvement ≥ 0.3pp.
  - UNDERPOWERED otherwise.
  - Separately, report whether the winner is "calibrated to noise".
- **H3 C vs F (`ladder-v2-nq-cvf`):** on London dates present in both tracks, test whether the realised distributions
  match.
  - The F/C ratios of median and p75 for HL, OH and OL must each sit in [0.97, 1.03] with the bootstrap 90% CI inside
    [0.95, 1.05]. If so, the result is CONTEXT "same": F reuses the C spec.
  - Otherwise the result is CONTEXT "different", and F keeps its own winner.
  - Also reported: does the same arm win on both tracks?
- **Reported, no rule:**
  - HL > p75 and > p90 by quintile with CIs
  - per-year exceedance
  - the log-log slope of realised HL on σ
  - each arm's σ day-to-day change
  - rows on roll days (F) as a separate line

**THE MIRROR:** the same scoring on a random-walk placebo, built by drawing each session's realised quantities from
its own σ_A0 × the train-period empirical ratio distribution (block-shuffled days). A0 there must show a regime miss
near the noise floor. If it shows the real data's tilt, the tilt is an artefact of the scorer.

**Positive control 2 (lesson 1, from outside the pipeline):** synthetic GARCH(1,1) daily returns with known true σ
(10 years, seed).
- "True σ" must score within the floor.
- "σ^0.5-shrunk" (known regime-blind) must show HL>p75 Q1 > Q5 by ≥ 5pp.
- The scorer must recover both, or nothing is scored.

## 5. Power

About 2,150 test sessions per track, about 430 per quintile. The per-cell SE for p75 exceedance is ≈ 2.1pp before
autocorrelation, so the per-cell ±3pp target bar can't be decided reliably on one instrument. That's why the 30-cell
mean (SE ≈ 0.6pp by the same arithmetic) is primary and the per-cell bar is reported only. The minimum detectable
improvement in PRIMARY vs A0 is ~0.5pp at 80% power. The live gap seen pooled was 1.45pp. The real MDE will be printed
from the bootstrap.

## 6. Multiplicity

Ten arms per track. The selection is the minimum over arms, which flatters the winner. So the verdict compares the
winner to A0 with the winner's identity **re-chosen inside each bootstrap draw** (the selection is in the bootstrap).
Tracks are reported separately, not pooled.

## 7. What this does NOT test

- Exhaustion or reversal at lines (Phase 2, own prereg).
- Event-day multipliers.
- Other instruments (one prereg per instrument class follows this template).
- Any trade.
- Post-2026-08-21 sessions (lockbox).

## 8. What each verdict changes

- **VALIDATED:** the winner becomes NQ's shadow σ (C, and F if H3 says different, or F's own winner). It goes on the
  side-by-side export (runbook 1.7) with a forward record. Nothing live changes without owner sign-off.
- **NULL:** the live yz_10 stays. The regime miss is then not a σ-choice problem for NQ, and the next arm is
  regime-conditional widths or frozen feedback (amendment).
- **UNDERPOWERED:** the per-class pooled run (indices: NQ, ES, YM, RTY, SPX500, US30) decides, with NQ's result as
  one member.

## Variant log

| # | Variant | Added | Status |
|---|---|---|---|
| 1 | Arms A0, E1–E6, H8, R5, R15, V3, V4 as §3 | 2026-11-18 | registered |

## Amendments

### A1 — 2026-11-18, PRE-RESULTS (only positive control 1 and the session counts have been computed)

Positive control 2 is mis-specified as written. A σ^0.5-shrunk σ makes lines too *wide* when it's quiet, which is the
opposite sign to the Q1 > Q5 stated. The live tilt comes from a noisy short-window σ, with days bucketed by that same σ:
low readings carry negative noise, so their lines are too tight. Replacement, same pass bar:
- The synthetic GARCH(1,1) days are given the A0 role by a 10-day rolling realised σ of the synthetic daily returns.
  Quintiles come from that arm's σ ÷ its trailing 250-day median, as in the real run.
- "True σ", scored on those quintiles, must have a 30-cell miss within the floor's 90th percentile.
- The 10-day realised arm must show HL > p75 Q1 − Q5 ≥ 5pp.
- σ^0.5-shrunk is reported, with no rule.
