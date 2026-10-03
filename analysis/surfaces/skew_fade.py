"""SKEW-FADE — the pre-registered test in forge/SKEW_FADE_PREREG.md (commit a71a88e0).

Fade the first p75 touch when CME CVOL skew is AGAINST the side being touched (H3), and when that coincides with an
EXHAUST tag (H4). Lines, touches, trade geometry and costs exactly as analysis/surfaces/tag_x_persistence.py.
    python analysis/surfaces/skew_fade.py
"""
import numpy as np, pandas as pd

INST = {'EURUSD': 'eurusd', 'GBPUSD': 'gbpusd', 'USDJPY': 'usdjpy', 'XAUUSD': 'xauusd',
        'AUDUSD': 'audusd', 'USDCAD': 'usdcad', 'USDCHF': 'usdchf'}
COST = {'EURUSD': 0.008, 'GBPUSD': 0.010, 'USDJPY': 0.009, 'USDCHF': 0.011, 'USDCAD': 0.011, 'AUDUSD': 0.011, 'XAUUSD': 0.020}
SLIP = {k: (0.012 if k == 'XAUUSD' else 0.006) for k in INST}
SPLIT = pd.Timestamp('2023-01-01')
RNG = np.random.default_rng(20261004)
out = []
def p(s=''): out.append(str(s)); print(s, flush=True)

def yz(d, n=10):
    o, h, l, c = [np.log(d[k]) for k in ('open', 'high', 'low', 'close')]
    k = 0.34 / (1.34 + (n + 1) / (n - 1)); rs = (h - o) * (h - c) + (l - o) * (l - c)
    return np.sqrt((o - c.shift(1)).rolling(n).var() + k * (c - o).rolling(n).var() + (1 - k) * rs.rolling(n).mean())

cvol = pd.read_parquet('cme_cvol_eod_available_history.parquet')[['timestamp', 'product', 'cvol', 'skew', 'quote_orientation']].dropna()
cvol['date'] = cvol.timestamp.dt.tz_convert(None).dt.normalize().astype('datetime64[ns]')

rows = []
for inst, f in INST.items():
    m = pd.read_parquet(f'VolRangeForecaster/data/m1/{f}_m1.parquet')
    lt = m.index.tz_convert('Europe/London'); keep = lt.dayofweek < 5
    m, lt = m[keep], lt[keep]
    m = m.assign(day=lt.normalize().tz_localize(None))
    d = m.groupby('day').agg(open=('open', 'first'), high=('high', 'max'), low=('low', 'min'), close=('close', 'last'))
    d.index = d.index.astype('datetime64[ns]')
    d['sig'] = yz(d).shift(1)
    d['up'] = (d.high / d.open - 1) / d.sig; d['dn'] = (1 - d.low / d.open) / d.sig
    A = d[d.index < SPLIT]
    ku, kd = A.up.quantile([.5, .75, .9]).values, A.dn.quantile([.5, .75, .9]).values
    cv = cvol[cvol['product'] == inst].sort_values('date')[['date', 'cvol', 'skew', 'quote_orientation']]
    dd = pd.merge_asof(pd.DataFrame({'date': d.index}), cv, on='date', allow_exact_matches=False).set_index('date')
    d['ratio'] = (dd.cvol / 100 / np.sqrt(252)).values / d.sig.values
    d['sk'] = (dd['quote_orientation'] * dd['skew'] / dd['cvol']).values          # + = upside of the SPOT pair priced dearer
    A = d[d.index < SPLIT]
    te = A.ratio.quantile([1 / 3, 2 / 3]).values
    d['tag'] = np.select([d.ratio < te[0], d.ratio >= te[1]], ['EXHAUST', 'CONTINUE'], 'FAIR'); d.loc[d.ratio.isna(), 'tag'] = None
    cost, slip = COST[inst] / 100, SLIP[inst] / 100
    for day, bars in m.groupby('day'):
        day = pd.Timestamp(day)
        if day not in d.index: continue
        row = d.loc[day]
        if not np.isfinite(row.sig) or row.tag is None or not np.isfinite(row.sk): continue
        o, s = row.open, row.sig
        H, L, O, C = bars.high.values, bars.low.values, bars.open.values, bars.close.values
        for side, k in (('OH', ku), ('OL', kd)):
            g = 1 if side == 'OH' else -1
            L50, L75, L90 = (o * (1 + g * x * s) for x in k)
            hit = (H >= L75) if g > 0 else (L <= L75)
            if not hit.any(): continue
            ti = int(np.argmax(hit))
            entry = max(L75, O[ti]) if g > 0 else min(L75, O[ti])
            if (g > 0 and entry >= L90) or (g < 0 and entry <= L90): continue
            uf, ud = abs(entry - L50), abs(L90 - entry)
            if uf <= 0 or ud <= 0: continue
            hH, hL = H[ti + 1:], L[ti + 1:]
            far = (hH >= L90) if g > 0 else (hL <= L90)
            near = (hL <= L50) if g > 0 else (hH >= L50)
            iF = int(np.argmax(far)) if far.any() else 10 ** 9; iN = int(np.argmax(near)) if near.any() else 10 ** 9
            last = C[-1]
            if iF == iN == 10 ** 9: out_ = 'stall'; fol = g * (last - entry) / uf; fad = -g * (last - entry) / ud
            elif iF < iN: out_ = 'continue'; fol = abs(L90 - entry) / uf; fad = -1.0
            elif iN < iF: out_ = 'fade'; fol = -1.0; fad = abs(entry - L50) / ud
            else: out_ = 'both'; fol = -1.0; fad = -1.0
            rows.append(dict(inst=inst, day=day, side=side, tag=row.tag, skw=g * row.sk, out=out_,
                             fol=fol - (cost + slip) * entry / uf, fad=fad - cost * entry / ud, fad2=fad - 2 * cost * entry / ud))
    p(f'{inst}: {sum(1 for x in rows if x["inst"] == inst)} touches')

