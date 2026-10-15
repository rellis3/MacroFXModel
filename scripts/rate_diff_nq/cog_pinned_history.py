"""forge/COG_PINNED_HISTORY_CONFIRM_PREREG.md -- one run. The identified line (SOFR Sep26 - Euribor Mar27, pinned, both live) on the deep 1-min history, with everything before
2026-04-13 as an untouched holdout. P1 divergence catch-up, P2 line turns while Nasdaq has not yet, P3 same-hour sanity, plus the reported lead grid.
Output analysis/output/cog_video_0918/PINNED_HISTORY.md"""
import warnings; warnings.filterwarnings('ignore')
import numpy as np, pandas as pd
from scipy.stats import norm
OUT = 'analysis/output/cog_video_0918/'; rng = np.random.default_rng(20261015)
T = lambda s: pd.Timestamp(s, tz='UTC'); HOLD_END = T('2026-04-13')
def ld(p):
    d = pd.read_parquet(p); d['time'] = pd.to_datetime(d['time'], utc=True); return d.set_index('time').sort_index()
def r15(p):
    g = ld(p)['close'].resample('15min', label='right', closed='right'); l, n = g.last(), g.count(); l[n < 5] = np.nan; return 100 - l
sofr, eur = r15('analysis/output/stir_1m_deep/CME_SR3U6.parquet'), r15('analysis/output/stir_1m_deep/ICEEU_IH7.parquet')
first = max(sofr.first_valid_index(), eur.first_valid_index()); G = pd.date_range(first.floor('D') + pd.Timedelta('15min'), T('2026-10-10'), freq='15min')
LINE_ALL = ((sofr.reindex(G) - eur.reindex(G)) * 100)
# Nasdaq: OANDA CFD cache for the holdout (ends 2026-08-20, never touches the lockbox), CME NQ futures for April-October
cfd = pd.read_parquet('VolRangeForecaster/data/m1/nq_m1.parquet')['close']; cfd.index = pd.to_datetime(cfd.index, utc=True)
cfd15 = np.log(cfd.resample('15min', label='right', closed='right').last()).reindex(G)
fut = pd.read_parquet('analysis/output/rate_curve_structure/bars15.parquet')['NQ']; fut.index = pd.to_datetime(fut.index, utc=True); fut = fut.reindex(G)
DAY = pd.Series(G.date, index=G); HOUR = G.hour.to_numpy()
# quality screen (Amendment 1): drop days where either leg has < 3 distinct 15-minute prices (5th percentile of the already-seen April-October days)
dist = lambda s: s.groupby(pd.Series(s.index.date, index=s.index)).agg(lambda x: x.dropna().nunique())
ds, de = dist(sofr.reindex(G)), dist(eur.reindex(G)); bad = set(d for d in ds.index if ds[d] < 3 or de.get(d, 0) < 3)
allday = sorted(set(DAY)); keep_day = np.array([d not in bad for d in DAY.values])
LINE = LINE_ALL.where(keep_day)
HOLD = np.asarray(G < HOLD_END) & keep_day & np.asarray(cfd15.notna()) & np.asarray(LINE.notna()); NQ_H = cfd15
AFTER = np.asarray(G >= HOLD_END) & np.asarray(G <= T('2026-10-10')) & np.asarray(fut.notna()) & np.asarray(LINE.notna())
hold_days = sorted(set(DAY[HOLD])); print(f'first bar {first}; holdout days with data {len(hold_days)}; days removed by the quality screen {len(bad & set(DAY[np.asarray(G < HOLD_END)]))}')
L = ['# COG-PINNED-HISTORY-CONFIRM results', '', 'Run once per forge/COG_PINNED_HISTORY_CONFIRM_PREREG.md.', '',
     f'Holdout: {G[HOLD].min() if HOLD.any() else None} to 2026-04-12, {len(hold_days)} days with both legs and Nasdaq; the quality screen removed {len(bad & set(DAY[np.asarray(G < HOLD_END)]))} days. Pair legs SR3U6 and IH7 (live throughout); April-October = the earlier sample.', '']
def zprior(x, mask):
    d = pd.Series(np.asarray(x) ** 2, index=G).groupby(DAY.values).mean(); sd = np.sqrt(d.rolling(20, min_periods=10).mean()).shift(1); return (x / DAY.map(sd)).to_numpy()
