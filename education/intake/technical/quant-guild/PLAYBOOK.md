# Quant Guild: how they approach problems

Roman Paolucci (QG). Grown one item at a time by `learn-intake` (technical lane). One line per idea, with the notes it
came from in brackets (slug without the date); a repeat adds a citation, not a line. Repetition shows what he actually
believes. 33 items as of 2026-11-12; the full lecture list is in [LIBRARY.md](LIBRARY.md), the ledger in `education/intake/INDEX.md`.

**Read with care:** his notebooks often break his own rules (OOS tuned on OOS, circular checks, planted crises,
overlapping windows, in-sample portfolio weights). This playbook records what he teaches; the notes' "What the code
actually does" sections record where the code falls short. Both are useful.

## Framing
- **Name the job first**: pricing (risk-neutral), filtering a state, describing, or forecasting. "Pricing and forecasting are two different ball games." A forecast is a conditional expectation that holds "if status quo continues"; name the break the series can't see. [model-tier-list, path-signatures, volatility-is-rough, time-series-analysis, abm-gbm-masterclass, brownian-motion, options-crash-course, bs-iv-surface-trading, options-chains]
- **Where does the P&L come from?** Forecasting skill, a structural mispricing (can be crowded out), or a risk premium (insurance). Market-making P&L = spread edge + hedging quality. [shorts-how-hedge-funds-trade, quant-vs-discretionary, volatility-risk-premium, deep-hedging]
- **Ask what each piece contributes**: split E[P&L] = P(win)·E[win] + P(loss)·E[loss] by regime; an edge is the conditioning under which those parts stay stable. [law-of-total-expectation]
- **Ask what information the target needs** (terminal vs path-dependent). [path-signatures]
- **Judge ex ante.** "Did it beat the S&P" is hindsight. [shorts-backtest-ex-ante]
- **The portfolio job is maximum geometric growth at the leverage you'll run**, not maximum Sharpe; position for survival, not prediction. [volatility-drag, tail-risk, shorts-how-hedge-funds-trade]
- **Classify independence by mechanism before looking at data**: "real diversification is structural, not statistical." [diversification-vs-hedging]
- **Quant and discretionary play the same game**: a time-variant policy π*. Quants keep discretion upstream (research); discretion can be "low touch", switching a systematic engine on and off; "high vol" is relative to the market's own past. [quant-vs-discretionary]
- **"Over conditioning or under conditioning, that really is the game."** [fama-macbeth-regressions]
- **Frontier models: start from the nearest tractable relative**, add one change at a time, name what each loses. [how-to-learn]
- **Rank tools by use in your role.** [model-tier-list, math-tier-list]
- **Engineering: think end to end first; never hard-code strikes/expiries** (rebuild from spot each run). [live-vol-surface-ibkr]

## Models
- **Linear regression and its family** is S tier; experts end up back at it. [model-tier-list, shorts-model-tier-list, shorts-fama-macbeth]
- **Fama-MacBeth**: each period regress next-period return on today's characteristic, average the slopes, test against their time-series spread; every premium test is a joint test with the pricing model. [fama-macbeth-regressions, shorts-fama-macbeth]
- **Named states as a Markov chain first; an HMM only if it beats them out of sample** ("business likes explainability"). HMMs C tier: unstable states. [hidden-markov-models, markov-chains, model-tier-list]
- **When a model breaks: specification or parameterization?** ("probably both"). Pick the specification from theory (VIX is OU), not fit. [kalman-filter]
- **A Kalman filter is a model on a model**; the gain is a trust lever; a plain filter "is a band-aid, not a cure"; adaptivity is "a double-edged sword". Filter ≠ smoother ≠ forecaster. [kalman-filter, kalman-mean-reversion, time-series-analysis]
- **A model earns its place by capturing a stylised fact** (GARCH(1,1) = ARCH(∞) in two parameters; vol clustering) or doing something only it can (Black-Scholes backs out IV). [model-tier-list, arch-garch]
- **Reject a model class on a qualitative property before fitting** (fBM non-stationary → fractional OU; ABM vs GBM: can it go negative, does it compound?). [volatility-is-rough, abm-gbm-masterclass]
- **Draw the exact transition when the law is known**; expand the state to make memory Markov and compress it (a power-law kernel ≈ a mixture of exponentials). [brownian-motion, volterra-discretization, markovian-lifting]
- **Among models that fit the same marginals, pick by path realism.** [path-signatures]
- **Pick a pricing model for consistent prices, efficient compute, and "say as little as possible about the true distribution".** [bs-iv-surface-trading]
- **Anchor allocations to a consensus prior; move only through explicit, confidence-weighted views** (Black-Litterman); MVO on historical means "is very eager to throw you off a cliff". [black-litterman-vs-mvo]
- **Conditional (regime) tail model over a static one.** [tail-risk]
- **Interpretability breaks ties**; judge an extension by "parsimonious? efficient? effective?". [model-tier-list, how-to-learn, markovian-lifting]
- **A neural policy trained on a simulator maximises a risk measure**, not the mean, and is only as good as the simulator. [deep-hedging]
- **Scheduled jumps: forecast two states from the straddle** (size, not direction). [time-series-analysis]
- **Use the vendor's IV, but back it out yourself once.** [live-vol-surface-ibkr]

