"""ladder-qlike-per-line-cfd (forge/LADDER_QLIKE_PER_LINE_CFD_PREREG.md): per-line QLIKE race on the OANDA CFDs.

    python scripts/ladder-qlike-per-line-cfd/race.py  -> analysis/output/ladder-qlike-per-line-cfd/

Lines HL, OH, OL, OC, Close+ (cup), Close- (cdn). Field = ladder.arms_for(sym) on the track-C build. Seed 20261124.
"""
from __future__ import annotations

import json
import os
import sys
import warnings
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts/ladder-v2"))
import ladder as L  # noqa: E402

SEED, B, BLOCK = 20261124, 2000, 63
OUT = ROOT / "analysis/output/ladder-qlike-per-line-cfd"
FAILED = {"NATGAS", "SOYBEAN", "WHEAT", "CORN", "SUGAR"}
NO_SITE = {"V3", "V4", "B_har_iv", "H8"}
LINES = ("hl", "oh", "ol", "oc", "cup", "cdn")
CORE = ("hl", "oh", "ol")
TEST = range(2020, 2027)
HALVES = {"2020-22": (2020, 2022), "2023-26": (2023, 2026)}


# NQ's rollout folder is the pilot build without the 5-min regression features or GARCH columns; its full track-C
# build (same sessions) lives in the ladder-per-line build (prereg A1).
BUILD_DIR = {"NQ": "analysis/output/ladder-per-line/build/nq"}


def bdir(sym):
    return BUILD_DIR.get(sym, f"analysis/output/ladder-v2-{sym.lower()}")


def syms():
    out = []
    for d in sorted((ROOT / "analysis/output").glob("ladder-v2-*")):
        s = d.name[len("ladder-v2-"):].upper()
        if (d / "rows_C.parquet").exists() and s in L.SYMS and s not in FAILED:
            out.append(s)
    return out


def realised(sym):
    m = L.load_m1(sym, "C")
    lt = m.index.tz_convert("Europe/London")
    x = m[(lt.hour < 22) & (lt.dayofweek < 5)].copy()
    x["date"] = x.index.tz_convert("Europe/London").tz_localize(None).normalize()
    g = x.groupby("date")
    s = pd.DataFrame({"o": g["open"].first(), "h": g["high"].max(), "l": g["low"].min(), "c": g["close"].last(), "n": g.size()})
    s = s[(s["n"] >= 600) & (s.index <= L.LOCK)]
    o = s["o"]
    return pd.DataFrame({"hl": (s["h"] - s["l"]) / o * 100, "oh": (s["h"] - o) / o * 100, "ol": (o - s["l"]) / o * 100,
                         "soc": (s["c"] - o) / o * 100})


def h_series(T, sig, q, mask):
    yrs = T["year"].to_numpy()
    x2, s2 = T[q].to_numpy() ** 2, sig ** 2
    h = np.full(len(T), np.nan)
    for Y in range(2019, 2027):
        tr = (yrs >= 2018) & (yrs < Y) & mask & np.isfinite(s2) & (s2 > 0)
        te = yrs == Y
        if te.any() and tr.sum() > 50:
            h[te] = np.mean(x2[tr] / s2[tr]) * s2[te]
    return h


def qlike(T, h, q, mask):
    r = T[q].to_numpy() ** 2 / h
    return np.where(mask & np.isfinite(r) & (r > 0), r - np.log(np.where(r > 0, r, np.nan)) - 1, np.nan)


def wf_pick(T, Q, pool, mask, q):
    yrs = T["year"].to_numpy()
    sel, chosen = np.full(len(T), None, dtype=object), {}
    for Y in TEST:
        tr, te = (yrs >= 2019) & (yrs < Y) & mask, yrs == Y
        best, bv = None, np.inf
        for a in pool:
            v = Q[(a, q)][tr]
            if v.size == 0 or np.isnan(v).mean() > 0.02:
                continue
            m = float(np.nanmean(v))
            if m < bv:
                best, bv = a, m
        sel[te], chosen[Y] = best, best
    return sel, chosen


def pv(Q, sel, q, n):
    out = np.full(n, np.nan)
    for a in set(x for x in sel if x is not None):
        m = sel == a
        out[m] = Q[(a, q)][m]
    return out


