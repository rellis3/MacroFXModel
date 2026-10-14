"""Refresh the C.OG line from IBKR (laptop: TWS / IB Gateway open and logged in, API on port 7497, paper account is fine), rebuild
analysis/output/cog_line/cog_line_15m.json and PUSH the latest bars to the server (KV cog_line_live_v1) so /api/cog-line and the Rates page are current without a redeploy.

    python scripts/rates_line/refresh_cog_line.py [--days auto|N] [--push] [--commit]

--days auto   (default) works out how far back to pull from the newest bar already on disk, so a run after the laptop was off or asleep CATCHES UP the gap
              (IBKR serves 1-minute history, so nothing is lost while TWS is closed; capped at 25 days).
--push        POST the last --push-days (default 5) of bars to {base}/api/kv/set, the same route the fed-funds feed (fedwatch/pull_zq_path.py) uses.
--commit      also commit the rebuilt file so a fresh deploy starts from it (optional; a redeploy is what this avoids).

If TWS is closed or not logged in the script says so and exits 2 WITHOUT touching anything: a stale file is never published as current.
Pulls whole-week requests ending the next Saturday 00:00 UTC (IBKR returns nothing for a Friday-evening end). Paced under IBKR's request limit.
If TWS shows the paper-trading disclaimer, accept it first (the API refuses connections until you do). Schedule it with scripts/rates_line/run_cog_line.bat."""
import argparse, asyncio, json, math, subprocess, sys, time, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
asyncio.set_event_loop(asyncio.new_event_loop())
import pandas as pd
from ib_insync import IB, Future, util
ROOT = Path(__file__).resolve().parents[2]; SRC = ROOT / 'analysis' / 'output' / 'stir_1m'; SERIES = ROOT / 'analysis' / 'output' / 'cog_line' / 'cog_line_15m.json'
sys.path.insert(0, str(ROOT / 'scripts' / 'rates_line'))
from build_cog_line import LEGS
BASE = 'https://macrofxmodel-production.up.railway.app'; KV_KEY = 'cog_line_live_v1'
# IBKR lookup per file: (symbol, exchange, currency, contract-month parameter)
IB_SPEC = {'CME_SR3U6': ('SOFR3', 'CME', 'USD', '202609'), 'CME_SR3Z6': ('SOFR3', 'CME', 'USD', '202612'),
           'ICEEU_IH7': ('I', 'ICEEU', 'EUR', '202703'), 'ICEEU_IM7': ('I', 'ICEEU', 'EUR', '202706')}
last = [0.0]
def pace():
    w = 10.5 - (time.time() - last[0]); time.sleep(max(w, 0)); last[0] = time.time()
def merge(path, df):
    if path.exists():
        old = pd.read_parquet(path); df = pd.concat([old, df], ignore_index=True).drop_duplicates('time', keep='last')
    df.sort_values('time').reset_index(drop=True).to_parquet(path, index=False)
def newest_bar(names):
    t = None
    for n in names:
        p = SRC / f'{n}.parquet'
        if p.exists():
            x = pd.to_datetime(pd.read_parquet(p, columns=['time']).time, utc=True).max(); t = x if t is None or x < t else t       # the OLDER of the legs: both must be current
    return t
def kv_set(obj):
    body = json.dumps({'key': KV_KEY, 'data': obj, 'timestamp': int(datetime.now(timezone.utc).timestamp() * 1000)}).encode()
    req = urllib.request.Request(f'{BASE}/api/kv/set', data=body, headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=60) as r: return r.getcode(), r.read().decode()[:160]
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--days', default='auto'); ap.add_argument('--push', action='store_true'); ap.add_argument('--push-days', type=int, default=5)
    ap.add_argument('--commit', action='store_true'); a = ap.parse_args()
    now = datetime.now(timezone.utc); names = sorted({x for s in LEGS for x in (s['usd'], s['eur'])}); need = [n for n in names if n in IB_SPEC]
    if a.days == 'auto':
        nb = newest_bar(need); days = 3 if nb is None else min(25, max(3, math.ceil((pd.Timestamp(now) - nb).total_seconds() / 86400) + 1))
    else: days = int(a.days)
    ib = IB()
    try: ib.connect('127.0.0.1', 7497, clientId=19, timeout=20, readonly=True)
    except Exception as e:
        print(f'Could not connect to TWS / IB Gateway on port 7497 ({type(e).__name__}). Open and log in (accept the paper-trading disclaimer), then run again. Nothing was changed.'); sys.exit(2)
    sat = (now + timedelta(days=(5 - now.weekday()) % 7)).replace(hour=0, minute=0, second=0, microsecond=0)
    print(f'pulling the last {days} day(s) for {need}')
    for name in need:
        sym, exch, ccy, month = IB_SPEC[name]
        det = ib.reqContractDetails(Future(symbol=sym, exchange=exch, currency=ccy, lastTradeDateOrContractMonth=month))
        if not det: print(f'{name}: contract not found (expired or not listed)'); continue
        c = det[0].contract; c.lastTradeDateOrContractMonth = c.lastTradeDateOrContractMonth.split(' ')[0]
        if datetime.strptime(c.lastTradeDateOrContractMonth, '%Y%m%d').replace(tzinfo=timezone.utc) < now - timedelta(days=1): print(f'{name}: expired {c.lastTradeDateOrContractMonth}, skipping'); continue
        got = 0
        for w in range(max(1, days // 7 + 1)):
            end = min(sat - timedelta(weeks=w), now); pace(); ib.RequestTimeout = 0
            try: bars = ib.reqHistoricalData(c, endDateTime=end, durationStr='1 W', barSizeSetting='1 min', whatToShow='MIDPOINT', useRTH=False, formatDate=2, timeout=600)
            except Exception as e: print(f'  {name} {end:%Y-%m-%d}: failed {e}'); continue
            if bars:
                df = util.df(bars); df.insert(0, 'time', pd.to_datetime(df.pop('date'), utc=True).dt.strftime('%Y-%m-%dT%H:%M:%SZ')); merge(SRC / f'{name}.parquet', df); got += len(df)
        print(f'{name}: +{got:,} bars merged')
    ib.disconnect()
    subprocess.run([sys.executable, str(ROOT / 'scripts' / 'rates_line' / 'build_cog_line.py')], check=True)
    if a.push:
        d = json.loads(SERIES.read_text(encoding='utf-8')); n = a.push_days * 96; i0 = max(0, len(d['bp']) - n)
        inc = dict(t0=d['t0'] + i0 * d['step'], step=d['step'], bp=d['bp'][i0:], asOf=d['asOf'], pushedAt=now.isoformat())
        code, resp = kv_set(inc); print(f'POST /api/kv/set {KV_KEY} ({len(inc["bp"])} bars, as of {d["asOf"]}) -> HTTP {code} {resp}')
    if a.commit:
        subprocess.run(['git', 'add', 'analysis/output/cog_line/cog_line_15m.json'], cwd=ROOT, check=True)
        subprocess.run(['git', 'commit', '-m', 'cog line: refresh from IBKR'], cwd=ROOT); subprocess.run(['git', 'pull', '--rebase', '--autostash'], cwd=ROOT); subprocess.run(['git', 'push'], cwd=ROOT)
