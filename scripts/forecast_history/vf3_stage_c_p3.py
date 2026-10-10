"""VF3 Stage C, P3: pre-freeze development check of the consolidation shadow model (forge/VF3_STAGE_C_PREREG.md, P3).
Reduced E2-hour (IEP M0 without implied vol + London hour) vs registered M0 + hour (with IV), walk-forward on 2022-24 exactly as IEP-TIME.
Development only (2022-24 already examined); decides which feature set is frozen for the prospective shadow.
    PYTHONPATH=. python scripts/forecast_history/vf3_stage_c_p3.py"""
import json
from pathlib import Path
import numpy as np
import pandas as pd
from forge.iep_time import load, m0_frame, extra, walk, skill, calib

x = load()
y = x.CONS
base = m0_frame(x)
full = pd.concat([base, extra(x, "hour")], axis=1)
red = pd.concat([base.drop(columns=["iv", "ivna"]), extra(x, "hour")], axis=1)
p_full, p_red = walk(x, y, full), walk(x, y, red)
te = x.test & y.notna()
b_full = float(((p_full - y) ** 2)[te].mean()); b_red = float(((p_red - y) ** 2)[te].mean())
s = skill(y[te], p_full[te], p_red[te], x.date[te].to_numpy())
res = {"n_test": int(te.sum()), "brier_full(M0+hour, IV)": round(b_full, 5), "brier_reduced(E2-hour, no IV)": round(b_red, 5),
       "reduced_vs_full_skill_%": s, "abs_diff_%_of_full": round(100 * (b_red - b_full) / b_full, 3),
       "calib_full_pp": round(calib(p_full[te].to_numpy(), y[te].to_numpy())[0], 2), "calib_reduced_pp": round(calib(p_red[te].to_numpy(), y[te].to_numpy())[0], 2)}
res["rule"] = "freeze E2-hour if within 0.2% Brier of M0+hour"
res["decision"] = "freeze E2-hour (reduced)" if abs(res["abs_diff_%_of_full"]) <= 0.2 else "freeze M0+hour with a live-type IV source"
Path("analysis/output/vf3_stage_c").mkdir(parents=True, exist_ok=True)
Path("analysis/output/vf3_stage_c/P3.json").write_text(json.dumps(res, indent=1))
print(json.dumps(res, indent=1))
