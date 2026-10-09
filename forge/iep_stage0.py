"""iep_stage0 — Stage 0 checks for forge/INTRADAY_EXTREME_PATHS_PREREG.md. Reports NO outcome shares.

    python -m forge.iep_stage0

1. Independent recomputation: 400 random rows re-derived from the raw M1 with pandas time slicing (a different code
   path from forge/iep_build.py's searchsorted/accumulate path); every state and outcome field must match.
2. Data rates on the DISCOVERY block only: AMB (same-bar double touch), no-bar windows, stale decision bars, by class x
   hour band x H x k.
3. Leak canary (discovery only; fit 2016-2019, score 2020-2021): multinomial logistic on CONT/REV/CONS with
   (a) the registered canary, next-bar return; (b) a strong canary, the window's end return; (c) (a) shuffled.
   Only Brier skills vs the training class frequencies are reported.
4. Power: cluster-robust (by date) standard error of a CONT-among-resolved share on discovery, projected to the
   Validation and Confirmation row counts. The share itself is not printed.
Output: analysis/output/intraday_extreme_paths/STAGE0.md and stage0.json.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

from forge.iep_build import JOBS, M1, OUT, SUM, KS, HORIZONS, cls_of, DISC_END

VAL_END, CONF_END = "2025-01-01", "2026-08-21"
RNG = np.random.default_rng(20261009)


def band(h):
    return np.select([h < 7, h < 12, h < 16, h < 19], ["asia", "london", "overlap", "ny"], "late")


def load():
    df = pd.concat([pd.read_parquet(OUT / f"{s}.parquet") for s in JOBS], ignore_index=True)
    df["cls"] = df.inst.map(cls_of)
    df["band"] = band(df.h.to_numpy())
    df["block"] = np.select([df.date < DISC_END, df.date < VAL_END], ["disc", "val"], "conf")
    df["o"] = np.where(df.D >= 0.25, 1, np.where(df.D <= -0.25, -1, 0))
    return df


def recompute(df, n=400):
    prof = json.loads((SUM / "discovery_profile.json").read_text())
    sample = df.sample(n, random_state=7)
    bad, cache = [], {}
    for _, r in sample.iterrows():
        if r.inst not in cache:
            x = pd.read_parquet(M1 / f"{JOBS[r.inst]}_m1.parquet")
            x = x[~x.index.duplicated(keep="first")].sort_index()
            x.index = x.index.tz_convert("Europe/London")
            cache[r.inst] = x
        x = cache[r.inst]
        day = x.loc[r.date]
        O = day.open.iloc[0]
        unit = r.sig / np.sqrt(252) / 100 * O
        t0 = pd.Timestamp(r.date, tz="Europe/London")
        past = day[day.index < t0 + pd.Timedelta(hours=int(r.h))]
        P0 = past.close.iloc[-1]
        chk = {"D": (P0 - O) / unit, "used": (past.high.max() - past.low.min()) / unit,
               "hi_pb": (past.high.max() - P0) / unit, "lo_pb": (P0 - past.low.min()) / unit}
        hi_t = past.index[past.high == past.high.max()][-1]
        chk["hi_age"] = (t0 + pd.Timedelta(hours=int(r.h)) - hi_t).total_seconds() / 60 - 1
        for H in HORIZONS:
            if r.h + H > 22:
                continue
            w = day[(day.index >= t0 + pd.Timedelta(hours=int(r.h))) & (day.index < t0 + pd.Timedelta(hours=int(r.h + H)))]
            if not len(w):
                chk[f"res{H}_1.0"] = -9
                continue
            u = unit * np.sqrt(prof["share"][cls_of(r.inst)][f"{int(r.h)}|{H}"])
            chk[f"end{H}"] = (w.close.iloc[-1] - P0) / u
            chk[f"mfu{H}"] = (w.high.max() - P0) / u
            for k in KS:
                up = np.flatnonzero(w.high.to_numpy() >= P0 + k * u)
                dn = np.flatnonzero(w.low.to_numpy() <= P0 - k * u)
                iu, idn = (up[0] if len(up) else 1e9), (dn[0] if len(dn) else 1e9)
                chk[f"res{H}_{k}"] = 0 if iu == idn == 1e9 else 2 if iu == idn else 1 if iu < idn else -1
        for kk, v in chk.items():
            if not np.isclose(r[kk], v, atol=1e-6, rtol=1e-9):
                bad.append((r.inst, r.date, int(r.h), kk, float(r[kk]), float(v)))
    return len(sample), bad


def rates(d):
    out = []
    for (cl, bd), g in d.groupby(["cls", "band"]):
        for H in HORIZONS:
            for k in KS:
                c = g[f"res{H}_{k}"]
                c = c[c.notna() & (g.h + H <= 22)]
                if not len(c):
                    continue
                out.append({"cls": cl, "band": bd, "H": H, "k": k, "n": int(len(c)),
                            "amb_pct": round(100 * (c == 2).mean(), 3), "nobars_pct": round(100 * (c == -9).mean(), 3)})
    stale = d.groupby(["cls", "band"]).stale.apply(lambda s: round(100 * (s > 5).mean(), 2)).reset_index(name="stale_gt5m_pct")
    return pd.DataFrame(out), stale


def label(d, H=2, k=1.0):
    res = d[f"res{H}_{k}"] * d.o
    return np.select([d[f"res{H}_{k}"] == 0, res == 1, res == -1], [2, 0, 1], -1)  # 0 CONT, 1 REV, 2 CONS


def brier(P, y):
    Y = np.eye(3)[y]
    return ((P - Y) ** 2).sum(1).mean()


def canary(d):
    d = d[(d.o != 0) & (d.h <= 20)].copy()
    d["y"] = label(d)
    d = d[d.y >= 0]
    tr, te = d[d.date < "2020-01-01"], d[d.date >= "2020-01-01"]
    base = np.bincount(tr.y, minlength=3) / len(tr)
    b0 = brier(np.tile(base, (len(te), 1)), te.y.to_numpy())
    out = {"n_train": int(len(tr)), "n_test": int(len(te))}
    feats = {"next_bar_return (registered)": lambda x: (x.nxt2 * x.o).to_numpy()[:, None],
             "window_end_return (strong)": lambda x: (x.end2 * x.o).to_numpy()[:, None],
             "next_bar_return shuffled": lambda x: RNG.permutation((x.nxt2 * x.o).to_numpy())[:, None]}
    for name, f in feats.items():
        Xtr, Xte = f(tr), f(te)
        Xtr, Xte = np.c_[Xtr, np.abs(Xtr)], np.c_[Xte, np.abs(Xte)]
        m = LogisticRegression(max_iter=500).fit(Xtr, tr.y)
        out[name] = round(1 - brier(m.predict_proba(Xte), te.y.to_numpy()) / b0, 4)
    return out


def power(d, disc_tercile):
    d = d[(d.o != 0) & (d.h <= 20)].copy()
    d = d.merge(disc_tercile, on=["cls", "h"], how="left")
    d = d[(d.D.abs() >= 0.5) & (d.D.abs() >= d.q67)]
    d["y"] = label(d)
    d = d[d.y.isin([0, 1])]
    d["cont"] = (d.y == 0).astype(float)
    d["pb_bin"] = np.select([d.o == 1, True], [d.hi_pb, d.lo_pb])
    d["fresh"] = (d.pb_bin <= 0.15) & (np.where(d.o == 1, d.hi_age, d.lo_age) < 60)
    counts = d.groupby("block").size().to_dict()

    def se(g):
        y = g.cont.to_numpy()
        e = y - y.mean()
        s = pd.Series(e).groupby(g.date.to_numpy()).sum().to_numpy()
        return float(np.sqrt((s ** 2).sum()) / len(y)), int(len(y)), int(g.date.nunique())

    res = {}
    disc = d[d.block == "disc"]
    for name, g in [("pooled", disc), *[(f"class={c}", x) for c, x in disc.groupby("cls")], ("fresh extremes", disc[disc.fresh])]:
        s, n, nd = se(g)
        neff = 0.25 / s ** 2
        scale_v = len(d[(d.block == "val") & d.index.isin(d.index) & (d.cls.isin(g.cls.unique()))]) / max(1, len(disc[disc.cls.isin(g.cls.unique())]))
        res[name] = {"n_rows_disc": n, "dates_disc": nd, "n_eff_disc": round(neff), "mde80_pp_disc": round(280 * s, 2),
                     "mde80_pp_val_projected": round(280 * s / np.sqrt(scale_v), 2) if scale_v else None}
    disc_c = disc.copy()
    disc_c["dterc"] = disc_c.groupby(["cls", "h"]).D.transform(lambda s: pd.qcut(s.abs(), 3, labels=False, duplicates="drop"))
    disc_c["reg"] = pd.cut(disc_c.sigRel, [0, 0.85, 1.15, 99], labels=["quiet", "normal", "busy"])
    cells = []
    for key, g in disc_c.groupby(["cls", "reg", "band"], observed=True):
        if len(g) < 50:
            continue
        s, n, nd = se(g)
        cells.append({"n": n, "dates": nd, "mde80_pp": 280 * s})
    cdf = pd.DataFrame(cells)
    res["family C cells (class x regime x band; disc)"] = {"cells": int(len(cdf)), "median_dates": int(cdf.dates.median()),
                                                          "median_mde80_pp_disc": round(cdf.mde80_pp.median(), 1),
                                                          "share_cells_mde_le_5pp": round((cdf.mde80_pp <= 5).mean(), 2)}
    res["rows_by_block (large-move, resolved, H=2, k=1)"] = {k: int(v) for k, v in counts.items()}
    return res


def main():
    df = load()
    disc = df[df.block == "disc"]
    q = disc[disc.o != 0].assign(a=lambda x: x.D.abs()).groupby(["cls", "h"]).a.quantile(2 / 3).rename("q67").reset_index()
    q.to_csv(SUM / "large_move_tercile_edges_disc.csv", index=False)
    n, bad = recompute(df)
    rt, stale = rates(disc)
    can = canary(disc)
    pw = power(df, q)
    rep = {"rows_total": int(len(df)), "rows_by_block": df.block.value_counts().to_dict(), "instruments": int(df.inst.nunique()),
           "recompute": {"rows": n, "mismatches": len(bad), "examples": bad[:10]}, "canary_brier_skill": can, "power": pw}
    (SUM / "stage0.json").write_text(json.dumps(rep, indent=1, default=str), encoding="utf-8")
    rt.to_csv(SUM / "stage0_amb_rates_disc.csv", index=False)
    stale.to_csv(SUM / "stage0_stale_disc.csv", index=False)
    piv = rt[(rt.k == 1.0)].pivot_table(index=["cls", "band"], columns="H", values="amb_pct")
    piv5 = rt[(rt.k == 0.5)].pivot_table(index=["cls", "band"], columns="H", values="amb_pct")
    nob = rt[(rt.k == 1.0)].pivot_table(index=["cls", "band"], columns="H", values="nobars_pct")
    md = ["# INTRADAY-EXTREME-PATHS — Stage 0 checks", "", "No outcome share is reported here (prereg section 10, Stage 0).", "",
          f"Rows: {len(df):,} ({df.inst.nunique()} instruments); by block {df.block.value_counts().to_dict()}.", "",
          f"## 1. Independent recomputation\n{n} random rows re-derived with pandas time slicing: **{len(bad)} mismatches**.",
          "", "## 2. AMB rate (% of rows), discovery, barrier 1.0u", "```", piv.to_string(), "", "barrier 0.5u", piv5.to_string(), "```", "",
          "No-bar windows (%), 1.0u", "```", nob.to_string(), "```", "", "Stale decision bar (> 5 min old), %", "```", stale.pivot(index="cls", columns="band", values="stale_gt5m_pct").to_string(), "```", "",
          "## 3. Leak canary (Brier skill vs class frequencies; fit 2016-19, score 2020-21)", json.dumps(can, indent=1), "",
          "## 4. Power (cluster-by-date SE of a CONT-among-resolved share; share not shown)", "```", json.dumps(pw, indent=1), "```"]
    (SUM / "STAGE0.md").write_text("\n".join(md), encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    main()
