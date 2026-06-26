# Zone Trade Decision Framework
## How to Determine Whether a Zone Should Be Taken or Skipped

> Synthesised from: COG Regression Course, Range Extension Backtest, Intraday Strategies (I1-I5),
> Portfolio Models (P1-P8), Daily Vol Range Forecast Guide, Gold Bot design, Sniper Indicator
> validation, Profitability Improvements analysis, and quant principles beyond the MD files.

---

## Terminology Clarification (Important)

This framework covers two related but distinct level systems used across the codebase. Be clear
which one you're evaluating:

| System | Level Type | How Generated | Used In |
|--------|-----------|---------------|---------|
| **Asia Body Range Extensions** | SD±1.0, ±1.5, ±2.0, ±2.5 | Body high/low of Asia session (no wicks), projected as multiples of the range | Main bot, Range Extension backtest, Bennett's model |
| **Traditional Fibonacci Retracements** | 0.618 Golden Pocket, 0.786, 0.886 | Swing high → swing low impulse leg | Gold bot, Sniper Indicator |

Most of the rules in this document apply to **both** — but the level hierarchy sections are
separated. When the document says "SD level," it means the Asia body range extension. When it says
"Fib level," it means the traditional impulse-leg retracement used in the Gold bot context.

---

## The Core Problem

You have a zone. Price is approaching it. The question is not **where** the level is — it is
**whether this particular instance of price at this level is a trade worth taking.**

The lesson that runs through every document in this system is the same one the COG regression
course opens with:

> *Retail sees correlation and assumes edge. Professionals build models, stress-test assumptions,
> and understand exactly where their analysis can fail.*

A confluence zone is a correlation. The trade decision is the hypothesis test.

Why do SD extension levels and Fib retracement levels work at all? Not because of the mathematics
of Fibonacci or standard deviations per se — but because **enough participants act on them**. They
are coordination mechanisms. The levels with the most market participants aware of them (Golden
Pocket 0.618, SD±2.0, SD±1.5) outperform the more obscure ones precisely because of this
self-reinforcing coordination. This is not a weakness of the framework — it is the reason the edge
is persistent. You are always trading the level where institutional order flow is most likely to be
waiting, not a mathematical curiosity.

---

## Framework Overview: Seven Decision Layers

Think of these as gates, not points on a checklist. A trade **fails out** at the first gate it
cannot pass. Only trades that survive all seven gates have genuine edge behind them.

```
Layer 1 — Macro Regime          →  Is the fundamental environment with you or against you?
Layer 2 — Volatility Regime     →  Is the risk environment right for this trade type?
Layer 3 — Zone Quality          →  Is this level statistically significant enough to trade?
Layer 4 — Zone Staleness        →  How fresh is this level? Has it been confirmed across sessions?
Layer 5 — Price Structure       →  Is the zone in the right structural context right now?
Layer 6 — Timing Gates          →  Should we be trading at all at this moment?
Layer 7 — Intraday Confirmation →  What is price and momentum actually telling us at the level?
```

Any layer that comes back as a hard NO = skip. Any layer that comes back as a soft warning = reduce
size, do not force it.

Risk/Reward is a final check before execution — covered after the scoring section.

---

## Layer 1 — Macro Regime Gate

**The question:** Does the macro environment support this trade direction?

The P1 model and I1-I5 intraday strategies all share the same lesson: **the macro filter is the
edge**. Without macro confirmation, an ORB, an Asia range trade, and a London Open trade all revert
to approximately 50/50 — the structural level gives you the location, the macro gives you the
direction filter that lifts your win rate by removing roughly 40% of losing trades.

### What to Check

| Factor | Bullish Signal | Bearish Signal |
|--------|---------------|----------------|
| Fed Net Liquidity (WALCL − TGA − RRP) | Rising z-score | Falling z-score |
| Yield Curve (10Y−2Y) | Positive / widening | Inverted / narrowing |
| HY Credit Spreads | Falling (risk-on) | Rising (stress) |
| Real Yields (TIPS 10Y) | Low / negative | Rising |
| ISM / PMI | >50 expanding | <50 contracting |

