# Case Study: The Forecaster Portfolio — Lesson 01 of 17

## One Path Among *Many*

> **Source:** Colez Trades (cog) education, "Case Study: The Forecaster
> Portfolio". Module 01 · Foundations. Case Study · Lesson 01 of 17 (CS · 01).
>
> **Transcription note:** copied from phone screenshots of the lesson, taken
> 2026-10-04. Nothing has been added or inferred. The original screenshots are
> kept in `screenshots/lesson-01/` (01–19, in page order), and each figure
> below names the screenshot it appears in. Each figure is also described in
> words, using only its axes, lines, colours, labels and caption as shown. Where something was cut off between
> screenshots it is marked **[not captured]**. Checkpoint answers are listed as
> shown; the lesson did not mark a correct answer in the screenshots.

*A track record is a single realisation of a random process. This lesson sets
out the statistical view on which the series rests: the distribution of paths
behind any record, and the methods used to map it.*

### The distribution *behind* the path

*Foundations for every lesson that follows.*

| | |
|---|---|
| Series | Case Study: The Forecaster Portfolio |
| Subject | Stochastic processes and outcome distributions |
| Method | Analytic results and Monte Carlo simulation |
| Reading time | About 35 minutes |

A systematic strategy's track record is one path through a space of possible
outcomes. The same rules, applied to a market that unfolded differently, would
have produced a different path: a different return, a different drawdown, a
different Sharpe ratio. Evaluating a system therefore means characterising the
process that generates its paths, not only the path that was observed.

This lesson develops that view formally. It sets out how outcomes are
distributed for the Forecaster Portfolio itself, how the process is estimated
from a single realisation, how simulation maps the full spread of potential
paths, and the validation an institutional system must pass before capital is
committed, with the lesson of this series that takes each check to depth. It
closes with the distinction between the average across paths and the growth
along any one of them. Every later lesson builds on these foundations,
beginning with the measurement of the Forecaster Portfolio's own record.
Throughout, the record's figures are shown before trading costs, which a later
costing module examines in full.

---

## §01 · The Framework

### A track record is one *realisation*

*Returns as a stochastic process, and what a researcher is actually estimating.*

A track record is usually presented as a single line: the value of an account
through time. For a researcher, that line is best understood as one realisation
of a stochastic process. The process is defined by the strategy's rules
together with the behaviour of the markets it trades. The path is what that
process produced on one particular sequence of market outcomes, among the many
sequences that could have occurred.

The distinction matters because the properties of interest belong to the
process, not to the path. The expected return, the volatility, and the
dependence of returns on their own past and on market conditions are
parameters of the process. The realised return, the realised drawdown and the
realised Sharpe ratio are sample statistics: single draws from distributions
whose shape the process determines.

> *The properties of interest belong to the process. The path is one draw from
> the distributions it generates.*

Consider the simplest model in quantitative finance, in which daily returns are
independent draws with mean μ and standard deviation σ. Over a horizon of T
days the cumulative return is approximately normal, with mean μT and standard
deviation σ√T. Two strategies with identical μ and σ will, over any finite
horizon, almost certainly end at different values, and the difference carries
no information about their relative quality. It is sampling variation: the
spread of outcomes the process generates.

The scale of that variation is easily underestimated. The Forecaster
Portfolio's annualised volatility of 29.74% implies, over the 4.7 years of its
record, a standard deviation of cumulative return of about 64% of starting
capital: the same system, on a different sequence of market days, could have
finished far from where it did.

Real returns are richer than the model. They exhibit fat tails, volatility
clustering and serial dependence, each of which later lessons measure on the
Forecaster Portfolio's record. The logic is unchanged. Every performance
statistic has a sampling distribution, and interpreting a statistic means
locating it within that distribution.

A further refinement is that the process itself is not fixed. Its parameters
shift with the market environment: volatility regimes, monetary cycles and
liquidity conditions change the distribution a strategy draws from, so a record
samples the process under the particular regimes it traversed. The Forecaster
Portfolio's record begins in January 2022, at the start of the most rapid
monetary tightening in four decades, and the system's behaviour across such
regimes is examined in Lessons 6 and 10. Distinguishing variation within a
regime from variation across regimes is one of the central problems of
strategy research.

Drift and dispersion accumulate at different rates, and the difference is the
most important fact about any track record. The expected cumulative return
grows in proportion to time, μT, while its standard deviation grows only with
the square root, σ√T. Their ratio, the signal-to-noise ratio of the record, is
therefore the Sharpe ratio multiplied by √T: it rises without limit as a record
lengthens, which is why time, rather than refinement of measurement, is what
eventually separates a real edge from a fortunate path.

The Forecaster Portfolio's own parameters make this concrete. Its record
implies an annualised mean return of 104% with volatility of 29.74%. One year
of such returns carries a signal-to-noise ratio of about 3.5; the full record
carries about 7.6, the same quantity Lesson 11 reports as the t-statistic of
the mean. Figure 1.1 draws the expected path with its 90% interval: by the end
of the record the interval spans +383% to +595%, close to the interval the
bootstrap of §02 recovers from the returns themselves. Two independent methods,
one parametric and one resampled, describe the same dispersion.

**FIGURE 1.1 — Drift against dispersion** *(screenshots 02–03)*

- **What it shows:** a straight dark line rising from 0% at year 0 (the
  expected path) inside a green band that starts at a point at zero and fans
  out wider over time (the 90% interval). The band ends at about 4.7 years;
  the space between the line and the lower edge of the band is shaded grey.

- Chart: cumulative return (y-axis, 0% to +600%) against years (x-axis, 0 to 5).
- Legend: "Expected path at the record mean" (dark line); "90% interval from
  the record volatility" (green band).
