"""VOL-ASIA-FIB-CONFLUENCE event table (forge/VOL_ASIA_FIB_CONFLUENCE_PREREG.md).

    PYTHONPATH=. python scripts/confluence/vol_asia_fib_build.py [SYM ...]

One row per vol line (O->H / O->L p50/p75/p90, point-in-time export ladder) untouched 00:00-06:00 London and first touched
06:00-21:59. Confluence = distance (sigma) to the nearest Asia-range extension rung on the line's side; plus the same
distance for 100 random-phase placebo grids per day. Race and fade-trade outcomes at b = 0.15 / 0.25 / 0.50 sigma.
Writes data/confluence/<SYM>.parquet and <SYM>_placebo.npy (gitignored). Sessions <= 2026-08-20 only.
"""
from __future__ import annotations

import sys
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd

from forge.iep_build import JOBS, cls_of, sessions

FH = Path("analysis/output/forecast_history")
OUT = Path("data/confluence")
FH_NAME = {"US30": "DOW"}
FIB = np.array([-9.5, -9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5, -4.5, -4, -3.5, -3, -2.5, -2, -1.5, -1, -0.5, -0.25,
                0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5])
UP_LV, DN_LV = FIB[FIB > 1], FIB[FIB < 0]             # extension rungs only (as the Atlas)
BS = (0.15, 0.25, 0.50)
NPL = 100
ASIA_END, START, END = 360, 360, 22 * 60


def asia_body(m, o, c):
    k = m < ASIA_END
    if k.sum() < 60:
        return None
    mm, oo, cc = m[k], o[k], c[k]
    g = mm // 5
    first = np.r_[True, g[1:] != g[:-1]]
    last = np.r_[g[1:] != g[:-1], True]
    o5, c5 = oo[first], cc[last]
    hi, lo = np.maximum(o5, c5).max(), np.minimum(o5, c5).min()
    return (lo, hi - lo) if hi > lo else None


def race(side, L, b, t, h, l, c):
    """side +1 = line above (fade = down). Returns (res, R_fade): res 1 fade, -1 through, 0 unresolved, 2 ambiguous."""
    thr, back = L + side * b, L - side * b
    hit_thr = (h >= thr) if side > 0 else (l <= thr)
    hit_back = (l <= back) if side > 0 else (h >= back)
    if hit_thr[t]:
        return (2, np.nan) if hit_back[t] else (-1, -1.0)
    a = np.flatnonzero(hit_thr[t + 1:])
    z = np.flatnonzero(hit_back[t + 1:])
    ia, iz = (a[0] if len(a) else 10**9), (z[0] if len(z) else 10**9)
    if ia == iz == 10**9:
        return 0, side * (L - c[-1]) / b                    # marked to the 22:00 close
    if ia == iz:
        return 2, np.nan
    return (1, 1.0) if iz < ia else (-1, -1.0)


def build(sym):
    fh = pd.read_csv(FH / f"{FH_NAME.get(sym, sym)}.csv",
                     usecols=["date", "oos", "pit_sig_daily"] + [f"pit_{s}_{r}" for s in ("oh", "ol") for r in ("p50", "p75", "p90")]).set_index("date")
    rng = np.random.default_rng(abs(hash(sym)) % 2**32)
    rows, pl = [], []
    for d, m, o, h, l, c, *_ in sessions(sym):
        if d not in fh.index:
            continue
        f = fh.loc[d]
        if not (f.pit_sig_daily > 0):
            continue
        ab = asia_body(m, o, c)
        if ab is None:
            continue
        alo, arng = ab
        O = o[0]
        unit = O * f.pit_sig_daily / 100
        e = np.searchsorted(m, END)
        s0 = np.searchsorted(m, START)
        if s0 >= e:
            continue
        H, Lw, C, M = h[:e], l[:e], c[:e], m[:e]
        pre_hi, pre_lo = (h[:s0].max(), l[:s0].min()) if s0 > 0 else (-np.inf, np.inf)
        u = rng.random(NPL)
        for sd, key, lvls in ((1, "oh", UP_LV), (-1, "ol", DN_LV)):
            for rung in ("p50", "p75", "p90"):
                pct = f[f"pit_{key}_{rung}"]
                if not np.isfinite(pct):
                    continue
                L = O * (1 + sd * pct / 100)
                if (sd > 0 and pre_hi >= L) or (sd < 0 and pre_lo <= L):
                    continue                                   # touched during Asia
                hit = (H[s0:] >= L) if sd > 0 else (Lw[s0:] <= L)
                ti = np.flatnonzero(hit)
                if not len(ti):
                    continue
                t = s0 + ti[0]
                rungs = alo + arng * lvls
                dist = np.abs(L - rungs).min() / unit
                lv = lvls[np.argmin(np.abs(L - rungs))]
                ph = alo + arng * u[:, None] + arng * lvls[None, :]
                pl.append((np.abs(L - ph).min(1) / unit).astype(np.float32))
                rec = {"date": d, "side": sd, "rung": rung, "oos": int(f.oos), "touch_min": int(M[t]), "dist": dist, "lv": lv,
                       "asia_rng_sig": arng / unit, "unit": unit, "L": L}
                for b in BS:
                    res, R = race(sd, L, b * unit, t, H, Lw, C)
                    rec[f"res_{b}"], rec[f"R_{b}"] = res, R
                rows.append(rec)
    D = pd.DataFrame(rows)
    D["inst"], D["cls"] = sym, cls_of(sym)
    OUT.mkdir(parents=True, exist_ok=True)
    D.to_parquet(OUT / f"{sym}.parquet")
    np.save(OUT / f"{sym}_placebo.npy", np.array(pl, dtype=np.float32) if pl else np.zeros((0, NPL), np.float32))
    return sym, len(D)


if __name__ == "__main__":
    syms = sys.argv[1:] or [s for s in JOBS if (FH / f"{FH_NAME.get(s, s)}.csv").exists()]
    with Pool(min(5, len(syms))) as p:
        for r in p.imap_unordered(build, syms):
            print(r, flush=True)
