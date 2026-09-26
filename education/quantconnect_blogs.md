# QuantConnect Research Publications: Notes

> **Epistemic status: SECONDARY-SOURCE DIGEST.** These are notes on the posts
> at `quantconnect.com/research/` (URL pattern `/research/<id>/<slug>/`).
> **quantconnect.com is blocked by this environment's network policy**, so
> the pages themselves were not read. Every detail below was pieced together from
> search-engine titles and snippets (~155 targeted queries). A few posts have extra
> detail from a third-party course repo (`jsboige/CoursIA` GitHub issues titled
> "[QC-research] … (#id)"), marked *(via CoursIA)*. Anything I inferred is marked
> *(inferred)*. Re-verify any number against the live page before relying on it.
>
> Companion file: `quantconnect_strategies.md`. It holds the Strategy Library
> tutorials, built from QuantConnect's public GitHub repo, with rebuildable code.
> Many old library tutorials were republished as research posts with IDs
> 152xx–153xx. Where the numbers differ between the two, see §12.

---

## 0. How to read QuantConnect research posts

- **House format (2024–2026 posts, IDs 17xxx–21xxx).** Each post gives a stated
  backtest window, the strategy's Sharpe vs SPY buy-and-hold, and a **5×5
  parameter sweep reported as "X/25 combinations beat the benchmark"**. The
  sweep hit-rate is the most useful credibility signal. High hit-rates
  (23–25/25: Capital-Gain Momentum, BTC Regime, Aggregate Sales Growth, Dual
  VIX, MAX+VIX) are more believable. Low ones (TDA 11%, Factor Optimisation
  23% vs cap-weight, Filing Stability 36%) are overfit. Almost all posts are
  **in-sample only**.
- **Publication.** Posts go live "under review" and need **three community
  upvotes**. Many of the old library ports still carry that label.
- **Authors.** The Carver futures series (15875, 15959, 15989, 16001) and the
  newer macro/momentum posts are mostly by Derek Melchin (QC). "Idea Streams"
  and "Micro Study" are short-format series.
- **Lesson QC's own record keeps repeating.** Short windows (often
  Jul-2020→Jul-2023) and paper replications that underperform the paper.

---

## 1. FX and carry

### Forex Carry Trade (#15264)
https://www.quantconnect.com/research/15264/forex-carry-trade/
- Long the highest central-bank-rate currency, short the lowest (1 vs 1), monthly.
- Universe: 9 currencies vs USD with Quandl rate data: **EUR, ZAR, AUD, JPY, TRY, INR, CNY, MXN, CAD**.
- **The rate dataset (Nasdaq Data Link) stopped updating in 2016**, so the post can't run on current data as written.
- A related QC/Quantpedia backtest uses G10 currency **futures** from 2000 (AUD, GBP, CAD, EUR, JPY, MXN, NZD, CHF). No figures were visible for either version.
- **For MacroFXModel:** the canonical signal, but a 1×1 extreme sort on an EM-heavy universe is mostly idiosyncratic noise. Build it instead from FRED policy rates, or better, forward points / OIS differentials, as a ranked, vol-scaled basket. Code in `quantconnect_strategies.md` §3.1.

### Micro Study: Yen Carry Trade (#17843)
https://www.quantconnect.com/research/17843/micro-study-yen-carry-trade/
- A "micro-study" (<20 lines): borrow JPY and invest in US T-bills, via USDJPY + BIL. **$80M of exposure on $1M collateral (~80×).**
- Context: USDJPY went ~140→160 in 2023–24. The BoJ hike from 0% to 0.25% then triggered a funding unwind (Aug-2024), with the yen surging inside ~2 weeks.
- Result: **Sharpe ≈ 16 for most of 2024, then a −60% drawdown in the last 4 weeks.**
- **For MacroFXModel:** a textbook picture of carry's negative skew. It argues for (a) vol-regime scaling (see #15989), (b) a JPY/CHF momentum or positioning filter on funder legs, and (c) flagging policy-surprise risk from low-yielders (BoJ, SNB) in the event calendar.

### Risk Premia in Forex Markets (#15305)
https://www.quantconnect.com/research/15305/risk-premia-in-forex-markets/
- Based on Lempérière et al., *Risk Premia: Asymmetric Tail Risks and Excess Returns* (arXiv 1409.7720). A strategy's Sharpe rises roughly linearly with its **negative skew**, across equities, FX, options and credit.
- Long pairs with skew < −0.6, short those with skew > +0.6. Weekly. EURUSD/AUDUSD/USDCAD/USDJPY.
- The authors blame the 4-pair universe, the thresholds and the history length for the weak result. (The library version reports ≈ −0.7%/yr. The code computes skew on *prices*, not returns; see strategies §3.5.)
- **For MacroFXModel:** better as a **crash-risk feature or sizing penalty** than as a standalone signal. Carry currencies are negatively skewed.

### Combining Mean Reversion and Momentum in Forex Market (#15255)
https://www.quantconnect.com/research/15255/combining-mean-reversion-and-momentum-in-forex-market/
- Serban's FX version of Balvers & Wu: 3-month momentum plus deviation-from-mean reversal, fed into a regression that predicts next month. EURUSD, GBPUSD, USDCAD, USDJPY, monthly.
- Jun-2013→Jun-2016: R² 1.4% (paper 3.89%). **Reversal t = −4.07** (strong), momentum t = 1.42 (weak). Reported ~11%/yr, Sharpe 0.8, 11% DD.
- **For MacroFXModel:** supports a long-horizon value/reversion term (PPP-like *(inferred)*) alongside 3m momentum. The low R² is a reminder of how small monthly FX predictability is. A no-look-ahead rebuild is in strategies §3.3.

### Forex Momentum (#15265)
https://www.quantconnect.com/research/15265/forex-momentum/
- 15 pairs, 2006–2018. Long the 3 strongest and short the 3 weakest on 12-month momentum vs USD.
- *(via CoursIA)* An external momentum+carry FX rebuild got **Sharpe −0.654 over 2018–2026**, blamed on weak FX momentum plus an unintended **USD directional bias**.
- **For MacroFXModel:** dollar-neutralise any cross-sectional FX book, so that ranks within the non-USD set don't turn into a net USD bet.

### The Momentum Strategy Based on the Low Frequency Component of Forex Market (#15374)
https://www.quantconnect.com/research/15374/the-momentum-strategy-based-on-the-low-frequency-component-of-forex-market/
- HP-filter trend with an MA(1,2) rule on the trend. 7 FX rates. **Not robust, parameter-sensitive.**
- Key caveat: HP is **two-sided**. Each new point rewrites the past trend (the end-point problem).
- **For MacroFXModel:** use only causal filters (EMA, Kalman, one-sided L1) for real-time signals. A warning, not a strategy.

