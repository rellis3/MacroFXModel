# Decision log

Newest first. Every entry: what was decided, why, and what would reverse it.

## 2026-09-24 — the GEX prerequisite is discharged, and the OI archive exists

**Decided:** G2's premise is validated for range, the "cannot be backtested"
constraint is void, and G2's *emphasis* is wrong.
**Why:** the check this log demanded on 2026-07-29 and never ran has now run --
`oi_research_book/GEX_RANGE_BROWNIAN_RESULTS.md`, pre-registered in `0663f29`.
On 793 days of NQ, next-day realised range relative to a same-trailing-vol
Brownian baseline is **+0.176 higher on short-gamma days** (p 0.0008), rising to
**+0.315 when matched on trailing vol** -- the vol confound was diluting it, not
creating it. Positive in 4/4 specifications and 6/6 usable years.

Two corrections fall out:

1. **The archive.** `OI Data/NAS100_USD.csv` holds 1,521 dated days of per-strike
   OI (2020-09 -> 2026-09), already processed into `oi_research_book/data/`. The
   2026-07-29 decision "forward-test, don't backtest" named its own reversal
   condition -- "a real dated OI archive appears" -- and it has. **Backtesting the
   OI layers is now available and should be preferred to waiting.**
2. **G2 reads the asymmetry backwards.** Short-gamma days sit at DR ~ 1.02, i.e.
   essentially Brownian. Long-gamma days sit at DR ~ 0.85. The reliable state is
   **"long gamma is quiet"**, not "short gamma is wild". G2 currently treats short
   gamma as the actionable one (-> conservative tier).

**Caveat:** this is a RANGE finding with no directional content. It does not touch
G3, the wall-magnet premise, or the trade/no-trade decision -- G2 has never moved
that. It also does not rescue the 2026-08-22 band-position null, which tested a
different variable at a thirtieth of the power.
**Deviation logged:** the pre-registered positive control was mis-specified (it
tested a signal the DR statistic removes by construction) and was replaced with a
synthetic-injection control, which passes. Recorded in the results file, not
quietly swapped.
**Reverses if:** the untested event-day confound explains it -- negative net GEX
may simply proxy for CPI/FOMC/opex days. Run the event-day exclusion before
building anything on this.

## 2026-07-30 — G2 remapped: GEX picks the TIER, it does not widen the stop

**Decided:** the stop is clamped to COG's observed 0.20–0.48% envelope, and GEX
selects which tier (standard vs conservative) rather than scaling the stop.
**Why:** owner reports he has **never seen COG quote a stop above 0.48%**. Our
first emission produced **1.97%** by scaling the daily range — 4x outside
anything COG has ever emitted, so the mapping was falsified, not mistuned. His
own numbers say what it really is: 0.44/0.21 = 2.1 (one number, halved) and
2.2/0.44 = 5.0 with 1.00/0.21 = 4.76 (leverage ~5x in both). The stop is not a
volatility estimate — it is what falls out of hitting ~5x at the chosen risk,
so Gate 2 is really a **tier decision**. Short gamma means amplified moves,
which argues for *less size*, not a looser stop.
**Caveat:** the 0.20–0.48% clamp is the one number here **fitted to COG rather
than derived**, and it is flagged as such in the code and on every alert that
hits it.
**Reverses if:** a logged COG stop lands outside that envelope — then the clamp
is wrong and the whole tier reading needs revisiting.

## 2026-07-29 — Forward-test, don't backtest

**Decided:** the OI/GEX direction hypothesis is tested by a live shadow record,
not a backtest.
**Why:** `oi_history` is a rolling ~60-day archive, only re-accumulable by
waiting. There is no OI history to test against, and a ~40-trading-day sample
would not settle anything even if there were.
**Reverses if:** a real dated OI archive appears, or vendor history is bought.

## 2026-07-29 — Macro stays in as bias + permission, NOT discarded

**Decided:** three layers with distinct jobs (tide / transmission / magnet)
rather than swapping the macro layer out for OI.
**Why:** COG explicitly stated repo, RRP and central-bank balance sheets. OI is
*our inference* from two matched screenshots — different evidentiary weights,
and I briefly collapsed them. The owner's own read was also that the macro is
directional ("when prices are going to increase"), not merely permissive.
**Reverses if:** the runs test shows direction alternating with no persistence,
which would mean the slow layer contributes nothing to direction.

## 2026-07-29 — QMR is closed

**Decided:** stop work on the price-gate family.
**Why:** falsified — the measured edge was a backtest artifact (free hour through
the NY open). Honest best is Sharpe 0.36 at 46% DD after testing every component.
**Reverses if:** nothing foreseeable. Do not reopen without new evidence.

## 2026-07-29 — Gate 2 (GEX → stop distance) is the first build

**Decided:** build the stop-sizing layer before the direction layer.
**Why:** it targets the exact defect that killed QMR — a stop calibrated to
overnight volatility and then carried through the 08:30 data and the cash open.
GEX is an expected-range estimate, which is precisely what COG's Gate 2 emits
(stop % + risk tier, two tiers exactly 2x apart). It is also testable
independently of whether the direction question ever resolves.
**Reverses if:** GEX-derived ranges turn out uncorrelated with realised daily
range — that is a cheap check and should be run before building on it.
