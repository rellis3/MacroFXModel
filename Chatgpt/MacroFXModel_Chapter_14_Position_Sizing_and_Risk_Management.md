# Chapter 14 -- Position Sizing & Risk Management

## MacroFXModel Adaptive Probabilistic Multi-Model Trading Engine

------------------------------------------------------------------------

# Purpose

The Position Sizing & Risk Management Engine protects trading capital by
ensuring that every position is appropriately sized, portfolio exposure
remains controlled, and losses remain within predefined limits.

While the analytical engines identify opportunities, this module
determines whether the opportunity is worth risking capital on and, if
so, how much capital should be allocated.

The primary objective is:

> **"Maximise long-term growth while controlling downside risk."**

------------------------------------------------------------------------

# Design Philosophy

Risk management is the highest priority within the MacroFXModel.

No analytical edge, regardless of confidence, is permitted to bypass
predefined risk controls.

The engine is designed to:

-   Preserve capital during adverse conditions.
-   Scale exposure during favourable conditions.
-   Maintain consistency across all asset classes.
-   Prevent catastrophic losses from individual trades or correlated
    positions.

------------------------------------------------------------------------

# Responsibilities

The Risk Engine is responsible for:

-   Position sizing
-   Maximum trade risk
-   Portfolio exposure
-   Correlation management
-   Volatility-adjusted sizing
-   Daily and weekly loss limits
-   Drawdown protection
-   Capital preservation

------------------------------------------------------------------------

# Core Inputs

The engine receives:

-   Account equity
-   Available margin
-   Trade confidence
-   Stop distance
-   Volatility regime
-   Asset class
-   Market State
-   Portfolio exposure
-   Correlation matrix
-   Open positions

------------------------------------------------------------------------

# Risk Hierarchy

The engine applies controls in the following order:

``` text
Account Risk
      │
      ▼
Portfolio Risk
      │
      ▼
Sector / Asset Exposure
      │
      ▼
Individual Trade Risk
      │
      ▼
Position Size
```

Each level must pass before execution continues.

------------------------------------------------------------------------

# Position Sizing

Position size is calculated using:

-   Maximum account risk
-   Stop-loss distance
-   Instrument value per point
-   Current volatility
-   Trade confidence

Higher confidence may justify larger exposure, but never beyond
predefined limits.

------------------------------------------------------------------------

# Volatility Adjustment

Position size adapts to market volatility.

Examples:

-   Low volatility → Larger size (within limits)
-   High volatility → Smaller size
-   Extreme volatility → Reduced or zero allocation

This prevents excessive risk during unstable market conditions.

------------------------------------------------------------------------

# Confidence Adjustment

Trade confidence influences capital allocation.

Example framework:

  Confidence               Allocation
  ------------ ----------------------
  Below 60%                  No Trade
  60--75%                Reduced Size
  75--85%               Standard Size
  Above 85%      Maximum Allowed Size

Confidence modifies size but never overrides hard risk limits.

------------------------------------------------------------------------

# Portfolio Exposure

The engine monitors:

-   Total portfolio risk
-   Currency exposure
-   Sector exposure
-   Asset-class concentration
-   Long/short balance

Correlated positions are treated as a single source of risk where
appropriate.

------------------------------------------------------------------------

# Correlation Management

Highly correlated trades increase effective exposure.

The engine therefore:

-   Measures rolling correlations
-   Identifies duplicate risk
-   Reduces position size when correlation exceeds configured thresholds
-   Prevents excessive concentration in similar assets

------------------------------------------------------------------------

# Drawdown Protection

The engine continuously monitors realised drawdown.

Example controls:

-   Daily drawdown limit
-   Weekly drawdown limit
-   Monthly drawdown limit
-   Maximum account drawdown

Breaching a limit may trigger:

-   Reduced sizing
-   Trading suspension
-   Manual review
-   Risk reset procedures

------------------------------------------------------------------------

# Dynamic Risk Adjustment

Risk limits may adapt according to:

-   Market State
-   Volatility regime
-   Liquidity conditions
-   Economic event risk
-   Forecast confidence

Example:

During a Volatility Expansion regime, maximum position size may be
reduced automatically.

------------------------------------------------------------------------

# Risk Approval Workflow

``` text
Receive Trade Request
        │
        ▼
Check Account Limits
        │
        ▼
Check Portfolio Exposure
        │
        ▼
Check Correlation
        │
        ▼
Calculate Position Size
        │
        ▼
Approve or Reject Trade
```

------------------------------------------------------------------------

# Published Risk Object

The engine publishes:

-   Approved Position Size
-   Maximum Risk
-   Portfolio Exposure
-   Correlation Score
-   Drawdown Status
-   Risk Flags
-   Approval Decision

This object is consumed by the Trade Execution Engine.

------------------------------------------------------------------------

# Pseudocode

``` text
Load account information

Measure portfolio exposure

Calculate correlations

Adjust for volatility

Adjust for confidence

Determine position size

Apply drawdown rules

Publish Risk Object
```

------------------------------------------------------------------------

# Backtesting Requirements

Evaluate:

-   Risk-adjusted return
-   Maximum drawdown
-   Sharpe Ratio
-   Sortino Ratio
-   Calmar Ratio
-   Risk of Ruin
-   Capital utilisation
-   Position sizing effectiveness
-   Portfolio stability

The objective is to maximise long-term expectancy while maintaining
acceptable drawdown characteristics.

------------------------------------------------------------------------

# Future Enhancements

Potential developments include:

-   Kelly Criterion variants
-   Fractional Kelly sizing
-   Conditional Value at Risk (CVaR)
-   Expected Shortfall modelling
-   Dynamic leverage optimisation
-   Portfolio optimisation algorithms

------------------------------------------------------------------------

# Summary

The Position Sizing & Risk Management Engine is the capital preservation
layer of the MacroFXModel.

By controlling position size, portfolio exposure, volatility-adjusted
risk and drawdown limits, it ensures that no individual trade---or
series of trades---can compromise the long-term survival of the trading
system.

Its role is not to maximise the profit of any single trade, but to
maximise the sustainability, consistency and robustness of the overall
trading process.
