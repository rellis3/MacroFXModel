<!-- https://cog000.github.io/Macro-Data-Importance/ | Macro & Data Importance | Quantitative Framework -->
Colez Trades
Quantitative & Macro Insights
C.OG
C.OG
- Macro Factors

- Regime Detection

- Entry Models

- Validation

SYSTEMATIC TRADING FRAMEWORK
# Macro Drivers, Regime Detection & Validation

A comprehensive framework for understanding how macroeconomic factors drive asset prices, detecting market regimes systematically, and validating strategies with rigorous quantitative methods.

[SVG: ]
Jump to Regimes
regime_detector.py
$ python detect_regime.py --date today
[INFO] Loading macro indicators...
[INFO] Growth: ISM 52.3, NFP +180k, GDP +2.1%
[INFO] Inflation: CPI 3.2%, Core PCE 2.8%
[REGIME] Current: REFLATION
[SIGNAL] Overweight: Commodities, Value, TIPS
[SIGNAL] Underweight: Duration, Growth stocks
[INFO] Confidence: 78%
$ _
01 — MACRO FACTORS
## The Drivers of Asset Prices

Macroeconomic variables create the fundamental currents that move markets. Understanding these drivers is the foundation of systematic macro trading.

📈
### Growth Expectations

GDP growth, employment trends, industrial production, and leading indicators shape risk appetite and corporate earnings expectations across all asset classes.

🔥
### Inflation Dynamics

CPI, PCE, wage growth, and inflation expectations determine real returns, central bank policy, and the relative attractiveness of nominal vs real assets.

🏦
### Monetary Policy

Fed funds rate, QE/QT, forward guidance, and global central bank coordination drive liquidity conditions and discount rates for all assets.

💧
### Liquidity Conditions

M2 growth, bank reserves, credit spreads, and funding markets measure the availability of capital flowing through the financial system.

📊
### Risk Sentiment

VIX, credit spreads, safe haven flows, and positioning data reveal aggregate market risk appetite and potential for mean reversion.

🌐
### Global Flows

Capital flows, currency movements, trade balances, and reserve accumulation drive cross-border dynamics and relative valuations.

Yield Curve Credit Cycle Liquidity
### Yield Curve as Economic Barometer

The yield curve encodes market expectations about future growth, inflation, and monetary policy. Its shape is one of the most powerful predictive signals in macro finance.

Term Spread
Spread = Yield(10Y) - Yield(2Y)
| Curve Shape | Economic Implication | Historical Lead Time | Asset Implications |
| Steep (Normal) | Expansion expected, positive carry | — | CyclicalsBanksDuration |
| Flat | Transition period, uncertainty | 6-12 months pre-slowdown | QualityCash |
| Inverted | Recession signal, rate cuts expected | 12-24 months pre-recession | DurationDefensivesCyclicals |
| Bear Steepening | Rising long rates, inflation fears | — | CommoditiesTIPSGrowth |
| Bull Steepening | Rate cuts, early recovery | — | Risk AssetsSmall Cap |

### Credit Cycle Phases

Credit cycles drive asset prices through availability and cost of capital. The phase of the credit cycle determines which strategies and assets perform best.

#### 1. Repair Phase

Deleveraging, tight standards, rising defaults. Distressed debt opportunities. Quality outperforms.

#### 2. Recovery Phase

Standards ease, spreads compress, leverage rebuilds. High yield outperforms, credit-sensitive equities rally.

#### 3. Expansion Phase

Abundant credit, declining spreads, rising leverage. Risk assets perform well, momentum strategies work.

#### 4. Downturn Phase

Tightening standards, widening spreads, stress emerges. Defensive positioning, short credit, long quality.

### Liquidity Transmission

Central bank liquidity flows through the financial system and ultimately drives asset valuations. Track the plumbing.

### Fed Balance Sheet

QE expands, QT contracts. Highly correlated with equity multiples and credit spreads.

Key Metric
ΔFed Assets / GDP
### Bank Reserves

Reserve scarcity tightens funding. Watch RRP, TGA balance, and reserve levels.

Key Metric
Reserves - (TGA + RRP)
### Global M2

Money supply growth leads risk asset performance by 6-12 months.

Key Metric
YoY % Change in Global M2 (USD)
02 — REGIME DETECTION
## Systematic Regime Classification

Markets cycle through distinct regimes defined by growth and inflation dynamics. Identifying the current regime enables tactical allocation and strategy selection.

### The Growth-Inflation Quadrant

Every macro environment can be classified into one of four regimes based on two dimensions: growth trajectory and inflation trajectory. Each regime has distinct asset class implications.

#### Goldilocks

↑ Growth Rising ↓ Inflation Falling
The ideal environment. Strong growth without inflationary pressure allows central banks to remain accommodative. Risk assets thrive.

Overweight Equities Credit Growth Stocks EM
Underweight Commodities Gold Cash
#### Reflation

↑ Growth Rising ↑ Inflation Rising
Economic expansion with building price pressures. Central banks begin tightening. Real assets and value outperform.

Overweight Commodities Value TIPS Energy
Underweight Duration Growth Stocks Bonds
#### Deflation / Risk-Off

