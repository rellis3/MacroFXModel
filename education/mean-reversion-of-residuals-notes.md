# Mean Reversion of Residuals — Worked Example Notes

> **Source:** "The Bank" (Colez Trades / C.OG micro-education site), worked example
> *Mean Reversion of Residuals*, 48 slides.
> **Purpose:** a full write-up of the lesson as a **guide to building the system** —
> the text of each slide, a description of every chart/interactive, and the
> build steps and rules pulled out so we can implement and test it later.
> **Note on charts:** every chart in the lesson is labelled *"Simulated data. Generated
> to show the relationship clearly. Not taken from any market, account or track
> record."* Numbers quoted below are from that simulated 8-instrument universe.

**Status:** slides 1–33 and 36–48 logged. **Slides 34–35 still to add.**

---

## The system in one paragraph

Take a universe of related instruments. Most of their movement is shared (common
drivers). Every day, on a rolling window, use PCA to find the shared drivers and keep
only the components that beat a pure-noise baseline (K = 2 in the example). Strip that
shared movement out of each instrument to leave its **residual**, add the residual up
over time, and measure how far it has strayed as a z-score. Lean against the stretch in
proportion to it (with a dead band near zero and a cap), size by inverse volatility,
then **project the whole book's weights so its exposure to every kept component is
exactly zero**. What is left is a bet on residuals alone: "instruments that drift away
from the group tend to come back", traded without taking a view on the group.

## The model in full (slide 31)

1. **Estimate:** on a rolling window, standardise returns and take the leading
   components as the common drivers.
2. **Isolate:** remove each instrument's factor exposure to leave the residual, then
   measure its displacement from its own average.
3. **Position:** lean against the displacement in proportion to it, capped for risk
   (not because the pull fades), sized by inverse volatility.
4. **Neutralise:** remove the book's remaining exposure to the components so the
   position is a bet on residuals alone.

## The loop, as it runs (slide 32, transcribed exactly)

```
for each day t, once 120 days of history exist:

window   = returns of all 8 instruments over the last 120 days
V, R     = decompose(window, K=2)      // components and residuals, estimated fresh
for each instrument i:
  c      = cumulative sum of R[i]      // the residual path
  z[i]   = (last(c) - mean(c)) / sd(c) // how far it has strayed, standardised
  target = -z[i]                       // lean against the displacement
  if |z| < 0.2: target = 0             // dead band, no trade near home
  if |z| > 1.5: target = +/- 1.5       // cap, bought for risk not because the pull fades
  w[i]   = target / sd(instrument i)   // size by inverse volatility
for each component k in 1..K:
  w      = w - V[k] * (V[k] . w)       // project out the factor exposure
w        = w / sum(|w|)                // gross weight of exactly one
turnover = sum(|w - w_yesterday|)
pnl      = (w . returns[t+1]) - turnover * cost   // what happened next, minus what it cost
equity   = equity * (1 + pnl)
```

**Parameters in the example:** window 120 days · K = 2 (chosen by the noise band) ·
dead band |z| < 0.2 · cap |z| = 1.5 · re-estimated every day · gross weight 1 · cost
2 bp per unit of turnover.

**Implementation notes for our version:**
- `V[k]` must be **unit-length, mutually orthogonal** component vectors for the projection
  line to zero the exposure exactly. That is true of PCA eigenvectors. If we ever use
  hand-picked factors (e.g. USD, risk-on) instead, use the general projection
  `w − B(BᵀB)⁻¹Bᵀw`.
- Signal on day t, P&L on `returns[t+1]`. There is no look-ahead as long as the window
  ends at t.
- `R` comes from the same window `V` was fitted on. That's the source of the
  "manufactured reversion" trap (slides 25–26), so validate out of sample.

## The production system around the loop (slide 37)

| # | Stage | What it does |
|---|---|---|
| 01 | **Data** | Exchange-reported returns, cleaned, sessions aligned, rolls handled, stored immutably with a hash. The loop reads from here, **never from a live feed directly**. |
| 02 | **Window** | The trailing 120 days, assembled from the store at each step. Window length is a parameter, fixed in advance and recorded. |
| 03 | **Estimate** | PCA on the window. Two components kept because two beat the noise band. Loadings re-estimated every step (this keeps the hedge current). |
| 04 | **Signal** | Residuals, their cumulative paths, each one's standardised displacement. Dead band and cap applied here. |
| 05 | **Construct** | Inverse-vol sizing → projection that removes factor exposure → normalise to unit gross. Output = a weight vector. |
| 06 | **Rebalance** | Today's weights minus yesterday's = turnover. What gets executed and what gets charged. |
| 07 | **Account** | Realised return, cost, net, equity, drawdown, attribution by instrument. Written to a log that is **never edited**. |
| 08 | **Monitor** | Live vs backtest inside a tolerance band; factor structure vs its history; **retirement conditions declared before the first trade**. |

The loop is stages 3–7. Stages 1–2 are "where most real failures begin"; stage 8 separates a
system that is running from one that is "merely still switched on". Every stage has an
input, an output and a parameter, all written down before the first run. That record is
the **manifest**, which makes a six-month-old result reproducible and a live divergence
diagnosable. The architecture is reusable: swap the Estimate and Signal stages and the same
pipeline runs trend, carry or a spread.

## Validation checklist (slides 36–44)

- [ ] **Attribution:** split P&L by instrument and by whether the residual truly reverts.
      A good total can come from all positions or from two carrying six.
- [ ] **In sample vs held out vs held out after costs**, reported separately. In the example
      the Sharpe goes 1.77 → 0.86 → 0.62: "the edge is real, and it is about half what the
      model claims."
- [ ] **Many independent runs**, with the distribution shown (12 universes in the example),
      not one curve.
- [ ] **Realistic costs on every trade.** Check that edge per unit of turnover > cost per unit
      of turnover *before* deploying.
- [ ] **Parameters fixed and written down before the held-out period is opened.** Open it
      once. Tune only with cross-validation inside the training data.
- [ ] If you can't resist looking, you needed a **third period** you didn't know about.
- [ ] Then: paper trade → small-size burn-in (years, not weeks, at this Sharpe) → scale
      (capacity limits) → monitor factor structure.

| Proves nothing (unfalsifiable) | Can be judged (checkable) |
|---|---|
| Parameters chosen after seeing results | Parameters fixed before the test |
| One period, no data held back | A held-out period, opened once |
| Positions unhedged, so the market is in the result | Exposure removed, so the bet is the idea |
| Costs applied optimistically or not at all | Costs charged on every trade at a realistic rate |
| A single run presented as the outcome | Many independent runs, distribution shown |

## The transferable part: the order

**Universe → measurement → mechanism → rule → held-out test → costs → repetition.**
"Every one of those steps existed to give the idea a chance to fail cheaply." The same
order applies to momentum, carry, seasonality, anything.

## Rules and warnings

- Shared movement is **not** the opportunity; it is what stands between you and it.
- The residual is small, hidden, and "where the entire trade lives".
- K is the **single most consequential setting**. Too few → real common movement
  leaks into the residual and looks like opportunity. Too many → you remove the thing
  you wanted to trade. Choose it against a noise band, not an elbow.
- Hedging against noise components removes signal along with it.
- Components are **directions, not causes**; **estimated, not given**; **rotate over
  time**; **unnamed**. Never build logic on what you *think* a component represents.
- A name for a component is a **hypothesis kept only so the hedge can be checked**.
- The **sign of a PC is arbitrary**. Rely on the grouping, never on "PC2 positive = X".
- A component dominated by a single instrument (like PC3 here) is noise, not structure.
- Counting positions says nothing about diversification; look at how spread out the
  exposure vectors are. Similar vectors = one position held N times.
- **Loading ≠ exposure.** Loading belongs to the instrument; exposure = Σ position ×
  loading belongs to you, and it's the only lever you control.
- **Dollar neutral ≠ beta neutral ≠ factor neutral.** Only factor neutral leaves a pure
  residual bet. Beta neutral in a 2-factor world is "a sector bet in a market-neutral
  costume".
- **A hedge is a measurement and goes stale.** Nothing alerts you; the book still reports
  itself as neutral. Re-estimate often enough to track the change, and no more often
  than that.
- **Hedge the book, not each position.** Net first, then hedge the remainder. It's cheaper
  and carries less estimation error. Judge a new position by what it does to the book's
  net exposure.
- **A short in-sample half-life is not evidence.** A de-meaned random walk always looks
  mean-reverting in a finite window, and residuals are forced towards zero by
  construction. Compare against a random-walk band and test out of sample.
