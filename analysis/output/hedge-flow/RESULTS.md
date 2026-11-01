# hedge-flow — results

Prereg: `oi_research_book/HEDGE_FLOW_PREREG.md` (frozen 2026-10-26; PRE-RESULTS amendment 866543f9, 2026-10-31). Script `oi_research_book/scripts/29_hedge_flow.py` (committed before the run). Run 2026-10-31, seed 20261026, 2,000 week-clustered bootstrap reps, 200 neighbour-book draws. Full numbers: `results_full.json`. Branch `main`. Ledger ids: `hedge-flow`, `hedge-flow-side`.

## Verdict: NULL (T1 size beyond sign, T3 lopsidedness); UNDERPOWERED (T2 which side); NQ T1 is CONTEXT

No cell passed its registered gate. The pre-registered rule needs the real statistic to beat strike-shifted and neighbour-day placebos, hold in both halves, have a confidence interval excluding zero, and (for FX) hold in at least 2 of 3 pairs.

## Scored cells (lag 1, the primary; lag 2 is in the JSON and agrees: nothing passes)

| Set | Test | Days | Estimate | 95% CI | Placebo (shifted max / neighbour p95) | Cell |
|---|---|---|---|---|---|---|
| FX (EUR, GBP, AUD) near | T1 | 4,501 | +0.0005 | [-0.014, +0.014] | 0.0145 / 0.0128 | FAIL |
| FX near | T2 | 4,501 | +0.036σ | [-0.080, +0.151] | 0.133 / 0.066 | FAIL |
| FX all | T1 | 4,501 | -0.0027 | [-0.020, +0.014] | 0.024 / 0.011 | FAIL |
| FX all | T2 | 4,501 | +0.035σ | [-0.093, +0.165] | 0.129 / 0.160 | FAIL |
| NQ near | T1 | 780 | +0.050 | [-0.010, +0.105] | 0.070 / 0.060 | FAIL |
| NQ all | T1 | 780 | **+0.083** | **[+0.033, +0.131]** (p 0.003, survives BH q 0.10) | **0.091** / 0.076 | FAIL |
| NQ near / all | T2 | 780 | +0.43σ / -0.01σ | [-0.07, +1.04] / [-0.32, +0.29] | wide | FAIL |

T3 (lopsidedness) is within +-0.03 everywhere, as registered (expected null). The mechanical sign-flip check (calls and puts swapped) reverses T1 and T2 in every set, so the code does what it claims.

## Controls

- NQ T1 on the `all` book is the one cell that is statistically real (CI above zero, both halves positive +0.15 / +0.10, beats the neighbour-day placebo), but **a book with every strike moved by 2 or 4 listed increments gives the same or a larger number (0.079 to 0.091 against 0.083)**. The size of the hedge-flow does not need the right strikes: it is the shape and size of the whole open-interest book, which is what the gamma sign already summarises. That fails the registered strike-shift gate.
- The six-pair FX result is tight (T1 CI about +-0.014), so for FX the answer is a clean null. T2 on FX and NQ is too wide to judge: intervals are +-0.12σ (FX) and +-0.5σ (NQ), and NQ had too few one-sided days to split into halves.
- CME-inverted pairs (JPY, CAD, CHF), outside the verdict because their call/put convention is unresolved: T1 within +-0.006, T2 up to +0.08σ and +0.06σ at lag 2; nothing passes.

## Deviations from the prereg

The dated PRE-RESULTS amendment: no gold chain and no ES surface existed, so ES was not run and the index route "both NQ and SPX" could not be met; FX verdict set is EUR/GBP/AUD pooled; surfaces are the stored `near` and `all` books; UTC-D1 bars. No post-hoc amendment.

## What this changes

OI Lab card 05e stays context. It gets no range-expectation line and the shadow plan gets no flow-asymmetry filter. The only live lead is NQ's flow size against its own history, and the strike-shift control says it adds nothing the gamma sign does not. Reopen with ES and gold surfaces built, per-expiry books, and a longer NQ sample.
