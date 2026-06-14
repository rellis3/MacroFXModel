# I1-I5 — Intraday Strategy Briefs
## ORB, Asia Fib, VWAP Reversion, News Fade, London Open Momentum

**Back to index:** [STRATEGY_INDEX.md](STRATEGY_INDEX.md)

> **Capital allocation:** Max 20-30% of total account across all intraday strategies combined.
> The portfolio models (P1-P7) carry the bulk of edge. These are active-trading complements.
>
> **SNR Warning:** Intraday SNR < 0.3. Every strategy below uses a macro or structural filter
> to lift that — without the filter, these are noise trades.

---

# I1 — Opening Range Breakout (NQ/ES)

**Type:** Intraday, daily setup
**Est. trades/week:** 3-6 | **Win rate:** 52-58% | **Profit factor:** 1.4-1.8

## Hypothesis

The first 30 minutes of NYSE open (09:30-10:00 ET / 14:30-15:00 London) establishes a
range driven by institutional order flow rebalancing, option market-maker delta hedging,
and overnight position unwinding. A clean break of this range — when confirmed by macro
regime direction — has documented follow-through as institutional flow continues in the
breakout direction.

**The macro filter is the edge.** Without it, ORB has roughly 50/50 win rate (breakeven
after costs). With macro regime confirmation, only taking breakouts in the regime direction
removes approximately 40% of losing trades.

## Setup Rules

```
TIME:    09:30-10:00 ET (14:30-15:00 London). Mark high and low of first 30-min candle.

FILTER:  Check P1 macro score (from dashboard or model output).
         Only LONG breakouts when macro score > 0.
         Only SHORT breakouts when macro score < 0.
         If macro score neutral (-0.5 to +0.5): SKIP THE DAY.

ENTRY:   Wait for price to close a 5-min bar OUTSIDE the opening range.
         Do NOT chase the initial spike.
         Enter on the FIRST RETEST of the broken range level.
         (Breakout up -> wait for pullback to test old high from above -> buy)

STOP:    Back inside the opening range (below the broken high for longs).
         Hard pip cap: 15 points NQ, 8 points ES.

TARGET:  1.5x the opening range size projected from the breakout level.
         Trail stop to breakeven once 1x range achieved.

TIME EXIT: Close position by 14:00 ET (19:00 London) regardless of outcome.
           Do not hold ORB trades into close or overnight.

SKIP DAY conditions:
- FOMC day or day before FOMC
- NFP day
- VIX Z-score > 1.5 (HIGH vol regime — ORB becomes noise in panic)
- Opening range is less than 20 NQ points (too tight, false breaks likely)
```

## Performance Estimate ($100k, allocating 10% = $10k to this strategy)

| Metric | Estimate |
|--------|---------|
| Trades/week | 3-6 |
| Win rate | 52-58% |
| Average win | 1.5x range |
| Average loss | 1.0x range (stop) |
| Profit factor | 1.4-1.8 |
| Annual return on allocated capital | 20-35% |
| Annual P&L on $10k allocated | $2,000-$3,500 |

## Claude Code Brief

```
Build a Python backtest for Opening Range Breakout on NQ (QQQ as proxy) and ES (SPY).

DATA:
- QQQ, SPY: 30-minute OHLC bars (yfinance, 2015 to present)
- Macro score: use simplified version from P1 backtest output or approximate with
  net liquidity z-score from FRED as directional filter

OPENING RANGE:
For each trading day, identify the first 30-minute bar (09:30-10:00 ET).
Opening range high = first bar high
Opening range low = first bar low
Opening range size = high - low

ENTRY SIGNAL (on subsequent 30-min bars, up to 13:30 ET):
Long signal: close of any bar after 10:00 ET is above opening range high,
             AND next bar opens within 0.5% of opening range high (retest)
             AND macro_score > 0
Short signal: mirror logic, macro_score < 0

STOP: 1x opening range size against entry direction (tight)
TARGET: 1.5x opening range size in direction

SKIP conditions:
- Opening range size < 0.3% of QQQ price (too tight)
- VIX > 30 on that day

TRANSACTION COSTS: 0.15% round trip (wider than portfolio models due to frequency).

WALK-FORWARD: 1yr train / 3mo test / 1mo step.

KEY OUTPUTS:
- Win rate with vs without macro filter (prove the filter adds value)
- Performance by time of entry (early breakouts vs late)
- Average holding time
- Best and worst months

Single file: orb_backtest.py
```

---

# I2 — Asia Range Fibonacci

