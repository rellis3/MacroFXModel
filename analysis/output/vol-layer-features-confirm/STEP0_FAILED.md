# vol-layer-features-confirm: step 0 failed (one part). The confirm window was NOT opened.

Prereg: `forge/VOL_LAYER_FEATURES_CONFIRM_PREREG.md`. Run 2026-11-16, seed 20261116, B = 2000.
Script: `scripts/vol-layer-features-confirm/run.py step0`. Raw output: `discovery/step0.json`, `discovery/step0.log`.
No share, correlation, event or tail statistic was computed on any session from 2023-01-02 onward.
The 1-minute grid (`grid/grid.npz`, not committed) holds prices to 2026-08-20, but nothing reads the 2023+ rows.

## 1. Discovery reproduction: PASSED (all five match to 3 dp)

| Cell | Prereg §2 | Reproduced | SE (B = 2000) |
|---|---|---|---|
| TOD | +0.163 | +0.16339 | 0.0165 |
| SIG | +0.118 | +0.11824 | 0.0317 |
| FR | −0.100 | −0.10027 | 0.0286 |
| EQ 1h | −0.0006σ (−0.001) | −0.00061σ | 0.0031 |
| EQ rest | −0.0101σ (−0.010) | −0.01012σ | 0.0067 |

The grid was rebuilt from `data/m1_bidask` in the main checkout. It was not copied from the stage 2 cache.
1,615 sessions, 1,584 complete. Events with a finite 1h outcome: 29,696 dollar-led, 48,711 own-led.

## 2. Positive control (planted one-factor model, 800 sessions): 5 of 6 parts pass

| Part | Required | Got | Pass |
|---|---|---|---|
| Share by pair × bucket (35 cells) | within ±0.02 of planted | max error 0.0077 | yes |
| TOD statistic | within ±0.02 | 0.3069 vs planted 0.3066 | yes |
| SIG statistic | within ±0.02 | 0.2239 vs planted 0.2290 | yes |
| **FR, literal prereg claim:** corrected ρ on factor-only loud days = calm ρ | within ±0.02 | **+0.149** (population value +0.151) | **NO** |
| FR, the pipeline's own statistic (deciles 8–10 vs 1–3) vs its planted population value | within ±0.02 | 0.1478 vs 0.1515 | yes |
| EQ: 90% interval covers 0 (no planted difference), 100 seeded draws | ≥ 85 | 1h 88, rest 86 | yes |

## 3. Why the FR part fails: the prereg's closed-form claim is wrong, not the code

- The code recovers the exact population value of its statistic (error −0.004). The population value is computed from the planted moments, not from simulated draws. So the estimator is right.
- The claim fails in theory. The Forbes-Rigobon correction ρ/√(1+δ(1−ρ²)) is exact only when one series is the source whose variance rises and the other loads on it. Here both majors load on the dollar, so both variances rise. In that case the corrected ρ still rises on loud days.
  - Worked case: equal loadings, calm ρ = 0.40, dollar variance ×3. Loud raw ρ = 0.667, δ = 0.8, corrected ρ = 0.555, not 0.40.
- **On discovery's own data** (scratch check, discovery window only), a pure dollar-variance rise is sized to match the observed variance ratio (top ÷ bottom 3.43). It would give F ≈ **+0.18** and raw +0.38. Observed: F = −0.10, raw +0.09.

What this means for the FR cell:
- F = 0 is **not** the "dollar-only" benchmark that §3 and §4 of the prereg assume. The true benchmark sits above 0.
- So F < −0.05 is a *conservative* test of "loud days are not dollar takeovers". The registered statistic and bar still test a sensible claim: loud days are less correlated than calm days even after correction. But the prereg's wording, "the same test as observed ρ below the forward map", is also off. Under a pure factor rise the forward map (+0.08 in the control) under-predicts raw ρ (+0.24).

## 4. Proposed PRE-RESULTS amendment (for the coordinator / owner to approve; NOT applied)

> **2026-11-16, PRE-RESULTS (before any 2023+ outcome).** Step 0 positive control, FR part. The prereg said the
> corrected correlation on factor-only loud days equals the calm correlation. That is false when both legs load on the
> factor: under the planted model the corrected statistic is +0.151 (population) and the code recovers +0.148. The
> FR control is replaced by "the pipeline recovers the population value of its own statistic under the planted model,
> within ±0.02" (passes: error −0.004). The FR cell's statistic, pass bar (−0.05), neighbours, lag and gate are
> unchanged. The reading changes: F < 0 means loud days are less correlated than calm days after the correction. A
> dollar-only variance rise would give F > 0, which is +0.18 on discovery's own covariance. So the bar is
> conservative for "not a dollar takeover". The forward-map mirror is reported as a description, not as an
> equivalent test. This amendment changes no scored number.

If approved, the only steps left are:
1. Paste the amendment into the prereg's `## Amendments`.
2. Set `"pass": true` in `discovery/step0.json`, noting the amendment.
3. Run `python -X utf8 scripts/vol-layer-features-confirm/run.py confirm` once (about 15–25 min).

The confirm stage is already written and refuses to run while step 0 shows a fail.

## 5. Code check of the confirm stage (discovery data only)

`run.py smoke` ran the full confirm stage end to end on 2017-01-02 → 2022-12-30, with a 40-session warm-up.
It found no bugs. Output is in `smoke_discovery/`. It is not a result: it re-reads discovery data that was already used.
It gave TOD +0.167, SIG +0.117, FR −0.096, EQ 1h −0.0014σ and EQ rest −0.0108σ, close to the §2 values.
No 2023+ row was read.
