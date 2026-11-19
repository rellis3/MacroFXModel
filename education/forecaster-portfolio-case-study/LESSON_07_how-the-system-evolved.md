# Case Study: The Forecaster Portfolio — Lesson 07 of 17

## How the System *Evolved*

> **Source:** Colez Trades (cog) education, "Case Study: The Forecaster
> Portfolio". Module 02 · The System. Case Study · Lesson 07 of 17 (CS · 07).
> Page: cog000.github.io/Forecaster-Portfolio-Case-Study/lesson-07/
>
> **Transcription note:** copied from full-page screenshots of the lesson,
> taken 2026-11-18 in a desktop browser (1200 px wide) after entering the
> access key and accepting the disclaimer. Nothing has been added or inferred.
> The original screenshots are kept in `screenshots/lesson-07/`: 01–18 are the
> page in order, and 19–21 are landscape close-ups of formula boxes 01–03.
> Each figure below names the screenshot it appears in and is described in
> words (axes, lines, colours, labels, caption), as shown. Where something was
> not visible it is marked **[not captured]**. Checkpoint answers are listed
> as shown; the lesson did not mark a correct answer.
>
> **Also from the page (2026-11-18):** the charts step through numbered stages
> as they appear, and the screenshots show each chart's final stage. The
> titles of the earlier stages, and the disclaimer shown before the lesson
> opens, were read from the page itself and are marked *(from page)*. Only
> text shown on the page was used.

**Before you begin** *(from page; a disclaimer shown, and accepted, before the lesson opens)*

*Educational purpose*

This case study is educational. Nothing in it is financial or investment
advice, a recommendation, or an offer of any service, and we do not offer
signals. It does not take account of your circumstances, and any decision you
make is your own.

*About the track record*

Every return and ratio attributed to the Forecaster Portfolio comes from a
historical track record: the system's parameters applied to historical data.
It is not a record of live trades or real capital. Only charts labelled
Historical track record show its results; the others are teaching
illustrations or published research.

*Risk*

Past performance, whether actual or simulated, is not a reliable indicator of
future results. Trading carries a high risk of loss, including loss of more
than your initial capital with some leveraged products. We take care over
accuracy but cannot guarantee it, and accept no liability for decisions based
on this material.

Tick box: "I have read and understood this disclaimer." Button: "Continue".

*Five builds, one that fell, and what choosing the best of them flatters. The
evolution of a system is evidence, and it is also a selection.*
*(screenshot 01)*

### A system in *versions*

*What a sequence of builds shows, and what it hides.*

| | |
|---|---|
| Series | Case Study: The Forecaster Portfolio |
| Subject | Research evolution and selection |
| Method | Difference tests, expected maxima, selection bias |
| Reading time | About 30 minutes |

*(screenshot 02)*

Systems are not found; they are built, in versions, and each version is judged
on the same research data as the last: the years 2022 to 2025, with 2026 held
out untouched (Lesson 14). The Forecaster Portfolio reached its current form
through five builds. Their Sharpe ratios, each measured over the whole record,
rose from 2.25 to 3.51, with one step backwards, and the final build is the
historical track record this series examines. Those five numbers are evidence
of a research process; they are also the outcome of a selection, since the
build kept is the build that did best.

This lesson reads the sequence both ways. It sets out what versioning means in
systematic research, examines the five builds against the noise in each
measurement, calculates how much choosing the best of several candidates
flatters the winner, and shows why a disciplined research record keeps its
failures. Nothing about what changed between builds is described; the subject
is the shape of the evidence, not the contents of the system. The record's
figures are shown before trading costs; a later costing module adds them.

---

## §01 · Versions

### Research as a sequence of *versions*

*Why systematic strategies are built in builds, and what a build is evidence
of.* *(screenshots 02, 03)*

A systematic strategy is software, and like software it exists in versions.
Each build is a complete specification, fixed at a date, run on the research
data, and judged by the same measures as its predecessors. The discipline of
versioning is what makes a research programme a record rather than a story: at
any later time one can say exactly what the system was, what it produced, and
what was changed to make the next build. It is also what allows the
corrections of later lessons, because the breadth of a search can only be
corrected for if the search was counted.

