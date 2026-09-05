"""panel.py - build the multi-timeframe VuManChu panel.

One row per M5 bar. Columns are:

  tf{N}_*   VuManChu state on the N-minute timeframe, causally step-held onto
            the M5 grid by bar CLOSE (never by bar start - forward-filling a
            4H oscillator onto M5 rows by start time leaks up to 3h59m of
            future into every row and makes any MTF result spectacular for
            purely mechanical reasons).
  fwd_*     forward outcomes. These look into the future ON PURPOSE; they are
            labels and are the only columns permitted to. Nothing that is fed
            to a model may come from here.

Base grid is M5 and the stack is 5 -> 15 -> 60 -> 240, which is the brief's
4H -> 1H -> 15M -> 5M read from the bottom up.

  python vmcResearch/panel.py --instruments eurusd,gbpusd,usdjpy,audusd,xauusd,nq
"""
from __future__ import annotations

import argparse
import os
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pylego.indicators.vumanchu import align_htf_causal  # noqa: E402
from vmcResearch.vmcfeat import divergence, tf_state  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
M1_DIRS = [os.path.join(ROOT, 'VolRangeForecaster', 'data', 'm1'),
           os.path.join(ROOT, 'portfolioBacktest', 'cache')]
OUT_DIR = os.path.join(HERE, 'data')

BASE_TF = 5
TIMEFRAMES = (5, 15, 60, 240)
# Forward horizons in BASE bars: 5m, 15m, 25m, 50m, 100m, 4h, 24h.
HORIZONS = (1, 3, 5, 10, 20, 48, 288)
# Horizons that also get path statistics (MFE/MAE/time-to-MFE).
PATH_HORIZONS = (5, 10, 20, 48)
# The rolling-VWAP window is in BARS, so it means a different span per
# timeframe. That is the point: it is what makes the VWAP column carry
# timeframe-specific information instead of restating the same series 4x.
VWAP_WINDOW = 20


def m1_path(instrument):
    for d in M1_DIRS:
        p = os.path.join(d, instrument + '_m1.parquet')
        if os.path.exists(p):
            return p
    raise FileNotFoundError('no M1 parquet for ' + instrument)


def load_m1(instrument):
    df = pd.read_parquet(m1_path(instrument))
    if not isinstance(df.index, pd.DatetimeIndex):
        for c in ('datetime', 'time', 'timestamp'):
            if c in df.columns:
                df = df.set_index(pd.to_datetime(df[c], utc=True))
                break
    df = df[~df.index.duplicated(keep='last')].sort_index()
    if df.index.tz is None:
        df.index = df.index.tz_localize('UTC')
    return df


def resample(m1, minutes):
    """OHLCV to `minutes`. Bins are left-labelled/left-closed, so the label is
    the bar's START and its close time is label + minutes."""
    if minutes == 1:
        return m1
    agg = {'open': 'first', 'high': 'max', 'low': 'min', 'close': 'last'}
    if 'volume' in m1.columns:
        agg['volume'] = 'sum'
    out = m1.resample(str(minutes) + 'min', label='left', closed='left').agg(agg)
    return out.dropna(subset=['open', 'high', 'low', 'close'])


def _fwd_extreme(a, h, how):
    """max/min of a[i+1 .. i+h], via a reversed rolling window (cheap in RAM)."""
    rev = pd.Series(a[::-1])
    roll = rev.rolling(h, min_periods=h)
    s = (roll.max() if how == 'max' else roll.min()).to_numpy()[::-1]
    out = np.full(a.size, np.nan)
    out[:-1] = s[1:]
    return out


def _time_to_extreme(a, h, how, chunk=200000):
    """Bars until the forward extreme of a[i+1 .. i+h]. Chunked so the sliding
    window never materialises the whole array x h."""
    n = a.size
    out = np.full(n, np.nan, dtype=np.float32)
    for lo in range(0, n, chunk):
        hi = min(lo + chunk, n - h)
        if hi <= lo:
            break
        seg = np.lib.stride_tricks.sliding_window_view(a[lo + 1:hi + h], h)
        out[lo:hi] = (seg.argmax(axis=1) if how == 'max' else seg.argmin(axis=1)) + 1
    return out