- Annotations: "1 year · +104%" on the expected path; band ends at **+595%**
  (upper) and **+383%** (lower) at the end of the record (~4.7 years).
- Caption: *The expected cumulative return at the record mean, with the 90%
  interval implied by the record volatility. Drift grows with time and
  dispersion with its square root.*
- Source tag: HISTORICAL TRACK RECORD · SUMMARY STATISTICS · ANALYTIC INTERVAL

The same view clarifies what an estimate is. Every statistic computed from the
record, its Sharpe ratio, its maximum drawdown, its annual returns, is a
function of one path, and each inherits that path's randomness. Figure 1.2 lays
out the chain: a process generates a path; the path yields estimates; and each
estimate carries a sampling distribution describing how far it could have
landed from the value the process implies. The rest of this lesson follows that
chain link by link.

**FIGURE 1.2 — What an estimate inherits** *(screenshot 03)*

- **What it shows:** four boxes joined left to right by arrows. "One path" has
  a dark border, and "Sampling distributions" is outlined and labelled in
  green.

Diagram (left to right):
**The process** (rules and markets) → **One path** (the record) →
**Estimates** (Sharpe, drawdown, return) → **Sampling distributions** (the
precision of each)

- Caption: *Every statistic is a function of one path, and so carries a
  sampling distribution of its own.*
- Source tag: DIAGRAM

> **THE RESEARCH STANDARD**
> Institutional risk management, capital allocation and strategy research all
> rest on distributions rather than single values. A risk budget is set against
> the spread of drawdowns a strategy could plausibly produce, and capital is
> sized to the distribution of outcomes, not to a single realised path. The
> methods in this lesson are the ones those decisions depend on.

**CHECKPOINT** — Two strategies with identical expected return and volatility
end a year at different values. What does the difference indicate?
- That one strategy is better
- Sampling variation: two draws from the same distribution of outcomes
- An error in the calculation

---

## §02 · Outcomes

### The distribution of *outcomes*

*The spread of paths the Forecaster Portfolio's own returns could have produced.*

The distribution of outcomes can be recovered directly from the record. A block
bootstrap resamples the Forecaster Portfolio's daily returns in runs of
consecutive days, so that each resampled path is a sequence the same system
could plausibly have produced had markets unfolded differently. Two hundred
such paths, each the length of the record, map the spread around the path that
was realised.

**FIGURE 2.1 — The realised path among two hundred possible paths** *(screenshot 04)*

- **What it shows:** a fan of 200 thin grey lines, all starting at 0% and
  spreading out as they rise to roughly +370% to +600% by the end (about 4.7
  years). The central 90% of the fan is tinted green. A dashed green line runs
  straight through the middle of the fan, and the thick navy realised path
  wiggles along close to it, finishing near the middle of the fan. A narrow
  panel on the right, headed "Final return", holds the distribution of final
  returns.

- Chart: cumulative return (0% to +600%) against time (0 to 4+ years), 200 grey
  resampled paths, central 90% shaded, a dashed green line, the realised path
  in navy, and a "Final return" distribution panel on the right.
- Stats strip: **PATHS** 200 · **SHARPE RATIO** 3.51 · **MEDIAN FINAL**
  +489.0% · **CENTRAL 90%** +369.3% to +571.5%
- Caption: *The navy line is the Forecaster Portfolio's realised path. Each
  grey line resamples its own daily returns in runs of consecutive days (a
  stationary bootstrap with a mean block of ten days), with the central 90%
  shaded and the distribution of final returns at the right.*
- Source tag: HISTORICAL TRACK RECORD · STATIONARY BLOCK BOOTSTRAP OF DAILY
  RETURNS · WEEKLY RESOLUTION

Across the two hundred paths, the median final return is +489.0% and the
central ninety percent spans +369.3% to +571.5%. The realised +489.07% sits
close to the median, as it must: the bootstrap draws from the record's own
returns, so its distribution is centred on what the record achieved. What the
bootstrap adds is the spread. The same daily returns, arriving in a different
sequence and combination, could have finished anywhere across a span about
202% of starting capital wide.

The paths also differ in their drawdowns, often more than in their endings,
because the depth of a drawdown depends on how losses cluster in sequence.
Lesson 15 develops that distribution in full and locates the realised drawdown
within it.

> *The realised path is one draw from the distribution its own returns define.*

**01 · OUTCOME PROBABILITIES — The probability of a loss over a horizon**

    Pr(R_h < 0) ≈ Φ(−S√h)

*Takeaway:* Under the normal model, the probability that a strategy with
annualised Sharpe ratio S loses money over h years is Φ(−S√h). At the record's
Sharpe ratio of 3.51, it predicts how often each horizon should show a loss.

**TABLE 2.1 — How often the record lost, against the normal model**

| Horizon | Normal model | Record | Periods |
|---|---|---|---|
| Day | 41.3% | 50.0% | 1,181 |
| Week | 31.1% | 34.7% | 236 |
| Month | 15.6% | 12.7% | 55 |
| Quarter | 4.0% | 0 of 18 | 18 |
| Year | 0.02% | 0 of 4 | 4 |

- Caption: *Normal model at the record's Sharpe ratio of 3.51; record
  frequencies from non-overlapping periods, with calendar months, quarters and
  years. The model misses in both directions.*
- Source tag: HISTORICAL TRACK RECORD · SUMMARY STATISTICS

**FIGURE 2.2 — How often the record lost, against the normal model** *(screenshot 05)*

- **What it shows:** pairs of bars for each horizon, grey for the normal
  model and navy for the record. At Day and Week the navy bar is taller than
  the grey one; at Month, Quarter and Year it is shorter. Quarter and Year show
  no navy bar at all (0.0%). Both bars shrink as the horizon lengthens.

