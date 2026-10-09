"""Data for the 'Rate Spread vs Nasdaq' viewer: per trading day, 1-min NQ candles and rate spreads, London time 07:00-21:00.

Spreads are FUTURES PRICE spreads in bp from the day's first minute (up = US rates falling versus euro rates), the way
C.OG's chart reads. All from IBKR 1-min MIDPOINT bars (analysis/output/stir_1m/).
    python scripts/rate_diff_nq/build_viewer_data.py OUT.json
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

D = Path("analysis/output/stir_1m")


def load(n, cols=("close",)):
    d = pd.read_parquet(D / f"{n}.parquet")
    idx = pd.to_datetime(d.time).dt.tz_convert("Europe/London").dt.tz_localize(None)
    return d[list(cols)].set_index(idx).sort_index()


nq = load("CME_NQZ6", ("open", "high", "low", "close"))
px = {k: load(n)["close"] for k, n in {"U6": "CME_SR3U6", "Z6": "CME_SR3Z6", "H7": "CME_SR3H7", "ER3": "ICEEU_ER3U6", "IZ6": "ICEEU_IZ6"}.items()}
SPREADS = {"cog": ("U6", "ER3"), "dec": ("Z6", "IZ6")}
days = sorted(set(nq.index.normalize()) & set(px["U6"].index.normalize()))
days = [d for d in days if d >= pd.Timestamp("2026-09-10") and d.dayofweek < 5]
out = {"days": []}
for d in days:
    g = pd.date_range(d + pd.Timedelta(hours=7), d + pd.Timedelta(hours=21), freq="1min", inclusive="left")
    q = nq.reindex(g)
    if q.close.notna().mean() < 0.6:
        continue
    rec = {"date": str(d.date()), "dow": d.strftime("%a"), "t0": 7 * 60,
           "nq": [[round(float(v), 2) if np.isfinite(v) else None for v in q[c]] for c in ("open", "high", "low", "close")]}
    for name, (a, b) in SPREADS.items():
        s = (px[a].reindex(g) - px[b].reindex(g)) * 100
        first = s.dropna()
        s = (s - first.iloc[0]) if len(first) else s
        rec[name] = [round(float(v), 2) if np.isfinite(v) else None for v in s]
    for name in ("H7", "U6", "ER3"):
        s = px[name].reindex(g) * 100
        first = s.dropna()
        s = (s - first.iloc[0]) if len(first) else s
        rec[name] = [round(float(v), 2) if np.isfinite(v) else None for v in s]
    out["days"].append(rec)
Path(sys.argv[1]).write_text(json.dumps(out, separators=(",", ":")))
print(len(out["days"]), "days", [x["date"] for x in out["days"]][:3], "...", out["days"][-1]["date"], Path(sys.argv[1]).stat().st_size // 1024, "KB")
