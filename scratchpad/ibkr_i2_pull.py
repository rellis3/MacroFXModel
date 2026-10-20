"""True ICE Euribor continuous I2! (second-nearest unexpired contract, rolled at expiry) for 2026-04-13 -> 2026-10-09, 1-min MIDPOINT.
Pulls each serial/quarterly month over the window in which it is the 2nd listed contract (+1 week padding).
Euribor last trading day = 2 business days before the 3rd Wednesday of the contract month.  -> analysis/output/stir_1m_i2/"""
import asyncio, time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
asyncio.set_event_loop(asyncio.new_event_loop())
import pandas as pd
from ib_insync import IB, Future, util
OUT = Path(__file__).resolve().parents[1] / "analysis" / "output" / "stir_1m_i2"; OUT.mkdir(parents=True, exist_ok=True)
def ltd(y, m):
    x = date(y, m, 1); w = [x + timedelta(i) for i in range(31) if (x + timedelta(i)).month == m and (x + timedelta(i)).weekday() == 2][2]; n = 0
    while n < 2:
        w -= timedelta(1); n += (w.weekday() < 5)
    return w
months = [(2026, m) for m in range(3, 13)]; exp = {mm: ltd(*mm) for mm in months}
START, END = date(2026, 4, 10), date(2026, 10, 10)
jobs = []
for i in range(2, len(months)):
    prev2, prev1, me = months[i - 2], months[i - 1], months[i]
    lo, hi = max(exp[prev2], START), min(exp[prev1], END)
    if lo < hi: jobs.append((me, lo - timedelta(days=7), min(hi + timedelta(days=7), END)))
print("jobs:", [(f"{m[0]}-{m[1]:02d}", str(a), str(b)) for m, a, b in jobs])
ib = IB(); ib.connect("127.0.0.1", int(__import__('os').environ.get('IB_PORT', 4002)), clientId=15, timeout=20, readonly=True); last = [0.0]
for (y, m), a, b in jobs:
    det = ib.reqContractDetails(Future(symbol="I", exchange="ICEEU", currency="EUR", lastTradeDateOrContractMonth=f"{y}{m:02d}", includeExpired=True))
    if not det: print(f"{y}-{m:02d}: not found"); continue
    c = det[0].contract; c.lastTradeDateOrContractMonth = c.lastTradeDateOrContractMonth.split(" ")[0]; parts = []
    end = datetime(b.year, b.month, b.day, tzinfo=timezone.utc); end += timedelta(days=(5 - end.weekday()) % 7)      # next Saturday 00:00 UTC
    while end - timedelta(weeks=1) > datetime(a.year, a.month, a.day, tzinfo=timezone.utc) - timedelta(days=1):
        w = 10.5 - (time.time() - last[0]); time.sleep(max(w, 0)); last[0] = time.time(); ib.RequestTimeout = 0
        try: bars = ib.reqHistoricalData(c, endDateTime=min(end, datetime.now(timezone.utc)), durationStr="1 W", barSizeSetting="1 min", whatToShow="MIDPOINT", useRTH=False, formatDate=2, timeout=600)
        except Exception as e: print("  fail", c.localSymbol, e); bars = None
        if bars: df = util.df(bars); df.insert(0, "time", pd.to_datetime(df.pop("date"), utc=True).dt.strftime("%Y-%m-%dT%H:%M:%SZ")); parts.append(df)
        end -= timedelta(weeks=1)
    if parts:
        df = pd.concat(parts).drop_duplicates("time").sort_values("time"); df.to_parquet(OUT / f"ICEEU_{c.localSymbol}.parquet", index=False)
        print(f"{c.localSymbol} ({c.lastTradeDateOrContractMonth}): {len(df):,} bars {df.time.iloc[0]} -> {df.time.iloc[-1]}", flush=True)
    else: print(f"{c.localSymbol}: no bars (expired history not served?)", flush=True)
ib.disconnect(); print("done")