**Composite macro score:**
- Score strongly positive → only take LONGs at support zones
- Score strongly negative → only take SHORTs at resistance zones
- Score near zero (neutral) → only take the highest-conviction zones, reduced size

**Hard rule:** If macro score is between −0.5 and +0.5 (neutral), skip or only take zones with
6+ confluence sources. Macro actively opposed = hard stop, full skip regardless of zone quality.

### COT Positioning Layer (if available)

| COT Reading | Implication |
|-------------|-------------|
| Managed money net long AND increasing | Momentum long — suits long bias |
| Managed money net long AND extreme (z > +1.5σ) | Crowded — contrarian risk for longs |
| Managed money net short AND extreme (z < −1.5σ) | Crowded — contrarian risk for shorts |
| Net position and weekly change in opposite directions | Turning — conviction low, reduce or skip |

---

## Layer 2 — Volatility Regime Gate

**The question:** Is the risk environment right for a mean-reversion trade at a structural zone?

### VIX / Vol Regime Classification

```
VIX z-score = (VIX - VIX.rolling(60).mean()) / VIX.rolling(60).std()

LOW vol    (z < −0.5)    →  Mean reversion works well. Normal sizing.
NORMAL vol (−0.5 to 1.0) →  Base case. Standard rules apply.
HIGH vol   (z > 1.0)     →  Reduce size 50%. SD extensions overshoot more. Widen targets.
EXTREME vol (z > 1.5)    →  Structural levels break. Only trade highest-conviction zones at 25% size.
                             JPY carry circuit breaker: two of (JPY +1.5% in 3 days,
                             VIX z > 1.5, HY spread z > 1.5) firing = stand aside entirely.
```

### Regime Persistence — Not Just Regime State

The regime classification tells you *where you are*. Regime persistence tells you *how long it will
last through your trade*. These are different questions, and the second one matters more for
intraday mean-reversion.

A NORMAL vol regime that has been drifting toward HIGH for 3 consecutive days is structurally
different from a NORMAL vol regime that has been stable for 2 weeks. In the first case, the regime
may flip against you mid-trade.

**Practical persistence check:**
```
Look at VIX z-score over the past 5 sessions:
  Trend lower (falling z) → regime stabilising/improving → higher persistence, more confidence
  Trend higher (rising z) → regime deteriorating → lower persistence, treat as one step worse
  Flat                    → stable regime → normal confidence

Example: VIX z = 0.8 (NORMAL) but trending up for 3 days
  → Treat as HIGH for sizing purposes even though not there yet
  → The zone may still work, but size down
```

Your RegimeV2 bot uses HMM precisely because it outputs a *probability of staying in regime X*
rather than just the current regime label. When available, that transition probability is more
useful than the label alone.

### Daily Range Budget Check

From the Daily Vol Range Forecast Guide: **the range is a budget**. Once most of it is spent,
the probability distribution shifts.

```
remainingRange = daily H-L median forecast − range already covered intraday

If usedPct > 80%:
  → Mean-reversion probability rises sharply (fade extensions)
  → Continuation/breakout probability collapses
  → Reduce size on any new directional entry

If usedPct < 20% (early session, range barely started):
  → Full budgeted daily range still ahead — SD levels have room to work
  → Normal sizing permitted
```

**Key integration:** If an SD extension level sits within 5 pips of the forecasted daily High or Low
projection, that is a double confluence — statistical extreme meeting structural level. A
92nd-percentile vol day warrants reduced size, not baseline.

In HIGH vol, SD extension levels act better as **springboards in the trend direction** than as full
reversal setups. Mean-reversion only reliably works in LOW and NORMAL regimes.

---

## Layer 3 — Zone Quality Gate

**The question:** Is this level actually significant, or is it a coincidence?

The COG regression course multiple testing problem: every confluence source you add is another
hypothesis test. The more you test, the more false positives you generate. A level that has 5+
**genuinely independent** reasons to hold is statistically different from one with 1-2.

