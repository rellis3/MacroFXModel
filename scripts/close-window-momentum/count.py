"""close-window-momentum: count-first pass for the power table (no relation between predictor and outcome is read).

Reads only: n per cell, the marginal SD of the vol-scaled predictor and of the vol-scaled outcome / trade P&L
(control-sample SDs, allowed by MD files/PREREG_TEMPLATE.md), the gamma-sign split counts, and the number of
level-arm first touches per window (setups, no race outcome). MDE = 2.8 x SE x 1.2 (cluster / fat-tail inflation).
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "analysis/output/close-window-momentum"
import importlib.util
_s = importlib.util.spec_from_file_location("common", Path(__file__).with_name("common.py"))
C = importlib.util.module_from_spec(_s)
_s.loader.exec_module(C)


def main():
    res = {"regression": {}, "levels": {}}
    for name in C.ALL:
        d = C.sample(name)
        x, y, pnl = d["x"].to_numpy(), d["y"].to_numpy(), d["pnl_gross_bp"].to_numpy()
        se_b = np.std(y) / (np.std(x) * np.sqrt(len(d)))
        row = {"n": len(d), "first": str(d.day.min().date()), "last": str(d.day.max().date()),
               "sd_x": float(np.std(x)), "sd_y": float(np.std(y)), "se_beta": float(se_b),
               "mde_beta": float(2.8 * 1.2 * se_b), "sd_pnl_bp": float(np.std(pnl)),
               "mde_trade_bp": float(2.8 * 1.2 * np.std(pnl) / np.sqrt(len(d))),
               "mean_cost_bp": float(d["cost_bp"].mean())}
        if "gneg" in d:
            g = d.dropna(subset=["gneg"])
            for lab, sub in (("neg", g[g.gneg == 1]), ("pos", g[g.gneg == 0])):
                se = np.std(sub.y) / (np.std(sub.x) * np.sqrt(len(sub)))
                row[f"n_{lab}"] = len(sub)
                row[f"mde_beta_{lab}"] = float(2.8 * 1.2 * se)
            se_n = np.std(g[g.gneg == 1].y) / (np.std(g[g.gneg == 1].x) * np.sqrt((g.gneg == 1).sum()))
            se_p = np.std(g[g.gneg == 0].y) / (np.std(g[g.gneg == 0].x) * np.sqrt((g.gneg == 0).sum()))
            row["mde_interaction"] = float(2.8 * 1.2 * np.hypot(se_n, se_p))
        if "xfh" in d:
            f = d.dropna(subset=["xfh"])
            se = np.std(f.y) / (np.std(f.xfh) * np.sqrt(len(f)))
            row["n_fh"] = len(f)
            row["mde_beta_fh"] = float(2.8 * 1.2 * se)
        res["regression"][name] = row
        print(name, {k: (round(v, 4) if isinstance(v, float) else v) for k, v in row.items()})
    tb = pd.read_parquet(OUT / "level_touches_count.parquet")
    for inst, sub in tb.groupby("instrument"):
        s = sub[sub.with_day]
        c = s.groupby(["factor", "window"]).size().unstack(fill_value=0)
        res["levels"][inst] = c.to_dict(orient="index")
        r = s[s.factor == 1.0]
        n1 = int(r.window.isin(["late30", "late60only"]).sum())  # late60 = late30 + the 30 minutes before it
        n0 = int((r.window == "early").sum())
        res["levels"][inst]["n_late60_real"], res["levels"][inst]["n_early_real"] = n1, n0
        se1 = np.sqrt(0.25 / max(n1, 1) + 0.25 / max(n0, 1))
        res["levels"][inst]["mde_L1_pp"] = float(100 * 2.8 * 1.2 * se1)
        res["levels"][inst]["mde_L2_pp"] = float(100 * 2.8 * 1.2 * se1 * np.sqrt(1.5))  # placebo arm pools 2 factors
        print(inst, "\n", c, "\nMDE L1 pp", round(100 * 2.8 * 1.2 * se1, 1))
    (OUT / "power_count.json").write_text(json.dumps(res, indent=1, default=str))


if __name__ == "__main__":
    main()
