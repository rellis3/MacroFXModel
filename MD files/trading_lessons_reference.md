# TRADING LESSONS REFERENCE GUIDE
## Institutional-Level Cross-Asset Trading Framework

**Purpose**: This document summarizes 6 advanced trading lessons covering systematic macro trading, cross-asset analysis, and quantitative model building. Use this as context for discussions about trading strategies, model development, and market analysis.

---

## LESSON 1: MARKET STRUCTURE & SYSTEMATIC TRADING

### Core Concepts

**Signal-to-Noise Ratio (SNR)**
- SNR = Signal Power / Noise Power
- SNR < 1: Noise dominates (short-term trading extremely difficult)
- SNR > 1: Exploitable patterns exist (longer holding periods)
- **Key Insight**: Shorter time horizons have lower SNR + higher transaction costs = compounding disadvantage

**Two Trading Approaches**

1. **Systematic Practitioner**
   - Hypothesis → In-sample testing → Out-of-sample validation → Walk-forward analysis → Paper trading → Live deployment
   - Tests 50+ strategies/year, risks $0 during validation
   - Knows all metrics BEFORE deploying capital: CAGR, Sharpe, max drawdown, win rate, expectancy

2. **Intuition-Based Trader**
   - Hypothesis → Immediate live trading
   - Tests 2-3 strategies/year, risks 100% of capital from day one
   - Discovers strategy characteristics through live P&L losses
   - Average 6 months to invalidate failed strategy (-22% typical loss)

**The Validation Funnel**
- Systematic: 52 hypotheses → 34 pass in-sample → 13 pass out-of-sample → 6 pass walk-forward → 4 deployed live
- Result: 48 bad strategies rejected safely, capital preserved

**Key Metrics to Know Pre-Deployment**
- CAGR, Sharpe Ratio, Sortino Ratio, Maximum Drawdown, Drawdown Duration
- Win Rate, Profit Factor, Max Consecutive Losses, Expectancy, Calmar Ratio, Tail Ratio

**Critical Takeaway**: Extend holding periods to improve SNR, validate systematically before risking capital, understand that most hypotheses fail (the edge is discovering failure cheaply).

---

## LESSON 2: WHAT MOVES MARKETS

### The Capital Flow Hierarchy
Information flows top-down through markets in predictable sequences:

1. **Central Banks** (Policy Source) → Hours lag
2. **Sovereign Bonds** (Yield Curves) → Days lag  
3. **FX Markets** (Rate Differentials) → Weeks lag
4. **Equity Indices** (Risk Premia) → Months lag
5. **Credit Markets** (Spread Products) → Quarters lag

**Key Insight**: Trading equities without watching bonds/FX = trading effects while institutions trade causes.

### Interest Rate Mechanics

**Rate Differential Formula**
- Carry Return = Interest Rate Differential − Hedging Cost
- Money flows to highest risk-adjusted return
- 2-year yields are most policy-sensitive (track these for FX forecasting)

**When Rates Rise (Tightening)**
- Domestic currency strengthens
- Bond prices fall
- Growth stocks underperform (higher discount rate)
- Value/banks outperform (margin expansion)
- Gold pressured (higher real rates)
- EM assets face outflows

**When Rates Fall (Easing)**
- Domestic currency weakens
- Bond prices rise
- Growth stocks outperform
- Value/banks underperform
- Gold supported
- EM assets see inflows

**Critical Spreads to Monitor**
- 2Y-10Y: Yield curve slope (inversion → recession signal)
- US-DE 2Y: EUR/USD driver
- HY-IG: Credit risk appetite
- OIS-SOFR: Funding stress

### Risk Regime Dynamics

**Risk-On Environment**
- VIX < 18, credit spreads tightening
- Equities rally, AUD/JPY rises
- EM outperforms DM
- Carry trades profitable

**Risk-Off Environment**  
- VIX > 25, credit spreads widening
- Safe havens (USD, JPY, CHF) strengthen
- Risk currencies (AUD, NZD, EM) weaken
- Carry trades unwind violently

**Correlation Shifts**
- Normal markets: 0.2-0.4 cross-asset correlation
- Stressed markets: 0.8-1.0 (diversification fails)
- Crisis mode: Everything falls together

### Central Bank Liquidity

**Net Liquidity Formula**
```
Net Liquidity = Fed Balance Sheet − TGA − RRP
```

- Rising net liquidity = risk asset tailwind
- Falling net liquidity = risk asset headwind
- QE: Balance sheet expansion → asset prices rise
- QT: Balance sheet contraction → asset prices pressured

**Key Source**: H.4.1 report (Thursdays 4:30 PM ET)

### Institutional Flow Calendar

**Month-End Rebalancing**
- Pension funds rebalance to target allocations (e.g., 60/40)
- Strong equity month → selling pressure last 2-3 days
- Avoid chasing breakouts on days 29-31

**Options Expiration (3rd Friday)**
- Pin risk: Prices gravitate toward high open interest strikes
- Gamma effects amplify moves
- OpEx week dominated by hedging flows, not information

**Seasonal Patterns**
- September: Historically weakest month
- November-December: Year-end rally tendency

### Positioning Data

**CFTC COT Report (Fridays)**
- Extreme long positioning → vulnerable to negative catalysts
- Extreme short positioning → vulnerable to squeezes
- GameStop 2021: 140% short interest created explosive squeeze

