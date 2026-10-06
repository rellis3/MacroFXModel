"""DATA_SPEC fault 2: live index σ comes from Yahoo cash-session bars, the ladders were fitted on OANDA NY-close CFD
bars. How far apart are the two σ, and what does Yahoo σ do to the HAR ladder's calibration on the London session?
Training years only (< 2025-09-05): the test year and the lockbox holdout (> 2026-08-21) are not touched.
    PYTHONPATH=. python analysis/system/index_source_gap.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

from forge.export_iv_adjusted_params import realised
from forge.run_combined_range import asof_before

END = "2025-09-05"
SYMS = ("NQ", "SPX500", "US30", "US2000", "DE30", "UK100")
W = json.loads(__import__("subprocess").check_output(["node", "-e", "import('./js/forecastLadderParamsHar800.js').then(m=>console.log(JSON.stringify(m.HAR800_PARAMS.pairs)))"], text=True))
TG = {0: 0.50, 1: 0.25, 2: 0.10}
out = {}
print(f"{'index':7} {'Yahoo σ ÷ OANDA σ (median, p10–p90)':38} HL>p50/p75/p90 with OANDA σ | with Yahoo σ   (target 50/25/10)")
for sym in SYMS:
    r = realised(sym)
    r = r[r["date"] < END]
    D = pd.DatetimeIndex(r["date"])
    so = pd.read_csv(f"analysis/output/ladder_candidates/d1/{sym}_har800.csv", parse_dates=["date"]).set_index("date")["sig"].dropna()
    sy = pd.read_csv(f"analysis/output/yahoo_d1/{sym}_sig.csv", parse_dates=["date"]).set_index("date")["har"].dropna()
    o = asof_before(D, so) / np.sqrt(252)
    y = asof_before(D, sy) / np.sqrt(252)
    ok = np.isfinite(o) & np.isfinite(y) & (r["hl"].to_numpy() > 0)
    rr, o, y = r[ok], o[ok], y[ok]
    ratio = y / o
    wh = W[sym]["width"]["hl"]
    exo = [float((rr["hl"].to_numpy() > wh[i] * o).mean()) for i in range(3)]
    exy = [float((rr["hl"].to_numpy() > wh[i] * y).mean()) for i in range(3)]
    out[sym] = {"ratio_median": round(float(np.median(ratio)), 3), "ratio_p10": round(float(np.quantile(ratio, .1)), 3),
                "ratio_p90": round(float(np.quantile(ratio, .9)), 3), "hl_exceed_oanda": [round(x * 100, 1) for x in exo],
                "hl_exceed_yahoo": [round(x * 100, 1) for x in exy], "n": int(ok.sum())}
    print(f"{sym:7} {out[sym]['ratio_median']:.2f}  ({out[sym]['ratio_p10']:.2f}–{out[sym]['ratio_p90']:.2f})                         "
          f"{'/'.join(f'{x:.0f}' for x in out[sym]['hl_exceed_oanda'])}  |  {'/'.join(f'{x:.0f}' for x in out[sym]['hl_exceed_yahoo'])}   (n {out[sym]['n']})")
Path("analysis/output/index_source_gap.json").write_text(json.dumps(out, indent=1))
