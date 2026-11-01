"""Pull NQ front-month trade ticks from the NT8 bridge, one day at a time, keep regular hours only (09:30-16:00 New York).

    python scripts/orderflow-lead/pull_ticks.py 2025-10-01 2026-08-21

Resumable: a day with a file is skipped. Writes analysis/output/orderflow-lead/ticks/NQ_<date>.parquet with
ts_ms (UTC), price, vol, and a manifest of days that returned nothing (holidays, or before the provider's history starts).
Front month by calendar: roll 8 days before the third Friday of Mar/Jun/Sep/Dec. NT8 must be connected.
The lockbox (sessions after 2026-08-21) is refused here, not just in the analysis.
"""
import json, os, sys, datetime as dt
from pathlib import Path
from zoneinfo import ZoneInfo
import numpy as np, pandas as pd, zmq

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "nt8_bridge"))
from nt8_pull import call, BridgeError  # noqa: E402

OUT = Path(os.environ.get("ORDERFLOW_TICKS") or ROOT / "analysis/output/orderflow-lead/ticks")   # set ORDERFLOW_TICKS to keep the ~3 GB outside OneDrive
NY = ZoneInfo("America/New_York")
LOCKBOX = dt.date(2026, 8, 21)


def third_friday(y, m):
    d = dt.date(y, m, 15)
    while d.weekday() != 4:
        d += dt.timedelta(days=1)
    return d


def contract(d):
    for y in (d.year, d.year + 1):
        for m in (3, 6, 9, 12):
            if third_friday(y, m) - dt.timedelta(days=8) > d:
                return f"NQ {m:02d}-{str(y)[2:]}"


def main():
    a, b = (dt.date.fromisoformat(x) for x in sys.argv[1:3])
    if b > LOCKBOX:
        sys.exit("end is after the 2026-08-21 lockbox; refused")
    OUT.mkdir(parents=True, exist_ok=True)
    man = OUT / "manifest.json"
    empty = set(json.loads(man.read_text())) if man.exists() else set()
    sock = zmq.Context().socket(zmq.REQ); sock.setsockopt(zmq.RCVTIMEO, 240000); sock.setsockopt(zmq.LINGER, 0)
    sock.connect("tcp://127.0.0.1:5557")
    d = a
    while d <= b:
        if d.weekday() < 5 and not (OUT / f"NQ_{d}.parquet").exists() and str(d) not in empty:
            inst = contract(d)
            try:
                rep = call(sock, {"op": "bars", "instrument": inst, "bar_type": "tick", "market_data_type": "last",
                                  "start": f"{d}T00:00:00Z", "end": f"{d + dt.timedelta(days=1)}T00:00:00Z"})
                rows, pid = rep["rows"], rep["pull_id"]
                while rep.get("next_cursor") is not None:
                    rep = call(sock, {"op": "chunk", "pull_id": pid, "cursor": rep["next_cursor"]}); rows += rep["rows"]
                df = pd.DataFrame(rows, columns=rep["columns"])
                if df.empty:
                    empty.add(str(d)); print(d, inst, "no rows", flush=True)
                else:
                    ts = pd.to_datetime(df.timestamp, utc=True)
                    loc = ts.dt.tz_convert(NY); mins = loc.dt.hour * 60 + loc.dt.minute
                    # the bridge returns the evening before through the END date's close, so one pull holds two sessions: save every one found
                    saved = 0
                    for day in sorted(set(loc.dt.date)):
                        if day > LOCKBOX or day.weekday() >= 5 or contract(day) != inst or (OUT / f"NQ_{day}.parquet").exists(): continue   # a neighbour day on the other side of a roll is the other contract
                        keep = (loc.dt.date == day) & (mins >= 570) & (mins < 960)
                        out = pd.DataFrame({"ts_ms": (ts[keep].astype("int64") // 1_000_000).values, "price": df.price[keep].astype("float32").values, "vol": df.volume[keep].astype("int32").values})
                        if out.empty: continue
                        out.to_parquet(OUT / f"NQ_{day}.parquet", index=False); saved += 1
                        print(day, inst, len(out), "RTH ticks,", int(out.vol.sum()), "contracts", flush=True)
                    if not saved: empty.add(str(d)); print(d, inst, "nothing new", flush=True)
            except (BridgeError, zmq.error.Again) as e:
                print(d, inst, "FAILED", str(e)[:80], flush=True)
                sock.close(); sock = zmq.Context().socket(zmq.REQ); sock.setsockopt(zmq.RCVTIMEO, 240000); sock.setsockopt(zmq.LINGER, 0); sock.connect("tcp://127.0.0.1:5557")
            man.write_text(json.dumps(sorted(empty)))
        d += dt.timedelta(days=1)
    print("done")


if __name__ == "__main__":
    main()
