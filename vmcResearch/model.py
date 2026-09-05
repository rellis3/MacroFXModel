"""model.py - section 17, done as a test rather than as a construction.

The brief asks for a confluence score with weights DERIVED from the data
rather than assumed. The honest way to find out whether such a score can exist
is to hand a model every VuManChu feature at once and see whether it beats
chance out-of-sample. A gradient-boosted tree can represent any interaction a
hand-built additive score could, and many it could not, so if it cannot find
signal there is no weighting of these features that would have.

THREE SPLITS, IN INCREASING ORDER OF HONESTY
--------------------------------------------
time      train on the first 60% of one instrument, test on the last 40%, with
          an embargo of one full horizon between them so no training row's
          forward window overlaps a test row
instrument train on 8 instruments, test on 4 it has never seen
both      the last 40% of instruments it has never seen

An embargo matters more than it sounds: with a 4h forward label on a 5m grid,
the 48 rows either side of the split share almost all of their outcome, so a
naive split leaks the test answer straight into training.

Two feature sets, because the difference IS the result:
  vmc   VuManChu columns only - what the indicator knows
  vmc+r VuManChu plus plain recent returns - does VuManChu ADD anything
  r     recent returns only - the thing it has to beat
"""
from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vmcResearch import events  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')
EMBARGO = 288

TRAIN_INST = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdcad', 'usdchf', 'eurjpy', 'gbpjpy']
TEST_INST = ['audjpy', 'eurgbp', 'xauusd', 'nq']


def vmc_features(p):
    return [c for c in p.columns if c.startswith('tf') and p[c].dtype.kind in 'fiu']


def add_returns(p):
    c = p['close'].to_numpy(float)
    s = p['sigma_price'].to_numpy(float)
    out = {}
    for lb in (3, 6, 12, 24, 48, 96):
        r = np.full(len(p), np.nan)
        r[lb:] = (c[lb:] - c[:-lb]) / (s[lb:] * np.sqrt(lb))
        out['ret_%d' % lb] = r.astype(np.float32)
    return pd.concat([p, pd.DataFrame(out, index=p.index)], axis=1), list(out)


def load(inst, stride=8):
    p = pd.read_parquet(os.path.join(DATA, 'panel_%s.parquet' % inst))
    # Only the 4h race is needed here; the 24h one costs ~700MB per chunk and
    # nothing in this test reads it.
    p = events.add_events(p, horizons=(48,))
    p, rcols = add_returns(p)
    p = p.iloc[::stride].copy()
    r = p['resolve_48'].to_numpy()
    p['y_cont'] = np.where(r == 1, 1.0, np.where(r == -1, 0.0, np.nan))
    p['y_dir'] = (p['fwd_sig_20'].to_numpy(float) > 0).astype(float)
    p.loc[~np.isfinite(p['fwd_sig_20'].to_numpy(float)), 'y_dir'] = np.nan
    return p, vmc_features(p), rcols


def fit_eval(tr, te, feats, target):
    trm = tr.dropna(subset=[target])
    tem = te.dropna(subset=[target])
    if len(trm) < 5000 or len(tem) < 2000:
        return None
    m = HistGradientBoostingClassifier(max_iter=150, max_depth=5, learning_rate=0.05,
                                       min_samples_leaf=200, l2_regularization=1.0,
                                       random_state=0)
    m.fit(trm[feats].to_numpy(np.float32), trm[target].to_numpy())
    pr = m.predict_proba(tem[feats].to_numpy(np.float32))[:, 1]
    y = tem[target].to_numpy()
    return {'auc': roc_auc_score(y, pr), 'n_train': len(trm), 'n_test': len(tem),
            'base': float(y.mean()), 'model': m}


def run():
    print('Loading panels...', flush=True)
    data = {}
    for inst in TRAIN_INST + TEST_INST:
        f = os.path.join(DATA, 'panel_%s.parquet' % inst)
        if os.path.exists(f):
            data[inst], vf, rf = load(inst)
            print('  %s %s rows' % (inst, format(len(data[inst]), ',')), flush=True)
    feats_vmc = vf
    feats_ret = rf
    sets = {'vmc': feats_vmc, 'ret': feats_ret, 'vmc+ret': feats_vmc + feats_ret}

    print('\nAUC (0.500 = no skill). Embargo %d rows between train and test.' % EMBARGO)
    for target in ('y_cont', 'y_dir'):
        print('\n=== target: %s ===' % target)
        print('%-10s %-9s %8s %8s %9s %9s' % ('split', 'features', 'AUC', 'base', 'n_train', 'n_test'))

        # 1. time split within a single instrument
        p = data['eurusd']
        cut = int(len(p) * 0.6)
        tr, te = p.iloc[:cut], p.iloc[cut + EMBARGO:]
        for nm, fs in sets.items():
            r = fit_eval(tr, te, fs, target)
            if r:
                print('%-10s %-9s %8.4f %8.3f %9s %9s' % ('time', nm, r['auc'], r['base'],
                                                          format(r['n_train'], ','), format(r['n_test'], ',')))

        # 2. instrument split - trained on pairs it will never see again
        tr = pd.concat([data[i] for i in TRAIN_INST if i in data], ignore_index=True)
        te = pd.concat([data[i] for i in TEST_INST if i in data], ignore_index=True)
        for nm, fs in sets.items():
            r = fit_eval(tr, te, fs, target)
            if r:
                print('%-10s %-9s %8.4f %8.3f %9s %9s' % ('instrument', nm, r['auc'], r['base'],
                                                          format(r['n_train'], ','), format(r['n_test'], ',')))

        # 3. both - unseen instruments AND the later era
        te2 = pd.concat([data[i].iloc[int(len(data[i]) * 0.6):] for i in TEST_INST if i in data],
                        ignore_index=True)
        tr2 = pd.concat([data[i].iloc[:int(len(data[i]) * 0.6)] for i in TRAIN_INST if i in data],
                        ignore_index=True)
        for nm, fs in sets.items():
            r = fit_eval(tr2, te2, fs, target)
            if r:
                print('%-10s %-9s %8.4f %8.3f %9s %9s' % ('both', nm, r['auc'], r['base'],
                                                          format(r['n_train'], ','), format(r['n_test'], ',')))
                if nm == 'vmc' and target == 'y_cont':
                    _importances(r['model'], fs, tr2, te2, target)


def _importances(model, feats, tr, te, target):
    """Permutation importance on the TEST set - the only kind that means
    anything here, since train-set importance rewards memorising noise."""
    from sklearn.inspection import permutation_importance
    tem = te.dropna(subset=[target]).sample(n=min(40000, len(te)), random_state=0)
    r = permutation_importance(model, tem[feats].to_numpy(np.float32), tem[target].to_numpy(),
                               n_repeats=3, random_state=0, scoring='roc_auc', n_jobs=1)
    order = np.argsort(r.importances_mean)[::-1][:15]
    print('\n  top permutation importances (test set, AUC drop when shuffled):')
    for i in order:
        print('    %-28s %+.5f +/- %.5f' % (feats[i], r.importances_mean[i], r.importances_std[i]))


if __name__ == '__main__':
    run()
