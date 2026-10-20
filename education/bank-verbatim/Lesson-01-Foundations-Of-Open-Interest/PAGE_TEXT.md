<!-- https://cog000.github.io/Lesson-01-Foundations-Of-Open-Interest/ | Open Interest — Lesson 01: Foundations -->
Colez Trades
Quantitative & Macro Insights
C.OG
C.OG Open Interest • Lesson 01 of 06
LESSON 01 — FOUNDATIONS
# Understanding Open Interest

The derivatives market is one of the largest and most systematically important markets in the world. Open interest is your window into how it operates.

01 — The Basics
## What is Open Interest?

Before we can use open interest as an analytical tool, we need to understand exactly what it represents and why it matters.

Definition
Open Interest (OI) is the total number of outstanding derivative contracts — futures or options — that are currently open and have not been closed, exercised, or expired.
Every futures or options contract requires two parties: a buyer and a seller. When a new contract is created, open interest increases by one. When an existing contract is closed, open interest decreases by one. This simple mechanic contains profound information about market positioning and participant behaviour.

**Open interest is not the same as volume.** This is a critical distinction that most retail traders miss entirely. Volume measures activity — how many contracts changed hands today. Open interest measures commitment — how many contracts are still being held.

| Metric | What It Measures | Resets Daily? | Tells You About |
| Volume | Number of contracts traded | Yes — starts at zero each day | Activity and liquidity |
| Open Interest | Number of contracts held | No — cumulative total | Positioning and commitment |

02 — Mechanics
## How Contracts Are Created and Closed

Understanding how open interest changes requires understanding the four possible scenarios when two parties trade a contract.

Scenario 1: New Contract Created
Buyer
Opens New Long
+
Seller
Opens New Short
=
Open Interest
+1 Contract
Both parties are initiating new positions. A new contract is born.

Scenario 2: Contract Closed
Long Holder
Closes Long
+
Short Holder
Closes Short
=
Open Interest
-1 Contract
Both parties are closing existing positions. The contract ceases to exist.

💡 The Two Neutral Scenarios
**Transfer of Position:** When an existing long sells to a new buyer, or an existing short buys from a new seller, open interest stays the same. The contract simply changes hands — one party exits, another enters. Volume increases, but OI is unchanged.

This is why open interest is so valuable. **Rising OI means new money is entering the market.** Falling OI means positions are being liquidated. Volume alone can't tell you this — high volume could be new positions or old positions closing.

03 — Market Context
## The Scale of the Derivatives Market

Most retail traders focus exclusively on spot markets — buying and selling the actual asset. They're completely unaware of the massive derivatives market operating alongside it, often with far greater size and influence.

Global Market Size Comparison (Notional Value)
Global Equity Markets
~$100T
Global Bond Markets
~$130T
Global Derivatives Market
~$700T+
The derivatives market dwarfs traditional asset classes by notional value.

The derivatives market is estimated at over **$700 trillion in notional value** — roughly 7x the combined size of global equity and bond markets. This isn't a peripheral market. It's the market where institutions hedge risk, express macro views, and manage enormous portfolios.

When a pension fund needs to hedge currency exposure, they use derivatives. When a bank manages interest rate risk, they use derivatives. When a hedge fund wants leveraged exposure to an index, they use derivatives. **The real institutional activity happens here.**

🏦
### Hedging Activity

Institutions use options to protect portfolios. Large put positions at specific strikes reveal where the "smart money" sees risk.

📊
### Leverage & Exposure

Futures provide efficient exposure with margin. Open interest shows where leveraged positions are concentrated.

⚖️
### Market Making

Dealers hedge their books dynamically. Their activity around key strikes creates predictable price behaviour.

04 — The Retail Blind Spot
## Why Most Traders Miss This Edge

Open interest data is publicly available. It's not hidden, not expensive, not restricted. Yet the vast majority of retail traders never look at it. Why?

📚
### Education Gap

Retail education focuses on chart patterns and indicators. Derivatives analysis is rarely taught, creating a structural blind spot.

🔧
### Complexity Barrier

Options data requires understanding strikes, expirations, and Greeks. Most traders avoid what they don't immediately understand.

💻
### Platform Limitations

Retail platforms emphasise price charts. OI data requires going to exchanges directly — an extra step most won't take.

🎯
### CFD/Spot Focus

Many retail traders use CFDs or spot markets, never realising that futures and options data is directly relevant to their trading.

