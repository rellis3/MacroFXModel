#!/usr/bin/env python3
"""bias-learner runner — forge/BIAS_LEARNER_PREREG.md (seed 20261114).

    python -I scripts/bias-learner/run.py                 # the registered run (needs local M1 etc., see README.md)
    python -I scripts/bias-learner/run.py --selftest      # synthetic data only (no market data is read)

Order of the real run (prereg §3.8):
  1. read local M1 with a hard stop before 2026-08-21 21:00 London (asserted) and build the 13 morning READINGS only;
  2. positive control: the exact pipeline on the real readings with synthetic targets (planted IC 0.12 must pass,
     IC 0 must not); abort before any real target is computed if it fails;
  3. build the real targets (07:00 London -> 21:00 London at h = 0, 1, 3, 5 sessions), B0, and score the 12 cells
     (4 horizons x 3 groups): primary L2 logistic, M0, best single reading, 200 day-block shuffles, bootstrap,
     gates G1-G7, Holm, verdict per cell and per group; descriptive arms;
  4. write analysis/output/bias-learner/{RESULTS.md, results.json, positive_control.json}.
Local files only. Never touches R2 or any loader that merges the nightly tail. Writes only under --out.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import tempfile
import time
from concurrent.futures import ProcessPoolExecutor
from statistics import NormalDist

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.dataset as pds
import pyarrow.parquet as pq

SEED = 20261114
SLUG = 'bias-learner'
PREREG = 'forge/BIAS_LEARNER_PREREG.md'
LOCKBOX = pd.Timestamp('2026-08-21')                       # last London session that may be read
CUTOFF_UTC = pd.Timestamp('2026-08-21 20:00:00')           # 21:00 London (BST) on that session; nothing at/after is read
START = pd.Timestamp('2016-01-04')
LON, NY = 'Europe/London', 'America/New_York'
ND = NormalDist()

# instrument, group, M1 root ('fx' = VolRangeForecaster/data/m1, 'idx' = portfolioBacktest/cache), M1 key, bid/ask key,
# d_i (sign for a USD-positive surprise, POST_RELEASE_DRIFT_POOLED §3.3), carry (base, quote) or None, COT recipe, Cboe IV
INSTRUMENTS = [
    ('EURUSD', 'fx', 'fx', 'eurusd', 'eurusd', -1, ('EUR', 'USD'), [('EUR', 1)], None),
    ('GBPUSD', 'fx', 'fx', 'gbpusd', 'gbpusd', -1, ('GBP', 'USD'), [('GBP', 1)], None),
    ('USDJPY', 'fx', 'fx', 'usdjpy', 'usdjpy', 1, ('USD', 'JPY'), [('JPY', 1)], None),
    ('USDCAD', 'fx', 'fx', 'usdcad', 'usdcad', 1, ('USD', 'CAD'), [('CAD', 1)], None),
    ('AUDUSD', 'fx', 'fx', 'audusd', 'audusd', -1, ('AUD', 'USD'), [('AUD', 1)], None),
    ('NZDUSD', 'fx', 'fx', 'nzdusd', 'nzdusd', -1, ('NZD', 'USD'), [('NZD', 1)], None),
    ('USDCHF', 'fx', 'fx', 'usdchf', 'usdchf', 1, ('USD', 'CHF'), [('CHF', 1)], None),
    ('EURJPY', 'fx', 'fx', 'eurjpy', 'eurjpy', 0, ('EUR', 'JPY'), [('EUR', 1), ('JPY', 1)], None),
    ('GBPJPY', 'fx', 'fx', 'gbpjpy', 'gbpjpy', 0, ('GBP', 'JPY'), [('GBP', 1), ('JPY', 1)], None),
    ('GOLD', 'gold', 'fx', 'gold', 'gold', -1, None, [('GOLD', 1)], 'GVZ'),
    ('NAS100', 'idx', 'idx', 'nq', 'nq', -1, None, [('NQ', 1)], 'VXN'),
    ('SPX500', 'idx', 'idx', 'spx500', 'spx', -1, None, [('ES', 1)], 'VIX'),
    ('US30', 'idx', 'idx', 'us30', 'dow', -1, None, [('YM', 1)], 'VXD'),
]
INST = [r[0] for r in INSTRUMENTS]
GROUPS = ['fx', 'gold', 'idx']
GROUP_OF = {r[0]: r[1] for r in INSTRUMENTS}
GIDX = np.array([GROUPS.index(r[1]) for r in INSTRUMENTS])
FEAT = ['tr1h', 'tr4h', 'trD', 'trW', 'asia', 'cloc', 'ev_today', 'ev_tmrw', 'surp', 'carry', 'cot', 'sigreg', 'ivrv']
HORIZONS = [0, 1, 3, 5]
HNAME = {0: '21:00', 1: '+1', 3: '+3', 5: '+5'}
CGRID = [1e-5, 3e-5, 1e-4, 3e-4, 1e-3, 3e-3, 1e-2, 3e-2, 1e-1]
GBM_ITERS = [25, 50, 100, 200]
TEST_YEARS = list(range(2018, 2027))
H1_YEARS = (2018, 2021)
BLOCK = 21
B_BOOT = 2000
N_SHUFFLE = 200
N_RANDOM = 1000
COVERAGES = [0.10, 0.20, 0.30, 0.50, 1.00]
Q_GATE = 0.20
COT_HOLDS = [(pd.Timestamp('2018-12-22'), pd.Timestamp('2019-03-08')), (pd.Timestamp('2025-10-01'), pd.Timestamp('2026-01-31'))]
# Prereg §5 (Amendment A1): useful effect U and MDE (Holm first step) per horizon x group, from power_sim.json.
# Filled from analysis/output/bias-learner/power_sim.json; a cell is POWERED when MDE <= U.
POWER = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'power_table.json')))


class DataMissing(SystemExit):
    pass


def need(path):
    if not os.path.exists(path):
        raise DataMissing(f'MISSING DATA FILE: {path}')
    return path


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


# ───────────────────────────── loading (local files only) ─────────────────────────────

def read_m1(path, cutoff=CUTOFF_UTC, cols=('open', 'high', 'low', 'close')):
    """Local parquet only. Filters at read time so no bar at/after the cutoff is materialised; asserts it."""
    need(path)
    sch = pq.read_schema(path)
    tcol = next((n for n in ('time', 'datetime', 'timestamp', '__index_level_0__') if n in sch.names), None)
    if tcol is None:
        tcol = next((f.name for f in sch if pa.types.is_timestamp(f.type)), None)
    if tcol is None:
        raise SystemExit(f'{path}: no time column found ({sch.names})')
    miss = [c for c in cols if c not in sch.names]
    if miss:
        raise SystemExit(f'{path}: missing columns {miss}')
    typ = sch.field(tcol).type
    dset = pds.dataset(path, format='parquet')
    if pa.types.is_timestamp(typ):
        c = cutoff.tz_localize('UTC') if typ.tz else cutoff
        flt = pds.field(tcol) < pa.scalar(c.to_pydatetime(), type=typ)
        mult = None
    elif pa.types.is_integer(typ):
        first = dset.head(1, columns=[tcol]).column(0)[0].as_py()
        mult = 1 if first < 1e11 else (1_000 if first < 1e14 else 1_000_000_000)
        flt = pds.field(tcol) < int(cutoff.tz_localize('UTC').timestamp()) * mult
    else:
        raise SystemExit(f'{path}: unsupported time type {typ}')
    tb = dset.to_table(columns=[tcol, *cols], filter=flt).to_pandas()
    tt = tb[tcol]
    tt = pd.to_datetime(tt * (1_000_000_000 // mult), utc=True) if mult else pd.to_datetime(tt, utc=True)
    tb = tb.drop(columns=[tcol]).assign(time=tt.to_numpy())
    tb['time'] = pd.to_datetime(tb['time'], utc=True)
    tb = tb.drop_duplicates('time').sort_values('time').reset_index(drop=True)
    assert len(tb), f'{path}: no M1 rows before the lockbox'
    assert tb.time.max() < cutoff.tz_localize('UTC'), 'LOCKBOX BREACH: an M1 bar at/after 2026-08-21 21:00 London was read'
    assert tb.time.min().year >= 2000, f'{path}: timestamps look like 1970 (BAM column trap)'
    return tb


def load_cboe(root, sym):
    p = need(os.path.join(root, 'analysis/surfaces/cboe', f'{sym}.csv'))
    d = pd.read_csv(p)
    d.columns = [c.strip().upper() for c in d.columns]
    val = 'CLOSE' if 'CLOSE' in d.columns else [c for c in d.columns if c != 'DATE'][0]
    s = pd.Series(pd.to_numeric(d[val], errors='coerce').to_numpy(), index=pd.to_datetime(d['DATE'], format='%m/%d/%Y'))
    s = s[s > 0].dropna().sort_index()
    return s[s.index < LOCKBOX]          # a close dated before d is used for d, so nothing on/after the lockbox is needed


def first_print(rows):
    d = rows.copy()
    d['date'] = pd.to_datetime(d['date'])
    d['asof'] = pd.to_datetime(d['asof'], utc=True).dt.tz_localize(None)
    return d.sort_values(['date', 'asof']).drop_duplicates('date', keep='first')


def eff_asof(d):
    """fx-factor-stack Addendum A: rows stamped with the 2013-06-03 bulk backfill are known 45 days after month end."""
    bulk = d['asof'].dt.strftime('%Y-%m-%d').eq('2013-06-03')
    me = d['date'] + pd.offsets.MonthEnd(0)
    return pd.Series(np.where(bulk, me + pd.Timedelta(days=45), d['asof']), index=d.index)


def known_monthly(d, sessions):
    """Value of the latest reference month whose effective publication <= 06:00 UTC on the session date (< 07:00 London)."""
    d = d.assign(eff=eff_asof(d)).sort_values('eff')
    eff, dt_, val = d['eff'].to_numpy(), d['date'].to_numpy(), d['value'].astype(float).to_numpy()
    out = np.full(len(sessions), np.nan)
    j, best_d, best_v = 0, None, np.nan
    for k, t in enumerate(sessions):
        lim = np.datetime64(t + pd.Timedelta(hours=6))
        while j < len(d) and eff[j] <= lim:
            if best_d is None or dt_[j] >= best_d:
                best_d, best_v = dt_[j], val[j]
            j += 1
        out[k] = best_v
    return out


def known_daily(d, sessions):
    d = d.copy()
    d['asof'] = pd.to_datetime(d['asof'], utc=True).dt.tz_localize(None)
    d['value'] = pd.to_numeric(d['value'], errors='coerce')
    d = d.dropna(subset=['value']).sort_values('asof')
    q = pd.DataFrame({'t': pd.DatetimeIndex(sessions) + pd.Timedelta(hours=6)})
    m = pd.merge_asof(q, d[['asof', 'value']], left_on='t', right_on='asof')
    return m['value'].to_numpy()


def load_rates(fs, sessions):
    """3m rates known before 07:00 London, as fx-factor-stack load_rates (A1.3): USD = 3m to 2013-06-03 then EFFR;
    EUR = EZ 3m through 2026-02-16 then DE call money + the mean offset of their last 12 common months."""
    S = pd.DatetimeIndex(sessions)
    R = {}
    for c in ['EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF']:
        R[c] = known_monthly(first_print(pd.read_parquet(need(os.path.join(fs, f'rate3m_{c.lower()}.parquet')))), S)
    usd3 = known_monthly(first_print(pd.read_parquet(need(os.path.join(fs, 'rate3m_usd.parquet')))), S)
    effr = known_daily(pd.read_parquet(need(os.path.join(fs, 'effr.parquet'))), S)
    R['USD'] = np.where(S < pd.Timestamp('2013-06-04'), usd3, effr)
    ez = first_print(pd.read_parquet(need(os.path.join(fs, 'rate3m_eur.parquet'))))
    de = first_print(pd.read_parquet(need(os.path.join(fs, 'rate_on_de.parquet'))))
    both = ez.merge(de, on='date', suffixes=('_ez', '_de')).sort_values('date').tail(12)
    offset = float((both['value_ez'].astype(float) - both['value_de'].astype(float)).mean()) if len(both) else 0.0
    de_known = known_monthly(de, S) + offset
    R['EUR'] = np.where(S <= pd.Timestamp('2026-02-16'), R['EUR'], de_known)
    return R


def load_cot(root, sessions):
    """z of spec net / OI over the trailing 156 reports (min 52), usable from report_date + 7 days; shutdown holds."""
    p = need(os.path.join(root, 'analysis/output/cot-crowding-programme/cot_weekly.csv'))
    c = pd.read_csv(p, parse_dates=['report_date'])
    c = c[c.report_date < LOCKBOX]
    S = pd.DatetimeIndex(sessions)
    out = {}
    for sym, g in c.groupby('sym'):
        g = g.sort_values('report_date').drop_duplicates('report_date', keep='last')
        net = (g.spec_long - g.spec_short) / g.oi.replace(0, np.nan)
        mu = net.rolling(156, min_periods=52).mean(); sd = net.rolling(156, min_periods=52).std()
        z = ((net - mu) / sd).to_numpy()
        known = (g.report_date + pd.Timedelta(days=7)).to_numpy().copy()
        for a, b in COT_HOLDS:
            hold = (known >= np.datetime64(a)) & (known <= np.datetime64(b))
            known[hold] = np.datetime64(b + pd.Timedelta(days=1))
        k = pd.DataFrame({'known': known, 'z': z}).sort_values('known', kind='stable')
        k = k.groupby('known', as_index=False).last()             # several reports released together: newest wins
        q = pd.DataFrame({'t': S})
        m = pd.merge_asof(q, k, left_on='t', right_on='known')
        out[sym] = m['z'].to_numpy()
    return out


def load_events(root):
    p = need(os.path.join(root, 'analysis/output/post-release-drift-pooled/events.parquet'))
    ev = pd.read_parquet(p)
    for c in ('family', 't', 's', 'z'):
        if c not in ev.columns:
            raise SystemExit(f'{p}: missing column {c}')
    ev = ev[ev.family.isin(['CPI', 'NFP', 'PPI', 'FOMC'])].copy()
    ev['t'] = pd.to_datetime(ev['t'], utc=True)
    ev = ev[ev.t < CUTOFF_UTC.tz_localize('UTC')].sort_values('t').reset_index(drop=True)
    ev['ldate'] = ev.t.dt.tz_convert(LON).dt.tz_localize(None).dt.normalize()
    return ev


# ───────────────────────────── readings from M1 ─────────────────────────────

def ema(x, n):
    a = 2.0 / (n + 1)
    out = np.empty_like(x)
    m = x[0]
    for t in range(len(x)):
        m = a * x[t] + (1 - a) * m
        out[t] = m
    return out


def ema_slope(close, nvol, nmin):
    """(EMA20_t - EMA20_{t-3}) / (s * sqrt 3) on log closes; s = SD of the last nvol log returns (min nmin); clip +-4."""
    lc = np.log(close)
    e = ema(lc, 20)
    r = pd.Series(np.r_[np.nan, np.diff(lc)])
    s = r.rolling(nvol, min_periods=nmin).std().to_numpy()
    sl = np.full(len(lc), np.nan)
    sl[23:] = (e[23:] - e[20:-3]) / (s[23:] * math.sqrt(3))
    return np.clip(sl, -4, 4)


def last_completed(done_ns, values, t_ns):
    """values of the last bar whose completion time <= t (both int64 ns UTC); NaN if none."""
    k = np.searchsorted(done_ns, t_ns, side='right') - 1
    out = np.full(len(t_ns), np.nan)
    ok = k >= 0
    out[ok] = values[k[ok]]
    return out


def instrument_frame(m1, inst):
    """Per London session: P0 (07:00 open), close21, the price-based readings, sigma, and arrays kept for R.
    Readings use only bars completed before 07:00 London on the session date (asserted by the selftest's
    future-perturbation check)."""
    t = m1['time']
    tl = t.dt.tz_convert(LON)
    ldate = tl.dt.tz_localize(None).dt.normalize()
    mod = (tl.dt.hour * 60 + tl.dt.minute).to_numpy()
    wd = ldate.dt.dayofweek.to_numpy()
    o, h, l, c = (m1[k].to_numpy(float) for k in ('open', 'high', 'low', 'close'))
    tns = t.to_numpy().astype('datetime64[ns]').astype(np.int64)
    df = pd.DataFrame({'ldate': ldate.to_numpy(), 'mod': mod, 'o': o, 'h': h, 'l': l, 'c': c, 'tns': tns, 'i': np.arange(len(t))})
    df = df[wd < 5]
    g = df.groupby('ldate')
    sess = pd.DataFrame(index=sorted(df.ldate.unique()))
    e7 = df[(df['mod'] >= 420) & (df['mod'] <= 424)].groupby('ldate').first()
    sess['P0'] = e7['o']; sess['i0'] = e7['i']
    c21 = df[(df['mod'] >= 1255) & (df['mod'] <= 1259)].groupby('ldate').last()
    sess['C21'] = c21['c']; sess['i21'] = c21['i']
    a0 = df[(df['mod'] >= 0) & (df['mod'] <= 4)].groupby('ldate').first()
    a1 = df[(df['mod'] >= 415) & (df['mod'] <= 419)].groupby('ldate').last()
    sess['asia_o'] = a0['o']; sess['asia_c'] = a1['c']
    w22 = df[df['mod'] < 1320].groupby('ldate').agg(H=('h', 'max'), L=('l', 'min'), C=('c', 'last'))
    sess = sess.join(w22)
    sess.index = pd.DatetimeIndex(sess.index)
    dates = sess.index
    # 07:00 London of each session in UTC ns
    t7 = (dates + pd.Timedelta(hours=7)).tz_localize(LON).tz_convert('UTC').tz_localize(None).to_numpy().astype('datetime64[ns]').astype(np.int64)
    # H1 on the London clock: bar [hh:00, hh+1:00) completes at its end
    # (London is a whole-hour offset from UTC, so the London-clock hour grid is the UTC hour grid)
    h1 = pd.Series(c).groupby(tns // (3600 * 10**9)).last()
    h1_done = (h1.index.to_numpy() + 1) * 3600 * 10**9
    # 4h on the UTC grid (t // 14400), as h4-trend-hold
    b4 = pd.Series(c).groupby(tns // (14400 * 10**9)).last()
    b4_done = (b4.index.to_numpy() + 1) * 14400 * 10**9
    # D1 NY-close: label = NY date of (t_NY + 7h); a bar labelled L completes at 17:00 NY on L
    tny = t.dt.tz_convert(NY)
    lab = (tny + pd.Timedelta(hours=7)).dt.tz_localize(None).dt.normalize()
    d1 = pd.Series(c).groupby(lab.to_numpy()).last()
    d1 = d1[pd.DatetimeIndex(d1.index).dayofweek < 5]
    d1_idx = pd.DatetimeIndex(d1.index)
    d1_done = (d1_idx + pd.Timedelta(hours=17)).tz_localize(NY).tz_convert('UTC').tz_localize(None).to_numpy().astype('datetime64[ns]').astype(np.int64)
    d1c = d1.to_numpy(float)
    r1 = np.r_[np.nan, np.diff(np.log(d1c))]
    sig20 = pd.Series(r1).rolling(20, min_periods=20).std().to_numpy()
    sig60 = pd.Series(r1).rolling(60, min_periods=60).std().to_numpy()
    med = pd.Series(sig20).shift(1).rolling(250, min_periods=120).median().to_numpy()
    sigreg_b = np.log(sig20 / med)
    # W1 from D1: ISO week of the label; completes with its last D1 bar
    wk = pd.Series(d1c, index=d1_idx).groupby(d1_idx.to_period('W-FRI'))
    w1c = wk.last().to_numpy(float)
    w1_done = wk.apply(lambda s: s.index.max()).pipe(lambda s: pd.DatetimeIndex(s.to_numpy()))
    w1_done = (w1_done + pd.Timedelta(hours=17)).tz_localize(NY).tz_convert('UTC').tz_localize(None).to_numpy().astype('datetime64[ns]').astype(np.int64)
    # the last week may be incomplete (no Friday yet): its completion time is its last bar's, so it is only used after
    sess['tr1h'] = last_completed(h1_done, ema_slope(h1.to_numpy(float), 100, 50), t7)
    sess['tr4h'] = last_completed(b4_done, ema_slope(b4.to_numpy(float), 100, 50), t7)
    sess['trD'] = last_completed(d1_done, ema_slope(d1c, 100, 50), t7)
    sess['trW'] = last_completed(w1_done, ema_slope(w1c, 52, 26), t7)
    sess['sig'] = last_completed(d1_done, sig20, t7)
    sess['sig60'] = last_completed(d1_done, sig60, t7)
    sess['sigreg'] = last_completed(d1_done, sigreg_b, t7)
    sess['asia'] = np.log(sess.asia_c / sess.asia_o) / sess.sig
    sess['asia60'] = np.log(sess.asia_c / sess.asia_o) / sess.sig60
    rng_ = (sess.H - sess.L)
    cl = ((sess.C - sess.L) / rng_.where(rng_ > 0) - 0.5).where(rng_ > 0, 0.0)
    sess['cloc'] = cl.shift(1)                                   # the PRIOR London session
    sess['t7'] = t7
    sess['inst'] = inst
    return sess.drop(columns=['asia_o', 'asia_c', 'H', 'L', 'C'])


def path_R(m1o, m1h, m1l, m1c, i0, i1, P0, stop, side):
    """R of one trade: entry P0 at the open of bar i0, stop `stop` (price distance), exit at close of bar i1 or the stop
    on the M1 path; a gap through the stop fills at that bar's open."""
    if side > 0:
        sl = P0 - stop
        lo = m1l[i0:i1 + 1]
        hit = np.flatnonzero(lo <= sl)
        if len(hit):
            j = i0 + hit[0]
            px = min(sl, m1o[j]) if j > i0 else sl
            return (px - P0) / stop, j
        return (m1c[i1] - P0) / stop, i1
    sl = P0 + stop
    hi = m1h[i0:i1 + 1]
    hit = np.flatnonzero(hi >= sl)
    if len(hit):
        j = i0 + hit[0]
        px = max(sl, m1o[j]) if j > i0 else sl
        return (P0 - px) / stop, j
    return (P0 - m1c[i1]) / stop, i1


