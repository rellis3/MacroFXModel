<!-- https://cog000.github.io/Data-Foundation-Lesson-1/ | The Data Hierarchy — DF-01 -->
Colez Trades
Quantitative & Macro Insights
C.OG
C.OGData Foundations • DF–01
DF – 01 · Data Foundations
# The Institutional Data Hierarchy

Where financial data actually comes from. A practical map of Tier 1 through Tier 4 — and why some highly valuable macro-economic data is available for free, which can significantly reduce data costs for systematic research.

01 — First Principles
## Data Sourcing is a Risk Function

At well-resourced quant desks and systematic trading operations, data sourcing is often treated as more than a technical task — it tends to be governed by documented processes, validation steps, and clear ownership. Understanding why is useful context for anyone building a systematic research process.

The principle is straightforward: **analytical output is only as reliable as its inputs**. A signal that looks exceptional may be constructed on data that was unavailable at signal time, sourced from a vendor that introduced survivorship bias, or built on a series that underwent material revision. The model cannot detect this on its own. Systematic data governance is a primary way to catch these issues.

Data First
practitioners widely cite data quality issues as a leading cause of model failures, not model design alone
no single authoritative figure exists
$500M
Knight Capital lost in 45 minutes in 2012 from a data and software deployment failure
firm did not survive
$24k
annual cost per seat for Bloomberg Terminal — the institutional data standard
Tier 1 primary access
⚠ The Data Quality Principle
A sophisticated model applied to corrupted, misaligned, or biased data does not produce sophisticated analysis. It produces sophisticated-looking noise with a false sense of precision.
This is not a beginner's warning. Knight Capital's 2012 failure involved a data and software deployment issue. Look-ahead bias has been documented in many published backtests, and it is a plausible contributor to strategies that appear strong in testing but disappoint in live trading. Systematic data governance is the primary defence — this block covers the practices that support it.
02 — Provenance
## Where Data Actually Comes From

Most market practitioners interact with data through Bloomberg, Refinitiv, or a third-party data vendor without ever asking a more fundamental question: **where did Bloomberg get this?** The answer reveals that most of what institutional desks pay $24,000 per year for is available directly, for free, from primary sources.

The diagram below shows the actual provenance chain for US macro-economic data. Understanding it changes how you think about data quality, revision risk, and where to direct your data strategy.

▼ US Government Macro Data Provenance — CPI, GDP, Payrolls, Rates
Primary Source
BLS / BEA / Fed
Free — authoritative
→
Aggregator / API
FRED API
Free — 800k+ series
→
Tier 1 Vendor
Bloomberg / Refinitiv
~$24k / seat / year
→
End User
You / Your Model
same source for these series
This applies specifically to government macro statistics. For tick data, intraday prices, fixed income, and international data, Bloomberg has access that does not have a free equivalent.

💡 What This Means — and What It Doesn't
For US macro-economic indicators published by government agencies — CPI, GDP, payrolls, unemployment, Treasury yields, the Fed Funds Rate — Bloomberg aggregates data that originates from the same public sources accessible via FRED. The underlying numbers are the same. Bloomberg's value here is normalisation, delivery infrastructure, and unified access, not exclusive data.

This does *not* mean Bloomberg is just a relay service in general. Tick-level equity and futures data, OTC fixed income pricing, global corporate fundamentals, analyst consensus estimates, and real-time exchange feeds are areas where Bloomberg provides genuine access to data that has no meaningful free equivalent. The $24k premium covers both infrastructure for government data *and* proprietary access to data that genuinely cannot be sourced elsewhere for free.

03 — The Four Tiers
## The Complete Institutional Data Hierarchy

A useful way to organise data sources is by tier — grouping them based on reliability, latency, publication governance, revision practices, and cost. The tier a source occupies shapes how it should be used, what validation is appropriate, and what analytical decisions it can credibly support.

Tier 1 Institutional Premium Vendors $15,000 — $30,000+ / year per seat ▼
The infrastructure layer used by hedge funds, prime brokers, asset managers, and investment banks. These platforms do not originate macro-economic data — they ingest it from primary sources, normalise it across heterogeneous formats, apply systematic cleaning, and deliver it through standardised APIs with defined service levels. The premium pays for this infrastructure, not data exclusivity.

What Tier 1 Provides
Point-in-time vintage data with full revision history. Tick-level resolution for equities, FX, and rates. Cross-asset coverage from a single endpoint. Corporate fundamentals with standardised accounting. Real-time delivery with <100ms latency guarantees.

What Tier 1 Cannot Give You
A better model. Better analytical judgment. Protection against look-ahead bias in your pipeline. Statistical validity of your backtest. Any of the things that actually determine whether a systematic strategy works.

