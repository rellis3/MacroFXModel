# Theory Lab

A from-scratch, math-explained curriculum in the quantitative concepts behind
this repo's FX/macro research — 34 numbered theory lessons, a 5-lesson
Foundation Mathematics tier for readers starting from GCSE-level maths, 8
background primers, and fifteen further categories spanning fixed income,
numerical methods, market microstructure, options Greeks, Bayesian/state-space
extensions, information theory, signal processing, graph theory, reinforcement
learning, risk management, portfolio construction, research methodology,
stochastic differential equations, and institutional data engineering.
Covers everything from algebra and Euler's formula to the Heston model,
Random Matrix Theory, Merton's continuous-time portfolio problem,
Nelson-Siegel yield curves, dealer gamma exposure, MCMC, DebtRank, the
Bellman equation, Neural SDEs, and the data-pipeline mechanics underneath
all of it.

Every card on the hub carries a **Beginner/Intermediate/Advanced** difficulty
pill (`.tl-pill.tl-diff-pill`), and a filter bar at the top of the page
(`.tl-diff-filter`) toggles by level — client-side, vanilla JS, no
dependencies, driven by a `data-level` attribute on each `.tl-cat` block.
The level is assigned **per category, not per lesson** (Foundation Math/Math
Primer/Deeper Foundations → Beginner; categories named "Advanced ..." plus
State Space Models Extensions → Advanced; everything else → Intermediate) —
keep new categories consistent with that rule rather than hand-tuning
individual lessons.

**Start at [`hub.html`](./hub.html)** (also linked from the dashboard's
**Learn ▾** nav menu on `index.html`).

Looking for the applied, practitioner-workflow lessons converted from this
repo's own raw study notes, or the "COG" case study (a real trader's
reverse-engineered forecast and the gated trading system it inspired)? Those
live in the sibling **[COG Hub](../cog/hub.html)**, not here — see
`../cog/README.md`.

Building or restyling a lesson? See
[`../education/LESSON_STYLE_GUIDE.md`](../education/LESSON_STYLE_GUIDE.md) —
every component in `assets/theory.css`, when to use it, copy-pasteable
markup, the house content order, and a verification checklist.

## What every lesson page contains

- Plain-English intuition before any math.
- The math, step by step, with every symbol defined.
- An inline SVG chart illustrating the concept — many are interactive
  (sliders/buttons that recompute the math live), all hand-built, no chart
  library, no external requests.
- A numerically worked example, **plus a named, concrete real-world trading
  scenario** that walks the same numbers through an actual trading decision
  (the amber `.tl-box.scenario` box).
- An honest status badge — CONCEPT means explained here, not a claim about
  this project's own build status. Lessons no longer name which internal
  file/module a technique maps to (that mapping now lives in the
  dashboard-only `../repo-brick-map.html`, not in the shared curriculum).
- Common pitfalls, a self-test, and further reading (real, correctly
  attributed sources).
- A TL;DR at the top and the Further Reading section collapsed by default,
  so the full depth is opt-in rather than mandatory reading.
- A link to the [Notation Glossary](./glossary.html) — every symbol used
  across the curriculum in plain language, including which Greek letters
  mean genuinely different things in different lessons.

## Curriculum map

- **Foundation Mathematics** (5) — algebra/functions, trigonometry/logs/
  exponentials, complex numbers, partial derivatives/multivariable calculus,
  optimization basics. Start here if you've only done GCSE-level maths —
  read this before the Math Primer below.
- **0 · Math Primer** (4) — descriptive stats/normal distribution,
  probability/CLT, correlation/regression, returns/compounding. Start here
  if you're new to statistics.
- **0.5 · Deeper Foundations** (4) — linear algebra, calculus, stationarity/
  ACF/PACF, time value of money. Not sequential — read one alongside
  whichever later lesson calls for it.
- **1 · Foundations & Epistemics** (3) — EMH, Bayesian inference, multiple
  testing.
- **2 · Time Series & Regimes** (5) — Ornstein-Uhlenbeck, Hurst/variance
  ratio, GARCH, Hidden Markov Models, Kalman filters.
- **3 · Cross-Asset & Structure** (2) — cointegration, PCA.
- **4 · Options & Derivatives** (2) — Black-Scholes-Merton, Merton
  jump-diffusion.
- **5 · Risk & Sizing** (2) — Kelly criterion, Extreme Value Theory.
- **6 · Macro & FX Theory** (4) — Interest Rate Parity & the carry trade,
  Purchasing Power Parity, the Taylor Rule, Central Bank Policy (hawkish/
  dovish, the dot plot, QE/QT, and the surprise-vs-priced rule for what
  actually moves FX).
- **7 · Applied Statistics & Validation** (7) — regression diagnostics,
  AIC/BIC, ARIMA & VAR, copulas, Sharpe/Sortino/Calmar & the Deflated
  Sharpe Ratio, walk-forward & purged cross-validation, bootstrapping &
  Monte Carlo.
- **8 · Advanced Stochastic Calculus & Derivatives** (4) — Itô's Lemma,
  Girsanov's theorem & the risk-neutral measure, the Heston model, SABR.
- **9 · Advanced Portfolio & Market Structure** (5) — Random Matrix Theory,
  fractional Brownian motion & long memory, Markowitz & Black-Litterman,
  alpha vs. beta separation (portable alpha), Merton's continuous-time
  portfolio problem.
- **10 · Fixed Income Mathematics** (5) — bond pricing & YTM, duration &
  convexity, bootstrapping the yield curve, Nelson-Siegel & Svensson curve
  fitting, swap curves & OIS discounting.
