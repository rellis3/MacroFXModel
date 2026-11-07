# footprint-absorption — results

Prereg: `forge/FOOTPRINT_ABSORPTION_PREREG.md` (amendment A1 committed in `f491fdca`, 2026-11-07, before scoring). Run 2026-11-07, seed 20261107, B = 2000.
Branch `main`. Ledger id: `footprint-absorption`.

## Verdict: NULL

The gate did not hold on any cell, and all six are powered. Neither mechanical reading of absorption reached the registered +0.15 contrast, and both trades lost about 0.3R after costs. One cell is a candidate, not a result: event A at 60 minutes is +0.09, clear of zero after Holm, in both halves and both instruments, but below the bar and not tradeable as built.

## Scored cells

| Cell | n | Estimate | 95% CI | MDE | Pass bar | Holm p | Halves | 6E / 6J | Shuffle 95th | Cell verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| A15, delta divergence | 1,255 | +0.044 | [-0.009, +0.117] | 0.141 | +0.15 | 0.234 | +0.045 / +0.043 | +0.017 / +0.076 | +0.060 | NULL |
| A60 | 1,203 | +0.092 | [+0.028, +0.163] | 0.140 | +0.15 | 0.016 | +0.087 / +0.095 | +0.117 / +0.061 | +0.063 | NULL, below the bar; candidate |
| AR, net R of the trade | 1,195 | -0.291R | [-0.368, -0.205] | 0.138 | +0.15R | 0.003 | -0.333 / -0.261 | -0.240 / -0.353 | — | NULL |
| B15, absorbed at the extreme | 2,066 | +0.003 | [-0.059, +0.061] | 0.114 | +0.15 | 0.99 | +0.008 / -0.001 | -0.022 / +0.039 | +0.052 | NULL |
| B60 | 1,969 | +0.051 | [-0.004, +0.105] | 0.113 | +0.15 | 0.207 | -0.004 / +0.092 | +0.039 / +0.068 | +0.053 | NULL |
| BR, net R of the trade | 2,053 | -0.316R | [-0.373, -0.264] | 0.108 | +0.15R | 0.003 | -0.371 / -0.276 | -0.296 / -0.345 | — | NULL |

The mirror (the bar reverses) fails too: no contrast is negative enough, and the trades lose in the absorber's direction, not for lack of a reversal being tested.

## Parts of the pattern (owner's rule: decompose a null; descriptive)

| Part | A, delta divergence | B, absorbed at the extreme | Reading |
|---|---|---|---|
| Gross R | +0.018 [-0.050, +0.095] | -0.044 [-0.100, +0.002] | Nothing before costs |
| Net R | -0.291 | -0.316 | Costs are about 0.3R a trade |
| Control trade, same candle on normal flow | -0.313 net, -0.049 gross, n 17,664 | -0.292 net, -0.034 gross, n 14,874 | The flow condition adds about nothing to the trade |
| Target reached minus the random-walk third | -0.1 pp [-2.4, +2.4] | -2.7 pp [-4.6, -0.9] | A matches a random walk; B is slightly worse |
| Exits (stop / target / close) | 752 / 375 / 68 | 1,325 / 585 / 143 | |
| Long side, short side net R | -0.354, -0.228 | -0.334, -0.299 | No side rescues it |
| London hours, US hours net R | -0.332, -0.260 | -0.332, -0.306 | No session rescues it |
| Contrast at h = 5, 30 | +0.023, +0.058 | -0.001, +0.041 | Builds slowly with the horizon |

**Candidate, for its own prereg, never a result:** A60. It survives Holm, holds in both halves and both instruments, and clears the label shuffle. It points the way video 1 says, with delta against the candle and price carrying on with the candle. It is about 0.09 of a standardised 60-minute move, on a window already read for `orderflow-lead-aggressor` and with no untouched holdout, because the older months were not bought. The trade tested here cannot harvest it: a stop just past the bar pays about 0.3R in costs.

## NQ (descriptive)

49 sessions, 2026-06-12 to 2026-08-21, cash hours, about 29 usable after the history requirement. Event A 3 events, event B 13: too few to read, and the numbers are not reported as findings.

**The useful NQ finding is the sign:** tick-rule and true imbalance correlate +0.91 per bar on NQ, against +0.54 and +0.48 on 6E and 6J. The tick rule is a good stand-in on NQ, so the `orderflow-lead` NQ null is firmer than `orderflow-lead-aggressor` suggested, and the free NQ tick history is more useful than that result implied.

## Deviations from the prereg

A1 only (count-first). NQ has about 29 usable sessions rather than the 35 planned.

## What this changes

- Do not present delta divergence or volume at the rejected extreme as an edge on 6E or 6J. The page's amber dot stays a description.
- Nothing here justifies buying NQ or ES history.
- The open route: a forward record of A60 on recorded 6E and 6J, or fresh older months, under a new prereg with an exit that does not pay 0.3R. Only worth doing if the owner wants to continue this line.
- Not tested: a trader's discretion and context filters, the order book, stacked imbalances, low-volume nodes, exhaustion and big-trade filters.
