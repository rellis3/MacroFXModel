"""VOL-CURVE-FRONT — the pre-registered test in forge/VOL_CURVE_FRONT_PREREG.md (commit 98770791).

Front = VIX9D / VIX against PRODUCTION-equivalent NQ/SPX lines (yz-10 on NY-close bars x event multiplier, production
widths). H5 range; H6 follow on DEAR-front days; H7 fade on CALM-front days; two trade shapes each. Net of costs.
    python analysis/surfaces/vol_curve_front.py
"""
import numpy as np, pandas as pd

INST = {
    'NQ':  dict(file='nq', vol='VXN', ev={'FOMC': 1.197, 'NFP': 1.017, 'CPI': 1.024, 'high': 1.033, 'none': 0.979},
                hl=[1.4067, 1.8869, 2.4836], oh=[0.6262, 1.0844, 1.5552], ol=[0.5632, 1.087, 1.7954]),
    'SPX': dict(file='spx500', vol='VIX', ev={'FOMC': 1.192, 'NFP': 1.103, 'CPI': 1.025, 'high': 1.041, 'none': 0.943},
                hl=[1.3858, 1.8815, 2.4806], oh=[0.6144, 1.0573, 1.5595], ol=[0.559, 1.0725, 1.7748]),
}
COST, SLIP = 0.008 / 100, 0.008 / 100
FRONT = (0.8858, 0.9669)
SPLIT, CAL_END = pd.Timestamp('2021-01-01'), pd.Timestamp('2026-07-02')
RNG = np.random.default_rng(20261004)
out = []
def p(s=''): out.append(str(s)); print(s, flush=True)

def cboe(n):
    d = pd.read_csv(f'analysis/surfaces/cboe/{n}.csv'); d.columns = [c.strip().upper() for c in d.columns]
    return pd.Series(d.CLOSE.values, index=pd.to_datetime(d.DATE, format='%m/%d/%Y').astype('datetime64[ns]')).sort_index()
V = pd.DataFrame({n: cboe(n) for n in ('VIX9D', 'VIX', 'VXN')}); V.index.name = 'date'; V = V.reset_index()

# event tags exactly as forge/vol.py load_event_tags
cal = pd.read_csv('calendar_events.csv', encoding='latin-1', low_memory=False)
cal = cal[(cal.impact == 'Major') & (cal.ccy == 'USD')]
RANK = {'FOMC': 6, 'NFP': 5, 'CPI': 4, 'high': 3}
def tag_of(ev):
    l = str(ev).lower()
    return 'FOMC' if ('fed press conference' in l or 'fomc' in l or 'interest rate decision' in l) else 'NFP' if 'payroll jobs growth' in l else 'CPI' if 'inflation rate' in l else 'high'
TAGS = {}
for d, ev in zip(cal.date, cal.event):
    t = tag_of(ev)
    if RANK[t] > RANK.get(TAGS.get(d), 0): TAGS[d] = t

def yz(d, n=10):
    o, h, l, c = [np.log(d[k]) for k in ('open', 'high', 'low', 'close')]
    k = 0.34 / (1.34 + (n + 1) / (n - 1)); rs = (h - o) * (h - c) + (l - o) * (l - c)
    return np.sqrt((o - c.shift(1)).rolling(n).var() + k * (c - o).rolling(n).var() + (1 - k) * rs.rolling(n).mean())

def resolve(H, L, C, entry, target, stop, long_):
    hT = (H >= target) if long_ else (L <= target); hS = (L <= stop) if long_ else (H >= stop)
    iT = int(np.argmax(hT)) if hT.any() else 10 ** 9; iS = int(np.argmax(hS)) if hS.any() else 10 ** 9
    if iT == iS == 10 ** 9: return (C[-1] - entry) * (1 if long_ else -1)
    if iS <= iT: return -(abs(entry - stop))           # tie -> stop
    return abs(target - entry)

