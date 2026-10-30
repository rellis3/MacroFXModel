"""NQ forecast lines on CME futures vs the CFD: the M7 reference race re-run on the owner's 1-minute futures file.

EXPLORATORY (register row nq-futures-line-race). Not part of frozen M7 and not M8: a data-source check asked by the owner
("does futures data show anything different?"), plus one descriptive look at session-VWAP extension at the touch using
real futures volume. Nothing here is a confirmatory test; read it as context.

Same code runs on both price sources over the same London 00:00-22:00 windows (archive sessions.json), so any gap between
them is the data, not the method. Levels are rebuilt on each source from its own first-bar open and the archive's rung
widths (oh/ol/hl pct x factor); placebo ladders x0.70/0.85/1.15/1.30 combined with M7's B2 weights (-1/6, 2/3, 2/3, -1/6).

Race (M7 R2/R3 shapes): touch bar k = first bar whose high (low) reaches the line; E = close of k; N = next rung, P = previous
reference (open for p50, the p50 line for p75), both frozen at k. From bar k+1: next-first, previous-first, both in one bar
(tie, excluded and counted: intrabar order is never inferred) or neither by the window end (valued at the last close).
Continuation pays a/b (N first) or -1; fade pays b/a (P first) or -1; a = distance to N, b = distance to P.
Costs, round trip in points: futures 1 tick a side + $4.50 commission on NQ ($20/pt) = 0.725 pt; CFD 0.0068% of price
(cost_table.json OANDA model). Net R = gross R - cost / risk distance.

Data: analysis/output/nt8/drive/NQ_1m_drive.parquet (gitignored; open-stamped UTC, ratio back-adjusted, ends 2026-04-21)
and VolRangeForecaster/data/m1/nq_m1.parquet (CFD). Lockbox untouched (futures end before 2026-08-21).

    python -I scripts/day-reconstruction/futures_check.py      (env M7_DATA = checkout holding the gitignored inputs)
"""
import json
import os
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.environ.get("M7_DATA", ROOT))
ARC = ROOT / "analysis/output/day-reconstruction/archive"
OUT = ROOT / "analysis/output/day-reconstruction/futures_check"
FACTORS = (1.0, 0.70, 0.85, 1.15, 1.30)
W_B2 = {0.70: -1 / 6, 0.85: 2 / 3, 1.15: 2 / 3, 1.30: -1 / 6}
NEXT = {"p50": "p75", "p75": "p90"}
COST_FUT_PT = 2 * 0.25 + 4.50 / 20
COST_CFD_PCT = 0.0068
B, SEED = 1000, 20261030
FUT_END = pd.Timestamp("2026-04-21")


def load_sources():
    f = pd.read_parquet(DATA / "analysis/output/nt8/drive/NQ_1m_drive.parquet")
    ep = pd.Timestamp("1970-01-01", tz="UTC")
    fut = pd.DataFrame({"t": ((f.utc - ep).dt.total_seconds()).astype("int64").values,
                        "o": f.o.values, "h": f.h.values, "l": f.l.values, "c": f.c.values, "v": f.v.astype(float).values})
    c = pd.read_parquet(DATA / "VolRangeForecaster/data/m1/nq_m1.parquet")
    cfd = pd.DataFrame({"t": np.asarray((c.index - ep).total_seconds()).astype("int64"), "o": c.open.values,
                        "h": c.high.values, "l": c.low.values, "c": c.close.values, "v": c.volume.values})
    for d in (fut, cfd):
        assert d.t.is_monotonic_increasing
    return {"futures": fut, "cfd": cfd}


def first_true(x):
    i = np.argmax(x)
    return int(i) if x.size and x[i] else -1