T = pd.DataFrame(rows); T['half'] = np.where(T.day < SPLIT, 'A', 'B'); T['year'] = T.day.dt.year
# skew-with-the-touch terciles per instrument, fitted on half A
T['sk_t'] = None
for inst, g in T.groupby('inst'):
    e = g.loc[g.half == 'A', 'skw'].quantile([1 / 3, 2 / 3]).values
    T.loc[g.index, 'sk_t'] = np.select([g.skw <= e[0], g.skw >= e[1]], ['AGAINST', 'WITH'], 'NEUTRAL')

p('\n# SKEW-FADE results (pre-registered: forge/SKEW_FADE_PREREG.md, commit a71a88e0)\n')
p(f'{len(T)} first p75 touches, {T.inst.nunique()} instruments, {T.day.min().date()} -> {T.day.max().date()}\n')
g = T.groupby(['half', 'sk_t'])
t = g.out.value_counts(normalize=True).unstack().reindex(columns=['continue', 'fade', 'stall', 'both']).fillna(0).round(3)
t['n'] = g.size(); t['follow_R'] = g.fol.mean().round(3); t['fade_R'] = g.fad.mean().round(3)
p('## Replication on CVOL: outcomes by skew relative to the touch'); p(t.to_string()); p()

def boot_ci(sub, col, level=0.975, B=2000):
    u, inv = np.unique(sub.day.values, return_inverse=True)
    sums = np.bincount(inv, weights=sub[col].values); cnts = np.bincount(inv)
    ms = [(lambda i: sums[i].sum() / cnts[i].sum())(RNG.integers(0, len(u), len(u))) for _ in range(B)]
    a = (1 - level) / 2; return np.quantile(ms, [a, 1 - a])

def shuffle_bench(mask_fn, col, B=500):
    vals = []
    for _ in range(B):
        sh = T.groupby(['inst', 'year']).sk_t.transform(lambda x: RNG.permutation(x.values))
        vals.append(T.loc[mask_fn(sh), col].mean())
    return np.quantile(vals, 0.95)

def verdict(name, mask_fn):
    cell = T[mask_fn(T.sk_t)]
    p(f'## {name}: fade trade, n={len(cell)}')
    halves = cell.groupby('half').fad.agg(['mean', 'size']).round(4); p(halves.to_string())
    c1 = len(halves) == 2 and all(halves['mean'] > 0)
    lo, hi = boot_ci(cell, 'fad'); c2 = lo > 0
    per = cell.groupby('inst').fad.mean().round(3); c3 = (per > 0).sum() >= 5
    bench = shuffle_bench(mask_fn, 'fad'); c4 = cell.fad.mean() > bench
    c5 = cell.fad2.mean() > 0
    p(f'pooled mean {cell.fad.mean():.4f}, 97.5% day-clustered CI [{lo:.4f}, {hi:.4f}]')
    p(f'per instrument: {per.to_dict()}  ({(per > 0).sum()}/7 positive)')
    p(f'shuffled-skew 95th pct {bench:.4f}; at 2x costs {cell.fad2.mean():.4f}')
    checks = {'1 both halves': c1, '2 CI excludes 0': bool(c2), '3 >=5/7 instruments': bool(c3), '4 beats shuffle': bool(c4), '5 positive at 2x cost': bool(c5)}
    p(f'checks: {checks}  ->  {"PASS" if all(checks.values()) else "FAIL"}\n')
    return all(checks.values())

h3 = verdict('H3 skew AGAINST', lambda sk: sk == 'AGAINST')
h4 = verdict('H4 skew AGAINST and EXHAUST', lambda sk: (sk == 'AGAINST') & (T.tag == 'EXHAUST'))
p('## Reported only: tag x skew, mean net fade-R (n)')
tt = T.groupby(['half', 'tag', 'sk_t']).fad.agg(['mean', 'size']).round(3); p(tt.to_string())
p(f'\nVERDICT: H3 {"PASS" if h3 else "FAIL"} · H4 {"PASS" if h4 else "FAIL"}')
open('analysis/surfaces/SKEW_FADE_RESULTS.md', 'w', encoding='utf-8').write('\n'.join(out) + '\n')
