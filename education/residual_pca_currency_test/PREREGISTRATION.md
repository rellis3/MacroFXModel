# Currency PCA residual reversion — pre-registration (2026-09-22)

*Written and committed **before** the real-data run. Results go in `RESULTS.md`;
nothing in this file is edited after the run.*

## What is being tested

The "Mean Reversion of Residuals" lesson (`education/mean-reversion-of-residuals-notes.md`)
applied to currencies, **gate test first** (lesson slide 28): after the shared
factors are removed, does a currency's stretched residual predict its next-day
residual move in the reverting direction?

This is a different object from the two earlier residual tests in `MD files/`
(`RESIDUAL_REVERSION_FX_TEST.md` = price minus a macro fair value;
`RESIDUAL_REVERSION_MINIMAL_TEST.md` = price minus its own AR(1) forecast). Both of
those are single-instrument. This one is **cross-sectional**: a currency relative to
the common drivers of all eight.

## Universe and data

- **8 currencies:** USD EUR GBP AUD NZD JPY CAD CHF, built from the **7 USD majors
  only**, so no pair is double counted (EURGBP etc. are exact combinations of these).
- `r_c` = daily log return of currency c vs USD (USD = 0). `x_c = r_c − mean of the 8`
  (currency vs equal-weight basket).
- Daily close = last M1 close before 17:00 New York, the same instant for every pair.
  Source: `VolRangeForecaster/data/m1/*.parquet`. 2016-01-04 → 2026-08-20, 2,738 days
  with all 7 pairs present. 35 days where any pair was missing are dropped **for all
  pairs together** (the next return spans the gap, but stays synchronised).

## Method (lesson parameters, fixed, not tuned)

Per day t, using only the 120 returns ending at t:
1. Standardise x in the window; correlation PCA.
2. **K from the noise band:** 500 pure-noise sets (120 × 8, de-meaned across
   currencies and standardised exactly like the real data); a component counts if its
   variance share beats the noise 95th percentile at its rank. K = the **median count
   over in-sample windows only**, then held fixed.
3. Residual = Z − Z·V·Vᵀ (top K removed); residual path = its cumulative sum;
   displacement = z-score of the last point of the path.
4. **Next-day residual, out of window:** `z1 = (x[t+1] − μ)/σ` with μ, σ, V all frozen
   at t; `e1 = (z1 − V Vᵀ z1) / window residual sd`. Because t+1 is never in the fit,
   the "manufactured reversion" trap (slides 25–26) can't make the gate pass.

**Split:** the scored days are split chronologically 50/50. The first half is IS, the
second half is OOS, and the OOS half is the one that counts.

## Pre-registered outcomes

**PASS (go on to phase 2)** requires all four on the stated halves:
1. OOS mean daily cross-sectional IC (corr of −displacement with next-day residual
   across the 8) **> 0 with t ≥ 2.0**.
2. OOS extreme buckets have the reverting sign: mean next-day residual **> 0 for
   z < −1.5 and < 0 for z > +1.5**.
3. OOS low half beats the high half: mean of the two low buckets > mean of the two
   high buckets.
4. IS mean IC has the same (positive) sign.

**FAIL** = anything else, **including** an IS-only pass, a positive IC with t < 2, or
right-signed extremes without a positive IC. A FAIL is reported as a FAIL.

**Disaggregation, one pass only (information, not a second chance):** OOS per-currency
correlation (8 cells) and IC by calendar year. With 8 cells, 1–2 positives at random is
what chance gives. A per-currency "survivor" inside a FAIL is not a pass.

## Secondary readout (information only — not part of the gate)

The lesson's 16-line loop (slide 32) at its own parameters: dead band |z| < 0.2, cap 1.5,
inverse-vol sizing, projection against the K components **plus the basket (ones)
vector** (so Σw = 0 and the book trades only the 7 USD pairs), gross = 1, costs from the
house table `js/perLineStrategy.js` `PAIR_COST_PCT` (half the round trip per unit of
one-way turnover, per USD pair), plus a 2× cost run. It is reported as IS/OOS gross and
net Sharpe. No parameter sweep is run; a sweep would be the slide-43 tuning trap.

## Harness checks run before the real data (`data/synthetic_checks.json`)

- **Null** (iid returns, 2 factors + noise, no reversion): OOS IC −0.010 (t −0.76), FAIL.
  The harness does not invent edge.
- **Positive control** (2 factors + OU residuals, 15-day half life): OOS IC +0.066
  (t 5.29), the buckets step down (+0.165 … −0.158), PASS. The harness can find a real
  effect.
- The neutralised book has Σw ≈ 1e-16 and factor exposure ≈ 1e-17 every day, so the
  projection is exact.

## Known limits (stated up front)

- Costs are the house per-pair estimates, not measured fills. There is no swap/carry in
  the returns (spot only), so any carry P&L of a held position is missing.
- 10.6 years of data, so the OOS half is ~5 years, one sample path, not the lesson's 12
  independent universes.
- The sample is 8 currencies, rank 7 after the basket, so only a few residual
  degrees of freedom remain after removing K factors.

## Code

`scripts/build_daily.py` (stage 1, daily closes) · `scripts/residual_test.py`
(`synthetic` / `real`). This is a Python research throwaway, not a brick, so there is no
`LEGO_MODULES.md` entry unless it graduates.
