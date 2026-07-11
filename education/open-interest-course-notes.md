# Open Interest Course — Lesson Notes

> **Source:** Colez Trades, "Open Interest" course, Lessons 01–06.
> **Purpose:** raw study notes on the lesson material — the key facts, definitions,
> formulas, and frameworks as taught — plus a list of research ideas and areas of
> interest to investigate off the back of them. For learning, exam-style recall,
> and future real-time implementation.

**Course arc:** what OI is (L1) → where to get the data (L2) → converting futures
strikes to spot/CFD levels (L3) → the analytical framework: walls, max pain,
magnetism (L4) → the mechanism: gamma and dealer hedging (L5) → trading
frameworks and daily process (L6).

---

## Lesson 01 — Foundations of Open Interest

### Definition

**Open Interest (OI)** = the total number of outstanding derivative contracts
(futures or options) currently open — not closed, exercised, or expired.

Every contract has two parties (a buyer and a seller). New contract created →
OI +1. Existing contract closed → OI −1.

### OI vs Volume — the critical distinction

| Metric | Measures | Resets daily? | Tells you about |
|---|---|---|---|
| Volume | contracts traded today | yes — starts at zero | activity and liquidity |
| Open Interest | contracts still held | no — cumulative | positioning and commitment |

Volume measures **activity**; OI measures **commitment**. Most retail traders
miss this distinction entirely.

### The four trade scenarios (mechanics)

1. **New buyer + new seller** → new contract born → OI **+1**.
2. **Long closes + short closes** → contract ceases to exist → OI **−1**.
3. **Existing long sells to a new buyer** → transfer → OI **unchanged** (volume up).
4. **Existing short buys from a new seller** → transfer → OI **unchanged** (volume up).

Key inference: **rising OI = new money entering the market; falling OI =
positions being liquidated.** Volume alone can't tell you which — high volume
could be either.

### OI + price interpretation

Lesson example — same price move, opposite meanings:

```
Price rises 100 → 105
Case A: OI +15,000  → new longs entering, trend likely to continue
Case B: OI −15,000  → shorts covering, rally may be exhausted
```

- Rising price + rising OI = new longs entering (healthy trend).
- Rising price + falling OI = short covering (weak rally).

### Market scale

- Global equities ≈ **$100T**; global bonds ≈ **$130T**; global derivatives ≈
  **$700T+ notional** — roughly 7× equities and bonds combined.
- This is where institutions hedge risk, express macro views, take leveraged
  exposure, and where market makers dynamically hedge their books.
- Three drivers of institutional activity: **hedging** (large put positions
  show where smart money sees risk), **leverage/exposure** (futures on margin),
  **market making** (dealer hedging around key strikes creates predictable
  price behaviour).

### Why retail misses this (the blind spot)

1. **Education gap** — retail education is chart patterns and indicators.
2. **Complexity barrier** — strikes, expirations, Greeks put people off.
3. **Platform limitations** — retail platforms emphasise price; OI needs the exchange.
4. **CFD/spot focus** — traders don't realise futures/options data applies to them.

The information asymmetry: institutions analyse positioning; retail draws lines
on charts unaware of the option structures sitting at key levels. The data is
public and free — the edge is knowing where to look.

### What OI reveals (the claimed edge)

- **Support & resistance** — large put OI acts as support; large call OI as
  resistance. Levels where real money is positioned, not arbitrary lines.
- **Price magnets** — near expiration, price gravitates toward max-pain strikes.
- **Trend confirmation** — OI contextualises price moves (see cases above).
- **Gamma acceleration** — breaks through concentrated-OI levels accelerate via
  dealer hedging.

### The destination tool

The **CME Options Open Interest Heatmap** — free, public, used by institutions,
updated daily. Strikes vertical, expirations horizontal, C = calls, P = puts,
cyan intensity = OI concentration.

---

## Lesson 02 — Reading the CME

### Why the CME

CME Group = world's largest derivatives exchange (CME + CBOT + NYMEX + COMEX).
FX, indices, commodities, rates — institutional positioning happens here. The
heatmap is the same data desks at Goldman/JPM/hedge funds use. **Free, no
account required, updates daily.**

### Access

