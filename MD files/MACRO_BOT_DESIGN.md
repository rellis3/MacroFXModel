# Macro-Regime Equity Bot — Design Document

## What We Are Building

A **monthly-rebalanced, macro-conditional equity allocation system** that reads 5 fundamental economic factors every month, scores the current macro environment, and then decides how much capital to deploy into equity indices (or bonds as a hedge).

It is not a short-term trading bot. It is a slow, systematic, macro-driven portfolio manager — think of it as a rules-based fund that makes one decision per month per instrument, based on the economic environment rather than price patterns or signals.

---

## The Signal (What Drives Every Decision)

Every month-end the system computes a composite score from 5 US macro factors:

| Factor | Source | What It Measures | Direction |
|--------|--------|-----------------|-----------|
| Net Liquidity | FRED (WALCL − WTREGEN − RRPONTSYD) | Federal Reserve net money in the system | Bullish when rising |
| Yield Curve | FRED T10Y2Y | 10Y minus 2Y Treasury spread | Bullish when positive / widening |
| HY Credit Spread | FRED BAMLH0A0HYM2 | High-yield bond risk premium | Bullish when falling (tight spreads = risk-on) |
| Real Yield | FRED DFII10 | 10Y TIPS real yield | Bullish when low/negative (cheap money) |
| ISM / PMI | FRED NAPM → INDPRO fallback | Manufacturing activity | Bullish when expanding |

Each factor is **z-scored over a 252-day rolling window** so that they are all on the same scale regardless of their raw units. They are then combined with fixed weights (default: 40% Net Liq, 20% Curve, 20% Credit, 15% Real Yield, 5% ISM) into a single number.

A **21-day publication lag** is applied to weekly FRED series and a **5-day lag** to monthly series, preventing any lookahead bias.

---

## How the Score Becomes an Allocation

The composite score maps to a base allocation:

```
Score > +1.0  →  100% (strong bull macro)
Score > 0.0   →   75% (neutral-positive)
Score > −1.0  →   50% (neutral-negative)
Score ≤ −1.0  →   25% (bear macro)
```

Two filters then scale this base allocation down:

1. **Trend filter** (200-day MA + 12-month momentum of the instrument itself):
   - Both bullish → 1.0× (no change)
   - Either bullish → 0.8×
   - Neither → 0.55×

2. **VIX volatility sizer**:
   - VIX low (z < −0.5) → 1.0×
   - VIX normal → 0.85×
   - VIX high (z > 0.75) → 0.60×
   - VIX extreme (z > 1.5) → 0.30×

A **floor** prevents the allocation ever going to zero (default 50% for equity instruments, 15% for bond hedge). This means the system is always partially invested — it manages risk by reducing exposure, not by exiting entirely.

---

## Instruments and Accounts

### US System (Account A — USD)

| Symbol | OANDA Instrument | Purpose |
|--------|-----------------|---------|
| QQQ (Nasdaq-100) | NAS100_USD | High-beta US tech/growth |
| SPY (S&P 500) | SPX500_USD | Broad US equity |
| IWM (Russell 2000) | US2000_USD | US small-cap (more macro-sensitive) |
| TLT (30Y Bond) | USB30Y_USD | Inverted hedge — high alloc when macro is weak |

All four instruments run from the **same US macro signal**. The TLT uses an inverted version of the same score (negative macro environment = higher bond allocation). Capital is deployed independently to each instrument, so you can choose to run one, two, three, or all four.

**Why they are together:** They are all driven by the same Fed-dollar liquidity cycle. When the Fed is easing and liquidity is rising, all US equities benefit. When liquidity contracts, all US equities suffer. The correlation between these assets means a single macro signal explains most of the variance.

---

### EU System (Account B — EUR)

| Symbol | OANDA Instrument | Purpose |
|--------|-----------------|---------|
| DAX (Germany 40) | DE30_EUR | European large-cap blue chips |

**Why a separate account:**

1. **Different currency.** DAX is denominated in EUR. Trading it from a USD account introduces FX risk that would distort performance measurement. A EUR account keeps the P&L clean.

2. **Different market hours.** DAX trades 08:00–16:30 CET. The US system signal fires at US month-end close. The EU system's month-end signal fires at EU close — roughly 6 hours earlier. Keeping them separate prevents operational confusion about which signal applies when.

3. **Different macro drivers.** While DAX is correlated with US equities (global risk-on/risk-off), European equities also respond to the ECB balance sheet, Eurozone PMI, and EUR/USD dynamics. A dedicated EU account allows a dedicated EU signal to be applied cleanly.

4. **Regulatory / reporting clarity.** Separate accounts make it straightforward to report performance and calculate tax separately for US-dollar and euro-denominated assets in different jurisdictions.

---

## Why US vs EU Mode Differs

