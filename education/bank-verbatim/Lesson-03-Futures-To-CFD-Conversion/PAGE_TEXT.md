<!-- https://cog000.github.io/Lesson-03-Futures-To-CFD-Conversion/ | Futures to CFD Conversion — Lesson 03 -->
Colez Trades
Quantitative & Macro Insights
C.OG
C.OG Open Interest • Lesson 03 of 06
LESSON 03 — CONVERSION
# Futures to CFD Conversion

CME strikes are in futures format. You trade spot or CFDs. Here's how to bridge the gap and plot institutional levels on your charts.

01 — The Problem
## Why You Can't Just Copy the Strikes

You've found the CME heatmap. You see massive open interest at EUR/USD strike 1.1500. You open your trading platform, draw a line at 1.1500, and wait for price to react.

**But price never gets there.** Or it blows right through. The level seems useless.

This isn't because the data is wrong — it's because you're comparing apples and oranges. The CME shows **futures prices**. Your broker shows **spot prices**. They're related, but they're not the same number.

The Core Issue
Futures prices differ from spot prices by a component called the "basis." To use CME data on a spot/CFD chart, you must convert the strikes using the current basis.
Futures vs Spot — The Gap
Futures Price
1.1520
⟷ Basis: +20 pips
Spot Price
1.1500
In this example, futures trade at a 20-pip premium to spot. This gap must be accounted for.

02 — The Basis
## What Causes the Difference?

The basis exists because futures contracts have an expiration date, while spot is immediate. The difference reflects the **cost of carry** — primarily interest rate differentials between the two currencies.

💰
### Interest Rate Differential

If USD rates are higher than EUR rates, holding EUR means forgoing USD interest. Futures price this in, creating a premium or discount.

📅
### Time to Expiration

The basis shrinks as expiration approaches. At expiry, futures and spot converge. Far-dated contracts have larger basis.

📊
### Supply & Demand

Market positioning can temporarily push futures above or below fair value, creating additional basis variation.

💡 The Good News
You don't need to calculate theoretical fair value. You just need to measure the **current** difference between the futures price and spot price. This is a simple subtraction that gives you the live basis.

03 — The Formula
## Converting Strikes to Spot Levels

The conversion is straightforward once you understand the concept. Here's the formula:

Conversion Formula
Spot Level = Futures Strike − Basis
Where Basis = Current Futures Price − Current Spot Price
Let's break this down step by step with a real example.

// Example: Converting EUR/USD Strikes Given: • CME 6E Futures trading at: 1.1520 • Your broker's EUR/USD spot: 1.1500 • Strike you want to convert: 1.1600 Step 1: Calculate the basis Basis = 1.1520 − 1.1500 = +0.0020 (+20 pips) Step 2: Apply to the strike Spot Level = 1.1600 − 0.0020 = 1.1580 // Draw your line at 1.1580 on your spot chart
1
Get current futures price from CME
1.1520
2
Get current spot price from your broker
1.1500
3
Calculate basis (Futures − Spot)
+0.0020
4
CME strike you want to convert
1.1600
✓
**Spot equivalent level** (Strike − Basis)
1.1580
04 — Data Sources
## Where to Get the Prices You Need

To calculate the basis, you need both the current futures price and the current spot price. Here's where to find each:

📊
### Futures Price

**CME Group website** — The same place you get OI data. Look for "Last" or "Settlement" price on the contract page. TradingView also shows CME futures (6E, 6B, etc.).

💱
### Spot Price

**Your broker's platform** — Use whatever price feed your broker shows. This is the price you'll actually trade at, so it's the relevant reference.

⚠️ Use Matching Timeframes
Capture both prices at approximately the same time. The basis fluctuates throughout the day. If you grab futures at 9am and spot at 3pm, your calculation will be off. Do it simultaneously or within a few minutes.

**Pro tip:** TradingView lets you view both CME futures and spot FX on the same screen. Create a layout with both and calculate the basis visually.

05 — Special Cases
## Handling Inverted Pairs (JPY)

Most CME FX futures are quoted the same way as spot. But there's one major exception: **Japanese Yen**.

