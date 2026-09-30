# EURUSD Sequence Book — every pass at the lines

Rule: forge/SEQUENCE_BOOK_EURUSD_PREREG.md. 31,024 passes (same-bar excluded); a line re-arms after a close 0.1σ back inside. Train 2016-03 → 2022-12, test 2023-01 → 2026-08. R net of spread.

## 1. First pass vs later passes

| line | pass | period | passes | continue | fade | neither | break-even | follow R | fade R |
|---|---|---|---|---|---|---|---|---|---|
| OHOL_p50 | 1 | train | 1775 | 46% | 33% | 21% | 56% | -0.030 | -0.045 |
| OHOL_p50 | 1 | test | 887 | 45% | 31% | 24% | 56% | -0.005 | -0.074 |
| OHOL_p50 | 2 | train | 1297 | 41% | 32% | 27% | 56% | -0.057 | -0.012 |
| OHOL_p50 | 2 | test | 645 | 44% | 27% | 29% | 56% | +0.016 | -0.103 |
| OHOL_p50 | 3+ | train | 2388 | 37% | 27% | 36% | 56% | -0.044 | -0.029 |
| OHOL_p50 | 3+ | test | 1117 | 36% | 24% | 40% | 56% | -0.024 | -0.053 |
| OHOL_p75 | 1 | train | 887 | 36% | 37% | 27% | 47% | -0.005 | -0.069 |
| OHOL_p75 | 1 | test | 442 | 30% | 45% | 25% | 47% | -0.138 | +0.042 |
| OHOL_p75 | 2 | train | 642 | 32% | 35% | 33% | 47% | -0.016 | -0.060 |
| OHOL_p75 | 2 | test | 315 | 28% | 41% | 31% | 47% | -0.120 | +0.024 |
| OHOL_p75 | 3+ | train | 1016 | 28% | 26% | 46% | 47% | +0.032 | -0.103 |
| OHOL_p75 | 3+ | test | 478 | 24% | 34% | 43% | 47% | -0.115 | +0.023 |
| OHOL_p90 | 1 | train | 373 | 31% | 32% | 36% | 50% | -0.070 | -0.008 |
| OHOL_p90 | 1 | test | 168 | 32% | 27% | 42% | 50% | -0.007 | -0.070 |
| OHOL_p90 | 2 | train | 253 | 26% | 32% | 43% | 50% | -0.120 | +0.044 |
| OHOL_p90 | 2 | test | 105 | 25% | 30% | 46% | 50% | -0.122 | +0.044 |
| OHOL_p90 | 3+ | train | 413 | 23% | 26% | 51% | 50% | -0.104 | +0.027 |
| OHOL_p90 | 3+ | test | 147 | 29% | 18% | 54% | 50% | +0.046 | -0.127 |
| Close_p50 | 1 | train | 1748 | 45% | 33% | 22% | 56% | -0.026 | -0.048 |
| Close_p50 | 1 | test | 876 | 44% | 31% | 25% | 55% | -0.012 | -0.067 |
| Close_p50 | 2 | train | 1298 | 39% | 33% | 28% | 56% | -0.073 | +0.012 |
| Close_p50 | 2 | test | 654 | 41% | 27% | 32% | 56% | -0.000 | -0.083 |
| Close_p50 | 3+ | train | 2349 | 37% | 26% | 38% | 56% | -0.037 | -0.036 |
| Close_p50 | 3+ | test | 1118 | 35% | 23% | 43% | 56% | -0.010 | -0.071 |
| Close_p75 | 1 | train | 864 | 39% | 35% | 27% | 50% | -0.012 | -0.069 |
| Close_p75 | 1 | test | 421 | 33% | 42% | 24% | 50% | -0.126 | +0.043 |
| Close_p75 | 2 | train | 624 | 37% | 32% | 31% | 50% | -0.003 | -0.079 |
| Close_p75 | 2 | test | 293 | 31% | 39% | 30% | 50% | -0.130 | +0.047 |
| Close_p75 | 3+ | train | 941 | 31% | 27% | 42% | 50% | +0.006 | -0.090 |
| Close_p75 | 3+ | test | 444 | 27% | 30% | 42% | 50% | -0.075 | -0.007 |
| Proj_p50 | 1 | train | 1027 | 45% | 20% | 35% | 62% | -0.002 | -0.089 |
| Proj_p50 | 1 | test | 493 | 40% | 23% | 37% | 62% | -0.067 | +0.012 |
| Proj_p50 | 2 | train | 714 | 43% | 18% | 38% | 62% | +0.002 | -0.097 |
| Proj_p50 | 2 | test | 337 | 41% | 21% | 38% | 62% | -0.046 | -0.022 |
| Proj_p50 | 3+ | train | 1103 | 41% | 17% | 42% | 62% | -0.004 | -0.087 |
| Proj_p50 | 3+ | test | 480 | 39% | 14% | 47% | 62% | +0.001 | -0.095 |
| Proj_p75 | 1 | train | 490 | 31% | 39% | 30% | 47% | -0.104 | +0.009 |
| Proj_p75 | 1 | test | 221 | 36% | 36% | 28% | 47% | +0.015 | -0.097 |
| Proj_p75 | 2 | train | 339 | 31% | 34% | 35% | 47% | -0.056 | -0.031 |
| Proj_p75 | 2 | test | 143 | 31% | 40% | 29% | 47% | -0.089 | -0.005 |
| Proj_p75 | 3+ | train | 512 | 23% | 32% | 45% | 47% | -0.134 | +0.034 |
| Proj_p75 | 3+ | test | 187 | 29% | 29% | 41% | 47% | -0.037 | -0.051 |