**Type:** Intraday, daily setup
**Est. trades/week:** 5-10 | **Win rate:** 68-73% | **Profit factor:** 2.5-3.5

## Note

This strategy is **already built** in the dashboard. The Asia session range is calculated,
Fibonacci levels are drawn, and confluence detection is live. What has NOT yet been done
is a rigorous walk-forward backtest on 5-minute bars to validate those headline numbers
under the same framework used for the portfolio models.

**This is the single highest-priority intraday validation to run.**

## Strategy Summary

```
RANGE:     Asia session body range (00:00-06:00 London time)
           Body only (min/max of open/close per bar, NO wicks)

LEVELS:    Fibonacci extensions and retracements from the body range:
           0.0 (range low), 0.236, 0.382, 0.5, 0.618, 0.786, 1.0 (range high)
           Extensions: 1.272, 1.414, 1.618, 2.0, 2.618

CONFLUENCE: A level from today's Asia range aligns within 2 pips (FX) or 200 pips (Gold)
            of yesterday's Asia range level = regular confluence
            Alignment within 1 pip = TIGHT confluence (higher probability)
            Daily + weekly agreement at same zone = TRIPLE confluence (highest conviction)

ENTRY:     Price reaches a confluence level during London or New York session
           Macro score confirms direction (positive score = only longs)
           VOL regime = NORMAL or LOW (avoid HIGH vol range trades)

STOP:      Opposite side of the confluence zone + buffer (Asia range midpoint as
           absolute maximum stop)

TARGET:    Next Fibonacci level in direction, or range extension targets

BEST PAIRS: EUR/USD, GBP/USD (most liquid, tightest spreads)
            AUD/USD, USD/CAD (good range behaviour)
            Avoid USD/JPY in HIGH vol regime (JPY moves are news-driven)
```

## Claude Code Brief

```
Build a Python walk-forward backtest for the Asia Range Fibonacci strategy.
This validates the existing dashboard logic against historical 5-minute bar data.

DATA:
- 5-minute OHLC bars for EUR/USD, GBP/USD, AUD/USD from 2018 to present
- Source: yfinance (limited history) or store Twelve Data API pulls as CSV
- VIX for vol regime filter
- P1 macro score output as directional filter

ASIA RANGE CALCULATION:
For each trading day, isolate bars between 00:00-06:00 London time (UTC).
body_open = bar open
body_close = bar close
bar_body_high = max(body_open, body_close)  -- NO wicks
bar_body_low = min(body_open, body_close)   -- NO wicks
asia_high = max of all bar_body_highs in session
asia_low = min of all bar_body_lows in session
asia_range = asia_high - asia_low

FIB LEVELS:
Calculate standard Fibonacci levels from asia_low to asia_high.
Also calculate prior day's Asia range Fibonacci levels.

CONFLUENCE DETECTION:
For each level in today's range, check if any level from yesterday's range
is within 2 pips (0.0002) for FX or 200 pips (2.0) for Gold.
Mark as TIGHT if within 1 pip (0.0001).

ENTRY SIMULATION:
During London session (07:00-16:00 London), if price touches a confluence level:
- Long if level is a support confluence AND macro score > 0
- Short if level is a resistance confluence AND macro score < 0
- Entry: first 5-min bar close that touches or crosses level
- Stop: X pips below/above confluence (use 1x Asia range size as max stop)
- Target: next Fibonacci level in direction

TRANSACTION COSTS: 0.02% round trip (FX spread).

WALK-FORWARD: 6mo train / 2mo test / 1mo step (intraday needs shorter windows).

KEY OUTPUTS:
- Win rate by confluence type (regular vs tight vs triple)
- Win rate by Fibonacci level (0.382 vs 0.5 vs 0.618 vs extensions)
- Win rate with vs without macro filter
- Drawdown analysis by vol regime
- Comparison to claimed 68-73% win rate from Fib strategy documentation

Single file: asia_fib_backtest.py

CRITICAL: This is the validation test for the existing dashboard strategy.
Output must include a clear PASS/FAIL verdict against the documented performance claims.
```

---

# I3 — VWAP Reversion (NQ/ES)

**Type:** Intraday, multiple entries per day
**Est. trades/week:** 8-15 | **Win rate:** 58-64% | **Profit factor:** 1.3-1.6

## Hypothesis

Institutional algorithms benchmark execution against VWAP (Volume Weighted Average Price).
Large buyers who are behind VWAP step in to catch up. Large sellers above VWAP step in
to reduce average cost. This creates a gravitational pull — price tends to revert to VWAP
intraday. The edge is knowing when this pull is strongest (LOW/NORMAL vol) and when it
breaks down (HIGH vol, trending day).

