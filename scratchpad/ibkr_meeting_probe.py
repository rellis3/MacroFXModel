import asyncio; asyncio.set_event_loop(asyncio.new_event_loop())
from ib_insync import IB, Future
ib = IB(); ib.connect("127.0.0.1", 7497, clientId=41, timeout=20, readonly=True)
tests = [("ZQ","CBOT","USD"),("ZQ","ECBOT","USD"),("FF","CBOT","USD"),("FST1","EUREX","EUR"),("FESR","EUREX","EUR"),("ESTR","EUREX","EUR"),("FST3","EUREX","EUR"),("ER1","ICEEU","EUR"),("ESR","ICEEU","EUR"),("SO3","ICEEU","GBP"),("SR1","CME","USD"),("SOFR1","CME","USD")]
for sym, exch, ccy in tests:
    try:
        det = ib.reqContractDetails(Future(symbol=sym, exchange=exch, currency=ccy))
        ms = sorted({(d.contract.lastTradeDateOrContractMonth.split(" ")[0], d.contract.localSymbol, d.longName) for d in det})
        print(f"{sym}@{exch}: {len(ms)} ->", "; ".join(f"{l}({m}) {n[:30]}" for m, l, n in ms[:8]), flush=True)
    except Exception as e: print(sym, exch, 'ERR', e, flush=True)
ib.disconnect()
