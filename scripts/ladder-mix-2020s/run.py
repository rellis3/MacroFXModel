"""ladder-mix-2020s (forge/LADDER_MIX_2020S_PREREG.md): one sigma vs a sigma per percentile / per regime / per cell,
fitted and chosen walk-forward on 2020s data only.

    python scripts/ladder-mix-2020s/run.py    -> analysis/output/ladder-mix-2020s/{results.json, report.txt}
"""
from __future__ import annotations

import json
import os
import shutil
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts/ladder-v2"))
import ladder as L  # noqa: E402
from forge import vol as V  # noqa: E402

OUT = ROOT / "analysis/output/ladder-mix-2020s"
SEED, B, BLOCK = 20261119, 2000, 63
LINE_YEARS = range(2021, 2027)
TEST_YEARS = range(2022, 2027)
CELLS = [(k, t) for k in ("hl", "oh", "ol") for t in (75, 90)]
TGT = {50: 0.5, 75: 0.25, 90: 0.10}
NQ_ARMS = ["A0", "E1", "E2", "E3", "E4", "E5", "E6", "H8", "R5", "R15", "V3", "V4"]
LOG: list[str] = []


def say(s=""):
    sys.stdout.reconfigure(encoding="utf-8")
    print(s, flush=True)
    LOG.append(s)


def prep(sym):
    """Rows + arm list; NQ's banked rows are copied into a work dir with the harness's file names."""
    if sym == "NQ":
        wd = OUT / "nq_work"; wd.mkdir(parents=True, exist_ok=True)
        src = ROOT / "analysis/output/ladder-v2-nq"
        shutil.copy(src / "rows_C.parquet", wd / "rows_C.parquet")
        for k in (5, 15):
            shutil.copy(src / f"rvfeat_C_{k}.parquet", wd / f"rvfeat_C_R{k}.parquet")
        os.environ["LADDER_OUT"] = str(wd)
        arms = NQ_ARMS
    else:
        os.environ.pop("LADDER_OUT", None)
        arms = L.arms_for(sym)
    S = pd.read_parquet(L.out_dir(sym) / "rows_C.parquet")
    S["rel"] = S["A0"] / S["A0"].rolling(250, min_periods=60).median().shift(1)
    T = L.walk_forward(S, sym, "C", arms, years=LINE_YEARS, quiet=True, train_from="2020-01-01")
    return T, arms


def exceed(T, a, k, t):
    return (T[k] > T[f"{a}_{k}_{t}"]).to_numpy(float)


def cell_miss(T, arms, edges):
    """arm -> array of 30 |miss| (pp) on rows T, cells = fifth x qty x rung; fifths from `edges`."""
    q = np.searchsorted(edges, T["rel"].to_numpy())
    out = {}
    for a in arms:
        m = []
        for j in range(5):
            sel = q == j
            for k, t in CELLS:
                m.append(abs(exceed(T[sel], a, k, t).mean() - TGT[t]) * 100 if sel.any() else np.nan)
        out[a] = np.array(m)
    return out


def guard_ok(T, arms):
    g = {a: np.mean([abs(exceed(T, a, k, t).mean() - TGT[t]) * 100 for k in ("hl", "oc", "oh", "ol") for t in (50, 75, 90)]) for a in arms}
    return [a for a in arms if g[a] <= g["A0"] + 1.0]


def choose(prior, arms):
    """Each strategy's arm map, chosen on prior (out-of-sample) rows only."""
    edges = np.quantile(prior["rel"], [.2, .4, .6, .8])
    el = guard_ok(prior, arms)
    cm = cell_miss(prior, el, edges)
    idx = {(j, k, t): j * 6 + c for j in range(5) for c, (k, t) in enumerate(CELLS)}
    s1 = min(el, key=lambda a: np.nanmean(cm[a]))
    s2 = {t: min(el, key=lambda a: np.nanmean([cm[a][idx[(j, k, t)]] for j in range(5) for k in ("hl", "oh", "ol")])) for t in (75, 90)}
    s3 = {j: min(el, key=lambda a: np.nanmean(cm[a][j * 6:(j + 1) * 6])) for j in range(5)}
    s4 = {key: min(el, key=lambda a: cm[a][i]) for key, i in idx.items()}
    return edges, s1, s2, s3, s4


