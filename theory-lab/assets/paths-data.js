/* Generated from the lessons' own titles and read times — edit the path definitions, not this file.
   Checked by js/lessonPaths.test.mjs. */
window.TL_PATHS = {
 "core": {
  "name": "Core",
  "lessons": [
   "primer-stats-normal",
   "primer-probability",
   "primer-correlation-regression",
   "primer-returns-compounding",
   "bayesian-inference",
   "multiple-testing",
   "research-pipeline-hypothesis-to-backtest",
   "loss-aversion-prospect-theory",
   "process-vs-outcome-decision-journals"
  ]
 },
 "paths": [
  {
   "id": "volatility",
   "name": "Volatility & Options",
   "icon": "🌋",
   "who": "For anyone who wants to read the options market: what vol is pricing, who is hedging what, and what that does to the range.",
   "stages": [
    {
     "name": "The four positions",
     "lessons": [
      "options-four-positions",
      "payoff-shape-vs-greek-signs",
      "covered-call-equals-short-put",
      "black-scholes"
     ]
    },
    {
     "name": "The Greeks and dealer flows",
     "lessons": [
      "theta-decay",
      "vega-volatility-surface",
      "second-order-greeks",
      "gamma-exposure-dealer-hedging",
      "open-interest-walls-max-pain"
     ]
    },
    {
     "name": "Measuring and modelling volatility",
     "lessons": [
      "vix-uncertainty-not-fear",
      "garch-volatility",
      "merton-jump-diffusion",
      "heston-model",
      "sabr-model"
     ]
    },
    {
     "name": "The tails",
     "lessons": [
      "extreme-value-theory",
      "tail-risk-hedging-convexity",
      "cornish-fisher-expansion"
     ]
    },
    {
     "name": "The human side",
     "lessons": [
      "overconfidence-overtrading",
      "drawdowns-risk-of-ruin"
     ]
    }
   ],
   "deliverable": {
    "title": "A weekly volatility read",
    "what": "For one index, a one-page read of what the options market is pricing for the coming week: a range, never a direction, with every claim marked tested or untested.",
    "steps": [
     {
      "text": "Turn the VIX into an expected one-week move, in points, with its ±1σ band",
      "lesson": "vix-uncertainty-not-fear"
     },
     {
      "text": "State the term structure (contango or inverted) and what an inversion has been followed by here",
      "lesson": "vix-uncertainty-not-fear"
     },
     {
      "text": "Compare implied with recent realised volatility and say which way the gap has tended to close",
      "lesson": "garch-volatility"
     },
     {
      "text": "Give the dealer gamma sign and what it does and does not tell you (range, Nasdaq only, never direction)",
      "lesson": "gamma-exposure-dealer-hedging"
     },
     {
      "text": "Mark where the skew and the tails say a normal-distribution band is too narrow",
      "lesson": "vega-volatility-surface"
     },
     {
      "text": "Write the range expectation, and next to each sentence the desk verdict (validated, null, untested) behind it",
      "lesson": "four-markets-four-questions"
     }
    ]
   }
  },
  {
   "id": "macro",
   "name": "Macro & FX",
   "icon": "🌍",
   "who": "For anyone who wants to read the macro board: what each market is answering, how a shock travels, and what the plumbing is doing underneath.",
   "stages": [
    {
     "name": "How markets talk to each other",
     "lessons": [
      "four-markets-four-questions",
      "domino-chain-cross-asset",
      "investor-mood-forced-selling",
      "vix-uncertainty-not-fear",
      "yield-curve-growth-expectations"
     ]
    },
    {
     "name": "Rates and bonds",
     "lessons": [
      "time-value-of-money",
      "bond-pricing-ytm",
      "duration-convexity",
      "yield-curve-construction",
      "nelson-siegel-svensson",
      "swap-curves-ois"
     ]
    },
    {
     "name": "Central banks and plumbing",
     "lessons": [
      "central-bank-policy",
      "taylor-rule",
      "fed-corridor-iorb-srf-discount-window",
      "qe-qt-balance-sheet",
      "collateral-margin-repo-markets",
      "rehypothecation-collateral-chains"
     ]
    },
    {
     "name": "Currencies",
     "lessons": [
      "interest-rate-parity",
      "purchasing-power-parity",
      "cointegration"
     ]
    },
    {
     "name": "The human side",
     "lessons": [
      "herding-narratives-bubbles",
      "overconfidence-overtrading"
     ]
    }
   ],
   "deliverable": {
    "title": "A morning macro read",
    "what": "A short note on today's board that asks each market its own question, traces the one chain that is moving, and labels which claims this desk has tested and which failed.",
    "steps": [
     {
      "text": "Ask each market its own question: equities, Treasuries, the VIX, the dollar",
      "lesson": "four-markets-four-questions"
     },
     {
      "text": "Split the 10-year move into its real-yield and breakeven legs",
      "lesson": "yield-curve-growth-expectations"
     },
     {
      "text": "Trace the one domino chain that is moving today, link by link",
      "lesson": "domino-chain-cross-asset"
     },
     {
      "text": "Check the plumbing: where SOFR sits in the corridor and whether it is just the calendar",
      "lesson": "fed-corridor-iorb-srf-discount-window"
     },
     {
      "text": "State the policy path the curve is pricing and how far it sits from a Taylor-rule estimate",
      "lesson": "taylor-rule"
     },
     {
      "text": "Give the rate differential behind each major FX move, and say what has NOT predicted direction here",
      "lesson": "interest-rate-parity"
     }
    ]
   }
  },
  {
   "id": "systems",
   "name": "System Building",
   "icon": "🛠️",
   "who": "For anyone building a trading system: clean data, a signal worth testing, a test that cannot fool you, and execution and sizing that survive real costs and real drawdowns.",
   "stages": [
    {
     "name": "Data you can trust",
     "lessons": [
      "data-pipeline-raw-to-trading-ready",
      "data-cleaning-outliers-missing-data",
      "corporate-actions-series-continuity",
      "point-in-time-data-survivorship-bias",
      "data-architecture-storage-versioning"
     ]
    },
    {
     "name": "Signals and models",
     "lessons": [
      "stationarity-acf-pacf",
      "ou-mean-reversion",
      "hurst-variance-ratio",
      "cointegration",
      "hidden-markov-models",
      "kalman-filter",
      "regularized-regression-lasso-ridge",
      "gradient-boosting"
     ]
    },
    {
     "name": "Testing without fooling yourself",
     "lessons": [
      "feature-engineering-leakage-reproducibility",
      "walk-forward-purged-cv",
      "bootstrapping-monte-carlo",
      "sharpe-family-deflated",
      "emh"
     ]
    },
    {
     "name": "Execution and sizing",
     "lessons": [
      "market-microstructure",
      "execution-algorithms",
      "market-impact-almgren-chriss",
      "kelly-criterion",
      "coherent-risk-measures"
     ]
    },
    {
     "name": "The human side",
     "lessons": [
      "drawdowns-risk-of-ruin",
      "disposition-effect",
      "overconfidence-overtrading"
     ]
    }
   ],
   "deliverable": {
    "title": "One honestly tested strategy",
    "what": "A single strategy idea taken from written hypothesis to verdict, documented so that someone else could reproduce it and would believe the result, including if the result is null.",
    "steps": [
     {
      "text": "Write the hypothesis, the base rate and the pass bar down before touching the data",
      "lesson": "research-pipeline-hypothesis-to-backtest"
     },
     {
      "text": "Build the dataset point-in-time, with survivors and dead instruments both included",
      "lesson": "point-in-time-data-survivorship-bias"
     },
     {
      "text": "Check every feature for leakage and record exactly how the data was produced",
      "lesson": "feature-engineering-leakage-reproducibility"
     },
     {
      "text": "Run a purged walk-forward test and count how many variants you tried",
      "lesson": "walk-forward-purged-cv"
     },
     {
      "text": "Report the deflated Sharpe ratio, not the raw one",
      "lesson": "sharpe-family-deflated"
     },
     {
      "text": "Subtract realistic costs and check the edge clears the spread",
      "lesson": "execution-algorithms"
     },
     {
      "text": "Size it, and simulate the drawdowns and losing streaks you must be willing to sit through",
      "lesson": "drawdowns-risk-of-ruin"
     },
     {
      "text": "Log the decision in a journal before you know how it turns out",
      "lesson": "process-vs-outcome-decision-journals"
     }
    ]
   }
  },
  {
   "id": "risk",
   "name": "Risk & Portfolio",
   "icon": "🧭",
   "who": "For anyone responsible for a book: how to combine positions, measure what can go wrong, and notice when the correlations you relied on are changing.",
   "stages": [
    {
     "name": "Building a portfolio",
     "lessons": [
      "markowitz-black-litterman",
      "risk-parity-erc",
      "hierarchical-risk-parity",
      "factor-based-portfolio-construction",
      "active-portfolio-management",
      "alpha-beta-separation"
     ]
    },
    {
     "name": "Measuring what can go wrong",
     "lessons": [
      "coherent-risk-measures",
      "cornish-fisher-expansion",
      "quantile-regression",
      "extreme-value-theory",
      "stress-testing-scenario-analysis"
     ]
    },
    {
     "name": "When correlations change",
     "lessons": [
      "pca-factors",
      "correlation-networks-mst",
      "copulas",
      "systemic-risk-networks",
      "random-matrix-theory"
     ]
    },
    {
     "name": "The human side",
     "lessons": [
      "drawdowns-risk-of-ruin",
      "herding-narratives-bubbles"
     ]
    }
   ],
   "deliverable": {
    "title": "A one-page risk report",
    "what": "A risk report for a small multi-asset portfolio that a manager could act on: what it holds in risk terms, how bad a bad month gets, and what would break the assumptions.",
    "steps": [
     {
      "text": "Allocate by risk contribution, not capital, and show the two side by side",
      "lesson": "risk-parity-erc"
     },
     {
      "text": "Report expected shortfall as well as VaR, with a fat-tail adjustment",
      "lesson": "coherent-risk-measures"
     },
     {
      "text": "Run one historical and one hypothetical stress scenario",
      "lesson": "stress-testing-scenario-analysis"
     },
     {
      "text": "Show how many independent bets the portfolio really holds, and what that falls to in a crisis",
      "lesson": "pca-factors"
     },
     {
      "text": "Name the one assumption whose failure would hurt most, and how you would see it coming",
      "lesson": "copulas"
     }
    ]
   }
  }
 ],
 "lessons": {
  "primer-stats-normal": {
   "t": "Descriptive Statistics & the Normal Distribution",
   "min": 13,
   "micro": true
  },
  "primer-probability": {
   "t": "Probability & Random Variables",
   "min": 14,
   "micro": true
  },
  "primer-correlation-regression": {
   "t": "Correlation & Linear Regression",
   "min": 15,
   "micro": true
  },
  "primer-returns-compounding": {
   "t": "Returns, Log-Returns & Compounding",
   "min": 14,
   "micro": true
  },
  "bayesian-inference": {
   "t": "Bayesian Inference & Updating",
   "min": 14,
   "micro": true
  },
  "multiple-testing": {
   "t": "Multiple Testing & the Look-Elsewhere Effect",
   "min": 13,
   "micro": true
  },
  "research-pipeline-hypothesis-to-backtest": {
   "t": "The Research Pipeline: Hypothesis to Honest Backtest",
   "min": 14,
   "micro": true
  },
  "loss-aversion-prospect-theory": {
   "t": "Why a Loss Hurts Twice as Much",
   "min": 20,
   "micro": true
  },
  "process-vs-outcome-decision-journals": {
   "t": "Judge the Decision, Not the Result",
   "min": 20,
   "micro": true
  },
  "options-four-positions": {
   "t": "The Four Option Positions",
   "min": 17,
   "micro": true
  },
  "payoff-shape-vs-greek-signs": {
   "t": "Same Greeks, Different Risk",
   "min": 16,
   "micro": true
  },
  "covered-call-equals-short-put": {
   "t": "The Covered Call Is a Short Put",
   "min": 16,
   "micro": true
  },
  "black-scholes": {
   "t": "Black-Scholes-Merton Option Pricing",
   "min": 18,
   "micro": true
  },
  "theta-decay": {
   "t": "Theta Decay",
   "min": 19,
   "micro": true
  },
  "vega-volatility-surface": {
   "t": "Vega & the Volatility Surface",
   "min": 20,
   "micro": true
  },
  "second-order-greeks": {
   "t": "Second-Order Greeks: Vanna, Charm, Vomma & More",
   "min": 20,
   "micro": true
  },
  "gamma-exposure-dealer-hedging": {
   "t": "Gamma Exposure & Dealer Hedging Flows",
   "min": 17,
   "micro": true
  },
  "open-interest-walls-max-pain": {
   "t": "Open Interest Walls, Max Pain & Squeeze Trading",
   "min": 16,
   "micro": true
  },
  "vix-uncertainty-not-fear": {
   "t": "The VIX Is an Uncertainty Index, Not a Fear Gauge",
   "min": 17,
   "micro": true
  },
  "garch-volatility": {
   "t": "GARCH & Volatility Clustering",
   "min": 16,
   "micro": true
  },
  "merton-jump-diffusion": {
   "t": "The Merton Jump-Diffusion Model",
   "min": 16,
   "micro": true
  },
  "heston-model": {
   "t": "The Heston Model",
   "min": 17,
   "micro": true
  },
  "sabr-model": {
   "t": "The SABR Model",
   "min": 16,
   "micro": true
  },
  "extreme-value-theory": {
   "t": "Extreme Value Theory & Tail Risk",
   "min": 16,
   "micro": true
  },
  "tail-risk-hedging-convexity": {
   "t": "Tail Risk Hedging & Portfolio Convexity",
   "min": 15,
   "micro": true
  },
  "cornish-fisher-expansion": {
   "t": "Cornish-Fisher Expansion",
   "min": 13,
   "micro": true
  },
  "overconfidence-overtrading": {
   "t": "Overconfidence and the Cost of Trading Too Much",
   "min": 20,
   "micro": true
  },
  "drawdowns-risk-of-ruin": {
   "t": "Drawdowns, Risk of Ruin, and Why Good Systems Get Abandoned",
   "min": 20,
   "micro": true
  },
  "four-markets-four-questions": {
   "t": "Four Markets, Four Questions",
   "min": 18,
   "micro": true
  },
  "domino-chain-cross-asset": {
   "t": "The Domino Effect: One Shock Through the Whole Board",
   "min": 20,
   "micro": true
  },
  "investor-mood-forced-selling": {
   "t": "Mood, the Quote and Forced Selling",
   "min": 20,
   "micro": true
  },
  "yield-curve-growth-expectations": {
   "t": "What the Yield Curve Says About Growth",
   "min": 17,
   "micro": true
  },
  "time-value-of-money": {
   "t": "Time Value of Money",
   "min": 13,
   "micro": true
  },
  "bond-pricing-ytm": {
   "t": "Bond Pricing & Yield to Maturity",
   "min": 16,
   "micro": true
  },
  "duration-convexity": {
   "t": "Duration & Convexity",
   "min": 17,
   "micro": true
  },
  "yield-curve-construction": {
   "t": "Bootstrapping the Yield Curve",
   "min": 17,
   "micro": true
  },
  "nelson-siegel-svensson": {
   "t": "Curve Fitting: Nelson-Siegel & Svensson",
   "min": 16,
   "micro": true
  },
  "swap-curves-ois": {
   "t": "Swap Curves & OIS Discounting",
   "min": 17,
   "micro": true
  },
  "central-bank-policy": {
   "t": "Central Bank Policy",
   "min": 16,
   "micro": true
  },
  "taylor-rule": {
   "t": "The Taylor Rule",
   "min": 15,
   "micro": true
  },
  "fed-corridor-iorb-srf-discount-window": {
   "t": "The Fed's Corridor: IORB, the SRF and the Discount Window",
   "min": 18,
   "micro": true
  },
  "qe-qt-balance-sheet": {
   "t": "QE and QT: What the Fed's Balance Sheet Actually Does",
   "min": 18,
   "micro": true
  },
  "collateral-margin-repo-markets": {
   "t": "Collateral, Margin & Repo Markets",
   "min": 15,
   "micro": true
  },
  "rehypothecation-collateral-chains": {
   "t": "Rehypothecation & Collateral Chains",
   "min": 16,
   "micro": true
  },
  "interest-rate-parity": {
   "t": "Interest Rate Parity — Covered vs. Uncovered",
   "min": 17,
   "micro": true
  },
  "purchasing-power-parity": {
   "t": "Purchasing Power Parity",
   "min": 15,
   "micro": true
  },
  "cointegration": {
   "t": "Cointegration & Statistical Arbitrage",
   "min": 16,
   "micro": true
  },
  "herding-narratives-bubbles": {
   "t": "Herding, Narratives and Bubbles",
   "min": 22,
   "micro": true
  },
  "data-pipeline-raw-to-trading-ready": {
   "t": "The Data Pipeline: Raw Feeds to Trading-Ready Data",
   "min": 15,
   "micro": true
  },
  "data-cleaning-outliers-missing-data": {
   "t": "Data Cleaning: Outliers, Bad Ticks & Missing Data",
   "min": 16,
   "micro": true
  },
  "corporate-actions-series-continuity": {
   "t": "Corporate Actions & Series Continuity",
   "min": 15,
   "micro": true
  },
  "point-in-time-data-survivorship-bias": {
   "t": "Point-in-Time Data & Survivorship Bias",
   "min": 16,
   "micro": true
  },
  "data-architecture-storage-versioning": {
   "t": "Data Architecture for Systematic Trading: Storage, Versioning & Reproducibility",
   "min": 16,
   "micro": true
  },
  "stationarity-acf-pacf": {
   "t": "Stationarity, ACF & PACF",
   "min": 16,
   "micro": true
  },
  "ou-mean-reversion": {
   "t": "The Ornstein-Uhlenbeck Process & Mean Reversion",
   "min": 15,
   "micro": true
  },
  "hurst-variance-ratio": {
   "t": "The Hurst Exponent & Variance Ratio Test",
   "min": 15,
   "micro": true
  },
  "hidden-markov-models": {
   "t": "Hidden Markov Models & Regime Detection",
   "min": 17,
   "micro": true
  },
  "kalman-filter": {
   "t": "The Kalman Filter & Adaptive Relationships",
   "min": 17,
   "micro": true
  },
  "regularized-regression-lasso-ridge": {
   "t": "Regularized Regression: LASSO & Ridge",
   "min": 16,
   "micro": true
  },
  "gradient-boosting": {
   "t": "Gradient Boosting",
   "min": 17,
   "micro": true
  },
  "feature-engineering-leakage-reproducibility": {
   "t": "Feature Engineering, Leakage & Reproducibility",
   "min": 15,
   "micro": true
  },
  "walk-forward-purged-cv": {
   "t": "Walk-Forward & Purged Cross-Validation",
   "min": 16,
   "micro": true
  },
  "bootstrapping-monte-carlo": {
   "t": "Bootstrapping & Monte Carlo Simulation",
   "min": 15,
   "micro": true
  },
  "sharpe-family-deflated": {
   "t": "Sharpe, Sortino, Calmar & the Deflated Sharpe Ratio",
   "min": 17,
   "micro": true
  },
  "emh": {
   "t": "The Efficient Market Hypothesis",
   "min": 12,
   "micro": true
  },
  "market-microstructure": {
   "t": "Market Microstructure: Price Impact & the Bid-Ask Spread",
   "min": 17,
   "micro": true
  },
  "execution-algorithms": {
   "t": "Execution Algorithms: TWAP, VWAP, POV, IS",
   "min": 17,
   "micro": true
  },
  "market-impact-almgren-chriss": {
   "t": "Market Impact Models & Almgren-Chriss",
   "min": 18,
   "micro": true
  },
  "kelly-criterion": {
   "t": "The Kelly Criterion & Position Sizing",
   "min": 16,
   "micro": true
  },
  "coherent-risk-measures": {
   "t": "Coherent Risk Measures: VaR, CVaR & the Artzner Axioms",
   "min": 14,
   "micro": true
  },
  "disposition-effect": {
   "t": "Selling Winners, Holding Losers",
   "min": 18,
   "micro": true
  },
  "markowitz-black-litterman": {
   "t": "Markowitz & Black-Litterman",
   "min": 18,
   "micro": true
  },
  "risk-parity-erc": {
   "t": "Risk Parity & Equal Risk Contribution",
   "min": 16,
   "micro": true
  },
  "hierarchical-risk-parity": {
   "t": "Hierarchical Risk Parity",
   "min": 17,
   "micro": true
  },
  "factor-based-portfolio-construction": {
   "t": "Factor-Based Portfolio Construction",
   "min": 16,
   "micro": true
  },
  "active-portfolio-management": {
   "t": "Active Portfolio Management",
   "min": 17,
   "micro": true
  },
  "alpha-beta-separation": {
   "t": "Alpha vs. Beta Separation",
   "min": 16,
   "micro": true
  },
  "quantile-regression": {
   "t": "Quantile Regression",
   "min": 14,
   "micro": true
  },
  "stress-testing-scenario-analysis": {
   "t": "Stress Testing, Scenario Analysis & Reverse Stress Tests",
   "min": 14,
   "micro": true
  },
  "pca-factors": {
   "t": "Principal Component Analysis & Factor Regimes",
   "min": 16,
   "micro": true
  },
  "correlation-networks-mst": {
   "t": "Correlation Networks & Minimum Spanning Trees",
   "min": 16,
   "micro": true
  },
  "copulas": {
   "t": "Copulas — Modeling Dependence Beyond Correlation",
   "min": 17,
   "micro": true
  },
  "systemic-risk-networks": {
   "t": "Systemic Risk & Financial Contagion Networks",
   "min": 16,
   "micro": true
  },
  "random-matrix-theory": {
   "t": "Random Matrix Theory & the Marchenko-Pastur Law",
   "min": 18,
   "micro": true
  }
 }
};
