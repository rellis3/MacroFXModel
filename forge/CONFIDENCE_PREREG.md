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
| 1 | M1, M2 as above | 2026-10-06 | registered |
