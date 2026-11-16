"""mtf-structure: multi-timeframe structure states vs B0 (prereg forge/MTF_STRUCTURE_PREREG.md, seed 20261115).

Families (prereg §3.4): F1 EMA alignment, F2 swing alignment, F3 filtered-HMM alignment, F4 HTF trend / LTF pullback,
F5 conflict-as-no-view on the EMA D1 call, F6 conflict-as-no-view on the HMM D1 call; benchmark: named-state sigma chain.
Statistic: hit-rate excess over the point-in-time base rate B0 (E), or Delta = E(kept) - E(all) for F5/F6.

Usage (from the repo root; local files only, never R2):
    python -X utf8 -I scripts/mtf-structure/run.py --selftest
    python -X utf8 -I scripts/mtf-structure/run.py
"""
from __future__ import annotations

import os
import sys

# single-threaded pools: under a shared, fully loaded CPU the 2-thread KMeans init / numpy pools spun ~2.7x slower
# (profiled 2026-11-15: one H1 fold 290 s -> 109 s, identical EM iterations); n_jobs stays 2
os.environ['OMP_NUM_THREADS'] = '1'
os.environ['MKL_NUM_THREADS'] = '1'
os.environ['OPENBLAS_NUM_THREADS'] = '1'
for _k in list(os.environ):
    if _k.startswith('R2_'):
        del os.environ[_k]

import argparse
import json
import logging
import math
import time
import warnings
from concurrent.futures import ProcessPoolExecutor
from statistics import NormalDist

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.dataset as pds
import pyarrow.parquet as pq

warnings.filterwarnings('ignore')
logging.getLogger('hmmlearn').setLevel(logging.ERROR)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'analysis', 'output', 'mtf-structure')
SEED = 20261115
SLUG = 'mtf-structure'
PREREG = 'forge/MTF_STRUCTURE_PREREG.md'
LOCKBOX = pd.Timestamp('2026-08-21')
CUTOFF_UTC = pd.Timestamp('2026-08-21 20:00:00')     # 21:00 London (BST) on the lockbox session; nothing at/after is read
TEST_START = pd.Timestamp('2018-01-01')
TEST_YEARS = list(range(2018, 2027))
H1_END = pd.Timestamp('2021-12-31')
LON, NY = 'Europe/London', 'America/New_York'
ND = NormalDist()
HORIZONS = [1, 3, 5]
TFS = ['W1', 'D1', 'H4', 'H1']
BLOCK = 21
B_BOOT = 2000
N_SHUFFLE = 200
N_RANDOM = 1000
N_PLANT = 40
M_CELLS = 18
Z_HOLM1 = ND.inv_cdf(1 - 0.05 / (2 * M_CELLS))      # 2.99: the Holm first step, used for the planted-power check
BAR_E, BAR_D = 0.03, 0.02
HMM_CAP = 15000
N_STARTS = 4
JOBS = 2

# (instrument, group, root, key)
INSTRUMENTS = [
    ('EURUSD', 'fx', 'fx', 'eurusd'), ('GBPUSD', 'fx', 'fx', 'gbpusd'), ('USDJPY', 'fx', 'fx', 'usdjpy'),
    ('USDCAD', 'fx', 'fx', 'usdcad'), ('AUDUSD', 'fx', 'fx', 'audusd'), ('NZDUSD', 'fx', 'fx', 'nzdusd'),
    ('USDCHF', 'fx', 'fx', 'usdchf'), ('EURJPY', 'fx', 'fx', 'eurjpy'), ('GBPJPY', 'fx', 'fx', 'gbpjpy'),
    ('GOLD', 'gold', 'fx', 'gold'), ('NAS100', 'idx', 'idx', 'nq'), ('SPX500', 'idx', 'idx', 'spx500'),
    ('US30', 'idx', 'idx', 'us30'),
]
INST = [r[0] for r in INSTRUMENTS]
GROUP_OF = {r[0]: r[1] for r in INSTRUMENTS}
ROOTS = {'fx': 'VolRangeForecaster/data/m1', 'idx': 'portfolioBacktest/cache'}

FAMILIES = ['ema', 'swing', 'hmm', 'pullback', 'conflict-ema', 'conflict-hmm']
FAM_KIND = {'ema': 'dir', 'swing': 'dir', 'hmm': 'dir', 'pullback': 'dir', 'conflict-ema': 'abst', 'conflict-hmm': 'abst'}


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


# ───────────────────────────── loading (local files only) ─────────────────────────────

def read_m1(path, cutoff=CUTOFF_UTC):
    if not os.path.exists(path):
        raise SystemExit(f'MISSING DATA FILE: {path}')
    sch = pq.read_schema(path)
    tcol = next((n for n in ('time', 'datetime', 'timestamp', '__index_level_0__') if n in sch.names), None)
    if tcol is None:
        tcol = next((f.name for f in sch if pa.types.is_timestamp(f.type)), None)
    typ = sch.field(tcol).type
    dset = pds.dataset(path, format='parquet')
    assert pa.types.is_timestamp(typ), f'{path}: unexpected time type {typ}'
    c = cutoff.tz_localize('UTC') if typ.tz else cutoff
    flt = pds.field(tcol) < pa.scalar(c.to_pydatetime(), type=typ)
    tb = dset.to_table(columns=[tcol, 'open', 'high', 'low', 'close'], filter=flt).to_pandas(ignore_metadata=True)
    tt = pd.to_datetime(tb[tcol], utc=True)
    tb = tb.drop(columns=[tcol]).assign(time=tt.to_numpy())
    tb['time'] = pd.to_datetime(tb['time'], utc=True)
    tb = tb.drop_duplicates('time').sort_values('time').reset_index(drop=True)
    assert len(tb), f'{path}: no rows'
    assert tb.time.max() < cutoff.tz_localize('UTC'), 'LOCKBOX BREACH: an M1 bar at/after 2026-08-21 21:00 London was read'
    assert tb.time.min().year >= 2000, f'{path}: 1970 timestamps (BAM trap)'
    return tb


# ───────────────────────────── bars ─────────────────────────────

def _agg(keys, o, h, l, c):
    idx = np.flatnonzero(np.r_[True, keys[1:] != keys[:-1]])
    last = np.r_[idx[1:] - 1, len(c) - 1]
    return keys[idx], o[idx], np.maximum.reduceat(h, idx), np.minimum.reduceat(l, idx), c[last]


