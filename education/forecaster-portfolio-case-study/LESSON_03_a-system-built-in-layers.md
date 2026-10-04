# Case Study: The Forecaster Portfolio — Lesson 03 of 17

## A System Built in *Layers*

> **Source:** Colez Trades (cog) education, "Case Study: The Forecaster
> Portfolio". Module 02 · The System. Case Study · Lesson 03 of 17 (CS · 03).
> Page: cog000.github.io/Forecaster-Portfolio-Case-Study/lesson-03/
>
> **Transcription note:** copied from phone screenshots of the lesson, taken
> 2026-10-04. Nothing has been added or inferred. The original screenshots are
> kept in `screenshots/lesson-03/`: 01–10 are the page in order, and 11–15 are
> landscape close-ups of formula boxes 01–05. Each figure below names the
> screenshot it appears in and is described in words (axes, lines, colours,
> labels, caption), as shown. Where something was not visible it is marked
> **[not captured]**. Checkpoint answers are listed as shown; the lesson did
> not mark a correct answer in the screenshots.

>
> **Gaps filled from the live page (2026-10-04):** the parts the screenshots
> missed were later read from the decrypted lesson page itself. Each such part
> is marked *(from page)*. Only text shown on the page was used.

*Systematic strategies separate what can be forecast from how to act on it. The
theory of that separation explains why volatility, not direction, is the
natural object of forecasting, and how a forecast becomes a decision.*

### The architecture of *layers*

*Why systematic strategies separate forecasting from decision.*

| | |
|---|---|
| Series | Case Study: The Forecaster Portfolio |
| Subject | Layered systematic design |
| Method | Fundamental law, volatility models, volatility targeting |
| Reading time | About 25 minutes |

A systematic strategy is rarely a single rule. It is a stack of layers, each
with a distinct job: forecasting the quantities that can be forecast,
combining those forecasts into positions, and managing the resulting portfolio
through time. The separation is not an engineering convenience. It follows
from the mathematics of active management, in which skill, breadth and
implementation enter as separate factors that can be measured and tested one
at a time.

This lesson develops that architecture in general terms. It shows why the
volatility of returns is far more forecastable than their direction, how
volatility clusters and how prices jump, with the mathematics of each, how a
forecast of risk becomes a decision about exposure and why that raises the
risk-adjusted return, and how a layered design turns validation into a
sequence of separate tests. The Forecaster Portfolio is organised in seven
layers. The third is devoted to volatility forecasting and another applies
meta-labelling; the remaining layers are proprietary. This lesson describes
the architecture, not the contents of any layer, and every demonstration uses
simulated or analytic markets.

---

## §01 · Architecture

### Why systems are built in *layers*

*Separating what can be forecast from how to act on it.*

A trading strategy has to answer two different questions. The first is
informational: what, if anything, can be predicted about the future
distribution of returns? The second is decisional: given whatever can be
predicted, what positions should be held? Early systematic strategies often
fused the two into a single rule, a signal that was also a position. Modern
practice separates them, and the separation is one of the defining features of
institutional systematic design.

The logic is the same as in any complex engineered system. A layered design
gives each layer one job, specifies what passes between layers, and allows
each to be developed, tested and replaced without disturbing the others. In a
systematic strategy the natural layers are forecasting, which estimates
quantities about the future; portfolio construction, which turns forecasts
into positions under constraints; and management, which governs the portfolio
through time. Figure 1.1 shows the Forecaster Portfolio's own arrangement in
the abstract: seven layers, stacked.

The Forecaster Portfolio is built this way, in seven layers. The third layer
is devoted to volatility forecasting. Another applies meta-labelling, a
technique introduced by López de Prado in which a secondary model learns, from
the history of a primary model's decisions, when those decisions are likely to
be right, and so separates the question of which way to bet from the question
of whether, and how much, to act. The remaining layers are proprietary. That
is the extent of what this series describes about any of its layers; the rest
of this lesson develops the general theory that explains why such an
architecture is used.

