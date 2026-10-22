# H1 / H4 trend state at the vol lines (Q1) — results

Pre-registration: forge/MACRO_TREND_WEEKDAY_PREREG.md (2479b62), section B. Trend = EMA20/EMA50 structure on completed H1 / H4 bars before the touch. "With" = the touch heads the way of the trend (an up line in an uptrend); "against" = a counter-trend touch, so fading it is the with-trend pullback entry. Within-cell continue differences, day-bootstrap 95% CI. R net of spread.

## H4 trend

| set | with − against [95% CI] | 2016–22 | 2023–26 | n (with / against / neutral) | REAL? |
|---|---|---|---|---|---|
| 16 FX + gold | -2.3pp [-3.1pp, -1.5pp] | -2.5pp | -2.1pp | 243,094 / 120,437 / 163,039 | **yes** |
| 6 indices | -2.6pp [-4.1pp, -1.2pp] | -1.7pp | -4.4pp | 64,245 / 38,638 / 46,545 | **yes** |

| set | group | passes | continue | follow R (halves) | fade R (halves) |
|---|---|---|---|---|---|
| 16 FX + gold | with the trend | 243,094 | 36% | -0.060 (-0.061 / -0.057) | -0.062 (-0.059 / -0.069) |
| 16 FX + gold | neutral | 163,039 | 36% | -0.060 (-0.053 / -0.075) | -0.062 (-0.071 / -0.044) |
| 16 FX + gold | against the trend (fade = with-trend pullback) | 120,437 | 41% | -0.041 (-0.041 / -0.042) | -0.081 (-0.081 / -0.081) |
| 6 indices | with the trend | 64,245 | 37% | -0.021 (-0.021 / -0.020) | -0.034 (-0.031 / -0.038) |
| 6 indices | neutral | 46,545 | 37% | -0.022 (-0.027 / -0.015) | -0.035 (-0.032 / -0.040) |
| 6 indices | against the trend (fade = with-trend pullback) | 38,638 | 42% | -0.010 (-0.025 / +0.014) | -0.046 (-0.028 / -0.075) |

## H1 trend

| set | with − against [95% CI] | 2016–22 | 2023–26 | n (with / against / neutral) | REAL? |
|---|---|---|---|---|---|
| 16 FX + gold | -5.8pp [-7.0pp, -4.6pp] | -5.9pp | -5.6pp | 323,428 / 35,707 / 167,435 | **yes** |
| 6 indices | -6.6pp [-8.5pp, -4.8pp] | -4.9pp | -9.7pp | 85,141 / 14,362 / 49,925 | **yes** |

| set | group | passes | continue | follow R (halves) | fade R (halves) |
|---|---|---|---|---|---|
| 16 FX + gold | with the trend | 323,428 | 35% | -0.058 (-0.057 / -0.061) | -0.064 (-0.064 / -0.063) |
| 16 FX + gold | neutral | 167,435 | 38% | -0.055 (-0.052 / -0.061) | -0.067 (-0.069 / -0.061) |
| 16 FX + gold | against the trend (fade = with-trend pullback) | 35,707 | 46% | -0.033 (-0.031 / -0.038) | -0.089 (-0.091 / -0.087) |
| 6 indices | with the trend | 85,141 | 37% | -0.024 (-0.028 / -0.020) | -0.031 (-0.027 / -0.037) |
| 6 indices | neutral | 49,925 | 38% | -0.018 (-0.027 / -0.007) | -0.036 (-0.025 / -0.051) |
| 6 indices | against the trend (fade = with-trend pullback) | 14,362 | 48% | +0.020 (+0.007 / +0.040) | -0.082 (-0.067 / -0.106) |

T2: BH 10% over 8 rows, 0 survive; also positive in both halves: none.

## Reading (incl. post-hoc side split)
- **The hypothesis is reversed.** A touch heading AGAINST the H1/H4 trend continues MORE than one heading with it (H1: 46%
  vs 35% on FX/gold, 48% vs 37% on indices; +5.8pp / +6.6pp, both halves, both sets). "Fade the counter-trend touch as a
  with-trend pullback" is therefore the WORST fade in the book (−0.089R FX, −0.082R indices). When price pushes against the
  intraday trend hard enough to reach a vol line, it tends to keep going.
- The one positive cell (indices, follow a counter-H1-trend touch, +0.020R) is long drift: longs +0.035R, shorts −0.004R.
  Not an edge. 0 of 8 T2 rows survive.
- This is the largest single price-based conditional found so far (bigger than the hot-ATR +6pp); it goes into the book as
  a column. It still pays nothing after spread.