def build_panel(cfg):
    """Readings for all 13 instruments + the raw price arrays needed for targets and R (targets NOT computed here)."""
    roots = {'fx': os.path.join(cfg.root, cfg.m1_root), 'idx': os.path.join(cfg.root, cfg.index_root)}
    frames, raw = [], {}
    for inst, grp, rk, key, bakey, di, carry, cot, ivs in INSTRUMENTS:
        p = os.path.join(roots[rk], f'{key}_m1.parquet')
        log('reading', p)
        m1 = read_m1(p)
        m1 = m1[m1.time >= pd.Timestamp('2015-01-01', tz='UTC')].reset_index(drop=True)   # warm-up year before 2016
        f = instrument_frame(m1, inst)
        frames.append(f)
        raw[inst] = {'o': m1.open.to_numpy(float), 'h': m1.high.to_numpy(float), 'l': m1.low.to_numpy(float),
                     'c': m1.close.to_numpy(float), 'tns': m1.time.to_numpy().astype('datetime64[ns]').astype(np.int64)}
        del m1
    P = pd.concat(frames).reset_index().rename(columns={'index': 'date'})
    P = P[(P.date >= START) & (P.date <= LOCKBOX)].reset_index(drop=True)
    P = add_external(P, cfg)
    return P, raw