"Independent" is the critical word. Two SD extension levels from today and yesterday's Asia range
are not fully independent — they share the same mathematical framework on the same instrument.
Volume POC, VWAP, daily pivot, and macro score are genuinely independent sources. Weight them
accordingly.

### SD Level Hierarchy (Asia Body Range Extensions)

Not all SD levels perform equally. The backtest established a hierarchy:

```
SD±2.0     → Strong extension. High structural exhaustion probability. Primary fade level.
SD±1.5     → Good extension. Second-best. Often tested before SD±2.0.
SD±1.0     → Weaker. Price often runs through on continuation days. Require more confluence.
SD±2.5     → Historical underperformer (21% win rate in early sample — needs 50+ trades to
             confirm or deny). Treat cautiously until walk-forward validates.
Inside range (SD±0.25 to ±0.75)  → Context-dependent. Low standalone edge.
             Only trade if 5+ other independent confluences align.
```

**Direction rule from the backtest:**
- SD ≥ +1.0: Structural fade → SELL (upward extension, mean-revert down)
- SD ≤ −1.0: Structural fade → BUY (downward extension, mean-revert up)
- SD between −1.0 and +1.0: Context-based (bar approach determines direction)

### Traditional Fib Level Hierarchy (Gold Bot / Impulse-Leg Context)

```
0.618–0.650 (Golden Pocket) → Primary reversal zone. Most reliable. Highest institutional awareness.
0.786                        → Deep retracement. Second-best reversal confirmation.
0.886                        → Preferred inside fixed volume ranges. Sharpest reactions.
0.382, 0.500                 → Shallower continuation entries. Lower conviction reversal.
```

### Confluence Sources (applies to both systems)

| Source | Weight | Notes |
|--------|--------|-------|
| SD level from today's Asia range | High | Structural, body-range only (no wicks) |
| SD level from yesterday's Asia range aligns | High | Cross-session agreement = "tight confluence" |
| SD level from Monday range aligns | High | Weekly anchor — strongest cross-time alignment |
| Daily or 4H pivot | High | Institutional reference, independently calculated |
| Volume POC (Point of Control) | High | Genuinely independent source. 10-15% win rate boost. |
| Volume VAH / VAL | Medium | Range boundary |
| Daily open (rolling 30 days) | Medium | Psychological level, becomes S/R after multiple tests |
| GARCH 95% CI band edge | Medium | Statistical extreme, independent of price structure |
| Daily vol range projected H or L | Medium | From vol forecast playbook |
| VWAP | Medium | Only counts if dynamic VWAP confirms direction |
| OI call/put wall (options) | Medium | Dealer gamma, genuinely independent |

**Scoring thresholds:**
- 1-2 confluences: Skip
- 3 confluences: Minimum to consider. All other layers must be green.
- 4-5 confluences: Good quality. Proceed if other layers clear.
- 6+ confluences: Highest conviction. This is the setup you want.

**Compressed vol adjustment (Gold Bot rule):** When ATR squeeze ratio is low, raise the minimum
threshold from 3 to 4-5. Choppy, compressed conditions = more false signals at levels.

---

## Layer 4 — Zone Staleness Gate

**The question:** How fresh is this level? Has it been confirmed across multiple sessions?

This layer was missing from most frameworks but is critical. A SD extension level generated from
today's Asia range is not equivalent to one generated 4 days ago that has never been revisited.
Zones weaken over time — but the decay rate depends on whether the level keeps being **reconfirmed**
by new sessions projecting to the same area.

### The Core Distinction

**Regenerated zone** — multiple sessions have independently projected to the same price area:
- Today's Asia range SD±2.0 *and* yesterday's SD±2.0 *and* Monday's SD±1.5 all cluster within 5 pips
- This level has been reconfirmed 3 times independently
- The zone is **strengthening**, not decaying
- Score gets a multiplier, not a penalty

**Stale zone** — generated once, not reconfirmed by subsequent sessions:
- Level appeared 3 sessions ago, no new session has projected near it
- No new participants are being drawn to this price
- The zone is decaying — fewer market participants are actively watching it

### X-Day Zone Memory with Decay

The recommended approach is to **store the last 10 sessions of zones** and apply a decay multiplier
based on recency and reconfirmation count:

