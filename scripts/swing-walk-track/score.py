#!/usr/bin/env python3
"""swing-walk-track, step 3: score the replayed walk steps (forge/SWING_WALK_TRACK_PREREG.md).

  python scripts/swing-walk-track/score.py count   power from the control (shuffled dots) only; no real dot x outcome product
  python scripts/swing-walk-track/score.py run     the scoring -> analysis/output/swing-walk-track/{RESULTS.md, results.json}

Input: analysis/output/swing-walk-track/_books/steps.csv from replay.mjs. Seed 20261104, B = 2,000 cluster bootstrap
over expiry calendar months. Read-only on its inputs.
"""
import json
import math
import os
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "analysis", "output", "swing-walk-track")
STEPS = os.path.join(OUT, "_books", "steps.csv")
SEED = 20261104
B = 2000
N_PLACEBO = 200
SCORE_FROM, LOCKBOX, HALF = "2020-10-01", "2026-08-21", "2023-09-01"
ANCHORS = ["gammaCentre", "gamma", "strike", "maxPain", "centre"]
NAMES = {"gammaCentre": "gamma centre", "gamma": "gamma best strike", "strike": "strongest strike", "maxPain": "max pain", "centre": "OI centre"}
BUCKETS = [(1, 2), (3, 5), (6, 10), (11, 20), (21, 40)]
BAR = 0.25
INDICES = {"NAS100", "SPX500"}
Z = {0.05: 1.959964, 0.01: 2.575829}


def norm_sf(x):
    return 0.5 * math.erfc(x / math.sqrt(2))


def load():
    d = pd.read_csv(STEPS, dtype={"night": str, "origin": str, "expiry": str})
    d = d[(d["expiry"] >= SCORE_FROM) & (d["expiry"] <= LOCKBOX) & (d["h"] >= 1) & d["sE"].notna() & (d["sigma"] > 0)].copy()
    u = d["sigma"] * np.sqrt(d["h"])
    d["g"] = np.log(d["target"] / d["s0"]) / u
    d["z0"] = np.log(d["sE"] / d["s0"]) / u
    d["m"] = d["ret20"] / (d["sigma"] * np.sqrt(20))
    d["month"] = d["expiry"].str[:7]
    d["bucket"] = pd.cut(d["h"], [0, 2, 5, 10, 20, 40, 10_000], labels=["1-2", "3-5", "6-10", "11-20", "21-40", "41+"]).astype(str)
    return d


def cluster_sums(df, cols):
    return df.groupby("month")[cols].sum()


def beta_boot(df, rng, B=B):
    """beta = sum(g z0) / sum(g^2), percentile CI from resampling expiry months."""
    s = df.assign(gz=df["g"] * df["z0"], gg=df["g"] ** 2).groupby("month")[["gz", "gg"]].sum().to_numpy()
    est = s[:, 0].sum() / s[:, 1].sum()
    idx = rng.integers(0, len(s), size=(B, len(s)))
    bs = s[idx].sum(axis=1)
    bb = bs[:, 0] / bs[:, 1]
    lo, hi = np.percentile(bb, [2.5, 97.5])
    se = (hi - lo) / (2 * Z[0.05])
    p = 2 * norm_sf(abs(est) / se) if se > 0 else float("nan")
    return float(est), float(lo), float(hi), float(se), float(p), len(s)


def beta_ctrl(df, rng, B=B):
    """OLS z0 = b g + c m + instrument intercepts; CI on b from resampling expiry months (sums of X'X, X'y)."""
    df = df[df["m"].notna()]
    insts = sorted(df["inst"].unique())
    X = np.column_stack([df["g"], df["m"]] + [(df["inst"] == i).astype(float) for i in insts])
    y = df["z0"].to_numpy()
    months = df["month"].to_numpy()
    um = np.unique(months)
    XtX = np.stack([X[months == mm].T @ X[months == mm] for mm in um])
    Xty = np.stack([X[months == mm].T @ y[months == mm] for mm in um])
    est = np.linalg.lstsq(XtX.sum(0), Xty.sum(0), rcond=None)[0][0]
    idx = rng.integers(0, len(um), size=(B, len(um)))
    bb = np.array([np.linalg.lstsq(XtX[i].sum(0), Xty[i].sum(0), rcond=None)[0][0] for i in idx])
    lo, hi = np.percentile(bb, [2.5, 97.5])
    return float(est), float(lo), float(hi)


