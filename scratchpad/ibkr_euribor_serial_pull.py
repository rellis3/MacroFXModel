"""Euribor serial months IV6 (Oct26) and IX6 (Nov26): I1!/I2! on 17-22 Sep 2026. 1-min MIDPOINT, 7-25 Sep. -> analysis/output/stir_1m/"""
import asyncio, time
from datetime import datetime, timezone
from pathlib import Path
asyncio.set_event_loop(asyncio.new_event_loop())
import pandas as pd
from ib_insync import IB, Future, util
OUT = Path(__file__).resolve().parents[1] / "analysis" / "output" / "stir_1m"
ib = IB(); ib.connect("127.0.0.1", 7497, clientId=14, timeout=20, readonly=True); last = [0.0]
for month in ("202610", "202611"):
    det = ib.reqContractDetails(Future(symbol="I", exchange="ICEEU", currency="EUR", lastTradeDateOrContractMonth=month))
    c = det[0].contract; c.lastTradeDateOrContractMonth = c.lastTradeDateOrContractMonth.split(" ")[0]; parts = []
    for end in (datetime(2026, 9, 19, tzinfo=timezone.utc), datetime(2026, 9, 26, tzinfo=timezone.utc)):
        w = 10.5 - (time.time() - last[0]); time.sleep(max(w, 0)); last[0] = time.time(); ib.RequestTimeout = 0
        b = ib.reqHistoricalData(c, endDateTime=end, durationStr="1 W", barSizeSetting="1 min", whatToShow="MIDPOINT", useRTH=False, formatDate=2, timeout=600)
        if b: df = util.df(b); df.insert(0, "time", pd.to_datetime(df.pop("date"), utc=True).dt.strftime("%Y-%m-%dT%H:%M:%SZ")); parts.append(df)
    if parts:
        df = pd.concat(parts).drop_duplicates("time").sort_values("time"); df.to_parquet(OUT / f"ICEEU_{c.localSymbol}.parquet", index=False)
        print(f"{c.localSymbol} ({c.lastTradeDateOrContractMonth}): {len(df):,} bars {df.time.iloc[0]} -> {df.time.iloc[-1]} last {df.close.iloc[-1]}")
ib.disconnect(); print("done")