```
Zone freshness score:

Sessions ago    | No reconfirmation | Reconfirmed once more | Reconfirmed twice+
----------------|-------------------|------------------------|--------------------
Today (0)       | 1.00×             | 1.00×                  | 1.00×
1 session ago   | 0.75×             | 1.10×                  | 1.25×
2 sessions ago  | 0.50×             | 0.90×                  | 1.15×
3-4 sessions    | 0.35×             | 0.65×                  | 1.00×
5+ sessions     | 0.20×             | 0.40×                  | 0.70×
```

Reading this table: a level that was generated 2 sessions ago AND was reconfirmed by yesterday's
session projecting to the same area scores **0.90×** — nearly as strong as today's fresh level.
A level generated 2 sessions ago with no reconfirmation scores 0.50×.

**Practical implementation:**

```
For each stored zone in the lookback window:

1. Identify the price cluster (group zones within 5 pips of each other)
2. Count: how many sessions have independently projected into this cluster?
3. Note: when was the cluster first formed and when was it last refreshed?
4. Apply the freshness multiplier to the zone's base confluence score

cluster_score = base_confluence_score × freshness_multiplier × reconfirmation_count_bonus

where reconfirmation_count_bonus:
  1 session:  1.00×
  2 sessions: 1.25×
  3 sessions: 1.50×
  4+ sessions: 1.75× (cap — don't keep compounding indefinitely)
```

### Why Reconfirmed Zones Are Stronger

When 3 separate Asia sessions all independently project to the same price area, it means:
- Institutional order flow has been clustering there across multiple days
- Sell orders or buy orders from those sessions are potentially still resting there
- Market makers are aware of the level across multiple time horizons
- The self-fulfilling coordination effect is stronger — more participants watching it

This is not just theoretical. The Range Extension backtest found that "today's projection aligning
with previous session's projection (within tolerance)" was the primary confluence signal. The
staleness model formalises this with a decay function for levels that *don't* keep being confirmed.

### Hard Staleness Rule

```
A level that has not been reconfirmed within 5 sessions AND has been tested once already:
→ Remove from the active zone list entirely
→ A level that has been touched and held scores normally
→ A level that has been touched and failed (price closed through it) = invalidated immediately
```

---

## Layer 5 — Price Structure Gate

**The question:** Is the zone in the right structural context right now?

### HTF Bias Check

Drop to H4 and Daily timeframes before evaluating the zone.

- Is H4 structure bullish (higher highs, higher lows) or bearish?
- Where is price relative to the Daily and H4 200-period MA?
- Is the trade direction aligned with HTF structure (continuation) or counter to it (reversal)?

**Aligned (continuation from HTF pullback) = higher probability than counter-trend reversal.**

For counter-trend reversal zones, require:
- At least one more confluence source than you would for aligned trades
- Macro score actively pointing in the reversal direction (not just neutral)
- Vol regime in LOW or NORMAL (reversals fail more in HIGH vol)

### Structural Invalidation Clarity

The zone stays active until price closes beyond `swing_origin` — the start of the impulse leg that
created the level. If the impulse origin is unclear, or price has already partially wicked through
the zone and recovered, the structural story is weakened.

**Questions to ask:**
- Is the swing high/low that created this level still intact?
- Has price already tested this zone 2+ times without bouncing? (Multiple tests weaken zones)
- Is there a clear invalidation level — where is the trade simply wrong?

### Session Context

```
London session (07:00–16:00 London): Highest volume, tightest spreads, most reliable reversals.
New York session (13:00–20:00 London): Second-best. Overlaps with London early.
Asia session (00:00–06:00 London): Lower volume. Levels tested but reversals are shallower.
                                    Spreads wider. Win rate lower. Require 6+ stars if taking.
```

---

## Layer 6 — Timing Gates

**The question:** Should we be trading at this moment at all?

These are hard blocks. No matter how good the zone looks, timing gates are non-negotiable.

### Hard Skip Conditions

