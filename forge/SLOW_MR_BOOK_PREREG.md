# Slow mean-reversion book — pre-registration

Committed 2026-09-30 before any number was computed.

## Why
Study 2 (forge/RUBBER_BAND_PREREG.md): the pull-back toward fair value grows with timeframe —
reversion-to-cost 0× intraday, 0.6× at a 5-day mean, 2.7× at a 20-day mean with a 5-day hold —
but the discrete |z| ≥ 2 trades were too noisy to pass (t ≈ 1). The theory lab's fixes for a real but
noisy signal: a continuous position instead of on/off, volatility-scaled sizing, and risk-balanced
combination across many instruments (skill × √breadth).

## Instruments
The 28 of Study 2 (7 USD pairs, 8 + 12 crosses, gold), local M1, 2016 → 2026-08.

## Signal and position (fixed; nothing fitted)
Decision once per London day at 07:00 London (first bar at or after open + 7h), from data before that bar:
- fair value = mean of the previous 20 London days' closes; px = close of the bar before 07:00;
- z = (px − fair value) ÷ (σ_day · open · √5), σ_day = the day's forecast σ (js/voteAtlasV4Lines.js);
- **s = −clip(z / 2, −1, +1)** (fade the stretch, full size at |z| ≥ 2);
- position = s ÷ σ_day (every instrument risks the same per day).
Held from the 07:00 bar's OPEN to the next London day's 07:00 bar's OPEN.
**Daily P&L (risk units)** = s × (move ÷ (σ_day · open)) − (cost ÷ 2) × |s − s_prev| ÷ σ_day-scaled,
with cost = `costForPair` round trip (half per unit of position traded).

## Book
- **Primary:** equal-risk — each day, the average of the instruments' P&L in risk units.
- **Secondary (reported, not a pass criterion):** HRP weights (Ledoit-Wolf covariance of the sleeves'
  daily P&L over the previous 250 days, quasi-diagonalised, recursive bisection), rebalanced monthly;
  and the book with 2× cost.

## Pass (all required)
1. Annualised Sharpe of the primary book > 0 in BOTH 2016–2022 and 2023–2026-08.
2. **Deflated Sharpe ratio ≥ 0.95** on the full period (Bailey & López de Prado, with the book's skew
   and kurtosis) counting N = 4 trials (the three Study 2 speeds + this book). Also reported at N = 20
   (every pre-registered test run on 2026-09-30).
3. The instrument's own sleeve has a positive Sharpe on at least 17 of 28.

## Causality
The builder aborts unless, for sampled days, z and s are identical when the 07:00 bar and everything
after it are replaced with a different random walk, and the entry price is identical when everything
after the 07:00 bar is replaced.
