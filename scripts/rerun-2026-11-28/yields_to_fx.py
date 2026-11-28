"""Re-run of yields-to-fx-direction (analysis/yield_asset_coupling.py) after DATA_SPEC §5 #18.

Fixes only the two faulty inputs:
  1. Yahoo FX dates: prices re-pulled with the fixed pull_prices() (London date of stamp - 1 min).
  2. Over-applied signal lag: the original shifted the yield change by 1 day for EVERY asset, so the
     next-day lead (yield change through day t -> return t..t+h) was never scored. Here the lag is per asset
     by close time vs the ~15:30 ET Treasury print (H.15/FRED DGS): closes AFTER the print (US cash indices
     16:00 ET, Yahoo FX at London midnight, TLT/IEF) take lag 0; closes BEFORE it (DAX/FTSE/STOXX/NIKKEI,
     GC=F settle 13:30 ET) keep lag 1.
Everything else (universe, drivers, lookbacks, horizons, null, screens, seed 7) is the original code.
Sample cut at 2026-08-21 (lockbox; the original ran 2026-08-23 on data to ~2026-08-21).
Also runs the original lag-1-everywhere design on the fixed dates, to separate the two fixes.
"""
import sys, os, json
from pathlib import Path
import numpy as np, pandas as pd
WT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WT))
import analysis.yield_asset_coupling as Y  # noqa: E402

OUT = WT / "analysis/output/rerun-2026-11-28/yield_coupling"
OUT.mkdir(parents=True, exist_ok=True)
ORIG = WT / "analysis/output/yield_coupling"
END = pd.Timestamp("2026-08-21")
LAG0 = {"SPX", "NDX", "DJI", "RUT", "EURUSD", "USDJPY", "GBPUSD", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD", "TLT", "IEF"}

if "--refresh" in sys.argv:
    Y.OUT = OUT
    Y.pull_prices()

def load_px(name):
    p = OUT / ("px_%s.csv" % name)
    if not p.exists():
        return None
    s = pd.read_csv(p, index_col=0, parse_dates=True)["close"].sort_index()
    return s[s.index <= END]
Y.load_px = load_px
Y.OUT = OUT  # run() writes study_main.csv here
yields = pd.read_csv(ORIG / "yields.csv", index_col=0, parse_dates=True)
yields = yields[yields.index <= END]

def run_perasset():
    """Same as Y.run but the lag is chosen per asset (LAG0 -> 0 else 1). Same rng order as Y.run."""
    rng = np.random.default_rng(7)
    rows = []
    for name, (_tk, grp) in Y.ASSETS.items():
        lag = 0 if name in LAG0 else 1
        df = Y.align(name, yields)
        if df is None:
            continue
        for drv in Y.DRIVERS:
            for k in Y.LOOKBACKS:
                dy_raw = df[drv].diff(k)
                m0 = pd.concat([dy_raw, df["lp"].diff(k)], axis=1).dropna()
                if len(m0) >= Y.MIN_OBS:
                    st = Y.cell_stats(m0.iloc[:, 0].to_numpy(), m0.iloc[:, 1].to_numpy(), k, rng)
                    rows.append(dict(asset=name, group=grp, driver=drv, lookback=k, horizon=0, tradeable=0, lag=lag, **st))
                dy = dy_raw.shift(lag)
                for h in Y.HORIZONS:
                    fwd = df["lp"].shift(-h) - df["lp"]
                    m = pd.concat([dy, fwd], axis=1).dropna()
                    if len(m) < Y.MIN_OBS:
                        continue
                    x, y_ = m.iloc[:, 0].to_numpy(), m.iloc[:, 1].to_numpy()
                    st = Y.cell_stats(x, y_, h, rng)
                    q = pd.qcut(m.iloc[:, 0], 5, labels=False, duplicates="drop")
                    qm = m.iloc[:, 1].groupby(q).mean()
                    st["qspread_bp"] = float(qm.iloc[0] - qm.iloc[-1]) * 1e4 if len(qm) == 5 else np.nan
                    rows.append(dict(asset=name, group=grp, driver=drv, lookback=k, horizon=h, tradeable=1, lag=lag, **st))
    return pd.DataFrame(rows)

def summ(res, label):
    con, fwd = res[res.tradeable == 0], res[res.tradeable == 1]
    surv = fwd[(fwd.stable == 1) & (fwd.p_null < 0.05)]
    out = {"label": label, "contemp_median_absIC": round(float(con.ic.abs().median()), 4),
           "fwd_median_absIC": round(float(fwd.ic.abs().median()), 4), "fwd_cells": int(len(fwd)),
           "survivors": int(len(surv)), "expected_by_luck": round(len(fwd) * 0.05, 1)}
    for g in ["fx", "index_us", "index_eu", "index_asia", "commod", "bond"]:
        fg = fwd[fwd.group == g]; sg = surv[surv.group == g]
        out[f"survivors_{g}"] = f"{len(sg)} / {len(fg)} cells (luck {len(fg)*0.05:.1f})"
    c5 = con[con.lookback == 5]
    out["contemp_k5_USDJPY_y10"] = round(float(c5[(c5.asset == "USDJPY") & (c5.driver == "y10")].ic.iloc[0]), 3)
    out["contemp_k5_USDJPY_y2"] = round(float(c5[(c5.asset == "USDJPY") & (c5.driver == "y2")].ic.iloc[0]), 3)
    key = fwd[(fwd.driver == "y2") & (fwd.lookback == 1) & (fwd.horizon == 1)]
    out["y2_k1_h1"] = {r.asset: {"ic": round(r.ic, 4), "nw_t": round(r.nw_t, 2), "p_null": None if pd.isna(r.p_null) else round(r.p_null, 3),
                                 "stable": int(r.stable)} for r in key.itertuples()}
    top = surv.reindex(surv.ic.abs().sort_values(ascending=False).index).head(15)
    out["top_survivors"] = top[["asset", "driver", "lookback", "horizon", "n", "ic", "nw_t", "p_null", "ic_h1", "ic_h2"]].round(4).to_dict("records")
    fxs = surv[surv.group == "fx"]
    out["fx_survivors"] = fxs[["asset", "driver", "lookback", "horizon", "ic", "nw_t", "p_null", "ic_h1", "ic_h2"]].round(4).to_dict("records")
    return out

A = Y.run(yields, lag=1); A.to_csv(OUT / "study_lag1_fixeddates.csv", index=False)
Bp = run_perasset(); Bp.to_csv(OUT / "study_perasset_lag_fixeddates.csv", index=False)
res = {"rerun": "2026-11-28", "end": "2026-08-21", "seed": 7,
       "lag1_fixed_dates": summ(A, "original lag 1 everywhere, fixed FX dates"),
       "perasset_lag_fixed_dates": summ(Bp, "per-asset lag (0 after the print, 1 before), fixed FX dates")}
for f in ["study_main.csv"]:
    p = OUT / f
    if p.exists(): p.unlink()
json.dump(res, open(OUT.parent / "yields_to_fx.json", "w"), indent=1, default=str)
for k in ["lag1_fixed_dates", "perasset_lag_fixed_dates"]:
    r = res[k]; print(k, {kk: r[kk] for kk in r if kk not in ("top_survivors", "fx_survivors", "y2_k1_h1")})
    print("  y2 k1 h1:", {a: (v["ic"], v["nw_t"]) for a, v in r["y2_k1_h1"].items()})
    print("  fx survivors:", r["fx_survivors"])
