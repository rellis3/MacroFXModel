# P2-P7 — Portfolio Strategy Briefs
## Credit-Equity, Regime Rotation, FX Carry, FX Momentum, Gold, JPY Circuit Breaker

**Back to index:** [STRATEGY_INDEX.md](STRATEGY_INDEX.md)

---

# P2 — Credit-Equity Divergence

**Type:** Portfolio-level, weekly signal
**Est. trades/year:** 6-10 | **Target CAGR:** 10-15% | **Annual P&L $100k:** $10k-$15k

## Hypothesis

Credit investors are more informed about corporate health than equity investors. When HY
credit spreads widen but equities have not yet fallen, credit is almost always right. This
model exploits the lead-lag relationship — typically 2-4 weeks — between credit stress and
equity repricing.

Confirmed by: 2022 bear market (credit led by 6-8 weeks), Q4 2018 selloff, March 2023
banking crisis (regional bank CDS moved before equity prices).

## Signal Construction

```
Credit Z     = rolling z-score of HY OAS (BAMLH0A0HYM2), 252-day window
Equity Z     = rolling z-score of SPY 20-day return, 252-day window

Divergence   = Credit Z - Equity Z
               Positive = credit bearish, equity complacent -> short signal
               Negative = credit bullish, equity lagging   -> long signal

Entry threshold:  |Divergence| > 1.5 sigma
Exit threshold:   |Divergence| < 0.5 sigma (reversion complete)
```

## Trade Rules

| Condition | Action |
|-----------|--------|
| Divergence > +1.5 (credit bearish, equity not) | SHORT equity — reduce/exit longs |
| Divergence < -1.5 (credit bullish, equity lagging) | LONG equity — add exposure |
| Divergence between -1.5 and +1.5 | HOLD current position |
| VIX Z > 1.5 (HIGH vol) | Reduce all positions 50% |

## Claude Code Brief

```
Build a Python backtest for a credit-equity divergence strategy on QQQ/SPY.

DATA (FRED + yfinance, 2005 to present):
- BAMLH0A0HYM2: HY OAS credit spreads (FRED)
- QQQ, SPY: equity prices (yfinance)
- ^VIX: volatility filter (yfinance)

SIGNAL:
credit_z = rolling z-score(HY OAS, 252-day)
equity_z = rolling z-score(SPY 20-day return, 252-day)
divergence = credit_z - equity_z

RULES (weekly rebalance, Friday signal Monday execution):
divergence > +1.5 -> SHORT (or flat if no shorting) SPY/QQQ
divergence < -1.5 -> LONG SPY/QQQ
between -> hold
VIX Z > 1.5 -> halve position size

Apply 5-day lag to FRED data. Use rolling z-scores only (no lookahead).
Transaction costs: 0.15% round trip.

OUTPUT: Same metrics and walk-forward structure as macro equity backtest.
Specifically test: does the model exit before major drawdowns? Show credit vs equity
divergence chart with trade entry/exit markers.

Single file: credit_equity_backtest.py
Dependencies: pandas, numpy, matplotlib, yfinance, fredapi
```

---

# P3 — Yield Curve Regime Rotation

**Type:** Portfolio-level, monthly rebalance
**Est. rebalances/year:** 4-8 | **Target CAGR:** 10-14% | **Annual P&L $100k:** $10k-$14k

## Hypothesis

The four macro regimes (Goldilocks, Reflation, Stagflation, Deflation) each have a
historically stable asset class performance ranking. A rules-based system that identifies
regime and allocates accordingly should reduce drawdown significantly vs buy-and-hold
equity — particularly in Stagflation (2022) where this model would have been in Gold
and cash while SPY fell 20%.

## Regime Detection Logic

```python
if ISM > 50 and Core_CPI_YoY < 3:
    regime = "GOLDILOCKS"
elif ISM > 50 and Core_CPI_YoY >= 3:
    regime = "REFLATION"
elif ISM <= 50 and Core_CPI_YoY >= 3:
    regime = "STAGFLATION"
else:
    regime = "DEFLATION"
```

## Allocation Per Regime

| Regime | SPY | TLT (Bonds) | GLD (Gold) | DBC (Commodities) | Cash |
|--------|-----|-------------|------------|-------------------|------|
| Goldilocks | 60% | 20% | 0% | 10% | 10% |
| Reflation | 30% | 0% | 20% | 40% | 10% |
| Stagflation | 0% | 10% | 40% | 20% | 30% |
| Deflation | 0% | 60% | 20% | 0% | 20% |

## Historical Regime Performance Reference

