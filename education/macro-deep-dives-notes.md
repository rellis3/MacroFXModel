# Macro Deep Dives — Lesson Notes

> **Course:** Colez Trades — Quantitative & Macro Insights
> **Module:** Macro Deep Dives — standalone frameworks and live applications:
> regime detection, the rates–FX lead-lag, business-sentiment signals, and reading
> the options complex.
> **Lessons covered:** 1 — Macro Drivers, Regime Detection & Validation ·
> 2 — The Transatlantic Yield Spread · 3 — Live Case Study: The Spread Moved First.
> **Purpose:** raw learning notes on the lesson material — key facts, frameworks,
> formulas, and questions to investigate later. For revision, exams, and real-time use.

---

## Lesson 1 — Macro Drivers, Regime Detection & Validation

### 1.1 The drivers of asset prices (six macro factor families)

Macroeconomic variables create the fundamental currents that move markets.
Understanding these drivers is the foundation of systematic macro trading.

| Driver | What it shapes | Key series to watch |
|---|---|---|
| **Growth expectations** | Risk appetite and corporate earnings expectations across all asset classes | GDP growth, employment trends, industrial production, leading indicators |
| **Inflation dynamics** | Real returns, central bank policy, nominal-vs-real asset attractiveness | CPI, PCE, wage growth, inflation expectations |
| **Monetary policy** | Liquidity conditions and discount rates for all assets | Fed funds rate, QE/QT, forward guidance, global CB coordination |
| **Liquidity conditions** | Availability of capital flowing through the financial system | M2 growth, bank reserves, credit spreads, funding markets |
| **Risk sentiment** | Aggregate risk appetite and potential for mean reversion | VIX, credit spreads, safe-haven flows, positioning data |
| **Global flows** | Cross-border dynamics and relative valuations | Capital flows, currency movements, trade balances, reserve accumulation |

**Memory aid:** Growth, Inflation, Policy, Liquidity, Sentiment, Flows.
Growth and inflation define the regime quadrant (§1.3); the other four modulate
how a regime expresses itself.

### 1.2 The yield curve as economic barometer

The yield curve encodes market expectations about future growth, inflation, and
monetary policy. Its shape is one of the most powerful predictive signals in macro
finance.

**Term spread** = `Yield(10Y) − Yield(2Y)`

| Curve shape | Economic implication | Historical lead time | Asset implications |
|---|---|---|---|
| Steep (normal) | Expansion expected, positive carry | — | Cyclicals, banks, duration |
| Flat | Transition period, uncertainty | 6–12 months pre-slowdown | Quality, cash |
| **Inverted** | Recession signal, rate cuts expected | **12–24 months pre-recession** | Duration, defensives; avoid cyclicals |
| Bear steepening | Rising long rates, inflation fears | — | Commodities, TIPS; avoid growth |
| Bull steepening | Rate cuts, early recovery | — | Risk assets, small cap |

**Revision point:** bear steepening = long end rises (inflation fear); bull
steepening = short end falls (cuts arriving). Same shape change, opposite cause,
opposite asset map.

### 1.3 The growth–inflation quadrant (regime classification)

Every macro environment can be classified into one of four regimes along two
dimensions: **growth trajectory** and **inflation trajectory**. Each regime has
distinct asset-class implications.

```
                 Inflation falling        Inflation rising
 Growth  │   GOLDILOCKS               REFLATION
 rising  │   OW: equities, credit,     OW: commodities, value,
         │       growth stocks, EM         TIPS, energy
         │   UW: commodities, gold,    UW: duration, growth
         │       cash                      stocks, bonds
 ────────┼──────────────────────────────────────────────────
 Growth  │   DEFLATION / RISK-OFF     STAGFLATION
 falling │   OW: duration, quality,    OW: gold, energy, cash,
         │       USD, defensives           TIPS
         │   UW: cyclicals, EM,        UW: equities, bonds,
         │       high yield                credit
```

- **Goldilocks** — the ideal environment: strong growth without inflationary
  pressure lets central banks stay accommodative; risk assets thrive.