↓ Growth Falling ↓ Inflation Falling
Economic contraction with falling prices. Flight to safety dominates. Central banks cut aggressively.

Overweight Duration Quality USD Defensives
Underweight Cyclicals EM High Yield
#### Stagflation

↓ Growth Falling ↑ Inflation Rising
The worst environment. Weak growth with persistent inflation leaves central banks trapped. Real assets and cash are the only refuge.

Overweight Gold Energy Cash TIPS
Underweight Equities Bonds Credit
[SVG: ]
#### Indicator Selection

Regime detection requires leading indicators for both growth and inflation. The key is using **rate of change** rather than levels — we care about trajectory, not absolute values.

| Dimension | Primary Indicators | Secondary Indicators | Signal Construction |
| Growth | ISM Manufacturing PMI, ISM Services PMI | Initial Claims, LEI, Industrial Production | 3-month rate of change vs 12-month trend |
| Inflation | Core CPI, Core PCE, 5Y Breakevens | PPI, Wage Growth, Commodity Indices | YoY change in 3-month momentum |

### Implementation: Regime Classifier

A systematic approach to regime classification using composite growth and inflation scores.

import pandas as pd import numpy as np def calculate_growth_score(ism_mfg, ism_svc, claims, lei): # Normalize each indicator to z-score # Calculate 3-month momentum vs 12-month trend ism_composite = 0.4 * ism_mfg + 0.4 * ism_svc + 0.2 * (50 - claims_zscore) momentum = ism_composite.rolling(3).mean() - ism_composite.rolling(12).mean() return momentum def calculate_inflation_score(core_cpi, core_pce, breakevens): # Composite inflation momentum inflation_composite = 0.4 * core_cpi + 0.4 * core_pce + 0.2 * breakevens momentum = inflation_composite.diff(3) # 3-month change return momentum def classify_regime(growth_score, inflation_score): # Threshold at zero for simplicity (or use percentiles) if growth_score > 0 and inflation_score <= 0: return "GOLDILOCKS" elif growth_score > 0 and inflation_score > 0: return "REFLATION" elif growth_score <= 0 and inflation_score > 0: return "STAGFLATION" else: return "DEFLATION" # Note for beginners: FRED API provides free access to all these indicators. # Use fred.stlouisfed.org or the fredapi Python package.
[SVG: ]
Regime transitions are often more important than the regime itself. Early detection of transitions provides the highest-value trading signals.

| Transition | Early Warning Signs | Typical Duration | Positioning Shift |
| Goldilocks → Reflation | Wage growth accelerating, commodity prices rising, breakevens widening | 3-6 months | Rotate from Growth to Value, add commodities, reduce duration |
| Reflation → Stagflation | PMIs rolling over while inflation sticky, yield curve flattening | 2-4 months | Reduce equity beta, add gold, increase cash |
| Stagflation → Deflation | Credit spreads widening, inflation expectations falling, PMIs contracting | 1-3 months (often rapid) | Add duration aggressively, quality over junk, reduce commodities |
| Deflation → Goldilocks | PMIs troughing, credit spreads narrowing, central bank easing | 3-6 months | Add risk, reduce duration, favor cyclicals |

[SVG: ]
1970-2024
| Asset Class | Goldilocks | Reflation | Stagflation | Deflation |
| US Equities | +15.2% | +8.4% | -4.2% | -12.1% |
| US Treasuries (10Y) | +4.1% | -2.3% | -1.8% | +11.4% |
| Commodities (GSCI) | +1.2% | +18.7% | +12.3% | -15.8% |
| Gold | -2.1% | +8.9% | +21.4% | +6.2% |
| USD Index | -3.2% | +0.8% | +2.4% | +7.1% |

Annualized returns. Regimes classified using ISM and CPI momentum. Past performance is not indicative of future results.

03 — ENTRY MODELS
## Systematic Trading Strategies

Different market inefficiencies require different exploitation methods. Master the core model types and understand when each applies.

⟲
#### Mean Reversion

Exploiting price deviations from fair value

##### Core Concept

Prices oscillate around a central tendency. Extreme deviations tend to revert, creating opportunities to fade moves.

##### Signal Construction

- Z-score from moving average: Entry when |Z| > 2

- RSI extremes: Oversold < 30, Overbought > 70

- Bollinger Band penetration with volume confirmation

- Pairs trading: Spread deviation from cointegrated equilibrium

Z-Score Signal
Z = (Price - MA) / σ
##### Best Conditions

- Range-bound, low volatility regimes

- High mean reversion coefficient assets

- Absence of strong fundamental catalysts

↗
#### Momentum / Trend Following

Riding persistent price movements

##### Core Concept

Winners keep winning, losers keep losing. Price trends persist due to behavioral biases and slow information diffusion.

##### Signal Construction

- Time-series: 12-1 month returns (skip recent month)

- Moving average crossovers: 50/200 day golden cross

- Breakout systems: Donchian channels, ATR-based

- Cross-sectional: Rank assets, long top decile, short bottom

12-1 Momentum
Signal = Return(t-252 to t-21)
##### Best Conditions

- Trending markets, macro regime changes

