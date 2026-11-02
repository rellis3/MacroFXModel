"""stress-filter-hold: does stepping down in a stressed market improve holding NQ, beyond vol-target sizing?

Pre-registered in forge/STRESS_FILTER_HOLD_PREREG.md (commit 5253ba8d) before this script existed.
Order: controls and MDEs first (printed and saved), then the scored cells, then the secondary family.

Usage: python -I scripts/stress-filter-hold/run.py      (MFX_DATA_ROOT = checkout holding features/, default repo root)
"""
import json
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import norm

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.environ.get('MFX_DATA_ROOT', ROOT))
OUT = ROOT / 'analysis' / 'output' / 'stress-filter-hold'
SEED = 20261102
END = pd.Timestamp('2026-08-21')
EVAL_START = {'nq': '2004-01-02', 'es': '2004-01-02', 'gold': '2007-01-02'}
S3_START = pd.Timestamp('2009-01-02')
HALF = pd.Timestamp('2015-01-01')
INST = {'nq': 'nas100', 'es': 'spx500', 'gold': 'xauusd'}
COST = {'nq': 0.00003, 'es': 0.00003, 'gold': 0.00005}       # per unit of position traded
B, BLOCK, N_PLACEBO, N_CONTROL = 2000, 20, 2000, 200
WORTH = {'sharpe': 0.15, 'dz': 0.05}
PLANT = 0.15
Z = norm.ppf(0.975) + norm.ppf(0.80)
ARMS = ['B1', 'F-flat', 'F-half', 'VT', 'VT+S', 'MM']
CELLS = [  # id, kind, arm_a, arm_b ; claim: H1 dz < 0, others a - b > 0
    ('H1', 'dz', None, None),
    ('H2a', 'sharpe', 'F-flat', 'B1'),
    ('H2b', 'sharpe', 'F-half', 'B1'),
    ('H3', 'sharpe', 'VT+S', 'VT'),
    ('H4', 'sharpe', 'MM', 'B1'),
]


# ---------------------------------------------------------------- data
def series(name, start='2000-01-01', weekdays=True):
    d = pd.read_parquet(DATA / 'features' / f'{name}.parquet')
    if 'vintage' in d and d['vintage'].notna().any():
        d = d.sort_values(['date', 'vintage']).drop_duplicates('date', keep='last')
    s = pd.Series(pd.to_numeric(d['value'], errors='coerce').to_numpy(), index=pd.to_datetime(d['date'])).dropna()
    s = s[~s.index.duplicated(keep='last')].sort_index()
    if weekdays:
        s = s[s.index.dayofweek < 5]        # DATA_SPEC #9
    return s[(s.index >= start) & (s.index <= END)]


def build(inst):
    px = series(f'px_d1_{INST[inst]}')
    f = pd.DataFrame({'px': px})
    lr = np.log(f.px).diff()
    f['sig'] = np.sqrt(lr.pow(2).ewm(alpha=0.06, adjust=False, min_periods=60).mean() * 252)
    rf = series('rate3m_usd', weekdays=False) / 100                       # monthly: month-start dates, keep weekends
    rf = rf.groupby(rf.index.to_period('M')).last()
    rf = rf.reindex(pd.period_range(rf.index.min(), END.to_period('M'), freq='M')).ffill()
    f['rf'] = rf.reindex(f.index.to_period('M') - 1).to_numpy()
    f['R'] = f.px.shift(-1) / f.px - 1 - f.rf / 252                      # excess return held close t -> t+1
    f['up'] = (f.px.shift(-1) > f.px).astype(float).where(f.px.shift(-1).notna())
    # B0 at 1 day: expanding P(up) over outcomes known by t (direction-bar rule, min 504)
    known = f.up.shift(1)
    n = known.notna().cumsum()
    f['p0'] = (known.fillna(0).cumsum() / n).where(n >= 504)
    vix = series('vix').reindex(f.index).ffill(limit=3)
    vix3m = series('vix3m').reindex(f.index).ffill(limit=3)
    thr = vix.shift(1).rolling(252, min_periods=252).quantile(0.8)
    f['S1'] = (vix > thr).where(thr.notna() & vix.notna())
    rv = np.sqrt(252 * lr.pow(2).rolling(20, min_periods=20).mean())
    thr2 = rv.shift(1).rolling(252, min_periods=252).quantile(0.8)
    f['S2'] = (rv > thr2).where(thr2.notna())
    f['S3'] = (vix >= vix3m).where(vix.notna() & vix3m.notna())
    f['sig_star'] = f.sig.expanding(min_periods=60).median()
    f['var_star'] = (f.sig ** 2).expanding(min_periods=60).median()
    for h in (1, 5, 20, 60):
        f[f'up{h}'] = (f.px.shift(-h) > f.px).astype(float).where(f.px.shift(-h).notna())
    return f


