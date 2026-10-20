# SERIES 03 - The Instruments

Every problem in the first series comes down to the same thing: a claim nobody could check. These are the instruments that let you check. What each number measures, what it quietly hides, and which question it answers.

## i1 - The Equity Curve (7 min)

The most persuasive picture in this industry. What is it actually telling you, and what is it leaving out?

### Slide 1 - cover: The *Equity Curve*

**eyebrow:** Series 03

**sub:** It is the first thing you are shown and the last thing anybody questions. So what does a rising equity curve actually prove? Decide before you continue. The honest answer is narrower than you expect, and far more useful than the one most people carry.

### Slide 2 - demo: The same trades, in a different order

**interactive demo:** `samecurve`  (caption below)

**sub:** One fixed set of trades. Only the sequence changes. Press it a few times.

**cap:** Every curve here contains the identical trades and finishes at the identical number. What changes is the order they arrived in, and that alone moves the worst drawdown by a wide margin. So the shape of a curve is partly the strategy and partly the order in which luck arrived. Any judgement you form from the shape includes both, and the picture does not tell you which is which.

### Slide 3 - concepts: What a curve shows, and what it hides

**items:**
  -
    **i:** trend
    **t:** It shows the endpoint clearly
    **d:** Total result over the period is the one thing a curve genuinely reports.
  -
    **i:** shuffle
    **t:** It hides the ordering
    **d:** The same trades in another sequence produce a different shape and a different worst moment.
  -
    **i:** bars
    **t:** It hides the sample
    **d:** A curve rarely states how many trades it contains, and that number decides how much it can mean.
  -
    **i:** loop
    **t:** It hides what was removed
    **d:** Costs, slippage, the periods excluded, and any accounts that were not shown.

**body:**
  - **A curve is a summary, and every summary is a choice about what to leave out.**
  - That is not a criticism of the format. It is the reason a curve should be the start of your questions rather than the end of them. What period, how many trades, gross or net, and what happened either side of the window shown.
  - The useful habit is to look at the axes before the line. A curve with no scale, no dates and no trade count is a shape, not a record.

**beat4:** Because a rising line is the most immediately persuasive object anybody can put in front of you, and it requires no explanation to feel convincing. Numbers need reading. A curve needs only a glance, which is exactly why it is the thing that gets shown and the thing least often interrogated.

### Slide 4 - demo: The same curve, after costs

**interactive demo:** `costcurve`  (caption below)

**sub:** One strategy, unchanged. Move the cost per trade.

**cap:** The green line is the version that gets posted. The other line is what the same rule actually produced once the cost of trading it was included. Notice how little it takes to remove the edge entirely, and that nothing about the rule changed on the way there. Whenever a curve is shown without a stated cost assumption, this is the question it is avoiding.

### Slide 5 - concepts: How to read one properly

**items:**
  -
    **i:** check
    **t:** Read the axes first
    **d:** Scale, period and whether the vertical axis is linear or logarithmic.
  -
    **i:** bars
    **t:** Find the trade count
    **d:** A hundred trades and ten thousand trades produce equally smooth pictures and very different confidence.
  -
    **i:** target
    **t:** Ask gross or net
    **d:** If costs are not stated, assume the figure is gross and treat it accordingly.
  -
    **i:** eye
    **t:** Look for the worst stretch
    **d:** The deepest point and how long it lasted matter more than the endpoint for anything you have to hold.

**body:**
  - **Four questions, and most curves fail at least two of them.**
  - Logarithmic axes deserve their own mention. On a log scale, equal vertical distances are equal percentage moves, which is the honest way to show compounding. On a linear scale, early results look flat and recent ones look dramatic, which flatters whatever happened most recently.
  - None of this requires distrust. It requires the same reading you would give any other summary statistic, which is exactly what a curve is.

**caveatLabel:** Where this needs qualifying

**caveat:**
  - **A curve is still the right first thing to look at.** It shows the path, and the path is what you have to live through, which no single number captures.
  - The point is not to dismiss it but to stop it being the only thing you look at. A curve with a stated period, trade count and cost assumption beside it is genuinely informative.

### Slide 6 - compare: A curve that informs and a curve that persuades

