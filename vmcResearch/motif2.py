"""motif2.py - shape search done properly, after the first attempt was too crude.

WHAT WAS WRONG WITH motif.py
----------------------------
1. ONE window length (30 min). A motif at 10 min or 2h could not be seen.
2. 80 clusters over 1.24M windows - ~15,000 windows averaged per "shape", so a
   motif occurring 1-in-10,000 dissolves into a blob.
3. WORST: it clustered RAW VALUES. Euclidean k-means on raw traces is dominated
   by LEVEL, so the same picture drawn at -60 and at -20 lands in different
   clusters, and two different pictures at similar levels merge. It was
   clustering where the oscillator SAT, not what it DREW.

FIXES
  z-normalise each window, per series  -> shape, not position. This is what
                                          makes "roughly the same" mean the
                                          right thing.
  five window lengths (10..120 min)    -> motifs at different speeds
  400 clusters instead of 80           -> rare shapes survive instead of
                                          dissolving
  report cluster TIGHTNESS             -> a loose cluster is not a motif at
                                          all, however good its forward return

Still not exhaustive - a true all-scales all-offsets search with time-warping
is a far bigger computation and a far worse multiple-testing problem. But this
is a fair test of "does a recognisable shape recur and lead somewhere".

  python vmcResearch/motif2.py --instrument xauusd
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd
from sklearn.cluster import MiniBatchKMeans

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')

WINDOWS = (10, 20, 30, 60, 120)
POINTS = 10
HORIZON = 30
N_CLUSTERS = 400
STRIDE = 5
SERIES = ('tf1_wt1', 'tf1_wt2', 'tf1_mf', 'tf1_vwap_dist')


def shape_fingerprints(p, window):
    """4 series x 10 samples, each series Z-NORMALISED WITHIN ITS WINDOW.

    The normalisation is the whole point: it strips level and amplitude so two
    windows match when they trace the same picture, wherever it is drawn and
    however big it is.
    """
    step = max(window // POINTS, 1)
    per_series = []
    for s in SERIES:
        v = p[s].to_numpy(np.float32)
        lags = [window - 1 - k * step for k in range(POINTS)]
        cols = []
        for lag in lags:
            a = np.full(v.size, np.nan, np.float32)
            if lag > 0:
                a[lag:] = v[:-lag]
            else:
                a[:] = v
            cols.append(a)
        M = np.column_stack(cols)
        mu = M.mean(axis=1, keepdims=True)
        sd = M.std(axis=1, keepdims=True)
        sd = np.where(sd > 1e-6, sd, np.nan)      # a flat window has no shape
        per_series.append((M - mu) / sd)
    return np.hstack(per_series)


def run_window(p, y, window, n_clusters, rng):
    X = shape_fingerprints(p, window)
    ok = np.isfinite(X).all(axis=1) & np.isfinite(y)
    Xs, ys = X[ok][::STRIDE], y[ok][::STRIDE]
    if len(Xs) < 20000:
        return None
    cut = int(len(Xs) * 0.6)
    Xtr, ytr = Xs[:cut], ys[:cut]
    Xte, yte = Xs[cut + HORIZON:], ys[cut + HORIZON:]

    km = MiniBatchKMeans(n_clusters=n_clusters, random_state=0, n_init=3, batch_size=8192)
    km.fit(Xtr)
    ltr, lte = km.predict(Xtr), km.predict(Xte)

    # Tightness: mean distance to centroid, relative to the global spread. A
    # loose cluster is a bag of unlike windows, not a motif.
    dte = np.linalg.norm(Xte - km.cluster_centers_[lte], axis=1)
    global_spread = float(np.linalg.norm(Xte - Xte.mean(axis=0), axis=1).mean())

    rows = []
    for k in range(n_clusters):
        a, b = ltr == k, lte == k
        if a.sum() < 150 or b.sum() < 150:
            continue
        rows.append({'window': window, 'cluster': k,
                     'n_train': int(a.sum()), 'n_test': int(b.sum()),
                     'train_mean': float(ytr[a].mean()), 'test_mean': float(yte[b].mean()),
                     'test_up': float((yte[b] > 0).mean()),
                     'tightness': float(dte[b].mean() / global_spread)})
    d = pd.DataFrame(rows)
    if d.empty:
        return None
    d['agree'] = np.sign(d.train_mean) == np.sign(d.test_mean)

    # Null bar for THIS window length and these cluster sizes.
    null = []
    for _ in range(20):
        sh = rng.permutation(yte)
        for k in d['cluster'].sample(min(40, len(d)), random_state=0):
            b = lte == k
            if b.sum() >= 150:
                null.append(abs(sh[b].mean() - yte.mean()))
    d['null_bar'] = float(np.percentile(null, 99)) if null else np.nan
    d['base'] = float(yte.mean())
    d['excess'] = d.test_mean - d.base
    return d


def run(instrument, n_clusters=N_CLUSTERS):
    f = os.path.join(DATA, 'fast_%s.parquet' % instrument)
    p = pd.read_parquet(f, columns=list(SERIES) + ['close', 'sigma_price'])
    c = p['close'].to_numpy(float)
    sig = p['sigma_price'].to_numpy(float)
    fwd = np.full(len(p), np.nan)
    fwd[:-HORIZON] = c[HORIZON:] - c[:-HORIZON]
    with np.errstate(divide='ignore', invalid='ignore'):
        y = fwd / (sig * np.sqrt(HORIZON))

    rng = np.random.default_rng(0)
    out = []
    for w in WINDOWS:
        d = run_window(p, y, w, n_clusters, rng)
        if d is None:
            continue
        bar = d['null_bar'].iloc[0]
        surv = d[(d.excess.abs() > bar) & d.agree]
        tight = surv[surv.tightness < 0.75]
        print('  window %3dmin: %3d clusters | sign-agree %3d | clear null %2d | ALSO tight %2d  (bar %.4f)'
              % (w, len(d), int(d.agree.sum()), len(surv), len(tight), bar), flush=True)
        out.append(d)

    d = pd.concat(out, ignore_index=True)
    d['instrument'] = instrument
    d.to_parquet(os.path.join(DATA, 'motif2_%s.parquet' % instrument))

    surv = d[(d.excess.abs() > d.null_bar) & d.agree & (d.tightness < 0.75)]
    print('\n  TOTAL: %d clusters tested across %d window lengths' % (len(d), len(WINDOWS)))
    print('  survived (beats null + sign holds + genuinely tight): %d' % len(surv))
    exp = len(d) * 0.01
    print('  expected by chance at a 99th-pct bar: ~%.1f' % exp)
    if len(surv):
        print('\n  %-8s %-8s %8s %10s %10s %8s %9s' %
              ('window', 'cluster', 'nTest', 'train', 'test-base', 'P(up)', 'tightness'))
        for _, r in surv.reindex(surv.excess.abs().sort_values(ascending=False).index).head(15).iterrows():
            print('  %-8d %-8d %8s %+10.4f %+10.4f %8.3f %9.2f'
                  % (r.window, r.cluster, format(r.n_test, ','), r.train_mean,
                     r.excess, r.test_up, r.tightness))
    return d


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--instrument', default='xauusd')
    ap.add_argument('--clusters', type=int, default=N_CLUSTERS)
    a = ap.parse_args()
    run(a.instrument, a.clusters)
