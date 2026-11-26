"""jordan-level-history-select: walk-forward per-level selection (prereg forge/JORDAN_LEVEL_HISTORY_SELECT_PREREG.md).

For each instrument x Jordan line (cup/cdn/hlH/hlL) x tier x touch bucket, history = touches in years < Y.
Pick fade or follow by the larger history mean net R; trade it in Y if n >= NMIN, mean > 0 and t > TMIN.
Same rule on placebo events = placebo engine. Futures net (primary), CFDs gross (replication).
"""
import glob, json, os
import numpy as np, pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EV = os.path.join(ROOT, "analysis/output/level-context-engine/events")
OUT = os.path.join(ROOT, "analysis/output/jordan-level-history-select")
os.makedirs(OUT, exist_ok=True)
SEED, B = 20261126, 1000
YEARS = [2022, 2023, 2024, 2025, 2026]
LINES = ["cup", "cdn", "hlH", "hlL"]
COLS = ["sym", "date", "kind", "line", "tier", "touch_n", "R_fade", "R_cont", "cost_R", "mae60", "sig_px", "tick"]
JUNIT = {"NQ": 0.25, "GOLD": 0.10, "EURUSD": 0.0001, "USDJPY": 0.01}
JORDAN_MED = {"NQ": 114.0, "GOLD": 33.8, "EURUSD": 12.2, "USDJPY": 12.0}


def load(track):
    fs = sorted(glob.glob(os.path.join(EV, f"{track}_*.parquet")))
    d = pd.concat([pd.read_parquet(f, columns=COLS) for f in fs], ignore_index=True)
    d = d[d.line.isin(LINES) & (d.date <= "2026-08-21")].copy()
    d["year"] = d.date.dt.year
    d["tb"] = np.where(d.touch_n == 1, "t1", "t2+")
    c = d.cost_R.astype(float) if track == "F" else 0.0
    d["nf"] = d.R_fade.astype(float) - c
    d["nc"] = d.R_cont.astype(float) - c
    return d


def select(d, nmin=50, tmin=1.0, window=None, bucket=True):
    key = ["sym", "line", "tier"] + (["tb"] if bucket else [])
    picks, trades = [], []
    for Y in YEARS:
        h = d[(d.year < Y) & ((d.year >= Y - window) if window else True)]
        g = h.groupby(key).agg(n=("nf", "size"), mf=("nf", "mean"), sf=("nf", "std"), mc=("nc", "mean"), sc=("nc", "std")).reset_index()
        g["side"] = np.where(g.mf >= g.mc, "fade", "follow")
        g["m"] = np.where(g.side == "fade", g.mf, g.mc)
        g["s"] = np.where(g.side == "fade", g.sf, g.sc)
        g["t"] = g.m / (g.s / np.sqrt(g.n))
        g = g[(g.n >= nmin) & (g.m > 0) & (g.t > tmin)].assign(year=Y)
        picks.append(g)
        if len(g):
            t = d[d.year == Y].merge(g[key + ["side"]], on=key)
            t["R"] = np.where(t.side == "fade", t.nf, t.nc)
            trades.append(t)
    P = pd.concat(picks, ignore_index=True)
    T = pd.concat(trades, ignore_index=True) if trades else pd.DataFrame(columns=list(d.columns) + ["side", "R"])
    return P, T


def boot_mean(T, rng):
    if len(T) == 0:
        return np.nan, np.nan, np.nan
    g = T.groupby("date").R.agg(["sum", "size"])
    s, n = g["sum"].values, g["size"].values
    idx = rng.integers(0, len(g), (B, len(g)))
    bs = s[idx].sum(1) / n[idx].sum(1)
    return s.sum() / n.sum(), *np.percentile(bs, [5, 95])


def boot_diff(TL, TP, rng):
    if len(TL) == 0 or len(TP) == 0:
        return np.nan, np.nan, np.nan
    a = TL.groupby("date").R.agg(["sum", "size"]).add_prefix("l_")
    b = TP.groupby("date").R.agg(["sum", "size"]).add_prefix("p_")
    g = a.join(b, how="outer").fillna(0)
    ls, ln, ps, pn = (g[c].values for c in ["l_sum", "l_size", "p_sum", "p_size"])
    idx = rng.integers(0, len(g), (B, len(g)))
    bs = ls[idx].sum(1) / ln[idx].sum(1) - ps[idx].sum(1) / pn[idx].sum(1)
    return ls.sum() / ln.sum() - ps.sum() / pn.sum(), *np.percentile(bs, [5, 95])


