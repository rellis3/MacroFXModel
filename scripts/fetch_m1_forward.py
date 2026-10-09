#!/usr/bin/env python3
"""fetch_m1_forward.py — download the post-2026-08-20 M1 bars into their OWN folder.

Why a separate script and folder: the forward block of forge/INTRADAY_EXTREME_PATHS_PREREG.md
(and H-A of forge/LOCKBOX_PROTOCOL.md) must stay unseen until its one evaluation. This only
DOWNLOADS and checks the bars; it scores nothing. It never touches the research cache
(VolRangeForecaster/data/m1/), AnalogML's cache, or R2 (AnalogML/refresh_m1.py mirrors to R2,
which live Railway containers restore from — not something a laptop run should overwrite).

Run with Railway's env so the key never leaves Railway's variable store:
    railway run python scripts/fetch_m1_forward.py

Output: data/m1_forward/<sym>_m1.parquet (gitignored), same schema as the research cache
(DatetimeIndex 'datetime' UTC, open/high/low/close/volume = mid) plus bid_*/ask_* columns
for spreads, and data/m1_forward/manifest.json (rows, span, seam check against the local
cache's last day — the one day both hold, 2026-08-20).
"""
from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO))
sys.path.insert(0, str(REPO / "scripts"))

from fetch_m1_oanda import fetch_chunk  # noqa: E402  (reads OANDA_KEY / OANDA_ENV)
from pylego.instruments import oanda_symbol  # noqa: E402

SYMS = ("AUDCAD AUDCHF AUDJPY AUDNZD AUDUSD CADCHF CADJPY CHFJPY DE30 EURAUD EURCAD EURCHF EURGBP "
        "EURJPY EURNZD EURUSD GBPAUD GBPCAD GBPCHF GBPJPY GBPNZD GBPUSD GOLD NQ NZDCAD NZDJPY NZDUSD "
        "SPX500 UK100 US2000 US30 USDCAD USDCHF USDJPY").split()
LOCAL_NAME = {"NQ": "nq"}  # research cache file stem; everything else is the lower-cased symbol
START = datetime(2026, 8, 20, 0, 0)  # one overlap day with the local cache, for the seam check
OUT = REPO / "data" / "m1_forward"
REFETCH = "--refetch" in sys.argv  # default: keep files already fetched (resume)


def fetch(inst: str) -> pd.DataFrame | None:
    bars, cursor, now = [], START, datetime.now(timezone.utc).replace(tzinfo=None)
    while cursor < now:
        chunk = fetch_chunk(inst, cursor, price="BAM")
        if chunk is None:
            return None
        if not chunk:
            break
        bars.extend(chunk)
        nxt = chunk[-1]["time"] + pd.Timedelta(minutes=1)
        if nxt <= cursor:
            break
        cursor = nxt
        if len(chunk) < 10:  # caught up
            break
    if not bars:
        return None
    df = pd.DataFrame(bars).drop_duplicates("time").sort_values("time")
    df.index = pd.DatetimeIndex(pd.to_datetime(df.pop("time")).dt.tz_localize("UTC"), name="datetime")
    return df


def seam(sym: str, df: pd.DataFrame) -> dict:
    p = REPO / "VolRangeForecaster" / "data" / "m1" / f"{LOCAL_NAME.get(sym, sym.lower())}_m1.parquet"
    if not p.exists():
        return {"local": "missing"}
    loc = pd.read_parquet(p, columns=["close"]).loc["2026-08-20"]
    new = df.loc["2026-08-20", "close"]
    j = loc.join(new.rename("new"), how="inner")
    diff = (j["close"] - j["new"]).abs() / j["close"]
    return {"overlap_bars": int(len(j)), "local_bars": int(len(loc)), "max_rel_diff": float(diff.max()) if len(j) else None}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {"fetched_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), "start": START.isoformat(), "instruments": {}}
    for sym in SYMS:
        try:
            inst = oanda_symbol(sym)
        except KeyError:  # registry lacks some crosses (e.g. CADCHF); OANDA's form is XXX_YYY
            inst = f"{sym[:3]}_{sym[3:]}"
        path = OUT / f"{sym.lower()}_m1.parquet"
        df = pd.read_parquet(path) if path.exists() and not REFETCH else fetch(inst)
        if df is None:
            print(f"{sym:7s} {inst:11s} FAILED")
            manifest["instruments"][sym] = {"oanda": inst, "error": "no data"}
            continue
        if not path.exists() or REFETCH:
            df.to_parquet(path)
        info = {"oanda": inst, "rows": int(len(df)), "first": str(df.index[0]), "last": str(df.index[-1]),
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "seam_2026_08_20": seam(sym, df)}
        manifest["instruments"][sym] = info
        s = info["seam_2026_08_20"]
        print(f"{sym:7s} {inst:11s} rows {len(df):7d}  {info['first'][:16]} -> {info['last'][:16]}  seam {s}")
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1))


if __name__ == "__main__":
    main()
