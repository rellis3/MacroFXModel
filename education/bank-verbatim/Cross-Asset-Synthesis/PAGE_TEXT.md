<!-- https://cog000.github.io/Cross-Asset-Synthesis/ | Lesson 6 — Cross-Asset Synthesis -->
Colez Trades
Quantitative & Macro Insights
C.OG
# Lesson 6

Cross-Asset Synthesis

📊 Advanced
⏱️ 75-90 min
🎯 Institutional Framework
This lesson presents the **structural framework** for institutional cross-asset analysis. The concepts here are how global macro funds and multi-asset allocators actually think — but understanding the framework is only the first step. **Systematic implementation through data infrastructure and quantitative testing is where edge is built.** We'll point toward that throughout, with detailed implementation covered in the Data Modelling section.

1
## The Institutional Cross-Asset Framework

Retail traders watch stocks. Institutional traders watch **the entire capital structure**. A macro theme doesn't express itself in one market — it ripples through rates, credit, equity, volatility, and FX simultaneously. Understanding how to read these signals together, and how information flows between them, is the foundation of institutional macro thinking.

#### How a Global Macro Fund Actually Thinks

When a $50B global macro fund forms a view — say, "the Fed will pivot dovish earlier than expected" — they don't just buy stocks. They ask:

- What's the highest-conviction expression? (Maybe 2Y rates, not equities)

- What's the best risk-adjusted expression? (Maybe rate options for convexity)

- What should confirm if we're right? (Credit tightening, USD weakening)

- What invalidates the thesis? (Inflation reaccelerating)

- What's the time horizon? (Weeks, months, quarters)

The same macro view can be expressed across the entire capital structure with vastly different risk/reward profiles. Choosing the right expression — and monitoring confirming signals — is what separates institutional from retail thinking.

### The Capital Structure: Information Flow Hierarchy

Rates / Sovereign Bonds
First to price macro shifts
Credit (IG → HY)
Corporate health, risk appetite
FX / Currencies
Policy divergence, global flows
Equity Indices → Sectors → Single Stocks
Broadest participation, most noise
Volatility Surface
Insurance pricing, tail risk, fear
Information generally flows top-down. Rates move first, equities move last. Volatility reflects the market's uncertainty about all of it.

### Why Single-Asset Analysis Fails

Analyzing equities in isolation is like trying to understand a movie by watching one character. You miss the plot.

- **Equities are noisy:** Broadest participation, retail flows, narrative-driven, last to price macro

- **Bonds are cleaner:** Institutional-dominated, macro-focused, mathematically constrained

- **Credit bridges the gap:** Corporate fundamentals + macro conditions

- **FX reveals policy divergence:** Central bank differentials made tradeable

**The institutional insight:** If you only watch equities, you're seeing the last domino fall. The preceding moves — in rates, credit, FX — told the story hours, days, or weeks earlier.

### Coherence vs Incoherence

At any moment, markets are either telling a **consistent story** (coherent) or **conflicting stories** (incoherent).

**High Coherence:** All asset classes pricing the same scenario. Rates, credit, FX, equities all aligned. Trends tend to persist. Trend-following works.

**Low Coherence:** Asset classes pricing conflicting scenarios. Either someone is wrong (opportunity), markets are transitioning (wait), or there's genuine uncertainty (reduce risk).

Monitoring coherence tells you not just *what* to trade, but *how much conviction* to have and *what position size* is appropriate.

#### Quantitative Implementation Note

Coherence can be measured systematically. One approach: compute rolling correlations between asset classes and compare to regime norms. When cross-asset correlations deviate significantly from their regime-typical levels, coherence is low.

A simple coherence score might track: (1) stock-bond correlation vs expected, (2) credit-equity correlation vs expected, (3) FX-rate differential alignment. Aggregate deviations signal regime uncertainty.

**This is testable.** Historical periods of high vs low coherence have different characteristics for trend-following vs mean-reversion strategies. The Data Modelling section will cover implementation.

**Important Reality Check:** Understanding this framework intellectually is valuable, but **discretionary daily trading on cross-asset signals is not where most alpha lives.** Markets are highly efficient at short horizons. The institutional edge comes from: (1) superior data infrastructure, (2) systematic implementation, (3) longer time horizons, and (4) capacity to hold positions through volatility. We present this framework so you understand how institutions think — implementation requires the quantitative rigor we'll develop in later sections.

#### Section Summary

- **Institutional traders view the entire capital structure** — same macro view, multiple expressions

- **Information flows top-down:** Rates → Credit → FX → Equities

- **Coherence is actionable:** Aligned markets = higher conviction; misaligned = investigate

- **Understanding ≠ Edge:** Framework knowledge is necessary but not sufficient; systematic implementation is where alpha lives

2
## Macro Regime Framework

The macro environment can be decomposed into four primary regimes based on the direction of **growth** and **inflation**. Each regime has distinct implications for asset allocation across the capital structure. Identifying the current regime — and more importantly, detecting regime transitions early — is the core skill of macro investing.

#### The Four Quadrants

Growth and inflation are the two axes that matter most for asset allocation. Everything else — Fed policy, earnings, credit conditions — flows from these two variables.

**Growth:** Is economic activity accelerating or decelerating? (ISM, employment, GDP)

**Inflation:** Is price pressure rising or falling? (CPI, PCE, breakevens)

The combination determines which assets outperform. Get the regime right, and asset selection becomes much easier.

