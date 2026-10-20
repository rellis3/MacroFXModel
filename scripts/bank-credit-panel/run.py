"""bank-credit-panel — forge/BANK_CREDIT_PANEL_PREREG.md.

Cross-sectional IC: each quarter, demean (across countries) the 4Q FX-adjusted growth of cross-border bank
claims on each country (BIS LBS, known end of q+2) and the country's quarter q+3 return (equity local ccy;
currency vs USD, + = local stronger). Pooled correlation, quarter-block bootstrap, label-shuffle placebo,
leave-one-country-out, halves.

Run: python scripts/bank-credit-panel/run.py
"""
import io, json, math, os, urllib.request
import numpy as np
import pandas as pd

SEED = 20261020
B = 2000
BLOCK = 4
LAG = 3
N_SHUFFLE = 1000
MIN_N = 8
USEFUL = 0.05
LAST_OUT = '2026Q2'
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'analysis', 'output', 'bank-credit-panel')
CACHE = os.path.join(OUT, 'cache')
os.makedirs(CACHE, exist_ok=True)

EQUITY = {'GB': '^FTSE', 'JP': '^N225', 'DE': '^GDAXI', 'FR': '^FCHI', 'CA': '^GSPTSE', 'AU': '^AXJO', 'HK': '^HSI', 'KR': '^KS11',
          'BR': '^BVSP', 'MX': '^MXX', 'IN': '^BSESN', 'CH': '^SSMI', 'ES': '^IBEX', 'IT': 'FTSEMIB.MI', 'NL': '^AEX', 'TW': '^TWII',
          'SG': '^STI', 'US': '^GSPC', 'ID': '^JKSE', 'TR': 'XU100.IS', 'BE': '^BFX', 'AT': '^ATX', 'MY': '^KLSE', 'TH': '^SET.BK',
          'PH': 'PSEI.PS', 'NZ': '^NZ50', 'NO': 'OBX.OL', 'SE': '^OMX'}
# (ticker, sign): sign +1 when the quote is USD per local (local up = return up), -1 when local per USD
FX = {'5C': ('EURUSD=X', 1), 'GB': ('GBPUSD=X', 1), 'AU': ('AUDUSD=X', 1), 'NZ': ('NZDUSD=X', 1), 'JP': ('JPY=X', -1),
      'CA': ('CAD=X', -1), 'CH': ('CHF=X', -1), 'KR': ('KRW=X', -1), 'BR': ('BRL=X', -1), 'MX': ('MXN=X', -1), 'IN': ('INR=X', -1),
      'TW': ('TWD=X', -1), 'SG': ('SGD=X', -1), 'ID': ('IDR=X', -1), 'TR': ('TRY=X', -1), 'MY': ('MYR=X', -1), 'TH': ('THB=X', -1),
      'PH': ('PHP=X', -1), 'NO': ('NOK=X', -1), 'SE': ('SEK=X', -1)}
BIS = 'https://stats.bis.org/api/v2/data/dataflow/BIS/WS_LBS_D_PUB/1.0/{key}?format=csv'


def fetch(url, name):
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=90) as r:
            open(path, 'wb').write(r.read())
    return open(path, 'rb').read()


def bis_growth(denom='TO1'):
    ccs = sorted(set(EQUITY) | set(FX))
    key = f"Q.S+F.C.A.{denom}.A.5J.A.5A.A.{'+'.join(ccs)}.N"
    df = pd.read_csv(io.BytesIO(fetch(BIS.format(key=key), f'bis_{denom}.csv')))
    df['q'] = pd.PeriodIndex(df.TIME_PERIOD.str.replace('-', ''), freq='Q')
    out = {}
    for cc, g in df.groupby('L_CP_COUNTRY'):
        s = g[g.L_MEASURE == 'S'].set_index('q').OBS_VALUE.astype(float).sort_index()
        f = g[g.L_MEASURE == 'F'].set_index('q').OBS_VALUE.astype(float).sort_index()
        s = s.reindex(pd.period_range(s.index.min(), s.index.max(), freq='Q'))
        f = f.reindex(s.index)
        gr = f.rolling(4).sum() / s.shift(4) * 100
        out[cc] = gr[(s.shift(4) > 0)].dropna()
    return out