### SVM Wavelet Forecasting (#15371), EURJPY
https://www.quantconnect.com/research/15371/svm-wavelet-forecasting/
- Wavelet-decompose the last 152 daily closes (sym10), denoise, SVM-forecast each component one step, recombine. Trade in the sign of the forecast, sized by |forecast %|.
- Research page: **Sharpe 0.553 vs SPY 0.463.** (The library tutorial says 0.252 vs 0.713; see §12.)
- **For MacroFXModel:** the only FX-native ML post. It is a modest technical baseline, and SPY is the wrong benchmark for an FX strategy.

---

## 2. Trend + carry on futures (the Carver series), the most transferable block

All four re-create strategies from Robert Carver, *Advanced Futures Trading
Strategies* (2023), not reviewed by Carver. They share one pipeline:
**EMAC(n, 4n) / σ% × forecast scalar → cap ±20 → average across rules × FDM →
vol-target sizing → position buffer.**

### Futures Fast Trend Following, with Trend Strength (#15875), Carver #8
https://www.quantconnect.com/research/15875/futures-fast-trend-following-with-trend-strength/
- A single **EMAC(16, 64)** gives a continuous forecast, used for both direction *and* size. A trade buffer cuts fees.
- Universe: ES and 10y T-note futures. Jul-2020→Jul-2023: **Sharpe 0.294** (beats B&H on the same contracts).
- Ablations: capping positions at [−1, 1] contract drops Sharpe to **0.129**. No buffer gives 738 trades, $5,607 fees, Sharpe 0.301 (the buffer saves costs for a small Sharpe cost).
- **Takeaway:** forecast-proportional sizing matters more than the direction call.

### Adjusted Trend on Futures (#15959), Carver #12
https://www.quantconnect.com/research/15959/adjusted-trend-on-futures/
- Shrinks or adjusts trend forecasts for the probability of reversal and adds more EMAC speeds.
- The result is the **same shape but more volatile forecasts, with more trades and fees and a lower risk-adjusted return.** No buffer: Sharpe 0.193→0.225, fees $9,296→$11,584. Positions limited to {−1, 0, 1}: **Sharpe −0.071**.
- **Takeaway (negative result):** extra trend "cleverness" didn't pay after costs. Keep trend simple, and size continuously.

### Combined Carry and Trend (#16001), Carver #11
https://www.quantconnect.com/research/16001/combined-carry-and-trend/
- Several EMAC trend forecasts ("divergent") plus several carry forecasts ("convergent"). Average within each style, then **blend 60% trend / 40% carry.** Trading both together raises risk-adjusted returns.
- Carry is smoothed with EWMAs. It trades the **2nd natural-gas contract** to strip seasonality out of carry.
- *(via CoursIA)*:
  - Universe: 10 continuous futures (ES, NQ, RTY, VIX, NG (offset 1), CL, ZC, HG, GC, SI), backwards-Panama adjusted.
  - EMAC fast spans 16/32/64. Carver forecast scalars: **2→12.1, 4→8.53, 8→5.95, 16→4.1, 32→2.79, 64→1.91.**
  - Carry EWMA spans **[5, 20, 60, 120]**, scalar **30**.
  - FDM set by rule count, cap ±20, **IDM 1.5**, **vol target 20%**, σ span 32 blended with a 3-year window.
- Jul-2020→Jul-2023: **Sharpe 0.749 vs 0.294 trend-only.** Community reports say it falls to ~0.1 when started in 2015.
- **For MacroFXModel:** the most transferable template of all. In FX, *carry = forward points / rate differential*. The whole forecast → scalar → cap → FDM → vol-target pipeline maps onto `trendBasketEngine` plus a carry sleeve. Use 60/40 as a *prior* and **don't tune weights on a 3-year sample.**

### Futures Trend Following and Carry in Different Risk Regimes (#15989), Carver #13
https://www.quantconnect.com/research/15989/futures-trend-following-and-carry-in-different-risk-regimes/
- Adds a **vol-regime multiplier** M_t: size up when current vol is below its own history, down when above. Scaled forecast = EMAC(n, 4n)/σ% × M_t × scalar.
- *(via CoursIA)* 19 futures, 6 EWMAC speeds + 1 carry, 60/40, **M bounded to [0.5, 2.0]**.
- Jul-2020→Jul-2023: **Sharpe 0.944 vs 0.749** without the regime multiplier.
- **For MacroFXModel:** strongly relevant and cheap. Relative vol (current σ vs its own long-run distribution) is exactly the state that precedes carry crashes like the 2024 yen unwind. Apply it per currency and at book level. Carver's book defines M from the percentile of relative vol; check against the book before coding.

### Commodities Futures Trend Following (#15257)
https://www.quantconnect.com/research/15257/commodities-futures-trend-following/
- Lempérière et al. (2014), *Two Centuries of Trend Following*. Monthly, 7 commodities.
- Research page: **negative Sharpe over 2010–2020.** (The library tutorial reports 0.266 over 1998–2019, and its code has a σ bug; see strategies §3.9.)
- **For MacroFXModel:** trend needs breadth and is regime-dependent. The paper's *currency* results are the relevant ones.

### Improved Momentum Strategy on Commodities Futures (#15272): TSMOM-CF
https://www.quantconnect.com/research/15272/improved-momentum-strategy-on-commodities-futures/
- Baltas & Kosowski: a **t-stat signal clipped to ±1**, **Yang–Zhang vol over 21 days**, and a **correlation factor √(N/(1+(N−1)ρ̄))** on 3-month signed correlation, with a **12% vol target**.
- Jan-2018→Sep-2019 (~20 months): research page **Sharpe 0.198** (library tutorial: 0.321) vs plain TSMOM −0.746, SPY 0.46.
- **For MacroFXModel:** all three components are brick-level upgrades. The correlation factor matters most for G10 FX, where everything vs USD is correlated. The sample is too short to trust the numbers. Full code in strategies §3.10.

### Time Series Momentum Effect (#15375)
https://www.quantconnect.com/research/15375/time-series-momentum-effect/
- MOP (2012): sign of the 12-month excess return, inverse-vol sizing, monthly. The original MOP universe had 24 commodities, **12 cross-currency pairs**, 9 equity indices and 13 bonds.
- Literature surfaced alongside it: much of TSMOM's alpha is **volatility scaling**. Monthly alpha falls from 1.27% to 0.41% without it.
- **For MacroFXModel:** always compare TSMOM against a *vol-scaled buy-and-hold* baseline, or the credit may go to the scaling rather than the signal.