Goldilocks
Growth ↑ Inflation ↓
The "best of all worlds" — growth is healthy while inflation remains contained. Central banks can stay accommodative. Risk assets thrive.

Duration Neutral
Credit (IG/HY) Overweight
Equities Overweight
Growth vs Value Growth
Commodities Selective
Volatility Sell
**Historical examples:** 2017, mid-2019, late 2023

Reflation
Growth ↑ Inflation ↑
Economy running hot — growth strong, but inflation picking up. Central banks begin tightening bias. Value and real assets outperform.

Duration Underweight
Credit (IG/HY) Neutral
Equities Overweight
Growth vs Value Value
Commodities Overweight
TIPS Overweight
**Historical examples:** 2021 reopening, 2004-2006

Stagflation
Growth ↓ Inflation ↑
The worst outcome — growth slowing while inflation persists. Central banks are trapped. Nowhere to hide except real assets and cash.

Duration Complex
Credit (IG/HY) Underweight
Equities Underweight
Defensives Overweight
Gold / Energy Overweight
Cash Overweight
**Historical examples:** 2022 (partial), 1970s

Deflation
Growth ↓ Inflation ↓
Risk-off environment — growth collapsing, inflation falling. Central banks ease aggressively. Flight to quality dominates.

Duration Max Overweight
Credit (IG/HY) IG only, no HY
Equities Underweight
Quality Factor Overweight
Safe Haven FX JPY, CHF, USD
Volatility Long
**Historical examples:** 2008, March 2020, 2015-2016

### Regime Transition Signals

Identifying the current regime is useful. Identifying regime *transitions* early is where the real money is made. Here are the cross-asset signals that typically lead regime shifts:

| Transition | Leading Indicators | Confirmation Signals |
| **→ Goldilocks** | Yield curve steepening (bull), credit spreads tightening, breakevens stable | Equities broadening, vol declining, EM FX strengthening |
| **→ Reflation** | Breakevens rising, commodities breaking out, curve bear steepening | Value outperforming growth, banks rallying, TIPS outperforming nominals |
| **→ Stagflation** | Growth data weakening while breakevens stay elevated, curve flattening from short end | Credit widening, equities falling, but gold/commodities holding |
| **→ Deflation** | Curve bull flattening, credit spreads blowing out, vol spiking | JPY surging, gold bid on real yield collapse, quality factor dominating |

#### Quantitative Implementation Note

Regime identification can be approached systematically through various methods:

- **Rule-based:** Define thresholds for growth/inflation indicators (e.g., ISM > 50 = growth up, Core CPI YoY > 3% = inflation up)

- **Statistical:** Hidden Markov Models (HMM) to infer latent regime states from asset returns

- **Machine Learning:** Clustering algorithms on macro indicators to identify regime patterns

Each approach has tradeoffs. Rule-based is interpretable but requires arbitrary thresholds. HMM is elegant but can overfit. The key is robustness testing across multiple methods.

**Critical:** Regime identification is inherently backward-looking. By the time you're confident about the regime, much of the move has happened. The edge is in identifying transitions early — which requires forward-looking indicators and systematic monitoring.

#### Section Summary

- **Four regimes defined by growth × inflation:** Goldilocks, Reflation, Stagflation, Deflation

- **Each regime has distinct asset allocation implications** across the capital structure

- **Regime transitions are where the money is made** — identifying shifts early is the goal

- **Cross-asset signals lead regime shifts** — rates and credit typically move before equities

3
## The Macro Dashboard — Data Architecture

Institutional macro analysis requires systematic data infrastructure. This section outlines the key variables to monitor, organized by tier, along with specific data sources. This is a **structural framework** — the variables that matter and why — not a daily trading checklist. Turning this into actionable signals requires the quantitative infrastructure we'll develop later.

**A Note on Time Horizons:** The data architecture below is designed for **medium-term positioning** (weeks to months), not daily trading. Attempting to trade these signals on a daily basis is a common retail mistake. Markets are highly efficient at short horizons; edge typically exists at longer horizons where you're competing against behavioral biases and structural flows, not other fast-moving traders. Build systems that identify regime shifts and position accordingly — don't try to day-trade macro.

Tier 1: Policy Tier 2: Rates Tier 3: Credit Tier 4: FX Tier 5: Vol Tier 6: Commodities
### Tier 1: Policy & Liquidity

The highest level of the hierarchy. Central bank policy and liquidity conditions set the environment for everything else. Monitor weekly to monthly.

##### Fed Balance Sheet

FRED
WALCL
Total Assets, weekly
The size of the Fed's balance sheet. QE expands it (liquidity injection), QT shrinks it (liquidity withdrawal).

##### Reverse Repo (RRP)

FRED
RRPONTSYD
ON RRP, daily
Money parked at the Fed. High RRP = excess liquidity sitting on sidelines. Declining RRP = liquidity being deployed.

##### Treasury General Account

FRED
WTREGEN
TGA balance, weekly
Treasury's checking account. Rising TGA drains liquidity; falling TGA injects liquidity into the system.

Net Liquidity Proxy
This simple formula approximates the liquidity actually available to markets. When net liquidity rises, risk assets tend to benefit. When it falls, risk assets face headwinds. The relationship isn't mechanical — it's a condition, not a signal.

##### Financial Conditions Index

FRED
NFCI
Chicago Fed NFCI, weekly
Composite of rates, spreads, equity vol. Positive = tight conditions, negative = loose. Also see Goldman Sachs FCI.

##### Bank Lending Standards

FRED
DRTSCILM
SLOOS survey, quarterly
% of banks tightening standards. Leading indicator for credit availability and economic activity.