**Critical constraint:** This ONLY works in LOW or NORMAL vol regime. In HIGH vol, trend
dominates and VWAP fading is account destruction. Your GARCH vol regime classification
directly gates this strategy.

## Setup Rules

```
INSTRUMENT: NQ futures (or QQQ as proxy) and ES (or SPY). Real volume available.
            NOT suitable for FX (no centralised volume, VWAP unreliable).

VOL FILTER:  VIX Z-score must be < 1.0 (LOW or NORMAL regime only).
             Skip entire day if VIX Z > 1.0 at 09:30 ET open.

VWAP:        Calculate session VWAP from 09:30 ET using cumulative (price * volume) / cumulative volume.

ENTRY:       Price extends > 0.5% above VWAP on low/declining volume -> SHORT (fade the extension)
             Price extends > 0.5% below VWAP on low/declining volume -> LONG (fade the extension)
             Volume condition: last 3 bars volume < 70% of session average volume

STOP:        0.8% extension from VWAP (if it keeps going, thesis is wrong)

TARGET:      VWAP touch (not through — just to VWAP)

TIME EXIT:   All positions closed by 15:30 ET. No overnight holds.

HARD SKIP:   First 30 minutes of session (09:30-10:00 ET) — too volatile for mean reversion
             Last 30 minutes (15:30-16:00 ET) — erratic close-driven flows
             Any day with scheduled major economic release
```

## Performance Estimate ($100k, 10% allocation = $10k)

| Metric | Estimate |
|--------|---------|
| Trades/week | 8-15 |
| Win rate | 58-64% |
| Avg win | ~0.4% |
| Avg loss | ~0.7% |
| Profit factor | 1.3-1.6 |
| Annual P&L on $10k allocated | $1,500-$2,500 |

Lower P&L per dollar than ORB, but higher frequency and lower per-trade risk.

## Claude Code Brief

```
Build a Python backtest for VWAP reversion on NQ (QQQ proxy) and ES (SPY proxy).

DATA:
- QQQ, SPY: 5-minute OHLC + volume bars (yfinance, 2015 to present)
- ^VIX: daily VIX for vol regime filter

VWAP CALCULATION:
For each trading day (09:30-16:00 ET), calculate rolling session VWAP:
vwap = cumsum(typical_price * volume) / cumsum(volume)
typical_price = (high + low + close) / 3

VOL FILTER:
vix_z = (VIX - VIX.rolling(60).mean()) / VIX.rolling(60).std()
Skip entire day if vix_z > 1.0 at day open.

EXTENSION DETECTION:
price_vs_vwap_pct = (close - vwap) / vwap
volume_vs_avg = volume / volume.rolling(20).mean()  # within session

ENTRY CONDITIONS (on 5-min bars, 10:00-15:30 ET only):
Short entry: price_vs_vwap_pct > +0.005 (0.5% above VWAP)
             AND volume_vs_avg < 0.7 (low volume extension -- not a trend)
Long entry:  price_vs_vwap_pct < -0.005 (0.5% below VWAP)
             AND volume_vs_avg < 0.7

STOP: 0.8% from VWAP (absolute, not from entry)
TARGET: VWAP touch

One position per instrument per day. Close at 15:30 if not already stopped/targeted.

TRANSACTION COSTS: 0.15% round trip.

WALK-FORWARD: 1yr train / 3mo test / 1mo step.

KEY OUTPUTS:
- Win rate in LOW vs NORMAL vs HIGH vol (prove vol filter is essential)
- Performance by time of day entry
- Average holding time
- Volume condition sensitivity (test 0.5, 0.7, 0.9 volume thresholds)

Single file: vwap_reversion_backtest.py
```

---

# I4 — News Event Fade

**Type:** Event-based, ~4-8 events per month
**Win rate:** 55-62% | **Profit factor:** 1.4-1.9

## Hypothesis

When major economic releases print (NFP, CPI, FOMC, ISM), the first 60-90 seconds of
price movement is dominated by algorithmic reactions to the headline number. These initial
moves frequently overshoot and partially revert within 5-15 minutes as market participants
process the full context. This reversion is the trade.

**Key insight:** You are not predicting the number. You are fading the machine reaction.

## Event Calendar Priority

| Event | Frequency | Average Initial Move (NQ) | Fade-able? |
|-------|-----------|--------------------------|-----------|
| FOMC Decision | 8x/year | 150-400 pts | Yes (best) |
| NFP (Payrolls) | Monthly | 100-250 pts | Yes |
| CPI Print | Monthly | 80-200 pts | Yes |
| ISM Manufacturing | Monthly | 50-120 pts | Sometimes |
| PPI | Monthly | 40-80 pts | Marginal |

