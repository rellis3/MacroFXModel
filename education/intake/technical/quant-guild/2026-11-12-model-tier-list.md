# The ULTIMATE Quant Model Tier List

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci (tag every claim) |
| URL | https://www.youtube.com/watch?v=HURDCdJNsgA |
| ReelScribe id | j5765tapa94ekn8z87veq5y7rs8hzb9q · 19 min (1,138 s) |
| Recorded | unknown |
| Processed | 2026-11-12 |

## Lesson
QG ranks 16 model families by how useful they are in quant finance, not by how sophisticated they are. The ranking
rewards three things: a model that captures a real, stable feature of markets (vol clustering, state dependence), a
model you can read (loadings, coefficients), and a model that does a job nobody else can (backing implied vol out of
Black-Scholes). It punishes models whose states or outputs are unstable over time (HMM), models people use for the
wrong job (Kalman filters and ARIMA used as forecasters), and pure academic machinery (trees). The punchline is the
midwit meme: beginners and experts both end up at linear regression, and "people get ripped off of a 0.02 R squared
from inside the black box".

### The full list, with his reason

| Tier | Model | His reason (QG) |
|---|---|---|
| **S** | Markov chains | Graduates you from IID to state-dependent probability; loan default/delinquency modelling, regime/state classification; "the gateway to more intricate probability-based models" |
| **S** | Bachelier model | Brownian motion for option pricing in 1900; huge downstream influence; "we even implemented it when oil prices went negative" |
| **S** | Black-Scholes | Not judged on being "right": the pricing functional leaves out only vol, so you can back out implied vol, which is why a vol surface is observable at all; plus the hedge-portfolio argument |
| **S** | Stochastic vol (Heston, SABR; local vol as its deterministic cousin) | Mean-reverting vol process lets the model fit skew/smile and calibrate to a surface, then extrapolate prices |
| **S** | Transformer | Practical: it changed how research, code and learning are done; best use is "to learn and discover on your own". Also: it's why you can "overfit and lose money with that back test" |
| **S** | Linear regression (multivariate, factor models, time-series, pooled, Fama-MacBeth) | Where good researchers end up; a small R² is valuable; black boxes are oversold |
| **A** | ARCH / GARCH | First to capture vol clustering (conditional heteroskedasticity), which is empirical; not S because of its "practical implications in practice" (said, not explained) |
| **A** | PCA | Finds principal directions of risk (level/slope/curvature in rates; the market factor in equities); great for information discovery; not S because latent dimensions are noisy and may need ICA etc. "If you can mitigate the noise, it is an incredible signal" |
| **B** | AR / MA / ARMA / ARIMA | Mostly produce Medium articles claiming 99% accuracy from people who don't know what a unit root is; "contribute to a lack of understanding rather than your bottom line" |
| **B** | Kalman filter | Good for **state filtering** (he used it at Bloomberg to price illiquid bonds off correlated peers), not for forecasting: "Pricing and forecasting are two different ball games" |
| **B** | Autoencoders | Non-linear PCA; may find richer latent states but lose the loadings, so lose interpretability; "PCA is far more interpretable" |
| **C** | Hidden Markov models | Regimes are a sound idea but HMMs don't solve outlier-vs-new-regime or adaptation speed; states aren't stable over time; "usually just Russian propaganda"; need economic justification for why the states exist. "Locally useful" |
| **C** | VAEs / GANs | Useful for generation (he built arbitrage-free synthetic vol surfaces with them), superseded by newer architectures |
| **D** | Binomial / trinomial trees | Good for learning total expectation and risk-neutral pricing; in practice you discretise a continuous-time model instead |
| **D** | Nelson-Siegel | Central banks use and publish it, but "nobody cares" about fixed income. Ranked on audience interest, not on use (his own admission) |

Not ranked: random forests, gradient boosting, LSTMs, logistic regression, cointegration, HAR. The list mixes pricing
models (judged on pricing) with prediction models (judged on alpha), so the tiers are not one scale.

