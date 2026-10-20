"""TRADES (last-traded) 1-min bars for C.OG's two legs over the video week: Euribor Nov26 (IX6, = I2!) and SOFR Sep26 (SR3U6), 7-25 Sep 2026.
TradingView plots trades; our other files are MIDPOINT.  -> analysis/output/stir_1m_trades/"""
import asyncio, time
from datetime import datetime, timezone
from pathlib import Path
asyncio.set_event_loop(asyncio.new_event_loop())
import pandas as pd
from ib_insync import IB, Future, util
OUT = Path(__file__).resolve().parents[1] / "analysis" / "output" / "stir_1m_trades"; OUT.mkdir(parents=True, exist_ok=True)
ib = IB(); ib.connect("127.0.0.1", int(__import__('os').environ.get('IB_PORT', 4002)), clientId=16, timeout=20, readonly=True); last = [0.0]
for sym, exch, ccy, month in (("I", "ICEEU", "EUR", "202611"), ("SOFR3", "CME", "USD", "202609"), ("I", "ICEEU", "EUR", "202610")):
    det = ib.reqContractDetails(Future(symbol=sym, exchange=exch, currency=ccy, lastTradeDateOrContractMonth=month)); c = det[0].contract
    c.lastTradeDateOrContractMonth = c.lastTradeDateOrContractMonth.split(" ")[0]; parts = []
    for end in (datetime(2026, 9, 19, tzinfo=timezone.utc), datetime(2026, 9, 26, tzinfo=timezone.utc)):
        w = 10.5 - (time.time() - last[0]); time.sleep(max(w, 0)); last[0] = time.time(); ib.RequestTimeout = 0
        b = ib.reqHistoricalData(c, endDateTime=end, durationStr="1 W", barSizeSetting="1 min", whatToShow="TRADES", useRTH=False, formatDate=2, timeout=600)
        if b: df = util.df(b); df.insert(0, "time", pd.to_datetime(df.pop("date"), utc=True).dt.strftime("%Y-%m-%dT%H:%M:%SZ")); parts.append(df)
    if parts:
        df = pd.concat(parts).drop_duplicates("time").sort_values("time"); df.to_parquet(OUT / f"{exch}_{c.localSymbol}.parquet", index=False)
        print(f"{c.localSymbol}: {len(df):,} trade bars, median volume {df.volume.median():.0f}, bars with volume>0: {(df.volume>0).mean():.0%}", flush=True)
ib.disconnect(); print("done")
