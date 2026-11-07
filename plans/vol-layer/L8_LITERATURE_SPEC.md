# Layer 8: Feedback. Literature spec

Published sources and the trader's words only; no repository file or result read. **No winner declared on our data.**

Tags: [V] verified by search this session, abstract or snippet level unless marked "read". [V-sec] seen only via another source. [M] from memory.

C.OG: "use its errors as a feedback loop". This can mean three separate things, each tested separately:
- **A. Correct the forecast**: errors change the next lines.
- **B. Signal**: the error today says something about price from here.
- **C. Governance**: errors say the forecast or a strategy has broken.

Base error: e_t = log(realised range or RV / forecast). Intraday: VS_{t,τ} = log(RV_{0→τ} / (F_t·w_τ)), where w_τ is the expected share of daily variance by minute τ, built from past data only.

## A. Correcting the forecast

**Adaptive conformal inference** (Gibbs & Candès 2021) [V]
- α_{t+1} = α_t + γ(α − err_t), err_t = 1 if the outcome fell outside the band. Width comes from the 1−α_t quantile of past scores, e.g. |e_t|.
- Wraps any forecaster.
- **DtACI** (Gibbs & Candès 2024) [V]: tunes γ online; tested on stock market volatility.
- **AgACI** (Zaffran et al. 2022) [V]: aggregates over γ with online experts; electricity prices.
- **Conformal PID** (Angelopoulos, Candès, Tibshirani 2023) [V]: q_{t+1} = q_t + η(err_t − α) + integrator + scorecaster. Handles seasonality and trend; datasets include market returns.

*Evidence*: crypto VaR, where FACI and SF-OGD did well and GARCH struggled (Fantazzini 2024) [V]. DtACI gave narrower 95% bands that widened in COVID [V]. **I found no study on intraday FX or vol-scaled lines.**

**Score-driven / GAS** (Creal, Koopman, Lucas 2013) [V]
- f_{t+1} = ω + A·S_t∇_t + B·f_t. The scaled score is a forecast error weighted by the assumed density.
- Encompasses GARCH. With a Student-t density the score is bounded, so one spike moves the forecast less (Harvey 2013) [M for the mechanism].
- Evidence: adding realised measures beat benchmarks for joint VaR/ES across indices (Lazar & Xue) [V]. Equity-heavy.

**HARQ** (Bollerslev, Patton, Quaedvlieg 2016) [V]
- HAR with persistence depending on estimated measurement-error variance. Forecasts respond more when the error is low.
- Beat HAR in most cases: S&P and Dow stocks, 1997-2013.
- Name trap: its "errors" are **measurement** errors, not forecast errors.

## B. Vol surprise as a return signal

**No paper I found directly tests realised-minus-forecast volatility as a predictor of next-period reversal or continuation in FX, gold or index futures.** Everything below is adjacent.

| Evidence | Finding | Leans |
|---|---|---|
| Bianco & Renò, S&P futures 1993-2001, 4-min [V, read] | Unexpected vol = residual of log RV on 3 lags. Positively linked to same-day variance ratio (≈0.59, q=1); predictable vol negatively (≈−0.17). Authors say no economic model explains it | Continuation, same day |
| Nagel 2012 [V] | VIX forecasts reversal strategy returns; read as liquidity withdrawal. Stocks, implied level | Reversal |
| Della Corte & Kosowski [V, snippet] | Overnight-intraday reversal across asset classes; much larger in index futures after high VIX | Reversal |
| Gao et al. 2018 [V-sec]; Baltussen et al. 2021 [V] | Earlier-day return predicts last half hour, across 60+ futures; reverts over following days; linked to negative gamma | Continuation, then reversal |
| Intraday option paper (Notre Dame) [V, snippet] | Reversal generally, but large IV shocks followed by continuation | Both |
| Heston, Korajczyk, Sadka [V] | Volatility patterns do not explain return periodicity; short reversals reflect bid-ask bounce | Caution |
| French, Schwert, Stambaugh 1987 [M] | Unexpected vol has a negative same-period relation with return | Contemporaneous only |

**Where it is mixed**
- Level and surprise may have opposite signs. Bianco & Renò find exactly this split, while the reversal papers use vol **level**. "High vol → reversal" and "surprise vol → continuation" can both be true, so any test must separate them.
- **Realised below forecast has almost no evidence** beyond the LeBaron link, so treat it as a separate question, not as the mirror of above-forecast.
- Sizing: Cederburg et al. 2020 [V]: managed beat unmanaged in 53 of 103 equity strategies, 8 significantly; weaker out of sample.

## C. Governance

