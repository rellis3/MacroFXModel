"""hy-spread-vol — forge/HY_SPREAD_VOL_PREREG.md.

H_t = -[ln(HYG/IEF)_t - ln(HYG/IEF)_{t-20}] x 100  (+ = high yield underperformed Treasuries: spreads widening)
Outcome per instrument: ln(mean|r| t+1..t+5) - persistence fit on ln(mean|r| t-19..t), fit per instrument on the
scored sample; date-level mean over the cell. Stat: top - bottom tercile of H, as %.
Scored 2007-06 -> 2020-07; 2020-08 -> 2026-08 descriptive.

Run: python scripts/hy-spread-vol/run.py
"""
import json, math, os, urllib.request
import numpy as np
import pandas as pd

SEED = 20261022
B = 2000
BLOCK = 21
START, END = pd.Timestamp('2007-06-01'), pd.Timestamp('2020-07-31')
LATE_END = pd.Timestamp('2026-08-20')
SPLIT = pd.Timestamp('2014-01-01')
CRISIS = (pd.Timestamp('2008-09-01'), pd.Timestamp('2009-06-30'))
USEFUL = math.log(1.05)
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OUT = os.path.join(ROOT, 'analysis', 'output', 'hy-spread-vol')
os.makedirs(OUT, exist_ok=True)
CELLS = {'fx': ['eurusd', 'gbpusd', 'audusd', 'nzdusd', 'usdcad', 'usdchf', 'usdjpy'], 'idx': ['nas100', 'spx500']}


