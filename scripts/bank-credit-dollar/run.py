"""bank-credit-dollar — forge/BANK_CREDIT_DOLLAR_PREREG.md.

Signal g(q): 4-quarter FX-adjusted growth of cross-border USD bank claims (BIS LBS).
Known at end of q+2; predicts the log return over q+3 (DXY, Nasdaq).
Gate: Holm-corrected block-bootstrap CI excludes 0, same sign both halves, outside placebo 95%.

Run: python scripts/bank-credit-dollar/run.py   (fetches BIS + Yahoo, caches inputs)
"""
import io, json, math, os, sys, urllib.request
import numpy as np
import pandas as pd

SEED = 20261020
B = 2000
BLOCK = 4
LAG = 3                      # g(q) predicts quarter q+3 (known end of q+2)
FIRST_OUT, LAST_OUT = '1980Q3', '2026Q2'
HALF_SPLIT = '2008Q1'
USEFUL_R = 0.15
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'analysis', 'output', 'bank-credit-dollar')
os.makedirs(OUT, exist_ok=True)

BIS = 'https://stats.bis.org/api/v2/data/dataflow/BIS/WS_LBS_D_PUB/1.0/{key}?format=csv'
KEYS = {  # (measure, denom, cp_sector)
    'usd': ('USD', 'A'), 'eur': ('EUR', 'A'), 'all': ('TO1', 'A'), 'usd_nbfi': ('USD', 'F'),
}


def fetch(url, cache):
    path = os.path.join(OUT, cache)
    if not os.path.exists(path):
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=60) as r:
            open(path, 'wb').write(r.read())
    return open(path, 'rb').read()


def bis_series(measure, denom, sector):
    key = f'Q.{measure}.C.A.{denom}.A.5J.A.5A.{sector}.5J.N'
    df = pd.read_csv(io.BytesIO(fetch(BIS.format(key=key), f'bis_{measure}_{denom}_{sector}.csv')))
    s = df.set_index('TIME_PERIOD')['OBS_VALUE'].astype(float)
    s.index = pd.PeriodIndex(s.index.str.replace('-', ''), freq='Q')
    return s.sort_index()


def growth(denom, sector):
    s, f = bis_series('S', denom, sector), bis_series('F', denom, sector)
    return (f.rolling(4).sum() / s.shift(4) * 100).dropna()


def yahoo_quarterly(sym, cache):
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{sym}?interval=1mo&period1=0&period2=1790000000'
    j = json.loads(fetch(url, cache))['chart']['result'][0]
    ts = pd.to_datetime(j['timestamp'], unit='s')
    px = pd.Series(j['indicators']['adjclose'][0]['adjclose'] if 'adjclose' in j['indicators'] else j['indicators']['quote'][0]['close'], index=ts).dropna()
    px = px[~px.index.duplicated()]
    q = px.groupby(px.index.to_period('Q')).last()          # last monthly close in quarter
    # drop the in-progress quarter
    q = q[q.index <= pd.Period(LAST_OUT, 'Q')]
    return (np.log(q).diff() * 100).dropna()


def block_boot_r(x, y, rng):
    n = len(x); nb = math.ceil(n / BLOCK); out = np.empty(B)
    for b in range(B):
        starts = rng.integers(0, n - BLOCK + 1, nb)
        idx = np.concatenate([np.arange(s, s + BLOCK) for s in starts])[:n]
        out[b] = np.corrcoef(x[idx], y[idx])[0, 1]
    return out


def placebo(x, y):
    n = len(x)
    rs = [np.corrcoef(np.roll(x, k), y)[0, 1] for k in range(12, n - 11)]
    return np.array(rs)


def p_from_ci(est, lo, hi):
    se = (hi - lo) / (2 * 1.96)
    z = abs(est) / se if se > 0 else 0
    return math.erfc(z / math.sqrt(2))


