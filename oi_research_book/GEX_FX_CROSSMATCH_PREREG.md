# Pre-registration — does the NQ gamma-diffusion effect appear in FX?

**Written 2026-09-24, before any outcome was computed.** Committed before the run.

## What this is

`GEX_RANGE_BROWNIAN_RESULTS.md` found next-day realised range +0.315 (vol-matched)
higher on short-gamma days for NQ, on 793 days, surviving an event-day exclusion.
That is **one instrument**. This test runs the identical statistic on the FX pairs in
`OI Data/`.

**This is a falsification test of that result, not an extension of it.** The retracted
post-hoc in `analysis/gamma_spec_curve.py` (2026-08-23) hinted that indices carry the
predicted sign and **FX carries the wrong one**. If FX disagrees, "dealer gamma
modulates diffusion" is not established as a mechanism and the NQ finding is
instrument-specific — plausibly 0-DTE concentration or index structure, not hedging.

## The sign-convention problem, found before running

`scripts/01_build_daily_dataset.py:58-65` inverts **strikes** (`1/K`) for the
CME-inverted pairs (USD_JPY, USD_CAD, USD_CHF) but does **not** swap the call/put
`right`. Under quote inversion a CME call is economically a put in the OANDA
convention that `spot` and the D1 files use.

This may well be harmless — gamma is identical for a call and a put at the same
strike and is always positive, so the GEX sign depends only on which frame the
"dealers long calls, short puts" heuristic is applied in, and applying it to
CME-listed contracts is internally consistent. **But I cannot verify it from this
data**, and a silent sign flip on three of six pairs would manufacture a "FX
disagrees" result.

Therefore:

- **PRIMARY: `EUR_USD`, `GBP_USD`, `AUD_USD`** — no inversion, no ambiguity. The
  verdict rests on these.
- **SECONDARY: `USD_JPY`, `USD_CAD`, `USD_CHF`** — reported with **both** sign
  conventions shown, and excluded from the verdict. They cannot corroborate or refute
  anything until the convention is settled separately.

Pooling across an unverified convention is exactly how a sign error becomes a finding.

## Design

Identical to script 18/19, unchanged: `DR = realised next-day log range ÷
(σ_trailing · √(8/π))`, GEX at t, range at t+1, then the within-trailing-vol-stratum
comparison (5 strata) that is the headline estimator. Primary cell = `near` surface,
`rv20_ann` normaliser, `net_gex_sum`.

## Verdict rule

Judged on the three unambiguous pairs:

- **CORROBORATED** — all 3 show positive vol-matched ΔDR, and the pooled estimate is
  positive with block-bootstrap p < 0.05. The mechanism generalises; NQ is not special.
- **REFUTED as a general mechanism** — 2 or 3 of the 3 are negative. The NQ result
  survives only as an instrument-specific effect and must be relabelled as such in
  `GEX_RANGE_BROWNIAN_RESULTS.md`.
- **MIXED** — anything else. NQ stands alone, unexplained, and no mechanism claim may
  be made from it.

A per-pair ΔDR whose sample has fewer than 200 usable days, or fewer than 60 days in
either gamma regime, is reported but **not counted** toward the verdict — FX option
books are far thinner than NQ's and a 30-day arm settles nothing.

## Prior, stated before the run

I expect **MIXED or REFUTED**. The 2026-08-22 study's FX arm carried the wrong sign,
FX dealer books are thinner and less 0-DTE-dominated than NQ's, and this repo's base
rate for a positive finding generalising across instruments is poor. A corroboration
would be the surprise, and is written here as such so it cannot be narrated as
expected afterwards.

## What it changes

| Outcome | Consequence |
|---|---|
| CORROBORATED | Gamma-diffusion is a mechanism. The expected-range layer is worth building across instruments. |
| REFUTED | NQ-only. Relabel the result. Do not build a cross-instrument range layer on it. |
| MIXED | NQ-only, unexplained. Same as REFUTED for build purposes; keep the open question. |
