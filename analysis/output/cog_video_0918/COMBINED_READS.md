# Combined reads (descriptive)

Three reads of the SOFR-Euribor line, taken exactly as already reported: structure-event alignment, match / confirm / entry, 12-hour window analog. At each whole weekday hour: which reads are active, which way, and what Nasdaq did over the next 4 hours (1 hour in the second table). Moves are signed so that a positive number means price went the way the reads pointed. Ranges are 95% day-block bootstrap ranges. No pass/fail: this is to see whether agreement carries more than any single read.

Hours covered: 14,309 (9,042 to Oct 2025, 5,267 after). Hours with at least one read active: 4,604; two or more: 1,149; all three: 67.

Reference: over all these hours Nasdaq moved +0.014% on average over the next 4 hours and was up 54% of the time, so a read that just says "up" would look right 54% of the time.

## Next 4 hours

| group | hours | days | mean move in the read's direction, % (95% range) | share of hours in that direction |
|---|---|---|---|---|
| events alone | 441 | 193 | +0.015 (-0.048 to +0.075) | 49% |
| events (any hours it is active) | 694 | 220 | -0.013 (-0.072 to +0.041) | 49% |
| match alone | 1563 | 523 | -0.016 (-0.049 to +0.017) | 50% |
| match (any hours it is active) | 2618 | 550 | -0.021 (-0.051 to +0.008) | 50% |
| analog alone | 1451 | 497 | +0.000 (-0.040 to +0.048) | 50% |
| analog (any hours it is active) | 2508 | 524 | -0.001 (-0.033 to +0.035) | 51% |
| two or more active, all pointing the same way | 564 | 331 | -0.036 (-0.096 to +0.021) | 50% |
|   of which exactly two | 545 | 327 | -0.040 (-0.100 to +0.017) | 50% |
|   of which all three | 19 | 17 | +0.078 (-0.247 to +0.392) | 68% |
| two or more active, pointing different ways | 585 | - | not directional | - |

## Next 1 hour

| group | hours | days | mean move in the read's direction, % (95% range) | share of hours in that direction |
|---|---|---|---|---|
| events alone | 440 | 193 | -0.001 (-0.027 to +0.024) | 50% |
| events (any hours it is active) | 693 | 220 | -0.008 (-0.036 to +0.016) | 49% |
| match alone | 1557 | 522 | +0.001 (-0.014 to +0.015) | 49% |
| match (any hours it is active) | 2612 | 549 | -0.007 (-0.019 to +0.006) | 48% |
| analog alone | 1451 | 497 | -0.003 (-0.020 to +0.013) | 51% |
| analog (any hours it is active) | 2508 | 524 | -0.003 (-0.015 to +0.010) | 51% |
| two or more active, all pointing the same way | 564 | 331 | -0.023 (-0.052 to +0.007) | 46% |
|   of which exactly two | 545 | 327 | -0.024 (-0.054 to +0.005) | 47% |
|   of which all three | 19 | 17 | +0.012 (-0.147 to +0.189) | 42% |
| two or more active, pointing different ways | 585 | - | not directional | - |

## Same, split by period (4 hours)

| group | hours | days | mean move in the read's direction, % (95% range) | share of hours in that direction |
|---|---|---|---|---|
| aligned, to Oct 2025 | 327 | 192 | -0.070 (-0.149 to +0.003) | 48% |
| aligned, after Oct 2025 | 237 | 139 | +0.010 (-0.076 to +0.104) | 53% |
| any read alone, to Oct 2025 | 2157 | 387 | +0.002 (-0.032 to +0.037) | 51% |
| any read alone, after Oct 2025 | 1298 | 230 | -0.016 (-0.053 to +0.020) | 49% |

## Are the reads copies of each other?

- events and match: both active in 159 hours; same direction in 53% of them
- events and analog: both active in 161 hours; same direction in 53% of them
- match and analog: both active in 963 hours; same direction in 50% of them

Reading guide: a group whose range sits above zero in both periods and grows with agreement would be the combination you described. A group whose range straddles zero is "cannot tell yet at this sample", and the hours column says how much more history it would need.

