# Cross-pair Range Book — pre-registration

Committed 2026-09-30 before any cross-pair number was computed.

## Why
The EURUSD books found one reliable layer — range, reach and timing probabilities
(forge/RANGE_BOOK_EURUSD_PREREG.md) — and one emerging result: a price+CVOL model forecasts
the upper tail of the day's range better than the lines (forge/EURUSD_MODEL_PREREG.md,
secondary). No line-trading edge survived anywhere, so this step strengthens the range layer
rather than searching for one.

## Instruments (local M1, 2016 → 2026-08, fitted ladder params)
- **USD pairs:** EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, USDCHF, NZDUSD
- **Crosses:** EURGBP, EURJPY, GBPJPY, EURAUD, EURCHF, AUDJPY, CADJPY, CHFJPY
- **Gold**
Each is built with scripts/rangebook/eurusd_build.mjs (same lines, checkpoints, rows and
causality self-check as the EURUSD book). Train 2016 → 2022-12-31, test 2023-01-01 → 2026-08.

## Q1 — Is one book good enough for every pair?
Books A (reach) and C (is the extreme in), base cells exactly as the EURUSD book (A:
checkpoint × line × distance in σ × range used; C: checkpoint × range used × distance to the
extreme). For each pair, on its TEST rows:
- **own** = cells fitted on that pair's own train rows;
- **pooled** = cells fitted on the train rows of the OTHER 15 instruments (leave-one-out).
Brier skill of pooled vs own, 1,000× day bootstrap.
**One book serves all** if the pooled table is no worse than the pair's own: the interval of
(pooled vs own) includes 0 or is above it, on at least 13 of 16 instruments.

## Q2 — Do USD pairs share a book more closely?
For the 7 USD pairs: pooled-from-other-USD-pairs vs pooled-from-all-others (leave-one-out
both), Brier skill with a day bootstrap. **USD grouping helps** if the interval is above 0 on
at least 5 of 7.

## Q3 — Does the big-day forecast hold on pairs it was not found on?
Instruments with CME CVOL history (js/data/cmeCvolEod.json): GBPUSD, AUDUSD, USDCAD, USDCHF,
USDJPY, Gold (XAUUSD). EURUSD is reported but NOT counted (it produced the finding).
Model step exactly as forge/EURUSD_MODEL_PREREG.md section 2: quantile gradient boosting of
log(day range ÷ hl p50) at 0.75 and 0.90, feature sets P and P+IV, walk-forward by year
2023–2026 with a 5-day embargo, fixed settings; each pair's own fitted hl widths.
**Confirmed** if, pooled over the 6 instruments, M3 (P+IV) beats your lines as drawn at 0.90
with the interval above 0 AND M3 beats the lines at 0.90 on at least 4 of 6.
**Implied vol adds** if M3 beats M2 (P only) at 0.90 pooled with the interval above 0.

## Reported regardless
Per instrument: line coverage (p50/p75/p90 hit rates), Book A/C skill vs the unconditional
rate, and the time-of-day continuation profile, so the book can be read pair by pair.
