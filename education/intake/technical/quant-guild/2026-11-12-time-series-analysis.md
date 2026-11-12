# Time Series Analysis for Quant Finance

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci (tag every claim) |
| URL | https://www.youtube.com/watch?v=JwqjuUnR8OY |
| ReelScribe id | j5706ym8jzwydpp8dax9646sa98j2r1g · 44:00 |
| Notebook | `2025 Video Lectures/44. Time Series Analysis for Quant Finance/time_series_analysis_for_quant_finance.ipynb` |
| Recorded | 2025 (notebook copyright); exact date unknown |
| Processed | 2026-11-12 |

## Lesson
A time series is a set of observations of something underneath it: a company, the weather, a body. The series can be
split into trend, seasonality and shock, but none of those has to stay put. Time series analysis has three jobs:
**filtering** (the current state, from past and present data), **smoothing** (a past state, using later data too) and
**forecasting**. A forecast is not a prediction. It is a conditional expectation that holds only "if status quo
continues". A break (an earnings jump, an injury, 2008 mortgage defaults) is invisible to the series until it prints,
so the only way to see it early is information from outside the series (options for a scheduled event, alternative
data for an unscheduled one). Even so, a model that is wrong but "correct on average" can make money. His dice-market
demo quotes a spread around a moving-average mid and still earns while the true mean wanders.

## Approach
- **Question**: always "what job: filter, smooth or forecast?" and "what does this series not know?" The forecast is
  judged as an expectation, not a hit rate ("the literal best guess for a die is 3.5, which it can never land on").
- **Model choice**: the simplest tool that does the job. A moving average is used as a filter (his words: "This is not
  predictive"). A Kalman filter prices an illiquid instrument from liquid proxies, a pricing job where he says no
  alternative data is needed. For a scheduled jump, he would forecast "in two states of the world using the option
  market, using the straddle", which gives size and not direction.
- **Validation**: none in this lecture. Every demo uses synthetic data with a fixed seed.
- **Statistics**: expectation minimises MSE. Assumptions differ in how much they hurt: no-arbitrage is mild, constant
  vol is "violently wrong" but still useful because inverting it gives IV.
- **Failure modes**: treating `fit().predict()` output as a prediction; assuming stationarity because the class did;
  forgetting the economic thing under the line.
- **Kill rule**: a break the model can't see. He does not give a way to detect one.

## What the code actually does
- The **"smoothing" panel is a one-sided EWMA** (`smoothed[i] = a*p[i] + (1-a)*smoothed[i-1]`). It is causal, so it is
  a filter. The lecture says it uses future values. A real smoother needs a two-sided kernel or an RTS pass.
- The **"confidence bands"** are ±2 × the standard deviation of the filtered level over the whole series. That is a
  spread of levels, not uncertainty about the state, and it uses the whole path.
- The **"forecast" panel is one simulated random path** with a constant-width band. That contradicts his own point that
  a forecast is an expectation, and the band should grow like √h.
- **Kalman demo**: Q and R are fixed by hand (0.01, 0.1), not estimated. The second proxy is `1.1 × true price`, so
  the averaged innovation is about 5% too large (no hedge ratio).
- **Market-making demo**: arrivals are uninformed, so the P&L is spread capture. There is no adverse selection, which
  is the part that makes "correct on average" hard in real markets. He mentions it only as "a different host of risks".

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | "Forecasts are not predictions, they're expectations… if status quo" (QG) | method | ON FILE (as practice): memory "forecast = how much, not which way"; every mechanical direction call NULL (e.g. `gr-hmm-trend-direction`) |
| 2 | "There really is no reliable tests for stationarity" (QG) | method | ALREADY DO in effect: ADF used only as a diagnostic (`forge/run_residual.py`), never as a gate |
| 3 | Scheduled jump: use the straddle, two states, size not direction (QG) | mechanism | PARTLY: IV-adjusted σ (`forecast-pick`), VIX9D/VIX front (`combined-range`, `vol-curve-front`); not an event-specific implied move |
| 4 | A wrong-but-unbiased mid still earns the spread (QG) | trading | Not ours to test (we are not a market maker); demo has no adverse selection |
| 5 | Alternative data can see a break before the price (QG) | mechanism | Not testable as stated |
| 6 | A moving average filters, it does not predict (QG) | method | ON FILE: memory "approach speed same at random prices", line-touch nulls |

## What we could learn
- **Name the job and what the series can't see.** ALREADY DO: Already-do table row "name the job"; `event-day context`
  and Release Reaction tag the scheduled breaks. A repeat, worth a citation.
- **A forecast's uncertainty must widen with horizon, and a "band" must be about the state, not the level.** ALREADY DO:
  pinball/quantile lines with horizon widths (`horizon-reversion`, data-rules "don't √time-scale").
- **Check the code against the words** (smoother that is a filter, forecast that is a path). REPEAT of #1 (known-answer
  check) and memory "audit mechanics first".

## Research ideas
- Event-specific implied move (straddle) as the event-day σ: not carded. VIX9D/VIX already in `combined-range`, and
  FX weekly event straddles are not in our data (CME settlements are monthly ATM).

## Quotes
- "Without a crystal ball, there's no such thing as a prediction."
- "If you throw a moving average over a chart… it says nothing of what the future state's going to be."
- "If status quo, that expectation might be reasonable. If not status quo, it is terribly unreasonable."
- "Even though my model is wrong and I am certain it's wrong, I was able to make money."
