"""reversal-zones (forge/REVERSAL_ZONES_PREREG.md): after a ladder line is touched, how far past it does price run
before the first real reversal, and does a reversal come before extension more often than at offset copies?

    python scripts/reversal-zones/score.py     -> analysis/output/reversal-zones/{results.json, report.txt, zones_*.csv}
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts/ladder-v2"))
sys.path.insert(0, str(ROOT / "scripts/exhaustion-v2"))
import ladder as L  # noqa: E402
import touches as TT  # noqa: E402
from forge.data_screens import input_hashes  # noqa: E402

OUT = ROOT / "analysis/output/reversal-zones"
SEED, B, BLOCK = 20261119, 2000, 63
SYMS = ("NQ", "GOLD", "EURUSD")
RS = (0.25, 0.50)
POS = (0.0, 0.15, -0.15, 0.30, -0.30)                 # 0 = the real line; others = local placebo copies (sigma units)
RW_SUBSTEPS = 30
BUCKETS = ("00-07", "07-12", "12-16", "16-22")
LOG: list[str] = []


def say(s=""):
    sys.stdout.reconfigure(encoding="utf-8")
    print(s, flush=True)
    LOG.append(s)


def line_specs(row, arm):
    """(family, rung, side, pct of open, extension pct of open) for EXT and CLOSE lines."""
    g = lambda q, t: float(row[f"{arm}_{q}_{t}"]) / 100
    sig = float(row[arm]) / 100
    out = []
    for side, q in (("up", "oh"), ("dn", "ol")):
        for t, nx in ((50, 75), (75, 90), (90, None)):
            out.append(("EXT", t, side, g(q, t), (g(q, nx) - g(q, t)) if nx else 0.25 * sig))
    for side in ("up", "dn"):
        for t, nx in ((50, 75), (75, None)):
            out.append(("CLOSE", t, side, g("oc", t), (g("oc", nx) - g("oc", t)) if nx else 0.25 * sig))
    return out


def walk(hi, lo, cl, up, Lv, E, Rs):
    """One touch. Returns None if never touched, else (t, {R: (race, overshoot_abs, censored)}, close_inside, recross)."""
    hit = np.flatnonzero(hi >= Lv) if up else np.flatnonzero(lo <= Lv)
    if not len(hit):
        return None
    t = int(hit[0])
    if up:
        sh, sl = hi[t:], lo[t:]
        prev_ext = np.maximum.accumulate(np.r_[Lv, sh])[:-1]          # extreme of EARLIER post-touch bars (or the line)
        ext = sh >= Lv + E
        adverse = lambda R: sl <= prev_ext - R
        run_end = sh.max() - Lv
        close_inside = cl[-1] < Lv
        recross = bool((sl[1:] < Lv).any())
    else:
        sh, sl = lo[t:], hi[t:]
        prev_ext = np.minimum.accumulate(np.r_[Lv, sh])[:-1]
        ext = sh <= Lv - E
        adverse = lambda R: sl >= prev_ext + R
        run_end = Lv - sh.min()
        close_inside = cl[-1] > Lv
        recross = bool((sl[1:] > Lv).any())
    ie = int(np.argmax(ext)) if ext.any() else None
    res = {}
    for R in Rs:
        rv = adverse(R); rv[0] = False                                  # touch-bar reversal: intrabar order unknown
        ir = int(np.argmax(rv)) if rv.any() else None
        if ir is not None:
            over = (prev_ext[ir] - Lv) if up else (Lv - prev_ext[ir]); cens = False
        else:
            over, cens = run_end, True
        if ie is None and ir is None:
            race = "none"
        elif ir is None or (ie is not None and ie < ir):
            race = "ext"
        elif ie is None or ir < ie:
            race = "rev"
        else:
            race = "amb"
        res[R] = (race, float(over), cens)
    return t, res, bool(close_inside), recross


def bucket_of(minute):
    return int(np.searchsorted([420, 720, 960], minute, side="right"))


def session_rows(sym, date, year, row, arm, o, hi, lo, cl, mins, positions=POS, kind="real"):
    sp = float(row[arm]) / 100 * o
    out = []
    for fam, rung, side, pct, epct in line_specs(row, arm):
        up = side == "up"
        for pos in positions:
            Lv = o * (1 + pct) + pos * sp if up else o * (1 - pct) - pos * sp
            w = walk(hi, lo, cl, up, Lv, epct * o, [R * sp for R in RS])
            if w is None:
                continue
            t, res, ci, rc = w
            rec = {"sym": sym, "date": date, "year": year, "kind": kind, "fam": fam, "rung": rung, "side": side,
                   "pos": pos, "bucket": bucket_of(mins[t]), "close_inside": ci, "recross": rc}
            for R, (race, over, cens) in zip(RS, res.values()):     # res is keyed by the absolute size
                rec[f"race_{R}"] = race
                rec[f"over_sig_{R}"] = over / sp
                rec[f"over_pct_{R}"] = over / o * 100
                rec[f"cens_{R}"] = cens
            out.append(rec)
    return out


def real_rows(sym, track="C"):
    arm = TT.line_arm(sym, track)
    T = pd.read_parquet(ROOT / f"analysis/output/ladder-v2-{sym.lower()}/test_{track}.parquet")
    S = TT.session_frames(L.load_m1(sym, track, "unadj"), T["date"])
    rows = []
    for _, row in T.iterrows():
        g = S.get(row["date"])
        if g is None or len(g) < 600:
            continue
        lt = g.index.tz_convert("Europe/London")
        rows += session_rows(sym, row["date"], int(row["year"]), row, arm, float(g["open"].iloc[0]),
                             g["high"].to_numpy(), g["low"].to_numpy(), g["close"].to_numpy(),
                             np.asarray(lt.hour * 60 + lt.minute))
    return pd.DataFrame(rows), T, arm


def rw_rows(sym, T, arm, rng):
    """Random-walk baseline: each real session replayed as a driftless Brownian path with that session's sigma and
    lines, on the instrument's vol clock (2022 column), RW_SUBSTEPS per minute."""
    clk = pd.read_parquet(ROOT / f"analysis/output/exhaustion-v2-{sym.lower()}/clock_C.parquet")
    c = (clk[2022] if 2022 in clk.columns else clk["2022"]).to_numpy()[:264]
    per_min = np.repeat(c / 5, 5)
    mins = np.arange(1320)
    rows = []
    for _, row in T.iterrows():
        sig = float(row[arm]) / 100
        inc = rng.standard_normal((1320, RW_SUBSTEPS)) * np.sqrt(per_min[:, None] / RW_SUBSTEPS) * sig
        path = np.cumsum(inc.ravel()).reshape(1320, RW_SUBSTEPS)
        start = np.r_[0.0, path[:-1, -1]]
        hi = 100 * np.exp(np.maximum(start, path.max(1))); lo = 100 * np.exp(np.minimum(start, path.min(1)))
        cl = 100 * np.exp(path[:, -1])
        rows += session_rows(sym, row["date"], int(row["year"]), row, arm, 100.0, hi, lo, cl, mins, positions=(0.0,), kind="rw")
    return pd.DataFrame(rows)


