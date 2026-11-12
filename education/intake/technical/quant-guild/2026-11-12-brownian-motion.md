# Brownian Motion for Quant Finance

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci (tag every claim) |
| URL | https://www.youtube.com/watch?v=jiAdz9W4aDI |
| ReelScribe id | j577z47na4xxqb4m3x3xvxa6as8j3m0s · 43 min |
| Notebook | `2025 Video Lectures/59. Brownian Motion for Quant Finance/brownian_motion.ipynb` |
| Recorded | 2025 lecture series |
| Processed | 2026-11-12 |

## Lesson
A random variable is a distribution (CDF, density and characteristic function are equivalent descriptions). Sample
statistics, and probabilities via indicator averages, converge to population values by the law of large numbers, as long
as the draws come from **one fixed** distribution. A stochastic process is random variables indexed by time. Brownian
motion has independent, stationary, normal increments, so its value at T is known exactly (N(0, T)) without simulating the
path. For processes with memory (fBM) you must simulate the path. Pricing a European call is an expectation of a payoff, so
Monte Carlo works by the law of large numbers. In markets the generating distribution drifts, so the same convergence
does not hold for real data.

## Approach
- **Framing**: models give probabilities of states, never the next draw: "We can never predict the outcome of any one
  event. That's not the purpose of random variables."
- **Validation**: empirical histogram converging to a known density, at every cross-section, as the habit for any simulator.
- **Failure mode**: non-stationarity. He animates a generating distribution that drifts over time and shows that the pooled
  histogram gives the wrong picture: "we can't just naively model a fixed distribution."
- **Industry context**: models are wrong and still necessary. A market maker must quote: "Do you want to do that in the dark?"
- **Habit**: when the terminal law is known, sample it directly ("far faster") instead of simulating paths.

## What the code actually does
- The pricing section's markdown says arithmetic Brownian motion (Bachelier), but the code simulates **GBM** (log-normal),
  with drift μ = r = 0.05 (risk-neutral only by coincidence of the parameter choice).
- The "convergence to the theoretical option price" plot uses **100 paths**, and its reference line is the simulation's own
  final running average (`cum_avg[-1]`), not a closed-form price. As in the Volterra note, the convergence check is circular.
  A Black-Scholes/Bachelier closed form was one line away.
- Seeds are set for the teaching plots (`np.random.seed(42)`) and removed on purpose to show path variation.

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | LLN gives convergence of statistics and of probabilities (indicator averages) (QG) | method | ON FILE as practice: every MC P(touch) here is an indicator average (`intradayReachability`) |
| 2 | "In practice we don't have convergence" because the generating distribution changes (QG) | method | ALREADY DO: lockbox, regime/year splits; `day-recon-reach-calibration` UNDERPOWERED shows year-to-year drift up to ~8pp |
| 3 | Independent increments make the terminal law known; memory processes need the path (QG) | method | ALREADY DO: Live Range/ladders use closed-form σ√h quantiles; MC only for path questions |
| 4 | "Stock prices don't follow" ABM/GBM is no objection: "you need to use models to make informed decisions under uncertainty" (QG) | method | Agree. The desk's version: `forecast-pick` VALIDATED picks the σ that calibrates, not the "true" model |

## What we could learn
- **Known answer must be independent of the simulation**: REPEAT of the Volterra point (refines #1).
- **Report MC error with the estimate**: his 100-path price has a standard error of a few percent and none is shown. DO WORSE
  here too: `intradayReachability` returns `pTouch` from 400 paths with no SE (±2.5pp at p = 0.5). → supports #2.
- **Probability = indicator mean, so it has a binomial SE**: ALREADY DO in studies (bootstrap intervals), not in live outputs.

## Research ideas
Not carded: foundations only. Covered by `model-audits` Q2 and the known-answer check in the ABM/GBM note.

## Quotes
- "Unlike with Brownian motion, the probability and statistics of sample paths in practice do not converge."
- "We can't just naively model a fixed distribution."
- "If we had the dynamics of the stock price process, we wouldn't need a model in the first place."
