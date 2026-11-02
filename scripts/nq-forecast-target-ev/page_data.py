"""Page data for nq-forecast-target.html from the banked outputs (display only).

    python scripts/nq-forecast-target-ev/page_data.py  ->  backtest-data/nq-forecast-target/summary.json
"""
import json
from pathlib import Path

import pandas as pd

SRC = Path("analysis/output/nq-forecast-target-ev")
r = json.loads((SRC / "results.json").read_text())
eq = pd.read_csv(SRC / "equity_usd_nq.csv").iloc[::3]
keep = ["P1", "S2", "B1", "B2", "B3"]
out = {k: r[k] for k in ["window", "n", "cost_pct", "verdict", "gate", "profit", "mirror", "by_year", "months", "partA_oc", "partB_hl"]}
out["strategies"] = {k: {kk: v for kk, v in s.items() if kk != "boot"} | {"lo": s["boot"]["lo"], "hi": s["boot"]["hi"], "t": s["boot"]["t"]}
                     for k, s in r["strategies"].items()}
out["equity"] = {"d": eq.date.tolist(), **{k: eq[k].round(0).astype(int).tolist() for k in keep}}
Path("backtest-data/nq-forecast-target/summary.json").write_text(json.dumps(out, separators=(",", ":")))