| Condition | Action |
|-----------|--------|
| High-impact news within 30 minutes (NFP, FOMC, CPI) | SKIP — 15-20% lower win rate |
| FOMC rate decision with a genuine surprise | SKIP — surprises trend, they do not revert |
| VIX z-score > 1.5 (panic regime) | SKIP or 25% size maximum |
| JPY carry circuit breaker active (2+ of 3 conditions) | SKIP all except Gold/safe haven |
| Outside London or NY active session (unless zone is 6+ stars) | SKIP or wait for session |
| Initial 30 minutes of NY open (09:30–10:00 ET) | SKIP — erratic institutional rebalancing |
| First candle of London open (07:00–07:30) for mean-reversion | SKIP — let London establish direction first |
| End of day (within 30 minutes of session close) | SKIP unless managing an existing trade |

### Day-of-Week Awareness

```
Monday:
  - Extra caution on gaps and opening range setups
  - Monday 30m range most powerful when it confirms Asia range direction
  - Do not chase Monday's initial move before range is established

Friday:
  - Close existing trades before 16:00 London if not strongly in profit
  - Avoid new entries after 14:00 London (weekend gap risk)
  - Exception: very high-conviction zones at end-of-week institutional rebalancing
```

---

## Layer 7 — Intraday Confirmation Gate

**The question:** What is price and momentum actually telling us at the level right now?

**Rule:** Do not enter on a level *touch*. Enter on a *confirmation* of the level holding.

### Why This Rule Exists — The Adverse Selection Problem

This is more than just patience. When you place a limit order at an SD level and it fills
*immediately* at the exact level, be suspicious: you filled because the counterparty was *willing*
to sell you exactly there. That is often informed institutional flow testing the level.

When price touches, wicks, then bounces — and *then* you enter on candle confirmation — you are
entering *after* the informed selling pressure has been absorbed. You let the market reveal which
side absorbed the pressure before committing capital. Adverse selection is dramatically lower on
confirmed entries than on limit orders sitting at the level.

### The Three-Component Confirmation (Vu Manchu Model)

At least 2 of the 3 components must align before entering:

| Component | Long Entry Condition | Short Entry Condition |
|-----------|---------------------|-----------------------|
| WT Oscillator (momentum) | Oversold, divergence, or hidden bull div | Overbought, divergence, or hidden bear div |
| Money Flow | Positive (MF > 0) | Negative (MF < 0) |
| VWAP (price vs) | Price above VWAP | Price below VWAP |

**The fuel concept (Money Flow):**
- Sharp spike in MF at level = energy spent → reversal likely → **take the trade**
- Weak, shallow MF spike = fuel remaining → continuation likely → **skip the trade**

This is one of the most actionable real-time filters. A zone where the sharp MF spike has fired is
in a fundamentally different probability state from one where price arrives without it.

### Candle Confirmation (5m Close)

The single most reliable real-time filter identified in the profitability review:

```
For LONG entry:
  - Last closed 5m bar must close bullish (close > open)
  - Price above EMA(8) on 5m
  - Wick rejection: bar low wicked through zone, close above it

For SHORT entry:
  - Last closed 5m bar must close bearish (close < open)
  - Price below EMA(8) on 5m
  - Wick rejection: bar high wicked through zone, close below it
```

### The Stopping Problem (Entry Price Trade-off)

Waiting for confirmation always costs you some entry price versus a limit at the level. This
trade-off has a practical implication:

```
High R:R setup (3R+): Waiting for full confirmation costs little relative to upside.
                       Worth it — always wait.

Low R:R setup (1.5-2R): Waiting for confirmation eats meaningfully into the R multiple.
                         Re-check R:R at the confirmed entry price, not the level price.
                         If R:R drops below 1.5 after confirmation, skip — the trade
                         is no longer mathematically sound.
```

This is why tight 1.5R setups that need candle confirmation often become skip situations in
practice. The confirmation cost kills the edge.

### Divergence Type Matters

Regular divergence = reversal signal (price makes new high, oscillator makes lower high = bearish)
Hidden divergence = continuation signal (price pulls back, oscillator confirms trend momentum)

Misclassifying them inverts the signal entirely. Check carefully which type is present and whether
it matches the intended trade type.

