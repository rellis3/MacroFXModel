# Macro-Regime-Conditional Equity Strategy

A proof-of-concept backtesting and walk-forward validation system for a macro-driven, long/flat equity strategy targeting **NQ (QQQ)** and **SPX (SPY)**. Built to prove — or disprove — whether freely available macro data contains enough signal to time equity exposure before any live capital is risked.

---

## The Core Idea

Most equity drawdowns are not random. They cluster around specific macro conditions: liquidity tightening, credit stress, inverted yield curves, and rising real yields. This system attempts to quantify those conditions into a single **composite macro score**, then use that score to decide whether to hold equities or step aside.

The model is **long or flat only** — it never shorts. The question it answers is: *can macro signals tell us when NOT to be invested?*

---

## What Gets Measured

### Five Macro Factors

| Factor | FRED Series | Signal Logic |
|--------|-------------|--------------|
| **Net Liquidity** | WALCL − WTREGEN − RRPONTSYD | Fed balance sheet minus Treasury cash minus reverse repo drain. Rising = more liquidity in the system = bullish. |
| **Yield Curve** | T10Y2Y (10Y − 2Y spread) | Positive = normal economy. Negative (inverted) = recession signal = bearish. |
| **Credit Spreads** | BAMLH0A0HYM2 (HY OAS) | Rising spreads = credit stress = risk-off = bearish. **Inverted** in the composite. |
| **Real Yields** | DFII10 (10Y TIPS yield) | Rising real yields = higher discount rate = headwind for growth equities. **Inverted** in the composite. |
| **ISM Manufacturing** | NAPM | PMI above 50 = expansion. Rising = positive. |

### Composite Macro Score

```
macro_score = (net_liq_z × 0.30) + (curve_z × 0.20) + (−credit_z × 0.20) + (−real_yield_z × 0.15) + (ism_z × 0.15)
```

Each factor is z-scored against its own rolling 252-day history (no lookahead). The score typically ranges from −3 to +3 in normal market conditions.

### Volatility Regime Gate

VIX is z-scored against a 60-day rolling mean/std:

| VIX Z-Score | Regime | Position Scalar |
|-------------|--------|-----------------|
| > 1.0 | HIGH | 25% of capital |
| −0.5 to 1.0 | NORMAL | 75% of capital |
| < −0.5 | LOW | 100% of capital |

Even if the macro score is bullish, the system reduces exposure in high-volatility periods. Entry is blocked entirely if `vix_z > 1.5`.

---

## Trade Rules

- **Rebalance frequency**: Weekly (check signal every Friday close, act at Monday open)
- **LONG**: `macro_score > 0.5` AND `vix_z < 1.5`
- **FLAT**: `macro_score < −0.5` OR `vix_z > 1.5`
- **Neutral zone** (−0.5 to 0.5): FLAT — no trade
- **Costs**: 0.10% commission + 0.05% slippage per trade = 0.15% per round trip
- **Return calculation**: Monday open to Friday close (not close-to-close) to better approximate real execution

---

## Data Sources

All free, no paid subscriptions required.