- **Reflation** — expansion with building price pressures; central banks begin
  tightening; real assets and value outperform.
- **Deflation / risk-off** — contraction with falling prices; flight to safety
  dominates; central banks cut aggressively.
- **Stagflation** — the worst environment: weak growth with persistent inflation
  leaves central banks trapped; real assets and cash are the only refuge.

### 1.4 Regime detection framework

**Core principle: use rate of change, not levels** — we care about trajectory,
not absolute values. (A 55 ISM falling from 60 is deteriorating growth even though
the level is expansionary.)

| Dimension | Primary indicators | Secondary indicators | Signal construction |
|---|---|---|---|
| **Growth** | ISM Manufacturing PMI, ISM Services PMI | Initial claims, LEI, industrial production | 3-month rate of change vs 12-month trend |
| **Inflation** | Core CPI, Core PCE, 5Y breakevens | PPI, wage growth, commodity indices | YoY change in 3-month momentum |

Implementation sketch from the lesson:

```python
def calculate_growth_score(ism_mfg, ism_svc, claims, lei):
    # Normalize each indicator to z-score
    # Calculate 3-month momentum vs 12-month trend
    ism_composite = 0.4 * ism_mfg + 0.4 * ism_svc + 0.2 * (50 - claims_zscore)
    momentum = ism_composite.rolling(3).mean() - ism_composite.rolling(12).mean()
    return momentum

def calculate_inflation_score(core_cpi, core_pce, breakevens):
    inflation_composite = 0.4 * core_cpi + 0.4 * core_pce + 0.2 * breakevens
    momentum = inflation_composite.diff(3)   # 3-month change
    return momentum

def classify_regime(growth_score, inflation_score):
    # Threshold at zero for simplicity (or use percentiles)
    if growth_score > 0 and inflation_score <= 0: return "GOLDILOCKS"
    if growth_score > 0 and inflation_score > 0:  return "REFLATION"
    if growth_score <= 0 and inflation_score > 0: return "STAGFLATION"
    return "DEFLATION"
```

**Data note (from the lesson):** the FRED API provides free access to these
indicators — fred.stlouisfed.org or the `fredapi` Python package.

### 1.5 Regime transition signals

**Regime transitions are often more important than the regime itself.** Early
detection of transitions provides the highest-value trading signals.

| Transition | Early warning signs | Typical duration | Positioning shift |
|---|---|---|---|
| Goldilocks → Reflation | Wage growth accelerating, commodity prices rising, breakevens widening | 3–6 months | Rotate Growth→Value, add commodities, reduce duration |
| Reflation → Stagflation | PMIs rolling over while inflation sticky, yield curve flattening | 2–4 months | Reduce equity beta, add gold, increase cash |
| Stagflation → Deflation | Credit spreads widening, inflation expectations falling, PMIs contracting | **1–3 months (often rapid)** | Add duration aggressively, quality over junk, reduce commodities |
| Deflation → Goldilocks | PMIs troughing, credit spreads narrowing, central bank easing | 3–6 months | Add risk, reduce duration, favour cyclicals |

**Revision point:** stagflation→deflation is the fastest transition and is
credit-driven — the early warnings are market prices (credit spreads, breakevens),
not survey data.

### 1.6 Historical asset performance by regime (1970–2024, annualised)

| Asset class | Goldilocks | Reflation | Stagflation | Deflation |
|---|---|---|---|---|
| US equities | **+15.2%** | +8.4% | −4.2% | −12.1% |
| US Treasuries (10Y) | +4.1% | −2.3% | −1.8% | **+11.4%** |
| Commodities (GSCI) | +1.2% | **+18.7%** | +12.3% | −15.8% |
| Gold | −2.1% | +8.9% | **+21.4%** | +6.2% |
| USD index | −3.2% | +0.8% | +2.4% | **+7.1%** |

*Regimes classified using ISM and CPI momentum. Past performance is not indicative
of future results (per the lesson).*

**Key facts to remember:** each asset has one standout regime — equities in
goldilocks, duration in deflation, commodities in reflation, gold in stagflation,
USD in deflation/risk-off. **FX relevance:** the USD's best regime is
deflation/risk-off (+7.1%) and its worst is goldilocks (−3.2%).

