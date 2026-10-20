<!-- https://cog000.github.io/Fixed-Income/ | Lesson 4 — Fixed Income Fundamentals for Traders -->
Colez Trades
Quantitative & Macro Insights
C.OG
# Lesson 4

Fixed Income Fundamentals for Traders

**📊 Note:** Bond math principles (price/yield inverse, duration) are mathematical facts. Relationships between bonds and other assets (FX, equities) are well-established but vary in strength across market regimes. Charts showing correlations and lead-lag relationships are illustrative of typical patterns — always verify with current data.

1
## Bond Math Essentials

Before you can use bonds as a trading tool, you need to understand how they work. The core concepts are simple but foundational — everything else builds on the **inverse relationship between price and yield**. Get this wrong, and nothing else makes sense.

#### Why Bond Math Matters for Non-Bond Traders

Even if you never trade a bond directly, understanding bond math helps you interpret the signals bond markets send. When someone says "yields are rising," you need to know that means bond prices are falling, investors are demanding more compensation, and risk-free rates are increasing — all of which affect equities, FX, and everything else.

### The Fundamental Law of Bonds

PRICE ↑
⟷
YIELD ↓
When bond prices rise, yields fall. When bond prices fall, yields rise. **Always.** This is mathematical, not opinion.

### Why Price and Yield Move Opposite

#### The Intuition

Imagine you own a bond that pays $50 per year (5% coupon on $1,000 face value). Now interest rates rise, and new bonds pay $60 per year.

Who would pay full price for your bond that only pays $50 when they can buy a new one paying $60? No one. So your bond's price must fall until its effective yield matches the new market rate.

That's the inverse relationship: when market rates rise, existing bond prices fall to compensate. When rates fall, existing bonds become more valuable.

Yield ≈ Coupon / Price
This simplified formula shows the relationship: if the coupon is fixed and the price falls, the yield (coupon ÷ price) must rise. If price rises, yield falls.

### Key Bond Terms

**Face Value (Par):** The amount the bond pays at maturity — typically $1,000. A bond trading "at par" is priced at 100 (100% of face value).

**Coupon:** The periodic interest payment, expressed as an annual percentage of face value. A 5% coupon on a $1,000 bond pays $50/year.

**Maturity:** When the bond expires and repays its face value. A "10-year Treasury" matures 10 years from issuance.

**Yield to Maturity (YTM):** The total return you'd earn if you held the bond until maturity, accounting for price, coupon, and time. This is the "yield" people usually reference.

### Reading Bond Prices

Bond prices are quoted as a percentage of face value:

| Price Quote | Meaning | Yield Implication |
| **100** (Par) | Trading at exactly face value ($1,000) | Yield = Coupon rate |
| **95** (Discount) | Trading below face value ($950) | Yield > Coupon rate (you get capital gain at maturity) |
| **105** (Premium) | Trading above face value ($1,050) | Yield < Coupon rate (you take capital loss at maturity) |

**When You See Headlines:** "10Y yield hits 4.5%" means investors are demanding 4.5% annual return to hold 10-year Treasuries. If yesterday it was 4.3%, yields rose and prices fell — bond holders lost money, but new buyers get better rates.

#### Section Summary

- **Price and yield move inversely** — this is mathematical, not optional

- **When yields rise, bond prices fall** — existing bonds become less attractive vs new higher-yielding bonds

- **YTM (Yield to Maturity)** is the standard yield measure — total return if held to maturity

- **Price at 100 = par** — below 100 is discount, above 100 is premium

2
## Duration & Convexity — Measuring Interest Rate Risk

Not all bonds react equally to rate changes. A 2-year bond and a 30-year bond live in different worlds when rates move. **Duration** measures this sensitivity — and it's one of the most important concepts in finance, affecting not just bonds but equities, currencies, and portfolio construction.

#### Duration in Plain English

**Duration** tells you approximately how much a bond's price will change for a 1% move in interest rates.

A bond with duration of 5 will fall roughly 5% if rates rise 1%, and rise roughly 5% if rates fall 1%.

Longer maturity bonds have higher duration — they're more sensitive to rate changes because you're locked in for longer.