URL: `cmegroup.com/tools-information/quikstrike/options-open-interest-heatmap.html`

Navigation: **Select Product → Asset Class → Product Family → Product**
(three-column drill-down). Example: Foreign Exchange → FX Majors → EUR/USD (6E).

| Asset class | Includes | Key products |
|---|---|---|
| Foreign Exchange | currency futures & options | 6E (EUR/USD), 6B (GBP/USD), 6J (USD/JPY) |
| Equity Indexes | US & intl index products | ES (S&P 500), NQ (Nasdaq), YM (Dow) |
| Energy | oil, gas | CL (WTI crude), NG (nat gas) |
| Metals | precious & industrial | GC (gold), SI (silver), HG (copper) |
| Interest Rates | treasuries, short rates | ZN (10Y), ZB (30Y) |

### Anatomy of the heatmap

- **Strike** — leftmost column; exercise price in the contract's native format.
- **Expiration** — column headers; contract code + DTE.
- **C / P** — call OI and put OI sub-columns per expiry.
- **OI value** — outstanding contracts at that strike/expiry.
- **Colour intensity** — cyan; brighter/darker = more OI = bigger positions.
- **DTE** — days to expiration; near-term expiries have most immediate impact
  because gamma intensifies toward expiry (Lesson 5).

Read as a matrix: strike on the left, scan across expiries. Big numbers +
bright highlighting = significant institutional positioning at that level.

### Contract codes

Format: **Product + Month + Year**. Example: `6EU5` = 6E (EUR/USD) + U
(September) + 5 (2025).

| Code | Month | Code | Month | Code | Month |
|---|---|---|---|---|---|
| F | January | G | February | H | March |
| J | April | K | May | M | June |
| N | July | Q | August | U | September |
| V | October | X | November | Z | December |

- Weeklies have codes like `WE1Q5` (Week 1, August 2025).
- **Monthlies typically have more liquidity and larger OI — start with
  monthlies** until comfortable with the data.

### Strike format warning

Strikes are in **futures contract format, not spot** — this is why Lesson 3
exists. FX strikes = full exchange rate (futures level). Index strikes =
futures points, not the cash index. Commodity strikes = the commodity's unit
($/barrel, $/oz).

### Useful features

- **Expiration filter** — focus on front month or a specific date.
- **Call/Put combined toggle** — total OI per strike regardless of direction.
- **Settlements link** — yesterday's official settlement prices.
- **Volume & OI toggle** — OI is usually more informative for levels.

### Data timing

Updates **once daily**, typically early morning US time, reflecting the
**previous day's close**. Not real-time — but sufficient for identifying key
levels and structural positioning.

### Quick-reference product table

| Market | Symbol | Path | Notes |
|---|---|---|---|
| EUR/USD | 6E | FX → FX Majors → EUR/USD | most liquid FX contract |
| GBP/USD | 6B | FX → FX Majors → GBP/USD | second most traded FX |
| USD/JPY | 6J | FX → FX Majors → JPY/USD | **CME quotes as JPY/USD (inverted)** |
| S&P 500 | ES | Equity Index → US → E-mini S&P | the benchmark |
| Nasdaq 100 | NQ | Equity Index → US → E-mini Nasdaq | tech-heavy |
| Gold | GC | Metals → Precious → Gold | per troy ounce |
| Crude | CL | Energy → Crude Oil → WTI | per barrel |

---

## Lesson 03 — Futures to CFD Conversion

### The problem

CME shows **futures** prices; brokers show **spot**. Related but not the same
number. Draw a raw CME strike on a spot chart and the level is in the wrong
place — price never quite gets there, or blows through.

### The basis

**Basis = Futures price − Spot price.** It exists because futures expire while
spot is immediate; the difference reflects **cost of carry**, primarily the
interest-rate differential between the two currencies.

Three drivers:
1. **Interest rate differential** — futures price in the carry (premium or discount).
2. **Time to expiration** — basis shrinks toward zero as expiry approaches
   (futures and spot converge at expiry). Far-dated contracts have larger basis.
3. **Supply & demand** — positioning can push futures away from fair value temporarily.

Good news from the lesson: no need to compute theoretical fair value — just
**measure** the current futures−spot difference.

