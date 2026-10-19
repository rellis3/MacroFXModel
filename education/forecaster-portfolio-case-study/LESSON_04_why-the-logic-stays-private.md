# Case Study: The Forecaster Portfolio — Lesson 04 of 17

## Why the Logic Stays *Private*

> **Source:** Colez Trades (cog) education, "Case Study: The Forecaster
> Portfolio". Module 02 · The System. Case Study · Lesson 04 of 17 (CS · 04).
> Page: cog000.github.io/Forecaster-Portfolio-Case-Study/lesson-04/
>
> **Transcription note:** copied from full-page screenshots of the lesson,
> taken 2026-10-18 in a desktop browser (1200 px wide) after entering the
> access key and accepting the disclaimer. Nothing has been added or inferred.
> The original screenshots are kept in `screenshots/lesson-04/`: 01–27 are the
> page in order, and 28–39 are landscape close-ups of formula boxes 01–12.
> Each figure below names the screenshot it appears in and is described in
> words (axes, lines, colours, labels, caption), as shown. Where something was
> not visible it is marked **[not captured]**. Checkpoint answers are listed
> as shown; the lesson did not mark a correct answer.
>
> **Also from the page (2026-10-18):** the charts step through numbered stages
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

*An edge is an asset that wears out as others learn of it. The economics of
decay, capacity and crowding explain why systematic firms keep their logic
proprietary, and how evidence can still be shown without it.*

### The economics of *proprietary* logic

*Why the value of an edge depends on who else knows it.*

| | |
|---|---|
| Series | Case Study: The Forecaster Portfolio |
| Subject | The economics of edges |
| Method | Edge valuation, market impact, effective independence |
| Reading time | About 45 minutes |

An edge in a financial market is a wasting asset. Its value depends on how
much it earns and, above all, on how long it lasts, and how long it lasts
depends on how many others come to know it. Market impact limits how much
capital any edge can support, and imitators who trade the same edge share both
its return and its liquidity, so that crowded strategies fail together.

This lesson develops the economics behind the Forecaster Portfolio's decision
to keep its logic private: the valuation of a decaying edge, the square-root
law of market impact and the optimal size it implies, the arithmetic of
correlated imitation, the structural advantage of small capital in edges too
small for institutions, the cost of disclosure, and how evidence can be made
public while the recipe is not. Every model in it is general; none describes
the system.

---

## §01 · Decay

### An edge is a *wasting* asset

*Why the value of an edge is proportional to how long it lasts.*

An edge in a financial market is an asset. Like any asset it produces a stream
of returns, and like many assets it wears out. Unlike machinery, it does not
wear out through use alone; it wears out as others discover it. Every trader
who finds the same pattern and acts on it takes part of the return, and the
pattern weakens as capital accumulates against it. The economics of systematic
research begin from this fact: an edge is a wasting asset, and its value
depends above all on how long it lasts.

The formal statement is simple. Suppose an edge earns α a year at first and
decays exponentially, halving every h years, and suppose future returns are
discounted at a rate r. Its present value is the integral of the decaying,
discounted stream, which is α divided by the sum of the decay rate, ln 2 / h,
and the discount rate. For α of 10% and r of 5%, an edge with a one-year
half-life is worth about 13.5% of the capital deployed, one with a three-year
half-life about 35.6%, and one with a ten-year half-life about 83.8%. A
permanent edge would be worth 200%.

**01 · VALUATION — The present value of a decaying edge** *(screenshots 02,
03, 28)*

    V = ∫₀^∞ α e^{−(ln 2/h + r) t} dt = α / (ln 2/h + r)

*Takeaway:* An edge earning α a year that halves every h years, discounted at
r, is worth α divided by the sum of its decay rate and the discount rate.

Figure 1.1 shows the accumulation. All three edges begin at the same rate and
differ only in how quickly they decay. The shaded area between the longest and
shortest half-lives is value lost purely to faster decay, and it is larger
than the entire value of the short-lived edge. At short half-lives value is
close to proportional to the half-life itself: doubling how long an edge lasts
roughly doubles what it is worth.

**FIGURE 1.1 — Value is proportional to durability** *(screenshot 03;
animated, stepped)*

- **What it shows:** accumulated value, % of capital (y-axis 0% to 75%+)
  against years (x-axis 0 to 20 years). Three curves start together at 0% and
  rise, each flattening out:
  - navy, the highest, still rising at 20 years, close to 75%, labelled at
    about year 18 "Ten-year half-life · 83.8%";
  - slate grey, levelling off at about 35%, labelled "Three years · 35.6%";
  - red, levelling off early at about 13%, labelled "One year · 13.5%".
- The area between the navy curve and the lower curves is shaded pale red.
- **Step 3 (shown in the chart) — "3 · The shaded value is lost to faster
  decay: value is proportional to half-life".**
- *(from page)* Step 1: "1 · An edge of 10% a year with a ten-year half-life".
- *(from page)* Step 2: "2 · The same edge with half-lives of three years and
  one year".
- **Caption:** *Accumulated discounted value of an edge earning 10% a year,
  for half-lives of ten, three and one year, discounted at 5%.*
- Source tag: ANALYTIC · MODEL CALCULATION

Why do edges decay at all? Grossman and Stiglitz gave the foundational answer
in 1980. If prices fully reflected all available information, no one would
have an incentive to pay the cost of gathering it, and prices could not then
reflect it. Markets can therefore be efficient only up to the cost of
information: edges exist as compensation for the cost of finding them, and
they shrink as more participants pay that cost. Decay is the market's way of
bringing returns into line with the cost of discovery.

The empirical evidence is consistent. McLean and Pontiff studied nearly a
hundred published return predictors and found their average predictability
about 26% lower after the end of the original sample, and about 58% lower
after publication. The first figure reflects the optimism of in-sample
research; the second, the arrival of capital once the edge was known.
Publication, in effect, starts a clock.

Imitation divides the return directly. In the simplest case, an edge of fixed
size traded identically by several competitors is split among them: one
imitator halves each holder's share, four reduce it to a fifth, nine to a
tenth. Figure 1.2 shows the decline. In practice the division is worse than
proportional, because imitators also compete for the same liquidity, the
subject of §02.

**FIGURE 1.2 — Imitation divides the edge** *(screenshot 04)*

- **What it shows:** share of the edge kept (y-axis 0% to 100%) against
  imitators trading the same edge (x-axis 0 to 20; ticks 0, 5, 10, 20). A
  single navy curve falls steeply from 100% at 0, then flattens towards the
  bottom on the right. The area under it is shaded grey.
- **Markers:** "One imitator · 50%" (green); "Four · 20%" (grey); "Nine ·
  10%" (red); end label "0.05%" at 20.
- **Caption:** *Share of a fixed edge kept by each holder against the number
  of imitators trading it identically.*
- Source tag: ANALYTIC · MODEL CALCULATION

Decay leaves a signature in a strategy's own record. An edge that is being
competed away shows a declining risk-adjusted return over successive periods,
a shrinking response to the same conditions, and rising costs as others trade
in the same direction. None of these is conclusive on its own, because a
single record is one path among many, as Lesson 1 showed; but together they
are the evidence a disciplined firm watches for, and Lesson 16 returns to how
quickly such decay can be detected.

