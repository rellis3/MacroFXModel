"""TAG-X-PERSISTENCE — the pre-registered test in forge/TAG_X_PERSISTENCE_PREREG.md (commit 895db526).

Line tag (CME CVOL ÷ the lines' σ) × persistence (4 h variance ratio, 20 London days) at the first p75 touch.
Follow trade: target p90, stop p50. Fade trade: target p50, stop p90. Net of js/perLineStrategy.js costs.
Halves A = 2016-2022, B = 2023-2026-08. All inputs dated before the London day.
    python analysis/surfaces/tag_x_persistence.py
"""
import numpy as np, pandas as pd

INST = {'EURUSD': 'eurusd', 'GBPUSD': 'gbpusd', 'USDJPY': 'usdjpy', 'XAUUSD': 'xauusd',
        'AUDUSD': 'audusd', 'USDCAD': 'usdcad', 'USDCHF': 'usdchf'}
COST = {'EURUSD': 0.008, 'GBPUSD': 0.010, 'USDJPY': 0.009, 'USDCHF': 0.011, 'USDCAD': 0.011, 'AUDUSD': 0.011, 'XAUUSD': 0.020}
SLIP = {k: (0.012 if k == 'XAUUSD' else 0.006) for k in INST}
SPLIT = pd.Timestamp('2023-01-01')
RNG = np.random.default_rng(20261003)
out = []
def p(s=''): out.append(str(s)); print(s, flush=True)

def yz(d, n=10):
    o, h, l, c = [np.log(d[k]) for k in ('open', 'high', 'low', 'close')]
    k = 0.34 / (1.34 + (n + 1) / (n - 1)); rs = (h - o) * (h - c) + (l - o) * (l - c)
    return np.sqrt((o - c.shift(1)).rolling(n).var() + k * (c - o).rolling(n).var() + (1 - k) * rs.rolling(n).mean())

cvol = pd.read_parquet('cme_cvol_eod_available_history.parquet')[['timestamp', 'product', 'cvol']].dropna()
cvol['date'] = cvol.timestamp.dt.tz_convert(None).dt.normalize()

