#!/usr/bin/env python3
"""Daily fed-funds path snapshot: ZQ -> KV zq_path_v1, and the archive grows a day.

WHY THIS IS SEPARATE FROM scratchpad/ibkr_stir_pull.py. That one pulls SIX MONTHS of
15-minute bars across sixteen contracts to build history -- minutes per request, most
of an hour, run occasionally. This is the FEED: one day of bars across twelve ZQ
months, seconds, run every evening. Different job, different cadence, same socket.

WHY IT MUST RUN HERE AND NOT ON RAILWAY. IBKR serves data over a socket to a TWS or
Gateway session logged in as you. There is no cloud endpoint to hit. So this is a
local scheduled task that PUSHES to KV, exactly like oi_recon's nightly capture and
fedwatch/run_daily.bat -- the server never reaches out for it.

WHAT IT WRITES. The raw contract rung only: month, implied rate, volume. The
per-meeting arithmetic lives in js/fedPathZq.js, tested against CME FedWatch, and is
applied when the page or the API reads. One implementation, not two that drift.

IT ALSO MERGES INTO THE ARCHIVE. Each run appends the day's bars to
analysis/output/stir/CBOT_ZQ*.csv. IBKR serves about six months of 15-minute history
and will not serve it twice, so a feed that runs daily quietly removes the risk of
ever losing a window again.

Usage:
    python fedwatch/pull_zq_path.py            # pull, merge, write KV
    python fedwatch/pull_zq_path.py --dry-run  # pull and print, write nothing
"""
import argparse
import asyncio
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

asyncio.set_event_loop(asyncio.new_event_loop())

try:
    import pandas as pd
    from ib_insync import IB, Future
except ImportError:
    sys.exit("pip install ib_insync pandas first, then re-run this.")

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "analysis" / "output" / "stir"
BASE = "https://macrofxmodel-production.up.railway.app"
KV_KEY = "zq_path_v1"

HOST, PORT, CLIENT_ID = "127.0.0.1", 7497, 17   # 17: must not clash with the archive pull's 7
N_MONTHS = 12
DURATION = "2 D"          # enough to survive a weekend and still be seconds
BAR_SIZE = "15 mins"
MONTH_CODE = "FGHJKMNQUVXZ"


def months(n=N_MONTHS):
    now = datetime.now(timezone.utc)
    y, m, out = now.year, now.month, []
    for _ in range(n):
        out.append(f"{y:04d}{m:02d}")
        m += 1
        if m > 12:
            m, y = 1, y + 1
    return out


def merge_archive(local_symbol, bars):
    """Append to the growing 15-min archive; newer pull wins on overlap."""
    path = ARCHIVE / f"CBOT_{local_symbol}.csv"
    df = pd.DataFrame([{"time": b.date.strftime("%Y-%m-%dT%H:%M:%SZ"), "open": b.open,
                        "high": b.high, "low": b.low, "close": b.close,
                        "volume": b.volume, "average": b.average, "barCount": b.barCount}
                       for b in bars])
    if path.exists():
        old = pd.read_csv(path)
        df = pd.concat([old[~old.time.isin(df.time)], df], ignore_index=True)
    df = df.sort_values("time").drop_duplicates("time", keep="last")
    ARCHIVE.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False)
    return len(df)


def kv_set(key, obj):
    body = json.dumps({"key": key, "data": obj,
                       "timestamp": int(datetime.now(timezone.utc).timestamp() * 1000)}).encode()
    req = urllib.request.Request(f"{BASE}/api/kv/set", data=body,
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.getcode(), r.read().decode()[:160]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="pull and print, write nothing")
    a = ap.parse_args()

    ib = IB()
    ib.RequestTimeout = 25
    try:
        ib.connect(HOST, PORT, clientId=CLIENT_ID, timeout=15, readonly=True)
    except Exception as e:
        sys.exit(f"could not connect -- is TWS/Gateway open on {PORT} with the API enabled? ({e})")

    rungs, asof = [], None
    for ym in months():
        y, m = int(ym[:4]), int(ym[4:])
        label = f"{y}-{m:02d}"
        c = Future(symbol="ZQ", exchange="CBOT", currency="USD", lastTradeDateOrContractMonth=ym)
        try:
            det = ib.reqContractDetails(c)
        except Exception as e:
            print(f"  {label}: lookup failed ({e})")
            continue
        if not det:
            print(f"  {label}: not listed")
            continue
        con = det[0].contract
        saved, ib.RequestTimeout = ib.RequestTimeout, 0
        try:
            bars = ib.reqHistoricalData(con, endDateTime="", durationStr=DURATION,
                                        barSizeSetting=BAR_SIZE, whatToShow="TRADES",
                                        useRTH=False, formatDate=2, timeout=120)
        except Exception as e:
            print(f"  {label}: history failed ({type(e).__name__}: {e})")
            ib.RequestTimeout = saved
            continue
        ib.RequestTimeout = saved
        if not bars:
            print(f"  {label} ({con.localSymbol}): no bars -- check the CBOT subscription")
            continue
        last = bars[-1]
        vols = sorted(b.volume for b in bars if b.volume is not None)
        med = float(vols[len(vols) // 2]) if vols else 0.0
        n = merge_archive(con.localSymbol, bars)
        asof = max(asof or "", last.date.strftime("%Y-%m-%dT%H:%M:%SZ"))
        rungs.append({"ym": label, "sym": con.localSymbol, "close": round(last.close, 5),
                      "implied": round(100 - last.close, 5), "volumeHint": med})
        print(f"  {label} {con.localSymbol}: close {last.close} -> implied {100 - last.close:.4f}%  "
              f"medvol {med:.0f}  archive {n:,} bars")

    ib.disconnect()
    if not rungs:
        print("REFUSING to write: no rungs pulled")
        return 1

    payload = {"asOf": asof, "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
               "source": "IBKR / CBOT ZQ 30-day fed funds futures, last 15-min close",
               "note": "Raw contract rungs only. Per-meeting probabilities are computed by "
                       "js/fedPathZq.js, which is tested against CME FedWatch.",
               "rungs": rungs}
    print(f"\n{len(rungs)} rungs, asOf {asof}")
    if a.dry_run:
        print("--dry-run, not writing")
        return 0
    code, resp = kv_set(KV_KEY, payload)
    print(f"POST /api/kv/set {KV_KEY} -> HTTP {code} {resp}")
    return 0 if code == 200 else 1


if __name__ == "__main__":
    sys.exit(main())
