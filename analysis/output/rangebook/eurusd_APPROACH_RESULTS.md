# EURUSD Approach Book — how price arrives at the line

Rule: forge/APPROACH_BOOK_EURUSD_PREREG.md. 31,024 passes of every line (OH/OL, Close, dynamic Proj H/L). Features from bars before the pass only. Train 2016-03 → 2022-12, test 2023-01 → 2026-08. R net of spread.

## 1. Continue rate by approach, all lines pooled (train → test)

Low / mid / high = the feature's thirds on train. Continue = reaches the next line out before the line behind.

| feature | low | mid | high |
|---|---|---|---|
| move last 5 min | 36% → 37% | 36% → 33% | 41% → 41% |
| move last 15 min | 37% → 37% | 35% → 32% | 41% → 40% |
| move last 60 min | 35% → 33% | 35% → 36% | 43% → 41% |
| acceleration | 37% → 37% | 35% → 33% | 41% → 39% |
| efficiency 15 min | 38% → 39% | 37% → 34% | 37% → 37% |
| efficiency 60 min | 36% → 35% | 36% → 36% | 40% → 38% |
| bar size vs normal | 36% → 33% | 37% → 36% | 40% → 41% |
| WaveTrend 1m | 39% → 39% | 36% → 34% | 38% → 37% |
| WaveTrend 1m slope | 39% → 40% | 37% → 35% | 37% → 35% |
| WaveTrend crossed with the move (against / with) | 39% → 42% | 37% → 35% |  |
| bars since WT cross | 37% → 36% | 38% → 37% | 38% → 37% |
| WaveTrend 15m | 37% → 34% | 36% → 38% | 39% → 38% |
| WaveTrend 1h | 42% → 42% | 36% → 36% | 35% → 31% |
| VuManChu money flow | 38% → 37% | 37% → 37% | 38% → 36% |
| rel. volume 5 min | 35% → 30% | 38% → 37% | 41% → 43% |
| rel. volume 15 min | 35% → 29% | 37% → 37% | 42% → 43% |
| rel. volume 60 min | 34% → 29% | 37% → 38% | 42% → 42% |
| volume rising into line | 38% → 34% | 38% → 37% | 38% → 38% |
| line beyond VWAP | 40% → 35% | 38% → 39% | 36% → 35% |
| mins since previous line | 41% → 39% | 36% → 36% | 36% → 34% |

## 2. Test 1 — each feature alone (pre-registered)

Cells selected on train: **1**. Shuffled outcomes (20 runs): median 0, 95th pct 1, max 1.

| line | feature = third | trade | train net R (t, n) | test net R (t, n) | confirmed? |
|---|---|---|---|---|---|
| OHOL_p90 | WaveTrend 1h = mid | fade | +0.162 (+3.4, 254) | -0.034 (-0.5, 129) | no |

**Test 1 verdict: FAIL** — 0 confirmed vs chance 95th pct 1.

## 3. Test 2 — all features together (walk-forward gradient boosting, 2023–2026)

**2a. Does the approach predict continuation?** Brier skill vs line × pass × London-hour base rates: **+0.0458** (95% +0.0311 to +0.0614) — **informative**.

**2b. Does it pay?** Take whichever of follow / fade the model predicts positive.

| year | passes | taken | win % | net R per trade | t |
|---|---|---|---|---|---|
| 2023 | 2679 | 1727 | 47% | -0.057 | -2.8 |
| 2024 | 2771 | 1282 | 48% | -0.087 | -3.5 |
| 2025 | 2869 | 1733 | 50% | -0.018 | -0.9 |
| 2026 | 1652 | 906 | 50% | -0.016 | -0.6 |
| all | 9971 | 5648 | 48% | -0.045 | -3.9 |

For reference: every pass followed -0.039R, every pass faded -0.042R.

**Test 2b verdict: FAIL** (net R -0.045, t -3.9, n 5648).