##### Global M2 (USD-adjusted)

Various
Custom composite
Monthly
Aggregate money supply across major economies, converted to USD. Global liquidity proxy.

### Tier 2: Rates & Curve

The first market to price macro shifts. Yield levels, curve shape, and real yields tell you about growth expectations, inflation expectations, and policy trajectory.

##### 2-Year Treasury Yield

FRED
DGS2
Daily
Most sensitive to Fed policy expectations. Moves here drive FX and front-end positioning.

##### 10-Year Treasury Yield

FRED
DGS10
Daily
Benchmark rate. Reflects growth + inflation + term premium. Key for equity valuations and mortgage rates.

##### 2s10s Spread

FRED
T10Y2Y
Daily
Curve shape. Negative = inverted = recession signal. Watch direction as much as level.

##### 10Y Real Yield (TIPS)

FRED
DFII10
Daily
Nominal yield minus inflation expectations. Key driver for gold, growth stocks, and long-duration assets.

##### 10Y Breakeven Inflation

FRED
T10YIE
Daily
Market's inflation expectation over 10 years. Rising breakevens = reflation/stagflation risk.

##### MOVE Index

Bloomberg
MOVE Index
Daily
Treasury volatility index. Bond market's VIX. Elevated MOVE often precedes equity vol spikes.

### Tier 3: Credit & Risk Appetite

Credit markets bridge rates and equities. Spreads reflect corporate health and risk appetite. Credit typically leads equity at turning points.

##### IG Credit Spread

FRED
BAMLC0A0CM
Daily
Investment grade OAS. Quality credit risk appetite. Less volatile than HY but still informative.

##### HY Credit Spread

FRED
BAMLH0A0HYM2
Daily
High yield OAS. The key risk appetite gauge. Widening HY spreads = risk-off, often leads equity.

##### CDX Investment Grade

Bloomberg
CDX.NA.IG
Daily
Tradeable IG credit index. More liquid than cash bonds, watched by institutional desks.

##### CDX High Yield

Bloomberg
CDX.NA.HY
Daily
Tradeable HY credit index. Very correlated with equities but often leads at turning points.

##### EM Sovereign Spread

FRED
BAMLEMCBPIOAS
Daily
EM sovereign credit risk. Global risk appetite and dollar funding stress indicator.

##### TED Spread

FRED
TEDRATE
Daily
LIBOR - T-bill spread. Interbank lending stress. Less relevant post-LIBOR but concept still matters.

### Tier 4: FX & Global Flows

Currencies reflect rate differentials and risk appetite. The dollar is the most important — its strength or weakness ripples through all risk assets globally.

##### DXY Dollar Index

FRED
DTWEXBGS
Daily (Broad)
Trade-weighted dollar. Strong USD = headwind for EM, commodities, US multinational earnings.

##### EUR/USD

FRED
DEXUSEU
Daily
Most traded pair. Fed vs ECB policy divergence. Global growth proxy (weak EUR = Europe struggling).

##### USD/JPY

FRED
DEXJPUS
Daily
Carry trade barometer. JPY strengthening = risk-off signal, carry unwind. Watch for BoJ intervention.

##### AUD/USD

FRED
DEXUSAL
Daily
Risk currency, China proxy. AUD weakness = global growth concerns, commodity demand fears.

##### EUR/USD Basis Swap

Bloomberg
EUBS3 Curncy
Daily
Cross-currency basis. Widening = dollar funding stress. Blowout = crisis signal (March 2020).

##### EM FX Index

Bloomberg
FXJPEMCS
Daily
Broad EM currency basket. EM FX weakness often leads broader risk-off moves.

### Tier 5: Volatility Surface

Volatility markets price risk and uncertainty. The vol surface reveals market fears, positioning, and expectations for future turbulence.

##### VIX

FRED
VIXCLS
Daily
S&P 500 implied volatility. The "fear gauge." Low VIX = complacency. Spiking VIX = panic.

##### VIX Term Structure

CBOE
VIX, VIX3M, VIX6M
Daily
Normal = upward sloping (contango). Inverted = backwardation = near-term fear elevated.

##### VVIX (Vol of Vol)

CBOE
VVIX
Daily
Volatility of VIX. High VVIX = uncertainty about uncertainty. Can spike before VIX itself.

##### Put/Call Skew

CBOE
SKEW
Daily
OTM put vs call pricing. High skew = tail risk hedging demand elevated. Crash fear indicator.

##### MOVE Index

Bloomberg
MOVE Index
Daily
Bond volatility. Often leads VIX at macro turning points. MOVE spikes preceded March 2023 banking stress.

##### MOVE/VIX Ratio

Derived
MOVE / VIX
Daily
Rate vol relative to equity vol. High ratio = bond uncertainty outpacing equity uncertainty. Macro stress signal.

### Tier 6: Commodities & Real Assets

Commodities provide signals on global growth, inflation, and specific sector dynamics. They're also trading vehicles in their own right for regime positioning.

##### WTI Crude Oil

FRED
DCOILWTICO
Daily
Global demand proxy, inflation input. Rising oil = reflation. Crashing oil = growth fears or supply glut.

##### Copper

FRED
PCOPPUSDM
Monthly (daily via futures)
"Dr. Copper" — industrial demand proxy. Leading indicator for global manufacturing and China.

##### Gold

FRED
GOLDAMGBD228NLBM
Daily
Real yield proxy (inverse), fear/uncertainty hedge, inflation hedge in some regimes.