| Asset | Goldilocks | Reflation | Stagflation | Deflation |
|-------|-----------|-----------|-------------|-----------|
| Equities | +15% | +8% | -4% | -12% |
| Bonds 10Y | +4% | -2% | -2% | +11% |
| Commodities | +1% | +19% | +12% | -16% |
| Gold | -2% | +9% | +21% | +6% |

## Claude Code Brief

```
Build a Python backtest for a macro regime rotation portfolio.

DATA (FRED + yfinance, 2000 to present):
- NAPM: ISM Manufacturing (FRED)
- CPILFESL: Core CPI (FRED)
- SPY, TLT, GLD, DBC: asset ETFs (yfinance)

REGIME DETECTION (monthly, using 3-month rolling average of ISM and CPI YoY):
Goldilocks:  ISM_ma > 50 AND CPI_yoy < 3
Reflation:   ISM_ma > 50 AND CPI_yoy >= 3
Stagflation: ISM_ma <= 50 AND CPI_yoy >= 3
Deflation:   ISM_ma <= 50 AND CPI_yoy < 3

ALLOCATION per regime as table above.
Monthly rebalance. Transaction costs 0.10% per rebalance.
Add 30-day lag to all FRED signals (monthly publication lag).

BACKTESTING:
Vectorised monthly returns. Track equity curve per allocation.
Walk-forward: 5 year train, 1 year test, 6 month step.

KEY OUTPUTS:
- Regime timeline chart (colour-coded by regime 2000-present)
- Performance per regime period
- Comparison vs SPY buy-and-hold and 60/40 portfolio
- Specifically highlight 2022 performance (hardest test)

Single file: regime_rotation_backtest.py
```

---

# P4 — FX Carry Strategy (Regime-Filtered)

**Type:** Portfolio-level, weekly signal
**Est. position changes/year:** 20-30 | **Target CAGR:** 8-12% | **Annual P&L $100k:** $8k-$12k

## Hypothesis

Interest rate differentials drive capital flows. Long high-yield currencies, short
low-yield currencies earns the carry premium roughly 70-80% of months. The critical
addition is a volatility regime filter — carry unwinds are violent and kill unfiltered
strategies. Exiting before VIX spikes is the entire edge.

## Pairs Universe (From Existing Dashboard)

**Best carry longs (high yielders):** AUD/JPY, NZD/JPY, GBP/JPY
**Best carry shorts (fund with low yielders):** Implicitly JPY and CHF funded
**Regime-dependent:** USD/CAD, EUR/USD based on current rate differential

## Signal Construction

```
Rate Differential = Foreign 2Y Yield - JPY 2Y Yield (for JPY-funded pairs)
Carry Score       = Rate differential z-score, 252-day rolling
Position          = Long top 3 carry score pairs, size by inverse volatility

EXIT TRIGGER (mandatory — this is the strategy):
VIX Z-score > 1.0  -> EXIT ALL CARRY POSITIONS IMMEDIATELY
JPY strengthening > 1.5% in 3 days -> EXIT ALL CARRY POSITIONS
Re-enter only when VIX Z < 0.5 for 5 consecutive days
```

## Warning

Unfiltered carry has blown retail accounts. The 2008 carry unwind saw AUD/JPY fall 50%
in 6 months. The 2024 BOJ rate hike unwind saw JPY pairs fall 10% in 3 days. This model
is only viable with the vol regime filter. Size conservatively: max 20% of capital per
carry position, max 3 positions simultaneously.

## Claude Code Brief

```
Build a Python backtest for a regime-filtered FX carry strategy.

DATA (yfinance + FRED, 2005 to present):
FX pairs as yfinance tickers: AUDJPY=X, NZDJPY=X, GBPJPY=X, USDJPY=X,
AUDUSD=X, NZDUSD=X, GBPUSD=X, EURUSD=X, USDCAD=X, USDCHF=X
^VIX for vol regime filter.

CARRY SCORE:
Use approximate carry proxy: 12-month return minus 1-month return per pair.
(Proper forward rates unavailable on free tier — this approximates the carry premium.)
Rank all pairs weekly by carry score.

POSITION RULES:
Long top 3 carry-score pairs, each sized at 20% of capital.
Weight by inverse 30-day volatility within that 20% allocation.
Short bottom 3 pairs if desired (start with long-only version first).

EXIT TRIGGER (CRITICAL):
vix_z = (VIX - VIX.rolling(60).mean()) / VIX.rolling(60).std()
If vix_z > 1.0 on any day -> exit ALL positions at next open
Re-enter when vix_z < 0.5 for 5 consecutive trading days

TRANSACTION COSTS: 0.02% per trade (FX spread approximation).

WALK-FORWARD: 2yr train / 6mo test / 3mo step.

KEY OUTPUTS:
- Equity curve with carry-on vs carry-off periods shaded
- VIX exit trigger events marked
- Carry-on win rate vs carry-off periods
- Comparison of filtered vs unfiltered strategy (show how much the filter matters)

Single file: fx_carry_backtest.py
```

