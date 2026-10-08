"""Overnight, resumable backfill of 1-minute bars for every expired / current futures contract we care about.

    python nt8_bridge/nt8_backfill.py                      # all roots, 2019 -> now, priority order, newest contract first
    python nt8_bridge/nt8_backfill.py --roots NQ ES GC --from-year 2021
    python nt8_bridge/nt8_backfill.py --retry-failed

One parquet file per contract: analysis/output/nt8/contracts/<ROOT>/<ROOT>_<MM-YY>.parquet
(columns: timestamp UTC, open, high, low, close, volume). These are REAL per-contract prices (not back-adjusted),
which is what level work needs; roll-stitched / adjusted series are built from them afterwards.
Resumable: contracts with a file are skipped; failures are logged and retried with --retry-failed.
Needs NT8 open, connected and the bridge AddOn running. Keeps Windows awake while it runs.
"""
import argparse
import ctypes
import datetime as dt
import json
import sys
import time
from pathlib import Path

import pandas as pd
import zmq

BASE = Path(__file__).resolve().parents[1] / "analysis" / "output" / "nt8" / "contracts"
STATUS = BASE.parent / "backfill_status.json"
FAILED = BASE.parent / "backfill_failed.json"

Q = [3, 6, 9, 12]
ALL = list(range(1, 13))
# root -> listed delivery months. Priority order = dict order.
ROOTS = {
    "NQ": Q, "ES": Q, "YM": Q, "RTY": Q,
    "GC": [2, 4, 6, 8, 10, 12], "CL": ALL,
    "6E": Q, "6B": Q, "6J": Q, "6A": Q, "6N": Q, "6C": Q, "6S": Q,
    "ZN": Q, "ZB": Q, "ZT": Q, "ZF": Q,
    "FDAX": Q,
    "SI": [3, 5, 7, 9, 12], "HG": [3, 5, 7, 9, 12], "NG": ALL, "BZ": ALL, "PL": [1, 4, 7, 10],
    "ZC": [3, 5, 7, 9, 12], "ZS": [1, 3, 5, 7, 8, 9, 11], "ZW": [3, 5, 7, 9, 12],
    "ZQ": ALL,
}
PRE_DAYS = 80      # days before the delivery month starts (covers the whole front-month life incl. the roll)
POST_DAYS = 28     # into the delivery month
CHUNK_DAYS = 40


def keep_awake():
    try:
        ctypes.windll.kernel32.SetThreadExecutionState(0x80000000 | 0x00000001)   # ES_CONTINUOUS | ES_SYSTEM_REQUIRED
    except Exception:
        pass


def call(req, timeout_ms=240000, port=5557):
    s = zmq.Context.instance().socket(zmq.REQ)
    s.setsockopt(zmq.RCVTIMEO, timeout_ms)
    s.setsockopt(zmq.LINGER, 0)
    s.connect(f"tcp://127.0.0.1:{port}")
    try:
        s.send_string(json.dumps(req))
        return json.loads(s.recv_string())
    finally:
        s.close()


def pull(inst, start, end):
    """-> DataFrame, or raises RuntimeError(reason)."""
    rep = call({"op": "bars", "instrument": inst, "bar_type": "1m",
                "start": start.strftime("%Y-%m-%dT00:00:00Z"), "end": end.strftime("%Y-%m-%dT00:00:00Z")})
    if "error" in rep:
        raise RuntimeError(rep["error"])
    cols, rows, pid = rep["columns"], rep["rows"], rep["pull_id"]
    while rep.get("next_cursor") is not None:
        rep = call({"op": "chunk", "pull_id": pid, "cursor": rep["next_cursor"]})
        if "error" in rep:
            raise RuntimeError(rep["error"])
        rows += rep["rows"]
    return pd.DataFrame(rows, columns=cols)


def contract_windows(year, month, today):
    first = dt.date(year, month, 1)
    start = first - dt.timedelta(days=PRE_DAYS)
    end = min(first + dt.timedelta(days=POST_DAYS), today + dt.timedelta(days=1))
    s = start
    while s < end:
        e = min(s + dt.timedelta(days=CHUNK_DAYS), end)
        yield s, e
        s = e


def log(msg):
    print(dt.datetime.now().strftime("%H:%M:%S"), msg, flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--roots", nargs="+", default=list(ROOTS))
    ap.add_argument("--from-year", type=int, default=2019)
    ap.add_argument("--retry-failed", action="store_true")
    a = ap.parse_args()
    keep_awake()
    today = dt.date.today()

    todo = []
    if a.retry_failed and FAILED.exists():
        todo = [tuple(x) for x in json.loads(FAILED.read_text())]
    else:
        for root in a.roots:
            for y in range(today.year + 1, a.from_year - 1, -1):          # newest first
                for m in sorted(ROOTS[root], reverse=True):
                    if dt.date(y, m, 1) - dt.timedelta(days=PRE_DAYS) > today:
                        continue                                        # contract not trading yet
                    todo.append((root, y, m))
    failed, done, empty = [], 0, 0
    t0 = time.time()
    for i, (root, y, m) in enumerate(todo):
        name = f"{root} {m:02d}-{y % 100:02d}"
        f = BASE / root / f"{root}_{m:02d}-{y % 100:02d}.parquet"
        if f.exists():
            continue
        keep_awake()
        try:
            parts = []
            for s, e in contract_windows(y, m, today):
                for attempt in range(3):
                    try:
                        parts.append(pull(name, s, e))
                        break
                    except (zmq.error.Again, RuntimeError) as ex:
                        if "unknown instrument" in str(ex):
                            raise
                        log(f"  {name} {s}..{e} retry {attempt + 1}: {ex}")
                        time.sleep(10)
                else:
                    raise RuntimeError("chunk failed 3x")
            df = pd.concat(parts) if parts else pd.DataFrame()
            if df.empty:
                empty += 1
                f.parent.mkdir(parents=True, exist_ok=True)
                pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume"]).to_parquet(f)   # marks "checked, no data"
                log(f"{name}: no data")
                continue
            df = df.drop_duplicates("timestamp").sort_values("timestamp")
            df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
            f.parent.mkdir(parents=True, exist_ok=True)
            df.to_parquet(f, index=False)
            done += 1
            log(f"{name}: {len(df):,} rows  ({i + 1}/{len(todo)})")
        except Exception as ex:
            failed.append((root, y, m))
            log(f"{name}: FAILED {ex}")
            if "unknown instrument" not in str(ex):
                time.sleep(5)
        STATUS.write_text(json.dumps({"updated": dt.datetime.now().isoformat(), "total": len(todo), "position": i + 1,
                                      "done": done, "empty": empty, "failed": len(failed),
                                      "elapsed_min": round((time.time() - t0) / 60, 1)}))
    FAILED.write_text(json.dumps(failed))
    log(f"FINISHED: {done} contracts written, {empty} empty, {len(failed)} failed (run --retry-failed)")


if __name__ == "__main__":
    main()
