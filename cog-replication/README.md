# COG Replication — START HERE

> **New session: read this file, then `DECISIONS.md`. Do not re-derive anything
> below. Do not start a parallel QMR effort.**

## The goal

Build a system that trades like COG's and reaches his results level. COG is the
**target to reproduce**, not a subject to document. His observed system, message
flow and published tearsheet: `../COG_OBSERVED_SYSTEM.md`.

His bar: 324 trades / 5.4y (~60/yr, ~24% of weekdays), **58.6% win rate**,
Sharpe 2.32, max DD −21.94%, hard loss floor −4.40%.

## Why this is FORWARD-tested, not backtested

The direction hypothesis leans on **options positioning (OI / GEX / walls)**, and
there is no meaningful OI history — `oi_history` is a rolling ~60-day archive,
*"only re-accumulable by waiting"*. So:

**We emit our own gate output every day, log COG's actual alerts beside it, and
compare.** No backtest can settle this. The record accumulates or it doesn't.

## The three-layer hypothesis

| Layer | Job | Cadence | Data |
|---|---|---|---|
| **Gate 1 — tide** | Is money flowing in? Directional *bias*, persistent | weekly-ish | WALCL, TGA, RRP (net liquidity), HY credit |
| **Gate 2 — transmission** | How far can it travel today, how violently? → **stop distance + risk tier** | daily | GEX / dealer gamma |
| **Gate 3 — magnet** | Where does it get pulled to? → **direction + target** | daily | OI walls, max pain, volume magnets |

Mechanical link, not hand-waving: repo/RRP *is* dealer funding plumbing.
Constrained balance sheets means less hedging capacity, which means positioning
transmits into **bigger** moves. Tide and channel, not two systems.

Maps onto COG's observed stages:

- Gate 1 → "Data threshold 1" — variable 02:00–14:00 UK, which matches the
  **CME OI publication window** (preliminary evening → final next morning)
- Gate 2 → "Data threshold 2" — 08:30–09:00 ET, outputs stop % + risk %
- Gate 3 → "Order filled" — direction, just before the NY cash open
- Stage 4 → his **discretionary close**, which we cannot model and which may be
  where his edge actually lives (his avg loss −3.06% sits well inside his
  −4.40% floor)

## Status

| | |
|---|---|
| Phase | **1 — shadow emitter not yet built** |
| Forward record | not started |
| Evidence so far | owner's OI analysis matched COG's direction **2/2** (LONG 14:23, SHORT 14:26). Two observations; a coin flip returns 2/2 about a quarter of the time. The **mechanism fit** is the reason to pursue this, not the hit rate. |

## Hard-won rules — violate these and the work is worthless

1. **Stops must be live from the fill minute.** `filter(b => b.t > entryBar.t)`
   is correct for choosing a FILL and wrong for walking an EXIT. That single
   idiom silently produced two false results on 2026-07-29 (`../FIX_TRACKER.md`).
   Check every variant for free exposure before believing it.
2. **A validator that inherits the assumption it is testing is not a validator.**
   The M1 audit "confirmed" the broken engine because it was built to match the
   broken engine's window.
3. **Paired within-engine comparisons survive chassis bugs; absolute Sharpes do
   not.** Trust signal-vs-inverse numbers over headline levels.
4. **Check concentration before believing any full-sample edge.** The no-target
   result looked excellent and was 10 trades of 609, 82% of it from 2022.
5. **Costs are measured, never assumed.** NAS100 round-trip 0.937bp, XAU 1.521bp
   (`/api/nq-qmr/spread-check`).

## What is already dead — do not rebuild

- **QMR (price-based gates).** Falsified 2026-07-29: the entire edge was the
  free-hour artifact. On honest exposure the best variant is Sharpe 0.36 at 46%
  drawdown, after testing gates, stop calibration, entry timing, exit rule and
  construction. It is not a tuning problem.
- **Cross-asset / net-liquidity direction as a standalone daily signal.**
  Measured null on the honest chassis (dirAlpha −0.011, t = −0.14, n = 521).
  This does **not** rule it out as a slow *bias* layer — that is Gate 1's job
  here and remains untested in that role.

## Layout

```
cog-replication/
  README.md        <- this file, the resume point
  DECISIONS.md     <- dated log: what was decided, why, what reverses it
  FORWARD_LOG.md   <- the daily record: our gate output vs COG's actual
  engine/          <- the shadow emitter
  data/            <- captured daily snapshots
```