### The formula

```
Basis      = Current futures price − Current spot price
Spot level = Futures strike − Basis
```

Worked example (EUR/USD):

```
6E futures:      1.1520
Broker spot:     1.1500
Basis:           1.1520 − 1.1500 = +0.0020 (+20 pips)
Strike 1.1600 →  1.1600 − 0.0020 = 1.1580   ← draw the line here
```

### Data sources

- **Futures price:** CME site ("Last" or "Settlement") or TradingView (6E, 6B…).
- **Spot price:** your broker's feed — that's the price you actually trade at.
- **Capture both at the same moment** — the basis fluctuates intraday; prices
  hours apart give a wrong basis. Tip: TradingView layout with futures and
  spot side by side.

### JPY special case (inversion)

CME quotes yen as **JPY/USD** (yen per dollar) — the inverse of retail
USD/JPY. Convert with `1 ÷ rate`.

```
6J at 0.006700  → USD/JPY equivalent = 1 ÷ 0.006700 = 149.25
Broker USD/JPY  = 149.00 → basis = +0.25
CME strike 0.006667 → inverted = 150.00 → spot level = 150.00 − 0.25 = 149.75
```

Simplification: invert all strikes of interest first, then subtract the one
basis from each.

### Other markets

| Market | Symbol | Typical basis | Notes |
|---|---|---|---|
| S&P 500 | ES | 5–20 points | futures usually at premium to SPX cash |
| Nasdaq | NQ | 10–40 points | same dynamic; premium varies with rates |
| Gold | GC | $2–10 | slight premium common (contango) |
| Crude | CL | $0.20–2.00 | contango **or** backwardation — check the curve |

Retail **index CFDs usually track the futures**, not the cash index → basis is
often just a few points. Verify per broker.

### Workflow

1. Heatmap → pick the strikes with significant OI.
2. Note current futures price. 3. Note broker spot at the same time.
4. Basis = futures − spot. 5. Each strike − basis = spot level. 6. Plot.

### Discipline points

- **Recalculate at least once per session** — the basis changes intraday and
  especially near expiry; a stale basis puts levels 10–20 pips off.
- **Efficiency:** most traders track only 3–5 strikes at a time — the largest
  call wall, the largest put wall, and max pain. Don't convert everything.

### Cheat sheet

- Standard pairs: `Spot level = CME strike − (futures − spot)`
- JPY: invert CME price → basis in USD/JPY terms → invert strike → subtract basis
- Indices/commodities: same formula; basis often smaller for index CFDs

---

## Lesson 04 — The Open Interest Matrix

### The framework — four core concepts

- **Call wall** — strike with massive call OI → resistance; price tends to
  stall or reverse there.
- **Put wall** — strike with massive put OI → support; price tends to find a
  floor there.
- **Max pain** — the strike where option holders lose the most; price
  gravitates there near expiration.
- **Magnetism** — the pull of price toward high-OI strikes as expiry approaches.

### Identifying walls — relative outliers

You're looking for strikes with outsized OI **relative to surrounding
strikes**, not just big absolute numbers. Lesson example: 1.1550 with 9.8K
calls vs 2–3.5K at neighbours = call wall; 1.1300 with 8.5K puts vs 1.6–2.9K
= put wall.

**The 3× rule of thumb:**

| OI vs surrounding strikes | Wall strength |
|---|---|
| 1.5× | weak — minor level |
| 2× | moderate — worth watching |
| 3×+ | strong — high-probability level |

Context matters: a 3× wall in a liquid market > the same in an illiquid one.

### Max pain

**Definition:** the strike at which option holders (calls and puts combined)
would lose the most if the underlying expired there — a.k.a. the maximum pain
point / op-ex price. Computed by finding, per candidate strike, the total value
of options expiring worthless; the strike maximising worthless value (course's
simplified form:)

```
For each strike:
  Call pain  = Call OI × max(0, Strike − Current price)
  Put pain   = Put OI  × max(0, Current price − Strike)
  Total pain = Call pain + Put pain
Max pain strike = strike with LOWEST total pain
(in practice: use online calculators or estimate visually from the heatmap)
```

