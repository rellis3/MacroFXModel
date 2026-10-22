"""OI walls per London day (forge/CONFLUENCE_LEVELS_PREREG.md, amendment).
Top-5 strikes by open interest (calls + puts, expiries within 35 days), in spot terms, from the OI
dated two business days before the London day.  -> analysis/output/rangebook/oi_walls.json
    python scripts/rangebook/oi_walls_build.py
"""
import bisect, json, os
import pandas as pd

SRC = os.environ.get('OI_DIR', r'..\MacroFXModel\OI Data')
PAIRS = {'eurusd': ('EUR_USD', False), 'gbpusd': ('GBP_USD', False), 'audusd': ('AUD_USD', False),
         'usdcad': ('USD_CAD', True), 'usdchf': ('USD_CHF', True), 'usdjpy': ('USD_JPY', True)}
out = {}
for pair, (f, inv) in PAIRS.items():
    d = pd.read_csv(os.path.join(SRC, f + '.csv'), usecols=['date', 'expiry', 'strike', 'open_interest'])
    d['date'] = pd.to_datetime(d['date']); d['expiry'] = pd.to_datetime(d['expiry'], utc=True).dt.tz_localize(None)
    d = d[(d['expiry'] > d['date']) & (d['expiry'] <= d['date'] + pd.Timedelta(days=35)) & (d['open_interest'] > 0)]
    g = d.groupby(['date', 'strike'])['open_interest'].sum().reset_index()
    walls = {}
    for dt, x in g.groupby('date'):
        top = x.nlargest(5, 'open_interest')['strike'].tolist()
        walls[dt] = [round(1 / s, 6) if inv else s for s in top if s > 0]
    dates = sorted(walls)
    # London day L uses the OI dated two business days earlier: Mon->Thu, Tue->Fri, Wed->Mon ...
    use = {}
    for L in pd.bdate_range(dates[0] + pd.Timedelta(days=3), '2026-09-30'):
        src = L - pd.offsets.BDay(2)
        i = bisect.bisect_right(dates, src) - 1                  # latest OI date on or before src
        if i >= 0 and (src - dates[i]).days <= 5: use[L.strftime('%Y-%m-%d')] = walls[dates[i]]
    out[pair] = use
    print(pair, len(dates), 'OI dates ->', len(use), 'London days; e.g.', list(use.items())[-1])
json.dump(out, open('analysis/output/rangebook/oi_walls.json', 'w'))
