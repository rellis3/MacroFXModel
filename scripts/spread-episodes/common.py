"""spread-episodes: shared loaders, causal zig-zag and point-in-time scales (forge/SPREAD_EPISODES_PREREG.md).

Everything here is causal: a value stamped at bar t uses data at or before t only; trailing scales are shifted one
session so the session being scored never informs its own threshold.
"""
import os, io, urllib.request
import numpy as np, pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'analysis', 'output', 'spread-episodes')
RAW = os.path.join(OUT, 'raw')
SEED = 20261020
END = pd.Timestamp('2026-08-21', tz='UTC')          # lockbox: nothing on/after this instant is read
SLOTS = 96                                          # 15-min slots per UTC day

# ---------------- periods (fixed in the prereg) ----------------
P1 = [('discover', '2024-04-15', '2025-05-31'), ('validate', '2025-06-01', '2025-12-31'), ('final', '2026-01-01', '2026-08-20')]
P2 = [('discover', '1999-01-04', '2012-12-31'), ('validate', '2013-01-01', '2019-12-31'), ('final', '2020-01-01', '2026-08-20')]


def period_of(dates, P):
    d = pd.to_datetime(pd.Series(dates)).dt.strftime('%Y-%m-%d').to_numpy()
    out = np.full(len(d), '', dtype=object)
    for name, a, b in P:
        out[(d >= a) & (d <= b)] = name
    return out


# ---------------- Case 1 loaders ----------------
def m1_to_15(path, time_col=None, start_label=True):
    """1-min bars stamped by their START -> 15-min closes stamped at the bar END (right-closed), plus 1-min counts."""
    d = pd.read_parquet(path)
    if time_col:
        t = pd.to_datetime(d[time_col], utc=True)
    else:
        t = pd.to_datetime(d.index, utc=True)
    s = pd.Series(d['close'].to_numpy(float), index=t).sort_index()
    s = s[~s.index.duplicated()]
    if start_label:
        s.index = s.index + pd.Timedelta('1min')    # stamp at the minute's end
    s = s[s.index <= END]
    g = s.resample('15min', label='right', closed='right')
    return g.last(), g.count(), s


def case1_matrices():
    """Day x slot matrices (UTC days) for the spread (bp) and log NAS100, aligned on the same 15-min end stamps."""
    sofr, ns, sofr1 = m1_to_15(os.path.join(ROOT, 'analysis/output/stir_1m_deep/CME_SR3U6.parquet'), 'time')
    eur, ne, eur1 = m1_to_15(os.path.join(ROOT, 'analysis/output/stir_1m_deep/ICEEU_IH7.parquet'), 'time')
    nas, nn, nas1 = m1_to_15(os.path.join(ROOT, 'VolRangeForecaster/data/m1/nas100_usd_m1.parquet'))
    t0 = max(sofr.first_valid_index(), eur.first_valid_index(), pd.Timestamp('2024-04-15', tz='UTC')).floor('D')      # registered window starts 2024-04-15: a deeper pull (pull_deep_history.py) must not move it
    G = pd.date_range(t0 + pd.Timedelta('15min'), END, freq='15min')
    S = sofr.reindex(G); E = eur.reindex(G); N = nas.reindex(G)
    S[ns.reindex(G).fillna(0) < 5] = np.nan; E[ne.reindex(G).fillna(0) < 5] = np.nan; N[nn.reindex(G).fillna(0) < 5] = np.nan
    spread = ((100 - S) - (100 - E)) * 100.0          # SOFR rate - Euribor rate, bp
    # a 15-min bar ending at 00:00 belongs to the previous UTC day's last slot
    day = (G - pd.Timedelta('1ns')).floor('D')
    slot = ((G - day) / pd.Timedelta('15min')).astype(int) - 1
    days = pd.DatetimeIndex(sorted(set(day)))
    di = days.get_indexer(day)
    shp = (len(days), SLOTS)
    X = np.full(shp, np.nan); P = np.full(shp, np.nan); SL = np.full(shp, np.nan); EL = np.full(shp, np.nan)
    X[di, slot] = spread.to_numpy(); P[di, slot] = np.log(N.to_numpy()); SL[di, slot] = S.to_numpy(); EL[di, slot] = E.to_numpy()
    return dict(days=days, X=X, P=P, S=SL, E=EL, raw=dict(sofr1=sofr1, eur1=eur1, nas1=nas1))


def quality_days(SL, EL):
    """Prior screen (cog-pinned-history Amendment 1): a day needs >= 3 distinct 15-min prices on each leg."""
    ds = np.array([len(np.unique(r[np.isfinite(r)])) for r in SL]); de = np.array([len(np.unique(r[np.isfinite(r)])) for r in EL])
    return (ds >= 3) & (de >= 3)


