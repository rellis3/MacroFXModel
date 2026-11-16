"""rule-a-teardown, step 2 (EXPLORATORY): decompose Rule A 2016-2026.

    PYTHONPATH=. python scripts/rule-a-teardown/analyse.py

Inputs: analysis/output/rule-a-teardown/{breaks_2020,days}.parquet (build.py) and the frozen 2016-20 backcast breaks
analysis/output/rule-a-pre2020/trades.csv. Unit: net R per trade at 0.2 sigma / 5R, 2x spread (both eras the same).
Uncertainty: bootstrap over dates (all trades of a date move together), B = 2000, seed 20261115.
Everything here has been seen before in some form, so nothing is a verdict beyond CONTEXT.
"""
from __future__ import annotations

import gzip
import json
from pathlib import Path

import numpy as np
import pandas as pd

OUT = Path("analysis/output/rule-a-teardown")
SEED, B = 20261115, 2000
IDX = {"EURUSD", "GBPUSD", "AUDUSD", "USDCAD", "USDCHF", "USDJPY", "GOLD"}
rng = np.random.default_rng(SEED)


def boot(df, col="r"):
    x = df[["d", col]].dropna()
    if len(x) < 5:
        return {"n": int(len(x)), "mean": float(x[col].mean()) if len(x) else None, "lo": None, "hi": None}
    g = x.groupby("d")[col].agg(["sum", "count"])
    s, c = g["sum"].to_numpy(), g["count"].to_numpy()
    k = len(g)
    ix = rng.integers(0, k, size=(B, k))
    m = s[ix].sum(1) / c[ix].sum(1)
    return {"n": int(len(x)), "days": int(k), "mean": round(float(s.sum() / c.sum()), 4),
            "lo": round(float(np.quantile(m, 0.025)), 4), "hi": round(float(np.quantile(m, 0.975)), 4),
            "win": round(float((x[col] > 0).mean()), 3)}


def era(d):
    return "2016-20" if d < "2020-08-24" else ("2020-22" if d <= "2022-12-31" else "2023-26")