def build_bars(m1):
    """dict tf -> dict(o,h,l,c,done) with done = completion time (int64 ns UTC), ascending."""
    t = m1['time']
    tns = t.to_numpy().astype('datetime64[ns]').astype(np.int64)
    o, h, l, c = (m1[k].to_numpy(float) for k in ('open', 'high', 'low', 'close'))
    bars = {}
    for tf, sec in (('H1', 3600), ('H4', 14400)):
        k = tns // (sec * 10**9)
        kk, O, H, L, C = _agg(k, o, h, l, c)
        bars[tf] = dict(o=O, h=H, l=L, c=C, done=(kk + 1) * sec * 10**9)
    tny = t.dt.tz_convert(NY)
    lab = (tny + pd.Timedelta(hours=7)).dt.tz_localize(None).dt.normalize()
    labd = lab.to_numpy().astype('datetime64[D]').astype(np.int64)
    kk, O, H, L, C = _agg(labd, o, h, l, c)
    lidx = pd.DatetimeIndex(kk.astype('datetime64[D]'))
    wk = lidx.dayofweek < 5
    kk, O, H, L, C, lidx = kk[wk], O[wk], H[wk], L[wk], C[wk], lidx[wk]
    done = (lidx + pd.Timedelta(hours=17)).tz_localize(NY).tz_convert('UTC').tz_localize(None).to_numpy().astype('datetime64[ns]').astype(np.int64)
    bars['D1'] = dict(o=O, h=H, l=L, c=C, done=done)
    wkey = lidx.to_period('W-FRI').asi8
    k2, WO, WH, WL, WC = _agg(wkey, O, H, L, C)
    idx = np.flatnonzero(np.r_[True, wkey[1:] != wkey[:-1]])
    lastd = np.r_[idx[1:] - 1, len(wkey) - 1]
    bars['W1'] = dict(o=WO, h=WH, l=WL, c=WC, done=done[lastd])
    for tf in bars:
        assert np.all(np.diff(bars[tf]['done']) > 0), f'{tf} completion times not increasing'
    return bars


# ───────────────────────────── per-timeframe states ─────────────────────────────

def ema_state(c):
    s = pd.Series(c)
    e20 = s.ewm(span=20, adjust=False).mean().to_numpy()
    e50 = s.ewm(span=50, adjust=False).mean().to_numpy()
    out = np.sign(e20 - e50).astype(float)
    out[:50] = np.nan
    return out


def swing_state(h, l):
    n = len(h)
    out = np.full(n, np.nan)
    if n < 10:
        return out
    j = np.arange(2, n - 2)
    sh = (h[j] > h[j - 1]) & (h[j] > h[j - 2]) & (h[j] >= h[j + 1]) & (h[j] >= h[j + 2])
    sl = (l[j] < l[j - 1]) & (l[j] < l[j - 2]) & (l[j] <= l[j + 1]) & (l[j] <= l[j + 2])
    cph, vh = j[sh] + 2, h[j[sh]]          # confirmed at the completion of bar j+2
    cpl, vl = j[sl] + 2, l[j[sl]]
    t = np.arange(n)
    kh = np.searchsorted(cph, t, side='right')
    kl = np.searchsorted(cpl, t, side='right')
    ok = (kh >= 2) & (kl >= 2)
    up = np.zeros(n, bool); dn = np.zeros(n, bool)
    a = t[ok]
    hl, hp = vh[kh[a] - 1], vh[kh[a] - 2]
    ll, lp = vl[kl[a] - 1], vl[kl[a] - 2]
    up[a] = (hl > hp) & (ll > lp)
    dn[a] = (hl < hp) & (ll < lp)
    out[ok] = 0.0
    out[up] = 1.0
    out[dn] = -1.0
    return out


def named_codes(c):
    r = np.r_[np.nan, np.diff(np.log(c))]
    s = pd.Series(r)
    sum20 = s.rolling(20, min_periods=20).sum().to_numpy()
    v20 = s.rolling(20, min_periods=20).std().to_numpy()
    med = pd.Series(v20).shift(1).rolling(250, min_periods=100).median().to_numpy()
    code = np.full(len(c), np.nan)
    ok = np.isfinite(sum20) & np.isfinite(v20) & np.isfinite(med) & (sum20 != 0)
    code[ok] = (sum20[ok] > 0) * 2 + (v20[ok] > med[ok])
    return code, r


def gauss_logpdf(x, mu, var):
    return -0.5 * (np.log(2 * np.pi * var)[None, :] + (x[:, None] - mu[None, :]) ** 2 / var[None, :])


def forward_filter(x, pi, A, mu, var):
    """Filtered state probabilities alpha_t = P(s_t | x_1..x_t): forward recursion only."""
    lb = gauss_logpdf(x, mu, var)
    lb -= lb.max(axis=1, keepdims=True)
    b = np.exp(lb)
    T, K = b.shape
    al = np.empty((T, K))
    a = pi * b[0]
    a /= a.sum()
    al[0] = a
    for t in range(1, T):
        a = (a @ A) * b[t]
        s = a.sum()
        a = a / s if s > 0 else np.full(K, 1.0 / K)
        al[t] = a
    return al


def fit_hmm(X, K, seed=SEED):
    from hmmlearn.hmm import GaussianHMM
    best = None
    for s in range(N_STARTS):
        m = GaussianHMM(n_components=K, covariance_type='diag', n_iter=200, tol=1e-4, min_covar=1e-3, random_state=seed + s)
        try:
            m.fit(X)
            ll = m.score(X)
        except Exception:
            continue
        if np.isfinite(ll) and (best is None or ll > best[0]):
            best = (ll, m)
    return best


def hmm_params(m):
    return m.startprob_.copy(), m.transmat_.copy(), m.means_[:, 0].copy(), np.array([cv[0, 0] for cv in m.covars_])


def hmm_fold(c, done, y0_ns, y1_ns, seed=SEED, want_smooth=True):
    """Fold with training = bars done < y0, test through bars done < y1. Returns (filtered dir, smoothed dir, meta) as
    full-length arrays (NaN outside [w0, end])."""
    n = len(c)
    r = np.r_[np.nan, np.diff(np.log(c))]
    ntr = int(np.searchsorted(done, y0_ns, side='left'))       # bars 0..ntr-1 are training
    nend = int(np.searchsorted(done, y1_ns, side='left'))
    w0 = max(1, ntr - HMM_CAP)
    fdir = np.full(n, np.nan); sdir = np.full(n, np.nan)
    if ntr - w0 < 60:
        return fdir, sdir, None
    rt = r[w0:ntr]
    sd = np.nanstd(rt)
    x = (r[w0:nend] / sd)
    x = np.where(np.isfinite(x), x, 0.0)
    xtr = x[:ntr - w0].reshape(-1, 1)
    cut = int(0.8 * len(xtr))
    held = {}
    for K in (2, 3):
        b = fit_hmm(xtr[:cut], K, seed)
        held[K] = b[1].score(xtr[cut:]) if b is not None else -np.inf
    K = 2 if held[2] >= held[3] else 3
    b = fit_hmm(xtr, K, seed)
    if b is None:
        return fdir, sdir, None
    m = b[1]
    pi, A, mu, var = hmm_params(m)
    al = forward_filter(x, pi, A, mu, var)
    fdir[w0:nend] = np.sign(al @ A @ mu)
    if want_smooth:
        gm = m.predict_proba(x.reshape(-1, 1))
        sdir[w0:nend] = np.sign(gm @ A @ mu)
    meta = {'K': K, 'held_ll2': float(held[2]), 'held_ll3': float(held[3]), 'n_train': int(ntr - w0),
            'dwell': [float(1 / max(1e-9, 1 - A[k, k])) for k in range(K)], 'mu': mu.tolist()}
    return fdir, sdir, meta