Bloomberg Terminal (BBGN) Refinitiv Eikon / LSEG FactSet S&P Global Market Intelligence Morningstar Direct ICE Data Services MSCI RiskMetrics IHS Markit
Tier 2 Primary Government & Central Bank Sources Free — the actual primary publishers ▼
The most systematically underutilised tier in retail quantitative practice. These are the **original publishers** of macro-economic data. When Bloomberg displays US CPI, they sourced it from the BLS. When Refinitiv shows GDP, it originated at the BEA. When any vendor shows the Fed Funds Rate, it comes from the Federal Reserve. You can access the identical data directly, for free, often on the same day as Bloomberg users receive it.

What you lose vs Tier 1: unified API access, full revision vintage archives (though FRED provides this for most series), and the clean normalisation layer. What you gain: direct primary-source access, zero cost, and a deeper understanding of what the data actually represents and how it is constructed.

FRED — Federal Reserve St. Louis BLS — Bureau of Labor Statistics BEA — Bureau of Economic Analysis US Treasury Department Federal Reserve H.15 / Z.1 ECB Statistical Data Warehouse Bank of England Statistics BIS Statistics Hub Eurostat OECD Data Portal World Bank Open Data IMF Data Mapper Bank of Japan Statistics ONS — UK Office for National Statistics
**Strategic recommendation:** For all macro-economic indicators — inflation, GDP, employment, rates, monetary aggregates — Tier 2 primary sources accessed via the FRED API should be your default. You are accessing identical data to Bloomberg at zero cost. The FRED API (covered in DF-06) provides programmatic access to 800,000+ series from a single authenticated endpoint.
Tier 3 Exchange, Derivatives & Positioning Data $0 — $5,000 / year depending on source ▼
Market microstructure data from exchanges and regulatory bodies directly. This tier covers positioning, open interest, options flow, futures term structure, and order book data. Critical for systematic strategies that trade on positioning signals, volatility regimes, or carry structures. Partially accessible for free through regulatory reporting requirements.

Free Tier 3 Sources
CFTC Commitment of Traders (weekly). CME Group free historical data (limited). CBOE free historical VIX and options data. SEC EDGAR for filings-based positioning. All regulatory-mandated disclosures.

Paid Tier 3 Sources
CME Group DataMine (full tick history). ICE Data Vault. CBOE full historical options chains. DTCC trade repository data. Exchange co-location services for HFT.

CFTC Commitment of Traders (free) CME Group DataMine CBOE Historical Options ICE Data Vault Nasdaq Market Data LME Historical Data DTCC Trade Repository
Tier 4 Accessible APIs & Retail Aggregators Free — freemium ▼
The entry point for systematic retail practice. These platforms aggregate data from Tier 2 and Tier 3 sources and expose it through clean, well-documented APIs. Entirely legitimate for systematic research, strategy development, and backtesting when used with an explicit understanding of their provenance and limitations.

FRED API (fredapi Python library) yfinance (Yahoo Finance) Quandl / Nasdaq Data Link Alpha Vantage OECD API World Bank API Open Exchange Rates Polygon.io Tiingo
**The Tier 4 Rule:** Tier 4 is appropriate for macro indicators (CPI, GDP, rates) where the upstream source is a Tier 2 government agency. For equity price history in a research context, yfinance is adequate. It is *not* appropriate as the sole source for live execution, intraday data, or any use case where tick-level accuracy or revision-history access is required. Always trace the provenance chain and understand what is actually in the data.
04 — FRED Deep Dive
## FRED: Architecture & Coverage

The Federal Reserve Bank of St. Louis Economic Data (FRED) is one of the most useful free data resources available for macro research. It provides free, programmatic, authenticated access to over 800,000 data series from more than 100 sources including the BLS, BEA, US Treasury, ECB, World Bank, and OECD. Understanding its architecture gives you a clearer picture of what you can access and how.

📈Inflation & Prices~3,200 series
CPIAUCSLHeadline CPI, SA
CPILFESLCore CPI, SA
PCEPIPCE Price Index
PCEPILFECore PCE (Fed target)
T5YIE5y5y Inflation Breakeven
💹Interest Rates~2,800 series
FEDFUNDSEffective FFR
DGS22Y Treasury Daily
DGS1010Y Treasury Daily
T10Y2YYield Curve Spread
SOFROvernight Rate
🏭Growth & Activity~5,100 series
GDPC1Real GDP, Quarterly
INDPROIndustrial Production
RSAFSAdvance Retail Sales
UMCSENTConsumer Sentiment
HOUSTHousing Starts
👷Labour Market~1,900 series
PAYEMSTotal Nonfarm Payrolls
UNRATEUnemployment U-3
U6RATEUnderemployment U-6
ICSAInitial Claims Weekly
JTSJOLJob Openings (JOLTS)
🔬Financial Conditions~2,200 series
NFCIChicago Fed FCI
WALCLFed Balance Sheet
BAMLH0A0HYM2HY Credit OAS
DTWEXBGSUSD Broad Index
VIXCLSCBOE VIX Close
🌍International~180,000 series
ECBDFRECB Deposit Facility Rate
IRLTLT01DEM156NGermany 10Y Yield
DEXUSEUEUR/USD Daily
DCOILWTICOWTI Crude Oil
GOLDAMGBD228NLBMGold PM Fix
🧠 FRED Vintages — The Revision Archive
FRED stores the full revision history of most economic series — called vintages — allowing you to pull what was known at any point in time.
This is the institutional feature that makes proper backtesting possible. Using fred.get_series_vintage_dates("GDPC1") returns all the dates on which the series was revised. You can then pull the vintage that existed at any historical signal date, recreating exactly what your model would have seen. This is as close to point-in-time data as you can get without paying for a dedicated vintage database.
05 — COT Data
## The COT Report: Free Institutional Positioning Data

