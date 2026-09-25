# Pre-registration — 9/21 EMA cross on M5, pullback-and-continue, filtered by the last H4 close

**Written 2026-09-25, before any outcome was computed.** Committed before the run.

## The rule, as given

> "9 EMA and 21 EMA cross on the 5m. Enter after cross, pull back and continue above
> or below the last 4h close."

## The choices I had to make, stated so they are not silently invented later

The rule as stated is under-specified in five places. Each choice is fixed here:

| Ambiguity | Choice | Alternative declared now (not chosen afterwards) |
|---|---|---|
| What is "the last 4h close"? | Close of the most recently **completed** H4 bar, known at the signal bar | — |
| How does it filter? | Long requires price **above** it, short **below** it, evaluated at entry | — |
| What is "pull back"? | Price retraces to **touch the 9 EMA** after the cross | touch the **21 EMA** (spec B) |
| What is "continue"? | An M5 bar **closes beyond the pre-pullback extreme** in the cross direction | — |
| How long does the setup stay live? | **12 M5 bars** (1 hour) from the cross, else void | 24 bars (spec C) |

Stop: beyond the pullback extreme (pullback low for a long, high for a short).
Targets tested: **1R, 2R, and a 24-bar time exit** — all three reported, none selected
after the fact.

## Costs — measured, not assumed

The M1 parquet files carry **real per-bar spreads** (`spread_open`, `spread_close`).
Entry and exit are both charged the actual spread at that bar. No fixed-spread
assumption, and no zero-cost number is reported anywhere, not even as a first look.

## The feasibility gate runs FIRST

This repo's standing rule (`project_execution_feasibility_gate`): **spread / ATR >
0.15 = dead**, and cost outruns edge as the timeframe speeds up. This is an M5
strategy, which is squarely in the danger zone that killed the VWAP extension work
(positive gross, 3–8× under cost).

**`spread / ATR14(M5)` is computed and reported before any P&L number.** If it fails
the gate, that is the headline result and the strategy is dead on execution grounds
regardless of what the signal does.

## Instruments

`EUR_USD`, `GBP_USD`, `NAS100_USD` — two FX majors and one index, so a result cannot
rest on a single market's microstructure. 2016 → 2026 where available.

## Verdict rule

- **SUPPORTED** — out-of-sample **net** expectancy > 0 after real spread costs, on
  ≥ 200 OOS trades, profit factor ≥ **1.10**, holding on **≥ 2 of 3** instruments.
- **NULL** — OOS net expectancy ≤ 0, or profit factor < 1.05, on the majority of
  instruments.
- **INCONCLUSIVE** — anything else. Not a licence to re-cut.

Chronological **60/40 IS/OOS split**. Parameters are fixed above; the OOS period is
opened once.

## Reporting requirements, fixed now

1. **Gross and net side by side.** The gap is the finding if the gross is positive and
   the net is not — that is the VWAP-extension pattern and it must be visible.
2. **Population accounting at every filter** — how many crosses, how many survived the
   H4 filter, the pullback, the continuation, the 12-bar expiry. A rule that only fires
   40 times in 10 years is a different object from one that fires 4,000 times.
3. **Dropped rows counted**, never silently discarded.

## Prior, stated before running

**I expect NULL.** Three reasons, all pre-existing in this book:

- The execution feasibility gate found **0 of 30 cells** viable as timeframe speeds up.
- The VWAP extension study was positive gross and 3–8× under cost at these horizons.
- A 9/21 EMA cross is among the most widely known retail patterns in existence; the
  prior that an unmodified version carries net edge after real spreads is very low.

The H4-close filter is the only part with a plausible mechanism (trade only in the
direction of the higher-timeframe level), and it is a **filter**, not an edge — it can
at best improve a signal that already works.

A positive result would be the surprise, and is written here as such so it cannot be
narrated afterwards as expected.

## What kills it

Net expectancy ≤ 0 out of sample on 2 of 3 instruments. If gross is positive and net
is not, the correct conclusion is **"the signal is real and unaffordable"**, which is
not a licence to hunt for a cheaper execution until one appears.