def named_fold(c, done, y0_ns, y1_ns):
    n = len(c)
    code, r = named_codes(c)
    ntr = int(np.searchsorted(done, y0_ns, side='left'))
    nend = int(np.searchsorted(done, y1_ns, side='left'))
    w0 = max(1, ntr - HMM_CAP)
    out = np.full(n, np.nan)
    if ntr - w0 < 60:
        return out
    ct = code[w0:ntr - 1]; rn = r[w0 + 1:ntr]
    dmap = np.zeros(4)
    for s in range(4):
        k = (ct == s) & np.isfinite(rn)
        dmap[s] = np.sign(rn[k].mean()) if k.any() else 0.0
    cc = code[w0:nend]
    v = np.full(len(cc), np.nan)
    ok = np.isfinite(cc)
    v[ok] = dmap[cc[ok].astype(int)]
    out[w0:nend] = v
    return out


def last_completed(done_ns, values, t_ns):
    k = np.searchsorted(done_ns, t_ns, side='right') - 1
    out = np.full(len(t_ns), np.nan)
    ok = k >= 0
    out[ok] = values[k[ok]]
    return out


def year_ns(y):
    return int(pd.Timestamp(f'{y}-01-01').value)


def instrument_states(m1, inst, years=TEST_YEARS, cutoff=CUTOFF_UTC, want_smooth=True):
    """Per London session: P0, sigma, and every per-timeframe state as read at 07:00 London."""
    t = m1['time']
    tl = t.dt.tz_convert(LON)
    ldate = tl.dt.tz_localize(None).dt.normalize()
    mod = (tl.dt.hour * 60 + tl.dt.minute).to_numpy()
    wd = ldate.dt.dayofweek.to_numpy()
    df = pd.DataFrame({'ldate': ldate.to_numpy(), 'mod': mod, 'o': m1['open'].to_numpy(float)})
    df = df[wd < 5]
    e7 = df[(df['mod'] >= 420) & (df['mod'] <= 424)].groupby('ldate').first()
    sess = pd.DataFrame({'P0': e7['o']})
    sess.index = pd.DatetimeIndex(sess.index)
    dates = sess.index
    t7 = (dates + pd.Timedelta(hours=7)).tz_localize(LON).tz_convert('UTC').tz_localize(None).to_numpy().astype('datetime64[ns]').astype(np.int64)
    bars = build_bars(m1)
    d1c = bars['D1']['c']
    r1 = np.r_[np.nan, np.diff(np.log(d1c))]
    sig20 = pd.Series(r1).rolling(20, min_periods=20).std().to_numpy()
    sess['sig'] = last_completed(bars['D1']['done'], sig20, t7)
    meta = []
    yrs = dates.year.to_numpy()
    for tf in TFS:
        B = bars[tf]
        sess[f'T_{tf}'] = last_completed(B['done'], ema_state(B['c']), t7)
        sess[f'S_{tf}'] = last_completed(B['done'], swing_state(B['h'], B['l']), t7)
        for col in ('H', 'Hs', 'N'):
            sess[f'{col}_{tf}'] = np.nan
        for Y in years:
            ky = yrs == Y
            if not ky.any():
                continue
            y0, y1 = year_ns(Y), min(year_ns(Y + 1), int(cutoff.value))
            f, s, mt = hmm_fold(B['c'], B['done'], y0, y1, want_smooth=want_smooth)
            nm = named_fold(B['c'], B['done'], y0, y1)
            sess.loc[ky, f'H_{tf}'] = last_completed(B['done'], f, t7[ky])
            sess.loc[ky, f'Hs_{tf}'] = last_completed(B['done'], s, t7[ky])
            sess.loc[ky, f'N_{tf}'] = last_completed(B['done'], nm, t7[ky])
            if mt is not None:
                mt.update({'inst': inst, 'tf': tf, 'year': Y})
                meta.append(mt)
    sess['inst'] = inst
    sess.attrs['weekdays_with_data'] = int(df.ldate.nunique())
    sess = sess.reset_index().rename(columns={'index': 'date', 'ldate': 'date'})
    return sess, meta


def _worker(row):
    """States for one instrument; cached per instrument (states only, no outcome) so a restart resumes."""
    from threadpoolctl import threadpool_limits
    threadpool_limits(1)
    inst, grp, rk, key = row
    cdir = os.path.join(OUT, 'state_cache')
    os.makedirs(cdir, exist_ok=True)
    cp, cm = os.path.join(cdir, f'{inst}.parquet'), os.path.join(cdir, f'{inst}.json')
    if os.path.exists(cp) and os.path.exists(cm):
        info = json.load(open(cm))
        return inst, pd.read_parquet(cp), info['meta'], (info['m1_rows'], info['wdd']), 0.0
    p = os.path.join(ROOT, ROOTS[rk], f'{key}_m1.parquet')
    t0 = time.time()
    m1 = read_m1(p)
    sess, meta = instrument_states(m1, inst)
    wdd = int(sess.attrs.get('weekdays_with_data', -1))
    sess.attrs = {}
    sess.to_parquet(cp)
    json.dump({'meta': meta, 'm1_rows': int(len(m1)), 'wdd': wdd}, open(cm, 'w'))
    return inst, sess, meta, (len(m1), wdd), time.time() - t0


# ───────────────────────────── outcomes, B0, families ─────────────────────────────

def add_outcomes(P):
    P = P.sort_values(['inst', 'date']).reset_index(drop=True)
    for h in HORIZONS:
        P[f'y{h}'] = np.nan; P[f'm{h}'] = np.nan; P[f'end{h}'] = pd.NaT; P[f'b0{h}'] = np.nan
    for inst in INST:
        ix = np.flatnonzero((P.inst == inst).to_numpy() & P.P0.notna().to_numpy())
        p0 = P.P0.to_numpy()[ix]; d = P.date.to_numpy()[ix]; sg = P.sig.to_numpy()[ix]
        for h in HORIZONS:
            y = np.full(len(ix), np.nan); mv = np.full(len(ix), np.nan)
            end = np.full(len(ix), np.datetime64('NaT'), dtype='datetime64[ns]')
            ph = np.r_[p0[h:], np.full(h, np.nan)]
            ok = np.isfinite(ph) & (ph != p0)
            y[ok] = (ph[ok] > p0[ok]).astype(float)
            mv[ok] = np.log(ph[ok] / p0[ok]) / sg[ok]
            end[:len(ix) - h] = d[h:]
            end[~ok] = np.datetime64('NaT')
            # point-in-time B0: labels whose end < d
            okl = np.isfinite(y)
            e = end[okl].astype('datetime64[ns]').astype(np.int64); yy = y[okl]
            order = np.argsort(e, kind='stable'); e = e[order]; yy = yy[order]
            cs = np.r_[0, np.cumsum(yy)]
            k = np.searchsorted(e, d.astype('datetime64[ns]').astype(np.int64), side='left')
            b0 = (cs[k] + 10) / (k + 20)
            P.loc[P.index[ix], f'y{h}'] = y
            P.loc[P.index[ix], f'm{h}'] = mv
            P.loc[P.index[ix], f'end{h}'] = end
            P.loc[P.index[ix], f'b0{h}'] = b0
        for h in HORIZONS:
            e = pd.to_datetime(P[f'end{h}'])
            assert (e.dropna() <= LOCKBOX).all(), 'LOCKBOX BREACH: a horizon ends after 2026-08-21'
    return P


