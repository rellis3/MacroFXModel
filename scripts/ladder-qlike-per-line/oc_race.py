"""EXPLORATORY (not pre-registered): QLIKE horse race for the OC line (|close - open|, % of open) on futures, the same
walk-forward scale and arms as ladder-qlike-per-line. -> analysis/output/ladder-qlike-per-line/oc_race.{txt,csv}"""
import importlib.util
from pathlib import Path
import numpy as np, pandas as pd
ROOT = Path(__file__).resolve().parents[2]
sp = importlib.util.spec_from_file_location("S", ROOT / "scripts/ladder-qlike-per-line/score.py"); S = importlib.util.module_from_spec(sp); sp.loader.exec_module(S)
out, rows = [], []
for sym in S.SYMS:
    T, arms = S.lines(sym)
    S.LINES = ("oc",); Qoc, ok = S.qlike_rows(T, arms)
    S.LINES = ("oh",); Qoh, _ = S.qlike_rows(T, arms)
    k = (T["year"].to_numpy() >= 2020) & ok
    v = {a: float(np.nanmean(Qoc[(a, "oc")][k])) for a in arms}
    rk = sorted(v, key=v.get)
    for i, a in enumerate(rk):
        rows.append({"sym": sym, "arm": a, "oc_qlike": v[a], "rank": i + 1, "n": len(rk)})
    oh_best = min(arms, key=lambda a: float(np.nanmean(Qoh[(a, "oh")][k])))
    p50 = {a: float(np.nanmedian(np.abs(T[f"{a}_oc_50"] - T[f"{a}_oh_50"]) / T[a])) for a in (rk[0], oh_best)}
    out.append(f"{sym}: OC best {rk[0]} {v[rk[0]]:.4f}, 2nd {rk[1]} {v[rk[1]]:.4f}, 3rd {rk[2]} {v[rk[2]]:.4f} | "
               f"OH-best model {oh_best} on OC {v[oh_best]:.4f} (#{rk.index(oh_best)+1}/{len(rk)}) | live A0 {v['A0']:.4f} (#{rk.index('A0')+1}) | "
               f"|OC p50 - OH p50| in sigma: {', '.join(f'{a} {x:.3f}' for a, x in p50.items())}")
pd.DataFrame(rows).to_csv(ROOT / "analysis/output/ladder-qlike-per-line/oc_race.csv", index=False)
(ROOT / "analysis/output/ladder-qlike-per-line/oc_race.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
