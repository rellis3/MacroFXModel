"""VF3 Stage B, Part 3: the V3 page's own intraday probabilities, scored (forge/VF3_STAGE_B_PLAN.md Part 3).

    PYTHONPATH=. python scripts/forecast_history/vf3_stage_b_part3.py

J2 path stats: P(next O-H/O-L rung by 22:00 | this rung touched) = OOS exceed(next) / exceed(this) from the current params (static).
K3 card "x% to median": 2(1 - Phi((1 - consumed) / sqrt(1 - t_utc))) with consumed = running H-L / COG HL median, t_utc = UTC clock fraction.
Each is scored on the test block 2022-01-01..2024-12-31 (oos rows) against what happened, and against a simple empirical baseline
fitted on earlier rows (J2: by touch-hour; K3: by London hour x consumed decile). Retrospective; writes PART3.md.
"""
from __future__ import annotations

import json
import subprocess
from math import erf, sqrt
from pathlib import Path

import numpy as np
import pandas as pd

OUT = Path("analysis/output/vf3_stage_b")
FH = Path("analysis/output/forecast_history")
T0, T1 = "2022-01-01", "2025-01-01"


def params_oos():
    js = "import('./js/forecastLadderParams.js').then(m=>console.log(JSON.stringify(Object.fromEntries(Object.entries(m.LADDER_PARAMS.pairs).map(([k,v])=>[k,v.oos_exceed])))))"
    return json.loads(subprocess.check_output(["node", "-e", js], text=True))


def brier_skill(y, p, b):
    return 1 - np.mean((p - y) ** 2) / np.mean((b - y) ** 2)


def calib(y, p, k=10):
    q = pd.qcut(p, k, labels=False, duplicates="drop")
    t = pd.DataFrame({"q": q, "p": p, "y": y}).groupby("q").agg(p=("p", "mean"), y=("y", "mean"), n=("y", "size"))
    return round(float((t.p - t.y).abs().max() * 100), 1)