##### Copper/Gold Ratio

Derived
Copper / Gold
Daily
Risk appetite proxy. Rising = growth optimism (copper bid). Falling = defensive (gold bid).

##### Bloomberg Commodity Index

Bloomberg
BCOM
Daily
Broad commodity basket. Trend reflects global growth and inflation dynamics.

##### Natural Gas

FRED
DHHNGSP
Daily
Energy/heating proxy. Highly seasonal and regional. European gas (TTF) matters for EU inflation.

#### Building a Data Pipeline

The data sources above are the raw materials. Turning them into a functional macro dashboard requires:

- **Data ingestion:** Automated pulls from FRED, Bloomberg, or alternative sources (Python, R, APIs)

- **Normalization:** Z-scores, percentile ranks, or regime-adjusted levels for cross-variable comparison

- **Aggregation:** Composite indicators (e.g., financial conditions index) that summarize multiple variables

- **Visualization:** Dashboards that surface the signal from the noise

- **Alerting:** Threshold-based alerts for significant moves or divergences

This infrastructure is essential for systematic implementation. The Data Modelling section will cover practical approaches to building these systems.

#### Section Summary

- **Tiered data architecture:** Policy → Rates → Credit → FX → Vol → Commodities

- **FRED provides free access to most key series** — Bloomberg for some credit/vol data

- **This is structure, not a daily checklist** — build systems that monitor and alert

- **Quantitative infrastructure is required** — manual monitoring doesn't scale

Growth Scare
Inflation Scare
Fed Pivot (Dovish)
### Reading Divergences

When asset classes *disagree*, someone is wrong — or there's information you're missing:

**Equities rallying + Credit widening:** Credit is warning that equity rally is fragile. Credit investors see risks equity investors are ignoring. Historically, credit is often right at turning points.

**Yields falling + Equities flat:** Bonds pricing growth fear that equities haven't acknowledged. Either bonds are overreacting, or equities will catch down.

**JPY strengthening + Equities rallying:** Safe-haven currency moving against risk narrative. Possible intervention, positioning unwind, or early warning of risk-off.

Divergences don't tell you what to do — they tell you to investigate. Why are markets disagreeing? What would resolve the divergence?

#### Quantitative Implementation Note

Lead-lag relationships can be tested rigorously through:

- **Cross-correlation analysis:** ρ(X_t, Y_{t+lag}) for various lags to identify optimal lead time

- **Granger causality tests:** Does past X improve forecasts of Y beyond Y's own history?

- **Vector Autoregression (VAR):** Model multi-asset dynamics simultaneously

- **Rolling window analysis:** Test stability of lead-lag relationships across regimes

**Critical finding from research:** Lead-lag relationships are often stronger at regime turning points than during stable trends. The signal is most valuable precisely when it's hardest to trust — during transitions. This is where systematic testing adds value over discretionary judgment.

#### Section Summary

- **Information flows through markets in sequence:** Rates → FX → Credit → Equities

- **Lead-lag relationships reflect market structure** — who participates and how fast they process

- **Confirmation builds conviction:** More asset classes agreeing = higher confidence

- **Divergences require investigation:** They signal mispricing, transition, or missing information

5
## Correlation Regimes

One of the most dangerous assumptions in portfolio management is that correlations are stable. They're not. Correlations shift dramatically across macro regimes, and the diversification you think you have can evaporate precisely when you need it most.

**The 2022 Lesson:** For decades, stocks and bonds were negatively correlated — when stocks fell, bonds rallied, providing a hedge. In 2022, both fell together as inflation forced the Fed to hike into weakness. The "diversified" 60/40 portfolio had its worst year since the 1970s. Correlation assumptions built on 40 years of falling inflation broke when the regime changed.

### Stock-Bond Correlation: The Big One

The stock-bond correlation is the most important cross-asset relationship for portfolio construction:

| Regime | Stock-Bond Correlation | Why |
| **Growth-driven** | Negative | Growth fears → stocks down, bonds up (flight to safety) |
| **Inflation-driven** | Positive | Inflation → both stocks and bonds down (rates up hurts both) |
| **Liquidity crisis** | Variable → 1 | Initially diverge, then converge as everything sells |

The key question isn't "are stocks and bonds diversifying?" but "what's driving markets right now — growth fears or inflation fears?" The answer determines whether your bond allocation helps or hurts.

### The "Correlation 1" Crisis

In extreme stress, correlations converge toward 1 — everything falls together:

Phase 1: Idiosyncratic
Early stress. Some assets fall, others hold. Diversification "works."

Phase 2: Contagion
Selling spreads. Correlations rise. "Uncorrelated" assets start moving together.

Phase 3: Liquidation
Forced selling. Margin calls. Everything sold regardless of fundamentals. Correlation → 1.

Phase 4: Stabilization
Selling exhausted. Policy response. Correlations begin normalizing.

March 2020 was a textbook example: stocks, credit, even Treasuries briefly sold off together as the world scrambled for cash.

Stock-Bond Correlation: Regime Shifts (Illustrative)
60-day rolling correlation between S&P 500 and 10Y Treasury returns
[CANVAS chart]
### Monitoring Correlation Regimes

Key relationships to track for regime identification:

| Relationship | Normal Range | Warning Signal |
| **SPX vs 10Y Treasury** | -0.3 to +0.1 | Sustained positive correlation > +0.3 (inflation regime) |
| **SPX vs HY Credit** | +0.6 to +0.8 | Correlation breakdown (credit leading divergence) |
| **Gold vs Real Yields** | -0.5 to -0.8 | Breakdown of inverse relationship (haven bid dominating) |
| **DXY vs Risk Assets** | -0.3 to -0.5 | Strong positive correlation (dollar funding crisis) |

