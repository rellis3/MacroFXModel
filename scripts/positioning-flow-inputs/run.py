"""positioning-flow-inputs: do the OANDA retail book, 25-delta risk reversals, the volatility risk premium and a
month-end flow estimate add next-day (07:00 -> 21:00 London) and +5-session direction information beyond the
point-in-time base rate B0, and beyond the bias-learner's 13 readings?

Prereg: forge/POSITIONING_FLOW_INPUTS_PREREG.md (seed 20261115). Lockbox: no outcome after 2026-08-21.

    python -X utf8 -I scripts/positioning-flow-inputs/run.py --selftest     # planted signal recovered, null not flagged
    python -X utf8 -I scripts/positioning-flow-inputs/run.py --depth        # input history depth (no outcomes)
    python -X utf8 -I scripts/positioning-flow-inputs/run.py --power        # synthetic labels on real readings -> power_table.json
    python -X utf8 -I scripts/positioning-flow-inputs/run.py                # the real run (needs power_table.json)
    python -X utf8 -I scripts/positioning-flow-inputs/run.py --packs        # evidence pack per scored cell (after the run)

Reuses scripts/bias-learner/run.py (panel readings, P0/21:00 closes via its lockbox-filtered M1 reader, b0_matrix,
fit_logit), so readings, targets and B0 are exactly the banked learner's. Every R2_* variable is removed; nothing is
written to R2.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import math
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from statistics import NormalDist

os.environ.setdefault('OMP_NUM_THREADS', '2')
os.environ.setdefault('MKL_NUM_THREADS', '2')
os.environ.setdefault('OPENBLAS_NUM_THREADS', '2')
for _k in [k for k in os.environ if k.startswith('R2_')]:
    del os.environ[_k]

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
_spec = importlib.util.spec_from_file_location('bl_run', os.path.join(ROOT, 'scripts', 'bias-learner', 'run.py'))
R = importlib.util.module_from_spec(_spec)
sys.modules['bl_run'] = R
_spec.loader.exec_module(R)

SEED = 20261115
SLUG = 'positioning-flow-inputs'
PREREG = 'forge/POSITIONING_FLOW_INPUTS_PREREG.md'
LOCKBOX = pd.Timestamp('2026-08-21')
OUT = os.path.join(ROOT, 'analysis', 'output', SLUG)
CACHE = os.path.join(OUT, 'cache')
HORIZONS = [0, 5]
HN = {0: '21:00', 5: '+5'}
CGRID = list(R.CGRID)
BLOCK = 21
B_BOOT = 2000
N_PLACEBO = 200
JOBS = 2
ND = NormalDist()
Z_HOLM_FIRST = 3.12          # two-sided 0.05/28
DI = {r[0]: r[5] for r in R.INSTRUMENTS}
GROUP_OF = {r[0]: r[1] for r in R.INSTRUMENTS}

BOOK_MAP = {'EUR_USD': 'EURUSD', 'GBP_USD': 'GBPUSD', 'USD_JPY': 'USDJPY', 'XAU_USD': 'GOLD'}
IV_MAP = {'EURUSD': 'eur_usd', 'GBPUSD': 'gbp_usd', 'USDJPY': 'usd_jpy', 'AUDUSD': 'aud_usd', 'USDCAD': 'usd_cad',
          'USDCHF': 'usd_chf', 'NAS100': 'nas100_usd'}
FX6 = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF']
USD7 = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCAD', 'AUDUSD', 'NZDUSD', 'USDCHF']

INPUTS = {
    'book': ['bk_lvl', 'bk_chg'],
    'rr': ['rr_lvl', 'rr_chg'],
    'vrp': ['vrp'],
    'monthend': ['me'],
}
# (input, group, instruments, alone test years, incremental?)
CELLSPEC = [
    ('book', 'fx', ['EURUSD', 'GBPUSD', 'USDJPY'], list(range(2019, 2027)), True),
    ('book', 'gold', ['GOLD'], list(range(2019, 2027)), True),
    ('rr', 'fx', FX6, list(range(2022, 2027)), True),
    ('rr', 'idx', ['NAS100'], list(range(2022, 2027)), True),
    ('vrp', 'fx', FX6, list(range(2022, 2027)), True),
    ('vrp', 'gold', ['GOLD'], list(range(2018, 2027)), False),
    ('vrp', 'idx', ['NAS100', 'SPX500', 'US30'], list(range(2018, 2027)), False),
    ('monthend', 'fx', USD7, list(range(2018, 2027)), True),
]


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


def cells():
    out = []
    for inp, g, insts, yrs, incr in CELLSPEC:
        for kind in (['alone', 'incr'] if incr else ['alone']):
            for h in HORIZONS:
                out.append({'name': f'{inp}|{g}|{kind}|{HN[h]}', 'input': inp, 'group': g, 'insts': insts,
                            'years': yrs, 'kind': kind, 'h': h})
    return out


def base_feats(group):
    return [f for f in R.FEAT if not ((group == 'fx' and f == 'ivrv') or (group != 'fx' and f == 'carry'))]


# ───────────────────────────── inputs (point-in-time) ─────────────────────────────

def _asof_prev(dates, src_dates, src_vals):
    """value of the latest source row dated strictly before each session date (src_dates sorted, naive)."""
    sd = pd.DatetimeIndex(src_dates).as_unit('ns').asi8
    q = pd.DatetimeIndex(dates).as_unit('ns').asi8
    k = np.searchsorted(sd, q, side='left') - 1
    out = np.full(len(q), np.nan)
    ok = k >= 0
    out[ok] = np.asarray(src_vals, float)[k[ok]]
    return out


def crowd_near(price, buckets, window=0.10):
    """near-spot long share %, exactly js/positionBookMetrics.js (buckets within +-10% of the snapshot price)."""
    if not price or price <= 0 or not buckets:
        return np.nan
    L = S = 0.0
    for b in buckets:
        p, l, s = float(b[0]), float(b[1]), float(b[2])
        if p <= 0 or (l == 0 and s == 0):
            continue
        if abs(p - price) / price <= window:
            L += l; S += s
    if L + S <= 0:
        allL = sum(float(b[1]) for b in buckets); allS = sum(float(b[2]) for b in buckets)
        return 100 * allL / (allL + allS) if allL + allS > 0 else np.nan
    return 100 * L / (L + S)


def load_book():
    cp = os.path.join(CACHE, 'book_daily.parquet')
    if os.path.exists(cp):
        return pd.read_parquet(cp)
    src = os.path.join(ROOT, 'backfill', 'books_daily.ndjson')
    if not os.path.exists(src):
        raise SystemExit(f'missing {src}')
    rows = []
    with open(src, encoding='utf-8') as f:
        for line in f:
            if not line.strip():
                continue
            j = json.loads(line)
            if j.get('book') != 'position' or j.get('instrument') not in BOOK_MAP:
                continue
            rows.append((BOOK_MAP[j['instrument']], pd.Timestamp(j['time']).tz_convert('UTC').tz_localize(None),
                         float(j.get('price') or 0), crowd_near(float(j.get('price') or 0), j.get('buckets') or [])))
    df = pd.DataFrame(rows, columns=['inst', 't', 'price', 'crowd']).sort_values(['inst', 't']).reset_index(drop=True)
    os.makedirs(CACHE, exist_ok=True)
    df.to_parquet(cp, index=False)
    return df


def book_readings(book, dates_by_inst):
    """session d uses the latest snapshot whose UTC date < d (prereg §3.2)."""
    out = {}
    for inst, g in book.groupby('inst'):
        g = g[g.t < LOCKBOX].sort_values('t')
        g = g[np.isfinite(g.crowd)]
        c = g.crowd.reset_index(drop=True)
        mu = c.shift(1).rolling(250, min_periods=120).mean()
        sd = c.shift(1).rolling(250, min_periods=120).std()
        lvl = -(c - mu) / sd
        chg = -(c - c.shift(5))
        sdate = g.t.dt.normalize().to_numpy()
        d = dates_by_inst.get(inst)
        if d is None:
            continue
        out[inst] = {'bk_lvl': _asof_prev(d, sdate, lvl.to_numpy()), 'bk_chg': _asof_prev(d, sdate, chg.to_numpy()),
                     'bk_crowd': _asof_prev(d, sdate, c.to_numpy()), 'bk_src': _asof_prev(d, sdate, sdate.astype('datetime64[ns]').astype(np.int64))}
    return out


def load_iv(inst):
    p = os.path.join(ROOT, 'oi_research_book', 'data', f'iv_daily_{IV_MAP[inst]}.parquet')
    d = pd.read_parquet(p, columns=['date', 'iv30', 'rr25_30'])
    d['date'] = pd.to_datetime(d['date']).dt.tz_localize(None).astype('datetime64[ns]')
    d = d[d.date < LOCKBOX].sort_values('date').reset_index(drop=True)
    d['rr_chg'] = d.rr25_30 - d.rr25_30.shift(5)
    return d


def ny_closes(key):
    """NY-close (17:00 New York) daily closes from M1 for an index key in portfolioBacktest/cache; returns
    (label dates, closes, completion time UTC ns)."""
    m1 = R.read_m1(os.path.join(ROOT, 'portfolioBacktest', 'cache', f'{key}_m1.parquet'), cols=('close',))
    t = m1['time']
    lab = (t.dt.tz_convert(R.NY) + pd.Timedelta(hours=7)).dt.tz_localize(None).dt.normalize()
    d1 = pd.Series(m1.close.to_numpy(float)).groupby(lab.to_numpy()).last()
    idx = pd.DatetimeIndex(d1.index)
    d1 = d1[idx.dayofweek < 5]
    idx = pd.DatetimeIndex(d1.index)
    done = (idx + pd.Timedelta(hours=17)).tz_localize(R.NY).tz_convert('UTC').tz_localize(None).as_unit('ns').asi8
    return idx, d1.to_numpy(float), done


def month_end_window(dates):
    """last 3 weekdays of each calendar month (weekday calendar)."""
    dates = pd.DatetimeIndex(dates)
    keep = np.zeros(len(dates), bool)
    for (y, m) in sorted(set(zip(dates.year, dates.month))):
        last = pd.bdate_range(pd.Timestamp(y, m, 1), pd.Timestamp(y, m, 1) + pd.offsets.MonthEnd(0))[-3:]
        keep |= dates.isin(last)
    return keep


def monthend_rel(dates, t7):
    """rel = MTD_SPX - 0.5 (MTD_DE30 + MTD_UK100) at 07:00 London of each session (closes completed before t7)."""
    mtd = {}
    for key in ('spx500', 'de30', 'uk100'):
        idx, c, done = ny_closes(key)
        k = np.searchsorted(done, t7, side='right') - 1          # last close completed at/before 07:00 London
        last_c = np.where(k >= 0, c[np.maximum(k, 0)], np.nan)
        # previous calendar month's last close (relative to the session's month)
        per = idx.to_period('M')
        me_close = pd.Series(c, index=per).groupby(level=0).last()
        sess_prev = (pd.DatetimeIndex(dates).to_period('M') - 1)
        prev_c = me_close.reindex(sess_prev).to_numpy(float)
        # the previous month-end close must itself be completed before t7 (always true; asserted)
        mtd[key] = np.log(last_c / prev_c)
        mtd[key + '_first'] = str(idx.min().date())
    rel = mtd['spx500'] - 0.5 * (mtd['de30'] + mtd['uk100'])
    return rel, {k: v for k, v in mtd.items() if k.endswith('_first')}


# ───────────────────────────── panel ─────────────────────────────

def load_panel():
    cp = os.path.join(CACHE, 'panel_readings.parquet')
    if os.path.exists(cp):
        P = pd.read_parquet(cp)
    else:
        cfg = R.Cfg(root=ROOT, m1_root='VolRangeForecaster/data/m1', index_root='portfolioBacktest/cache',
                    feature_root=os.path.join(ROOT, 'features'), out=OUT, shuffles=0, jobs=1, gbm=False, with_R=False,
                    descriptive_full=False)
        P, raw = R.build_panel(cfg)
        del raw
        os.makedirs(CACHE, exist_ok=True)
        P.to_parquet(cp, index=False)
    P['date'] = pd.to_datetime(P['date']).astype('datetime64[ns]')
    assert P.date.max() <= LOCKBOX, 'LOCKBOX BREACH in panel'
    return P


def add_inputs(P):
    P = P.sort_values(['inst', 'date']).reset_index(drop=True)
    for c in ['bk_lvl', 'bk_chg', 'bk_crowd', 'rr_lvl', 'rr_chg', 'vrp', 'me', 'me_window']:
        P[c] = np.nan
    dates_by_inst = {i: P.loc[P.inst == i, 'date'].to_numpy() for i in P.inst.unique()}
    meta = {}
    bk = book_readings(load_book(), dates_by_inst)
    for inst, v in bk.items():
        m = (P.inst == inst).to_numpy()
        for c in ('bk_lvl', 'bk_chg', 'bk_crowd'):
            P.loc[m, c] = v[c]
        src = v['bk_src']
        ok = np.isfinite(src)
        assert (src[ok] < pd.DatetimeIndex(P.loc[m, 'date']).as_unit('ns').asi8[ok]).all(), 'book snapshot not before d'
    for inst in IV_MAP:
        d = load_iv(inst)
        m = (P.inst == inst).to_numpy()
        dd = P.loc[m, 'date'].to_numpy()
        P.loc[m, 'rr_lvl'] = _asof_prev(dd, d.date.to_numpy(), d.rr25_30.to_numpy())
        P.loc[m, 'rr_chg'] = _asof_prev(dd, d.date.to_numpy(), d.rr_chg.to_numpy())
        meta[f'iv_{inst}'] = [str(d.date.min().date()), str(d.date.max().date()), int(len(d))]
    # VRP: FX = fxivrv x d_i (USD side); gold/indices = ivrv
    fx = P.inst.isin(FX6).to_numpy()
    P.loc[fx, 'vrp'] = P.loc[fx, 'fxivrv'].to_numpy(float) * P.loc[fx, 'inst'].map(DI).to_numpy(float)
    gi = P.inst.isin(['GOLD', 'NAS100', 'SPX500', 'US30']).to_numpy()
    P.loc[gi, 'vrp'] = P.loc[gi, 'ivrv'].to_numpy(float)
    # month-end
    sess = P[['date', 't7']].drop_duplicates('date').sort_values('date')
    rel, first = monthend_rel(sess.date.to_numpy(), sess.t7.to_numpy().astype(np.int64))
    meta['monthend_first_close'] = first
    win = month_end_window(sess.date.to_numpy())
    relmap = pd.Series(rel, index=sess.date.to_numpy()); winmap = pd.Series(win, index=sess.date.to_numpy())
    u = P.inst.isin(USD7).to_numpy()
    P.loc[u, 'me'] = -P.loc[u, 'date'].map(relmap).to_numpy(float) * P.loc[u, 'inst'].map(DI).to_numpy(float)
    P['me_window'] = P.date.map(winmap).fillna(False).astype(bool)
    P.loc[~P.me_window.to_numpy(), 'me'] = np.nan
    return P, meta


def add_targets(P):
    raw = {i: None for i in R.INST}
    P = R.add_targets(P, raw, with_R=False)
    for h in HORIZONS:
        e = pd.to_datetime(P[f'end{h}'])
        assert (e.dropna() <= LOCKBOX).all(), 'LOCKBOX BREACH'
    return P


class HData:
    """per horizon: arrays over (date, inst) rows with labels; B0 from all 13 instruments (bias-learner)."""

    def __init__(self, P, h):
        dates = pd.DatetimeIndex(sorted(P.date.unique()))
        T, N = len(dates), len(R.INST)
        dpos = {d: i for i, d in enumerate(dates)}
        di = P.date.map(dpos).to_numpy(); ii = P.inst.map({k: i for i, k in enumerate(R.INST)}).to_numpy()
        Y = np.full((T, N), np.nan); END = np.full((T, N), -1)
        Y[di, ii] = P[f'y{h}'].to_numpy(float)
        e = pd.to_datetime(P[f'end{h}'])
        ok = e.notna().to_numpy()
        END[di[ok], ii[ok]] = e[ok].map(dpos).to_numpy()
        B = R.b0_matrix(dates, Y, END)
        self.dates, self.P = dates, P
        self.date_ix, self.inst_ix = di, ii
        self.y = Y[di, ii]; self.end_ix = END[di, ii]; self.b0 = B[di, ii]
        yr = dates.year.to_numpy()
        self.year = yr[di]; self.month = (dates.year * 12 + dates.month).to_numpy()[di]
        self.first = {int(v): int(np.argmax(yr == v)) for v in sorted(set(yr))}


def cell_rows(H, c):
    P = H.P
    m = P.inst.isin(c['insts']).to_numpy() & np.isfinite(H.y) & (H.end_ix >= 0)
    for f in INPUTS[c['input']]:
        m &= np.isfinite(P[f].to_numpy(float))
    if c['kind'] == 'incr':
        for f in base_feats(c['group']):
            m &= np.isfinite(P[f].to_numpy(float))
    return np.flatnonzero(m)


def cell_arrays(H, c, rows):
    P = H.P
    Xin = P[INPUTS[c['input']]].to_numpy(float)[rows]
    Xb = P[base_feats(c['group'])].to_numpy(float)[rows] if c['kind'] == 'incr' else None
    return {'Xin': Xin, 'Xb': Xb, 'y': H.y[rows], 'b0': H.b0[rows], 'date_ix': H.date_ix[rows],
            'inst_ix': H.inst_ix[rows], 'end_ix': H.end_ix[rows], 'year': H.year[rows], 'month': H.month[rows],
            'first': H.first, 'years': c['years'], 'kind': c['kind']}


# ───────────────────────────── walk-forward ─────────────────────────────

def _std(Xtr, Xte):
    mu = Xtr.mean(0); sd = Xtr.std(0); sd[sd <= 0] = 1.0
    return (Xtr - mu) / sd, (Xte - mu) / sd


def walk_forward(X, y, off, A, keep=False):
    """offset logistic on X (already raw), expanding by year with purge, C chosen inside training years."""
    p = np.full(len(y), np.nan); ws = {}
    for Y in A['years']:
        if Y not in A['first']:
            continue
        te = A['year'] == Y
        if te.sum() == 0:
            continue
        tr = A['end_ix'] < A['first'][Y]
        if tr.sum() < 300:
            continue
        yrs = sorted(set(A['year'][tr].tolist()))
        folds = []
        for vy in yrs[1:][-2:]:
            itr = tr & (A['end_ix'] < A['first'][vy]); iva = tr & (A['year'] == vy)
            if itr.sum() >= 300 and iva.sum() >= 150:
                folds.append((itr, iva))
        if folds:
            sc = {C: [] for C in CGRID}
            for itr, iva in folds:
                a, b = _std(X[itr], X[iva])
                w = None
                for C in CGRID:
                    w = R.fit_logit(a, y[itr], C, off[itr], w)
                    pv = R.sigmoid(off[iva] + b @ w)
                    sc[C].extend(R.monthly_score((pv - y[iva]) ** 2, A['month'][iva]).tolist())
            means = [np.mean(sc[C]) for C in CGRID]
            Cb = CGRID[[i for i, mm in enumerate(means) if mm <= min(means)][0]]
        else:
            Cb = 1e-3
        a, b = _std(X[tr], X[te])
        w = R.fit_logit(a, y[tr], Cb, off[tr])
        p[te] = R.sigmoid(off[te] + b @ w)
        if keep:
            ws[int(Y)] = {'C': Cb, 'w': w.tolist(), 'n_train': int(tr.sum()), 'n_test': int(te.sum())}
    return p, ws


def model_X(A, Xin=None):
    Xin = A['Xin'] if Xin is None else Xin
    return Xin if A['kind'] == 'alone' else np.concatenate([A['Xb'], Xin], axis=1)


def fit_cell(A, Xin=None, base=None, keep=False):
    off = np.log(A['b0'] / (1 - A['b0']))
    p, ws = walk_forward(model_X(A, Xin), A['y'], off, A, keep)
    if A['kind'] == 'incr' and base is None:
        base, _ = walk_forward(A['Xb'], A['y'], off, A, False)
    return p, base, ws


def stat(p, b0, y, base=None):
    m = np.isfinite(p)
    d = np.sum((b0[m] - y[m]) ** 2)
    if base is None:
        return 1 - np.sum((p[m] - y[m]) ** 2) / d
    return (np.sum((base[m] - y[m]) ** 2) - np.sum((p[m] - y[m]) ** 2)) / d


def block_perm_dates(udates, rng, block=BLOCK):
    nb = int(math.ceil(len(udates) / block))
    order = rng.permutation(nb)
    return np.concatenate([np.arange(b * block, min(len(udates), (b + 1) * block)) for b in order])


def placebo_X(A, rng):
    """permute 21-date blocks of the input readings along the cell's date axis (all instruments together)."""
    ud = np.unique(A['date_ix'])
    perm = block_perm_dates(ud, rng)
    src_of = dict(zip(ud.tolist(), ud[perm].tolist()))
    key = {(d, i): k for k, (d, i) in enumerate(zip(A['date_ix'].tolist(), A['inst_ix'].tolist()))}
    med = np.median(A['Xin'], axis=0)
    X = np.empty_like(A['Xin'])
    miss = 0
    for k, (d, i) in enumerate(zip(A['date_ix'].tolist(), A['inst_ix'].tolist())):
        j = key.get((src_of[d], i))
        if j is None:
            X[k] = med; miss += 1
        else:
            X[k] = A['Xin'][j]
    return X, miss


