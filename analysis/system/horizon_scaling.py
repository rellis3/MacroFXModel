"""Does √time scaling of the daily ladder hold for a week and a month? (follow-up to plans/STYLIZED_FACTS.md)

For each instrument, on London sessions up to 2025-09-04 (training years only): realised high-low over 5 / 21 sessions
from the first session's open, divided by σ_daily (HAR-800, known before that first session) × √h. If √time scaling were
right, the quantiles of that ratio would equal the daily ones (h = 1). Reports the ratio of the h-session quantile to
the daily quantile per class and rung: 1.00 = √time is right; < 1 = √time lines too wide; > 1 = too tight.
    PYTHONPATH=. python analysis/system/horizon_scaling.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

from forge.export_iv_adjusted_params import realised
from forge.run_combined_range import asof_before
from forge.run_horizon_reversion import daily_for, FORGE_KEY
from forge.run_combined_range import london_date

D1J = Path("analysis/output/ladder_candidates/d1")
END = "2025-09-05"
CLS = lambda s: "index" if s in ("NQ", "SPX500", "US30", "US2000", "DE30", "UK100") else "gold" if s == "GOLD" else \
    "major" if s in ("EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF", "USDJPY") else "cross"
rows = []
for f in sorted(D1J.glob("*_har800.csv")):
    sym = f.stem.replace("_har800", "")
    if sym in ("SPX", "DOW"):
        continue
    d = daily_for(FORGE_KEY.get(sym, sym.lower()))
    d = pd.DataFrame({"date": london_date(d.index), "o": d["open"].to_numpy(float), "h": d["high"].to_numpy(float),
                      "l": d["low"].to_numpy(float)})
    d = d[d["date"] < END].reset_index(drop=True)
    sig = pd.read_csv(f, parse_dates=["date"]).set_index("date")["sig"].dropna()
    d["s"] = asof_before(pd.DatetimeIndex(d["date"]), sig) / np.sqrt(252) / 100
    for h in (1, 5, 21):
        hi = d["h"].rolling(h).max().shift(-(h - 1))
        lo = d["l"].rolling(h).min().shift(-(h - 1))
        x = ((hi - lo) / d["o"]) / (d["s"] * np.sqrt(h))
        step = d.index % h == 0                      # non-overlapping windows
        for v in x[step].dropna():
            rows.append((sym, CLS(sym), h, v))
df = pd.DataFrame(rows, columns=["inst", "cls", "h", "ratio"])
out = {}
print("h-session quantile of HL/(σ√h) ÷ the daily quantile (1.00 = √time scaling is right)")
for cls, g in df.groupby("cls"):
    q1 = g[g["h"] == 1]["ratio"].quantile([0.5, 0.75, 0.9])
    for h in (5, 21):
        qh = g[g["h"] == h]["ratio"].quantile([0.5, 0.75, 0.9])
        r = (qh / q1).round(3).to_list()
        out[f"{cls} h={h}"] = r
        print(f"  {cls:6} {('week' if h == 5 else 'month'):5}  p50 {r[0]:.2f}  p75 {r[1]:.2f}  p90 {r[2]:.2f}   (n {int((g['h'] == h).sum())})")
Path("analysis/output/horizon_scaling.json").write_text(json.dumps(out, indent=1))
