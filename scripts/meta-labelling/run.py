#!/usr/bin/env python3
"""meta-labelling runner -- forge/META_LABELLING_PREREG.md (seed 20261115).

    python -X utf8 -I scripts/meta-labelling/run.py --selftest   # synthetic controls only (prereg 3.6)
    python -X utf8 -I scripts/meta-labelling/run.py              # selftest, power stage, then the registered run

Primary call = the bias-learner's OOS probability at the 21:00 horizon (analysis/output/bias-learner/evidence/
oos_predictions.parquet), side = sign(p - 0.5). Trade/R = the E0 trade of exit-on-fixed-entries through the unchanged
R machinery of scripts/slow-bias-clock/run.py (bid/ask M1, 07:00 -> 21:00 London, 1 sigma20 stop). A walk-forward
logistic meta-model (expanding, yearly refit, 5-session embargo) outputs act / stand aside.

Local files only; never R2 (R2_* env cleared by the imported module and here). Nothing after 2026-08-21 is read
(asserted). Writes analysis/output/meta-labelling/{RESULTS.md, results.json, selftest.json, power_sim.json,
entries.parquet, test_rows.parquet, evidence/<cell>/...}.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import math
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

for k in list(os.environ):
    if k.startswith('R2_'):
        del os.environ[k]
os.environ.setdefault('OMP_NUM_THREADS', '2')
os.environ.setdefault('MKL_NUM_THREADS', '2')
os.environ.setdefault('OPENBLAS_NUM_THREADS', '2')

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location('sbc', ROOT / 'scripts' / 'slow-bias-clock' / 'run.py')
sbc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sbc)
from pack import build_pack  # noqa: E402  (path inserted by sbc)

SLUG = 'meta-labelling'
PREREG = 'forge/META_LABELLING_PREREG.md'
SEED = 20261115
LOCKBOX = pd.Timestamp('2026-08-21')
PRIMARY_START = pd.Timestamp('2018-01-02')
TEST_YEARS = list(range(2019, 2027))
EMBARGO = 5
B_BOOT, BLOCK = 2000, 21
N_PLACEBO = 1000
Z_HOLM1 = 2.50            # 0.05/4 two-sided
Z_MDE = 3.34
OUT = ROOT / 'analysis' / 'output' / SLUG
PRED = ROOT / 'analysis' / 'output' / 'bias-learner' / 'evidence' / 'oos_predictions.parquet'
EVENTS = ROOT / 'analysis' / 'output' / 'post-release-drift-pooled' / 'events.parquet'
CELLS = [  # name, bar, design MDE
    ('dR_meta_all', 0.05, 0.033),
    ('dhit_meta_all', 0.03, 0.020),
    ('dSR_meta_all', 0.30, 0.85),
    ('dR_meta_conf', 0.05, 0.040),
]
CELL = {c[0]: c for c in CELLS}
FEAT = ['conf', 'beyond', 'atr_pct', 'vol_ratio', 'ev_today', 'mon', 'fri', 'gap_side', 'gap_abs', 'hit20',
        'hit5_all', 'h4_agree', 'g_gold', 'g_idx']
NUMERIC = [f for f in FEAT if f not in ('mon', 'fri', 'g_gold', 'g_idx', 'ev_today')] + ['ev_today']
log, die = sbc.log, sbc.die
NY = sbc.NY


# ───────────────────────────── inputs ─────────────────────────────

def _atr_pct(s: pd.Series) -> pd.Series:
    return s.rolling(252, min_periods=126).apply(lambda x: float((x <= x[-1]).mean()), raw=True)


def build_entries():
    """E0 R (both sides), the 4h slope, sigma20/60 at the last NY close before 07:00 London, its 252-day percentile, and
    the overnight gap (mid open of the last M1 bar before 17:00 NY on that close -> mid open of the 07:00 London bar)."""
    cache = OUT / 'entries.parquet'
    if cache.exists():
        return pd.read_parquet(cache), json.load(open(OUT / 'entries_counts.json'))
    m1 = {}

    def m1_cache(key):
        if key not in m1:
            log('reading bid/ask M1', key)
            m1[key] = sbc.read_bidask(key)
        return m1[key]

    daily = sbc.load_daily_all(m1_cache)
    frames = sbc.build_panel(daily, None)
    out, counts = [], {}
    for inst, grp, src, bakey, carry in sbc.INSTR:
        f = frames[inst]
        f = f.assign(atr_pct=_atr_pct(f['sig20']), vol_ratio=np.log(f['sig20'] / f['sig60']))
        M = sbc.M1Inst(m1_cache(bakey))
        E, cnt = sbc.r_entries(inst, M, f)
        gaps = []
        for d, cd in zip(E['date'], E['close_date']):
            dd = pd.Timestamp(d).date()
            e = M.idx(sbc.lon_epoch(dd, 7))
            c = pd.Timestamp(cd)
            Tny = int(datetime(c.year, c.month, c.day, 17, tzinfo=NY).timestamp())
            i = M.idx(Tny) - 1
            if 0 <= i < e and M.t[i] >= Tny - 3600:
                gaps.append(math.log(M.mo[e] / M.mo[i]))
            else:
                gaps.append(np.nan)
        E['gap'] = gaps
        cdx = pd.DatetimeIndex(E['close_date'])
        for c in ('sig20', 'sig60', 'atr_pct', 'vol_ratio'):
            E[c] = f[c].reindex(cdx).to_numpy()
        E['group'] = grp
        counts[inst] = cnt
        out.append(E[['date', 'inst', 'group', 'RL', 'RS', 'h4', 'close_date', 'gap', 'sig20', 'sig60', 'atr_pct',
                      'vol_ratio']])
        m1.pop(bakey, None)
        log('entries', inst, cnt)
    E = pd.concat(out, ignore_index=True)
    E['date'] = pd.to_datetime(E['date']).astype('datetime64[ns]')
    assert E['date'].max() <= LOCKBOX, 'LOCKBOX BREACH (entries)'
    OUT.mkdir(parents=True, exist_ok=True)
    E.to_parquet(cache)
    json.dump(counts, open(OUT / 'entries_counts.json', 'w'), indent=1)
    return E, counts


def event_dates():
    ev = pd.read_parquet(EVENTS)
    t = pd.to_datetime(ev['t'], utc=True).dt.tz_convert('Europe/London')
    return list(set(pd.to_datetime(t.dt.date).astype('datetime64[ns]')))


def load_primary():
    d = pd.read_parquet(PRED)
    d = d[d['h'] == '21:00'].copy()
    d['date'] = pd.to_datetime(d['date']).astype('datetime64[ns]')
    assert d['date'].max() <= LOCKBOX, 'LOCKBOX BREACH (primary)'
    return d[['date', 'inst', 'b0', 'p', 'y']]


def assemble(E, P, evd, side_mode='half'):
    """Join the call to its R and add the raw (pre-feature) columns. side_mode 'half' = sign(p - 0.5) (registered);
    'b0' = sign(p - b0) (descriptive alternative primary)."""
    X = P.merge(E, on=['date', 'inst'], how='inner')
    ref = 0.5 if side_mode == 'half' else X['b0']
    X['side'] = np.sign(X['p'] - ref).astype(int)
    X = X[X['side'] != 0].copy()
    X['R'] = np.where(X['side'] > 0, X['RL'], X['RS'])
    X['m'] = (X['R'] > 0).astype(float)
    X['conf'] = (X['p'] - 0.5).abs()
    X['beyond'] = X['side'] * (X['p'] - X['b0'])
    X['ev_today'] = X['date'].isin(evd).astype(float)
    return X.sort_values(['date', 'inst']).reset_index(drop=True)


def make_features(X, leak_hit20=False):
    """Features of prereg 3.3 that depend on past outcomes or the side. Everything is from rows dated < D
    (hit20, hit5_all) or known at 07:00 London on D (the rest). leak_hit20 = the selftest's deliberate one-day leak."""
    X = X.sort_values(['date', 'inst']).reset_index(drop=True).copy()
    X['gap_z'] = X['gap'] / X['sig20']
    X['gap_side'] = X['side'] * X['gap_z']
    X['gap_abs'] = X['gap_z'].abs()
    dow = X['date'].dt.dayofweek
    X['mon'] = (dow == 0).astype(float)
    X['fri'] = (dow == 4).astype(float)
    X['h4_agree'] = (X['side'] * np.sign(X['h4'])).astype(float)
    X['g_gold'] = (X['group'] == 'gold').astype(float)
    X['g_idx'] = (X['group'] == 'idx').astype(float)
    g = X.groupby('inst', sort=False)['m']
    if leak_hit20:
        X['hit20'] = g.transform(lambda s: s.rolling(20, min_periods=10).mean())
    else:
        X['hit20'] = g.transform(lambda s: s.shift(1).rolling(20, min_periods=10).mean())
    per = X.groupby('date')['m'].agg(['sum', 'count'])
    s5 = per['sum'].shift(1).rolling(5, min_periods=3).sum()
    c5 = per['count'].shift(1).rolling(5, min_periods=3).sum()
    X['hit5_all'] = X['date'].map(s5 / c5)
    return X


