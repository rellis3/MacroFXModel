"""Step 5 ACCOUNT: rows at every stage of the banked design (base mode of reimpl, which reproduces 17 exactly).
    python scripts/null-audit/wall-placebo/accounting.py"""
import sys, os
import numpy as np
import pandas as pd
sys.path.insert(0, os.path.dirname(__file__))
import reimpl as R

O = "analysis/output/null-audit/wall-placebo"
ev = pd.read_parquet(f"{O}/reimpl/events_base.parquet")
rows = []
for pair in R.PAIRS:
    raw_dates = pd.read_csv(f"OI Data/{pair}.csv", usecols=["date"])["date"].nunique()
    dm = pd.read_parquet(f"oi_research_book/data/daily_master_all{'' if pair == 'EUR_USD' else '_' + pair.lower()}.parquet")
    m1 = R.load_m1(pair)
    md = set(pd.to_datetime(m1["date"].unique()))
    w = R.walls_from_raw(pair)
    L = R.levels(pair, {"base"}, md)
    st, en, rr = R.segments(m1, L, {"base"})
    Ld = L.iloc[rr]
    e = ev[ev["pair"] == pair]
    r = {"pair": pair, "cme_dates_raw": raw_dates, "daily_master_rows": len(dm),
         "cme_dates_with_m1": int(w["date"].isin(md).sum()), "m1_last": str(m1["ts"].max()),
         "level_days_with_bars": len(rr),
         "wall_ties_C": int(w["C_tie"].sum()), "wall_ties_P": int(w["P_tie"].sum())}
    # distance of the T-1 wall from the day's first close, % of price
    first_close = m1["close"].values[st]
    for side in ("call", "put"):
        W = Ld[f"{side}_wall"].values
        lo = np.minimum.reduceat(m1["low"].values, st); hi = np.maximum.reduceat(m1["high"].values, st)
        r[f"{side}_wall_median_dist_pct"] = round(float(np.nanmedian(np.abs(W / first_close - 1)) * 100), 2)
        r[f"{side}_days_wall_inside_day_range"] = int(((W >= lo) & (W <= hi)).sum())
        r[f"{side}_wall_on_hypothesis_side_pct"] = round(float(np.nanmean((W > first_close) if side == "call" else (W < first_close)) * 100), 1)
        for k in R.GRID:
            r[f"{side}_placebo{k:+d}_dropped_opp_wall"] = int(np.isnan(Ld[f"{side}_{k}"].values).sum() - np.isnan(W).sum())
        es = e[e["side"] == side]
        for kind in ("wall", "grid", "offgrid"):
            ek = es[es["kind"] == kind]
            r[f"{side}_{kind}_touches"] = len(ek)
            for h in R.HZ:
                r[f"{side}_{kind}_unresolved_{h}m_pct"] = round(float(ek[f"b{h}"].isna().mean() * 100), 1)
        ew = es[es["kind"] == "wall"]
        r[f"{side}_wall_touch_days"] = int(ew["date"].nunique())
    rows.append(r)
A = pd.DataFrame(rows).set_index("pair").T
A.to_csv(f"{O}/accounting.csv")
pd.set_option("display.width", 250)
print(A.to_string())
# banked events beyond the lockbox (2026-08-21)
from glob import glob
n = 0; tot = 0
for f in glob("oi_research_book/data/results/wall_placebo_events*.csv"):
    d = pd.read_csv(f, usecols=["date"]); n += int((d["date"] > "2026-08-21").sum()); tot += len(d)
print(f"banked events dated after the 2026-08-21 lockbox: {n} of {tot}")
# hour-of-day of touches: wall vs grid (does end-of-day truncation hit them differently?)
ev["hr"] = pd.to_datetime(ev["touch_ts"]).dt.hour
print(ev.groupby("kind")["hr"].describe())