- Half-life is a rough scale for holding period and cost budget, **not a parameter to
  optimise**.
- Prove the displacement predicts the next move (the bucket test, slide 28) before
  writing any rule.
- Size in proportion to displacement, not with an on/off threshold. The cap is a
  deliberate risk choice that gives up some edge.
- An **unhedged residual trade is a directional bet in a statistical costume**. You'll
  learn nothing from its P&L either way.
- Construction is not validation. Everything up to slide 31 is construction.
- **Attribute every good curve.** Positions on non-reverting residuals aren't neutral; they
  cost turnover.
- **In sample flatters.** Expect held-out Sharpe to be about half the in-sample figure, and
  less after costs.
- **Costs are certain, the edge is not.** Fast reversion means a clean signal *and* high
  turnover. Compare edge per unit of turnover with cost per unit of turnover.
- **Searching the held-out period destroys it.** Fix parameters first; tune only with
  cross-validation inside the training data.
- A good backtest is **permission to start the expensive part** (paper → burn-in → scale →
  monitor), not a green light.

---

## Slide-by-slide

### Slide 1 — Title: *Mean Reversion of Residuals* (Worked example)

**Text:** "Here is a sentence: instruments that drift away from the group tend to come
back. That is an idea, not a model. Over the slides that follow it becomes one, using
exposure vectors and principal components, and every number you see is computed by
this page as you read it. Work through it at whatever pace the material asks for, and
decide now how much of the final result you expect to survive."

**Takeaway:** the lesson turns a loose intuition into a testable model — and hints up
front that much of the final result may *not* survive honest testing. Worth writing
down an expectation before seeing the result.

### Slide 2 — In plain terms: what does it mean for two things to be *correlated*?

- **Short answer:** two instruments are correlated when they tend to move at the same
  time in the same direction. High correlation → if one rose today, the other very
  probably rose too.
- **Everyday picture:** eight boats moored in the same harbour. When the tide comes in,
  all eight rise together. Each boat also bobs on its own, but the tide is by far the
  bigger movement — watching the boats you might not realise most of what you see is
  the water.
- **Why it matters next:** the next slide shows eight instruments over three years that
  look like eight different things; the measurement says they mostly are not.
- **Definitions:**
  - **Correlation** — a number between −1 and 1. Near 1 = move together; near 0 = no
    relationship; near −1 = move opposite.
  - **Pairwise** — measured between every possible pair. Eight instruments → **28
    pairs** (8×7/2); the average across them is one number for the whole group.

*(The harbour analogy runs through the whole lesson: tide = first component, ferry wake
= second component, individual bobbing = residual.)*

### Slide 3 — Eight instruments that are mostly one instrument (interactive)

**Image:** line chart titled "Eight instruments, three years", y-axis ~57 to 116. Eight
coloured lines (A–H) start near 96, climb together to ~110, fall together to ~70–80
around the middle, then chop sideways in a band ~75–95. The lines are tangled but
clearly move as a pack. Buttons let you isolate a single instrument (All eight, A…H).

**Readout:** "Average pairwise correlation across the eight: **0.52**. They are not eight
independent things. Most of what you see on this chart is one thing happening to all of
them at once, and the part that is specific to each instrument is buried underneath it."

**Text:** they rise and fall in near unison because most of what moves any one of them is
something moving all of them. *That shared movement is not an opportunity. It is the
thing standing between you and the opportunity, and the first job of this model is to
remove it.*

**Callout:** "Every idea starts with a universe, and the first honest question is how
independent its members really are." Eight instruments with average pairwise
correlation above 0.7 are not eight bets — holding them all is close to holding one
thing eight times (the diversification illusion from Series 02). The second reading: if
most movement is shared, what is left after removing it is genuinely instrument-specific.
That leftover is small, hidden, and is where the entire trade lives.

### Slide 4 — The idea, stated properly

**Headline:** "Every instrument here is doing two things at once. *Only one of them is
worth trading.*"

1. **The group** — when the common driver moves, everything moves with it in proportion
   to its exposure. That part is enormous, swamps everything else, and you have **no
   edge** predicting it.
2. **The instrument itself** — supply, flow, a large holder rebalancing, news that hits
   one name and not the others. Small and buried.

**Quote:** "If the two parts can be separated, the second one can be traded without taking
a view on the first."

There is no secret in the idea. The difficulty is entirely in (a) the separation,
(b) measuring whether the leftover behaves in a way you can profit from, and (c) finding
out whether anything survives honest testing. "The rest of this lesson is that work, in
order, with nothing skipped."

### Slide 5 — In plain terms: what is PCA, what are principal components, why useful?

- **Short answer:** PCA takes many things that move together and finds the few underlying
  movements that explain most of what they do. Each is a **principal component**; the
  first is always the biggest.
- **Everyday picture:** record all eight boats' heights every minute; the single best
  explanation of all eight records is the tide = **PC1**. Remove the tide and ask again:
  maybe the wake of a passing ferry that rocks one side up and the other down = **PC2**.
  What's left after both = each boat bobbing on its own (the residual).
- **Definitions:**
  - **Principal component** — one underlying shared movement; first explains most,
    second the next most, and so on.
  - **Variance explained** — share of all movement one component accounts for (e.g. 76%
    = three quarters of everything you see is one thing).
  - **Decomposition** — splitting each instrument into its share of the components plus
    whatever is left over.

### Slide 6 — How much of it is one thing (interactive scree)

**Image:** bar chart "Share of all movement explained by each component", PC1–PC8, with a
dashed yellow running-total line. Values: **PC1 58%, PC2 16%, PC3 6%, PC4 6%, PC5 5%, PC6
4%, PC7 3%, PC8 2%**. Bars kept as common drivers are bright blue (PC1, PC2); bars left in
the residual are grey. Running total climbs ~58 → 74 → 80 → 86 → 91 → 95 → 98 → 100%. A
slider sets how many components to keep (shown at "Keep 1 component", range to 6).

**Readout:** PC1 alone = **58%** of everything the eight do. First 2 together = **74%**,
leaving **26%** specific to individual instruments — "the only part worth trading".

**Text:** nearly three fifths is one component; the second adds a lot more; together about
three quarters. Everything beyond is small and increasingly unstable. **The number you
choose here decides what counts as common driver vs tradeable leftover — the first
genuine modelling decision.**

**Callout:** a principal component is not a thing in the world; it is a *direction in the
data* along which instruments move together. PC1 = largest direction; PC2 = largest of
what remains, etc. Nothing in the construction knows what a market is — its strength
and its most dangerous property. Keep too few → common movement leaks into the residual
and looks like opportunity. Keep too many → you remove what you wanted to trade.

### Slide 7 — How many components are *real* (scree vs noise band)

**Image:** dot chart "Share of movement per component, against what pure noise produces".
PC1 dot at ~58% (far above everything), PC2 at ~16% — just above a dashed grey line (the
noise band, sloping gently from ~15% at PC1 to ~10% at PC8). PC3–PC8 grey dots sit
below/inside the band (~2–6%). Blue = above band (structure); grey = inside it
(indistinguishable from noise). Band = 5th to 95th percentile of what eight pure-noise
series produce.

**Readout:** "**2** components sit above what noise of the same size and length would
produce. The rest are inside the band… This is the justification for K. It is not a
preference and it is not read off an elbow that is not there. Keep what beats noise, and
treat everything else as residual."

**Callout:** "The number of components to keep is the single most consequential setting in
this method, and reading it off an elbow is a guess dressed as a measurement." The honest
test: decompose eight series of pure noise, same length, many times; see what share
PC1/PC2/PC3 claim by chance = baseline. Above it = structure. Here two clear the band and
the third doesn't, so the model keeps two — because three would mean hedging against
noise, and a hedge against noise removes signal along with it.

**Implementation note:** this is essentially a Monte-Carlo parallel-analysis test (Horn's
method): shuffle/simulate N independent series with the same T, compute eigenvalue
shares, take percentiles, and keep components whose real share exceeds the 95th
percentile.

### Slide 8 — What a component is, and what it is not

| Property | Meaning |
|---|---|
| **A direction, not a cause** | Tells you what moves together, never why — and it cannot. |
| **Estimated, not given** | Computed from a finite window, so it carries estimation error that grows as the window shrinks. |
| **Rotates over time** | Recompute on a later window and the components shift. Structure is not fixed. |
| **Unnamed** | Calling PC1 "the market" is a story you are adding; the maths doesn't support it. |

