#!/usr/bin/env python3
"""hold-day-one-confirm runner — forge/HOLD_DAY_ONE_CONFIRM_PREREG.md (seed 20261114).

    python -I scripts/hold-day-one-confirm/run.py              # the registered run (needs local M1, see README.md)
    python -I scripts/hold-day-one-confirm/run.py --selftest   # synthetic data only: planted + null + lockbox + missing file

Order of the real run (prereg §3.8):
  1. part1_lines (sigma, ladder widths, event tag) and the control moments (OC/sigma over all days, no forward move);
  2. M1 read with a hard read-time cut before 2026-08-21 21:00 London (asserted); DAY-ONE features only (07:00-21:00);
  3. positive control on synthetic forward paths over the real day-one table; abort if it fails;
  4. Monte-Carlo null on the real setup dates -> power table and SE floor (no outcome read);
  5. forward outcomes (21:00 -> 21:00), the hold-R paths on M1, the six scored cells, gates, verdicts, descriptive arms;
  6. analysis/output/hold-day-one-confirm/{RESULTS.md, results.json, positive_control.json, power.json}.
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
from dataclasses import dataclass, field, replace
from statistics import NormalDist

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.dataset as pds
import pyarrow.parquet as pq

SEED = 20261114
SLUG = 'hold-day-one-confirm'
PREREG = 'forge/HOLD_DAY_ONE_CONFIRM_PREREG.md'
LOCKBOX = pd.Timestamp('2026-08-21')                         # last London session that may be read
M1_CUTOFF_UTC = pd.Timestamp('2026-08-21 20:00:00')          # 21:00 London (BST) on that session; nothing at/after is read
M1_START_UTC = pd.Timestamp('2020-07-01')                    # sample starts 2020-08-24; B0 needs nothing earlier
START = pd.Timestamp('2020-08-24')
H1_END = pd.Timestamp('2023-08-18')                          # H1 = day ones <= this date; H2 = after
INSTS = ('EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'EURJPY', 'GBPJPY',
         'GOLD', 'NQ', 'SPX500', 'US30')
P1KEY = {i: ('DOW' if i == 'US30' else i) for i in INSTS}    # part1_lines spelling
M1KEY = {i: i.lower() for i in INSTS}
IDX = {'NQ', 'SPX500', 'US30'}
FAMILY = {i: ('idx' if i in IDX else 'gold' if i == 'GOLD' else 'fx') for i in INSTS}
H = (1, 2, 3, 5)
HMAX = 5
K = 1.0
K_DESC = (0.75, 1.5)
U = 0.10                                                     # useful effect on P-bar (sigma per sqrt-day; R for hold-r)
COST = 0.03
SCORED = ('run', 'close', 'speed', 'band', 'event', 'hold-r')
Z_HOLM1 = 2.64                                               # two-sided alpha 0.05/6
WIN = (420, 1260, 756)                                       # 07:00-21:00 London, >= 756 of 840 minutes
NS = 24                                                      # sub-steps a day in the synthetic paths
ND = NormalDist()


@dataclass(frozen=True)
class Cfg:
    root: str
    m1_root: str
    index_root: str
    out: str
    insts: tuple = INSTS
    B: int = 2000
    shift_step: int = 5
    n_mc: int = 300
    pc_B: int = 500
    pc_shift_step: int = 25
    quiet: bool = False


def log(cfg, *a):
    if not cfg.quiet:
        print(*a, flush=True)


def need(path):
    if not os.path.exists(path):
        raise SystemExit(f'\nMISSING DATA FILE: {path}\n'
                         f'  {SLUG} needs this file (see scripts/{SLUG}/README.md). Nothing was scored.\n')
    return path


def m1_path(cfg, inst):
    return os.path.join(cfg.index_root if inst in IDX else cfg.m1_root, f'{M1KEY[inst]}_m1.parquet')


# ───────────────────────────── inputs ─────────────────────────────

LINE_COLS = ['inst', 'date', 'oos', 'event', 'pit_sig_used', 'pit_oh_p50', 'pit_ol_p50', 'pit_oh_p90', 'pit_ol_p90',
             'har_ann', 'r_ocs']


def load_lines(cfg):
    p = need(os.path.join(cfg.root, 'analysis/output/vf3_stage_b/part1_lines.parquet'))
    t = pd.read_parquet(p, columns=LINE_COLS, filters=[('date', '<=', LOCKBOX.strftime('%Y-%m-%d'))])
    t['date'] = pd.to_datetime(t['date'])
    assert t.date.max() <= LOCKBOX, 'lockbox: part1_lines row after 2026-08-21'
    inv = {v: k for k, v in P1KEY.items()}
    t = t[(t.oos == 1) & t.inst.isin([P1KEY[i] for i in cfg.insts]) & (t.date >= START)].copy()
    t['inst'] = t.inst.map(inv)
    assert (t.date.dt.weekday < 5).all(), 'part1_lines has a weekend session key'
    missing = sorted(set(cfg.insts) - set(t.inst))
    if missing:
        raise SystemExit(f'part1_lines.parquet has no rows for {missing}')
    t = t.dropna(subset=['pit_sig_used']).drop_duplicates(['inst', 'date'])
    log(cfg, f'part1_lines: {len(t)} instrument-days for {len(cfg.insts)} instruments, '
             f'{t.date.min().date()} -> {t.date.max().date()}')
    return t.sort_values(['inst', 'date']).reset_index(drop=True)


def control_moments(lines, insts):
    """Unconditional SD and correlation of the session OC / sigma over ALL days (a control-sample moment; prereg §5)."""
    z = lines.assign(z=lines.r_ocs / lines.pit_sig_used).pivot(index='date', columns='inst', values='z')
    z = z.reindex(columns=list(insts))
    sd = z.std().fillna(1.0).values
    C = z.corr().fillna(0.0).values
    np.fill_diagonal(C, 1.0)
    w, V = np.linalg.eigh(C)
    C = V @ np.diag(np.clip(w, 1e-6, None)) @ V.T
    d = np.sqrt(np.diag(C))
    C = C / d[:, None] / d[None, :]
    return sd, np.linalg.cholesky(C)


# ───────────────────────────── M1 ─────────────────────────────

def read_m1(path, cutoff=M1_CUTOFF_UTC, start=M1_START_UTC):
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
        s = start.tz_localize('UTC') if typ.tz else start
        flt = (pds.field(tcol) < pa.scalar(c.to_pydatetime(), type=typ)) & \
              (pds.field(tcol) >= pa.scalar(s.to_pydatetime(), type=typ))
        mult = None
    elif pa.types.is_integer(typ):
        first = dset.head(1, columns=[tcol]).column(0)[0].as_py()
        mult = 1 if first < 1e11 else (1_000 if first < 1e14 else 1_000_000_000)
        flt = (pds.field(tcol) < int(cutoff.tz_localize('UTC').timestamp()) * mult) & \
              (pds.field(tcol) >= int(start.tz_localize('UTC').timestamp()) * mult)
    else:
        raise SystemExit(f'{path}: unsupported time type {typ}')
    tb = dset.to_table(columns=[tcol, 'open', 'high', 'low', 'close'], filter=flt).to_pandas()
    if mult is not None:
        tt = pd.to_datetime(tb[tcol] * (1_000_000_000 // mult), utc=True)
    else:
        tt = pd.to_datetime(tb[tcol], utc=True)
    tb = tb.drop(columns=[tcol]).assign(time=tt)
    tb = tb.drop_duplicates('time').sort_values('time').reset_index(drop=True)
    assert len(tb), f'{path}: no M1 rows before the lockbox'
    assert tb.time.max() < cutoff.tz_localize('UTC'), 'LOCKBOX BREACH: an M1 bar at/after 2026-08-21 21:00 London was read'
    assert tb.time.min().year >= 2000, f'{path}: timestamps look like 1970 (BAM column trap)'
    return tb


def london_21_ns(dates):
    loc = pd.DatetimeIndex(dates) + pd.Timedelta(hours=21)
    return loc.tz_localize('Europe/London').tz_convert('UTC').asi8


def day_one(m1, li):
    """Day-one table on the London dates of `li` (sigma rows). Features only: nothing after 21:00 on d is used here."""
    loc = m1.time.dt.tz_convert('Europe/London')
    mod = (loc.dt.hour * 60 + loc.dt.minute).values
    date = loc.dt.tz_localize(None).dt.normalize().values
    wk = loc.dt.weekday.values < 5
    df = pd.DataFrame({'date': date, 'mod': mod, 'open': m1.open.values, 'high': m1.high.values,
                       'low': m1.low.values, 'close': m1.close.values})[wk]
    s, e, nmin = WIN
    w = df[(df['mod'] >= s) & (df['mod'] < e)]
    g = w.groupby('date', sort=True)
    o = pd.DataFrame({'o': g.open.first(), 'c': g.close.last(), 'h': g.high.max(), 'l': g.low.min(),
                      'n': g.size(), 'm0': g['mod'].first(), 'm1': g['mod'].last()})
    o['cok'] = (o.m1 >= e - 5) & (o.m1 <= e - 1)                       # a valid 21:00 close
    o['ok'] = o.cok & (o.m0 <= s + 4) & (o.n >= nmin) & (o.h > o.l)    # a valid day one
    g0 = df[(df['mod'] < 5)].groupby('date').open.first()                # 00:00 London open (descriptive anchor)
    o['o00'] = g0.reindex(o.index)
    x = li.set_index('date')[['pit_sig_used', 'pit_oh_p50', 'pit_ol_p50', 'pit_oh_p90', 'pit_ol_p90']]
    o = o.join(x, how='left')
    # first touch of the p50 level and any touch of p90 in each direction, two anchors (07:00 open; 00:00 open)
    thr = o[['o', 'o00', 'pit_oh_p50', 'pit_ol_p50', 'pit_oh_p90', 'pit_ol_p90']]
    for anchor, src, lo_mod in (('', 'o', s), ('_00', 'o00', 0)):
        b = df[(df['mod'] >= lo_mod) & (df['mod'] < e)].join(thr, on='date')
        up50 = b.high >= b[src] * (1 + b.pit_oh_p50 / 100)
        dn50 = b.low <= b[src] * (1 - b.pit_ol_p50 / 100)
        up90 = b.high >= b[src] * (1 + b.pit_oh_p90 / 100)
        dn90 = b.low <= b[src] * (1 - b.pit_ol_p90 / 100)
        o[f'tu50{anchor}'] = b[up50].groupby('date')['mod'].min().reindex(o.index) - s
        o[f'td50{anchor}'] = b[dn50].groupby('date')['mod'].min().reindex(o.index) - s
        o[f'u90{anchor}'] = up90.groupby(b.date).any().reindex(o.index).fillna(False).astype(bool)
        o[f'd90{anchor}'] = dn90.groupby(b.date).any().reindex(o.index).fillna(False).astype(bool)
    return o


def forward_and_paths(m1, o, dates):
    """Forward 21:00 closes and the M1 path after 21:00 on each date in `dates` (rows of o with ok).
    Returns a DataFrame indexed by date with F{h} (raw % move), both-side hold R, exits, MFE/MAE, first-hit flags."""
    cdates = o.index[o.cok.values]
    cl = o.c.values[o.cok.values]
    cpos = {d: j for j, d in enumerate(cdates)}
    t_ns = m1.time.values.astype('datetime64[ns]').astype(np.int64)
    op, hi, lo = m1.open.values, m1.high.values, m1.low.values
    bnd_all = np.searchsorted(t_ns, london_21_ns(cdates), side='left')   # first bar at/after 21:00 of each valid session
    rec = []
    sig_all = o.pit_sig_used
    for d in dates:
        j0 = cpos.get(d)
        sig = sig_all.get(d, np.nan)
        r = {'date': d}
        if j0 is None or not np.isfinite(sig):
            rec.append(r)
            continue
        C = cl[j0]
        e0 = bnd_all[j0]
        bnd = {}
        for h in range(1, HMAX + 1):
            j = j0 + h
            if j >= len(cdates) or (cdates[j] - d).days > 2 * h + 6:
                break
            bnd[h] = bnd_all[j]
            r[f'F{h}'] = 100 * (cl[j] - C) / C
        if not bnd:
            rec.append(r)
            continue
        last = bnd[max(bnd)]
        seg_lo, seg_hi, seg_op = lo[e0:last], hi[e0:last], op[e0:last]
        sl, ss = C * (1 - sig / 100), C * (1 + sig / 100)              # long stop / short stop (= long +1R)
        hitL = np.flatnonzero(seg_lo <= sl)
        hitS = np.flatnonzero(seg_hi >= ss)
        iL = hitL[0] if len(hitL) else 10 ** 9
        iS = hitS[0] if len(hitS) else 10 ** 9
        RLs = (min(sl, seg_op[iL]) - C) / C * 100 / sig if iL < 10 ** 9 else np.nan
        RSs = (C - max(ss, seg_op[iS])) / C * 100 / sig if iS < 10 ** 9 else np.nan
        rels = {h: bnd[h] - e0 for h in bnd}
        bvals = np.array([rels[h] for h in sorted(rels)])
        for h in H:
            if h not in rels:
                continue
            rel = rels[h]
            Z = r[f'F{h}'] / sig
            if iL < rel:
                r[f'RL{h}'] = RLs
                r[f'xL{h}'] = int((bvals <= iL).sum())                 # whole sessions completed before the stop
            else:
                r[f'RL{h}'] = Z
                r[f'xL{h}'] = h - 1
            if iS < rel:
                r[f'RS{h}'] = RSs
                r[f'xS{h}'] = int((bvals <= iS).sum())
            else:
                r[f'RS{h}'] = -Z
                r[f'xS{h}'] = h - 1
            if rel > 0:
                r[f'hi{h}'] = (seg_hi[:rel].max() - C) / C * 100 / sig
                r[f'lo{h}'] = (seg_lo[:rel].min() - C) / C * 100 / sig
        if HMAX in rels:                                                 # +1 sigma before -1 sigma within 5 sessions
            rel = rels[HMAX]
            r['firstL'] = 1.0 if iS < min(iL, rel) else (0.0 if iL < min(iS, rel) else np.nan)
            r['firstS'] = 1.0 if iL < min(iS, rel) else (0.0 if iS < min(iL, rel) else np.nan)
        rec.append(r)
    return pd.DataFrame(rec).set_index('date')


# ───────────────────────────── the grid ─────────────────────────────

class Grid:
    """Everything on a (date spine) x (instrument) grid. Labels are known at 21:00 on the day one; outcomes after."""

    def __init__(self, dates, insts):
        self.dates = pd.DatetimeIndex(dates)
        self.insts = list(insts)
        self.D, self.I = len(dates), len(insts)
        self.a = {}

    def new(self, name, fill=np.nan, dtype=float):
        self.a[name] = np.full((self.D, self.I), fill, dtype=dtype)
        return self.a[name]

    def __getitem__(self, k):
        return self.a[k]

    def __setitem__(self, k, v):
        self.a[k] = v


def build_labels(G, k=K, sigcol='sig', anchor=''):
    """Class masks and sides at threshold k. Returns dict of masks (bool D x I), side S, faded side SF, MID weights."""
    ok = G['ok'].astype(bool)
    sig = G[sigcol]
    m = 100 * (G['c'] - G['o']) / G['o']
    z1 = m / sig
    S = np.sign(m)
    rng_ = G['h'] - G['l']
    q = np.where(S > 0, (G['c'] - G['l']) / rng_, (G['h'] - G['c']) / rng_)
    big = ok & (np.abs(z1) >= k) & np.isfinite(z1)
    t50 = np.where(S > 0, G[f'tu50{anchor}'], G[f'td50{anchor}'])
    p90 = np.where(S > 0, G[f'u90{anchor}'], G[f'd90{anchor}']).astype(bool)
    ev = G['ev']
    L = {'big': big, 'STRONG': big & (q >= 0.90), 'MID': big & (q < 0.75), 'TRUEMID': big & (q >= 0.30) & (q < 0.70),
         'FAST': big & (t50 <= 120), 'SLOW': big & ~(t50 <= 120),
         'P90': big & p90, 'NOP90': big & ~p90,
         'EVT': big & (ev == 2), 'NOEVT': big & (ev == 1)}
    exu = 100 * (G['h'] - G['o']) / G['o'] / sig
    exd = 100 * (G['o'] - G['l']) / G['o'] / sig
    fu = ok & (exu >= k) & (z1 < 0.5 * exu)
    fd = ok & (exd >= k) & (-z1 < 0.5 * exd)
    SF = np.where(fu & fd, np.where(exu >= exd, 1.0, -1.0), np.where(fu, 1.0, np.where(fd, -1.0, 0.0)))
    L['FADED'] = (fu | fd)
    # MID reweighted to STRONG's instrument x z1-bin mix (prereg §4 b); weights fixed on the full sample
    zb = np.digitize(np.abs(np.nan_to_num(z1)), [k + 0.5, k + 1.0])
    W = np.zeros_like(sig)
    for i in range(G.I):
        for b_ in range(3):
            cs = L['STRONG'][:, i] & (zb[:, i] == b_)
            cm = L['MID'][:, i] & (zb[:, i] == b_)
            if cm.sum() and cs.sum():
                W[cm, i] = (cs.sum() / max(L['STRONG'].sum(), 1)) / (cm.sum() / max(L['MID'].sum(), 1))
    for c in L:
        L[c] = np.asarray(L[c], bool)
    return dict(L=L, S=np.nan_to_num(S), SF=SF, Wmid=W, z1=z1, q=q, t50=t50)


def one_position(mask, X, side_pos):
    """Apply the one-open-position-per-instrument rule for each h. X[f'x{L|S}{h}'] = whole sessions the trade lasted
    before its exit session; side_pos (D x I) True where the entry is long. Returns {h: taken mask}."""
    out = {}
    for h in H:
        taken = np.zeros_like(mask)
        xl, xs = X[f'xL{h}'], X[f'xS{h}']
        for i in range(mask.shape[1]):
            busy = -1
            for d in np.flatnonzero(mask[:, i]):
                if d <= busy:
                    continue
                x = xl[d, i] if side_pos[d, i] else xs[d, i]
                if not np.isfinite(x):
                    continue
                taken[d, i] = True
                busy = d + int(x)
        out[h] = taken
    return out


# ───────────────────────────── statistics ─────────────────────────────

def term_sums(mask, side, wt, val):
    """Per-date (sum, count) of side*val over mask with weights. Returns arrays (D,)."""
    v = side * val
    ok = mask & np.isfinite(v)
    return np.where(ok, wt * v, 0.0).sum(1), np.where(ok, wt, 0.0).sum(1)


class Stat:
    """P-bar = 1/4 sum_h sum_terms sign * mean_h(term) / sqrt(h). A term: (sign, mask or {h: mask}, side, weight, kind).
    kind 'Z' -> side*(Z_h - h*b) (continuation net of drift); 'R' -> the hold R for that side (net of cost)."""

    def __init__(self, name, terms):
        self.name, self.terms = name, terms

    def sums(self, O, shift=0):
        out = []
        for sign, mask, side, wt, kind in self.terms:
            row = []
            for h in H:
                mk = mask[h] if isinstance(mask, dict) else mask
                sd, w_ = side, wt
                if shift:
                    mk, sd, w_ = np.roll(mk, shift, 0), np.roll(sd, shift, 0), np.roll(w_, shift, 0)
                if kind == 'Z':
                    val = O[f'Z{h}'] - h * O['b']
                    row.append(term_sums(mk, sd, w_, val))
                else:
                    val = np.where(sd > 0, O[f'RL{h}'], O[f'RS{h}']) - COST
                    row.append(term_sums(mk, np.ones_like(sd), w_, val))
            out.append((sign, row))
        return out

    @staticmethod
    def combine(sums, w):
        """w: (D,) or (B, D) date weights -> P-bar and per-h components."""
        tot, per_h = 0.0, []
        for hi_, h in enumerate(H):
            comp = 0.0
            for sign, row in sums:
                s, n = row[hi_]
                num, den = w @ s, w @ n
                comp = comp + sign * np.where(den > 0, num / np.where(den > 0, den, 1), np.nan)
            per_h.append(comp)
            tot = tot + comp / math.sqrt(h)
        return tot / len(H), per_h


def boot_weights(D, B, rng, block=21):
    nb = int(math.ceil(D / block))
    W = np.zeros((B, D))
    st = rng.integers(0, max(D - block, 1), (B, nb))
    for b in range(B):
        for s0 in st[b]:
            W[b, s0:s0 + block] += 1
    return W


def make_stats(lab, taken=None, coin=None):
    L, S, SF, Wm = lab['L'], lab['S'], lab['SF'], lab['Wmid']
    one = np.ones_like(S)
    st = {
        'run': Stat('run', [(1, L['STRONG'], S, one, 'Z')]),
        'close': Stat('close', [(1, L['STRONG'], S, one, 'Z'), (-1, L['MID'], S, Wm, 'Z')]),
        'speed': Stat('speed', [(1, L['FAST'], S, one, 'Z'), (-1, L['SLOW'], S, one, 'Z')]),
        'band': Stat('band', [(1, L['P90'], S, one, 'Z'), (-1, L['NOP90'], S, one, 'Z')]),
        'event': Stat('event', [(1, L['EVT'], S, one, 'Z'), (-1, L['NOEVT'], S, one, 'Z')]),
    }
    if coin is not None:
        cm, cs = coin
        st['hold-r'] = Stat('hold-r', [(1, taken if taken is not None else L['STRONG'], S, one, 'R'),
                                       (-1, cm, cs, one, 'R')])
        st['_hold_strong'] = Stat('_hold_strong', [(1, taken if taken is not None else L['STRONG'], S, one, 'R')])
    st['_faded'] = Stat('_faded', [(1, L['FADED'], SF, one, 'Z')])
    st['_run_minus_faded'] = Stat('_run_minus_faded', [(1, L['STRONG'], S, one, 'Z'), (-1, L['FADED'], SF, one, 'Z')])
    return st


def shift_list(D, step):
    return list(range(25, D - 25, step))


def score(stats, O, Wb, shifts, mc_sd, dates, cfg, which=SCORED):
    """Real value, bootstrap, halves, shift placebo for each stat in `which` (+ the helper stats)."""
    D = len(dates)
    h1 = (dates <= H1_END).astype(float)
    h2 = 1.0 - h1
    one = np.ones(D)
    res = {}
    names = [n for n in stats if n in which or n.startswith('_')]
    for n in names:
        st = stats[n]
        sm = st.sums(O)
        val, per_h = Stat.combine(sm, one)
        bv, bph = Stat.combine(sm, Wb)
        bv = np.asarray(bv)
        se_b = float(np.nanstd(bv))
        se_mc = float(mc_sd.get(n, 0.0))
        se = max(se_b, se_mc)
        lo_, hi_ = np.nanpercentile(bv, [2.5, 97.5])
        if se_b > 0 and se > se_b:                                     # widen the percentile CI to the MC floor
            f = se / se_b
            lo_, hi_ = val - (val - lo_) * f, val + (hi_ - val) * f
        r = dict(value=float(val), se_boot=se_b, se_mc=se_mc, se=se, lo=float(lo_), hi=float(hi_),
                 p=float(2 * (1 - ND.cdf(abs(val) / se))) if se > 0 else float('nan'),
                 h1=float(Stat.combine(sm, h1)[0]), h2=float(Stat.combine(sm, h2)[0]),
                 per_h={})
        for k_, h in enumerate(H):
            bh_ = np.asarray(bph[k_])
            se_h = float(np.nanstd(bh_))
            r['per_h'][h] = dict(value=float(per_h[k_]), lo=float(np.nanpercentile(bh_, 2.5)),
                                 hi=float(np.nanpercentile(bh_, 97.5)), se=se_h,
                                 p=float(2 * (1 - ND.cdf(abs(per_h[k_]) / se_h))) if se_h > 0 else float('nan'))
        if n in which and shifts:
            pl = np.array([Stat.combine(st.sums(O, shift=s), one)[0] for s in shifts], float)
            pl = pl[np.isfinite(pl)]
            r['placebo'] = dict(n=int(len(pl)), mean=float(pl.mean()), sd=float(pl.std()),
                                p95=float(np.percentile(pl, 95)), pct=float((pl < val).mean() * 100))
        res[n] = r
    return res


def holm(ps):
    ps = np.asarray(ps, float)
    o = np.argsort(ps)
    m = len(ps)
    adj = np.empty(m)
    run = 0.0
    for r, i in enumerate(o):
        run = max(run, min(1.0, (m - r) * ps[i]))
        adj[i] = run
    return adj


def bh(ps, q=0.10):
    ps = np.asarray(ps, float)
    m = len(ps)
    o = np.argsort(ps)
    thr = q * (np.arange(1, m + 1)) / m
    passed = ps[o] <= thr
    k = np.flatnonzero(passed).max() + 1 if passed.any() else 0
    out = np.zeros(m, bool)
    out[o[:k]] = True
    return out


def binom_tail(n, k, p=0.05):
    return float(sum(math.comb(n, j) * p ** j * (1 - p) ** (n - j) for j in range(k, n + 1)))


def gates(name, r, p_holm, res):
    g = {'G1': bool(r['lo'] > 0 and p_holm < 0.05), 'G2': bool(r['h1'] > 0 and r['h2'] > 0),
         'G3': bool('placebo' in r and r['value'] > r['placebo']['p95'])}
    if name == 'hold-r':
        g['G4'] = bool(res['_hold_strong']['lo'] > 0)
    if name in ('run', 'close'):
        g['G5'] = bool(res['_run_minus_faded']['lo'] > 0)
    return g


def verdict(name, r, g, p_holm):
    if all(g.values()):
        return 'VALIDATED'
    opposite = r['hi'] < 0 and p_holm < 0.05
    if g['G1'] or (opposite and name != 'hold-r'):
        return 'CONTEXT'
    if r['hi'] < U or (name == 'hold-r' and opposite):
        return 'NULL'
    return 'UNDERPOWERED'


# ───────────────────────────── synthetic forward (MC null, positive control) ─────────────────────────────

def synth_outcomes(G, sd, Lc, rng, plant=None, side=None):
    """Correlated Gaussian sessions on the spine (sigma units, 24 sub-steps), stop at -1 for each side.
    plant: (mask D x I, drift per session) added in direction `side` on those rows' forward paths."""
    D, I = G.D, G.I
    Dx = D + HMAX + 1
    e = rng.standard_normal((Dx * NS, I)) @ Lc.T * (sd / math.sqrt(NS))
    cs = np.cumsum(e, 0)
    base = cs[(np.arange(D) + 1) * NS - 1]
    idx = (np.arange(D)[:, None] + 1) * NS + np.arange(HMAX * NS)[None, :]
    P = cs[idx] - base[:, None, :]                                     # D x 5NS x I
    if plant is not None:
        pm, dr = plant
        ramp = (np.arange(HMAX * NS) + 1) / NS * dr
        P = P + (pm * side)[:, None, :] * ramp[None, :, None]
    O = {'b': np.zeros((D, I))}
    for h in H:
        seg = P[:, :h * NS, :]
        end = seg[:, -1, :]
        O[f'Z{h}'] = np.where(np.isfinite(G[f'F{h}']), end, np.nan)
        for nm, sg in (('L', 1.0), ('S', -1.0)):
            x = sg * seg
            hit = x <= -1.0
            anyh = hit.any(1)
            first = hit.argmax(1)
            fill = np.take_along_axis(x, first[:, None, :], 1)[:, 0, :]
            R = np.where(anyh, fill, sg * end)
            O[f'R{nm}{h}'] = np.where(np.isfinite(G[f'R{nm}{h}']), R, np.nan)
    return O


