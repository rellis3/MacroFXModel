# turn-at-lines — do the day's high and low land AT ladder lines more than just beside them?

**Pre-registered 2026-11-19, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `turn-at-lines` (pooled C), per-instrument rows reported |
| Branch | `claude/signal-bot-bias-analysis-bwr1qv` (pushed to main) |
| Register row | `plans/RESEARCH_REGISTER.md` → `turn-at-lines` |
| Instruments / track | NQ, GOLD, EURUSD (the three pilots), OANDA CFD (the rival levels are anchored to OANDA); 6E/GC/NQ futures reported, no rule |
| Lines | the walk-forward ladders from `ladder-v2-*` (each instrument's chosen arm: NQ E6, GOLD HARCJ, EURUSD HARCJ), `test_C.parquet`; and the live estimator's ladder (arm A0, yz_10) as a second line set |
| Window | London sessions 00:00–22:00, test years 2018 → 2026-08-21 |
| Seed / uncertainty | `20261119`; session block bootstrap, block 63, B = 2000 |
| Scripts / outputs | `scripts/turn-at-lines/` → `analysis/output/turn-at-lines/` |

## 1. Why

On 8 owner-supplied screenshot days (2026-11-06 → 18), another trader's nearest line was 2–7× closer to the day's
turn than chance for a line set this dense. Ours sat near chance on gold. Her closest lines were mostly **close-
distribution lines** ("Close median/75th below open") and a **projected low off the day's high**. The question is
whether such lines are genuine turning levels. The days were hand-picked, so they can't answer it; our history can.

## 2. Prior art

- `range-ladder-placebo-confirm` (VALIDATED): Asia-range edge lines **revert** +2.9pp more than a shifted ladder after
  a touch. That's the race after a touch, not where the extreme lands.
- `live-range-line-race` (NULL): racing after touching hourly Live Range lines matches placebo touches.
- `range-edge-limit-fade` (NULL as a trade).
- `exhaustion-v2-*` (VALIDATED): further travel after a touch depends on the clock; nothing about lines attracting
  turns.
- No banked test asks whether the session **high/low lands at** a forecast line.

## 3. The trap this design avoids

A line placed where extremes are naturally most common (near the mode of the high/low distribution) collects
near-hits with no turning-point quality. So the comparison is **local**: the hit rate at the line against the hit
rate at **offset copies of the same line** (±0.15σ and ±0.30σ, in units of the session's daily σ × open). This keeps
the extreme-density roughly matched. A line family beats its neighbours only if turns cluster *at* it.

## 4. Definitions

- **Turns:** the session high H (time t_H) and low L (time t_L), London 00:00–22:00. Highs are scored against up
  lines, lows against down lines.
- **Line families** (σ = the line set's daily σ, O = London-midnight open):
  - **EXT:** OH p50/75/90 (highs) · OL p50/75/90 (lows)
  - **CLOSE:** O·(1 ± oc_p), p50/p75 (her "Close median/75th above/below open")
  - **PROJ:** projected high at the moment of the high, runLow(before t_H)·(1 + hl_p); projected low runHigh(before
    t_L)·(1 − hl_p); p50/p75
  - **ALL:** the union
- **Hit:** |turn − nearest line in the family| ≤ k·σ·O with **k = 0.05** (gold at σ 1.4%/day: about ±2.6 points).
- **Placebo:** the same family with every line moved by +0.15, −0.15, +0.30, −0.30 σ·O; the placebo hit rate is the
  mean over the four.
- **Excess** = hit rate (lines) − hit rate (placebo), in pp, over highs and lows pooled.

## 5. Hypotheses and pass rules

- **PRIMARY:** for CLOSE (her line type) and PROJ, on the chosen-arm lines, pooled over the three instruments: excess
  > 0 with a 90% CI excluding 0, in both halves (2018–22, 2023–26). Benjamini–Hochberg q = 0.10 over the 4 families ×
  2 line sets.
- **VALIDATED** per family if the rule holds. **NULL** if the CI excludes an excess ≥ 1.0pp (about a 10% lift on a
  ~10% base hit rate). **UNDERPOWERED** otherwise.
- **Reported, no rule:**
  - each instrument
  - the live-estimator (A0) lines against the chosen arm's
  - turns in the first 15 minutes (the open is often the extreme) excluded as a sensitivity
  - k = 0.03 and 0.10
  - the futures track
  - the distribution of "nearest line distance ÷ chance" across all sessions, so the 8 screenshot days can be placed
    within our own history

## 6. Power

About 2,200 sessions × 3 instruments × 2 turns ≈ 13,000 turns. At a base hit rate near 10%, the SE of the excess is
≈ 0.35pp before clustering, so 1pp is about 3 SE.

## 7. What each verdict changes

- **VALIDATED (CLOSE or PROJ):** those lines go on the shadow export flagged as turning levels, and the exhaustion
  chart levels use them. It would also mean the rival's line choice carries information our range ladder doesn't.
- **NULL:** turns don't cluster at these lines beyond their neighbours, and the screenshot accuracy is explained by
  line density and day selection. Her forward record (logged from 2026-11-20) remains the head-to-head.
- **UNDERPOWERED:** that forward log decides.

## Variant log

| # | Variant | Added | Status |
|---|---|---|---|
| 1 | Families EXT/CLOSE/PROJ/ALL, k = 0.05, offsets ±0.15/±0.30σ, chosen-arm and A0 lines | 2026-11-19 | registered |

## Amendments

(none)
