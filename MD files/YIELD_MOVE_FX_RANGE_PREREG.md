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
