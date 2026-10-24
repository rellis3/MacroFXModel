"""Independent re-implementation of the level-touch measurement (null audit, 2026-10-24).

Does NOT import any repo JS or the study's functions. Re-derives from the raw M1 parquet:
  London-calendar sessions (>=200 bars), London daily OHLC, causal sigma (YZ-N / EWMA as the
  fitted spec names), the open-anchored ladder (oh/ol p50/p75/p90), the dynamic H-L rungs,
  the daily-open retest, armed/rearm touch detection, and the rest-of-session MFE/|MAE|
  measured from the bar AFTER the touch.

Constants copied by value from the repo (definitions, not code):
  js/forecastLadderParams.js (width multipliers, estimator, event.none) -> ladder_params.json
  js/volBacktestEngine.js  BM_P50=1.572, BM_P75=2.049, ASSET_PARAMS hl corrections
  analysis/line_touch_response_study.mjs  BM_P90=2.555, REARM_FRAC=0.3, MIN_LOOKBACK=60

Prices are cast to float32 then back, because the JS loader packs them in Float32Array;
without the cast a handful of touches at exact equality flip.
"""
import json, math, os
import numpy as np
import pandas as pd
import pyarrow.parquet as pq
from numba import njit

HERE = os.path.dirname(os.path.abspath(__file__))
M1_DIR = os.environ.get('M1_DIR', os.path.join(HERE, '..', '..', '..', 'VolRangeForecaster', 'data', 'm1'))

BM_P50, BM_P75, BM_P90 = 1.572, 2.049, 2.555
HLCORR = {'fx': (0.82, 0.817), 'index': (1.01, 0.967), 'commodity': (0.898, 0.914)}
REARM = 0.3
MIN_LOOKBACK = 60
HORIZONS = np.array([5, 15, 30, 60, 120], dtype=np.int64)
INDEX = {'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'}
FAMS = ['hl50', 'hl75', 'hl90', 'oh50', 'oh75', 'oh90', 'dopen']


def asset_class(pair):
    if pair == 'gold':
        return 'commodity'
    return 'index' if pair in INDEX else 'fx'


def load_m1(pair, m1_dir=None):
    t = pq.read_table(os.path.join(m1_dir or M1_DIR, f'{pair}_m1.parquet'))
    # Timestamp = LAST column (as the JS loader reads it). spx/dow store a naive 'time' column
    # that is UTC (checked against spx500/us30: identical closes at shift 0, check_spx_tz.py).
    ts = pd.to_datetime(t.column(t.num_columns - 1).to_pandas())
    if ts.dt.tz is None: ts = ts.dt.tz_localize('UTC')
    sec = ts.dt.tz_convert('UTC').dt.as_unit('s').astype('int64').to_numpy()
    o = t.column('open').to_numpy().astype(np.float32).astype(np.float64)
    h = t.column('high').to_numpy().astype(np.float32).astype(np.float64)
    l = t.column('low').to_numpy().astype(np.float32).astype(np.float64)
    c = t.column('close').to_numpy().astype(np.float32).astype(np.float64)
    order = np.argsort(sec, kind='stable')
    sec, o, h, l, c = sec[order], o[order], h[order], l[order], c[order]
    # London calendar date via the tz database's own UTC offset (not a hand-written BST rule).
    lon = pd.to_datetime(sec, unit='s', utc=True).tz_convert('Europe/London')
    local = lon.tz_localize(None).values.astype('datetime64[D]')
    key = np.datetime_as_string(local, unit='D')
    return sec, o, h, l, c, key


def sessions(sec, key, min_bars=200):
    """List of (date, start, end_exclusive) for London dates with >= min_bars bars.
    Bars are already time-sorted, and a London date is contiguous in time."""
    chg = np.flatnonzero(key[1:] != key[:-1]) + 1
    starts = np.concatenate([[0], chg]); ends = np.concatenate([chg, [len(key)]])
    out, dropped = [], []
    for s, e in zip(starts, ends):
        (out if e - s >= min_bars else dropped).append((key[s], s, e))
    return out, dropped


def _roll_var(x, n):
    s = pd.Series(x)
    return s.rolling(n, min_periods=n).var(ddof=1).to_numpy()


