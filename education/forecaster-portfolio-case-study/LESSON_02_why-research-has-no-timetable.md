# Case Study: The Forecaster Portfolio — Lesson 02 of 17

## Why Research Has No *Timetable*

> **Source:** Colez Trades (cog) education, "Case Study: The Forecaster
> Portfolio". Case Study · Lesson 02 of 17 (CS · 02).
>
> **Transcription note:** copied from phone screenshots of the lesson, taken
> 2026-10-04. Nothing has been added or inferred. The original screenshots are
> kept in `screenshots/lesson-02/` (01–17, in page order), and each figure
> below names the screenshot it appears in. A second, cleaner set of 17 taken
> later the same day is in `screenshots/lesson-02-repost/` ("repost NN"); it
> fills in the parts the first set hid. Each figure is also described in
> words: its axes, lines, colours, labels and caption, as shown. Where
> something was hidden or cut off it is marked **[not captured]**. Checkpoint
> answers are listed as shown; the lesson did not mark a correct answer in the
> screenshots.

*Systematic research is a search whose duration is a random variable. The
mathematics of that search explains why it resists scheduling, and how its
breadth enters the evidence it produces.*

### The mathematics of *search*

*Foundations for every lesson that follows.*

| | |
|---|---|
| Series | Case Study: The Forecaster Portfolio |
| Subject | Search processes and stopping times |
| Method | Poisson, geometric and beta-geometric models |
| Reading time | About 35 minutes |

Research into systematic strategies is a search. Each direction explored has
some probability of producing a usable edge, and the time until one does is a
random variable rather than a quantity that can be planned. This lesson sets
out the mathematics of that search: why its expected remaining duration does
not shrink as effort accumulates, why uncertainty about the rate of success
produces heavy-tailed timelines, and how the cost of a research programme is
governed by Wald's identity.

It closes by connecting the breadth of a search to the evidence it yields. The
Forecaster Portfolio emerged from 13 research directions containing several
hundred configurations, and that breadth is an input to every test of
significance later in the series.

---

## §01 · The Process

### Re*search* as a search

*Why the duration of systematic research is a random variable, and what kind.*

A systematic research programme proceeds by exploring directions: families of
hypotheses about where an exploitable structure in market data might lie. Most
directions yield nothing usable. Some yield an edge that survives the tests of
Module 4. The programme's duration is the time until enough directions
succeed, and because success in any one direction is uncertain, that duration
is a random variable whose distribution can be analysed like any other.

The simplest model treats useful discoveries as arriving at random at a
constant average rate λ, a Poisson process. The waiting time until the first
discovery is then exponentially distributed: short waits are common, long
waits are rare but far from negligible, and the whole distribution is
described by a single parameter. The same model applies whether time is
measured in months, in attempts or in configurations tested. It is a
stylisation, but it captures the defining feature of research: effort buys a
chance of success, not a schedule of it.

> *Research effort buys a probability of discovery, not a date for it.*

**01 · WAITING TIMES — The exponential waiting time**

    Pr(T > t) = e^(−λt),      t_m = ln2 / λ,      E[T] = 1/λ ≈ 1.44 t_m

*Takeaway:* The probability that the wait exceeds t decays exponentially at
the discovery rate λ. The median wait is ln 2/λ and the mean is 1/λ, about 44%
longer than the median.

**FIGURE 1.1 — The exponential wait** *(screenshot 02)*

- **What it shows:** one falling curve, the probability of still waiting
  (y-axis, 0% to 100%), against the wait measured in multiples of the median
  (x-axis, 0 to 5×). It starts at 100% at zero and decays smoothly towards
  zero, with the area under it shaded grey.
- **Markers:** a dark dot at 1× labelled "Median · 50%"; a green dot a little
  further right labelled "Mean · 1.44 medians"; the curve's end at 5× labelled
  "0.03%".
- **Stats strip:** MEDIAN 1 median · MEAN 1.44 medians · BEYOND 2 MEDIANS 25%
- **Caption:** *Once a search is memoryless, the chance of still waiting halves
  with every median that passes. The mean lies 44% beyond the median.*
- Source tag: ANALYTIC · MODEL CALCULATION

Two properties follow immediately and shape everything else in this lesson.
The mean wait exceeds the median by about 44%, because the distribution's
right tail is long. And the distribution is memoryless: having already waited
any length of time, the expected wait still to come is exactly what it was at
the start. Neither property depends on how productive the research is. Both
are consequences of uncertainty itself.

Memorylessness is the formal content of the statement that research has no
timetable. A schedule presumes that progress accumulates towards a known
finish; a memoryless search makes no such progress towards discovery, only
towards the exhaustion of its budget. What does accumulate is information
about the rate itself, which §03 shows is the more consequential unknown.
Discrete attempts behave in the same way: if each attempt succeeds with
probability p, the number of attempts to a first success is geometric, the
discrete counterpart of the exponential, and it inherits the same
memorylessness.

Why should discoveries resemble a Poisson process at all? The answer is a
limit theorem. The Palm-Khintchine theorem shows that when many independent
sources each generate events only rarely, their combined stream converges to a
Poisson process, whatever the pattern of any single source. A research
programme has exactly that structure: many directions, configurations and data
sets, each with a small chance of yielding something usable in any period. The
exponential waiting time is therefore not an arbitrary assumption but the
natural description of discovery drawn from many small, independent
opportunities.