- Grouped bar chart of Table 2.1 (Normal model at a Sharpe of 3.51 vs The
  record): Day 41.3% / 50.0%; Week 31.1% / 34.7%; Month 15.6% / 12.7%;
  Quarter 4.0% / 0.0%; Year 0.02% / 0.0%.
- Caption: *The normal model at the record's Sharpe ratio against the record's
  own loss frequencies, by horizon.*
- Source tag: HISTORICAL TRACK RECORD · SUMMARY STATISTICS

Why the model errs in opposite directions at short and long horizons has a
precise answer. For independent returns, the skewness of an h-day sum is the
daily skewness divided by √h, and its excess kurtosis the daily figure divided
by h. The record's daily skewness of 0.973 therefore falls to about 0.21 over a
month and 0.12 over a quarter, and its excess kurtosis to about 0.049 over a
month. Aggregation drives the distribution towards the normal, which is why the
model's errors shrink as the horizon lengthens.

The quarterly result deserves the same statistical care. The normal model
assigns a loss to 4.0% of quarters, and over eighteen quarters the probability
of observing none at all is about 48%. The record's clean quarterly history is
therefore entirely consistent with the model: eighteen observations are too few
to tell them apart. Where the shape of the distribution matters for risk,
institutional practice adjusts normal quantiles directly for skewness and
kurtosis, most commonly through the Cornish-Fisher expansion that underlies
modified value at risk.

The comparison is instructive because the model fails in both directions. Over
single days and weeks the record loses more often than a normal strategy of the
same Sharpe ratio would: on 50.0% of days against a predicted 41.3%. Over
months and quarters it loses less often: in 12.7% of calendar months against a
predicted 15.6%, and in none of its 18 complete quarters against a predicted
4.0%.

Both departures have the same source, the shape of the daily distribution. The
record's gains arrive on slightly fewer than half of its days but are larger
than its losses on average, with a win-to-loss ratio of 1.83 and positive
skewness of 0.973. Frequent small losses lift the short-horizon loss rate above
the normal benchmark; the accumulation of larger, positively skewed gains
lowers it over longer horizons. A single statistic such as the Sharpe ratio
cannot convey this. A distributional view reveals it at once.

**CHECKPOINT** — The record loses on about half its days yet in only about one
month in eight. What explains the difference?
- The daily figures are measured differently
- Gains are less frequent but larger than losses, so they dominate over longer
  horizons
- Losses are concentrated in a single year

---

## §03 · Estimation

### Estimating the process from *one path*

*How precisely the Forecaster Portfolio's record determines the process behind it.*

In practice the process is not known. It must be estimated from the single path
that was observed, and every estimate inherits the randomness of that path. The
estimated Sharpe ratio is itself a random variable, and the width of its
sampling distribution determines how precisely a record characterises the
system that produced it.

**02 · SAMPLING THEORY — The standard error of a Sharpe ratio**

    σ(Ŝ) ≈ √[ (1 + ½Ŝ²) / T ]      (per period; annualise by √252)

*Takeaway:* The uncertainty in an estimated Sharpe ratio falls with the square
root of the number of observations. With non-normal returns, skewness and
kurtosis enter the expression, as Lesson 11 develops.

The expression in the primer assumes normal returns. For the non-normal case
the variance of the estimated Sharpe ratio acquires two further terms: it falls
with positive skewness, because large gains make a high ratio less likely to be
an accident, and rises with excess kurtosis, because fat tails make extreme
estimates more common. For the Forecaster Portfolio the net effect of its
positive skewness is to narrow the standard error from 0.47 under normality to
0.419. Figure 3.1 shows the resulting sampling distribution.

**FIGURE 3.1 — The sampling distribution of the Sharpe ratio** *(screenshot 06)*

- **What it shows:** a symmetric bell curve centred on 3.51, with the middle
  section between the two green markers (2.69 and 4.33) shaded green-grey. The
  tails outside the markers are unshaded and fall to zero by about 2.0 and
  5.0.

- Density curve over annualised Sharpe ratio (x-axis 2.0 to 5.0), peak at
  **3.51**, 95% interval shaded between **2.69** and **4.33**; right-tail end
  label "0.00".
- Caption: *The distribution of the estimate implied by the record's standard
  error, with its 95% interval shaded.*
- Source tag: HISTORICAL TRACK RECORD · SUMMARY STATISTICS

For the Forecaster Portfolio the calculation is direct. With 1,181 daily
observations and a Sharpe ratio of 3.51, the normal-theory standard error of
the annualised estimate is 0.47. Allowing for the record's measured skewness
and kurtosis, as the Probabilistic Sharpe Ratio of Lesson 11 does, reduces it
to 0.419, because positive skewness makes a high Sharpe ratio less likely to
arise by chance. The resulting 95% interval runs from 2.69 to 4.33.

The width of that interval is the natural unit for judging the record's
precision. Its lower end still describes an exceptional strategy by
institutional standards, while its breadth means no single figure within it
should be treated as the system's true Sharpe ratio. Precision improves only
with the square root of time: doubling the record would narrow the interval by
a factor of √2, not by half. Every principal estimate in the series is reported
in this form, with its interval beside it.

Dependence between returns can erode that precision. When returns are
positively autocorrelated, consecutive observations overlap in what they
reveal: for first-order autocorrelation ρ, a record of n observations carries
the information of about n(1 − ρ)/(1 + ρ) independent ones. The record's
lag-one autocorrelation is +0.023, so its 1,181 days carry the information of
about 1,128, very nearly its full length.

**FIGURE 3.2 — Precision grows with the square root of time** *(screenshot 07)*

- **What it shows:** a curve that falls steeply over the first year or so,
  then flattens out as the record lengthens to 10 years, with the area under
  it shaded grey. The record's own point (about 4.7 years) is a green dot.

