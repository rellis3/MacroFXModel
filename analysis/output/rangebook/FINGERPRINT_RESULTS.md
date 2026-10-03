# Continue vs fade fingerprint — 16 FX/gold

350,250 touches that resolved (continue = reached the next line out first: 55%; fade = reached the line behind first). Signs are oriented to the touch: + = toward the line / with the touch. AUC = chance a random continuing touch has a higher value than a random fading one (0.50 = the feature cannot tell them apart; 0.60 would be a strong single feature).

| feature | median when it CONTINUED | median when it FADED | AUC | 2016–22 | 2023–26 |
|---|---|---|---|---|---|
| day's range already used | 0.889 | 0.913 | 0.480 | 0.481 | 0.478 |
| line distance from VWAP (σ) | 0.483 | 0.504 | 0.480 | 0.482 | 0.478 |
| WaveTrend 1h (9/12/3) | 43.8 | 45.8 | 0.482 | 0.481 | 0.484 |
| WaveTrend 1h | 31.3 | 33.4 | 0.484 | 0.483 | 0.487 |
| WaveTrend 15m | 40.4 | 41.8 | 0.486 | 0.487 | 0.483 |
| M15 ATR vs usual | 1.09 | 1.1 | 0.488 | 0.488 | 0.488 |
| rate of change, 4 hours (σ) | 0.475 | 0.493 | 0.488 | 0.490 | 0.484 |
| WaveTrend 15m (9/12/3) | 47 | 48.3 | 0.490 | 0.491 | 0.488 |
| volume, last 60 min vs usual | 1.14 | 1.15 | 0.491 | 0.489 | 0.495 |
| H4 trend vs the touch | 0 | 0 | 0.491 | 0.490 | 0.494 |
| minutes since the previous touch | 32 | 30 | 0.508 | 0.508 | 0.509 |
| H1 trend vs the touch (+1 with, −1 against) | 1 | 1 | 0.492 | 0.491 | 0.494 |
| volume, last 15 min vs usual | 1.17 | 1.19 | 0.492 | 0.490 | 0.498 |
| volume, last 5 min vs usual | 1.19 | 1.21 | 0.493 | 0.490 | 0.499 |
| move, last 60 min (σ) | 0.21 | 0.216 | 0.495 | 0.496 | 0.494 |
| bar size, last 5 vs last 60 min | 1.05 | 1.06 | 0.496 | 0.495 | 0.497 |
| move, last 15 min (σ) | 0.104 | 0.107 | 0.496 | 0.496 | 0.497 |
| move into the line, last 5 min (σ) | 0.0691 | 0.0703 | 0.496 | 0.496 | 0.496 |
| biggest bar last 15 min vs median | 2.28 | 2.29 | 0.497 | 0.496 | 0.498 |
| time of day (London minutes) | 723 | 723 | 0.503 | 0.500 | 0.509 |
| line position in VWAP σ-bands | 1.81 | 1.82 | 0.497 | 0.498 | 0.496 |
| WaveTrend 1m slope | 11.4 | 11.3 | 0.502 | 0.501 | 0.504 |
| touch number on this line today | 2 | 2 | 0.502 | 0.502 | 0.503 |
| acceleration (5-min vs 15-min pace) | 0.0352 | 0.036 | 0.498 | 0.499 | 0.497 |
| WaveTrend divergence at the touch (M5) | 0 | 0 | 0.499 | 0.498 | 0.502 |
| VuManChu money flow | 7.22 | 7.19 | 0.501 | 0.503 | 0.496 |
| WaveTrend 1m (toward the line +) | 35.6 | 35.6 | 0.501 | 0.502 | 0.499 |
| volume rising into the line (5 vs 60) | 1.03 | 1.03 | 0.499 | 0.498 | 0.503 |
| efficiency, 60 min | 0.152 | 0.153 | 0.500 | 0.501 | 0.499 |
| efficiency, 15 min (1 = straight line) | 0.302 | 0.302 | 0.500 | 0.498 | 0.504 |

## Reading
Touches that continued and touches that faded look the same on every feature: the medians differ in the second or third
digit and every AUC sits between 0.48 and 0.51 (0.50 = no separation), identically in both halves. The few-point effects found
earlier (within-cell continue rates, stalls included) are real but tiny when set against the cont-vs-fade question directly.
TWAP and 5-minute swing fibs are not in this table yet.
