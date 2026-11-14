"""fomc-range-share -- share of the London-session variance / range that falls in the FOMC statement (14:00-14:30 ET) and
press-conference (14:30-15:30 ET) windows, vs the same clock windows on matched ordinary days.
Prereg: forge/FOMC_RANGE_SHARE_PREREG.md (seed 20261114). Stages: --stage power (placebo days only; writes power.json),
--stage score (FOMC days; writes results.json). Read-only on the local M1 cache; nothing is written to R2.
Run with the repo venv: python -I scripts/fomc-range-share/run.py --stage power|score"""
import os, sys, json, argparse
import numpy as np, pandas as pd

SEED = 20261114
ROOT = os.environ.get('MFX_ROOT', r'C:/Users/relli/OneDrive/Documents/Programming/Trading/v2 trading model/MacroFXModel')
M1 = os.path.join(ROOT, 'VolRangeForecaster', 'data', 'm1')
OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'analysis', 'output', 'fomc-range-share'))
os.makedirs(OUT, exist_ok=True)
INSTR = {'EURUSD': 'eurusd', 'GBPUSD': 'gbpusd', 'USDJPY': 'usdjpy', 'AUDUSD': 'audusd', 'USDCAD': 'usdcad', 'USDCHF': 'usdchf',
         'NZDUSD': 'nzdusd', 'XAUUSD': 'xauusd', 'NAS100': 'nas100_usd', 'SPX500': 'spx500'}
GROUP = {'EURUSD': 'FX', 'GBPUSD': 'FX', 'USDJPY': 'FX', 'AUDUSD': 'FX', 'USDCAD': 'FX', 'USDCHF': 'FX', 'NZDUSD': 'FX', 'XAUUSD': 'gold', 'NAS100': 'index', 'SPX500': 'index'}
START, END = pd.Timestamp('2016-01-04'), pd.Timestamp('2026-08-21')
NY, LON = 'America/New_York', 'Europe/London'
# scheduled FOMC decision days (the published Fed calendars), 2016 -> 2026-07; the March 2020 meeting was replaced by the 03-15 emergency meeting
FOMC = '''2016-01-27 2016-03-16 2016-04-27 2016-06-15 2016-07-27 2016-09-21 2016-11-02 2016-12-14
2017-02-01 2017-03-15 2017-05-03 2017-06-14 2017-07-26 2017-09-20 2017-11-01 2017-12-13
2018-01-31 2018-03-21 2018-05-02 2018-06-13 2018-08-01 2018-09-26 2018-11-08 2018-12-19
2019-01-30 2019-03-20 2019-05-01 2019-06-19 2019-07-31 2019-09-18 2019-10-30 2019-12-11
2020-01-29 2020-04-29 2020-06-10 2020-07-29 2020-09-16 2020-11-05 2020-12-16
2021-01-27 2021-03-17 2021-04-28 2021-06-16 2021-07-28 2021-09-22 2021-11-03 2021-12-15
2022-01-26 2022-03-16 2022-05-04 2022-06-15 2022-07-27 2022-09-21 2022-11-02 2022-12-14
2023-02-01 2023-03-22 2023-05-03 2023-06-14 2023-07-26 2023-09-20 2023-11-01 2023-12-13
2024-01-31 2024-03-20 2024-05-01 2024-06-12 2024-07-31 2024-09-18 2024-11-07 2024-12-18
2025-01-29 2025-03-19 2025-05-07 2025-06-18 2025-07-30 2025-09-17 2025-10-29 2025-12-10
2026-01-28 2026-03-18 2026-04-29 2026-06-17 2026-07-29'''.split()
EMERGENCY = ['2020-03-03', '2020-03-15']


def meetings():
    ms = pd.to_datetime(FOMC)
    pres = [(d.year >= 2019) or (d.month in (3, 6, 9, 12)) for d in ms]
    return pd.DataFrame({'date': ms, 'presser': pres})


