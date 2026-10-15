"""How far back does IBKR serve SOFR / Euribor history? 1-min and 15-min, live and expired contracts."""
import asyncio, time
from datetime import datetime, timezone
asyncio.set_event_loop(asyncio.new_event_loop())
from ib_insync import IB, Future
ib = IB(); ib.connect("127.0.0.1", 7497, clientId=21, timeout=20, readonly=True); last = [0.0]
def probe(label, sym, exch, ccy, month, exp, end, dur, bar, what="MIDPOINT"):
    det = ib.reqContractDetails(Future(symbol=sym, exchange=exch, currency=ccy, lastTradeDateOrContractMonth=month, includeExpired=exp))
    if not det: print(f"{label}: contract not found"); return
    c = det[0].contract; c.lastTradeDateOrContractMonth = c.lastTradeDateOrContractMonth.split(" ")[0]
    w = 10.5 - (time.time() - last[0]); time.sleep(max(w, 0)); last[0] = time.time(); ib.RequestTimeout = 0
    try: b = ib.reqHistoricalData(c, endDateTime=end, durationStr=dur, barSizeSetting=bar, whatToShow=what, useRTH=False, formatDate=2, timeout=300)
    except Exception as e: print(f"{label}: error {e}"); return
    print(f"{label}: {c.localSymbol} {bar} {dur} ending {end:%Y-%m-%d}: {len(b)} bars" + (f", {b[0].date} -> {b[-1].date}" if b else ""), flush=True)
U = lambda y, m, d: datetime(y, m, d, tzinfo=timezone.utc)
probe("1m  SR3U6 8 months back", "SOFR3", "CME", "USD", "202609", False, U(2026, 2, 7), "1 W", "1 min")
probe("1m  SR3U6 11 months back", "SOFR3", "CME", "USD", "202609", False, U(2025, 11, 1), "1 W", "1 min")
probe("1m  SR3U6 15 months back", "SOFR3", "CME", "USD", "202609", False, U(2025, 7, 5), "1 W", "1 min")
probe("1m  SR3M5 expired Sep25 (lived Jun-Sep 25)", "SOFR3", "CME", "USD", "202506", True, U(2025, 9, 13), "1 W", "1 min")
probe("15m SR3M5 expired", "SOFR3", "CME", "USD", "202506", True, U(2025, 9, 13), "3 M", "15 mins")
probe("15m IH5 Euribor expired Mar25", "I", "ICEEU", "EUR", "202503", True, U(2025, 3, 14), "6 M", "15 mins")
probe("15m SR3Z4 expired Dec24", "SOFR3", "CME", "USD", "202412", True, U(2024, 12, 13), "6 M", "15 mins")
ib.disconnect(); print("done")
