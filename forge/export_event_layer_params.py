"""EVENT-LAYER — live-type calibration + export (forge/EVENT_LAYER_PREREG.md, FX + gold PASS 2026-10-05).

The pre-registered test fitted release-type sizes on calendar_events.csv. The live feed is ForexFactory,
whose release names do not join to that file. So, exactly as the IV-adjusted export was re-checked on
its live inputs, this refits on the inputs the live path will use:
  * releases: the ForexFactory history (forge/ff_calendar.py, date-repaired, SAME vocabulary as the
    live feed, all nine currencies), High impact only, keyed "CCY|Title";
  * base sigma: the LIVE IV-adjusted sigma (OANDA D1 sigma, CME 30d ATM IV / GVZ, the exported k and mu);
  * realised: the London 00-22 session.
ev_size = the largest train-fitted type effect among the day's relevant High releases (the instrument's
currencies plus USD); B = sigma_ivadj * exp(c * (ev_size - mean)). First 60% fit, last 40% scored with the
prereg's rule (median B/A < 0.99 and B better on >= 60%). Writes js/eventLayerParams.js only on PASS.

    python -m forge.export_event_layer_params
"""
from __future__ import annotations

import json
import subprocess
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from forge import vol as V
from forge.export_iv_adjusted_params import d1, ivd, realised
from forge.ff_calendar import instrument_currencies, load_repaired
from forge.run_combined_range import asof_before, cboe

OUT_JS = Path("js/eventLayerParams.js")
OUT_MD = Path("analysis/output/event_layer/LIVE_CALIBRATION.md")
INSTS = ("EURUSD", "GBPUSD", "AUDUSD", "USDJPY", "USDCAD", "USDCHF", "GOLD")
TRAIN_FRAC, SHRINK_K, MIN_TYPE_N, LAMBDA = 0.60, 20, 10, 1.0
QUANT, TAUS = ("hl", "oc", "oh", "ol"), (0.50, 0.75, 0.90)


def ivadj_params() -> dict:
    js = "import('./js/forecastLadderIvAdjParams.js').then(({IVADJ_PARAMS:P})=>console.log(JSON.stringify(P.pairs)))"
    return json.loads(subprocess.check_output(["node", "-e", js], text=True))


