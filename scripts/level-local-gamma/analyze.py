"""level-local-gamma, step 3: count-first power pass (no outcomes) and the one scoring run.

Prereg: forge/LEVEL_LOCAL_GAMMA_PREREG.md. Needs events.py for every pair first.

    python scripts/level-local-gamma/analyze.py count     # n per cell + MDE, reads NO outcome
    python scripts/level-local-gamma/analyze.py score     # race outcomes, returns, every registered cell

Outputs analysis/output/level-local-gamma/{counts.json, results.json, cells.csv}.
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUTD = ROOT / "analysis/output/level-local-gamma"
CACHE = OUTD / "cache"
SEED = 20261111
B = 2000
BAR_PP = 3.0
PRIMARY = ["NAS100_USD", "SPX500_USD"]
GOLD = ["XAU_USD"]
FX = ["EUR_USD", "GBP_USD", "AUD_USD", "USD_JPY", "USD_CAD", "USD_CHF"]
WARM_SESS = 60
RHO = 0.02


# ------------------------------------------------------------------ loading and PIT terciles
def load(pairs):
    out = []
    for p in pairs:
        f = CACHE / f"events_{p}.parquet"
        if not f.exists():
            print(f"missing {f.name}")
            continue
        e = pd.read_parquet(f)
        e = e[e["touched"] & (e["late"] == False)].copy()  # noqa: E712
        e = e[np.isfinite(e["gg_norm"]) & (e["gg_norm"] > 0)]
        # stale-book guard (A1): the settlement date P must be within 5 calendar days of the session
        ss = pd.read_parquet(CACHE / f"sessions_{p}.parquet")
        stale = (pd.to_datetime(ss.index) - pd.to_datetime(ss["P"])).dt.days > 5
        e = e[~e["date"].isin(ss.index[stale.to_numpy()])]
        e["LGs"] = e["lg"] / e["gg_norm"]
        e["LGs_nb"] = (e["lg_nb"] / e["gg_nb"]) * (e["gg"] / e["gg_norm"])
        e["LGs_d1"] = np.where(e["n_d1"] > 0, e["lg_d1"] / e["gg_norm"], np.nan)
        e["LGs_d5"] = np.where(e["n_d5"] > 0, e["lg_d5"] / e["gg_norm"], np.nan)
        e["LGs_far"] = e["lg_dfar"] / e["gg_norm"]
        e["slope"] = (e["lg_beyond"] - e["lg"]) / e["gg_norm"]
        e["swap"] = -e["LGs"]
        out.append(e)
    e = pd.concat(out, ignore_index=True)
    e["date"] = pd.to_datetime(e["date"])
    iso = e["date"].dt.isocalendar()
    e["cluster"] = e["pair"] + "_" + iso["year"].astype(str) + "_" + iso["week"].astype(str).str.zfill(2)
    a = e["dist"].abs()
    e["dbin"] = np.select([a < 0.25, a < 0.5, a < 1.0], [0, 1, 2], 3)
    hr = e["lon_hour"]
    e["blk"] = np.select([hr < 7, hr < 12, hr < 16.5], [0, 1, 2], 3)
    e["stratum"] = e["pair"] + "|" + e["side"].astype(str) + "|" + e["dbin"].astype(str) + "|" + e["blk"].astype(str)
    return e.sort_values(["pair", "date"]).reset_index(drop=True)


def pit_terciles(e, var):
    """Per instrument: cut points from the variable's values on all events in PRIOR sessions (>= WARM_SESS sessions).
    Returns array: 0 bottom, 1 middle, 2 top, -1 warm-up / missing."""
    lab = np.full(len(e), -1, dtype=int)
    for p, g in e.groupby("pair", sort=False):
        dates = g["date"].to_numpy()
        vals = g[var].to_numpy(float)
        ud = np.unique(dates)
        for k, d in enumerate(ud):
            if k < WARM_SESS:
                continue
            prior = vals[(dates < d) & np.isfinite(vals)]
            if len(prior) < 100:
                continue
            q1, q2 = np.quantile(prior, [1 / 3, 2 / 3])
            m = dates == d
            v = vals[m]
            l = np.where(v < q1, 0, np.where(v > q2, 2, 1))
            l[~np.isfinite(v)] = -1
            lab[g.index[m]] = l
    return lab


def sign_lab(v):
    return np.where(~np.isfinite(v), -1, np.where(v < 0, 0, 2))


# ------------------------------------------------------------------ estimator + cluster bootstrap
class Est:
    """D = sum_s w_s (rate_lo - rate_hi), w_s = n_lo + n_hi in stratum s, strata with < 10 in either arm skipped."""

    def __init__(self, df, lab, y, lo=0, hi=2):
        m = np.isin(lab, [lo, hi]) & np.isfinite(y)
        d = df.loc[m]
        self.n_lo = int((lab[m] == lo).sum())
        self.n_hi = int((lab[m] == hi).sum())
        self.cl, ci = np.unique(d["cluster"].to_numpy(), return_inverse=True)
        self.st, si = np.unique(d["stratum"].to_numpy(), return_inverse=True)
        arm = (lab[m] == hi).astype(int)
        yy = y[m]
        nC, nS = len(self.cl), len(self.st)
        self.S = np.zeros((2, nC, nS))
        self.N = np.zeros((2, nC, nS))
        np.add.at(self.S, (arm, ci, si), yy)
        np.add.at(self.N, (arm, ci, si), 1.0)
        self.raw = (yy[arm == 0].mean() - yy[arm == 1].mean()) if self.n_lo and self.n_hi else np.nan
        self.r_lo = yy[arm == 0].mean() if self.n_lo else np.nan
        self.r_hi = yy[arm == 1].mean() if self.n_hi else np.nan

    @staticmethod
    def _d(S, N):
        # S, N: (..., 2, nS)
        nlo, nhi = N[..., 0, :], N[..., 1, :]
        use = (nlo >= 10) & (nhi >= 10)
        with np.errstate(invalid="ignore", divide="ignore"):
            diff = S[..., 0, :] / nlo - S[..., 1, :] / nhi
            w = np.where(use, nlo + nhi, 0.0)
            return np.where(use, diff, 0.0).__mul__(w).sum(-1) / w.sum(-1)

    def point(self):
        return float(self._d(self.S.sum(1), self.N.sum(1)))

    def boot(self, W):
        # W: (B, nC) cluster multiplicities
        S = np.einsum("bc,acs->bas", W, self.S)
        N = np.einsum("bc,acs->bas", W, self.N)
        return self._d(S, N)


def cluster_weights(clusters, rng, b=B):
    n = len(clusters)
    idx = rng.integers(0, n, size=(b, n))
    W = np.zeros((b, n))
    for i in range(b):
        W[i] = np.bincount(idx[i], minlength=n)
    return W


def summarize(est, rng, scale=100.0):
    if est.n_lo < 10 or est.n_hi < 10:
        return {"n_lo": est.n_lo, "n_hi": est.n_hi, "est": None}
    pt = est.point()
    bs = est.boot(cluster_weights(est.cl, rng))
    bs = bs[np.isfinite(bs)]
    if not np.isfinite(pt) or len(bs) < 100:
        return {"n_lo": est.n_lo, "n_hi": est.n_hi, "est": None, "note": "no stratum with >= 10 per arm"}
    lo, hi = np.percentile(bs, [2.5, 97.5])
    p = float(min(1.0, 2 * min((bs <= 0).mean(), (bs >= 0).mean())))
    se = float(bs.std())
    return {"n_lo": est.n_lo, "n_hi": est.n_hi, "n_clusters": int(len(est.cl)), "rate_lo": scale * est.r_lo,
            "rate_hi": scale * est.r_hi, "raw": scale * est.raw, "est": scale * pt, "lo": scale * lo,
            "hi": scale * hi, "se": scale * se, "mde": scale * 2.8 * se, "p": p}


def bh(ps, q=0.10):
    ps = np.asarray(ps, float)
    n = len(ps)
    o = np.argsort(ps)
    thr = q * np.arange(1, n + 1) / n
    passed = ps[o] <= thr
    k = np.max(np.where(passed)[0]) + 1 if passed.any() else 0
    out = np.zeros(n, bool)
    out[o[:k]] = True
    qv = np.minimum.accumulate((ps[o] * n / np.arange(1, n + 1))[::-1])[::-1]
    qq = np.empty(n)
    qq[o] = np.minimum(qv, 1.0)
    return out, qq


# ------------------------------------------------------------------ outcomes (score stage only)
def outcomes(e):
    res = np.full(len(e), np.nan)       # 1 break, 0 hold
    amb = np.zeros(len(e), bool)
    unres = np.zeros(len(e), bool)
    rets = {h: np.full(len(e), np.nan) for h in (15, 60, 240)}
    for p, g in e.groupby("pair", sort=False):
        z = np.load(CACHE / f"m1_{p}.npz")
        ts, h, l, c = z["ts"], z["h"], z["l"], z["c"]
        for i, r in zip(g.index, g.itertuples()):
            t_end = int(pd.Timestamp(f"{r.date:%Y-%m-%d} 22:00").tz_localize("Europe/London").tz_convert("UTC").value // 10**9)
            k0 = int(r.bar)
            k1 = int(np.searchsorted(ts, t_end, side="left"))
            hh, ll = h[k0:k1], l[k0:k1]
            L, b, s = r.L, r.b, r.side
            if s > 0:
                brk, hold = hh >= L + b, ll <= L - b
            else:
                brk, hold = ll <= L - b, hh >= L + b
            hold = hold.copy()
            hold[0] = False                     # touch bar: only the break side is checked
            both = brk & hold
            fb = np.argmax(brk) if brk.any() else 10**9
            fh = np.argmax(hold) if hold.any() else 10**9
            if fb == 10**9 and fh == 10**9:
                unres[i] = True
            elif fb == fh:
                amb[i] = True
            else:
                res[i] = 1.0 if fb < fh else 0.0
            unit = 4 * b                        # sigma x open
            for hm in (15, 60, 240):
                tt = r.t + 60 + hm * 60
                if tt > t_end:
                    continue
                j = int(np.searchsorted(ts, tt, side="right")) - 2   # last bar closing at/before tt
                if j >= k0:
                    rets[hm][i] = s * (c[j] - L) / unit
    return res, amb, unres, rets


# ------------------------------------------------------------------ stages
def mde_formula(n1, n2, m):
    deff = 1 + (m - 1) * RHO
    return 100 * 2.8 * np.sqrt(0.25 * (1 / n1 + 1 / n2)) * np.sqrt(deff), deff


def count():
    out = {"run": datetime.now(timezone.utc).isoformat(), "rho_assumed": RHO, "cells": []}
    for name, pairs in (("primary", PRIMARY), ("gold", GOLD), ("fx", FX)):
        e = load(pairs)
        lab = pit_terciles(e, "LGs")
        e["lab"] = lab
        sc = e[lab >= 0]
        out[f"{name}_sessions"] = {p: int(g["date"].nunique()) for p, g in sc.groupby("pair")}
        out[f"{name}_kind_counts"] = {f"{p}|{k}": int(n) for (p, k), n in sc.groupby(["pair", "kind"]).size().items()}
        for kind_name, mk in (("random", sc["kind"] == "random"), ("real", sc["kind"] != "random"),
                              ("ladder", sc["kind"] == "ladder"), ("wall", sc["kind"] == "wall")):
            s = sc[mk]
            if not len(s):
                continue
            n1, n2 = int((s["lab"] == 0).sum()), int((s["lab"] == 2).sum())
            m = len(s) / max(s["cluster"].nunique(), 1)
            mde, deff = mde_formula(max(n1, 1), max(n2, 1), m)
            out["cells"].append({"sample": name, "cell": kind_name, "n_bottom": n1, "n_top": n2,
                                 "clusters": int(s["cluster"].nunique()), "events_per_cluster": round(m, 1),
                                 "deff": round(deff, 2), "mde_pp": round(mde, 2),
                                 "verdict": "POWERED" if mde <= BAR_PP else "UNDERPOWERED"})
        # DTE buckets: events with any contract in the bucket
        for v, nn in (("LGs_d1", "n_d1"), ("LGs_d5", "n_d5")):
            out["cells"].append({"sample": name, "cell": f"dte_{v}", "events_with_bucket": int((sc[nn] > 0).sum())})
        cw = sc[(sc["min_to_close"] > 0) & (sc["min_to_close"] <= 60)]
        out["cells"].append({"sample": name, "cell": "close_window_60", "n_bottom": int((cw["lab"] == 0).sum()),
                             "n_top": int((cw["lab"] == 2).sum())})
        cw = sc[(sc["min_to_close"] > 0) & (sc["min_to_close"] <= 30)]
        out["cells"].append({"sample": name, "cell": "close_window_30", "n_bottom": int((cw["lab"] == 0).sum()),
                             "n_top": int((cw["lab"] == 2).sum())})
        out[f"{name}_lgs_quantiles"] = {p: [round(float(x), 3) for x in np.nanquantile(g["LGs"], [.05, .33, .5, .67, .95])]
                                        for p, g in sc.groupby("pair")}
        out[f"{name}_share_lgs_negative"] = {p: round(float((g["LGs"] < 0).mean()), 3) for p, g in sc.groupby("pair")}
    (OUTD / "counts.json").write_text(json.dumps(out, indent=1, default=float))
    print(json.dumps(out, indent=1, default=float))


def gate(c_all, halves, per_inst, nb, perm_pct, need_inst_rule):
    ok = c_all["est"] is not None and c_all["est"] >= BAR_PP and c_all["lo"] > 0
    ok &= all(h["est"] is not None and h["est"] > 0 for h in halves)
    ok &= need_inst_rule(per_inst)
    nb_pass = nb["est"] is not None and nb["est"] >= BAR_PP and nb["lo"] > 0
    ok &= not nb_pass
    ok &= perm_pct is not None and perm_pct > 97.5
    return bool(ok), bool(nb_pass)


def perm_pct(e, lab, y, rng, real, n=B):
    """Whole-cluster block permutation of the label sequence within each instrument."""
    vals = []
    pairs = e["pair"].to_numpy()
    cl_all = e["cluster"].to_numpy()
    groups = []
    for p in np.unique(pairs):
        ix = np.where(pairs == p)[0]
        u, inv = np.unique(cl_all[ix], return_inverse=True)
        o = np.argsort(inv, kind="stable")
        bounds = np.searchsorted(inv[o], np.arange(len(u) + 1))
        groups.append((ix, [ix[o[bounds[k]:bounds[k + 1]]] for k in range(len(u))]))
    for _ in range(n):
        newlab = lab.copy()
        for ix, parts in groups:
            order = rng.permutation(len(parts))
            seq = lab[np.concatenate([parts[k] for k in order])]
            newlab[ix] = seq
        est = Est(e, newlab, y)
        vals.append(est.point())
    vals = np.array(vals) * 100
    return float((vals < real).mean() * 100), float(np.nanmean(vals)), float(np.nanstd(vals))


def score():
    rng = np.random.default_rng(SEED)
    res = {"id": "level-local-gamma", "seed": SEED, "B": B, "ranAt": datetime.now(timezone.utc).isoformat(),
           "prereg": "forge/LEVEL_LOCAL_GAMMA_PREREG.md", "branch": "main", "cells": [], "secondary": [],
           "outcome_shares": {}}
    for name, pairs in (("primary", PRIMARY), ("gold", GOLD), ("fx", FX)):
        e = load(pairs)
        e["lab"] = pit_terciles(e, "LGs")
        e = e[e["lab"] >= 0].reset_index(drop=True)
        cf = CACHE / f"outcomes_{name}.npz"
        if cf.exists():
            z = np.load(cf)
            y, amb, unres, rets = z["y"], z["amb"], z["unres"], {h: z[f"r{h}"] for h in (15, 60, 240)}
            assert len(y) == len(e)
        else:
            y, amb, unres, rets = outcomes(e)
            np.savez(cf, y=y, amb=amb, unres=unres, **{f"r{h}": v for h, v in rets.items()})
        e["y"], e["amb"], e["unres"] = y, amb, unres
        for hm, v in rets.items():
            e[f"r{hm}"] = v
        e["y_unres_hold"] = np.where(unres, 0.0, y)
        lab = e["lab"].to_numpy()
        e.to_parquet(CACHE / f"scored_{name}.parquet", index=False)
        sh = {}
        for (p, k), g in e.groupby(["pair", e["kind"] == "random"]):
            sh[f"{p}|{'random' if k else 'real'}"] = {"n": len(g), "break": float((g["y"] == 1).mean()),
                                                      "hold": float((g["y"] == 0).mean()),
                                                      "unresolved": float(g["unres"].mean()),
                                                      "ambiguous": float(g["amb"].mean())}
        res["outcome_shares"][name] = sh
        med = e.groupby("pair")["date"].transform(lambda d: d.sort_values().iloc[len(d) // 2])
        first_half = (e["date"] < med).to_numpy()
        lab_nb = pit_terciles(e, "LGs_nb")
        cells = {}

        def run_cell(mask, labv=lab, yv="y", lo=0, hi=2):
            yy = np.where(mask, e[yv].to_numpy(float), np.nan)
            return summarize(Est(e, labv, yy, lo, hi), rng)

        for kind, km in (("random", (e["kind"] == "random").to_numpy()), ("real", (e["kind"] != "random").to_numpy())):
            c = run_cell(km)
            halves = [run_cell(km & first_half), run_cell(km & ~first_half)]
            per = {p: run_cell(km & (e["pair"] == p).to_numpy()) for p in pairs}
            nb = run_cell(km, labv=lab_nb)
            sw = Est(e, -lab + 2 if False else np.where(lab >= 0, 2 - lab, -1), np.where(km, e["y"], np.nan))
            assert c["est"] is None or abs(sw.point() * 100 + c["est"]) < 1e-9, "swap mirror did not flip"
            pp = perm_pct(e[km].reset_index(drop=True), lab[km], e["y"].to_numpy(float)[km], rng,
                          c["est"] if c["est"] is not None else 0.0) if c["est"] is not None else (None, None, None)
            if name == "fx":
                rule = lambda pi: sum(1 for v in pi.values() if v["est"] is not None and v["est"] > 0) >= 4  # noqa: E731
            else:
                rule = lambda pi: all(v["est"] is not None and v["est"] > 0 for v in pi.values())  # noqa: E731
            g_ok, nb_pass = gate(c, halves, per, nb, pp[0], rule)
            cells[kind] = dict(cell=c, halves=halves, per_inst=per, neighbour_year=nb, perm_pct=pp[0],
                               perm_mean=pp[1], perm_sd=pp[2], gate_pass=g_ok, mirror_passes=nb_pass)
        # P3 / DiD: real - random, bootstrap on the same cluster draws
        km_r = (e["kind"] == "random").to_numpy()
        e_r = Est(e, lab, np.where(km_r, e["y"], np.nan))
        e_l = Est(e, lab, np.where(~km_r, e["y"], np.nan))
        allcl = np.unique(e["cluster"])
        W = cluster_weights(allcl, rng)

        def remap(est):
            pos = np.searchsorted(allcl, est.cl)
            return W[:, pos]
        bd = (e_l.boot(remap(e_l)) - e_r.boot(remap(e_r))) * 100
        bd = bd[np.isfinite(bd)]
        did = (e_l.point() - e_r.point()) * 100
        did_h = []
        for hm in (first_half, ~first_half):
            a = Est(e, lab, np.where(~km_r & hm, e["y"], np.nan)).point()
            r = Est(e, lab, np.where(km_r & hm, e["y"], np.nan)).point()
            did_h.append((a - r) * 100)
        did_c = {"est": did, "lo": float(np.percentile(bd, 2.5)), "hi": float(np.percentile(bd, 97.5)),
                 "se": float(bd.std()), "mde": float(2.8 * bd.std()),
                 "p": float(min(1, 2 * min((bd <= 0).mean(), (bd >= 0).mean()))), "halves": did_h}
        did_c["gate_pass"] = bool(abs(did) >= BAR_PP and (did_c["lo"] > 0 or did_c["hi"] < 0)
                                  and all(np.sign(x) == np.sign(did) for x in did_h))
        cells["did"] = did_c
        res[name] = cells

        # ---------------- secondary family (descriptive; BH within)
        sec = []

        def add(label, d):
            if d.get("est") is not None:
                sec.append({"sample": name, "cell": label, **{k: v for k, v in d.items() if k != "halves"}})

        for kind, km in (("random", km_r), ("real", ~km_r)):
            if name == "primary":
                for p in pairs:
                    add(f"{kind}|{p}", run_cell(km & (e["pair"] == p).to_numpy()))
            if kind == "real":
                for fam in ("ladder", "wall"):
                    add(f"real|{fam}", run_cell((e["kind"] == fam).to_numpy()))
            mtc = e["min_to_close"].to_numpy()
            for wmin in (60, 30):
                inw = (mtc > 0) & (mtc <= wmin)
                a = run_cell(km & inw)
                bq = run_cell(km & ~inw)
                add(f"{kind}|close_last{wmin}", a)
                add(f"{kind}|outside_last{wmin}", bq)
                # interaction on shared cluster draws
                ea = Est(e, lab, np.where(km & inw, e["y"], np.nan))
                eb = Est(e, lab, np.where(km & ~inw, e["y"], np.nan))
                if ea.n_lo >= 10 and ea.n_hi >= 10:
                    bi = (ea.boot(remap(ea)) - eb.boot(remap(eb))) * 100
                    bi = bi[np.isfinite(bi)]
                    if len(bi):
                        add(f"{kind}|close_last{wmin}_minus_rest",
                            {"est": (ea.point() - eb.point()) * 100, "lo": float(np.percentile(bi, 2.5)),
                             "hi": float(np.percentile(bi, 97.5)), "se": float(bi.std()), "n_lo": ea.n_lo,
                             "n_hi": ea.n_hi, "p": float(min(1, 2 * min((bi <= 0).mean(), (bi >= 0).mean())))})
            for v in ("LGs_d1", "LGs_d5", "LGs_far", "local_share", "slope"):
                lv = pit_terciles(e, v)
                d = run_cell(km, labv=lv)
                if v in ("LGs_d1", "LGs_d5") and d.get("n_lo", 0) < 400:
                    d["note"] = "UNDERPOWERED (< 400 per arm)"
                add(f"{kind}|tercile_{v}", d)
            add(f"{kind}|sign_split", run_cell(km, labv=sign_lab(e["LGs"].to_numpy())))
            add(f"{kind}|bottom_vs_middle", run_cell(km, lo=0, hi=1))
            add(f"{kind}|middle_vs_top", run_cell(km, lo=1, hi=2))
            on = e["net_open"].to_numpy()
            add(f"{kind}|within_open_long", run_cell(km & (on > 0)))
            add(f"{kind}|within_open_short", run_cell(km & (on < 0)))
            for hm in (15, 60, 240):
                add(f"{kind}|ret{hm}_sigma_x100", run_cell(km, yv=f"r{hm}"))
            add(f"{kind}|unresolved_as_hold", run_cell(km, yv="y_unres_hold"))
        if sec:
            ok, qv = bh([s["p"] for s in sec])
            for s, o, q in zip(sec, ok, qv):
                s["bh_pass"], s["q"] = bool(o), float(q)
        res["secondary"] += sec
        print(f"[{name}] done", flush=True)

    # primary family BH over P1-P3
    P = [res["primary"]["random"]["cell"]["p"], res["primary"]["real"]["cell"]["p"], res["primary"]["did"]["p"]]
    ok, qv = bh(P)
    res["primary_bh"] = {"P1": [bool(ok[0]), float(qv[0])], "P2": [bool(ok[1]), float(qv[1])],
                         "P3": [bool(ok[2]), float(qv[2])]}
    S = [res["gold"]["random"]["cell"]["p"] or 1, res["fx"]["random"]["cell"]["p"] or 1]
    ok2, qv2 = bh(S)
    res["secondary_sample_bh"] = {"S1_random": [bool(ok2[0]), float(qv2[0])], "S2_random": [bool(ok2[1]), float(qv2[1])]}
    (OUTD / "results.json").write_text(json.dumps(res, indent=1, default=float))
    pd.DataFrame(res["secondary"]).to_csv(OUTD / "cells.csv", index=False)
    print("written results.json")


if __name__ == "__main__":
    {"count": count, "score": score}[sys.argv[1]]()
