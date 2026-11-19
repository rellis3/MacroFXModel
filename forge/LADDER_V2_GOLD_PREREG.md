# ladder-v2-gold — which σ makes gold's daily reach ladder right in every vol regime, CFD and futures?

**Pre-registered 2026-11-18, before any gold outcome was computed.**

| | |
|---|---|
| ID / ledger id | `ladder-v2-gold` (C), `ladder-v2-gold-fut` (F), `ladder-v2-gold-cvf` (C vs F) |
| Branch | `claude/signal-bot-bias-analysis-bwr1qv` (pushed to main) |
| Register row | `plans/RESEARCH_REGISTER.md` → `ladder-v2-gold` |
| Data | **C:** OANDA XAU/USD M1 (`portfolioBacktest/cache/gold_m1.parquet`, start-stamped, from 2016-01-04). **F:** CME GC M1 from NT8 (`analysis/output/nt8/continuous/GC_1m_unadj.parquet` for levels, `GC_1m_ratio.parquet` for σ; end-stamped, shifted −1 min; re-pulled with the gapfill and stitched 2026-11-18). Window: London sessions 2016-01 → **2026-08-21** (lockbox after) |
| IV | CBOE GVZ (`analysis/surfaces/cboe/GVZ.csv`), as-of the prior close |
| Seed | `20261118` |
| Uncertainty | session-date block bootstrap, **block 63 sessions** (3 months), B = 2000 |
| Harness | `scripts/ladder-v2/ladder.py` (the NQ harness made per-instrument; must reproduce the NQ arm misses exactly before gold is run) → `analysis/output/ladder-v2-gold/` |
| Data screens | `forge/data_screens.py GOLD` (v1) → `analysis/output/data_screens/GOLD/` |

Runbook `plans/VOL_EXHAUSTION_RUNBOOK.md` Phase 1, second instrument. The design, definitions and pass rules are
those of `forge/LADDER_V2_NQ_PREREG.md` §3–§6 (incl. A1). Only the differences are written here.

## 1. Claim

Among a fixed list of σ inputs, one keeps gold's daily ladder hit rates (HL/OH/OL p75/p90) on target in every σ
quintile, walk-forward 2018 → 2026-08-21, separately for the CFD and the futures. Measurement, not a trade.

## 2. Prior art

- `ladder-v2-nq` (VALIDATED both tracks, A2 robustness held): har_rv_log won on NQ, regime miss 2.40 → 1.49pp (C).
  Gold is a different asset class, so that result is not assumed.
- `iv-ladder-gold` (VALIDATED, 2026-09-27): a pure-GVZ ladder beat the realised ladder on H-L pinball (2.6% better,
  5/6 folds). It scored pinball and an unconditional guard only, never the regime miss. That ladder is arm V4 here.
- `forge/LADDER_CALIBRATION_PREREG.md` (pooled, 2026-10-05): HAR-800 lowest regime miss pooled; no per-instrument read.
- `overnight-vol-regime-gold`, `day-type-expansion-gold`: different questions (returns by regime; day type).
- Runbook 1.5 note: gold's NFP-day range looked too small on 2026-11-06. Event multipliers are off here (all arms).

## 3. Arms

| Arm | σ |
|---|---|
| A0 | yz_10 (gold's live estimator, `js/forecastLadderIvAdjParams.js`) |
| E_* | the other six forge estimators: ewma_094, ewma_090, yz_20, yz_30, naive, har_rv_log |
| H8 | HAR-800, production `forecastSigma` (JS) |
| R5, R15 | HAR-RV on 5- / 15-minute RV, OLS refit each walk-forward year |
| V3 | IV-adjusted: σ_A0 · exp(k(ln(GVZ/σ_A0) − μ)), k, μ fitted on train rows |
| V4 | pure GVZ/√252 |

Widths for every arm come from `forge.vol.fit_width_multiplier` on train rows (expanding window, test years 2018 …
2026). Regime = A0 σ ÷ its trailing 250-session median, shifted one session.

## 4. Pass rules (NQ rules + the A2 standards, now registered up front)

- **PRIMARY / GUARD / SHARPNESS / noise floor / selection / tie rule:** as NQ §4.
- **VALIDATED** needs, on that track, the 90% CI of (winner re-selected in each draw − A0) below 0:
  1. overall (block 63);
  2. in each half (2018–22, 2023–26);
  3. with each of these windows left out in turn: the four market episodes of NQ A2 (2018 Q4, Covid 2020-02-19 →
     06-30, 2022, 2025-03 → 05) and gold's own four highest-range non-overlapping 63-session windows in the test
     set (picked by mean realised HL, the same for every arm);
  4. with the sessions carrying a **data-fault** flag left out (screens `gap`, `frozen`, `partial`, `missing`, `ts_*`,
     `round_trip`, `roll_gap`, `cvf_open`).
- **NULL** if the overall CI excludes any improvement ≥ 0.3pp. **UNDERPOWERED** otherwise.
- Price-move flags (`jump_1m`, `jump_day`, `cvf_range`) are reported only; dropping them selects on the outcome
  (NQ A2 lesson).
- **H3 C vs F:** as NQ (ratios in [0.97, 1.03], CI inside [0.95, 1.05] → F reuses the C spec).
- **Controls, all must pass before anything is scored:** positive control 1 (Python NY-close bars = production
  `GOLD.json` on ≥ 99% of dates), positive control 2 (synthetic GARCH, NQ A1), mirror reported per track, and the
  harness reproducing the NQ arm misses (to 0.01pp) from the NQ inputs.

## 5. Power

About 2,200 test sessions per track and ~440 per quintile, the same as NQ. The 3-month block makes the CIs wider than
NQ's registered 20-session ones (NQ's C CI went from [−1.49, −0.32] to [−1.52, −0.41]; F to [−1.46, −0.24]). MDE
≈ 0.5–0.6pp. The live miss pooled across instruments was ~1.45pp above the floor.

