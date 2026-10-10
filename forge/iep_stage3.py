"""iep_stage3 — Stage 3 of forge/INTRADAY_EXTREME_PATHS_PREREG.md, as registered (with the 2026-10-10 clarification).

    python -m forge.iep_stage3

Late stratum (h 19-21, H = 1 h, 1.0u) and Family C (class x regime x hour band x displacement tercile; outcomes CONT|res, CONS, S2 extension)
on Validation 2022-2024; BH-FDR 10%; global permutation test (max |z|, outcomes shuffled across sessions within instrument x hour, 200 draws);
empirical-Bayes shrinkage toward class x band (m = 30). Survivors are re-read on 2025-01 .. 2026-08-20, labelled NON-INDEPENDENT.
Horizon: H = 2 h for h <= 18 (bands asia..ny), H = 1 h for the late band (h 19-21); each cell is compared with its class's pooled share
at the same horizon. Displacement terciles for the late hours are fitted here on discovery rows only (none existed).
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from forge.iep_build import JOBS, OUT, SUM, cls_of, DISC_END
from forge.iep_stage2 import ols_cr1, bh

VAL0, VAL1, CONF1 = "2022-01-01", "2025-01-01", "2026-08-21"
RNG = np.random.default_rng(20261012)
BAND = lambda h: np.select([h < 7, h < 12, h < 16, h < 19], ["asia", "london", "overlap", "ny"], "late")


def load():
    cols = ["inst", "date", "h", "D", "sigRel", "res1_1.0", "res2_1.0", "xhi1", "xlo1", "xhi2", "xlo2"]
    d = pd.concat([pd.read_parquet(OUT / f"{s}.parquet", columns=cols) for s in JOBS], ignore_index=True)
    d = d[d.date < CONF1]
    d["cls"] = d.inst.map(cls_of)
    d["band"] = BAND(d.h.to_numpy())
    d["o"] = np.where(d.D >= 0.25, 1, np.where(d.D <= -0.25, -1, 0))
    q = pd.read_csv(SUM / "large_move_tercile_edges_disc.csv")
    d = d.merge(q, on=["cls", "h"], how="left")
    d["large"] = (d.o != 0) & (d.D.abs() >= 0.5) & (d.D.abs() >= d.q67)
    d = d[d.large].copy()
    d["absD"] = d.D.abs()
    ed = json.loads((SUM / "stage2_edges_disc.json").read_text())
    de = pd.DataFrame(ed["disp"])
    late = d[(d.date < DISC_END) & (d.band == "late")].groupby(["cls", "h"]).absD.quantile([1 / 3, 2 / 3]).unstack()
    late.columns = ["disp_q1", "disp_q2"]
    de = pd.concat([de, late.reset_index()], ignore_index=True)
    de.to_csv(SUM / "stage3_disp_edges_disc.csv", index=False)
    d = d.merge(de, on=["cls", "h"], how="left")
    d["disp"] = np.select([d.absD <= d.disp_q1, d.absD <= d.disp_q2], ["d1", "d2"], "d3")
    d["reg"] = np.select([d.sigRel < 0.85, d.sigRel <= 1.15], ["quiet", "normal"], "busy")
    d.loc[d.sigRel.isna(), "reg"] = "na"
    H = np.where(d.band == "late", 1, 2)
    r = np.where(H == 1, d["res1_1.0"], d["res2_1.0"])
    d["H"] = H
    d["CONT"] = np.where(r * d.o == 1, 1.0, np.where(r * d.o == -1, 0.0, np.nan))
    d["CONS"] = np.where(r == 0, 1.0, np.where(np.isin(r, [1, -1]), 0.0, np.nan))
    xe = np.where(d.o == 1, np.where(H == 1, d.xhi1, d.xhi2), np.where(H == 1, d.xlo1, d.xlo2))
    d["S2"] = np.where(np.isin(r, [-9]) | np.isnan(xe), np.nan, (xe >= 0.25).astype(float))
    d.loc[d.h + d.H > 22, ["CONT", "CONS", "S2"]] = np.nan
    d["block"] = np.select([d.date < VAL0, d.date < VAL1], ["disc", "val"], "conf")
    return d


def cell_stats(g, y, base):
    v = g[y].to_numpy()
    b, V, G = ols_cr1(v - base, np.ones((len(v), 1)), g.date.to_numpy())
    se = np.sqrt(V[0, 0])
    return b[0], se, G


def scan(v, outcomes=("CONT", "CONS", "S2")):
    rows = []
    for o in outcomes:
        vv = v[v[o].notna() & (v.reg != "na")]
        base = vv.groupby(["cls", "H"])[o].mean()
        for (cl, reg, bd, dp), g in vv.groupby(["cls", "reg", "band", "disp"]):
            if g[["inst", "date"]].drop_duplicates().shape[0] < 200:
                continue
            bse = base[(cl, g.H.iloc[0])]
            eff, se, G = cell_stats(g, o, bse)
            rows.append({"outcome": o, "cls": cl, "reg": reg, "band": bd, "disp": dp, "n": len(g), "dates": G,
                         "share%": round(100 * g[o].mean(), 2), "class_base%": round(100 * bse, 2), "eff_pp": 100 * eff, "se_pp": 100 * se, "z": eff / se})
    R = pd.DataFrame(rows)
    from scipy import stats
    R["p"] = 2 * stats.norm.sf(R.z.abs())
    R["q_bh"] = bh(R.p.to_numpy())
    return R


def perm_maxz(v, n=200):
    """Global null: shuffle each outcome across sessions within instrument x hour; max |z| over eligible cells (z with a naive
    date-clustered SE computed by grouping), compared with the observed max |z|."""
    out = {}
    for o in ("CONT", "CONS", "S2"):
        vv = v[v[o].notna() & (v.reg != "na")].copy()
        vv["cell"] = vv.cls + "|" + vv.reg + "|" + vv.band + "|" + vv.disp
        sizes = vv.groupby("cell").apply(lambda g: g[["inst", "date"]].drop_duplicates().shape[0])
        keep = sizes[sizes >= 200].index
        vv = vv[vv.cell.isin(keep)]
        base = vv.groupby(["cls", "H"])[o].transform("mean").to_numpy()
        grp = vv.groupby(["inst", "h"]).indices

        def maxz(y):
            e = y - base
            t = pd.DataFrame({"cell": vv.cell.to_numpy(), "date": vv.date.to_numpy(), "e": e})
            s = t.groupby(["cell", "date"]).e.sum()
            num = s.groupby(level=0).sum()
            den = np.sqrt((s ** 2).groupby(level=0).sum())
            return float((num / den).abs().max())

        y0 = vv[o].to_numpy()
        obs = maxz(y0)
        null = []
        for _ in range(n):
            y = y0.copy()
            for idx in grp.values():
                y[idx] = y[idx][RNG.permutation(len(idx))]
            null.append(maxz(y))
        out[o] = {"observed_max_abs_z": round(obs, 2), "null_p95": round(float(np.quantile(null, 0.95)), 2), "p_global": float((np.array(null) >= obs).mean() + 1 / n)}
    return out


def shrink(R, v):
    # EB shrinkage of each cell's share toward its class x band share (m = 30 pseudo-sessions)
    out = []
    for _, r in R.iterrows():
        vv = v[v[r.outcome].notna() & (v.cls == r.cls) & (v.band == r.band)]
        parent = vv[r.outcome].mean()
        out.append(round(100 * (r["share%"] / 100 * r.n + 30 * parent) / (r.n + 30), 2))
    R["shrunk%"] = out
    return R


def late_stratum(v):
    rows = []
    for cl, g in v[(v.band == "late")].groupby("cls"):
        res = g[g.CONT.notna()]
        e, se, G = cell_stats(res, "CONT", 0.5)
        nonlate = v[(v.band != "late") & (v.cls == cl) & (v.H == 1)]
        rows.append({"class": cl, "CONT|res%": round(100 * (0.5 + e), 2), "vs 50 pp": round(100 * e, 2), "ci": f"±{196 * se:.2f}", "n": len(res), "dates": G,
                     "CONS% (H=1)": round(100 * g.CONS.mean(), 1),
                     "per-year CONT|res%": {yr: round(100 * gg.CONT.mean(), 1) for yr, gg in res.groupby(res.date.str[:4])}})
    return pd.DataFrame(rows)


def main():
    d = load()
    v = d[d.block == "val"]
    R = shrink(scan(v), v)
    surv = R[R.q_bh <= 0.10].copy()
    c = d[d.block == "conf"]
    conf = []
    for _, r in surv.iterrows():
        g = c[(c.cls == r.cls) & (c.reg == r.reg) & (c.band == r.band) & (c.disp == r.disp) & c[r.outcome].notna()]
        base = c[(c.cls == r.cls) & (c.H == (1 if r.band == "late" else 2)) & c[r.outcome].notna()][r.outcome].mean()
        if len(g) < 30:
            conf.append({"n_conf": len(g)})
            continue
        e, se, G = cell_stats(g, r.outcome, base)
        conf.append({"n_conf": len(g), "conf_eff_pp": round(100 * e, 2), "conf_ci": f"±{196 * se:.2f}", "same_sign": bool(np.sign(e) == np.sign(r.eff_pp)),
                     "ci_excl_0": bool(abs(e) > 1.96 * se)})
    surv = pd.concat([surv.reset_index(drop=True), pd.DataFrame(conf)], axis=1)
    P = perm_maxz(v)
    L = late_stratum(v)
    Lc = late_stratum(c)
    md = ["# IEP Stage 3 (registered): late stratum + Family C", "",
          f"Validation rows (large moves): {len(v):,}; eligible cells x outcomes: {len(R)}; BH-FDR 10% survivors: {len(surv)}.", "",
          "## Late stratum (h 19-21, H = 1 h, 1.0u) — Validation 2022-2024 (the known 20-22 UTC reversal prior)", "```", L.to_string(index=False), "```",
          "Same, 2025-01..2026-08-20 (NON-INDEPENDENT: explored in earlier research)", "```", Lc.to_string(index=False), "```", "",
          "## Family C global permutation test (max |z| over eligible cells)", "```", json.dumps(P, indent=1), "```", "",
          "## Family C survivors (BH-FDR 10%) with the non-independent 2025-26 re-read", "```",
          surv.round(3).to_string(index=False) if len(surv) else "none", "```", "",
          "## All eligible cells (sorted by p)", "```", R.sort_values("p").round(3).to_string(index=False), "```"]
    (SUM / "STAGE3.md").write_text("\n".join(md), encoding="utf-8")
    R.to_csv(SUM / "stage3_cells.csv", index=False)
    print("\n".join(md[:40]).encode("ascii", "replace").decode())


if __name__ == "__main__":
    main()
