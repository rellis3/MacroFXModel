"""Refresh the individual futures legs for the chart page (cog-chart.html) from IBKR and PUSH the recent bars to the server (KV cog_legs_live_v1), so the page's legs are current
without a redeploy. Laptop: IB Gateway open and logged in, API on port 4002 (paper; override with env IB_PORT).

    python scripts/rates_line/refresh_leg_bars.py [--days auto|N] [--push] [--commit] [--no-pull]

--days auto   works out how far back to pull from the newest bar on disk (IBKR serves 1-minute history, so a run after the laptop was off CATCHES UP, capped at 25 days)
--push        POST the last --push-days (default 3) of 5-minute bars for every leg to {base}/api/kv/set
--commit      also commit the rebuilt analysis/output/cog_chart/*.json so a fresh deploy starts from them
--no-pull     skip TWS, only rebuild the JSON from what is on disk (and push if asked)

If TWS is not reachable the script says so and exits 2 WITHOUT touching anything. The same schedule as run_cog_line.bat is fine (every 30 minutes)."""
import argparse
import asyncio
import json
import math
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
import os
asyncio.set_event_loop(asyncio.new_event_loop())
IB_PORT = int(os.environ.get('IB_PORT', 4002))   # IB Gateway paper (4002). TWS paper is 7497; set IB_PORT to override
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'analysis' / 'output' / 'stir_1m_deep'
OUT = ROOT / 'analysis' / 'output' / 'cog_chart'
sys.path.insert(0, str(ROOT / 'scripts' / 'rates_line'))
import build_leg_bars as B
BASE = 'https://macrofxmodel-production.up.railway.app'
KV_KEY = 'cog_legs_live_v1'
IB_SPEC = {   # name: (IBKR symbol, exchange, currency, contract-month parameter). CORE = the legs the C.OG work uses; --all adds every other live US / euro rates contract.
    'SR3U6': ('SOFR3', 'CME', 'USD', '202609'), 'SR3Z6': ('SOFR3', 'CME', 'USD', '202612'), 'SR3H7': ('SOFR3', 'CME', 'USD', '202703'),
    'IH7': ('I', 'ICEEU', 'EUR', '202703'), 'IZ6': ('I', 'ICEEU', 'EUR', '202612'), 'ER3Z6': ('ER3', 'ICEEU', 'EUR', '202612'), 'ER3H7': ('ER3', 'ICEEU', 'EUR', '202703'),
    'SR3M7': ('SOFR3', 'CME', 'USD', '202706'), 'SR3U7': ('SOFR3', 'CME', 'USD', '202709'), 'IM7': ('I', 'ICEEU', 'EUR', '202706'), 'IU7': ('I', 'ICEEU', 'EUR', '202709'),
    'ER3U6': ('ER3', 'ICEEU', 'EUR', '202609'), 'ER3M7': ('ER3', 'ICEEU', 'EUR', '202706'), 'ER3U7': ('ER3', 'ICEEU', 'EUR', '202709'),
    'ZQV6': ('ZQ', 'CBOT', 'USD', '202610'), 'ZQX6': ('ZQ', 'CBOT', 'USD', '202611'), 'ZQZ6': ('ZQ', 'CBOT', 'USD', '202612'), 'ZQF7': ('ZQ', 'CBOT', 'USD', '202701'), 'ZQH7': ('ZQ', 'CBOT', 'USD', '202703'),
    # government bond futures (PRICES; the chart's yield legs come from js/yieldLegs.js). IBKR's Eurex symbols are GBS/GBM/GBL/GBX:
    # 'FGBS' does not resolve ("contract not found"), which is why the Schatz leg stopped on 2026-10-09. Dec contracts: roll to Mar27
    # (ZTH7 ... / *2703) in late November for the US notes and early December for the Eurex bonds.
    'ZTZ6': ('ZT', 'CBOT', 'USD', '202612'), 'ZFZ6': ('ZF', 'CBOT', 'USD', '202612'), 'ZNZ6': ('ZN', 'CBOT', 'USD', '202612'),
    'ZBZ6': ('ZB', 'CBOT', 'USD', '202612'), 'UBZ6': ('UB', 'CBOT', 'USD', '202612'),
    'FGBS2612': ('GBS', 'EUREX', 'EUR', '202612'), 'FGBM2612': ('GBM', 'EUREX', 'EUR', '202612'), 'FGBL2612': ('GBL', 'EUREX', 'EUR', '202612'), 'FGBX2612': ('GBX', 'EUREX', 'EUR', '202612'),
    # 2026-10-23: euro spread legs (BTP/OAT minus Bund), the dollar index, VIX futures, and three vol indices ('IND' = an index: no expiry, TRADES bars, RTH)
    'FBTP2612': ('BTP', 'EUREX', 'EUR', '202612'), 'FOAT2612': ('OAT', 'EUREX', 'EUR', '202612'), 'DXZ6': ('DX', 'NYBOT', 'USD', '202612'),
    'VXX6': ('VIX', 'CFE', 'USD', '202611'), 'VXZ6': ('VIX', 'CFE', 'USD', '202612'),
    'VVIX': ('VVIX', 'CBOE', 'USD', 'IND'), 'VIX': ('VIX', 'CBOE', 'USD', 'IND'), 'VXN': ('VXN', 'CBOE', 'USD', 'IND'),
    'NQZ6': ('NQ', 'CME', 'USD', '202612'),      # 2026-10-25: Nasdaq-100 future for the Release Reaction page (scripts/release_layer1); no chart leg file, so the push skips it
}
CORE = ['SR3U6', 'SR3Z6', 'SR3H7', 'IH7', 'IZ6', 'ER3Z6', 'ER3H7', 'IM7']      # IM7: becomes I2! when IZ6 expires (14 Dec 2026), so the stitched I2 line stays live
BONDS = ['ZTZ6', 'ZFZ6', 'ZNZ6', 'ZBZ6', 'UBZ6', 'FGBS2612', 'FGBM2612', 'FGBL2612', 'FGBX2612']      # US 2/5/10/30/ultra and German 2/5/10/30: pulled on every run too (2026-10-23)
MACRO = ['FBTP2612', 'FOAT2612', 'DXZ6', 'VXX6', 'VXZ6', 'VVIX', 'VIX', 'VXN', 'NQZ6']      # euro spreads, dollar, vol: pulled on every run too (2026-10-23)
last = [0.0]


