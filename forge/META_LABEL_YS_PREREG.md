# STEP C — Meta-labelling the yield-spread book with the forecast's state (Lesson 03 §01)

*Pre-registered 2026-10-06, before any model was fitted. Part of `plans/LESSON_TARGET_REBUILD_PLAN.md` (END STATE,
step C). Replaces 3b (stopped: forge/META_LABEL_PREREG.md Amendment 3). No Vote Atlas input.*

## The lesson's definition, applied as written

"A secondary model learns, from the history of a primary model's decisions, when those decisions are likely to be
right, and so separates the question of which way to bet from the question of whether, and how much, to act."

- **Primary (which way):** the yield-spread mean-reversion book (`MD files/YIELD_SPREAD_STRATEGY.md`), validated
  configuration entry |z| 2.0, z-window 126, z-exit 1.5, max hold 20 days, pub lags +2 / +45 days, 6 USD pairs.
  Trade list from `/api/yield-spread/run` with `includeTrades` (`analysis/output/meta_label_ys/ys_run.json`):
  **296 trades, 2016-10 → 2026-09.** Seen before registration: the run's summary only (n, win rate, PF, split).
- **Secondary (whether / how much):** what the volatility system knows when the trade is entered (entry = the UTC
  daily close of the entry date).

## Label

`y = 1` if the trade's return net of the 0.02% round-trip cost is > 0 (flat size: direction × (exit − entry) ÷ entry).

## Features (five, fixed now; all known at the entry close; from the Step 0 table, point-in-time σ)

1. `regime` = log(σ_used ÷ its trailing 250-session median) on the entry session.
2. `res5` = mean log(HL ÷ σ_used) over the 5 sessions before the entry session (recent range vs forecast).
3. `today` = log(HL ÷ σ_used) of the entry session itself (complete by the UTC close).
4. `jumps5` = number of BNS jump days (forge/JUMPS_PREREG.md Amendment 2) in the entry session and the 4 before.
5. `absz` = the primary's own |entry z| (its conviction), so the meta-model is not credited for what the primary
   already knows.

## Model and walk-forward

- **Model:** logistic regression, standardised features, L2 (C = 1). Fixed, not tuned. 296 trades cannot support
  more.
- **Walk-forward by calendar year:** test year Y uses a model trained on all trades closed before 1 January of Y.
  Test years 2019 → 2026, which leaves ~2.5 years / ~70+ trades for the first fit.
- **Training weight** = 1 ÷ the number of trades open on the same day (uniqueness; trades overlap up to 20 days
  across 6 pairs).

## How the probability becomes size (fixed now)

From the training set's predicted probabilities, take the terciles. In the test year:
- top tercile → size 1.5;
- middle → 1.0;
- bottom → 0.5.

Sizes are then **rescaled so the test year's mean size is 1**. The meta-sized book carries the same average risk as
flat, so any gain is selection, not leverage.

## Scores (test years pooled; 95% intervals by block bootstrap over entry months, 2,000 reps)

- **Primary:** Sharpe of per-trade returns, meta-sized vs flat, difference with interval.
- **Secondary:**
  - mean net return per trade, meta vs flat;
  - win rate by tercile (bottom / middle / top);
  - the skip variant (bottom tercile size 0), reported only.

## PASS

The difference in per-trade Sharpe (meta − flat) has its whole 95% interval above 0, **and** the top tercile's win
rate exceeds the bottom tercile's.

Otherwise FAIL: the volatility state does not tell when the yield-spread book is right. The book keeps its flat
(or vol-targeted, step B) size.

**Power, stated now (Lesson 01):** ~200 test trades can only detect a large effect. A FAIL here means "not shown",
not "absent". The forward record would have to show a smaller one.

## Output

`analysis/output/meta_label_ys/RESULTS.md`; script `scripts/forecast_history/meta_label_ys.py`.

## Variant log

| # | Variant | Why | Run? |
|---|---|---|---|
| 0 | as above | registered | — |