**FIGURE 1.1 — Seven layers** *(screenshot 02)*

- **What it shows:** a vertical stack of seven rounded boxes, Layer 7 at the
  top down to Layer 1 at the bottom:
  - Layer 7 · proprietary
  - Layer 6 · proprietary
  - Layer 5 · proprietary
  - Layer 4 · proprietary
  - **Layer 3 · Volatility forecasting** (green border and green text, the
    only highlighted layer)
  - Layer 2 · proprietary
  - Layer 1 · proprietary
- To the right, a separate green-bordered box not attached to any layer:
  **"Also among the seven"**, sub-label "meta-labelling".
- **Caption:** *The Forecaster Portfolio's seven layers. The third is
  volatility forecasting and meta-labelling is another; the rest are
  proprietary, and nothing further about any layer is described.*
- *(from page)* Source tag: DIAGRAM

The mathematical case for layers comes from the fundamental law of active
management, due to Grinold. It states that the information ratio of an active
strategy, its excess return per unit of active risk, is approximately the
product of the information coefficient, the correlation between forecasts and
subsequent outcomes, and the square root of breadth, the number of independent
forecasts acted on each year. Modest skill applied to many independent bets
can match great skill applied to few.

Clarke, de Silva and Thorley extended the law with a third factor, the
transfer coefficient: the correlation between the positions a strategy would
hold if it could act on its forecasts without restriction and the positions it
actually holds. Constraints, costs and the practicalities of implementation
all pull it below one, and the information ratio falls in proportion.

**01 · ACTIVE MANAGEMENT — The fundamental law with the transfer coefficient**
*(screenshots 03, 11)*

    IR ≈ TC · IC · √BR

*Takeaway:* The information ratio is approximately the product of
implementation efficiency (TC), forecasting skill (IC) and the square root of
the number of independent bets a year (BR).

Figure 1.2 makes the law concrete. With skill of 0.05 per bet, a hundred
independent bets a year produce an information ratio of about 0.5; with skill
of 0.10 the same breadth produces 1.0. A transfer coefficient of 0.6 scales
every curve down in proportion, so the strategy with skill of 0.05 and a
hundred bets delivers 0.3. The three factors are separable, and that is
precisely why a layered design is useful: skill belongs to the forecasting
layers, breadth to the structure of the opportunity set, and the transfer
coefficient to construction and management.

**FIGURE 1.2 — Skill, breadth and implementation** *(screenshots 03–04;
animated, stepped)*

- **What it shows:** information ratio (y-axis 0 to 2.0) against breadth,
  independent bets a year (logarithmic x-axis, 1 to 400). Curves rise slowly
  at first and steeply towards 400 bets.
- **Step 2 — "2 · Skill of 0.02 and 0.10 bracket it":** three curves. Green
  (top, skill 0.10 per the step title) reaches 2.0 at 400. Navy (middle)
  reaches 1.0 at 400 and is marked at 100 bets: "Skill 0.05, 100 bets ·
  information ratio 0.50". Grey (bottom, skill 0.02 per the step title)
  reaches about 0.4 at 400. The areas between the curves are lightly shaded.
- **Step 3 — "3 · A transfer coefficient of 0.6 scales every curve down:
  implementation costs skill":** adds a red curve below the navy one, marked
  at 100 bets "Transfer coefficient 0.6 · information ratio 0.30". The gap
  between the navy and red curves is shaded pink.
- *(from page)* Step 1: "Skill of 0.05 per bet: the information ratio grows
  with the square root of breadth".
- **Caption:** *The information ratio against breadth for three degrees of
  skill, then scaled down by a transfer coefficient of 0.6. The shaded gap is
  the cost of implementation.*
- Source tag: ANALYTIC · THE FUNDAMENTAL LAW

