"""close-level-reversal (forge/CLOSE_LEVEL_REVERSAL_PREREG.md, pushed 57e96a55).

    python scripts/close-level-reversal/race.py [SYM:TRACK ...]  -> analysis/output/close-level-reversal/

Jordan step 2: "we use the close level as reversing points". At each per-line QLIKE level (Close+, Close-, OH, OL;
median/75th/90th; each instrument x line its own walk-forward calc) take the first touch of the session and race
'back toward the open by u' against 'through the line by u' (u = 0.25 and 0.5 of the line's own daily sigma), against
a placebo level at D x m (m in [0.75,0.90] U [1.10,1.25]) raced identically. Futures (track F, 25) primary, CFDs
(track C, 40) replication. Sessions 2020 -> 2026-08-21, seed 20261124, date-aligned 63-session block bootstrap.
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import warnings
import zlib
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts/ladder-v2"))
import ladder as L  # noqa: E402


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


RC = _load("cfd_race", "scripts/ladder-qlike-per-line-cfd/race.py")
RF = _load("fut_race", "scripts/ladder-qlike-per-line-fut/race.py")

SEED, B, BLOCK = 20261124, 2000, 63
OUT = ROOT / "analysis/output/close-level-reversal"
LINES = ("cup", "cdn", "oh", "ol")            # above open: cup, oh; below: cdn, ol
ABOVE = {"cup": True, "oh": True, "cdn": False, "ol": False}
TAUS = (0.50, 0.75, 0.90)
UNITS = (0.25, 0.5)
HYP = {"H1": ("cup", "cdn"), "H2": ("oh", "ol")}
HALVES = {"2020-22": (2020, 2022), "2023-26": (2023, 2026)}
HOURS = [(0, 7), (7, 10), (10, 13), (13, 16), (16, 22)]
PRIOR = {"F": ROOT / "analysis/output/ladder-qlike-per-line-fut/results.json",
         "C": ROOT / "analysis/output/ladder-qlike-per-line-cfd/results.json"}


def hb(h):
    for a, b in HOURS:
        if a <= h < b:
            return f"{a:02d}-{b:02d}"
    return "na"


def levels(sym, track):
    """Walk-forward per-line levels (% of open) for 2020 -> LOCK, plus control 1 and control 2."""
    bd = RF.bdir(sym) if track == "F" else RC.bdir(sym)
    os.environ["LADDER_OUT"] = bd
    L.TAUS = (50, 75, 90)
    S = pd.read_parquet(ROOT / bd / f"rows_{track}.parquet")
    S["rel"] = S["A0"] / S["A0"].rolling(250, min_periods=60).median().shift(1)
    arms = list(L.arms_for(sym))
    T = L.walk_forward(S, sym, track, arms, quiet=True).sort_values("date").reset_index(drop=True)
    T = T[T["date"] <= L.LOCK].reset_index(drop=True)
    R = (RF.realised_f(sym) if track == "F" else RC.realised(sym)).reindex(pd.to_datetime(T["date"]))
    so = R["soc"].to_numpy()
    T["cup"] = np.where(so > 0, so, np.nan)
    T["cdn"] = np.where(so < 0, -so, np.nan)
    ok = np.ones(len(T), bool)
    for q in ("hl", "oh", "ol"):
        ok &= T[q].to_numpy() > 0
    masks = {"oh": ok, "ol": ok, "cup": ok & (so > 0), "cdn": ok & (so < 0)}
    yrs = T["year"].to_numpy()
    site = [a for a in arms if a not in RC.NO_SITE]
    prior = json.loads(PRIOR[track].read_text())["picks"].get(sym, {})
    lv = {q: np.full((len(T), 3), np.nan) for q in LINES}
    sg = {q: np.full(len(T), np.nan) for q in LINES}
    c1, hits = [], {}
    for q in LINES:
        m = masks[q]
        Q = {(a, q): RC.qlike(T, RC.h_series(T, T[a].to_numpy(float), q, m), q, m) for a in site}
        sel, pk = RF.wf_pick(T, Q, site, m, q)
        want = prior.get(q, {}).get("wf_site", {})
        c1 += [str(pk[Y]) == str(want.get(str(Y))) for Y in RC.TEST if want]
        x = T[q].to_numpy()
        for Y in range(2020, 2027):
            te = yrs == Y
            if not te.any() or sel[te][0] is None:
                continue
            sig = T[sel[te][0]].to_numpy(float)
            r = x / sig
            tr = (yrs >= 2018) & (yrs < Y) & m & np.isfinite(r) & (r > 0)
            if tr.sum() <= 50:
                continue
            k = np.quantile(r[tr], TAUS)
            lv[q][te] = np.outer(sig[te], k)
            sg[q][te] = sig[te]
        mm = m & np.isfinite(lv[q][:, 0])
        hits[q] = [float(np.mean(x[mm] > lv[q][mm, j])) for j in range(3)]
    dates = pd.to_datetime(T["date"]).dt.normalize()
    return dates, lv, sg, (float(np.mean(c1)) if c1 else float("nan")), hits


def race_one(h, l, P, u, above, n):
    """First touch of P, then back-by-u vs through-by-u. Returns (touch_idx, outcome, back60_in_u)."""
    hit = h >= P if above else l <= P
    if not hit.any():
        return -1, "N", np.nan
    t = int(np.argmax(hit))
    thr, back = (P + u, P - u) if above else (P - u, P + u)
    w = slice(t + 1, min(t + 61, n))
    b60 = ((P - l[w].min()) if above else (h[w].max() - P)) / u if t + 1 < n else np.nan
    if (h[t] >= thr) if above else (l[t] <= thr):
        return t, "C", b60
    hh, ll = h[t + 1:], l[t + 1:]
    c = (hh >= thr) if above else (ll <= thr)
    r = (ll <= back) if above else (hh >= back)
    ic = int(np.argmax(c)) if c.any() else 10 ** 9
    ir = int(np.argmax(r)) if r.any() else 10 ** 9
    if ic == ir:
        return t, ("U" if ic == 10 ** 9 else "T"), b60
    return t, ("R" if ir < ic else "C"), b60


def run(job):
    sym, track = job
    dates, lv, sg, c1, hits = levels(sym, track)
    m = L.load_m1(sym, track, "unadj") if track == "F" else L.load_m1(sym, track)
    lt = m.index.tz_convert("Europe/London")
    keep = (lt.hour < 22) & (lt.dayofweek < 5)
    m, lt = m[keep], lt[keep]
    d = lt.tz_localize(None).normalize()
    mins = (lt.hour * 60 + lt.minute).to_numpy()
    H, Lo, O = m["high"].to_numpy(), m["low"].to_numpy(), m["open"].to_numpy()
    di = pd.Index(d)
    starts = np.flatnonzero(np.r_[True, di[1:] != di[:-1]])
    ends = np.r_[starts[1:], len(di)]
    pos = {di[s]: (s, e) for s, e in zip(starts, ends)}
    rng = np.random.default_rng([SEED, zlib.crc32(f"{sym}:{track}".encode())])
    rows = []
    for i, dt in enumerate(dates):
        if dt.year < 2020 or dt not in pos:
            continue
        s, e = pos[dt]
        if e - s < 600:
            continue
        h, l, o = H[s:e], Lo[s:e], O[s]
        for q in LINES:
            if not np.isfinite(lv[q][i, 0]):
                continue
            sig = sg[q][i]
            ab = ABOVE[q]
            for j, tau in enumerate(TAUS):
                D = lv[q][i, j]
                mult = rng.uniform(0.75, 0.90) if rng.random() < 0.5 else rng.uniform(1.10, 1.25)
                for kind, dd in (("line", D), ("placebo", D * mult)):
                    P = o * (1 + dd / 100) if ab else o * (1 - dd / 100)
                    for um in UNITS:
                        u = um * sig * o / 100
                        t, out, b60 = race_one(h, l, P, u, ab, e - s)
                        rows.append((dt.strftime("%Y-%m-%d"), q, int(tau * 100), kind, um,
                                     int(mins[s + t] // 60) if t >= 0 else -1, out, b60))
    df = pd.DataFrame(rows, columns=["date", "line", "tau", "kind", "u", "hour", "out", "back60"])
    df.insert(0, "track", track)
    df.insert(0, "sym", sym)
    df.to_parquet(OUT / "touches" / f"{track}_{sym}.parquet")
    msg = (f"{track} {sym}: {df['date'].nunique()} sessions, control1 picks match {c1*100:.0f}%, hits "
           + " ".join(f"{q} " + "/".join(f"{v*100:.0f}" for v in hits[q]) for q in LINES))
    return dict(sym=sym, track=track, c1=c1, hits=hits, msg=msg)


def jobs():
    return [(s, "F") for s in RF.syms()] + [(s, "C") for s in RC.syms()]


def counts(df, lines, u=0.25):
    """Per date: reversals and resolved, line and placebo, for one hypothesis' lines."""
    x = df[(df["line"].isin(lines)) & (df["u"] == u) & df["out"].isin(["R", "C"])]
    g = x.assign(r=(x["out"] == "R").astype(int), n=1).groupby(["date", "kind"])[["r", "n"]].sum().unstack("kind")
    g.columns = [f"{a}_{b}" for a, b in g.columns]
    return g.reindex(columns=["r_line", "n_line", "r_placebo", "n_placebo"]).fillna(0)


