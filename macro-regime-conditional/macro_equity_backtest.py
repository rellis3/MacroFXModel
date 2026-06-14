#!/usr/bin/env python3
"""
Macro-Regime-Conditional Equity Strategy Backtester
=====================================================
Targets NQ (QQQ proxy) and SPX (SPY proxy) · 2005-present
Walk-forward validated · Full performance report with regime breakdown

Usage:
    python macro_equity_backtest.py --fred-key YOUR_KEY [--base-url http://localhost:3000]

FRED key: get one free at https://fred.stlouisfed.org/docs/api/api_key.html
"""

import sys
import os
import argparse
import json
import warnings
import urllib.request
from datetime import datetime

import numpy as np
import pandas as pd

# ─── DEPENDENCY BOOTSTRAP ────────────────────────────────────────────────────

def _ensure(pkg, import_as=None):
    import importlib
    try:
        importlib.import_module(import_as or pkg)
    except ImportError:
        import subprocess
        print(f"  Installing {pkg}…")
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', '--quiet', pkg])

_ensure('yfinance')
_ensure('fredapi')
_ensure('matplotlib')

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.gridspec import GridSpec
import yfinance as yf
from fredapi import Fred

warnings.filterwarnings('ignore')

# ═══════════════════════════════════════════════════════════════════════════════
#  CONSTANTS  —  all parameters live here
# ═══════════════════════════════════════════════════════════════════════════════

START_DATE = '2005-01-01'
END_DATE   = datetime.today().strftime('%Y-%m-%d')

# FRED series IDs
FRED_SERIES = {
    'walcl':     'WALCL',        # Fed balance sheet        (weekly)
    'wtregen':   'WTREGEN',      # Treasury General Account (weekly)
    'rrpo':      'RRPONTSYD',    # Reverse Repo             (daily)
    'curve':     'T10Y2Y',       # 10Y-2Y yield spread      (daily)
    'credit':    'BAMLH0A0HYM2', # HY credit spreads OAS    (daily)
    'ism':       'NAPM',         # ISM manufacturing PMI    (monthly)
    'real_yld':  'DFII10',       # 10Y TIPS real yield      (daily)
    'breakeven': 'T5YIE',        # 5Y breakeven inflation   (daily)
}

# yfinance tickers
YF_TICKERS = ['QQQ', 'SPY', 'TLT', 'GLD', '^VIX']

# Instruments to backtest
INSTRUMENTS = {
    'QQQ': 'Nasdaq-100 (QQQ)',
    'SPY': 'S&P 500 (SPY)',
}

# ── Signal weights ────────────────────────────────────────────────────────────
WEIGHTS = {
    'net_liq':    0.30,
    'curve':      0.20,
    'credit':     0.20,   # inverted (rising = bearish)
    'real_yield': 0.15,   # inverted (rising = bearish for growth)
    'ism':        0.15,
}

# ── Entry/exit thresholds ─────────────────────────────────────────────────────
LONG_THRESHOLD   = 0.5    # macro_score > this → LONG
FLAT_THRESHOLD   = -0.5   # macro_score < this → FLAT
VIX_Z_MAX_ENTRY  = 1.5   # block entry if vix_z exceeds this
VIX_Z_HIGH       = 1.0
VIX_Z_LOW        = -0.5

# ── Position sizing scalars by vol regime ─────────────────────────────────────
VOL_SCALAR = {'HIGH': 0.25, 'NORMAL': 0.75, 'LOW': 1.00}

# ── Transaction costs (applied per entry and per exit) ────────────────────────
COMMISSION  = 0.0010   # 0.10%
SLIPPAGE    = 0.0005   # 0.05%
COST_PER_RT = COMMISSION + SLIPPAGE

# ── Rolling z-score windows ───────────────────────────────────────────────────
Z_WINDOW      = 252   # 1 year
VIX_Z_WINDOW  = 60

# ── FRED publication lags (trading days applied after forward-fill) ────────────
WEEKLY_LAG  = 5    # weekly FRED → 1 week lag
MONTHLY_LAG = 21   # monthly FRED (ISM) → 1 month lag

# ── Walk-forward parameters ───────────────────────────────────────────────────
WF_TRAIN = 504   # 2 years of trading days
WF_TEST  = 63    # 3 months
WF_STEP  = 21    # 1 month step

# ── Risk-free rates ───────────────────────────────────────────────────────────
RF_PRE_2022  = 0.00
RF_POST_2022 = 0.03


# ═══════════════════════════════════════════════════════════════════════════════
#  UTILITIES
# ═══════════════════════════════════════════════════════════════════════════════

