# US-EXTRAS-CONFIRM: do the VIX-curve / breadth terms add to IV÷σ on US indices? (independent years)

*Pre-registered 2026-10-05, before any result was computed. This is a confirmation of a
POST-HOC observation in `forge/COMBINED_RANGE_PREREG.md` (ablation): on US indices,
adding vix_inv / front_dear / front_calm / all_down / nq_dw on top of IV÷σ lowered test
pinball from 0.923 to 0.900. That observation came from looking at 2016–2026 results, so it
is confirmed here only on years never used by any test in this programme.*

## Data: independent of everything run so far

- **Window:** 2011-01-03 → 2015-12-31 (VIX9D starts 2011; 2016+ excluded because it was
  seen).
- **Instruments:** SPX (^GSPC), NQ (^NDX), DOW (^DJI), US2000 (^RUT). Yahoo daily OHLC (cash
  session) is saved in `analysis/surfaces/yahoo/`.
- **Breadth "all six down":** ^GSPC, ^NDX, ^DJI, ^RUT, ^GDAXI, ^FTSE, all closing down on
  the prior day.
- **Implied vol:** VIX close (VXN for NQ). Curve features use VIX3M and VIX9D, from
  `analysis/surfaces/cboe/`.
- **σ_t:** yang-zhang 10 (the production estimator for these four) on the daily bars, from
  bars dated strictly before D.
- **Realised:** that day's H-L ÷ open. Every input is dated strictly before D.

The bar basis (US cash session) differs from the 2016–2026 London sessions, which is why
nothing is carried over. Both arms below are fitted fresh, inside this window.

## Arms (identical ridge method to COMBINED-RANGE: λ = 1, standardised, pooled, centred per instrument)

- **A, IV only.** Feature `iv_sig` = log(IV ÷ σ_t). (The form now live in the IV-adjusted
  export.)
- **B, IV + extras.** `iv_sig` plus `vix_inv`, `front_dear`, `front_calm`, `all_down`,
  `nq_dw`, with the same definitions and frozen cut-offs as COMBINED-RANGE.

Widths are refit per instrument on each arm's adjusted σ.

**Split:** by date. Train = first 60% (≈ 2011 → 2013-12), test = last 40% (≈ 2014–2015).

## Pass rule

**Primary.** Test H-L p50 + p75 pinball, B ÷ A per instrument. CONFIRMED if **both** hold:
1. the median ratio across the 4 indices is **< 0.99**;
2. B beats A on **≥ 3 of 4**.

The threshold is 0.99 rather than 0.98 because this tests an *increment* over IV÷σ. The
post-hoc size was about 2.5%.

**Secondary.**
- At least 4 of the 5 extras keep the sign of their ledger entry in the joint fit.
- p75 exceedance on `vix_inv` and `front_dear` / `front_calm` days is closer to 25% in B.

**Decision.**
- CONFIRMED: add the extras to the IV-adjusted export for SPX500 / US30 / US2000 / NQ only,
  refitted on live-type inputs.
- NOT CONFIRMED: the export stays IV-only, and the observation is recorded as not
  replicating.

Script: `forge/run_us_extras_confirm.py`. Output: `analysis/output/us_extras_confirm/RESULTS.md`.

---

## Results (2026-10-05, run after the pre-registration commit e19b8dec)

Full tables: `analysis/output/us_extras_confirm/RESULTS.md`. 1,256 sessions per index
(2011-01-05 → 2015-12-31); train before 2014-01-03.

| | |
|---|---|
| test pinball (IV + extras) ÷ (IV only), median | **0.957** |
| better on | **3/4**: SPX 0.939, NQ 0.945, DOW 0.968; US2000 1.001 (flat) |
| extras with the ledger's sign | **5/5** |
| p75 exceedance on VIX-inverted days, A → B | 38.8% → 19.1% |
| front dear / calm days, A → B | 38.3% → 30.3% / 18.3% → 29.6% |
| **verdict** | **CONFIRMED** |

On untouched years the increment is larger than the post-hoc observation (4.4% vs 2.5%).
US2000 does not benefit in either window.

**Live-type re-fit** (`analysis/output/iv_adjusted/CALIBRATION.md`, `us_extras`): joint vs
IV-only median 0.965, 3/4 better, US2000 1.014 again.

**Decision per the pre-registration:** the extras are added to the IV-adjusted export for
NQ / SPX500 / US30 / US2000. US2000 is kept because the rule names all four, although it
shows no gain. Live falls back to IV-only whenever a curve or breadth input is missing.