def frame(inst, state, lag=0):
    """Rows usable for one instrument and stress state, with the stress label (optionally lagged one more row)."""
    f = build(inst) if inst not in _CACHE else _CACHE[inst]
    _CACHE[inst] = f
    start = max(pd.Timestamp(EVAL_START[inst]), S3_START if state == 'S3' else pd.Timestamp('1900-01-01'))
    g = f.assign(s=f[state].shift(lag))
    g = g[(g.index >= start) & g.R.notna() & g.s.notna() & g.sig.notna() & g.sig_star.notna()]
    g = g[g.index + pd.Timedelta(days=0) <= END]
    g = g.copy()
    g['s'] = g.s.astype(bool)
    return g


_CACHE = {}


def weights(g):
    s = g.s.to_numpy()
    vt = np.minimum(2.0, (g.sig_star / g.sig).to_numpy())
    return {
        'B1': np.ones(len(g)),
        'F-flat': np.where(s, 0.0, 1.0),
        'F-half': np.where(s, 0.5, 1.0),
        'VT': vt,
        'VT+S': vt * np.where(s, 0.5, 1.0),
        'MM': np.minimum(2.0, (g.var_star / g.sig ** 2).to_numpy()),
    }


def net_returns(g, inst, costx=1.0):
    c = COST[inst] * costx
    R = g.R.to_numpy()
    out = {}
    for k, w in weights(g).items():
        dw = np.abs(np.diff(w, prepend=w[0]))
        out[k] = w * R - c * dw - np.abs(w) * 8 * c / 252
    return out


# ---------------------------------------------------------------- statistics
def sharpe(x):
    sd = x.std(ddof=1)
    return float(x.mean() / sd * np.sqrt(252)) if sd > 0 else np.nan


def sharpe_rows(X):
    """Sharpe of each row of a (B, n) matrix."""
    return X.mean(1) / X.std(1, ddof=1) * np.sqrt(252)


def boot_idx(n, rng):
    """Stationary bootstrap indices (Politis-Romano), mean block BLOCK, shape (B, n)."""
    starts = rng.integers(0, n, size=(B, n))
    newblock = rng.random((B, n)) < 1.0 / BLOCK
    newblock[:, 0] = True
    idx = np.empty((B, n), dtype=np.int64)
    cur = starts[:, 0].copy()
    for j in range(n):
        cur = np.where(newblock[:, j], starts[:, j], (cur + 1) % n)
        idx[:, j] = cur
    return idx


def dz_stat(z, s):
    return float(z[s].mean() - z[~s].mean())


def placebo_dz(z, s, rng, k=N_PLACEBO):
    n = len(z)
    shifts = rng.integers(252, n - 252, size=k)
    return np.array([dz_stat(z, np.roll(s, sh)) for sh in shifts])


def boot_p(d, obs):
    """Two-sided p of a bootstrap distribution of a statistic around 0."""
    return float(min(1.0, 2 * min((d <= 0).mean(), (d >= 0).mean())))


def holm(ps):
    order = np.argsort(ps)
    m = len(ps)
    adj = np.empty(m)
    run = 0.0
    for r, i in enumerate(order):
        run = max(run, min(1.0, (m - r) * ps[i]))
        adj[i] = run
    return adj


def bh(ps):
    ps = np.asarray(ps)
    m = len(ps)
    order = np.argsort(ps)
    q = np.empty(m)
    prev = 1.0
    for r in range(m - 1, -1, -1):
        i = order[r]
        prev = min(prev, ps[i] * m / (r + 1))
        q[i] = prev
    return q


def describe(x, idx):
    eq = np.cumprod(1 + x)
    dd = eq / np.maximum.accumulate(eq) - 1
    yrs = len(x) / 252
    cagr = eq[-1] ** (1 / yrs) - 1
    monthly = pd.Series(1 + x, index=idx).groupby(idx.to_period('M')).prod() - 1
    return {'cagr': round(float(cagr), 4), 'vol': round(float(x.std(ddof=1) * np.sqrt(252)), 4),
            'sharpe': round(sharpe(x), 3), 'max_dd': round(float(dd.min()), 4),
            'worst_month': round(float(monthly.min()), 4),
            'calmar': round(float(cagr / -dd.min()), 3) if dd.min() < 0 else None}