JPY Inversion
CME quotes Yen as JPY/USD (yen per dollar), while retail platforms quote USD/JPY (dollars per yen). You need to invert the CME price before calculating basis.
// Example: Converting JPY Strikes Given: • CME 6J (JPY/USD) trading at: 0.006700 • This means 1 JPY = 0.0067 USD Step 1: Invert to get USD/JPY equivalent USD/JPY = 1 ÷ 0.006700 = 149.25 Step 2: Compare to your broker's USD/JPY spot Spot: 149.00 Basis = 149.25 − 149.00 = +0.25 Step 3: Convert a CME strike CME strike: 0.006667 (JPY/USD format) Inverted: 1 ÷ 0.006667 = 150.00 Spot level: 150.00 − 0.25 = 149.75
💡 Simplification
Once you've calculated the basis in USD/JPY terms, you can apply it directly to inverted strikes. Invert all the CME strikes you care about first, then subtract the basis from each. The math is the same — just with an extra inversion step upfront.

06 — Other Markets
## Indices, Gold, and Oil

FX isn't the only market with a basis. Equity indices, gold, and crude oil all have differences between futures and spot/CFD prices.

| Market | CME Symbol | Typical Basis | Notes |
| S&P 500 | ES | 5–20 points | Futures typically trade at premium to SPX cash index |
| Nasdaq 100 | NQ | 10–40 points | Same dynamic as S&P; premium varies with rates |
| Gold | GC | $2–10 | Futures usually at slight premium; contango is common |
| Crude Oil | CL | $0.20–2.00 | Can be contango or backwardation; check curve structure |

The conversion process is identical: find the current futures price, find the equivalent spot/CFD price on your platform, calculate the difference, and apply it to the strikes you want to plot.

✓ Index CFDs
Most retail brokers' index CFDs (US500, US100, etc.) closely track the futures price, not the cash index. This means the basis is often very small — sometimes just a few points. Always verify with your specific broker, but index conversions are usually straightforward.

07 — Workflow
## Putting It All Together

Here's the complete workflow for converting CME strikes to usable levels on your chart:

1
**Pull up the CME heatmap** — Identify strikes with significant OI that you want to track
2
**Note the current futures price** — From CME or TradingView
3
**Note your broker's spot price** — At the same time
4
**Calculate the basis** — Futures minus Spot
5
**Convert each strike** — Strike minus Basis = Spot Level
6
**Plot on your chart** — Draw lines at the converted levels
⚠️ Recalculate Regularly
The basis isn't static. It changes throughout the day and especially as contracts approach expiration. Recalculate at least once per session, or whenever you notice significant price movement. A stale basis can put your levels 10–20 pips off target.

**Efficiency tip:** Most traders focus on 3–5 key strikes at any given time — the largest call wall, the largest put wall, and max pain (covered in Lesson 4). You don't need to convert every strike, just the ones that matter.

08 — Quick Reference
## Conversion Cheat Sheet

Standard Pairs (EUR, GBP, AUD, etc.)
Spot Level = CME Strike − (Futures Price − Spot Price)
Inverted Pairs (JPY)
Step 1: Invert CME price → 1 ÷ (CME JPY/USD) Step 2: Calculate basis in USD/JPY terms Step 3: Invert strike, then subtract basis
Indices & Commodities
// Same formula as FX Spot Level = CME Strike − Basis // Basis is often smaller for index CFDs
09 — What's Next
## Now You Can Read the Map

You now have the complete toolkit to access CME data and convert it to levels you can actually use. The next step is learning **what those levels mean** — which strikes matter, why certain concentrations create walls, and how to identify the key levels that will influence price.

Lesson 4 introduces the Open Interest Matrix — the analytical framework for interpreting OI data and identifying actionable levels.

| Lesson | Topic | Status |
| 01 | Foundations of Open Interest | ✓ Complete |
| 02 | Reading the CME & Data Access | ✓ Complete |
| 03 | Futures to CFD Conversion | ✓ Complete |
| 04 | The Open Interest Matrix | → Up Next |
| 05 | Gamma & Dealer Dynamics | Upcoming |
| 06 | Trading Frameworks | Upcoming |

### 📌 Key Takeaways

- **Futures ≠ Spot** — CME strikes are in futures format; direct plotting on spot charts won't work

- The **basis** is the difference between futures and spot, driven by interest rate differentials and time to expiry

- **Conversion formula:** Spot Level = Futures Strike − Basis

- Calculate basis by subtracting spot price from futures price **at the same moment**

- **JPY is inverted** — CME quotes JPY/USD; invert to USD/JPY before calculating

- Index CFDs often closely track futures, making conversion simpler (smaller basis)

- **Recalculate the basis regularly** — it changes throughout the day and as expiration approaches

- Focus on converting only the **key strikes** — call walls, put walls, and max pain

Previous Lesson
← Reading the CME
Next Lesson
The Open Interest Matrix →
C.OG
Open Interest Course • Lesson 03 of 06

Educational content only. Not financial advice.
