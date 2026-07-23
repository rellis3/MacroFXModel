# Chapter 2 -- System Architecture & Engine Design

## MacroFXModel Adaptive Probabilistic Multi-Model Trading Engine

------------------------------------------------------------------------

# Purpose

This chapter defines the engineering architecture of the MacroFXModel
engine.

The objective is to build a modular, event-driven research and execution
platform where each model performs a single responsibility and
communicates through well-defined interfaces.

------------------------------------------------------------------------

# Design Principles

The engine shall be:

-   Modular
-   Event driven
-   Asset agnostic
-   Probability based
-   Explainable
-   Continuously updating
-   Backtestable

Every module consumes data, produces outputs, and never makes trading
decisions independently.

------------------------------------------------------------------------

# High-Level Architecture

    Market Data
         │
         ▼
    Research Layer
         │
         ▼
    Forecast Layer
         │
         ▼
    Decision Zone Builder
         │
         ▼
    Market State Engine
         │
         ▼
    Probability Engine
         │
         ▼
    Execution Engine
         │
         ▼
    Risk Engine
         │
         ▼
    Trade Manager
         │
         ▼
    Performance & Learning

------------------------------------------------------------------------

# Research Layer

Historical components:

-   Volatility statistics
-   Asia range extension statistics
-   Time-of-day behaviour
-   Session behaviour
-   Regression models
-   Macro relationships
-   Historical regime frequencies

Outputs:

-   Probability tables
-   Forecast parameters
-   Asset calibration

No trades occur here.

------------------------------------------------------------------------

# Forecast Layer

Runs once before the trading session.

Produces:

-   Daily macro bias
-   Expected volatility
-   Median move
-   75th percentile move
-   High-low exhaustion levels
-   Fair value estimate
-   Expected session behaviour

Outputs become today's forecast object.

------------------------------------------------------------------------

# Decision Zone Builder

Collects all candidate levels.

Inputs include:

-   Asia extensions
-   Volatility median
-   Volatility 75th percentile
-   High-low exhaustion
-   Call walls
-   Put walls
-   Gamma flip
-   VWAP
-   Volume profile
-   Previous day/week levels
-   Regression bands

Nearby levels are clustered into Dynamic Decision Zones.

Each zone stores:

-   Centre price
-   Width
-   Contributing models
-   Zone quality
-   Historical reliability
-   Market-state suitability

------------------------------------------------------------------------

# Zone Quality Score

Suggested scoring:

-   Spatial clustering 40%
-   Independent evidence 30%
-   Historical reliability 20%
-   Current regime suitability 10%

Higher scores receive monitoring priority.

------------------------------------------------------------------------

# Market State Engine

Continuously classifies the market.

Possible states:

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

Outputs:

-   State
-   Confidence
-   Expected persistence

This state dynamically changes model weights.

------------------------------------------------------------------------

# Probability Engine

Independent agents provide opinions.

Agents:

-   Macro
-   Volatility
-   Asia Range Extension
-   Options
-   Liquidity
-   Regression
-   Momentum
-   Time-of-Day

Each returns:

-   Long probability
-   Short probability
-   Confidence
-   Expected move
-   Supporting explanation

A meta-model combines the outputs using state-dependent weights.

------------------------------------------------------------------------

# Execution Engine

Execution begins only after price approaches a Decision Zone.

Lifecycle:

1.  Detect zone entry.
2.  Increase monitoring frequency.
3.  Update probabilities every bar.
4.  Detect acceptance or rejection.
5.  Enter only if edge exceeds threshold.

The trigger is a change in expected return distribution, not a level
touch.

------------------------------------------------------------------------

# Risk Engine

Responsibilities:

-   Position sizing
-   Stop placement
-   Target generation
-   Correlation limits
-   Daily loss limits
-   Portfolio exposure
-   News filters

Risk adapts to volatility and confidence.

------------------------------------------------------------------------

# Trade Manager

Responsible for:

-   Order placement
-   Partial exits
-   Stop adjustments
-   Time exits
-   Scaling
-   Logging

------------------------------------------------------------------------

# Learning Layer

Every completed trade records:

-   Market state
-   Zone score
-   Forecast values
-   Probability path
-   Entry reason
-   Exit reason
-   MFE
-   MAE
-   Outcome

Used for calibration and future research.

------------------------------------------------------------------------

# Update Cycle

Daily:

-   Research refresh
-   Forecast generation
-   Decision zone creation

Per bar:

-   Market state update
-   Probability update
-   Zone monitoring

Per trade:

-   Risk update
-   Trade management

End of day:

-   Performance attribution
-   Model diagnostics

------------------------------------------------------------------------

# Multi-Asset Design

The architecture remains identical for:

-   Forex
-   Equity indices
-   Commodities

Only calibration changes:

-   Volatility parameters
-   Zone widths
-   Session timings
-   Macro factors
-   Dealer sensitivity

------------------------------------------------------------------------

# Claude Build Order

1.  Core data framework
2.  Forecast layer
3.  Decision zone builder
4.  Market state engine
5.  Probability engine
6.  Execution engine
7.  Risk engine
8.  Trade manager
9.  Backtesting framework
10. Optimisation and learning

------------------------------------------------------------------------

# Summary

The MacroFXModel architecture deliberately separates forecasting,
reasoning and execution.

Research creates knowledge.

Forecasts create expectations.

Decision Zones define where to focus.

Market State decides which models matter.

The Probability Engine determines whether an edge exists.

The Execution Engine converts that edge into trades.

This separation allows every module to be tested, improved and replaced
independently without changing the rest of the platform.
