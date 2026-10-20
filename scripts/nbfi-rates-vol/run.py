"""nbfi-rates-vol — forge/NBFI_RATES_VOL_PREREG.md.

Signal: 4Q FX-adjusted growth of cross-border USD claims on the Cayman Islands (BIS LBS), known end of q+2.
Outcome: log annualised realised vol (bp) of daily ^TNX changes in quarter q+3, residual on log RV(q+2).
Scored: partial correlation, block bootstrap over quarters, circular-shift placebo, halves.

Run: python scripts/nbfi-rates-vol/run.py
"""
import io, json, math, os, urllib.request
import numpy as np
import pandas as pd

SEED = 20261020
B = 2000
BLOCK = 4
LAG = 3
USEFUL = 0.15
LAST_OUT = '2026Q2'
SPLIT = '2008Q1'
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'analysis', 'output', 'nbfi-rates-vol')
CACHE = os.path.join(OUT, 'cache')
os.makedirs(CACHE, exist_ok=True)
BIS = 'https://stats.bis.org/api/v2/data/dataflow/BIS/WS_LBS_D_PUB/1.0/{key}?format=csv'


def fetch(url, name):
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=90) as r:
            open(path, 'wb').write(r.read())
    return open(path, 'rb').read()


def bis_growth(key, name):
    df = pd.read_csv(io.BytesIO(fetch(BIS.format(key=key), name)))
    df['q'] = pd.PeriodIndex(df.TIME_PERIOD.str.replace('-', ''), freq='Q')
    s = df[df.L_MEASURE == 'S'].set_index('q').OBS_VALUE.astype(float).sort_index()
    f = df[df.L_MEASURE == 'F'].set_index('q').OBS_VALUE.astype(float).sort_index()
    idx = pd.period_range(s.index.min(), s.index.max(), freq='Q')
    s, f = s.reindex(idx), f.reindex(idx)
    g = f.rolling(4).sum() / s.shift(4) * 100
    return g[s.shift(4) > 0].dropna()


def yahoo_daily(sym, name):
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{sym.replace("^", "%5E")}?interval=1d&period1=0&period2=1790000000'
    j = json.loads(fetch(url, name))['chart']['result'][0]
    return pd.Series(j['indicators']['quote'][0]['close'], index=pd.to_datetime(j['timestamp'], unit='s')).dropna()


def quarterly_rv(px):
    d = px.diff().dropna() * 100          # ^TNX is in %, so x100 = bp
    rv = d.groupby(d.index.to_period('Q')).agg(lambda x: x.std() * math.sqrt(252) if len(x) >= 40 else np.nan).dropna()
    rv = rv[rv.index <= pd.Period(LAST_OUT, 'Q')]
    big5 = px.groupby(px.index.to_period('Q')).apply(lambda x: (x.diff(5).abs().max() * 100) if len(x) >= 40 else np.nan).dropna()
    return rv, big5[big5.index <= pd.Period(LAST_OUT, 'Q')]


def build(g, rv, lag=LAG):
    sig = g.copy(); sig.index = sig.index + lag
    prev = rv.copy(); prev.index = prev.index + 1          # RV(q+2) aligned to outcome quarter q+3
    d = pd.concat({'g': sig, 'y': np.log(rv), 'x': np.log(prev)}, axis=1).dropna()
    b = np.polyfit(d.x, d.y, 1)
    d['res'] = d.y - np.polyval(b, d.x)
    return d, b


def boot(x, y, rng):
    n = len(x); nb = math.ceil(n / BLOCK); out = np.empty(B)
    for k in range(B):
        st = rng.integers(0, n - BLOCK + 1, nb)
        idx = np.concatenate([np.arange(s, s + BLOCK) for s in st])[:n]
        out[k] = np.corrcoef(x[idx], y[idx])[0, 1]
    return out


