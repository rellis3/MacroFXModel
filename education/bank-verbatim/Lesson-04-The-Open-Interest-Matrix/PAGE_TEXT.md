<!-- https://cog000.github.io/Lesson-04-The-Open-Interest-Matrix/ | The Open Interest Matrix — Lesson 04 -->
Colez Trades
Quantitative & Macro Insights
C.OG
C.OG Open Interest • Lesson 04 of 06
LESSON 04 — ANALYSIS
# The Open Interest Matrix

Walls, magnets, max pain, and the analytical framework for identifying levels that actually matter.

01 — The Framework
## From Data to Actionable Levels

You can now access CME data and convert strikes to spot levels. But you're staring at thousands of contracts across dozens of strikes. **Which ones actually matter?**

The Open Interest Matrix is a framework for identifying the key levels that will influence price. It's built on four core concepts: **Call Walls**, **Put Walls**, **Max Pain**, and **Magnetism**. Understanding these transforms raw OI data into actionable trading intelligence.

🧱
### Call Walls

Strikes with massive call OI that act as resistance. Price tends to stall or reverse here.

🧱
### Put Walls

Strikes with massive put OI that act as support. Price tends to find a floor here.

🧲
### Max Pain

The strike where option holders lose the most. Price gravitates here near expiration.

⚡
### Magnetism

The phenomenon of price being "pulled" toward high-OI strikes as expiration approaches.

02 — Call Walls
## Resistance from Above

Call Wall
A strike with exceptionally high call open interest relative to surrounding strikes. Acts as resistance because dealers who sold these calls must hedge by selling the underlying as price approaches — creating selling pressure.
When you see a strike with 10,000 call contracts while surrounding strikes have 2,000-3,000, that's a call wall. The size matters — you're looking for **relative outliers**, not just high absolute numbers.

Identifying a Call Wall
1.14 2.1K
1.145 2.8K
1.15 3.5K
1.155 9.8K
1.16 2.5K
1.165 1.9K
The 1.155 strike has 3x the OI of surrounding strikes — this is a call wall.

💡 Why Call Walls Create Resistance
Market makers who sold these calls are **short gamma** at this strike. As price rises toward 1.155, their delta exposure increases, forcing them to sell the underlying to stay hedged. This selling pressure creates natural resistance. We'll explore this mechanism in detail in Lesson 5.

03 — Put Walls
## Support from Below

Put Wall
A strike with exceptionally high put open interest relative to surrounding strikes. Acts as support because dealers who sold these puts must hedge by buying the underlying as price approaches — creating buying pressure.
Put walls work as the mirror image of call walls. High put OI at a strike means dealers will need to buy to hedge as price falls toward that level, creating a natural floor.

Identifying a Put Wall
1.12 1.6K
1.125 2.4K
1.13 8.5K
1.135 2.9K
1.14 2.1K
1.145 1.8K
The 1.130 strike has 3x the OI of surrounding strikes — this is a put wall.

// Identifying Walls: The 3x Rule of Thumb Weak Wall: 1.5x surrounding OI — minor level Moderate Wall: 2x surrounding OI — worth watching Strong Wall: 3x+ surrounding OI — high probability level // Context matters: a 3x wall in a liquid market // is more significant than in an illiquid one
04 — Max Pain
## The Price Magnet

Max Pain
The strike price at which option holders (both calls and puts) would experience the maximum financial loss if the underlying expired at that price. Also called the "maximum pain point" or "op-ex price."
Max pain is calculated by determining, for each strike, the total value of all options that would expire worthless if the underlying closed at that strike. The strike with the highest total worthless value is max pain.

**Why does price gravitate to max pain?** Option sellers (primarily market makers and institutions) profit when options expire worthless. There's debate about whether this is active "pinning" or simply a result of gamma hedging dynamics, but the empirical tendency is observable.

// Simplified Max Pain Calculation For each strike, calculate: • Call Pain = Call OI × max(0, Strike − Current Price) • Put Pain = Put OI × max(0, Current Price − Strike) • Total Pain = Call Pain + Put Pain Max Pain Strike = Strike with lowest Total Pain // In practice, use online calculators or // estimate visually from the heatmap
⚠️ Max Pain Limitations
Max pain is most relevant **close to expiration** (within 2-3 days). Earlier in the cycle, other factors dominate. Also, max pain can shift as OI changes — it's a snapshot, not a fixed target. Use it as one input among many, not a guaranteed price target.

📅
### Timing Matters

Max pain effect is strongest in the final 48 hours before expiration. Earlier in the cycle, it's less predictive.

📊
### Quick Estimation

Look for the strike with roughly equal call and put OI on either side. This is often close to max pain.

05 — The Complete Picture
## Mapping the Battlefield

When you combine call walls, put walls, and max pain, you get a map of the likely price range and key levels. Here's how they typically align:

The Open Interest Structure
Put Wall 1.1300
Max Pain 1.1450
Call Wall 1.1600
Current 1.1400
The OI structure suggests a range between 1.1300 (put wall) and 1.1600 (call wall), with gravitational pull toward 1.1450 (max pain).

This structure tells you several things:

| Observation | Implication |
| Price below max pain | Upward bias toward max pain, especially approaching expiry |
| Put wall below current price | Strong support level; shorts may struggle below this |
| Call wall above current price | Strong resistance level; longs may struggle above this |
| Price between walls | Range-bound behavior likely until catalyst or expiry |

06 — Practical Application
## Reading the Heatmap for Key Levels

Let's walk through how to extract key levels from a CME heatmap systematically.

