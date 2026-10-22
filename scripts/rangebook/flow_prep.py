"""Daily inputs for the flow columns (forge/FLOW_COLUMNS_PREREG.md).
    python scripts/rangebook/flow_prep.py   -> analysis/output/rangebook/flow_daily.json
Per pair and London date: dealer GEX (dated two business days earlier) and its size vs the trailing 60 values;
option series expiring that date (expiry time, top-3 OI strikes from OI dated two business days earlier, spot terms).
Per currency: Major releases with a surprise z from that event's past surprises only.
"""
import bisect, json, os, re
import numpy as np, pandas as pd

MAIN = os.environ.get('MAIN_REPO', r'..\MacroFXModel')
PAIRS = {'eurusd': ('daily_master_all', 'EUR_USD', False), 'gbpusd': ('daily_master_all_gbp_usd', 'GBP_USD', False),
         'audusd': ('daily_master_all_aud_usd', 'AUD_USD', False), 'usdcad': ('daily_master_all_usd_cad', 'USD_CAD', True),
         'usdchf': ('daily_master_all_usd_chf', 'USD_CHF', True), 'usdjpy': ('daily_master_all_usd_jpy', 'USD_JPY', True),
         'nq': ('daily_master_all_nas100_usd', 'NAS100_USD', False)}
DAYS = pd.bdate_range('2020-09-08', '2026-09-30')
lag2 = lambda L: L - pd.offsets.BDay(2)

out = {'gex': {}, 'expiry': {}, 'releases': {}}
for pair, (dm, oi, inv) in PAIRS.items():
    d = pd.read_parquet(os.path.join(MAIN, 'oi_research_book', 'data', dm + '.parquet'))[['date', 'net_gex_sum']].dropna()
    d['date'] = pd.to_datetime(d['date']); d = d.sort_values('date').reset_index(drop=True)
    d['scale'] = d['net_gex_sum'].abs().rolling(60, min_periods=20).median()
    dates = list(d['date'])
    g = {}
    for L in DAYS:
        i = bisect.bisect_right(dates, lag2(L)) - 1
        if i >= 0 and (lag2(L) - dates[i]).days <= 5:
            v, s = d.at[i, 'net_gex_sum'], d.at[i, 'scale']
            g[L.strftime('%Y-%m-%d')] = [float(v), float(v / s) if s and s == s else None]
    out['gex'][pair] = g
    x = pd.read_csv(os.path.join(MAIN, 'OI Data', oi + '.csv'), usecols=['date', 'expiry', 'strike', 'open_interest'])
    x['date'] = pd.to_datetime(x['date']); x['expiry'] = pd.to_datetime(x['expiry'], utc=True)
    x = x[x['open_interest'] > 0]
    x['exday'] = x['expiry'].dt.tz_convert('Europe/London').dt.strftime('%Y-%m-%d')
    oidates = sorted(x['date'].unique())
    e = {}
    for (exday, exp), grp in x.groupby(['exday', 'expiry']):
        L = pd.Timestamp(exday); src = lag2(L)
        i = bisect.bisect_right(oidates, src) - 1
        if i < 0 or (src - oidates[i]).days > 5: continue
        snap = grp[grp['date'] == oidates[i]].groupby('strike')['open_interest'].sum().nlargest(3)
        if snap.empty: continue
        ks = [round(1 / k, 6) if inv else float(k) for k in snap.index if k > 0]
        e.setdefault(exday, []).append({'t': int(exp.timestamp()), 'strikes': ks})
    out['expiry'][pair] = e
    print(pair, 'gex days', len(g), 'expiry days', len(e), flush=True)

# Releases: Major impact, numeric actual + consensus; surprise z from the event's prior surprises (>= 12).
num = lambda s: (lambda m: float(m.group(0)) * {'K': 1e3, 'M': 1e6, 'B': 1e9, 'T': 1e12}.get((s.strip()[-1:] or ' ').upper(), 1)) \
    (re.search(r'-?\d+(\.\d+)?', s)) if isinstance(s, str) and re.search(r'-?\d+(\.\d+)?', s) else None
c = pd.read_csv('calendar_events.csv', encoding='latin1')
c = c[c['impact'] == 'Major'].copy()
c['t'] = pd.to_datetime(c['datetime_raw'], errors='coerce', utc=True)
c = c.dropna(subset=['t']).sort_values('t')
c['a'] = c['actual'].map(num); c['f'] = c['consensus'].map(num); c['s'] = c['a'] - c['f']
hist, rel = {}, {}
for r in c.itertuples():
    k = (r.ccy, r.event); past = hist.setdefault(k, []); z = None
    if r.s == r.s and r.s is not None:
        if len(past) >= 12:
            sd = float(np.std(past, ddof=1)); z = float(r.s / sd) if sd > 0 else None
        past.append(r.s)
    rel.setdefault(r.ccy, []).append([int(r.t.timestamp()), r.event, None if z is None else round(z, 3)])
out['releases'] = rel
print({k: len(v) for k, v in rel.items()}, 'with z:', {k: sum(x[2] is not None for x in v) for k, v in rel.items()})
json.dump(out, open('analysis/output/rangebook/flow_daily.json', 'w'))
