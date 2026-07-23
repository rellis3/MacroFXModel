# Chapter 6 -- Market State Engine

## MacroFXModel Adaptive Probabilistic Multi-Model Trading Engine

------------------------------------------------------------------------

# Purpose

The Market State Engine is the central intelligence layer of the
MacroFXModel.

Its responsibility is to continuously determine **what type of market
currently exists**, allowing every other analytical engine to adapt its
behaviour accordingly.

Rather than assuming one strategy works in every environment, the Market
State Engine identifies the dominant market regime and dynamically
adjusts model weightings, execution logic and risk parameters.

------------------------------------------------------------------------

# Philosophy

Most trading systems fail because they apply identical rules to
fundamentally different market conditions.

The MacroFXModel rejects this assumption.

Instead, the system first asks:

> **"What environment are we trading?"**

Only after answering this question does the engine consider entering a
trade.

------------------------------------------------------------------------

# Responsibilities

The Market State Engine is responsible for:

-   Classifying the current market regime
-   Estimating confidence in that classification
-   Detecting regime transitions
-   Assigning weights to analytical models
-   Publishing the active market state
-   Triggering recalibration of downstream engines

------------------------------------------------------------------------

# Market States

The default state library includes:

  State                  Description
  ---------------------- ------------------------------------------
  Trend                  Persistent directional movement
  Mean Reversion         Price oscillates around fair value
  Dealer Controlled      Options positioning dominates
  Liquidity Driven       Stop hunts and liquidity sweeps dominate
  Macro Driven           Economic news or macro flows dominate
  Volatility Expansion   Large directional ranges become likely
  Compression            Reduced movement and narrow ranges
  Distribution           Institutional selling after an advance
  Accumulation           Institutional buying after a decline
  Transition             Regime uncertainty or change

Additional states may be introduced as research evolves.

------------------------------------------------------------------------

# Inputs

The engine receives information from every analytical module.

Typical inputs include:

-   Volatility regime
-   Asia Range Extension behaviour
-   Decision Zone activity
-   Macro bias
-   Yield spreads
-   Regression deviation
-   VWAP position
-   Session information
-   Dealer positioning
-   Gamma exposure
-   Liquidity events
-   Time-of-day
-   Momentum
-   Volume profile

No single input is capable of determining market state on its own.

------------------------------------------------------------------------

# State Classification Workflow

``` text
Collect Current Market Features
            │
            ▼
Normalise Inputs
            │
            ▼
Evaluate Candidate States
            │
            ▼
Calculate Confidence Scores
            │
            ▼
Select Dominant State
            │
            ▼
Publish State Object
```

------------------------------------------------------------------------

# State Confidence

Every state receives a confidence score.

Example:

  Candidate State       Confidence
  ------------------- ------------
  Trend                        72%
  Dealer Controlled            18%
  Mean Reversion               10%

The highest confidence state becomes active while the remaining
probabilities are retained for transition monitoring.

------------------------------------------------------------------------

# Dynamic Model Weighting

Each market state alters the influence of downstream models.

Example: Trend

  Model          Weight
  ------------ --------
  Macro             30%
  Momentum          25%
  Volatility        20%
  Liquidity         15%
  Regression        10%

Example: Dealer Controlled

  Model          Weight
  ------------ --------
  Options           40%
  Volatility        20%
  Liquidity         15%
  Macro             10%
  Regression        10%
  Momentum           5%

The weighting matrix should remain configurable.

------------------------------------------------------------------------

# Regime Transitions

Markets rarely change instantly.

Instead, transitions occur gradually.

The engine continuously monitors whether confidence in the current
regime is increasing or decreasing.

Possible outcomes include:

-   Stable regime
-   Weakening regime
-   Transition underway
-   New dominant regime

Execution thresholds may increase during uncertain transitions.

------------------------------------------------------------------------

# State Object

The engine publishes a Market State Object containing:

-   Active State
-   Confidence
-   Secondary State
-   Transition Probability
-   Recommended Model Weights
-   Expected Persistence
-   Timestamp

This object is shared with every downstream module.

------------------------------------------------------------------------

# Interaction with Decision Zones

Decision Zones are interpreted differently depending on the active
regime.

Examples:

Trend: - Breakouts become more probable.

Mean Reversion: - Rejections become more probable.

Dealer Controlled: - Options levels receive higher weighting.

Compression: - Breakout monitoring increases.

The same Decision Zone can therefore generate different expectations
depending on market state.

------------------------------------------------------------------------

# Interaction with the Probability Engine

The Probability Engine consumes the Market State Object before
calculating trade probabilities.

Instead of using fixed weights, it dynamically adjusts evidence
according to the active regime.

This allows the system to remain adaptive rather than rule-based.

------------------------------------------------------------------------

# Pseudocode

``` text
Collect market features

Normalise inputs

Score candidate regimes

Calculate confidence

Detect transitions

Generate weighting matrix

Publish Market State Object
```

------------------------------------------------------------------------

# Backtesting Requirements

Evaluation metrics should include:

-   State classification stability
-   Regime transition accuracy
-   Forecast improvement
-   Performance by state
-   Time spent in each state
-   Cross-asset robustness
-   Impact on trade expectancy

The objective is not merely classification accuracy but improvement in
trading outcomes.

------------------------------------------------------------------------

# Future Enhancements

Potential extensions include:

-   Hidden Markov Models
-   Bayesian regime estimation
-   Unsupervised clustering
-   Reinforcement learning
-   State persistence forecasting
-   Asset-specific state libraries

------------------------------------------------------------------------

# Summary

The Market State Engine is the adaptive core of the MacroFXModel.

Rather than relying on static rules, it continuously interprets the
current trading environment and informs every other module how that
environment should influence decision-making.

By separating **market understanding** from **trade execution**, the
architecture becomes flexible, explainable and capable of adapting to
changing market behaviour without rewriting strategy logic.
