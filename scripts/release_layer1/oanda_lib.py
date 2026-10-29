"""Release Reaction, Layer 1: the European and Japanese markets for the ECB / BoE / BoJ decisions and the fiscal events, from OANDA 1-minute mid candles (read-only).
UK 10y gilt, German 10y Bund (bond CFDs: prices, so price down = yields up), FTSE 100, DAX and Nikkei 225. History from 2024-03-01 (the start of the Layer 1 history), then topped up
on every live run. Cache: data/release_oanda/<INSTRUMENT>.parquet (gitignored; columns time = bar start UTC, close = mid close).
Key: OANDA_KEY in the environment, else RegimeV2/.env (practice). Run on its own to backfill:  python scripts/release_layer1/oanda_lib.py"""
import json, os, time, urllib.request
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DIR = ROOT / 'data' / 'release_oanda'
INSTRUMENTS = {'gilt': 'UK10YB_GBP', 'bund': 'DE10YB_EUR', 'ftse': 'UK100_GBP', 'dax': 'DE30_EUR', 'nikkei': 'JP225_USD'}
START = pd.Timestamp('2024-03-01', tz='UTC')


def _key():
    k, env = os.environ.get('OANDA_KEY'), os.environ.get('OANDA_ENV', 'practice')
    if not k:
        f = ROOT / 'RegimeV2' / '.env'
        if f.exists():
            for line in f.read_text(encoding='utf-8').splitlines():
                if line.startswith('OANDA_KEY='): k = line.split('=', 1)[1].strip().strip('"\'')
    host = 'https://api-fxtrade.oanda.com' if env == 'live' else 'https://api-fxpractice.oanda.com'
    return k, host


def path(ins):
    return DIR / f'{ins}.parquet'


def load(ins):
    p = path(ins)
    if not p.exists(): return pd.Series(dtype=float)
    d = pd.read_parquet(p); d['time'] = pd.to_datetime(d['time'], utc=True)
    return d.set_index('time')['close'].sort_index()


def top_up(ins, max_req=400):
    """fetch complete M1 mid candles from the newest cached bar (or START) to now, 5000 at a time; returns a short note"""
    k, host = _key()
    if not k: return f'{ins}: no OANDA key'
    have = load(ins); start = (have.index.max() + pd.Timedelta(minutes=1)) if len(have) else START
    rows, n = [], 0
    while n < max_req and start < pd.Timestamp.now(tz='UTC') - pd.Timedelta(minutes=2):
        url = f'{host}/v3/instruments/{ins}/candles?price=M&granularity=M1&count=5000&from={start.strftime("%Y-%m-%dT%H:%M:%SZ")}'
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'Authorization': 'Bearer ' + k}), timeout=60) as r: j = json.load(r)
        except Exception as e:
            if '429' in str(e): time.sleep(2); n += 1; continue
            return f'{ins}: {type(e).__name__} {e}'[:160]
        c = [x for x in j.get('candles', []) if x.get('complete')]
        n += 1
        if not c: break
        rows += [(x['time'], float(x['mid']['c'])) for x in c]
        nxt = pd.Timestamp(c[-1]['time']).tz_convert('UTC') + pd.Timedelta(minutes=1)
        if nxt <= start: break
        start = nxt
        if len(j['candles']) < 5000: break
    if rows:
        new = pd.DataFrame(rows, columns=['time', 'close']); new['time'] = pd.to_datetime(new['time'], utc=True)
        old = have.rename('close').reset_index() if len(have) else new.iloc[:0]
        d = pd.concat([old, new]).drop_duplicates('time', keep='last').sort_values('time')
        DIR.mkdir(parents=True, exist_ok=True); d.to_parquet(path(ins), index=False)
    return f'{ins} +{len(rows)}'


if __name__ == '__main__':
    for key, ins in INSTRUMENTS.items():
        print(top_up(ins, max_req=2000), flush=True)
        s = load(ins); print(f'  {key}: {len(s)} bars {s.index.min()} -> {s.index.max()}')
