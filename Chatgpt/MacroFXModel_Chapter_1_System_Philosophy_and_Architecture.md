# Chapter 1 -- System Philosophy & Architecture

## MacroFXModel Adaptive Probabilistic Multi-Model Trading Engine

**Version 1.0**

------------------------------------------------------------------------

# 1. Purpose

The purpose of this project is **not** to build another technical
indicator or another trading strategy.

The objective is to build a **market decision engine** that continuously
estimates:

-   What type of market currently exists.
-   Where the highest-quality decision areas are.
-   Which participants currently control price.
-   Whether continuation or mean reversion is statistically favoured.
-   Whether the expected distribution of future returns has changed
    sufficiently to justify entering a position.

The engine is designed to operate across:

-   Forex
-   Equity Indices
-   Commodities

using a common architecture while allowing asset-specific calibration.

------------------------------------------------------------------------

# 2. Core Philosophy

Most retail trading systems begin with an indicator.

Examples include RSI thresholds, moving-average crossovers, or price
touching support/resistance.

Those systems ask:

> **Has my signal occurred?**

This engine asks:

> **What is the market currently trying to do?**

The objective is to reason about market behaviour rather than react to
isolated signals.

------------------------------------------------------------------------

# 3. The Market is a Collection of Independent Models

No single model explains every move.

The engine combines independent evidence from:

## Statistical

-   Volatility
-   Expected Range
-   Standard Deviation
-   ATR
-   Historical Persistence

## Structural

-   Previous High/Low
-   VWAP
-   Asia Range Extensions
-   Weekly Levels
-   Volume Profile

## Positioning

-   Call Walls
-   Put Walls
-   Gamma Flip
-   Max Pain
-   Dealer Gamma

## Macro

-   Yield Spreads
-   Interest Rates
-   Inflation
-   Growth
-   Credit
-   Risk Appetite

## Liquidity

-   Session Highs/Lows
-   Stop Clusters
-   Liquidity Sweeps

Each model answers a different question. None should be treated as
universally dominant.

------------------------------------------------------------------------

# 4. Why Traditional Confluence Fails

Traditional systems often require every indicator to agree before
trading.

Instead, this engine recognises that different market states are driven
by different forces.

The importance of each model changes throughout the trading session.

------------------------------------------------------------------------

# 5. Adaptive Intelligence

Rather than asking:

> Do the indicators agree?

The engine asks:

> Which model deserves the greatest weight right now?

Example weighting:

Dealer Controlled Day

  Model          Weight
  ------------ --------
  Dealer            40%
  Volatility        20%
  Macro             15%
  Regression        10%
  Liquidity         10%
  Momentum           5%

------------------------------------------------------------------------

# 6. Dynamic Decision Zones

The engine abandons single trading levels.

Instead it builds **Dynamic Decision Zones** by clustering independent
evidence.

Example:

-   Asia Extension
-   Call Wall
-   Expected Range
-   Regression +2σ
-   VWAP

↓

**One Decision Zone**

The zone is more important than any individual line.

------------------------------------------------------------------------

# 7. Asia Range Extensions

Asia Range Extensions form the spatial framework of the engine.

They answer:

> Where should the engine pay attention?

They define Areas of Interest, not automatic entries.

------------------------------------------------------------------------

# 8. Volatility Integration

Volatility strengthens or weakens Asia Range Extensions.

Example:

-   Asia Extension: 1.1850
-   Median Projection: 1.1849
-   75th Percentile: 1.1852
-   High/Low Exhaustion: 1.1851

These cluster into one statistically significant zone.

------------------------------------------------------------------------

# 9. Continuous Observation

The engine continuously updates probabilities.

Workflow:

1.  Price approaches a decision zone.
2.  Monitoring intensity increases.
3.  Market state updates.
4.  Probabilities change.
5.  Trade executes only when edge exceeds threshold.

------------------------------------------------------------------------

# 10. Market State Engine

Possible states include:

-   Trend
-   Mean Reversion
-   Dealer Controlled
-   Liquidity Driven
-   Macro Driven
-   Volatility Expansion
-   Compression
-   Distribution
-   Accumulation
-   Transition

Every downstream model adapts to the detected state.

------------------------------------------------------------------------

# 11. Probability Engine

The engine estimates:

-   Long Probability
-   Short Probability
-   Expected Return
-   Expected Holding Time
-   Expected Stop Distance
-   Target Distribution
-   Confidence

It never trades because a line was touched.

It trades because the expected distribution of future returns changes
sufficiently.

------------------------------------------------------------------------

# 12. Trade Lifecycle

Research

↓

Forecast

↓

Decision Zone Creation

↓

Market State Detection

↓

Live Monitoring

↓

Probability Updates

↓

Execution

↓

Risk Management

↓

Exit

↓

Learning

------------------------------------------------------------------------

# 13. Multi-Asset Design

The same architecture supports:

-   Forex
-   Equity Indices
-   Commodities

Only calibration parameters change.

------------------------------------------------------------------------

# 14. Summary

MacroFXModel is not an indicator.

It is a hierarchical market decision engine that combines macro,
volatility, structural, positioning, liquidity and regression models
into a continuously updated probabilistic estimate of market behaviour.

The objective is to identify statistically meaningful edges---not
isolated technical signals.