def verdict(est, lo, hi, halves_agree, bh_pass):
    if lo > 0 and halves_agree and bh_pass:
        return "VALIDATED"
    if hi < 0.02:
        return "NULL"
    return "UNDERPOWERED"


def bh(ps, q=0.10):
    ps = np.asarray(ps); o = np.argsort(ps); m = len(ps)
    ok = ps[o] <= q * (np.arange(1, m + 1) / m)
    k = np.max(np.where(ok)[0]) + 1 if ok.any() else 0
    res = np.zeros(m, bool); res[o[:k]] = True
    return res


def boot_p(T, rng, diff_with=None):
    # one-sided bootstrap p for > 0
    if diff_with is None:
        g = T.groupby("date").R.agg(["sum", "size"]); s, n = g["sum"].values, g["size"].values
        idx = rng.integers(0, len(g), (B, len(g))); bs = s[idx].sum(1) / n[idx].sum(1)
    else:
        a = T.groupby("date").R.agg(["sum", "size"]).add_prefix("l_")
        b = diff_with.groupby("date").R.agg(["sum", "size"]).add_prefix("p_")
        g = a.join(b, how="outer").fillna(0)
        ls, ln, ps, pn = (g[c].values for c in ["l_sum", "l_size", "p_sum", "p_size"])
        idx = rng.integers(0, len(g), (B, len(g)))
        bs = ls[idx].sum(1) / ln[idx].sum(1) - ps[idx].sum(1) / pn[idx].sum(1)
    return (np.sum(bs <= 0) + 1) / (B + 1)


def run_track(track, rng, gate=True):
    d = load(track)
    L, Pl = d[d.kind == "line"], d[d.kind == "placebo"]
    PL, TL = select(L)
    PP, TP = select(Pl)
    res = {"track": track, "touches_line_tradeyears": int((L.year >= 2022).sum()),
           "cells_selected_line": int(len(PL)), "cells_selected_placebo": int(len(PP)),
           "trades_line": int(len(TL)), "trades_placebo": int(len(TP))}
    s1 = boot_mean(TL, rng); s1p = boot_mean(TP, rng); s2 = boot_diff(TL, TP, rng)
    res["S1"] = s1; res["placebo_engine"] = s1p; res["S2"] = s2
    for nm, yrs in [("h1", [2022, 2023]), ("h2", [2024, 2025, 2026])]:
        a = TL[TL.year.isin(yrs)]; b = TP[TP.year.isin(yrs)]
        res[f"S1_{nm}"] = a.R.mean() if len(a) else np.nan
        res[f"S2_{nm}"] = (a.R.mean() - b.R.mean()) if len(a) and len(b) else np.nan
    res["S1_p"] = boot_p(TL, rng) if len(TL) else 1.0
    res["S2_p"] = boot_p(TL, rng, TP) if len(TL) and len(TP) else 1.0
    # all-touch baselines (every touch, the better side fixed in hindsight is NOT used; just fade and follow)
    T = L[L.year >= 2022]
    res["all_fade"] = float(T.nf.mean()); res["all_follow"] = float(T.nc.mean())
    res["gross_selected"] = float((np.where(TL.side == "fade", TL.R_fade, TL.R_cont)).mean()) if len(TL) else np.nan
    return d, L, Pl, PL, TL, PP, TP, res


