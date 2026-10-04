"""DIRECTIONAL-RESCORE scorer (forge/DIRECTIONAL_RESCORE_PREREG.md, commit 3c5d132a).
Reads analysis/surfaces/directional/*.csv from scripts/rangebook/directional_build.mjs.
    python analysis/surfaces/directional_score.py
"""
import glob, numpy as np, pandas as pd

SPLIT = '2023-01-01'
COST = {'EURUSD': .008, 'GBPUSD': .010, 'USDJPY': .009, 'USDCHF': .011, 'USDCAD': .011, 'AUDUSD': .011, 'NZDUSD': .013,
        'GOLD': .020, 'NQ': .008, 'SPX500': .008}
SLIP = {k: (.012 if k == 'GOLD' else .008 if k in ('NQ', 'SPX500') else .006) for k in COST}
IVSRC = {'EURUSD': ('cvol', 'EURUSD'), 'GBPUSD': ('cvol', 'GBPUSD'), 'USDJPY': ('cvol', 'USDJPY'), 'AUDUSD': ('cvol', 'AUDUSD'),
         'USDCAD': ('cvol', 'USDCAD'), 'USDCHF': ('cvol', 'USDCHF'), 'GOLD': ('cvol', 'XAUUSD'), 'NQ': ('cboe', 'VXN'), 'SPX500': ('cboe', 'VIX')}
RNG = np.random.default_rng(20261004)
out = []
def p(s=''): out.append(str(s)); print(s, flush=True)

T = pd.concat((pd.read_csv(f) for f in sorted(glob.glob('analysis/surfaces/directional/*.csv'))), ignore_index=True)
T['date'] = pd.to_datetime(T.date); T = T[T.outcome != 'excl'].copy()
T['half'] = np.where(T.date < SPLIT, 'A', 'B'); T['year'] = T.date.dt.year
T['rung'] = T.line.str.split('_').str[1]; T['fam'] = T.line.str.split('_').str[0]
T['be'] = T.df / (T.dc + T.df)
cl = lambda x, lo, hi: np.minimum(np.maximum(x, lo), hi)
cap_f, cap_d = T.dc / T.df, T.df / T.dc
T['folG'] = np.select([T.outcome == 'cont', T.outcome.isin(['fade', 'both'])], [cap_f, -1.0], cl(T.lastMove / T.df, -1, cap_f))
T['fadG'] = np.select([T.outcome == 'fade', T.outcome.isin(['cont', 'both'])], [cap_d, -1.0], cl(-T.lastMove / T.dc, -1, cap_d))
c = T.inst.map(COST) / 100; s = T.inst.map(SLIP) / 100
T['folC'] = (c + s) * T.level / (T.df * T.unit); T['fadC'] = c * T.level / (T.dc * T.unit)
T['fol'] = T.folG - T.folC; T['fad'] = T.fadG - T.fadC
T['fol2'] = T.folG - 2 * T.folC; T['fad2'] = T.fadG - 2 * T.fadC
T['resolved'] = T.outcome.isin(['cont', 'fade']); T['cont'] = T.outcome == 'cont'
T['dir'] = np.where(T.up == 1, 1, -1)

# conditions
T['aligned'] = np.sign(T.drift) * T.dir > 0
T['strong'] = T.drift.abs() >= 0.25
cv = pd.read_parquet('cme_cvol_eod_available_history.parquet')[['timestamp', 'product', 'cvol']].dropna()
cv['d'] = cv.timestamp.dt.tz_convert(None).dt.normalize().astype('datetime64[ns]')
def cboe(n):
    d = pd.read_csv(f'analysis/surfaces/cboe/{n}.csv'); d.columns = [x.strip().upper() for x in d.columns]
    return pd.DataFrame({'d': pd.to_datetime(d.DATE, format='%m/%d/%Y').astype('datetime64[ns]'), 'iv': d.CLOSE.values})
T['tag'] = None
for inst, (src, key) in IVSRC.items():
    m = T.inst == inst
    if not m.any(): continue
    ivs = cv[cv['product'] == key][['d', 'cvol']].rename(columns={'cvol': 'iv'}).sort_values('d') if src == 'cvol' else cboe(key).sort_values('d')
    sub = T.loc[m, ['date', 'sigDaily']].reset_index()
    sub['date'] = sub.date.astype('datetime64[ns]')
    mm = pd.merge_asof(sub.sort_values('date'), ivs, left_on='date', right_on='d', allow_exact_matches=False).set_index('index')
    ratio = (mm.iv / 100 / np.sqrt(252)) / (mm.sigDaily / 100)
    e = ratio[mm.date < SPLIT].quantile([1 / 3, 2 / 3]).values
    T.loc[mm.index, 'tag'] = np.select([ratio < e[0], ratio >= e[1]], ['EXHAUST', 'CONTINUE'], 'FAIR')
    T.loc[mm.index[ratio.isna()], 'tag'] = None

P = T[T.fam.isin(['OH', 'OL']) & T.rung.isin(['p50', 'p75'])]           # primary population

def dclust(sub, col):
    g = sub.groupby('date')[col].agg(['sum', 'size']); n = g['size'].sum()
    if len(g) < 3: return np.nan
    m = g['sum'].sum() / n; e = g['sum'] - m * g['size']
    return np.sqrt((e ** 2).sum()) / n                                   # date-clustered SE of the mean
def boot_ci(sub, col, level=0.99, B=2000):
    g = sub.groupby('date')[col].agg(['sum', 'size']); S, N = g['sum'].values, g['size'].values
    ms = [(lambda i: S[i].sum() / N[i].sum())(RNG.integers(0, len(S), len(S))) for _ in range(B)]
    a = (1 - level) / 2; return np.quantile(ms, [a, 1 - a])

