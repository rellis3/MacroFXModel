# Your vol forecast vs the market's — variance risk premium (pre-registration)

Committed 2026-09-30 before any number was computed.

## Why
Every direction test at the forecast lines failed after spread, but the forecast itself is calibrated
on all 16 instruments tested. What it predicts is SIZE. The market prices size too — implied
volatility. If the forecast knows the coming move better than implied vol charges for it, that is an
edge that uses the vol forecast directly.

## Instruments and data
EURUSD, GBPUSD, AUDUSD, USDCAD, USDCHF, USDJPY, Gold (CME CVOL `cvol`, js/data/cmeCvolEod.json, 30-day
implied vol, annualised %), 2016 → 2026-08. Daily bars = completed 17:00-New-York days built from local
M1 (js/voteAtlasV4Lines.js nyCloseDailyBars).

## Monthly trade (non-overlapping)
Entry: the last NY daily close of each calendar month (day D). Using only information known at D's close:
- **IV** = CVOL settle dated D (CME end-of-day; if missing, the latest settle ≤ D);
- **F** = your forecast σ: `forecastSigma` over NY daily bars through D with the instrument's fitted
  estimator (the same σ your ladder is built on), annualised × √252, in %.
Exit: 21 NY trading days later. **RV** = √(252 × mean of squared daily log returns over days D+1…D+21), %.
**Short-variance payoff (vega-notional units)** = (IV² − RV²) ÷ (2 × IV), in vol points.
**Cost:** 0.4 vol points per trade (a round trip across a typical FX option bid-ask); also reported at 0.8.

## Strategies
- **A — always short** (every month): the unconditional premium.
- **B — short only when the market is rich vs your forecast:** IV > F (else flat).
- **C — the spread:** B minus A is the forecast's contribution.

## Pass (pre-registered)
1. **B beats A per month** (paired: the months B trades, vs A's same months AND A's all months):
   B's mean net payoff > A's mean net payoff over all months, with a paired t ≥ 2.0, pooled over the
   7 instruments.
2. B's mean net payoff > 0 in BOTH 2016–2022 and 2023–2026-08.
3. Reported regardless: A's premium, hit rate, worst month, skew, and the correlation of (IV − F) with
   the realised premium (IV − RV).

## Causality
No parameter is fitted on this data (the estimator and its params come from the existing forecast).
The builder aborts unless, for sampled months, F is identical when every M1 bar after D's 17:00-NY close
is replaced with a different random walk.
