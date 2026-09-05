"""vmcfeat.py — VuManChu state-vector features, per timeframe.

Every column here is CAUSAL: computable at the close of the bar it is stamped
on. The only look-ahead permitted anywhere in this study lives in the `fwd_*`
outcome columns built by `panel.py`, which are labels, never inputs.

Indicator math is reused from `pylego.indicators.vumanchu` (WaveTrend,
money_flow_vmc, causal_vwap_dist, align_htf_causal). Nothing about the earlier
lab's event framing, labelling or baselines is reused.

WaveTrend uses OPERATOR_WT (9/12/3) — the operator's actual TradingView Cipher
B setup, not the library's 10/21/4 default. Money Flow uses `money_flow_vmc`,
the faithful Pine f_rsimfi (SMA(60) of (close-open)/(high-low)*150 - 2.5), which
needs no volume and so carries no tick-count caveat on FX.
"""
from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pylego.indicators.vumanchu import (  # noqa: E402
    OPERATOR_WT, causal_vwap_dist, money_flow_vmc, wave_trend,
)

# VuManChu Cipher B overbought/oversold levels (Pine defaults).
OB1, OB2 = 53.0, 60.0
OS1, OS2 = -53.0, -60.0


def _slope(a: np.ndarray, k: int = 1) -> np.ndarray:
    """Backward difference over k bars — knowable at the bar it is stamped on."""
    out = np.full(a.size, np.nan)
    if a.size > k:
        out[k:] = a[k:] - a[:-k]
    return out


def _bars_since(flag: np.ndarray) -> np.ndarray:
    """Bars since `flag` was last True, inclusive (0 on the bar itself)."""
    n = flag.size
    out = np.full(n, np.nan)
    last = -1
    for i in range(n):
        if flag[i]:
            last = i
        if last >= 0:
            out[i] = i - last
    return out


def _run_length(sign: np.ndarray) -> np.ndarray:
    """Consecutive bars the sign has held its current value."""
    n = sign.size
    out = np.zeros(n)
    for i in range(1, n):
        out[i] = out[i - 1] + 1 if sign[i] == sign[i - 1] and sign[i] != 0 else 0
    return out


def pivots(values: np.ndarray, n: int, high: bool = True) -> np.ndarray:
    """Boolean mask of pivot highs (or lows), tie-inclusive.

    A pivot at i needs n bars either side, so it is only KNOWABLE at i+n. The
    mask is stamped at i; callers that need causality must shift by n. Kept
    separate so the confirmation lag is explicit at the call site.
    """
    n_ = int(n)
    out = np.zeros(values.size, dtype=bool)
    if values.size < 2 * n_ + 1:
        return out
    win = np.lib.stride_tricks.sliding_window_view(values, 2 * n_ + 1)
    centre = values[n_:values.size - n_]
    ext = win.max(axis=1) if high else win.min(axis=1)
    out[n_:values.size - n_] = (centre >= ext) if high else (centre <= ext)
    return out


def wt_shape(wt1: np.ndarray, d1: np.ndarray, d2: np.ndarray,
             flat_eps: float = 1.5, steep_window: int = 5000,
             steep_minp: int = 500) -> np.ndarray:
    """The trajectory codes the brief asks for, as an integer column.

    Shape is (level, slope, curvature) — not just direction. Codes:
      3 rising sharply     2 rising slowly      1 recovering from oversold
      0 flat              -1 rejecting from overbought
     -2 falling slowly    -3 falling sharply    -4 rolling over
      4 accelerating up (rising and convex)

    "Steep" is a TRAILING quantile of |slope|, not a whole-array one. A global
    percentile here is a real leak and the truncation test catches it: one 2026
    volatility spike would otherwise set the threshold that classifies a 2016
    bar, so the same bar changes shape depending on how much future you hand it.
    """
    steep = (pd.Series(np.abs(d1))
             .rolling(steep_window, min_periods=steep_minp)
             .quantile(0.70).to_numpy())
    steep = np.where(np.isfinite(steep), steep, np.inf)
    code = np.zeros(wt1.size, dtype=np.int8)
    rising, falling = d1 > flat_eps, d1 < -flat_eps
    code[rising] = 2
    code[falling] = -2
    code[rising & (np.abs(d1) > steep)] = 3
    code[falling & (np.abs(d1) > steep)] = -3
    code[rising & (d2 > 0) & (np.abs(d1) > steep)] = 4
    code[rising & (wt1 < OS1)] = 1                       # recovering from oversold
    code[falling & (wt1 > OB1)] = -1                     # rejecting from overbought
    code[falling & (d2 < 0) & (wt1 > 0) & (np.abs(d1) <= steep)] = -4   # rolling over
    return code


