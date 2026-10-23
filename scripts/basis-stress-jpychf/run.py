"""basis-stress-jpychf — forge/BASIS_STRESS_JPYCHF_PREREG.md. Same design as scripts/basis-stress-rules/run.py, per pair.

Run: python scripts/basis-stress-jpychf/run.py
"""
import json, math, os, sys
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'basis-stress-rules'))
import run as R   # px, add_bdays, boot_corr, PAIRS (the 7 USD pairs), END, ROOT

SEED = 20261023
B = 2000
OUT = os.path.join(R.ROOT, 'analysis', 'output', 'basis-stress-jpychf')
os.makedirs(OUT, exist_ok=True)
SPLIT = pd.Timestamp('2021-04-01')


def outcomes():
    P = {n: R.px(n) for n in R.PAIRS}
    cal = P['eurusd'].index
    lr = pd.DataFrame({n: np.log(s).diff() for n, s in P.items()}).reindex(cal)
    usd_daily = sum(R.PAIRS[n] * lr[n] for n in R.PAIRS) / len(R.PAIRS) * 100
    usd5 = usd_daily[::-1].rolling(5).sum()[::-1].shift(-1)
    res = {}
    for n in R.PAIRS:
        a = lr[n].abs()
        fwd = np.log(a[::-1].rolling(5).mean()[::-1].shift(-1)); back = np.log(a.rolling(20).mean())
        ok = np.isfinite(fwd) & np.isfinite(back) & (a.index >= '2016-01-01') & (a.index <= R.END)
        b = np.polyfit(back[ok], fwd[ok], 1); res[n] = fwd - np.polyval(b, back)
    own = {'jpy': R.PAIRS['usdjpy'] * lr['usdjpy'], 'chf': R.PAIRS['usdchf'] * lr['usdchf']}
    own5 = {k: (v[::-1].rolling(5).sum()[::-1].shift(-1)) * 100 for k, v in own.items()}
    return usd5, pd.DataFrame(res).mean(axis=1), own5