# ───────────────────────────── walk-forward meta-model ─────────────────────────────

def _fit_predict(Xtr, ytr, Xte, model='logit'):
    mu = np.nanmean(Xtr, 0)
    mu = np.where(np.isfinite(mu), mu, 0.0)
    Xtr = np.where(np.isfinite(Xtr), Xtr, mu)
    Xte = np.where(np.isfinite(Xte), Xte, mu)
    sd = Xtr.std(0)
    sd = np.where(sd > 0, sd, 1.0)
    Ztr, Zte = (Xtr - mu) / sd, (Xte - mu) / sd
    if model == 'logit':
        clf = LogisticRegression(C=1.0, max_iter=1000)
    else:
        from sklearn.ensemble import HistGradientBoostingClassifier
        clf = HistGradientBoostingClassifier(max_depth=2, max_iter=100, learning_rate=0.05, min_samples_leaf=200,
                                             random_state=SEED)
    clf.fit(Ztr, ytr)
    ptr = clf.predict_proba(Ztr)[:, 1]
    pte = clf.predict_proba(Zte)[:, 1]
    coef = clf.coef_[0].tolist() if model == 'logit' else None
    return ptr, pte, coef


def walk_forward(X, feats=FEAT, model='logit', label='m', window_years=None, years=TEST_YEARS):
    """Returns a copy of the test rows with p_meta, act (meta), act_c (strength-only), and per-year fit info."""
    X = X.reset_index(drop=True)
    U = np.array(sorted(X['date'].unique()))
    F = X[feats].to_numpy(float)
    y = X[label].to_numpy(float)
    d = X['date'].to_numpy()
    out, info = [], {}
    for Y in years:
        y0 = np.datetime64(f'{Y}-01-01')
        te = (d >= y0) & (d < np.datetime64(f'{Y + 1}-01-01'))
        if not te.any():
            continue
        pos = int(np.searchsorted(U, y0, 'left'))
        if pos - EMBARGO <= 0:
            continue
        cut = U[pos - EMBARGO]
        tr = d < cut
        if window_years:
            tr &= d >= (pd.Timestamp(cut) - pd.DateOffset(years=window_years)).to_datetime64()
        if tr.sum() < 1000 or len(np.unique(y[tr])) < 2:
            continue
        ptr, pte, coef = _fit_predict(F[tr], y[tr], F[te], model)
        thr = float(np.median(ptr))
        conf_tr = X['conf'].to_numpy(float)[tr]
        thr_c = float(np.median(conf_tr))
        T = X.loc[te].copy()
        T['p_meta'] = pte
        T['act'] = (pte >= thr).astype(int)
        T['act_c'] = (T['conf'].to_numpy(float) >= thr_c).astype(int)
        T['p_meta_pct'] = np.searchsorted(np.sort(ptr), pte, 'right') / len(ptr)
        out.append(T)
        info[Y] = {'n_train': int(tr.sum()), 'n_test': int(te.sum()), 'thr': thr, 'thr_conf': thr_c,
                   'train_hit': float(y[tr].mean()), 'frac_act': float(T['act'].mean()),
                   'coef': dict(zip(feats, coef)) if coef else None}
    return (pd.concat(out, ignore_index=True) if out else pd.DataFrame()), info