def day_rows(bars, d, src):
    t, O, H, L, C, V = (bars[k] for k in ("t", "o", "h", "l", "c", "v"))
    n = len(C)
    if n < 30:
        return []
    o = O[0]
    scale = o * d["sigma_used_pct"] / 100
    tp = (H + L + C) / 3
    cv = np.cumsum(V)
    vwap = np.where(cv > 0, np.cumsum(tp * V) / np.where(cv > 0, cv, 1), np.nan)
    runhi = np.maximum.accumulate(H)
    runlo = np.minimum.accumulate(L)
    cost_pt = COST_FUT_PT if src == "futures" else COST_CFD_PCT / 100 * o
    rows = []
    for fam in ("OH", "OL", "ProjH", "ProjL"):
        s = 1 if fam in ("OH", "ProjH") else -1
        for rung in ("p50", "p75"):
            for f in FACTORS:
                if fam in ("OH", "OL"):
                    key = ("oh_{}_pct" if s == 1 else "ol_{}_pct")
                    pc = lambda r: d[key.format(r)] * f / 100
                    lvl = o * (1 + s * pc(rung))
                    hit = H >= lvl if s == 1 else L <= lvl
                    k = first_true(hit)
                    if k < 0:
                        continue
                    base = o
                else:
                    pc = lambda r: d["hl_{}".format(r)] * f / 100
                    # projected line at bar j uses the opposite running extreme through j-1
                    ref = np.r_[np.nan, (runlo if s == 1 else runhi)[:-1]]
                    lv = ref * (1 + s * pc(rung))
                    hit = (H >= lv) if s == 1 else (L <= lv)
                    hit[0] = False
                    k = first_true(hit)
                    if k < 0:
                        continue
                    base = ref[k]
                E = C[k]
                N = base * (1 + s * pc(NEXT[rung]))
                P = o if rung == "p50" else base * (1 + s * pc("p50"))
                a, b = s * (N - E), -s * (P - E)
                if a <= 0 or b <= 0 or k == n - 1:
                    continue
                hn = (H[k + 1:] >= N) if s == 1 else (L[k + 1:] <= N)
                hp = (L[k + 1:] <= P) if s == 1 else (H[k + 1:] >= P)
                jn, jp = first_true(hn), first_true(hp)
                jn = jn if jn >= 0 else 10**9
                jp = jp if jp >= 0 else 10**9
                if jn == jp == 10**9:
                    out, mv = "U", s * (C[-1] - E)
                    cont, fade = mv / b, -mv / a
                elif jn == jp:
                    out, cont, fade = "tie", np.nan, np.nan
                elif jn < jp:
                    out, cont, fade = "N", a / b, -1.0
                else:
                    out, cont, fade = "P", -1.0, b / a
                post = (H[k:] if s == 1 else -L[k:])
                ext_after = (post.max() - (H[k] if s == 1 else -L[k])) / scale
                rows.append({"date": d["date"], "src": src, "group": "Fixed" if fam in ("OH", "OL") else "Projected",
                             "family": fam, "rung": rung, "factor": f, "k": k, "out": out, "cont": cont, "fade": fade,
                             "cont_net": cont - cost_pt / b, "fade_net": fade - cost_pt / a,
                             "a_sig": a / scale, "b_sig": b / scale,
                             "ext_vwap": s * (E - vwap[k]) / scale if np.isfinite(vwap[k]) else np.nan,
                             "turn": ext_after < 0.10})
    return rows


