"""Export OANDA D1 closes for NAS100_USD and SPX500_USD from the feature store
(features/px_d1_{nas100,spx500}.parquet) for run_macro_equity.mjs. Same OANDA endpoint and close-day
label as server.js fetchOandaD1Range; closes only.

    python scripts/q6-netliq-rerun/export_index_closes.py
"""
import json
import pathlib

import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "analysis" / "output" / "q6-netliq-rerun" / "px_index.json"
OUT.parent.mkdir(parents=True, exist_ok=True)
out = {}
for key in ["nas100", "spx500"]:
    d = pd.read_parquet(ROOT / "features" / f"px_d1_{key}.parquet")
    out[key] = [[r.date, float(r.value)] for r in d.itertuples()]
    out[key + "_source"] = str(d["source"].iloc[0])
    print(key, len(d), d["date"].iloc[0], "->", d["date"].iloc[-1], d["source"].iloc[0])
OUT.write_text(json.dumps(out))
print("written", OUT.relative_to(ROOT))