# ───────────────────────────── scoring ─────────────────────────────

def date_table(T, act_col='act', R_col='R', m_col='m'):
    """Per-date sums. Columns: R_all, n_all, R_act, n_act, m_all, m_act, R_c, n_c, book_act, book_all."""
    a = T[act_col].to_numpy(float)
    c = T['act_c'].to_numpy(float) if 'act_c' in T else np.zeros(len(T))
    R = T[R_col].to_numpy(float)
    m = T[m_col].to_numpy(float)
    df = pd.DataFrame({'date': T['date'].to_numpy(), 'R_all': R, 'n_all': 1.0, 'R_act': a * R, 'n_act': a,
                       'm_all': m, 'm_act': a * m, 'R_c': c * R, 'n_c': c})
    per = df.groupby('date').sum()
    per['book_act'] = per['R_act'] / per['n_all']
    per['book_all'] = per['R_all'] / per['n_all']
    return per


def _sharpe_w(x, w):
    sw = w.sum(-1)
    mu = (w * x).sum(-1) / sw
    var = (w * x * x).sum(-1) / sw - mu * mu
    return mu / np.sqrt(np.maximum(var, 1e-18)) * math.sqrt(252)


def stats_from(per, w=None):
    """All four cell statistics from a per-date table; w = (B, T) block counts or None."""
    A = per
    if w is None:
        w = np.ones((1, len(A)))
        single = True
    else:
        single = False
    S = lambda col: w @ A[col].to_numpy(float)  # noqa: E731
    ra = S('R_act') / np.maximum(S('n_act'), 1e-12)
    rall = S('R_all') / S('n_all')
    out = {
        'dR_meta_all': ra - rall,
        'dhit_meta_all': S('m_act') / np.maximum(S('n_act'), 1e-12) - S('m_all') / S('n_all'),
        'dSR_meta_all': _sharpe_w(A['book_act'].to_numpy(float), w) - _sharpe_w(A['book_all'].to_numpy(float), w),
        'dR_meta_conf': ra - S('R_c') / np.maximum(S('n_c'), 1e-12),
    }
    if single:
        out = {k: float(v[0]) for k, v in out.items()}
    return out


def score(T, rng, B=B_BOOT, act_col='act'):
    per = date_table(T, act_col)
    est = stats_from(per)
    cnt = sbc.block_counts(len(per), rng, B, BLOCK)
    bs = stats_from(per, cnt)
    mid = len(per) // 2
    h1, h2 = stats_from(per.iloc[:mid]), stats_from(per.iloc[mid:])
    res = {}
    for k in est:
        v = bs[k][np.isfinite(bs[k])]
        res[k] = {'est': est[k], 'lo': float(np.percentile(v, 2.5)), 'hi': float(np.percentile(v, 97.5)),
                  'se': float(v.std(ddof=1)), 'halves': [h1[k], h2[k]]}
    res['_n'] = {'rows': int(len(T)), 'dates': int(len(per)), 'frac_act': float(T[act_col].mean()),
                 'Rbar_all': float(T['R'].mean()), 'Rbar_act': float(T.loc[T[act_col] == 1, 'R'].mean()),
                 'Rbar_conf': float(T.loc[T['act_c'] == 1, 'R'].mean()), 'hit_all': float(T['m'].mean()),
                 'hit_act': float(T.loc[T[act_col] == 1, 'm'].mean()),
                 'SR_all': float(_sharpe_w(per['book_all'].to_numpy(float), np.ones((1, len(per))))[0]),
                 'SR_act': float(_sharpe_w(per['book_act'].to_numpy(float), np.ones((1, len(per))))[0]),
                 'mid_date': str(pd.Timestamp(per.index[mid]).date())}
    return res


def placebo(T, rng, n=N_PLACEBO):
    """Random same-fraction stand-aside: act permuted within instrument x test year."""
    T = T.reset_index(drop=True)
    key = T['inst'].astype(str) + '_' + T['date'].dt.year.astype(str)
    groups = [np.asarray(ix) for ix in T.groupby(key).indices.values()]
    a = T['act'].to_numpy()
    draws = {k: [] for k, _, _ in CELLS}
    for _ in range(n):
        ap = a.copy()
        for g in groups:
            ap[g] = a[g][rng.permutation(len(g))]
        st = stats_from(date_table(T.assign(act=ap)))
        for k in draws:
            draws[k].append(st[k])
    return {k: np.asarray(v) for k, v in draws.items()}


def cell_word(c, holm_p, plant1x):
    name, bar, dmde = CELL[c['name']]
    mde = max(dmde, Z_MDE * c['se_used'], c.get('sim_mde') or 0.0)
    c['mde_binding'] = mde
    c['powered'] = bool(mde <= bar and (plant1x is None or plant1x >= 0.8))
    sig = c['lo'] > 0 and holm_p < 0.05
    stable = all(h is not None and h > 0 for h in c['halves'])
    plc = c['placebo_pct'] >= 97.5
    c['gate'] = {'ci_lower_gt0': bool(c['lo'] > 0), 'holm_lt_0.05': bool(holm_p < 0.05), 'halves_same_sign': bool(stable),
                 'placebo_97_5': bool(plc), 'mirror_ok': bool(c['mirror_ok'])}
    if sig and stable and plc and c['mirror_ok'] and c['est'] >= bar:
        return 'VALIDATED'
    if sig:
        return 'CONTEXT'
    if c['powered'] and c['hi'] < bar:
        return 'NULL'
    return 'UNDERPOWERED'


def id_word(words):
    if words['dR_meta_all'] == 'VALIDATED' or words['dSR_meta_all'] == 'VALIDATED':
        return 'VALIDATED'
    if 'CONTEXT' in words.values() or 'VALIDATED' in words.values():
        return 'CONTEXT'
    if all(w == 'NULL' for w in words.values()):
        return 'NULL'
    return 'UNDERPOWERED'


