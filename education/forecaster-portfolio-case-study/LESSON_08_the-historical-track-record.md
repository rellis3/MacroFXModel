# Case Study: The Forecaster Portfolio — Lesson 08 of 17

## The Historical Track *Record*

> **Source:** Colez Trades (cog) education, "Case Study: The Forecaster
> Portfolio". Module 03 · Measuring. Case Study · Lesson 08 of 17 (CS · 08).
> Page: cog000.github.io/Forecaster-Portfolio-Case-Study/lesson-08/
>
> **Transcription note:** copied from full-page screenshots of the lesson,
> taken 2026-11-18 in a desktop browser (1200 px wide) after entering the
> access key and accepting the disclaimer. Nothing has been added or inferred.
> The original screenshots are kept in `screenshots/lesson-08/`: 01–32 are the
> page in order, and 33–36 are landscape close-ups of formula boxes 01–04.
> Each figure below names the screenshot it appears in and is described in
> words (axes, lines, colours, labels, caption), as shown. Where something was
> not visible it is marked **[not captured]**. Checkpoint answers are listed
> as shown; the lesson did not mark a correct answer.
>
> **Also from the page (2026-11-18):** Figure 2.2 steps through numbered
> stages as it appears, and the screenshot shows its final stage. The titles
> of its earlier stages, labels held in the chart data but not drawn, and the
> text of the disclaimer were read from the page itself and are marked
> *(from page)*. Only text shown on the page was used.

**Disclaimer** *(from page; the panel opened by the "Disclaimer" link in the
page footer, with a "Close" button. The gate shown, and accepted, before the
lesson opened is not in the saved page, so its own wording is **[not
captured]**.)*

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

*The equity curve, the drawdown and the monthly distribution of the Forecaster Portfolio: the quantities each captures, and the dynamics that emerge when they are read together.*

### Reading the *record*

*The record read in depth: curve, drawdown and distribution.*

*(screenshot 01)*

| | |
|---|---|
| Series | Case Study: The Forecaster Portfolio |
| Evidence | Historical, daily, January 2022 to July 2026 |
| Presentation | Simple returns on a notional $200,000 |
| Reading time | About 25 minutes |

This lesson reads the Forecaster Portfolio's record in depth: its equity
curve, its drawdowns and the distribution of its monthly and annual returns.
All figures are shown before trading costs, which a later costing module
examines in full.

It decomposes the record into the quantities a cumulative curve compresses:
the depth and duration of drawdowns, the time spent below previous highs, and
the distribution of returns across months and years. Each is recovered from
the same daily returns, and each exposes a different dimension of the process
that generated them.

---

## §01 · The Structure

### The dynamics *beneath* the curve

*What an equity curve compresses, and what the same returns reveal when they
are decomposed.*

An equity curve is the cumulative sum of a strategy's returns, drawn through
time. It is the most compact description of a record and, for that reason,
the most compressed. Each value on the line aggregates every return before it,
so the curve preserves two quantities faithfully: the value the account
reached and the average rate at which it got there. Almost everything else
about the return process is folded into those two numbers.

What is folded away is precisely what a researcher needs in order to
understand the system. The curve does not display the distribution of daily
outcomes, the clustering of volatility, the dependence of returns on their
own recent past, or how gains were distributed across months and years. Nor
does it show the depth and duration of declines from previous highs, which
are properties of the path rather than of its endpoints. Two strategies with
the same cumulative return and the same average slope can differ in every one
of these respects.

The compression is not a defect of the chart; it is what a cumulative sum
does. Summation nets out the order of returns within any stretch, so a period
of steady gains and a period of sharp alternating gains and losses can produce
the same net rise. Yet the order is exactly what determines drawdowns, and the
dispersion is what determines risk.

> *An equity curve preserves the end value and the average slope. The dynamics
> of the return process lie beneath it.*

Recovering those dynamics means reading the same returns through other
transformations. The running maximum of the curve, subtracted from the curve
itself, yields the drawdown series: the depth of every decline and the time
taken to recover from it. Aggregating returns by calendar month and year
yields their distribution at the horizons over which allocators evaluate
performance. The share of days spent below a previous high measures how gains
were arranged in time. Each transformation isolates one dimension of the
return process that the cumulative line compresses.

This lesson applies those transformations to the Forecaster Portfolio's
record. It begins with a prior choice that changes every number that follows,
the convention by which returns are accumulated, and then reads the equity
curve for what it does capture, the drawdown for the depth and duration of
declines, the time spent below previous highs, and the distribution of
returns across months and years.

Figure 1.1 sets out how the record is read in the chapters that follow. From
the equity curve, the cumulative return day by day, two things are derived:
the running high, the best value reached so far, and the drawdown, the curve
less that high, from which the time under water follows. Separately the daily
returns are aggregated into months, which give the heatmap and the annual
figures. Every statistic in this lesson is one of these views of a single
path.

**FIGURE 1.1 — Reading one curve four ways** *(screenshot 04)*

- **What it shows:** a flow diagram of six rounded boxes on a white panel,
  joined left to right by grey arrows. "The equity curve" (dark border, at
  left) branches by two arrows to "Running high" (grey border, upper) and
  "Monthly sums" (grey border, lower). "Running high" leads to "Drawdown" (red
  border, red title), which leads down-right to "Time under water" (red border,
  red title, at right). "Monthly sums" leads to "Heatmap and years" (green
  border, green title).

Diagram (left to right):
**The equity curve** (cumulative return, daily) → **Running high** (the best
value so far) → **Drawdown** (curve less running high) → **Time under water**
(days below the high)
**The equity curve** → **Monthly sums** (55 months) → **Heatmap and years**
(how evenly it was earned)

- **Caption:** *The equity curve, its running high, the drawdown beneath it,
  the time spent under water, and the monthly aggregation from which the
  heatmap and annual returns are built.*
- Source tag: DIAGRAM

The path matters as much as the end. Figure 1.2 draws the record's weekly
cumulative return against a straight line to the same finishing value. The
two end in the same place; they are not the same investment. The record spent
its weeks below its running high, shaded, in episodes of varying depth and
length, and an investor lived through each of them without knowing when it
would end. The end value is what Lesson 1 called an estimate of the process;
the shape of the path is what the drawdown and time-under-water chapters
measure.