def cl(x, y, half):
    k = half & np.isfinite(x) & np.isfinite(y)
    if k.sum() < 300: return np.nan, np.nan, int(k.sum()), np.nan
    xs, ys = (x[k] - x[k].mean()) / x[k].std(), (y[k] - y[k].mean()) / y[k].std(); p = pd.Series(xs * ys, index=DAY.values[k]).groupby(level=0).sum(); n = k.sum()
    se = np.sqrt((p ** 2).sum()) / n; return float(np.mean(xs * ys)), float(p.sum() / np.sqrt((p ** 2).sum())), int(n), float(se)
def fwd(NQ, n): return (NQ.shift(-n) - NQ).to_numpy()
def build(NQ, half):
    out = {}; line = LINE
    z = lambda s, n: zprior(s - s.shift(n), None)
    out['dz4'] = z(line, 16) - z(NQ, 16); out['dz8'] = z(line, 32) - z(NQ, 32)
    out['x1'] = z(line, 4); out['x4'] = z(line, 16); out['x15'] = z(line, 1); return out
def p_one_sided(r, t): return float(norm.sf(t)) if np.isfinite(t) else np.nan
# ---------------- P3, P1, grid on a given sample ----------------
def tests(NQ, half, label):
    f = build(NQ, half); rows = {}
    rows['P3 same-hour (1 h line change vs Nasdaq 1 h return)'] = cl(f['x1'], (NQ - NQ.shift(4)).to_numpy(), half)
    rows['P1 primary: divergence (4 h) -> Nasdaq next 8 h'] = cl(f['dz4'], fwd(NQ, 32), half)
    rows['P1 secondary: divergence (8 h) -> next 8 h'] = cl(f['dz8'], fwd(NQ, 32), half)
    rows['P1 secondary: divergence (4 h) -> next 4 h'] = cl(f['dz4'], fwd(NQ, 16), half)
    return rows
HR = tests(NQ_H, HOLD, 'holdout'); AR = tests(fut, AFTER, 'apr-oct')
L += ['## P3 and P1', '', '| test | holdout rho | t | days-clustered SE | n bars | p one-sided (>0) | Apr-Oct rho | t | min detectable rho (2.8 SE, holdout) |', '|---|---|---|---|---|---|---|---|---|']
for k in HR:
    r, t, n, se = HR[k]; ar, at, an, ase = AR[k]; L.append(f'| {k} | {r:+.3f} | {t:+.2f} | {se:.3f} | {n} | {p_one_sided(r, t):.3f} | {ar:+.3f} | {at:+.2f} | {2.8 * se:.3f} |')
L.append('')
# ---------------- P2 : zig-zag trend states ----------------
def theta_rms(x):
    d = (x - x.shift(16)); dd = pd.Series(np.asarray(d) ** 2, index=G).groupby(DAY.values).mean(); sd = np.sqrt(dd.rolling(20, min_periods=10).mean()).shift(1); return DAY.map(sd).to_numpy()
def zigzag(x, base, k):
    n = len(x); state = np.full(n, np.nan); ev = []; trend = 0; hi = lo = np.nan; hi_i = lo_i = ext_i = -1; ext = np.nan
    for t in range(n):
        v = x[t]; th = k * base[t]
        if not np.isfinite(v) or not np.isfinite(th) or th <= 0: continue
        if trend == 0:
            if not np.isfinite(hi): hi = lo = v; hi_i = lo_i = t
            if v > hi: hi, hi_i = v, t
            if v < lo: lo, lo_i = v, t
            if v - lo >= th: trend = 1; ev.append((t, lo_i, 1)); ext, ext_i = v, t
            elif hi - v >= th: trend = -1; ev.append((t, hi_i, -1)); ext, ext_i = v, t
        elif trend == 1:
            if v > ext: ext, ext_i = v, t
            elif ext - v >= th: trend = -1; ev.append((t, ext_i, -1)); ext, ext_i = v, t
        else:
            if v < ext: ext, ext_i = v, t
            elif v - ext >= th: trend = 1; ev.append((t, ext_i, 1)); ext, ext_i = v, t
        if trend != 0: state[t] = trend
    return state, ev
