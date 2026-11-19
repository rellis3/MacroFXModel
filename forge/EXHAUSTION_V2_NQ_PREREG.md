# exhaustion-v2-nq — after NQ touches a ladder line, which forecast of "further travel" is right?

**Pre-registered 2026-11-19, before any touch outcome was computed.**

| | |
|---|---|
| ID / ledger id | `exhaustion-v2-nq` (C), `exhaustion-v2-nq-fut` (F) |
| Branch | `claude/signal-bot-bias-analysis-bwr1qv` (pushed to main) |
| Register row | `plans/RESEARCH_REGISTER.md` → `exhaustion-v2-nq` |
| Lines | the walk-forward NQ ladder from `ladder-v2-nq` (chosen σ har_rv_log = arm E6): `analysis/output/ladder-v2-nq/test_{C,F}.parquet` columns `E6_{oh,ol,oc,hl}_{50,75,90}`, % of the London-midnight open |
| Prices | the same M1 files as `ladder-v2-nq` (frozen copies + SHA-256 in `analysis/output/ladder-v2-nq/frozen/`); F unadjusted for levels, end-stamp shifted −1 min |
| Calendar | `load_calendar()` (`scripts/calendar/fetch_nasdaq_calendar.py`), USD rows with impact Major, UTC; Nasdaq keyword impact after 2026-07-02 |
| Window | London sessions 00:00–22:00, test years **2019 → 2026-08-21** (2018 is train only: the lines start in 2018) |
| Seed / uncertainty | `20261119`; session block bootstrap, block 63 sessions, B = 2000 |
| Scripts / outputs | `scripts/exhaustion-v2/` → `analysis/output/exhaustion-v2-nq/` |

Runbook `plans/VOL_EXHAUSTION_RUNBOOK.md` Phase 2, first instrument. Same racing method as the σ race.

## 1. Claim

When price first touches one of the day's ladder lines, the chance it travels at least δ further before 22:00
London is forecastable. Among a fixed list of forecasts, one is calibrated (its stated probabilities come true) in
every time-of-day bucket and σ regime and is sharper than the plain ladder odds. Walk-forward, CFD and futures
separately. This is a probability of further travel ("is the move used up?"), not a reversal or a trade.

## 2. Prior art

- `line-touch-reach` (VALIDATED): the plain ladder odds are calibrated pooled (p50→p75 ~50%, p75→p90 ~40%). That is
  baseline X0 here; this study asks whether conditioning beats it.
- `band-reach-from-here` (VALIDATED): the hour matters (2.3–2.7× higher odds early in the session).
- `day-recon-reach-range-used` (NULL): range used adds nothing to reach forecasts (NQ −0.05%). Raced again as X6.
- `exhaustion-schedule` (NULL, degenerate): a fixed % schedule just restated the clock. Here every candidate is a
  probability scored on calibration and sharpness, so a clock-only answer can win only if it really is best.
- `vol-line-touch-layers` (NULL / UNDERPOWERED): vol-clock share, range used etc. tested as **trade picks** for net R,
  not as probabilities of travel. `approach-speed`, `live-range-line-race` (NULL): approach and path don't matter.
- `futures-exhaustion-vwap` (UNDERPOWERED as a fade): VWAP distance, here only as a conditioner (X8).
- `nq-lines-as-exhaustion` (EXPLORATORY): median further travel 0.3–0.5σ past a line.
- Dynamic HL lines can sit on the wrong side of the open (`js/forecastAnalyser.js` phantom reversions, ~4–5%). Those
  touches are kept and reported as their own subset.

## 3. Definitions

- **Lines** (session open O, rung p ∈ {50, 75, 90}, values from `E6_*_p`, in %):
  - OH_p = O(1 + oh_p), OL_p = O(1 − ol_p); OCu_p = O(1 + oc_p), OCd_p = O(1 − oc_p) (static).
  - **Projected high** PH_p(t) = runLow(t) · (1 + hl_p), **projected low** PL_p(t) = runHigh(t) · (1 − hl_p), where
    runLow/runHigh are the session low/high over bars **before** bar t (production `proj HIGH = runLow × (1+hlDist)`).
- **Touch:** the first M1 bar of the session whose high ≥ an up line (low ≤ a down line). One touch per line per
  session. The forecast is made at the line price at that bar.
- **Further travel F:** up lines, session high from the touch bar to 22:00 minus the line; down lines mirrored.
- **Targets (both registered, scored separately, PRIMARY averages them):**
  - **δ_next:** the distance to the next rung of the same family at the touch (p50→p75, p75→p90; p90 has none).
  - **δ_σ:** 0.25 × σ_E6 × O.
  - Outcome Y = 1 if F ≥ δ.
- **Time left** τ: minutes from the touch bar to 22:00 London. σ_E6 is daily (NY-close day, 1,440 minutes).

## 4. Candidates (all fitted on train touches only, refit each test year, expanding window)

