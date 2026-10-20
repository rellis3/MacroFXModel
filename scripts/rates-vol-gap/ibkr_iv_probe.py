"""Probe: does IBKR serve daily OPTION_IMPLIED_VOLATILITY / HISTORICAL_VOLATILITY history
on rates/index futures? (rates-vol-gap). Read-only; clientId 77 so it never collides with the
scheduled leg refresh (19/21). Paper IB Gateway 4002 by default (TWS paper 7497 via IB_PORT).

    .venv/Scripts/python.exe scripts/rates-vol-gap/ibkr_iv_probe.py

Writes one CSV per (contract, whatToShow) that returned rows to
analysis/output/rates-vol-gap/ibkr_iv/, and prints a summary line per request.
"""
import asyncio, os, sys
from pathlib import Path
asyncio.set_event_loop(asyncio.new_event_loop())   # Python 3.14: eventkit needs a loop at import
from ib_insync import IB, Future, Stock, util

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'analysis' / 'output' / 'rates-vol-gap' / 'ibkr_iv'
IB_PORT = int(os.environ.get('IB_PORT', 4002))

TARGETS = {
    'SR3Z6': Future(symbol='SOFR3', exchange='CME', currency='USD', lastTradeDateOrContractMonth='202612'),
    'ZNZ6': Future(symbol='ZN', exchange='CBOT', currency='USD', lastTradeDateOrContractMonth='202612'),
    'NQZ6': Future(symbol='NQ', exchange='CME', currency='USD', lastTradeDateOrContractMonth='202612'),
    'QQQ': Stock('QQQ', 'SMART', 'USD'),
}
WHAT = ['OPTION_IMPLIED_VOLATILITY', 'HISTORICAL_VOLATILITY']


def main():
    ib = IB(); errs = []
    ib.errorEvent += lambda reqId, code, msg, c: errs.append((code, msg))
    try: ib.connect('127.0.0.1', IB_PORT, clientId=77, timeout=20, readonly=True)
    except Exception as e:
        print(f'cannot connect on {IB_PORT}: {type(e).__name__} {e}'); sys.exit(2)
    OUT.mkdir(parents=True, exist_ok=True)
    for name, c in TARGETS.items():
        q = ib.qualifyContracts(c)
        if not q: print(f'{name}: contract did not qualify {errs[-1:]}'); continue
        c = q[0]
        for w in WHAT:
            errs.clear()
            try:
                bars = ib.reqHistoricalData(c, endDateTime='', durationStr='1 Y', barSizeSetting='1 day',
                                            whatToShow=w, useRTH=True, formatDate=1, timeout=60)
            except Exception as e:
                print(f'{name} {w}: exception {type(e).__name__} {e}'); continue
            if not bars:
                print(f'{name} {w}: 0 rows; errors={errs}'); continue
            df = util.df(bars)
            df.to_csv(OUT / f'{name}_{w}.csv', index=False)
            print(f'{name} {w}: {len(df)} rows {df.date.iloc[0]} -> {df.date.iloc[-1]}; '
                  f'last close {df.close.iloc[-1]:.4f}; first close {df.close.iloc[0]:.4f}; errors={errs}')
    ib.disconnect()


if __name__ == '__main__':
    main()