### Term structure and momentum in commodities (#15372, #15359, #15360)
- **#15372 Term Structure Effect:** 22 commodities. Long the highest roll return (backwardation), short the lowest (contango), monthly.
- **#15359 Momentum + Term Structure:** a double-sort into tertiles by roll return, then by past 1-month return. Long High-Winners, short Low-Losers.
- **#15360 Momentum in Commodities:** 12-month ROC quintiles, with continuous contracts mapped by OI and back-ratio adjusted.
- **For MacroFXModel:** in FX, roll yield *is* the interest differential (CIP), so these are **carry and carry × momentum**. The double-sort is a well-known carry-crash fix. See strategies §4.3.

### Prediction on Futures Contango (#15731)
https://www.quantconnect.com/research/15731/prediction-on-futures-contango/
- Defines contango against a rate-adjusted expected spot (continuous compounding). Trades gold futures ≤90 days to expiry on how the calendar spread develops alongside monetary inflation. Beats IEF on return and Sharpe.
- **For MacroFXModel:** gold basis is linked to USD rates (cost of carry). The same forward-basis logic applies to FX forwards and the CIP basis *(inferred)*.

---

## 3. Macro, rates and gold

### Gold Market Timing (#15269)
https://www.quantconnect.com/research/15269/gold-market-timing/
- The "Fed model": long gold when the S&P earnings yield exceeds **2× the 10y UST yield**, otherwise flat, monthly. No figures visible.
- **For MacroFXModel:** a weak story. At best an equity-bond valuation regime feature for JPY/CHF/gold *(inferred)*.

### Idea Streams #7: Why Is Everyone Buying Gold? (blog; forum 9063)
https://www.quantconnect.com/blog/idea-streams-7-why-is-everyone-buying-gold/
- FRED: 10y breakeven inflation and 10y TIPS real yield vs gold, around the Aug-2020 ATH of $2,075.
- **Little long-run link between gold and inflation. A strong negative correlation between gold and real yields.** Since Mar-2020, also a positive correlation with breakevens.
- Backtest Sharpe 2.4, PSR 98%, but it rode the gold rally, so it is heavily regime-dependent.
- **For MacroFXModel:** confirms the real-yield driver that `real-yield.html` / `system-gold-macro` already use. The same US real-rate factor drives broad USD.

### Idea Streams #12: Yield Rates (#15938)
https://www.quantconnect.com/research/15938/idea-streams-12-yield-rates/
- Hold the S&P 500. **Exit when bond yields rise more than 2.5σ above their 90-day mean**, and re-enter when the shock passes. Motivated by the 10y at 1.75% in Mar-2021. It went to cash on 1-Mar-2021 and beat the benchmark on Sharpe and CAGR.
- **For MacroFXModel:** a simple **rates-shock z-score** usable as a risk-off trigger for carry or a USD-strength flag *(inferred)*.

### Can Crude Oil Predict Equity Returns (#15344)
https://www.quantconnect.com/research/15344/can-crude-oil-predict-equity-returns/
- Driesprong et al. (2007). Regress stocks on lagged oil and hold stocks if the prediction beats T-bills. 2010–2017: **Sharpe 0.726 vs 0.735** benchmark. Most p-values were insignificant, and the relationship decayed.
- **For MacroFXModel:** lead-lag relationships decay. Any oil→CAD/NOK rule must report its **rolling significance** at each decision date.

### Sizing Market Exposure With Aggregate Sales Growth (#21132)
https://www.quantconnect.com/research/21132/sizing-market-exposure-with-aggregate-sales-growth/
- Garfinkel, Hribar & Hsiao (2025): aggregate sales growth predicts market excess return **negatively** (through competition and extrapolation/mispricing channels).
- Monthly SPY/BIL allocation by **mean-variance sizing**. Jul-2021→Jul-2026: **Sharpe 0.753 vs 0.412**. Sweep of risk-aversion 1–5 × variance window 8–12y: **25/25** beat SPY.
- **For MacroFXModel:** a template for turning a **slow macro aggregate into a position size** via mean-variance (expected return / (γ·σ²)), rather than a binary switch.

### Reimagining the 60-40 Portfolio in an Era of AI and Falling Rates (#18049)
https://www.quantconnect.com/research/18049/reimagining-the-60-40-portfolio-in-an-era-of-ai-and-falling-rates/
- A **decision-tree regression on economic factors** predicts each risk-on/risk-off asset's next-month total return. Size is proportional to the prediction, monthly.
- Jan-2017→Sep-2024: **Sharpe 0.794 vs 0.564**. 32/49 variants (65%) beat SPY, and **every variant with a 4-year lookback** did.
- **For MacroFXModel:** the closest analogue to a macro-feature → 1-month return model. The design note: the training window (4y) mattered more than the model's hyperparameters.

---

## 4. Volatility, VRP and options

### Harvesting the Volatility Risk Premium With a Dual VIX Signal (#21143)
https://www.quantconnect.com/research/21143/harvesting-the-volatility-risk-premium-with-a-dual-vix-signal/
- Replicates Zarattini, Mele & Aziz (2025). Signals: (1) **expected VRP = implied − forecast realised vol**, and (2) the **VIX/VIX3M term-structure slope**. Trades VIXY short (harvest) or long (protection). Size scales near **VIX/100** (smaller in calm, when spike risk is highest), and idle cash sits in SPY.
- Defaults: a **10-day** realised-vol window and a **2% rebalance threshold**. Sweep 6–14 days × 1–5%: **25/25** beat the benchmark.
- Jan-2016→Jul-2026: **Sharpe 0.729.** Future work: better RV forecasts (intraday, GARCH).
- **For MacroFXModel:** VRP and **VIX/VIX3M inversion** are strong **risk-regime features** (carry off, JPY/CHF bid). The same construction works on FX implied vol (CVIX, EURUSD 1M vs 3M) if we ever get that data.

### The MAX Effect with VIX-Based Leverage Scaling (#20886)
https://www.quantconnect.com/research/20886/the-max-effect-with-vix-based-leverage-scaling/
- MAX = the mean of the 5 largest daily returns over the trailing 21 days. Each month, hold the **lowest-MAX decile** equal-weighted, with leverage **1.5× when VIX is calm and 1.0× when it spikes.**
- Jan-1998→Jun-2026: **Sharpe 0.57 vs 0.335.** Sweep top-returns 3–7 × portfolio size 15–35: **25/25** beat SPY.
- **For MacroFXModel:** a two-state **VIX leverage switch** is a crude but robust overlay. It also suggests a screen that avoids currencies with recent jump returns *(inferred)*.