## 6. What this does NOT test

Exhaustion (Phase 2); event multipliers; silver/other metals; any trade; sessions after 2026-08-21.

## 7. What each verdict changes

- **VALIDATED:** the winner becomes gold's shadow σ on the side-by-side export (runbook 1.7) with a forward record. If
  V4 wins, that agrees with `iv-ladder-gold`; if a realised arm wins, the IV ladder's pinball edge did not carry to the
  regime test. Nothing live changes without owner sign-off.
- **NULL:** yz_10 stays for gold; the regime miss is not a σ-choice problem there.
- **UNDERPOWERED:** decided later by a metals class pool (gold + silver) or the forward record.

## Variant log

| # | Variant | Added | Status |
|---|---|---|---|
| 1 | Arms as §3, rules as §4 | 2026-11-18 | registered |

## Amendments

### A1 — 2026-11-18, PRE-RESULTS (no gold outcome computed; harness checked on NQ only)

- **Mirror:** 20 draws (not one), each drawing the test year's ratio vectors from exactly the rows the lines are fitted
  on. Reported: median and range of A0's PRIMARY and of the HL>p75 Q1−Q5 tilt, against the floor. The single-draw NQ
  version ranged 1.25–2.29pp across seeds (see NQ RESULTS, "Mirror control re-run").
- **Halves** use the quintile edges from all test rows of the track (as NQ §3); the left-out windows and fault-flag
  checks recut the edges on the rows kept (as NQ A2).
- **Harness check passed:** on NQ it reproduces all 12 arms' PRIMARY and GUARD to 0.0 and both halves exactly.

### A2 — 2026-11-19, PRE-RESULTS (no gold outcome computed): more arms

Prompted by an outside gold race (QLIKE on daily squared returns; GARCH-t ranked first, with GJR/EGARCH showing gold's
inverse leverage) and the standard literature. Added arms, every one walk-forward with no full-sample fit:

| Arm | σ |
|---|---|
| G_garch, G_garch_t, G_gjr, G_egarch | GARCH(1,1) normal, GARCH(1,1) Student-t, GJR-GARCH(1,1,1), EGARCH(1,1,1) on NY-close daily % returns (ratio series for F), constant mean (`arch` 9.0). For test year Y the parameters are fitted on bars before 1 Jan Y, then the whole series is filtered with them fixed; the value used for a session is the one-step forecast made at the prior NY close |
| SHAR | log RV(5-min) next day on log positive and negative 5-min semivariance of the day plus log 5- and 22-day mean RV (Patton–Sheppard), OLS refit each year |
| HARCJ | log RV next day on log continuous part C = min(RV, bipower variation) at 1/5/22 days and log(1 + J/C) with J = RV − C (Andersen–Bollerslev–Diebold), OLS refit each year |
| B_har_garcht | 0.5 × (har_rv_log + G_garch_t) |
| B_har_iv | 0.5 × (har_rv_log + pure GVZ) |

Arms are now 20 (from 12). The winner is still re-selected inside every bootstrap draw, so the larger search is
priced in. Rules unchanged. Realized GARCH (Hansen) is deferred to a later round. QLIKE against the next NY-close
day's squared return and MZ R² on daily GK variance are reported per arm, no rule, so the outside race can be compared
like for like.

Tested for code faults on NQ only (descriptive, not banked) before gold was built.

### A3 — 2026-11-19, PRE-RESULTS (no gold outcome computed): GARCH fits on a long history

The NQ code test showed that fitting the GARCH family on 2016–17 alone (the first walk-forward year) gives degenerate
parameters (EGARCH shock response α = −0.09 on the CFD; the fitted forecast barely moved with the realised range,
slope 0.03). From 2019 on the fits were sensible. GARCH needs a long sample. Change: for each test year Y the GARCH
parameters are fitted on OANDA's NY-close daily bars (`granularity=D`, mid, `dailyAlignment=17`, America/New_York;
`scripts/ladder-v2/fetch_d1_long.py`, gold from 2006-03, NQ from 2004-01) before this series starts, joined to this
series' own bars, all before 1 Jan Y. Those OANDA bars equal the M1-built NY-close bars where they overlap (773 dates,
daily-return correlation 1.0, median close difference 2e-8). The forecasts scored are still filtered only on this
series. For the futures track the pre-series history is the same OANDA (spot/CFD) history. No other arm changes.
