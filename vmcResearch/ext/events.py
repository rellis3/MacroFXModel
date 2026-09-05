"""ext/events.py - the extension-event foundation. Everything in phase 2 is measured off this.

THE EVENT
  Price crossing an extension threshold away from a VWAP, measured in ATR.
  Re-armed so one slow drift does not register as hundreds of events.

THE OUTCOME TAXONOMY (spec Q6)
  Collapsing everything into "reversal" is what limited the previous round, so
  outcomes are kept SEPARATE and ordered by how far price came back, expressed
  as a fraction of the extension that existed at the event:

    reversion_frac   max retrace toward VWAP, as a fraction of the extension
    touched_vwap     did it reach VWAP at all
    crossed_vwap     did it go through and out the other side by 0.25 ATR
    broke_swing      did it break the prior swing extreme (a real reversal)
    extended_further max additional extension away from VWAP first
    outcome_class    the ordered label built from the above

  These are deliberately not mutually exclusive at measurement time; the class
  is derived at the end so any of the raw quantities can be re-cut later
  without recomputing.

CAUSALITY
  Every feature is computed from data at or before the event bar. Only the
  outcome columns look forward. ATR, VWAPs, slope, velocity and swing size are
  all trailing.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

ATR_N = 60              # minutes
REARM = 120             # minutes before the same threshold can fire again
FWD = 240               # minutes to resolve the outcome
CROSS_EPS = 0.25        # ATR beyond VWAP to count as a genuine cross


def atr(high, low, close, n=ATR_N):
    h, l, c = np.asarray(high, float), np.asarray(low, float), np.asarray(close, float)
    pc = np.concatenate([[c[0]], c[:-1]])
    tr = np.maximum(h - l, np.maximum(np.abs(h - pc), np.abs(l - pc)))
    return pd.Series(tr).ewm(alpha=1.0 / n, adjust=False).mean().to_numpy()


def rolling_vwap(high, low, close, volume, window):
    tp = (np.asarray(high, float) + np.asarray(low, float) + np.asarray(close, float)) / 3.0
    v = np.ones_like(tp) if volume is None else np.asarray(volume, float)
    num = pd.Series(tp * v).rolling(window, min_periods=max(window // 4, 5)).sum().to_numpy()
    den = pd.Series(v).rolling(window, min_periods=max(window // 4, 5)).sum().to_numpy()
    with np.errstate(divide='ignore', invalid='ignore'):
        return np.where(den > 0, num / den, np.nan)


def anchored_vwap(index, high, low, close, volume, anchor_hour_utc):
    """VWAP re-anchored each day at `anchor_hour_utc` - session VWAP.

    Cumulative sums are reset at the anchor rather than computed globally, so
    the value at any bar uses only that session's own bars.
    """
    tp = (np.asarray(high, float) + np.asarray(low, float) + np.asarray(close, float)) / 3.0
    v = np.ones_like(tp) if volume is None else np.asarray(volume, float)
    h = index.hour.to_numpy()
    d = index.normalize().asi8
    # A new session starts at the first bar of the anchor hour each day.
    newsess = (h == anchor_hour_utc) & ((np.concatenate([[True], h[:-1] != anchor_hour_utc])) |
                                        (np.concatenate([[True], d[:-1] != d[1:]])))
    grp = np.cumsum(newsess)
    tpv = pd.Series(tp * v).groupby(grp).cumsum().to_numpy()
    cv = pd.Series(v).groupby(grp).cumsum().to_numpy()
    with np.errstate(divide='ignore', invalid='ignore'):
        out = np.where(cv > 0, tpv / cv, np.nan)
    # Before the first anchor of the sample there is no session yet.
    out[grp == 0] = np.nan
    return out


def swing_magnitude(close, atr_v, window=60):
    """Size of the move that produced the current position, in ATR."""
    c = np.asarray(close, float)
    hi = pd.Series(c).rolling(window, min_periods=window).max().to_numpy()
    lo = pd.Series(c).rolling(window, min_periods=window).min().to_numpy()
    with np.errstate(divide='ignore', invalid='ignore'):
        return (hi - lo) / atr_v


def build_features(p):
    """All causal context for an extension event."""
    h = p['high'].to_numpy(float)
    l = p['low'].to_numpy(float)
    c = p['close'].to_numpy(float)
    v = p['volume'].to_numpy(float) if 'volume' in p.columns else None
    a = atr(h, l, c)

    f = {'atr': a}
    # Q9: several VWAP definitions, compared later rather than chosen now.
    vwaps = {
        'roll60': rolling_vwap(h, l, c, v, 60),
        'roll240': rolling_vwap(h, l, c, v, 240),
        'sess_asia': anchored_vwap(p.index, h, l, c, v, 0),
        'sess_lon': anchored_vwap(p.index, h, l, c, v, 7),
        'sess_ny': anchored_vwap(p.index, h, l, c, v, 13),
    }
    for nm, vw in vwaps.items():
        with np.errstate(divide='ignore', invalid='ignore'):
            f['ext_' + nm] = (c - vw) / a
        f['vwap_' + nm] = vw

    # Q3: VWAP slope and its change, in ATR per hour.
    for nm in vwaps:
        vw = vwaps[nm]
        sl = np.full(len(c), np.nan)
        sl[60:] = (vw[60:] - vw[:-60]) / a[60:]
        f['slope_' + nm] = sl
        acc = np.full(len(c), np.nan)
        acc[60:] = sl[60:] - sl[:-60]
        f['slopechg_' + nm] = acc

    f['swing_atr'] = swing_magnitude(c, a, 60)
    f['swing_atr_240'] = swing_magnitude(c, a, 240)
    f['ny_hour'] = p.index.tz_convert('America/New_York').hour.to_numpy()
    # Q11: volatility regime, known at the time - a trailing rank of ATR/price.
    f['vol_rank'] = (pd.Series(a / c).rolling(20000, min_periods=2000)
                     .rank(pct=True).to_numpy())
    return pd.DataFrame(f, index=p.index)


def find_events(ext, threshold, rearm=REARM):
    """Bars where |ext| crosses ABOVE `threshold`, re-armed."""
    e = np.abs(np.asarray(ext, float))
    prev = np.concatenate([[np.nan], e[:-1]])
    cross = (e >= threshold) & (prev < threshold) & np.isfinite(prev)
    idx = np.where(cross)[0]
    out, last = [], -10**9
    for i in idx:
        if i - last >= rearm:
            out.append(i)
            last = i
    return np.array(out, dtype=int)


def outcomes(p, feat, idx, vwap_col, ext_col, fwd=FWD):
    """The full outcome taxonomy for each event. THIS is the only forward-looking part.

    MEASURED ON THE EVOLVING EXTENSION, NOT A FROZEN VWAP. An earlier version
    compared forward price against vw[i] fixed at the event, which asks whether
    price returned to where VWAP USED to be. A rolling VWAP chases price, so
    that was satisfied almost always and produced nonsense (P(touch)=95% at the
    smallest extensions, reversion fractions above 10). Using the forward
    extension series makes the quantity naturally bounded:

        reversion_frac = 1 - min|ext| / |ext0|
          0.0  never came back at all
          1.0  reached VWAP
         >1.0  crossed through it
    """
    c = p['close'].to_numpy(float)
    a = feat['atr'].to_numpy(float)
    ext = feat[ext_col].to_numpy(float)
    n = len(c)

    rows = []
    for i in idx:
        end = min(i + fwd, n - 1)
        if end <= i + 5 or not np.isfinite(ext[i]) or not np.isfinite(a[i]) or a[i] <= 0:
            continue
        side = 1 if ext[i] > 0 else -1
        e0 = abs(ext[i])
        if e0 <= 0:
            continue
        fe = ext[i + 1:end + 1] * side          # forward extension, signed so + = still extended
        fe = fe[np.isfinite(fe)]
        if fe.size < 5:
            continue

        min_ext = float(np.min(fe))             # most it came back (can go negative = crossed)
        max_ext = float(np.max(fe))             # most it extended further
        rev_frac = 1.0 - min_ext / e0

        # First bar at which VWAP was reached / crossed, on the evolving series.
        hit = np.where(fe <= 0.0)[0]
        cross = np.where(fe <= -CROSS_EPS)[0]
        t_vwap = int(hit[0]) + 1 if hit.size else np.nan
        t_best = int(np.argmin(fe)) + 1

        # Genuine directional reversal: price breaks the opposite side of the
        # swing that produced the extension.
        lookback = slice(max(0, i - 240), i + 1)
        fc = c[i + 1:end + 1]
        if side > 0:
            broke = bool(np.any(fc <= np.min(c[lookback])))
        else:
            broke = bool(np.any(fc >= np.max(c[lookback])))

        rows.append({
            'idx': i, 'time': p.index[i], 'side': side, 'ext0': e0,
            'min_ext_atr': min_ext, 'max_further_atr': max_ext - e0,
            'reversion_frac': rev_frac,
            'touched_vwap': bool(hit.size), 'crossed_vwap': bool(cross.size),
            'broke_swing': broke,
            't_vwap': t_vwap, 't_best_retrace': t_best,
            'fwd_ret_atr': float((c[end] - c[i]) / a[i]) * side * -1,
        })
    d = pd.DataFrame(rows)
    if d.empty:
        return d
    d['outcome_class'] = classify(d)
    return d


def classify(d):
    """Ordered outcome label. Built from the raw columns so it can be re-cut."""
    rf = d['reversion_frac'].to_numpy()
    further = d['max_further_atr'].to_numpy()
    out = np.full(len(d), 'unresolved', dtype=object)
    out[rf < 0.25] = 'failed_reversion'
    out[(rf >= 0.25) & (rf < 0.5)] = 'small_reversion'
    out[(rf >= 0.5) & (rf < 1.0)] = 'meaningful_reversion'
    out[d['touched_vwap'].to_numpy()] = 'vwap_touch'
    out[d['crossed_vwap'].to_numpy()] = 'vwap_cross'
    out[d['broke_swing'].to_numpy()] = 'full_reversal'
    # Continued trend: barely came back AND went a long way further.
    out[(rf < 0.25) & (further > 1.0)] = 'continued_trend'
    return out