def part_j2(X, oos):
    rows, recs = [], []
    for side, S in (("OH", "oh"), ("OL", "ol")):
        for a, b in (("p50", "p75"), ("p75", "p90")):
            fa, fb = X[f"ft_{side}_{a}"], X[f"ft_{side}_{b}"]
            t = X[fa.notna()].copy()
            t["y"] = (fb[fa.notna()].notna() & (fb[fa.notna()] >= fa[fa.notna()])).astype(float)
            t["hour"] = (fa[fa.notna()] // 60).astype(int)
            t["claim"] = [oos.get({"US30": "DOW", "SPX500": "SPX"}.get(i, i), {}).get(f"{S}_{b}", np.nan) / max(oos.get({"US30": "DOW", "SPX500": "SPX"}.get(i, i), {}).get(f"{S}_{a}", np.nan), 1e-9) for i in t.inst]
            est = t[t.date < T0]
            emp = est.groupby("hour").y.mean()
            te = t[(t.date >= T0) & (t.date < T1) & (t.oos == 1) & t.claim.notna()].copy()
            te["emp"] = te.hour.map(emp).fillna(est.y.mean())
            y, pc, pe = te.y.to_numpy(), te.claim.clip(0, 1).to_numpy(), te.emp.to_numpy()
            rows.append({"step": f"{side} {a}->{b}", "n": len(te), "realised %": round(100 * y.mean(), 1), "static claim %": round(100 * pc.mean(), 1),
                         "Brier skill of hour-empirical over static": round(100 * brier_skill(y, pe, pc), 1), "calib gap static pp": calib(y, pc),
                         "calib gap hour-empirical pp": calib(y, pe)})
            byh = te.groupby("hour").agg(n=("y", "size"), realised=("y", "mean"), claim=("claim", "mean"))
            byh = byh[byh.n >= 100]
            recs.append((f"{side} {a}->{b}", (byh[["realised", "claim"]] * 100).round(1).join(byh.n)))
    return pd.DataFrame(rows), recs


def part_k3(X, C):
    ph = lambda x: 0.5 * (1 + erf(x / sqrt(2)))
    t = X.merge(C, on=["inst", "date"], how="inner")
    out = []
    for h in range(2, 21):
        run = t[f"oh_h{h}"] + t[f"ol_h{h}"]
        m = run < t.C_hl_p50
        g = t[m].copy()
        g["h"] = h
        g["consumed"] = (run[m] / g.C_hl_p50).clip(0, 1)
        dt = pd.to_datetime(g.date) + pd.to_timedelta(h, unit="h")
        utc = dt.dt.tz_localize("Europe/London").dt.tz_convert("UTC")
        g["tf"] = np.minimum(0.99, (utc.dt.hour * 60 + utc.dt.minute) / 1440)
        z = (1 - g.consumed) / np.sqrt(np.maximum(0.01, 1 - g.tf))
        g["k3"] = [max(0, min(1, 2 * (1 - ph(v)))) for v in z]
        g["y"] = (g.r_hl >= g.C_hl_p50).astype(float)
        out.append(g[["inst", "date", "oos", "h", "consumed", "k3", "y"]])
    G = pd.concat(out, ignore_index=True)
    G["cdec"] = pd.cut(G.consumed, np.linspace(0, 1, 11), labels=False, include_lowest=True)
    est = G[G.date < T0]
    emp = est.groupby(["h", "cdec"]).y.mean()
    te = G[(G.date >= T0) & (G.date < T1) & (G.oos == 1)].copy()
    te["emp"] = [emp.get((a, b), np.nan) for a, b in zip(te.h, te.cdec)]
    te = te[te.emp.notna()]
    y, pk, pe = te.y.to_numpy(), te.k3.to_numpy(), te.emp.to_numpy()
    summ = {"n": len(te), "realised %": round(100 * y.mean(), 1), "K3 mean %": round(100 * pk.mean(), 1),
            "Brier K3": round(float(np.mean((pk - y) ** 2)), 4), "Brier hour x consumed empirical": round(float(np.mean((pe - y) ** 2)), 4),
            "skill of empirical over K3 %": round(100 * brier_skill(y, pe, pk), 1), "calib gap K3 pp": calib(y, pk), "calib gap empirical pp": calib(y, pe)}
    byh = te.groupby("h").agg(n=("y", "size"), realised=("y", "mean"), K3=("k3", "mean"), empirical=("emp", "mean"))
    byh[["realised", "K3", "empirical"]] = (byh[["realised", "K3", "empirical"]] * 100).round(1)
    return summ, byh


def main():
    cols = ["inst", "date", "oos", "r_hl"] + [f"ft_{s}_{r}" for s in ("OH", "OL") for r in ("p50", "p75", "p90")] + \
           [f"oh_h{k}" for k in range(1, 23)] + [f"ol_h{k}" for k in range(1, 23)]
    X = pd.concat([pd.read_csv(f, usecols=lambda c: c in cols + ["last_min"]) for f in sorted(FH.glob("*.csv"))], ignore_index=True)
    X = X[X.last_min >= 1200]
    oos = params_oos()
    j2, recs = part_j2(X, oos)
    C = pd.read_parquet(OUT / "part1_lines.parquet", columns=["inst", "date", "C_hl_p50"])
    k3s, k3h = part_k3(X, C)
    md = ["# VF3 Stage B, Part 3: the page's own intraday probabilities (test block 2022-2024, oos rows; retrospective)", "",
          "## J2 path stats (static P(next rung | this rung) from the params' OOS exceedance) vs what happened", "```", j2.to_string(index=False), "```", ""]
    for name, t in recs:
        md += [f"### {name}: by London hour of the first touch (%; hours with >= 100 touches)", "```", t.to_string(), "```", ""]
    md += ["## K3 card 'x% to median' (Brownian, UTC clock, COG HL median) vs what happened; rows where the median is not yet reached",
           "Empirical baseline: rate by London hour x consumed decile, fitted on 2020-08..2021-12 rows (the COG lines exist only on Part 1 rows).", "```",
           json.dumps(k3s, indent=1), "```", "```", k3h.to_string(), "```"]
    (OUT / "PART3.md").write_text("\n".join(md), encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    main()
