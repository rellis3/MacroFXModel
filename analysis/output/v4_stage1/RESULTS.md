# Vote Atlas v4 — EURUSD Stage 1 results

Rule: forge/V4_EURUSD_STAGE1_PREREG.md. Train 2020-09-29→2024-09-27 (4276 touches), test 2024-09-30→2026-09-28 (1967 touches). Net R after cost; return = simple sum at 0.5% risk/trade.

## Baseline (every touch)

| set | trades | win % | net R | t | return |
|---|---|---|---|---|---|
| train · fade all | 4276 | 48.7 | -0.063 | -4.5 | -133.6% |
| train · follow all | 4276 | 50.2 | -0.020 | -1.4 | -42.0% |
| test · fade all | 1967 | 51.8 | -0.019 | -0.9 | -18.9% |
| test · follow all | 1967 | 46.5 | -0.064 | -3.2 | -63.3% |

## 1. Chance benchmark

Buckets selected on TRAIN with real outcomes: **1**. With outcomes shuffled (20 runs): median 0, 95th pct 1, max 1.

## 2. Selected buckets (train) → test

| feature = bucket | dir | train n | train net R | train t | test n | test win % | test net R | test t |
|---|---|---|---|---|---|---|---|---|
| hour = 15 | follow | 298 | +0.202 | +4.4 | 182 | 44.5 | -0.114 | -1.8 |

## 3. Combined rule on TEST

| rule | trades | win % | net R | t | return |
|---|---|---|---|---|---|
| combined (test) | 182 | 44.5 | -0.114 | -1.8 | -10.4% |

**Verdict: FAIL** — combined rule net R -0.114 (t -1.8) on test; 1 buckets selected vs chance 95th pct 1.
