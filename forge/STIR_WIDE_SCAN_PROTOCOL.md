# STIR wide scan — search everything, then confirm on months the search never saw

*Written 2026-10-08 before the scan ran. Owner: "go wide and then try and find narrowness out of it." The narrow tests
(forge/STIR_RESIDUAL_PREREG.md) asked one question each. This scans every reasonable way short-rate futures could lead
price, then keeps only what survives two checks that a wide search needs.*

## The grid

- **Rate series (12):** SOFR SR3U6, SR3Z6, SR3H7, SR3M7; Euribor IZ6; ICE €STR ER3U6; differentials IZ6 − SR3U6,
  IZ6 − SR3Z6, IZ6 − SR3H7, ER3U6 − SR3U6 (C.OG's pair); Fed-path slopes SR3H7 − SR3Z6, SR3M7 − SR3Z6.
- **Features of each (9):** change over the last 1, 2, 4, 8, 16 bars; a "turn" (4-bar change flips sign after a move
  of at least 1σ); a "shock" (one 15-min bar ≥ 2σ); the residual gap vs the target (rates-implied move minus the
  target's own move, univariate 20-day rolling β, over 4 and 16 bars).
- **Targets (18):** every OANDA M15 series in `analysis/output/rates_residual/m15/` (FX, gold, silver, oil, indices, bond
  CFDs).
- **Horizons (5):** the target's return over the next 1, 2, 4, 8, 16 bars (15 min to 4 h).
- **Time of day (5):** all; Asia (00:00–07:00 London); London morning (07:00–12:30); US data + open (12:30–16:00);
  US afternoon (16:00–21:00).

Each test: the day-clustered t-statistic of corr(feature now, target's forward return). About 59,000 tests.

## The two checks

1. **Discovery vs holdout.** Search only on 2026-04 → 2026-07-31. Confirm on 2026-08-01 → 2026-10-07 (untouched).
2. **The same search on scrambled rates.** Shift every rate series by a random number of whole days (30 runs) and run
   the full scan again. This shows how big the best result gets by luck when there is no link at all.

## What counts

- **A finding:** discovery |t| above the 95th percentile of the scrambled scans' best |t| (family-wise), AND the same
  sign in the holdout with holdout |t| ≥ 2.
- **A broad effect (the "fuzzy" view):** across all ~59,000 tests, discovery t and holdout t positively correlated by
  more than the scrambled runs manage (95th percentile). That says rates carry lead information in many forms at once,
  even if no single test is decisive.
- Reported regardless: the top 30 discovery results and how each did in the holdout (sign agreement vs the 50% chance
  rate).

Output: `analysis/output/stir_wide_scan/`; script `scripts/rates_residual/stir_wide_scan.py`.
