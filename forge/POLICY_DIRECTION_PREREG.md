# Slow policy direction at C.OG's lines: post-FOMC dollar drift (S4) and relative 2-year momentum (S5)

*Pre-registered 2026-10-07 evening, before either signal was joined to a trade. Follows the overnight research note: the
literature's lagging rate effects (Ang & Chen 2010: changes in relative rates predict FX up to 12 months; AQR macro
momentum: 1-year change in 2-year yields; Eichenbaum & Evans: delayed overshooting after Fed shocks) work over days to
months, and our only validated lagging rates effect is the post-FOMC dollar drift (+26 bp over 5 sessions, 99.8th
percentile of placebo, both halves; its stand-alone hold FAILED on power, OOS t 1.11).*

## S4 — post-FOMC dollar drift as the direction at his lines

- FOMC decision days: `analysis/fomc_event_study/stage1_events.csv` (2016-01 → 2026-05) + 2026-06-17 and 2026-07-29
  (js/fomcCalendar.js).
- Window: the five London sessions D+1 … D+5 after each decision day D.
- Direction: **dollar up** (the validated drift, unsigned). EURUSD and GOLD trades on the SHORT side are "with"; long side
  "against". NQ is not used (no validated sign).
- Trades: Setup A (fade at his median) and C (continue through it), `analysis/output/cog_yield_dir/trades.csv`.
- **PASS:** with-drift mean net R > 0, its 95% interval (bootstrap resampling FOMC EVENTS, not trades) above 0; with minus
  against above 0; positive in both halves (2016–2020, 2021–2026).

## S5 — relative 2-year momentum (EURUSD)

- d = US 2y (FRED DGS2) − German 2y (Bundesbank BBSIS R02XX), daily. Point in time: at session D use observations dated
  on or before two business days before D.
- Signal = sign of the 63-observation change in d. Widening (US rates rising relative) → **USD up** (Ang & Chen sign).
- **(a) At his lines:** EURUSD A and C trades whose side agrees with the signal (USD up = short EURUSD). PASS: mean net R >
  0 with month-block interval above 0, minus no-filter above 0, both halves (2016-10 → 2021-08, 2021-09 → 2026-08).
- **(b) Multi-day hold (the horizon the literature claims):** EURUSD (FRED DEXUSEU, 2000 → 2026), every 5th business day
  take the signal's side for 5 days, net of 0.008% per round trip. PASS: mean net 5-day return > 0 with block-bootstrap
  interval (20-block) above 0, positive in both halves (2000–2012, 2013–2026). Reported: 20-day hold, hit rate.

## Stopping rule / outputs

One logged variant each at most. Output `analysis/output/policy_direction/RESULTS.md`; scripts
`scripts/policy_direction/`.
