"""Analog days: "what did days like today do?" — first version (2026-10-13).

    python scripts/dayread/analog_days.py            # walk-forward check + today's read for every instrument

Day state at the open (the chosen forecast's own live inputs): regime (sigma vs its usual level), res1 / res5 (how far the
last 1 / 5 days ran past their lines), implied vol vs sigma, weekday. History: VF3 Stage B point-in-time rows
(analysis/output/vf3_stage_b/part1_lines.parquet, 2020-08 -> 2026-08-20), outcomes measured against EACH day's own chosen
lines (persistence + IV where implied vol exists, else persistence).

For a day: the K most similar earlier days of the same instrument (standardised distance on the state, same weekday
preferred) and what they did: day type (H-L below median / median-p75 / p75-p90 / beyond p90), O->H and O->L lines reached,
up or down close, high before low, hour of the high and the low.

Walk-forward check (2023-01 -> 2026-08): each day's analog read uses only earlier days; Brier vs the line's own nominal
rate (50/25/10) and vs the instrument's running base rate. Today's read uses the live /api/vol-forecast/persist-ladder/json.
"""
import json
import sys
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd

OUT = Path("analysis/output/dayread")
K = 40
FEAT = ["regime", "res1", "res5", "iv_sig"]
WD = ["Mon", "Tue", "Wed", "Thu", "Fri"]
LIVE = {"SPX": "SPX500", "DOW": "US30"}
H = "https://macrofxmodel-production.up.railway.app"


def load():
    d = pd.read_parquet("analysis/output/vf3_stage_b/part1_lines.parquet")
    d = d[d.oos == 1].copy()
    rows = []
    for inst, g in d.groupby("inst"):
        arm = "SI" if g["SI_hl_p50"].notna().mean() > 0.5 else "S"
        g = g[g[f"{arm}_hl_p50"].notna()].copy()
        for t in ("oh", "ol", "hl"):
            for p in ("p50", "p75", "p90"):
                g[f"L_{t}_{p}"] = g[f"{arm}_{t}_{p}"]
        g["inst"] = LIVE.get(inst, inst)
        g["iv_sig"] = g["iv_sig"].fillna(0.0)
        rows.append(g)
    d = pd.concat(rows, ignore_index=True)
    d["y_hl75"] = (d.r_hl >= d.L_hl_p75).astype(float)
    d["y_hl90"] = (d.r_hl >= d.L_hl_p90).astype(float)
    d["y_hl50"] = (d.r_hl >= d.L_hl_p50).astype(float)
    d["type"] = np.select([d.r_hl < d.L_hl_p50, d.r_hl < d.L_hl_p75, d.r_hl < d.L_hl_p90], ["below median", "median-p75", "p75-p90"], "beyond p90")
    for s in ("oh", "ol"):
        for p in ("p50", "p75", "p90"):
            d[f"y_{s}{p[1:]}"] = (d[f"r_{s}"] >= d[f"L_{s}_{p}"]).astype(float)
    d["y_up"] = (d.r_ocs > 0).astype(float)
    d["y_hfirst"] = (d.min_high < d.min_low).astype(float)
    return d.sort_values(["inst", "date"]).reset_index(drop=True)


def neighbours(hist, state, k=K):
    X = hist[FEAT].to_numpy(float)
    mu, sd = X.mean(0), X.std(0) + 1e-9
    z = (X - mu) / sd
    s = (np.array([state[f] for f in FEAT], float) - mu) / sd
    dist = np.sqrt(((z - s) ** 2).sum(1)) + np.where(hist.wd.to_numpy() == state["wd"], 0.0, 0.75)
    return hist.iloc[np.argsort(dist)[:k]]


TARGETS = {"y_hl75": 0.25, "y_hl90": 0.10, "y_hl50": 0.50, "y_oh75": 0.25, "y_ol75": 0.25, "y_up": 0.50, "y_hfirst": 0.50}


def walk_forward(d, start="2023-01-01"):
    out = []
    for inst, g in d.groupby("inst"):
        g = g.reset_index(drop=True)
        for i in np.flatnonzero(g.date.to_numpy() >= start):
            hist = g.iloc[:i]
            if len(hist) < 250:
                continue
            nb = neighbours(hist, g.iloc[i])
            rec = {"inst": inst, "date": g.date.iloc[i]}
            for t in TARGETS:
                rec[f"p_{t}"] = (nb[t].sum() + 1) / (len(nb) + 2)
                rec[f"b_{t}"] = hist[t].mean()                      # instrument's running base rate
                rec[t] = g[t].iloc[i]
            out.append(rec)
    return pd.DataFrame(out)