~2
2-Year Treasury Duration
Low sensitivity
~8
10-Year Treasury Duration
Medium sensitivity
~18
30-Year Treasury Duration
High sensitivity
~25+
Long-Duration Stocks
Growth stocks have "duration" too
### The Duration Rule of Thumb

Price Change ≈ −Duration × Yield Change
This approximation works well for small yield changes:

| Bond | Duration | If Yields Rise 0.5% | If Yields Fall 0.5% |
| 2-Year Treasury | ~2 | ≈ −1% | ≈ +1% |
| 10-Year Treasury | ~8 | ≈ −4% | ≈ +4% |
| 30-Year Treasury | ~18 | ≈ −9% | ≈ +9% |

**This is why 2022 was historic:** 10-year yields rose roughly 2.5% (from ~1.5% to ~4%). With duration of ~8, that implied roughly 20% losses — the worst bond market in decades.

### Why Growth Stocks Have Duration

Here's a concept most equity traders miss: **stocks have duration too**, especially growth stocks.

A growth stock's value comes primarily from earnings expected far in the future. When you discount those future earnings back to today, higher interest rates make them worth less — just like a long-dated bond.

**High-duration equities:** Growth stocks, tech, unprofitable companies with value based on distant future profits. These act like long-dated bonds — they get crushed when rates rise.

**Low-duration equities:** Value stocks, banks, companies with near-term cash flows. Less sensitive to rate changes; banks often benefit from higher rates.

**Trading Implication:** When you see long-duration bonds (like TLT) moving, growth stocks tend to move with them. This is why Nasdaq and 30-year Treasuries often trade together — they're both long-duration assets.

### Convexity: The Curve in the Relationship

Duration assumes a linear relationship, but it's actually curved. **Convexity** measures this curvature:

- **Positive convexity:** Most bonds have this — prices rise more when yields fall than they fall when yields rise (by the same amount). This is good for the holder.

- **Negative convexity:** Some instruments (like mortgage-backed securities) have this — they behave worse than duration predicts in both directions due to prepayment risk.

#### Why This Matters Practically

For most trading purposes, duration is enough. Convexity matters more for:

• Portfolio managers running large bond books

• Understanding MBS (mortgage-backed securities) behavior

• Large yield moves where the linear approximation breaks down

#### Section Summary

- **Duration ≈ % price change per 1% yield move** — a bond with duration 8 falls ~8% if yields rise 1%

- **Longer maturity = higher duration = more rate sensitivity**

- **Growth stocks are "long duration" assets** — they trade like long bonds

- **2022's bond crash makes sense through duration** — ~2.5% yield rise × ~8 duration ≈ 20% loss

- **Convexity is the curve** — prices rise more than they fall for equal yield moves (usually)

3
## The Yield Curve Deep Dive

The yield curve — a plot of yields across different maturities — is one of the most powerful forecasting tools in finance. Its shape tells you what the bond market expects about growth, inflation, and recession risk. Learning to read it gives you an edge over traders who only watch price charts.

#### What the Yield Curve Shows

The yield curve plots interest rates (vertical axis) against time to maturity (horizontal axis). Typically, you see yields for 3-month, 2-year, 5-year, 10-year, and 30-year Treasuries.

**Why it matters:** The shape of this curve reflects the market's collective expectations about future interest rates, growth, and inflation. It's the bond market "talking" — and the bond market is usually smarter than the stock market.

### Yield Curve Shapes and What They Signal

##### Normal (Upward Sloping)

[SVG: ]
Longer rates higher than short. Healthy economy expected. Growth and inflation anticipated.
##### Flat

[SVG: ]
Short and long rates similar. Uncertainty about direction. Often a transition phase.
##### Inverted

[SVG: ]
Short rates higher than long. Recession signal. Market expects rate cuts ahead.
##### Humped

[SVG: ]
Middle rates highest. Rare. Often signals policy transition or unusual conditions.
### Why Inversion Predicts Recessions

An inverted yield curve has preceded every US recession in the past 50+ years. Here's the logic:

#### The Inversion Mechanism

1
Fed tightening raises short rates
The Fed hikes to fight inflation, pushing 2Y yields higher.

2
Market expects eventual slowdown
Higher rates will eventually slow the economy and force the Fed to cut.

3
Long rates stay lower
10Y and 30Y yields reflect expected average rates over time — if cuts are coming, they don't rise as much.