def boot(G, rng):
    """Mean over instruments of (line share - placebo share), pp; date-aligned block bootstrap."""
    dates = sorted(set().union(*[set(g.index) for g in G.values()]))
    D = len(dates)
    years = np.array([int(x[:4]) for x in dates])
    M = {c: np.array([g.reindex(dates)[c].fillna(0).to_numpy() for g in G.values()]).T
         for c in ("r_line", "n_line", "r_placebo", "n_placebo")}
    nb = int(np.ceil(D / BLOCK))
    st = rng.integers(0, max(D - BLOCK, 1), size=(B, nb))
    idx = (st[:, :, None] + np.arange(BLOCK)[None, None, :]).reshape(B, -1)[:, :D]
    C = np.zeros((B, D))
    np.add.at(C, (np.repeat(np.arange(B), idx.shape[1]), idx.ravel()), 1)
    out = {}
    for h, yr in [("all", None)] + list(HALVES.items()):
        keep = np.ones(D, bool) if yr is None else (years >= yr[0]) & (years <= yr[1])
        K = {c: v * keep[:, None] for c, v in M.items()}

        def stat(f):
            with np.errstate(invalid="ignore", divide="ignore"):
                ex = f["r_line"] / f["n_line"] - f["r_placebo"] / f["n_placebo"]
            return np.nanmean(ex, axis=-1) * 100

        pt = float(stat({c: v.sum(0) for c, v in K.items()}))
        bs = stat({c: C @ v for c, v in K.items()})
        line_share = float(np.nanmean(K["r_line"].sum(0) / K["n_line"].sum(0)) * 100)
        plc_share = float(np.nanmean(K["r_placebo"].sum(0) / K["n_placebo"].sum(0)) * 100)
        out[h] = dict(pt=pt, ci=[float(np.nanquantile(bs, .05)), float(np.nanquantile(bs, .95))],
                      line_share=line_share, placebo_share=plc_share)
    return out