#### Quantitative Implementation Note

Correlation monitoring requires careful methodology:

- **Rolling windows:** 20-60 day windows for tactical, 120-252 day for strategic. Shorter windows are noisier but more responsive.

- **Exponentially weighted:** EWMA correlations give more weight to recent observations. Decay factor (λ) of 0.94 is common.

- **Regime-conditional:** Separate correlation estimates by identified regime (e.g., VIX > 25 vs VIX < 20).

- **Stress testing:** Use historical crisis periods to estimate "stress correlations" for risk management.

Exponentially Weighted Correlation
#### Section Summary

- **Correlations are not stable** — they shift dramatically across regimes

- **Stock-bond correlation depends on what's driving markets** — growth fears (negative) vs inflation fears (positive)

- **In crisis, correlations converge to 1** — diversification fails when you need it most

- **Monitor correlation regimes actively** — don't assume historical relationships will persist

6
## Case Study: The 2022 Cross-Asset Bear Market

2022 was a masterclass in cross-asset dynamics. The Federal Reserve's aggressive tightening to combat inflation triggered a coordinated selloff across nearly all asset classes. Understanding how this unfolded — and what signals were available at each stage — illustrates the frameworks we've discussed.

📉
#### 2022: When Diversification Failed

January 2022 — October 2022
##### The Setup (Late 2021)

By late 2021, the warning signs were visible to those watching the full capital structure:

- **Breakeven inflation** surging to multi-decade highs (5Y breakeven hit 3.2%)

- **Real yields** deeply negative (-1.0% on 10Y TIPS) — unsustainably stimulative

- **Fed rhetoric** shifting from "transitory" to acknowledging persistent inflation

- **Curve dynamics:** Bear flattening as front-end priced hikes, long-end lagged

**The regime:** Transitioning from Goldilocks to Reflation, with Stagflation risk rising.

##### The Information Cascade

November 2021
##### Fed Pivots Hawkish

Powell retires "transitory" framing. 2Y yields begin their ascent from 0.5% toward 1.0%. This was the first domino. Equity markets initially ignored it.

January 2022
##### Rates Accelerate, Equities Break

2Y yields surge past 1%. 10Y real yields flip from -1.0% toward 0%. Nasdaq enters correction. Growth stocks (long-duration assets) lead the decline — exactly as duration math predicts.

March 2022
##### First Hike + Ukraine

Fed hikes 25bps. Ukraine war adds commodity/inflation shock. Oil spikes to $130. Breakevens surge further. Curve inverts (2s10s goes negative in April). Full stagflation scare.

May-June 2022
##### Acceleration

Fed hikes 50bps, then 75bps. 2Y yields hit 3%. Real yields flip positive for first time since 2019. Credit spreads widen (HY from 300 to 500+). Stock-bond correlation firmly positive — both falling together.

September-October 2022
##### Peak Stress

2Y yields peak near 4.5%. 10Y real yields hit 1.7%. USD (DXY) peaks above 114. UK gilt crisis adds global financial stability fears. MOVE index spikes. S&P 500 hits cycle lows (-27% from peak).

##### Cross-Asset Confirmation at Each Stage

| Signal | Late 2021 | Mid 2022 | Oct 2022 (Lows) |
| **2Y Yield** | Rising (0.5% → 1.0%) | Surging (1.5% → 3.5%) | Peaking (~4.5%) |
| **Real Yields** | Deeply negative (-1.0%) | Flipping positive | Peak (+1.7%) |
| **Curve (2s10s)** | Flattening | Inverted (-0.5%) | Deeply inverted |
| **HY Spreads** | Tight (~300bps) | Widening (~500bps) | Elevated (~550bps) |
| **USD (DXY)** | Strengthening | Surging | Peak (114) |
| **Stock-Bond Corr** | Turning positive | Firmly positive (+0.5) | Positive |

##### What Worked in 2022

- **Short duration:** Underweight bonds, especially long-dated

- **Long commodities (early):** Energy outperformed massively through June

- **Long USD:** Dollar strength was relentless

- **Long volatility:** VIX and MOVE both elevated

- **Value over Growth:** Energy and financials vs tech

- **Cash:** Rising short rates made cash competitive

##### What Failed in 2022

- **60/40 portfolio:** Both stocks and bonds fell — worst year in decades

- **Risk parity:** Leveraged bond exposure amplified losses

- **Growth stocks:** Long-duration assets crushed by rising real yields

- **"TINA" (There Is No Alternative):** Cash became an alternative

- **EM assets:** Dollar strength devastated EM equities and FX

##### The Key Lesson

Every signal was visible in the cross-asset data — if you were watching. The sequence followed the playbook: rates led, FX confirmed, credit warned, equities followed. The stock-bond correlation flip was THE signal that diversification assumptions had broken. Those watching only equities were blindsided. Those watching the full capital structure had months of warning.

#### Systematic Lessons from 2022

2022 validated several systematic approaches:

- **Regime-conditional allocation:** Systems that detected the inflation regime shift and adjusted correlations accordingly outperformed

- **Trend-following:** CTA strategies that followed bond and equity trends (short) performed well

- **Real yield signals:** Simple rules based on real yield levels/direction would have flagged the growth-to-value rotation