def mc_null(G, lab, coin, sd, Lc, rng, n, which=SCORED):
    stats = make_stats(lab, taken=None, coin=coin)
    one = np.ones(G.D)
    vals = {k: [] for k in stats}
    per_h = {k: {h: [] for h in H} for k in stats}
    for _ in range(n):
        O = synth_outcomes(G, sd, Lc, rng)
        for k, st in stats.items():
            v, ph = Stat.combine(st.sums(O), one)
            vals[k].append(v)
            for j, h in enumerate(H):
                per_h[k][h].append(ph[j])
    return ({k: float(np.nanstd(v)) for k, v in vals.items()},
            {k: {h: float(np.nanstd(per_h[k][h])) for h in H} for k in stats},
            {k: float(np.nanmean(v)) for k, v in vals.items()})


def positive_control(G, lab, coin, sd, Lc, cfg, rng, mc_sd):
    """Prereg §3.8: (a) planted +0.15 sigma a session on STRONG days must pass G1-G3 on run, close, hold-r;
    (b) planted 0: no scored cell may pass G1 + G3; the management placebo must sit within +-0.02R of -cost."""
    out = {}
    Wb = boot_weights(G.D, cfg.pc_B, rng)
    shifts = shift_list(G.D, cfg.pc_shift_step)
    for name, dr in (('planted_0.15', 0.15), ('null', 0.0)):
        O = synth_outcomes(G, sd, Lc, rng, plant=(lab['L']['STRONG'].astype(float), dr), side=lab['S'])
        stats = make_stats(lab, taken=None, coin=coin)
        res = score(stats, O, Wb, shifts, mc_sd, G.dates, cfg)
        ph = holm([res[c]['p'] for c in SCORED])
        cells = {}
        for c, p in zip(SCORED, ph):
            g = gates(c, res[c], p, res)
            cells[c] = dict(value=res[c]['value'], lo=res[c]['lo'], hi=res[c]['hi'], p_holm=float(p),
                            placebo_pct=res[c]['placebo']['pct'], gates=g)
        coin_mean = float(Stat.combine(Stat('coin', [(1, coin[0], coin[1], np.ones_like(coin[1]), 'R')]).sums(O),
                                       np.ones(G.D))[1][0])
        out[name] = dict(cells=cells, coin_hold_mean_h1=coin_mean)
    a = out['planted_0.15']['cells']
    b = out['null']['cells']
    okA = all(a[c]['gates']['G1'] and a[c]['gates']['G2'] and a[c]['gates']['G3'] for c in ('run', 'close', 'hold-r'))
    okB = not any(b[c]['gates']['G1'] and b[c]['gates']['G3'] for c in SCORED)
    okC = abs(out['null']['coin_hold_mean_h1'] + COST) <= 0.02
    out['passed'] = bool(okA and okB and okC)
    out['checks'] = dict(planted_recovered=okA, null_not_flagged=okB, placebo_at_minus_cost=okC)
    return out


