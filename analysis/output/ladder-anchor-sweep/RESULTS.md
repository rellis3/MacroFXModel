# ladder-anchor-sweep — results

Prereg: `forge/LADDER_ANCHOR_SWEEP_PREREG.md` (A1, A2 pre-results; A3 post-hoc demote-only). Seed 20261123.
Futures NQ / GC / 6E / 6J, 24 London anchor hours, 22h window from the anchor, ~15 σ models raced per anchor (walk-forward
QLIKE pick), skill vs a same-anchor 5-day RV baseline. Test 2020 → 2026-08-21. Full grid: `grid.csv`; log: `report.txt`.

**Verdict: UNDERPOWERED.** Pooled confirm-half (2023–26) gain of the anchor chosen on 2020–22 over London 00:00:
**−0.45 pp [−1.27, +1.34]**, 6/12 cells positive (without NQ OH −0.41 [−1.30, +1.54]). No hour beats 00:00 across the board.

## Controls
- Mechanics: A = 00 lines match the existing futures rows on 98.7–100% of sessions. PASS.
- Oracle: HL ≥ +47 pp, OL ≥ +21 pp, OH ≥ +18 pp on GC/6E/6J at every anchor; NQ OH +6 to +13 pp (A3: NQ upside
  semivariance is mostly rebound rallies; flat across anchors).

## Per cell (choose 2020–22 → confirm 2023–26, Δ skill vs 00 in pp; all-years best anchor vs a best-of-24 chance line)

| | A* | confirm Δ [90% CI] | all-years best | above chance |
|---|---|---|---|---|
| NQ HL | 21 | +0.03 [−2.01, +2.01] | 15 +2.35 | none |
| NQ OH | 05 | −0.85 [−1.80, +0.01] | 20 +0.35 | none |
| NQ OL | 20 | +0.16 [−0.80, +1.33] | 10 +1.31 | none |
| GC HL | 13 | −0.46 [−3.68, +2.61] | 11 +4.02 | none |
| GC OH | 08 | +0.53 [−1.10, +1.52] | 10 +2.37 | 08, 09, 10 |
| GC OL | 13 | −0.68 [−1.85, +0.80] | 12 +2.43 | none |
| **6E HL** | **10** | **+5.58 [+1.95, +10.00]** | 10 +5.54 | none (chance 8.6) |
| 6E OH | 08 | −0.98 [−1.62, −0.06] | 11 +2.32 | none |
| **6E OL** | **11** | **+2.59 [+1.46, +4.28]** | 10 +2.74 | **10, 11** |
| 6J HL | 05 | −1.28 [−8.19, +2.53] | 01 +2.99 | none |
| 6J OH | 22 | +0.53 [−0.15, +1.07] | 11 +1.12 | none |
| 6J OL | 04 | −10.58 [−15.20, +4.75] | 06 +1.29 | none |

## Reading
- **London 00:00 is as good as any hour for NQ, and for USDJPY.** NQ's deltas sit within ±2 pp at every hour.
- **EURUSD prefers a London-morning anchor (10:00–11:00).** HL and OL both chose it on 2020–22 and held on 2023–26,
  and OL at 10–11 clears the best-of-24 chance line on all years. A candidate, not a change (pooled verdict governs).
- **Gold OH at 08:00–10:00** clears the chance line on all years but did not confirm on its own (+0.53, CI crosses 0).
- **07:00 specifically:** within ±1 pp of 00:00 on 11 of 12 cells (6E HL −0.0, GC OH +1.9).
- Evening anchors (19:00–23:00) are worst for HL on GC, 6E and 6J (−3 to −10 pp): a day anchored after the US close
  is harder to forecast relative to its baseline.