**FIGURE 1.2 — Same end, different paths** *(screenshots 04, 05)*

- **What it shows:** cumulative return, % (y-axis 0 to 500; ticks 0, 100,
  200, 300, 400, 500) against years (x-axis 0 to about 4.7; ticks 0, 1, 2, 3,
  4). Legend, top left:
  - a pale pink swatch, "Below the running high";
  - a grey dashed line, "A straight line to the same end";
  - a dark solid line, "The record, weekly".
- The grey dashed line runs straight from 0 at year 0 to about 490 at the
  right end. The dark line starts at 0, dips just below it in the first weeks,
  and climbs below the dashed line throughout, with small wiggles, meeting it
  again only at the end (about 490). Small pale pink patches sit under the
  dark line where it dips below an earlier high, the most visible at about
  0.4, 1.7, 2.2, 2.5, 3.5 and 3.9 years.
- **Caption:** *The record's weekly cumulative return against a straight line
  to the same end, with the weeks spent below the running high shaded.*
- Source tag: HISTORICAL TRACK RECORD · WEEKLY RESOLUTION

> **THE RESEARCH VIEW**
> In systematic research an equity curve is where decomposition begins rather
> than an object of interpretation in itself. Risk, consistency and path
> dependence are measured on transformations of the return series, each chosen
> to expose one property of the process that generated it.

A track record is a time series of returns and a set of conventions for
reading it, and the conventions matter as much as the series. Institutional
reporting fixes most of them. Under the Global Investment Performance
Standards described in Lesson 4, returns are time-weighted, so that the record
measures the strategy rather than the timing of flows into and out of it; the
period is the full history from the first live date, never a chosen window;
and every figure is traceable to the data behind it. This record follows those
conventions: 4.69 years of daily returns from the first day of the record,
with no window chosen and no day omitted.

Two further choices shape every number in the chapters that follow. The first
is the unit: the record is kept in percentage returns on the capital at risk
each day, so that it describes the edge at the scale the record simulates,
and §02 explains why those returns are summed rather than compounded. The
second is the resolution at which the record is shown. Lesson 5 explained
that resolution is a decision, and that a daily record can be presented more
coarsely without losing its statistics; the figures in this lesson are drawn
weekly or coarser, while every summary statistic is computed from the full
daily record.

Read with those conventions, the structure of the record is simple. The
cumulative return rose to +489.07% over 1,181 days. Its straightness can be
measured: a straight line fitted to the daily cumulative return explains
0.985 of its variation, and the K-ratio, the slope of that line divided by the
uncertainty in the slope and scaled by the length of the record, is 8.18, a
measure institutional analysts use to score the consistency of an equity
curve. The chapters that follow decompose that straight-looking line into the
dynamics it conceals.

**CHECKPOINT** — Which quantity does an equity curve not display directly?
*(screenshot 06)*
- The cumulative return
- The depth and duration of declines from previous highs
- The average rate of return

---

## §02 · The Presentation

### Simple, not *compounded*

*The smaller-looking choice, and why it is the honest one.*

There are two ways to add up a series of daily returns, and they can produce
figures so far apart that a reader would struggle to believe they describe the
same strategy.

The first is the simple return. Each day's gain or loss is measured against a
fixed starting account and added to a running total. If a strategy makes one
percent on Monday and one percent on Tuesday, its simple return over the two
days is two percent. The account size the returns apply to never changes.

The second is the compounded return. Each day's gain is reinvested, so the
next day's return applies to a larger account. One percent on Monday grows the
account; one percent on Tuesday is then one percent of that larger figure.
Over two days the difference is a rounding error. Over years it is not.

**01 · THE TWO CONVENTIONS — Simple against compounded** *(screenshots 07,
33)*

    C_T^simple = Σ_{t=1}^{T} r_t        C_T^comp = Π_{t=1}^{T} (1 + r_t) − 1

*Takeaway:* Simple adds each day's return to a fixed base. Compounded
multiplies, so every gain enlarges the base the next day works on. The two
agree while returns are small and the horizon short, and part company as
either grows.

**FIGURE 2.1 — How simple and compounded returns diverge** *(screenshots 07,
08; interactive)*

- **What it shows:** an interactive line chart on a dark panel. Y-axis ticks
  0%, 200%, 400%, 600%; x-axis ticks 0, 250, 500, 750, 1000 (no axis titles
  drawn). Two lines start together at 0% at day 0 and separate as days pass:
  - a blue line, curving upward, ending at about 172% at 1000;
  - a green line, straight, ending at 100% at 1000.
  No legend is drawn; the readout below names the two values in the same
  colours.
- **Slider:** "Daily return", a green slider set a little under half way,
  with the value "0.10%" at its right end.
- **Readout:** "After 1,000 days, simple **100.0%** (green) compounded
  **171.7%** (blue)".
- **Caption:** *A steady daily gain, drawn both ways. Move the slider to
  change the daily return; the gap between the two lines is compounding's
  contribution. Hover or touch the chart to read either line at any day.*
- Source tag: ILLUSTRATIVE · SYNTHETIC DATA

The figure makes the gap concrete. At a steady gain of 0.1% a day, the two
conventions are almost indistinguishable after a hundred days, but after a
thousand the simple total is 100.0% while the compounded one is 171.7%.
Nothing about the underlying days has changed. The only difference is the
assumption about what happens to each gain once it is made.

That assumption is the heart of the matter. Compounding is not wrong in
general. For a fund whose capital actually grows and is redeployed, compounded
returns are the correct record of what investors experienced, and reporting
them is standard. The question is whether the assumption holds for the
strategy in front of you.

The divergence is not a curiosity. It is the difference between two different
claims about the world. A compounded figure asserts that every gain could have
been reinvested at an ever larger size, indefinitely. For most strategies that
assertion is false, and Lesson 4 showed why.

