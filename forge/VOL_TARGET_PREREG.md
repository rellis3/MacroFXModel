# Pre-registration — VOL-TARGET: does sizing by the forecast σ beat constant risk, and does the σ matter?

Written 2026-10-05, before `forge/run_vol_target.py` exists and before any return has been joined to a σ arm.
Frozen; changes only by dated amendment before results.

## Why

Lesson 3 of the Forecaster Portfolio case study: volatility is forecastable, direction mostly is not, and the value of
a volatility forecast is in deciding **how much** to hold. Existing evidence (forge/IV_SIZING_FILTER_PREREG.md Part C2)
is trade-level only: on the fixed-20-pip MOTIF trades flat / HAR / IV sizing gave Sharpe 1.62 / 1.65 / 1.67, inside
noise. Nothing in the repo tests market-level vol targeting against constant risk, or races the σ forecasts that
LADDER_CALIBRATION just ranked (HAR-800 best calibrated by regime, live yz_10/ewma worst).

## Data (reused, nothing refit)

- Rows: `analysis/output/ladder_candidates/rows.parquet` from `forge/run_ladder_candidates.py` (Amendment 2, NY-close
  bars): 28 instruments (6 USD majors, GOLD, 15 crosses, 6 indices), one row per London session, with the four
  causal σ forecasts already built — **A0** live estimator, **A2** HAR-800, **A3** IV-adjusted (k fit on train),
  **A4** pure IV. Rows start 2020-09 (FX, IV-limited) / 2016-08 (indices, gold).
- Session return r_t = (close − open) / open of the London 00:00–22:00 session (forge `daily_for`, the same sessions
  the ladder's realised values come from). One position per session, opened at the London open, closed at 22:00.

## Directions (held fixed; sizing is the only thing that varies)

- **LONG**: always long, on the 6 indices + GOLD (assets with positive drift).
- **TREND**: sign of the sum of the previous 60 sessions' r (strictly before t), on all 28.

## Sizing arms

Returns are put in units of each instrument's own train-median σ (so instruments are comparable and the portfolio is
not dominated by one market): u_t = r_t / median_train(σ_A0).

- **FLAT** (constant risk): w = 1.
- **A0 / A2 / A3 / A4** (vol target): w_t = clip(median_train(σ_X) / σ_X,t , 0, 2), then divided by its train mean so
  the average exposure equals FLAT's. Cap 2× = no more than twice normal size on the quietest days.

Average exposure is matched by construction, so per-session trading costs are equal in expectation across arms; the
comparison is gross of costs and says so.

P&L per instrument-session = direction × w × u. Portfolio = equal-weight sum across instruments per session.
Train = sessions < 2025-09-05 (only the scale factors above, and A3's k, are fitted there).

## Measures and pass rules

Evaluated on the **full common sample** (nothing but scale is fitted, and scale cannot change a ratio) and reported
separately for the test window (2025-09-05 →).

- **PRIMARY — risk stability (what vol targeting is for):** the standard deviation, across calendar months, of the
  portfolio's monthly realised volatility (daily P&L std within the month). Lower = steadier risk.
  - *Vol targeting works* if the A2 arm is lower than FLAT for **both** LONG and TREND.
  - *The σ matters* if A2 is lower than A0 for both LONG and TREND.
- **SECONDARY — Sharpe and drawdown:** annualised Sharpe and max drawdown per arm. A Sharpe difference vs FLAT (and A2
  vs A0) is called real only if its 90% moving-block bootstrap interval (blocks of 21 sessions, 2,000 draws) excludes
  zero. Otherwise "within noise".
- Reported, no rule: per-class results (indices / gold / majors / crosses), tail share of |daily P&L| > 3 × its std.

Prior stated up front: vol targeting should steady risk almost by construction; whether it lifts Sharpe depends on
volatility and returns being negatively related (Moreira–Muir found it for equities, weaker elsewhere). A flat Sharpe
with steadier risk is still a usable answer: it buys the same return with a smaller worst month.

## Outcome handling

Offline only. No bot or live sizing changes from this test; a pass is a reason to put a sizing column on the shadow
screen, not to change position sizes.