### Liquidity Sweep Bonus

If price has recently wicked through the zone and closed back inside:

```
swept = (bar high > zone AND bar close < zone) OR
        (bar low < zone AND bar close > zone)

If swept = true: entry conviction rises significantly.
Reason: market makers have cleared the liquidity above/below the level.
  Weak-hand stops have already been hit. The reversal is more likely to hold.
  You are now trading in the same direction as the institutional flow that ran
  the stops — not against it.
```

---

## The Composite Confidence Score

### Additive Scoring vs Bayesian Updating

**Important caveat on the additive scoring system below:** adding points assumes all confluence
sources are independent. Many are not. Macro score and credit spreads share variance. Today's and
yesterday's Asia SD levels share the same mathematical framework.

The theoretically correct method is **Bayesian updating**: start with the base win rate for this
setup type, then multiply by the likelihood ratio for each *genuinely independent* signal. But
this requires calibrated historical data.

**Practical middle ground:** use the additive score for ranking and filtering (7 is better than 5),
but do not treat the score as a direct probability (7/10 ≠ 70% win rate). The score tells you
which zones are worth trading; it does not tell you exactly how likely they are to win until you
have accumulated 200+ historical trades per setup category and run a calibration pass.

### Scoring System

```
Start at 0.

Layer 1 — Macro direction aligned:              +2 points
  macro neutral (not opposed, just flat):       +1 point
  macro actively opposed:                       HARD STOP

Layer 2 — Vol regime:
  LOW vol, stable or improving:                 +1 point
  NORMAL vol, stable:                           +0.5 point
  NORMAL vol, trending toward HIGH:             +0 point (treat as HIGH for sizing)
  HIGH vol:                                     -1 point (reduce size 50%)
  EXTREME vol / circuit breaker:                HARD STOP

Layer 3 — Zone confluence (independent sources):
  3 confluences:                                +1 point
  4-5 confluences:                              +2 points
  6+ confluences:                               +3 points
  Includes Volume POC alignment:                +0.5 extra (genuinely independent)

Layer 4 — Zone staleness:
  Today's level (fresh):                        +0 (no bonus or penalty)
  Reconfirmed by 2+ sessions independently:     +1 point
  Reconfirmed by 3+ sessions independently:     +1.5 points
  1-2 sessions old, no reconfirmation:          -0.5 point
  3-4 sessions old, no reconfirmation:          -1 point
  5+ sessions old, no reconfirmation:           remove zone from active list

Layer 5 — Structural alignment:
  HTF trend-aligned (continuation):             +1 point
  Counter-trend but strong HTF structure:       +0.5 point
  Structural origin still intact:               +0.5 point
  Zone tested 2+ times, price bounced:          -0.5 point (weakening)

Layer 6 — Timing:
  London prime session:                         +0.5 point
  NY overlaps London:                           +0.25 point
  News event within 30 min:                     HARD STOP
  Asia session only:                            -0.5 point

Layer 7 — Intraday confirmation:
  3/3 VMU components aligned:                   +1 point
  2/3 VMU components aligned:                   +0.5 point (minimum to proceed)
  1/3 VMU components only:                      HARD STOP
  Candle confirmation present (5m close):       +0.5 point
  Liquidity sweep detected:                     +0.5 point
  MF fuel spike (sharp):                        +0.5 point

Maximum raw score: ~12 points (normalise to 0-10 by multiplying by 10/12)

Normalised score ≥ 7:    HIGH CONFLUENCE — take the trade at full size
Normalised score 5-6:    MODERATE — take at 50-75% size
Normalised score 3-4:    LOW — skip, or only if R:R is 4R+ and all hard stops clear
Normalised score < 3:    SKIP
```

**Your signals validated against this framework:**
- EURGBP SELL SD +1.25 Score 2/10 → SKIPPED ✓ (correct, below threshold)
- USDCAD SELL Probability 8/10 HIGH CONFLUENCE → TRADED ✓ (correct, above threshold)
- EURUSD SELL Prob 0.640 < 0.65 threshold → SKIPPED ✓ (correct, marginal case correctly filtered)