A build changes for a small number of reasons, and all of them recur across
firms whatever the system does. A layer is added or replaced, in the sense of
Lesson 3. A rule that worked in research proves fragile in simulation and is
simplified. Costs, capacity or the handling of data, the subjects of Lessons 4
and 5, force a change in how the system trades rather than in what it
believes. Or a build is reverted, because a change that looked like an
improvement did not survive examination. The Forecaster Portfolio went through
five such builds; what changed in each is proprietary, and this lesson treats
the builds as the five results they produced.

The comparison between builds is always on the same data, the research years
of 2022 to 2025, which is both the strength and the hazard of the method. The
strength is that differences between builds are measured far more precisely
than the standard error of either build alone would suggest, because the two
see the same markets on the same days and most of the noise is common to both.
The hazard is that every build sees the same past, so each one learns a little
more about that particular history, and a sequence of improvements on the same
data can be a sequence of better fits rather than better systems.
Distinguishing the two is the work of Lessons 12 to 14.

The gain in precision from comparing on the same data can be written down. If
two builds' daily results have correlation ρ, the standard error of the
difference between their Sharpe ratios is the single-build standard error
multiplied by √(2(1 − ρ)). For unrelated builds that is 0.59; for builds whose
results are correlated 0.9, as successive versions of one system typically
are, it is about 0.19. Figure 1.1 shows the curve. This is why a change of a
few tenths in a Sharpe ratio can be a real finding between two versions of the
same system and nothing at all between two unrelated strategies, and why the
tests of §02 use the unrelated-build figure only as a conservative bound.

**01 · COMPARISON — The precision of a paired comparison**
*(screenshots 03, 04, 19)*

    SE(Ŝ_a − Ŝ_b) = SE √(2(1 − ρ))        (ρ = 0.9: 0.19;  ρ = 0: 0.59)

*Takeaway:* Builds that share data differ by less noise than unrelated
strategies do; the common component cancels in the difference.

**FIGURE 1.1 — Why shared data sharpens a comparison** *(screenshot 04;
animated, stepped)*

- **What it shows:** standard error of the difference in Sharpe ratio (y-axis
  0 to 0.6; ticks 0, 0.2, 0.4, 0.6) against correlation between the two
  builds' daily results (x-axis 0 to 1; ticks 0, 0.5, 0.9, 1). A single dark
  curve starts at 0.59 at a correlation of 0 and falls, gently at first and
  then more steeply, to a dark end marker near a correlation of 1. Pale grey
  shading fills the area under the curve.
- A grey dashed horizontal line runs across the chart at 0.59.
- **Markers:** grey "Unrelated builds · 0.59" at the start of the curve
  (correlation 0); green "Correlation 0.9 · 0.19" at correlation 0.9; dark
  "0.08" at the end of the curve.
- **Step 3 (shown at the top of the chart) — "3 · At a correlation of 0.9 the
  standard error of a difference falls to about 0.19".**
- *(from page)* Step 1: "Two unrelated builds: differences are noisy, about
  0.59".
- *(from page)* Step 2: "Builds that share logic and data: the common noise
  cancels".
- **Caption:** *Standard error of the difference between two builds' Sharpe
  ratios against the correlation between their daily results, at a
  single-build standard error of 0.419.*
- Source tag: ANALYTIC · PAIRED COMPARISON

Institutional practice formalises the sequence. Each build has a specification
and a version number; its results are generated by a fixed pipeline from fixed
data, so that any result can be regenerated; the reasons for each change are
recorded before the change is tested; and a build that is reverted stays in
the record. The last point matters most for this lesson. A record that shows
only the builds that improved is a survivorship record in the sense of Lesson
5, and it flatters in exactly the way that excluding failed strategies
flatters a database. The Forecaster Portfolio's record keeps the build that
fell, and §02 shows why that is the more informative sequence.
*(screenshots 04, 05)*

> *A build is a complete specification fixed at a date. A sequence of builds
> is evidence only if every build, including the ones reverted, stays in the
> record.* *(screenshot 05)*

**CHECKPOINT** — Why are differences between two builds measured more
precisely than the standard error of either build alone suggests?
*(screenshot 05)*
- Because later builds use more data
- Because both builds see the same markets on the same days, so most of the
  noise is common to both
- Because the Sharpe ratio has no sampling error

---

## §02 · Five builds

### Five builds, one that *fell*

*The sequence read against the noise in each number.* *(screenshot 06)*