Every edge has a capacity. Beyond a certain size, a strategy's own trading
moves prices against it, and the impact grows faster than the position: under
the square-root regularity of market impact, doubling a trade raises its cost
per unit by about forty-one percent. An account that compounds without limit
is an account that assumes this cost never arrives. It always does.

> *A compounded figure assumes the account can grow forever. Capacity
> guarantees that it cannot.*

So this series reports simple returns, on a notional account of $200,000. The
compounded figure for the same daily returns would be far larger, and it is
not shown here at all, because it describes something that could not actually
have been earned. A number that cannot be earned has no place in a case study
about honest measurement, however impressive it looks.

> **A CONSEQUENCE WORTH NOTING**
> Because simple returns add, a gain and a loss of the same size cancel
> exactly. That property will matter in §04, where it makes recovery from a
> drawdown symmetric: a fall of a given percentage needs exactly that
> percentage of gain to recover.

The notional $200,000 is a presentation device. Because simple returns scale
linearly, the figure can be read in either direction: every 1% of simple
return is $2,000 on the notional account, and the right-hand axis of each
chart carries the percentage directly, so the result can be read in money or
in percent.

There is a second reason a record is stated in percentages rather than in
money. Lesson 4 showed that the profit an edge can produce is not proportional
to capital: market impact grows with capital to the power 1.5, so net profit
rises, peaks and falls. Figure 2.2 restates the curve. A record in
percentages, uncompounded, reports the edge itself, the return on each unit of
capital at the scale the record simulates; what that edge can carry is a
separate question, answered in a later costing module with the record's own
costs.

**FIGURE 2.2 — Why a percentage record is not a claim about capital**
*(screenshot 10; animated, stepped)*

- **What it shows:** profit a year (units) (y-axis 0 to about 26; ticks 0, 10,
  20) against capital deployed (units) (x-axis 0 to 250; ticks 0, 100, 225,
  250). Three lines from the origin:
  - a grey straight line, rising to about 25 at 250;
  - a red curve, rising ever more steeply, crossing the grey line at about 225
    and ending at about 26 at 250, with pale pink shading between it and the
    grey line;
  - a thick green curve, rising to a flat peak of about 3.3 near 100, then
    falling to 0 at 225 and running along 0 to 250, with faint green shading
    beneath.
  Faint vertical gridlines at 100 and 225. No legend is drawn. *(from page)*
  In the chart data the grey line belongs to step 1, the red to step 2 and the
  green to step 3.
- **Marker:** a green dot on the green curve at 100 with a line to the green
  label "Optimum · a third of the gross edge kept".
- **Step 3 (shown at the top of the chart) — "3 · Net profit peaks, then falls
  to nothing: a percentage record states the edge, not the capital it can
  carry".**
- *(from page)* Step 1: "Gross profit grows with capital".
- *(from page)* Step 2: "Impact cost grows with capital to the power 1.5".
- **Caption:** *Gross profit, impact cost and net profit against capital under
  the square-root law of impact, from Lesson 4.*
- Source tag: ANALYTIC · SQUARE-ROOT LAW

The choice between summing and compounding is not cosmetic. A compounded
record reinvests each day's gain, so that capital grows and later returns are
earned on a larger base; a summed record holds capital at risk constant. The
two diverge by an amount that Lesson 1 derived: along a compounded path,
growth is approximately the mean return less half the variance, and at the
record's volatility of 29.74% the volatility drag is about 4.4% a year. A
compounded presentation of the same daily returns would therefore not only
reach a different end value but would do so by a different route, falling
more steeply in drawdowns, when capital is largest, and rising more steeply in
recoveries.

Institutions report both, for different purposes. The summed record is the
statistician's object: its daily returns are the stationary series on which
the Sharpe ratio, the significance tests of Lesson 11 and the resampling of
Lesson 15 are computed, and its cumulative sum is linear in the edge. The
compounded record is the investor's experience of a particular sizing rule,
one in which exposure is scaled with capital. The series reports the summed
record because its subject is the evidence for the edge; whether to compound,
and at what fraction of capital, is a sizing decision governed by the Kelly
arithmetic of Lesson 1, and it is left to the reader.

There is a related convention about the base. Returns in this record are
expressed on the capital at risk, so that a day's return is a return on the
whole account rather than on the margin posted, and leverage is implicit in
the volatility rather than hidden in the base. Lesson 5 explained that futures
returns are naturally excess returns over the collateral rate; the record is
stated before any interest on collateral, which an investor would add, and
before trading costs, which a later costing module subtracts.

**CHECKPOINT** — Why does this series report simple rather than compounded
returns? *(screenshot 11)*
- Simple returns always produce the larger figure
- Compounding assumes size can grow without limit, which capacity forbids
- Compounded returns cannot be computed from daily data

---

## §03 · The Equity Curve

### Where it *ended*

*Reading the most familiar chart for what it can and cannot tell you.*

An equity curve has two properties worth reading. Its slope over any stretch
is the average return during that stretch: steeper means faster. Its roughness
is the volatility, the size of the day-to-day swings around that average.
Neither captures the internal structure of the path: the depth and duration of
its declines, or how its gains were arranged in time.

Slope and roughness trade off against each other in a way the eye struggles to
separate. A steep, jagged curve and a gentler, smoother one can end at the
same place with very different experiences along the way. The Sharpe ratio,
taken up in Lesson 9, is the number that measures slope against roughness
directly. For now it is enough to see that the curve alone cannot tell you
which of the two you are holding.

**EXHIBIT 1 — The Forecaster Portfolio, historical equity curve**
*(screenshots 12, 13)*

- **What it shows:** two y-axes. Left: "Notional account, $200,000 start"
  (ticks $200K, $400K, $600K, $800K, $1.0M, $1.2M). Right: "Cumulative return,
  simple" (ticks 0%, +100%, +200%, +300%, +400%, +500%). X-axis: years 2022,
  2023, 2024, 2025, 2026.
- A single dark line starts at $200K / 0% at the start of 2022 and rises
  steadily with small wiggles to a dark end dot at about $1.18M, just under
  +500%, in mid-2026. Pale blue-grey shading fills the area beneath the line.
  A visible dip sits in early 2024 (around $500K).