def sigma_series(d_o, d_h, d_l, d_c, est):
    """As-of-close sigma (daily fraction) for each day index; value at i uses days <= i."""
    n = len(d_o)
    if est.startswith('yz_'):
        w = int(est[3:])
        on = np.full(n, np.nan); on[1:] = np.log(d_o[1:] / d_c[:-1])
        oc = np.log(d_c / d_o); u = np.log(d_h / d_o); d = np.log(d_l / d_o)
        rs = u * (u - oc) + d * (d - oc)
        k = 0.34 / (1.34 + (w + 1) / (w - 1))
        v = _roll_var(on, w) + k * _roll_var(oc, w) + (1 - k) * pd.Series(rs).rolling(w, min_periods=w).mean().to_numpy()
        return np.sqrt(np.maximum(v, 0))
    if est.startswith('ewma_'):
        lam = int(est[5:]) / 100.0
        r = np.full(n, np.nan); r[1:] = np.log(d_c[1:] / d_c[:-1])
        out = np.full(n, np.nan); mp = 20
        seed = r[1:mp + 1]
        var = np.var(seed, ddof=1)
        out[mp] = var
        for i in range(mp + 1, n):
            var = lam * var + (1 - lam) * r[i] ** 2
            out[i] = var
        return np.sqrt(np.maximum(out, 0))
    raise ValueError(est)


def round2(x):
    return math.floor(x * 100 + 0.5) / 100


@njit(cache=True)
def forward(t, h, l, c, k, e, entry, dirn, hz):
    """Rest-of-session excursion from bar k+1; returns maxExt, maxAdv, eodRet, ret@hz, mfe@hz, mae@hz."""
    nh = len(hz)
    ret = np.empty(nh); mfe = np.empty(nh); mae = np.empty(nh)
    hi = -1e300; lo = 1e300; hidx = 0
    t0 = t[k]
    for j in range(k + 1, e):
        a = (h[j] - entry) * dirn; b = (l[j] - entry) * dirn
        fav = a if a > b else b; adv = b if a > b else a
        if fav > hi: hi = fav
        if adv < lo: lo = adv
        mins = (t[j] - t0) / 60.0
        while hidx < nh and mins >= hz[hidx]:
            ret[hidx] = (c[j] - entry) * dirn; mfe[hidx] = hi; mae[hidx] = lo; hidx += 1
    eod = (c[e - 1] - entry) * dirn
    while hidx < nh:
        ret[hidx] = eod; mfe[hidx] = hi; mae[hidx] = lo; hidx += 1
    return hi, lo, eod, ret, mfe, mae


@njit(cache=True)
def walk_static(h, l, c, s, e, here, inner, is_up):
    """Armed/rearm touch walker for one static level. Returns bar indices of touches."""
    rearm = 0.3 * abs(here - inner)
    armed = True
    out = []
    for k in range(s, e):
        if not armed:
            away = (here - c[k]) if is_up else (c[k] - here)
            if away >= rearm: armed = True
            continue
        px = h[k] if is_up else l[k]
        if not ((px >= here) if is_up else (px <= here)): continue
        armed = False
        out.append(k)
    return out


@njit(cache=True)
def walk_dynamic(h, l, c, s, e, open_, frac, frac_inner, is_up):
    """Dynamic H-L rung: anchor = running opposite extreme through bar k-1 (starts at the open)."""
    ext = open_; armed = True; sg = 1.0 if is_up else -1.0
    out = []; lev = []
    for k in range(s, e):
        a = ext
        here = a * (1 + sg * frac)
        inner = a * (1 + sg * frac_inner)
        rearm = 0.3 * abs(here - inner)
        if is_up:
            if l[k] < ext: ext = l[k]
        else:
            if h[k] > ext: ext = h[k]
        if not armed:
            away = (here - c[k]) if is_up else (c[k] - here)
            if away >= rearm: armed = True
            continue
        px = h[k] if is_up else l[k]
        if not ((px >= here) if is_up else (px <= here)): continue
        armed = False
        out.append(k); lev.append(here)
    return out, lev