Decay also sets the pace of research. A firm that holds several edges, each
decaying, must discover new ones at the rate at which the old ones wear out
simply to keep its returns constant. If edges halve every three years, roughly
a fifth of the value of the collection is lost each year and must be replaced.
This is the research treadmill, and it connects the economics of this lesson
to the mathematics of Lesson 2: a search whose duration cannot be scheduled
must nonetheless keep pace with a decay that never stops.

The treadmill has an exact form. Little's law, a result from the theory of
queues, states that the average number of items in a stable system equals the
rate at which they arrive multiplied by the average time each spends in it.
Applied to a research firm, the number of live edges it can sustain equals its
rate of discovery multiplied by the average life of an edge. A firm that finds
2 new edges a year, each lasting 5 years on average, sustains about 10 live
edges. If competition halves the average life, the firm must double its rate
of discovery merely to hold its breadth, and with it, by the fundamental law
of Lesson 3, its information ratio.

**02 · RESEARCH CAPACITY — Little's law** *(screenshots 04, 05, 29)*

    L = λ W

*Takeaway:* The average number of live edges L equals the discovery rate λ
multiplied by the average life of an edge W.

**FIGURE 1.3 — The research treadmill** *(screenshot 05)*

- **What it shows:** live edges in steady state (y-axis 0 to 50) against new
  edges discovered a year (x-axis 0 to 5). Three straight lines rise from the
  origin, with light shading beneath them. Legend, top left:
  - navy "Average life 10 years", reaching 50 at 5 (end label "50.0");
  - green "5 years", reaching 25 at 5;
  - grey "2 years", reaching 10 at 5.
- **Marker:** a green dot on the green line at 2 discoveries a year, labelled
  "2 a year × 5 years · 10 live edges".
- **Caption:** *Live edges sustained in steady state against the rate of
  discovery, for average edge lives of ten, five and two years.*
- Source tag: ANALYTIC · LITTLE'S LAW

Uncertainty about durability matters as well. The value of an edge, α/(ln 2/h
+ r), is a convex function of its decay rate, so by Jensen's inequality an
edge whose half-life is uncertain is worth more in expectation than one with
the same average decay rate known for certain. That expected value, however,
is carried by the chance of an unusually long life, and the realised value
varies widely. A portfolio of edges diversifies this uncertainty in the same
way that it diversifies returns.

Edges leak through identifiable channels: publication, the movement of staff
between firms, counterparties who observe order flow and infer the logic
behind it, and competitors who reverse-engineer a strategy from its returns or
its holdings. Firms that keep their logic proprietary manage each channel.
Research is compartmentalised so that no individual holds the whole; execution
is spread across counterparties and varied in timing so that order flow
reveals little; and what is published about performance is chosen so that it
cannot be inverted into the rules that produced it. The last of these is the
principle this series follows, and §04 sets out why.

The implication for a research firm is direct. The value of an edge lies less
in its initial strength than in its durability, and durability is largely a
matter of how many others come to know it. Protecting the half-life is one of
the most valuable things a firm can do with an edge it has found, and it is
the economic reason systematic firms keep their logic proprietary.

> *An edge is worth roughly its return multiplied by how long it lasts.
> Keeping the logic proprietary protects the second factor.*

**CHECKPOINT** — Two edges earn 10% a year at first. One halves in a year, the
other in ten years. Why is the second worth so much more?
- It starts at a higher rate
- The value of an edge is roughly proportional to its half-life
- It carries less risk

---

## §02 · Capacity

### The limits of *capacity*

*Why an edge can support only so much capital, and why the best size keeps a
third of it.*

Even an edge that no one else knows has a limit. Trading moves prices against
the trader, and the cost of that movement, market impact, grows with the size
of the trade. An edge that earns a clear profit on a small position can be
consumed entirely by impact on a large one. Capacity, the amount of capital an
edge can support, is therefore a property of the edge and the market together,
not of the edge alone.

The shape of market impact is one of the best-established regularities in
market microstructure. Across markets and decades, the price impact of
executing a large order grows approximately with the square root of its size
relative to market volume, scaled by the asset's volatility. Almgren, Thum,
Hauptmann and Li estimated it directly from institutional executions; Tóth and
co-authors showed why it arises from the way liquidity is distributed around
the price. Because impact per unit traded rises with size, total impact cost
grows with size to the power of 1.5.

Combine that with an edge that earns α on each unit of capital, and the profit
from deploying capital C is αC less a cost proportional to C^1.5. Profit rises
at first, peaks and then falls, reaching zero where impact consumes the edge
entirely. Setting the derivative to zero gives the optimum and a striking
result: at the optimal size, impact takes exactly two thirds of the gross
profit, and the net edge on each unit of capital is α/3.

**03 · CAPACITY — The square-root law and the optimal size** *(screenshots 06,
07, 30)*

    P(C) = α C − η C^{3/2},      C* = (2α / 3η)²,      P(C*) / C* = α / 3

*Takeaway:* Gross profit grows in proportion to capital while impact cost
grows with capital to the power 1.5. At the optimum, a third of the gross edge
is kept.

Figure 2.1 builds the result. With a gross edge of 10% and impact scaled so
that the optimum falls at 100 units of capital, gross profit there is 10.00
units, impact cost 6.67 and net profit 3.33. Beyond the optimum each
additional unit of capital adds less than it costs, and at 225 units the net
profit is gone.

**FIGURE 2.1 — Where size stops paying** *(screenshot 07; animated, stepped)*

- **What it shows:** profit a year (units) (y-axis 0 to 25) against capital
  deployed (units) (x-axis 0 to 250; ticks 0, 100, 225, 250). Three lines:
  - a grey straight line (gross profit) rising from 0 to 25 at 250;
  - a red curve (impact cost) starting flat and bending upwards, crossing the
    grey line at about 225 and ending a little above 25;
  - a thick green hump (net profit) rising to a peak of about 3.3 at 100,
    falling back to zero at 225, then running along zero to 250.
- Light shading: pale green under the green hump, pale red between the red
  and grey lines to the right of their crossing.
- **Markers:** green "Optimum · capital 100", with "net 3.33 of gross 10.00"
  beneath; red "Net profit gone at 225".
- **Step 3 (shown in the chart) — "3 · Net profit peaks where a third of the
  gross edge is kept".**
- *(from page)* Step 1: "1 · Gross profit grows in proportion to capital".
- *(from page)* Step 2: "2 · Impact cost grows with capital to the power 1.5,
  by the square-root law".
- **Caption:** *Gross profit, impact cost and net profit against capital for
  an edge of 10% under the square-root law.*
- Source tag: ANALYTIC · MODEL CALCULATION

Figure 2.2 shows the same economics per unit of capital. The net return falls
steadily from the gross edge of 10% towards zero, passing 3.33% at the
optimum. An investor who cares about return on capital would prefer to stay
smaller than the optimum; a manager paid on assets is tempted to grow beyond
it. This tension sits at the centre of institutional investment management.

