"""vol-line-touch-layers, step 3: score the confirm window (2023-01-01 -> 2026-08-20) ONCE, from frozen/ only.
Refuses to run unless frozen/ is committed and unchanged in git HEAD.
    python -X utf8 scripts/vol-line-touch-layers/score.py
Writes analysis/output/vol-line-touch-layers/confirm/confirm.json and describe.json.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (BLOCKS, COMBOS, EXC, FROZEN, OUT, SIDES, WT, Boot, holm, load, summ)  # noqa: E402

KEYS = ["inst", "date", "dir", "rung"]
MIN_EFFECT = 0.03


def frozen_committed():
    rel = FROZEN.relative_to(WT).as_posix()
    tracked = subprocess.run(["git", "ls-files", rel], cwd=WT, capture_output=True, text=True).stdout.split()
    dirty = subprocess.run(["git", "status", "--porcelain", rel], cwd=WT, capture_output=True, text=True).stdout.strip()
    return len(tracked) >= 2 and not dirty


def states(E, inp, cuts):
    v = E[inp]
    if inp in ("burst", "common"):
        return v.map({0.0: "0", 1.0: "1"})
    lo, hi = cuts[inp]
    return pd.Series(np.where(v.isna(), None, np.where(v < lo, "T1", np.where(v < hi, "T2", "T3"))), index=E.index)


def years_pos(E, mask, col):
    g = E[mask].groupby("year")[col].mean()
    return {int(k): round(float(v), 4) for k, v in g.items()}, int((g > 0).sum())


def ladder(s, lag, ny):
    """Prereg §4 ladder (reported beside the shared gate's word)."""
    if s["lo"] > 0 and lag > 0 and ny >= 3:
        return "VALIDATED" if s["est"] >= MIN_EFFECT else "CONTEXT"
    if s["lo"] > 0:
        return "CONTEXT"
    if s["est"] > 0 and s["mde80"] > 0.05:
        return "UNDERPOWERED"
    return "NULL"


def describe_exc(E):
    out = {}
    for (b, rung), g in E.groupby(["block", "rung"]):
        for k in EXC:
            q = g[k].quantile([0.25, 0.5, 0.75]).round(4).tolist()
            out.setdefault(f"{b}|p{[50, 75, 90][int(rung) - 1]}", {})[k] = q
        out[f"{b}|p{[50, 75, 90][int(rung) - 1]}"]["n"] = len(g)
    return out


def main():
    assert frozen_committed(), "frozen/ must be committed and unchanged before scoring"
    P = json.loads((FROZEN / "params.json").read_text(encoding="utf-8"))
    T = pd.read_parquet(FROZEN / "confirm_take.parquet")
    E = load("conf")
    assert len(E) == P["n_confirm_rows"] == len(T)
    E = E.merge(T.drop(columns=["minute"]), on=KEYS, how="left", validate="one_to_one")
    boot = Boot(E.date.to_numpy())
    D = E.date.to_numpy()
    res = {"n_touches": len(E), "n_dates": int(E.date.nunique()), "headline": P["headline"], "B1": {}, "B2": {}}

    # B1 + decomposition + by rung + B2
    for side, shape in COMBOS:
        col, lag = f"r_{side}_{shape}", f"r_{side}_{shape}_l1"
        y = E[col].to_numpy()
        cell = {}
        for fs in ("layered", "base"):
            tk = E[f"take_{fs}_{side}_{shape}"].to_numpy(bool)
            s_all = summ(*boot.mean(D, y), n=len(y), ndates=len(boot.u))
            s_tk = summ(*boot.mean(D[tk], y[tk]), n=tk.sum(), ndates=E.date[tk].nunique())
            s_sk = summ(*boot.mean(D[~tk], y[~tk]), n=(~tk).sum(), ndates=E.date[~tk].nunique())
            s_lift = summ(*boot.diff(D[tk], y[tk], D, y))
            s_lag = summ(*boot.mean(D[tk], E[lag].to_numpy()[tk]))
            yrs, ny = years_pos(E, tk, col)
            kind = "picks" if s_tk["lo"] > 0 else ("avoids" if s_lift["lo"] > 0 else "neither")
            rung = {}
            for r_ in (1, 2, 3):
                mk = tk & (E.rung.to_numpy() == r_)
                if mk.sum() >= 30:
                    rung[f"p{[50, 75, 90][r_ - 1]}"] = summ(*boot.mean(D[mk], y[mk]), n=mk.sum(), ndates=E.date[mk].nunique())
            cell[fs] = {"all": s_all, "taken": s_tk, "skipped": s_sk, "lift": s_lift, "lag_taken": s_lag, "years": yrs,
                        "years_pos": ny, "kind": kind, "by_rung": rung, "ladder": ladder(s_tk, s_lag["est"], ny)}
        res["B1"][f"{side}_{shape}"] = cell
        tl = E[f"take_layered_{side}_{shape}"].to_numpy(bool)
        tb = E[f"take_base_{side}_{shape}"].to_numpy(bool)
        d = summ(*boot.diff(D[tl], y[tl], D[tb], y[tb]))
        d["overlap"] = round(float((tl & tb).sum() / max(tl.sum(), 1)), 4)
        res["B2"][f"{side}_{shape}"] = d
        print(side, shape, "layered taken", cell["layered"]["taken"]["est"], cell["layered"]["taken"]["lo"],
              "base taken", cell["base"]["taken"]["est"], "add", d["est"], flush=True)
    ks = [f"{s}_{h}" for s, h in COMBOS]
    for fam, get in (("B1", lambda k: res["B1"][k]["layered"]["taken"]["p_le0"]), ("B2", lambda k: res["B2"][k]["p_le0"])):
        ok = holm(np.array([get(k) for k in ks]))
        res[f"{fam}_holm"] = dict(zip(ks, map(bool, ok)))

    # A: candidates
    res["A"] = []
    for c in P["candidates"]:
        st = states(E, c["input"], P["cuts"])
        mk = ((st == c["state"]) & (E.block == c["block"]) & (E.rung == c["rung"])).to_numpy()
        col = f"r_{c['side']}_{c['shape']}"
        y = E[col].to_numpy()
        s = summ(*boot.mean(D[mk], y[mk]), n=mk.sum(), ndates=E.date[mk].nunique())
        s_lag = summ(*boot.mean(D[mk], E[col + "_l1"].to_numpy()[mk]))
        yrs, ny = years_pos(E, mk, col)
        res["A"].append({**{k: c[k] for k in ("input", "state", "block", "rung", "side", "shape", "mean", "n")},
                         "confirm": s, "lag": s_lag, "years": yrs, "years_pos": ny, "ladder": ladder(s, s_lag["est"], ny)})
    if res["A"]:
        ok = holm(np.array([a["confirm"]["p_le0"] for a in res["A"]]))
        for a, o in zip(res["A"], ok):
            a["holm"] = bool(o)
    (OUT / "confirm").mkdir(parents=True, exist_ok=True)
    (OUT / "confirm/confirm.json").write_text(json.dumps(res, indent=1, default=float), encoding="utf-8")
    Ed = load("disc")
    (OUT / "confirm/describe.json").write_text(json.dumps({"discovery": describe_exc(Ed), "confirm": describe_exc(E)}, indent=1),
                                               encoding="utf-8")
    print("A candidates scored:", len(res["A"]))


if __name__ == "__main__":
    main()