---

## Risk/Reward Gate — Final Check Before Execution

### Minimum Requirements

| Metric | Minimum | Preferred |
|--------|---------|-----------|
| Risk:Reward ratio | 1.5:1 | 3:1 or better |
| Stop placement | Structural (beyond swing) | Structural + 0.1× ATR buffer |
| Max stop distance | 1.5× ATR | Within range that created the level |
| Target basis | Next confluence level | Next SD extension or session extreme |

### Stop Placement Hierarchy

```
Best:   Stop just beyond swing_origin (the impulse that created the SD level)
        = structural invalidation — if this breaks, the whole range idea is wrong

Good:   Stop just beyond the zone itself (zone_high + buffer for longs,
        zone_low − buffer for shorts)

Avoid:  Fixed ATR multiplier in empty space (not tied to any structure)
```

**Hard cap:** Never wider than 40 pips regardless of structure. If structure demands a wider stop,
size down significantly or skip.

### Position Sizing — Expectancy Principle (Not Full Kelly)

Kelly Criterion in its full form recommends betting a fraction of capital calculated from your
estimated win rate and R:R. The problem: full Kelly can suggest 30-50% of capital per trade, and
its outputs are extremely sensitive to estimation error in your win rate. If your estimated win rate
is 60% but the true rate is 52%, full Kelly causes catastrophic drawdowns.

**The practical framework instead:**

```
Tier 1 — No historical data on this setup type yet:
  → Use 0.5-1% account risk per trade regardless of score
  → You do not yet have the data to justify larger sizing
  → Accumulating trades IS the work at this stage

Tier 2 — 50-200 historical trades on this setup type:
  → Scale size with score but cap at 1.5% account risk
  → Begin tracking whether score actually predicts outcome
  → Score 7+ = 1.5%, Score 5-6 = 1.0%, Score 3-4 = 0.5%

Tier 3 — 200+ historical trades, calibrated win rate known:
  → Half-Kelly maximum: risk = (win_rate × avg_win − loss_rate × avg_loss) / avg_win × 0.5
  → Hard cap at 2% account risk even if Kelly says more
  → This tier requires genuinely validated data, not a small sample
```

The score is a **ranking tool** until calibrated. It tells you which trades are better than
others. It cannot tell you exact probabilities until you have tested it across 200+ trades per
setup category and confirmed those probabilities out-of-sample.

---

## Non-Entry Conditions (As Important as Entry Conditions)

From the Vu Manchu validation document: the ability to correctly identify **non-entry** conditions
is weighted equally to entry conditions. A trade you correctly skip is as valuable as one you
correctly take.

| Condition | Why to Skip |
|-----------|-------------|
| MF spike is weak/shallow at level | Fuel remaining — continuation more likely |
| Only 1 VMU component confirms | Insufficient — higher false-positive rate |
| Divergence present but no macro alignment | Technical signal without fundamental support |
| Price has tested this zone 2+ times already | Zone weakening, next test may break through |
| Zone score below threshold AND vol is HIGH | Double negative — do not force |
| Level has not been reconfirmed in 3+ sessions | Staleness decay overrides confluence score |
| R:R at confirmed entry (not level price) is < 1.5 | Confirmation cost killed the trade |
| Spread unusually wide (Asia, pre-news) | Execution quality too poor to justify the setup |
| Regime transitioning (VIX z trending upward fast) | Choppy conditions, levels break more often |

---

## Working Decision Tree