- Curve of the 95% interval half-width (y-axis, 0 to ±2.0+) against length of
  record (x-axis, 0 to 10 years).
- Annotations: "1 year · ±1.78"; "The record · ±0.82"; "±0.56" at 10 years.
- Caption: *The half-width of the 95% interval on the Sharpe ratio against the
  length of the record, at the record's precision per year.*
- Source tag: ANALYTIC · SCALED TO THE RECORD

**03 · ANNUALISATION — Lo's correction for serial correlation**

    Ŝ(q) = η(q) Ŝ,      η(q) = q / √[ q + 2 Σ_{k=1}^{q−1} (q − k) ρ_k ]

*Takeaway:* The factor η(q) scales a per-period Sharpe ratio to q periods. With
independent returns it equals √q; with positive autocorrelation it is smaller,
so the square-root rule overstates the annual figure.

Lo's correction applies the same logic to annualisation. For the Forecaster
Portfolio its effect depends on how many lags of autocorrelation are included,
and with the conventional truncations of one to twenty lags the adjusted figure
stays between about 3.2 and 3.7, on either side of the unadjusted 3.51. The
record's dependence is too weak to move the estimate materially in either
direction, and the series reports the unadjusted figure throughout. When Lesson
11 establishes that the Forecaster Portfolio's Sharpe ratio is distinguishable
from zero, the conclusion rests on exactly this sampling distribution, adjusted
for the skewness, kurtosis and dependence measured here.

**04 · SHRINKAGE — Bayesian shrinkage of a Sharpe ratio**

    Ŝ_post = S₀ + (1 − B)(Ŝ − S₀),      B = SE² / (SE² + τ²)

*Takeaway:* An estimate is pulled towards a prior mean by the factor B, the
share of total variance that is sampling noise. The noisier the estimate
relative to the prior, the stronger the pull.

Allocators rarely take an estimated Sharpe ratio at face value; they shrink it
towards what they regard as typical before seeing the evidence. With a prior
centred on 1.0 and a prior standard deviation of 1.0, the record's standard
error of 0.419 implies a shrinkage factor of about 0.15, and the estimate of
3.51 becomes about 3.14. With a tighter prior standard deviation of 0.5, the
posterior falls to about 2.47. The sensitivity is itself informative: a long,
precise record is pulled only modestly by any reasonable prior, while a short
record is pulled heavily, which is the formal content of the institutional
preference for length of record.

**CHECKPOINT** — What primarily determines how precisely the record estimates
the system's Sharpe ratio?
- The size of the Sharpe ratio alone
- The number of independent observations, refined by the shape of the
  distribution
- The starting capital

---

## §04 · Simulation

### Mapping the *spread*

*Monte Carlo methods and the bootstrap: how the full distribution of paths is
recovered from one record.*

Analytic results such as those in §02 rest on simplifying assumptions. When
returns are fat-tailed, clustered in volatility or serially dependent, the
distributions of drawdowns and multi-period returns have no convenient closed
form. Simulation recovers them numerically: generate many paths consistent with
what is known about the process, compute the statistic of interest on each, and
read its distribution from the results.

#### Three ways to generate paths

| | Method | Description |
|---|---|---|
| 01 · Parametric Monte Carlo | **Draws from a fitted model** | Returns are simulated from an assumed distribution with estimated parameters. Fast and flexible, and exactly as accurate as the model. |
| 02 · The bootstrap | **Resamples the record itself** | Observed returns are drawn with replacement. No distributional assumption, but independence between days is imposed. |
| 03 · The block bootstrap | **Resamples runs of days** | Contiguous blocks are drawn, preserving volatility clustering and short-run dependence. The standard choice for daily strategy returns. |

**FIGURE 4.1 — How a block bootstrap resamples** *(screenshot 09)*

- **What it shows:** two rows of small coloured squares, each square one day.
  In the top row, runs of consecutive days share a colour (navy, slate, green,
  bright green, blue, grey, light grey), so each colour run is one block of
  the record in its original order. The bottom row is made of the same
  coloured runs rearranged; some runs repeat (block 6 appears three times) and
  some are missing.

- Top row: "The record, in blocks of consecutive days" (coloured blocks in
  sequence).
- Bottom row: "One resampled path: blocks drawn with replacement" — block
  order shown: block 3, block 6, block 6, block 1, block 8, block 4, block 2,
  block 6.
- Caption: *Runs of consecutive days are drawn with replacement to build a new
  path; a block can appear more than once, and some not at all.*
- Source tag: DIAGRAM

The three approaches trade assumptions against fidelity. A parametric model
imposes a distributional form and is exact only if the form is right. The
ordinary bootstrap introduced by Efron makes no distributional assumption but
treats each day as independent, which destroys the clustering of volatility
that dominates the behaviour of drawdowns. The block bootstrap of Künsch, and
the stationary variant of Politis and Romano with its randomly sized blocks,
resamples runs of consecutive days, so that the dependence within each block
survives into the simulated paths.

The block length is a modelling choice with a clear trade-off. Blocks that are
too short disrupt the dependence the method is meant to preserve; blocks that
are too long leave too few distinct blocks for the resampled paths to vary. The
automatic rule of Politis and White selects the length from the estimated
autocorrelation of the series, and for daily strategy returns lengths of one to
a few weeks are typical. The number of simulated paths governs the precision of
the results: for a one-in-twenty tail, several hundred paths give a usable
estimate and several thousand a stable one.

Once a set of paths has been generated, the statistics of interest are read
directly from it. Where does the realised maximum drawdown sit among the
simulated ones? What is the probability of a loss over six months, or of a
drawdown beyond a given threshold? How long does recovery from a drawdown of
given depth typically take? Each question has an answer in the simulated
distribution that the single realised path cannot supply.

