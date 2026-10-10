# IEP-TIME: time of day, trading session and day of week in band attainment, first touch and consolidation

*Pre-registered 2026-10-10 before any outcome below is computed. Extends `forge/INTRADAY_EXTREME_PATHS_PREREG.md` (IEP); its Stage 3
registration (late stratum + Family C) is preserved unchanged and run as registered (clarification recorded there). Frozen; changes only by
dated amendment before the result they affect is seen. Research only: no production code, no live rule.*

Owner controls: reuse valid results; do not rerun searches to generate findings; register before examining; no best-hour/weekday selection
reported on the data it was selected on; lockbox untouched; 2025 → 2026-08 is previously explored data and is never called independent
confirmation; the forward block (`data/m1_forward/`) is not read.

## 1. Audit — what already exists (reused, not rerun)

| Question | Existing result (ledger id / file) | Sample / validation status | Used here as |
|---|---|---|---|
| Range by time of day | `live-range-clock` (moving lines ≈ the clock; range used + pace add 1-1.5%), `intraday-range` (validated), layer-5 remaining travel (per-hour multipliers, near-pass), `first-hour-fraction` | 34 inst, train/test splits | prior: the clock is mechanical; the new test is hour **beyond** the vol-time clock |
| Running extreme final by hour | `exhaustion-schedule` (clock effect: 15% 07-11 → 64% 20-24, flat in distance), `extreme-in-probability` (validated, walk-forward, Brier skill +21%/+18%) | 34 inst, walk-forward | reused; not retested |
| Late-day reversal | `reversal-hour` (validated, 20-22 UTC); IEP Stage 1 late stratum (discovery) | EURUSD/gold; 34 inst desc. | tested only inside IEP Stage 3 (registered) |
| Session on direction | IEP Stage 2 A8 (hour band on CONT\|res): null, Holm 0.82 | Validation 2022-24 | reused; not retested |
| Session × range used on consolidation | IEP Stage 2 Family B `used_s × band` on CONS: passed BH-FDR | Validation 2022-24 | reused; not retested |
| Weekday on the daily range | `calendar-range-profile` (Mon 0.87-0.96×, Thu widest FX), `meta-label-trust-lines` (Mon HL p75 20.6% vs Thu 27.7%), `forecast-persistence-fix` (**validated** walk-forward 2020-26: weekday-adjusted σ removes the Mon/Thu skew) | 8 / 34 inst, walk-forward | reused; one descriptive confirmation table on the export lines only |
| Monday gaps | `monday-gap-fill`, `jump-structure` (Mon open gaps > 0.5σ 9% vs 1.4%) | gold/indices | reused |
| Band read (incl. GOLD "after an upward extension") | `band-reach-from-here` / T7-T7b (`js/bandReachParams.js`): GOLD p75 given median reached 60% at 07:00 → 17% at 16:30; 50% vs 21% at 10:30 | 8 inst, ~2,500 sessions each, **all dates 2016-2026 pooled, no chronological split**, per-session bootstrap (not date-clustered); baseline = "median not reached" (not distance-matched); production `buildLadder` on London-day bars | **re-examined** (H4): out of sample, on the export lines, against a distance-matched baseline |
| Asia range conditioner | `asia-range-london` / T7b addendum (wide Asia → fewer band tags after 07:00, gold 51% → 21%) | all dates pooled | reused as a feature (Asia range used), not retested |
| Level reaction at earlier extremes | `level-touch` (prior-day high/low, daily open, lines: null vs random prices), `live-range-line-race` (null) | 34 inst | prior-day not retested; **Asia / London session extremes** never tested → H2 |

## 2. Data and targets

- **Targets = the v3 export calculation, point in time**: `analysis/output/forecast_history/<SYM>.csv` (`pit_*` lines, walk-forward fold specs;
  `oos = 1` from 2020-08-20/24). Lines: OH p50/p75/p90 (open × (1 + w)), OL p50/p75/p90, OC p75 (close-plus-p75: close ≥ open × (1 + oc_p75)).
  First touch = the table's `ft_*` minute (London, 00:00-22:00).
- **State at checkpoint h** (London 02:00 … 21:00): the IEP event table row (P0, D, pullbacks, ages, range used, momentum, σ regime) joined on
  (instrument, date, h); price position in % of open = D × σ_HAR,daily. Running OH/OL from `oh_h{h}` / `ol_h{h}` of the export table.
- **Blocks:** estimation < 2022-01-01 (rows before 2020-08 are export burn-in, `oos = 0`, flagged; used only to fit, never to score);
  **test = 2022-01-01 … 2024-12-31, `oos = 1`**. The test block was used in IEP Stage 2 for other hypotheses (direction, consolidation): disclosed.
  2025-26 not used for any test here.
- **Geometry clock:** v_left(h) = the class vol-time share of the day's variance from h to 22:00 (IEP discovery profile).
  Target distance z = (line − price) ÷ (σ_export,daily × √v_left).

