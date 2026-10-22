"""basis-stress-rules — forge/BASIS_STRESS_RULES_PREREG.md.

R1: W_t = -(mean of EUR/GBP fixed-leg daily basis change) (+ = widening, dollars dearer offshore).
    usd   : 7-pair USD basket log return x100, close t -> close t+5 (+ = USD stronger)
    fxvol : mean over pairs of ln(mean|r| t+1..t+5) - persistence fit on ln(mean|r| t-19..t)
R2: per contract, D = mean realised basis on days whose window spans the preceding quarter-end - on days that don't;
    year-end premium = mean D (March contracts) - mean D (other contracts).

Run: python scripts/basis-stress-rules/run.py
"""
import json, math, os
import numpy as np
import pandas as pd

SEED = 20261022
B = 2000
END = pd.Timestamp('2026-08-19')
SPLIT = pd.Timestamp('2021-04-01')
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OUT = os.path.join(ROOT, 'analysis', 'output', 'basis-stress-rules')
os.makedirs(OUT, exist_ok=True)
PAIRS = {'eurusd': -1, 'gbpusd': -1, 'audusd': -1, 'nzdusd': -1, 'usdcad': 1, 'usdchf': 1, 'usdjpy': 1}


def px(n):
    d = pd.read_parquet(os.path.join(ROOT, 'features', f'px_d1_{n}.parquet')).drop_duplicates('date')
    d['date'] = pd.to_datetime(d['date'])
    return d.set_index('date')['value'].sort_index()


def add_bdays(d, n):
    while n:
        d += pd.Timedelta(days=1)
        if d.weekday() < 5:
            n -= 1
    return d


def boot_corr(x, y, rng, block=10):
    n = len(x); nb = math.ceil(n / block); out = np.empty(B)
    for k in range(B):
        st = rng.integers(0, n - block + 1, nb); idx = np.concatenate([np.arange(a, a + block) for a in st])[:n]
        out[k] = np.corrcoef(x[idx], y[idx])[0, 1]
    return out


