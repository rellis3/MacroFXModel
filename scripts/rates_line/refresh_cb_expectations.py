"""Rate expectations for every central bank the desk covers, from short-rate futures in IBKR, pushed to the server (KV cb_rate_futures_v1) for the
Desk Terminal's Macro tab (/api/cb-expectations, js/cbExpectations.js). The Fed's per-meeting path stays with the ZQ pull (zq_path_v1); this adds the rest.

Laptop: IB Gateway open and logged in, API on port 4002 (paper; override with env IB_PORT). Market-data subscriptions for ICE Futures Europe (SONIA, €STR,
SARON), Montreal (CORRA) and ASX 24 (AU/NZ) are needed for live prices; without one IBKR returns no bars and the script says which.

    python scripts/rates_line/refresh_cb_expectations.py --discover     # which contracts IBKR knows for each candidate symbol (no prices, no push)
    python scripts/rates_line/refresh_cb_expectations.py --search --only GBP,CHF,NZD,JPY   # search IBKR's symbols for the right ones
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


def _push_auth(headers: dict) -> dict:
    """PUSH-SECRET READINESS: add X-Auth-Token from env KV_WRITE_SECRET, else from a git-ignored push_secret.txt (the repo root or jarvis_broadcast/), when one exists.
    With neither the headers go out unchanged, so today's pushes behave exactly as before."""
    import os
    from pathlib import Path as _P
    s = os.environ.get('KV_WRITE_SECRET', '').strip()
    if not s:
        for d in _P(__file__).resolve().parents:
            for f in (d / 'push_secret.txt', d / 'jarvis_broadcast' / 'push_secret.txt'):
                try:
                    if f.is_file():
                        s = f.read_text(encoding='utf-8').strip()
                        break
                except OSError:
                    pass
            if s or (d / '.git').exists():
                break
    return {**headers, 'X-Auth-Token': s} if s else dict(headers)
asyncio.set_event_loop(asyncio.new_event_loop())

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'analysis' / 'output' / 'cb_expectations'
BASE = 'https://macrofxmodel-production.up.railway.app'
KV_KEY = 'cb_rate_futures_v1'
IB_PORT = int(os.environ.get('IB_PORT', 4002))
CLIENT_ID = int(os.environ.get('IB_CLIENT_ID', 23))

# currency: [(IBKR symbol, exchange, currency, label, kind[, tradingClass]), ...] best first. Symbols checked against the account with --search
# (4 Nov 2026): ICE SONIA is SONIA.N (class SO3; SOA is the one-month), SARON is SARON on Eurex (FSR3) or SRFXON3 on ICE (SA3), TONA is TONA on
# OSE (TOA3M) or SGX. IBKR lists no New Zealand rate futures for this account (only the 6N currency future), so NZD is left out here.
CANDIDATES = {
    'USD': [('ZQ', 'CBOT', 'USD', '30-day fed funds', '1m'), ('SOFR3', 'CME', 'USD', '3M SOFR', '3m')],
    # Eurex first: the account reads Eurex (SARON works) but has no ICE Futures Europe data (owner's run, 2026-11-04)
    'EUR': [('ST3', 'EUREX', 'EUR', '3M €STR (Eurex)', '3m', 'FST3'), ('ESTR', 'CME', 'EUR', '€STR (CME)', '3m', 'ESR'), ('ER3', 'ICEEU', 'EUR', '3M €STR (ICE)', '3m'),
            ('EU3', 'EUREX', 'EUR', '3M Euribor (Eurex)', 'bill', 'FEU3'), ('I', 'ICEEU', 'EUR', '3M Euribor (ICE)', 'bill')],
    'GBP': [('SONIA.N', 'ICEEU', 'GBP', '3M SONIA', '3m', 'SO3')],
    'CHF': [('SARON', 'EUREX', 'CHF', '3M SARON (Eurex)', '3m', 'FSR3'), ('SRFXON3', 'ICEEU', 'CHF', '3M SARON (ICE)', '3m', 'SA3')],
    'CAD': [('CRA', 'CDE', 'CAD', '3M CORRA', '3m'), ('BAX', 'CDE', 'CAD', '3M bankers acceptance', 'bill')],
    'AUD': [('IB', 'SNFE', 'AUD', '30-day interbank cash rate', '1m'), ('IR', 'SNFE', 'AUD', '90-day bank bill', 'bill')],
    'JPY': [('TONA', 'OSE.JPN', 'JPY', '3M TONA', '3m', 'TOA3M'), ('TONA', 'SGX', 'JPY', '3M TONA (SGX)', '3m', 'TONA')],
}
# --search: words to look up in IBKR's symbol search for each currency, to find the right symbol when a candidate is not found
SEARCH = {
    'USD': ['SOFR', 'FED FUNDS'], 'EUR': ['ESTR', 'EURIBOR'], 'GBP': ['SONIA'], 'CHF': ['SARON'], 'CAD': ['CORRA'],
    'AUD': ['CASH RATE', 'BANK BILL'], 'NZD': ['OCR', 'BANK BILL', 'NZD'], 'JPY': ['TONA', 'TONAR', 'EUROYEN', 'TIBOR'],
}
last = [0.0]


