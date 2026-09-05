"""div_structural.py - the operator's actual read: price-vs-VMC divergence at a turn.

This is the one combination the study never ran. Divergence was scored against
FORWARD RETURNS; the structural test (which is where a real effect showed up)
scored raw feature LEVELS. Nobody asked whether divergence predicts that a
swing is THE turn rather than another pause - which is precisely the read the
operator described.

It also adds the RSI. VuManChu Cipher B's yellow line is an RSI and this repo
never implemented it, so no earlier result covers price-vs-RSI divergence -
the exact thing being circled on the charts.

THE QUESTION
  At a confirmed swing high/low, was there a divergence against price in the
  preceding window - and does that raise P(this was THE high/low) above the
  base rate for swings generally?

Base rate for a swing being major is ~26-28%. Anything that lifts it
materially is worth having; anything at 1.0x is the pattern not working.

  python vmcResearch/div_structural.py --instruments xauusd,eurusd,nq
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

from vmcResearch.stats import N_BLOCKS, batch_means_se, make_blocks  # noqa: E402
from vmcResearch.vmcfeat import divergence, pivots  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')

PIVOT_N = 30          # M1 bars either side -> a 30-min swing, matching a 1m chart read
HORIZON = 240         # 4h to decide major vs minor
K_SIGMA = 2.0
LOOKBACK = 60         # a divergence "on the approach" counts for this many minutes


def rsi(close, period=14):
    """Wilder RSI - Cipher B's yellow line. Causal, never implemented here before."""
    c = np.asarray(close, float)
    d = np.diff(c, prepend=c[0])
    up = np.where(d > 0, d, 0.0)
    dn = np.where(d < 0, -d, 0.0)
    ru = pd.Series(up).ewm(alpha=1.0 / period, adjust=False).mean().to_numpy()
    rd = pd.Series(dn).ewm(alpha=1.0 / period, adjust=False).mean().to_numpy()
    with np.errstate(divide='ignore', invalid='ignore'):
        rs = np.where(rd > 0, ru / rd, np.inf)
    out = 100.0 - 100.0 / (1.0 + rs)
    out[~np.isfinite(out)] = 50.0
    return out - 50.0          # centred, so divergence sign logic matches the others


def label_swings_m1(p, pivot_n=PIVOT_N, horizon=HORIZON, k=K_SIGMA):
    h = p['high'].to_numpy(float)
    l = p['low'].to_numpy(float)
    s = p['sigma_price'].to_numpy(float)
    n = len(p)
    rows = []
    for idx, is_high in ((np.where(pivots(h, pivot_n, True))[0], True),
                         (np.where(pivots(l, pivot_n, False))[0], False)):
        for i in idx:
            end = min(i + horizon, n - 1)
            if end <= i + pivot_n or not np.isfinite(s[i]) or s[i] <= 0:
                continue
            fh, fl = h[i + 1:end + 1], l[i + 1:end + 1]
            if fh.size == 0:
                continue
            if is_high:
                major = (fh.max() <= h[i]) and ((h[i] - fl.min()) / s[i] >= k)
            else:
                major = (fl.min() >= l[i]) and ((fh.max() - l[i]) / s[i] >= k)
            rows.append({'idx': i, 'is_high': is_high, 'major': bool(major)})
    return pd.DataFrame(rows)


def run(instrument):
    f = os.path.join(DATA, 'fast_%s.parquet' % instrument)
    if not os.path.exists(f):
        print('  [%s] no fast panel - build with fast_panel.py' % instrument)
        return None
    p = pd.read_parquet(f)
    c = p['close'].to_numpy(float)

    # The series a trader might read a divergence off, INCLUDING the RSI.
    series = {
        'WaveTrend': p['tf1_wt1'].to_numpy(float),
        'WT2': p['tf1_wt2'].to_numpy(float),
        'MoneyFlow': p['tf1_mf'].to_numpy(float),
        'VWAPdist': p['tf1_vwap_dist'].to_numpy(float),
        'RSI (yellow)': rsi(c),
    }

    sw = label_swings_m1(p)
    idx = sw['idx'].to_numpy()
    major = sw['major'].to_numpy().astype(float)
    is_high = sw['is_high'].to_numpy()
    base = float(major.mean())
    blocks = make_blocks(p.index, N_BLOCKS)

    print('\n%s   swings %s   base P(THE turn) = %.3f'
          % (instrument.upper(), format(len(sw), ','), base))
    print('  %-26s %9s %10s %8s %8s' % ('divergence measured on', 'n at swing', 'P(major)', 'lift', 't'))

    rows = []
    for nm, s in series.items():
        for pn in (3, 5):
            reg, _ = divergence(c, np.nan_to_num(s, nan=0.0), pivot_n=pn, max_gap=90)
            live = pd.Series(np.where(reg != 0, reg, np.nan)).ffill(limit=LOOKBACK).fillna(0).to_numpy()
            at = live[idx]
            # Bullish divergence must sit at a LOW, bearish at a HIGH, to count.
            agree = np.where(is_high, at < 0, at > 0)
            n = int(agree.sum())
            if n < 150:
                continue
            pm = float(major[agree].mean())
            se = batch_means_se(major[agree] - base, blocks[idx][agree])
            t = (pm - base) / se if se and se > 0 else np.nan
            print('  %-26s %9s %10.3f %7.2fx %8.2f'
                  % ('%s  n%d' % (nm, pn), format(n, ','), pm, pm / base, t if np.isfinite(t) else 0))
            rows.append({'instrument': instrument, 'series': nm, 'pivot_n': pn,
                         'n': n, 'p_major': pm, 'base': base, 'lift': pm / base, 't': t})
    return pd.DataFrame(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--instruments', default='xauusd,eurusd,nq')
    a = ap.parse_args()
    out = [r for i in [s.strip() for s in a.instruments.split(',') if s.strip()]
           if (r := run(i)) is not None and len(r)]
    if len(out) > 1:
        d = pd.concat(out, ignore_index=True)
        g = d.groupby('series').agg(mean_lift=('lift', 'mean'), total_n=('n', 'sum'),
                                    n_tests=('lift', 'size'),
                                    above1=('lift', lambda x: int((x > 1).sum())))
        print('\n' + '=' * 64)
        print('POOLED - does price-vs-VMC divergence identify THE turn?')
        print('=' * 64)
        print('  %-26s %10s %10s %s' % ('series', 'mean lift', 'total n', 'above 1.0x'))
        for k, r in g.sort_values('mean_lift', ascending=False).iterrows():
            print('  %-26s %9.2fx %10s %d/%d'
                  % (k, r['mean_lift'], format(int(r['total_n']), ','), r['above1'], r['n_tests']))
        d.to_parquet(os.path.join(DATA, 'div_structural.parquet'))


if __name__ == '__main__':
    main()