# ---------------------------------------------------------------- one cell family (instrument x state)
def score(inst, state, rng, with_control=False):
    g = frame(inst, state)
    s = g.s.to_numpy()
    z = (g.R / (g.sig / np.sqrt(252))).to_numpy()
    nets = net_returns(g, inst)
    n = len(g)
    idx = boot_idx(n, rng)
    res = {'n': n, 'n_stressed': int(s.sum()), 'coverage': round(float(s.mean()), 4),
           'start': str(g.index[0].date()), 'end': str(g.index[-1].date())}

    # controls / MDE (no setup outcome used: labels decoupled by shifting, or arm differences resampled)
    pl = placebo_dz(z, s, rng)
    pl_sd, pl_mean = float(pl.std(ddof=1)), float(pl.mean())
    res['mde'] = {'H1_dz_sigma': round(Z * pl_sd, 4), 'H1_placebo_sd': round(pl_sd, 4), 'H1_placebo_mean': round(pl_mean, 4)}
    bsh = {k: sharpe_rows(v[idx]) for k, v in nets.items()}
    for cid, kind, a, b in CELLS[1:]:
        res['mde'][f'{cid}_sharpe'] = round(float(Z * (bsh[a] - bsh[b]).std(ddof=1)), 3)
    if with_control:
        hits = 0
        for sh in rng.integers(252, n - 252, size=N_CONTROL):
            sp = np.roll(s, sh)
            zp = z - PLANT * sp
            stat = dz_stat(zp, sp)
            hits += abs(stat - pl_mean) / pl_sd > norm.ppf(0.975)
        res['positive_control'] = {'plant_dz_sigma': -PLANT, 'detected_share': round(hits / N_CONTROL, 3)}

    # scored statistics
    cells = {}
    dz = dz_stat(z, s)
    bz = np.array([dz_stat(z[i], s[i]) for i in idx[:B]])
    p_pl = float(((np.abs(pl - pl_mean)) >= abs(dz - pl_mean)).mean())
    p_up_s = float(g.up.to_numpy()[s].mean())
    p0_s = float(np.nanmean(g.p0.to_numpy()[s]))
    cells['H1'] = {'stat': round(dz, 4), 'ci': [round(float(np.percentile(bz, 2.5)), 4), round(float(np.percentile(bz, 97.5)), 4)],
                   'p': p_pl, 'p_boot': boot_p(bz, dz), 'z_stressed': round(float(z[s].mean()), 4), 'z_calm': round(float(z[~s].mean()), 4),
                   'p_up_stressed': round(p_up_s, 4), 'b0_on_stressed': round(p0_s, 4), 'p_up_calm': round(float(g.up.to_numpy()[~s].mean()), 4)}
    for cid, kind, a, b in CELLS[1:]:
        d = bsh[a] - bsh[b]
        obs = sharpe(nets[a]) - sharpe(nets[b])
        cells[cid] = {'stat': round(obs, 4), 'ci': [round(float(np.percentile(d, 2.5)), 4), round(float(np.percentile(d, 97.5)), 4)],
                      'p': boot_p(d, obs), 'sharpe_a': round(sharpe(nets[a]), 3), 'sharpe_b': round(sharpe(nets[b]), 3)}

    # gate pieces: halves, one-row lag, 3x costs
    early, late = g.index < HALF, g.index >= HALF
    g_lag = frame(inst, state, lag=1)
    nets_lag, nets3 = net_returns(g_lag, inst), net_returns(g, inst, 3.0)
    s_lag = g_lag.s.to_numpy()
    z_lag = (g_lag.R / (g_lag.sig / np.sqrt(252))).to_numpy()
    idx_lag = boot_idx(len(g_lag), rng)
    for cid, kind, a, b in CELLS:
        c = cells[cid]
        if kind == 'dz':
            c['halves'] = [round(dz_stat(z[m], s[m]), 4) for m in (early, late)]
            c['lag1'] = round(dz_stat(z_lag, s_lag), 4)
            pl_lag = placebo_dz(z_lag, s_lag, rng, 1000)
            c['lag1_p'] = float((np.abs(pl_lag - pl_lag.mean()) >= abs(c['lag1'] - pl_lag.mean())).mean())
            c['cost3x'] = c['stat']                      # costs do not enter z
        else:
            c['halves'] = [round(sharpe(nets[a][m]) - sharpe(nets[b][m]), 4) for m in (early, late)]
            c['lag1'] = round(sharpe(nets_lag[a]) - sharpe(nets_lag[b]), 4)
            dl = sharpe_rows(nets_lag[a][idx_lag]) - sharpe_rows(nets_lag[b][idx_lag])
            c['lag1_p'] = boot_p(dl, c['lag1'])
            c['cost3x'] = round(sharpe(nets3[a]) - sharpe(nets3[b]), 4)
    res['cells'] = cells
    res['arms'] = {k: describe(v, g.index) for k, v in nets.items()}
    vol_b1 = nets['B1'].std(ddof=1)
    for k, v in nets.items():
        res['arms'][k]['max_dd_volmatched'] = describe(v * vol_b1 / v.std(ddof=1), g.index)['max_dd']
        w = weights(g)[k]
        res['arms'][k]['avg_exposure'] = round(float(w.mean()), 3)
        res['arms'][k]['turnover_per_yr'] = round(float(np.abs(np.diff(w)).sum() / (n / 252)), 2)
    res['arms_cost3x'] = {k: round(sharpe(v), 3) for k, v in nets3.items()}
    # forward-ledger excess: in-sample P(up_h | stressed) - P(up_h), for the stress-vix-p80 forecaster
    res['ledger_excess'] = {}
    for h in (1, 5, 20, 60):
        u = g[f'up{h}'].to_numpy()
        ok = ~np.isnan(u)
        res['ledger_excess'][h] = round(float(u[ok & s].mean() - u[ok].mean()), 4)
    return res