def _placebo_job(args):
    A, base, s = args
    rng = np.random.default_rng([SEED, 4242, s])
    X, miss = placebo_X(A, rng)
    p, _, _ = fit_cell(A, X, base)
    return float(stat(p, A['b0'], A['y'], base)), miss


def run_pool(fn, jobs_args, jobs=JOBS):
    if jobs > 1:
        with ProcessPoolExecutor(jobs) as ex:
            return list(ex.map(fn, jobs_args, chunksize=4))
    return [fn(a) for a in jobs_args]


def boot(A, p, base, rng, B=B_BOOT):
    m = np.isfinite(p)
    y, b0 = A['y'][m], A['b0'][m]
    u, inv = np.unique(A['date_ix'][m], return_inverse=True)
    cols = [(p[m] - y) ** 2, (b0 - y) ** 2] + ([(base[m] - y) ** 2] if base is not None else [])
    S = np.column_stack([np.bincount(inv, c, minlength=len(u)) for c in cols])
    idx = R.block_index(len(u), rng, B=B, block=BLOCK)
    draws = []
    for ii in idx:
        s = S[ii].sum(0)
        draws.append(1 - s[0] / s[1] if base is None else (s[2] - s[0]) / s[1])
    return np.asarray(draws), u, S


def halves(A, p, base):
    m = np.isfinite(p)
    d = A['date_ix'][m]
    mid = np.median(np.unique(d))
    out = []
    for sel in (d <= mid, d > mid):
        mm = np.flatnonzero(m)[sel]
        q = np.full(len(p), np.nan); q[mm] = p[mm]
        out.append(float(stat(q, A['b0'], A['y'], base)))
    return out


