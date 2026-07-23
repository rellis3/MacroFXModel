# Chapter 9 -- Options, Gamma & Dealer Positioning Engine

## MacroFXModel Adaptive Probabilistic Multi-Model Trading Engine

------------------------------------------------------------------------

# Purpose

The Options, Gamma & Dealer Positioning Engine incorporates derivatives
market positioning into the MacroFXModel to improve contextual awareness
during trade execution.

Unlike the forecasting engines, which derive expectations from
historical behaviour, this engine measures **today's positioning**. It
explains how dealer hedging, option open interest and gamma exposure may
influence intraday price behaviour.

Its role is to answer:

> **"How are options market participants likely to influence price
> today?"**

------------------------------------------------------------------------

# Design Philosophy

Options data is not treated as a standalone trading strategy.

Instead, it provides an independent layer of evidence that can:

-   Strengthen an existing thesis
-   Weaken a forecast
-   Explain unexpected price behaviour
-   Modify execution probabilities

Dealer positioning influences execution---not the long-term statistical
forecast.

------------------------------------------------------------------------

# Responsibilities

The engine is responsible for:

-   Processing option positioning
-   Identifying Call Walls and Put Walls
-   Calculating Gamma Flip regions
-   Estimating Max Pain
-   Detecting dealer positioning bias
-   Publishing options context
-   Supporting Market State classification

------------------------------------------------------------------------

# Core Inputs

Typical inputs include:

-   Option Open Interest
-   Strike Prices
-   Call Open Interest
-   Put Open Interest
-   Gamma Exposure (GEX)
-   Spot Price
-   Expiration Calendar
-   Implied Volatility
-   Changes in Open Interest

Where historical options data is unavailable, the engine operates using
the latest available daily positioning.

------------------------------------------------------------------------

# Key Concepts

## Call Wall

A strike with significant call open interest that may influence price
through dealer hedging.

Possible behaviours:

-   Temporary resistance
-   Breakout acceleration after acceptance
-   Increased hedging activity

------------------------------------------------------------------------

## Put Wall

A strike with significant put open interest.

Possible behaviours:

-   Temporary support
-   Breakdown acceleration after failure
-   Dealer hedge adjustments

------------------------------------------------------------------------

## Gamma Flip

The approximate region where dealer hedging behaviour transitions.

Above the flip:

-   Dealer hedging may dampen volatility.

Below the flip:

-   Dealer hedging may amplify volatility.

The Gamma Flip is treated as a contextual boundary rather than a
guaranteed turning point.

------------------------------------------------------------------------

## Max Pain

The theoretical settlement price where aggregate option holder losses
are greatest.

Max Pain is considered:

-   A reference level
-   A potential price magnet near expiration
-   One input among many

It is never used in isolation.

------------------------------------------------------------------------

# Dealer Positioning

Dealer positioning is inferred from available options data.

Possible classifications include:

  State           Interpretation
  --------------- ------------------------------------
  Long Gamma      Volatility suppression more likely
  Short Gamma     Volatility expansion more likely
  Neutral Gamma   Limited dealer influence

This information feeds directly into the Market State Engine.

------------------------------------------------------------------------

# Integration with Decision Zones

Options-derived levels become candidate inputs to the Decision Zone
Builder.

Examples:

-   Call Wall + Asia Extension
-   Put Wall + Regression Band
-   Gamma Flip + VWAP
-   Max Pain + Median Volatility Forecast

Clusters of independent evidence receive higher quality scores.

------------------------------------------------------------------------

# Interaction with Market State

Dealer positioning may alter regime probabilities.

Examples:

-   Strong Long Gamma → Compression probability increases.
-   Strong Short Gamma → Volatility Expansion probability increases.
-   Large positioning changes → Transition state becomes more likely.

The engine modifies model weights but does not override other evidence.

------------------------------------------------------------------------

# Interaction with Probability Engine

Options context adjusts probabilities.

Example:

-   Price approaching Call Wall
-   Long Gamma environment
-   Weak momentum

Result:

Continuation probability decreases while rejection probability
increases.

Conversely:

-   Price accepts above Call Wall
-   Short Gamma environment
-   Strong momentum

Result:

Breakout probability increases.

------------------------------------------------------------------------

# Outputs

The engine publishes:

-   Call Walls
-   Put Walls
-   Gamma Flip
-   Max Pain
-   Dealer Position Classification
-   Options Context Score
-   Confidence
-   Expiration Metadata

These outputs are consumed by the Decision Zone Builder, Market State
Engine and Probability Engine.

------------------------------------------------------------------------

# Pseudocode

``` text
Load options dataset

Calculate strike statistics

Identify major Call and Put Walls

Estimate Gamma Flip

Estimate Max Pain

Determine dealer positioning

Publish Options Context Object
```

------------------------------------------------------------------------

# Backtesting Requirements

Evaluate:

-   Reaction probability at Call Walls
-   Reaction probability at Put Walls
-   Behaviour around Gamma Flip
-   Max Pain influence near expiration
-   Performance by dealer regime
-   Interaction with volatility forecasts
-   Interaction with Decision Zones
-   Cross-asset robustness

The objective is to measure whether options positioning improves
execution quality beyond price-only analysis.

------------------------------------------------------------------------

# Future Enhancements

Potential developments include:

-   Intraday options updates
-   Dealer inventory estimation
-   Volatility surface modelling
-   Skew analysis
-   Vanna and Charm exposure
-   Cross-expiration positioning
-   Multi-asset options integration

------------------------------------------------------------------------

# Summary

The Options, Gamma & Dealer Positioning Engine adds a live institutional
positioning layer to the MacroFXModel.

Rather than forecasting price independently, it explains how dealer
hedging and options market structure may influence intraday behaviour.
Combined with volatility forecasts, decision zones, liquidity analysis
and macro context, it enables the Probability Engine to make more
informed and adaptive trading decisions while maintaining a modular,
explainable architecture.