Why price gravitates there: option **sellers** (market makers, institutions)
profit when options expire worthless. The course notes debate over whether
this is active "pinning" or a by-product of gamma hedging — but the empirical
tendency is observable.

**Limitations (as taught):**
- Most relevant **within 2–3 days of expiration**; earlier, other factors dominate.
- It **shifts** as OI changes — a snapshot, not a fixed target.
- One input among many, not a guaranteed target.

Quick estimation: look for the strike with roughly **equal call and put OI on
either side** — often close to max pain.

### The complete structure map

Lesson example: put wall 1.1300 · max pain 1.1450 · call wall 1.1600 ·
current price 1.1400 → expected range 1.1300–1.1600, gravitational pull
toward 1.1450.

| Observation | Implication |
|---|---|
| Price below max pain | upward bias toward max pain, especially into expiry |
| Put wall below price | strong support; shorts may struggle below it |
| Call wall above price | strong resistance; longs may struggle above it |
| Price between walls | range-bound behaviour likely until catalyst or expiry |

### Systematic heatmap read (worked example from the lesson)

Sample front-month EUR/USD grid → steps:
1. **Call wall:** largest value in the Calls column → 1.1600 (8,450; 2.7× next).
2. **Put wall:** largest value in the Puts column → 1.1350 (7,800; 2.3× next).
3. **Max pain:** strike where call OI ≈ put OI → 1.1500 (2,400 vs 2,200).
4. **Range:** 1.1350–1.1600, centre 1.1500.

**The 80/20 rule:** top 1–2 call strikes + top 1–2 put strikes + rough max
pain zone = 80% of the value from 20% of the effort. Don't analyse every strike.

### Put/Call ratio and skew

**P/C OI ratio** = total put OI ÷ total call OI.

| P/C ratio | Interpretation | Typical behaviour |
|---|---|---|
| < 0.7 | very bullish positioning | may be overextended; watch for reversal |
| 0.7–1.0 | moderately bullish | normal uptrend conditions |
| 1.0–1.3 | neutral to cautious | balanced market or hedging |
| > 1.3 | bearish / heavy hedging | downside protection in demand; fear or support |

Extremes can be **contrarian**: very high put ratios (fear) often mark
bottoms; very low (complacency) often mark tops — but in strong trends
"extreme" readings can persist. Context matters.

**OI skew** = asymmetry of OI across strikes. Put OI concentrated far below
price + call OI near price = negative skew (downside hedging); the reverse =
positioning for upside.

### Dynamic analysis — tracking OI changes

- **OI increasing at a strike** → new positions; level becoming more
  significant; wall strengthening.
- **OI decreasing** → positions closing; level losing significance; wall weakening.
- **OI shifting strikes** → repositioning; a new expected range.
- **Wall break + OI drop** → positions closed; wall may not hold on retest.

Lesson scenario: put wall 7,800 → 8,200 (strengthening, support more
reliable) → price bounces off it → next day OI 6,100 (−2,100 — positions
banked on the bounce) → **next test may break through**.

**Data lag caveat:** OI is from the previous close — you're always reading
yesterday's positioning; big intraday moves may have changed the picture.

### The pre-session OI checklist (Lesson 4 §9)

1. Heatmap for your product — front month (highest liquidity).
2. Identify the call wall (resistance). 3. Identify the put wall (support).
4. Estimate max pain (balanced call/put OI). 5. Compute basis & convert strikes.
6. Plot converted CW / PW / MP on the chart. 7. Note P/C ratio and skew.
8. Compare to yesterday — walls strengthening or weakening?

---

## Lesson 05 — Gamma & Dealer Dynamics

### The core concept

Market makers who sell options must continuously hedge by trading the
underlying. That hedging is **mechanical and predictable** — it is what creates
the support/resistance observed at high-OI strikes.

### The Greeks you need

- **Delta (Δ)** — option value change per $1 move in the underlying (a 0.50-delta
  call gains $0.50 per $1 up-move). Also ≈ probability of expiring ITM.
- **Gamma (Γ)** — how fast delta changes per $1 move. **Highest for ATM options
  near expiration.** High gamma = constant rehedging = more market impact.
