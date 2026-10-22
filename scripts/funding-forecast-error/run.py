"""funding-forecast-error — forge/FUNDING_FORECAST_ERROR_PREREG.md.

e = ln(r_hl / shipped p50) per instrument-session (shipped = SI where present else S); date-level mean across instruments.
Signals known before the session (asof <= session date 00:00 UTC):
  squeeze  = mean(SOFR − floor) bp over the last 5 known prints (floor IOER < 2021-07-29, IORB after)
  cpstress = mean(CP 90d AA financial − SOFR) bp over the last 5 known common prints
  levbuild = −(13-week change of leveraged-fund net UST futures) / SD of 13-week changes over trailing 156 weeks
Stat: mean date error, top signal tercile − bottom tercile.

Run: python scripts/funding-forecast-error/run.py
"""
import json, math, os
import numpy as np
import pandas as pd

SEED = 20261022
B = 2000
BLOCK = 21
USEFUL = math.log(1.03)
SPLIT = pd.Timestamp('2023-08-21')
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OUT = os.path.join(ROOT, 'analysis', 'output', 'funding-forecast-error')
os.makedirs(OUT, exist_ok=True)


def feat(fid):
    df = pd.read_parquet(os.path.join(ROOT, 'features', f'{fid}.parquet'))
    df['date'] = pd.to_datetime(df['date']); df['asof'] = pd.to_datetime(df['asof'], utc=True).dt.tz_localize(None)
    return df.sort_values(['date', 'asof']).drop_duplicates('date', keep='first')[['date', 'asof', 'value']].reset_index(drop=True)


def ioer():
    obs = json.load(open(os.path.join(ROOT, 'analysis', 'output', 'quarter-end-funding', 'fred_IOER.json')))['observations']
    s = pd.DataFrame([(pd.Timestamp(o['date']), float(o['value'])) for o in obs if o['value'] not in ('.', '')], columns=['date', 'value'])
    s['asof'] = s.date + pd.Timedelta(days=1)
    return s


def last_k_mean(obs, sessions, k=5):
    """obs: date, asof, value. For each session date d: mean value over the last k observations with asof <= d."""
    obs = obs.sort_values('asof').reset_index(drop=True)
    a = obs['asof'].values; v = obs['value'].values; out = []
    for d in sessions:
        i = np.searchsorted(a, np.datetime64(d), side='right')
        out.append(v[max(0, i - k):i].mean() if i >= k else np.nan)
    return pd.Series(out, index=sessions)


def signals(sessions):
    sofr = feat('sofr'); iorb = feat('iorb'); io = ioer()
    floor = pd.concat([io[io.date < '2021-07-29'], iorb[iorb.date >= '2021-07-29']]).sort_values('date')
    m = pd.merge_asof(sofr.sort_values('date'), floor[['date', 'value']].rename(columns={'value': 'floor'}), on='date')
    sq = m.assign(value=(m.value - m.floor) * 100)[['date', 'asof', 'value']].dropna()
    cp = feat('cp_fin_3m')
    c = cp.merge(sofr, on='date', suffixes=('_cp', '_s'))
    cs = pd.DataFrame({'date': c.date, 'asof': c[['asof_cp', 'asof_s']].max(axis=1), 'value': (c.value_cp - c.value_s) * 100})
    tff = feat('tff_lev_ust_notional').sort_values('asof').reset_index(drop=True)
    a = tff['asof'].values; v = tff['value'].values; lev = []
    for d in sessions:
        i = np.searchsorted(a, np.datetime64(d), side='right')
        if i < 170: lev.append(np.nan); continue
        x = v[:i]; ch = x[13:] - x[:-13]
        lev.append(-(x[-1] - x[-14]) / ch[-156:].std(ddof=1))
    return pd.DataFrame({'squeeze': last_k_mean(sq, sessions), 'cpstress': last_k_mean(cs, sessions), 'levbuild': pd.Series(lev, index=sessions)})