def run(sym):
    os.environ["LADDER_OUT"] = bdir(sym)
    L.TAUS = (50, 75, 90)
    S = pd.read_parquet(ROOT / os.environ["LADDER_OUT"] / "rows_C.parquet")
    S["rel"] = S["A0"] / S["A0"].rolling(250, min_periods=60).median().shift(1)
    arms = list(L.arms_for(sym))
    T = L.walk_forward(S, sym, "C", arms, quiet=True).sort_values("date").reset_index(drop=True)
    T = T[T["date"] <= L.LOCK].reset_index(drop=True)
    R = realised(sym).reindex(pd.to_datetime(T["date"]))
    c1 = float(np.mean([np.mean(np.abs(R[q].to_numpy() - T[q].to_numpy()) < 1e-6) for q in CORE]
                       + [np.mean(np.abs(np.abs(R["soc"].to_numpy()) - T["oc"].to_numpy()) < 1e-6)]) * 100)
    A0b = S.set_index("date")["A0"].reindex(pd.to_datetime(T["date"])).to_numpy()
    c2 = float(np.nanmax(np.abs(A0b - T["A0"].to_numpy())))
    so = R["soc"].to_numpy()
    T["cup"] = np.where(so > 0, so, np.nan)
    T["cdn"] = np.where(so < 0, -so, np.nan)
    ok = np.ones(len(T), bool)
    for q in CORE:
        ok &= T[q].to_numpy() > 0
    masks = {"hl": ok, "oh": ok, "ol": ok, "oc": ok & (T["oc"].to_numpy() > 0), "cup": ok & (so > 0), "cdn": ok & (so < 0)}
    yrs = T["year"].to_numpy()
    Q = {}
    for a in arms:
        s = T[a].to_numpy(float)
        for q in LINES:
            Q[(a, q)] = qlike(T, h_series(T, s, q, masks[q]), q, masks[q])
    site = [a for a in arms if a not in NO_SITE]
    board, picks = [], {}
    sel_site = {}
    for q in LINES:
        test = masks[q] & (yrs >= 2020)
        sc = {a: float(np.nanmean(Q[(a, q)][test])) for a in arms if np.isnan(Q[(a, q)][test]).mean() < 0.02}
        rk = sorted(sc, key=sc.get)
        for i, a in enumerate(rk, 1):
            board.append(dict(sym=sym, line=q, arm=a, qlike=sc[a], rank=i, n=len(rk), site=a not in NO_SITE,
                              days=int(test.sum())))
        sel_site[q], pk_s = wf_pick(T, Q, site, masks[q], q)
        _, pk_a = wf_pick(T, Q, arms, masks[q], q)
        final = next(a for a in rk if a not in NO_SITE)
        picks[q] = {"wf_site": pk_s, "wf_all": pk_a, "final_site": final, "best": rk[0],
                    "final_qlike": sc[final], "a0_qlike": sc.get("A0")}
    test = ok & (yrs >= 2020)
    loss = {"date": T["date"].dt.strftime("%Y-%m-%d").to_numpy()[test]}
    for q in CORE:
        loss[f"site_{q}"] = pv(Q, sel_site[q], q, len(T))[test]
        loss[f"a0_{q}"] = Q[("A0", q)][test]
    pd.DataFrame(loss).to_parquet(OUT / f"loss_{sym}.parquet")
    msg = f"{sym}: {len(T)} sessions, control 1 {c1:.2f}%, control 2 A0 max diff {c2:.2e}; " + ", ".join(
        f"{q} {picks[q]['final_site']}" for q in LINES)
    return dict(sym=sym, c1=c1, c2=c2, board=board, picks=picks, msg=msg)


