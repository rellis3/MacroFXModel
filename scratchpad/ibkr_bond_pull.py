"""Bond futures 1-min MIDPOINT for the C.OG line identification (analysis/output/cog_video_0918/RECONSTRUCTION.md):
Bund (GBL), Bobl (GBM), Buxl (GBX) Dec26 @EUREX; ZN, ZF, ZB, UB Dec26 @CBOT. Two 1-week requests each ending Sat 00:00 UTC
19 Sep and 26 Sep 2026 (covers 7-25 Sep). Writes analysis/output/stir_1m_bonds/<EXCH>_<local>.parquet.
    python scratchpad/ibkr_bond_pull.py      (IB Gateway open, port 4002)"""
import asyncio, sys, time
from datetime import datetime, timezone
from pathlib import Path
asyncio.set_event_loop(asyncio.new_event_loop())
import pandas as pd
from ib_insync import IB, Future, util
OUT = Path(__file__).resolve().parents[1] / "analysis" / "output" / "stir_1m_bonds"; OUT.mkdir(parents=True, exist_ok=True)
SPECS = [("GBL", "EUREX", "EUR"), ("GBM", "EUREX", "EUR"), ("GBX", "EUREX", "EUR"), ("ZN", "CBOT", "USD"), ("ZF", "CBOT", "USD"), ("ZB", "CBOT", "USD"), ("UB", "CBOT", "USD")]
ENDS = [datetime(2026, 9, 19, tzinfo=timezone.utc), datetime(2026, 9, 26, tzinfo=timezone.utc)]
ib = IB(); ib.connect("127.0.0.1", int(__import__('os').environ.get('IB_PORT', 4002)), clientId=12, timeout=20, readonly=True)
last = [0.0]
def pace():
    w = 10.5 - (time.time() - last[0]);
    if w > 0: time.sleep(w)
    last[0] = time.time()
for sym, exch, ccy in SPECS:
    det = ib.reqContractDetails(Future(symbol=sym, exchange=exch, currency=ccy, lastTradeDateOrContractMonth="202612"))
    if not det: print(sym, "not found"); continue
    c = det[0].contract; parts = []
    for end in ENDS:
        pace(); ib.RequestTimeout = 0
        try: b = ib.reqHistoricalData(c, endDateTime=end, durationStr="1 W", barSizeSetting="1 min", whatToShow="MIDPOINT", useRTH=False, formatDate=2, timeout=600)
        except Exception as e: print(" ", c.localSymbol, end.date(), "failed", e); continue
        if b: df = util.df(b); df.insert(0, "time", pd.to_datetime(df.pop("date"), utc=True).dt.strftime("%Y-%m-%dT%H:%M:%SZ")); parts.append(df)
    if parts:
        df = pd.concat(parts).drop_duplicates("time").sort_values("time"); p = OUT / f"{exch}_{c.localSymbol.replace(' ', '_')}.parquet"; df.to_parquet(p, index=False)
        print(f"  {c.localSymbol}: {len(df):,} bars {df.time.iloc[0]} -> {df.time.iloc[-1]} last {df.close.iloc[-1]}")
ib.disconnect(); print("done")