# ───────────────────────────── the run ─────────────────────────────

def git(*a):
    try:
        return subprocess.run(['git', *a], capture_output=True, text=True,
                              cwd=os.path.dirname(os.path.abspath(__file__))).stdout.strip()
    except Exception:
        return ''


def run(cfg):
    t0 = time.time()
    rng = np.random.default_rng(SEED)
    os.makedirs(cfg.out, exist_ok=True)
    for inst in cfg.insts:                                             # fail before any work if a file is absent
        need(m1_path(cfg, inst))
    lines = load_lines(cfg)
    sd, Lc = control_moments(lines, cfg.insts)
    dates = pd.DatetimeIndex(sorted(lines.date.unique()))
    G = Grid(dates, cfg.insts)
    for nm in ('o', 'c', 'h', 'l', 'sig', 'sig_har', 'tu50', 'td50', 'tu50_00', 'td50_00', 'ev'):
        G.new(nm)
    for nm in ('ok', 'u90', 'd90', 'u90_00', 'd90_00'):
        G.new(nm, False, bool)
    G['o00'] = G.new('o00')
    m1s, ones, drops = {}, {}, {}

    log(cfg, 'reading M1 (lockbox-filtered at read time) and building DAY-ONE features (07:00-21:00 London) ...')
    for i, inst in enumerate(cfg.insts):
        m1 = read_m1(m1_path(cfg, inst))
        li = lines[lines.inst == inst]
        o = day_one(m1, li)
        m1s[inst], ones[inst] = m1, o
        r = o.reindex(dates)
        valid = li.set_index('date').reindex(dates)
        okv = r.ok.fillna(False).astype(bool).values & valid.pit_sig_used.notna().values
        for nm, col in (('o', 'o'), ('c', 'c'), ('h', 'h'), ('l', 'l'), ('tu50', 'tu50'), ('td50', 'td50'),
                        ('tu50_00', 'tu50_00'), ('td50_00', 'td50_00'), ('o00', 'o00')):
            G[nm][:, i] = r[col].values.astype(float)
        for nm in ('u90', 'd90', 'u90_00', 'd90_00'):
            G[nm][:, i] = r[nm].fillna(False).astype(bool).values
        G['ok'][:, i] = okv
        G['sig'][:, i] = valid.pit_sig_used.values
        G['sig_har'][:, i] = valid.har_ann.values / math.sqrt(252)
        ev = valid.event.values
        G['ev'][:, i] = np.where(np.isin(ev, ['NFP', 'CPI', 'FOMC']), 2, np.where(np.isin(ev, ['none', 'high']), 1, 0))
        drops[inst] = dict(sigma_days=int(valid.pit_sig_used.notna().sum()), day_one_valid=int(okv.sum()),
                           day_one_dropped=int(valid.pit_sig_used.notna().sum() - okv.sum()))
        log(cfg, f'  {inst}: {drops[inst]}')
    lab = build_labels(G)
    L = lab['L']
    big_t50 = lab['t50'][L['big']]
    assert np.isfinite(big_t50).all(), 'a >= 1 sigma close never touched its p50 level (prereg §3.2 assertion)'

    # placeholders so the synthetic engine knows which rows exist; refreshed with the real forward rows below.
    # Before any forward outcome is read, existence = a later valid 21:00 close inside the lockbox (no price used).
    for h in H:
        G.new(f'F{h}')
        G.new(f'RL{h}')
        G.new(f'RS{h}')
        for i, inst in enumerate(cfg.insts):
            o = ones[inst]
            cd = o.index[o.cok.values]
            pos = np.searchsorted(cd, dates.values)
            ex = (pos < len(cd)) & (cd[np.clip(pos, 0, len(cd) - 1)] == dates.values) & (pos + h < len(cd))
            ex &= G['ok'][:, i]
            G[f'F{h}'][ex, i] = 0.0
            G[f'RL{h}'][ex, i] = 0.0
            G[f'RS{h}'][ex, i] = 0.0
    crng = np.random.default_rng(SEED + 1)
    coin_side = np.where(crng.random((G.D, G.I)) < 0.5, 1.0, -1.0)
    coin = (G['ok'].copy(), coin_side)

    log(cfg, 'positive control (synthetic forward paths on the real day-one table; no forward outcome read) ...')
    mc_sd_pc, _, _ = mc_null(G, lab, coin, sd, Lc, np.random.default_rng(SEED + 2), max(50, cfg.n_mc // 3))
    pc = positive_control(G, lab, coin, sd, Lc, cfg, np.random.default_rng(SEED + 3), mc_sd_pc)
    json.dump(pc, open(os.path.join(cfg.out, 'positive_control.json'), 'w'), indent=2)
    log(cfg, f'  positive control: {pc["checks"]}')
    if not pc['passed']:
        raise SystemExit('POSITIVE CONTROL FAILED: the pipeline did not recover the planted drift, flagged the null, or '
                         'the management placebo is off -cost. Fix the code; no forward outcome has been read.')

    log(cfg, f'Monte-Carlo null on the real setup dates ({cfg.n_mc} draws) -> power table and SE floor ...')
    mc_sd, mc_sd_h, mc_mean = mc_null(G, lab, coin, sd, Lc, np.random.default_rng(SEED + 4), cfg.n_mc)
    power = {}
    for c in SCORED:
        s_ = mc_sd[c]
        power[c] = dict(mc_sd=s_, mde_first=(Z_HOLM1 + 0.84) * s_, mde_last=(1.96 + 0.84) * s_,
                        verdict='POWERED' if (Z_HOLM1 + 0.84) * s_ <= U else
                        ('POWERED at the last Holm step only' if (1.96 + 0.84) * s_ <= U else 'UNDERPOWERED'))
    counts = {c: int(L[c].sum()) for c in L}
    counts_dates = {c: int(L[c].any(1).sum()) for c in L}
    json.dump(dict(power=power, counts=counts, dates=counts_dates, mc_null_mean=mc_mean),
              open(os.path.join(cfg.out, 'power.json'), 'w'), indent=2)
    log(cfg, f'  counts {counts}\n  power {json.dumps({c: round(v["mde_first"], 3) for c, v in power.items()})}')

    log(cfg, 'forward outcomes (21:00 -> 21:00) and hold-R paths on M1 ...')
    for nm in [f'F{h}' for h in H] + [f'{a}{h}' for a in ('RL', 'RS', 'xL', 'xS', 'hi', 'lo') for h in H] + ['firstL', 'firstS']:
        G.new(nm)
    for i, inst in enumerate(cfg.insts):
        rows = dates[G['ok'][:, i]]
        fw = forward_and_paths(m1s[inst], ones[inst], rows).reindex(dates)
        for nm in [f'F{h}' for h in H] + [f'{a}{h}' for a in ('RL', 'RS', 'xL', 'xS', 'hi', 'lo') for h in H] + ['firstL', 'firstS']:
            if nm in fw:
                G[nm][:, i] = fw[nm].values.astype(float)
        log(cfg, f'  {inst}: forward rows h=1 {int(np.isfinite(G["F1"][:, i]).sum())}, h=5 {int(np.isfinite(G["F5"][:, i]).sum())}')
    del m1s
    O = {'b': drift(G)}
    for h in H:
        O[f'Z{h}'] = G[f'F{h}'] / G['sig']
        O[f'RL{h}'] = G[f'RL{h}']
        O[f'RS{h}'] = G[f'RS{h}']
    X = {f'x{a}{h}': G[f'x{a}{h}'] for a in ('L', 'S') for h in H}
    taken = one_position(L['STRONG'], X, lab['S'] > 0)
    coin_taken = one_position(G['ok'], X, coin_side > 0)
    coin_t = (coin_taken, coin_side)
    stats = make_stats(lab, taken=taken, coin=coin_t)
    # the shift placebo for hold-r moves labels without the one-position rule (prereg A1)
    stats_shift = make_stats(lab, taken=None, coin=coin_t)
    Wb = boot_weights(G.D, cfg.B, rng)
    shifts = shift_list(G.D, cfg.shift_step)
    log(cfg, f'scoring six cells: bootstrap B={cfg.B}, {len(shifts)} date shifts ...')
    res = score(stats, O, Wb, [], mc_sd, dates, cfg)
    resp = score(stats_shift, O, Wb[:2], shifts, mc_sd, dates, cfg)
    for c in SCORED:
        res[c]['placebo'] = resp[c]['placebo']
    ph = holm([res[c]['p'] for c in SCORED])
    cells = {}
    for c, p in zip(SCORED, ph):
        g = gates(c, res[c], p, res)
        cells[c] = dict(res[c], p_holm=float(p), gates=g, verdict=verdict(c, res[c], g, p), power=power[c])

    log(cfg, 'descriptive arms ...')
    desc = describe(G, O, lab, stats, X, coin_t, taken, sd, Lc, cfg, rng, mc_sd_h, res)
    write_outputs(cfg, G, cells, res, desc, drops, counts, counts_dates, pc, power, time.time() - t0)
    return cells


def drift(G):
    """b: per instrument, expanding mean of the one-session 21:00->21:00 move / sigma over sessions before d
    (the previous session's outcome ends at 21:00 on d, known at entry); min 120, else 0."""
    z = G['F1'] / G['sig']
    b = np.zeros_like(z)
    for i in range(G.I):
        s = pd.Series(z[:, i])
        m = s.shift(1).expanding().mean()
        n = s.shift(1).expanding().count()
        b[:, i] = np.where(n >= 120, m.fillna(0).values, 0.0)
    return b


def sub_value(st, O, Wb, w):
    sm = st.sums(O)
    v = Stat.combine(sm, w)[0]
    bv = np.asarray(Stat.combine(sm, Wb * w[None, :])[0])
    se = float(np.nanstd(bv))
    return dict(value=float(v), lo=float(np.nanpercentile(bv, 2.5)), hi=float(np.nanpercentile(bv, 97.5)), se=se,
                p=float(2 * (1 - ND.cdf(abs(v) / se))) if se > 0 else float('nan'))


def mask_cols(stats, cols):
    """Restrict every term of every stat to the given instrument columns."""
    out = {}
    for n, st in stats.items():
        terms = []
        for sign, mask, side, wt, kind in st.terms:
            if isinstance(mask, dict):
                mk = {h: m & cols[None, :] for h, m in mask.items()}
            else:
                mk = mask & cols[None, :]
            terms.append((sign, mk, side, wt, kind))
        out[n] = Stat(n, terms)
    return out


def describe(G, O, lab, stats, X, coin_t, taken, sd, Lc, cfg, rng, mc_sd_h, res):
    Bd = min(cfg.B, 1000)
    Wb = boot_weights(G.D, Bd, rng)
    one = np.ones(G.D)
    L, S = lab['L'], lab['S']
    d = {}
    # per-horizon cells, BH q 0.10 (MC floor per h)
    ph = []
    for c in SCORED:
        for h in H:
            r = res[c]['per_h'][h]
            se = max(r['se'], mc_sd_h[c][h])
            p = float(2 * (1 - ND.cdf(abs(r['value']) / se))) if se > 0 else float('nan')
            ph.append(dict(cell=c, h=h, value=r['value'], lo=r['lo'], hi=r['hi'], se=se, p=p))
    q = bh([x['p'] for x in ph])
    for x, b_ in zip(ph, q):
        x['bh_q10'] = bool(b_)
    d['per_horizon'] = ph
    # per instrument and per family, BH q 0.10 with chance baseline
    dis = []
    for i, inst in enumerate(G.insts):
        cols = np.zeros(G.I, bool)
        cols[i] = True
        sti = mask_cols(stats, cols)
        for c in SCORED:
            r = sub_value(sti[c], O, Wb, one)
            dis.append(dict(inst=inst, cell=c, **r))
    pv = np.array([x['p'] for x in dis])
    okp = np.isfinite(pv)
    passed = np.zeros(len(dis), bool)
    passed[okp] = bh(pv[okp])
    for x, b_ in zip(dis, passed):
        x['bh_q10'] = bool(b_)
    npass = int(sum(1 for x in dis if np.isfinite(x['p']) and x['p'] < 0.05))
    d['per_instrument'] = dis
    d['per_instrument_chance'] = dict(tests=int(okp.sum()), nominal_p05=npass, expected=0.05 * int(okp.sum()),
                                      p_at_least=binom_tail(int(okp.sum()), npass) if npass else 1.0,
                                      bh_passes=int(passed.sum()))
    fam = {}
    for f in ('fx', 'gold', 'idx'):
        cols = np.array([FAMILY[i] == f for i in G.insts])
        if not cols.any():
            continue
        stf = mask_cols(stats, cols)
        fam[f] = {c: sub_value(stf[c], O, Wb, one) for c in SCORED}
    d['per_family'] = fam
    # k sweep and the HAR-800 sigma, 00:00 anchor bands
    for nm, kw in (('k0.75', dict(k=0.75)), ('k1.5', dict(k=1.5)), ('sigma_har800', dict(sigcol='sig_har')),
                   ('bands_00_anchor', dict(anchor='_00'))):
        lb = build_labels(G, **kw)
        if nm == 'sigma_har800':
            O2 = dict(O)
            for h in H:
                O2[f'Z{h}'] = G[f'F{h}'] / G['sig_har']
            Ox = O2
        else:
            Ox = O
        st = make_stats(lb)
        d[nm] = {c: sub_value(st[c], Ox, Wb, one) for c in ('run', 'close', 'speed', 'band', 'event')}
    # true middle, ladders
    Sm = Stat('truemid', [(1, L['STRONG'], S, np.ones_like(S), 'Z'), (-1, L['TRUEMID'], S, np.ones_like(S), 'Z')])
    d['strong_minus_truemid_0.30_0.70'] = sub_value(Sm, O, Wb, one)

    def ladder(var, edges, mask):
        out = []
        bins = np.digitize(var, edges)
        for b_ in range(len(edges) + 1):
            m = mask & (bins == b_) & np.isfinite(var)
            row = dict(bin=b_, lo_edge=float(edges[b_ - 1]) if b_ else None,
                       hi_edge=float(edges[b_]) if b_ < len(edges) else None, n=int(m.sum()))
            for h in (1, 5):
                v = S * (O[f'Z{h}'] - h * O['b'])
                vv = v[m & np.isfinite(v)]
                row[f'R{h}'] = float(vv.mean()) if len(vv) else None
            out.append(row)
        return out
    d['ladder_q'] = ladder(lab['q'], np.arange(0.1, 1.0, 0.1), L['big'])
    d['ladder_z1'] = ladder(np.abs(lab['z1']), np.array([1.25, 1.5, 2.0, 2.5]), L['big'])
    d['ladder_t50'] = ladder(lab['t50'], np.array([30, 60, 120, 240, 480]), L['big'])
    # thinned de-clustering for run
    thin = {}
    for h in H:
        tk = np.zeros_like(L['STRONG'])
        for i in range(G.I):
            last = -10 ** 9
            for t in np.flatnonzero(L['STRONG'][:, i]):
                if t - last >= h:
                    tk[t, i] = True
                    last = t
        thin[h] = tk
    d['run_thinned'] = sub_value(Stat('thin', [(1, thin, S, np.ones_like(S), 'Z')]), O, Wb, one)
    # MFE / MAE, +1 before -1 by class
    pm = {}
    for c in ('STRONG', 'MID', 'FADED', 'FAST', 'SLOW', 'P90', 'NOP90', 'EVT', 'NOEVT'):
        sd_ = lab['SF'] if c == 'FADED' else S
        m = L[c]
        row = dict(n=int(m.sum()))
        for h in H:
            mfe = np.where(sd_ > 0, G[f'hi{h}'], -G[f'lo{h}'])
            mae = np.where(sd_ > 0, G[f'lo{h}'], -G[f'hi{h}'])
            row[f'MFE{h}'] = float(np.nanmean(mfe[m])) if m.any() else None
            row[f'MAE{h}'] = float(np.nanmean(mae[m])) if m.any() else None
        fh = np.where(sd_ > 0, G['firstL'], G['firstS'])[m]
        row['plus1_before_minus1'] = float(np.nanmean(fh)) if np.isfinite(fh).any() else None
        row['neither_in_5'] = float(np.mean(~np.isfinite(fh))) if len(fh) else None
        pm[c] = row
    d['paths'] = pm
    # hold-R legs, tails, costs, MID hold
    legs = {}
    for h in H:
        tk = taken[h]
        r = np.where(S > 0, O[f'RL{h}'], O[f'RS{h}'])[tk] - COST
        r = r[np.isfinite(r)]
        cm, cs = coin_t
        rc = np.where(cs > 0, O[f'RL{h}'], O[f'RS{h}'])[cm[h]] - COST
        rc = rc[np.isfinite(rc)]
        rm = np.where(S > 0, O[f'RL{h}'], O[f'RS{h}'])[L['MID']] - COST
        rm = rm[np.isfinite(rm)]
        if len(r):
            srt = np.sort(r)
            top = srt[-max(1, len(r) // 10):].sum()
            legs[h] = dict(n=int(len(r)), skipped_one_position=int(L['STRONG'].sum() - tk.sum()), mean=float(r.mean()),
                           p_win=float((r > 0).mean()), e_win=float(r[r > 0].mean()) if (r > 0).any() else None,
                           e_loss=float(r[r <= 0].mean()) if (r <= 0).any() else None,
                           stopped=float((r <= -1 - COST + 1e-12).mean()),
                           top10_share_of_pnl=float(top / r.sum()) if r.sum() != 0 else None,
                           es5=float(srt[:max(1, len(r) // 20)].mean()),
                           mean_cost_0.06 if False else None)
            legs[h]['mean_cost_0.06'] = float(r.mean() - COST)
            legs[h]['mean_with_financing'] = float(r.mean() - 0.01 * h)
            legs[h]['coin_placebo_mean'] = float(rc.mean()) if len(rc) else None
            legs[h]['mid_hold_mean'] = float(rm.mean()) if len(rm) else None
    d['hold_legs'] = legs
    # concentration of run: by year, without top 1% |R5| big days, last two years
    years = G.dates.year
    d['run_by_year'] = {int(y): sub_value(stats['run'], O, Wb, (years == y).astype(float))['value'] for y in sorted(set(years))}
    r5 = np.abs(S * O['Z5'])
    cut = np.nanpercentile(r5[L['big']], 99) if np.isfinite(r5[L['big']]).any() else np.inf
    trim = L['STRONG'] & ~(r5 > cut)
    d['run_without_top1pct'] = sub_value(Stat('trim', [(1, trim, S, np.ones_like(S), 'Z')]), O, Wb, one)
    d['run_last_two_years'] = sub_value(stats['run'], O, Wb, (G.dates >= LOCKBOX - pd.Timedelta(days=730)).astype(float))
    d['mirror_faded'] = res['_faded']
    d['run_minus_faded'] = res['_run_minus_faded']
    d['hold_strong_vs_flat'] = res['_hold_strong']
    return d


def f3(x):
    return '—' if x is None or (isinstance(x, float) and not np.isfinite(x)) else f'{x:+.3f}'


def write_outputs(cfg, G, cells, res, desc, drops, counts, counts_dates, pc, power, secs):
    head = git('rev-parse', 'HEAD')
    dirty = bool(git('status', '--porcelain'))
    js = dict(slug=SLUG, prereg=PREREG, seed=SEED, k=K, U=U, cost=COST, horizons=list(H),
              sample=dict(start=str(G.dates.min().date()), end=str(G.dates.max().date()), lockbox=str(LOCKBOX.date()),
                          h1_end=str(H1_END.date())),
              instruments=list(cfg.insts), git_head=head, git_dirty=dirty, runtime_s=round(secs, 1),
              B=cfg.B, shift_step=cfg.shift_step, n_mc=cfg.n_mc,
              cells={c: {k: v for k, v in cells[c].items()} for c in SCORED},
              verdicts={f'{SLUG}-{c}': cells[c]['verdict'] for c in SCORED},
              counts=counts, count_dates=counts_dates, drops=drops, power=power,
              positive_control=pc['checks'], descriptive=desc)
    with open(os.path.join(cfg.out, 'results.json'), 'w') as f:
        json.dump(js, f, indent=1, default=lambda o: o.item() if hasattr(o, 'item') else str(o))
    L = []
    L.append(f'# {SLUG}: does how a big day closes say whether it keeps running?\n')
    L.append(f'Pre-registered: `{PREREG}`. Seed {SEED}. Run {time.strftime("%Y-%m-%d")} at `{head[:8]}`'
             f'{" (dirty tree)" if dirty else ""}, {secs / 60:.1f} min. Sample {G.dates.min().date()} → {G.dates.max().date()} '
             f'(lockbox {LOCKBOX.date()}), {len(cfg.insts)} instruments, k = {K}σ, horizons {list(H)} sessions, '
             f'B = {cfg.B}, shift step {cfg.shift_step}, MC {cfg.n_mc}.\n')
    L.append('## Verdicts (scored cells, P̄ = ¼ Σ_h cell_h / √h)\n')
    L.append('| Ledger id | P̄ | 95% CI | SE (boot / MC) | Holm p | H1 / H2 | placebo pct | gates | power (MDE first step) | **verdict** |')
    L.append('|---|---|---|---|---|---|---|---|---|---|')
    for c in SCORED:
        r = cells[c]
        g = ' '.join(f'{k}{"✓" if v else "✗"}' for k, v in r['gates'].items())
        L.append(f'| `{SLUG}-{c}` | {r["value"]:+.3f} | [{r["lo"]:+.3f}, {r["hi"]:+.3f}] | {r["se_boot"]:.3f} / {r["se_mc"]:.3f} | '
                 f'{r["p_holm"]:.3f} | {r["h1"]:+.3f} / {r["h2"]:+.3f} | {r["placebo"]["pct"]:.1f} | {g} | '
                 f'{r["power"]["mde_first"]:.3f} ({r["power"]["verdict"]}) | **{r["verdict"]}** |')
    L.append(f'\nU = {U} (σ per √day; R for hold-r). Gates per prereg §4. Mirror (FADED − B0) P̄ '
             f'{res["_faded"]["value"]:+.3f} [{res["_faded"]["lo"]:+.3f}, {res["_faded"]["hi"]:+.3f}]; STRONG − FADED '
             f'{res["_run_minus_faded"]["value"]:+.3f} [{res["_run_minus_faded"]["lo"]:+.3f}, {res["_run_minus_faded"]["hi"]:+.3f}]. '
             f'STRONG hold vs flat {res["_hold_strong"]["value"]:+.3f} [{res["_hold_strong"]["lo"]:+.3f}, {res["_hold_strong"]["hi"]:+.3f}] R.\n')
    L.append('## Per horizon (descriptive, BH q = 0.10 over 24)\n')
    L.append('| cell | h | value | 95% CI | p | BH |')
    L.append('|---|---|---|---|---|---|')
    for x in desc['per_horizon']:
        L.append(f'| {x["cell"]} | {x["h"]} | {x["value"]:+.3f} | [{x["lo"]:+.3f}, {x["hi"]:+.3f}] | {x["p"]:.3f} | {"yes" if x["bh_q10"] else ""} |')
    L.append('\n## Counts\n')
    L.append('| class | instrument-days | dates |')
    L.append('|---|---|---|')
    for c in counts:
        L.append(f'| {c} | {counts[c]} | {counts_dates[c]} |')
    L.append('\n## Hold R legs (STRONG, one position per instrument, net of 0.03R)\n')
    L.append('| h | n | skipped | mean | P(win) | E[win] | E[loss] | stopped | top-10% share | ES 5% | cost 0.06 | + financing | coin placebo | MID hold |')
    L.append('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
    for h, x in desc['hold_legs'].items():
        L.append(f'| {h} | {x["n"]} | {x["skipped_one_position"]} | {f3(x["mean"])} | {x["p_win"]:.2f} | {f3(x["e_win"])} | '
                 f'{f3(x["e_loss"])} | {x["stopped"]:.2f} | {f3(x["top10_share_of_pnl"])} | {f3(x["es5"])} | '
                 f'{f3(x["mean_cost_0.06"])} | {f3(x["mean_with_financing"])} | {f3(x["coin_placebo_mean"])} | {f3(x["mid_hold_mean"])} |')
    L.append('\n## Descriptive arms (no pass/fail weight)\n')
    for nm in ('k0.75', 'k1.5', 'sigma_har800', 'bands_00_anchor'):
        L.append(f'- **{nm}**: ' + '; '.join(f'{c} {v["value"]:+.3f} [{v["lo"]:+.3f}, {v["hi"]:+.3f}]' for c, v in desc[nm].items()))
    for nm in ('strong_minus_truemid_0.30_0.70', 'run_thinned', 'run_without_top1pct', 'run_last_two_years'):
        v = desc[nm]
        L.append(f'- **{nm}**: {v["value"]:+.3f} [{v["lo"]:+.3f}, {v["hi"]:+.3f}]')
    L.append('- **run by year**: ' + ', '.join(f'{y} {v:+.3f}' for y, v in desc['run_by_year'].items()))
    for nm in ('ladder_q', 'ladder_z1', 'ladder_t50'):
        L.append(f'- **{nm}** (bin: n, R1, R5): ' + '; '.join(
            f'{r["lo_edge"]}–{r["hi_edge"]}: {r["n"]}, {f3(r["R1"])}, {f3(r["R5"])}' for r in desc[nm]))
    L.append('\n### Paths by class (σ units; MFE / MAE at h; share reaching +1σ before −1σ within 5 sessions)\n')
    L.append('| class | n | MFE1 | MAE1 | MFE5 | MAE5 | +1 before −1 | neither |')
    L.append('|---|---|---|---|---|---|---|---|')
    for c, x in desc['paths'].items():
        L.append(f'| {c} | {x["n"]} | {f3(x["MFE1"])} | {f3(x["MAE1"])} | {f3(x["MFE5"])} | {f3(x["MAE5"])} | '
                 f'{f3(x["plus1_before_minus1"])} | {f3(x["neither_in_5"])} |')
    L.append('\n### Per family\n')
    L.append('| family | ' + ' | '.join(SCORED) + ' |')
    L.append('|---|' + '---|' * len(SCORED))
    for f, v in desc['per_family'].items():
        L.append(f'| {f} | ' + ' | '.join(f'{v[c]["value"]:+.3f} [{v[c]["lo"]:+.3f}, {v[c]["hi"]:+.3f}]' for c in SCORED) + ' |')
    ch = desc['per_instrument_chance']
    L.append(f'\n### Per instrument (BH q = 0.10): {ch["bh_passes"]} of {ch["tests"]} survive; nominal p < 0.05: '
             f'{ch["nominal_p05"]} vs {ch["expected"]:.1f} expected (P ≥ that by chance {ch["p_at_least"]:.3f}). '
             'Survivors are candidates for their own prereg, never results.\n')
    L.append('| inst | ' + ' | '.join(SCORED) + ' |')
    L.append('|---|' + '---|' * len(SCORED))
    for inst in cfg.insts:
        row = {x['cell']: x for x in desc['per_instrument'] if x['inst'] == inst}
        L.append(f'| {inst} | ' + ' | '.join(f'{row[c]["value"]:+.3f}{"*" if row[c]["bh_q10"] else ""}' for c in SCORED) + ' |')
    L.append('\n## Data drops\n')
    L.append('| inst | sigma days | valid day ones | dropped |')
    L.append('|---|---|---|---|')
    for i, v in drops.items():
        L.append(f'| {i} | {v["sigma_days"]} | {v["day_one_valid"]} | {v["day_one_dropped"]} |')
    L.append(f'\nPositive control: {pc["checks"]} (`positive_control.json`). Power table on the real setup dates: `power.json`.\n')
    L.append('## What this changes\n\n*(owner / banking session: fill in from prereg §8 for each verdict above)*\n')
    with open(os.path.join(cfg.out, 'RESULTS.md'), 'w') as f:
        f.write('\n'.join(L) + '\n')


# ───────────────────────────── self-test ─────────────────────────────

ST_INSTS = ('EURUSD', 'GBPUSD', 'GOLD', 'NQ')


def make_world(root, drift_after_strong, seed, start='2023-06-01'):
    """Synthetic M1 + part1_lines in the real layouts. In the planted world, a day that closes >= 1 sigma in the outer
    10% of its 07:00-21:00 range drifts on in its direction for the next 5 sessions (drift_after_strong sigma a day)."""
    rng = np.random.default_rng(seed)
    dates = pd.bdate_range(start, '2026-08-21')
    os.makedirs(f'{root}/analysis/output/vf3_stage_b', exist_ok=True)
    os.makedirs(f'{root}/m1', exist_ok=True)
    os.makedirs(f'{root}/idx', exist_ok=True)
    rows = []
    mins = np.arange(1440)
    for ii, inst in enumerate(ST_INSTS):
        n = len(dates)
        sig = np.round(0.5 * np.exp(0.15 * np.sin(np.arange(n) / 60 + ii)), 2)
        ev = rng.choice(['none', 'high', 'NFP', 'CPI', 'FOMC'], n, p=[0.55, 0.3, 0.05, 0.05, 0.05])
        ev = np.where(dates > pd.Timestamp('2026-07-02'), 'unknown', ev)
        sm = sig / 100 / math.sqrt(1440)
        lp = np.empty((n, 1440))
        x = math.log(100.0)
        carry = np.zeros(n + 6)                                        # drift (log units per minute) by day index
        for t in range(n):
            steps = rng.standard_normal(1440) * sm[t]
            # planted drift applies from 21:00 on the setup day to 21:00 five sessions later
            steps[:1260] += carry[t]
            steps[1260:] += carry[t + 1]
            p = x + np.cumsum(steps)
            lp[t] = p
            x = p[-1]
            o, c = math.exp(p[420]), math.exp(p[1259])
            hh, ll = math.exp(p[420:1260].max()), math.exp(p[420:1260].min())
            m = 100 * (c - o) / o
            if abs(m) / sig[t] >= 1.0 and drift_after_strong:
                s = 1.0 if m > 0 else -1.0
                q = (c - ll) / (hh - ll) if s > 0 else (hh - c) / (hh - ll)
                if q >= 0.90:
                    carry[t + 1:t + 6] += s * drift_after_strong * sig[t] / 100 / 1440
        close = np.exp(lp)
        openp = np.c_[np.r_[close[0, 0], close[:-1, -1]][:, None], close[:, :-1]]
        wig = np.abs(rng.normal(0, 0.3, close.shape)) * sm[:, None] * close
        hi = np.maximum(openp, close) + wig
        lo = np.minimum(openp, close) - wig
        loc = (np.asarray(dates.values, dtype='datetime64[m]')[:, None] + mins[None, :].astype('timedelta64[m]')).ravel()
        tl = pd.DatetimeIndex(loc).tz_localize('Europe/London', ambiguous='NaT', nonexistent='NaT')
        m1 = pd.DataFrame({'time': tl.tz_convert('UTC').tz_localize(None), 'open': openp.ravel(), 'high': hi.ravel(),
                           'low': lo.ravel(), 'close': close.ravel(), 'volume': 1})
        m1 = m1[m1.time.notna() & (m1.time < M1_CUTOFF_UTC)]
        extra = pd.DataFrame({'time': pd.to_datetime(['2026-08-21 20:30', '2026-08-24 09:00']), 'open': 1e6,
                              'high': 1e6, 'low': 1e6, 'close': 1e6, 'volume': 1})     # after the lockbox cut: poison
        m1 = pd.concat([m1, extra], ignore_index=True)
        m1.to_parquet(f'{root}/{"idx" if inst in IDX else "m1"}/{M1KEY[inst]}_m1.parquet', index=False)
        rows.append(pd.DataFrame({'inst': P1KEY[inst], 'date': dates.strftime('%Y-%m-%d'), 'oos': 1, 'event': ev,
                                  'pit_sig_used': sig, 'pit_oh_p50': np.round(0.62 * sig, 2), 'pit_ol_p50': np.round(0.62 * sig, 2),
                                  'pit_oh_p90': np.round(1.3 * sig, 2), 'pit_ol_p90': np.round(1.3 * sig, 2),
                                  'har_ann': sig * math.sqrt(252) * np.exp(rng.normal(0, 0.05, n)),
                                  'r_ocs': rng.normal(0, 1, n) * sig}))
    extra = rows[0].iloc[:1].assign(date='2026-08-24')                  # a sigma row after the lockbox: must be dropped
    pd.concat(rows + [extra]).to_parquet(f'{root}/analysis/output/vf3_stage_b/part1_lines.parquet', index=False)


def selftest():
    t0 = time.time()
    tmp = tempfile.mkdtemp(prefix='hdoc_selftest_')
    ok = True
    try:
        try:
            need(f'{tmp}/nope.parquet')
            print('FAIL missing-file check')
            ok = False
        except SystemExit as e:
            print('ok   missing file fails loudly:', str(e).strip().splitlines()[0])
        out = {}
        for name, dr in (('planted', 0.30), ('null', 0.0)):
            root = f'{tmp}/{name}'
            make_world(root, dr, seed=SEED + (0 if dr else 1))
            m1 = read_m1(f'{root}/m1/eurusd_m1.parquet')
            raw = pd.read_parquet(f'{root}/m1/eurusd_m1.parquet', columns=['time'])
            n_after = int((raw.time >= M1_CUTOFF_UTC).sum())
            assert m1.time.max() < M1_CUTOFF_UTC.tz_localize('UTC') and m1.high.max() < 1e5
            print(f'ok   [{name}] lockbox: {n_after} poison bars at/after the cut on disk, 0 read')
            cfg = Cfg(root=root, m1_root=f'{root}/m1', index_root=f'{root}/idx', out=f'{root}/out', insts=ST_INSTS,
                      B=400, shift_step=15, n_mc=90, pc_B=300, pc_shift_step=25, quiet=True)
            if name == 'planted':                                       # a missing M1 file stops the run
                os.rename(f'{root}/idx/nq_m1.parquet', f'{root}/idx/nq_m1.bak')
                try:
                    run(cfg)
                    print('FAIL run with a missing M1 file did not stop')
                    ok = False
                except SystemExit as e:
                    print('ok   run stops on a missing M1 file:', str(e).strip().splitlines()[0])
                os.rename(f'{root}/idx/nq_m1.bak', f'{root}/idx/nq_m1.parquet')
            cells = run(cfg)
            out[name] = cells
            for c in SCORED:
                r = cells[c]
                print(f"     [{name}] {c:7s} P̄ {r['value']:+.3f} [{r['lo']:+.3f}, {r['hi']:+.3f}] Holm p {r['p_holm']:.3f} "
                      f"placebo pct {r['placebo']['pct']:.0f} gates {''.join('Y' if v else '-' for v in r['gates'].values())} "
                      f"-> {r['verdict']}")
            assert os.path.exists(f'{root}/out/RESULTS.md') and os.path.exists(f'{root}/out/results.json')
            js = json.load(open(f'{root}/out/results.json'))
            assert js['sample']['end'] <= '2026-08-21', 'sample runs past the lockbox'
        p = out['planted']
        if p['run']['verdict'] == 'VALIDATED' and p['hold-r']['verdict'] == 'VALIDATED':
            print('ok   planted continuation recovered: run and hold-r VALIDATED')
        else:
            print('FAIL planted continuation not recovered')
            ok = False
        if p['close']['value'] > 0 and p['close']['gates']['G1']:
            print('ok   planted world: STRONG beats MID (close G1)')
        else:
            print('FAIL planted world: close contrast not found')
            ok = False
        nv = out['null']
        if all(nv[c]['verdict'] != 'VALIDATED' for c in SCORED):
            print('ok   null world: nothing VALIDATED')
        else:
            print('FAIL null world validated a cell')
            ok = False
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"SELFTEST {'PASSED' if ok else 'FAILED'} ({time.time() - t0:.0f}s)")
    return 0 if ok else 1


def main():
    here = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--selftest', action='store_true', help='synthetic data only; planted / null / lockbox / missing file')
    ap.add_argument('--root', default=os.environ.get('MFX_DATA_ROOT', here), help='repo checkout holding the input files')
    ap.add_argument('--m1-root', default=None, help='FX + gold M1 dir (default <root>/VolRangeForecaster/data/m1)')
    ap.add_argument('--index-root', default=None, help='index M1 dir (default <root>/portfolioBacktest/cache)')
    ap.add_argument('--out', default=None, help=f'output dir (default <root>/analysis/output/{SLUG})')
    a = ap.parse_args()
    if a.selftest:
        sys.exit(selftest())
    cfg = Cfg(root=a.root, m1_root=a.m1_root or os.path.join(a.root, 'VolRangeForecaster/data/m1'),
              index_root=a.index_root or os.path.join(a.root, 'portfolioBacktest/cache'),
              out=a.out or os.path.join(a.root, 'analysis/output', SLUG))
    run(cfg)


if __name__ == '__main__':
    main()