**sub:** Both are real pictures of real results.

**left:**
  **h:** Built to persuade
  **chip:** Ask questions
  **items:**
    - No axis labels or dates
    - Trade count not stated
    - Costs not mentioned
    - Period chosen after the fact
    - Linear axis on a compounding series

**right:**
  **h:** Built to inform
  **chip:** Usable
  **items:**
    - Scale and period labelled
    - Number of trades stated
    - Costs applied and named
    - Full available history shown
    - Logarithmic axis where it compounds

**body:**
  - **The difference costs nothing to produce, which is what makes its absence informative.**
  - Labelling an axis and stating a trade count takes seconds. When they are missing from something built to be shown publicly, that is a choice rather than an oversight.
  - So treat the missing pieces as the message. A curve that avoids stating its sample is telling you what its sample would say.

### Slide 7 - check: Check yourself

**qs:**
  -
    **q:** Two curves contain the identical trades in a different order. What differs?
    **o:**
      - The final result
      - The shape and the worst drawdown, but not the final result
      - Nothing, they are the same
    **a:** 1
    **why:** Order does not change the sum, so the endpoint is identical. It does change the path, and the path decides the worst moment and whether it was survivable.
  -
    **q:** A curve is shown with no stated costs. How should you read it?
    **o:**
      - As the net result
      - As a gross figure, with the real result somewhere below it
      - Costs are negligible so it makes no difference
    **a:** 1
    **why:** Costs are subtracted from every trade and often remove a marginal edge entirely. An unstated cost assumption means the figure shown is the best case.
  -
    **q:** Why does a logarithmic vertical axis matter on a long compounding series?
    **o:**
      - It makes the curve look smoother
      - Equal distances become equal percentage moves, so early and recent periods are comparable
      - It is only a stylistic choice
    **a:** 1
    **why:** On a linear axis a compounding series makes early performance look flat and recent performance look dramatic, which distorts the comparison between periods.

### Slide 8 - takeaways: What to carry forward

**keys:**
  - A curve reliably reports one thing: the endpoint over the period shown.
  - The shape is partly the strategy and partly the order in which results arrived.
  - Costs are subtracted from every trade, and a small cost removes a marginal edge entirely.
  - Read the axes, the period and the trade count before you read the line.
  - What a curve leaves out is a choice, and the choice is usually the most informative part.

**unlocks:**
  - Interrogate any equity curve in four questions before forming a view.
  - Recognise when a shape is flattering the ordering rather than the strategy.
  - Estimate what a stated result would look like once realistic costs are applied.

**connectsLabel:** Where this connects

**connects:**
  -
    **to:** p1/0
    **title:** Why None of It Worked
    **why:** The curve is usually what is offered in place of an answer to the four questions.
  -
    **to:** p5/0
    **title:** The Sample You Were Shown
    **why:** Curves that reach you have already passed a filter. This is how to read one anyway.
  -
    **to:** r1/0
    **title:** The Mathematics of Drawdown
    **why:** The worst stretch on a curve is the part that decides what you can hold.

**bridge:**
  **label:** Next in this series
  **title:** Return Figures
  **text:** A curve ends at a number, and that number gets quoted as a percentage. Which percentage, over what period, and why do three different figures describe the same result?

## i2 - Return Figures (7 min)

Total return, annualised return, average return. Same result, three numbers. Which one is lying?

### Slide 1 - cover: Return *Figures*

**eyebrow:** Series 03

**sub:** A result gets quoted as a percentage, and which percentage gets quoted is a decision. Did a strategy that returned 8 percent over two months have a good year? Answer before you continue. The trap is that you have not been told anything about a year at all.

### Slide 2 - demo: Annualising a short run

**interactive demo:** `annualise`  (caption below)

**sub:** One fixed result of 8 percent. Change how long it took.

**cap:** The gain is identical at every point on this line. All that changes is the length of the period it is divided into, and the shorter the period the more spectacular the annual figure becomes. Nothing was earned. A short sample was projected forward as though it would repeat, which is exactly the assumption the sample is too small to support.

### Slide 3 - concepts: Three numbers for one result

