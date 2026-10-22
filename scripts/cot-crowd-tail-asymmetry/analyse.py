"""cot-crowd-tail-asymmetry: when positioning is crowded, are BIG moves lopsided against the crowd,
and does volatility expand afterwards?

EXPLORATORY, NOT PRE-REGISTERED. Design written here before any outcome was computed. Seed 20261022.

Why: cot-extreme-aftermath / cot-extreme-duration found the AVERAGE move after a crowded reading is
about zero. A zero average can still hide a lopsided tail (rare, large moves against the crowd
offset by many small moves with it): the "squeeze" story. That matters for stops and sizing even
with no directional edge.

Data (imported from scripts/cot-extreme-duration/analyse.py, not copied)
  Weekly panel 2007-06 -> 2026-08-21, 12 markets: COT share-of-OI percentile against the prior up-to-155
  weeks (the page's method), priced at the first close on/after the release Friday (CME futures for FX,
  JPY/CAD/CHF inverted; ICE DXY; GC, SI, NQ, ES, ZN). sigma = std of the prior 52 weekly returns.
  Daily view: daily log returns from prices_daily.csv for trading days in (release Friday, +7 days],
  i.e. the week after the report is public. sigma_daily = RMS of the 60 daily returns ending the
  trading day BEFORE the release Friday (strictly before the release).

Groups (disjoint), s = pct if pct >= 50 else 100 - pct, crowd = +1 if pct >= 50 else -1
  neutral     50 <= s < 70 (any sign of net position)
  stretched   70 <= s < 90, net position on the same side as the percentile
  extreme     s >= 90, net on the same side
  long-held   extreme AND >= 2/3 of the prior 26 weeks at s >= 80 on the same side (subset of extreme)
  trimmed     s >= 70 but the net position has the OPPOSITE sign (e.g. net long at the 10th pct): the
              mirror arm. Direction = sign of the net position. If it shows the same tail pattern as
              extreme, the pattern is not about crowding.
  Reported pooled, ex-10Y and 10Y only (10Y leveraged-fund positioning is mostly the basis trade).

Measures (z = crowd-signed move / (sigma * sqrt(h)); + = the crowd's way)
  a. P(z <= -2) "against", P(z >= +2) "with", ratio against/with; compared with neutral via the ratio of
     ratios. Horizons 1 and 4 weeks, and daily (each day of the following week).
  b. Mean z of the worst 5% (against) and of the best 5% (with); asymmetry = |worst| - |best|.
  c. Skewness of z.
  d. Vol expansion: realised vol over the next 20 trading days after the release Friday (RMS of daily
     returns) / sigma_daily. Compared with neutral (difference).
Stats: 26-week moving-block bootstrap over report dates (all markets on a date move together, the same
draw used for every group so group differences are paired), 1000 reps. Cells and the chance baseline
are counted in RESULTS.md. Concentration for any cell whose CI excludes the null: by market, by era
(2007-12 / 2013-18 / 2019-26), and leave-one-market-out.
"""
import json, os, sys

import numpy as np
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
import importlib.util  # noqa: E402
# loaded under its own name: both scripts are called analyse.py, so a plain import is ambiguous
_spec = importlib.util.spec_from_file_location("cot_extreme_duration", os.path.join(ROOT, "scripts/cot-extreme-duration/analyse.py"))
D = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(D)  # build_panel, per_market_arrays, fwd, LOCKBOX, INVERT

OUT = os.path.join(ROOT, "analysis/output/cot-crowd-tail-asymmetry")
SEED = 20261022
BLOCK, REPS = 26, int(os.environ.get("REPS", 1000))
GROUPS = ["neutral", "stretched", "extreme", "long-held", "trimmed"]
SUBSETS = {"pooled": lambda s: True, "ex-10Y": lambda s: s != "TY", "10Y": lambda s: s == "TY"}
ERAS = [("2007-12", "2007-01-01", "2012-12-31"), ("2013-18", "2013-01-01", "2018-12-31"), ("2019-26", "2019-01-01", "2026-12-31")]


def daily_prices():
    px = pd.read_csv(os.path.join(D.OUT, "prices_daily.csv"), parse_dates=["date"])
    px = px[px.date <= D.LOCKBOX]
    out = {}
    for sym, g in px.groupby("sym"):
        p = g.set_index("date").close.sort_index()
        if sym in D.INVERT:
            p = 1 / p
        out[sym] = np.log(p).diff().dropna()
    return out


