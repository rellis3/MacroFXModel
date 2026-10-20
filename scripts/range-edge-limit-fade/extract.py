"""range-edge-limit-fade: bid/ask parquet -> flat binary, read BY COLUMN NAME.

forge/RANGE_EDGE_LIMIT_FADE_PREREG.md. The JS M1 loader reads the timestamp by
position, which the bid/ask files (extra columns after `time`) break, so this
extracts the needed columns by name into data/m1_bidask_bin/<key>.bin:

    int32 n | int32 time[n] (epoch s, UTC) | float64 x 12 columns [n] in COLS order

Rows on or after 2026-08-21 00:00 UTC (the lockbox) are cut here.

    python scripts/range-edge-limit-fade/extract.py [key ...]
"""
import sys
from pathlib import Path

import numpy as np
import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data" / "m1_bidask"
DST = ROOT / "data" / "m1_bidask_bin"
COLS = ["open", "high", "low", "close", "bid_o", "bid_h", "bid_l", "bid_c", "ask_o", "ask_h", "ask_l", "ask_c"]
CUT = np.datetime64("2026-08-21T00:00:00")


def extract(key: str) -> None:
    t = pq.read_table(SRC / f"{key}_m1.parquet", columns=["time"] + COLS)
    ts = t.column("time").to_numpy().astype("datetime64[s]")
    keep = ts < CUT
    order = np.argsort(ts[keep], kind="stable")
    times = ts[keep][order].astype(np.int64)
    assert times.min() > 1_400_000_000, f"{key}: timestamps look wrong ({times.min()})"
    cols = [t.column(c).to_numpy()[keep][order].astype(np.float64) for c in COLS]
    bad = np.zeros(len(times), bool)
    for c in cols:
        bad |= ~np.isfinite(c)
    bad |= cols[COLS.index("ask_c")] < cols[COLS.index("bid_c")]
    times = times[~bad]
    cols = [c[~bad] for c in cols]
    DST.mkdir(parents=True, exist_ok=True)
    with open(DST / f"{key}.bin", "wb") as f:
        np.array([len(times)], np.int32).tofile(f)
        times.astype(np.int32).tofile(f)
        for c in cols:
            c.tofile(f)
    first = np.datetime64(int(times[0]), "s")
    last = np.datetime64(int(times[-1]), "s")
    print(f"{key:7s} rows {len(times):>9,d}  dropped {int(bad.sum())}  {first} -> {last}")


if __name__ == "__main__":
    keys = sys.argv[1:] or sorted(p.name[:-11] for p in SRC.glob("*_m1.parquet"))
    for k in keys:
        extract(k)