def add_external(P, cfg):
    dates = pd.DatetimeIndex(sorted(P.date.unique()))
    # events
    ev = load_events(cfg.root)
    evd = set(ev.ldate)
    nxt = {d: d + pd.offsets.BDay(1) for d in dates}
    P['ev_today'] = P.date.isin(evd).astype(float)
    P['ev_tmrw'] = P.date.map(nxt).isin(evd).astype(float)
    t7 = pd.to_datetime(P.t7.to_numpy(), utc=True)
    evt = ev.t.to_numpy().astype('datetime64[ns]').astype(np.int64)
    k = np.searchsorted(evt, P.t7.to_numpy(), side='left') - 1          # latest release strictly before 07:00 London
    zz = np.where(np.isfinite(ev.z.to_numpy(float)), ev.z.to_numpy(float), ev.s.to_numpy(float))
    zz = np.where(ev.s.to_numpy(float) == 0, 0.0, zz)
    sur = np.where(k >= 0, zz[np.maximum(k, 0)], 0.0)
    age_ok = np.zeros(len(P), bool)
    okk = k >= 0
    edate = ev.ldate.to_numpy()[np.maximum(k, 0)]
    lim = (P.date - pd.offsets.BDay(5)).to_numpy()
    age_ok[okk] = edate[okk] >= lim[okk]
    di = P.inst.map({r[0]: r[5] for r in INSTRUMENTS}).to_numpy(float)
    P['surp'] = np.clip(np.where(age_ok, sur, 0.0) * di, -3, 3)
    # carry
    R = load_rates(os.path.join(cfg.root, cfg.feature_root), dates)
    rix = {d: i for i, d in enumerate(dates)}
    pos = P.date.map(rix).to_numpy()
    car = np.full(len(P), np.nan)
    cot = np.full(len(P), np.nan)
    C = load_cot(cfg.root, dates)
    for inst, grp, rk, key, bakey, d_, carry, cotr, ivs in INSTRUMENTS:
        m = (P.inst == inst).to_numpy()
        if carry:
            car[m] = R[carry[0]][pos[m]] - R[carry[1]][pos[m]]
        v = np.zeros(m.sum())
        for sym, sgn in cotr:
            if sym not in C:
                raise SystemExit(f'cot_weekly.csv has no {sym}')
            v = v + sgn * C[sym][pos[m]]
        cot[m] = v
    P['carry'] = car
    P['cot'] = cot
    # IV / RV (Cboe, close dated before d)
    iv = np.full(len(P), np.nan)
    for inst, *_rest in INSTRUMENTS:
        ivs = _rest[-1]
        if ivs is None:
            continue
        s = load_cboe(cfg.root, ivs)
        m = (P.inst == inst).to_numpy()
        q = pd.DataFrame({'d': P.date[m].to_numpy() - np.timedelta64(1, 'D')})
        mm = pd.merge_asof(q, pd.DataFrame({'d': s.index, 'v': s.to_numpy()}), on='d')
        iv[m] = np.log(mm.v.to_numpy() / (P.sig[m].to_numpy() * math.sqrt(252) * 100))
    P['ivrv'] = iv
    # FX CME IV arm (descriptive): iv30 dated before d
    fxiv = np.full(len(P), np.nan)
    fmap = {'EURUSD': 'eur_usd', 'GBPUSD': 'gbp_usd', 'USDJPY': 'usd_jpy', 'USDCAD': 'usd_cad', 'AUDUSD': 'aud_usd', 'USDCHF': 'usd_chf'}
    for inst, fk in fmap.items():
        p = need(os.path.join(cfg.root, 'oi_research_book/data', f'iv_daily_{fk}.parquet'))
        d = pd.read_parquet(p, columns=['date', 'iv30']).dropna()
        d['date'] = pd.to_datetime(d['date'])
        d = d[d.date < LOCKBOX].sort_values('date')
        m = (P.inst == inst).to_numpy()
        q = pd.DataFrame({'d': P.date[m].to_numpy() - np.timedelta64(1, 'D')})
        mm = pd.merge_asof(q, d.rename(columns={'date': 'd'}), on='d')
        fxiv[m] = np.log(mm.iv30.to_numpy() / (P.sig[m].to_numpy() * math.sqrt(252)))
    P['fxivrv'] = fxiv
    return P


# ───────────────────────────── targets, B0, R ─────────────────────────────

def add_targets(P, raw, with_R=True, costs=None):
    """y_h, end date, |move|, and R (long/short, 1 sigma stop, gross and cost) per horizon. Called only AFTER the
    positive control passed."""
    P = P.sort_values(['inst', 'date']).reset_index(drop=True)
    for h in HORIZONS:
        for col in (f'y{h}', f'end{h}', f'mv{h}', f'Rl{h}', f'Rs{h}', f'cost{h}'):
            P[col] = np.nan
        P[f'end{h}'] = pd.NaT
    for inst in INST:
        m = np.flatnonzero((P.inst == inst).to_numpy())
        sub = P.iloc[m]
        ok21 = sub.C21.notna().to_numpy()
        idx21 = np.flatnonzero(ok21)                    # positions (within instrument) of sessions with a 21:00 bar
        r = raw[inst]
        for h in HORIZONS:
            y = np.full(len(m), np.nan); endd = np.full(len(m), np.datetime64('NaT'), dtype='datetime64[ns]')
            mv = np.full(len(m), np.nan); Rl = np.full(len(m), np.nan); Rs = np.full(len(m), np.nan); cost = np.full(len(m), np.nan)
            for j in range(len(m)):
                if not np.isfinite(sub.P0.iat[j]):
                    continue
                if h == 0:
                    if not ok21[j]:
                        continue
                    e = j
                else:
                    k = np.searchsorted(idx21, j, side='right') + (h - 1)
                    if k >= len(idx21):
                        continue
                    e = idx21[k]
                P0, Ph = sub.P0.iat[j], sub.C21.iat[e]
                if Ph == P0:
                    continue
                y[j] = float(Ph > P0); endd[j] = np.datetime64(sub.date.iat[e]); mv[j] = abs(Ph / P0 - 1)
                if with_R and np.isfinite(sub.sig.iat[j]) and sub.sig.iat[j] > 0:
                    i0, i1 = int(sub.i0.iat[j]), int(sub.i21.iat[e])
                    stop = sub.sig.iat[j] * P0
                    Rl[j] = path_R(r['o'], r['h'], r['l'], r['c'], i0, i1, P0, stop, 1)[0]
                    Rs[j] = path_R(r['o'], r['h'], r['l'], r['c'], i0, i1, P0, stop, -1)[0]
                    if costs is not None and inst in costs:
                        sp0 = costs[inst].get(r['tns'][i0]); sp1 = costs[inst].get(r['tns'][i1])
                        if sp0 is not None and sp1 is not None:
                            cost[j] = (sp0 / 2 + sp1 / 2) / stop
            for col, v in ((f'y{h}', y), (f'end{h}', endd), (f'mv{h}', mv), (f'Rl{h}', Rl), (f'Rs{h}', Rs), (f'cost{h}', cost)):
                P.loc[P.index[m], col] = v
    for h in HORIZONS:
        e = pd.to_datetime(P[f'end{h}'])
        assert (e.dropna() <= LOCKBOX).all(), 'LOCKBOX BREACH: a horizon ends after 2026-08-21'
    return P


def load_costs(cfg, raw):
    """half-spread source: ask - bid at the entry minute (open) and exit minute (close), local bid/ask M1."""
    out = {}
    for inst, grp, rk, key, bakey, *_ in INSTRUMENTS:
        p = os.path.join(cfg.root, 'data/m1_bidask', f'{bakey}_m1.parquet')
        tb = read_m1(p, cols=('bid_o', 'ask_o', 'bid_c', 'ask_c'))
        tns = tb.time.to_numpy().astype('datetime64[ns]').astype(np.int64)
        sp = (tb.ask_o - tb.bid_o).to_numpy(float) / 2 + (tb.ask_c - tb.bid_c).to_numpy(float) / 2
        out[inst] = dict(zip(tns.tolist(), sp.tolist()))
    return out


def b0_matrix(dates, Y, END):
    """Point-in-time B0 per instrument: Beta(10,10) over labels whose end date < d. Y, END: (T, N) arrays (END as date
    index, -1 if no label)."""
    T, N = Y.shape
    B = np.full((T, N), 0.5)
    for i in range(N):
        ok = np.isfinite(Y[:, i]) & (END[:, i] >= 0)
        e = END[ok, i]; y = Y[ok, i]
        order = np.argsort(e, kind='stable'); e = e[order]; y = y[order]
        cs = np.r_[0, np.cumsum(y)]
        k = np.searchsorted(e, np.arange(T), side='left')    # number of labels with end < t
        B[:, i] = (cs[k] + 10) / (k + 20)
    return B


# ───────────────────────────── the learner ─────────────────────────────

def fit_logit(X, y, C, off, w0=None):
    """sum log-loss + ||w||^2/(2C), fixed offset; Newton/IRLS with step halving (sklearn's C convention)."""
    k = X.shape[1]; lam = 1.0 / C
    w = np.zeros(k) if w0 is None else w0.copy()

    def obj(w):
        z = off + X @ w
        return np.sum(np.logaddexp(0, z) - y * z) + 0.5 * lam * w @ w
    f = obj(w)
    for _ in range(60):
        z = off + X @ w; q = 1 / (1 + np.exp(-z))
        g = X.T @ (q - y) + lam * w
        H = (X * (q * (1 - q))[:, None]).T @ X + lam * np.eye(k)
        step = np.linalg.solve(H, g); t = 1.0
        while True:
            wn = w - t * step; fn = obj(wn)
            if fn <= f or t < 1e-8:
                break
            t *= 0.5
        conv = abs(f - fn) < 1e-9 * max(1.0, abs(f))
        w, f = wn, fn
        if conv:
            break
    return w


def sigmoid(z):
    return 1 / (1 + np.exp(-z))


class Data:
    """Flattened panel for one horizon: rows = (date, inst) with a label."""

    def __init__(self, F, avail, y, b0, date_ix, inst_ix, end_ix, year, month, first_of_year):
        self.F, self.avail, self.y, self.b0 = F, avail, y, b0
        self.date_ix, self.inst_ix, self.end_ix = date_ix, inst_ix, end_ix
        self.year, self.month, self.first_of_year = year, month, first_of_year
        self.grp = GIDX[inst_ix]
        self.off = np.log(b0 / (1 - b0))


def standardise(F, avail, tr, te):
    """mean/SD from training rows where the reading exists; absent -> 0 after standardising (prereg §3.3)."""
    Z_tr = np.zeros((tr.sum(), F.shape[1])); Z_te = np.zeros((te.sum(), F.shape[1]))
    for j in range(F.shape[1]):
        a = avail[tr, j]
        if a.sum() < 2:
            continue
        mu = F[tr, j][a].mean(); sd = F[tr, j][a].std()
        sd = sd if sd > 0 else 1.0
        Z_tr[:, j] = np.where(avail[tr, j], (F[tr, j] - mu) / sd, 0.0)
        Z_te[:, j] = np.where(avail[te, j], (F[te, j] - mu) / sd, 0.0)
    return Z_tr, Z_te


def design(Z, inst_ix, grp, cols):
    n = Z.shape[0]
    oh = np.zeros((n, len(INST))); oh[np.arange(n), inst_ix] = 1.0
    if not cols:
        return oh
    Zc = Z[:, cols]
    dev = np.concatenate([Zc * (grp == g)[:, None] for g in range(3)], axis=1)
    return np.concatenate([oh, Zc, dev], axis=1)


def inner_folds(D, tr):
    yrs = sorted(set(D.year[tr]))
    out = []
    for vy in yrs[1:][-3:]:
        itr = tr & (D.end_ix < D.first_of_year[vy])
        iva = tr & (D.year == vy)
        if itr.sum() >= 500 and iva.sum() >= 200:
            out.append((itr, iva))
    return out


def monthly_score(se, month):
    u, inv = np.unique(month, return_inverse=True)
    return np.bincount(inv, se) / np.bincount(inv)


