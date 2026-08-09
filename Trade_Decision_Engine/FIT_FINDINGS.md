# Trade Decision Engine — fit findings (backtest vs hand-weighting)

The question: instead of the hand-set `modelV0` prior (`calibrated: false`), can we
**fit** the model on history and add the Phase-11-validated WaveTrend MTF-stretch as a
feature? Ran the existing `backfillPair` → `fitLogistic` pipeline (same `decide()` path
the live API uses; triple-barrier after-cost labels; time-ordered train/OOS + embargo).

## Setup
- Pooled 6 FX majors from the M1 cache: **110,883 labeled events** (38,635 OOS).
- Baseline features = `modelV0.weights` keys. A/B adds `wt_stretch_fade` (new feature:
  MTF WaveTrend OB/OS-stretched in the fade direction — M15+H1 wt1 ±53, causal at the touch,
  computed in `backfill.js:_mtfStretchLookup`).

## Result 1 — fitting BEATS hand-weighting (real, promotable)
| model | OOS Brier |
|---|---|
| `modelV0` hand-set prior | **0.2724** |
| fitted (v0 features) | **0.2469** |

The fitted logistic is materially better-calibrated than the hand-set prior
(`fitted_beats_prior: true`). So "backtest instead of hand-weight" is a genuine win — a
fitted `modelV1` would give honest, calibrated probabilities for the go-threshold + sizing.

## Result 2 — but the model is weakly DISCRIMINATING (the honest ceiling)
OOS calibration collapses to a single reliable bucket: **predicted 0.558 → realized 0.554**
across all 38,635 OOS events. Almost everything scores 50–60% and realizes ~55% — the
features barely separate winners from losers. A fitted v1 is better *calibrated*; it is not
more *selective*, because the setups themselves aren't very separable (consistent with the
whole research arc: magnitude/context is predictable, per-trade direction is not).

## Result 3 — the WT-stretch feature does NOT transfer to the general zone set (NULL here)
- fitted `wt_stretch_fade` weight ≈ **−0.005** (≈ zero); Brier improvement baseline→+WT = **0.00000**.
- Raw: among fades, `wt_stretch_fade=1` (7.5% of them) win **54.6%** vs all-fades **55.7%** —
  slightly *worse*, not better.

Why, given Phase 11 showed MTF-stretch lifts the **median-line** fade to 62%? Because Phase 11
measured it at the **forecast median/75th lines** with the OC-median fade geometry. The decision
engine fades a much broader zone universe (pivots, prior H/L, S&R clusters, round numbers,
asia/monday ladders, session hi/lo) with a σ triple-barrier. The WT-stretch edge is
**forecast-line-specific — it is not a universal "fade any stretched level" signal.** Useful
boundary: its home stays the level alert / reversion chart (forecast lines), where it's wired.

## Takeaways
1. **Promote a fitted `modelV1`** for the calibration win (Brier 0.272→0.247) — a human
   decision on this OOS evidence, per Lego Principle 5. It improves honesty of the probability,
   not selectivity.
2. **Do not add `wt_stretch_fade` to `modelV1` weights** — it's null on the engine's zone set.
   Keep it logged as an inert candidate (like `macro_align`/`credit_*`) for future subset work
   (e.g. gate it to forecast-line zones only, where Phase 11 validated it).

Reproduce: pool `backfillPair` events across the majors and run
`fitLogistic(events, { features: [...Object.keys(MODEL_V0.weights), 'wt_stretch_fade'] })`.
