"""ladder-exhaustion-events (forge/LADDER_EXHAUSTION_EVENTS_PREREG.md, pushed 925f2aaf).

    python scripts/ladder-exhaustion-events/race.py  -> analysis/output/ladder-exhaustion-events/

H1: per-line walk-forward pick by exhaustion score (pinball of p50/p75/p90 levels) vs by QLIKE, scored on pinball.
H2: per-line event-day widths (events.py buckets) on top of the QLIKE pick, vs none, with a shifted-calendar placebo.
40 OANDA CFDs, lines HL, OH, OL, Close+, Close-. Seed 20261124, date-aligned 63-session blocks, B = 2000.
"""
from __future__ import annotations

import importlib.util
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
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts/ladder-v2"))
sys.path.insert(0, str(HERE))
import ladder as L  # noqa: E402
import events as EV  # noqa: E402

_spec = importlib.util.spec_from_file_location("cfd_race", ROOT / "scripts/ladder-qlike-per-line-cfd/race.py")
RC = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(RC)

SEED, B, BLOCK = 20261124, 2000, 63
OUT = ROOT / "analysis/output/ladder-exhaustion-events"
PRIOR = ROOT / "analysis/output/ladder-qlike-per-line-cfd/results.json"
LINES = ("hl", "oh", "ol", "cup", "cdn")
TAUS = (0.50, 0.75, 0.90)
SHRINK = 40
PLACEBO_SHIFT = 5
HALVES = {"2020-22": (2020, 2022), "2023-26": (2023, 2026)}
INDICES = {"NQ", "SPX500", "US30", "US2000", "DE30", "UK100"}
BUCKETS = [b for b in EV.BUCKETS]
_E = None


def klass(sym):
    if sym in INDICES:
        return "index"
    return "fx" if len(sym) == 6 and sym[:3] in EV.CORE_CCY | EV.OTHER_CCY else "metal/energy"


def pinball(x, lv):
    """Mean pinball over the three taus; lv is (n, 3)."""
    out = np.zeros(len(x))
    for j, t in enumerate(TAUS):
        u = x - lv[:, j]
        out += np.where(u >= 0, t * u, (t - 1) * u)
    return out / len(TAUS)


def wf_k(yrs, r, train_ok, Y):
    tr = (yrs >= 2018) & (yrs < Y) & train_ok & np.isfinite(r) & (r > 0)
    if tr.sum() <= 50:
        return None, tr
    return np.quantile(r[tr], TAUS), tr


def pb_series(T, sig, q, mask):
    """Walk-forward pinball of an arm on line q (base widths, all train sessions)."""
    yrs, x = T["year"].to_numpy(), T[q].to_numpy()
    r = x / sig
    out = np.full(len(T), np.nan)
    for Y in range(2019, 2027):
        k, _ = wf_k(yrs, r, mask, Y)
        te = (yrs == Y) & mask & np.isfinite(sig) & (sig > 0)
        if k is not None and te.any():
            out[te] = pinball(x[te], np.outer(sig[te], k))
    return out


def layered(T, sel, q, mask, tag, known):
    """Pinball with and without the bucket layer for the per-year picked arm; returns (base, layer, levels, k_by_year)."""
    yrs, x = T["year"].to_numpy(), T[q].to_numpy()
    base, lay = np.full(len(T), np.nan), np.full(len(T), np.nan)
    lv_l = np.full((len(T), 3), np.nan)
    for Y in range(2020, 2027):
        te = (yrs == Y) & mask
        if not te.any():
            continue
        arm = sel[te][0]
        if arm is None:
            continue
        sig = T[arm].to_numpy(float)
        r = x / sig
        k, tr = wf_k(yrs, r, mask, Y)
        if k is None:
            continue
        te &= np.isfinite(sig) & (sig > 0)
        base[te] = pinball(x[te], np.outer(sig[te], k))
        kb = {}
        trk = tr & known
        for b in BUCKETS:
            m = trk & (tag == b)
            n = int(m.sum())
            kb[b] = k if n == 0 else (n * np.quantile(r[m], TAUS) + SHRINK * k) / (n + SHRINK)
        tek = te & known
        K = np.array([kb.get(b, k) for b in tag[tek]])
        lv = sig[tek][:, None] * K
        lv_l[tek] = lv
        lay[tek] = pinball(x[tek], lv)
    return base, lay, lv_l


