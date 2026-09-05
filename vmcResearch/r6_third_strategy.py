"""r6_third_strategy.py - resolve R6's contradiction with a THIRD, maximally distinct strategy.

THE CONTRADICTION THIS EXISTS TO RESOLVE
  Strategy A (vol-forecast fade): extension predicts MAE/stop-out, z~5, CONFIRMS.
  Strategy B (ConfluenceBot zone engine): stop-out FALLS with extension, z=-3.61,
  REVERSES. One confirms, one flips sign - "instrument-independent risk state"
  is not established from two data points, and the two disagree.

WHY A BREAKOUT ENTRY
  A and B are both, in a sense, LOCATION strategies - A enters at a fixed
  distance from the day's open, B enters at fib/GP zones that themselves
  cluster near where price has been extended. A plain N-bar range breakout is
  MOMENTUM, not mean-reversion or level-confluence, and its entry condition
  (close beyond the prior K-bar extreme) makes no reference to VWAP, a fib
  ratio, or a session open. If extension still predicts MAE here, the
  transfer is not an artefact of "entries near stretched price" — it holds
  across a genuinely different entry mechanism.

  Entry: close breaks the prior K-bar high (long) or low (short).
  Stop:  fixed ATR multiple (mechanically simple, no relation to VWAP).
  Exit:  first touch of stop or a symmetric ATR target, else time-out.

This is a STAGE-1-ONLY test (does extension predict MAE), matching what R6
actually needs - profitability of the breakout itself is not the question.
"""
from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')

INSTRUMENTS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdcad', 'usdchf',
              'eurjpy', 'gbpjpy', 'xauusd', 'nq']
K = 48          # prior bars defining the range (48 x M1... no - see below)
STOP_ATR = 1.5
TARGET_ATR = 1.5
MAX_HOLD = 240
REARM = 60


def _atr(h, l, c, n=60):
    pc = np.concatenate([[c[0]], c[:-1]])
    tr = np.maximum(h - l, np.maximum(np.abs(h - pc), np.abs(l - pc)))
    return pd.Series(tr).ewm(alpha=1.0 / n, adjust=False).mean().to_numpy()


