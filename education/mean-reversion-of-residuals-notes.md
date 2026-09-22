# Mean Reversion of Residuals — Worked Example Notes

> **Source:** "The Bank" (Colez Trades / C.OG micro-education site), worked example
> *Mean Reversion of Residuals*, 48 slides.
> **Purpose:** a full write-up of the lesson as a **guide to building the system** —
> the text of each slide, a description of every chart/interactive, and the
> build steps and rules pulled out so we can implement and test it later.
> **Note on charts:** every chart in the lesson is labelled *"Simulated data. Generated
> to show the relationship clearly. Not taken from any market, account or track
> record."* Numbers quoted below are from that simulated 8-instrument universe.

**Status:** slides 1–17 logged. Remaining slides to follow.

---

## The system in one paragraph (so far)

Take a universe of related instruments. Most of their movement is shared (a common
driver). Use PCA to find the shared drivers, keep only the components that beat a
pure-noise baseline, describe each instrument by its **exposure vector** (its
loadings on those components), and strip that shared movement out. What is left —
the **residual** — is the instrument-specific part. The trade idea is that the
residual mean-reverts ("instruments that drift away from the group tend to come
back"), and it can be traded without taking a view on the group.

## Build steps extracted so far

1. **Define the universe** and measure how independent its members really are
   (average pairwise correlation). High correlation = mostly one bet.
2. **Run PCA** on the instruments' returns; get variance explained per component
   (scree) and the running total.
3. **Choose K (number of components to remove) against a noise baseline** — decompose
   many sets of pure-noise series of the same count and length; keep only components
   whose variance share is above the noise band (5th–95th percentile). Do **not** pick
   K off an "elbow".
4. **Build each instrument's exposure vector** — its loadings on the K kept components,
   in fixed order.
5. **Compute each instrument's residual:** actual return − Σ(loading × factor return) over the
   K kept factors. Cumulate it into a residual series.
6. **Measure reversion per instrument** (half-life of the cumulative residual, ~15 days for
   instrument A in the example). Drop instruments whose residual doesn't revert.
7. **Hedge the trade:** go long/short the stretched instrument and at the same time hold a
   basket of the others, weighted so the book's exposure Σ wᵢβᵢ to every kept factor is
   ~0. What's left is a position in the residual only (basket construction in later
   slides).
8. **Test the hedge using the component's working name:** e.g. a PC1-neutral book should
   show a market beta near zero against a market proxy.
9. **Re-estimate on a rolling basis** — components and vectors are estimates from a
   finite window and they drift/rotate.

## Rules and warnings (so far)

- Shared movement is **not** the opportunity; it is what stands between you and it.
- The residual is small, hidden, and "where the entire trade lives".
- K is the **single most consequential setting**. Too few → real common movement
  leaks into the residual and looks like opportunity. Too many → you remove the thing
  you wanted to trade.
- Hedging against noise components removes signal along with it.
- Components are **directions, not causes**; **estimated, not given**; **rotate over
  time**; **unnamed**. Never build logic on what you *think* a component represents
  ("PC1 = the market").
- Counting positions says nothing about diversification; look at how spread out the
  exposure vectors are. Similar vectors = one position held N times.
- A component dominated by a single instrument (like PC3 here) is noise, not structure.
- The **sign of a PC is arbitrary**. Rely on the grouping, never on "PC2 positive = X".
- A name for a component is a **hypothesis kept only so the hedge can be checked**.
- A residual that doesn't revert is not a trade, however far it has strayed.
- **Loading ≠ exposure.** Loading belongs to the instrument; exposure = Σ position ×
  loading belongs to you, and it's the only lever you control.
- Every position is a bundle of factor exposures you hold whether you chose them or not.
  Only a deliberately factor-neutral basket isolates the residual.

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

---

## Research ideas for this repo (running list)

- Apply to the G10 FX universe already in the model: PCA on daily returns of the 26
  pairs/instruments (or on the 8 currencies vs a base), check how much PC1 (likely USD)
  and PC2 explain.
- Implement the noise-band test to pick K rather than guessing.
- Track exposure-vector drift over rolling windows; check book concentration by vector
  similarity rather than position count.

*(To be extended as further slides arrive.)*