4
Curve inverts
2Y > 10Y = market is pricing in that the Fed will be forced to cut.

**Important nuance:** Inversion signals recession risk, but timing is variable. Historically, recessions have followed inversions by anywhere from 6 to 24 months. It's a warning sign, not a precise timer.

### Key Spreads to Watch

Not all curve measures are equal. These are the most-watched spreads:

**2Y-10Y Spread (2s10s):** The most popular measure. Negative = inverted. This is what most people mean by "the curve." Watched closely by media and Fed.

**3M-10Y Spread:** Some research suggests this has better recession-predictive power than 2s10s. The Fed's preferred measure.

**2Y-30Y Spread (2s30s):** Captures the very long end. More volatile, can move differently than 2s10s.

| Spread | Positive | Negative |
| **2s10s** | Normal curve | Inverted — recession warning |
| **2s30s** | Steep curve | Rare, severe inversion |

Yield Curve Inversion and Economic Cycles (Illustrative)
Historically, sustained inversions have preceded recessions — but with variable lead times
[CANVAS chart]
### Steepener vs Flattener Dynamics

Understanding how the curve changes — not just its shape — reveals market expectations:

| Move | What's Happening | What It Signals |
| **Bull Steepener** | Short rates fall faster than long rates | Market pricing Fed cuts; often early recession or crisis response |
| **Bear Steepener** | Long rates rise faster than short rates | Growth/inflation expectations rising; can signal recovery or inflation fear |
| **Bull Flattener** | Long rates fall faster than short rates | Flight to quality; growth fears; long bonds bid as safe haven |
| **Bear Flattener** | Short rates rise faster than long rates | Fed tightening; market expects hikes will slow economy; inversion risk |

#### 🎯 Practical Application: Reading the Curve for Equity Positioning

Use curve dynamics to inform equity allocation:

- **Curve steepening (bull or bear):** Generally favors cyclicals, value, banks — these benefit from "normal" rate environment

- **Curve flattening toward inversion:** Caution signal — consider reducing cyclical exposure, favor defensive sectors

- **Curve deeply inverted:** Recession risk elevated — but timing uncertain. Don't panic, but reduce risk gradually

- **Curve UN-inverting rapidly:** Often happens right before recession actually starts — the steepening after inversion can be the final warning

#### Section Summary

- **Normal curve = upward sloping** — healthy economy expected

- **Inverted curve = recession warning** — has preceded every US recession in 50+ years

- **2s10s spread is most-watched** — negative = inverted

- **Timing is variable** — recessions follow inversions by 6-24 months historically

- **How the curve moves matters** — steepener vs flattener reveals expectations

4
## Credit Spreads & Risk Appetite

Credit spreads measure the extra yield investors demand to hold risky corporate bonds instead of safe government bonds. They're one of the best **fear gauges** in markets — often providing early warning of equity selloffs before stocks themselves react.

#### What Is a Credit Spread?

If a Treasury yields 4% and a corporate bond yields 6%, the credit spread is 2% (or 200 basis points). This extra 2% compensates investors for the risk that the company might default.

**Spreads widening** = investors demanding more compensation for risk = fear rising

**Spreads tightening** = investors accepting less compensation = confidence rising

IG
Investment Grade
BBB- and above; lower risk
HY
High Yield ("Junk")
BB+ and below; higher risk
OAS
Option-Adjusted Spread
Spread accounting for embedded options
CDX
Credit Default Index
Tradeable credit spread index
### Credit Spreads as Early Warning

Credit markets often sniff out trouble before equity markets. Here's why:

- **Bond investors are different:** More institutional, more focused on downside risk, less swayed by narrative

- **Bonds have defined downside:** Bond investors get paid back or they don't — they're naturally skeptical

- **Liquidity matters more:** Credit markets can seize up faster than equity markets, giving early signals

**Classic Pattern:** Credit spreads start widening → equity markets ignore for days/weeks → eventually equity sells off. If you watched credit, you had warning.

#### 📚 Example: 2008 Financial Crisis

High yield spreads began widening significantly in summer 2007. Equity markets made new highs in October 2007. Credit was warning for months before the equity peak.

### Reading Credit Spreads

