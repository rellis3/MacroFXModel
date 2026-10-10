"""Level engine Phase 2 rows (forge/LEVEL_P2_PREREG.md): eligible levels per decision checkpoint with first-touch times, and race rows.

    PYTHONPATH=. python scripts/levels/p2_build.py [SYM ...]

Levels: registry v1 (data/levels/registry/<SYM>.csv, pre-session), the export ladder O-H/O-L p50/p75/p90 (pit, off the London open),
today's London open, Asia high/low (from 07:00), London high/low (from 12:00). Checkpoints 03/07/10/13/16 London.
Writes data/levels/p2/<SYM>_levels.parquet and <SYM>_race.parquet. Local M1 only, sessions <= 2026-08-20.
"""
from __future__ import annotations

import json
import sys
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd

from forge.iep_build import JOBS, cls_of, sessions

REG = Path("data/levels/registry")
FH = Path("analysis/output/forecast_history")
OUT = Path("data/levels/p2")
CHECKS = (3, 7, 10, 13, 16)
END = 22 * 60
FH_NAME = {"US30": "DOW"}
PROF = json.loads(Path("analysis/output/intraday_extreme_paths/discovery_profile.json").read_text())["share"]


def hour_shares(cls):
    s = PROF[cls]
    return np.array([s.get(f"{h}|1", 0.0) for h in range(24)])


def build(sym):
    reg = pd.read_csv(REG / f"{sym}.csv")
    reg["family"] = reg.source
    regd = {d: g[["family", "price"]].to_numpy() for d, g in reg.groupby("date")}
    fh = pd.read_csv(FH / f"{FH_NAME.get(sym, sym)}.csv", usecols=["date", "oos", "pit_sig_daily"] + [f"pit_{s}_{r}" for s in ("oh", "ol") for r in ("p50", "p75", "p90")]).set_index("date")
    cls = cls_of(sym)
    hs = hour_shares(cls)
    rows, races = [], []
    for d, m, o, h, l, c, sig, rel in sessions(sym):
        if d not in regd or d not in fh.index:
            continue
        f = fh.loc[d]
        s = f.pit_sig_daily
        if not (s > 0):
            continue
        O = o[0]
        unit = O * s / 100
        lad = [("ladder", O * (1 + f[f"pit_oh_{r}"] / 100)) for r in ("p50", "p75", "p90")] + [("ladder", O * (1 - f[f"pit_ol_{r}"] / 100)) for r in ("p50", "p75", "p90")]
        pre = [(fam, float(p)) for fam, p in regd[d]] + lad
        e22 = np.searchsorted(m, END)
        a_i = np.searchsorted(m, 7 * 60)
        l_i = (np.searchsorted(m, 7 * 60), np.searchsorted(m, 12 * 60))
        for hh in CHECKS:
            dec = np.searchsorted(m, hh * 60) - 1
            if dec < 0 or dec + 1 >= e22:
                continue
            P0 = c[dec]
            hi, lo = h[:dec + 1].max(), l[:dec + 1].min()
            lv = list(pre) + [("open", O)]
            if hh >= 7 and a_i > 0:
                lv += [("asia", h[:a_i].max()), ("asia", l[:a_i].min())]
            if hh >= 12 and l_i[1] > l_i[0]:
                lv += [("london", h[l_i[0]:l_i[1]].max()), ("london", l[l_i[0]:l_i[1]].min())]
            fam = np.array([x[0] for x in lv])
            px = np.array([x[1] for x in lv], float)
            dist = (px - P0) / unit
            untouched = (px > hi) | (px < lo)
            # intraday refs (open/asia/london) are by construction inside or on the range when formed: eligible only if price has left them
            intr = np.isin(fam, ["open", "asia", "london"])
            elig = (np.abs(dist) >= 0.05) & (np.abs(dist) <= 3) & (untouched | intr)
            if intr.any():                                   # an intraday ref is eligible if not re-touched since it formed: approximate by "price on one side now"
                elig &= ~(intr & (np.abs(dist) < 0.05))
            idx = np.flatnonzero(elig)
            if not len(idx):
                continue
            # nearest 3 per family per side
            keep = []
            dfm = pd.DataFrame({"i": idx, "fam": fam[idx], "side": np.sign(dist[idx]), "ad": np.abs(dist[idx])})
            for _, g in dfm.groupby(["fam", "side"]):
                keep += g.nsmallest(3, "ad").i.tolist()
            keep = np.array(sorted(keep))
            s0 = dec + 1
            H, Lw = h[s0:e22], l[s0:e22]
            cmax, cmin = np.maximum.accumulate(H), np.minimum.accumulate(Lw)
            mins = m[s0:e22] - hh * 60
            up = px[keep] > P0
            ti = np.where(up, np.searchsorted(cmax, px[keep], side="left"), np.searchsorted(-cmin, -px[keep], side="left"))
            t_min = np.where(ti < len(H), mins[np.minimum(ti, len(H) - 1)], np.nan)
            v = {k: hs[hh:hh + int(k)].sum() if k >= 1 else hs[hh] * k for k in (0.5, 1, 2, 4)}
            v["end"] = hs[hh:22].sum()
            for j, i in enumerate(keep):
                rows.append((d, hh, fam[i], px[i], dist[i], t_min[j], (hi - lo) / unit, (P0 - O) / unit, s, f.oos, v[0.5], v[1], v[2], v[4], v["end"]))
            # race: nearest eligible above and below across all families
            ab = keep[up]
            bl = keep[~up]
            if len(ab) and len(bl):
                ia = ab[np.argmin(dist[ab])]
                ib = bl[np.argmax(dist[bl])]
                ta = np.searchsorted(cmax, px[ia], side="left")
                tb = np.searchsorted(-cmin, -px[ib], side="left")
                ta = ta if ta < len(H) else 10**9
                tb = tb if tb < len(H) else 10**9
                res = "neither" if ta == tb == 10**9 else ("amb" if ta == tb else ("up" if ta < tb else "down"))
                races.append((d, hh, fam[ia], fam[ib], dist[ia], -dist[ib], res, (hi - lo) / unit, (P0 - O) / unit, s, f.oos, v["end"]))
    L = pd.DataFrame(rows, columns=["date", "h", "family", "price", "dist", "t_min", "used", "D", "sig", "oos", "v05", "v1", "v2", "v4", "vend"])
    R = pd.DataFrame(races, columns=["date", "h", "fam_up", "fam_dn", "a", "b", "res", "used", "D", "sig", "oos", "vend"])
    for X in (L, R):
        X["inst"] = sym
        X["cls"] = cls
    OUT.mkdir(parents=True, exist_ok=True)
    L.to_parquet(OUT / f"{sym}_levels.parquet")
    R.to_parquet(OUT / f"{sym}_race.parquet")
    return sym, len(L), len(R)


if __name__ == "__main__":
    syms = sys.argv[1:] or [s for s in JOBS if (REG / f"{s}.csv").exists()]
    with Pool(min(8, len(syms))) as p:
        for r in p.imap_unordered(build, syms):
            print(r, flush=True)