def yahoo_q(sym):
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{sym.replace("^", "%5E")}?interval=1mo&period1=0&period2=1790000000'
    try:
        j = json.loads(fetch(url, f'y_{sym.replace("^", "").replace("=", "_").replace(".", "_")}.json'))['chart']['result'][0]
    except Exception:
        return None
    px = pd.Series(j['indicators']['quote'][0]['close'], index=pd.to_datetime(j['timestamp'], unit='s')).dropna()
    px = px[px > 0]
    q = px.groupby(px.index.to_period('Q')).last()
    q = q[q.index <= pd.Period(LAST_OUT, 'Q')]
    return np.log(q).diff().dropna() * 100


def panel(growth, rets, lag=LAG):
    rows = []
    for cc, r in rets.items():
        g = growth.get(cc)
        if g is None or r is None:
            continue
        sig = g.copy(); sig.index = sig.index + lag
        d = pd.concat({'g': sig, 'r': r}, axis=1).dropna()
        d['cc'] = cc; d['q'] = d.index
        rows.append(d)
    p = pd.concat(rows, ignore_index=True)
    lo, hi = p.g.quantile([0.01, 0.99])
    p['g'] = p.g.clip(lo, hi)
    cnt = p.groupby('q').cc.transform('count')
    p = p[cnt >= MIN_N].copy()
    p['gd'] = p.g - p.groupby('q').g.transform('mean')
    p['rd'] = p.r - p.groupby('q').r.transform('mean')
    return p


def ic(p):
    return float(np.corrcoef(p.gd, p.rd)[0, 1]) if len(p) > 3 else float('nan')


def boot(p, rng):
    qs = np.array(sorted(p.q.unique())); n = len(qs); nb = math.ceil(n / BLOCK)
    by = {q: d for q, d in p.groupby('q')}
    out = np.empty(B)
    for b in range(B):
        st = rng.integers(0, n - BLOCK + 1, nb)
        pick = np.concatenate([qs[s:s + BLOCK] for s in st])[:n]
        d = pd.concat([by[q] for q in pick])
        out[b] = np.corrcoef(d.gd, d.rd)[0, 1]
    return out


def shuffle_placebo(p, rng):
    out = np.empty(N_SHUFFLE)
    gd = p.gd.values.copy(); grp = p.groupby('q').indices
    for k in range(N_SHUFFLE):
        x = gd.copy()
        for idx in grp.values():
            x[idx] = x[rng.permutation(idx)]
        out[k] = np.corrcoef(x, p.rd.values)[0, 1]
    return out


def p_from_ci(est, lo, hi):
    se = (hi - lo) / 3.92
    return math.erfc(abs(est) / se / math.sqrt(2)) if se > 0 else 1.0