> *Simulation turns one record into a distribution, and a distribution answers
> questions a single path cannot.*

The bootstrap works through a plug-in principle: the empirical distribution of
the observed returns is a consistent estimate of the true distribution, so
resampling from it approximates sampling from the process. That principle also
sets its hard limit. A bootstrap can recombine observed days in new orders, but
it cannot create a day more extreme than the most extreme day observed. Tail
risk beyond the record's own experience is invisible to it.

Institutional risk practice closes that gap with extreme value theory, which
models the tail directly, typically by fitting a generalised Pareto
distribution to losses beyond a high threshold and extrapolating from its
shape. The two methods are complements: the bootstrap preserves the record's
observed structure, and extreme value theory extends the tail beyond what the
record happened to contain.

Simulation also carries an error of its own, separate from the uncertainty it
measures. The standard error of an estimated one-in-twenty quantile falls with
the square root of the number of paths: 0.149 standard deviations at two
hundred paths, 0.067 at a thousand and 0.030 at five thousand. Figure 4.2 shows
the trade-off, and it explains why the illustrative fan of §02 uses two hundred
paths while the risk estimates of Lesson 15 use more.

**FIGURE 4.2 — Simulation error falls slowly** *(screenshot 10)*

- **What it shows:** a curve falling from about 0.30 at 50 paths and
  flattening towards zero by 10,000 paths, with the area under it shaded
  grey. The 200-path point is a green dot; the 1,000 and 5,000 points are
  grey dots.

- Curve of standard error, in standard deviations (y-axis 0 to 0.30), against
  simulated paths (logarithmic x-axis, 50 to 10,000).
- Annotations: "200 · 0.149"; "1,000 · 0.067"; "5,000 · 0.030"; "0.02" at
  10,000.
- Caption: *The standard error of an estimated one-in-twenty quantile, in
  standard deviations of the distribution, against the number of simulated
  paths.*
- Source tag: ANALYTIC · MODEL CALCULATION

> **IN THIS SERIES**
> The fan in §02 is this method applied to the Forecaster Portfolio: a
> stationary block bootstrap of its daily returns. Lesson 15 extends it to
> drawdowns, locating the realised drawdown within the simulated distribution
> and measuring how deep a drawdown the same returns could have produced in a
> different order.

**CHECKPOINT** — Why is the block bootstrap preferred to the ordinary bootstrap
for daily strategy returns?
- It produces higher returns
- It preserves volatility clustering and short-run dependence within each block
- It requires no data

---

## §05 · The Walkthrough

### The research *walkthrough*

*How the series follows one system from idea to validation, the institutional
validation process in full, and the lesson that takes each check to depth.*

The remainder of the series is a technical walkthrough of a single system, the
Forecaster Portfolio, from the ideas behind it to the validation of its record.
It follows the sequence in which systematic research proceeds, and each stage
applies the distributional view developed in this lesson.

**FIGURE 5.1 — The research walkthrough** *(screenshot 11)*

- **What it shows:** nine boxes in three columns of three, with a downward
  arrow between the boxes in each column. Read down each column, then left to
  right. Boxes 05 and 06 have green borders; the others are dark.

| Column 1 | Column 2 | Column 3 |
|---|---|---|
| 01 · Measurement — the record | 04 · Generalisation — stability of the rules | 07 · Dependence — portfolio structure |
| 02 · Significance — signal against noise | 05 · Out of sample — unseen data *(highlighted)* | 08 · Costs — gross to net |
| 03 · Search breadth — size of the search | 06 · Robustness — the spread of paths *(highlighted)* | 09 · Inference — what it supports |

- Caption: *The nine stages through which the series examines the Forecaster
  Portfolio, in the order systematic research proceeds.*
- Source tag: DIAGRAM

The ordering is also a research design. Each stage can fail in a way that is
diagnostic of a particular problem, and reading the pattern of passes and
failures is as informative as any single result. A result that is significant
but fails generalisation is the signature of overfitting; one that generalises
within the sample but fails on unseen data suggests a relationship that has
changed; one that survives the holdout but not the bootstrap is fragile to the
ordering of events, often a sign of dependence on a single episode; one that
survives everything before costs but not after is an edge too small to
implement.

Institutions formalise this discipline. In regulated banking, the Federal
Reserve's supervisory guidance on model risk, SR 11-7, requires the effective
challenge of models by parties independent of their development, together with
ongoing monitoring and analysis of outcomes. Systematic investment firms apply
the same principle through validation that is separate from research. The
rationale is statistical as much as organisational: a researcher who designs a
test after seeing the data has, in the phrase of Gelman and Loken, wandered a
garden of forking paths, in which undisclosed choices of specification inflate
the rate of false discoveries even when no formal multiple test was run.

A strong historical result is the beginning of validation, not the end of it.
Before a systematic macro or quantitative fund commits capital, a strategy
passes through a sequence of checks, each built to catch one specific way a
result can appear without a real edge behind it, and the result earns trust
only by surviving all of them. The process below is the one institutional
research teams apply. The rest of the series applies most of it to the
Forecaster Portfolio's own record, and each card names the lesson that takes
its check to full depth.

#### The institutional validation process

*(Shown as a grid of 12 cards, three per row, each headed with its number and
lesson(s); screenshots 11–12.)*

