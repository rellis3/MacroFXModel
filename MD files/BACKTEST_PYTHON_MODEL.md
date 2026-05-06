# MacroFX Model — Python Backtesting Blueprint
**Purpose:** Complete specification to rebuild and validate this strategy as a Python backtesting engine at a later date.
**Status:** Blueprint only — not yet built. The dashboard is the live reference implementation.

---

## WHAT WE ARE BACKTESTING

The core hypothesis: **Fibonacci extensions of intraday body ranges (Asia session + Monday session) produce reliable mean-reversion confluence levels when filtered by macro bias, volatility regime, and OI structure.**

A trade is triggered when:
1. Price reaches a Fib level with ≥ N stars
2. The level is confirmed by macro bias alignment
3. Volatility is not in a high-impulse breakout regime
4. Session timing is favourable (London or NY Overlap)

The backtest must validate edge exists, quantify it, and determine which filters add alpha vs noise.

---

## DATA REQUIREMENTS

### Price data (primary)
- **Source:** Oanda historical API, Dukascopy, or FXCM (all free historical archives)
- **Format:** 5-minute OHLC bars, mid-price (bid+ask/2)
- **Coverage:** 5 years minimum, 2019-2024 preferred (includes COVID vol spike, 2022 rate shock, 2023 normalisation)
- **Pairs to test:** EUR/USD, GBP/USD, USD/JPY, AUD/USD — validate each independently
- **Gold:** XAU/USD — separate test, different vol characteristics

```python
# Oanda historical format
{
    "time": "2024-01-15T00:00:00Z",
    "mid": {"o": "1.09123", "h": "1.09145", "l": "1.09110", "c": "1.09130"},
    "complete": True
}
```

### Macro data (scoring)
- **FRED API** (free, unlimited): us10y, us2y, de10y, gb10y, jp10y, au10y, vix, dxy, hy, nfci, tips
- **Update frequency:** Daily (FRED has 1-day lag — build this into the simulation)
- **Foreign short rates:** Monthly OECD data — forward-fill to daily

```python
import pandas_datareader.data as web
us10y = web.DataReader('DGS10', 'fred', start, end)
vix   = web.DataReader('VIXCLS', 'fred', start, end)
```

### What to skip for v1 backtest
- OI/GEX data (manual CME data — no historical archive available)
- COT data (available from CFTC but adds complexity for v1)
- ARMA spread signal (add in v2 once base strategy is validated)
- AI analysis (not replicable historically)

---

## PYTHON PROJECT STRUCTURE

```
backtest/
  data/
    fetch_oanda.py          ← pull and cache historical OHLC from Oanda
    fetch_fred.py           ← pull FRED macro series, forward-fill monthly
    loader.py               ← unified data loader with caching (parquet files)
  core/
    sessions.py             ← Asia range, Monday range extraction
    fibs.py                 ← Fib projection + confluence detection
    macro.py                ← 7-tier score replication
    vol.py                  ← EMA-ATR + GARCH(1,1) + vol regime
    pivots.py               ← daily classic pivot P, S1-3, R1-3
    signal.py               ← spread signal engine (ARMA optional)
  engine/
    backtest.py             ← main simulation loop
    trade.py                ← trade object: entry/SL/TP/outcome
    position.py             ← position sizing from score + vol
  analysis/
    results.py              ← metrics: win rate, profit factor, max DD, Sharpe
    charts.py               ← equity curve, DD chart, regime breakdown
    walk_forward.py         ← rolling train/test windows
  config.py                 ← strategy parameters (star threshold, session filter, etc.)
  run.py                    ← CLI entry point
```

---

## STEP 1 — DATA PIPELINE

### 5m bar loading

