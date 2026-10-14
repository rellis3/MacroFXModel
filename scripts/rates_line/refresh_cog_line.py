"""Refresh the C.OG line from IBKR (laptop only: TWS / IB Gateway open, API on port 7497, paper account is fine), then rebuild analysis/output/cog_line/cog_line_15m.json.

    python scripts/rates_line/refresh_cog_line.py [--days 14] [--commit]

Pulls the last --days of 1-minute MIDPOINT bars for the two legs in force (scripts/rates_line/build_cog_line.py LEGS), in whole-week requests ending the next
Saturday 00:00 UTC (IBKR returns nothing for a Friday-evening end), merges them into analysis/output/stir_1m/, rebuilds the series, and with --commit pushes it so
Railway redeploys and /api/cog-line plus the Rates page serve it.  One request per leg per week of history, paced under IBKR's limit.
If TWS shows the paper-trading disclaimer, accept it first (the API refuses connections until you do)."""
import argparse, asyncio, subprocess, sys, time
from datetime import datetime, timedelta, timezone
from pathlib import Path
asyncio.set_event_loop(asyncio.new_event_loop())
import pandas as pd
from ib_insync import IB, Future, util
ROOT = Path(__file__).resolve().parents[2]; SRC = ROOT / 'analysis' / 'output' / 'stir_1m'; sys.path.insert(0, str(ROOT / 'scripts' / 'rates_line'))
from build_cog_line import LEGS
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
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--days', type=int, default=14); ap.add_argument('--commit', action='store_true'); a = ap.parse_args()
    now = datetime.now(timezone.utc); names = sorted({x for s in LEGS for x in (s['usd'], s['eur'])}); need = [n for n in names if n in IB_SPEC]
    ib = IB(); ib.connect('127.0.0.1', 7497, clientId=19, timeout=20, readonly=True)
    sat = (now + timedelta(days=(5 - now.weekday()) % 7)).replace(hour=0, minute=0, second=0, microsecond=0)
    for name in need:
        sym, exch, ccy, month = IB_SPEC[name]
        det = ib.reqContractDetails(Future(symbol=sym, exchange=exch, currency=ccy, lastTradeDateOrContractMonth=month))
        if not det: print(f'{name}: contract not found (expired or not listed)'); continue
        c = det[0].contract; c.lastTradeDateOrContractMonth = c.lastTradeDateOrContractMonth.split(' ')[0]
        if datetime.strptime(c.lastTradeDateOrContractMonth, '%Y%m%d').replace(tzinfo=timezone.utc) < now - timedelta(days=1): print(f'{name}: expired {c.lastTradeDateOrContractMonth}, skipping'); continue
        got = 0
        for w in range(max(1, a.days // 7 + 1)):
            end = min(sat - timedelta(weeks=w), now); pace(); ib.RequestTimeout = 0
            try: bars = ib.reqHistoricalData(c, endDateTime=end, durationStr='1 W', barSizeSetting='1 min', whatToShow='MIDPOINT', useRTH=False, formatDate=2, timeout=600)
            except Exception as e: print(f'  {name} {end:%Y-%m-%d}: failed {e}'); continue
            if bars:
                df = util.df(bars); df.insert(0, 'time', pd.to_datetime(df.pop('date'), utc=True).dt.strftime('%Y-%m-%dT%H:%M:%SZ')); merge(SRC / f'{name}.parquet', df); got += len(df)
        print(f'{name}: +{got:,} bars merged')
    ib.disconnect()
    subprocess.run([sys.executable, str(ROOT / 'scripts' / 'rates_line' / 'build_cog_line.py')], check=True)
    if a.commit:
        subprocess.run(['git', 'add', 'analysis/output/cog_line/cog_line_15m.json'], cwd=ROOT, check=True)
        subprocess.run(['git', 'commit', '-m', 'cog line: refresh from IBKR'], cwd=ROOT); subprocess.run(['git', 'pull', '--rebase', '--autostash'], cwd=ROOT); subprocess.run(['git', 'push'], cwd=ROOT)