### Trading Volatility with Options (#17882)
https://www.quantconnect.com/research/17882/trading-volatility-with-options/
- SPX straddles: **short when VIX is relatively high, long when it is low.** Profitable, but **negative Sharpe** once the risk-free rate (FOMC primary credit rate) is subtracted.
- **Lesson:** "sell vol when implied is high" can make money and still not beat cash. Always measure against the risk-free rate.

### Volatility Risk Premium Effect (#15382) and Exploiting Term Structure of VIX Futures (#15261)
- #15382: monthly, **sell a 1M ATM straddle and buy a 15% OTM put.**
- #15261: **short VX when daily roll > 0.10 (contango), long when < −0.10**, hedged with ES. Uses contracts with >10 days to expiry, minute data, trading in the last 15 minutes. Uses the VIX Central contango dataset (12 contracts, from Jun-2010).
- **For MacroFXModel:** VIX term structure as a carry on/off state variable. The roll-threshold-with-hysteresis design ports to FX forward-point carry. See strategies §4.5–4.6.

### Automating the Wheel Strategy (#17871)
https://www.quantconnect.com/research/17871/automating-the-wheel-strategy/
- Sell cash-secured OTM puts on SPY until assigned, then covered calls. **Sharpe 1.083 vs 0.7.** Sweep OTM 10–20% × min DTE 15–60: all beat SPY. Not applicable for us (no options, F1).

### Reducing Option-Writing Risk with IV Rank and Strike Clusters (#18766)
- Title only *(via a French-titled CoursIA issue)*. IV-rank gating for option writing. No details recovered.

---

## 5. Regime detection and ML

### Optimizing a Gold-SPY Portfolio Using Hidden Markov Models for Market Downtime (#18811)
https://www.quantconnect.com/research/18811/optimizing-a-gold-spy-portfolio-using-hidden-markov-models-for-market-downtime/
- A **GMM-HMM fitted to the SPY *drawdown* series** (not returns). SPY vs GLD sizing follows the **transition probabilities** from the current regime into each next regime (a soft regime).
- 6-year backtest (~2019–2025): **Sharpe 0.823, CAGR 19.8%, MaxDD 27.1%**, robust through COVID, the 2020–21 gold slump and the 2022 selloff.
- **Warning** (forum 20417, "Drawdown Regime Gold Hedge"): extended to **20 years (2005–2025), Sharpe falls to 0.469, MaxDD 41%, PSR 43.8% → 1.3%**, and QC flags "Likely Overfitting" (16 parameters).
- **For MacroFXModel:** sizing by transition probability is a good idea, but test any HMM overlay over **20+ years**. Short-window HMM results don't transfer. This matches our own regime-model experience.

### Intraday Application of Hidden Markov Models (#17900)
https://www.quantconnect.com/research/17900/intraday-application-of-hidden-markov-models/
- A **3-state Gaussian HMM** (up-trend / range / down-trend) on **5-minute returns** of the top-10 US stocks. Price only, on purpose. Long entries on regime shifts.
- **Sharpe 1.9.** Optimisation over ROC history 80–160 × bar size 2–8 minutes: **Sharpe 1.1–1.9 in every run.**
- **For MacroFXModel:** small HMMs on returns alone can be parameter-robust. The macro-FX analogue is daily or weekly HMM states on returns or vol *(inferred)*. Cross-check with `hmm5m*.js`.

### Detecting Market Regimes with Machine Learning: Adaptive Trading Strategies Using Microstructure & Sentiment Signals
Indexed at https://www.quantconnect.com/datasets/issue/5451 (no `/research/<id>` found).
- HMM + LSTM regime detection on microstructure and sentiment inputs. **No universe, parameters or results could be recovered.** Needs a direct read.

### Volatility-Targeted QQQ–TLT Rotation with a Multi-Scale CNN-LSTM Forecast (#20371)
https://www.quantconnect.com/research/20371/volatility-targeted-qqq-tlt-rotation-with-a-multi-scale-cnn-lstm-forecast/
- By UC San Diego's Triton Quantitative Trading club (Suri, Chhabra, Chung, Gaudani, mentored by Rudy Osuna).
- A CNN-LSTM forecasts daily **Parkinson (high-low) volatility**. QQQ exposure ∝ 1/predicted vol, with the remainder in TLT.
- The **target vol is re-chosen monthly by walk-forward grid search over {8, 10, 12, 14, 16}%**. The best target drifts across regimes.
- Jan-2007→present (~19y, 4-year warm-up): **Sharpe 0.644 vs 0.591** QQQ. Wins 5 of 9 crisis windows, lags in trending bulls (2014–19, 2022→).
- **For MacroFXModel:** the transferable part is **forecast range-based vol → vol-target overlay → walk-forward re-selection of the target.** The small Sharpe gain suggests an EWMA/HAR Parkinson forecast would do most of the work. Test that baseline first (`vol-forecast*.html`).

### Forecasting Stock Prices Using a Temporal CNN Model (#15263)
- Past 15 OHLCV bars → **direction of the mean close over the next 5 bars.** Over 10 runs: **mean Sharpe −0.274** (research page) vs QQQ 0.877.
- **Lesson:** deep nets predicting *direction* fail. Deep nets forecasting *vol* help modestly. Consistent with our philosophy: target range, vol and regime, not direction.

### LPPLS for Bubbles in Speculative Markets (#20262)
- A Log-Periodic Power Law fit, re-parameterised so A, B, C1, C2 come from OLS and only (t_c, m, ω) are nonlinear, with a dual-EMA regime filter.
- **MaxDD 51.7%, PSR 12.5%.** Sweep windows 70–140 × R² threshold 0.65–0.9: 29/48 (60%) beat the benchmark. The authors admit it is hard to trade. Low relevance.

### Kelly Criterion Applications in Trading Systems (#18312)
- Discrete **f = p − (1−p)/b** and continuous Kelly sizing on a base signal, ~10 years from Jan-2014. Kelly raised returns at similar drawdown, so a higher Sharpe than unsized.
- **For MacroFXModel:** fractional Kelly only on a *calibrated* probability model. Estimation error in p and b dominates.

---

## 6. Portfolio construction, sizing and rebalancing

### Sortino Portfolio Optimization with Alpha Streams Algorithms (#15928)
https://www.quantconnect.com/research/15928/sortino-portfolio-optimization-with-alpha-streams-algorithms/
- SciPy maximises the **Sortino ratio** of the combined equity curve over several alpha strategies (weights × trailing equity curves). **Walk-forward monthly** on trailing curves only. The only real parameter is the Sortino lookback.
- The optimised blend beat every individual alpha on return. A related note: a **45-day** Sortino window is noisy, so they damp outliers with a sigmoid.
- **For MacroFXModel:** a low-parameter way to set **sleeve weights** (carry / trend / value / macro) monthly. Compare with the Carver fixed 60/40.

