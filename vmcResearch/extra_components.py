"""extra_components.py - the two Cipher B parts this repo never implemented.

RSI AS A LEVEL
  The yellow line. It was added late (in div_structural.py) but only ever used
  to hunt divergences - never tested as a STATE, which is how it is mostly read.

SCHAFF TREND CYCLE
  A genuine Cipher B component, never implemented here at all. It is a double
  stochastic of the MACD, so it claims to be a faster, cleaner trend/turn read
  than either MACD or a plain stochastic.

THE TEST THAT MATTERS IS THE INCREMENTAL ONE
--------------------------------------------
Extension (distance from VWAP) and the New-York-close clock are now known to
dominate everything in this study. A new feature that merely correlates with
those will look predictive and add nothing. So each component is measured
twice:

  RAW         P(reversal) across the feature's own range
  INCREMENTAL the same, computed INSIDE extension x clock buckets

Only the second number tells you whether to put it on the chart.

  python vmcResearch/extra_components.py --instruments xauusd,eurusd
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')
HORIZON = 120
TREND_W = 60
K_SIGMA = 2.0


def ema(v, n):
    return pd.Series(v).ewm(span=n, adjust=False).mean().to_numpy()


def rsi(close, period=14):
    c = np.asarray(close, float)
    d = np.diff(c, prepend=c[0])
    ru = pd.Series(np.where(d > 0, d, 0.0)).ewm(alpha=1.0 / period, adjust=False).mean().to_numpy()
    rd = pd.Series(np.where(d < 0, -d, 0.0)).ewm(alpha=1.0 / period, adjust=False).mean().to_numpy()
    with np.errstate(divide='ignore', invalid='ignore'):
        rs = np.where(rd > 0, ru / rd, np.inf)
    out = 100.0 - 100.0 / (1.0 + rs)
    out[~np.isfinite(out)] = 50.0
    return out


def _stoch(v, n):
    s = pd.Series(v)
    lo = s.rolling(n, min_periods=n).min().to_numpy()
    hi = s.rolling(n, min_periods=n).max().to_numpy()
    rng = hi - lo
    with np.errstate(divide='ignore', invalid='ignore'):
        return np.where(rng > 1e-12, (v - lo) / rng * 100.0, np.nan)


def schaff_trend_cycle(close, fast=23, slow=50, cycle=10, smooth=3):
    """Doug Schaff's STC: a double stochastic of the MACD. Range 0-100.

    macd -> %K1 -> smoothed %D1 -> %K2 of that -> smoothed = STC.
    Fully causal; the leading bars are NaN rather than guessed.
    """
    c = np.asarray(close, float)
    macd = ema(c, fast) - ema(c, slow)
    k1 = _stoch(macd, cycle)
    d1 = ema(np.nan_to_num(k1, nan=50.0), smooth)
    k2 = _stoch(d1, cycle)
    stc = np.array(ema(np.nan_to_num(k2, nan=50.0), smooth), dtype=float, copy=True)
    stc[:slow + cycle * 2] = np.nan
    return stc


def barrier_reversal(p, k=K_SIGMA, horizon=HORIZON, chunk=120_000):
    c = p['close'].to_numpy(float)
    h = p['high'].to_numpy(float)
    l = p['low'].to_numpy(float)
    s = p['sigma_price'].to_numpy(float)
    n = c.size
    prior = np.full(n, np.nan)
    prior[TREND_W:] = (c[TREND_W:] - c[:-TREND_W]) / (s[TREND_W:] * np.sqrt(TREND_W))
    td = np.sign(np.nan_to_num(prior))
    td[np.abs(prior) < 0.5] = 0

    out = np.full(n, np.nan)
    up_b, dn_b = c + k * s, c - k * s
    big = horizon + 1
    for lo in range(0, n, chunk):
        hi = min(lo + chunk, n - horizon)
        if hi <= lo:
            break
        sh = np.lib.stride_tricks.sliding_window_view(h[lo + 1:hi + horizon], horizon)
        sl = np.lib.stride_tricks.sliding_window_view(l[lo + 1:hi + horizon], horizon)
        u = sh >= up_b[lo:hi, None]
        d = sl <= dn_b[lo:hi, None]
        fu = np.where(u.any(axis=1), u.argmax(axis=1), big)
        fd = np.where(d.any(axis=1), d.argmax(axis=1), big)
        t = td[lo:hi]
        w = np.where(t > 0, fu, fd)
        a = np.where(t > 0, fd, fu)
        r = np.full(hi - lo, np.nan)
        r[a < w] = 1.0
        r[w < a] = 0.0
        r[(w >= big) & (a >= big)] = np.nan
        r[t == 0] = np.nan
        out[lo:hi] = r
    return out, td


def report(inst):
    p = pd.read_parquet(os.path.join(DATA, 'fast_%s.parquet' % inst),
                        columns=['close', 'high', 'low', 'sigma_price', 'tf1_vwap_dist'])
    y, td = barrier_reversal(p)
    c = p['close'].to_numpy(float)

    feats = {'RSI (yellow line)': rsi(c), 'Schaff Trend Cycle': schaff_trend_cycle(c)}
    ext = np.abs(p['tf1_vwap_dist'].to_numpy(float))
    ny = p.index.tz_convert('America/New_York').hour.to_numpy()
    late = (ny >= 16) & (ny < 19)

    ok = np.isfinite(y) & np.isfinite(ext)
    base = float(np.nanmean(y[ok]))
    print('\n%s   base P(reversal) = %.4f   n = %s' % (inst.upper(), base, format(int(ok.sum()), ',')))

    for nm, v in feats.items():
        m = ok & np.isfinite(v)
        q = pd.qcut(pd.Series(v[m]), 5, labels=False, duplicates='drop').to_numpy()
        yy = y[m]
        raw = [float(yy[q == i].mean()) for i in range(q.max() + 1)]
        print('\n  %s' % nm)
        print('    RAW P(reversal) by quintile:      %s' % '  '.join('%.4f' % r for r in raw))
        print('    spread low->high quintile:        %+.4f' % (raw[-1] - raw[0]))

        # Incremental: same spread, but computed inside extension x clock cells.
        e = ext[m]
        eq = pd.qcut(pd.Series(e), 3, labels=False, duplicates='drop').to_numpy()
        lt = late[m]
        spreads = []
        for ei in range(eq.max() + 1):
            for li in (False, True):
                cell = (eq == ei) & (lt == li)
                if cell.sum() < 3000:
                    continue
                qq = pd.qcut(pd.Series(v[m][cell]), 5, labels=False, duplicates='drop').to_numpy()
                yc = yy[cell]
                if qq.max() < 4:
                    continue
                spreads.append(float(yc[qq == qq.max()].mean() - yc[qq == 0].mean()))
        if spreads:
            print('    INCREMENTAL spread inside extension x clock cells:')
            print('      %s' % '  '.join('%+.4f' % s for s in spreads))
            print('      mean %+.4f   cells positive %d/%d'
                  % (np.mean(spreads), int(np.sum(np.array(spreads) > 0)), len(spreads)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--instruments', default='xauusd,eurusd')
    a = ap.parse_args()
    for i in [s.strip() for s in a.instruments.split(',') if s.strip()]:
        f = os.path.join(DATA, 'fast_%s.parquet' % i)
        if os.path.exists(f):
            report(i)
        else:
            print('  [%s] no fast panel' % i)


if __name__ == '__main__':
    main()
