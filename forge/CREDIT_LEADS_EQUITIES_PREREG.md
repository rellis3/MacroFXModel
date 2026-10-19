# Does credit move before equities? (the plumbing order)

*Pre-registered 2026-10-19, before any cell was run. Runs through `js/harness/runStudy.mjs` on the
point-in-time store. Prompted by a Discord exchange (Garin, 2026-10-19): "Information flows like a
plumbing system — bonds are the reservoir, credit the pumps and pipes, FX the valves, equities the
tap. Credit affects equities a lot; the forecaster trades an asset within this market."*

## Question

When US credit spreads widen, do US equity indices fall — or run wider — **afterwards**, by more
than their own persistence predicts? The chain already shows credit and equities agreeing in the
same window (`hy-nq`, `hy-spx`); this asks about order.

## What the desk already has

- `mv-creditstack-range` (context): the credit stack moving → the next month runs wider, +0.16 ATR
  [0.015, 0.33]. Weak, one window.
- `credit-leadlag.html`: a live job, credit vs Nasdaq *vol*, never banked.
- The dynamic-lead family (`COG_DYNAMIC_LEAD`): rates and yields leading assets — all null — but
  credit was never one of its series.
- Direction prior across the ledger: 53 claims, 47 null.

## Data (from the store, asof close+1h)

- `credit_baa10y − credit_aaa10y` (Moody's quality spread, daily from 2000) — the long leg.
- `credit_baa10y` on its own (Baa over Treasuries) — the level leg.
- `credit_hy_oas` (ICE BofA HY OAS) — the leg the chain displays, but FRED serves only
  2023-10 →, so it is **reported, not scored**.
- `px_d1_nas100`, `px_d1_spx500` — close-to-close.

## Signal (frozen)

z = (spread_t − spread_{t−20}) ÷ sd of 20-session changes over the prior 250 sessions. Decision at
each close. Score for the direction target = −z (widening → short equities); for the vol target = +z.

## Targets (frozen)

- **Direction:** forward log return over h ∈ {1, 5, 20} sessions, pooled over the two indices,
  date-clustered. Expected sign of IC: negative (widening → down).
- **Vol:** forward h-session realised vol (log, close-to-close) minus trailing 20-session realised
  vol — "does credit widening predict vol *beyond* persistence". Expected sign: positive.

## Sample (frozen)

IS 2004-01-01 → 2015-12-31, OOS 2016-01-01 → 2026-10-16 (Moody's legs). HY OAS 2023-12 → 2026-10,
all OOS, descriptive. Universe: NAS100, SPX500 (PC1 share reported; effective N ≈ 1).

## Cells

2 scored spreads × 3 horizons × 2 targets = **12 scored cells** (+ 6 HY OAS cells, descriptive).
BH-FDR 10% across the 12.

## Placebo (void if failed)

The same signal lagged by 60 sessions (credit's change from three months ago). If the lagged
signal shows the same effect, the "effect" is a slow regime, not a lead.

## Bars (frozen)

A cell **passes** iff OOS |IC| has p < 0.05 (date-clustered block bootstrap), survives BH 10%
across the 12, the sign matches the expectation, both OOS halves share the sign, and the placebo
cell for the same spread/horizon/target does not pass.

Verdict: **validated** if ≥ 1 direction cell and ≥ 1 vol cell pass at h ≥ 5; **context** if only
vol cells pass; **null** otherwise.

## Expected outcome, stated before running

Direction: null at every horizon (the ledger's prior and the dynamic-lead result). Vol: a weak
positive at h = 20 on the quality spread, in the neighbourhood of `mv-creditstack-range`, that
may or may not clear FDR. HY OAS: whatever it shows on three years is not evidence either way.

## What changes on the page

Pass: the `hy-nq` / `hy-spx` chain links' holds text gains the lead with its number; the market
view's `hy-spx` row loses "credit usually moves first" as prose and gains it as a tested line.
Null: the holds text says "same window only; credit does not lead at 1–20 sessions (tested
2026-10-19)" and the market-view prose is softened to agreement. Either way one ledger entry.
