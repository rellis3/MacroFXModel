# SPREAD-DIVERGENCE-RANGE — When the DE-US 10-year spread moves and EUR/USD does not, does the next few hours run WIDER, even though spot does not catch up directionally?

**Pre-registered 2026-09-27, before the harness was written or run.**

## The claim

The desk re-asking its own closed question in the form that has actually worked here.

`spread-leads-fx-hours` (banked **null**) tested the folk claim that the DE-US 10-year
spread leads EUR/USD by hours: when the spread moves and spot does not, spot catches up
within a day. It does not. Same-hour correlation is −0.30 every year; at +1h it is −0.015
against a placebo of 0.013; from +2h to +48h it is zero. On 727 non-overlapping divergence
setups, spot did not catch up. That is settled and this does not reopen it.

The untested half: a divergence is a **disagreement between two markets that normally move
together**. Disagreement resolving is not the only thing that can happen — it can also
simply get noisy. Nobody asked whether the hours after a divergence run WIDER.

## Why it is not already settled

- **`spread-leads-fx-hours`** measured whether spot moved toward the spread. Range was
  never computed, and a market can resolve a disagreement by thrashing in both directions
  without ever "catching up".
- **`yield-spread-sleeve`** is the validated cousin and is a completely different animal:
  a z-scored **2-year** spread, mean-reverting over **weeks**, traded on the spread
  itself. Its success says nothing about a 10-year spread at an hourly horizon.
- **`nonus-yield-gap-range`** tested a foreign-led yield rise against forward range and
  returned null — but on a daily horizon and as a *level* gap, not as a divergence
  between the spread and spot.

## Definitions, fixed in advance

- **The setup**: an hour in which the DE-US 10-year spread moved by at least its own
  trailing 90th percentile (rolling, 2 years) **while** EUR/USD moved by less than its
  own trailing median. That is the divergence — the spread said something and spot did
  not answer. Both thresholds rolling, so no look-ahead.
- **Knowable when?** At the close of that hour. Every measurement starts at the NEXT
  hour. The same-hour relationship is already known to be real (−0.30) and including it
  would re-measure that rather than test this.
- **The outcome**: mean forward range ratio on EUR/USD — each hour's (high − low) ÷
  close, over the trailing 20-hour median — for the next 2, 6 and 24 hours.
- **The control**: every hour at least 24 hours from any setup, same instrument, same
  span. Hours are strongly seasonal, so the control is additionally **matched by hour of
  day**: a divergence that clusters into the London–New York overlap would otherwise be
  compared against a average that includes the Asian lunch hour, and would look wide for
  a reason that has nothing to do with the spread.
- **De-clustering**: setups closer than 24 hours are not independent; the first is kept.
- **Uncertainty**: block bootstrap, blocks of 6 (a quarter-day), 1,000 resamples, 95%
  interval on the difference from control.
- **MIN_EVENTS = 30** per cell. Below it the cell is UNTESTABLE, not null.

## Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| a | Do the 2 hours after a divergence run wider than a matched control? | **Null.** The original study found nothing at any lag from +1h to +48h, and I expect the same emptiness on range. |
| b | 6 and 24 hours? | **Null**, same reason. |
| c | **THE GATE.** Does anything that survives (a) or (b) also hold with the control matched by hour of day, and in both halves? | **This is the gate**, and I expect the hour-of-day match to be what kills any apparent effect. |
| d | **THE MIRROR.** Does the reverse divergence — spot moves, spread does not — widen range the same amount? | **Yes, about the same.** If both do, the effect is "one of the two markets moved a lot", not the disagreement between them. |

Expectation stated as null in advance and deliberately so: this is the weaker of the two
range candidates, and if it comes back real it will be a result found hard against a
prior rather than a story fitted afterwards.

## What this does NOT test

- **Direction**, or whether spot catches up. That is banked null and stands.
- Whether a wider two hours is **tradable**. At an hourly horizon on EUR/USD, cost is
  most of the question, and spread/ATR above 0.15 is dead by this desk's own gate.
- Any other pair. DE-US and EUR/USD only — the original study's instruments, so the two
  results sit on the same ground.
