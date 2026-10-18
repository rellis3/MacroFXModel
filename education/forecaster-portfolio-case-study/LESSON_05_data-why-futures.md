# Case Study: The Forecaster Portfolio — Lesson 05 of 17

## Data: Why *Futures*

> **Source:** Colez Trades (cog) education, "Case Study: The Forecaster
> Portfolio". Module 02 · The System. Case Study · Lesson 05 of 17 (CS · 05).
> Page: cog000.github.io/Forecaster-Portfolio-Case-Study/lesson-05/
>
> **Transcription note:** copied from full-page screenshots of the lesson,
> taken 2026-10-18 in a desktop browser (1200 px wide) after entering the
> access key and accepting the disclaimer. Nothing has been added or inferred.
> The original screenshots are kept in `screenshots/lesson-05/`: 01–28 are the
> page in order, and 29–42 are landscape close-ups of formula boxes 01–14.
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

*Every result in a research record is a result about its data. How continuous
series are built, what futures data offers, and the classic errors that data
can introduce.*

### The anatomy of *data*

*Why the construction of data is part of the evidence.*

| | |
|---|---|
| Series | Case Study: The Forecaster Portfolio |
| Subject | Research data |
| Method | Series construction, cost of carry, bias analysis |
| Reading time | About 50 minutes |

Every statistic in a research record is a statistic about its data. Before any
question about an edge can be asked, a researcher must decide how prices are
recorded, how series that end are joined to series that begin, which
instruments are included, and at what resolution the record is kept. Each
decision changes the numbers that follow, and some change them decisively.

This lesson examines those decisions in general terms: how continuous series
are constructed and why the construction matters, what futures data offers as
a research record, the two classic errors of survivorship and look-ahead, the
role of resolution, and how the macroeconomic environment runs through every
series. The Forecaster Portfolio's historical track record was built on
futures data because futures data is cleaner; the resolution and construction
of its data are proprietary.

---

## §01 · Construction

### What a *price series* is

*Why the way a series is built changes the returns it reports.*

A price series looks like a simple record of what happened. For many
instruments it is nothing of the kind. Contracts with a fixed expiry trade for
a limited life, and a research record that spans years must join many of them
into one continuous series. Each join, or roll, replaces an expiring contract
with the next, and the two rarely trade at the same price. A series that
simply joins the contracts' own prices records every price exactly as it
traded, which is its great strength; but it contains a gap at every roll, and
any return, volatility or indicator computed across that gap records a price
move that no investor ever earned or lost.

There are two responses. One alters the data: earlier prices are shifted or
rescaled so that the joined series looks continuous. The other leaves every
price exactly as it was recorded and makes the code aware of the boundaries
instead: the trading logic knows which contract it holds, executes each roll
as real trades at the prices quoted at the time, and the signal logic never
reads across a boundary as if nothing had happened. This series follows the
second approach. It is the more realistic of the two, because every price in
the record is one that traded, and it is the approach the Forecaster
Portfolio's historical track record was built on: contract data left
untouched, with every roll handled in the code.

The institutional standard avoids treating any constructed series as a record
of trading. The raw prices of each contract are kept exactly as they traded
and never edited; they are the single source of truth. Trading is simulated
contract by contract: a position is held in a specific contract, and each roll
is an explicit pair of trades, closing the expiring contract and opening the
next, executed at the prices actually quoted at that moment, buying at the
offer and selling at the bid, or as a single spread trade where one is
available. Profit and loss is computed from those fills, so the gap between
contracts never enters it, and no fill can occur at a price that was not
available. Rolls are timed by liquidity, as trading activity migrates from one
contract to the next, rather than at a moment chosen with hindsight.

Why does the gap exist at all? Because two consecutive contracts are not the
same instrument. Each is a claim on the same asset at a different date, and
the cost of carry ties each to the spot price through its own time to
delivery. At any moment the later contract differs from the nearer one by the
net carry over the interval between their expiries: the cost of financing and
holding the asset for those extra months, less the income or convenience of
holding it, plus whatever premium hedgers pay or expectations add for the
later date. Where carry is positive the later contract trades higher, a term
structure in contango; where income or convenience outweighs financing, it
trades lower, in backwardation. The gap is therefore a product of the term
structure, and it is as real and as persistent as the term structure itself.

Its size follows from the same arithmetic. With net carry of c a year and a
spacing of Δ years between contracts, the gap is approximately cΔ of the
price: quarterly contracts in a market carrying −6% a year stand about 1.5%
apart, which is the gap used throughout this chapter; monthly contracts in the
same market stand about 0.5% apart; six-monthly ones about 3%. The gap changes
with rates, inventories and expectations, so it is not a constant to be
subtracted once but a quantity that must be observed on each roll day. Figure
1.1 follows the two contracts through the days around a roll. The front and
next contracts move together, separated by the gap; a series stitched from
whichever is the front jumps by the gap on the roll day, as if the market had
moved; a position that is rolled does not jump at all, because the old
contract is closed at its own price and the new one opened at its own price.
Figure 1.2 shows how the gap scales with carry and spacing.

**01 · THE ROLL GAP — Why consecutive contracts differ in price**
*(screenshots 03, 29)*

    F_{t,T₂} − F_{t,T₁} = S_t (e^{c(T₂−t)} − e^{c(T₁−t)}) ≈ c (T₂ − T₁) F_{t,T₁}

*Takeaway:* The later contract differs from the nearer one by the net carry
over the interval between their expiries; the gap is a product of the term
structure.

**FIGURE 1.1 — Anatomy of a roll** *(screenshots 03–04; animated, stepped)*

- **What it shows:** price (y-axis 104 to 120) against days from the roll
  (x-axis −20 days to +20 days, with "Roll" at the centre). Jagged daily lines:
  - a thick green line runs across the whole chart, falling from about 117 to
    about 107 at the roll, then rising to about 118 before ending at 113
    (end label "113");
  - before the roll, a grey line runs below the green one, labelled "Next
    contract · 1.5% below the front";
  - from the roll onwards, a red line runs below the green one, labelled
    "Stitched: a false fall of 1.62".
- The area between the lines is shaded grey.
- **Marker:** green "Rolled position: no jump", at about +12 days.
- **Step 3 (shown in the chart) — "3 · A rolled position is continuous: old
  sold at its price, new bought at its price".**
- *(from page)* Step 1: "1 · Two contracts trade at the same time, the later
  one 1.5% lower: claims on different dates carry different prices".
- *(from page)* Step 2: "2 · A series stitched from the front contract jumps
  down by the gap on the roll day, as if the market had fallen".
- **Caption:** *Two consecutive contracts through the days around a roll in a
  simulated market: the gap between them, the jump in a series stitched from
  the front contract, and the continuous value of a position that is rolled.*
- Source tag: SIMULATION · FIXED SEED

**FIGURE 1.2 — How large the gap is** *(screenshot 04)*

- **What it shows:** gap at the roll, % of price (y-axis −5% to +5%) against
  annual carry, later contract over nearer (x-axis −10% to +10%). Three
  straight lines cross at the origin, with light shading between them. Legend,
  top left:
  - grey "Monthly contracts", the shallowest, ending at "0.84%" at +10%;
  - navy "Quarterly contracts", ending at about +2.5%;
  - red "Six-monthly contracts", the steepest, ending at about +5%.
