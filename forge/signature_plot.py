"""Lesson 05 §04 check: microstructure noise in our M1 data (signature plot). Descriptive, not a hypothesis test.

    PYTHONPATH=. python -m forge.signature_plot [SYM ...]

For every London session (00:00-22:00, weekdays, <= 2026-08-20; research M1 cache, mid prices):
  * realised variance from log returns sampled every k minutes, k in 1, 2, 5, 10, 15, 30, 60 (price = last close at or
    before each grid minute), averaged over sessions -> annualised volatility per k; ratio to the 30-minute value.
    Noise adds about 2n*omega^2 per day (Lesson 05 formula 10), so a ratio well above 1 at k=1 means M1 squared returns
    overstate volatility.
  * the hourly share of the day's variance from 1-minute vs 5-minute vs 15-minute returns: the vol-time profile used by
    the IEP / Level Scenarios reach model is built from 1-minute squared returns.
Outputs analysis/output/signature_plot/{signature.csv, hourly_share.csv, RESULTS.md}.
"""
from __future__ import annotations

import sys
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd

from forge.iep_build import JOBS, cls_of, sessions

OUT = Path("analysis/output/signature_plot")
KS = (1, 2, 5, 10, 15, 30, 60)
END = 22 * 60


def one(sym):
    rv = {k: [] for k in KS}
    hour = {k: np.zeros(22) for k in (1, 5, 15)}
    dates = []
    for d, m, o, h, l, c, *_ in sessions(sym):
        keep = m < END
        m, o, c = m[keep], o[keep], c[keep]
        if len(m) < 600:
            continue
        dates.append(d)
        for k in KS:
            grid = np.arange(k, END + 1, k)
            idx = np.searchsorted(m, grid, side="right") - 1          # last bar starting before the grid minute
            ok = idx >= 0
            px = np.r_[o[0], c[idx[ok]]]
            r = np.diff(np.log(px))
            rv[k].append(float((r * r).sum()))
            if k in hour:
                hh = (grid[ok] - 1) // 60
                np.add.at(hour[k], np.clip(hh, 0, 21), r * r)
    n = len(dates)
    sig = {k: float(np.sqrt(np.mean(rv[k]) * 252) * 100) for k in KS}
    recent = [i for i, d in enumerate(dates) if d >= "2024-08-21"]
    sig_recent = {k: float(np.sqrt(np.mean(np.array(rv[k])[recent]) * 252) * 100) for k in KS} if recent else {}
    share = {k: (hour[k] / hour[k].sum()).tolist() for k in hour}
    return sym, n, sig, sig_recent, share


if __name__ == "__main__":
    syms = sys.argv[1:] or list(JOBS)
    rows, hrs = [], []
    with Pool(min(5, len(syms))) as p:
        for sym, n, sig, sigr, share in p.imap_unordered(one, syms):
            rows.append({"inst": sym, "cls": cls_of(sym), "sessions": n, **{f"vol_{k}m": round(sig[k], 3) for k in KS},
                         **{f"recent_vol_{k}m": round(sigr.get(k, np.nan), 3) for k in KS}})
            for k, s in share.items():
                hrs.append({"inst": sym, "cls": cls_of(sym), "k": k, **{f"h{h:02d}": s[h] for h in range(22)}})
            print(sym, n, {k: round(sig[k], 2) for k in KS}, flush=True)
    OUT.mkdir(parents=True, exist_ok=True)
    S = pd.DataFrame(rows).sort_values("inst")
    for k in KS:
        S[f"ratio_{k}m"] = (S[f"vol_{k}m"] / S["vol_30m"]).round(4)
        S[f"recent_ratio_{k}m"] = (S[f"recent_vol_{k}m"] / S["recent_vol_30m"]).round(4)
    S.to_csv(OUT / "signature.csv", index=False)
    pd.DataFrame(hrs).to_csv(OUT / "hourly_share.csv", index=False)
    print(S[["inst", "cls", "sessions"] + [f"ratio_{k}m" for k in KS]].to_string(index=False))