rows, days_rows = [], []
for inst, P in INST.items():
    m = pd.read_parquet(f'VolRangeForecaster/data/m1/{P["file"]}_m1.parquet')
    # NY-close daily bars (17:00 New York): key = calendar date of (NY time + 7 h)
    ny = m.index.tz_convert('America/New_York')
    key = (ny + pd.Timedelta(hours=7)).normalize().tz_localize(None)
    nyd = m.groupby(key).agg(open=('open', 'first'), high=('high', 'max'), low=('low', 'min'), close=('close', 'last'), n=('close', 'size'))
    nyd = nyd[(nyd.n >= 60) & (nyd.index.dayofweek < 5)]
    nyd['sig'] = yz(nyd); nyd.index = nyd.index.astype('datetime64[ns]'); nyd.index.name = 'date'
    lt = m.index.tz_convert('Europe/London'); keep = lt.dayofweek < 5
    m, lt = m[keep], lt[keep]
    m = m.assign(day=lt.normalize().tz_localize(None))
    d = m.groupby('day').agg(open=('open', 'first'), high=('high', 'max'), low=('low', 'min'), close=('close', 'last'))
    d.index = d.index.astype('datetime64[ns]'); d = d[d.index <= CAL_END]
    base = pd.DataFrame({'date': d.index})
    sg = pd.merge_asof(base, nyd[['sig']].reset_index(), on='date', allow_exact_matches=False)   # NY sessions ended before London day t
    vv = pd.merge_asof(base, V, on='date', allow_exact_matches=False)
    d['sig'] = sg.sig.values
    d['front'] = (vv.VIX9D / vv.VIX).values
    d['level'] = (vv[P['vol']] / 100 / np.sqrt(252)).values / d.sig.values
    d['tag'] = [TAGS.get(x.strftime('%Y-%m-%d'), 'none') for x in d.index]
    d['sigu'] = d.sig * d.tag.map(P['ev'])
    d = d.dropna(subset=['sig', 'front', 'level'])
    A = d[d.index < SPLIT]; le = A.level.quantile([1 / 3, 2 / 3]).values
    d['lv'] = np.select([d.level < le[0], d.level >= le[1]], ['LOW', 'HIGH'], 'MID')
    d['fs'] = np.select([d.front < FRONT[0], d.front >= FRONT[1]], ['CALM', 'DEAR'], 'NORMAL')
    d['exceed'] = (d.high - d.low) / d.open > P['hl'][1] * d.sigu
    d['inst'] = inst; days_rows.append(d)
    for day, bars in m[m.day <= CAL_END].groupby('day'):
        day = pd.Timestamp(day)
        if day not in d.index: continue
        r = d.loc[day]; o, su = r.open, r.sigu
        H, L, O, C = bars.high.values, bars.low.values, bars.open.values, bars.close.values
        for side, w in (('OH', P['oh']), ('OL', P['ol'])):
            g = 1 if side == 'OH' else -1
            L50, L75, L90 = (o * (1 + g * x * su) for x in w)
            hit = (H >= L75) if g > 0 else (L <= L75)
            if not hit.any(): continue
            ti = int(np.argmax(hit)); entry = max(L75, O[ti]) if g > 0 else min(L75, O[ti])
            if (g > 0 and entry >= L90) or (g < 0 and entry <= L90): continue
            hH, hL = H[ti + 1:], L[ti + 1:]
            q = 0.2 * su * o
            # follow G1 / G2 (trade direction = g)
            s1 = L50; u1 = abs(entry - s1)
            f1 = resolve(hH, hL, C, entry, L90, s1, g > 0) / u1 - (COST + SLIP) * entry / u1
            s2 = L75 - g * q; u2 = abs(entry - s2)
            f2 = resolve(hH, hL, C, entry, entry + g * 5 * u2, s2, g > 0) / u2 - (COST + SLIP) * entry / u2 if u2 > 0 else np.nan
            # fade G1 / G2 (trade direction = -g)
            u3 = abs(L90 - entry)
            d1 = resolve(hH, hL, C, entry, L50, L90, g < 0) / u3 - COST * entry / u3
            s4 = L75 + g * q; u4 = abs(s4 - entry)
            ok4 = (g > 0 and entry < s4) or (g < 0 and entry > s4)
            d2 = resolve(hH, hL, C, entry, L50, s4, g < 0) / u4 - COST * entry / u4 if ok4 and u4 > 0 else np.nan
            rows.append(dict(inst=inst, day=day, side=side, fs=r.fs, lv=r.lv, tag=r.tag, f1=f1, f2=f2, d1=d1, d2=d2,
                             f1c=f1 - (COST + SLIP) * entry / u1, f2c=(f2 - (COST + SLIP) * entry / u2) if u2 > 0 else np.nan,
                             d1c=d1 - COST * entry / u3, d2c=(d2 - COST * entry / u4) if ok4 and u4 > 0 else np.nan))
    p(f'{inst}: {len(d)} days, {sum(1 for x in rows if x["inst"] == inst)} touches')

D = pd.concat(days_rows); D['half'] = np.where(D.index < SPLIT, 'A', 'B')
T = pd.DataFrame(rows); T['half'] = np.where(T.day < SPLIT, 'A', 'B'); T['year'] = T.day.dt.year
p('\n# VOL-CURVE-FRONT results (pre-registered: forge/VOL_CURVE_FRONT_PREREG.md, commit 98770791)\n')
p(f'{len(D)} index-days, {len(T)} first p75 touches (NQ + SPX), {D.index.min().date()} -> {D.index.max().date()}\n')

# H5
p('## H5 range: share of days past the PRODUCTION hl p75 (design 25%)')
p(D.groupby(['half', 'fs']).exceed.agg(['mean', 'size']).round(3).unstack(0).to_string()); p()
def logit(X, y, it=30):
    b = np.zeros(X.shape[1])
    for _ in range(it):
        pr = 1 / (1 + np.exp(-(X @ b))); W = pr * (1 - pr)
        b += np.linalg.solve(X.T @ (X * W[:, None]) + 1e-9 * np.eye(X.shape[1]), X.T @ (y - pr))
    pr = 1 / (1 + np.exp(-(X @ b))); se = np.sqrt(np.diag(np.linalg.inv(X.T @ (X * (pr * (1 - pr))[:, None]))))
    return b, se
