"""Contract details (symbol, contract month, last trade date) for every contract in COG-MATCHED-PAIRS -> analysis/output/stir_1m_deep/contract_details.json"""
import asyncio, json; asyncio.set_event_loop(asyncio.new_event_loop())
from pathlib import Path
from ib_insync import IB, Future
ROOT = Path(__file__).resolve().parents[1]
SPECS = [('SOFR3','CME','USD','202609'),('SOFR3','CME','USD','202612'),('SOFR3','CME','USD','202703'),('I','ICEEU','EUR','202703'),('I','ICEEU','EUR','202612'),('ER3','ICEEU','EUR','202612'),('ER3','ICEEU','EUR','202703')]
ib = IB(); ib.connect('127.0.0.1', int(__import__('os').environ.get('IB_PORT', 4002)), clientId=91, timeout=30, readonly=True); out = []
for sym, exch, ccy, month in SPECS:
    det = ib.reqContractDetails(Future(symbol=sym, exchange=exch, currency=ccy, lastTradeDateOrContractMonth=month))
    for d in det[:1]:
        c = d.contract; out.append(dict(requested=f'{sym}@{exch} {month}', localSymbol=c.localSymbol, symbol=c.symbol, exchange=c.exchange, currency=c.currency, contractMonth=d.contractMonth, lastTradeDateOrContractMonth=c.lastTradeDateOrContractMonth, realExpirationDate=getattr(d, 'realExpirationDate', ''), multiplier=c.multiplier, longName=d.longName, timeZoneId=d.timeZoneId, tradingHours=d.tradingHours[:240], liquidHours=d.liquidHours[:240]))
        print(out[-1]['localSymbol'], out[-1]['contractMonth'], out[-1]['lastTradeDateOrContractMonth'], out[-1]['realExpirationDate'], out[-1]['longName'], out[-1]['timeZoneId'], flush=True)
ib.disconnect(); (ROOT / 'analysis' / 'output' / 'stir_1m_deep' / 'contract_details.json').write_text(json.dumps(out, indent=1), encoding='utf-8')