def sign_stability(ws, kind, n_in):
    if not ws:
        return None, None, None
    W = np.array([v['w'] for v in ws.values()])
    Wi = W[:, -n_in:]
    lead = int(np.argmax(np.abs(Wi).mean(0)))
    s = np.sign(Wi[:, lead])
    share = max((s > 0).mean(), (s < 0).mean())
    return lead, float(share), int(np.sign(Wi[:, lead].mean()))


def recal_slope(p, b0, y):
    m = np.isfinite(p)
    lp = np.log(p[m] / (1 - p[m])); lb = np.log(b0[m] / (1 - b0[m]))
    x = (lp - lb)[:, None]
    if np.allclose(x, 0):
        return float('nan')
    X = np.column_stack([np.ones(len(x)), x])
    w = R.fit_logit(X, y[m], 1e6, lb)
    return float(w[1])


# ───────────────────────────── power ─────────────────────────────

def synth_y(A, ic, rng):
    Z = (A['Xin'] - A['Xin'].mean(0)) / np.where(A['Xin'].std(0) > 0, A['Xin'].std(0), 1)
    s = Z.mean(1); s = (s - s.mean()) / (s.std() if s.std() > 0 else 1)
    r = min(ic * math.sqrt(math.pi / 2), 0.99)
    a = r / math.sqrt(1 - r * r)
    return (a * s + rng.standard_normal(len(s)) > 0).astype(float)


