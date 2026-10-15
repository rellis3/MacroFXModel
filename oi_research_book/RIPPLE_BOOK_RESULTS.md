# Results — ripple book test (prereg: RIPPLE_BOOK_PREREG.md, 2026-10-15)

NQ only, window 2020-09-04 → 2026-08-21 (lockbox respected). Scripts 22 (surfaces), 23 (range), 24 (walls).

## Range test — primary: UNJUDGEABLE
The primary needs days where S0…S4 all exist. Only **94 of 783 days** have any ≤3-DTE contract: the Databento NQ archive holds the monthly/quarterly
expiries but not the weekly/daily ones the bots trade. Gate 4 (<400 common days) → no verdict on S4 vs the short books (S1/S2). The placebo gate also
failed on that 94-day sample. This is a data limitation, not a finding.

## Range test — exploratory (not the prereg verdict): S0 / S3 / S4 on 782 days
| surface | ΔDR vol-matched |
|---|---|
| S0 day book (shortest expiry) | +0.321 |
| S3 ≤45 DTE | +0.321 |
| S4 all expiries (ripple) | +0.299 |

S4 − S0 = −0.022, 95% CI [−0.070, +0.016]. Gates pass, positive in every judged year. **Reading: the full ripple book reads next-day range about as well
as the shorter book on NQ; it is not shown to be better.** (S0 here is the shortest *archived* expiry, so it is not the same as the bots' real day book.)

## Wall test (second prereg test): FAIL — null
Ripple walls (largest |gamma| strike each side, S4) vs grid neighbours ±1/±2 steps, T-1 lag, cluster bootstrap over ISO weeks.
Addition recorded before reading the result: levels shifted by the daily futures–CFD basis (put-call parity; median +33.5 pts, IQR −6 to +84).

| side | h | wall break % | grid break % | diff pp | 95% CI |
|---|---|---|---|---|---|
| call | 15m | 47.6 | 48.0 | −0.4 | [−3.1, +2.4] |
| call | 60m | 51.5 | 50.2 | +1.4 | [−2.4, +5.4] |
| call | 240m | 52.9 | 53.6 | −0.8 | [−7.0, +5.2] |
| put | 15m | 47.1 | 45.4 | +1.7 | [−1.2, +4.6] |
| put | 60m | 46.4 | 46.5 | −0.1 | [−4.5, +4.5] |
| put | 240m | 46.8 | 46.7 | +0.1 | [−5.6, +5.7] |

Ripple walls react like any listed strike. W_oi (≤3 DTE) was not testable (94 days). Same conclusion as the OI-wall placebo.

## What this implies
- Ripple is supported as a **measurement** (long gamma = quiet range on NQ), not as a better one than the short book, and not as a source of tradeable levels.
- Nothing here justifies wiring a ripple book into a bot. The 3-way comparison needs our own nightly capture (it includes weeklies/dailies) — judgeable at ≥400 days.