**Callout:** the most common error is **naming a component and then reasoning about the
name**. The maths gives a direction and a set of exposures; everything else is your
interpretation — and that's where overconfidence enters. A component that looks like a
sector this year may be something else next year, and a model that assumed the label
keeps trading as if nothing changed. Discipline: use components for what they
demonstrably are — a way to strip out shared movement.

**Why you were taught it this way:** PCA is usually taught as dimensionality reduction
(compression), where labels don't matter. Carried into markets, that framing encourages
treating the output as structure rather than an estimate — and it produces
confident-looking numbers from *any* data, which is what makes it easy to misuse.

### Slide 9 — In plain terms: what is a *factor*, and what is *exposure* to one?

- **Short answer:** a factor is a shared movement many instruments respond to. Exposure =
  how strongly a particular instrument responds. A **loading** is the number measuring
  that strength.
- **Everyday picture:** the tide is a factor. A boat in shallow water rises the full height
  of the tide; one resting on the bottom barely moves — high vs low exposure. Loading is
  the number: "this boat rises 1.2 m per metre of tide, that one 0.8."
- **Definitions:**
  - **Factor** — a shared driver. In this lesson = the PCA components; in other models
    chosen by hand (market, sector).
  - **Loading** — how much an instrument moves per unit of a factor; positive = with it,
    negative = against it.
  - **Exposure vector** — all of one instrument's loadings as a list, one number per
    factor. This later decides how much of each instrument must be sold to cancel a
    factor out.

### Slide 10 — The exposure vector, in full

**Headline:** "Almost everything a serious analyst does with risk is done to this list of
numbers, not to the price."

- Every instrument carries a short list of numbers saying how it responds to each shared
  driver — its **exposure vector**, the object the rest of the lesson operates on.
- One loading (on PC1) is useful but incomplete; collect one per component in fixed order.
  Here the vector is **two numbers long** (two components cleared the noise band). A real
  equity model might have 10–20 (market, size, value, sectors…). Length is a modelling
  choice; the idea doesn't change.
