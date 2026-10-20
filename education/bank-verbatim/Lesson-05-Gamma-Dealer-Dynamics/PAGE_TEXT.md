<!-- https://cog000.github.io/Lesson-05-Gamma-Dealer-Dynamics/ | Gamma & Dealer Dynamics — Lesson 05 -->
Colez Trades
Quantitative & Macro Insights
C.OG
C.OG Open Interest • Lesson 05 of 06
LESSON 05 — MECHANICS
# Gamma & Dealer Dynamics

Why walls work. How dealer hedging creates support, resistance, and acceleration. The mechanics behind the levels.

01 — The Missing Piece
## Why Do Walls Actually Work?

In Lesson 4, you learned to identify call walls (resistance) and put walls (support) from open interest data. But we glossed over the critical question: **what's the actual mechanism that makes these levels matter?**

The answer lies in how market makers hedge their option positions. When they sell options, they take on risk that must be managed. This hedging activity creates real buying and selling pressure in the underlying market — and that pressure is predictable if you understand the mechanics.

Core Concept
Market makers who sell options must continuously hedge their exposure by trading the underlying. This hedging is mechanical and predictable — it creates the support and resistance we observe at high-OI strikes.
02 — The Greeks
## Delta and Gamma: What You Need to Know

Options have several risk metrics called "Greeks." For understanding dealer hedging, you only need two: **Delta** and **Gamma**.

Δ
Delta
How much option price moves per $1 move in underlying
Γ
Gamma
How much delta changes per $1 move in underlying
Θ
Theta
Time decay — not critical for this analysis
V
Vega
Volatility sensitivity — not critical for this analysis
Delta
Measures how much an option's value changes when the underlying moves. A call with 0.50 delta gains $0.50 when the underlying rises $1. Delta also represents the probability the option expires in-the-money.
Gamma
Measures how fast delta changes. High gamma means delta changes rapidly with price movement. Gamma is highest for at-the-money options near expiration — this is where hedging activity is most intense.
💡 Why Gamma Matters More
Delta tells dealers how much to hedge right now. **Gamma tells them how much they'll need to adjust that hedge as price moves.** High gamma = constant rehedging = more market impact. This is why strikes with large OI near current price create the strongest effects.

03 — Dealer Hedging
## How Market Makers Stay Neutral

When a market maker sells a call option, they're exposed to unlimited upside risk. If price rises, they lose money. To neutralize this, they **buy the underlying** — this is called delta hedging.

The key insight: **as price changes, delta changes, and the hedge must be adjusted.** This continuous adjustment is what creates market impact.

Call Option Hedging Flow
Trigger
Price Rises
→
Effect
Call Delta Increases
→
Dealer Action
Buy Underlying
→
Market Impact
Supports Rally
When price rises toward a call strike, dealers buy to hedge — adding fuel to the move.

Put Option Hedging Flow
Trigger
Price Falls
→
Effect
Put Delta Increases
→
Dealer Action
Sell Underlying
→
Market Impact
Accelerates Decline
When price falls toward a put strike, dealers sell to hedge — adding pressure to the move.

Wait — this seems backwards. If dealers buy when price rises and sell when price falls, aren't they *accelerating* moves rather than creating support/resistance?

**Yes — when dealers are short gamma.** But when they're long gamma, the opposite happens. This is the key to understanding market structure.

04 — Gamma Exposure
## Long Gamma vs Short Gamma

The direction of hedging flow depends on whether dealers are **long gamma** (they bought options) or **short gamma** (they sold options). In most market conditions, dealers are net short gamma because retail and institutions are net buyers of options.

| Dealer Position | When Price Rises | When Price Falls | Market Effect |
| Short Gamma | Must buy underlying | Must sell underlying | **Amplifies** moves — trends accelerate |
| Long Gamma | Must sell underlying | Must buy underlying | **Dampens** moves — mean reversion |

Long Gamma Zone
Dealers sell into rallies, buy into dips
Price Stabilizes
Flip Point
Gamma exposure changes sign
Transition
Short Gamma Zone
Dealers buy into rallies, sell into dips
Price Accelerates
⚠️ The Gamma Flip
There's often a price level where aggregate dealer gamma exposure flips from positive to negative. Above this level, price tends to accelerate; below it, price tends to stabilize. This "gamma flip" level can be estimated from the OI distribution and is a key structural level to watch.

05 — Connecting the Dots
## Why Call Walls Create Resistance

Now we can explain the mechanism behind call walls. Let's trace through what happens when price approaches a strike with massive call OI.

// Scenario: Price approaching 1.1600 call wall Setup: • Large call OI at 1.1600 strike • Dealers are short these calls (they sold them) • Current price: 1.1550, rising As price approaches 1.1600: • Call delta increases (options getting closer to ITM) • Dealers must buy underlying to hedge • This buying supports the rally As price reaches/exceeds 1.1600: • Calls are now ATM/ITM — delta approaches 1.0 • Dealers are fully hedged — no more buying needed • Buying pressure evaporates • Without continued buying, rally stalls → RESISTANCE
The resistance isn't because dealers are actively selling. It's because the **buying pressure that supported the rally disappears** once they're fully hedged. The market loses its fuel.

Call Wall Mechanism
Dealer hedging provides buying support on the way up. Once price reaches the wall, hedging is complete — buying stops, momentum dies, price stalls or reverses.
06 — The Mirror Image
## Why Put Walls Create Support

Put walls work the same way in reverse. Dealers who sold puts must sell the underlying as price falls (to hedge increasing put delta). But once price reaches the put strike, they're fully hedged and the selling stops.