- High dispersion across assets

- Strong macro catalysts driving flows

⇌
#### Statistical Arbitrage

Exploiting relative mispricings

##### Core Concept

Related securities should maintain stable relationships. Temporary deviations create market-neutral opportunities.

##### Strategy Types

- **Pairs Trading:** Long underperformer, short outperformer

- **Basket vs Component:** ETF vs underlying, index vs futures

- **Factor Residuals:** Alpha after removing factor exposures

- **Cross-Asset:** Credit vs equity, commodity vs producer

Cointegration Spread
Spread = β₀ + β₁·Asset₁ - Asset₂ + ε
##### Key Requirements

- Cointegration (not just correlation)

- Economic linkage explaining relationship

- Sufficient liquidity in both legs

⏱
#### Lead-Lag Relationships

Exploiting information transmission delays

##### Core Concept

Information doesn't propagate instantly. Some assets, sectors, or markets lead others, creating predictive signals.

##### Common Lead-Lag Pairs

- **Copper → Equities:** Industrial demand leading indicator

- **Credit → Equity:** Credit markets often lead turning points

- **Large Cap → Small Cap:** Information flows to less liquid

- **Futures → Cash:** Informed traders use leveraged markets first

Cross-Correlation
ρ(lag) = Corr(Xt, Yt+lag)
##### Validation Required

- Granger causality testing

- Out-of-sample stability

- Economic rationale for the lead

04 — VALIDATION FRAMEWORK
## Rigorous Strategy Testing

The quantitative structure that separates robust strategies from data-mined illusions. Every edge must survive this gauntlet.

01
#### In-Sample Dev

Build and optimize on training data

02
#### Walk-Forward

Rolling optimization + test windows

03
#### Out-of-Sample

Final holdout test (never touched)

04
#### Monte Carlo

Assess robustness via simulation

05
#### Sensitivity

Parameter stability testing

06
#### Paper Trade

Live market, no capital risk

Walk-Forward Analysis Monte Carlo Methods Statistical Tests
### Walk-Forward Optimization

The gold standard for strategy validation. Simulates real trading by repeatedly optimizing on past data and testing on future data.

Window 1: ████████████████ Train → ████ Test
Window 2: ████████████████████ Train → ████ Test
Window 3: ████████████████████████ Train → ████ Test
Window 4: ████████████████████████████ Train → ████ Test
Final performance is the concatenation of all OOS test periods. This mimics real trading where you never have future information.

Walk-Forward Efficiency
WFE = OOS Performance / IS Performance
Target WFE > 0.5. Below 0.3 suggests severe overfitting.

### Monte Carlo Simulation

Assess strategy robustness by simulating thousands of alternative paths and outcomes.

### Trade Shuffling

Randomly reorder historical trades 10,000+ times. Examines if sequence matters or if results are path-dependent.

**Output:** Distribution of drawdowns, terminal wealth

### Bootstrap Returns

Resample daily returns with replacement to generate synthetic return paths. Tests stability of metrics.

**Output:** Confidence intervals for Sharpe, CAGR

### Parameter Perturbation

Vary parameters ±20% randomly across simulations. Robust strategies tolerate parameter noise.

**Output:** Performance distribution under parameter uncertainty

Monte Carlo Confidence Interval
CI₉₅ = [Percentile(2.5%), Percentile(97.5%)]
### Statistical Significance Testing

Quantify the probability that results arose by chance rather than genuine edge.

| Test | Purpose | Pass Threshold |
| T-Statistic | Test if mean return significantly differs from zero | |t| > 2.0 (uncorrected), > 3.0 (preferred) |
| Deflated Sharpe Ratio | Adjust for multiple testing, skewness, kurtosis | DSR > 0 at 95% confidence |
| Minimum Track Record | Years needed to confirm Sharpe is real | MTR = (1 + SR²) / SR² years |
| Probabilistic Sharpe | Probability observed Sharpe exceeds benchmark | PSR > 95% |

[SVG: ]
| Metric | Formula | Good | Excellent | What It Measures |
| Sharpe Ratio | (R - Rf) / σ | > 1.0 | > 2.0 | Risk-adjusted return (total volatility) |
| Sortino Ratio | (R - Rf) / σ_down | > 1.5 | > 2.5 | Risk-adjusted (downside vol only) |
| Calmar Ratio | CAGR / MaxDD | > 0.5 | > 1.0 | Return per unit drawdown risk |
| Information Ratio | α / Tracking Error | > 0.5 | > 1.0 | Active return per unit active risk |
| Profit Factor | Gross Profit / Gross Loss | > 1.5 | > 2.0 | Magnitude of wins vs losses |

[SVG: ]
#### Before Backtesting

- □ Economic rationale documented

- □ Point-in-time data confirmed

- □ Survivorship bias addressed

- □ Transaction cost model built

- □ OOS holdout data reserved

#### Before Live Trading

- □ Walk-forward analysis passed

- □ Statistical significance confirmed

- □ Monte Carlo stress tested

- □ Paper trading completed (3+ months)

- □ Risk limits and kill switches set

Macro Analysis • Regime Detection • Quantitative Validation

Educational content only. Not financial advice.