def full_cells(T, rng, B=B_BOOT, n_plc=N_PLACEBO, sim_mde=None, plant1x=None):
    sc = score(T, rng, B)
    mir = score(T.assign(act=1 - T['act']), rng, B=500)
    plc = placebo(T, rng, n_plc)
    cells = []
    for name, bar, dmde in CELLS:
        c = dict(sc[name])
        c['name'], c['bar'], c['design_mde'] = name, bar, dmde
        pv = plc[name]
        c['placebo'] = {'mean': float(pv.mean()), 'sd': float(pv.std(ddof=1)), 'p2_5': float(np.percentile(pv, 2.5)),
                        'p97_5': float(np.percentile(pv, 97.5)), 'n': int(len(pv))}
        c['placebo_pct'] = float((pv < c['est']).mean() * 100)
        c['se_used'] = max(c['se'], c['placebo']['sd'])
        centre = c['placebo']['mean'] if name == 'dSR_meta_all' else 0.0
        c['p'] = sbc.pz(c['est'] - centre, c['se_used'])
        c['mirror'] = {k: mir[name][k] for k in ('est', 'lo', 'hi')}
        c['mirror_ok'] = not (mir[name]['lo'] > 0)
        if name == 'dR_meta_all' and sim_mde is not None:
            c['sim_mde'] = sim_mde
        cells.append(c)
    hp = sbc.holm([c['p'] for c in cells])
    words = {}
    for c, h in zip(cells, hp):
        c['holm_p'] = float(h)
        c['word'] = cell_word(c, h, (plant1x or {}).get(c['name']))
        words[c['name']] = c['word']
    return cells, words, sc['_n']


# ───────────────────────────── selftest (prereg 3.6) ─────────────────────────────

def synth_panel(rng, planted=0.0, n_dates=2000, persist=False):
    dates = pd.bdate_range('2018-01-02', periods=n_dates)
    insts = sbc.INST
    grp = [sbc.GROUP[i] for i in insts]
    T, N = len(dates), len(insts)
    common = rng.standard_normal(T)
    eps = rng.standard_normal((T, N))
    if persist:
        a = np.zeros((T, N))
        for t in range(1, T):
            a[t] = 0.9 * a[t - 1] + 0.44 * rng.standard_normal(N)
        eps = 0.6 * eps + a
    rows = pd.DataFrame({'date': np.repeat(dates.values, N), 'inst': np.tile(insts, T), 'group': np.tile(grp, T)})
    n = len(rows)
    rows['p'] = 0.5 + 0.03 * rng.standard_normal(n)
    rows['b0'] = 0.5 + 0.01 * rng.standard_normal(n)
    rows['side'] = np.where(rows['p'] > 0.5, 1, -1)
    rows['conf'] = (rows['p'] - 0.5).abs()
    rows['beyond'] = rows['side'] * (rows['p'] - rows['b0'])
    for c in ('atr_pct', 'vol_ratio', 'gap', 'h4'):
        rows[c] = rng.standard_normal(n)
    rows['atr_pct'] = rng.uniform(0, 1, n)
    rows['h4'] = rng.choice([-1, 1], n)
    rows['sig20'] = 1.0
    rows['ev_today'] = (rng.uniform(size=n) < 0.1).astype(float)
    plant_x = rng.standard_normal(n)
    rows['vol_ratio'] = plant_x if planted else rows['vol_ratio']
    base = 0.75 * (0.3 * np.repeat(common, N) + 0.954 * eps.ravel()) - 0.02
    R = base + planted * plant_x
    rows['R'] = np.maximum(R, -1.0)
    rows['m'] = (rows['R'] > 0).astype(float)
    rows['date'] = rows['date'].astype('datetime64[ns]')
    return rows, plant_x