def tf_state(bars: pd.DataFrame, vwap_window: int = 20, sigma_window: int = 500,
             pivot_n: int = 5) -> pd.DataFrame:
    """Full VuManChu state vector for one timeframe's own bars."""
    o = bars['open'].to_numpy(float)
    h = bars['high'].to_numpy(float)
    l = bars['low'].to_numpy(float)
    c = bars['close'].to_numpy(float)
    v = bars['volume'].to_numpy(float) if 'volume' in bars else None

    wt = wave_trend(h, l, c, **OPERATOR_WT)
    wt1, wt2 = wt.wt1, wt.wt2
    spread = wt1 - wt2
    d1, d2 = _slope(wt1), _slope(_slope(wt1))

    # A cross is a sign change of the WT1-WT2 spread, detected on the bar it
    # completes — no repainting.
    sgn = np.sign(spread)
    prev = np.concatenate([[0.0], sgn[:-1]])
    cross_up = (sgn > 0) & (prev <= 0)
    cross_dn = (sgn < 0) & (prev >= 0)
    any_cross = cross_up | cross_dn

    # Value of wt1 at the most recent cross, and which side of zero it happened.
    cross_idx = np.where(any_cross)[0]
    cross_lvl = np.full(wt1.size, np.nan)
    if cross_idx.size:
        k = np.searchsorted(cross_idx, np.arange(wt1.size), side='right') - 1
        ok = k >= 0
        cross_lvl[ok] = wt1[cross_idx[k[ok]]]

    mf = money_flow_vmc(o, h, l, c)
    mf_d1, mf_d2 = _slope(mf), _slope(_slope(mf))
    mf_sgn = np.sign(mf)

    vwd = causal_vwap_dist(h, l, c, v, window=vwap_window, sigma_window=sigma_window)
    ret = pd.Series(c).pct_change()
    sigma = ret.rolling(sigma_window, min_periods=100).std().to_numpy()

    out = pd.DataFrame(index=bars.index)
    out['wt1'], out['wt2'] = wt1, wt2
    out['wt_spread'] = spread
    out['wt1_slope'], out['wt1_accel'] = d1, d2
    out['wt2_slope'] = _slope(wt2)
    out['spread_slope'] = _slope(spread)
    out['wt_shape'] = wt_shape(wt1, d1, d2)
    out['cross_dir'] = np.where(cross_up, 1, np.where(cross_dn, -1, 0)).astype(np.int8)
    out['bars_since_cross'] = _bars_since(any_cross)
    out['last_cross_dir'] = pd.Series(np.where(cross_up, 1, np.where(cross_dn, -1, np.nan)),
                                      index=bars.index).ffill().to_numpy()
    out['cross_above_zero'] = np.sign(cross_lvl)
    out['wt_zone'] = np.select(
        [wt1 >= OB2, wt1 >= OB1, wt1 <= OS2, wt1 <= OS1, wt1 > 0],
        [2, 1, -2, -1, 0], default=0).astype(np.int8)
    out['dist_ob'] = OB1 - wt1
    out['dist_os'] = wt1 - OS1
    out['wt_above_zero'] = (wt1 > 0).astype(np.int8)
    out['bars_since_zero'] = _bars_since(np.sign(wt1) != np.concatenate([[0.0], np.sign(wt1[:-1])]))

    out['mf'] = mf
    out['mf_slope'], out['mf_accel'] = mf_d1, mf_d2
    out['mf_sign'] = mf_sgn
    out['mf_run'] = _run_length(mf_sgn)
    out['mf_zero_cross'] = (mf_sgn != np.concatenate([[0.0], mf_sgn[:-1]])).astype(np.int8)

    out['vwap_dist'] = vwd
    out['sigma'] = sigma
    out['close'] = c
    return out


def divergence(price: np.ndarray, wt: np.ndarray, pivot_n: int = 5,
               max_gap: int = 60) -> tuple[np.ndarray, np.ndarray]:
    """Regular and hidden divergence, VuManChu-style and causally stamped.

    Cipher B's `f_findDivs` finds fractal tops/bottoms on the OSCILLATOR and
    compares the oscillator against price at those same fractal bars — it does
    not pivot price independently. This reproduces that.

      regular bearish  price HH + wt LH  -> -1      hidden bearish  price LH + wt HH  -> -2
      regular bullish  price LL + wt HL  -> +1      hidden bullish  price HL + wt LL  -> +2

    A fractal at bar i needs `pivot_n` bars after it, so the divergence is only
    knowable at i + pivot_n. Both returned arrays are stamped THERE, not at the
    pivot — stamping at the pivot would back-date the signal by `pivot_n` bars
    and inflate every result that follows.

    Returns (regular, hidden), each -1/0/+1 per bar.
    """
    n = price.size
    reg = np.zeros(n, dtype=np.int8)
    hid = np.zeros(n, dtype=np.int8)
    tops = np.where(pivots(wt, pivot_n, high=True))[0]
    bots = np.where(pivots(wt, pivot_n, high=False))[0]

    for idx, is_top in ((tops, True), (bots, False)):
        for a, b in zip(idx[:-1], idx[1:]):
            if b - a > max_gap:
                continue
            stamp = b + pivot_n
            if stamp >= n:
                continue
            dp, dw = price[b] - price[a], wt[b] - wt[a]
            if not (np.isfinite(dp) and np.isfinite(dw)) or dp == 0 or dw == 0:
                continue
            if is_top:
                if dp > 0 and dw < 0:
                    reg[stamp] = -1                      # regular bearish
                elif dp < 0 and dw > 0:
                    hid[stamp] = -1                      # hidden bearish
            else:
                if dp < 0 and dw > 0:
                    reg[stamp] = 1                       # regular bullish
                elif dp > 0 and dw < 0:
                    hid[stamp] = 1                       # hidden bullish
    return reg, hid
