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
# 2026-11-27: the contracts come from the registry (scripts/ibkr/contracts.py, plans/DATA_CAPTURE_G10.md section 3). IB_SPEC keeps every name it
# carried before (name: (IBKR symbol, exchange, currency, contract month)), built from the registry, so --names ZNZ6 and pull_deep_history keep
# working; the default run no longer reads it: it asks IBKR for every listed expiry of each ROOT and pulls the live ones (front, plus the next
# inside the roll window), so a contract month never has to be edited in again. The Schatz stop of 2026-10-09 ('FGBS' does not resolve, IBKR's
# Eurex symbols are GBS/GBM/GBL/GBX) is why the registry keys the IBKR symbol per root.
sys.path.insert(0, str(ROOT / 'scripts' / 'ibkr'))
import contracts as K
IB_SPEC = K.ib_spec()
CORE, BONDS, FEDFUNDS, MACRO = K.CORE, K.BONDS, K.FEDFUNDS, K.MACRO      # the pre-registry default groups (CORE: IM7 becomes I2! when IZ6 expires 14 Dec 2026)
CACHE = SRC / 'contracts_registry.json'      # every contract IBKR listed per root (stem -> details): continuous.py reads the real last trading days from it
last = [0.0]


def pace():
    w = 10.5 - (time.time() - last[0])
    time.sleep(max(w, 0))
    last[0] = time.time()