The rate itself is the quantity of real interest, and the waiting time carries
information about it. If prior uncertainty about λ is described by a gamma
distribution, a period of length t without a discovery updates it to another
gamma distribution with a lower mean: the posterior estimate of the rate falls
steadily while a search runs without success. A long wait is therefore a sign
of one of two things, ordinary bad luck under a good rate or a lower rate than
assumed, and the longer the wait, the more weight shifts to the second
explanation. §03 develops what that shift implies.

Memorylessness has a practical corollary that is easy to state and harder to
apply. When the rate is known, elapsed effort carries no information about the
remaining wait, so effort already spent is irrelevant to the decision to
continue; only the expected value of the next attempt against its cost
matters. Sunk effort enters the decision solely through what it reveals about
the rate, which is precisely the channel through which a long search becomes
evidence against its own direction.

**FIGURE 1.2 — What waiting reveals about the rate** *(screenshot 03)*

- **What it shows:** four density curves for the discovery rate (x-axis:
  discovery rate relative to the prior mean, 0 to 3; y-axis: density, 0 to
  2+). The flattest, widest curve is the prior (light grey). Each successive
  curve, after a wait of 1 (mid grey), 2 (navy) and 4 (green), is taller,
  narrower and peaks further to the left, towards lower rates. The green
  "after a wait of 4" curve peaks highest, just above 2, close to zero on the
  x-axis. The right-hand end of the axis is labelled "0.03".
- **Legend:** Prior · After a wait of 1 · After a wait of 2 · After a wait of 4
- **Stats strip:** PRIOR MEAN RATE 1.00 · MEAN AFTER 1 0.67 · MEAN AFTER 2
  0.50 · MEAN AFTER 4 0.33
- **Caption:** *A prior over the discovery rate, updated after waits of
  increasing length without a discovery. Each unsuccessful period shifts
  belief towards lower rates.*
- Source tag: ANALYTIC · MODEL CALCULATION

In practice the rate is estimated from a programme's own history. The
maximum-likelihood estimate of λ is simply the number of discoveries divided
by the total time searched, and because discoveries are counts, its relative
uncertainty is about one over the square root of their number. A programme
with three discoveries to its name knows its own discovery rate only to within
about 58% either way. That imprecision is not a defect of measurement; it is
the ordinary state of research, and it is why the uncertain-rate model of §03
is the realistic one.

> **IN THIS SERIES**
> The Forecaster Portfolio emerged from a programme of 13 research directions,
> each containing many configurations, several hundred in all. The mathematics
> of this lesson describes the process that produced it, and §05 shows how the
> breadth of that search enters the statistical evidence examined later. Its
> directions differed in the market structure they targeted and in how many
> configurations each required before it was accepted or set aside.

**CHECKPOINT** — A research direction has run beyond its median time without
success. Under a memoryless model, what is the expected time still to come?
- Shorter, because the discovery is overdue
- Exactly the same as at the start
- Zero, because the median has passed

---

## §02 · Duration

### The *one-in-four* law

*How far beyond its median a search can run, whatever its productivity.*

Memorylessness yields a simple and exact law for how far a search can overrun.
Because the probability of still searching at time t is e^(−λt), the
probability of still searching at twice the median is the square of the
probability at the median: one half squared, or one in four. At three times
the median it is one in eight. In general, the probability of running beyond k
times the median is one half to the power k.

**02 · OVERRUNS — The overrun law** *(repost 04)*

    Pr(T > k·t_m) = (½)^k

*Takeaway:* The probability that a memoryless search runs beyond k times its
median is one half to the power k, independent of the discovery rate.

**FIGURE 2.1 — The overrun law** *(screenshots 04–05)*

- **What it shows:** five dark bars, the probability of running beyond each
  multiple of the median (x-axis: 1×, 2×, 3×, 4×, 5×; y-axis 0% to 50%+).
  Each bar is half the height of the one before: **50.0%**, **25.0%**,
  **12.5%**, **6.25%**, **3.12%**.
- **Reference lines:** a red dashed line at 10%, "90% confidence: budget of
  3.3 medians", and a grey dashed line at 5%, "95% confidence: budget of 4.3
  medians". The 3× bar ends just above the red line, and the 4× bar sits
  between the two lines.
- **Caption:** *The probability of running beyond each multiple of the
  median, and the budgets needed for 90% and 95% confidence.*
- Source tag: ANALYTIC · MODEL CALCULATION

The law holds for any discovery rate. A productive programme and an
unproductive one have different medians, but the same probability of running
beyond twice their own median. Overruns are therefore not a symptom of poor
management or unproductive research; they are a structural property of any
search whose outcome is uncertain. A plan that budgets for the median will be
exceeded by a factor of two a quarter of the time and by a factor of three an
eighth of the time. It also explains why the realised durations of research
projects, gathered across many programmes, are so dispersed: the dispersion is
the distribution itself, not a record of failed estimates.

**TABLE 2.1 — Overrun probabilities, continuous and discrete**

