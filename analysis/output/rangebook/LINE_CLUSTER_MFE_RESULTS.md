# Forecast-line clusters and fade MFE / MAE — results

Pre-registration: forge/LINE_CLUSTER_MFE_PREREG.md (883fa17). Cluster = other export lines within 0.05σ of the touched line, priced before the touch. Fade = entry at the line on the touch bar. σ = the day's forecast σ (EURUSD ≈ 45 pips).

## T1 / T2 — do clusters fade more?

| set | group | touches | continue | fade | fade R (halves) | vs lone: continue [95% CI] | 2016–22 | 2023–26 | REAL? |
|---|---|---|---|---|---|---|---|---|---|
| 16 FX + gold | lone | 131,052 | 35% | 28% | -0.064 (-0.066 / -0.060) | – | | | |
| 16 FX + gold | pair | 365,944 | 38% | 31% | -0.067 (-0.067 / -0.066) | -0.5pp [-1.5pp, +0.7pp] | +0.0pp | -1.7pp | no |
| 16 FX + gold | cluster | 29,574 | 33% | 27% | -0.073 (-0.080 / -0.059) | +0.1pp [-1.5pp, +1.7pp] | +0.8pp | -1.7pp | no |
| 6 indices | lone | 46,560 | 37% | 31% | -0.034 (-0.028 / -0.044) | – | | | |
| 6 indices | pair | 95,186 | 39% | 32% | -0.043 (-0.036 / -0.053) | -0.2pp [-1.8pp, +1.4pp] | -0.3pp | -0.4pp | no |
| 6 indices | cluster | 7,682 | 34% | 32% | +0.009 (+0.022 / -0.008) | -1.8pp [-4.7pp, +1.2pp] | -1.7pp | -2.3pp | no |

T2 fade R: BH 10% over 4 rows, 0 survive; positive in both halves too: none.

## T3 — how far price moves after a touch (fade perspective)

### 16 FX + gold, all touches (σ)

| horizon | median MFE (back inside) | 75th MFE | median MAE (beyond) | 75th MAE |
|---|---|---|---|---|
| 15 min | 0.10 σ | 0.17 | 0.09 | 0.17 |
| 30 min | 0.13 σ | 0.23 | 0.12 | 0.23 |
| 60 min | 0.17 σ | 0.31 | 0.16 | 0.32 |
| 120 min | 0.23 σ | 0.41 | 0.22 | 0.42 |
| Day | 0.39 σ | 0.75 | 0.38 | 0.78 |

### EURUSD alone, in pips

| horizon | median MFE (back inside) | 75th MFE | median MAE (beyond) | 75th MAE |
|---|---|---|---|---|
| 15 min | 4.88 pips | 8.18 | 4.16 | 8.18 |
| 30 min | 6.28 pips | 10.85 | 5.74 | 11.08 |
| 60 min | 8.23 pips | 14.47 | 7.73 | 14.92 |
| 120 min | 10.76 pips | 19.40 | 10.58 | 20.12 |
| Day | 17.00 pips | 32.96 | 17.23 | 33.51 |

### Fade with a stop beyond the line: how far it comes back BEFORE the stop is hit (16 FX + gold)

| stop | stopped out | median MFE before stop | share reaching 0.1σ / 0.2σ / 0.3σ / 0.5σ back before the stop |
|---|---|---|---|
| 0.1σ | 83% | 0.12σ | 55% / 33% / 24% / 14% |
| 0.2σ | 69% | 0.19σ | 70% / 49% / 36% / 22% |
| 0.3σ | 58% | 0.25σ | 77% / 57% / 44% / 28% |

### Fixed target t / stop s fade, net of spread (16 FX + gold; mean R; cells positive in both halves marked ✓)

Target hit = MFE-before-stop ≥ t; stopped = stop hit before the target; neither = exit at day end (counted at 0 R before cost, a conservative simplification).

| stop \ target | 0.1σ | 0.2σ | 0.3σ | 0.4σ | 0.6σ |
|---|---|---|---|---|---|
| 0.1σ | -0.220 | -0.292 | -0.337 | -0.383 | -0.471 |
| 0.2σ | -0.089 | -0.131 | -0.163 | -0.198 | -0.272 |
| 0.3σ | -0.049 | -0.075 | -0.098 | -0.125 | -0.187 |

### By group and session (16 FX + gold): median MFE-before-0.2σ-stop, and the share stopped

| group | Asia | London | NY | Late |
|---|---|---|---|---|
| lone | 0.23σ (88% stopped) | 0.20σ (82% stopped) | 0.21σ (72% stopped) | 0.17σ (45% stopped) |
| pair | 0.21σ (84% stopped) | 0.20σ (80% stopped) | 0.20σ (70% stopped) | 0.16σ (42% stopped) |
| cluster | 0.27σ (87% stopped) | 0.20σ (83% stopped) | 0.20σ (72% stopped) | 0.17σ (45% stopped) |

## Reading
- **Clusters of the forecast lines do not fade more.** 3+ lines within 0.05σ fade 27% vs 28% for a lone line (FX/gold),
  within-cell +0.1pp [−1.5, +1.7]; indices −1.8pp [−4.7, +1.2]. 74% of touches already have a second line within 0.05σ (OH and
  Close lines usually sit together), so "lines stacked together" is the normal case, not a special one.
- **MFE and MAE are symmetric at every horizon.** EURUSD, median after a touch: 4.9 pips back vs 4.2 beyond in 15 min; 8.2 vs 7.7
  in an hour; 17.0 vs 17.2 by day end. Every touch produces a fade of a few pips AND an overshoot of the same size — which is why
  fades are easy to see on a chart: they are always there. So are the overshoots that would have stopped the fade out first.
- **What a fader actually banks:** with a 0.2σ stop (≈ 9 pips EURUSD), half the fades reach 0.2σ back before the stop; with a
  0.1σ stop, 55% reach 0.1σ. That is a coin flip at 1:1, and after spread every target/stop cell in the grid loses
  (−0.05R at best, 0.3σ stop / 0.1σ target).
- The one non-negative cell (indices, 3+ cluster, fade +0.009R) is zero.