- **The vector is an address.** Components = directions, vector = coordinates. Where an
  instrument sits says more about how it'll behave than its name, sector or price history.
  Two instruments with nearly the same vector move nearly together however different they
  look. (Harbour: a boat's profile = rises this much with tide, rocks this much with the
  ferry wake; yacht vs trawler doesn't matter.)

**Three consequences used later:**
1. **The vector is what you hedge against.** Cancelling a factor isn't "short the market
   and hope" — you read how much of each instrument to sell off the vectors. The
   projection that removes factor exposure is arithmetic on these lists.
2. **The vector makes instruments comparable.** Prices and raw returns aren't comparable
   across instruments; exposure vectors are (same units, same components). That lets a
   **book** (all positions at once) be assessed as one object rather than a pile of bets.
3. **Similar vectors ⇒ a "diversified" book is not.** Eight positions with nearly identical
   vectors = one position held eight times; it loses eight times at once when that
   component turns. Look at how spread out the vectors are, not the count.

**Caution:** the vector is estimated from a finite window, carries error and drifts as the
market changes — which is why the model **re-estimates rather than fitting once**. "A
vector is the best current description of an instrument, not a fact about it."

### Slide 11 — The exposure vector (interactive, three views)

A bar chart of each instrument's loading on one component at a time, with buttons for
Component 1 / 2 / 3. Green bars = positive loading, red = negative. (Values below are
read off the bars, so they're approximate.)

| Instrument | PC1 | PC2 | PC3 |
|---|---|---|---|
| A | ~0.33 | ~−0.33 | ~−0.13 |
| B | ~0.31 | ~−0.39 | ~−0.20 |
| C | ~0.34 | ~+0.26 | ~0.02 |
| D | ~0.29 | ~+0.41 | ~−0.16 |
| E | ~0.41 | ~−0.20 | ~−0.01 |
| F | ~0.38 | ~+0.26 | ~0.02 |
| G | ~0.35 | ~−0.17 | **~+0.83** |
| H | ~0.41 | ~+0.15 | ~0.01 |

- **Component 1 view** (axis ±0.51): all eight bars positive and similar in size. "That is
  what a broad common driver looks like: when it moves, all eight move together, and no
  amount of holding several of them protects you from it."
- **Component 2 view** (axis ±0.64): the signs split. A, B, E and G load negative; C, D, F
  and H load positive. The component separates the universe into **two groups that move
  against each other. That is a spread, and it is tradeable in a way the first component
  is not.**
- **Component 3 view** (axis ±1.02): one big bar (G ≈ +0.83), the rest small or near zero,
  no clear pattern. "By the third component the exposures are small and unstable. This is
  where structure ends and estimation noise begins, which is why keeping too many
  components does more harm than good." A component that is mostly one instrument is
  really that instrument's own noise being mistaken for a shared driver.

**Callout:** "An exposure vector is the bridge between a statistical direction and a
position you can actually hold." It tells you, for each instrument, how much common
movement to expect and so how much to remove. It is what makes hedging possible: if an
instrument's loading on a driver is 0.35, you know how much of a position in that driver
to hold against it to be left with only the part you care about. By the third component
the pattern is hard to read. That is the boundary between structure and noise, and it's
why choosing K is not cosmetic.

### Slide 12 — What the components *actually* are (interactive)

**Image:** three stacked rows of bars, one per component, across instruments A–H:
- **PC1 59% — "The market", all eight, one way:** eight tall blue bars, all the same sign.
- **PC2 16% — "A split", two camps:** A, B, E and G are blue (positive); C, D, F and H are
  red (negative).
- **PC3 6% — "Noise", no shape:** short grey bars, drawn small on purpose because its share
  is small. Largest bar is G.

A toggle switches between **Estimated** and **Overlay the true loadings**. With the overlay
on, a yellow tick marks the loading the simulated universe was *built with*. The estimated
bars land close to the ticks for PC1 and PC2, off by a small amount on each instrument
(e.g. F and H come out slightly higher than their true PC1 loading). That gap is the
estimation error from slide 8, made visible.

**Note:** the PC2 signs here are the reverse of slide 11 (there A, B, E, G were negative).
It is the same split. **The sign of a principal component is arbitrary**, so any code must
not rely on PC2 being "positive = group X". Only the grouping and the relative signs matter.

**Readout:** "Read the shape of each row before any number." The first row points one way
across all eight and accounts for **59%**. The second splits the eight into two camps. The
third has no shape. Those shapes let you say what a component is, **provisionally**.

**Text:** the warning against naming still stands. What the loadings give you is a
*shape*. A shape is not a name, but it is enough to form a hypothesis, and there's a
practical reason to form one: **"a hedge against something you cannot describe is a hedge
you cannot check."**

**Callout:** "The name is a hypothesis, not a finding, and it is held for one reason: so
that the hedge built against it can be tested."
- If PC1 behaves as the market, a position neutral to it should show a **market beta near
  zero** against a market proxy.
- If PC2 behaves as a sector, the hedge against it should look like a **sector spread**.
- Those are checks. A component with no working name can't be checked, only trusted.
- When a check fails, the name was wrong, and the decomposition is telling you something
  about the data rather than the model. This is how slide 8's discipline is practised
  rather than abandoned.

### Slide 13 — In plain terms: what is a *residual*?

- **Short answer:** what is left of an instrument's movement after the shared factors have
  been taken out. The part that belongs to that instrument alone.
- **Everyday picture:** subtract the tide from a boat's recorded height, then subtract the
  ferry wake. What remains is the boat's own bobbing: someone stepping aboard, a gust on the
  hull, a line going taut. Smaller than the tide, and the only part of the record that is
  specifically about that boat.
- **Why it matters:** the entire trade in this lesson is a bet on the residual, and it
  can't be seen until the factors are removed.
- **Definitions:**
  - **Fitted part:** the portion of movement the factors account for (the *systematic* part).
  - **Residual:** the remainder (the *idiosyncratic* part, meaning specific to this one
    instrument).
  - **Cumulative residual:** the residuals added up over time, so you can see whether they
    drift away from zero and come back. **This cumulative series is what gets traded.**

### Slide 14 — Splitting one instrument in two (interactive)

**Image:** "Instrument A, split into its two parts". Three stacked line charts over the
same period:
1. **Grey, "What it actually did" (the whole movement):** a noisy line that drifts down
   in the middle and recovers.
2. **Blue, "The shared part" (what the factors explain):** almost the same shape as the grey
   line. Most of A's movement is the common drivers.
3. **Amber, "The residual" (what is left, and all this model trades):** a flatter, choppier
   line that oscillates around a dashed zero line. It swings away and comes back, with
   larger swings near the end.

Buttons A–H select other instruments.

**Readout:** the blue line is the part that is just the common drivers moving,
**reconstructed from its exposure vector** (loadings × factor returns, using the 2 common
drivers). Grey minus blue = amber. The amber line is the only part about *this instrument*.
**It wanders away from zero and comes back, with a half-life of about 15 days.**

**Callout:** "This is the moment the idea becomes measurable." Before this slide the
tradeable part was a hypothesis; now it is a series you can look at, count and test. Every
instrument produces a residual line like this, and they don't all behave the same way:
some return to zero quickly, some slowly, and some wander off with little tendency to come
back. **That variation is the first thing worth measuring, because a residual that does not
revert is not a trade regardless of how far it has strayed.**

**Implementation note:** half-life is usually estimated by fitting an AR(1) /
Ornstein–Uhlenbeck model to the cumulative residual. Regress Δx on x₋₁ to get slope b, then
half-life = −ln(2) / ln(1 + b). Filter out instruments whose half-life is too long (or whose
b isn't significantly negative) before trading them.

### Slide 15 — In plain terms: what does it mean to *hedge*?

- **Short answer:** hold a second position whose purpose is to cancel a risk in the first.
  Keep the part of the first position you want, and use the second to remove the part you
  don't.
- **Everyday picture:** you bet one boat is sitting unusually low and will float back up.
  If the tide goes out while you wait, every boat drops, yours included, and you lose for a
  reason unrelated to your idea. So you make a second bet that pays off if the tide falls.
  The tide cancels out, and what remains is purely whether your boat rises *relative to the
  others*.
- **Why it matters:** the next slides build that second position precisely from the
  loadings. It is not a simple bet against the tide. **It is a specific basket of the other
  instruments, weighted so that every factor cancels.**
- **Definitions:**
  - **Hedge:** the offsetting position.
  - **Neutral:** no net exposure to something. Market neutral = the market can rise or fall
    and your position is unaffected by that alone.
  - **Basket:** a set of positions in several instruments held together as one unit.

### Slide 16 — What an exposure *actually* is (interactive)

"Three separate things that get called the same word, and the one that costs you money."

**Image:** four rows of bars across A–H, with the "Equal weight long" preset and the factor
moved +1.00 sd:

| Row | A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|---|
| **Loading** (the instrument moves this) | 1.31 | 1.08 | 1.26 | 1.09 | 1.29 | 0.94 | 1.19 | 1.01 |
| **Position** (you choose this) | 0.13 | 0.13 | 0.13 | 0.13 | 0.13 | 0.13 | 0.13 | 0.13 |
| **Exposure** (position × loading) | 0.16 | 0.13 | 0.16 | 0.14 | 0.16 | 0.12 | 0.15 | 0.13 |
| **Money today** (exposure × the move) | 0.16 | 0.13 | 0.16 | 0.14 | 0.16 | 0.12 | 0.15 | 0.13 |

(Positions are 1/8 = 0.125 each, shown rounded. These loadings are on a different scale
from slide 11. Here they're "% move per 1 sd of the factor", not the unit-length PCA
vector.)

Legend: blue = loading and position, yellow = exposure, green = money made, red = money
lost. A slider moves the factor. Preset buttons: **Equal weight long**, **All in one**,
**Long high, short low**, **Factor neutral**.

**Readout:** the factor moved 1.00 of a typical day. Row one never changes, because a
loading is a property of the instrument. Row two is the only row you choose. **Total
exposure to this factor = 1.145% per 1 sd.** That single number is your whole relationship
with the factor: whatever it does, you get 1.145% of it. Today that came to +1.145%. Moving
the factor only changes the last row, because the first three were fixed before the day
began.

**Callout:** "A loading is not an exposure, and the difference is the whole of risk
management." A loading says how far an instrument moves when a factor moves. An exposure
says how much money *you* make when it does. The loading belongs to the market; the
exposure belongs to you.

The arithmetic, in three lines:
1. The factor moves by some amount *f*.
2. Each instrument moves by its loading × *f*.
3. You earn Σ (position × loading) × *f*. The sum Σ wᵢβᵢ is **your exposure**, expressed as
   money per unit of factor.

Two things follow:
- **Exposure adds up.** A book of eight positions has *one* exposure number per factor, not
  eight, and positions can cancel each other before you hedge anything.
- **Exposure is the only part of the chain you control.** You can't change an instrument's
  loading, only how much of it you hold.

Presets:
- **Equal weight long:** carries the full factor.
- **All in one:** slightly more or less, depending on that instrument's loading.
- **Long high, short low** (long the high loadings, short the low ones): carries very little.
  This is beta neutrality arrived at by hand.
- **Factor neutral:** carries essentially zero, and it is the only one that gets there
  *deliberately rather than by luck*.

### Slide 17 — Factors are exposures you hold *whether or not you chose them*

**Headline:** "Every position is a bundle. The part you meant to buy is inside it, and so is
everything that moves with it."

- Buy one instrument because its residual is stretched, and you have *also* bought its
  loading on the market, on the sector, and on whatever the third component turns out to
  be. None of those were the idea, but they'll decide the result on most days, because
  shared movement is larger than specific movement (the scree plot already showed this).
- **Retail version:** buy the stretched instrument and wait.
- **Professional version:** buy the stretched instrument *and at the same time sell a basket
  that cancels each unwanted loading*, so what remains is a position in the residual and
  nothing else.
- The next four slides build that basket, show what it is not, watch it drift, and then
  apply it to a whole book rather than one position.
- "Nothing in this act is specific to mean reversion. It is how any position in a correlated
  universe is turned into a position in one thing."

### Slide 18 — The factor neutral *position* (interactive)

"One instrument held, the basket that neutralises it, and how many components to remove."

**Image, left: "Exposure to each component"**, PC1–PC4, red bar = before hedging, green =
after (a flat marker on the line means exactly zero). Before: PC1 ≈ +0.4, PC2 ≈ −0.5,
PC3 ≈ +0.25, PC4 ≈ +0.33. After neutralising 2: PC1 and PC2 are **0**, PC3 and PC4 are
unchanged.

**Image, right: "The position after neutralising 2 components":** A is a tall blue bar
(the unit long, ≈ +1). The hedge basket is spread across the other seven: B ≈ −0.45,
D ≈ +0.15, E ≈ −0.33, G ≈ −0.28, H ≈ −0.07, with C and F ≈ 0. Buttons pick which
instrument is held (A–H), and a slider sets how many components are neutralised (at 2).

**Readout:** a unit position in A carries exposure to every component. Removing the first
2 leaves exposure of **−0.00, 0.00** on them (exactly zero) and the rest untouched. The
hedge spans the other seven instruments, though **only 5 carry a weight large enough to
matter**. It is *not* a short of the market. It is a specific basket, computed from the
loadings, that cancels each factor in turn. **Realised volatility falls from 1.00 to 0.51**
(standardised), "because most of the volatility was never the residual".

**Callout:** "The hedge is a projection. The position is a vector, each component is a
direction, and the hedged position is what is left after removing its shadow along each
unwanted direction." So each instrument's hedge weight is set by how much it loads on the
components being removed. Heavy market-loaders get shorted heavily; barely-loading ones
are barely touched.

Moving the slider:
- **Remove 1:** cancels the market and leaves the sector bet in.
- **Remove 2:** cancels both.
- **Remove 3:** starts to eat into the residual itself, because PC3 is mostly noise and
  neutralising noise means neutralising some of your signal.

The scree plot is the justification for how many.

**Maths:** hedged w = w − Σₖ Vₖ (Vₖ · w). This is line 11 of the loop.

### Slide 19 — In plain terms: what is *beta*; dollar neutral vs beta neutral?

- **Short answer:** beta = how much an instrument moves per unit the market moves (beta
  1.2 means it moves 20% more than the market). **Dollar neutral** = sold as much money
  as bought. **Beta neutral** = the betas cancel, so the market itself can't move your
  position.
- **Everyday picture:** boat 1 rises 1.2 m per metre of tide, boat 2 rises 0.8 m. Long one
  and short the other in equal money is dollar neutral, but the tide still moves you
  (1.2 − 0.8 ≠ 0). To be beta neutral, short **1.5** of boat 2 for every 1 of boat 1
  (1.5 × 0.8 = 1.2), so the tide effect cancels.
- **Why it matters:** the next slide hedges the same position three ways. All are
  "hedged", and they leave very different risks behind.
- **Definitions:**
  - **Beta:** sensitivity to the market, or to any single named factor.
  - **Dollar neutral:** equal money long and short. Says nothing about risk.
  - **Beta neutral:** market sensitivity cancels. Says nothing about any second factor.
  - **Factor neutral:** every measured factor cancels. What remains is residual.

### Slide 20 — Three hedges, three *different bets* (interactive)

**Image:** three panels for a long position in **E**. Each has bars for the beta left on
F1 and F2 (as a share of the unhedged position's own beta) plus a tall column showing
what share of the position's variance is still explained by factors.

| Hedge | F1 beta left | F2 beta left | Variance still factor |
|---|---|---|---|
| **Dollar neutral** (short equal value of the others) | **13%** | **−101%** | **28%** |
| **Beta neutral** (short the market by the position's beta) | 0% | **−87%** | **23%** |
| **Factor neutral** (remove each estimated component) | 0% | 0% | **0%**, nothing left |

**Readout:** dollar neutral still leaves 13% of the original market beta, "because equal
value is not equal exposure". Beta neutral removes the market but leaves the second
factor at 87% of its size, so 23% of the variance is still factor. Only factor neutral
leaves 0%. "All three are called hedged. They are three different bets, and only one of
them is a bet on the residual."

**Callout:**
- **Equal value is not equal exposure.** A high-beta instrument hedged with equal value of
  low-beta ones is still long the market. Dollar neutrality is a statement about capital,
  not risk.
- **Beta neutrality fixes the first factor and stops.** If PC2 is a sector or a rate, the
  beta-neutral position is "a sector bet in a market neutral costume".
- **Factor neutral** is the only one whose remaining variance is residual. It is also the
  only one whose construction depends on the decomposition being right, which is why the
  scree and loading slides are not preamble.

**FX relevance:** a "dollar neutral" FX basket (e.g. long AUD, short equal notional of
other USD pairs) still carries risk-on and commodity factors. The same trap applies.

### Slide 21 — A hedge goes wrong *on its own* (interactive)

"Pick how often it is re-sized, and watch what the book carries in between."

**Image, top strip: "The cause"**, a yellow S-curve of the loading the market actually has
for this instrument: **0.96 at the start, 1.57 by the end**. Flat, then a smooth rise
mid-sample, then flat again.

**Image, lower panel: "The consequence"**, the exposure the hedge no longer covers (zero =
fully hedged) over the same three and a half years. The red line (the chosen policy,
**Never**) follows the S-curve up to ~0.59 and stays there. Grey lines (the other four
policies) show a **sawtooth**: exposure builds, re-sizing snaps it back, and it builds
again, mostly staying under ~0.2.

Buttons: **Never · Yearly · Quarterly · Monthly · Daily.**

**Readout (Never, sized once at the start):** at its worst the book carried **0.59** of
market exposure it never chose. The single worst day cost **−1.71%** from that alone, and
it added **7.5% annual volatility** to a book that was supposed to have none. Re-sized
**daily** it stays near **0.20**. That floor isn't slack in the schedule; it is the error
in the estimate itself, which no amount of re-estimating removes. **Monthly and daily are
almost the same.**

**Callout:**
- "A hedge is not a thing you own. It is a measurement, and measurements go stale."
  Business mix, index membership, rate regimes change, and quietly it stops being true.
- **"The danger is that nothing tells you."** The book still reports itself as factor
  neutral, because the report uses the same stale number. There's no alert, error or bad
  fill, just a bet growing in the background until the day the market moves a long way.
- That is the whole argument for **re-estimating on a rolling basis**: "the hedge is only
  as current as its last measurement".
- How often is a real decision. Never → yearly helps enormously; yearly → quarterly helps
  a lot; monthly → daily barely helps, because what's left is measurement error, not
  staleness. **"Re-estimate often enough to track the change, and no more often than
  that."**
- The lesson re-estimates daily because it's cheap on 8 instruments. On a large book it's
  a genuine trade-off, and the sawtooth is how you'd decide.

### Slide 22 — In plain terms: what is a *book*?

- **Short answer:** all the positions you hold at once, treated as a single thing. Its
  risk is *not* the sum of each position's risk, because positions can offset each other.
- **Everyday picture:** long one boat that rises with the tide and short another that also
  rises with it, and you're already partly hedged without doing anything. Together the
  tide barely matters; look at either alone and it is your biggest risk.
- **Definitions:**
  - **Book:** the whole portfolio, considered together.
  - **Net exposure:** the book's total sensitivity to a factor after longs and shorts
    have offset.
  - **Gross:** the total size of all positions ignoring sign. What you pay costs on.

### Slide 23 — Hedging the book, *not the position* (interactive)

**Image, left: "Legs added up, against the net"**, for PC1 and PC2. Grey = the sum of each
leg's exposure ignoring sign; red = the book's actual net exposure. PC1: grey ≈ 1.31, red
≈ 0.71. PC2: grey ≈ 1.7, red ≈ 1.1.

**Image, right: "The one basket that neutralises the book":** green bars per instrument.
Large negatives on A, B, E and G; a positive on D; small on C, F and H.

Toggle buttons choose positions. Shown selected: **A long, B long, D short, F long**
(C, E, H long and G short available).

**Readout:** 4 positions held. Added up as if each stood alone they carry **1.31** of
first-component exposure. Netted, the book carries **0.71**, because longs and shorts
partly cancel. That's **46% of the exposure hedged for free**, before any basket is
bought. The basket neutralises what's left, with **gross weight 3.06**. Toggle a position
out and both sides move: some legs are hedging others, so removing one can *raise* the
book's exposure.

**Callout:** "The hedge is a property of the book, not of each position in it." Two
residual bets that load the same way on the market are, together, a market bet; two that
load opposite ways are a smaller one.
- A **collection** hedges each trade. A **portfolio** nets first and hedges the remainder,
  which is cheaper *and* more accurate, "because every unit of hedge is a unit of cost and
  a unit of estimation error".
- Before asking whether a candidate residual is attractive, ask what it does to the book's
  net exposure. A mediocre residual may be worth holding because it hedges the rest for
  free; an excellent one may not, because it doubles an exposure the book already has.

### Slide 24 — In plain terms: *mean reversion* and *half life*

- **Short answer:** something mean-reverts if, when it strays from its usual level, it
  tends to come back. **Half life** = how long it takes to come halfway back. Short = snaps
  back quickly; very long = barely reverts.
- **Everyday picture:** push a boat from its mooring and let go. The line pulls it back,
  fast at first then slower. Half the distance in 10 seconds means a half life of 10 s. A
  boat with no line never comes back: half life is effectively infinite.
- **Why it matters:** the next slides estimate each residual's half life, but there's a
  trap, "the most important one in the lesson": **the way residuals are constructed makes
  them look as if they revert even when they do not.**
- **Definitions:**
  - **Mean reversion:** tendency to return toward an average after moving away.
  - **Half life:** time for a displacement to decay by half. *Estimated from the data, not
    assumed.*
  - **Random walk:** no tendency to return anywhere. Each step is as likely up as down,
    and it has no home.

### Slide 25 — Half life, and the trap underneath it

| | |
|---|---|
| **Half life** | How long a displacement takes to decay by half. |
| **Measured, not assumed** | Estimated from the residual itself, **by regressing each change on the level that preceded it**. |
| **It sets the holding period** | A half life of 15 days implies a trade measured in weeks, not minutes, and costs follow from that. |
| **It can be manufactured** | A residual is orthogonal to the factors by construction, which makes it look more mean-reverting than it is. |

**Callout:** "The fourth item is the one that catches people, and **it caught the first
version of this model**." When you remove factor exposure using components estimated from
the *same window*, the leftover is forced to be uncorrelated with those factors over that
window. That constraint alone pushes the residual back toward zero, whether or not
anything real is happening. **So a short half life is not by itself evidence.** It counts
only when the residual keeps reverting on data *not used to estimate the factors*, which is
what the later validation tests.

**Where this needs qualifying:** half life assumes a simple decaying process (AR(1)/OU),
and real residuals often aren't. Reversion speed changes with volatility and market
conditions, so a single number is an average across states. It's still useful as an order
of magnitude for holding period and cost budget. **Treat it as a rough scale, not a
parameter to optimise.**

### Slide 26 — Reversion that was *manufactured* (interactive)

"Every residual reverts in the window it was fitted on. Only some revert after it."

**Image:** dot chart of the estimated half life of each residual, in sample (the fitting
window), log scale from 5 to 200+ days. A shaded red band across the top (from roughly 40
days upward, dashed line near ~80 days) = **what a random walk reports**, the 10th–90th
percentile on this window length.

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| 17d | 10d | 21d | 15d | 24d | 26d | 16d | **57d** (grey, inside the band) |

Blue dots = below the band (reverts faster than noise would); grey = inside it (not
evidence of anything).

Buttons: **In the fitting window** · **Out of sample, loadings fixed** · **Reveal which were
built to revert**.

**Readout:** in the fitting window *every one* of the eight reports a finite half life,
most well inside what a random walk would show. This is the manufactured reversion. Hold
the loadings fixed and step forward (out of sample) and the picture changes. A random walk
always reports *something*; only residuals that beat the band are evidence.

**Callout:** "**A random walk, de-meaned over a finite window, will always look as if it
mean reverts. It is the most reliable false positive in the whole discipline.**" So the
half life alone is never the test. The test is the half life *against what noise reports
under the identical procedure on the identical window length*. That's the same comparison
used to choose K: "One principle, applied twice." The reveal button shows which residuals
were built to revert and which were random walks. The band separates them without being
told, and it's the only thing on the page that does.

**Implementation note:** simulate many random walks of the same length, run the *exact*
same pipeline (de-mean, AR(1) regression, half-life), and take the 10th–90th percentile.
Also run the half-life estimate **out of sample with loadings frozen** from the fitting
window.

### Slide 27 — In plain terms: *z-score* and why standardise?

- **Short answer:** a z-score is how far something is from its usual level, in units of
  how much it normally varies. z = 2 is two typical swings above average; −1.5 is one and
  a half below. It lets you compare things on completely different scales.
- **Everyday picture:** one boat normally bobs 10 cm, another 1 m. Both are 30 cm above
  their usual line. For the first that is 3× its normal swing; for the second it's
  nothing. Standardising asks the same question of both: how unusual is this, *for this
  boat*?
- **Definitions:**
  - **Standardise:** subtract the average and divide by the typical swing, so every
    series is centred on zero and in the same unit.
  - **Displacement:** how far from the average, in those units (used interchangeably with
    z-score in the lesson).
  - **Threshold:** a z level at which the model acts, e.g. "entry at 1.5" means the trade
    opens when the residual is 1.5 swings from home. (The final model uses a *proportional*
    lean with a 0.2 dead band and 1.5 cap instead of an on/off entry; see slide 29.)

### Slide 28 — Does the displacement predict anything (interactive)

"Every instrument, every day, grouped by how far the residual had strayed."

**Image:** bar chart of **what the residual did the next day** (average move, in standard
deviations of that residual), grouped by the z-score the day before:

| Displacement bucket (z) | Days | Next-day move |
|---|---|---|
| below −1.5 | 217 | **+0.08** |
| −1.5 to −0.5 | 1,314 | **+0.04** |
| −0.5 to +0.5 | 1,970 | −0.01 |
| +0.5 to +1.5 | 1,281 | **−0.04** |
| above +1.5 | 250 | **−0.04** |

Green = moved up the next day; red = moved down.

**Readout:** read left to right. Residuals well **below** average moved **up** next; those
**above** moved **down**. The middle group did almost nothing. "That is the relationship
the whole trade rests on, and it is **measured here rather than assumed**." It does not
fade at the edges: the outermost groups pull hardest. The rule still caps how far it
leans, "which therefore costs edge and is bought on purpose".

**Text:** "This is the test that decides whether there is a trade here at all, and it is
the one most people skip."

**Callout:**
- **Notice the shape rather than the size.** Bars stepping down from left to right is what
  a real reversion relationship looks like.
- It doesn't fade at the edges. That's what you'd hope for, and not always what you find.
  In many signals the relationship weakens or reverses out there, and this measurement
  shows it *before a single position is taken*.
- This one measurement decides whether the rule is worth writing, and it prices one of its
  choices. Since the pull is strongest at the extremes, the cap gives up edge. It's bought
  on purpose: "a rule without one takes its largest position in the most extreme situation
  it has ever seen, which is exactly where a model is most likely to be wrong about its own
  assumptions."

**Implementation note:** this is a simple bucketed conditional-mean test (like a
decile/quantile analysis). Build it as the first diagnostic for any residual signal
before a backtest. Remember that it pools all instruments, and a proper version should be
done out of sample.

### Slide 29 — From a relationship to a position

**Headline:** "A relationship in the data is not a rule. *A rule has to say what you hold,
and how much.*"

- The measurement gave a shape: the further the residual has strayed, the more it tends
  to come back, and on this universe the pull is strongest at the extremes.
- **A threshold rule throws most of that away.** It ignores everything inside the threshold
  and takes a full position outside it, treating a residual at 1.6 the same as one at 4.0,
  and 1.4 as nothing at all.
- **Quote:** "So the position is proportional to the displacement, and capped for risk
  rather than because the relationship stops."
- Two more decisions, both following from earlier slides rather than preference:
  - **Size by inverse volatility**, so a quiet instrument and a violent one contribute
    comparable risk.
  - **Neutralise the whole book** against the components, so what remains is a bet on
    residuals, not the universe.
- "That last decision is not a refinement. The next slide shows what happens without it."

### Slide 30 — Why the position has to be hedged (interactive)

"The same signal, run twice. One version carries a bet nobody placed."

**Image:** "Exposure to the first component, every day of the fitting window." The green
line is flat on 0.00 every day (exposure removed). The red line (exposure left in) is noisy
around zero, mostly within ±0.08, with a spike to ~+0.2 early on and dips to around −0.1.

**Readout:** "The green line is not nearly zero. **It is zero, on every day, by
construction.**" The projection removes the exposure rather than reducing it, so the first
component can move as it likes and this book doesn't notice. The red line is the same
signal with the hedge left off. Its exposure isn't chosen by anyone; it's whatever falls
out of which residuals happened to be stretched that day. It drifts as far as **0.23** and
sits beyond **0.11 on one day in twenty**. "That is a directional bet nobody placed and
nobody sized." It's small most days, which is exactly why it survives unnoticed until the
factor moves a long way and a "market neutral" book loses money in a straight line.

**Callout:** "**This is the most commonly skipped step in retail attempts at this
technique, and it is the one that makes the results meaningless.**"
- An unhedged residual trade is "a directional position wearing a statistical costume".
  When it works you credit the signal; when it fails you blame bad luck. Both attributions
  are wrong, and you learn nothing.
- **Be careful what the figure claims:** it does *not* say the unhedged version performs
  worse. Across many universes the two often finish in much the same place, because an
  accidental bet is as likely to help as hurt. It says the unhedged version carries a risk
  that was never chosen, sized or reported, "and a risk like that is not a problem until
  the day it is a very large one".
- "The hedge is what makes the result interpretable. It is the difference between testing
  your idea and testing the market."

### Slide 31 — The model, stated in full

(The four steps are at the top of this file: **Estimate → Isolate → Position →
Neutralise**.)

**Callout:** "Four steps, each traceable to a measurement made earlier in this lesson
rather than to a preference. That traceability is what separates a model from a set of
settings." It also makes the model criticisable: anyone can ask "why two components and
not three?" and the honest answer is a chart, not an opinion. "**Everything up to here is
construction. Nothing so far tells you whether it works, and construction is the part most
people mistake for the finished job.**"

### Slide 32 — The loop, *as it runs*

"Every line here is executed by this page. This is the model, not a description of it."
(The code is transcribed at the top of this file.)

**Callout:** "Sixteen lines, and everything the previous thirty slides established is in
them."

| Concept | Line(s) |
|---|---|
| Decomposition | 3 (`V, R = decompose(window, K=2)`) |
| Residual path | 5 (`c = cumulative sum of R[i]`) |
| Displacement | 6 (`z[i]`) |
| Lean, dead band, cap | 7–9 |
| Sizing | 10 (inverse vol) |
| Hedge | 11–12 (projection, then gross = 1) |
| Costs | 15 (`pnl … − turnover * cost`) |

Nothing is hidden or left to a framework. If you disagree with a choice, the line it lives
on is right there. "This is what an executable system looks like at its smallest: a loop
with every decision visible." Production adds data plumbing, monitoring and a manifest
around it (a later slide), "**it does not add a different loop**".

### Slide 33 — One day, *step by step* (interactive)

"Pick any day and watch the loop run on it, one row per line."

**Image:** six rows of bars across A–H, one per stage of the loop, for **day 328**:
1. **Displacement (z):** B and H are gold (beyond the cap; B positive, H negative). D is
   positive blue. A and C are slightly negative. E, F and G are grey (inside the dead band).
2. **Target (lean, dead band, cap):** the opposite sign to the displacement. A long, B short,
   C small long, D short, H long. E, F and G zero.
3. **Sized (inverse vol):** similar shape, rescaled per instrument.
4. **Neutralised (factors removed):** E, F and G now pick up small short weights. They
   are the hedge, even though they have no signal.
5. **Final weights (gross of one):** same shape, scaled to gross = 1.
6. **Next-day P&L (weight × next return):** B and D green (gains), A and H red (losses),
   small gains elsewhere.

Legend: gold = beyond the entry threshold; grey = inside the dead band, no position;
blue = long; red = short or a loss. A slider scrubs through the days.

**Readout, day 328:** 2 residuals beyond the threshold, 3 inside the dead band. Before
neutralising, the book had exposure of **25.3 and 27.6** to the two components; after,
**0.00 and −0.00**. The eight P&L contributions add to a gross return of **+0.317%**.
Turnover was **0.18** of the book, costing **0.0035%** at **2 basis points**, so the day
booked **+0.314%** and equity moved to **1.1678**.

**Callout:** "This is where a rule becomes a position, and a position becomes a number in
the account." Most people never see the middle of that chain because their tools hide it,
"and a hidden chain is one you cannot audit".
- Exposure to the components is large on row 3 and **exactly zero on row 4, every day**.
  That's the hedge doing its job.
- The sign of a P&L bar is not the sign of the position. A long earns a loss when the
  instrument falls; that's where the day's return comes from.
- Dead band and cap are visible as grey and gold on the top row. Grey residuals are near
  home and carry no position. Gold ones are beyond the cap, where the lean stops increasing
  "by choice rather than because the pull has faded".

**Implementation note:** log these six stages per day in our backtest (z, target, sized,
neutralised, final, P&L contribution) so every day can be audited like this.

### Slides 34–35 — *not yet received*

(Slide 36 refers to "the curve on the previous slide", so slide 35 is probably the
backtest equity curve, at +26.1% cumulative. To be added when the screenshots arrive.)

### Slide 36 — Where the P&L *came from* (interactive)

"The curve, decomposed by instrument and by whether the residual genuinely reverts."

**Image:** "What each instrument contributed". Eight cumulative-return lines across the
fitting window, break-even at the horizontal line, y-axis −6.6% to +13.4%. The lines start
tangled at zero and fan out. C (orange) climbs steadily to the top, B (green) is second,
and E, F and H drift below zero by the end.

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| +2.1% | +8.0% | **+11.0%** | +4.3% | −0.9% | −0.8% | +4.9% | −2.4% |

Toggle: **By what the residual is** / **By instrument** (shown).

**Readout:** one line per instrument, each showing what it added to the book. **5 made money
and 3 lost it**, and the eight together sum to **+26.1% cumulative** (the curve on the
previous slide). "A curve is a sum, and a sum hides its parts." A good total can come from
every position pulling its weight, or from two carrying six. Those are different systems
with different futures, and only the split tells you which you have.

**Text:** the book traded all eight with the same rule. **Four were built to revert and four
were built as random walks, and the model was never told which.** Split by that fact and the
answer is stark: the genuine reverters carried the result, and the random walks earned
"what trading noise with a reversion rule always earns, which is nothing minus costs".

**Callout:** "Attribution is the question of where the money came from, and it is the first
thing to ask of any curve that looks good."
- Here it's clean because the answer was built in. In a real market nobody hands you the
  list, which is why slide 26 compared every half life to what noise would produce. That's
  the closest a practitioner gets to this split.
- The four random walks **were not neutral. They cost money** through turnover on positions
  that had no reason to exist. A system that could exclude them would keep all of the
  reverters' contribution, and the noise band is how it would try.

**Implementation idea:** use the random-walk band from slide 26 (out of sample) as a
per-instrument filter, i.e. only trade residuals whose half life beats noise.

### Slide 37 — The system, *as it would run*

"The loop is the centre. Production is everything around it." (The eight-stage table is at
the top of this file.)

**Callout:** "Eight stages, and the loop from four slides ago is stages three to seven." The
two before it are where most real failures begin; the one after separates a running system
from one "merely still switched on". Every parameter is written down before the first run
(the **manifest**). Nothing is specific to residual mean reversion: "The architecture is the
reusable part; the loop is the part that changes."

### Slide 38 — In plain terms: *Sharpe ratio*, in sample and out of sample

- **Short answer:** Sharpe = return ÷ the bumpiness of that return. High = steady gains; low
  = the gains were there but the ride was rough, or mostly luck. **In sample** = the data
  used to build the model. **Out of sample** = data the model never saw.
- **Everyday picture:** two harbour routes take the same average time. One is smooth, the
  other lurches between very fast and nearly stopped: same average, very different Sharpe.
  And a route planned on last week's currents looks excellent on last week's currents; the
  only test is next week's.
- **Definitions:**
  - **Sharpe ratio:** average return ÷ standard deviation of return. **Above 1 is usually
    considered good after costs; above 2 is rare and deserves suspicion.**
  - **In sample:** the fitting data. Results are always flattering because the model was
    chosen to fit them.
  - **Out of sample:** unseen data. "The only place a result can count as evidence."

### Slide 39 — What the number becomes (interactive)

"Twelve independent universes, each built and tested from scratch. Charge what you like per
trade."

**Image:** three columns of dots (one dot per universe), y-axis −2.1 to 3.3 Sharpe, with a
mean line in each:

| Column | Mean Sharpe | Universes positive |
|---|---|---|
| **In sample** (green) | **1.77** | 11 of 12 (one dot sits at ~0) |
| **Held out** (blue) | **0.86** | 10 of 12 (two near −1.5 / −2) |
| **Held out, after costs** (red, slider at 2 bp) | **0.62** | 8 of 12 |

A slider runs costs from **no costs → 6 basis points**.

**Readout:** each dot is a complete universe built and tested from scratch; nothing was
selected. "The edge here is real. It is also about **half the size** the in sample number
suggested, and costs take a further slice of what is left."

**Callout:** "**The edge is real, and it is about half what the model claims.** That is the
honest summary, and it is a far better outcome than most ideas reach."
- In sample is positive almost everywhere, which sounds impressive until you remember it was
  built on that data. The gap to held out isn't bad luck: "It is the portion of the in
  sample result that was never available to anybody."
- Push the cost slider: **at a few basis points per trade this model is close to a coin
  flip**, with turnover it can't avoid, because the holding period is set by the half life
  rather than chosen.

**Why you were taught it this way:** published results almost never say which of the three
columns they quote. The first is the largest and cheapest to produce; showing the others
means giving up data and admitting a smaller number, "so the incentive runs entirely one
way".

### Slide 40 — In plain terms: what does a trade *cost*; what is a basis point?

- **Short answer:** every trade costs the spread, commission, and the price moving against
  you as you deal (slippage/impact). A **basis point** = 0.01%. Two bp on £1,000 = 20p.
- **Everyday picture:** each move between moorings costs a small harbour fee plus a little
  lost to the current. Trivial per move, but a strategy that moves constantly pays it
  constantly, and if profit per move is also small, the fee can be most of the profit.
- **Why it matters:** this model is unusually cost-sensitive. It trades often, profit per
  trade is small by design, and the hedge basket moves every time the loadings are
  re-estimated.
- **Definitions:**
  - **Basis point:** 0.01%; 100 bp = 1%.
  - **Spread:** gap between the buy and sell price; you lose it every time you cross.
  - **Turnover:** how much of the book is traded per period. High turnover = costs paid often.

### Slide 41 — Why costs bite this model in particular

| | |
|---|---|
| **The half life sets the turnover** | A residual that decays in 15 days implies a position changed every few days. You didn't choose that; the data did. |
| **The edge is per unit of risk, not per trade** | Residual moves are small by construction, so cost per trade is large relative to what each trade tries to capture. |
| **Hedging multiplies the trades** | Every position carries an offsetting leg, so one decision produces turnover on both sides of the book. |
| **Costs are certain, the edge is not** | Cost is charged on every trade with no variance; the edge arrives only as an average across many trades. |

**Callout:** "**This is where most statistical arbitrage attempts actually die, and it has
nothing to do with the signal.**" The holding period falls out of the measured half life
and dictates turnover. A faster-reverting residual gives a cleaner signal *and* a worse cost
problem at the same time. "So the honest question is never whether the edge exists. It is
whether **the edge per unit of turnover exceeds the cost per unit of turnover**, and that
comparison has to be made before anything is deployed rather than discovered afterwards."

**Why you were taught it this way:** costs are invisible in any backtest that doesn't
deliberately model them. Gross results are easier to produce and are what get published,
"so an entire layer of the problem simply disappears from view".

**FX relevance:** majors have tight spreads, but a factor-neutral basket trades *every* pair
in the universe (including wider crosses) every rebalance. Use per-pair realistic costs,
not one flat number.

### Slide 42 — In plain terms: what is *overfitting*?

- **Short answer:** a model adjusted until it matches the past so closely it has memorised
  the noise along with the pattern. It looks excellent on the data it was built from and
  fails on anything new, because noise doesn't repeat.
- **Everyday picture:** study the harbour for a month and, with a complicated enough rule,
  you can predict every wave you saw. "Rule seventeen: on the third Tuesday, after a red boat
  passes, the water rises." Perfect fit, meaningless, wrong next month.
- **Definitions:**
  - **Overfitting:** fitting the noise. The more settings you try, the more certain it
    becomes.
  - **Parameter:** a setting, e.g. a lookback length or entry threshold.
  - **Search:** trying many combinations and keeping the best (tuning / optimisation).

### Slide 43 — The tuning trap (interactive)

"Every parameter combination, measured on the held out period."

**Image:** histogram of **held-out Sharpe for all 108 parameter combinations** (different
choices of components, entry, exit and lookback). The x-axis runs from −0.23 to 3.10, and bar
height = how many configurations landed in that group. Bars cluster around 0.3–0.6 (tallest,
~17) and again around 2.0–2.6, with a dashed line at the **average 1.60**. The rightmost bar
(amber, ~22 configs) is the group containing the **best, 3.10**.

**Readout:** every one of the 108 results was computed on the held-out period. The
distribution is centred near **1.60**; the best reaches **3.10**. "Report that one and you are
reporting the right hand edge of a distribution you generated yourself, not a property of the
model. **The moment you searched this period, it stopped being held out.**" The amber bar isn't
a discovery; it's the highest bar in a histogram, and the next period will draw a fresh one.

(Note: the average here, 1.60, is on a different universe/period from slide 39's 0.86.)

**Callout:** "This is the same machine as the overfitting lesson, applied to the one thing that
was supposed to be protected from it."
- The uncomfortable part: **the search feels like diligence.** You aren't fabricating
  anything; you test carefully, compare honestly and pick the best, and the result is still a
  number that won't repeat.
- **The only defence is procedural, not statistical.** Decide parameters before the held-out
  period is opened, write them down, and accept whatever comes back. If you can't resist
  looking, you needed a **third period** you didn't know about.

**Where this needs qualifying:** parameters *can* be chosen on the training data, using
**cross-validation inside that period**. That's what training data is for. The rule is
narrower: "The held out period answers one question once. Use it to compare fifty variants
and you have converted your only honest test into another round of fitting."

### Slide 44 — Two ways to arrive at the same chart

"Both produce an equity curve. Only one of them means anything." (The two-column table,
**Unfalsifiable vs Checkable**, is in the validation checklist at the top of this file.)

**Callout:** "The right column is harder, slower, and produces smaller numbers. It is also the
only version that tells you anything about tomorrow." Every item on the left has an innocent
explanation, which is why this is difficult: "Nobody sets out to produce an unfalsifiable
result. It happens one reasonable decision at a time."

### Slide 45 — What this example was actually for

**Headline:** "The model is not the point. *The order is the point.*"

- Look back: a sentence became a universe; the universe was measured; the measurement
  suggested a decomposition; the decomposition produced a residual; the residual was **tested
  for predictiveness before any rule was written**; the rule was shaped by that test rather
  than preference.
- Then: validated on untouched data, charged realistic costs, repeated across many
  independent universes so the answer was a distribution, not an anecdote.
- **Quote:** "Every one of those steps existed to give the idea a chance to fail cheaply."
- That's the craft. The technique is in a hundred papers and a few hundred lines; the
  discipline is arranging the work so a bad idea reveals itself "early, on paper, rather than
  late, in an account".
- **Change the technique and the order stays the same:** universe, measurement, mechanism,
  rule, held-out test, costs, repetition.

### Slide 46 — What would happen next

"If this model had survived, and it has not yet."

| # | Stage | Confirms |
|---|---|---|
| 01 | **Paper trading** | The rule can be executed at all, and the data arrives when you assumed it would. |
| 02 | **Burn-in, small size** | Live behaviour matches the record. At this Sharpe it needs many months to say anything. |
| 03 | **Scaled size** | The edge survives the size. Residual trades are **capacity limited** (only so much money fits before your own trading moves the price), so this is where many stop working. |
| 04 | **Monitoring** | It still works. Factor structure rotates, so the decomposition will change underneath it. |

**Callout:** "The result on the previous slides is not a green light. It is permission to
start the expensive part."
- At the Sharpe this model achieves after costs, **distinguishing a real edge from noise
  takes years rather than weeks**, so the honest answer arrives long after you'd like it.
- The last stage is the one people skip: a model that isn't watched "will keep trading a
  decomposition that stopped describing the market some time ago".

**Rule of thumb (not from the slide):** the t-stat of a Sharpe S over T years ≈ S·√T. For
S = 0.6 to reach t ≈ 2 you need about (2/0.6)² ≈ 11 years. That's why burn-in "takes years".

### Slide 47 — Check yourself (quiz)

**Q1. Why must the position be neutralised against the components?**
- ✅ **Because otherwise the result measures the idea plus a large accidental bet on the whole
  universe.**
- ✗ To reduce the number of trades.
- ✗ Because brokers require hedged positions.

**Q2. A residual shows a short half life on the window used to estimate the factors. What does
that prove?**
- ✗ That the factor model is wrong.
- ✅ **Very little, because a residual is orthogonal to those factors by construction and will
  look mean reverting regardless.**
- ✗ That it reverts and is tradeable.

**Q3. The held-out result disappoints, so you test fifty parameter sets on it and report the
best. What have you produced?**
- ✗ A better model.
- ✗ A valid out-of-sample result, since the data was still unseen at the start.
- ✅ **The highest bar in a histogram whose centre sits well below it.**

(The ticks are my answers from the lesson content; the quiz screenshot doesn't show the
marked answers.)

### Slide 48 — What to carry forward

1. Most of what an instrument does is the group moving. The tradeable part is what's left
   after that is removed.
2. An exposure vector converts a statistical direction into a position you can actually
   hedge.
3. A residual looks mean-reverting by construction, so reversion is only evidence when
   measured **outside the estimation window**.
4. Measure whether the signal predicts anything **before** writing the rule, and let the
   measurement shape the rule.
5. In sample flatters, costs bite, and the held-out period answers one question once.

**What this now lets you do:**
- Separate any correlated universe into shared movement and instrument-specific movement.
- Test whether a proposed signal predicts anything before building a strategy on it.
- Read any published backtest by asking: **which period, which costs, and how many variants
  were tried?**

**The transferable part: the order, not the technique.** Nothing depended on this being mean
reversion or on there being eight instruments. "So what changes when the idea is momentum,
or carry, or something you noticed yourself last week?"

---

## Research ideas for this repo (running list)

- Apply to the G10 FX universe already in the model: PCA on daily returns of the 26
  pairs/instruments (or on the 8 currencies vs a base), check how much PC1 (likely USD)
  and PC2 explain.
- Implement the noise-band test to pick K rather than guessing.
- Track exposure-vector drift over rolling windows; check book concentration by vector
  similarity rather than position count.
- Port the 16-line loop directly (window 120, K from the noise band, dead band 0.2, cap
  1.5, inverse-vol sizing, projection, gross 1, 2 bp cost) onto daily FX returns.
- Run the slide-28 bucket test on FX residuals first. If the bars don't step down, stop.
- Half-life vs random-walk band, in sample and out of sample with loadings frozen.
- Compare dollar-neutral vs factor-neutral versions of existing basket trades in the repo
  (e.g. currency-strength baskets) to see how much hidden USD / risk-on exposure they carry.
- Test re-estimation frequency (daily / weekly / monthly) against the sawtooth
  trade-off.
- Write the manifest (window, K rule, dead band, cap, cost per pair, re-estimation
  frequency, held-out dates) **before** the first run, and reserve a held-out period plus a
  third untouched period.
- Report in-sample / held-out / held-out-after-costs separately, and run across
  sub-universes (e.g. G10 majors vs crosses, or rolling start dates) to get a distribution.
- Model costs per pair (majors vs crosses) and compute edge per unit of turnover vs cost per
  unit of turnover.
- Add P&L attribution by instrument and a noise-band filter to drop non-reverting residuals.


