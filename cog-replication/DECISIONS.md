# Decision log

Newest first. Every entry: what was decided, why, and what would reverse it.

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