def all_eq(P, pre, sign_nonzero=True):
    v = np.stack([P[f'{pre}_{tf}'].to_numpy() for tf in TFS], 1)
    ok = np.all(np.isfinite(v), 1) & np.all(v == v[:, :1], 1)
    if sign_nonzero:
        ok &= v[:, 0] != 0
    out = np.zeros(len(P))
    out[ok] = v[ok, 0]
    return out


def family_sides(P):
    """Returns dict name -> (side, kept or None); kept marks F5/F6-type kept rows; side for those is the base call."""
    S = {}
    S['ema'] = (all_eq(P, 'T'), None)
    S['swing'] = (all_eq(P, 'S'), None)
    S['hmm'] = (all_eq(P, 'H'), None)
    S['named'] = (all_eq(P, 'N'), None)
    S['hmm_smooth'] = (all_eq(P, 'Hs'), None)
    tw, td, t4, th = (P[f'T_{tf}'].to_numpy() for tf in TFS)
    pb = np.zeros(len(P))
    k = np.isfinite(tw) & np.isfinite(td) & np.isfinite(t4) & np.isfinite(th) & (tw == td) & (t4 == th) & (t4 == -tw) & (tw != 0)
    pb[k] = tw[k]
    S['pullback'] = (pb, None)
    base = np.nan_to_num(td)
    S['conflict-ema'] = (base, S['ema'][0] != 0)
    hd = np.nan_to_num(P['H_D1'].to_numpy())
    S['conflict-hmm'] = (hd, S['hmm'][0] != 0)
    nd = np.nan_to_num(P['N_D1'].to_numpy())
    S['conflict-named'] = (nd, S['named'][0] != 0)
    hsd = np.nan_to_num(P['Hs_D1'].to_numpy())
    S['conflict-hmm-smooth'] = (hsd, S['hmm_smooth'][0] != 0)
    return S


# ───────────────────────────── matrices and statistics ─────────────────────────────

class Grid:
    def __init__(self, P):
        P = P[(P.date >= TEST_START) & (P.date <= LOCKBOX)]
        self.dates = pd.DatetimeIndex(sorted(P.date.unique()))
        self.di = self.dates.get_indexer(P.date)
        self.ii = np.array([INST.index(x) for x in P.inst])
        self.P = P.reset_index(drop=True)
        self.T, self.N = len(self.dates), len(INST)

    def mat(self, v):
        M = np.full((self.T, self.N), np.nan)
        M[self.di, self.ii] = np.asarray(v, float)
        return M


def block_starts(T, rng, B):
    nb = int(math.ceil(T / BLOCK))
    st = rng.integers(0, T - BLOCK + 1, size=(B, nb))
    idx = (st[:, :, None] + np.arange(BLOCK)[None, None, :]).reshape(B, -1)[:, :T]
    return idx


def block_perm(T, rng):
    blocks = [np.arange(s, min(s + BLOCK, T)) for s in range(0, T, BLOCK)]
    order = rng.permutation(len(blocks))
    return np.concatenate([blocks[k] for k in order])


def sums(side, ex, mask=None):
    """per-date numerator and count; rows count when side != 0 and ex finite (and mask)."""
    ok = (side != 0) & np.isfinite(ex) & np.isfinite(side)
    if mask is not None:
        ok &= mask
    num = np.where(ok, side * np.nan_to_num(ex), 0.0).sum(1)
    cnt = ok.sum(1).astype(float)
    return num, cnt


def stat_from(num, cnt, numk=None, cntk=None, idx=None):
    if idx is None:
        e = num.sum() / max(cnt.sum(), 1)
        if numk is None:
            return e
        return numk.sum() / max(cntk.sum(), 1) - e
    e = num[idx].sum(1) / np.maximum(cnt[idx].sum(1), 1)
    if numk is None:
        return e
    return numk[idx].sum(1) / np.maximum(cntk[idx].sum(1), 1) - e


def score_cell(side, ex, kept, rng, dates, idx_boot, bar, Y=None, B0=None, plants=True, n_plant=N_PLANT):
    """side/ex/kept: (T, N) matrices. kept None -> direction cell (E); else abstention cell (Delta)."""
    T = len(dates)
    abst = kept is not None
    num, cnt = sums(side, ex)
    numk, cntk = sums(side, ex, kept) if abst else (None, None)
    est = float(stat_from(num, cnt, numk, cntk))
    bs = stat_from(num, cnt, numk, cntk, idx_boot)
    lo, hi = np.percentile(bs, [2.5, 97.5])
    se_b = float(np.std(bs, ddof=1))
    # outcome shuffle: whole 21-session date blocks of the excess matrix
    sh = []
    for _ in range(N_SHUFFLE):
        p = block_perm(T, rng)
        n1, c1 = sums(side, ex[p])
        if abst:
            n2, c2 = sums(side, ex[p], kept)
            sh.append(stat_from(n1, c1, n2, c2))
        else:
            sh.append(stat_from(n1, c1))
    sh = np.asarray(sh)
    se = max(se_b, float(np.std(sh, ddof=1)))
    z = est / se if se > 0 else 0.0
    p = 2 * (1 - ND.cdf(abs(z)))
    res = {'est': est, 'lo': float(lo), 'hi': float(hi), 'se_boot': se_b, 'se_shuffle': float(np.std(sh, ddof=1)),
           'se': se, 'z': float(z), 'p': float(p), 'shuffle_pct': float((sh < est).mean() * 100),
           'shuffle_q975': float(np.percentile(sh, 97.5)),
           'n_rows': int(cntk.sum() if abst else cnt.sum()), 'n_dates': int(((cntk if abst else cnt) > 0).sum())}
    if abst:
        res['n_base_rows'] = int(cnt.sum())
        res['keep_rate'] = float(cntk.sum() / max(cnt.sum(), 1))
        # random abstention at the same keep count per instrument
        ok = (side != 0) & np.isfinite(ex) & np.isfinite(side)
        kcount = (ok & kept).sum(0)
        rv = []
        for _ in range(N_RANDOM):
            rk = np.zeros_like(ok)
            for j in range(ok.shape[1]):
                pos = np.flatnonzero(ok[:, j])
                if kcount[j] and len(pos):
                    rk[rng.choice(pos, kcount[j], replace=False), j] = True
            n2, c2 = sums(side, ex, rk)
            rv.append(stat_from(num, cnt, n2, c2))
        rv = np.asarray(rv)
        res['random_abst'] = {'p2_5': float(np.percentile(rv, 2.5)), 'p5': float(np.percentile(rv, 5)),
                              'p95': float(np.percentile(rv, 95)), 'p97_5': float(np.percentile(rv, 97.5)),
                              'mean': float(rv.mean()), 'real_pct': float((rv < est).mean() * 100)}
        res['g4_q'] = res['random_abst']['p97_5']
    else:
        res['g4_q'] = res['shuffle_q975']
    # halves
    h1 = np.asarray(dates <= H1_END)
    for nm, msk in (('H1', h1), ('H2', ~h1)):
        a, b = num[msk], cnt[msk]
        if abst:
            res[nm] = float(stat_from(a, b, numk[msk], cntk[msk]))
        else:
            res[nm] = float(stat_from(a, b))
    # descriptive raw hit rates on called / kept rows
    m = (side != 0) & np.isfinite(ex) & (kept if abst else True)
    if Y is not None:
        hit = ((side * (Y - 0.5)) > 0)[m]
        bh = np.where(side > 0, B0, 1 - B0)[m]
        res['hit_rate'] = float(hit.mean()) if m.any() else None
        res['b0_hit'] = float(bh.mean()) if m.any() else None
    # planted control on the real rows: flip a share q of wrong calls to right (bar-sized hit-rate gain)
    if plants and Y is not None:
        prow = m.copy()
        hit_all = (side * (Y - 0.5)) > 0
        hr = hit_all[prow].mean()
        k = res.get('keep_rate', 1.0) if abst else 1.0
        q = bar / ((1 - hr) * ((1 - k) if abst else 1.0))
        q = min(q, 1.0)
        wrong = prow & ~hit_all & np.isfinite(Y)
        det = 0; recs = []
        idx_small = idx_boot[:300]
        for _ in range(n_plant):
            flip = wrong & (rng.random(Y.shape) < q)
            Yp = np.where(flip, 1 - Y, Y)
            exp_ = Yp - B0
            n1, c1 = sums(side, exp_)
            if abst:
                n2, c2 = sums(side, exp_, kept)
                e1 = stat_from(n1, c1, n2, c2); bb = stat_from(n1, c1, n2, c2, idx_small)
            else:
                e1 = stat_from(n1, c1); bb = stat_from(n1, c1, idx=idx_small)
            s1 = max(float(np.std(bb, ddof=1)), res['se_shuffle'])
            recs.append(e1)
            det += int(e1 / s1 >= Z_HOLM1)
        res['plant'] = {'q': float(q), 'detected': det / n_plant, 'mean_recovered': float(np.mean(recs)) - est}
    return res