- **Carry-adjusted positioning:** As short rates rose, cash carry became competitive, justifying defensive positioning

**The edge wasn't prediction — it was systematic response to observable signals.**

7
## Case Study: The Q4 2023 Everything Rally

If 2022 showed how cross-asset analysis warns of danger, Q4 2023 showed how it confirms opportunity. The "everything rally" from late October 2023 through year-end was one of the most coherent cross-asset rallies in years — and the signals built systematically.

📈
#### Q4 2023: Peak Coherence

October 2023 — December 2023
##### The Setup (Summer-Fall 2023)

By mid-2023, markets were caught between competing narratives:

- **Inflation declining:** CPI falling from 9% toward 3%, but core sticky

- **Labor market resilient:** Unemployment near lows, wages elevated

- **Fed pausing:** Last hike in July 2023, but "higher for longer" messaging

- **Recession fears:** Curve deeply inverted, but no recession materializing

**The debate:** Soft landing (Goldilocks) vs delayed hard landing (Deflation). Markets were uncertain — coherence was low.

##### The October Trough

In October 2023, markets hit a local trough:

- **10Y yields** spiked to 5% (term premium + supply fears + resilient data)

- **S&P 500** pulled back ~10% from July highs

- **Credit spreads** widened modestly but remained contained

- **VIX** elevated but not panicked (~20)

Crucially, this was a **rates-driven selloff, not a credit-driven selloff**. HY spreads didn't blow out. Credit was not confirming a hard landing. This divergence was informative.

##### The Pivot (Late October - November)

October 27, 2023
##### PCE Inflation Prints Soft

Core PCE continues declining. Inflation narrative shifting decisively toward "mission accomplished."

November 1, 2023
##### FOMC Holds, Tone Softens

Fed holds rates, Powell's tone less hawkish than feared. "Proceed carefully" language. Market interprets as peak rates.

November 3, 2023
##### Rates Collapse

Weak payrolls report. 10Y yield drops from 4.9% toward 4.5% in days. Front-end rallies hard. Duration trade ON.

November-December 2023
##### Everything Rally

All asset classes confirm simultaneously: bonds rally, credit tightens, equities surge, USD weakens, vol collapses. Maximum coherence.

##### Cross-Asset Confirmation

| Asset Class | October Lows | Year-End | Signal |
| **10Y Yield** | ~5.0% | ~3.9% | Confirming (falling) |
| **2Y Yield** | ~5.2% | ~4.2% | Confirming (falling) |
| **HY Spreads** | ~450bps | ~330bps | Confirming (tightening) |
| **S&P 500** | ~4,100 | ~4,770 | Confirming (rallying) |
| **DXY** | ~107 | ~101 | Confirming (weakening) |
| **VIX** | ~21 | ~12 | Confirming (falling) |
| **Gold** | ~$1,820 | ~$2,060 | Confirming (real yields falling) |

##### The Coherence Signal

What made Q4 2023 notable was the **coherence**:

- Rates falling → Equities rallying (consistent)

- Credit tightening → Equities rallying (consistent)

- USD weakening → Risk assets rallying (consistent)

- Vol falling → Risk assets rallying (consistent)

- Real yields falling → Gold rallying (consistent)

Every asset class was telling the same story: soft landing, Fed pivot coming, risk-on. When coherence is this high, the trend tends to persist.

##### What Worked in Q4 2023

- **Long duration:** Bonds rallied sharply as yields fell 100+ bps

- **Long credit:** Spreads tightened, carry was positive

- **Long equities:** Broad rally, growth and small caps led

- **Short vol:** VIX crushed from 20 to 12

- **Short USD:** Dollar weakness benefited international exposure

- **Long gold:** Real yield collapse drove gold higher

##### The Key Lesson

**Coherence is a signal.** When all asset classes are telling the same story, the risk of being wrong is lower. The sequencing was textbook: rates moved first (FOMC + data), then credit confirmed (no stress), then FX confirmed (USD weak), then equities followed. Those waiting for "certainty" missed the move. Those tracking cross-asset coherence had early confirmation.

8
## Case Study: March 2023 Banking Stress

The March 2023 regional banking crisis offers a different lesson: how cross-asset signals can **provide early warning of stress** and how quickly regimes can shift. It also shows how policy response can rapidly restore stability.

🏦
#### March 2023: The SVB Crisis

March 8-15, 2023
##### The Setup

By early March 2023:

- **Fed still hiking:** Another 25-50bps expected at March FOMC

- **Yields elevated:** 2Y near 5%, 10Y near 4%

- **Bank portfolios underwater:** HTM bond portfolios had massive unrealized losses from 2022 rate surge

- **Regional banks vulnerable:** Concentrated deposit bases, duration mismatch, less diversified than large banks

##### The Cascade (5 Days)

March 8 (Wednesday)
##### Silvergate Announces Liquidation

Crypto-focused bank winds down. Market treats as idiosyncratic. Regional bank stocks dip but limited contagion.

March 9 (Thursday)
##### SVB Stock Collapses

Silicon Valley Bank discloses $1.8B loss on bond portfolio sale, announces capital raise. Stock drops 60%. **Credit markets react:** Regional bank CDS spikes. This was the early warning.

March 10 (Friday)
##### SVB Fails — Bank Run

FDIC seizes SVB after $42B deposit outflow in one day. Largest bank failure since 2008. **Cross-asset response:** 2Y yields collapse 50bps in a day. Flight to safety. Regional bank stocks crater.

March 12 (Sunday)
##### Fed Emergency Response

