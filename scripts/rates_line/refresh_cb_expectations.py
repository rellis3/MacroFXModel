"""Rate expectations for every central bank the desk covers, from short-rate futures in IBKR, pushed to the server (KV cb_rate_futures_v1) for the
Desk Terminal's Macro tab (/api/cb-expectations, js/cbExpectations.js). The Fed's per-meeting path stays with the ZQ pull (zq_path_v1); this adds the rest.

Laptop: IB Gateway open and logged in, API on port 4002 (paper; override with env IB_PORT). Market-data subscriptions for ICE Futures Europe (SONIA, €STR,
SARON), Montreal (CORRA) and ASX 24 (AU/NZ) are needed for live prices; without one IBKR returns no bars and the script says which.

    python scripts/rates_line/refresh_cb_expectations.py --discover     # which contracts IBKR knows for each candidate symbol (no prices, no push)
    python scripts/rates_line/refresh_cb_expectations.py                # pull the strips and print them
    python scripts/rates_line/refresh_cb_expectations.py --push         # ... and POST them to {base}/api/kv/set

Each bank lists candidate contracts, best first. The script asks IBKR for every listed expiry of a candidate (reqContractDetails without a month), keeps the
next --rungs that have not expired, and reads each one's last daily close and the close about a week earlier (MIDPOINT, falling back to TRADES). The first
candidate that returns prices is used; the others are reported. Nothing about the symbols is assumed beyond this list: a symbol IBKR does not know is
reported as "not found" and the bank is left out, never filled in.

Kinds: '1m' = an average-rate future over its contract month (30-day fed funds, ASX 30-day interbank cash rate, NZ 30-day OCR); '3m' = a compounded overnight
rate over the quarter starting in its contract month (SONIA, €STR, CORRA, SARON, TONA); 'bill' = a 90-day bank bill or BA rate, which carries a credit spread
over the policy rate, so its level is compared with the front contract, not with the policy rate. Rate = 100 - price in every case.

Schedule: once or twice a day is enough (e.g. alongside run_cog_legs.bat). If TWS is not reachable it says so and exits 2 without touching anything."""
import argparse
import asyncio
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
asyncio.set_event_loop(asyncio.new_event_loop())

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'analysis' / 'output' / 'cb_expectations'
BASE = 'https://macrofxmodel-production.up.railway.app'
KV_KEY = 'cb_rate_futures_v1'
IB_PORT = int(os.environ.get('IB_PORT', 4002))

# currency: [(IBKR symbol, exchange, currency, label, kind), ...] best first
CANDIDATES = {
    'USD': [('ZQ', 'CBOT', 'USD', '30-day fed funds', '1m'), ('SOFR3', 'CME', 'USD', '3M SOFR', '3m')],
    'EUR': [('ER3', 'ICEEU', 'EUR', '3M €STR', '3m'), ('I', 'ICEEU', 'EUR', '3M Euribor', 'bill')],
    'GBP': [('SO3', 'ICEEU', 'GBP', '3M SONIA', '3m'), ('SR3', 'CME', 'GBP', '3M SONIA (CME)', '3m')],
    'CHF': [('SA3', 'ICEEU', 'CHF', '3M SARON', '3m')],
    'CAD': [('CRA', 'CDE', 'CAD', '3M CORRA', '3m'), ('BAX', 'CDE', 'CAD', '3M bankers acceptance', 'bill')],
    'AUD': [('IB', 'SNFE', 'AUD', '30-day interbank cash rate', '1m'), ('IR', 'SNFE', 'AUD', '90-day bank bill', 'bill')],
    'NZD': [('ZO', 'SNFE', 'NZD', '30-day OCR', '1m'), ('BB', 'SNFE', 'NZD', '90-day bank bill', 'bill')],
    'JPY': [('TONA3M', 'OSE.JPN', 'JPY', '3M TONA', '3m')],
}
last = [0.0]


def pace(s=10.5):
    """IBKR allows 60 historical requests per 10 minutes, shared across the account (the 30-minute leg refresh uses the same budget)."""
    w = s - (time.time() - last[0])
    time.sleep(max(w, 0))
    last[0] = time.time()


def closes(ib, c):
    """The last daily close and the close about a week before it, or (None, None)."""
    for what in ('MIDPOINT', 'TRADES'):
        pace()
        try:
            bars = ib.reqHistoricalData(c, endDateTime='', durationStr='15 D', barSizeSetting='1 day', whatToShow=what, useRTH=False, formatDate=2, timeout=60)
        except Exception as e:
            print(f'    {c.localSymbol} {what}: {type(e).__name__} {e}')
            continue
        if bars:
            b = [x for x in bars if x.close and x.close > 0]
            if b:
                last_bar = b[-1]
                ago = [x for x in b if (last_bar.date - x.date).days >= 6]
                return (last_bar.close, str(last_bar.date)[:10]), ((ago[-1].close, str(ago[-1].date)[:10]) if ago else None)
    return None, None