**Key Principle**: News explains moves AFTER they happen. Positioning shows you stored energy BEFORE it's released.

---

## LESSON 3: CENTRAL BANK POLICY

### Federal Reserve Structure

**FOMC Composition**
- 12 voting members: 7 Governors (permanent) + 5 Regional Presidents (rotating)
- NY Fed President always votes (market operations role)
- Chair's view dominates, but committee composition matters

**Dual Mandate**
1. Maximum Employment (u* = natural rate, ~4-5%)
2. Price Stability (2% PCE inflation target, average inflation targeting since 2020)

**Hawk-Dove Spectrum**
- Hawks: Prioritize inflation, quicker to raise rates
- Doves: Prioritize employment, slower to raise rates
- Track who's voting each year for net committee bias

### FOMC Communication Cycle

**Timeline**
- T-14 to T-10: Blackout period begins (pre-blackout speeches matter most)
- T-1: Meeting Day 1 (no announcement)
- T-Day 2:00 PM: Statement released (compare word-by-word to previous)
- T-Day 2:30 PM: Press conference (less scripted, more revealing)
- T+3 weeks: Minutes released (look for "several" vs "most" vs "all")

**Reading the Statement**
- "Some further" → "further": Hawkish (more tightening)
- "Monitoring" → "closely monitoring": Dovish (concern rising)
- "Gradual" → "patient": Dovish (slower pace)
- Use text diff tools to compare statements—changes are the signal

### The Dot Plot (SEP)

**What It Shows**
- Each FOMC participant's projection for Fed Funds rate at year-end + longer run
- Released quarterly (Mar, Jun, Sep, Dec)
- Median dot gets media focus, but dispersion matters more

**Critical Reality**
- Dots are CONDITIONAL projections, not forecasts
- Dots have poor predictive accuracy (2021 dots showed 0% through 2024; actual was 4%+)
- Use for understanding current Fed thinking, not for forecasting actual rates

**How to Use**
- Compare dots to market pricing (CME FedWatch tool)
- Dots > Market = Fed more hawkish than priced → yields rise
- Dots < Market = Fed more dovish than priced → yields fall
- Watch dispersion: Wide range = uncertainty

### Fedspeak Decoder

| Phrase | Actual Meaning |
|--------|----------------|
| "Inflation remains elevated" | Hawkish—tightening continues |
| "Inflation has eased" | Dovish—may slow tightening |
| "Committed to returning to 2%" | Hawkish—no pivot coming |
| "Seeing effects of policy actions" | Dovish—tightening working |
| "Labor market remains tight" | Hawkish—wage pressure concern |
| "Labor market coming into balance" | Dovish—cooling appropriately |
| "Prepared to raise further if appropriate" | Hawkish—door open |
| "Can proceed carefully" | Dovish—slowing pace |

**"Data Dependent" Decoder**
- Standard disclaimer = doesn't signal anything
- "Particularly attentive to data" = next prints heavily influence decision
- "Need to see more evidence" = current data insufficient to change course

### Balance Sheet Mechanics

**QE (Quantitative Easing)**
1. Fed creates reserves, buys bonds from primary dealers
2. Dealers receive cash → deploy into risk assets
3. Asset prices rise, yields compress

**QT (Quantitative Tightening)**
1. Fed lets bonds mature without replacing (or actively sells)
2. Private sector must absorb supply
3. Reserves drain, liquidity tightens
4. Headwinds for risk assets

**Key Source**: H.4.1 weekly balance sheet report (Thursdays)

### Other Major Central Banks

**ECB (European Central Bank)**
- Single mandate: Price stability (2% inflation)
- Must manage fragmentation across 20 economies
- 8 meetings/year

**BoJ (Bank of Japan)**
- Yield Curve Control (YCC): Targets 10Y yield in band around 0%
- Decades of deflation → structurally dovish
- Owns ~50% of Japanese government bonds
- YCC adjustments cause extreme JPY volatility

**BoE (Bank of England)**
- Dual mandate like Fed
- Stagflation risk (high inflation + weak growth)
- Less firepower than Fed/ECB

