# COG-EXACT-PAIR-LEAD: does C.OG's identified line (SOFR Sep26 − Euribor Mar27) lead Nasdaq?

*Pre-registered 2026-10-14, before the exact pair is compared with Nasdaq at any horizon. The line is identified in
`analysis/output/cog_video_0918/RECONSTRUCTION.md` §10: (SOFR rate − Euribor rate) in bp × 0.1 + 1.445, legs CME SR3U6 and
ICE IH7 (Mar27). All earlier lead tests used Euribor Dec26, €STR or other months; this exact pair has not been tested.*

## Data
- Legs: 1-min MIDPOINT, `analysis/output/stir_1m/CME_SR3U6.parquet` and `ICEEU_IH7.parquet`, 2026-04-13 → 2026-10-09.
- Line: hourly bars (Pine `request.security` on 1h, lookahead off: value known at the bar's close), source hl2, EMA 1
  (the best-fitting setting; no smoothing). In units of his line: (SOFR − Euribor, bp) × 0.1 + 1.445.
- Nasdaq: CME NQ futures stitched (rolls 7 days before expiry), hourly closes, returns within one contract only.
- **Explore** 2026-04-13 → 07-17, **confirm** 2026-07-20 → 10-09. Hours with a leg or Nasdaq missing are dropped, not filled.

## Tests (8 cells, fixed now)
- x = change of the line over the last W ∈ {1 h, 4 h} (bar close t); y = Nasdaq log return t → t+H, H ∈ {1 h, 2 h, 4 h, 24 h}.
- Statistic: correlation of standardised x and y (x scaled by prior-day-only RMS), day-clustered t (per-day sums).
- Explore: sign free; |t| ≥ 2.5 (≈ BH over 8) to be carried. Confirm: sign fixed from explore, one-sided p < 0.05.
- Also reported (no pass weight): same-bar correlation (H = 0 h: y = return over the same hour), the level's 24 h lead
  (his t+1d offset: line level vs return over the next 24 h), and the raw count of days.
- **Power first:** planted lead (y += ρ·x-signal) at ρ = 0.03 / 0.05 / 0.08 / 0.12 in explore; detection reported before results.

## Reading rule
PASS = at least one cell survives explore and confirm. Null with detection ≥ 50 % at ρ = 0.08 = genuinely nothing at these
horizons; otherwise insufficient data. No cells, windows or horizons are added after the first number.

Script `scripts/rate_diff_nq/cog_exact_pair_lead.py`; output `analysis/output/cog_video_0918/EXACT_PAIR_LEAD.md`; ledger `cog-exact-pair-lead`.