| # | Lesson(s) | Check | Description |
|---|---|---|---|
| 01 | Lesson 5 | **Point-in-time data** | Every input as it was known on the day, never as later revised; universes that keep the instruments that later disappeared; and every variable lagged by its publication delay, so that no rule can use information before it existed. A routine look-ahead check delays every input by a further day and confirms the result does not depend on exact alignment. |
| 02 | Lessons 7 and 14 | **In-sample and out-of-sample** | Rules are fitted on one span of data and judged on another that the fitting never touched. Walk-forward analysis repeats the split through the history, re-estimating on a rolling or expanding window and testing only on the period that follows, so that every test period is predicted by a model that could have existed at the time. |
| 03 | Lesson 14 | **The holdout and the lockbox** | Data set aside before research begins and examined once, with the system fixed; then a written protocol that limits how often the forward record may be examined, so that it never becomes another research sample. |
| 04 | Lesson 13 | **Cross-validation for time series** | Ordinary cross-validation leaks information because returns overlap in time. Purging removes training observations that overlap the test period and an embargo removes a buffer after it; combinatorially symmetric cross-validation turns many splits into the probability of overfitting. |
| 05 | Lessons 4 and 12 | **Multiple testing** | Every additional trial raises the best result by chance alone. The deflated Sharpe ratio, a higher significance hurdle, White's Reality Check, Hansen's test for superior predictive ability and Romano and Wolf's stepdown procedure each price the search. |
| 06 | Lesson 11 | **Significance and precision** | Whether the mean return is distinguishable from zero once skewness, fat tails and dependence are allowed for: the t-statistic, the probabilistic Sharpe ratio and the minimum track record length. |
| 07 | Lesson 13 | **Parameter stability** | Whether the result survives changes to its settings. A peak that collapses when a parameter moves is fitted noise; a plateau of neighbouring settings with similar results is structure. |
| 08 | Lessons 1 and 15 | **Path robustness** | Whether the record depends on the order in which its days arrived: block bootstrap resampling, permutation and placebo tests, and tests for memory in the returns. |
| 09 | Lessons 6 and 10 | **Regimes and stress** | How the system behaves across market environments and through the market's worst periods, and whether its diversification holds when correlations rise. |
| 10 | Lesson 16 | **Forward evidence** | Paper or shadow trading before capital is committed, the statistical power to detect a fading edge, and monitoring rules that flag a change as early as the data allow. |
| 11 | Lesson 4 | **Costs and capacity** | Whether the edge survives transaction costs, market impact and the scale at which it would be traded. A later costing module applies this to the record itself. |
| 12 | Lesson 17 | **A procedure for any record** | The whole process assembled into steps that apply to any strategy, whether it is assessed by the researcher who built it or by an allocator considering it. |

Module 4, Lessons 11 to 16, is the series' validation module, and it takes
these checks to full depth on the Forecaster Portfolio's own record:
significance in Lesson 11, the search in Lesson 12, parameter stability and the
probability of overfitting in Lesson 13, the one-shot holdout in Lesson 14, the
ordering of the record's days in Lesson 15 and the power to detect decay in
Lesson 16. Lesson 5 covers the data checks that come before any of them, and
Lesson 17 turns the process outward, as a procedure for any record.

Three parts of the process are described here but not applied to the record.
Walk-forward retraining and purged cross-validation test how a model is fitted,
and the Forecaster Portfolio is examined as a finished system with its rules
fixed; paper or shadow trading belongs to the period after research. The
series' substitutes are the one-shot holdout of Lesson 14 and the forward
record of Lesson 16.

The stages are ordered so that each builds on the last. Measurement
characterises the realised path. Significance and search breadth establish
whether the measured edge is distinguishable from the variation that sampling,
and research itself, would produce without one. Generalisation and the holdout
test whether the rules perform beyond the data that shaped them, and robustness
maps the full distribution of paths the system could have produced. Dependence,
costs and inference complete the picture: the structure of the portfolio, the
effect of implementation, and what the record supports about the future.

The combination is more informative than any single stage. In Bayesian terms,
each test contributes a likelihood ratio: the probability of its result if the
edge is present, relative to the probability if it is absent. Where tests
examine independent aspects of the process, those ratios multiply, and
conviction accumulates across them.

> *Conviction accumulates across independent tests, each examining a different
> aspect of the process.*

**FIGURE 5.2 — Conviction from agreement** *(screenshot 13)*

- **What it shows:** three rising lines that all start at 4% at zero tests.
  The green line (likelihood ratio 16) shoots up and is near 100% by 3 tests.
  The navy line (ratio 4) rises in an S-shape and approaches 100% by 5 tests.
  The grey line (ratio 2) rises slowly, reaching only just under 60% by 5
  tests. The area under the green line is shaded.

- Lines of probability of a real edge (y-axis 0% to 100%) against independent
  tests passed (x-axis 0 to 5), for likelihood ratios 16, 4 and 2, all from a
  base rate of 4%.
- Annotations on the likelihood-ratio-16 line: "40%" after 1 test, "91%" after
  2 tests, "1.00%" label at 5 tests (as shown).
- Caption: *The probability of a real edge against the number of independent
  tests passed, from a base rate of 4%, for three likelihood ratios.*
- Source tag: ANALYTIC · BAYES' RULE

Working in log-odds makes the arithmetic additive: each independent test adds
the logarithm of its likelihood ratio to the log-odds of a real edge. Figure
5.2 traces the consequence from a base rate of 4%. A test with a likelihood
ratio of sixteen lifts the probability to 40% and a second to 91%; weaker
tests, with ratios of four or two, need several passes to reach the same
conviction.

The addition holds only when the tests are independent. Tests that probe the
same feature of the data, such as two significance tests on overlapping
samples, carry overlapping evidence, and treating their likelihood ratios as
independent overstates the case. Lessons 6 and 12 formalise the same principle
for correlated strategies and correlated trials; the stages of this series are
designed to examine distinct aspects of the record precisely so that their
evidence compounds.

**CHECKPOINT** — Why does the series evaluate the Forecaster Portfolio through
several stages rather than one statistic?
- Each stage examines a different aspect of the process, and their agreement
  is more informative than any one
