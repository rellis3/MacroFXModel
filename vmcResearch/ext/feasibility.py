"""feasibility.py - two experiments, run under the assumption the hypothesis is FALSE.

The objective is no longer to find a signal. It is to establish whether any
economically exploitable transition exists after a VWAP extension, and if not,
to close the question and keep extension only as a risk/descriptive variable.

EXPERIMENT A - THE ECONOMIC FEASIBILITY FRONTIER
  For every instrument x timeframe, plot cost against the gross edge, both in
  ATR. The claim to test is that above roughly spread/ATR = 0.15 nothing
  survives, regardless of signal. If that holds across a wide grid it is a
  gate-0 filter for any future strategy, and worth more than any indicator.

EXPERIMENT B - THE TRANSITION LATENCY TEST (the reframed Q20)
  Entry at "the extreme" is not implementable - the extreme is only known
  afterwards. The causal version is a TRAILING trigger: after extension crosses
  the threshold, track the running extreme and enter once price has retraced
  X ATR from it. Sweeping X answers the real question:

     is there a latency at which the expected move exceeds transaction costs,
     BEFORE the statistical edge decays?

  For each X we report gross, net, MFE, MAE and hit rate. If no X is net
  positive, the door is closed and that is a result.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

# Representative round-trip costs in PRICE units. FX majors ~0.6-0.9 pip,
# crosses wider, gold $0.25, index CFDs ~1 point.
SPREADS = {
    'eurusd': 0.00006, 'gbpusd': 0.00009, 'usdjpy': 0.007, 'audusd': 0.00007,
    'usdcad': 0.00008, 'usdchf': 0.00008, 'eurjpy': 0.010, 'gbpjpy': 0.014,
    'audjpy': 0.010, 'eurgbp': 0.00008, 'xauusd': 0.25, 'nq': 1.0,
    'spx500': 0.5, 'us30': 2.0, 'de30': 1.0, 'uk100': 1.0,
}
TIMEFRAMES = (1, 5, 15, 30, 60)
THR = 2.5
FWD = 240


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


def _events(e, thr, rearm=120):
    ae = np.abs(e)
    prev = np.concatenate([[np.nan], ae[:-1]])
    idx = np.where((ae >= thr) & (prev < thr) & np.isfinite(prev))[0]
    out, last = [], -10**9
    for i in idx:
        if i - last >= rearm:
            out.append(i)
            last = i
    return np.array(out, dtype=int)


def prep(p):
    h = p['high'].to_numpy(float)
    l = p['low'].to_numpy(float)
    c = p['close'].to_numpy(float)
    v = p['volume'].to_numpy(float) if 'volume' in p.columns else None
    a = _atr(h, l, c)
    return h, l, c, a, _ext(h, l, c, v, a)


def gross_edge(p, thr=THR, target=0.75, stop=1.0, fwd=FWD):
    """Gross expectancy in ATR of the best-known geometry, no costs."""
    h, l, c, a, e = prep(p)
    n = len(c)
    pnl = []
    for i in _events(e, thr):
        end = min(i + fwd, n - 1)
        if end <= i + 5 or not np.isfinite(e[i]) or not np.isfinite(a[i]) or a[i] <= 0:
            continue
        side = 1 if e[i] > 0 else -1
        e0 = abs(e[i])
        tgt = c[i] - side * target * e0 * a[i]
        stp = c[i] + side * stop * a[i]
        fh, fl = h[i + 1:end + 1], l[i + 1:end + 1]
        if side > 0:
            A = np.where(fl <= tgt)[0]
            B = np.where(fh >= stp)[0]
        else:
            A = np.where(fh >= tgt)[0]
            B = np.where(fl <= stp)[0]
        A = A[0] if A.size else 10**9
        B = B[0] if B.size else 10**9
        pnl.append(target * e0 if A < B else (-stop if B < A else (c[i] - c[end]) * side / a[i]))
    if len(pnl) < 200:
        return None
    pnl = np.array(pnl)
    return {'n': len(pnl), 'gross': float(pnl.mean()), 'atr': float(np.nanmedian(a))}


def latency_sweep(p, spread_px, thr=THR, waits=(0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.75, 1.0),
                  fwd=FWD, hold=120):
    """Enter after price retraces `w` ATR from the RUNNING extreme - causal.

    Reports, for each latency, what the trade looks like from that entry:
    gross, net of spread, MFE, MAE and hit rate. This is the real optimisation
    problem: the earliest point at which expected move beats cost, before the
    edge decays.
    """
    h, l, c, a, e = prep(p)
    n = len(c)
    sp_atr = spread_px / float(np.nanmedian(a))
    rows = []
    for w in waits:
        g, mfe, mae, hits = [], [], [], []
        for i in _events(e, thr):
            end = min(i + fwd, n - 1)
            if end <= i + 20 or not np.isfinite(e[i]) or not np.isfinite(a[i]) or a[i] <= 0:
                continue
            side = 1 if e[i] > 0 else -1
            # Walk forward tracking the running extreme ON CLOSES, and enter
            # when a CLOSE has retraced w ATR from it.
            #
            # An earlier version tracked the extreme against each bar's intrabar
            # low/high. On 1m bars the high-low range is ~1 ATR by construction,
            # so even a 1.0 ATR "wait" fired on the first bar - every latency
            # produced an identical sample (n was the same at every w, the tell)
            # and the sweep varied nothing. Closes are also what you could act on.
            ext_px = c[i]
            entry = None
            for j in range(i + 1, end):
                if (c[j] - ext_px) * side > 0:
                    ext_px = c[j]
                if (ext_px - c[j]) * side >= w * a[i]:
                    entry = j
                    break
            if entry is None:
                continue
            k = min(entry + hold, n - 1)
            if k <= entry + 2:
                continue
            fh, fl = h[entry + 1:k + 1], l[entry + 1:k + 1]
            ep = c[entry]
            # Fade direction: short if extended above.
            fav = (ep - fl.min()) / a[i] if side > 0 else (fh.max() - ep) / a[i]
            adv = (fh.max() - ep) / a[i] if side > 0 else (ep - fl.min()) / a[i]
            ret = (ep - c[k]) * side / a[i]
            g.append(ret)
            mfe.append(fav)
            mae.append(adv)
            hits.append(1.0 if ret > 0 else 0.0)
        if len(g) < 200:
            continue
        g = np.array(g)
        rows.append({'wait_atr': w, 'n': len(g), 'gross': g.mean(),
                     'net': g.mean() - sp_atr, 'mfe': np.mean(mfe), 'mae': np.mean(mae),
                     'hit': np.mean(hits), 'sp_atr': sp_atr})
    return pd.DataFrame(rows)
