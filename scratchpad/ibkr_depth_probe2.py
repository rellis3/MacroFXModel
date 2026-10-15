import asyncio, time
from datetime import datetime, timezone
asyncio.set_event_loop(asyncio.new_event_loop())
from ib_insync import IB, Future
ib = IB(); cid = [23]
def conn():
    if not ib.isConnected():
        cid[0] += 1; ib.connect("127.0.0.1", 7497, clientId=cid[0], timeout=20, readonly=True)
conn(); last = [0.0]
U = lambda y, m, d: datetime(y, m, d, tzinfo=timezone.utc)
def get(sym, exch, ccy, month):
    conn()
    c = ib.reqContractDetails(Future(symbol=sym, exchange=exch, currency=ccy, lastTradeDateOrContractMonth=month))[0].contract; c.lastTradeDateOrContractMonth = c.lastTradeDateOrContractMonth.split(" ")[0]; return c
def probe(c, end, what):
    conn()
    w = 10.5 - (time.time() - last[0]); time.sleep(max(w, 0)); last[0] = time.time(); ib.RequestTimeout = 0
    try: b = ib.reqHistoricalData(c, endDateTime=end, durationStr="1 W", barSizeSetting="1 min", whatToShow=what, useRTH=False, formatDate=2, timeout=300)
    except Exception as e: return f"error {e}"
    if not b: return "0 bars"
    tr = sum(1 for x in b if getattr(x, 'volume', 0) and x.volume > 0)
    chg = sum(1 for i in range(1, len(b)) if b[i].close != b[i - 1].close)
    return f"{len(b)} bars, {chg} price changes" + (f", {tr} with trades" if what == "TRADES" else "")
for name, c in (("SR3U6 (SOFR Sep26)", get("SOFR3", "CME", "USD", "202609")), ("IH7 (Euribor Mar27)", get("I", "ICEEU", "EUR", "202703"))):
    for end in (U(2025, 7, 5), U(2025, 1, 10), U(2024, 7, 5), U(2024, 1, 5), U(2023, 7, 7)):
        print(f"{name} week ending {end:%Y-%m-%d}: MIDPOINT {probe(c, end, 'MIDPOINT')}", flush=True)
ib.disconnect(); print("done")
