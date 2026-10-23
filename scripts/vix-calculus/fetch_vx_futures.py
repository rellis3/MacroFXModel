"""vix-calculus data: CBOE VX futures daily settlements, one public CSV per monthly contract (cdn.cboe.com), 2013 -> 2026.
Read-only public download. Output: analysis/output/vix-calculus/data/vx_settle.parquet (date, expiry, settle)."""
import os, io, datetime as dt, urllib.request
import pandas as pd
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'analysis', 'output', 'vix-calculus', 'data'); os.makedirs(OUT, exist_ok=True)
def expiry(y, m):
    """VX monthly expiry: the Wednesday 30 days before the 3rd Friday of the following month (holiday shifts handled by trying -1 day)."""
    ny, nm = (y + (m == 12), m % 12 + 1); d = dt.date(ny, nm, 15); d += dt.timedelta(days=(4 - d.weekday()) % 7)
    return d - dt.timedelta(days=30)
rows = []
for y in range(2013, 2027):
    for m in range(1, 13):
        e = expiry(y, m)
        if e > dt.date(2027, 3, 1): continue
        got = None
        for cand in (e, e - dt.timedelta(days=1), e + dt.timedelta(days=1)):
            try:
                t = urllib.request.urlopen(urllib.request.Request(f'https://cdn.cboe.com/data/us/futures/market_statistics/historical_data/VX/VX_{cand}.csv', headers={'User-Agent': 'Mozilla/5.0'}), timeout=30).read().decode()
                got = (cand, t); break
            except Exception: pass
        if not got: print('missing', y, m); continue
        d = pd.read_csv(io.StringIO(got[1])); d = d[d['Settle'] > 0]
        rows.append(pd.DataFrame({'date': pd.to_datetime(d['Trade Date']), 'expiry': pd.Timestamp(got[0]), 'settle': d['Settle'].astype(float), 'volume': d['Total Volume']}))
        print(got[0], len(d), flush=True)
pd.concat(rows).sort_values(['date', 'expiry']).reset_index(drop=True).to_parquet(os.path.join(OUT, 'vx_settle.parquet')); print('done')