### Idea Streams #1: Tranche Rebalancing Risk Parity (#15929)
https://www.quantconnect.com/research/15929/idea-streams-1-tranche-rebalancing-risk-parity/
- 60/40 risk parity SPY/SHY from 2003. The execution model moves only **1/12 of the way to target each month** (another snippet says ~25%), vs full rebalancing.
- Tranche rebalancing gave **lower fees, turnover and drawdown, and a higher Sharpe.**
- **For MacroFXModel:** partial or tranche rebalancing (like Carver's buffer) is a free cost reducer for monthly FX books.

### A Risk Parity Approach to Leveraged ETFs (#17879)
- ERC plus min-variance across TQQQ, SVXY, VXZ, TMF, EDZ, UGL and **UUP (USD)**, weekly, `scipy.optimize.minimize` (SLSQP) on daily returns. No results visible.
- **For MacroFXModel:** an ERC/SLSQP implementation pattern that treats USD as one risk sleeve.

### Digital Asset Stockpile Portfolio Construction Techniques (#18784)
- Equal weight vs **inverse-vol (trailing 6-month)** vs **HRP** on the top-10 Coinbase coins, ~8 years. **HRP had the best Sharpe**, but all three lost to holding BTC.
- **For MacroFXModel:** HRP and inverse-vol are the right defaults for G10 FX, whose clustered correlations (European bloc) make the covariance matrix badly conditioned *(inferred)*.

### Factor Optimization Framework on SPY Constituents (#18285)
https://www.quantconnect.com/research/18285/factor-optimization-framework-on-spy-constituents/
- An optimiser picks factor-exposure coefficients (currently **market cap and Sortino**) to maximise trailing return, then sets monthly target weights. Benchmark: a simulated TOPT history.
- **Sharpe 0.764**. But in a 120-cell sweep (lookback 21–252 × universe 25–250), only **61.7% beat B&H, 42.5% beat equal-weight and 23.3% beat cap-weight.**
- **Lesson:** "optimise loadings on trailing returns" overfits. If we blend FX signals this way, report the full sweep.

### Idea Streams #3: Seeking Diversification Amidst Global Market Correlations (#15931)
- Daily: 50% SPY + 50% in whichever of FXI/EWI/VGK/GLD/SHY has the **lowest 120-day correlation with SPY**. From 2019: **Sharpe 0.813, MaxDD 17.9%** (SPY 35%).
- **For MacroFXModel:** a rolling min-correlation selector could pick the diversifying FX hedge leg.

### Probabilistic Sharpe Ratio (#17112)
- A post on PSR, which QC reports on every backtest. Use it with the sweep hit-rate. Title only.

---

## 7. Cross-asset risk-appetite signals

### Bitcoin Regime Signal for Growth Equities (#21195)
https://www.quantconnect.com/research/21195/bitcoin-regime-signal-for-growth-equities
- Hold **QQQ only while BTC is above its 50-day MA *and* its 20-day ROC > 0**, otherwise SHY. Rationale: BTC trades 24/7, is highly leveraged and has no circuit breakers, so it shows risk appetite first.
- Jan-2014→Aug-2026: **Sharpe 0.838** vs SPY 0.564 and QQQ 0.682. **25/25 beat SPY, 23/25 beat QQQ**, grid median 0.812.
- Risk: a crypto-specific shock (exchange failure, regulation) can take you out of QQQ for non-equity reasons.
- **For MacroFXModel:** a candidate **24/7 risk-appetite feature**. Weekend BTC moves could pre-signal Monday gaps in AUD, NZD, JPY and CHF *(inferred)*. Pre-register before testing.

### Bitcoin as a Leading Indicator (#17902)
https://www.quantconnect.com/research/17902/bitcoin-as-a-leading-indicator/
- 100% SPY, with a move to **cash when BTC falls 2σ below its 2-year MA** (BTC gets sold first in a liquidity scramble). **Sharpe 0.622 vs 0.5.**
- **For MacroFXModel:** a crash-filter overlay candidate for carry.

### Cross-Asset ETF Momentum with a Correlation-Based Short Hedge (#21050)
https://www.quantconnect.com/research/21050/cross-asset-etf-momentum-with-a-correlation-based-short-hedge/
- Derek Melchin, Jul-2026. Based on Pauchlyová & Vojtko (2025).
- Monthly: rank ETFs by the **average of their 3/6/9/12-month returns** and hold the **top 4** equal-weight.
- **Short the single worst ETF at 30%** *only when* an intra-market correlation filter (**20-day vs 250-day** correlation) flags a momentum-friendly regime. Permanently shorting losers drags.
- Jul-2007→Jun-2026: **Sharpe 0.451 → 0.498.** **24/25** beat the benchmark, grid range ~0.40–0.57 with a mean of ~0.49. In Mar-2020 only the short lookbacks ran the short leg. The edge rests on a few episodes and isn't statistically decisive.
- **For MacroFXModel:** the **multi-horizon averaged momentum** (3/6/9/12) is a better default than any single lookback. The **correlation-gated short leg** maps onto running the carry funder leg at full size only in the right regime *(inferred)*. The grid report is a good standard to copy.

---

## 8. Stat-arb and pairs

### Pairs Trading: Copula vs Cointegration (#15298)
- Cointegration leg: regress log prices, spread = log Py − β·log Px on a **12-month rolling formation**, **enter at ±1σ, exit at the mean.** Pair GLD/DGL, Jan-2011→May-2017.
- Copula beat cointegration and was less parameter-sensitive. Cointegration made only **91 trades in 5 years** (ETF spreads have low vol).
- **For MacroFXModel:** cointegrated commodity-bloc crosses (AUD/NZD, CAD/NOK vs oil). Model tail dependence if linear hedges fail. Rebuild notes are in strategies §4.11.

### Pairs Trading With Country ETFs (#15299) and With Stocks (#15300)
- #15299: 25 country ETFs, distance method. Country ETFs embed FX, so this is the closest QC analogue to cross-country RV.
- #15300: prices normalised to $1, pick pairs minimising Σ(xᵢ/x₁ − yᵢ/y₁)². **1-year formation, top 4 pairs, reselect every 6 months**, enter at k·σ.

### Optimal Pairs Trading (#15294), Ornstein–Uhlenbeck
- Leung & Li optimal entry and exit with transaction costs. Research page: **Sharpe 0.815 vs 0.612** SPY over 5 years (library tutorial: 0.898 vs 0.667). **Only 12 trades.** Suggests adding GLD-GDX.
- **For MacroFXModel:** cost-aware OU bands for FX mean reversion. Full code in strategies §4.12.

### Intraday Dynamic Pairs Trading Using Correlation and Cointegration (#15347)
- Miao: correlation ≥ 0.9, then cointegration, ranked by test statistic. US banks on 10-minute bars.
- The research page quotes **Sep-2013 only (one month): 26.9% annualised, Sharpe 3.011.** The library tutorial quotes 2013–2016 at 29.4% CAGR, Sharpe 0.968.
- Works best in falling or volatile markets. The two-stage screen is the part worth borrowing.

### Mean Reversion Statistical Arbitrage Strategy in Stocks (#15355)
- Avellaneda & Lee **PCA residual reversion.** Research page: **>6%/yr with ~49% MaxDD** over ~10 years (library: >7%, ~40% DD).
- **For MacroFXModel:** PCA residuals on a G10 panel after removing the dollar and carry PCs. We already test this in `residual_pca_currency_test/`.

### Kalman Filters and Statistical Arbitrage (docs and tutorial, not a research post)
https://www.quantconnect.com/docs/v2/research-environment/applying-research/kalman-filters-and-statistical-arbitrage
- A Kalman time-varying hedge ratio. Long the spread when the forecast error < −σ, exit when it goes back above −σ. Companion forum post 6826.
- **For MacroFXModel:** Kalman time-varying betas (a currency vs rate differentials or commodities) are a core macro-FX tool.

---

## 9. Equity factor posts (low direct relevance; transferable ideas only)

| Post | Key specifics | Transferable idea for FX |
|---|---|---|
| **Low Beta Portfolios Across Industries** (#18469) | AQR (Asness, Frazzini & Pedersen 2013). Below-median beta within each industry group, equal allocation per group. Sharpe 0.669, beta still 0.79. 19/30 beat. Chose beta 60d × 50 names from the *least sensitive* grid region. | Neutralise within buckets (currency bloc) so a tilt doesn't become a hidden bloc bet. Pick parameters from flat regions, not peaks. |
| **Momentum in Capital-Gain Stocks** (#21160) | Momentum is 1.417%/mo in non-dividend stocks vs 0.684% in payers (extrapolation channel). Top 1,000 liquid, ≥$5, ex-financials/utilities. 12-2 lookback, >95th percentile, long-only, monthly. Sharpe 0.602 vs 0.552. 23/25. | Condition trend on a proxy for *extrapolative demand* (positioning, retail flow; price-driven vs carry-driven returns) *(inferred)*. |
| **Statistical Outlier Selection for Momentum Stocks** (#21382) | Two passes: dollar volume > μ_w + 2σ_w, then momentum > μ_w + 2σ_w, with **winsorised** cross-sectional stats (5/95) and raw values compared to the winsorised threshold. Floating number of names, daily rebalance. Sep-2021→Sep-2026 Sharpe 0.525 vs 0.363. 42/42 beat. Large DDs noted; draft. | Let an FX book hold a **variable number of positions**: only currencies that are genuine outliers on the signal. |
| **Residual Momentum** (#15304) | Regress on Fama-French factors over 36 months. Score = residual return / residual vol. Top/bottom 10%, monthly. Less factor exposure, more stable. | **Residualise currency returns on dollar, carry and risk-on factors before ranking momentum.** High value. |
| **Standardized Unexpected Earnings** (#15369) | SUE = YoY change in quarterly EPS / std of that change over 8 quarters. Top 5% monthly. Sharpe 0.83 vs 0.88 (underperforms). | The same standardisation is the **macro-surprise factor**: (actual − consensus) / σ(historical surprises). |
| **Book-to-Market Value** (#15343) | Top 20% by cap, value tilt, cap-weighted. Underperforms S&P (value lags in high-growth bulls). | FX value (PPP/REER) has the same long-drawdown profile. |
| **Price and Earnings Momentum** (#15302) | Price + earnings momentum combined. | Pair price trend with *fundamental momentum* (macro-surprise or revision momentum). |
| Others (titles/notes only) | Beta Factors in Stocks (15342), Beta Factor in Country Indexes (15341), Earnings Quality (15259), FF5 (15262), Fundamental Factor L/S (15266), Fundamental Stock Selection (15370), Piotroski F-Score (15728), G-Score (15267), ROE within Stocks (15306), Accrual (15337), 12-Month Cycle (15336), Expected Idiosyncratic Skewness (15260; ~1%/mo low-minus-high skew alpha), Small-Portfolio Momentum (15363), Short-Term Reversal (15367, 15311; weekly De Groot/Huij/Zhou, underperforms except in the 2020 crash), Short-Term Reversal with Futures (15366), Sector Momentum (15308; top 3 of 10 sector ETFs, 12m), Sector Rotation on News Sentiment (15309). | Country-index beta and futures reversal (volume ↑ / OI ↓) are the most portable. |

---

## 10. Intraday and microstructure

### Opening Range Breakout for Stocks in Play (#18444)
https://www.quantconnect.com/research/18444/opening-range-breakout-for-stocks-in-play/
- Zarattini, Barbon & Aziz (2024). Universe: 1,000 most liquid US stocks, >$5, ATR > $0.50. Trade the **20 most "in play"** by relative volume (first 5-minute volume / its 14-day average).
- 5-minute opening range. Direction comes from the first bar's colour, with an entry on the break of its high or low. **Stop = 10% of the 14-day ATR.** Flat at the close. Win rate ~17%.
- **Sharpe ≈ 2.4, beta −0.04.** 17/25 beat.
- **For MacroFXModel:** a session-open breakout (London or NY open) filtered by **abnormal relative volume or range** *(inferred)*. The "in-play" relative-volume filter is the key ingredient, not the breakout. Relevant to `SessionResearch`.

### Intraday ETF Momentum (#15348)
- The first half-hour return predicts the last half-hour (Gao, Han, Li & Zhou). Paper: SPY 6.67%, IWM 11.72%, IYR 24.22% per year. The library replication after costs gave Sharpe −0.76 (strategies §4.15).
- **For MacroFXModel:** test whether the first hour after the London open predicts the NY-close or London-fix window, **only on high-vol or event days.**

### Overnight Anomaly (#15296)
- Buy SPY at the close and sell at the open. **The returns vanish after slippage and fees.** A caution for any session-split strategy.

### Intraday Volume Periodicity (#21066)
- Wu, Zhang & Dai (2025), *Spectral Volume Models*: execution algorithms leave periodic footprints in intraday volume (Fourier).
- Weekly: rank ~100 liquid names by `volume_variance_explained` and hold the top quintile long-only, with a 3-month EMA execution-score tilt between 1× and 2×.
- Jul-2021→Jul-2026: **Sharpe 0.792 vs 0.406**, 25/25. Caveats *(via CoursIA)*: a paid tick-flow dataset, no OOS, and the optimum sits on the grid edge.
- **For MacroFXModel:** conceptually close to spotting **fix-related algorithmic flow** in FX tick volume *(inferred)*.

---

## 11. Event, text and alternative data

- **Filing Language Stability as a Selection Signal (#20966).** "Lazy Prices" (Cohen, Malloy & Nguyen) via Brain Language Metrics. Hold the 10-K/10-Q filers most similar to their last filing, with max-Sharpe weights, top 100 liquid, Jan-2020→Jun-2026. The post claims it beats SPY, but *(via CoursIA)* reads it as **0.558 vs 0.558 with only 9/25 beating**, which is essentially no edge.
  **FX idea:** textual-change scoring of **central-bank statements** (a large FOMC/ECB rewrite as a policy-shift signal) *(inferred)*. This links to our `fomc-sentiment` / `ecb-sentiment` pages.
- **Copying Congress Trades (#17886).** Quiver STOCK Act data (reported ≤45 days late), inverse-vol weighting. **Sharpe 0.934 vs 0.7.** Not relevant.
- **Using News Sentiment to Predict Price Direction of Drug Manufacturers (#15378).** Tiingo news. The docs show FinBERT (ProsusAI/finbert) scoring of the prior 10 days. Tiingo covers US equities only.
- **Gaps:** no research posts found on index rebalances, buybacks, insider buying, FX value/PPP, economic-surprise FX trading, or FOMC-event FX trading. QC has the *datasets* (Smart Insider, Quiver, Brain, Tiingo, FRED, Eurostat, US Treasury curve, CFTC COT (942 markets, weekly from 1998), OANDA FX (71 pairs), FXCM FX (13 pairs)). **QC has no DXY. Build it from pairs.**
- Also noted: the forum post "Consumer Price Index Strategy" (Derek Melchin, forum 14270) defines rising inflation as BLS 12-month CPI up over the last two releases, and selects SPY names with a better Sharpe in the matching inflation regime.

---

## 12. Numbers that differ between the research page and the library tutorial

The old Strategy Library tutorials were republished as research posts, and the
two sources often quote different results. The likely reason is a re-run on newer
LEAN/data or a different window. **Don't cite either number without saying which.**

| Strategy | Research page (snippet) | Library tutorial (GitHub) |
|---|---|---|
| SVM Wavelet EURJPY | Sharpe 0.553 vs SPY 0.463 | Sharpe 0.252 vs SPY 0.713 |
| Optimal Pairs (OU) | 0.815 vs 0.612 | 0.898 vs 0.667 |
| TSMOM-CF | 0.198 | 0.321 (vs TSMOM −0.746 in both) |
| Commodities Trend (Lempérière) | negative, 2010–2020 | 0.266, 1998–2019 |
| Crude Oil → Equities | 0.726 vs 0.735 | 0.72 vs 0.60 |
| Leveraged ETF 200-SMA | 0.555 vs 0.524 | 0.732 vs 0.572 |
| Same-Calendar-Month Seasonality | 0.128 | 0.332 vs 0.893 |
| Intraday Dynamic Pairs | Sep-2013 only: 26.9%, Sharpe 3.011 | 2013–2016: 29.4%, 0.968 |
| PCA Stat-Arb | >6%/yr, ~49% DD | >7%/yr, ~40% DD |
| Temporal CNN | mean Sharpe −0.274 (10 runs) | mean 0.211 (range −0.31…0.92) |

The spread itself is informative. Several of these "edges" swing sign or
halve between runs, which tells you how fragile they are.

---

## 13. Synthesis: what to take into MacroFXModel

**Build next (highest expected value, all brick-expressible):**
1. **Carver pipeline for FX** (#16001 + #15989): EMAC(n, 4n)/σ trend ensemble + smoothed rate-differential carry, forecast scalars, cap ±20, FDM, 60/40 prior, **vol-regime multiplier M ∈ [0.5, 2]**, position buffer. Validate on 13 pairs from 2005, not 2020–23.
2. **TSMOM-CF upgrades** (#15272): t-stat signal, Yang–Zhang vol, correlation-factor de-leveraging. Especially the CF, given USD co-movement.
3. **Carry crash controls:** the vol-regime multiplier, **VIX/VIX3M + VRP state** (#21143), the VIX two-state leverage switch (#20886), the rates-shock z-score (#15938), and a candidate **BTC 24/7 risk-appetite flag** (#21195, #17902). Pre-register each one. The Yen micro-study (#17843) is the motivating case.
4. **Multi-horizon momentum** (3/6/9/12 averaged, #21050) and **residual momentum** (#15304: residualise on dollar/carry/risk factors) for the cross-sectional sleeve, **dollar-neutralised** (#15265 lesson).
5. **Portfolio mechanics:** tranche or buffered rebalancing (#15929, #15875), Sortino/HRP/inverse-vol sleeve weighting with monthly walk-forward (#15928, #18784), and mean-variance sizing of slow macro signals (#21132).

**Methodology standards to adopt from QC's own practice:**
- Report the **full parameter sweep and its hit-rate** with PSR, not the best cell.
- Pick parameters from the **flat region** of the grid (#18469), not the peak.
- **Test regime overlays over 20+ years.** The HMM gold hedge fell from Sharpe 0.82 to 0.47 when extended (#18811).
- Report **per-decision significance** of predictive regressions (#15344).
- Benchmark against **vol-scaled buy-and-hold** (TSMOM) and **the risk-free rate** (#17882). SPY is not a benchmark for FX.
- **Causal filters only** (#15374 HP end-point problem).

**Deprioritise:** direction-predicting deep nets (#15263), standalone skew
trading (#15305), gold Fed-model timing (#15269), LPPLS (#20262), and
anything that needs options or single-stock data (F1).

---

## Appendix: post index (IDs recovered)

| ID | Title | § |
|---|---|---|
| 15255 | Combining Mean Reversion and Momentum in Forex Market | 1 |
| 15257 | Commodities Futures Trend Following | 2 |
| 15259 | Earnings Quality Factor | 9 |
| 15260 | Expected Idiosyncratic Skewness | 9 |
| 15261 | Exploiting Term Structure of VIX Futures | 4 |
| 15262 | Fama French Five Factors | 9 |
| 15263 | Forecasting Stock Prices Using a Temporal CNN Model | 5 |
| 15264 | Forex Carry Trade | 1 |
| 15265 | Forex Momentum | 1 |
| 15266 | Fundamental Factor Long Short | 9 |
| 15267 | G-Score | 9 |
| 15269 | Gold Market Timing | 3 |
| 15272 | Improved Momentum Strategy on Commodities Futures | 2 |
| 15294 | Optimal Pairs Trading | 8 |
| 15296 | Overnight Anomaly | 10 |
| 15298 | Pairs Trading: Copula vs Cointegration | 8 |
| 15299 | Pairs Trading With Country ETFs | 8 |
| 15300 | Pairs Trading With Stocks | 8 |
| 15302 | Price and Earnings Momentum | 9 |
| 15304 | Residual Momentum | 9 |
| 15305 | Risk Premia in Forex Markets | 1 |
| 15306 | ROE Effect Within Stocks | 9 |
| 15307 | Seasonality Effect Based on Same Calendar Month Returns | 12 |
| 15308 | Sector Momentum | 9 |
| 15309 | Sector Rotation Based on News Sentiment | 9 |
| 15311 | Short Term Reversal Strategy in Stocks | 9 |
| 15336 | 12-Month Cycle in Cross-Section | 9 |
| 15337 | Accrual Anomaly | 9 |
| 15338 | Asset Class Momentum | — (strategies §4.1) |
| 15339 | Asset Class Trend Following | — (strategies §4.1) |
| 15341 | Beta Factor in Country Equity Indexes | 9 |
| 15342 | Beta Factors in Stocks | 9 |
| 15343 | Book-to-Market Value Anomaly | 9 |
| 15344 | Can Crude Oil Predict Equity Returns | 3 |
| 15347 | Intraday Dynamic Pairs Trading (Correlation + Cointegration) | 8 |
| 15348 | Intraday ETF Momentum | 10 |
| 15351 | Leveraged ETFs With Systematic Risk Management | 12 |
| 15355 | Mean Reversion Statistical Arbitrage in Stocks | 8 |
| 15359 | Momentum Effect Combined with Term Structure in Commodities | 2 |
| 15360 | Momentum Effect in Commodities Futures | 2 |
| 15363 | Momentum Effect in Stocks in Small Portfolios | 9 |
| 15366 | Short Term Reversal with Futures | 9 |
| 15367 | Short Term Reversal | 9 |
| 15369 | Standardized Unexpected Earnings | 9 |
| 15370 | Stock Selection Based on Fundamental Factors | 9 |
| 15371 | SVM Wavelet Forecasting | 1 |
| 15372 | Term Structure Effect in Commodities | 2 |
| 15374 | Momentum Strategy on the Low Frequency Component of Forex | 1 |
| 15375 | Time Series Momentum Effect | 2 |
| 15378 | Using News Sentiment to Predict Price Direction of Drug Manufacturers | 11 |
| 15382 | Volatility Risk Premium Effect | 4 |
| 15728 | Piotroski F-Score | 9 |
| 15731 | Prediction on Futures Contango | 2 |
| 15875 | Futures Fast Trend Following, with Trend Strength | 2 |
| 15928 | Sortino Portfolio Optimization with Alpha Streams Algorithms | 6 |
| 15929 | Idea Streams #1: Tranche Rebalancing Risk Parity | 6 |
| 15931 | Idea Streams #3: Diversification Amidst Global Correlations | 6 |
| 15938 | Idea Streams #12: Yield Rates | 3 |
| 15959 | Adjusted Trend on Futures | 2 |
| 15989 | Futures Trend Following and Carry in Different Risk Regimes | 2 |
| 16001 | Combined Carry and Trend | 2 |
| 17112 | Probabilistic Sharpe Ratio | 6 |
| 17843 | Micro Study: Yen Carry Trade | 1 |
| 17871 | Automating the Wheel Strategy | 4 |
| 17879 | A Risk Parity Approach to Leveraged ETFs | 6 |
| 17882 | Trading Volatility with Options | 4 |
| 17886 | Copying Congress Trades | 11 |
| 17900 | Intraday Application of Hidden Markov Models | 5 |
| 17902 | Bitcoin as a Leading Indicator | 7 |
| 18049 | Reimagining the 60-40 Portfolio in an Era of AI and Falling Rates | 3 |
| 18285 | Factor Optimization Framework on SPY Constituents | 6 |
| 18312 | Kelly Criterion Applications in Trading Systems | 5 |
| 18444 | Opening Range Breakout for Stocks in Play | 10 |
| 18469 | Low Beta Portfolios Across Industries | 9 |
| 18766 | Reducing Option-Writing Risk with IV Rank and Strike Clusters | 4 |
| 18784 | Digital Asset Stockpile Portfolio Construction Techniques | 6 |
| 18811 | Optimizing a Gold-SPY Portfolio Using HMMs for Market Downtime | 5 |
| 18987 | Portfolio Construction Using Topological Data Analysis (8/70 beat) | 0 |
| 20262 | LPPLS for Bubbles in Speculative Markets | 5 |
| 20371 | Volatility-Targeted QQQ–TLT Rotation with a Multi-Scale CNN-LSTM | 5 |
| 20886 | The MAX Effect with VIX-Based Leverage Scaling | 4 |
| 20966 | Filing Language Stability as a Selection Signal | 11 |
| 21050 | Cross-Asset ETF Momentum with a Correlation-Based Short Hedge | 7 |
| 21066 | Intraday Volume Periodicity | 10 |
| 21132 | Sizing Market Exposure With Aggregate Sales Growth | 3 |
| 21143 | Harvesting the Volatility Risk Premium With a Dual VIX Signal | 4 |
| 21160 | Momentum in Capital-Gain Stocks | 9 |
| 21195 | Bitcoin Regime Signal for Growth Equities | 7 |
| 21382 | Statistical Outlier Selection for Momentum Stocks | 9 |
| — | Detecting Market Regimes with ML (Microstructure & Sentiment), datasets/issue/5451 | 5 |
| — | Idea Streams #7: Why Is Everyone Buying Gold? (blog) | 3 |
| — | Idea Streams #9: Seasonal Investing Strategy (blog) | — (SPY Mar–Oct, consumer cyclicals Nov–Feb; results truncated) |

**To finish this properly:** once the environment allows `www.quantconnect.com`,
walk the full `/research/` listing (paginated) and diff it against this index.
Also pull the `/strategies/` community showcase, which isn't covered here or in
`quantconnect_strategies.md`.