def strip(ib, sym, exch, ccy, n, now, discover=False):
    from ib_insync import Future
    det = ib.reqContractDetails(Future(symbol=sym, exchange=exch, currency=ccy))
    if not det:
        return None, 'not found'
    cs = []
    for d in det:
        c = d.contract
        exp = c.lastTradeDateOrContractMonth.split(' ')[0]
        if len(exp) == 8 and datetime.strptime(exp, '%Y%m%d').replace(tzinfo=timezone.utc) < now:
            continue
        cs.append((exp, c))
    cs.sort(key=lambda x: x[0])
    cs = cs[:n]
    if discover:
        return [{'local': c.localSymbol, 'expiry': e, 'month': getattr(c, 'lastTradeDateOrContractMonth', '')[:6]} for e, c in cs], None
    rungs = []
    for exp, c in cs:
        now_px, ago_px = closes(ib, c)
        if not now_px:
            print(f'    {c.localSymbol}: no prices (no market-data subscription, or no trades)')
            continue
        rungs.append({'local': c.localSymbol, 'expiry': exp, 'month': exp[:6], 'price': now_px[0], 'rate': round(100 - now_px[0], 4), 'date': now_px[1],
                      'rateWeekAgo': round(100 - ago_px[0], 4) if ago_px else None, 'dateWeekAgo': ago_px[1] if ago_px else None})
    return rungs, (None if rungs else 'no prices')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--push', action='store_true')
    ap.add_argument('--discover', action='store_true')
    ap.add_argument('--rungs', type=int, default=8)
    ap.add_argument('--only', default='', help='comma-separated currencies, e.g. GBP,CAD')
    a = ap.parse_args()
    from ib_insync import IB
    now = datetime.now(timezone.utc)
    ib = IB()
    try:
        ib.connect('127.0.0.1', IB_PORT, clientId=23, timeout=20, readonly=True)
    except Exception as e:
        print(f'Could not connect to IB Gateway on port {IB_PORT} ({type(e).__name__}). Open and log in, then run again. Nothing was changed.')
        sys.exit(2)
    only = {x.strip().upper() for x in a.only.split(',') if x.strip()}
    banks, errors = {}, {}
    for ccy, cands in CANDIDATES.items():
        if only and ccy not in only:
            continue
        for sym, exch, cur, label, kind in cands:
            print(f'{ccy}: {label} ({sym} on {exch})')
            try:
                rungs, err = strip(ib, sym, exch, cur, a.rungs, now, discover=a.discover)
            except Exception as e:
                rungs, err = None, f'{type(e).__name__}: {e}'
            if err:
                print(f'  -> {err}')
                errors.setdefault(ccy, []).append(f'{sym} {exch}: {err}')
                continue
            if a.discover:
                print('  -> ' + ', '.join(f"{r['local']} ({r['expiry']})" for r in rungs))
                errors.setdefault(ccy, []).append(f'{sym} {exch}: found {len(rungs)} contracts')
                continue
            banks[ccy] = {'source': f'{label} ({sym}, {exch})', 'kind': kind, 'rungs': rungs}
            print('  -> ' + ', '.join(f"{r['local']} {r['rate']:.3f}%" for r in rungs))
            break
    ib.disconnect()
    if a.discover:
        return
    payload = {'asOf': now.strftime('%Y-%m-%dT%H:%M:%SZ'), 'source': 'IBKR futures (laptop pull, scripts/rates_line/refresh_cb_expectations.py)', 'banks': banks, 'errors': errors}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'latest.json').write_text(json.dumps(payload, indent=1))
    print(f'wrote {OUT / "latest.json"}: {len(banks)} banks ({", ".join(banks) or "none"})')
    if a.push:
        if not banks:
            print('nothing to push')
            sys.exit(1)
        body = json.dumps({'key': KV_KEY, 'data': payload, 'timestamp': int(time.time() * 1000)}).encode()
        req = urllib.request.Request(f'{BASE}/api/kv/set', data=body, headers={'Content-Type': 'application/json'}, method='POST')
        with urllib.request.urlopen(req, timeout=30) as r:
            print(f'POST /api/kv/set {KV_KEY} -> HTTP {r.status} {r.read()[:200]!r}')


if __name__ == '__main__':
    main()
