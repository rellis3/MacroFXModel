# YIELD-MOVE-FX-RANGE — Does a large yield move precede a WIDER FX session, even though it does not predict direction?

**Pre-registered 2026-09-27, before the harness was written or run.**

## The claim

Not a claim from anyone in particular — this is the desk re-asking one of its own closed
questions in the only form that has ever worked here.

`yields-to-fx-direction` (2026-08-23) tested whether yield moves predict the DIRECTION of
FX and indices and returned **null**: the relationship is real, but same-bar only. That
finding is not in doubt and this does not reopen it.

What was never asked is the range version. The ledger's own pattern is stark: of 19
validated entries, **13 measure range and only 4 measure direction**. Every volatility
study on this desk for the last month has been real on range and null on direction. A
yield move is the single most-watched macro input on the board, and nobody has asked
whether a big one precedes a wider FX session.

## Why it is not already settled

Three near neighbours exist and none of them answers this:

- **`yields-to-fx-direction`** measured direction. A null on direction says nothing about
  dispersion — a market can go nowhere violently.
- **`front-end-shock`** measured exactly this shape on the 2-year and found the opposite
  of the folk claim: after a 2Y UP shock, EUR/USD and GBP/USD ran **calmer** (−0.34 and
  −0.28 ATR, intervals clear of zero). That is a real, signed, well-powered result — but
  it is about the FRONT end and a weekly horizon, not the 10-year and a daily one.
- **`vix-inversion`** and **`surprise-size`** are the validated range results, and both
  come from a volatility or event input, not from a rates input.

So the specific question — does a large move in the **10-year** precede a wider **daily**
FX session — sits in the gap between them.

## Definitions, fixed in advance

- **The setup**: a daily change in the US 10-year (FRED `DGS10`) whose absolute size is
  at or above the **90th percentile** of its own trailing 2 years, computed on a ROLLING
  basis so there is no look-ahead.
- **Knowable when?** The yield close is known at the close. The outcome window therefore
  starts on the **next** session, never the same one — the same-bar relationship is
  already known to be real and including it would simply re-measure that.
- **The outcome**: mean forward range ratio — each session's (high − low) ÷ close,
  divided by the trailing 20-session median of the same — over the next 1 and 5 sessions.
- **Instruments**: EUR/USD, USD/JPY, GBP/USD. Three, fixed in advance, reported
  separately. Not a basket, so one instrument cannot carry the result.
- **The control**: every session at least 5 sessions away from any setup, same
  instrument, same span.
- **De-clustering**: setups closer together than the horizon are not independent; the
  first of each cluster is kept.
- **Uncertainty**: block bootstrap, blocks of 5, 1,000 resamples, 95% interval on the
  difference from control.
- **MIN_EVENTS = 30** per cell. Below it the cell is UNTESTABLE, which is NOT a null.

## Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| a | Does the next session run wider after a top-decile 10-year move? | **Yes, modestly** — around +0.15 to +0.30 ATR. This is the one direction the desk's own record supports, and a rates shock plausibly widens the distribution without choosing a side. |
| b | Does it still hold at 5 sessions? | **No.** Expect it to decay. `front-end-shock` found the weekly horizon went the other way entirely. |
| c | **THE GATE.** Does it hold on all three instruments AND in both halves of the sample? | **This is what must pass.** One instrument or one half is a period artefact, which is exactly how `breadth-narrowing` died. |
| d | **THE MIRROR.** Does a large yield move *down* widen range as much as one up? | **Yes, roughly symmetric.** If only one side works, the effect probably belongs to the episodes those moves sat inside rather than to the size of the move. |

Stating (a) as a positive expectation is deliberate and it raises the bar on myself: if it
comes back null, that is a null found against my own prior and it closes the question
properly rather than leaving it feeling untried.

## What this does NOT test

- **Direction.** Nothing here says which way anything goes, and the write-up must not
  imply it. The banked null on direction stands.
- **Tradability.** A wider session is not an edge until it clears costs. This desk's own
  gate is spread/ATR above 0.15 being dead, and that is a separate calculation.
- **Cause.** If range widens after a yield move, this cannot say the yield move caused
  it. Both may sit inside the same macro episode, which is precisely what the mirror in
  (d) is there to probe.

---

## RESULTS — run 2026-09-27

DGS10 daily, 1,915 top-decile days on a rolling 504-day threshold (1,014 up, 901 down),
de-clustered to 260 setups per pair. EUR/USD, USD/JPY and GBP/USD, 2010-11 → 2026-09.

**Verdict on the pre-registered gate: NULL.**

| | EUR/USD | USD/JPY | GBP/USD |
|---|---|---|---|
| next 1 session | **+0.101 [0.013, 0.196]** | +0.086 [−0.014, 0.202] | +0.078 [−0.023, 0.185] |
| next 5 sessions | **+0.053 [0.007, 0.105]** | +0.070 [−0.011, 0.154] | +0.033 [−0.016, 0.087] |

The gate was all three instruments **and** both halves. EUR/USD clears on its own at both
horizons; the other two do not, and no half-split clears anywhere. One instrument out of
three is the shape of a period artefact, which is exactly what the gate exists to catch.

### My expectation was wrong in the useful direction

I pre-registered **+0.15 to +0.30 ATR** and a positive result. What came back is roughly a
third of that on one pair and nothing on the other two. Writing the expectation high made
this a real test rather than a formality: a null against a stated positive prior closes
the question, where a null against "probably nothing" would have left it feeling untried.

### The asymmetry, and why it is NOT a finding

The mirror is stark and it is the interesting part of the run:

| at 5 sessions | EUR/USD | USD/JPY | GBP/USD |
|---|---|---|---|
| yields **UP** | −0.002 | −0.063 | −0.022 |
| yields **DOWN** | **+0.109 [0.031, 0.194]** | **+0.208 [0.093, 0.343]** | **+0.090 [0.015, 0.178]** |

Down-moves widen FX range on **3 of 3** pairs; up-moves on **0 of 3**. That looks like a
result, and the pre-registration says in advance how to read it: *"if only one side works,
the effect probably belongs to the episodes those moves sat inside rather than to the size
of the move."*

Which is almost certainly what this is. A large fall in the 10-year is a flight-to-quality
tape — the yield fall and the FX volatility are both symptoms of a risk-off episode, and
nothing here separates the two. Reported as an observation, banked as **null**, and
explicitly not promoted to a finding on the strength of a split that was pre-registered as
a warning sign rather than as evidence.

It does, however, sit consistently beside `front-end-shock`, which found the same sign on
the other leg: a hawkish 2-year repricing was followed by a **calmer** week. Two
independent studies now say rates up → quieter FX, rates down → noisier FX. Worth a
properly conditioned test on risk-off episodes some day; not worth a claim today.

Harness: `analysis/yield_move_fx_range_study.mjs`.
Output: `analysis/output/yield_move_fx_range.json`.
