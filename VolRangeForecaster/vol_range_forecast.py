#!/usr/bin/env python3
"""
Quantitative Volatility & Range Forecaster

Produces per-session H-L range and O-C move forecasts for GOLD, EURUSD, NQ.

Methodology
-----------
Volatility
  EWMA(λ=0.94) on daily log close-to-close returns.
  σ²_t = λ·σ²_{t-1} + (1-λ)·r_t²
  One-step-ahead: σ_{t+1|t} already encoded in the last EWMA value.
  Annualise: σ_annual = σ_daily × √252

Range calibration
  For each of the trailing 2 years of daily bars, compute:
    H-L ratio  = (High − Low) / prior_close  /  σ_daily
    O-C ratio  = |Close − Open| / Open        /  σ_daily
  Store the 50th and 75th percentiles of those ratio distributions.

Forecast
  Apply calibrated percentile ratios to the one-step-ahead σ forecast.

Usage
-----
  python vol_range_forecast.py               # forecasts next trading day
  python vol_range_forecast.py 2026-06-02    # specific date
"""

import math
import sys
from datetime import datetime, timedelta, timezone
from typing import Optional

import numpy as np
import pandas as pd
import yfinance as yf


# ── Configuration ───────────────────────────────────────────────────────────────

TRADING_DAYS  = 252
EWMA_LAMBDA   = 0.94
CAL_WINDOW    = 504     # 2 years of daily bars for ratio calibration
FETCH_DAYS    = 620     # calendar days to fetch (covers weekends/holidays)

INSTRUMENTS = [
    {'name': 'GOLD',   'ticker': 'GC=F'},
    {'name': 'NQ',     'ticker': 'NQ=F'},
    {'name': 'EURUSD', 'ticker': 'EURUSD=X'},
    {'name': 'GBPUSD', 'ticker': 'GBPUSD=X'},
    {'name': 'USDJPY', 'ticker': 'USDJPY=X'},
    {'name': 'AUDUSD', 'ticker': 'AUDUSD=X'},
    {'name': 'NZDUSD', 'ticker': 'NZDUSD=X'},
    {'name': 'USDCAD', 'ticker': 'USDCAD=X'},
    {'name': 'USDCHF', 'ticker': 'USDCHF=X'},
    {'name': 'GBPJPY', 'ticker': 'GBPJPY=X'},
]

_LINE_WIDTH = 32        # width of the ──── NAME ──── header line


# ── Volatility model ────────────────────────────────────────────────────────────

def ewma_vol_series(log_returns: np.ndarray, lam: float = EWMA_LAMBDA) -> np.ndarray:
    """
    Vectorised EWMA daily σ series.
    Seeds the first variance value with the variance of the first 20 returns.
    Returns σ (not σ²) in the same units as log_returns.
    """
    n   = len(log_returns)
    var = np.empty(n)
    v   = np.var(log_returns[:min(20, n)])
    if v == 0:
        v = log_returns[0] ** 2 or 1e-8
    for i, r in enumerate(log_returns):
        v = lam * v + (1 - lam) * r * r
        var[i] = v
    return np.sqrt(var)


# ── Data fetching ───────────────────────────────────────────────────────────────

def _flatten(series_or_df) -> np.ndarray:
    """Coerce yfinance output (Series or single-col DataFrame) to a 1-D array."""
    if isinstance(series_or_df, pd.DataFrame):
        return series_or_df.iloc[:, 0].to_numpy(dtype=float)
    return series_or_df.to_numpy(dtype=float)


def fetch_ohlc(ticker: str) -> pd.DataFrame:
    end   = datetime.now(timezone.utc)
    start = end - timedelta(days=FETCH_DAYS)
    df = yf.download(
        ticker,
        start=start.strftime('%Y-%m-%d'),
        end=end.strftime('%Y-%m-%d'),
        auto_adjust=True,
        progress=False,
    )
    # Flatten multi-level columns produced by some yfinance versions
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    df = df.dropna(subset=['Close', 'Open', 'High', 'Low'])
    if len(df) < 60:
        raise ValueError(f'{ticker}: not enough data ({len(df)} rows)')
    return df


# ── Forecast engine ─────────────────────────────────────────────────────────────