**PBoC (People's Bank of China)**
- Different tools: Reserve Requirement Ratio (RRR), administered rates
- Manages CNY through daily fixing
- China stimulus matters globally (commodity demand, EM flows)

### Trading Around Fed Events

**Pre-FOMC**
- Week before: Volatility compression ("calm before storm")
- Reduce gross exposure if no edge on outcome
- Define scenarios and position sizes in advance

**Announcement Window (2-Phase Reaction)**
- Phase 1 (2:00-2:05 PM): Algorithmic, keyword-based (often wrong)
- Phase 2 (2:05-4:00 PM): Human digestion during presser (more reliable)
- **Don't chase Phase 1 spike—wait for presser**

**Post-FOMC**
- Day 1: High volatility, often reversals
- Days 2-3: Direction becomes clearer
- Week 2-3: Minutes can cause secondary move

**When to Follow vs Fade**
- Follow: Genuine surprise, language shift, cross-asset confirmation, persists through presser
- Fade: As expected but overreaction, reversal during presser, no cross-asset confirmation

---

## LESSON 4: FIXED INCOME FUNDAMENTALS

### Bond Math Essentials

**Fundamental Law**
- Price ↑ ⟷ Yield ↓ (inverse relationship, always)
- When market rates rise → existing bond prices fall
- When market rates fall → existing bond prices rise

**Key Terms**
- Face Value (Par): Typically $1,000 (100%)
- Coupon: Annual interest payment (% of face value)
- Yield to Maturity (YTM): Total return if held to maturity
- Price quotes: 95 = discount, 100 = par, 105 = premium

### Duration: Interest Rate Sensitivity

**Rule of Thumb**
```
Price Change ≈ −Duration × Yield Change
```

**Duration by Maturity**
- 2-Year Treasury: Duration ~2 (1% yield rise = ~2% price fall)
- 10-Year Treasury: Duration ~8 (1% yield rise = ~8% price fall)  
- 30-Year Treasury: Duration ~18 (1% yield rise = ~18% price fall)

**Growth Stocks Have Duration**
- Value comes from distant future earnings
- High rates discount future cash flows more
- Growth stocks behave like long-duration bonds
- 2022 example: Rates rose 2.5% × duration 8 ≈ 20% bond loss

### The Yield Curve

**Four Shapes**

1. **Normal (Upward Sloping)**
   - Longer rates > short rates
   - Healthy economy expected
   - Growth/inflation anticipated

2. **Flat**
   - Short and long rates similar
   - Uncertainty about direction
   - Transition phase

3. **Inverted**
   - Short rates > long rates
   - **Recession signal** (preceded every US recession in 50+ years)
   - Market expects Fed will be forced to cut
   - Lead time: 6-24 months (variable)

4. **Humped**
   - Middle rates highest
   - Rare, policy transition

**Key Spreads**
- **2s10s** (2Y-10Y): Most watched, negative = inverted
- **3M-10Y**: Fed's preferred recession indicator
- **2s30s**: Captures very long end

**Curve Dynamics**
- **Bull Steepener**: Short rates fall faster (Fed cuts priced)
- **Bear Steepener**: Long rates rise faster (growth/inflation)
- **Bull Flattener**: Long rates fall faster (flight to quality)
- **Bear Flattener**: Short rates rise faster (Fed tightening, inversion risk)

### Credit Spreads: The Fear Gauge

**What They Measure**
- Extra yield over Treasuries to compensate for default risk
- HY spread = Corporate bond yield − Treasury yield

**Credit Spread Levels (High Yield)**
- Below 300 bps: Very tight, strong risk appetite
- 300-400 bps: Normal range
- 400-500 bps: Elevated, worth monitoring
- 500-700 bps: Stressed, risk-off
- Above 800 bps: Crisis, defaults expected

**Why Credit Leads**
- Bond investors more institutional, macro-focused
- More focused on downside risk
- Credit markets often sniff out trouble before equities
- 2008 example: HY spreads widened summer 2007, equities peaked Oct 2007

**Key Indices**
- CDX IG: 125 investment-grade companies
- CDX HY: 100 high-yield companies
- Liquid and tradeable (professionals watch these closely)

### Real Yields & TIPS

**Real Yield Formula**
```
Real Yield = Nominal Yield − Inflation Expectations
```

**TIPS (Treasury Inflation-Protected Securities)**
- Principal adjusts with inflation
- TIPS yield = direct measure of real yield
- Breakeven Inflation = Nominal Yield − TIPS Yield

**Why Real Yields Matter**
- Opportunity cost of holding non-yielding assets (gold, growth stocks)
- High real yields (2%+): Headwind for gold, growth stocks
- Negative/falling real yields: Tailwind for gold, growth stocks
- 2022: Real yields went from -1% to +1.5% (2.5% swing crushed both gold and growth)

### Yields as FX Driver

**Core Mechanism**
- Money flows to highest risk-adjusted return
- 2Y yield differential is primary FX driver over weeks/months
- US-Japan 2Y spread widening → USD/JPY rises

**Key Rate Differentials**
- EUR/USD: US 2Y − Germany 2Y
- USD/JPY: US 2Y − Japan 2Y  
- GBP/USD: UK 2Y − US 2Y
- AUD/USD: Australia 2Y − US 2Y

**When Rate-FX Relationship Breaks**
- Risk-off panic: Safe havens rally regardless (JPY, CHF)
- Central bank intervention: Can overpower short-term
- Balance of payments crisis: Capital flight dominates
- Extreme positioning: Unwind mechanics dominate

### Bonds Leading Equities

**Why Bonds Lead**
- More institutional participants (central banks, pensions, insurance)
- Focus on downside risk (skeptical by nature)
- Highly liquid (Treasury market among most liquid globally)

**Information Cascade**
1. Policy signals emerge
2. Bond markets react (hours to days)
3. FX markets adjust (days to weeks)  
4. Equity markets reprice (weeks to months)

**MOVE Index: Bond Market VIX**
- Measures Treasury volatility
- Below 80: Low vol, calm
- 80-120: Normal range
- 120-150: Elevated, watch for equity spillover
- Above 150: High stress, equities typically follow

**Pre-Trade Bond Check**
1. What are yields doing? (Rising = headwind for growth stocks)
2. What's the curve saying? (Flattening/inverted = caution)
3. What are credit spreads doing? (Widening = risk-off warning)
4. What's MOVE doing? (Elevated = expect equity vol)
5. Is there divergence? (Bonds warning but stocks rallying = skeptical)

---

## LESSON 5: CURRENCY MARKETS & GLOBAL FLOWS

### FX Market Structure

**Scale**
- ~$7.5 trillion daily volume (largest financial market)
- 24/5 trading: Sydney → Tokyo → London → NYC
- ~88% of trades have USD on one side
- OTC market (decentralized)

**How FX Is Quoted**
- EUR/USD = 1.0850: 1 Euro buys 1.0850 Dollars (EUR strengthening if rises)
- USD/JPY = 150.00: 1 Dollar buys 150 Yen (USD strengthening if rises)

### G10 Currency Characteristics

**Safe Havens** (strengthen in risk-off)
- **USD**: Reserve currency, anti-risk in most regimes
- **JPY**: Ultimate safe haven, funding currency
- **CHF**: Safe haven, current account surplus

**Risk Currencies** (weaken in risk-off)
- **AUD**: Commodity currency, China proxy
- **NZD**: Commodity, agriculture
- **CAD**: Oil proxy
- **NOK**, **SEK**: Commodity/risk-sensitive

**Others**
- **EUR**: ECB policy driven, fragmentation risk
- **GBP**: High beta, BoE sensitive, current account deficit

### What Drives Currencies

**Time Horizon Matters**

| Timeframe | Primary Drivers |
|-----------|----------------|
| Hours-Days | Order flow, sentiment, data surprises (noise-dominated) |
| Days-Weeks | Rate expectations, risk sentiment, positioning |
| **Weeks-Months** | **Rate differentials, policy divergence** ← Sweet spot |
| Months-Years | Current account, PPP valuation, structural flows |

**Key Insight**: 2Y rate differentials explain ~50-80% of major FX pair variance over medium term (varies by regime).

### The Dollar Smile

**Three Regimes**

1. **Left Side: US Exceptionalism**
   - US growth > rest of world
   - Fed more hawkish
   - Rate differentials favor USD
   - → **USD Strong**

2. **Middle: Synchronized Growth**
   - Global growth strong
   - Risk appetite high
   - Carry trades work
   - → **USD Weak**

3. **Right Side: Global Risk-Off**
   - Global panic, VIX spiking
   - Flight to safety
   - → **USD Strong**

**Critical**: Strong dollar doesn't always mean same thing. 2022 = left side (exceptionalism). March 2020 = right side (panic). Implications for risk assets differ.

### Carry Trades

**Mechanics**
- Borrow low-yield currency (JPY at 0.1%)
- Invest in high-yield currency (MXN at 10%)
- Pocket the differential (9.9%)
- Risk: Currency moves can wipe out years of carry in days

**Classic Pairs**
- Funding: JPY, CHF, EUR (low rates)
- Investment: AUD, NZD, EM currencies (high rates)

**Carry Unwind Cascade**
1. Trigger event (risk-off shock, vol spike)
2. Initial selling (some traders close)
3. Spot moves against carry (high-yield currencies weaken)
4. Stop-losses trigger (more forced exits)
5. Cascade (JPY can rally 5-10% in days)

**Key Signal**: Sharp JPY strengthening = carry unwind = warning for all risk positions

### Cross-Currency Basis: Dollar Funding Stress

**Covered Interest Parity (CIP)**
- Theoretical: Interest rate differential should equal forward premium
- Reality: Deviations exist (the "basis")

**Reading the Basis**
- **Negative basis**: Costs MORE to obtain dollars via FX swaps (dollar scarcity)
- EUR/USD basis -30 bps: Europeans pay 30 bps extra/year for dollar funding

**Basis Levels (EUR/USD)**
- 0 to -20 bps: Normal
- -20 to -50 bps: Elevated dollar demand
- -50 to -100 bps: Stressed
- Below -100 bps: Crisis (2008, March 2020)

**March 2020 Example**
- Basis blew out to -100+ bps
- DXY surged (global dollar squeeze)
- Fed opened swap lines with foreign central banks
- Basis normalized quickly after intervention

### Central Bank Intervention

**Who Intervenes**
- **BoJ**: Most active, defend yen weakness
- **SNB**: Defend CHF strength (historically)
- **PBoC**: Manage CNY through daily fixing
- **Fed**: Rarely intervenes

**Intervention Effectiveness**
- **Short-term**: Can cause sharp reversals (hurt speculators)
- **Long-term**: Struggles against fundamentals
- Japan 2022-2024: Spent tens of billions, temporarily slowed USD/JPY, but couldn't reverse until US rate expectations shifted

**Trading Around Intervention**
- Know historical levels (market identifies "lines in sand")
- Watch for verbal warnings escalating
- Respect firepower short-term, don't overestimate long-term
- Use intervention-driven moves for entry if fundamentals still favor original direction

### FX for Non-FX Traders

**Daily FX Scan (5 Minutes)**
1. **DXY direction**: Dollar strengthening or weakening? Why?
2. **USD/JPY**: JPY strengthening = risk-off signal
3. **EUR/USD**: Proxy for dollar vs developed markets
4. **AUD/USD**: Risk sentiment + China proxy
5. **EM FX**: Any broad weakness or specific stress?
6. **Cross-currency basis**: Any blowout?

**Key Signals**

| What to Watch | Implication |
|---------------|-------------|
| JPY strengthening sharply vs AUD | Carry unwinding, risk assets likely to follow |
| Cross-currency basis widening rapidly | Dollar funding stress, credit stress possible |
| Broad EM FX weakness | Risk-off spreading, may hit DM eventually |
| AUD weakness, CNY fixing surprises | China growth concerns |
| FX not following rate differentials | Something else driving (investigate) |

---

## LESSON 6: CROSS-ASSET SYNTHESIS

### The Institutional Framework

**How Global Macro Funds Think**
When forming a view (e.g., "Fed will pivot dovish"), they ask:
1. What's the highest-conviction expression?
2. What's the best risk-adjusted expression?
3. What should confirm if we're right?
4. What invalidates the thesis?
5. What's the time horizon?

**Capital Structure Hierarchy**
```
Rates/Sovereign Bonds (first to price)
         ↓
Credit (IG → HY)
         ↓
FX/Currencies
         ↓
Equity Indices → Sectors → Single Stocks (last to price)
         ↓
Volatility Surface
```

**Coherence vs Incoherence**
- **High Coherence**: All assets telling same story → higher conviction, trend-following works
- **Low Coherence**: Assets pricing conflicting scenarios → reduce risk, investigate, or wait

### Macro Regime Framework

**Four Quadrants** (Growth × Inflation)

**1. Goldilocks (Growth ↑, Inflation ↓)**
- Best environment for risk assets
- Overweight: Credit, Equities (especially growth)
- Neutral: Duration
- Sell volatility
- Examples: 2017, mid-2019, late 2023

**2. Reflation (Growth ↑, Inflation ↑)**
- Economy running hot
- Overweight: Commodities, TIPS, Value stocks
- Underweight: Duration
- Neutral: Credit, equities
- Examples: 2021 reopening, 2004-2006

**3. Stagflation (Growth ↓, Inflation ↑)**
- Worst environment
- Underweight: Credit, equities
- Overweight: Gold, energy, cash, defensives
- Complex: Duration (neither helps much)
- Examples: 2022 (partial), 1970s

**4. Deflation (Growth ↓, Inflation ↓)**
- Risk-off, flight to quality
- Max Overweight: Duration (long bonds)
- IG credit only (no HY)
- Underweight: Equities
- Overweight: Quality factor, safe haven FX (JPY, CHF)
- Long volatility
- Examples: 2008, March 2020, 2015-2016

### Regime Transition Signals

**→ Goldilocks**
- Leading: Yield curve steepening (bull), credit tightening, breakevens stable
- Confirming: Equities broadening, vol declining, EM FX strengthening

**→ Reflation**
- Leading: Breakevens rising, commodities breaking out, curve bear steepening
- Confirming: Value outperforming growth, banks rallying

**→ Stagflation**
- Leading: Growth data weakening + breakevens elevated, curve flattening
- Confirming: Credit widening, equities falling, gold/commodities holding

**→ Deflation**
- Leading: Curve bull flattening, credit blowing out, vol spiking
- Confirming: JPY surging, gold bid on real yield collapse, quality dominating

### The Macro Dashboard (Data Architecture)

**Tier 1: Policy & Liquidity** (Weekly-Monthly)
```
Net Liquidity = Fed Balance Sheet − TGA − RRP
```
- Fed Balance Sheet (FRED: WALCL)
- Reverse Repo (FRED: RRPONTSYD)
- Treasury General Account (FRED: WTREGEN)
- Financial Conditions Index (FRED: NFCI)
- Bank Lending Standards (FRED: DRTSCILM)

**Tier 2: Rates** (Daily-Weekly)
- 2Y, 10Y, 30Y yields
- 2s10s spread (inversion watch)
- 10Y TIPS yield (real yield)
- Breakeven inflation (10Y nominal − TIPS)
- Fed Funds futures (rate expectations)

**Tier 3: Credit** (Daily-Weekly)
- CDX IG spread
- CDX HY spread (key fear gauge)
- HY OAS (option-adjusted spread)
- IG-HY spread differential

**Tier 4: FX** (Daily)
- DXY (dollar index)
- EUR/USD, USD/JPY, AUD/USD
- Cross-currency basis (EUR/USD, JPY/USD)
- EM FX basket

**Tier 5: Volatility** (Daily)
- VIX (equity vol)
- MOVE (bond vol)
- VIX term structure (contango vs backwardation)
- Skew indices

**Tier 6: Commodities** (Daily-Weekly)
- Crude oil (WTI/Brent)
- Gold
- Copper (growth proxy)
- CRB index

**Data Sources**
- FRED (Federal Reserve Economic Data): Free, most macro series
- CME FedWatch: Fed rate probabilities
- Bloomberg: Professional standard (expensive)
- TradingView: Charting and some data
- CFTC: COT report (positioning)

### Lead-Lag Relationships

**Typical Sequence**

| Asset Class | Information Processing | Typical Lag |
|-------------|----------------------|-------------|
| Rates/Bonds | First to price macro shifts | Hours-Days |
| FX | Policy divergence flows | Days-Weeks |
| Credit | Corporate + macro | Days-Weeks |
| Equities | Broadest participation | Weeks-Months |

**Examples**
- Bond yields tend to lead equity returns by 3-6 months (during rate-driven regimes)
- Credit spreads often lead equity selloffs by days-weeks at turning points
- JPY strengthening often precedes broader risk-off by hours-days

**Reading Divergences**

| Divergence | Interpretation |
|------------|----------------|
| Equities rally + Credit widening | Credit warning equity rally fragile (credit often right) |
| Yields falling + Equities flat | Bonds pricing growth fear equities haven't acknowledged |
| JPY strengthening + Equities rallying | Safe haven moving against risk narrative (investigate) |

### Correlation Regimes

**Stock-Bond Correlation**

| Regime | Correlation | Why |
|--------|-------------|-----|
| Growth-driven | Negative (-0.3) | Growth fears → stocks down, bonds up (flight to safety) |
| Inflation-driven | Positive (+0.3 to +0.5) | Inflation → both down (rates up hurts both) |
| Liquidity crisis | → 1.0 | Everything sells together |

**2022 Lesson**: Stock-bond correlation flipped positive. 60/40 portfolio had worst year since 1970s. Diversification assumptions built on 40 years of falling inflation broke.

**Crisis Pattern**
- Phase 1: Idiosyncratic (some assets fall, diversification "works")
- Phase 2: Contagion (correlations rise, "uncorrelated" assets moving together)
- Phase 3: Liquidation (forced selling, everything sold, correlation → 1)
- Phase 4: Stabilization (selling exhausted, policy response)

### Case Study Takeaways

**2022 Bear Market**
- Every signal visible in cross-asset data if watching
- Sequence: Rates led → FX confirmed → Credit warned → Equities followed
- Stock-bond correlation flip was THE signal diversification assumptions broke
- Real yields: -1% to +1.5% (2.5% swing) crushed gold and growth simultaneously

**Q4 2023 Everything Rally**
- Peak coherence: All assets telling same story (soft landing)
- Sequence: Rates fell → Credit tightened → FX confirmed → Equities rallied
- When coherence this high, trend tends to persist
- Those waiting for "certainty" missed move; cross-asset framework gave early confirmation

**March 2023 Banking Crisis**
- Credit led: Regional bank CDS moved before equity (bond investors saw first)
- MOVE led VIX: Rate volatility spiked before equity volatility (rates-driven crisis)
- 2Y yields dropped 107 bps in 3 days (historic)
- Fed's BTFP announcement arrested panic; cross-asset normalization followed

### Expressing Views Across Capital Structure

**Example: "Fed Will Cut Sooner Than Expected"**

| Expression | Instrument | Risk | Carry | Convexity |
|------------|-----------|------|-------|-----------|
| Direct rates | Long 2Y Treasuries | Low | Positive | Low |
| Curve | 2s10s steepener | Lower | Often negative | Low |
| Rate options | Receiver swaptions | Defined risk | Negative | High |
| FX | Short USD/Long EUR | Higher | Variable | Low |
| Equity | Long QQQ | High | Low | Low |
| Equity options | Long QQQ calls | Defined risk | Negative | High |
| Gold | Long GLD | Moderate | Zero | Low |

**Cleanest Expression Principle**
- Most directly tied to thesis with fewest confounding factors
- View: "Inflation surprise higher" → Cleanest: Long breakevens
- View: "Credit stress coming" → Cleanest: Long CDX HY protection
- View: "Dollar will weaken" → Cleanest: Short DXY

---

## MODEL BUILDING FRAMEWORK

### Where Edge Actually Lives

**Hard Truth**: Daily discretionary macro trading is extremely difficult. Markets are efficient at short horizons. Edge exists at:
1. **Longer time horizons** (weeks to months)
2. **Systematic implementation** (rules-based, removing emotion)
3. **Superior data/infrastructure** (seeing signals faster/clearer)
4. **Capacity to hold** (withstand drawdowns that force others out)

### Systematic Strategy Types

**1. Regime Identification Models**
- Classify current regime (Goldilocks, Reflation, Stagflation, Deflation)
- Allocate based on historical regime performance
- Methods: Rule-based thresholds, HMM, clustering algorithms

**2. Trend-Following Across Assets**
- Systematically follow price trends in rates, FX, commodities, equities
- Time-series momentum, cross-sectional momentum
- Regime-conditional parameters

**3. Carry Strategies**
- Harvest carry in FX and fixed income
- Systematic rules for entry/exit
- Volatility-based position sizing

**4. Relative Value Models**
- Trade mean-reversion in relationships
- Stock-bond correlation, credit-equity spreads
- Pairs trading on deviations from historical norms

**5. Risk-Parity with Regime Adjustment**
- Dynamic allocation based on regime-conditional correlations
- Vol-targeting, correlation-aware sizing

### Backtesting Best Practices

**Essential Elements**
1. **Walk-forward testing**: Train on in-sample, test on out-of-sample, roll forward
2. **Avoid lookahead bias**: Only use information available at decision time
3. **Transaction cost modeling**: Spreads, slippage, market impact
4. **Realistic assumptions**: Liquidity constraints, execution delays
5. **Stress testing**: Test on crisis periods (2008, 2020, 2022)

**Validation Funnel**
```
Hypothesis → In-Sample Testing → Out-of-Sample Testing → 
Walk-Forward Analysis → Paper Trading → Live (Small) → Scale
```

**Red Flags**
- Sharpe > 3 (likely overfit or unrealistic costs)
- No losing months (overfit)
- Perfect market timing (lookahead bias)
- Works in-sample but fails immediately out-of-sample (overfit)

### Signal Construction Methodology

**1. Data Normalization**
- Z-scores: (X − μ) / σ (how many std devs from mean)
- Percentile ranks: Where current value ranks historically
- Regime-adjusted: Normalize within regime, not globally

**2. Composite Indicators**
- Financial Conditions Index = weighted average of rates, spreads, equity vol
- Risk Appetite Score = combination of VIX, HY spreads, JPY strength
- Liquidity Proxy = Net Liquidity formula

**3. Regime Detection**

**Rule-Based Example**
```python
if ISM > 50 and Core_CPI_YoY < 3:
    regime = "Goldilocks"
elif ISM > 50 and Core_CPI_YoY >= 3:
    regime = "Reflation"
elif ISM <= 50 and Core_CPI_YoY >= 3:
    regime = "Stagflation"
else:
    regime = "Deflation"
```

**Statistical (HMM)**
- Hidden Markov Model infers latent states from observables
- Requires sufficient data, can overfit
- More elegant but less interpretable

**4. Lead-Lag Analysis**
- Cross-correlation: ρ(X_t, Y_{t+lag}) for various lags
- Granger causality: Does past X improve forecasts of Y?
- Rolling window analysis: Test stability across regimes

### Portfolio Construction

**Vol-Adjusted Position Sizing**
```
Position Size = Target Risk / (Instrument Volatility × Correlation to View)
```

**Risk Budgeting**
- Allocate risk (not capital) across strategies
- Each strategy contributes equal risk to portfolio
- Rebalance as volatilities change

**Correlation-Aware Sizing**
- Don't just add independent strategies
- Account for correlation between expressions
- Diversify across less-correlated expressions of same view

**Dynamic Allocation**
- Regime-conditional weights
- Increase allocation to strategies that perform well in current regime
- Reduce allocation during low-coherence periods

### Monitoring & Execution

**Automated Alerts**
- Threshold-based: HY spreads widen >20 bps in day
- Divergence alerts: Equities rally but credit widening
- Regime change alerts: Moving from Goldilocks to Reflation
- Position checks: Max drawdown approaching historical

**Rebalancing Rules**
- Time-based: Monthly, quarterly (reduce transaction costs)
- Threshold-based: Rebalance when allocation drifts >5% from target
- Signal-based: Rebalance when regime change detected

**Execution Considerations**
- Slippage estimation: Bid-ask spread + market impact
- Liquidity assessment: Don't size beyond market capacity
- Timing: Avoid month-end, OpEx if possible (institutional flows)

### Realistic Expectations

**What This Framework Enables**
1. Understand how institutional investors think
2. Interpret market moves with multi-asset context
3. Inform medium-term allocation decisions (months, not days)
4. Build and test systematic strategies with proper rigor

**What This Framework Does NOT Enable**
1. Daily trading edge over professionals (markets too efficient short-term)
2. Guaranteed returns (all strategies have drawdown risk)
3. Elimination of behavioral biases (unless fully systematic)
4. Perfect market timing (no strategy works all the time)

**The Retail Edge**
- No benchmark constraints
- No redemption risk
- No career risk
- Can hold through volatility that forces institutional managers out
- **Use patience as your advantage**

---

## PRACTICAL IMPLEMENTATION CHECKLIST

### Daily Routine (15 minutes)

**1. Policy & Liquidity (5 min)**
- [ ] Check Fed balance sheet trend (FRED: WALCL)
- [ ] Check RRP trend (FRED: RRPONTSYD)
- [ ] Note any Fed speeches scheduled

**2. Rates & Credit (5 min)**
- [ ] 2Y, 10Y yields: Direction vs yesterday/week
- [ ] 2s10s spread: Steepening or flattening? Still inverted?
- [ ] HY spreads (CDX HY): Tightening or widening?
- [ ] MOVE index: Elevated or calm?

**3. FX & Commodities (3 min)**
- [ ] DXY: Strengthening or weakening? Why?
- [ ] USD/JPY: Risk-on or risk-off signal?
- [ ] Gold: Real yield relationship intact?

**4. Equity & Vol (2 min)**
- [ ] VIX level and term structure
- [ ] Sector rotation: Growth vs value, cyclicals vs defensives

**5. Coherence Check**
- [ ] Are all assets telling same story or diverging?
- [ ] Any major divergences requiring investigation?

### Weekly Review (45 minutes)

**1. Regime Assessment**
- [ ] Current regime classification (Goldilocks, Reflation, Stagflation, Deflation)
- [ ] Any signs of regime transition?
- [ ] Update regime transition scorecard

**2. Positioning Review**
- [ ] CFTC COT data: Any extreme positioning?
- [ ] Fund flow data: Significant inflows/outflows?
- [ ] Crowded trades identified?

**3. Calendar Prep**
- [ ] Upcoming central bank meetings
- [ ] Key data releases (NFP, CPI, PCE)
- [ ] Month-end, quarter-end, OpEx dates

**4. Strategy Performance**
- [ ] Review active positions vs initial thesis
- [ ] Check stop-losses and take-profit levels
- [ ] Document what worked and what didn't

### Monthly Deep Dive (2-3 hours)

**1. Full Regime Analysis**
- [ ] Comprehensive growth and inflation data review
- [ ] Central bank policy stance assessment
- [ ] Correlation regime analysis

**2. Strategy Backtest Updates**
- [ ] Add latest month's data to backtests
- [ ] Check out-of-sample performance vs in-sample
- [ ] Identify any strategy degradation

**3. Portfolio Rebalancing**
- [ ] Rebalance to target allocations
- [ ] Adjust for regime changes
- [ ] Review risk contribution by strategy

**4. Learning & Adaptation**
- [ ] Review major market moves and cross-asset signals
- [ ] Document case studies (successful and failed calls)
- [ ] Refine signal definitions based on recent observations

---

## KEY FORMULAS REFERENCE

### Signal-to-Noise
```
SNR = Signal Power / Noise Power
SNR < 1: Noise dominates
SNR > 1: Signal extractable
```

### Net Liquidity
```
Net Liquidity = Fed Balance Sheet − TGA − RRP
Rising = risk tailwind
Falling = risk headwind
```

### Duration
```
Price Change ≈ −Duration × Yield Change
Duration ~2 for 2Y, ~8 for 10Y, ~18 for 30Y
```

### Breakeven Inflation
```
Breakeven = Nominal Yield − TIPS Yield
Market's expected average inflation
```

### Real Yield
```
Real Yield = Nominal Yield − Inflation Expectations
Or directly from TIPS yield
```

### Carry Return
```
Carry Return = Interest Rate Differential − Hedging Cost
```

### Vol-Adjusted Position Sizing
```
Position Size = Target Risk / (Instrument Vol × Correlation to View)
```

---

## CRITICAL REMINDERS

**1. Time Horizon Is Everything**
- Noise dominates at short horizons (intraday, daily)
- Signal emerges at medium horizons (weeks, months)
- Don't try to trade daily what only works monthly

**2. Validation Before Capital**
- Test in-sample → out-of-sample → walk-forward → paper → live
- Most hypotheses fail (that's normal)
- Edge is discovering failure cheaply

**3. The Hierarchy Matters**
- Watch policy → rates → FX → credit → equities
- Don't trade equities without checking bonds
- Information flows top-down

**4. Correlations Shift**
- Normal markets: Diversification works
- Stressed markets: Everything correlates to 1
- Build regime-conditional correlation estimates

**5. Coherence Guides Conviction**
- High coherence = all assets aligned = higher confidence
- Low coherence = investigate, reduce size, or wait
- Divergences are warnings, not signals to ignore

**6. Credit Is the Canary**
- Credit investors are skeptical, macro-focused
- Credit spreads often lead equity selloffs
- When credit and equities diverge, credit is usually right

**7. JPY Is the Risk Barometer**
- Sharp JPY strengthening = carry unwind = risk-off
- Use USD/JPY as real-time risk sentiment gauge
- Especially important when diverging from equities

**8. Positioning Matters More Than News**
- News explains moves after they happen
- Extreme positioning shows where energy is stored
- Crowded trades unwind violently

**9. The Fed Matters Most**
- "Don't fight the Fed" is mathematics, not wisdom
- Liquidity drives asset prices (2020 proved this)
- Track H.4.1 weekly, net liquidity formula

**10. Edge Requires Infrastructure**
- Understanding ≠ profitable trading
- Systematic implementation required
- Data pipelines, backtesting, alerting systems essential
- Patience and discipline are the retail edge

---

## USAGE GUIDELINES FOR THIS DOCUMENT

**For Strategy Development:**
1. Start with regime identification (which quadrant are we in?)
2. Check cross-asset coherence (aligned or diverging?)
3. Identify highest-conviction expression (cleanest instrument)
4. Define confirmation signals (what validates thesis?)
5. Define invalidation signals (what proves thesis wrong?)
6. Backtest systematically before deploying capital

**For Daily Trading:**
1. Run 15-minute daily routine (policy, rates, credit, FX, vol)
2. Assess coherence (aligned = higher conviction)
3. Check for divergences (investigate before trading)
4. Know the calendar (avoid trading into month-end, OpEx, Fed)
5. Size based on conviction + coherence

**For Model Building:**
1. Use regime framework as foundation
2. Build data pipeline for key indicators (Tier 1-6)
3. Normalize signals (z-scores, percentile ranks)
4. Test lead-lag relationships quantitatively
5. Implement walk-forward validation
6. Monitor out-of-sample performance continuously

**For Risk Management:**
1. Know your regime (affects correlations)
2. Monitor coherence (low coherence = reduce size)
3. Track positioning extremes (avoid crowded trades)
4. Use stop-losses based on regime change, not arbitrary %
5. Respect the hierarchy (if bonds warning, listen)

---

## FINAL THOUGHTS

This framework represents **institutional-level thinking** about cross-asset markets. But remember:

✓ **Understanding > Trading**: Use this to interpret markets even if not trading actively

✓ **Medium-term > Short-term**: Edge exists at weeks-months, not days-hours  

✓ **Systematic > Discretionary**: Remove emotion, enforce discipline through rules

✓ **Patience > Speed**: Your edge is capacity to hold when others are forced out

✓ **Infrastructure > Ideas**: The best idea without proper testing/execution loses money

The goal is not to become a day trader. The goal is to understand how markets actually work, identify regime transitions early, express views in the cleanest way, and manage risk systematically.

**Success in macro trading comes from:**
1. Correct regime identification (are we in Goldilocks or Stagflation?)
2. Cross-asset confirmation (is credit confirming equities?)
3. Optimal expression (which instrument offers best risk/reward?)
4. Systematic validation (did I test this properly?)
5. Disciplined execution (am I following my rules?)

Good luck building your models. Remember: most strategies fail. The edge is discovering failure before it costs real capital.