- Theta (time decay) and Vega (vol sensitivity) — not critical for this analysis.

Why gamma matters more: delta says how much to hedge **now**; gamma says how
much the hedge must **change** as price moves. Strikes with large OI near
current price create the strongest effects.

### Delta hedging flows

- Dealer sells a **call** → exposed to upside → hedges by **buying** the
  underlying. Price rises → call delta rises → dealer buys more → **supports
  the rally**.
- Dealer sells a **put** → exposed to downside → price falls → put delta rises
  (magnitude) → dealer **sells** → **accelerates the decline**.

This looks like dealers amplify everything — true **when short gamma**. The
sign of dealer gamma exposure decides the regime:

### Long vs short gamma

| Dealer position | Price rises | Price falls | Market effect |
|---|---|---|---|
| **Short gamma** (sold options) | must buy | must sell | **amplifies** moves — trends accelerate |
| **Long gamma** (bought options) | must sell | must buy | **dampens** moves — mean reversion |

In most conditions dealers are **net short gamma** (retail + institutions are
net option buyers).

**The gamma flip:** there is often a price level where aggregate dealer gamma
flips sign — above it price tends to accelerate, below it stabilise (or vice
versa). Estimable from the OI distribution; a key structural level to watch.

### Why call walls are resistance (the mechanism)

Trace-through from the lesson (large call OI at 1.1600, dealers short those
calls, price 1.1550 rising):

1. Approaching 1.1600 → call delta increases → dealers **buy to hedge** →
   buying supports the rally.
2. At/through 1.1600 → calls ATM/ITM, delta → 1.0 → dealers **fully hedged** —
   no more buying needed.
3. Buying pressure evaporates → without fuel the rally stalls → **resistance**.

Key point: resistance is **not** dealers actively selling at the level — it's
the disappearance of the buying that was supporting the move. *The market
loses its fuel.*

### Why put walls are support (mirror image)

Falling toward a big put strike: dealers sell to hedge growing put delta
(accelerating the decline) → at the strike, delta → −1.0, hedging complete →
selling evaporates → decline stalls → **support**.

**Counterintuitive takeaway:** dealer hedging *accelerates* the move toward a
wall, then *stops* at the wall. Walls aren't barriers that slow price on
approach — they're where the fuel runs out. Hence sharp moves into walls that
suddenly stall.

### Gamma vs time — why effects intensify near expiry

Gamma for ATM options rises exponentially as DTE → 0.

- **2+ weeks out:** gamma flat; hedging gradual; wall effects muted.
- **~1 week:** gamma rising; walls exert stronger influence.
- **Final 48 hours:** gamma peaks; hedging intense; max-pain magnetism
  strongest; walls most effective.

Practical: focus on the **nearest expiration with significant liquidity** —
monthly expiry (typically third Friday) and weeklies are the key dates.

### When walls break — the gamma squeeze

Price breaks a big call wall with momentum:

```
Calls flip ATM → ITM → delta jumps toward 1.0
Dealers who thought they were hedged now need MORE long exposure
Rapid catch-up buying → price accelerates higher
```

**Gamma squeeze** = hedging chases price through a broken high-OI strike,
accelerating the breakout. The same positioning that created resistance
becomes fuel once breached. **The bigger the wall, the bigger the potential
squeeze.** (Puts: same in reverse — forced selling below a broken put wall.)

- Wall **holds** → price stalls, hedging complete, momentum dies → look for
  reversal/consolidation.
- Wall **breaks** → squeeze ignites → expect acceleration to the next major level.

### The complete mental model

| Scenario | Dealer hedging | Price behaviour | Implication |
|---|---|---|---|
| Approaching call wall | buying | rally supported, stalls at wall | resistance / reversal |
| Breaks call wall | chase-buying | gamma squeeze | ride momentum to next level |
| Approaching put wall | selling | decline accelerates, stalls at wall | support / bounce |
| Breaks put wall | chase-selling | squeeze down | ride momentum to next level |
| Between walls | minimal | range-bound, technical-driven | trade the range; watch for break |
| Near expiration | amplified | max-pain magnetism, sharp moves | expect vol; respect walls |