def compute_forecast(df: pd.DataFrame) -> dict:
    """
    Compute one-step-ahead vol forecast and calibrated range percentiles.

    Returns a dict with keys (all values are percentages):
      vol_annual, hl_median, hl_75, oc_median, oc_75
    """
    close = _flatten(df['Close'])
    open_ = _flatten(df['Open'])
    high  = _flatten(df['High'])
    low   = _flatten(df['Low'])

    log_ret = np.log(close[1:] / close[:-1])   # length N-1

    # ── One-step-ahead σ forecast ─────────────────────────────────────────────
    # ewma_vol_series[-1] is σ_T (incorporates r_T), which IS the forecast for T+1
    sigma_fwd      = ewma_vol_series(log_ret)[-1]        # daily σ
    sigma_fwd_pct  = sigma_fwd * 100
    vol_annual_pct = sigma_fwd_pct * math.sqrt(TRADING_DAYS)

    # ── Calibration window ────────────────────────────────────────────────────
    # ret_cal[i] = return on bar i (using bars -(n_cal) to -(1))
    # OHLC arrays are shifted by 1 so prior-close aligns with each bar
    n_cal = min(CAL_WINDOW, len(log_ret))

    ret_cal    = log_ret[-n_cal:]
    sigma_cal  = ewma_vol_series(ret_cal) * 100          # daily σ in %

    # H-L as % of prior close  (standard Parkinson-style base)
    prior_close = close[-(n_cal + 1):-1]                 # length n_cal
    hl_pct      = (high[-n_cal:] - low[-n_cal:]) / prior_close * 100

    # |O-C| as % of open
    oc_pct = np.abs(close[-n_cal:] - open_[-n_cal:]) / open_[-n_cal:] * 100

    hl_ratio = hl_pct / sigma_cal
    oc_ratio = oc_pct / sigma_cal

    # Remove non-finite values (data gaps, zero-vol days)
    hl_ratio = hl_ratio[np.isfinite(hl_ratio) & (hl_ratio > 0)]
    oc_ratio = oc_ratio[np.isfinite(oc_ratio) & (oc_ratio > 0)]

    hl_med_r = float(np.percentile(hl_ratio, 50))
    hl_75_r  = float(np.percentile(hl_ratio, 75))
    oc_med_r = float(np.percentile(oc_ratio, 50))
    oc_75_r  = float(np.percentile(oc_ratio, 75))

    return {
        'vol_annual': vol_annual_pct,
        'hl_median':  hl_med_r * sigma_fwd_pct,
        'hl_75':      hl_75_r  * sigma_fwd_pct,
        'oc_median':  oc_med_r * sigma_fwd_pct,
        'oc_75':      oc_75_r  * sigma_fwd_pct,
    }


# ── Formatting ──────────────────────────────────────────────────────────────────

def _divider(name: str) -> str:
    prefix = f'──── {name} '
    return prefix + '─' * max(0, _LINE_WIDTH - len(prefix))


def format_report(session_label: str, results: list[dict]) -> str:
    lines = [
        '**VOL & RANGE FORECAST**',
        f'**For session: {session_label}**',
        '',
    ]
    for r in results:
        lines.append(_divider(r['name']))
        lines.append('')
        lines.append(f"Volatility (annualized) : {r['vol_annual']:.2f}%")
        lines.append(
            f"High to Low range       : {r['hl_median']:.2f}% median · "
            f"{r['hl_75']:.2f}% 75th Percentile"
        )
        lines.append(
            f"Open to Close move      : {r['oc_median']:.2f}% median · "
            f"{r['oc_75']:.2f}% 75th Percentile"
        )
        lines.append('')
    return '\n'.join(lines)


# ── Entry point ─────────────────────────────────────────────────────────────────

def next_trading_day(dt: datetime) -> datetime:
    """Advance to the next weekday (Mon–Fri)."""
    dt = dt + timedelta(days=1)
    while dt.weekday() >= 5:   # 5=Sat, 6=Sun
        dt += timedelta(days=1)
    return dt


def run_forecast(target_date: Optional[datetime] = None) -> str:
    if target_date is None:
        target_date = next_trading_day(datetime.now(timezone.utc))
    session_label = target_date.strftime('%A, %B %-d, %Y').upper()

    results = []
    for cfg in INSTRUMENTS:
        try:
            df = fetch_ohlc(cfg['ticker'])
            f  = compute_forecast(df)
            f['name'] = cfg['name']
            results.append(f)
        except Exception as exc:
            print(f"[WARN] {cfg['name']} ({cfg['ticker']}): {exc}", file=sys.stderr)

    if not results:
        return 'No data available — check network or ticker symbols.'

    return format_report(session_label, results)


if __name__ == '__main__':
    if len(sys.argv) > 1:
        dt = datetime.strptime(sys.argv[1], '%Y-%m-%d').replace(tzinfo=timezone.utc)
    else:
        dt = None
    print(run_forecast(dt))