## Approach
- **Question**: "how useful is this model for the job it gets used for?" He separates three jobs, pricing, state filtering and forecasting, and marks a model down when it's used for the wrong one (Kalman, ARIMA).
- **Model choice**: simple, interpretable and grounded in a stylised fact beats complex. Interpretability is the tie-break (PCA over autoencoders).
- **Evidence**: a model earns its place by capturing an empirical regularity (vol clustering) or by doing something only it can do (implied vol inversion). Accuracy claims that look too good ("99%") mean a non-stationarity/unit-root mistake.
- **Kill rule**: states or relationships that don't hold over time (HMM); latent factors too noisy to use (raw PCA); no economic reason for the structure.
- **Statistics**: low R² is normal and sellable; doesn't discuss validation, costs or multiple testing in this video.
- **Failure modes**: unit roots (ARIMA on prices), regime flip-flop and adaptation speed, overfit backtests traded live, black-box returns.

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | "It just goes back to linear regression at the end of the day" (QG) | method | PARTLY: `extreme-in-probability` count table reached 96%/95% of a gradient-boosted model and was kept; `meta-label-proper` forest no better than logistic (both failed sanity); ridge ladders `yield-ladder-eurusd/-nq` shrank to the intercept. No rule makes a linear arm compulsory |
| 2 | "People get ripped off of a 0.02 R squared that's from inside the black box" (QG) | method | ALREADY DO: residual IC bar 0.03 with MDE (`residual-pca-wide10`); small effects judged by power, not by size |
| 3 | HMM states aren't stable over time; need economic justification; outlier vs new regime (QG) | mechanism | ON FILE: `gr-hmm-trend-direction` NULL (label describes the last fortnight, no next-day call); memory: `hmm.js` states are split by return variance, "RANGE" = quiet, not directionless. Stability of the labels themselves: UNTESTED |
| 4 | Kalman filters are for state filtering, not forecasting (QG) | method | PARTLY: Kalman used as a price-only anchor in `analysis/residual_reversion_fx.mjs` and a beta in `bot/modules/beta_estimator.py`; neither banked as a forecast |
| 5 | GARCH captures vol clustering (A tier) (QG) | mechanism | PARTLY: clustering captured by EWMA / HAR / persistence; `forecast-pick` chose persistence+IV; `iv-from-settlements` HAR+IV beats HAR 7/7. GARCH(1,1) head-to-head is in CLAIMED row `vol-layer-l1-sigma` |
| 6 | PCA latent dims are noisy; mitigate the noise first (QG) | method | ALREADY DO: K by noise-band rule in the residual-PCA family (`forge/RESIDUAL_PCA_FAMILY_PREREG.md`); `random-matrix-theory` lesson. Loading stability over time: UNTESTED |
| 7 | ARIMA "99% accuracy" articles = unit-root ignorance (QG) | method | ALREADY DO: returns not price levels; data-rules item 10 (a strong result gets checked before belief) |
| 8 | Nelson-Siegel is D tier because nobody cares (QG) | opinion | DISAGREE for us: a macro FX desk lives on curve shape; we use PCA level/slope (`stir-composite-nq`, `rate-curve-structure`) for the same job |

## What we could learn
- **Linear first, and make the complex model beat it.** DO WORSE. We did it in `extreme-in-probability` (count table vs GBM) and `meta-label-proper` (forest vs logistic), and the yield ladders taught us to add an intercept-only M0. But no rule asks for it, so an ML arm can still be reported alone. Touches `research-protocol/references/stats-defaults.md`.
- **Name the job: pricing, filtering, describing or forecasting.** ALREADY DO: the `CONTEXT` verdict word; `gr-hmm-trend-direction` ("describes the last fortnight; not a next-day call"); yield coupling is same-bar only. Independent confirmation.
- **Regime/latent-state models need a stability check and a reason for the states.** DO WORSE. We found the meaning problem (HMM = variance) after it hid a dollar move, but nothing audits label stability (dwell time, flip rate, does yesterday's label change when refit with one more day?). `hmm.js`, `js/hmmHourly.js`, `js/creditHmm.js` and `js/regime-confidence.js` are still live and bots branch on `hmmSignalScore`. Touches `data-rules` (inputs).
- **Interpretability breaks ties.** ALREADY DO: the count table kept over GBM in `extreme-in-probability`.
- **PCA: check that the loadings are stable over time, not only that K is above noise.** DON'T DO for the residual book (only `plans/vol-layer/L3_LITERATURE_SPEC.md` mentions subspace stability). Adopting it is one diagnostic in the residual scripts. QG says it again in the maths video ("seeing if there's stability over time").
- **ML direction models**: our record agrees with his midwit curve. Forest/GBM meta-labels added nothing (`meta-label-proper`, `live-range-break-linestate`); LSTM/transformer FX direction papers "rarely replicate net of costs" (`MD files/SHORT_HORIZON_DIRECTION_MODEL.md`). ALREADY DO.

## Research ideas
1. **HMM label stability audit** (mechanics audit, not an edge study). Variable: the `hmm.js` 2-state label for day t when fitted at t, compared with the label for day t when refit at t+1…t+20 · condition: per instrument, calm vs busy years · horizons: refit lag 1, 5, 20 days · noise threshold: relabel rate of a plain rolling-σ percentile split (the same split without a latent model) · benchmark: agreement between HMM label and "20-day σ above its own 1-year median" · would change: if the HMM ≈ a σ threshold and relabels more, replace it with the readable threshold in live inputs. Not carded into an agenda (none fits: suggest a new `model-audits` agenda, or put it as a data-rules audit task).
2. **PCA loading stability as a condition on residual reversion.** Variable: principal angle between the top-K FX8 eigenvectors on the 120-day window and the window 20 days earlier · condition: top vs bottom tercile of stability · horizons: 1, 2, 5 days · noise threshold: the family's IC bar 0.03 and MDE · benchmark: the unconditional residual IC (`residual-pca-wide10` +0.0075, NULL) and a shuffled-stability placebo · would change: whether the residual book should stand aside when the factor structure is rotating. Candidate for `pairs-spread`. Caveat: the base effect is null and splitting it cuts power, so this is likely UNDERPOWERED by design; wait for `residual-fx8-forward` first.

## Quotes
- [7:09] "Pricing and forecasting are two different ball games, folks. If you don't know the difference, then you shouldn't be using a Kalman filter."
- [11:22] HMMs: "it's not going to be stable over time... There needs to be economic justification for what it is you're doing and why those states should exist."
- [10:51] "If you observe a massively volatile day, did we just enter a new regime? Or is it an outlier for the current regime?"
- [16:01] The transformer is "why you're able to overfit and lose money with that back test that you're actively trying to trade live."
- [17:35] "It just goes back to linear regression at the end of the day... people get ripped off of a 0.02 R squared that's from inside the black box."
