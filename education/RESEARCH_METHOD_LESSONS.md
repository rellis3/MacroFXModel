# Research method lessons (all sources)

How to run research, learned from the material the owner feeds in (quant teachers, C.OG, commentators, podcasts),
compared with how this desk works now. Written by the `learn-intake` skill; read by `research-protocol` at Step 0.

Tags: **ALREADY DO** (cite where) · **DO WORSE** (what change) · **DON'T DO** (what adopting it takes) · **DISAGREE**
(our evidence). A lesson seen in 2+ items with DO WORSE / DON'T DO becomes a proposed edit to a skill; the owner approves it.
Status: **PROPOSED** = edit put to the owner · **WATCH** = seen once, waiting for a second source · **ADOPTED** = edit made (date).

Source notes live in `education/intake/<lane>/<source>/`. QG = Quant Guild (Roman Paolucci); 33 QG items processed 2026-11-12.
**A caution on the source:** many of QG's own notebooks break the rules he teaches (OOS numbers tuned on OOS, circular
"known answer" checks, planted crises, overlapping windows). Lessons here are taken from what he *says* is right and checked
against our code; where his code shows the failure mode, the note says so. That makes him a useful source of both rules and counter-examples.

## Do worse / don't do

| # | Lesson | Tag | Where it touches us | Sources | Status / proposed edit |
|---|---|---|---|---|---|
| 1 | **Positive control before the real run**: run the exact pipeline on a synthetic process, planted signal or nested case with a known answer **taken from outside the pipeline** (closed form or an independent method; a check built from the scheme's own output does not count). It must recover the effect, and return zero in the known-zero case. Name the assumption most likely to break | DO WORSE | Only as hard-won lessons in `research-protocol/references/stats-defaults.md` (10-21, 10-24, 11-04) and some unit tests; not a prereg step. QG's own Volterra check (`L@L.T`) is circular and hides a 0.70× variance bias at H=0.1; his VaR had a √252 units bug a known-answer check would have caught | QG path signatures, how to learn, markov chains, volterra, brownian motion, arch-garch, IV surface, covered call (8) | **PROPOSED**: field in `MD files/PREREG_TEMPLATE.md` §3, "Positive control: the known effect or nested case (from outside the pipeline) this pipeline must recover, the known-zero case it must return zero on, and the result" |
| 2 | **Numerical convergence**: doubling paths AND halving steps each move the answer by less than its CI; report the MC standard error with any MC probability | DON'T DO | `forecastPathCore.intradayReachability`: 400 paths (±2.5pp at p=0.5), steps fixed at M5, no SE returned | QG path signatures, how to learn, volterra (3) | **PROPOSED**: line in `stats-defaults.md` |
| 3 | **Factor (PCA) loading stability** before using latent factors | DON'T DO | Residual-PCA family sets K by the noise band only | QG model tier list, math tier list | **PROPOSED**: principal-angle diagnostic in the residual scripts (diagnostic only; `residual-fx8-forward` unchanged) |
| 4 | **Name the edge source**: forecasting skill vs structural mispricing vs risk premium (who is on the other side, why it persists, what crowds it out) | DON'T DO | Prereg §1–8 never asks. The rich-vol rule shows why: it is flagged by IV÷trailing RV but trades breaks, so it isn't clear whether it earns a premium or a forecast (`model-audits` Q7) | QG hedge-funds shorts, quant vs discretionary, VRP (3) | **PROPOSED**: line in prereg §1, "Edge source: skill / structural mispricing / risk premium; who is on the other side" |
| 5 | **Linear baseline first**: any ML / non-linear / latent-state arm is reported beside a linear arm (OLS / logistic / count table / explicit Markov chain) and an intercept-only M0; the claim is the out-of-sample gain over it | DO WORSE | Ad hoc only; the HMMs were never put beside a σ split | QG model tier list, HMM (2) | **PROPOSED**: line in `stats-defaults.md` |
| 6 | **Regime / latent-state checks**: state count chosen on held-out likelihood, several starts, transition stability across halves, dwell/flip rates, relabel-on-refit | DON'T DO | `hmm.js`, `hmmHourly.js`, `creditHmm.js`: one fixed start, no state-count rule, no stability audit; bots read `hmmSignalScore` | QG model tier list, HMM, markov chains, Fama-MacBeth shorts (4) | **PROPOSED**: run as `model-audits` Q1 (amended), then a `data-rules` checklist line |
| 7 | **Diversification judged in stress and by mechanism**: correlation in named stress windows (vol-adjusted, Forbes-Rigobon), joint worst-5% days vs hypergeometric, each leg labelled long-crash / short-crash / independent by mechanism *before* the data | DO WORSE | Portfolio Book and factor blend use full-sample correlation; only `rule-a-portfolio-second-book` counted joint worst days | QG hedge-funds shorts, diversification vs hedging, engineer portfolios, volatility drag (4) | **PROPOSED**: prereg line for any multi-book study; `portfolio-construction` Q1 |
| 8 | **Rebalancing / geometric growth**: judge combining by geometric growth at the leverage you'll run; diversification return ≈ ½(Σwσ² − σp²) | DO WORSE | Portfolio Book rebalances daily to equal risk (so the premium is inside the 0.74) but never measures it | QG hedge-funds shorts, volatility drag, engineer portfolios (3) | WATCH (it's a measurement, not a rule): `portfolio-construction` Q2 |
| 9 | **Fama-MacBeth SEs for cross-instrument statistics**: SE from the time series of the per-period statistic (block bootstrap, or Newey-West with lags ≥ the overlap), report its autocorrelation, and don't stack an effective-N haircut on top | ALREADY DO (univariate: `fx-factor-stack` monthly rank-IC, residual-PCA daily IC with NW) / DO WORSE (no joint multivariate slopes; possible double count, below) | `scripts/fx-factor-stack/run.py` `haircut_ci` widens a month-block bootstrap of the monthly IC by √(7/m_eff)=1.74, probably counting cross-currency correlation twice. Without it carry's IC CI ≈ [+0.015, +0.143]. Verdict stays UNDERPOWERED (Sharpe bars fail either way) | QG Fama-MacBeth shorts + full video | WATCH: check with a planted-correlation simulation (`model-audits` Q9) before changing anything |
| 10 | **A statistic on a latent proxy is reported on at least two proxy specs** (bar size, RV window): the window decides the answer | DO WORSE | data-rules item 2 covers σ's bar shape, not descriptive statistics on proxies | QG volatility is rough, VRP (2) | **PROPOSED**: line in `stats-defaults.md` |
| 11 | **Horizon-matched, non-overlapping outcomes**: an IV-vs-RV outcome uses RV over exactly the days the IV prices (t+1…t+h); increment lag ≥ proxy window; no overlapping targets without HAC | DON'T DO as a rule (done case by case, e.g. `vrp-forecast`) | No line in `data-rules/references/lookahead-and-oos.md` | QG volatility is rough, VRP, vol dashboard (3, all as his errors) | **PROPOSED**: line in `lookahead-and-oos.md` |
| 12 | **Name what a model extension gives up** against the simpler baseline | DO WORSE | Implicit in research-director "Incremental value" | QG how to learn | WATCH |
| 13 | **Path quantities judged on path outcomes; split the error before fixing it** | DO WORSE | `js/oiReachability.js` patches over-confident MC P(touch) (94% → 68%) with a map fitted on EURUSD. **Checked 2026-11-12:** the generator passes a Brownian known-answer test (within 1–2.5pp of the reflection formula at 0.5–2σ, wick padding works), so the miss is σ inputs or non-Brownian real paths, not simulation mechanics | QG path signatures, deep hedging, ABM/GBM | WATCH; `model-audits` Q2 step 0 |
| 14 | **Regime labels are causal**: label at t from data ≤ t only (filtered probability); never Viterbi, smoothed probabilities or full-sample quantile cuts | DO WORSE (done in code since 2026-10-16, not written down) | `hmm.js`, `hmmHourly.js` | QG HMM (his notebook does the opposite) | WATCH: line in `lookahead-and-oos.md` |
| 15 | **Filter noise settings are parameters**: fit Kalman Q/R on innovations or sweep them; report the effective gain / half-life | DON'T DO | `js/config.js` KALMAN5M_DEFAULTS hand-set (gain ≈ 0.27, an EMA with ~2-bar half-life); `js/mve/ssm.js` q = 1e-3·var | QG Kalman filter, Kalman mean reversion (2) | **PROPOSED**: line in `stats-defaults.md`; `model-audits` Q4 |
| 16 | **Back out the vendor's IV yourself once and compare** | DO WORSE | `refresh_options_skew.py` takes IBKR model IV as given; `cboeChain.js` takes Cboe `iv`; only `14_iv_surface.py` inverts its own | QG live vol surface | WATCH; `model-audits` Q8 |
| 17 | **Vendor vol units**: record them and assert an annualised range (0.02–2.0) on load; filter quotes (zero bid; half-spread ÷ vega > ~1 vol pt) | DO WORSE | data-rules faults log covers other unit traps, not vol; `parseCboeChain` drops only no-OI/no-volume | QG vol dashboard, live vol surface (his two videos disagree on units) | WATCH |
| 18 | **Forecast evaluation separates bias (mean error) from efficiency (slope)**: joint Mincer–Zarnowitz test with HAC | DO WORSE | Used once (`forge/VMC_NQ_VOL_INCREMENT_PREREG.md`) | QG VRP (reads bias from slope, wrongly) | WATCH |
| 19 | **Fit window is a modelling choice**: report a rolling / down-weighted arm beside expanding for any refit coefficient | DO WORSE | Chosen σ, widths and IV-adjust mean all expanding (`FORECAST_PICK_PREREG.md`) | QG non-stationarity | WATCH; `model-audits` Q5 |
| 20 | **Decompose expectancy into legs** (P(win), E[win], E[loss], regime weights) and track each against its backtest bootstrap band | DON'T DO | Forward records judged on the total at a fixed date | QG law of total expectation, non-stationarity | WATCH; `model-audits` Q6 |
| 21 | **Perturb the inputs of any fitted allocation**: real structure decays gently, noise falls off a cliff | ALREADY DO for parameters (plateau check, leave-one-sleeve-out) / DO WORSE in the Book Explorer | `diversification.html` defaults to in-sample Markowitz Σ⁻¹μ (`applyPreset('ms')`, ~line 3474) | QG Black-Litterman | WATCH: display fix: default equal-risk, label Max Sharpe "in-sample, not a forecast" (owner's call) |
| 22 | **Judge a sleeve by its marginal effect on book growth at fixed book vol**, not its standalone Sharpe | DO WORSE | Leave-one-sleeve-out reports Sharpe only | QG volatility drag, engineer portfolios (2) | **PROPOSED**: add a book-CAGR-at-fixed-vol delta per sleeve to the Portfolio Book report |
| 23 | **Survival stress beyond the sample** (k× worst seen; named gaps: CHF 2015-01-15, 2020-03, 2008) | DON'T DO | Stop-risk map p99 2.1R and book max DD are history-only | QG tail risk | WATCH |
| 24 | **Test discretion from an ex-ante ON/OFF log**, not a blind backtest of the trader's tool | DON'T DO (the caveat is ALREADY DO at `forge/COG_SETUPS_PREREG.md:77`) | C.OG direction nulls test his tools blind | QG quant vs discretionary | WATCH; `portfolio-construction` Q5 |
| 25 | **Quantile ladder as the standard display** (monotone across quantiles), not just top-minus-bottom | DO WORSE | Tercile books report T−B | QG Fama-MacBeth | WATCH |
| 26 | **Selection objective is a risk measure** (expected shortfall / growth), not the mean | DO WORSE | Tails are reported (stop-risk p99) but selection is on mean R / Sharpe | QG deep hedging | WATCH |
| 27 | **Trade management is not an edge**: before testing any stop / partials / trail / breakeven / add-to-winners rule, run it on random (placebo) entries; the mean must come out ~0R, because management on an entry with no drift only reshapes the distribution (win rate vs payoff). Read the rule's effect as its difference from that placebo, never its raw R | DO WORSE | Shown study by study (`daily-open-fib-retest` BE/targets, `range-edge-limit-fade` 1:1 vs 2:1, line-touch adaptive stops) but never written as a rule; exit-variant ideas keep coming back | Colez Trades (Max Cole: partials at 1–1.5R, trail, add to winners) | WATCH (special case of #1) |

## Already do (independent confirmation)

| Lesson | Where we do it | Sources |
|---|---|---|
| Name the job (pricing / filtering / describing / forecasting); a forecast is a conditional expectation "if status quo" | `CONTEXT` verdict word; same-bar-only couplings | QG model tier list, path signatures, rough vol, time series, ABM/GBM, options videos |
| Mechanism before features; no kitchen sink | `cog-question-style.md` K/L | QG path signatures |
| Small R² / IC is normal; judge by power and cost; very high accuracy is a red flag | IC bar 0.03 + MDE; data-rules item 10 | QG model tier list |
| Interpretability breaks ties | `extreme-in-probability` kept the count table | QG model tier list |
| Benchmark fixed ex ante; threshold chosen before testing on it | prereg §3–4 | QG ex-ante short, vol dashboard (he does the opposite) |
| Check consequences across a family, not one point | "sweep a family of horizons" | QG rough vol |
| Reject a model class on a qualitative property first | horizon-reversion | QG rough vol, ABM/GBM |
| Stability, not stationarity (by year, halves, plateau, regimes); stationarity tests are diagnostics only | `stats-defaults` Controls, lockbox addendum, ADF reported never gated | QG time series, non-stationarity |
| Tune on train only, benchmark tuned equally with its standard grid | lockbox; `forecast-pick` refits every arm per fold | QG ARCH/GARCH (as a counter-example) |
| Score variance forecasts with QLIKE on intraday RV; band backtests check exceedance rate and clustering | `volForecastBench.js`; `vol-layer-deep/feedback` | QG ARCH/GARCH |
| Exact transition over Euler when the law is known | `forecastPathCore` uses exp(μ+σz) | QG ABM/GBM, Brownian motion, Volterra |
| Compress memory into a small Markov state | HAR terms, exponential half-lives | QG Markovian lifting |
| Compare at equal exposure / risk | vol-matched DDs (`stress-filter-hold-flat`, `vol-managed-mm`) | QG engineer portfolios |
| Conditional tails over static | HAR/IV σ; `forecast-miss-shock-*` | QG tail risk |
| Interpolate IV in total variance / delta / log-moneyness, never extrapolate | `14_iv_surface.py`, `forge/options_skew.py` | QG live vol surface (his is the anti-pattern) |
| Benchmark for IV mean reversion is the futures curve, not y=x | `vix-ratio-vx-futures`, `short-vx-rule` | QG vol dashboard |
| Short premium judged by worst month against a tradeable benchmark | `portfolio-book-validate` T6 vs Cboe PUT | QG VRP |
| "Lack of evidence ≠ absence" | UNDERPOWERED vs NULL | QG quant vs discretionary |
| Gate each layer on full understanding before the next | forecaster blueprint; lessons ground-up | QG how to learn |
| LLM defaults aren't truth | check-the-catalogue rule; learn-intake step 4 | QG model tier list, how to learn |

## Disagree

| Their practice | Our position | Source |
|---|---|---|
| Small-sample agreement with a paper read as encouraging | Intervals and power first | QG rough vol |
| Nelson-Siegel D tier | A macro FX desk lives on curve shape (PCA level/slope) | QG model tier list |
| "Learning styles aren't real" vs Theory Lab VARK | Keep the modes (dual coding), drop the "styles" rationale, add graded problem sets | QG how to learn |
| Model probabilities can't be scored for calibration ("we don't live in a frequentist world") | Reliability bins and Brier work; the real gap is risk-neutral vs physical, which is testable (`iv-forecast` ±1σ holds 77%) | QG options crash course, chains |
| "What profitable traders do" as evidence (prop-firm payout traders average RR < 1.5, so take 1:1; "big people ask about drawdown") | Survivorship: the population is selected on the outcome, and RR trades off against win rate at a fixed edge. Only EV net of cost against a placebo counts (#27) | Colez Trades (Max Cole) |
| "Adding to a winner risks nothing, only unrealised gains" | Unrealised profit is money; an add is a new position at today's price with its own risk. Zero-EV on a no-drift entry; on a drifting book it is trend following, judged as such | Colez Trades (Max Cole) |
| Synthetic demos as evidence (planted crises, puts that know the crisis, flat-vol "arbitrage") | Synthetic data is a known-answer check only (#1), never evidence of an edge | QG diversification vs hedging, tail risk, IV surface, covered call |

## For the owner's own learning (not research rules)

- **Graded problem sets exist**: QG's *Free College: Stochastic Processes* has 20 graded problems per week with worked
  solutions (GitHub, MIT licence), which can serve as Theory Lab's missing problem sets and move-on gates. Mapping in
  `education/intake/technical/quant-guild/2026-11-12-free-college-stochastic-processes.md`.
- Prerequisites per lesson in `theory-lab/assets/paths-data.js` ("you need: …", "done when: HW-n at 100%"), plus a cross-lesson diagnostic.
- A core path: linear algebra → probability/statistics → multivariable calculus/optimisation → time-series econometrics, ahead of PDE/SPDE.
- Theory Lab gaps the course fills: combinatorics, joint/marginal distributions, laws of total expectation/variance,
  Chebyshev, first-step analysis, inverse-transform sampling, Poisson process, state classification, renewal/queueing.
  `fractional-brownian-motion` lacks a simulation section (exact Cholesky vs Davies-Harte vs left-point Volterra, with the 0.70-variance trap).