- A horizontal grey line at 0.
- **Marker:** a navy dot at −6% carry, labelled "Quarterly, carry −6% · gap
  −1.5%".
- **Caption:** *The gap at a roll, as a percentage of price, against annual
  carry for monthly, quarterly and six-monthly contract spacings.*
- Source tag: ANALYTIC · COST OF CARRY

Handling the roll in the code has five parts, and each is a rule fixed before
the research begins. The first is scheduling: which contract is held, and when
the position moves to the next. Common rules roll a fixed number of days
before expiry, or when trading activity in the next contract overtakes the
current one, or a set number of days before any delivery or notice date that a
position must not cross; the activity rule is the most realistic, because it
follows the liquidity, and it must be computed from activity already observed,
never from activity that came later.

The second is execution. On the roll day the simulation closes the old
contract and opens the new one as two trades at the prices quoted at that
moment, selling at the bid and buying at the offer, or as one calendar spread
trade where such a market exists, which often costs less than two separate
legs. A large position may be rolled over several days to limit impact,
exactly as it would be in practice. The third is accounting: profit and loss
is the change in the value of the contract actually held, so the record
carries the old contract's moves until the roll and the new contract's moves
afterwards, and the gap between them never appears, except as the real cost of
the two trades.

**02 · ACCOUNTING ACROSS THE ROLL — Profit and loss without the gap**
*(screenshots 04, 05, 30)*

    ΔV_t = q (F^old_t − F^old_{t−1})  before the roll,      ΔV_t = q (F^new_t − F^new_{t−1})  after;   the gap never appears

*Takeaway:* Before the roll, value changes with the old contract; after it,
with the new one. The gap is never a return, only the cost of the two trades
is.

The fourth is signal continuity. Any indicator with a look-back window would
see the gap as a price move if it read across the boundary, so the code
computes signals from the history of the contract about to be held, which
trades for months before it becomes the most active and so has a history of
its own, or from returns that were earned inside contracts and chained by real
trades. Where an incoming contract's early history is thin, the code warms the
signal up on that contract for a fixed period before relying on it. The fifth
is validation: every roll is checked for a gap that is implausibly large
relative to recent volatility, every fill for a price that was quoted, and the
whole record for the round trip of §06, in which returns chained back into
prices reproduce the raw prices exactly within each contract.

Derived views have a separate role. A return index computes each day's return
within a single contract, using the same contract's price on both days and, on
a roll day, the new contract for both, and chains the returns. It is
calculated deterministically from the raw prices, so it involves no manual
interference with the data, and in the simulated market it is identical to the
ratio-adjusted series, as it must be. Views of this kind serve analysis that
must span many contracts, such as long-horizon returns and volatility, and
they never supply a fill.

**03 · CONSTRUCTION — The return index** *(screenshots 05, 31)*

    r_t = F_{k,t} / F_{k,t−1} − 1,      I_t = I_{t−1} (1 + r_t)

*Takeaway:* Each return uses one contract k on both days; returns are chained
into the index I, so gaps between contracts never enter it.

Signals need the same care as fills. Any indicator whose look-back window
spans a roll sees the gap as a price move unless the window is drawn from a
single contract or from returns that exclude the gaps. A careful system
therefore computes its signals from the history of the contract it will
actually hold, which typically trades for months before it becomes the most
active, or from a return index; either way the raw data remain untouched. The
execution model and the signal logic are both roll-aware, and the record is
realistic at every step.

**FIGURE 1.3 — A data architecture without adjustment** *(screenshots 05–06)*

- **What it shows:** five rounded boxes in two rows, joined by grey arrows.
  - Top row, left to right: "Raw contract prices", sub-label "never edited"
    (navy border) → "Trading simulation", sub-label "explicit rolls at quoted
    prices" (green border and title) → "Profit and loss", sub-label "from
    actual fills" (green border and title).
  - An arrow runs down from "Raw contract prices" to the bottom row:
    "Derived views", sub-label "return index, adjusted series" (grey border)
    → "Analysis and signals", sub-label "roll-aware, never fills" (grey
    border).
- **Caption:** *Raw prices are never edited; trading is simulated contract by
  contract with explicit rolls at quoted bid and ask prices; derived views
  serve analysis and roll-aware signals, never fills.*
- Source tag: DIAGRAM

What does altering the data do, and what happens if a researcher does neither?
For analysis that must span the joins, there are two standard derived views,
and each preserves something different. Difference adjustment shifts all
earlier prices by the gap at each roll, so that the joined series is
continuous and every price change, measured in price units, is preserved.
Ratio adjustment scales all earlier prices by the ratio of the two prices at
each roll, so that every percentage return is preserved instead. Neither
leaves the historical prices as they were actually traded; each is a
construction chosen for a purpose.

**04 · CONSTRUCTION — Difference and ratio adjustment** *(screenshots 06, 32)*

    P̃_t^diff = P_t + Σ_{j>t} (F_j^new − F_j^old),      P̃_t^ratio = P_t Π_{j>t} F_j^new / F_j^old

*Takeaway:* Difference adjustment adds every later roll gap to earlier prices;
ratio adjustment multiplies earlier prices by every later roll ratio.

A simulated market shows how much the choice matters. Ten years of prices are
built from 40 consecutive quarterly contracts, each trading 1.5% below the one
before it at the moment of the roll. The underlying market returns -3.7% a
year. If returns are computed naively across the joins, the series appears to
return -9.6% a year: about six per cent a year of apparent loss is created
entirely by treating the gaps as returns. The ratio-adjusted series reproduces
-3.7% exactly. The difference-adjusted series reports -4.4%, and its early
prices lie -40% below the prices at which the market actually traded, which
distorts every percentage return measured in the early years; on average its
daily percentage returns differ from the true ones by 0.247%, a large error
for a series whose daily volatility is about one per cent.

**FIGURE 1.4 — One market, three series** *(screenshots 06–07; animated,
stepped)*