**The feedback loop:** price move → delta change → hedging → more price
movement. **OI tells you *where* the loop engages; gamma tells you *how
powerful* it will be.**

---

## Lesson 06 — Trading Frameworks

Five frameworks; use the ones that fit your style, integrate gradually.

### Framework 5 first — the daily prep ritual (10–15 min, non-negotiable)

1. **Heatmap** — front month (or the weekly if within ~5 days of expiry).
2. **Key levels** — largest call OI (call wall), largest put OI (put wall),
   max pain zone; note secondary walls.
3. **Basis** — current futures vs broker spot.
4. **Convert** — CW/PW/MP → spot equivalents (`spot = strike − basis`).
5. **Plot & label** — CW / PW / MP lines on the chart.
6. **Context** — where is price in the structure? Near a wall? Between?
   Above/below max pain?

Daily record: CW level · PW level · MP level · DTE · P/C ratio · OI changes
vs yesterday.

### Framework 1 — Wall-to-Wall Range Trading

- **Concept:** between put wall (support) and call wall (resistance) the
  market tends to oscillate; dealer hedging defends both ends. Trade the
  range until it breaks.
- **Use when:** walls clearly defined (3×+), price mid-range, no major
  catalyst, **5+ DTE** (moderate gamma).
- **Long** near put wall / **short** near call wall on momentum exhaustion.
- **Stop:** beyond the wall (10–20 pips FX). **Targets:** max pain zone, then
  the opposite wall.
- Lesson example: PW 1.1350 / CW 1.1550 / MP 1.1450, long 1.1360, stop
  1.1330, T1 1.1450 (90 pips), T2 1.1530 (170 pips) — risk 30 / reward 90–170.
- **Invalidation:** decisive close beyond a wall → range broken → switch to
  Framework 3.

### Framework 2 — Max Pain Reversion

- **Concept:** price gravitates toward max pain as expiry approaches;
  strongest in the final hours before settlement.
- **Use when:** within **2 days of expiry** (ideally final 24h), price
  meaningfully extended from max pain (**50+ pips FX, 20+ points indices**),
  no major news catalyst that could override positioning.
- Long below MP on stabilisation / short above MP on exhaustion. **Stop**
  beyond the nearest wall. **Target** max pain (or partial there).
- Magnetism strength: 5+ DTE weak · 2–4 DTE moderate · 1 DTE strong · expiry
  day maximum. Don't fight a clear trend far from expiry.
- **Timing:** same-day or overnight trade only — the effect is time-specific.
  Wrong → cut quickly; right → price should move relatively fast.

### Framework 3 — Wall Break Momentum

- **Concept:** a decisive break of a major wall flips dealer hedging from
  resistance to acceleration — trade the gamma squeeze in the break direction.
- **Use when:** convincing break (not a touch), ideally with a fundamental
  catalyst; clean break, not choppy grinding.
- **Confirming a real break:** weak = barely crosses, low volume/thin
  session, immediate reversal attempt → avoid/wait. Strong = **20+ pips
  beyond the wall**, elevated volume/active session, no immediate reversal,
  catalyst present → high-probability continuation.
- **Stop:** back inside the broken wall. **Target:** next major OI level or
  technical target.
- **Size matters:** a 10,000-contract wall break > a 3,000-contract one —
  prioritise the largest concentrations for the most explosive moves.

### Framework 4 — OI Confirmation (filter, not signal)

Use OI to validate/invalidate technical setups:

| Technical setup | OI alignment | Action |
|---|---|---|
| Long at support | put wall nearby | ✓ take it — high conviction |
| Long at support | no significant put OI | caution — reduced conviction |
| Long breakout | call wall directly above | ✗ avoid — resistance ahead |
| Long breakout | no OI until much higher | ✓ take it — clear air |
| Short at resistance | call wall nearby | ✓ take it — high conviction |
| Trend continuation | toward max pain | ✓ aligned with magnetism |
| Trend continuation | away from max pain | caution — fighting the magnet |

Principle: **OI doesn't replace technical analysis — it enhances it.** Aligned
→ conviction up; conflicting → skip or reduce size.

### Position management with OI

- **Targets:** walls and max pain as natural targets. Three-tier scale-out:
  ⅓ at max pain, ⅓ halfway to the opposite wall, final ⅓ at the wall or trail.
