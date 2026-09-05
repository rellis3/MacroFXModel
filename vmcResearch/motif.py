"""motif.py - does the VuManChu pane draw a recognisable SHAPE before a move?

Everything else in this study measured VALUES at a moment: how stretched, is
there a divergence, which zone. This asks a different question - does the
oscillator trace a recurring PICTURE over the preceding half hour that leads to
the same outcome each time.

WHY THE PRIOR IS NOT GREAT, AND WHY IT IS STILL WORTH RUNNING
------------------------------------------------------------
This repo already tried shape matching on PRICE (AnalogML, fixed-window k-NN)
and it tested null across 26 pairs. But WaveTrend is a better candidate than
price for this: it is bounded (+/-100), self-normalising, and mean-reverting, so
"the same shape" actually means the same thing in 2016 and 2026 - which is
exactly the property raw price lacks.

METHOD
  window   the last 30 minutes of WT1, WT2, MoneyFlow and VWAP-distance,
           downsampled to 10 points each -> a 40-number fingerprint
  cluster  MiniBatchKMeans, fitted ONLY on the training era, then applied
           unchanged to the test era. Fitting on everything would let the test
           period help define its own clusters.
  outcome  forward 30-minute move in sigma, and P(up)

A cluster only counts if its train and test means agree in sign AND it clears
a shuffled-label null bar, because with 80 clusters several will look good by
chance.

  python vmcResearch/motif.py --instrument xauusd
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

WINDOW = 30          # minutes of history in the fingerprint
POINTS = 10          # downsampled to this many samples per series
HORIZON = 30         # minutes ahead
N_CLUSTERS = 80
STRIDE = 3
SERIES = ('tf1_wt1', 'tf1_wt2', 'tf1_mf', 'tf1_vwap_dist')


def fingerprints(p):
    """One 40-number shape per bar: 4 series x 10 samples of the last 30 min."""
    step = WINDOW // POINTS
    cols = []
    for s in SERIES:
        v = p[s].to_numpy(np.float32)
        for k in range(POINTS):
            lag = WINDOW - 1 - k * step
            a = np.full(v.size, np.nan, np.float32)
            if lag > 0:
                a[lag:] = v[:-lag]
            else:
                a[:] = v
            cols.append(a)
    X = np.column_stack(cols)
    return X


def run(instrument, n_clusters=N_CLUSTERS):
    f = os.path.join(DATA, 'fast_%s.parquet' % instrument)
    if not os.path.exists(f):
        raise SystemExit('no fast panel for %s' % instrument)
    p = pd.read_parquet(f, columns=list(SERIES) + ['close', 'sigma_price'])
    print('[%s] %s bars' % (instrument, format(len(p), ',')), flush=True)

    X = fingerprints(p)
    c = p['close'].to_numpy(float)
    sig = p['sigma_price'].to_numpy(float)
    fwd = np.full(len(p), np.nan)
    fwd[:-HORIZON] = (c[HORIZON:] - c[:-HORIZON])
    with np.errstate(divide='ignore', invalid='ignore'):
        y = fwd / (sig * np.sqrt(HORIZON))

    ok = np.isfinite(X).all(axis=1) & np.isfinite(y)
    X, y = X[ok][::STRIDE], y[ok][::STRIDE]
    print('  usable windows: %s   fingerprint dims: %d' % (format(len(X), ','), X.shape[1]), flush=True)

    cut = int(len(X) * 0.6)
    Xtr, ytr = X[:cut], y[:cut]
    Xte, yte = X[cut + HORIZON:], y[cut + HORIZON:]

    km = MiniBatchKMeans(n_clusters=n_clusters, random_state=0, n_init=5, batch_size=4096)
    km.fit(Xtr)
    ltr, lte = km.predict(Xtr), km.predict(Xte)

    rows = []
    for k in range(n_clusters):
        a, b = ltr == k, lte == k
        if a.sum() < 300 or b.sum() < 300:
            continue
        rows.append({'cluster': k, 'n_train': int(a.sum()), 'n_test': int(b.sum()),
                     'train_mean': float(ytr[a].mean()), 'test_mean': float(yte[b].mean()),
                     'test_up': float((yte[b] > 0).mean())})
    d = pd.DataFrame(rows)
    if d.empty:
        raise SystemExit('no usable clusters')
    d['agree'] = np.sign(d.train_mean) == np.sign(d.test_mean)

    # Null bar: how big does |test_mean| get for clusters of this size by chance?
    rng = np.random.default_rng(0)
    null = []
    for _ in range(30):
        sh = rng.permutation(yte)
        for k in d['cluster'].head(30):
            b = lte == k
            if b.sum() >= 300:
                null.append(abs(sh[b].mean()))
    bar = float(np.percentile(null, 99)) if null else np.nan

    print('\n  base forward 30m move: %+.4f sigma   (test set)' % yte.mean())
    print('  null bar |test mean| at 99th pct of shuffles: %.4f' % bar)
    surv = d[(d.test_mean.abs() > bar) & d.agree]
    print('  clusters: %d   sign-consistent train->test: %d   ALSO clearing null: %d'
          % (len(d), int(d.agree.sum()), len(surv)))

    print('\n  %-8s %8s %8s %11s %11s %8s %s' %
          ('cluster', 'nTrain', 'nTest', 'train mean', 'test mean', 'P(up)', 'ok'))
    for _, r in d.reindex(d.test_mean.abs().sort_values(ascending=False).index).head(12).iterrows():
        print('  %-8d %8s %8s %+11.4f %+11.4f %8.3f %s'
              % (r.cluster, format(r.n_train, ','), format(r.n_test, ','),
                 r.train_mean, r.test_mean, r.test_up,
                 'Y' if (abs(r.test_mean) > bar and r.agree) else '.'))

    d['instrument'] = instrument
    d.to_parquet(os.path.join(DATA, 'motif_%s.parquet' % instrument))
    return d, km, bar


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--instrument', default='xauusd')
    ap.add_argument('--clusters', type=int, default=N_CLUSTERS)
    a = ap.parse_args()
    run(a.instrument, a.clusters)