# ---------------- Case 2 loaders ----------------
def fred(series):
    os.makedirs(RAW, exist_ok=True)
    p = os.path.join(RAW, f'{series}.csv')
    if not os.path.exists(p):
        loc = os.path.join(ROOT, 'analysis/output/ys_long/fred', f'{series}.csv')
        if os.path.exists(loc):
            txt = open(loc, encoding='utf-8-sig').read()
        else:
            txt = urllib.request.urlopen(f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}', timeout=60).read().decode('utf-8-sig')
        open(p, 'w', encoding='utf-8').write(txt)
    d = pd.read_csv(p, encoding='utf-8-sig')
    d.columns = ['date', series]
    d['date'] = pd.to_datetime(d['date'])
    d[series] = pd.to_numeric(d[series], errors='coerce')
    return d.set_index('date')[series]


def case2_frame():
    y2, y10, fx = fred('DGS2'), fred('DGS10'), fred('DEXUSEU')
    df = pd.concat([y2, y10, fx], axis=1).loc['1999-01-04':'2026-08-20']
    df = df.dropna()
    df['AVG'] = (df['DGS2'] + df['DGS10']) / 2
    df['SLOPE'] = df['DGS10'] - df['DGS2']
    df['P'] = np.log(df['DEXUSEU'])
    return df


# ---------------- causal scales ----------------
def day_rms_scale(x_mat, h, valid, lookback=20):
    """Case 1: per-day mean of squared h-bar changes (within the flattened valid series), trailing `lookback`-day mean,
    shifted one day; returns per-bar scale on the flattened index plus the flat arrays."""
    flat = x_mat[valid]
    didx = np.where(valid)[0]
    d = np.full(len(flat), np.nan); d[h:] = flat[h:] - flat[:-h]
    sq = pd.Series(d ** 2).groupby(didx).mean()
    sc = np.sqrt(sq.rolling(lookback, min_periods=max(5, lookback // 2)).mean().shift(1))
    return sc.reindex(didx).to_numpy()


def row_rms_scale(x, h, lookback=250):
    d = pd.Series(x).diff(h)
    return np.sqrt((d ** 2).rolling(lookback, min_periods=lookback // 2).mean().shift(1)).to_numpy()


# ---------------- causal adaptive zig-zag ----------------
def zigzag(x, th):
    """Turn = bar of the running extreme; confirm = first bar where the move away from it reaches th[t].
    Returns arrays (turn_idx, confirm_idx, dir) where dir is the NEW leg direction (+1 up, -1 down)."""
    turns, confs, dirs = [], [], []
    trend = 0; hi = lo = ext = np.nan; hi_i = lo_i = ext_i = -1
    for t in range(len(x)):
        v = x[t]; k = th[t]
        if not (np.isfinite(v) and np.isfinite(k) and k > 0):
            continue
        if trend == 0:
            if not np.isfinite(hi):
                hi = lo = v; hi_i = lo_i = t
            if v > hi: hi, hi_i = v, t
            if v < lo: lo, lo_i = v, t
            if v - lo >= k:
                trend = 1; turns.append(lo_i); confs.append(t); dirs.append(1); ext, ext_i = v, t
            elif hi - v >= k:
                trend = -1; turns.append(hi_i); confs.append(t); dirs.append(-1); ext, ext_i = v, t
        elif trend == 1:
            if v > ext: ext, ext_i = v, t
            elif ext - v >= k:
                trend = -1; turns.append(ext_i); confs.append(t); dirs.append(-1); ext, ext_i = v, t
        else:
            if v < ext: ext, ext_i = v, t
            elif v - ext >= k:
                trend = 1; turns.append(ext_i); confs.append(t); dirs.append(1); ext, ext_i = v, t
    return np.array(turns, int), np.array(confs, int), np.array(dirs, int)


def cluster_t(y, cl):
    """Mean, cluster-robust t (sum of cluster sums / sqrt(sum of squared cluster sums), de-meaned), n."""
    y = np.asarray(y, float); k = np.isfinite(y)
    y, cl = y[k], np.asarray(cl)[k]
    n = len(y)
    if n < 5:
        return np.nan, np.nan, n
    m = y.mean()
    s = pd.Series(y - m).groupby(cl).sum().to_numpy()
    se = np.sqrt((s ** 2).sum()) / n
    return float(m), float(m / se) if se > 0 else np.nan, n


def bh(p, q=0.10):
    p = np.asarray(p, float); ok = np.isfinite(p); out = np.zeros(len(p), bool)
    if ok.sum() == 0: return out
    idx = np.where(ok)[0]; ps = p[idx]; o = np.argsort(ps); m = len(ps)
    thr = q * (np.arange(1, m + 1) / m); passed = ps[o] <= thr
    if passed.any():
        kmax = np.max(np.where(passed)[0]); out[idx[o[:kmax + 1]]] = True
    return out