@njit(cache=True)
def walk_dopen(h, l, c, s, e, open_, p_up, p_dn):
    """Daily-open retest. Returns (bar index, side +1/-1)."""
    ks = []; sides = []
    if not (p_up > open_ and p_dn < open_ and p_dn > 0): return ks, sides
    ru = 0.3 * (p_up - open_); rd = 0.3 * (open_ - p_dn)
    broken = False; side = 0; armed = False
    for k in range(s, e):
        ua = h[k] - open_; da = open_ - l[k]
        if not broken:
            if ua >= ru: broken = True; side = 1; armed = True
            elif da >= rd: broken = True; side = -1; armed = True
            continue
        if not armed:
            if ua >= ru or da >= rd: armed = True
            continue
        if not (l[k] <= open_ and h[k] >= open_): continue
        armed = False
        ks.append(k); sides.append(side)
    return ks, sides


def day_table(pair, sec, o, h, l, c, key, params):
    """Per-session geometry: open, sigma (causal), dayScale, oh/ol rung prices, hl fracs."""
    sess, dropped = sessions(sec, key)
    d_o = np.array([o[s] for _, s, e in sess]); d_c = np.array([c[e - 1] for _, s, e in sess])
    d_h = np.array([h[s:e].max() for _, s, e in sess]); d_l = np.array([l[s:e].min() for _, s, e in sess])
    sym = pair.upper()
    p = params['pairs'].get(sym)
    ac = asset_class(pair)
    if p is None:
        p = params['classDefaults'][ac]
    sig = sigma_series(d_o, d_h, d_l, d_c, p['estimator'])
    ev = p.get('event', {}).get('none', 1) or 1
    c50, c75 = HLCORR[ac]
    rows = []
    for i in range(MIN_LOOKBACK, len(sess)):
        sg = sig[i - 1]                       # forecast for day i = as-of-close of day i-1
        if not (np.isfinite(sg) and sg > 0): continue
        date, s, e = sess[i]
        op = o[s]
        fr = (BM_P50 * c50 * sg, BM_P75 * c75 * sg, BM_P90 * c75 * sg)
        spct = sg * ev * 100
        up = [op] + [op * (1 + round2(m * spct) / 100) for m in p['width']['oh']]
        dn = [op] + [op * (1 - round2(m * spct) / 100) for m in p['width']['ol']]
        rows.append(dict(date=date, s=s, e=e, open=op, sigma=sg, dayScale=round(op * sg, 5),
                         up=up, dn=dn, fr=fr))
    return rows, sess, dropped


def touches_for_day(t, h, l, c, d, scale=1.0, fams=FAMS):
    """All touches of one day. scale != 1 builds a PHANTOM geometry: every ladder width and
    every H-L fraction multiplied by `scale`, the daily-open anchor shifted by (scale-1) x the
    p50 distance. Same touch rules, same rearm fraction, same forward measure."""
    s, e, op = d['s'], d['e'], d['open']
    out = []
    fr = [f * scale for f in d['fr']]
    for ri in range(3):
        fam = f'hl{["50","75","90"][ri]}'
        if fam not in fams: continue
        fin = 0.0 if ri == 0 else fr[ri - 1]
        for is_up in (True, False):
            ks, lv = walk_dynamic(h, l, c, s, e, op, fr[ri], fin, is_up)
            for k, lev in zip(ks, lv):
                out.append((fam, 1 if is_up else -1, k, lev))
    up = [op + (x - op) * scale for x in d['up']]
    dn = [op + (x - op) * scale for x in d['dn']]
    for side, lv in ((1, up), (-1, dn)):
        for ri in range(3):
            fam = f'oh{["50","75","90"][ri]}'
            if fam not in fams: continue
            here, inner = lv[ri + 1], lv[ri]
            if not (here > 0 and inner > 0): continue
            for k in walk_static(h, l, c, s, e, here, inner, side == 1):
                out.append((fam, side, k, here))
    if 'dopen' in fams:
        anchor = op + (scale - 1) * (d['up'][1] - op) if scale != 1 else op
        pu = anchor + (d['up'][1] - op); pd_ = anchor - (op - d['dn'][1])
        ks, sides = walk_dopen(h, l, c, s, e, anchor, pu, pd_)
        for k, sd in zip(ks, sides):
            out.append(('dopen', sd, k, anchor))
    res = []
    for fam, side, k, lev in out:
        if k + 1 >= e: continue
        entry = c[k]
        if not entry > 0: continue
        mx, mn, eod, ret, mfe, mae = forward(t, h, l, c, k, e, entry, float(side), HORIZONS)
        res.append(dict(family=fam, side=side, k=k, t=int(t[k]), level=lev, entry=entry,
                        maxExt=mx, maxAdv=mn, eod=eod, ret=ret, minsLeft=round((t[e - 1] - t[k]) / 60)))
    return res


