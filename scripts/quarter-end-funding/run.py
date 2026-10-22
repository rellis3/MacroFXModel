"""quarter-end-funding — forge/QUARTER_END_FUNDING_PREREG.md.

spike: Spearman( log(1 + RRP $bn known 5 business days before quarter-end),
                 (SOFR − floor) on the quarter's last business day − median(SOFR − floor) over the 10 days ending at −5 )
usd:   mean 5-day USD-basket return into quarter-end months − into other month-ends (+ = USD stronger)

Run: python scripts/quarter-end-funding/run.py
"""
import json, math, os, re, urllib.request
import numpy as np
import pandas as pd

SEED = 20261022
B = 2000
N_PLACEBO = 1000
LAST_QE = pd.Timestamp('2026-06-30')
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OUT = os.path.join(ROOT, 'analysis', 'output', 'quarter-end-funding')
os.makedirs(OUT, exist_ok=True)
PAIRS = {'eurusd': -1, 'gbpusd': -1, 'audusd': -1, 'nzdusd': -1, 'usdcad': 1, 'usdchf': 1, 'usdjpy': 1}   # sign: + = USD stronger


def feat(fid):
    df = pd.read_parquet(os.path.join(ROOT, 'features', f'{fid}.parquet'))
    df['date'] = pd.to_datetime(df['date'])
    return df.sort_values(['date', 'asof']).drop_duplicates('date', keep='first').set_index('date')['value'].sort_index()


def ioer():
    path = os.path.join(OUT, 'fred_IOER.json')
    if not os.path.exists(path):
        key = [re.match(r"\s*FRED_KEY\s*=\s*['\"]?([^'\"\s#]+)", l).group(1) for l in open(os.path.join(ROOT, 'RegimeV2', '.env'), encoding='utf-8', errors='ignore') if re.match(r"\s*FRED_KEY\s*=", l)][0]
        u = f'https://api.stlouisfed.org/fred/series/observations?series_id=IOER&observation_start=2018-01-01&file_type=json&api_key={key}'
        open(path, 'w').write(urllib.request.urlopen(u, timeout=60).read().decode())
    obs = json.load(open(path))['observations']
    return pd.Series({pd.Timestamp(o['date']): float(o['value']) for o in obs if o['value'] not in ('.', '')}).sort_index()


def spread_series():
    sofr, iorb, io = feat('sofr'), feat('iorb'), ioer()
    floor = pd.concat([io[io.index < '2021-07-29'], iorb[iorb.index >= '2021-07-29']]).sort_index()
    floor = floor.reindex(sofr.index, method='ffill')
    return ((sofr - floor) * 100).dropna()                      # bp


def spike_events(spr, rrp, ends):
    rows = []
    d = spr.index
    for qe in ends:
        i = d.searchsorted(qe, side='right') - 1                # last SOFR business day on/before the period end
        if i < 16 or d[i].to_period('M') != qe.to_period('M'):
            continue
        base = spr.iloc[i - 15:i - 4]                           # 10 days ending at business day -5
        known = rrp[rrp.index <= d[i - 5]]
        if not len(known):
            continue
        rows.append({'end': d[i], 'spike': float(spr.iloc[i] - base.median()), 'rrp': float(known.iloc[-1]), 'B': math.log1p(max(known.iloc[-1], 0)), 'level': float(spr.iloc[i])})
    return pd.DataFrame(rows).set_index('end')


def spear(a, b):
    return float(pd.Series(a).rank().corr(pd.Series(b).rank()))


def month_ends(start, end):
    return pd.date_range(start, end, freq='ME')


def usd_windows(px, offset=0):
    """per month: mean signed 5-day log return of the 7 USD pairs over the window ending `offset` trading days before month-end"""
    out = {}
    for name, s in px.items():
        sgn = PAIRS[name]
        idx = s.index
        for m, g in s.groupby(idx.to_period('M')):
            L = idx.get_loc(g.index[-1]) - offset
            if L - 5 < 0:
                continue
            out.setdefault(m, []).append(sgn * 100 * math.log(s.iloc[L] / s.iloc[L - 5]))
    return pd.Series({m: np.mean(v) for m, v in out.items() if len(v) >= 6}).sort_index()


def usd_after(px):
    out = {}
    for name, s in px.items():
        sgn, idx = PAIRS[name], s.index
        for m, g in s.groupby(idx.to_period('M')):
            L = idx.get_loc(g.index[-1])
            if L + 5 >= len(s):
                continue
            out.setdefault(m, []).append(sgn * 100 * math.log(s.iloc[L + 5] / s.iloc[L]))
    return pd.Series({m: np.mean(v) for m, v in out.items() if len(v) >= 6}).sort_index()