def rolling_zscore(s: pd.Series, window: int) -> pd.Series:
    """Causal rolling z-score — no lookahead bias."""
    mu  = s.rolling(window, min_periods=window // 2).mean()
    std = s.rolling(window, min_periods=window // 2).std()
    return (s - mu) / std.replace(0, np.nan)


def _rf_daily(index: pd.DatetimeIndex, freq: int = 252) -> pd.Series:
    """Daily risk-free rate as fraction of one period."""
    rf = pd.Series(RF_PRE_2022 / freq, index=index)
    rf[index >= '2022-01-01'] = RF_POST_2022 / freq
    return rf


def sharpe_ratio(returns: pd.Series, freq: int = 52) -> float:
    if len(returns) < 5 or returns.std() == 0:
        return np.nan
    rf = _rf_daily(returns.index, freq)
    excess = returns - rf
    return excess.mean() / excess.std() * np.sqrt(freq)


def sortino_ratio(returns: pd.Series, freq: int = 52) -> float:
    if len(returns) < 5:
        return np.nan
    rf = _rf_daily(returns.index, freq)
    excess = returns - rf
    downside = excess[excess < 0].std()
    return (excess.mean() / downside * np.sqrt(freq)) if downside > 0 else np.nan


def max_drawdown_stats(equity: pd.Series):
    """Returns (max_dd_fraction, max_dd_duration_days)."""
    roll_max = equity.cummax()
    dd = (equity - roll_max) / roll_max
    max_dd = dd.min()
    # Duration
    in_dd, start, durations = False, None, []
    for date, v in dd.items():
        if v < 0 and not in_dd:
            in_dd, start = True, date
        elif v >= 0 and in_dd:
            durations.append((date - start).days)
            in_dd = False
    if in_dd and start:
        durations.append((dd.index[-1] - start).days)
    return max_dd, (max(durations) if durations else 0)


def cagr(equity: pd.Series) -> float:
    years = (equity.index[-1] - equity.index[0]).days / 365.25
    return (equity.iloc[-1] / equity.iloc[0]) ** (1 / years) - 1 if years > 0 else np.nan


def compute_metrics(returns: pd.Series, equity: pd.Series, position: pd.Series) -> dict:
    if returns.empty:
        return {}
    _cagr          = cagr(equity)
    _sharpe        = sharpe_ratio(returns)
    _sortino       = sortino_ratio(returns)
    _max_dd, _dd_d = max_drawdown_stats(equity)
    _calmar        = _cagr / abs(_max_dd) if _max_dd != 0 else np.nan

    in_trade = position.abs() > 0.01
    if in_trade.any():
        tr = returns[in_trade]
        win_rate  = (tr > 0).mean()
        pf_num = tr[tr > 0].sum()
        pf_den = abs(tr[tr < 0].sum())
        profit_factor = pf_num / pf_den if pf_den > 0 else np.nan
    else:
        win_rate = profit_factor = np.nan

    pos_diff = position.diff().abs()
    total_trades = int((pos_diff > 0.05).sum())

    return {
        'CAGR':           _cagr,
        'Sharpe':         _sharpe,
        'Sortino':        _sortino,
        'Max_DD':         _max_dd,
        'Max_DD_Days':    _dd_d,
        'Win_Rate':       win_rate,
        'Profit_Factor':  profit_factor,
        'Total_Trades':   total_trades,
        'Time_In_Market': in_trade.mean(),
        'Calmar':         _calmar,
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  DATA FETCHING
# ═══════════════════════════════════════════════════════════════════════════════

def fetch_yfinance(start: str, end: str) -> pd.DataFrame:
    print(f"  yfinance: {', '.join(YF_TICKERS)}")
    raw = yf.download(YF_TICKERS, start=start, end=end, auto_adjust=True,
                      progress=False, timeout=30)
    # Normalise column MultiIndex
    if isinstance(raw.columns, pd.MultiIndex):
        raw.columns = ['_'.join(c).strip() for c in raw.columns]
    raw.index = pd.to_datetime(raw.index)
    return raw


def fetch_fred(api_key: str, start: str, end: str) -> pd.DataFrame:
    fred   = Fred(api_key=api_key)
    frames = {}
    for name, sid in FRED_SERIES.items():
        print(f"  FRED {sid}…", end=' ', flush=True)
        try:
            s = fred.get_series(sid, observation_start=start, observation_end=end)
            frames[name] = pd.Series(s.values, index=pd.to_datetime(s.index), name=name)
            print(f'{len(s)} obs')
        except Exception as e:
            print(f'WARN: {e}')
            frames[name] = pd.Series(dtype=float, name=name)
    return pd.DataFrame(frames)


def build_dataset(yf_raw: pd.DataFrame, fred_raw: pd.DataFrame) -> pd.DataFrame:
    """Align all series on a business-day index; apply publication lags."""
    idx = pd.date_range(START_DATE, END_DATE, freq='B')

    # ── Extract price columns from yfinance ───────────────────────────────────
    cols = {}
    for ticker in ['QQQ', 'SPY', 'TLT', 'GLD']:
        for field in ['Close', 'Open']:
            col = f'{field}_{ticker}'
            if col in yf_raw.columns:
                cols[f'{ticker}_{field.lower()}'] = yf_raw[col]
    # VIX close
    for col_try in ['Close_^VIX', 'Close_VIX', '^VIX_close']:
        if col_try in yf_raw.columns:
            cols['VIX_close'] = yf_raw[col_try]
            break

    price_df = pd.DataFrame(cols)
    price_df.index = pd.to_datetime(price_df.index)

    # ── Reindex to business days and forward-fill ─────────────────────────────
    price_r = price_df.reindex(idx, method='ffill')
    fred_r  = fred_raw.reindex(idx, method='ffill')

    # ── Apply FRED publication lags ───────────────────────────────────────────
    # Weekly series: 5-day lag
    for col in ['walcl', 'wtregen', 'rrpo', 'curve', 'credit', 'real_yld', 'breakeven']:
        if col in fred_r.columns:
            fred_r[col] = fred_r[col].shift(WEEKLY_LAG)
    # Monthly series: 21-day lag
    if 'ism' in fred_r.columns:
        fred_r['ism'] = fred_r['ism'].shift(MONTHLY_LAG)

    df = pd.concat([price_r, fred_r], axis=1)
    df = df.dropna(subset=['QQQ_close', 'SPY_close'])
    return df


# ═══════════════════════════════════════════════════════════════════════════════
#  RAW SIGNAL CONSTRUCTION  (before normalisation)
# ═══════════════════════════════════════════════════════════════════════════════

def build_raw_features(df: pd.DataFrame) -> pd.DataFrame:
    """Compute un-normalised features. No z-scores here — just transforms."""
    r = pd.DataFrame(index=df.index)
    r['net_liq_change'] = (df['walcl'] - df['wtregen'] - df['rrpo']).pct_change(21)
    r['curve']          = df['curve']
    r['credit_change']  = df['credit'].diff(21)
    r['real_yield']     = df['real_yld']
    r['ism']            = df['ism']
    r['vix']            = df['VIX_close']
    # Carry net_liq level for regime breakdown
    r['net_liq']        = df['walcl'] - df['wtregen'] - df['rrpo']
    return r


# ═══════════════════════════════════════════════════════════════════════════════
#  SIGNAL NORMALISATION — two flavours
# ═══════════════════════════════════════════════════════════════════════════════

def normalise_rolling(raw: pd.DataFrame) -> pd.DataFrame:
    """
    Causal rolling z-scores for the main backtest.
    Uses only data available up to each point in time.
    """
    s = pd.DataFrame(index=raw.index)
    s['net_liq_z']    = rolling_zscore(raw['net_liq_change'], Z_WINDOW)
    s['curve_z']      = rolling_zscore(raw['curve'],          Z_WINDOW)
    s['credit_z']     = rolling_zscore(raw['credit_change'],  Z_WINDOW)
    s['real_yield_z'] = rolling_zscore(raw['real_yield'],     Z_WINDOW)
    s['ism_z']        = rolling_zscore(raw['ism'],            Z_WINDOW)
    s['macro_score'] = (
        s['net_liq_z']       * WEIGHTS['net_liq']    +
        s['curve_z']         * WEIGHTS['curve']       +
        (-s['credit_z'])     * WEIGHTS['credit']      +
        (-s['real_yield_z']) * WEIGHTS['real_yield']  +
        s['ism_z']           * WEIGHTS['ism']
    )
    vix = raw['vix']
    s['vix_z']     = (vix - vix.rolling(VIX_Z_WINDOW).mean()) / vix.rolling(VIX_Z_WINDOW).std()
    s['vol_regime'] = 'NORMAL'
    s.loc[s['vix_z'] > VIX_Z_HIGH, 'vol_regime'] = 'HIGH'
    s.loc[s['vix_z'] < VIX_Z_LOW,  'vol_regime'] = 'LOW'
    s['vol_scalar'] = s['vol_regime'].map(VOL_SCALAR)
    return s


def normalise_fixed(raw: pd.DataFrame, train_mask: pd.Index) -> pd.DataFrame:
    """
    Fixed training-window z-scores for walk-forward.
    Computes mean/std on training data only; applies to entire window.
    This prevents lookahead leaking future stats into signal generation.
    """
    feature_map = {
        'net_liq_change': 'net_liq_z',
        'curve':          'curve_z',
        'credit_change':  'credit_z',
        'real_yield':     'real_yield_z',
        'ism':            'ism_z',
    }
    s = pd.DataFrame(index=raw.index)
    for raw_col, z_col in feature_map.items():
        tr = raw.loc[raw.index.isin(train_mask), raw_col].dropna()
        mu, std = tr.mean(), tr.std()
        s[z_col] = (raw[raw_col] - mu) / (std if std > 0 else 1.0)

    s['macro_score'] = (
        s['net_liq_z']       * WEIGHTS['net_liq']    +
        s['curve_z']         * WEIGHTS['curve']       +
        (-s['credit_z'])     * WEIGHTS['credit']      +
        (-s['real_yield_z']) * WEIGHTS['real_yield']  +
        s['ism_z']           * WEIGHTS['ism']
    )
    vix = raw['vix']
    tr_vix = vix[raw.index.isin(train_mask)].dropna()
    vix_mu, vix_std = tr_vix.mean(), tr_vix.std()
    s['vix_z']      = (vix - vix_mu) / (vix_std if vix_std > 0 else 1.0)
    s['vol_regime'] = 'NORMAL'
    s.loc[s['vix_z'] > VIX_Z_HIGH, 'vol_regime'] = 'HIGH'
    s.loc[s['vix_z'] < VIX_Z_LOW,  'vol_regime'] = 'LOW'
    s['vol_scalar'] = s['vol_regime'].map(VOL_SCALAR)
    return s


# ═══════════════════════════════════════════════════════════════════════════════
#  WEEKLY RESAMPLING
# ═══════════════════════════════════════════════════════════════════════════════

def build_weekly(df: pd.DataFrame, sig: pd.DataFrame, ticker: str) -> pd.DataFrame:
    """
    Resample daily data to weekly frequency (week ending Friday).
    Return = (Friday close - Monday open) / Monday open
    Signal from Friday t → position held week t+1.
    """
    close = df[f'{ticker}_close']
    open_ = df[f'{ticker}_open']

    comb = sig[['macro_score', 'vix_z', 'vol_scalar', 'vol_regime']].copy()
    comb['close'] = close
    comb['open']  = open_
    # Carry for regime breakdown
    for col in ['net_liq_z', 'curve_z', 'credit_z']:
        if col in sig.columns:
            comb[col] = sig[col]

    wk = pd.DataFrame({
        'fri_close':   comb['close'].resample('W-FRI').last(),
        'mon_open':    comb['open'].resample('W-FRI').first(),
        'macro_score': comb['macro_score'].resample('W-FRI').last(),
        'vix_z':       comb['vix_z'].resample('W-FRI').last(),
        'vol_scalar':  comb['vol_scalar'].resample('W-FRI').last(),
        'vol_regime':  comb['vol_regime'].resample('W-FRI').last(),
    })
    for col in ['net_liq_z', 'curve_z']:
        if col in comb.columns:
            wk[col] = comb[col].resample('W-FRI').last()

    wk = wk.dropna(subset=['fri_close', 'mon_open', 'macro_score', 'vol_scalar'])
    wk['wk_ret'] = (wk['fri_close'] - wk['mon_open']) / wk['mon_open']

    # Entry signal: long if macro_score > threshold AND vix not too high
    wk['raw_signal'] = 0.0
    wk.loc[wk['macro_score'] > LONG_THRESHOLD,  'raw_signal'] = 1.0
    wk.loc[wk['vix_z'] > VIX_Z_MAX_ENTRY,       'raw_signal'] = 0.0   # vol filter

    # Shift: Friday t signal → week t+1 position
    wk['position'] = (wk['raw_signal'] * wk['vol_scalar']).shift(1)

    return wk.dropna(subset=['position', 'wk_ret'])


# ═══════════════════════════════════════════════════════════════════════════════
#  BACKTESTING ENGINE
# ═══════════════════════════════════════════════════════════════════════════════

def run_backtest(df: pd.DataFrame, sig: pd.DataFrame, ticker: str) -> dict:
    """Vectorised weekly backtest. Returns equity, metrics, trade log."""
    wk = build_weekly(df, sig, ticker)

    # Transaction costs: charged when position changes
    cost = wk['position'].diff().abs() * COST_PER_RT
    cost.iloc[0] = 0  # no cost on first bar
    strat_ret = wk['position'] * wk['wk_ret'] - cost

    equity     = (1 + strat_ret).cumprod()
    bnh_ret    = wk['wk_ret']
    bnh_equity = (1 + bnh_ret).cumprod()

    m = compute_metrics(strat_ret, equity, wk['position'])

    # Build trade log (entry/exit pairs)
    trades = _build_trade_log(wk, ticker)

    return {
        'ticker':      ticker,
        'weekly':      wk,
        'strat_ret':   strat_ret,
        'equity':      equity,
        'bnh_ret':     bnh_ret,
        'bnh_equity':  bnh_equity,
        'metrics':     m,
        'trades':      trades,
    }


def _build_trade_log(wk: pd.DataFrame, ticker: str) -> list:
    """Identify entry/exit transitions and compute per-trade stats."""
    trades = []
    pos = wk['position']
    was_flat = True

    for i in range(len(wk)):
        row  = wk.iloc[i]
        date = wk.index[i]
        in_trade = row['position'] > 0.01

        if in_trade and was_flat:
            entry = {
                'entry_date':  date.strftime('%Y-%m-%d'),
                'ticker':      ticker,
                'direction':   'LONG',
                'entry_price': round(row['mon_open'], 4),
                'position_sz': round(row['position'], 4),
                'macro_score': round(row['macro_score'], 4),
                'vol_regime':  row['vol_regime'],
                '_entry_idx':  i,
            }
        elif not in_trade and not was_flat and trades.__class__ and 'entry' in dir():
            # Closed trade — fill exit details
            prev = wk.iloc[i - 1]
            entry['exit_date']  = wk.index[i - 1].strftime('%Y-%m-%d')
            entry['exit_price'] = round(prev['fri_close'], 4)
            entry['pnl_pct']    = round((prev['fri_close'] / entry['entry_price'] - 1) * 100, 4)
            del entry['_entry_idx']
            trades.append(entry)

        was_flat = not in_trade

    # Close any open trade at end of data
    if not was_flat and 'entry' in dir():
        last = wk.iloc[-1]
        entry['exit_date']  = wk.index[-1].strftime('%Y-%m-%d')
        entry['exit_price'] = round(last['fri_close'], 4)
        entry['pnl_pct']    = round((last['fri_close'] / entry['entry_price'] - 1) * 100, 4)
        if '_entry_idx' in entry:
            del entry['_entry_idx']
        trades.append(entry)

    return trades


# ═══════════════════════════════════════════════════════════════════════════════
#  WALK-FORWARD ENGINE
# ═══════════════════════════════════════════════════════════════════════════════

def run_walkforward(df: pd.DataFrame, raw: pd.DataFrame, ticker: str) -> dict:
    """
    Walk-forward validation with expanding training window.
    z-score params fit on training data only → applied to test data.
    Returns stitched OOS equity, window table, WFE.
    """
    dates = df.index.sort_values()
    n     = len(dates)

    window_rows = []
    oos_chunks  = []

    train_end = WF_TRAIN

    while train_end + WF_TEST <= n:
        train_start = max(0, train_end - WF_TRAIN)
        test_end    = train_end + WF_TEST

        train_idx = dates[train_start:train_end]
        test_idx  = dates[train_end:test_end]
        all_idx   = dates[train_start:test_end]

        # Normalise using training stats only
        sig_fixed  = normalise_fixed(raw.loc[all_idx], train_idx)
        df_window  = df.loc[all_idx]

        wk = build_weekly(df_window, sig_fixed, ticker)
        if len(wk) < 8:
            train_end += WF_STEP
            continue

        train_cut = train_idx[-1]
        wk_is  = wk[wk.index <= train_cut]
        wk_oos = wk[wk.index >  train_cut]

        if wk_oos.empty:
            train_end += WF_STEP
            continue

        # IS Sharpe
        if len(wk_is) >= 5:
            cost_is = wk_is['position'].diff().abs() * COST_PER_RT
            ret_is  = wk_is['position'] * wk_is['wk_ret'] - cost_is.fillna(0)
            is_sh   = sharpe_ratio(ret_is)
        else:
            is_sh = np.nan

        # OOS Sharpe
        cost_oos = wk_oos['position'].diff().abs() * COST_PER_RT
        ret_oos  = wk_oos['position'] * wk_oos['wk_ret'] - cost_oos.fillna(0)
        oos_sh   = sharpe_ratio(ret_oos)
        oos_ret  = (1 + ret_oos).prod() - 1

        oos_chunks.append(ret_oos)

        window_rows.append({
            'train_start': train_idx[0].strftime('%Y-%m-%d'),
            'train_end':   train_idx[-1].strftime('%Y-%m-%d'),
            'test_start':  test_idx[0].strftime('%Y-%m-%d'),
            'test_end':    test_idx[-1].strftime('%Y-%m-%d'),
            'IS_Sharpe':   round(is_sh,  3) if not np.isnan(is_sh)  else 'N/A',
            'OOS_Sharpe':  round(oos_sh, 3) if not np.isnan(oos_sh) else 'N/A',
            'OOS_Return':  f"{oos_ret * 100:.2f}%",
        })

        train_end += WF_STEP

    if not oos_chunks:
        return {'window_table': [], 'oos_equity': pd.Series(dtype=float),
                'wfe': np.nan, 'mean_oos_sharpe': np.nan, 'mean_is_sharpe': np.nan}

    oos_all    = pd.concat(oos_chunks).sort_index()
    oos_equity = (1 + oos_all).cumprod()

    valid_is  = [r['IS_Sharpe']  for r in window_rows if r['IS_Sharpe']  != 'N/A']
    valid_oos = [r['OOS_Sharpe'] for r in window_rows if r['OOS_Sharpe'] != 'N/A']
    mean_is  = np.nanmean(valid_is)  if valid_is  else np.nan
    mean_oos = np.nanmean(valid_oos) if valid_oos else np.nan
    wfe      = mean_oos / mean_is if (mean_is and mean_is != 0) else np.nan

    return {
        'window_table':    window_rows,
        'oos_equity':      oos_equity,
        'oos_returns':     oos_all,
        'wfe':             wfe,
        'mean_oos_sharpe': mean_oos,
        'mean_is_sharpe':  mean_is,
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  REGIME BREAKDOWN
# ═══════════════════════════════════════════════════════════════════════════════

def regime_breakdown(wk: pd.DataFrame, strat_ret: pd.Series) -> dict:
    results = {}

    segments = {
        'Liquidity Positive': wk.get('net_liq_z', pd.Series()) > 0,
        'Liquidity Negative': wk.get('net_liq_z', pd.Series()) < 0,
        'VIX HIGH':           wk['vol_regime'] == 'HIGH',
        'VIX NORMAL':         wk['vol_regime'] == 'NORMAL',
        'VIX LOW':            wk['vol_regime'] == 'LOW',
        'Curve Normal (>0)':  wk.get('curve_z', pd.Series()) > 0,
        'Curve Inverted (<0)':wk.get('curve_z', pd.Series()) < 0,
    }

    for label, mask in segments.items():
        if not mask.any():
            continue
        r = strat_ret[mask]
        if len(r) < 5:
            continue
        eq = (1 + r).cumprod()
        results[label] = {
            'Weeks':     len(r),
            'Sharpe':    round(sharpe_ratio(r), 3),
            'Win_Rate':  f"{(r > 0).mean() * 100:.1f}%",
            'Total_Ret': f"{(eq.iloc[-1] - 1) * 100:.1f}%",
        }

    return results


# ═══════════════════════════════════════════════════════════════════════════════
#  CHARTING
# ═══════════════════════════════════════════════════════════════════════════════

def _dark_ax(ax, title):
    ax.set_facecolor('#161616')
    ax.set_title(title, color='#e0e0e0', fontsize=10, pad=6)
    ax.tick_params(colors='#888', labelsize=8)
    for spine in ax.spines.values():
        spine.set_edgecolor('#2a2a2a')
    ax.grid(True, color='#2a2a2a', linewidth=0.5, alpha=0.8)


def plot_results(bt_qqq, bt_spy, wf_qqq, wf_spy, out_dir: str):
    for name, bt, wf in [('QQQ', bt_qqq, wf_qqq), ('SPY', bt_spy, wf_spy)]:
        fig = plt.figure(figsize=(18, 13))
        fig.patch.set_facecolor('#0d0d0d')
        gs  = GridSpec(4, 1, figure=fig, hspace=0.42)
        axs = [fig.add_subplot(gs[i]) for i in range(4)]

        wk = bt['weekly']

        # ── Panel 1: Equity curve ────────────────────────────────────────────
        ax = axs[0]
        _dark_ax(ax, f'{name} — Strategy vs Buy & Hold Equity (log scale)')
        bt['equity'].plot(ax=ax,    color='#00d4aa', lw=1.8, label='Strategy')
        bt['bnh_equity'].plot(ax=ax, color='#5588ee', lw=1.0, label='Buy & Hold', alpha=0.75)
        ax.set_yscale('log')
        ax.set_ylabel('Equity (base=1)', color='#888', fontsize=8)
        ax.legend(facecolor='#1a1a1a', edgecolor='#333', labelcolor='#ddd', fontsize=8)

        # ── Panel 2: Drawdown ────────────────────────────────────────────────
        ax = axs[1]
        _dark_ax(ax, 'Drawdown (%)')
        dd_s = (bt['equity']     / bt['equity'].cummax()     - 1) * 100
        dd_b = (bt['bnh_equity'] / bt['bnh_equity'].cummax() - 1) * 100
        ax.fill_between(dd_s.index, dd_s, 0, color='#ff4040', alpha=0.55, label='Strategy DD')
        ax.fill_between(dd_b.index, dd_b, 0, color='#4466cc', alpha=0.30, label='B&H DD')
        ax.set_ylabel('%', color='#888', fontsize=8)
        ax.legend(facecolor='#1a1a1a', edgecolor='#333', labelcolor='#ddd', fontsize=8)

        # ── Panel 3: Macro score + in-market shading ─────────────────────────
        ax = axs[2]
        _dark_ax(ax, 'Macro Score — Green shading = In Market')
        ax.plot(wk.index, wk['macro_score'], color='#f0a000', lw=0.9, label='Macro Score')
        ax.axhline(LONG_THRESHOLD,  color='#00cc66', lw=0.8, ls='--', alpha=0.7,
                   label=f'Long threshold ({LONG_THRESHOLD})')
        ax.axhline(FLAT_THRESHOLD,  color='#cc3333', lw=0.8, ls='--', alpha=0.7,
                   label=f'Flat threshold ({FLAT_THRESHOLD})')
        # Shade in-market periods
        in_mkt = wk['position'] > 0.01
        prev, start_s = False, None
        for i, (date, v) in enumerate(in_mkt.items()):
            if v and not prev:
                start_s = date
            elif not v and prev and start_s:
                ax.axvspan(start_s, date, color='#00cc66', alpha=0.07)
                start_s = None
            prev = v
        if prev and start_s:
            ax.axvspan(start_s, wk.index[-1], color='#00cc66', alpha=0.07)
        ax.set_ylabel('Score', color='#888', fontsize=8)
        ax.legend(facecolor='#1a1a1a', edgecolor='#333', labelcolor='#ddd', fontsize=8)

        # ── Panel 4: OOS walk-forward equity ─────────────────────────────────
        ax = axs[3]
        _dark_ax(ax, f'Walk-Forward OOS Equity (stitched) — {name}')
        if not wf['oos_equity'].empty:
            wf['oos_equity'].plot(ax=ax, color='#a855f7', lw=1.6, label='OOS Equity')
            wfe = wf.get('wfe', np.nan)
            wfe_str = f"WFE: {wfe:.2f}" if not np.isnan(wfe) else "WFE: N/A"
            oos_sh  = wf.get('mean_oos_sharpe', np.nan)
            sh_str  = f"Mean OOS Sharpe: {oos_sh:.2f}" if not np.isnan(oos_sh) else ''
            ax.text(0.02, 0.90, f"{wfe_str}   {sh_str}",
                    transform=ax.transAxes, color='white', fontsize=9,
                    bbox=dict(facecolor='#1a1a1a', edgecolor='#444', boxstyle='round,pad=0.3'))
            ax.set_ylabel('Equity (base=1)', color='#888', fontsize=8)
            ax.legend(facecolor='#1a1a1a', edgecolor='#333', labelcolor='#ddd', fontsize=8)
        else:
            ax.text(0.5, 0.5, 'Insufficient data for walk-forward',
                    ha='center', va='center', color='#888', transform=ax.transAxes)

        fig.suptitle(
            f'Macro-Regime-Conditional Equity Strategy — {name}   '
            f'({START_DATE} → {END_DATE})',
            color='#e0e0e0', fontsize=13, y=1.01
        )
        outpath = os.path.join(out_dir, f'macro_equity_{name.lower()}.png')
        plt.savefig(outpath, dpi=150, bbox_inches='tight', facecolor=fig.get_facecolor())
        plt.close()
        print(f"  Saved: {outpath}")


# ═══════════════════════════════════════════════════════════════════════════════
#  PRINT REPORTS
# ═══════════════════════════════════════════════════════════════════════════════

def _f(v, pct=False):
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return 'N/A'
    if pct:
        return f"{v * 100:.2f}%"
    return f"{v:.3f}" if isinstance(v, float) else str(v)


def print_metrics_table(bt: dict):
    wk  = bt['weekly']
    m   = bt['metrics']
    bnh_m = compute_metrics(bt['bnh_ret'], bt['bnh_equity'],
                            pd.Series(1.0, index=wk.index))
    tkr = bt['ticker']

    print(f"\n{'─' * 68}")
    print(f"  {INSTRUMENTS[tkr]}  —  Strategy vs Buy & Hold")
    print(f"{'─' * 68}")
    print(f"  {'Metric':<26} {'Strategy':>16} {'Buy & Hold':>16}")
    print(f"{'─' * 68}")
    rows = [
        ('CAGR',             _f(m.get('CAGR'), pct=True),          _f(bnh_m.get('CAGR'), pct=True)),
        ('Sharpe Ratio',     _f(m.get('Sharpe')),                   _f(bnh_m.get('Sharpe'))),
        ('Sortino Ratio',    _f(m.get('Sortino')),                  _f(bnh_m.get('Sortino'))),
        ('Max Drawdown',     _f(m.get('Max_DD'), pct=True),         _f(bnh_m.get('Max_DD'), pct=True)),
        ('Max DD Duration',  str(m.get('Max_DD_Days', 'N/A')) + 'd', str(bnh_m.get('Max_DD_Days', 'N/A')) + 'd'),
        ('Win Rate',         _f(m.get('Win_Rate'), pct=True),       _f(bnh_m.get('Win_Rate'), pct=True)),
        ('Profit Factor',    _f(m.get('Profit_Factor')),            _f(bnh_m.get('Profit_Factor'))),
        ('Total Trades',     str(m.get('Total_Trades', 'N/A')),     str(bnh_m.get('Total_Trades', 'N/A'))),
        ('Time in Market',   _f(m.get('Time_In_Market'), pct=True), '100.00%'),
        ('Calmar Ratio',     _f(m.get('Calmar')),                   _f(bnh_m.get('Calmar'))),
    ]
    for name, sv, bv in rows:
        print(f"  {name:<26} {sv:>16} {bv:>16}")
    print(f"{'─' * 68}")


def print_wf_table(wf: dict, ticker: str):
    rows = wf.get('window_table', [])
    if not rows:
        print(f"\n  {ticker}: No walk-forward windows generated.")
        return
    print(f"\n{'─' * 94}")
    print(f"  {ticker} — Walk-Forward Windows  (showing last 20 of {len(rows)})")
    print(f"{'─' * 94}")
    print(f"  {'Train Start':<13} {'Train End':<13} {'Test Start':<13} {'Test End':<13}"
          f" {'IS Sharpe':>10} {'OOS Sharpe':>10} {'OOS Return':>10}")
    print(f"{'─' * 94}")
    for r in rows[-20:]:
        print(f"  {r['train_start']:<13} {r['train_end']:<13} {r['test_start']:<13} {r['test_end']:<13}"
              f" {str(r['IS_Sharpe']):>10} {str(r['OOS_Sharpe']):>10} {r['OOS_Return']:>10}")
    print(f"{'─' * 94}")
    print(f"  Walk-Forward Efficiency (WFE) = OOS/IS Sharpe : {_f(wf.get('wfe'))}")
    print(f"  Mean IS Sharpe  : {_f(wf.get('mean_is_sharpe'))}")
    print(f"  Mean OOS Sharpe : {_f(wf.get('mean_oos_sharpe'))}")


def print_regime_table(bt: dict):
    breakdown = regime_breakdown(bt['weekly'], bt['strat_ret'])
    print(f"\n{'─' * 78}")
    print(f"  {bt['ticker']} — Regime Breakdown")
    print(f"{'─' * 78}")
    print(f"  {'Regime':<28} {'Weeks':>7} {'Sharpe':>9} {'Win Rate':>10} {'Total Ret':>11}")
    print(f"{'─' * 78}")
    for label, m in breakdown.items():
        print(f"  {label:<28} {m['Weeks']:>7} {m['Sharpe']:>9} {m['Win_Rate']:>10} {m['Total_Ret']:>11}")
    print(f"{'─' * 78}")


def print_pass_fail(results: dict, wf_results: dict):
    print(f"\n{'═' * 68}")
    print(f"  PROOF-OF-CONCEPT VERDICT")
    print(f"{'═' * 68}")

    for ticker in INSTRUMENTS:
        bt = results[ticker]
        wf = wf_results[ticker]
        m  = bt['metrics']
        bnh_eq = bt['bnh_equity']
        bnh_wk = bt['weekly']
        bnh_m  = compute_metrics(bt['bnh_ret'], bnh_eq, pd.Series(1.0, index=bnh_wk.index))

        oos_sh  = wf.get('mean_oos_sharpe', np.nan)
        wfe     = wf.get('wfe', np.nan)
        strat_dd = m.get('Max_DD', np.nan)
        bnh_dd   = bnh_m.get('Max_DD', np.nan)

        print(f"\n  {INSTRUMENTS[ticker]}:")

        verdict = lambda v, hi, lo: 'PASS' if v >= hi else ('BORDERLINE' if v >= lo else 'FAIL')

        if not np.isnan(oos_sh):
            v = verdict(oos_sh, 0.5, 0.3)
            print(f"    OOS Sharpe      : {oos_sh:.3f}  →  {v}  (target ≥ 0.5)")
        else:
            print(f"    OOS Sharpe      : N/A")

        if not np.isnan(wfe):
            v = verdict(wfe, 0.5, 0.3)
            print(f"    WFE             : {wfe:.3f}  →  {v}  (target ≥ 0.5)")
        else:
            print(f"    WFE             : N/A")

        if not np.isnan(strat_dd) and not np.isnan(bnh_dd):
            better = abs(strat_dd) < abs(bnh_dd)
            print(f"    Max Drawdown    : {strat_dd*100:.1f}% vs B&H {bnh_dd*100:.1f}%  →  "
                  f"{'PASS — lower DD' if better else 'FAIL — DD not reduced'}")

    print(f"\n{'═' * 68}\n")


# ═══════════════════════════════════════════════════════════════════════════════
#  SERVER INTEGRATION — push results & trades to dashboard
# ═══════════════════════════════════════════════════════════════════════════════

def _post(url: str, data: dict, label: str):
    try:
        payload = json.dumps(data, default=str).encode()
        req = urllib.request.Request(
            url, data=payload,
            headers={'Content-Type': 'application/json'}, method='POST'
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            print(f"  {label}: {r.status} OK")
    except Exception as e:
        print(f"  Warning — could not push {label}: {e}")


def push_to_server(base_url: str, results: dict, wf_results: dict):
    base = base_url.rstrip('/')

    # Trade log (all tickers combined)
    all_trades = []
    for ticker in INSTRUMENTS:
        all_trades.extend(results[ticker].get('trades', []))
    _post(f"{base}/api/macro-equity-backtest/trades",
          {'trades': all_trades, 'savedAt': datetime.now().isoformat()},
          'trades')

    # Metrics summary
    summary = {}
    for ticker in INSTRUMENTS:
        m  = results[ticker]['metrics']
        wf = wf_results[ticker]
        summary[ticker] = {
            'metrics':        {k: (None if isinstance(v, float) and np.isnan(v) else v)
                               for k, v in m.items()},
            'wfe':            None if (isinstance(wf.get('wfe'), float) and np.isnan(wf.get('wfe'))) else wf.get('wfe'),
            'mean_oos_sharpe':None if (isinstance(wf.get('mean_oos_sharpe'), float) and np.isnan(wf.get('mean_oos_sharpe'))) else wf.get('mean_oos_sharpe'),
            'n_windows':      len(wf.get('window_table', [])),
        }
    summary['run_at'] = datetime.now().isoformat()
    _post(f"{base}/api/macro-equity-backtest/results", summary, 'results summary')


# ═══════════════════════════════════════════════════════════════════════════════
#  CONFIG LOADER (reads from dashboard KV when base_url is provided)
# ═══════════════════════════════════════════════════════════════════════════════

def load_config_from_server(base_url: str) -> dict:
    """Fetch macro_equity_config from KV via the dashboard server."""
    try:
        url  = f"{base_url.rstrip('/')}/api/kv/get?key=macro_equity_config"
        with urllib.request.urlopen(url, timeout=10) as r:
            return json.loads(r.read()).get('value') or {}
    except Exception:
        return {}


# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description='Macro-Regime-Conditional Equity Backtester'
    )
    parser.add_argument('--fred-key', default=None,
                        help='FRED API key (or set FRED_KEY / FRED_API_KEY env var)')
    parser.add_argument('--base-url', default=None,
                        help='Dashboard server URL (e.g. http://localhost:3000) '
                             'to read config and push results')
    args = parser.parse_args()

    base_url = args.base_url or os.environ.get('DASHBOARD_URL')

    # Pull FRED key: CLI arg → FRED_KEY (Railway) → FRED_API_KEY → KV config → interactive prompt
    fred_key = args.fred_key or os.environ.get('FRED_KEY') or os.environ.get('FRED_API_KEY')
    if not fred_key and base_url:
        cfg = load_config_from_server(base_url)
        fred_key = cfg.get('fred_api_key')
    if not fred_key:
        fred_key = input(
            "Enter FRED API key (get one free at fred.stlouisfed.org/docs/api/api_key.html): "
        ).strip()
    if not fred_key:
        print("ERROR: FRED API key is required. Exiting.")
        sys.exit(1)

    out_dir = os.path.dirname(os.path.abspath(__file__))

    # ── 1. Fetch data ──────────────────────────────────────────────────────────
    print(f"\n[1/6] Fetching market data ({START_DATE} → {END_DATE}) …")
    yf_raw   = fetch_yfinance(START_DATE, END_DATE)
    fred_raw = fetch_fred(fred_key, START_DATE, END_DATE)

    # ── 2. Build aligned dataset ───────────────────────────────────────────────
    print("\n[2/6] Aligning & applying publication lags …")
    df = build_dataset(yf_raw, fred_raw)
    print(f"  Dataset: {len(df)} trading days  "
          f"({df.index[0].date()} → {df.index[-1].date()})")

    # ── 3. Build signals ───────────────────────────────────────────────────────
    print("\n[3/6] Building signals …")
    raw = build_raw_features(df)
    sig = normalise_rolling(raw)
    print(f"  Macro score range : {sig['macro_score'].min():.2f} → "
          f"{sig['macro_score'].max():.2f}")
    long_pct = (sig['macro_score'] > LONG_THRESHOLD).mean() * 100
    print(f"  Fraction of days above long threshold ({LONG_THRESHOLD}): {long_pct:.1f}%")

    # ── 4. Backtest ────────────────────────────────────────────────────────────
    print("\n[4/6] Running vectorised weekly backtest …")
    results = {}
    for ticker in INSTRUMENTS:
        print(f"  → {ticker}")
        results[ticker] = run_backtest(df, sig, ticker)

    # ── 5. Walk-forward ────────────────────────────────────────────────────────
    print(f"\n[5/6] Walk-forward validation "
          f"(train={WF_TRAIN}d / test={WF_TEST}d / step={WF_STEP}d) …")
    wf_results = {}
    for ticker in INSTRUMENTS:
        print(f"  → {ticker} …", end=' ', flush=True)
        wf_results[ticker] = run_walkforward(df, raw, ticker)
        n = len(wf_results[ticker].get('window_table', []))
        print(f"{n} windows")

    # ── 6. Report ──────────────────────────────────────────────────────────────
    print("\n[6/6] Generating reports …")
    print("\n" + "═" * 68)
    print("  MACRO-REGIME-CONDITIONAL EQUITY STRATEGY — FULL REPORT")
    print("═" * 68)

    for ticker in INSTRUMENTS:
        print_metrics_table(results[ticker])
    for ticker in INSTRUMENTS:
        print_wf_table(wf_results[ticker], ticker)
    for ticker in INSTRUMENTS:
        print_regime_table(results[ticker])
    print_pass_fail(results, wf_results)

    print("  Generating charts …")
    plot_results(results['QQQ'], results['SPY'], wf_results['QQQ'], wf_results['SPY'], out_dir)

    # ── 7. Push to dashboard ───────────────────────────────────────────────────
    if base_url:
        print(f"\n  Pushing results to {base_url} …")
        push_to_server(base_url, results, wf_results)

    print("\n  Done.\n")


if __name__ == '__main__':
    main()
