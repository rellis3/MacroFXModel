# FED-PATH-LEAD: does the Fed-path slope lead EURUSD / AUD / silver / DAX? (one confirmation test)

*Pre-registered 2026-10-08, while the confirmation data was still downloading and before any of it had been seen. Source:
the STIR wide scan (`forge/STIR_WIDE_SCAN_PROTOCOL.md`, results `analysis/output/stir_wide_scan/`): 25 of its top 30
Apr–Jul results kept their sign in Aug–Oct (scrambled median 14, 1 of 30 scrambles as high), and they clustered on the
Fed-path slope. This turns that cluster into ONE test on months no search has touched.*

## Data

- **Driver:** the Fed-path slope = SR3M7 price − SR3Z6 price (IBKR 15-min closes, `analysis/output/stir/`), exactly the
  wide scan's `SLOPE_M7Z6` series (rises when the market prices more 2027 cuts relative to late 2026).
- **Confirmation period: 2025-10-13 → 2026-04-10** (pulled by `scratchpad/ibkr_stir_pull.py --end 2026-04-12`). Not used by
  the wide scan, the contract map or any other search. Bars after 2026-04-11 are excluded even if the pull returns them.
- **Targets:** OANDA M15 mid closes (`analysis/output/rates_residual/m15/`): EUR_USD, AUD_USD, XAG_USD, DE30_EUR.

## The test (fixed now)

- **Signal at bar t:** the slope's change over the last 2 bars (30 min), divided by its trailing 20-day σ of 15-min
  changes × √2 (computed from bars strictly before t), the wide scan's `mom2` construction.
- **Outcome:** the equal-weight basket of the four targets' log returns over the next 2 bars (30 min), each target's
  return divided by its own trailing 20-day 15-min σ before averaging.
- **Sessions:** only bars in Asia (00:00–07:00 London) or the London morning (07:00–12:30 London), where the cluster sat.
- **Statistic:** day-clustered t of the mean of (signal × outcome), both standardised (the wide scan's statistic).

**PASS:** t ≥ 2.0 with a positive sign (the discovery sign) on the confirmation period.

Reported, no pass weight: each target alone; horizons 1, 4, 8 bars; the slope's 1-bar and 8-bar change as the signal;
Asia and London separately; the same test on Apr–Oct 2026 (the discovery months, for comparison only); and a gross
trading read (basket position = sign of the signal when |signal| > 1, held 30 min, before costs).

## Stopping rule

One run. If it fails, the wide-scan lead is closed as a chance cluster. If it passes, it goes into the Evidence Book as
validated on one confirmation sample and gets a forward paper record before anything is built on it.

Output `analysis/output/fed_path_lead/RESULTS.md`; script `scripts/rates_residual/fed_path_lead.py`.

## Result (2026-10-08), run once as registered

**FAIL.** t +1.43 (needs +2.0), corr +0.029, 5,735 bars over 119 days (`analysis/output/fed_path_lead/RESULTS.md`).
Same sign as discovery and smaller (discovery months t +2.84). By target: EURUSD −0.54, AUDUSD +1.27, silver +1.03,
DAX +1.44. Gross read: 1,880 trades, +0.005% per trade before costs, hit 50.3% (below one spread). Per the stopping
rule the wide-scan lead is closed: whatever is there is too small to see on six months or to trade at 15-min resolution.