| HY Spread Level | Interpretation |
| **Below 300 bps** | Very tight — Strong risk appetite, potentially complacent |
| **300-400 bps** | Normal range — Healthy risk appetite |
| **400-500 bps** | Elevated — Some stress, worth monitoring |
| **500-700 bps** | Stressed — Risk-off, recession pricing |
| **Above 800 bps** | Crisis — Distress, defaults expected |

**Note:** These are rough guideposts, not precise triggers. The level matters less than the direction and speed of change. Spreads widening 50bps in a week is more significant than a slow drift.

High Yield Spreads vs S&P 500: The Fear Gauge Relationship (Illustrative)
Credit spreads often lead equity moves — widening spreads are a warning sign
[CANVAS chart]
### CDX Indices: Tradeable Credit

For active monitoring and trading, the CDX indices are essential:

**CDX IG (Investment Grade):** Index of 125 North American investment-grade companies. Tighter = healthy, wider = stress.

**CDX HY (High Yield):** Index of 100 high-yield companies. More volatile than IG, more correlated with equities.

These indices are liquid and tradeable, making them useful for both monitoring and hedging. Many institutional desks watch CDX more closely than equity indices for real-time risk sentiment.

#### 🎯 Practical Application: Credit Spread Monitoring

Incorporate credit into your daily routine:

- **Daily check:** Look at HY spread level and direction. Widening trend = caution for equity longs.

- **Divergence alert:** If equities rally but credit spreads widen, be skeptical of the rally.

- **Speed matters:** Spreads widening 20+ bps in a single day often precedes equity volatility.

- **Confirmation:** When adding equity risk, prefer doing so when credit is stable or tightening.

#### Section Summary

- **Credit spread = extra yield for risk** — wider spreads = more fear

- **Credit often leads equities** — bond investors are skeptical by nature

- **Watch direction, not just level** — fast widening is the warning sign

- **CDX HY is the key index** — liquid, tradeable, closely watched by institutions

- **Divergences matter** — stocks up + spreads widening = be skeptical

5
## TIPS & Real Yields

**Real yields** — interest rates adjusted for inflation — are among the most important drivers of gold, growth stocks, and other "long-duration" assets. Understanding them gives you insight into what actually moves these assets, not just what the headlines claim.

#### Real Yield in Plain English

**Nominal yield** = the rate you see quoted (e.g., "10Y at 4.5%")

**Real yield** = nominal yield minus inflation expectations

If nominal yield is 4.5% and expected inflation is 2.5%, the real yield is about 2%. That's your "true" return after inflation.

### Why Real Yields Matter

Real yields are the **opportunity cost of holding non-yielding assets**:

**High real yields:** You can earn a real return holding bonds. Why hold gold (no yield), speculative growth stocks (distant profits), or crypto? The opportunity cost is high.

**Low or negative real yields:** Bonds don't even keep up with inflation. Might as well hold gold, growth stocks, or other assets with upside potential.

**The Gold Relationship:** Gold tends to perform well when real yields are falling or negative, and struggles when real yields are rising. This relationship is well-documented over decades.

### TIPS: How to Measure Real Yields

**Treasury Inflation-Protected Securities (TIPS)** are bonds whose principal adjusts with inflation. Their yield is a direct measure of real yields:

- **TIPS yield** = real yield (approximately)

