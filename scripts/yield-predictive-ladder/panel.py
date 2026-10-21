"""yield-predictive-ladder step 1: point-in-time daily panel + data-quality/provenance audit (no outcome computed).
forge/YIELD_PREDICTIVE_LADDER_PREREG.md (+ A1). Writes analysis/output/yield-predictive-ladder/{panel_eurusd,panel_nq}.parquet,
DATA_AUDIT.md, data_audit.json."""
import os, io, json, urllib.request
import numpy as np, pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'analysis', 'output', 'yield-predictive-ladder'); RAW = os.path.join(OUT, 'raw')
os.makedirs(RAW, exist_ok=True)
START, END = '2004-01-01', '2026-08-21'          # 2004 warm-up for 252-row windows; lockbox cut
FRED = {'DGS3MO': 'US 3m nominal', 'DGS2': 'US 2y nominal', 'DGS5': 'US 5y nominal', 'DGS10': 'US 10y nominal', 'DFII10': 'US 10y real (TIPS)',
        'T10YIE': 'US 10y breakeven', 'THREEFYTP10': 'US 10y term premium (Kim-Wright)', 'DEXUSEU': 'EURUSD (noon NY buying rate)',
        'NASDAQ100': 'Nasdaq-100 cash close', 'VIXCLS': 'VIX close', 'DCOILWTICO': 'WTI spot', 'DTWEXBGS': 'Broad dollar index (H.10)'}
LAG = {'DTWEXBGS': 6, 'THREEFYTP10': 5}          # extra business-day publication lags (A1); everything else d-1


def fred(sid):
    p = os.path.join(RAW, f'{sid}.csv')
    if not os.path.exists(p):
        txt = urllib.request.urlopen(f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}', timeout=90).read().decode('utf-8-sig')
        open(p, 'w', encoding='utf-8').write(txt)
    d = pd.read_csv(p); d.columns = ['date', 'v']
    s = pd.Series(pd.to_numeric(d['v'], errors='coerce').to_numpy(), index=pd.to_datetime(d['date'])).dropna()
    return s[(s.index >= START) & (s.index <= END)]


def load():
    S = {k: fred(k) for k in FRED}
    y = pd.read_parquet(os.path.join(ROOT, 'analysis/output/dynlead/yields_daily.parquet'))
    y.index = pd.to_datetime(y.index).astype('datetime64[ns]')
    for k in ('DE2', 'DE10'):
        s = y[k].dropna(); S[k] = s[(s.index >= START) & (s.index <= END)]
    for k in S: S[k].index = pd.DatetimeIndex(S[k].index).astype('datetime64[ns]')
    return S


def audit(S):
    rows = []
    bd = pd.bdate_range(START, END)
    desc = dict(FRED, DE2='Germany 2y par yield (Bundesbank Svensson, BBSIS R02XX)', DE10='Germany 10y par yield (Bundesbank Svensson, BBSIS R10XX)')
    stamp = {'DEXUSEU': '12:00 New York', 'NASDAQ100': '16:00 New York close', 'VIXCLS': '16:15 New York close', 'DE2': 'end of day Frankfurt', 'DE10': 'end of day Frankfurt',
             'DTWEXBGS': 'daily values, published weekly (Mon)', 'THREEFYTP10': 'model estimate, posted with a few days lag, revisable', 'DCOILWTICO': 'spot close (EIA), known bad prints'}
    for k, s in S.items():
        d = s.diff(); z = (d - d.median()) / (1.4826 * (d - d.median()).abs().median() + 1e-12)
        gaps = s.index.to_series().diff().dt.days
        rows.append(dict(series=k, what=desc[k], stamp=stamp.get(k, 'end of day New York (H.15 / Treasury)'), start=str(s.index[0].date()), end=str(s.index[-1].date()),
                         n=len(s), missing_on_us_bdays=round(1 - len(s.index.intersection(bd)) / len(bd), 4), unchanged_share=round(float((d == 0).mean()), 4),
                         outliers_8z=int((z.abs() > 8).sum()), max_gap_days=int(gaps.max()), extra_lag_bdays=LAG.get(k, 0), min_value=float(s.min())))
    return rows


def asof(s, idx, lag_bdays):
    """value of series s known at the start of each row date d: last obs dated <= d - 1 - lag business days; also report its age."""
    cut = idx - pd.offsets.BDay(1 + lag_bdays)
    pos = np.searchsorted(s.index.values, cut.values, side='right') - 1
    v = np.where(pos >= 0, s.to_numpy()[np.clip(pos, 0, None)], np.nan)
    age = np.where(pos >= 0, (cut.values - s.index.values[np.clip(pos, 0, None)]) / np.timedelta64(1, 'D'), np.nan)
    v[age > 7] = np.nan                                   # stale beyond a week = missing
    return v


