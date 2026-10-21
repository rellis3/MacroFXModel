"""rate-surprise-events: read-only OANDA M15 mid candles 2009-11-01 -> 2026-08-21 (lockbox end, explicit `to`) for the US 2y / 10y
Treasury CFDs, EURUSD and NAS100. Uses the repo's existing credential helper (analysis/nasdaq_lead_lag_scan.oanda_creds; key never
printed). Writes analysis/output/rate-surprise-events/m15/<INSTRUMENT>.parquet (index = bar OPEN time, UTC)."""
import os, sys, json, time, urllib.request, urllib.error
import pandas as pd
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')); sys.path.insert(0, ROOT)
from analysis.nasdaq_lead_lag_scan import oanda_creds

OUT = os.path.join(ROOT, 'analysis', 'output', 'rate-surprise-events', 'm15'); os.makedirs(OUT, exist_ok=True)
START, END = pd.Timestamp('2009-11-01', tz='UTC'), pd.Timestamp('2026-08-21T23:59:00', tz='UTC')
key, base = oanda_creds(); H = {'Authorization': 'Bearer ' + key}


def get(url):
    for attempt in range(8):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=60))
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504): time.sleep(3 * (attempt + 1)); continue
            raise
        except Exception:
            time.sleep(3 * (attempt + 1))
    raise RuntimeError('OANDA fetch failed repeatedly')


for ins in ('USB02Y_USD', 'USB10Y_USD', 'EUR_USD', 'NAS100_USD'):
    p = os.path.join(OUT, f'{ins}.parquet')
    if os.path.exists(p): print(ins, 'cached'); continue
    rows, cur = [], START
    while cur < END:
        to = min(cur + pd.Timedelta(days=45), END)
        r = get(f"{base}/v3/instruments/{ins}/candles?granularity=M15&price=M&from={cur.strftime('%Y-%m-%dT%H:%M:%SZ')}&to={to.strftime('%Y-%m-%dT%H:%M:%SZ')}")
        for c in r.get('candles', []):
            if c.get('complete', True): rows.append((c['time'], float(c['mid']['c'])))
        cur = to
    s = pd.DataFrame(rows, columns=['time', 'close'])
    s['time'] = pd.to_datetime(s['time'], utc=True, format='ISO8601'); s = s.drop_duplicates('time').set_index('time').sort_index()
    s = s[s.index <= END]
    s.to_parquet(p); print(ins, len(s), s.index[0], s.index[-1], flush=True)