rows = []
for inst, f in INST.items():
    m = pd.read_parquet(f'VolRangeForecaster/data/m1/{f}_m1.parquet')
    lt = m.index.tz_convert('Europe/London'); keep = lt.dayofweek < 5
    m, lt = m[keep], lt[keep]
    m = m.assign(day=lt.normalize().tz_localize(None))
    # persistence: VR(12), VR(48) over 20 London days through t-1, from 5-min returns
    c5 = m.close.resample('5min').last().dropna(); r = np.log(c5).diff().dropna()
    rday = r.index.tz_convert('Europe/London').normalize().tz_localize(None)
    S = pd.DataFrame({'r2': (r ** 2).groupby(rday).sum()})
    for q in (12, 48):
        blk = r.groupby([rday, np.arange(len(r)) // q]).sum()
        S[f'b{q}'] = (blk ** 2).groupby(level=0).sum()
        S[f'vr{q}'] = (S[f'b{q}'].rolling(20).sum() / S.r2.rolling(20).sum()).shift(1)
    d = m.groupby('day').agg(open=('open', 'first'), high=('high', 'max'), low=('low', 'min'), close=('close', 'last'))
    d['sig'] = yz(d).shift(1)
    d['up'] = (d.high / d.open - 1) / d.sig; d['dn'] = (1 - d.low / d.open) / d.sig
    A = d[d.index < SPLIT]
    ku, kd = A.up.quantile([.5, .75, .9]).values, A.dn.quantile([.5, .75, .9]).values
    cv = cvol[cvol['product'] == inst].sort_values('date')[['date', 'cvol']]
    dd = pd.merge_asof(d[['sig']].reset_index().rename(columns={'day': 'date'}).sort_values('date'), cv, on='date', allow_exact_matches=False)
    d['ratio'] = (dd.set_index('date').cvol / 100 / np.sqrt(252)).values / d.sig.values
    d = d.join(S[['vr12', 'vr48']])
    A = d[d.index < SPLIT]
    te = A.ratio.quantile([1 / 3, 2 / 3]).values
    d['tag'] = np.select([d.ratio < te[0], d.ratio >= te[1]], ['EXHAUST', 'CONTINUE'], 'FAIR'); d.loc[d.ratio.isna(), 'tag'] = None
    for q in (12, 48):
        e = A[f'vr{q}'].quantile([1 / 3, 2 / 3]).values
        d[f'p{q}'] = np.select([d[f'vr{q}'] <= e[0], d[f'vr{q}'] >= e[1]], ['GIVING BACK', 'EXTENDING'], 'MIDDLE'); d.loc[d[f'vr{q}'].isna(), f'p{q}'] = None
    cost, slip = COST[inst] / 100, SLIP[inst] / 100
    for day, bars in m.groupby('day'):
        if day not in d.index: continue
        row = d.loc[day]
        if not np.isfinite(row.sig) or row.tag is None or row.p48 is None: continue
        o, s = row.open, row.sig
        H, L, O, C = bars.high.values, bars.low.values, bars.open.values, bars.close.values
        for side, k in (('OH', ku), ('OL', kd)):
            g = 1 if side == 'OH' else -1
            L50, L75, L90 = (o * (1 + g * x * s) for x in k)
            hit = (H >= L75) if g > 0 else (L <= L75)
            if not hit.any(): continue
            ti = int(np.argmax(hit))
            entry = max(L75, O[ti]) if g > 0 else min(L75, O[ti])
            if (g > 0 and entry >= L90) or (g < 0 and entry <= L90): continue      # gapped through the target
            uf, ud = abs(entry - L50), abs(L90 - entry)
            if uf <= 0 or ud <= 0: continue
            hH, hL = H[ti + 1:], L[ti + 1:]
            far = (hH >= L90) if g > 0 else (hL <= L90)          # p90 side
            near = (hL <= L50) if g > 0 else (hH >= L50)         # p50 side
            iF = int(np.argmax(far)) if far.any() else 10 ** 9; iN = int(np.argmax(near)) if near.any() else 10 ** 9
            last = C[-1]
            if iF == iN == 10 ** 9: out_ = 'stall'; fol = g * (last - entry) / uf; fad = -g * (last - entry) / ud
            elif iF < iN: out_ = 'continue'; fol = abs(L90 - entry) / uf; fad = -1.0
            elif iN < iF: out_ = 'fade'; fol = -1.0; fad = abs(entry - L50) / ud
            else: out_ = 'both'; fol = -1.0; fad = -1.0              # same bar: each trade's stop counts
            rows.append(dict(inst=inst, day=day, side=side, tag=row.tag, p48=row.p48, p12=row.p12, out=out_,
                             fol=fol - (cost + slip) * entry / uf, fad=fad - cost * entry / ud,
                             fol2=fol - 2 * (cost + slip) * entry / uf, fad2=fad - 2 * cost * entry / ud))
    p(f'{inst}: {sum(1 for x in rows if x["inst"] == inst)} touches')

T = pd.DataFrame(rows); T['half'] = np.where(T.day < SPLIT, 'A', 'B'); T['year'] = T.day.dt.year
p('\n# TAG-X-PERSISTENCE results (pre-registered: forge/TAG_X_PERSISTENCE_PREREG.md, commit 895db526)\n')
p(f'{len(T)} first p75 touches, {T.inst.nunique()} instruments, {T.day.min().date()} -> {T.day.max().date()}\n')

def cell_table(col):
    g = T.groupby(['half', 'tag', col])
    t = g.out.value_counts(normalize=True).unstack().reindex(columns=['continue', 'fade', 'stall', 'both']).fillna(0).round(3)
    t['n'] = g.size(); t['follow_R'] = g.fol.mean().round(3); t['fade_R'] = g.fad.mean().round(3)
    return t
p('## Every cell, 4 h persistence (net R)'); p(cell_table('p48').to_string()); p()

def boot_ci(sub, col, level=0.975, B=2000):
    days = sub.day.values; u, inv = np.unique(days, return_inverse=True)
    sums = np.bincount(inv, weights=sub[col].values); cnts = np.bincount(inv)
    ms = []
    for _ in range(B):
        idx = RNG.integers(0, len(u), len(u)); ms.append(sums[idx].sum() / cnts[idx].sum())
    a = (1 - level) / 2; return np.quantile(ms, [a, 1 - a])

def shuffle_bench(tag, state, col, B=500):
    vals = []
    for _ in range(B):
        sh = T.groupby(['inst', 'year']).p48.transform(lambda x: RNG.permutation(x.values))
        vals.append(T.loc[(T.tag == tag) & (sh == state), col].mean())
    return np.quantile(vals, 0.95)

def verdict(name, tag, state, col, col2, other_mask=None):
    cell = T[(T.tag == tag) & (T.p48 == state)]
    p(f'## {name}: {tag} x {state}, {"follow" if col == "fol" else "fade"} trade')
    halves = cell.groupby('half')[col].agg(['mean', 'size']).round(4); p(halves.to_string())
    c1 = all(halves['mean'] > 0) and len(halves) == 2
    if other_mask is not None:
        oth = T[other_mask].groupby('half')[col].mean().round(4)
        c1b = all(halves['mean'].values > oth.values); p(f'comparison cell mean by half: {oth.to_dict()}  -> cell above in both halves: {c1b}')
        c1 = c1 and c1b
    lo, hi = boot_ci(cell, col); c2 = lo > 0
    per = cell.groupby('inst')[col].mean().round(3); c3 = (per > 0).sum() >= 5
    bench = shuffle_bench(tag, state, col); c4 = cell[col].mean() > bench
    c5 = cell[col2].mean() > 0
    p(f'pooled mean {cell[col].mean():.4f} (n={len(cell)}), 97.5% day-clustered CI [{lo:.4f}, {hi:.4f}]')
    p(f'per instrument: {per.to_dict()}  ({(per > 0).sum()}/7 positive)')
    p(f'shuffled-VR 95th pct {bench:.4f}; at 2x costs {cell[col2].mean():.4f}')
    checks = {'1 both halves': c1, '2 CI excludes 0': c2, '3 >=5/7 instruments': c3, '4 beats shuffle': c4, '5 positive at 2x cost': c5}
    p(f'checks: {checks}  ->  {"PASS" if all(checks.values()) else "FAIL"}\n')
    return all(checks.values())

h1 = verdict('H1', 'CONTINUE', 'GIVING BACK', 'fol', 'fol2', other_mask=(T.tag == 'CONTINUE') & (T.p48 != 'GIVING BACK'))
h2 = verdict('H2', 'EXHAUST', 'EXTENDING', 'fad', 'fad2')

p('## Reported only: 1 h persistence cells'); p(cell_table('p12').to_string()); p()
p('## Reported only: tag alone and persistence alone (net follow / fade R)')
p(T.groupby(['half', 'tag'])[['fol', 'fad']].mean().round(4).to_string()); p()
p(T.groupby(['half', 'p48'])[['fol', 'fad']].mean().round(4).to_string()); p()

# logistic regression: continue ~ tag + persistence dummies (IRLS), each half
def logit(X, y, it=25):
    b = np.zeros(X.shape[1])
    for _ in range(it):
        z = X @ b; pr = 1 / (1 + np.exp(-z)); W = pr * (1 - pr)
        b += np.linalg.solve(X.T @ (X * W[:, None]) + 1e-9 * np.eye(X.shape[1]), X.T @ (y - pr))
    pr = 1 / (1 + np.exp(-(X @ b))); se = np.sqrt(np.diag(np.linalg.inv(X.T @ (X * (pr * (1 - pr))[:, None]))))
    return b, se
p('## Reported only: logistic regression, P(continue) ~ tag + 4 h persistence (base: FAIR, MIDDLE)')
for h in ('A', 'B'):
    sub = T[T.half == h]
    X = np.column_stack([np.ones(len(sub)), sub.tag == 'CONTINUE', sub.tag == 'EXHAUST', sub.p48 == 'GIVING BACK', sub.p48 == 'EXTENDING']).astype(float)
    b, se = logit(X, (sub.out == 'continue').astype(float).values)
    p(f'half {h}: ' + ', '.join(f'{n} {bb:+.3f} (z {bb / s:+.1f})' for n, bb, s in zip(['const', 'CONTINUE', 'EXHAUST', 'GIVING BACK', 'EXTENDING'], b, se)))
p(f'\nVERDICT: H1 {"PASS" if h1 else "FAIL"} · H2 {"PASS" if h2 else "FAIL"}')
open('analysis/surfaces/TAG_X_PERSISTENCE_RESULTS.md', 'w', encoding='utf-8').write('\n'.join(out) + '\n')