def holm(pvals, alpha=0.05):
    m = len(pvals)
    order = np.argsort(pvals)
    adj = np.empty(m)
    run = 0.0
    for r, i in enumerate(order):
        run = max(run, (m - r) * pvals[i])
        adj[i] = min(1.0, run)
    return adj


def bh(pvals, q=0.10):
    p = np.asarray(pvals, float)
    m = len(p)
    if m == 0:
        return np.zeros(0, bool)
    order = np.argsort(p)
    thr = q * (np.arange(1, m + 1)) / m
    passed = p[order] <= thr
    k = np.max(np.flatnonzero(passed)) + 1 if passed.any() else 0
    out = np.zeros(m, bool)
    out[order[:k]] = True
    return out


def cell_word(c, bar):
    if all(c['gates'].values()):
        return 'VALIDATED'
    powered = c['gates']['G6_powered']
    if powered and c['hi'] < bar:
        return 'CONTEXT' if c['lo'] > 0 else 'NULL'
    return 'UNDERPOWERED'


def family_word(words):
    if 'VALIDATED' in words:
        return 'VALIDATED'
    if 'UNDERPOWERED' in words:
        return 'UNDERPOWERED'
    if 'CONTEXT' in words:
        return 'CONTEXT'
    return 'NULL'


# ───────────────────────────── selftest (synthetic only) ─────────────────────────────