The five builds produced Sharpe ratios of 2.25, 2.24, 2.69, 2.87 and 3.51, in
order. The last is the historical track record. Each figure measures its build
over the whole record, holdout included, so that all five stand on the same
1,181 days; every comparison that chose between them was made on the research
years alone, and the fifth build was carried unchanged into the holdout's
single test. Figure 2.1 shows the sequence with the noise drawn around it:
each build's Sharpe ratio carries a standard error of about 0.419, the figure
established in Lesson 1, and the difference between two builds carries, at
most, about 0.59. Read against that noise, the sequence says less than it
appears to and more than a single number would.

Build 2 fell. Its Sharpe ratio of 2.24 was 0.01 below Build 1, a difference of
about 0.02 standard errors, which is no difference at all; the change made in
Build 2 neither improved nor damaged the system in any way the data could
detect, and the build was superseded. The record keeps it because a research
process that never goes backwards is one that is not being tested. Builds 3
and 4 rose by 0.45 and 0.18, each within the noise taken alone. Only the whole
journey, from 2.25 to 3.51, a rise of 1.26 or about 2.1 standard errors,
stands clearly outside what chance would produce if all five builds were
equally good.

Even that statement is bounded in two directions. The standard error of a
difference used here assumes independent builds, and because the builds share
data it overstates the noise, so the journey is more significant than 2.1
standard errors suggests. Against that, the builds were made by researchers
who saw the results of each before designing the next, so the sequence is not
a set of independent experiments but a search, and §03 shows what searching
does to the best result.

**02 · COMPARISON — The standard error of a difference between builds**
*(screenshots 06, 07, 20)*

    SE(Ŝ_a − Ŝ_b) ≈ √(SE_a² + SE_b²) = 0.419 √2 ≈ 0.59    (an upper bound: builds share data)

*Takeaway:* Two independent Sharpe ratios with standard error 0.419 differ by
chance by about 0.59; builds that share data differ by less, so 0.59 is an
upper bound on the noise.

(In the page screenshot 07 the left edge "SE" and the right end "ta)" of the
formula are cut off by the box; close-up 20 shows the whole formula.)

**FIGURE 2.1 — Five builds against the noise** *(screenshot 07; animated,
stepped)*

- **What it shows:** annualised Sharpe ratio (y-axis; ticks 2.0, 3.0, 4.0)
  against builds, in order (x-axis; Build 1, Build 2, Build 3, Build 4,
  Build 5). A dark line joins the five builds' values: nearly flat from Build 1
  to Build 2, then rising through Build 3 and Build 4 to Build 5.
- A pale grey band, the standard error of a difference between builds, is
  shaded above and below the line along its whole length, following the line
  upwards; at Build 5 its top edge reaches just above 4.0.
- **Markers:** grey dot at Build 1, "Build 1 · 2.25" (grey); red dot at
  Build 2, "Build 2 · 2.24, down 0.01" (red, below the line); green dot at
  Build 5, "Build 5 · 3.51, the record · up 1.26 on Build 1, about 2.1
  standard errors" (green, above the line). Builds 3 and 4 have no labels.
- **Step 3 (shown at the top of the chart) — "3 · Only the whole journey, 2.25
  to 3.51, stands clearly outside the noise".**
- *(from page)* Step 1: "Five builds, in the order they were made".
- *(from page)* Step 2: "Build 2 fell by 0.01: a difference far inside the
  noise of about 0.59 between two builds".
- **Caption:** *Annualised Sharpe ratio of the five builds in order, each
  measured over the whole record, with the standard error of a difference
  between builds shaded; the fall at Build 2 and the rise from Build 1 to
  Build 5 marked.*
- Source tag: HISTORICAL TRACK RECORD · BUILD SUMMARY FIGURES

Why show a fall at all? Because a research record is evidence only in
proportion to what it could have revealed. A sequence that admits no
reversals could not have shown a failure even if one had occurred, and so says
nothing about whether the researchers were willing to find one. The single
step backwards in the Forecaster Portfolio's sequence is small, but it is the
point at which the record demonstrates that reversals were possible, and it is
why the rises on either side of it can be read as results rather than as a
narrative. *(screenshot 08)*

The sequence also contains a quantitative lesson about expectations. The mean
Sharpe ratio across the five builds is 2.71. A reader who saw only Build 5
would take 3.51 as the system's quality; a reader who saw the whole sequence
knows that the same research programme, applied to the same data, produced a
spread of results, of which 3.51 is the best. That is the fact §03 prices.

> *Build 2 fell by 0.01, which is nothing; Build 5 rose 1.26 on Build 1, which
> is not. The record keeps both, because a sequence that cannot fall cannot be
> evidence.* *(screenshot 08)*

