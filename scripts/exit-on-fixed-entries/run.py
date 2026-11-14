#!/usr/bin/env python3
"""exit-on-fixed-entries runner — forge/EXIT_ON_FIXED_ENTRIES_PREREG.md (seed 20261114).

    python -I scripts/exit-on-fixed-entries/run.py --selftest   # synthetic paths only (prereg 3.9 item 2)
    python -I scripts/exit-on-fixed-entries/run.py              # the registered run (laptop: local bid/ask M1)

Order of the real run (prereg 3.9):
  1. the synthetic positive control (same code as the scored run); abort on failure (--skip-selftest to skip when
     it has just been run on its own);
  2. read local bid/ask M1 only (data/m1_bidask/<key>_m1.parquet), hard cut before 2026-08-21 21:00 UTC (22:00 London,
     the end of the last lockbox-eligible london22 session), asserted; missing file/column -> stop;
  3. build the fixed 07:00 London entries (4h EMA20 slope side, as scripts/h4-trend-hold/backtest.py, no flat rule),
     both sides of every entry, exits E0..E4 on the real M1 path with bid/ask fills;
  4. the MFE/MAE map is written first (map.json), then the lesson-27 design check, the binding power rule from the
     shifted-side placebo (written before any real Delta is computed), the reconciliation with h4-trend-hold, and
     only then the scored Delta per exit, Holm, the gate, the descriptive slices;
  5. analysis/output/exit-on-fixed-entries/{RESULTS.md, results.json, map.json, selftest.json}.
Local files only: never R2, never a loader that merges the nightly tail. Writes only under --out.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import time
from datetime import date, datetime, timedelta
from functools import lru_cache
from pathlib import Path
from statistics import NormalDist
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
SLUG = 'exit-on-fixed-entries'
PREREG = 'forge/EXIT_ON_FIXED_ENTRIES_PREREG.md'
SEED = 20261114
LOCKBOX = date(2026, 8, 21)                               # last London session that may be read
M1_CUTOFF_UTC = pd.Timestamp('2026-08-21 21:00:00')       # 22:00 London (BST): end of the 2026-08-21 london22 window
LON = ZoneInfo('Europe/London')
NY = ZoneInfo('America/New_York')
ND = NormalDist()

INSTS = ['GOLD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCAD', 'AUDUSD', 'NZDUSD', 'USDCHF', 'EURJPY', 'GBPJPY',
         'NAS100', 'SPX500', 'US30']
M1KEY = {'GOLD': 'gold', 'EURUSD': 'eurusd', 'GBPUSD': 'gbpusd', 'USDJPY': 'usdjpy', 'USDCAD': 'usdcad',
         'AUDUSD': 'audusd', 'NZDUSD': 'nzdusd', 'USDCHF': 'usdchf', 'EURJPY': 'eurjpy', 'GBPJPY': 'gbpjpy',
         'NAS100': 'nq', 'SPX500': 'spx', 'US30': 'dow'}
OANDA = {'GOLD': 'XAU_USD', 'EURUSD': 'EUR_USD', 'GBPUSD': 'GBP_USD', 'USDJPY': 'USD_JPY', 'USDCAD': 'USD_CAD',
         'AUDUSD': 'AUD_USD', 'NZDUSD': 'NZD_USD', 'USDCHF': 'USD_CHF', 'EURJPY': 'EUR_JPY', 'GBPJPY': 'GBP_JPY',
         'NAS100': 'NAS100_USD', 'SPX500': 'SPX500_USD', 'US30': 'US30_USD'}
GROUP = lambda a: 'gold' if a == 'GOLD' else ('indices' if a in ('NAS100', 'SPX500', 'US30') else 'fx')
GROUPS = ['gold', 'fx', 'indices']
COLS = ['time', 'open', 'high', 'low', 'close', 'bid_o', 'bid_h', 'bid_l', 'bid_c', 'ask_o', 'ask_h', 'ask_l', 'ask_c']

SCORED = ['E1', 'E2', 'E3_2', 'E3_3', 'E3_5', 'E4']
ALL_EXITS = ['E0'] + SCORED
FRI = ['E2f', 'E3_2f', 'E3_3f', 'E3_5f', 'E4f']           # descriptive: E2-E4 Friday-flat
BAR = 0.05                                               # pass bar, R per entry (prereg 4)
Z_MDE = 3.48                                             # z(1 - 0.05/6/2) + z(0.80)
B_BOOT, BLOCK, N_SHIFT = 2000, 21, 500
SHIFT_RANGE = (21, 250)
H4_DAY_REF = -0.042                                      # h4-trend-hold DAY, 2026-02-26 -> 2026-08-20
RECON_WINDOW = (date(2026, 2, 26), date(2026, 8, 20))
BIG = 1 << 60


# ----------------------------------------------------------------------------------------------------- data
def die(msg):
    print(f'\nSTOP: {msg}', file=sys.stderr)
    raise SystemExit(2)


def load_instrument(path: Path) -> dict:
    if not path.exists():
        die(f'MISSING DATA FILE: {path}')
    import pyarrow.parquet as pq
    names = pq.ParquetFile(path).schema_arrow.names
    miss = [c for c in COLS if c not in names]
    if miss:
        die(f'{path}: missing columns {miss} (need research schema + bid/ask, prereg header)')
    try:
        df = pd.read_parquet(path, columns=COLS, filters=[('time', '<', M1_CUTOFF_UTC)])
    except Exception:                                    # filter type mismatch on odd files: read, then cut
        df = pd.read_parquet(path, columns=COLS)
    t = pd.to_datetime(df['time'])
    if getattr(t.dt, 'tz', None) is not None:
        t = t.dt.tz_convert('UTC').dt.tz_localize(None)
    df = df.assign(time=t)
    df = df[df['time'] < M1_CUTOFF_UTC].sort_values('time').drop_duplicates('time')
    if df.empty:
        die(f'{path}: no rows before the cutoff')
    if df['time'].min().year < 2000:
        die(f'{path}: timestamps look like 1970 (BAM column-order fault, data-rules)')
    df = df.dropna(subset=COLS[1:])
    out = {'t': df['time'].values.astype('datetime64[s]').astype(np.int64)}
    for c, k in zip(COLS[1:], ['mo', 'mh', 'ml', 'mc', 'bo', 'bh', 'bl', 'bc', 'ao', 'ah', 'al', 'ac']):
        out[k] = df[c].to_numpy(np.float64)
    assert out['t'].max() < int(M1_CUTOFF_UTC.timestamp()), 'lockbox: a bar at/after the cutoff was read'
    return out


def load_financing(names):
    p = ROOT / 'Oanda Parquet Files' / 'Bid and Ask' / 'instrument_meta_log.parquet'
    if not p.exists():
        die(f'MISSING DATA FILE: {p} (financing snapshot, prereg 3.5)')
    m = pd.read_parquet(p)
    out = {}
    for a in names:
        r = m[m['name'] == OANDA[a]]
        if r.empty:
            die(f'{p}: no financing row for {OANDA[a]}')
        r = r.iloc[-1]
        out[a] = (float(r['financing_long_rate']), float(r['financing_short_rate']), int(r['financing_days_wed']))
    return out


def load_events():
    """US tier-1 (CPI, NFP, PPI, FOMC) release dates. Deduplicated (data-rules fault #11). Returns (dates, last_covered)."""
    old = ROOT / 'calendar_events.csv'
    new = ROOT / 'calendar_events_nasdaq.csv'
    if not old.exists():
        die(f'MISSING DATA FILE: {old}')
    df = pd.read_csv(old, encoding='latin-1', low_memory=False).drop_duplicates()
    if new.exists():
        n = pd.read_csv(new, dtype=str)
        n = n[(n.get('status') == 'released') & (n['date'] > '2026-07-02')] if 'status' in n else n[n['date'] > '2026-07-02']
        df = pd.concat([df, n], ignore_index=True)
    df = df[df['country'] == 'United States']
    pat = (r'(?i)(consumer price index|\bcpi\b|non.?farm|producer price|\bppi\b|fomc|fed interest rate decision|'
           r'federal funds rate)')
    ev = df[df['event'].astype(str).str.contains(pat, regex=True)]
    d = pd.to_datetime(ev['datetime_raw'], errors='coerce').dropna().dt.date
    last = pd.to_datetime(df['date'], errors='coerce').max().date()
    return set(d), last


# ----------------------------------------------------------------------------------------------------- clocks
@lru_cache(maxsize=None)
def lon_epoch(d: date, hh: int, mm: int = 0) -> int:
    return int(datetime(d.year, d.month, d.day, hh, mm, tzinfo=LON).timestamp())


def weekdays(a: date, b: date):
    out, d = [], a
    while d <= b:
        if d.weekday() < 5:
            out.append(d)
        d += timedelta(1)
    return out


def rollover_table(a: date, b: date):
    """17:00 New York rollovers on weekdays: (epochs, is_wednesday)."""
    ep, wed = [], []
    for d in weekdays(a - timedelta(3), b + timedelta(10)):
        ep.append(int(datetime(d.year, d.month, d.day, 17, tzinfo=NY).timestamp()))
        wed.append(d.weekday() == 2)
    return np.array(ep, np.int64), np.array(wed)


# ----------------------------------------------------------------------------------------------------- per instrument
class Inst:
    def __init__(self, name, d, n_min_daily=60):
        self.name, self.d = name, d
        t = d['t']
        self.t = t
        hr = t // 3600
        last = np.r_[np.nonzero(np.diff(hr))[0], len(t) - 1]
        self.h1_t = hr[last] * 3600
        self.h1_c = d['mc'][last]
        self.h1_end = self.h1_t + 3600
        # NY-close daily bars (17:00 New York), from M1 mid, n >= n_min_daily
        ny = pd.DatetimeIndex(pd.to_datetime(t, unit='s', utc=True)).tz_convert(NY) + pd.Timedelta(hours=7)
        key = ny.normalize()
        kk = key.asi8
        brk = np.r_[np.nonzero(kk[1:] != kk[:-1])[0], len(t) - 1]
        start = np.r_[0, brk[:-1] + 1]
        n = brk - start + 1
        ends = np.array([int(datetime(k.year, k.month, k.day, 17, tzinfo=NY).timestamp()) for k in key[brk]], np.int64)
        ok = n >= n_min_daily
        self.d_end, self.d_close = ends[ok], d['mc'][brk][ok]

    def idx(self, T):
        return int(np.searchsorted(self.t, T, 'left'))

    def slope(self, T):
        """S.slope() of scripts/h4-trend-hold/backtest.py: H1 bars closed by T, 4h UTC buckets, EMA20 now minus EMA20
        without the last 3 buckets (current bucket partial)."""
        i = int(np.searchsorted(self.h1_end, T, 'right'))
        if i < 400:
            return 0
        bt = self.h1_t[i - 320:i] // 14400
        bc = self.h1_c[i - 320:i]
        lastb = np.r_[np.nonzero(np.diff(bt))[0], len(bt) - 1]
        out = bc[lastb]
        dlt = _ema(out) - _ema(out[:-3])
        return 0 if dlt == 0 else (1 if dlt > 0 else -1)

    def sigma(self, T):
        j = int(np.searchsorted(self.d_end, T, 'right'))
        if j < 21:
            return None
        c = self.d_close[j - 21:j]
        r = np.diff(np.log(c))
        s = float(np.std(r, ddof=1))
        return s if s > 0 else None


def _ema(xs, n=20):
    k, e = 2 / (n + 1), None
    for x in xs:
        e = x if e is None else e + k * (x - e)
    return e


def _first(mask):
    return int(mask.argmax()) if mask.any() else BIG


# ----------------------------------------------------------------------------------------------------- exits
def run_exits(ro, rl, rh, x21, s0, trail, fri, rev_ok, stopR):
    """All rel. to the entry bar (index 0). ro/rl/rh: exit-side open/adverse/favourable in R. x21[k]: first bar at/after
    21:00 of session k+1; s0[j]: first bar at/after 00:00 of session j+1 (j>=1); trail[j]: prior-session level in R
    (j>=1). Returns {exit: (R, exit_bar, partial_bar or None)}."""
    cap = x21[4]
    b0 = _first(rl[:cap] <= -stopR)

    def timed(x):
        if b0 < x:
            return min(-stopR, ro[b0]), b0
        return ro[x], x

    out = {'E0': timed(x21[0]) + (None,)}
    for N in (2, 3, 5):
        out[f'E3_{N}'] = timed(x21[N - 1]) + (None,)
    k = 4
    for j in range(4):
        if fri[j] or not rev_ok[j]:
            k = j
            break
    out['E1'] = timed(x21[k]) + (None,)
    L = np.full(cap, -stopR)
    for j in range(1, 5):
        a = s0[j]
        if a < cap and np.isfinite(trail[j]):
            np.maximum(L[a:], trail[j], out=L[a:])
    capf = cap
    for j in range(5):
        if fri[j]:
            capf = x21[j]
            break
    up_all = rh[:cap] >= 1.0
    for tag, c in (('', cap), ('f', capf)):
        b = _first(rl[:c] <= L[:c])
        r2, x2 = (min(L[b], ro[b]), b) if b < c else (ro[c], c)
        out['E2' + tag] = (r2, x2, None)
        up = _first(up_all[:c])
        out['E4' + tag] = ((0.5 + 0.5 * r2), x2, up) if up < x2 else (r2, x2, None)
        if tag:
            for N in (2, 3, 5):
                out[f'E3_{N}f'] = timed(min(x21[N - 1], capf)) + (None,)
    return out


def path_map(ro, rl, rh, x21, t_rel_h):
    m = {}
    for k in range(5):
        x = x21[k]
        m[f'mfe{k + 1}'] = float(rh[:x].max()) if x > 0 else 0.0
        m[f'mae{k + 1}'] = float(rl[:x].min()) if x > 0 else 0.0
        m[f'r21_{k + 1}'] = float(ro[x])
    cap = x21[4]
    up, dn = _first(rh[:cap] >= 1), _first(rl[:cap] <= -1)
    m['up_first'] = float(up < dn)
    m['t_mfe_h'] = float(t_rel_h[int(rh[:cap].argmax())]) if cap > 0 else 0.0
    return m


# ----------------------------------------------------------------------------------------------------- entries
def build(insts: dict, opts: dict):
    """Every eligible (instrument, weekday) entry, both sides, both price bases. Returns (entries DataFrame,
    per-entry arrays dict, counts)."""
    stopR = opts.get('stopR', 1.0)
    force = opts.get('force_side')
    fin = opts.get('financing') or {}
    recs, counts = [], {}
    for a, I in insts.items():
        c = {'days': 0, 'no_0700_bar': 0, 'slope_zero_or_warmup': 0, 'no_sigma': 0, 'path_beyond_data': 0,
             'late_21_fill_gt60m': 0, 'entries': 0}
        t = I.t
        first_d = datetime.fromtimestamp(int(t[0]), LON).date()
        last_d = min(datetime.fromtimestamp(int(t[-1]), LON).date(), opts.get('last_session', LOCKBOX))
        days = weekdays(first_d, last_d)
        lo22, hi22 = {}, {}
        for D in days:
            i0, i1 = I.idx(lon_epoch(D, 0)), I.idx(lon_epoch(D, 22))
            lo22[D] = I.d['ml'][i0:i1].min() if i1 > i0 else np.nan
            hi22[D] = I.d['mh'][i0:i1].max() if i1 > i0 else np.nan
        flong, fshort, fwed = fin.get(a, (0.0, 0.0, 1))
        for k, D in enumerate(days):
            c['days'] += 1
            if k + 4 >= len(days):
                c['path_beyond_data'] += 1
                continue
            S = days[k:k + 5]
            assert S[-1] <= LOCKBOX, 'lockbox: a path session after 2026-08-21'
            T7 = lon_epoch(D, 7)
            e = I.idx(T7)
            if e >= len(t) or t[e] >= lon_epoch(D, 8):
                c['no_0700_bar'] += 1
                continue
            sgn = I.slope(T7)
            if sgn == 0:
                c['slope_zero_or_warmup'] += 1
                continue
            sig = I.sigma(T7)
            if sig is None:
                c['no_sigma'] += 1
                continue
            T21 = [lon_epoch(x, 21) for x in S]
            x21a = [I.idx(T) for T in T21]
            if x21a[4] >= len(t):
                c['path_beyond_data'] += 1
                continue
            if any(t[x] - T > 3600 for x, T in zip(x21a, T21)):
                c['late_21_fill_gt60m'] += 1
            s0a = [None] + [I.idx(lon_epoch(x, 0)) for x in S[1:]]
            rev = [I.slope(T21[j]) == sgn for j in range(4)]
            fri = [x.weekday() == 4 for x in S]
            cap = x21a[4]
            sl = slice(e, cap + 1)
            d = I.d
            x21 = [x - e for x in x21a]
            s0 = [None] + [x - e for x in s0a[1:]]
            t_rel_h = (t[sl] - t[e]) / 3600.0
            mid0 = d['mo'][e]
            Rp = sig * mid0
            rec = {'inst': a, 'date': D, 'sig': sig, 'slope': sgn, 't_entry': int(t[e])}
            for side in (1, -1):
                tag = 'L' if side == 1 else 'S'
                for base in ('q', 'm'):
                    if base == 'q':
                        E = d['ao'][e] if side == 1 else d['bo'][e]
                        if side == 1:
                            ro, rl, rh = (d['bo'][sl] - E) / Rp, (d['bl'][sl] - E) / Rp, (d['bh'][sl] - E) / Rp
                        else:
                            ro, rl, rh = (E - d['ao'][sl]) / Rp, (E - d['ah'][sl]) / Rp, (E - d['al'][sl]) / Rp
                    else:
                        E = mid0
                        if side == 1:
                            ro, rl, rh = (d['mo'][sl] - E) / Rp, (d['ml'][sl] - E) / Rp, (d['mh'][sl] - E) / Rp
                        else:
                            ro, rl, rh = (E - d['mo'][sl]) / Rp, (E - d['mh'][sl]) / Rp, (E - d['ml'][sl]) / Rp
                    trail = [np.nan] + [((lo22[S[j - 1]] - E) if side == 1 else (E - hi22[S[j - 1]])) / Rp
                                        for j in range(1, 5)]
                    ex = run_exits(ro, rl, rh, x21, s0, trail, fri, rev, stopR)
                    for nm, (r, xb, pb) in ex.items():
                        rec[f'{nm}_{tag}{base}'] = float(r)
                        if base == 'q':
                            rate = flong if side == 1 else fshort
                            te = int(t[e])
                            tx = int(t[e + xb])
                            nd = _rolls(opts['roll'], te, tx, fwed)
                            if pb is not None:
                                nd = 0.5 * nd + 0.5 * _rolls(opts['roll'], te, int(t[e + pb]), fwed)
                            rec[f'{nm}_{tag}fin'] = rate * nd / 365.0 / sig
                            rec[f'{nm}_{tag}hold_h'] = (tx - te) / 3600.0
                    if base == 'q':
                        for kk, v in path_map(ro, rl, rh, x21, t_rel_h).items():
                            rec[f'map_{kk}_{tag}'] = v
            if force is not None:
                rec['slope'] = force
            recs.append(rec)
            c['entries'] += 1
        counts[a] = c
    if not recs:
        die('no entries built')
    return pd.DataFrame(recs), counts


def _rolls(roll, te, tx, wed_days):
    ep, wed = roll
    i0, i1 = np.searchsorted(ep, te, 'right'), np.searchsorted(ep, tx, 'right')
    w = wed[i0:i1]
    return float((~w).sum() + wed_days * w.sum())


# ----------------------------------------------------------------------------------------------------- statistics
def holm(p):
    p = np.asarray(p, float)
    o = np.argsort(p)
    m = len(p)
    adj = np.empty(m)
    run = 0.0
    for r, i in enumerate(o):
        run = max(run, min(1.0, (m - r) * p[i]))
        adj[i] = run
    return adj


def bh(p, q=0.10):
    p = np.asarray(p, float)
    m = len(p)
    o = np.argsort(p)
    thr = q * (np.arange(1, m + 1)) / m
    ok = p[o] <= thr
    k = np.nonzero(ok)[0].max() + 1 if ok.any() else 0
    passed = np.zeros(m, bool)
    passed[o[:k]] = True
    return passed


def chance_baseline(tests, passes, alpha=0.10):
    from math import comb
    tail = sum(comb(tests, k) * alpha ** k * (1 - alpha) ** (tests - k) for k in range(passes, tests + 1))
    return {'tests': tests, 'passes': passes, 'alpha': alpha, 'expected': tests * alpha,
            'pAtLeastObserved': min(1.0, tail)}


class Boot:
    """Entry-date block bootstrap: blocks of BLOCK consecutive entry dates, all instruments together."""

    def __init__(self, dates, rng, B=B_BOOT):
        ud = np.array(sorted(set(dates)))
        pos = {d: i for i, d in enumerate(ud)}
        self.blk = np.array([pos[d] // BLOCK for d in dates])
        self.nb = int(self.blk.max()) + 1
        self.idx = rng.integers(0, self.nb, (B, self.nb))

    def stat(self, x, mask=None):
        w = np.ones_like(x) if mask is None else mask.astype(float)
        xs = np.where(w > 0, x, 0.0)
        sums = np.bincount(self.blk, weights=xs, minlength=self.nb)
        cnts = np.bincount(self.blk, weights=w, minlength=self.nb)
        n = cnts[self.idx].sum(1)
        bm = sums[self.idx].sum(1) / np.where(n > 0, n, np.nan)
        m = xs.sum() / max(w.sum(), 1)
        se = float(np.nanstd(bm, ddof=1))
        pb = 2 * min(np.nanmean(bm <= 0), np.nanmean(bm >= 0))
        pb = max(pb, 1 / len(bm))
        pn = 2 * (1 - ND.cdf(abs(m) / se)) if se > 0 else 1.0
        lo, hi = np.nanpercentile(bm, [2.5, 97.5])
        return {'mean': float(m), 'se': se, 'lo': float(lo), 'hi': float(hi), 'p_boot': float(min(1, pb)),
                'p_normal': float(pn), 'n': int(w.sum())}


def summ(r):
    r = np.asarray(r, float)
    n = len(r)
    if n == 0:
        return {'n': 0}
    w, l = r[r > 0], r[r <= 0]
    top = np.sort(r)[::-1][:max(1, n // 10)]
    tot = r.sum()
    return {'n': n, 'mean': float(r.mean()), 'win': float((r > 0).mean()),
            'payoff': float(w.mean() / abs(l.mean())) if len(w) and len(l) and l.mean() != 0 else None,
            'top10_sum': float(top.sum()), 'total': float(tot),
            'top10_share_of_total': float(top.sum() / tot) if tot != 0 else None}


# ----------------------------------------------------------------------------------------------------- scoring
def score(df: pd.DataFrame, opts: dict, rng, log=print):
    res = {}
    dates = df['date'].tolist()
    s = df['slope'].to_numpy()
    p = df.groupby('inst')['slope'].transform(lambda x: (x > 0).mean()).to_numpy()
    res['long_share'] = df.groupby('inst')['slope'].apply(lambda x: float((x > 0).mean())).to_dict()
    boot = Boot(dates, rng)

    def side_pick(col_L, col_S, sides=s):
        return np.where(sides > 0, df[col_L].to_numpy(), df[col_S].to_numpy())

    D_L = {x: df[f'{x}_Lq'].to_numpy() - df['E0_Lq'].to_numpy() for x in SCORED + FRI}
    D_S = {x: df[f'{x}_Sq'].to_numpy() - df['E0_Sq'].to_numpy() for x in SCORED + FRI}
    Dr = {x: p * D_L[x] + (1 - p) * D_S[x] for x in SCORED + FRI}
    # gross (mid) for the design check
    gL = {x: df[f'{x}_Lm'].to_numpy() - df['E0_Lm'].to_numpy() for x in SCORED}
    gS = {x: df[f'{x}_Sm'].to_numpy() - df['E0_Sm'].to_numpy() for x in SCORED}

    # ---- 1. lesson #27 design check: gross Dr ~ 0 on random entries
    design = {}
    for x in SCORED:
        st = boot.stat(p * gL[x] + (1 - p) * gS[x])
        st['spread_cost_diff'] = float((Dr[x] - (p * gL[x] + (1 - p) * gS[x])).mean())
        st['fault'] = abs(st['mean']) > 3 * st['se']
        design[x] = st
    res['design_check'] = design
    if any(v['fault'] for v in design.values()) and not opts.get('ignore_design'):
        res['stopped'] = 'design fault (prereg 3.6): gross random-entry Dr beyond 3 SE'
        return res

    # ---- 2. binding power rule from the shifted-side placebo (no real side alignment)
    inst = df['inst'].to_numpy()
    order = {a: np.nonzero(inst == a)[0] for a in df['inst'].unique()}   # df is in date order per instrument
    offs = rng.integers(SHIFT_RANGE[0], SHIFT_RANGE[1] + 1, N_SHIFT)
    shift_means = {x: np.empty(N_SHIFT) for x in SCORED}
    first_shift_side = None
    for k, o in enumerate(offs):
        s2 = s.copy()
        for a, ix in order.items():
            s2[ix] = np.roll(s[ix], int(o))
        if k == 0:
            first_shift_side = s2.copy()
        for x in SCORED:
            shift_means[x][k] = (np.where(s2 > 0, D_L[x], D_S[x]) - Dr[x]).mean()
    power = {}
    for x in SCORED:
        sd = float(np.std(shift_means[x], ddof=1))
        bse = boot.stat(np.where(first_shift_side > 0, D_L[x], D_S[x]) - Dr[x])['se']
        mde = Z_MDE * max(sd, bse)
        power[x] = {'shift_sd': sd, 'boot_se_shifted': bse, 'mde': mde,
                    'verdict': 'POWERED' if mde <= BAR else 'UNDERPOWERED'}
    res['power_binding'] = power
    log('binding power rule (written before any real Delta): ' +
        ', '.join(f"{x} MDE {v['mde']:.3f} {v['verdict']}" for x, v in power.items()))
    if opts.get('power_callback'):
        opts['power_callback'](res)

    # ---- 3. reconciliation with h4-trend-hold (E0, mid + 0.03R)
    dd = df['date'].to_numpy()
    w = np.array([RECON_WINDOW[0] <= d <= RECON_WINDOW[1] for d in dd])
    if w.any():
        e0m = side_pick('E0_Lm', 'E0_Sm')[w] - 0.03
        res['reconciliation'] = {'n': int(w.sum()), 'E0_mid_minus_0.03': float(e0m.mean()), 'h4_trend_hold_DAY': H4_DAY_REF,
                                 'gap': float(e0m.mean() - H4_DAY_REF), 'flag_gt_0.03': bool(abs(e0m.mean() - H4_DAY_REF) > 0.03)}
    else:
        res['reconciliation'] = {'n': 0, 'note': 'window not in sample (selftest)'}

    # ---- 4. the scored Delta
    med = sorted(dates)[len(dates) // 2]
    half1 = np.array([d <= med for d in dates])
    grp = np.array([GROUP(a) for a in inst])
    cells = {}
    for x in SCORED:
        delta = np.where(s > 0, D_L[x], D_S[x]) - Dr[x]
        st = boot.stat(delta)
        rk = abs(st['mean'])
        p_shift = (1 + int((np.abs(shift_means[x]) >= rk).sum())) / (N_SHIFT + 1)
        pct = float((shift_means[x] < st['mean']).mean() * 100)
        se_used = max(st['se'], power[x]['shift_sd'])
        st.update({'p_shift': p_shift, 'shift_percentile': pct, 'se_used': se_used,
                   'p_used': max(st['p_boot'], p_shift),
                   't': st['mean'] / se_used if se_used > 0 else None,
                   'half1': float(delta[half1].mean()), 'half2': float(delta[~half1].mean()),
                   'groups': {g: float(delta[grp == g].mean()) if (grp == g).any() else None for g in GROUPS},
                   'D_slope': float(np.where(s > 0, D_L[x], D_S[x]).mean()), 'D_random': float(Dr[x].mean()),
                   'D_counter': float(np.where(s > 0, D_S[x], D_L[x]).mean())})
        cells[x] = st
    hp = holm([cells[x]['p_used'] for x in SCORED])
    for x, h in zip(SCORED, hp):
        c = cells[x]
        c['p_holm'] = float(h)
        gpos = sum(1 for g in GROUPS if c['groups'][g] is not None and c['groups'][g] > 0)
        c['gate'] = {'delta_ge_bar': c['mean'] >= BAR, 'holm_lt_0.05': h < 0.05,
                     'both_halves_pos': c['half1'] > 0 and c['half2'] > 0, 'groups_pos_ge2': gpos >= 2}
        c['pass'] = all(c['gate'].values())
        c['verdict'] = ('UNDERPOWERED' if power[x]['verdict'] == 'UNDERPOWERED' else
                        ('VALIDATED' if c['pass'] else 'NULL'))
        c['promotion_t_ge_3'] = bool(c['t'] is not None and c['t'] >= 3)
    res['cells'] = cells
    res['half_split_date'] = str(med)
    vs = [cells[x]['verdict'] for x in SCORED]
    res['verdict'] = ('VALIDATED' if 'VALIDATED' in vs else
                      ('UNDERPOWERED' if all(v == 'UNDERPOWERED' for v in vs) else 'NULL'))
    passing = [x for x in SCORED if cells[x]['verdict'] == 'VALIDATED']
    res['best_exit'] = max(passing, key=lambda x: cells[x]['mean']) if passing else None

    # ---- 5. descriptive
    coin = rng.random(len(df)) < p
    rnd_side = np.where(coin, 1, -1)
    raw = {}
    for x in ALL_EXITS + FRI:
        sl = side_pick(f'{x}_Lq', f'{x}_Sq')
        fin = side_pick(f'{x}_Lfin', f'{x}_Sfin')
        raw[x] = {'slope': summ(sl), 'slope_plus_financing': summ(sl + fin),
                  'random_book': summ(side_pick(f'{x}_Lq', f'{x}_Sq', rnd_side)),
                  'counter': summ(side_pick(f'{x}_Sq', f'{x}_Lq')),
                  'hold_hours_mean': float(side_pick(f'{x}_Lhold_h', f'{x}_Shold_h').mean())}
    res['raw'] = raw
    fin_cells = {}
    for x in SCORED:
        fL = df[f'{x}_Lfin'].to_numpy() - df['E0_Lfin'].to_numpy()
        fS = df[f'{x}_Sfin'].to_numpy() - df['E0_Sfin'].to_numpy()
        dn = np.where(s > 0, D_L[x] + fL, D_S[x] + fS) - (p * (D_L[x] + fL) + (1 - p) * (D_S[x] + fS))
        m = float(dn.mean())
        fin_cells[x] = {'delta_spread_plus_financing': m, 'sign_flip': (m > 0) != (cells[x]['mean'] > 0)}
    res['financing_layer'] = fin_cells
    fri_cells = {}
    for x in FRI:
        fri_cells[x] = boot.stat(np.where(s > 0, D_L[x], D_S[x]) - Dr[x])
    res['friday_flat_sensitivity'] = fri_cells

    # slices with BH q = 0.10
    sl_rows = []
    sig = df['sig'].to_numpy()
    reg = np.full(len(df), 'unknown', dtype=object)
    for a, ix in order.items():
        sv = pd.Series(sig[ix])
        medp = sv.shift(1).rolling(250, min_periods=250).median().to_numpy()
        reg[ix] = np.where(np.isnan(medp), 'unknown', np.where(sig[ix] > medp, 'sigma_above', 'sigma_below'))
    ev = opts.get('events')
    evl = np.full(len(df), 'unknown', dtype=object)
    if ev is not None:
        evd, last = ev
        for i, d in enumerate(dates):
            nxt = d + timedelta(3 if d.weekday() == 4 else 1)
            if nxt <= last:
                evl[i] = 'event' if (d in evd or nxt in evd) else 'no_event'
    yr = np.array([d.year for d in dates])
    slices = [('inst', a, inst == a) for a in order] + [('group', g, grp == g) for g in GROUPS] + \
             [('sigma', r, reg == r) for r in ('sigma_above', 'sigma_below')] + \
             [('event', r, evl == r) for r in ('event', 'no_event')]
    for x in SCORED:
        delta = np.where(s > 0, D_L[x], D_S[x]) - Dr[x]
        for kind, lab, m in slices:
            if m.sum() < 30:
                continue
            st = boot.stat(delta, m)
            sl_rows.append({'exit': x, 'kind': kind, 'slice': lab, **st})
        for y in sorted(set(yr)):
            sl_rows.append({'exit': x, 'kind': 'year', 'slice': int(y), 'mean': float(delta[yr == y].mean()),
                            'n': int((yr == y).sum())})
    tested = [r for r in sl_rows if r['kind'] in ('inst', 'sigma', 'event') and 'p_boot' in r]
    if tested:
        ok = bh([r['p_boot'] for r in tested])
        for r, o in zip(tested, ok):
            r['bh_q10'] = bool(o)
        res['slices_chance_baseline'] = chance_baseline(len(tested), int(ok.sum()))
    res['slices'] = sl_rows
    res['counts_unknown'] = {'sigma_regime_unknown': int((reg == 'unknown').sum()),
                             'event_unknown': int((evl == 'unknown').sum())}
    return res


def map_table(df):
    out = {}
    s = df['slope'].to_numpy()
    p = df.groupby('inst')['slope'].transform(lambda x: (x > 0).mean()).to_numpy()
    for k in range(1, 6):
        for q in ('mfe', 'mae', 'r21_'):
            col = f'{q}{k}'
            L, S = df[f'map_{col}_L'].to_numpy(), df[f'map_{col}_S'].to_numpy()
            sl = np.where(s > 0, L, S)
            co = np.where(s > 0, S, L)
            rn = p * L + (1 - p) * S
            out[col] = {'slope_q': np.percentile(sl, [10, 25, 50, 75, 90]).round(4).tolist(),
                        'counter_q': np.percentile(co, [10, 25, 50, 75, 90]).round(4).tolist(),
                        'slope_mean': float(sl.mean()), 'random_mean': float(rn.mean()), 'counter_mean': float(co.mean())}
    for col in ('up_first', 't_mfe_h'):
        L, S = df[f'map_{col}_L'].to_numpy(), df[f'map_{col}_S'].to_numpy()
        out[col] = {'slope_mean': float(np.where(s > 0, L, S).mean()), 'random_mean': float((p * L + (1 - p) * S).mean()),
                    'counter_mean': float(np.where(s > 0, S, L).mean())}
    return out


# ----------------------------------------------------------------------------------------------------- synthetic
def synth(n_inst=13, n_days=2000, mu=0.0, const_drift=0.0, half_spread=0.04, seed=SEED, start=date(2016, 11, 1)):
    """15-minute arithmetic random walk on weekdays (all 24h of each weekday London date), daily sd 6 at a level
    of 1000 (sigma ~0.6%). mu: momentum drift per day in R (sign of the 4h-bucket EMA20 slope, as power_sim);
    const_drift: drift per day in price units (closed-form check)."""
    rng = np.random.default_rng(seed)
    days = weekdays(start, start + timedelta(int(n_days * 1.45)))[:n_days]
    per = 96
    T = np.concatenate([lon_epoch(d, 0) + 900 * np.arange(per) for d in days]).astype(np.int64)
    sd_day = 6.0
    sd_bar = sd_day / math.sqrt(per) / math.sqrt(2.0)        # t4 variance 2
    out = {}
    for k in range(n_inst):
        inc = rng.standard_t(4, len(T)) * sd_bar + const_drift / per
        if mu:
            bucket = (T // 14400)
            brk = np.r_[0, np.nonzero(np.diff(bucket))[0] + 1, len(T)]
            x = np.empty(len(T))
            p, ema, hist = 1000.0, None, []
            kk = 2 / 21
            for b in range(len(brk) - 1):
                a, z = brk[b], brk[b + 1]
                dr = 0.0
                if len(hist) >= 4:
                    dr = mu * sd_day / per * np.sign(hist[-1] - hist[-4])
                seg = p + np.cumsum(inc[a:z] + dr)
                x[a:z] = seg
                p = seg[-1]
                ema = p if ema is None else ema + kk * (p - ema)
                hist.append(ema)
        else:
            x = 1000.0 + np.cumsum(inc)
        o = np.r_[1000.0, x[:-1]]
        c = x
        wig = np.abs(rng.normal(0, sd_bar * 0.5, (2, len(T))))
        h = np.maximum(o, c) + wig[0]
        l = np.minimum(o, c) - wig[1]
        out[INSTS[k % len(INSTS)] if n_inst <= len(INSTS) else f'S{k}'] = {
            't': T, 'mo': o, 'mh': h, 'ml': l, 'mc': c,
            'bo': o - half_spread, 'bh': h - half_spread, 'bl': l - half_spread, 'bc': c - half_spread,
            'ao': o + half_spread, 'ah': h + half_spread, 'al': l + half_spread, 'ac': c + half_spread}
    return out, days


def run_case(data, days, opts, label, log):
    t0 = time.time()
    insts = {a: Inst(a, d) for a, d in data.items()}
    o = dict(opts)
    o['roll'] = rollover_table(days[0], days[-1])
    o['last_session'] = days[-1]
    df, counts = build(insts, o)
    df = df.sort_values(['inst', 'date']).reset_index(drop=True)
    rng = np.random.default_rng(SEED)
    res = score(df, o, rng, log=lambda *_: None)
    log(f'  [{label}] {len(df)} entries, {time.time() - t0:.0f}s')
    return df, res


def selftest(out_dir: Path, log=print, n_days=2000):
    log('SELFTEST (synthetic only; no market data read)')
    report, ok = {}, True
    # (a) zero drift: no exit passes; every Delta within 3 SE of 0; design check clean
    data, days = synth(n_days=n_days, mu=0.0, seed=SEED)
    _, r = run_case(data, days, {}, 'zero drift', log)
    a_ok = ('stopped' not in r and all(r['cells'][x]['verdict'] != 'VALIDATED' for x in SCORED)
            and all(abs(r['cells'][x]['mean']) <= 3 * r['cells'][x]['se_used'] for x in SCORED))
    report['a_zero_drift'] = {'ok': a_ok, 'stopped': r.get('stopped'),
                              'cells': {x: {k: r['cells'][x][k] for k in ('mean', 'se_used', 'verdict')} for x in SCORED}
                              if 'cells' in r else None,
                              'design': {x: (v['mean'], v['se'], v['fault']) for x, v in r['design_check'].items()}}
    # (b) closed form: constant drift, side forced long, stop 100R, zero spread: E3_N - E0 = d (N-1) / (sigma * P)
    d_day = 0.6                                           # 0.1 daily sd per day
    data, days = synth(n_days=n_days, const_drift=d_day, half_spread=0.0, seed=SEED + 1)
    insts = {a: Inst(a, x) for a, x in data.items()}
    o = {'roll': rollover_table(days[0], days[-1]), 'last_session': days[-1], 'stopR': 100.0, 'force_side': 1}
    df, _ = build(insts, o)
    rng = np.random.default_rng(SEED)
    boot = Boot(df['date'].tolist(), rng)
    P = np.array([insts[a].d['mo'][insts[a].idx(lon_epoch(dd, 7))] for a, dd in zip(df['inst'], df['date'])])
    b_rows, b_ok = {}, True
    for N in (2, 3, 5):
        got = boot.stat(df[f'E3_{N}_Lm'].to_numpy() - df['E0_Lm'].to_numpy())
        want = float(np.mean(d_day * (N - 1) / (df['sig'].to_numpy() * P)))
        good = abs(got['mean'] - want) <= 2 * got['se']
        b_ok &= good
        b_rows[f'E3_{N}'] = {'got': got['mean'], 'se': got['se'], 'closed_form': want, 'ok': bool(good)}
    report['b_closed_form'] = {'ok': bool(b_ok), 'rows': b_rows}
    # (c) planted momentum: holding (E1) and trailing (E2) and the 5-day stop must pass the full gate
    data, days = synth(n_days=n_days, mu=0.20, seed=SEED + 2)
    _, r = run_case(data, days, {'ignore_design': True}, 'planted momentum 0.20R/day', log)
    need = ['E1', 'E2', 'E3_5']
    c_ok = 'cells' in r and all(r['cells'][x]['verdict'] == 'VALIDATED' for x in need)
    report['c_planted'] = {'ok': c_ok, 'stopped': r.get('stopped'), 'required_validated': need,
                           'cells': {x: {k: r['cells'][x][k] for k in ('mean', 'se_used', 'p_holm', 'verdict')}
                                     for x in SCORED} if 'cells' in r else None}
    # (d) lockbox guard: a path session after 2026-08-21 must raise
    try:
        data, days = synth(n_inst=1, n_days=40, start=date(2026, 7, 20))
        insts = {a: Inst(a, x) for a, x in data.items()}
        build(insts, {'roll': rollover_table(days[0], days[-1]), 'last_session': days[-1]})
        d_ok = False
    except AssertionError:
        d_ok = True
    report['d_lockbox_assert'] = {'ok': d_ok}
    ok = a_ok and b_ok and c_ok and d_ok
    report['passed'] = bool(ok)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / 'selftest.json').write_text(json.dumps(report, indent=1, default=str))
    for k, v in report.items():
        if isinstance(v, dict):
            log(f'  {k}: {"ok" if v.get("ok") else "FAIL"}')
    log('SELFTEST PASSED' if ok else 'SELFTEST FAILED')
    return ok, report


# ----------------------------------------------------------------------------------------------------- report
def f3(x):
    return '—' if x is None else f'{x:+.3f}'


def write_results(res, counts, mp, out: Path, meta):
    out.mkdir(parents=True, exist_ok=True)
    res = {**res, **meta, 'counts': counts, 'map': mp}
    (out / 'results.json').write_text(json.dumps(res, indent=1, default=str))
    L = [f'# {SLUG} — on the same entries, which exit earns more R than it earns on random entries?', '',
         f'Prereg: `{PREREG}`. Seed {SEED}. Run {meta["run_date"]}. Entries {meta["n_entries"]} '
         f'({meta["span"][0]} → {meta["span"][1]}), 13 instruments, OANDA bid/ask M1, spread at the fill minute.', '']
    if 'stopped' in res:
        L += [f'**STOPPED: {res["stopped"]}**', '', '```', json.dumps(res['design_check'], indent=1, default=str), '```']
        (out / 'RESULTS.md').write_text('\n'.join(L) + '\n')
        return
    L += [f'**Verdict: {res["verdict"]}**' + (f' — best exit {res["best_exit"]}' if res.get('best_exit') else ''), '',
          '## Scored cells (Δ = (exit − 21:00 close) on slope entries minus the same on random entries, R per entry)', '',
          '| Exit | Δ [95% CI] | SE used | p boot / p shift | Holm p | Half 1 / Half 2 | Gold / FX / Indices | MDE (binding) | Verdict |',
          '|---|---|---|---|---|---|---|---|---|']
    for x in SCORED:
        c, pw = res['cells'][x], res['power_binding'][x]
        g = c['groups']
        L.append(f"| {x} | {c['mean']:+.3f} [{c['lo']:+.3f}, {c['hi']:+.3f}] | {c['se_used']:.4f} | "
                 f"{c['p_boot']:.3f} / {c['p_shift']:.3f} | {c['p_holm']:.3f} | {c['half1']:+.3f} / {c['half2']:+.3f} | "
                 f"{f3(g['gold'])} / {f3(g['fx'])} / {f3(g['indices'])} | {pw['mde']:.3f} | **{c['verdict']}** |")
    L += ['', f'Pass bar +{BAR}R; gate = Δ ≥ bar, Holm p < 0.05 (p = max of bootstrap and shift-placebo p), both halves '
              f'> 0 (split {res["half_split_date"]}), ≥ 2 of 3 groups > 0. Promotion to live needs t ≥ 3.', '',
          '## Components (descriptive)', '',
          '| Exit | D slope | D random | D counter | Δ spread + financing | Friday-flat Δ |', '|---|---|---|---|---|---|']
    for x in SCORED:
        c = res['cells'][x]
        ff = res['friday_flat_sensitivity'].get(x + 'f') if x != 'E1' else None
        L.append(f"| {x} | {c['D_slope']:+.3f} | {c['D_random']:+.3f} | {c['D_counter']:+.3f} | "
                 f"{res['financing_layer'][x]['delta_spread_plus_financing']:+.3f}"
                 f"{' (sign flips)' if res['financing_layer'][x]['sign_flip'] else ''} | {f3(ff['mean']) if ff else '—'} |")
    L += ['', '## Raw R per exit (spread on)', '',
          '| Exit | Slope: mean / win / payoff / top-10% share | + financing | Random book mean / win | Counter mean | Mean hours held |',
          '|---|---|---|---|---|---|']
    for x in ALL_EXITS:
        r = res['raw'][x]
        s = r['slope']
        L.append(f"| {x} | {s['mean']:+.3f} / {100 * s['win']:.0f}% / {s['payoff'] if s['payoff'] is None else round(s['payoff'], 2)} / "
                 f"{'—' if s['top10_share_of_total'] is None else round(s['top10_share_of_total'], 2)} | "
                 f"{r['slope_plus_financing']['mean']:+.3f} | {r['random_book']['mean']:+.3f} / {100 * r['random_book']['win']:.0f}% | "
                 f"{r['counter']['mean']:+.3f} | {r['hold_hours_mean']:.1f} |")
    L += ['', '## MFE / MAE map (ignoring the stop; R on the exit-side quote)', '',
          '| Session | MFE slope mean (random) | MAE slope mean (random) | R at 21:00 slope (random, counter) |', '|---|---|---|---|']
    for k in range(1, 6):
        a, b, c = mp[f'mfe{k}'], mp[f'mae{k}'], mp[f'r21_{k}']
        L.append(f"| {k} | {a['slope_mean']:+.3f} ({a['random_mean']:+.3f}) | {b['slope_mean']:+.3f} ({b['random_mean']:+.3f}) | "
                 f"{c['slope_mean']:+.3f} ({c['random_mean']:+.3f}, {c['counter_mean']:+.3f}) |")
    L.append(f"\n+1R before −1R within 5 sessions: slope {mp['up_first']['slope_mean']:.3f}, random "
             f"{mp['up_first']['random_mean']:.3f}. Quantiles in `map.json`.")
    rc = res['reconciliation']
    L += ['', '## Checks', '',
          f"- Design (lesson #27): gross random-entry Dr per exit {', '.join(f'{x} {v['mean']:+.4f}' for x, v in res['design_check'].items())}; no fault.",
          f"- Reconciliation with h4-trend-hold DAY: {rc}",
          f"- Slices: {res.get('slices_chance_baseline')}; BH survivors are candidates only (results.json `slices`).",
          f"- Entry counts and drops per instrument: results.json `counts`.", '',
          '## What this changes', '', '*(written by hand after reading, per prereg §8)*']
    (out / 'RESULTS.md').write_text('\n'.join(L) + '\n')


# ----------------------------------------------------------------------------------------------------- main
def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--selftest', action='store_true')
    ap.add_argument('--skip-selftest', action='store_true')
    ap.add_argument('--selftest-days', type=int, default=2000)
    ap.add_argument('--m1-root', default=str(ROOT / 'data' / 'm1_bidask'))
    ap.add_argument('--out', default=str(ROOT / 'analysis' / 'output' / SLUG))
    ap.add_argument('--ack-reconciliation', action='store_true',
                    help='continue when the h4-trend-hold reconciliation gap exceeds 0.03R (explain it in RESULTS.md)')
    a = ap.parse_args(argv)
    out = Path(a.out)
    t0 = time.time()
    if a.selftest:
        ok, _ = selftest(out, n_days=a.selftest_days)
        print(f'{time.time() - t0:.0f}s')
        return 0 if ok else 1
    if not a.skip_selftest:
        ok, _ = selftest(out, n_days=a.selftest_days)
        if not ok:
            die('positive control failed; nothing real was read')
    root = Path(a.m1_root)
    fin = load_financing(INSTS)
    events = load_events()
    insts = {}
    for k in INSTS:
        print(f'loading {k} ...', flush=True)
        insts[k] = Inst(k, load_instrument(root / f'{M1KEY[k]}_m1.parquet'))
    first = min(datetime.fromtimestamp(int(I.t[0]), LON).date() for I in insts.values())
    opts = {'roll': rollover_table(first, LOCKBOX), 'last_session': LOCKBOX, 'financing': fin, 'events': events}
    print('building entries and exits ...', flush=True)
    df, counts = build(insts, opts)
    df = df.sort_values(['inst', 'date']).reset_index(drop=True)
    assert df['date'].max() <= LOCKBOX
    out.mkdir(parents=True, exist_ok=True)
    mp = map_table(df)
    (out / 'map.json').write_text(json.dumps(mp, indent=1))               # the map first (prereg 3.3)
    meta = {'study': SLUG, 'prereg': PREREG, 'seed': SEED, 'run_date': date.today().isoformat(),
            'n_entries': int(len(df)), 'span': [str(df['date'].min()), str(df['date'].max())],
            'B': B_BOOT, 'block': BLOCK, 'n_shift': N_SHIFT, 'bar': BAR, 'lockbox': str(LOCKBOX),
            'financing_snapshot': fin, 'events_covered_to': str(events[1])}

    def power_cb(r):
        (out / 'power_binding.json').write_text(json.dumps(r['power_binding'], indent=1))

    rng = np.random.default_rng(SEED)
    res = score(df, {**opts, 'power_callback': power_cb}, rng)
    rc = res.get('reconciliation', {})
    if rc.get('flag_gt_0.03') and not a.ack_reconciliation:
        write_results({'stopped': f'reconciliation gap {rc["gap"]:+.3f}R > 0.03R vs h4-trend-hold; explain, then rerun '
                                  f'with --ack-reconciliation', 'design_check': res.get('design_check')}, counts, mp, out, meta)
        die('reconciliation gap > 0.03R (prereg 3.9 item 3)')
    write_results(res, counts, mp, out, meta)
    print(f"verdict {res.get('verdict', res.get('stopped'))}; {time.time() - t0:.0f}s; wrote {out}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