**items:**
  -
    **i:** bars
    **t:** Total return
    **d:** What actually happened over the period shown. The only figure that requires no assumption.
  -
    **i:** trend
    **t:** Annualised return
    **d:** What the period implies for a year, assuming it repeats. Reasonable over years, absurd over weeks.
  -
    **i:** shuffle
    **t:** Average return per period
    **d:** The arithmetic mean of the periods, which is not what compounding delivers.
  -
    **i:** target
    **t:** Compound growth rate
    **d:** The constant rate that would produce the same finish. Lower than the average whenever results vary.

**body:**
  - **All four describe the same result and none of them are wrong. They answer different questions.**
  - The one that gets quoted is usually the largest, and the largest is usually the one carrying the strongest assumption. Annualising a two month run assumes five more identical runs that never happened.
  - So the question is not which number is correct. It is which question the number answers, and whether that is the question you were asking.

**beat4:** Because a bigger number is a better headline and nobody is obliged to say which figure they used. Annualising is a legitimate technique with a legitimate purpose, which is precisely what makes it useful for anybody wanting to present a modest result impressively without saying anything false.

### Slide 4 - demo: Choose your start date

**interactive demo:** `windowpick`  (caption below)

**sub:** One strategy, three years of it. Slide the twelve month window.

**cap:** Every window here is a real twelve month period from the same strategy on the same data. The figure quoted swings enormously depending only on where the window begins. When a result is presented for a specific period, the first question is who chose the period, and whether it was chosen before or after the outcome was known.

### Slide 5 - concepts: What to ask of any return figure

**items:**
  -
    **i:** check
    **t:** Over what period
    **d:** Stated dates, not a vague duration, and long enough that a single stretch cannot dominate it.
  -
    **i:** eye
    **t:** Who chose the window
    **d:** A period selected after the outcome is known is a choice, not a measurement.
  -
    **i:** bars
    **t:** Total or annualised
    **d:** If annualised from a short sample, mentally convert it back to what actually happened.
  -
    **i:** loop
    **t:** Net of what
    **d:** Costs, fees and financing all sit between the gross figure and the money.

**body:**
  - **Four questions, and the answers are usually absent rather than false.**
  - The most useful mental habit is to convert everything back into total return over a stated period, because that is the version with no assumption baked in. A figure that resists that conversion is telling you something.
  - None of this requires suspicion of the person quoting. It requires knowing which of four questions the number in front of you happens to answer.

**caveatLabel:** Where this needs qualifying

**caveat:**
  - **Annualising is not a trick.** It is the standard way to compare results of different lengths, and over multi year samples it is exactly the right figure to use.
  - The problem is short samples specifically. Below a year, the projection assumes repetition that the sample cannot support, and the shorter the window the larger the assumption hidden inside the number.

### Slide 6 - compare: Two ways to state the same result

**sub:** Both accurate, only one informative.

**left:**
  **h:** Presented
  **chip:** Assumption heavy
  **items:**
    - Annualised from a short window
    - Period chosen after the fact
    - Gross of costs
    - No dates given
    - Best figure of several available

**right:**
  **h:** Informative
  **chip:** Assumption light
  **items:**
    - Total return over stated dates
    - Full available history
    - Net of costs and fees
    - Number of trades stated
    - The same figure reported every period

**body:**
  - **The right column is harder to produce, which is what makes it worth more.**
  - Reporting the same figure every period regardless of outcome is the strongest signal on this page, because it removes the option of choosing when to speak.
  - That is what a track record is. Not a number, but the commitment to keep publishing the number.

### Slide 7 - check: Check yourself

**qs:**
  -
    **q:** A strategy gained 8 percent in two months, quoted as 59 percent annualised. What happened?
    **o:**
      - It earned 61 percent
      - It earned 8 percent, projected forward as though it would repeat five more times
      - It earned 8 percent a year
    **a:** 1
    **why:** Eight percent compounded six times is roughly 59 percent, so the figure is arithmetically correct. It assumes the two months repeat for a full year, and that assumption carries more weight than the result itself.
  -
    **q:** Why does the start date of a twelve month window matter so much?
    **o:**
      - It does not, a year is a year
      - Because the same strategy produces very different annual figures depending where the window falls
      - Because markets are seasonal
    **a:** 1
    **why:** Any path contains good and bad stretches. Choosing where the window begins chooses which stretches are included, which is why the person selecting the period matters.
  -
    **q:** Which figure carries the fewest assumptions?
    **o:**
      - Annualised return
      - Total return over stated dates
      - Average return per trade
    **a:** 1
    **why:** Total return over a stated period is what happened. Everything else projects, averages or converts it, and each of those steps adds an assumption.