**CHECKPOINT** — Build 2's Sharpe ratio was 0.01 below Build 1's. What does
this show about the change made in Build 2? *(screenshot 08)*
- It damaged the system
- Nothing detectable: 0.01 is about 0.02 standard errors of a difference
- It improved the system

---

## §03 · Selection

### Selection *flattery*

*What choosing the best of several candidates adds to its measured result,
whether or not the edge is real.* *(screenshot 09)*

Lesson 2 introduced the expected best of N: when the best of several noisy
estimates is chosen, its expected value exceeds the truth by the standard
error multiplied by the expected maximum of N standard normal draws. The same
arithmetic applies to builds. If five builds were independent draws of equal
true quality, the best of them would be expected to exceed that quality by
1.16 standard errors, which at the record's standard error of 0.419 is about
0.49 of Sharpe. Figure 3.1 shows the curve: the flattery rises quickly with
the first few candidates and slowly thereafter, reaching about 0.70 for the
thirteen research families of Lesson 2.

This is the figure the series registers and uses. An earlier draft of the plan
carried a larger number for the same quantity; it did not survive
recomputation, and under the rule that every figure is recalculated before use
it was replaced. The point is not the exact value but its logic: selection
flatters by an amount that depends only on how many candidates were compared
and how noisy each measurement was, and it flatters a worthless edge exactly
as much as a real one.

**03 · SELECTION — The expected flattery of the best of N**
*(screenshots 09, 10, 21)*

    E[ max_{i≤N} Ŝ_i ] − S ≈ SE · E[ max_{i≤N} Z_i ]        (N = 5:  1.16 SE = 0.49)

*Takeaway:* Choosing the best of N independent candidates of equal quality
inflates the winner by the standard error times the expected maximum of N
normal draws: about 0.49 of Sharpe for five.

**FIGURE 3.1 — What choosing the best adds** *(screenshot 10; animated,
stepped)*

- **What it shows:** expected flattery, in Sharpe units (y-axis 0 to 1.00;
  ticks 0, 0.25, 0.50, 0.75, 1.00) against candidates chosen among (x-axis 1
  to 30; ticks 1, 5, 13, 30). A single dark curve starts at 0 at one
  candidate, rises steeply over the first few candidates and then flattens,
  ending at a dark marker at 30. Pale grey shading fills the area under the
  curve.
- **Markers:** red dot at 5, "Five builds · up to 0.49" (red, below the
  curve); grey dot at 13, "Thirteen families · up to 0.70" (grey, above the
  curve); dark dot at 30, "0.86".
- **Step 3 (shown at the top of the chart) — "3 · Sequential builds share most
  of their logic and data, so the true flattery is smaller than these
  bounds".**
- *(from page)* Step 1: "If candidates were independent draws of equal true
  quality, the best of them would exceed the truth by this much".
- *(from page)* Step 2: "Five builds: at most about 0.49 of Sharpe; thirteen
  research families: about 0.70".
- **Caption:** *Expected flattery of the best of N independent candidates of
  equal true quality, in Sharpe units, at the record's standard error of
  0.419.*
- Source tag: ANALYTIC · ORDER STATISTICS

The five builds are not independent draws, and the difference matters in the
direction of less flattery. Each build shares most of its logic and all of its
data with its predecessor, so their results are highly correlated, and Lesson
4 showed that the expected maximum of correlated candidates is the independent
value scaled by √(1 − ρ). Figure 3.2 shows the effect: at a correlation of 0.9
between builds the flattery of the best of five falls from 0.49 to about 0.15.
Sequential improvement is a weaker search than five independent attempts,
which is why a sequence of builds flatters less than a table of five unrelated
strategies would. *(screenshots 10, 11)*

Against that, the sequence is only part of the search. Behind the five builds
stand the thirteen research families of Lesson 2 and the parameter variants of
Lesson 13, and the correction that matters for the record is the one that
counts all of them. Lesson 12 applies it: the deflated Sharpe ratio asks
whether 3.51 remains significant once the full breadth of the search is
priced, and the answer there is yes by a wide margin. This chapter's
contribution is the mechanism and its bound: among builds alone, selection
could account for at most about 0.49 of the final 3.51, and in practice for
less.

**FIGURE 3.2 — Why sequential builds flatter less** *(screenshot 11)*