def run_cell(name, growth, rets, split, rng):
    p = panel(growth, rets)
    r = ic(p)
    bs = boot(p, rng); lo, hi = np.percentile(bs, [2.5, 97.5])
    pl = shuffle_placebo(p, rng); plo, phi = np.percentile(pl, [2.5, 97.5])
    h1, h2 = p[p.q < pd.Period(split, 'Q')], p[p.q >= pd.Period(split, 'Q')]
    loco = {cc: ic(p[p.cc != cc]) for cc in sorted(p.cc.unique())}
    # descriptive
    desc = {'lag_scan': {str(L): ic(panel(growth, rets, L)) for L in (1, 2, 3, 4, 5, 6)}}
    ts = p.copy(); ts['g_t'] = ts.g - ts.groupby('cc').g.transform('mean'); ts['r_t'] = ts.r - ts.groupby('cc').r.transform('mean')
    desc['within_country_timeseries_r'] = float(np.corrcoef(ts['g_t'], ts['r_t'])[0, 1])
    desc['per_country_ts_r'] = {cc: float(np.corrcoef(d.g, d.r)[0, 1]) for cc, d in p.groupby('cc') if len(d) >= 20}
    qmean = p.groupby('q').apply(lambda d: np.corrcoef(d.gd, d.rd)[0, 1] if len(d) >= MIN_N else np.nan, include_groups=False).dropna()
    desc['mean_quarterly_ic'] = float(qmean.mean()); desc['share_quarters_ic_neg'] = float((qmean < 0).mean())
    # top vs bottom tercile spread of next-quarter demeaned return
    p['terc'] = p.groupby('q').gd.transform(lambda x: pd.qcut(x.rank(method='first'), 3, labels=False))
    desc['tercile_mean_demeaned_ret'] = {str(k): float(v) for k, v in p.groupby('terc').rd.mean().items()}
    return dict(n=len(p), n_quarters=int(p.q.nunique()), n_countries=int(p.cc.nunique()), countries=sorted(p.cc.unique()),
                first=str(p.q.min()), last=str(p.q.max()), ic=r, ci95=[float(lo), float(hi)],
                half1=ic(h1), half2=ic(h2), n_half1=len(h1), n_half2=len(h2), split=split,
                placebo95=[float(plo), float(phi)], placebo_mean=float(pl.mean()),
                loco=loco, loco_sign_flips=[cc for cc, v in loco.items() if np.sign(v) != np.sign(r)],
                p_from_ci=p_from_ci(r, lo, hi), descriptive=desc)


def main():
    rng = np.random.default_rng(SEED)
    growth = bis_growth('TO1')
    eq = {cc: yahoo_q(t) for cc, t in EQUITY.items()}
    fx = {}
    for cc, (t, sgn) in FX.items():
        r = yahoo_q(t); fx[cc] = None if r is None else r * sgn
    res = {'id': 'bank-credit-panel', 'seed': SEED, 'B': B, 'block': BLOCK, 'lag': LAG, 'prereg': 'forge/BANK_CREDIT_PANEL_PREREG.md',
           'missing': {'equity': [c for c, v in eq.items() if v is None], 'fx': [c for c, v in fx.items() if v is None],
                       'bis': [c for c in set(EQUITY) | set(FX) if c not in growth]}, 'cells': {}}
    res['cells']['equity'] = run_cell('equity', growth, eq, '2008Q1', rng)
    res['cells']['fx'] = run_cell('fx', growth, fx, '2015Q1', rng)
    # Holm over the two cells
    ps = {k: v['p_from_ci'] for k, v in res['cells'].items()}
    order = sorted(ps, key=ps.get); m = len(order); run = 0
    for i, k in enumerate(order):
        run = max(run, min(1.0, ps[k] * (m - i))); res['cells'][k]['p_holm'] = run
    for k, c in res['cells'].items():
        excl0 = c['p_holm'] < 0.05 and (c['ci95'][0] > 0 or c['ci95'][1] < 0)
        same = np.sign(c['half1']) == np.sign(c['half2']) == np.sign(c['ic'])
        outpl = c['ic'] < c['placebo95'][0] or c['ic'] > c['placebo95'][1]
        loco_ok = not c['loco_sign_flips']
        c['gate'] = dict(ci_excludes_0_holm=bool(excl0), same_sign_halves=bool(same), outside_placebo=bool(outpl), loco_no_flip=bool(loco_ok))
        if excl0 and same and outpl and loco_ok: v = 'VALIDATED'
        elif c['ci95'][0] > -USEFUL and c['ci95'][1] < USEFUL: v = 'NULL'
        else: v = 'UNDERPOWERED'
        c['verdict'] = v
    json.dump(res, open(os.path.join(OUT, 'results.json'), 'w'), indent=2, default=float)
    for k, c in res['cells'].items():
        print(k, {x: c[x] for x in ['n', 'n_quarters', 'n_countries', 'first', 'last', 'ic', 'ci95', 'half1', 'half2', 'placebo95', 'loco_sign_flips', 'p_holm', 'gate', 'verdict']})
        print('  desc', json.dumps(c['descriptive'], default=float)[:900])
    print('missing', res['missing'])


if __name__ == '__main__':
    main()