---

# P5 — FX Cross-Sectional Momentum

**Type:** Portfolio-level, weekly/monthly rebalance
**Est. rebalances/year:** 12-18 | **Target CAGR:** 8-13% | **Annual P&L $100k:** $8k-$13k

## Hypothesis

Currencies strengthening for 3-12 months tend to continue strengthening. Policy
divergence takes months to fully price in — central bank hiking cycles, for example,
play out over 12-24 months. Cross-sectional momentum exploits this persistence.

Simultaneously long best performers and short worst performers makes the strategy
approximately dollar-neutral, reducing exposure to pure USD trending periods.

## Signal Construction

```
12-1 Month Momentum = (Price today / Price 252 days ago) - 1
                      minus (Price today / Price 21 days ago) - 1
                      (skip last month to avoid short-term reversal)

Weekly ranking of all 9 FX pairs by momentum score.
LONG: top 3 pairs by momentum score
SHORT: bottom 3 pairs by momentum score (or flat for long-only version)
Weight: inverse 30-day volatility within each side
Rebalance: monthly (reduce transaction cost drag)
```

## Pairs Universe

EUR/USD, GBP/USD, USD/JPY, USD/CAD, USD/CHF, AUD/USD, NZD/USD, GBP/JPY, EUR/GBP

All already in the dashboard. Signal is generated on the full basket simultaneously.

## Claude Code Brief

```
Build a Python backtest for cross-sectional FX momentum.

DATA (yfinance, 2005 to present):
EURUSD=X, GBPUSD=X, USDJPY=X, USDCAD=X, USDCHF=X, AUDUSD=X, NZDUSD=X,
GBPJPY=X, EURGBP=X

SIGNAL:
For each pair, calculate 12-1 month momentum:
mom = (price / price.shift(252)) - (price / price.shift(21))
Note: For USD-quote pairs (USDJPY, USDCAD, USDCHF), invert so signal
represents USD strengthening consistently.

Monthly rebalance (first trading day of month).
Long top 3 momentum pairs, short bottom 3.
Weight by inverse 30-day vol within each side.

Macro regime filter (optional, test both with and without):
Only take long positions when P1 macro score > 0 (requires FRED data).

TRANSACTION COSTS: 0.02% per trade.

WALK-FORWARD: 3yr train / 6mo test / 3mo step.

KEY OUTPUTS:
- Momentum signal heatmap over time (which pairs were top/bottom)
- Performance with vs without macro regime filter
- Individual pair contribution to total return
- Comparison vs equal-weight long FX basket

Single file: fx_momentum_backtest.py
```

---

# P6 — Gold Macro Divergence

**Type:** Portfolio-level, weekly signal
**Est. trades/year:** 4-8 | **Target CAGR:** 7-11% | **Annual P&L $100k:** $7k-$11k

## Hypothesis

Gold's fair value is anchored by real yields (TIPS) and DXY. When gold trades
significantly above or below this fundamental anchor, it reverts. This gives a
quantifiable fundamental basis for Gold trades that pure price traders lack.

## Signal Construction

```
Model: Gold_price ~ beta_0 + beta_1 * TIPS_real_yield + beta_2 * DXY_index

Rolling 252-day OLS regression.
Residual = actual Gold price - model predicted price
Residual Z-score = (residual - residual.rolling(60).mean()) / residual.rolling(60).std()

LONG Gold:  Z-score < -1.5 (Gold cheap vs fundamentals) + macro regime not Goldilocks
SHORT Gold: Z-score > +1.5 (Gold expensive vs fundamentals) + macro regime not Stagflation
EXIT:       Z-score returns to -0.5 to +0.5 range
```

## Data Already Available

Your dashboard already pulls: DFII10 (TIPS real yield), DTWEXBGS (DXY), Gold prices.
This is a 5-line regression on data you already have.

## Claude Code Brief