**FIGURE 2.2 — Return on capital falls with size** *(screenshots 07–08)*

- **What it shows:** net return on capital (y-axis about −2% to 10%; ticks
  0%, 5%, 10%) against capital deployed (units) (x-axis 0 to 250; ticks 0,
  100, 225). A single navy curve falls from 10% at 0, steeply at first and
  then more gently, crosses 0% at 225 and continues slightly below zero. The
  area under it is shaded grey.
- A dashed horizontal line at 0%, labelled "No net edge".
- **Markers:** grey "Gross edge · 10%" at 0; green "At the optimum · 3.33%" at
  100; a red dot at 225, labelled "225".
- **Caption:** *Net return per unit of capital against the capital deployed.*
- Source tag: ANALYTIC · MODEL CALCULATION

The square-root law is not the only model of impact, and the contrast is
instructive. Kyle's 1985 model of an informed trader facing market makers
implies impact linear in order size: prices move in proportion to the quantity
traded, because market makers infer information from order flow. Empirically,
large institutional orders move prices less than a linear law would predict,
and the square root describes them better across a wide span of sizes. The
difference matters for capacity, because under a linear law impact cost grows
with the square of size and the optimum keeps half of the gross edge rather
than a third.

Capacity can be stretched, within limits, by the way orders are executed.
Spreading a large trade over time reduces impact but exposes the position to
price movements while it is being built or unwound. Almgren and Chriss
formalised this trade-off: the optimal execution schedule balances the
expected cost of impact against the variance of the price path, and a more
risk-averse trader executes faster at a higher expected cost. Execution is
therefore part of an edge's economics, not an afterthought, and a strategy's
true capacity depends on how patiently it can trade.

Turnover is the hidden variable in capacity. Impact is paid every time the
portfolio trades, so a strategy that turns its positions over τ times a year
pays impact τ times. With profit αC − τηC^1.5, the optimal capital falls with
the square of turnover: doubling turnover cuts capacity to a quarter, and a
strategy that trades monthly supports about 1/144 of the capital of one that
trades annually. In the example of this chapter, capacity falls from 100 units
at annual turnover to 25 at twice a year and about 0.69 at monthly turnover.

**04 · TURNOVER — Capacity and turnover** *(screenshots 08, 31)*

    P(C) = α C − τ η C^{3/2}  ⇒  C*(τ) = C*(1) / τ²

*Takeaway:* Paying impact τ times a year multiplies the cost term by τ, so
optimal capital falls with the square of turnover.

**FIGURE 2.3 — Faster strategies are smaller** *(screenshots 08–09)*

- **What it shows:** capacity, units of capital (logarithmic y-axis, 0.1 to
  100) against portfolio turnover (logarithmic x-axis, labelled "1 a year",
  "quarterly", "monthly", "weekly"). A single red straight line falls from top
  left to bottom right. The area under it is shaded pale red.
- **Markers:** navy "Annual · 100"; grey "Twice a year · 25"; red "Monthly ·
  0.69"; end label "0.04" at weekly.
- **Caption:** *Optimal capital against portfolio turnover under the
  square-root law, on logarithmic scales.*
- Source tag: ANALYTIC · SQUARE-ROOT LAW

Impact is also not wholly permanent. Part of the price movement caused by a
trade reverts as liquidity replenishes, and Bouchaud, Gefen, Potters and Wyart
described this with propagator models in which the impact of each trade decays
as a power of the time since it was made. Transient impact rewards patience: a
strategy that trades slowly lets earlier impact decay before adding more,
while one that trades quickly pays for its own recent trades. The economics of
capacity therefore depend jointly on how large a strategy is, how often it
trades and how its trades are spread in time.

Capacity is additive across independent markets in a way that edge is not. An
edge that operates in many unrelated markets can deploy capital in each up to
that market's own optimum, so total capacity grows with the number of markets
while the impact in each stays within its own limit. This is breadth in the
sense of Lesson 3, applied to capital rather than to information, and it is
one reason why systematic strategies that span many markets can operate at a
scale that a single-market strategy cannot.

Berk and Green turned the tension into a theory of the industry. In their
model, investors allocate capital to managers with evident skill until
diseconomies of scale, such as impact, compete the excess return away. Skill
persists, but returns to investors do not, because capital flows to wherever
returns are high. Capacity and fees, rather than an absence of skill, bring
net performance back towards the market. The model explains why capable
managers close strategies to new money, and why capacity is managed as
carefully as the edge itself.

Capacity also shapes the case for keeping the logic proprietary. An edge known
to others is not only shared; the combined capital trading it moves along the
same impact curve, so every holder's costs rise together. A private edge is a
private capacity. Disclosure adds other traders' capital to the same curve and
pushes every holder past the optimum.

> *At the optimal size, impact takes two thirds of the gross profit. Every
> unit of someone else's capital on the same curve takes more.*

**CHECKPOINT** — Under the square-root law of impact, what fraction of the
gross edge is kept at the profit-maximising size?
- All of it
- Half
- A third

---

## §03 · Crowding

### Correlated *imitation*

*Why many similar strategies behave like a few, and why crowded trades unwind
together.*

Imitation rarely produces exact copies. Competitors who study the same markets
with similar methods arrive at strategies that differ in detail but whose
returns are highly correlated. Correlation changes the arithmetic of
independence in two distinct ways, and both matter for how edges are evaluated
and how they fail.

The first concerns diversification. The variance of an average of N strategies
with pairwise correlation ρ equals that of N/(1 + (N − 1)ρ) independent
strategies. With a hundred strategies at a correlation of 0.9, the effective
number by this measure is only 1.11: a hundred strategies diversify almost no
better than one. Adding correlated strategies adds capital, not independence.

The second concerns selection. When the best of many trials is chosen, what
matters is the expected maximum, and for equally correlated normal trials it
is the independent value scaled by √(1 − ρ). The best of a hundred independent
trials is expected to lie about 2.51 standard deviations above the mean; at a
correlation of 0.9 the expectation falls to about 0.79, the same as the best
of about 2.8 independent trials. By this measure a hundred trials at 0.9
behave like about three.

**05 · INDEPENDENCE — Two measures of effective independence** *(screenshots
10, 11, 32)*

    N_var = N / (1 + (N − 1)ρ),      E[max_{i≤N} X_i] = √(1 − ρ) E[max_{i≤N} Z_i]

*Takeaway:* The variance of the average implies N_var independent trials; the
expected maximum of correlated trials is the independent value scaled by √(1 −
ρ).

Figure 3.1 compares the two measures across correlations for a hundred trials.
They agree at the extremes and differ in between, because they answer
different questions: one asks how much risk is diversified, the other how much
the best result is flattered by choice. Lesson 12 returns to the second when
it corrects the record's significance for the breadth of the search, and the
answer depends on stating which measure is meant.

**FIGURE 3.1 — Two kinds of independence** *(screenshot 11; animated,
stepped)*