**CUSUM** (Page 1954) [M]: S⁺_t = max(0, S⁺_{t−1} + z_t − k), alarm at S⁺ > h. z_t = e_t standardised, or a PIT-based score.

**Page-Hinkley** (Hinkley 1971) [M]: m_t = Σ(x_i − x̄_i − δ); alarm when m_t − min m_i > h. Tuned on average run length (ARL).

*Evidence*:
- CUSUM of quasi-Fisher scores for explosive volatility (arXiv 2404.17885) [V].
- CUSUM on realised vol gains power over returns, and post-break estimation beat ignoring breaks [V].
- Giacomini & Rossi 2010 fluctuation test for relative performance through time [V].

**SPRT** (Wald 1945) [M]: Λ_n = Σ log(f₁/f₀). Stop for H₁ at log((1−β)/α), for H₀ at log(β/(1−α)). As a kill switch: H₀ = backtest edge, H₁ = zero edge.

**E-process / e-detector** (Shin, Ramdas, Rinaldo) [V]: E_t = Π(1 + λ_t(x_t − μ₀)), reject at E ≥ 1/α by Ville's inequality. Valid at any stopping time, so it suits a monitor that is looked at daily. The e-detector gives CUSUM-style change detection on this basis.

**I found no peer-reviewed study applying SPRT or Page-Hinkley to live strategy failure.** Forum and video material only [V]. A 2026 study of 1,726 strategies [V, snippet] attributes much post-launch decay to regime and crowding, so a kill signal needs a regime-adjusted benchmark.

## Isolation tests

**T1 Correction (A).** Pinball and Winkler loss for p50/p75/p90 against static lines and against plain rolling recalibration. Kupiec and Christoffersen coverage by instrument, session and event day. QLIKE and MSE on variance forecasts (only these two of nine are robust to proxy noise: Patton 2011 [V]). Diebold-Mariano plus the fluctuation test. **Coverage alone is no evidence, see below.**

**T2 Signal (B).** Fix τ grid (e.g. 60/120/240 min into the London day).
- Variable: sign(r_{0→τ}) × r_{τ→τ+h}, in σ units. Buckets of VS_{t,τ}.
- Separate surprise from level: regress on both, as in Bianco & Renò. Surprise must add beyond RV level.
- Benchmarks: zero; VS shuffled within instrument and hour; mirror test.
- At levels: rerun the Layer 2 symmetric race (50% benchmark) with surprise known before the touch, on frozen lines.
- Report distributions, gross and net of real spread. Split above/below forecast and event/non-event days.

**T3 Detectors (C).** ARL₀ on simulated no-break paths and on a bootstrap of own errors; detection delay on injected scale breaks (±20%, ±50%). Benchmark: rolling recalibration with no detector. Does an alarm reduce subsequent loss?

**T4 Kill switch (C).** On synthetic strategies with known edge: false-kill rate over a year, and days to kill after the edge is removed. Benchmark: fixed drawdown stop and never killing. Pre-register thresholds before any real strategy sees them.

Pre-register the grid, control FDR, cluster by date, hold out a final block.

## Pitfalls

- **ACI's guarantee is close to free.** Long-run coverage holds irrespective of the data-generating process [V], so a useless forecaster also hits it by widening and narrowing. Judge width and conditional coverage. Marginal is not conditional.
- **Mechanical selection.** A positive surprise makes a touch more likely by construction, so "surprise at touch" differs from the unconditional population. Report the share of days excluded per filter.
- **One-sided intraday information.** A running range is a lower bound on the final range. Above-forecast can be known early; below-forecast is only known as time passes, and tests of it depend on τ.
- **Seasonal lookahead.** w_τ fitted on the full sample leaks. US releases move on the London clock with DST.
- **Event contamination.** Without an event split, B may only test the calendar.
- **Measurement noise.** VS is noisiest early in the day, when it would be most useful.
- **Feedback moves the population.** Adapted lines change which touches exist. Evaluate B on frozen lines, and test A and B apart before any combination.
- **Multiplicity.** 34 instruments with common macro shocks: state the portfolio-level false alarm rate.
- **Monitor overfitting.** γ, k, h, δ are parameters. Fix them from simulation, not best P&L.
- **Autocorrelated errors** break SPRT's i.i.d. assumption and shorten true ARL. Use blocked calibration or e-processes.

## Sources

ACI arxiv.org/abs/2106.00170 · DtACI jmlr.org/papers/v25/22-1218.html · PID arxiv.org/abs/2307.16895 · HARQ econpapers.repec.org/RePEc:eee:econom:v:192:y:2016:i:1:p:1-18 · Bianco-Renò arxiv.org/html/physics/0610023v1 · Nagel nber.org/papers/w17653 · e-detector arxiv.org/abs/2203.03532
