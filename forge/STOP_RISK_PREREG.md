# Layer 7 — STOP RISK MAP: how often does a stop fill worse than its price, and by how much?

Part of `plans/FORECASTER_SYSTEM_BLUEPRINT.md`. Written 2026-10-06 before any builder exists. Frozen; changes only by
dated amendment before results.

## Why

Lesson 3: jump risk "passes through stop orders at prices beyond their limits"; a portfolio sized on volatility alone
understates the loss it can suffer in a single step. Every engine in the repo books a stopped trade at exactly −1R
(fill at the stop price); none measures the gap-through. This map measures it, with no strategy and no direction.

## Design

- Data: OANDA M1 mid (`plans/DATA_SPEC.md`), 34 instruments, 2016-05 → 2026-08. σ = the session's HAR-800 daily σ
  (layer 3). No spread: results are the gap component only, and say so.
- Entries: in every London session, 4 random minutes (seeded per instrument-session), each taken **both long and short**
  at that minute's close — direction-agnostic.
- Stop distance d ∈ {0.25, 0.5, 1.0, 1.5, 2.0} × σ × price. The position is held until the stop is hit or 24 hours pass
  (holds can cross the session end and weekends — that is where gaps live).
- Fill: if the bar that first crosses the stop **opens beyond it**, the fill is that bar's open (gap-through);
  otherwise the stop price. Loss in R = (entry − fill) / d for longs (mirror for shorts); a clean stop is exactly 1R.
  M1 bars cannot see inside the minute, so intra-minute slippage on fast moves is not captured — results are a lower
  bound on gap risk.

## Outputs (per stop distance, and by condition)

- P(stop hit within 24 h); P(gap-through | hit); mean, p99 and worst loss in R given hit; expected excess loss
  E[loss − 1R | hit].
- Conditions: class; whether the hold crossed a weekend; whether it crossed the session end; event day (tier1 / high /
  none, calendar proxy); whether the stop was hit in the first 5 minutes of a London hour (scheduled releases land on
  the hour or half hour).

## What counts as material

A cell is **material** if, given a hit, its p99 loss is ≥ 1.25R or its expected excess loss is ≥ 0.05R, with ≥ 200 hits.
Material cells are where a stop cannot be trusted at face value and sizing must assume the larger loss. The map is
descriptive; it feeds the sizing rule (layer 7) as a per-cell "loss given stop" figure.

## Variant log (Lesson 2)

| # | Variant | Added | Status |
|---|---|---|---|
| 1 | as above, hold = 24 h of trading time (Amendment 1) | 2026-10-06 | registered |

## Amendment 1 (2026-10-06, smoke test on 2 instruments, before the full run)

A 24-hour **clock** hold lets a Friday entry expire on Saturday, so no hold reached the Sunday reopen (NQ: 29 weekend
holds in 10 years) — contradicting the design's intent that holds cross weekends. The hold is now **1,440 M1 bars**
(24 hours of trading time): Friday entries run into the next week's open. Nothing else changes.
