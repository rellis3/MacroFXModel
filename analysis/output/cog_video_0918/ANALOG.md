# COG-ANALOG results

Registered in `forge/COG_ANALOG_PREREG.md` (b0ef5efd) before any analog was computed. K = 20 analogs 12 h apart, 12-hour window, library ends >= 48 h before each decision.

## Out-of-sample scores

| variant | lead | n | IC Explore | IC Confirm | Explore p | Confirm p | BH p | sign right | share up | pass |
|---|---|---|---|---|---|---|---|---|---|---|
| A | 0.5h | 2605 | -0.037 | -0.014 | 0.935 | 0.674 | 1.000 | 49.2% | 52.0% | NO |
| A | 1h | 2729 | -0.024 | +0.020 | 0.847 | 0.243 | 1.000 | 49.9% | 51.6% | NO |
| A | 2h | 2627 | -0.004 | -0.038 | 0.543 | 0.898 | 1.000 | 50.4% | 52.4% | NO |
| A | 4h | 2508 | -0.001 | -0.021 | 0.500 | 0.728 | 1.000 | 50.7% | 53.7% | NO |
| A | 8h | 2306 | -0.032 | -0.002 | 0.857 | 0.523 | 1.000 | 51.6% | 54.6% | NO |
| A | 12h | 2216 | -0.029 | +0.048 | 0.809 | 0.067 | 1.000 | 52.3% | 55.0% | NO |
| A | 24h | 2180 | -0.011 | +0.094 | 0.643 | 0.003 | 1.000 | 54.3% | 55.0% | NO |
| A | 48h | 1603 | -0.058 | +0.068 | 0.923 | 0.059 | 1.000 | 51.2% | 57.1% | NO |
| B | 0.5h | 2603 | +0.001 | +0.018 | 0.481 | 0.270 | 1.000 | 50.7% | 52.1% | NO |
| B | 1h | 2727 | -0.019 | +0.048 | 0.759 | 0.052 | 1.000 | 50.6% | 51.6% | NO |
| B | 2h | 2625 | -0.033 | +0.031 | 0.891 | 0.137 | 1.000 | 49.4% | 52.4% | NO |
| B | 4h | 2507 | -0.040 | +0.018 | 0.926 | 0.276 | 1.000 | 50.8% | 53.7% | NO |
| B | 8h | 2306 | -0.046 | -0.051 | 0.946 | 0.948 | 1.000 | 51.0% | 54.6% | NO |
| B | 12h | 2216 | -0.090 | -0.017 | 1.000 | 0.698 | 1.000 | 50.7% | 55.0% | NO |
| B | 24h | 2180 | -0.004 | -0.036 | 0.543 | 0.823 | 1.000 | 52.1% | 55.0% | NO |
| B | 48h | 1603 | -0.100 | -0.031 | 0.989 | 0.756 | 1.000 | 51.1% | 57.1% | NO |
| C | 0.5h | 5380 | -0.029 | +0.000 | 0.952 | 0.484 | baseline | 48.4% | 51.9% | - |
| C | 1h | 5507 | -0.023 | +0.023 | 0.909 | 0.137 | baseline | 50.5% | 51.7% | - |
| C | 2h | 5403 | +0.003 | +0.040 | 0.445 | 0.042 | baseline | 50.8% | 52.9% | - |
| C | 4h | 5278 | +0.015 | +0.063 | 0.215 | 0.002 | baseline | 51.6% | 53.3% | - |
| C | 8h | 5053 | -0.013 | +0.052 | 0.744 | 0.020 | baseline | 52.2% | 54.1% | - |
| C | 12h | 4845 | +0.005 | +0.029 | 0.408 | 0.140 | baseline | 53.0% | 54.0% | - |
| C | 24h | 4262 | +0.039 | +0.021 | 0.074 | 0.262 | baseline | 52.9% | 54.2% | - |
| C | 48h | 3046 | +0.010 | +0.014 | 0.384 | 0.345 | baseline | 54.9% | 57.3% | - |

## Placebo (line rotated by a random whole number of days, 60 draws; maximum IC over the 8 leads)

Explore: real -0.001, placebo median +0.045, 95th +0.078. Confirm: real +0.094, placebo median +0.049, 95th +0.104.
**Registered verdict: analog read of the line leads Nasdaq = NO** (0 of 16 cells pass; placebo condition not met).

## Demonstration: the latest line window

Query window ends 2026-10-23 20:00 UTC (last line data on disk; Nasdaq outcomes are only known for library windows up to 2026-10-09). 20 analogs; mean similarity (correlation) +0.81.

| lead | median analog move % | quartiles % | share of analogs up | scored IC out of sample (variant A) |
|---|---|---|---|---|
| 0.5h | +0.06 | -0.01 to +0.18 | 65% | -0.014 |
| 1h | +0.08 | -0.04 to +0.23 | 70% | +0.020 |
| 2h | -0.01 | -0.26 to +0.24 | 45% | -0.038 |
| 4h | -0.02 | -0.31 to +0.19 | 45% | -0.021 |
| 8h | -0.01 | -0.17 to +0.27 | 45% | -0.002 |
| 12h | +0.11 | -0.19 to +0.35 | 60% | +0.048 |
| 24h | +0.05 | -0.22 to +1.15 | 50% | +0.094 |
| 48h | +0.65 | -0.40 to +1.33 | 60% | +0.068 |

Read the last column first: it is how much a read at that lead has been worth on data it had not seen.

