# P1 — Macro Regime Equity Strategy
## NQ (Nasdaq-100) + SPX (S&P 500)

**Type:** Portfolio-level, weekly signal
**Status:** Claude Code building backtest now
**Back to index:** [STRATEGY_INDEX.md](STRATEGY_INDEX.md)

---

## Hypothesis

When Fed net liquidity is rising, the yield curve is not deeply inverted, credit spreads are
tightening, and real yields are falling — equities trend higher. When these conditions reverse,
equities face structural headwinds. A rules-based model exploiting this relationship should
outperform buy-and-hold with significantly lower drawdown.

**Why it should persist:** This exploits the capital flow hierarchy — bonds lead, FX confirms,
equities follow. Most retail traders watch price only. This model watches the causes.

---

## Signal Construction

### FRED Data Required
| Series | FRED Code | Signal Role |
|--------|-----------|------------|
| Fed Balance Sheet | WALCL | Liquidity source |
| Treasury General Account | WTREGEN | Liquidity drain |
| Reverse Repo | RRPONTSYD | Liquidity drain |
| 10Y-2Y Yield Spread | T10Y2Y | Recession signal |
| HY Credit Spreads | BAMLH0A0HYM2 | Risk appetite |
| ISM Manufacturing | NAPM | Growth regime |
| 10Y TIPS Real Yield | DFII10 | Rate pressure on growth |
| 5Y Breakeven Inflation | T5YIE | Inflation regime |

### Signal Formulas
```
Net Liquidity       = WALCL - WTREGEN - RRPONTSYD
Net Liq Z-score     = rolling z-score (252-day window)

Yield Curve Z       = rolling z-score of T10Y2Y (252-day)

Credit Z            = rolling z-score of HY spread change (252-day)
                      INVERTED — rising spreads = bearish

Real Yield Z        = rolling z-score of DFII10 (252-day)
                      INVERTED — rising real yields = bearish NQ

ISM Z               = rolling z-score of NAPM (252-day)

Composite Score     = (Net Liq Z x 0.30)
                    + (Curve Z x 0.20)
                    + (-Credit Z x 0.20)
                    + (-Real Yield Z x 0.15)
                    + (ISM Z x 0.15)
```

### Vol Regime Filter (GARCH-lite)
```
VIX Z-score = (VIX - VIX.rolling(60).mean()) / VIX.rolling(60).std()

LOW vol    (vix_z < -0.5)  -> Size scalar 1.0x
NORMAL vol (-0.5 to 1.0)   -> Size scalar 0.75x
HIGH vol   (vix_z > 1.0)   -> Size scalar 0.25x
```

---

## Trade Rules

**Rebalance:** Weekly — check signal Friday close, act Monday open

| Condition | Action |
|-----------|--------|
| Composite > +0.5 AND VIX Z < 1.5 | LONG QQQ/SPY at Monday open |
| Composite < -0.5 | FLAT — exit any position |
| Between -0.5 and +0.5 | FLAT — wait |

**Position size:** 100% base allocation x vol scalar x 2% account risk cap per trade

---

## Performance Targets (Pre-Deployment Thresholds)

| Metric | Minimum | Target |
|--------|---------|--------|
| In-Sample Sharpe | > 1.0 | > 1.5 |
| OOS Sharpe | > 0.5 | > 1.0 |
| Walk-Forward Efficiency | > 0.5 | > 0.7 |
| Max Drawdown | < -20% | < -15% |
| Beats Buy & Hold Sharpe | Yes | Significantly |

---

## Estimated Live Performance ($100k)

| Metric | Estimate |
|--------|---------|
| Trades per year | 8-15 |
| Average hold | 3-8 weeks |
| Win rate | 55-62% |
| Target CAGR | 12-18% |
| Max drawdown | -12 to -18% |
| Annual P&L | $12,000-$18,000 |

---

## Instruments

Primary: **QQQ** (NQ proxy, most rate-sensitive, strongest signal)
Secondary: **SPY** (SPX proxy, confirmation and diversification)

Run on both simultaneously. If model only works on one instrument, it is likely overfit.

---

## Claude Code Brief