## Setup Rules

```
PREPARATION:
Know the event time. Know the market consensus estimate (Bloomberg, Reuters).
Know the prior print.

DO NOTHING for first 90 seconds after release.

MEASUREMENT:
After 90 seconds, measure the initial move from the pre-release price.
Calculate as percentage of QQQ or absolute points on NQ.

FADE CONDITION:
Initial move > 1.5x the average move for that event type historically.
(Build a reference table of average event moves over prior 24 months.)
This identifies genuine overshoots vs normal reactions.

ENTRY:
Enter at the 90-second mark in the OPPOSITE direction of the initial move.
Size: 50% of normal position (uncertainty is high).

STOP:
Beyond the initial extreme (the spike high or low from that first 90 seconds).
If the initial move was a genuine trend, this stop is hit quickly and loss is small.

TARGET:
50% retracement of the initial move.
Scale out: 50% at 38.2% retracement, 50% at 61.8% retracement.

TIME EXIT:
If not at target within 30 minutes, exit. Event momentum decays.

HARD RULES:
Never fade FOMC on the rate decision itself if it is a surprise cut or hike
(genuine surprises trend, they do not revert).
Only fade when actual print is within 0.1-0.2% of consensus (close miss or beat).
Large surprises (actual vs consensus > 2 standard deviations) — DO NOT FADE.
```

## Why This Is Hard to Systematise

You need a database of historical event move sizes by event type.
Building that reference table is the main work. Once built, the rules are mechanical.

## Claude Code Brief

```
Build a Python event study and backtest for news event fading.

DATA:
- QQQ, SPY: 1-minute OHLC bars around event windows (yfinance limited to 7 days,
  need to store historical data or use a free source like Alpaca paper trading API)
- Economic calendar: FRED release dates for FOMC, NFP, CPI, ISM
- ^VIX: vol filter

APPROACH (two phases):

PHASE 1 - EVENT STUDY:
For each historical release of FOMC/NFP/CPI (2010 to present):
- Identify event datetime (FRED website has release dates)
- Measure: price 1 minute before vs price 2 minutes after (initial move)
- Measure: price 90 seconds after vs price 30 minutes after (reversion)
- Calculate: reversion percentage (how much of initial move was faded)
- Track: which event types show most reversion?

Output event study results:
- Average initial move by event type
- Average reversion % by event type  
- % of events that reverted > 50% of initial move
- Best events to fade (highest reversion probability)

PHASE 2 - BACKTEST:
If PHASE 1 shows > 55% of events revert > 50%:
Run simple rule backtest:
90 seconds after event: fade the initial move
Target: 50% retracement
Stop: beyond initial extreme
Time exit: 30 minutes

TRANSACTION COSTS: 0.20% round trip (wide -- event liquidity is poor).

OUTPUT:
- Event study results table
- Backtest equity curve (event-by-event)
- Win rate by event type
- Win rate by size of initial move (small vs large vs huge)
- CLEAR verdict: is there a fadeable edge in this data?

Single file: news_fade_backtest.py
Note: Limited by 1-minute bar history availability on free data sources.
May need to use stored CSV data or Alpaca paper trading API for historical intraday.
```

---

# I5 — London Open Momentum (FX)

**Type:** Intraday, daily setup
**Est. trades/week:** 5-10 | **Win rate:** 54-60% | **Profit factor:** 1.5-2.0

## Hypothesis

London open (07:00-09:00 London time) is where the largest FX volume in the world
transacts. European institutional order flow sets the daily direction. When London opens
in the direction your macro regime score suggests AND breaks the Asia session range on
meaningful momentum, that direction frequently continues through the morning session
(07:00-12:00 London).

This connects directly to the Asia Fib strategy (I2) — the Asia range is already drawn.
London Open Momentum uses the same range as a breakout reference, but is a momentum
trade rather than a mean-reversion trade. They are complementary, not competing.

## Setup Rules