- **Stops:** beyond walls = structural protection; a stop in open space is
  just a line.
- **Sizing:** OI aligned with the setup → larger; conflicting → smaller;
  none → minimum or skip.
- **Adjustment triggers:** significant OI change mid-trade (new wall appears,
  old wall shrinks) → reassess — the structure you traded may be gone.

### The six pitfalls

1. **Treating OI as absolute** — probabilities, not guarantees; always use stops.
2. **Ignoring time to expiry** — a wall at 2 DTE ≠ 20 DTE; adjust expectations.
3. **Stale data** — recalc the basis; big overnight moves change positioning.
4. **Over-complicating** — 2–3 key levels, not every strike across every expiry.
5. **Fighting fundamentals** — walls don't stop a central bank announcement.
6. **Confirmation bias** — read the full picture, not just levels that agree
   with your view.

### Integration hierarchy

| Layer | Provides | OI interaction |
|---|---|---|
| Fundamental/macro | directional bias, catalysts | OI shows where the move may accelerate or stall |
| Technical | entry timing, patterns, levels | OI confirms or conflicts with technical S/R |
| Sentiment | crowd positioning, extremes | P/C ratio is another sentiment input |
| Risk management | sizing, stops | OI levels give structural stop locations |

**Fundamentals → direction. Technicals → timing. OI → the structural map of
where price stalls, accelerates, or reverses.**

### Framework comparison

| Framework | Best when | Key levels | Risk profile |
|---|---|---|---|
| Wall-to-wall range | price between defined walls, no catalyst | PW → CW | lower risk, lower reward |
| Max pain reversion | ≤48h to expiry, price extended | MP as target | moderate / moderate |
| Wall break momentum | clean break of major wall + catalyst | broken wall → next wall | higher risk, higher reward |
| OI confirmation | technical setup exists | alignment check | depends on base setup |

Course close: the differentiator isn't knowledge, it's **consistent
application** — make the pre-session prep a daily habit, start with one
framework, build from there.

---

## Key formulas & numbers (condensed revision card)

- `Basis = futures − spot` · `Spot level = strike − basis` · JPY: invert first (`1/rate`).
- Max pain = strike minimising total option-holder payout (lowest total pain).
- Wall significance: 1.5× weak · 2× moderate · **3×+ strong** (vs surrounding strikes).
- P/C ratio bands: <0.7 · 0.7–1.0 · 1.0–1.3 · >1.3 (bullish → hedging/fear).
- Max-pain window: strongest final **48h**; weak at 5+ DTE.
- Break confirmation: 20+ pips beyond the wall, volume, no instant reversal, catalyst.
- Month codes: F G H J K M N Q U V X Z (Jan→Dec). `6EU5` = EUR/USD Sep 2025.
- Derivatives ≈ $700T notional vs ~$100T equities / ~$130T bonds.
- OI data lag: one day (previous close). Recalc basis every session.

---

## Self-test questions (exam prep)

1. Define open interest and state the three ways a contract stops counting.
2. Two parties trade one contract: list the three possible OI outcomes and
   what each says about positioning.
3. Price rises with falling OI — what's happening and what does it imply for
   the rally?
4. Decode `6BZ5` and `WE3U5`.
5. Futures 1.0842, spot 1.0825 — convert strike 1.0900. Then: 6J 0.006250,
   broker USD/JPY 159.60 — convert strike 0.006211.
6. Why can't the basis be set once and forgotten? Give two reasons.
7. Define max pain, give the simplified calculation, and state when it is and
   isn't predictive.
8. State the 3× rule and why relative OI beats absolute OI.
9. Explain why a call wall is resistance *without* saying "dealers sell
   there" (the fuel-exhaustion mechanism).
10. Short-gamma vs long-gamma dealers: what does each regime do to moves, and
    which is typical? What is the gamma flip?
11. Walk through the gamma squeeze after a put-wall break.
12. Why do OI effects intensify near expiration, and which options carry the
    most gamma?
