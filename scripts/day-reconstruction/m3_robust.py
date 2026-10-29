"""Day reconstruction, milestone 3 (part 3): robustness of the race direction measure.
 - bar-k bias: the race credits continuation inside the touch minute (bar k) but reversal only from k+1. Strict
   version: a continuation reached inside bar k counts as a tie (stop-first, -1R), so both sides start at k+1.
 - split by touch side (up vs down) and by calendar year, real vs the curvature-corrected phantom baseline (B2).
Day-cluster Poisson bootstrap B = 2000.
    python scripts/day-reconstruction/m3_robust.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
ARC, OUT = ROOT / "analysis/output/day-reconstruction/archive", ROOT / "analysis/output/day-reconstruction/m3"
FACT = (0.70, 0.85, 1.15, 1.30)
W_B2 = np.linalg.pinv(np.array([[1, f - 1, (f - 1) ** 2] for f in FACT]))[0]
rng = np.random.default_rng(20261029)


def strict_R(t, pbd, dsig):
    out = np.zeros(len(t))
    for i, (date, k, P, side, sc) in enumerate(zip(t.date, t.k, t.level_price, t.side, t.scale)):
        H, L, C = pbd[date]
        s = 1 if side == "up" else -1
        dist = dsig * sc
        tgt, stp = P + s * dist, P - s * dist
        if (H[k] >= tgt) if s > 0 else (L[k] <= tgt):
            out[i] = -1.0                                    # decided inside the touch minute: order unknown -> stop-first
            continue
        hc = np.flatnonzero((H[k + 1:] >= tgt) if s > 0 else (L[k + 1:] <= tgt))
        hr = np.flatnonzero((L[k + 1:] <= stp) if s > 0 else (H[k + 1:] >= stp))
        jc, jr = (hc[0] if len(hc) else None), (hr[0] if len(hr) else None)
        if jc is not None and (jr is None or jc < jr):
            out[i] = 1.0
        elif jr is not None:
            out[i] = -1.0                                    # reversal first, or both in one minute (stop-first)
        else:
            out[i] = np.clip((C[-1] - P) * s / dist, -1, 1)
    return out


def boot(a, b, col, idx, w):
    def m(f):
        pos = f.date.map(idx).to_numpy()
        s = np.bincount(pos, weights=f[col].to_numpy(float), minlength=len(idx))
        n = np.bincount(pos, minlength=len(idx)).astype(float)
        return s.sum() / max(n.sum(), 1), (w @ s) / np.maximum(w @ n, 1e-9)
    pt, dr = m(a)
    pts, drs = zip(*[m(b[np.isclose(b.factor, f)]) for f in FACT])
    base, bd = W_B2 @ np.array(pts), np.tensordot(W_B2, np.array(drs), axes=1)
    return {"n": int(len(a)), "R": float(pt), "ci": np.percentile(dr, [2.5, 97.5]).round(4).tolist(),
            "minus_B2": float(pt - base), "minus_B2_ci": np.percentile(dr - bd, [2.5, 97.5]).round(4).tolist()}


res = {}
for N in ("GOLD", "NQ", "EURUSD"):
    real = pd.read_parquet(OUT / f"{N}_real_outcomes.parquet")
    ph = pd.read_parquet(OUT / f"{N}_phantom_outcomes.parquet")
    path = pd.read_parquet(ARC / f"{N}_path.parquet", columns=["date", "high", "low", "close"])
    pbd = {d: (g.high.to_numpy(), g.low.to_numpy(), g.close.to_numpy()) for d, g in path.groupby("date")}
    for fr in (real, ph):
        for d in (0.25, 0.5):
            fr[f"strict{int(d * 100)}_R"] = strict_R(fr, pbd, d)
    R = {}
    for era in ("oos_pit", "insample_prod_params"):
        a0, b0 = real[real.era == era], ph[ph.era == era]
        idx = {d: i for i, d in enumerate(sorted(set(a0.date) | set(b0.date)))}
        w = rng.poisson(1.0, (2000, len(idx))).astype(float)
        for grp in ("Fixed OH/OL", "Fixed Close", "Projected H/L"):
            for side in ("up", "dn", "both"):
                a = a0[(a0.group == grp) & ((a0.side == side) if side != "both" else True)]
                b = b0[(b0.group == grp) & ((b0.side == side) if side != "both" else True)]
                for col in ("race25_R_cont", "strict25_R", "race50_R_cont", "strict50_R"):
                    R[f"{era}|{grp}|{side}|{col}"] = boot(a, b, col, idx, w)
    # by year, strict 0.25, every family pooled, by side
    yr = pd.to_datetime(real.date).dt.year
    yp = pd.to_datetime(ph.date).dt.year
    by = {}
    for y in sorted(yr.unique()):
        for side in ("up", "dn"):
            a = real[(yr == y) & (real.side == side)]
            b = ph[(yp == y) & (ph.side == side)]
            base = sum(wf * b[np.isclose(b.factor, f)].strict25_R.mean() for wf, f in zip(W_B2, FACT))
            by[f"{y}|{side}"] = {"n": int(len(a)), "R_strict25": round(float(a.strict25_R.mean()), 4), "minus_B2": round(float(a.strict25_R.mean() - base), 4)}
    R["by_year_strict25_all_families"] = by
    # how often the continuation target is reached inside the touch minute itself
    for d in (0.25, 0.5):
        s = np.where(real.side == "up", 1, -1)
        R[f"share_decided_in_touch_minute_{d}"] = float(np.mean([
            (pbd[dt][0][k] >= P + d * sc) if sd > 0 else (pbd[dt][1][k] <= P - d * sc)
            for dt, k, P, sd, sc in zip(real.date, real.k, real.level_price, s, real.scale)]))
    res[N] = R
    print(N, "done", flush=True)
(OUT / "robust.json").write_text(json.dumps(res, indent=1, default=float))