def merge(path, df):
    """merge new bars into a parquet file. Two scheduled tasks (this refresh and scripts/release_layer1/live_push.py) write the same files, so the read-modify-write holds a lock file
    and the result is written to a temp file and swapped in (a reader never sees a half-written file, two writers never drop each other's bars)."""
    lock = Path(str(path) + '.lock'); t0 = time.time()
    while True:
        try: os.close(os.open(str(lock), os.O_CREAT | os.O_EXCL | os.O_WRONLY)); break
        except FileExistsError:
            if time.time() - lock.stat().st_mtime > 300: lock.unlink(missing_ok=True); continue        # a crashed run left it: stale after 5 minutes
            if time.time() - t0 > 180: raise TimeoutError(f'{path.name}: lock held for over 3 minutes')
            time.sleep(0.5)
    try:
        if path.exists():
            df = pd.concat([pd.read_parquet(path), df], ignore_index=True).drop_duplicates('time', keep='last')
        tmp = Path(str(path) + '.tmp'); df.sort_values('time').reset_index(drop=True).to_parquet(tmp, index=False); os.replace(tmp, path)
    finally:
        lock.unlink(missing_ok=True)


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
    ap.add_argument('--names', default='', help='comma-separated contract names to pull instead of the registry roots (old names like ZNZ6, or registry names like ZNH7, FGBL2703, SO3Z6)')
    ap.add_argument('--all', action='store_true', help='pull every live contract of each root to its full depth (8 quarterlies for strips, front + next always for rolled roots)')
    ap.add_argument('--tier', default='auto', choices=['auto', 'all', 'core', 'g10'], help='roots to pull: core = the ones pulled before 2026-11-27, g10 = the phase-2 G10 legs, all = both, auto (default) = core every run + G10 on the run in the first half of each hour')
    ap.add_argument('--new-days', type=int, default=5, help='days to pull for a contract with no file yet (default 5; the backfill is pull_deep_history.py)')
    ap.add_argument('--dry-run', action='store_true', help='resolve the live contracts and print what would be pulled; no history requests, nothing written')
    ap.add_argument('--client-id', type=int, default=21, help='IBKR API client id (default 21, the 30-minute job)')
    a = ap.parse_args()
    now = datetime.now(timezone.utc)
    legacy = [n.strip() for n in a.names.split(',') if n.strip()] if a.names else None
    found = B.discover()
    stem_of = lambda name, default: found[name]['stem'] if name in found else default      # an existing file always wins: no stem is ever orphaned
    pulled = []
    if not a.no_pull:
        from ib_insync import IB, util
        today = now.date()
        ib = IB()
        try:
            ib.connect('127.0.0.1', IB_PORT, clientId=a.client_id, timeout=20, readonly=True)
        except Exception as e:
            print(f'Could not connect to IB Gateway on port {IB_PORT} ({type(e).__name__}). Open and log in (accept the paper-trading disclaimer), then run again. Nothing was changed.')
            sys.exit(2)
        cache = {}
        try:
            cache = json.loads(CACHE.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            pass
        jobs = []      # (name, stem, contract, what, rth)
        if legacy:      # --names: exactly these contracts (old names and any registry name, e.g. ZNH7 or FGBL2703)
            for n in legacy:
                al = K.alias(n)
                if not al:
                    print(f'{n}: not a registry name, skipped')
                    continue
                r = K.ROOTS[al['root']]
                det = ib.reqContractDetails(K.ib_contract(r, None if r.kind == 'index' else f'{al["year"]}{al["month"]:02d}'))
                if not det:
                    print(f'{n}: contract not found (expired or not listed)')
                    continue
                c = det[0].contract
                if r.kind != 'index':
                    c.lastTradeDateOrContractMonth = c.lastTradeDateOrContractMonth.split(' ')[0]
                    if datetime.strptime(c.lastTradeDateOrContractMonth, '%Y%m%d').date() < today - timedelta(days=1):
                        print(f'{n}: expired {c.lastTradeDateOrContractMonth}, skipping')
                        continue
                default = f'{r.tag}_{r.key}' if r.kind == 'index' else K.stem_for(r, al['year'], al['month'], K._ltd_date(c.lastTradeDateOrContractMonth))
                jobs.append((n, stem_of(n, default), c, r.what, r.rth))
        else:
            for key in K.job_roots(a.tier, now.minute):
                r = K.ROOTS[key]
                det = ib.reqContractDetails(K.ib_contract(r))
                if not det:
                    print(f'{key}: IBKR lists no contracts (symbol {r.symbol} on {r.exchange}); skipped')
                    continue
                if r.kind == 'index':
                    jobs.append((key, stem_of(key, f'{r.tag}_{key}'), det[0].contract, r.what, r.rth))
                    continue
                by_local = {d.contract.localSymbol: d.contract for d in det}
                live = K.select_live(r, [K.detail_row(d) for d in det], today)
                for z in live:
                    cache[z['stem']] = dict(root=key, y=z['y'], m=z['m'], name=z['name'], local=z['local'], ltd=z['ltd'], conId=z['conId'], roll=str(z['roll']), seen=now.isoformat()[:10])
                pick = K.pull_set(r, live, today, full=a.all)
                print(f'{key}: live {" ".join(z["name"] for z in live)} -> pulling {" ".join(z["name"] for z in pick)}')
                for z in pick:
                    c = by_local[z['local']]
                    c.lastTradeDateOrContractMonth = c.lastTradeDateOrContractMonth.split(' ')[0]      # ICE lists 'yyyymmdd hh:mm:ss GB', which a data request refuses (error 10372)
                    jobs.append((z['name'], stem_of(z['name'], z['stem']), c, r.what, r.rth))
            if not a.dry_run:
                tmp = Path(str(CACHE) + '.tmp')
                tmp.write_text(json.dumps(cache, indent=1), encoding='utf-8')
                os.replace(tmp, CACHE)
        sat = (now + timedelta(days=(5 - now.weekday()) % 7)).replace(hour=0, minute=0, second=0, microsecond=0)
        print(f'{len(jobs)} contract(s): {" ".join(j[0] for j in jobs)}')
        if a.dry_run:
            for name, stem, c, *_ in jobs:
                print(f'  {name:<10} {stem:<26} {c.localSymbol} {c.lastTradeDateOrContractMonth}')
            ib.disconnect()
            print('dry run: nothing pulled or written')
            sys.exit(0)
        for name, stem, c, what, rth in jobs:
            p = SRC / f'{stem}.parquet'
            if a.days != 'auto':
                days = int(a.days)
            elif p.exists():
                newest = pd.to_datetime(pd.read_parquet(p, columns=['time']).time, utc=True).max()
                days = min(25, max(3, math.ceil((pd.Timestamp(now) - newest).total_seconds() / 86400) + 1))
            else:
                days = a.new_days      # a contract new to the disk: its older history comes from pull_deep_history.py (the backfill), not the 30-minute job
            got = 0
            for w in range(max(1, days // 7 + 1)):
                end = min(sat - timedelta(weeks=w), now)
                pace()
                ib.RequestTimeout = 0
                try:
                    bars = ib.reqHistoricalData(c, endDateTime=end, durationStr='1 W', barSizeSetting='1 min', whatToShow=what, useRTH=rth, formatDate=2, timeout=600)
                except Exception as e:
                    print(f'  {name} {end:%Y-%m-%d}: failed {e}')
                    continue
                if bars:
                    df = util.df(bars)
                    df.insert(0, 'time', pd.to_datetime(df.pop('date'), utc=True).dt.strftime('%Y-%m-%dT%H:%M:%SZ'))
                    merge(p, df)
                    got += len(df)
            pulled.append(name)
            print(f'{name}: +{got:,} bars merged ({stem})')
        ib.disconnect()
    subprocess.run([sys.executable, str(ROOT / 'scripts' / 'rates_line' / 'build_leg_bars.py')], check=True)
    if a.push:
        payload = {'asOf': now.isoformat(), 'legs': {}}
        for name in (pulled or legacy or CORE + BONDS + FEDFUNDS + MACRO):
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