h5 = True
for h in ('A', 'B'):
    s = D[D.half == h]
    X = np.column_stack([np.ones(len(s)), s.lv == 'LOW', s.lv == 'HIGH', s.fs == 'CALM', s.fs == 'DEAR', s.inst == 'SPX']).astype(float)
    b, se = logit(X, s.exceed.astype(float).values)
    names = ['const', 'level LOW', 'level HIGH', 'front CALM', 'front DEAR', 'SPX']
    p(f'half {h}: ' + ', '.join(f'{n} {bb:+.3f} (z {bb / e:+.1f})' for n, bb, e in zip(names, b, se)))
    dear, calm = s[s.fs == 'DEAR'].exceed.mean(), s[s.fs == 'CALM'].exceed.mean()
    h5 = h5 and dear > calm and b[4] > 0 and b[4] / se[4] >= 2
p(f'H5 -> {"PASS" if h5 else "FAIL"}\n')

p('## Reported: front x level, share past production hl p75 (n)')
p(D.groupby(['half', 'lv', 'fs']).exceed.agg(['mean', 'size']).round(3).unstack(2).to_string()); p()
p('## Reported: event split on DEAR-front days (production lines already widen event days)')
p(D[D.fs == 'DEAR'].assign(event=lambda x: np.where(x.tag == 'none', 'no Major event', 'Major event')).groupby(['half', 'event']).exceed.agg(['mean', 'size']).round(3).to_string()); p()

def boot_ci(sub, col, level=0.99, B=2000):
    sub = sub.dropna(subset=[col]); u, inv = np.unique(sub.day.values, return_inverse=True)
    sums = np.bincount(inv, weights=sub[col].values); cnts = np.bincount(inv)
    ms = [(lambda i: sums[i].sum() / cnts[i].sum())(RNG.integers(0, len(u), len(u))) for _ in range(B)]
    a = (1 - level) / 2; return np.quantile(ms, [a, 1 - a])
def shuffle_bench(state, col, B=500):
    vals = []
    for _ in range(B):
        sh = T.groupby(['inst', 'year']).fs.transform(lambda x: RNG.permutation(x.values))
        vals.append(T.loc[sh == state, col].mean())
    return np.nanquantile(vals, 0.95)
def verdict(name, state, col, colc, short_side, both_sides=False):
    cell = T[(T.fs == state)].dropna(subset=[col])
    p(f'## {name}: n={len(cell)}')
    hv = cell.groupby('half')[col].agg(['mean', 'size']).round(4); p(hv.to_string())
    c1 = len(hv) == 2 and all(hv['mean'] > 0)
    lo, hi = boot_ci(cell, col); c2 = lo > 0
    per = cell.groupby('inst')[col].mean().round(4); c3 = (per > 0).all() and len(per) == 2
    bench = shuffle_bench(state, col); c4 = cell[col].mean() > bench
    c5 = cell[colc].mean() > 0
    sides = cell.groupby('side')[col].mean().round(4)
    c6 = (sides > 0).all() if both_sides else sides.get(short_side, -1) > 0
    p(f'pooled {cell[col].mean():.4f}, 99% day-clustered CI [{lo:.4f}, {hi:.4f}] · per instrument {per.to_dict()} · by touch side {sides.to_dict()}')
    p(f'shuffled-front 95th pct {bench:.4f} · at 2x costs {cell[colc].mean():.4f}')
    chk = {'1 both halves': bool(c1), '2 CI excludes 0': bool(c2), '3 both instruments': bool(c3), '4 beats shuffle': bool(c4), '5 positive 2x cost': bool(c5), '6 shorts / both sides': bool(c6)}
    p(f'checks {chk} -> {"PASS" if all(chk.values()) else "FAIL"}')
    p('by year: ' + str(cell.groupby('year')[col].mean().round(3).to_dict())); p()
    return all(chk.values())
r6a = verdict('H6-G1 follow on DEAR days, line race (target p90, stop p50)', 'DEAR', 'f1', 'f1c', 'OL')
r6b = verdict('H6-G2 follow on DEAR days, break shape (stop 0.2 sigma, target 5R)', 'DEAR', 'f2', 'f2c', 'OL')
r7a = verdict('H7-G1 fade on CALM days (target p50, stop p90)', 'CALM', 'd1', 'd1c', 'OH', both_sides=True)
r7b = verdict('H7-G2 fade on CALM days (stop 0.2 sigma beyond, target p50)', 'CALM', 'd2', 'd2c', 'OH', both_sides=True)
p('## Reported: every front state, mean net R by trade (n)')
p(T.groupby(['half', 'fs'])[['f1', 'f2', 'd1', 'd2']].mean().round(4).to_string()); p()
p(f'VERDICT: H5 {"PASS" if h5 else "FAIL"} · H6-G1 {"PASS" if r6a else "FAIL"} · H6-G2 {"PASS" if r6b else "FAIL"} · H7-G1 {"PASS" if r7a else "FAIL"} · H7-G2 {"PASS" if r7b else "FAIL"}')
open('analysis/surfaces/VOL_CURVE_FRONT_RESULTS.md', 'w', encoding='utf-8').write('\n'.join(out) + '\n')
