# SERIES 04 - What Data Can and Cannot Tell You

A result is not evidence until it survives the ways it could have arisen by chance. This series is the set of instruments that tell the difference, starting with the machine that manufactures edges out of nothing at all.

## e1 - The Overfitting Machine (8 min)

Give a search engine a market with nothing in it. What does it come back with?

### Slide 1 - cover: The Overfitting *Machine*

**eyebrow:** Series 04

**sub:** Here is an uncomfortable experiment. Build a market with no signal in it whatsoever, search it properly, and see what comes back. How good could the best result possibly look? Predict it before you continue, because most people are badly wrong.

### Slide 2 - demo: A market containing nothing

**interactive demo:** `noisemarket`  (caption below)

**sub:** Every bar is an independent random step. Generate as many as you want.

**cap:** This is the control group. There is no trend to catch, no level that matters and no relationship to exploit, because none was put there. Anything a strategy appears to find in this data is, by construction, not real. Keep that in mind for the next slide.

### Slide 3 - demo: The search, and its champion

**interactive demo:** `gridsearch`  (caption below)

**sub:** Twenty four lookbacks by sixteen thresholds. Every cell is one backtest on the random market.

**cap:** The grid is coloured by result, green for good. Now press the button and look at the winner on its own. It has a rising equity curve and a respectable Sharpe, and it was found on data that provably contains nothing. This is not a flaw in the search. It is what searching does. Run it again and a different corner of the grid wins, just as convincingly.

### Slide 4 - concepts: What the search actually did

**items:**
  -
    **i:** shuffle
    **t:** It sorted noise
    **d:** With 384 combinations, some will align with the random wiggles by chance alone.
  -
    **i:** target
    **t:** It reported the maximum
    **d:** You are shown the best of the set, not a typical member of it, and the best is always flattering.
  -
    **i:** bars
    **t:** It hid the other 383
    **d:** The results that failed are never presented, so the sample you judge from is one.
  -
    **i:** loop
    **t:** It will do it again
    **d:** Search a new random market and a new winner appears, equally convincing and equally worthless.

**body:**
  - **The equity curve is the output of the fitting process, not evidence of anything in the market.** That distinction is the whole lesson.
  - This is why an attractive backtest, on its own, tells you almost nothing. It tells you a search was performed and a maximum was reported. It does not tell you whether anything was there to find.
  - The question to ask of any backtest is not how good it looks. It is how many were run, how many parameters were free to move, and what happened to the ones that did not make the slide.

**beat4:** Because a backtest is the most persuasive object in this field and the cheapest to produce. It has a chart, a number, and the appearance of evidence, and almost nobody asks how many attempts stand behind it. The person showing it often does not know either, because the search felt like research rather than like sorting.

**caveatLabel:** Where this needs qualifying

**caveat:**
  - **This is not an argument that backtesting is useless.** It is the only way to test a rule at all, and a well run backtest with a preregistered rule, a held out period and an honest count of attempts is real evidence.
  - The problem is the unreported search. A single test of a hypothesis stated in advance is strong. A maximum drawn from hundreds of unstated attempts is not, even though the two produce an identical looking chart.

### Slide 5 - compare: Two identical charts

**sub:** The same equity curve can mean opposite things.

**left:**
  **h:** Found by searching
  **chip:** Not evidence
  **items:**
    - Parameters chosen after seeing results
    - Number of attempts unreported
    - Rule invented to fit the data
    - No held out period
    - Best of many, presented as one

**right:**
  **h:** Tested once
  **chip:** Evidence
  **items:**
    - Rule specified before the test
    - Attempts counted and stated
    - Reason to expect it in advance
    - Held out period untouched until the end
    - Result reported whatever it was

**body:**
  - **Nothing about the chart tells you which column it came from.** That is why the process has to be reported alongside the result.
  - The practical version is a question you can ask anybody, including yourself. How many variations did you try before this one, and where are they?
  - If the answer is that nobody counted, the result is a maximum of an unknown sample, and a maximum of an unknown sample is not a measurement.

### Slide 6 - check: Check yourself

**qs:**
  -
    **q:** A strategy shows a strong equity curve on historical data. What does that establish on its own?
    **o:**
      - That the rule has predictive power
      - Very little, because a search over enough variations produces one on random data too
      - That it will work in similar conditions
    **a:** 1
    **why:** The demonstration on this slide produced exactly that chart from a market with no signal in it. The curve tells you a maximum was reported, not that anything was found.
  -
    **q:** Which single question does most to separate a real backtest from a fitted one?
    **o:**
      - What was the Sharpe ratio
      - How many variations were tried, and where are the ones that failed
      - Which platform was used
    **a:** 1
    **why:** A result is only interpretable alongside the number of attempts that produced it. Without the denominator you are looking at a maximum rather than a measurement.
  -
    **q:** Why does running the search again on new random data matter?
    **o:**
      - It confirms the strategy is robust
      - It shows a new winner appears every time, which is the point
      - It improves the parameters
    **a:** 1
    **why:** If a fresh winner emerges from every fresh set of noise, then winning the search carries no information about the market. It carries information about the search.

### Slide 7 - takeaways: What to carry forward

**keys:**
  - A search over enough variations will always produce a good looking result, even on data with nothing in it.
  - The equity curve is the output of the fitting process, not evidence about the market.
  - You are always shown the maximum, never the typical member of the set.
  - Ask how many attempts were made and where the failures went. No denominator, no measurement.
  - A rule specified in advance and tested once is worth more than the best of hundreds.

**unlocks:**
  - Read any backtest by asking about the search that produced it rather than the chart it shows.
  - Count your own attempts before drawing a conclusion from your own testing.
  - Recognise the difference between a hypothesis tested and a maximum reported.

**bridge:**
  **label:** Next in this series
  **title:** Why Searching Harder Makes It Worse
  **text:** If searching 384 combinations manufactures a winner, what happens when you search ten thousand? The answer is worse than intuition suggests, and it can be calculated exactly.

## e2 - Why Searching Harder Makes It Worse (7 min)

Search ten thousand ideas instead of four hundred. How much better does the best one look, on data with nothing in it?

*Not yet published on the page ("soon").*

## e3 - Normal Is the Exception (7 min)

You were taught to think in standard deviations. What if the thing you are measuring does not behave that way?

*Not yet published on the page ("soon").*

## e4 - Validation, in Order of Severity (8 min)

There is a ladder of tests from weak to brutal. Which rung is your result standing on?

*Not yet published on the page ("soon").*

## e5 - Volatility Drag (7 min)

Two strategies, identical average return per period. Why does one finish with less money?

*Not yet published on the page ("soon").*

## e6 - Convex and Concave (7 min)

Same expectancy, opposite tails. One looks better for years and then gives everything back.

*Not yet published on the page ("soon").*
