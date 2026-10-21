# Rates → asset hypothesis matrix (deliverable 2)

Written 2026-10-21, **before** the yield-predictive-ladder results were read. Each row is one rate variable × target,
with:

- the transmission mechanism;
- the expected sign (asset return per rate *rise*);
- the horizon the mechanism implies;
- the main alternative explanations;
- when the link should weaken or flip;
- what the ledger already says.

Signs are for a **rise** in the rate variable.

**Evidence labels:**

- **D** = descriptive (same bar or same day)
- **P** = predictive (forward, out of sample)
- **C** = causal
- **T** = tradable after costs

## EURUSD

| Rate variable | Mechanism | Expected sign | Horizon implied | Alternative explanations | Weakens / flips when | Ledger so far |
|---|---|---|---|---|---|---|
| US 2y (expected Fed path) | Higher expected US policy rate raises the dollar's relative return (uncovered interest parity fails in the short run: the higher yielder appreciates) | − | Same day (repricing is instant); weeks–months for carry/flow | Common shock (a US data surprise moves both); risk-off flight to USD; Fed reaction to a global shock | ECB repricing at the same time (the differential, not the level, is what matters); US-driven risk-off | **D strong:** −0.30 to −0.46 same hour (`us-leg-same-day-link`). **P null:** daily and hourly (`yields-to-fx-direction`, `rates-spread-asset-lead`); 2y momentum 5–20 days null (`policy-direction-at-lines`) |
| US−DE 2y differential | Relative policy expectations: the textbook FX driver | − | Same day; 1–3 months in the literature (rate differentials and FX trend) | Bund flight-to-quality moves DE2 for non-policy reasons; the euro side partly reflects euro-area fragmentation | Euro-crisis years (DE yields fall on safety, the euro also falls: the sign flips); when both central banks move together | **D:** same hour −0.30 every year (DE−US 10y, `spread-leads-fx-hours`). **P null:** hours (`spread-leads-fx-hours`), daily episodes (`rates-spread-asset-lead`); 2Y spread z-reversion sleeve demoted after the GS2 lookahead (`yield-spread-sleeve`, `ys-long-confirm`) |
| US−DE 10y differential | Relative long-run return; real-money flows | − | Days–weeks | Term-premium differences, QE/QT asymmetry | ECB/Fed balance-sheet divergence | Same as above (`multi-spread-sleeve` demoted; `nonus-yield-gap-direction` null) |
| US 10y real yield | Real return on dollar assets; reserve-asset flows | − | Days–weeks | Real yield up on growth optimism can lift risk currencies (EUR) | Growth-led rises (risk-on) vs policy-led rises | **D:** "real up and dollar the wrong way" breaks resolve 50/50 (`broken-link-resolution`). **P:** not tested as a decomposed component until this study |
| US 10y breakeven | Inflation compensation: ambiguous (higher US inflation erodes the dollar in real terms, but implies a more hawkish Fed) | ? (ambiguous) | Days | Oil-driven (oil also hits the euro-area terms of trade) | Oil-shock regimes | **P:** not tested in this form |
| US 10y term premium | Compensation for duration risk; global risk appetite | ? | Weeks | Fiscal/supply news; QT | — | **P:** not tested |
| US slope (10y−2y) | Growth expectations vs policy | ? | Weeks–months | Bear-steepening (supply) vs bull-steepening (cuts) have opposite FX meanings | — | **P null:** daily US spreads incl. slope (`cog-spread-direction`); inversion (`curve-inversion`) |

## Nasdaq-100

| Rate variable | Mechanism | Expected sign | Horizon implied | Alternative explanations | Weakens / flips when | Ledger so far |
|---|---|---|---|---|---|---|
| US 10y real yield | Discount rate on long-duration growth earnings | − | Same day; weeks for valuation | Growth optimism lifts both real yields and earnings | Growth-led real-yield rises (2025: rates and stocks up together) | **D:** the stock–rate sign flipped from 2025 (+) to 2026 (−) (`stir-curve-map`). **P:** decomposed real yield not tested forward until this study |
| US 10y breakeven | Reflation (nominal growth) vs an inflation scare | + in reflation, − in an inflation scare | Same day | Oil | High-inflation regimes (2022: BE up = Fed hikes = equities down) | **D:** equities couple positively to breakevens same day (+0.28 to +0.35, `yields-to-fx-direction`). **P null** for the nominal 10y |
| US 2y (expected Fed path) | Policy tightening raises funding costs and the discount rate | − | Same day–weeks | Growth news | Good-news-is-good-news regimes | **D:** −0.13 to −0.36 intraday per leg, sign regime-dependent. **P null** at 1 min–1 month (the whole STIR→NQ book: `rate-diff-nq-leadlag`, `stir-wide-scan`, `stir-composite-nq`, `rate-curve-structure`, `cog-*`, `spread-episodes-nq`) |
| US 10y term premium | Duration risk spills into the equity risk premium | − | Weeks | Fiscal supply | — | **P:** not tested |
| US slope (10y−2y) | Recession signal (inversion), or easing (bull steepening) | ? | Months–quarters | Different shapes of steepening | — | **P null:** inversion → forward Nasdaq does not separate from a matched control over 50 years (`curve-inversion`) |

## What this matrix implies for the ladder test (prior expectation)

- Every same-day mechanism above is supported by the ledger. Every **forward** version tested so far is null.
- What remains is **D-only**: the decomposition (real vs breakeven vs term premium), a nested model with controls, and
  regime interactions (real-yield trend, hawkish repricing, risk-off).
- The expectation is null. The point of the run is to close the decomposed question with a powered, costed answer,
  or find the exception.