- **Caption:** *Notional $200,000 on the left axis; cumulative simple return on
  the right. Drawn from weekly values, each taken at the week's close.*
- Source tag: HISTORICAL TRACK RECORD · SIMPLE, NO COMPOUNDING · JANUARY 2022
  TO JULY 2026
- **Stat tiles** *(screenshot 13)*:
  - NOTIONAL END VALUE — **$1,178,143** — *from $200,000*
  - CUMULATIVE RETURN — **+489.07%** — *simple, not compounded*
  - RECORD WINDOW — **1,181** — *trading days*

Read as a summary, the curve is plain. From a notional $200,000, the account
ends at $1,178,143, a simple return of +489.07% across 1,181 trading days. The
rise is steady rather than concentrated in one burst, which is itself
informative: a curve that climbs evenly suggests an edge that operated across
conditions, where one that leaps in a single stretch suggests a result that
rests on a single episode.

One detail of how the curve is drawn matters when reading it: it is built from
weekly values.

A professional reading an equity curve looks for three things beyond its
ending. Flat stretches, where the strategy stopped earning for a while, and
how long they lasted. Acceleration, where the slope steepens, and whether it
coincides with a change the reader can identify. And shifts in character,
where the roughness changes abruptly.

Figure 3.1 shows the same record at three resolutions: weekly, monthly and
quarterly. All three end in the same place and tell the same broad story, but
each coarser view loses the falls that happened within its periods. The
quarterly line barely shows the deepest drawdown of §04 at all. This is why
Lesson 5 insisted that a record's resolution be stated: the smoothness of a
curve is partly a property of how often it was drawn.

**FIGURE 3.1 — The same record at three resolutions** *(screenshots 13, 14)*

- **What it shows:** cumulative return, % (y-axis 0 to 500; ticks 0, 100, 200,
  300, 400, 500) against years (x-axis ticks 0, 1, 2, 3, 4). Legend, top left:
  - a thick grey line, "Quarterly";
  - a green line, "Monthly";
  - a thin dark line, "Weekly".
- All three start at 0 and end together at about 490 near 4.7 years. The thin
  dark weekly line is the most jagged; the green monthly line follows it more
  smoothly; the grey quarterly line is a series of straight segments that cuts
  through the dips (for example, it shows nothing of the weekly dip near 2.2
  years and runs straight from about 3.75 to 4 years).
- **Caption:** *Cumulative return of the record drawn weekly, monthly and
  quarterly. Coarser views hide the falls inside their periods.*
- Source tag: HISTORICAL TRACK RECORD · WEEKLY, MONTHLY AND QUARTERLY
  RESOLUTION

Reading an equity curve well is a matter of knowing what its scale shows.
Because the record is summed, the curve is drawn on a linear axis, and a
constant edge appears as a straight line; on a compounded record the same edge
would appear as a straight line only on a logarithmic axis. Local slope is the
local rate of return, and the eye reads it accurately; local roughness is the
local volatility, which the eye reads poorly, because a curve that is drawn
weekly, as this one is, smooths away most of what happened inside each week.
§04 and §05 measure what the smoothing hides.

Two numbers summarise the curve's shape beyond its end value. Its
straightness, the share of variation explained by a straight line, is 0.985;
its K-ratio, which rewards both a steep slope and a steady one, is 8.18.
Neither is a measure of return. A curve can be steep and ragged or shallow and
smooth, and the Sharpe ratio of 3.51 reported here combines the two in a
single figure, average return per unit of volatility. The straightness
statistics ask a different question, whether the return arrived evenly
through time, and the monthly view of §06 answers it in detail.

The curve is also one path among many, which was the subject of Lesson 1. Its
end value is an estimate of the process that produced it, with a standard
error that Lesson 1 computed; its shape is one draw of the ordering of its
days, and Lesson 15 asks what other orderings would have produced. The right
way to read the exhibit, then, is as a single realisation with known
precision, rather than as a promise about the next 1,181 days.

> **RESOLUTION SHAPES WHAT A CHART CAN REVEAL**
> A line through weekly values is smoother than the daily path it summarises.
> Sharp moves inside a single week are averaged into the week's close and
> disappear from view. This is a deliberate choice here, since daily resolution
> is never published, but it is a general lesson: the smoothness of any curve
> is partly a property of its sampling frequency.

One property the curve conceals matters more than the rest. It records the
value of the account, but not the depth or duration of its declines from
previous highs. An account that falls ten percent and recovers within a week
and an account that falls ten percent and stays there for three months can
produce curves that look nearly identical at this scale. As risk events, they
are entirely different.

The depth and duration of declines have a series of their own: the drawdown,
the subject of §04.

A concrete case makes the distinction plain. Picture two accounts that each
fall 10% and each end the year at the same value. The first falls and recovers
inside a single week. The second falls and stays below its previous high for
three months before recovering. At the scale of a multi-year equity curve, the
two dips can look almost identical. In risk terms, those three months dominate
the year.

---

## §04 · The Drawdown

### The path of *drawdowns*

*How deep the falls went, how long they lasted, and why recovery is symmetric
here.*

A drawdown is the distance between where an account is and the highest value
it had reached before. On a day when the account sets a new high, the
drawdown is zero. On every other day it is negative, and its size is the loss
a holder would be sitting on, measured from the best moment they had seen.

That definition makes the drawdown the principal measure of path risk. It
answers the two questions that govern capital allocation to a strategy: how
far it fell from a high, and how long it took to recover.

**02 · THE MEASUREMENT — Drawdown, defined** *(screenshots 16, 34)*

    M_t = max_{s ≤ t} C_s        D_t = C_t − M_t ≤ 0        maximum drawdown = min_t D_t

*Takeaway:* The drawdown is the gap between the account and its highest
earlier value. It is always zero or negative, and its most negative value is
the maximum drawdown.

**FIGURE 4.1 — The deepest drawdown, from peak to new high** *(screenshots 16,
17; animated)*

