# Chapter 4 -- Asia Range Extension Engine

## MacroFXModel Adaptive Probabilistic Multi-Model Trading Engine

------------------------------------------------------------------------

# Purpose

The Asia Range Extension Engine provides the primary spatial framework
for the MacroFXModel.

Its objective is not to predict direction but to identify **where**
statistically meaningful decisions are most likely to occur. Every
trading day begins by calculating projected extension levels from the
completed Asian session. These become the engine's initial Areas of
Interest.

------------------------------------------------------------------------

# Design Philosophy

The engine treats Asia Range Extensions as a navigation system.

They answer one question:

> **"Where should the system pay attention today?"**

They do **not** answer:

-   Should the market reverse?
-   Should the market break out?
-   Should a trade be entered?

Those decisions belong to downstream engines.

------------------------------------------------------------------------

# Inputs

The engine requires:

-   Asian session High
-   Asian session Low
-   Asian session Range
-   Trading day
-   Asset configuration
-   Session calendar
-   Historical extension statistics

------------------------------------------------------------------------

# Calculation Workflow

``` text
Complete Asian Session
        │
        ▼
Measure High–Low Range
        │
        ▼
Calculate Extension Ratios
        │
        ▼
Generate Candidate Levels
        │
        ▼
Pass Levels to Decision Zone Builder
```

------------------------------------------------------------------------

# Extension Levels

Typical extension ratios may include:

-   1.000
-   1.272
-   1.618
-   2.000
-   2.618
-   3.618

The exact ratios should remain configurable and validated through
historical testing.

------------------------------------------------------------------------

# Dynamic Rather Than Fixed

The engine never assumes a particular extension will always act as
support or resistance.

Instead, each level is assigned a probability based on:

-   Volatility regime
-   Historical behaviour
-   Time of day
-   Market state
-   Asset type

------------------------------------------------------------------------

# Relationship with Volatility

Range Extensions define **location**.

The Volatility Engine defines **expected statistical movement**.

When both indicate the same area, confidence increases substantially.

Example:

  Model                Level
  ----------------- --------
  Asia Extension      1.1850
  Median Forecast     1.1849
  75th Percentile     1.1852

These values become one Dynamic Decision Zone.

------------------------------------------------------------------------

# Relationship with Options

Current positioning modifies interpretation.

Examples include:

-   Call Walls
-   Put Walls
-   Gamma Flip
-   Max Pain

A range extension aligned with a major options level becomes
significantly more important than an isolated extension.

------------------------------------------------------------------------

# Interaction with Market State

Market State determines how extensions are interpreted.

Examples:

-   Trend → continuation beyond extensions more likely.
-   Mean Reversion → rejection from stretched extensions more likely.
-   Dealer Controlled → options positioning may dominate.
-   Volatility Expansion → wider extensions become achievable.

The same level therefore behaves differently under different regimes.

------------------------------------------------------------------------

# Monitoring Logic

When price approaches an extension:

1.  Increase monitoring.
2.  Update probability estimates every bar.
3.  Evaluate liquidity behaviour.
4.  Evaluate dealer positioning.
5.  Evaluate momentum and regression.
6.  Decide whether an edge exists.

The level itself never triggers a trade.

------------------------------------------------------------------------

# Outputs

The engine publishes:

-   Extension levels
-   Distance from current price
-   Statistical importance
-   Historical hit rate
-   Confidence
-   Supporting metadata

These outputs feed directly into the Decision Zone Builder.

------------------------------------------------------------------------

# Pseudocode

``` text
Load Asian session

Measure range

Calculate configured extensions

Attach historical statistics

Publish extension object

Send to Decision Zone Builder
```

------------------------------------------------------------------------

# Backtesting Requirements

Evaluate:

-   Frequency of extension touches
-   Reversal probability
-   Breakout probability
-   Time-of-day effects
-   Asset-specific behaviour
-   Regime-specific behaviour
-   Interaction with volatility forecasts
-   Interaction with options positioning

------------------------------------------------------------------------

# Future Enhancements

Potential improvements include:

-   Adaptive extension ratios
-   Machine-learned weighting
-   Bayesian confidence updates
-   Regime-specific extensions
-   Cross-asset calibration
-   Multi-session extensions (London and New York)

------------------------------------------------------------------------

# Summary

The Asia Range Extension Engine is the spatial foundation of the
MacroFXModel.

It identifies where attention should be focused, allowing subsequent
modules to determine whether those areas represent continuation,
exhaustion, breakout or reversal opportunities.

By separating **location** from **decision-making**, the architecture
remains modular, explainable and statistically testable.
