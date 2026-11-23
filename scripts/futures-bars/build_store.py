"""Futures 1-min bars for the Forecast Reversion page (NQ, GC, 6E, 6J), London sessions 00:00-22:00, one gzipped JSON
per instrument per month: futures-bars/v1/<SYM>/<YYYY-MM>.json.gz  {sym, month, inverted, days: {date: [[min, o, h, l, c, v], ...]}}
min = minute of the London day. 6J is stored inverted (USD/JPY terms, high/low swapped) so it lines up with the USDJPY
forecast lines. Source: analysis/output/nt8/continuous/<root>_1m_unadj.parquet (NT8, end-stamped -> bar start).
    python scripts/futures-bars/build_store.py   -> analysis/output/futures-bars/store/<SYM>/<YYYY-MM>.json.gz (gitignored)
"""
import gzip, json
from pathlib import Path
import numpy as np, pandas as pd
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "analysis/output/futures-bars/store"
ROOTS = {"NQ": ("NQ", False, 2), "GC": ("GC", False, 2), "6E": ("6E", False, 6), "6J": ("6J", True, 3)}
START = pd.Timestamp("2018-01-01", tz="UTC")
for sym, (root, inv, dp) in ROOTS.items():
    d = pd.read_parquet(ROOT / f"analysis/output/nt8/continuous/{root}_1m_unadj.parquet", columns=["timestamp", "open", "high", "low", "close", "volume"])
    d.index = pd.to_datetime(d.pop("timestamp"), utc=True) - pd.Timedelta(minutes=1)
    d = d[~d.index.duplicated()].sort_index()
    d = d[d.index >= START]
    if inv:
        d = pd.DataFrame({"open": 1 / d["open"], "high": 1 / d["low"], "low": 1 / d["high"], "close": 1 / d["close"], "volume": d["volume"]})
    lt = d.index.tz_convert("Europe/London")
    keep = (lt.hour < 22) & (lt.dayofweek < 5)
    d, lt = d[keep], lt[keep]
    d["date"] = lt.strftime("%Y-%m-%d"); d["min"] = lt.hour * 60 + lt.minute; d["month"] = lt.strftime("%Y-%m")
    n = 0
    for mon, g in d.groupby("month"):
        days = {}
        for day, h in g.groupby("date"):
            days[day] = [[int(m), round(o, dp), round(hh, dp), round(l, dp), round(c, dp), int(v)]
                         for m, o, hh, l, c, v in zip(h["min"], h["open"], h["high"], h["low"], h["close"], h["volume"].fillna(0))]
        f = OUT / sym / f"{mon}.json.gz"; f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(gzip.compress(json.dumps({"sym": sym, "month": mon, "inverted": inv, "days": days}, separators=(",", ":")).encode()))
        n += 1
    print(sym, n, "months", d.index.min(), d.index.max())
