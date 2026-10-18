# Pre-registration — does distance to the textbook zero gamma change NQ's next-day range, beyond the gamma sign?

**Written 2026-10-18, before any outcome was computed.** Committed before the run. Build item 3 of
`plans/DATA_AND_INTEGRATION_TRACKER.md`; prompted by C.OG's 2026-10-18 ES chart (`education/cog-snippets.md` §2).

## What is already known (so this is not a re-run)

- **G2 (REAL):** the sign of NQ net GEX predicts next-day range against a Brownian baseline: long gamma = quieter
  (`GEX_RANGE_BROWNIAN_RESULTS.md`). "Spot above / below zero gamma" is, on a book with one crossing, the same
  statement as that sign. **Re-testing above/below would be a re-run of G2.** It is not tested here.
- **G1 (NULL, both proxies):** the book's flip (cumulative-by-strike crossing) did not separate next-bar range, with
  realised-vol gamma or real IV (`GAMMA_REAL_IV_PREREG.md`). Both were a strike walk, not the textbook re-evaluation.
- **Levels and direction (NULL / do-not-reopen):** walls and flips as support, resistance or magnets; any gate as a
  direction signal. Not tested here.

## The new question

The textbook zero gamma Z re-prices the whole book at hypothetical spots and finds where total dealer gamma
changes sign. **When spot sits close to Z, a small move switches dealers from damping to chasing (or back).** Is the
next day's range larger near Z than far from it, **after removing the gamma-sign effect G2 already explains**?

Mechanism, one sentence: near the switch point the hedging feedback is conditional on the next move, so the
damping of the long-gamma side and the push of the short-gamma side are both less reliable.

## Data (all in `oi_research_book/data`, no new download)

- **Book:** `surface_near_nas100_usd.parquet` — per date, per strike, call and put OI summed over expiries ≤ 45 DTE
  (the G2 primary surface). Robustness: `surface_all_nas100_usd.parquet`.
- **Spot, outcome, σ:** `daily_master_near_nas100_usd.parquet` (`spot`, `fwd_hi_1d`, `fwd_lo_1d`, `rv20_ann`, `ret`),
  the exact G2 inputs.
- **Vol and time for re-pricing:** `iv_daily_nas100_usd.parquet` — `iv_front` and `dte_front` for the date.
- Window: every date with all of the above, 2020-09 → 2026-08 (dates after the 2026-08-21 lockbox are dropped).

**Limitation, declared:** the surface sums expiries, so one T (the front expiry's) and one IV (front ATM) re-price
every strike. G2 itself was measured on this same aggregate. A per-expiry rebuild from `OI Data/NAS100_USD.csv`
(laptop only) is a later confirmation, not this test.

## Definitions (frozen)

- **Total dealer gamma at price P:** Σ_k (callOI_k − putOI_k) · Γ_BS(P, k, T, σ) · P (dealers long calls, short puts,
  the platform convention), T = max(dte_front, 0.5)/365, σ = iv_front. Grid P = spot × [0.90, 1.10], 401 points.
- **Z** = the sign change of that curve nearest spot. No crossing in the grid → the day is **far** (Z is > 10% away).
- **Distance** d = |spot − Z| / (spot · σ_d), σ_d = rv20_ann / √252 (the G2 normaliser), i.e. in daily sigmas.
- **Near** = d ≤ 1.0.
- **Outcome DR** = log(fwd_hi_1d / fwd_lo_1d) / (σ_d · √(8/π)) — G2's diffusion ratio (OI at date t, range t+1;
  G2's alignment, inherited).
- **Sign control:** DR is demeaned within G2's own sign groups (net_gex_sum < 0 vs ≥ 0) before the comparison, so
  the near/far difference cannot be the sign effect re-labelled.

## Primary statistic and verdict (applied mechanically)

ΔDR = mean(DR_demeaned | near) − mean(DR_demeaned | far), with G2's stationary block bootstrap (mean block 10,
10,000 paths) two-sided p.

- **SUPPORTED** if ΔDR ≥ +0.05 **and** p < 0.05 **and** ΔDR > 0 in both halves of the dates **and** every robustness
  cell has the same sign **and** the harness gates pass.
- **NULL** if |ΔDR| < 0.03 or the robustness cells disagree in sign.
- **INCONCLUSIVE** otherwise. A negative ΔDR meeting the size and p bars is reported as "wrong way", not supported.

## Robustness cells (declared now; reported; used only in the sign-agreement rule)

1. Near = d ≤ 0.5; 2. Near = d ≤ 2.0; 3. T = 30 days with σ = iv30; 4. the all-expiry surface.

## Harness gates (must pass before the result is believed)

- **Placebo:** the near flag circularly shifted by 125 trading days → |ΔDR| < 0.03.
- **Positive control:** G2's — trailing |return| above median must show ΔDR > 0.05, p < 0.05 on the same rows.
- **Engine check:** on a synthetic book (puts below spot, calls above) the re-pricing finds Z between the two blocks
  with short gamma below it (`js/hedgingScenario.test.mjs` asserts the same in the live engine).

## Decision

- SUPPORTED → "near zero gamma" becomes a candidate range flag for NQ, entering the one-forecast test
  (`forge/ONE_RANGE_FORECAST_PREREG.md`) as a new variant with its own log line, never added directly.
- NULL / INCONCLUSIVE → the dealer hedging map keeps showing Z as mechanics, labelled untested-for-range-beyond-sign
  → tested null; nothing is built on it.

Script `oi_research_book/scripts/26_zero_gamma_distance.py`; output `oi_research_book/ZERO_GAMMA_DISTANCE_RESULTS.md`
and `data/results/zero_gamma_distance.json`.