### 1.7 Entry models — the four systematic strategy families

Different market inefficiencies require different exploitation methods.

**⟲ Mean reversion** — prices oscillate around a central tendency; extreme
deviations tend to revert.
- Signals: z-score from MA (`Z = (Price − MA) / σ`, entry when |Z| > 2); RSI
  extremes (<30 oversold, >70 overbought); Bollinger penetration with volume
  confirmation; pairs spread deviation from cointegrated equilibrium.
- Best conditions: range-bound, low-volatility regimes; high mean-reversion
  coefficient assets; absence of strong fundamental catalysts.

**↗ Momentum / trend following** — winners keep winning; trends persist due to
behavioural biases and slow information diffusion.
- Signals: time-series 12-1 momentum (`Signal = Return(t−252 → t−21)`, skip the
  most recent month); 50/200-day golden cross; Donchian/ATR breakout systems;
  cross-sectional rank (long top decile, short bottom).
- Best conditions: trending markets, macro regime changes, high dispersion across
  assets, strong macro catalysts driving flows.

**⇌ Statistical arbitrage** — related securities should maintain stable
relationships; temporary deviations create market-neutral opportunities.
- Types: pairs trading (long underperformer / short outperformer); basket vs
  component (ETF vs underlying); factor residuals (alpha after removing factor
  exposures); cross-asset (credit vs equity, commodity vs producer).
- Spread model: `Spread = β₀ + β₁·Asset₁ − Asset₂ + ε`.
- Key requirements: **cointegration (not just correlation)**, an economic linkage
  explaining the relationship, sufficient liquidity in both legs.

**⏱ Lead–lag relationships** — information doesn't propagate instantly; some
assets/sectors/markets lead others.
- Common pairs: copper → equities (industrial demand); credit → equity (credit
  often leads turning points); large cap → small cap (information flows to less
  liquid); futures → cash (informed traders use leveraged markets first).
- Measure: cross-correlation `ρ(lag) = Corr(Xₜ, Yₜ₊ₗₐ𝓰)`.
- **Validation required:** Granger causality testing, out-of-sample stability,
  and an economic rationale for the lead.

### 1.8 Validation framework — rigorous strategy testing

"The quantitative structure that separates robust strategies from data-mined
illusions. Every edge must survive this gauntlet."

Pipeline (in order):
1. **In-sample dev** — build and optimise on training data
2. **Walk-forward** — rolling optimisation + test windows
3. **Out-of-sample** — final holdout test (never touched)
4. **Monte Carlo** — assess robustness via simulation
5. **Sensitivity** — parameter stability testing
6. **Paper trade** — live market, no capital at risk

**Walk-forward optimisation** — the gold standard. Repeatedly optimise on past
data, test on the next window; final performance is the concatenation of all OOS
test periods (mimics real trading — you never have future information).

**Walk-forward efficiency:** `WFE = OOS performance / IS performance`.
Target **WFE > 0.5**; below **0.3** suggests severe overfitting.

**Performance metrics reference:**

| Metric | Formula | Good | Excellent | Measures |
|---|---|---|---|---|
| Sharpe ratio | (R − Rf) / σ | > 1.0 | > 2.0 | Risk-adjusted return (total vol) |
| Sortino ratio | (R − Rf) / σ_down | > 1.5 | > 2.5 | Risk-adjusted (downside vol only) |
| Calmar ratio | CAGR / MaxDD | > 0.5 | > 1.0 | Return per unit drawdown risk |
| Information ratio | α / tracking error | > 0.5 | > 1.0 | Active return per unit active risk |
| Profit factor | gross profit / gross loss | > 1.5 | > 2.0 | Magnitude of wins vs losses |

**System development checklist:**

*Before backtesting:* economic rationale documented · point-in-time data
confirmed · survivorship bias addressed · transaction cost model built · OOS
holdout data reserved.

*Before live trading:* walk-forward analysis passed · statistical significance
confirmed · Monte Carlo stress tested · paper trading completed (3+ months) ·
risk limits and kill switches set.