### US Mode (QQQ, SPY, IWM, TLT)
Uses **NAPM / INDPRO** (US ISM Manufacturing PMI proxy) as the manufacturing activity factor. This directly measures US industrial demand, which is highly correlated with US equity earnings.

### EU Mode (DAX)
Replaces the ISM factor with **MPMIEZMA156N** (S&P Global / Markit Eurozone Manufacturing PMI, via FRED). Why:

- The DAX is dominated by industrial and export-heavy companies (BASF, Siemens, Volkswagen, SAP). Eurozone manufacturing PMI is a far better leading indicator of their earnings than US ISM.
- Germany exports ~45% of GDP. When Eurozone PMI contracts, German blue chips suffer even if US ISM is fine.
- The remaining 4 factors (Net Liquidity, Yield Curve, Credit Spread, Real Yield) remain US-based intentionally. Dollar liquidity and global credit conditions still dominate global equity flows, including into European markets.

The result is a **4-US + 1-EU factor blend** for DAX, rather than 5-US factors.

---

## Walk-Forward Validation

The system is validated using a rolling walk-forward test:

- **Training window:** 504 trading days (~2 years) — the model learns z-score distributions here
- **Test window:** 252 trading days (~1 year) — the model is applied out-of-sample here
- **Step:** 63 trading days (~quarterly) — the window slides forward quarterly
- **Result:** ~80 overlapping windows across the 21-year dataset

Key metrics:
- **OOS Sharpe ≥ 0.5** — the signal has real out-of-sample edge (target)
- **Walk-Forward Efficiency (WFE) ≥ 0.5** — OOS Sharpe is at least 50% of IS Sharpe (tests for overfit)

If an instrument passes both, it has demonstrated systematic edge and is a candidate for live deployment.

---

## What to Build for the Live Bot

### Signal Engine (already built as backtest)
The backtest engine (`js/macroEquityEngine.js`) is the signal engine. In live mode it runs the same factor computation but on the most recent FRED data + price data, producing a single allocation percentage for the next month.

### Monthly Execution
1. On the **last trading day of each month**, the bot:
   - Fetches latest FRED data (applying publication lags)
   - Fetches latest OANDA D1 prices
   - Computes the composite macro score
   - Determines target allocation for each instrument
2. If the allocation has changed by more than 5 percentage points, it rebalances:
   - Sends a market order at the **first open of the new month**
   - Exits the previous position at the **last close of the previous month**

### Live Architecture
- **Signal computation:** Same JS engine, called server-side on a cron job (last trading day of month, ~23:00 UTC)
- **Order execution:** OANDA REST API v20 (`/v3/accounts/{id}/orders`)
- **Position sizing:** Total account equity × target allocation = notional size → convert to units
- **US account:** OANDA account denominated in USD, trading NAS100_USD / SPX500_USD / US2000_USD / USB30Y_USD
- **EU account:** Separate OANDA account denominated in EUR, trading DE30_EUR

### Key Differences in Bot Implementation

| | US Bot | EU Bot |
|--|--------|--------|
| Signal fire time | US month-end (~21:00 UTC) | EU month-end (~15:30 UTC CET) |
| ISM factor | NAPM / INDPRO | MPMIEZMA156N (Eurozone PMI) |
| Instrument | NAS100_USD, SPX500_USD, US2000_USD | DE30_EUR |
| Account currency | USD | EUR |
| VIX proxy | ^VIX (Yahoo Finance) | VSTOXX or ^VIX (global proxy) |
| Floor | 50% (equity), 15% (TLT) | 50% |

---

## Current Backtest Results (Reference)

| Instrument | CAGR | OOS Sharpe | WFE | Max DD | vs B&H DD | Status |
|-----------|------|-----------|-----|--------|-----------|--------|
| QQQ | ~8.8% | ~1.21 | ~1.23 | ~-25% | -38% B&H | ✓ PASS |
| SPY | ~7–8% | ~0.9+ | ~1.0+ | ~-20% | -34% B&H | ✓ PASS |
| IWM | TBD | TBD | TBD | TBD | TBD | Run to check |
| TLT | TBD | TBD | TBD | TBD | TBD | Awaiting data |
| DAX (US factors) | 3.5% | 0.44 | 0.88 | -21.9% | -38.7% B&H | Marginal — needs EU PMI |
| DAX (EU PMI) | TBD | TBD | TBD | TBD | TBD | Run after EU PMI added |

---

## Next Steps

1. **Run DAX with EU PMI enabled** — check if OOS Sharpe improves above 0.5 threshold
2. **If DAX passes:** build the EU live bot targeting DE30_EUR in a separate EUR OANDA account
3. **TLT data:** check if USB30Y_USD is available on your OANDA account tier; if not, skip TLT
4. **Live bot scaffold:** cron job → signal → position sizing → OANDA order submission
5. **Paper trade first:** run signal live for 3 months before committing real capital, comparing live signal vs backtest signal for consistency