```
Price approaches zone
        │
        ▼
1. MACRO GATE: Direction macro-supported?
   OPPOSED → SKIP immediately
   NEUTRAL → requires 6+ confluence → continue
   ALIGNED → continue
        │
        ▼
2. VOL REGIME: Tradeable regime?
   EXTREME / circuit breaker → SKIP
   HIGH → require 5+ confluence, reduce size 50%, continue
   NORMAL trending to HIGH → treat as HIGH, continue cautiously
   LOW/NORMAL stable → continue
        │
        ▼
3. ZONE QUALITY: ≥ 3 independent confluence sources?
   < 3 → SKIP
   3-4 → proceed cautiously, need all other layers green
   5+ → proceed
        │
        ▼
4. ZONE STALENESS: How fresh / reconfirmed is this level?
   5+ sessions old, no reconfirmation → SKIP (remove from list)
   3-4 sessions old, no reconfirmation → needs 5+ confluence to compensate
   Reconfirmed 2+ sessions → bonus to score, proceed
   Fresh (today) → proceed
        │
        ▼
5. STRUCTURE: HTF aligned? Swing origin intact? Sufficient R:R?
   R:R at level < 1.5 → SKIP
   Counter-trend without macro support → SKIP
   Structure intact → continue
        │
        ▼
6. TIMING: Any hard-stop timing condition active?
   News within 30 min → SKIP
   Outside London/NY and zone < 6 stars → SKIP
   Clear → continue
        │
        ▼
7. CONFIRMATION: ≥ 2/3 VMU components + candle confirmation?
   0-1 components → SKIP
   2 components, no candle → wait (do not force entry)
   2+ components + candle confirmed → continue
        │
        ▼
COMPOSITE SCORE ≥ 7 → full size | 5-6 → 50% size | < 5 → skip
        │
        ▼
FINAL R:R CHECK at confirmed entry price (not level price)
   < 1.5R after confirmation cost → SKIP
   ≥ 1.5R → ENTER
```

---

## The Statistical Foundation

From the COG regression course: every confluence source in the score is effectively a t-statistic.
The Harvey-Liu-Zhu threshold of |t| > 3 is the minimum bar for any factor you intend to trade live.
A zone with 5+ genuinely independent confluences is running a t-statistic well above that.

The zone staleness system addresses a problem the regression course calls **non-stationarity** —
relationships change over time. A level that kept being reconfirmed has demonstrated statistical
persistence across time. A level generated once and never revisited has shown no such persistence.
Rolling the zone lookback with decay is the intraday equivalent of the rolling regression window
used in the P1 macro model.

**The walk-forward requirement:** Your confidence score only has genuine value if it has been tested
out-of-sample across multiple regimes. A score framework built and validated on 3.5 weeks of
EURUSD data in 2025 is not a validated system. The framework earns the right to run at full size
only after walk-forward results confirm it generalises across 2+ years and 2+ pairs.

---

## Practical Summary Card

```
Before any zone trade — run this in 60 seconds:

HARD STOPS (any one = immediate skip):
  □ Macro actively opposed to direction
  □ News event within 30 minutes
  □ VIX z-score > 1.5 (circuit breaker)
  □ Fewer than 2 VMU components confirming
  □ R:R at confirmed entry < 1.5:1
  □ Zone 5+ sessions old with no reconfirmation

SOFT WARNINGS (accumulate = reduce size or skip):
  □ Macro neutral (not opposed, just flat)
  □ Vol regime HIGH or trending toward HIGH
  □ Zone has only 3 confluences (not 5+)
  □ Zone not reconfirmed across sessions (1 session old)
  □ Counter-trend to HTF structure
  □ Asia session only (not London/NY)
  □ Zone tested 2+ times already this session
  □ MF spike weak (not sharp)
  □ Candle confirmation absent (still waiting)
  □ No historical data yet for this setup type (size down)

GO conditions (all green = trade at scale):
  □ Macro score actively aligned
  □ Vol regime LOW or NORMAL, stable or improving
  □ Zone has 5+ genuine independent confluences
  □ Zone reconfirmed across 2+ sessions
  □ HTF structure supportive
  □ London or NY session active, no news
  □ 2+ VMU components aligned
  □ Candle confirmation and wick rejection present
  □ Sharp MF fuel spike at level
  □ Liquidity sweep detected (bonus)
  □ R:R ≥ 3:1 at confirmed entry price
  □ Composite score ≥ 7/10
```

---

*Synthesised from all MD files in this codebase plus quant principles on Bayesian updating,
adverse selection, regime persistence, zone staleness, and score calibration — June 2026.*
*Designed for use alongside the live dashboard confidence score system and bot probability filters.*