def choose_C(D, tr, cols, y):
    folds = inner_folds(D, tr)
    if not folds:
        return CGRID[4]
    scores = {C: [] for C in CGRID}
    for itr, iva in folds:
        a, b = standardise(D.F, D.avail, itr, iva)
        Xa, Xb = design(a, D.inst_ix[itr], D.grp[itr], cols), design(b, D.inst_ix[iva], D.grp[iva], cols)
        w = None
        for C in CGRID:                                          # warm start along the path
            w = fit_logit(Xa, y[itr], C, D.off[itr], w)
            p = sigmoid(D.off[iva] + Xb @ w)
            scores[C].extend(monthly_score((p - y[iva]) ** 2, D.month[iva]).tolist())
    means = [np.mean(scores[C]) for C in CGRID]
    best = min(means)
    return CGRID[[i for i, m in enumerate(means) if m <= best][0]]


def train_mask(D, Y, window):
    tr = D.end_ix < D.first_of_year[Y]
    if window == 'rolling3':
        tr &= D.year >= Y - 3
    return tr


def walk_forward(D, cols, y=None, window='expanding', keep=False):
    """Primary pipeline. Returns OOS p (NaN outside test years) and, if keep, per-fold C, weights, thresholds."""
    y = D.y if y is None else y
    p = np.full(len(y), np.nan)
    info = {'C': {}, 'w': {}, 'thr': {}}
    for Y in TEST_YEARS:
        te = D.year == Y
        if te.sum() == 0 or Y not in D.first_of_year:
            continue
        tr = train_mask(D, Y, window)
        if tr.sum() < 500:
            continue
        C = choose_C(D, tr, cols, y)
        a, b = standardise(D.F, D.avail, tr, te)
        Xa, Xb = design(a, D.inst_ix[tr], D.grp[tr], cols), design(b, D.inst_ix[te], D.grp[te], cols)
        w = fit_logit(Xa, y[tr], C, D.off[tr])
        p[te] = sigmoid(D.off[te] + Xb @ w)
        if keep:
            pin = sigmoid(D.off[tr] + Xa @ w)
            info['C'][Y] = C; info['w'][Y] = w.tolist()
            info['thr'][Y] = {GROUPS[g]: {str(q): float(np.quantile(np.abs(pin[D.grp[tr] == g] - 0.5), 1 - q)) if q < 1 else 0.0
                                          for q in COVERAGES} for g in range(3) if (D.grp[tr] == g).any()}
            info['thr_b0'] = info.get('thr_b0', {})
            info['thr_b0'][Y] = {GROUPS[g]: {str(q): float(np.quantile(np.abs(D.b0[tr][D.grp[tr] == g] - 0.5), 1 - q)) if q < 1 else 0.0
                                             for q in COVERAGES} for g in range(3) if (D.grp[tr] == g).any()}
    return p, info


def best_single(D, nfeat):
    """Per fold: the single reading (with its group deviations) with the best inner score; also all 13 OOS paths."""
    singles = {}
    for j in range(nfeat):
        singles[j] = walk_forward(D, [j])[0]
    p = np.full(len(D.y), np.nan); chosen = {}
    for Y in TEST_YEARS:
        te = D.year == Y
        if te.sum() == 0 or Y not in D.first_of_year:
            continue
        tr = train_mask(D, Y, 'expanding')
        folds = inner_folds(D, tr)
        if not folds:
            continue
        best_j, best_s = None, np.inf
        for j in range(nfeat):
            sc = []
            for itr, iva in folds:
                C = CGRID[4]
                a, b = standardise(D.F, D.avail, itr, iva)
                w = None
                s_best = np.inf
                for C in CGRID:
                    w = fit_logit(design(a, D.inst_ix[itr], D.grp[itr], [j]), D.y[itr], C, D.off[itr], w)
                    pp = sigmoid(D.off[iva] + design(b, D.inst_ix[iva], D.grp[iva], [j]) @ w)
                    s_best = min(s_best, np.mean(monthly_score((pp - D.y[iva]) ** 2, D.month[iva])))
                sc.append(s_best)
            s = np.mean(sc)
            if s < best_s:
                best_j, best_s = j, s
        p[te] = singles[best_j][te]; chosen[Y] = FEAT[best_j] if nfeat == len(FEAT) else best_j
    return p, chosen, singles


def gbm_walk_forward(D, nfeat, seed=SEED):
    try:
        from sklearn.ensemble import HistGradientBoostingClassifier
    except ImportError:
        return None, 'scikit-learn not installed: GBM arm skipped'
    X = np.column_stack([np.where(D.avail[:, :nfeat], D.F[:, :nfeat], np.nan), D.inst_ix, D.off])
    cat = [False] * nfeat + [True, False]
    p = np.full(len(D.y), np.nan); iters = {}
    for Y in TEST_YEARS:
        te = D.year == Y
        if te.sum() == 0 or Y not in D.first_of_year:
            continue
        tr = train_mask(D, Y, 'expanding')
        folds = inner_folds(D, tr)
        sc = {k: [] for k in GBM_ITERS}
        for itr, iva in folds:
            m = HistGradientBoostingClassifier(max_depth=2, learning_rate=0.05, l2_regularization=1.0, min_samples_leaf=200,
                                               max_iter=max(GBM_ITERS), early_stopping=False, random_state=seed,
                                               categorical_features=cat)
            m.fit(X[itr], D.y[itr])
            for k, pp in enumerate(m.staged_predict_proba(X[iva]), start=1):
                if k in sc:
                    sc[k].extend(monthly_score((pp[:, 1] - D.y[iva]) ** 2, D.month[iva]).tolist())
        it = min(GBM_ITERS, key=lambda k: (np.mean(sc[k]) if sc[k] else np.inf, k)) if folds else 50
        m = HistGradientBoostingClassifier(max_depth=2, learning_rate=0.05, l2_regularization=1.0, min_samples_leaf=200,
                                           max_iter=it, early_stopping=False, random_state=seed, categorical_features=cat)
        m.fit(X[tr], D.y[tr])
        p[te] = m.predict_proba(X[te])[:, 1]; iters[Y] = it
    return p, iters


# ───────────────────────────── statistics ─────────────────────────────

def bss(p, b, y):
    return 1 - np.sum((p - y) ** 2) / np.sum((b - y) ** 2)


def block_index(ndates, rng, B=B_BOOT, block=BLOCK):
    """moving-block bootstrap of date positions 0..ndates-1."""
    nb = int(math.ceil(ndates / block))
    starts = rng.integers(0, max(1, ndates - block + 1), size=(B, nb))
    idx = (starts[:, :, None] + np.arange(block)[None, None, :]).reshape(B, -1)[:, :ndates]
    return idx


def per_date_sums(date_ix, vals_list):
    """sum each array over rows of the same test date -> (ndates, k) aligned to sorted unique dates."""
    u, inv = np.unique(date_ix, return_inverse=True)
    return u, np.column_stack([np.bincount(inv, v, minlength=len(u)) for v in vals_list])


def boot_ratio_ci(S, num_cols, den_cols, rng, fn):
    idx = block_index(S.shape[0], rng)
    draws = np.array([fn(S[i].sum(0)) for i in idx])
    return draws


def holm(pvals, alpha=0.05):
    p = np.asarray(pvals, float); m = len(p); order = np.argsort(p)
    adj = np.empty(m); run = 0.0
    for k, i in enumerate(order):
        run = max(run, min(1.0, (m - k) * p[i])); adj[i] = run
    return adj


def bh(pvals, q=0.10):
    p = np.asarray(pvals, float); m = len(p)
    if m == 0:
        return np.array([], bool)
    order = np.argsort(p); thr = q * np.arange(1, m + 1) / m
    passed = p[order] <= thr
    kmax = np.max(np.flatnonzero(passed)) + 1 if passed.any() else 0
    out = np.zeros(m, bool); out[order[:kmax]] = True
    return out


def chance_baseline(tests, passes, alpha=0.05):
    from math import comb
    pr = sum(comb(tests, k) * alpha ** k * (1 - alpha) ** (tests - k) for k in range(passes, tests + 1))
    return {'tests': tests, 'passes': passes, 'expected': tests * alpha, 'p_at_least': pr}


def recal(p, b0, y, w0=None):
    """logit P(y) = logit(b0) + a + b (logit p - logit b0); returns (a, b)."""
    x = np.log(p / (1 - p)) - np.log(b0 / (1 - b0))
    X = np.column_stack([np.ones(len(x)), x])
    w = fit_logit(X, y, 1e8, np.log(b0 / (1 - b0)), w0)
    return w


# ───────────────────────────── scoring one horizon ─────────────────────────────

def make_data(P, h, dates, feat_cols, Y_override=None):
    """Data object for horizon h from the long panel P (one row per date x inst)."""
    T, N = len(dates), len(INST)
    dpos = {d: i for i, d in enumerate(dates)}
    di = P.date.map(dpos).to_numpy(); ii = P.inst.map({k: i for i, k in enumerate(INST)}).to_numpy()
    Y = np.full((T, N), np.nan); END = np.full((T, N), -1)
    Y[di, ii] = P[f'y{h}'].to_numpy(float)
    e = pd.to_datetime(P[f'end{h}'])
    ok = e.notna().to_numpy()
    END[di[ok], ii[ok]] = e[ok].map(dpos).to_numpy()
    if Y_override is not None:
        Y = Y_override
    B = b0_matrix(dates, Y, END)
    F = np.full((T, N, len(feat_cols)), np.nan)
    for k, c in enumerate(feat_cols):
        F[di, ii, k] = P[c].to_numpy(float)
    avail = np.isfinite(F)
    for k, c in enumerate(feat_cols):                     # readings that do not exist for a group are 'absent', not missing
        if c == 'carry':
            avail[:, GIDX != 0, k] = False
        if c == 'ivrv':
            avail[:, GIDX == 0, k] = False
        if c == 'fxivrv':
            avail[:, GIDX != 0, k] &= False
        if c == 'surp':
            avail[:, np.array([r[5] == 0 for r in INSTRUMENTS]), k] = False
    present = np.zeros((T, N), bool); present[di, ii] = True
    # a row needs its label, a P0, and every reading that exists for its group
    need_ok = np.all(np.isfinite(F) | ~avail_mask_static(feat_cols)[None, :, :], axis=2)
    rows = present & np.isfinite(Y) & need_ok & (END >= 0)
    t_ix, i_ix = np.nonzero(rows)
    yr = dates.year.to_numpy(); mo = (dates.year * 12 + dates.month).to_numpy()
    first = {int(Yv): int(np.argmax(yr == Yv)) for Yv in sorted(set(yr))}
    D = Data(F[t_ix, i_ix], avail[t_ix, i_ix], Y[t_ix, i_ix], B[t_ix, i_ix], t_ix, i_ix, END[t_ix, i_ix],
             yr[t_ix], mo[t_ix], first)
    D.Yfull, D.ENDfull, D.Ffull, D.availfull = Y, END, F, avail
    return D


def avail_mask_static(feat_cols):
    """(N, K) True where reading k is expected to exist for instrument n (so a NaN there drops the row)."""
    A = np.ones((len(INST), len(feat_cols)), bool)
    for k, c in enumerate(feat_cols):
        if c == 'carry':
            A[GIDX != 0, k] = False
        if c == 'ivrv':
            A[GIDX == 0, k] = False
        if c == 'fxivrv':
            A[:, k] = np.array([r[0] in ('EURUSD', 'GBPUSD', 'USDJPY', 'USDCAD', 'AUDUSD', 'USDCHF') for r in INSTRUMENTS])
        if c == 'surp':
            A[np.array([r[5] == 0 for r in INSTRUMENTS]), k] = False
    return A


def shuffled_Y(Y, rng, block=BLOCK):
    T = Y.shape[0]; nb = int(math.ceil(T / block))
    order = rng.permutation(nb)
    idx = np.concatenate([np.arange(b * block, min(T, (b + 1) * block)) for b in order])
    return Y[idx]