def selftest():
    rng = np.random.default_rng(SEED)
    ok = True
    # (i) planted alignment effect recovered; null not flagged
    T, N = 2250, 13
    dates = pd.bdate_range('2018-01-02', periods=T)
    lat = np.zeros((T, N)); phi = 1 - 1 / 8
    for t in range(1, T):
        lat[t] = phi * lat[t - 1] + math.sqrt(1 - phi ** 2) * (0.7 * rng.standard_normal() + 0.7 * rng.standard_normal(N))
    side = np.where(np.abs(lat) > np.quantile(np.abs(lat), 0.7), np.sign(lat), 0.0)
    f = rng.standard_normal(T)[:, None]
    base_up = (0.6 * f + 0.8 * rng.standard_normal((T, N))) > 0
    B0 = np.full((T, N), 0.5)
    idx = block_starts(T, rng, 1000)
    for eff, label in ((0.06, 'planted'), (0.0, 'null')):
        Y = base_up.astype(float)
        right = (side * (Y - 0.5)) > 0
        q = eff / 0.5
        flip = (side != 0) & ~right & (rng.random((T, N)) < q)
        Y = np.where(flip, 1 - Y, Y)
        r = score_cell(side, Y - B0, None, rng, dates, idx, BAR_E, Y=Y, B0=B0, plants=False)
        log(f'selftest (i) {label}: E {r["est"]:+.4f} [{r["lo"]:+.4f}, {r["hi"]:+.4f}] z {r["z"]:+.2f}')
        if label == 'planted' and not (r['lo'] > 0 and r['z'] >= Z_HOLM1):
            ok = False; log('  FAIL: planted effect not recovered')
        if label == 'null' and abs(r['z']) >= Z_HOLM1:
            ok = False; log('  FAIL: null flagged')
    # abstention: planted Delta on kept rows recovered
    kept = side != 0
    base = np.where(side != 0, side, np.sign(lat))
    Y = base_up.astype(float)
    right = (base * (Y - 0.5)) > 0
    flip = kept & ~right & (rng.random((T, N)) < 0.06 / 0.5 / 0.7)
    Y = np.where(flip, 1 - Y, Y)
    r = score_cell(base, Y - B0, kept, rng, dates, idx, BAR_D, Y=Y, B0=B0, plants=False)
    log(f'selftest (i) abstention planted: Delta {r["est"]:+.4f} [{r["lo"]:+.4f}, {r["hi"]:+.4f}], random band 97.5 {r["random_abst"]["p97_5"]:+.4f}')
    if not (r['lo'] > 0 and r['est'] > r['random_abst']['p97_5']):
        ok = False; log('  FAIL: planted abstention not recovered')

    # (ii) HMM: forward filter == hmmlearn posterior at the last obs; future perturbation; smoothed leak visible
    from hmmlearn.hmm import GaussianHMM
    n = 8000
    A = np.array([[0.97, 0.03], [0.03, 0.97]]); mu = np.array([0.3, -0.3])
    s = np.zeros(n, int)
    for t in range(1, n):
        s[t] = rng.choice(2, p=A[s[t - 1]])
    x = mu[s] + rng.standard_normal(n)
    b = fit_hmm(x[:6000].reshape(-1, 1), 2)
    m = b[1]
    pi, AA, mm, vv = hmm_params(m)
    al = forward_filter(x[:5000], pi, AA, mm, vv)
    gm = m.predict_proba(x[:5000].reshape(-1, 1))
    d_last = float(np.abs(al[-1] - gm[-1]).max())
    log(f'selftest (ii) forward filter vs hmmlearn posterior at the last obs: max diff {d_last:.2e}')
    if d_last > 1e-6:
        ok = False; log('  FAIL: forward filter mismatch')
    x2 = x.copy(); x2[3000:] += 5 * rng.standard_normal(n - 3000)
    al2 = forward_filter(x2[:5000], pi, AA, mm, vv)
    if not np.allclose(al[:3000], al2[:3000]):
        ok = False; log('  FAIL: filtered probabilities changed when the future changed')
    gm2 = m.predict_proba(x2[:5000].reshape(-1, 1))
    log(f'selftest (ii) future perturbation: filtered max change before t {np.abs(al[:3000]-al2[:3000]).max():.1e}; smoothed {np.abs(gm[:3000]-gm2[:3000]).max():.2f}')
    xt = x[6000:]
    alt = forward_filter(xt, pi, AA, mm, vv)
    gmt = m.predict_proba(xt.reshape(-1, 1))
    fd = np.sign(alt @ AA @ mm)[:-1]; sd_ = np.sign(gmt @ AA @ mm)[:-1]
    nx = np.sign(xt[1:])
    af, as_ = float((fd == nx).mean()), float((sd_ == nx).mean())
    log(f'selftest (ii) next-obs direction accuracy: filtered {af:.3f}, smoothed {as_:.3f} (leak {as_-af:+.3f})')
    if as_ - af < 0.02:
        ok = False; log('  FAIL: smoothed leak not visible')

    # (iii) synthetic M1: perturbing bars after 07:00 London on a date leaves its states unchanged
    tt = pd.date_range('2015-09-01', '2017-12-29 23:59', freq='min', tz='UTC')
    tt = tt[tt.dayofweek < 5]
    rr = rng.standard_normal(len(tt)) * 2e-4 + 1e-6 * np.sin(np.arange(len(tt)) / 5000)
    cl = 1.1 * np.exp(np.cumsum(rr))
    op = np.r_[cl[0], cl[:-1]]
    hi_ = np.maximum(op, cl) * (1 + np.abs(rng.standard_normal(len(tt))) * 5e-5)
    lo_ = np.minimum(op, cl) * (1 - np.abs(rng.standard_normal(len(tt))) * 5e-5)
    m1 = pd.DataFrame({'time': tt, 'open': op, 'high': hi_, 'low': lo_, 'close': cl})
    cut = pd.Timestamp('2017-06-14 07:00', tz=LON).tz_convert('UTC')
    m1b = m1.copy()
    later = (m1b.time >= cut).to_numpy()
    for k_ in ('open', 'high', 'low', 'close'):
        m1b.loc[later, k_] = m1b.loc[later, k_].to_numpy() * np.exp(np.cumsum(rng.standard_normal(later.sum()) * 1e-3))
    m1b['high'] = m1b[['open', 'high', 'low', 'close']].max(axis=1); m1b['low'] = m1b[['open', 'high', 'low', 'close']].min(axis=1)
    sa, _ = instrument_states(m1, 'SYN', years=[2017], cutoff=pd.Timestamp('2018-01-01'))
    sb, _ = instrument_states(m1b, 'SYN', years=[2017], cutoff=pd.Timestamp('2018-01-01'))
    sa = sa.set_index('date'); sb = sb.set_index('date')
    upto = sa.index <= pd.Timestamp('2017-06-14')
    cols = [c for c in sa.columns if c[:2] in ('T_', 'S_', 'H_', 'N_')]
    diff = [(c) for c in cols if not np.array_equal(np.nan_to_num(sa.loc[upto, c].to_numpy(), nan=9), np.nan_to_num(sb.loc[upto, c].to_numpy(), nan=9))]
    sm_changed = [c for c in sa.columns if c.startswith('Hs_') and not np.array_equal(np.nan_to_num(sa.loc[upto, c].to_numpy(), nan=9), np.nan_to_num(sb.loc[upto, c].to_numpy(), nan=9))]
    filled = {c: int(np.isfinite(sa.loc[upto & (sa.index >= pd.Timestamp('2017-01-01')), c]).sum()) for c in cols}
    log(f'selftest (iii) states on/before the perturbed date changed: {diff or "none"}; smoothed changed: {sm_changed}; filled rows {filled}')
    if diff:
        ok = False; log('  FAIL: a state read the future')
    # N_W1 needs 20 + 100 weekly bars before its first code (prereg 3.3), more than this synthetic history holds
    if min(v for k, v in filled.items() if k != 'N_W1') == 0:
        ok = False; log('  FAIL: a state column is empty on synthetic data')
    log('SELFTEST', 'PASSED' if ok else 'FAILED')
    return ok


