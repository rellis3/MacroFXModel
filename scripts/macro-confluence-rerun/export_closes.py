"""Export OANDA D1 closes from the feature store (features/px_d1_*.parquet) to JSON for the
macro-confluence re-run. Stands in for fetchD1(sym, 5000) because OANDA_KEY is not available
to this session: same OANDA endpoint (granularity=D, price=M, default 17:00 New York alignment)
and the same close-day labelling (analysis/features/build_features.py build_oanda_d1).
Close only: the store has no high/low, which is why the range study cannot be re-run from it.

    python scripts/macro-confluence-rerun/export_closes.py
"""
import json
import pathlib

import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "analysis" / "output" / "macro-confluence-rerun" / "closes.json"
OUT.parent.mkdir(parents=True, exist_ok=True)
out = {}
for name, key in [("EURUSD", "eurusd"), ("SPX500", "spx500"), ("GOLD", "xauusd")]:
    d = pd.read_parquet(ROOT / "features" / f"px_d1_{key}.parquet")
    out[name] = {"source": str(d["source"].iloc[0]), "rows": [[r.date, float(r.value)] for r in d.itertuples()]}
    print(name, len(d), d["date"].iloc[0], "->", d["date"].iloc[-1])
OUT.write_text(json.dumps(out))
print("written", OUT.relative_to(ROOT))