## 3. Outcomes (same definitions and horizons whenever probabilities are compared)

| id | outcome | rows |
|---|---|---|
| U75 / U90 / L75 / L90 | the export OH (OL) p75 / p90 line is first touched after h and by 22:00 | rows where it is untouched at h |
| CL75 | close (22:00) ≥ open × (1 + oc_p75) (up) / ≤ open × (1 − oc_p75) (down) | all rows |
| FT | first touch between OH p75 and OL p75 after h: up / down / neither | rows with both untouched at h |
| EXP | range expansion: final H−L − running H−L at h ≥ 0.5 × export HL p50 | all rows |
| CONS, CONT\|res | IEP ±1u, 2 h (registered IEP definitions) | IEP rows |
For "extension direction" versions, U/L are oriented by o = sign(D) (EXT75 = the p75 line on the side price has moved toward; OPP75 = the other).

## 4. Hypotheses (two-sided; families and corrections fixed now)

**Family T (time / session / weekday incremental value; Holm over 12 = 3 feature sets × 4 outcomes {EXT75, OPP75, CONS, EXP}).**
Model ladder, regularised logistic, walk-forward yearly refits (train < year, test 2022 / 2023 / 2024):
- **M0 (existing system):** z (target distance) where defined, log v_left, |D|, range used ÷ export HL p50, pullback and age of the extreme on the
  extension side, 1 h momentum, log σ regime, IV÷σ (+ flag), event tag, class dummies.
- **T-hour:** M0 + London-hour dummies. **T-session:** M0 + session dummies (Asia 2-6, London 7-11, overlap 12-15, NY 16-18, late 19-21).
  **T-weekday:** M0 + weekday dummies.
A feature set adds information if Brier skill over M0 has a 5-day block-bootstrap 95% interval wholly > 0 AND ≥ 0.3% (the IEP credit rule).
Reported per outcome: skill, log-loss skill, calibration (max decile gap), by class, by test year.

**Family H2 (session carry; Holm over 8).** The Asia range (00:00-07:00 London) high and low, first touched after 07:00; the London range
(07:00-12:00) high and low, first touched after 12:00. From the touch-bar close: race to +0.25σ beyond vs −0.25σ back, to 22:00
(σ = export σ_daily). **Placebo:** the same level shifted ±0.15σ (both shifts, both sides), first touched in the same window, same race.
Test: real minus placebo continuation share among resolved, date-clustered; 2 levels (Asia, London) × 4 classes = 8 tests.

