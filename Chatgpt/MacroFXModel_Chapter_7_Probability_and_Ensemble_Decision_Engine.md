# Chapter 7 -- Probability & Ensemble Decision Engine

## MacroFXModel Adaptive Probabilistic Multi-Model Trading Engine

------------------------------------------------------------------------

# Purpose

The Probability & Ensemble Decision Engine is the reasoning core of the
MacroFXModel.

Every analytical engine contributes evidence, but none has authority to
place a trade independently. This module combines those independent
opinions into a continuously updated probability distribution describing
the most likely market outcome.

The objective is to answer one question:

> **"Given everything currently known, does a statistically meaningful
> trading edge exist?"**

------------------------------------------------------------------------

# Design Philosophy

Traditional trading systems make binary decisions:

-   Buy
-   Sell
-   Do Nothing

The MacroFXModel instead treats every decision as a probabilistic
estimate.

Example:

  Outcome                 Probability
  --------------------- -------------
  Continuation Higher             56%
  Mean Reversion                  29%
  Breakout Failure                10%
  No Edge                          5%

The engine always reasons in probabilities rather than certainty.

------------------------------------------------------------------------

# Responsibilities

The Probability Engine is responsible for:

-   Combining independent evidence
-   Weighting models dynamically
-   Producing long and short probabilities
-   Estimating confidence
-   Estimating expected return
-   Publishing execution recommendations
-   Explaining why a decision was reached

------------------------------------------------------------------------

# Evidence Sources

The engine consumes outputs from:

-   Volatility Engine
-   Asia Range Extension Engine
-   Decision Zone Builder
-   Market State Engine
-   Macro Engine
-   Liquidity Engine
-   Regression Engine
-   Options Engine
-   Time-of-Day Engine
-   Momentum Indicators
-   Session Behaviour Engine

Each source contributes evidence---not commands.

------------------------------------------------------------------------

# Ensemble Architecture

``` text
Volatility
      │
Macro │
      │
Liquidity
      │
Regression
      │
Options
      │
Momentum
      │
Decision Zones
      │
Market State
      ▼
Probability Engine
      ▼
Execution Recommendation
```

Each module acts as an independent "expert".

------------------------------------------------------------------------

# Dynamic Weighting

Weights are not fixed.

They depend on the active Market State.

Example:

Trend Market

  Model          Weight
  ------------ --------
  Macro             30%
  Momentum          25%
  Volatility        20%
  Liquidity         15%
  Regression        10%

Mean Reversion

  Model          Weight
  ------------ --------
  Regression        30%
  Volatility        25%
  Liquidity         20%
  Options           15%
  Macro             10%

Dealer Controlled

  Model          Weight
  ------------ --------
  Options           40%
  Liquidity         20%
  Volatility        20%
  Regression        10%
  Macro             10%

------------------------------------------------------------------------

# Probability Outputs

For every update cycle the engine calculates:

-   Long Probability
-   Short Probability
-   Continuation Probability
-   Reversal Probability
-   Breakout Probability
-   No-Trade Probability
-   Confidence Score
-   Expected Return
-   Expected Holding Time

These values continuously evolve throughout the session.

------------------------------------------------------------------------

# Continuous Updating

Unlike static indicators, the Probability Engine updates whenever new
information arrives.

Typical triggers include:

-   Price entering a Decision Zone
-   Market State changes
-   New options positioning
-   Significant volatility expansion
-   Macro events
-   Session transitions
-   Liquidity sweeps

The objective is to maintain an always-current estimate of market
opportunity.

------------------------------------------------------------------------

# Decision Thresholds

The engine should avoid trading marginal edges.

Example thresholds:

  Confidence   Action
  ------------ ------------------------------------
  Below 60%    Ignore
  60--75%      Monitor
  75--85%      Prepare
  Above 85%    Execute (subject to risk controls)

Thresholds remain configurable and should be validated through research.

------------------------------------------------------------------------

# Explainability

Every decision should include a machine-readable explanation.

Example:

``` text
Trade Direction: Long

Confidence: 87%

Primary Reasons:

• Trend Market
• Strong Macro Bias
• Volatility Supports Expansion
• Price Holding Above VWAP
• High-Quality Decision Zone
• Dealer Positioning Neutral
```

This improves transparency, debugging and model refinement.

------------------------------------------------------------------------

# No-Trade Logic

Choosing not to trade is considered a valid decision.

Reasons may include:

-   Weak probabilities
-   Conflicting evidence
-   Low-quality Decision Zone
-   Transitioning Market State
-   Elevated event risk
-   Poor reward-to-risk ratio

Avoiding poor trades is as valuable as identifying good ones.

------------------------------------------------------------------------

# Published Decision Object

The engine publishes:

-   Direction
-   Confidence
-   Long Probability
-   Short Probability
-   Expected Return
-   Suggested Stop Distance
-   Suggested Target
-   Supporting Evidence
-   Timestamp

This object becomes the primary input to the Execution Engine.

------------------------------------------------------------------------

# Pseudocode

``` text
Receive model outputs

Load active Market State

Apply dynamic weights

Combine probabilities

Calculate confidence

Estimate expected return

Generate explanation

Publish Decision Object
```

------------------------------------------------------------------------

# Backtesting Requirements

Evaluate:

-   Probability calibration
-   Brier Score
-   Precision and recall
-   Trade expectancy
-   Profit factor by confidence bucket
-   False positive rate
-   Cross-asset robustness
-   Walk-forward stability

The objective is to verify that higher confidence consistently
corresponds to better trading outcomes.

------------------------------------------------------------------------

# Future Enhancements

Potential developments include:

-   Bayesian model averaging
-   Stacking ensembles
-   Meta-labelling
-   Online learning
-   Reinforcement learning
-   Dynamic confidence calibration

------------------------------------------------------------------------

# Summary

The Probability & Ensemble Decision Engine is the reasoning layer of the
MacroFXModel.

Rather than relying on any single indicator or model, it continuously
combines independent evidence into a unified probability distribution
describing the current market opportunity.

By separating **analysis** from **decision-making**, the engine remains
adaptive, explainable and statistically testable while providing a
robust foundation for execution across multiple asset classes.