def calendar_checks():
    """cross-check the hard-coded schedule against the two calendar files; collect the high-impact USD days used to exclude placebo days"""
    f = pd.read_csv(os.path.join(ROOT, 'data/calendar/ff_calendar_2007_2025.csv'), encoding='latin-1')
    c = pd.read_csv(os.path.join(ROOT, 'calendar_events.csv'), encoding='latin-1', low_memory=False)
    ff = f[(f['Currency'] == 'USD') & (f['Event'] == 'Federal Funds Rate') & (f['DateTime'] >= '2016')]
    ffd = pd.to_datetime(ff['DateTime'].astype(str).str[:10])
    ce = c[(c['ccy'] == 'USD') & (c['event'] == 'Fed Interest Rate Decision') & (c['datetime_raw'] >= '2025-04')]
    ced = pd.to_datetime(ce['datetime_raw'].astype(str).str[:10]).drop_duplicates()
    cal = pd.concat([ffd, ced]).drop_duplicates()
    ms = set(meetings()['date'])
    unmatched = []
    for d in cal:
        if str(d.date()) in EMERGENCY: continue
        if not any(abs((d - m).days) <= 1 for m in ms): unmatched.append(str(d.date()))
    missing = [str(m.date()) for m in sorted(ms) if not any(abs((d - m).days) <= 1 for d in cal)]
    hi = set()
    fh = f[(f['Currency'] == 'USD') & (f['Impact'] == 'High Impact Expected') & (f['DateTime'] >= '2016')]
    for s in fh['DateTime'].astype(str):
        t = pd.Timestamp(s)
        hi.add(t.normalize()); hi.add((t + pd.Timedelta(hours=-4)).normalize())   # the Tehran placeholder can slip a day either way
    ch = c[(c['ccy'] == 'USD') & (c['impact'] == 'Major') & (c['datetime_raw'] >= '2018')]
    for s in ch['datetime_raw'].astype(str).drop_duplicates():
        t = pd.Timestamp(s, tz='UTC').tz_convert(NY)
        mins = t.hour * 60 + t.minute
        if 13 * 60 <= mins <= 16 * 60 + 30: hi.add(pd.Timestamp(t.date()))
    return {'unmatched_file_dates': unmatched, 'schedule_dates_missing_from_files': missing}, hi


def day_table(name):
    """per London date: session RV/HL, S and P window RV/HL, counts. London session 00:00-22:00; windows are NY clock windows"""
    d = pd.read_parquet(os.path.join(M1, INSTR[name] + '_m1.parquet'))
    d = d[(d.index >= START.tz_localize('UTC')) & (d.index < END.tz_localize('UTC') + pd.Timedelta(days=1))]
    lon = d.index.tz_convert(LON); ny = d.index.tz_convert(NY)
    keep = lon.hour < 22
    d = d[keep]; lon = lon[keep]; ny = ny[keep]
    ld = pd.DatetimeIndex(lon.date)
    lc = np.log(d['close'].values)
    r = np.r_[np.nan, np.diff(lc)]
    first = pd.Series(ld).ne(pd.Series(ld).shift()).values; r[first] = np.nan          # no overnight return across sessions
    nm = ny.hour * 60 + ny.minute
    S = (nm >= 14 * 60) & (nm < 14 * 60 + 30); P = (nm >= 14 * 60 + 30) & (nm < 15 * 60 + 30)
    df = pd.DataFrame({'ld': ld, 'r2': r * r, 'h': d['high'].values, 'l': d['low'].values, 'S': S, 'P': P})
    g = df.groupby('ld')
    out = pd.DataFrame({'n': g.size(), 'rv': g['r2'].sum(), 'hi': g['h'].max(), 'lo': g['l'].min()})
    for w in ('S', 'P'):
        sub = df[df[w]].groupby('ld')
        out['n_' + w] = sub.size(); out['rv_' + w] = sub['r2'].sum(); out['hi_' + w] = sub['h'].max(); out['lo_' + w] = sub['l'].min()
    out = out.fillna({'n_S': 0, 'n_P': 0})
    out['dow'] = out.index.dayofweek
    out = out[out['dow'] < 5]
    med = out['n'].median()
    out['ok'] = (out['n'] >= 0.85 * med) & (out['n_S'] >= 29) & (out['n_P'] >= 57)
    for w in ('S', 'P'):
        out['rvs_' + w] = out['rv_' + w] / out['rv']
        out['rgs_' + w] = (out['hi_' + w] - out['lo_' + w]) / (out['hi'] - out['lo'])
    return out


def build_all():
    cache = os.path.join(OUT, '_day_tables.pkl')
    if os.path.exists(cache): return pd.read_pickle(cache)
    T = {k: day_table(k) for k in INSTR}
    pd.to_pickle(T, cache); return T