```python
import pandas as pd
import requests

def fetch_oanda_5m(instrument, from_dt, to_dt, api_key):
    """Fetch 5m mid-price bars from Oanda v3 API."""
    base = "https://api-fxtrade.oanda.com/v3"
    # Oanda max 5000 per request — paginate by date
    bars = []
    cursor = from_dt
    while cursor < to_dt:
        url = f"{base}/instruments/{instrument}/candles"
        params = {
            "granularity": "M5",
            "price": "M",
            "from": cursor.isoformat() + "Z",
            "count": 5000,
        }
        r = requests.get(url, params=params, headers={"Authorization": f"Bearer {api_key}"})
        data = r.json()
        if not data.get("candles"):
            break
        for c in data["candles"]:
            if c["complete"]:
                bars.append({
                    "time": pd.Timestamp(c["time"]),
                    "open":  float(c["mid"]["o"]),
                    "high":  float(c["mid"]["h"]),
                    "low":   float(c["mid"]["l"]),
                    "close": float(c["mid"]["c"]),
                })
        cursor = bars[-1]["time"] + pd.Timedelta(minutes=5)
    df = pd.DataFrame(bars).set_index("time")
    df.index = df.index.tz_convert("Europe/London")  # Convert to London local
    return df

# Cache to parquet
df.to_parquet("data/cache/eurusd_5m.parquet")
```

### FRED macro loading

```python
def load_fred_series(series_dict, start, end):
    """Load multiple FRED series into a single aligned DataFrame."""
    import pandas_datareader.data as web
    frames = {}
    for key, fred_id in series_dict.items():
        try:
            s = web.DataReader(fred_id, 'fred', start, end)[fred_id]
            frames[key] = s
        except Exception:
            pass
    df = pd.DataFrame(frames)
    # Forward-fill gaps (NFCI weekly, foreign rates monthly)
    df = df.ffill()
    return df

FRED_SERIES = {
    'us10y': 'DGS10', 'us2y': 'GS2', 'vix': 'VIXCLS',
    'dxy': 'DTWEXBGS', 'hy': 'BAMLH0A0HYM2', 'nfci': 'NFCI',
    'tips': 'DFII10', 'de10y': 'IRLTLT01DEM156N', 'gb10y': 'IRLTLT01GBM156N',
    'jp10y': 'IRLTLT01JPM156N', 'au10y': 'IRLTLT01AUM156N',
}
```

---

## STEP 2 — SESSION RANGE EXTRACTION

This mirrors `calculateAsiaRanges()` and `computeBodyRange()` from `ranges.js`.

```python
def extract_asia_ranges(df_5m):
    """
    Extract Asia session body ranges from 5m bars.
    Asia = 00:00-06:00 London local time.
    Returns DataFrame with columns: date, high, low, range
    """
    # df_5m index is already London local time
    asia = df_5m.between_time("00:00", "05:55")
    asia = asia[asia.index.dayofweek < 5]  # Monday-Friday only

    results = []
    for date, group in asia.groupby(asia.index.date):
        if len(group) < 36:  # < 3 hours of bars — skip thin sessions
            continue
        body_high = group[['open', 'close']].max(axis=1).max()
        body_low  = group[['open', 'close']].min(axis=1).min()
        results.append({
            'date': pd.Timestamp(date),
            'high': body_high,
            'low':  body_low,
            'range': body_high - body_low,
        })
    return pd.DataFrame(results).set_index('date')

def extract_monday_ranges(df_30m):
    """Monday full-session body range from 30m bars."""
    mondays = df_30m[df_30m.index.dayofweek == 0]
    results = []
    for date, group in mondays.groupby(mondays.index.date):
        if len(group) < 20:
            continue
        body_high = group[['open', 'close']].max(axis=1).max()
        body_low  = group[['open', 'close']].min(axis=1).min()
        results.append({
            'date': pd.Timestamp(date),
            'high': body_high,
            'low':  body_low,
            'range': body_high - body_low,
        })
    return pd.DataFrame(results).set_index('date')
```

---

## STEP 3 — FIB PROJECTION + CONFLUENCE DETECTION

This mirrors `projectFibLevels()` and `detectConfluences()` from `ranges.js`.

