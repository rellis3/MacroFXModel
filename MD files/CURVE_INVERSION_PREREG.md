# CURVE-INVERSION — An inverted US yield curve (10y minus 2y below zero) is followed by weaker risk assets and a recession signal the market has not already priced

**Pre-registered 2026-10-01, before the harness was written or run.**

> Commit this file BEFORE writing the harness. `study.mjs bank` checks git and refuses a
> result whose pre-registration was committed afterwards.

## The claim

The folk version, stated as it is usually made: *"An inverted yield curve has preceded every
US recession in the last fifty years. When the 10-year falls below the 2-year, the bond
market is telling you a downturn is coming, and risk assets have not priced it."*

It is on this desk's own board (`T10Y2Y`, pulled by the net-liquidity and liquidity-gate
engines since they were built) and has never been scored. It is also the single most cited
spread in macro, which is exactly why it deserves a hostile test rather than a nod.

## Why it is not already settled

Four neighbouring findings exist and none of them reaches this:

- `front-end-shock` (NULL) tested a 2-year *shock* → FX volatility. A level/sign claim about
  the 10y−2y *spread* is a different question.
- `rates-pivot-lead` (NULL) tested intraday rate turns leading the Nasdaq. Different horizon
  by three orders of magnitude.
- `yields-to-fx-direction` (NULL) and `yield-move-fx-range` (NULL) are about FX, not about
  recessions or equities.
- `yield-spread-sleeve` (VALIDATED) trades the *US-vs-foreign* spread's mean reversion. That
  is a cross-country relative-value signal, not the domestic curve's shape.

A full-sample correlation between the spread and forward returns would also not settle it:
the claim is specifically about the **sign crossing zero**, which is a rare state, and a
correlation computed over 12,581 days is dominated by the 11,000 on which nothing happened.

## Definitions, fixed in advance

- **The setup**: `T10Y2Y < 0` at a daily close. An **episode** begins on the first such day
  after at least 60 consecutive non-inverted days, and ends on the first day the spread has
  been ≥ 0 for 60 consecutive days. The 60-day buffer exists so a spread oscillating around
  zero produces one episode, not forty.
- **Knowable when?**: `T10Y2Y` is published same-day and never revised, so an episode start
  is knowable on its own date — no lag. **`USREC` is not**: NBER dates recessions in
  arrears, typically 6–18 months later, so a USREC-based outcome is a *retrospective label*
  and can never be a tradeable signal. Measured anyway, labelled as such.
- **The outcome**, from the episode start date:
  - **O1 recession**: does `USREC` turn 1 within 12 / 18 / 24 months?
  - **O2 equities**: `NASDAQCOM` total forward return over 3 / 6 / 12 months. (Nasdaq, not
    S&P — FRED serves `SP500` and `DJIA` on a 10-year trailing window, the same trap the
    credit stack sits in. `NASDAQCOM` runs from 1971.)
  - **O3 labour**: change in `UNRATE` over the following 12 months.
- **The control**: the *same* measurements started from randomly chosen non-inverted days,
  matched to the same calendar months as the episodes, so a verdict cannot be the 1970s and
  2008 wearing a yield curve. Also the unconditional distribution of each outcome.
- **De-clustering**: **this is the whole study.** Daily observations inside one inversion are
  not independent — a single episode can contribute 500 days and look like 500 successes. The
  unit of observation is the **episode**, not the day. Expect roughly 6–9 episodes in 50
  years.
- **MIN_EVENTS**: **6 episodes.** Below that the cell is **UNTESTABLE, which is NOT a null** —
  it means this question cannot be answered with fifty years of data, which is itself the
  finding and the one most people never state.

## Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| a | O1: does a recession follow an inversion within 24 months? | **Yes, and it will look impressive — I expect 5 or 6 of ~7 episodes.** But I expect the 95% interval on a 7-event sample to span roughly 40–95%, i.e. consistent with anything from a coin flip to a certainty. The right verdict is UNTESTABLE-at-this-n, not "validated". |
| b | O2: are forward equity returns after an inversion worse than the control? | **No — null, and possibly positive.** The lag from inversion to downturn is long and variable, and equities have historically rallied through much of it. I expect 12-month forward Nasdaq returns after an inversion to be statistically indistinguishable from the control, with a wide spread. If anything is there, I expect it at 18–24 months, which this horizon does not reach. |
| c | **THE GATE.** What must hold for this to count as real — both directions, both halves, or a mirror. | **Three conditions, all required.** (1) **Leave-one-out**: drop any single episode and the direction must survive — I expect 2008 alone to carry O1 and possibly O2. (2) **The mirror**: a steepening episode (`T10Y2Y` crossing *above* its 80th percentile after being below it) must NOT produce the same forward weakness; if it does, the result is the period, not the curve — this is what killed `breadth-narrowing`. (3) **The control must not match**: the matched non-inverted sample must do materially better than the episodes. |

Writing the expectation down first is the point. A result that comes back against a
stated prior is worth something; one that confirms a prior you never wrote down is not.

**My overall prior, recorded plainly:** the recession claim is *probably true and
unprovable* at this sample size, and the tradeable claim — that risk assets fall after an
inversion within a year — is *probably false*. If both come back as expected, the finding is
that the most famous spread in macro is descriptive rather than actionable, which is the same
shape as nearly everything else this desk has tested.

## What this does NOT test

- **Recession *timing***. "Within 24 months" is a wide window and a 24-month-ahead warning is
  not a position.
- **Tradeability.** `USREC` is retrospective (see Knowable-when), so O1 can never be acted on
  even if it is real. Only O2 and O3 are knowable in time.
- **10y−3m.** `T10Y3M` is the version some of the literature prefers and starts in 1982. It is
  measured as a secondary read, but the gate is defined on 10y−2y and a 10y−3m-only result
  would be a new hypothesis, not a confirmation of this one.
- **Non-US curves.** The foreign legs on this desk are OECD monthly series and cannot carry a
  daily episode definition.
- **Causation.** Nothing here separates the curve from what the Fed was doing at the time.
