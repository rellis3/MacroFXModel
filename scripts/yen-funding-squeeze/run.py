"""yen-funding-squeeze — forge/YEN_FUNDING_SQUEEZE_PREREG.md.

Signal: 4Q FX-adjusted growth of yen lent outside Japan (BIS LBS: JPY claims on all countries minus on Japan),
known end of q+2. Outcome: log of the largest peak-to-trough fall in USDJPY / AUDJPY (yen strength) within
quarter q+3, residual on log realised vol of the cross in q+2. Scored: partial correlation per cross, Holm.

Run: python scripts/yen-funding-squeeze/run.py
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
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'analysis', 'output', 'yen-funding-squeeze')
CACHE = os.path.join(OUT, 'cache')
os.makedirs(CACHE, exist_ok=True)
BIS = 'https://stats.bis.org/api/v2/data/dataflow/BIS/WS_LBS_D_PUB/1.0/{key}?format=csv'
CROSSES = {'usdjpy': 'JPY=X', 'audjpy': 'AUDJPY=X'}
DESC_CROSSES = {'eurjpy': 'EURJPY=X'}


def fetch(url, name):
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=90) as r:
            open(path, 'wb').write(r.read())
    return open(path, 'rb').read()


def yen_offshore_growth():
    df = pd.read_csv(io.BytesIO(fetch(BIS.format(key='Q.S+F.C.A.JPY.A.5J.A.5A.A.5J+JP+GB+SG+CH.N'), 'bis_jpy.csv')))
    df['q'] = pd.PeriodIndex(df.TIME_PERIOD.str.replace('-', ''), freq='Q')
    ser = lambda m, c: df[(df.L_MEASURE == m) & (df.L_CP_COUNTRY == c)].set_index('q').OBS_VALUE.astype(float).sort_index()
    s = ser('S', '5J') - ser('S', 'JP'); f = ser('F', '5J') - ser('F', 'JP')
    idx = pd.period_range(s.dropna().index.min(), s.dropna().index.max(), freq='Q')
    s, f = s.reindex(idx), f.reindex(idx)
    g = (f.rolling(4).sum() / s.shift(4) * 100)[s.shift(4) > 0].dropna()
    hubs = sum(ser('S', c) for c in ['GB', 'SG', 'CH']).reindex(idx)
    return g, (hubs / s * 100).dropna()


def yahoo_daily(sym):
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{sym}?interval=1d&period1=0&period2=1790000000'
    j = json.loads(fetch(url, f'{sym.replace("=", "_")}_daily.json'))['chart']['result'][0]
    px = pd.Series(j['indicators']['quote'][0]['close'], index=pd.to_datetime(j['timestamp'], unit='s')).dropna()
    return px[px > 0]


def quarter_stats(px):
    q = px.index.to_period('Q')
    def dd(x):
        if len(x) < 40: return np.nan
        return float(((x.cummax() - x) / x.cummax()).max() * 100)
    def big5(x):
        if len(x) < 40: return np.nan
        return float((-(np.log(x).diff(5))).max() * 100)
    def rv(x):
        if len(x) < 40: return np.nan
        return float(np.log(x).diff().std() * math.sqrt(252) * 100)
    S = px.groupby(q).apply(dd).dropna(); RV = px.groupby(q).apply(rv).dropna(); B5 = px.groupby(q).apply(big5).dropna()
    cut = lambda s: s[s.index <= pd.Period(LAST_OUT, 'Q')]
    return cut(S), cut(RV), cut(B5)


def build(g, S, RV, lag=LAG):
    sig = g.copy(); sig.index = sig.index + lag
    prev = RV.copy(); prev.index = prev.index + 1
    d = pd.concat({'g': sig, 'y': np.log(S.clip(lower=0.05)), 'x': np.log(prev)}, axis=1).dropna()
    b = np.polyfit(d.x, d.y, 1); d['res'] = d.y - np.polyval(b, d.x)
    return d


def boot(x, y, rng):
    n = len(x); nb = math.ceil(n / BLOCK); out = np.empty(B)
    for k in range(B):
        st = rng.integers(0, n - BLOCK + 1, nb)
        idx = np.concatenate([np.arange(s, s + BLOCK) for s in st])[:n]
        out[k] = np.corrcoef(x[idx], y[idx])[0, 1]
    return out


def p_from_ci(est, lo, hi):
    se = (hi - lo) / 3.92
    return math.erfc(abs(est) / se / math.sqrt(2)) if se > 0 else 1.0


def main():
    rng = np.random.default_rng(SEED)
    g, hub_share = yen_offshore_growth()
    res = dict(id='yen-funding-squeeze', seed=SEED, B=B, block=BLOCK, lag=LAG, prereg='forge/YEN_FUNDING_SQUEEZE_PREREG.md', cells={}, descriptive={})
    for name, sym in CROSSES.items():
        S, RV, B5 = quarter_stats(yahoo_daily(sym))
        d = build(g, S, RV)
        x, y = d.g.values, d.res.values
        r = float(np.corrcoef(x, y)[0, 1])
        bs = boot(x, y, rng); lo, hi = np.percentile(bs, [2.5, 97.5])
        pl = np.array([np.corrcoef(np.roll(x, k), y)[0, 1] for k in range(12, len(x) - 11)]); plo, phi = np.percentile(pl, [2.5, 97.5])
        mid = len(d) // 2; h1, h2 = d.iloc[:mid], d.iloc[mid:]
        r1, r2 = float(np.corrcoef(h1.g, h1.res)[0, 1]), float(np.corrcoef(h2.g, h2.res)[0, 1])
        terc = pd.qcut(d.g, 3, labels=['low', 'mid', 'high'])
        db = build(g, B5, RV)
        res['cells'][name] = dict(n=len(d), first=str(d.index[0]), last=str(d.index[-1]), split=str(d.index[mid]), partial_r=r, ci95=[float(lo), float(hi)],
                                  half1=r1, half2=r2, placebo95=[float(plo), float(phi)], placebo_n=len(pl), p_from_ci=p_from_ci(r, lo, hi),
                                  desc=dict(raw_r=float(np.corrcoef(d.g, d.y)[0, 1]),
                                            lag_scan={str(L): float(np.corrcoef(*build(g, S, RV, L)[['g', 'res']].values.T)[0, 1]) for L in range(1, 7)},
                                            big5_partial=float(np.corrcoef(db.g, db.res)[0, 1]),
                                            tercile_mean_drawdown_pct={str(k): float(v) for k, v in np.exp(d.y).groupby(terc, observed=True).mean().items()},
                                            tercile_mean_resid={str(k): float(v) for k, v in d.res.groupby(terc, observed=True).mean().items()}))
    ps = {k: v['p_from_ci'] for k, v in res['cells'].items()}
    order = sorted(ps, key=ps.get); run = 0
    for i, k in enumerate(order):
        run = max(run, min(1.0, ps[k] * (len(order) - i))); res['cells'][k]['p_holm'] = run
    for k, c in res['cells'].items():
        excl0 = c['p_holm'] < 0.05 and (c['ci95'][0] > 0 or c['ci95'][1] < 0)
        same = np.sign(c['half1']) == np.sign(c['half2']) == np.sign(c['partial_r'])
        outpl = c['partial_r'] < c['placebo95'][0] or c['partial_r'] > c['placebo95'][1]
        c['gate'] = dict(ci_excludes_0_holm=bool(excl0), same_sign_halves=bool(same), outside_placebo=bool(outpl))
        c['verdict'] = 'VALIDATED' if (excl0 and same and outpl) else ('NULL' if c['ci95'][0] > -USEFUL and c['ci95'][1] < USEFUL else 'UNDERPOWERED')
    for name, sym in DESC_CROSSES.items():
        S, RV, _ = quarter_stats(yahoo_daily(sym)); d = build(g, S, RV)
        res['descriptive'][name] = dict(n=len(d), partial_r=float(np.corrcoef(d.g, d.res)[0, 1]))
    # hub share (GB+SG+CH share of yen lent outside Japan) as the signal instead of growth
    hs = hub_share.diff(4).dropna()
    for name, sym in CROSSES.items():
        S, RV, _ = quarter_stats(yahoo_daily(sym)); d = build(hs, S, RV)
        res['descriptive'][f'hub_share_change_{name}'] = dict(n=len(d), partial_r=float(np.corrcoef(d.g, d.res)[0, 1]))
    res['descriptive']['latest_g'] = {str(k): float(v) for k, v in g.tail(4).items()}
    json.dump(res, open(os.path.join(OUT, 'results.json'), 'w'), indent=2)
    print(json.dumps(res, indent=1))


if __name__ == '__main__':
    main()