# ---------------------------------------------------------------- statistics
def blocks_idx(n, rng):
    nb = int(np.ceil(n / BLOCK))
    st = rng.integers(0, max(n - BLOCK, 1), size=(B, nb))
    return (st[:, :, None] + np.arange(BLOCK)[None, None, :]).reshape(B, -1)[:, :n]


def race_excess(X, fam, R, rng):
    """Reversal-first share at real lines minus at placebo copies, pooled; session blocks within instrument."""
    parts = []
    for sym, g in X[X["fam"] == fam].groupby("sym"):
        g = g[g[f"race_{R}"].isin(["rev", "ext"])]
        real, plc = g[g["pos"] == 0], g[g["pos"] != 0]
        dates = sorted(set(g["date"]))
        ix = {d: i for i, d in enumerate(dates)}
        arr = np.zeros((len(dates), 4))
        for k, (h, col) in enumerate(((real, "rev"), (real, None), (plc, "rev"), (plc, None))):
            s = h.groupby("date")[f"race_{R}"].apply(lambda x: (x == "rev").sum() if col else len(x))
            arr[[ix[d] for d in s.index], k] = s.to_numpy()
        parts.append(arr)
    tot = sum(p.sum(0) for p in parts)
    pt = (tot[0] / tot[1] - tot[2] / tot[3]) * 100
    acc = np.zeros((B, 4))
    for p in parts:
        BI = blocks_idx(len(p), rng)
        acc += p[BI].sum(1)
    d = (acc[:, 0] / acc[:, 1] - acc[:, 2] / acc[:, 3]) * 100
    return float(pt), [float(np.quantile(d, .05)), float(np.quantile(d, .95))], float(np.mean(d <= 0)), \
        float(tot[0] / tot[1] * 100), float(tot[2] / tot[3] * 100)


