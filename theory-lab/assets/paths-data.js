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
      "options-contract-mechanics",
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
      "fx-options-quoting-rr-bf",
      "second-order-greeks",
      "delta-hedging-gamma-scalping",
      "gamma-exposure-dealer-hedging",
      "open-interest-walls-max-pain"
     ]
    },
    {
     "name": "Measuring and modelling volatility",
     "lessons": [
      "vix-uncertainty-not-fear",
      "variance-risk-premium",
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
      "text": "Write the range expectation, and next to each sentence say whether the claim behind it has been tested, and what was found",
      "lesson": "four-markets-four-questions"
     }
    ]
   }
  },
  {
   "id": "options-practice",
   "name": "Options in Practice",
   "icon": "🎯",
   "who": "For anyone who is about to trade options, or already does: what you are actually buying, the five ways people use them, how to pick the contract, why selling premium pays until it doesn't, and how to size and hedge.",
   "deliverable": {
    "title": "A trade ticket for one options position",
    "what": "For one real or imagined position, a one-page ticket that a sceptical colleague could check: the view, the structure, the contract, the worst case and the size, with every number computed rather than guessed.",
    "steps": [
     {
      "text": "State what you are betting on (direction, size of move, volatility, or protection) and which of the five styles that is",
      "lesson": "options-trading-styles"
     },
     {
      "text": "Choose the structure and write its maximum loss, maximum gain and break-evens",
      "lesson": "options-spreads-and-structures"
     },
     {
      "text": "Pick the expiry and strike by comparing the break-even with the market's expected move, and note what you pay in time value and spread",
      "lesson": "options-trade-selection"
     },
     {
      "text": "Say whether you are paid for the risk: implied against your own estimate of realised volatility",
      "lesson": "variance-risk-premium"
     },
     {
      "text": "Write the worst case in a stress grid (price and volatility) and size the position so that loss is a number you can survive",
      "lesson": "short-premium-risk-and-sizing"
     },
     {
      "text": "Say what, if anything, the position is hedging and what that hedge costs",
      "lesson": "hedging-with-options"
     }
    ]
   },
   "stages": [
    {
     "name": "What you are trading",
     "lessons": [
      "options-four-positions",
      "options-contract-mechanics",
      "payoff-shape-vs-greek-signs",
      "covered-call-equals-short-put"
     ]
    },
    {
     "name": "Ways to trade them",
     "lessons": [
      "options-trading-styles",
      "options-spreads-and-structures",
      "options-trade-selection"
     ]
    },
    {
     "name": "Where the money is made and lost",
     "lessons": [
      "theta-decay",
      "vega-volatility-surface",
      "variance-risk-premium",
      "delta-hedging-gamma-scalping"
     ]
    },
    {
     "name": "Staying alive",
     "lessons": [
      "short-premium-risk-and-sizing",
      "hedging-with-options",
      "tail-risk-hedging-convexity",
      "trade-management-exits"
     ]
    },
    {
     "name": "The human side",
     "lessons": [
      "loss-aversion-prospect-theory",
      "process-vs-outcome-decision-journals"
     ]
    }
   ]
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
      "swap-curves-ois",
      "short-rate-models-vasicek-cir-hull-white"
     ]
    },
    {
     "name": "Central banks and plumbing",
     "lessons": [
      "central-bank-policy",
      "event-trading-playbook",
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
      "fx-options-quoting-rr-bf",
      "fx-fixings-wm-reuters",
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
      "gradient-boosting",
      "regression-diagnostics",
      "model-selection-aic-bic",
      "arima-var",
      "trend-cycle-filters",
      "change-point-detection"
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
      "fx-fixings-wm-reuters",
      "market-impact-almgren-chriss",
      "kelly-criterion",
      "trade-management-exits",
      "coherent-risk-measures",
      "limit-order-books",
      "vpin-order-flow-toxicity"
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
      "alpha-beta-separation",
      "merton-portfolio-problem"
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
      "random-matrix-theory",
      "graph-theory-centrality"
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
  },
  {
   "id": "foundations",
   "name": "Maths from Scratch",
   "icon": "🧮",
   "who": "For anyone whose maths is rusty, or who wants the tools under every other lesson: from algebra to the solvers that fit models.",
   "stages": [
    {
     "name": "Back to basics",
     "lessons": [
      "foundation-algebra-functions",
      "foundation-trig-logs-exponentials",
      "foundation-complex-numbers"
     ]
    },
    {
     "name": "Calculus that finance uses",
     "lessons": [
      "foundation-multivariable-calculus",
      "calculus-for-finance",
      "limits-integrals-annuity-factors"
     ]
    },
    {
     "name": "Matrices and optimisation",
     "lessons": [
      "linear-algebra-matrices",
      "foundation-optimization-basics",
      "convex-optimization",
      "linear-quadratic-programming"
     ]
    },
    {
     "name": "Making a computer do it",
     "lessons": [
      "newton-raphson-gradient-descent",
      "numerical-integration"
     ]
    },
    {
     "name": "The human side",
     "lessons": [
      "process-vs-outcome-decision-journals"
     ]
    }
   ],
   "deliverable": {
    "title": "A bond and a portfolio, worked by hand",
    "what": "One page where you price a bond, solve for its yield and build a two-asset minimum-variance portfolio, showing every step, then check each answer with a calculator.",
    "steps": [
     {
      "text": "Turn a 5% annual return into a log return and back, and say why the two differ",
      "lesson": "foundation-trig-logs-exponentials"
     },
     {
      "text": "Price a 5-year, 4% coupon bond at a 5% yield with the annuity factor, not by summing every coupon",
      "lesson": "limits-integrals-annuity-factors"
     },
     {
      "text": "Work out how much the price moves for a 1-point change in yield, using the derivative",
      "lesson": "calculus-for-finance"
     },
     {
      "text": "Given only the price, solve for the yield with three Newton-Raphson steps and show each one",
      "lesson": "newton-raphson-gradient-descent"
     },
     {
      "text": "Write two assets' covariance as a matrix and find the minimum-variance weights",
      "lesson": "linear-algebra-matrices"
     },
     {
      "text": "Add a no-short-selling rule and say whether the answer changes, and why",
      "lesson": "linear-quadratic-programming"
     }
    ]
   }
  },
  {
   "id": "stochastic",
   "name": "Stochastic Calculus & Pricing",
   "icon": "📐",
   "who": "For the deep end: the continuous-time maths under option pricing and rate models, and how to simulate it when no formula exists.",
   "stages": [
    {
     "name": "Calculus for random paths",
     "lessons": [
      "ito-lemma",
      "sde-existence-uniqueness",
      "girsanov-risk-neutral"
     ]
    },
    {
     "name": "Simulating and solving",
     "lessons": [
      "sde-numerical-schemes",
      "multivariate-correlated-sdes",
      "fokker-planck-equation",
      "fft-option-pricing-carr-madan"
     ]
    },
    {
     "name": "Beyond Brownian motion",
     "lessons": [
      "fractional-brownian-motion",
      "short-rate-models-vasicek-cir-hull-white",
      "stochastic-pdes",
      "neural-sdes-spdes"
     ]
    },
    {
     "name": "The human side",
     "lessons": [
      "overconfidence-overtrading"
     ]
    }
   ],
   "deliverable": {
    "title": "One option, priced three ways",
    "what": "A European call priced by simulation, by Fourier transform and by the Black-Scholes formula, with the three answers compared and every gap explained.",
    "steps": [
     {
      "text": "Apply Ito's lemma to geometric Brownian motion and write down the distribution of the log price",
      "lesson": "ito-lemma"
     },
     {
      "text": "Switch to the risk-neutral measure and say exactly what changes in the drift, and what does not",
      "lesson": "girsanov-risk-neutral"
     },
     {
      "text": "Simulate 10,000 paths with Euler-Maruyama and price the call by Monte Carlo, with a standard error",
      "lesson": "sde-numerical-schemes"
     },
     {
      "text": "Price the same call with the Carr-Madan FFT and compare",
      "lesson": "fft-option-pricing-carr-madan"
     },
     {
      "text": "Check both against the Black-Scholes formula and explain any gap bigger than the Monte Carlo error",
      "lesson": "black-scholes"
     },
     {
      "text": "Plot the simulated terminal prices against the density the Fokker-Planck equation predicts",
      "lesson": "fokker-planck-equation"
     }
    ]
   }
  },
  {
   "id": "quantml",
   "name": "Quant Methods & Machine Learning",
   "icon": "🤖",
   "who": "For anyone who wants the modern toolkit: Bayesian models, filters, signal processing and machine learning, and the discipline to tell when they beat something simple.",
   "stages": [
    {
     "name": "Bayesian models",
     "lessons": [
      "bayesian-conjugate-priors",
      "mcmc-metropolis-gibbs",
      "hierarchical-bayesian-models",
      "hamiltonian-monte-carlo-nuts"
     ]
    },
    {
     "name": "Hidden states and filters",
     "lessons": [
      "kalman-smoother-ekf-ukf",
      "particle-filter",
      "regime-switching-state-space",
      "change-point-detection"
     ]
    },
    {
     "name": "Information and signals",
     "lessons": [
      "entropy-kl-mutual-information",
      "transfer-entropy-causality",
      "mdl-information-criteria",
      "fourier-analysis-frequency-domain",
      "wavelets-time-frequency",
      "graph-theory-centrality"
     ]
    },
    {
     "name": "Machine learning",
     "lessons": [
      "decision-trees-random-forests",
      "clustering-market-structure",
      "anomaly-detection-isolation-autoencoders",
      "recurrent-networks-lstm-gru",
      "attention-transformers-time-series",
      "nlp-trading-signals-sentiment"
     ]
    },
    {
     "name": "Learning to act",
     "lessons": [
      "mdp-bellman-equation",
      "q-learning-temporal-difference",
      "policy-gradients-actor-critic",
      "deep-q-networks"
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
    "title": "One model against a simple baseline",
    "what": "A single machine-learning model tested honestly against a plain linear baseline on the same data, with the result reported even if the simple model wins.",
    "steps": [
     {
      "text": "Write the hypothesis and the pass bar before fitting anything",
      "lesson": "research-pipeline-hypothesis-to-backtest"
     },
     {
      "text": "Fit the plain baseline and check its residuals",
      "lesson": "regression-diagnostics"
     },
     {
      "text": "Fit a random forest on the same features",
      "lesson": "decision-trees-random-forests"
     },
     {
      "text": "Compare both with purged walk-forward splits, never a random shuffle",
      "lesson": "walk-forward-purged-cv"
     },
     {
      "text": "Score both on information criteria, so extra complexity has to pay for itself",
      "lesson": "model-selection-aic-bic"
     },
     {
      "text": "Count every model and setting you tried, and correct for it",
      "lesson": "multiple-testing"
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
  },
  "anomaly-detection-isolation-autoencoders": {
   "t": "Anomaly Detection: Isolation Forests & Autoencoders",
   "min": 17,
   "micro": true
  },
  "arima-var": {
   "t": "ARIMA & Vector Autoregression (VAR)",
   "min": 17,
   "micro": true
  },
  "attention-transformers-time-series": {
   "t": "Attention & Transformers for Time Series",
   "min": 19,
   "micro": true
  },
  "bayesian-conjugate-priors": {
   "t": "Conjugate Priors & Bayesian Updating in Practice",
   "min": 16,
   "micro": true
  },
  "calculus-for-finance": {
   "t": "Calculus for Finance: Derivatives, Integrals & Taylor Series",
   "min": 15,
   "micro": true
  },
  "change-point-detection": {
   "t": "Change-Point Detection",
   "min": 16,
   "micro": true
  },
  "clustering-market-structure": {
   "t": "Clustering for Market Structure: k-Means & Hierarchical Clustering",
   "min": 17,
   "micro": true
  },
  "convex-optimization": {
   "t": "Convex Optimization",
   "min": 17,
   "micro": true
  },
  "decision-trees-random-forests": {
   "t": "Decision Trees & Random Forests",
   "min": 16,
   "micro": true
  },
  "deep-q-networks": {
   "t": "Deep Q-Networks & Function Approximation",
   "min": 16,
   "micro": true
  },
  "entropy-kl-mutual-information": {
   "t": "Entropy, KL Divergence & Mutual Information",
   "min": 16,
   "micro": true
  },
  "fft-option-pricing-carr-madan": {
   "t": "FFT Option Pricing (Carr-Madan)",
   "min": 16,
   "micro": true
  },
  "fokker-planck-equation": {
   "t": "The Fokker-Planck Equation",
   "min": 19,
   "micro": true
  },
  "foundation-algebra-functions": {
   "t": "Algebra & Functions Refresher",
   "min": 14,
   "micro": true
  },
  "foundation-complex-numbers": {
   "t": "Complex Numbers",
   "min": 13,
   "micro": true
  },
  "foundation-multivariable-calculus": {
   "t": "Partial Derivatives & Multivariable Calculus",
   "min": 14,
   "micro": true
  },
  "foundation-optimization-basics": {
   "t": "Optimization Basics: Unconstrained & Constrained",
   "min": 15,
   "micro": true
  },
  "foundation-trig-logs-exponentials": {
   "t": "Trigonometry, Logarithms & Exponentials",
   "min": 16,
   "micro": true
  },
  "fourier-analysis-frequency-domain": {
   "t": "Fourier Analysis & the Frequency Domain",
   "min": 14,
   "micro": true
  },
  "fractional-brownian-motion": {
   "t": "Fractional Brownian Motion & Long Memory",
   "min": 17,
   "micro": true
  },
  "girsanov-risk-neutral": {
   "t": "Girsanov's Theorem & the Risk-Neutral Measure",
   "min": 17,
   "micro": true
  },
  "graph-theory-centrality": {
   "t": "Graph Theory Fundamentals & Centrality Measures",
   "min": 17,
   "micro": true
  },
  "hamiltonian-monte-carlo-nuts": {
   "t": "Hamiltonian Monte Carlo & NUTS",
   "min": 18,
   "micro": true
  },
  "hierarchical-bayesian-models": {
   "t": "Hierarchical Bayesian Models & Partial Pooling",
   "min": 17,
   "micro": true
  },
  "ito-lemma": {
   "t": "Itô's Lemma",
   "min": 18,
   "micro": true
  },
  "kalman-smoother-ekf-ukf": {
   "t": "The Kalman Smoother & Extended/Unscented Kalman Filters",
   "min": 19,
   "micro": true
  },
  "limit-order-books": {
   "t": "Limit Order Books & Queue Dynamics",
   "min": 15,
   "micro": true
  },
  "limits-integrals-annuity-factors": {
   "t": "Limits, Integrals & Annuity Factors",
   "min": 18,
   "micro": true
  },
  "linear-algebra-matrices": {
   "t": "Linear Algebra & Matrices",
   "min": 15,
   "micro": true
  },
  "linear-quadratic-programming": {
   "t": "Linear & Quadratic Programming",
   "min": 16,
   "micro": true
  },
  "mcmc-metropolis-gibbs": {
   "t": "MCMC: Metropolis-Hastings & Gibbs Sampling",
   "min": 17,
   "micro": true
  },
  "mdl-information-criteria": {
   "t": "Minimum Description Length & Information Criteria",
   "min": 14,
   "micro": true
  },
  "mdp-bellman-equation": {
   "t": "MDPs, Value Functions & the Bellman Equation",
   "min": 17,
   "micro": true
  },
  "merton-portfolio-problem": {
   "t": "Merton's Continuous-Time Portfolio Problem",
   "min": 18,
   "micro": true
  },
  "model-selection-aic-bic": {
   "t": "Model Selection: AIC & BIC",
   "min": 15,
   "micro": true
  },
  "multivariate-correlated-sdes": {
   "t": "Multivariate & Correlated SDEs",
   "min": 15,
   "micro": true
  },
  "neural-sdes-spdes": {
   "t": "Neural SDEs & Neural SPDEs",
   "min": 14,
   "micro": true
  },
  "newton-raphson-gradient-descent": {
   "t": "Newton-Raphson & Gradient Descent",
   "min": 17,
   "micro": true
  },
  "nlp-trading-signals-sentiment": {
   "t": "NLP for Trading Signals: Sentiment, Embeddings & FinBERT",
   "min": 18,
   "micro": true
  },
  "numerical-integration": {
   "t": "Numerical Integration",
   "min": 16,
   "micro": true
  },
  "particle-filter": {
   "t": "The Particle Filter (Sequential Monte Carlo)",
   "min": 18,
   "micro": true
  },
  "policy-gradients-actor-critic": {
   "t": "Policy Gradients & Actor-Critic Methods",
   "min": 17,
   "micro": true
  },
  "q-learning-temporal-difference": {
   "t": "Q-Learning & Temporal-Difference Methods",
   "min": 16,
   "micro": true
  },
  "recurrent-networks-lstm-gru": {
   "t": "Recurrent Networks for Sequential Data: LSTM & GRU",
   "min": 18,
   "micro": true
  },
  "regime-switching-state-space": {
   "t": "Regime-Switching State Space Models",
   "min": 18,
   "micro": true
  },
  "regression-diagnostics": {
   "t": "Regression Diagnostics: Durbin-Watson, Breusch-Pagan & Jarque-Bera",
   "min": 17,
   "micro": true
  },
  "sde-existence-uniqueness": {
   "t": "Existence & Uniqueness of SDE Solutions",
   "min": 16,
   "micro": true
  },
  "sde-numerical-schemes": {
   "t": "Numerical Schemes: Euler-Maruyama & Milstein",
   "min": 17,
   "micro": true
  },
  "short-rate-models-vasicek-cir-hull-white": {
   "t": "Short-Rate Models: Vasicek, CIR & Hull-White",
   "min": 18,
   "micro": true
  },
  "stochastic-pdes": {
   "t": "Stochastic PDEs",
   "min": 18,
   "micro": true
  },
  "transfer-entropy-causality": {
   "t": "Transfer Entropy & Information-Theoretic Causality",
   "min": 15,
   "micro": true
  },
  "trend-cycle-filters": {
   "t": "Trend/Cycle Filters: Hodrick-Prescott, Butterworth & Baxter-King",
   "min": 16,
   "micro": true
  },
  "vpin-order-flow-toxicity": {
   "t": "Order Flow Toxicity & VPIN",
   "min": 16,
   "micro": true
  },
  "wavelets-time-frequency": {
   "t": "Wavelets & Time-Frequency Analysis",
   "min": 15,
   "micro": true
  },
  "fx-fixings-wm-reuters": {
   "t": "FX Fixings & the WM/Reuters 4pm Fix",
   "min": 18,
   "micro": true
  },
  "fx-options-quoting-rr-bf": {
   "t": "FX Options Quoting: Delta, Risk Reversals & Butterflies",
   "min": 18,
   "micro": true
  },
  "trade-management-exits": {
   "t": "Managing the Trade: R-Multiples, Stops & Exits",
   "min": 19,
   "micro": true
  },
  "event-trading-playbook": {
   "t": "The Event-Trading Playbook: Payrolls, CPI and Central Banks",
   "min": 18,
   "micro": true
  },
  "options-contract-mechanics": {
   "t": "Options Contract Mechanics: What You Actually Trade",
   "min": 18,
   "micro": true
  },
  "options-trading-styles": {
   "t": "Five Ways to Trade Options, and How Each One Fails",
   "min": 17,
   "micro": true
  },
  "options-spreads-and-structures": {
   "t": "Option Spreads & Structures",
   "min": 18,
   "micro": true
  },
  "options-trade-selection": {
   "t": "From View to Trade: Choosing the Expiry and Strike",
   "min": 17,
   "micro": true
  },
  "variance-risk-premium": {
   "t": "The Variance Risk Premium: Why Implied Volatility Usually Beats Realised",
   "min": 18,
   "micro": true
  },
  "delta-hedging-gamma-scalping": {
   "t": "Delta Hedging & Gamma Scalping",
   "min": 18,
   "micro": true
  },
  "short-premium-risk-and-sizing": {
   "t": "Short Premium: Risk, Margin & Sizing",
   "min": 21,
   "micro": true
  },
  "hedging-with-options": {
   "t": "Hedging with Options: Puts, Collars and FX Cover",
   "min": 19,
   "micro": true
  }
 }
};