**FRED API** (free key at [fred.stlouisfed.org](https://fred.stlouisfed.org/docs/api/api_key.html)):

| Series ID | Description | Frequency |
|-----------|-------------|-----------|
| WALCL | Fed Balance Sheet (assets) | Weekly |
| WTREGEN | Treasury General Account | Weekly |
| RRPONTSYD | Overnight Reverse Repo | Daily |
| T10Y2Y | 10Y−2Y Treasury Yield Spread | Daily |
| BAMLH0A0HYM2 | ICE BofA HY Credit Spread OAS | Daily |
| NAPM | ISM Manufacturing PMI | Monthly |
| DFII10 | 10Y TIPS Real Yield | Daily |
| T5YIE | 5Y Breakeven Inflation | Daily |

**yfinance** (no key needed):

| Ticker | Purpose |
|--------|---------|
| QQQ | Nasdaq-100 proxy (primary backtest instrument) |
| SPY | S&P 500 proxy (generalisation test) |
| TLT | 20Y bond (context signal) |
| GLD | Gold (risk sentiment context) |
| ^VIX | CBOE Volatility Index |

---

## Publication Lag Handling

FRED data is not available the moment it's collected — there are publication delays. The system simulates this honestly:

- **Weekly FRED series** (balance sheet, TGA, repo, spreads): **5 trading day lag** applied after forward-filling to daily frequency
- **Monthly FRED series** (ISM): **21 trading day lag** applied

This means the model never "sees" data that wouldn't have been available in real time. This is the most common source of backtest inflation in macro models — we avoid it explicitly.

---

## No-Lookahead Architecture

Three layers of protection against lookahead bias:

1. **Rolling z-scores** — computed using only the past 252 days at each point in time, never the full sample
2. **Publication lags** — FRED data shifted forward before any signal calculation
3. **Signal shift** — Friday's signal drives the *following* week's position (`shift(1)` on weekly data)

---

## Running the Backtester

### Prerequisites

```bash
pip install pandas numpy matplotlib yfinance fredapi
```

The script will auto-install missing packages on first run.

### Basic run (standalone)

```bash
cd macro-regime-conditional
python macro_equity_backtest.py --fred-key YOUR_FRED_KEY
```

### Run with dashboard integration

```bash
python macro_equity_backtest.py \
  --fred-key YOUR_FRED_KEY \
  --base-url http://localhost:3000
```

With `--base-url`, the script will:
1. Read your saved configuration from the dashboard KV (FRED key, weights, thresholds, WF params)
2. Push the full trade log to the dashboard → appears in **Positions → 📈 Macro Equity BT**
3. Push the metrics summary → appears in the **📈 Macro Equity** config tab

### Runtime

Expect **5–15 minutes** on first run — FRED data fetching is the bottleneck (8 API calls). Subsequent runs are faster if you cache locally (not implemented by default).

---

## What Gets Output

### Console

```
[1/6] Fetching market data (2005-01-01 → 2026-06-14) …
[2/6] Aligning & applying publication lags …
  Dataset: 5431 trading days  (2005-01-03 → 2026-06-13)
[3/6] Building signals …
  Macro score range : -2.84 → 2.61
  Fraction of days above long threshold (0.5): 41.3%
[4/6] Running vectorised weekly backtest …
[5/6] Walk-forward validation (train=504d / test=63d / step=21d) …
[6/6] Generating reports …
```

Then two full metrics tables, walk-forward window tables, regime breakdown tables, and the pass/fail verdict.

### Charts saved to `macro-regime-conditional/`

| File | Contents |
|------|----------|
| `macro_equity_qqq.png` | 4-panel chart for QQQ |
| `macro_equity_spy.png` | 4-panel chart for SPY |

**Panel 1 — Equity curve (log scale)**: Strategy vs Buy & Hold from 2005 to present. Look for: strategy tracking the uptrend but with shallower drawdowns during 2008, 2020, 2022.

**Panel 2 — Drawdown series**: Strategy DD (red fill) vs B&H DD (blue fill). The model's value is visible here — when it steps aside it avoids the deepest troughs.

**Panel 3 — Macro score over time**: The amber line is the composite score. Green shading marks weeks the model was invested. You should see the model stepping out during 2008, late 2018, early 2020, 2022.

**Panel 4 — Walk-forward OOS equity**: The stitched out-of-sample equity curve. This is the one that matters for proof-of-concept. If it goes up with reasonable consistency, there is real edge. The Walk-Forward Efficiency (WFE) is shown in the top-left corner.

---

## Performance Report — What to Expect

### Metrics Table (per instrument)

```
────────────────────────────────────────────────────────────────────
  QQQ — Nasdaq-100    Strategy        Buy & Hold
────────────────────────────────────────────────────────────────────
  CAGR                  ~12–18%          ~14–16%
  Sharpe Ratio           ~0.7–1.1         ~0.6–0.8
  Sortino Ratio          ~1.0–1.5         ~0.9–1.2
  Max Drawdown          ~−20–35%         ~−35–50%
  Win Rate               ~55–65%          ~55–60%
  Time in Market         ~45–65%          100%
```

*These are typical ranges, not guarantees. The data will show what it shows.*

### Walk-Forward Table

Shows ~230 windows (each ~3 months of out-of-sample testing). Columns:
- **Train Start / End**: The 2-year window used to fit z-score parameters
- **Test Start / End**: The 3-month out-of-sample window
- **IS Sharpe**: In-sample Sharpe (how well the model fit the training data)
- **OOS Sharpe**: Out-of-sample Sharpe (what actually matters)
- **OOS Return**: Raw return over the test quarter

### Walk-Forward Efficiency (WFE)

```
WFE = Mean OOS Sharpe / Mean IS Sharpe
```

| WFE | Interpretation |
|-----|----------------|
| > 0.7 | Strong generalisation — model translates well to unseen data |
| 0.5–0.7 | Solid — meaningful edge out-of-sample |
| 0.3–0.5 | Borderline — some edge but weaker than hoped |
| < 0.3 | No edge — model is overfit to history |

### Regime Breakdown Table

Shows performance split by:
- **Liquidity Positive vs Negative**: Does the model work better when the Fed is expanding the balance sheet?
- **VIX HIGH / NORMAL / LOW**: Where does the vol gate add value?
- **Yield Curve Normal vs Inverted**: Does the curve signal matter?

This is arguably the most informative section. A good model should show clearly better Sharpe in liquidity-positive, normal-vol environments — because that's where the signal is designed to be most reliable.

---

## Pass / Fail Verdict

The script prints an honest verdict at the end:

```
═════════════════════════════════════════════════════════════════════
  PROOF-OF-CONCEPT VERDICT
═════════════════════════════════════════════════════════════════════

  Nasdaq-100 (QQQ):
    OOS Sharpe      : 0.612  →  PASS  (target ≥ 0.5)
    WFE             : 0.581  →  PASS  (target ≥ 0.5)
    Max Drawdown    : -24.1% vs B&H -49.7%  →  PASS — lower DD

  S&P 500 (SPY):
    OOS Sharpe      : 0.534  →  PASS  (target ≥ 0.5)
    WFE             : 0.512  →  PASS  (target ≥ 0.5)
    Max Drawdown    : -19.8% vs B&H -33.5%  →  PASS — lower DD
```

The model is designed to **generalise across both instruments**. If it only works on QQQ, it may be overfit to tech-sector dynamics rather than genuine macro regimes.

**Fail conditions** (the script reports these honestly):
- OOS Sharpe < 0.3 → no edge
- WFE < 0.3 → overfit
- Strategy max drawdown ≥ buy & hold → model adds no protection
- Only works on one instrument → likely overfit

---

## Dashboard Integration

### Macro Equity Tab (bot-config.html)

The **📈 Macro Equity** tab in the bot config page stores your settings in KV (`macro_equity_config`):

| Setting | Default | Notes |
|---------|---------|-------|
| FRED API Key | — | Stored encrypted in KV, read by the script via `--base-url` |
| Net Liquidity weight | 0.30 | Adjust to emphasise liquidity signal more/less |
| Yield Curve weight | 0.20 | |
| Credit Spread weight | 0.20 | |
| Real Yield weight | 0.15 | |
| ISM weight | 0.15 | |
| Long threshold | 0.5 | Raise to be more selective entering |
| Flat threshold | −0.5 | Lower to be quicker to exit |
| Max VIX-Z to enter | 1.5 | Block entries in high-vol spikes |
| WF Train window | 504 days | 2 years |
| WF Test window | 63 days | 3 months |
| WF Step | 21 days | 1 month |

After changing settings, click **Save Config** then re-run the script. The script reads these values automatically when `--base-url` is provided.

### Positions Tab — Macro Equity BT Sub-tab

After running the script with `--base-url`, the full trade log appears under **Positions → 📈 Macro Equity BT**. The table shows:

- Ticker (QQQ / SPY), Entry / Exit dates, Direction (always LONG for this PoC)
- Position size (0.25 / 0.75 / 1.0 depending on vol regime at entry)
- Entry and exit prices, P&L %
- Composite macro score at entry
- Vol regime at entry (HIGH / NORMAL / LOW)

Use the filter pills to view QQQ or SPY trades separately. The stats bar at the bottom summarises win rate, average P&L, best and worst trades.

---

## Tuning the Model

If results are borderline, these are the levers to pull — in priority order:

1. **Long threshold** — raising from 0.5 to 0.7 makes the model more selective, trades less, but each trade has higher conviction. Try this first if win rate is low.

2. **Signal weights** — if the regime breakdown shows liquidity is the dominant factor, increase its weight to 0.40 and reduce others proportionally.

3. **VIX Z-max** — lowering from 1.5 to 1.0 cuts more trades during volatile periods. Helps max drawdown but reduces time in market.

4. **Z-score window** — the 252-day window (1 year) is the default. Shortening to 126 days makes the model react faster; lengthening to 504 days makes it more stable but slower.

**Important**: Do not tune parameters against the full backtest period and then report those results as validation. Always re-run the walk-forward after any parameter change — the WFE is the only honest measure of whether a change genuinely improved the model or just curve-fit better to history.

---

## File Structure

```
macro-regime-conditional/
├── macro_equity_backtest.py   # Main backtester — run this
├── README.md                  # This file
├── macro_equity_qqq.png       # Generated on run — QQQ 4-panel chart
└── macro_equity_spy.png       # Generated on run — SPY 4-panel chart
```

---

## Limitations & Known Constraints

- **Long/flat only** — this is intentional for the PoC. A short leg (shorting QQQ when macro_score < −0.5) is the natural extension and would meaningfully improve drawdown statistics. Not included to keep the first validation clean.

- **Weekly rebalance** — monthly FRED data (ISM) means daily signals carry little extra information. Weekly is the right cadence for this signal set.

- **No transaction cost model for slippage during stress** — the 0.05% slippage assumption is realistic in normal markets but underestimates cost during crisis periods when bid/ask spreads widen. Real-world performance in 2008/2020 entries/exits would be somewhat worse than backtested.

- **Survivorship bias** — QQQ and SPY are the dominant indices today. Testing on instruments that survived and grew is a mild form of selection bias. Cross-instrument validation (both QQQ and SPY passing) partially mitigates this.

- **FRED data revisions** — FRED series are sometimes revised retroactively. The publication lag (5–21 days) handles the initial reporting delay but does not account for subsequent data revisions. In practice this has a small effect on weekly macro signals.

- **Regime dependency** — the model is designed to work in liquidity-positive, normally-volatile environments. The regime breakdown table will make clear that it underperforms (or stays flat) in the regimes where it steps aside. This is by design — the goal is to avoid the worst periods, not to profit from them.

---

## Extending to Live Trading

The MT5 credentials section in the Macro Equity tab is wired up for future use. A live implementation would:

1. Run the signal calculation on a weekly schedule (e.g. every Friday evening)
2. Read the current position from MT5
3. If signal says LONG and not invested → open QQQ/SPY CFD position sized by vol scalar
4. If signal says FLAT and invested → close position
5. Push status to the dashboard KV for display in the Positions tab

This is not implemented yet — the PoC must first prove edge before any live capital is risked.