def yahoo(sym):
    path = os.path.join(OUT, f'{sym}_d.json')
    if not os.path.exists(path):
        u = f'https://query1.finance.yahoo.com/v8/finance/chart/{sym}?interval=1d&period1=1104537600&period2=1790000000'
        open(path, 'wb').write(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'}), timeout=60).read())
    j = json.load(open(path))['chart']['result'][0]
    idx = (pd.to_datetime(j['timestamp'], unit='s') - pd.Timedelta(hours=4)).normalize()     # US session date
    s = pd.Series(j['indicators']['adjclose'][0]['adjclose'], index=idx).dropna()
    return s[~s.index.duplicated(keep='last')]


def px(n):
    d = pd.read_parquet(os.path.join(ROOT, 'features', f'px_d1_{n}.parquet')).drop_duplicates('date')
    d['date'] = pd.to_datetime(d['date'])
    return d.set_index('date')['value'].sort_index()


def signal(a, b):
    r = np.log(yahoo(a) / yahoo(b)).dropna()
    return -(r - r.shift(20)) * 100


def residuals(names, start, end):
    out = {}
    for n in names:
        a = np.log(px(n)).diff().abs()
        fwd = np.log(a[::-1].rolling(5).mean()[::-1].shift(-1)); back = np.log(a.rolling(20).mean())
        ok = np.isfinite(fwd) & np.isfinite(back) & (a.index >= start) & (a.index <= end)
        b = np.polyfit(back[ok], fwd[ok], 1)
        out[n] = (fwd - np.polyval(b, back))[(a.index >= start) & (a.index <= end)]
    return pd.DataFrame(out).mean(axis=1)


def tdiff(e, s):
    j = pd.concat({'e': e, 's': s}, axis=1).dropna()
    lo, hi = j.s.quantile([1 / 3, 2 / 3])
    return float(j.e[j.s >= hi].mean() - j.e[j.s <= lo].mean()), j, lo, hi


def main():
    rng = np.random.default_rng(SEED)
    H = signal('HYG', 'IEF')
    pct = lambda x: 100 * (math.exp(x) - 1)
    res = dict(id='hy-spread-vol', seed=SEED, B=B, block=BLOCK, prereg='forge/HY_SPREAD_VOL_PREREG.md', cells={}, descriptive={})
    for cell, names in CELLS.items():
        E = residuals(names, START, END)
        Hs = H.reindex(E.index, method='ffill', limit=3)                   # carry over US holidays
        est, j, lo_c, hi_c = tdiff(E, Hs)
        lab = np.where(j.s >= hi_c, 1, np.where(j.s <= lo_c, -1, 0)); ev = j.e.values; n = len(ev)
        bs = np.empty(B); nb = math.ceil(n / BLOCK)
        for k in range(B):
            st = rng.integers(0, n - BLOCK + 1, nb); idx = np.concatenate([np.arange(a, a + BLOCK) for a in st])[:n]
            bs[k] = ev[idx][lab[idx] == 1].mean() - ev[idx][lab[idx] == -1].mean()
        lo, hi = np.percentile(bs, [2.5, 97.5])
        pl = np.array([ev[np.roll(lab, k) == 1].mean() - ev[np.roll(lab, k) == -1].mean() for k in range(63, n - 63, 5)])
        plo, phi = np.percentile(pl, [2.5, 97.5])
        dates = j.index
        half = lambda m: float(ev[m & (lab == 1)].mean() - ev[m & (lab == -1)].mean())
        exc = ~((dates >= CRISIS[0]) & (dates <= CRISIS[1]))
        res['cells'][cell] = dict(n_days=n, first=str(dates[0].date()), last=str(dates[-1].date()), diff_pct=pct(est), ci95_pct=[pct(lo), pct(hi)],
                                  ci95_log=[float(lo), float(hi)], r=float(np.corrcoef(j.s, j.e)[0, 1]),
                                  half1_pct=pct(half(dates < SPLIT)), half2_pct=pct(half(dates >= SPLIT)), ex_crisis_pct=pct(half(exc)),
                                  placebo95_pct=[pct(plo), pct(phi)], p=math.erfc(abs(est) / ((hi - lo) / 3.92) / math.sqrt(2)))
        # descriptive: 2020-08 -> 2026-08 with the same construction (fit on that window)
        E2 = residuals(names, pd.Timestamp('2020-08-01'), LATE_END); H2 = H.reindex(E2.index, method='ffill', limit=3)
        res['descriptive'][f'{cell}_2020_2026_pct'] = pct(tdiff(E2, H2)[0])
        Hj = signal('JNK', 'IEF').reindex(E.index, method='ffill', limit=3)
        res['descriptive'][f'{cell}_jnk_pct'] = pct(tdiff(E, Hj)[0])
    ps = {k: v['p'] for k, v in res['cells'].items()}; order = sorted(ps, key=ps.get); run = 0
    for i, k in enumerate(order):
        run = max(run, min(1.0, ps[k] * (len(order) - i))); res['cells'][k]['p_holm'] = run
    for k, c in res['cells'].items():
        g = dict(ci_excludes_0_positive_holm=bool(c['p_holm'] < 0.05 and c['ci95_log'][0] > 0), both_halves_positive=bool(c['half1_pct'] > 0 and c['half2_pct'] > 0),
                 above_placebo=bool(c['diff_pct'] > c['placebo95_pct'][1]), positive_ex_crisis=bool(c['ex_crisis_pct'] > 0))
        c['gate'] = g
        c['verdict'] = 'VALIDATED' if all(g.values()) else ('NULL' if c['ci95_log'][0] > -USEFUL and c['ci95_log'][1] < USEFUL else 'UNDERPOWERED')
    # gold descriptive
    Eg = residuals(['xauusd'], START, END); res['descriptive']['gold_pct'] = pct(tdiff(Eg, H.reindex(Eg.index, method='ffill', limit=3))[0])
    json.dump(res, open(os.path.join(OUT, 'results.json'), 'w'), indent=2, default=float)
    for k, c in res['cells'].items():
        print(k, {x: (round(v, 3) if isinstance(v, float) else ([round(z, 2) for z in v] if isinstance(v, list) else v)) for x, v in c.items()})
    print({k: round(v, 2) for k, v in res['descriptive'].items()})


if __name__ == '__main__':
    main()
