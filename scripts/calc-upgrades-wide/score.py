"""calc-upgrades-wide (forge/CALC_UPGRADES_WIDE_PREREG.md, pushed 154e630c): gold's calc upgrades on every instrument of the
QLIKE export (18 futures, 40 CFDs), same arms and code as scripts/gold-calc-upgrades/score.py.

    python scripts/calc-upgrades-wide/score.py run     -> per-instrument loss files (slow; 4 processes)
    python scripts/calc-upgrades-wide/score.py score   -> pooled verdicts, per-instrument tables, RESULTS inputs
"""
from __future__ import annotations

import importlib.util
import json
import sys
import traceback
import warnings
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "analysis/output/calc-upgrades-wide"
SEED, B, BLOCK = 20261126, 2000, 63
JORDAN = ("hl", "cup", "cdn")
LINES = ("hl", "oh", "ol", "oc", "cup", "cdn")
NEW = ["N1_HARQ", "N2_QL_HARCJ", "N3_SESS", "N4_FRESH", "N5_RR", "N6_HARCJ_IV", "N7_ALL"]
IV = {"NQ": "VXN", "SPX500": "VIX", "US30": "VXD", "US2000": "RVX", "SILVER": "VXSLV", "WTI": "OVX", "GOLD": "GVZ"}
HALVES = {"2020-22": (2020, 2022), "2023-26": (2023, 2026)}
CLASS = {**{s: "FX major" for s in ("EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF")},
         **{s: "index" for s in ("NQ", "SPX500", "US30", "US2000", "DE30", "UK100")},
         **{s: "metal" for s in ("GOLD", "SILVER", "PLATINUM", "PALLADIUM", "COPPER")},
         **{s: "energy" for s in ("WTI", "BRENT")}}
PARAMS = {"F": ROOT / "js/ladderV2QlikeParams.json", "C": ROOT / "js/ladderV2QlikeCfdParams.json"}


def load_gold():
    sp = importlib.util.spec_from_file_location("gold_up", ROOT / "scripts/gold-calc-upgrades/score.py")
    G = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(G)
    return G


def one(job):
    sym, track = job
    try:
        G = load_gold()
        G.LOG.clear()
        P = json.loads(PARAMS[track].read_text())["instruments"][sym]
        G.SYM = sym
        G.BUILD = G.RF.bdir(sym) if track == "F" else G.RC.bdir(sym)
        G.BASE = {track: {q: P["lines"][q]["arm"] for q in LINES}}
        ivc = IV.get(sym)
        G.TESTED = [a for a in NEW if ivc or a != "N6_HARCJ_IV"]
        if not hasattr(G.L, '_orig_iv'):
            G.L._orig_iv = G.L.iv_series        # the ladder module is shared across jobs in a worker: wrap the original once
        real_iv, orig_design = G.L._orig_iv, G.design

        def iv_series(code):
            return real_iv(ivc) if ivc else pd.Series(20.0, index=pd.date_range("2005-01-01", "2026-12-31", freq="D"))

        def design(F, iv):
            X, nxt = orig_design(F, iv)
            if not ivc:
                X.pop("N6_HARCJ_IV")
                f, y, how = X["N7_ALL"]
                X["N7_ALL"] = (f.drop(columns="iv"), y, how)
            return X, nxt

        G.L.iv_series, G.design = iv_series, design
        T, Q, masks, test, coefs = G.run(track)
        n = len(T)
        rec = {"date": T["date"].dt.strftime("%Y-%m-%d").to_numpy()[test], "year": T["year"].to_numpy()[test]}
        rec["base"] = G.daily(Q, lambda q: G.BASE[track][q], JORDAN, test, n)
        for a in G.TESTED + ["NC_NOISE"]:
            rec[a] = G.daily(Q, lambda q, a=a: a, JORDAN, test, n)
        pd.DataFrame(rec).to_parquet(OUT / "loss" / f"{track}_{sym}.parquet")
        lines = []
        for a in G.TESTED:
            for q in LINES:
                v = Q[(a, q)][test & masks[q]]; b = Q[(G.BASE[track][q], q)][test & masks[q]]
                lines.append(dict(track=track, sym=sym, arm=a, line=q, pct=float((np.nanmean(v) / np.nanmean(b) - 1) * 100)))
        cf = [dict(track=track, sym=sym, arm=nm, **c) for (nm, Y), c in coefs.items() if Y == 2026]
        return dict(sym=sym, track=track, ok=True, log=list(G.LOG), lines=lines, coefs=cf)
    except BaseException as e:  # noqa: BLE001  (SystemExit from a failed positive control included)
        return dict(sym=sym, track=track, ok=False, err=f"{type(e).__name__}: {e}", tb=traceback.format_exc()[-1500:])