- **What it shows:** effective independent trials (logarithmic y-axis, 1 to
  100) against average correlation between trials (x-axis 0 to 1; ticks 0,
  0.5, 0.9, 1). Both curves start at 100 at a correlation of 0:
  - a green line falls almost straight across the log scale, then bends
    down towards the right-hand end, reaching about 1.5 near a correlation of
    0.98;
  - a navy curve drops very steeply at first, to about 10 by a correlation
    of about 0.1, then flattens towards 1 on the right.
- The area between the two curves is shaded pale green; the area under the
  navy curve is shaded grey.
- **Markers:** green "Best result · 2.8" and navy "Variance · 1.11", both at
  a correlation of 0.9.
- **Step 3 (shown in the chart) — "3 · At a correlation of 0.9: about 1.1 by
  variance, about 2.8 by the best result".**
- *(from page)* Step 1: "1 · By variance: 100 trials shrink quickly towards
  one as correlation rises".
- *(from page)* Step 2: "2 · By the expected best result: correlated trials
  still offer some choice".
- **Caption:** *Effective independent trials among a hundred equally
  correlated trials: by the variance of their average and by their expected
  best result.*
- Source tag: ANALYTIC · MODEL CALCULATION

Correlation among competitors also shapes how edges fail. When many funds hold
similar positions they share not only returns but liquidity. If one must
reduce its exposure, whether because of losses elsewhere or investor
withdrawals, its selling moves prices against all the others, whose losses may
force them to sell in turn. By the square-root law, when k equal holders
liquidate at once each pays impact on the combined size, and each holder's
cost rises by a factor of √k: 2.0 times for four holders, 3.16 times for ten.
Figure 3.2 shows the multiplier.

**FIGURE 3.2 — Crowded exits cost more** *(screenshots 11–12)*

- **What it shows:** impact cost per holder, multiple of alone (y-axis 0 to
  4×+) against equal holders liquidating together (x-axis 1 to 20; ticks 1, 4,
  10, 20). A single red curve rises from 1× at 1 holder, steeply at first and
  then more gently. The area under it is shaded pale red.
- **Markers:** "Four holders · 2.0×"; "Ten · 3.16×"; end label "4.47" at 20.
- **Caption:** *Impact cost per holder, as a multiple of liquidating alone,
  against the number of equal holders liquidating together.*
- Source tag: ANALYTIC · SQUARE-ROOT LAW

Crowded exits rarely stop at one round of selling. Brunnermeier and Pedersen
showed how market liquidity and funding liquidity reinforce each other: losses
tighten the funding available to leveraged traders, forcing sales that worsen
market liquidity, which produces further losses and tighter funding. The
result is a liquidity spiral, in which prices overshoot and correlations among
otherwise unrelated positions rise sharply because the same holders are
selling all of them.

Institutions respond by treating crowding as a measurable risk. Common
indicators include the correlation of a strategy's returns with those of
peers, the overlap of reported holdings, short interest and the cost of
borrowing securities, and the behaviour of the strategy on days when similar
strategies are known to have suffered. Stress tests model the forced
liquidation of crowded positions at impact costs scaled for simultaneous
selling, and liquidity-adjusted risk measures charge each position for the
time and cost of exiting it. An edge that others do not hold is, among other
things, an edge that does not require these defences.

Competition for the same edge can be solved exactly. Suppose k firms trade one
edge against the same square-root impact curve, each choosing its own capital
given the others'. This is Cournot competition, and its symmetric equilibrium
has a closed form. As firms join, total capital rises towards zero-profit
capital, at which impact consumes the edge entirely, and industry profit falls
as 1/(2k + 1). With two firms the industry earns 86.4% of what a single firm
would; with five, 50.7%; with ten, 29.2%, of which each firm earns about 2.9%;
with twenty, 15.7%. Total capital with ten firms is already 204% of the
single-firm optimum.

**06 · COMPETITION — Cournot competition on a shared edge** *(screenshots 12,
33)*

    Π_k = α³ / [ η² (2k + 1) (1 + 1/(2k))² ],      Q_k → (α / η)²

*Takeaway:* k firms trading one edge against the same impact curve earn
industry profit falling as 1/(2k + 1), while total capital rises towards
zero-profit capital.

**FIGURE 3.3 — Competition converts edge into impact** *(screenshots 12–13;
animated, stepped)*

- **What it shows:** % of the single-firm optimum (y-axis 0% to 200%+)
  against firms trading the same edge (x-axis 1 to 20; ticks 1, 5, 10, 20).
  Both lines start at 100% for one firm:
  - a grey line rises steeply, then flattens just above 200% (total
    capital); the area beneath it is shaded light grey;
  - a red line falls, steeply at first and then gently, to below 25% by 20
    firms (industry profit); the area beneath it is shaded pale red.
- A dashed horizontal line near the top, labelled "Zero-profit capital".
- **Markers:** grey "Total capital 204%" at 10 firms; red "Ten firms ·
  industry profit 29.2%", with "each firm 2.9%" beneath.
- **Step 3 (shown in the chart) — "3 · Industry profit falls as 1/(2k + 1):
  competition converts edge into impact".**
- *(from page)* Step 1: "1 · One firm alone: capital at the optimum, profit at
  its maximum".
- *(from page)* Step 2: "2 · As firms join, total capital rises towards
  zero-profit capital".
- **Caption:** *Industry profit and total capital, as percentages of the
  single-firm optimum, against the number of firms trading the same edge in
  Cournot equilibrium.*
- Source tag: ANALYTIC · COURNOT EQUILIBRIUM UNDER THE SQUARE-ROOT LAW

The equilibrium explains why imitation is so destructive. Each entrant earns
something, so entry continues; but each also adds capital to the shared impact
curve, so every incumbent's profit falls. The edge is not so much taken as
dissipated: the return it generated is transferred, through impact, to the
providers of liquidity on the other side of the trades.

Crowded exits share the structure of a bank run. Diamond and Dybvig showed
that when depositors fear that others will withdraw, withdrawing first is
individually rational even when staying would be collectively better. Holders
of a crowded position face the same incentive: the first to sell pays the
least impact, and the fear of others selling is itself a reason to sell.
Institutions therefore watch for the conditions in which such runs become
likely. Kritzman, Li, Page and Rigobon proposed the absorption ratio, the
share of total variance explained by a small number of common factors, as a
measure of how tightly markets are coupled; a rising absorption ratio signals
that positions increasingly move together, and that an exit by some holders
will be felt by all.

August 2007 made the mechanism concrete. In the second week of the month many
quantitative equity strategies suffered sharp, simultaneous losses without any
major market news. Khandani and Lo attributed the episode to the rapid
unwinding of similar portfolios: liquidation by one or more large holders
pushed prices against every fund with overlapping positions and triggered
further de-risking. Strategies that had looked diversified across firms proved
to be one crowded trade.

For a research firm, the lesson is that an edge's risk depends on who else
holds it. A privately held edge carries its own impact and its own drawdowns;
a widely held one carries everyone's. Keeping an edge proprietary protects not
only its return but its independence, and with it the reliability of every
risk estimate built on the assumption that the edge's behaviour is its own.

