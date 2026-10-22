# Confirmed break on the Close median — confirmation on unseen indices

Rule: forge/CONFIRMED_BREAK_INDICES_PREREG.md. After the first Close-median touch, a push of 0.25× the Close-median distance beyond the line (before a 0.25× pullback) → follow from the push level to Close p75, stop at the pullback level. Net of spread, R = stop distance.

| instrument | set | period | touches | push first → reach p75 | pull first → reach p75 | trades | win % | break-even | net R | t | net R 2016–22 / 2023–26 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SPX | confirmation | 2021-08 → 2026-06 | 1212 | 58% (650) | 43% (541) | 650 | 47% | 46% | -0.025 | -0.6 | -0.028 / -0.024 |
| DOW | confirmation | 2021-08 → 2026-06 | 1254 | 66% (613) | 39% (622) | 613 | 50% | 50% | -0.035 | -0.9 | -0.048 / -0.030 |
| US2000 | confirmation | 2016-03 → 2026-08 | 2606 | 65% (1308) | 38% (1255) | 1308 | 52% | 50% | +0.003 | 0.1 | +0.015 / -0.020 |
| DE30 | confirmation | 2016-03 → 2026-08 | 2592 | 64% (1298) | 38% (1256) | 1298 | 51% | 48% | +0.023 | 0.8 | +0.016 / +0.037 |
| UK100 | confirmation | 2016-03 → 2026-08 | 2700 | 65% (1377) | 40% (1291) | 1377 | 50% | 48% | -0.041 | -1.5 | -0.023 / -0.077 |
| NQ | seen (not counted) | 2016-03 → 2026-08 | 2576 | 62% (1322) | 35% (1205) | 1322 | 52% | 47% | +0.060 | 2.1 | +0.061 / +0.059 |
| EURUSD | seen (not counted) | 2016-03 → 2026-08 | 2624 | 63% (1249) | 37% (1349) | 1249 | 50% | 48% | -0.003 | -0.1 | -0.020 / +0.033 |
| GOLD | seen (not counted) | 2016-03 → 2026-08 | 2726 | 61% (1327) | 37% (1378) | 1327 | 47% | 45% | -0.046 | -1.6 | -0.063 / -0.017 |

Pooled confirmation set: **-0.012R** (t -0.8, n 5246); positive on 2 of 5.
- SPX + DOW (tied to NQ): -0.030R (t -1.1, n 1263)
- US2000 + DE30 + UK100: -0.006R (t -0.4, n 3983)

**Verdict: FAIL**