13. For each of Frameworks 1–4: precondition, stop logic, and invalidation.
14. What distinguishes a weak wall break from a strong one (four criteria)?
15. Yesterday's put wall bounced price; today its OI is down 27%. Expectation
    on the next test, and why?
16. Where do stops belong relative to walls, and why is that structurally
    better than an arbitrary level?

---

## Future research ideas & areas of interest

Things to investigate off the back of these lessons (not conclusions — a
queue to work through):

1. **Wall behaviour in FX:** track converted 6E/6B call and put walls daily —
   how often does price touch them, and what happens after a touch
   (stall/reverse vs break)? How does that compare against round numbers or
   pivots at similar distances?
2. **Max-pain magnetism:** around monthly expiries, measure how close
   settlement lands to max pain vs where price was 24–48h earlier. Is the
   final-48h pull measurable in FX futures?
3. **OI-change dynamics:** does the "wall weakened after a defence → next
   test breaks" pattern (Lesson 4's scenario) show up in the data? Requires a
   daily OI history — the CME heatmap only shows the current snapshot, so
   history has to be self-collected. Start capturing early.
4. **Gamma flip estimation:** SPX-style GEX (OI × per-strike gamma, with a
   dealer-positioning assumption) is well known for indices — what would an
   FX version look like from the heatmap data, and does realised volatility
   differ either side of the estimated flip level?
5. **Basis stability:** how much does the 6E basis actually wobble intraday
   and into expiry? That sets the error bar on every converted level (are
   walls lines or zones?).
6. **P/C ratio as a sentiment input:** do the lesson's ratio bands (<0.7,
   >1.3) line up with anything measurable in subsequent price behaviour?
   Could feed the existing day-type/regime features.
7. **Confluence with existing level sources:** does an OI wall that coincides
   with a level this codebase already computes (pivot, VAH/VAL, round number,
   prior high/low) behave differently from either alone? Natural fit for the
   confluence scorer.
8. **CME vs OTC:** FX options trade heavily OTC — how representative is CME
   listed OI of total FX option positioning? Where do the OTC strike
   concentrations get published (e.g. DTCC data, bank flow notes), and can
   they be compared?
9. **Dealer positioning assumption:** the mechanism assumes dealers are net
   short the big OI strikes. What data exists (CFTC COT, CME participant
   breakdowns) to check who is long/short at the wall strikes?
10. **Weeklies vs monthlies:** the course says monthlies carry the OI — how
    much structure do FX weeklies add in the final week, and do weekly walls
    behave like monthly ones?
11. **Reading list:** literature on option-expiration pinning (Ni, Pearson &
    Poteshman 2005), dealer gamma imbalance and returns (Barbon & Buraschi),
    SqueezeMetrics' GEX white paper, SpotGamma methodology notes — and
    whatever exists specifically for **FX** rather than equities.

## Real-time implementation ideas (this codebase)

Sketches for when/if these get built — noted here so future-me doesn't
re-derive them:

- **`cme_oi` level source:** a Tier-2 brick in `js/levelSources.js` emitting
  `Level[]` — `{ price, kind: 'call_wall'|'put_wall'|'max_pain', weight }` —
  through the existing `levels(ctx) → Level[]` contract, so the confluence
  scorer, `levelChart.js` viewer, and any strategy consume OI levels the same
  way they consume pivots or VWAP.
- **Basis-conversion helper:** small pure function (futures px, spot px,
  strike → spot level) with the JPY-inversion case; unit-testable on
  synthetic numbers; register in `LEGO_MODULES.md` if built.
- **Daily OI snapshot capture:** a scheduled job storing per-product
  (strike, expiry, call OI, put OI) rows to R2 each day — needed because CME
  serves no history, and research ideas 1–3 above all depend on it.
- **Pre-session ritual automation:** Lesson 6's daily prep (walls → basis →
  converted levels → plot) maps naturally onto a small dashboard card once
  the snapshot capture exists — CW/PW/MP per pair with DTE and P/C ratio.
- **Validation:** anything strategy-shaped that comes out of this goes
  through the standard harness (costs on, IS/OOS split, A/B vs incumbent),
  same as every other engine here.

---

*Next revision: after doing one full manual pass of the Lesson 6 ritual on
live 6E data — annotate anything that was unclear in practice.*