> *A crowded edge is not one edge held many times. It is one position, held
> together, that must be sold together.*

**CHECKPOINT** — A hundred strategies have pairwise correlation 0.9. Roughly
how many independent strategies do they equal for diversification?
- About 100
- About 10
- About one

---

## §04 · Scale

### The structural advantage of *small capital*

*Why edges too small for institutions are the natural territory of the
individual trader.*

The economics of capacity have a consequence that is easy to miss when they
are viewed from the side of a large firm. An institution does not merely
prefer edges with large capacity; it cannot use any other kind. Every strategy
it runs carries fixed costs of research, staff, data, infrastructure and
compliance, and a strategy is worth running only if its net profit covers
them. Combined with the result of §02, that at the optimal size an edge keeps
a third of its gross return, this sets a precise lower limit on the capacity
an institution can use.

If a strategy's fixed costs are F a year and its gross edge is α, the net
profit at optimal capital C is αC/3, and the strategy covers its costs only if
C is at least 3F/α. With fixed costs of $2 million a year and an edge of 10%,
the minimum is $60 million. An edge that cannot absorb that much capital is,
to the institution, economically invisible: whatever its quality, it cannot
pay for itself. An individual trader, or a small firm managing less than five
million dollars with near-zero marginal fixed costs, faces no such limit.

**07 · INSTITUTIONAL MINIMUM — The minimum economic capacity** *(screenshots
14, 34)*

    (α/3) C_min = F  ⇒  C_min = 3F / α

*Takeaway:* A strategy must earn its fixed costs F at the net edge of a third;
the smallest usable capacity is 3F/α.

**FIGURE 4.1 — The institutional minimum** *(screenshots 14–15)*

- **What it shows:** minimum capacity worth running (y-axis 0 to $300m)
  against fixed costs a year (x-axis 0 to $5m; ticks 0, $1m, $2m, $3m, $5m).
  Three straight lines rise from the origin, with light shading beneath them.
  Legend, top left:
  - red "Edge 5%", reaching $300m at $5m (end label "300");
  - navy "Edge 10%", reaching about $150m at $5m;
  - green "Edge 20%", reaching about $75m at $5m.
- **Marker:** a navy dot on the navy line at $2m, labelled "$2m costs, 10%
  edge · $60m".
- **Caption:** *Minimum capacity worth running against annual fixed costs, for
  edges of 5%, 10% and 20%.*
- Source tag: ANALYTIC · MODEL CALCULATION

How much of the opportunity set does the limit exclude? Capacities are not
evenly spread. Across many domains in finance, sizes follow power laws, with
many small and few large; if the capacities of available edges follow a Pareto
distribution with index near one, the share of edges able to absorb at least K
falls in proportion to 1/K. On that assumption, a trader who needs only five
million dollars of capacity can use about 20% of edges, a firm needing sixty
million about 1.7%, and a firm needing five hundred million about 0.2%: the
small trader has access to roughly 12 times as many edges as the first firm
and 100 times as many as the second.

**08 · OPPORTUNITY SET — The share of edges above a capacity** *(screenshots
15, 35)*

    Pr(C* > K) = (K₀ / K)^β

*Takeaway:* Under a Pareto distribution with index β, the share of edges whose
capacity exceeds K falls as (K₀/K)^β.

**FIGURE 4.2 — The territory institutions cannot reach** *(screenshots 15–16;
animated, stepped)*

- **What it shows:** share of edges available (logarithmic y-axis, 0.1% to
  100%) against minimum capacity required (logarithmic x-axis; ticks $1m, $5m,
  $60m, $500m). A single navy straight line falls from 100% at $1m to the
  bottom right. The area under the line is shaded pale green from $1m to
  $60m, and light grey beyond $60m.
- **Markers:** green "A $5m trader · 20% of edges", with "12 times as many"
  beneath; red "Institutional minimum · $60m", with "1.7% of edges" beneath;
  end label "0.00%" at the right.
- **Step 3 (shown in the chart) — "3 · Edges between $1m and $60m are
  invisible to institutions: the small trader's territory".**
- *(from page)* Step 1: "1 · Edge capacities follow a power law:
  large-capacity edges are rare".
- *(from page)* Step 2: "2 · A firm with fixed costs needs at least $60m of
  capacity per strategy".
- **Caption:** *The share of edges available against the minimum capacity
  required, under a Pareto distribution of capacities.*
- Source tag: ANALYTIC · MODEL CALCULATION

The excluded edges are also better protected. By §01, an edge's value depends
on its half-life, and its half-life on how many others trade it. Edges that
institutions cannot use attract less institutional capital, less published
research and fewer imitators, so they tend to last longer. Size becomes a
filter on competition, and the small trader operates on the side of the filter
with fewer competitors.

Return on capital compounds the advantage. For an edge whose institutional
optimum is one hundred million dollars, deploying five million moves the price
so little that almost the entire gross edge is kept: the net return on capital
is about 8.5%, against 3.33% at the optimum, roughly 2.6 times as much. Figure
4.3 shows the whole curve. The institution maximises total profit and accepts
a lower return on each dollar; the small trader, who cannot deploy more, earns
close to the gross edge on everything it deploys.

**FIGURE 4.3 — Small capital keeps the edge** *(screenshot 16)*

- **What it shows:** net return on capital (y-axis 0% to 10%) against
  capital deployed in the edge (x-axis 0 to $150m; ticks 0, $5m, $60m,
  $100m, $150m). A single navy curve falls from 10% at 0, steeply at first and
  then gently. The area under it is shaded grey.
- **Markers:** green "$5m · 8.5%"; red "$100m optimum · 3.33%"; end label
  "1.83%" at $150m.
- **Caption:** *Net return on capital against the capital deployed in a single
  edge whose profit-maximising size is $100m.*
- Source tag: ANALYTIC · SQUARE-ROOT LAW

The binding constraint changes with scale. For an institution, capacity binds:
it has more capital than its edges can absorb, and each additional dollar must
search for a new edge large enough to take it. For a small trader, capacity
rarely binds; breadth does. By the fundamental law of Lesson 3, the
information ratio grows with the square root of the number of independent
edges, and a trader with five million dollars can spread capital across many
small edges, each deployed far below its own optimum, so that the portfolio
earns close to the gross edge of each while diversifying across all of them.
The constraint becomes the number of edges the trader can find, validate and
run, which is why the research discipline of Lessons 1 and 2 matters more at
small scale, not less.

Changes in market structure have widened this territory. Electronic trading,
narrower spreads, lower commissions and smaller contract sizes have reduced
the fixed and per-trade costs that once made small-scale systematic trading
uneconomic, while regulatory position limits and reporting thresholds bind
only at institutional size. As the costs of a small trader's strategy have
fallen, so has the minimum capacity it needs, and the set of edges it can
exploit profitably has grown accordingly.

