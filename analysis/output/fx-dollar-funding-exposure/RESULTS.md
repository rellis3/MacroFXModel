# fx-dollar-funding-exposure — results

Prereg: `forge/FX_DOLLAR_FUNDING_EXPOSURE_PREREG.md` (committed in `7186d20b`, 2026-10-21). Run 2026-10-21, seed 20261021, B = 2000, 1000 label placebos.
Branch `main`. Ledger ids: `fx-dollar-funding-exposure-hit`, `fx-dollar-funding-exposure-follow`.

## Verdict: NULL (hit) · NULL (follow)

Each currency's exposure was the USD share of its country's cross-border bank borrowing (BIS LBS), known two quarters later. The study tested whether, in the 20% of weeks with the biggest VIX rises, higher-USD-share currencies fell harder against the dollar than in other weeks (hit), and whether they kept falling the next week (follow). Neither did.

- **hit**: IC difference −0.005 [−0.053, +0.045]. Halves −0.014 / +0.007, inside the label placebo [−0.046, +0.048], and six currencies flip the sign when left out.
- **follow**: IC −0.002 [−0.038, +0.040], inside the placebo [−0.044, +0.034].

Both CIs lie inside the ±0.10 useful bar, so a useful effect of either kind is ruled out.

## Scored cells

| Cell | Currency-weeks | Estimate (IC) | 95% CI | MDE | Useful bar | Holm p | Verdict |
|---|---|---|---|---|---|---|---|
| hit | 4,675 risk-off (236 weeks) vs the rest | −0.005 | [−0.053, +0.045] | 0.09 | 0.10 | 1.0 | NULL |
| follow | 4,673 | −0.002 | [−0.038, +0.040] | 0.09 | 0.10 | 1.0 | NULL |

The sample is 1,177 weeks (2004-01 → 2026-08), 20 currencies (euro area as one), at least 12 per week. Three bad Yahoo prints (|weekly move| > 25%) were masked.

## Controls

- **Label placebo** (risk-off flags reassigned at random): hit [−0.046, +0.048]; follow [−0.044, +0.034].
- **Leave-one-currency-out**: the hit sign flips without EUR, BRL, CHF, JPY, MXN or TRY. Follow flips without EUR, BRL or MXN. Nothing stable.
- **Risk-on mirror** (bottom 20% of VIX weeks): +0.027. Small and consistent with nothing.

## Deviations from the prereg

None. One implementation note: the bootstrap and placebo compute pooled correlations from per-week sums. This is exact, and an assert checks it reproduces the direct pandas estimate.

## Descriptive (not part of the verdict)

- **Dollar-up weeks** (top 20% of the broad USD move) as the risk-off definition: hit **+0.20**. High-USD-share currencies did relatively *better* when the dollar rose. The USD-share ranking is led by managed, low-volatility currencies (BRL 69% and PHP 68% are exceptions; SGD 57%, TWD 51%, THB 50%, MYR 46%, INR 53%), so in a dollar-up week they move less than free floaters (EUR 17%, SEK 22%, AUD 34%). The share mostly measures *which currencies are managed*, which confounds any funding-risk reading.
- JPY-share hit +0.22. This is tautological: the high-yen-share borrower is Japan, and the yen rallies in risk-off.
- Risk-off week mean demeaned return by USD-share tercile: −0.004% / +0.048% / −0.037%. Flat.
- Latest USD shares (2026-Q1 applied in Q4): BRL 69, PHP 68, CAD 58, SGD 57, IDR 55, INR 53, TW 51, MXN 50, THB 50, KRW 50, MYR 46, TRY 42, CHF 39, GBP 37, JPY 37, NOK 35, AUD 34, NZD 28, SEK 22, EUR 17.

## What this changes

- No page shows USD-funding exposure as a risk-off ranking. Bank-credit pages keep borrowing shares as description only.
- If this is reopened, exposure must be scaled by size (USD debt ÷ GDP or ÷ FX reserves) and the design must control for each currency's own beta to the dollar, because the raw share mainly separates managed from floating currencies. That needs its own prereg.