---

## Lesson 2 — The Transatlantic Yield Spread (US 10Y vs German Bund)

"The most important spread in global macro, and why it leads EUR/USD."

### 2.1 Snapshot (data through 02 Sep 2025)

- US 10Y yield: **4.27%** (▲ 7 bps) · German 10Y: **2.79%** (▲ 16 bps)
- Spread: **+149 bps** (▼ 9 bps) — **21st percentile** vs 5-year history
- 5-year range: **min 101 bps (2023-04-24)** · **max 227 bps (2024-12-24)** ·
  **mean 169 bps**
- 2025 regime: **narrowing** — down 78 bps from the Dec-2024 peak. Markets pricing
  ECB cuts slower than previously expected while the Fed stays on hold.

### 2.2 The core principle — why the spread leads EUR/USD

> Capital flows to where it earns the highest risk-adjusted return. When US yields
> rise relative to German yields, holding dollars becomes more attractive than
> holding euros. Global investors — pension funds, sovereign wealth funds, reserve
> managers, hedge funds — shift portfolios accordingly, creating structural USD
> demand that persists until the differential changes.

**The key insight: portfolio flows take time to execute.** Large institutions
don't move billions overnight — they announce strategic changes, execute over
weeks or months, and their flows show up in the currency market *after* the yield
move that triggered them. **This is why the spread leads.**

### 2.3 The five transmission channels (memorise, with timescales)

| # | Channel | Timescale | Mechanism |
|---|---|---|---|
| 1 | **Carry trade** | Hours to days | Speculative capital borrows the low-yield currency (EUR) to buy USD assets; hedge funds/prop desks execute within hours |
| 2 | **Fixed-income reallocation** | 1–4 weeks | Bond fund managers shift allocations toward the higher yield as they rebalance and handle redemptions |
| 3 | **Pension & insurance flows** | 2–6 months | Liability-driven investors: higher US yields mean fewer dollars needed to fund future USD liabilities; investment-committee speed |
| 4 | **Reserve manager behaviour** | Quarters | Central banks hold ~60% of reserves in USD; higher US yields justify higher allocations; slow but enormous notional |
| 5 | **Corporate treasury** | Variable (months) | Multinationals repatriate offshore earnings, choose funding currency; depends on corporate cash cycles |

Ordered fast → slow: **Carry, Funds, Pensions, Reserves, Corporates.**

**The lead-lag chain:** Fed hawkish signal → US yields rise → spread widens →
carry trades (days) → fund flows (weeks) → real money (months) → EUR/USD falls →
trend persists → until the spread reverses.

**The trading edge:** because institutional flows take time, a sustained spread
move predicts *continued* EUR/USD movement even after the initial FX reaction.
**Spread momentum — not just level — is the powerful signal**: a widening spread
that keeps widening implies more USD strength ahead as slower capital catches up.

### 2.4 Practical applications — why the relationship is useful

1. **Observable in real time.** Unlike GDP, inflation expectations, or current
   account data, the spread updates tick-by-tick. A spread gap on a Fed statement
   tells you — immediately — that USD-supportive flows are coming.
2. **It provides lead time.** The lag between spread and FX creates a window to
   position ahead of slower institutional flows. Lead time by condition:

   | Market condition | Typical lead | Why |
   |---|---|---|
   | High volatility / news-driven | Hours to 1–2 days | Fast money dominates, quick repricing |
   | Trending market | 1–2 weeks | Institutional flows build gradually |
   | Range-bound / low vol | 2–4 weeks | Flows sluggish, need accumulation |
   | Regime change | 1–3 months | Strategic reallocations take time |

   Pattern: **more volatility ⇒ shorter lead.**
3. **It validates or rejects FX moves.** EUR/USD moves sharply *without* spread
   confirmation → likely positioning/technicals/noise → tends to reverse
   (mean-reversion opportunity). Move *with* spread confirmation → fundamental
   backing, more likely to persist.
4. **It warns of regime changes.** Prolonged divergence (spread widening for
   months but EUR/USD no longer falling) suggests the move is fully priced, other
   factors are offsetting, or a reversal is coming. Non-confirmation = "the easy
   money in the trend is over."