def _shuffle_job(args):
    payload, s_ix = args
    D0, dates = payload
    rng = np.random.default_rng([SEED, 777, s_ix])
    Ys = shuffled_Y(D0.Yfull, rng)
    B = b0_matrix(dates, Ys, D0.ENDfull)
    ys = Ys[D0.date_ix, D0.inst_ix]
    ok = np.isfinite(ys)
    D = Data(D0.F[ok], D0.avail[ok], ys[ok], B[D0.date_ix, D0.inst_ix][ok], D0.date_ix[ok], D0.inst_ix[ok], D0.end_ix[ok],
             D0.year[ok], D0.month[ok], D0.first_of_year)
    p, _ = walk_forward(D, list(range(D.F.shape[1])))
    out = {}
    m = np.isfinite(p)
    for g in range(3):
        s = m & (D.grp == g)
        out[GROUPS[g]] = float(bss(p[s], D.b0[s], D.y[s])) if s.sum() else float('nan')
    return out


def shuffle_null(D, dates, n, jobs):
    if n == 0:
        return {g: [] for g in GROUPS}
    payload = (D, dates)
    if jobs > 1:
        with ProcessPoolExecutor(jobs) as ex:
            res = list(ex.map(_shuffle_job, [(payload, s) for s in range(n)], chunksize=1))
    else:
        res = [_shuffle_job((payload, s)) for s in range(n)]
    return {g: [r[g] for r in res] for g in GROUPS}