```
PRE-CONDITIONS (check at 07:00 London):
1. P1 Macro score confirms direction (positive = only look for long breakouts)
2. VIX Z-score < 1.5 (not in HIGH vol panic regime)
3. No major news event in next 2 hours (avoid news-driven false breakouts)

ASIA RANGE REFERENCE:
Use the I2 Asia range (00:00-06:00 London body range) as reference.
Asia high and Asia low are the key levels.

ENTRY CONDITION:
At or after 07:00 London:
LONG: First 15-minute bar to CLOSE above Asia range high
      AND bar close is > 5 pips above Asia range high (not just touching)
      AND macro score > 0

SHORT: First 15-minute bar to CLOSE below Asia range low
       AND bar close is > 5 pips below Asia range low
       AND macro score < 0

ENTRY: At open of next 15-min bar after signal bar.

STOP: Back inside Asia range (below Asia range high for longs).
      Hard pip cap: 15 pips EUR/USD, 25 pips GBP/USD.

TARGET 1: 1.0x Asia range size projected from breakout (partial exit 50%)
TARGET 2: 1.5x Asia range size (trail stop to entry on remaining 50%)

TIME EXIT: Close any open position at 12:00 London (London morning session end).
           Do not hold into New York open unless position is strongly in profit.

BEST PAIRS: EUR/USD (most liquid London pair), GBP/USD
AVOID: USD/JPY (Asia-London transition, JPY often moves on different drivers)
```

## Relationship to I2 Asia Fib

These two strategies share the same Asia range calculation and the same macro filter.
They are NOT conflicting — one fades retracements TO the range levels, the other
trades breakouts THROUGH the range. On a given day you might have both active
(long momentum on breakout, then later a pullback to a Fib level as re-entry).

## Performance Estimate ($100k, 10% allocation = $10k)

| Metric | Estimate |
|--------|---------|
| Trades/week | 5-10 |
| Win rate | 54-60% |
| Average win | 1.3x risk |
| Average loss | 1.0x risk |
| Profit factor | 1.5-2.0 |
| Annual P&L on $10k allocated | $2,000-$3,500 |

## Claude Code Brief

```
Build a Python backtest for London Open Momentum on EUR/USD and GBP/USD.

DATA:
- EUR/USD, GBP/USD: 15-minute OHLC bars (yfinance, 2016 to present)
- ^VIX: vol filter
- P1 macro score as directional filter (use simplified net liq z-score as proxy)

ASIA RANGE (00:00-06:00 London time each day):
body_high = max(open, close) for each bar
body_low = min(open, close) for each bar
asia_high = max(body_high) across all bars in 00:00-06:00
asia_low = min(body_low) across all bars in 00:00-06:00

LONDON OPEN BREAKOUT (07:00-10:00 London only):
After 07:00 London, monitor each 15-min bar.
Long signal: bar close > asia_high + 0.0005 (5 pips above)
Short signal: bar close < asia_low - 0.0005 (5 pips below)
Only first signal per day counts (no re-entry after first trade).

MACRO FILTER:
Simplified: use net_liq_z from FRED (WALCL - WTREGEN - RRPONTSYD), rolling z-score.
net_liq_z > 0: allow long signals, skip short signals
net_liq_z < 0: allow short signals, skip long signals
net_liq_z near zero: skip both (no trade today)

POSITION MANAGEMENT:
Stop: back inside Asia range (5 pips buffer)
Target 1: 1.0x Asia range size from breakout level (50% exit)
Target 2: 1.5x Asia range size (50% exit)
Time exit: 12:00 London

TRANSACTION COSTS: 0.02% round trip (FX spread).

WALK-FORWARD: 1yr train / 3mo test / 1mo step.

KEY OUTPUTS:
- Win rate with vs without macro filter (prove filter adds value)
- Performance by day of week (Monday breakouts different from Friday?)
- Average trade duration
- Comparison to I2 Asia Fib performance on same pairs
  (show they are complementary -- different trade type, similar pairs)

Single file: london_open_backtest.py
```

---

## Intraday Strategy Combined Summary

| Strategy | Capital Allocation | Est. Annual P&L | Priority |
|----------|-------------------|-----------------|---------|
| I2 Asia Fib | 10% ($10k) | $2,500-$3,500 | FIRST — already built, validate now |
| I1 ORB | 8% ($8k) | $1,600-$2,800 | SECOND — clean setup, macro filter ready |
| I5 London Open | 6% ($6k) | $1,200-$2,100 | THIRD — shares Asia range with I2 |
| I3 VWAP Reversion | 4% ($4k) | $600-$1,000 | FOURTH — NQ/ES only, vol-dependent |
| I4 News Fade | 2% ($2k) | $300-$600 | LAST — hardest to systematise |

**Total intraday allocation:** 30% of $100k = $30k
**Total estimated intraday P&L:** $6,200-$10,000/year

Combined with portfolio models (P1-P7 targeting $20k-$28k), total portfolio estimate:
**$26,000-$38,000/year on $100k — approximately 26-38% CAGR at base to optimistic case.**