- **11 · Numerical Methods** (4) — Newton-Raphson & gradient descent, convex
  optimization, linear & quadratic programming, numerical integration.
- **12 · Market Microstructure** (5) — Kyle's Lambda & Glosten-Milgrom
  (promoted out of category 9 into its own category), limit order books &
  queue dynamics, market impact models & Almgren-Chriss, order flow
  toxicity & VPIN, execution algorithms (TWAP/VWAP/POV/IS).
- **13 · The Greeks** (2) — gamma exposure & dealer hedging flows (the
  dealer-GEX formula, hedge-flow-rate, the gamma-flip level), open interest
  walls & max pain (the economic derivation, plus squeeze mechanics). Builds
  on Black-Scholes-Merton's own Greeks derivation rather than repeating it.
  Three further "deep dive" lessons — Theta Decay, Vega & the Volatility
  Surface, and Second-Order Greeks (Vanna/Charm/Vomma/Speed/Color/Zomma) —
  exist in `lessons/` and are cross-linked from within these two, but are
  deliberately not surfaced as their own hub cards, to keep this category's
  footprint on the curriculum map to the two core lessons.
- **14 · Bayesian Statistics Extensions** (3) — conjugate priors & Bayesian
  updating, MCMC (Metropolis-Hastings & Gibbs sampling), hierarchical models
  & partial pooling. Direct sequels to Foundations & Epistemics' Bayesian
  inference lesson.
- **15 · State Space Models Extensions** (3) — the particle filter
  (sequential Monte Carlo), the Kalman smoother & extended/unscented Kalman
  filters, regime-switching state space models (Kim's filter). Direct
  sequels to the Kalman filter and Hidden Markov Model lessons.
- **16 · Information Theory** (3) — entropy/KL divergence/mutual information,
  transfer entropy & information-theoretic causality, minimum description
  length & information criteria (rederives BIC from coding theory).
- **17 · Signal Processing** (3) — Fourier analysis & the frequency domain,
  wavelets & time-frequency analysis, trend/cycle filters (Hodrick-Prescott,
  Butterworth, Baxter-King — including HP's documented end-point-bias flaw).
- **18 · Graph Theory & Networks** (3) — graph fundamentals & centrality
  measures, correlation networks & minimum spanning trees, systemic risk &
  financial contagion networks (DebtRank).
- **19 · Reinforcement Learning** (3) — MDPs/value functions/the Bellman
  equation, Q-learning & temporal-difference methods, policy gradients &
  actor-critic methods.
- **20 · Risk Management Deep Dive** (3) — coherent risk measures (VaR/CVaR
  & the Artzner axioms), tail risk hedging & portfolio convexity, stress
  testing/scenario analysis/reverse stress tests.
- **21 · Advanced Portfolio Construction** (4) — risk parity & equal risk
  contribution, Hierarchical Risk Parity, factor-based portfolio
  construction, active portfolio management (Information Ratio, the
  Fundamental Law of Active Management, Active Share vs. tracking error,
  and Sharpe's zero-sum-before-costs accounting identity). Direct sequels
  to Markowitz & Black-Litterman.
- **22 · Quantitative Research Process** (2) — the research pipeline
  (hypothesis to honest backtest), feature engineering/leakage/
  reproducibility. The methodology layer underneath every other category.
- **23 · Stochastic Differential Equations** (5) — existence & uniqueness of
  SDE solutions, numerical schemes (Euler-Maruyama & Milstein), multivariate
  & correlated SDEs, short-rate models (Vasicek/CIR/Hull-White), Neural
  SDEs & Neural SPDEs (explicitly flagged as unvalidated research
  machinery, not built or tested in this repo).
- **24 · Institutional Data Engineering** (5) — the raw-feed-to-trading-ready
  data pipeline (bar construction: time/tick/volume/dollar bars), data
  cleaning (bad ticks, stale quotes, missing-data tradeoffs, and cleaning
  with whole-sample stats as a lookahead-bias bug), corporate actions &
  futures-roll series continuity, point-in-time data & survivorship bias,
  and data architecture (storage, versioning, lineage). The first category
  focused on data infrastructure/process rather than math theory.

Nothing in this folder is a trading signal. A lesson explaining a technique
well is not evidence the technique works here — per `CLAUDE.md`'s Lego
Principle #5, any idea from this series only earns trust after it's built
and cleared the repo's real out-of-sample bar.

## Structure

```
theory-lab/
  hub.html            — curriculum map, linked from index.html
  glossary.html       — searchable notation glossary
  assets/theory.css   — shared stylesheet (dark theme, MathJax, interactive-
                         chart, real-world-scenario, and skim-path classes)
  lessons/*.html      — 103 lesson files (5 Foundation Mathematics + 8
                        primers/foundations + 34 numbered theory lessons +
                        5 Fixed Income Mathematics + 4 Numerical Methods +
                        4 further Market Microstructure lessons alongside
                        the pre-existing one + 2 The Greeks lessons + 3
                        Greeks deep-dive lessons not listed on hub.html +
                        31 "wave 2" lessons across 10 further categories:
                        Bayesian Statistics Extensions (3), State Space
                        Models Extensions (3), Information Theory (3),
                        Signal Processing (3), Graph Theory & Networks (3),
                        Reinforcement Learning (3), Risk Management Deep
                        Dive (3), Advanced Portfolio Construction (3),
                        Quantitative Research Process (2), and Stochastic
                        Differential Equations (5) + 1 further Advanced
                        Portfolio Construction lesson (Active Portfolio
                        Management) + 5 Institutional Data Engineering
                        lessons (category 24))
```