def score_cell(D, g, p, pm0, pbs, singles, shuf, info, rng, P_rows=None):
    """All statistics of one horizon x group cell."""
    m = np.isfinite(p) & (D.grp == g)
    if m.sum() == 0:
        return None
    y, b0 = D.y[m], D.b0[m]
    pp, p0, ps = p[m], pm0[m], pbs[m]
    dates = D.date_ix[m]
    u, S = per_date_sums(dates, [(pp - y) ** 2, (b0 - y) ** 2, (p0 - y) ** 2, (ps - y) ** 2])
    tot = S.sum(0)
    est = {'bss_b0': 1 - tot[0] / tot[1], 'bss_m0': 1 - tot[0] / tot[2],
           'bss_best_single': 1 - tot[3] / tot[1]}
    est['d_vs_single'] = est['bss_b0'] - est['bss_best_single']
    idx = block_index(len(u), rng)
    Sb = np.stack([S[i].sum(0) for i in idx])
    draws = {'bss_b0': 1 - Sb[:, 0] / Sb[:, 1], 'bss_m0': 1 - Sb[:, 0] / Sb[:, 2],
             'd_vs_single': (1 - Sb[:, 0] / Sb[:, 1]) - (1 - Sb[:, 3] / Sb[:, 1])}
    ci = {k: [float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))] for k, v in draws.items()}
    se_boot = float(np.std(draws['bss_b0'], ddof=1))
    sh = np.array([x for x in shuf if np.isfinite(x)])
    se_sh = float(np.std(sh, ddof=1)) if len(sh) > 2 else 0.0
    se = max(se_boot, se_sh)
    z = est['bss_b0'] / se if se > 0 else 0.0
    pval = 2 * (1 - ND.cdf(abs(z)))
    pct = float(np.mean(sh < est['bss_b0']) * 100) if len(sh) else float('nan')
    q95 = float(np.percentile(sh, 95)) if len(sh) else float('nan')
    # halves
    yrs = D.year[m]
    halves = {}
    for nm, (a, b) in (('H1', H1_YEARS), ('H2', (2022, 2026))):
        s = (yrs >= a) & (yrs <= b)
        halves[nm] = float(bss(pp[s], b0[s], y[s])) if s.sum() else float('nan')
    # reliability + recalibration
    a_b = recal(pp, b0, y)
    rb = []
    for i in idx[:500]:
        sel = np.isin(dates, u[i])
        try:
            rb.append(recal(pp[sel], b0[sel], y[sel], a_b))
        except Exception:
            pass
    rb = np.array(rb)
    dec = np.clip((np.argsort(np.argsort(pp)) * 10) // len(pp), 0, 9)
    rel = [{'decile': int(k), 'mean_p': float(pp[dec == k].mean()), 'share_up': float(y[dec == k].mean()), 'n': int((dec == k).sum())}
           for k in range(10) if (dec == k).any()]
    # abstention
    thr = np.array([info['thr'].get(int(Y), {}).get(GROUPS[g], {}).get(str(Q_GATE), np.nan) for Y in yrs])
    thr_b0 = np.array([info['thr_b0'].get(int(Y), {}).get(GROUPS[g], {}).get(str(Q_GATE), np.nan) for Y in yrs])
    conf = np.abs(pp - 0.5); call = pp > 0.5; corr = (call == (y > 0.5)).astype(float)
    conf0 = np.abs(b0 - 0.5); corr0 = ((b0 > 0.5) == (y > 0.5)).astype(float)
    curve = []
    for q in COVERAGES:
        tq = np.array([info['thr'].get(int(Y), {}).get(GROUPS[g], {}).get(str(q), np.nan) for Y in yrs])
        tq0 = np.array([info['thr_b0'].get(int(Y), {}).get(GROUPS[g], {}).get(str(q), np.nan) for Y in yrs])
        k = conf >= tq; k0 = conf0 >= tq0
        curve.append({'q': q, 'coverage': float(k.mean()), 'acc': float(corr[k].mean()) if k.any() else None,
                      'b0_coverage': float(k0.mean()), 'b0_acc': float(corr0[k0].mean()) if k0.any() else None})
    keep = conf >= thr; keep0 = conf0 >= thr_b0
    nk = int(keep.sum())
    acc = float(corr[keep].mean()) if nk else float('nan')
    # random abstention: same calls on random date-block subsets of equal size
    ud = np.unique(dates)
    rnd = []
    rr = np.random.default_rng([SEED, 31, g])
    for _ in range(N_RANDOM):
        sel_rows = []
        tot_n = 0
        starts = rr.integers(0, max(1, len(ud) - BLOCK + 1), size=len(ud))
        for s in starts:
            blk = np.isin(dates, ud[s:s + BLOCK])
            sel_rows.append(np.flatnonzero(blk)); tot_n += blk.sum()
            if tot_n >= nk:
                break
        sr = np.concatenate(sel_rows)[:max(nk, 1)]
        rnd.append(corr[sr].mean())
    rnd = np.array(rnd)
    u2, S2 = per_date_sums(dates, [corr * keep, keep.astype(float), corr0 * keep0, keep0.astype(float)])
    idx2 = block_index(len(u2), rng)
    Sb2 = np.stack([S2[i].sum(0) for i in idx2])
    with np.errstate(invalid='ignore', divide='ignore'):
        dacc = Sb2[:, 0] / Sb2[:, 1] - Sb2[:, 2] / Sb2[:, 3]
    acc0 = float(S2[:, 2].sum() / S2[:, 3].sum()) if S2[:, 3].sum() else float('nan')
    absten = {'q': Q_GATE, 'n_kept': nk, 'coverage': float(keep.mean()), 'acc': acc, 'random_p95': float(np.nanpercentile(rnd, 95)),
              'random_mean': float(np.nanmean(rnd)), 'b0_acc_own_coverage': acc0,
              'd_vs_b0_ci': [float(np.nanpercentile(dacc, 2.5)), float(np.nanpercentile(dacc, 97.5))],
              'mirror_bottom50_acc': float(corr[conf < np.median(conf)].mean()),
              'mirror_bottom50_b0_acc': float(corr0[conf < np.median(conf)].mean()), 'curve': curve}
    out = {'n_rows': int(m.sum()), 'n_dates': int(len(u)), 'est': est, 'ci': ci, 'se_boot': se_boot, 'se_shuffle': se_sh, 'se': se,
           'z': z, 'p': pval, 'shuffle_pct': pct, 'shuffle_q95': q95, 'n_shuffle': int(len(sh)), 'halves': halves,
           'recal_a': float(a_b[0]), 'recal_b': float(a_b[1]),
           'recal_b_ci': [float(np.percentile(rb[:, 1], 2.5)), float(np.percentile(rb[:, 1], 97.5))] if len(rb) > 10 else None,
           'reliability': rel, 'abstention': absten,
           'by_year': {int(Y): float(bss(pp[yrs == Y], b0[yrs == Y], y[yrs == Y])) for Y in sorted(set(yrs))},
           'hindsight_single': {FEAT[j]: float(bss(singles[j][m], b0, y)) for j in singles if np.isfinite(singles[j][m]).all()}}
    return out


def gates(c, holm_p, sign_stable):
    G = {}
    G['G1'] = bool(c['ci']['bss_b0'][0] > 0 and holm_p < 0.05)
    G['G2'] = bool(c['ci']['bss_m0'][0] > 0)
    G['G3'] = bool(c['est']['bss_b0'] > c['est']['bss_best_single'])
    G['G4'] = bool(np.isfinite(c['shuffle_q95']) and c['est']['bss_b0'] > c['shuffle_q95'])
    G['G5'] = bool(c['halves']['H1'] > 0 and c['halves']['H2'] > 0)
    G['G6'] = bool(c['recal_b'] >= 0.5)
    a = c['abstention']
    G['G7'] = bool(np.isfinite(a['acc']) and a['acc'] > a['random_p95'] and a['d_vs_b0_ci'][0] > 0)
    G['sign_stable'] = bool(sign_stable)
    return G


def cell_word(G, ci_hi, powered, U, gbm_pass=False):
    if all(G[k] for k in ('G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7')):
        return 'VALIDATED' if G['sign_stable'] else 'CONTEXT'
    if (G['G1'] and G['G4']) or gbm_pass:
        return 'CONTEXT'
    if not G['G1'] and powered and ci_hi < U:
        return 'NULL'
    return 'UNDERPOWERED'


def group_word(words):
    if 'VALIDATED' in words:
        return 'VALIDATED'
    if 'CONTEXT' in words:
        return 'CONTEXT'
    if all(w == 'NULL' for w in words):
        return 'NULL'
    return 'UNDERPOWERED'


def stability(info, ncols):
    """pooled slopes are columns 13..13+ncols of the primary design."""
    W = {Y: np.array(w)[len(INST):len(INST) + ncols] for Y, w in info['w'].items()}
    yrs = sorted(W)
    if not yrs:
        return {}, []
    M = np.array([W[Y] for Y in yrs])
    nf = len(yrs)
    need_n = math.ceil(7 / 9 * nf)
    out = {}
    stable = []
    for j in range(ncols):
        pos, neg = int((M[:, j] > 0).sum()), int((M[:, j] < 0).sum())
        st = max(pos, neg) >= need_n and max(pos, neg) > 0
        out[FEAT[j]] = {'w_by_year': {int(Y): float(M[k, j]) for k, Y in enumerate(yrs)}, 'n_pos': pos, 'n_neg': neg, 'sign_stable': bool(st)}
        if st:
            stable.append(FEAT[j])
    rc = []
    for k in range(1, nf):
        a, b = np.abs(M[k - 1]), np.abs(M[k])
        ra, rb = pd.Series(a).rank().to_numpy(), pd.Series(b).rank().to_numpy()
        rc.append(float(np.corrcoef(ra, rb)[0, 1]) if np.std(ra) > 0 and np.std(rb) > 0 else float('nan'))
    out['_rank_corr_consecutive'] = rc
    return out, stable


def r_table(D, P_idx, p, pbs, P, h, g, info_thr):
    """Descriptive R at 1 sigma on the learner's top-20% days (same threshold as G7)."""
    m = np.isfinite(p) & (D.grp == g)
    rows = P_idx[m]
    Rl, Rs, cost = P[f'Rl{h}'].to_numpy(float)[rows], P[f'Rs{h}'].to_numpy(float)[rows], P[f'cost{h}'].to_numpy(float)[rows]
    pp, b0, yrs = p[m], D.b0[m], D.year[m]
    thr = np.array([info_thr['thr'].get(int(Y), {}).get(GROUPS[g], {}).get(str(Q_GATE), np.nan) for Y in yrs])
    keep = np.abs(pp - 0.5) >= thr
    side = np.where(pp > 0.5, 1, -1)
    R = np.where(side > 0, Rl, Rs)
    ok = keep & np.isfinite(R)
    res = {'n': int(ok.sum())}
    if ok.sum() == 0:
        return res
    res['gross'] = float(R[ok].mean())
    res['net'] = float(np.nanmean(R[ok] - np.nan_to_num(cost[ok], nan=np.nanmedian(cost) if np.isfinite(cost).any() else 0.0)))
    res['cost_missing'] = int((~np.isfinite(cost[ok])).sum())
    rr = np.random.default_rng([SEED, 55, h, g])
    rnd = [np.where(rr.random(ok.sum()) < 0.5, Rl[ok], Rs[ok]).mean() for _ in range(N_RANDOM)]
    res['random_side_band'] = [float(np.percentile(rnd, 5)), float(np.percentile(rnd, 95))]
    res['b0_side'] = float(np.where(b0[ok] > 0.5, Rl[ok], Rs[ok]).mean())
    ps = pbs[m]
    thr_s = np.quantile(np.abs(ps - 0.5)[np.isfinite(ps)], 0.8) if np.isfinite(ps).any() else np.nan
    ks = (np.abs(ps - 0.5) >= thr_s) & np.isfinite(Rl)
    res['best_single_top20'] = float(np.where(ps[ks] > 0.5, Rl[ks], Rs[ks]).mean()) if ks.any() else None
    tr4 = P['tr4h'].to_numpy(float)[rows]
    k4 = np.isfinite(tr4) & (tr4 != 0) & np.isfinite(Rl)
    res['rule_4h_every_day'] = float(np.where(tr4[k4] > 0, Rl[k4], Rs[k4]).mean()) if k4.any() else None
    by = {}
    for Y in sorted(set(yrs[ok])):
        by[int(Y)] = float(R[ok][yrs[ok] == Y].mean())
    res['by_year_gross'] = by
    return res


# ───────────────────────────── orchestration ─────────────────────────────

def score_all(P, dates, cfg, nshuffle, jobs, descriptive=True):
    P = P.reset_index(drop=True)
    res = {'cells': {}, 'horizons': {}}
    feat_idx = list(range(len(FEAT)))
    pvals, keys = [], []
    stash = {}
    for h in HORIZONS:
        log(f'horizon {HNAME[h]}: building data')
        D = make_data(P, h, dates, FEAT)
        dpos = {d: i for i, d in enumerate(dates)}
        key_to_row = {(dpos[d], k): r for r, (d, k) in enumerate(zip(P.date, P.inst.map({x: i for i, x in enumerate(INST)})))}
        P_idx = np.array([key_to_row[(a, b)] for a, b in zip(D.date_ix, D.inst_ix)])
        log(f'horizon {HNAME[h]}: primary ({len(D.y)} rows)')
        p, info = walk_forward(D, feat_idx, keep=True)
        pm0, _ = walk_forward(D, [])
        log(f'horizon {HNAME[h]}: best single reading')
        pbs, chosen, singles = best_single(D, len(FEAT))
        log(f'horizon {HNAME[h]}: {nshuffle} shuffles')
        shuf = shuffle_null(D, dates, nshuffle, jobs)
        stab, stable = stability(info, len(FEAT))
        H = {'n_rows': int(len(D.y)), 'C': info['C'], 'best_single_chosen': chosen, 'stability': stab, 'sign_stable': stable,
             'shuffle_bss': shuf}
        rng = np.random.default_rng([SEED, h])
        for g in range(3):
            c = score_cell(D, g, p, pm0, pbs, singles, shuf[GROUPS[g]], info, rng)
            if c is None:
                continue
            c['R'] = r_table(D, P_idx, p, pbs, P, h, g, info) if cfg.with_R else None
            res['cells'][f'{HNAME[h]}|{GROUPS[g]}'] = c
            pvals.append(c['p']); keys.append(f'{HNAME[h]}|{GROUPS[g]}')
        if descriptive:
            H['descriptive'] = descriptive_arms(D, P, P_idx, h, dates, p, info, cfg)
        res['horizons'][HNAME[h]] = H
        stash[h] = (D, p)
    adj = holm(pvals)
    for k, a in zip(keys, adj):
        c = res['cells'][k]
        c['p_holm'] = float(a)
        hname = k.split('|')[0]
        stable = res['horizons'][hname]['sign_stable']
        c['gates'] = gates(c, a, len(stable) > 0)
        pw = POWER['cells'].get(k, {})
        U = pw.get('U', float('nan')); mde = pw.get('mde_holm_first', float('nan'))
        c['U'] = U; c['MDE'] = mde; c['powered'] = bool(np.isfinite(mde) and np.isfinite(U) and mde <= U)
        gb = res['horizons'][hname].get('descriptive', {}).get('gbm', {}).get(k.split('|')[1], {})
        c['gbm_pass'] = bool(gb.get('pass_G1_G4', False))
        c['word'] = cell_word(c['gates'], c['ci']['bss_b0'][1], c['powered'], U, c['gbm_pass'])
    res['group_words'] = {g: group_word([res['cells'][f'{HNAME[h]}|{g}']['word'] for h in HORIZONS if f'{HNAME[h]}|{g}' in res['cells']])
                          for g in GROUPS}
    res['falsifier_all_inside_shuffle_band'] = bool(all(c['est']['bss_b0'] <= c['shuffle_q95'] for c in res['cells'].values()
                                                        if np.isfinite(c['shuffle_q95'])))
    res['disaggregation'] = disaggregation(stash)
    return res


def disaggregation(stash):
    rows = []
    rng = np.random.default_rng([SEED, 99])
    for h, (D, p) in stash.items():
        for i, inst in enumerate(INST):
            m = np.isfinite(p) & (D.inst_ix == i)
            if m.sum() < 50:
                continue
            u, S = per_date_sums(D.date_ix[m], [(p[m] - D.y[m]) ** 2, (D.b0[m] - D.y[m]) ** 2])
            v = 1 - S[:, 0].sum() / S[:, 1].sum()
            idx = block_index(len(u), rng, B=1000)
            d = np.array([1 - S[k, 0].sum() / S[k, 1].sum() for k in idx])
            se = d.std(ddof=1)
            rows.append({'cell': f'{inst}|{HNAME[h]}', 'bss_b0': float(v), 'se': float(se), 'p': float(2 * (1 - ND.cdf(abs(v / se)))) if se > 0 else 1.0})
    passed = bh([r['p'] for r in rows]) if rows else []
    for r, ps in zip(rows, passed):
        r['bh_pass'] = bool(ps and r['bss_b0'] > 0)
    npass = int(sum(r['bh_pass'] for r in rows))
    return {'instrument_horizon': rows, 'chance_baseline': chance_baseline(len(rows), npass, 0.10)}


def descriptive_arms(D, P, P_idx, h, dates, p, info, cfg):
    out = {}
    m = np.isfinite(p)
    # event days vs other days
    evd = (P['ev_today'].to_numpy(float)[P_idx] > 0) | (P['ev_tmrw'].to_numpy(float)[P_idx] > 0)
    out['event_days'] = {GROUPS[g]: {'event': float(bss(p[m & evd & (D.grp == g)], D.b0[m & evd & (D.grp == g)], D.y[m & evd & (D.grp == g)])) if (m & evd & (D.grp == g)).sum() else None,
                                     'other': float(bss(p[m & ~evd & (D.grp == g)], D.b0[m & ~evd & (D.grp == g)], D.y[m & ~evd & (D.grp == g)])) if (m & ~evd & (D.grp == g)).sum() else None}
                         for g in range(3)}
    # concentration: without top 1% |move| days, last 3 years alone
    mv = P[f'mv{h}'].to_numpy(float)[P_idx]
    conc = {}
    for g in range(3):
        s = m & (D.grp == g)
        if not s.any():
            continue
        cut = np.nanquantile(mv[s], 0.99)
        s2 = s & (mv < cut)
        s3 = s & (D.year >= 2024)
        conc[GROUPS[g]] = {'without_top1pct': float(bss(p[s2], D.b0[s2], D.y[s2])), 'last3y': float(bss(p[s3], D.b0[s3], D.y[s3])) if s3.any() else None}
    out['concentration'] = conc
    if not cfg.descriptive_full:
        return out
    # rolling 3-year window
    pr, _ = walk_forward(D, list(range(len(FEAT))), window='rolling3')
    out['rolling3y'] = {GROUPS[g]: float(bss(pr[np.isfinite(pr) & (D.grp == g)], D.b0[np.isfinite(pr) & (D.grp == g)], D.y[np.isfinite(pr) & (D.grp == g)]))
                        for g in range(3) if (np.isfinite(pr) & (D.grp == g)).any()}
    # sigma 60 as the second scale for asia
    if 'asia60' in P.columns:
        cols = [c if c != 'asia' else 'asia60' for c in FEAT]
        D60 = make_data(P, h, dates, cols)
        p60, _ = walk_forward(D60, list(range(len(cols))))
        out['sigma60_asia'] = {GROUPS[g]: float(bss(p60[np.isfinite(p60) & (D60.grp == g)], D60.b0[np.isfinite(p60) & (D60.grp == g)], D60.y[np.isfinite(p60) & (D60.grp == g)]))
                               for g in range(3) if (np.isfinite(p60) & (D60.grp == g)).any()}
    # FX IV arm: FX rows of 2021-2026 with fxivrv, primary vs primary + fxivrv (same rows)
    if 'fxivrv' in P.columns and P['fxivrv'].notna().any():
        cols = FEAT + ['fxivrv']
        Dv = make_data(P, h, dates, cols)
        pa_, _ = walk_forward(Dv, list(range(len(FEAT))))
        pb_, _ = walk_forward(Dv, list(range(len(cols))))
        s = np.isfinite(pa_) & np.isfinite(pb_) & (Dv.grp == 0) & (Dv.year >= 2021) & Dv.avail[:, -1]
        out['fx_iv_arm'] = {'n': int(s.sum()), 'bss_without': float(bss(pa_[s], Dv.b0[s], Dv.y[s])) if s.any() else None,
                            'bss_with': float(bss(pb_[s], Dv.b0[s], Dv.y[s])) if s.any() else None}
    # GBM secondary
    if cfg.gbm:
        pg, iters = gbm_walk_forward(D, len(FEAT))
        if pg is None:
            out['gbm'] = {'skipped': iters}
        else:
            gb = {}
            rng = np.random.default_rng([SEED, 4242, h])
            for g in range(3):
                s = np.isfinite(pg) & (D.grp == g)
                if not s.any():
                    continue
                u, S = per_date_sums(D.date_ix[s], [(pg[s] - D.y[s]) ** 2, (D.b0[s] - D.y[s]) ** 2])
                v = 1 - S[:, 0].sum() / S[:, 1].sum()
                idx = block_index(len(u), rng)
                d = np.array([1 - S[k, 0].sum() / S[k, 1].sum() for k in idx])
                yrs = D.year[s]
                hv = [bss(pg[s][(yrs >= a) & (yrs <= b)], D.b0[s][(yrs >= a) & (yrs <= b)], D.y[s][(yrs >= a) & (yrs <= b)]) for a, b in (H1_YEARS, (2022, 2026))]
                q95 = (info.get('_shuffle_q95') or {}).get(GROUPS[g], np.nan)
                gb[GROUPS[g]] = {'bss_b0': float(v), 'ci': [float(np.percentile(d, 2.5)), float(np.percentile(d, 97.5))],
                                 'halves': [float(x) for x in hv], 'iters': iters}
            out['gbm'] = gb
    return out


def finish_gbm_gates(res):
    """GBM: G1 (raw p < 0.05, CI lower > 0) and G4 (above the logistic's shuffle 95th percentile) -> pass_G1_G4."""
    for hn, H in res['horizons'].items():
        gb = H.get('descriptive', {}).get('gbm', {})
        for g, v in gb.items():
            if not isinstance(v, dict) or 'bss_b0' not in v:
                continue
            c = res['cells'].get(f'{hn}|{g}')
            if c is None:
                continue
            v['pass_G1_G4'] = bool(v['ci'][0] > 0 and v['bss_b0'] > c['shuffle_q95'])
            if v['pass_G1_G4'] and c['word'] in ('NULL', 'UNDERPOWERED'):
                c['word'] = 'CONTEXT'; c['gbm_pass'] = True
    res['group_words'] = {g: group_word([res['cells'][k]['word'] for k in res['cells'] if k.endswith('|' + g)]) for g in GROUPS}
    return res


# ───────────────────────────── positive control ─────────────────────────────

def synthetic_targets(P, dates, ic, seed):
    """Synthetic daily returns on the REAL readings: r = ic*z + sqrt(1-ic^2)*e, z = standardised mean of trD,
    carry (FX) / sigreg (others), cot, asia; e cross-correlated (FX 0.47, gold 0.30 on the FX factor, indices 0.85).
    Targets y_h = 1{sum r over sessions t..t+h > 0}; end = t+h. Uses no real price outcome."""
    rng = np.random.default_rng(seed)
    T, N = len(dates), len(INST)
    dpos = {d: i for i, d in enumerate(dates)}
    di = P.date.map(dpos).to_numpy(); ii = P.inst.map({k: i for i, k in enumerate(INST)}).to_numpy()
    def mat(col):
        M = np.full((T, N), np.nan); M[di, ii] = P[col].to_numpy(float); return M
    comp = []
    for col in ('trD', 'carry', 'cot', 'asia'):
        M = mat(col)
        if col == 'carry':
            M = np.where(GIDX[None, :] == 0, M, mat('sigreg'))
        mu, sd = np.nanmean(M, 0), np.nanstd(M, 0); sd[sd == 0] = 1
        comp.append(np.nan_to_num((M - mu) / sd))
    z = sum(comp); z = (z - z.mean(0)) / np.where(z.std(0) > 0, z.std(0), 1)
    rho = np.where(GIDX == 2, 0.85, np.where(GIDX == 1, 0.30, 0.47))
    f1, f2 = rng.standard_normal(T), rng.standard_normal(T)
    fac = np.where(GIDX[None, :] == 2, f2[:, None], f1[:, None])
    e = np.sqrt(rho) * fac + np.sqrt(1 - rho) * rng.standard_normal((T, N))
    r = ic * z + math.sqrt(1 - ic ** 2) * e
    Q = P.copy()
    present = np.zeros((T, N), bool); present[di, ii] = True
    cs = np.vstack([np.zeros((1, N)), np.cumsum(r, 0)])
    for h in HORIZONS:
        Y = np.full((T, N), np.nan); END = np.full((T, N), np.datetime64('NaT'), dtype='datetime64[ns]')
        if h < T:
            Y[:T - h] = (cs[h + 1:] - cs[:T - h] > 0).astype(float)
            END[:T - h] = dates[h:].to_numpy()[:, None]
        Q[f'y{h}'] = Y[di, ii]; Q[f'end{h}'] = END[di, ii]; Q[f'mv{h}'] = np.abs(r[di, ii])
    return Q


def positive_control(P, dates, jobs, nshuffle=20):
    out = {}
    for ic, label in ((0.12, 'planted'), (0.0, 'null')):
        Q = synthetic_targets(P, dates, ic, [SEED, 1, int(ic * 100)])
        D = make_data(Q, 0, dates, FEAT)
        p, info = walk_forward(D, list(range(len(FEAT))), keep=True)
        shuf = shuffle_null(D, dates, nshuffle, jobs)['fx']
        m = np.isfinite(p) & (D.grp == 0)
        u, S = per_date_sums(D.date_ix[m], [(p[m] - D.y[m]) ** 2, (D.b0[m] - D.y[m]) ** 2])
        v = 1 - S[:, 0].sum() / S[:, 1].sum()
        idx = block_index(len(u), np.random.default_rng([SEED, 2]))
        d = np.array([1 - S[k, 0].sum() / S[k, 1].sum() for k in idx])
        lo = float(np.percentile(d, 2.5)); q95 = float(np.percentile(shuf, 95))
        flag = bool(lo > 0 and v > q95)
        out[label] = {'ic': ic, 'bss_b0_fx_h0': float(v), 'ci_lo': lo, 'shuffle_q95': q95, 'n_shuffle': len(shuf), 'flagged': flag}
    out['passed'] = bool(out['planted']['flagged'] and not out['null']['flagged'])
    return out


# ───────────────────────────── output ─────────────────────────────

def fmt(x, pct=True, nd=3):
    if x is None or (isinstance(x, float) and not np.isfinite(x)):
        return '—'
    return f'{100 * x:+.{nd}f}%' if pct else f'{x:.{nd}f}'


def write_results(res, out, meta):
    os.makedirs(out, exist_ok=True)
    def clean(o):
        if isinstance(o, dict):
            return {str(k): clean(v) for k, v in o.items()}
        if isinstance(o, (list, tuple)):
            return [clean(v) for v in o]
        if isinstance(o, (np.floating, float)):
            return None if not np.isfinite(o) else float(o)
        if isinstance(o, (np.integer,)):
            return int(o)
        if isinstance(o, np.bool_):
            return bool(o)
        return o
    json.dump(clean({**meta, **res}), open(os.path.join(out, 'results.json'), 'w'), indent=1)
    L = [f'# {SLUG} — results', '', f'Prereg: `{PREREG}`. Seed {SEED}. Run {meta["run_date"]}. '
         f'{"SELFTEST (synthetic data) — not a result." if meta.get("selftest") else "Data to 2026-08-21 (lockbox); nothing later read."}', '',
         '## Verdict per group (banked ids `bias-learner-<group>`)', '', '| Group | Word |', '|---|---|']
    for g, w in res['group_words'].items():
        L.append(f'| {g} | **{w}** |')
    L += ['', f'Card falsifier (every horizon and group inside the shuffled band): **{res["falsifier_all_inside_shuffle_band"]}**', '',
          '## The 12 scored cells (L2 logistic, BSS vs B0)', '',
          '| Cell | n rows | BSS_B0 [95% CI] | vs M0 | best single (chosen) | shuffle pct / q95 | z | Holm p | halves H1/H2 | recal b | top-20% acc vs random p95 / B0 | U / MDE | G1-G7 | Word |',
          '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|']
    for k, c in res['cells'].items():
        a = c['abstention']; G = c['gates']
        gs = ''.join('✓' if G[x] else '✗' for x in ('G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'))
        L.append(f"| {k} | {c['n_rows']} | {fmt(c['est']['bss_b0'])} [{fmt(c['ci']['bss_b0'][0])}, {fmt(c['ci']['bss_b0'][1])}] | "
                 f"{fmt(c['est']['bss_m0'])} | {fmt(c['est']['bss_best_single'])} | {c['shuffle_pct']:.0f} / {fmt(c['shuffle_q95'])} | "
                 f"{c['z']:+.2f} | {c['p_holm']:.3f} | {fmt(c['halves']['H1'])} / {fmt(c['halves']['H2'])} | {c['recal_b']:.2f} | "
                 f"{fmt(a['acc'], False)} vs {fmt(a['random_p95'], False)} / {fmt(a['b0_acc_own_coverage'], False)} | "
                 f"{fmt(c['U'])} / {fmt(c['MDE'])} | {gs}{'' if G['sign_stable'] else ' (no sign-stable reading)'} | **{c['word']}** |")
    L += ['', '## Weights: sign-stable readings (same sign in at least 7 of 9 folds)', '']
    for hn, H in res['horizons'].items():
        L.append(f"- {hn}: {', '.join(H['sign_stable']) or 'none'}; C by year {H['C']}; best single chosen {H['best_single_chosen']}")
    L += ['', '## R at 1 sigma on top-confidence days (descriptive)', '',
          '| Cell | n | gross R | net R | random side 5-95% | B0 side | best single top 20% | 4h rule every day |', '|---|---|---|---|---|---|---|---|']
    for k, c in res['cells'].items():
        R = c.get('R') or {}
        if R.get('n'):
            L.append(f"| {k} | {R['n']} | {R['gross']:+.3f} | {R['net']:+.3f} | {R['random_side_band'][0]:+.3f} / {R['random_side_band'][1]:+.3f} | "
                     f"{R['b0_side']:+.3f} | {R.get('best_single_top20') if R.get('best_single_top20') is None else round(R['best_single_top20'], 3)} | "
                     f"{R.get('rule_4h_every_day') if R.get('rule_4h_every_day') is None else round(R['rule_4h_every_day'], 3)} |")
    cb = res['disaggregation']['chance_baseline']
    L += ['', f"## Disaggregation (BH q = 0.10): {cb['passes']} of {cb['tests']} instrument x horizon cells pass "
          f"(chance P(at least that many) = {cb['p_at_least']:.3f}); candidates only, never a result.", '',
          'Descriptive arms (GBM, rolling 3y, sigma-60 Asia, FX-IV, event days, concentration), reliability deciles and the full '
          'accuracy-coverage curves are in `results.json`.', '', '## What this changes', '', '(edit by hand: prereg §8)']
    open(os.path.join(out, 'RESULTS.md'), 'w').write('\n'.join(L) + '\n')


# ───────────────────────────── main and selftest ─────────────────────────────

class Cfg:
    def __init__(self, **k):
        self.__dict__.update(k)


def run_real(cfg):
    t0 = time.time()
    P, raw = build_panel(cfg)
    dates = pd.DatetimeIndex(sorted(P.date.unique()))
    first = P.groupby('inst').date.min()
    log('first session per instrument:', first.to_dict())
    log('positive control (synthetic targets on real readings)')
    pc = positive_control(P, dates, cfg.jobs)
    os.makedirs(cfg.out, exist_ok=True)
    json.dump(pc, open(os.path.join(cfg.out, 'positive_control.json'), 'w'), indent=1)
    if not pc['passed']:
        raise SystemExit(f'POSITIVE CONTROL FAILED, no real target scored: {pc}')
    log('positive control passed; building real targets')
    costs = load_costs(cfg, raw) if cfg.with_R else None
    P = add_targets(P, raw, with_R=cfg.with_R, costs=costs)
    del raw
    # 2018 fold rule (prereg §3.5): fewer than 2,000 training rows before 2018 -> test span 2019-2026
    n_pre = int(((P.date < pd.Timestamp('2018-01-01')) & P.y0.notna()).sum())
    if n_pre < 2000:
        TEST_YEARS.remove(2018)
        log(f'2018 fold dropped ({n_pre} training rows before 2018)')
    res = score_all(P, dates, cfg, cfg.shuffles, cfg.jobs)
    res = finish_gbm_gates(res)
    meta = {'slug': SLUG, 'prereg': PREREG, 'seed': SEED, 'run_date': time.strftime('%Y-%m-%d'), 'lockbox': str(LOCKBOX.date()),
            'test_years': TEST_YEARS, 'n_rows_pre2018': n_pre, 'first_session': {k: str(v.date()) for k, v in first.items()},
            'positive_control': pc, 'runtime_s': time.time() - t0, 'n_shuffle': cfg.shuffles}
    write_results(res, cfg.out, meta)
    log('done', round(time.time() - t0), 's ->', cfg.out)


def synth_panel(ic, seed, years=('2016-01-04', '2026-08-21')):
    """A synthetic long panel with the real column layout (readings + targets + R), for the selftest."""
    rng = np.random.default_rng(seed)
    dates = pd.bdate_range(*years)
    T, N = len(dates), len(INST)
    rho = np.where(GIDX == 2, 0.85, np.where(GIDX == 1, 0.30, 0.47))
    f1, f2 = rng.standard_normal(T), rng.standard_normal(T)
    fac = np.where(GIDX[None, :] == 2, f2[:, None], f1[:, None])
    e = np.sqrt(rho) * fac + np.sqrt(1 - rho) * rng.standard_normal((T, N))
    past = np.vstack([np.zeros((1, N)), e[:-1]])
    def ar1(rho_, shape):
        x = np.zeros(shape); x[0] = rng.standard_normal(shape[1:])
        for t in range(1, shape[0]):
            x[t] = rho_ * x[t - 1] + math.sqrt(1 - rho_ ** 2) * rng.standard_normal(shape[1:])
        return x
    F = {}
    F['tr1h'] = past + 0.5 * rng.standard_normal((T, N))
    F['tr4h'] = pd.DataFrame(past).ewm(span=3).mean().to_numpy()
    F['trD'] = pd.DataFrame(past).ewm(span=20).mean().to_numpy()
    F['trW'] = pd.DataFrame(past).ewm(span=100).mean().to_numpy()
    ac = rng.standard_normal(T)[:, None]
    F['asia'] = np.sqrt(rho) * ac + np.sqrt(1 - rho) * rng.standard_normal((T, N))
    F['asia60'] = F['asia'] * 0.9
    F['cloc'] = np.clip(0.2 * past + 0.25 * rng.standard_normal((T, N)), -0.5, 0.5)
    ev = (rng.random(T) < 0.08).astype(float)
    F['ev_today'] = np.repeat(ev[:, None], N, 1); F['ev_tmrw'] = np.repeat(np.r_[ev[1:], 0][:, None], N, 1)
    sur = np.where(rng.random(T) < 0.1, rng.standard_normal(T), 0.0)
    F['surp'] = sur[:, None] * np.array([r[5] for r in INSTRUMENTS])[None, :]
    F['carry'] = np.where(GIDX[None, :] == 0, ar1(0.999, (T, N)), np.nan)
    F['cot'] = np.repeat(ar1(0.95, (T // 5 + 2, N)), 5, 0)[:T]
    F['sigreg'] = ar1(0.99, (T, N))
    F['ivrv'] = np.where(GIDX[None, :] == 0, np.nan, ar1(0.95, (T, N)))
    F['fxivrv'] = np.where((GIDX[None, :] == 0) & (dates.year.to_numpy()[:, None] >= 2020), ar1(0.95, (T, N)), np.nan)
    comp = [F['trD'], np.where(GIDX[None, :] == 0, F['carry'], F['sigreg']), F['cot'], F['asia']]
    z = sum((c - c.mean(0)) / c.std(0) for c in comp); z = (z - z.mean(0)) / z.std(0)
    r = ic * z + math.sqrt(1 - ic ** 2) * e
    cs = np.vstack([np.zeros((1, N)), np.cumsum(r, 0)])
    rows = {'date': np.repeat(dates.to_numpy(), N), 'inst': np.tile(INST, T)}
    for k, v in F.items():
        rows[k] = v.reshape(-1)
    for h in HORIZONS:
        Y = np.full((T, N), np.nan); END = np.full((T, N), np.datetime64('NaT'), dtype='datetime64[ns]'); MV = np.full((T, N), np.nan)
        Y[:T - h] = (cs[h + 1:] - cs[:T - h] > 0).astype(float); END[:T - h] = dates[h:].to_numpy()[:, None]
        MV[:T - h] = np.abs(cs[h + 1:] - cs[:T - h])
        rows[f'y{h}'] = Y.reshape(-1); rows[f'end{h}'] = END.reshape(-1); rows[f'mv{h}'] = MV.reshape(-1)
        mvr = (cs[h + 1:] - cs[:T - h]) / math.sqrt(h + 1)
        RL = np.full((T, N), np.nan); RL[:T - h] = np.maximum(mvr, -1.0)
        RS = np.full((T, N), np.nan); RS[:T - h] = np.maximum(-mvr, -1.0)
        rows[f'Rl{h}'] = RL.reshape(-1); rows[f'Rs{h}'] = RS.reshape(-1); rows[f'cost{h}'] = np.full(T * N, 0.02)
    return pd.DataFrame(rows), dates


def synth_m1(start, end, seed, drift=0.0):
    rng = np.random.default_rng(seed)
    t = pd.date_range(start, end, freq='min', tz='UTC', inclusive='left')
    tl = t.tz_convert(LON)
    t = t[(tl.dayofweek < 5)]
    lr = rng.standard_normal(len(t)) * 2e-4 + drift
    c = 1.1 * np.exp(np.cumsum(lr))
    o = np.r_[c[0], c[:-1]]
    hi = np.maximum(o, c) * (1 + 5e-5); lo = np.minimum(o, c) * (1 - 5e-5)
    return pd.DataFrame({'time': t.tz_localize(None), 'open': o, 'high': hi, 'low': lo, 'close': c})


def selftest(args):
    ok = True
    tmp = tempfile.mkdtemp(prefix='bias_learner_selftest_')
    log('selftest dir', tmp)
    # 1. lockbox: a parquet with bars after the cutoff -> read_m1 never materialises them
    m = synth_m1('2026-08-17', '2026-08-25', 1)
    p = os.path.join(tmp, 'lock_m1.parquet'); m.to_parquet(p)
    r = read_m1(p)
    c1 = r.time.max() < CUTOFF_UTC.tz_localize('UTC') and len(r) < len(m)
    log('lockbox filter:', 'OK' if c1 else 'FAIL'); ok &= c1
    try:
        need(os.path.join(tmp, 'nope.parquet')); c2 = False
    except DataMissing:
        c2 = True
    log('missing file fails loudly:', 'OK' if c2 else 'FAIL'); ok &= c2
    # 2. no lookahead in the price readings: perturb every bar after a date; readings up to it must not change
    m = synth_m1('2015-06-01', '2016-09-01', 2)
    f1 = instrument_frame(read_m1(_w(tmp, 'a', m)), 'EURUSD')
    cut = pd.Timestamp('2016-06-15')
    m2 = m.copy()
    tl = pd.to_datetime(m2.time).dt.tz_localize('UTC').dt.tz_convert(LON)
    after = (tl >= pd.Timestamp('2016-06-15 07:00', tz=LON)).to_numpy()
    m2.loc[after, ['open', 'high', 'low', 'close']] *= 1.07 + 0.05 * np.random.default_rng(3).random((after.sum(), 1))
    f2 = instrument_frame(read_m1(_w(tmp, 'b', m2)), 'EURUSD')
    cols = ['tr1h', 'tr4h', 'trD', 'trW', 'asia', 'cloc', 'sigreg', 'sig', 'P0']
    s = f1.index <= cut
    same = np.allclose(f1.loc[s, cols].to_numpy(float), f2.loc[s, cols].to_numpy(float), equal_nan=True)
    changed = not np.allclose(f1.loc[f1.index > cut + pd.Timedelta(days=30), 'trD'].to_numpy(float),
                              f2.loc[f2.index > cut + pd.Timedelta(days=30), 'trD'].to_numpy(float), equal_nan=True)
    c3 = same and changed
    log('readings use only bars completed before 07:00 (future perturbation):', 'OK' if c3 else 'FAIL'); ok &= c3
    nn = f1.loc[f1.index >= pd.Timestamp('2016-03-01'), ['tr1h', 'tr4h', 'trD', 'asia', 'cloc', 'sig']].notna().mean().min()
    c4 = nn > 0.95
    log(f'readings defined after warm-up (min share {nn:.2f}):', 'OK' if c4 else 'FAIL'); ok &= c4
    # 3. path R: a known path
    o = np.array([100, 100, 99.5, 98.0, 98.5]); hh = o + 0.2; ll = o - 0.2; cc = o
    rl, j = path_R(o, hh, ll, cc, 0, 4, 100.0, 1.0, 1)
    rs, _ = path_R(o, hh, ll, cc, 0, 4, 100.0, 1.0, -1)
    c5 = abs(rl - (-2.0)) < 1e-9 and j == 3 and abs(rs - 1.5) < 1e-9          # gap through 99 at bar 3 fills at its open 98
    log('path R (stop gap fills at the open; short exits at the close):', 'OK' if c5 else f'FAIL {rl} {j} {rs}'); ok &= c5
    # 4. B0 is point-in-time
    dates = pd.bdate_range('2020-01-01', periods=30)
    Y = np.zeros((30, 1)); Y[10:] = 1; END = np.arange(30)[:, None] + 2
    B = b0_matrix(dates, Y, END)
    c6 = abs(B[12, 0] - (0 + 10) / (10 + 20)) < 1e-12 and abs(B[13, 0] - (1 + 10) / (11 + 20)) < 1e-12
    log('B0 uses only labels realised before the session:', 'OK' if c6 else 'FAIL'); ok &= c6
    # 5. the learner: planted weak signal spread over 4 readings must be found above the shuffled band; null must not
    global TEST_YEARS
    cfg = Cfg(with_R=True, descriptive_full=args.full_selftest, gbm=args.full_selftest)
    for ic, label, want in ((0.10, 'planted', True), (0.0, 'null', False)):
        P, dates = synth_panel(ic, [SEED, 5, int(ic * 100)])
        res = score_all(P, dates, cfg, args.selftest_shuffles, args.jobs, descriptive=True)
        res = finish_gbm_gates(res)
        c = res['cells']['21:00|fx']
        flag = c['gates']['G1'] and c['gates']['G4']
        anyflag = any(x['gates']['G1'] and x['gates']['G4'] for x in res['cells'].values())
        log(f"{label} (IC {ic}): FX 21:00 BSS {fmt(c['est']['bss_b0'])} CI [{fmt(c['ci']['bss_b0'][0])}, {fmt(c['ci']['bss_b0'][1])}] "
            f"shuffle q95 {fmt(c['shuffle_q95'])} Holm p {c['p_holm']:.4f} G1&G4={flag}; any cell flagged={anyflag}; words {res['group_words']}")
        good = (flag if want else not anyflag)
        log(f'learner {label}:', 'OK' if good else 'FAIL'); ok &= good
        write_results(res, os.path.join(tmp, f'out_{label}'), {'slug': SLUG, 'seed': SEED, 'run_date': time.strftime('%Y-%m-%d'), 'selftest': True})
    # 6. positive control routine on a synthetic panel
    P, dates = synth_panel(0.0, [SEED, 9])
    pc = positive_control(P, dates, args.jobs, nshuffle=args.selftest_shuffles)
    log('positive_control routine:', 'OK' if pc['passed'] else 'FAIL', pc); ok &= pc['passed']
    print('SELFTEST PASSED' if ok else 'SELFTEST FAILED')
    return 0 if ok else 1


def _w(tmp, name, df):
    p = os.path.join(tmp, f'{name}_m1.parquet'); df.to_parquet(p); return p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--selftest', action='store_true')
    ap.add_argument('--full-selftest', action='store_true', help='selftest also runs GBM and the descriptive refits')
    ap.add_argument('--selftest-shuffles', type=int, default=20)
    ap.add_argument('--root', default='.')
    ap.add_argument('--m1-root', default='VolRangeForecaster/data/m1')
    ap.add_argument('--index-root', default='portfolioBacktest/cache')
    ap.add_argument('--feature-root', default=os.path.join(os.environ.get('MFX_DATA_ROOT', '.'), 'features'))
    ap.add_argument('--out', default='analysis/output/bias-learner')
    ap.add_argument('--shuffles', type=int, default=N_SHUFFLE)
    ap.add_argument('--jobs', type=int, default=max(1, (os.cpu_count() or 2) - 1))
    ap.add_argument('--no-gbm', action='store_true')
    ap.add_argument('--no-R', action='store_true', help='skip the descriptive R table (and the bid/ask files it needs)')
    a = ap.parse_args()
    os.environ.setdefault('OMP_NUM_THREADS', '1')
    if a.selftest:
        sys.exit(selftest(a))
    if a.shuffles != N_SHUFFLE:
        log(f'WARNING: {a.shuffles} shuffles, not the registered {N_SHUFFLE}; this run is not the registered run')
    cfg = Cfg(root=a.root, m1_root=a.m1_root, index_root=a.index_root, feature_root=a.feature_root, out=a.out,
              shuffles=a.shuffles, jobs=a.jobs, gbm=not a.no_gbm, with_R=not a.no_R, descriptive_full=True)
    run_real(cfg)


if __name__ == '__main__':
    main()