def main():
    rng = np.random.default_rng(SEED)
    bd = pd.read_csv(os.path.join(ROOT, 'analysis/output/xccy-basis/basis_daily.csv'), parse_dates=['date'])
    dch = bd.pivot_table(index='date', columns='pair', values='dchg')
    W = -dch.mean(axis=1, skipna=True).dropna()
    W = W[W.index <= END]

    P = {n: px(n) for n in PAIRS}
    cal = P['eurusd'].index
    lr = pd.DataFrame({n: np.log(s).diff() for n, s in P.items()}).reindex(cal)
    usd_daily = sum(PAIRS[n] * lr[n] for n in PAIRS) / len(PAIRS) * 100
    usd_fwd5 = usd_daily[::-1].rolling(5).sum()[::-1].shift(-1)          # t+1..t+5
    vol_res = {}
    for n in PAIRS:
        a = lr[n].abs()
        fwd = np.log(a[::-1].rolling(5).mean()[::-1].shift(-1)); back = np.log(a.rolling(20).mean())
        ok = np.isfinite(fwd) & np.isfinite(back) & (a.index >= '2016-01-01') & (a.index <= END)
        b = np.polyfit(back[ok], fwd[ok], 1)
        vol_res[n] = fwd - np.polyval(b, back)
    fxvol = pd.DataFrame(vol_res).mean(axis=1)
    usd_fwd1 = usd_daily.shift(-1); usd_fwd20 = usd_daily[::-1].rolling(20).sum()[::-1].shift(-1)

    df = pd.DataFrame({'W': W}).join(pd.DataFrame({'usd': usd_fwd5, 'fxvol': fxvol, 'same': usd_daily, 'usd1': usd_fwd1, 'usd20': usd_fwd20}), how='inner')
    res = dict(id='basis-stress-rules', seed=SEED, B=B, prereg='forge/BASIS_STRESS_RULES_PREREG.md', cells={}, descriptive={})
    for cell in ['usd', 'fxvol']:
        d = df[['W', cell]].dropna(); x, y = d.W.values, d[cell].values
        r = float(np.corrcoef(x, y)[0, 1]); bs = boot_corr(x, y, rng); lo, hi = np.percentile(bs, [2.5, 97.5])
        pl = np.array([np.corrcoef(np.roll(x, k), y)[0, 1] for k in range(20, len(x) - 20, 3)]); plo, phi = np.percentile(pl, [2.5, 97.5])
        h1, h2 = d[d.index < SPLIT], d[d.index >= SPLIT]
        res['cells'][cell] = dict(n=len(d), first=str(d.index[0].date()), last=str(d.index[-1].date()), r=r, ci95=[float(lo), float(hi)],
                                  half1=float(np.corrcoef(h1.W, h1[cell])[0, 1]), half2=float(np.corrcoef(h2.W, h2[cell])[0, 1]),
                                  placebo95=[float(plo), float(phi)], p=math.erfc(abs(r) / ((hi - lo) / 3.92) / math.sqrt(2)))

    # R2 year-end premium
    bd['value_date'] = bd.date.apply(lambda d: add_bdays(d, 2))
    bd['delivery'] = pd.to_datetime(bd.contract + '-15')
    def spans(row):
        dv = row.value_date
        qe = pd.Timestamp(year=dv.year, month=((dv.month - 1) // 3 + 1) * 3, day=1) + pd.offsets.MonthEnd(0)
        return dv <= qe < row.delivery
    bd['span'] = bd.apply(spans, axis=1)
    bd = bd[bd.date <= END]
    rows = []
    for (pair, c), g in bd.dropna(subset=['basis_realised']).groupby(['pair', 'contract']):
        if g.span.sum() >= 3 and (~g.span).sum() >= 3:
            rows.append({'pair': pair, 'contract': c, 'month': int(c[5:7]), 'D': g[g.span].basis_realised.mean() - g[~g.span].basis_realised.mean(),
                         'span_t': g[g.span].t_days.mean(), 'nospan_t': g[~g.span].t_days.mean()})
    Dd = pd.DataFrame(rows)
    per_c = Dd.groupby(['contract', 'month']).D.mean().reset_index()
    ye, ot = per_c[per_c.month == 3].D.values, per_c[per_c.month != 3].D.values
    est = float(ye.mean() - ot.mean())
    bs = np.array([rng.choice(ye, len(ye)).mean() - rng.choice(ot, len(ot)).mean() for _ in range(B)]); lo, hi = np.percentile(bs, [2.5, 97.5])
    by_pair = {p: float(Dd[(Dd.pair == p) & (Dd.month == 3)].D.mean() - Dd[(Dd.pair == p) & (Dd.month != 3)].D.mean()) for p in ['eur', 'gbp']}
    res['cells']['yearend'] = dict(n_yearend=len(ye), n_other=len(ot), premium_bp=est, ci95=[float(lo), float(hi)], by_pair=by_pair,
                                   mean_D_yearend=float(ye.mean()), mean_D_other=float(ot.mean()), p=math.erfc(abs(est) / ((hi - lo) / 3.92) / math.sqrt(2)),
                                   contracts=per_c.round(2).to_dict('records'))

    ps = {k: v['p'] for k, v in res['cells'].items()}; order = sorted(ps, key=ps.get); run = 0
    for i, k in enumerate(order):
        run = max(run, min(1.0, ps[k] * (len(order) - i))); res['cells'][k]['p_holm'] = run
    for k in ['usd', 'fxvol']:
        c = res['cells'][k]
        g = dict(ci_excludes_0_positive_holm=bool(c['p_holm'] < 0.05 and c['ci95'][0] > 0), both_halves_positive=bool(c['half1'] > 0 and c['half2'] > 0),
                 above_placebo=bool(c['r'] > c['placebo95'][1]))
        c['gate'] = g; c['verdict'] = 'VALIDATED' if all(g.values()) else ('NULL' if c['ci95'][0] > -0.10 and c['ci95'][1] < 0.10 else 'UNDERPOWERED')
    c = res['cells']['yearend']
    g = dict(ci_excludes_0_negative_holm=bool(c['p_holm'] < 0.05 and c['ci95'][1] < 0), negative_in_eur_and_gbp=bool(c['by_pair']['eur'] < 0 and c['by_pair']['gbp'] < 0))
    c['gate'] = g; c['verdict'] = 'VALIDATED' if all(g.values()) else ('NULL' if c['ci95'][0] > -10 and c['ci95'][1] < 10 else 'UNDERPOWERED')

    # descriptive
    big = df[df.W >= 20]
    res['descriptive']['literal_20bp_days'] = dict(n=len(big), dates=[str(x.date()) for x in big.index], usd5_mean=float(big.usd.mean()), fxvol_mean=float(big.fxvol.mean()),
                                                   all_usd5_mean=float(df.usd.mean()), all_fxvol_mean=float(df.fxvol.mean()))
    res['descriptive']['same_day_r'] = float(df[['W', 'same']].dropna().corr().iloc[0, 1])
    res['descriptive']['usd_1d_r'] = float(df[['W', 'usd1']].dropna().corr().iloc[0, 1])
    res['descriptive']['usd_20d_r'] = float(df[['W', 'usd20']].dropna().corr().iloc[0, 1])
    for p in ['eur', 'gbp']:
        wp = -dch[p].dropna(); j = pd.DataFrame({'w': wp}).join(df[['usd', 'fxvol']], how='inner').dropna()
        res['descriptive'][f'{p}_alone'] = {'usd_r': float(j.corr().loc['w', 'usd']), 'fxvol_r': float(j.corr().loc['w', 'fxvol'])}
    try:
        vx = pd.read_parquet(os.path.join(ROOT, 'features/vix.parquet')).drop_duplicates('date'); vx['date'] = pd.to_datetime(vx['date'])
        vix = vx.set_index('date').value.sort_index(); med = vix.rolling(252).median()
        j = df.join(pd.DataFrame({'vix': vix, 'med': med}), how='inner').dropna()
        sel = j[(j.W >= j.W.quantile(0.9)) & (j.vix < j.med)]
        res['descriptive']['vix_low_basis_widening'] = dict(n=len(sel), fxvol_mean=float(sel.fxvol.mean()), usd5_mean=float(sel.usd.mean()))
    except Exception as e:
        res['descriptive']['vix_low_basis_widening'] = str(e)[:80]
    res['descriptive']['generic_span_minus_nospan_bp'] = float(per_c.D.mean())
    res['descriptive']['tenor_span_vs_nospan_days'] = [float(Dd.span_t.mean()), float(Dd.nospan_t.mean())]
    json.dump(res, open(os.path.join(OUT, 'results.json'), 'w'), indent=2, default=float)
    for k, c in res['cells'].items():
        print(k, {x: (round(v, 3) if isinstance(v, float) else v) for x, v in c.items() if x != 'contracts'})
    print(json.dumps(res['descriptive'], indent=1, default=float)[:2500])


if __name__ == '__main__':
    main()