The CFTC Commitment of Traders report is a freely available source of futures positioning data that is often overlooked in retail quantitative practice. Published every Friday at 3:30pm ET, it discloses the net futures positions of three distinct market participant categories across major futures markets — FX, rates, equity indices, energy, metals, and agricultural commodities.

COT data is widely referenced by macro funds, CTAs, and discretionary traders as one input into positioning analysis. Historically, extreme net positioning has sometimes preceded trend reversals — though this relationship is not reliable enough to use in isolation. Understanding the report structure is the prerequisite to incorporating it into systematic work.

📋 COT Report — Three Market Participant Categories
Commercial Hedgers
"Smart Money" / Real Money
Entities with legitimate business exposure to the underlying commodity or financial instrument. Corn producers hedging harvest. Airlines hedging jet fuel. Corporates hedging FX exposure. Their positioning reflects business need, not speculation — but at extremes they signal important fundamentals.

Non-Commercial Speculators
"Large Specs" / Managed Money
Hedge funds, CTAs, and large speculative traders. These are the participants whose positioning is most closely watched for momentum and sentiment signals. Extreme net long or short positioning by large specs has historically been a contrarian indicator at major turning points.

Non-Reportable
Small Speculators
Positions too small to meet CFTC reporting thresholds. Retail traders and small institutional participants. Generally treated as a noise category — extreme positioning in non-reportables adds marginal signal. Can be computed as total open interest minus commercial minus non-commercial.

Data As-Of
Tuesday
Published
Friday 3:30pm ET
Lag
3 trading days
Source
cftc.gov (free)
History
1986—present
#### ✅ COT Markets Covered

- EUR, GBP, JPY, AUD, CAD, CHF, MXN (CME FX futures)

- 2Y, 5Y, 10Y, 30Y US Treasuries (CBOT)

- S&P 500, NASDAQ, Dow Jones, Russell 2000 (CME)

- WTI Crude, Brent, Natural Gas, RBOB (NYMEX)

- Gold, Silver, Copper (COMEX)

- Corn, Wheat, Soybeans, Sugar, Coffee (CBOT/ICE)

#### 📊 How to Use COT Data Systematically

- Compute net non-commercial position (longs minus shorts)

- Normalise by open interest for cross-market comparison

- Apply rolling z-score to identify positioning extremes

- Use percentile rank vs 3-year history as signal threshold

- Combine with price momentum to avoid catching falling knives

- Watch commercials for hedging extremes as leading indicator

### ✦ Key Takeaways

- **Data sourcing is a risk function** — not a technical task. Every professional quant desk governs it with policy, audit trails, and dedicated resources. The quality of your analytical output is bounded above by the quality of your data inputs.

- **For government macro statistics, Bloomberg aggregates data from the same public sources as FRED** — CPI, GDP, payrolls, Treasury yields, and the Fed Funds Rate originate from BLS, BEA, and the Federal Reserve. Bloomberg is not the exclusive source for these. For tick data, OTC fixed income, corporate fundamentals, and international market data, Bloomberg does provide access that has no straightforward free equivalent.

- **FRED is one of the most useful free resources for macro research** — 800,000+ series, programmatic API access, and vintage revision history. It is a sensible starting point before paying for commercial data feeds.

- **The Tier 2 → Tier 4 path is entirely viable for macro systematic research** — pulling CPI from FRED via fredapi accesses the same underlying government-published data that commercial vendors aggregate. The difference lies in tooling, normalisation, and latency, not the underlying numbers for government-sourced series.

- **COT data is a free, publicly available source of futures positioning information** — it is referenced by many professional macro practitioners and available going back to 1986. Like all signals, it should be treated as one input, not a standalone edge.

- **Understanding provenance is prerequisite to trust** — before any series enters your pipeline, trace it back to its original publisher. If you cannot identify the primary source, you cannot assess the revision risk, the reliability, or the appropriate use case.

←
Block StartData Foundations
Next Lesson →Data Types & Frequency Alignment
→
C.OG
Data Foundations — DF-01

Quantitative & Macro Education
