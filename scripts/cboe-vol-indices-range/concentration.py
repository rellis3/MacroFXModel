"""Descriptive concentration check for the passing cells (post-hoc, not part of any verdict):
ratio by year, without 2020, without the top 1% realised-range test days, and the 2024-2026 tail alone."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np, pandas as pd
import score as S

out = {}
for index, inst, trk, h, var in [("OVX", "WTI", "C", 1, "Lin"), ("OVX", "WTI", "C", 1, "Ext"), ("OVX", "WTI", "C", 5, "Ext"),
                                 ("OVX", "WTI", "F", 1, "Lin"),
                                 ("OVX", "BRENT", "C", 1, "Lin"), ("OVX", "BRENT", "C", 1, "Ext"), ("OVX", "BRENT", "C", 5, "Lin"), ("OVX", "BRENT", "C", 5, "Ext")]:
    fr = S.build_frame(inst, trk, None)
    T = S.run_cell(fr, h, var, False, S.feats_for(fr, index))
    # realised outcome per test row for the top-1% screen
    R = pd.Series(np.nan, index=fr["dates"])
    for Y, P in fr["years"].items():
        r = P["R1"] if h == 1 else P["R5"]
        R[P["te"]] = r[P["te"]]
    rr = R.reindex(pd.DatetimeIndex(T["date"])).to_numpy()
    top = rr >= np.nanquantile(rr, 0.99)
    rat = lambda g: round(float(g["lL"].sum() / g["lB"].sum()), 4)
    k = f"{index}->{inst} {trk} {h}d {var}"
    out[k] = {"all": rat(T), "ex2020": rat(T[T["year"] != 2020]), "ex_top1pct_days": rat(T[~top]),
              "2024-26": rat(T[T["year"] >= 2024]), "beta_lvl_mean": round(float(T["beta_0"].mean()), 4)}
    print(k, out[k], flush=True)
Path(S.OUT / "concentration.json").write_text(json.dumps(out, indent=1))
