"""Day reconstruction, milestone 2, check I: post-touch fields re-derived independently from the float64 path for a
random sample of touches, on Float32-cast prices as the builder reads them (cont_max, rev_max and their times, return/revisit, time back to the open, time to the next
rung of the same family). Appends to archive/validation.json.

    python scripts/day-reconstruction/validate_post.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

ARC = Path(__file__).resolve().parents[2] / "analysis/output/day-reconstruction/archive"
NEXT = {"p50": "p75", "p75": "p90"}
rng = np.random.default_rng(20261029)
val = json.load(open(ARC / "validation.json"))
for N in ("GOLD", "NQ", "EURUSD"):
    d = pd.read_parquet(ARC / f"{N}_days.parquet").set_index("date")
    t = pd.read_parquet(ARC / f"{N}_touches.parquet")
    t = t[(t.kind == "static") & ~t.float32_tie].sample(600, random_state=1)
    p = pd.read_parquet(ARC / f"{N}_path.parquet")
    pg = {k: v for k, v in p.groupby("date") if k in set(t.date)}
    fails = {"cont_max": 0, "rev_max": 0, "return_min": 0, "revisit_min": 0, "next_Open_min": 0, "next_rung_min": 0}
    for _, r in t.iterrows():
        # the builder reads Float32 prices (loadM1ForPair); compare like with like
        x = pg[r.date]; H, L, C = (x[c].to_numpy().astype(np.float32).astype(np.float64) for c in ("high", "low", "close"))
        tm = ((x.t - x.t.iloc[0]) // 60).to_numpy()
        k, P, s, o = int(r.k), r.level_price, 1 if r.side == "up" else -1, d.at[r.date, "open"]
        tol = 1e-9 * P
        cont = (H[k:].max() - P) if s > 0 else (P - L[k:].min())
        rev = max(0.0, (P - L[k + 1:].min()) if s > 0 else (H[k + 1:].max() - P)) if k + 1 < len(H) else 0.0
        fails["cont_max"] += abs(cont - r.cont_max) > tol
        fails["rev_max"] += abs(rev - r.rev_max) > tol
        back = np.flatnonzero((C[k + 1:] < P) if s > 0 else (C[k + 1:] > P))
        ret = None if not len(back) else int(tm[k + 1 + back[0]] - tm[k])
        rv = None
        if ret is not None:
            j0 = k + 1 + back[0]
            again = np.flatnonzero((H[j0 + 1:] >= P) if s > 0 else (L[j0 + 1:] <= P))
            rv = None if not len(again) else int(tm[j0 + 1 + again[0]] - tm[k])
        same = lambda a, b: (a is None and (b is None or pd.isna(b))) or (a is not None and not pd.isna(b) and a == int(b))
        fails["return_min"] += not same(ret, r.return_min)
        fails["revisit_min"] += not same(rv, r.revisit_min)
        below = C[k] < o
        hitO = np.flatnonzero((H[k + 1:] >= o) if below else (L[k + 1:] <= o))
        fails["next_Open_min"] += not same(None if not len(hitO) else int(tm[k + 1 + hitO[0]] - tm[k]), r.next_Open_min)
        if r.rung in NEXT:
            tgt = d.at[r.date, f"lvl_{r.family}_{NEXT[r.rung]}"]
            b2 = C[k] < tgt
            h2 = np.flatnonzero((H[k + 1:] >= tgt) if b2 else (L[k + 1:] <= tgt))
            fails["next_rung_min"] += not same(None if not len(h2) else int(tm[k + 1 + h2[0]] - tm[k]), r[f"next_{r.family}_{NEXT[r.rung]}_min"])
    val[N]["I_post_touch_rederived"] = {"sample": 600, "failures": {k: int(v) for k, v in fails.items()}}
    print(N, val[N]["I_post_touch_rederived"])
(ARC / "validation.json").write_text(json.dumps(val, indent=1, default=str))