def _power_job(args):
    A, ic, s = args
    rng = np.random.default_rng([SEED, 9090, int(ic * 1000), s])
    A2 = dict(A); A2['y'] = synth_y(A, ic, rng); A2['b0'] = np.full(len(A['y']), 0.5)
    p, base, _ = fit_cell(A2)
    return float(stat(p, A2['b0'], A2['y'], base))


def run_power(P_in, ndraw=16):
    log('power: synthetic labels on the real rows and readings (no outcome read)')
    P = P_in.copy()
    P['y0'] = 0.0; P['y5'] = 0.0                             # placeholder labels; never real
    P['end0'] = P['date']; P['end5'] = P['date']
    tab = {}
    for h in HORIZONS:
        H = HData(P, h)
        for c in [c for c in cells() if c['h'] == h]:
            rows = cell_rows(H, c)
            A = cell_arrays(H, c, rows)
            null = run_pool(_power_job, [(A, 0.0, s) for s in range(ndraw)])
            sig = run_pool(_power_job, [(A, 0.08, s) for s in range(ndraw)])
            sd = float(np.std(null, ddof=1)); U = float(np.mean(sig))
            mde = (Z_HOLM_FIRST + 0.84) * sd
            tab[c['name']] = {'n_rows': int(len(rows)), 'n_dates': int(len(np.unique(A['date_ix']))),
                              'null_mean': float(np.mean(null)), 'sd_null': sd, 'U': U, 'mde': mde,
                              'powered': bool(mde <= U)}
            log(c['name'], tab[c['name']])
    json.dump({'seed': SEED, 'ndraw': ndraw, 'ic_U': 0.08, 'z_holm_first': Z_HOLM_FIRST, 'cells': tab},
              open(os.path.join(HERE, 'power_table.json'), 'w'), indent=1)
    return tab