def lines_for(T, strat, choice, edges):
    """Strategy -> DataFrame of line columns {q}_{t} for each test row."""
    q = np.searchsorted(edges, T["rel"].to_numpy())
    out = pd.DataFrame(index=T.index)
    for k in ("hl", "oc", "oh", "ol"):
        for t in (50, 75, 90):
            tt = 75 if t == 50 else t
            if strat == "S0":
                a = np.full(len(T), "A0", dtype=object)
            elif strat == "S1":
                a = np.full(len(T), choice, dtype=object)
            elif strat == "S2":
                a = np.full(len(T), choice[tt], dtype=object)
            elif strat == "S3":
                a = np.array([choice[j] for j in q], dtype=object)
            else:
                kk = k if k in ("hl", "oh", "ol") else "hl"
                a = np.array([choice[(j, kk, tt)] for j in q], dtype=object)
            out[f"{k}_{t}"] = [T.at[i, f"{ai}_{k}_{t}"] for i, ai in zip(T.index, a)]
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    per, picks = {}, {}
    for sym in ("NQ", "GOLD", "EURUSD"):
        T, arms = prep(sym)
        say(f"{sym}: {len(arms)} arms; lines {T['date'].min().date()} -> {T['date'].max().date()} ({len(T)} rows, fitted from 2020)")
        parts = []
        picks[sym] = {}
        for Y in TEST_YEARS:
            prior, te = T[(T["year"] >= 2021) & (T["year"] < Y)], T[T["year"] == Y]
            if not len(te):
                continue
            edges, s1, s2, s3, s4 = choose(prior, arms)
            picks[sym][Y] = {"S1": s1, "S2": s2, "S3": {str(k): v for k, v in s3.items()}, "S4_distinct": sorted(set(s4.values()))}
            rows = te[["date", "year", "rel", "hl", "oc", "oh", "ol"]].copy()
            for st, ch in (("S0", None), ("S1", s1), ("S2", s2), ("S3", s3), ("S4", s4)):
                Lx = lines_for(te, st, ch, edges)
                for c in Lx.columns:
                    rows[f"{st}_{c}"] = Lx[c].to_numpy()
            parts.append(rows)
            say(f"  {Y}: S1 {s1} | S2 p75 {s2[75]} p90 {s2[90]} | S3 {[s3[j] for j in range(5)]} | S4 {len(set(s4.values()))} distinct arms")
        per[sym] = pd.concat(parts, ignore_index=True)

    strats = ["S0", "S1", "S2", "S3", "S4"]
    def score(D):
        edges = np.quantile(D["rel"], [.2, .4, .6, .8]); q = np.searchsorted(edges, D["rel"].to_numpy())
        res = {}
        for st in strats:
            m = []
            for j in range(5):
                sel = q == j
                for k, t in CELLS:
                    m.append(abs((D.loc[sel, k] > D.loc[sel, f"{st}_{k}_{t}"]).mean() - TGT[t]) * 100)
            pin = sum(V.pinball_loss(D[k].to_numpy(), D[f"{st}_{k}_{t}"].to_numpy(), t / 100).mean() for k in ("hl", "oh", "ol") for t in (50, 75, 90))
            res[st] = (float(np.mean(m)), float(pin))
        return res

    res = {"seed": SEED, "picks": {s: {str(y): v for y, v in d.items()} for s, d in picks.items()}, "per_instrument": {}, "pooled": {}}
    say("\n== per instrument, test years 2022 -> 2026-08 (30-cell regime miss pp; pinball vs S1)")
    base = {}
    for sym, D in per.items():
        sc = score(D); base[sym] = sc
        res["per_instrument"][sym] = {st: {"miss": v[0], "pinball_vs_S1": v[1] / sc["S1"][1]} for st, v in sc.items()}
        say(f"  {sym:6} n={len(D)}  " + "  ".join(f"{st} {v[0]:.2f} ({v[1] / sc['S1'][1]:.3f})" for st, v in sc.items()))
    # pooled: mean of the three instruments' misses; session blocks within instrument
    pooled = {st: float(np.mean([base[s][st][0] for s in per])) for st in strats}
    BI = {s: L.blocks(len(D), rng) for s, D in per.items()}
    draws = {st: np.zeros(B) for st in strats}
    for b in range(B):
        ms = {st: [] for st in strats}
        for s, D in per.items():
            sc = score(D.iloc[BI[s][b]].reset_index(drop=True))
            for st in strats:
                ms[st].append(sc[st][0])
        for st in strats:
            draws[st][b] = np.mean(ms[st])
        if b in (0, 499, 999, 1999):
            say(f"    bootstrap {b + 1}/{B}")
    say("\n== pooled (mean of NQ, GOLD, EURUSD), difference vs S1 (one sigma), 90% CI")
    pv = []
    for st in strats:
        d = draws[st] - draws["S1"]
        ci = [float(np.quantile(d, .05)), float(np.quantile(d, .95))]
        res["pooled"][st] = {"miss": pooled[st], "minus_S1": pooled[st] - pooled["S1"], "ci90": ci, "p": float(np.mean(d >= 0))}
        if st in ("S2", "S3", "S4"):
            pv.append(res["pooled"][st]["p"])
        say(f"  {st}: miss {pooled[st]:.2f}pp  minus S1 {pooled[st] - pooled['S1']:+.2f} [{ci[0]:+.2f},{ci[1]:+.2f}]")
    p = np.array(pv); o = np.argsort(p); okb = p[o] <= 0.10 * np.arange(1, 4) / 3
    k = np.max(np.where(okb)[0]) + 1 if okb.any() else 0
    rej = np.zeros(3, bool); rej[o[:k]] = True
    for st, r in zip(("S2", "S3", "S4"), rej):
        x = res["pooled"][st]
        pin_ok = all(res["per_instrument"][s][st]["pinball_vs_S1"] <= 1.0 for s in per)
        verdict = "VALIDATED" if (r and x["ci90"][1] < 0 and pin_ok) else ("NULL" if x["ci90"][0] > -0.2 else "UNDERPOWERED")
        x["verdict"] = verdict
        say(f"  {st} -> {verdict}")
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=str))
    (OUT / "report.txt").write_text("\n".join(LOG) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
