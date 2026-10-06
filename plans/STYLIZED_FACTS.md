# Lesson 3's measurements on our instruments (compliance action A3)

`python analysis/system/stylized_facts.py` → `analysis/output/stylized_facts.{json,csv,log}`. 34 instruments, NY-close
daily bars to 2026-08-21 (the lockbox holdout begins after), 5-minute returns from M1 for jumps. 2026-10-06.

| measure | our median (34 instruments) | Lesson 3 (simulated GARCH / jump diffusion) |
|---|---|---|
| autocorrelation of daily returns, lag 1 | −0.025 (indices −0.108, FX/gold −0.017) | +0.006 |
| autocorrelation of absolute returns, lags 1 / 20 / 60 | 0.175 / 0.066 / 0.049 | 0.17 / 0.11 / 0.02 |
| GARCH(1,1) persistence α + β | 0.968 (IQR 0.947–0.986) | 0.98 |
| half-life of a volatility shock | 25 days (IQR 13–48; range 7.5 USDCHF/AUDCAD … 391 EURGBP) | 34 days |
| excess kurtosis, 1 day / 1 week / 1 month | 5.6 / 2.4 / 2.5 | 24.7 / – / 1.18 |
| jump share of total variance (5-min RV − bipower) | 11.7% (9–19%; DE30 highest) | 41% |

## What it confirms

- **Lesson 3 §02 holds on our data**: the size of moves has memory (|r| autocorrelation 0.18 at one day, still 0.05 at
  sixty), direction has almost none. This is why layer 3 forecasts volatility and layer 4 found no direction at the lines.
- **Persistence is high but varies by instrument by a factor of 50** (half-life 7.5 to 391 days). A single fixed
  estimator (yz_10, EWMA 0.94) cannot match every instrument's memory. HAR mixes 1-, 5- and 22-day components, which is
  the structural reason it beat the live estimators in layer 3.
- **Jumps are real but a smaller share than the lesson's example** (≈12% of variance vs 41%): our markets are mostly
  diffusive, with jumps concentrated in specific moments — matching the stop-risk map (layer 7: stops clean within the
  week, not across weekends and release minutes).

## What differs from the lesson, and what it means for the build

- **Fat tails do not thin by the month.** Kurtosis falls from day to week (5.6 → 2.4) but not further (2.5 at a month;
  71% of instruments still ≥ 1). Lesson 3's 1/h decline assumes independent jumps; with volatility clustering, monthly
  returns mix calm and turbulent months and stay fat-tailed (Lesson 1: aggregation drives to normal only for independent
  returns). Consequence: weekly and monthly ladders cannot use √time scaling of the daily ladder; they need their own
  fitted widths (the live ladder's horizons block already does this for some instruments — check before any weekly use).
- **Indices show next-day reversal** (lag-1 return autocorrelation −0.08 to −0.13 on all six indices, about 5 standard
  errors). FX and gold do not (−0.02). Recorded, not chased: it may partly be the 17:00 New York bar boundary on index
  CFDs; it is a direction question for a later lesson, logged as an idea (Lesson 2: record every direction).

## Follow-up: does √time scaling of the daily ladder hold? (`analysis/system/horizon_scaling.py`)

Quantile of week / month high−low ÷ (σ_daily × √h), divided by the same daily quantile (1.00 = √time right), training
years only:

| class | week p50 / p75 / p90 | month p50 / p75 / p90 |
|---|---|---|
| fx majors | 1.04 / 1.01 / 0.99 | 1.04 / 1.03 / 0.99 |
| crosses | 1.03 / 1.01 / 1.00 | 1.04 / 1.02 / 1.02 |
| gold | 1.04 / 1.02 / 1.02 | 1.06 / 1.06 / 1.23 (111 months) |
| indices | 1.05 / 1.07 / 1.04 | **1.12 / 1.13 / 1.15** |

√time is close for FX (within ~4%); index monthly lines would be ~12–15% too tight and gold's monthly p90 ~23% too
tight under √time. The live ladder carries fitted weekly/monthly widths per instrument (`horizons` in
forecastLadderParams.js), so √time only bites where it is the fallback — use fitted horizon widths for indices and gold.