Macro-finance explains why such opportunities persist. Shleifer and Vishny's
limits to arbitrage showed that arbitrage is carried out by specialised,
capital-constrained agents, so mispricings that are too small, too risky or
too slow to correct for them can persist. Duffie's theory of slow-moving
capital adds that capital does not flow instantly to opportunities:
institutional mandates, approval processes and fund structures move money in
months and years, not days. Pástor and Stambaugh showed that active management
faces decreasing returns to scale across the whole industry, and Pástor,
Stambaugh and Taylor found diseconomies both within funds and across the
industry. Together these describe a market in which opportunities below
institutional scale are structurally under-exploited.

Small capital has a further advantage that institutions cannot buy: it has no
outside investors to redeem. Coval and Stafford documented how funds facing
outflows are forced to sell holdings at depressed prices, and §03 showed how
crowded exits behave like bank runs. A trader investing only their own capital
is never forced to sell by someone else's withdrawal, and can hold through the
episodes in which institutions are compelled to exit, or provide liquidity to
them.

The advantage has limits, and they belong in the analysis. A small trader pays
higher costs per trade in commissions and spreads, holds fewer independent
positions, bears operational and data costs that are large relative to
capital, and faces tighter constraints on leverage. Edges below institutional
scale can also be crowded by other small traders, and the same economics of
decay and imitation apply among them. The structural advantage is real, but it
rewards the discipline of this series, validation before deployment, as much
as any institution's.

> *An institution cannot use an edge that cannot pay for its fixed costs.
> Below that size lies territory that only small capital can reach.*

**CHECKPOINT** — A firm has fixed costs of $2m a year and seeks edges of 10%.
Under the square-root law, what is the smallest capacity worth running?
- $20m
- $60m
- $200m

---

## §05 · Disclosure

### Disclosure as a *cost*

*What it costs to reveal an edge, and why some things can be shown and others
cannot.*

Every disclosure about a strategy is an economic decision. It may win the
trust of investors, satisfy a regulator or advance a reputation, but it also
transfers information to competitors, and information about an edge is the
edge. The previous chapters supply the tools to price that transfer. An edge's
value depends on its half-life; disclosure shortens the half-life by making
replication easier; so disclosure has a cost that can be written down.

Model the edge of §01, earning α and halving every h years, and suppose that
disclosing a fraction d of its logic adds a replication hazard γd to its
natural rate of decay, where γ measures how easily a competitor who knows that
much could reproduce it. The value of the edge falls from α/(ln 2/h + r) to
α/(ln 2/h + γd + r). With α of 10%, a natural half-life of 5 years and a
discount rate of 5%, the undisclosed edge is worth 53.0% of the capital it
employs. With a moderate hazard, disclosing half the logic leaves 27% of that
value and full disclosure 16%; where imitation is easy, half disclosure alone
leaves 9%.

**09 · DISCLOSURE — The value of a partly disclosed edge** *(screenshots 18,
36)*

    V(d) = α / (ln 2/h + γd + r),      V(d) / V(0) = (ln 2/h + r) / (ln 2/h + γd + r)

*Takeaway:* Disclosure adds a replication hazard γd to the edge's decay rate;
the value retained is the ratio of the two effective discount rates.

**FIGURE 5.1 — What disclosure costs** *(screenshots 18–19; animated,
stepped)*

- **What it shows:** share of value retained (y-axis 0% to 100%) against
  extent of disclosure of the logic (x-axis "None", "Half", "Full"). Three
  curves all start at 100% at None and fall:
  - grey, the highest, falling gently to about 43% at Full;
  - navy, in the middle, falling faster to about 16% at Full;
  - red, the lowest, dropping very steeply at first to under 10% by Half,
    then running along near the bottom.
- The whole plot area is shaded pale red, darker between the curves.
- **Markers:** navy "Moderate hazard · half disclosed", with "27% retained"
  beneath, at Half; red "Easy imitation · 9% retained" at Half; end labels
  "0.43%" (grey) and "0.16%" (navy) at Full.
- **Step 3 (shown in the chart) — "3 · The first half of disclosure costs most
  of the value that will ever be lost".**
- *(from page)* Step 1: "1 · Disclosure adds a replication hazard to the
  edge's natural decay".
- *(from page)* Step 2: "2 · Where imitation is easy, value collapses after
  the first disclosures".
- **Caption:** *Share of an edge's value retained against the extent of
  disclosure of its logic, for low, moderate and high replication hazards.*
- Source tag: ANALYTIC · MODEL CALCULATION

Figure 5.1 shows the shape of the cost. It is steepest at the start: the first
disclosures, which reveal what kind of edge exists and where it operates, do
most of the damage, because they tell competitors where to search. Later
disclosures refine a search that has already been narrowed. This is why firms
that keep their logic proprietary are careful even about seemingly harmless
descriptions of what they do.

Disclosure need not be deliberate. A published return series can itself be
inverted. Sharpe's returns-based style analysis regresses a fund's returns on
the returns of candidate factors to infer its exposures, and Hasanhodzic and
Lo showed that a substantial part of many hedge funds' returns can be
replicated from common factors in this way. The precision of such a regression
grows with the number of observations: the standard error of each estimated
exposure falls with the square root of the sample size. Reporting weekly
rather than daily returns inflates a reverse-engineer's standard errors by a
factor of about 2.2, and monthly reporting by about 4.6. Figure 5.2 shows the
effect; it is one reason the evidence in this series is presented as summary
statistics and at coarse resolution.

**10 · INVERSION — Precision of a reverse-engineering regression**
*(screenshots 19, 37)*

    SE(β̂) ≈ σ_ε / (σ_x √n)

*Takeaway:* The standard error of an estimated exposure falls with the square
root of the number of observations, so coarser reporting blunts inversion.

**FIGURE 5.2 — Coarse reporting blunts inversion** *(screenshots 19–20)*

- **What it shows:** a bar chart, standard error (y-axis 0 to 5×) against
  frequency at which returns are reported (x-axis). Three bars:
  - red "Daily", labelled "1.0×";
  - navy "Weekly", labelled "2.2×";
  - green "Monthly", labelled "4.6×".
- **Caption:** *Standard error of exposures estimated from a return series,
  relative to daily reporting, over the same period.*
- Source tag: ANALYTIC · REGRESSION PRECISION

It helps to think of disclosure as information in the strict sense. A
competitor trying to reproduce an edge searches a space of candidate
specifications, and every disclosure removes part of that space: naming the
kind of market halves or quarters it, naming the horizon removes more, and
each further detail narrows what remains. The proprietary content of an edge
is what is left undetermined after everything published has been taken into
account. This is why the first disclosures are the most expensive, as Figure
5.1 showed: they eliminate the largest share of candidates, and they tell the
competitor that a search in that region is worth undertaking at all.

Regulation strikes the same balance explicitly. In the United States,
institutional managers above a size threshold report their holdings of listed
equities quarterly on Form 13F, within forty-five days of the end of each
quarter, and may request confidential treatment for positions still being
built. The delay and the quarterly resolution are deliberate: they give the
public a view of what large managers own while limiting how far that view can
be used to trade against them. The rules embody the principle of this chapter:
transparency about outcomes and holdings at a resolution that does not
transfer the edge.

