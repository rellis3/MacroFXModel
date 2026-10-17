# Harness — Addendum B: Part B result (registry deflation)

*Run 2026-10-17 by `analysis/harness/deflate_registry.mjs` under the method frozen in
`forge/HARNESS_REGISTRY_PREREG.md` Part B. Full table: `analysis/output/harness/REGISTRY_DEFLATION.md`.*

## Result

**4 of 36 validated entries lose status** (prediction: 3 to 8). All four are the yield-spread
family; none of the four fell on multiplicity. The rest of the registry is cleaner than its base
rate suggested.

| entry | why |
|---|---|
| `yield-spread-sleeve` | harness re-run on point-in-time asofs: OOS Sharpe 0.09, PF 1.08, p 0.91 (banked 1.1 / 2.2); DSR 0.20. The banked result reproduces only under the engine's +2-day assumption on GS2, a monthly average FRED first publishes a median 32 days after its date (Addendum A §3) |
| `multi-spread-sleeve` (10Y) | **no lookahead** — reproduces honestly (Sharpe 0.76 vs banked 0.81, 12/12 cells PF > 1, its own Bar A passes) but DSR 0.85 < 0.95 with N = 13 cells, OOS p 0.098, PBO 0.81 across the grid |
| `spread-sleeve-factor-audit` | rests on the two sleeves' return streams (its sanity gate reproduced the sleeve engines on the same inputs) |
| `ys-long-confirm` | honest re-run 2004–2014 (US leg on GS2 vintages, foreign legs on the registered `fixed_lag:45` backcast): Sharpe −0.05, PF 0.94; the same window under the original lags gives PF 1.26 — the banked PF 1.28 was the lookahead |

## The multiplicity correction itself

Family: 68 extractable p-values across 155 entries (21 curated from the validated set, 47
automatic from the rest). **BH-FDR 10% threshold 0.061**; 44 rejected. Every validated entry with
a p passes; restricting the family to the 21 validated p-values alone, every one still passes
(largest 0.05, bar at that rank 0.10). The registry's individual bars were not loose; its one
systematic error was an input that was not knowable, which no multiplicity correction finds and
the point-in-time store found on its first run.

**Not deflatable: 15 of 36.** `event-impact-map`, `tape-speed-persistence`, `execution-gate`,
`reversal-hour`, `first-hour-fraction`, `band-reach-from-here`, `horizon-reversion`,
`combined-range`, `cross-iv`, `us-extras-confirm`, `intraday-range`, `line-touch-reach`,
`iv-ladder-gold`, `iv-ladder`, `ladder-calibration` — descriptive maps, instrument counts
("33/33 better") and calibration misses, with no p or interval ever reported. They keep
`validated` with that label, as the method says. Several are strong (33 of 33 instruments is not
noise) but a count across instruments that share a dollar factor is not a p, and the method did
not convert it. A later pass may add intervals to their docs and re-run; nothing here loosens.

## What changed on the pages

`citable()` now appends one of three things to every validated or formerly-validated tag:
*survives registry FDR 10%*, *not deflatable: no p or interval reported*, or *deflated from
VALIDATED 2026-10-17: why*. Both prompt builders carry it. `use:` text is untouched. The ledger's
validated count on today.html and evidence.html drops from 36 to 32.

## What this says about the live book

The YieldSpread bot is not trading and has not been for some time (owner, 2026-10-17); only the
OI-gamma and vol bots are active. So there is no forward record to set against the honest Sharpe
~0.1, and nothing live depends on this entry. The 10Y sleeve is honest and positive but not
significant on this sample. No live code is changed here.

## Prediction scorecard

- "3 to 8 lose" — **4**, correct.
- "`yield-spread-sleeve` survives comfortably" — **wrong**, and wrong for a reason the prereg did
  not anticipate: not multiplicity but asof.
- "`surprise-size`, `gex-range`, `vix-inversion`, `vol-curve-front`, the calibration entries
  survive" — correct (the calibration entries as not-deflatable).
- "fewer than 3 → bars were already conservative" — nearly the case: on multiplicity alone, zero.
