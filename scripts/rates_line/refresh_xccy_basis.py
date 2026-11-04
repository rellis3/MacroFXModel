"""Cross-currency basis inputs from IBKR: the front CME FX futures (6E, 6B, 6J, 6S) and spot, pushed to the server
(KV xccy_basis_v1). The server computes the basis with today's overnight rates exactly as scripts/xccy-basis/build.py
does (js/marketBoards.js xccyBasis) and shows it on the Desk Terminal (/api/xccy-basis). Plan §9ag.

Laptop: IB Gateway open and logged in, API on port 4002 (override with env IB_PORT). Needs CME market data for the FX
futures and IDEALPRO for spot.

    python scripts/rates_line/refresh_xccy_basis.py            # print what it would push
    python scripts/rates_line/refresh_xccy_basis.py --push     # ... and POST it to {base}/api/kv/set

Per currency: the nearest quarterly contract with at least 25 days from the spot value date (today + 2 business days)
to delivery (the third Wednesday of the contract month), its last 1-hour close, and spot's 1-hour close at the same
bar. 6J and 6S quote USD per JPY/CHF, so USDJPY and USDCHF spot are inverted. Schedule it once a day after 19:00 UK
(e.g. alongside run_cb_expectations.bat). If TWS is not reachable it says so and exits 2 without touching anything."""
import argparse
import asyncio
import json
import os
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta, timezone
asyncio.set_event_loop(asyncio.new_event_loop())

BASE = 'https://macrofxmodel-production.up.railway.app'
KV_KEY = 'xccy_basis_v1'
IB_PORT = int(os.environ.get('IB_PORT', 4002))
MIN_T = 25
LEGS = {'EUR': ('EUR', 'EURUSD', False), 'GBP': ('GBP', 'GBPUSD', False), 'JPY': ('JPY', 'USDJPY', True), 'CHF': ('CHF', 'USDCHF', True)}


def third_wed(y, m):
    d = date(y, m, 1)
    return d + timedelta(days=(2 - d.weekday()) % 7 + 14)


def add_bdays(d, n):
    while n:
        d += timedelta(days=1)
        if d.weekday() < 5:
            n -= 1
    return d


def last_close(ib, c, what):
    for w in (what, 'MIDPOINT', 'TRADES'):
        try:
            bars = ib.reqHistoricalData(c, endDateTime='', durationStr='2 D', barSizeSetting='1 hour', whatToShow=w, useRTH=False, formatDate=2, timeout=60)
        except Exception as e:
            print(f'  {getattr(c, "localSymbol", c.symbol)} {w}: {type(e).__name__} {e}')
            continue
        b = [x for x in bars or [] if x.close and x.close > 0]
        if b:
            return {x.date: x.close for x in b}
        time.sleep(10.5)
    return {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--push', action='store_true')
    a = ap.parse_args()
    from ib_insync import IB, Future, Forex
    ib = IB()
    try:
        ib.connect('127.0.0.1', IB_PORT, clientId=24, timeout=20, readonly=True)
    except Exception as e:
        print(f'Could not connect to IB Gateway on port {IB_PORT} ({type(e).__name__}). Open and log in, then run again. Nothing was changed.')
        sys.exit(2)
    today = datetime.now(timezone.utc).date()
    value = add_bdays(today, 2)
    legs, errors = {}, {}
    for ccy, (sym, spot_pair, invert) in LEGS.items():
        try:
            det = ib.reqContractDetails(Future(symbol=sym, exchange='CME', currency='USD'))
            best = None
            for d in det:
                ym = d.contract.lastTradeDateOrContractMonth[:6]
                y, m = int(ym[:4]), int(ym[4:6])
                if m not in (3, 6, 9, 12):
                    continue
                dlv = third_wed(y, m)
                t = (dlv - value).days
                if t >= MIN_T and (best is None or dlv < best[1]):
                    best = (d.contract, dlv, t)
            if not best:
                errors[ccy] = 'no quarterly contract with >= 25 days'
                continue
            fut, dlv, t = best
            fc = last_close(ib, fut, 'TRADES')
            time.sleep(10.5)
            sc = last_close(ib, Forex(spot_pair), 'MIDPOINT')
            time.sleep(10.5)
            common = sorted(set(fc) & set(sc))
            if not common:
                errors[ccy] = 'no common bar between the future and spot'
                continue
            at = common[-1]
            s = sc[at]
            legs[ccy] = {'F': fc[at], 'S': (1 / s) if invert else s, 't': t, 'contract': dlv.strftime('%Y-%m'), 'bar': str(at), 'spotQuoted': s}
            print(f'{ccy}: {fut.localSymbol} F {fc[at]} S {legs[ccy]["S"]:.6f} t {t}d at {at}')
        except Exception as e:
            errors[ccy] = f'{type(e).__name__}: {e}'
            print(f'{ccy}: {errors[ccy]}')
    ib.disconnect()
    payload = {'asOf': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'source': 'IBKR CME FX futures + IDEALPRO spot (scripts/rates_line/refresh_xccy_basis.py)', 'legs': legs, 'errors': errors}
    print(json.dumps(payload, indent=1))
    if a.push:
        if not legs:
            print('nothing to push')
            sys.exit(1)
        body = json.dumps({'key': KV_KEY, 'data': payload, 'timestamp': int(time.time() * 1000)}).encode()
        req = urllib.request.Request(f'{BASE}/api/kv/set', data=body, headers={'Content-Type': 'application/json'}, method='POST')
        with urllib.request.urlopen(req, timeout=30) as r:
            print(f'POST /api/kv/set {KV_KEY} -> HTTP {r.status}')


if __name__ == '__main__':
    main()