```python
FIB_LEVELS = [-1.0, -0.75, -0.5, -0.25, 0.0, 0.25, 0.5,
               0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0]

def project_fibs(session_range):
    """Project Fibonacci levels from a body range dict {high, low, range}."""
    levels = []
    for fib in FIB_LEVELS:
        price = session_range['low'] + session_range['range'] * fib
        levels.append({'fib': fib, 'price': price})
    return levels

def detect_confluences(today_fibs, yesterday_fibs, pip_size, confluence_pips=5):
    """
    Find price levels where today's and yesterday's Fib projections overlap.
    Returns list of confluence dicts with price, pip_diff, is_tight.
    """
    threshold = confluence_pips * pip_size
    tight_threshold = threshold * 0.10

    raw_pairs = []
    for t in today_fibs:
        for y in yesterday_fibs:
            diff = abs(t['price'] - y['price'])
            if diff <= threshold:
                raw_pairs.append({
                    'price':    (t['price'] + y['price']) / 2,
                    'today_fib':    t['fib'],
                    'yest_fib':     y['fib'],
                    'pip_diff':     diff / pip_size,
                    'is_tight':     diff <= tight_threshold,
                })

    if not raw_pairs:
        return []

    # Cluster merge (mirrors Layer 3 in ranges.js)
    raw_pairs.sort(key=lambda x: x['price'])
    clusters, bucket = [], [raw_pairs[0]]
    for pair in raw_pairs[1:]:
        centre = sum(p['price'] for p in bucket) / len(bucket)
        if pair['price'] - centre <= tight_threshold:
            bucket.append(pair)
        else:
            clusters.append(bucket)
            bucket = [pair]
    clusters.append(bucket)

    confluences = []
    for cluster in clusters:
        confluences.append({
            'price':    sum(p['price'] for p in cluster) / len(cluster),
            'pip_diff': min(p['pip_diff'] for p in cluster),
            'is_tight': any(p['is_tight'] for p in cluster),
            'density':  len(cluster),
        })
    return confluences
```

---

## STEP 4 — MACRO SCORING

Replicate the 7-tier system from `macro.js`. For backtesting, score is computed daily using FRED data lagged by 1 business day.

```python
def compute_macro_score(fred_row, pair, ohlc_daily):
    """
    Compute 7-tier macro score for a given pair on a given date.
    fred_row: Series with all FRED keys for that date (already forward-filled)
    pair: e.g. 'EUR/USD'
    ohlc_daily: DataFrame of daily bars up to that date (for T7 EMA/RSI)
    Returns: total_score (int), bias ('LONG'/'SHORT'/'NEUTRAL')
    """
    score = 0

    # T1 — Rate Differential
    if pair == 'EUR/USD':
        diff = fred_row.get('us10y', 0) - fred_row.get('de10y', 0)
        # negative diff = EUR relatively more attractive = bullish EUR/USD
        if   diff < -0.5: score += 3
        elif diff < -0.2: score += 2
        elif diff <  0.0: score += 1
        elif diff >  0.5: score -= 3
        elif diff >  0.2: score -= 2
        elif diff >  0.0: score -= 1
    # Add other pairs following same pattern...

    # T2 — VIX
    vix = fred_row.get('vix')
    if vix:
        is_safe_haven = pair in ['USD/JPY', 'USD/CHF', 'XAU/USD']
        if vix > 25:
            score += 3 if is_safe_haven else -3
        elif vix > 20:
            score += 2 if is_safe_haven else -2
        elif vix < 15:
            score += -2 if is_safe_haven else 2
        elif vix < 18:
            score += -1 if is_safe_haven else 1

    # T3 — DXY
    dxy      = fred_row.get('dxy')
    dxy_prev = fred_row.get('dxy_prev')
    if dxy and dxy_prev:
        dxy_up = dxy > dxy_prev
        if pair in ['EUR/USD', 'GBP/USD', 'AUD/USD']:
            score += -2 if dxy_up else 2
        elif pair in ['USD/JPY', 'USD/CAD', 'USD/CHF']:
            score += 2 if dxy_up else -2

    # T4 — HY spreads
    hy      = fred_row.get('hy')
    hy_prev = fred_row.get('hy_prev')
    if hy and hy_prev:
        hy_bps = hy * 100
        hy_chg = (hy - hy_prev) * 100
        is_risk_on = pair not in ['XAU/USD', 'USD/JPY', 'USD/CHF']
        if hy_chg > 10 or hy_bps > 500:
            score += 2 if not is_risk_on else -2
        elif hy_chg < -10 and hy_bps < 300:
            score += -2 if not is_risk_on else 2

    # T5 — AUD/JPY carry (already in FRED as cross)
    # T6 — NFCI
    # T7 — EMA/RSI from ohlc_daily
    # ... (implement fully following macro.js logic)

    bias = 'LONG' if score > 4 else 'SHORT' if score < -4 else 'NEUTRAL'
    return score, bias
```

