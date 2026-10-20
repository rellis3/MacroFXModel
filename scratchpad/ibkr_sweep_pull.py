"""Extra legs for the full indicator-parameter sweep (video week 7-25 Sep 2026, 1-min): SOFR N6 Q6 V6 X6 (serial months: SR31!/SR32! candidates)
and Euribor F7 G7. MIDPOINT and TRADES.  -> analysis/output/stir_1m_sweep/{mid,trd}/"""
import asyncio, time
from datetime import datetime, timezone
from pathlib import Path
asyncio.set_event_loop(asyncio.new_event_loop())
import pandas as pd
from ib_insync import IB, Future, util
ROOT = Path(__file__).resolve().parents[1] / "analysis" / "output" / "stir_1m_sweep"
for k in ("mid", "trd"): (ROOT / k).mkdir(parents=True, exist_ok=True)
SPECS = [("SOFR3", "CME", "USD", m) for m in ("202607", "202608", "202610", "202611")] + [("I", "ICEEU", "EUR", m) for m in ("202701", "202702")]
ib = IB(); ib.connect("127.0.0.1", int(__import__('os').environ.get('IB_PORT', 4002)), clientId=17, timeout=20, readonly=True); last = [0.0]
for sym, exch, ccy, month in SPECS:
    det = ib.reqContractDetails(Future(symbol=sym, exchange=exch, currency=ccy, lastTradeDateOrContractMonth=month))
    if not det: print(sym, month, "not found", flush=True); continue
    c = det[0].contract; c.lastTradeDateOrContractMonth = c.lastTradeDateOrContractMonth.split(" ")[0]
    for what, tag in (("MIDPOINT", "mid"), ("TRADES", "trd")):
        parts = []
        for end in (datetime(2026, 9, 19, tzinfo=timezone.utc), datetime(2026, 9, 26, tzinfo=timezone.utc)):
            w = 10.5 - (time.time() - last[0]); time.sleep(max(w, 0)); last[0] = time.time(); ib.RequestTimeout = 0
            try: b = ib.reqHistoricalData(c, endDateTime=end, durationStr="1 W", barSizeSetting="1 min", whatToShow=what, useRTH=False, formatDate=2, timeout=600)
            except Exception as e: print(" fail", c.localSymbol, what, e, flush=True); b = None
            if b: df = util.df(b); df.insert(0, "time", pd.to_datetime(df.pop("date"), utc=True).dt.strftime("%Y-%m-%dT%H:%M:%SZ")); parts.append(df)
        if parts:
            df = pd.concat(parts).drop_duplicates("time").sort_values("time"); df.to_parquet(ROOT / tag / f"{exch}_{c.localSymbol}.parquet", index=False)
            print(f"{c.localSymbol} {what}: {len(df):,} bars last {df.close.iloc[-1]}", flush=True)
ib.disconnect(); print("done", flush=True)
