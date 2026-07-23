# Chapter 5 -- Dynamic Decision Zone Builder

## MacroFXModel Adaptive Probabilistic Multi-Model Trading Engine

------------------------------------------------------------------------

# Purpose

The Dynamic Decision Zone Builder is responsible for converting hundreds
of independent market levels into a small number of high-quality
decision zones.

Rather than treating every level as an individual support or resistance
line, the engine clusters nearby evidence into statistically significant
areas where the probability of meaningful market behaviour increases.

This module transforms **information overload into actionable
structure**.

------------------------------------------------------------------------

# Design Philosophy

Markets rarely reverse because of a single level.

Instead, turning points often occur where multiple independent models
identify approximately the same price.

The Zone Builder therefore answers one question:

> **Where do independent sources of evidence agree that attention should
> increase?**

It deliberately avoids making trading decisions. Its only purpose is to
identify where those decisions deserve investigation.

------------------------------------------------------------------------

# Inputs

The Zone Builder consumes outputs from every analytical engine.

Typical inputs include:

-   Asia Range Extensions
-   Volatility Median Forecast
-   75th Percentile Forecast
-   High--Low Exhaustion Levels
-   VWAP
-   Regression Bands
-   Fair Value Estimates
-   Previous Day High/Low
-   Weekly High/Low
-   Volume Profile HVNs/LVNs
-   Naked Points of Control
-   Call Walls
-   Put Walls
-   Gamma Flip
-   Max Pain
-   Session Highs/Lows

Each level includes metadata such as confidence, source and timestamp.

------------------------------------------------------------------------

# Clustering Process

    Market Levels
          │
          ▼
    Normalise Prices
          │
          ▼
    Group Nearby Levels
          │
          ▼
    Evaluate Evidence
          │
          ▼
    Score Zone Quality
          │
          ▼
    Publish Decision Zones

------------------------------------------------------------------------

# Spatial Clustering

Levels within a configurable tolerance are merged into one candidate
zone.

Example:

  Source               Price
  ----------------- --------
  Asia Extension      1.1850
  Median Forecast     1.1849
  VWAP                1.1852
  Call Wall           1.1851

Instead of four separate levels, the engine creates:

**Decision Zone A**

-   Centre: 1.18505
-   Width: 8 pips
-   Sources: 4

------------------------------------------------------------------------

# Zone Attributes

Every Decision Zone stores:

-   Centre Price
-   Upper Boundary
-   Lower Boundary
-   Width
-   Supporting Models
-   Number of Contributors
-   Confidence Score
-   Historical Reliability
-   Current Market State Compatibility
-   Priority
-   Status (Inactive, Monitoring, Active, Consumed)

------------------------------------------------------------------------

# Zone Quality Score

Suggested weighting:

  Component                    Weight
  -------------------------- --------
  Spatial Confluence              40%
  Independent Evidence            30%
  Historical Reliability          20%
  Market-State Suitability        10%

The score is expressed on a 0--100 scale.

Higher-quality zones receive monitoring before lower-quality zones.

------------------------------------------------------------------------

# Independent Evidence

Multiple levels from the same methodology should not inflate confidence.

Example:

Three volatility-derived levels are less valuable than:

-   One volatility level
-   One options level
-   One regression level

The engine rewards diversity of evidence rather than quantity alone.

------------------------------------------------------------------------

# Dynamic Behaviour

Decision Zones evolve throughout the session.

Events that trigger updates include:

-   New options data
-   Significant volatility changes
-   Market state transitions
-   Session changes
-   Major macro events

Zones may strengthen, weaken, merge or expire.

------------------------------------------------------------------------

# Zone Lifecycle

    Created
       │
       ▼
    Ranked
       │
       ▼
    Waiting
       │
       ▼
    Monitoring
       │
       ▼
    Active
       │
       ▼
    Consumed or Expired

------------------------------------------------------------------------

# Monitoring Trigger

When price enters a zone:

1.  Monitoring frequency increases.
2.  Probability Engine recalculates.
3.  Market State is refreshed.
4.  Liquidity behaviour is evaluated.
5.  Execution Engine waits for sufficient edge.

Entering a zone is **not** an entry signal.

------------------------------------------------------------------------

# Outputs

Each published zone contains:

-   Zone ID
-   Centre Price
-   Width
-   Quality Score
-   Contributing Models
-   Market-State Weight
-   Monitoring Priority
-   Historical Statistics
-   Current Status

These objects become the primary inputs to the Execution Engine.

------------------------------------------------------------------------

# Pseudocode

``` text
Collect candidate levels

Normalise price scale

Cluster nearby levels

Calculate centre and width

Evaluate independent evidence

Compute quality score

Assign monitoring priority

Publish Decision Zones
```

------------------------------------------------------------------------

# Backtesting Requirements

Evaluate:

-   Zone hit frequency
-   Reversal probability
-   Breakout probability
-   Average excursion
-   Zone quality calibration
-   Performance by market state
-   Performance by asset class
-   Forecast improvement over isolated levels

------------------------------------------------------------------------

# Future Enhancements

Potential developments include:

-   Density-based clustering (DBSCAN)
-   Bayesian confidence updates
-   Adaptive zone widths
-   Machine-learning ranking
-   Reinforcement learning for prioritisation
-   Automatic zone decay models

------------------------------------------------------------------------

# Summary

The Dynamic Decision Zone Builder is the organisational core of the
MacroFXModel.

It consolidates independent market evidence into a small number of
statistically meaningful locations, allowing the rest of the platform to
focus computational effort where it is most likely to uncover a genuine
trading edge.

By separating **location identification** from **trade execution**, the
architecture remains modular, explainable and suitable for rigorous
research and continuous improvement.