def p2(NQ, half):
    sL, evL = zigzag(LINE.to_numpy(), theta_rms(LINE), 0.75); sN, evN = zigzag(NQ.to_numpy(), theta_rms(NQ), 0.75); cells = {}
    for d in (1, -1):
        isd = (sN == d); nxt = np.minimum.accumulate(np.where(isd, np.arange(len(G)), len(G) * 10)[::-1])[::-1]
        for hn, H in (('1h', 4), ('2h', 8), ('4h', 16), ('8h', 32)):
            succ = (nxt - np.arange(len(G))) <= H; ev_day = {}; base_day = {}
            for b in np.where(half & np.isfinite(sN) & (sN == -d))[0]:
                e = base_day.setdefault(DAY.iloc[b], [0, 0]); e[0] += 1; e[1] += int(succ[b])
            for (tc, te, dr) in evL:
                if dr != d or not half[tc] or not np.isfinite(sN[tc]) or sN[tc] != -d: continue
                e = ev_day.setdefault(DAY.iloc[tc], [0, 0]); e[0] += 1; e[1] += int(succ[tc])
            cells[(d, hn)] = (ev_day, base_day)
    days = sorted({dd for c in cells.values() for dd in list(c[0]) + list(c[1])})
    def pooled(pick):
        diffs = []
        for (ev_day, base_day) in cells.values():
            e0 = e1 = b0 = b1 = 0
            for i in pick:
                x = ev_day.get(days[i]); y = base_day.get(days[i])
                if x: e0 += x[0]; e1 += x[1]
                if y: b0 += y[0]; b1 += y[1]
            if e0 >= 1 and b0 >= 1: diffs.append(e1 / e0 - b1 / b0)
        return np.mean(diffs) if diffs else np.nan
    est = pooled(range(len(days))); bs = [pooled(rng.choice(len(days), len(days))) for _ in range(1000)]; bs = np.array([b for b in bs if np.isfinite(b)]); se = bs.std()
    nE = sum(v[0] for c in cells.values() for v in c[0].values()); per = {k: (sum(v[0] for v in c[0].values()), (sum(v[1] for v in c[0].values()) / max(1, sum(v[0] for v in c[0].values()))) - (sum(v[1] for v in c[1].values()) / max(1, sum(v[0] for v in c[1].values())))) for k, c in cells.items()}
    return est, se, est / se if se > 0 else np.nan, nE, 2.8 * se, per, len(evL), len(evN)
for name, NQ, half in (('holdout', NQ_H, HOLD), ('Apr-Oct (earlier sample)', fut, AFTER)):
    est, se, z, nE, mde, per, nl, nn = p2(NQ, half)
    L += [f'## P2 ({name}): pooled extra chance that Nasdaq turns the same way within 1-8 h after the line turns while it has not', '', f'pooled difference {est * 100:+.1f} percentage points, bootstrap SE {se * 100:.1f}, z {z:+.2f}, p one-sided {p_one_sided(est, z):.3f}; events counted over the 8 cells {nE}; minimum detectable {mde * 100:.1f} pp (2.8 SE); line flips {nl}, Nasdaq flips {nn} across the whole window.', '',
          '| direction, H | events | extra chance (pp) |', '|---|---|---|'] + [f'| {d:+d}, {h} | {v[0]} | {v[1] * 100:+.1f} |' for (d, h), v in sorted(per.items())] + ['']
# ---------------- lead grid ----------------
HB = {'15m': 1, '30m': 2, '1h': 4, '2h': 8, '4h': 16, '8h': 32, '24h': 96, '48h': 192}
def grid(NQ, half):
    f = build(NQ, half); r = {}
    for wn in ('x15', 'x1', 'x4'):
        r[wn] = {h: cl(f[wn], fwd(NQ, n), half)[:2] for h, n in HB.items()}
    return r
GH, GA = grid(NQ_H, HOLD), grid(fut, AFTER)
names = {'x15': '15 min', 'x1': '1 h', 'x4': '4 h'}
for title, Gd in (('holdout (before 2026-04-13)', GH), ('April-October 2026 (the earlier sample)', GA)):
    L += [f'## Lead grid, {title}: correlation (t) of the line change over W with Nasdaq return over the next H', '', '| W \\ H | ' + ' | '.join(HB) + ' |', '|---|' + '---|' * len(HB)]
    for wn in ('x15', 'x1', 'x4'): L.append(f'| {names[wn]} | ' + ' | '.join(f'{Gd[wn][h][0]:+.3f} ({Gd[wn][h][1]:+.1f})' for h in HB) + ' |')
    L.append('')
open(OUT + 'PINNED_HISTORY.md', 'w', encoding='utf-8').write('\n'.join(L)); print('written')
