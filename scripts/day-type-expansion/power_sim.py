"""day-type-expansion power (forge/DAY_TYPE_EXPANSION_PREREG.md §5). Run: python -I scripts/day-type-expansion/power_sim.py fx|idx|gold 40
Power: planted-signal Monte Carlo on the real INPUT series only (no outcome read).
Synthetic labels y ~ Bernoulli(p) with a Gaussian-copula date factor; walk-forward logistic M vs B1; BSS vs B1 per family."""
import sys, numpy as np, pandas as pd
from scipy.stats import norm
ROOT = __import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), '..', '..') + '/'
rng = np.random.default_rng(20261114)
FAM = {'fx': ['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','USDCHF'], 'gold': ['GOLD'], 'idx': ['NQ','SPX500']}
RHO = {'fx': 0.47, 'gold': 0.0, 'idx': 0.85}
T = pd.read_parquet(ROOT+'analysis/output/vf3_stage_b/part1_lines.parquet', columns=['inst','date','pit_sig_used','iv_ann','event'])
T = T[T.inst.isin(sum(FAM.values(), [])) & (T.event != 'unknown')].copy(); T['date'] = pd.to_datetime(T.date)
def cboe(s):
    d = pd.read_csv(ROOT+f'analysis/surfaces/cboe/{s}.csv'); d['DATE'] = pd.to_datetime(d.iloc[:,0], format='%m/%d/%Y')
    return d.set_index('DATE').iloc[:, -1].astype(float).sort_index()
vix, vix3m = cboe('VIX'), cboe('VIX3M')
spx = pd.read_parquet(ROOT+'oi_research_book/data/gex_range_es/spx500_nyclose_d1.parquet').close
def asof(s, dates):  # last value strictly before date
    i = np.searchsorted(s.index.values, dates.values, side='left') - 1
    return np.where(i >= 0, s.values[np.clip(i,0,None)], np.nan), i
D = pd.DatetimeIndex(sorted(T.date.unique()))
v, iv_ = asof(vix, D); v3, _ = asof(vix3m, D); s0, si = asof(spx, D)
lsp = np.log(spx.values)
ret = lambda k: np.array([-(lsp[i]-lsp[i-k])*100 if i >= k else np.nan for i in si])
vi = np.array([np.searchsorted(vix.index.values, d, side='left')-1 for d in D.values])
G = pd.DataFrame(dict(spx5=ret(5), spx20=ret(20), spx60=ret(60), vix=v, vixchg5=v - vix.values[vi-5], term=v/v3, inv=(v>v3).astype(float)), index=D)
T = T.join(G, on='date')
T = T.sort_values(['inst','date'])
T['zsig'] = T.groupby('inst').pit_sig_used.transform(lambda s: np.log(s / s.shift(1).rolling(250, min_periods=120).median()))
T['ivrel'] = np.log(T.iv_ann / (T.pit_sig_used * np.sqrt(252)))
T['tier1'] = T.event.isin(['NFP','CPI','FOMC']).astype(float); T['high'] = (T.event == 'high').astype(float)
T = T.dropna(subset=['zsig']).reset_index(drop=True)
EDGES = [pd.Timestamp(x) for x in ['2022-09-05','2023-09-05','2024-09-05','2025-09-05','2026-08-22']]
def stress(df, fit, fam):
    q = lambda c, p: fit[c].quantile(p)
    if fam == 'fx':
        f = [df.spx5 >= q('spx5',2/3), df.spx60 >= q('spx60',2/3), df.vix >= q('vix',2/3), df.vixchg5 >= q('vixchg5',2/3), df.term >= q('term',2/3), df.spx20 >= q('spx20',0.8)]
    elif fam == 'idx':
        f = [df.spx5 >= q('spx5',2/3), df.vixchg5 >= q('vixchg5',2/3), df.spx20 >= q('spx20',0.8), df.inv == 1]
    else:
        f = [df.inv == 1]
    return sum(x.astype(float) for x in f)
FEATS = {'fx': ['ivrel','stress','tier1','high'], 'idx': ['ivrel','stress','tier1','high'], 'gold': ['stress','tier1','high']}
def logit_fit(X, y, l2=1e-3):
    b = np.zeros(X.shape[1])
    for _ in range(30):
        p = 1/(1+np.exp(-X@b)); W = p*(1-p)
        H = X.T@(X*W[:,None]) + l2*np.eye(len(b)); g = X.T@(y-p) - l2*b
        db = np.linalg.solve(H, g); b += db
        if np.abs(db).max() < 1e-7: break
    return b