- **What it shows:** price (y-axis 0 to 125) against years (x-axis 0 to 10).
  Three jagged lines:
  - red, the highest at the start, beginning at about 100 (label "Traded
    price · 100.9"), falling to about 80 by year 2, then drifting lower;
  - green, starting at about 60 (label "Difference adjusted · starts at
    60.2");
  - navy, close below the green line at the start.
- The three lines converge over time and run together from about year 9,
  ending a little below 40.
- Shading: pale red between the red and green lines, grey beneath.
- **Step 3 (shown in the chart) — "3 · Difference adjusted: price changes
  preserved, early prices shifted 40% lower".**
- *(from page)* Step 1: "1 · Returns computed naively across the joins: a
  false drop at every one of the forty rolls".
- *(from page)* Step 2: "2 · Ratio adjusted: every percentage return
  preserved, early prices rescaled".
- **Caption:** *Ten years of a simulated market built from forty quarterly
  contracts: returns computed naively across the joins, against the two
  adjusted views. In this series the data themselves are left untouched; the
  comparison shows what each alternative does.*
- Source tag: SIMULATION · FIXED SEED

**FIGURE 1.5 — The distortion is oldest where the data are oldest**
*(screenshot 07; animated, stepped)*

- **What it shows:** average error in daily return, three-month window
  (y-axis 0 to 0.6%+) against years (x-axis 0 to 10). Two lines:
  - a jagged green line starting at about 0.63% (label "Oldest data · error
    about 0.63% a day"), falling with bumps (a peak near 0.6% at year 2) to
    zero at year 10, with green shading beneath;
  - a navy line flat along zero, labelled "Ratio adjusted · exact".
- **Step 3 (shown in the chart) — "3 · Ratio adjustment, and returns
  computed within contracts: no error at all".**
- *(from page)* Step 1: "1 · Difference adjustment: the error in each day's
  percentage return, averaged over three months".
- *(from page)* Step 2: "2 · It is largest in the oldest data, where the
  accumulated adjustment is largest".
- **Caption:** *Average error in difference-adjusted daily percentage returns
  through the ten years, against ratio adjustment, which has none.*
- Source tag: SIMULATION · FIXED SEED

Data quality is weakest at exactly the moment of the roll. Trading activity
drains from an expiring contract in its final days, so its prices become
sparse and less representative, while the next contract may not yet be fully
active. Daily records may report an official settlement price, determined by a
published procedure, or the last traded price, which can be stale when trading
is thin; mixing the two across contracts introduces spurious returns. Careful
construction rolls before activity collapses, uses one price definition
consistently, and checks every roll for gaps that are implausibly large
relative to recent volatility.

The lesson generalises. Returns belong inside contracts: computed within the
contract actually held and chained across rolls by the trades that were made,
they need no adjusted series at all. Where a derived view is wanted for
long-horizon analysis, ratio adjustment or the return index preserves
percentage returns, while difference adjustment preserves price changes and
distorts percentages; neither is a record of trading, and a long
difference-adjusted history can even produce negative early prices.

Roll timing is a further choice. The code can roll on a fixed calendar, a set
number of days before expiry, or when trading activity migrates from one
contract to the next, and each rule produces slightly different gaps and
slightly different returns. None is universally correct. What matters is that
the rule is fixed before the research begins, applied consistently, and
recorded, so that every result can be traced to the construction that produced
it.

This is the first sense in which data is part of the evidence. Two researchers
studying the same market with different roll rules can report different
returns for the same strategy, and neither need have made an error; what
distinguishes a credible record is that the data were never altered, the roll
rule was fixed in advance and applied by the code, and every fill was at a
price that was quoted. The Forecaster Portfolio's record meets that standard;
the detail of how its code handles each boundary is proprietary.

> *Leave the data untouched. Make the code aware of every contract boundary,
> and let returns come only from trades that were made.*

**CHECKPOINT** — A strategy's record is built from contract data left exactly
as recorded. Where should the roll between contracts be handled?
- By adjusting the historical prices before the research begins
- In the trading and signal logic, as explicit trades at quoted prices, with
  the data untouched
- Nowhere: a stitched series already measures the return

---

## §02 · Futures data

### Futures *as data*

*How futures are priced, what their returns contain, and why the data is
cleaner.*

A future is a commitment to trade an asset at a fixed price on a later date.
Its price is tied to the price of the asset today by the cost of carry: the
cost of financing a position in the asset until the delivery date, plus any
costs of holding it, less any income or benefit that holding it provides. The
relation is exact in the absence of arbitrage, and it determines how futures
prices behave relative to the underlying market at every moment of their life.

**05 · PRICING — The cost of carry and convergence** *(screenshots 09, 33)*

    F_{t,T} = S_t e^{(r + u − y)(T − t)},      b_t = F_{t,T} − S_t → 0  at  T

*Takeaway:* The future equals spot grown at the net carry rate r + u − y to
the delivery date; the basis b shrinks to zero as delivery approaches.

The difference between the future and spot prices is the basis, and the basis
must vanish at expiry, when the future becomes a claim on the asset itself.
When the net carry is positive, the future trades above spot, a term structure
described as contango, and converges downward; when the benefits of holding
the asset outweigh the costs, the future trades below spot, backwardation, and
converges upward. Figure 2.1 shows both paths around the same spot price over
a year to expiry.

**FIGURE 2.1 — The basis converges** *(screenshot 09; animated, stepped)*

- **What it shows:** price (y-axis 80 to 120) against time to expiry (x-axis
  "Start", "Six months", "Expiry"). Three jagged lines moving together:
  - red, on top, labelled "Contango: the basis narrows downward";
  - navy, in the middle;
  - green, at the bottom.
- The gaps between the lines are widest at the start and narrow until all
  three meet at expiry, at "98.7". The gap between red and navy is shaded
  pale red; the gap between navy and green is shaded pale green.
- **Step 3 (shown in the chart) — "3 · In backwardation it trades below spot
  and converges up".**
- *(from page)* Step 1: "1 · The spot price".
- *(from page)* Step 2: "2 · In contango the future trades above spot and
  converges down to it at expiry".
- **Caption:** *A future in contango and in backwardation converging to the
  spot price at expiry, with the basis shaded.*
- Source tag: SIMULATION · COST OF CARRY

Convergence gives futures returns a precise anatomy. A position in futures
requires only a margin deposit, and the rest of the capital can be held as
collateral earning interest. The total return of a fully collateralised
position is then approximately the sum of three parts: the collateral return,
the change in the spot price, and the roll yield, which is the convergence of
the basis earned by holding a future as it approaches expiry. In contango the
roll yield is negative, because each future is bought above spot and falls
towards it; in backwardation it is positive. Figure 2.2 decomposes a year's
return in each case with spot unchanged and collateral earning 4%: carry of
+5% leaves a total of −1%, while carry of −5% leaves +9%. Figure 2.3 shows
that the roll yield moves one for one with the slope of the term structure.

**06 · RETURNS — The three components of a futures return** *(screenshots 10,
34)*

    R_total ≈ R_collateral + R_spot + R_roll,      R_roll ≈ −(ln F_{t,T} − ln S_t) / (T − t)

*Takeaway:* Total return is collateral return plus spot return plus roll
yield; the roll yield is the basis converging over the time to expiry.

**FIGURE 2.2 — How a year's return builds up** *(screenshot 10; animated,
stepped)*

- **What it shows:** cumulative return, spot unchanged (y-axis −2% to +8%+)
  against time (x-axis "Start", "Six months", "One year"). Three straight
  lines from 0% at the start:
  - green, ending at "Backwardation · +9%";
  - grey, ending at "Collateral · +4%";
  - red, sloping slightly down, ending at "Contango · −1%".
- Shading: pale green between the green and grey lines, pale red between the
  grey and red lines.
- **Step 3 (shown in the chart) — "3 · In backwardation the same carry is
  earned as the future converges up: total +9%".**
- *(from page)* Step 1: "1 · Collateral earns 4% over the year whatever the
  term structure".
- *(from page)* Step 2: "2 · In contango a carry of 5% is paid away as the
  future converges down: total −1%".
- **Caption:** *Collateral return, then the roll yield, in contango and in
  backwardation, with spot unchanged over the year.*
- Source tag: ANALYTIC · COST OF CARRY

**FIGURE 2.3 — Roll yield follows the term structure** *(screenshots 10–11)*

- **What it shows:** roll yield a year (y-axis −10% to +10%) against
  annualised carry: later price over nearer, log (x-axis −10% to +10%). A
  single navy straight line falls from +10% at the left to −10% at the right,
  through the origin. The area under it is shaded grey.
- A horizontal grey line at 0%, labelled "Flat term structure".
- **Markers:** green "Backwardation · +5%" at −5%; red "Contango · −5%" at
  +5%; end label "−10.0%".
- **Caption:** *Annual roll yield against the annualised slope of the term
  structure.*
- Source tag: ANALYTIC · COST OF CARRY

Two refinements sharpen the picture. First, a future is not quite a forward.
Gains and losses on a future are settled every day through variation margin,
while a forward settles only at delivery. Cox, Ingersoll and Ross showed that
when interest rates are correlated with the asset's price, daily settlement
makes the two prices differ: gains received when rates are high can be
reinvested at those rates, and losses paid when rates are low are financed
cheaply, so a long future is worth more than a long forward when the
correlation is positive. For most research purposes the difference is small,
but it is a reminder that the cost-of-carry relation holds exactly only under
stated assumptions.

Second, the roll yield may carry a risk premium rather than being a mechanical
by-product of carry. Keynes proposed the theory of normal backwardation:
producers who hedge by selling futures pay speculators a premium for taking
the other side, so that futures prices lie below the expected future spot
price and long positions earn a return for bearing that risk. Whether and
where such premia exist is an empirical question, but the theory establishes
that the term structure can reflect the balance of hedging demand as well as
the costs of carry.

Margin also turns price risk into liquidity risk. Because losses are settled
daily, a futures position that moves sharply against its holder demands cash
immediately, and those demands arrive in precisely the volatile periods when
cash is hardest to raise. This is the mechanism by which the liquidity spirals
of Lesson 4 propagate through futures markets: variation margin calls force
sales, sales move prices, and moving prices generate further calls. A research
record in futures data therefore needs to account not only for returns but for
the capital required to sustain positions through their worst days.

These properties explain why futures data is cleaner for research than many
alternatives. The instruments are standardised, so one market's history is a
sequence of like-for-like contracts rather than a changing mixture of
securities. They are centrally cleared, and each day ends with an official
settlement price determined by a published procedure. There are no dividends,
splits or other corporate actions to adjust for, because the instrument
carries none. A short position is as simple to hold as a long one, so the
record of a strategy that trades in both directions is not distorted by the
costs and constraints of borrowing. And because a future is a claim rather
than a company, its history is not thinned by bankruptcies and delistings, a
source of the survivorship bias examined in §03.

The economics are also cleaner. Because only margin is posted, the return of a
futures position is naturally an excess return over the collateral rate, which
separates the return of the strategy from the return on cash. Leverage becomes
an explicit choice, the ratio of notional exposure to capital, rather than a
by-product of financing arrangements. The collateral assumption still matters,
since the same strategy reports a higher total return when rates are high, and
a careful record states which return it reports. The Forecaster Portfolio's
historical track record was built on futures data for these reasons; how that
data was constructed, and at what resolution, is proprietary.

> *A futures return has three parts: collateral, spot and roll. The roll yield
> is the basis converging, and it can add or subtract several per cent a
> year.*

**CHECKPOINT** — A future trades above spot and spot does not move. What does
a long position earn from the basis over the year?
- A positive roll yield
- A negative roll yield, as the future converges down to spot
- Nothing, because spot is unchanged

---

## §03 · Bias

### Survivorship and *look-ahead*

*Two classic errors that make a record look better than anything that could
have been achieved.*

Two errors in the handling of data have done more to flatter research records
than any other. Both are easy to commit, both bias results in the same
direction, and both are invisible in the final numbers unless the construction
of the record is examined. Survivorship bias removes the failures from the
evidence; look-ahead bias lets decisions use information that was not
available when they were made.

Survivorship bias arises whenever a dataset contains only what survived. A
database of funds that lists only those still operating, an index whose
history includes only today's members, or a collection of strategies that
excludes those abandoned after losses: each omits the cases that failed, and
failures are disproportionately the ones with poor returns. The average of
what remains overstates the average of what existed. Brown, Goetzmann,
Ibbotson and Ross showed that survivorship alone can create apparent skill and
apparent persistence in performance, and Elton, Gruber and Blake estimated its
effect on reported mutual fund returns.

**07 · SELECTION — Survivorship bias** *(screenshots 12, 13, 35)*

    bias = E[R | survived] − E[R] > 0

*Takeaway:* When failures leave the record, the average of the survivors
exceeds the average of everything that existed.

A simulation makes the mechanism exact. Take 1,000 strategies with no edge at
all, each with annual volatility of 15%, and follow them for ten years,
closing any strategy whose drawdown reaches 30%, as managers and investors
close failing strategies in practice. About 18% survive. The average annual
return of all the strategies is −1.2%, slightly below zero only because of the
volatility drag described in Lesson 1; the average of the survivors is 4.1%.
Figure 3.1 shows the process: failures leave the record at their worst
moments, and what remains looks like a population with an edge. Figure 3.2
shows that the inflation grows as the closure rule tightens, reaching about
5.3% a year at a 30% limit.

**FIGURE 3.1 — How failure creates apparent skill** *(screenshot 13; animated,
stepped)*

- **What it shows:** cumulative return (y-axis −50% to +100%+) against years
  (x-axis 0 to 10). Many thin lines fan out from 0%:
  - thin red lines, many of which stop part-way through;
  - thin pale grey-blue lines, which run on to year 10;
  - a thick green line rising steadily to about +60% at year 10, labelled
    "Survivors · 4.1% a year";
  - a grey line staying close to 0%, labelled "All strategies · −1.2%".
- Light green shading beneath the green line.
- **Step 3 (shown in the chart) — "3 · The survivors' average rises above
  zero although no strategy had an edge".**
- *(from page)* Step 1: "1 · Strategies with no edge: their average return is
  zero".
- *(from page)* Step 2: "2 · Each strategy that falls 30% from its high is
  closed and leaves the record".
- **Caption:** *Simulated strategies with no edge; those that fall 30% from
  their high are closed, and the survivors' average rises above zero.*
- Source tag: SIMULATION · FIXED SEED

**FIGURE 3.2 — The stricter the cull, the larger the bias** *(screenshots
13–14)*

- **What it shows:** survivors' average less true average, a year (y-axis 0%
  to 8%+) against drawdown at which a strategy is closed (x-axis about 22% to
  60%; ticks 30%, 40%, 50%, 60%). A single red line falls from above 8% at the
  left to about 1% at 60%. The area under it is shaded pale red.
- **Markers:** "30% · 5.3% a year"; end label "1.09%".
- **Caption:** *Survivors' average annual return less the true average,
  against the drawdown at which strategies are closed.*
- Source tag: SIMULATION · FIXED SEED

The same bias operates inside research itself. A researcher who tries many
variants of an idea and keeps only those that performed well is closing
failing strategies before they ever reach a record, and the variants that
remain carry exactly the inflation of Figure 3.2. This is why Lesson 2
insisted on a complete research record, every direction tried and every result
kept, and why Lesson 12 corrects the Forecaster Portfolio's significance for
the breadth of its own search. Survivorship is not only a property of
databases; it is a property of any process that discards its failures.

Futures data is less exposed than most, because an individual market's price
history is not ended by a bankruptcy or a delisting in the way a company's is.
Survivorship enters instead through the choice of markets. A study that
includes only the markets that are active today excludes those whose trading
dwindled, and those that dwindled often did so after the conditions a strategy
depended on disappeared. A careful record defines its universe with the
information available at each date, not with the list of markets that exist at
the end.

Look-ahead bias is subtler, because it rarely looks like cheating. It occurs
whenever a decision in the record uses information from after the moment at
which the decision would have been made. The most common form is execution at
a price that was only known after the signal was computed: a signal calculated
from a day's closing price cannot be filled at that same close. The effect can
be enormous. On a simulated random walk with no structure at all, a rule that
holds each day in the direction of that same day's return, filled at the close
it was computed from, shows a Sharpe ratio of about 21.2; filled honestly on
the following day, the same rule shows 0.19. Figure 3.3 shows the comparison.

**08 · INFORMATION — The information set of a decision** *(screenshots 14,
36)*

    position_t = g(ℱ_t),      look-ahead: g(ℱ_{t+h}),  h > 0

*Takeaway:* A position at time t may depend only on the information available
at t; any dependence on later information is look-ahead.

**FIGURE 3.3 — Seeing the future, as an equity curve** *(screenshots 14–15;
animated, stepped)*

- **What it shows:** cumulative return, % (y-axis 0 to 2,000) against years
  (x-axis 0 to 10). Two lines:
  - red, rising almost in a straight line to about 2,000 at year 10,
    labelled "Look-ahead · Sharpe 21.2", with pale red shading beneath;
  - navy, running along just below zero the whole way, labelled "Honest ·
    Sharpe 0.19".
- **Step 3 (shown in the chart) — "3 · On a random walk the honest rule earns
  nothing; the look-ahead rule never has a losing day".**
- *(from page)* Step 1: "1 · A rule that holds in the direction of each day's
  return, filled at that same close: it sees the future".
- *(from page)* Step 2: "2 · The identical rule filled honestly on the
  following day".
- **Caption:** *Cumulative return of one rule on a random walk with no
  structure: filled at the same close it was computed from, and filled
  honestly on the following day.*
- Source tag: SIMULATION · FIXED SEED

Other forms are harder to see. Economic data are published after a lag and
revised later, sometimes substantially; Croushore and Stark built real-time
datasets precisely so that research could use the figures that were actually
available at each date, rather than the revised figures known today. Index
membership, corporate events and even the identity of the most active contract
are known with certainty only in hindsight. And a back-adjusted price series,
as §01 showed, contains at every date the sum of roll gaps that had not yet
occurred: any rule that compares those adjusted prices with a fixed threshold
is using information from the future.

Figure 3.4 sets out the timeline that every record must respect: an event
happens, it is published after a lag, a decision may use only what has been
published, and later revisions cannot be used for earlier decisions. The
defences follow directly. Every datum carries the time at which it became
available, every decision is made from data stamped earlier than the decision,
every fill is at a price that was quoted after the decision, and every
universe is defined with the information of its own date. The architecture of
§01, with raw data untouched and trading simulated contract by contract at
quoted prices, is the foundation on which all of these defences rest.

> *Survivorship removes the failures from the evidence. Look-ahead lets
> decisions see the future. Both make a record look better than anything that
> could have been achieved.*

**FIGURE 3.4 — The information timeline** *(screenshots 15–16)*

- **What it shows:** four rounded boxes joined left to right by grey arrows:
  - "Event", sub-label "it happens" (grey border and title);
  - "Publication", sub-label "after a lag" (navy border);
  - "Decision", sub-label "uses only what is published" (green border and
    title);
  - "Revision", sub-label "later, not usable earlier" (red border and
    title).
- **Caption:** *An event, its publication after a lag, a decision that may use
  only what has been published, and later revisions that cannot be used
  earlier.*
- Source tag: DIAGRAM

**CHECKPOINT** — A rule is computed from each day's closing price and filled
at that same close. What is wrong?
- Nothing, if the rule is simple
- The fill uses a price that was only known after the signal was computed:
  look-ahead
- It suffers from survivorship bias

---

## §04 · Resolution

### The *resolution* of a record

*What finer data reveals, what it cannot, and where it starts to distort.*

A record can be kept at many resolutions: annual, monthly, weekly, daily or
finer still, each multiplying the number of observations. It is natural to
assume that more observations always mean more knowledge. For some quantities
they do; for the most important one they do not; and beyond a certain point
additional resolution introduces errors of its own. Figure 4.3 shows the same
market at four resolutions: a coarse record hides the risk that happened
inside each period. The resolution of the Forecaster Portfolio's own data is
proprietary; this chapter develops the general principles that govern the
choice.

The first principle is due to Merton. The precision with which an average
return can be estimated depends on the span of time the record covers, not on
how often it is sampled. Over a span of T years, the standard error of the
estimated mean return is the annual volatility divided by the square root of
T, whatever the number of observations: daily data over ten years estimates
the mean no better than annual data over the same ten years. With volatility
of 16%, ten years leave a standard error of about 5.1% a year, as large as a
typical edge of 5%. No increase in resolution can shrink it; only a longer
record can.

**09 · PRECISION — What resolution can and cannot estimate** *(screenshots 16,
17, 37)*

    SE(μ̂) = σ / √T   (independent of n),      SE(σ̂) / σ ≈ 1 / √(2n)

*Takeaway:* The error of the mean depends on the span T alone; the relative
error of the volatility falls with the number of observations n.

Volatility behaves in the opposite way. Its precision improves with every
observation, because each observation carries information about the size of
moves regardless of the span it covers. From annual data over ten years, the
relative error of an estimated volatility is about 22%; from daily data over
the same span, about 1.4%. Figure 4.1 shows the two curves parting: finer data
transforms the estimation of risk and leaves the estimation of return
untouched. This asymmetry explains much of quantitative practice, in which
risk is measured precisely and expected returns are known only roughly, and it
is why the significance tests of later lessons depend on the length of the
record rather than its resolution.

**FIGURE 4.1 — Resolution helps risk, not return** *(screenshot 17; animated,
stepped)*

- **What it shows:** relative standard error (logarithmic y-axis, 0.1% to
  100%) against observations a year (logarithmic x-axis: "Annual", "Monthly",
  "Weekly", "Daily", "5-minute"). Two lines:
  - red, flat along 100%, labelled "Mean of 5% a year · error about equal
    to it", end label "1.01%";
  - green, a straight line falling from about 20% at Annual to below 0.2% at
    5-minute, labelled "Volatility from daily data · 1.4%" at Daily, end
    label "0.00%".
- Shading: pale red between the lines, pale green beneath the green line.
- **Step 3 (shown in the chart) — "3 · Finer data serves risk estimation, not
  return estimation".**
- *(from page)* Step 1: "1 · The mean: precision set by the span of time, not
  by sampling".
- *(from page)* Step 2: "2 · Volatility: precision improves with every
  observation".
- **Caption:** *Relative standard error of an estimated mean and of an
  estimated volatility against observations a year, over a fixed ten-year
  span.*
- Source tag: ANALYTIC · MERTON (1980)

The second principle sets a limit on the first. At very high frequencies,
observed prices are not the efficient prices of theory: they bounce between
bid and offer, move in discrete increments and respond to the mechanics of
each trade. This microstructure noise adds a component to every observed
return. Realised variance, the sum of squared returns over a period, then
measures the true variance plus twice the number of observations times the
noise variance, so the finer the sampling, the larger the error. Aït-Sahalia,
Mykland and Zhang showed how to choose the sampling frequency, and how to
combine frequencies, so as to balance the precision gained from more
observations against the noise they bring.

**10 · NOISE — Realised variance under microstructure noise** *(screenshots
17, 18, 38)*

    E[RV_n] = σ² T + 2n ω²

*Takeaway:* Each observation adds noise of variance ω², so the expected
realised variance grows with the number of observations n.

Figure 4.2 shows the effect as a signature plot, a standard diagnostic. With a
true volatility of 16.0% and noise of two basis points per observation,
volatility measured from five-minute returns is about 16.5%, from one-minute
returns 18.3%, and from ten-second returns 27.0%. The market is no more
volatile at ten seconds; the measurement is inflated by noise. A record kept
at too fine a resolution can therefore overstate risk, and a strategy
evaluated on such a record can appear to face hazards that are artefacts of
the data.

**FIGURE 4.2 — A signature plot** *(screenshot 18)*

- **What it shows:** measured annual volatility (y-axis 16% to 28%) against
  sampling interval (logarithmic x-axis: 10 s, 1 min, 5 min, 30 min, 1 day). A
  single red curve falls steeply from about 27% at 10 s and flattens onto 16%
  by 1 day. The area under it is shaded pale red.
- A dashed horizontal line at 16%, labelled "True volatility 16%".
- **Markers:** red "10 s · 27.0%"; grey "1 min · 18.3%"; navy "5 min ·
  16.5%".
- **Caption:** *Measured annual volatility against the sampling interval, for
  a true volatility of 16% and noise of two basis points per observation.*
- Source tag: ANALYTIC · MICROSTRUCTURE NOISE

The third principle connects resolution to decisions. Shannon's sampling
theorem states that a signal must be sampled at least twice per cycle to be
represented faithfully; components faster than that are not merely lost but
folded back into slower ones, a distortion called aliasing. The analogue in
research is that data must be fine enough to observe the behaviour a strategy
responds to, while data much finer than the horizon of its decisions adds
noise without adding usable information. Coarser data delays the response to
changing conditions; finer data increases turnover, costs and exposure to the
artefacts of microstructure. The right resolution matches the horizon of the
decisions and the costs of acting on them.

Resolution also interacts with every bias of §03. Finer records multiply the
opportunities for look-ahead, because more timestamps must be aligned, and
they magnify the influence of small errors in prices at rolls. Coarser records
are more robust to these errors but conceal intra-period risk, such as a deep
drawdown that recovered before the period closed. A careful researcher states
the resolution of a record, the reasons for it, and the risks it hides. For
the Forecaster Portfolio that resolution is proprietary; the figures in this
series are presented at coarse resolution, for the reasons of Lesson 4.

> *More observations sharpen the estimate of risk. Only more time sharpens the
> estimate of return.*

**FIGURE 4.3 — The same market at four resolutions** *(screenshot 19;
animated, stepped)*

- **What it shows:** price (y-axis 40 to 120) against years (x-axis 0 to 10).
  - A grey line of straight segments joins points a year apart.
  - Several jagged lines (navy, green and red) lie almost on top of one
    another, tracing the detailed path: a rise to about 118 in the first
    year and a half, a fall to under 90 by year 2, swings between about 80
    and 105 to year 8, a sharp fall to about 57 after year 9, and a recovery
    to the end label "69.2".
- Grey shading beneath the lines.
- **Marker:** a red dot at the low just after year 9, labelled "Deepest daily
  drawdown −52.2%", with "invisible at annual resolution (−40.6%)" beneath.
- **Step 4 (shown in the chart) — "4 · Daily: the full path, drawdown
  −52.2%. Coarse records hide risk that happened inside the period".**
- *(from page)* Step 1: "1 · Annual: ten observations, drawdown −40.6%".
- *(from page)* Step 2: "2 · Monthly: the path begins to show its falls,
  drawdown −51.5%".
- *(from page)* Step 3: "3 · Weekly: more of the shape appears".
- **Caption:** *One simulated ten-year market recorded at annual, monthly,
  weekly and daily resolution. The deepest drawdown measures −40.6% annually
  and −52.2% daily.*
- Source tag: SIMULATION · FIXED SEED

**CHECKPOINT** — A researcher switches from monthly to daily data over the
same ten-year span. What happens to the precision of the estimated mean
return?
- It improves about 4.6 times
- It barely changes, because it depends on the span of time
- It falls

---

## §05 · Macro

### *Macro* in the data

*How rates, inflation and liquidity run through every series, and why a record
holds fewer regimes than days.*

No price series is a closed system. Every one of them is produced inside a
macroeconomic environment: a path of policy rates, an inflation regime, a
cycle of growth and recession, and a state of market liquidity that can change
in a week. The environment is not noise added to the series; it is a
determinant of the series, and a research record that spans only part of it
has seen only part of what the markets can do.

For futures data the transmission is unusually direct, because the cost of
carry puts the financing rate inside the price. From the relation of §02, the
logarithm of a future relative to spot is the net carry rate multiplied by the
time to expiry, so a rise of one point in rates raises a one-year future by
about 1% relative to spot. Figure 5.1 shows the basis against the financing
rate for three yields: when rates exceed the income or convenience of holding
the asset, the term structure stands in contango and long positions pay a
negative roll yield; when they fall below it, backwardation returns and the
roll yield turns positive. A tightening cycle therefore shifts whole term
structures, and with them one of the three components of every futures return.

**11 · TRANSMISSION — Rates inside the price** *(screenshots 20, 39)*

    ∂ ln F_{t,T} / ∂r = T − t   ⇒   one point of rates moves a one-year future by about 1%

*Takeaway:* The sensitivity of a future to the financing rate equals its time
to expiry; policy rates move term structures mechanically.

**FIGURE 5.1 — Rates move the term structure** *(screenshots 20–21)*

- **What it shows:** one-year future relative to spot (y-axis −5% to +10%)
  against financing rate (x-axis 0% to 8%). Three parallel straight lines
  rising to the right, with grey shading between them and pale red shading
  beneath the lowest. Legend, top left:
  - navy "No income or convenience yield", from 0% to "8.33%" at 8%;
  - grey "Yield 3%", from about −3% to about +5%;
  - red "Yield 6%", from about −6% to about +2%.
- A horizontal grey line at 0%, labelled "Future equals spot".
- **Marker:** a navy dot at 5%, labelled "Rates 5%, no yield · +5.1%".
- **Caption:** *A one-year future relative to spot against the financing rate,
  for three values of income or convenience yield.*
- Source tag: ANALYTIC · COST OF CARRY

Inflation and growth enter through the other terms. Inflation raises the
expected drift of nominal prices and the cost of storage; growth and scarcity
raise the convenience of holding physical assets and so deepen backwardation;
expectations of either change the slope of term structures before the facts
arrive. Because these effects differ across markets, a portfolio of futures
carries a varied macro exposure through its carry alone, before any view about
direction is taken.

Liquidity is the third channel, and the most abrupt. Lesson 4 described market
impact under normal conditions, with depth available at every price. In
stress, depth thins and spreads widen precisely when forced selling arrives,
so the impact of a given trade can multiply within days. Volatility regimes
are the visible face of the same shift: the clustering of §02 operates not
only from day to day but across months, as calm and turbulent spells succeed
one another. Figure 5.2 sets out the two chains of transmission.

**FIGURE 5.2 — Two channels of transmission** *(screenshot 21)*

- **What it shows:** six rounded boxes in two rows of three, each row joined
  left to right by grey arrows.
  - Top row: "Policy rates", sub-label "financing cost" (navy border) →
    "Carry and basis", sub-label "term structure shifts" (green border and
    title) → "Roll yield", sub-label "return component" (green border and
    title).
  - Bottom row: "Stress", sub-label "forced selling" (red border and title)
    → "Liquidity", sub-label "depth thins, spreads widen" (grey border) →
    "Volatility regime", sub-label "clusters for months" (grey border).
- **Caption:** *Policy rates enter prices through carry and roll yield; stress
  enters through liquidity and volatility regimes.*
- Source tag: DIAGRAM

This has a consequence for evidence that is easy to overlook. A record is
usually described by its length in days, but what it has witnessed is better
described by the number of distinct macro episodes it contains, and those are
few. Figure 5.3 shows the simulated market of Lesson 3 over ten years: its
rolling volatility has a median of about 14%, and spells of at least a month
above one and a quarter times that median, the turbulent regimes, occur 5
times, lasting about 2.7 months on average. Ten years of daily data, over two
and a half thousand observations, contain only a handful of such episodes.

If a regime lasts a year or two, a record of 5 years contains perhaps three or
four independent ones, however many days it holds. This is Lesson 1's lesson
again: observations within a regime are not independent evidence about
behaviour across regimes, and only the passage of time, through new regimes,
adds that evidence. Lessons 6 and 10 ask how the Forecaster Portfolio's record
behaves under stress, and Lesson 16 how much a forward record adds; both
questions are, at root, questions about regimes.

**12 · REGIMES — How many regimes a record contains** *(screenshots 22, 40)*

    n_regimes ≈ T / τ_regime      (independent macro episodes in a record of length T)

*Takeaway:* The number of independent macro episodes is the record's length
divided by the typical length of a regime, and is far smaller than the number
of observations.

**FIGURE 5.3 — A record holds few regimes** *(screenshot 22; animated,
stepped)*

- **What it shows:** rolling three-month volatility (y-axis 0% to 30%) against
  years (x-axis 0 to 10). A single navy line wanders mostly between about 11%
  and 18%, with peaks just above 18% near years 1, 6.5, 7 and 8, and a final
  rise to "23.9%" at year 10. Grey shading beneath it.
- A dashed red horizontal line at about 17.5%, labelled "One and a quarter
  times the median"; the parts of the navy line above it are shaded red.
- **Step 3 (shown in the chart) — "3 · 5 such spells in ten years, averaging
  2.7 months: a record holds only a few regimes".**
- *(from page)* Step 1: "1 · Volatility measured over rolling three-month
  windows".
- *(from page)* Step 2: "2 · Spells of at least a month above one and a
  quarter times the median: the turbulent regimes".
- **Caption:** *Rolling three-month volatility of a simulated market over ten
  years, with spells above one and a quarter times the median shaded.*
- Source tag: SIMULATION · GARCH(1,1), FIXED SEED

The choice of where a record begins is itself a macro decision, and a cousin
of the survivorship bias of §03. A record that starts just after a stress
episode, or just as a favourable regime begins, inherits the flattering half
of a cycle; one that starts before it carries the whole. Because a researcher
sees the past when choosing a start date, the honest rule is to report the
record from the first date the data allow, as the Forecaster Portfolio's
historical track record does, and to treat any later start as a selection that
must be declared and justified.

Regimes also govern diversification. Correlations between markets are not
constants; they rise in stress, when the liquidity channel of Figure 5.2
forces many holders to sell many things at once, so that a portfolio that
appears diversified in calm regimes may behave as a single position in
turbulent ones. Lesson 6 measures this for the Forecaster Portfolio's own
legs. The point for data is that correlations estimated over a record of few
regimes describe those regimes, not all regimes, and a record that has seen no
stress has not yet measured its own diversification.

The practical discipline follows. A research record states the macro
environment it was built in: the direction of rates, the inflation regime, the
stress episodes it contains and those it does not. Results are read against
that statement rather than in isolation, and a strategy's sensitivity to each
channel, to carry, to liquidity and to volatility regime, is examined
explicitly rather than assumed away. The macro environment of the Forecaster
Portfolio's historical track record is a matter of public record; what the
system does with it is proprietary.

> *A record is measured in days but witnesses in regimes. Ten years of data
> may contain only a handful of them.*

**CHECKPOINT** — Why does a long daily record provide only limited evidence
about how a strategy behaves across macro regimes?
- Daily data are too noisy to use
- Observations within a regime are not independent evidence about other
  regimes, and a record contains few regimes
- Macro conditions do not affect futures prices

---

## §06 · Quality

### Data quality as *evidence*

*Why cleaning, validation and an audit trail belong in the research record.*

Everything in this lesson converges on one claim: the data behind a research
record is part of its evidence, and the care taken over it should be stated
and verifiable in the same way as the tests performed on it. Three practices
make that possible: cleaning that measures its own effect, validation that
flags rather than alters, and an audit trail that makes the dataset itself a
fixed, verifiable object.

Errors in price data are ordinary. Exchanges correct bad prints, feeds drop
days, holidays differ across markets so that one series has a price where
another has none, and an expiring contract's last trade may be hours stale.
Each error is small in the record and large in the statistics. A single bad
print of k daily standard deviations in a record of n days raises the measured
variance by about k²/n and the excess kurtosis by about k⁴/n. In a
thousand-day record, one print of five standard deviations raises measured
volatility by +1.2%; one of ten raises it by +4.9% and adds about 10 to the
excess kurtosis; one of fifteen raises volatility by +10.7%. A single wrong
number can therefore make a calm series look dangerous, or hide a real tail
among false ones. Figure 6.1 shows the effect.

**13 · ERRORS — What one bad print does** *(screenshots 24, 41)*

    Δσ² / σ² ≈ k² / n,      Δκ_ex ≈ k⁴ / n

*Takeaway:* A single error of k standard deviations in n days raises measured
variance by about k²/n and excess kurtosis by about k⁴/n.

**FIGURE 6.1 — One wrong number** *(screenshot 24)*

- **What it shows:** two curves against size of a single bad print, in daily
  standard deviations (x-axis 2σ to 15σ; ticks 2σ, 5σ, 10σ, 15σ). Left axis:
  rise in measured volatility (0% to 12%). Right axis: added excess kurtosis
  (0 to 40+). Legend, top left:
  - navy "Volatility (left)", curving up to about 10.7% at 15σ;
  - red "Excess kurtosis (right)", flat at first, then rising steeply, ending
    above the navy curve at 15σ.
- Shading: grey beneath the navy curve, pale red beneath the red curve.
- **Markers:** navy "10σ · volatility +4.9%"; red "10σ · kurtosis +10".
- **Caption:** *Rise in measured volatility and added excess kurtosis caused
  by a single bad print of a given size in a record of a thousand days.*
- Source tag: ANALYTIC · MODEL CALCULATION

Validation therefore screens every series before it is used. Returns beyond a
threshold set from recent volatility are flagged; prices that fail to move for
days are flagged as stale; gaps in the calendar are reconciled across markets;
volumes are checked for consistency with prices; and where a second source
exists, the two are compared. The screens flag and never alter: a flagged
value is examined, and if it is corrected the correction is itself recorded,
with its reason. Silent correction is a form of look-ahead, because the
corrected series is one that no one could have traded at the time.

A simple round trip tests the construction of §01: returns computed from the
record are chained back into prices, and the result must reproduce the raw
prices exactly within each contract. Any difference marks a roll handled
wrongly or a price altered without record. Checks of this kind are cheap, and
they catch the construction errors that most flatter or damage a record.

The audit trail makes the dataset verifiable. Once cleaned and validated, the
data are stored in an immutable form and hashed, as Lesson 4 described for a
strategy specification: the hash fixes the dataset at a moment, and any later
change produces a different hash. Versions are kept rather than overwritten,
so that any result can be traced to the exact data that produced it. A data
manifest records what the dataset contains, the rules by which it was
constructed and cleaned, the resolution and the hashes, without naming
anything proprietary. Figure 6.2 sets out the pipeline.

**14 · AUDIT TRAIL — The dataset as a fixed object** *(screenshots 25, 42)*

    h = SHA-256(dataset),      record = {sources, rules, h}

*Takeaway:* A hash fixes the dataset; the research record stores the sources,
the rules and the hash, so any result can be traced to exact data.

**FIGURE 6.2 — A pipeline that never edits in place** *(screenshot 25)*

- **What it shows:** five rounded boxes joined left to right by grey arrows:
  - "Raw prices", sub-label "never edited" (navy border);
  - "Screens", sub-label "flag, never alter" (grey border and title);
  - "Immutable store", sub-label "hashed, versioned" (green border and
    title);
  - "Derived views", sub-label "deterministic" (grey border and title);
  - "Research record", sub-label "manifest and hashes" (navy border).
- **Caption:** *Raw prices are never altered; screens flag; the validated
  dataset is hashed and versioned; derived views are deterministic; the
  research record carries the manifest and the hashes.*
- Source tag: DIAGRAM

Regulated institutions have formalised the same practices. After the financial
crisis, the Basel Committee on Banking Supervision issued its principles for
risk data aggregation and reporting, known as BCBS 239, requiring banks to be
able to show that the data behind their risk measures are accurate, complete,
timely and adaptable, with governance and audit trails to prove it. The
principles were written for balance sheets rather than research records, but
the standard they set is the one this chapter describes: a number is only as
credible as the demonstrable quality of the data behind it.

Reproducibility closes the loop. A result in a research record should be
reproducible from the stated data, the stated rules and the stated code, which
means pinning all three together: the dataset by hash, the construction and
cleaning rules in the manifest, and the research code under version control
alongside them. A result that cannot be regenerated from pinned inputs is a
report of what happened once, not evidence. Institutions apply this through
independent reproduction of key results before capital is committed, and it is
the standard to which the figures in this series are held.

The Forecaster Portfolio's data follow this discipline. Its sources are
unnamed, its resolution and construction are proprietary, and nothing in this
series describes either; but the practices of this chapter, never editing in
place, flagging rather than altering, fixing the dataset by hash and keeping
every version, are the general standard against which any research record,
including this one, should be read. The remaining lessons examine the record
that these data produced, beginning, in Lesson 6, with how its ten legs
combine into a portfolio.

> *Data are part of the evidence. A record is only as credible as the dataset
> behind it, and that dataset should be fixed, verifiable and never silently
> changed.*

**CHECKPOINT** — A single bad print of ten daily standard deviations sits in a
thousand-day record. Roughly what does it do to the measured excess kurtosis?
- Nothing measurable
- Adds about 0.1
- Adds about 10

---

## Appendix · Glossary and sources

### Terms and *sources*

| Term | Definition |
|---|---|
| Roll | Replacing an expiring contract with the next in a continuous series. |
| Difference adjustment | Shifting earlier prices by each roll gap; preserves price changes. |
| Ratio adjustment | Scaling earlier prices by each roll ratio; preserves percentage returns. |
| Return index | Daily returns computed within one contract and chained, so roll gaps never enter. |
| Cost of carry | The net cost of holding an asset to delivery, linking future and spot prices. |
| Basis | The future price less the spot price; it converges to zero at expiry. |
| Contango | A term structure in which later prices exceed nearer ones. |
| Backwardation | A term structure in which later prices lie below nearer ones. |
| Roll yield | The return from the basis converging as a future approaches expiry. |
| Survivorship bias | Overstatement of returns caused by excluding failures from the record. |
| Look-ahead bias | Decisions in a record that use information not available at the time. |
| Real-time data | Data as they were available at each date, before later revisions. |
| Microstructure noise | Deviations of observed prices from efficient prices caused by the mechanics of trading. |
| Realised variance | The sum of squared returns over a period. |
| Signature plot | Measured volatility against sampling interval, revealing microstructure noise. |
| Aliasing | Distortion when a signal is sampled too coarsely to represent its fastest components. |
| Regime | A spell of broadly stable macro or market conditions, such as a tightening cycle or a liquidity stress. |
| Convenience yield | The benefit of holding a physical asset rather than a claim on it, which lowers futures prices relative to spot. |
| Bad print | An erroneous recorded price. |
| Stale price | A price that fails to update because no trade occurred. |
| Data manifest | A record of a dataset's contents, construction rules, cleaning rules and hashes. |

### Sources

- Hull. Options, Futures, and Other Derivatives, Pearson.
- Cox, Ingersoll and Ross (1981). The relation between forward prices and futures prices, Journal of Financial Economics 9(4).
- Keynes (1930). A Treatise on Money, Macmillan.
- Brown, Goetzmann, Ibbotson and Ross (1992). Survivorship bias in performance studies, Review of Financial Studies 5(4).
- Elton, Gruber and Blake (1996). Survivor bias and mutual fund performance, Review of Financial Studies 9(4).
- Croushore and Stark (2001). A real-time data set for macroeconomists, Journal of Econometrics 105(1).
- Merton (1980). On estimating the expected return on the market, Journal of Financial Economics 8(4).
- Aït-Sahalia, Mykland and Zhang (2005). How often to sample a continuous-time process in the presence of market microstructure noise, Review of Financial Studies 18(2).
- Shannon (1949). Communication in the presence of noise, Proceedings of the IRE 37(1).
- Basel Committee on Banking Supervision (2013). Principles for effective risk data aggregation and risk reporting (BCBS 239).

*Educational content only. Not financial advice.*