- More statistics always raise the Sharpe ratio
- A single statistic cannot be computed

---

## §06 · Paths

### Ensemble and *time* averages

*Why the average across possible paths can differ from the experience along any
one of them.*

Everything so far has treated the distribution of paths as the object of
interest. An investor, however, experiences one path, not the average of many.
When returns compound, the two perspectives can diverge sharply, and the
divergence is one of the most consequential ideas in quantitative finance: the
expected value across paths, the ensemble average, need not describe the growth
along a typical path, the time average.

A simple gamble shows the effect. Each round, wealth rises by 50% or falls by
40% with equal probability. The expected change per round is +5%, so the
average across many players grows steadily. But a win followed by a loss
multiplies wealth by 1.5 × 0.6 = 0.9, so the typical player's wealth changes by
−5.13% per round. After forty rounds the average across players has grown to
about 7.0 times its starting value, while the median player holds about 0.12 of
theirs, and about 79% of players have lost money. The average is carried by a
vanishing minority of very fortunate paths.

**FIGURE 6.1 — The average and the typical path** (animated, stepped) *(screenshots 14–15)*

- **What it shows:** a diamond-shaped lattice of thin zig-zag lines, each
  zig-zag one player's wealth moving up 50% or down 40% each round, fanning
  out from 1× on a log scale. In step 4, the green average line rises above
  the starting-wealth line while the red typical-player line falls below it.
  The histogram on the right shows final wealth: grey-blue bars above 1× and
  larger pink-red bars below 1×.

- Chart: wealth as a multiple of the start (logarithmic y-axis, 0.01× to 100×)
  against rounds played (0 to 40), with a lattice of possible paths and a
  dashed "Starting wealth" line at 1×.
- Step 2 title: "2 · The average across players grows by 5% a round" — green
  line labelled "The average · 7.0× by round 40, carried by a few very lucky
  players", ending at **7.04**.
- Step 4 title: "4 · After 40 rounds, 79% of players are below their start" —
  adds red line "The typical player · 0.12×, shrinking −5.13% a round", and a
  right-hand histogram "Final wealth, exact" with "79% below 1×".
- Stats strip: **AVERAGE AFTER 40 ROUNDS** 7.0× · **TYPICAL PLAYER** 0.12× ·
  **PLAYERS BELOW THEIR START** 79%
- (Steps 1 and 3 were **[not captured]**.)
- Caption: *A gamble that gains 50% or loses 40% with equal probability. The
  average across players grows; the typical player declines.*
- Source tag: ANALYTIC · MODEL CALCULATION

**05 · GROWTH ALONG A PATH — Volatility drag and the Kelly criterion**

    g ≈ μ − ½σ²,      f* = μ / σ²

*Takeaway:* Along a single compounding path, growth is approximately the
expected return less half the variance. It is maximised by risking the fraction
μ/σ² of wealth, the Kelly criterion.

The general result is volatility drag. For returns with arithmetic mean μ and
volatility σ, growth along a path is approximately μ − σ²/2. Figure 6.2 plots
it for an expected return of 10%: at 20% volatility the path grows at about 8%,
and at 44.7% volatility growth vanishes altogether although the expected return
is unchanged. Under compounding, volatility is not merely a measure of
discomfort; it is a direct cost to growth.

The same mathematics prescribes how much to risk. The Kelly criterion chooses
the fraction of wealth that maximises growth along the path. For the gamble
above, risking a quarter of wealth each round turns the typical player's
decline into growth of about 0.62% per round, and risking half that fraction, a
common institutional choice, retains about 75% of that growth, 0.47% per round,
with far smaller swings. Institutions size below Kelly for this reason: the
growth given up is small, and the reduction in drawdowns and in sensitivity to
estimation error is large.

**FIGURE 6.2 — Volatility drag** *(screenshots 15–16)*

- **What it shows:** a curve that starts at +10% growth at 0% volatility
  (touching the dashed 10% expected-return line) and bends ever more steeply
  downwards as volatility rises. It crosses the 0% line at 44.7% (red dot)
  and ends below zero at 60%.

- Curve of growth rate along a path (y-axis −10% to +10%) against volatility
  (x-axis 0% to 60%), dashed line "Expected return, 10%".
- Annotations: "20% · +8.0%"; "Zero growth at 44.7%" (red); "−0.08%" at 60%
  (as shown).
- Caption: *Growth along a single compounding path against volatility, for an
  expected return of 10%.*
- Source tag: ANALYTIC · MODEL CALCULATION

Estimation error sharpens the case for caution. For a continuous process, the
growth achieved by risking a multiple λ of the Kelly fraction is λ − λ²/2 of
the maximum: half Kelly earns three quarters of the maximum growth, full Kelly
all of it, and twice Kelly earns nothing at all, with ruinous volatility
beyond. Because the Kelly fraction depends on the estimated edge, and §03
showed that even a long record estimates the edge with considerable error, an
investor who overestimates the edge by a factor of two is, in effect, betting
twice Kelly. Fractional Kelly is therefore a hedge against the investor's own
estimation error as much as a concession to drawdown tolerance.

The macroeconomic environment enters through σ. The optimal fraction μ/σ² falls
with the square of volatility, so when volatility doubles, as it does when
markets move from calm to stress, the growth-optimal exposure falls to a
quarter. Scaling exposure inversely to forecast volatility, the practice known
as volatility targeting, is the direct application, and it is the bridge to the
layered structure of the Forecaster Portfolio described in Lesson 3. Figure 6.3
shows the whole trade-off at once, as a surface that can be turned and
inspected.

**FIGURE 6.3 — The growth surface** (interactive 3D) *(screenshot 16)*