- **What it shows:** on a white card at left, drawdown (y-axis 0% to −20%;
  ticks 0%, −5%, −10%, −15%, −20%) against "Trading days from the peak"
  (x-axis ticks 0, 10, 20, 30, 40). A red line starts at 0% at day 0 (dark dot,
  label "Peak"), falls gently to about −2.5% by day 10, dips to about −7% near
  day 15, recovers a little to about −5.5% near day 20, falls to about −10.5%
  near day 23, holds near −10% to about day 31, then falls to a red dot
  labelled "Trough −17.25%" at about day 39, and rises steeply to a green dot
  labelled "New high" at 0% at about day 43. Red-to-pink shading fills the area
  between the line and 0%.
- Beneath the axis, two brackets: a red one, "Decline · 39 trading days", from
  day 0 to the trough; a green one, "Recovery · 4 days", from the trough to the
  new high.
- **Readout strip:** DAYS FROM PEAK **43** · PHASE **New high** · DEEPEST
  **−17.25%** (red) · EPISODE **43 days**.
- **Side panel (right):** "PHASE" — "A new high, 43 trading days after the
  peak: 39 days falling and 4 recovering. Depth, duration and recovery,
  measured on the record itself."
- *(from page)* The phases the figure steps through are named "Peak",
  "Decline", "Trough", "Recovery" and "New high"; the screenshot shows the
  last.
- **Caption:** none shown separately; the side-panel text above is the only
  description captured.
- Source tag: HISTORICAL TRACK RECORD · MEASURED EVERY FIVE TRADING DAYS, WITH
  THE EXACT PEAK, TROUGH AND RECOVERY

**EXHIBIT 2 — The Forecaster Portfolio, historical drawdown** *(screenshots
17, 18)*

- **What it shows:** "Drawdown, %" (y-axis 0% to −20%; ticks 0%, −5%, −10%,
  −15%, −20%) against years (x-axis 2022, 2023, 2024, 2025, 2026). A red
  jagged line hangs below 0% throughout, with pale pink shading between it and
  0%: many shallow dips to −2% to −8%, and deeper spikes to about −9% (mid
  2022), about −11% and −13% (2023), about −16% (mid 2024), and about −10% to
  −11% (2025 and early 2026). The line touches 0% repeatedly.
- **Marker:** a dark red dot at the lowest point, early 2024, labelled
  "Maximum drawdown −17.25%".
- **Caption:** *Drawdown below the previous peak, in %. Each week is drawn at
  its lowest reading, so the deepest reading on the chart is the true maximum
  drawdown.*
- Source tag: HISTORICAL TRACK RECORD · % OF STARTING CAPITAL · JANUARY 2022 TO
  JULY 2026
- **Stat tiles** *(screenshot 18)*:
  - MAXIMUM DRAWDOWN — **−17.25%** — *below a previous peak*
  - LONGEST SPELL UNDER WATER — **54** — *trading days*
  - TIME UNDER WATER — **75.3%** — *share of all days*

The deepest fall in the record was −17.25% below a previous high. The longest
spell spent below a previous high lasted 54 trading days. Those two figures,
depth and duration, are the ones to hold in mind when reading any return
figure elsewhere in the series, because they describe what the return
actually demanded of whoever held it.

The character of the drawdowns matters as much as their extremes. The chart
shows frequent, shallow dips and a small number of deeper ones, rather than
long, grinding declines. A strategy whose losses are brief and recovered
quickly asks something very different of its holder from one whose losses
linger, even when the two share the same maximum drawdown.

Depth can also be set against return. Over the record the account gained
+489.07% while its deepest fall was −17.25%. The ratio between annual return
and maximum drawdown is the Calmar ratio, one of the measures Lesson 9
introduces, and it answers a practical question: how much return did the
strategy deliver for each 1% of its worst loss?

**03 · A PROPERTY OF SIMPLE RETURNS — Recovery is symmetric** *(screenshots
18, 19, 35)*

    simple: a fall of x% needs a gain of x%        compounded: a fall of f needs a gain of f / (1 − f)

*Takeaway:* On a simple-return account, a fall and its recovery are the same
size, because the base the returns apply to never shrinks. In compounded terms
a fall of half needs a gain of double.

(In the page screenshots 18 and 19 the formula is cut off at both ends; it is
shown whole in close-up 35.)

This symmetry is easy to overlook and worth stating plainly. On a compounded
account, a fall of fifty percent needs a gain of one hundred percent to
recover, because the lost capital no longer earns anything. On a simple-return
account the base is fixed, so recovering from the deepest fall needed exactly
as large a gain, in percent, as the loss. The drawdown here is therefore a
direct measure of the ground to be made up, with no compounding penalty hidden
inside it.

There is one more subtlety, and it is easy to miss. The maximum drawdown is a
single number drawn from a single history. Had the same days arrived in a
different order, the deepest fall would have been different, possibly
shallower and possibly deeper. Lesson 15 reorders these same days thousands of
times and finds that the real drawdown sits near the middle of what those
orderings produce, but that roughly one ordering in twenty would have fallen
noticeably further. The recorded maximum is a guide to the scale of risk, not
a ceiling on it.

Recovery has its own arithmetic, and it depends on how the record is kept. In
a simple, uncompounded record a loss of 17.25% from the high is recovered by
gaining 17.25%. In a compounded record the same loss leaves 82.75% of the
capital, which must then grow by 20.85% to return to the high; a loss of 50%
would need a gain of 100%. Figure 4.2 shows the two curves diverging as losses
deepen. The record's deepest fall sits where the difference is still modest,
which is one more consequence of its depth being limited.

**FIGURE 4.2 — The arithmetic of recovery** *(screenshots 19, 20)*

- **What it shows:** gain required to recover (y-axis 0 to 100%; ticks 0, 25%,
  50%, 75%, 100%) against loss from the high (x-axis 0 to 50%; ticks 0, 10%,
  20%, 30%, 40%, 50%). Legend, top left: a dark line "Simple record"; a red
  line "Compounded record".
- The dark line is straight, from 0 to 50% at a loss of 50%, ending in a dark
  dot labelled "50.0%". The red curve rises above it ever more steeply, to
  100% at a loss of 50%. Pale pink shading fills the area between them, and
  grey shading beneath the dark line.
