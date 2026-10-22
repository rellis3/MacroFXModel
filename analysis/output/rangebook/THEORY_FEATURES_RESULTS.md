# Theory-lab features at the levels — EURUSD

Rule: forge/THEORY_FEATURES_LEVELS_PREREG.md. 31,024 passes of every line; train 2016–2022, test 2023–2026-08. Net R after spread.

## 1. Continue rate by each new feature (train → test)

| feature | low third | mid third | high third |
|---|---|---|---|
| dollar-driven move into the line (60 min) | 38% → 36% | 36% → 35% | 40% → 38% |
| euro-only move into the line (60 min) | 36% → 34% | 35% → 35% | 43% → 42% |
| share of the move that is euro-only | 35% → 37% | 38% → 35% | 39% → 38% |
| variance ratio (trending > 1) | 38% → 36% | 37% → 36% | 38% → 38% |
| jump ratio (spike into the line) | 35% → 31% | 37% → 36% | 41% → 42% |
| options skew toward the line | 37% → 38% | 36% → 38% | 40% → 33% |

## 2. T1 — each new feature alone

Selected on train: **0**; shuffled chance median 0, 95th pct 1.


**T1: FAIL** (0 confirmed vs chance 95th pct 1).

## 3. T2 — on top of the existing approach features (walk-forward 2023–2026)

**T2a (information):** Brier skill of approach + theory features vs approach features alone: **-0.0016** (95% -0.0093 to +0.0055) — adds nothing measurable.

| year | taken | win % | net R | t |
|---|---|---|---|---|
| 2023 | 1724 | 50% | -0.026 | -1.3 |
| 2024 | 1797 | 50% | -0.041 | -2.1 |
| 2025 | 1833 | 50% | -0.008 | -0.4 |
| 2026 | 1051 | 46% | -0.090 | -3.3 |
| all | 6405 | 49% | -0.036 | -3.4 |

**T2b (trading): FAIL** (net R -0.036, t -3.4, n 6405). This is the 12th pre-registered level test on these lines; any pass would need a deflated-Sharpe adjustment before use.
