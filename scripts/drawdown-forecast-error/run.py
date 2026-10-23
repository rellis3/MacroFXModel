"""drawdown-forecast-error — forge/DRAWDOWN_FORECAST_ERROR_PREREG.md.

D = -(20-day log return of SPX500, latest OANDA close known before the London session) x100 (+ = S&P fell).
e = ln(r_hl / shipped p50) (shipped = SI else S); date-level mean per cell; stat = top - bottom tercile of D.

Run: python scripts/drawdown-forecast-error/run.py
"""
import json, math, os
import numpy as np
import pandas as pd

SEED = 20261022
B = 2000
BLOCK = 21
SPLIT = pd.Timestamp('2023-08-21')
USEFUL = math.log(1.03)
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OUT = os.path.join(ROOT, 'analysis', 'output', 'drawdown-forecast-error')
os.makedirs(OUT, exist_ok=True)


def spx_signal(sessions, k=20):
    d = pd.read_parquet(os.path.join(ROOT, 'features', 'px_d1_spx500.parquet')).drop_duplicates('date')
    d['asof'] = pd.to_datetime(d['asof'], utc=True).dt.tz_localize(None)
    d = d.sort_values('asof'); a = d['asof'].values; v = np.log(d['value'].values)
    out = []
    for s in sessions:
        i = np.searchsorted(a, np.datetime64(s), side='right')
        out.append(-(v[i - 1] - v[i - 1 - k]) * 100 if i > k else np.nan)
    return pd.Series(out, index=sessions)


def tercile_stat(E, sig, rng):
    j = pd.concat({'e': E, 's': sig}, axis=1).dropna()
    lo_c, hi_c = j.s.quantile([1 / 3, 2 / 3])
    lab = np.where(j.s >= hi_c, 1, np.where(j.s <= lo_c, -1, 0)); ev = j.e.values; n = len(ev)
    est = ev[lab == 1].mean() - ev[lab == -1].mean()
    bs = np.empty(B); nb = math.ceil(n / BLOCK)
    for k in range(B):
        st = rng.integers(0, n - BLOCK + 1, nb); idx = np.concatenate([np.arange(a, a + BLOCK) for a in st])[:n]
        bs[k] = ev[idx][lab[idx] == 1].mean() - ev[idx][lab[idx] == -1].mean()
    lo, hi = np.percentile(bs, [2.5, 97.5])
    pl = np.array([ev[np.roll(lab, k) == 1].mean() - ev[np.roll(lab, k) == -1].mean() for k in range(63, n - 63, 5)])
    h1 = j.index < SPLIT
    half = lambda m: float(ev[m & (lab == 1)].mean() - ev[m & (lab == -1)].mean())
    return dict(est=float(est), lo=float(lo), hi=float(hi), plo=float(np.percentile(pl, 2.5)), phi=float(np.percentile(pl, 97.5)),
                h1=half(h1), h2=half(~h1), n=n, cuts=[float(lo_c), float(hi_c)], lab=lab, idx=j.index)


def main():
    rng = np.random.default_rng(SEED)
    d = pd.read_parquet(os.path.join(ROOT, 'analysis/output/vf3_stage_b/part1_lines.parquet'),
                        columns=['inst', 'date', 'oos', 'r_hl', 'klass', 'S_hl_p50', 'SI_hl_p50', 'S_hl_p75', 'SI_hl_p75'])
    d = d[d.oos == 1].copy(); d['date'] = pd.to_datetime(d['date'])
    d['has_iv'] = d.SI_hl_p50.notna()
    d['f50'] = d.SI_hl_p50.fillna(d.S_hl_p50); d['f75'] = d.SI_hl_p75.fillna(d.S_hl_p75)
    d['e'] = np.log(d.r_hl / d.f50); d['x75'] = (d.r_hl > d.f75).astype(float); d = d[np.isfinite(d.e)]
    d['cls'] = d.klass.map({'fx_majors': 'fx', 'fx_crosses': 'fx', 'indices': 'idx', 'gold': 'gold'})
    sessions = pd.DatetimeIndex(sorted(d.date.unique()))
    Dsig = spx_signal(sessions)
    pct = lambda x: 100 * (math.exp(x) - 1)
    res = dict(id='drawdown-forecast-error', seed=SEED, B=B, block=BLOCK, prereg='forge/DRAWDOWN_FORECAST_ERROR_PREREG.md', cells={}, descriptive={})
    for cell in ['fx', 'idx']:
        sub = d[d.cls == cell]
        E = sub.groupby('date').e.mean().reindex(sessions)
        r = tercile_stat(E, Dsig, rng)
        X75 = sub.groupby('date').x75.mean().reindex(r['idx']).values
        res['cells'][cell] = dict(n_sessions=r['n'], diff_pct=pct(r['est']), ci95_pct=[pct(r['lo']), pct(r['hi'])], ci95_log=[r['lo'], r['hi']],
                                  half1_pct=pct(r['h1']), half2_pct=pct(r['h2']), placebo95_pct=[pct(r['plo']), pct(r['phi'])], cuts=r['cuts'],
                                  x75_top=float(np.nanmean(X75[r['lab'] == 1])), x75_bottom=float(np.nanmean(X75[r['lab'] == -1])),
                                  p=math.erfc(abs(r['est']) / ((r['hi'] - r['lo']) / 3.92) / math.sqrt(2)))
        for iv in [True, False]:
            ss = sub[sub.has_iv == iv]
            if ss.inst.nunique() >= 2:
                Ei = ss.groupby('date').e.mean().reindex(sessions)
                res['descriptive'][f'{cell}_{"iv" if iv else "noiv"}_pct'] = pct(tercile_stat(Ei, Dsig, rng)['est'])
                res['descriptive'][f'{cell}_{"iv" if iv else "noiv"}_instruments'] = sorted(ss.inst.unique().tolist())
        for k in (5, 60):
            res['descriptive'][f'{cell}_D{k}_pct'] = pct(tercile_stat(E, spx_signal(sessions, k), rng)['est'])
    Eg = d[d.cls == 'gold'].groupby('date').e.mean().reindex(sessions)
    res['descriptive']['gold_pct'] = pct(tercile_stat(Eg, Dsig, rng)['est'])
    ps = {k: v['p'] for k, v in res['cells'].items()}; order = sorted(ps, key=ps.get); run = 0
    for i, k in enumerate(order):
        run = max(run, min(1.0, ps[k] * (len(order) - i))); res['cells'][k]['p_holm'] = run
    for k, c in res['cells'].items():
        g = dict(ci_excludes_0_positive_holm=bool(c['p_holm'] < 0.05 and c['ci95_log'][0] > 0), both_halves_positive=bool(c['half1_pct'] > 0 and c['half2_pct'] > 0),
                 above_placebo=bool(c['diff_pct'] > c['placebo95_pct'][1]))
        c['gate'] = g
        c['verdict'] = 'VALIDATED' if all(g.values()) else ('NULL' if c['ci95_log'][0] > -USEFUL and c['ci95_log'][1] < USEFUL else 'UNDERPOWERED')
    json.dump(res, open(os.path.join(OUT, 'results.json'), 'w'), indent=2, default=float)
    for k, c in res['cells'].items():
        print(k, {x: (round(v, 3) if isinstance(v, float) else ([round(z, 2) for z in v] if isinstance(v, list) else v)) for x, v in c.items()})
    print({k: (round(v, 2) if isinstance(v, float) else v) for k, v in res['descriptive'].items()})


if __name__ == '__main__':
    main()