def describe(df, by, title):
    rows = []
    for key, g in df.groupby(by):
        r = g[g.resolved]
        rows.append(dict(zip(by if isinstance(by, list) else [by], key if isinstance(key, tuple) else (key,))) | dict(
            n=len(g), stall=round(1 - g.resolved.mean(), 3), dir_minus_be=round(r.cont.mean() - r.be.mean(), 3) if len(r) else np.nan,
            r15=round(g.r15.mean(), 3), r60=round(g.r60.mean(), 3), r60_se=round(dclust(g, 'r60'), 3), r240=round(g.r240.mean(), 3),
            folG=round(g.folG.mean(), 3), fol=round(g.fol.mean(), 3), fadG=round(g.fadG.mean(), 3), fad=round(g.fad.mean(), 3)))
    p(f'## {title}'); p(pd.DataFrame(rows).to_string(index=False)); p()

p('# DIRECTIONAL-RESCORE results (pre-registered: forge/DIRECTIONAL_RESCORE_PREREG.md, commit 3c5d132a)\n')
p(f'{len(T)} first touches of the static export lines (same-bar fade-only excluded), {T.inst.nunique()} instruments, {T.date.min().date()} -> {T.date.max().date()}')
p('Columns: stall share; directional share among resolved minus break-even; signed return in sigma at 15/60/240 min (+ = continue side) with the date-clustered SE of r60; follow and fade R gross (G) and net.\n')
describe(T, ['half', 'line'], 'The re-score: every export line, by half')
describe(P.dropna(subset=['drift']).assign(drift_state=lambda x: np.where(~x.strong, 'weak', np.where(x.aligned, 'ALIGNED strong', 'AGAINST strong'))), ['half', 'drift_state'], 'Drift at the touch (OH/OL p50+p75)')
describe(P.dropna(subset=['tag']), ['half', 'tag'], 'Line tag at the touch (OH/OL p50+p75)')

def shuffle_bench(mask_builder, col, B=500):
    vals = []
    for _ in range(B):
        vals.append(P.loc[mask_builder(True), col].mean())
    return np.nanquantile(vals, 0.95)
def mask_drift(aligned_wanted):
    def f(shuf=False):
        d = P.drift
        if shuf: d = P.groupby(['inst', 'year']).drift.transform(lambda x: RNG.permutation(x.values))
        al = np.sign(d) * P.dir > 0
        return (d.abs() >= 0.25) & (al if aligned_wanted else ~al) & d.notna()
    return f
def mask_tag(tag):
    def f(shuf=False):
        t = P.tag
        if shuf: t = P.groupby(['inst', 'year']).tag.transform(lambda x: RNG.permutation(x.values))
        return t == tag
    return f
def verdict(name, mb, col, col2):
    cell = P[mb(False)]
    p(f'## {name}: n={len(cell)}')
    hv = cell.groupby('half')[col].agg(['mean', 'size']).round(4); p(hv.to_string())
    c1 = len(hv) == 2 and all(hv['mean'] > 0)
    lo, hi = boot_ci(cell, col); c2 = lo > 0
    per = cell.groupby('inst')[col].mean().round(3); c3 = (per > 0).mean() >= 0.7
    bench = shuffle_bench(mb, col); c4 = cell[col].mean() > bench
    c5 = cell[col2].mean() > 0
    trade_long = (cell.up == 1) if col.startswith('fol') else (cell.up == 0)
    sides = {'longs': round(cell.loc[trade_long, col].mean(), 4), 'shorts': round(cell.loc[~trade_long, col].mean(), 4)}
    c6 = all(v > 0 for v in sides.values())
    r = cell[cell.resolved]
    p(f'pooled {cell[col].mean():.4f} (gross {cell[col.replace("fol", "folG").replace("fad", "fadG") if col in ("fol", "fad") else col].mean():.4f}), 99% date-clustered CI [{lo:.4f}, {hi:.4f}]')
    p(f'directional share - BE {r.cont.mean() - r.be.mean():+.3f} · r60 {cell.r60.mean():+.3f} (SE {dclust(cell, "r60"):.3f}) · per instrument {per.to_dict()} · {sides}')
    p(f'shuffled 95th pct {bench:.4f} · at 2x costs {cell[col2].mean():.4f}')
    chk = {'1 both halves': bool(c1), '2 CI excludes 0': bool(c2), '3 >=70% instruments': bool(c3), '4 beats shuffle': bool(c4), '5 positive 2x cost': bool(c5), '6 longs and shorts': bool(c6)}
    p(f'checks {chk} -> {"PASS" if all(chk.values()) else "FAIL"}\n')
    return all(chk.values())
h8 = verdict('H8 follow, drift ALIGNED and STRONG', mask_drift(True), 'fol', 'fol2')
h9 = verdict('H9 fade, drift AGAINST and STRONG', mask_drift(False), 'fad', 'fad2')
h10a = verdict('H10a follow, tag CONTINUE', mask_tag('CONTINUE'), 'fol', 'fol2')
h10b = verdict('H10b fade, tag EXHAUST', mask_tag('EXHAUST'), 'fad', 'fad2')
p(f'VERDICT: H8 {"PASS" if h8 else "FAIL"} · H9 {"PASS" if h9 else "FAIL"} · H10a {"PASS" if h10a else "FAIL"} · H10b {"PASS" if h10b else "FAIL"}')
open('analysis/surfaces/DIRECTIONAL_RESCORE_RESULTS.md', 'w', encoding='utf-8').write('\n'.join(out) + '\n')
