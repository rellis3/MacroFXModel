"""EXHAUSTION-SCHEDULE fit + H11 (calibration) + H12 (stand-aside) — forge/EXHAUSTION_SCHEDULE_PREREG.md (150f69a4,
amendment b92e19e3). Reads stage-1 output analysis/surfaces/exhaustion/*_hours.csv / *_days.csv and the DIRECTIONAL-RESCORE
touch tables; writes the per-day schedule JSON that stage 2 (scripts/rangebook/exhaustion_fade.mjs) trades.
    python analysis/surfaces/exhaustion_fit.py
"""
import glob, json, os, numpy as np, pandas as pd

SPLIT = '2023-01-01'; GRID = np.round(np.arange(0.0, 4.001, 0.05), 2); MIN_N = 30
CVOL = {'EURUSD': 'EURUSD', 'GBPUSD': 'GBPUSD', 'USDJPY': 'USDJPY', 'AUDUSD': 'AUDUSD', 'USDCAD': 'USDCAD', 'USDCHF': 'USDCHF', 'GOLD': 'XAUUSD'}
FRONT = {'NQ', 'SPX500', 'DOW', 'US2000'}
RNG = np.random.default_rng(20261004)
out = []
def p(s=''): out.append(str(s)); print(s, flush=True)

H = pd.concat((pd.read_csv(f) for f in sorted(glob.glob('analysis/surfaces/exhaustion/*_hours.csv'))), ignore_index=True)
Dd = pd.concat((pd.read_csv(f) for f in sorted(glob.glob('analysis/surfaces/exhaustion/*_days.csv'))), ignore_index=True)
for x in (H, Dd): x['date'] = pd.to_datetime(x.date)

# ── state per instrument-day (known before the day) ──
cv = pd.read_parquet('cme_cvol_eod_available_history.parquet')[['timestamp', 'product', 'cvol']].dropna()
cv['d'] = cv.timestamp.dt.tz_convert(None).dt.normalize().astype('datetime64[ns]')
def cboe(n):
    t = pd.read_csv(f'analysis/surfaces/cboe/{n}.csv'); t.columns = [c.strip().upper() for c in t.columns]
    return pd.Series(t.CLOSE.values, index=pd.to_datetime(t.DATE, format='%m/%d/%Y').astype('datetime64[ns]')).sort_index()
vf = (cboe('VIX9D') / cboe('VIX')).dropna().rename('front'); vf.index.name = 'd'; vf = vf.reset_index()
Dd['state'] = 'ALL'
for inst, g in Dd.groupby('inst'):
    sub = g[['date', 'sigDaily']].copy(); sub['date'] = sub.date.astype('datetime64[ns]'); sub = sub.reset_index().sort_values('date')
    if inst in CVOL:
        iv = cv[cv['product'] == CVOL[inst]][['d', 'cvol']].sort_values('d')
        m = pd.merge_asof(sub, iv, left_on='date', right_on='d', allow_exact_matches=False).set_index('index')
        r = (m.cvol / 100 / np.sqrt(252)) / (m.sigDaily / 100); e = r[m.date < SPLIT].quantile([1 / 3, 2 / 3]).values
        st = pd.Series(np.select([r < e[0], r >= e[1]], ['EXHAUST', 'CONTINUE'], 'FAIR'), index=m.index).where(r.notna(), 'NA')
        Dd.loc[st.index, 'state'] = st
    elif inst in FRONT:
        m = pd.merge_asof(sub, vf, left_on='date', right_on='d', allow_exact_matches=False).set_index('index')
        st = pd.Series(np.select([m.front < 0.8858, m.front >= 0.9669], ['CALM', 'DEAR'], 'NORMAL'), index=m.index).where(m.front.notna(), 'NA')
        Dd.loc[st.index, 'state'] = st