| Model | Median | Beyond 2 × median | Beyond 3 × median |
|---|---|---|---|
| Continuous, any rate | ln 2 / λ | 25.0% | 12.5% |
| Discrete, 5% per attempt | 14 attempts | 23.8% | 11.6% |
| Discrete, 10% per attempt | 7 attempts | 22.9% | 10.9% |
| Discrete, 20% per attempt | 4 attempts | 16.8% | 6.9% |

- Caption: *Discrete rows assume a fixed success probability per attempt. The
  continuous law is their limit as that probability falls; with few, likely
  attempts the rounding of the median lowers the overrun probability.*
- Source tag: ANALYTIC · MEMORYLESS SEARCH

The discrete figures converge on the continuous law as the success probability
per attempt falls, which is the relevant case in systematic research, where
any single configuration is unlikely to succeed. With few, likely attempts the
median is a small integer and its rounding lowers the overrun probability; the
qualitative conclusion is unchanged.

The practical consequence is that research budgets are better expressed as
stopping rules than as schedules. A stopping rule specifies the effort after
which a direction is abandoned or re-examined, for instance at three times its
expected median, and it bounds the cost of any single direction without
pretending to bound its duration. The price of the rule is computable from the
same law: stopping at three times the median ends one search in eight before
its discovery arrives.

A programme of 13 directions managed in this way is a portfolio of searches.
Its duration is governed by the slowest direction pursued to completion, and
its cost by the effort spent across all of them, the subject of §04.

The overrun law is also a design tool. A programme that wants to complete a
direction within budget with ninety percent confidence must allow about 3.3
times the median, since one half to that power is ten percent; for
ninety-five percent confidence the multiple rises to about 4.3. Confidence in
research timelines is expensive precisely because the tail decays only
geometrically in the multiple of the median.

A stopping rule converts that expense into a known cost. Stopping at k times
the median abandons a fraction one half to the power k of searches that would
eventually have succeeded, and caps the effort any single direction can absorb
at k medians. The two errors available to a programme, abandoning a viable
direction too early and pursuing an unviable one too long, trade off through
the choice of k, and the right k depends on the cost of an attempt relative to
the value of a success. When the rate is known, the optimal policy is
degenerate: continue while the expected value of the next attempt exceeds its
cost, which by memorylessness is either always or never. When the rate is
uncertain, as §03 shows, the policy acquires a natural threshold.

Running directions in parallel changes the arithmetic in two opposite ways.
The time to the first discovery among K independent directions, each with rate
λ, is exponential with rate Kλ, so parallel search shortens the expected wait
for a first success K-fold. The time until every direction has succeeded is
the maximum of K exponential waits, whose expectation is the harmonic number
H_K divided by λ, and it grows only logarithmically with K. For 13 directions
the slowest can be expected to take about 3.2 times the mean wait of a single
one.

The expected times of the successive discoveries follow from the order
statistics of the exponential distribution: the gap before the k-th discovery
among K directions is one divided by the number still searching. Among
thirteen parallel directions the first discovery is expected after 0.08 of a
mean wait, and seven of the thirteen have succeeded within about 0.73. The
twelfth arrives at about 2.18 and the last at about 3.18, so the final
direction alone consumes a full mean wait after the twelfth. Figure 2.2 shows
the pattern: discoveries cluster early and spread out at the end.

The two results explain a familiar pattern in research programmes: early
discoveries arrive quickly once enough directions are open, while the
completion of any fixed agenda is governed by its slowest component. A
programme judged on its first successes will look faster than one judged on
finishing everything it began, and the difference is structural rather than a
matter of execution.

**FIGURE 2.2 — Thirteen directions searched in parallel** *(screenshot 06)*

- **What it shows:** 13 horizontal lanes, one per research direction, ordered
  top to bottom by the order of discovery (y-axis: direction 1 to 13). Each
  lane has a grey bar running from zero to a dot at the expected time of that
  discovery (x-axis: time in mean waits of a single direction, 0 to 3+). The
  dots are close together at the top and move further apart lower down: the
  first six sit between about 0.08 and 0.6, while lanes 11, 12 and 13 sit at
  about 1.7, 2.18 and 3.18. A dotted vertical line is drawn near the right
  edge.
- **Labelled dots:** lane 1 (green) "First discovery · 0.08"; lane 7 "Seventh
  of 13 · 0.73"; lane 12 "Twelfth · 2.18"; lane 13 (red) "Last · 3.18".
- **Stats strip:** DIRECTIONS 13 · FIRST DISCOVERY 0.08 · SEVEN OF 13 0.73 ·
  ALL 13 3.18
- **Caption:** *Each lane is one research direction; the dot marks the
  expected time of its discovery, taken in order. Discoveries cluster early
  and spread out at the end.*
- Source tag: ANALYTIC · ORDER STATISTICS OF THE EXPONENTIAL DISTRIBUTION
  *(repost 06)*

**FIGURE 2.3 — How parallel search scales** *(screenshot 07)*

- **What it shows:** three curves of expected time in mean waits (y-axis 0 to
  4) against the number of directions searched in parallel (x-axis 1 to 20).
  All three start at 1 when there is one direction:
  - **Every direction has succeeded** (navy) rises steeply at first, then
    flattens: "All · 3.18" at 13 and "3.60" at 20.
  - **Half have succeeded** (grey) drifts slightly down and stays nearly flat:
    "Half · 0.73" at 13 and "0.72" near 20.
  - **First discovery** (green) drops quickly towards zero: "First · 0.08" at
    13.
