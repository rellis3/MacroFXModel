# STEP 1b — Fixing the forecast's leftovers: persistence, weekday, implied vol (Lesson 03 §02)

*Pre-registered 2026-10-06, before any result. Part of `plans/LESSON_TARGET_REBUILD_PLAN.md`. Reads the Step 0 table
(`forge/FORECAST_HISTORY_SPEC.md`). No Vote Atlas input. A **shadow candidate** next to the live export calculation:
nothing live changes (owner rule: side by side).*

## Why

- **Step 1** (forge/FORECAST_RECORD_PREREG.md): the export forecast is calibrated on average, but it over-reacts to
  regime. After calm spells HL p75 is passed 30.6% of the time; after busy spells 19.9%.
- **Step 3a** (forge/META_LABEL_PREREG.md): the morning information that predicts line failures is mostly the
  forecast's own leftovers:
  - recent misses (persistence);
  - weekday (Monday HL p75 passed 20.6%, Thursday 27.7%);
  - implied vol vs σ.
- **Lesson 03 §02:** volatility persists and reverts at a measurable rate. A forecast that ignores the rate gets the
  level wrong after shocks.
- **Lesson 03 §01:** fix each layer on its own standard. This is the forecast layer, scored on the forecast's yardstick
  (Step 1), not on P&L.

## The candidate

σ_new = σ_used × exp(β · x), where σ_used is the export calculation's point-in-time σ (event multiplier included),
and x are known at the London open:

| feature | definition |
|---|---|
| `regime` | log(σ_used ÷ its trailing 250-session median, previous sessions only) |
| `res1` | log(yesterday's HL ÷ yesterday's σ_used) |
| `res5` | mean of `res1` over the last 5 sessions |
| `weekday` | Tuesday … Friday dummies (Monday = base) |
| `iv_sig` (arm C only) | log(implied vol ÷ annualised σ), sources as forge/META_LABEL_PREREG.md Amendment 1 |

- **Fitting β:** ridge (λ = 1) on standardised features, per instrument class (FX majors, FX crosses, gold, indices).
  Features and target are centred per instrument, as in forge/COMBINED_RANGE_PREREG.md. Target = log(HL ÷ σ_used).
- **Widths:** per instrument, each rung's multiplier = the training quantile of realised ÷ σ (the ladder's own
  method), fitted on the same training rows.

## Arms (same rows, same training windows)

- **A0** — the export as it was point-in-time (`pit_*`, fold widths). The reference record.
- **A1** — the same σ_used, widths refit by this procedure. **The control**: B and C must beat A1, so a gain cannot
  come from refitting widths alone.
- **B** — σ_new with regime, res1, res5, weekday.
- **C** — B plus `iv_sig`. Scored only on instruments with implied vol (6 USD majors, gold, 6 indices), against A1 on
  the same rows.

## Walk-forward

- Test years are the forecast's folds 0–5.
- For a test fold, training = every complete session dated before the fold's first test date minus a 5-session
  embargo, including 2016–2020. σ_used is causal on every row; only the widths are refit.
- β and widths are frozen per fold.

## Score (the Step 1 yardstick)

- **Pinball** over all 12 rungs (OH, OL, HL, |OC| × p50/p75/p90), each loss ÷ the session's σ_used, pooled.
- Ratio B ÷ A1 (and C ÷ A1), with a date-block bootstrap interval (block 20, 2,000 reps).

## PASS (per arm, B and C separately)

1. **Better:** pooled pinball ratio interval wholly below 1.
2. **Fixes the regime flaw:** HL p75 exceedance, the largest |exceedance − 25%| across quiet / normal / busy, is
   smaller than A1's.
3. **Harms no class:** the point ratio is ≤ 1.005 in every class (FX majors, FX crosses, gold, indices).

**Descriptive** (no pass weight): the same regime table for all rungs, the weekday table, per-fold ratios, β per class.

## If it passes

It becomes a shadow column ("Forecast · persistence-adjusted"). It sits beside the export, IV-adjusted and HAR-800
for the owner to compare, and Step 3b is built on whichever lines the owner prefers. Nothing live changes.

## Output

`analysis/output/forecast_fix/RESULTS.md`; script `scripts/forecast_history/forecast_fix.py`.

## Variant log

| # | Variant | Why | Run? |
|---|---|---|---|
| 0 | arms A0, A1, B, C as above | registered | — |
