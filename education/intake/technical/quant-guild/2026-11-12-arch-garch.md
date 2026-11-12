# Master Volatility with ARCH & GARCH Models

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci (tag every claim) |
| URL | https://www.youtube.com/watch?v=iImtlBRcczA |
| ReelScribe id | j573kjymkw6mhj9qdffby3e48d8j2edy · 48:04 |
| Notebook | `2025 Video Lectures/47. Master Volatility with ARCH & GARCH Models/arch_garch.ipynb` (+ `ib_vol.py`) |
| Recorded | 2025 (notebook copyright); exact date unknown |
| Processed | 2026-11-12 |

## Lesson
Volatility is latent. It is proxied backward by realised vol (the rolling std, which depends on the window) and
forward by implied vol (inverted Black-Scholes). A volatility model earns its place by reproducing the stylised facts in
one parsimonious form: fat tails, clustering, mean reversion, the leverage effect and (debated) long memory. ARCH(q)
makes the conditional variance depend on past squared shocks. A mixture of Gaussians with time-varying variance is
fat-tailed, so ARCH produces excess kurtosis. GARCH(1,1) is ARCH(∞) in two parameters. On AAPL 2023–25 he scores
EWMA, ARCH(1) and GARCH(1,1) out of sample (R² 5% / ~5% / 8%). He says a low R² is expected on daily squared returns,
and intraday RV lifts it to "40–60%" in the literature. The application is VaR: a constant-σ VaR breaches "40%" of the
time against 5% nominal, GARCH VaR 9.74%.

## Approach
- **Question**: forecast realised (not implied) variance one day ahead; benchmark is EWMA.
- **Model choice**: GARCH because it captures the stylised facts parsimoniously ("parsimonious? efficient?
  effective?" again), not because it fits best. He checks this analytically (conditional variance, kurtosis > 3).
- **Validation**: 70/30 chronological split for EWMA; train window ∈ {50…750} for ARCH/GARCH; OOS RMSE and an OLS R²
  of realised on forecast. He admits "a slight bias, even out of sample, through grid search".
- **Statistics**: RMSE, R² (Mincer-Zarnowitz style), VaR exceedance rate. He names QLIKE as a later topic.
- **Failure modes**: the parametric-normal VaR "your finance professor" teaches; "x-sigma events" in the news measured
  against a bad benchmark.

## What the code actually does (the main value of this note)
1. **ARCH/GARCH parameters and the train window are chosen by minimising OOS RMSE** (the grid loop scores
   `realized_var[train_end:]`). The test set is the selection set, so the reported "out-of-sample" RMSE and R² are
   in-sample to the choice. This is more than his "slight bias" remark admits.
2. **The benchmark is handicapped.** EWMA λ is searched over 0.01–0.90 on train only, which excludes RiskMetrics 0.94
   and 0.97. The challengers are tuned on test, the benchmark on train with a grid that misses its standard value.
3. **Fitting is grid search on RMSE, not maximum likelihood.** Coarse grids (5 values each for ω, α, β). `var[0]` is
   initialised with the full-sample variance, a small leak.
4. **Target = one day's squared return**, the noisiest proxy. Scored by RMSE and an OLS R², which forgives any affine
   bias. QLIKE or MSE on a 5-min RV target (Patton 2011) is the robust choice.
5. **The naive VaR has a units bug.** `sigma_naive = returns.std()` is already daily, then `/ np.sqrt(252)` "convert
   annual to daily if needed". The naive threshold is ~16× too small, so P(r < −1.645σ/15.9) ≈ 45%. The "40%
   exceedances" comes from the bug, not from homoskedasticity. GARCH's 9.74% vs 5% is still a failed Kupiec test,
   and exceedances are counted over the whole sample, including the training window.
6. **The "volatility risk premium" regression regresses IV on its own future 20-day mean** (`ivol_fwd =
   implied_vol.rolling(n).mean().shift(-n)`, n = 20, not the "5-day" said in the video). A slope < 1 there is IV mean
   reversion, not "volatility realizes lower than implied". The low/high regime split is cut on the regressor at the
   fitted line's crossing with y = x, so it flattens both slopes by construction. The VRP itself is real (our
   `iv-from-settlements` work, `forge/VRP_FORECAST_PREREG.md`), but this chart doesn't show it.

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | GARCH(1,1) captures clustering, fat tails, mean reversion in 2 params (QG) | mechanism | ON FILE: `plans/STYLIZED_FACTS.md` median α+β 0.968, half-life 25d (7.5–391) |
| 2 | GARCH beats EWMA out of sample (QG) | method | PARTLY: our bench (`js/volForecastBench.js`, EWMA 0.90/0.94, GARCH(1,1), OOS QLIKE) and the layer-3 HAR results; fitted GARCH vs chosen σ on 5-min RV is `vol-layer-l1-sigma` (CLAIMED, not run) |
| 3 | Intraday RV makes vol 40–60% explainable (QG) | method | ALREADY DO: 5-min M1 RV target (`vol-layer-l1-sigma`, `vol-layer-rv5-increment` +1.2%, HAR on 5-min RV in `MD files/LEGO_MODULES.md`) |
| 4 | Leverage effect: vol rises more after falls (QG) | mechanism | PARTLY: "FX lines ~7% too narrow after a 20-day S&P fall"; stress-count shadow. Asymmetric σ (GJR/EGARCH) only as bench entrants (`ANALYTICS_ENGINE_DESIGN.md`) |
| 5 | IV realises lower than implied (VRP) (QG) | mechanism | ON FILE (by our own method): `iv-from-settlements`, VRP prereg; his chart doesn't test it (code note 6) |
| 6 | GARCH VaR fixes exceedances (40% → 9.74%) (QG) | method | Weakened: the 40% is a bug (note 5); 9.74% still fails. Our analogue: p75/p90 exceedance 25.6% / 10.4% and miss persistence (`vol-layer-deep/feedback`) |

## What we could learn
- **Robust loss on a good proxy.** ALREADY DO: QLIKE + 5-min RV (`volForecastBench.js`, vol-layer). His RMSE-on-r² is
  weaker. Confirms our choice.
- **Tune only on training data, and give the benchmark the same tuning and a sensible grid.** ALREADY DO: lockbox and
  "training years only for design choices" (`lookahead-and-oos.md`), `forecast-pick` refits every candidate per fold
  by the same method. His notebook is a clear negative example and worth one line in the playbook's failure modes.
- **Band/VaR backtests need rate and clustering.** ALREADY DO: exceedance rate per class plus miss autocorrelation
  (+0.50 plain σ, +0.25 chosen) and a CUSUM in `vol-layer-deep/feedback`.
- **Known-answer check would have caught the VaR bug** (naive VaR on iid normal data must breach 5%). REPEAT of #1.
- **Asymmetry is a stylised fact we model only through stress counts**, not a leverage term. Not a lesson; see idea.

## Research ideas
- Fitted GARCH(1,1) / GJR on the 5-min RV target vs the chosen σ: **not carded, already `vol-layer-l1-sigma` (CLAIMED)**.
  Suggested additions for that prereg: fit by MLE on the fit block only, include EWMA at 0.94/0.97 as a benchmark, add
  a GJR arm (leverage), and score with QLIKE (not R²).
- VaR-style exceedance clustering: not carded, ON FILE (`vol-layer-deep/feedback`, `jump-next-day-miss`).

## Quotes
- "Volatility is not constant… a very very important thing to note about this latent process, this unobservable process."
- "There's so many ways to construct an inappropriate benchmark."
- "An arch infinity process can be represented as a more parsimonious garch one process."
- "I could overfit the weighted moving average and maybe make it perform better."