def _ext(h, l, c, v, a, window=60):
    tp = (h + l + c) / 3.0
    vv = np.ones_like(tp) if v is None else v
    num = pd.Series(tp * vv).rolling(window, min_periods=window // 4).sum().to_numpy()
    den = pd.Series(vv).rolling(window, min_periods=window // 4).sum().to_numpy()
    with np.errstate(divide='ignore', invalid='ignore'):
        vw = np.where(den > 0, num / den, np.nan)
        return (c - vw) / a


def breakout_trades(m1, k=K, stop_atr=STOP_ATR, target_atr=TARGET_ATR):
    h = m1['high'].to_numpy(float)
    l = m1['low'].to_numpy(float)
    c = m1['close'].to_numpy(float)
    v = m1['volume'].to_numpy(float) if 'volume' in m1.columns else None
    a = _atr(h, l, c)
    e = _ext(h, l, c, v, a)
    n = len(c)

    roll_hi = pd.Series(h).rolling(k, min_periods=k).max().shift(1).to_numpy()
    roll_lo = pd.Series(l).rolling(k, min_periods=k).min().shift(1).to_numpy()

    rows = []
    last = -10**9
    for i in range(k + 100, n - MAX_HOLD):
        if i - last < REARM or not np.isfinite(a[i]) or a[i] <= 0 or not np.isfinite(e[i]):
            continue
        long_ = c[i] > roll_hi[i]
        short_ = c[i] < roll_lo[i]
        if not (long_ or short_):
            continue
        side = 1 if long_ else -1
        entry = c[i]
        stop = entry - side * stop_atr * a[i]
        target = entry + side * target_atr * a[i]
        fh, fl = h[i + 1:i + MAX_HOLD], l[i + 1:i + MAX_HOLD]
        if side > 0:
            A = np.where(fh >= target)[0]
            B = np.where(fl <= stop)[0]
            mae = (entry - fl.min()) / a[i]
        else:
            A = np.where(fl <= target)[0]
            B = np.where(fh >= stop)[0]
            mae = (fh.max() - entry) / a[i]
        A_ = A[0] if A.size else 10**9
        B_ = B[0] if B.size else 10**9
        outcome = 'sl' if B_ < A_ else ('tp' if A_ < B_ else 'timeout')
        # Extension SIGNED toward the breakout direction (momentum framing:
        # positive = price already extended THE SAME WAY as the breakout).
        rows.append({'time': m1.index[i], 'side': side, 'ext_signed': float(e[i]) * side,
                     'mae_atr': float(mae), 'stopped': 1.0 if outcome == 'sl' else 0.0,
                     'outcome': outcome})
        last = i
    return pd.DataFrame(rows)


def block_z(a, b, n_reps=400):
    a, b = np.asarray(a, float), np.asarray(b, float)
    a, b = a[np.isfinite(a)], b[np.isfinite(b)]
    if len(a) < 20 or len(b) < 20:
        return np.nan, np.nan
    rng = np.random.default_rng(0)
    na, nb = len(a), len(b)
    diffs = np.empty(n_reps)
    for i in range(n_reps):
        diffs[i] = a[rng.integers(0, na, na)].mean() - b[rng.integers(0, nb, nb)].mean()
    d0 = a.mean() - b.mean()
    return d0, d0 / diffs.std() if diffs.std() > 0 else np.nan


def main():
    from vmcResearch.panel import load_m1
    all_t = []
    for inst in INSTRUMENTS:
        try:
            m1 = load_m1(inst)
        except Exception:
            continue
        d = breakout_trades(m1)
        d['instrument'] = inst
        all_t.append(d)
        print('  [%s] %s breakout trades' % (inst, format(len(d), ',')), flush=True)
    t = pd.concat(all_t, ignore_index=True)
    t.to_parquet(os.path.join(DATA, 'r6_breakout_trades.parquet'))

    print('\n' + '=' * 82)
    print('R6 THIRD STRATEGY  -  N-bar range breakout (momentum, no VWAP/fib/session reference)')
    print('=' * 82)
    print('  total trades: %s\n' % format(len(t), ','))

    q = pd.qcut(t.ext_signed, 5, labels=False, duplicates='drop')
    print('  P(stopped out) and MAE by extension-toward-breakout quintile:')
    for k in range(int(q.max()) + 1):
        g = t[q == k]
        print('    Q%d  n=%6d  ext med %+6.2f  stop-out %.3f  MAE med %.2f'
              % (k + 1, len(g), g.ext_signed.median(), g.stopped.mean(), g.mae_atr.median()))

    lo, hi = t[q == 0], t[q == q.max()]
    dz_so, z_so = block_z(hi.stopped, lo.stopped)
    dz_mae, z_mae = block_z(hi.mae_atr, lo.mae_atr)
    print('\n  Q1->Q5 stop-out delta %+.4f (z=%.2f)   MAE delta %+.3f (z=%.2f)' % (dz_so, z_so, dz_mae, z_mae))

    print('\n  by instrument (sign of stop-out delta, Q5-Q1):')
    for inst, g in t.groupby('instrument'):
        qi = pd.qcut(g.ext_signed, 5, labels=False, duplicates='drop')
        lo_i, hi_i = g[qi == 0].stopped, g[qi == qi.max()].stopped
        if len(lo_i) < 30 or len(hi_i) < 30:
            continue
        print('    %-8s n=%6d  delta %+.4f' % (inst, len(g), hi_i.mean() - lo_i.mean()))

    print('\n  VERDICT:')
    if z_so > 3:
        print('  CONFIRMS on a third, mechanically unrelated strategy -> the risk-state claim strengthens.')
    elif z_so < -3:
        print('  REVERSES again -> two of three strategies now disagree with the vol-fade result;')
        print('  the vol-fade may be the outlier, not the zone engine.')
    else:
        print('  NULL on this strategy (|z|<3) -> extension->MAE may be specific to mean-reversion')
        print('  / fixed-distance entries, not a property of "trades near extended price" generally.')


if __name__ == '__main__':
    main()
