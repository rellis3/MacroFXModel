"""vix-calculus part D (forge/VIX_CALCULUS_PREREG.md): Garin's intraday rule ("When VIX reacts hard, ES leans up afterwards") out of sample.
  python intraday.py build  -> readings.parquet (one row per index x day x reading hour; no scoring)
  python intraday.py power  -> planted-signal power on 2016-2020 only (Garin's own sample), writes power_D.json
  python intraday.py run    -> 2016-2020 reproduction of his table + the scored 2021-01-04 -> 2026-08-21 cells, writes results_D.json
Prices: index at T = close of the OANDA M1 bar starting at T-1min; VIX at T = close of the IB 5-minute bar starting at T-5min (i.e. ending at T)."""
import os, sys, json
import numpy as np, pandas as pd
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'analysis', 'output', 'vix-calculus'); SEED = 20261023; rng = np.random.default_rng(SEED)
HOURS = [11, 12, 13, 14, 15, 16]; IDX = {'ES': 'spx500_m1', 'NQ': 'nas100_usd_m1'}
TEST0, TEST1 = pd.Timestamp('2021-01-04'), pd.Timestamp('2026-08-21')


def at(series_et, day, hh, mm, tol=5):
    """Close of the bar starting at hh:mm ET, or of the last bar starting up to `tol` minutes before it (M1 CFD bars have gaps)."""
    t = pd.Timestamp(day).tz_localize('America/New_York') + pd.Timedelta(hours=hh, minutes=mm)
    i = series_et.index.searchsorted(t, side='right') - 1
    return float(series_et.iloc[i]) if i >= 0 and t - series_et.index[i] <= pd.Timedelta(minutes=tol) else np.nan


def build():
    vx = pd.read_parquet(os.path.join(OUT, 'data', 'VIX_5m.parquet'))['close']; vx.index = vx.index.tz_convert('America/New_York')
    full = set(d for d, g in vx.groupby(vx.index.date) if any((t.hour, t.minute) == (15, 55) for t in g.index) and any((t.hour, t.minute) == (9, 55) for t in g.index))
    rows = []
    for name, f in IDX.items():
        m = pd.read_parquet(os.path.join(ROOT, 'VolRangeForecaster', 'data', 'm1', f + '.parquet'))['close']; m.index = m.index.tz_convert('America/New_York')
        m = m[m.index.normalize().tz_localize(None) <= TEST1]
        for day in sorted(full):
            d0 = pd.Timestamp(day)
            if d0 > TEST1: continue
            i10, v10 = at(m, day, 9, 59), at(vx, day, 9, 55); iend = at(m, day, 16, 54)
            if not (np.isfinite(i10) and np.isfinite(v10) and np.isfinite(iend)): continue
            for h in HOURS:
                iT, vT = at(m, day, h - 1, 59), at(vx, day, h - 1, 55)
                if not (np.isfinite(iT) and np.isfinite(vT)): continue
                ip, vp = (iT / i10 - 1) * 100, (vT / v10 - 1) * 100
                rows.append(dict(index=name, day=d0, hour=h, idx_pct=ip, vix_pct=vp, ratio=(-vp / ip) if abs(ip) >= 0.01 else np.nan, tiny=abs(ip) < 0.01,
                                 down=ip < 0, fwd=np.log(iend / iT)))
    R = pd.DataFrame(rows).sort_values(['index', 'hour', 'day'])
    # outcome in units of its normal move: SD of the same hour -> 16:55 change over the previous 60 sessions (causal)
    R['norm'] = R.groupby(['index', 'hour'])['fwd'].transform(lambda s: s.shift(1).rolling(60, min_periods=40).std())
    R['y'] = R['fwd'] / R['norm']
    R.to_parquet(os.path.join(OUT, 'readings.parquet')); print(R.groupby('index').size().to_dict(), 'tiny share', R['tiny'].mean().round(4), 'days', R['day'].nunique())


def bucketise(R):
    R = R[np.isfinite(R['ratio']) & np.isfinite(R['y'])].copy(); R['bucket'] = None
    cuts = {}
    for name, g in R[R['day'] < pd.Timestamp('2021-01-01')].groupby('index'):
        cuts[name] = (float(g['ratio'].quantile(1 / 3)), float(g['ratio'].quantile(2 / 3)))
    R['bucket'] = [('barely' if r < cuts[i][0] else 'hard' if r >= cuts[i][1] else 'middle') for i, r in zip(R['index'], R['ratio'])]
    return R, cuts


def diff_boot(g, B=2000, delta=0.0):
    """Hard minus Barely mean outcome with a session-clustered bootstrap. Returns (diff, lo95, hi95, one-sided p for diff > 0)."""
    y = g['y'].to_numpy() + np.where(g['bucket'] == 'hard', delta, 0.0)
    days, inv = np.unique(g['day'].to_numpy(), return_inverse=True); nd = len(days)
    hs = np.bincount(inv, weights=y * (g['bucket'] == 'hard'), minlength=nd); hn = np.bincount(inv, weights=(g['bucket'] == 'hard').astype(float), minlength=nd)
    bs = np.bincount(inv, weights=y * (g['bucket'] == 'barely'), minlength=nd); bn = np.bincount(inv, weights=(g['bucket'] == 'barely').astype(float), minlength=nd)
    d = hs.sum() / hn.sum() - bs.sum() / bn.sum()
    W = rng.multinomial(nd, np.full(nd, 1 / nd), size=B).astype(float)
    bd = (W @ hs) / (W @ hn) - (W @ bs) / (W @ bn)
    return float(d), float(np.percentile(bd, 2.5)), float(np.percentile(bd, 97.5)), float(np.mean(bd <= 0))