RHO = {'fx': 0.47, 'gold': 0.0, 'idx': 0.85}       # cross-instrument label correlation (data-rules item 7; bias-learner sim)


def adjust_power(power):
    """Amendment A1 (PRE-RESULTS): the simulation's labels are independent across instruments and days, so its null SD
    is inflated by sqrt(1 + (k - 1) rho) for k instruments of the group and by sqrt(h) for the overlapping +h horizon;
    MDE and POWERED are recomputed from the inflated SD. U is unchanged."""
    out = json.loads(json.dumps(power))
    for c in cells():
        e = out['cells'][c['name']]
        k = len(c['insts'])
        infl = math.sqrt(1 + (k - 1) * RHO[c['group']]) * math.sqrt(max(c['h'], 1))
        e['sd_null_raw'] = e['sd_null']; e['mde_raw'] = e['mde']; e['inflation'] = infl
        e['sd_null'] = e['sd_null_raw'] * infl
        e['mde'] = (Z_HOLM_FIRST + 0.84) * e['sd_null']
        e['powered'] = bool(e['mde'] <= e['U'])
    return out


# ───────────────────────────── scoring ─────────────────────────────

def holm(pv):
    return R.holm(pv)


def word(G, powered, hi, U):
    if G['G1'] and G['G2'] and G['G3'] and G['G4']:
        return 'VALIDATED'
    if G['G1'] and G['G2']:
        return 'CONTEXT'
    if powered and hi < U:
        return 'NULL'
    return 'UNDERPOWERED'