def descriptive_signals(sessions):
    out = {}
    def latest(fid, transform=None, k_change=None):
        df = feat(fid).sort_values('asof'); a = df['asof'].values; v = df['value'].values; res = []
        for d in sessions:
            i = np.searchsorted(a, np.datetime64(d), side='right')
            if i <= (k_change or 0) + 1: res.append(np.nan); continue
            res.append(v[i - 1] - v[i - 1 - k_change] if k_change else v[i - 1])
        return pd.Series(res, index=sessions)
    out['rrp_log'] = np.log1p(latest('rrp_on').clip(lower=0))
    out['hy_oas_20d'] = latest('credit_hy_oas', k_change=20)
    out['sofr_vol_20d'] = latest('sofr_volume', k_change=20)
    r = feat('fed_reserves'); r['value'] = r.value.where(r.value > 1e5, r.value * 1000)
    a = r.sort_values('asof'); av = a['asof'].values; vv = a['value'].values
    out['reserves_4w'] = pd.Series([vv[i - 1] - vv[i - 5] if (i := np.searchsorted(av, np.datetime64(d), side='right')) > 5 else np.nan for d in sessions], index=sessions)
    return pd.DataFrame(out)


def terc_diff(err, sig):
    ok = sig.notna() & err.notna(); s, e = sig[ok], err[ok]
    lo, hi = s.quantile([1 / 3, 2 / 3])
    return float(e[s >= hi].mean() - e[s <= lo].mean()), lo, hi