def shuffled(df, rng):
    g = df["g"].to_numpy().copy()
    for _, ix in df.groupby(["inst", "bucket"]).indices.items():
        g[ix] = g[ix][rng.permutation(len(ix))]
    return df.assign(g=g)


def holm(p, alpha=0.05):
    order = np.argsort(p)
    adj = np.empty(len(p))
    run = 0.0
    for r, i in enumerate(order):
        run = max(run, min(1.0, (len(p) - r) * p[i]))
        adj[i] = run
    return adj


def bh(p, q=0.10):
    p = np.asarray(p, float)
    n = len(p)
    order = np.argsort(p)
    passed = np.zeros(n, bool)
    k = 0
    for r, i in enumerate(order, 1):
        if p[i] <= q * r / n:
            k = r
    passed[order[:k]] = True
    return passed


def scored(d):
    return d[(d["thin_walk"] == 0) & (d["h"] <= 40)]


def stage_count():
    d = load()
    rng = np.random.default_rng(SEED)
    rows = {}
    for a in ANCHORS:
        x = scored(d[d["anchor"] == a])
        ctrl = shuffled(x, rng)
        _, lo, hi, se, _, nm = beta_boot(ctrl, rng)
        mde = (Z[0.01] + 0.841621) * se          # Holm's first step: alpha 0.05 / 5 = 0.01, two-sided, 80% power
        # code check: plant 0.5 of the dot's gap on the shuffled-dot copy; beta must come back ~0.5 (no real product used)
        planted = beta_boot(ctrl.assign(z0=ctrl["z0"] + 0.5 * ctrl["g"]), rng, 200)
        rows[a] = {"plant_0.5_recovered": round(planted[0], 3),"units": int(len(x)), "months": nm, "instruments": int(x["inst"].nunique()), "sum_g2": float((x["g"] ** 2).sum()),
                   "median_abs_g": float(x["g"].abs().median()), "control_se": se, "mde": float(mde), "bar": BAR,
                   "power": "POWERED" if mde <= BAR else "UNDERPOWERED"}
    os.makedirs(OUT, exist_ok=True)
    json.dump({"stage": "count", "seed": SEED, "at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "power": rows},
              open(os.path.join(OUT, "power.json"), "w"), indent=1)
    print(json.dumps(rows, indent=1))


def fmt(x, n=3):
    return "–" if x is None or (isinstance(x, float) and not math.isfinite(x)) else f"{x:+.{n}f}"


def stage_run():
    if not os.path.exists(os.path.join(OUT, "power.json")):
        sys.exit("run `count` first (prereg §5)")
    power = json.load(open(os.path.join(OUT, "power.json")))["power"]
    d = load()
    rng = np.random.default_rng(SEED + 1)
    cells = []
    for a in ANCHORS:
        x = scored(d[d["anchor"] == a])
        est, lo, hi, se, p, nm = beta_boot(x, rng)
        bc, bclo, bchi = beta_ctrl(x, rng)
        h1 = x[x["expiry"] < HALF]; h2 = x[x["expiry"] >= HALF]
        b1 = beta_boot(h1, rng, 200)[0]; b2 = beta_boot(h2, rng, 200)[0]
        plc = np.array([beta_boot(shuffled(x, rng), rng, 1)[0] for _ in range(N_PLACEBO)])
        skill = 1 - ((x["z0"] - x["g"]) ** 2).sum() / (x["z0"] ** 2).sum()
        cells.append({"anchor": a, "name": NAMES[a], "n": int(len(x)), "months": nm, "beta": est, "lo": lo, "hi": hi, "se": se, "p": p,
                      "beta_ctrl": bc, "ctrl_lo": bclo, "ctrl_hi": bchi, "half1": b1, "half2": b2,
                      "placebo_pct": float((plc < est).mean() * 100), "placebo_mean": float(plc.mean()), "placebo_sd": float(plc.std()),
                      "skill": float(skill), "rms_miss": float(np.sqrt(((x["z0"] - x["g"]) ** 2).mean())), "rms_nomove": float(np.sqrt((x["z0"] ** 2).mean())),
                      "mde": power[a]["mde"], "power": power[a]["power"]})
    padj = holm(np.array([c["p"] for c in cells]))
    for c, pa in zip(cells, padj):
        c["p_holm"] = float(pa)
        gate = (pa < 0.05 and c["lo"] > 0 and c["beta"] >= BAR and c["ctrl_lo"] > 0 and c["half1"] > 0 and c["half2"] > 0 and c["placebo_pct"] >= 97.5)
        if gate:
            c["verdict"] = "VALIDATED"
        elif c["hi"] < BAR and c["power"] == "POWERED":
            c["verdict"] = "NULL"
        else:
            c["verdict"] = "UNDERPOWERED"

    # P2: convergence by horizon bucket (descriptive, BH over the beta p's)
    conv = []
    for a in ANCHORS:
        xa = d[(d["anchor"] == a) & (d["thin_walk"] == 0)]
        for lab in ["1-2", "3-5", "6-10", "11-20", "21-40", "41+"]:
            x = xa[xa["bucket"] == lab]
            if len(x) < 30:
                continue
            est, lo, hi, se, p, nm = beta_boot(x, rng, 500)
            conv.append({"anchor": a, "bucket": lab, "n": int(len(x)), "beta": est, "lo": lo, "hi": hi, "p": p,
                         "rms_miss": float(np.sqrt(((x["z0"] - x["g"]) ** 2).mean())), "rms_nomove": float(np.sqrt((x["z0"] ** 2).mean())),
                         "median_abs_g": float(x["g"].abs().median()), "share_g_over_2": float((x["g"].abs() > 2).mean()),
                         "median_abs_gap_pct": float((np.abs(np.log(x["target"] / x["s0"])) * 100).median())})
    for c, ok in zip(conv, bh([c["p"] for c in conv])):
        c["bh"] = bool(ok)

    # P3: stability of each expiry's dot, night to night
    stab = []
    for a in ANCHORS:
        x = d[(d["anchor"] == a) & (d["thin_walk"] == 0)].sort_values(["inst", "expiry", "night"])
        prev = x.groupby(["inst", "expiry"]).shift(1)
        nd = (pd.to_datetime(x["night"]) - pd.to_datetime(prev["night"])).dt.days
        ok = nd.notna() & (nd <= 4)
        dT = np.log(x["target"] / prev["target"])[ok] / x["sigma"][ok]
        dS = np.log(x["s0"] / prev["s0"])[ok] / x["sigma"][ok]
        stab.append({"anchor": a, "n": int(ok.sum()), "median_abs_dot_move": float(dT.abs().median()), "mean_abs_dot_move": float(dT.abs().mean()),
                     "median_abs_price_move": float(dS.abs().median()), "share_dot_still": float((dT.abs() < 0.05).mean()),
                     "corr_dot_price": float(np.corrcoef(dT, dS)[0, 1]) if ok.sum() > 2 else None})

    # slices: per instrument, FX vs indices, the +thin walk (descriptive, BH)
    sl = []
    for a in ANCHORS:
        xa = scored(d[d["anchor"] == a])
        for inst in sorted(xa["inst"].unique()):
            x = xa[xa["inst"] == inst]
            if len(x) >= 30:
                est, lo, hi, se, p, nm = beta_boot(x, rng, 500)
                sl.append({"anchor": a, "slice": inst, "n": int(len(x)), "beta": est, "lo": lo, "hi": hi, "p": p})
        for lab, x in (("FX", xa[~xa["inst"].isin(INDICES)]), ("indices", xa[xa["inst"].isin(INDICES)])):
            if len(x) >= 30:
                est, lo, hi, se, p, nm = beta_boot(x, rng, 500)
                sl.append({"anchor": a, "slice": lab, "n": int(len(x)), "beta": est, "lo": lo, "hi": hi, "p": p})
        x = d[(d["anchor"] == a) & (d["thin_walk"] == 1) & (d["h"] <= 40)]
        est, lo, hi, se, p, nm = beta_boot(x, rng, 500)
        sl.append({"anchor": a, "slice": "walk with small books", "n": int(len(x)), "beta": est, "lo": lo, "hi": hi, "p": p})
    for c, ok in zip(sl, bh([c["p"] for c in sl])):
        c["bh"] = bool(ok)
    n_slice_pass = int(sum(c["bh"] for c in sl))

    res = {"id": "swing-walk-track", "prereg": "forge/SWING_WALK_TRACK_PREREG.md", "seed": SEED, "B": B,
           "ranAt": datetime.now(timezone.utc).isoformat(timespec="seconds"), "expiries": [SCORE_FROM, LOCKBOX], "bar": BAR,
           "cells": cells, "convergence": conv, "stability": stab, "slices": sl, "slices_bh_pass": n_slice_pass,
           "verdict": "validated" if any(c["verdict"] == "VALIDATED" for c in cells) else ("null" if all(c["verdict"] == "NULL" for c in cells) else "mixed: see cells")}
    json.dump(res, open(os.path.join(OUT, "results.json"), "w"), indent=1)

    L = ["# swing-walk-track: results", "",
         f"Prereg `forge/SWING_WALK_TRACK_PREREG.md`. Run {res['ranAt'][:10]}. Seed {SEED}, B = {B} cluster bootstrap over expiry months. "
         f"Expiries {SCORE_FROM} to {LOCKBOX}, horizons 1-40 sessions, the page-default walk (small books left out). "
         f"Instruments: {', '.join(sorted(d['inst'].unique()))}.", "",
         "β = how much of the gap from today's price to the dot price has travelled by the expiry-date close (1 = the dot is the expected price, 0 = no information). "
         "Skill = share of the squared miss of \"price stays where it is\" that the dot removes (negative = worse than doing nothing).", "",
         "## P1: does price go to the dot? (scored, Holm over 5)", "",
         "| Anchor | Steps (months) | β [95% CI] | Holm p | β beyond the trailing move [CI] | Halves | Placebo pct | Skill | RMS miss: dot / no-move | MDE | Verdict |",
         "|---|---|---|---|---|---|---|---|---|---|---|"]
    for c in cells:
        L.append(f"| {c['name']} | {c['n']:,} ({c['months']}) | {fmt(c['beta'])} [{fmt(c['lo'])}, {fmt(c['hi'])}] | {c['p_holm']:.3f} | {fmt(c['beta_ctrl'])} [{fmt(c['ctrl_lo'])}, {fmt(c['ctrl_hi'])}] | "
                 f"{fmt(c['half1'], 2)} / {fmt(c['half2'], 2)} | {c['placebo_pct']:.1f} | {fmt(c['skill'])} | {c['rms_miss']:.2f} / {c['rms_nomove']:.2f} | {c['mde']:.3f} | **{c['verdict']}** |")
    L += ["", "## P2: does the gap close as the date nears? (descriptive, BH q = 0.10)", "",
          "Gap = how far the dot sits from price, in expected moves to that expiry (σ√h). A dot that means something keeps that bounded and its miss below the no-move miss in the near buckets.", "",
          "| Anchor | Sessions left | Steps | β [CI] | BH | RMS miss dot / no-move | Median gap (exp. moves) | Gap > 2 moves | Median gap % |", "|---|---|---|---|---|---|---|---|---|"]
    for c in conv:
        L.append(f"| {NAMES[c['anchor']]} | {c['bucket']} | {c['n']:,} | {fmt(c['beta'], 2)} [{fmt(c['lo'], 2)}, {fmt(c['hi'], 2)}] | {'yes' if c['bh'] else ''} | {c['rms_miss']:.2f} / {c['rms_nomove']:.2f} | {c['median_abs_g']:.2f} | {c['share_g_over_2'] * 100:.0f}% | {c['median_abs_gap_pct']:.2f}% |")
    L += ["", "## P3: does each expiry's dot hold still night to night? (descriptive)", "",
          "Moves in one day's σ. A dot that just follows price carries nothing beyond price.", "",
          "| Anchor | Night pairs | Median dot move | Mean dot move | Median price move | Dot unchanged | Corr(dot move, price move) |", "|---|---|---|---|---|---|---|"]
    for c in stab:
        L.append(f"| {NAMES[c['anchor']]} | {c['n']:,} | {c['median_abs_dot_move']:.2f} | {c['mean_abs_dot_move']:.2f} | {c['median_abs_price_move']:.2f} | {c['share_dot_still'] * 100:.0f}% | {fmt(c['corr_dot_price'], 2)} |")
    L += ["", f"## Slices (descriptive, BH q = 0.10): {n_slice_pass} of {len(sl)} pass; {0.05 * len(sl):.1f} expected by chance at 5%", "",
          "| Anchor | Slice | Steps | β [CI] | p | BH |", "|---|---|---|---|---|---|"]
    for c in sl:
        L.append(f"| {NAMES[c['anchor']]} | {c['slice']} | {c['n']:,} | {fmt(c['beta'], 2)} [{fmt(c['lo'], 2)}, {fmt(c['hi'], 2)}] | {c['p']:.3f} | {'yes' if c['bh'] else ''} |")
    open(os.path.join(OUT, "RESULTS.md"), "w", encoding="utf-8").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"count": stage_count, "run": stage_run}[sys.argv[1] if len(sys.argv) > 1 else "count"]()