def verdict(f, c):
    if all(r["all"]["ci"][0] > 0 and all(r[h]["ci"][0] > 0 for h in HALVES) for r in (f, c)):
        return "VALIDATED"
    if all(r["all"]["ci"][1] < 1.0 for r in (f, c)):
        return "NULL"
    return "UNDERPOWERED"


def bh(p, q=0.10):
    p = np.asarray(p)
    o = np.argsort(p)
    n = len(p)
    thr = q * np.arange(1, n + 1) / n
    ok = p[o] <= thr
    k = np.max(np.flatnonzero(ok)) + 1 if ok.any() else 0
    res = np.zeros(n, bool)
    res[o[:k]] = True
    return res


def main():
    (OUT / "touches").mkdir(parents=True, exist_ok=True)
    J = [tuple(a.split(":")) for a in sys.argv[1:]] or jobs()
    print(f"{len(J)} jobs", flush=True)
    res = []
    with ProcessPoolExecutor(max_workers=4) as ex:
        for r in ex.map(run, J):
            print(r["msg"], flush=True)
            res.append(r)
    if sys.argv[1:]:
        return
    ctrl = {f"{r['track']}:{r['sym']}": dict(c1=r["c1"], hits=r["hits"]) for r in res}
    bad = {k for k, v in ctrl.items() if not (v["c1"] >= 0.99)}
    drop2 = {k: [q for q in LINES if any(abs(h - t) > 0.06 for h, t in zip(v["hits"][q], (0.5, 0.25, 0.10)))]
             for k, v in ctrl.items()}
    rng = np.random.default_rng(SEED)
    hyp, per = {}, []
    for hk, lines in HYP.items():
        fam = {}
        for tr in ("F", "C"):
            G = {}
            for r in res:
                k = f"{r['track']}:{r['sym']}"
                if r["track"] != tr or k in bad:
                    continue
                use = [q for q in lines if q not in drop2[k]]
                if not use:
                    continue
                df = pd.read_parquet(OUT / "touches" / f"{tr}_{r['sym']}.parquet")
                G[r["sym"]] = counts(df, use)
                g = G[r["sym"]].sum()
                per.append(dict(hyp=hk, track=tr, sym=r["sym"], n_line=int(g["n_line"]),
                                line_share=g["r_line"] / g["n_line"] * 100,
                                placebo_share=g["r_placebo"] / g["n_placebo"] * 100,
                                excess=(g["r_line"] / g["n_line"] - g["r_placebo"] / g["n_placebo"]) * 100))
            fam[tr] = boot(G, rng)
        hyp[hk] = dict(futures=fam["F"], cfd=fam["C"], verdict=verdict(fam["F"], fam["C"]))
        print(hk, hyp[hk]["verdict"], json.dumps({t: {h: [round(v["pt"], 2)] + [round(c, 2) for c in v["ci"]]
                                                       for h, v in fam[t].items()} for t in fam}), flush=True)
    pd.DataFrame(per).to_csv(OUT / "per_instrument.csv", index=False)

    # descriptive day-clock table
    A = pd.concat([pd.read_parquet(p) for p in sorted((OUT / "touches").glob("*.parquet"))], ignore_index=True)
    A = A[A["hour"] >= 0]
    A["hours"] = A["hour"].map(hb)
    A["R"] = (A["out"] == "R").astype(int)
    A["res"] = A["out"].isin(["R", "C"]).astype(int)
    A["T"] = (A["out"] == "T").astype(int)
    A["U"] = (A["out"] == "U").astype(int)
    keys = ["track", "sym", "line", "tau", "u", "hours"]
    g = A.groupby(keys + ["kind"]).agg(n=("R", "size"), rev=("R", "sum"), res=("res", "sum"), ties=("T", "sum"),
                                         unres=("U", "sum"), back60=("back60", "median")).unstack("kind")
    g.columns = [f"{a}_{b}" for a, b in g.columns]
    g = g.reset_index()
    g["share_line"] = g["rev_line"] / g["res_line"] * 100
    g["share_placebo"] = g["rev_placebo"] / g["res_placebo"] * 100
    g["excess"] = g["share_line"] - g["share_placebo"]
    from math import erf, sqrt
    p1, p2 = g["rev_line"] / g["res_line"], g["rev_placebo"] / g["res_placebo"]
    pp = (g["rev_line"] + g["rev_placebo"]) / (g["res_line"] + g["res_placebo"])
    se = np.sqrt(pp * (1 - pp) * (1 / g["res_line"] + 1 / g["res_placebo"]))
    z = (p1 - p2) / se
    g["p"] = [2 * (1 - 0.5 * (1 + erf(abs(v) / sqrt(2)))) if np.isfinite(v) else 1.0 for v in z]
    elig = (g["res_line"] >= 40) & (g["u"] == 0.25)
    g["candidate"] = False
    g.loc[elig, "candidate"] = bh(g.loc[elig, "p"].to_numpy())
    g.to_csv(OUT / "day_clock.csv", index=False)
    cand = g[g["candidate"]].sort_values("excess", ascending=False)
    # pooled day-clock by line x tau x hours (descriptive)
    P = A[A["u"] == 0.25].assign(k=lambda x: x["kind"].map({"line": "share_line", "placebo": "share_placebo"}))
    pool = P.groupby(["track", "line", "tau", "hours", "k"]).agg(rev=("R", "sum"), res=("res", "sum"))
    pool = (pool["rev"] / pool["res"] * 100).unstack("k").reset_index()
    pool["excess"] = pool["share_line"] - pool["share_placebo"]
    pool.to_csv(OUT / "day_clock_pooled.csv", index=False)
    json.dump(dict(seed=SEED, prereg="forge/CLOSE_LEVEL_REVERSAL_PREREG.md", hypotheses=hyp, controls=ctrl,
                   control1_failed=sorted(bad), control2_dropped={k: v for k, v in drop2.items() if v},
                   n_candidates=int(g["candidate"].sum()), n_cells_eligible=int(elig.sum()),
                   candidates=cand.head(40).to_dict("records")),
              open(OUT / "results.json", "w"), indent=1, default=str)
    print(f"candidates {int(g['candidate'].sum())} of {int(elig.sum())} eligible cells", flush=True)


if __name__ == "__main__":
    main()
