# CROSS-IV: does implied vol built from the two USD legs improve the crosses' daily lines?

*Pre-registered 2026-10-05, before any result was computed. Follows COMBINED-RANGE
(`forge/COMBINED_RANGE_PREREG.md`, PASS). There, own implied vol ÷ own σ did most of the
work for FX, but crosses have no options history here. Research only.*

## The question

For a cross X/Y, build an implied vol from the two USD legs' CME CVOL and their trailing
realised correlation. Does it improve the cross's daily H-L lines the way own-IV improved
the majors?

## Construction (all causal: only data dated strictly before session D)

- **Legs.** Each currency is quoted against USD:
  - EUR, GBP, AUD as XXXUSD, with sign s = +1;
  - JPY, CAD, CHF as USDXXX, with s = −1.
  - Then log(X/Y) = s_X·log(q_X) − s_Y·log(q_Y).
- **Implied cross variance** (annualised, CVOL %):
  `σ²_XY = σ_X² + σ_Y² − 2·s_X·s_Y·ρ·σ_X·σ_Y`
  - σ_X, σ_Y are the legs' CVOL at the D−1 close.
  - ρ = correlation of the two quoted legs' daily `london22` log returns over the 60
    sessions ending D−1.
- **Feature.** `iv_sig` = log(σ_XY ÷ the cross's own production σ_t, annualised), the same
  feature as COMBINED-RANGE.

## Universe

The 15 ladder crosses whose legs both have CVOL: AUDCAD, AUDCHF, AUDJPY, CADCHF, CADJPY,
CHFJPY, EURAUD, EURCAD, EURCHF, EURGBP, EURJPY, GBPAUD, GBPCAD, GBPCHF, GBPJPY.
- **Excluded:** every NZD pair (no NZD implied vol locally).
- **Window:** where both legs have CVOL (AUD/CAD/CHF from 2018-10).

## Arms

- **A, ladder alone.** H-L quantile = width × σ_t; widths refit on train.
- **B, cross IV.** σ_adj = σ_t × exp(β·z).
  - z = `iv_sig`, centred on each cross's own train mean and scaled by the pooled train SD.
  - β comes from a ridge regression (λ = 1) of log(H-L ÷ σ_t) on z, **pooled across the
    15 crosses, train only.** Widths are refit on σ_adj.
  - This is the single-feature form, because the ablation in COMBINED-RANGE found the
    market-wide features add nothing on FX.

## Split

By date: train = first 60% of the crosses' pooled dates, test = last 40%.

## Pass rule

**Primary.** Test H-L p50 + p75 pinball loss, B ÷ A per cross. PASS if **both** hold:
1. the median ratio is **< 0.98**;
2. B beats A on **≥ 60%** of crosses.

**Secondary** (reported).
- H-L p75 exceedance on the low / high `iv_sig` tercile days (edges from train), A vs B.
  B should be closer to 25% on both. If the primary passes and B is further away on both,
  the verdict is MIXED.
- **Transfer check:** the same score using β frozen from the COMBINED-RANGE FX+gold fit,
  for information only.
- **Sanity check:** the correlation between the leg-built implied vol and the cross's
  realised 20-session vol, reported so a construction error would show.

**Decision.** PASS adds the crosses to the daily IV-adjusted export, with their own β.
FAIL leaves the crosses on the plain ladder in that export.

Script: `forge/run_cross_iv.py`. Output: `analysis/output/cross_iv/RESULTS.md`.

---

## Results (2026-10-05, run after the pre-registration commit f96cda2b)

Full tables: `analysis/output/cross_iv/RESULTS.md`. 15 crosses; EURGBP/EURJPY/GBPJPY from
2016-11, the rest from 2018-10. Train/test split: 2023-05-02.

| | |
|---|---|
| test pinball B ÷ A, median | **0.965** |
| B better on | **15/15** crosses |
| p75 exceedance on low leg-IV÷σ days, A → B | 15.8% → 22.8% |
| p75 exceedance on high leg-IV÷σ days, A → B | 31.9% → 23.3% |
| transfer (majors' elasticity 0.786, frozen) | median 0.969, 15/15 better |
| elasticity fitted on crosses | 0.591 |
| corr(leg-built IV, the cross's next-20 realised vol) | 0.32 (AUDCHF) to 0.61 (EURGBP) |
| **verdict** | **PASS** |

**Reading.** Implied vol built from the two USD legs does for the crosses what own IV did for
the majors, at a slightly smaller size (3.5% vs 6%). That is expected, because the
realised correlation adds estimation noise. The majors' elasticity transfers almost
unchanged, so one IV-adjustment form serves all non-NZD FX.

**Decision:** the crosses join the daily IV-adjusted export with their own fitted elasticity
(0.591). The NZD pairs stay on the plain ladder (no NZD implied vol).