- **Markers:** at a loss of 17.25%, a red dot on the red curve labelled
  "Compounded · needs 20.85%" (red) and a dark dot on the dark line labelled
  "Simple · 17.25% needs 17.25%".
- **Caption:** *Gain required to recover a loss from the high, in a simple
  record and in a compounded one, with the record's deepest drawdown of 17.25%
  marked.*
- Source tag: ANALYTIC · MODEL CALCULATION

Drawdown has a theory, and it tells us how deep a fall to expect from a given
edge. For a process with a stable Sharpe ratio S and volatility σ, the
expected deepest drawdown over a long record grows with σ divided by S and
with the logarithm of the record's length; Magdon-Ismail and co-authors gave
the exact expectation for Brownian motion with drift. The practical content is
that drawdown depth is governed by the ratio of volatility to Sharpe ratio:
halving volatility at the same Sharpe ratio halves the expected deepest fall,
and doubling the Sharpe ratio at the same volatility does the same. The
record's deepest fall of 17.25% at a volatility of 29.74% and a Sharpe ratio of
3.51 is close to what that theory implies, and Lesson 15 confirms the point by
placing it at about the 51st percentile of the falls that random reorderings
of the record's own days produce.

Institutions summarise drawdown in several ratios, and the record's values are
reported in Lesson 9. The Calmar ratio divides annual return by the deepest
drawdown; the Martin ratio divides it by the Ulcer index, which averages the
squared depth of every drawdown day rather than taking only the deepest, so
that it rewards shallow, short falls as well as rare deep ones. Both ratios
depend on the record's length, because a longer record has more chances to
produce a deep fall, which is why they are compared only between records of
similar length.

The episode shown in Figure 4.1 is worth reading twice. Its depth, 17.25%, is
the number an allocator would cite; its shape, 39 days down and four days
back, is the more informative fact. Falls that arrive gradually and recover
sharply are characteristic of an edge that continued to operate through a
difficult period rather than one that stopped working; the opposite shape, a
sudden fall followed by a long, grinding recovery, is the signature of a
strategy that lost something it had relied on. The distinction is qualitative
here and quantitative in Lesson 16, which asks how quickly a forward record
could tell the two apart.

**CHECKPOINT** — The equity curve and the drawdown chart are drawn from the
same data. What does the drawdown show that the curve does not? *(screenshot
21)*
- The average return
- How deep the falls went and how long they lasted
- The final value of the account

---

## §05 · Time Under Water

### The arithmetic of *new highs*

*Why a strong strategy still spends most of its days below a previous high.*

The third figure in the drawdown panel is the least intuitive. The account
spent 75.3% of its days below a previous high. The figure is not a loss rate:
it follows from the arithmetic of new highs, and it is typical of strategies
of this strength.

**04 · THE MEASUREMENT — Time under water** *(screenshots 21, 22, 36)*

    TUW = (1/T) #{ t : D_t < 0 }

*Takeaway:* The share of days spent below a previous high. A new high is set
only when a day's gain clears the whole of any open drawdown, so even a
strongly rising strategy sets them on only a minority of days.

Consider what a new high requires. After any loss, the account is below its
peak. To set a new high, it must first recover the entire loss and then add
more. On a day with a gain smaller than the open drawdown, the account rises,
but it is still under water. So even a strategy whose trend is firmly upward
will spend most of its days climbing back towards a peak it has already
reached, and only a minority of days rising above it.

The way to know whether 75.3% is ordinary or not is to compare it with
strategies whose strength is known exactly.

**FIGURE 5.1 — Time under water, against a strategy's strength** *(screenshots
22, 23; interactive)*

- **What it shows:** three vertical bars on a dark panel (y-axis 0% to 100%;
  ticks 0%, 25%, 50%, 75%, 100%), labelled on the x-axis "Sharpe 1.0",
  "Sharpe 2.0", "Sharpe 3.5", each with its value above:
  - Sharpe 1.0, blue: 90.3%;
  - Sharpe 2.0, green (the selected bar): 82.9%;
  - Sharpe 3.5, blue: 72.6%.
- **Readout:** "Sharpe 2.0: under water on **82.9%** of days".
- **Caption:** *Synthetic strategies with a known Sharpe ratio, each run 400
  times over 1,181 days. The bars show the average share of days spent below a
  previous high. Hover a bar to read it.*
- Source tag: ILLUSTRATIVE · SYNTHETIC DATA

The numbers are worth reading closely. At a Sharpe ratio of 1.0 the synthetic
strategies spend 90% of their days under water; at 2.0, 83%; at 3.5, 73%. The
share falls as strength rises, but slowly, and even the strongest case spends
most of its days below a previous high.

It is also worth separating two figures that are easily confused. Winning
days, the share of days with a gain, was 49.87% in this record. Time under
water, the share of days below a previous high, was 75.3%. They measure
different things. A winning day can still be a day under water, if its gain
does not clear the open drawdown. That is why a strategy can win on about half
of its days and still spend three quarters of them below its peak.

The comparison settles the question. A synthetic strategy with a Sharpe ratio
of 1.0 spends around nine days in ten under water. Even at a Sharpe ratio of
3.5, which is roughly the strength of the record in this series, a strategy
spends nearly three quarters of its days below a previous high. The
Forecaster Portfolio's figure of 75.3% sits right where a strategy of its
strength would be expected to sit.

> *Most days below a previous high is not a sign of weakness. It is what a
> rising strategy looks like from the inside.*

> **READING TIME UNDER WATER**
> Time under water describes how gains are arranged in time, not how often the
> strategy loses. It is high whenever gains arrive as a sequence of recoveries
> from small declines, the normal texture of a strategy with a positive but
> noisy edge. Its informative use is comparative, against strategies of the
> same Sharpe ratio as in Figure 5.1, rather than as an absolute figure.

The implication is that the frequency of new highs is a poor measure of a
strategy's quality. The informative quantities are the depth and duration of
its drawdowns, which §04 measured directly, not the share of days spent below
a peak, which is high for almost every strategy with a positive edge.

