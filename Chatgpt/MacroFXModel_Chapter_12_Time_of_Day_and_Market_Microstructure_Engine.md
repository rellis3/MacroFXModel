# Chapter 12 -- Time-of-Day & Market Microstructure Engine

## MacroFXModel Adaptive Probabilistic Multi-Model Trading Engine

------------------------------------------------------------------------

# Purpose

The Time-of-Day & Market Microstructure Engine models how market
behaviour changes throughout the trading day.

Rather than assuming that price behaves identically at all hours, this
engine recognises that participation, liquidity, volatility, execution
quality and institutional activity vary significantly depending on the
trading session and time.

Its objective is to answer:

> **"Given the current time and market structure, how should the engine
> adapt its expectations and execution?"**

------------------------------------------------------------------------

# Design Philosophy

Time is treated as a predictive feature.

The probability of a breakout at the London Open differs materially from
the probability of a breakout during the London lunch period or the
final hour of New York trading.

Similarly, market microstructure influences:

-   Spread behaviour
-   Liquidity
-   Volatility
-   Order execution
-   Price persistence

These characteristics are incorporated into every trading decision.

------------------------------------------------------------------------

# Responsibilities

The engine is responsible for:

-   Classifying the active trading session
-   Measuring time-of-day behaviour
-   Estimating execution quality
-   Detecting opening and closing auction effects
-   Monitoring intraday volatility cycles
-   Publishing temporal context
-   Supporting execution timing

------------------------------------------------------------------------

# Core Inputs

Typical inputs include:

-   Timestamp
-   Trading session
-   Exchange calendars
-   Holiday schedules
-   Intraday volatility
-   Bid-ask spread
-   Tick frequency
-   Volume
-   Economic event calendar
-   Session overlap schedule

------------------------------------------------------------------------

# Session Classification

The engine divides the day into logical phases.

  Phase                      Characteristics
  -------------------------- --------------------------------------------
  Asian Session              Lower participation, range formation
  Frankfurt Open             Liquidity begins increasing
  London Open                Expansion, breakout potential
  London Morning             Strong directional moves
  London Lunch               Reduced activity
  New York Open              High liquidity and volatility
  London--New York Overlap   Maximum participation
  New York Afternoon         Trend continuation or exhaustion
  Market Close               Position adjustments and reduced liquidity

Each phase has unique statistical characteristics.

------------------------------------------------------------------------

# Microstructure Features

The engine measures:

-   Average spread
-   Tick arrival rate
-   Volume concentration
-   Session volatility
-   Liquidity depth (where available)
-   Opening range behaviour
-   Closing behaviour

These features influence execution confidence.

------------------------------------------------------------------------

# Intraday Behaviour Models

Historical analysis is used to estimate:

-   Probability of breakout
-   Probability of reversal
-   Typical range expansion
-   Median move by hour
-   Average holding time
-   Expected volatility by session

These statistics become contextual modifiers rather than trading
signals.

------------------------------------------------------------------------

# Interaction with Decision Zones

Decision Zones become more or less significant depending on the active
session.

Examples:

-   London Open → breakout probability increases.
-   New York Afternoon → exhaustion probability increases.
-   Lunch session → higher execution thresholds.

The engine adjusts monitoring intensity accordingly.

------------------------------------------------------------------------

# Interaction with Market State

Time-of-day modifies Market State confidence.

Examples:

-   Compression before London Open may increase the probability of
    Volatility Expansion.
-   Dealer influence may strengthen near option expiry.
-   Macro events temporarily override normal intraday behaviour.

------------------------------------------------------------------------

# Interaction with Probability Engine

The engine contributes:

-   Time-of-day confidence
-   Execution quality estimate
-   Session-specific expectancy
-   Recommended monitoring frequency

These values adjust the final trade probability.

------------------------------------------------------------------------

# Outputs

The engine publishes:

-   Active Session
-   Time Phase
-   Execution Quality Score
-   Expected Volatility
-   Session Confidence
-   Monitoring Intensity
-   Temporal Context Object

------------------------------------------------------------------------

# Pseudocode

``` text
Load exchange calendar

Determine active session

Measure current microstructure

Estimate execution quality

Load historical intraday statistics

Generate temporal context

Publish Time Context Object
```

------------------------------------------------------------------------

# Backtesting Requirements

Evaluate:

-   Performance by session
-   Performance by hour
-   Breakout frequency
-   Reversal frequency
-   Execution quality
-   Slippage
-   Spread behaviour
-   Interaction with Decision Zones
-   Market State accuracy by session

The objective is to determine whether incorporating temporal information
improves execution quality and overall expectancy.

------------------------------------------------------------------------

# Future Enhancements

Potential developments include:

-   Tick-level modelling
-   Order book imbalance
-   Queue position estimation
-   Auction dynamics
-   Adaptive session boundaries
-   Real-time execution analytics

------------------------------------------------------------------------

# Summary

The Time-of-Day & Market Microstructure Engine provides the temporal
context required to understand how market behaviour evolves throughout
the trading day.

By modelling session-specific behaviour, execution quality and intraday
market structure, it enables the MacroFXModel to adapt its expectations
dynamically, improving both trade timing and execution while maintaining
consistency with the broader probabilistic architecture.
