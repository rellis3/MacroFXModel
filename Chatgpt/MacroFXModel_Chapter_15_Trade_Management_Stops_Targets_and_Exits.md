# Chapter 15 -- Trade Management (Stops, Targets & Exits)

## MacroFXModel Adaptive Probabilistic Multi-Model Trading Engine

------------------------------------------------------------------------

# Purpose

The Trade Management Engine governs every position after execution.

Its objective is to maximise expected return while protecting capital
through disciplined management of stops, profit targets, partial exits
and adaptive trade adjustments.

Unlike the Execution Engine, which decides **whether to enter**, this
engine decides **how to manage the position until it is closed**.

------------------------------------------------------------------------

# Design Philosophy

Entering a trade is only the beginning of the decision process.

Open positions are continuously reassessed as market conditions evolve.

The engine treats every trade as a dynamic probability rather than a
fixed prediction.

------------------------------------------------------------------------

# Responsibilities

The Trade Management Engine is responsible for:

-   Initial stop placement
-   Profit target generation
-   Partial profit-taking
-   Trailing stop management
-   Break-even logic
-   Time-based exits
-   Volatility-adjusted exits
-   Publishing trade status

------------------------------------------------------------------------

# Core Inputs

The engine consumes:

-   Trade Object
-   Decision Zone Object
-   Market State Object
-   Probability Object
-   Volatility Forecast
-   Liquidity Context
-   Macro Context
-   Current Market Price

------------------------------------------------------------------------

# Trade Lifecycle

``` text
Trade Open
    │
    ▼
Initial Risk Validation
    │
    ▼
Monitor Position
    │
    ▼
Adjust Stops & Targets
    │
    ▼
Partial Exit (Optional)
    │
    ▼
Final Exit
    │
    ▼
Performance Recording
```

------------------------------------------------------------------------

# Initial Stop Placement

Stops should be derived from market structure rather than arbitrary
distances.

Examples:

-   Beyond Decision Zone
-   Beyond recent swing
-   Beyond volatility threshold
-   Beyond liquidity pool

Stop distance should remain consistent with the Position Sizing Engine.

------------------------------------------------------------------------

# Profit Targets

Targets should be generated using multiple sources of evidence,
including:

-   Expected volatility
-   Regression bands
-   Opposing Decision Zones
-   Liquidity pools
-   Call and Put Walls
-   Session exhaustion estimates

The engine may produce several target levels.

------------------------------------------------------------------------

# Partial Profit-Taking

The engine supports staged exits.

Example:

  Target       Position Closed
  ---------- -----------------
  Target 1                 25%
  Target 2                 25%
  Target 3                 50%

Partial exits reduce realised risk while allowing participation in
larger trends.

------------------------------------------------------------------------

# Break-Even Logic

The engine may move the stop-loss to break-even when predefined criteria
are met.

Example triggers:

-   Target 1 achieved
-   Risk multiple exceeded
-   Market State strengthens
-   Probability remains favourable

Break-even adjustments should not occur so early that normal market
noise causes premature exits.

------------------------------------------------------------------------

# Trailing Stops

Trailing stops adapt according to market behaviour.

Possible methods include:

-   ATR-based
-   Volatility-based
-   Swing highs/lows
-   Regression bands
-   VWAP
-   Dynamic Decision Zones

The selected method depends on the active Market State.

------------------------------------------------------------------------

# Time-Based Exits

Not all trades should remain open indefinitely.

Exit conditions may include:

-   Session close
-   Maximum holding period
-   Economic event approaching
-   Probability deterioration

Time exits prevent capital becoming trapped in low-quality positions.

------------------------------------------------------------------------

# Dynamic Reassessment

Open positions are continuously reviewed.

Triggers include:

-   Market State transition
-   Significant volatility change
-   Liquidity sweep
-   Macro event
-   Probability update

Management decisions adapt without requiring a new entry signal.

------------------------------------------------------------------------

# Exit Conditions

Trades may close because of:

-   Stop-loss
-   Profit target
-   Trailing stop
-   Time exit
-   Risk event
-   Probability collapse
-   Manual intervention

Every exit reason should be recorded for future analysis.

------------------------------------------------------------------------

# Published Trade Status

The engine publishes:

-   Current P/L
-   Unrealised Risk
-   Active Stop
-   Active Targets
-   Probability Update
-   Exit Recommendation
-   Trade Status

------------------------------------------------------------------------

# Pseudocode

``` text
Load Trade Object

Monitor live market

Update probabilities

Adjust stop and targets

Evaluate exit conditions

Close trade if required

Publish final trade outcome
```

------------------------------------------------------------------------

# Backtesting Requirements

Evaluate:

-   Average holding time
-   Exit efficiency
-   Profit capture
-   Stop-loss effectiveness
-   Partial exit contribution
-   Trailing stop performance
-   Risk-adjusted expectancy
-   Performance by Market State

The objective is to optimise trade management without introducing
unnecessary complexity.

------------------------------------------------------------------------

# Future Enhancements

Potential developments include:

-   Reinforcement learning for exits
-   Adaptive target optimisation
-   Dynamic holding period estimation
-   Portfolio-aware exit coordination
-   Event-driven exit logic

------------------------------------------------------------------------

# Summary

The Trade Management Engine ensures that every open position evolves
with changing market conditions.

By continuously reassessing probability, volatility, liquidity and
market state, it transforms trade management from a static set of rules
into an adaptive process that seeks to maximise expectancy while
preserving disciplined risk control.