def main():
    rng = np.random.default_rng(SEED)
    d = pd.read_parquet(os.path.join(ROOT, 'analysis/output/vf3_stage_b/part1_lines.parquet'),
                        columns=['inst', 'date', 'oos', 'r_hl', 'klass', 'S_hl_p50', 'SI_hl_p50', 'S_hl_p75', 'SI_hl_p75'])
    d = d[d.oos == 1].copy(); d['date'] = pd.to_datetime(d['date'])
    d['f50'] = d.SI_hl_p50.fillna(d.S_hl_p50); d['f75'] = d.SI_hl_p75.fillna(d.S_hl_p75)
    d['e'] = np.log(d.r_hl / d.f50); d['x75'] = (d.r_hl > d.f75).astype(float)
    d = d[np.isfinite(d.e)]
    d['cls'] = d.klass.map({'fx_majors': 'fx', 'fx_crosses': 'fx', 'indices': 'indices', 'gold': 'gold'})
    sessions = pd.DatetimeIndex(sorted(d.date.unique()))
    S = signals(sessions); D = descriptive_signals(sessions)
    E = d.groupby('date').e.mean().reindex(sessions)
    Ec = {c: d[d.cls == c].groupby('date').e.mean().reindex(sessions) for c in ['fx', 'indices', 'gold']}
    X75 = d.groupby('date').x75.mean().reindex(sessions)
    pct = lambda x: 100 * (math.exp(x) - 1)
    res = dict(id='funding-forecast-error', seed=SEED, B=B, block=BLOCK, prereg='forge/FUNDING_FORECAST_ERROR_PREREG.md',
               n_rows=len(d), n_dates=len(sessions), first=str(sessions[0].date()), last=str(sessions[-1].date()),
               e_mean=float(d.e.mean()), x75_rate=float(d.x75.mean()), cells={}, descriptive={})
    n = len(sessions)
    for cell in ['squeeze', 'cpstress', 'levbuild']:
        sig = S[cell]
        est, lo_c, hi_c = terc_diff(E, sig)
        lab = np.where(sig >= hi_c, 1, np.where(sig <= lo_c, -1, 0)); lab[sig.isna().values] = 0
        ev = E.values
        bs = np.empty(B); nb = math.ceil(n / BLOCK)
        for k in range(B):
            st = rng.integers(0, n - BLOCK + 1, nb); idx = np.concatenate([np.arange(a, a + BLOCK) for a in st])[:n]
            ee, ll = ev[idx], lab[idx]; bs[k] = np.nanmean(ee[ll == 1]) - np.nanmean(ee[ll == -1])
        lo, hi = np.nanpercentile(bs, [2.5, 97.5])
        pl = np.array([np.nanmean(ev[np.roll(lab, k) == 1]) - np.nanmean(ev[np.roll(lab, k) == -1]) for k in range(63, n - 63, 5)])
        plo, phi = np.percentile(pl, [2.5, 97.5])
        h1 = sessions < SPLIT
        half = lambda m: float(np.nanmean(ev[m & (lab == 1)]) - np.nanmean(ev[m & (lab == -1)]))
        cls = {c: float(np.nanmean(Ec[c].values[lab == 1]) - np.nanmean(Ec[c].values[lab == -1])) for c in Ec}
        me = pd.Series(sessions).dt.is_month_end.values
        near_me = np.zeros(n, bool)
        for off in range(-2, 3):
            near_me |= np.roll((pd.Series(sessions).dt.to_period('M') != pd.Series(sessions).shift(-1).dt.to_period('M')).values, off)
        xm = ~near_me
        res['cells'][cell] = dict(diff_log=est, diff_pct=pct(est), ci95_log=[float(lo), float(hi)], ci95_pct=[pct(lo), pct(hi)],
                                  tercile_cuts=[float(lo_c), float(hi_c)], n_top=int((lab == 1).sum()), n_bottom=int((lab == -1).sum()),
                                  half1_pct=pct(half(h1)), half2_pct=pct(half(~h1)), placebo95_pct=[pct(plo), pct(phi)],
                                  fx_pct=pct(cls['fx']), indices_pct=pct(cls['indices']), gold_pct=pct(cls['gold']),
                                  x75_top=float(np.nanmean(X75.values[lab == 1])), x75_bottom=float(np.nanmean(X75.values[lab == -1])),
                                  ex_month_end_pct=pct(float(np.nanmean(ev[xm & (lab == 1)]) - np.nanmean(ev[xm & (lab == -1)]))),
                                  p=math.erfc(abs(est) / ((hi - lo) / 3.92) / math.sqrt(2)))
    ps = {k: v['p'] for k, v in res['cells'].items()}; order = sorted(ps, key=ps.get); run = 0
    for i, k in enumerate(order):
        run = max(run, min(1.0, ps[k] * (len(order) - i))); res['cells'][k]['p_holm'] = run
    for k, c in res['cells'].items():
        g = dict(ci_excludes_0_positive_holm=bool(c['p_holm'] < 0.05 and c['ci95_log'][0] > 0), both_halves_positive=bool(c['half1_pct'] > 0 and c['half2_pct'] > 0),
                 above_placebo=bool(c['diff_pct'] > c['placebo95_pct'][1]), fx_and_indices_same_sign=bool(np.sign(c['fx_pct']) == np.sign(c['indices_pct']) == np.sign(c['diff_pct'])))
        c['gate'] = g
        c['verdict'] = 'VALIDATED' if all(g.values()) else ('NULL' if c['ci95_log'][0] > -USEFUL and c['ci95_log'][1] < USEFUL else 'UNDERPOWERED')
    for k in D.columns:
        res['descriptive'][k] = pct(terc_diff(E, D[k])[0])
    res['descriptive']['signal_corr'] = S.corr().round(3).to_dict()
    json.dump(res, open(os.path.join(OUT, 'results.json'), 'w'), indent=2, default=float)
    print({k: res[k] for k in ['n_rows', 'n_dates', 'first', 'last', 'e_mean', 'x75_rate']})
    for k, c in res['cells'].items():
        print(k, {x: (round(v, 3) if isinstance(v, float) else ([round(z, 2) for z in v] if isinstance(v, list) else v)) for x, v in c.items()})
    print('descriptive', {k: (round(v, 2) if isinstance(v, float) else v) for k, v in res['descriptive'].items()})


if __name__ == '__main__':
    main()