Signature Bank closed. Fed announces Bank Term Funding Program (BTFP) — banks can borrow against underwater bonds at par. Full deposit guarantee. Policy firewall erected.

March 13-15
##### Stabilization + Aftershocks

Initial stabilization, but First Republic concerns persist. Credit Suisse collapses (separate issue, but sentiment overlap). Fed still hikes 25bps on March 22 — threading the needle.

##### The Cross-Asset Signals

| Signal | Pre-Crisis (Mar 8) | Peak Stress (Mar 13) | Post-Response (Mar 20) |
| **2Y Yield** | 5.05% | 3.98% (-107bps!) | 4.17% |
| **10Y Yield** | 3.97% | 3.55% | 3.60% |
| **Fed Funds Expectations** | +50bps priced | Cuts priced for 2023 | +25bps priced |
| **Regional Bank ETF (KRE)** | $58 | $40 (-30%) | $42 |
| **HY Spreads** | ~450bps | ~520bps | ~480bps |
| **MOVE Index** | ~120 | ~180 (spiked before VIX) | ~140 |
| **VIX** | ~19 | ~26 | ~22 |

##### Key Observations

- **Credit led:** Regional bank CDS and subordinated debt moved before equity on March 9. Credit investors saw the risk first.

- **MOVE led VIX:** Rate volatility spiked before equity volatility — this was fundamentally a rates/duration crisis.

- **2Y move was historic:** The 3-day drop in 2Y yields was one of the largest ever — pricing emergency cuts.

- **Flight to quality:** Classic deflation-scare playbook — long duration, short credit, defensive equities.

- **Policy response mattered:** BTFP announcement arrested the panic. Cross-asset normalization followed within days.

##### The Key Lesson

This crisis illustrated several framework principles: (1) **credit leads at stress points** — bank CDS moved before stock; (2) **MOVE can lead VIX** when the crisis is rates-driven; (3) **regime shifts can be violent and fast** — the move from "hiking" to "emergency cuts priced" happened in 48 hours; (4) **policy response matters** — the Fed's backstop rapidly restored confidence.

For systematic approaches, the lesson is that **crisis signals must be monitored in real-time**. A weekly review wouldn't have caught this — it unfolded over days. Automated alerts on credit stress, rate vol, and inversion would have flagged the dislocation immediately.

9
## Expressing Views Across the Capital Structure

A core institutional skill is recognizing that the **same macro view can be expressed in multiple ways** across the capital structure — each with different risk profiles, convexity, carry, and liquidity characteristics. Choosing the right expression is as important as having the right view.

### Example: "Fed Will Cut Rates Sooner Than Expected"

How might an institutional investor express this view?

| Expression | Instrument | Risk Profile | Carry | Convexity |
| **Direct rates** | Long 2Y Treasuries | Low vol, clean expression | Positive (coupon) | Low |
| **Curve** | 2s10s steepener | Lower vol than outright | Often negative | Low |
| **Rate options** | Receiver swaptions | Defined risk, asymmetric | Negative (premium) | High |
| **FX** | Short USD/Long EUR | Higher vol, rate diff sensitive | Variable | Low |
| **Equity** | Long growth stocks (QQQ) | High vol, many other factors | Low/variable | Low |
| **Equity options** | Long QQQ calls | Defined risk, levered upside | Negative (premium) | High |
| **Gold** | Long GLD | Real yield proxy | Zero | Low |

**The institutional choice:** If conviction is high and time horizon is short, direct 2Y or front-end rate options offer the cleanest expression. If conviction is moderate and time horizon is longer, a steepener or long gold might offer better risk-adjusted returns. Equities are the noisiest expression — many factors beyond rates affect them.

### Factors in Choosing Expression

- **Conviction level:** High conviction → direct expression. Lower conviction → relative value or optionality.

- **Time horizon:** Shorter horizon → liquid instruments. Longer horizon → can tolerate illiquidity premium.

- **Risk budget:** Limited risk budget → options for defined risk. Larger budget → cash instruments.

- **Carry profile:** Can you afford negative carry while waiting? If not, avoid options.

- **Correlation to existing book:** Does this add new risk or compound existing exposures?

- **Liquidity needs:** How quickly might you need to exit? Size accordingly.

### The "Cleanest" Expression

The cleanest expression is the one most directly tied to your thesis with the fewest confounding factors:

**View: "Inflation will surprise higher"** Cleanest: Long breakevens (TIPS vs nominals) Noisier: Short bonds, long commodities, long value

**View: "Credit stress coming"** Cleanest: Long CDX HY protection (short credit) Noisier: Short equities, long VIX, long quality factor

**View: "Dollar will weaken"** Cleanest: Short DXY, long EUR/USD Noisier: Long EM equities, long gold, long commodities

#### Quantitative Implementation Note

Systematic macro strategies often implement views through multiple expressions simultaneously, weighted by:

- **Signal strength:** Stronger signal → larger allocation to highest-conviction expression

- **Risk contribution:** Size positions so each contributes similar risk (vol-adjusted sizing)

- **Correlation:** Diversify across less-correlated expressions of the same view

- **Cost:** Consider transaction costs, funding costs, and carry in position sizing

Vol-Adjusted Position Size
#### Section Summary

- **Same view, multiple expressions:** Choose based on conviction, horizon, risk budget, and carry

- **Cleanest expression minimizes confounding factors** — most direct link to thesis

- **Options provide convexity but cost carry** — use when timing uncertain but direction confident