def main():
    rng = np.random.default_rng(SEED)
    out = {"seed": SEED, "B": B}
    tables = []
    for track in ["F", "C"]:
        d, L, Pl, PL, TL, PP, TP, r = run_track(track, rng)
        out[track] = r
        PL.to_csv(os.path.join(OUT, f"selected_cells_{track}.csv"), index=False)
        # per-year
        py = TL.groupby("year").R.agg(["size", "mean"]).join(TP.groupby("year").R.agg(["size", "mean"]), rsuffix="_pl")
        py.to_csv(os.path.join(OUT, f"by_year_{track}.csv"))
        # per-instrument
        pi = TL.groupby("sym").R.agg(["size", "mean"]).join(TP.groupby("sym").R.agg(["size", "mean"]), rsuffix="_pl")
        pi.to_csv(os.path.join(OUT, f"by_instrument_{track}.csv"))
        # side / tier / line mix
        mix = TL.groupby(["side", "line", "tier"]).R.agg(["size", "mean"]).reset_index()
        mix.to_csv(os.path.join(OUT, f"mix_{track}.csv"), index=False)
        # persistence: chosen side same as previous year's choice for the same cell
        key = ["sym", "line", "tier", "tb"]
        allp = []
        for Y in YEARS:
            h = L[L.year < Y].groupby(key).agg(mf=("nf", "mean"), mc=("nc", "mean")).reset_index()
            h["side"] = np.where(h.mf >= h.mc, "fade", "follow"); h["year"] = Y; allp.append(h)
            # realised better side in Y
        A = pd.concat(allp)
        R = L[L.year >= 2022].groupby(key + ["year"]).agg(rf=("nf", "mean"), rc=("nc", "mean"), n=("nf", "size")).reset_index()
        R["real_side"] = np.where(R.rf >= R.rc, "fade", "follow")
        M = A.merge(R, on=key + ["year"])
        M = M[M.n >= 30]
        out[track]["side_hit_rate_all_cells"] = float((M.side == M.real_side).mean())
        Ms = M.merge(PL[key + ["year"]], on=key + ["year"])
        out[track]["side_hit_rate_selected_cells"] = float((Ms.side == Ms.real_side).mean()) if len(Ms) else np.nan
        # variants (descriptive)
        var = []
        for nm, kw in [("primary", {}), ("rolling2y", {"window": 2}), ("t>0", {"tmin": 0.0}), ("t>2", {"tmin": 2.0}),
                       ("nmin30", {"nmin": 30}), ("nmin100", {"nmin": 100}), ("no_bucket", {"bucket": False})]:
            _, a = select(L, **kw); _, b = select(Pl, **kw)
            e = boot_mean(a, rng); f = boot_diff(a, b, rng)
            var.append({"variant": nm, "trades": len(a), "R": e[0], "lo": e[1], "hi": e[2],
                        "placebo_trades": len(b), "placebo_R": b.R.mean() if len(b) else np.nan,
                        "line_minus_placebo": f[0], "d_lo": f[1], "d_hi": f[2]})
        pd.DataFrame(var).to_csv(os.path.join(OUT, f"variants_{track}.csv"), index=False)
        out[track]["variants"] = var
        if track == "F":
            mrows = []
            for s, u in JUNIT.items():
                a = L[(L.sym == s) & (L.year >= 2022)]; b = TL[TL.sym == s]
                fa = (a.mae60 * a.sig_px / u); fb = (b.mae60 * b.sig_px / u)
                mrows.append({"sym": s, "unit": "ticks" if s in ("NQ", "GOLD") else "pips",
                              "all_touches_mae60_med": fa.median(), "selected_mae60_med": fb.median() if len(b) else np.nan,
                              "selected_n": len(b), "jordan_med": JORDAN_MED[s],
                              "all_mae60_sigma": a.mae60.median(), "sel_mae60_sigma": b.mae60.median() if len(b) else np.nan})
            pd.DataFrame(mrows).to_csv(os.path.join(OUT, "mae_selected_vs_all.csv"), index=False)
            out["F"]["mae"] = mrows
    # gates (futures)
    F = out["F"]
    passes = bh([F["S1_p"], F["S2_p"]])
    for i, k in enumerate(["S1", "S2"]):
        est, lo, hi = F[k]
        agree = np.sign(F[f"{k}_h1"]) == np.sign(F[f"{k}_h2"]) and np.sign(F[f"{k}_h1"]) > 0
        F[f"{k}_verdict"] = verdict(est, lo, hi, bool(agree), bool(passes[i]))
        F[f"{k}_bh"] = bool(passes[i])
    with open(os.path.join(OUT, "results.json"), "w") as f:
        json.dump(out, f, indent=1, default=lambda x: float(x) if isinstance(x, (np.floating, np.integer)) else (list(x) if isinstance(x, tuple) else str(x)))
    for t in ["F", "C"]:
        r = out[t]
        print(f"== {t}: touches {r['touches_line_tradeyears']}, cells sel line {r['cells_selected_line']} / placebo {r['cells_selected_placebo']}, trades {r['trades_line']} / {r['trades_placebo']}")
        print("  S1", np.round(r["S1"], 4), "halves", round(r["S1_h1"], 4), round(r["S1_h2"], 4))
        print("  placebo engine", np.round(r["placebo_engine"], 4))
        print("  S2", np.round(r["S2"], 4), "halves", round(r["S2_h1"], 4), round(r["S2_h2"], 4))
        print("  all fade", round(r["all_fade"], 4), "all follow", round(r["all_follow"], 4), "gross selected", r["gross_selected"])
        print("  side hit all", r["side_hit_rate_all_cells"], "selected", r["side_hit_rate_selected_cells"])
        if t == "F":
            print("  verdicts", r["S1_verdict"], r["S2_verdict"], "p", r["S1_p"], r["S2_p"])
        print(pd.DataFrame(r["variants"]).round(4).to_string())
    print(pd.DataFrame(out["F"]["mae"]).round(3).to_string())


if __name__ == "__main__":
    main()