def selftest():
    rng = np.random.default_rng(SEED)
    res = {}
    # (a) planted act-signal
    Xp, px = synth_panel(rng, planted=0.25)
    Fp = make_features(Xp)
    Tp, _ = walk_forward(Fp)
    sp = score(Tp, rng, B=300)
    res['planted_C1'] = {k: sp['dR_meta_all'][k] for k in ('est', 'lo', 'hi')}
    # (e) sanity: top quintile of p_meta has the highest mean planted feature
    q = pd.qcut(Tp['p_meta'].rank(method='first'), 5, labels=False)
    mq = Tp.groupby(q)['vol_ratio'].mean()
    res['sanity_quintile_means'] = mq.round(3).tolist()
    # (b) null world
    Xn, _ = synth_panel(rng, planted=0.0)
    Fn = make_features(Xn)
    Tn, _ = walk_forward(Fn)
    cells_n, words_n, _ = full_cells(Tn, rng, B=300, n_plc=100)
    res['null'] = {c['name']: {k: c[k] for k in ('est', 'lo', 'hi', 'placebo_pct')} | {'word': c['word']} for c in cells_n}
    # (c) outcome fed in
    Fc = Fn.copy()
    Fc['h4_agree'] = Fc['m']
    Tc, _ = walk_forward(Fc)
    res['canary_outcome_C1'] = score(Tc, rng, B=100)['dR_meta_all']['est']
    # (d) one-day leak in hit20 (outcome persistence world), and feature invariance to future outcomes
    Xs, _ = synth_panel(rng, planted=0.0, persist=True)
    Ts_clean, _ = walk_forward(make_features(Xs))
    Ts_leak, _ = walk_forward(make_features(Xs, leak_hit20=True))
    res['leak_hit20_C1'] = [score(Ts_clean, rng, B=100)['dR_meta_all']['est'], score(Ts_leak, rng, B=100)['dR_meta_all']['est']]
    D = pd.Timestamp('2021-06-15')
    X2 = Xs.copy()
    fut = X2['date'] >= D
    X2.loc[fut, 'R'] = rng.standard_normal(int(fut.sum()))
    X2['m'] = (X2['R'] > 0).astype(float)
    f1 = make_features(Xs).set_index(['date', 'inst'])
    f2 = make_features(X2).set_index(['date', 'inst'])
    sel = f1.index.get_level_values(0) <= D
    inv_ok = bool(np.allclose(f1.loc[sel, FEAT].fillna(-9).to_numpy(float), f2.loc[sel, FEAT].fillna(-9).to_numpy(float)))
    res['features_invariant_to_future_R'] = inv_ok
    # (f) R hand paths (slow-bias-clock's own check)
    ro = np.array([-0.02, 0.3, 0.5, 0.8]); rl = np.array([-0.05, 0.1, 0.2, 0.6])
    ro2 = np.array([-0.02, -0.5, -1.4, 0.0]); rl2 = np.array([-0.05, -0.9, -1.6, -0.2])
    ro3 = np.array([-0.02, -0.5, -0.8, 0.0]); rl3 = np.array([-0.05, -1.2, -1.6, -0.2])
    rh = [sbc.trade_R(ro, rl, 3), sbc.trade_R(ro2, rl2, 3), sbc.trade_R(ro3, rl3, 3)]
    res['R_hand'] = rh
    nC1 = res['null']['dR_meta_all']
    ok = {
        'a_planted_C1_lo_gt0': res['planted_C1']['lo'] > 0,
        'a_planted_C1_ge_bar': res['planted_C1']['est'] >= 0.05,
        'b_null_C1_ci_includes0': nC1['lo'] <= 0 <= nC1['hi'],
        'b_null_no_cell_validated': 'VALIDATED' not in words_n.values(),
        'c_outcome_canary_blows_up': res['canary_outcome_C1'] > 0.4,
        'd_leak_lifts_C1': res['leak_hit20_C1'][1] > res['leak_hit20_C1'][0] + 0.01,
        'd_features_invariant_to_future_R': inv_ok,
        'e_sanity_top_quintile_highest': int(np.argmax(mq.to_numpy())) == len(mq) - 1,
        'f_R_hand_exact': abs(rh[0] - 0.8) < 1e-12 and abs(rh[1] + 1.4) < 1e-12 and abs(rh[2] + 1.0) < 1e-12,
    }
    res['checks'] = ok
    res['passed'] = all(ok.values())
    log('selftest', json.dumps(res, default=float))
    return res


# ───────────────────────────── power stage (prereg 3.7) ─────────────────────────────

GAMMAS = (0.05, 0.10, 0.15, 0.25, 0.40)


def shift_outcomes(F, k):
    """Common circular date shift of (R, m) on the common date grid, same offset for every instrument."""
    U = np.array(sorted(F['date'].unique()))
    pos = {d: i for i, d in enumerate(U)}
    src = F.set_index(['date', 'inst'])[['R']]
    j = F['date'].map(pos).to_numpy()
    tgt = U[(j + k) % len(U)]
    key = pd.MultiIndex.from_arrays([pd.DatetimeIndex(tgt), F['inst']])
    Rn = src['R'].reindex(key).to_numpy()
    G = F.copy()
    G['R'] = Rn
    G = G[np.isfinite(G['R'])].reset_index(drop=True)
    G['m'] = (G['R'] > 0).astype(float)
    return G


def power_stage(F, rng, runs=30):
    res = {'gammas': list(GAMMAS), 'runs': runs, 'rows': []}
    U = sorted(F['date'].unique())
    for g in GAMMAS:
        det, ests, srs = 0, [], []
        for r in range(runs):
            k = int(rng.integers(250, min(1500, len(U) - 1)))
            G = shift_outcomes(F, k)
            z = rng.standard_normal(len(G))
            G['R'] = G['R'] + g * z
            G['m'] = (G['R'] > 0).astype(float)
            G['zplant'] = z
            T, _ = walk_forward(G, feats=FEAT + ['zplant'])
            sc = score(T, rng, B=300)
            c1 = sc['dR_meta_all']
            ests.append(c1['est'])
            srs.append(sc['dSR_meta_all']['est'])
            det += int(c1['est'] / c1['se'] >= Z_HOLM1)
        row = {'gamma': g, 'detect': det / runs, 'mean_C1': float(np.mean(ests)), 'mean_dSR': float(np.mean(srs))}
        res['rows'].append(row)
        log('power', row)
    rows = res['rows']
    mde = None
    for a, b in zip(rows, rows[1:]):
        if a['detect'] >= 0.8:
            mde = a['mean_C1']
            break
        if a['detect'] < 0.8 <= b['detect']:
            w = (0.8 - a['detect']) / max(b['detect'] - a['detect'], 1e-9)
            mde = a['mean_C1'] + w * (b['mean_C1'] - a['mean_C1'])
            break
    res['sim_mde_C1'] = mde
    return res


# ───────────────────────────── evidence packs ─────────────────────────────

def _est_R(r):
    a = r['side'].to_numpy(float)
    o = r['outcome'].to_numpy(float)
    return float((a * o).sum() / max(a.sum(), 1e-12) - o.mean())


def _est_conf(r):
    a = r['side'].to_numpy(float)
    c = r['act_c'].to_numpy(float)
    o = r['outcome'].to_numpy(float)
    return float((a * o).sum() / max(a.sum(), 1e-12) - (c * o).sum() / max(c.sum(), 1e-12))


def _est_SR(r):
    df = pd.DataFrame({'date': r['date'].to_numpy(), 'x': r['side'].to_numpy(float) * r['outcome'].to_numpy(float),
                       'o': r['outcome'].to_numpy(float), 'n': 1.0})
    per = df.groupby('date').sum()
    ba, bb = per['x'] / per['n'], per['o'] / per['n']
    if len(per) < 30 or ba.std() == 0:
        return float('nan')
    return float(ba.mean() / ba.std() * math.sqrt(252) - bb.mean() / bb.std() * math.sqrt(252))