### Slide 8 - takeaways: What to carry forward

**keys:**
  - One result can be stated four ways, and the largest figure usually carries the strongest assumption.
  - Annualising a short sample projects a period forward as though it repeats.
  - Moving the start date of a window changes the figure enormously, on identical data.
  - Convert everything back to total return over stated dates before comparing anything.
  - Reporting the same figure every period, whatever it says, is worth more than any single number.

**unlocks:**
  - Convert any quoted return back into what actually happened over a stated period.
  - Spot when a window was chosen after the outcome was known.
  - Compare two results honestly, on the same basis, rather than on the basis each chose for itself.

**connectsLabel:** Where this connects

**connects:**
  -
    **to:** l2/0
    **title:** Evaluating Trading Education
    **why:** A performance claim is mostly a choice about which figure to quote.
  -
    **to:** p5/0
    **title:** The Sample You Were Shown
    **why:** Choosing the window and choosing which results to post are the same mechanism.

**bridge:**
  **label:** Next in this series
  **title:** Drawdown and Time Under Water
  **text:** Return figures describe the destination. But what decides whether you are still holding when it arrives? That is a different instrument, and a more uncomfortable one.

## i3 - Drawdown and Time Under Water (7 min)

Two strategies report the same maximum drawdown. Why is one of them far harder to hold?

### Slide 1 - cover: Drawdown and *Time Under Water*

**eyebrow:** Series 03

**sub:** Maximum drawdown is the one risk figure almost everybody quotes. So what does it tell you about holding the thing? Decide now, because it is a single number describing an experience that ran for months, and two thirds of that experience is missing from it.

### Slide 2 - demo: Same depth, different experience

**interactive demo:** `ddduration`  (caption below)

**sub:** Two strategies over the same period. Run them a few times.

**cap:** Depth is only one of three numbers. How long the worst stretch lasted, and what share of the whole period was spent below a previous high, describe the part you actually have to live through. A strategy that falls ten percent and recovers in a fortnight is a different proposition from one that falls ten percent and stays there for eight months, and the headline figure does not distinguish them.

### Slide 3 - concepts: Three numbers, not one

**items:**
  -
    **i:** trend
    **t:** Depth
    **d:** The largest fall from a previous high. The figure everyone quotes, and the least complete.
  -
    **i:** loop
    **t:** Duration
    **d:** How long the worst stretch lasted from the high to the recovery. This is what tests you.
  -
    **i:** bars
    **t:** Time under water
    **d:** The share of the whole period spent below a previous high. Usually far higher than people expect.
  -
    **i:** target
    **t:** Frequency
    **d:** How often meaningful falls occur, which decides how normal they should feel.

**body:**
  - **Depth tells you what it costs. Duration tells you whether you will still be there at the end of it.**
  - Most people abandon a strategy during a long shallow drawdown rather than a short deep one, because the shallow one offers no drama and no obvious moment of resolution. It simply goes on.
  - So when a single drawdown figure is quoted, treat it as one third of the answer and ask for the other two.

**beat4:** Because depth is easy to compute and easy to compare, and it fits in a table. Duration requires stating a period and time under water requires the whole series, so both are quietly dropped from summaries built to be scanned rather than read.

### Slide 4 - demo: The worst grows with the watching

**interactive demo:** `ddgrows`  (caption below)

**sub:** Identical strategy throughout. Change only how long you observe it.

**cap:** This is the part that surprises people. A maximum drawdown is not a fixed property of a strategy. It is the worst thing that happened during the window you looked at, so a longer window contains more opportunities for a bad run and reliably produces a larger figure. A three year record showing a small worst case is not evidence of a safer strategy. It may only be evidence of a shorter record.

### Slide 5 - concepts: How to read a quoted figure

