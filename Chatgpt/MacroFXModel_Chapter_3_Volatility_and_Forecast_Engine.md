# Chapter 3 -- Volatility & Forecast Engine

## MacroFXModel Adaptive Probabilistic Multi-Model Trading Engine

------------------------------------------------------------------------

# Purpose

The Volatility & Forecast Engine converts historical market behaviour
into a forward-looking probabilistic forecast for the current trading
session.

Its purpose is **not** to predict the exact closing price. Instead, it
estimates the statistically likely distribution of price movement,
identifies exhaustion thresholds, and provides the spatial framework
used by the Decision Zone Builder.

------------------------------------------------------------------------

# Objectives

The engine answers five core questions before the session begins:

1.  How volatile is today likely to be?
2.  How far is price expected to travel?
3.  Where does movement become statistically stretched?
4.  At which levels should the execution engine increase monitoring?
5.  How confident is the forecast?

------------------------------------------------------------------------

# Core Inputs

Historical inputs include:

-   Daily OHLC data
-   Intraday OHLC data
-   Realised volatility
-   ATR
-   Day-of-week statistics
-   Session statistics
-   Rolling return distributions
-   Time-of-day behaviour
-   Previous day's range
-   Current implied or proxy volatility (where available)

------------------------------------------------------------------------

# Forecast Outputs

The engine produces a daily forecast object containing:

-   Expected High--Low Range
-   Expected Open--Close Move
-   Median Move
-   75th Percentile Move
-   Volatility Regime
-   Exhaustion Levels
-   Confidence Score
-   Forecast Distribution

These outputs become read-only inputs for downstream modules.

------------------------------------------------------------------------

# Volatility Regimes

Every session is classified into a volatility regime.

Example categories:

-   Extremely Low
-   Low
-   Normal
-   Elevated
-   High
-   Extreme

Regime classification influences:

-   Zone widths
-   Position sizing
-   Stop distances
-   Monitoring frequency
-   Execution thresholds

------------------------------------------------------------------------

# Statistical Foundation

The engine models the distribution of historical movement rather than
relying on a single average.

Useful statistics include:

-   Mean
-   Median
-   Standard deviation
-   Percentiles
-   Tail probabilities
-   Volatility persistence

Median values are preferred where distributions are skewed by occasional
large moves.

------------------------------------------------------------------------

# Forecast Construction

A simplified workflow:

    Historical Data
          │
          ▼
    Feature Engineering
          │
          ▼
    Volatility Estimation
          │
          ▼
    Distribution Construction
          │
          ▼
    Expected Move Forecast
          │
          ▼
    Exhaustion Level Generation
          │
          ▼
    Decision Zone Inputs

------------------------------------------------------------------------

# Exhaustion Levels

Exhaustion levels represent regions where the probability of further
expansion begins to decrease.

These are **areas of increased attention**, not automatic reversal
signals.

When price reaches an exhaustion region, the engine requests additional
evidence from:

-   Market State
-   Options Positioning
-   Liquidity
-   Regression
-   Momentum

------------------------------------------------------------------------

# Integration with Asia Range Extensions

Asia Range Extensions provide structural navigation.

The Volatility Engine provides statistical context.

When both cluster together, confidence increases.

Example:

  Source                   Level
  --------------------- --------
  Asia Extension          1.1850
  Median Forecast         1.1849
  75th Percentile         1.1852
  Exhaustion Estimate     1.1851

The Decision Zone Builder clusters these into one Dynamic Decision Zone.

------------------------------------------------------------------------

# Interaction with Options

Current-session positioning modifies interpretation.

Examples:

-   Call Wall
-   Put Wall
-   Gamma Flip
-   Max Pain

The Volatility Engine does not replace options data; it provides an
independent statistical estimate that can reinforce or contradict dealer
positioning.

------------------------------------------------------------------------

# Time-of-Day Adjustment

Expected behaviour changes throughout the session.

Typical phases include:

-   Asian Session
-   London Open
-   London--New York Overlap
-   New York Afternoon
-   Market Close

Forecast confidence and monitoring frequency adapt as realised movement
consumes the expected daily range.

------------------------------------------------------------------------

# Confidence Score

Each forecast receives a confidence score derived from factors such as:

-   Stability of historical volatility
-   Forecast error history
-   Current regime consistency
-   Data quality
-   Agreement with supporting models

Higher confidence forecasts receive greater influence within the
Probability Engine.

------------------------------------------------------------------------

# Interfaces

## Inputs

-   Historical market database
-   Session statistics
-   Volatility history
-   Market calendar

## Outputs

-   Daily forecast object
-   Exhaustion levels
-   Forecast confidence
-   Volatility regime
-   Expected move distribution

------------------------------------------------------------------------

# Pseudocode

``` text
Load historical data

Estimate realised volatility

Determine volatility regime

Generate expected movement distribution

Calculate median and percentile forecasts

Generate exhaustion thresholds

Publish Forecast Object
```

------------------------------------------------------------------------

# Backtesting Requirements

The engine should be evaluated using:

-   Forecast error
-   Calibration curves
-   Distribution coverage
-   Hit rate of exhaustion zones
-   Stability across assets
-   Walk-forward validation
-   Monte Carlo robustness testing

------------------------------------------------------------------------

# Future Extensions

Potential enhancements include:

-   GARCH-based forecasts
-   Regime-switching volatility models
-   Hidden Markov Models
-   Implied volatility integration
-   Bayesian updating
-   Machine learning ensembles

------------------------------------------------------------------------

# Summary

The Volatility & Forecast Engine transforms historical price behaviour
into a probabilistic description of today's expected trading
environment.

Rather than generating buy or sell signals, it defines where
statistically meaningful movement is likely, where exhaustion becomes
plausible, and supplies the Decision Zone Builder with the information
required for intelligent monitoring and execution.

It is therefore the primary forecasting component of the MacroFXModel
architecture.