Separability matters most for validation. A strategy judged only by its final
returns confounds the three factors: a poor result could reflect weak
forecasts, too few independent bets or losses in implementation, and a good
result could conceal a weak layer compensated by a strong one. When the layers
are distinct, each can be tested against its own standard. Forecasts can be
compared with outcomes directly, construction can be assessed by how much of
the forecasts' value survives into positions, and management by how the
portfolio behaves under stress.

The architecture also shapes how a strategy evolves. A better forecast of one
quantity can be introduced without redesigning the decision layers, and a
change to construction can be evaluated with the forecasts held fixed. In a
research programme of the kind described in Lesson 2, where most directions
fail, the ability to change one layer at a time is what keeps the search
tractable.

> *Skill, breadth and implementation enter as separate factors. A layered
> design lets each be tested on its own.*

**CHECKPOINT** — Under the fundamental law, a strategy doubles its number of
independent bets while its skill per bet is unchanged. What happens to its
information ratio?
- It doubles
- It rises by a factor of about 1.41
- It is unchanged

---

## §02 · Predictability

### What can be *forecast*

*Why the direction of returns is nearly unpredictable and their volatility is
not.*

The first question for any forecasting layer is what is worth forecasting. For
the direction of returns, decades of research give a sobering answer. In
liquid markets the part of next-day returns that can be predicted from past
information is a very small fraction of their variance, typically well under
one per cent. Prices that were easily predictable would be traded until they
were not; competition drives the predictable component of returns towards
zero.

Volatility behaves differently. Mandelbrot observed in 1963 that large price
changes tend to be followed by large changes, of either sign, and small
changes by small ones. Engle's autoregressive conditional heteroskedasticity
model of 1982, and Bollerslev's generalisation of 1986, gave this clustering a
precise form: the variance of tomorrow's return depends on the size of recent
returns and on recent variance. Trading on the clustering does not remove it,
so it persists across markets and decades.

**02 · VOLATILITY DYNAMICS — The GARCH(1,1) variance equation**
*(screenshots 05, 12)*

    σ²_{t+1} = ω + α r²_t + β σ²_t

*Takeaway:* Tomorrow's variance combines a long-run constant, today's squared
return and today's variance. The persistence α + β governs how long a shock to
volatility lasts.

Figure 2.1 shows ten years of a simulated market generated by exactly this
process, with parameters typical of published estimates: α of 0.08, β of
0.90, and so a persistence of 0.98. Each day's return is drawn at random, yet
the picture is far from uniform. Calm stretches, in which every move is small,
alternate with turbulent clusters in which large moves arrive together. The
shaded envelope, twice the conditional volatility either side of zero, makes
the regimes visible.

**FIGURE 2.1 — Volatility clusters** *(screenshots 05–06; animated, stepped)*

- **What it shows:** ten years of simulated daily returns (y-axis −6% to +6%;
  x-axis 0 to 10 years) drawn as dense thin grey-teal vertical spikes around a
  0% line. A pale green envelope runs either side of zero, narrow in some
  stretches and wide in others. Most spikes stay within about ±3%, with
  larger spikes bunched together, for example around years 6–7 and at the
  far right near year 10.
- **Step 2 — "2 · Twice the conditional volatility either side: calm and
  turbulent regimes":** the spikes with the green envelope.
- **Step 3 — "3 · Large moves follow large moves; small moves follow small
  ones":** adds two labels, "A calm stretch" pointing to a narrow part of the
  envelope around year 2.5, and "A turbulent cluster" (green) pointing to the
  wide, spiky end near year 10.
- *(from page)* Step 1: "Ten years of simulated daily returns".
- **Caption:** *Ten years of simulated daily returns from a GARCH(1,1)
  process, with twice the conditional volatility shaded either side of zero.*
- Source tag: SIMULATION · GARCH(1,1), FIXED SEED

