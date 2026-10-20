"""Deep 1-minute history for the period-matched pair candidates (SOFR Mar27 SR3H7, SOFR Dec26 SR3Z6, Euribor Dec26 IZ6, ESTR3M Dec26/Mar27 ER3Z6/ER3H7), same method as ibkr_deep_pull.py. (Original: C.OG pair: SOFR Sep26 (CME SR3U6) and Euribor Mar27 (ICE IH7), both still live, so IBKR serves their history back to listing.
Whole-week MIDPOINT requests ending Saturday 00:00 UTC, newest first, resumable (weeks already on disk are skipped), reconnects if TWS drops, stops after 6 empty weeks in a row
(= before the contract existed). Output analysis/output/stir_1m_deep/<EXCH>_<LOCAL>.parquet. Pacing 10.5 s per request: about 45 min for ~2.5 years of both legs.
    python scratchpad/ibkr_deep_pull.py [--max-weeks 130]"""
import argparse, asyncio, time
from datetime import datetime, timedelta, timezone
from pathlib import Path
asyncio.set_event_loop(asyncio.new_event_loop())
import pandas as pd
from ib_insync import IB, Future, util
OUT = Path(__file__).resolve().parents[1] / 'analysis' / 'output' / 'stir_1m_deep'; OUT.mkdir(parents=True, exist_ok=True)
SPECS = [('SOFR3', 'CME', 'USD', '202703'), ('SOFR3', 'CME', 'USD', '202612'), ('I', 'ICEEU', 'EUR', '202612'), ('ER3', 'ICEEU', 'EUR', '202612'), ('ER3', 'ICEEU', 'EUR', '202703')]
ib = IB(); cid = [70]; last = [0.0]
def conn():
    for _ in range(60):
        if ib.isConnected(): return
        cid[0] += 1
        try: ib.connect('127.0.0.1', int(__import__('os').environ.get('IB_PORT', 4002)), clientId=cid[0], timeout=20, readonly=True); return
        except Exception: time.sleep(30)
    raise SystemExit('TWS not reachable for 30 minutes; run again when it is open')
def pace():
    w = 10.5 - (time.time() - last[0]); time.sleep(max(w, 0)); last[0] = time.time()
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--max-weeks', type=int, default=130); a = ap.parse_args()
    now = datetime.now(timezone.utc); sat = (now + timedelta(days=(5 - now.weekday()) % 7)).replace(hour=0, minute=0, second=0, microsecond=0)
    if sat > now: sat -= timedelta(weeks=1)
    for sym, exch, ccy, month in SPECS:
        conn(); c = ib.reqContractDetails(Future(symbol=sym, exchange=exch, currency=ccy, lastTradeDateOrContractMonth=month))[0].contract; c.lastTradeDateOrContractMonth = c.lastTradeDateOrContractMonth.split(' ')[0]
        path = OUT / f'{exch}_{c.localSymbol}.parquet'; have = set()
        if path.exists(): have = set(pd.to_datetime(pd.read_parquet(path, columns=['time']).time).dt.strftime('%G-%V'))
        empty = 0; got = 0
        for w in range(a.max_weeks):
            end = sat - timedelta(weeks=w); wk = (end - timedelta(days=3)).strftime('%G-%V')
            if wk in have: continue
            conn(); pace(); ib.RequestTimeout = 0
            try: bars = ib.reqHistoricalData(c, endDateTime=end, durationStr='1 W', barSizeSetting='1 min', whatToShow='MIDPOINT', useRTH=False, formatDate=2, timeout=300)
            except Exception as e: print(f'  {c.localSymbol} {end:%Y-%m-%d}: {type(e).__name__} {e}', flush=True); bars = None
            if not bars:
                empty += 1
                if empty >= 6: print(f'{c.localSymbol}: 6 empty weeks in a row at {end:%Y-%m-%d}; stopping (listing date reached or no data)', flush=True); break
                continue
            empty = 0; df = util.df(bars); df.insert(0, 'time', pd.to_datetime(df.pop('date'), utc=True).dt.strftime('%Y-%m-%dT%H:%M:%SZ'))
            if path.exists(): df = pd.concat([pd.read_parquet(path), df], ignore_index=True).drop_duplicates('time', keep='last')
            df.sort_values('time').reset_index(drop=True).to_parquet(path, index=False); got += len(bars); have.add(wk)
            if w % 8 == 0: print(f'{c.localSymbol}: {end:%Y-%m-%d} done, {got:,} new bars so far', flush=True)
        n = len(pd.read_parquet(path, columns=['time'])) if path.exists() else 0; t = pd.to_datetime(pd.read_parquet(path, columns=['time']).time) if n else None
        print(f'{c.localSymbol} -> {path.name}: {n:,} bars' + (f' {t.min():%Y-%m-%d} -> {t.max():%Y-%m-%d}' if n else ''), flush=True)
    ib.disconnect(); print('done', flush=True)