def build(instrument, verbose=True):
    t0 = time.time()
    m1 = load_m1(instrument)
    if verbose:
        print('  M1 %s bars  %s -> %s' % (format(len(m1), ','), m1.index[0].date(), m1.index[-1].date()))

    base = resample(m1, BASE_TF)
    base_close_sec = (base.index.astype('int64') // 10**9 + BASE_TF * 60).to_numpy()
    panel = pd.DataFrame(index=base.index)
    for c in ('open', 'high', 'low', 'close'):
        panel[c] = base[c].to_numpy(float)

    for tf in TIMEFRAMES:
        bars = resample(m1, tf)
        st = tf_state(bars, vwap_window=VWAP_WINDOW)
        reg, hid = divergence(bars['close'].to_numpy(float),
                              st['wt1'].to_numpy(float), pivot_n=5)
        st['div_regular'] = reg
        st['div_hidden'] = hid
        slow_close_sec = (bars.index.astype('int64') // 10**9 + tf * 60).to_numpy()
        for col in st.columns:
            panel['tf%d_%s' % (tf, col)] = align_htf_causal(
                base_close_sec, slow_close_sec, st[col].to_numpy(float))
        if verbose:
            print('  tf%-4d %s bars -> %d cols' % (tf, format(len(bars), ','), len(st.columns)))

    # -- forward outcomes (labels only) --------------------------------------
    c = panel['close'].to_numpy(float)
    h_arr = panel['high'].to_numpy(float)
    l_arr = panel['low'].to_numpy(float)
    # One-bar price sigma on the base grid: the unit every outcome is quoted in,
    # so gold and EURCHF are on the same scale and a 2019 row and a 2020 row are
    # comparable despite the volatility regime.
    sig1 = (pd.Series(c).pct_change().rolling(500, min_periods=100).std().to_numpy() * c)
    panel['sigma_price'] = sig1

    fwd_cols = {}
    for h in HORIZONS:
        fwd = np.full(c.size, np.nan)
        fwd[:-h] = c[h:] / c[:-h] - 1.0
        fwd_cols['fwd_ret_%d' % h] = fwd
        with np.errstate(divide='ignore', invalid='ignore'):
            fwd_cols['fwd_sig_%d' % h] = np.where(sig1 > 0, fwd * c / (sig1 * np.sqrt(h)), np.nan)

    for h in PATH_HORIZONS:
        with np.errstate(divide='ignore', invalid='ignore'):
            fwd_cols['mfe_%d' % h] = np.where(sig1 > 0, (_fwd_extreme(h_arr, h, 'max') - c) / sig1, np.nan)
            fwd_cols['mae_%d' % h] = np.where(sig1 > 0, (_fwd_extreme(l_arr, h, 'min') - c) / sig1, np.nan)
        fwd_cols['t_mfe_%d' % h] = _time_to_extreme(h_arr, h, 'max')
        fwd_cols['t_mae_%d' % h] = _time_to_extreme(l_arr, h, 'min')
    panel = pd.concat([panel, pd.DataFrame(fwd_cols, index=panel.index)], axis=1)

    panel['hour'] = panel.index.hour.astype(np.int8)
    panel['dow'] = panel.index.dayofweek.astype(np.int8)

    for col in panel.columns:
        if panel[col].dtype == np.float64:
            panel[col] = panel[col].astype(np.float32)
    panel['instrument'] = instrument
    if verbose:
        print('  panel %s x %d in %.0fs' % (format(panel.shape[0], ','), panel.shape[1], time.time() - t0))
    return panel


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--instruments', default='eurusd')
    ap.add_argument('--out', default=OUT_DIR)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    for inst in [s.strip() for s in a.instruments.split(',') if s.strip()]:
        print('[' + inst + ']')
        p = build(inst)
        dest = os.path.join(a.out, 'panel_' + inst + '.parquet')
        p.to_parquet(dest, compression='zstd')
        print('  -> %s (%.0f MB)' % (dest, os.path.getsize(dest) / 1e6))


if __name__ == '__main__':
    main()