⚠️ The Information Asymmetry
Institutions see OI data, analyse positioning, and trade accordingly. Retail traders draw lines on charts without any awareness of the massive option structures sitting at key levels. This isn't a level playing field — but it can be, once you know where to look.

05 — The Edge
## What Open Interest Actually Reveals

When you know how to read it, open interest data provides actionable intelligence that price charts simply cannot offer.

🧱
### Support & Resistance Levels

Large concentrations of put OI act as support. Large call OI acts as resistance. These aren't arbitrary lines — they're levels where real money is positioned.

🧲
### Price Magnets

Near expiration, price often gravitates toward strikes with maximum pain for option holders. OI reveals where these magnets are.

📈
### Trend Confirmation

Rising price with rising OI = new longs entering (healthy trend). Rising price with falling OI = short covering (weak rally). OI contextualises moves.

⚡
### Gamma Acceleration

When price breaks through levels with concentrated OI, dealer hedging creates acceleration. Understanding gamma reveals where moves will accelerate.

// Example: Interpreting OI + Price Action Scenario: Price rises from 100 to 105 Case A: OI increases by +15,000 contracts → New longs entering, trend likely to continue Case B: OI decreases by -15,000 contracts → Shorts covering, rally may be exhausted // Same price move, completely different implications
06 — Preview
## What Real OI Data Looks Like

Your Destination
### The CME Options Open Interest Heatmap

This is the tool you'll learn to navigate. Free, public, and used by institutions worldwide. Here's a preview of what you're working towards.

The Chicago Mercantile Exchange (CME) provides a free, publicly accessible options heatmap that visualises open interest across all strikes and expirations. This is the same data institutions use — and in the next lesson, you'll learn exactly how to access and read it.

[IMAGE figures/fig01.png] CME Options Heatmap Navigation
FIG 1
**Navigation Path:** The CME interface lets you drill down by Asset Class → Product Family → Product. Here we're selecting Foreign Exchange → FX Majors → EUR/USD (6E). The circled numbers show the selection flow.
1
Step One
Select Product
2
Step Two
Choose Asset Class
3
Step Three
Pick Specific Contract
[IMAGE figures/fig02.png] CME Options Heatmap Data Grid
FIG 2
**The Heatmap Grid:** Strikes run vertically (left column). Expirations run horizontally (each date column). C = Calls, P = Puts. The cyan highlighting indicates OI concentration — darker = more contracts. You're looking at where institutional money is positioned.
💡 What You're Seeing
Each cell shows the open interest at a specific strike price and expiration date. The colour intensity reveals concentration — **brighter cyan cells = larger positions**. In the heatmap above, notice how certain strikes have significantly more OI than others. These aren't random — they're levels where institutions have placed bets. We'll teach you how to interpret these patterns in Lessons 4 and 5.

Don't worry if this looks overwhelming right now. By the end of Lesson 2, you'll be navigating this interface confidently. By Lesson 4, you'll be identifying walls, magnets, and key levels. By Lesson 6, you'll be incorporating this data into your trading process.

07 — What's Next
## Your Learning Path

This lesson established the foundation. You now understand what open interest is, how it works mechanically, and why it matters. The remaining lessons will build on this foundation systematically:

| Lesson | Topic | You'll Learn |
| 02 | Reading the CME | How to access and navigate professional-grade OI data |
| 03 | Futures to CFD Conversion | Translating futures strikes to levels you can use on any chart |
| 04 | The Open Interest Matrix | Walls, max pain, magnetism, and the analytical framework |
| 05 | Gamma & Dealer Dynamics | How hedging activity creates predictable price behaviour |
| 06 | Trading Frameworks | Systematic approaches to incorporating OI into your process |

### 📌 Key Takeaways

- **Open interest** is the total number of outstanding contracts that haven't been closed, exercised, or expired

- **OI ≠ Volume** — volume measures activity, OI measures commitment and positioning

- **Rising OI** means new money entering; **falling OI** means positions being closed

- The derivatives market (~$700T) dwarfs spot markets — this is where institutional activity concentrates

- OI reveals support/resistance, price magnets, trend health, and potential acceleration zones

- Most retail traders ignore OI entirely — understanding it creates genuine informational edge

- The CME provides free, public access to professional-grade OI data via their options heatmap

Next Lesson
Reading the CME →
C.OG
Open Interest Course • Lesson 01 of 06

Educational content only. Not financial advice.
