# LIVE-RANGE-FEATURES: do price-action and IV features make the moving exhaustion line smarter than the clock?

*Pre-registered 2026-10-07, before any result. Follows `LIVE_RANGE_CLOCK_BASELINE_PREREG.md` (the 3×3 range-used × pace model adds only
1-1.5% over the clock of the day). Owner asks about the families of checks a line is usually tested against: VWAP, timing, rate of change,
WaveTrend, momentum, etc. **No Vote Atlas input:** every feature below is computed fresh from the local M1 (5-minute bars) in the
page's own σ units; no Vote Atlas file, weight, list or result is read. Research only.*

## Data
Same 34 instruments, London sessions, page σ (`pit_sig_daily`), checkpoints h = 01..21, bars strictly before h. Train = first 60% of dates per
class (fitted on train only), test = last 40%. Targets, per (instrument, session, h):
- **R** = remaining range = (final high − running high) + (running low − final low), in σ·open.
- **Extreme-in (exhaustion), secondary:** UP-in = 1 if final high − running high ≤ 0.05σ (no new high of consequence later); DOWN-in likewise.

## Features (all causal at h; unit-free or in σ)
| family | features |
|---|---|
| VWAP | \|session VWAP distance\| (price − VWAP, σ; tick-volume weighted) |
| rate of change | \|1-hour ROC\|, \|3-hour ROC\|, acceleration (last 30 min move − previous 30 min move, abs) |
| WaveTrend (LazyBear 10/21 on HLC3, 5-min) | \|WT1\|, \|WT1 − WT2\| |
| momentum | \|RSI(14, 5-min) − 50\| |
| timing | weekday; age of the running extreme (hours since the later of the high/low was set); position in the day's range (price − low)/(high − low) |
| volume | last-hour tick volume ÷ the trailing-20-session median for the same hour (causal) |
| implied vol (7 instruments only: EURUSD, GBPUSD, AUDUSD, USDCAD, USDCHF, USDJPY, GOLD via CME CVOL) | IV ÷ σ = CVOL ÷ √252 ÷ page σ, last settle strictly before the session |

## Tests
**T1 single feature on R.** Arms: B = hour × 3×3 (the page) vs B+f = B × feature terciles (train edges; weekday as 5 levels), MIN_CELL 30
falls back to the B cell. Pinball (q 0.5/0.75/0.9) on R, median B+f ÷ B across a class's instruments per checkpoint. **A feature adds
information** in a class if B+f beats B (median ratio < 0.99, better on ≥ 60% of instruments) at ≥ 14 of 21 checkpoints. IV ÷ σ is tested on
its 7 instruments only (same rule, ≥ 14 of 21).
**T2 combined model on R.** HistGradientBoosting quantile regression (all features + hour + range used + pace; one model per class and q,
fitted on train) vs B and vs C (clock only): median ratio per checkpoint, same pass rule vs B.
**T3 extreme-in (the exhaustion outcome).** HistGradientBoosting classifier (side-oriented features + hour + used + pace) vs the train
frequency by hour × 3×3: Brier skill with a date-block 95% interval; **PASS** if the lower bound > 0 in both classes and skill ≥ 1%.
**Search breadth** is reported (features × classes tested); with ~11 features a lone pass is read against that.

## Verdict wording
- "**The line can tell a spent move from a live one**" only if some feature (or T2) passes T1/T2 AND T3 passes in the same class.
- If only R improves: "sharper size forecast, no exhaustion call". If neither: "the moving line is a clock, features included".

## Variant log
| # | Variant | Added | Status |
|---|---|---|---|
| 1 | as above | 2026-10-07 | pending |

Output `analysis/output/live_range_features/RESULTS.md`; banked in `js/deskEvidence.js`.