def changes(s, n):
    """change over the series' own last n observations (bp for rates, log for prices), stamped at the observation date"""
    return s - s.shift(n)


def build(asset, S):
    tgt = S['DEXUSEU'] if asset == 'eurusd' else S['NASDAQ100']
    idx = tgt.index
    P = pd.DataFrame(index=idx); P['logp'] = np.log(tgt.to_numpy())
    rates = {'US2': S['DGS2'], 'REAL10': S['DFII10'], 'BE10': S['T10YIE'], 'TP10': S['THREEFYTP10']}
    slope = (S['DGS10'] - S['DGS2']).dropna(); rates['SLOPE'] = slope
    if asset == 'eurusd':
        j = pd.concat([S['DGS2'], S['DE2']], axis=1, keys=['u', 'd']).dropna(); rates['DIFF2'] = j['u'] - j['d']
        j = pd.concat([S['DGS10'], S['DE10']], axis=1, keys=['u', 'd']).dropna(); rates['DIFF10'] = j['u'] - j['d']
    for k, s in rates.items():
        lag = LAG.get('THREEFYTP10' if k == 'TP10' else '', 0)
        for n in (5, 20):
            P[f'r_{k}_d{n}'] = asof(changes(s, n) * 100, idx, lag)         # bp
    # descriptive extras (not model inputs): nominal 10y, curvature, 3m, 1-day changes for Phase A/B
    extra = {'US10': S['DGS10'], 'US3M': S['DGS3MO'], 'CURV': (2 * S['DGS5'] - S['DGS2'] - S['DGS10']).dropna(), **rates}
    for k, s in extra.items():
        P[f'x_{k}_d1_sameday'] = (changes(s, 1) * 100).reindex(idx).to_numpy()            # same-day change (descriptive only)
        P[f'x_{k}_level'] = s.reindex(idx).to_numpy()
    # baseline (M1): own returns known at d (P(d-1) and before), realised vol, VIX
    lp = P['logp']
    for n in (1, 5, 20, 60):
        P[f'b_ret{n}'] = (lp.shift(1) - lp.shift(1 + n)).to_numpy()
    P['b_rv20'] = np.log(lp.diff().shift(1).rolling(20, min_periods=15).std() * np.sqrt(252))
    vix = S['VIXCLS']; P['b_lvix'] = asof(np.log(vix), idx, 0); P['b_dvix5'] = asof(np.log(vix) - np.log(vix).shift(5), idx, 0)
    # macro (M3)
    oil = np.log(S['DCOILWTICO'].clip(lower=1.0))
    P['m_oil5'] = asof(oil - oil.shift(5), idx, 0); P['m_oil20'] = asof(oil - oil.shift(20), idx, 0)
    if asset == 'nq':
        usd = np.log(S['DTWEXBGS']); P['m_usd5'] = asof(usd - usd.shift(5), idx, LAG['DTWEXBGS']); P['m_usd20'] = asof(usd - usd.shift(20), idx, LAG['DTWEXBGS'])
    else:
        P['m_de2_d20'] = asof(changes(S['DE2'], 20) * 100, idx, 0)
    # regimes known at d-1
    r60 = asof(changes(S['DFII10'], 60), idx, 0); P['R1_realup'] = np.where(np.isnan(r60), np.nan, (r60 > 0).astype(float))
    u20 = P['r_US2_d20']; P['R2_hawk'] = np.where(np.isnan(u20), np.nan, (u20 > 0).astype(float))
    lv = pd.Series(P['b_lvix'].to_numpy(), index=idx); P['R3_riskoff'] = (lv > lv.rolling(252, min_periods=200).median()).astype(float).where(lv.rolling(252, min_periods=200).median().notna())
    rv = P['b_rv20']; P['R4_highvol'] = (rv > rv.rolling(252, min_periods=200).median()).astype(float).where(rv.rolling(252, min_periods=200).median().notna())
    # targets
    for h in (1, 5, 20):
        P[f'y{h}'] = (lp.shift(-h) - lp).to_numpy()
    P['ret_next'] = (lp.shift(-1) - lp).to_numpy()                       # for the trading rule
    P = P[(P.index >= '2005-01-03') & (P.index <= END)]
    return P


