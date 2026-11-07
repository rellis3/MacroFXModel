#!/usr/bin/env python3
"""Score forge/FLOW_RANGE_LIQUIDITY_PREREG.md. Seed 20261107. Reads the local 1-minute flow bars built by scripts/delta-at-line/score.py.

    python scripts/flow-range-liquidity/score.py table    # checkpoints with inputs and targets (no model)
    python scripts/flow-range-liquidity/score.py count    # checkpoints per market and target, nothing about any model
    python scripts/flow-range-liquidity/score.py score    # the scored run
"""
import json
import math
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

SEED = 20261107
B = 2000
BLOCK = 20
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "analysis/output/flow-range-liquidity"
CACHE = Path(os.environ.get("DELTA_LINE_DIR") or (Path(os.environ.get("LOCALAPPDATA", Path.home())) / "MacroFXModel" / "delta_line_1m"))
# market: first date, session close (New York minute), first and last checkpoint
SPEC = {"6E": ("2023-04-03", 960, 240, 900), "6J": ("2023-08-01", 960, 240, 900), "NQ": ("2025-11-06", 960, 630, 900)}
HIST, MINHIST = 60, 20
MINFILL = 45
BASE_IN = ["lr60", "lr15", "lrv", "lvol"]
M1_IN = ["absd", "pers"]
M2_IN = ["limp", "lamh"]
EPS = 1e-12


def window_inputs(ret, buy, sell, vol, high, low):
    """Everything computed from the 60 minutes before a checkpoint. Arrays are 1-minute, oldest first, with no gaps removed."""
    delta = buy - sell
    tot = (buy + sell).sum()
    absd = abs(delta.sum()) / tot if tot > 0 else np.nan
    den = np.abs(delta).sum()
    pers = abs(delta.sum()) / den if den > 0 else np.nan
    x = delta - delta.mean()
    sxx = (x * x).sum()
    slope = (x * (ret - ret.mean())).sum() / sxx if sxx > 0 else np.nan
    limp = math.log(max(slope, EPS)) if np.isfinite(slope) else np.nan
    v = vol[vol > 0]
    r = np.abs(ret)[vol > 0]
    lamh = math.log(max((r / v).mean(), EPS)) if len(v) else np.nan
    rng60 = high.max() - low.min()
    rng15 = high[-15:].max() - low[-15:].min()
    rv = math.sqrt((ret * ret).sum())
    return dict(absd=absd, pers=pers, limp=limp, lamh=lamh, lr60=math.log(max(rng60, EPS)), lr15=math.log(max(rng15, EPS)), lrv=math.log(max(rv, EPS)), lvol=math.log(max(vol.sum(), 1.0)))


def checkpoints(root):
    first, close, c0, c1 = SPEC[root]
    d = pd.read_parquet(CACHE / f"{root}.parquet")
    ny = pd.to_datetime(d.m, utc=True).dt.tz_convert("America/New_York")
    d = d.assign(day=ny.dt.strftime("%Y-%m-%d"), mn=(ny.dt.hour * 60 + ny.dt.minute).astype(int), dow=ny.dt.dayofweek)
    d = d[(d.day >= first) & (d.day <= "2026-08-21") & (d.dow < 5)]
    rows = []
    for day, g in d.groupby("day", sort=True):
        g = g.sort_values("mn")
        mn, buy, sell, hi, lo, cl, ci = (g[c].to_numpy() for c in ("mn", "buy", "sell", "high", "low", "close", "inst"))
        lc = np.log(cl.astype(float))
        ret = np.r_[0.0, np.diff(lc)]
        vol = (buy + sell).astype(float)
        for c in range(c0, c1 + 1, 60):
            a = (mn >= c - 60) & (mn < c)
            f = (mn >= c) & (mn < c + 60)
            if a.sum() < MINFILL or len(set(ci[a])) > 1:
                continue
            ra = ret[a].copy()
            ra[0] = 0.0
            rec = dict(root=root, day=day, c=c, **window_inputs(ra, buy[a].astype(float), sell[a].astype(float), vol[a], hi[a].astype(float), lo[a].astype(float)))
            rec["y_h60"] = math.log(max(hi[f].max() - lo[f].min(), EPS)) if f.sum() >= MINFILL and len(set(ci[f])) == 1 else np.nan
            rs = (mn >= c) & (mn < close)
            rec["y_rest"] = math.log(max(hi[rs].max() - lo[rs].min(), EPS)) if rs.sum() >= MINFILL and close - c >= 60 and len(set(ci[rs])) == 1 else np.nan
            rows.append(rec)
    return pd.DataFrame(rows)