def align(g, ret, lag):
    sig = g.copy(); sig.index = sig.index + lag
    df = pd.concat({'g': sig, 'r': ret}, axis=1).dropna()
    return df[(df.index >= pd.Period(FIRST_OUT, 'Q')) & (df.index <= pd.Period(LAST_OUT, 'Q'))]


def main():
    rng = np.random.default_rng(SEED)
    g = {k: growth(*v) for k, v in KEYS.items()}
    rets = {'dxy': yahoo_quarterly('DX-Y.NYB', 'yahoo_dxy_1mo.json'),
            'nasdaq': yahoo_quarterly('%5EIXIC', 'yahoo_ixic_1mo.json')}
    res = {'seed': SEED, 'B': B, 'block': BLOCK, 'lag': LAG, 'cells': {}, 'descriptive': {}}
    pvals = {}
    for cell, ret in rets.items():
        df = align(g['usd'], ret, LAG)
        x, y = df.g.values, df.r.values
        r = float(np.corrcoef(x, y)[0, 1])
        slope = float(np.polyfit(x, y, 1)[0])
        bs = block_boot_r(x, y, rng)
        lo, hi = np.percentile(bs, [2.5, 97.5])
        pl = placebo(x, y); plo, phi = np.percentile(pl, [2.5, 97.5])
        h1 = df[df.index < pd.Period(HALF_SPLIT, 'Q')]; h2 = df[df.index >= pd.Period(HALF_SPLIT, 'Q')]
        r1 = float(np.corrcoef(h1.g, h1.r)[0, 1]); r2 = float(np.corrcoef(h2.g, h2.r)[0, 1])
        pvals[cell] = p_from_ci(r, lo, hi)
        res['cells'][cell] = dict(n=len(df), first=str(df.index[0]), last=str(df.index[-1]), r=r, slope_pct_per_pp=slope,
                                  ci95=[float(lo), float(hi)], half1_r=r1, half2_r=r2, n_half1=len(h1), n_half2=len(h2),
                                  placebo95=[float(plo), float(phi)], placebo_n=len(pl), p_from_ci=pvals[cell])
        # descriptive: lag scan incl. same-quarter, other denominations, NBFI
        res['descriptive'][cell] = {
            'lag_scan': {str(L): float(np.corrcoef(*align(g['usd'], ret, L)[['g', 'r']].values.T)[0, 1]) for L in range(0, 8)},
            'other_signals_lag3': {k: float(np.corrcoef(*align(g[k], ret, LAG)[['g', 'r']].values.T)[0, 1]) for k in ['eur', 'all', 'usd_nbfi']},
            'n_usd_nbfi': len(align(g['usd_nbfi'], ret, LAG)),
        }
    # Holm across the two scored cells
    order = sorted(pvals, key=pvals.get); holm = {}
    for i, c in enumerate(order):
        holm[c] = min(1.0, max([pvals[o] * (len(order) - j) for j, o in enumerate(order[:i + 1])]))
    for c, d in res['cells'].items():
        d['p_holm'] = holm[c]
        ci_ex0 = d['p_holm'] < 0.05 and (d['ci95'][0] > 0 or d['ci95'][1] < 0)
        same_sign = np.sign(d['half1_r']) == np.sign(d['half2_r']) == np.sign(d['r'])
        out_pl = d['r'] < d['placebo95'][0] or d['r'] > d['placebo95'][1]
        d['gate'] = dict(ci_excludes_0_holm=bool(ci_ex0), same_sign_halves=bool(same_sign), outside_placebo=bool(out_pl))
        if ci_ex0 and same_sign and out_pl: v = 'VALIDATED'
        elif d['ci95'][0] > -USEFUL_R and d['ci95'][1] < USEFUL_R: v = 'NULL'
        else: v = 'UNDERPOWERED'
        d['verdict'] = v
    json.dump(res, open(os.path.join(OUT, 'results.json'), 'w'), indent=2)
    print(json.dumps(res, indent=2))


if __name__ == '__main__':
    main()
