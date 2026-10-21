"""rate-surprise-events step 1 (v2, before any post-signal outcome): event table with SIGNAL features only + data/timestamp audit.
Events: FOMC statements, US core CPI m/m, US payrolls, 2010-01 -> 2026-08-21 (lockbox). Prices: OANDA M15 mid for everything
(US 2y / 10y Treasury CFDs, EURUSD, NAS100; scripts/rate-surprise-events/fetch_m15.py), so the whole sample is one source.
Calendar: ff_calendar 2010-2017 (dates + forecast/actual; its clock times are unreliable, so the published release schedule is used),
calendar_events.csv 2018+ (UTC stamps, consensus/actual). Writes analysis/output/rate-surprise-events/events.parquet, DATA_AUDIT.md."""
import os
import numpy as np, pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'analysis', 'output', 'rate-surprise-events'); M15 = os.path.join(OUT, 'm15')
START, END = pd.Timestamp('2010-01-01', tz='UTC'), pd.Timestamp('2026-08-21', tz='UTC')
W = {'FOMC': 60, 'CPI': 15, 'NFP': 15}     # reaction window (min). FOMC: statement + 30 min of the press conference where one follows
DELAY = 15                                  # entry one full 15-min bar after the window closes (signal processing + order, conservative)
NY = 'America/New_York'
# 2011-2012 press-conference meetings released the statement at 12:30 ET (others 14:15 ET until 2013, then 14:00 ET)
PRESSER_1230 = {'2011-04-27', '2011-06-22', '2011-11-02', '2012-01-25', '2012-04-25', '2012-06-20', '2012-09-13', '2012-12-12'}


def num(x):
    s = str(x).strip().replace('%', '').replace(',', '').replace('<', '').replace('>', '')
    mult = 1.0
    if s.endswith('K'): s, mult = s[:-1], 1e3
    if s.endswith('M'): s, mult = s[:-1], 1e6
    if '-' in s[1:]:                                  # a target range "0.25-0.50": use the upper bound
        s = s.split('-')[-1]
    try: return float(s) * mult
    except ValueError: return np.nan


def at_ny(date, hh, mm):
    return pd.Timestamp(f'{date} {hh:02d}:{mm:02d}').tz_localize(NY).tz_convert('UTC')


def ff_events():
    f = pd.read_csv(os.path.join(ROOT, 'data/calendar/ff_calendar_2007_2025.csv'), encoding='latin-1', usecols=[0, 1, 2, 3, 4, 5])
    f = f[f['Currency'] == 'USD']; rows = []
    for fam, ev in (('NFP', 'Non-Farm Employment Change'), ('CPI', 'Core CPI m/m'), ('FOMC', 'Federal Funds Rate')):
        for _, r in f[f['Event'] == ev].iterrows():
            d = str(r['DateTime'])[:10]
            if not ('2010-01-01' <= d <= '2017-12-31'): continue
            if fam == 'FOMC':
                hh, mm = (12, 30) if d in PRESSER_1230 else ((14, 15) if d < '2013-01-01' else (14, 0))
            else:
                hh, mm = 8, 30
            rows.append(dict(family=fam, t=at_ny(d, hh, mm), actual=num(r['Actual']), consensus=num(r['Forecast']), source='ff_calendar'))
    return pd.DataFrame(rows)


def ce_events():
    c = pd.read_csv(os.path.join(ROOT, 'calendar_events.csv'), encoding='latin-1', low_memory=False)
    names = {'FOMC': 'Fed Interest Rate Decision', 'CPI': 'Core Inflation Rate Month-over-Month', 'NFP': 'Payroll Jobs Growth'}
    c = c[(c['ccy'] == 'USD') & c['event'].isin(names.values())].copy(); c['t'] = pd.to_datetime(c['datetime_raw'], utc=True, errors='coerce')
    c = c[(c['t'] >= '2018-01-01') & (c['t'] <= END)]; rows = []
    for fam, name in names.items():
        for _, r in c[c['event'] == name].drop_duplicates('t').iterrows():
            rows.append(dict(family=fam, t=r['t'], actual=num(r['actual']), consensus=num(r['consensus']), source='calendar_events'))
    E = pd.DataFrame(rows)
    et = E['t'].dt.tz_convert(NY)
    sched = np.where(E['family'] == 'FOMC', (et.dt.hour == 14) & (et.dt.minute == 0), (et.dt.hour == 8) & (et.dt.minute == 30))
    return E[sched]