H = H.merge(Dd[['inst', 'date', 'state', 'open', 'sigUsed']], on=['inst', 'date'], how='left')
H = H[H.state != 'NA']; H['half'] = np.where(H.date < SPLIT, 'A', 'B')

# ── fit d* on half A ──
def fit(df, thr):
    sched = {}
    for (inst, state, side, hour), g in df[df.half == 'A'].groupby(['inst', 'state', 'side', 'hour']):
        Ds, F = g.D.values, g.final.values
        for d in GRID:
            m = Ds >= d
            if m.sum() < MIN_N: break
            if F[m].mean() >= thr: sched[(inst, state, side, int(hour))] = float(d); break
    return sched
S80, S75, S90 = fit(H, 0.80), fit(H, 0.75), fit(H, 0.90)
H['dstar'] = [S80.get((i, s, sd, int(h))) for i, s, sd, h in zip(H.inst, H.state, H.side, H.hour)]

p('# EXHAUSTION-SCHEDULE results (pre-registered: forge/EXHAUSTION_SCHEDULE_PREREG.md, 150f69a4 + amendment b92e19e3)\n')
p(f'{H.inst.nunique()} instruments, {Dd.date.min().date()} -> {Dd.date.max().date()}; schedule cells fitted on 2016-2022: {len(S80)} (80%), {len(S75)} (75%), {len(S90)} (90%)\n')

# ── H11 calibration on B ──
B = H[(H.half == 'B') & H.dstar.notna() & (H.D >= H.dstar)]
pooled = B.final.mean(); per = B.groupby('inst').final.mean()
h11 = pooled >= 0.75 and (per >= 0.70).mean() >= 0.7
p('## H11 calibration: realised P(final) when the running extreme is past the 80% schedule, unseen 2023-26')
p(f'pooled {pooled:.3f} (n={len(B)}), instruments >= 0.70: {(per >= 0.70).sum()}/{len(per)}  ->  {"PASS" if h11 else "FAIL"}')
p('per instrument: ' + str(per.round(3).to_dict()))
A_ = H[(H.half == 'A') & H.dstar.notna() & (H.D >= H.dstar)]
p(f'(in-sample A for reference: {A_.final.mean():.3f})')
p('by hour (B): ' + str(B.groupby('hour').final.mean().round(2).to_dict()))
p('by state (B): ' + str(B.groupby('state').final.mean().round(3).to_dict()))
reach = H[H.dstar.notna()].assign(past=lambda x: x.D >= x.dstar).groupby(['inst', 'date', 'side']).past.max()
p(f'share of day-sides that reach the schedule at some hour: {reach.mean():.2f}\n')

# ── the schedule itself, in sigma (median across instruments per hour, by side) ──
sch = pd.DataFrame([dict(inst=k[0], state=k[1], side=k[2], hour=k[3], d=v) for k, v in S80.items()])
p('## The 80% schedule: median distance from the open (sigma_used) by London hour, across instruments')
p(sch.groupby(['side', 'hour']).d.median().unstack(0).round(2).T.to_string()); p()
for name in ('EURUSD', 'GOLD', 'NQ'):
    s = sch[sch.inst == name]
    if len(s): p(f'{name}: ' + '; '.join(f'{st} {sd}: ' + ', '.join(f'{h}h {d}' for h, d in g.sort_values('hour')[['hour', 'd']].values) for (st, sd), g in s.groupby(['state', 'side']))); p()

