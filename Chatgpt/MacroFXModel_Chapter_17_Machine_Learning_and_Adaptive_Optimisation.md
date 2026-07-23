# Chapter 17 -- Machine Learning & Adaptive Optimisation

## MacroFXModel Adaptive Probabilistic Multi-Model Trading Engine

------------------------------------------------------------------------

# Purpose

The Machine Learning & Adaptive Optimisation Engine enables the
MacroFXModel to improve over time by learning from historical outcomes,
changing market regimes and execution performance.

Unlike the analytical engines, which encode financial theory and domain
knowledge, this layer refines model behaviour using data while
preserving explainability and robust risk controls.

Its primary objective is:

> **"Continuously improve decision quality without overfitting to the
> past."**

------------------------------------------------------------------------

# Design Philosophy

Machine learning is used to enhance---not replace---the probabilistic
framework.

Models are treated as adaptive components whose outputs are validated
against statistical evidence, domain constraints and rigorous
backtesting.

Human-understandable signals remain the foundation of the system.

------------------------------------------------------------------------

# Responsibilities

The engine is responsible for:

-   Feature engineering
-   Model training
-   Feature selection
-   Hyperparameter optimisation
-   Probability calibration
-   Meta-labelling
-   Adaptive model weighting
-   Performance monitoring
-   Drift detection

------------------------------------------------------------------------

# Core Inputs

Typical inputs include:

-   Decision Zone history
-   Market State history
-   Volatility forecasts
-   Macro factors
-   Liquidity metrics
-   Options positioning
-   Execution quality
-   Trade outcomes
-   Risk statistics

------------------------------------------------------------------------

# Feature Engineering

Candidate features include:

-   Volatility regime
-   Distance to Decision Zone
-   Time of day
-   Session
-   Fair-value deviation
-   Gamma positioning
-   Yield spreads
-   Liquidity scores
-   Trend persistence
-   Historical hit rates

Feature importance should be monitored continuously.

------------------------------------------------------------------------

# Model Types

Supported approaches include:

-   Gradient Boosting
-   Random Forests
-   Logistic Regression
-   Bayesian Models
-   Neural Networks
-   Reinforcement Learning (research)
-   Online Learning

Model choice should favour robustness and interpretability.

------------------------------------------------------------------------

# Meta-Labelling

Primary models identify potential trades.

A secondary model estimates whether those trades should actually be
taken.

Typical outputs:

-   Execute
-   Reduce size
-   Delay entry
-   Reject trade

This provides an additional quality filter.

------------------------------------------------------------------------

# Adaptive Weighting

Each analytical engine receives a dynamic weight based on:

-   Recent predictive accuracy
-   Market regime
-   Asset class
-   Execution quality
-   Stability

Weights are updated gradually to avoid instability.

------------------------------------------------------------------------

# Drift Detection

The engine monitors:

-   Feature drift
-   Data drift
-   Concept drift
-   Model degradation

When significant drift is detected, retraining or rollback procedures
are initiated.

------------------------------------------------------------------------

# Training Workflow

``` text
Collect Historical Data
        │
        ▼
Engineer Features
        │
        ▼
Train Models
        │
        ▼
Validate Out-of-Sample
        │
        ▼
Calibrate Probabilities
        │
        ▼
Deploy Approved Model
        │
        ▼
Monitor Performance
```

------------------------------------------------------------------------

# Validation Requirements

Every model must demonstrate:

-   Stable out-of-sample performance
-   Calibration accuracy
-   Explainability
-   Robustness across regimes
-   Low overfitting risk

Deployment is prohibited until validation criteria are met.

------------------------------------------------------------------------

# Published ML Object

The engine publishes:

-   Model Version
-   Confidence Score
-   Feature Importance
-   Calibration Metrics
-   Drift Status
-   Adaptive Weights
-   Deployment Status

------------------------------------------------------------------------

# Pseudocode

``` text
Load historical data

Engineer features

Train candidate models

Validate performance

Calibrate probabilities

Publish approved model outputs

Monitor for drift
```

------------------------------------------------------------------------

# Backtesting Requirements

Evaluate:

-   Classification accuracy
-   Precision / Recall
-   ROC-AUC
-   Brier Score
-   Calibration curves
-   Feature stability
-   Regime robustness
-   Live vs backtest consistency

Machine learning should improve decision quality without materially
increasing risk.

------------------------------------------------------------------------

# Future Enhancements

Potential developments include:

-   Automated feature discovery
-   Ensemble stacking
-   Graph neural networks
-   Foundation time-series models
-   Continuous online learning
-   Federated learning across strategies

------------------------------------------------------------------------

# Summary

The Machine Learning & Adaptive Optimisation Engine provides the
learning capability of the MacroFXModel.

By combining disciplined feature engineering, rigorous validation,
adaptive model weighting and continuous performance monitoring, it
allows the trading system to evolve with changing markets while
preserving transparency, robustness and scientific integrity.
