"""ml_reversal.py - can a model find impending reversals that my cell scan could not?

FOUR THINGS THIS DOES THAT THE EARLIER MODEL DID NOT
----------------------------------------------------
1. TRAJECTORY, NOT SNAPSHOT. Every timeframe's state is supplied at t, t-3,
   t-10 and t-30 as well as now. That is what lets the model see a CASCADE -
   4H rolls over, then 1H, then 15m confirms - which a static conjunction
   cannot represent and which is what "multi-timeframe trend" usually means to
   a discretionary trader. This was the biggest blind spot in the cell scan.

2. THE FAST STACK. 1m/3m/5m/15m, never modelled before. The main study found
   whatever signal exists concentrates at the fast end.

3. PRECISION AT HIGH CONFIDENCE, not average AUC. An AUC of 0.52 can hide a
   subset where the model is right 70% of the time. If the edge is a rare,
   high-conviction setup - which is what a selective trader has - average AUC
   is exactly the wrong statistic and would have buried it. The top-K precision
   curve is the headline output here.

4. NO FREQUENCY FLOOR. The cell scan required n>=400 per cell plus
   cross-instrument replication, which deletes a setup firing 20 times a year
   by construction.

The label is a genuine reversal: price travels 2 sigma AGAINST the prevailing
60-minute leg before it travels 2 sigma with it, inside 120 minutes.

  python vmcResearch/ml_reversal.py --instrument eurusd
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')

TFS = (1, 3, 5, 15)
STATE = ('wt1', 'wt_spread', 'mf', 'vwap_dist')
LAGS = (3, 10, 30)          # in base (M1) bars - the trajectory
TREND_W = 60                # prevailing leg, minutes
HORIZON = 120               # minutes to resolve
K_SIGMA = 2.0
STRIDE = 5


def barrier_reversal(high, low, close, sigma, trend_dir, k=K_SIGMA, horizon=HORIZON, chunk=120_000):
    """1 = reversed (moved k sigma against the leg first), 0 = continued, nan = neither."""
    h, l, c = np.asarray(high, float), np.asarray(low, float), np.asarray(close, float)
    s = np.asarray(sigma, float)
    n = c.size
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
        td = trend_dir[lo:hi]
        # "with the leg" is up when the leg is up; reversal is the other barrier.
        with_first = np.where(td > 0, fu, fd)
        against_first = np.where(td > 0, fd, fu)
        res = np.full(hi - lo, np.nan)
        res[against_first < with_first] = 1.0
        res[with_first < against_first] = 0.0
        res[(with_first >= big) & (against_first >= big)] = np.nan
        res[td == 0] = np.nan
        out[lo:hi] = res
    return out


def build(instrument):
    p = pd.read_parquet(os.path.join(DATA, 'fast_%s.parquet' % instrument))
    c = p['close'].to_numpy(float)
    sig = p['sigma_price'].to_numpy(float)

    prior = np.full(len(p), np.nan)
    prior[TREND_W:] = (c[TREND_W:] - c[:-TREND_W]) / (sig[TREND_W:] * np.sqrt(TREND_W))
    td = np.sign(np.nan_to_num(prior))
    td[np.abs(prior) < 0.5] = 0          # no leg, no reversal to call

    y = barrier_reversal(p['high'].to_numpy(float), p['low'].to_numpy(float), c, sig, td)

    feats = {}
    for tf in TFS:
        for s in STATE:
            col = 'tf%d_%s' % (tf, s)
            if col not in p.columns:
                continue
            v = p[col].to_numpy(float)
            feats[col] = v
            # Trajectory: how the state has CHANGED over each lag. Differences
            # rather than raw levels, so the model sees the move not the level
            # twice, and a cascade shows up as staggered lag responses.
            for L in LAGS:
                d = np.full(v.size, np.nan)
                d[L:] = v[L:] - v[:-L]
                feats['%s_d%d' % (col, L)] = d
        for extra in ('div_vwap_n3_reg', 'div_wt_n3_reg'):
            col = 'tf%d_%s' % (tf, extra)
            if col in p.columns:
                feats[col] = p[col].to_numpy(float)

    # Cross-timeframe CASCADE: the gap between fast and slow state. A cascade in
    # progress shows as these diverging then re-converging.
    for a, b in ((1, 5), (5, 15), (1, 15), (3, 15)):
        for s in ('wt1', 'wt_spread'):
            ca, cb = 'tf%d_%s' % (a, s), 'tf%d_%s' % (b, s)
            if ca in p.columns and cb in p.columns:
                feats['gap_%s_%d_%d' % (s, a, b)] = p[ca].to_numpy(float) - p[cb].to_numpy(float)

    feats['prior_leg'] = prior
    feats['hour'] = p['hour'].to_numpy(float)

    X = pd.DataFrame(feats, index=p.index).iloc[::STRIDE]
    yv = pd.Series(y, index=p.index).iloc[::STRIDE]
    m = yv.notna()
    return X[m], yv[m].to_numpy()


def topk_precision(y, pr, base):
    print('  %-10s %9s %10s %10s %9s' % ('top slice', 'n', 'P(reversal)', 'vs base', 'lift'))
    for q in (0.001, 0.005, 0.01, 0.05, 0.10, 0.25):
        k = max(int(len(pr) * q), 30)
        idx = np.argsort(pr)[::-1][:k]
        p = float(y[idx].mean())
        print('  %-10s %9s %10.4f %+10.4f %9.2fx'
              % ('%.1f%%' % (q * 100), format(k, ','), p, p - base, p / base if base > 0 else 0))


def run(instrument):
    print('[%s] building features...' % instrument, flush=True)
    X, y = build(instrument)
    print('  %s rows x %d features   base P(reversal) = %.4f'
          % (format(len(X), ','), X.shape[1], y.mean()), flush=True)

    cut = int(len(X) * 0.6)
    emb = HORIZON // STRIDE
    Xtr, ytr = X.iloc[:cut], y[:cut]
    Xte, yte = X.iloc[cut + emb:], y[cut + emb:]

    m = HistGradientBoostingClassifier(max_iter=300, max_depth=6, learning_rate=0.05,
                                       min_samples_leaf=100, l2_regularization=1.0,
                                       random_state=0)
    m.fit(Xtr.to_numpy(np.float32), ytr)
    pr = m.predict_proba(Xte.to_numpy(np.float32))[:, 1]
    base = float(yte.mean())
    print('\n  AUC (time-split, embargoed) = %.4f   test base rate = %.4f'
          % (roc_auc_score(yte, pr), base))
    print('\n  PRECISION AT HIGH CONFIDENCE - the selective-setup test:')
    topk_precision(yte, pr, base)

    from sklearn.inspection import permutation_importance
    n = min(30000, len(Xte))
    sub = np.random.default_rng(0).choice(len(Xte), n, replace=False)
    r = permutation_importance(m, Xte.iloc[sub].to_numpy(np.float32), yte[sub],
                               n_repeats=2, random_state=0, scoring='roc_auc', n_jobs=1)
    order = np.argsort(r.importances_mean)[::-1][:15]
    print('\n  what the model leans on (AUC drop when shuffled):')
    for i in order:
        print('    %-30s %+.5f' % (X.columns[i], r.importances_mean[i]))
    return m, X, y


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--instrument', default='eurusd')
    a = ap.parse_args()
    run(a.instrument)
