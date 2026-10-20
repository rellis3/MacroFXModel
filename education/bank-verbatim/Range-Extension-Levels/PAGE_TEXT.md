<!-- https://cog000.github.io/Range-Extension-Levels/ | Range Extension Levels -->
Colez Trades
Quantitative & Macro Insights
C.OG
C.OG
- Overview

- Setup

- Finding Levels

- Alignments

TECHNICAL EXECUTION FRAMEWORK
# Range Extension Levels

A systematic method for identifying high-probability price levels using range extensions. This framework projects the Asia session range to find where price may encounter exhaustion.

Section 01
## Understanding Range Extensions

Before diving into the mechanics, it's essential to understand what this framework actually measures — and what it doesn't.

⚠️
Critical Distinction: Range Extensions vs Mathematical Deviations
This framework uses **range extensions**, not traditional mathematical standard deviations. This is a crucial distinction that fundamentally changes how you interpret and apply the levels.

#### ✗ Mathematical Standard Deviations

Traditional standard deviations measure statistical dispersion from a mean using historical price data. They assume normal distribution and calculate variance across a dataset. This is a **backward-looking** statistical measure.

#### ✓ Range Extensions

Range extensions project the **size of a defined range** (Asia session) as multiples into price space. They measure how far price can extend from a known range. This is a **forward-projecting** structural measure.

💡 Why This Matters
Range extensions are anchored to **today's volatility context**. A 2x extension means price has moved twice the distance of the Asia range — this is a structural observation about market expansion, not a statistical probability statement.

📊
#### The Asia Range

The foundational range from which all extensions are measured. Defined as 00:00-06:00 London time.

📈
#### Extension Multiples

Each level (1x, 2x, 3x) represents how many times the Asia range distance price has traveled.

🎯
#### Exhaustion Zones

Extension levels mark where price has moved significantly and may find exhaustion.

⚡
#### Alignment Zones

Where extensions from multiple sessions overlap, creating higher probability areas.

Section 02
## Tool Setup

Configure your TradingView tools to project range extension levels accurately.

01
### Configure Fibonacci Tool Settings

TradingView Setup

We repurpose the Fibonacci retracement tool to project range extension levels. Configure the tool with the following values:

⚙️ Fib Retracement Levels
0
0.25
0.5
0.75
1
1.5
2
2.5
3
3.5
4
4.5
5
5.5
6
6.5
7
7.5
8
8.5
9
9.5
10
10.5
✓ Pro Tip
Enable "Use one color" in the Fib settings for cleaner visualization. Save this as a template for quick access.

02
### Identify The Asia Range

Establishing your reference range

The Asia range serves as your foundational reference — the range from which all extension levels are projected.

🕐 Asia Range Definition
**Time Window:** 00:00 - 06:00 London time **Indicator:** 'Asian Range by Nico948' (TradingView) **Data Feed:** Use OANDA for consistent timestamps

Figure 1: Asia Range Identification EUR/USD • 5min
[IMAGE figures/fig01.png] Asia Range Chart
The shaded box highlights the Asia range (00:00-06:00 London time). This consolidation period establishes the range for extension projections.

⚠️ Important
Ensure your chart timezone is set correctly. The Asia range must be consistently defined across all your analysis.

Section 03
## Projecting Extension Levels

Project the Asia range as multiples both above and below current price to identify potential exhaustion zones.

01
### Project Extensions Above Price

Potential short entry zones

All analysis is conducted on the **5-minute timeframe** for precision.

Draw the Fib tool from the **highest candle close** to the **lowest candle close** within the Asia range. This projects extension levels above the range.

Figure 2: Extensions Above (Sell Zones) EUR/USD • 5min
[IMAGE figures/fig02.png] Extensions Above Chart
This is an example of an upwards extension which can then be used to identify potential levels to short from.

✓ Key Point
Use **candle closes**, not wicks. Closes represent where price was accepted; wicks represent rejection.

02
### Project Extensions Below Price

Potential long entry zones

Draw the Fib tool in the opposite direction — from the **lowest candle close** to the **highest candle close**. This projects extension levels below the range.

Figure 3: Extensions Below (Buy Zones) EUR/USD • 5min
[IMAGE figures/fig03.png] Extensions Below Chart
#### Extensions Above Price

Price has extended upward. These levels mark potential exhaustion zones for **short** considerations.

#### Extensions Below Price

Price has extended downward. These levels mark potential exhaustion zones for **long** considerations.

Section 04
## Finding Alignment Zones

The highest probability levels occur where extensions from multiple Asia ranges overlap.

01
### Multi-Session Confluence

Finding alignment zones

Repeat the extension projection process on the **previous day's Asia range**. Look for areas where levels from both sessions fall close together.

🎯 Alignment Tolerance
**EUR/USD:** 2 pips tolerance If two extension levels from different sessions fall within 2 pips of each other, mark this as a confluence zone.

Figure 4: Multi-Session Alignment EUR/USD • 5min
[IMAGE figures/fig04.png] Multi-Session Alignment Chart
Two Asia ranges shown. The highlighted zone shows where extension levels from both sessions align, creating a high-probability confluence area.

📋 Daily Setup Checklist
✓
##### Current Asia range identified

Today's 00:00-06:00 London time range clearly marked

✓
##### Extensions above projected

Fib drawn from highest close to lowest close

✓
##### Extensions below projected

Fib drawn from lowest close to highest close

✓
##### Previous session extensions added

Yesterday's Asia range extensions overlaid

✓
##### Alignment zones identified

Levels within 2 pips marked as confluence zones

#### Knowledge Check

What's the key difference between range extensions and mathematical standard deviations?

Range extensions use more data points for higher accuracy
Standard deviations project future levels while range extensions look backward
Range extensions project multiples of a defined range forward; standard deviations measure statistical dispersion from historical data
They are essentially the same calculation with different names
### Key Takeaways

①
**Range extensions ≠ standard deviations.** We're projecting multiples of a defined range forward, not calculating statistical variance.

②
**Extensions measure market expansion.** A 3x extension means price has traveled three times the Asia range distance.

③
**Confluence amplifies probability.** Alignment zones where multiple session extensions overlap offer higher probability.

④
**These are zones, not guarantees.** Extension levels identify where price may react — always combine with proper risk management.

C.OG
Range Extension Levels • Technical Execution Framework

Educational content only. Not financial advice.