def design(df, fam, cols, mu, sd, insts):
    Z = [(df[c].values - mu[c]) / sd[c] for c in cols]
    I = [(df.inst.values == i).astype(float) for i in insts]
    return np.column_stack(I + Z)
def prep(fam):
    d = T[T.inst.isin(FAM[fam])].copy()
    if fam == 'fx': d = d.dropna(subset=['ivrel'])
    d = d.dropna(subset=['spx60','vixchg5']).reset_index(drop=True)
    return d
def run(fam, d, y):
    insts = FAM[fam]; out = []
    for k in range(4):
        tr = d.date < EDGES[k] - pd.Timedelta(days=7); te = (d.date >= EDGES[k]) & (d.date < EDGES[k+1])
        dd = d.copy(); dd['stress'] = stress(d, d[tr], fam)
        cols = ['zsig'] + FEATS[fam]
        mu = dd[tr][cols].mean(); sd = dd[tr][cols].std().replace(0, 1)
        X1 = design(dd, fam, ['zsig'], mu, sd, insts); XM = design(dd, fam, cols, mu, sd, insts)
        b1 = logit_fit(X1[tr], y[tr]); bm = logit_fit(XM[tr], y[tr])
        p1 = 1/(1+np.exp(-X1[te]@b1)); pm = 1/(1+np.exp(-XM[te]@bm))
        out.append(pd.DataFrame(dict(date=d.date[te].values, y=y[te], p1=p1, pm=pm)))
    return pd.concat(out)
def bss(o):
    g = o.assign(e1=(o.p1-o.y)**2, em=(o.pm-o.y)**2).groupby('date')[['e1','em']].sum()
    return 1 - g.em.sum()/g.e1.sum(), g
def boot_se(g, B=200, block=21):
    a = g.values; n = len(a); nb = int(np.ceil(n/block)); r = []
    for _ in range(B):
        st = rng.integers(0, n-block+1, nb); idx = np.concatenate([np.arange(s, s+block) for s in st])[:n]
        s = a[idx].sum(0); r.append(1 - s[1]/s[0])
    return np.std(r)
def sim(fam, d, pi, beta, nsim):
    mu = d[['zsig','ivrel','stress0']].mean() if False else None
    # truth: intercept for pi, gamma=0.3 on zsig (std), beta on the standardized planted score (stress + ivrel where present)
    zs = (d.zsig - d.zsig.mean())/d.zsig.std()
    sc = stress(d, d, fam); sc = (sc - sc.mean())/sc.std()
    if fam != 'gold': iv = (d.ivrel - d.ivrel.mean())/d.ivrel.std(); sc = (sc + iv)/np.sqrt(2)
    eta = norm.ppf(pi)*1.7 + 0.3*zs.values + beta*sc.values
    p = 1/(1+np.exp(-eta))
    dates = d.date.values; ud, inv = np.unique(dates, return_inverse=True)
    res = []
    for s in range(nsim):
        z = rng.standard_normal(len(ud))[inv]; e = rng.standard_normal(len(d))
        u = norm.cdf(np.sqrt(RHO[fam])*z + np.sqrt(1-RHO[fam])*e)
        y = (u < p).astype(float)
        o = run(fam, d, y); b, g = bss(o)
        res.append((b, boot_se(g) if s < 5 else np.nan, y.mean()))
    return np.array(res)
if __name__ == '__main__':
    fam = sys.argv[1]; nsim = int(sys.argv[2])
    d = prep(fam); print(fam, 'rows', len(d), 'dates', d.date.nunique(), 'test dates', d[d.date >= EDGES[0]].date.nunique())
    for pi in [0.10, 0.20, 0.30]:
        for beta in [0.0, 0.15, 0.25, 0.35]:
            r = sim(fam, d, pi, beta, nsim)
            print(f'pi={pi} beta={beta}: BSS mean {r[:,0].mean():+.4f} MCsd {r[:,0].std():.4f} bootSE {np.nanmean(r[:,1]):.4f} ybar {r[:,2].mean():.3f}', flush=True)