The contrast between direction and volatility can be measured directly with
the autocorrelation function, the correlation of a series with its own past.
For the simulated returns, the autocorrelation at a lag of one day is +0.006:
yesterday's return says essentially nothing about the sign of today's. For the
absolute returns, a simple measure of volatility, it is 0.17 at a lag of one
day and still 0.11 after twenty days, fading to 0.02 after sixty. Figure 2.2
plots both functions: one flat at zero, the other decaying slowly.

The same contrast holds in real markets, where it is one of the most robust
empirical regularities in finance: measured volatility shows strong
persistence across horizons from days to months, while measured returns show
almost none.

**FIGURE 2.2 — Direction has no memory; volatility does** *(screenshot 06)*

- **What it shows:** autocorrelation (y-axis −0.05 to 0.20) against lag in
  days (x-axis 1 to 60), two jagged lines.
  - **Absolute returns: volatility** (green) starts high, "Absolute returns ·
    0.17" at lag 1, bounces around 0.08–0.15 over the first 20 lags ("lag 20 ·
    0.11"), then drifts lower with ups and downs, ending at "0.02" at lag 60.
    The area under it is shaded green.
  - **Returns: direction** (navy) starts at "Returns · +0.006" at lag 1 and
    zig-zags either side of zero all the way across, roughly between −0.04 and
    +0.06.
  - A faint label "No memory" sits on the zero line at the right.
- **Caption:** *Autocorrelation of simulated daily returns and of their
  absolute values, lags 1 to 60.*
- Source tag: SIMULATION · GARCH(1,1), FIXED SEED

Persistence has a natural summary in the half-life of a shock: the number of
days until half of an unexpected rise in variance has decayed. For a GARCH
process it is ln ½ divided by the logarithm of the persistence. At a
persistence of 0.94 a shock halves in about 11.2 days; at 0.98, the value in
the simulated market, in about 34.3 days; at 0.99, in about 69.0 days. Figure
2.3 shows how steeply the half-life rises as persistence approaches one, and
why a turbulent spell, once begun, tends to last.

**03 · PERSISTENCE — The half-life of a volatility shock**
*(screenshots 06–07, 13)*

    h = ln(½) / ln(α + β)

*Takeaway:* The time for half of a shock to variance to decay. It lengthens
without limit as the persistence α + β approaches one.

**FIGURE 2.3 — How long a shock lasts** *(screenshot 07)*

- **What it shows:** half-life (logarithmic y-axis, 1 to 100+ days) against
  persistence α + β (x-axis 0.90 to 0.99+). The curve starts at just under 10
  days at 0.90, rises gently, then bends sharply upwards near the right-hand
  end. The area under it is shaded grey.
- **Markers:** "0.94 · 11.2 days"; "0.98 · 34.3 days" (green); "0.99 · 69.0
  days"; end label "138".
- **Caption:** *The half-life of a shock to variance against the persistence
  of the process, on a logarithmic scale.*
- Source tag: ANALYTIC · GARCH(1,1)

Why should volatility be forecastable when direction is not? The answer lies
in what traders can do with each. A predictable return is an arbitrage: buying
what will rise removes the predictability. A predictable volatility is not an
arbitrage in the same sense, because knowing that tomorrow will be turbulent
does not reveal which way prices will move. Clustering reflects the arrival of
information in bursts, the behaviour of leveraged participants and the
persistence of uncertainty itself, and none of these is removed by
forecasting it.

The implication for system design is that volatility has persistent,
measurable structure. Structure of that kind is valuable because it bears on
how much to hold rather than on which way to bet.

> *Direction is close to unpredictable. Volatility clusters, and the
> clustering persists.*

**CHECKPOINT** — The autocorrelation of daily returns is near zero, while that
of absolute returns is clearly positive for many lags. What does this show?
- Returns are predictable in direction
- The size of moves can be forecast even though their sign cannot
- Volatility is constant

---

## §03 · Jumps

### Clusters and *jumps*

*The mathematics of how risk arrives: continuously, and all at once.*