def boot_stats(df, col, B=B, seed=SEED):
    """Forecast mean, B2 placebo, delta; paired date Poisson bootstrap."""
    dates = np.array(sorted(df.date.unique()))
    di = {x: i for i, x in enumerate(dates)}
    idx = df.date.map(di).to_numpy()
    res = {}
    sums, cnts = {}, {}
    for f in FACTORS:
        m = (df.factor.to_numpy() == f) & np.isfinite(df[col].to_numpy(dtype=float))
        sums[f] = np.bincount(idx[m], weights=df[col].to_numpy(dtype=float)[m], minlength=len(dates))
        cnts[f] = np.bincount(idx[m], minlength=len(dates)).astype(float)
    rng = np.random.default_rng(seed)
    Wt = rng.poisson(1.0, size=(B, len(dates))).astype(float)

    def stat(w):
        mf = (w @ sums[1.0]) / (w @ cnts[1.0])
        mp = sum(W_B2[f] * (w @ sums[f]) / (w @ cnts[f]) for f in W_B2)
        return mf, mp, mf - mp

    one = np.ones(len(dates))
    est = stat(one)
    bs = np.array([stat(Wt[i]) for i in range(B)])
    for j, name in enumerate(("forecast", "placebo", "delta")):
        lo, hi = np.nanpercentile(bs[:, j], [2.5, 97.5])
        res[name] = {"est": float(est[j]), "lo": float(lo), "hi": float(hi)}
    res["n_forecast"] = int(cnts[1.0].sum())
    return res


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    days = pd.read_parquet(ARC / "NQ_days.parquet")
    days["date"] = days.date.astype(str)
    sess = json.loads((ARC / "NQ_sessions.json").read_text())
    src = load_sources()
    rows = []
    for name, df in src.items():
        tt = df.t.to_numpy()
        arr = {k: df[k].to_numpy(dtype=float) for k in ("o", "h", "l", "c", "v")}
        arr["t"] = tt
        for d in days.to_dict("records"):
            if pd.Timestamp(d["date"]) > FUT_END:
                continue
            w = sess.get(d["date"])
            if not w:
                continue
            i0, i1 = np.searchsorted(tt, w["t0"]), np.searchsorted(tt, w["tN"], side="right")
            bars = {k: v[i0:i1] for k, v in arr.items()}
            rows += [{**r, "era": d["era"]} for r in day_rows(bars, d, name)]
    t = pd.DataFrame(rows)
    # keep only dates both sources priced, so the comparison is paired
    both = set(t[t.src == "futures"].date) & set(t[t.src == "cfd"].date)
    t = t[t.date.isin(both)]
    t.to_parquet(OUT / "touches.parquet", index=False)

    out = {"meta": {"B": B, "seed": SEED, "cost_fut_pt": COST_FUT_PT, "cost_cfd_pct": COST_CFD_PCT,
                    "dates": len(both), "first": min(both), "last": max(both)}, "cells": []}
    for era in ("oos_pit", "all"):
        te = t if era == "all" else t[t.era == "oos_pit"]
        for src_name in ("futures", "cfd"):
            ts = te[(te.src == src_name) & (te.out != "tie")]
            for (g, r), c in ts.groupby(["group", "rung"]):
                cell = {"era": era, "src": src_name, "group": g, "rung": r,
                        "ties": int(((te.src == src_name) & (te.group == g) & (te.rung == r) & (te.out == "tie") & (te.factor == 1.0)).sum())}
                for o_ in ("N", "P", "U"):
                    c2 = c.assign(x=(c.out == o_).astype(float))
                    cell[f"share_{o_}"] = boot_stats(c2, "x")
                for col in ("cont", "fade", "cont_net", "fade_net", "turn"):
                    cell[col] = boot_stats(c.assign(turn=c.turn.astype(float)), col)
                # descriptive: fade by session-VWAP extension at the touch (fixed sigma buckets, no sample quantiles)
                cell["fade_by_ext"] = {}
                for lab, lo_, hi_ in (("<0.5", -9, 0.5), ("0.5-1.0", 0.5, 1.0), (">=1.0", 1.0, 99)):
                    cb = c[(c.ext_vwap >= lo_) & (c.ext_vwap < hi_)]
                    if (cb.factor == 1.0).sum() >= 50 and all((cb.factor == f).sum() >= 20 for f in W_B2):
                        cell["fade_by_ext"][lab] = {"fade_net": boot_stats(cb, "fade_net"),
                                                    "turn": boot_stats(cb.assign(turn=cb.turn.astype(float)), "turn")}
                out["cells"].append(cell)
                print(era, src_name, g, r, "n", cell["fade"]["n_forecast"],
                      "N%% %.1f P%% %.1f U%% %.1f" % tuple(100 * cell[f"share_{o}"]["forecast"]["est"] for o in "NPU"),
                      "fade %.3f (pl %.3f) net %.3f | cont %.3f net %.3f" % (
                          cell["fade"]["forecast"]["est"], cell["fade"]["placebo"]["est"], cell["fade_net"]["forecast"]["est"],
                          cell["cont"]["forecast"]["est"], cell["cont_net"]["forecast"]["est"]), flush=True)
    (OUT / "results.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
