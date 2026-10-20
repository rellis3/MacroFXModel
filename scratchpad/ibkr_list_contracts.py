import asyncio; asyncio.set_event_loop(asyncio.new_event_loop())
from ib_insync import IB, Future
ib = IB(); ib.connect("127.0.0.1", int(__import__('os').environ.get('IB_PORT', 4002)), clientId=13, timeout=15, readonly=True)
for sym, exch, ccy in (("I", "ICEEU", "EUR"), ("ER3", "ICEEU", "EUR"), ("SOFR3", "CME", "USD")):
    det = ib.reqContractDetails(Future(symbol=sym, exchange=exch, currency=ccy))
    ms = sorted({(d.contract.lastTradeDateOrContractMonth.split(" ")[0], d.contract.localSymbol) for d in det})
    print(f"{sym}@{exch}: {len(ms)} listed ->", ", ".join(f"{l}({m})" for m, l in ms[:14]))
ib.disconnect()