def _planter(est_fn):
    """Remove the real effect, then plant `effect`: outcome += delta on acted rows, delta solved (secant) so the
    statistic equals `effect` exactly (the brief: plant on rows with the real effect removed)."""
    def plant(r, effect, rng):
        a = r['side'].to_numpy(float)
        o = r['outcome'].to_numpy(float)

        def f(dl):
            return est_fn(r.assign(outcome=o + dl * a)) - effect
        x0, x1 = 0.0, 0.1
        f0, f1 = f(x0), f(x1)
        for _ in range(8):
            if not np.isfinite(f1) or abs(f1 - f0) < 1e-15:
                break
            x0, x1, f0 = x1, x1 - f1 * (x1 - x0) / (f1 - f0), f1
            f1 = f(x1)
            if abs(f1) < 1e-6:
                break
        return r.assign(outcome=o + x1 * a)
    return plant


def _leak(r, rng):
    o = r['outcome'].to_numpy(float)
    return r.assign(side=(o > 0).astype(int), signal=o)


def make_packs(T, cells_by_name, words):
    packs = {}
    base = pd.DataFrame({'date': T['date'], 'inst': T['inst'], 'signal': T['p_meta'], 'side': T['act'].astype(int),
                         'act_c': T['act_c'].astype(int)})
    specs = {
        'dR_meta_all': (base.assign(outcome=T['R'].to_numpy()), _est_R, 'R per traded day minus R per day (act-all)'),
        'dhit_meta_all': (base.assign(outcome=T['m'].to_numpy()), _est_R, 'hit rate on acted days minus all days'),
        'dSR_meta_all': (base.assign(outcome=T['R'].to_numpy()), _est_SR, 'annualised Sharpe of the acted book minus act-all'),
        'dR_meta_conf': (base.assign(outcome=T['R'].to_numpy()), _est_conf, 'R per meta-acted day minus R per strength-only-acted day'),
    }
    for name, (rows, fn, unit) in specs.items():
        c = cells_by_name[name]
        tmp = OUT / f'_build_{name}'
        notes = ('Rows = every bias-learner call 2019-01 -> 2026-08-21 (test years of the walk-forward meta-model). '
                 'side = act (1 acted, 0 stood aside); signal = the meta probability. The pack placebo shuffles act '
                 'across dates within instrument = a random stand-aside of the same fraction (the runner\'s own '
                 'placebo permutes within instrument x year, 1000 draws, and is the binding one). Plants remove the '
                 'real estimate first, then add the effect on acted rows. Buckets = R (or hit) by decile of the meta '
                 'probability: a working filter is a rising staircase. Canary: act = 1{outcome > 0}. The pack '
                 'bootstraps dates iid; the runner\'s 21-day block CI is the binding one. '
                 f'Runner: est {c["est"]:+.4f} [{c["lo"]:+.4f}, {c["hi"]:+.4f}], placebo pct {c["placebo_pct"]:.0f}, '
                 f'word {c["word"]}.')
        pk = build_pack(rows, slug=f'{SLUG}:{name}', out=str(tmp), estimate_fn=fn, bar=c['bar'], unit=unit,
                        plant_fn=_planter(fn), leak_fn=_leak, verdict_word=c['word'], seed=SEED,
                        B=600 if name == 'dSR_meta_all' else 1000, n_placebo=400 if name == 'dSR_meta_all' else 500,
                        n_plants=20 if name == 'dSR_meta_all' else 40, notes=notes)
        dest = OUT / 'evidence' / name
        if dest.exists():
            import shutil
            shutil.rmtree(dest)
        dest.parent.mkdir(parents=True, exist_ok=True)
        os.replace(tmp / 'evidence', dest)
        try:
            tmp.rmdir()
        except OSError:
            pass
        packs[name] = pk
        pc = {x['multiple_of_bar']: x['detected_share'] for x in pk['positive_control']}
        log('pack', name, pk['diagnosis']['label'][:40], 'plant1x', pc.get(1.0))
    return packs


# ───────────────────────────── descriptive arms ─────────────────────────────

def single_feature_rules(F, rng):
    """For each non-dummy feature: act on the side of its training median that training favours (mean R)."""
    out = []
    feats = ['conf', 'beyond', 'atr_pct', 'vol_ratio', 'ev_today', 'gap_side', 'gap_abs', 'hit20', 'hit5_all',
             'h4_agree', 'mon', 'fri']
    U = np.array(sorted(F['date'].unique()))
    d = F['date'].to_numpy()
    for f in feats:
        parts = []
        for Y in TEST_YEARS:
            y0 = np.datetime64(f'{Y}-01-01')
            te = (d >= y0) & (d < np.datetime64(f'{Y + 1}-01-01'))
            pos = int(np.searchsorted(U, y0, 'left'))
            if not te.any() or pos - EMBARGO <= 0:
                continue
            tr = d < U[pos - EMBARGO]
            x = F[f].to_numpy(float)
            med = float(np.nanmedian(x[tr]))
            hi_tr = x[tr] > med if f in ('ev_today', 'mon', 'fri', 'h4_agree') else x[tr] >= med
            Rtr = F['R'].to_numpy(float)[tr]
            ok = np.isfinite(x[tr])
            up = np.nanmean(Rtr[ok & hi_tr]) >= np.nanmean(Rtr[ok & ~hi_tr])
            xt = x[te]
            hi_te = xt > med if f in ('ev_today', 'mon', 'fri', 'h4_agree') else xt >= med
            act = np.where(np.isfinite(xt), hi_te == up, True).astype(int)
            parts.append(F.loc[te].assign(act=act, act_c=0))
        T = pd.concat(parts, ignore_index=True)
        sc = score(T, rng, B=1000)
        c = sc['dR_meta_all']
        out.append({'feature': f, 'est': c['est'], 'lo': c['lo'], 'hi': c['hi'], 'p': sbc.pz(c['est'], c['se']),
                    'frac_act': sc['_n']['frac_act']})
    keep = sbc.bh([o['p'] for o in out], 0.10)
    for o, k in zip(out, keep):
        o['bh_pass'] = bool(k)
    return out


