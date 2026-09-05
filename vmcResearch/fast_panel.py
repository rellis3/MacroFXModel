"""fast_panel.py - divergence tested the way it is actually traded.

The main study's divergence null does not cover the scalper's use case, and
saying so plainly matters more than defending the original scope. Three things
were wrong for this question:

  horizon      outcomes were a +/-2 sigma race over 4 HOURS. A 1m divergence
               fade plays out in 5-30 minutes. A 4h horizon averages it away.
  timeframes   divergence was detected on 5m/15m/1h/4h, not 1m/3m.
  oscillator   only WaveTrend. Traders watch divergence on the money flow and
               the VWAP component too; neither was ever tested.

There is also a mechanism that makes the short horizon the RIGHT place to
look rather than merely the traded one: if a large number of people act on the
same visual pattern, the resulting pressure is reflexive and short-lived. It
would appear within minutes and be invisible at four hours. The original design
could not have seen it either way.

So: M1 base, 1/3/5/15 stack, divergence computed on FOUR series, outcomes at
5-60 minutes, and the exhaustion context ("extended, then diverging") that the
pattern is actually used to identify.

  python vmcResearch/fast_panel.py --instruments xauusd,eurusd,nq
"""
from __future__ import annotations

import argparse
import os
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pylego.indicators.vumanchu import (  # noqa: E402
    OPERATOR_WT, causal_vwap_dist, money_flow_vmc, wave_trend, align_htf_causal,
)
from vmcResearch.panel import load_m1, resample  # noqa: E402
from vmcResearch.vmcfeat import divergence  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, 'data')

BASE_TF = 1
TIMEFRAMES = (1, 3, 5, 15)
# Forward horizons in MINUTES - matched to how the pattern is traded.
HORIZONS = (5, 10, 20, 30, 60)
PATH_HORIZONS = (10, 30, 60)
# Divergence fractal sizes. The main study used 5 only; traders eyeball both
# tighter and looser spans, and the answer should not hinge on one choice.
PIVOT_NS = (3, 5)


def _fwd_extreme(a, h, how):
    rev = pd.Series(a[::-1])
    roll = rev.rolling(h, min_periods=h)
    s = (roll.max() if how == 'max' else roll.min()).to_numpy()[::-1]
    out = np.full(a.size, np.nan)
    out[:-1] = s[1:]
    return out


def tf_block(bars, tf):
    """State + divergence on FOUR series for one timeframe."""
    o = bars['open'].to_numpy(float)
    h = bars['high'].to_numpy(float)
    l = bars['low'].to_numpy(float)
    c = bars['close'].to_numpy(float)
    v = bars['volume'].to_numpy(float) if 'volume' in bars else None

    wt = wave_trend(h, l, c, **OPERATOR_WT)
    mf = money_flow_vmc(o, h, l, c)
    vwd = causal_vwap_dist(h, l, c, v, window=20, sigma_window=500)

    out = {}
    out['wt1'], out['wt2'] = wt.wt1, wt.wt2
    out['wt_spread'] = wt.wt1 - wt.wt2
    out['mf'] = mf
    out['vwap_dist'] = vwd

    # The four series a trader might read a divergence off.
    series = {'wt': wt.wt1, 'wt2': wt.wt2, 'mf': mf, 'vwap': vwd}
    for sname, s in series.items():
        for pn in PIVOT_NS:
            reg, hid = divergence(c, np.nan_to_num(s, nan=0.0), pivot_n=pn, max_gap=60)
            out['div_%s_n%d_reg' % (sname, pn)] = reg
            out['div_%s_n%d_hid' % (sname, pn)] = hid
    return pd.DataFrame(out, index=bars.index)


def build(instrument, years=None, verbose=True):
    t0 = time.time()
    m1 = load_m1(instrument)
    if years:
        m1 = m1[m1.index >= m1.index[-1] - pd.Timedelta(days=365 * years)]
    if verbose:
        print('  M1 %s bars %s -> %s' % (format(len(m1), ','), m1.index[0].date(), m1.index[-1].date()), flush=True)

    base = m1
    base_close = (base.index.astype('int64') // 10**9 + 60).to_numpy()
    cols = {}
    for c in ('open', 'high', 'low', 'close'):
        cols[c] = base[c].to_numpy(float)

    for tf in TIMEFRAMES:
        bars = resample(m1, tf) if tf > 1 else m1
        blk = tf_block(bars, tf)
        slow_close = (bars.index.astype('int64') // 10**9 + tf * 60).to_numpy()
        for col in blk.columns:
            cols['tf%d_%s' % (tf, col)] = (blk[col].to_numpy(float) if tf == 1 else
                                           align_htf_causal(base_close, slow_close, blk[col].to_numpy(float)))
        if verbose:
            print('  tf%-3d %s bars' % (tf, format(len(bars), ',')), flush=True)

    c = cols['close']
    sig = (pd.Series(c).pct_change().rolling(500, min_periods=100).std().to_numpy() * c)
    cols['sigma_price'] = sig

    for hz in HORIZONS:
        f = np.full(c.size, np.nan)
        f[:-hz] = c[hz:] / c[:-hz] - 1.0
        cols['fwd_ret_%d' % hz] = f
        with np.errstate(divide='ignore', invalid='ignore'):
            cols['fwd_sig_%d' % hz] = np.where(sig > 0, f * c / (sig * np.sqrt(hz)), np.nan)
    for hz in PATH_HORIZONS:
        with np.errstate(divide='ignore', invalid='ignore'):
            cols['mfe_%d' % hz] = np.where(sig > 0, (_fwd_extreme(cols['high'], hz, 'max') - c) / sig, np.nan)
            cols['mae_%d' % hz] = np.where(sig > 0, (_fwd_extreme(cols['low'], hz, 'min') - c) / sig, np.nan)

    # Prior move over 60 minutes - the "extended" part of "extended, then diverging".
    prior = np.full(c.size, np.nan)
    prior[60:] = (c[60:] - c[:-60]) / (sig[60:] * np.sqrt(60))
    cols['prior_60'] = prior

    p = pd.DataFrame(cols, index=base.index)
    p['hour'] = base.index.hour.astype(np.int8)
    for col in p.columns:
        if p[col].dtype == np.float64:
            p[col] = p[col].astype(np.float32)
    if verbose:
        print('  panel %s x %d in %.0fs' % (format(len(p), ','), p.shape[1], time.time() - t0), flush=True)
    return p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--instruments', default='xauusd')
    ap.add_argument('--years', type=int, default=None)
    a = ap.parse_args()
    os.makedirs(OUT_DIR, exist_ok=True)
    for inst in [s.strip() for s in a.instruments.split(',') if s.strip()]:
        print('[%s]' % inst, flush=True)
        p = build(inst, years=a.years)
        dest = os.path.join(OUT_DIR, 'fast_%s.parquet' % inst)
        p.to_parquet(dest, compression='zstd')
        print('  -> %s (%.0f MB)' % (dest, os.path.getsize(dest) / 1e6), flush=True)


if __name__ == '__main__':
    main()
