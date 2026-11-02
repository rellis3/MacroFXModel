"""NQ footprint for a past window from IB Gateway historical ticks (read-only, no orders).

    python scripts/footprint/ib_footprint.py 2026-10-30 13:30 14:00 [--contract 202612]

Pulls TRADES and BID_ASK ticks for the window (paged 1000 at a time until the window is covered, both series),
classifies each trade against the prevailing quote (at/above ask = buy, at/below bid = sell, inside = unclassified),
and writes per-minute delta plus bid/ask volume by price to analysis/output/footprint/. Times are UTC.
Descriptive order-flow data, not a signal. Quotes are ~10x denser than trades, so the quote pull is the slow part.
"""
import argparse, asyncio, bisect, collections, datetime as dt, json, os
from pathlib import Path
asyncio.set_event_loop(asyncio.new_event_loop())
try:
    from ib_async import IB, Future
except Exception:
    from ib_insync import IB, Future

OUT = Path(__file__).resolve().parents[2] / "analysis" / "output" / "footprint"


def pull(ib, c, what, start, end, maxreq=4000):
    out, cur, req = [], start, 0
    while cur < end and req < maxreq:
        t = ib.reqHistoricalTicks(c, cur, None, 1000, what, useRth=False); req += 1
        if not t: break
        out += t
        last = t[-1].time.replace(tzinfo=None)
        if req % 20 == 0: print(what, req, last, len(out), flush=True)
        if last >= end: break
        cur = last if last > cur else cur + dt.timedelta(seconds=1)
    return out, req


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("day"); ap.add_argument("start"); ap.add_argument("end")
    ap.add_argument("--contract", default="202612"); ap.add_argument("--port", type=int, default=int(os.environ.get("IB_PORT", 4002)))
    a = ap.parse_args()
    S = dt.datetime.fromisoformat(f"{a.day}T{a.start}:00"); E = dt.datetime.fromisoformat(f"{a.day}T{a.end}:00")
    ib = IB(); ib.connect("127.0.0.1", a.port, clientId=79, readonly=True, timeout=15)
    c = Future("NQ", a.contract, "CME", currency="USD"); ib.qualifyContracts(c)
    tr, r1 = pull(ib, c, "TRADES", S, E)
    # quotes must start BEFORE the first trade so the first trades have a prevailing quote
    ba, r2 = pull(ib, c, "BID_ASK", S - dt.timedelta(seconds=5), E)
    ib.disconnect()
    OUT.mkdir(parents=True, exist_ok=True)
    import pickle; pickle.dump((tr, ba), open(OUT / f"raw_{a.day}_{a.start.replace(':','')}-{a.end.replace(':','')}.pkl", 'wb'))   # so a rule change re-classifies without another hour of pulling
    qlast = ba[-1].time.replace(tzinfo=None) if ba else None
    covered = qlast is not None and qlast >= E
    seen, T = set(), []
    for x in tr:
        k = (x.time, x.price, x.size)
        if k in seen: continue
        seen.add(k)
        if S <= x.time.replace(tzinfo=None) < E: T.append(x)
    qt = [q.time for q in ba]
    mins = collections.defaultdict(lambda: [0.0, 0.0, 0.0]); px = collections.defaultdict(lambda: [0.0, 0.0])
    lastpx = {}
    for x in T:
        m = x.time.strftime("%H:%M"); lastpx[m] = x.price
        i = bisect.bisect_left(qt, x.time) - 1      # last quote STRICTLY BEFORE this second: ticks carry 1 s stamps, and a quote in the same second can already be the book AFTER this trade (lookahead; it flips the sign)
        if i < 0: mins[m][2] += x.size; continue
        q = ba[i]
        if x.price >= q.priceAsk: s = 1
        elif x.price <= q.priceBid: s = 0
        else: mins[m][2] += x.size; continue
        mins[m][s] += x.size; px[(m, x.price)][s] += x.size
    tot = sum(x.size for x in T); cls = sum(v[0] + v[1] for v in mins.values())
    res = dict(day=a.day, start=a.start, end=a.end, contract=a.contract, trades=len(T), volume=tot, classified=cls,
               unclassified=tot - cls, quotes=len(ba), quotes_cover_window=covered, requests=[r1, r2],
               minutes={m: dict(sell=v[0], buy=v[1], unclassified=v[2], delta=v[1] - v[0], last=lastpx.get(m)) for m, v in sorted(mins.items())},
               by_price=[dict(minute=m, price=p, sell=v[0], buy=v[1]) for (m, p), v in sorted(px.items())])
    OUT.mkdir(parents=True, exist_ok=True)
    f = OUT / f"NQ_{a.contract}_{a.day}_{a.start.replace(':','')}-{a.end.replace(':','')}.json"
    f.write_text(json.dumps(res)); print("saved", f, "| volume", tot, "classified", cls, "| quotes cover window:", covered)


if __name__ == "__main__":
    main()