def pace(s=10.5):
    """IBKR allows 60 historical requests per 10 minutes, shared across the account (the 30-minute leg refresh uses the same budget)."""
    w = s - (time.time() - last[0])
    time.sleep(max(w, 0))
    last[0] = time.time()


def closes(ib, c):
    """The last daily close and the closes about a day, a week and four weeks before it: (now, week_ago, day_ago, four_weeks_ago), each (close, 'YYYY-MM-DD') or None."""
    for what in ('MIDPOINT', 'TRADES'):
        pace()
        try:
            bars = ib.reqHistoricalData(c, endDateTime='', durationStr='45 D', barSizeSetting='1 day', whatToShow=what, useRTH=False, formatDate=2, timeout=60)
        except Exception as e:
            print(f'    {c.localSymbol} {what}: {type(e).__name__} {e}')
            continue
        if bars:
            b = [x for x in bars if x.close and x.close > 0]
            if b:
                last_bar = b[-1]
                pick = lambda days: next(((x.close, str(x.date)[:10]) for x in reversed(b) if (last_bar.date - x.date).days >= days), None)
                return (last_bar.close, str(last_bar.date)[:10]), pick(6), pick(1), pick(27)
    return None, None, None, None


def strip(ib, sym, exch, ccy, n, now, discover=False, tc='', kind='1m'):
    from ib_insync import Future
    det = ib.reqContractDetails(Future(symbol=sym, exchange=exch, currency=ccy, tradingClass=tc))
    if not det:
        # the exchange code may differ in IBKR: ask again on any exchange, same symbol and currency
        det = ib.reqContractDetails(Future(symbol=sym, exchange='', currency=ccy, tradingClass=tc))
        if det:
            print(f'    found {sym} on {sorted({d.contract.exchange for d in det})} rather than {exch}')
    if not det:
        return None, 'not found'
    cs = []
    for d in det:
        c = d.contract
        exp = c.lastTradeDateOrContractMonth.split(' ')[0]
        if len(exp) == 8 and datetime.strptime(exp, '%Y%m%d').replace(tzinfo=timezone.utc) < now:
            continue
        # ICE Futures Europe lists 'yyyymmdd hh:mm:ss GB'; IBKR refuses that string in a data request (error 10372) and the pull then read as "no
        # prices", which is why SONIA never arrived (found 2026-11-16: with just the date the same contracts return prices). Date part only.
        if c.lastTradeDateOrContractMonth != exp:
            c.lastTradeDateOrContractMonth = exp
        cs.append((exp, c))
    cs.sort(key=lambda x: x[0])
    if kind != '1m':
        # 3-month and bill contracts also list monthly serials; the quarterly ones (expiring Mar/Jun/Sep/Dec) span a year in 5 rungs
        cs = [x for x in cs if x[0][4:6] in ('03', '06', '09', '12')] or cs
    cs = cs[:n or (13 if kind == '1m' else 6)]
    if discover:
        return [{'local': c.localSymbol, 'expiry': e, 'month': getattr(c, 'lastTradeDateOrContractMonth', '')[:6]} for e, c in cs], None
    rungs = []
    for exp, c in cs:
        now_px, ago_px, day_px, w4_px = closes(ib, c)
        if not now_px:
            print(f'    {c.localSymbol}: no prices (no market-data subscription, or no trades)')
            continue
        rungs.append({'local': c.localSymbol, 'expiry': exp, 'month': exp[:6], 'price': now_px[0], 'rate': round(100 - now_px[0], 4), 'date': now_px[1],
                      'rateWeekAgo': round(100 - ago_px[0], 4) if ago_px else None, 'dateWeekAgo': ago_px[1] if ago_px else None,
                      'rateDayAgo': round(100 - day_px[0], 4) if day_px else None, 'dateDayAgo': day_px[1] if day_px else None,
                      'rate4wAgo': round(100 - w4_px[0], 4) if w4_px else None, 'date4wAgo': w4_px[1] if w4_px else None})
    return rungs, (None if rungs else 'no prices')


