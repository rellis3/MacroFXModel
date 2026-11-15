#!/usr/bin/env python3
"""slow-bias-clock runner -- forge/SLOW_BIAS_CLOCK_PREREG.md (seed 20261115).

    python -X utf8 -I scripts/slow-bias-clock/run.py --selftest   # synthetic positive/null controls only (prereg 3.6)
    python -X utf8 -I scripts/slow-bias-clock/run.py              # selftest, then the registered run

Local files only (features/px_d1_*, features/rate3m_*, data/m1_bidask/*); never R2 (R2_* env is cleared at start).
Nothing dated after 2026-08-21 is read (asserted). Writes analysis/output/slow-bias-clock/{RESULTS.md, results.json,
selftest.json, evidence/<cell>/...}.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from statistics import NormalDist
from zoneinfo import ZoneInfo

for k in list(os.environ):
    if k.startswith('R2_'):
        del os.environ[k]
os.environ.setdefault('OMP_NUM_THREADS', '2')
os.environ.setdefault('MKL_NUM_THREADS', '2')

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts' / 'evidence_pack'))
from pack import build_pack, _markdown  # noqa: E402

SLUG = 'slow-bias-clock'
PREREG = 'forge/SLOW_BIAS_CLOCK_PREREG.md'
SEED = 20261115
LOCKBOX = pd.Timestamp('2026-08-21')
M1_CUTOFF_UTC = pd.Timestamp('2026-08-21 21:00:00')
FIT_END = pd.Timestamp('2016-01-01')          # fit labels end before this
TEST_START = pd.Timestamp('2016-01-04')
BOOK_START = pd.Timestamp('2005-01-03')
R_START = date(2016, 11, 21)
LON, NY = ZoneInfo('Europe/London'), ZoneInfo('America/New_York')
ND = NormalDist()
B_BOOT, BLOCK = 2000, 21
Z_MDE = 3.61
U_DIR = 0.0040
BAR_R = 0.05
BAR_SR = 0.30
DESIGN_MDE = {'dir+1|fx': 0.0017, 'dir+1|gold': 0.0025, 'dir+1|idx': 0.0022, 'dir+5|fx': 0.0039,
              'dir+5|gold': 0.0075, 'dir+5|idx': 0.0075, 'dR_slow_h4': 0.047, 'dR_slow_long': 0.047, 'book_sharpe': 0.79}
OUT = ROOT / 'analysis' / 'output' / SLUG

# instrument, group, daily source, bid/ask key, carry (base, quote)
INSTR = [
    ('GOLD', 'gold', 'xauusd', 'gold', None),
    ('EURUSD', 'fx', 'eurusd', 'eurusd', ('EUR', 'USD')),
    ('GBPUSD', 'fx', 'gbpusd', 'gbpusd', ('GBP', 'USD')),
    ('USDJPY', 'fx', 'usdjpy', 'usdjpy', ('USD', 'JPY')),
    ('USDCAD', 'fx', 'usdcad', 'usdcad', ('USD', 'CAD')),
    ('AUDUSD', 'fx', 'audusd', 'audusd', ('AUD', 'USD')),
    ('NZDUSD', 'fx', 'nzdusd', 'nzdusd', ('NZD', 'USD')),
    ('USDCHF', 'fx', 'usdchf', 'usdchf', ('USD', 'CHF')),
    ('EURJPY', 'fx', 'cross:eurusd*usdjpy', 'eurjpy', ('EUR', 'JPY')),
    ('GBPJPY', 'fx', 'cross:gbpusd*usdjpy', 'gbpjpy', ('GBP', 'JPY')),
    ('NAS100', 'idx', 'nas100', 'nq', None),
    ('SPX500', 'idx', 'spx500', 'spx', None),
    ('US30', 'idx', 'm1:dow', 'dow', None),
]
INST = [r[0] for r in INSTR]
GROUP = {r[0]: r[1] for r in INSTR}
GROUPS = ['fx', 'gold', 'idx']


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


def die(msg):
    print('ABORT:', msg, file=sys.stderr)
    sys.exit(2)


# ───────────────────────────── rates (copied from scripts/bias-learner/run.py, prereg 3.1) ─────────────────────────────

def first_print(rows):
    d = rows.copy()
    d['date'] = pd.to_datetime(d['date'])
    d['asof'] = pd.to_datetime(d['asof'], utc=True).dt.tz_localize(None)
    return d.sort_values(['date', 'asof']).drop_duplicates('date', keep='first')


def eff_asof(d):
    bulk = d['asof'].dt.strftime('%Y-%m-%d').eq('2013-06-03')
    me = d['date'] + pd.offsets.MonthEnd(0)
    return pd.Series(np.where(bulk, me + pd.Timedelta(days=45), d['asof']), index=d.index)


def known_monthly(d, sessions):
    d = d.assign(eff=eff_asof(d)).sort_values('eff')
    eff = d['eff'].to_numpy().astype('datetime64[ns]')
    dt_ = d['date'].to_numpy().astype('datetime64[ns]')
    val = d['value'].astype(float).to_numpy()
    out = np.full(len(sessions), np.nan)
    j, best_d, best_v = 0, None, np.nan
    for k, t in enumerate(sessions):
        lim = np.datetime64(t + pd.Timedelta(hours=6), 'ns')
        while j < len(d) and eff[j] <= lim:
            if best_d is None or dt_[j] >= best_d:
                best_d, best_v = dt_[j], val[j]
            j += 1
        out[k] = best_v
    return out


def known_daily(d, sessions):
    d = d.copy()
    d['asof'] = pd.to_datetime(d['asof'], utc=True).dt.tz_localize(None).astype('datetime64[ns]')
    d['value'] = pd.to_numeric(d['value'], errors='coerce')
    d = d.dropna(subset=['value']).sort_values('asof')
    q = pd.DataFrame({'t': (pd.DatetimeIndex(sessions) + pd.Timedelta(hours=6)).astype('datetime64[ns]')})
    m = pd.merge_asof(q, d[['asof', 'value']], left_on='t', right_on='asof')
    return m['value'].to_numpy()


def load_rates(sessions):
    fs = ROOT / 'features'
    S = pd.DatetimeIndex(sessions)
    R = {}
    for c in ['EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF']:
        R[c] = known_monthly(first_print(pd.read_parquet(fs / f'rate3m_{c.lower()}.parquet')), S)
    usd3 = known_monthly(first_print(pd.read_parquet(fs / 'rate3m_usd.parquet')), S)
    effr = known_daily(pd.read_parquet(fs / 'effr.parquet'), S)
    R['USD'] = np.where(S < pd.Timestamp('2013-06-04'), usd3, effr)
    ez = first_print(pd.read_parquet(fs / 'rate3m_eur.parquet'))
    de = first_print(pd.read_parquet(fs / 'rate_on_de.parquet'))
    both = ez.merge(de, on='date', suffixes=('_ez', '_de')).sort_values('date').tail(12)
    offset = float((both['value_ez'].astype(float) - both['value_de'].astype(float)).mean()) if len(both) else 0.0
    R['EUR'] = np.where(S <= pd.Timestamp('2026-02-16'), R['EUR'], known_monthly(de, S) + offset)
    return {k: pd.Series(v, index=S) for k, v in R.items()}


# ───────────────────────────── daily bars ─────────────────────────────

def px_daily(key):
    d = pd.read_parquet(ROOT / 'features' / f'px_d1_{key}.parquet')
    s = pd.Series(d['value'].astype(float).to_numpy(), index=pd.to_datetime(d['date']).dt.normalize())
    s = s[~s.index.duplicated(keep='last')].sort_index()
    s = s[(s.index.dayofweek < 5) & (s.index <= LOCKBOX)]
    return s[s > 0]


def read_bidask(key, cols=('time', 'open', 'high', 'low', 'close', 'bid_o', 'bid_h', 'bid_l', 'bid_c', 'ask_o', 'ask_h', 'ask_l', 'ask_c')):
    p = ROOT / 'data' / 'm1_bidask' / f'{key}_m1.parquet'
    if not p.exists():
        die(f'missing {p}')
    df = pd.read_parquet(p, columns=list(cols))
    t = pd.to_datetime(df['time'])
    if getattr(t.dt, 'tz', None) is not None:
        t = t.dt.tz_convert('UTC').dt.tz_localize(None)
    df = df.assign(time=t)
    df = df[df['time'] < M1_CUTOFF_UTC].sort_values('time').drop_duplicates('time').dropna()
    assert df['time'].max() < M1_CUTOFF_UTC, 'LOCKBOX BREACH (M1)'
    assert df['time'].min().year >= 2000, '1970 timestamps (BAM trap)'
    return df.reset_index(drop=True)


def ny_close_from_m1(df, nmin=60):
    t = pd.DatetimeIndex(df['time']).tz_localize('UTC').tz_convert(NY)
    lab = (t + pd.Timedelta(hours=7)).tz_localize(None).normalize()
    g = df.groupby(lab.to_numpy())
    c = g['close'].last()
    n = g.size()
    c = c[(n >= nmin).to_numpy()]
    c.index = pd.DatetimeIndex(c.index)
    c = c[(c.index.dayofweek < 5) & (c.index <= LOCKBOX)]
    return c


def load_daily_all(m1_cache):
    out = {}
    for inst, grp, src, bakey, carry in INSTR:
        if src.startswith('cross:'):
            a, b = src[6:].split('*')
            sa, sb = px_daily(a), px_daily(b)
            j = pd.concat([sa, sb], axis=1, join='inner')
            out[inst] = (j.iloc[:, 0] * j.iloc[:, 1]).rename(inst)
        elif src.startswith('m1:'):
            out[inst] = ny_close_from_m1(m1_cache(bakey)).rename(inst)
        else:
            out[inst] = px_daily(src).rename(inst)
        assert out[inst].index.max() <= LOCKBOX, f'LOCKBOX BREACH (daily {inst})'
    return out


# ───────────────────────────── the signal (prereg 3.1) ─────────────────────────────

def signal_frame(close: pd.Series, carry_diff: pd.Series | None, is_fx: bool) -> pd.DataFrame:
    c = close.astype(float)
    lc = np.log(c)
    r = lc.diff()
    sig60 = r.rolling(60, min_periods=60).std()
    sig20 = r.rolling(20, min_periods=20).std()
    f = pd.DataFrame({'C': c, 'r': r, 'sig60': sig60, 'sig20': sig20})
    for k in (21, 63, 252):
        f[f'T{k}'] = (lc - lc.shift(k)) / (sig60 * math.sqrt(k))
    f['trend'] = (f['T21'] + f['T63'] + f['T252']) / 3
    if is_fx and carry_diff is not None:
        f['carry'] = (carry_diff.reindex(f.index) / 100.0) / (sig60 * math.sqrt(252))
        f['S'] = (f['trend'] + 2.0 * f['carry']).clip(-3, 3)
    else:
        f['carry'] = np.nan
        f['S'] = f['trend'].clip(-3, 3)
    f['side'] = np.sign(f['S']).fillna(0)
    a, b = np.sign(f['T21']), np.sign(f['T252'])
    f['w'] = np.where((a * b) < 0, 0.5, 1.0)
    return f


def build_panel(daily: dict, rates: dict | None):
    frames = {}
    for inst, grp, src, bakey, carry in INSTR:
        c = daily[inst]
        cd = None
        if carry is not None and rates is not None:
            cd = (rates[carry[0]].reindex(c.index) - rates[carry[1]].reindex(c.index))
        frames[inst] = signal_frame(c, cd, grp == 'fx')
    return frames


# ───────────────────────────── bootstrap helpers ─────────────────────────────

def block_counts(T, rng, B=B_BOOT, block=BLOCK):
    nb = int(math.ceil(T / block))
    out = np.empty((B, T), np.int32)
    for b in range(B):
        st = rng.integers(0, T, nb)
        idx = (st[:, None] + np.arange(block)[None, :]).ravel()[:T] % T
        out[b] = np.bincount(idx, minlength=T)
    return out


def holm(p, alpha=0.05):
    p = np.asarray(p, float)
    o = np.argsort(p)
    m = len(p)
    adj = np.empty(m)
    run = 0.0
    for k, i in enumerate(o):
        run = max(run, min(1.0, (m - k) * p[i]))
        adj[i] = run
    return adj


def bh(p, q=0.10):
    p = np.asarray(p, float)
    m = len(p)
    o = np.argsort(p)
    thr = q * (np.arange(1, m + 1)) / m
    ok = p[o] <= thr
    k = np.max(np.nonzero(ok)[0]) + 1 if ok.any() else 0
    res = np.zeros(m, bool)
    res[o[:k]] = True
    return res


def pz(est, se):
    if not (se and np.isfinite(se) and se > 0):
        return 1.0
    return 2 * (1 - ND.cdf(abs(est / se)))


# ───────────────────────────── (i) direction ─────────────────────────────

def logit(p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


def sigmoid(z):
    return 1 / (1 + np.exp(-z))


def fit_ab(S, y, off, iters=50):
    """unpenalised logistic logit P = off + a + b S by Newton (IRLS)."""
    X = np.c_[np.ones_like(S), S]
    beta = np.zeros(2)
    for _ in range(iters):
        p = sigmoid(off + X @ beta)
        W = p * (1 - p)
        g = X.T @ (y - p)
        H = (X * W[:, None]).T @ X + 1e-9 * np.eye(2)
        step = np.linalg.solve(H, g)
        beta += step
        if np.abs(step).max() < 1e-10:
            break
    return float(beta[0]), float(beta[1])


def direction_rows(frames, h, sig_col='S'):
    """One row per (instrument, t) with S, y_h, B0, label end, horizon return in sigma units."""
    rows = []
    for inst in INST:
        f = frames[inst]
        C = f['C'].to_numpy()
        n = len(C)
        y = np.full(n, np.nan)
        endd = np.full(n, np.datetime64('NaT'), dtype='datetime64[ns]')
        mv = np.full(n, np.nan)
        idx = f.index.to_numpy()
        if n > h:
            fut = C[h:]
            y[:-h] = np.where(fut > C[:-h], 1.0, np.where(fut < C[:-h], 0.0, np.nan))
            endd[:-h] = idx[h:]
            mv[:-h] = np.log(fut / C[:-h])
        # B0: labels with end <= t, i.e. start position <= k - h
        yy = np.nan_to_num(y, nan=0.0)
        ok = np.isfinite(y).astype(float)
        cs, cn = np.cumsum(yy), np.cumsum(ok)
        b0 = np.full(n, 0.5)
        k = np.arange(n) - h
        good = k >= 0
        b0[good] = (cs[k[good]] + 10) / (cn[k[good]] + 20)
        d = pd.DataFrame({'date': f.index, 'inst': inst, 'grp': GROUP[inst], 'S': f[sig_col].to_numpy(), 'y': y,
                          'end': endd, 'b0': b0, 'mv': mv / (f['sig60'].to_numpy() * math.sqrt(h))})
        rows.append(d)
    D = pd.concat(rows, ignore_index=True)
    D = D[np.isfinite(D['S']) & np.isfinite(D['y']) & D['end'].notna()]
    D = D[D['end'] <= LOCKBOX]
    assert (pd.to_datetime(D['end']) <= LOCKBOX).all(), 'LOCKBOX BREACH (label end)'
    return D.reset_index(drop=True)


def score_direction(D, grp, rng, B=B_BOOT, groups_key='grp'):
    g = D[D[groups_key] == grp] if grp != 'all' else D
    fit = g[g['end'] < FIT_END]
    test = g[(g['date'] >= TEST_START)].copy()
    if len(fit) < 200 or len(test) < 200:
        return None
    a, b = fit_ab(fit['S'].to_numpy(float), fit['y'].to_numpy(float), logit(fit['b0'].to_numpy(float)))
    test['p'] = sigmoid(logit(test['b0'].to_numpy(float)) + a + b * test['S'].to_numpy(float))
    test['e1'] = (test['p'] - test['y']) ** 2
    test['e0'] = (test['b0'] - test['y']) ** 2
    per = test.groupby('date')[['e1', 'e0']].sum()
    A = per.to_numpy()
    est = 1 - A[:, 0].sum() / A[:, 1].sum()
    cnt = block_counts(len(A), rng, B)
    num, den = cnt @ A[:, 0], cnt @ A[:, 1]
    bs = 1 - num / den
    mid = len(A) // 2
    halves = [float(1 - A[:mid, 0].sum() / A[:mid, 1].sum()), float(1 - A[mid:, 0].sum() / A[mid:, 1].sum())]
    return {'a': a, 'b': b, 'n_rows': int(len(test)), 'n_dates': int(len(A)), 'n_fit': int(len(fit)), 'est': float(est),
            'lo': float(np.percentile(bs, 2.5)), 'hi': float(np.percentile(bs, 97.5)), 'se': float(bs.std(ddof=1)),
            'halves': halves, 'test': test}


# ───────────────────────────── (iii) book ─────────────────────────────

def financing(inst, rates, idx):
    grp = GROUP[inst]
    carry = dict((r[0], r[4]) for r in INSTR)[inst]
    usd = rates['USD'].reindex(idx)
    if grp == 'fx':
        return (rates[carry[0]].reindex(idx) - rates[carry[1]].reindex(idx)) / 100 / 252
    if grp == 'gold':
        return -usd / 100 / 252
    return (2.0 - usd) / 100 / 252


def book_rows(frames, rates, hs_year, side_fn=None, w_fn=None, fin=True, cost_mult=1.0):
    """Long table: one row per (instrument, t) with position over t -> t+1, its return and cost."""
    rows = []
    for inst in INST:
        f = frames[inst]
        side = f['side'] if side_fn is None else side_fn(f)
        w = f['w'] if w_fn is None else w_fn(f)
        scale = (0.10 / math.sqrt(252)) / f['sig60']
        pos = (side * w * scale).where(np.isfinite(f['S']), np.nan)
        nxt = f['r'].shift(-1)
        fr = financing(inst, rates, f.index) if (fin and rates is not None) else pd.Series(0.0, index=f.index)
        ret = nxt + fr.fillna(0.0).to_numpy()
        yrs = f.index.year
        hs = np.array([hs_year.get(inst, {}).get(int(yy), hs_year.get(inst, {}).get('first', np.nan)) for yy in yrs]) * cost_mult
        dpos = pos.fillna(0).diff().abs()
        d = pd.DataFrame({'date': f.index, 'inst': inst, 'S': f['S'].to_numpy(), 'side': side.to_numpy(), 'w': np.asarray(w, float),
                          'scale': scale.to_numpy(), 'pos': pos.to_numpy(), 'ret': ret.to_numpy(), 'cost': (dpos * hs).to_numpy(),
                          'end': pd.Series(f.index).shift(-1).to_numpy()})
        rows.append(d)
    R = pd.concat(rows, ignore_index=True)
    R = R[np.isfinite(R['pos']) & np.isfinite(R['ret']) & R['end'].notna()]
    R = R[pd.to_datetime(R['end']) <= LOCKBOX]
    return R.reset_index(drop=True)


def book_series(R, start=BOOK_START, min_live=8):
    g = R.groupby('date')
    pnl = g.apply(lambda x: float((x['pos'] * x['ret']).mean() - x['cost'].mean()), include_groups=False)
    live = g.size()
    pnl = pnl[(live >= min_live) & (pnl.index >= start)]
    return pnl


def sharpe(x):
    x = np.asarray(x, float)
    return float(x.mean() / x.std(ddof=1) * math.sqrt(252)) if len(x) > 2 and x.std() > 0 else float('nan')


def score_book(pnl, rng, B=B_BOOT):
    x = pnl.to_numpy(float)
    cnt = block_counts(len(x), rng, B)
    n = cnt.sum(1)
    m = (cnt @ x) / n
    v = (cnt @ (x ** 2) - n * m ** 2) / (n - 1)
    bs = m / np.sqrt(v) * math.sqrt(252)
    yrs = pnl.index.year
    halves = [sharpe(x[yrs <= 2015]), sharpe(x[yrs >= 2016])]
    return {'est': sharpe(x), 'lo': float(np.percentile(bs, 2.5)), 'hi': float(np.percentile(bs, 97.5)),
            'se': float(bs.std(ddof=1)), 'n_days': int(len(x)), 'years': float(len(x) / 252), 'halves': halves,
            'ann_ret': float(x.mean() * 252), 'ann_vol': float(x.std(ddof=1) * math.sqrt(252)),
            'max_dd': float((np.cumsum(x) - np.maximum.accumulate(np.cumsum(x))).min())}


# ───────────────────────────── (ii) daily R on M1 ─────────────────────────────

def _ema(xs, n=20):
    k, e = 2 / (n + 1), None
    for x in xs:
        e = x if e is None else e + k * (x - e)
    return e


class M1Inst:
    """H1 mid closes for the 4h slope (scripts/exit-on-fixed-entries/run.py Inst.slope) + bid/ask arrays."""

    def __init__(self, df):
        t = df['time'].to_numpy().astype('datetime64[s]').astype(np.int64)
        self.t = t
        hr = t // 3600
        last = np.r_[np.nonzero(np.diff(hr))[0], len(t) - 1]
        self.h1_t = hr[last] * 3600
        self.h1_c = df['close'].to_numpy(float)[last]
        self.h1_end = self.h1_t + 3600
        self.mo = df['open'].to_numpy(float)
        self.bo, self.bl = df['bid_o'].to_numpy(float), df['bid_l'].to_numpy(float)
        self.ao, self.ah = df['ask_o'].to_numpy(float), df['ask_h'].to_numpy(float)

    def idx(self, T):
        return int(np.searchsorted(self.t, T, 'left'))

    def slope(self, T):
        i = int(np.searchsorted(self.h1_end, T, 'right'))
        if i < 400:
            return 0
        bt = self.h1_t[i - 320:i] // 14400
        bc = self.h1_c[i - 320:i]
        lastb = np.r_[np.nonzero(np.diff(bt))[0], len(bt) - 1]
        out = bc[lastb]
        dlt = _ema(out) - _ema(out[:-3])
        return 0 if dlt == 0 else (1 if dlt > 0 else -1)


def trade_R(ro, rl, x21):
    """E0 of exit-on-fixed-entries: R relative to the entry bar (index 0); ro/rl = exit-side open / adverse in R.
    Stop at -1R on any bar < x21 (gap through fills at that bar's open), else exit at the open of bar x21."""
    hit = np.flatnonzero(rl[:x21] <= -1.0)
    if len(hit):
        b = hit[0]
        return min(-1.0, ro[b])
    return ro[x21]


def lon_epoch(d, hh):
    return int(datetime(d.year, d.month, d.day, hh, tzinfo=LON).timestamp())


def r_entries(inst, M, daily_frame):
    """Every weekday London date: R_L, R_S (bid/ask, spread inside), the 4h side, the slow side/size from the last
    NY close completed before 07:00 London, sigma20 from the same close."""
    f = daily_frame
    didx = f.index
    recs = []
    first = max(R_START, datetime.fromtimestamp(int(M.t[0]), LON).date())
    last = min(LOCKBOX.date(), datetime.fromtimestamp(int(M.t[-1]), LON).date())
    d = first
    cnt = {'days': 0, 'no_0700': 0, 'no_21': 0, 'no_daily': 0, 'entries': 0}
    while d <= last:
        if d.weekday() < 5:
            cnt['days'] += 1
            T7, T21 = lon_epoch(d, 7), lon_epoch(d, 21)
            e = M.idx(T7)
            x = M.idx(T21)
            if e >= len(M.t) or M.t[e] >= lon_epoch(d, 8):
                cnt['no_0700'] += 1
            elif x >= len(M.t) or M.t[x] - T21 > 3600 or x <= e:
                cnt['no_21'] += 1
            else:
                k = int(np.searchsorted(didx.values, np.datetime64(pd.Timestamp(d)), 'left')) - 1   # last NY close < D
                if k < 0 or not np.isfinite(f['sig20'].iat[k]) or f['sig20'].iat[k] <= 0:
                    cnt['no_daily'] += 1
                else:
                    sig = float(f['sig20'].iat[k])
                    Rp = sig * M.mo[e]
                    sl = slice(e, x + 1)
                    EL, ES = M.ao[e], M.bo[e]
                    RL = trade_R((M.bo[sl] - EL) / Rp, (M.bl[sl] - EL) / Rp, x - e)
                    RS = trade_R((ES - M.ao[sl]) / Rp, (ES - M.ah[sl]) / Rp, x - e)
                    recs.append({'date': pd.Timestamp(d), 'inst': inst, 'RL': RL, 'RS': RS, 'h4': M.slope(T7),
                                 'S': f['S'].iat[k], 'side': f['side'].iat[k], 'w': f['w'].iat[k],
                                 'T21': f['T21'].iat[k], 'T63': f['T63'].iat[k], 'T252': f['T252'].iat[k],
                                 'trend': f['trend'].iat[k], 'carry': f['carry'].iat[k], 'close_date': didx[k]})
                    cnt['entries'] += 1
        d += timedelta(1)
    return pd.DataFrame(recs), cnt


def rbar(side, w, RL, RS):
    R = np.where(side > 0, RL, RS)
    return (w * R).sum() / w.sum()


def score_dR(E, bench, rng, B=B_BOOT, side_col='side', w_col='w'):
    """risk-weighted mean R of SLOW minus the benchmark's mean R, date-block bootstrap."""
    s = E[side_col].to_numpy(float)
    w = E[w_col].to_numpy(float)
    Rs = np.where(s > 0, E['RL'], E['RS'])
    sb = E['h4'].to_numpy(float) if bench == 'h4' else np.ones(len(E))
    Rb = np.where(sb > 0, E['RL'], E['RS'])
    df = pd.DataFrame({'date': E['date'], 'a': w * Rs, 'b': w, 'c': Rb, 'n': 1.0})
    per = df.groupby('date')[['a', 'b', 'c', 'n']].sum()
    A = per.to_numpy()
    est = A[:, 0].sum() / A[:, 1].sum() - A[:, 2].sum() / A[:, 3].sum()
    cnt = block_counts(len(A), rng, B)
    S_ = cnt @ A
    bs = S_[:, 0] / S_[:, 1] - S_[:, 2] / S_[:, 3]
    mid = len(A) // 2
    h = [float(A[:mid, 0].sum() / A[:mid, 1].sum() - A[:mid, 2].sum() / A[:mid, 3].sum()),
         float(A[mid:, 0].sum() / A[mid:, 1].sum() - A[mid:, 2].sum() / A[mid:, 3].sum())]
    return {'est': float(est), 'lo': float(np.percentile(bs, 2.5)), 'hi': float(np.percentile(bs, 97.5)),
            'se': float(bs.std(ddof=1)), 'n_rows': int(len(E)), 'n_dates': int(len(A)), 'halves': h,
            'slow_Rbar': float(A[:, 0].sum() / A[:, 1].sum()), 'bench_Rbar': float(A[:, 2].sum() / A[:, 3].sum())}


def half_spreads(key, inst):
    df = read_bidask(key, cols=('time', 'bid_c', 'ask_c'))
    t = pd.DatetimeIndex(df['time']).tz_localize('UTC').tz_convert(LON)
    m = (t.hour >= 7) & (t.hour < 21)
    mid = (df['bid_c'] + df['ask_c']) / 2
    rel = ((df['ask_c'] - df['bid_c']) / mid / 2)[m]
    yr = t.year[m]
    out = rel.groupby(yr).median().to_dict()
    out = {int(k): float(v) for k, v in out.items()}
    out['first'] = out.get(2017, min(out.values()))
    for y in range(2000, 2017):
        out.setdefault(y, out['first'])
    return out


# ───────────────────────────── cell verdicts ─────────────────────────────

def cell_word(c, bar, holm_p):
    mde = max(DESIGN_MDE[c['name']], Z_MDE * c['se_used'])
    c['mde_binding'] = mde
    c['powered'] = bool(mde <= bar)
    sig = c['lo'] > 0 and holm_p < 0.05
    stable = all(h is not None and h > 0 for h in c['halves'])
    plc = c.get('placebo_pct') is None or c['placebo_pct'] >= 97.5
    mirror_ok = c.get('mirror_ok', True)
    c['gate'] = {'ci_lower_gt0': bool(c['lo'] > 0), 'holm_lt_0.05': bool(holm_p < 0.05), 'halves_same_sign': bool(stable),
                 'placebo_97_5': bool(plc), 'mirror_ok': bool(mirror_ok)}
    if sig and stable and plc and mirror_ok and c['est'] >= bar:
        return 'VALIDATED'
    if sig:
        return 'CONTEXT'
    if c['powered'] and c['hi'] < bar:
        return 'NULL'
    return 'UNDERPOWERED'


def id_word(words):
    if 'VALIDATED' in words:
        return 'VALIDATED'
    if 'CONTEXT' in words:
        return 'CONTEXT'
    if all(w == 'NULL' for w in words):
        return 'NULL'
    return 'UNDERPOWERED'


# ───────────────────────────── evidence packs ─────────────────────────────

def pack_direction(g, name, a_full, b_full, rng_seed, bar=U_DIR, word=None):
    """Rows = the group's fit AND test rows (is_fit flag). The estimate refits the one-slope calibration on the fit rows
    it is given, then scores BSS on the test rows, so the placebo (shuffled signal), the plant (drift in the side
    direction on all rows) and the leak (side = sign of the outcome) all go through the exact pipeline. Subsets with no
    fit rows (per-year / per-half breakdowns of test years) fall back to the registered fit (a, b)."""
    g = g[(g['end'] < FIT_END) | (g['date'] >= TEST_START)]
    rows = pd.DataFrame({'date': g['date'], 'inst': g['inst'], 'signal': g['S'], 'side': np.sign(g['S']),
                         'outcome': g['mv'], 'b0': g['b0'], 'is_fit': (g['end'] < FIT_END).to_numpy()}).reset_index(drop=True)

    def est(r):
        fit = r[r['is_fit'].to_numpy(bool)]
        te = r[~r['is_fit'].to_numpy(bool)]
        if len(te) < 30:
            return float('nan')
        if len(fit) >= 200:
            yf = (fit['outcome'].to_numpy(float) > 0).astype(float)
            a, b = fit_ab(fit['signal'].to_numpy(float), yf, logit(fit['b0'].to_numpy(float)), iters=25)
        else:
            a, b = a_full, b_full
        bb = te['b0'].to_numpy(float)
        p = sigmoid(logit(bb) + a + b * te['signal'].to_numpy(float))
        y = (te['outcome'].to_numpy(float) > 0).astype(float)
        den = ((bb - y) ** 2).sum()
        return float(1 - ((p - y) ** 2).sum() / den) if den > 0 else float('nan')

    base = est(rows)

    def plant(r, effect, gg):
        lo_, hi_ = 0.0, 1.0
        for _ in range(20):
            mid = (lo_ + hi_) / 2
            if est(r.assign(outcome=r['outcome'] + mid * r['side'])) - base < effect:
                lo_ = mid
            else:
                hi_ = mid
        return r.assign(outcome=r['outcome'] + hi_ * r['side'])

    def leak(r, gg):
        return r.assign(signal=3 * np.sign(r['outcome']), side=np.sign(r['outcome']))

    return build_pack(rows, slug=f'{SLUG}:{name}', out=str(OUT / 'evidence' / name), estimate_fn=est, bar=bar,
                      unit='Brier skill vs B0 (test rows)', plant_fn=plant, leak_fn=leak, verdict_word=word, seed=rng_seed,
                      B=200, n_placebo=100, n_plants=10,
                      notes=f'Rows: fit (label end < 2016-01-01) and test (2016-01-04 ->) rows of the group. Every estimate '
                            f'refits logit P = logit(B0) + a + b S on its fit rows (registered fit: a {a_full:+.4f}, b {b_full:+.4f}) '
                            'and scores Brier skill vs B0 on its test rows. Outcome = horizon log return in sigma60 units; y = '
                            'outcome > 0. Plant: a drift in the side direction on all rows, sized by bisection so the skill rises '
                            'by the planted amount. Per-year and per-half rows with no fit rows use the registered (a, b); the '
                            'pack halves split on the median date of fit+test rows, so read the RESULTS halves instead.')


def pack_R(E, name, bench, rng_seed, word=None):
    rows = pd.DataFrame({'date': E['date'], 'inst': E['inst'], 'signal': E['S'], 'side': E['side'], 'w': E['w'],
                         'RL': E['RL'], 'RS': E['RS'], 'sb': (E['h4'] if bench == 'h4' else 1.0)}).reset_index(drop=True)
    rows['outcome'] = np.where(rows['side'] > 0, rows['RL'], rows['RS']) - np.where(rows['sb'] > 0, rows['RL'], rows['RS'])

    def est(r):
        s, w = r['side'].to_numpy(float), r['w'].to_numpy(float)
        Rs = np.where(s > 0, r['RL'], r['RS'])
        Rb = np.where(r['sb'].to_numpy(float) > 0, r['RL'], r['RS'])
        return float((w * Rs).sum() / w.sum() - Rb.mean())

    agree = float((rows['side'] * rows['sb']).mean())

    def plant(r, effect, g):
        e = effect / max(1e-6, 1 - agree)
        return r.assign(RL=r['RL'] + e * r['side'], RS=r['RS'] - e * r['side'])

    def leak(r, g):
        sd = np.sign(r['RL'] - r['RS'])
        return r.assign(side=sd, signal=sd)

    return build_pack(rows.drop(columns=['outcome']).assign(outcome=rows['outcome']), slug=f'{SLUG}:{name}',
                      out=str(OUT / 'evidence' / name), estimate_fn=est, bar=BAR_R, unit='R per entry (risk-weighted)',
                      plant_fn=plant, leak_fn=leak, verdict_word=word, seed=rng_seed, B=300, n_placebo=200, n_plants=10,
                      notes=f'Benchmark: {"4h EMA20 slope side" if bench == "h4" else "always long"}. Plant: the market drifts '
                            f'by e R in the slow side direction on every entry, e = effect/(1 - agreement {agree:+.3f}), so the '
                            'difference rises by the planted amount. Leak: the side is the sign of the same session move.')


def pack_book(R, name, rng_seed, word=None):
    rows = R[['date', 'inst', 'S', 'side', 'w', 'scale', 'ret', 'cost']].rename(columns={'S': 'signal'}).reset_index(drop=True)
    rows['outcome'] = rows['side'] * rows['ret'] / (rows['ret'].abs().mean())
    rows['cluster'] = pd.to_datetime(rows['date']).dt.strftime('%Y-%m')

    def est(r):
        x = (r['side'] * r['w'] * r['scale'] * r['ret']).to_numpy(float)
        df = pd.DataFrame({'d': r['date'].to_numpy(), 'x': x, 'c': r['cost'].to_numpy(float)})
        g = df.groupby('d')
        pnl = g['x'].mean() - g['c'].mean()
        return sharpe(pnl.to_numpy())

    x0 = (rows['side'] * rows['w'] * rows['scale'] * rows['ret'])
    sd_day = pd.DataFrame({'d': rows['date'], 'x': x0}).groupby('d')['x'].mean().std()
    ms = float((rows['w'] * rows['scale']).mean())

    def plant(r, effect, g):
        e = effect * sd_day / math.sqrt(252) / ms
        return r.assign(ret=r['ret'] + e * r['side'])

    def leak(r, g):
        sd = np.sign(r['ret'])
        return r.assign(side=sd, signal=sd)

    return build_pack(rows, slug=f'{SLUG}:{name}', out=str(OUT / 'evidence' / name), estimate_fn=est, bar=BAR_SR,
                      unit='annualised net Sharpe', plant_fn=plant, leak_fn=leak, verdict_word=word, seed=rng_seed,
                      B=200, n_placebo=100, n_plants=10,
                      notes='Rows = (instrument, day) positions held close t to close t+1; estimate = Sharpe of the equal-'
                            'weight daily mean of side*w*scale*return minus the mean cost (costs from the real turnover, held '
                            'fixed under shuffles, so the placebo is slightly flattered). Bootstrap clusters = calendar months.')


# ───────────────────────────── selftest (prereg 3.6) ─────────────────────────────

def synth_frames(rng, planted: bool, years=21):
    n = 252 * years
    idx = pd.bdate_range('2004-01-01', periods=n)
    frames = {}
    phi = 0.5 ** (1 / 120)
    for inst in INST:
        vol = 0.01
        if planted:
            # drift AR(1): stationary sd s_mu; oracle daily Sharpe ~ s_mu/vol; s_mu = 0.075*vol -> ~1.2 annual
            s_mu = 0.075 * vol
            mu = np.zeros(n)
            eps = rng.normal(0, s_mu * math.sqrt(1 - phi ** 2), n)
            for t in range(1, n):
                mu[t] = phi * mu[t - 1] + eps[t]
        else:
            mu = np.zeros(n)
        r = mu + rng.normal(0, vol, n)
        C = pd.Series(100 * np.exp(np.cumsum(r)), index=idx)
        frames[inst] = signal_frame(C, None, False)
    return frames


def selftest(log=log):
    rng = np.random.default_rng(SEED)
    res = {}
    hs0 = {i: {'first': 0.00005} for i in INST}
    for planted in (True, False):
        fr = synth_frames(rng, planted)
        R = book_rows(fr, None, hs0, fin=False)
        pnl = book_series(R, start=pd.Timestamp('2005-06-01'))
        bk = score_book(pnl, rng, B=500)
        D = direction_rows(fr, 5)
        D['grp'] = 'all'
        # synthetic: fit 2005-2015 / test 2016+ as the real split
        dr = score_direction(D, 'all', rng, B=500)
        res['planted' if planted else 'null'] = {'book': {k: bk[k] for k in ('est', 'lo', 'hi')},
                                                 'bss5': {k: dr[k] for k in ('est', 'lo', 'hi', 'b')}}
    # (c) no lookahead: perturb prices after t, S_t unchanged
    fr = synth_frames(np.random.default_rng(1), True, years=3)
    f0 = fr['EURUSD']
    C = f0['C'].copy()
    t = 500
    C2 = C.copy()
    C2.iloc[t + 1:] *= 1.37
    f2 = signal_frame(C2, None, False)
    la_ok = bool(np.allclose(f0['S'].iloc[:t + 1].fillna(9), f2['S'].iloc[:t + 1].fillna(9)))
    # (d) R function on hand paths
    ro = np.array([-0.02, 0.3, 0.5, 0.8]); rl = np.array([-0.05, 0.1, 0.2, 0.6])
    r_exit = trade_R(ro, rl, 3)                    # no stop: exit at open of bar 3 = 0.8
    ro2 = np.array([-0.02, -0.5, -1.4, 0.0]); rl2 = np.array([-0.05, -0.9, -1.6, -0.2])
    r_gap = trade_R(ro2, rl2, 3)                   # stop on bar 2 with open -1.4 below -1 -> -1.4
    ro3 = np.array([-0.02, -0.5, -0.8, 0.0]); rl3 = np.array([-0.05, -1.2, -1.6, -0.2])
    r_stop = trade_R(ro3, rl3, 3)                  # stop on bar 1, open -0.5 above -> -1.0
    res['lookahead_ok'] = la_ok
    res['R_hand'] = [r_exit, r_gap, r_stop]
    ok = {
        'planted_book_ci_lower_gt0': res['planted']['book']['lo'] > 0,
        'planted_bss5_gt0': res['planted']['bss5']['est'] > 0,
        'null_book_ci_includes0': res['null']['book']['lo'] <= 0 <= res['null']['book']['hi'],
        'null_bss5_ci_includes0': res['null']['bss5']['lo'] <= 0 <= res['null']['bss5']['hi'] or res['null']['bss5']['est'] < 0,
        'no_lookahead': la_ok,
        'R_hand_exact': abs(r_exit - 0.8) < 1e-12 and abs(r_gap + 1.4) < 1e-12 and abs(r_stop + 1.0) < 1e-12,
    }
    res['checks'] = ok
    res['passed'] = all(ok.values())
    log('selftest', json.dumps(res, default=float))
    return res


# ───────────────────────────── the real run ─────────────────────────────

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
        return
    rng = np.random.default_rng(SEED)
    t0 = time.time()

    m1 = {}

    def m1_cache(key):
        if key not in m1:
            log('reading bid/ask M1', key)
            m1[key] = read_bidask(key)
        return m1[key]

    daily = load_daily_all(m1_cache)
    all_dates = pd.DatetimeIndex(sorted(set().union(*[set(s.index) for s in daily.values()])))
    rates = load_rates(all_dates)
    frames = build_panel(daily, rates)
    for inst in INST:
        assert frames[inst].index.max() <= LOCKBOX
    cov = {inst: [str(frames[inst].index.min().date()), str(frames[inst].index.max().date()), int(len(frames[inst])),
                  int(np.isfinite(frames[inst]['S']).sum())] for inst in INST}
    log('daily coverage', cov)
    # carry sanity: share of FX signal days with a carry value
    carry_cov = {inst: float(np.isfinite(frames[inst]['carry']).mean()) for inst in INST if GROUP[inst] == 'fx'}

    res = {'id': SLUG, 'seed': SEED, 'B': B_BOOT, 'prereg': PREREG, 'branch': 'claude/signal-bot-bias-analysis-bwr1qv',
           'ranAt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'coverage': cov, 'carry_coverage': carry_cov,
           'selftest': st, 'cells': []}
    cells = []

    # (i) direction
    dir_tests, dir_rows = {}, {}
    for h in (1, 5):
        D = direction_rows(frames, h)
        dir_rows[f'dir+{h}'] = D
        for g in GROUPS:
            sc = score_direction(D, g, rng)
            name = f'dir+{h}|{g}'
            dir_tests[name] = sc
            c = {k: v for k, v in sc.items() if k != 'test'}
            c.update({'name': name, 'bar': U_DIR, 'mirror_ok': sc['b'] > 0, 'ledger': 'slow-bias-clock-dir'})
            cells.append(c)
            log(name, {k: c[k] for k in ('est', 'lo', 'hi', 'b', 'n_dates')})

    # (ii) daily R
    E_all, rcounts, hs_year = [], {}, {}
    for inst, grp, src, bakey, carry in INSTR:
        df = m1_cache(bakey)
        M = M1Inst(df)
        E, cnt = r_entries(inst, M, frames[inst])
        rcounts[inst] = cnt
        E_all.append(E)
        hs_year[inst] = half_spreads(bakey, inst)
        m1.pop(bakey, None)
        log('R entries', inst, cnt)
    E = pd.concat(E_all, ignore_index=True)
    E['date'] = pd.to_datetime(E['date'])
    assert E['date'].max() <= LOCKBOX
    common = E[(E['side'] != 0) & (E['h4'] != 0) & np.isfinite(E['S'])].reset_index(drop=True)
    res['r_counts'] = rcounts
    res['r_common_rows'] = int(len(common))
    for bench, name in (('h4', 'dR_slow_h4'), ('long', 'dR_slow_long')):
        sc = score_dR(common, bench, rng)
        sc.update({'name': name, 'bar': BAR_R, 'ledger': 'slow-bias-clock-r'})
        mir = score_dR(common.assign(side=-common['side']), bench, rng, B=500)
        sc['mirror'] = {k: mir[k] for k in ('est', 'lo', 'hi', 'slow_Rbar')}
        sc['mirror_ok'] = not (mir['lo'] > 0)
        cells.append(sc)
        log(name, {k: sc[k] for k in ('est', 'lo', 'hi', 'slow_Rbar', 'bench_Rbar')})
    # reconciliation with exit-on-fixed-entries E0 (4h side, quote base, -0.027 net reported there)
    h4side = np.where(common['h4'] > 0, common['RL'], common['RS'])
    res['recon_h4_E0'] = {'h4_Rbar_all_common': float(h4side.mean()),
                          'h4_Rbar_all_h4_days': float(np.where(E['h4'] > 0, E['RL'], E['RS'])[E['h4'] != 0].mean()),
                          'exit_on_fixed_entries_E0_net': -0.027}
    res['half_spreads'] = {k: {str(y): v for y, v in d.items() if y in ('first', 2017, 2020, 2023, 2026)} for k, d in hs_year.items()}

    # (iii) book
    R = book_rows(frames, rates, hs_year)
    pnl = book_series(R)
    bk = score_book(pnl, rng)
    bk.update({'name': 'book_sharpe', 'bar': BAR_SR, 'ledger': 'slow-bias-clock-book'})
    Rm = book_rows(frames, rates, hs_year, side_fn=lambda f: -f['side'])
    bkm = score_book(book_series(Rm), rng, B=500)
    bk['mirror'] = {k: bkm[k] for k in ('est', 'lo', 'hi')}
    bk['mirror_ok'] = not (bkm['lo'] > 0)
    cells.append(bk)
    log('book', {k: bk[k] for k in ('est', 'lo', 'hi', 'halves', 'years')})

    # ── evidence packs (placebo percentile + SD feed the gate and the p-value) ──
    packs = {}
    if not a.skip_packs:
        for i, c in enumerate(cells):
            nm = c['name'].replace('|', '_').replace('+', 'p')
            log('evidence pack', nm)
            if c['name'].startswith('dir'):
                sc = dir_tests[c['name']]
                Dg = dir_rows[c['name'].split('|')[0]]
                pk = pack_direction(Dg[Dg['grp'] == c['name'].split('|')[1]], nm, sc['a'], sc['b'], SEED + i)
            elif c['name'] == 'dR_slow_h4':
                pk = pack_R(common, nm, 'h4', SEED + i)
            elif c['name'] == 'dR_slow_long':
                pk = pack_R(common, nm, 'long', SEED + i)
            else:
                Rb = R[R['date'] >= BOOK_START]
                Rb = Rb[Rb['date'].isin(pnl.index)]
                pk = pack_book(Rb, nm, SEED + i)
            packs[c['name']] = pk
            pl = pk['placebo']
            c['placebo_pct'] = pl['real_percentile']
            c['placebo_sd'] = (pl['p97_5'] - pl['p2_5']) / 3.92 if pl['p97_5'] is not None else None
            c['pack'] = {'diagnosis': pk['diagnosis']['label'], 'checks': pk['diagnosis']['checks'],
                         'positive_control': pk['positive_control'], 'lookahead_canary': pk.get('lookahead_canary'),
                         'placebo': pl, 'dir': f'analysis/output/{SLUG}/evidence/{nm}/evidence/'}
    for c in cells:
        c['se_used'] = max(c['se'], c.get('placebo_sd') or 0.0)
        c['p'] = pz(c['est'], c['se_used'])
    hp = holm([c['p'] for c in cells])
    for c, h in zip(cells, hp):
        c['holm_p'] = float(h)
        c['verdict'] = cell_word(c, c['bar'], h)
    res['cells'] = cells
    res['ids'] = {lid: id_word([c['verdict'] for c in cells if c['ledger'] == lid])
                  for lid in ('slow-bias-clock-dir', 'slow-bias-clock-r', 'slow-bias-clock-book')}
    for name, pk in packs.items():
        pk_path = OUT / 'evidence' / name.replace('|', '_').replace('+', 'p') / 'evidence' / 'evidence.json'
        try:
            j = json.load(open(pk_path))
            j['verdict_word'] = next(c['verdict'] for c in cells if c['name'] == name)
            json.dump(j, open(pk_path, 'w'), indent=1, default=float)
            _markdown(j, str(pk_path.parent))
        except Exception as ex:
            log('could not stamp verdict on', pk_path, ex)

    # ── descriptive: decomposition (BH q = 0.10), size cut, book variants ──
    desc = {}
    comps = {'T21': 'T21', 'T63': 'T63', 'T252': 'T252', 'trend': 'trend', 'carry': 'carry'}
    dec = []
    for cname, col in comps.items():
        Ec = common[np.isfinite(common[col]) & (common[col] != 0)].copy()
        Ec['cside'] = np.sign(Ec[col])
        Ec['w1'] = 1.0
        if len(Ec) < 500:
            continue
        s1 = score_dR(Ec, 'h4', rng, B=500, side_col='cside', w_col='w1')
        dec.append({'component': cname, 'cell': 'dR_vs_h4', 'est': s1['est'], 'lo': s1['lo'], 'hi': s1['hi'], 'p': pz(s1['est'], s1['se']),
                    'Rbar_alone': s1['slow_Rbar']})
        fr_c = {inst: frames[inst].assign(S=frames[inst][col].clip(-3, 3), side=np.sign(frames[inst][col]).fillna(0))
                for inst in INST}
        for h in (1, 5):
            Dc = direction_rows(fr_c, h)
            Dc = Dc[np.isfinite(Dc['S'])]
            Dc['grp'] = 'all'
            sc = score_direction(Dc, 'all', rng, B=500)
            if sc:
                dec.append({'component': cname, 'cell': f'bss+{h}_all', 'est': sc['est'], 'lo': sc['lo'], 'hi': sc['hi'],
                            'p': pz(sc['est'], sc['se']), 'b': sc['b']})
        Rc = book_rows(fr_c, rates, hs_year, w_fn=lambda f: pd.Series(1.0, index=f.index))
        Rc = Rc[np.isfinite(Rc['S'])]
        if cname == 'carry':
            pc = book_series(Rc, min_live=5)
        else:
            pc = book_series(Rc)
        bc = score_book(pc, rng, B=500)
        dec.append({'component': cname, 'cell': 'book_sharpe', 'est': bc['est'], 'lo': bc['lo'], 'hi': bc['hi'], 'p': pz(bc['est'], bc['se']),
                    'halves': bc['halves']})
    # size cut off
    s_nocut = score_dR(common.assign(w=1.0), 'h4', rng, B=500)
    dec.append({'component': 'S, size cut off', 'cell': 'dR_vs_h4', 'est': s_nocut['est'], 'lo': s_nocut['lo'], 'hi': s_nocut['hi'],
                'p': pz(s_nocut['est'], s_nocut['se']), 'Rbar_alone': s_nocut['slow_Rbar']})
    bnc = score_book(book_series(book_rows(frames, rates, hs_year, w_fn=lambda f: pd.Series(1.0, index=f.index))), rng, B=500)
    dec.append({'component': 'S, size cut off', 'cell': 'book_sharpe', 'est': bnc['est'], 'lo': bnc['lo'], 'hi': bnc['hi'],
                'p': pz(bnc['est'], bnc['se']), 'halves': bnc['halves']})
    flags = bh([d['p'] for d in dec])
    for d, f in zip(dec, flags):
        d['bh_q10'] = bool(f)
    desc['decomposition'] = dec
    desc['decomposition_chance'] = {'tests': len(dec), 'passes_bh': int(flags.sum())}
    # book variants
    var = {}
    Rl = book_rows(frames, rates, hs_year, side_fn=lambda f: pd.Series(1.0, index=f.index), w_fn=lambda f: pd.Series(1.0, index=f.index))
    pl = book_series(Rl)
    var['long_book'] = score_book(pl, rng, B=500)
    j = pd.concat([pnl.rename('s'), pl.rename('l')], axis=1, join='inner')
    var['slow_minus_long_sharpe'] = sharpe(j['s']) - sharpe(j['l'])
    var['corr_slow_long_daily'] = float(j.corr().iloc[0, 1])
    var['spot_only'] = score_book(book_series(book_rows(frames, rates, hs_year, fin=False)), rng, B=500)
    var['costs_x2'] = score_book(book_series(book_rows(frames, rates, hs_year, cost_mult=2.0)), rng, B=500)
    var['gross'] = score_book(book_series(book_rows(frames, rates, hs_year, cost_mult=0.0)), rng, B=500)
    var['post_2013'] = {'sharpe': sharpe(pnl[pnl.index >= '2013-01-01'])}
    var['by_year'] = {int(y): sharpe(x) for y, x in pnl.groupby(pnl.index.year)}
    var['long_by_year'] = {int(y): sharpe(x) for y, x in pl.groupby(pl.index.year)}
    stress = {'2008-09_2009-03': ('2008-09-01', '2009-03-31'), '2020-02_2020-04': ('2020-02-01', '2020-04-30'), '2022': ('2022-01-01', '2022-12-31')}
    var['stress'] = {k: {'slow_cum': float(pnl[a_:b_].sum()), 'long_cum': float(pl[a_:b_].sum())} for k, (a_, b_) in stress.items()}
    # per-instrument book Sharpe (each market alone)
    var['per_instrument'] = {}
    for inst in INST:
        x = R[R['inst'] == inst]
        x = x[x['date'] >= BOOK_START]
        s = (x['pos'] * x['ret'] - x['cost']).to_numpy()
        var['per_instrument'][inst] = sharpe(s)
    desc['book_variants'] = var
    # R per group / B0-side / per instrument
    rg = {}
    for g in GROUPS:
        x = common[common['inst'].map(GROUP) == g]
        rg[g] = {'slow_Rbar': rbar(x['side'].to_numpy(), x['w'].to_numpy(), x['RL'].to_numpy(), x['RS'].to_numpy()),
                 'h4_Rbar': float(np.where(x['h4'] > 0, x['RL'], x['RS']).mean()), 'long_Rbar': float(x['RL'].mean()), 'n': int(len(x))}
    desc['R_by_group'] = rg
    desc['R_by_instrument'] = {inst: {'slow_Rbar': rbar(x['side'].to_numpy(), x['w'].to_numpy(), x['RL'].to_numpy(), x['RS'].to_numpy()),
                                      'h4_Rbar': float(np.where(x['h4'] > 0, x['RL'], x['RS']).mean()), 'n': int(len(x))}
                               for inst, x in common.groupby('inst')}
    desc['agreement_slow_h4'] = float((common['side'] * common['h4'] > 0).mean())
    desc['size_cut_share'] = float((common['w'] < 1).mean())
    desc['long_share_slow'] = float((common['side'] > 0).mean())
    res['descriptive'] = desc
    res['runtime_s'] = round(time.time() - t0, 1)
    json.dump(res, open(OUT / 'results.json', 'w'), indent=1, default=float)
    log('done', res['ids'], res['runtime_s'], 's')


if __name__ == '__main__':
    main()