- **Caption:** *Expected time to the first discovery, to half of the
  directions and to every direction, as the number searched in parallel
  grows. The first falls as one over K; completion rises only with the
  harmonic number. The half-way curve is drawn for odd numbers of directions,
  where the midpoint is a single direction, and it approaches ln 2.*
- Source tag: ANALYTIC · ORDER STATISTICS OF THE EXPONENTIAL DISTRIBUTION

**CHECKPOINT** — Two research programmes differ tenfold in productivity. Which
is more likely to run beyond twice its own median duration?
- The less productive one
- The more productive one
- Neither: under a memoryless model the probability is one in four for both

---

## §03 · Uncertainty

### When the rate itself is *uncertain*

*How uncertainty about productivity turns an exponential timeline into a
heavy-tailed one.*

The overrun law assumes the discovery rate is known. In research it is not: a
new direction's rate of success is precisely what is being learned. Modelling
that uncertainty changes the shape of the timeline fundamentally. If the
success probability per attempt is itself drawn from a beta distribution,
representing uncertainty about how productive a direction will prove, the
number of attempts to a first success follows a beta-geometric distribution.

**03 · PARAMETER UNCERTAINTY — The beta-geometric tail**

    Pr(N > n) = B(α, β + n) / B(α, β) ∝ n^(−α),      E[N] = (α + β − 1) / (α − 1)   (α > 1

*(The box was clipped at both screen edges in both screenshot sets: the
leading "P" of "Pr" and whatever followed "(α > 1" are cut off.)*

*Takeaway:* When the success rate is uncertain, the probability of a long
search decays as a power of n rather than exponentially. The mean is finite
only when α exceeds one, and it can be many times the median.

**FIGURE 3.1 — Known against uncertain success rates** *(screenshot 08)*

- **What it shows:** two survival curves, the probability of still searching
  (logarithmic y-axis, 100% down to 0.01%) against attempts to a first success
  (logarithmic x-axis, 1 to 1,000). Both start near 100%.
  - **Known rate, 10%** (navy) bends sharply downwards and drops off the
    bottom of the chart just before 100 attempts. Markers: "2× · 22.9%",
    "5× · 2.5%", "10× · 0.06%".
  - **Uncertain rate, averaging 10%** (green) declines along a gentle,
    almost straight line on the log-log axes and is still above 0.1% at 1,000
    attempts. Markers: "2× · 31.0%", "5× · 14.1%", "10× · 6.9%".
- **Stats strip:** MEDIAN, KNOWN 7 · MEDIAN, UNCERTAIN 9 · MEAN, KNOWN 10 ·
  MEAN, UNCERTAIN 55 (shown in red)
- **Caption:** *Survival curves for the number of attempts to a first success,
  on logarithmic axes. Both searches average a 10% success rate per attempt;
  in one the rate is known, in the other it is uncertain. The markers give the
  probability of running beyond two, five and ten times each median.*
- Source tag: ANALYTIC · GEOMETRIC AND BETA-GEOMETRIC MODELS

The figure compares two searches with the same average success rate of 10%
per attempt. In the first the rate is known; in the second it is uncertain,
drawn from a beta distribution with parameters 1.2 and 10.8. Their medians are
close, 7 and 9 attempts. Their tails are not. The probability of running
beyond ten times the median is 0.06% when the rate is known and 6.9% when it
is uncertain, and the expected number of attempts rises from 10 to 55.

The mechanism is straightforward once stated. Directions that prove
unproductive contribute very long searches, and averaging over the possibility
that a direction is one of them fattens the tail. The power-law decay means
the longest searches in a programme will be far longer than its typical
search, and that the average duration is dominated by a few extreme cases.
With α at or below one the expected duration is infinite, although every
individual search is finite.

> *Uncertainty about the rate of discovery, not the rate itself, is what makes
> research timelines heavy-tailed.*

This is the formal reason research programmes are governed by stopping rules
and breadth rather than by schedules. A single direction cannot be scheduled,
but a programme of many directions can be managed: by capping the effort any
one receives, and by pursuing enough of them in parallel that progress depends
on the aggregate rather than on any single search. Breadth, in this sense, is
the research counterpart of diversification in a portfolio: each direction's
search remains heavy-tailed, but the programme's aggregate need not be.

**04 · LEARNING THE RATE — The hazard falls with every failure**

    p̂_n = α / (α + β + n),      E[N − n | N > n] = (α + β + n − 1) / (α − 1)

*Takeaway:* After n unsuccessful attempts the posterior mean success
probability is α/(α + β + n), and the expected number of attempts still to
come is (α + β + n − 1)/(α − 1). The first falls and the second rises with
every failure.

**FIGURE 3.2 — Learning the rate** *(screenshots 08–09)*

- **What it shows:** two lines on twin axes against failed attempts so far
  (x-axis 0 to 40).
  - **Estimated success rate (left axis, 0% to 12%)** (navy), a falling
    curve: "10.0%" at 0, "5.7%" at 9, "3.8%" at 20, "2.31%" at 40.
  - **Expected attempts still to come (right axis, 0 to 200+)** (green), a
    rising straight line: "55" at 0, "100" at 9, "155" at 20, and "255%" at
    40 (label as shown).
  - The two lines cross between about 9 and 20 failed attempts.
- **Caption:** *With an uncertain rate, each failure lowers the estimated
  success rate and raises the expected number of attempts still to come.*
- Source tag: ANALYTIC · MODEL CALCULATION

The beta-geometric model has a second property, more consequential than its
tail: it is not memoryless. Each failed attempt is evidence about the rate,
and Bayesian updating lowers the estimated probability of success on the next
attempt. For the search in Figure 3.1 the estimate starts at 10.0%, falls to
5.7% after nine failures, its median, and to 3.8% after twenty. The hazard of
success declines with every attempt that does not succeed.

The expected number of attempts still to come moves in the opposite
direction. At the outset it is 55; after nine failures it is 100; after twenty
it is 155. Each failure adds 5 attempts to the expected remaining search. The
longer a direction has run without success, the longer it can be expected to
run, a pattern sometimes called the Lindy effect and the exact reverse of the
known-rate case, in which the expected remaining search never changes.

> *Under an uncertain rate, the longer a search has run without success, the
> longer it can be expected to run.*

This is what an extended search can be a sign of, and what it develops into. A
long run of failures is evidence that a direction's rate is lower than first
believed, and because that evidence accumulates steadily, it supports a
principled threshold for setting a direction aside: the threshold at which the
posterior expected value of the next attempt no longer covers its cost. Kill
criteria in a research programme are best understood as that threshold,
computed from the prior uncertainty about each direction and the cost of
pursuing it, rather than as a test of patience.

The prior parameters have a concrete interpretation. In the beta
distribution, α and β act as pseudo-counts: α + β is the number of attempts'
worth of information the prior represents, and α/(α + β) its mean success
rate. The prior used here, with α + β of twelve, carries about as much
information as twelve past attempts. A programme with a record of many
directions can calibrate such priors empirically, from the dispersion of
success rates across its own past directions, an approach known as empirical
Bayes. The kill thresholds of the previous paragraph are then grounded in the
programme's own history rather than in intuition.

**CHECKPOINT** — Two searches share the same average success rate per attempt.
Why does the one with an uncertain rate have a far longer expected duration?
- Its median is much larger
- Averaging over the chance of an unproductive direction adds very long
  searches to the tail
- Each of its attempts takes longer

---

## §04 · Cost

### The *cost* of a search

*Wald's identity, and why the budget of a research programme is predictable
when its timetable is not.*

If the duration of a search is uncertain, its cost might seem equally
unpredictable. It is not, and the reason is one of the most useful results in
applied probability. Suppose each attempt consumes a random amount of effort,
drawn independently with mean E[X], and the search stops at a random attempt N
whose occurrence depends only on outcomes already observed. Wald's identity
states that the expected total effort is the product of the expected number of
attempts and the expected effort per attempt. The result is due to Abraham
Wald, who proved it in the course of developing sequential analysis.

**05 · STOPPING TIMES — Wald's identity**

    E[ Σ_{i=1}^{N} X_i ] = E[N] · E[X]

*Takeaway:* The expected cost of a search equals its expected number of
attempts multiplied by the expected cost of one attempt, provided the decision
to stop depends only on outcomes already observed.

The identity holds for any stopping rule that does not look ahead, however
complex. Its practical content is that a research budget can be planned from
two estimable quantities, the expected number of attempts and the cost of one
attempt, even when the duration of any particular search cannot. A numerical
check makes this concrete: a search with a 10% success probability per attempt
and an average of three units of effort per attempt has an expected total cost
of 30.0 units, and forty thousand simulated searches of that kind average
29.92.

Combined with §03, the identity also shows where research costs concentrate.
The expected number of attempts is dominated by the long tail of unproductive
directions, and so therefore is the expected cost. Stopping rules act directly
on that tail: capping the attempts any direction receives truncates the heavy
tail of N and, through the identity, the expected cost of the programme.

The identity extends naturally to a programme of many directions, whose
expected cost is the sum of the expected costs of its parts. Allocating
research effort then becomes a problem of expected value per unit of cost:
directions are pursued in order of their expected payoff relative to their
expected cost, and set aside when the evidence on their rate falls far enough
that the next attempt is not worth its cost. The Gittins index formalises this
as the optimal policy for allocating effort among independent uncertain
projects.

The Gittins index carries a result that runs against intuition. Between two
directions with the same expected success rate, the one whose rate is more
uncertain can deserve priority. The reason is an option value: trying the
uncertain direction reveals whether it is unusually productive, and if it is
not, the option to abandon it caps the loss at a few attempts. Uncertainty, in
other words, carries an exploration premium when abandonment is cheap, which
is why well-run programmes keep a share of effort on directions whose promise
is least understood.

**06 · BUDGET RISK — The variance of a random sum**

    Var( Σ_{i=1}^{N} X_i ) = E[N]·Var(X) + Var(N)·E[X]²

*Takeaway:* The variance of total cost has two sources: variation in the cost
of each attempt, weighted by the expected number of attempts, and variation in
the number of attempts, weighted by the squared cost of one.

**FIGURE 4.1 — Where the uncertainty in a research budget comes from**
*(screenshot 11)*

- **What it shows:** a single horizontal bar split into two parts. A short
  grey-blue segment on the left, "Cost of each attempt · 90 · 10%", and a long
  red segment filling the rest, "Number of attempts · 810 · 90%".
- **Stats strip:** TOTAL VARIANCE 900 · STANDARD DEVIATION 30 · EXPECTED COST
  30
- **Caption:** *The variance of total effort, split between variation in the
  cost of each attempt and variation in the number of attempts.*
- Source tag: ANALYTIC · MODEL CALCULATION

Wald's identity fixes the expected budget; it says nothing about the risk
around it. The variance of a random sum supplies the rest. For the search in
this chapter's example, the variance of total effort is 900, a standard
deviation of 30 units against an expected cost of 30: the budget is as
uncertain as it is large. Of that variance, 90% comes from uncertainty in the
number of attempts and only the remainder from the cost of each one. Budget
overruns in research are overwhelmingly overruns of duration.

Under an uncertain rate the picture is starker. The beta-geometric number of
attempts has finite variance only when α exceeds two; with α of 1.2, as in
§03, its variance is infinite, and so therefore is the variance of the budget.
No reserve sized as a multiple of the budget's standard deviation can cover
such a programme, because that standard deviation does not exist. The heavy
tail must be truncated by a stopping rule before any statement about budget
risk becomes meaningful.

Breadth tames what truncation leaves. Across independent directions, expected
costs add while standard deviations add only in quadrature, so the relative
uncertainty of a programme's total cost falls with the square root of the
number of directions. For 13 directions of the kind above, the coefficient of
variation falls from one to about 0.28, a reduction by a factor of 3.6. A
research programme is in this sense a portfolio, and its budget risk obeys the
same arithmetic as the risk of a diversified book.

**FIGURE 4.2 — Breadth tames budget risk** *(screenshot 11)*

- **What it shows:** one falling curve, the coefficient of variation (y-axis
  0 to 1.00), against the number of independent directions (x-axis 1 to 30).
  It starts at 1.00 for one direction, drops steeply over the first few
  directions, then flattens.
- **Markers:** "13 directions · 0.28" (green dot); "0.18" at 30.
- **Caption:** *The relative uncertainty of a programme budget falls with the
  square root of the number of independent directions.*
- Source tag: ANALYTIC · MODEL CALCULATION

> **THE CONDITION THAT MATTERS**
> Wald's identity requires that the decision to stop use only information
> already available. A rule that stops early when results look favourable
> satisfies it; a rule that selects which searches to report after seeing all
> of them does not, and it changes what the reported outcomes mean. That
> distinction is the subject of §05 and of Lesson 12.

**CHECKPOINT** — What does Wald's identity allow a research budget to be
planned from?
- The exact duration of each search
- The expected number of attempts and the expected cost of one attempt
- The best result achieved so far

---

## §05 · Evidence

### Breadth and *evidence*

*How the breadth of a search enters the statistical evidence it produces.*

A search that explores many directions produces more than its successes. It
produces a record of every direction tried, and that record is a statistical
input in its own right. When the outcome of a search is a strategy chosen
because it performed best among the alternatives, its measured performance is
the maximum of many estimates, and the expected maximum of many estimates
exceeds the expected value of any one of them even when none carries an edge.

The arithmetic is worth previewing. For independent trials with no edge, the
expected best of N estimates, measured in standard errors, is 0.00 for a
single trial, 1.67 for thirteen and 2.88 for three hundred. The size of the
selection effect therefore depends on how many effectively independent
directions a search contained, together with the precision of each estimate:
the two quantities Lesson 12 uses to compute the Deflated Sharpe Ratio.

For the Forecaster Portfolio the relevant count is 13 research directions,
each a family of related configurations. Configurations within a family are
highly correlated, so the effective number of independent trials sits far
closer to the number of families than to the several hundred configurations
inside them, a distinction Lesson 12 develops formally. Lesson 12 computes
that effective count from the correlation structure of the trials themselves.

This is why the research record is part of the research. A programme that logs
every direction, configuration and outcome can account for the breadth of its
own search when it evaluates what that search produced. A programme that
records only its successes cannot. The record of every attempt is therefore
not administrative overhead; it is the data required to compute the
statistics on which the evaluation of the result depends.

> *The record of every attempt is the data that allows a search to account for
> its own breadth.*

**FIGURE 5.1 — The expected best of N** *(screenshots 12–13)*

- **What it shows:** one rising curve, the expected best result in standard
  errors (y-axis 0 to 3+), against the number of independent trials
  (logarithmic x-axis, 1 to 1,000). It starts at zero and keeps rising, but
  more slowly as N grows.
- **Markers:** "1 · 0.00"; "13 · 1.67"; "300 · 2.88"; "3.24" at 1,000.
- **Caption:** *The expected maximum of N estimates with no edge, in standard
  errors. It grows roughly with the square root of the logarithm of N.*
- Source tag: ANALYTIC · MODEL CALCULATION

The breadth of a search also governs the reliability of what it finds, and the
relation can be made exact. Suppose a fraction π of the directions a programme
explores carry a real edge, that each is tested at size α, and that a test
detects a real edge with probability equal to its power. Among the directions
that pass, the fraction carrying no edge, the programme's false discovery
rate, is α(1 − π) divided by the sum of α(1 − π) and power times π.

The arithmetic is sobering in the ordinary case. With a base rate of 4%, a
conventional test size of 5% and power of 80%, the false discovery rate is
60%: most of what such a programme would accept is noise. The remedies follow
directly from the formula. A stricter test size, the corrections for search
breadth in Lesson 12 and independent confirmation such as the one-shot holdout
of Lesson 14 each shrink the false-discovery term, and a programme that
records every direction can apply them because it knows how many directions
were tested. Lesson 17 returns to this arithmetic as the final stage of the
series.

Independent confirmation is so powerful because evidence from independent
tests multiplies. Each passed test multiplies the odds that a direction
carries a real edge by its likelihood ratio, power divided by test size, which
here is 16. From a base rate of 4%, one passed test raises the probability of
a real edge to about 40%; a second, independent test raises it to about 91%.
The same programme that accepts mostly noise on a single test accepts mostly
real edges on two, provided the second test is truly independent of the
first, which is precisely what a one-shot holdout supplies.

A high false discovery rate is therefore a sign of a specific combination: a
low base rate of real edges, tests too weak for the breadth of the search, or
both. Left uncorrected it develops into fragile results that fail on new data
and appear to decay quickly, although in truth there was nothing there to
decay. The distinction between a decaying edge and an edge that never existed
is one the forward record can eventually draw, a subject of Lesson 16.

**FIGURE 5.2 — Confirmation multiplies the odds** *(screenshot 13 and repost 12; animated)*

- **What it shows:** a large grid of small square cells, one per research
  direction (2,500 in all). Most cells are pale grey. Scattered across the
  grid are green cells and red cells; the red cells are slightly more
  numerous than the green.
- **State 1 (screenshot 13):** "After one test: 80 real and 120 without an
  edge accepted · 40% real". Red cells slightly outnumber green ones.
- **State 2 (repost 12):** "After a second independent test: 64 real and 6
  without an edge · 91.4% real". The same grid now shows mostly green cells,
  with only a handful of red ones left.
- Any other frames of the animation were **[not captured]**.
- **Caption:** *A programme of 2,500 directions, 4% with a real edge, tested
  at a 5% size with 80% power. Red cells are accepted directions without an
  edge.*
- Source tag: ANALYTIC · MODEL CALCULATION

#### Three practices of a research programme

| | Practice | Description |
|---|---|---|
| 01 · Stopping rules | **Cap the effort per direction** | Bounds the heavy tail of search costs without pretending to schedule discovery. |
| 02 · A complete record | **Log every direction and configuration** | Allows the breadth of the search to be measured and corrected for. |
| 03 · Tests fixed in advance | **Specify evaluations before results** | Keeps stopping and selection within the conditions of Wald's identity and the corrections of Lesson 12. |

**CHECKPOINT** — Why are configurations within one research direction counted
as fewer than their number when assessing selection effects?
- They are highly correlated, so they carry overlapping information
- Only successful configurations count
- Configurations are cheaper than directions

---

## §06 · Dynamics

### Why the search gets *harder*

*Declining discovery rates, the decay of published predictability, and what
both imply for a research programme.*

The models so far treat the discovery rate as fixed, or as fixed but unknown.
Over longer horizons it is neither. Evidence from across the economy suggests
that ideas become harder to find as fields mature: Bloom, Jones, Van Reenen and
Webb, examining research effort and output from semiconductors to agricultural
yields, estimate that aggregate research productivity has fallen by roughly
five percent a year, so that sustaining a constant rate of progress requires
steadily rising effort.

In quantitative finance the same force operates faster, because discovery is
competitive. An exploitable pattern in prices is by definition an opportunity
others can also find, and once found it tends to be traded away. McLean and
Pontiff documented the effect directly across nearly a hundred return
predictors from the academic literature: their returns were on average 26%
lower after the original sample period and 58% lower after publication. The
additional loss after publication is attributed to the market learning from
the research itself.

**FIGURE 6.1 — The decay of published predictability** *(screenshots 14–15)*

- **What it shows:** three bars of average predictability relative to the
  original in-sample estimate (y-axis 0% to 100%):
  - **Original sample** (navy): **100%**
  - **Before publication** (grey): **74% · 26% lower**
  - **After publication** (red): **42% · 58% lower**
- **Caption:** *Average predictability of the return predictors studied by
  McLean and Pontiff, relative to the original in-sample estimate.*
- Source tag: MCLEAN AND PONTIFF (2016)

**07 · CHANGING RATES — A search with a declining discovery rate**

    Pr(T > t) = exp( −∫₀ᵗ λ(s) ds ),      λ(s) = λ₀ e^(−δs)   ⇒   Pr(T = ∞) = e…

*(The box was clipped at both screen edges in both screenshot sets: the
start, "Pr(T", is cut off on the left, and the right-hand side of Pr(T = ∞) after "e" is
**[not captured]**.)*

*Takeaway:* When the discovery rate declines through time, the probability of
no discovery by time t is the exponential of minus the integrated rate. If the
rate decays exponentially, the expected number of discoveries is finite, and
some searches never succeed.

**FIGURE 6.2 — A declining discovery rate** *(screenshot 15)*

- **What it shows:** two curves of the probability of no discovery yet
  (y-axis 0% to 100%) against time in mean waits at the initial rate (x-axis
  0 to 12). Both start at 100%.
  - **Constant rate** (navy) falls quickly and reaches about zero by around 6
    to 8 mean waits.
  - **Rate declining 50% a unit** (red) falls more slowly and levels off
    instead of reaching zero, flattening onto a red dashed line labelled
    "Never succeeds · 13.5%". The gap between the two curves is shaded pink.
- **Caption:** *With a constant rate every search eventually succeeds. With a
  declining rate a fixed share never does.*
- Source tag: ANALYTIC · MODEL CALCULATION

Formally, a declining rate turns the Poisson search into a non-homogeneous
one. The probability of no discovery by time t becomes the exponential of
minus the rate integrated up to t, and if the rate itself decays exponentially
the integral converges: the expected number of discoveries over an unlimited
horizon is finite, and a positive fraction of searches never succeed at all.
An exhausted direction is the limiting case, in which no amount of further
effort changes the outcome.

Declining discovery rates are therefore a sign of one of two processes, and
distinguishing them matters. Exhaustion of the idea space lowers the rate for
everyone searching a given region; competition lowers the returns to whatever
is found there, even while discoveries continue. The first argues for new
regions to search, new data and new structure; the second argues for speed,
discipline about capacity and discretion about what is disclosed. Left
unaddressed, both develop into the same outcome: a programme that spends more
to find less, and edges that decay faster than they are replaced.

> *A falling discovery rate signals either an exhausted region or a crowded
> one, and the remedies differ.*

The remainder of the series takes up each response in turn. Lesson 3
describes the layered structure through which the Forecaster Portfolio targets
forecastable quantities that are less contested than direction. Lesson 4
treats the decay of edges under crowding and the economics of disclosure.
Lesson 5 turns to data as a source of new regions to search, and Lesson 16 to
detecting decay in the forward record.

Decay has a natural unit, the half-life. If an edge or a discovery rate
declines at a proportional rate δ a year, half of it is gone after ln 2/δ
years. The research-productivity estimates imply that effort must double
roughly every 14 years merely to hold the rate of progress constant. In
markets the half-lives of edges are typically far shorter, and they shorten
further with disclosure, since publication or wide circulation of a pattern is
itself an event that accelerates its decay. Lesson 4 develops the economics of
that half-life and its consequences for what a system can responsibly reveal.

For a working system the implication is that decay must be monitored rather
than assumed away. A strategy's edge cannot be observed directly, only its
realised returns, and distinguishing slow decay from sampling noise requires a
record of known length and a test of known power. That is the problem of
Lesson 16, in which the forward record of the Forecaster Portfolio is treated
as an ongoing experiment whose ability to detect decay can be computed in
advance.

**CHECKPOINT** — What distinguishes exhaustion of the idea space from
competition as causes of a declining discovery rate?
- Nothing: they are the same process
- Exhaustion lowers the chance of finding anything; competition lowers the
  value of what is found
- Competition affects only academic research

> **NEXT · LESSON 03 — A System Built in Layers**
> How the Forecaster Portfolio separates what can be forecast from how to act
> on it, and why volatility is more forecastable than direction.

---

## Appendix · Glossary and Sources

### Terms and *sources*

| Term | Definition |
|---|---|
| Poisson process | A model in which events arrive at random at a constant average rate. |
| Exponential distribution | The distribution of waiting times between events of a Poisson process. |
| Memorylessness | The property that elapsed time carries no information about the remaining wait. |
| Geometric distribution | The number of independent attempts up to and including a first success. |
| Beta-geometric distribution | The geometric distribution when the success probability is itself uncertain and beta-distributed; it has a power-law tail. |
| Stopping time | A rule for ending a search that uses only information already observed. |
| Wald's identity | Expected total cost equals expected attempts multiplied by expected cost per attempt. |
| Gittins index | The optimal priority for allocating effort among independent uncertain projects. |
| Hazard rate | The probability of success on the next attempt, given no success so far. |
| Lindy effect | The pattern in which expected remaining duration grows with elapsed duration. |
| Compound variance | The variance of a sum whose number of terms is itself random. |
| False discovery rate | The share of accepted results that carry no real effect. |
| Non-homogeneous Poisson process | A Poisson process whose rate changes through time. |

### Sources

- Wald (1944). On Cumulative Sums of Random Variables, Annals of Mathematical Statistics 15(3).
- Gittins (1979). Bandit Processes and Dynamic Allocation Indices, Journal of the Royal Statistical Society B 41(2).
- Bailey and López de Prado (2014). The Deflated Sharpe Ratio, Journal of Portfolio Management 40(5).
- Bloom, Jones, Van Reenen and Webb (2020). Are Ideas Getting Harder to Find?, American Economic Review 110(4).
- McLean and Pontiff (2016). Does Academic Research Destroy Stock Return Predictability?, Journal of Finance 71(1).

*Educational content only. Not financial advice.*