---

## STEP 5 — VOLATILITY REGIME

```python
def compute_vol_regime(daily_bars, window=100):
    """
    EMA-ATR volatility regime. Returns regime, atr, percentile, stop_dist, tp_mult.
    """
    df = daily_bars.copy()
    df['tr'] = (
        (df['high'] - df['low'])
        .combine(abs(df['high'] - df['close'].shift(1)), max)
        .combine(abs(df['low']  - df['close'].shift(1)), max)
    )
    alpha = 0.15
    df['ema_atr'] = df['tr'].ewm(alpha=alpha, adjust=False).mean()

    current_atr = df['ema_atr'].iloc[-1]
    hist = df['ema_atr'].iloc[-window:]
    pct  = (hist < current_atr).mean() * 100

    if pct < 25:
        regime = 'LOW'
        stop_mult, tp_mult = 0.75, 2.0
    elif pct > 75:
        regime = 'HIGH'
        stop_mult, tp_mult = 1.75, 1.2
    else:
        regime = 'NORMAL'
        stop_mult, tp_mult = 1.0, 1.5

    return {
        'regime':     regime,
        'atr':        current_atr,
        'percentile': pct,
        'stop_dist':  current_atr * stop_mult,
        'tp_mult':    tp_mult,
    }
```

---

## STEP 6 — STAR RATING

```python
def rate_confluence(conf, macro_bias, direction, pivot_levels, vol_regime, pip_size):
    """
    Assign star rating to a confluence level.
    Returns: stars (int 1-7), tags (list)
    """
    stars = 1
    tags  = []

    if conf['is_tight']:
        stars += 1
        tags.append('Tight')

    if direction == macro_bias:
        stars += 1
        tags.append(f'Aligned {macro_bias}')

    # Pivot proximity (classic pivot S/R levels)
    piv_cap = min(vol_regime['atr'] * 0.10, 8 * pip_size)
    for name, price in pivot_levels.items():
        if abs(conf['price'] - price) <= piv_cap:
            stars += 1
            tags.append(f'Pivot {name.upper()}')
            break

    # Density bonus
    if conf.get('density', 1) >= 2:
        stars += 1
        tags.append('Dense')

    # Note: OI boost not available in backtest (no historical OI data)
    # Note: Daily open boost can be added using historical daily opens

    return stars, tags
```

---

## STEP 7 — MAIN SIMULATION LOOP

