# Theory Lab

A from-scratch, math-explained curriculum in the quantitative concepts behind
this repo's FX/macro research — 34 numbered theory lessons plus 8 background
primers. Covers everything from standard deviation to the Heston model,
Random Matrix Theory, Merton's continuous-time portfolio problem, and alpha
vs. beta separation.

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
- An honest note on where the idea connects to an actual module in this
  repo — clearly marked as either **already in use** (a real, running
  brick) or a **concept/candidate** (explained here, not built or tested).
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
  lessons/*.html      — 42 lesson files (8 primers/foundations + 34
                        numbered theory lessons)
```
