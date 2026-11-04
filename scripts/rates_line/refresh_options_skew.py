"""Options skew from IBKR: 25-delta risk reversals, butterflies and at-the-money vol at 1 week, 1 month and 3 months for
the CME currency futures (EUR, GBP, JPY, AUD, CAD, CHF), gold, Nasdaq, the S&P 500 and crude, pushed to the server
(KV options_skew_v1). The server keeps one point a day (options_skew_hist) and shows it on the Desk Terminal
(/api/options-skew, js/optionsSkew.js). Owner, 2026-11-04.

Laptop: IB Gateway open and logged in, API on port 4002 (override with env IB_PORT). Market data: CME, COMEX and NYMEX
(futures and futures options). Without a live options subscription IBKR sends delayed data, which the script asks for
and labels; with no data at all an underlying is reported and left out, never filled in.

    python scripts/rates_line/refresh_options_skew.py                  # print what it would push
    python scripts/rates_line/refresh_options_skew.py --push           # ... and POST it to {base}/api/kv/set
    python scripts/rates_line/refresh_options_skew.py --only EUR,GOLD  # a subset

Per underlying: the next three futures; their option chains from reqSecDefOptParams (no trading class is guessed);
for each tenor the listed expiry nearest 7, 30 and 91 days; about ten strikes either side of the future inside
2.5 standard deviations; IBKR's model greeks (implied vol, delta) for the out-of-the-money calls and puts; then
forge/options_skew.py skew_from_chain. For the currency futures the quote is US$ per unit of the currency, so a
positive risk reversal means the market pays up for that currency to RISE (for JPY: for USD/JPY to fall).

Run it once a day (run_cb_expectations.bat calls it). If TWS is not reachable it says so and exits 2 without touching anything."""
import argparse
import asyncio
import json
import logging
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
asyncio.set_event_loop(asyncio.new_event_loop())
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'forge'))
from options_skew import skew_from_chain, pick_expiries, strike_window  # noqa: E402

BASE = 'https://macrofxmodel-production.up.railway.app'
KV_KEY = 'options_skew_v1'
IB_PORT = int(os.environ.get('IB_PORT', 4002))
# id: (future symbol, exchange, label, a rough annual vol for the strike window)
UNDER = {
    'EUR': ('EUR', 'CME', 'Euro FX (6E)', 0.08), 'GBP': ('GBP', 'CME', 'British pound (6B)', 0.09), 'JPY': ('JPY', 'CME', 'Japanese yen (6J)', 0.10),
    'AUD': ('AUD', 'CME', 'Australian dollar (6A)', 0.10), 'CAD': ('CAD', 'CME', 'Canadian dollar (6C)', 0.06), 'CHF': ('CHF', 'CME', 'Swiss franc (6S)', 0.08),
    'GOLD': ('GC', 'COMEX', 'Gold (GC)', 0.18), 'NQ': ('NQ', 'CME', 'Nasdaq 100 (NQ)', 0.22), 'ES': ('ES', 'CME', 'S&P 500 (ES)', 0.17), 'WTI': ('CL', 'NYMEX', 'WTI crude (CL)', 0.35),
}


def last_price(ib, c):
    """The future's price: a live/delayed quote, else the last daily close."""
    t = ib.reqMktData(c, '', False, False)
    for _ in range(20):
        ib.sleep(0.25)
        p = t.marketPrice()
        if p and p == p and p > 0:
            break
    ib.cancelMktData(c)
    p = t.marketPrice()
    if p and p == p and p > 0:
        return float(p), t.marketDataType
    bars = ib.reqHistoricalData(c, endDateTime='', durationStr='5 D', barSizeSetting='1 day', whatToShow='TRADES', useRTH=False, formatDate=2, timeout=60)
    b = [x for x in bars or [] if x.close and x.close > 0]
    return (float(b[-1].close), 'close') if b else (None, None)


def greeks(ib, contracts, wait=8.0):
    """Model greeks for many options at once: {conId: (iv, delta)}."""
    tickers = [(c, ib.reqMktData(c, '', False, False)) for c in contracts]
    end = time.time() + wait
    while time.time() < end:
        ib.sleep(0.5)
        if all(t.modelGreeks and t.modelGreeks.impliedVol for _, t in tickers):
            break
    out = {}
    for c, t in tickers:
        g = t.modelGreeks
        if g and g.impliedVol and g.delta is not None and g.impliedVol == g.impliedVol:
            out[c.conId] = (float(g.impliedVol), float(g.delta))
        ib.cancelMktData(c)
    return out