**items:**
  -
    **i:** check
    **t:** Ask over what period
    **d:** A worst case from one year and from ten years are not comparable numbers.
  -
    **i:** eye
    **t:** Ask how it was measured
    **d:** Daily closes, monthly figures and intraday extremes produce very different answers.
  -
    **i:** shuffle
    **t:** Assume yours will be worse
    **d:** The observed worst is a sample minimum. The next one is not bounded by it.
  -
    **i:** layers
    **t:** Check against the constraint
    **d:** On a funded account a limit is fixed, so the question is not how bad it felt but whether it closed you.

**body:**
  - **The most common mistake is treating an observed worst case as a limit.** It is not a limit, it is the largest of however many draws you happened to watch.
  - That is why sizing should assume something worse than anything in the record. Not pessimism, just the recognition that the record is a sample and the sample minimum is not a floor.
  - Monthly figures deserve a specific warning. A drawdown measured on month end values misses everything that happened in between, and what happened in between is what would have closed a funded account.

**caveatLabel:** Where this needs qualifying

**caveat:**
  - **None of this makes maximum drawdown a bad measure.** It is the single most useful risk figure available and it should be the first one you look for.
  - The qualification is only that it is one number about a period, not a property of the strategy. Read it alongside the period, the measurement frequency and the duration, and it becomes genuinely informative.

### Slide 6 - check: Check yourself

**qs:**
  -
    **q:** Two strategies both report a 15 percent maximum drawdown. What do you still not know?
    **o:**
      - Nothing important
      - How long it lasted and what share of the period was spent below a previous high
      - Their annual returns
    **a:** 1
    **why:** Depth is one of three numbers. Duration and time under water describe the experience of holding it, and a single depth figure describes both strategies equally while they may feel nothing alike.
  -
    **q:** A ten year record shows a larger worst drawdown than a two year record. What does that suggest?
    **o:**
      - The ten year strategy is riskier
      - Possibly nothing, because a longer window contains more chances for a bad run
      - The two year record is fabricated
    **a:** 1
    **why:** Maximum drawdown grows with observation length even when the strategy is unchanged. Comparing worst cases across different period lengths is not a like for like comparison.
  -
    **q:** Why should sizing assume something worse than the observed worst case?
    **o:**
      - Because records are usually falsified
      - Because the observed worst is a sample minimum rather than a bound on what can happen
      - Because volatility always rises
    **a:** 1
    **why:** Nothing prevents a future drawdown exceeding every one in the record. Treating the observed maximum as a ceiling assumes the sample contained the worst case, which it has no obligation to.

### Slide 7 - takeaways: What to carry forward

**keys:**
  - Depth is one of three numbers. Duration and time under water describe what holding it feels like.
  - Most people abandon a strategy in a long shallow drawdown rather than a short deep one.
  - Maximum drawdown grows with how long you watched, on an unchanged strategy.
  - An observed worst case is a sample minimum, not a limit on what can happen next.
  - Measurement frequency matters. Month end figures hide exactly what closes funded accounts.

**unlocks:**
  - Ask for duration and time under water whenever a depth figure is quoted.
  - Compare drawdowns only across records of similar length.
  - Size against something worse than anything the record contains.

**connectsLabel:** Where this connects

**connects:**
  -
    **to:** r1/0
    **title:** The Mathematics of Drawdown
    **why:** What a drawdown costs to recover, once you know how deep it went.
  -
    **to:** r2/0
    **title:** Risk of Ruin
    **why:** Where a drawdown stops being uncomfortable and starts being terminal.

**bridge:**
  **label:** Next in this series
  **title:** Sharpe, Sortino and Related Metrics
  **text:** Return on its own means little, and risk on its own means little. So what happens when you divide one by the other, and why are there half a dozen ways to do it?

## i4 - Sharpe, Sortino and Related Metrics (8 min)

A ratio divides return by risk. Everything depends on what it counts as risk, and what it ignores.

*Not yet published on the page ("soon").*

## i5 - Monte Carlo and the Heatmap (7 min)

Two computed pictures you will meet constantly. What is each one actually doing, and what can it settle?

*Not yet published on the page ("soon").*
