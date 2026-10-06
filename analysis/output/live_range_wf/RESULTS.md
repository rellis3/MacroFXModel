# LIVE-RANGE-WALKFORWARD — results

Pre-registration: `forge/LIVE_RANGE_WALKFORWARD_PREREG.md`. 157,129 resolved first-touches, 2,176 trading dates, 2018-04 → 2026-08, grids refit each quarter on prior dates only, decisions from prior dates only.

## Variant 1 — primary (expanding window, mean ≥ +0.03R, t ≥ 3, n ≥ 200)

| variant | trades (share of events) | continue share | net R per trade [95%] | vs random pick [95%] | years > 0 (2018-25) | same trades: always continue / always fade | verdict |
|---|---|---|---|---|---|---|---|
| V1 A (hour) | 0 (0.0%) | 0% | +nan [+nan, +nan] | +nan [+nan, +nan] | 0/0 | +nan / +nan | fail |
| V1 B (weekday × hour) | 84 (0.1%) | 50% | -0.224 [-0.482, +0.023] | -0.103 [-0.394, +0.157] | 0/4 | -0.189 / -0.055 | fail |
| V1 C (weekday × session) | 0 (0.0%) | 0% | +nan [+nan, +nan] | +nan [+nan, +nan] | 0/0 | +nan / +nan | fail |

## Variant 2 — loose (mean > 0, t ≥ 1.5, n ≥ 100)

| variant | trades (share of events) | continue share | net R per trade [95%] | vs random pick [95%] | years > 0 (2018-25) | same trades: always continue / always fade | verdict |
|---|---|---|---|---|---|---|---|
| V2 A (hour) | 3,208 (2.0%) | 32% | -0.033 [-0.086, +0.019] | +0.056 [-0.003, +0.114] | 1/8 | -0.090 / -0.087 | fail |
| V2 B (weekday × hour) | 4,054 (2.6%) | 26% | -0.051 [-0.095, -0.006] | +0.072 [+0.022, +0.124] | 1/8 | -0.191 / -0.055 | fail |
| V2 C (weekday × session) | 802 (0.5%) | 58% | -0.151 [-0.277, -0.009] | -0.104 [-0.237, +0.016] | 1/7 | -0.100 / +0.007 | fail |

## Variant 3 — rolling 3-year window (primary thresholds)

| variant | trades (share of events) | continue share | net R per trade [95%] | vs random pick [95%] | years > 0 (2018-25) | same trades: always continue / always fade | verdict |
|---|---|---|---|---|---|---|---|
| V3 A (hour) | 0 (0.0%) | 0% | +nan [+nan, +nan] | +nan [+nan, +nan] | 0/0 | +nan / +nan | fail |
| V3 B (weekday × hour) | 118 (0.1%) | 0% | +0.070 [-0.123, +0.267] | +0.280 [-0.042, +0.591] | 0/1 | -0.490 / +0.070 | fail |
| V3 C (weekday × session) | 0 (0.0%) | 0% | +nan [+nan, +nan] | +nan [+nan, +nan] | 0/0 | +nan / +nan | fail |

## Variant 4 — also split by trailing σ regime (top / bottom half)

| variant | trades (share of events) | continue share | net R per trade [95%] | vs random pick [95%] | years > 0 (2018-25) | same trades: always continue / always fade | verdict |
|---|---|---|---|---|---|---|---|
| V4 A (hour) | 107 (0.1%) | 8% | -0.138 [-0.415, +0.222] | -0.019 [-0.353, +0.419] | 1/2 | -0.162 / -0.076 | fail |
| V4 B (weekday × hour) | 5 (0.0%) | 80% | -0.591 [-1.104, +0.512] | -0.459 [-1.034, +0.507] | 1/1 | -0.111 / -0.154 | fail |
| V4 C (weekday × session) | 0 (0.0%) | 0% | +nan [+nan, +nan] | +nan [+nan, +nan] | 0/0 | +nan / +nan | fail |

## What the walk-forward chose (V1 family B): share of line touches by decision

| class | rung | hours | touches | continue | fade | no trade |
|---|---|---|---|---|---|---|
| fx_gold | p50 | 01-07 | 20,660 | 0.2% | 0.2% | 99.6% |
| fx_gold | p50 | 08-14 | 47,048 | 0.0% | 0.0% | 100.0% |
| fx_gold | p75 | 01-07 | 1,750 | 0.0% | 0.0% | 100.0% |
| fx_gold | p75 | 08-14 | 19,376 | 0.0% | 0.0% | 100.0% |
| fx_gold | p75 | 15-21 | 21,912 | 0.0% | 0.0% | 100.0% |
| fx_gold | p90 | 01-07 | 398 | 0.0% | 0.0% | 100.0% |
| fx_gold | p90 | 08-14 | 2,727 | 0.0% | 0.0% | 100.0% |
| fx_gold | p90 | 15-21 | 16,688 | 0.0% | 0.0% | 100.0% |
| indices | p50 | 01-07 | 896 | 0.0% | 0.0% | 100.0% |
| indices | p50 | 08-14 | 10,094 | 0.0% | 0.0% | 100.0% |
| indices | p50 | 15-21 | 2,221 | 0.0% | 0.0% | 100.0% |
| indices | p75 | 01-07 | 69 | 0.0% | 0.0% | 100.0% |
| indices | p75 | 08-14 | 2,215 | 0.0% | 0.0% | 100.0% |
| indices | p75 | 15-21 | 7,678 | 0.0% | 0.0% | 100.0% |
| indices | p90 | 01-07 | 9 | 0.0% | 0.0% | 100.0% |
| indices | p90 | 08-14 | 258 | 0.0% | 0.0% | 100.0% |
| indices | p90 | 15-21 | 3,130 | 0.0% | 0.0% | 100.0% |

By calendar year (V1 family B): trades and net R per trade

| year | trades | net R per trade |
|---|---|---|
| 2018 | 0 |  |
| 2019 | 0 |  |
| 2020 | 0 |  |
| 2021 | 0 |  |
| 2022 | 10 | -0.210 |
| 2023 | 4 | -0.508 |
| 2024 | 14 | -0.365 |
| 2025 | 24 | -0.101 |
| 2026 | 32 | -0.224 |

Decision stability (family A, class × rung × hour): agreement with the previous year's decision where either year traded: nan%.