def score(P, power, nplacebo=N_PLACEBO):
    rng = np.random.default_rng(SEED)
    res, stash = [], {}
    for h in HORIZONS:
        H = HData(P, h)
        for c in [c for c in cells() if c['h'] == h]:
            t0 = time.time()
            rows = cell_rows(H, c)
            A = cell_arrays(H, c, rows)
            p, base, ws = fit_cell(A, keep=True)
            est = float(stat(p, A['b0'], A['y'], base))
            draws, u, S = boot(A, p, base, rng)
            lo, hi = np.percentile(draws, [2.5, 97.5]); se = float(draws.std(ddof=1))
            pl = run_pool(_placebo_job, [(A, base, s) for s in range(nplacebo)])
            plv = np.array([x[0] for x in pl]); miss = float(np.mean([x[1] for x in pl])) / len(rows)
            sdp = float(plv.std(ddof=1))
            z = est / max(se, sdp)
            pval = 2 * (1 - ND.cdf(abs(z)))
            hv = halves(A, p, base)
            lead, share, lsign = sign_stability(ws, c['kind'], len(INPUTS[c['input']]))
            m = np.isfinite(p)
            lean = (p - (A['b0'] if base is None else base))[m]
            yy = A['y'][m]
            hit = float(((lean > 0) == (yy > 0.5))[lean != 0].mean()) if (lean != 0).any() else float('nan')
            pw = power['cells'][c['name']]
            r = {'name': c['name'], 'input': c['input'], 'group': c['group'], 'kind': c['kind'], 'h': HN[h],
                 'insts': c['insts'], 'n_rows': int(m.sum()), 'n_dates': int(len(u)),
                 'span': [str(H.dates[A['date_ix'][m].min()].date()), str(H.dates[A['date_ix'][m].max()].date())],
                 'est': est, 'lo': float(lo), 'hi': float(hi), 'se_boot': se, 'placebo_sd': sdp,
                 'placebo_p95': float(np.percentile(plv, 95)), 'placebo_mean': float(plv.mean()),
                 'placebo_pct': float((plv < est).mean() * 100), 'placebo_missing_share': miss,
                 'z': float(z), 'p': float(pval), 'halves': hv, 'lead_reading': INPUTS[c['input']][lead] if lead is not None else None,
                 'lead_sign_share': share, 'lead_sign': lsign, 'folds': ws, 'hit_rate_lean': hit,
                 'recal_slope': recal_slope(p, A['b0'] if base is None else base, A['y']),
                 'U': pw['U'], 'mde': pw['mde'], 'powered': pw['powered'],
                 'base_bss': float(stat(base, A['b0'], A['y'])) if base is not None else None}
            # per-reading descriptive split for two-reading blocks (alone only)
            if c['kind'] == 'alone' and len(INPUTS[c['input']]) > 1:
                r['single'] = {}
                for j, f in enumerate(INPUTS[c['input']]):
                    A1 = dict(A); A1['Xin'] = A['Xin'][:, [j]]
                    p1, _, _ = fit_cell(A1)
                    r['single'][f] = float(stat(p1, A['b0'], A['y']))
            # per-instrument / per-year descriptive
            r['by_inst'] = {}
            for i in np.unique(A['inst_ix']):
                q = p.copy(); q[A['inst_ix'] != i] = np.nan
                r['by_inst'][R.INST[i]] = float(stat(q, A['b0'], A['y'], base))
            r['by_year'] = {}
            for Y in sorted(set(A['year'][m].tolist())):
                q = p.copy(); q[A['year'] != Y] = np.nan
                r['by_year'][int(Y)] = float(stat(q, A['b0'], A['y'], base))
            res.append(r)
            stash[c['name']] = {'dates': H.dates[A['date_ix'][m]], 'inst': np.asarray(R.INST)[A['inst_ix'][m]],
                                'y': A['y'][m], 'b0': A['b0'][m], 'p': p[m],
                                'base': base[m] if base is not None else None}
            log(f"{c['name']}: est {est:+.5f} [{lo:+.5f}, {hi:+.5f}] plc95 {r['placebo_p95']:+.5f} U {pw['U']:+.5f} "
                f"p {pval:.3f} halves {hv[0]:+.5f}/{hv[1]:+.5f} ({time.time() - t0:.0f}s)")
    adj = holm([r['p'] for r in res])
    for r, a in zip(res, adj):
        r['p_holm'] = float(a)
        G = {'G1': bool(r['lo'] > 0 and a < 0.05), 'G2': bool(r['est'] > r['placebo_p95']),
             'G3': bool(min(r['halves']) > 0), 'G4': bool(r['lead_sign_share'] is not None and r['lead_sign_share'] >= 0.75)}
        r['gates'] = G
        r['verdict'] = word(G, r['powered'], r['hi'], r['U'])
    return res, stash