- **What it shows:** expected flattery of the best of five, Sharpe units
  (y-axis 0 to 0.50; ticks 0, 0.25, 0.50) against correlation between
  candidates' results (x-axis 0 to 1; ticks 0, 0.5, 1). A single dark curve
  starts at 0.49 at a correlation of 0 and falls, slowly at first and steeply
  near the end, to 0 at a correlation of 1. Pale grey shading fills the area
  under the curve.
- **Markers:** red dot at correlation 0, "Independent · 0.49" (red); green dot
  at correlation 0.9, "Correlation 0.9 · 0.15" (green); dark dot at
  correlation 1, "0.00". The marker labels are set in a monospaced font.
- No step title is drawn on this chart.
- **Caption:** *Expected flattery of the best of five candidates against the
  correlation between their results.*
- Source tag: ANALYTIC · ORDER STATISTICS

> *Selection flatters a worthless edge exactly as much as a real one. Among
> five builds, by at most about 0.49 of Sharpe; among correlated builds, by
> less.* *(screenshots 11, 12)*

**CHECKPOINT** — Five independent candidates of equal true quality are
compared and the best is kept. At a standard error of 0.419, by about how much
is the winner flattered? *(screenshot 12)*
- About 0.05
- About 0.49
- About 1.6

---

## §04 · Stability

### *Stability* as evidence

*What a sequence of improvements looks like when it is learning rather than
fitting.* *(screenshot 12)*

A sequence of rising results can mean two things: a system that is being
improved, or a system that is being fitted ever more closely to one history.
The two are distinguished by what else moves. Figure 4.1 gives the first test,
the probability that a rise of a given size would occur by chance between two
builds of equal quality. A rise of 0.45, as from Build 2 to Build 3, occurs by
chance about 22% of the time; a rise of 1.26, as from Build 1 to Build 5,
about 1.7% of the time. Individual steps are weak evidence; the accumulation
is strong. *(screenshot 13)*

The second test is whether improvements are broad or narrow. A change that
improves the system in one market, one period or one parameter setting while
leaving the rest untouched is the signature of fitting; a change that raises
results across markets and periods together is the signature of a better
system. Lesson 13 examines the Forecaster Portfolio's final build across 64
parameter variants and finds all 64 positive, with Sharpe ratios between 3.27
and 3.51: a plateau rather than a peak, which is what a broad improvement
leaves behind.

The third test is the hardest and comes last: data the builds never saw.
Lesson 14 examines the holdout, the period set aside before research began and
examined once at the end, and Lesson 16 examines the forward record. A
sequence of builds that improves in sample and holds out of sample is
learning; one that improves in sample and fails out of sample was fitting. The
five builds are the in-sample half of that comparison, and this lesson
deliberately leaves the other half to the lessons that can supply it.

**FIGURE 4.1 — How large a rise means something** *(screenshots 13, 14)*

- **What it shows:** probability by chance, if the builds were equal (y-axis
  0% to 50%; ticks 0%, 10%, 25%, 50%) against rise in measured Sharpe ratio
  over the previous build (x-axis 0 to 1.5; ticks 0, 0.5, 1.0, 1.5). A single
  dark curve starts at 50% at a rise of 0 and falls, steeply at first and then
  flattening, to almost 0% at a rise of 1.5. Pale grey shading fills the area
  under the curve.
- **Markers:** grey dot at a rise of 0.45, "Build 3 on Build 2 · +0.45 · 22%"
  (grey); green dot at a rise of 1.26, "Build 5 on Build 1 · +1.26 · 1.7%"
  (green); dark dot at the end of the curve, "0.01%". The marker labels are
  set in a monospaced font.
- No step title is drawn on this chart.
- **Caption:** *Probability that a rise of a given size between two builds of
  equal true quality would occur by chance, at the standard error of a
  difference of 0.59.*
- Source tag: ANALYTIC · NORMAL APPROXIMATION

There is a subtler hazard in any sequence of builds judged on the same data,
and it has a name in statistics: repeated significance testing on accumulating
evidence. Armitage, McPherson and Rowe showed that if a hypothesis is tested
again after each new look at the data, and research stops as soon as a test
succeeds, the probability of a false positive rises well above the nominal
size of each test, because the sequence offers many chances to succeed by
luck. A programme that builds, tests and keeps whichever build first clears a
threshold is running exactly that procedure. The remedies are the ones Lesson
4 described as evidence without the recipe: a holdout fixed before the
sequence begins, which the sequence cannot look at, and a declared stopping
rule. The Forecaster Portfolio's holdout is the subject of Lesson 14.
*(screenshot 14)*