def build_rows():
    """One row per (market, report): group, direction, weekly z at 1w/4w, daily z list, vol ratio."""
    panel = D.build_panel()
    arr = D.per_market_arrays(panel)
    dly = daily_prices()
    rows, days = [], []
    for sym, d in arr.items():
        r = dly[sym]
        ridx = r.index.values
        for i in range(len(d)):
            if not d.sig_ok.iat[i]:
                continue
            s, pct, share = d.s.iat[i], d.pct.iat[i], d.share.iat[i]
            side = 1 if pct >= 50 else -1
            agree = np.sign(share) == side
            if s < 70:
                grp, direc = "neutral", side
            elif not agree and share != 0:
                grp, direc = "trimmed", int(np.sign(share))
            elif s < 90:
                grp, direc = "stretched", side
            else:
                grp, direc = "extreme", side
            longheld = grp == "extreme" and np.isfinite(d.prior26.iat[i]) and d.prior26.iat[i] >= 2 / 3
            sig = d.sigma.iat[i]
            z1 = direc * D.fwd(d, i, 1) / sig
            z4 = direc * D.fwd(d, i, 4) / (sig * 2.0)
            rel = (d.report_date.iat[i] + pd.Timedelta(days=3)).to_datetime64()
            k = np.searchsorted(ridx, rel, side="left")          # first trading day on/after release Friday
            pre = r.values[max(0, k - 60):k]                       # 60 days ending the day before the release Friday
            sig_d = np.sqrt(np.mean(pre ** 2)) if len(pre) >= 50 else np.nan
            # trading days strictly after the release Friday
            k_after = np.searchsorted(ridx, rel, side="right")
            nxt = r.values[k_after:k_after + 20]
            vr = np.sqrt(np.mean(nxt ** 2)) / sig_d if len(nxt) == 20 and np.isfinite(sig_d) and sig_d > 0 else np.nan
            row = {"sym": sym, "date": d.report_date.iat[i], "grp": grp, "longheld": bool(longheld), "dir": direc,
                   "z1": z1, "z4": z4, "vr": vr}
            rows.append(row)
            if np.isfinite(sig_d) and sig_d > 0:
                end = rel + np.timedelta64(7, "D")
                sel = (ridx > rel) & (ridx <= end)
                for v in r.values[sel]:
                    days.append({"sym": sym, "date": row["date"], "grp": grp, "longheld": bool(longheld), "zd": direc * v / sig_d})
    return pd.DataFrame(rows), pd.DataFrame(days)


# ── statistics on (possibly weighted) samples ────────────────────────────────
def stats(z, w=None):
    z = np.asarray(z, float)
    w = np.ones_like(z) if w is None else np.asarray(w, float)
    m = np.isfinite(z) & (w > 0)
    z, w = z[m], w[m]
    if w.sum() < 20:
        return None
    W = w.sum()
    ag, wi = (w * (z <= -2)).sum() / W, (w * (z >= 2)).sum() / W
    mu = (w * z).sum() / W
    var = (w * (z - mu) ** 2).sum() / W
    skew = (w * (z - mu) ** 3).sum() / W / var ** 1.5 if var > 0 else np.nan
    # tails: weighted 5% quantiles via repetition (weights are small integers in the bootstrap)
    rep = np.repeat(z, w.astype(int)) if not np.allclose(w, 1) else z
    q05, q95 = np.quantile(rep, [0.05, 0.95])
    worst, best = rep[rep <= q05].mean(), rep[rep >= q95].mean()
    return {"against": ag, "with": wi, "ratio": ag / wi if wi > 0 else np.nan, "worst5": worst, "best5": best,
            "tail_asym": abs(worst) - abs(best), "skew": skew, "n": int(m.sum())}


def vr_stat(v, w=None):
    v = np.asarray(v, float)
    w = np.ones_like(v) if w is None else np.asarray(w, float)
    m = np.isfinite(v) & (w > 0)
    return (w[m] * v[m]).sum() / w[m].sum() if w[m].sum() > 0 else np.nan