def run(sym):
    global _E
    if _E is None:
        _E = EV.load_events()
    os.environ["LADDER_OUT"] = RC.bdir(sym)
    L.TAUS = (50, 75, 90)
    S = pd.read_parquet(ROOT / os.environ["LADDER_OUT"] / "rows_C.parquet")
    S["rel"] = S["A0"] / S["A0"].rolling(250, min_periods=60).median().shift(1)
    arms = list(L.arms_for(sym))
    T = L.walk_forward(S, sym, "C", arms, quiet=True).sort_values("date").reset_index(drop=True)
    T = T[T["date"] <= L.LOCK].reset_index(drop=True)
    R = RC.realised(sym).reindex(pd.to_datetime(T["date"]))
    c1 = float(np.mean([np.mean(np.abs(R[q].to_numpy() - T[q].to_numpy()) < 1e-6) for q in ("hl", "oh", "ol")]) * 100)
    so = R["soc"].to_numpy()
    T["cup"] = np.where(so > 0, so, np.nan)
    T["cdn"] = np.where(so < 0, -so, np.nan)
    ok = np.ones(len(T), bool)
    for q in ("hl", "oh", "ol"):
        ok &= T[q].to_numpy() > 0
    masks = {"hl": ok, "oh": ok, "ol": ok, "cup": ok & (so > 0), "cdn": ok & (so < 0)}
    yrs = T["year"].to_numpy()
    site = [a for a in arms if a not in RC.NO_SITE]
    tag = EV.tags(sym, T["date"], _E)
    known = tag != "unknown"
    ptag = np.concatenate([np.array(["none"] * PLACEBO_SHIFT, dtype=object), tag[:-PLACEBO_SHIFT]])
    ptag[ptag == "unknown"] = "none"

    prior = json.loads(PRIOR.read_text())["picks"].get(sym, {})
    loss = {"date": T["date"].dt.strftime("%Y-%m-%d").to_numpy(), "tag": tag}
    picks, agree, c3 = {}, [], []
    table, hits = [], []
    for q in LINES:
        m = masks[q]
        Q, P = {}, {}
        for a in site:
            s = T[a].to_numpy(float)
            Q[(a, q)] = RC.qlike(T, RC.h_series(T, s, q, m), q, m)
            P[(a, q)] = pb_series(T, s, q, m)
        sel_ql, pk_ql = RC.wf_pick(T, Q, site, m, q)
        sel_pb, pk_pb = RC.wf_pick(T, P, site, m, q)
        want = prior.get(q, {}).get("wf_site", {})
        c3 += [str(pk_ql[Y]) == str(want.get(str(Y), want.get(Y))) for Y in RC.TEST if want]
        agree += [pk_ql[Y] == pk_pb[Y] for Y in RC.TEST]
        test = m & (yrs >= 2020)
        sc = {a: float(np.nanmean(P[(a, q)][test])) for a in site if np.isnan(P[(a, q)][test]).mean() < 0.02}
        final_pb = min(sc, key=sc.get)
        scq = {a: float(np.nanmean(Q[(a, q)][test])) for a in site if np.isnan(Q[(a, q)][test]).mean() < 0.02}
        final_ql = min(scq, key=scq.get)
        picks[q] = {"wf_pb": pk_pb, "wf_ql": pk_ql, "final_pb": final_pb, "final_ql": final_ql,
                    "pb_final_vs_ql_final": sc[final_pb] / sc[final_ql] - 1}
        pb_v, ql_v = RC.pv(P, sel_pb, q, len(T)), RC.pv(P, sel_ql, q, len(T))
        base, lay, lv = layered(T, sel_ql, q, m, tag, known)
        _, plc, _ = layered(T, sel_ql, q, m, ptag, known)
        base_pb, lay_pb, _ = layered(T, sel_pb, q, m, tag, known)
        for nm, v in [("pb", pb_v), ("ql", ql_v), ("base", base), ("ev", lay), ("plc", plc), ("basepb", base_pb), ("evpb", lay_pb)]:
            loss[f"{nm}_{q}"] = np.where(test, v, np.nan)
        # hit rates of the layered levels by bucket (test, known)
        x = T[q].to_numpy()
        for b in BUCKETS:
            mm = test & known & (tag == b) & np.isfinite(lv[:, 0])
            if mm.sum():
                hits.append(dict(sym=sym, line=q, bucket=b, n=int(mm.sum()),
                                 **{f"over_p{int(t*100)}": float(np.mean(x[mm] > lv[mm, j])) for j, t in enumerate(TAUS)}))
        # owner's table: final fit 2018 -> 2026-08-21 on the final QLIKE site arm, unshrunk bucket width / all-day width
        sig = T[final_ql].to_numpy(float)
        r = x / sig
        okr = m & np.isfinite(r) & (r > 0) & (yrs >= 2018)
        kall = np.quantile(r[okr], TAUS)
        for b in BUCKETS:
            mm = okr & known & (tag == b)
            if mm.sum() >= 5:
                kb = np.quantile(r[mm], TAUS)
                table.append(dict(sym=sym, klass=klass(sym), line=q, bucket=b, n=int(mm.sum()), arm=final_ql,
                                  x50=float(kb[0] / kall[0]), x75=float(kb[1] / kall[1]), x90=float(kb[2] / kall[2]),
                                  mean_ratio=float(np.mean(x[mm]) / np.mean(x[okr]))))
    pd.DataFrame(loss).to_parquet(OUT / f"loss_{sym}.parquet")
    n_unknown = int((tag[yrs >= 2020] == "unknown").sum())
    msg = (f"{sym}: {len(T)} sessions, control1 {c1:.2f}%, control3 QL picks match prior {np.mean(c3)*100 if c3 else float('nan'):.0f}%, "
           f"PB=QL {np.mean(agree)*100:.0f}% of line-years, unknown sessions {n_unknown}; "
           + ", ".join(f"{q} {picks[q]['final_ql']}->{picks[q]['final_pb']}" for q in LINES))
    return dict(sym=sym, c1=c1, c3=float(np.mean(c3)) if c3 else None, agree=float(np.mean(agree)), picks=picks,
                table=table, hits=hits, msg=msg)