# ── Planting (step 3) ────────────────────────────────────────────────────────────────────
@njit(cache=True)
def plant_session(o, h, l, c, s, e, up, dn, p, delta, ramp, u):
    """Online walk of the REAL open-anchored ladder (oh/ol p50/p75/p90, same armed/rearm rule
    as the study). On each touch, with probability p, push the rest of the session back
    against the touch by `delta` price units, ramped linearly over `ramp` bars. Mutates o,h,l,c.
    Returns the number of planted reactions."""
    armed = np.ones(6, dtype=np.bool_)
    planted = 0; ui = 0
    for k in range(s, e):
        for r in range(6):
            is_up = r < 3
            ri = r % 3
            here = up[ri + 1] if is_up else dn[ri + 1]
            inner = up[ri] if is_up else dn[ri]
            rearm = 0.3 * abs(here - inner)
            if not armed[r]:
                away = (here - c[k]) if is_up else (c[k] - here)
                if away >= rearm: armed[r] = True
                continue
            px = h[k] if is_up else l[k]
            if not ((px >= here) if is_up else (px <= here)): continue
            armed[r] = False
            if u[ui % len(u)] < p:
                planted += 1
                sg = -1.0 if is_up else 1.0          # fade: push back against the touch
                for j in range(k + 1, e):
                    f = min(1.0, (j - k) / ramp) * delta * sg
                    o[j] += f; h[j] += f; l[j] += f; c[j] += f
            ui += 1
    return planted


def plant_pair(pair, sec, o, h, l, c, key, params, p, delta_frac, seed, ramp=30):
    """Plant a fade of delta_frac x dayScale at every real oh/ol rung touch with prob p.
    Levels are rebuilt day by day from the PLANTED history (sigma from planted prior days,
    open of the planted session), i.e. exactly the levels the study will see when it re-reads
    the planted parquet, so every planted reaction sits on a line the study detects."""
    o2, h2, l2, c2 = o.copy(), h.copy(), l.copy(), c.copy()
    sess, _ = sessions(sec, key)
    sym = pair.upper(); ac = asset_class(pair)
    pp = params['pairs'].get(sym) or params['classDefaults'][ac]
    ev = pp.get('event', {}).get('none', 1) or 1
    nd = len(sess)
    d_o = np.array([o2[s] for _, s, e in sess]); d_c = np.array([c2[e - 1] for _, s, e in sess])
    d_h = np.array([h2[s:e].max() for _, s, e in sess]); d_l = np.array([l2[s:e].min() for _, s, e in sess])
    rng = np.random.default_rng(seed)
    n = 0
    for i in range(MIN_LOOKBACK, nd):
        date, s, e = sess[i]
        lo_i = max(0, i - 400)      # YZ-10 needs 11 days; EWMA memory at lambda .94 is ~0 after 400
        sg = sigma_series(d_o[:i], d_h[:i], d_l[:i], d_c[:i], pp['estimator'])[-1] if pp['estimator'].startswith('ewma') \
            else sigma_series(d_o[lo_i:i], d_h[lo_i:i], d_l[lo_i:i], d_c[lo_i:i], pp['estimator'])[-1]
        if not (np.isfinite(sg) and sg > 0): continue
        op = o2[s]; spct = sg * ev * 100
        up = np.array([op] + [op * (1 + round2(m * spct) / 100) for m in pp['width']['oh']])
        dn = np.array([op] + [op * (1 - round2(m * spct) / 100) for m in pp['width']['ol']])
        u = rng.random(64)
        n += plant_session(o2, h2, l2, c2, s, e, up, dn, p, delta_frac * round(op * sg, 5), float(ramp), u)
        d_c[i] = c2[e - 1]; d_h[i] = h2[s:e].max(); d_l[i] = l2[s:e].min()
    return o2, h2, l2, c2, n


def write_parquet(path, sec, o, h, l, c):
    import pyarrow as pa
    tbl = pa.table({'open': o, 'high': h, 'low': l, 'close': c, 'volume': np.zeros(len(o)),
                    'datetime': pa.array(sec.astype('int64') * 10**9, type=pa.timestamp('ns', tz='UTC'))})
    pq.write_table(tbl, path)
