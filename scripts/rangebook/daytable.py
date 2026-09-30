"""Day-level feature table and walk-forward helpers shared by the EURUSD model step
(model.py, forge/EURUSD_MODEL_PREREG.md) and the cross-pair check (crosspair_model.py)."""
import bisect, math
import numpy as np
import pandas as pd

GBM = dict(max_depth=3, learning_rate=0.05, max_iter=300, l2_regularization=1.0, min_samples_leaf=100, random_state=0)
YEARS = [2023, 2024, 2025, 2026]
EMBARGO = 5
P = ['sig', 'sig_rel', 'ewma_rel', 'yrange_rel', 'm5_rel', 'm20_rel', 'y_cfo', 'hmm_c', 'event_c', 'weekday', 'month']
IV = ['cvol', 'atm', 'skew', 'convexity', 'cvol_d1', 'cvol_d5', 'iv_rv']


def day_table(recs, cv):
    """recs: range-book records; cv: that instrument's CVOL rows (sorted by date).
    Every feature reads only days completed before the London open; IV uses the latest
    settle dated strictly before the day."""
    D = pd.DataFrame([{'date': r['date'], 'sig': r['sigmaPct'], 'hl50': r['hl50'], 'dayRange': r['dayRange'],
                       'cfo': r['closeFromOpen'], **r['pre'], **({'hl75': r['hl75'], 'hl90': r['hl90']} if 'hl75' in r else {})}
                      for r in recs])
    D['real'] = D['dayRange'] * D['hl50']                       # realized day range, % of open
    prev = D['real'].shift(1)
    D['ewma_rel'] = prev.ewm(alpha=0.06, adjust=False).mean() / D['hl50']
    D['yrange_rel'] = prev / D['hl50']
    D['m5_rel'] = prev.rolling(5).mean() / D['hl50']
    D['m20_rel'] = prev.rolling(20).mean() / D['hl50']
    D['sig_rel'] = D['sig'] / D['sig'].shift(1).rolling(20).median()
    D['y_cfo'] = D['cfo'].shift(1)
    dt = pd.to_datetime(D['date'])
    D['weekday'] = dt.dt.weekday; D['month'] = dt.dt.month
    D['hmm_c'] = D['hmm'].map({'RANGE': 0, 'TREND_up': 1, 'TREND_dn': 2})
    D['event_c'] = D['event'].map({'none': 0, 'high': 1, 'tier1': 2})
    cdates = [x['date'] for x in cv]
    def iv_for(date, lag=0):
        i = bisect.bisect_left(cdates, date) - 1 - lag
        return cv[i] if i >= 0 else None
    for col in ('cvol', 'atm', 'skew', 'convexity'):
        D[col] = [(iv_for(d) or {}).get(col) for d in D['date']]
    D['cvol_d1'] = D['cvol'] - [(iv_for(d, 1) or {}).get('cvol') for d in D['date']]
    D['cvol_d5'] = D['cvol'] - [(iv_for(d, 5) or {}).get('cvol') for d in D['date']]
    D['iv_rv'] = D['cvol'] / (D['sig'] * math.sqrt(252))
    D = D.dropna(subset=P + IV).reset_index(drop=True)
    D['year'] = pd.to_datetime(D['date']).dt.year
    D['logr'] = np.log(D['dayRange'])
    return D


def folds(df):
    """(train_idx, test_idx) per walk-forward year, with an embargo before each test year."""
    for y in YEARS:
        te = df.index[df['year'] == y]
        if not len(te): continue
        tr = df.index[df['date'] < f'{y}-01-01']
        yield tr[:-EMBARGO] if len(tr) > EMBARGO else tr, te


def walk(df, fit_predict):
    out = pd.Series(np.nan, index=df.index)
    for tr, te in folds(df):
        out.loc[te] = fit_predict(df.loc[tr], df.loc[te])
    return out


def boot_skill(loss_a, loss_b, groups, rng):
    """1 - sum(a)/sum(b) with a group-bootstrap 95% interval (rows grouped by `groups`)."""
    g = pd.DataFrame({'a': loss_a, 'b': loss_b, 'g': groups}).groupby('g').sum()
    a, b = g['a'].to_numpy(), g['b'].to_numpy()
    point = 1 - a.sum() / b.sum()
    idx = rng.integers(0, len(a), (1000, len(a)))
    vals = np.sort(1 - a[idx].sum(1) / b[idx].sum(1))
    return point, vals[25], vals[974]


def pinball(y, q, tau):
    return np.maximum(tau * (y - q), (tau - 1) * (y - q))
