# FX cross-match of the gamma-diffusion effect — results (2026-09-24)

Pre-registration: [`GEX_FX_CROSSMATCH_PREREG.md`](GEX_FX_CROSSMATCH_PREREG.md),
committed in `496bae1` **before** the run. Script: `scripts/21_gex_fx_crossmatch.py`.
Raw output: `data/results/gex_fx_crossmatch.json`.

## Verdict: **MIXED** — which for build purposes means NQ-only

This was pre-registered as a **falsification test** of the NQ result, with MIXED or
REFUTED written down as the expected outcome. It came back as expected.

## Primary — the three non-inverted pairs

| Pair | n | S/L | ΔDR raw | p | **ΔDR vol-matched** |
|---|---|---|---|---|---|
| EUR_USD | 1,507 | 1106/401 | +0.046 | 0.237 | **+0.037** |
| GBP_USD | 1,519 | 842/677 | +0.049 | 0.160 | **+0.039** |
| AUD_USD | 1,519 | 653/866 | +0.009 | 0.785 | **+0.043** |
| *NQ (banked)* | *793* | *244/549* | *+0.176* | *0.0008* | ***+0.315*** |

**Pooled across the three, resampled by date: +0.0377, p = 0.155, 95% CI
[−0.015, +0.090].** The interval crosses zero.

## Why 3-of-3 positive is not the result it looks like

The pre-registered rule required **both** all-three-positive **and** a pooled estimate
with p < 0.05. The signs pass; the pooled test does not. Three reasons that matters:

1. **EUR/GBP/AUD are not three independent votes.** They share a USD factor, so the
   pooled bootstrap resamples all three together by date. Resampling them separately
   would have understated the standard error and produced a false pass. This is
   Garin's "correlated pairs as diversification" failure mode applied to counting
   evidence rather than to a portfolio.
2. **No individual pair is significant** — p = 0.24, 0.16, 0.79 raw.
3. **The magnitude is 8.4× smaller than NQ** (+0.038 pooled vs +0.315). Even taken at
   face value, an effect that size cannot carry a stop-placement layer.

A first pass of this script checked signs only and printed CORROBORATED. That was an
implementation gap against the pre-registration, not a result; the pooled test the
prereg required is now wired into the verdict.

## Secondary — the CME-inverted pairs, both conventions, excluded from the verdict

`scripts/01_build_daily_dataset.py:58-65` inverts strikes for these but not the
call/put labels, so the GEX sign cannot be verified from this data. Both readings:

| Pair | ΔDR vol-matched (as built) | ΔDR vol-matched (flipped) |
|---|---|---|
| USD_JPY | −0.003 | +0.003 |
| USD_CAD | **+0.057** (raw p 0.006) | **−0.057** (raw p 0.005) |
| USD_CHF | +0.008 | −0.008 |

USD_CAD is the clearest illustration of why these were excluded: it is significant at
p ≈ 0.005 in **both directions** depending purely on a labelling convention nobody has
verified. Had it been pooled in without that check, it would have driven the verdict
either way. **Settle the convention before using these three for anything.**

## What this does to the NQ finding

It does **not** overturn it. NQ's +0.315 survived vol-matching, an event-day
exclusion, a placebo and an injection control. What changes is the *interpretation*:

- ❌ **"Dealer gamma modulates diffusion" is not established as a general mechanism.**
  It does not reproduce at meaningful size in FX.
- ✅ The NQ effect stands as **instrument-specific and unexplained**. Candidate
  explanations — 0-DTE concentration, index-option volume dwarfing FX, single-name
  gamma aggregation — are untested speculation, named here as speculation.
- ❌ **Do not build a cross-instrument expected-range layer on this.** The prereg said
  MIXED is the same as REFUTED for build purposes, and that stands.

## The honest position now

One instrument shows a large, well-tested effect. Six others show effects an order of
magnitude smaller, none individually significant, and three of those six have an
unresolved sign convention. That pattern is more consistent with **something specific
to the NQ book** than with a mechanism operating across listed options generally.

The next question worth asking is not "where else does this appear" but **"what is
different about NQ"** — and until that has an answer, the +0.315 should be treated as
a measured fact about one instrument rather than as evidence for dealer-hedging
theory.
