# Mean Reversion of Residuals — Worked Example Notes

> **Source:** "The Bank" (Colez Trades / C.OG micro-education site), worked example
> *Mean Reversion of Residuals*, 48 slides.
> **Purpose:** a full write-up of the lesson as a **guide to building the system** —
> the text of each slide, a description of every chart/interactive, and the
> build steps and rules pulled out so we can implement and test it later.
> **Note on charts:** every chart in the lesson is labelled *"Simulated data. Generated
> to show the relationship clearly. Not taken from any market, account or track
> record."* Numbers quoted below are from that simulated 8-instrument universe.

**Status:** slides 1–10 logged. Remaining slides to follow.

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
5. **Use the vectors to hedge / project out** the factor exposure (arithmetic on the
   vectors — covered in later slides).
6. **Re-estimate on a rolling basis** — components and vectors are estimates from a
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

---

## Research ideas for this repo (running list)

- Apply to the G10 FX universe already in the model: PCA on daily returns of the 26
  pairs/instruments (or on the 8 currencies vs a base), check how much PC1 (likely USD)
  and PC2 explain.
- Implement the noise-band test to pick K rather than guessing.
- Track exposure-vector drift over rolling windows; check book concentration by vector
  similarity rather than position count.

*(To be extended as further slides arrive.)*
