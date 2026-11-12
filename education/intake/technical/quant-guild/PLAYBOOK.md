# Quant Guild: how they approach problems

Roman Paolucci (QG). Grown one item at a time by `learn-intake` (technical lane). One line per idea, linked to the
note it came from; a repeat gets an extra citation, not a new line. Repetition shows what they actually believe.

Notes: [model tier list](2026-11-12-model-tier-list.md) · [math tier list](2026-11-12-math-tier-list.md) ·
[path signatures](2026-11-12-path-signatures.md) · [volatility is rough](2026-11-12-volatility-is-rough.md) ·
[how to learn](2026-11-12-how-to-learn.md) · shorts: [hedge funds](2026-11-12-shorts-how-hedge-funds-trade.md),
[ex ante](2026-11-12-shorts-backtest-ex-ante.md), [Fama-MacBeth](2026-11-12-shorts-fama-macbeth.md),
[tier list](2026-11-12-shorts-model-tier-list.md)

## Framing
- **Name the job first**: pricing (risk-neutral expectation), filtering a state, describing, or forecasting. "Pricing and forecasting are two different ball games." A Kalman filter or ARIMA used as a forecaster is the wrong job. [model tier list, path signatures, volatility is rough]
- **Ask what information the target needs.** A terminal payoff needs terminal moments; a path-dependent one needs a path encoding. [path signatures]
- **Where does the P&L come from?** Forecasting skill (beating the price) or harvesting a systematic mispricing (economic reason, can be crowded out). Both are uncertain, for different reasons. [shorts: hedge funds]
- **Judge ex ante.** A backtest shows the outcome distribution you signed up for; "did it beat the S&P" is ex-post hindsight. [shorts: ex ante]
- **Rank tools by use in your role**, not by how sophisticated they are. [model tier list, math tier list]
- **Frontier models: start from the nearest tractable relative** and add one change at a time, naming what each change gives up. Build your own reading before consulting the author. [how to learn]
- **Objective: "survive, gain exposure to desirable risk, and survive".** [shorts: hedge funds]

## Models
- **Linear regression and its family** (multivariate, factor, pooled, Fama-MacBeth) is S tier; experts end up back at it. [model tier list, shorts: tier list, shorts: Fama-MacBeth]
- **Interpretability breaks ties** (PCA over autoencoders: you can read the loadings). [model tier list]
- **A model earns its place** by capturing a stylised fact (GARCH and vol clustering) or doing something only it can do (Black-Scholes backs out IV). [model tier list]
- **Reject a model class on a qualitative property before fitting** (fBM is non-stationary, variance must mean-revert, so fractional OU). [volatility is rough]
- **Among models that fit the same marginals, pick by path realism** (leverage effect, stochastic vol), not fit quality. [path signatures]
- **HMMs C tier**: regimes are a sound idea, but the states are unstable and need an economic reason. [model tier list]
- **Judge an extension by "parsimonious? efficient? effective?"**, because "you can always model anything". [how to learn]

## Validation
- **Known-answer check before the real run**: Black-Scholes call, analytic barrier price (1.7376 vs 1.7378), nested case (H→½ gives Heston). If it doesn't converge, it's wrong. [path signatures, how to learn]
- **Independent methods must agree** (Fourier, PDE, Monte Carlo "should converge to the same price"). [how to learn]
- **Add terms until the answer stops moving** (moment 7, signature level 4). [path signatures]
- **Check the consequence across a family** (zeta(q) across q), not one point. [volatility is rough]
- **PCA: check eigenvector/loading stability over time** before using the factors. [model tier list, math tier list]
- **Diversification is judged in crises** (2022, 2025 tariff shock), not on average correlation. [shorts: hedge funds]
- *Gap (his, not ours):* the rough-vol demo had no interval, no out-of-sample and overlapping windows. [volatility is rough]

## Statistics
- **A small R² is normal and valuable**: "people get rich off of a 0.02 R squared". [model tier list, shorts: tier list]
- **Return distributions are time-varying**; a pooled fit over regimes looks like noise. Fama-MacBeth: per-period cross-section, then average. [shorts: Fama-MacBeth]
- **Turn an exponent into a horizon multiplier** (4x horizon gives 1.21x increment vs 2x under Brownian). [volatility is rough]
- **CLT holds roughly and locally; fat tails break it.** [how to learn]
- **Geometric, not arithmetic**: rebalancing uncorrelated, even underperforming legs can lift the geometric mean (Shannon's demon). [shorts: hedge funds]

## Costs
- **Model risk is charged as a spread** on top of fair value. [path signatures]
- **Computational cost matters** (non-Markovian kernels need the whole path, so Markovian lifting). [volatility is rough]

## Failure modes
- **"99% accuracy" usually means an ignored unit root or non-stationarity.** [model tier list]
- **Fitting the terminal distribution doesn't identify the path dynamics.** [path signatures]
- **Kitchen-sink features with "no economic basis".** [path signatures]
- **Spurious correlation from search** ("prescriptions in Madagascar… Arabian shrimp boats"). [shorts: Fama-MacBeth]
- **Regime models: outlier or new regime, and how fast to adapt?** Fast adaptation flip-flops. [model tier list]
- **LLMs make it easy to overfit**, and their defaults (an "80% mastery" target) aren't truth. [model tier list, how to learn]

## Learning
- **Mastery, not "learning about"**: know where a result breaks; a thousand flavours of the same problem. [how to learn]
- **Prerequisites per phase, move on only at 100%.** [how to learn]
- **Solve alone before seeing solutions; grade; redo.** A found gap is good news. [how to learn]
- **Diagnostic quiz, then a gap list in dependency order.** [how to learn]
- **Maths by job**: alpha work needs linear algebra (decompositions), optimisation, multivariable calculus (plus statistics, which he omits); PDEs/functional analysis are for pricing roles. Outsource rote work to tools. [math tier list]

## Sayings
- "Pricing and forecasting are two different ball games, folks."
- "People get rich off of a 0.02 R squared."
- "If everything is surprising, nothing is surprising."
- "Volatility is a latent process. We know it exists, but we don't have any way of directly observing it."
- "If our paths aren't accurate, they're going to produce unrealistic payoff densities."
- "Everybody's operating in this beautiful ex post world."
- "There is no free lunch."
