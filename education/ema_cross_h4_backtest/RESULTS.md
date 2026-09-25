# 9/21 EMA cross on M5, pullback-and-continue, H4-close filter — results (2026-09-25)

Pre-registration: [`PREREGISTRATION.md`](PREREGISTRATION.md), committed in `217fd2d`
**before** the run. Script: `run_backtest.py`. Raw output: `results.json`.

## Verdict: **NULL** — 3 of 3 instruments fail, and it dies twice over

~34,000 crosses per instrument, 2016-01 → 2026-09, ~11,000 entries each. This is not
a small-sample null.

## It fails the feasibility gate before P&L is even computed

| Instrument | spread / ATR14 (M5), median | Gate (≤ 0.15) |
|---|---|---|
| EUR_USD | **0.438** | DEAD |
| GBP_USD | **0.423** | DEAD |
| NAS100_USD | **0.206** | DEAD |

Every instrument is **1.4× to 2.9× outside** the repo's standing execution gate. On
M5 the spread is roughly 40% of the average bar's true range. That alone ends it, and
it was computed first by pre-registration precisely so the P&L could not be argued
with afterwards.

## And the P&L confirms it — at 1R, out of sample

| Instrument | n | gross exp (R) | **net exp (R)** | gross PF | **net PF** | win |
|---|---|---|---|---|---|---|
| EUR_USD | 4,696 | −0.030 | **−0.758** | 0.94 | **0.20** | 37.4% |
| GBP_USD | 4,644 | −0.034 | **−0.801** | 0.93 | **0.19** | 38.6% |
| NAS100_USD | 4,326 | −0.024 | **−0.236** | 0.95 | **0.60** | 47.3% |

2R targets are the same picture. In sample is no better than out of sample — this
never worked at any point in ten years.

## The mechanism of failure, which is the transferable part

**Each trade pays about 0.7R in spread.**

The stop is the pullback extreme, which on M5 sits ~4–5 pips from entry on EUR_USD.
The round-trip spread is ~3.2 pips. So the cost is not a haircut on the edge — **the
cost is most of the risk unit**. You are risking 4.5 pips to pay 3.2 pips.

This is the execution feasibility gate stated in trade terms: as the timeframe speeds
up, the stop distance shrinks toward the spread, and past a point every trade starts
underwater by a large fraction of its own risk. It is the same wall the VWAP extension
work hit at 3–8× under cost.

**But note the difference from VWAP extension.** There, gross was *positive* and cost
killed it — "real but unaffordable". Here **gross is negative too** (PF 0.93–0.95).
The signal has no edge before costs either. That is a stronger null: there is nothing
being priced out, there is nothing there.

## The H4 filter does almost nothing

| Instrument | Setups reaching the filter | Blocked by it |
|---|---|---|
| EUR_USD | 13,584 | 1,550 (**11.4%**) |
| GBP_USD | 13,410 | 1,501 (11.2%) |
| NAS100_USD | 12,204 | 1,271 (10.4%) |

By the time a cross has produced a pullback *and* a continuation, price is already on
the "right" side of the last H4 close about 89% of the time. The filter is **nearly
inert** — it is largely re-stating what the entry condition has already established,
not adding independent information.

That matters for how to read the null: the H4 filter was the only part of the rule
with a plausible mechanism, and it turns out to be barely binding. There is no version
of "but the filter is doing the work" available here.

## Population accounting

Of ~34–38k crosses per instrument, ~31% reach an entry. The rest die as:
no pullback within 12 bars (~4,500), or pullback but no continuation (~18–20k, the
largest single bucket by far).

## What is NOT concluded

- **Not** "EMA crosses never work." This tested one specification of one rule, with
  the ambiguities resolved as pre-registered.
- **Not** "a wider stop would fix it." Gross R is stop-dependent, so a different stop
  changes the denominator and I cannot rule that out from this run. But it would be a
  **new test needing its own pre-registration**, and hunting for a stop that turns a
  negative gross positive is exactly the forking-paths behaviour this book has been
  burned by. The prereg's own words: a signal that is real but unaffordable "is not a
  licence to hunt for a cheaper execution until one appears."
- **Not** a comment on higher timeframes. The whole failure mechanism is that M5 stop
  distances are the same order as the spread. That argument weakens as the timeframe
  slows, and nothing here tests it.

## Prior check

NULL was pre-registered as the expected outcome, for three reasons already in the
book (the 0-of-30 feasibility result, the VWAP cost wall, and the base rate for
unmodified retail patterns). The result matched the prior, so nothing here is a
surprise — which is worth saying plainly rather than presenting a confirmed prior as
a discovery.