def deciles(T):
    q = pd.qcut(T['p_meta'].rank(method='first'), 10, labels=[f'D{i}' for i in range(1, 11)])
    g = T.groupby(q, observed=True)
    return [{'decile': str(k), 'n': int(len(v)), 'Rbar': float(v['R'].mean()), 'hit': float(v['m'].mean()),
             'p_meta': float(v['p_meta'].mean())} for k, v in g]


def sized_arm(T):
    w = 2.0 * T['p_meta_pct'].to_numpy(float)
    df = pd.DataFrame({'date': T['date'], 'x': w * T['R'].to_numpy(float), 'o': T['R'].to_numpy(float), 'n': 1.0})
    per = df.groupby('date').sum()
    a, b = per['x'] / per['n'], per['o'] / per['n']
    return {'mean_size': float(w.mean()), 'SR_sized': float(a.mean() / a.std() * math.sqrt(252)),
            'SR_all': float(b.mean() / b.std() * math.sqrt(252)),
            'Rbar_per_unit_risk': float((w * T['R']).sum() / w.sum())}


# ───────────────────────────── results ─────────────────────────────

def fmt(x, nd=4):
    return 'n/a' if x is None or (isinstance(x, float) and not np.isfinite(x)) else f'{x:+.{nd}f}'


def write_results(res):
    cells = res['cells']
    L = ['# meta-labelling — results', '',
         f'Prereg: `{PREREG}`. Seed {SEED}. Run {res["ranAt"][:10]}. Data to 2026-08-21 (lockbox); nothing later read.', '',
         f'## Verdict: **{res["id_word"]}** (ledger id `meta-labelling`)', '',
         '| Cell | Statistic | Estimate [95% CI, 21-day blocks] | Bar | Random same-fraction placebo mean / 97.5th pct / real pct | Halves H1 / H2 | Mirror (stood-aside days) | SE used | Holm p | Binding MDE | Pack 1× plant | Word |',
         '|---|---|---|---|---|---|---|---|---|---|---|---|']
    for c in cells:
        L.append(f'| {c["name"]} | {c["label"]} | {fmt(c["est"])} [{fmt(c["lo"])}, {fmt(c["hi"])}] | {c["bar"]} | '
                 f'{fmt(c["placebo"]["mean"])} / {fmt(c["placebo"]["p97_5"])} / {c["placebo_pct"]:.0f} | '
                 f'{fmt(c["halves"][0])} / {fmt(c["halves"][1])} | {fmt(c["mirror"]["est"])} [{fmt(c["mirror"]["lo"])}, {fmt(c["mirror"]["hi"])}] | '
                 f'{c["se_used"]:.4f} | {c["holm_p"]:.3f} | {c["mde_binding"]:.3f} | {c.get("plant1x")} | **{c["word"]}** |')
    n = res['n']
    L += ['', f'Test rows {n["rows"]} on {n["dates"]} dates (2019-01 → 2026-08-21); acted on {n["frac_act"]:.1%}. '
          f'R per day: act-all {n["Rbar_all"]:+.4f}R, meta-acted {n["Rbar_act"]:+.4f}R, strength-only-acted {n["Rbar_conf"]:+.4f}R. '
          f'Hit: all {n["hit_all"]:.3f}, acted {n["hit_act"]:.3f}. Book Sharpe: act-all {n["SR_all"]:+.2f}, meta {n["SR_act"]:+.2f}.', '',
          '## Power stage (prereg 3.7; real effect removed by a common circular date shift, planted feature through the whole walk-forward)', '',
          '| γ (R per SD) | detected (z ≥ 2.50) | mean realised C1 | mean realised ΔSharpe |', '|---|---|---|---|']
    for r in res['power']['rows']:
        L.append(f'| {r["gamma"]} | {r["detect"]:.0%} | {r["mean_C1"]:+.4f} | {r["mean_dSR"]:+.3f} |')
    L += ['', f'Simulated MDE (C1): {fmt(res["power"]["sim_mde_C1"])}R.', '',
          '## R and hit by decile of the meta probability (a working filter is a rising staircase)', '',
          '| decile | n | mean p_meta | R̄ | hit |', '|---|---|---|---|---|']
    for d in res['deciles']:
        L.append(f'| {d["decile"]} | {d["n"]} | {d["p_meta"]:.3f} | {d["Rbar"]:+.4f} | {d["hit"]:.3f} |')
    L += ['', '## Decomposition (BH q = 0.10; candidates only)', '', '| single-feature rule | ΔR vs all [95% CI] | acted | p | BH |', '|---|---|---|---|---|']
    for o in res['single_feature']:
        L.append(f'| {o["feature"]} | {fmt(o["est"])} [{fmt(o["lo"])}, {fmt(o["hi"])}] | {o["frac_act"]:.0%} | {o["p"]:.3f} | {"pass" if o["bh_pass"] else "–"} |')
    for g in res['by_group']:
        L.append(f'| C1 in {g["group"]} | {fmt(g["est"])} [{fmt(g["lo"])}, {fmt(g["hi"])}] | {g["frac_act"]:.0%} | {g["p"]:.3f} | {"pass" if g["bh_pass"] else "–"} |')
    L += ['', '## Descriptive arms (not scored)', '', '| arm | C1 ΔR | C2 Δhit | C3 ΔSharpe | C4 vs strength | acted |', '|---|---|---|---|---|---|']
    for k, v in res['arms'].items():
        L.append(f'| {k} | {fmt(v["dR_meta_all"])} | {fmt(v["dhit_meta_all"])} | {fmt(v["dSR_meta_all"], 3)} | {fmt(v["dR_meta_conf"])} | {v["frac_act"]:.0%} |')
    s = res['sized']
    L += ['', f'Sized arm (size = 2 × training percentile of p_meta, mean {s["mean_size"]:.2f}): Sharpe {s["SR_sized"]:+.2f} vs act-all {s["SR_all"]:+.2f}; R per unit risk {s["Rbar_per_unit_risk"]:+.4f}.', '',
          '## Evidence packs', '', '| Cell | Diagnosis | Pack estimate [iid CI] | placebo pct | plants 0.5×/1×/2× | halves | canary | pack |', '|---|---|---|---|---|---|---|---|']
    for name, pk in res.get('packs', {}).items():
        pc = '/'.join(f'{x["detected_share"]:.0%}' for x in pk['positive_control'])
        hv = ' / '.join(fmt(h['estimate']) for h in pk['by_half'])
        L.append(f'| {name} | {pk["diagnosis"]["label"]} | {fmt(pk["estimate"])} [{fmt(pk["ci"][0])}, {fmt(pk["ci"][1])}] | '
                 f'{pk["placebo"]["real_percentile"]:.0f} | {pc} | {hv} | {fmt(pk["lookahead_canary"]["estimate_with_leak"])} | '
                 f'[pack](evidence/{name}/EVIDENCE.md) |')
    L += ['', '## What this changes', '', '*(written by hand after the run, prereg §8)*', '']
    (OUT / 'RESULTS.md').write_text('\n'.join(L) + '\n', encoding='utf-8')