def search(ib, only):
    """Print every IBKR symbol matching each currency's search words that has futures, with the futures listed under it."""
    from ib_insync import Future
    seen = set()
    for ccy, words in SEARCH.items():
        if only and ccy not in only:
            continue
        print(f'{ccy}:')
        for w in words:
            time.sleep(1.1)  # IBKR allows one symbol search per second
            try:
                hits = ib.reqMatchingSymbols(w) or []
            except Exception as e:
                print(f'  "{w}": {type(e).__name__} {e}')
                continue
            for h in hits:
                c = h.contract
                if 'FUT' not in (h.derivativeSecTypes or []) or (c.symbol, c.primaryExchange) in seen:
                    continue
                seen.add((c.symbol, c.primaryExchange))
                print(f'  "{w}": {c.symbol} ({c.secType}, {c.primaryExchange or "?"}, {c.currency}) {getattr(c, "description", "")}')
                try:
                    det = ib.reqContractDetails(Future(symbol=c.symbol, exchange='', currency=c.currency))
                except Exception:
                    det = []
                fut = sorted({(d.contract.symbol, d.contract.exchange, d.contract.tradingClass, d.longName) for d in det})
                for sym, exch, tc, name in fut[:6]:
                    print(f'      future: symbol {sym} exchange {exch} tradingClass {tc}  {name}')
                if not fut:
                    print('      (no futures listed for your account)')


CARRY_MAX_DAYS = 5