def boot(F, a, b, rng, keep_fn=None):
    """Date-aligned block bootstrap of mean over (instrument, line) cells of sum(a)/sum(b) - 1."""
    dates = sorted(set().union(*[set(f.index) for f in F.values()]))
    D = len(dates)
    years = np.array([int(d[:4]) for d in dates])
    cols_a, cols_b = [], []
    for f in F.values():
        g = f.reindex(dates)
        for q in LINES:
            va, vb = g[f"{a}_{q}"].to_numpy(float), g[f"{b}_{q}"].to_numpy(float)
            mk = np.isfinite(va) & np.isfinite(vb)
            if keep_fn is not None:
                mk &= keep_fn(g)
            cols_a.append(np.where(mk, va, 0.0)); cols_b.append(np.where(mk, vb, 0.0))
    A, Bm = np.array(cols_a).T, np.array(cols_b).T
    nb = int(np.ceil(D / BLOCK))
    st = rng.integers(0, max(D - BLOCK, 1), size=(B, nb))
    idx = (st[:, :, None] + np.arange(BLOCK)[None, None, :]).reshape(B, -1)[:, :D]
    C = np.zeros((B, D))
    np.add.at(C, (np.repeat(np.arange(B), idx.shape[1]), idx.ravel()), 1)
    out = {}
    for h, yr in [("all", None)] + list(HALVES.items()):
        keep = np.ones(D, bool) if yr is None else (years >= yr[0]) & (years <= yr[1])
        Ak, Bk = A * keep[:, None], Bm * keep[:, None]
        good = Bk.sum(0) > 0
        pt = float(np.mean(Ak.sum(0)[good] / Bk.sum(0)[good] - 1) * 100)
        num, den = C @ Ak[:, good], C @ Bk[:, good]
        with np.errstate(invalid="ignore", divide="ignore"):
            d = np.nanmean(num / den - 1, axis=1) * 100
        out[h] = [pt, [float(np.nanquantile(d, .05)), float(np.nanquantile(d, .95))]]
    return out