- **What it shows:** a tilted 3D surface coloured from yellow (high growth)
  through green and teal to dark navy (strongly negative growth). Growth is
  highest (yellow) at low volatility and high exposure, and turns dark navy at
  high volatility and high exposure. Three curves cross the surface: half
  Kelly (dashed white), Kelly (solid white) and zero growth at 2μ/σ² (coral).
  A colour bar on the left runs from −30 to +25 (% a year).

- Header: "Beyond the coral line, twice Kelly, growth is negative although the
  expected return is positive"
- Axes: volatility (10% to 50%), exposure (× capital, 0× to 3×), growth (% a
  year, colour scale −30 to +25).
- Lines on the surface: "half Kelly" (dashed white), "Kelly μ/σ²" (white),
  "zero growth 2μ/σ²" (coral).
- Caption and any text between the figure and the next paragraph:
  **[not captured]**

These ideas account for several choices elsewhere in the series. Lesson 8
reports the Forecaster Portfolio's returns on a simple, non-compounded basis,
which states the edge without assumptions about reinvestment. The attention
given to drawdowns throughout reflects the time-average view: a strategy is
lived along one path, and the depth and duration of its declines are properties
of that path, not of the ensemble. And the sizing of any real allocation is a
Kelly-style problem, in which the estimated edge, its uncertainty from §03 and
the tolerance for drawdown jointly determine how much to commit.

> *An investor lives one path. Growth along it is the expected return less half
> the variance.*

The next lesson turns to the research process itself: how a search for
systematic edges is organised, why its duration resists scheduling, and how its
breadth shapes the evidence it produces.

**CHECKPOINT** — A gamble has a positive expected value per round. Why can the
typical player still lose money over many rounds?
- The expected value has been calculated incorrectly
- Under compounding, growth along a path is the expected return less half the
  variance, which can be negative
- The gamble has no variance

> **NEXT · LESSON 02 — Why Research Has No Timetable**
> How a systematic research programme is organised, why its duration resists
> scheduling, and how the breadth of the search shapes the evidence it
> produces.

---

## Appendix · Glossary and Sources

### Terms and *sources*

| Term | Definition |
|---|---|
| Stochastic process | A model of a quantity that evolves randomly through time; a strategy's returns are one. |
| Realisation | One observed path of a stochastic process. |
| Sampling distribution | The distribution of an estimate across the paths a process could produce. |
| Standard error | The standard deviation of a sampling distribution. |
| Monte Carlo simulation | Estimating a distribution by generating many random paths and computing a statistic on each. |
| Bootstrap | Simulation by resampling observed data with replacement. |
| Block bootstrap | A bootstrap that resamples runs of consecutive observations to preserve their dependence. |
| Maximum drawdown | The largest fall from a previous high along a path. |
| Ensemble average | The average outcome across many possible paths. |
| Time average | The growth experienced along a single path through time. |
| Volatility drag | The reduction in compound growth caused by variance, approximately σ²/2. |
| Kelly criterion | The fraction of wealth to risk that maximises growth along a path, μ/σ² for small bets. |
| Bayesian shrinkage | Pulling a noisy estimate towards a prior mean in proportion to its noise. |
| Extreme value theory | The statistics of the tails of distributions, beyond the observed data. |
| Point-in-time data | Data as it was known on each date, before later revisions, with every input lagged by its publication delay. |
| Walk-forward analysis | Repeated fitting on a rolling or expanding window, each fit tested only on the period that follows. |
| Purging and embargo | Removing training observations that overlap a test period, and a buffer after it, so time-series cross-validation does not leak. |
| Probability of overfitting | The share of in-sample selections that rank below the median out of sample, estimated across many splits of the data. |

### Sources

- Lo (2002). The Statistics of Sharpe Ratios, Financial Analysts Journal 58(4).
- Efron (1979). Bootstrap Methods: Another Look at the Jackknife, Annals of Statistics 7(1).
- Künsch (1989). The Jackknife and the Bootstrap for General Stationary Observations, Annals of Statistics 17(3).
- Politis and Romano (1994). The Stationary Bootstrap, Journal of the American Statistical Association 89(428).
- Politis and White (2004). Automatic Block-Length Selection for the Dependent Bootstrap, Econometric Reviews 23(1).
- Opdyke (2007). Comparing Sharpe Ratios: So Where Are the P-Values?, Journal of Asset Management 8(5).
- Kelly (1956). A New Interpretation of Information Rate, Bell System Technical Journal 35(4).
- Embrechts, Klüppelberg and Mikosch (1997). Modelling Extremal Events for Insurance and Finance, Springer.
- Peters (2019). The Ergodicity Problem in Economics, Nature Physics 15.
- Board of Governors of the Federal Reserve System (2011). Supervisory Guidance on Model Risk Management, SR 11-7.
- Gelman and Loken (2013). The Garden of Forking Paths, Department of Statistics, Columbia University.
- White (2000). A Reality Check for Data Snooping, Econometrica 68(5).
- Hansen (2005). A Test for Superior Predictive Ability, Journal of Business and Economic Statistics 23(4).
- Romano and Wolf (2005). Stepwise Multiple Testing as Formalized Data Snooping, Econometrica 73(4).
- Harvey, Liu and Zhu (2016). … and the Cross-Section of Expected Returns, Review of Financial Studies 29(1).
- Bailey and López de Prado (2014). The Deflated Sharpe Ratio, Journal of Portfolio Management 40(5).
- Bailey, Borwein, López de Prado and Zhu (2017). The Probability of Overfitting in Historical Strategy Evaluation, Journal of Computational Finance 20(4).
- López de Prado (2018). Advances in Financial Machine Learning, Wiley.

*Educational content only. Not financial advice.*