LABELS = {'dR_meta_all': 'R̄(acted) − R̄(all)', 'dhit_meta_all': 'hit(acted) − hit(all)',
          'dSR_meta_all': 'Sharpe(meta book) − Sharpe(act-all)', 'dR_meta_conf': 'R̄(meta acted) − R̄(strength-only acted)'}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--selftest', action='store_true')
    ap.add_argument('--skip-packs', action='store_true')
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    st = selftest()
    json.dump(st, open(OUT / 'selftest.json', 'w'), indent=1, default=float)
    if not st['passed']:
        die('selftest failed: ' + json.dumps(st['checks']))
    if a.selftest:
        print('SELFTEST PASSED')
        return
    rng = np.random.default_rng(SEED)
    E, counts = build_entries()
    P = load_primary()
    evd = event_dates()
    X = assemble(E, P, evd)
    F = make_features(X)
    assert F['date'].max() <= LOCKBOX
    log('rows', len(F), 'dates', F['date'].nunique(), 'side long share', float((F['side'] > 0).mean()))

    # power stage first (written before any real C1-C4 estimate)
    pw = power_stage(F, rng)
    json.dump(pw, open(OUT / 'power_sim.json', 'w'), indent=1, default=float)

    # registered model
    T, info = walk_forward(F)
    T.to_parquet(OUT / 'test_rows.parquet')
    cells, words, n = full_cells(T, rng, sim_mde=pw['sim_mde_C1'])
    for c in cells:
        c['label'] = LABELS[c['name']]
    res = {'id': SLUG, 'seed': SEED, 'B': B_BOOT, 'block': BLOCK, 'prereg': PREREG,
           'branch': 'claude/signal-bot-bias-analysis-bwr1qv',
           'ranAt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'selftest': st, 'entries_counts': counts,
           'rows_all': int(len(F)), 'n': n, 'fits': {str(k): v for k, v in info.items()}, 'power': pw}
    log('cells', {c['name']: (round(c['est'], 4), round(c['lo'], 4), round(c['hi'], 4), c['word']) for c in cells})

    # descriptive arms
    arms = {}
    for nm, kw in (('GBM (depth 2)', {'model': 'gbm'}), ('rolling 3-year window', {'window_years': 3})):
        Ta, _ = walk_forward(F, **kw)
        s = stats_from(date_table(Ta))
        s['frac_act'] = float(Ta['act'].mean())
        arms[nm] = s
    Xb = make_features(assemble(E, P, evd, side_mode='b0'))
    Tb, _ = walk_forward(Xb)
    sb = stats_from(date_table(Tb))
    sb['frac_act'] = float(Tb['act'].mean())
    sb['Rbar_all'] = float(Tb['R'].mean())
    arms['primary side = sign(p − b0)'] = sb
    res['arms'] = arms
    res['sized'] = sized_arm(T)
    res['deciles'] = deciles(T)
    sf = single_feature_rules(F, rng)
    bg = []
    for g in ('fx', 'gold', 'idx'):
        Tg = T[T['group'] == g]
        sc = score(Tg, rng, B=1000)['dR_meta_all']
        bg.append({'group': g, 'est': sc['est'], 'lo': sc['lo'], 'hi': sc['hi'], 'p': sbc.pz(sc['est'], sc['se']),
                   'frac_act': float(Tg['act'].mean())})
    keep = sbc.bh([o['p'] for o in sf] + [o['p'] for o in bg], 0.10)
    for o, k in zip(sf + bg, keep):
        o['bh_pass'] = bool(k)
    res['single_feature'], res['by_group'] = sf, bg
    res['by_year'] = {str(y): {'frac_act': float(v['act'].mean()), 'Rbar_all': float(v['R'].mean()),
                               'Rbar_act': float(v.loc[v['act'] == 1, 'R'].mean())} for y, v in T.groupby(T['date'].dt.year)}
    res['by_inst_frac_act'] = T.groupby('inst')['act'].mean().round(3).to_dict()

    # evidence packs (plant1x feeds the POWERED test of the verdict)
    if not a.skip_packs:
        packs = make_packs(T, {c['name']: c for c in cells}, words)
        res['packs'] = {k: {kk: v[kk] for kk in ('estimate', 'ci', 'placebo', 'positive_control', 'by_half', 'diagnosis',
                                                 'lookahead_canary', 'without_top1pct')} for k, v in packs.items()}
        plant1x = {k: next(x['detected_share'] for x in v['positive_control'] if x['multiple_of_bar'] == 1.0)
                   for k, v in packs.items()}
        hp = [c['holm_p'] for c in cells]
        for c, h in zip(cells, hp):
            c['plant1x'] = plant1x.get(c['name'])
            c['word'] = cell_word(c, h, c['plant1x'])
            words[c['name']] = c['word']
    res['cells'] = cells
    res['words'] = words
    res['id_word'] = id_word(words)
    json.dump(res, open(OUT / 'results.json', 'w'), indent=1, default=float)
    write_results(res)
    log('DONE', res['id_word'], words, f'{time.time():.0f}')


if __name__ == '__main__':
    main()