5. **It works in both directions.** Symmetric: spread narrowing → capital flows
   out of USD into EUR-denominated assets → EUR strengthens.

### 2.5 Deep mechanics — from yield to FX, step by step

Scenario: Fed signals fewer rate cuts than expected.

- **T+0** — Powell suggests inflation is stickier; markets reprice; US 2Y jumps
  15 bps within minutes.
- **T+0 → 1hr** — term structure adjusts: US 10Y +8–10 bps; Bunds unchanged
  (no catalyst); spread widens 8–10 bps.
- **T+1hr → 1 day** — fast money moves: macro funds and CTAs short EUR/USD for
  carry and momentum; −50–80 pips. The "obvious" quick move.
- **T+1 day → 1 week** — asset managers rebalance Bunds → Treasuries; each
  purchase buys USD / sells EUR; EUR/USD drifts lower.
- **T+1 week → 1 month** — real money (pensions, insurers) executes strategic
  rebalancing; large flows spread over weeks; **EUR/USD grinds lower even as news
  flow quiets.**
- **T+1 month+** — new equilibrium; the spread move is fully reflected; the trade
  is "done" until the next catalyst.

**Key insight:** EUR/USD keeps falling long after the initial reaction. Traders
who understand this can hold through the "boring" period — the flows are still
coming.

### 2.6 Why the 10-year specifically?

- **Duration sweet spot** — long enough to reflect policy expectations, short
  enough to be liquid; the benchmark for institutional fixed income.
- **Real-money benchmark** — pensions and insurers benchmark to 10Y; their
  rebalancing moves 10Y-duration assets; this is where the big flows are.
- **Global comparability** — every major country has a liquid 10Y; the German
  Bund is the European risk-free rate.
- **Refinement:** the **2Y spread** is more sensitive to near-term policy and
  often leads the 10Y. Advanced practitioners watch both:
  **2Y for direction, 10Y for magnitude.**

### 2.7 When the relationship breaks down (limitations)