## Validation
- **Known-answer check, from outside the pipeline**: Black-Scholes call, analytic barrier, nested case (H→½ gives Heston; K=1 gives Brownian), recover a known transition matrix. If it doesn't converge, it's wrong. *His own Volterra check is circular.* [path-signatures, how-to-learn, markov-chains, volterra-discretization]
- **Independent methods must agree; report discretisation and simulation error separately; add terms until the answer stops moving.** [how-to-learn, volterra-discretization, path-signatures]
- **Stability, not stationarity**: perturb parameters, resample across regimes; ask any strategy for "the distribution stability over time". [non-stationarity-market-timing, law-of-total-expectation]
- **Perturb the inputs of a fitted allocation**: real structure decays gently, noise falls off a cliff. [black-litterman-vs-mvo]
- **Chronological train/val/test**; the conditional optimum is not the unconditional one. [quant-vs-discretionary]
- **Compare at equal exposure.** [how-quants-engineer-portfolios]
- **PCA loadings must be stable over time.** [model-tier-list, math-tier-list]
- **Diversification is judged in crises**; correlations "go to one". [shorts-how-hedge-funds-trade, diversification-vs-hedging]
- **List each assumption the estimator needs and name the one that breaks.** [markov-chains]
- **Discretionary edge: similar performance across separate ON episodes; drawdown → switch off.** [quant-vs-discretionary]
- *Gaps (his):* rough-vol demo without CI on overlapping windows; GARCH parameters tuned on OOS RMSE and the EWMA grid omitting 0.94; HMM with one start and smoothed labels; Kalman calibrated and filtered on the same sample; VRP target horizon-mismatched; IV-surface and covered-call simulations fair by construction; portfolio weights in-sample; crises planted. [volatility-is-rough, arch-garch, hidden-markov-models, kalman-filter, volatility-risk-premium, bs-iv-surface-trading, covered-call, how-quants-engineer-portfolios, diversification-vs-hedging, tail-risk]

