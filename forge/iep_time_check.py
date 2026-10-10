"""iep_time_check — completes registered criteria for IEP-TIME results that iep_time.py reported only as test statistics.
No new test: (1) cell tables (raw share, n, dates, CI, per-year) for the Family X interactions that passed BH-FDR, so effect sizes are read
with their support; (2) H4d per-year and per-instrument sign consistency (section 6 criteria).
    python -m forge.iep_time_check
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from forge.iep_build import SUM
from forge.iep_stage2 import ols_cr1
from forge.iep_time import load


def cells(t, a, b, o):
    rows = []
    for (ka, kb), g in t[t[o].notna()].groupby([a, b]):
        y = g[o].to_numpy()
        bb, V, G = ols_cr1(y, np.ones((len(y), 1)), g.date.to_numpy())
        rows.append({a: ka, b: kb, "n": len(g), "dates": G, f"{o}%": round(100 * bb[0], 1), "ci": f"±{196 * np.sqrt(V[0, 0]):.1f}",
                     "per-year %": {yr: round(100 * gg[o].mean(), 1) for yr, gg in g.groupby("year")}})
    return pd.DataFrame(rows)


def main():
    x = load()
    t = x[x.test].copy()
    t["tier1"] = t.event.isin(["FOMC", "NFP", "CPI"]).map({True: "tier1", False: "other"})
    md = ["# IEP-TIME completion checks (registered criteria only)", ""]
    for a, b, o in (("tier1", "session", "CONS"), ("tier1", "session", "EXP"), ("session", "ext50_done", "CONS"), ("session", "ext50_done", "EXT75")):
        md += [f"## {a} x {b} on {o} (test block, raw shares)", "```", cells(t, a, b, o).to_string(index=False), "```", ""]
    # H4d stability
    a = t[t.h.between(7, 17) & t.U75.notna()].copy()
    out = {}
    for yr, g in a.groupby("year"):
        zq = pd.qcut(g.z_up75, 10, labels=False, duplicates="drop").astype(str) + "_" + pd.qcut(g.v_left, 3, labels=False, duplicates="drop").astype(str) + "_" + g.cls
        D = pd.get_dummies(zq, drop_first=True, dtype=float).to_numpy()
        b, V, G = ols_cr1(g.U75.to_numpy(), np.column_stack([np.ones(len(g)), g.ohp50_done.astype(float), D]), g.date.to_numpy())
        out[yr] = f"{100 * b[1]:+.2f} ±{196 * np.sqrt(V[1, 1]):.2f}"
    signs = []
    for inst, g in a.groupby("inst"):
        zq = pd.qcut(g.z_up75, 10, labels=False, duplicates="drop").astype(str) + "_" + pd.qcut(g.v_left, 3, labels=False, duplicates="drop").astype(str)
        D = pd.get_dummies(zq, drop_first=True, dtype=float).to_numpy()
        b, V, G = ols_cr1(g.U75.to_numpy(), np.column_stack([np.ones(len(g)), g.ohp50_done.astype(float), D]), g.date.to_numpy())
        signs.append((inst, round(100 * b[1], 1)))
    pos = sum(1 for _, e in signs if e > 0)
    md += ["## H4d (extension beyond distance-matched geometry, U75, all instruments): per year and per instrument", "```",
           f"per year: {out}", f"instruments with a positive effect: {pos} of {len(signs)}", str(signs), "```"]
    (SUM / "TIME_CHECK.md").write_text("\n".join(md), encoding="utf-8")
    print("\n".join(md).encode("ascii", "replace").decode())


if __name__ == "__main__":
    main()
