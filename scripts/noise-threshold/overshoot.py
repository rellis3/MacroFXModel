"""Kou-Wang check on the stop-risk records (descriptive): is the overshoot past a stop the same size whatever the stop
distance, and does it look memoryless (exponential)?

Kou & Wang (2003): with exponential-sized jumps, given that price jumps past a level, how far past does not depend on the
level or the time taken, and is exponential. Here overshoot = (lossR - 1) x d, in daily sigma, for stops that gapped.
Records: analysis/output/stop_risk/*.csv (forge/STOP_RISK_PREREG.md; mid prices, gap component only).

    python scripts/noise-threshold/overshoot.py  ->  analysis/output/noise-threshold/overshoot.json
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "analysis/output/stop_risk"
OUT = ROOT / "analysis/output/noise-threshold"


def main():
    parts = [pd.read_csv(f, usecols=["inst", "cls", "d", "hit", "lossR", "gap", "wknd", "hitMin"]) for f in sorted(SRC.glob("*.csv"))]
    R = pd.concat(parts, ignore_index=True)
    H = R[R.hit == 1].copy()
    H["over"] = (H.lossR - 1) * H.d
    rows = []
    for wk, part in H.groupby("wknd"):
        for d, g in part.groupby("d"):
            o = g.loc[g.gap == 1, "over"]
            o = o[o > 0]
            if len(o) < 30:
                continue
            q = np.quantile(o, [0.5, 0.9, 0.99])
            # memoryless check: P(o > 2m | o > m) vs P(o > m), m = median
            m = q[0]
            rows.append({"weekend": int(wk), "d": float(d), "hits": int(len(g)), "gap_rate": round(float((g.gap == 1).mean()), 4),
                         "n_gap": int(len(o)), "mean": round(float(o.mean()), 4), "sd": round(float(o.std()), 4),
                         "p50": round(float(q[0]), 4), "p90": round(float(q[1]), 4), "p99": round(float(q[2]), 4),
                         "memoryless_ratio": round(float((o > 2 * m).sum() / max((o > m).sum(), 1) / max((o > m).mean(), 1e-9)), 3)})
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "overshoot.json").write_text(json.dumps(rows, indent=1), encoding="utf-8")
    for r in rows:
        print(r)


if __name__ == "__main__":
    main()