// Scenario: Price approaching 1.1350 put wall Setup: • Large put OI at 1.1350 strike • Dealers are short these puts (they sold them) • Current price: 1.1400, falling As price approaches 1.1350: • Put delta increases (magnitude) • Dealers must sell underlying to hedge • This selling accelerates the decline As price reaches/exceeds 1.1350: • Puts are now ATM/ITM — delta approaches -1.0 • Dealers are fully hedged — no more selling needed • Selling pressure evaporates • Without continued selling, decline stalls → SUPPORT
Put Wall Mechanism
Dealer hedging provides selling pressure on the way down. Once price reaches the wall, hedging is complete — selling stops, momentum dies, price stalls or bounces.
💡 The Counterintuitive Part
Dealer hedging actually **accelerates** the move toward a wall, then **stops** at the wall. The wall isn't a barrier that slows price down on approach — it's the point where the fuel runs out. This is why moves into walls can be sharp, then suddenly stall.

07 — Time Decay
## Why Effects Intensify Near Expiration

Gamma is highest for at-the-money options near expiration. This means hedging activity — and its market impact — intensifies dramatically in the final days before expiry.

Gamma Profile: ATM Option Over Time
[SVG: ]
30 DTE 14 DTE 7 DTE 1 DTE
Gamma Explodes
Gamma increases exponentially as expiration approaches, especially for ATM strikes.

📅
### 2+ Weeks Out

Gamma relatively flat. Hedging adjustments are gradual. OI levels matter but effects are muted.

📅
### 1 Week Out

Gamma rising. Hedging becomes more active. Walls start to exert stronger influence.

📅
### Final 48 Hours

Gamma peaks. Hedging is intense and rapid. Max pain magnetism strongest. Walls most effective.

✓ Practical Implication
Focus your OI analysis on the **nearest expiration with significant liquidity**. That's where gamma effects are strongest. Monthly options expiration (typically third Friday) and weekly expirations are the key dates to watch.

08 — When Walls Break
## Gamma Squeezes and Acceleration

Walls don't always hold. When price breaks through a major OI concentration with momentum, something interesting happens: **the hedging that created resistance now accelerates the move.**

// Scenario: Call wall break Setup: Price breaks above 1.1600 call wall What happens: • Calls go from ATM to ITM • Delta jumps toward 1.0 • Dealers who thought they were hedged now need MORE long exposure • Rapid buying to catch up → price accelerates higher // This is a "gamma squeeze" — hedging chases price
Gamma Squeeze
When price breaks through a high-OI strike, dealers must rapidly adjust hedges in the direction of the move. This forced buying (for calls) or selling (for puts) accelerates the breakout, creating explosive moves.
This is why wall breaks can be so violent. The same positioning that created resistance becomes fuel for acceleration once breached. **The bigger the wall, the bigger the potential squeeze.**

🧱
### Wall Holds

Price stalls, hedging complete, momentum dies. Look for reversal or consolidation.

💥
### Wall Breaks

Hedging chases price, gamma squeeze ignites. Expect acceleration toward the next major level.

09 — Synthesis
## The Complete Mental Model

Here's how to think about gamma and dealer hedging when analyzing markets:

| Scenario | Dealer Hedging | Price Behavior | Trading Implication |
| Price approaching call wall | Dealers buying | Rally supported, then stalls at wall | Look for resistance / reversal |
| Price breaks call wall | Dealers chase with more buying | Acceleration / gamma squeeze | Ride momentum to next level |
| Price approaching put wall | Dealers selling | Decline accelerates, then stalls at wall | Look for support / bounce |
| Price breaks put wall | Dealers chase with more selling | Acceleration / gamma squeeze down | Ride momentum to next level |
| Price between walls | Minimal hedging activity | Range-bound, technical-driven | Trade the range; watch for breakout |
| Near expiration | Gamma effects amplified | Max pain magnetism, sharp moves | Expect volatility; respect walls |

💡 The Feedback Loop
Price movement → Delta change → Hedging activity → More price movement. This feedback loop is why options positioning creates such predictable market structure. OI tells you where the loop will engage; gamma tells you how powerful it will be.

10 — What's Next
## From Theory to Trading

You now understand the complete picture: **what** open interest is, **where** to find it, **how** to convert it to usable levels, **which** levels matter, and **why** they work mechanically.

The final lesson brings it all together into **actionable trading frameworks**. You'll learn systematic approaches for incorporating OI analysis into your trading process — from pre-session preparation to trade execution to position management.

| Lesson | Topic | Status |
| 01 | Foundations of Open Interest | ✓ Complete |
| 02 | Reading the CME & Data Access | ✓ Complete |
| 03 | Futures to CFD Conversion | ✓ Complete |
| 04 | The Open Interest Matrix | ✓ Complete |
| 05 | Gamma & Dealer Dynamics | ✓ Complete |
| 06 | Trading Frameworks | → Up Next |

### 📌 Key Takeaways

- **Delta** = how much option value changes with price; **Gamma** = how fast delta changes

- Dealers hedge by trading the underlying — this hedging is **mechanical and predictable**

- **Short gamma** = dealers buy rallies, sell dips → amplifies moves

- **Long gamma** = dealers sell rallies, buy dips → dampens moves

- Call walls create resistance because **buying pressure evaporates** when hedging is complete

- Put walls create support because **selling pressure evaporates** when hedging is complete

- When walls break, hedging **chases price** → gamma squeeze / acceleration

- Gamma effects **intensify near expiration** — final 48 hours are most powerful

- The bigger the OI at a strike, the bigger the **potential gamma effect** at that level

Previous Lesson
← The Open Interest Matrix
Final Lesson
Trading Frameworks →
C.OG
Open Interest Course • Lesson 05 of 06

Educational content only. Not financial advice.
