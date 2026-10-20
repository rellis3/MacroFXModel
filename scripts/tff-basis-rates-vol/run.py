"""tff-basis-rates-vol — forge/TFF_BASIS_RATES_VOL_PREREG.md.

Weekly (Friday 21:00 UTC) signals from the feature store, point-in-time (asof <= t):
  level: -(net notional - trailing 156w mean) / trailing 156w SD      (+ = bigger short than usual)
  build: -(13-week change) / trailing 156w SD of 13-week changes      (+ = short growing)
Outcome: log RV of daily DGS10 changes over the next 20 trading days, residual on log RV of the previous 20.

Run: python scripts/tff-basis-rates-vol/run.py
"""
import json, math, os
import numpy as np
import pandas as pd

SEED = 20261021
B = 2000
BLOCK = 8
USEFUL = 0.10
LOCKBOX = pd.Timestamp('2026-08-21')
SPLIT = pd.Timestamp('2017-01-01')
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OUT = os.path.join(ROOT, 'analysis', 'output', 'tff-basis-rates-vol')
os.makedirs(OUT, exist_ok=True)


def load(fid):
    df = pd.read_parquet(os.path.join(ROOT, 'features', f'{fid}.parquet'))
    df['date'] = pd.to_datetime(df['date']); df['asof'] = pd.to_datetime(df['asof'], utc=True).dt.tz_localize(None)
    return df.sort_values(['date', 'asof']).drop_duplicates('date', keep='first')   # first-published value per date


def weekly_signals(tff):
    fr = pd.date_range('2006-06-23', LOCKBOX, freq='W-FRI') + pd.Timedelta(hours=21)
    rows = []
    for t in fr:
        known = tff[tff['asof'] <= t]
        if len(known) < 170:
            continue
        v = known.value.values
        hist = v[-156:]
        ch = v[13:] - v[:-13]
        ch_hist = ch[-156:]
        rows.append({'t': t.normalize(), 'net': v[-1], 'level': -(v[-1] - hist.mean()) / hist.std(ddof=1),
                     'build': -(v[-1] - v[-14]) / ch_hist.std(ddof=1)})
    return pd.DataFrame(rows).set_index('t')


def rv(chg):
    return chg.std(ddof=1) * math.sqrt(252) * 100 if len(chg) >= 15 else np.nan   # % -> bp


def outcomes(y10, weeks):
    y = y10.set_index('date').value
    d = y.diff().dropna()
    out = []
    for t in weeks:
        fwd = d[d.index > t].iloc[:20]; back = d[d.index <= t].iloc[-20:]
        if len(fwd) < 20 or fwd.index[-1] > LOCKBOX:
            out.append((np.nan, np.nan, np.nan)); continue
        lvl = y[y.index > t].iloc[:20]
        big5 = (lvl.diff(5).abs().max() * 100) if len(lvl) >= 6 else np.nan
        out.append((rv(fwd), rv(back), big5))
    return pd.DataFrame(out, index=weeks, columns=['rv_fwd', 'rv_back', 'big5'])


def boot(x, y, rng):
    n = len(x); nb = math.ceil(n / BLOCK); r = np.empty(B)
    for k in range(B):
        st = rng.integers(0, n - BLOCK + 1, nb)
        idx = np.concatenate([np.arange(s, s + BLOCK) for s in st])[:n]
        r[k] = np.corrcoef(x[idx], y[idx])[0, 1]
    return r


def p_from_ci(est, lo, hi):
    se = (hi - lo) / 3.92
    return math.erfc(abs(est) / se / math.sqrt(2)) if se > 0 else 1.0