Clustering describes how the size of moves persists. It does not describe how
moves arrive. Some of the most consequential price changes do not unfold over
days; they happen at once, when news, a policy decision or a sudden loss of
liquidity moves prices discontinuously. A model of risk built only from
continuous diffusion cannot produce such moves, and it misstates both the
shape of the tails and the way losses are experienced.

Merton's jump-diffusion model of 1976 adds discontinuities to the continuous
process. Between jumps, prices diffuse as in the standard model, driven by
Brownian motion. Jumps arrive as a Poisson process at rate λ, and at each
arrival the price is multiplied by a random factor J whose logarithm is
normally distributed. The drift is compensated by λκ, the expected
proportional jump, so that jumps change the shape of the distribution without
changing its expected return.

**04 · JUMP DIFFUSION — Merton's jump-diffusion model** *(screenshots 08, 14)*

    dS_t / S_{t−} = (μ − λκ) dt + σ dW_t + (J − 1) dN_t,      ln J ~ N(μ_J, σ_J²)

*Takeaway:* Continuous diffusion plus Poisson-arriving jumps with lognormal
size; κ = E[J − 1] compensates the drift.

Figure 3.1 shows what jumps do to a path. Both paths share the same continuous
shocks, drawn from a diffusion with 12% annual volatility. The second adds
jumps at a rate of 5 a year, with log sizes averaging −2% and a standard
deviation of 4%, and over ten years it experiences 44 of them. Most of the
time the two paths move together; at each jump they separate abruptly, and the
separation never closes. With these parameters jumps contribute 41% of total
variance, which rises to 15.6% a year.

**FIGURE 3.1 — A path with jumps** *(screenshot 08; animated, stepped)*

- **What it shows:** cumulative log return (y-axis −40% to +20%+) against
  years (x-axis 0 to 10), two jagged paths, one navy and one red, plus a 0%
  line. The two paths track each other closely in shape but sit apart, with
  shaded areas between them. Both rise to around +10–20% in the first years,
  move sideways to about year 6, then fall sharply near year 6 and keep
  declining to about −40% by year 10.
- *(from page)* **Navy is the pure diffusion; red is the same shocks plus
  jumps.** All three steps:
  1. "A pure diffusion: continuous shocks at 12% annual volatility" (navy
     path only)
  2. "The same shocks, plus jumps at five a year: the paths separate
     abruptly" (adds the red path; this is the step in the screenshot)
  3. "44 jumps in ten years carry 41% of total variance". Adds two red labels
     on the jump path: "A jump of −10.0%" at about year 3.4, and "A jump of
     −7.5%" at about year 8.3.
- **Caption:** *The same continuous shocks with and without jumps, over ten
  simulated years.*
- Source tag: SIMULATION · MERTON JUMP DIFFUSION, FIXED SEED

The moments make the mechanism exact. Jumps add λ(μ_J² + σ_J²) to the
variance rate, and their fourth cumulant produces excess kurtosis that falls
in proportion to the length of the horizon, because both cumulants grow with
time while the kurtosis divides one by the square of the other. For the
parameters above, the excess kurtosis of daily returns is about 24.7, of
monthly returns about 1.18 and of annual returns about 0.10. Figure 3.2 shows
the decline: jumps dominate the shape of short-horizon returns and wash out
over long ones, the aggregation effect Lesson 1 described for skewness, now
with a precise cause.

**05 · MOMENTS — Variance and excess kurtosis of a jump diffusion**
*(screenshots 09, 15)*

    Var = (σ² + λ(μ_J² + σ_J²)) Δt,      κ_ex = λ(μ_J⁴ + 6μ_J²σ_J² + 3σ_J⁴) / [ (σ² + λ(μ_J² + σ_J²))² Δt ]

*Takeaway:* Jumps add to the variance rate; the excess kurtosis they create
falls as one over the horizon.