def verdict(c, kind, holm_p):
    worth = WORTH[kind]
    good = (lambda v: v < 0) if kind == 'dz' else (lambda v: v > 0)
    lo, hi = c['ci']
    gate = (holm_p < 0.05 and good(c['stat']) and all(good(h) for h in c['halves'])
            and good(c['lag1']) and c['lag1_p'] < 0.10 and good(c['cost3x']))
    if kind == 'dz':
        gate = gate and hi < 0
        best = -lo                      # most favourable end of the CI, in the claimed direction
        wrong = lo > 0
    else:
        best = hi
        wrong = hi < 0
    if gate:
        return 'VALIDATED'
    if wrong:
        return 'NULL (mirror)'
    return 'NULL' if best < worth else 'UNDERPOWERED'


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    print('== primary: NQ, S1 (VIX > trailing-252 p80) ==')
    prim = score('nq', 'S1', rng, with_control=True)
    print('controls / MDE (before scoring):', json.dumps(prim['mde']), json.dumps(prim['positive_control']))
    ps = np.array([prim['cells'][c[0]]['p'] for c in CELLS])
    adj = holm(ps)
    for (cid, kind, a, b), hp in zip(CELLS, adj):
        c = prim['cells'][cid]
        c['p_holm'] = float(hp)
        c['verdict'] = verdict(c, kind, hp)
        print(f"{cid:4s} stat {c['stat']:+.4f} CI [{c['ci'][0]:+.4f}, {c['ci'][1]:+.4f}] p {c['p']:.4f} holm {hp:.4f} "
              f"halves {c['halves']} lag1 {c['lag1']:+.4f} (p {c['lag1_p']:.3f}) 3x {c['cost3x']:+.4f} -> {c['verdict']}")
    for k, v in prim['arms'].items():
        print(f'  {k:7s}', v)

    print('== secondary (descriptive, BH q 0.10) ==')
    sec = {}
    rows = []
    for inst in INST:
        for st in ('S1', 'S2', 'S3'):
            if inst == 'nq' and st == 'S1':
                continue
            r = score(inst, st, rng)
            sec[f'{inst}:{st}'] = r
            for cid, kind, a, b in CELLS:
                rows.append((f'{inst}:{st}', cid, r['cells'][cid]['p']))
    q = bh([x[2] for x in rows])
    for (key, cid, p), qq in zip(rows, q):
        c = sec[key]['cells'][cid]
        c['q_bh'] = float(qq)
        c['candidate'] = bool(qq < 0.10 and (c['stat'] < 0 if cid == 'H1' else c['stat'] > 0))
        print(f"{key:8s} {cid:4s} stat {c['stat']:+.4f} CI [{c['ci'][0]:+.4f}, {c['ci'][1]:+.4f}] p {p:.4f} q {qq:.3f}"
              f"{'  CANDIDATE' if c['candidate'] else ''}")
    out = {'study': 'stress-filter-hold', 'prereg': 'forge/STRESS_FILTER_HOLD_PREREG.md', 'prereg_commit': '5253ba8d',
           'seed': SEED, 'bootstrap': {'type': 'stationary', 'mean_block': BLOCK, 'B': B}, 'placebo_shifts': N_PLACEBO,
           'end': str(END.date()), 'primary': prim, 'secondary': sec}
    (OUT / 'results.json').write_text(json.dumps(out, indent=1, default=float), encoding='utf-8')
    print('wrote', OUT / 'results.json')


if __name__ == '__main__':
    main()