def main():
    rng = np.random.default_rng(SEED)
    g_ky = bis_growth('Q.S+F.C.A.USD.A.5J.A.5A.A.KY.N', 'bis_usd_ky.csv')
    g_nbfi = bis_growth('Q.S+F.C.A.TO1.A.5J.A.5A.F.5J.N', 'bis_nbfi.csv')
    rv, big5 = quarterly_rv(yahoo_daily('^TNX', 'tnx_daily.json'))
    rv5, _ = quarterly_rv(yahoo_daily('^FVX', 'fvx_daily.json'))
    d, beta = build(g_ky, rv)
    x, y = d.g.values, d.res.values
    r = float(np.corrcoef(x, y)[0, 1])
    bs = boot(x, y, rng); lo, hi = np.percentile(bs, [2.5, 97.5])
    pl = np.array([np.corrcoef(np.roll(x, k), y)[0, 1] for k in range(12, len(x) - 11)]); plo, phi = np.percentile(pl, [2.5, 97.5])
    h1, h2 = d[d.index < pd.Period(SPLIT, 'Q')], d[d.index >= pd.Period(SPLIT, 'Q')]
    r1, r2 = float(np.corrcoef(h1.g, h1.res)[0, 1]), float(np.corrcoef(h2.g, h2.res)[0, 1])
    gate = dict(ci_excludes_0=bool(lo > 0 or hi < 0), same_sign_halves=bool(np.sign(r1) == np.sign(r2) == np.sign(r)), outside_placebo=bool(r < plo or r > phi))
    verdict = 'VALIDATED' if all(gate.values()) else ('NULL' if (lo > -USEFUL and hi < USEFUL) else 'UNDERPOWERED')
    # descriptive
    desc = {'raw_r_g_vs_logRV': float(np.corrcoef(d.g, d.y)[0, 1]), 'persistence_beta': [float(beta[0]), float(beta[1])],
            'lag_scan_partial': {}, 'nbfi_partial': None, 'fvx_partial': None, 'big5_partial': None, 'move_partial': None}
    for L in range(1, 7):
        dd, _ = build(g_ky, rv, L); desc['lag_scan_partial'][str(L)] = float(np.corrcoef(dd.g, dd.res)[0, 1])
    dn, _ = build(g_nbfi, rv); desc['nbfi_partial'] = {'r': float(np.corrcoef(dn.g, dn.res)[0, 1]), 'n': len(dn)}
    d5, _ = build(g_ky, rv5); desc['fvx_partial'] = {'r': float(np.corrcoef(d5.g, d5.res)[0, 1]), 'n': len(d5)}
    db, _ = build(g_ky, big5); desc['big5_partial'] = {'r': float(np.corrcoef(db.g, db.res)[0, 1]), 'n': len(db)}
    try:
        mv = yahoo_daily('^MOVE', 'move_daily.json'); mq = mv.groupby(mv.index.to_period('Q')).mean(); mq = mq[mq.index <= pd.Period(LAST_OUT, 'Q')]
        dm, _ = build(g_ky, mq); desc['move_partial'] = {'r': float(np.corrcoef(dm.g, dm.res)[0, 1]), 'n': len(dm)}
    except Exception as e:
        desc['move_partial'] = {'error': str(e)[:80]}
    terc = pd.qcut(d.g, 3, labels=['low', 'mid', 'high'])
    desc['tercile_mean_resid'] = {str(k): float(v) for k, v in d.res.groupby(terc, observed=True).mean().items()}
    desc['tercile_mean_rv_bp'] = {str(k): float(v) for k, v in np.exp(d.y).groupby(terc, observed=True).mean().items()}
    desc['latest_g_ky'] = {str(k): float(v) for k, v in g_ky.tail(4).items()}
    res = dict(id='nbfi-rates-vol', seed=SEED, B=B, block=BLOCK, lag=LAG, prereg='forge/NBFI_RATES_VOL_PREREG.md',
               cell=dict(n=len(d), first=str(d.index[0]), last=str(d.index[-1]), partial_r=r, ci95=[float(lo), float(hi)],
                         half1=r1, half2=r2, n_half1=len(h1), n_half2=len(h2), placebo95=[float(plo), float(phi)], placebo_n=len(pl),
                         gate=gate, verdict=verdict), descriptive=desc)
    json.dump(res, open(os.path.join(OUT, 'results.json'), 'w'), indent=2)
    print(json.dumps(res, indent=1))


if __name__ == '__main__':
    main()