def pooled(T, dates, key):
    """mean over instruments with ok=True of the share on each date; Series indexed by date"""
    cols = []
    for k, t in T.items():
        cols.append(t.loc[t['ok'], key].reindex(dates))
    return pd.concat(cols, axis=1).mean(axis=1, skipna=True)


def placebo_days(T, hi, ms):
    """for each meeting, up to 6 ordinary same-weekday days nearest in time within +/-8 weeks; no FOMC / adjacent day / high-impact USD print near the clock; greedy unique"""
    alld = sorted(set().union(*[set(t.index[t['ok']]) for t in T.values()]))
    fomc = set(ms['date'])
    bad = set(fomc) | {d + pd.Timedelta(days=1) for d in fomc} | {d - pd.Timedelta(days=1) for d in fomc} | set(hi)
    cand = [d for d in alld if d not in bad]
    used, res = set(), {}
    for m in sorted(fomc):
        c = [d for d in cand if d.dayofweek == m.dayofweek and d not in used and abs((d - m).days) <= 56]
        c.sort(key=lambda d: abs((d - m).days)); pick = c[:6]
        used |= set(pick); res[m] = pick
    return res, cand, bad


def boot_ci(x, B=2000, seed=SEED, lev=(0.95, 0.975)):
    rng = np.random.default_rng(seed); x = np.asarray(x, float); x = x[~np.isnan(x)]; n = len(x)
    if n < 3: return {'n': n}
    means = np.array([x[rng.integers(0, n, n)].mean() for _ in range(B)])
    o = {'n': n, 'mean': float(x.mean())}
    for l in lev:
        a = (1 - l) / 2; o[f'lo{int(l*1000)}'] = float(np.quantile(means, a)); o[f'hi{int(l*1000)}'] = float(np.quantile(means, 1 - a))
    return o


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--stage', required=True, choices=['power', 'score'])
    a = ap.parse_args()
    ms = meetings(); chk, hi = calendar_checks()
    T = build_all()
    placebo_map, cand, bad = placebo_days(T, hi, ms)
    if a.stage == 'power':
        # placebo-eligible ordinary days only: SD of the pooled share (no FOMC-day outcome is read here)
        res = {'seed': SEED, 'stage': 'power', 'calendar_checks': chk, 'n_candidate_days': len(cand), 'n_meetings': int(len(ms)), 'n_presser': int(ms['presser'].sum())}
        for w in ('S', 'P'):
            for kind in ('rvs', 'rgs'):
                s = pooled(T, pd.DatetimeIndex(cand), f'{kind}_{w}').dropna()
                res[f'placebo_{kind}_{w}'] = {'mean': float(s.mean()), 'sd': float(s.std()), 'n': int(len(s)), 'p95': float(s.quantile(.95))}
                sd_ex = float(s.std()) * np.sqrt(1 + 1 / 6)
                n = int(len(ms)) if w == 'S' else int(ms['presser'].sum())
                res[f'mde_{kind}_{w}'] = {'sd_excess': sd_ex, 'n': n, 'mde': float(2.8 * sd_ex / np.sqrt(n))}
        json.dump(res, open(os.path.join(OUT, 'power.json'), 'w'), indent=1)
        print(json.dumps(res, indent=1)); return
    # ---- score ----
    res = {'seed': SEED, 'stage': 'score', 'calendar_checks': chk, 'placebo_days_per_meeting_mean': float(np.mean([len(v) for v in placebo_map.values()]))}
    rows = []
    for _, m in ms.iterrows():
        d = m['date']
        if d > END: continue
        pb = placebo_map.get(d, [])
        if len(pb) < 3: rows.append({'date': str(d.date()), 'dropped': 'placebo<3', 'presser': bool(m['presser'])}); continue
        row = {'date': str(d.date()), 'presser': bool(m['presser']), 'n_placebo': len(pb)}
        for w in ('S', 'P'):
            for kind in ('rvs', 'rgs'):
                key = f'{kind}_{w}'
                ev = pooled(T, pd.DatetimeIndex([d]), key).iloc[0]
                pbm = pooled(T, pd.DatetimeIndex(pb), key).mean()
                row[f'ev_{key}'] = None if np.isnan(ev) else float(ev); row[f'pb_{key}'] = None if np.isnan(pbm) else float(pbm)
                row[f'ex_{key}'] = None if (np.isnan(ev) or np.isnan(pbm)) else float(ev - pbm)
        rows.append(row)
    R = pd.DataFrame(rows); R.to_csv(os.path.join(OUT, 'meetings.csv'), index=False)
    res['n_meetings_total'] = int(len(ms)); res['n_dropped'] = int(R['dropped'].notna().sum()) if 'dropped' in R else 0
    ok = R[R['ex_rvs_S'].notna()] if 'ex_rvs_S' in R else R.iloc[0:0]
    pr, so = ok[ok['presser']], ok[~ok['presser']]
    res['H1_S_excess_rvs'] = boot_ci(ok['ex_rvs_S'])
    res['H2_P_excess_rvs_presser'] = boot_ci(pr['ex_rvs_P'])
    res['H3_P_excess_rvs_statement_only'] = boot_ci(so['ex_rvs_P'])
    res['H1_S_excess_range'] = boot_ci(ok['ex_rgs_S']); res['H2_P_excess_range_presser'] = boot_ci(pr['ex_rgs_P']); res['H3_P_excess_range_statement_only'] = boot_ci(so['ex_rgs_P'])
    res['mean_event_share'] = {k: float(ok[k].mean()) for k in ('ev_rvs_S', 'ev_rvs_P', 'pb_rvs_S', 'pb_rvs_P', 'ev_rgs_S', 'ev_rgs_P', 'pb_rgs_S', 'pb_rgs_P')}
    res['mean_event_share_presser'] = {k: float(pr[k].mean()) for k in ('ev_rvs_S', 'ev_rvs_P', 'pb_rvs_S', 'pb_rvs_P')}
    res['mean_event_share_statement_only'] = {k: float(so[k].mean()) for k in ('ev_rvs_S', 'ev_rvs_P', 'pb_rvs_S', 'pb_rvs_P')}
    ok = ok.copy(); ok['era'] = pd.cut(pd.to_datetime(ok['date']).dt.year, [2015, 2018, 2021, 2026], labels=['2016-18', '2019-21', '2022-26'])
    res['H4_by_era'] = {str(e): {'n': int(len(g)), 'S': float(g['ex_rvs_S'].mean()), 'P_presser': (float(g[g['presser']]['ex_rvs_P'].mean()) if g['presser'].any() else None)} for e, g in ok.groupby('era', observed=True)}
    per = {}
    for k, t in T.items():
        exS, exP = [], []
        for _, m in ms.iterrows():
            d = m['date']; pb = placebo_map.get(d, [])
            if d > END or len(pb) < 3 or d not in t.index or not t.loc[d, 'ok']: continue
            p2 = t.loc[[x for x in pb if x in t.index and t.loc[x, 'ok']]]
            if len(p2) < 3: continue
            exS.append(t.loc[d, 'rvs_S'] - p2['rvs_S'].mean())
            if m['presser']: exP.append(t.loc[d, 'rvs_P'] - p2['rvs_P'].mean())
        per[k] = {'group': GROUP[k], 'n_S': len(exS), 'S': boot_ci(exS, B=1000), 'n_P': len(exP), 'P_presser': boot_ci(exP, B=1000)}
    res['H4_by_instrument'] = per

    def gate(ci, margin):
        if ci.get('n', 0) < 3: return 'UNDERPOWERED'
        if ci['mean'] >= margin and ci['lo975'] > 0: return 'PASS'
        if ci['hi975'] < margin: return 'NULL'
        return 'UNDERPOWERED'
    g1 = gate(res['H1_S_excess_rvs'], 0.05); g2 = gate(res['H2_P_excess_rvs_presser'], 0.03)
    h3 = res['H3_P_excess_rvs_statement_only']
    h3ok = (h3.get('n', 0) >= 3) and (h3['mean'] < 0.03 or h3['lo950'] <= 0 <= h3['hi950'])
    res['gates'] = {'H1': g1, 'H2': g2, 'H3_control_holds': bool(h3ok)}
    if g1 == 'PASS' and g2 == 'PASS' and h3ok: v = 'VALIDATED'
    elif g1 == 'PASS' and g2 == 'PASS' and not h3ok: v = 'CONTEXT'
    elif g1 == 'NULL' or g2 == 'NULL': v = 'NULL'
    else: v = 'UNDERPOWERED'
    res['verdict'] = v
    json.dump(res, open(os.path.join(OUT, 'results.json'), 'w'), indent=1, default=str)
    print(json.dumps(res, indent=1, default=str))


if __name__ == '__main__':
    main()