If disclosure is costly, why do managers disclose anything? Milgrom's
unravelling argument explains which disclosures happen voluntarily. When
quality is verifiable and investors are sceptical, silence is interpreted as
bad news: a manager who withholds results is assumed to have poor ones. Every
manager above the worst therefore has an incentive to reveal, and in
equilibrium performance is disclosed. The argument applies to outcomes, which
can be verified and whose disclosure does not destroy their value. It does not
apply to logic, whose disclosure destroys the edge, and whose absence
investors therefore do not treat as a signal of low quality.

The result is a hierarchy of disclosure, shown in Figure 5.3. Outcomes, such
as returns and drawdowns, can be published because they are verifiable and
hard to invert at coarse resolution. Validation, the tests and statistics that
establish whether the outcomes are reliable, can be published because it is
about the outcomes, not the rules. Structure can be described by naming its
layers without revealing what any layer does. Logic and parameters cannot be
disclosed at all without transferring the edge. The value at risk rises
steeply along the hierarchy, and the boundary this series observes lies
between structure and logic.

**FIGURE 5.3 — The disclosure hierarchy** *(screenshots 20–21)*

- **What it shows:** a row of five rounded boxes joined left to right by grey
  arrows:
  - "Outcomes", sub-label "returns, drawdowns" (green border and title);
  - "Validation", sub-label "tests and statistics" (green border and title);
  - "Structure", sub-label "layers named" (navy border and title);
  - "Logic", sub-label "the rules" (red border and title);
  - "Parameters", sub-label "the settings" (red border and title).
- **Caption:** *From outcomes to parameters: what can be published without
  transferring the edge, and what cannot.*
- Source tag: DIAGRAM

The hierarchy also answers a natural objection: that an edge described only by
its outcomes cannot be trusted. It can, if the outcomes are supported by
validation of the kind that systematic research has developed for exactly this
purpose. §06 sets out how evidence can be made convincing while the recipe
stays proprietary.

> *Outcomes and validation can be public. Logic and parameters cannot be
> disclosed without transferring the edge.*

**CHECKPOINT** — Why does reporting returns weekly rather than daily protect a
strategy from reverse-engineering?
- Weekly returns are smaller
- A regression on fewer observations estimates the strategy's exposures less
  precisely
- Weekly returns cannot be regressed

---

## §06 · Evidence

### Evidence *without the recipe*

*How outcomes can be made convincing while the logic stays proprietary.*

If the logic cannot be disclosed, what can establish confidence? The answer is
evidence about outcomes that is hard to fake and hard to misread: tests that
could have failed, carried out in ways that could not have been tailored after
the fact. Systematic research has developed a set of such tests, and this
series presents them in sequence: significance corrected for the breadth of
the search, stability across parameter choices, performance on data not used
in development, and behaviour across simulated paths. Each is a statistic
about outcomes. None reveals the rules.

Their force as evidence comes from independence. As Lesson 1 showed,
independent tests multiply the odds of a real edge: from a prior of 4%, a test
with a likelihood ratio of sixteen raises the probability to 40%, and a second
independent test raises it to 91%. Weaker tests need several passes to reach
the same conviction. Figure 6.1 shows the arithmetic. What matters is not the
number of tests but how many examine distinct features of the record, which is
why the validation of Module 4 is designed so that each lesson asks a
different question.

**FIGURE 6.1 — Independent evidence compounds** *(screenshot 22)*

- **What it shows:** probability of a real edge (y-axis 0% to 100%) against
  independent tests passed (x-axis 0 to 5). Three lines start at a few per
  cent at 0 and rise. Legend, top left:
  - green "Likelihood ratio 16", the steepest, reaching nearly 100% by 3
    tests;
  - navy "Likelihood ratio 4", reaching just under 100% by 5 tests;
  - grey "Likelihood ratio 2", reaching under 60% by 5 tests.
- Light shading between and beneath the lines.
- **Markers:** green "40%" at 1 test and "91%" at 2 tests; end label "1.00%"
  at 5 tests.
- **Caption:** *Probability of a real edge against the number of independent
  tests passed, from a prior of 4%, for three likelihood ratios.*
- Source tag: ANALYTIC · BAYES' RULE

Some evidence carries weight because of when it was produced. A test designed
after the data have been seen can be tailored to them, the garden of forking
paths of Lesson 1; a test declared in advance cannot. The strongest form is a
holdout: data set aside at the start of research and examined once, at the
end, by a rule fixed beforehand. Lesson 14 examines the Forecaster Portfolio's
holdout. A forward record, accumulated after a strategy was fixed, is a
holdout that grows with time.

Commitment can be made verifiable without disclosure. A cryptographic hash
function maps any document to a short fingerprint from which the document
cannot be recovered, and for which no different document with the same
fingerprint can practically be found. A manager who publishes the fingerprint
of a sealed specification today can later prove, by revealing the
specification, that it was fixed before the outcomes on which it is judged;
until then the fingerprint discloses nothing. A random nonce appended to the
specification prevents anyone from confirming a guess about its contents.
Science uses the same structure in pre-registration: the commitment is public,
the content private, and the order of events provable.

**11 · COMMITMENT — A cryptographic commitment** *(screenshots 22, 23, 38)*

    c = H(s ‖ n)

*Takeaway:* The fingerprint c of a specification s with a random nonce n can
be published at once; revealing s and n later proves the specification
predates the results.

**FIGURE 6.2 — Commit, record, reveal** *(screenshot 23)*

- **What it shows:** three rounded boxes joined left to right by grey
  arrows:
  - "Seal", sub-label "publish the fingerprint" (navy border);
  - "Record", sub-label "outcomes accumulate" (green border and title);
  - "Reveal", sub-label "the fingerprint matches" (navy border).
- **Caption:** *A commitment scheme proves that a specification was fixed
  before its results, without disclosing it in the meantime.*
- Source tag: DIAGRAM

Time does the rest. The standard error of an estimated Sharpe ratio, following
Lo, is approximately the square root of (1 + S²/2)/T for a record of T years,
so precision improves only with the square root of the record's length. For a
strategy with a Sharpe ratio of 1, the 95% interval is about ±2.4 after one
year, about ±1.4 after three and about ±0.76 after ten. Figure 6.3 shows the
curve. Long, verified records carry weight not because they reveal more about
the strategy but because they reveal more precisely what the strategy has
done.

Outcomes themselves can be verified independently of the manager.
Administrators calculate returns from positions held by custodians, auditors
test the administrator's records, and brokers and exchanges confirm the
trades. None of them needs to know why a position was taken in order to
confirm that it was held and what it earned. The chain of verification
separates the question of what happened, which can be answered publicly, from
the question of why, which need not be.

**12 · PRECISION — The standard error of a Sharpe ratio** *(screenshots 23,
39)*

    SE(Ŝ) ≈ √[ (1 + ½ S²) / T ]

*Takeaway:* Precision grows with the square root of the record's length T;
higher Sharpe ratios carry slightly wider intervals.

**FIGURE 6.3 — Time as evidence** *(screenshots 23–24)*

