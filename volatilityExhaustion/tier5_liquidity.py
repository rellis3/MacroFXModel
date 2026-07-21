"""
Tier 5 — does LIQUIDITY state improve the expansion composite? (the owner's proposal)

Hypothesis: two days with the same range/σ/session can be different markets depending
on HOW the move is financed — rising vs falling participation. We can't see spread or
order-book depth (mid candles only), but OANDA M1 TICK VOLUME is a real participation /
tick-activity proxy, and it's the honest slice of the idea we can test.

Features added at the London open (all causal, pre-08:00 bars only):
  rel_vol    Asia-session total tick volume / its trailing median   (>1 = busy today)
  vol_trend  mean volume in the 2nd half of Asia / 1st half         (>1 = accelerating)

Test: does adding {rel_vol, vol_trend} to the validated composite {expansion regime,
Asia compression, vov} improve the OOS London-open EXPANSION forecast? Pooled FX,
logistic, IS/OOS 60/40. Pre-registered: liquidity 'earns its place' only if the
augmented model beats the 3-feature composite on OOS Brier-skill.
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
    vol = m1['volume']
    nd = d['open'].size
    asia = np.full(nd, np.nan); ext = np.full(nd, np.nan)
    asia_vol = np.full(nd, np.nan); vtrend = np.full(nd, np.nan)
    for i in range(nd):
        s = sig[i]; O = d['open'][i]
        if not (s > 0 and O > 0):
            continue
        a, b = d['start'][i], d['end'][i]
        hi = m1['high'][a:b]; lo = m1['low'][a:b]; mm = mod[a:b]; vv = vol[a:b]
        pre = mm < T_MIN; post = mm >= T_MIN
        if pre.sum() < 60 or post.sum() < 120:
            continue
        hlT = hi[pre].max() - lo[pre].min()
        asia[i] = hlT / O / s
        ext[i] = (hi.max() - lo.min() - hlT) / O / s
        pv = vv[pre]
        asia_vol[i] = pv.sum()
        half = pv.size // 2
        if half >= 10 and pv[:half].sum() > 0:
            vtrend[i] = pv[half:].sum() / pv[:half].sum()
    # causal Asia-compression + causal relative volume (trailing medians)
    compr = np.full(nd, np.nan); relv = np.full(nd, np.nan)
    hA, hV = [], []
    for i in range(nd):
        if np.isfinite(asia[i]):
            if len(hA) >= 30:
                m = np.median(hA[-120:]);  compr[i] = asia[i] / m if m > 0 else np.nan
            hA.append(asia[i])
        if np.isfinite(asia_vol[i]):
            if len(hV) >= 30:
                m = np.median(hV[-120:]);  relv[i] = asia_vol[i] / m if m > 0 else np.nan
            hV.append(asia_vol[i])
    regime = ((st['exc_prev'] == 1) | (st['sig_accel'] > 1.10)).astype(float)
    X = np.column_stack([regime, -compr, st['vov'], relv, vtrend])   # cols 0..4
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
        thr = np.median(ext[:ntr]); y = (ext > thr).astype(float)
        mu = X[:ntr].mean(0); sd = X[:ntr].std(0); sd[sd == 0] = 1
        Xs = (X - mu) / sd
        Xtr_all.append(Xs[:ntr]); Xte_all.append(Xs[ntr:])
        ytr_all.append(y[:ntr]); yte_all.append(y[ntr:])
    Xtr = np.vstack(Xtr_all); Xte = np.vstack(Xte_all)
    ytr = np.concatenate(ytr_all); yte = np.concatenate(yte_all)

    print('=== does LIQUIDITY improve the London-open expansion composite? (pooled FX OOS) ===')
    tests = [
        ('composite (regime+compr+vov)', [0, 1, 2]),
        ('liquidity only (relv+vtrend)', [3, 4]),
        ('composite + liquidity',        [0, 1, 2, 3, 4]),
    ]
    res = {}
    for nm, cs in tests:
        a, s = auc_skill(Xtr, ytr, Xte, yte, cs)
        res[nm] = (a, s)
        print(f'  {nm:32} OOS AUC {a:.3f}  Brier-skill {100*s:+.2f}%')
    base_s = res['composite (regime+compr+vov)'][1]
    aug_s = res['composite + liquidity'][1]
    print(f'\n  liquidity earns its place (augmented > composite OOS): {aug_s > base_s}  '
          f'({100*aug_s:+.2f}% vs {100*base_s:+.2f}%)')
    print('  (tick volume only — no spread/depth in this data; magnitude, not direction)')


if __name__ == '__main__':
    run()