def input_word(ws):
    if 'VALIDATED' in ws:
        return 'VALIDATED'
    if 'CONTEXT' in ws:
        return 'CONTEXT'
    if all(w == 'NULL' for w in ws):
        return 'NULL'
    return 'UNDERPOWERED'


# ───────────────────────────── selftest ─────────────────────────────

def selftest():
    log('selftest: synthetic panel through the exact cell scorer')
    rng = np.random.default_rng(SEED)
    dates = pd.bdate_range('2016-01-04', '2024-12-31')
    T, n = len(dates), 3
    yr = dates.year.to_numpy()
    first = {int(v): int(np.argmax(yr == v)) for v in sorted(set(yr))}
    ok = True
    for ic, expect in ((0.15, True), (0.0, False)):
        x = np.zeros((T, n))
        for t in range(1, T):
            x[t] = 0.9 * x[t - 1] + rng.standard_normal(n)
        Xin = np.column_stack([x.reshape(-1), rng.standard_normal(T * n)])
        A = {'Xin': Xin, 'Xb': rng.standard_normal((T * n, 4)), 'b0': np.full(T * n, 0.5),
             'date_ix': np.repeat(np.arange(T), n), 'inst_ix': np.tile(np.arange(n), T),
             'end_ix': np.repeat(np.arange(T), n), 'year': np.repeat(yr, n),
             'month': np.repeat((dates.year * 12 + dates.month).to_numpy(), n), 'first': first,
             'years': list(range(2018, 2025)), 'kind': 'alone'}
        A['y'] = synth_y({'Xin': Xin[:, :1]}, ic, rng)
        for kind in ('alone', 'incr'):
            A['kind'] = kind
            p, base, ws = fit_cell(A, keep=True)
            est = stat(p, A['b0'], A['y'], base)
            draws, _, _ = boot(A, p, base, np.random.default_rng(1), B=400)
            lo = np.percentile(draws, 2.5)
            plv = np.array([_placebo_job((A, base, s))[0] for s in range(40)])
            flagged = bool(lo > 0 and est > np.percentile(plv, 95))
            log(f'  ic {ic} {kind}: est {est:+.5f} lo {lo:+.5f} plc95 {np.percentile(plv, 95):+.5f} flagged {flagged}')
            ok &= flagged == expect
    # point-in-time unit check: a snapshot dated d must never serve session d
    v = _asof_prev(pd.DatetimeIndex(['2020-01-02', '2020-01-03']).to_numpy(),
                   pd.DatetimeIndex(['2020-01-02', '2020-01-03']).to_numpy(), np.array([1.0, 2.0]))
    ok &= bool(np.isnan(v[0]) and v[1] == 1.0)
    log('selftest', 'PASS' if ok else 'FAIL')
    return ok


# ───────────────────────────── depth ─────────────────────────────

