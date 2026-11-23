"""ladder-anchor-sweep scoring (forge/LADDER_ANCHOR_SWEEP_PREREG.md).

    python scripts/ladder-anchor-sweep/score.py   -> analysis/output/ladder-anchor-sweep/{results.json, report.txt, grid.csv}
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "analysis/output/ladder-anchor-sweep"
SEED, B, BLOCK = 20261123, 2000, 63
SYMS = ("NQ", "GC", "6E", "6J")
ROWS_F = {"NQ": "analysis/output/ladder-per-line/build/nq", "GC": "analysis/output/ladder-per-line/build/gold",
          "6E": "analysis/output/ladder-per-line/build/eurusd", "6J": "analysis/output/ladder-v2-usdjpy"}
LINES = ("hl", "oh", "ol")
CHOOSE, CONFIRM = (2020, 2022), (2023, 2026)
ORACLE_BAR = {"hl": 30.0, "oh": 15.0, "ol": 15.0}
LOG: list[str] = []


def say(s=""):
    sys.stdout.reconfigure(encoding="utf-8")
    print(s, flush=True)
    LOG.append(str(s))


def skill(p, b):
    return (1 - np.nansum(p, axis=0) / np.nansum(b, axis=0)) * 100


def delta(P, Bm, rows, A):
    """Skill(A) - Skill(00) on the labels both anchors have (A2), pp."""
    p, b = P[rows], Bm[rows]
    m = np.isfinite(p[:, A]) & np.isfinite(p[:, 0])
    if not m.any():
        return np.nan
    return ((1 - p[m, A].sum() / b[m, A].sum()) - (1 - p[m, 0].sum() / b[m, 0].sum())) * 100


def deltas_all(P, Bm, rows):
    return np.array([0.0] + [delta(P, Bm, rows, A) for A in range(1, 24)])


def main():
    rng = np.random.default_rng(SEED)
    Q = pd.concat([pd.read_parquet(OUT / f"q_{s}.parquet") for s in SYMS], ignore_index=True)
    Q["ly"] = pd.DatetimeIndex(Q["label"]).year
    labels = np.array(sorted(Q["label"].unique()))
    L = len(labels)
    li = {d: i for i, d in enumerate(labels)}
    Q["g"] = Q["label"].map(li)
    res = {"seed": SEED, "controls": {}, "cells": {}}

    # ---- control 1: A=00 realised lines vs rows_F
    c1 = {}
    for s in SYMS:
        t0 = pd.read_parquet(OUT / f"a00_lines_{s}.parquet").set_index("label")
        rf = pd.read_parquet(ROOT / ROWS_F[s] / "rows_F.parquet").set_index("date")
        j = t0.join(rf[list(LINES)], rsuffix="_r", how="inner")
        c1[s] = {q: float((np.abs(j[q] / j[q + "_r"] - 1) < 0.005).mean() * 100) for q in LINES} | {"n": len(j)}
    ok1 = all(v[q] >= 95 for v in c1.values() for q in LINES)
    say("control 1 (A=00 lines match rows_F within 0.5%): " + "; ".join(
        f"{s} " + "/".join(f"{v[q]:.1f}" for q in LINES) + f"% of {v['n']}" for s, v in c1.items()) + (" PASS" if ok1 else " FAIL"))
    res["controls"]["mechanics"] = {"pass": ok1, **c1}

    # ---- matrices per cell: [label, anchor]
    cells = {}
    for s in SYMS:
        for q in LINES:
            X = Q[(Q.sym == s) & (Q.line == q)]
            P, Bm, O = (np.full((L, 24), np.nan) for _ in range(3))
            P[X.g, X.anchor], Bm[X.g, X.anchor], O[X.g, X.anchor] = X.q_pick, X.q_base, X.q_oracle
            cells[(s, q)] = (P, Bm, O, X)
    yrs = pd.DatetimeIndex(labels).year.to_numpy()
    in_ = lambda r: (yrs >= r[0]) & (yrs <= r[1])

    # ---- control 2: oracle skill at every anchor
    worst = {q: 1e9 for q in LINES}
    for (s, q), (P, Bm, O, X) in cells.items():
        worst[q] = min(worst[q], float(np.nanmin(skill(O, Bm))))
    ok2 = all(worst[q] > ORACLE_BAR[q] for q in LINES)
    say("control 2 (oracle skill, worst anchor x instrument): " + ", ".join(f"{q} {worst[q]:+.1f} pp (bar {ORACLE_BAR[q]:.0f})" for q in LINES)
        + (" PASS" if ok2 else " FAIL"))
    res["controls"]["oracle"] = {"pass": ok2, "worst_pp": worst}
    if not (ok1 and ok2):
        say("controls failed: stop")
        (OUT / "report.txt").write_text("\n".join(LOG) + "\n", encoding="utf-8")
        return

    # ---- grid (all test years) + choose/confirm
    grid, deltas = [], {}
    ch, cf = in_(CHOOSE), in_(CONFIRM)
    for (s, q), (P, Bm, O, X) in cells.items():
        sk_all, sk_ch, sk_cf = skill(P, Bm), skill(P[ch], Bm[ch]), skill(P[cf], Bm[cf])
        picks = X.groupby("anchor")["pick"].agg(lambda v: v.value_counts().index[0])
        rawq = X.groupby("anchor")["q_pick"].mean()
        for A in range(24):
            grid.append({"sym": s, "line": q, "anchor": A, "skill_all": sk_all[A], "skill_2020_22": sk_ch[A],
                         "delta_vs00_paired": 0.0 if A == 0 else float(delta(P, Bm, in_((2020, 2026)), A)),
                         "skill_2023_26": sk_cf[A], "qlike_pick": float(rawq.get(A, np.nan)), "model": picks.get(A, "")})
        dch = deltas_all(P, Bm, ch)
        Astar = int(np.nanargmax(dch))
        d = float(delta(P, Bm, cf, Astar)) if Astar != 0 else 0.0
        dall = deltas_all(P, Bm, in_((2020, 2026)))
        deltas[(s, q)] = (Astar, d)
        res["cells"][f"{s}_{q}"] = {"A_star": Astar, "skill00_all": float(sk_all[0]), "skillA_all": float(sk_all[Astar]),
                                    "choose_gain_pp": float(dch[Astar]), "confirm_delta_pp": d,
                                    "best_all_A": int(np.nanargmax(dall)), "best_all_gain_pp": float(np.nanmax(dall))}
    G = pd.DataFrame(grid)
    G.to_csv(OUT / "grid.csv", index=False)

    # ---- bootstrap: pooled confirm-half delta (paired labels, 63-label blocks)
    idx_cf = np.flatnonzero(cf)
    nb = len(idx_cf)
    starts = rng.integers(0, max(1, nb - BLOCK + 1), size=(B, int(np.ceil(nb / BLOCK))))
    draws = (starts[:, :, None] + np.arange(BLOCK)[None, None, :]).reshape(B, -1)[:, :nb]
    draws = idx_cf[np.minimum(draws, nb - 1)]
    pooled = np.zeros(B)
    for (s, q), (P, Bm, O, X) in cells.items():
        A, _ = deltas[(s, q)]
        if A == 0:
            continue
        for k, dr in enumerate(draws):
            pooled[k] += delta(P, Bm, dr, A)
    pooled /= len(cells)
    pt = float(np.mean([d for _, d in deltas.values()]))
    ci = [float(np.quantile(pooled, .05)), float(np.quantile(pooled, .95))]
    npos = sum(d > 0 for _, d in deltas.values())
    v = "VALIDATED" if ci[0] > 0 and npos >= 8 else ("NULL" if ci[1] < 1.0 else "UNDERPOWERED")
    res.update(pooled_confirm_delta_pp=pt, ci90=ci, cells_positive=npos, verdict=v)

    # ---- descriptive: max over anchors of the all-years delta vs a centred bootstrap (how big best-of-24 looks by chance)
    idx_all = np.flatnonzero(in_((2020, 2026)))
    na = len(idx_all)
    st = rng.integers(0, na - BLOCK + 1, size=(500, int(np.ceil(na / BLOCK))))
    dra = idx_all[np.minimum((st[:, :, None] + np.arange(BLOCK)[None, None, :]).reshape(500, -1)[:, :na], na - 1)]
    chance = {}
    for (s, q), (P, Bm, O, X) in cells.items():
        dhat = deltas_all(P, Bm, idx_all)
        mx = np.array([np.nanmax(deltas_all(P, Bm, dr) - dhat) for dr in dra])
        thr = float(np.quantile(mx, .95))
        chance[f"{s}_{q}"] = {"best_A": int(np.nanargmax(dhat)), "best_gain_pp": float(np.nanmax(dhat)), "chance95_pp": thr,
                              "anchors_above_chance": [int(a) for a in np.flatnonzero(dhat > thr)]}
    res["max_over_anchors"] = chance

    # ---- report
    say("")
    say("Skill vs same-anchor baseline (pp, all test years 2020-2026.08, each anchor on its own windows):")
    for s in SYMS:
        for q in LINES:
            g = G[(G.sym == s) & (G.line == q)].set_index("anchor")
            say(f"  {s:3s} {q}: " + " ".join(f"{A:02d}:{g.skill_all[A]:+.1f}" for A in range(24)))
    say("")
    say("Delta skill vs 00 on shared days (pp, all test years):")
    for s in SYMS:
        for q in LINES:
            g = G[(G.sym == s) & (G.line == q)].set_index("anchor")
            say(f"  {s:3s} {q}: " + " ".join(f"{A:02d}:{g.delta_vs00_paired[A]:+.1f}" for A in range(1, 24)))
    say("")
    say("Choose A* on 2020-22, confirm 2023-26 (delta skill vs 00, pp):")
    for (s, q), (A, d) in deltas.items():
        c = res["cells"][f"{s}_{q}"]; ch_ = chance[f"{s}_{q}"]
        say(f"  {s:3s} {q}: A*={A:02d} choose-half gain {c['choose_gain_pp']:+.2f}, confirm {d:+.2f} | all-years best {ch_['best_A']:02d} "
            f"{ch_['best_gain_pp']:+.2f} (chance-95 {ch_['chance95_pp']:.2f}; above chance: {ch_['anchors_above_chance'] or 'none'})")
    say("")
    say(f"POOLED confirm-half delta {pt:+.2f} pp [{ci[0]:+.2f}, {ci[1]:+.2f}], {npos}/12 cells positive -> {v}")
    (OUT / "report.txt").write_text("\n".join(LOG) + "\n", encoding="utf-8")
    json.dump(res, open(OUT / "results.json", "w"), indent=1, default=str)


if __name__ == "__main__":
    main()