```
Build a Python backtest for Gold fundamental divergence trading.

DATA (FRED + yfinance, 2005 to present):
- DFII10: 10Y TIPS real yield (FRED)
- DTWEXBGS: DXY broad dollar index (FRED)
- GLD: Gold ETF price (yfinance) as proxy for XAU/USD

SIGNAL:
Rolling 252-day OLS regression: log(GLD) ~ DFII10 + DTWEXBGS
Calculate residual from rolling regression (expanding window or rolling).
Z-score of residual over 60-day window.

RULES (weekly check):
Z < -1.5 -> LONG GLD (Gold cheap vs fundamentals)
Z > +1.5 -> SHORT GLD (or exit long if long-only)
|Z| < 0.5 -> EXIT position
Macro regime filter: avoid longs in Goldilocks, avoid shorts in Stagflation

TRANSACTION COSTS: 0.10% per trade.

WALK-FORWARD: 3yr train / 6mo test / 3mo step.

KEY OUTPUTS:
- Chart: actual GLD vs model-predicted GLD
- Residual Z-score over time with entry/exit markers
- Performance split by macro regime
- Correlation to P1 equity strategy (want low correlation = diversification benefit)

Single file: gold_divergence_backtest.py
```

---

# P7 — JPY Carry Unwind Circuit Breaker

**Type:** Portfolio-level risk gate (always running, no P&L target)
**Purpose:** Protect ALL other positions during global risk-off events

## Hypothesis

USD/JPY and JPY crosses are the global risk-off barometer. When JPY strengthens sharply
— particularly if JGB yields are rising simultaneously — it signals a carry unwind that
hits equities, EM, and commodity currencies simultaneously within hours to days.

The August 2024 BOJ rate hike triggered a 10% AUD/JPY move in 3 days and a 6% NQ drop
simultaneously. A circuit breaker monitoring JPY acceleration would have triggered before
the worst of that move.

## Signal Construction

```
JPY Acceleration = rate of change of JPY strength (3-day z-score of USDJPY daily change)
JGB Signal       = JGB 10Y yield vs 60-day rolling average
BOJ Surprise     = deviation from market-implied BOJ rate path

CIRCUIT BREAKER FIRES when ANY two of:
- USD/JPY falls > 1.5% in 3 trading days (JPY strengthening sharply)
- VIX Z-score > 1.5
- HY spread z-score rises > 1.5 in 5 days

WHEN CIRCUIT BREAKER FIRES:
- Exit all FX carry positions (P4) immediately
- Reduce equity positions (P1, P3) by 50%
- Reduce FX momentum longs (P5) by 50%
- Gold longs (P6) are EXEMPT — they are a safe haven

RESET CONDITIONS (all must be true for 5 consecutive days):
- USD/JPY stabilised (< 0.3% daily move)
- VIX Z < 0.8
- HY spread change < 0.5 Z-score
```

## Implementation Note

This is not a standalone backtest — it is a portfolio-level overlay. Implement as a
module that each strategy checks before executing any trade. In the MT5 bot architecture,
this runs as a pre-trade gate: if circuit breaker is active, order is blocked.

## Claude Code Brief

```
Build a Python module for a JPY carry unwind circuit breaker.

This is not a standalone strategy — it is a portfolio-level risk gate.

DATA (yfinance + FRED, updated daily):
- USDJPY=X: JPY rate (yfinance)
- ^VIX: volatility (yfinance)
- BAMLH0A0HYM2: HY spreads (FRED)

CIRCUIT BREAKER SIGNAL:
jpy_3d_change = USDJPY.pct_change(3)  # negative = JPY strengthening
jpy_z = rolling z-score of jpy_3d_change, 60-day window
vix_z = (VIX - VIX.rolling(60).mean()) / VIX.rolling(60).std()
hy_z  = rolling z-score of HY spread 5-day change, 60-day window

breaker_score = sum of:
  +1 if jpy_z < -1.5 (JPY strengthening rapidly)
  +1 if vix_z > 1.5
  +1 if hy_z > 1.5

CIRCUIT BREAKER ACTIVE if breaker_score >= 2

OUTPUT: daily boolean series: circuit_breaker_active (True/False)
Also output: breaker_score timeseries, individual component signals

BACKTESTING USE:
Apply as multiplicative overlay to any strategy:
position_actual = position_raw * (0.0 if circuit_breaker_active else 1.0)
For carry strategy: full exit when active
For equity/momentum: 50% reduction when active

Show: how many times circuit breaker would have fired 2010-present.
Show: equity curve of P1 macro equity strategy with and without circuit breaker.

Single file: jpy_circuit_breaker.py
Output: DataFrame with date index and columns: [circuit_breaker, breaker_score,
        jpy_signal, vix_signal, hy_signal]
```