def overshoot_diff(X, fam, R, rng):
    """Median overshoot (sigma) at real lines minus at placebo copies (negative = real lines turn sooner)."""
    col = f"over_sig_{R}"
    per = []
    for sym, g in X[X["fam"] == fam].groupby("sym"):
        dates = sorted(set(g["date"]))
        real = [np.array(v) for v in g[g["pos"] == 0].groupby("date")[col].apply(list).reindex(dates).apply(lambda x: x if isinstance(x, list) else [])]
        plc = [np.array(v) for v in g[g["pos"] != 0].groupby("date")[col].apply(list).reindex(dates).apply(lambda x: x if isinstance(x, list) else [])]
        per.append((real, plc))
    allr = np.concatenate([np.concatenate(r) for r, _ in per]); allp = np.concatenate([np.concatenate(p) for _, p in per])
    pt = float(np.median(allr) - np.median(allp))
    d = np.empty(B)
    BIs = [blocks_idx(len(r), rng) for r, _ in per]
    for b in range(B):
        rr = np.concatenate([np.concatenate([r[i] for i in BI[b]]) for (r, _), BI in zip(per, BIs)])
        pp = np.concatenate([np.concatenate([p[i] for i in BI[b]]) for (_, p), BI in zip(per, BIs)])
        d[b] = np.median(rr) - np.median(pp)
    return pt, [float(np.quantile(d, .05)), float(np.quantile(d, .95))], float(np.mean(d >= 0)), \
        float(np.median(allr)), float(np.median(allp))


def bh(p, q=0.10):
    p = np.asarray(p); o = np.argsort(p); m = len(p)
    ok = p[o] <= q * np.arange(1, m + 1) / m
    k = np.max(np.where(ok)[0]) + 1 if ok.any() else 0
    r = np.zeros(m, bool); r[o[:k]] = True
    return r