def main():
    rng = np.random.default_rng(SEED)
    tff, y10 = load('tff_lev_ust_notional'), load('y10_usd')
    sig = weekly_signals(tff)
    oc = outcomes(y10, sig.index)
    d = sig.join(oc).dropna(subset=['rv_fwd', 'rv_back'])
    d['y'] = np.log(d.rv_fwd); d['x'] = np.log(d.rv_back)
    beta = np.polyfit(d.x, d.y, 1); d['res'] = d.y - np.polyval(beta, d.x)
    res = dict(id='tff-basis-rates-vol', seed=SEED, B=B, block=BLOCK, prereg='forge/TFF_BASIS_RATES_VOL_PREREG.md',
               n_weeks=len(d), first=str(d.index[0].date()), last=str(d.index[-1].date()), persistence_beta=[float(beta[0]), float(beta[1])], cells={})
    for cell in ['level', 'build']:
        x, y = d[cell].values, d.res.values
        r = float(np.corrcoef(x, y)[0, 1])
        bs = boot(x, y, rng); lo, hi = np.percentile(bs, [2.5, 97.5])
        pl = np.array([np.corrcoef(np.roll(x, k), y)[0, 1] for k in range(52, len(x) - 51, 4)]); plo, phi = np.percentile(pl, [2.5, 97.5])
        h1, h2 = d[d.index < SPLIT], d[d.index >= SPLIT]
        r1, r2 = float(np.corrcoef(h1[cell], h1.res)[0, 1]), float(np.corrcoef(h2[cell], h2.res)[0, 1])
        terc = pd.qcut(d[cell], 3, labels=['low', 'mid', 'high'])
        b5 = d.dropna(subset=['big5'])
        b5res = np.log(b5.big5) - np.polyval(np.polyfit(b5.x, np.log(b5.big5), 1), b5.x)
        res['cells'][cell] = dict(partial_r=r, ci95=[float(lo), float(hi)], half1=r1, half2=r2, n_half1=len(h1), n_half2=len(h2),
                                  placebo95=[float(plo), float(phi)], placebo_n=len(pl), p_from_ci=p_from_ci(r, lo, hi),
                                  desc=dict(raw_r_vs_logRVfwd=float(np.corrcoef(x, d.y)[0, 1]),
                                            big5_partial=float(np.corrcoef(b5[cell], b5res)[0, 1]),
                                            tercile_mean_resid={str(k): float(v) for k, v in d.res.groupby(terc, observed=True).mean().items()},
                                            tercile_mean_rv_fwd_bp={str(k): float(v) for k, v in d.rv_fwd.groupby(terc, observed=True).mean().items()},
                                            by_year={str(yr): float(np.corrcoef(g[cell], g.res)[0, 1]) for yr, g in d.groupby(d.index.year) if len(g) >= 30}))
    ps = {k: v['p_from_ci'] for k, v in res['cells'].items()}
    order = sorted(ps, key=ps.get); run = 0
    for i, k in enumerate(order):
        run = max(run, min(1.0, ps[k] * (len(order) - i))); res['cells'][k]['p_holm'] = run
    for k, c in res['cells'].items():
        excl0 = c['p_holm'] < 0.05 and c['ci95'][0] > 0
        same = c['half1'] > 0 and c['half2'] > 0
        outpl = c['partial_r'] > c['placebo95'][1]
        c['gate'] = dict(ci_excludes_0_positive_holm=bool(excl0), both_halves_positive=bool(same), above_placebo=bool(outpl))
        c['verdict'] = 'VALIDATED' if (excl0 and same and outpl) else ('NULL' if c['ci95'][0] > -USEFUL and c['ci95'][1] < USEFUL else 'UNDERPOWERED')
    # descriptive: MOVE as outcome (to 2026-09-21), latest state
    try:
        mv = load('move_index').set_index('date').value
        mfwd = pd.Series({t: mv[(mv.index > t)].iloc[:20].mean() if (mv.index > t).sum() >= 20 else np.nan for t in d.index})
        mback = pd.Series({t: mv[(mv.index <= t)].iloc[-20:].mean() for t in d.index})
        mm = pd.DataFrame({'f': np.log(mfwd), 'b': np.log(mback), 'level': d.level, 'build': d.build}).dropna()
        mr = mm.f - np.polyval(np.polyfit(mm.b, mm.f, 1), mm.b)
        res['descriptive_move'] = {c: float(np.corrcoef(mm[c], mr)[0, 1]) for c in ['level', 'build']} | {'n': len(mm)}
    except Exception as e:
        res['descriptive_move'] = {'error': str(e)[:80]}
    res['latest'] = sig.tail(3).reset_index().assign(t=lambda x: x.t.astype(str)).to_dict('records')
    json.dump(res, open(os.path.join(OUT, 'results.json'), 'w'), indent=2, default=float)
    print(json.dumps({k: v for k, v in res.items() if k != 'cells'}, indent=1, default=float))
    for k, c in res['cells'].items():
        print(k, {x: c[x] for x in ['partial_r', 'ci95', 'half1', 'half2', 'placebo95', 'p_holm', 'gate', 'verdict']})
        print('  ', json.dumps(c['desc'], default=float)[:700])


if __name__ == '__main__':
    main()
