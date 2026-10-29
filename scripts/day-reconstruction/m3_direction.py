"""Day reconstruction, milestone 3 (part 2): is there DIRECTION after a level touch, and does it survive costs?

Reads the per-touch outcomes written by m3_analysis.py (real and phantom). For every cell the measure is the gross R of
a 1:1 race at distance d from the level (+1 continuation first, -1 reversal first, same-minute tie = -1, unresolved =
session-close mark-to-market clipped to +-1). Its mean is the directional asymmetry: 0 = no direction.
  - by instrument x family group x rung, d = 0.25 and 0.5 of the day's sigma scale, OOS era
  - by condition (time of day, range consumed, opposite side already reached, sigma regime, previous day, event)
  - against the curvature-corrected phantom baseline (B2) and against zero
  - cost: the real bid/ask spread at the touch minute in R
  - the GOLD downside-p75 reversal cluster: by year, without untagged days, and in the in-sample era
Day-cluster Poisson bootstrap, B = 2000, seed 20261029.

    python scripts/day-reconstruction/m3_direction.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

OUT = Path(__file__).resolve().parents[2] / "analysis/output/day-reconstruction/m3"
FACT = (0.70, 0.85, 1.15, 1.30)
_X = np.array([[1, f - 1, (f - 1) ** 2] for f in FACT])
W_B2 = np.linalg.pinv(_X)[0]
B = 2000
rng = np.random.default_rng(20261029)


def boot_mean(frame, col, w, idx):
    pos = frame.date.map(idx).to_numpy()
    v = frame[col].to_numpy(float)
    ok = np.isfinite(v)
    s = np.bincount(pos[ok], weights=v[ok], minlength=len(idx))
    n = np.bincount(pos[ok], minlength=len(idx)).astype(float)
    return s.sum() / max(n.sum(), 1), (w @ s) / np.maximum(w @ n, 1e-9)


def stat(a, b, col, w, idx):
    pt, dr = boot_mean(a, col, w, idx)
    pts, drs = zip(*[boot_mean(b[np.isclose(b.factor, f)], col, w, idx) for f in FACT])
    base, bd = float(W_B2 @ np.array(pts)), np.tensordot(W_B2, np.array(drs), axes=1)
    lo, hi = np.percentile(dr, [2.5, 97.5])
    dlo, dhi = np.percentile(dr - bd, [2.5, 97.5])
    return {"n": int(len(a)), "days": int(a.date.nunique()), "gross_R": pt, "ci": [lo, hi], "B2": base,
            "minus_B2": pt - base, "minus_B2_ci": [dlo, dhi]}


res = {}
for N in ("GOLD", "NQ", "EURUSD"):
    real = pd.read_parquet(OUT / f"{N}_real_outcomes.parquet")
    ph = pd.read_parquet(OUT / f"{N}_phantom_outcomes.parquet")
    R = {}
    for era in ("oos_pit", "insample_prod_params"):
        a0, b0 = real[real.era == era], ph[ph.era == era]
        idx = {d: i for i, d in enumerate(sorted(set(a0.date) | set(b0.date)))}
        w = rng.poisson(1.0, (B, len(idx))).astype(float)
        cells = {}
        for grp in ("Fixed OH/OL", "Fixed Close", "Projected H/L"):
            for rung in ("p50", "p75", "p90", "all"):
                a = a0[(a0.group == grp) & ((a0.rung == rung) if rung != "all" else True)]
                b = b0[(b0.group == grp) & ((b0.rung == rung) if rung != "all" else True)]
                for d in ("race25", "race50"):
                    st = stat(a, b, f"{d}_R_cont", w, idx)
                    st["median_cost_R"] = float(np.nanmedian(a[f"{d}_cost_R"]))
                    st["p_cont"], st["p_rev"], st["p_tie"] = (float(a[f"{d}_{x}"].mean()) for x in ("cont", "rev", "tie"))
                    st["p_unresolved"] = 1 - st["p_cont"] - st["p_rev"] - st["p_tie"]
                    cells[f"{grp}|{rung}|{d}"] = st
        conds = {}
        if era == "oos_pit":
            for grp in ("Fixed OH/OL", "Fixed Close", "Projected H/L"):
                ag, bg = a0[a0.group == grp], b0[b0.group == grp]
                for var in ("hour_bucket", "consumed_bucket", "opposite_p50_before", "sigma_regime", "prev_day", "event"):
                    for val in sorted(set(ag[var].map(str))):
                        a, b = ag[ag[var].map(str) == val], bg[bg[var].map(str) == val]
                        if len(a) < 60:
                            continue
                        conds[f"{grp}|{var}|{val}"] = stat(a, b, "race50_R_cont", w, idx)
        R[era] = {"cells": cells, "conditional": conds}
    # the GOLD downside p75 cluster (and the same check on every instrument, for comparison)
    sel = lambda f: f[(f.rung == "p75") & (f.side == "dn") & (f.kind == "static")]
    a, b = sel(real), sel(ph)
    clus = {}
    for era in ("oos_pit", "insample_prod_params"):
        for tagset in ("all", "tagged"):
            aa, bb = a[a.era == era], b[b.era == era]
            if tagset == "tagged":
                aa, bb = aa[aa.tag_status == "ff"], bb[bb.tag_status == "ff"]
            idx = {d: i for i, d in enumerate(sorted(set(aa.date) | set(bb.date)))}
            w = rng.poisson(1.0, (B, len(idx))).astype(float)
            clus[f"{era}|{tagset}"] = {"race50_rev": stat(aa, bb, "race50_rev", w, idx), "race50_R_rev": stat(aa, bb, "race50_R_rev", w, idx)}
    yr = pd.to_datetime(a.date).dt.year
    by = {}
    for y in sorted(yr.unique()):
        aa, bb = a[yr == y], b[pd.to_datetime(b.date).dt.year == y]
        base = sum(wf * bb[np.isclose(bb.factor, f)].race50_rev.mean() for wf, f in zip(W_B2, FACT))
        by[int(y)] = {"n": int(len(aa)), "era": aa.era.mode().iat[0], "race50_rev": float(aa.race50_rev.mean()),
                      "minus_B2_pp": float(100 * (aa.race50_rev.mean() - base)), "gross_R_rev": float(aa.race50_R_rev.mean())}
    clus["by_year"] = by
    R["downside_p75_static_cluster"] = clus
    res[N] = R
    print(N, "done", flush=True)


def clean(o):
    if isinstance(o, dict):
        return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, (float, np.floating)):
        return None if not np.isfinite(o) else round(float(o), 5)
    if isinstance(o, np.integer):
        return int(o)
    return o


(OUT / "direction.json").write_text(json.dumps(clean(res), indent=1))
