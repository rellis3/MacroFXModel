# Quick Start Guide — Asia Range Backtest

## Step 1: Install Dependencies

Open your terminal in the `Zoo` folder and run:

```bash
pip install pandas numpy pytz
```

Or use the requirements file:

```bash
pip install -r requirements.txt
```

## Step 2: Get Your Data

You need a CSV file with 5-minute EURUSD OHLC data. The file must have these columns:

```csv
datetime,open,high,low,close
2023-01-02 00:00:00,1.06850,1.06875,1.06820,1.06840
2023-01-02 00:05:00,1.06840,1.06860,1.06830,1.06855
2023-01-02 00:10:00,1.06855,1.06870,1.06845,1.06865
...
```

### Where to Get Data:

**Option 1: MetaTrader 5 (If you have MT5)**

1. Open MT5
2. View → Symbols → EURUSD → Right-click → "Bars"
3. Select M5 (5-minute) timeframe
4. Export to CSV

**Option 2: Download from Data Provider**

- [Dukascopy](https://www.dukascopy.com/swiss/english/marketwatch/historical/) — Free historical data
- [TrueFX](https://www.truefx.com/truefx-historical-downloads/) — Free tick data (need to resample to 5m)
- [Investing.com](https://www.investing.com/currencies/eur-usd-historical-data) — Free but limited

**Option 3: Use Your Existing Data**
If you already have OHLC data from your system, just export it to CSV format.

## Step 3: Place Your Data File

Put your CSV file in the `Zoo` folder and name it `eurusd_5m.csv`, or use any name and specify it with `--file`.

```
Zoo/
├── asia_range_backtest.py
├── eurusd_5m.csv          ← Your data file here
├── README.md
└── requirements.txt
```

## Step 4: Run the Backtest

### Basic Run (uses default dates in script)

```bash
python asia_range_backtest.py --file eurusd_5m.csv
```

### Specify Date Range

```bash
python asia_range_backtest.py --file eurusd_5m.csv --start 2023-01-01 --end 2024-01-01
```

### Full Example

```bash
python asia_range_backtest.py --file eurusd_5m.csv --start 2023-06-01 --end 2023-12-31
```

## Step 5: View Results

The script will output:

### Console Report

```
════════════════════════════════════════════════════
  ASIA RANGE DEVIATION BACKTEST — EURUSD 5M
════════════════════════════════════════════════════
  Period          : 2023-06-01 → 2023-12-29
  Total trades    : 245
  TP hits         : 142  (57.9%)
  SL hits         : 103
  EOD closes      : 0
  Net pips        : +195.0
  Avg pips/trade  : +0.80
  Max drawdown    : -32.5 pips
────────────────────────────────────────────────────
  LONG    trades= 123  WR=59.3%  net=+105.0 pips
  SHORT   trades= 122  WR=56.6%  net=+90.0 pips
════════════════════════════════════════════════════

  Monthly P&L (pips):
    2023-06  + 28.5  █████
    2023-07  + 42.0  ████████
    2023-08  - 15.5  ███
    ...
```

### CSV File

A detailed CSV file `asia_backtest_results.csv` will be created with every trade:

```csv
entry_price,direction,outcome,pnl_pips,level,bar_dt,date
1.06850,long,tp,10.0,1.06800,2023-06-05 08:35:00+01:00,2023-06-05
1.07120,short,sl,-5.0,1.07150,2023-06-05 14:20:00+01:00,2023-06-05
...
```

## Troubleshooting

### Error: "File not found"

- Make sure your CSV file is in the `Zoo` folder
- Check the filename matches what you specified with `--file`
- Use full path if needed: `--file "C:/Users/YourName/data/eurusd_5m.csv"`

### Error: "Missing column: open"

- Your CSV must have columns: `datetime`, `open`, `high`, `low`, `close`
- Column names are case-insensitive
- Check your CSV has headers in the first row

### Error: "No trades generated"

- Check your date range overlaps with your data
- Verify you have at least 2 consecutive trading days
- Make sure datetime format is correct (YYYY-MM-DD HH:MM:SS)

### Low Win Rate (<50%)

- This is a mean-reversion strategy — works best in ranging markets
- Try a different time period (avoid strong trending periods)
- Consider adding a trend filter (see Optimization section in README)

## Customizing Parameters

Edit the `CONFIG` dictionary at the top of [`asia_range_backtest.py`](asia_range_backtest.py):

```python
CONFIG = {
    "file": "eurusd_5m.csv",
    "start": "2023-01-01",
    "end": "2024-01-01",
    "sl_pips": 5,              # Change stop loss
    "tp_pips": 10,             # Change take profit
    "confluence_pips": 2,      # Tighten/loosen confluence threshold
}
```

Then run without arguments:

```bash
python asia_range_backtest.py
```

## Next Steps

1. **Analyze Results**
   - Open `asia_backtest_results.csv` in Excel/Google Sheets
   - Look for patterns: which deviation levels work best?
   - Which sessions have highest win rate?

2. **Optimize Parameters**
   - Try different SL/TP ratios (3:1, 4:1)
   - Test tighter confluence (1 pip instead of 2)
   - Filter by deviation multiple (only 2x-4x levels)

3. **Integrate with Main System**
   - Add Asia deviation levels to your confluence scoring
   - Use as confirmation signal in entry scanner
   - Test with other pairs (GBP/USD, XAU/USD)

## Example Workflow

```bash
# 1. Install dependencies
pip install pandas numpy pytz

# 2. Get your data (place in Zoo folder as eurusd_5m.csv)

# 3. Run backtest for 2023
python asia_range_backtest.py --file eurusd_5m.csv --start 2023-01-01 --end 2024-01-01

# 4. Check results
# - Read console output
# - Open asia_backtest_results.csv

# 5. Optimize (edit CONFIG in script)
# - Change sl_pips to 7
# - Change tp_pips to 14 (2:1 R:R)
# - Run again

# 6. Compare results
```

## Need Help?

- Check [`README.md`](README.md) for detailed documentation
- Review the strategy logic in the script comments
- Verify your data format matches the requirements

---

**Ready to run?** Just execute:

```bash
python asia_range_backtest.py --file eurusd_5m.csv --start 2023-01-01 --end 2024-01-01
```