**FIGURE 3.2 — Fat tails thin with horizon** *(screenshot 09)*

- **What it shows:** excess kurtosis (logarithmic y-axis, 0.1 to 10+) against
  horizon (logarithmic x-axis: 1 day, 1 week, 1 month, 1 year), a single
  straight line sloping down from top left to bottom right, with the area
  under it shaded grey.
- **Markers:** "1 day · 24.7" (red); "1 month · 1.18"; "1 year · 0.10".
- **Caption:** *Excess kurtosis of jump-diffusion returns against the
  horizon, both on logarithmic scales.*
- Source tag: ANALYTIC · MERTON JUMP DIFFUSION

Why is this structure so valuable? Because it changes what risk is. Diffusive
risk accumulates smoothly: it scales with the square root of time and can be
managed continuously, by adjusting exposure as it evolves. Jump risk arrives
all at once. It cannot be traded out of as it happens, it passes through stop
orders at prices beyond their limits, and it concentrates losses into moments
when liquidity is scarce. A portfolio sized on volatility alone understates
the loss it can suffer in a single step; one that recognises the jump
component sizes for both. The same structure explains why option markets
price skews and smiles, why tail-risk estimates need more than a volatility
figure, and why diversification weakens when jumps strike many markets at
once, the subject of Lesson 6.

> *Diffusive risk can be managed as it accumulates. Jump risk arrives all at
> once, and has to be allowed for in advance.*

**CHECKPOINT** — Why does the excess kurtosis of a jump diffusion fall as the
horizon lengthens?
- Because jumps become smaller over time
- Because both cumulants grow in proportion to time, and kurtosis divides the
  fourth by the square of the second
- Because volatility clustering disappears

> **NEXT · LESSON 04 — Why the Logic Stays Private**
> The economics of proprietary logic: how edges decay when they are shared,
> why capacity is finite, and how evidence can be shown without the recipe.

*(Note: the introduction mentions how a forecast of risk becomes a decision
about exposure and how a layered design turns validation into a sequence of
separate tests. Checked against the page: its section menu lists only
Architecture, Predictability, Jumps and Glossary, so nothing was missed. The
lesson as published ends after §03.)*

---

## Appendix · Glossary and Sources

### Terms and *sources*

| Term | Definition |
|---|---|
| Fundamental law of active management | IR ≈ IC·√BR: the information ratio as skill times the square root of breadth. |
| Transfer coefficient | The correlation between unconstrained and actual positions; the efficiency of implementation. |
| Volatility clustering | The tendency of large moves to follow large moves and small moves small ones. |
| GARCH | A model in which tomorrow's variance depends on recent squared returns and recent variance. |
| Half-life | The time for half of a shock to decay. |
| Jump diffusion | A continuous diffusion with discontinuous jumps arriving as a Poisson process. |
| Excess kurtosis | Tail weight beyond that of a normal distribution. |
| Meta-labelling | A secondary model that learns when a primary model's decisions are likely to be right, separating the direction of a bet from whether and how much to act. |

### Sources

- Grinold (1989). The Fundamental Law of Active Management, Journal of Portfolio Management 15(3).
- Clarke, de Silva and Thorley (2002). Portfolio Constraints and the Fundamental Law of Active Management, Financial Analysts Journal 58(5).
- Mandelbrot (1963). The Variation of Certain Speculative Prices, Journal of Business 36(4).
- Engle (1982). Autoregressive Conditional Heteroscedasticity with Estimates of the Variance of United Kingdom Inflation, Econometrica 50(4).
- Bollerslev (1986). Generalized Autoregressive Conditional Heteroskedasticity, Journal of Econometrics 31(3).
- Merton (1976). Option Pricing When Underlying Stock Returns Are Discontinuous, Journal of Financial Economics 3, Issues 1 and 2.
- López de Prado (2018). Advances in Financial Machine Learning, Wiley.

*Educational content only. Not financial advice.*
