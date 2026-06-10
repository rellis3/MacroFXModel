# Zoo — Trading Strategy Backtests

This folder contains standalone backtest implementations for various trading strategies.

## Asia Range Deviation Backtest

**File:** [`asia_range_backtest.py`](asia_range_backtest.py)

### Strategy Overview

- **Session:** Asia session (00:00-06:00 UK time, GMT/BST aware)
- **Range Calculation:** Body high to body low during Asia session
- **Deviation Levels:** 1.5x, 2x, 2.5x ... 10x above and below range
- **Confluence:** Current day AND previous day levels within 2 pips = tradeable
- **Entry Logic:**
  - SHORT: Price comes UP to a level (reversal)
  - LONG: Price comes DOWN to a level (reversal)
- **Risk Management:**
  - Stop Loss: 5 pips
  - Take Profit: 10 pips
- **Trading Hours:** 06:00-22:00 UK time (London/NY sessions only)
- **No Lookahead Bias:** All levels calculated after Asia close (06:00)

### Installation

```bash
pip install pandas numpy pytz
```

### Usage

#### Basic Usage (with config defaults)

```bash
python asia_range_backtest.py --file eurusd_5m.csv
```

#### Custom Date Range

```bash
python asia_range_backtest.py --file eurusd_5m.csv --start 2023-01-01 --end 2024-01-01
```

#### Edit Config Directly

Open [`asia_range_backtest.py`](asia_range_backtest.py) and modify the `CONFIG` dictionary:

```python
CONFIG = {
    "file": "eurusd_5m.csv",
    "start": "2022-01-01",
    "end": "2024-01-01",
    "sl_pips": 5,
    "tp_pips": 10,
    "confluence_pips": 2,
    # ... etc
}
```

### Data Format

Your CSV file must contain these columns (case-insensitive):

- `datetime` — Timestamp in format `YYYY-MM-DD HH:MM:SS` (UTC or with timezone)
- `open` — Open price
- `high` — High price
- `low` — Low price
- `close` — Close price

**Example:**

```csv
datetime,open,high,low,close
2023-01-02 00:00:00,1.06850,1.06875,1.06820,1.06840
2023-01-02 00:05:00,1.06840,1.06860,1.06830,1.06855
...
```

### Output

The script generates:

1. **Console Report:**
   - Total trades, win rate, net pips
   - Breakdown by direction (LONG/SHORT)
   - Monthly P&L chart
   - Max drawdown

2. **CSV File:** `asia_backtest_results.csv`
   - Detailed trade-by-trade results
   - Entry price, direction, outcome, P&L
   - Timestamps and level information

### Example Output

```
════════════════════════════════════════════════════
  ASIA RANGE DEVIATION BACKTEST — EURUSD 5M
════════════════════════════════════════════════════
  Period          : 2023-01-03 → 2023-12-29
  Total trades    : 487
  TP hits         : 276  (56.7%)
  SL hits         : 211
  EOD closes      : 0
  Net pips        : +325.0
  Avg pips/trade  : +0.67
  Max drawdown    : -45.2 pips
────────────────────────────────────────────────────
  LONG    trades= 245  WR=58.2%  net=+180.5 pips
  SHORT   trades= 242  WR=55.1%  net=+144.5 pips
════════════════════════════════════════════════════

  Monthly P&L (pips):
    2023-01  + 42.5  ████████
    2023-02  + 18.0  ███
    2023-03  - 12.5  ██
    ...
```

### Strategy Parameters

You can optimize these in the `CONFIG` dictionary:

| Parameter         | Default  | Description                            |
| ----------------- | -------- | -------------------------------------- |
| `sl_pips`         | 5        | Stop loss in pips                      |
| `tp_pips`         | 10       | Take profit in pips (2:1 R:R)          |
| `confluence_pips` | 2        | Max distance for level confluence      |
| `dev_steps`       | 1.5-10.0 | Deviation multipliers (0.5 increments) |

### How It Works

1. **Asia Range Detection** (00:00-06:00 UK)
   - Calculate body high/low for each 5m candle
   - Range = max body high - min body low
   - Store range for each trading day

2. **Deviation Level Generation**
   - For each day's range, project levels at 1.5x, 2x, 2.5x ... 10x
   - Above range = SHORT bias
   - Below range = LONG bias

3. **Confluence Filtering**
   - Compare today's levels with yesterday's levels
   - If within 2 pips AND same direction → tradeable level
   - Average the two prices

4. **Trade Execution** (06:00-22:00 UK)
   - Walk through each 5m bar
   - Check if price touches any active level
   - Enter at level price (no slippage assumed)
   - Manage SL/TP on subsequent bars
   - One trade per level (consumed on entry)

5. **Exit Logic**
   - TP hit: Close at +10 pips
   - SL hit: Close at -5 pips
   - Both hit same bar: Use distance from bar open to determine which hit first
   - EOD: Close any open trades at last bar close

### No Lookahead Bias

The strategy is designed to be **strictly realistic**:

- Asia range calculated using candles with open time < 06:00
- Levels only become tradeable AFTER 06:00 (Asia close)
- No future data used in decision-making
- Conservative fill assumptions (both TP/SL hit = closer to open)

### Optimization Ideas

1. **Vary R:R Ratio**
   - Test `tp_pips` = 15, 20 (3:1, 4:1 R:R)
   - May reduce win rate but increase avg R

2. **Tighten Confluence**
   - Reduce `confluence_pips` to 1 or 1.5
   - Fewer trades but higher quality

3. **Filter by Deviation Multiple**
   - Only trade 2x-4x levels (sweet spot)
   - Avoid extreme levels (10x rarely hit)

4. **Add Time Filter**
   - Only trade London open (08:00-12:00)
   - Avoid NY close chop (20:00-22:00)

5. **Add Trend Filter**
   - Calculate daily EMA(20)
   - Only LONG if price > EMA, SHORT if price < EMA

### Integration with Main System

This backtest can inform your main trading system:

1. **Add Asia Range Levels to Confluence Scoring**
   - Integrate deviation levels into [`js/confluences.js`](../js/confluences.js)
   - Add +1 star bonus when Fib level aligns with Asia deviation level

2. **Use as Entry Filter**
   - Check if current price is near an Asia deviation level
   - Increase conviction if Fib + Asia level + macro bias all align

3. **Validate in Gold Bot**
   - Gold has wider ranges — test with `pip_size = 1.0`
   - Adjust `confluence_pips` to 20-30 for XAU/USD

### Troubleshooting

**No trades generated:**

- Check date range overlaps with your data
- Verify CSV has correct datetime format
- Ensure at least 2 consecutive trading days in range

**Low win rate (<50%):**

- Market may be trending (range strategy works best in ranging markets)
- Try tighter confluence threshold
- Add trend filter

**High drawdown:**

- Reduce position size
- Add max daily loss limit
- Filter out high-volatility days (VIX > 25)

---

## Future Additions

This folder will contain additional backtest strategies:

- Volume Profile POC reversion
- Liquidity sweep detection
- News event fade strategy
- Multi-timeframe Fibonacci confluence
