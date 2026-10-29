"""oi-level-map step 1: one compact M1 mid cache per instrument for the OI-capture window (2026-07-25 on), and the spot at each sweep's capture time.
Source: data/m1_bidask/<key>_m1.parquet (mid OHLC; to 2026-10-19/20). Read-only on data. Output is local cache (gitignored) + spots.json."""
import json, glob, re, os, sys
import pandas as pd
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'analysis', 'output', 'oi-level-map')
KEY = {'EUR_USD': 'eurusd', 'GBP_USD': 'gbpusd', 'USD_JPY': 'usdjpy', 'AUD_USD': 'audusd', 'USD_CAD': 'usdcad', 'USD_CHF': 'usdchf',
       'XAU_USD': 'gold', 'NAS100_USD': 'nq', 'SPX500_USD': 'spx', 'US30_USD': 'dow', 'US2000_USD': 'us2000'}
START = pd.Timestamp('2026-07-25')
px = {}
for sym, k in KEY.items():
    df = pd.read_parquet(os.path.join(ROOT, 'data', 'm1_bidask', f'{k}_m1.parquet'), columns=['open', 'high', 'low', 'close', 'time'])
    df['time'] = pd.to_datetime(df['time'])
    df = df[df['time'] >= START].set_index('time').sort_index()
    df = df[~df.index.duplicated()]
    df.to_parquet(os.path.join(OUT, '_cache', f'm1_{sym}.parquet'))
    px[sym] = df
    print(sym, len(df), df.index[0], df.index[-1])

def capture_ts(d):
    p = os.path.join(ROOT, 'oi_recon', 'out', d, 'quikstrike')
    best = None
    for f in glob.glob(os.path.join(p, 'sweep_*.json')):
        m = re.search(r'sweep_(\d{8}T\d{6}Z)\.json', f)
        try:
            j = json.load(open(f, encoding='utf-8'))
        except Exception:
            continue
        if j.get('captured') == j.get('expected') and m:
            t = m.group(1)
            best = t if best is None or t > best else best
    if best is None:
        a = os.path.join(p, 'asof.json')
        if os.path.exists(a):
            best = json.load(open(a, encoding='utf-8')).get('updated')
    if best is None:   # early dirs with no sweep json / asof: the capture time is the OI file's own mtime
        fs = glob.glob(os.path.join(p, '*_rawOI.tsv'))
        if fs:
            return pd.Timestamp(int(max(os.path.getmtime(f) for f in fs)), unit='s')
    return pd.Timestamp(pd.to_datetime(best, format='%Y%m%dT%H%M%SZ')) if best else None

spots = {}
for d in sorted(x for x in os.listdir(os.path.join(ROOT, 'oi_recon', 'out')) if x.startswith('2026')):
    ts = capture_ts(d)
    if ts is None:
        continue
    rec = {'captureUtc': ts.strftime('%Y-%m-%dT%H:%M:%SZ'), 'spot': {}}
    for sym, df in px.items():
        i = df.index.searchsorted(ts, side='right') - 1
        if i >= 0 and (ts - df.index[i]) <= pd.Timedelta(minutes=30):
            rec['spot'][sym] = float(df['close'].iloc[i])
    spots[d] = rec
json.dump(spots, open(os.path.join(OUT, 'spots.json'), 'w'), indent=0)
print('dirs with capture ts', len(spots), 'with full spots', sum(1 for v in spots.values() if len(v['spot']) == 11))
