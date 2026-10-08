"""Pull historical bars from the NT8 ZeroMQ bridge and MERGE into analysis/output/nt8/<SYMBOL>_<bar>.csv.

    python nt8_bridge/nt8_pull.py --instrument "MNQ 12-26" "MGC 12-26" "CL 11-26" --bar-type 1m --start 2026-09-01 --end 2026-10-08
    python nt8_bridge/nt8_pull.py --instrument "MNQ 12-26" "MGC 12-26" --quote
Several instruments can be given; they are pulled one after another and a failure on one does not stop the rest.

NT8 must be running and connected to a data provider, with the AddOn loaded. The instrument uses NT8's own form
("MNQ 12-26"). Times are UTC. Existing rows are kept; overlapping rows are replaced by the new pull.
"""
import argparse
import json
import sys
from pathlib import Path

import pandas as pd
import zmq

OUT = Path(__file__).resolve().parents[1] / "analysis" / "output" / "nt8"


class BridgeError(Exception):
    pass


def call(sock, req):
    sock.send_string(json.dumps(req))
    rep = json.loads(sock.recv_string())
    if "error" in rep:
        raise BridgeError(rep["error"])
    return rep


def pull_one(sock, inst, a):
    rep = call(sock, {"op": "bars", "instrument": inst, "bar_type": a.bar_type,
                      "start": a.start + "T00:00:00Z", "end": a.end + "T00:00:00Z"})
    cols, rows, pid = rep["columns"], rep["rows"], rep["pull_id"]
    while rep.get("next_cursor") is not None:
        rep = call(sock, {"op": "chunk", "pull_id": pid, "cursor": rep["next_cursor"]})
        rows += rep["rows"]
    df = pd.DataFrame(rows, columns=cols)
    if df.empty:
        print(f"{inst}: 0 rows returned (provider has no history for that range)")
        return 0
    print(f"{inst}: {len(df)} rows, {df.timestamp.iloc[0]} -> {df.timestamp.iloc[-1]}")
    OUT.mkdir(parents=True, exist_ok=True)
    f = OUT / f"{inst.replace(' ', '_')}_{a.bar_type}.csv"
    if f.exists():
        old = pd.read_csv(f)
        df = pd.concat([old[~old.timestamp.isin(df.timestamp)], df])
    df.sort_values("timestamp").to_csv(f, index=False)
    print("  archive ->", f)
    return len(df)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--instrument", required=True, nargs="+", help='one or more NT8 contracts, e.g. "MNQ 12-26" "MGC 12-26"')
    ap.add_argument("--bar-type", default="1m", choices=["1m", "tick"])
    ap.add_argument("--start")
    ap.add_argument("--end")
    ap.add_argument("--quote", action="store_true")
    ap.add_argument("--port", default=5557)
    a = ap.parse_args()

    sock = zmq.Context().socket(zmq.REQ)
    sock.setsockopt(zmq.RCVTIMEO, 180000)
    sock.setsockopt(zmq.LINGER, 0)
    sock.connect(f"tcp://127.0.0.1:{a.port}")

    failed = []
    if a.quote:
        for inst in a.instrument:
            try:
                print(json.dumps(call(sock, {"op": "get_quote", "instrument": inst})))
            except BridgeError as e:
                failed.append((inst, str(e)))
    else:
        if not (a.start and a.end):
            sys.exit("--start and --end are required (YYYY-MM-DD, UTC)")
        for inst in a.instrument:
            try:
                pull_one(sock, inst, a)
            except BridgeError as e:
                failed.append((inst, str(e)))
    for inst, err in failed:
        print(f"FAILED {inst}: {err}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