def main():
    b20 = pd.read_parquet(OUT / "breaks_2020.parquet")
    b20 = b20[b20.d >= "2020-08-24"]
    pre = pd.read_csv("analysis/output/rule-a-pre2020/trades.csv")
    res = {"seed": SEED, "B": B, "label": "EXPLORATORY, not pre-registered"}

    # parity: rich subset of the rebuild == the locked line-backtest rule A (gross 0.2|5 = g[7])
    par = {"n_rebuild": 0, "n_locked": 0, "match": 0}
    for sym in b20.inst.unique():
        rec = json.load(gzip.open(f"backtest-data/line-backtest/{sym}.json.gz"))
        A = {(t["d"], t["line"]): (t["g"][7][0] / 1000 if t["g"][7] else None) for t in rec["trades"]["A"]}
        mine = b20[(b20.inst == sym) & (b20.rich == True)]  # noqa: E712
        par["n_rebuild"] += len(mine)
        par["n_locked"] += len(A)
        for d, ln, g in zip(mine.d, mine.line, mine["0.2|5_g"]):
            v = A.get((d, ln))
            if v is not None and g == g and g is not None and abs(round(g * 1000) / 1000 - v) < 0.0015:
                par["match"] += 1
    res["parity"] = par

    a = pd.DataFrame({"inst": b20.inst, "d": b20.d, "ratio": b20.ratio, "rich": b20.rich, "line": b20.line,
                      "side": b20.side, "hour": b20.hour, "r": b20["0.2|5"], "g": b20["0.2|5_g"],
                      "mirror": b20.mirror, "mirror_g": b20.mirror_g, "reason": b20.reason, "sp_R": b20.sp_R,
                      "gap_sig": b20.gap_sig})
    p = pd.DataFrame({"inst": pre.inst, "d": pre.d, "ratio": pre.ratio, "rich": pre.rich, "line": pre.line,
                      "side": pre.side, "hour": pre.hour, "r": pre["0.2|5"]})
    allb = pd.concat([p, a], ignore_index=True)
    allb = allb[allb.r.notna() & allb.rich.notna()]
    allb["rich"] = allb.rich.astype(bool)
    allb["era"] = allb.d.map(era)
    allb["year"] = allb.d.str[:4]
    allb["cls"] = np.where(allb.inst.isin(IDX), "FX+gold", "indices")
    R = allb[allb.rich]

    res["by_era"] = {e: {"rich": boot(allb[(allb.era == e) & allb.rich]), "nonrich": boot(allb[(allb.era == e) & ~allb.rich])}
                     for e in ["2016-20", "2020-22", "2023-26"]}
    res["by_year"] = {y: {"rich": boot(allb[(allb.year == y) & allb.rich]), "nonrich": boot(allb[(allb.year == y) & ~allb.rich])}
                      for y in sorted(allb.year.unique())}

    # richness: ratio relative to the class threshold, bins over the whole span
    thr = np.where(allb.cls == "FX+gold", 1.182, 1.53)
    allb["rel"] = allb.ratio / thr
    bins = [0, 0.7, 0.85, 1.0, 1.15, 1.35, 99]
    allb["rbin"] = pd.cut(allb.rel, bins, labels=["<0.70", "0.70-0.85", "0.85-1.00", "1.00-1.15", "1.15-1.35", ">1.35"])
    res["by_richness"] = {e: {str(k): boot(g) for k, g in allb[allb.era == e].groupby("rbin", observed=True)}
                          for e in ["2016-20", "2020-22", "2023-26"]}
    res["by_richness_all"] = {str(k): boot(g) for k, g in allb.groupby("rbin", observed=True)}

    def split(col):
        return {e: {str(k): boot(g) for k, g in R[R.era == e].groupby(col)} for e in ["2016-20", "2020-22", "2023-26"]}
    R = R.assign(lineq=R.line.str[-3:], dir=np.where(R.side > 0, "long (up break)", "short (down break)"),
                 hb=pd.cut(R.hour, [-1, 3, 6, 10], labels=["00-03", "04-06", "07-09"]))
    res["by_line"] = split("lineq")
    res["by_side"] = split("dir")
    res["by_hour"] = split("hb")
    res["by_class"] = split("cls")
    res["by_inst"] = {s: {e: boot(R[(R.inst == s) & (R.era == e)]) for e in ["2016-20", "2020-22", "2023-26"]}
                      for s in sorted(R.inst.unique())}

    # 2020-26 rich only: payoff shape, mirror, cells, cost share
    A = a[a.rich == True].copy()  # noqa: E712
    A["era"] = A.d.map(era)
    shape = {}
    for e, g in A.groupby("era"):
        x = g.r.dropna().sort_values(ascending=False)
        tot = x.sum()
        shape[e] = {"n": int(len(x)), "total_R": round(float(tot), 1),
                    "top10_share": round(float(x.head(10).sum() / tot), 2) if tot > 0 else None,
                    "target_rate": round(float((g.reason == "target").mean()), 3),
                    "stop_rate": round(float((g.reason == "stop").mean()), 3),
                    "time_rate": round(float((g.reason == "time").mean()), 3),
                    "gross": boot(g, "g"), "net": boot(g, "r"), "mirror_gross": boot(g, "mirror_g"),
                    "mirror_net": boot(g, "mirror"), "cost_R": round(float(g.sp_R.mean()), 3),
                    "gap_sig_median": round(float(g.gap_sig.median()), 3)}
    res["shape_2020_26"] = shape
    res["cells_2020_26"] = {c: {e: boot(pd.DataFrame({"d": g.d, "r": g[c]})) for e, g in
                                b20[b20.rich == True].assign(era=lambda z: z.d.map(era)).groupby("era")}  # noqa: E712
                            for c in ["0.2|2", "0.2|5", "0.2|10", "0.4|5", "0.6|5"]}

    # regime: market trend-day share, point-in-time (trailing 60 sessions, strictly before the day)
    days = pd.read_parquet(OUT / "days.parquet")
    T = days.groupby("d").eff.mean().sort_index()
    trail = T.shift(1).rolling(60, min_periods=40).mean()
    med = trail.shift(1).rolling(500, min_periods=250).median()
    R2 = R.copy()
    R2["trend_trail"] = R2.d.map(trail)
    R2["trend_med"] = R2.d.map(med)
    R2 = R2.dropna(subset=["trend_trail", "trend_med"])
    R2["trendy"] = R2.trend_trail > R2.trend_med
    res["regime_trend60"] = {e: {"trendy": boot(R2[(R2.era == e) & R2.trendy]), "quiet": boot(R2[(R2.era == e) & ~R2.trendy])}
                             for e in ["2016-20", "2020-22", "2023-26"]}
    res["regime_trend60"]["all"] = {"trendy": boot(R2[R2.trendy]), "quiet": boot(R2[~R2.trendy])}
    yr_eff = T.groupby(T.index.str[:4]).mean()
    yr_R = R.groupby("year").r.mean()
    j = pd.concat([yr_eff.rename("eff"), yr_R.rename("R")], axis=1).dropna()
    res["year_eff_vs_R"] = {"rows": {k: [round(float(v.eff), 4), round(float(v.R), 3)] for k, v in j.iterrows()},
                            "corr": round(float(j.eff.corr(j.R)), 2)}
    # same-day: does a trend day (eff) on the trade's own instrument explain the trade? (descriptive, not tradeable)
    de = days.set_index(["inst", "d"]).eff
    R["eff_same"] = [de.get((i, d), np.nan) for i, d in zip(R.inst, R.d)]
    res["sameday_eff_corr"] = round(float(R[["eff_same", "r"]].corr().iloc[0, 1]), 3)

    # the rule's own momentum: mean R of the previous 100 rich trades (dates strictly before)
    Rs = R.sort_values("d").reset_index(drop=True)
    dm = Rs.groupby("d").r.agg(["sum", "count"])
    cs, cc = dm["sum"].cumsum().shift(1), dm["count"].cumsum().shift(1)
    mom = {}
    for d in dm.index:
        mom[d] = None
    # trailing ~100 trades: use cumulative sums over trades by date
    trade_r = Rs.r.to_numpy()
    first_idx = Rs.groupby("d").cumcount().eq(0)
    starts = Rs.index[first_idx]
    for i in starts:
        if i >= 100:
            mom[Rs.d[i]] = float(trade_r[i - 100:i].mean())
    Rs["mom"] = Rs.d.map(mom)
    Rm = Rs.dropna(subset=["mom"])
    res["own_momentum_100"] = {"after_positive": boot(Rm[Rm.mom > 0]), "after_nonpositive": boot(Rm[Rm.mom <= 0])}

    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=str))
    allb.drop(columns=["rbin"]).to_parquet(OUT / "all_breaks.parquet")
    print(json.dumps(res, indent=1, default=str)[:20000])


if __name__ == "__main__":
    main()