**Family H4 (GOLD band read re-examined; Holm over 4).** GOLD rows, "upward extension" = OH p50 touched by h (T7's state).
- H4a: does the extension state predict U75 (and U90, CL75 reported) beyond the distance-matched baseline? Logistic U75 ~ M0 geometry (z, log v_left)
  ± extension flag; test the flag's coefficient (date-clustered); effect reported as the average change in probability (pp).
- H4b / c / d: within GOLD extension rows, does U75 vary by hour band / session (joint Wald), and by weekday (joint Wald), beyond M0 geometry?
  (H4b = hour bands, H4c = weekday, H4d = hour band × weekday is NOT tested — too sparse; H4d = pooled all-instrument version of H4a.)
Reported for each hour 07:00 … 17:00: T7-style P(U75 | extension), T7's baseline P(U75 | not extended), the unconditional same-hour
P(U75), the M0 distance-matched prediction, pp and relative differences, n, intervals (shrunk to the session-band rate, m = 30).

**Family X (interactions; BH-FDR 10% over 7).** session × range-used tercile on EXT75; hour band × extension state (OH/OL p50 touched on
the extension side) on EXT75 and on CONS; weekday × σ regime on CONS and on EXP; tier1-event day × session on CONS and on EXP.
(Session × range used on CONS is the Stage 2 result, reused.)

**Family D (daylight saving; one test, alone at 0.05).** On overlap/NY rows (h 12-18), M0 + London-hour dummies vs M0 + New-York-hour dummies
(hours since 08:00 New York) for CONS and EXT75: log-loss difference with a block-bootstrap interval. Plus a sensitivity rerun of Family T with
the US/UK DST-mismatch weeks removed (reported, no test).

**Descriptive (no test):** hourly (02-21) and weekday tables of every outcome with the M0-matched baseline, the unconditional baseline,
pp and relative differences, n, dates, 95% interval and per-year values; daily HL p75 exceedance of the export by weekday (confirms or not
the reused weekday finding).

## 5. Inference
Date-clustered (CR1) errors for effects; 5-day moving-block bootstrap (dates, all instruments together) for skills; cells with < 30 dates are
shown but not interpreted; shrinkage: empirical-Bayes beta-binomial toward the parent (class × session) with m = 30 pseudo-observations.
Ambiguity: first-touch minutes are M1; a minute that touches both p75 lines counts as "neither" for FT and is reported.

## 6. Decision rules
- **Demonstrated predictive value:** passes its family's correction on the test block, effect ≥ 3pp (H2, H4, X) or the credit rule (T, D),
  same sign in all three test years, ≥ 60% of instruments in its class with the same sign where per-instrument estimates exist.
- **Descriptive:** a stable pattern that the existing model (M0) already reproduces (matched-baseline gap < 2pp), or that fails the correction.
- **Unsupported:** null on the test block, or not stable across years.
Profitability is not assessed in this registration.

## 7. Deliverable
A session-aware forecast specification (expected range, range consumed, consolidation probability, upper/lower band-hit probabilities and how
they change by hour, session and weekday) built only from components classed as demonstrated or as reused validated results, with the
smallest feature set recommended for prospective shadow evaluation. No production change.

## Clarifications before analysis (2026-10-10, after the build checks, before any outcome is computed)
- Orientation o = sign(D) for every row (flat rows included), so EXT/OPP outcomes exist on all rows.
- Family X tests the interaction on the **residual y − p(M0)** (walk-forward M0 prediction), because section 6 judges findings against the
  M0-matched baseline; the raw-outcome Wald is reported beside it, not tested.
- Family T / D training rows are a seeded random sample of at most 300,000 rows per fit (speed); test rows are complete.
- Family D counts as two tests (CONS, EXT75), Bonferroni × 2 inside the family.
- Build checks (`TIME_BUILD_CHECKS.md`): IEP and export running OH agree to 0.00005pp at p99; first-touch vs running-extreme mismatch ≤ 0.009%;
  same-minute double touches of both p75 lines 0.002% of rows.

## Variant log
| # | Variant | Added | Status |
|---|---|---|---|
| 1 | as above | 2026-10-10 | run 2026-10-10 (record below) |

## Results record (2026-10-10) — test block 2022-2024, 527,799 rows, 778 dates
`python -m forge.iep_time` → `TIME.md`, `time.json`; `python -m forge.iep_time_check` → `TIME_CHECK.md`; sensitivity `forge/iep_time_h4_sensitivity.py`.
- **T (beyond M0):** hour adds to CONS (+1.05% Brier [0.85, 1.26], Holm 0.024, all years and classes) — **credited**. Session +0.29% CONS, hour +0.19% EXP,
  session +0.12% EXP: CI > 0 but below 0.3% (not credited). Nothing adds to EXT75 / OPP75 band attainment (all |skill| < 0.1%). Weekday credited nowhere
  (EXP +0.34% [−0.05, 0.80]). DST-mismatch weeks removed: unchanged. Descriptive: CONS vs M0 by hour is +7 to +9pp at 02-04, −8 to −12pp at 06-08,
  −7 to −8pp at 13-14, +5 to +7pp at 19-20 (stable in all years); EXT75 vs M0 within ±1.2pp at every hour; Monday EXT75 −3.8pp, EXP −6.0pp, CONS +3.0pp.
- **H2 session carry: null.** Asia / London extremes vs ±0.15σ placebo levels: all 8 diffs within ±2pp, Holm 1.0. Earlier-session extremes are not levels.
- **H4 GOLD band read:** T7's numbers replicate out of sample on the export lines (10:00: 50.8% vs 18.8%), but the distance-matched baseline is 42.9% —
  about three quarters of the lift is geometry (the target is closer). GOLD extension beyond geometry +6.0pp [0.3, 11.7], Holm 0.078 (null; 2024-driven).
  Hour band null (Holm 0.083). Weekday Holm 0.005: Mon −11.0pp, Fri +19.0pp beyond geometry (60-74 dates per day; Monday matches the known weekday σ bias).
  **H4d all instruments: +4.17pp [3.11, 5.23], Holm < 0.001, +4.2/+3.9/+4.2 by year, 33 of 34 instruments positive — passes as registered.**
  Sensitivity (not a test): finer distance control +3.14 ± 1.13; adding range used +2.37 to +2.53 ± 1.15 — real but small once the day's realised range is known.
- **X (residual after M0, BH 10%):** pass: session × extension state on CONS (max 19.7pp) and on EXT75 (max 1.0pp: below the size bar), tier1-event × session
  on CONS (overlap on tier1 days 27.9% vs 43.4% otherwise; NY 41.5% vs 53.7%) and on EXP; stable in all years. Null: session × range used on EXT75,
  weekday × regime on CONS and EXP.
- **D:** New York clock vs London clock on h 12-18: log loss +0.04% [0.004, 0.091], Brier n.s., Bonferroni p 0.12 — no evidence the NY clock is better.
- **Daily (reused result confirmed on the export, out of sample):** HL p75 exceeded Mon 19.3% ±3.0, Tue 24.7, Wed 26.1, Thu 29.4 ±3.4, Fri 26.7 (target 25).
- **Stage 3 (IEP registration):** see the IEP prereg Stage 3 record.