# ───────────────────────────── main run ─────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--selftest', action='store_true')
    ap.add_argument('--states-only', action='store_true')
    ap.add_argument('--reuse-states', action='store_true')
    a = ap.parse_args()
    if a.selftest:
        sys.exit(0 if selftest() else 1)
    assert not any(k.startswith('R2_') for k in os.environ), 'R2 credentials present'
    os.makedirs(OUT, exist_ok=True)
    if not selftest():
        raise SystemExit('selftest failed: no real outcome is read')
    cache = os.path.join(OUT, 'states.parquet')
    if a.reuse_states and os.path.exists(cache):
        P = pd.read_parquet(cache)
        meta = json.load(open(os.path.join(OUT, 'hmm_meta.json')))
        loadinfo = json.load(open(os.path.join(OUT, 'load_info.json')))
    else:
        frames, meta, loadinfo = [], [], {}
        with ProcessPoolExecutor(max_workers=JOBS) as ex:
            for inst, sess, mt, nrow, sec in ex.map(_worker, INSTRUMENTS):
                nrow, wdd = nrow
                log(f'{inst}: {nrow} M1 rows, {len(sess)} sessions with a 07:00 bar of {wdd} weekdays with data, {sec:.0f}s')
                frames.append(sess); meta += mt
                loadinfo[inst] = {'m1_rows': int(nrow), 'sessions_with_P0': int(len(sess)), 'weekdays_with_data': wdd,
                                  'dropped_no_0700_bar': int(wdd - len(sess))}
        P = pd.concat(frames, ignore_index=True)
        P = P[(P.date >= pd.Timestamp('2016-01-04')) & (P.date <= LOCKBOX)].reset_index(drop=True)
        P.to_parquet(cache)
        json.dump(meta, open(os.path.join(OUT, 'hmm_meta.json'), 'w'), indent=0)
        json.dump(loadinfo, open(os.path.join(OUT, 'load_info.json'), 'w'), indent=1)
    assert P.date.max() <= LOCKBOX
    if a.states_only:
        return
    # ── outcomes (first read of any outcome) ──
    P = add_outcomes(P)
    S = family_sides(P)
    G = Grid(P)
    rng = np.random.default_rng(SEED)
    idx_boot = block_starts(G.T, rng, B_BOOT)
    sel = (P.date >= TEST_START).to_numpy()
    Psel = P[sel].reset_index(drop=True)
    assert len(Psel) == len(G.P)
    results = {'id': SLUG, 'prereg': PREREG, 'seed': SEED, 'B': B_BOOT, 'n_shuffle': N_SHUFFLE, 'n_random': N_RANDOM,
               'ranAt': pd.Timestamp.now(tz='UTC').strftime('%Y-%m-%dT%H:%M:%SZ'), 'branch': 'claude/signal-bot-bias-analysis-bwr1qv',
               'test_span': [str(G.dates.min().date()), str(G.dates.max().date())], 'n_dates': int(G.T),
               'load': loadinfo, 'cells': [], 'bench': {}, 'descriptive': {}}
    mats = {}
    for h in HORIZONS:
        Y = G.mat(Psel[f'y{h}']); B0 = G.mat(Psel[f'b0{h}']); M = G.mat(Psel[f'm{h}'])
        mats[h] = (Y, B0, Y - B0, M)
    SM = {k: (G.mat(v[0][sel]), None if v[1] is None else np.nan_to_num(G.mat(v[1][sel]), nan=0.0).astype(bool)) for k, v in S.items()}
    cov = {k: float((SM[k][0] != 0).mean()) if SM[k][1] is None else float(np.nanmean(SM[k][1])) for k in SM}
    results['descriptive']['coverage'] = cov
    log('coverage (share of test instrument-sessions called / kept):', {k: round(v, 3) for k, v in cov.items()})

    cells = []
    for fam in FAMILIES:
        side, kept = SM[fam]
        bar = BAR_D if kept is not None else BAR_E
        for h in HORIZONS:
            Y, B0, EX, M = mats[h]
            c = score_cell(side, EX, kept, rng, G.dates, idx_boot, bar, Y=Y, B0=B0)
            c.update({'family': fam, 'h': h, 'bar': bar, 'name': f'{fam}|h{h}'})
            # sigma-scaled move (descriptive)
            msk = (side != 0) & np.isfinite(M) & (kept if kept is not None else True)
            c['sigma_move'] = float(np.nanmean((side * M)[msk])) if msk.any() else None
            # G5 for HMM cells: HMM - named on the same bootstrap draws
            if fam in ('hmm', 'conflict-hmm'):
                bn = 'named' if fam == 'hmm' else 'conflict-named'
                ns, nk = SM[bn]
                a1, a2 = sums(side, EX), sums(ns, EX)
                if kept is None:
                    dh = stat_from(*a1, idx=idx_boot) - stat_from(*a2, idx=idx_boot)
                    dpt = stat_from(*a1) - stat_from(*a2)
                else:
                    k1, k2 = sums(side, EX, kept), sums(ns, EX, nk)
                    dh = stat_from(*a1, *k1, idx_boot) - stat_from(*a2, *k2, idx_boot)
                    dpt = stat_from(*a1, *k1) - stat_from(*a2, *k2)
                c['vs_named'] = {'diff': float(dpt), 'lo': float(np.percentile(dh, 2.5)), 'hi': float(np.percentile(dh, 97.5))}
            cells.append(c)
            log(f"{c['name']}: est {c['est']:+.4f} [{c['lo']:+.4f}, {c['hi']:+.4f}] z {c['z']:+.2f} n {c['n_rows']} plant {c['plant']['detected']:.2f}")
    padj = holm(np.array([c['p'] for c in cells]))
    for c, pa_ in zip(cells, padj):
        c['holm_p'] = float(pa_)
        g = {'G1_holm': pa_ < 0.05, 'G2_bar': c['est'] >= c['bar'], 'G3_halves': c['H1'] > 0 and c['H2'] > 0,
             'G4_noise': c['est'] > c['g4_q'], 'G5_vs_named': (c['vs_named']['lo'] > 0) if 'vs_named' in c else True,
             'G6_powered': c['plant']['detected'] >= 0.8}
        c['gates'] = {k: bool(v) for k, v in g.items()}
        c['word'] = cell_word(c, c['bar'])
    results['cells'] = cells
    fw = {}
    for fam in FAMILIES:
        fw[fam] = family_word([c['word'] for c in cells if c['family'] == fam])
    results['family_verdicts'] = {f'{SLUG}-{k}': v for k, v in fw.items()}
    log('family verdicts:', results['family_verdicts'])

    # ── benchmarks and descriptive ──
    bench = {}
    for nm in ('named', 'conflict-named', 'hmm_smooth', 'conflict-hmm-smooth'):
        side, kept = SM[nm]
        for h in HORIZONS:
            Y, B0, EX, M = mats[h]
            n1 = sums(side, EX)
            if kept is None:
                e = stat_from(*n1); bs = stat_from(*n1, idx=idx_boot[:500])
            else:
                k1 = sums(side, EX, kept)
                e = stat_from(*n1, *k1); bs = stat_from(*n1, *k1, idx_boot[:500])
            bench[f'{nm}|h{h}'] = {'est': float(e), 'lo': float(np.percentile(bs, 2.5)), 'hi': float(np.percentile(bs, 97.5))}
    # mirror: pullback continues (LTF side) = -E(pullback); alignment against the trend = -E
    results['bench'] = bench
    # by group / instrument / year (descriptive, BH over instrument cells)
    dis = []
    grp_arr = np.array([GROUP_OF[i] for i in INST])
    for fam in FAMILIES:
        side, kept = SM[fam]
        for h in HORIZONS:
            Y, B0, EX, M = mats[h]
            for gname in ('fx', 'gold', 'idx'):
                cm = np.zeros((G.T, G.N), bool); cm[:, grp_arr == gname] = True
                n1 = sums(side, EX, cm)
                if kept is None:
                    e = stat_from(*n1); bs = stat_from(*n1, idx=idx_boot[:500])
                else:
                    k1 = sums(side, EX, cm & kept); e = stat_from(*n1, *k1); bs = stat_from(*n1, *k1, idx_boot[:500])
                msk = cm & (side != 0) & np.isfinite(Y) & (kept if kept is not None else True)
                hit = float(((side * (Y - 0.5)) > 0)[msk].mean()) if msk.any() else None
                b0h = float(np.where(side > 0, B0, 1 - B0)[msk].mean()) if msk.any() else None
                dis.append({'family': fam, 'h': h, 'slice': 'group', 'key': gname, 'est': float(e), 'lo': float(np.percentile(bs, 2.5)),
                            'hi': float(np.percentile(bs, 97.5)), 'n': int(msk.sum()), 'hit': hit, 'b0_hit': b0h})
            for j, inst in enumerate(INST):
                cm = np.zeros((G.T, G.N), bool); cm[:, j] = True
                n1 = sums(side, EX, cm)
                if kept is None:
                    e = stat_from(*n1); bs = stat_from(*n1, idx=idx_boot[:500])
                else:
                    k1 = sums(side, EX, cm & kept); e = stat_from(*n1, *k1); bs = stat_from(*n1, *k1, idx_boot[:500])
                sd = float(np.std(bs, ddof=1))
                p = 2 * (1 - ND.cdf(abs(e / sd))) if sd > 0 else 1.0
                dis.append({'family': fam, 'h': h, 'slice': 'inst', 'key': inst, 'est': float(e), 'lo': float(np.percentile(bs, 2.5)),
                            'hi': float(np.percentile(bs, 97.5)), 'p': float(p)})
            for yr in TEST_YEARS:
                ym = np.asarray(G.dates.year == yr)
                n1 = sums(side[ym], EX[ym])
                e = stat_from(*n1) if kept is None else stat_from(*n1, *sums(side[ym], EX[ym], kept[ym]))
                dis.append({'family': fam, 'h': h, 'slice': 'year', 'key': str(yr), 'est': float(e)})
    ip = [d for d in dis if d['slice'] == 'inst']
    passed = bh([d['p'] for d in ip])
    for d, ps in zip(ip, passed):
        d['bh_pass'] = bool(ps and d['est'] > 0)
    results['descriptive']['slices'] = dis
    results['descriptive']['bh_instrument_passes'] = int(sum(d['bh_pass'] for d in ip))
    results['descriptive']['bh_instrument_tests'] = len(ip)
    # flip rates per state type and timeframe (sessions)
    flips = {}
    Pt = P[P.date >= TEST_START].sort_values(['inst', 'date'])
    for pre in ('T', 'S', 'H', 'N'):
        for tf in TFS:
            v = Pt[f'{pre}_{tf}']
            prev = Pt.groupby('inst')[f'{pre}_{tf}'].shift(1)
            ok = v.notna() & prev.notna()
            flips[f'{pre}_{tf}'] = float((v[ok] != prev[ok]).mean())
    results['descriptive']['flip_rate_per_session'] = flips
    mk = pd.DataFrame(meta)
    if len(mk):
        results['descriptive']['hmm_K_share3'] = {tf: float((mk[mk.tf == tf].K == 3).mean()) for tf in TFS}
        results['descriptive']['hmm_median_dwell_bars'] = {tf: float(np.median(np.concatenate([np.asarray(d) for d in mk[mk.tf == tf].dwell]))) for tf in TFS}
        results['descriptive']['hmm_fits'] = int(len(mk))
    # bias-learner benchmark (banked numbers, descriptive)
    try:
        bl = json.load(open(os.path.join(ROOT, 'analysis/output/bias-learner/results.json')))
        results['bench']['bias_learner_source'] = 'analysis/output/bias-learner/results.json'
        results['bench']['bias_learner_cells'] = [{k: c.get(k) for k in ('name', 'cell', 'h', 'group', 'top20_acc', 'acc_top20', 'bss', 'BSS_B0') if k in c}
                                                   for c in bl.get('cells', [])][:12]
    except Exception as e:
        results['bench']['bias_learner_error'] = str(e)
    json.dump(results, open(os.path.join(OUT, 'results.json'), 'w'), indent=1, default=float)
    log('wrote results.json')

    # ── evidence packs (one per family, h = 1) ──
    sys.path.insert(0, os.path.join(ROOT, 'scripts', 'evidence_pack'))
    from pack import build_pack
    Y, B0, EX, M = mats[1]
    dgrid = np.repeat(np.asarray(G.dates)[:, None], G.N, 1)
    igrid = np.repeat(np.array(INST)[None, :], G.T, 0)
    blk = np.repeat((np.arange(G.T) // BLOCK)[:, None], G.N, 1)
    packs = {}
    for fam in FAMILIES:
        side, kept = SM[fam]
        word = fw[fam]
        if kept is None:
            msk = (side != 0) & np.isfinite(EX)
            rows = pd.DataFrame({'date': dgrid[msk], 'inst': igrid[msk], 'signal': side[msk], 'side': side[msk].astype(int),
                                 'outcome': EX[msk], 'y': Y[msk], 'cluster': blk[msk]})
            if fam == 'hmm':
                rows['side_leak'] = SM['hmm_smooth'][0][msk]
            est_fn = lambda r: float((r['side'] * r['outcome'])[r['side'] != 0].mean())
            plant_fn = lambda r, e, g: r.assign(outcome=r['outcome'] + e * r['side'])
            if fam == 'hmm':
                leak_fn = lambda r, g: r.assign(side=r['side_leak'].astype(int))
                leak_note = 'leak_fn = smoothed-HMM alignment side (forward-backward over the test year)'
            else:
                leak_fn = lambda r, g: r.assign(side=np.where(r['y'] > 0.5, 1, -1))
                leak_note = "leak_fn = tomorrow's (the 24h outcome's) sign"
            st = True
        else:
            msk = (side != 0) & np.isfinite(EX)
            kp = kept[msk].astype(int)
            rows = pd.DataFrame({'date': dgrid[msk], 'inst': igrid[msk], 'signal': kp, 'side': side[msk].astype(int),
                                 'outcome': EX[msk], 'y': Y[msk], 'cluster': blk[msk]})
            krate = float(kp.mean())
            if fam == 'conflict-hmm':
                rows['side_leak'] = SM['conflict-hmm-smooth'][0][msk]
                rows['sig_leak'] = SM['conflict-hmm-smooth'][1][msk].astype(int)
                leak_fn = lambda r, g: r.assign(side=r['side_leak'].astype(int), signal=r['sig_leak'])
                leak_note = 'leak_fn = smoothed-HMM D1 side and smoothed alignment as the kept flag'
            else:
                leak_fn = lambda r, g: r.assign(side=np.where((r['signal'] == 1), np.where(r['y'] > 0.5, 1, -1), r['side']))
                leak_note = "leak_fn = tomorrow's sign on the kept rows"

            def est_fn(r):
                a = r[r['side'] != 0]
                v = a['side'] * a['outcome']
                k = a['signal'] == 1
                if k.sum() == 0:
                    return float('nan')
                return float(v[k].mean() - v.mean())
            plant_fn = (lambda kr: (lambda r, e, g: r.assign(outcome=r['outcome'] + (e / max(1e-9, 1 - kr)) * r['side'] * (r['signal'] == 1))))(krate)
            st = True
        log(f'evidence pack {fam}: {len(rows)} rows')
        notes = (f'Family {fam}, horizon 24h (07:00 London to the next session 07:00). Outcome = y - B0 (point-in-time base '
                 f'rate), so the estimate is the hit-rate excess over B0 ({"kept minus all base-call days" if kept is not None else "called days"}). '
                 f'Cluster = 21-session date block. {leak_note}. The pack placebo shuffles rows within instrument '
                 f'(row-level); the registered noise test in RESULTS.md shuffles whole 21-session date blocks.')
        pk = build_pack(rows, slug=f'{SLUG}-{fam}', out=os.path.join(OUT, fam), estimate_fn=est_fn,
                        bar=BAR_D if kept is not None else BAR_E, unit='hit-rate excess over B0', plant_fn=plant_fn,
                        leak_fn=leak_fn, verdict_word=word, seed=SEED, B=1000, n_placebo=300, n_plants=40,
                        signal_is_state=st, notes=notes)
        packs[fam] = {'label': pk['diagnosis']['label'], 'checks': pk['diagnosis']['checks'],
                      'positive_control': pk['positive_control'], 'lookahead_canary': pk.get('lookahead_canary'),
                      'estimate': pk['estimate'], 'ci': pk['ci'], 'placebo': pk['placebo']}
        log(f'  -> {pk["diagnosis"]["label"]}')
    results['evidence_packs'] = packs
    json.dump(results, open(os.path.join(OUT, 'results.json'), 'w'), indent=1, default=float)
    log('done')


if __name__ == '__main__':
    main()
