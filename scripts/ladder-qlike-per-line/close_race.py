"""Close+ / Close- QLIKE race on the futures, site field (owner 2026-11-24: each line keeps the calc with the best QLIKE
for its purpose; Jordan's per-line method). Uses the ladder-close-split data and scoring (banked 2026-11-24).

    python scripts/ladder-qlike-per-line/close_race.py -> analysis/output/ladder-qlike-per-line/close_race.csv

Close+ = (close - open)/open on sessions that close above the London 00:00 open; Close- = (open - close)/open on
sessions that close below. Every old-field arm, QLIKE with walk-forward c fitted on that side's sessions only,
mean over 2020 -> 2026-08-21.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/ladder-wide-race"))
import race as R  # noqa: E402

QP = R.QP
_s = importlib.util.spec_from_file_location("close_split", ROOT / "scripts/ladder-close-split/score.py")
CS = importlib.util.module_from_spec(_s)
_s.loader.exec_module(CS)


def main():
    rows = []
    for sym in QP.SYMS:
        T, old = QP.lines(sym)
        T = T.reset_index(drop=True)
        so = CS.signed_oc(sym).reindex(pd.to_datetime(T["date"])).to_numpy(float)
        _, ok = QP.qlike_rows(T, old)
        yrs = T["year"].to_numpy()
        T["cup"] = np.where(so > 0, so, np.nan)
        T["cdn"] = np.where(so < 0, -so, np.nan)
        for side, mask in (("cup", (so > 0) & ok), ("cdn", (so < 0) & ok)):
            test = mask & (yrs >= 2020)
            sc = {}
            for a in old:
                s = QP.sig(T, a, side).astype(float)
                q = R.qlike(T, R.h_series(T, s, side, mask), side, mask)[test]
                if np.isnan(q).mean() < 0.02:
                    sc[a] = float(np.nanmean(q))
            rk = sorted(sc, key=sc.get)
            for i, a in enumerate(rk, 1):
                rows.append(dict(sym=sym, side=side, arm=a, qlike=sc[a], rank=i, n=len(rk), days=int(test.sum())))
            print(sym, side, int(test.sum()), "days:", ", ".join(f"{a} {sc[a]:.4f}" for a in rk[:5]), flush=True)
    pd.DataFrame(rows).to_csv(ROOT / "analysis/output/ladder-qlike-per-line/close_race.csv", index=False)


if __name__ == "__main__":
    main()