def qdiff(w):
    q = w[w.index.month.isin([3, 6, 9, 12])]; o = w[~w.index.month.isin([3, 6, 9, 12])]
    return float(q.mean() - o.mean()), len(q), len(o)


def main():
    rng = np.random.default_rng(SEED)
    res = dict(id='quarter-end-funding', seed=SEED, B=B, prereg='forge/QUARTER_END_FUNDING_PREREG.md', cells={}, descriptive={})

    # ── spike ──
    spr, rrp = spread_series(), feat('rrp_on')
    qes = [e for e in month_ends('2018-06-01', LAST_QE) if e.month in (3, 6, 9, 12)]
    ev = spike_events(spr, rrp, qes)
    rho = spear(ev.B, ev.spike)
    bs = np.array([spear(*ev.sample(len(ev), replace=True, random_state=int(rng.integers(1e9)))[['B', 'spike']].T.values) for _ in range(B)])
    lo, hi = np.nanpercentile(bs, [2.5, 97.5])
    days = spr.index[(spr.index <= LAST_QE)]
    me = set(pd.DatetimeIndex([days[days.searchsorted(e, side='right') - 1] for e in month_ends('2018-04-01', LAST_QE)]))
    pool = [d for k, d in enumerate(days) if k > 16 and d not in me]
    pl = []
    for _ in range(N_PLACEBO):
        pick = pd.DatetimeIndex(sorted(rng.choice(pool, size=len(ev), replace=False)))
        e2 = []
        for d in pick:
            i = days.get_loc(d); base = spr.iloc[i - 15:i - 4]; kn = rrp[rrp.index <= days[i - 5]]
            if len(kn): e2.append((math.log1p(max(kn.iloc[-1], 0)), spr.iloc[i] - base.median()))
        e2 = np.array(e2); pl.append(spear(e2[:, 0], e2[:, 1]))
    plo, phi = np.percentile(pl, [2.5, 97.5])
    h1, h2 = ev[ev.index < '2022-07-01'], ev[ev.index >= '2022-07-01']
    p_sp = math.erfc(abs(rho) / ((hi - lo) / 3.92) / math.sqrt(2))
    res['cells']['spike'] = dict(n=len(ev), first=str(ev.index[0].date()), last=str(ev.index[-1].date()), rho=rho, ci95=[float(lo), float(hi)],
                                 half1=spear(h1.B, h1.spike), half2=spear(h2.B, h2.spike), n_half1=len(h1), n_half2=len(h2),
                                 placebo95=[float(plo), float(phi)], placebo_mean=float(np.mean(pl)), p=p_sp,
                                 events=[{'end': str(k.date()), 'spike_bp': round(v.spike, 1), 'rrp_bn': round(v.rrp, 1), 'level_bp': round(v.level, 1)} for k, v in ev.iterrows()])

    # ── usd ──
    px = {n: feat(f'px_d1_{n}') for n in PAIRS}
    w = usd_windows(px)
    w = w[(w.index >= pd.Period('2003-04', 'M')) & (w.index <= pd.Period('2026-06', 'M'))]
    est, nq, no = qdiff(w)
    months = w.index; vals = w.values; isq = np.array([m.month in (3, 6, 9, 12) for m in months])
    nb = math.ceil(len(w) / 3); bd = np.empty(B)
    for k in range(B):
        st = rng.integers(0, len(w) - 3 + 1, nb); idx = np.concatenate([np.arange(s, s + 3) for s in st])[:len(w)]
        bd[k] = vals[idx][isq[idx]].mean() - vals[idx][~isq[idx]].mean()
    ulo, uhi = np.percentile(bd, [2.5, 97.5])
    sh = usd_windows(px, offset=10); sh = sh[sh.index.isin(w.index)]
    a1 = w[w.index < pd.Period('2015-01', 'M')]; a2 = w[w.index >= pd.Period('2015-01', 'M')]
    p_us = math.erfc(abs(est) / ((uhi - ulo) / 3.92) / math.sqrt(2))
    res['cells']['usd'] = dict(n_quarter=nq, n_other=no, first=str(w.index[0]), last=str(w.index[-1]), diff_pct=est, ci95=[float(ulo), float(uhi)],
                               mean_quarter=float(w[isq].mean()), mean_other=float(w[~isq].mean()),
                               half1=qdiff(a1)[0], half2=qdiff(a2)[0], shifted_placebo_diff=qdiff(sh)[0], p=p_us)

    # Holm + verdicts
    ps = {'spike': p_sp, 'usd': p_us}; order = sorted(ps, key=ps.get); run = 0
    for i, k in enumerate(order):
        run = max(run, min(1.0, ps[k] * (len(order) - i))); res['cells'][k]['p_holm'] = run
    c = res['cells']['spike']
    g = dict(ci_excludes_0_negative_holm=bool(c['p_holm'] < 0.05 and c['ci95'][1] < 0), both_halves_negative=bool(c['half1'] < 0 and c['half2'] < 0),
             outside_placebo=bool(c['rho'] < c['placebo95'][0]))
    c['gate'] = g; c['verdict'] = 'VALIDATED' if all(g.values()) else ('NULL' if c['ci95'][0] > -0.40 and c['ci95'][1] < 0.40 else 'UNDERPOWERED')
    c = res['cells']['usd']
    g = dict(ci_excludes_0_positive_holm=bool(c['p_holm'] < 0.05 and c['ci95'][0] > 0), both_halves_positive=bool(c['half1'] > 0 and c['half2'] > 0),
             shifted_placebo_near_0=bool(abs(c['shifted_placebo_diff']) < abs(c['diff_pct']) / 2 or abs(c['shifted_placebo_diff']) < 0.05))
    c['gate'] = g; c['verdict'] = 'VALIDATED' if all(g.values()) else ('NULL' if c['ci95'][0] > -0.25 and c['ci95'][1] < 0.25 else 'UNDERPOWERED')

    # ── descriptive ──
    mes = [e for e in month_ends('2018-04-01', LAST_QE) if e.month not in (3, 6, 9, 12)]
    em = spike_events(spr, rrp, mes)
    res['descriptive']['month_end_rho'] = spear(em.B, em.spike); res['descriptive']['month_end_n'] = len(em)
    res['descriptive']['mean_spike_quarter_vs_month'] = [float(ev.spike.mean()), float(em.spike.mean())]
    thin = ev[ev.rrp < 50]; fat = ev[ev.rrp >= 50]
    res['descriptive']['quarter_spike_rrp_lt50_vs_ge50'] = [float(thin.spike.mean()), len(thin), float(fat.spike.mean()), len(fat)]
    res['descriptive']['year_end_events'] = [x for x in res['cells']['spike']['events'] if x['end'][5:7] == '12']
    try:
        resv = feat('fed_reserves')
        resv = resv.where(resv > 1e5, resv * 1000)          # early ALFRED vintages of WRESBAL are in $bn, later in $mn
        rB = [math.log(resv[resv.index <= k - pd.Timedelta(days=7)].iloc[-1]) for k in ev.index]
        res['descriptive']['reserves_rho'] = spear(np.array(rB), ev.spike.values)
        ev2 = ev.assign(logres=rB)
        both = ev2[(ev2.rrp < 50) & (ev2.logres < ev2.logres.median())]; other = ev2.drop(both.index)
        res['descriptive']['thin_rrp_AND_below_median_reserves_vs_rest'] = [float(both.spike.mean()), len(both), float(other.spike.mean()), len(other)]
    except Exception as e:
        res['descriptive']['reserves_rho'] = str(e)[:60]
    b = np.polyfit(ev.B, ev.spike, 1); now_rrp = float(rrp.iloc[-1])
    res['descriptive']['forward_record_2026_12_31'] = dict(rrp_now_bn=now_rrp, implied_spike_bp=float(np.polyval(b, math.log1p(max(now_rrp, 0)))), fit=[float(b[0]), float(b[1])],
                                                           note='OLS of spike on B over the scored quarter-ends; a forward record, not a scored claim')
    aft = usd_after(px); aft = aft[aft.index.isin(w.index)]
    res['descriptive']['usd_reversal_first5_quarter_vs_other'] = qdiff(aft)[0]
    res['descriptive']['usd_year_end_vs_other'] = float(w[w.index.month == 12].mean() - w[w.index.month != 12].mean())
    for n in ('eurusd', 'usdjpy'):
        wn = usd_windows({n: px[n]}) if False else None   # per-pair windows need >= 6 pairs in usd_windows; per-pair view left to RESULTS text
    json.dump(res, open(os.path.join(OUT, 'results.json'), 'w'), indent=2, default=float)
    for k, c in res['cells'].items():
        print(k, {x: (round(v, 3) if isinstance(v, float) else v) for x, v in c.items() if x != 'events'})
    print(json.dumps(res['descriptive'], indent=1, default=float))
    print('events', [(x['end'], x['spike_bp'], x['rrp_bn']) for x in res['cells']['spike']['events']])


if __name__ == '__main__':
    main()
