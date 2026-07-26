# Theory Lab

A from-scratch, math-explained curriculum in the quantitative concepts behind
this repo's FX/macro research — 34 numbered theory lessons, 8 background
primers, 10 applied Course Notes lessons, and 2 lessons documenting this
repo's own COG case study. Covers everything from standard deviation to the
Heston model, Random Matrix Theory, Merton's continuous-time portfolio
problem, alpha/beta separation, and a real reverse-engineered trading system.

**Start at [`hub.html`](./hub.html)** (also linked from the dashboard's
**Learn ▾** nav menu on `index.html`).

## What every lesson page contains

- Plain-English intuition before any math.
- The math, step by step, with every symbol defined.
- An inline SVG chart illustrating the concept — many are interactive
  (sliders/buttons that recompute the math live), all hand-built, no chart
  library, no external requests.
- A numerically worked example, **plus a named, concrete real-world trading
  scenario** that walks the same numbers through an actual trading decision
  (the amber `.tl-box.scenario` box).
- An honest note on where the idea connects to an actual module in this
  repo — clearly marked as either **already in use** (a real, running
  brick), a **concept/candidate** (explained here, not built or tested), or
  **course notes** (applied practice, converted from this repo's own study
  notes rather than derived from scratch).
- Common pitfalls, a self-test, and further reading (real, correctly
  attributed sources).
- A TL;DR at the top and the Further Reading section collapsed by default,
  so the full depth is opt-in rather than mandatory reading.
- A link to the [Notation Glossary](./glossary.html) — every symbol used
  across the curriculum in plain language, including which Greek letters
  mean genuinely different things in different lessons.

## Curriculum map

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
- **6 · Macro & FX Theory** (3) — Interest Rate Parity & the carry trade,
  Purchasing Power Parity, the Taylor Rule.
- **7 · Applied Statistics & Validation** (7) — regression diagnostics,
  AIC/BIC, ARIMA & VAR, copulas, Sharpe/Sortino/Calmar & the Deflated
  Sharpe Ratio, walk-forward & purged cross-validation, bootstrapping &
  Monte Carlo.
- **8 · Advanced Stochastic Calculus & Derivatives** (4) — Itô's Lemma,
  Girsanov's theorem & the risk-neutral measure, the Heston model, SABR.
- **9 · Advanced Portfolio & Market Structure** (6) — Random Matrix Theory,
  fractional Brownian motion & long memory, market microstructure,
  Markowitz & Black-Litterman, alpha vs. beta separation (portable alpha),
  Merton's continuous-time portfolio problem.
- **10 · Course Notes — Applied Practice** (10) — practitioner-workflow
  lessons converted from this repo's own raw study notes (`education/*.md`)
  into the same format as everything else here: data foundations,
  quant/macro plumbing, applied regression, volatility forecasting, the
  daily forecaster workflow, range extension levels, open interest, the
  cross-asset options diagnostic, macro deep dives, and why public
  strategies decay. Each cross-links back to the from-scratch theory lesson
  it builds on instead of re-deriving it.
- **11 · COG — This Repo's Own Case Study** (2) — not textbook theory: an
  honest documentation of a real, already-built subsystem. "COG" is the
  trader whose published daily forecast this repo reverse-engineered
  (`js/cogBands.js`, `js/cogReverseEngineer.js`) and the gated Nasdaq
  trading system it inspired. Features the actual back-solved constants,
  the already-tested null result (reproducing his line is *not* a better
  tradeable fade), and the real "zero trades from over-conjoined gates"
  architecture lesson — a concrete example of this repo's own "built ≠
  works ≠ has edge" discipline.

Nothing in this folder is a trading signal. A lesson explaining a technique
well is not evidence the technique works here — per `CLAUDE.md`'s Lego
Principle #5, any idea from this series only earns trust after it's built
and cleared the repo's real out-of-sample bar.

## Structure

```
theory-lab/
  hub.html            — curriculum map, linked from index.html
  glossary.html        — searchable notation glossary
  assets/theory.css   — shared stylesheet (dark theme, MathJax, interactive-
                         chart, real-world-scenario, and skim-path classes)
  lessons/*.html       — 54 lesson files (8 primers/foundations + 34
                         numbered theory lessons + 10 Course Notes + 2 COG)
```