- **Equities are usually the noisiest expression** — many factors beyond your macro thesis

10
## Implementation Reality — Where Edge Actually Lives

This lesson has presented the **intellectual framework** for cross-asset analysis. But understanding the framework and profiting from it are very different things. This section addresses the gap between theory and implementation — and points toward how that gap can be bridged.

**The Hard Truth:** Reading cross-asset signals and trading them profitably on a discretionary, daily basis is extremely difficult. Markets are highly efficient at short horizons. Most retail traders (and many professionals) who try to "trade the macro" lose money. The framework we've presented is how institutions *think* — but their edge comes from infrastructure, time horizon, and systematic implementation that most individuals cannot replicate.

### Why Daily Discretionary Macro Is Hard

- **Information is priced fast:** By the time you see a signal, so has everyone else. Intraday edge requires speed you don't have.

- **Noise dominates at short horizons:** Daily moves are mostly noise. Signal emerges over weeks and months.

- **Behavioral biases compound:** Overtrading, confirmation bias, recency bias all hurt discretionary traders.

- **Transaction costs matter:** Frequent trading erodes returns, especially in less liquid instruments.

- **Narrative is seductive:** It's easy to construct a "story" for any move post-hoc. Doesn't mean it's tradeable.

### Where Edge Can Exist

- **Longer time horizons:** Weeks to months, where behavioral biases and structural flows create opportunities.

- **Systematic implementation:** Rules-based strategies that remove emotion and enforce discipline.

- **Superior data/infrastructure:** Seeing the same signals faster or in higher resolution.

- **Capacity to hold:** Ability to withstand drawdowns that force others out.

- **Structural advantages:** Access to markets, leverage, or information that others lack.

**The Retail Edge:** Ironically, retail traders have one structural advantage: no benchmark, no redemptions, no career risk. You can be patient and hold positions through volatility that would get a fund manager fired. Use this.

#### The Case for Systematic Implementation

The cross-asset signals we've discussed are **testable**. Rather than trading them discretionarily, they can be formalized into systematic strategies:

- **Regime identification models:** Classify the current regime using macro indicators, then allocate according to historical regime performance.

- **Trend-following across asset classes:** Systematically follow price trends in rates, FX, commodities, and equities.

- **Carry strategies:** Harvest carry in FX and fixed income with systematic rules for when to exit.

- **Relative value models:** Trade mean-reversion in relationships like stock-bond correlation, credit-equity spreads.

- **Risk-parity with regime adjustment:** Dynamic allocation based on regime-conditional correlations.

Each of these can be backtested, validated out-of-sample, and stress-tested. This doesn't guarantee future performance — but it does provide **evidence** beyond narrative.

### What the Data Modelling Section Will Cover

We've deliberately stopped short of implementation details in this lesson. The Data Modelling section of the curriculum will cover:

- **Building data pipelines:** Automated ingestion from FRED, alternative data sources

- **Signal construction:** Turning raw data into tradeable signals with proper normalization

- **Backtesting rigorously:** Walk-forward testing, avoiding lookahead bias, transaction cost modeling

- **Regime detection:** HMM models, rule-based classification, ensemble approaches

- **Portfolio construction:** Combining signals, correlation-aware sizing, risk budgeting

- **Monitoring and execution:** Alert systems, rebalancing rules, slippage estimation

The frameworks in this lesson are the *what* — the Data Modelling section is the *how*.

#### A Realistic Path Forward

For most readers, the realistic application of this content is:

- **Education:** Understand how institutional investors think about cross-asset dynamics.

- **Context:** Use the framework to interpret market moves, even if not trading them directly.

- **Longer-horizon positioning:** Inform medium-term allocation decisions (months, not days).

- **Systematic testing:** If you want to trade these signals, build and test systematic strategies first.

- **Humility:** Recognize the limits of discretionary macro trading at retail scale.

This isn't defeatism — it's realism. The cross-asset framework is genuinely valuable. But value comes from proper application, not from thinking you can out-trade Goldman Sachs on a daily basis.

#### Section Summary

- **Understanding the framework ≠ profitable trading** — implementation is where edge lives or dies

- **Daily discretionary macro is extremely hard** — markets are efficient at short horizons

- **Edge exists at longer horizons with systematic implementation**

- **The Data Modelling section will cover practical implementation**

- **Use this framework for context and medium-term positioning** — not daily trading

### Key Takeaways

🏛️
#### Trade the Capital Structure, Not Single Assets

Institutional investors view the full capital structure. The same macro view has multiple expressions with different risk/reward profiles.

🔄
#### Information Flows in Sequence

Rates → Credit → FX → Equities. Understanding where you are in the cascade determines what's priced and what isn't.

📊
#### Regimes Determine Allocation

Growth × Inflation defines four regimes, each with distinct asset allocation implications. Detect transitions early.

🔗
#### Correlations Are Variables, Not Constants

The stock-bond correlation flips between regimes. Diversification assumptions can fail exactly when you need them most.

✅
#### Coherence Builds Conviction

When all asset classes tell the same story, conviction is high. Divergences require investigation — someone is wrong.

⚡
#### Credit Leads at Turning Points

Credit investors are skeptical and focused on downside. Credit signals often precede equity moves at stress points.

🛠️
#### Infrastructure Enables Edge

Systematic data pipelines, alerting systems, and quantitative testing are required for implementation — not just understanding.

⏱️
#### Time Horizon Is Your Edge

Daily discretionary macro is extremely difficult. Edge exists at longer horizons with systematic implementation and patience.