def verdict(r, extra=True):
    if r["all"][1][1] < 0 and all(r[h][1][1] < 0 for h in HALVES) and extra:
        return "VALIDATED"
    return "NULL" if r["all"][1][0] > -0.5 else "UNDERPOWERED"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    S = RC.syms()
    print(f"{len(S)} instruments", flush=True)
    res = []
    with ProcessPoolExecutor(max_workers=4) as ex:
        for r in ex.map(run, S):
            print(r["msg"], flush=True)
            res.append(r)
    ok = [r["sym"] for r in res if r["c1"] >= 99]
    F = {s: pd.read_parquet(OUT / f"loss_{s}.parquet").set_index("date") for s in ok}
    rng = np.random.default_rng(SEED)
    h1 = boot(F, "pb", "ql", rng)
    h2 = boot(F, "ev", "base", rng)
    plc = boot(F, "plc", "base", rng)
    v1 = verdict(h1)
    v2 = verdict(h2, extra=h2["all"][0] < plc["all"][0])
    desc = {"h2_on_pb_pick": boot(F, "evpb", "basepb", rng)}
    for b in BUCKETS:
        desc[f"h2_bucket_{b}"] = boot(F, "ev", "base", rng, keep_fn=lambda g, b=b: (g["tag"] == b).to_numpy())
    per_line = {q: {} for q in LINES}
    for q in LINES:
        for nm, (a, bb) in {"h1": ("pb", "ql"), "h2": ("ev", "base")}.items():
            cells = []
            for f in F.values():
                va, vb = f[f"{a}_{q}"], f[f"{bb}_{q}"]
                mk = va.notna() & vb.notna()
                if mk.any():
                    cells.append(va[mk].sum() / vb[mk].sum() - 1)
            per_line[q][nm] = float(np.mean(cells) * 100)
    def rel(f, a, bb, keep=None):
        v = []
        for q in LINES:
            mk = f[f"{a}_{q}"].notna() & f[f"{bb}_{q}"].notna()   # both sides on the same sessions (unknown excluded)
            if keep is not None:
                mk &= keep
            if mk.any():
                v.append(f.loc[mk, f"{a}_{q}"].sum() / f.loc[mk, f"{bb}_{q}"].sum() - 1)
        return float(np.mean(v) * 100) if v else None

    per_sym = {s: [rel(f, "pb", "ql"), rel(f, "ev", "base"), rel(f, "plc", "base"),
                   rel(f, "ev", "base", f["tag"] == "CB"), rel(f, "ev", "base", f["tag"] == "FOMC")] for s, f in F.items()}
    tab = pd.DataFrame([t for r in res for t in r["table"]])
    tab.to_csv(OUT / "event_widths.csv", index=False)
    pooled = (tab.groupby(["klass", "bucket", "line"])[["x50", "x90", "mean_ratio"]].median().round(3)
              .join(tab.groupby(["klass", "bucket", "line"])["n"].sum()))
    pooled.to_csv(OUT / "event_widths_pooled.csv")
    hits = pd.DataFrame([h for r in res for h in r["hits"]])
    hits.to_csv(OUT / "hit_rates_layered.csv", index=False)
    lines = [f"controls: {len(ok)} pass control 1; control 3 (QL picks = prior export) mean "
             f"{np.nanmean([r['c3'] for r in res if r['c3'] is not None])*100:.1f}%; PB=QL picks on "
             f"{np.mean([r['agree'] for r in res])*100:.1f}% of line-years", "",
             "H1 pinball pick vs QLIKE pick, pinball (% change, negative = pinball pick better)"]
    lines += [f"  {h:8s} {pt:+.2f}% [{ci[0]:+.2f}, {ci[1]:+.2f}]" for h, (pt, ci) in h1.items()]
    lines += [f"  VERDICT H1: {v1}", "", "H2 event layer vs none on the QLIKE pick (known sessions)"]
    lines += [f"  {h:8s} {pt:+.2f}% [{ci[0]:+.2f}, {ci[1]:+.2f}]" for h, (pt, ci) in h2.items()]
    lines += ["  placebo (tags +5 sessions):"] + [f"  {h:8s} {pt:+.2f}% [{ci[0]:+.2f}, {ci[1]:+.2f}]" for h, (pt, ci) in plc.items()]
    lines += [f"  VERDICT H2: {v2}", "", "descriptive:"]
    lines += [f"  {k:22s} " + "  ".join(f"{h} {pt:+.2f}% [{ci[0]:+.2f}, {ci[1]:+.2f}]" for h, (pt, ci) in v.items()) for k, v in desc.items()]
    lines += ["", "per line (mean over instruments): " + "  ".join(f"{q} H1 {v['h1']:+.2f}% H2 {v['h2']:+.2f}%" for q, v in per_line.items())]
    fm = lambda v: "  n/a" if v is None else f"{v:+.1f}"
    lines += ["", "per instrument [H1, H2, placebo, H2 on CB days, H2 on FOMC days]:"]
    lines += [f"  {s:9s} " + " ".join(f"{fm(v):>6s}" for v in vals) for s, vals in sorted(per_sym.items(), key=lambda x: x[1][1])]
    lines += ["", "pooled event widths (median over instruments, p50/p90 width on bucket days / all-day width):", pooled.to_string()]
    lines += ["", "final picks per line (QLIKE -> pinball):"]
    lines += [f"  {r['sym']:9s} " + "  ".join(f"{q}:{r['picks'][q]['final_ql']}->{r['picks'][q]['final_pb']}" for q in LINES) for r in sorted(res, key=lambda r: r["sym"])]
    txt = "\n".join(lines)
    print(txt, flush=True)
    (OUT / "report.txt").write_text("\n".join(r["msg"] for r in res) + "\n\n" + txt, encoding="utf-8")
    (OUT / "results.json").write_text(json.dumps(dict(
        seed=SEED, prereg="forge/LADDER_EXHAUSTION_EVENTS_PREREG.md", verdict_h1=v1, verdict_h2=v2, h1=h1, h2=h2,
        placebo=plc, descriptive=desc, per_line=per_line, per_sym=per_sym, dropped=[r["sym"] for r in res if r["c1"] < 99],
        controls={r["sym"]: [r["c1"], r["c3"], r["agree"]] for r in res},
        picks={r["sym"]: r["picks"] for r in res}), indent=1, default=str))


if __name__ == "__main__":
    if len(sys.argv) > 1:
        OUT.mkdir(parents=True, exist_ok=True)
        for s in sys.argv[1:]:
            print(run(s)["msg"], flush=True)
    else:
        main()