def one(ib, key, now, errors):
    from ib_insync import Future, FuturesOption
    sym, exch, label, vol_guess = UNDER[key]
    det = ib.reqContractDetails(Future(symbol=sym, exchange=exch, currency='USD'))
    futs = sorted([d.contract for d in det if d.contract.lastTradeDateOrContractMonth[:8] >= now.strftime('%Y%m%d')], key=lambda c: c.lastTradeDateOrContractMonth)[:3]
    if not futs:
        errors[key] = 'no futures found'
        return None
    chains = []   # (expiry, tradingClass, exchange, strikes, future)
    for f in futs:
        n0 = len(chains)
        for ch in ib.reqSecDefOptParams(f.symbol, f.exchange, 'FUT', f.conId):
            for e in ch.expirations:
                chains.append((e, ch.tradingClass, ch.exchange, sorted(ch.strikes), f))
        print(f'  {f.localSymbol}: {len(chains) - n0} option expiries listed')
    if not chains:
        errors[key] = 'no option chains (no options permission for this exchange?)'
        return None
    picks = pick_expiries([c[0] for c in chains], today=now.date())
    missing = [t for t in ('1w', '1m', '3m') if t not in picks]
    if missing:
        errors[f'{key} tenors'] = f'no listed expiry near {", ".join(missing)}'
    prices, row = {}, {'label': label, 'tenors': {}}
    for tenor, (exp, days) in picks.items():
        cand = sorted([c for c in chains if c[0][:8] == exp], key=lambda c: -len(c[3]))[0]
        _, tc, oexch, strikes, fut = cand
        if fut.conId not in prices:
            prices[fut.conId] = last_price(ib, fut)
        F, mdt = prices[fut.conId]
        if not F:
            errors[f'{key} {tenor}'] = f'no price for {fut.localSymbol}'
            continue
        ks = strike_window(F, strikes, days, vol_guess)
        opts = [FuturesOption(symbol=fut.symbol, lastTradeDateOrContractMonth=exp, strike=k, right=r, exchange=oexch, tradingClass=tc, currency='USD')
                for k in ks for r in (('C',) if k >= F else ('P',))]
        q = [c for c in ib.qualifyContracts(*opts) if c.conId]
        g = greeks(ib, q)
        calls = [{'strike': c.strike, 'iv': g[c.conId][0], 'delta': g[c.conId][1]} for c in q if c.right == 'C' and c.conId in g]
        puts = [{'strike': c.strike, 'iv': g[c.conId][0], 'delta': g[c.conId][1]} for c in q if c.right == 'P' and c.conId in g]
        s = skew_from_chain(F, calls, puts)
        if not s:
            errors[f'{key} {tenor}'] = f'{len(calls)} calls / {len(puts)} puts with greeks: too thin (no options data?)'
            continue
        row['tenors'][tenor] = {'expiry': exp, 'days': days, 'future': fut.localSymbol, 'F': F, 'tradingClass': tc, **s}
        row['data'] = {1: 'live', 2: 'frozen', 3: 'delayed', 4: 'delayed-frozen'}.get(mdt, str(mdt))
        print(f'  {key} {tenor} {exp} ({days}d, {tc}) F {F:.6g}: atm {s["atm"]} rr25 {s["rr25"]} bf25 {s["bf25"]} from {s["n"]} options')
    return row if row['tenors'] else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--push', action='store_true')
    ap.add_argument('--only', default='', help='comma-separated ids, e.g. EUR,JPY,GOLD')
    a = ap.parse_args()
    from ib_insync import IB
    ib = IB()
    try:
        ib.connect('127.0.0.1', IB_PORT, clientId=25, timeout=20, readonly=True)
    except Exception:
        try:   # "client id already in use": an earlier run still holds it; try a fresh one
            ib.disconnect()
            ib.connect('127.0.0.1', IB_PORT, clientId=125 + int(time.time()) % 50, timeout=20, readonly=True)
        except Exception as e:
            print(f'Could not connect to IB Gateway on port {IB_PORT} ({type(e).__name__}). Open and log in, then run again. Nothing was changed.')
            sys.exit(2)
    ib.reqMarketDataType(3)   # live where subscribed, delayed otherwise (labelled per row)
    # IBKR reports every delayed-data line (10090) and every listed-but-absent strike (200) as an error; they are
    # expected here, so they are counted per market instead of printed one by one
    logging.getLogger('ib_insync.wrapper').setLevel(logging.CRITICAL)
    logging.getLogger('ib_insync.ib').setLevel(logging.CRITICAL)
    now = datetime.now(timezone.utc)
    only = {x.strip().upper() for x in a.only.split(',') if x.strip()}
    rows, errors = {}, {}
    for key in UNDER:
        if only and key not in only:
            continue
        print(f'{key}: {UNDER[key][2]}')
        try:
            r = one(ib, key, now, errors)
            if r:
                rows[key] = r
        except Exception as e:
            errors[key] = f'{type(e).__name__}: {e}'
            print(f'  -> {errors[key]}')
    ib.disconnect()
    payload = {'asOf': now.strftime('%Y-%m-%dT%H:%M:%SZ'), 'source': 'IBKR futures options, model greeks (scripts/rates_line/refresh_options_skew.py)', 'rows': rows, 'errors': errors}
    print(json.dumps({k: {t: (v['rr25'], v['atm']) for t, v in r['tenors'].items()} for k, r in rows.items()}, indent=1))
    if errors:
        print('errors:', json.dumps(errors, indent=1))
    if a.push:
        if not rows:
            print('nothing to push')
            sys.exit(1)
        body = json.dumps({'key': KV_KEY, 'data': payload, 'timestamp': int(time.time() * 1000)}).encode()
        req = urllib.request.Request(f'{BASE}/api/kv/set', data=body, headers={'Content-Type': 'application/json'}, method='POST')
        with urllib.request.urlopen(req, timeout=30) as r:
            print(f'POST /api/kv/set {KV_KEY} -> HTTP {r.status}')


if __name__ == '__main__':
    main()