def pace():
    w = 10.5 - (time.time() - last[0])
    time.sleep(max(w, 0))
    last[0] = time.time()


def merge(path, df):
    if path.exists():
        df = pd.concat([pd.read_parquet(path), df], ignore_index=True).drop_duplicates('time', keep='last')
    df.sort_values('time').reset_index(drop=True).to_parquet(path, index=False)


def kv_set(obj):
    body = json.dumps({'key': KV_KEY, 'data': obj, 'timestamp': int(datetime.now(timezone.utc).timestamp() * 1000)}).encode()
    req = urllib.request.Request(f'{BASE}/api/kv/set', data=body, headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.getcode(), r.read().decode()[:160]


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--days', default='auto')
    ap.add_argument('--push', action='store_true')
    ap.add_argument('--push-days', type=int, default=3)
    ap.add_argument('--commit', action='store_true')
    ap.add_argument('--no-pull', action='store_true')
    ap.add_argument('--names', default='', help='comma-separated leg names to pull instead of the default set (e.g. a one-off backfill of newly added legs)')
    ap.add_argument('--all', action='store_true', help='pull every contract in IB_SPEC, not only the seven core legs (about 4 minutes per week of history)')
    a = ap.parse_args()
    now = datetime.now(timezone.utc)
    names = [n.strip() for n in a.names.split(',') if n.strip()] if a.names else (list(IB_SPEC) if a.all else CORE + BONDS + MACRO)
    found = B.discover()
    stem = lambda n: found[n]['stem'] if n in found else f'{IB_SPEC[n][1]}_{n}'
    if not a.no_pull:
        from ib_insync import IB, Future, Index, util
        newest = None
        for n in names:
            p = SRC / f'{stem(n)}.parquet'
            if p.exists():
                x = pd.to_datetime(pd.read_parquet(p, columns=['time']).time, utc=True).max()
                newest = x if newest is None or x < newest else newest
        days = 3 if (a.days == 'auto' and newest is None) else (min(25, max(3, math.ceil((pd.Timestamp(now) - newest).total_seconds() / 86400) + 1)) if a.days == 'auto' else int(a.days))
        ib = IB()
        try:
            ib.connect('127.0.0.1', IB_PORT, clientId=21, timeout=20, readonly=True)
        except Exception as e:
            print(f'Could not connect to IB Gateway on port {IB_PORT} ({type(e).__name__}). Open and log in (accept the paper-trading disclaimer), then run again. Nothing was changed.')
            sys.exit(2)
        sat = (now + timedelta(days=(5 - now.weekday()) % 7)).replace(hour=0, minute=0, second=0, microsecond=0)
        print(f'pulling the last {days} day(s) for {names}')
        for name in names:
            sym, exch, ccy, month = IB_SPEC[name]
            is_index = month == 'IND'
            det = ib.reqContractDetails(Index(symbol=sym, exchange=exch, currency=ccy) if is_index else Future(symbol=sym, exchange=exch, currency=ccy, lastTradeDateOrContractMonth=month))
            if not det:
                print(f'{name}: contract not found (expired or not listed)')
                continue
            c = det[0].contract
            if not is_index:
                c.lastTradeDateOrContractMonth = c.lastTradeDateOrContractMonth.split(' ')[0]
                if datetime.strptime(c.lastTradeDateOrContractMonth, '%Y%m%d').replace(tzinfo=timezone.utc) < now - timedelta(days=1):
                    print(f'{name}: expired {c.lastTradeDateOrContractMonth}, skipping')
                    continue
            got = 0
            for w in range(max(1, days // 7 + 1)):
                end = min(sat - timedelta(weeks=w), now)
                pace()
                ib.RequestTimeout = 0
                try:
                    bars = ib.reqHistoricalData(c, endDateTime=end, durationStr='1 W', barSizeSetting='1 min', whatToShow='TRADES' if is_index else 'MIDPOINT', useRTH=is_index, formatDate=2, timeout=600)
                except Exception as e:
                    print(f'  {name} {end:%Y-%m-%d}: failed {e}')
                    continue
                if bars:
                    df = util.df(bars)
                    df.insert(0, 'time', pd.to_datetime(df.pop('date'), utc=True).dt.strftime('%Y-%m-%dT%H:%M:%SZ'))
                    merge(SRC / f'{stem(name)}.parquet', df)
                    got += len(df)
            print(f'{name}: +{got:,} bars merged')
        ib.disconnect()
    subprocess.run([sys.executable, str(ROOT / 'scripts' / 'rates_line' / 'build_leg_bars.py')], check=True)
    if a.push:
        payload = {'asOf': now.isoformat(), 'legs': {}}
        for name in names:
            if not (OUT / f'leg_{name}.json').exists(): continue      # contracts with no chart leg (NQZ6) are only pulled to disk
            j = json.loads((OUT / f'leg_{name}.json').read_text(encoding='utf-8'))
            m = j['m5']
            cut = int(now.timestamp()) - a.push_days * 86400
            i0 = next((i for i, t in enumerate(m['t']) if t >= cut), len(m['t']))
            payload['legs'][name] = {'m5': {k: m[k][i0:] for k in ('t', 'o', 'h', 'l', 'c')}, 'asOf': j['asOf']}
        code, resp = kv_set(payload)
        print(f'POST /api/kv/set {KV_KEY} ({sum(len(v["m5"]["t"]) for v in payload["legs"].values())} bars) -> HTTP {code} {resp}')
    if a.commit:
        subprocess.run(['git', 'add', 'analysis/output/cog_chart'], cwd=ROOT, check=True)
        subprocess.run(['git', 'commit', '-m', 'cog chart legs: refresh from IBKR'], cwd=ROOT)
        subprocess.run(['git', 'pull', '--rebase', '--autostash'], cwd=ROOT)
        subprocess.run(['git', 'push'], cwd=ROOT)
