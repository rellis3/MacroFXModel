"""Start / stop / check the live tick + order-book recorder inside NT8 (via the bridge).

    python nt8_bridge/nt8_record.py start                       # default: NQ ES GC CL, Dec/Nov-26 front contracts
    python nt8_bridge/nt8_record.py start --instrument "NQ 12-26" "ES 12-26" --levels 10
    python nt8_bridge/nt8_record.py status
    python nt8_bridge/nt8_record.py stop

Output (written by NT8, so it only records while NT8 is open and connected):
    analysis/output/nt8_live/<SYMBOL>/<UTC date>_ticks.csv    time,type,price,volume,bid,ask
    analysis/output/nt8_live/<SYMBOL>/<UTC date>_depth.csv    time, bid levels 1..N (price,size), ask levels 1..N
Recording must be started again after NT8 restarts. Contracts roll: change --instrument at each quarter.
"""
import argparse
import json
import sys
from pathlib import Path

import zmq

OUT = Path(__file__).resolve().parents[1] / "analysis" / "output" / "nt8_live"
DEFAULT = ["NQ 12-26", "ES 12-26", "GC 12-26", "CL 11-26"]


def call(req, port=5557):
    s = zmq.Context().socket(zmq.REQ)
    s.setsockopt(zmq.RCVTIMEO, 15000)
    s.setsockopt(zmq.LINGER, 0)
    s.connect(f"tcp://127.0.0.1:{port}")
    s.send_string(json.dumps(req))
    rep = json.loads(s.recv_string())
    if "error" in rep:
        sys.exit("bridge error: " + rep["error"])
    return rep


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["start", "stop", "status"])
    ap.add_argument("--instrument", nargs="+", default=DEFAULT)
    ap.add_argument("--levels", type=int, default=10)
    a = ap.parse_args()
    if a.cmd == "start":
        OUT.mkdir(parents=True, exist_ok=True)
        print(call({"op": "record_start", "instruments": a.instrument, "out_dir": str(OUT), "levels": a.levels}))
    elif a.cmd == "stop":
        print(call({"op": "record_stop"}))
    else:
        print(json.dumps(call({"op": "record_status"}), indent=1))


if __name__ == "__main__":
    main()