- **What it shows:** 95% interval half-width (y-axis 0 to ±3) against length
  of the verified record (x-axis 0 to 15 years; ticks 0, 1, 5, 10, 15 years).
  Two curves fall steeply over the first years and then flatten. Legend, top
  right:
  - navy "Sharpe ratio 1", the lower curve, ending at "0.62" at 15 years;
  - grey "Sharpe ratio 2", the upper curve, which runs off the top of the
    plot at the left.
- The area between the curves and beneath the navy curve is shaded grey.
- **Markers:** red "1 year · ±2.4" and green "10 years · ±0.76", both on the
  navy curve.
- **Caption:** *Half-width of the 95% interval on an estimated Sharpe ratio
  against the length of the verified record, for Sharpe ratios of 1 and 2.*
- Source tag: ANALYTIC · LO (2002)

Evidence must also be judged against what could have been shown. Allocators
see the strategies that survived long enough to be presented, not the many
that were tried and abandoned, so a record that clears the conventional
threshold of statistical significance may simply be the best of a large,
unseen population. Harvey, Liu and Zhu made the point for academic finance:
after decades of searching for factors that explain returns, they argued that
a new factor should clear a t-statistic of about 3 rather than the traditional
2. Lesson 12 applies the same correction to the Forecaster Portfolio, using
the breadth of its own search.

Industry standards formalise the presentation of outcomes. The Global
Investment Performance Standards, maintained by the CFA Institute, require
firms to group comparable accounts into composites, to present their full
performance history rather than selected periods, and to disclose how returns
were calculated, with independent verification of compliance available to
firms that seek it. The standards govern what is shown and how, never the
logic that produced it, and they illustrate the principle of this chapter in
institutional form.

At the research frontier, cryptography offers a stronger form of evidence
still. A zero-knowledge proof allows one party to convince another that a
statement is true without revealing anything beyond its truth: in principle,
that a strategy used only information available at the time of each decision,
or that it satisfies a stated risk limit, without disclosing the strategy
itself. Such proofs are not yet part of institutional practice, but they
express precisely the ideal toward which the methods of this chapter point:
complete evidence about what a strategy does, and nothing about how.

> *Evidence can be public because it concerns outcomes. A test that could have
> failed, fixed before the data, carries weight without revealing the rules.*

**CHECKPOINT** — Why does publishing the fingerprint of a strategy
specification in advance strengthen later evidence?
- It shows the specification to competitors
- It proves the specification was fixed before its results, without disclosing
  it until revealed
- It improves the strategy's returns

---

## Appendix · Glossary and sources

### Terms and *sources*

| Term | Definition |
|---|---|
| Half-life | The time for an edge, or a shock, to decay by half. |
| Market impact | The movement of prices against a trader caused by the trader's own orders. |
| Square-root law | Impact grows with the square root of order size relative to volume. |
| Capacity | The capital an edge can support before impact consumes it. |
| Effective number of trials | The number of independent trials a set of correlated ones is equivalent to, by a stated measure. |
| Crowding | Many holders of similar positions sharing returns and liquidity. |
| Liquidity spiral | Losses that tighten funding, forcing sales that worsen liquidity and deepen losses. |
| Optimal execution | Scheduling a large trade to balance impact cost against price risk. |
| Little's law | The average number in a stable system equals the arrival rate times the average time spent in it. |
| Transient impact | The part of a trade's price impact that reverts as liquidity replenishes. |
| Cournot competition | Firms choosing quantities simultaneously, each taking the others' as given. |
| Absorption ratio | The share of total variance explained by a few common factors; a measure of market coupling. |
| Minimum economic capacity | The smallest capacity whose net profit covers a strategy's fixed costs, 3F/α. |
| Limits to arbitrage | Constraints on the capital and risk-bearing of arbitrageurs that allow mispricing to persist. |
| Slow-moving capital | Capital that reaches opportunities only gradually because of institutional frictions. |
| Returns-based style analysis | Inferring a fund's exposures by regressing its returns on factor returns. |
| Unravelling | The equilibrium in which sceptical investors read silence as bad news, so verifiable quality is disclosed. |
| Cryptographic commitment | A published fingerprint that binds a party to a document without revealing it. |
| Holdout | Data set aside and examined once, by a rule fixed in advance. |

### Sources

- Grossman and Stiglitz (1980). On the impossibility of informationally efficient markets, American Economic Review 70(3).
- McLean and Pontiff (2016). Does academic research destroy stock return predictability?, Journal of Finance 71(1).
- Almgren, Thum, Hauptmann and Li (2005). Direct estimation of equity market impact, Risk 18(7).
- Tóth, Lempérière, Deremble, de Lataillade, Kockelkoren and Bouchaud (2011). Anomalous price impact and the critical nature of liquidity in financial markets, Physical Review X 1(2).
- Berk and Green (2004). Mutual fund flows and performance in rational markets, Journal of Political Economy 112(6).
- Khandani and Lo (2007). What happened to the quants in August 2007?, Journal of Investment Management 5(4).
- Kyle (1985). Continuous auctions and insider trading, Econometrica 53(6).
- Almgren and Chriss (2000). Optimal execution of portfolio transactions, Journal of Risk 3(2).
- Brunnermeier and Pedersen (2009). Market liquidity and funding liquidity, Review of Financial Studies 22(6).
- Little (1961). A proof for the queuing formula: L = λW, Operations Research 9(3).
- Bouchaud, Gefen, Potters and Wyart (2004). Fluctuations and response in financial markets: the subtle nature of random price changes, Quantitative Finance 4(2).
- Diamond and Dybvig (1983). Bank runs, deposit insurance, and liquidity, Journal of Political Economy 91(3).
- Kritzman, Li, Page and Rigobon (2011). Principal components as a measure of systemic risk, Journal of Portfolio Management 37(4).
- Cournot (1838). Recherches sur les principes mathématiques de la théorie des richesses.
- Shleifer and Vishny (1997). The limits of arbitrage, Journal of Finance 52(1).
- Duffie (2010). Asset price dynamics with slow-moving capital, Journal of Finance 65(4).
- Pástor and Stambaugh (2012). On the size of the active management industry, Journal of Political Economy 120(4).
- Pástor, Stambaugh and Taylor (2015). Scale and skill in active management, Journal of Financial Economics 116(1).
- Coval and Stafford (2007). Asset fire sales (and purchases) in equity markets, Journal of Financial Economics 86(2).
- Sharpe (1992). Asset allocation: management style and performance measurement, Journal of Portfolio Management 18(2).
- Hasanhodzic and Lo (2007). Can hedge-fund returns be replicated? The linear case, Journal of Investment Management 5(2).
- Milgrom (1981). Good news and bad news: representation theorems and applications, Bell Journal of Economics 12(2).
- Lo (2002). The statistics of Sharpe ratios, Financial Analysts Journal 58(4).
- Nosek, Ebersole, DeHaven and Mellor (2018). The preregistration revolution, Proceedings of the National Academy of Sciences 115(11).
- Harvey, Liu and Zhu (2016). … and the cross-section of expected returns, Review of Financial Studies 29(1).

*Educational content only. Not financial advice.*
