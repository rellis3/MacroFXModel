# failed-auction-volume — results

Prereg: `forge/FAILED_AUCTION_VOLUME_PREREG.md` (registered 2026-10-22; amendments A1 and A2 committed 2026-11-07 before scoring, `75df5e02` and `fb5f5a1d`). Run 2026-11-07, seed 20261022, B = 2000.
Branch `main`. Ledger id: `failed-auction-volume`.

## Verdict: UNDERPOWERED

The gate did not hold, and neither scored cell could have reached its bar: 621 setups came through against about 3,400 expected, and the SD of R was 2.32 against 1.3 assumed. Under section 5 of the prereg that is `underpowered`, not `null`. **The volume question stays open.** The price pattern is a different matter: all 621 setups together lost 0.35R a trade after costs, with an interval well below zero, so there is no sign of a tradeable setup under these rules and costs.

## Scored cells

| Cell | n | Estimate | 95% CI | MDE | Pass bar | Holm p | Cell verdict |
|---|---|---|---|---|---|---|---|
| S1: net R of V-low setups | 124 | -0.31R | [-0.59, -0.02] | 0.79R | +0.15R | 0.066 | UNDERPOWERED |
| S2: V-low minus V-high | 124 / 497 | +0.06R | [-0.39, +0.64] | 1.11R | +0.20R | 0.787 | UNDERPOWERED |

The S1 interval does exclude its +0.15R bar. S2's interval runs from clearly negative to well past its bar, so thin-volume probes may be better, the same or worse.

## Gate

| Condition | Result |
|---|---|
| S1 at or above +0.15R | No |
| S2 at or above +0.20R | No |
| Both intervals above 0 after Holm | No |
| Same sign in both halves | Yes (S1 -0.32 / -0.28, S2 +0.04 / +0.08) |
| S2 positive in at least 4 of 6 instruments | No, 2 of 6 |
| S2 above the 95th percentile of the V-shuffle placebo (+0.43R) | No |

## Parts of the pattern (owner's rule: decompose a result like this; descriptive, A1)

| Part | Result | Reading |
|---|---|---|
| All setups, net | -0.35R [-0.49, -0.17], n 621 | Loses after costs |
| All setups, gross of costs | -0.14R [-0.28, +0.05] | No edge before costs either; about 0.21R a trade is cost |
| Target reached, minus the random-walk rate stop / (stop + target) | -1.5 pp [-3.7, +1.2], n 603 | The bracket resolves as a random walk would |
| No-impulse placebo: same rules, same clock time and direction, other sessions | -0.38R net, -0.18R gross, n 909, against -0.35R and -0.14R | The impulse and balance add nothing visible |
| Mirror: the probe with the impulse, faded back | -0.35R [-0.53, -0.19], n 662 | Same loss on the opposite trade |

No part beats its null, so there are no reusable candidates. Exits: 512 stops, 91 targets, 18 session closes. The stop sits just past the probe and the target at the far edge, so an 82% stop rate is what the geometry gives.

## Per instrument (too thin to read one by one)

| | n low / high | S1 | S2 | All setups, net | All setups, gross |
|---|---|---|---|---|---|
| NQ | 18 / 99 | -0.58 | -0.22 | -0.40 | -0.29 |
| ES | 19 / 79 | +0.01 | +0.68 | -0.54 | -0.28 |
| YM | 21 / 112 | +0.15 | +0.54 | -0.31 | -0.10 |
| RTY | 36 / 96 | -0.24 | -0.34 | +0.01 | +0.25 |
| GC | 13 / 42 | -0.91 | -0.37 | -0.63 | -0.40 |
| CL | 17 / 69 | -0.61 | -0.11 | -0.52 | -0.26 |

RTY's +0.25R gross is one slice of six, unadjusted, and worth nothing after costs (+0.01R).

## Descriptive

D3, target = balance POC: -0.22R [-0.33, -0.07], n 616. Less bad because the target is closer, still a loss. D1 (tick-rule absorption) and D2 (gamma split) were not run, per A1.

## Deviations from the prereg

Amendments A1 (bar stamps, impulse start, single probe, missing minutes, parts of the pattern, D1 and D2 not run) and A2 (count-first). The bootstrap p for S1 is 0.033 before Holm.

## What this changes

- No page or bot uses this. Nothing goes on the futures desk page.
- Do not describe this failed-auction rule as an edge. Do not say volume at the probe has been shown not to matter: the test could not see that.
- Reopening needs far more setups (the balance step keeps 1,230 of 6,992 impulses, and that threshold stays fixed here). A new prereg could try more roots or history, but the random-walk reading of the bracket makes this a poor use of effort unless a new mechanism turns up.