```python
def run_backtest(pair, df_5m, df_30m, df_daily, fred_df, config):
    """
    Main backtest loop. Iterates trading days, detects confluences,
    checks for entries, manages exits.
    """
    pip_size = config['pip_size'][pair]
    trades   = []

    # Extract all Asia and Monday ranges upfront
    asia_ranges    = extract_asia_ranges(df_5m)
    monday_ranges  = extract_monday_ranges(df_30m)

    trading_days = df_daily.index[df_daily.index.dayofweek < 5]

    for i, date in enumerate(trading_days[2:], start=2):
        # Use lagged FRED data (1-day lag)
        fred_date = fred_df.index[fred_df.index <= date]
        if len(fred_date) < 2:
            continue
        fred_row = fred_df.loc[fred_date[-2]]  # -1 = today (not yet released), -2 = yesterday

        # Compute signals
        macro_score, macro_bias = compute_macro_score(fred_row, pair, df_daily.iloc[:i])
        vol = compute_vol_regime(df_daily.iloc[:i])

        if config.get('skip_extreme_vol') and vol['regime'] == 'HIGH':
            continue

        # Get today + yesterday Asia ranges
        prev_asia_dates = [d for d in asia_ranges.index if d <= date]
        if len(prev_asia_dates) < 2:
            continue
        today_asia = asia_ranges.loc[prev_asia_dates[-1]]
        yest_asia  = asia_ranges.loc[prev_asia_dates[-2]]

        # Detect confluences
        today_fibs = project_fibs(today_asia)
        yest_fibs  = project_fibs(yest_asia)
        confluences = detect_confluences(today_fibs, yest_fibs, pip_size, config['confluence_pips'])

        # Filter + rate
        pivot_levels = compute_pivots(df_daily.iloc[:i])
        london_session = df_5m.between_time("08:00", "12:55").loc[str(date)]

        for conf in confluences:
            direction = 'LONG' if conf['price'] < london_session['close'].iloc[0] else 'SHORT'
            stars, tags = rate_confluence(conf, macro_bias, direction, pivot_levels, vol, pip_size)

            if stars < config['min_stars']:
                continue

            # Scan intraday bars for entry
            trade = scan_for_entry(
                bars      = london_session,
                level     = conf['price'],
                direction = direction,
                stop_dist = vol['stop_dist'],
                tp_mult   = vol['tp_mult'],
                stars     = stars,
                tags      = tags,
                date      = date,
            )
            if trade:
                trades.append(trade)

    return trades

def scan_for_entry(bars, level, direction, stop_dist, tp_mult, stars, tags, date):
    """Check if price touches a level and respects it during the session."""
    entry_price = None
    for idx, bar in bars.iterrows():
        touched = (
            (direction == 'LONG'  and bar['low']  <= level <= bar['high']) or
            (direction == 'SHORT' and bar['low']  <= level <= bar['high'])
        )
        if touched and entry_price is None:
            entry_price = level

        if entry_price is not None:
            sl = entry_price - stop_dist if direction == 'LONG' else entry_price + stop_dist
            tp = entry_price + stop_dist * tp_mult if direction == 'LONG' else entry_price - stop_dist * tp_mult

            if direction == 'LONG':
                if bar['low'] <= sl:
                    return {'entry': entry_price, 'sl': sl, 'tp': tp, 'outcome': 'LOSS',
                            'direction': direction, 'stars': stars, 'date': date, 'tags': tags}
                if bar['high'] >= tp:
                    return {'entry': entry_price, 'sl': sl, 'tp': tp, 'outcome': 'WIN',
                            'direction': direction, 'stars': stars, 'date': date, 'tags': tags}
            else:
                if bar['high'] >= sl:
                    return {'entry': entry_price, 'sl': sl, 'tp': tp, 'outcome': 'LOSS',
                            'direction': direction, 'stars': stars, 'date': date, 'tags': tags}
                if bar['low'] <= tp:
                    return {'entry': entry_price, 'sl': sl, 'tp': tp, 'outcome': 'WIN',
                            'direction': direction, 'stars': stars, 'date': date, 'tags': tags}

    # Session ended without resolution — count as missed/BE
    if entry_price is not None:
        return {'entry': entry_price, 'sl': sl, 'tp': tp, 'outcome': 'BE',
                'direction': direction, 'stars': stars, 'date': date, 'tags': tags}
    return None
```

---

## STEP 8 — RESULTS ANALYSIS