Time under water is not one number but a distribution of spells. The record
spent its days below the running high in 149 separate spells. The median spell
lasted 2 trading days, 73 of spells ended within five days, 13 lasted longer
than twenty, and the longest, the episode of §04, lasted 54. Figure 5.2 shows
the distribution. Most of the time below the high was a matter of days; the
long spells were few, and the longest was the one that produced the deepest
fall.

**FIGURE 5.2 — How long the spells below the high lasted** *(screenshots 24,
25)*

- **What it shows:** number of spells (y-axis 0 to about 108; ticks 0, 20, 40,
  60, 80, 100) against "Length of the spell below the running high, trading
  days" (x-axis categories). Six bars, each labelled above with its count:
  - "1 to 5", dark navy: 106;
  - "6 to 10", dark navy: 19;
  - "11 to 20", dark navy: 11;
  - "21 to 30", dark navy: 7;
  - "31 to 40", red: 3;
  - "41 to 60", red: 3.
- **Caption:** *Number of spells below the running high by length in trading
  days, over the whole record.*
- Source tag: HISTORICAL TRACK RECORD · SUMMARY STATISTICS

Time under water and drawdown depth are different dimensions of the same
experience, and they do not move together. A record can spend long periods a
small distance below its high, which is uncomfortable but costless, or short
periods far below it, which is the reverse. The record's distribution of
spells in Figure 5.2 is of the first kind in its typical spell and the second
kind in its longest: a median spell of two days, and a single spell of 54 days
that was also the deepest fall. Allocators care about both, because a long
shallow spell tests patience while a deep short one tests capital.

The theory of §04 extends to duration. For a process with a stable positive
Sharpe ratio, the fraction of time spent below the running high is a
decreasing function of the Sharpe ratio alone, which is the curve of Figure
5.1, and the expected length of the longest spell grows with the record's
length. A high-Sharpe record is therefore one that is usually at or near a new
high, and the record's days at a high, and its longest spell, are consistent
with its Sharpe ratio rather than exceptional given it. This is the sense in
which time under water is a property of the edge rather than of luck.

Institutions report the longest recovery time alongside the deepest drawdown,
and some set tolerances on both: a maximum acceptable depth and a maximum
acceptable time without a new high, beyond which an allocation is reviewed.
Lesson 16 turns the second tolerance into a statistical test, asking how long
a forward record can go without a new high before the absence itself is
evidence that the edge has decayed.

**CHECKPOINT** — Why can a strong strategy spend most of its days under water?
*(screenshots 25, 26)*
- Because it loses on most days
- Because a new high needs a gain that clears any open drawdown
- Because drawdowns are measured in compounded terms

---

## §06 · The Monthly View

### How *evenly* it was earned

*Consistency, the worst month, and the order in which to read everything.*

The daily curve and the drawdown describe the path. The monthly table
describes how evenly the result was distributed through time, and that is a
different question. A strategy can earn a large annual return in two
exceptional months and give some of it back in the other ten, or it can earn
the same total steadily. The totals match; the propositions do not.

**EXHIBIT 3 — Monthly returns** *(screenshots 26, 27)*

- **What it shows:** a heatmap table on a white panel, columns Jan to Dec and
  a final green italic column "Year"; rows 2022, 2023, 2024, 2025 and "2026 to
  date". Positive cells are green, deeper green for larger gains (the darkest
  are 2024 Mar and Sep); losing months are red figures on pale grey cells; the
  2026 cells from Aug to Dec are empty pale cells. The Year figures are bold
  green.

| | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec | Year |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2022 | −3.7% | +5.5% | +7.2% | +16.2% | +3.3% | +4.5% | +1.8% | +6.0% | +11.2% | +6.5% | +9.3% | +14.1% | +82.0% |
| 2023 | +10.8% | +2.5% | +17.1% | +5.1% | +2.7% | +9.9% | +2.2% | −6.0% | +16.1% | +5.6% | +6.9% | +12.6% | +85.6% |
| 2024 | −0.7% | −11.5% | +31.1% | +4.9% | +18.2% | −0.1% | +18.4% | +9.5% | +30.3% | +4.8% | −3.5% | +17.4% | +118.7% |
| 2025 | +7.4% | +1.9% | +10.5% | +18.7% | +6.1% | +3.7% | −1.5% | +7.3% | +26.8% | +13.6% | +10.1% | +7.4% | +112.1% |
| 2026 to date | +27.0% | +14.6% | +14.8% | +10.5% | +9.6% | +8.4% | +5.8% | | | | | | +90.7% |

- **Caption:** *Each cell is one month's simple return as a share of starting
  capital. Green cells mark positive months, deeper for larger gains; losing
  months appear as red figures on pale cells. The final column is the year.*
- Source tag: HISTORICAL TRACK RECORD · % OF STARTING CAPITAL · 2026 RUNS TO 24
  JULY
- **Stat tiles** *(screenshot 27)*:
  - POSITIVE MONTHS — **48 of 55** — *months with a gain*
  - BEST MONTH — **+31.11%** — *single month*
  - WORST MONTH — **−11.47%** — *single month*

48 of the 55 months in the record were positive. The best single month
returned +31.11% and the worst −11.47%. Losing months are shown as red
figures, so that the left tail of the monthly distribution is as visible as
its right.

The table rewards a second reading for its spread as well as its count. Most
months sit fairly close together, with a small number of strong months and a
handful of losing ones. The losing months are scattered rather than gathered
into one long run, which is consistent with the drawdown chart's picture of
brief, recovered falls rather than a single extended decline.

That consistency is part of what makes a result credible, and part of what
makes it holdable. A strategy that earns its return across most months gives
its holder regular confirmation that it is working. One that earns it in rare
bursts asks for long patience between them, and patience is precisely what
most people find they do not have once real money is involved.

> **HOW ALLOCATORS READ THE TABLE**
> A professional allocator reads the monthly table early, and reads the worst
> month first. It is the nearest thing the table offers to the cost of a bad
> stretch, and it is the figure most likely to decide whether a strategy could
> be held through the period that produced it.

**EXHIBIT 4 — Annual returns** *(screenshot 28)*