def normalise(T):
    """Against the same market and hour over up to the previous HIST sessions, strictly earlier. Targets and baseline logs lose their mean; flow and liquidity inputs are z-scored."""
    T = T.sort_values(["root", "c", "day"]).reset_index(drop=True)
    g = T.groupby(["root", "c"], sort=False)
    out = T[["root", "day", "c"]].copy()
    for col in BASE_IN + M1_IN + M2_IN + ["y_h60", "y_rest"]:
        m = g[col].transform(lambda s: s.shift(1).rolling(HIST, min_periods=MINHIST).mean())
        if col in M1_IN + M2_IN:
            sd = g[col].transform(lambda s: s.shift(1).rolling(HIST, min_periods=MINHIST).std())
            out[col] = (T[col] - m) / sd
        else:
            out[col] = T[col] - m
    return out


def folds_for(days, n=5):
    u = sorted(set(days))
    return {d: min(n - 1, i * n // len(u)) for i, d in enumerate(u)}


def ols(Xtr, ytr, Xte):
    A = np.c_[np.ones(len(Xtr)), Xtr]
    b = np.linalg.lstsq(A, ytr, rcond=None)[0]
    return np.c_[np.ones(len(Xte)), Xte] @ b


def walk(D, y, inputs, gap=5):
    """Out-of-fold predictions, each fold from all earlier folds with a gap of sessions. NaN for fold 0."""
    pred = np.full(len(D), np.nan)
    u = sorted(set(D.day))
    pos = {d: i for i, d in enumerate(u)}
    for k in sorted(D.fold.unique()):
        if k == 0:
            continue
        te = (D.fold == k).to_numpy()
        start = min(pos[d] for d in D.day[te])
        tr = (D.day.map(pos) < start - gap).to_numpy()
        if tr.sum() < 200:
            continue
        pred[te] = ols(D[inputs].to_numpy()[tr], D[y].to_numpy()[tr], D[inputs].to_numpy()[te])
    return pred


def ratio_boot(day, e0, e1, rng, B_=B):
    """MSE model / MSE base with date blocks. Returns the estimate, its 95% range and P(ratio >= 1)."""
    u = sorted(set(day))
    pos = {d: i for i, d in enumerate(u)}
    idx = np.array([pos[d] for d in day])
    s0, s1 = np.bincount(idx, e0 * e0, len(u)), np.bincount(idx, e1 * e1, len(u))
    est = float(s1.sum() / s0.sum())
    nb = math.ceil(len(u) / BLOCK)
    st = np.empty(B_)
    for b in range(B_):
        q = rng.integers(0, max(1, len(u) - BLOCK + 1), nb)
        t = (q[:, None] + np.arange(BLOCK)).ravel()
        t = t[t < len(u)]
        st[b] = s1[t].sum() / s0[t].sum()
    lo, hi = np.percentile(st, [2.5, 97.5])
    return dict(ratio=est, lo=float(lo), hi=float(hi), p=float(max((st >= 1).mean(), 1 / B_)))


def holm(ps):
    order = sorted(range(len(ps)), key=lambda i: ps[i])
    adj, top = [0.0] * len(ps), 0.0
    for r, i in enumerate(order):
        top = max(top, min(1.0, ps[i] * (len(ps) - r)))
        adj[i] = top
    return adj


def verdict_for(c):
    """Prereg sections 4 and 5."""
    if c.get("passed"):
        return "validated"
    if c["hi"] < 1 and c["lo"] > .99:
        return "context"
    if c["hi"] < 1:
        return "context"
    return "null" if c["lo"] > .99 else "underpowered"


def table():
    OUT.mkdir(parents=True, exist_ok=True)
    T = pd.concat([checkpoints(r) for r in SPEC], ignore_index=True)
    T.to_parquet(CACHE / "flow_range_table.parquet", index=False)
    print(T.groupby("root").size().to_dict(), flush=True)


def prepared():
    N = normalise(pd.read_parquet(CACHE / "flow_range_table.parquet"))
    return N


def count():
    N = prepared()
    res = {r: dict(h60=int(g[BASE_IN + M1_IN + M2_IN + ["y_h60"]].notna().all(axis=1).sum()), rest=int(g[BASE_IN + M1_IN + M2_IN + ["y_rest"]].notna().all(axis=1).sum()), sessions=int(g.day.nunique())) for r, g in N.groupby("root")}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "count_first.json").write_text(json.dumps(res, indent=1))
    print(json.dumps(res))


def score():
    rng = np.random.default_rng(SEED)
    N = prepared()
    cells, desc = {}, {}
    for name, added in (("M1", M1_IN), ("M2", M2_IN)):
        for h in ("h60", "rest"):
            y = f"y_{h}"
            D = N.dropna(subset=BASE_IN + M1_IN + M2_IN + [y]).reset_index(drop=True)
            D["fold"] = D.day.map(folds_for(D.day))
            p0, p1 = walk(D, y, BASE_IN), walk(D, y, BASE_IN + added)
            ok = np.isfinite(p0) & np.isfinite(p1)
            e0, e1 = D[y].to_numpy()[ok] - p0[ok], D[y].to_numpy()[ok] - p1[ok]
            S = D[ok]
            c = ratio_boot(S.day.to_numpy(), e0, e1, rng)
            c["n"] = int(ok.sum())
            c["base_r2"] = float(1 - (e0 * e0).sum() / ((S[y] - S[y].mean()) ** 2).sum())
            c["by_fold"] = {int(k): float((e1[S.fold == k] ** 2).sum() / (e0[S.fold == k] ** 2).sum()) for k in sorted(S.fold.unique())}
            c["by_root"] = {r: float((e1[S.root == r] ** 2).sum() / (e0[S.root == r] ** 2).sum()) for r in sorted(S.root.unique())}
            pl = []
            for k in range(1, 21):
                Dp = D.copy()
                for col in added:
                    Dp[col] = D.groupby(["root", "c"])[col].transform(lambda s: np.roll(s.to_numpy(), k))
                pp = walk(Dp, y, BASE_IN + added)
                okp = np.isfinite(p0) & np.isfinite(pp)
                pl.append(float(((D[y].to_numpy()[okp] - pp[okp]) ** 2).sum() / ((D[y].to_numpy()[okp] - p0[okp]) ** 2).sum()))
            c["placebo_min"], c["placebo_max"] = min(pl), max(pl)
            cells[f"{name}_{h}"] = c
            print(name, h, {k: c[k] for k in ("ratio", "lo", "hi", "p", "n", "base_r2")}, flush=True)
            # descriptive: realised over base, by quintile of each added input and market
            q = {}
            for col in added:
                for r in sorted(S.root.unique()):
                    m = (S.root == r).to_numpy()
                    v = S[col].to_numpy()[m]
                    bins = np.quantile(v, [.2, .4, .6, .8])
                    g = np.digitize(v, bins)
                    q[f"{col}_{r}"] = [float(np.exp(e0[m][g == i]).mean()) for i in range(5)]
                big = np.quantile(e0, .9)
                top = S[col].to_numpy() >= np.quantile(S[col].to_numpy(), .8)
                q[f"{col}_share_top_of_big_surprises"] = float(top[e0 >= big].mean())
            desc[f"{name}_{h}"] = q
    names = list(cells)
    adj = holm([cells[k]["p"] for k in names])
    for k, a in zip(names, adj):
        c = cells[k]
        c["holm_p"] = a
        c["folds_better"] = sum(v < 1 for v in c["by_fold"].values())
        c["passed"] = bool(c["ratio"] <= .99 and c["hi"] < 1 and a < .05 and c["folds_better"] >= 3 and all(v < 1 for v in c["by_root"].values()) and c["ratio"] < c["placebo_min"])
        c["verdict"] = verdict_for(c)
    # each input alone, descriptive
    alone = {}
    for col in M1_IN + M2_IN:
        D = N.dropna(subset=BASE_IN + M1_IN + M2_IN + ["y_h60"]).reset_index(drop=True)
        D["fold"] = D.day.map(folds_for(D.day))
        p0, p1 = walk(D, "y_h60", BASE_IN), walk(D, "y_h60", BASE_IN + [col])
        ok = np.isfinite(p0) & np.isfinite(p1)
        alone[col] = float(((D.y_h60.to_numpy()[ok] - p1[ok]) ** 2).sum() / ((D.y_h60.to_numpy()[ok] - p0[ok]) ** 2).sum())
    out = dict(id="flow-range-liquidity", ranAt=datetime.now(timezone.utc).isoformat(timespec="seconds"), seed=SEED, B=B, prereg="forge/FLOW_RANGE_LIQUIDITY_PREREG.md", branch="main", cells=cells, quintiles=desc, alone_h60=alone)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "scored.json").write_text(json.dumps(out, indent=1, default=float))
    print(json.dumps(dict(cells=cells, alone=alone), default=float))


if __name__ == "__main__":
    {"table": table, "count": count, "score": score}[sys.argv[1]]()