def cmd_run():
    (OUT / "loss").mkdir(parents=True, exist_ok=True)
    jobs = [(s, t) for t in ("F", "C") for s in json.loads(PARAMS[t].read_text())["instruments"]]
    jobs = [j for j in jobs if not (OUT / "loss" / f"{j[1]}_{j[0]}.parquet").exists()]
    print(f"{len(jobs)} jobs", flush=True)
    res = []
    with ProcessPoolExecutor(max_workers=4) as ex:
        for r in ex.map(one, jobs):
            print(f"{r['track']} {r['sym']}: " + (" | ".join(x.strip() for x in r["log"]) if r["ok"] else "FAILED " + r["err"]), flush=True)
            res.append(r)
    old = json.loads((OUT / "runs.json").read_text()) if (OUT / "runs.json").exists() else []
    keep = {(r["sym"], r["track"]) for r in res}
    allr = [r for r in old if (r["sym"], r["track"]) not in keep] + res
    (OUT / "runs.json").write_text(json.dumps(allr, indent=1, default=float))


def pooled(files, arm, rng, exclude=("GOLD",)):
    F = {f.stem.split("_", 1)[1]: pd.read_parquet(f).set_index("date") for f in files}
    F = {s: f for s, f in F.items() if s not in exclude and arm in f}
    dates = sorted(set().union(*[set(f.index) for f in F.values()]))
    A = np.zeros(len(dates)); Bv = np.zeros(len(dates))
    for f in F.values():
        g = f.reindex(dates)
        A += np.nan_to_num(g[arm].to_numpy(float)); Bv += np.nan_to_num(g["base"].to_numpy(float))
    yrs = np.array([int(d[:4]) for d in dates])
    n = len(dates); nb = int(np.ceil(n / BLOCK)); bs = np.empty(B)
    for i in range(B):
        st = rng.integers(0, n, nb); idx = (st[:, None] + np.arange(BLOCK)[None, :]).ravel() % n
        bs[i] = A[idx].sum() / Bv[idx].sum() - 1
    hv = {h: float(A[(yrs >= lo) & (yrs <= hi)].sum() / Bv[(yrs >= lo) & (yrs <= hi)].sum() - 1) * 100 for h, (lo, hi) in HALVES.items()}
    return dict(pct=float(A.sum() / Bv.sum() - 1) * 100, lo=float(np.percentile(bs, 5)) * 100, hi=float(np.percentile(bs, 95)) * 100,
                p=float(np.mean(bs >= 0)), halves=hv, n_instruments=len(F), n_days=n)


def per_inst(f, arm, rng):
    d = pd.read_parquet(f)
    if arm not in d:
        return None
    a, b = d[arm].to_numpy(float), d["base"].to_numpy(float)
    n = len(a); nb = int(np.ceil(n / BLOCK)); bs = np.empty(500)
    for i in range(500):
        st = rng.integers(0, n, nb); idx = (st[:, None] + np.arange(BLOCK)[None, :]).ravel() % n
        bs[i] = a[idx].sum() / b[idx].sum() - 1
    return float(a.sum() / b.sum() - 1) * 100, float(np.percentile(bs, 5)) * 100, float(np.percentile(bs, 95)) * 100, float(np.mean(bs >= 0))


def bh(p, q=0.10):
    p = np.asarray(p); o = np.argsort(p); m = len(p)
    passed = p[o] <= q * np.arange(1, m + 1) / m
    k = np.max(np.flatnonzero(passed)) + 1 if passed.any() else 0
    out = np.zeros(m, bool); out[o[:k]] = True
    return out