```python
import numpy as np

def analyse_results(trades):
    """
    Compute all strategy performance metrics.
    """
    if not trades:
        return {}

    df = pd.DataFrame(trades)
    total   = len(df)
    wins    = (df['outcome'] == 'WIN').sum()
    losses  = (df['outcome'] == 'LOSS').sum()
    bes     = (df['outcome'] == 'BE').sum()
    taken   = wins + losses + bes

    win_rate = wins / taken if taken > 0 else 0
    pf       = wins / losses if losses > 0 else float('inf')

    # Assume 1R per win, -1R per loss (BE = 0)
    pnl_r = df['outcome'].map({'WIN': 1.0, 'LOSS': -1.0, 'BE': 0.0})
    equity = pnl_r.cumsum()
    dd     = equity - equity.cummax()
    max_dd = dd.min()

    print(f"Total setups: {total} | Taken: {taken}")
    print(f"Win rate:     {win_rate:.1%} | Profit factor: {pf:.2f}")
    print(f"Max drawdown: {max_dd:.1f}R")
    print(f"Net result:   {pnl_r.sum():.1f}R over {(df['date'].max()-df['date'].min()).days} days")

    # By star rating
    print("\nBy star rating:")
    for stars in sorted(df['stars'].unique()):
        sub = df[df['stars'] == stars]
        sw = (sub['outcome']=='WIN').sum()
        sl = (sub['outcome']=='LOSS').sum()
        wr = sw/(sw+sl) if (sw+sl) > 0 else 0
        print(f"  {stars}★ : {len(sub)} setups | {wr:.1%} WR | PF {sw/sl:.2f}" if sl > 0 else f"  {stars}★ : {len(sub)} setups | {wr:.1%} WR")

    return {'win_rate': win_rate, 'profit_factor': pf, 'max_dd_r': max_dd, 'net_r': pnl_r.sum()}
```

---

## STEP 9 — WALK-FORWARD VALIDATION

This is the most important test. A strategy that only works on in-sample data is curve-fitted.

```python
def walk_forward(pair, df_5m, df_30m, df_daily, fred_df, config,
                 train_months=12, test_months=3):
    """
    Rolling walk-forward: train on N months, test on next M months.
    Repeat across full dataset. Ensures no look-ahead bias.
    """
    all_results = []
    start = df_daily.index[0]
    end   = df_daily.index[-1]
    cursor = start + pd.DateOffset(months=train_months)

    while cursor + pd.DateOffset(months=test_months) <= end:
        test_end = cursor + pd.DateOffset(months=test_months)

        # Run on test period only (params fixed from prior training)
        test_5m    = df_5m[cursor:test_end]
        test_30m   = df_30m[cursor:test_end]
        test_daily = df_daily[cursor:test_end]
        test_fred  = fred_df[cursor:test_end]

        trades = run_backtest(pair, test_5m, test_30m, test_daily, test_fred, config)
        metrics = analyse_results(trades)
        metrics['period'] = f"{cursor.date()} to {test_end.date()}"
        all_results.append(metrics)

        cursor += pd.DateOffset(months=test_months)

    return all_results
```

---

## STEP 10 — CONFIGURATION TO TEST

```python
# Base config — test each parameter independently first
BASE_CONFIG = {
    'pip_size':          {'EUR/USD': 0.0001, 'GBP/USD': 0.0001, 'USD/JPY': 0.01, 'AUD/USD': 0.0001, 'XAU/USD': 0.1},
    'confluence_pips':   5,       # proximity threshold for confluence detection
    'min_stars':         3,       # minimum star rating to trade
    'skip_extreme_vol':  True,    # skip HIGH vol regime sessions
    'session_filter':   'london', # 'london', 'london+ny', 'all'
    'rr_min':            1.5,     # minimum R:R required (tp_mult)
}

# Variants to test
VARIANTS = [
    {'min_stars': 2},
    {'min_stars': 3},  # base
    {'min_stars': 4},
    {'confluence_pips': 3},
    {'confluence_pips': 5},   # base
    {'confluence_pips': 8},
    {'skip_extreme_vol': False},
    {'session_filter': 'london+ny'},
]
```

---

## WHAT TO MEASURE AND WHY

| Metric | Target | Why |
|---|---|---|
| Win rate | > 45% | Below 45% is hard to sustain psychologically |
| Profit factor | > 1.5 | PF = wins/losses at 1R each. 1.5 = meaningful edge |
| Max drawdown (R) | < 10R | 10 consecutive losers is survivable at proper sizing |
| Net R / year | > 20R | ~20R/year at 1% risk = 20% annual on full account |
| Walk-forward consistency | WR within ±10% across periods | Stable edge, not curve-fitted |
| Star-WR correlation | Higher stars → higher WR | Validates the star model adds value |

