#!/usr/bin/env python3
"""
VIX Vol-Carry Strategy Backtester  (P8)
=====================================================
Trades VIX exposure DIRECTLY — not as a regime filter for another asset.
Short VXX to harvest term-structure roll decay, gated by a Five-Lens-style
vol cone + term structure regime classifier, with a hard circuit breaker
for single-day VIX spikes (Volmageddon / COVID-crash protection).

Price data:  yfinance  (^VIX spot, ^VIX3M 3-month constant maturity, VXX)
No FRED / OANDA dependency — this script only needs yfinance.

Usage:
    python vix_vol_carry_backtest.py [--base-url http://localhost:3000]
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
_ensure('matplotlib')

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.gridspec import GridSpec
import yfinance as yf

warnings.filterwarnings('ignore')

# ═══════════════════════════════════════════════════════════════════════════════
#  CONSTANTS  —  all parameters live here
# ═══════════════════════════════════════════════════════════════════════════════

# VXX (iPath S&P 500 VIX Short-Term Futures ETN) launched 2009-01-30.
# Fetch VIX/VIX3M starting ~2 years earlier so the 252-day vol-cone window
# is already full by the time the tradable instrument's history begins.
SIGNAL_FETCH_START = '2007-01-01'
BACKTEST_START     = '2009-02-02'   # first full trading week after VXX inception
END_DATE            = datetime.today().strftime('%Y-%m-%d')

YF_VIX_TICKER   = '^VIX'     # CBOE spot VIX
YF_VIX3M_TICKER = '^VIX3M'   # 3-month constant-maturity VIX (term structure, Lens 3)
YF_VIX3M_FALLBACK = '^VXV'   # pre-2022 ticker name for the same series
YF_VXX_TICKER   = 'VXX'      # tradable short-vol-carry proxy (execution leg)

# ── Vol cone (Lens 4) — percentile rank of VIX vs its own trailing history ────
PCT_WINDOW        = 252   # 1 trading year
CALM_PCT_THRESH   = 0.50  # below 50th percentile  -> CALM
STRESSED_PCT_THRESH = 0.80  # at/above 80th percentile -> STRESSED (flat)

# ── Term structure (Lens 3) — VIX3M / VIX ratio ───────────────────────────────
CONTANGO_THRESHOLD = 1.00  # ratio > 1.0 = contango (normal); < 1.0 = backwardation (stress)

# ── Circuit breaker — single-day VIX spike (Volmageddon protection) ──────────
CIRCUIT_BREAKER_PCT = 0.20   # 1-day VIX % change above this forces an immediate flatten
CALM_DAY_THRESHOLD  = 0.05   # |1-day VIX % change| below this counts as a "calm" day
RE_ENTRY_CALM_DAYS  = 5      # consecutive calm days required before re-entry is allowed

# ── Position sizing by regime (short-only — never goes long VIX/VXX) ─────────
SIZE_CALM     = 1.00
SIZE_ELEVATED = 0.50
SIZE_STRESSED = 0.00

# ── Transaction costs + short-borrow drag ─────────────────────────────────────
COMMISSION         = 0.0010   # 0.10%
SLIPPAGE           = 0.0005   # 0.05%
COST_PER_RT         = COMMISSION + SLIPPAGE
BORROW_COST_ANNUAL  = 0.015   # 1.5%/yr stock-loan fee for the short VXX position

# ── Walk-forward parameters ───────────────────────────────────────────────────
WF_TRAIN = 504   # 2 years of trading days
WF_TEST  = 63    # 3 months
WF_STEP  = 21    # 1 month step

# ── Risk-free rates (for Sharpe/Sortino excess return) ────────────────────────
RF_PRE_2022  = 0.00
RF_POST_2022 = 0.03

# ── Named historical stress windows — the canonical short-vol tail-risk tests ─
STRESS_WINDOWS = {
    'Volmageddon (Feb 2018)':   ('2018-02-01', '2018-02-28'),
    'COVID Crash (Feb-Apr 2020)': ('2020-02-15', '2020-04-15'),
    '2022 Bear Market':         ('2022-01-01', '2022-12-31'),
}


# ═══════════════════════════════════════════════════════════════════════════════
#  UTILITIES
# ═══════════════════════════════════════════════════════════════════════════════

def rolling_percentile_rank(s: pd.Series, window: int) -> pd.Series:
    """
    Causal rolling percentile rank (0-1) of today's value within its own
    trailing window — the Five-Lens "Vol Cone" lens (Lens 4). Requires a full
    window (min_periods=window) so no rank is reported on a partial sample.
    """
    return s.rolling(window, min_periods=window).apply(
        lambda x: (x < x.iloc[-1]).mean(), raw=False
    )


def _rf_daily(index: pd.DatetimeIndex, freq: int = 252) -> pd.Series:
    rf = pd.Series(RF_PRE_2022 / freq, index=index)
    rf[index >= '2022-01-01'] = RF_POST_2022 / freq
    return rf


def sharpe_ratio(returns: pd.Series, freq: int = 252) -> float:
    if len(returns) < 5 or returns.std() == 0:
        return np.nan
    rf = _rf_daily(returns.index, freq)
    excess = returns - rf
    return excess.mean() / excess.std() * np.sqrt(freq)


def sortino_ratio(returns: pd.Series, freq: int = 252) -> float:
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

    worst_day = returns.min()

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
        'Worst_Day':      worst_day,
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  DATA FETCHING
# ═══════════════════════════════════════════════════════════════════════════════

def fetch_yf_close(ticker: str, start: str, end: str, fallback: str = None) -> pd.Series:
    """Fetch a single split/dividend-adjusted Close series from yfinance."""
    df = yf.download(ticker, start=start, end=end, auto_adjust=True, progress=False)
    if (df is None or df.empty) and fallback:
        print(f"  {ticker} unavailable, falling back to {fallback}…")
        df = yf.download(fallback, start=start, end=end, auto_adjust=True, progress=False)
    if df is None or df.empty:
        raise RuntimeError(f"No data returned for {ticker}")
    close = df['Close']
    if isinstance(close, pd.DataFrame):
        close = close.iloc[:, 0]
    close.index = pd.to_datetime(close.index).tz_localize(None)
    return close.rename(ticker.lstrip('^'))


# ═══════════════════════════════════════════════════════════════════════════════
#  DATASET + SIGNAL CONSTRUCTION
# ═══════════════════════════════════════════════════════════════════════════════

def build_dataset(vix: pd.Series, vix3m: pd.Series, vxx: pd.Series) -> pd.DataFrame:
    """Align all three series on a common daily index, forward-filled for gaps."""
    df = pd.concat([vix, vix3m, vxx], axis=1)
    df.columns = ['vix', 'vix3m', 'vxx']
    df = df.ffill().dropna(how='any')
    return df


def build_signals(df: pd.DataFrame) -> pd.DataFrame:
    """
    Five-Lens-style regime signal:
      Lens 4 (Vol Cone)      -> vix_pct: rolling percentile rank of spot VIX
      Lens 3 (Term Structure)-> term_ratio: VIX3M / VIX  (contango vs backwardation)
    Both are causal/rolling — no parameters are fit from a training sample,
    so there is nothing here that can be curve-fit to history.
    """
    out = df.copy()
    out['vix_pct']    = rolling_percentile_rank(out['vix'], PCT_WINDOW)
    out['term_ratio'] = out['vix3m'] / out['vix']
    out['contango']   = out['term_ratio'] > CONTANGO_THRESHOLD
    out['vix_chg_1d'] = out['vix'].pct_change()
    return out


def compute_regime(sig: pd.DataFrame) -> pd.DataFrame:
    """
    Sequential regime classifier. Must run as a loop: the circuit-breaker
    latch and re-entry counter are path-dependent (today's state depends on
    yesterday's state, not just today's data).

    Priority order: circuit breaker > insufficient history > backwardation
    > stressed vol cone > elevated vol cone > calm.
    """
    n = len(sig)
    regime      = [''] * n
    size_mult   = np.zeros(n)
    breaker_arr = np.zeros(n, dtype=bool)

    vix_pct  = sig['vix_pct'].to_numpy()
    contango = sig['contango'].to_numpy()
    chg      = sig['vix_chg_1d'].to_numpy()
    spike    = chg > CIRCUIT_BREAKER_PCT
    calm_day = np.abs(chg) < CALM_DAY_THRESHOLD

    breaker_on  = False
    calm_streak = 0

    for i in range(n):
        if spike[i]:
            breaker_on, calm_streak = True, 0
        elif breaker_on:
            calm_streak = calm_streak + 1 if calm_day[i] else 0
            if calm_streak >= RE_ENTRY_CALM_DAYS:
                breaker_on = False

        breaker_arr[i] = breaker_on

        if breaker_on:
            regime[i], size_mult[i] = 'CIRCUIT_BREAKER', 0.0
        elif np.isnan(vix_pct[i]):
            regime[i], size_mult[i] = 'WARMUP', 0.0
        elif not contango[i]:
            regime[i], size_mult[i] = 'BACKWARDATION', 0.0
        elif vix_pct[i] >= STRESSED_PCT_THRESH:
            regime[i], size_mult[i] = 'STRESSED', SIZE_STRESSED
        elif vix_pct[i] >= CALM_PCT_THRESH:
            regime[i], size_mult[i] = 'ELEVATED', SIZE_ELEVATED
        else:
            regime[i], size_mult[i] = 'CALM', SIZE_CALM

    out = sig.copy()
    out['regime']         = regime
    out['size_mult']      = size_mult
    out['breaker_active'] = breaker_arr
    return out


# ═══════════════════════════════════════════════════════════════════════════════
#  BACKTEST ENGINE
# ═══════════════════════════════════════════════════════════════════════════════

def run_backtest(reg: pd.DataFrame) -> dict:
    """
    Short-only execution: position = -size_mult, lagged one day (today's
    close-of-day regime drives tomorrow's return — no lookahead).
    Includes transaction costs on position changes plus a daily short-borrow
    drag proportional to gross exposure.
    """
    df = reg.loc[reg.index >= BACKTEST_START].copy()

    df['position'] = -df['size_mult'].shift(1).fillna(0.0)
    df['vxx_ret']  = df['vxx'].pct_change().fillna(0.0)

    gross_ret   = df['position'] * df['vxx_ret']
    trade_cost  = df['position'].diff().abs().fillna(0.0) * COST_PER_RT
    borrow_cost = df['position'].abs() * (BORROW_COST_ANNUAL / 252)
    strat_ret   = gross_ret - trade_cost - borrow_cost

    equity = (1 + strat_ret).cumprod()

    # Benchmarks
    naive_ret    = -df['vxx_ret'] - (BORROW_COST_ANNUAL / 252)
    naive_equity = (1 + naive_ret).cumprod()

    bh_ret    = df['vxx_ret']
    bh_equity = (1 + bh_ret).cumprod()

    m = compute_metrics(strat_ret, equity, df['position'])

    return {
        'daily':         df,
        'strat_ret':     strat_ret,
        'equity':        equity,
        'naive_ret':      naive_ret,
        'naive_equity':   naive_equity,
        'bh_ret':         bh_ret,
        'bh_equity':      bh_equity,
        'metrics':        m,
        'trades':         _build_trade_log(df),
    }


def _build_trade_log(df: pd.DataFrame) -> list:
    """Identify entry/exit transitions on the (short) position."""
    trades = []
    was_flat = True
    entry = None

    for i in range(len(df)):
        row, date = df.iloc[i], df.index[i]
        in_trade = abs(row['position']) > 0.01

        if in_trade and was_flat:
            entry = {
                'entry_date':  date.strftime('%Y-%m-%d'),
                'direction':   'SHORT',
                'entry_price': round(row['vxx'], 4),
                'position_sz': round(abs(row['position']), 4),
                'regime':      row['regime'],
                'vix_pct':     round(row['vix_pct'], 4) if not np.isnan(row['vix_pct']) else None,
            }
        elif not in_trade and not was_flat and entry is not None:
            prev = df.iloc[i - 1]
            entry['exit_date']  = df.index[i - 1].strftime('%Y-%m-%d')
            entry['exit_price'] = round(prev['vxx'], 4)
            entry['pnl_pct']    = round((1 - prev['vxx'] / entry['entry_price']) * 100, 4)
            trades.append(entry)
            entry = None

        was_flat = not in_trade

    if not was_flat and entry is not None:
        last = df.iloc[-1]
        entry['exit_date']  = df.index[-1].strftime('%Y-%m-%d')
        entry['exit_price'] = round(last['vxx'], 4)
        entry['pnl_pct']    = round((1 - last['vxx'] / entry['entry_price']) * 100, 4)
        trades.append(entry)

    return trades


# ═══════════════════════════════════════════════════════════════════════════════
#  WALK-FORWARD ENGINE
# ═══════════════════════════════════════════════════════════════════════════════

def run_walkforward(strat_ret: pd.Series) -> dict:
    """
    Walk-forward consistency check. Unlike the macro-equity model, the vol
    cone (percentile rank) and term-structure ratio used here are already
    point-in-time causal — there are no z-score or weight parameters fit on
    a training window. The circuit-breaker thresholds (20% spike, 5 calm
    days) are fixed structural risk limits, not optimised inputs.

    So this walk-forward does not re-fit anything; it re-segments the
    already-computed daily strategy returns into rolling train/test windows
    and reports OOS Sharpe consistency — i.e. it tests for regime stability,
    not parameter overfitting.
    """
    dates = strat_ret.index
    n = len(dates)

    window_rows = []
    oos_chunks  = []
    train_end = WF_TRAIN

    while train_end + WF_TEST <= n:
        train_start = max(0, train_end - WF_TRAIN)
        test_end    = train_end + WF_TEST

        ret_is  = strat_ret.iloc[train_start:train_end]
        ret_oos = strat_ret.iloc[train_end:test_end]

        is_sh  = sharpe_ratio(ret_is)
        oos_sh = sharpe_ratio(ret_oos)
        oos_total = (1 + ret_oos).prod() - 1

        oos_chunks.append(ret_oos)
        window_rows.append({
            'train_start': dates[train_start].strftime('%Y-%m-%d'),
            'train_end':   dates[train_end - 1].strftime('%Y-%m-%d'),
            'test_start':  dates[train_end].strftime('%Y-%m-%d'),
            'test_end':    dates[test_end - 1].strftime('%Y-%m-%d'),
            'IS_Sharpe':   round(is_sh,  3) if not np.isnan(is_sh)  else 'N/A',
            'OOS_Sharpe':  round(oos_sh, 3) if not np.isnan(oos_sh) else 'N/A',
            'OOS_Return':  f"{oos_total * 100:.2f}%",
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
#  REGIME BREAKDOWN  (incl. named historical tail-risk windows)
# ═══════════════════════════════════════════════════════════════════════════════

def regime_breakdown(df: pd.DataFrame, strat_ret: pd.Series) -> dict:
    results = {}
    segments = {
        'CALM':            df['regime'] == 'CALM',
        'ELEVATED':        df['regime'] == 'ELEVATED',
        'STRESSED':        df['regime'] == 'STRESSED',
        'BACKWARDATION':   df['regime'] == 'BACKWARDATION',
        'CIRCUIT_BREAKER': df['regime'] == 'CIRCUIT_BREAKER',
    }
    for label, mask in segments.items():
        mask = mask.reindex(strat_ret.index).fillna(False)
        if not mask.any():
            continue
        r = strat_ret[mask]
        if len(r) < 5:
            continue
        eq = (1 + r).cumprod()
        results[label] = {
            'Days':      len(r),
            'Sharpe':    round(sharpe_ratio(r), 3),
            'Win_Rate':  f"{(r > 0).mean() * 100:.1f}%",
            'Total_Ret': f"{(eq.iloc[-1] - 1) * 100:.1f}%",
        }
    return results


def stress_window_breakdown(strat_ret: pd.Series) -> dict:
    """Performance + worst single-day loss during the named historical tail events."""
    results = {}
    for label, (start, end) in STRESS_WINDOWS.items():
        r = strat_ret.loc[start:end]
        if r.empty:
            continue
        eq = (1 + r).cumprod()
        results[label] = {
            'Days':       len(r),
            'Total_Ret':  f"{(eq.iloc[-1] - 1) * 100:.1f}%",
            'Worst_Day':  f"{r.min() * 100:.1f}%",
            'Sharpe':     round(sharpe_ratio(r), 3) if len(r) >= 5 else 'N/A',
        }
    return results


# ═══════════════════════════════════════════════════════════════════════════════
#  CHARTING
# ═══════════════════════════════════════════════════════════════════════════════

REGIME_COLOR = {
    'CALM':            '#00cc66',
    'ELEVATED':        '#f0a000',
    'STRESSED':        '#cc3333',
    'BACKWARDATION':   '#a855f7',
    'CIRCUIT_BREAKER': '#ff00aa',
    'WARMUP':          '#444444',
}


def _dark_ax(ax, title):
    ax.set_facecolor('#161616')
    ax.set_title(title, color='#e0e0e0', fontsize=10, pad=6)
    ax.tick_params(colors='#888', labelsize=8)
    for spine in ax.spines.values():
        spine.set_edgecolor('#2a2a2a')
    ax.grid(True, color='#2a2a2a', linewidth=0.5, alpha=0.8)


def plot_results(bt: dict, wf: dict, out_dir: str):
    fig = plt.figure(figsize=(18, 13))
    fig.patch.set_facecolor('#0d0d0d')
    gs  = GridSpec(4, 1, figure=fig, hspace=0.42)
    axs = [fig.add_subplot(gs[i]) for i in range(4)]
    df  = bt['daily']

    # ── Panel 1: Equity curve ────────────────────────────────────────────────
    ax = axs[0]
    _dark_ax(ax, 'VIX Vol-Carry — Strategy vs Naive Always-Short vs Buy & Hold Long VXX (log scale)')
    bt['equity'].plot(ax=ax, color='#00d4aa', lw=1.8, label='Strategy (regime-filtered short)')
    bt['naive_equity'].plot(ax=ax, color='#f0a000', lw=1.0, ls='--', alpha=0.8, label='Naive Always-Short')
    bt['bh_equity'].plot(ax=ax, color='#5588ee', lw=0.8, alpha=0.6, label='Buy & Hold Long VXX')
    ax.set_yscale('log')
    ax.set_ylabel('Equity (base=1)', color='#888', fontsize=8)
    ax.legend(facecolor='#1a1a1a', edgecolor='#333', labelcolor='#ddd', fontsize=8)

    # ── Panel 2: Drawdown ────────────────────────────────────────────────────
    ax = axs[1]
    _dark_ax(ax, 'Drawdown (%) — Strategy vs Naive Always-Short')
    dd_s = (bt['equity'] / bt['equity'].cummax() - 1) * 100
    dd_n = (bt['naive_equity'] / bt['naive_equity'].cummax() - 1) * 100
    ax.fill_between(dd_s.index, dd_s, 0, color='#ff4040', alpha=0.55, label='Strategy DD')
    ax.fill_between(dd_n.index, dd_n, 0, color='#4466cc', alpha=0.25, label='Naive Short DD')
    ax.set_ylabel('%', color='#888', fontsize=8)
    ax.legend(facecolor='#1a1a1a', edgecolor='#333', labelcolor='#ddd', fontsize=8)

    # ── Panel 3: VIX with regime shading + circuit-breaker triggers ──────────
    ax = axs[2]
    _dark_ax(ax, 'VIX — Background shaded by regime · magenta marks = circuit breaker triggers')
    ax.plot(df.index, df['vix'], color='#e0e0e0', lw=0.9, label='VIX')
    prev_regime, start_s = None, None
    for date, regime in df['regime'].items():
        if regime != prev_regime:
            if prev_regime is not None and start_s is not None:
                ax.axvspan(start_s, date, color=REGIME_COLOR.get(prev_regime, '#333'), alpha=0.12)
            start_s, prev_regime = date, regime
    if prev_regime is not None and start_s is not None:
        ax.axvspan(start_s, df.index[-1], color=REGIME_COLOR.get(prev_regime, '#333'), alpha=0.12)
    spikes = df[df['vix_chg_1d'] > CIRCUIT_BREAKER_PCT]
    if not spikes.empty:
        ax.scatter(spikes.index, spikes['vix'], color='#ff00aa', s=18, zorder=5, label='Circuit breaker trigger')
    ax.set_ylabel('VIX', color='#888', fontsize=8)
    ax.legend(facecolor='#1a1a1a', edgecolor='#333', labelcolor='#ddd', fontsize=8)

    # ── Panel 4: OOS walk-forward equity ──────────────────────────────────────
    ax = axs[3]
    _dark_ax(ax, 'Walk-Forward OOS Equity (stitched)')
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
        f'VIX Vol-Carry Strategy (P8)   ({BACKTEST_START} → {END_DATE})',
        color='#e0e0e0', fontsize=13, y=1.01
    )
    outpath = os.path.join(out_dir, 'vix_vol_carry.png')
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
    m = bt['metrics']
    naive_m = compute_metrics(bt['naive_ret'], bt['naive_equity'],
                               pd.Series(1.0, index=bt['naive_ret'].index))

    print(f"\n{'─' * 68}")
    print(f"  VIX Vol-Carry — Strategy vs Naive Always-Short VXX")
    print(f"{'─' * 68}")
    print(f"  {'Metric':<26} {'Strategy':>16} {'Naive Short':>16}")
    print(f"{'─' * 68}")
    rows = [
        ('CAGR',             _f(m.get('CAGR'), pct=True),          _f(naive_m.get('CAGR'), pct=True)),
        ('Sharpe Ratio',     _f(m.get('Sharpe')),                   _f(naive_m.get('Sharpe'))),
        ('Sortino Ratio',    _f(m.get('Sortino')),                  _f(naive_m.get('Sortino'))),
        ('Max Drawdown',     _f(m.get('Max_DD'), pct=True),         _f(naive_m.get('Max_DD'), pct=True)),
        ('Max DD Duration',  str(m.get('Max_DD_Days', 'N/A')) + 'd', str(naive_m.get('Max_DD_Days', 'N/A')) + 'd'),
        ('Worst Single Day', _f(m.get('Worst_Day'), pct=True),      _f(naive_m.get('Worst_Day'), pct=True)),
        ('Win Rate',         _f(m.get('Win_Rate'), pct=True),       _f(naive_m.get('Win_Rate'), pct=True)),
        ('Profit Factor',    _f(m.get('Profit_Factor')),            _f(naive_m.get('Profit_Factor'))),
        ('Total Trades',     str(m.get('Total_Trades', 'N/A')),     '1 (always on)'),
        ('Time in Market',   _f(m.get('Time_In_Market'), pct=True), '100.00%'),
        ('Calmar Ratio',     _f(m.get('Calmar')),                   _f(naive_m.get('Calmar'))),
    ]
    for name, sv, nv in rows:
        print(f"  {name:<26} {sv:>16} {nv:>16}")
    print(f"{'─' * 68}")
    bh_total = (bt['bh_equity'].iloc[-1] - 1) * 100
    print(f"  Reference — Buy & Hold Long VXX total return: {bh_total:.1f}%  "
          f"(structural decay benchmark, not a fair comparison — long-only)")


def print_wf_table(wf: dict):
    rows = wf.get('window_table', [])
    if not rows:
        print(f"\n  No walk-forward windows generated.")
        return
    print(f"\n{'─' * 94}")
    print(f"  Walk-Forward Windows  (showing last 20 of {len(rows)})")
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
    breakdown = regime_breakdown(bt['daily'], bt['strat_ret'])
    print(f"\n{'─' * 78}")
    print(f"  Regime Breakdown")
    print(f"{'─' * 78}")
    print(f"  {'Regime':<20} {'Days':>7} {'Sharpe':>9} {'Win Rate':>10} {'Total Ret':>11}")
    print(f"{'─' * 78}")
    for label, m in breakdown.items():
        print(f"  {label:<20} {m['Days']:>7} {m['Sharpe']:>9} {m['Win_Rate']:>10} {m['Total_Ret']:>11}")
    print(f"{'─' * 78}")


def print_stress_table(bt: dict):
    breakdown = stress_window_breakdown(bt['strat_ret'])
    print(f"\n{'─' * 78}")
    print(f"  Named Historical Tail-Risk Windows — the real test for a short-vol system")
    print(f"{'─' * 78}")
    print(f"  {'Window':<28} {'Days':>6} {'Total Ret':>11} {'Worst Day':>11} {'Sharpe':>9}")
    print(f"{'─' * 78}")
    for label, m in breakdown.items():
        print(f"  {label:<28} {m['Days']:>6} {m['Total_Ret']:>11} {m['Worst_Day']:>11} {str(m['Sharpe']):>9}")
    print(f"{'─' * 78}")


def print_pass_fail(bt: dict, wf: dict):
    print(f"\n{'═' * 68}")
    print(f"  PROOF-OF-CONCEPT VERDICT — VIX Vol-Carry (P8)")
    print(f"{'═' * 68}")

    m = bt['metrics']
    naive_m = compute_metrics(bt['naive_ret'], bt['naive_equity'],
                               pd.Series(1.0, index=bt['naive_ret'].index))
    oos_sh = wf.get('mean_oos_sharpe', np.nan)
    wfe    = wf.get('wfe', np.nan)
    strat_dd, naive_dd = m.get('Max_DD', np.nan), naive_m.get('Max_DD', np.nan)

    verdict = lambda v, hi, lo: 'PASS' if v >= hi else ('BORDERLINE' if v >= lo else 'FAIL')

    if not np.isnan(oos_sh):
        v = verdict(oos_sh, 0.5, 0.3)
        print(f"  OOS Sharpe        : {oos_sh:.3f}  →  {v}  (target ≥ 0.5)")
    else:
        print(f"  OOS Sharpe        : N/A")

    if not np.isnan(wfe):
        v = verdict(wfe, 0.5, 0.3)
        print(f"  WFE               : {wfe:.3f}  →  {v}  (target ≥ 0.5)")
    else:
        print(f"  WFE               : N/A")

    if not np.isnan(strat_dd) and not np.isnan(naive_dd):
        better = abs(strat_dd) < abs(naive_dd)
        print(f"  Max Drawdown      : {strat_dd*100:.1f}% vs Naive Short {naive_dd*100:.1f}%  →  "
              f"{'PASS — regime filter reduces DD' if better else 'FAIL — filter adds no protection'}")

    for label, (start, end) in STRESS_WINDOWS.items():
        r = bt['strat_ret'].loc[start:end]
        if r.empty:
            continue
        worst = r.min()
        v = 'PASS' if worst > -0.50 else 'FAIL — catastrophic single-day loss'
        print(f"  {label:<28}: worst day {worst*100:.1f}%  →  {v}  (no >50% single-day loss)")

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


def push_to_server(base_url: str, bt: dict, wf: dict):
    base = base_url.rstrip('/')
    _post(f"{base}/api/vix-vol-carry-backtest/trades",
          {'trades': bt['trades'], 'savedAt': datetime.now().isoformat()}, 'trades')

    m = bt['metrics']
    summary = {
        'metrics':         {k: (None if isinstance(v, float) and np.isnan(v) else v) for k, v in m.items()},
        'wfe':             None if (isinstance(wf.get('wfe'), float) and np.isnan(wf.get('wfe'))) else wf.get('wfe'),
        'mean_oos_sharpe': None if (isinstance(wf.get('mean_oos_sharpe'), float) and np.isnan(wf.get('mean_oos_sharpe'))) else wf.get('mean_oos_sharpe'),
        'n_windows':       len(wf.get('window_table', [])),
        'run_at':          datetime.now().isoformat(),
    }
    _post(f"{base}/api/vix-vol-carry-backtest/results", summary, 'results summary')


# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description='VIX Vol-Carry Strategy Backtester (P8)')
    parser.add_argument('--base-url', default=None,
                        help='Dashboard server URL (e.g. http://localhost:3000) to push results')
    args = parser.parse_args()
    base_url = args.base_url or os.environ.get('DASHBOARD_URL')

    out_dir = os.path.dirname(os.path.abspath(__file__))

    print(f"\n[1/6] Fetching VIX / VIX3M / VXX ({SIGNAL_FETCH_START} → {END_DATE}) …")
    vix   = fetch_yf_close(YF_VIX_TICKER, SIGNAL_FETCH_START, END_DATE)
    vix3m = fetch_yf_close(YF_VIX3M_TICKER, SIGNAL_FETCH_START, END_DATE, fallback=YF_VIX3M_FALLBACK)
    vxx   = fetch_yf_close(YF_VXX_TICKER, SIGNAL_FETCH_START, END_DATE)

    print("\n[2/6] Aligning dataset …")
    df = build_dataset(vix, vix3m, vxx)
    print(f"  Dataset: {len(df)} trading days ({df.index[0].date()} → {df.index[-1].date()})")

    print("\n[3/6] Building Five-Lens regime signal (vol cone + term structure) …")
    sig = build_signals(df)
    reg = compute_regime(sig)
    regime_counts = reg.loc[reg.index >= BACKTEST_START, 'regime'].value_counts()
    print(f"  Regime day counts:\n{regime_counts.to_string()}")

    print("\n[4/6] Running daily backtest (short-only, lagged 1 day, no lookahead) …")
    bt = run_backtest(reg)

    print(f"\n[5/6] Walk-forward validation (train={WF_TRAIN}d / test={WF_TEST}d / step={WF_STEP}d) …")
    wf = run_walkforward(bt['strat_ret'])
    print(f"  {len(wf.get('window_table', []))} windows")

    print("\n[6/6] Generating reports …")
    print("\n" + "═" * 68)
    print("  VIX VOL-CARRY STRATEGY (P8) — FULL REPORT")
    print("═" * 68)
    print_metrics_table(bt)
    print_wf_table(wf)
    print_regime_table(bt)
    print_stress_table(bt)
    print_pass_fail(bt, wf)

    print("  Generating chart …")
    plot_results(bt, wf, out_dir)

    if base_url:
        print(f"\n  Pushing results to {base_url} …")
        push_to_server(base_url, bt, wf)

    print("\n  Done.\n")


if __name__ == '__main__':
    main()