def cmd_score():
    rng = np.random.default_rng(SEED)
    runs = json.loads((OUT / "runs.json").read_text())
    failed = [(r["track"], r["sym"], r["err"]) for r in runs if not r["ok"]]
    P = {}
    for t in ("F", "C"):
        files = sorted((OUT / "loss").glob(f"{t}_*.parquet"))
        for a in ("N4_FRESH", "N7_ALL", "N6_HARCJ_IV", "N1_HARQ", "N2_QL_HARCJ", "N3_SESS", "N5_RR", "NC_NOISE"):
            P[(t, a)] = pooled(files, a, rng)
    w = [P[("F", "N4_FRESH")], P[("F", "N7_ALL")]]
    passbh = bh([x["p"] for x in w])
    verdict = {}
    for (nm, x, c, pb) in (("W1 N4_FRESH", w[0], P[("C", "N4_FRESH")], passbh[0]), ("W2 N7_ALL", w[1], P[("C", "N7_ALL")], passbh[1])):
        if x["hi"] < 0 and pb and all(v < 0 for v in x["halves"].values()) and c["pct"] < 0:
            verdict[nm] = "VALIDATED"
        elif x["lo"] > -0.5:
            verdict[nm] = "NULL"
        else:
            verdict[nm] = "UNDERPOWERED"
    rows = []
    for t in ("F", "C"):
        for f in sorted((OUT / "loss").glob(f"{t}_*.parquet")):
            sym = f.stem.split("_", 1)[1]
            for a in NEW + ["NC_NOISE"]:
                r = per_inst(f, a, rng)
                if r:
                    rows.append(dict(track=t, sym=sym, cls=CLASS.get(sym, "FX cross"), arm=a, pct=r[0], lo=r[1], hi=r[2], p=r[3]))
    I = pd.DataFrame(rows)
    I["bh_flag"] = False
    for (t, a), g in I.groupby(["track", "arm"]):
        I.loc[g.index, "bh_flag"] = bh(g["p"].to_numpy())
    I.to_csv(OUT / "per_instrument.csv", index=False)
    L = pd.DataFrame([x for r in runs if r["ok"] for x in r["lines"]])
    L.to_csv(OUT / "per_line.csv", index=False)
    pd.DataFrame([x for r in runs if r["ok"] for x in r["coefs"]]).to_csv(OUT / "coefs_2026.csv", index=False)
    pcs = {f"{r['track']} {r['sym']}": r["log"][0] if r["ok"] else r["err"] for r in runs}
    out = ["POOLED (gold excluded): % change QLIKE HL+Close+ +Close-, arm vs export calc"]
    for (t, a), x in P.items():
        out.append(f"  {t} {a:12s} {x['pct']:+6.2f}% [{x['lo']:+.2f}, {x['hi']:+.2f}] p {x['p']:.3f} halves "
                   f"{x['halves']['2020-22']:+.2f} / {x['halves']['2023-26']:+.2f}  ({x['n_instruments']} instruments)")
    out += ["", "VERDICTS: " + json.dumps(verdict), "", f"failed: {failed}", ""]
    cls = I[I.arm.isin(["N4_FRESH", "N7_ALL"])].groupby(["track", "arm", "cls"])["pct"].agg(["median", "count", lambda s: (s < 0).mean()])
    out += ["By class (median % per instrument, n, share better):", cls.round(2).to_string(), ""]
    for t in ("F", "C"):
        for a in ("N4_FRESH", "N7_ALL"):
            g = I[(I.track == t) & (I.arm == a)].sort_values("pct")
            out.append(f"{t} {a}: " + "  ".join(f"{r.sym} {r.pct:+.1f}{'*' if r.bh_flag else ''}" for r in g.itertuples()))
    out += ["", "line detail (median over instruments, % vs export calc):",
            L[L.arm.isin(["N4_FRESH", "N7_ALL"])].groupby(["track", "arm", "line"])["pct"].median().round(2).unstack().to_string()]
    noise = I[I.arm == "NC_NOISE"]
    out += ["", f"noise control: median {noise.pct.median():+.2f}%, range {noise.pct.min():+.2f} to {noise.pct.max():+.2f}"]
    txt = "\n".join(out)
    print(txt)
    (OUT / "report.txt").write_text(txt, encoding="utf-8")
    json.dump(dict(seed=SEED, B=B, block=BLOCK, verdicts=verdict, pooled={f"{t}|{a}": x for (t, a), x in P.items()},
                   failed=failed, positive_controls=pcs), open(OUT / "results.json", "w"), indent=1)


if __name__ == "__main__":
    {"run": cmd_run, "score": cmd_score}[sys.argv[1]]()