---

## KEY RISKS AND BIASES TO AVOID

### Look-ahead bias
- FRED data must be lagged by 1 business day (it's released the following day)
- Monthly FRED series (foreign rates) must use the value from the END of the prior month, forward-filled
- "Today's" Asia range uses bars that closed before London open — no look-ahead
- Monday range: don't use Monday's range as a signal until Tuesday

### Survivorship bias
- Include all pairs, not just the ones that "worked"
- Test on pairs that were active the whole period (EUR/USD, GBP/USD safe; AUD/USD post-2020 fine)

### Overfitting
- Never optimise `min_stars` or `confluence_pips` on the same period you measure performance
- Use walk-forward: fix params on training period, measure on test period only
- Monte Carlo: shuffle trade sequence 1000× to test if WR is luck vs edge

### Transaction costs
- Add 1 pip spread on every entry and exit (FX retail typical)
- For gold, add $0.30 per oz spread
- This is critical — a strategy that only works without costs is not tradeable

```python
# Add to entry/exit
SPREAD = {'EUR/USD': 0.0001, 'GBP/USD': 0.00012, 'USD/JPY': 0.01,
          'AUD/USD': 0.00012, 'XAU/USD': 0.30}

def adjust_for_spread(entry, sl, tp, direction, pair):
    s = SPREAD[pair]
    if direction == 'LONG':
        return entry + s, sl, tp - s   # buy at ask, close at bid
    else:
        return entry - s, sl, tp + s   # sell at bid, close at ask
```

---

## BUILD ORDER (recommended)

1. **Data pipeline** — fetch and cache Oanda 5m + FRED. Get clean DataFrames. This is 60% of the work.
2. **Session ranges** — replicate Asia + Monday body range extraction. Verify against dashboard output.
3. **Fib confluences** — replicate `detectConfluences()`. Verify prices match dashboard.
4. **Macro score (simplified)** — T1 (rate diff) + T2 (VIX) + T7 (momentum) only first. Add T3-T6 later.
5. **Vol regime** — EMA-ATR percentile. Simple and accurate.
6. **Star rating** — just tight/aligned/pivot for v1 (no OI).
7. **Main loop** — simulation with fixed 1:1.5 R:R, session filter, minimum stars.
8. **Results analysis** — win rate, PF, equity curve, by-star breakdown.
9. **Walk-forward** — validate edge is stable across time periods.
10. **Monte Carlo** — 1000 shuffles, confirm WR distribution is non-random.
11. **Add complexity** — ARMA signal, COT, vol impulse, Monday range stacking.

---

## NOTES FOR FUTURE IMPLEMENTATION

- **The dashboard is the reference implementation.** If a calculation in Python produces different results to what the dashboard shows for the same date, the dashboard is correct.
- **Body range vs wick range is critical.** Use `max(open, close)` and `min(open, close)` for the body. Not `high`/`low`.
- **Confluence threshold should be pip-based, not ATR-based**, for the backtest. ATR-based caps are for the live dashboard's proximity logic (OI, pivots), not for the core confluence detection.
- **Monday range is often the stronger signal.** It captures the weekly institutional flow. The Asia range is more for the daily session structure.
- **GBP/JPY behaves differently** — high vol, wider ranges. Test separately, use wider pip threshold.
- **Gold requires different confluence thresholds** — typically 3-8× the FX pip equivalent in dollar terms.
- **The minimum test period is 2 years.** 8 weeks (the original Phase 1) was insufficient — includes only ~30-40 trades, no statistical significance.

---

*This document is the blueprint. When building, the live dashboard files in `js/ranges.js`, `js/confluences.js`, `js/macro.js`, `js/vol.js` are the reference implementations. Mirror them exactly before adding backtest-specific logic.*
