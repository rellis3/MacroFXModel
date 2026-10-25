# Release-day layers for the SOFR and Euribor legs (descriptive, exploratory)

Not pre-registered: a first look built from C.OG's Discord layers (19 Oct 2026). Legs: SOFR Sep26 (SR3U6) and Euribor Mar27 (IH7), 1-minute midpoints, rate changes in bp. Nasdaq: CFD, log % change. Events: the repo's own table (FOMC, CPI, NFP), 2024-04-15 to 2026-08-21. A leg's response is measured from the last minute that had ended at the release to the minute that had ended at +5, +30, +120, +240 minutes.

Events: 69 (NFP 27, CPI 24, FOMC 18). Data surprise `ds` is the repo's standardised actual-minus-consensus (positive = above consensus); FOMC decisions almost never differ from consensus, so FOMC has no direction here.

## Layer 1 and 3: what happened, and how unusual (conditional versus unconditional normalising)

z (cond) divides the 30-minute SOFR-leg move by the typical move for the SAME clock window on the previous 40 weekdays with no release. z (uncond) divides by a trailing 20-day volatility taken over all hours, as our turn detection did.

| release | n | median abs SOFR-leg move 30m (bp) | median abs Euribor-leg 30m (bp) | median abs spread 30m (bp) | median abs Nasdaq 30m (%) | median abs z (cond) | median abs z (uncond) |
|---|---|---|---|---|---|---|---|
| CPI | 24 | 4.25 | 1.00 | 3.00 | 0.26 | 2.51 | 4.31 |
| NFP | 27 | 5.00 | 2.25 | 3.50 | 0.25 | 3.53 | 7.47 |
| FOMC | 18 | 2.00 | 1.00 | 1.00 | 0.19 | 2.94 | 2.36 |

Share of releases where the SOFR leg did not move at all in the 30 minutes (midpoint unchanged): 1%; Euribor leg: 12%.

## Layer 2: surprise to response (CPI and NFP; positive surprise = hotter / stronger than consensus)

| pair | correlation (95% range), n |
|---|---|
| CPI: surprise vs SOFR leg 30m | +0.40 (-0.05 to +0.68), n 24 |
| CPI: surprise vs Euribor leg 30m | +0.20 (-0.20 to +0.50), n 24 |
| CPI: surprise vs spread 30m | +0.47 (-0.01 to +0.73), n 24 |
| CPI: surprise vs Nasdaq 30m | -0.29 (-0.62 to +0.23), n 24 |
| CPI: surprise vs Nasdaq 5 to 240m | +0.47 (-0.05 to +0.73), n 24 |
| NFP: surprise vs SOFR leg 30m | +0.68 (+0.51 to +0.84), n 25 |
| NFP: surprise vs Euribor leg 30m | +0.40 (-0.14 to +0.84), n 24 |
| NFP: surprise vs spread 30m | +0.77 (+0.61 to +0.89), n 24 |
| NFP: surprise vs Nasdaq 30m | +0.13 (-0.41 to +0.57), n 25 |
| NFP: surprise vs Nasdaq 5 to 240m | -0.11 (-0.42 to +0.29), n 24 |
| CPI + NFP: surprise vs SOFR leg 30m | +0.34 (+0.11 to +0.53), n 49 |
| CPI + NFP: surprise vs Euribor leg 30m | +0.20 (+0.01 to +0.40), n 48 |
| CPI + NFP: surprise vs spread 30m | +0.37 (+0.14 to +0.55), n 48 |
| CPI + NFP: surprise vs Nasdaq 30m | -0.19 (-0.41 to +0.06), n 49 |
| CPI + NFP: surprise vs Nasdaq 5 to 240m | +0.27 (-0.14 to +0.59), n 48 |

## His CPI test: after the same kind of surprise, what does Nasdaq do when the front end reacts strongly versus weakly?

Surprise groups: hot (ds > 0) and cool (ds < 0), CPI and NFP together. "Strong" = the SOFR leg moved, in the direction the surprise implies (hot -> rates up), by more than 1 conditional sigma; "weak" = everything else. Nasdaq = the move from +5 minutes (after the first reaction) to +120 and +240 minutes, raw % (not signed).

| surprise | SOFR-leg response | events | Nasdaq +5 to +120m, % (95% range) | Nasdaq +5 to +240m, % (95% range) |
|---|---|---|---|---|
| hot | strong, in the implied direction | 12 | -0.25 (-0.70 to +0.20), n 11 | -0.11 (-0.80 to +0.46), n 11 |
| hot | weak or against | 6 | +0.25 (-0.01 to +0.48), n 6 | -0.22 (-1.45 to +0.75), n 6 |
| cool | strong, in the implied direction | 14 | -0.28 (-0.64 to +0.08), n 14 | -0.85 (-1.66 to -0.18), n 14 |
| cool | weak or against | 8 | -0.13 (-0.55 to +0.31), n 8 | -0.15 (-0.84 to +0.48), n 8 |

## FOMC (no surprise direction): Nasdaq after the front-end move

| SOFR leg 30m move | events | Nasdaq +5 to +120m, % | Nasdaq +5 to +240m, % |
|---|---|---|---|
| up (rates higher) | 8 | -0.32 (-1.22 to +0.28), n 8 | too few |
| down | 9 | -0.15 (-0.55 to +0.25), n 9 | too few |
| unchanged | 1 | too few | too few |

Sample note: about 70 events in total, so every cell above is a few events to a few dozen. Ranges are event-bootstrap ranges and are wide on purpose: read the sign and the width, not the average. The per-event rows are in `RELEASE_TABLE.csv`.

