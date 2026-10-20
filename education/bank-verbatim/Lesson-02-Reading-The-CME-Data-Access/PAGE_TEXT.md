<!-- https://cog000.github.io/Lesson-02-Reading-The-CME-Data-Access/ | Reading the CME — Lesson 02: Data Access -->
Colez Trades
Quantitative & Macro Insights
C.OG
C.OG Open Interest • Lesson 02 of 06
LESSON 02 — DATA ACCESS
# Reading the CME

The Chicago Mercantile Exchange publishes institutional-grade open interest data for free. Here's how to access it and what you're looking at.

01 — The Source
## Why the CME Matters

The CME Group is the world's largest derivatives exchange. It operates the Chicago Mercantile Exchange, Chicago Board of Trade (CBOT), New York Mercantile Exchange (NYMEX), and COMEX. If you trade FX, indices, commodities, or interest rates — the institutional positioning happens here.

Unlike retail platforms that only show you price, the CME publishes **detailed open interest data across every strike and expiration**. This is the same data that trading desks at Goldman Sachs, JP Morgan, and every major hedge fund use to understand market positioning.

Key Insight
The CME Options Open Interest Heatmap is free, requires no account, and updates daily. There is no paywall between you and institutional-grade positioning data.
💱
### FX Futures

EUR/USD, GBP/USD, USD/JPY and all major pairs. The institutional FX market trades here, not on retail platforms.

📈
### Equity Indices

S&P 500 (ES), Nasdaq (NQ), Dow (YM). Every major index with massive options flow you can track.

🛢️
### Commodities

Crude oil, gold, silver, natural gas. NYMEX and COMEX data revealing real positioning in physical markets.

📊
### Interest Rates

Treasury futures, SOFR, Eurodollars. Where the biggest money in the world positions on rates.

02 — Getting There
## Accessing the Options Heatmap

The CME Options Open Interest Heatmap is buried a few clicks deep on their website. Here's the direct path.

🔗 cmegroup.com/tools-information/quikstrike/options-open-interest-heatmap.html
1
Navigate to the Product Selector
When you first load the heatmap, you'll see a product selector in the top-left corner. Click SELECT PRODUCT to open the navigation panel.

This reveals a three-column layout: **Asset Class** → **Product Family** → **Product**. Think of it as a drill-down menu from broad category to specific contract.

[IMAGE figures/fig01.png] CME Product Selector
FIG 1
**The Navigation Panel:** ① Click "Select Product" to open. ② Choose your Asset Class (FX, Equities, etc.). ③ Select the Product Family. ④ Pick the specific contract. Here we're navigating to EUR/USD (6E) via Foreign Exchange → FX Majors.
2
Select Your Asset Class
The left column shows all available asset classes. For most traders, you'll focus on:

| Asset Class | What's Included | Key Products |
| Foreign Exchange | All currency futures and options | 6E (EUR/USD), 6B (GBP/USD), 6J (USD/JPY) |
| Equity Indexes | US and international index products | ES (S&P 500), NQ (Nasdaq), YM (Dow) |
| Energy | Oil, gas, and related products | CL (Crude Oil), NG (Natural Gas) |
| Metals | Precious and industrial metals | GC (Gold), SI (Silver), HG (Copper) |
| Interest Rates | Treasury and short-term rate products | ZN (10Y Note), ZB (30Y Bond) |

3
Drill Down to Your Product
Once you select an Asset Class, the middle column populates with Product Families. Select one, and the right column shows individual products.

For example: Foreign Exchange → FX Majors → EUR/USD (EUU|6E)

The code in parentheses (like 6E) is the futures symbol — you'll see this referenced everywhere in professional trading.

✓ No Account Required
You don't need to create a CME account to access this data. It's completely free and public. Some advanced features require login, but the heatmap itself is fully accessible.

03 — The Heatmap
## Anatomy of the Options Heatmap

Once you've selected a product, you'll see the main heatmap grid. This is where the magic happens. Let's break down exactly what you're looking at.

[IMAGE figures/fig02.png] CME Options Heatmap Grid
FIG 2
**The Full Heatmap:** Strikes run vertically down the left. Expirations run horizontally across the top. Each cell shows open interest for that strike/expiration combination. Cyan highlighting indicates concentration — brighter = more contracts.
Strike
The leftmost column. This is the price level at which the option can be exercised. Listed in the contract's native format.
Expiration
Each column header shows a different expiry date. Format varies but typically shows the contract code and DTE (days to expiration).
C / P
Calls and Puts. Each expiration has two sub-columns: C for call open interest, P for put open interest at that strike.
OI Value
The number in each cell is the open interest — total outstanding contracts at that specific strike and expiry.
Colour Intensity
The cyan highlighting indicates relative concentration. Darker/brighter cells = more OI = bigger institutional positions.
DTE
Days To Expiration. Shown in column headers. Critical for understanding how soon these positions will impact price.
💡 Reading the Grid
The heatmap is read like a matrix. Find your strike on the left, then scan right across expirations. Large numbers with bright highlighting at a specific strike = significant institutional positioning at that level. We'll teach you how to interpret these patterns in Lesson 4.

04 — Decoding
## Understanding Contract Codes

CME uses standardised contract codes that might look cryptic at first. Once you understand the system, they become second nature.