def zone_table(Xr, Xw):
    rows = []
    for (sym, fam, rung, side, b), g in Xr[Xr["pos"] == 0].groupby(["sym", "fam", "rung", "side", "bucket"]):
        w = Xw[(Xw["sym"] == sym) & (Xw["fam"] == fam) & (Xw["rung"] == rung) & (Xw["side"] == side) & (Xw["bucket"] == b)]
        rec = {"sym": sym, "line": f"{'OH' if (fam == 'EXT' and side == 'up') else 'OL' if fam == 'EXT' else 'Close' + ('+' if side == 'up' else '-')} p{rung}",
               "time": BUCKETS[b], "n": len(g)}
        for R in RS:
            rr = g[f"race_{R}"]; dec = rr.isin(["rev", "ext"]).sum()
            rec[f"overshoot_p25_sig_R{R}"] = g[f"over_sig_{R}"].quantile(.25)
            rec[f"overshoot_p50_sig_R{R}"] = g[f"over_sig_{R}"].median()
            rec[f"overshoot_p75_sig_R{R}"] = g[f"over_sig_{R}"].quantile(.75)
            rec[f"overshoot_p50_pct_R{R}"] = g[f"over_pct_{R}"].median()
            rec[f"rev_first_R{R}"] = (rr == "rev").sum() / dec * 100 if dec else np.nan
            if len(w):
                ww = w[f"race_{R}"]; dw = ww.isin(["rev", "ext"]).sum()
                rec[f"rw_overshoot_p50_sig_R{R}"] = w[f"over_sig_{R}"].median()
                rec[f"rw_rev_first_R{R}"] = (ww == "rev").sum() / dw * 100 if dw else np.nan
        rec["close_back_inside"] = g["close_inside"].mean() * 100
        rec["trades_back_through"] = g["recross"].mean() * 100
        if len(w):
            rec["rw_close_back_inside"] = w["close_inside"].mean() * 100
        rows.append(rec)
    return pd.DataFrame(rows)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    import os
    if os.environ.get("REUSE_WALKS") and (OUT / "touch_walks.parquet").exists():
        # statistics-only re-run on the walks saved by a full run (same code, same seed for the bootstrap)
        X = pd.read_parquet(OUT / "touch_walks.parquet"); W = pd.read_parquet(OUT / "rw_walks.parquet")
        say(f"walks reused from the saved full run: real+placebo {len(X)}, random-walk {len(W)}")
    else:
        R_all, W_all = [], []
        for sym in SYMS:
            X, T, arm = real_rows(sym)
            W = rw_rows(sym, T, arm, rng)
            say(f"{sym}: arm {arm}; real touches {int((X['pos'] == 0).sum())}, placebo {int((X['pos'] != 0).sum())}, random-walk {len(W)}")
            R_all.append(X); W_all.append(W)
        X = pd.concat(R_all, ignore_index=True); W = pd.concat(W_all, ignore_index=True)
        X.to_parquet(OUT / "touch_walks.parquet"); W.to_parquet(OUT / "rw_walks.parquet")
    for R in RS:
        say(f"  ambiguous same-bar races R={R}: {(X[f'race_{R}'] == 'amb').mean() * 100:.1f}% of touches")
    res = {"seed": SEED, "B": B, "tests": {}}
    tests, pv = [], []
    say("\n== H1 race: reversal of R before extension E, real lines vs mean of 4 offset copies (pooled CFD)")
    for fam in ("EXT", "CLOSE"):
        for R in RS:
            pt, ci, p, sr, spl = race_excess(X, fam, R, rng)
            halves = {}
            for h, (a, b) in {"2018-22": (2018, 2022), "2023-26": (2023, 2026)}.items():
                Xh = X[(X["year"] >= a) & (X["year"] <= b)]
                e, c, *_ = race_excess(Xh, fam, R, rng)
                halves[h] = {"excess": e, "ci90": c}
            tests.append(("H1", fam, R, pt, ci, halves, sr, spl)); pv.append(p)
    say("== H2 overshoot: median overshoot before the first reversal, real minus placebo (sigma; negative = turns sooner)")
    for fam in ("EXT", "CLOSE"):
        for R in RS:
            pt, ci, p, mr, mp = overshoot_diff(X, fam, R, rng)
            halves = {}
            for h, (a, b) in {"2018-22": (2018, 2022), "2023-26": (2023, 2026)}.items():
                Xh = X[(X["year"] >= a) & (X["year"] <= b)]
                e, c, *_ = overshoot_diff(Xh, fam, R, rng)
                halves[h] = {"diff": e, "ci90": c}
            tests.append(("H2", fam, R, pt, ci, halves, mr, mp)); pv.append(p)
    rej = np.r_[bh(pv[:4]), bh(pv[4:])]
    for (h, fam, R, pt, ci, halves, a, b), r in zip(tests, rej):
        if h == "H1":
            ok = r and ci[0] > 0 and all(v["ci90"][0] > 0 for v in halves.values())
            verdict = "VALIDATED" if ok else ("NULL" if ci[1] < 2.0 else "UNDERPOWERED")
            say(f"  H1 {fam:5} R={R}: reversal-first {a:5.1f}% real vs {b:5.1f}% offsets, excess {pt:+.2f}pp [{ci[0]:+.2f},{ci[1]:+.2f}]"
                f" halves " + " ".join(f"[{v['ci90'][0]:+.2f},{v['ci90'][1]:+.2f}]" for v in halves.values()) + f" BH {'pass' if r else 'no'} -> {verdict}")
        else:
            ok = r and ci[1] < 0 and all(v["ci90"][1] < 0 for v in halves.values())
            verdict = "VALIDATED" if ok else ("NULL" if ci[0] > -0.05 else "UNDERPOWERED")
            say(f"  H2 {fam:5} R={R}: median overshoot {a:.3f}σ real vs {b:.3f}σ offsets, diff {pt:+.3f}σ [{ci[0]:+.3f},{ci[1]:+.3f}]"
                f" halves " + " ".join(f"[{v['ci90'][0]:+.3f},{v['ci90'][1]:+.3f}]" for v in halves.values()) + f" BH {'pass' if r else 'no'} -> {verdict}")
        res["tests"][f"{h}/{fam}/R{R}"] = {"point": pt, "ci90": ci, "halves": halves, "real": a, "placebo": b,
                                           "bh_pass": bool(r), "verdict": verdict}
    Z = zone_table(X, W)
    Z.to_csv(OUT / "zones.csv", index=False)
    say("\n== Zone tables (real lines; R = 0.25σ reversal; random walk beside)")
    for sym in SYMS:
        say(f"-- {sym}")
        z = Z[(Z["sym"] == sym) & Z["line"].str.startswith(("OH", "OL"))]
        for _, r in z.iterrows():
            say(f"  {r['line']:7} {r['time']}  n={r['n']:5}  overshoot before 0.25σ pullback p25/p50/p75 "
                f"{r['overshoot_p25_sig_R0.25']:.2f}/{r['overshoot_p50_sig_R0.25']:.2f}/{r['overshoot_p75_sig_R0.25']:.2f}σ "
                f"(p50 {r['overshoot_p50_pct_R0.25']:.3f}%; RW p50 {r.get('rw_overshoot_p50_sig_R0.25', np.nan):.2f}σ) | "
                f"pullback first {r['rev_first_R0.25']:.0f}% (RW {r.get('rw_rev_first_R0.25', np.nan):.0f}%) | "
                f"0.5σ first {r['rev_first_R0.5']:.0f}% (RW {r.get('rw_rev_first_R0.5', np.nan):.0f}%) | "
                f"closes back inside {r['close_back_inside']:.0f}% (RW {r.get('rw_close_back_inside', np.nan):.0f}%)")
    res["input_sha256"] = input_hashes([f"analysis/output/ladder-v2-{s.lower()}/test_C.parquet" for s in SYMS])
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=str))
    (OUT / "report.txt").write_text("\n".join(LOG) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
