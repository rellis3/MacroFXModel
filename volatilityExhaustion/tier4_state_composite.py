"""
Tier 4 — compose ONLY the survivors, at the honest decision point (the London open).

Survivors from Tiers 1-3 (all MAGNITUDE, none directional):
  * expansion regime      — prior day exceeded 75th OR σ accelerating (daytype study)
  * Asia compression      — a quiet Asia predicts a bigger London+ move (Tier 2, 5/6 OOS)
  * vol continuity        — realised/forecast ratio persists (~+0.09, Tier 3 #5)
NON-survivors (deliberately excluded so this is not a folklore blend):
  * directional conviction / "Opportunity Index" — only worked on NQ, not FX (Tier 1)
  * remaining-budget exits — the fuel-tank premise is FALSE, vol clusters (Tier 3 #4)

So the only thing there is honest evidence to compose is an EXPANSION / range-budget
state: "at the London open, how much room is left in today's move?" — a magnitude
forecast that feeds sizing / targets / breakout-vs-fade posture, NOT a direction.

Test: at T=480 (London open), predict whether the London+ extension exceeds its median,
pooled FX, logistic, IS/OOS. Does the 3-feature composite beat each feature alone OOS?
"""
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, brier_score_loss
from budget_research_lib import FX_MAJORS, build_daily, state_features

T_MIN = 480
TRAIN_FRAC = 0.60


def day_table(pair):
    dd = build_daily(pair); st = state_features(dd)
    d = dd['daily']; m1 = dd['m1']; sig = dd['sigma']; mod = d['min_of_day_all']
    nd = d['open'].size
    asia = np.full(nd, np.nan); ext = np.full(nd, np.nan)
    for i in range(nd):
        s = sig[i]; O = d['open'][i]
        if not (s > 0 and O > 0):
            continue
        a, b = d['start'][i], d['end'][i]
        hi = m1['high'][a:b]; lo = m1['low'][a:b]; mm = mod[a:b]
        pre = mm < T_MIN; post = mm >= T_MIN
        if pre.sum() < 60 or post.sum() < 120:
            continue
        hlT = hi[pre].max() - lo[pre].min()
        asia[i] = hlT / O / s
        ext[i] = (hi.max() - lo.min() - hlT) / O / s
    # causal Asia-compression vs trailing median
    compr = np.full(nd, np.nan); hist = []
    for i in range(nd):
        if np.isfinite(asia[i]):
            if len(hist) >= 30:
                med = np.median(hist[-120:])
                if med > 0:
                    compr[i] = asia[i] / med
            hist.append(asia[i])
    regime = ((st['exc_prev'] == 1) | (st['sig_accel'] > 1.10)).astype(float)
    vov = st['vov']
    X = np.column_stack([regime, -compr, vov])          # -compr: compressed => expansion
    # label: London+ extension above its median (per-instrument median, IS-safe via split)
    valid = np.isfinite(X).all(axis=1) & np.isfinite(ext)
    return X[valid], ext[valid]


def auc_skill(Xtr, ytr, Xte, yte, cols):
    if len(np.unique(ytr)) < 2:
        return float('nan'), float('nan')
    clf = LogisticRegression(max_iter=1000).fit(Xtr[:, cols], ytr)
    p = clf.predict_proba(Xte[:, cols])[:, 1]
    base = ytr.mean()
    b = brier_score_loss(yte, p); b0 = brier_score_loss(yte, np.full(yte.size, base))
    return roc_auc_score(yte, p), 1 - b / b0


def run():
    Xtr_all, ytr_all, Xte_all, yte_all = [], [], [], []
    for pair in FX_MAJORS:
        X, ext = day_table(pair)
        n = X.shape[0]; ntr = int(n * TRAIN_FRAC)
        # label vs the IS median only (no lookahead)
        thr = np.median(ext[:ntr])
        y = (ext > thr).astype(float)
        # standardize on train
        mu = X[:ntr].mean(0); sd = X[:ntr].std(0); sd[sd == 0] = 1
        Xs = (X - mu) / sd
        Xtr_all.append(Xs[:ntr]); Xte_all.append(Xs[ntr:])
        ytr_all.append(y[:ntr]); yte_all.append(y[ntr:])
    Xtr = np.vstack(Xtr_all); Xte = np.vstack(Xte_all)
    ytr = np.concatenate(ytr_all); yte = np.concatenate(yte_all)

    print('=== London-open EXPANSION forecast (pooled FX, OOS) — compose survivors ===')
    names = ['regime only', 'compression only', 'vov only', 'ALL THREE']
    colsets = [[0], [1], [2], [0, 1, 2]]
    best_single = 0
    for nm, cs in zip(names, colsets):
        a, s = auc_skill(Xtr, ytr, Xte, yte, cs)
        print(f'  {nm:18} OOS AUC {a:.3f}  Brier-skill {100*s:+.2f}%')
        if nm != 'ALL THREE':
            best_single = max(best_single, s)
    a_all, s_all = auc_skill(Xtr, ytr, Xte, yte, [0, 1, 2])
    print(f'\n  composite beats best single component OOS: {s_all > best_single}  '
          f'({100*s_all:+.2f}% vs {100*best_single:+.2f}%)')
    print('  Honest scope: this forecasts RANGE MAGNITUDE at the London open (room-left),'
          '\n  not direction. It feeds sizing / target width / breakout-vs-fade posture.')


if __name__ == '__main__':
    run()