def table(R):
    out = {}
    for (i, dn), g in R.groupby(['index', 'down']):
        key = f"{i} · {'Down' if dn else 'Up'} since 10:00"; out[key] = {b: float(g.loc[g['bucket'] == b, 'y'].mean()) for b in ('barely', 'middle', 'hard')}
        yrs = [(y, gg) for y, gg in g.groupby(g['day'].dt.year)]
        sgn = np.sign(out[key]['hard'] - out[key]['barely'])
        out[key]['years_same_way'] = f"{sum(np.sign(gg.loc[gg['bucket'] == 'hard', 'y'].mean() - gg.loc[gg['bucket'] == 'barely', 'y'].mean()) == sgn for _, gg in yrs)}/{len(yrs)}"
        out[key]['n_readings'] = int(len(g)); out[key]['n_days'] = int(g['day'].nunique())
    return out


if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'build': build(); sys.exit()
    R, cuts = bucketise(pd.read_parquet(os.path.join(OUT, 'readings.parquet')))
    IS = R[R['day'] < pd.Timestamp('2021-01-01')]; OOS = R[(R['day'] >= TEST0) & (R['day'] <= TEST1)]
    if mode == 'power':
        n_test_days = int(OOS['day'].nunique()) if len(OOS) else 1420; res = {'n_test_days_used': n_test_days, 'cuts': cuts}
        for name in ('ES', 'NQ'):
            for dn in (True, False):
                g0 = IS[(IS['index'] == name) & (IS['down'] == dn)]; days = g0['day'].unique()
                for delta in (0.05, 0.10, 0.15, 0.20):
                    hit = 0
                    for _ in range(100):
                        pick = rng.choice(days, n_test_days, replace=True)
                        # resample whole days to the test-period day count, re-label to keep clusters distinct
                        sel = pd.DataFrame({'day': pick}); sel['k'] = np.arange(len(pick)); gg = sel.merge(g0, on='day'); gg['day'] = gg['k']
                        gg['y'] = gg['y'] - gg.groupby('bucket')['y'].transform('mean') + gg['y'].mean()        # remove any in-sample effect: power for a PLANTED delta only
                        d, lo, hi, p = diff_boot(gg, B=400, delta=delta); hit += p < 0.0125           # Holm-4 worst case, one-sided
                    res[f'{name}|{"down" if dn else "up"}|delta{delta}'] = hit / 100; print(name, dn, delta, hit / 100, flush=True)
        json.dump(res, open(os.path.join(OUT, 'power_D.json'), 'w'), indent=1); sys.exit()
    if mode == 'run':
        from statsmodels.stats.multitest import multipletests
        rep = table(IS); cells = []
        for name in ('ES', 'NQ'):
            for dn in (True, False):
                g = OOS[(OOS['index'] == name) & (OOS['down'] == dn)]; d, lo, hi, p = diff_boot(g)
                yrs = {int(y): float(gg.loc[gg['bucket'] == 'hard', 'y'].mean() - gg.loc[gg['bucket'] == 'barely', 'y'].mean()) for y, gg in g.groupby(g['day'].dt.year)}
                cells.append(dict(cell=f"{name}-{'down' if dn else 'up'}", diff=d, ci_lo=lo, ci_hi=hi, p_one_sided=p, years_positive=sum(v > 0 for v in yrs.values()), n_years=len(yrs), by_year=yrs,
                                  n_readings=int(len(g)), n_days=int(g['day'].nunique()), **{f'mean_{b}': float(g.loc[g['bucket'] == b, 'y'].mean()) for b in ('barely', 'middle', 'hard')}))
        C = pd.DataFrame(cells); C['holm'] = multipletests(C['p_one_sided'].clip(1e-6), 0.05, 'holm')[0]; C['pass'] = C['holm'] & (C['years_positive'] >= 4)
        es = C[C['cell'].str.startswith('ES')]; garin = {'ES-down': 0.120, 'ES-up': 0.098}
        verdict = 'validated' if es['pass'].all() else ('null' if all((r['ci_hi'] < garin[r['cell']]) and r['ci_lo'] > -0.05 and r['ci_hi'] < 0.05 for _, r in es.iterrows()) else 'underpowered')
        json.dump(dict(id='vix-calculus', part='D', seed=SEED, cuts=cuts, reproduction_2016_2020=rep, oos_table=table(OOS), cells=json.loads(C.to_json(orient='records')), verdict=verdict,
                       tiny_share=float(pd.read_parquet(os.path.join(OUT, 'readings.parquet'))['tiny'].mean())), open(os.path.join(OUT, 'results_D.json'), 'w'), indent=1)
        print(json.dumps(rep, indent=1)); pd.set_option('display.width', 250); print(C.drop(columns=['by_year']).round(3).to_string()); print('verdict', verdict)