Sample OI Matrix — EUR/USD Front Month
Strike
Calls
Puts
Total
Notes
1.1600
8,450
1,200
9,650
← CALL WALL
1.1550
3,100
1,800
4,900
1.1500
2,400
2,200
4,600
← MAX PAIN ZONE
1.1450
1,900
2,600
4,500
1.1400
1,100
3,400
4,500
1.1350
800
7,800
8,600
← PUT WALL
**Step-by-step analysis:**

// Step 1: Identify Call Wall Scan the Calls column for the largest value → 1.1600 with 8,450 contracts (2.7x the next largest) // Step 2: Identify Put Wall Scan the Puts column for the largest value → 1.1350 with 7,800 contracts (2.3x the next largest) // Step 3: Estimate Max Pain Look for strike where Call OI ≈ Put OI → 1.1500 (2,400 calls vs 2,200 puts — nearly balanced) // Step 4: Define the Range Expected range: 1.1350 to 1.1600 Gravitational center: 1.1500
✓ The 80/20 Rule
You don't need to analyze every strike. Focus on the **top 1-2 call strikes** and **top 1-2 put strikes** by OI. These are your walls. Then identify the rough max pain zone. That's 80% of the value from 20% of the effort.

07 — Additional Metrics
## Put/Call Ratio and OI Skew

Beyond individual strikes, the overall distribution of puts vs calls provides context about market sentiment.

Put/Call OI Ratio
Total put open interest divided by total call open interest. A ratio above 1.0 means more puts than calls; below 1.0 means more calls than puts.
| P/C Ratio | Interpretation | Typical Market Behavior |
| < 0.7 | Very bullish positioning | Market may be overextended to upside; watch for reversal |
| 0.7 – 1.0 | Moderately bullish | Normal uptrend conditions |
| 1.0 – 1.3 | Neutral to cautious | Balanced market or hedging activity |
| > 1.3 | Bearish positioning / heavy hedging | Downside protection in demand; may signal fear or support |

💡 Contrarian Signal
Extreme P/C ratios can be contrarian indicators. Very high put ratios (fear) often mark bottoms. Very low put ratios (complacency) often mark tops. **But context matters** — during strong trends, "extreme" readings can persist.

**OI Skew** refers to the asymmetry of open interest across strikes. If put OI is concentrated at strikes far below current price while call OI is at strikes near current price, that's negative skew — suggesting more downside hedging. The reverse suggests participants are positioned for upside.

08 — Dynamic Analysis
## Tracking Changes in Open Interest

OI levels aren't static. Positions open and close daily. Tracking **changes** in OI can be as valuable as the absolute levels.

📈
### OI Increasing at Strike

New positions being opened. The level is becoming more significant. Walls are strengthening.

📉
### OI Decreasing at Strike

Positions being closed. The level is losing significance. Walls are weakening.

🔄
### OI Shifting Strikes

Large OI moving to different strikes suggests repositioning — new expected range.

⚡
Price breaking a wall with falling OI = positions closing = wall may not hold on retest.

// Scenario: Watching a Put Wall Day 1: 1.1350 put OI = 7,800 Day 2: 1.1350 put OI = 8,200 (+400) → Wall strengthening, support more reliable Day 3: Price touches 1.1350, bounces Day 4: 1.1350 put OI = 6,100 (-2,100) → Positions closed on the bounce — wall weakened → Next test of 1.1350 may break through
⚠️ Data Lag
Remember: CME OI data is from the previous day's close. You're always looking at yesterday's positioning. Significant intraday moves may have already changed the OI picture before you see updated data.

09 — Summary
## The OI Analysis Checklist

Here's your systematic process for analyzing OI before each session:

| # | Step | What You're Looking For |
| 1 | Pull up CME heatmap for your product | Focus on front-month expiration (highest liquidity) |
| 2 | Identify the call wall | Highest call OI strike — this is your resistance |
| 3 | Identify the put wall | Highest put OI strike — this is your support |
| 4 | Estimate max pain | Strike with balanced call/put OI — gravitational center |
| 5 | Calculate basis & convert strikes | Get spot-equivalent levels for your chart |
| 6 | Plot levels on your chart | Draw lines at converted call wall, put wall, max pain |
| 7 | Note P/C ratio and skew | Context for overall positioning sentiment |
| 8 | Compare to previous day | Are walls strengthening or weakening? |

10 — What's Next
## The Mechanics Behind the Walls

You now know how to identify walls, max pain, and key levels from OI data. But **why** do these levels work? What's the actual mechanism that creates support and resistance from option positioning?

The answer lies in **gamma** and **dealer hedging dynamics**. Lesson 5 dives into the mechanics — how market makers hedge, what gamma exposure means, and why price accelerates or decelerates at certain levels.

| Lesson | Topic | Status |
| 01 | Foundations of Open Interest | ✓ Complete |
| 02 | Reading the CME & Data Access | ✓ Complete |
| 03 | Futures to CFD Conversion | ✓ Complete |
| 04 | The Open Interest Matrix | ✓ Complete |
| 05 | Gamma & Dealer Dynamics | → Up Next |
| 06 | Trading Frameworks | Upcoming |

### 📌 Key Takeaways

- **Call Walls** = strikes with highest call OI → act as resistance (dealer selling pressure)

- **Put Walls** = strikes with highest put OI → act as support (dealer buying pressure)

- **Max Pain** = strike where options lose most value → price magnet near expiration

- Use the **3x rule**: walls are significant when OI is 3x+ surrounding strikes

- Max pain is most relevant **within 48 hours of expiry**; less predictive earlier

- The **P/C ratio** provides sentiment context; extremes can be contrarian signals

- Track **changes in OI** — strengthening walls are more reliable than weakening ones

- Focus on **front-month expirations** for highest liquidity and relevance

Previous Lesson
← Futures to CFD Conversion
Next Lesson
Gamma & Dealer Dynamics →
C.OG
Open Interest Course • Lesson 04 of 06

Educational content only. Not financial advice.