| # | Forecast of P(Y = 1) |
|---|---|
| X0 | Train rate by family × rung × target (no clock). Baseline |
| X1 | Random walk, clock time: 2·(1 − Φ(δ / (σ·O·√(τ/1440)))) (reflection principle, zero drift) |
| X2 | Random walk, **vol clock**: as X1 with τ/1440 replaced by the train-average share of daily variance falling in [touch, 22:00) London (5-minute buckets of squared 1-min returns) |
| X3 | Train rate by family × rung × target × 2-hour London bucket, shrunk to X0 with weight 20 touches |
| X4 | X2 with σ_remaining scaled by ρ^β, ρ = realised variance from 00:00 to the touch ÷ σ² × (vol-clock share elapsed); β on a grid 0…1 by train log loss |
| X5 | X2 with remaining variance × k when a USD Major release is due after the touch and before 22:00; k on a grid 1…3 by train log loss |
| X6 | X2 with σ_remaining scaled by u^β, u = range so far ÷ (σ·O); β by train log loss |
| X7 | Logistic: logit X2, log ρ, release-to-come flag, log u, family × rung dummies; train fit, ridge 1.0 |
| X8 | **F only:** logistic on logit X2, (touch − session VWAP)/(σ·O), log(touch-bar volume ÷ that minute's train median) |

## 5. Scoring and pass rules

- **PRIMARY (calibration miss):** cells = 4 London time buckets (00–07, 07–12, 12–16, 16–22) × 5 σ quintiles (A0
  σ ÷ trailing 250-session median, as `ladder-v2-nq`). Per cell |mean forecast − observed rate| over all touches in
  it, in pp; averaged over the 20 cells; averaged over the two targets. Lower is better.
- **GUARD:** the miss over the 18 family × rung cells (pooled over time) is no more than 1pp worse than X0's.
- **SHARPNESS:** log loss ratio vs X0 (reported; breaks ties).
- **Noise floor:** the PRIMARY of a perfect forecaster at these cell sizes (outcomes drawn as Bernoulli(chosen
  forecast), B = 2000). At or below its 90th percentile = "calibrated to noise".
- **Selection:** lowest PRIMARY among GUARD passers; a tie (bootstrap CI of winner − runner-up includes 0) goes to
  the lower log loss.
- **VALIDATED** (per track): the 90% CI of (winner re-selected in each draw − X0) is below 0 overall; in both halves
  (2019–22, 2023–26); with each stress window left out (2020-02-19 → 06-30, 2022, 2025-03 → 05, and the track's
  two highest-range 63-session windows); and with data-fault-flagged sessions left out (`forge/data_screens.py`
  v1 fault screens). **AND** the winner's log loss is below X0's with its CI excluding 0 (calibrated alone is not
  enough if it is no sharper). **NULL** if the PRIMARY CI excludes any improvement ≥ 1pp and the log-loss CI
  excludes any gain ≥ 1%. **UNDERPOWERED** otherwise.
- Halves use the pooled quintile edges; left-out checks recut them (ladder A2 convention).

## 6. Controls (must pass before the real touches are scored)

- **Positive control:** synthetic random-walk sessions (Brownian M1 paths, daily σ known, a vol clock with a US-open
  bump) with lines from the true σ: X2 on the true σ must be within the floor's 90th percentile; X0 must show a
  time-bucket miss ≥ 5pp (the clock effect is recoverable).
- **Placebo levels:** the same scoring on levels at a random distance from the open (matched to the real lines'
  distance distribution, same session): reported, so a "line" effect can be told from a "distance and clock" effect.
- **Touch extraction check:** on 20 random sessions the touch bars and F values are recomputed by a separate slow
  loop and must match exactly.

## 7. Power

About 2,000 test sessions per track (2019–2026). At about 8–12 first touches per session over 18 lines, ~20,000
touches per target, ~1,000 per PRIMARY cell: per-cell SE ≈ 1.5pp before session clustering, ~0.4pp for the 20-cell
mean. The bootstrap MDE will be printed; a 1pp PRIMARY gain should be detectable.

## 8. What this does NOT test

Direction or reversal; any trade or fill; gold or other instruments (own preregs on this template); intrabar order
within the touch bar beyond "touch first"; sessions after 2026-08-21.

## 9. What each verdict changes

- **VALIDATED:** the winner's probability goes on the shadow export as an exhaustion figure per rung and time bucket
  (runbook 2.4), e.g. `OH p75 … · further 0.25σ 38% now`. Forward record before anything live.
- **NULL:** the plain ladder odds are as good as it gets for NQ; the export carries X0 (or X2 if it ties at equal
  sharpness, since it needs no table).
- **UNDERPOWERED:** pooled across indices (NQ, ES, YM, RTY) once those have their σ race.

## Variant log

| # | Variant | Added | Status |
|---|---|---|---|
| 1 | Candidates X0–X8, targets δ_next and δ_σ, rules §5 | 2026-11-19 | registered |

## Amendments

(none)