- **Nominal Treasury yield − TIPS yield** = breakeven inflation (market's inflation expectation)

Breakeven Inflation = Nominal Yield − TIPS Yield
Example: If 10Y Treasury yields 4.5% and 10Y TIPS yields 2.0%, the breakeven inflation is 2.5% — that's what the market expects inflation to average over 10 years.

Real Yields vs Gold: The Inverse Relationship (Illustrative)
Rising real yields tend to pressure gold; falling real yields support it
[CANVAS chart]
### Real Yields and Growth Stocks

The same logic applies to growth stocks — they're "long-duration" assets sensitive to real yields:

| Real Yield Environment | Impact on Gold | Impact on Growth Stocks |
| **Negative or falling** | Supportive | Supportive — Lower discount rate |
| **Rising toward positive** | Pressure | Pressure — Higher discount rate |
| **High positive (2%+)** | Headwind | Challenging — But can work if growth strong enough |

**2022 in context:** Real yields went from deeply negative (roughly -1%) to positive (roughly +1.5%). That ~2.5% swing crushed both gold and growth stocks simultaneously. It wasn't random — it was real yields.

#### 🎯 Practical Application: Monitoring Real Yields

- **Track 10Y TIPS yield:** This is the most-watched real yield measure. Available on FRED, TradingView, Bloomberg.

- **Watch direction, not just level:** Real yields rising from -0.5% to +0.5% matters more than sitting steady at +1%.

- **Cross-check gold and growth:** If real yields are falling and gold/growth stocks aren't responding, something else is at play.

- **Breakeven inflation matters too:** If nominal yields rise but it's all inflation expectations (breakevens rising), real yields may not be rising much.

#### Section Summary

- **Real yield = nominal yield − inflation expectations**

- **TIPS yield is a direct measure of real yields**

- **High real yields = headwind for gold and growth stocks** — opportunity cost of holding non-yielding assets

- **Negative/falling real yields = tailwind for gold and growth**

- **2022's damage was largely a real yield story** — the swing from negative to positive real yields hit multiple asset classes

6
## Yields as the FX Driver

This is where fixed income knowledge becomes **actionable for all traders**. Rate differentials between countries are the primary driver of currency moves over medium-term horizons. Understanding this linkage lets you anticipate FX moves by watching bonds — often before the FX market fully prices the information.

#### The Core Mechanism

**Money flows to where it earns the highest return.** If US rates are 5% and European rates are 3%, capital flows toward US dollar assets to capture that extra yield. This flow increases demand for USD and pushes EUR/USD lower.

This is the fundamental driver of FX over weeks and months — more important than GDP growth, trade balances, or politics in most regimes.

### Why 2-Year Yields Matter Most

Not all yields are equal for FX. The **2-year yield** is the sweet spot:

- **Reflects policy expectations:** 2Y is highly sensitive to central bank policy trajectory

- **Less noise than short-end:** 3-month rates are too volatile day-to-day

- **More policy-driven than 10Y:** Long-end includes term premium, inflation uncertainty

- **Institutional focus:** FX desks at major banks watch 2Y differentials closely

**Rule of Thumb:** Track the 2Y yield differential between two countries to understand the fundamental FX pressure. If US-Germany 2Y spread is widening, that's USD-positive and EUR-negative.

### Key Rate Differential Pairs

| FX Pair | Rate Spread to Watch | Relationship |
| **EUR/USD** | US 2Y − Germany 2Y | Spread widens → EUR/USD falls |
| **USD/JPY** | US 2Y − Japan 2Y | Spread widens → USD/JPY rises |
| **GBP/USD** | UK 2Y − US 2Y | UK spread widens → GBP/USD rises |
| **AUD/USD** | Australia 2Y − US 2Y | Aussie spread widens → AUD/USD rises |

**Correlation is not constant:** Rate differentials typically explain a significant portion of FX variance, but the relationship strength varies. During risk-off episodes, safe-haven flows can override rate differentials (JPY rallies even with bad carry).

Rate Differentials Drive FX: US-Japan 2Y Spread vs USD/JPY (Illustrative)
When rate spreads widen in favor of USD, the dollar typically strengthens — but relationship varies by regime
[CANVAS chart]
### When Rates DON'T Drive FX

The rate-FX relationship is strong but not absolute. Know when it breaks down:

| Scenario | What Happens | Why |
| **Risk-off panic** | JPY and CHF rally regardless of rates | Safe-haven flows overwhelm carry logic |
| **Central bank intervention** | FX moves sharply against rate logic | BoJ/PBoC intervention can overpower markets short-term |
| **Balance of payments crisis** | EM currency collapses despite high rates | Capital flight dominates; rates can't compensate for risk |
| **Extreme positioning** | FX reverses despite rates continuing | Everyone already positioned; unwind mechanics dominate |

#### 📚 Case Study: USD/JPY 2021-2024

The USD/JPY move from ~110 to ~150+ is a textbook rate differential story:

- **Starting point:** US and Japan both near zero rates, small differential

- **2022-2023:** Fed hiked aggressively while BoJ stayed at zero (YCC policy)

- **Differential blew out:** US 2Y went from ~0.25% to ~5%, Japan stayed near zero

- **USD/JPY followed:** The pair tracked the differential closely, with correlation at the higher end of historical range

- **Intervention attempted:** Japan intervened multiple times but couldn't sustainably reverse the rate-driven trend

**Lesson:** Rate differentials are powerful. Even direct central bank intervention struggled against the fundamental flow pressure.

#### 🎯 Practical Application: Using Rates to Inform FX Views

- **Build a rate diff watchlist:** Track US 2Y vs Germany, Japan, UK, Australia at minimum

- **Watch for divergence:** If rate differentials move but FX doesn't follow, ask why — it might catch up, or something else is driving

- **Central bank meetings:** Rate expectations shift around FOMC, ECB, BoJ — this is when FX moves get confirmed or reversed

- **Combine with technicals:** Rate differentials give you fundamental bias; use technicals for entry timing

#### Section Summary

- **Rate differentials drive FX** over medium-term horizons — money flows to higher yields

- **2Y yields are the key tenor** — reflects policy expectations without long-end noise

- **Watch the spread, not absolute levels** — US 5% vs EU 3% matters more than US 5% alone

- **Relationship varies by regime** — strong in normal conditions, can break in risk-off or intervention

- **USD/JPY is the cleanest example** — the 2021-2024 move was largely a rate differential story

7
## Bonds Leading Equities — The Institutional View

Bond markets process information faster than equity markets. Understanding this lead-lag relationship lets you use bonds as an early warning system for equity moves. This isn't about predicting every tick — it's about seeing the macro picture develop before equity traders react.

#### Why Bonds Often Lead

**Different participants:** Bond markets are dominated by institutions — central banks, pension funds, insurance companies, banks. These players are often more sophisticated and move on macro information faster.

**Different focus:** Bond investors are obsessed with downside risk. They get paid back or they don't. This makes them naturally skeptical and quicker to react to warning signs.

**Different liquidity:** Treasury markets are among the most liquid in the world. Information gets priced quickly.

### The Information Cascade

Macro information flows through markets in sequence:

#### How Information Flows

1
Policy signals emerge
Fed speech, data release, or global event

2
Bond markets react (hours to days)
Yields adjust to reflect new rate path expectations

3
FX markets adjust (days to weeks)
Rate differentials flow through to currencies

4
Equity markets reprice (weeks to months)
Valuations adjust to new rate environment; earnings expectations update

**Implication:** If you only watch equities, you're seeing the last domino fall. Watching bonds gives you advance warning.

### Yield Levels and Equity Valuations

Interest rates directly affect stock valuations through the discount rate:

**Higher rates = lower P/E multiples:** Future earnings are worth less when discounted at higher rates. This is mathematical, not opinion.

**Rate of change matters most:** A rapid move from 3% to 5% is more disruptive than sitting at 5% for a year. Markets need time to adjust.

**Level sensitivity varies:** The impact of rates rising from 4% to 5% is different than from 0% to 1% — markets are more adjusted to "normal" rate levels.

**Caution:** Don't use simplistic rules like "10Y above X% = sell stocks." The relationship depends on why rates are moving (growth optimism vs inflation fear) and what's already priced in.

### The MOVE Index: Bond Market VIX

Just as VIX measures equity volatility, the **MOVE Index** measures Treasury volatility:

| MOVE Level | Interpretation |
| **Below 80** | Low vol — Calm bond market, stable rate expectations |
| **80-120** | Normal — Typical uncertainty range |
| **120-150** | Elevated — Rising rate uncertainty, watch for equity spillover |
| **Above 150** | High stress — Bond market turmoil, equities typically follow |

**Why MOVE matters:** MOVE spikes often precede VIX spikes. Bond volatility can signal equity trouble before it shows up in stock prices. March 2023 (SVB crisis) saw MOVE spike to extreme levels before equities fully reacted.

#### 🎯 Practical Application: Bond-First Framework

Before initiating any equity position, check bonds:

- **What are yields doing?** Rising yields = headwind for growth/long-duration stocks

- **What's the curve saying?** Flattening/inverting = caution; steepening = depends on why

- **What are credit spreads doing?** Widening = risk-off warning

- **What's MOVE doing?** Elevated MOVE = expect equity vol to follow

- **Is there divergence?** If bonds are warning but stocks are rallying, be skeptical of the rally

#### Section Summary

- **Bonds often process information before equities** — institutional participants, macro focus

- **Information cascades through hierarchy:** Policy → Bonds → FX → Equities

- **Rate of change matters more than level** — rapid moves are more disruptive

- **MOVE index is bond market VIX** — spikes often precede equity volatility

- **Check bonds before equity trades** — yield direction, curve shape, credit spreads, MOVE

Run through this each morning before trading:

- **10Y yield:** Up, down, or flat vs yesterday? vs last week?

- **2s10s spread:** Steepening or flattening? Still inverted?

- **2Y yield:** Policy expectations shifting?

- **HY spreads (CDX HY):** Tightening or widening?

- **MOVE index:** Elevated or calm?

- **Real yields (10Y TIPS):** Rising or falling?

- **Rate differentials:** US vs major partners shifting?

**Time required:** 5 minutes. This context shapes your entire trading day.

#### 🎯 Weekly Bond Market Review

End of week, zoom out and assess:

- **Yield trend:** What was the net change in 2Y and 10Y this week?

- **Curve evolution:** Did the curve steepen or flatten over the week?

- **Credit trend:** Did spreads tighten or widen net-net?

- **FX confirmation:** Did FX moves align with rate differential changes?

- **Equity alignment:** Did stocks move in a direction consistent with bond signals?

- **Divergences noted:** Any cross-asset disagreements to monitor next week?

- **Upcoming events:** Any Treasury auctions, Fed speakers, or data that could move bonds?

#### 🎯 Pre-Trade Bond Check

Before entering any significant position:

- **Does my view align with bond signals?** Long risk? Check yields stable/falling, spreads stable/tight, MOVE calm Short risk? Check yields spiking, spreads widening, MOVE elevated

- **Is there a divergence I should respect?** If bonds disagree with my equity view, why? Am I smarter than the bond market?

- **Duration exposure:** Am I long growth/tech while yields are rising? Understand the headwind.

- **Event risk:** Any auctions or Fed events that could move yields and affect my position?

#### 📚 Putting It Together: 2022 Bear Market

The 2022 selloff is a masterclass in bond-equity linkage:

- **Yields surged:** 10Y went from ~1.5% to ~4.2% — a historic move

- **Real yields flipped:** From deeply negative to positive — crushed gold and growth

- **Curve inverted:** 2s10s went negative — recession warning

- **Credit spreads widened:** HY spreads roughly doubled — risk-off

- **MOVE spiked:** Bond volatility at multi-year highs

- **USD surged:** Rate differentials widened massively vs Europe and Japan

- **Equities followed:** S&P down ~25%, Nasdaq down ~35% — duration assets hit hardest

**Lesson:** If you watched bonds, none of the equity carnage was surprising. Every signal — yields, curve, spreads, real yields, MOVE — was screaming caution.

#### Section Summary

- **Work through the hierarchy:** Rates → Curve → Credit → Real yields → FX → THEN equities

- **Combine yield level + curve shape** for complete picture

- **Divergences are warnings:** When bonds and stocks disagree, investigate

- **Daily scan takes 5 minutes** — and shapes your entire trading day

- **2022 was a bond-led selloff** — all signals were visible in fixed income first

### Key Takeaways

⚖️
#### Price & Yield Are Opposites

This is mathematical, not optional. When yields rise, bond prices fall. Master this or nothing else makes sense.

📏
#### Duration = Rate Sensitivity

Longer duration = more volatile. Growth stocks are long-duration assets — they trade like long bonds. This explains 2022.

📉
#### The Curve Predicts Recessions

Inversion has preceded every US recession in 50+ years. Lead time varies (6-24 months), but the signal is reliable.

😰
#### Credit Spreads = Fear Gauge

Widening spreads often lead equity selloffs. If spreads are warning but stocks are rallying, be skeptical.

💰
#### Rate Differentials Drive FX

Money flows to higher yields. 2Y spreads are the key metric. Watch US vs Germany, Japan, UK for major pairs.

🥇
#### Real Yields Drive Gold & Growth

High real yields = headwind for non-yielding assets. Negative real yields = tailwind. Watch TIPS yields.

🔮
#### Bonds Lead, Equities Follow

Information cascades through the hierarchy. Watching bonds gives you advance warning of equity moves.

✅
#### Check Bonds Before Every Trade

5-minute daily scan: yields, curve, spreads, MOVE, real yields. This context shapes everything.