| Breakdown | What happens |
|---|---|
| **Risk-off events** (Lehman, COVID) | USD rallies as safe haven regardless of yields; the spread can narrow (Treasuries rally) while USD still strengthens. Liquidity preference dominates yield preference; the relationship resumes once panic subsides. |
| **Central bank intervention** (e.g. Japan's JPY interventions 2022–24) | Policy flows overwhelm fundamental flows; the relationship temporarily breaks. |
| **Extreme positioning** | If everyone is already short EUR, further spread widening may not push EUR lower — no one left to sell. The positioning overhang absorbs the signal. **Monitor CFTC data.** |
| **Geopolitical shocks** (e.g. Ukraine invasion) | FX moves for non-yield reasons (energy security, trade, growth); the FX move may *lead* the spread — **causality temporarily reverses.** |

> **Critical rule:** never treat the spread–FX relationship as mechanical. It's a
> **tendency, not a law**. When correlation breaks down, ask why — the answer
> often reveals important information about market regime and sentiment.

### 2.8 What moves the spread itself (upstream drivers)

- **Monetary policy** — Fed vs ECB rate paths; divergence = widening; the primary
  medium-term driver.
- **Growth differential** — stronger US growth pushes US yields higher; watch
  relative PMIs.
- **Inflation gap** — higher US breakevens vs Europe widen nominal spreads;
  inflation surprise = spread move.
- **Safe-haven flows** — risk-off → Bund outperformance (European safe haven) →
  spread narrows temporarily.
- **Supply dynamics** — heavy Treasury issuance vs Bund scarcity affects relative
  pricing; fiscal policy matters.
- **Hedging costs** — wide differentials make FX hedging expensive, reducing
  cross-border demand for higher-yielding bonds (a dampening feedback).

### 2.9 Bottom line + key takeaways (as given)

The yield spread is the fundamental anchor for EUR/USD — it tells you where
capital wants to go, and because institutional flows take time, it provides early
warning of currency moves. Use it to validate trades, time entries, and identify
regime changes. Not right 100% of the time, but over the medium term it's the
closest thing to a fundamental "compass" for the world's most traded pair.

- The spread leads EUR/USD because institutional flows take weeks–months; the
  yield move happens first, the FX adjustment follows.
- Five transmission channels: carry (days), fund flows (weeks), pensions
  (months), reserve managers (quarters), corporates (variable).
- **Spread momentum matters as much as level.**
- Use the spread to validate FX moves: no confirmation = often noise;
  confirmation = the move has legs.
- Watch for breakdowns: risk-off, intervention, extreme positioning.
- As of 02 Sep 2025: 149 bps (21st percentile) — relatively narrow, suggesting
  limited EUR downside unless the spread widens again.

---

## Lesson 3 — Live Case Study: The Spread Moved First (17–18 Feb 2026)

A real-time example of the yield spread leading EUR/USD by ~24 hours.

### 3.1 The setup — two days, one signal

- **Tuesday 17 Feb:** the DE–US yield spread declines early and falls steadily all
  session — the US yield advantage widening, a fundamentally bearish input for
  EUR/USD. **But EUR/USD didn't reprice**: it ranged and mean-reverted; spot
  traders saw noise. The rates market was already telling a different story.
- **Tuesday night:** spread continues lower overnight; EUR/USD still hasn't
  responded; the lead extends to ~12–18 hours.
- **Wednesday 18 Feb:** EUR/USD capitulates — hard selloff throughout the day,
  accelerating into the close. The spread keeps falling, confirming Tuesday's move
  was structural, not noise. What was a *leading* indicator Tuesday became a
  *confirming* indicator Wednesday.

### 3.2 Side-by-side state table

| Timeframe | Yield spread | EUR/USD | Signal |
|---|---|---|---|
| Tue morning | ↘ declining | — flat/choppy | Divergence forming |
| Tue afternoon | ↘ still falling | ↗ mean-reverting | Divergence widening |
| Tue close | ↘ lower | — recovered | **Max divergence** |
| Wed morning | ↘ continued | ↘ starting to fall | Convergence begins |
| Wed afternoon | ↘ accelerating | ↘ hard selloff | Full alignment |

**Lead time: ~24 hours** — a full trading session to position before the currency
caught up to what rates were already pricing.

### 3.3 The lesson (as stated)

Watching EUR/USD alone on Tuesday showed nothing actionable — rangebound, no
momentum, no trend. Watching the spread showed a clear directional move not yet
priced into spot. **That gap between what rates are saying and what FX is doing —
that's the edge.** When the spread moves and spot doesn't follow, the question
isn't "if" — it's "when."

⚠️ *The warning was there:* the divergence itself is the signal.
✓ *Spread confirmed:* once both aligned, the lag had closed.

### 3.4 Application rules — how to use this

1. **Watch for divergence.** When the spread moves but EUR/USD doesn't respond,
   pay attention. The bigger the divergence, the more likely a snapback.
2. **Don't fight the spread.** Long EUR/USD into a falling spread = fighting
   institutional capital flows. You might be right on short-term price action,
   but the fundamental current is against you.
3. **Use it for confirmation.** Before entering a EUR/USD position, check the
   spread. Aligned = fundamental backing. Diverging = proceed with caution.
4. **Estimate your lead time.** Normal conditions: hours to a couple of days
   (here ~24h). The more orderly the move, the cleaner the lead. In
   high-volatility regimes — risk-off, CB surprises, geopolitical shocks — the
   lag compresses toward coincident or can temporarily invert.

### 3.5 Next steps — quantitative lag modelling (the lesson's roadmap)

The case study demonstrates the lead-lag qualitatively; the next stage is to
model it quantitatively — from observation to systematic measurement.

1. **Rolling lag correlation.** Compute the optimal lag between spread changes
   and EUR/USD changes over a rolling window (e.g. 60-day). **The lag isn't
   static** — it expands in quiet markets and compresses in volatile ones.
   Tracking the rolling optimal lag tells you how much lead time to expect now.
2. **Granger causality testing.** Formally test whether spread changes improve
   EUR/USD forecasts beyond EUR/USD's own history. Run on rolling windows to
   detect regime shifts. **Causality can reverse** — in risk-off episodes or when
   FX drives the narrative, EUR/USD may lead the spread. Detecting reversals is
   critical.
3. **Dynamic lag models.** State-space or regime-switching frameworks that let
   the lag structure vary with volatility, liquidity, and macro regime. A static
   lag assumption will underperform.
4. **Regime conditioning is mandatory.** Carry-dominant regimes: cleaner, longer
   lead. Risk-off: instruments move together or FX leads. Policy-divergence
   regimes: relationship strengthens. Liquidity crises: it can break entirely.
   Any quantitative model needs regime conditioning to avoid false signals.

**Closing line:** "Rates moved Tuesday. FX followed Wednesday. The spread gave
you a full session to position before the currency caught up. That's not luck —
that's the lead-lag working exactly as it should."

---

## Key facts — quick revision sheet

- Term spread = 10Y − 2Y; inversion leads recession by 12–24 months.
- Four regimes = growth trajectory × inflation trajectory; **rate of change, not
  levels**; threshold at zero (or percentiles).
- Best asset per regime: goldilocks→equities (+15.2%), reflation→commodities
  (+18.7%), stagflation→gold (+21.4%), deflation→duration (+11.4%) and USD (+7.1%).
- Fastest regime transition: stagflation→deflation (1–3 months, credit-led).
- Four entry-model families: mean reversion, momentum/trend, stat arb, lead-lag.
  Stat arb needs cointegration, not correlation. Lead-lag needs Granger causality,
  OOS stability, economic rationale.
- WFE = OOS/IS; target > 0.5; < 0.3 = severe overfitting.
- US–DE 10Y spread (Sep 2025): 149 bps, 21st percentile; 5Y range 101–227,
  mean 169.
- Five FX transmission channels, fast→slow: carry (hours–days), fund reallocation
  (weeks), pensions/insurance (2–6 months), reserve managers (quarters),
  corporate treasury (variable). ~60% of global reserves are USD.
- Lead time compresses as volatility rises: hours–2 days (news-driven) up to
  1–3 months (regime change).
- 2Y for direction, 10Y for magnitude.
- Four breakdown modes: risk-off (safe-haven USD), CB intervention, extreme
  positioning (watch CFTC), geopolitical shocks (causality can reverse).
- Feb 2026 case study: spread led EUR/USD by ~24 hours; max divergence at Tuesday
  close; Wednesday selloff closed the gap.
- The relationship is a tendency, not a law.

---

## Future research ideas (to investigate off these notes)

From the lessons' own next-steps plus questions the material raises:

1. **Rolling lag correlation study** — optimal lag between Δspread and ΔEUR/USD
   on a rolling 60-day window; how does the lag vary with volatility regime?
   (Lesson 3's explicit next step.)
2. **Granger causality on rolling windows** — does the spread improve EUR/USD
   forecasts beyond price history alone? Map the periods where causality
   reverses (FX leading rates) and what regimes they coincide with.
3. **Dynamic / regime-switching lag models** — state-space frameworks where lag
   structure depends on volatility, liquidity, macro regime.
4. **2Y vs 10Y spread comparison** — test "2Y for direction, 10Y for magnitude";
   does the 2Y spread lead the 10Y spread?
5. **Build the growth/inflation regime classifier** — FRED data, composite
   ISM/claims growth score + CPI/PCE/breakevens inflation score, momentum-based;
   reproduce the historical regime labels and asset-performance table.
6. **Regime-conditioned strategy behaviour** — do existing strategies (fade vs
   follow, trend) perform differently across the four macro regimes?
7. **Transition detectors** — can the early-warning combinations in §1.5 (e.g.
   PMIs rolling over + sticky inflation + flattening curve) be scored
   systematically? Special attention to the fast stagflation→deflation case.
8. **Divergence/non-confirmation signals** — quantify "EUR/USD moved without
   spread confirmation → mean reversion" and the months-scale non-confirmation
   trend-exhaustion warning.
9. **Positioning overlay** — CFTC EUR net speculative positioning as the
   "extreme positioning" breakdown filter on spread signals.
10. **Other lead-lag pairs from Lesson 1** — copper→equities, credit→equity,
    futures→cash: same measurement toolkit (cross-correlation, Granger).
11. **Apply the validation gauntlet** — any of the above that shows promise goes
    through walk-forward, WFE, Monte Carlo, sensitivity, paper trading, in that
    order, per the Lesson 1 checklist.

## Areas of interest (to read deeper on)

- Walk-forward efficiency as a single overfitting statistic — where does the
  0.5/0.3 threshold come from?
- The hedging-cost feedback (§2.8): wide differentials make FX-hedged foreign
  bonds unattractive, throttling the very flow that drives the lead — a
  self-limiting dynamic.
- Causality *reversal* as a regime indicator in its own right (risk-off
  detection via FX leading rates).
- Cointegration vs correlation — the formal tests (Engle-Granger, Johansen) that
  stat arb requires.
- How reserve managers actually reallocate (the quarters-long channel) — COFER
  data on USD reserve share.
- Bund scarcity and supply dynamics as a spread driver — European fiscal rules
  vs Treasury issuance.
- Upcoming module topics to leave space for: **business-sentiment signals** and
  **reading the options complex**.

## Real-time implementation notes (using the lessons live)

- **Daily routine:** know the current regime quadrant (monthly data), the current
  spread level/percentile and its recent momentum (daily), and current volatility
  conditions (to estimate expected lead time from the §2.4 table).
- **Before any EUR/USD entry:** check the spread. Direction aligned → fundamental
  backing. Diverging → caution, or treat as a §2.4-point-3 mean-reversion setup.
- **Divergence watchlist:** spread moving while spot ranges = the Lesson 3 setup;
  the bigger and longer the divergence, the closer the snapback.
- **Regime overrides:** in risk-off conditions, suspend the normal spread logic —
  safe-haven flows dominate and causality may invert. Check positioning extremes
  (CFTC) before assuming spread moves will transmit.
- **Data sources named in the lessons:** FRED (`fredapi`) for growth/inflation
  indicators; CFTC for positioning; the 10Y yields for US and Germany for the
  spread.
- **Sign convention care:** Lesson 2 quotes US−DE (149 bps positive; widening =
  USD-supportive); Lesson 3's charts quote DE−US (falling = same thing). Fix one
  convention when building anything.

## Self-test questions (closed-book revision)

1. Name the six macro driver families and the representative series for each.
2. Draw the growth–inflation quadrant with overweights and underweights per
   regime. Which regime is best for USD? For gold? For duration?
3. Why does the framework use rate of change rather than levels?
4. What are the five yield-curve shapes and their asset implications? What lead
   time does inversion give before recession?
5. Which regime transition is fastest, what are its early warnings, and what's
   the prescribed positioning shift?
6. Write the growth-score and inflation-score constructions (weights and
   momentum windows).
7. List the four entry-model families, one signal construction for each, and the
   conditions each works best in.
8. What three validations does a lead-lag relationship require before use?
9. Define walk-forward efficiency, the target, and the overfitting threshold.
   List the six stages of the validation pipeline in order.
10. State the five spread→FX transmission channels in speed order with actors
    and timescales.
11. Why the 10Y tenor specifically (three reasons)? What is the 2Y refinement?
12. Give the four conditions under which the spread–FX relationship breaks down
    and what dominates in each.
13. What are the six upstream drivers of the spread itself?
14. In the Feb 2026 case study: what did each instrument do on Tuesday, when was
    maximum divergence, and what was the total lead time?
15. What are the four application rules from Lesson 3?
16. What are the four items in the quantitative lag-modelling roadmap, and why
    does a static lag assumption underperform?
17. Numbers check: spread level/percentile/range/mean as of Sep 2025; USD reserve
    share; typical lead times by market condition.

---

*Lesson notes from Colez Trades "Macro Deep Dives" module (educational content,
not financial advice). Next lessons — business-sentiment signals and the options
complex — to be appended here or as sibling files in `education/`.*