def depth():
    out = {}
    b = load_book()
    for inst, g in b.groupby('inst'):
        gg = g[g.t < LOCKBOX]
        out[f'book_{inst}'] = {'first': str(g.t.min()), 'last': str(g.t.max()), 'n_pre_lockbox': int(len(gg)),
                               'crowd_mean': float(gg.crowd.mean()), 'crowd_sd': float(gg.crowd.std())}
    for inst in IV_MAP:
        d = load_iv(inst)
        out[f'iv_{inst}'] = {'first': str(d.date.min().date()), 'last': str(d.date.max().date()), 'n_pre_lockbox': int(len(d)),
                             'rr_nonnull': int(d.rr25_30.notna().sum())}
    for key in ('spx500', 'de30', 'uk100'):
        idx, c, _ = ny_closes(key)
        out[f'm1_{key}'] = {'first': str(idx.min().date()), 'last': str(idx.max().date()), 'n_days': int(len(idx))}
    return out


def crosscheck():
    """book: our crowd series vs the server's daily longPct (read-only GET), 2019-09 -> lockbox."""
    import urllib.request
    b = load_book()
    out = {}
    inv = {v: k for k, v in BOOK_MAP.items()}
    for inst in BOOK_MAP.values():
        url = f'https://macrofxmodel-production.up.railway.app/api/oanda-book/history?instrument={inv[inst]}'
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'research-client'}), timeout=60) as f:
            j = json.load(f)
        s = pd.DataFrame(j['daily'], columns=j['dcols'])
        s['d'] = pd.to_datetime(s['d'])
        s = s[s.d < LOCKBOX]
        g = b[b.inst == inst].copy(); g['d'] = g.t.dt.normalize()
        m = g.merge(s[['d', 'longPct']], on='d', how='inner')
        out[inst] = {'n_overlap': int(len(m)), 'corr': float(np.corrcoef(m.crowd, m.longPct)[0, 1]),
                     'mean_abs_diff_pp': float((m.crowd - m.longPct).abs().mean()),
                     'server_first': str(s.d.min().date()), 'server_rows_pre_lockbox': int(len(s))}
    json.dump(out, open(os.path.join(OUT, 'book_crosscheck.json'), 'w'), indent=1)
    return out


# ───────────────────────────── results ─────────────────────────────

def f5(x):
    return 'n/a' if x is None or not np.isfinite(x) else f'{x * 100:+.3f}%'


def write_results(res, meta, power, packs=None):
    words = {}
    for inp in INPUTS:
        words[inp] = input_word([r['verdict'] for r in res if r['input'] == inp])
    js = {'id': SLUG, 'ranAt': pd.Timestamp.now('UTC').isoformat(), 'seed': SEED, 'B': B_BOOT, 'n_placebo': N_PLACEBO,
          'prereg': PREREG, 'branch': 'claude/signal-bot-bias-analysis-bwr1qv', 'lockbox': str(LOCKBOX.date()),
          'verdict_by_input': words, 'meta': meta,
          'cells': [{k: v for k, v in r.items() if k != 'folds'} | {'folds': r['folds']} for r in res],
          'forward_record_cells': [
              {'name': 'book|other-12-instruments', 'verdict': 'underpowered', 'why': '44 daily rows, all after the lockbox'},
              {'name': 'rr-ibkr|gold,es,nq,fx 1w/1m/3m', 'verdict': 'underpowered', 'why': 'pull starts 2026-11-04, after the lockbox'}],
          'packs': packs or {}}
    os.makedirs(OUT, exist_ok=True)
    json.dump(js, open(os.path.join(OUT, 'results.json'), 'w'), indent=1, default=float)
    return words


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--selftest', action='store_true')
    ap.add_argument('--depth', action='store_true')
    ap.add_argument('--power', action='store_true')
    ap.add_argument('--crosscheck', action='store_true')
    ap.add_argument('--placebo', type=int, default=N_PLACEBO)
    a = ap.parse_args()
    if a.selftest:
        sys.exit(0 if selftest() else 1)
    if a.depth:
        print(json.dumps(depth(), indent=1)); return
    if a.crosscheck:
        print(json.dumps(crosscheck(), indent=1)); return
    P = load_panel()
    P, meta = add_inputs(P)
    if a.power:
        run_power(P); return
    pt = os.path.join(HERE, 'power_table.json')
    if not os.path.exists(pt):
        raise SystemExit('run --power first (power table is part of the prereg via amendment)')
    power = adjust_power(json.load(open(pt)))
    if not selftest():
        raise SystemExit('selftest failed; nothing real scored')
    P = add_targets(P)
    res, stash = score(P, power, a.placebo)
    words = write_results(res, meta, power)
    os.makedirs(CACHE, exist_ok=True)
    rows = []
    for k, v in stash.items():
        d = pd.DataFrame({'cell': k, 'date': v['dates'], 'inst': v['inst'], 'y': v['y'], 'b0': v['b0'], 'p': v['p'],
                          'base': v['base'] if v['base'] is not None else np.nan})
        rows.append(d)
    pr = pd.concat(rows, ignore_index=True)
    assert pd.to_datetime(pr.date).max() <= LOCKBOX
    pr.to_parquet(os.path.join(CACHE, 'oos_predictions.parquet'), index=False)
    log('words', words)


if __name__ == '__main__':
    main()