- **What it shows:** horizontal bars, one per year (y-axis 2022, 2023, 2024,
  2025, "2026 to date"), against return (x-axis 0% to 160%; ticks 0%, 20%,
  40%, 60%, 80%, 100%, 120%, 140%, 160%). Each bar is labelled at its end:
  - 2022, green: +82.0%;
  - 2023, green: +85.6%;
  - 2024, green: +118.7%;
  - 2025, green: +112.1%;
  - 2026 to date, pale green: +90.7%, followed by the grey text "partial year,
    the one-shot holdout".
- **Caption:** *Simple return by calendar year. 2026 is a partial year, to 24
  July, and it is also the one-shot holdout year examined in Lesson 14.*
- Source tag: HISTORICAL TRACK RECORD · % OF STARTING CAPITAL

One detail matters when comparing the years: 2026 is incomplete, running only
to late July, so it should not be read as a full year alongside the others. It
is also the one-shot holdout year, the subject of Lesson 14.

Taken together, the three charts in this lesson give a complete first reading
of the historical track record. The equity curve says where it ended. The
drawdown says what it cost to get there, in depth and in time. The monthly
view says how evenly the result was earned. Each one is necessary, and none of
them is sufficient on its own.

Figure 6.1 gathers the 55 months into one distribution. 48 of them were
positive; the mean month returned +8.89%; the best month gained 31.11% and the
worst lost 11.47%. The shape is the monthly counterpart of the daily skewness
Lesson 1 measured: a long right tail of strong months and a short left tail,
with the losing months clustered close to zero.

**FIGURE 6.1 — The distribution of the months** *(screenshot 29)*

- **What it shows:** a histogram of months (y-axis 0 to 12; ticks 0, 2, 4, 6,
  8, 10, 12) against monthly return, % (x-axis about −16 to 34; ticks −10, 0,
  10, 20, 30), in bins about 2.5 points wide. Red bars (losing months), left
  to right: 1 (around −11), 1 (around −6), 2 (around −4), 3 (just below 0).
  Green bars: 3 (0 to 2.5), 7, 12 (the tallest, around 5 to 7.5), 5, 5, 5, 4,
  3 (around 17.5 to 20), then a gap, 2 (around 25 to 27.5), a gap, and 2
  (around 30 to 32.5).
- A grey dashed vertical line at 0; a solid dark vertical line at the mean,
  labelled in bold "Mean · +8.89%".
- **Text, top right:** "48 of 55 months positive" / "best +31.11%, worst
  −11.47%".
- **Caption:** *The record's 55 monthly returns as a histogram, with the mean
  marked and losing months in red.*
- Source tag: HISTORICAL TRACK RECORD · MONTHLY RESOLUTION

The monthly series has statistics of its own, and they corroborate the daily
ones. Across the 55 months the mean return was +8.89% with a standard
deviation of 8.51%, which gives a monthly Sharpe ratio, annualised by the
square root of twelve, of 3.62; the daily figure is 3.51. The two differ
because aggregation to months changes the measured volatility when returns
are serially dependent, and Lesson 9 examines the dependence directly. Over
rolling twelve-month windows the record never lost: its weakest twelve months
returned +60.0% and its strongest +156.0%. Every one of its 18 of 18 quarters
was positive, a fact Lesson 1 showed to be consistent with the record's
Sharpe ratio rather than a separate finding.

The heatmap invites a reading that should be resisted. With fewer than five
observations of each calendar month, any pattern across the columns, strong
springs or weak autumns, is within the noise of estimation, and the series
does not read seasonality into the record. What the heatmap shows reliably is
the texture of the return: how evenly it arrived, where the losing months fell
and how they were surrounded, and that the strongest months, including the
best at +31.11%, were spread across years rather than concentrated in one.

Annual returns deserve the same care. The years differ, and the first and last
are partial, so the annual figures are read as the record's return through
each environment of Lesson 5 rather than as a forecast of a typical year.
Their consistency, each year positive and none dominated by a single month, is
what the heatmap and the distribution of Figure 6.1 establish between them:
the record's return was earned broadly, through time, rather than in a few
fortunate stretches.

**Three views of one record** *(screenshot 30)*

- **01 · DRAWDOWN — Depth and duration.** The path of declines from previous
  highs, and the time taken to recover from each.
- **02 · DISTRIBUTION — Consistency across horizons.** How returns are spread
  across months and years, and the shape of the left tail.
- **03 · EQUITY CURVE — Value and average slope.** The cumulative result and
  the average rate at which it accrued.

The next lesson turns these three charts into the numbers an institutional
allocator asks for, and explains what each one misses.

**CHECKPOINT** — Which view isolates how evenly the record's returns were
earned? *(screenshots 30, 31)*
- The equity curve
- The drawdown series
- The monthly and annual distribution

> **NEXT · LESSON 09 — The Institutional Metric Set**
> Every chart in this lesson, summarised in the numbers an institutional
> allocator asks for, and what each one misses.

---

## Appendix · Glossary and Sources

### Terms and *sources*

*(screenshots 31, 32)*

| Term | Definition |
|---|---|
| Equity curve | The value of an account over time. |
| Simple return | Daily gains and losses added on a constant account size. |
| Compounded return | Daily gains reinvested, so the account size each return applies to grows. |
| Drawdown | How far the account sits below its highest earlier value. |
| Maximum drawdown | The deepest drawdown in the record. |
| Time under water | The share of days spent below a previous high. |
| Capacity | The most capital an edge can absorb before its own trading erodes it. |
| Historical track record | A strategy's defined rules applied to historical data. Evidence that a process produced a result on past data. |

### Sources

- Historical track record. Forecaster Portfolio daily record, 3 January 2022 to 24 July 2026; cumulative figures from the record's own cumulative column.
- Method. Simple returns; drawdown from the running peak; weekly resolution for published charts; monthly resolution for published figures.
- Magdon-Ismail, Atiya, Pratap and Abu-Mostafa (2004). On the maximum drawdown of a Brownian motion, Journal of Applied Probability 41(1).
- Kestner (2003). Quantitative Trading Strategies, McGraw-Hill.

*Educational content only. Not financial advice.*