```
[PASTE THIS INTO CLAUDE CODE]

Build a complete Python backtesting and walk-forward validation system for a
macro-regime-conditional equity strategy targeting NQ (Nasdaq-100) and SPX/ES (S&P 500).

OBJECTIVE
Fetch free data, build signals grounded in macro economics, backtest from 2005 to present,
then run a proper walk-forward to simulate real-time operation. Output a full performance
report with all key metrics.

DATA SOURCES (all free)
Use yfinance and fredapi. Install both if not present.

FRED series:
- WALCL (Fed Balance Sheet)
- WTREGEN (Treasury General Account)
- RRPONTSYD (Reverse Repo)
- T10Y2Y (10Y-2Y yield spread)
- BAMLH0A0HYM2 (HY credit spreads OAS)
- NAPM (ISM Manufacturing PMI)
- DFII10 (10Y TIPS real yield)
- T5YIE (5Y breakeven inflation)

yfinance tickers: QQQ, SPY, TLT, GLD, ^VIX
Fetch history from 2005-01-01 to today.
Forward-fill FRED series to daily frequency. Align on common daily date index.

SIGNAL CONSTRUCTION

Signal 1 Net Liquidity:
net_liquidity = WALCL - WTREGEN - RRPONTSYD
net_liq_change = net_liquidity.pct_change(21)
net_liq_z = rolling z-score 252-day window

Signal 2 Yield Curve:
curve = T10Y2Y
curve_z = rolling z-score 252-day window

Signal 3 Credit Spreads:
credit_change = BAMLH0A0HYM2.diff(21)
credit_z = rolling z-score 252-day window
Use -credit_z (invert: rising spreads = bearish)

Signal 4 Real Yield Pressure:
real_yield_z = rolling z-score of DFII10 252-day window
Use -real_yield_z (rising real yields = bearish NQ)

Signal 5 ISM Momentum:
ism_z = rolling z-score of NAPM 252-day window

Composite Macro Score:
macro_score = (net_liq_z * 0.30) + (curve_z * 0.20) + (-credit_z * 0.20)
            + (-real_yield_z * 0.15) + (ism_z * 0.15)

Volatility Regime:
vix_z = (VIX - VIX.rolling(60).mean()) / VIX.rolling(60).std()
LOW vol: vix_z < -0.5  -> scalar 1.0x
NORMAL:  vix_z -0.5 to 1.0 -> scalar 0.75x
HIGH:    vix_z > 1.0 -> scalar 0.25x

SIGNAL TO TRADE RULE
Weekly rebalance (Friday close signal, Monday open execution).
macro_score > 0.5 AND vix_z < 1.5 -> LONG
macro_score < -0.5 -> FLAT
Between -0.5 and 0.5 -> FLAT
Position = 100% base x vol_scalar. Long/flat only for this test.

TRANSACTION COSTS
Commission: 0.10% per trade. Slippage: 0.05% per trade.

BACKTESTING ENGINE
Vectorised backtest. All z-scores rolling (no lookahead).
Apply 5-day publication lag to all FRED signals (data.shift(1) weekly, data.shift(5) monthly).
Calculate returns Monday open to Friday close.

OUTPUT METRICS
CAGR, Sharpe, Sortino, Max Drawdown, Drawdown Duration, Win Rate, Profit Factor,
Total Trades, Time in Market, Calmar Ratio.
Run Buy & Hold QQQ benchmark side by side.

WALK-FORWARD ANALYSIS
train_window = 504 trading days (2 years)
test_window = 63 trading days (3 months)
step = 21 trading days (1 month)
Fit z-score parameters on TRAINING data only. Apply to TEST data.
Report WFE = OOS Sharpe / IS Sharpe (target > 0.5).

INSTRUMENTS
Run on QQQ and SPY separately. Report both.

OUTPUT
1. Full metrics table strategy vs buy-and-hold for QQQ and SPY
2. Four charts: equity curve, drawdown, macro score with shaded in/out periods,
   OOS walk-forward equity curve
3. Walk-forward window table
4. Regime breakdown table (net liq positive/negative, VIX HIGH/NORMAL/LOW, curve inverted/normal)
5. Save charts as PNG

CRITICAL RULES
Never use future data. All z-scores rolling windows only.
FRED publication lag: 5 days for monthly series.
Weekly rebalance only.
Single file: macro_equity_backtest.py
Dependencies: pandas, numpy, matplotlib, yfinance, fredapi
FRED API key: accept as command-line arg or prompt at runtime.
```

---

## Risk Notes

- Post-2009 QE era created unusually persistent net liquidity tailwind — may not repeat
- Model will underperform in fast-moving regimes where FRED data lags reality
- Real yields and growth signals can diverge (stagflation is hardest regime for this model)
- Validate on 2022 bear market specifically — that is the hardest test case
