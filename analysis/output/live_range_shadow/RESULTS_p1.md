# LIVE-RANGE-SHADOW — Part 1: calibrated 'this high / low is in' probability

Pre-registration: `forge/LIVE_RANGE_SHADOW_PREREG.md`. Walk-forward: the table is refit every quarter on prior data only; scored 2018-04 → 2026-08, 34 instruments, both sides.

## fx_gold

- Brier skill of the table over the page's hour × used × pace base rate, 2018-04 → 2026-08: **+20.93%** [+20.54%, +21.34%].
- On the last 40% of dates (same rows as the ceiling): table **+20.88%**, geometry GBM ceiling +21.81% → table reaches 96% of the ceiling.
- Reliability, largest decile gap |realised − predicted|: **0.28pp** (smallest decile n 242,931).  → **CALIBRATED SHADOW**

| decile | predicted | realised | n |
|---|---|---|---|
| 1 | 10.6% | 10.5% | 243,243 |
| 2 | 18.7% | 18.6% | 243,173 |
| 3 | 26.5% | 26.4% | 243,192 |
| 4 | 36.2% | 36.1% | 243,229 |
| 5 | 47.3% | 47.3% | 243,453 |
| 6 | 60.8% | 60.5% | 242,931 |
| 7 | 75.3% | 75.4% | 243,266 |
| 8 | 88.8% | 89.1% | 243,205 |
| 9 | 97.0% | 97.2% | 243,153 |
| 10 | 99.6% | 99.7% | 243,175 |

Skill by hours: 02-07: +11.8%, 08-14: +22.9%, 15-21: +29.9%

## indices

- Brier skill of the table over the page's hour × used × pace base rate, 2018-04 → 2026-08: **+18.00%** [+17.36%, +18.64%].
- On the last 40% of dates (same rows as the ceiling): table **+17.97%**, geometry GBM ceiling +18.90% → table reaches 95% of the ceiling.
- Reliability, largest decile gap |realised − predicted|: **1.37pp** (smallest decile n 48,442).  → **CALIBRATED SHADOW**

| decile | predicted | realised | n |
|---|---|---|---|
| 1 | 8.7% | 8.8% | 48,487 |
| 2 | 14.1% | 13.8% | 48,521 |
| 3 | 20.0% | 19.8% | 48,517 |
| 4 | 25.8% | 24.8% | 48,498 |
| 5 | 34.5% | 33.5% | 48,442 |
| 6 | 44.7% | 43.3% | 48,475 |
| 7 | 57.7% | 56.6% | 48,495 |
| 8 | 74.8% | 73.8% | 48,492 |
| 9 | 89.8% | 89.5% | 48,483 |
| 10 | 98.4% | 98.3% | 48,458 |

Skill by hours: 02-07: +6.7%, 08-14: +16.2%, 15-21: +29.6%

## Part 3 — grids refit in the page's own σ (`js/intradayRangeParamsPit.js`)

Written (all-data fit, shadow). Walk-forward evidence already measured in LIVE_RANGE_HISTORY: refit-on-first-60% lines hit p75 / p90 on the last 40% at FX 24.0% / 9.5%, indices 27.6% / 11.2% (targets 25 / 10), versus the shipped params' 21.5% / 8.0% and 24.2% / 9.2%.
Registered check (±1.5pp of 25 / 10): FX p75 ✓ p90 ✓; indices p75 ✗ (+2.6pp, the known tight indices downside), p90 ✓.