def release_days():
    import re
    c = pd.read_csv(os.path.join(ROOT, 'calendar_events.csv'), encoding='latin-1', low_memory=False)
    pat = re.compile(r'Payroll|Non-Farm Employment Change|Inflation Rate Year-over-Year|^CPI|Core CPI|FOMC Statement|Fed Interest Rate Decision|Federal Funds Rate')
    u = c[(c['ccy'] == 'USD') & c['event'].astype(str).str.contains(pat)]
    days = set(pd.to_datetime(u['date'], errors='coerce').dropna().dt.strftime('%Y-%m-%d'))
    f = pd.read_csv(os.path.join(ROOT, 'data/calendar/ff_calendar_2007_2025.csv'), encoding='latin-1', usecols=[0, 1, 2, 3])
    f = f[(f['Currency'] == 'USD') & f['Impact'].astype(str).str.startswith('High') & f['Event'].astype(str).str.contains(pat)]
    ft = pd.to_datetime(f['DateTime'], utc=True, errors='coerce').dropna()
    days |= set(ft[ft < '2014-01-01'].dt.tz_convert('America/New_York').dt.strftime('%Y-%m-%d'))
    return days


if __name__ == '__main__':
    S = load()
    A = audit(S)
    rel = release_days()
    L = ['# yield-predictive-ladder: data-quality and provenance audit', '', 'Deliverable 1 of the brief. Computed before any outcome. Window 2005-01-03 → 2026-08-21 (2004 = warm-up).', '',
         '| series | what | timestamp | start | end | n | missing on US bdays | unchanged | robust-z > 8 changes | max gap (days) | extra publication lag used (bdays) |',
         '|---|---|---|---|---|---|---|---|---|---|---|']
    L += [f"| {r['series']} | {r['what']} | {r['stamp']} | {r['start']} | {r['end']} | {r['n']} | {r['missing_on_us_bdays']:.1%} | {r['unchanged_share']:.1%} | {r['outliers_8z']} | {r['max_gap_days']} | {r['extra_lag_bdays']} |" for r in A]
    J = {'series': A}
    for asset in ('eurusd', 'nq'):
        P = build(asset, S)
        P['release'] = [1.0 if d in rel else (np.nan if (d < '2007-07-01' or d > '2026-07-02') else 0.0) for d in P.index.strftime('%Y-%m-%d')]
        P.to_parquet(os.path.join(OUT, f'panel_{asset}.parquet'))
        feats = [c for c in P.columns if c.startswith(('r_', 'b_', 'm_'))]
        cov = P[feats].notna().mean()
        L += ['', f'## Panel: {asset}', '', f'- rows {len(P)} ({P.index[0].date()} → {P.index[-1].date()}); rows with every model input present: {int(P[feats].notna().all(axis=1).sum())}.',
              f'- release-day share (2007-07 → 2026-07): {np.nanmean(P["release"]):.1%}.', '', '| input | coverage |', '|---|---|'] + [f'| {k} | {v:.1%} |' for k, v in cov.items()]
        J[asset] = dict(rows=len(P), complete=int(P[feats].notna().all(axis=1).sum()), coverage={k: float(v) for k, v in cov.items()})
    L += ['', '## Point-in-time rules applied', '',
          '- **Every model input for row d is dated ≤ d−1.** Changes are taken over each series\' own observations, then joined as-of; anything staler than 7 days is missing, never interpolated.',
          '- **Extra publication lags (A1):** the broad dollar (weekly H.10) uses d−7; the Kim–Wright term premium uses d−6 and is revisable, so every model is also run without it.',
          '- **Targets** run from the day-d print: EURUSD at noon New York (FRED DEXUSEU), Nasdaq-100 at the close.',
          '- **Calendars differ** (US and German holidays). The as-of join uses the last value each market actually printed. Same-day descriptive correlations use exact-date matches only.',
          '- **Oil:** WTI is floored at 1 before taking logs (the 2020-04-20 negative print). All features are winsorised inside each training window (A1).',
          '- **Revisions:** H.15 Treasury yields, TIPS and breakevens are not revised. The Bundesbank Svensson curve is a fitted curve, not traded quotes. The Kim–Wright term premium is model-revised (flagged above).']
    open(os.path.join(OUT, 'DATA_AUDIT.md'), 'w', encoding='utf-8').write('\n'.join(L))
    json.dump(J, open(os.path.join(OUT, 'data_audit.json'), 'w'), indent=1)
    print('\n'.join(L[:20]))