def load_m15(ins):
    s = pd.read_parquet(os.path.join(M15, f'{ins}.parquet'))['close']
    return s[~s.index.duplicated()].sort_index()


def px(s, t):
    """price at instant t = close of the M15 bar opened at t-15m (OANDA stamps bars at their open)."""
    return s.get(t - pd.Timedelta('15min'), np.nan)


def sigma15(s, t, days=28):
    w = s[(s.index < t - pd.Timedelta('15min')) & (s.index >= t - pd.Timedelta(days=days))]
    r = np.log(w).diff().dropna()
    return float(r.std()) if len(r) > 300 else np.nan


def fredcsv(sid):
    p = os.path.join(OUT, 'raw', f'{sid}.csv'); d = pd.read_csv(p); d.columns = ['date', 'v']
    return pd.Series(pd.to_numeric(d['v'], errors='coerce').to_numpy(), index=pd.to_datetime(d['date'])).dropna()


if __name__ == '__main__':
    E = pd.concat([ff_events(), ce_events()], ignore_index=True).sort_values('t').reset_index(drop=True)
    E = E.drop_duplicates(['family', 't'])
    # data surprise: (actual - consensus) / sd of the family's PAST surprises (>= 12 prior); FOMC per 25 bp; sign = hawkish
    E['ds_raw'] = E['actual'] - E['consensus']; E['ds'] = np.nan
    for fam in ('CPI', 'NFP'):
        m = E['family'] == fam; s = E.loc[m, 'ds_raw']
        E.loc[m, 'ds'] = s / s.expanding(min_periods=12).std().shift(1)
    m = E['family'] == 'FOMC'; E.loc[m, 'ds'] = E.loc[m, 'ds_raw'] / 0.25
    S = {k: load_m15(k) for k in ('USB02Y_USD', 'USB10Y_USD', 'EUR_USD', 'NAS100_USD')}
    real, vix = fredcsv('DFII10'), fredcsv('VIXCLS')
    fd = E[E['family'] == 'FOMC'][['t', 'actual']].dropna().set_index('t')['actual']
    rows = []
    for _, e in E.iterrows():
        t, w = e['t'], W[e['family']]; t1 = t + pd.Timedelta(minutes=w); te = t1 + pd.Timedelta(minutes=DELAY)
        r = dict(family=e['family'], t=t, source=e['source'], ds=e['ds'], ds_raw=e['ds_raw'], actual=e['actual'], consensus=e['consensus'], window_min=w, entry_t=te)
        for nm, ins in (('rs2', 'USB02Y_USD'), ('rs10', 'USB10Y_USD')):
            p0, p1, sg = px(S[ins], t), px(S[ins], t1), sigma15(S[ins], t)
            r[nm] = -np.log(p1 / p0) / (sg * np.sqrt(w / 15)) if np.isfinite(p0) and np.isfinite(p1) and sg else np.nan
            r[nm + '_stale'] = bool(np.isfinite(p0) and np.isfinite(p1) and p0 == p1)
        for a, ins in (('eurusd', 'EUR_USD'), ('nq', 'NAS100_USD')):
            s = S[ins]; p0, p1, pm60, pe = px(s, t), px(s, t1), px(s, t - pd.Timedelta('60min')), px(s, te); sg = sigma15(s, t)
            r[f'{a}_sigma15'] = sg
            r[f'{a}_react'] = np.log(p1 / p0) / (sg * np.sqrt(w / 15)) if np.isfinite(p0) and np.isfinite(p1) and sg else np.nan
            r[f'{a}_pre_react'] = np.log(p0 / pm60) / (sg * 2) if np.isfinite(p0) and np.isfinite(pm60) and sg else np.nan
            r[f'{a}_entry_ok'] = bool(np.isfinite(pe))
        dprev = t.tz_convert(NY).normalize().tz_localize(None) - pd.Timedelta(days=1)
        rr = real[real.index <= dprev]; r['regime_realyield'] = 'rising' if len(rr) > 61 and rr.iloc[-1] - rr.iloc[-61] > 0 else 'falling'
        vv = vix[vix.index <= dprev]; r['regime_risk'] = 'risk_off' if vv.iloc[-1] > vv.iloc[-252:].median() else 'risk_on'
        g, o = fd[fd.index < t], fd[fd.index < t - pd.Timedelta(days=182)]
        chg = g.iloc[-1] - o.iloc[-1] if len(g) and len(o) else np.nan
        r['regime_policy'] = 'unknown' if not np.isfinite(chg) else ('hiking' if chg > 0 else 'cutting' if chg < 0 else 'hold')
        rows.append(r)
    X = pd.DataFrame(rows)
    X['split'] = np.select([X['t'] < '2018-01-01', X['t'] < '2022-01-01'], ['discover', 'validate'], 'test')
    X.to_parquet(os.path.join(OUT, 'events.parquet'))
    # timestamp audit: mean |2y CFD move| per 15-min bar around each event, by family and era
    prof = []
    for _, e in X.iterrows():
        for k in range(-4, 6):
            a, b = px(S['USB02Y_USD'], e['t'] + pd.Timedelta(minutes=15 * k)), px(S['USB02Y_USD'], e['t'] + pd.Timedelta(minutes=15 * (k + 1)))
            prof.append(dict(family=e['family'], era='2010-17' if e['t'] < pd.Timestamp('2018-01-01', tz='UTC') else '2018-26', offset=k, mv=abs(np.log(b / a)) * 1e4 if np.isfinite(a) and np.isfinite(b) else np.nan))
    PR = pd.DataFrame(prof).groupby(['family', 'era', 'offset'])['mv'].mean().unstack([0, 1]).round(2)
    PR.to_csv(os.path.join(OUT, 'release_profile.csv'))
    peak_ok = {f'{f}/{e}': int(PR[(f, e)].idxmax()) for f, e in PR.columns}
    L = ['# rate-surprise-events: data and timestamp audit', '', 'Computed before any post-signal outcome. All prices: OANDA M15 mid (one source, 2009-11 → 2026-08-21; fetched read-only with an explicit end at the lockbox).', '',
         f'- Events kept: {len(X)} — ' + ', '.join(f"{k} {int((X.family == k).sum())}" for k in ('FOMC', 'CPI', 'NFP')) + '; by split: ' + ', '.join(f"{k} {int((X.split == k).sum())}" for k in ('discover', 'validate', 'test')) + ' (discover 2010–17, validate 2018–21, test 2022 → 2026-08-21).',
         '- Sources: ff_calendar for 2010–17 (dates, actual, forecast; clock times taken from the published schedule because many ff rows carry a date-only placeholder stamp), calendar_events.csv for 2018+ (UTC stamps).',
         '- FOMC statement times: 14:00 ET from 2013; 14:15 ET in 2010–12, except the 2011–12 press-conference meetings at 12:30 ET.',
         f"- Data surprise available: CPI {X[X.family=='CPI'].ds.notna().mean():.0%}, NFP {X[X.family=='NFP'].ds.notna().mean():.0%}; FOMC decisions that differed from consensus: {int((X[X.family=='FOMC'].ds_raw.abs() > 0).sum())} of {int((X.family=='FOMC').sum())}.",
         f"- 2y rate surprise available {X.rs2.notna().mean():.0%} (CFD price unchanged across the window: {X.rs2_stale.mean():.0%}); 10y {X.rs10.notna().mean():.0%}.",
         f"- Entry price present: EURUSD {X.eurusd_entry_ok.mean():.0%}, NAS100 {X.nq_entry_ok.mean():.0%}.",
         f"- Correlation of the 2y rate surprise with the asset's own window reaction: EURUSD {X.rs2.corr(X.eurusd_react):+.2f}, NAS100 {X.rs2.corr(X.nq_react):+.2f}; data surprise with reaction: EURUSD {X.ds.corr(X.eurusd_react):+.2f}, NAS100 {X.ds.corr(X.nq_react):+.2f}.",
         '', '## Timestamp check: mean |US 2y CFD move| (bp of price) per 15-min bar from the release (offset 0 = the bar starting at the release)', '',
         '| offset | ' + ' | '.join(f'{f} {e}' for f, e in PR.columns) + ' |', '|---|' + '---|' * len(PR.columns)]
    L += [f'| {k} | ' + ' | '.join(f'{v:.2f}' for v in PR.loc[k]) + ' |' for k in PR.index]
    L += ['', f'Peak bar per family/era: {peak_ok} (0 expected; FOMC can also spike at the press conference).']
    open(os.path.join(OUT, 'DATA_AUDIT.md'), 'w', encoding='utf-8').write('\n'.join(L))
    print('\n'.join(L))