def main():
    rng = np.random.default_rng(SEED)
    rows, days = build_rows()
    rows.to_csv(os.path.join(OUT, "rows.csv"), index=False)
    dates = np.array(sorted(rows.date.unique()))
    pos = {t: k for k, t in enumerate(dates)}
    rows["di"] = rows.date.map(pos)
    days["di"] = days.date.map(pos)
    nd = len(dates)

    def masks(df):
        out = {}
        for sub, keep in SUBSETS.items():
            ks = df.sym.map(keep).astype(bool)
            for g in GROUPS:
                gm = (df.longheld & ks) if g == "long-held" else ((df.grp == g) & ks)
                out[(sub, g)] = gm.values
        return out

    mr, md = masks(rows), masks(days)
    MEAS = [("1w", rows, "z1", mr), ("4w", rows, "z4", mr), ("daily", days, "zd", md)]

    # point estimates
    est = {}
    for hz, df, col, mk in MEAS:
        for key, m in mk.items():
            est[(hz,) + key] = stats(df[col].values[m])
    vr_est = {key: vr_stat(rows.vr.values[m]) for key, m in mr.items()}

    # paired block bootstrap over report dates
    nb = int(np.ceil(nd / BLOCK))
    boot = {k: [] for k in est}
    vr_boot = {k: [] for k in vr_est}
    for _ in range(REPS):
        st = rng.integers(0, nd - BLOCK + 1, nb)
        cnt = np.bincount((st[:, None] + np.arange(BLOCK)).ravel(), minlength=nd)
        wr, wd = cnt[rows.di.values], cnt[days.di.values]
        for hz, df, col, mk in MEAS:
            ww = wr if df is rows else wd
            for key, m in mk.items():
                boot[(hz,) + key].append(stats(df[col].values[m], ww[m]))
        for key, m in mr.items():
            vr_boot[key].append(vr_stat(rows.vr.values[m], wr[m]))

    def ci(vals):
        v = np.array([x for x in vals if x is not None and np.isfinite(x)])
        return [round(float(np.percentile(v, 2.5)), 4), round(float(np.percentile(v, 97.5)), 4)] if len(v) > 50 else None

    res = {"id": "cot-crowd-tail-asymmetry", "seed": SEED, "label": "exploratory, not pre-registered",
           "window": [str(rows.date.min().date()), str(rows.date.max().date())], "n_rows": int(len(rows)),
           "n_days": int(len(days)), "cells": {}, "vol": {}}
    n_cells = 0
    for k, e in est.items():
        if e is None:
            continue
        hz, sub, g = k
        b = boot[k]
        neutral_b = boot[(hz, sub, "neutral")]
        cell = {m: round(float(e[m]), 4) for m in ("against", "with", "ratio", "worst5", "best5", "tail_asym", "skew")}
        cell["n"] = e["n"]
        for m in ("against", "with", "ratio", "tail_asym", "skew"):
            cell[m + "_ci"] = ci([x[m] if x else None for x in b])
        if g != "neutral":
            # ratio of ratios vs neutral, paired on the same draw
            rr = [x["ratio"] / nb_["ratio"] if x and nb_ and nb_["ratio"] > 0 else None for x, nb_ in zip(b, neutral_b)]
            ne = est[(hz, sub, "neutral")]
            cell["ratio_vs_neutral"] = round(float(e["ratio"] / ne["ratio"]), 3)
            cell["ratio_vs_neutral_ci"] = ci(rr)
            dt = [x["tail_asym"] - nb_["tail_asym"] if x and nb_ else None for x, nb_ in zip(b, neutral_b)]
            cell["tail_asym_vs_neutral"] = round(float(e["tail_asym"] - ne["tail_asym"]), 3)
            cell["tail_asym_vs_neutral_ci"] = ci(dt)
            n_cells += 2
        n_cells += 3
        res["cells"]["|".join(k)] = cell
    for k, v in vr_est.items():
        sub, g = k
        cell = {"vr": round(float(v), 4), "ci": ci(vr_boot[k])}
        if g != "neutral":
            dif = [a - b_ for a, b_ in zip(vr_boot[k], vr_boot[(sub, "neutral")])]
            cell["vs_neutral"] = round(float(v - vr_est[(sub, "neutral")]), 4)
            cell["vs_neutral_ci"] = ci(dif)
            n_cells += 1
        res["vol"]["|".join(k)] = cell
    res["n_cells_judged"] = n_cells

    # concentration: per market / era / leave-one-out for extreme + long-held, 1w, 4w, daily, vol
    conc = {}
    for g in ("extreme", "long-held", "trimmed"):
        gsel_r = rows.longheld if g == "long-held" else rows.grp == g
        gsel_d = days.longheld if g == "long-held" else days.grp == g
        neu_r, neu_d = rows.grp == "neutral", days.grp == "neutral"
        c = {"per_market": {}, "per_era": {}, "loo": {}}
        for sym in sorted(rows.sym.unique()):
            sr, sd = rows.sym == sym, days.sym == sym
            e1, e4, ed = stats(rows.z1[gsel_r & sr]), stats(rows.z4[gsel_r & sr]), stats(days.zd[gsel_d & sd])
            c["per_market"][sym] = {h: (None if e is None else {"against": round(e["against"], 4), "with": round(e["with"], 4),
                                                              "n": e["n"], "tail_asym": round(e["tail_asym"], 3)})
                                    for h, e in (("1w", e1), ("4w", e4), ("daily", ed))}
            c["per_market"][sym]["vr"] = round(float(vr_stat(rows.vr[gsel_r & sr])), 3) if (gsel_r & sr).any() else None
            c["per_market"][sym]["vr_neutral"] = round(float(vr_stat(rows.vr[neu_r & sr])), 3) if (neu_r & sr).any() else None
            lr, ld = gsel_r & ~sr, gsel_d & ~sd
            e1, e4, ed = stats(rows.z1[lr]), stats(rows.z4[lr]), stats(days.zd[ld])
            c["loo"][sym] = {h: (None if e is None else {"ratio": round(e["ratio"], 3), "tail_asym": round(e["tail_asym"], 3)})
                             for h, e in (("1w", e1), ("4w", e4), ("daily", ed))}
            c["loo"][sym]["vr_minus_neutral"] = round(float(vr_stat(rows.vr[lr]) - vr_stat(rows.vr[neu_r & ~sr])), 4)
        for name, a, b in ERAS:
            er = (rows.date >= a) & (rows.date <= b)
            ed_ = (days.date >= a) & (days.date <= b)
            out = {}
            for h, df, col, gs, ns, em in (("1w", rows, "z1", gsel_r, neu_r, er), ("4w", rows, "z4", gsel_r, neu_r, er), ("daily", days, "zd", gsel_d, neu_d, ed_)):
                e, n = stats(df[col][gs & em]), stats(df[col][ns & em])
                out[h] = None if e is None or n is None else {"ratio": round(e["ratio"], 3), "neutral_ratio": round(n["ratio"], 3),
                                                              "tail_asym": round(e["tail_asym"], 3), "neutral_tail_asym": round(n["tail_asym"], 3), "n": e["n"]}
            out["vr_minus_neutral"] = round(float(vr_stat(rows.vr[gsel_r & er]) - vr_stat(rows.vr[neu_r & er])), 4)
            c["per_era"][name] = out
        conc[g] = c
    res["concentration"] = conc

    with open(os.path.join(OUT, "results.json"), "w") as f:
        json.dump(res, f, indent=1, default=lambda x: None if isinstance(x, float) and np.isnan(x) else str(x))
    write_page_data(res)
    print("rows", len(rows), "days", len(days), "cells", n_cells, res["window"])