def skill(W):
    res = {}
    for t, nom in TARGETS.items():
        y, p, b = W[t].to_numpy(), W[f"p_{t}"].to_numpy(), W[f"b_{t}"].to_numpy()
        bs = lambda q: np.mean((q - y) ** 2)
        # date-block bootstrap of skill vs the running base rate
        dates = W.date.to_numpy()
        u, inv = np.unique(dates, return_inverse=True)
        e_p, e_b = np.bincount(inv, (p - y) ** 2), np.bincount(inv, (b - y) ** 2)
        rng = np.random.default_rng(1)
        st = rng.integers(0, len(u) - 5, (1000, len(u) // 5 + 1))
        idx = (st[:, :, None] + np.arange(5)).reshape(1000, -1)[:, :len(u)]
        sk = 1 - e_p[idx].sum(1) / e_b[idx].sum(1)
        q = pd.qcut(p, 5, labels=False, duplicates="drop")
        cal = pd.DataFrame({"q": q, "p": p, "y": y}).groupby("q").agg(pred=("p", "mean"), real=("y", "mean")).round(3)
        res[t] = {"realised": round(float(y.mean()), 3), "nominal": nom, "brier_skill_vs_nominal_%": round(100 * (1 - bs(p) / bs(np.full_like(p, nom))), 2),
                  "brier_skill_vs_base_%": round(100 * (1 - bs(p) / bs(b)), 2), "ci95_vs_base_%": [round(100 * x, 2) for x in np.quantile(sk, [0.025, 0.975])],
                  "quintiles_pred_vs_real": cal.to_dict("records")}
    return res


def today(d):
    j = json.loads(urllib.request.urlopen(f"{H}/api/vol-forecast/persist-ladder/json", timeout=90).read())
    reads = {}
    for name, lad in j["instruments"].items():
        f = lad.get("features") or {}
        if not f:
            continue
        hist = d[d.inst == name]
        if len(hist) < 250:
            continue
        wd = next((WD[i] for i in range(1, 5) if f.get(f"wd{i}")), "Mon")
        st = {"regime": f["regime"], "res1": f["res1"], "res5": f["res5"], "iv_sig": f.get("iv_sig") or 0.0, "wd": wd}
        nb = neighbours(hist, st)
        reads[name] = {"session": j["session_date"], "state": st, "n": len(nb), "dates": nb.date.tolist()[:10],
                       "type": nb.type.value_counts(normalize=True).reindex(["below median", "median-p75", "p75-p90", "beyond p90"]).fillna(0).round(2).to_dict(),
                       "oh_reached": {p: round(float(nb[f"y_oh{p}"].mean()), 2) for p in ("50", "75", "90")},
                       "ol_reached": {p: round(float(nb[f"y_ol{p}"].mean()), 2) for p in ("50", "75", "90")},
                       "up_close": round(float(nb.y_up.mean()), 2), "high_first": round(float(nb.y_hfirst.mean()), 2),
                       "hour_high_median": int(nb.min_high.median() // 60), "hour_low_median": int(nb.min_low.median() // 60),
                       "lines": {k: lad.get(k) for k in ("oh", "ol", "hl")}}
    return reads


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    d = load()
    if "--today-only" not in sys.argv:
        W = walk_forward(d)
        W.to_parquet(OUT / "walk_forward.parquet")
        S = skill(W)
        (OUT / "walk_forward_skill.json").write_text(json.dumps(S, indent=1))
        for t, v in S.items():
            print(f"{t:9s} real {v['realised']:.3f} nominal {v['nominal']:.2f}  skill vs nominal {v['brier_skill_vs_nominal_%']:6.2f}%  vs base {v['brier_skill_vs_base_%']:6.2f}% {v['ci95_vs_base_%']}")
    R = today(d)
    (OUT / "today.json").write_text(json.dumps(R, indent=1, default=str))
    for n, r in R.items():
        print(n, r["type"], "OH", r["oh_reached"], "OL", r["ol_reached"], "up", r["up_close"], "hi-first", r["high_first"], "H@", r["hour_high_median"], "L@", r["hour_low_median"])