def main():
    P = ivadj_params()
    gvz = cboe("GVZ")
    ff = load_repaired()
    hi = ff[ff["impact"] == "high"].copy()
    hi["date"] = pd.to_datetime(hi["date"]).dt.normalize()
    hi["key"] = hi["Currency"].str.upper() + "|" + hi["Event"].astype(str).str.strip()
    ff_end = hi["date"].max()
    by_day = {d: g[["Currency", "key"]].values.tolist() for d, g in hi.groupby("date")}

    rows = []
    for name in INSTS:
        p = P[name]
        b = d1(name)
        sig_ann = pd.Series(V.ESTIMATORS[p["estimator"]](b.reset_index(drop=True)).astype(float), index=b.index)
        r = realised(name)
        D = pd.DatetimeIndex(r["date"])
        s = asof_before(D, sig_ann.dropna())
        iv = asof_before(D, gvz) if name == "GOLD" else asof_before(D, ivd(name))
        x = np.log(iv / s)
        df = r.assign(inst=name, sig_d=s / V.SQRT252, x=x)
        df["sigA"] = df["sig_d"] * np.exp(p["k"] * (df["x"] - p["mu"]))     # the LIVE IV-adjusted sigma
        ok = np.isfinite(df["sigA"]) & (df["sigA"] > 0) & (df["hl"] > 0) & (df["date"] <= ff_end)
        df = df[ok].reset_index(drop=True)
        ccy = instrument_currencies(name)
        df["rel"] = [[k for c, k in by_day.get(d, []) if c in ccy] for d in df["date"]]
        rows.append(df)
        print(f"{name}: {len(df)} sessions {df['date'].min().date()} to {df['date'].max().date()}", flush=True)
    X = pd.concat(rows, ignore_index=True)
    split = X["date"].quantile(TRAIN_FRAC)
    tr = (X["date"] < split).to_numpy()
    X["res"] = np.log(X["hl"] / X["sigA"])
    X["res"] = X["res"] - X.loc[tr].groupby("inst")["res"].mean().reindex(X["inst"]).to_numpy()

    def type_table(mask):
        R = X.loc[mask, ["rel", "res"]].explode("rel").dropna(subset=["rel"])
        agg = R.groupby("rel")["res"].agg(["sum", "count"])
        return (agg["sum"] / (agg["count"] + SHRINK_K)).where(agg["count"] >= MIN_TYPE_N, 0.0)

    def ev_of(table):
        return np.array([max([table.get(k, 0.0) for k in rel], default=0.0) for rel in X["rel"]])

    def coef(ev, mask):
        z = ev - pd.Series(ev).groupby(X["inst"]).transform(lambda v: v[mask[v.index]].mean()).to_numpy()
        y = X["res"].to_numpy()
        sd = z[mask].std() or 1.0
        b = float((z[mask] / sd) @ y[mask] / ((z[mask] / sd) @ (z[mask] / sd) + LAMBDA))
        return b / sd

    # ── out-of-sample check (fit on train only) ──
    tab_tr = type_table(tr)
    ev_tr = ev_of(tab_tr)
    c_tr = coef(ev_tr, tr)
    mean_tr = pd.Series(ev_tr[tr]).groupby(X.loc[tr, "inst"].to_numpy()).mean()
    X["sigB"] = X["sigA"] * np.exp(c_tr * (ev_tr - mean_tr.reindex(X["inst"]).to_numpy()))
    per, exc = [], {}
    hi_ev = np.quantile(ev_tr[tr], 0.9)
    for inst, g in X.groupby("inst"):
        gtr, gte = g[g["date"] < split], g[g["date"] >= split]
        L, p75 = {}, {}
        for arm in ("A", "B"):
            tot = 0.0
            for t in (0.5, 0.75):
                m = V.fit_width_multiplier(gtr[f"sig{arm}"].to_numpy(), gtr["hl"].to_numpy(), t)
                pred = m * gte[f"sig{arm}"].to_numpy(); d_ = gte["hl"].to_numpy() - pred
                tot += float(np.where(d_ >= 0, t * d_, (t - 1) * d_).mean())
                if t == 0.75: p75[arm] = gte["hl"].to_numpy() > pred
            L[arm] = tot
        evte = ev_tr[g.index[g["date"] >= split]]
        for st, m in (("top-decile release days", evte >= hi_ev), ("no high release", evte == 0), ("all", np.ones(len(gte), bool))):
            for arm in "AB":
                a = exc.setdefault(st, {}).setdefault(arm, [0, 0]); a[0] += int(p75[arm][m].sum()); a[1] += int(m.sum())
        per.append({"inst": inst, "ratio": round(L["B"] / L["A"], 4)})
    r_ = np.array([p["ratio"] for p in per]); med, share = float(np.median(r_)), float((r_ < 1).mean())
    passed = med < 0.99 and share >= 0.60
    print(f"\nlive-type check: median B/A {med:.4f}, better {share:.0%}, c={c_tr:.3f} -> {'PASS' if passed else 'FAIL'}", per)
    for k, v in exc.items(): print(f"  {k:24s} A {v['A'][0] / v['A'][1]:.3f}  B {v['B'][0] / v['B'][1]:.3f}  n={v['A'][1]}")

    # ── full-data fit for export ──
    tab = type_table(np.ones(len(X), bool))
    ev = ev_of(tab)
    c = coef(ev, np.ones(len(X), bool))
    mean_ev = pd.Series(ev).groupby(X["inst"].to_numpy()).mean()
    X["sigE"] = X["sigA"] * np.exp(c * (ev - mean_ev.reindex(X["inst"]).to_numpy()))
    inst_params = {}
    for inst, g in X.groupby("inst"):
        inst_params[inst] = {"mean_ev": round(float(mean_ev[inst]), 5), "currencies": sorted(instrument_currencies(inst)),
                             "width": {q: [round(V.fit_width_multiplier(g["sigE"].to_numpy(), g[q].to_numpy(), t), 4) for t in TAUS] for q in QUANT}}
    types = {k: round(float(v), 4) for k, v in tab[tab != 0].sort_values(ascending=False).items()}

    OUT_MD.parent.mkdir(parents=True, exist_ok=True)
    OUT_MD.write_text("\n".join([
        "# EVENT-LAYER — live-type calibration (ForexFactory vocabulary)", "",
        "Re-check of `forge/EVENT_LAYER_PREREG.md` (FX + gold PASS) on the inputs the live path uses: ForexFactory High releases "
        "(same names as the live feed, all nine currencies), the LIVE IV-adjusted sigma, London 00-22 sessions. First 60% fit, last 40% scored; "
        "prereg rule: median B/A < 0.99 and B better on >= 60%.", "",
        f"**{'PASS' if passed else 'FAIL'}.** Split {split.date()}. Median B/A **{med:.4f}**, B better on **{share:.0%}**. Event coefficient (train) {c_tr:.3f}.", "",
        "| instrument | B/A |", "|---|---|", *[f"| {p['inst']} | {p['ratio']} |" for p in per], "",
        "| test days | n | A p75 exceed | B p75 exceed |", "|---|---|---|---|",
        *[f"| {k} | {v['A'][1]} | {v['A'][0] / v['A'][1]:.1%} | {v['B'][0] / v['B'][1]:.1%} |" for k, v in exc.items()], "",
        f"Release types with an effect (full-data fit): {len(types)}. Widest: " + ", ".join(f"{k} {v:+.3f}" for k, v in list(types.items())[:12]), "",
    ]), encoding="utf-8")
    if passed:
        OUT_JS.write_text("/**\n * Event layer for the IV-adjusted daily ladder (FX majors + gold). GENERATED — do not hand-edit.\n"
                          " * Regenerate: python -m forge.export_event_layer_params   (forge/EVENT_LAYER_PREREG.md; live check:\n"
                          " * analysis/output/event_layer/LIVE_CALIBRATION.md). Keys are ForexFactory 'CCY|Title', as the live feed names them.\n */\n"
                          "export const EVENT_LAYER = " + json.dumps({"generated": str(date.today()), "coef": round(c, 4), "types": types,
                                                                       "instruments": inst_params}) + ";\n", encoding="utf-8")
        print("wrote", OUT_JS, OUT_MD)
    else:
        print("live-type check FAILED — params NOT written;", OUT_MD)


if __name__ == "__main__":
    main()