## 2. Pullback before a later pass, and the previous overshoot (σ; median / 90th, train | test)

| line | pullback before pass 2 | overshoot of pass 1 before it re-armed |
|---|---|---|
| OHOL_p50 | 0.20 / 0.51 \| 0.22 / 0.55 | 0.09 / 0.41 \| 0.08 / 0.41 |
| OHOL_p75 | 0.22 / 0.54 \| 0.21 / 0.57 | 0.09 / 0.40 \| 0.11 / 0.40 |
| OHOL_p90 | 0.21 / 0.45 \| 0.20 / 0.45 | 0.09 / 0.36 \| 0.10 / 0.36 |
| Close_p50 | 0.21 / 0.51 \| 0.22 / 0.56 | 0.09 / 0.42 \| 0.08 / 0.40 |
| Close_p75 | 0.21 / 0.50 \| 0.21 / 0.55 | 0.09 / 0.39 \| 0.10 / 0.42 |
| Proj_p50 | 0.22 / 0.54 \| 0.24 / 0.53 | 0.09 / 0.37 \| 0.08 / 0.40 |
| Proj_p75 | 0.22 / 0.55 \| 0.20 / 0.49 | 0.10 / 0.43 \| 0.10 / 0.47 |

## 3. The 75th line: first reached in which session → continues to the 90th / fades to the median on that pass

| session first reached | days train / test | continue | fade | neither |
|---|---|---|---|---|
| Asia | 28 / 15 | 50% → 40% | 50% → 60% | 0% → 0% |
| London | 311 / 141 | 49% → 37% | 43% → 55% | 8% → 9% |
| NY | 418 / 222 | 30% → 27% | 40% → 45% | 30% → 28% |
| Late | 130 / 64 | 20% → 20% | 12% → 22% | 68% → 58% |

## 4. Question 1 — does any pass × session cell pay? (pre-registered)

Cells selected on train: **0**. Shuffled outcomes (20 runs): median 0, 95th pct 1, max 1.


**Question 1 verdict: FAIL** — 0 confirmed vs chance 95th pct 1.

## 5. Question 2 — does the path so far sharpen the reach odds? (pre-registered)

Range-book reach rows at 07/10/13/16 London: train 76,803, test 42,769. Base = checkpoint × line × distance × range used. Skill = Brier improvement on test over the base; 95% day-bootstrap interval.

| path variable added | test skill vs base | 95% interval | informative? |
|---|---|---|---|
| top | -0.0006 | -0.0022 to +0.0010 | no |
| when | -0.0001 | -0.0016 to +0.0016 | no |
| passes | -0.0007 | -0.0026 to +0.0011 | no |
| top + when + passes | -0.0010 | -0.0030 to +0.0010 | no |

**Question 2 verdict: no path variable adds skill**

### Reach the OH/OL 75th line from 10:00, by what that side has done so far (train → test)

| side so far | first reached p50 in | chance of reaching its 75th today | n test |
|---|---|---|---|
| nothing yet | – | 16% → 16% | 1462 |
| reached its median | Asia | 38% → 33% | 93 |
| reached its median | London | 50% → 52% | 231 |