def carry_forward(banks, prev_path, now, max_days=CARRY_MAX_DAYS):
    """Keep a contract the previous pull priced but this one could not (a dropped IBKR connection, a thin contract with no trade).

    2026-11-19 17:30: the connection dropped mid-pull and CAD came back with only its two nearest CORRA contracts, overwriting a full
    strip, so the bias engine had no 6-month CAD contract the next morning. A missing contract (or a whole missing bank) is now copied
    from the previous pull UNCHANGED, with its own price date and 4-week price, and marked carried: True. Readers that check a
    contract's own date (Bias Engine V2's C3) see its true age. Only contracts priced within `max_days` and not yet expired are
    carried, so nothing is carried for long. Returns a list of what was carried, for the log and the payload."""
    try:
        prev = json.loads(Path(prev_path).read_text())
    except Exception:
        return []
    out, cutoff, ym_now = [], (now - timedelta(days=max_days)).strftime('%Y-%m-%d'), now.strftime('%Y%m')
    fresh = lambda r: str(r.get('date') or '') >= cutoff and str(r.get('month') or '') >= ym_now and r.get('rate') is not None
    for ccy, pb in (prev.get('banks') or {}).items():
        old = [r for r in (pb.get('rungs') or []) if fresh(r)]
        if not old:
            continue
        if ccy not in banks:
            banks[ccy] = {**pb, 'rungs': [{**r, 'carried': True} for r in old]}
            out.append(f'{ccy} whole strip ({len(old)})')
            continue
        have = {r.get('local') for r in banks[ccy]['rungs']}
        add = [{**r, 'carried': True} for r in old if r.get('local') not in have]
        if add:
            banks[ccy]['rungs'] = sorted(banks[ccy]['rungs'] + add, key=lambda r: str(r.get('month') or ''))
            out.append(f"{ccy} {', '.join(r['local'] for r in add)}")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--push', action='store_true')
    ap.add_argument('--discover', action='store_true')
    ap.add_argument('--search', action='store_true', help="search IBKR's symbol list for each currency's rate futures (no prices, no push)")
    ap.add_argument('--rungs', type=int, default=0, help='contracts per bank (default: 13 monthly for 1m kinds, 6 quarterly otherwise, about 15 months)')
    ap.add_argument('--only', default='', help='comma-separated currencies, e.g. GBP,CAD')
    a = ap.parse_args()
    from ib_insync import IB
    now = datetime.now(timezone.utc)
    ib = IB()
    try:
        ib.connect('127.0.0.1', IB_PORT, clientId=CLIENT_ID, timeout=20, readonly=True)
    except Exception:
        # "client id already in use": an earlier run still holds it (e.g. it was stopped mid-way); try a fresh one
        try:
            ib.disconnect()
            ib.connect('127.0.0.1', IB_PORT, clientId=CLIENT_ID + 100 + int(time.time()) % 50, timeout=20, readonly=True)
        except Exception as e:
            print(f'Could not connect to IB Gateway on port {IB_PORT} ({type(e).__name__}). Open and log in, then run again. Nothing was changed.')
            sys.exit(2)
    only = {x.strip().upper() for x in a.only.split(',') if x.strip()}
    if a.search:
        search(ib, only)
        ib.disconnect()
        return
    banks, errors = {}, {}
    for ccy, cands in CANDIDATES.items():
        if only and ccy not in only:
            continue
        for sym, exch, cur, label, kind, *tc in cands:
            print(f'{ccy}: {label} ({sym} on {exch})')
            try:
                rungs, err = strip(ib, sym, exch, cur, a.rungs, now, discover=a.discover, tc=(tc[0] if tc else ''), kind=kind)
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
    carried = carry_forward(banks, OUT / 'latest.json', now)
    if carried:
        print('carried forward from the previous pull (own dates kept): ' + '; '.join(carried))
    payload = {'asOf': now.strftime('%Y-%m-%dT%H:%M:%SZ'), 'source': 'IBKR futures (laptop pull, scripts/rates_line/refresh_cb_expectations.py)', 'banks': banks, 'errors': errors,
               **({'carried': carried} if carried else {})}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'latest.json').write_text(json.dumps(payload, indent=1))
    print(f'wrote {OUT / "latest.json"}: {len(banks)} banks ({", ".join(banks) or "none"})')
    if a.push:
        if not banks:
            print('nothing to push')
            sys.exit(1)
        body = json.dumps({'key': KV_KEY, 'data': payload, 'timestamp': int(time.time() * 1000)}).encode()
        req = urllib.request.Request(f'{BASE}/api/kv/set', data=body, headers=_push_auth({'Content-Type': 'application/json'}), method='POST')
        with urllib.request.urlopen(req, timeout=30) as r:
            print(f'POST /api/kv/set {KV_KEY} -> HTTP {r.status} {r.read()[:200]!r}')


if __name__ == '__main__':
    main()