def spans(row):
    dv = row.value_date
    qe = pd.Timestamp(year=dv.year, month=((dv.month - 1) // 3 + 1) * 3, day=1) + pd.offsets.MonthEnd(0)
    return dv <= qe < row.delivery


def main():
    rng = np.random.default_rng(SEED)
    bd = pd.read_csv(os.path.join(R.ROOT, 'analysis/output/xccy-basis/basis_daily.csv'), parse_dates=['date'])
    usd5, fxvol, own5 = outcomes()
    res = dict(id='basis-stress-jpychf', seed=SEED, B=B, prereg='forge/BASIS_STRESS_JPYCHF_PREREG.md', cells={}, descriptive={})
    bd['value_date'] = bd.date.apply(lambda d: R.add_bdays(d, 2)); bd['delivery'] = pd.to_datetime(bd.contract + '-15')
    bd['span'] = bd.apply(spans, axis=1)
    for pair in ['jpy', 'chf']:
        x = bd[(bd.pair == pair) & (bd.date <= R.END)].set_index('date')
        W = -x.dchg.dropna()
        df = pd.DataFrame({'W': W}).join(pd.DataFrame({'usd': usd5, 'fxvol': fxvol, 'own': own5[pair]}), how='inner')
        for cell in ['usd', 'fxvol']:
            d = df[['W', cell]].dropna(); a, y = d.W.values, d[cell].values
            r = float(np.corrcoef(a, y)[0, 1]); bs = R.boot_corr(a, y, rng); lo, hi = np.percentile(bs, [2.5, 97.5])
            pl = np.array([np.corrcoef(np.roll(a, k), y)[0, 1] for k in range(20, len(a) - 20, 3)]); plo, phi = np.percentile(pl, [2.5, 97.5])
            h1, h2 = d[d.index < SPLIT], d[d.index >= SPLIT]
            res['cells'][f'{pair}-{cell}'] = dict(n=len(d), r=r, ci95=[float(lo), float(hi)], half1=float(np.corrcoef(h1.W, h1[cell])[0, 1]),
                                                  half2=float(np.corrcoef(h2.W, h2[cell])[0, 1]), placebo95=[float(plo), float(phi)],
                                                  p=math.erfc(abs(r) / ((hi - lo) / 3.92) / math.sqrt(2)), kind='R1')
        # R2
        rows = []
        for c, g in x.reset_index().dropna(subset=['basis_realised']).groupby('contract'):
            if g.span.sum() >= 3 and (~g.span).sum() >= 3:
                rows.append({'contract': c, 'month': int(c[5:7]), 'year': int(c[:4]), 'D': g[g.span].basis_realised.mean() - g[~g.span].basis_realised.mean()})
        Dd = pd.DataFrame(rows)
        ye, ot = Dd[Dd.month == 3].D.values, Dd[Dd.month != 3].D.values
        est = float(ye.mean() - ot.mean())
        bs = np.array([rng.choice(ye, len(ye)).mean() - rng.choice(ot, len(ot)).mean() for _ in range(B)]); lo, hi = np.percentile(bs, [2.5, 97.5])
        early, late = Dd[Dd.year <= 2020], Dd[Dd.year >= 2021]
        hf = lambda z: float(z[z.month == 3].D.mean() - z[z.month != 3].D.mean())
        res['cells'][f'yearend-{pair}'] = dict(n_yearend=len(ye), n_other=len(ot), premium_bp=est, ci95=[float(lo), float(hi)], half1=hf(early), half2=hf(late),
                                               p=math.erfc(abs(est) / ((hi - lo) / 3.92) / math.sqrt(2)), kind='R2',
                                               contracts=Dd.round(1).to_dict('records'))
        big = df[df.W >= 20]
        res['descriptive'][f'{pair}_literal_20bp'] = dict(n=len(big), dates=[str(i.date()) for i in big.index], usd5=float(big.usd.mean()) if len(big) else None)
        res['descriptive'][f'{pair}_own_pair_r'] = float(df[['W', 'own']].dropna().corr().iloc[0, 1])
        if pair == 'jpy':
            jun, so = Dd[Dd.month == 6].D, Dd[Dd.month.isin([9, 12])].D
            res['descriptive']['jpy_fiscal_yearend_premium_bp'] = float(jun.mean() - so.mean())
    ps = {k: v['p'] for k, v in res['cells'].items()}; order = sorted(ps, key=ps.get); run = 0
    for i, k in enumerate(order):
        run = max(run, min(1.0, ps[k] * (len(order) - i))); res['cells'][k]['p_holm'] = run
    for k, c in res['cells'].items():
        if c['kind'] == 'R1':
            g = dict(ci_excludes_0_positive_holm=bool(c['p_holm'] < 0.05 and c['ci95'][0] > 0), both_halves_positive=bool(c['half1'] > 0 and c['half2'] > 0), above_placebo=bool(c['r'] > c['placebo95'][1]))
            c['verdict'] = 'VALIDATED' if all(g.values()) else ('NULL' if c['ci95'][0] > -0.10 and c['ci95'][1] < 0.10 else 'UNDERPOWERED')
        else:
            g = dict(ci_excludes_0_negative_holm=bool(c['p_holm'] < 0.05 and c['ci95'][1] < 0), both_halves_negative=bool(c['half1'] < 0 and c['half2'] < 0))
            c['verdict'] = 'VALIDATED' if all(g.values()) else ('NULL' if c['ci95'][0] > -10 and c['ci95'][1] < 10 else 'UNDERPOWERED')
        c['gate'] = g
    json.dump(res, open(os.path.join(OUT, 'results.json'), 'w'), indent=2, default=float)
    for k, c in res['cells'].items():
        print(k, {a: (round(b, 3) if isinstance(b, float) else b) for a, b in c.items() if a != 'contracts'})
    print(json.dumps(res['descriptive'], default=float))
    for pair in ['jpy', 'chf']:
        cc = pd.DataFrame(res['cells'][f'yearend-{pair}']['contracts']); print(pair, 'March D by year:', cc[cc.month == 3][['year', 'D']].values.tolist(), '| others mean', round(cc[cc.month != 3].D.mean(), 1))


if __name__ == '__main__':
    main()
