# Layer 6 — CONFIDENCE (meta-labelling): can today's conditions sharpen layer 5's probabilities?

Part of `plans/FORECASTER_SYSTEM_BLUEPRINT.md`. Written 2026-10-06 before any model is fitted. Frozen; changes only by
dated amendment before results.

## Why, and what is being labelled

Lesson 3: meta-labelling is a secondary model that learns, from the history of a primary model's calls, when those
calls are likely to be right, separating *which way* from *whether and how much*. Layers 4–5 found no direction at
the lines, so the primary call available today is layer 5's own: **"from this checkpoint, price will travel at least
the p50 (or p75) remaining-travel distance on this side before the session ends."** Layer 5 (R3, per-hour multipliers;
forge/REMAINING_TRAVEL_PREREG.md) makes that call with a fixed base rate: 50% for p50, 25% for p75. Layer 6 asks
whether a model using conditions known at the checkpoint can tell a 40% day from a 10% day — and stay calibrated.
The same framework can later label any directional primary model.

## Data

Rows: `analysis/output/remaining_travel/*.csv` (layer 5 builder): instrument × session × checkpoint (London 01:00 …
19:00; 21:00 excluded as flagged unreliable in layer 5) × side (up, down) × rung (p50, p75).
Label y = 1 if the travel on that side ≥ the R3 threshold (R3 multiplier for class × hour × side × rung, σ units).

## Features (all known at the checkpoint)

hour; class; side; σ regime (HAR σ ÷ trailing 250 median); implied vol ÷ σ (CME 30d ATM majors, GVZ gold, VXN NQ, VIX
SPX500/US30/US2000; missing elsewhere, with a missing flag); event tag (calendar proxy: tier1 / high / none / unknown);
range used so far (σ); realised vol so far ÷ the share of the day elapsed (σ units); price vs open toward the labelled
side (σ); distance from the running extreme on the labelled side (σ); yesterday's H−L ÷ yesterday's σ; day of week.

## Models

- **M0 base**: the layer-5 rate (0.50 / 0.25) — the thing to beat.
- **M1 logistic regression** on the features above (standardised; one-hot class / hour / side / event; L2, C = 1).
- **M2 gradient boosting** (`HistGradientBoostingClassifier`, max_depth 3, learning_rate 0.05, 300 iterations,
  early stopping on the validation year), with isotonic calibration fitted on the validation year.

Splits by date: **train** < 2024-09-05 · **validation** 2024-09-05 → 2025-09-04 (early stopping, calibration, model
choice) · **test** ≥ 2025-09-05 (scored once).

## Scoring and pass rule (test year, date-clustered)

- **Brier skill score** vs M0: BSS = 1 − Brier(model) ÷ Brier(M0), with a 95% interval from a session-block bootstrap
  (2,000 draws).
- **Reliability**: predicted-probability deciles; |mean predicted − observed| per decile.
- **PASS** for a model: BSS 95% lower bound > 0 for **both** rungs, and max decile miss ≤ 3pp (deciles with ≥ 500 rows).
  The model chosen on the validation year is the one scored; both are reported.
- Reported, no rule: AUC, BSS by class and by hour band, permutation importance on test (which conditions carry it).

If nothing passes, layer 6 says the conditions available do not sharpen layer 5 — itself a usable answer (act on the
base rates, not on a confidence score).

## Variant log (Lesson 2)

| # | Variant | Added | Status |
|---|---|---|---|
| 1 | M1, M2 as above | 2026-10-06 | run: chosen M2 **FAIL** (skill real, calibration 3.4pp > 3.0) |

## Results (variant 1, 2026-10-06) — `analysis/output/confidence_fit.log`

Rows: train 2.89M, validation 0.35M, test 0.33M (248 test sessions, 34 instruments, checkpoints 01–19 London).

| model | rung | validation BSS [95%] | test BSS [95%] | test max decile miss | test AUC |
|---|---|---|---|---|---|
| M1 logistic | p50 | +0.86% [+0.50, +1.24] | +0.61% [+0.31, +0.91] | 2.9pp | 0.546 |
| M1 logistic | p75 | +1.37% [+0.81, +1.97] | +1.00% [+0.61, +1.38] | 3.0pp | 0.565 |
| **M2 boosting (chosen)** | p50 | +1.48% [+1.05, +1.95] | **+1.45% [+1.08, +1.88]** | 2.8pp | 0.568 |
| **M2 boosting (chosen)** | p75 | +2.08% [+1.36, +2.84] | **+2.06% [+1.53, +2.62]** | **3.4pp ✗** | 0.593 |

**Pre-registered verdict: FAIL** — M2's skill is real (both intervals clear zero, unchanged from validation to test)
but its p75 reliability misses one decile by 3.4pp against a 3.0pp limit. M1 has less skill and sits exactly on the
limit (3.0pp). Not loosened.

Read:
- The skill is **small**: about 1.5–2% better Brier than layer 5's flat base rates (AUC 0.57–0.59). Conditions known at
  a checkpoint tell a slightly-more-likely day from a slightly-less-likely one; they do not separate a 40% day from a
  10% day.
- What carries it (permutation importance, % of base Brier): **time of day 3.6%** and **realised vol so far 3.2%**,
  then IV ÷ σ 0.7%, day of week 0.6%, range used 0.4%; price vs open, distance from the running extreme, yesterday's
  range and the σ regime ≈ 0. This is layer 5's finding again — busy-so-far days keep travelling — plus hour-level
  shape the per-hour multipliers do not fully capture.
- Skill grows through the day (test BSS +0.5–0.7% at 01–07 London, +3.3% at 17, +4.2% at 19) and is larger for indices
  (+3.0%) and gold (+2.9%) than crosses (+1.2%).
- For the system: layer 5's base rates are nearly as good as any confidence score built from these conditions. A
  confidence layer is worth carrying only as a small adjustment late in the session, and only once its calibration
  holds; the obvious next variant is realised-vol-so-far built into layer 5 directly rather than a separate model.