def bootstrap(syms_ok, rng):
    """Date-aligned block bootstrap: the same resampled dates for every instrument."""
    F = {s: pd.read_parquet(OUT / f"loss_{s}.parquet").set_index("date") for s in syms_ok}
    dates = sorted(set().union(*[set(f.index) for f in F.values()]))
    D = len(dates)
    years = np.array([int(d[:4]) for d in dates])

    def mats(cols):
        site = np.zeros((D, len(F))); base = np.zeros((D, len(F))); pres = np.zeros((D, len(F)))
        for j, f in enumerate(F.values()):
            g = f.reindex(dates)
            sv = sum(g[f"site_{q}"].to_numpy() for q in cols)
            bv = sum(g[f"a0_{q}"].to_numpy() for q in cols)
            m = np.isfinite(sv) & np.isfinite(bv)
            site[m, j], base[m, j], pres[m, j] = sv[m], bv[m], 1
        return site, base

    nb = int(np.ceil(D / BLOCK))
    st = rng.integers(0, max(D - BLOCK, 1), size=(B, nb))
    idx = (st[:, :, None] + np.arange(BLOCK)[None, None, :]).reshape(B, -1)[:, :D]
    out = {}
    for name, cols in [("all", CORE)] + [(q, (q,)) for q in CORE]:
        site, base = mats(cols)
        for h, yr in [("all", None)] + list(HALVES.items()):
            keep = np.ones(D, bool) if yr is None else (years >= yr[0]) & (years <= yr[1])
            si, ba = site * keep[:, None], base * keep[:, None]
            pt = float(np.mean(si.sum(0) / ba.sum(0) - 1) * 100)
            C = np.zeros((B, D))
            np.add.at(C, (np.repeat(np.arange(B), idx.shape[1]), idx.ravel()), 1)
            d = (C @ si) / (C @ ba) - 1
            dm = np.nanmean(d, axis=1) * 100
            out[f"{name}|{h}"] = [pt, [float(np.quantile(dm, .05)), float(np.quantile(dm, .95))]]
    per_sym = {}
    site, base = mats(CORE)
    for j, s in enumerate(F):
        per_sym[s] = float((site[:, j].sum() / base[:, j].sum() - 1) * 100)
    return out, per_sym


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    S = syms()
    print(f"{len(S)} instruments: {' '.join(S)}", flush=True)
    res = []
    with ProcessPoolExecutor(max_workers=4) as ex:
        for r in ex.map(run, S):
            print(r["msg"], flush=True)
            res.append(r)
    bad = [r["sym"] for r in res if r["c1"] < 99]
    ok = [r["sym"] for r in res if r["c1"] >= 99]
    board = pd.DataFrame([b for r in res for b in r["board"]])
    board.to_csv(OUT / "leaderboard.csv", index=False)
    rng = np.random.default_rng(SEED)
    h1, per_sym = bootstrap(ok, rng)
    a = h1["all|all"]
    v = ("VALIDATED" if a[1][1] < 0 and all(h1[f"all|{h}"][1][1] < 0 for h in HALVES)
         else "NULL" if a[1][0] > -0.5 else "UNDERPOWERED")
    lines = [f"controls: {len(ok)} pass, dropped (control 1 < 99%): {bad}", "",
             "H1: SITE per-line picks vs live A0, summed QLIKE HL+OH+OL (% change, negative = per-line better), date-aligned bootstrap"]
    for k, (pt, ci) in h1.items():
        lines.append(f"  {k:14s} {pt:+.2f}% [{ci[0]:+.2f}, {ci[1]:+.2f}]")
    lines.append(f"  VERDICT: {v}")
    lines.append("\nper instrument (HL+OH+OL vs A0): " + "  ".join(f"{s} {d:+.1f}%" for s, d in sorted(per_sym.items(), key=lambda x: x[1])))
    lines.append("\nsite picks per line (final, best site-computable 2020-2026.08):")
    for r in sorted(res, key=lambda r: r["sym"]):
        lines.append(f"  {r['sym']:9s} " + "  ".join(f"{q}:{r['picks'][q]['final_site']}" for q in LINES))
    txt = "\n".join(lines)
    print(txt, flush=True)
    (OUT / "report.txt").write_text("\n".join(r["msg"] for r in res) + "\n\n" + txt, encoding="utf-8")
    (OUT / "results.json").write_text(json.dumps(dict(seed=SEED, verdict=v, h1=h1, per_sym=per_sym, dropped=bad,
                                                      controls={r["sym"]: [r["c1"], r["c2"]] for r in res},
                                                      picks={r["sym"]: r["picks"] for r in res}), indent=1, default=str))


if __name__ == "__main__":
    main()