# ── H12 stand-aside: follow R beyond vs before the schedule at DIRECTIONAL-RESCORE touches ──
T = pd.concat((pd.read_csv(f) for f in sorted(glob.glob('analysis/surfaces/directional/*.csv'))), ignore_index=True)
T['date'] = pd.to_datetime(T.date); T = T[(T.outcome != 'excl') & T.line.isin(['OH_p50', 'OL_p50', 'OH_p75', 'OL_p75'])]
COST = {'EURUSD': .008, 'GBPUSD': .010, 'USDJPY': .009, 'USDCHF': .011, 'USDCAD': .011, 'AUDUSD': .011, 'NZDUSD': .013, 'GOLD': .020, 'NQ': .008, 'SPX500': .008}
SLIP = {k: (.012 if k == 'GOLD' else .008 if k in ('NQ', 'SPX500') else .006) for k in COST}
cap = T.dc / T.df
T['folG'] = np.select([T.outcome == 'cont', T.outcome.isin(['fade', 'both'])], [cap, -1.0], np.minimum(np.maximum(T.lastMove / T.df, -1), cap))
T['fol'] = T.folG - (T.inst.map(COST) + T.inst.map(SLIP)) / 100 * T.level / (T.df * T.unit)
T = T.merge(Dd[['inst', 'date', 'state', 'open']], on=['inst', 'date'], how='left')
T['dist'] = (T.level - T.open).abs() / T.unit; T['hour'] = (T.minute // 60).clip(0, 23); T['side'] = np.where(T.up == 1, 'H', 'L')
T['dstar'] = [S80.get((i, s, sd, int(h))) for i, s, sd, h in zip(T.inst, T.state, T.side, T.hour)]
T = T[T.dstar.notna()]; T['beyond'] = T.dist >= T.dstar; T['half'] = np.where(T.date < SPLIT, 'A', 'B')
p('## H12 stand-aside: follow net R at p50/p75 touches beyond vs before the 80% schedule')
tab = T.groupby(['half', 'beyond']).fol.agg(['mean', 'size']).round(4); p(tab.to_string())
def diff_ci(df, B_=2000, level=0.99):
    g = df.groupby(['date', 'beyond']).fol.agg(['sum', 'size']).unstack(fill_value=0)
    s1, n1, s0, n0 = g[('sum', True)].values, g[('size', True)].values, g[('sum', False)].values, g[('size', False)].values
    ds = []
    for _ in range(B_):
        i = RNG.integers(0, len(g), len(g)); ds.append(s1[i].sum() / max(n1[i].sum(), 1) - s0[i].sum() / max(n0[i].sum(), 1))
    a = (1 - level) / 2; return np.quantile(ds, [a, 1 - a])
lo, hi = diff_ci(T)
dA = tab.loc[('A', True), 'mean'] - tab.loc[('A', False), 'mean'] if ('A', True) in tab.index else np.nan
dB = tab.loc[('B', True), 'mean'] - tab.loc[('B', False), 'mean'] if ('B', True) in tab.index else np.nan
h12 = dA < 0 and dB < 0 and hi < 0
p(f'difference beyond - before: A {dA:+.4f}, B {dB:+.4f}; pooled 99% date-clustered CI [{lo:+.4f}, {hi:+.4f}]  ->  {"PASS" if h12 else "FAIL"}')
p('per instrument (beyond - before): ' + str(T.groupby('inst').apply(lambda x: round(x[x.beyond].fol.mean() - x[~x.beyond].fol.mean(), 3)).to_dict()) + '\n')

# ── per-day schedule for stage 2 ──
os.makedirs('analysis/surfaces/exhaustion/sched', exist_ok=True)
for inst, g in Dd.groupby('inst'):
    js = {}
    for dt, st in zip(g.date.dt.strftime('%Y-%m-%d'), g.state):
        if st == 'NA': continue
        js[dt] = {sd: [S80.get((inst, st, sd, h)) for h in range(24)] for sd in ('H', 'L')}
    json.dump(js, open(f'analysis/surfaces/exhaustion/sched/{inst}.json', 'w'))
json.dump({'h11': bool(h11), 'h12': bool(h12)}, open('analysis/surfaces/exhaustion/h11_h12.json', 'w'))
sch.to_csv('analysis/surfaces/EXHAUSTION_SCHEDULE_80.csv', index=False)
open('analysis/surfaces/EXHAUSTION_SCHEDULE_RESULTS.md', 'w', encoding='utf-8').write('\n'.join(out) + '\n')