def write_page_data(res):
    """js/cotTailData.js: compact numbers for cot-extremes.html. Regenerated by this script."""
    C, V = res["cells"], res["vol"]

    def pk(sub, g, hz):
        c = C.get(f"{hz}|{sub}|{g}")
        if not c:
            return None
        return {"n": c["n"], "against": c["against"], "againstCi": c["against_ci"], "with": c["with"], "withCi": c["with_ci"],
                "ratio": c["ratio"], "vsNeutral": c.get("ratio_vs_neutral"), "vsNeutralCi": c.get("ratio_vs_neutral_ci"),
                "tailAsym": c["tail_asym"], "skew": c["skew"]}

    groups = {}
    for sub in SUBSETS:
        groups[sub] = {}
        for g in GROUPS:
            v = V.get(f"{sub}|{g}")
            groups[sub][g] = {"w1": pk(sub, g, "1w"), "w4": pk(sub, g, "4w"), "daily": pk(sub, g, "daily"),
                              "vol": None if not v else {"ratio": v["vr"], "ci": v["ci"], "vsNeutral": v.get("vs_neutral"), "vsNeutralCi": v.get("vs_neutral_ci")}}
    per = {}
    for sym, v in res["concentration"]["extreme"]["per_market"].items():
        a = v.get("4w")
        per[sym] = None if not a else {"against": a["against"], "with": a["with"], "n": a["n"],
                                       "ratio": round(a["against"] / a["with"], 2) if a["with"] > 0 else None,
                                       "vr": v["vr"], "vrNeutral": v["vr_neutral"]}
    data = {"id": res["id"], "status": res["label"], "window": res["window"], "groups": groups, "perMarketExtreme4w": per,
            "fields": "against/with = share of readings followed by a move of 2 sigma or more against / with the crowd; vol ratio = next-20-day realised vol / trailing 60-day vol"}
    with open(os.path.join(ROOT, "js/cotTailData.js"), "w") as f:
        f.write("// GENERATED by scripts/cot-crowd-tail-asymmetry/analyse.py -- do not edit by hand.\n"
                "// Are big moves lopsided against a crowded COT position, and does vol expand after one? 2007-2026.\n"
                "// Exploratory, not pre-registered: analysis/output/cot-crowd-tail-asymmetry/RESULTS.md\n"
                "window.COT_TAIL = " + json.dumps(data, separators=(",", ":"), default=lambda x: None) + ";\n")


if __name__ == "__main__":
    main()
