# Free-to-read research list (no login, no payment)

Built 2026-11-08 from arXiv, NBER, BIS/ECB/Federal Reserve/NY Fed/Bank of England working papers, author and university pages and open copies found through OpenAlex. Every row marked **yes** was fetched with a plain request, checked as a real PDF (`%PDF` header, over 30 KB, 3 to 600 pages) and held outside git. The PDFs and `manifest.json` live in the session scratchpad (`.../scratchpad/free/`), **never in git**. SSRN items are not repeated here: see `SSRN_DOWNLOAD_LIST.md`; papers already in `manifest.csv` were skipped.

**Totals:** 148 PDFs downloaded (247 MB), plus 10 listed without a direct PDF. By source: arXiv 104; Author/university repository 18; NBER 11; Federal Reserve 5; davidhbailey.com 3; NY Fed 2; MPRA/RePEc 2; ECB 1; UPF 1; Bank of England 1.

## Papers by topic

### Macro regimes (HMM, Markov switching, Bayesian)

| Title | Authors | Year | Source | Link | Why it matters for us | Downloaded |
|---|---|---|---|---|---|---|
| Dynamic allocation: extremes, tail dependence, and regime Shifts | Yin Luo, Sheng Wang, Javed Jussa | 2025 | arXiv | [arXiv](https://arxiv.org/abs/2506.12587) | Regime identification for conditioning | yes |
| Downside Risk Reduction Using Regime-Switching Signals: A Statistical Jump Model Approach | Yizhan Shu, Chenyu Yu, John M. Mulvey | 2024 | arXiv | [arXiv](https://arxiv.org/abs/2402.05272) | Regime identification for conditioning | yes |
| Online Learning of Order Flow and Market Impact with Bayesian Change-Point Detection Methods | Ioanna-Yvonni Tsaknaki, Fabrizio Lillo, Piero Mazzarisi | 2023 | arXiv | [arXiv](https://arxiv.org/abs/2307.02375) | Order-flow information content | yes |
| Predicting Risk-adjusted Returns using an Asset Independent Regime-switching Model | Nicklas Werge | 2021 | arXiv | [arXiv](https://arxiv.org/abs/2107.05535) | Regime identification for conditioning | yes |
| Detecting bearish and bullish markets in financial time series using hierarchical hidden Markov models | Lennart Oelschläger, Timo Adam | 2020 | arXiv | [arXiv](https://arxiv.org/abs/2007.14874) | HMM regime machinery | yes |
| Structural clustering of volatility regimes for dynamic trading strategies | Arjun Prakash, Nick James, Max Menzies et al. | 2020 | arXiv | [arXiv](https://arxiv.org/abs/2004.09963) | Regime identification for conditioning | yes |
| Portfolio Optimization on Multivariate Regime Switching GARCH Model with Normal Tempered Stable Innovation | Cheng Peng, Young Shin Kim, Stefan Mittnik | 2020 | arXiv | [arXiv](https://arxiv.org/abs/2009.11367) | Regime identification for conditioning | yes |
| Bayesian Vector Autoregressions | Silvia Miranda‐Agrippino, G. Ricco | 2018 | Author/university repository | [PDF](https://researchonline.lse.ac.uk/id/eprint/87393/1/CFMDP2018-08-Paper.pdf) | Bayesian shrinkage / model uncertainty | yes |
| Bayesian Online Changepoint Detection | Ryan Prescott Adams, David J. C. MacKay | 2007 | arXiv | [arXiv](https://arxiv.org/abs/0710.3742) | Bayesian shrinkage / model uncertainty | yes |

### Volatility (GARCH, HAR-RV, jumps)

| Title | Authors | Year | Source | Link | Why it matters for us | Downloaded |
|---|---|---|---|---|---|---|
| Analyzing Currency Fluctuations: A Comparative Study of GARCH, EWMA, and IV Models for GBP/USD and EUR/GBP Pairs | Narayan Tondapu | 2024 | arXiv | [arXiv](https://arxiv.org/abs/2402.07435) | Pairs / spread trading evidence | yes |
| The Hybrid Forecast of S&P 500 Volatility ensembled from VIX, GARCH and LSTM models | Natalia Roszyk, Robert Ślepaczuk | 2024 | arXiv | [arXiv](https://arxiv.org/abs/2407.16780) | Vol forecasting and jump/roughness methods for the vol-range forecasts | yes |
| From GARCH to Neural Network for Volatility Forecast | Pengfei Zhao, Haoren Zhu, Wilfred Siu Hung NG et al. | 2024 | arXiv | [arXiv](https://arxiv.org/abs/2402.06642) | Vol forecasting and jump/roughness methods for the vol-range forecasts | yes |
| Deep Learning Enhanced Realized GARCH | Chen Liu, Chao Wang, Minh-Ngoc Tran et al. | 2023 | arXiv | [arXiv](https://arxiv.org/abs/2302.08002) | Vol forecasting and jump/roughness methods for the vol-range forecasts | yes |
| Combining Deep Learning and GARCH Models for Financial Volatility and Risk Forecasting | Jakub Michańków, Łukasz Kwiatkowski, Janusz Morajda | 2023 | arXiv | [arXiv](https://arxiv.org/abs/2310.01063) | Vol forecasting and jump/roughness methods for the vol-range forecasts | yes |
| Deep Learning Volatility | Blanka Horvath, Aitor Muguruza, Mehdi Tomas | 2019 | arXiv | [arXiv](https://arxiv.org/abs/1901.09647) | Vol forecasting and jump/roughness methods for the vol-range forecasts | yes |
| On the consistency of jump-diffusion dynamics for FX rates under inversion | Federico Graceffa, Damiano Brigo, Andrea Pallavicini | 2019 | arXiv | [arXiv](https://arxiv.org/abs/1905.05310) | Vol forecasting and jump/roughness methods for the vol-range forecasts | yes |
| Dealing with Stochastic Volatility in Time Series Using the R Package stochvol | Gregor Kastner | 2019 | arXiv | [arXiv](https://arxiv.org/abs/1906.12134) | Vol forecasting and jump/roughness methods for the vol-range forecasts | yes |
| Comparative Study of Two Extensions of Heston Stochastic Volatility Model | Gifty Malhotra, R. Srivastava, H. C. Taneja | 2019 | arXiv | [arXiv](https://arxiv.org/abs/1912.10237) | Stochastic-vol calibration | yes |
| Deep calibration of rough stochastic volatility models | Christian Bayer, Benjamin Stemper | 2018 | arXiv | [arXiv](https://arxiv.org/abs/1810.03399) | Vol forecasting and jump/roughness methods for the vol-range forecasts | yes |
| Forecasting realized volatility: a review | Andrea Bucci | 2017 | MPRA/RePEc | [PDF](https://mpra.ub.uni-muenchen.de/83232/1/MPRA_paper_83232.pdf) | Realized-vol (HAR-type) forecasting benchmark | yes |
| Decoupling the short- and long-term behavior of stochastic volatility | Mikkel Bennedsen, Asger Lunde, Mikko S. Pakkanen | 2016 | arXiv | [arXiv](https://arxiv.org/abs/1610.00332) | Vol forecasting and jump/roughness methods for the vol-range forecasts | yes |
| Full and fast calibration of the Heston stochastic volatility model | Yiran Cui, Sebastian del Baño Rollin, Guido Germano | 2015 | arXiv | [arXiv](https://arxiv.org/abs/1511.08718) | Stochastic-vol calibration | yes |
| Volatility is rough | Jim Gatheral, Thibault Jaisson, Mathieu Rosenbaum | 2014 | arXiv | [arXiv](https://arxiv.org/abs/1410.3394) | Rough-vol evidence behind short-horizon vol scaling | yes |
| Modeling and forecasting exchange rate volatility in time-frequency domain | Jozef Barunik, Tomas Krehlik, Lukas Vacha | 2012 | arXiv | [arXiv](https://arxiv.org/abs/1204.1452) | Vol forecasting and jump/roughness methods for the vol-range forecasts | yes |
| Modeling and Forecasting Realized Volatility | Andersen, Bollerslev, Diebold et al. | 2003 | NBER | [PDF](https://www.nber.org/system/files/working_papers/w8160/w8160.pdf) | Realized-vol (HAR-type) forecasting benchmark | yes |

### FX valuation (carry, UIP, PPP, yield spreads)

| Title | Authors | Year | Source | Link | Why it matters for us | Downloaded |
|---|---|---|---|---|---|---|
| A Three-Variable Benchmark for Post-GFC Covered Interest Parity Deviations | Useong Shin | 2026 | arXiv | [arXiv](https://arxiv.org/abs/2605.20137) | CIP/UIP deviations and funding | yes |
| A Mean-Reverting Model of Exchange Rate Risk Premium Using Ornstein-Uhlenbeck Dynamics | SeungJae Hwang | 2025 | arXiv | [arXiv](https://arxiv.org/abs/2504.06028) | FX carry / parity / valuation evidence for the FX signal set | yes |
| Explaining Exchange Rate Forecasts with Macroeconomic Fundamentals Using Interpretive Machine Learning | Davood Pirayesh Neghab, Mucahit Cevik, M. I. M. Wahab | 2023 | arXiv | [arXiv](https://arxiv.org/abs/2303.16149) | ML forecasting benchmark | yes |
| Carry | Koijen, Moskowitz, Pedersen et al. | 2018 | Author/university repository | [PDF](https://pages.stern.nyu.edu/~lpederse/papers/Carry.pdf) | Carry mechanics and crash risk | yes |
| International Liquidity and Exchange Rate Dynamics | Xavier Gabaix, Matteo Maggiori | 2015 | NBER | [PDF](https://www.nber.org/papers/w19854.pdf) | FX carry / parity / valuation evidence for the FX signal set | yes |
| Upside and Downside Risk Exposures of Currency Carry Trades via Tail Dependence | Matthew Ames, Gareth W. Peters, Guillaume Bagnarosa et al. | 2014 | arXiv | [arXiv](https://arxiv.org/abs/1406.4322) | Carry mechanics and crash risk | yes |
| Exchange Rate Predictability in a Changing World | Joseph Byrne, Dimitris Korobilis, Pinho Ribeiro | 2014 | arXiv | [arXiv](https://arxiv.org/abs/1403.0627) | FX carry / parity / valuation evidence for the FX signal set | yes |
| Reinvestigating the Uncovered Interest Rate Parity Puzzle via Analysis of Multivariate Tail Dependence in Currency Carry Trades | Matthew Ames, Guillaume Bagnarosa, Gareth W. Peters | 2013 | arXiv | [arXiv](https://arxiv.org/abs/1303.4314) | Carry mechanics and crash risk | yes |
| Value and Momentum Everywhere | Asness, Moskowitz, Pedersen | 2013 | Author/university repository | [PDF](https://pages.stern.nyu.edu/~lpederse/papers/ValMomEverywhere.pdf) | Cross-asset value/momentum incl. FX | yes |
| Exchange Rate Predictability | Barbara Rossi | 2013 | UPF | [PDF](https://econ-papers.upf.edu/papers/1369.pdf) | FX carry / parity / valuation evidence for the FX signal set | yes |
| Carry Trades and Currency Crashes | Brunnermeier, Nagel, Pedersen | 2008 | NBER | [PDF](https://www.nber.org/system/files/working_papers/w14473/w14473.pdf) | Carry mechanics and crash risk | yes |
| Do Peso Problems Explain the Returns to the Carry Trade? | Burnside, Eichenbaum, Kleshchelski et al. | 2008 | NBER | [PDF](https://www.nber.org/system/files/working_papers/w14054/w14054.pdf) | Carry mechanics and crash risk | yes |
| Exchange Rates and Fundamentals | Engel, West | 2004 | NBER | [PDF](https://www.nber.org/system/files/working_papers/w10723/w10723.pdf) | FX carry / parity / valuation evidence for the FX signal set | yes |
| Empirical Exchange Rate Models of the Nineties: Are Any Fit to Survive? | Yin‐Wong Cheung, Menzie Chinn, Antonio I. Garcia Pascual | 2002 | Author/university repository | [PDF](https://doi.org/10.3386/w9393) | FX carry / parity / valuation evidence for the FX signal set | yes |
| The Dollar, Bank Leverage and Deviations from Covered Interest Parity | Avdjiev, Du, Koch, Shin | 2016 | BIS | [page](https://www.bis.org/publ/work592.htm) | Dollar-driven CIP basis; landing page only (direct PDF link did not return a PDF) | no |
| Global Dollar Credit and Carry Trades: A Firm-Level Analysis | Bruno, Shin | 2015 | BIS | [page](https://www.bis.org/publ/work510.htm) | Carry-trade funding link; landing page only | no |
| Covered interest parity lost: understanding the cross-currency basis | Borio et al. | 2016 | BIS Quarterly Review | [page](https://www.bis.org/publ/qtrpdf/r_qt1609e.htm) | Plain-English CIP basis explainer; landing page only | no |

### Statistical arbitrage (cointegration, VECM, OU)

| Title | Authors | Year | Source | Link | Why it matters for us | Downloaded |
|---|---|---|---|---|---|---|
| Deep Learning Statistical Arbitrage | Jorge Guijarro-Ordonez, Markus Pelger, Greg Zanotti | 2021 | arXiv | [arXiv](https://arxiv.org/abs/2106.04028) | Mean-reversion and spread-trading mechanics (OU, cointegration) | yes |
| Gold Standard Pairs Trading Rules: Are They Valid? | Miroslav Fil | 2020 | arXiv | [arXiv](https://arxiv.org/abs/2010.01157) | Pairs / spread trading evidence | yes |
| A singular stochastic control approach for optimal pairs trading with proportional transaction costs | Haipeng Xing | 2019 | arXiv | [arXiv](https://arxiv.org/abs/1911.10450) | Pairs / spread trading evidence | yes |
| Mean Reversion Trading with Sequential Deadlines and Transaction Costs | Yerkin Kitapbayev, Tim Leung | 2017 | arXiv | [arXiv](https://arxiv.org/abs/1707.03498) | OU mean-reversion trading rules with costs | yes |
| On the Profitability of Optimal Mean Reversion Trading Strategies | Peng Huang, Tianxiang Wang | 2016 | arXiv | [arXiv](https://arxiv.org/abs/1602.05858) | OU mean-reversion trading rules with costs | yes |
| Speculative Futures Trading under Mean Reversion | Tim Leung, Jiao Li, Xin Li et al. | 2016 | arXiv | [arXiv](https://arxiv.org/abs/1601.04210) | OU mean-reversion trading rules with costs | yes |
| Optimal Mean Reversion Trading with Transaction Costs and Stop-Loss Exit | Tim Leung, Xin Li | 2014 | arXiv | [arXiv](https://arxiv.org/abs/1411.5062) | OU mean-reversion trading rules with costs | yes |
| Statistical Arbitrage in the U.S. Equities Market | Avellaneda, Lee | 2010 | Author/university repository | [PDF](https://math.nyu.edu/~avellane/AvellanedaLeeStatArb071108.pdf) | Mean-reversion and spread-trading mechanics (OU, cointegration) | yes |
| Pairs Trading: Performance of a Relative Value Arbitrage Rule | Gatev, Goetzmann, Rouwenhorst | 1999 | NBER | [PDF](https://www.nber.org/system/files/working_papers/w7032/w7032.pdf) | Pairs / spread trading evidence | yes |

### Microstructure (order flow, liquidity, price impact)

| Title | Authors | Year | Source | Link | Why it matters for us | Downloaded |
|---|---|---|---|---|---|---|
| The two square root laws of market impact and the role of sophisticated market participants | Bruno Durin, Mathieu Rosenbaum, Grégoire Szymanski | 2023 | arXiv | [arXiv](https://arxiv.org/abs/2311.18283) | Square-root impact law for sizing/cost | yes |
| Market Impact: Empirical Evidence, Theory and Practice | Emilio Said | 2022 | arXiv | [arXiv](https://arxiv.org/abs/2205.07385) | Execution cost, impact and order-flow evidence | yes |
| Measuring price impact and information content of trades in a time-varying setting | F. Campigli, G. Bormetti, F. Lillo | 2022 | arXiv | [arXiv](https://arxiv.org/abs/2212.12687) | Impact model for cost assumptions | yes |
| The Price Impact of Generalized Order Flow Imbalance | Yuhan Su, Zeyu Sun, Jiarong Li et al. | 2021 | arXiv | [arXiv](https://arxiv.org/abs/2112.02947) | Impact model for cost assumptions | yes |
| Deep Learning modeling of Limit Order Book: a comparative perspective | Antonio Briola, Jeremy Turiel, Tomaso Aste | 2020 | arXiv | [arXiv](https://arxiv.org/abs/2007.07319) | LOB modelling for microstructure features | yes |
| Crossover from linear to square-Root market impact | Frédéric Bucci, Michael Benzaquen, Fabrizio Lillo et al. | 2018 | arXiv | [arXiv](https://arxiv.org/abs/1811.05230) | Square-root impact law for sizing/cost | yes |
| DeepLOB: Deep Convolutional Neural Networks for Limit Order Books | Zihao Zhang, Stefan Zohren, Stephen Roberts | 2018 | arXiv | [arXiv](https://arxiv.org/abs/1808.03668) | LOB modelling for microstructure features | yes |
| The short-term price impact of trades is universal | Bence Toth, Zoltan Eisler, Jean-Philippe Bouchaud | 2017 | arXiv | [arXiv](https://arxiv.org/abs/1702.08029) | Impact model for cost assumptions | yes |
| Deep Learning for Limit Order Books | Justin Sirignano | 2016 | arXiv | [arXiv](https://arxiv.org/abs/1601.01987) | LOB modelling for microstructure features | yes |
| Hawkes processes in finance | Emmanuel Bacry, Iacopo Mastromatteo, Jean-François Muzy | 2015 | arXiv | [arXiv](https://arxiv.org/abs/1502.04592) | Self-exciting flow model for clustering | yes |
| Beyond the square root: Evidence for logarithmic dependence of market impact on size and participation rate | Elia Zarinelli, Michele Treccani, J. Doyne Farmer et al. | 2014 | arXiv | [arXiv](https://arxiv.org/abs/1412.2152) | Square-root impact law for sizing/cost | yes |
| Rise of the Machines: Algorithmic Trading in the Foreign Exchange Market | Alain Chaboud, Benjamin Chiquoine, Erik Hjalmarsson et al. | 2014 | Federal Reserve | [PDF](https://www.federalreserve.gov/pubs/ifdp/2009/980/ifdp980.pdf) | Execution cost, impact and order-flow evidence | yes |
| Dealing with the Inventory Risk. A solution to the market making problem | Olivier Guéant, Charles-Albert Lehalle, Joaquin Fernandez Tapia | 2011 | arXiv | [arXiv](https://arxiv.org/abs/1105.3115) | Execution cost, impact and order-flow evidence | yes |
| Anomalous price impact and the critical nature of liquidity in financial markets | Bence Toth, Yves Lemperiere, Cyril Deremble et al. | 2011 | arXiv | [arXiv](https://arxiv.org/abs/1105.1694) | Impact model for cost assumptions | yes |
| The Price Impact of Order Book Events | Rama Cont, Arseniy Kukanov, Sasha Stoikov | 2010 | arXiv | [arXiv](https://arxiv.org/abs/1011.6402) | Impact model for cost assumptions | yes |
| Price Impact | J. P. Bouchaud | 2009 | arXiv | [arXiv](https://arxiv.org/abs/0903.2428) | Impact model for cost assumptions | yes |
| Optimal Execution of Portfolio Transactions | Almgren, Chriss | 2000 | Author/university repository | [PDF](https://www.smallake.kr/wp-content/uploads/2016/03/optliq.pdf) | Execution cost, impact and order-flow evidence | yes |
| FX Execution Algorithms and Market Functioning | BIS Markets Committee | 2015 | BIS | [page](https://www.bis.org/publ/mktc13.htm) | FX execution-algo structure; landing page only | no |

### Options (gamma, vol surfaces, dealer positioning)

| Title | Authors | Year | Source | Link | Why it matters for us | Downloaded |
|---|---|---|---|---|---|---|
| Beta-Dependent Gamma Feedback and Endogenous Volatility Amplification in Option Markets | Haoying Dai | 2025 | arXiv | [arXiv](https://arxiv.org/abs/2511.22766) | Vol surface / option-flow structure for the options desk | yes |
| Enhancing Deep Hedging of Options with Implied Volatility Surface Feedback Information | Pascal François, Geneviève Gauthier, Frédéric Godin et al. | 2024 | arXiv | [arXiv](https://arxiv.org/abs/2407.21138) | Dealer-style hedging / hedge-ratio methods | yes |
| Calibrating the Heston model with deep differential networks | Chen Zhang, Giovanni Amici, Marco Morandotti | 2024 | arXiv | [arXiv](https://arxiv.org/abs/2407.15536) | Stochastic-vol calibration | yes |
| Option Dynamic Hedging Using Reinforcement Learning | Cong Zheng, Jiafa He, Can Yang | 2023 | arXiv | [arXiv](https://arxiv.org/abs/2306.10743) | Dealer-style hedging / hedge-ratio methods | yes |
| A Two-Step Framework for Arbitrage-Free Prediction of the Implied Volatility Surface | Wenyong Zhang, Lingfei Li, Gongqiu Zhang | 2021 | arXiv | [arXiv](https://arxiv.org/abs/2106.07177) | Vol surface / option-flow structure for the options desk | yes |
| Incorporating prior financial domain knowledge into neural networks for implied volatility surface prediction | Yu Zheng, Yongxin Yang, Bowei Chen | 2019 | arXiv | [arXiv](https://arxiv.org/abs/1904.12834) | Vol surface / option-flow structure for the options desk | yes |
| Supervised Deep Neural Networks (DNNs) for Pricing/Calibration of Vanilla/Exotic Options Under Various Different Processes | Ali Hirsa, Tugce Karatas, Amir Oskoui | 2019 | arXiv | [arXiv](https://arxiv.org/abs/1902.05810) | Vol surface / option-flow structure for the options desk | yes |
| Deep Hedging | Hans Bühler, Lukas Gonon, Josef Teichmann et al. | 2018 | arXiv | [arXiv](https://arxiv.org/abs/1802.03042) | Dealer-style hedging / hedge-ratio methods | yes |
| The price of variance risk | Ian Dew-Becker, Stefano Giglio, Anh Le et al. | 2016 | NBER | [PDF](https://www.nber.org/papers/w21182.pdf) | Variance risk premium evidence | yes |
| Arbitrage-free SVI volatility surfaces | Jim Gatheral, Antoine Jacquier | 2012 | arXiv | [arXiv](https://arxiv.org/abs/1204.0646) | Arbitrage-free vol surface parameterisation | yes |
| Generalised arbitrage-free SVI volatility surfaces | Gaoyue Guo, Antoine Jacquier, Claude Martini et al. | 2012 | arXiv | [arXiv](https://arxiv.org/abs/1210.7111) | Arbitrage-free vol surface parameterisation | yes |
| Implied Volatility Surface: Construction Methodologies and Characteristics | Cristian Homescu | 2011 | arXiv | [arXiv](https://arxiv.org/abs/1107.1834) | Vol surface / option-flow structure for the options desk | yes |
| Demand-Based Option Pricing | Nicolae Bogdan Garleanu, Lasse Heje Pedersen, Allen M. Poteshman | 2005 | Author/university repository | [PDF](https://doi.org/10.3386/w11843) | Vol surface / option-flow structure for the options desk | yes |
| Post-87 Crash Fears in S&P 500 Futures Options | Bates | 1997 | NBER | [PDF](https://www.nber.org/system/files/working_papers/w5894/w5894.pdf) | Vol surface / option-flow structure for the options desk | yes |

### Forecasting (ensembles, Bayesian averaging)

| Title | Authors | Year | Source | Link | Why it matters for us | Downloaded |
|---|---|---|---|---|---|---|
| From Factor Models to Deep Learning: Machine Learning in Reshaping Empirical Asset Pricing | Junyi Ye, Bhaskar Goswami, Jingyi Gu et al. | 2024 | arXiv | [arXiv](https://arxiv.org/abs/2403.06779) | ML forecasting benchmark | yes |
| Hedging Forecast Combinations With an Application to the Random Forest | Elliot Beck, Damian Kozbur, Michael Wolf | 2023 | arXiv | [arXiv](https://arxiv.org/abs/2308.15384) | Dealer-style hedging / hedge-ratio methods | yes |
| Are Transformers Effective for Time Series Forecasting? | Ailing Zeng, Muxi Chen, Lei Zhang et al. | 2022 | arXiv | [arXiv](https://arxiv.org/abs/2205.13504) | ML forecasting baseline (and its critique) | yes |
| Modelling uncertainty in financial tail risk: a forecast combination and weighted quantile approach | Giuseppe Storti, Chao Wang | 2021 | arXiv | [arXiv](https://arxiv.org/abs/2104.04918) | Tail modelling | yes |
| N-BEATS: Neural basis expansion analysis for interpretable time series forecasting | Boris N. Oreshkin, Dmitri Carpov, Nicolas Chapados et al. | 2019 | arXiv | [arXiv](https://arxiv.org/abs/1905.10437) | Forecast combination and ML forecasting benchmarks | yes |
| Temporal Fusion Transformers for Interpretable Multi-horizon Time Series Forecasting | Bryan Lim, Sercan O. Arik, Nicolas Loeff et al. | 2019 | arXiv | [arXiv](https://arxiv.org/abs/1912.09363) | ML forecasting baseline (and its critique) | yes |
| Forecast Encompassing Tests for the Expected Shortfall | Timo Dimitriadis, Julie Schnaitmann | 2019 | arXiv | [arXiv](https://arxiv.org/abs/1908.04569) | ES backtesting for the risk module | yes |
| Semiparametric GARCH via Bayesian model averaging | Wilson Ye Chen, Richard H. Gerlach | 2017 | arXiv | [arXiv](https://arxiv.org/abs/1708.07587) | Bayesian shrinkage / model uncertainty | yes |
| Dynamic Model Averaging in Large Model Spaces Using Dynamic Occam's Window | Luca Onorante, Adrian E. Raftery | 2014 | arXiv | [arXiv](https://arxiv.org/abs/1410.7799) | Forecast combination and ML forecasting benchmarks | yes |

### Portfolio construction (Black-Litterman, Kelly, risk parity)

| Title | Authors | Year | Source | Link | Why it matters for us | Downloaded |
|---|---|---|---|---|---|---|
| The Science and Practice of Trend-Following Systems | Artur Sepp, Vladimir Lucic | 2026 | arXiv | [arXiv](https://arxiv.org/abs/2607.19497) | Sizing and allocation methods (BL, Kelly, risk parity, vol targeting) | yes |
| skfolio: Portfolio Optimization in Python | Carlo Nicolini, Matteo Manzi, Hugo Delatte | 2025 | arXiv | [arXiv](https://arxiv.org/abs/2507.04176) | Sizing and allocation methods (BL, Kelly, risk parity, vol targeting) | yes |
| Dynamic Black-Litterman | Anas Abdelhakmi, Andrew Lim | 2024 | arXiv | [arXiv](https://arxiv.org/abs/2404.18822) | Views-based allocation | yes |
| Application of Black-Litterman Bayesian in Statistical Arbitrage | Qiqin Zhou | 2024 | arXiv | [arXiv](https://arxiv.org/abs/2406.06706) | Views-based allocation | yes |
| Risk Parity Portfolios with Skewness Risk: An Application to Factor Investing and Alternative Risk Premia | Benjamin Bruder, Nazar Kostyuchyk, Thierry Roncalli | 2022 | arXiv | [arXiv](https://arxiv.org/abs/2202.10721) | Risk-contribution allocation | yes |
| Trend-Following Strategies via Dynamic Momentum Learning | Bruno P. C. Levy, Hedibert F. Lopes | 2021 | arXiv | [arXiv](https://arxiv.org/abs/2106.08420) | Sizing and allocation methods (BL, Kelly, risk parity, vol targeting) | yes |
| Enhancing Time Series Momentum Strategies Using Deep Neural Networks | Bryan Lim, Stefan Zohren, Stephen Roberts | 2019 | arXiv | [arXiv](https://arxiv.org/abs/1904.04912) | Core trend / TSMOM evidence | yes |
| Generalized framework for applying the Kelly criterion to stock markets | Tim Byrnes, Tristan Barnett | 2018 | arXiv | [arXiv](https://arxiv.org/abs/1806.05293) | Kelly sizing and its risk-constrained version | yes |
| Bayesian Alternatives to the Black-Litterman Model | Mihnea S. Andrei, John S. J. Hsu | 2018 | arXiv | [arXiv](https://arxiv.org/abs/1811.09309) | Views-based allocation | yes |
| Kelly's Criterion in Portfolio Optimization: A Decoupled Problem | Zachariah Peterson | 2017 | arXiv | [arXiv](https://arxiv.org/abs/1710.00431) | Kelly sizing and its risk-constrained version | yes |
| Risk-Constrained Kelly Gambling | Enzo Busseti, Ernest K. Ryu, Stephen Boyd | 2016 | arXiv | [arXiv](https://arxiv.org/abs/1603.06183) | Kelly sizing and its risk-constrained version | yes |
| Risk parity portfolios with risk factors | Thierry Roncalli, Guillaume Weisang | 2015 | MPRA/RePEc | [PDF](https://mpra.ub.uni-muenchen.de/44017/1/MPRA_paper_44017.pdf) | Risk-contribution allocation | yes |
| Introduction to Risk Parity and Budgeting | Thierry Roncalli | 2014 | arXiv | [arXiv](https://arxiv.org/abs/1403.1889) | Risk-contribution allocation | yes |
| Parametric Risk Parity | Lorenzo Mercuri, Edit Rroji | 2014 | arXiv | [arXiv](https://arxiv.org/abs/1409.7933) | Risk-contribution allocation | yes |
| A Fast Algorithm for Computing High-dimensional Risk Parity Portfolios | Théophile Griveau-Billion, Jean-Charles Richard, Thierry Roncalli | 2013 | arXiv | [arXiv](https://arxiv.org/abs/1311.4057) | Risk-contribution allocation | yes |
| Time Series Momentum | Moskowitz, Ooi, Pedersen | 2012 | Author/university repository | [PDF](https://pages.stern.nyu.edu/~lpederse/papers/TimeSeriesMomentum.pdf) | Core trend / TSMOM evidence | yes |
| Application of the Kelly Criterion to Ornstein-Uhlenbeck Processes | Yingdong Lv, Bernhard K. Meister | 2009 | arXiv | [arXiv](https://arxiv.org/abs/0903.2910) | Kelly sizing and its risk-constrained version | yes |
| A Step-by-Step Guide to the Black-Litterman Model | Idzorek | 2005 | Author/university repository | [PDF](https://people.duke.edu/~charvey/Teaching/BA453_2006/Idzorek_onBL.pdf) | Views-based allocation | yes |
| Leverage Aversion and Risk Parity | Asness, Frazzini, Pedersen | 2012 | AQR | [page](https://www.aqr.com/Insights/Research/Journal-Article/Leverage-Aversion-and-Risk-Parity) | Why risk parity earns a premium; PDF link not direct | no |
| Optimal Versus Naive Diversification | DeMiguel, Garlappi, Uppal | 2009 | LBS | [page](https://faculty.london.edu/avmiguel/DGU-2009.pdf) | 1/N benchmark any optimiser must beat; link did not return a PDF to us | no |

### Risk (EVT, CVaR, Monte Carlo)

| Title | Authors | Year | Source | Link | Why it matters for us | Downloaded |
|---|---|---|---|---|---|---|
| Statistical Consequences of Fat Tails: Real World Preasymptotics, Epistemology, and Applications | Nassim Nicholas Taleb | 2020 | arXiv | [arXiv](https://arxiv.org/abs/2001.10488) | Tail modelling | yes |
| Regression Based Expected Shortfall Backtesting | Sebastian Bayer, Timo Dimitriadis | 2018 | arXiv | [arXiv](https://arxiv.org/abs/1801.04112) | ES backtesting for the risk module | yes |
| Backtesting Expected Shortfall: a simple recipe? | Felix Moldenhauer, Marcin Pitera | 2017 | arXiv | [arXiv](https://arxiv.org/abs/1709.01337) | ES backtesting for the risk module | yes |
| Multinomial VaR Backtests: A simple implicit approach to backtesting expected shortfall | Marie Kratz, Yen H. Lok, Alexander J McNeil | 2016 | arXiv | [arXiv](https://arxiv.org/abs/1611.04851) | ES backtesting for the risk module | yes |
| Time-consistency of risk measures with GARCH volatilities and their estimation | Claudia Klüppelberg, Jianing Zhang | 2015 | arXiv | [arXiv](https://arxiv.org/abs/1504.04774) | Tail-risk measurement and backtesting of risk models | yes |
| Expected Shortfall is jointly elicitable with Value at Risk - Implications for backtesting | Tobias Fissler, Johanna F. Ziegel, Tilmann Gneiting | 2015 | arXiv | [arXiv](https://arxiv.org/abs/1507.00244) | ES backtesting for the risk module | yes |
| Performance-based regularization in mean-CVaR portfolio optimization | Noureddine El Karoui, Andrew E. B. Lim, Gah-Yi Vahn | 2011 | arXiv | [arXiv](https://arxiv.org/abs/1111.2091) | Tail-risk measurement and backtesting of risk models | yes |
| Risk, VaR, CVaR and their associated Portfolio Optimizations when Asset Returns have a Multivariate Student T Distribution | William T. Shaw | 2011 | arXiv | [arXiv](https://arxiv.org/abs/1102.5665) | Tail-risk measurement and backtesting of risk models | yes |
| Optimization of Conditional Value-at-Risk | Rockafellar, Uryasev | 2000 | Author/university repository | [PDF](https://sites.math.washington.edu/~rtr/papers/rtr179-CVaR1.pdf) | Tail-risk measurement and backtesting of risk models | yes |
| Coherent Measures of Risk | Artzner, Delbaen, Eber et al. | 1999 | Author/university repository | [PDF](https://people.math.ethz.ch/~delbaen/ftp/preprints/CoherentMF.pdf) | Tail-risk measurement and backtesting of risk models | yes |

### Research validation (PBO, deflated Sharpe, walk-forward)

| Title | Authors | Year | Source | Link | Why it matters for us | Downloaded |
|---|---|---|---|---|---|---|
| In-Sample and Out-of-Sample Sharpe Ratios for Linear Predictive Models | Antoine Jacquier, Johannes Muhle-Karbe, Joseph Mulligan | 2025 | arXiv | [arXiv](https://arxiv.org/abs/2501.03938) | Multiple-testing, overfitting and out-of-sample protocol for our register | yes |
| Double Descent in Portfolio Optimization: Dance between Theoretical Sharpe Ratio and Estimation Accuracy | Yonghe Lu, Yanrong Yang, Terry Zhang | 2024 | arXiv | [arXiv](https://arxiv.org/abs/2411.18830) | Multiple-testing, overfitting and out-of-sample protocol for our register | yes |
| Publication Bias in Asset Pricing Research | Andrew Y. Chen, Tom Zimmermann | 2022 | arXiv | [arXiv](https://arxiv.org/abs/2209.13623) | Multiple-testing, overfitting and out-of-sample protocol for our register | yes |
| Avoiding Backtesting Overfitting by Covariance-Penalties: an empirical investigation of the ordinary and total least squares cases | Adriano Koshiyama, Nick Firoozye | 2019 | arXiv | [arXiv](https://arxiv.org/abs/1905.05023) | Overfitting quantification for backtests | yes |
| Evaluating time series forecasting models: An empirical study on performance estimation methods | Vitor Cerqueira, Luis Torgo, Igor Mozetic | 2019 | arXiv | [arXiv](https://arxiv.org/abs/1905.11744) | Multiple-testing, overfitting and out-of-sample protocol for our register | yes |
| Replicating Anomalies | Kewei Hou, Xue Chen, Lu Zhang | 2018 | NBER | [PDF](https://www.nber.org/papers/w23394.pdf) | Shows how many published signals fail: sets priors | yes |
| The Probability of Backtest Overfitting | Bailey, Borwein, Lopez de Prado et al. | 2015 | davidhbailey.com | [PDF](https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf) | PBO: the test our research protocol needs | yes |
| Statistical Overfitting and Backtest Performance | Bailey, Ger, Lopez de Prado et al. | 2015 | davidhbailey.com | [PDF](https://www.davidhbailey.com/dhbpapers/overfitting.pdf) | Overfitting quantification for backtests | yes |
| Determining Optimal Trading Rules without Backtesting | Peter P. Carr, Marcos Lopez de Prado | 2014 | arXiv | [arXiv](https://arxiv.org/abs/1408.1159) | Multiple-testing, overfitting and out-of-sample protocol for our register | yes |
| The Deflated Sharpe Ratio | Bailey, Lopez de Prado | 2014 | davidhbailey.com | [PDF](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf) | Corrects Sharpe for selection bias: use on every banked verdict | yes |
| False Discoveries in Mutual Fund Performance: Measuring Luck in Estimated Alphas | Laurent Barras, Olivier Scaillet B, Russ R. Wermers | 2010 | Author/university repository | [PDF](https://dipot.ulb.ac.be/dspace/bitstream/2013/53909/1/RePEc_sol_wpaper_05-014.pdf) | Multiple-testing, overfitting and out-of-sample protocol for our register | yes |
| Data‐Snooping, Technical Trading Rule Performance, and the Bootstrap | Ryan Sullivan, Allan Timmermann, Halbert White | 1999 | Author/university repository | [PDF](https://eprints.lse.ac.uk/119144/1/dp303.pdf) | Multiple-testing, overfitting and out-of-sample protocol for our register | yes |
| A Backtesting Protocol in the Era of Machine Learning | Arnott, Harvey, Markowitz | 2018 | Research Affiliates | [page](https://www.researchaffiliates.com/publications/journal-papers/1034-a-backtesting-protocol-in-the-era-of-machine-learning) | Seven-point protocol: matches our register discipline; PDF link not direct | no |
| Alice's Adventures in Factorland | Arnott, Harvey, Kalesnik, Linnainmaa | 2019 | Research Affiliates | [page](https://www.researchaffiliates.com/publications/journal-papers/) | Factor-research pitfalls; PDF link not direct | no |

### Rates / FOMC

| Title | Authors | Year | Source | Link | Why it matters for us | Downloaded |
|---|---|---|---|---|---|---|
| Non-Spanning Identification of Scheduled Event Risk in Option Pricing | Tenghan Zhong | 2026 | arXiv | [arXiv](https://arxiv.org/abs/2606.12872) | Rates / FOMC event effects and term-structure models | yes |
| When the Fed Speaks: Dynamics and Forecasts of the Volatility Surface | Lukasz Adamski, Robert Slepaczuk | 2026 | arXiv | [arXiv](https://arxiv.org/abs/2608.10693) | Rates / FOMC event effects and term-structure models | yes |
| Trillion Dollar Words: A New Financial Dataset, Task & Market Analysis | Agam Shah, Suvan Paturi, Sudheer Chava | 2023 | arXiv | [arXiv](https://arxiv.org/abs/2305.07972) | Rates / FOMC event effects and term-structure models | yes |
| A Reassessment of Monetary Policy Surprises and High-Frequency Identification | Michael Bauer, Eric C Swanson | 2022 | Author/university repository | [PDF](https://doi.org/10.3386/w29939) | How to build clean policy-surprise variables | yes |
| Risk & returns around FOMC press conferences: a novel perspective from computer vision | Alexis Marchal | 2020 | arXiv | [arXiv](https://arxiv.org/abs/2012.06573) | Rates / FOMC event effects and term-structure models | yes |
| The Economics of the Fed Put | Anna Cieślak, Annette Vissing‐Jørgensen | 2020 | Author/university repository | [PDF](https://doi.org/10.3386/w26894) | Fed reaction function and equity/vol response | yes |
| Co-jumping of Treasury Yield Curve Rates | Jozef Barunik, Pavel Fiser | 2019 | arXiv | [arXiv](https://arxiv.org/abs/1905.01541) | Term-structure input for rates/FX | yes |
| Deconstructing Monetary Policy Surprises: The Role of Information Shocks | Jarocinski, Karadi | 2018 | ECB | [PDF](https://www.ecb.europa.eu/pub/pdf/scpwps/ecb.wp2133.en.pdf) | How to build clean policy-surprise variables | yes |
| Information in the Yield Curve about Future Recessions | Michael D. Bauer, Thomas M. Mertens | 2018 | Federal Reserve | [PDF](https://www.frbsf.org/economic-research/files/el2018-20.pdf) | Term-structure input for rates/FX | yes |
| Measuring the Effects of Federal Reserve Forward Guidance and Asset Purchases on Financial Markets | Eric T. Swanson | 2017 | Author/university repository | [PDF](https://doi.org/10.3386/w23311) | Fed-surprise identification for event studies | yes |
| Machine Learning at Central Banks | Chiranjit Chakraborty, Andreas C. Joseph | 2017 | Bank of England | [PDF](https://www.bankofengland.co.uk/-/media/boe/files/working-paper/2017/machine-learning-at-central-banks.pdf?la=en&hash=EF5C4AC6E7D7BDC1D68A4BD865EEF3D7EE5D7806) | ML forecasting benchmark | yes |
| Measuring the Macroeconomic Impact of Monetary Policy at the Zero Lower Bound | Jing Cynthia Wu, Fan Dora Xia | 2016 | NBER | [PDF](https://www.nber.org/papers/w20117.pdf) | Rates / FOMC event effects and term-structure models | yes |
| Stock returns over the FOMC cycle | Annette Vissing‐Jørgensen, Adair Morse, Anna Cieślak | 2015 | Author/university repository | [PDF](https://red-files-public.s3.amazonaws.com/meetpapers/2015/paper_1197.pdf) | Rates / FOMC event effects and term-structure models | yes |
| The Pre-FOMC Announcement Drift | Lucca, Moench | 2013 | NY Fed | [PDF](https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr512.pdf) | FOMC-cycle drift: testable calendar effect | yes |
| Pricing the Term Structure with Linear Regressions | Adrian, Crump, Moench | 2012 | NY Fed | [PDF](https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr340.pdf) | Term-structure input for rates/FX | yes |
| The U.S. Treasury Yield Curve: 1961 to the Present | Gurkaynak, Sack, Wright | 2006 | Federal Reserve | [PDF](https://www.federalreserve.gov/pubs/feds/2006/200628/200628pap.pdf) | Term-structure input for rates/FX | yes |
| An Arbitrage-Free Three-Factor Term Structure Model and the Recent Behavior of Long-Term Yields | Kim, Wright | 2005 | Federal Reserve | [PDF](https://www.federalreserve.gov/pubs/feds/2005/200533/200533pap.pdf) | Term-structure input for rates/FX | yes |
| Bond Risk Premia | John H. Cochrane, Monika Piazzesi B | 2005 | NBER | [PDF](https://papers.nber.org/papers/w9178.pdf) | Rates / FOMC event effects and term-structure models | yes |
| The Sensitivity of Long-Term Interest Rates to Economic News: Evidence and Implications for Macroeconomic Models | Refet S. Gürkaynak, Brian Sack, Eric T. Swanson | 2005 | Author/university repository | [PDF](https://repository.bilkent.edu.tr/bitstreams/e7465713-3bfb-4627-921d-825a738680a5/download) | Rates / FOMC event effects and term-structure models | yes |
| Identifying VARS based on high frequency futures data | Jon Faust, Eric T. Swanson, Jonathan H. Wright | 2004 | Federal Reserve | [PDF](https://www.federalreserve.gov/pubs/ifdp/2002/720/ifdp720.pdf) | Rates / FOMC event effects and term-structure models | yes |

### COT / positioning

| Title | Authors | Year | Source | Link | Why it matters for us | Downloaded |
|---|---|---|---|---|---|---|
| Exchange Rate Changes and Net Positions of Speculators in the Futures Market | Klitgaard, Weir | 2004 | NY Fed | [page](https://www.newyorkfed.org/research/epr/04v10n1/0405klit.html) | CFTC FX-futures positioning vs returns: core COT evidence | no |

### COT / positioning

| Title | Authors | Year | Source | Link | Why it matters for us | Downloaded |
|---|---|---|---|---|---|---|
| A Tale of Two Premiums: the Role of Hedgers and Speculators in Commodity Futures Markets | Kang, Rouwenhorst, Tang | 2020 | Journal of Finance (author copy on SSRN, login) | [page](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2912305) | Hedger/speculator premia from positioning; SSRN only, so skip unless owner holds it | no |

## Blog and community pages (links only, nothing downloaded)

| Page | URL | Why |
|---|---|---|
| Quantocracy | https://quantocracy.com/ | Daily aggregator of ~50 quant blogs; use as the feed to watch |
| QuantEcon: Kalman filter | https://python.quantecon.org/kalman.html | State-space filtering with runnable code; basis for dynamic hedge ratios and trend filters |
| QuantEcon: Finite Markov chains | https://python.quantecon.org/finite_markov.html | Markov chain machinery behind regime models |
| QuantEcon: Time-varying vol / drifts | https://python.quantecon.org/phillips_drifts_volatilities.html | Bayesian regime/stochastic-volatility style estimation worked example |
| QuantEcon: Exchange rate learning | https://python.quantecon.org/exchange_rate_learning.html | FX under expectations learning; background for UIP puzzle |
| QuantEcon: Affine risk prices | https://python.quantecon.org/affine_risk_prices.html | Term-structure risk-price model with code |
| QuantEcon: Markov asset pricing | https://python.quantecon.org/markov_asset.html | Asset pricing on Markov states |
| QuantEcon: AR(1) Bayes | https://python.quantecon.org/ar1_bayes.html | Bayesian estimation of AR(1) / mean reversion (OU analogue) |
| QuantEcon: MLE | https://python.quantecon.org/mle.html | Maximum-likelihood estimation primer |
| QuantEcon: Importance sampling | https://python.quantecon.org/imp_sample.html | Monte Carlo variance reduction |
| QuantEcon: Kesten processes | https://python.quantecon.org/kesten_processes.html | Why heavy tails arise from multiplicative processes |
| Hudson & Thames: intro to cointegration | https://hudsonthames.org/an-introduction-to-cointegration/ | Cointegration / VECM for spread trading, practical |
| Hudson & Thames: pairs trading guide | https://hudsonthames.org/definitive-guide-to-pairs-trading/ | Survey of pairs-trading approaches |
| Hudson & Thames: meta-labeling toy example | https://hudsonthames.org/meta-labeling-a-toy-example/ | Meta-labelling as a gating layer |
| Hudson & Thames blog | https://hudsonthames.org/blog/ | Many posts on Lopez de Prado methods |
| Investment Idiocy (Rob Carver) | https://qoppac.blogspot.com/ | Systematic futures trend/vol-targeting practice with code |
| Robot Wealth blog | https://robotwealth.com/blog/ | Practical systematic trading research, FX and equities |
| Philosophical Economics | https://www.philosophicaleconomics.com/ | Long-form macro / valuation / regime thinking |
| Portfolio Optimizer blog | https://portfoliooptimizer.io/blog/ | Rigorous posts on vol forecasting, covariance, risk parity |
| Financial Hacker | https://www.financial-hacker.com/ | Overfitting, walk-forward and system-testing posts |
| QuantStrat TradeR | https://quantstrattrader.wordpress.com/ | R-based systematic strategy replication |
| Flirting with Models (Newfound) | https://blog.thinknewfound.com/ | Trend, risk parity, portfolio-construction research |
| AQR Alternative Thinking | https://www.aqr.com/Insights/Research/Alternative-Thinking | Quarterly macro/factor white papers (free) |
| Man Institute research | https://www.man.com/maninstitute/research | Free trend / vol-target / macro research (page JS-heavy) |

Not reachable by us: Quant StackExchange tag pages and Wilmott returned 403 to scripted requests, and Alpha Architect also 403; open them in a browser (tags: volatility, black-litterman, pairs-trading, hidden-markov-model, backtesting). Other Quantocracy-listed sites worth a look: Alpha Architect, Quantifiable Edges, Alvarez Quant Trading, Cracking Markets, Engineered Portfolio.

## What the free tier does not give (skip these)

- **SSRN-only papers** (e.g. Lopez de Prado HRP and ML-fund papers, Kang-Rouwenhorst-Tang, Harvey-Liu backtesting): Delivery links need a login, so they stay on the SSRN list.
- **Journal-paywalled classics**: Hamilton 1989 (Markov switching), Engle-Granger, Johansen, Heston 1993, Kyle 1985, Lustig-Roussanov-Verdelhan and Menkhoff et al. carry papers, Welch-Goyal, Rapach et al., Bollen-Whaley, Corsi (HAR-RV, JFEC), Mincer-style forecast tests. Only working-paper versions are free, and where none turned up in our search we list nothing.
- **Failed or unreachable copies**: Hansen-Lunde GARCH(1,1) and Engle DCC (publisher 403 or timeouts), McNeil-Frey and Embrechts EVT (ETH links 404), Rogoff PPP puzzle (403), Honey I Shrunk (404), Cont stylized facts and Avellaneda-Stoikov (no response), Timmermann forecast combination (no response), Kupiec FEDS 95-24 (404). All are findable in a browser; none was fetched around a paywall.
- **Institution marketing**: AQR, Man, Two Sigma, Robeco, Research Affiliates and Dimensional publication pages are JavaScript-driven, and most useful pieces sit behind forms or are not direct PDFs, so only the few that returned a real PDF are in the table. IMF working-paper pages returned 403 to scripted requests, so no IMF items are included. CEPR discussion papers and Bank of England pages (except one staff working paper) were also not retrievable in this pass.
- **Data/COT**: no free working paper with a direct PDF was found for CFTC positioning beyond the NY Fed piece above; the CFTC's own COT data is free but is data, not research.
- Some 2025-2026 arXiv items are recent and uncited; they are included for method value, treat as unrefereed.

## Part 2: found by browsing (JS-driven sites)

Built 2026-11-08 by loading each site in a normal headless Chromium (Playwright defaults, no logins, no stealth, one page at a time, at least 2 s between navigations and 10 s on Two Sigma per its robots.txt). Where a site returned 403, a captcha, a region/role gate or an empty page, browsing stopped and the site is marked **blocked: owner browses by hand**. A row is listed only if its page opened; "PDF direct" means the link is a public PDF that needs no form or login. Downloaded PDFs (header `%PDF`, over 30 KB) sit in the session scratchpad `.../scratchpad/free2/` with `manifest.json`, **never in git**. Authors marked "see page" were not on the listing and were not guessed.

**Totals:** 40 papers listed, 26 PDFs downloaded. Per site: AQR 14; Man Institute 0; Two Sigma 4; Robeco 0; Research Affiliates (now Syzygy Asset Management) 8; Dimensional 6; IMF working papers 0; CEPR discussion papers 0; BIS working papers 8; Bank of England staff working papers 0.

### AQR

**Status:** reachable (HTTP 200 via headless Chromium, no gate; category pages show only the newest 10-11 items each, so this is a sample, not the full catalogue).

| Title | Authors | Year | Link | Why it matters for us | PDF direct | Downloaded |
|---|---|---|---|---|---|---|
| Can Machines Time Markets? The Virtue of Complexity in Return Prediction | AQR Portfolio Solutions Group | 2024 | [PDF](https://www.aqr.com/-/media/AQR/Documents/Alternative-Thinking/AQR-Alternative-Thinking--2Q24-Can-Machines-Time-Markets.pdf?sc_lang=en) · [page](https://www.aqr.com/Insights/Research/Alternative-Thinking/Can-Machines-Time-Markets-The-Virtue-of-Complexity-in-Return-Prediction) | ML market timing and the overfitting question: a counterweight when we judge complex signal stacks (Research validation) | yes | yes |
| Hold the Dip | AQR Portfolio Solutions Group | 2025 | [PDF](https://www.aqr.com/-/media/AQR/Documents/Alternative-Thinking/AQR-Alternative-Thinking---Hold-the-Dip.pdf?sc_lang=en) · [page](https://www.aqr.com/Insights/Research/Alternative-Thinking/Hold-the-Dip) | Buy-the-dip vs buy-and-hold vs trend: tests dip entries against momentum (Trend / momentum) | yes | yes |
| Bond Market Focus: Yield Curves and Mean Reverting Rate Expectations (Understanding Return Expectations, Part 9) | AQR Portfolio Solutions Group | 2025 | [PDF](https://www.aqr.com/-/media/AQR/Documents/White-Papers/Bond-Market-Focus-Yield-Curves-and-Mean-Reverting-Rate-Expectations.pdf?sc_lang=en) · [page](https://www.aqr.com/Insights/Research/White-Papers/Bond-Market-Focus-Yield-Curves-and-Mean-Reverting-Rate-Expectations) | Rate expectations vs term premia in curve shape: input for the FOMC/rates view (Rates / FOMC) | yes | yes |
| Bond Market Focus: Understanding Treasury Yields with Survey Data (Part 8) | AQR Portfolio Solutions Group | 2025 | [PDF](https://www.aqr.com/-/media/AQR/Documents/White-Papers/Bond-Market-Focus-Understanding-Treasury-Yields-with-Survey-Data.pdf?sc_lang=en) · [page](https://www.aqr.com/Insights/Research/White-Papers/Bond-Market-Focus-Understanding-Treasury-Yields-with-Survey-Data) | Splits the Treasury yield into inflation expectations, real rate and term premium using surveys (Rates / FOMC) | yes | yes |
| Inflation Redux? Real Solutions for Real Returns | AQR Portfolio Solutions Group | 2026 | [PDF](https://www.aqr.com/-/media/AQR/Documents/Alternative-Thinking/AQR-Alternative-Thinking-Q3-2026---Inflation-Redux.pdf?sc_lang=en) · [page](https://www.aqr.com/Insights/Research/Alternative-Thinking/Inflation-Redux) | Commodities and trend following as inflation-shock hedges: gold and macro regime context (Gold / macro regimes) | yes | yes |
| Diversifiers Forever | Thomas Maloney, Josh Stone | 2025 | [PDF](https://www.aqr.com/-/media/AQR/Documents/Insights/White-Papers/Diversifiers-Forever.pdf?sc_lang=en) · [page](https://www.aqr.com/Insights/Research/White-Papers/Diversifiers-Forever) | Why diversifying strategies (trend, macro) earn their keep: portfolio-level framing (Risk / portfolio) | yes | yes |
| Diversifying Alternatives and the Rearview Mirror (Understanding Return Expectations, Part 10) | AQR Portfolio Solutions Group | 2025 | [PDF](https://www.aqr.com/-/media/AQR/Documents/White-Papers/Diversifying-Alternatives-and-the-Rearview-Mirror.pdf?sc_lang=en) · [page](https://www.aqr.com/Insights/Research/White-Papers/Diversifying-Alternatives-and-the-Rearview-Mirror) | Behavioural reason diversifiers get dropped after long equity rallies; sizing discipline (Risk / portfolio) | yes | yes |
| The Hidden Value of Streaky Returns in Stock Portfolios | AQR Portfolio Solutions Group | 2025 | [PDF](https://www.aqr.com/-/media/AQR/Documents/Insights/Alternative-Thinking/Alternative-Thinking-The-Hidden-Value-of-Streaky-Returns-in-Stock-Portfolios.pdf?sc_lang=en) · [page](https://www.aqr.com/Insights/Research/Alternative-Thinking/The-Hidden-Value-of-Streaky-Returns-in-Stock-Portfolios) | Streaky vs smooth factor returns: how to judge a signal that goes cold for years (Research validation) | yes | yes |
| Broad Strategic Asset Allocation | AQR Portfolio Solutions Group | 2024 | [PDF](https://www.aqr.com/-/media/AQR/Documents/Alternative-Thinking/AQR-Alternative-Thinking---Broad-Strategic-Asset-Allocation.pdf?sc_lang=en) · [page](https://www.aqr.com/Insights/Research/Alternative-Thinking/Broad-Strategic-Asset-Allocation) | Sizing liquid alternatives (carry/trend/value styles) next to traditional assets (Risk / portfolio) | yes | yes |
| 2026 Capital Market Assumptions for Major Asset Classes | AQR Portfolio Solutions Group | 2026 | [PDF](https://www.aqr.com/-/media/AQR/Documents/Alternative-Thinking/AQR-Alternative-Thinking---2026-Capital-Market-Assumptions.pdf?sc_lang=en) · [page](https://www.aqr.com/Insights/Research/Alternative-Thinking/2026-Capital-Market-Assumptions-for-Major-Asset-Classes) | Includes a section on currency risk and hedging in expected returns: FX and carry context (FX / carry) | yes | yes |
| Exploring Capital Efficiency | AQR Portfolio Solutions Group | 2025 | [PDF](https://www.aqr.com/-/media/AQR/Documents/Alternative-Thinking/AQR-Alternative-Thinking---Exploring-Capital-Efficiency.pdf?sc_lang=en) · [page](https://www.aqr.com/Insights/Research/Alternative-Thinking/Exploring-Capital-Efficiency) | Leverage, funding and diversification maths behind overlay-style portfolios (Risk / portfolio) | yes | yes |
| Credit Implied Volatility | see page | n/a | [page](https://www.aqr.com/Insights/Research/Journal-Article/Credit-Implied-Volatility) | Implied-vol measure outside equities; page lists the paper but showed no open PDF (Volatility) | no | no |
| How Global is Predictability? | see page | n/a | [page](https://www.aqr.com/Insights/Research/Working-Paper/How-Global-is-Predictability) | Out-of-sample return predictability across countries; validation angle (no open PDF on the page) (Research validation) | no | no |
| Understanding The Virtue of Complexity | see page | n/a | [page](https://www.aqr.com/Insights/Research/Working-Paper/Understanding-The-Virtue-of-Complexity) | Companion to the market-timing piece above; overparameterised forecasting (no open PDF on the page) (Research validation) | no | no |

### Man Institute

**Status:** blocked: owner browses by hand. The page loads (200) but shows a region and investor-role confirmation gate ("Confirm your region / Select your role") before any content; filling it would be form-filling, so nothing was recorded.

### Two Sigma

**Status:** reachable (200). robots.txt asks for a 10 s crawl delay, which was honoured. The /insights page is mostly culture and engineering posts; only 2 PDF papers are relevant, plus 2 page-only factor pieces.

| Title | Authors | Year | Link | Why it matters for us | PDF direct | Downloaded |
|---|---|---|---|---|---|---|
| A Machine Learning Approach to Regime Modeling | Alex Botte, Doris Bao | 2021 | [PDF](https://www.twosigma.com/wp-content/uploads/2021/10/Machine-Learning-Approach-to-Regime-Modeling_.pdf) · [page](https://www.twosigma.com/articles/a-machine-learning-approach-to-regime-modeling/) | Gaussian-mixture regimes on a factor lens; a cheap alternative to HMM for our regime tag (Regimes) | yes | yes |
| Forecasting Factor Returns | Geoff Duncombe, Mike Nigro, Bradley Kay | 2019 | [PDF](https://www.twosigma.com/wp-content/uploads/Forecasting-Factor-Returns.FINAL_-2.pdf) · [page](https://www.twosigma.com/articles/thematic-research-forecasting-factor-returns/) | Long-horizon factor-premium forecasting method; valuation + momentum inputs (Risk / portfolio) | yes | yes |
| Thematic Research: Introducing the Two Sigma Factor Lens | Two Sigma Thematic Research | n/a | [page](https://www.twosigma.com/articles/thematic-research-introducing-the-two-sigma-factor-lens/) | The factor set the regime paper builds on (page linked from the two PDFs; not opened or downloaded) (Risk / portfolio) | no | no |
| Thematic Research: Risk Factors Are Not Generic | Two Sigma Thematic Research | n/a | [page](https://www.twosigma.com/articles/thematic-research-risk-factors-are-not-generic/) | Why factor definitions matter for risk attribution (page only, not opened) (Risk / portfolio) | no | no |

### Robeco

**Status:** blocked: owner browses by hand (HTTP 403 "Service unavailable" on /en-int/insights).

### Research Affiliates (now Syzygy Asset Management)

**Status:** reachable. researchaffiliates.com/publications now shows a "choose your destination" page (Research Affiliates advisory business is now Syzygy Asset Management; the index business went to RAFI.com/VettaFi). The publications moved to syzygyassetmanagement.com/insights, which is open (200, no gate).

| Title | Authors | Year | Link | Why it matters for us | PDF direct | Downloaded |
|---|---|---|---|---|---|---|
| Should Trend Follow Carry: Lessons from Bonds, Gold, and 2022 | Jim Masturzo et al. | 2026 | [PDF](https://media.syzygyassetmanagement.com/1107_should_trend_follow_carry_lessons_from_bonds_gold_and_2022_1c4eaed38c.pdf) · [page](https://www.syzygyassetmanagement.com/insights/publications/articles/1107-should-trend-follow-carry-lessons-from-bonds-gold-and-2022) | Carry-filtered trend, with gold and 2022: directly our carry x trend x gold question (Trend / carry / gold) | yes | yes |
| Stop the Losses! The Risks of Systematic Strategies | Research Affiliates authors (see PDF) | 2025 | [PDF](https://media.syzygyassetmanagement.com/1099_stop_the_losses_e389db6127.pdf) · [page](https://www.syzygyassetmanagement.com/insights/publications/articles/1099-stop-the-losses) | Stop-losses and risk-model failure in alternative risk premia: sizing and drawdown rules (Risk / portfolio) | yes | yes |
| Walking the Tightrope: Trend Following's Tricky Tradeoffs | Research Affiliates authors (see PDF) | 2025 | [PDF](https://media.syzygyassetmanagement.com/1077_trend_followings_tricky_tradeoffs_sharpe_ratio_vs_skew_366bc84649.pdf) · [page](https://www.syzygyassetmanagement.com/insights/publications/articles/1077-trend-followings-tricky-tradeoffs-sharpe-ratio-vs-skew) | Sharpe vs skew in trend rules; lookback and speed choices (Trend / momentum) | yes | yes |
| Gold $5,000? | Research Affiliates authors (see PDF) | 2025 | [PDF](https://media.syzygyassetmanagement.com/1079_gold_5000_f9c082a8d9.pdf) · [page](https://www.syzygyassetmanagement.com/insights/publications/articles/1079-gold-5000) | Gold drivers (financialisation, central-bank buying): gold desk context (Gold) | yes | yes |
| The Developed Market Inflation Vigilante | Research Affiliates authors (see PDF) | 2026 | [PDF](https://media.syzygyassetmanagement.com/1125_capital_market_insights_the_developed_market_inflation_vigilante_037c5675a7.pdf) · [page](https://www.syzygyassetmanagement.com/insights/publications/articles/1125-capital-market-insights-the-developed-market-inflation-vigilante) | Why DM sovereign yields are rising (inflation, not just term premium): rates / FX read-across (Rates / FOMC) | yes | yes |
| A Tail of Five Skews (journal paper; only an Internet Appendix PDF is open) | see page | 2026 | [page](https://www.syzygyassetmanagement.com/insights/journal-papers/1094-a-tail-of-five-skews) · [appendix PDF](https://media.syzygyassetmanagement.com/A_Tail_of_Five_Skews_Internet_Appendix_78226daadd.pdf) | Skewness risk premium across futures, forwards and options: vol/skew trading context; appendix only, main paper not open (Volatility / options) | no | no |
| Adaptive Macro Regimes for Dynamic Equity Allocation (journal paper) | see page | 2026 | [page](https://www.syzygyassetmanagement.com/insights/journal-papers/1108-adaptive-macro-regimes-for-dynamic-equity-allocation) | Macro-regime signal for allocation: regime / HMM conditioning comparison (Regimes) | no | no |
| Inter or Intra? An Analysis of Pairs Trading in Futures Contracts (journal paper) | see page | 2025 | [page](https://www.syzygyassetmanagement.com/insights/journal-papers/1071-inter-or-intra-an-analysis-of-pairs-trading) | Pairs trading evidence in futures: stat-arb reference (Stat arb) | no | no |

### Dimensional

**Status:** reachable (200) but the insights are retail/advisor marketing pages with no PDFs; only 6 loosely relevant items listed.

| Title | Authors | Year | Link | Why it matters for us | PDF direct | Downloaded |
|---|---|---|---|---|---|---|
| These ETFs Promise to Magnify Returns, but Look Out Below | Dimensional (see page) | n/a | [page](https://www.dimensional.com/us-en/insights/these-etfs-promise-to-magnify-returns-but-look-out-below) | Leveraged-ETF decay: a readable vol-drag explainer (marketing-style page, no PDF) (Volatility) | no | no |
| Portfolio Rebalancing: All at Once or Little by Little? | Dimensional (see page) | n/a | [page](https://www.dimensional.com/us-en/insights/portfolio-rebalancing-all-at-once-or-little-by-little) | Spreading rebalancing trades to cut cost: execution / implementation reference (Microstructure) | no | no |
| Trading US Corporate Bonds: It Pays to Be Flexible | Dimensional (see page) | n/a | [page](https://www.dimensional.com/us-en/insights/trading-us-corporate-bonds-it-pays-to-be-flexible) | Trade-cost evidence from flexible execution (tagged RESEARCH on the site) (Microstructure) | no | no |
| It's Not Just the US with High Interest Rates | Dimensional (see page) | n/a | [page](https://www.dimensional.com/us-en/insights/its-not-just-the-us-with-high-interest-rates) | Cross-country rate levels: carry background (Rates / FX) | no | no |
| The Market's Fed Watch in Action | Dimensional (see page) | n/a | [page](https://www.dimensional.com/us-en/insights/the-markets-fed-watch-in-action) | How prices absorb Fed expectations: FOMC-event reading (Rates / FOMC) | no | no |
| Are Higher Rates Cause to Add More Fixed Income? | Dimensional (see page) | n/a | [page](https://www.dimensional.com/us-en/insights/are-higher-rates-cause-to-add-more-fixed-income) | Rate-level vs expected-return argument (opinion piece) (Rates / FOMC) | no | no |

### IMF working papers

**Status:** unreachable, nothing recorded: www.imf.org/en/Publications/WP returned 404 "Blob not found" to the headless browser (and robots.txt returned the same). Not a captcha, but no content either; owner browses by hand.

### CEPR discussion papers

**Status:** blocked: owner browses by hand (HTTP 403 Cloudflare "Attention Required!" on /publications/discussion-papers).

### BIS working papers

**Status:** reachable (200). The old index URL now 404s; BIS moved to bis.org/publications/working-paper and per-paper URLs ending in .pdf are direct public PDFs.

| Title | Authors | Year | Link | Why it matters for us | PDF direct | Downloaded |
|---|---|---|---|---|---|---|
| Gaining (and losing) currency: a global database of currencies, 1850-2026 | Iñaki Aldasoro, Jon Frost, Rudraksh Kansal, Catherine R Schenk | 2026 | [PDF](https://www.bis.org/publications/working-paper-1392-gaining-and-losing-currency-global-database-currencies-1850-2026.pdf) · [page](https://www.bis.org/publications/working-paper-1392-gaining-and-losing-currency-global-database-currencies-1850-2026) | Long-run currency data set: regime and base-rate reference for FX (FX / carry) | yes | yes |
| Offshore forwards and exchange rate transmission in emerging markets | Gerardo Ferrara, Andreas Schrimpf, Ganesh Viswanath-Natraj, Zijie Wang | 2026 | [PDF](https://www.bis.org/publications/working-paper-1383-offshore-forwards-and-exchange-rate-transmission-emerging-markets.pdf) · [page](https://www.bis.org/publications/working-paper-1383-offshore-forwards-and-exchange-rate-transmission-emerging-markets) | NDF/offshore forward pricing and spot transmission: EM FX microstructure and carry (FX / carry) | yes | yes |
| Chasing El Dorado: gold under shifting geopolitical and financial conditions | Rafael Guerra, Gabriel Zelpo | 2026 | [PDF](https://www.bis.org/publications/working-paper-1380-chasing-el-dorado-gold-under-shifting-geopolitical-and-financial-condition.pdf) · [page](https://www.bis.org/publications/working-paper-1380-chasing-el-dorado-gold-under-shifting-geopolitical-and-financial-condition) | Gold drivers under changing geopolitical / real-rate conditions: gold desk (Gold) | yes | yes |
| Inflation after the Iran war | Ricardo Reis | 2026 | [PDF](https://www.bis.org/publications/working-paper-1384-inflation-after-iran-war.pdf) · [page](https://www.bis.org/publications/working-paper-1384-inflation-after-iran-war) | Energy-shock inflation pass-through: macro regime and policy-reaction framing (Rates / FOMC) | yes | yes |
| News shocks and inflation: theory and evidence from large oil discoveries | Bohou Cai, Liugang Sheng, Hongyan Zhao | 2026 | [PDF](https://www.bis.org/publications/working-paper-1389-news-shocks-and-inflation-theory-and-evidence-large-oil-discoveries.pdf) · [page](https://www.bis.org/publications/working-paper-1389-news-shocks-and-inflation-theory-and-evidence-from-large-oil-discoveries) | Anticipation effects of commodity news on inflation and the exchange rate (commodity-FX link) (FX / commodities) | yes | yes |
| Maritime chokepoints and the global economy: evidence from the Strait of Hormuz | Enisse Kharroubi | 2026 | [PDF](https://www.bis.org/publications/working-paper-1378-maritime-chokepoints-and-global-economy-evidence-strait-hormuz.pdf) · [page](https://www.bis.org/publications/working-paper-1378-maritime-chokepoints-and-the-global-economy-evidence-strait-hormuz) | Chokepoint shocks to oil, trade and risk: event-study template for geopolitical risk-off (Regimes / risk) | yes | yes |
| Hard to shift, easy to reshape: central bank reserve demand and frictions | Mathias Drehmann, Xuewen Fu | 2026 | [PDF](https://www.bis.org/publications/working-paper-1372-hard-shift-easy-reshape-central-bank-reserve-demand-and-frictions.pdf) · [page](https://www.bis.org/publications/working-paper-1372-hard-shift-easy-reshape-central-bank-reserve-demand-and-frictions) | Reserve demand and money-market frictions: funding-rate / balance-sheet background (Rates / FOMC) | yes | yes |
| Geoeconomic pressure | Chris Clayton, Antonio Coppola, Vanessa Hu, Matteo Maggiori, Jesse Schreger, Serdil Tinda | 2026 | [PDF](https://www.bis.org/publications/working-paper-1386-geoeconomic-pressure.pdf) · [page](https://www.bis.org/publications/working-paper-1386-geoeconomic-pressure) | Maggiori et al. on sanctions / currency-weaponisation and safe-haven demand: USD and gold angle (FX / carry) | yes | yes |

### Bank of England staff working papers

**Status:** blocked: owner browses by hand (HTTP 403 "Access Denied" on /working-paper/staff-working-papers).