// Example: Decoding "6EU5" 6E = Product Code (EUR/USD futures) U = Month Code (September) 5 = Year (2025) // So "6EU5" = EUR/USD September 2025 contract
CME Month Codes
| Code | Month | Code | Month | Code | Month |
| F | January | G | February | H | March |
| J | April | K | May | M | June |
| N | July | Q | August | U | September |
| V | October | X | November | Z | December |

The DTE (Days To Expiration) shown in column headers tells you how soon that expiry is. **Near-term expirations (low DTE) have the most immediate impact on price** because gamma effects intensify as expiration approaches. We'll cover this in detail in Lesson 5.

⚠️ Weekly vs Monthly Expirations
CME offers both weekly and monthly options on most products. Weeklies have codes like "WE1Q5" (Week 1, August 2025). Monthly options typically have more liquidity and larger open interest. Start by focusing on monthlies until you're comfortable with the data.

05 — Strike Prices
## Understanding Strike Format

The strike prices shown in the CME heatmap are in **futures contract format**, not spot price format. This is critical to understand — and it's why Lesson 3 exists.

// EUR/USD Example CME Strike: 1.1500 // This is the futures price level Spot Equivalent: Will differ based on the basis // Covered in Lesson 3: Futures to CFD Conversion
💱
### FX Strikes

Displayed as the full exchange rate. EUR/USD 1.1500 means the option strikes at that level. Increments vary by product.

📈
### Index Strikes

Shown as index points. S&P 500 (ES) might show 5500, 5550, 5600. These are futures levels, not spot index.

🛢️
### Commodity Strikes

In the commodity's unit. Crude oil shows dollar-per-barrel levels. Gold shows dollar-per-ounce.

💡 Why This Matters
If you trade spot FX or CFDs, you can't just take CME strikes and draw them directly on your chart. There's a **basis** — a difference between futures and spot — that changes over time. Lesson 3 will teach you exactly how to convert these strikes to levels you can use.

06 — Features
## Useful Heatmap Features

The CME heatmap has several features that make analysis easier. Here are the ones worth knowing.

📅
### Expiration Filter

The dropdown at the top lets you filter to specific expirations. Useful when you want to focus on just the front-month or a specific date.

🔀
### Call/Put Combined

Toggle to view calls and puts separately or combined. Combined view helps identify total OI at each strike regardless of direction.

📊
### Settlement Data

The "Settlements" link provides yesterday's official settlement prices — useful for understanding where the market closed.

📈
### Volume & OI Toggle

Switch between viewing volume (today's activity) and open interest (cumulative positions). OI is usually more informative for levels.

✓ Data Updates
CME open interest data updates once daily, typically by early morning US time. It reflects positions at the **previous day's close**. This isn't real-time data, but for identifying key levels and structural positioning, daily updates are sufficient.

07 — Quick Reference
## Most-Watched Products

Here are the products most relevant to retail traders, with their CME codes and navigation paths.

| Market | Symbol | Navigation Path | Notes |
| EUR/USD | 6E | Foreign Exchange → FX Majors → EUR/USD | Most liquid FX contract |
| GBP/USD | 6B | Foreign Exchange → FX Majors → GBP/USD | Second most traded FX |
| USD/JPY | 6J | Foreign Exchange → FX Majors → JPY/USD | Note: CME quotes as JPY/USD |
| S&P 500 | ES | Equity Index → US Index → E-mini S&P 500 | The benchmark index |
| Nasdaq 100 | NQ | Equity Index → US Index → E-mini Nasdaq | Tech-heavy index |
| Gold | GC | Metals → Precious → Gold | Per troy ounce |
| Crude Oil | CL | Energy → Crude Oil → WTI Crude | Per barrel |

💡 JPY Note
CME quotes Japanese Yen futures as JPY/USD (yen per dollar), which is the **inverse** of how most retail platforms quote USD/JPY. The conversion is simple (1 / rate) but it's a common source of confusion. We'll handle this in Lesson 3.

08 — What's Next
## From Data to Actionable Levels

You now know how to access the CME options heatmap and understand what you're looking at. But there's a critical gap: **the strikes shown are in futures format, and you likely trade spot or CFDs.**

In the next lesson, we'll teach you how to convert futures strikes to spot/CFD levels — so you can actually plot these institutional positioning levels on your trading charts.

| Lesson | Topic | Status |
| 01 | Foundations of Open Interest | ✓ Complete |
| 02 | Reading the CME & Data Access | ✓ Complete |
| 03 | Futures to CFD Conversion | → Up Next |
| 04 | The Open Interest Matrix | Upcoming |
| 05 | Gamma & Dealer Dynamics | Upcoming |
| 06 | Trading Frameworks | Upcoming |

### 📌 Key Takeaways

- **The CME Options Heatmap** is free, public, and provides institutional-grade open interest data

- Navigate via **Asset Class → Product Family → Product** to find your market

- The grid shows **strikes vertically, expirations horizontally**, with C/P columns for calls and puts

- **Cyan highlighting** indicates OI concentration — brighter = more contracts = bigger positions

- Contract codes follow the format: **Product + Month + Year** (e.g., 6EU5 = EUR/USD Sept 2025)

- Strike prices are in **futures format** — conversion to spot/CFD levels is covered in Lesson 3

- Data updates **daily**, reflecting previous day's close — sufficient for structural analysis

Previous Lesson
← Foundations
Next Lesson
Futures to CFD Conversion →
C.OG
Open Interest Course • Lesson 02 of 06

Educational content only. Not financial advice.