Bayesian reading makes the same point in a different form. Before the
sequence, a reader's belief about the system's quality is spread widely; each
build moves it a little, and the prior of Lesson 1, centred on a Sharpe ratio
of 1.0, is pulled towards the measured values as the evidence accumulates.
Five builds on the same data are not five independent pieces of evidence, but
the shape of the sequence, rising, with one reversal, and consistent across
variants, is the shape that learning produces and that fitting rarely does:
fitting tends to rise without reversal and to collapse across variants.

> *One step up is weak evidence. A sequence that rises, reverses once, and
> holds across sixty-four variants is the shape of learning.*
> *(screenshot 14)*

**CHECKPOINT** — Which pattern most distinguishes a system that is being
improved from one that is being fitted to its history? *(screenshot 15)*
- A sequence that never falls
- Improvements that hold across markets, periods and parameter variants, and
  on data the builds never saw
- Larger Sharpe ratios

---

## §05 · Corrections

### The corrections *ahead*

*Where each of this lesson's questions is answered with the record's own
data.* *(screenshot 15)*

This lesson has been about the shape of the evidence rather than its content,
and it closes by mapping the shape onto the lessons that supply the content.
The question of whether 3.51 is distinguishable from noise at all is Lesson
11, significance. The question of how much the search behind it flatters, of
which this lesson's builds are one part, is Lesson 12, the deflated Sharpe
ratio across the full breadth of the research programme. The question of
whether the final build is a peak or a plateau is Lesson 13, which examines
the 64 parameter variants. The question of data the builds never saw is Lesson
14, the holdout, and the question of how the structure behaves across other
orderings of its own days is Lesson 15. Lesson 16 asks how quickly a forward
record could detect decay in what the builds found.

Each of those lessons is a separate test of a distinct feature of the record,
which is the design principle of Lesson 1: independent evidence compounds, and
tests that probe the same feature do not. The five builds of this lesson are
where several of those features were first set, and the reason the series
records them as five results rather than as a single final number is that the
later corrections need to know how many candidates there were. A record that
reported only its best build could not be corrected for the others.
*(screenshot 16)*

Module 3 begins with Lesson 8, the historical track record itself: what the
final build produced over its 1,181 days, read as one path among the many that
Lesson 1 described.

> *Five builds, recorded as five results, so that every later correction can
> count them.* *(screenshot 16)*

**FIGURE 5.1 — Where each question is answered** *(screenshots 16, 17)*

- **What it shows:** a diagram of six rounded boxes in two rows of three, each
  with a bold title and a smaller grey line beneath. Grey arrows join the boxes
  left to right within each row; no arrow is drawn between the rows.
  - Top row, dark outlines: "Lesson 11 · Significance" / "is 3.51 noise?" →
    "Lesson 12 · Selection" / "the search priced" → "Lesson 13 · Plateau" /
    "64 variants".
  - Bottom row, green outlines and green titles: "Lesson 14 · Holdout" /
    "unseen data" → "Lesson 15 · Robustness" / "other orderings" → "Lesson 16
    · Decay" / "the forward record".
- **Caption:** *The six validation lessons that take up the questions this
  lesson has raised, in order.*
- Source tag: DIAGRAM

**NEXT · LESSON 08 — The Historical Track Record** *(screenshot 17)*

What the final build produced over 1,181 days: cumulative return, drawdowns,
time under water, and how evenly the result was earned.

---

## Appendix · Glossary and sources

### Terms and *sources* *(screenshots 17, 18)*

| Term | Definition |
|---|---|
| Build | A complete specification of the system, fixed at a date and run on the research data. |
| Reversion | Returning to an earlier build after a change fails examination. |
| Selection flattery | The amount by which the best of several noisy candidates exceeds its true quality in expectation. |
| Plateau | A region of parameter settings over which results stay similar; the opposite of a peak. |

### Sources

- Bailey and López de Prado (2014). The deflated Sharpe ratio, Journal of Portfolio Management 40(5).
- White (2000). A reality check for data snooping, Econometrica 68(5).
- Armitage, McPherson and Rowe (1969). Repeated significance tests on accumulating data, Journal of the Royal Statistical Society Series A 132(2).

*Educational content only. Not financial advice.* (Footer link: "Disclaimer".)
