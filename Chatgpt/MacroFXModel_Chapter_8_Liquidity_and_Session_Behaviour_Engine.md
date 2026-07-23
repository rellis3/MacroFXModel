# Chapter 8 -- Liquidity & Session Behaviour Engine

## MacroFXModel Adaptive Probabilistic Multi-Model Trading Engine

------------------------------------------------------------------------

# Purpose

The Liquidity & Session Behaviour Engine provides the market context
required to understand *why* price moves to specific locations and
*when* those movements are most likely to occur.

Rather than treating price movement as random, this engine models the
interaction between institutional liquidity, trading sessions, market
participation, and order flow. Its outputs help determine whether price
is seeking liquidity, accepting value, or transitioning into a new phase
of trading.

------------------------------------------------------------------------

# Design Philosophy

Markets require liquidity to facilitate large institutional
transactions.

Price often travels **towards** liquidity before travelling **away**
from it.

Therefore, the engine asks:

> **"Where is liquidity likely to exist, and how is the market
> interacting with it?"**

The goal is not to predict every liquidity sweep but to recognise when
liquidity behaviour materially changes the probability of continuation
or reversal.

------------------------------------------------------------------------

# Responsibilities

The Liquidity & Session Behaviour Engine is responsible for:

-   Identifying liquidity pools
-   Detecting liquidity sweeps
-   Monitoring session behaviour
-   Tracking intraday participation
-   Measuring session volatility
-   Publishing liquidity context
-   Supporting Market State classification

------------------------------------------------------------------------

# Core Inputs

Typical inputs include:

-   Previous Day High and Low
-   Previous Week High and Low
-   Session Highs and Lows
-   VWAP
-   Volume Profile
-   Naked Points of Control
-   Intraday Volume
-   Session Opens
-   Session Closes
-   Time of Day
-   Economic Calendar

------------------------------------------------------------------------

# Session Framework

The trading day is divided into logical market sessions.

Typical sessions include:

  Session                    Characteristics
  -------------------------- -----------------------------------------------
  Asian                      Lower volatility, range formation
  London Open                Liquidity expansion, directional moves
  London--New York Overlap   Highest participation and volatility
  New York Afternoon         Trend continuation or exhaustion
  Market Close               Reduced participation and position adjustment

Each session has unique statistical behaviour.

------------------------------------------------------------------------

# Liquidity Pools

The engine identifies areas where resting orders are likely to exist.

Examples include:

-   Previous Highs
-   Previous Lows
-   Equal Highs
-   Equal Lows
-   Swing Points
-   VWAP
-   Major Decision Zones
-   Call Walls
-   Put Walls

Liquidity pools are stored as objects containing:

-   Price
-   Estimated Importance
-   Type
-   Session
-   Historical Reliability

------------------------------------------------------------------------

# Liquidity Sweeps

A liquidity sweep occurs when price moves through a known liquidity pool
before rapidly changing behaviour.

The engine records:

-   Sweep direction
-   Distance travelled
-   Time of occurrence
-   Follow-through
-   Reversal strength

These observations influence both the Market State Engine and
Probability Engine.

------------------------------------------------------------------------

# Session Behaviour Analysis

The engine measures:

-   Average session range
-   Median session move
-   Session volatility
-   Session persistence
-   Directional bias
-   Time spent above/below VWAP
-   Opening range behaviour

These statistics help calibrate expectations for the remainder of the
trading day.

------------------------------------------------------------------------

# Time-of-Day Behaviour

Certain market behaviours occur more frequently during specific periods.

Examples:

-   London Open: Breakout probability increases.
-   London Lunch: Reduced volatility.
-   US Cash Open: Liquidity and volatility increase.
-   Final Hour: Position adjustment and profit taking.

The engine adjusts monitoring intensity accordingly.

------------------------------------------------------------------------

# Interaction with Decision Zones

Decision Zones become significantly more important when:

-   They coincide with major liquidity pools.
-   They occur during high-participation sessions.
-   They align with historical session behaviour.

The engine increases the priority of these zones before forwarding them
to the Probability Engine.

------------------------------------------------------------------------

# Interaction with Market State

Liquidity behaviour helps distinguish market regimes.

Examples:

-   Repeated liquidity sweeps → Liquidity Driven.
-   Acceptance above VWAP → Trend.
-   Failed breakout after sweep → Mean Reversion.
-   Compression around session open → Potential Volatility Expansion.

------------------------------------------------------------------------

# Outputs

The engine publishes:

-   Active Session
-   Liquidity Map
-   Session Statistics
-   Sweep Events
-   Session Confidence
-   Time-of-Day Profile
-   Liquidity Context Score

These outputs are consumed by the Market State Engine and Probability
Engine.

------------------------------------------------------------------------

# Pseudocode

``` text
Load session calendar

Identify active session

Calculate session statistics

Locate liquidity pools

Monitor sweep events

Update liquidity context

Publish Session Object
```

------------------------------------------------------------------------

# Backtesting Requirements

Evaluate:

-   Sweep success rate
-   Reversal probability after sweep
-   Breakout probability by session
-   Session-specific expectancy
-   Time-of-day profitability
-   Interaction with Decision Zones
-   Cross-asset behaviour

The objective is to determine whether incorporating liquidity and
session information improves decision quality compared with price-only
models.

------------------------------------------------------------------------

# Future Enhancements

Potential developments include:

-   Real-time order book integration
-   Footprint and delta analysis
-   Volume imbalance detection
-   Auction Market Theory metrics
-   Adaptive liquidity scoring
-   Institutional execution modelling

------------------------------------------------------------------------

# Summary

The Liquidity & Session Behaviour Engine provides the contextual layer
that explains **when** and **why** price interacts with important areas.

By combining liquidity mapping, session statistics and intraday
behavioural analysis, the engine allows the MacroFXModel to distinguish
between meaningful institutional activity and ordinary market noise.

This transforms static price levels into dynamic, context-aware
opportunities and significantly improves the quality of downstream
probability and execution decisions.
