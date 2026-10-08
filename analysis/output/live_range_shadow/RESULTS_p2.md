# LIVE-RANGE-SHADOW — Part 2: line state on the rich-IV break

Pre-registration: `forge/LIVE_RANGE_SHADOW_PREREG.md`. Primary = the existing rich-IV break trades (7 CVOL instruments, rich = CVOL÷RV20 top third, edge 1.269 from 2016-22). All years 2016-26: 5,604 rich trades, mean net R +0.118 (published +0.118R).

Rich trades from 2018-04 with a moving-line state at the signal hour (signal after 01:00 London): **4,633** of 4,806; mean net R +0.123.

## P2a — room to the moving p75 line at entry (σ), terciles from the first half of dates

Edges: 0.39σ / 0.54σ.

| group | trades | mean net R [95%] | first half | second half |
|---|---|---|---|---|
| most room (top third) | 1,632 | +0.048 [-0.137, +0.229] | +0.096 | +0.006 |
| middle | 1,515 | +0.182 [+0.008, +0.356] | +0.070 | +0.296 |
| least room (bottom third) | 1,486 | +0.145 [-0.059, +0.342] | +0.110 | +0.183 |
| all rich trades | 4,633 | +0.123 [-0.018, +0.256] | +0.092 | +0.154 |

Most room minus least room: **-0.096R** [-0.359, +0.144], halves -0.013 / -0.177 → **no improvement** the primary.

Other single cuts (descriptive; each is one more look): hour of day and range used.

| cut | group | trades | mean net R [95%] |
|---|---|---|---|
| hour | low (edges 5.0, 8.0) | 1,514 | +0.065 [-0.124, +0.248] |
| hour | mid (edges 5.0, 8.0) | 1,309 | +0.303 [+0.094, +0.506] |
| hour | high (edges 5.0, 8.0) | 1,810 | +0.041 [-0.149, +0.234] |
| range used | low (edges 0.6, 0.8) | 1,543 | +0.157 [-0.027, +0.325] |
| range used | mid (edges 0.6, 0.8) | 1,544 | -0.008 [-0.156, +0.140] |
| range used | high (edges 0.6, 0.8) | 1,546 | +0.219 [-0.004, +0.440] |

## P2b — meta-label: gradient-boosted regression of net R on the line state, refit each year on prior rich trades, trading from 2020

Scored trades 2020+: 3,713; model says take 61%.

| set | trades | mean net R [95%] |
|---|---|---|
| all scored | 3,713 | +0.162 [+0.010, +0.314] |
| taken | 2,277 | +0.152 [-0.019, +0.332] |
| skipped | 1,436 | +0.177 [-0.094, +0.457] |

Taken minus all: **-0.010R** [-0.135, +0.113], halves -0.024 / -0.002, keeps 61% → **no improvement**.

## P2c — exit at the moving p75 / p90 line instead of 5R / 10R (same entries and stops, M1 simulation)

Simulation check: reproduces the stored 5R / 10R net R (±0.05) on 95.8% of 1200 cells.

| exit | mean net R [95%] | vs 5R/10R cells mean (same trades) |
|---|---|---|
| target at moving p75 | -0.063 [-0.140, +0.011] | -0.186 [-0.273, -0.095] (stored cells +0.123) |
| target at moving p90 | +0.112 [-0.010, +0.229] | -0.011 [-0.073, +0.052] (stored cells +0.123) |

Exit at the moving line beats the stored 5R / 10R: **no**.