## Statistics
- **A small R² is normal and valuable**: "people get rich off of a 0.02 R squared". Daily squared returns give R² < 10%; intraday RV makes 40–60% explainable. [model-tier-list, shorts-model-tier-list, arch-garch]
- **Time-varying distributions; fat tails = a time-compressed mixture of regimes; LLN only holds for a fixed generating distribution** ("in practice we don't have convergence"). [shorts-fama-macbeth, non-stationarity-market-timing, arch-garch, brownian-motion, free-college-stochastic-processes]
- **g = μ − ½σ²; uncorrelated Sharpe ratios add in quadrature; rebalancing uncorrelated legs lifts the geometric mean** (Shannon's demon). [abm-gbm-masterclass, how-quants-engineer-portfolios, volatility-drag, shorts-how-hedge-funds-trade]
- **The proxy window decides the statistic** ("which window? Welcome to quantitative research"). [volatility-risk-premium, volatility-is-rough]
- **Look for a monotone forward return across signal quantiles.** [fama-macbeth-regressions]
- **Parameters that look reasonable can give absurd tails** (65 billion years vs 4.2). [kalman-filter]
- **Turn an exponent into a horizon multiplier.** [volatility-is-rough]
- **Judge the decision, not the outcome.** [deep-hedging]

## Costs
- **"Transaction costs will eat you alive"**; a mid-price backtest is a "rude awakening"; more legs, wider spread. Named often, rarely modelled. [fama-macbeth-regressions, quant-vs-discretionary, options-chains, vol-dashboard-ibkr, volatility-risk-premium]
- **Insurance bleed is "the dragon slayer's fee"**: pay a fair price. Short vol without a tail hedge: 31% drawdown. [volatility-drag, volatility-risk-premium]
- **Discrete hedging: lower mean, higher variance**; continuous = infinite costs. [deep-hedging]
- **Model risk is charged as a spread.** [path-signatures]
- **Computational cost matters** (Markovian lifting). [volatility-is-rough, markovian-lifting]
- **IBKR data limits**: ~100 market-data lines; delayed data arrives on tick types 80–83. [live-vol-surface-ibkr]

## Failure modes
- **"99% accuracy" usually means an ignored unit root.** Stationarity tests on a sample don't certify the future. [model-tier-list, time-series-analysis, non-stationarity-market-timing]
- **Timing fails because the regime switch can't be observed** ("when should we update, how much data?"). [non-stationarity-market-timing]
- **No long-run mean in prices; adaptivity means whipsaw.** [kalman-mean-reversion]
- **Alpha decay, crowding, capacity; "market-neutral" ≠ risk-free.** [quant-vs-discretionary]
- **Fitting the terminal distribution doesn't identify the paths; a simulator-trained policy inherits model risk.** [path-signatures, deep-hedging]
- **Walk-forward can be overfit too; the next crisis is not the last one.** [tail-risk]
- **Kitchen-sink features; spurious correlation from search; HMMs overfit; LLMs make overfitting easy.** [path-signatures, shorts-fama-macbeth, hidden-markov-models, model-tier-list]
- **Optimising expected P&L means "triple lever up on memecoins".** [deep-hedging]
- **Vol units**: annualised vs daily, or you scale twice (his own two videos disagree). [live-vol-surface-ibkr, vol-dashboard-ibkr]
- **"There's so many ways to construct an inappropriate benchmark."** [arch-garch]

## Learning
- **Mastery, not "learning about"**; prerequisites per phase; move on only at 100%; solve alone before solutions; diagnostic quiz → gap list. [how-to-learn, free-college-stochastic-processes]
- **Graded homework with solutions is the gate** (Free College: 20 problems/week). [free-college-stochastic-processes]
- **Teach each object as definition → picture → derivation → one plain sentence.** [free-college-stochastic-processes]
- **Maths by job**: linear algebra (decompositions), optimisation, multivariable calculus (+ statistics); PDEs for pricing roles. Outsource rote work. [math-tier-list]
- **Learn to code by building projects; write it yourself**, because "somebody has to go in and fix everything". [vol-dashboard-ibkr]

## Sayings
- "Pricing and forecasting are two different ball games, folks."
- "People get rich off of a 0.02 R squared."
- "Without a crystal ball, there's no such thing as a prediction."
- "Stability is what we look for in the real world, not stationarity."
- "You can't make something that is non-stationary stationary."
- "If we knew the true dynamics, we wouldn't need to build a model in the first place."
- "It's never the purpose of a model to predict randomness."
- "Good decisions can yield bad outcomes."
- "Real diversification is structural, not statistical."
- "Our goal is never prediction. Our goal is positioning for survival."
- "Dragon slayers don't work for free."
- "Anytime you have a model capable of adapting with the market, it is a double-edged sword."
- "Lack of evidence does not constitute a lack of existence."
- "All empirical research… is data mining."
- "Models are for sure wrong. But some models are certainly more wrong than others."
- "If everything is surprising, nothing is surprising."
- "Everybody's operating in this beautiful ex post world."
- "There is no free lunch."
