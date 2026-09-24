# Pre-registration — does NQ net GEX predict next-day diffusion vs a Brownian baseline?

**Written 2026-09-24, before any outcome was computed.** Committed before the run.

## Why this test exists

`cog-replication/DECISIONS.md` (2026-07-29) declared this a prerequisite and never ran it:

> "Reverses if: GEX-derived ranges turn out uncorrelated with realised daily range —
> that is a cheap check and should be run before building on it."

G2 of the COG shadow maps GEX → stop % and risk tier and emits it live to Telegram
every weekday at 12:45 UTC. Nothing has ever tested the mapping's premise.

The same decision log said the OI hypothesis could not be backtested because
`oi_history` is a rolling ~60-day archive, with the stated reversal condition
"a real dated OI archive appears". It has: `OI Data/NAS100_USD.csv`, 1,521 dated
days of per-strike OI (2020-09-04 → 2026-09-04), already processed into
`oi_research_book/data/*_nas100_usd.parquet`. **That constraint is void.**

## Relationship to prior work (declared, not discovered afterwards)

- `analysis/gamma_band_realised.py` (2026-08-22) tested the **band spot sits in**
  across 11 instruments on **24 dates** → NULL, explicitly "a null at THIS power".
  This test is a different variable (**net book GEX**, not band position), on one
  instrument, with **743 usable days**. It is a new test, not a re-cut, and it
  counts against the multiple-testing budget.
- `analysis/gamma_spec_curve.py` (2026-08-23) retracted the post-hoc index/FX split
  from that study. The index leg is what survives here as a *prior*, not evidence.
- 2026-09-23: the OI wall placebo found walls reject no more than neighbouring
  strikes. That concerns walls as barriers (G3), not book gamma as a diffusion
  modifier (G2). Different object; noted so it is not read as corroboration.

## The mechanism, in one sentence

Dealers long gamma hedge *against* the move (sell rallies, buy dips), so price
diffuses **slower than Brownian**; dealers short gamma hedge *with* it, so price
diffuses **faster than Brownian**.

## The Brownian baseline (the point of the test)

Raw range is confounded: GEX scales with spot² and open interest, both of which
track the vol regime, so "high GEX days have big ranges" can be pure vol level.
Dividing by what a driftless random walk of the *same trailing vol* would have
produced removes that, and gives an absolute null instead of only a relative one.

For driftless GBM, the expected high−low log range over one unit of time is
`σ · √(8/π)` (≈ 1.5958σ). So, with `σ_t` = trailing 20-day realised vol known at
t (`rv20_ann/√252`, window ends at t — causal):

```
expected_range_{t+1} = σ_t · √(8/π)
realised_range_{t+1} = ln(high_{t+1} / low_{t+1})
DR_{t+1}             = realised_range_{t+1} / expected_range_{t+1}
```

**DR = 1** → diffuses like Brownian motion. **DR > 1** → pushing out (amplified).
**DR < 1** → reverting back (damped / pinned). GEX is read at t, range at t+1.

## The tests

**Primary.** Mean DR on short-gamma days (net GEX < 0) minus mean DR on long-gamma
days (net GEX > 0). Thesis predicts **ΔDR > 0**.

**Absolute reading (secondary, reported either way).** Is mean DR on long-gamma days
significantly **below 1**? That is "reverting back" in absolute terms, not merely
relative to the other bucket — a stronger claim and the one G2 would actually need.

**Multi-day (secondary).** Lo–MacKinlay variance ratio `VR(q) = Var(q-day ret) /
(q · Var(1-day ret))` for q = 2, 3, 5, computed separately within each regime.
VR > 1 = push-out persists past the day; VR < 1 = reversion. Tests whether the
effect is an intraday hedging artifact or survives to a horizon a trade could hold.

**Significance.** Stationary block bootstrap, mean block 10 days, 10,000 resamples.
Daily vol clusters hard, so an iid t-test would overstate significance — the exact
error that made the 2026-08-22 unclustered figures look better than they were.

## Specification axes (fixed now; all four reported, no selection afterwards)

| Axis | Values |
|---|---|
| Surface | `near` (single expiry — what G2 actually reads) · `all` (full book) |
| Normaliser | `rv20_ann` (primary) · `atr14` |

The two GEX columns (`net_gex_sum`, assumed IV; `net_gex`, real IV) **agree on sign
95.8% of the time**, so they are not an independent robustness axis and are not
treated as one. Both are reported; neither counts as confirmation of the other.

## Pre-registered verdict rule

- **SUPPORTED** — ΔDR ≥ **+0.05** on the primary spec with bootstrap p < 0.05, **and**
  the sign is positive on all four specification cells.
- **NULL** — |ΔDR| < **0.03** on the primary spec, **or** the sign disagrees across
  the four cells.
- **INCONCLUSIVE** — anything else. Not a licence to re-cut.

**A separate operational bar, declared now.** G2's two tiers are exactly 2× apart.
For GEX to justify switching tiers, ΔDR must be ≥ **0.10**. A result that is
statistically real but below 0.10 means **G2's mapping is not validated for the use
it is currently put to**, and the live alert must say so. Statistical significance
at 743 days is not the same as operational usefulness, and the distinction is
pre-committed rather than argued afterwards.

## Harness validation (must pass before the real run is believed)

1. **Placebo** — circular-shift the GEX series by +125 trading days, preserving its
   autocorrelation while breaking the date link. Must return |ΔDR| < 0.03.
2. **Positive control** — replace GEX with a variable known to predict range
   (trailing |return|). Must be detected with the right sign.
3. **No lookahead** — perturbing all prices after t+1 must leave DR_{t+1} unchanged.
4. **Dropped rows counted and logged**, not silently discarded.

## What kills it

ΔDR near zero, or the sign flipping across the four cells, kills the premise under
G2. That does not retire the shadow — G2 never moves the trade/no-trade decision —
but it means the stop % and tier it emits carry no information, and the alert text
and `DECISIONS.md` must be corrected to say so.
