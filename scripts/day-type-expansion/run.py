#!/usr/bin/env python3
"""day-type-expansion runner — forge/DAY_TYPE_EXPANSION_PREREG.md (seed 20261114).

    python -I scripts/day-type-expansion/run.py              # the registered run (needs local M1, see README.md)
    python -I scripts/day-type-expansion/run.py --selftest   # synthetic data only: planted-signal + null + lockbox checks

Order of the real run (prereg §3.8):
  1. load the pre-open INPUTS only (no M1) and run the positive control on synthetic labels; abort if it fails;
  2. read M1 (hard stop before 2026-08-21 21:00 London; asserted), build the 07:00-21:00 London labels;
  3. score the 9 cells (family x k), placebos P1/P2, gates G1-G5, verdict per family; descriptive arms;
  4. write analysis/output/day-type-expansion/{RESULTS.md, results.json, positive_control.json}.
Reads local files only. Never touches R2 or any loader that merges the nightly tail. Writes only under --out.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, replace
from statistics import NormalDist

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.dataset as pds
import pyarrow.parquet as pq

SEED = 20261114
SLUG = 'day-type-expansion'
PREREG = 'forge/DAY_TYPE_EXPANSION_PREREG.md'
LOCKBOX = pd.Timestamp('2026-08-21')                       # last London session that may be read
M1_CUTOFF_UTC = pd.Timestamp('2026-08-21 20:00:00')        # 21:00 London (BST) on that session; no bar at/after is read
FAM = {'fx': ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF'], 'gold': ['GOLD'], 'idx': ['NQ', 'SPX500']}
INSTS = [i for v in FAM.values() for i in v]
FAM_OF = {i: f for f, v in FAM.items() for i in v}
M1KEY = {'EURUSD': 'eurusd', 'GBPUSD': 'gbpusd', 'USDJPY': 'usdjpy', 'AUDUSD': 'audusd', 'USDCAD': 'usdcad',
         'USDCHF': 'usdchf', 'GOLD': 'gold', 'NQ': 'nq', 'SPX500': 'spx500'}
KS = [0.50, 0.75, 1.00]
B1F = ['regime', 'evmult']
FEATS = {'fx': ['ivrel', 'stress', 'tier1', 'high', 'month_end', 'prev_speed'],
         'idx': ['ivrel', 'front', 'stress', 'tier1', 'high', 'prev_speed'],
         'gold': ['stress', 'tier1', 'high', 'prev_speed']}
RAW_STRESS = ['spx5', 'spx20', 'spx60', 'vix', 'vixchg5', 'term', 'inv']
SHIFT_COLS = ['ivrel', 'front', 'tier1', 'high', 'month_end', 'prev_speed'] + RAW_STRESS   # M-only inputs (P1)
FOLDS = [('2022-09-05', '2023-09-05'), ('2023-09-05', '2024-09-05'), ('2024-09-05', '2025-09-05'), ('2025-09-05', '2026-08-22')]
H1_END = pd.Timestamp('2024-09-05')
EMBARGO = 5
L2 = 1e-3
U = 0.02                                                    # useful effect, BSS vs B1
MDE = {'fx': 0.018, 'gold': 0.054, 'idx': 0.051}            # prereg §5, Holm first step (upper end of the range)
WIN_MAIN = (420, 1260, 756)                                 # 07:00-21:00 London, >= 756 of 840 minutes
WIN_LDN = (420, 960, 486)                                   # descriptive 07:00-16:00, >= 486 of 540
ND = NormalDist()


@dataclass(frozen=True)
class Cfg:
    root: str
    m1_root: str
    index_root: str
    out: str
    B: int = 2000
    shift_step: int = 5
    n_perm: int = 500
    pc_shift_step: int = 25
    pc_perm: int = 100
    quiet: bool = False


def log(cfg, *a):
    if not cfg.quiet:
        print(*a, flush=True)


def need(path):
    if not os.path.exists(path):
        raise SystemExit(f'\nMISSING DATA FILE: {path}\n'
                         f'  day-type-expansion needs this file (see scripts/{SLUG}/README.md). Nothing was scored.\n')
    return path


# ───────────────────────────── inputs (no outcome) ─────────────────────────────

def load_lines(cfg):
    p = need(os.path.join(cfg.root, 'analysis/output/vf3_stage_b/part1_lines.parquet'))
    cols = ['inst', 'date', 'oos', 'event', 'regime', 'pit_sig_daily', 'pit_sig_used', 'iv_ann', 'har_ann']
    t = pd.read_parquet(p, columns=cols, filters=[('date', '<=', LOCKBOX.strftime('%Y-%m-%d'))])
    t['date'] = pd.to_datetime(t['date'])
    assert t.date.max() <= LOCKBOX, 'lockbox: part1_lines row after 2026-08-21'
    assert (t.date.dt.weekday < 5).all(), 'part1_lines has a weekend session key'
    t = t[(t.oos == 1) & t.inst.isin(INSTS)]
    n0 = len(t)
    t = t[(t.event != 'unknown') & t.regime.notna()].copy()
    missing = sorted(set(INSTS) - set(t.inst))
    if missing:
        raise SystemExit(f'part1_lines.parquet has no rows for {missing}')
    log(cfg, f'part1_lines: {n0} rows for 9 instruments, {len(t)} after event != unknown and regime present')
    return t.sort_values(['inst', 'date']).reset_index(drop=True)


def load_cboe(cfg, sym):
    p = need(os.path.join(cfg.root, f'analysis/surfaces/cboe/{sym}.csv'))
    d = pd.read_csv(p, encoding='utf-8-sig')
    s = pd.Series(d.iloc[:, -1].astype(float).values, index=pd.to_datetime(d.iloc[:, 0], format='%m/%d/%Y'))
    s = s[~s.index.duplicated(keep='last')].sort_index()
    return s[s.index <= LOCKBOX]                     # pre-open input; rows past the lockbox are dropped on load


def load_spx(cfg):
    p = need(os.path.join(cfg.root, 'oi_research_book/data/gex_range_es/spx500_nyclose_d1.parquet'))
    d = pd.read_parquet(p)
    s = d['close'].astype(float)
    s.index = pd.to_datetime(s.index)
    return s[s.index <= LOCKBOX].sort_index()


def load_gex(cfg, inst):
    f = {'NQ': 'nas100', 'SPX500': 'spx500'}[inst]
    p = need(os.path.join(cfg.root, f'oi_research_book/data/gex_range_es/nyc/daily_master_near_{f}_usd.parquet'))
    d = pd.read_parquet(p, columns=['date', 'net_gex_sum'])
    d['date'] = pd.to_datetime(d['date'])
    return d[d.date <= LOCKBOX].set_index('date').net_gex_sum.sort_index()


def pos_before(index, dates):
    """position of the last index entry strictly before each date (-1 if none)."""
    return np.searchsorted(index.values, dates.values, side='left') - 1


def global_signals(dates, vix, vix3m, vix9d, spx):
    out = pd.DataFrame(index=dates)
    i = pos_before(spx.index, dates)
    lc = np.log(spx.values)
    for k in (5, 20, 60):
        out[f'spx{k}'] = np.where(i >= k, -100 * (lc[np.clip(i, 0, None)] - lc[np.clip(i - k, 0, None)]), np.nan)
    j = pos_before(vix.index, dates)
    vv = vix.values
    out['vix'] = np.where(j >= 0, vv[np.clip(j, 0, None)], np.nan)
    out['vixchg5'] = np.where(j >= 5, out['vix'].values - vv[np.clip(j - 5, 0, None)], np.nan)
    v3 = vix3m.values[np.clip(pos_before(vix3m.index, dates), 0, None)]
    v9 = vix9d.values[np.clip(pos_before(vix9d.index, dates), 0, None)]
    out['term'] = out['vix'] / v3
    out['inv'] = (out['vix'] > v3).astype(float)
    out['front'] = np.log(v9 / out['vix'])
    return out


def month_end_flag(dates):
    res = {}
    for m in pd.PeriodIndex(dates, freq='M').unique():
        wd = pd.bdate_range(m.start_time, m.end_time)
        for k, d in enumerate(wd):
            res[d] = float(k <= 1 or k >= len(wd) - 2)
    return np.array([res.get(d, 0.0) for d in dates])


def input_panel(cfg):
    t = load_lines(cfg)
    dates = pd.DatetimeIndex(sorted(t.date.unique()))
    g = global_signals(dates, load_cboe(cfg, 'VIX'), load_cboe(cfg, 'VIX3M'), load_cboe(cfg, 'VIX9D'), load_spx(cfg))
    t = t.join(g, on='date')
    t['fam'] = t.inst.map(FAM_OF)
    t['sig'] = t.pit_sig_used.astype(float)
    t['sig_har'] = t.har_ann / math.sqrt(252)
    t['evmult'] = np.log(t.pit_sig_used / t.pit_sig_daily)
    t['ivrel'] = np.log(t.iv_ann / (t.sig * math.sqrt(252)))
    t['tier1'] = t.event.isin(['NFP', 'CPI', 'FOMC']).astype(float)
    t['high'] = (t.event == 'high').astype(float)
    t['month_end'] = month_end_flag(t.date)
    return t


# ───────────────────────────── M1 and labels ─────────────────────────────

def read_m1(path, cutoff=M1_CUTOFF_UTC):
    """Local parquet only. Filters at read time so no bar at/after the cutoff is materialised; asserts it."""
    need(path)
    sch = pq.read_schema(path)
    tcol = next((n for n in ('time', 'datetime', 'timestamp', '__index_level_0__') if n in sch.names), None)
    if tcol is None:
        tcol = next((f.name for f in sch if pa.types.is_timestamp(f.type)), None)
    if tcol is None:
        raise SystemExit(f'{path}: no time column found ({sch.names})')
    typ = sch.field(tcol).type
    dset = pds.dataset(path, format='parquet')
    if pa.types.is_timestamp(typ):
        c = cutoff.tz_localize('UTC') if typ.tz else cutoff
        flt = pds.field(tcol) < pa.scalar(c.to_pydatetime(), type=typ)
    elif pa.types.is_integer(typ):
        first = dset.head(1, columns=[tcol]).column(0)[0].as_py()
        mult = 1 if first < 1e11 else (1_000 if first < 1e14 else 1_000_000_000)
        flt = pds.field(tcol) < int(cutoff.tz_localize('UTC').timestamp()) * mult
    else:
        raise SystemExit(f'{path}: unsupported time type {typ}')
    tb = dset.to_table(columns=[tcol, 'open', 'high', 'low', 'close'], filter=flt).to_pandas()
    tt = tb[tcol]
    if pa.types.is_integer(typ):
        tt = pd.to_datetime(tt * (1_000_000_000 // mult), utc=True)
    else:
        tt = pd.to_datetime(tt, utc=True)
    tb['time'] = tt
    tb = tb.drop(columns=[c for c in [tcol] if c != 'time'])
    tb = tb.drop_duplicates('time').sort_values('time').reset_index(drop=True)
    assert len(tb), f'{path}: no M1 rows before the lockbox'
    assert tb.time.max() < cutoff.tz_localize('UTC'), 'LOCKBOX BREACH: an M1 bar at/after 2026-08-21 21:00 London was read'
    assert tb.time.min().year >= 2000, f'{path}: timestamps look like 1970 (BAM column trap)'
    return tb


def day_bars(m1, win):
    s, e, nmin = win
    loc = m1.time.dt.tz_convert('Europe/London')
    mod = loc.dt.hour * 60 + loc.dt.minute
    w = (mod >= s) & (mod < e) & (loc.dt.weekday < 5)
    d = m1[w].assign(date=loc[w].dt.tz_localize(None).dt.normalize(), mod=mod[w])
    g = d.groupby('date', sort=True)
    o = pd.DataFrame({'o': g.open.first(), 'c': g.close.last(), 'h': g.high.max(), 'l': g.low.min(),
                      'n': g.size(), 'm0': g['mod'].first(), 'm1': g['mod'].last()})
    o['ok'] = (o.m0 <= s + 4) & (o.m1 >= e - 5) & (o.n >= nmin) & (o.h > o.l)
    return o


def label(m, pos, sig, k):
    z = np.abs(m) / sig
    return ((z >= k) & (((m > 0) & (pos >= 0.8)) | ((m < 0) & (pos <= 0.2)))).astype(float)


def build_panel(cfg, inp):
    parts, drops = [], {}
    for inst in INSTS:
        root = cfg.index_root if FAM_OF[inst] == 'idx' else cfg.m1_root
        m1 = read_m1(os.path.join(root, f'{M1KEY[inst]}_m1.parquet'))
        main, ldn = day_bars(m1, WIN_MAIN), day_bars(m1, WIN_LDN)
        x = inp[inp.inst == inst].set_index('date')
        j = x.join(main, how='left')
        drops[inst] = dict(sessions=int(len(x)), dropped_label=int((~j.ok.fillna(False).astype(bool)).sum()))
        j = j[j.ok.fillna(False).astype(bool)].copy()
        j['m'] = 100 * (j.c - j.o) / j.o
        j['pos'] = (j.c - j.l) / (j.h - j.l)
        jl = ldn.reindex(j.index)
        j['m_ldn'] = 100 * (jl.c - jl.o) / jl.o
        j['pos_ldn'] = (jl.c - jl.l) / (jl.h - jl.l)
        j.loc[~jl.ok.fillna(False).astype(bool), ['m_ldn', 'pos_ldn']] = np.nan
        z = np.abs(j.m) / j.sig
        j['z'] = z
        j['prev_speed'] = np.log(np.maximum(z.shift(1), 0.05))
        for k in KS:
            j[f'E{k}'] = label(j.m, j.pos, j.sig, k)
            j[f'Eh{k}'] = label(j.m, j.pos, j.sig_har, k)
            j[f'El{k}'] = np.where(j.m_ldn.notna(), label(j.m_ldn, j.pos_ldn, j.sig, k), np.nan)
            cs = j[f'E{k}'].cumsum().shift(1)
            cnt = pd.Series(np.arange(len(j)), index=j.index)
            j[f'B0_{k}'] = np.where(cnt >= 120, cs / cnt.replace(0, np.nan), np.nan)
        log(cfg, f'  {inst}: {len(x)} sessions, label dropped {drops[inst]["dropped_label"]} (coverage/half-days)')
        parts.append(j.reset_index())
    P = pd.concat(parts, ignore_index=True)
    share = len(P) / len(inp)
    log(cfg, f'label join: {len(P)} of {len(inp)} input rows ({share:.1%})')
    return P, drops


def family_frame(P, fam):
    d = P[P.fam == fam].copy()
    need_cols = B1F + [c for c in FEATS[fam] if c != 'stress'] + RAW_STRESS + ['sig']
    d = d.dropna(subset=need_cols)
    return d.sort_values(['date', 'inst']).reset_index(drop=True)


# ───────────────────────────── model ─────────────────────────────

def logit_fit(X, y, l2=L2):
    b = np.zeros(X.shape[1])
    for _ in range(50):
        p = 1 / (1 + np.exp(-np.clip(X @ b, -30, 30)))
        W = p * (1 - p)
        H = X.T @ (X * W[:, None]) + l2 * np.eye(len(b))
        db = np.linalg.solve(H, X.T @ (y - p) - l2 * b)
        b += db
        if np.abs(db).max() < 1e-8:
            break
    return b


def sigm(x):
    return 1 / (1 + np.exp(-np.clip(x, -30, 30)))


def stress_count(d, fit, fam):
    q = lambda c, p: fit[c].quantile(p)
    if fam == 'fx':
        f = [d.spx5 >= q('spx5', 2 / 3), d.spx60 >= q('spx60', 2 / 3), d.vix >= q('vix', 2 / 3),
             d.vixchg5 >= q('vixchg5', 2 / 3), d.term >= q('term', 2 / 3), d.spx20 >= q('spx20', 0.8)]
    elif fam == 'idx':
        f = [d.spx5 >= q('spx5', 2 / 3), d.vixchg5 >= q('vixchg5', 2 / 3), d.spx20 >= q('spx20', 0.8), d.inv == 1]
    else:
        f = [d.inv == 1]
    return sum(x.astype(float) for x in f).values


def walk_forward(d, fam, y, feats=None, rolling_years=None, b1_cache=None, extra=None):
    """d: family frame; y: label array aligned with d. Returns test frame (index into d) with p1, pm, thr80."""
    feats = list(FEATS[fam] if feats is None else feats) + list(extra or [])
    insts = FAM[fam]
    alld = np.sort(d.date.unique())
    I = np.column_stack([(d.inst.values == i).astype(float) for i in insts])
    rows = []
    for fi, (a, b) in enumerate(FOLDS):
        a, b = pd.Timestamp(a), pd.Timestamp(b)
        prior = alld[alld < np.datetime64(a)]
        tr = (d.date.values < prior[-EMBARGO]) if len(prior) > EMBARGO else np.zeros(len(d), bool)
        if rolling_years:
            tr &= d.date.values >= np.datetime64(a - pd.DateOffset(years=rolling_years))
        te = (d.date.values >= np.datetime64(a)) & (d.date.values < np.datetime64(b))
        if tr.sum() < 100 or te.sum() == 0:
            continue
        cols = {c: d[c].values.astype(float) for c in B1F + [f for f in feats if f != 'stress']}
        if 'stress' in feats:
            cols['stress'] = stress_count(d, d[tr], fam)
        Z = {}
        for c, v in cols.items():
            mu, sd = v[tr].mean(), v[tr].std()
            Z[c] = (v - mu) / (sd if sd > 0 else 1.0)
        if b1_cache is not None and fi in b1_cache:
            p1 = b1_cache[fi]
        else:
            X1 = np.column_stack([I] + [Z[c] for c in B1F])
            p1 = sigm(X1[te] @ logit_fit(X1[tr], y[tr]))
            if b1_cache is not None:
                b1_cache[fi] = p1
        XM = np.column_stack([I] + [Z[c] for c in B1F + feats])
        bm = logit_fit(XM[tr], y[tr])
        pm = sigm(XM[te] @ bm)
        pin = sigm(XM[tr] @ bm)
        thr = pd.Series(pin).groupby(d.inst.values[tr]).quantile(0.8)
        rows.append(pd.DataFrame({'i': np.where(te)[0], 'fold': fi, 'p1': p1, 'pm': pm,
                                  'thr80': thr.reindex(d.inst.values[te]).values}))
    o = pd.concat(rows, ignore_index=True)
    o['date'] = d.date.values[o.i]
    o['inst'] = d.inst.values[o.i]
    o['y'] = y[o.i]
    return o


def bss(o, a='p1', b='pm'):
    e_a = ((o[a] - o.y) ** 2).sum()
    return float(1 - ((o[b] - o.y) ** 2).sum() / e_a) if e_a > 0 else float('nan')


def boot_blocks(n, B, rng, block=21):
    nb = int(math.ceil(n / block))
    st = rng.integers(0, max(n - block + 1, 1), (B, nb))
    return (st[:, :, None] + np.arange(block)[None, None, :]).reshape(B, -1)[:, :n]


def date_boot(o, cols_fn, B, rng):
    """moving-block bootstrap over test dates; cols_fn(o) -> DataFrame of per-row additive columns; returns (dates x cols)."""
    g = cols_fn(o).groupby(o.date.values).sum().sort_index()
    idx = boot_blocks(len(g), B, rng)
    A = g.values
    return g.columns, A.sum(0), A[idx].sum(1)                     # names, full sums, (B x cols)


def auc(y, p):
    y = np.asarray(y)
    n1 = y.sum()
    n0 = len(y) - n1
    if n1 == 0 or n0 == 0:
        return float('nan')
    r = pd.Series(p).rank().values
    return float((r[y == 1].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))


def recal_slope(y, p):
    lp = np.log(np.clip(p, 1e-6, 1 - 1e-6) / np.clip(1 - p, 1e-6, 1))
    b = logit_fit(np.column_stack([np.ones(len(lp)), lp]), np.asarray(y, float), l2=0.0)
    return float(b[0]), float(b[1])


def holm(ps):
    ps = np.asarray(ps, float)
    order = np.argsort(ps)
    out = np.empty(len(ps))
    run = 0.0
    for r, i in enumerate(order):
        run = max(run, min(1.0, ps[i] * (len(ps) - r)))
        out[i] = run
    return out


def bh(ps, q=0.10):
    ps = np.asarray(ps, float)
    m = len(ps)
    order = np.argsort(ps)
    passed = np.zeros(m, bool)
    kmax = 0
    for r, i in enumerate(order, 1):
        if ps[i] <= q * r / m:
            kmax = r
    passed[order[:kmax]] = True
    return passed


def binom_tail(n, k, p=0.05):
    return float(sum(math.comb(n, j) * p ** j * (1 - p) ** (n - j) for j in range(k, n + 1)))


def p_two(est, se):
    return float(2 * (1 - ND.cdf(abs(est) / se))) if se > 0 else float('nan')


# ───────────────────────────── placebos ─────────────────────────────

def shifted(d, s):
    e = d.copy()
    for inst in e.inst.unique():
        m = (e.inst == inst).values
        for c in SHIFT_COLS:
            e.loc[m, c] = np.roll(e.loc[m, c].values, s)
    return e


def p1_dist(d, fam, y, step, b1_cache):
    n = d.groupby('inst').size().min()
    out = []
    for s in range(63, n - 63 + 1, step):
        o = walk_forward(shifted(d, s), fam, y, b1_cache=b1_cache)
        out.append(bss(o))
    return np.array(out)


def month_perm_labels(d, y, rng):
    months = d.date.dt.to_period('M').values
    um = np.array(sorted(set(months)))
    perm = um[rng.permutation(len(um))]
    ny = np.empty(len(y))
    for inst in d.inst.unique():
        m = np.where(d.inst.values == inst)[0]                    # date-ordered rows of this instrument
        by = {mm: y[m][months[m] == mm] for mm in um}
        ny[m] = np.concatenate([by[mm] for mm in perm])
    return ny


def p2_dist(d, fam, y, n_perm, rng):
    return np.array([bss(walk_forward(d, fam, month_perm_labels(d, y, rng))) for _ in range(n_perm)])


# ───────────────────────────── one scored cell ─────────────────────────────

def score_cell(d, fam, k, cfg, rng, y=None, b0=None, step=None, n_perm=None, full=True):
    y = d[f'E{k}'].values.astype(float) if y is None else y
    cache = {}
    o = walk_forward(d, fam, y, b1_cache=cache)
    o['p0'] = d[f'B0_{k}'].values[o.i] if b0 is None else b0[o.i]
    o['absm'] = d['m'].abs().values[o.i] if 'm' in d else 1.0
    o['hi_m'] = (o.pm >= o.thr80).astype(float)
    est = bss(o)
    est0 = bss(o, 'p0', 'pm') if o.p0.notna().all() else float('nan')

    def cols(t):
        c = pd.DataFrame({'e0': (t.p0 - t.y) ** 2, 'e1': (t.p1 - t.y) ** 2, 'em': (t.pm - t.y) ** 2,
                          'cap_m': t.absm * t.hi_m, 'all': t.absm})
        return c
    names, full_s, bs = date_boot(o, cols, cfg.B, rng)
    ix = {n: i for i, n in enumerate(names)}
    b_b1 = 1 - bs[:, ix['em']] / bs[:, ix['e1']]
    b_b0 = 1 - bs[:, ix['em']] / bs[:, ix['e0']]
    res = dict(family=fam, k=k, n_rows=int(len(o)), n_dates=int(o.date.nunique()), base_rate=float(o.y.mean()),
               bss_b1=est, lo=float(np.percentile(b_b1, 2.5)), hi=float(np.percentile(b_b1, 97.5)), se_boot=float(b_b1.std()),
               bss_b0=est0, b0_lo=float(np.nanpercentile(b_b0, 2.5)), b0_hi=float(np.nanpercentile(b_b0, 97.5)))
    h1 = o.date < H1_END
    res['h1'], res['h2'] = bss(o[h1]), bss(o[~h1])
    if not full:
        res['_o'] = o
        return res
    p1 = p1_dist(d, fam, y, step or cfg.shift_step, cache)
    p2 = p2_dist(d, fam, y, n_perm or cfg.n_perm, rng)
    res.update(p1_n=int(len(p1)), p1_95=float(np.percentile(p1, 95)), p1_pct=float((p1 < est).mean() * 100),
               p2_n=int(len(p2)), p2_95=float(np.percentile(p2, 95)), p2_pct=float((p2 < est).mean() * 100),
               p2_sd=float(p2.std()))
    res['se'] = max(res['se_boot'], res['p2_sd'])
    res['p'] = p_two(est, res['se'])
    res['z'] = est / res['se'] if res['se'] > 0 else float('nan')
    res['_o'] = o
    return res


def describe_cell(res, cfg, rng):
    o = res['_o']
    res['auc_m'], res['auc_b1'] = auc(o.y, o.pm), auc(o.y, o.p1)
    B = min(cfg.B, 2000)
    dates = np.sort(o.date.unique())
    rows_of = o.groupby('date').indices
    idx = boot_blocks(len(dates), B, rng)
    am, a1 = [], []
    for r in idx:
        sel = np.concatenate([rows_of[dates[j]] for j in r])
        am.append(auc(o.y.values[sel], o.pm.values[sel]))
        a1.append(auc(o.y.values[sel], o.p1.values[sel]))
    res['auc_m_ci'] = [float(np.nanpercentile(am, 2.5)), float(np.nanpercentile(am, 97.5))]
    res['auc_b1_ci'] = [float(np.nanpercentile(a1, 2.5)), float(np.nanpercentile(a1, 97.5))]
    res['cal_intercept'], res['cal_slope'] = recal_slope(o.y.values, o.pm.values)
    dec = pd.qcut(o.pm.rank(method='first'), 10, labels=False)
    tab = o.groupby(dec).agg(n=('y', 'size'), mean_p=('pm', 'mean'), realised=('y', 'mean'), mean_b0=('p0', 'mean'))
    res['deciles'] = [dict(decile=int(i) + 1, **{c: float(v) for c, v in r.items()}) for i, r in tab.iterrows()]
    res['mirror_bottom_decile_below_b0'] = bool(tab.realised.iloc[0] < tab.mean_b0.iloc[0])
    # capture share (secondary)
    hi_m = o.pm >= o.thr80
    o2 = o.assign(r1=o.p1.rank(pct=True))
    thr1 = o2.groupby('fold').p1.transform(lambda s: s.quantile(0.8))
    hi_1 = o.p1 >= thr1
    tot = o.absm.sum()
    res['capture_m'] = float(o.absm[hi_m].sum() / tot)
    res['capture_m_days'] = float(hi_m.mean())
    res['capture_b1'] = float(o.absm[hi_1].sum() / tot)
    return res


def gates(res, p_holm):
    g = dict(G1=bool(res['lo'] > 0 and p_holm < 0.05), G2=bool(res['b0_lo'] > 0),
             G3=bool(res['h1'] > 0 and res['h2'] > 0), G4=bool(res['bss_b1'] > res['p1_95'] and res['bss_b1'] > res['p2_95']),
             G5=bool(res.get('cal_slope', 0) >= 0.5))
    return g


def family_verdict(cells):
    if any(all(c['gates'].values()) for c in cells):
        return 'VALIDATED'
    if any(c['gates']['G1'] and c['gates']['G2'] and c['gates']['G4'] for c in cells):
        return 'CONTEXT'
    if all(c['hi'] < U for c in cells):
        return 'NULL'
    return 'UNDERPOWERED'


# ───────────────────────────── positive control (inputs only) ─────────────────────────────

def synth_labels(d, fam, pi, beta, rng, rho=None):
    rho = {'fx': 0.47, 'gold': 0.0, 'idx': 0.85}[fam] if rho is None else rho
    zs = (d.regime - d.regime.mean()) / d.regime.std()
    sc = pd.Series(stress_count(d, d, fam))
    sc = (sc - sc.mean()) / (sc.std() or 1.0)
    if 'ivrel' in FEATS[fam]:
        iv = (d.ivrel - d.ivrel.mean()) / d.ivrel.std()
        sc = (sc.values + iv.values) / math.sqrt(2)
    p = sigm(ND.inv_cdf(pi) * 1.7 + 0.3 * zs.values + beta * np.asarray(sc))
    _, inv = np.unique(d.date.values, return_inverse=True)
    zd = rng.standard_normal(inv.max() + 1)[inv]
    u = np.array([ND.cdf(v) for v in math.sqrt(rho) * zd + math.sqrt(1 - rho) * rng.standard_normal(len(d))])
    return (u < p).astype(float)


def positive_control(cfg, inp, rng):
    d = inp[inp.fam == 'fx'].copy()
    d['prev_speed'] = rng.standard_normal(len(d))                # no M1 read yet: placeholder input
    d = d.dropna(subset=B1F + ['ivrel'] + RAW_STRESS).sort_values(['date', 'inst']).reset_index(drop=True)
    out = {}
    for beta in (0.35, 0.0):
        y = synth_labels(d, 'fx', 0.20, beta, rng)
        b0 = pd.Series(y).groupby(d.inst.values).transform(lambda s: s.cumsum().shift(1) / np.arange(len(s))).values
        r = score_cell(d.assign(m=1.0), 'fx', 0.75, cfg, rng, y=y, b0=b0, step=cfg.pc_shift_step, n_perm=cfg.pc_perm)
        above = r['bss_b1'] > r['p1_95'] and r['bss_b1'] > r['p2_95']
        out[f'beta_{beta}'] = dict(bss_b1=r['bss_b1'], ci=[r['lo'], r['hi']], p1_95=r['p1_95'], p2_95=r['p2_95'],
                                   above_placebos=bool(above), ybar=float(y.mean()))
    ok = (out['beta_0.35']['ci'][0] > 0 and out['beta_0.35']['above_placebos']
          and out['beta_0.0']['ci'][0] <= 0 <= out['beta_0.0']['ci'][1] and not out['beta_0.0']['above_placebos'])
    out['passed'] = bool(ok)
    return out


# ───────────────────────────── descriptive arms ─────────────────────────────

def quick_bss(d, fam, y, rng, B, **kw):
    ok = ~np.isnan(y)
    dd = d[ok].reset_index(drop=True)
    o = walk_forward(dd, fam, y[ok], **kw)
    _, _, bs = date_boot(o, lambda t: pd.DataFrame({'e1': (t.p1 - t.y) ** 2, 'em': (t.pm - t.y) ** 2}), B, rng)
    b = 1 - bs[:, 1] / bs[:, 0]
    return dict(bss_b1=bss(o), lo=float(np.percentile(b, 2.5)), hi=float(np.percentile(b, 97.5)), n_rows=int(len(o)))


def sub_bss(o, mask, rng, B):
    t = o[mask]
    if len(t) < 50:
        return dict(n_rows=int(len(t)))
    _, _, bs = date_boot(t, lambda u: pd.DataFrame({'e1': (u.p1 - u.y) ** 2, 'em': (u.pm - u.y) ** 2}), B, rng)
    b = 1 - bs[:, 1] / bs[:, 0]
    return dict(bss_b1=bss(t), lo=float(np.percentile(b, 2.5)), hi=float(np.percentile(b, 97.5)),
                se=float(b.std()), n_rows=int(len(t)))


def gamma_arm(cfg, d, k, rng, B):
    parts = []
    for inst in FAM['idx']:
        g = load_gex(cfg, inst)
        x = d[d.inst == inst].sort_values('date')
        dates = x.date.values
        src = np.r_[np.full(2, np.datetime64('NaT'), dtype='datetime64[ns]'), dates[:-2]]   # OI(D) -> session D+2
        val = g.reindex(pd.DatetimeIndex(src)).values
        parts.append(x.assign(short_gamma=(val < 0).astype(float), has_g=~np.isnan(val)))
    e = pd.concat(parts).sort_values(['date', 'inst'])
    e = e[e.has_g].reset_index(drop=True)
    y = e[f'E{k}'].values.astype(float)
    base = walk_forward(e, 'idx', y)
    plus = walk_forward(e, 'idx', y, extra=['short_gamma'])
    plus = plus.assign(p1=base.pm.values)                         # M vs M + gamma on the covered subset
    _, _, bs = date_boot(plus, lambda t: pd.DataFrame({'e1': (t.p1 - t.y) ** 2, 'em': (t.pm - t.y) ** 2}), B, rng)
    b = 1 - bs[:, 1] / bs[:, 0]
    return dict(bss_vs_M=bss(plus), lo=float(np.percentile(b, 2.5)), hi=float(np.percentile(b, 97.5)),
                n_rows=int(len(plus)), n_dates=int(plus.date.nunique()))


# ───────────────────────────── main ─────────────────────────────

def git(*a):
    try:
        return subprocess.run(['git', *a], capture_output=True, text=True, cwd=os.path.dirname(os.path.abspath(__file__))).stdout.strip()
    except Exception:
        return ''


def run(cfg):
    t0 = time.time()
    rng = np.random.default_rng(SEED)
    os.makedirs(cfg.out, exist_ok=True)
    inp = input_panel(cfg)

    log(cfg, 'positive control (synthetic labels on the real inputs, before any M1 is read) ...')
    pc = positive_control(cfg, inp, rng)
    json.dump(pc, open(os.path.join(cfg.out, 'positive_control.json'), 'w'), indent=2)
    log(cfg, f'  planted: {pc["beta_0.35"]}\n  null:    {pc["beta_0.0"]}')
    if not pc['passed']:
        raise SystemExit('POSITIVE CONTROL FAILED: the pipeline did not recover the planted effect (or passed the null). '
                         'Fix the code; no real label has been scored.')

    log(cfg, 'reading M1 (lockbox-filtered) and building 07:00-21:00 London labels ...')
    P, drops = build_panel(cfg, inp)
    fams = {f: family_frame(P, f) for f in FAM}

    cells = []
    for fam in FAM:
        for k in KS:
            log(cfg, f'scoring {fam} k={k} ...')
            r = score_cell(fams[fam], fam, k, cfg, rng)
            describe_cell(r, cfg, rng)
            cells.append(r)
    ph = holm([c['p'] for c in cells])
    for c, p in zip(cells, ph):
        c['p_holm'] = float(p)
        c['gates'] = gates(c, p)
    verdicts = {f: family_verdict([c for c in cells if c['family'] == f]) for f in FAM}

    # descriptive arms
    Bd = min(cfg.B, 1000)
    desc = {}
    for fam in FAM:
        d = fams[fam]
        for k in KS:
            key = f'{fam}_k{k}'
            c = next(c for c in cells if c['family'] == fam and c['k'] == k)
            o = c['_o']
            dd = dict(b1_vs_b0=bss(o, 'p0', 'p1'))
            dd['har800_label'] = quick_bss(d, fam, d[f'Eh{k}'].values.astype(float), rng, Bd)
            dd['window_0700_1600'] = quick_bss(d, fam, d[f'El{k}'].values.astype(float), rng, Bd)
            dd['rolling_3y'] = quick_bss(d, fam, d[f'E{k}'].values.astype(float), rng, Bd, rolling_years=3)
            ev = (d.tier1.values[o.i] + d.high.values[o.i]) > 0
            dd['event_days'], dd['no_event_days'] = sub_bss(o, ev, rng, Bd), sub_bss(o, ~ev, rng, Bd)
            dd['by_test_year'] = {f'T{f + 1}': bss(o[o.fold == f]) for f in sorted(o.fold.unique())}
            cut = o.absm.quantile(0.99)
            dd['without_top1pct_move'] = sub_bss(o, (o.absm <= cut).values, rng, Bd)
            if fam == 'idx':
                dd['gamma_sign_on_covered_subset'] = gamma_arm(cfg, d, k, rng, Bd)
            desc[key] = dd
    # disaggregation: instrument x k, BH q 0.10
    dis = []
    for c in cells:
        o = c['_o']
        for inst in FAM[c['family']]:
            s = sub_bss(o, (o.inst == inst).values, rng, Bd)
            s.update(inst=inst, k=c['k'], p=p_two(s.get('bss_b1', 0), s.get('se', 0)) if 'se' in s else float('nan'))
            dis.append(s)
    pv = np.array([x['p'] for x in dis])
    okp = ~np.isnan(pv)
    passed = np.zeros(len(dis), bool)
    passed[okp] = bh(pv[okp])
    for x, q in zip(dis, passed):
        x['bh_q10'] = bool(q)
    npass = int(passed.sum())
    chance = dict(tests=int(okp.sum()), passes=npass, expected_at_5pct=0.05 * int(okp.sum()),
                  p_at_least=binom_tail(int(okp.sum()), npass) if npass else 1.0)

    write_outputs(cfg, cells, verdicts, desc, dis, chance, drops, pc, time.time() - t0)
    return cells, verdicts


def fmt(x, pct=True, nd=2):
    if x is None or (isinstance(x, float) and not np.isfinite(x)):
        return 'n/a'
    return f'{100 * x:+.{nd}f}%' if pct else f'{x:.{nd}f}'


def write_outputs(cfg, cells, verdicts, desc, dis, chance, drops, pc, secs):
    sha = git('log', '--diff-filter=A', '--format=%h', '--', PREREG) or 'unknown'
    branch = git('rev-parse', '--abbrev-ref', 'HEAD') or 'unknown'
    ran = pd.Timestamp.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
    clean = lambda c: {k: v for k, v in c.items() if not k.startswith('_')}
    jcells = []
    for c in cells:
        vfam = verdicts[c['family']].lower()
        jcells.append(dict(name=f"{c['family']}_k{c['k']}", n=c['n_dates'], est=c['bss_b1'], lo=c['lo'], hi=c['hi'],
                           mde=MDE[c['family']], p=c['p'], p_holm=c['p_holm'], gates=c['gates'],
                           verdict=('validated' if all(c['gates'].values()) else vfam if vfam != 'validated' else 'null'),
                           detail=clean(c)))
    order = ['validated', 'context', 'underpowered', 'null']
    overall = min((v.lower() for v in verdicts.values()), key=order.index)
    J = dict(id=SLUG, verdict=overall, ranAt=ran, seed=SEED, B=cfg.B, prereg=PREREG, preregCommit=sha, branch=branch,
             ledger={f'{SLUG}-{f}': v.lower() for f, v in verdicts.items()}, cells=jcells, descriptive=desc,
             disaggregation=dis, chanceBaseline=chance, labelDrops=drops, positiveControl=pc,
             config=dict(shift_step=cfg.shift_step, n_perm=cfg.n_perm, lockbox=str(LOCKBOX.date()), runtime_s=round(secs)))
    json.dump(J, open(os.path.join(cfg.out, 'results.json'), 'w'), indent=2, default=float)

    L = [f'# {SLUG} — results', '',
         f'Prereg: `{PREREG}` (committed in `{sha}`). Run {ran[:10]}, seed {SEED}, B = {cfg.B}. Branch `{branch}`. '
         f'Ledger ids: ' + ', '.join(f'`{SLUG}-{f}`' for f in FAM) + '.', '',
         '## Verdict: ' + ' · '.join(f'{f} {v}' for f, v in verdicts.items()), '',
         'Registered gate per family × k cell: G1 BSS vs σ-only (B1) 95% CI lower > 0 and Holm p < 0.05 over 9 cells; '
         'G2 BSS vs B0 CI lower > 0; G3 BSS_B1 > 0 in both halves; G4 above the 95th percentile of the shift placebo (P1) '
         'and month-block label permutation (P2); G5 calibration slope ≥ 0.5. Useful effect U = +2.0% BSS_B1.', '',
         '## Scored cells', '',
         '| Cell | n dates | base rate | BSS vs B1 | 95% CI | BSS vs B0 | MDE | Pass bar | Holm p | G1 G2 G3 G4 G5 | Cell verdict |',
         '|---|---|---|---|---|---|---|---|---|---|---|']
    for c, jc in zip(cells, jcells):
        g = ' '.join('Y' if v else '-' for v in c['gates'].values())
        L.append(f"| {c['family']} k={c['k']} | {c['n_dates']} | {c['base_rate']:.3f} | {fmt(c['bss_b1'])} | "
                 f"[{fmt(c['lo'])}, {fmt(c['hi'])}] | {fmt(c['bss_b0'])} | {fmt(MDE[c['family']], nd=1)} | +2.0% | "
                 f"{c['p_holm']:.3f} | {g} | {jc['verdict'].upper()} |")
    L += ['', '## Controls (placebo, halves, calibration)', '',
          '| Cell | H1 / H2 | P1 95th (pct of real) | P2 95th (pct of real) | SE used | AUC M [CI] | AUC B1 | cal. slope | capture M / B1 (20% chance) |',
          '|---|---|---|---|---|---|---|---|---|']
    for c in cells:
        L.append(f"| {c['family']} k={c['k']} | {fmt(c['h1'])} / {fmt(c['h2'])} | {fmt(c['p1_95'])} ({c['p1_pct']:.0f}) | "
                 f"{fmt(c['p2_95'])} ({c['p2_pct']:.0f}) | {fmt(c['se'])} | {c['auc_m']:.3f} [{c['auc_m_ci'][0]:.3f}, {c['auc_m_ci'][1]:.3f}] | "
                 f"{c['auc_b1']:.3f} | {c['cal_slope']:.2f} | {c['capture_m']:.1%} / {c['capture_b1']:.1%} |")
    L += ['', f"Positive control (run before any M1 was read): planted BSS_B1 {fmt(pc['beta_0.35']['bss_b1'])} "
          f"CI [{fmt(pc['beta_0.35']['ci'][0])}, {fmt(pc['beta_0.35']['ci'][1])}], null {fmt(pc['beta_0.0']['bss_b1'])}: "
          f"{'PASSED' if pc['passed'] else 'FAILED'}.", '',
          'Label drops (coverage, half-days): ' + ', '.join(f"{k} {v['dropped_label']}/{v['sessions']}" for k, v in drops.items()) + '.',
          '', '## Deviations from the prereg', '', 'None.', '', '## Descriptive (not part of the verdict)', '']
    for key, dd in desc.items():
        L.append(f"- **{key}**: B1 vs B0 {fmt(dd['b1_vs_b0'])}; HAR-800 label {fmt(dd['har800_label']['bss_b1'])}; "
                 f"07-16 window {fmt(dd['window_0700_1600']['bss_b1'])}; rolling 3y {fmt(dd['rolling_3y']['bss_b1'])}; "
                 f"event days {fmt(dd['event_days'].get('bss_b1'))}, no-event {fmt(dd['no_event_days'].get('bss_b1'))}; "
                 f"without top 1% |move| {fmt(dd['without_top1pct_move'].get('bss_b1'))}; by year "
                 + ', '.join(f'{y} {fmt(v)}' for y, v in dd['by_test_year'].items())
                 + (f"; gamma sign on top of M (covered subset, {dd['gamma_sign_on_covered_subset']['n_dates']} dates) "
                    f"{fmt(dd['gamma_sign_on_covered_subset']['bss_vs_M'])}" if 'gamma_sign_on_covered_subset' in dd else ''))
    L += ['', f"Disaggregation (instrument × k, BH q 0.10): {chance['passes']} of {chance['tests']} survive "
          f"(expected at 5%: {chance['expected_at_5pct']:.1f}; P(≥ that many) {chance['p_at_least']:.3f}). Survivors are candidates for "
          'their own prereg, never results.', '',
          '| inst | k | BSS vs B1 | 95% CI | BH |', '|---|---|---|---|---|']
    for x in dis:
        L.append(f"| {x['inst']} | {x['k']} | {fmt(x.get('bss_b1'))} | [{fmt(x.get('lo'))}, {fmt(x.get('hi'))}] | {'Y' if x['bh_q10'] else '-'} |")
    L += ['', '## Calibration by decile (pooled family test rows)', '']
    for c in cells:
        L.append(f"- {c['family']} k={c['k']}: " + '; '.join(f"d{r['decile']} p {r['mean_p']:.2f} / real {r['realised']:.2f} (n {r['n']:.0f})"
                                                     for r in c['deciles']))
    L += ['', '## What this changes', '', 'See prereg §8 for each family verdict. (Edit this section by hand after reading.)', '']
    open(os.path.join(cfg.out, 'RESULTS.md'), 'w').write('\n'.join(L))
    log(cfg, f'wrote {cfg.out}/RESULTS.md, results.json ({secs:.0f}s). Verdicts: {verdicts}')


# ───────────────────────────── synthetic self-test ─────────────────────────────

def make_world(root, beta, seed):
    """Synthetic data in the real layouts. Planted: expansion days more likely when ivrel is high (FX, idx); gold null."""
    rng = np.random.default_rng(seed)
    dates = pd.bdate_range('2020-08-24', '2026-08-20')
    os.makedirs(f'{root}/analysis/output/vf3_stage_b', exist_ok=True)
    os.makedirs(f'{root}/analysis/surfaces/cboe', exist_ok=True)
    os.makedirs(f'{root}/oi_research_book/data/gex_range_es/nyc', exist_ok=True)
    os.makedirs(f'{root}/m1', exist_ok=True)
    os.makedirs(f'{root}/idx', exist_ok=True)
    # global series (run past the lockbox on purpose, to check truncation)
    gd = pd.bdate_range('2015-06-01', '2026-10-30')
    vix = np.exp(np.log(18) + np.cumsum(rng.normal(0, 0.05, len(gd))) * 0.3)
    for sym, v in (('VIX', vix), ('VIX3M', vix * np.exp(rng.normal(0.05, 0.05, len(gd)))),
                   ('VIX9D', vix * np.exp(rng.normal(-0.05, 0.08, len(gd))))):
        pd.DataFrame({'DATE': gd.strftime('%m/%d/%Y'), 'OPEN': v, 'HIGH': v, 'LOW': v, 'CLOSE': v}).to_csv(
            f'{root}/analysis/surfaces/cboe/{sym}.csv', index=False)
    sd = pd.bdate_range('2016-01-04', '2026-08-20')
    spx = pd.DataFrame({'close': 2000 * np.exp(np.cumsum(rng.normal(0.0003, 0.01, len(sd))))}, index=sd)
    spx.index.name = 'datetime'
    spx.to_parquet(f'{root}/oi_research_book/data/gex_range_es/spx500_nyclose_d1.parquet')
    for f in ('nas100', 'spx500'):
        gdates = pd.bdate_range('2020-11-03', '2026-08-20')[::2]
        pd.DataFrame({'date': gdates, 'net_gex_sum': rng.normal(0.5, 1, len(gdates))}).to_parquet(
            f'{root}/oi_research_book/data/gex_range_es/nyc/daily_master_near_{f}_usd.parquet')
    rows = []
    mins = np.arange(415, 1265)                                      # 06:55 .. 21:04 London
    win = (mins >= 420) & (mins < 1260)
    for inst in INSTS:
        fam = FAM_OF[inst]
        n = len(dates)
        reg = np.zeros(n)
        ivl = np.zeros(n)
        for t in range(1, n):
            reg[t] = 0.97 * reg[t - 1] + rng.normal(0, 0.05)
            ivl[t] = 0.9 * ivl[t - 1] + rng.normal(0, 0.1)
        daily = np.round(0.5 * np.exp(reg), 2)
        ev = rng.choice(['none', 'high', 'NFP', 'CPI', 'FOMC'], n, p=[0.55, 0.3, 0.05, 0.05, 0.05])
        used = np.round(daily * np.where(ev == 'none', 1.0, 1.08), 2)
        iv = used * math.sqrt(252) * np.exp(ivl)
        if fam == 'fx':
            iv[dates < pd.Timestamp('2020-09-09')] = np.nan
        evt = np.where(dates > pd.Timestamp('2026-07-02'), 'unknown', ev)
        regcol = np.r_[np.full(5, np.nan), reg[5:]]
        rows.append(pd.DataFrame({'inst': inst, 'date': dates.strftime('%Y-%m-%d'), 'oos': 1, 'event': evt, 'regime': regcol,
                                  'pit_sig_daily': daily, 'pit_sig_used': used, 'iv_ann': iv,
                                  'har_ann': used * math.sqrt(252) * np.exp(rng.normal(0, 0.05, n))}))
        # M1: trend day with prob depending on ivrel (planted) for fx/idx
        x = (ivl - ivl.mean()) / ivl.std() if fam != 'gold' else np.zeros(n)
        T = rng.random(n) < sigm(-1.2 + beta * x)
        s = used / 100
        steps = rng.normal(0, 1, (n, len(mins))) * (0.75 * s / math.sqrt(840))[:, None]
        drift = np.where(T, rng.choice([-1, 1], n) * rng.uniform(1.0, 1.6, n) * s, 0.0)
        steps[:, win] += (drift / 840)[:, None]
        steps[T][:, win] *= 0.5
        lp = math.log(100) + np.cumsum(steps, axis=1)
        close = np.exp(lp)
        openp = np.c_[close[:, :1] * np.exp(-steps[:, :1]), close[:, :-1]]
        wig = np.abs(rng.normal(0, 1, close.shape)) * (0.1 * s / math.sqrt(840))[:, None] * close
        hi = np.maximum(openp, close) + wig
        lo = np.minimum(openp, close) - wig
        loc = (np.asarray(dates.values, dtype='datetime64[m]')[:, None] + mins[None, :].astype('timedelta64[m]')).ravel()
        tl = pd.DatetimeIndex(loc).tz_localize('Europe/London', ambiguous='NaT', nonexistent='NaT')
        m1 = pd.DataFrame({'time': tl.tz_convert('UTC').tz_localize(None), 'open': openp.ravel(), 'high': hi.ravel(),
                           'low': lo.ravel(), 'close': close.ravel(), 'volume': 1})
        m1 = m1[m1.time.notna()]
        extra = pd.DataFrame({'time': pd.to_datetime(['2026-08-21 20:30', '2026-08-24 09:00']), 'open': 100.0,
                              'high': 100.0, 'low': 100.0, 'close': 100.0, 'volume': 1})     # after the lockbox cut
        m1 = pd.concat([m1, extra], ignore_index=True)
        d_root = 'idx' if fam == 'idx' else 'm1'
        m1.to_parquet(f'{root}/{d_root}/{M1KEY[inst]}_m1.parquet', index=False)
    pd.concat(rows).to_parquet(f'{root}/analysis/output/vf3_stage_b/part1_lines.parquet', index=False)


def selftest():
    t0 = time.time()
    tmp = tempfile.mkdtemp(prefix='dte_selftest_')
    ok = True
    try:
        # 1. missing file fails loudly
        try:
            need(f'{tmp}/nope.parquet')
            print('FAIL missing-file check'); ok = False
        except SystemExit as e:
            print('ok   missing file fails loudly:', str(e).strip().splitlines()[0])
        results = {}
        for name, beta in (('planted', 1.2), ('null', 0.0)):
            root = f'{tmp}/{name}'
            make_world(root, beta, seed=SEED + (0 if beta else 1))
            # 2. lockbox filter
            m1 = read_m1(f'{root}/m1/eurusd_m1.parquet')
            assert m1.time.max() < M1_CUTOFF_UTC.tz_localize('UTC')
            raw = pd.read_parquet(f'{root}/m1/eurusd_m1.parquet', columns=['time'])
            n_after = int((raw.time >= M1_CUTOFF_UTC).sum())
            print(f'ok   [{name}] lockbox: {n_after} synthetic bars at/after the cut exist on disk, 0 read')
            cfg = Cfg(root=root, m1_root=f'{root}/m1', index_root=f'{root}/idx', out=f'{root}/out',
                      B=300, shift_step=60, n_perm=40, pc_shift_step=60, pc_perm=40, quiet=True)
            cells, verdicts = run(cfg)
            results[name] = (cells, verdicts)
            for c in cells:
                print(f"     [{name}] {c['family']:4s} k={c['k']}: BSS_B1 {fmt(c['bss_b1'])} [{fmt(c['lo'])}, {fmt(c['hi'])}] "
                      f"P1/P2 pct {c['p1_pct']:.0f}/{c['p2_pct']:.0f} gates {''.join('Y' if v else '-' for v in c['gates'].values())}")
            print(f'     [{name}] verdicts {verdicts}')
            assert os.path.exists(f'{root}/out/RESULTS.md') and os.path.exists(f'{root}/out/results.json')
        pc_, pv = results['planted']
        fx_planted = [c for c in pc_ if c['family'] == 'fx']
        if any(c['lo'] > 0 and c['gates']['G4'] for c in fx_planted) and pv['fx'] in ('VALIDATED', 'CONTEXT'):
            print('ok   planted signal recovered on FX (CI > 0, above both placebos)')
        else:
            print('FAIL planted signal not recovered on FX'); ok = False
        if pv['gold'] != 'VALIDATED':
            print('ok   gold (no planted signal) not validated in the planted world')
        else:
            print('FAIL gold validated with no signal'); ok = False
        nv = results['null'][1]
        if all(v != 'VALIDATED' for v in nv.values()):
            print('ok   null world: no family validated')
        else:
            print('FAIL null world validated a family'); ok = False
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"SELFTEST {'PASSED' if ok else 'FAILED'} ({time.time() - t0:.0f}s)")
    return 0 if ok else 1


def main():
    here = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--selftest', action='store_true', help='synthetic data only; checks planted/null/lockbox/missing-file')
    ap.add_argument('--root', default=os.environ.get('MFX_DATA_ROOT', here), help='repo checkout holding the input files')
    ap.add_argument('--m1-root', default=None, help='FX + gold M1 dir (default <root>/VolRangeForecaster/data/m1)')
    ap.add_argument('--index-root', default=None, help='index M1 dir (default <root>/portfolioBacktest/cache)')
    ap.add_argument('--out', default=None, help='output dir (default <root>/analysis/output/day-type-expansion)')
    a = ap.parse_args()
    if a.selftest:
        sys.exit(selftest())
    cfg = Cfg(root=a.root, m1_root=a.m1_root or os.path.join(a.root, 'VolRangeForecaster/data/m1'),
              index_root=a.index_root or os.path.join(a.root, 'portfolioBacktest/cache'),
              out=a.out or os.path.join(a.root, 'analysis/output', SLUG))
    for inst in INSTS:                                             # fail before any work if M1 is absent
        need(os.path.join(cfg.index_root if FAM_OF[inst] == 'idx' else cfg.m1_root, f'{M1KEY[inst]}_m1.parquet'))
    run(cfg)


if __name__ == '__main__':
    main()
