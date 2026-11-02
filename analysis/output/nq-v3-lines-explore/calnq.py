import sys, numpy as np, pandas as pd
V = pd.read_parquet(sys.argv[1])
d = pd.read_csv("analysis/output/forecast_history/NQ.csv")
w = d.merge(V[["date"] + [c for c in V.columns if c.startswith("SI_")]], on="date")
w = w[w.date < "2026-08-21"]
Q = {"oc": "r_oc", "hl": "r_hl", "oh": "r_oh", "ol": "r_ol"}
def table(by, label):
    rows = []
    for g, x in w.groupby(by):
        r = {label: g, "n": len(x)}
        for s, pre in (("PROD", "pit_"), ("v3", "SI_")):
            for q in ("hl", "oh", "ol", "oc"):
                for p, t in (("p50", 50), ("p75", 25), ("p90", 10)):
                    r[f"{s} {q} {p}"] = round(100 * (x[Q[q]] > x[f"{pre}{q}_{p}"]).mean(), 1)
        rows.append(r)
    return pd.DataFrame(rows)
pd.set_option("display.width", 250); pd.set_option("display.max_columns", 60)
w["year"] = w.date.str[:4]
w["vol"] = pd.qcut(w.pit_sig_used, 3, labels=["1 calm", "2 normal", "3 busy"])
w["ev"] = w.event.where(w.event.isin(["FOMC", "NFP", "CPI", "none"]), "other")
w["dow"] = pd.to_datetime(w.date).dt.day_name().str[:3]
keep = lambda t: t[[c for c in t.columns if c in ("n",) or c.split()[0] in (t.columns[0],) or ("hl" in c or "oh" in c or "ol" in c)]]
for by, lab in (("year", "year"), ("vol", "vol"), ("ev", "event"), ("dow", "day")):
    t = table(by, lab)
    print(t[[lab, "n"] + [c for c in t.columns if c.split()[-1] in ("p50", "p75", "p90") and c.split()[1] in ("hl", "oh", "ol")]].to_string(index=False)); print()
# realised range / forecast p50 median per year (bias): >1 = forecast too narrow
for s, pre in (("PROD", "pit_"), ("v3", "SI_")):
    print(s, "median r_hl / hl_p50 by year:", (w.r_hl / w[f"{pre}hl_p50"]).groupby(w.year).median().round(3).to_dict())
# rank correlation forecast vs realised range (does it know big days from small?)
from scipy.stats import spearmanr
for s, pre in (("PROD", "pit_"), ("v3", "SI_"), ("ATR20 proxy", None)):
    f = w[f"{pre}hl_p50"] if pre else w.r_hl.shift(1).rolling(20).mean()
    m = f.notna()
    print(s, "spearman(forecast, realised range) =", round(spearmanr(f[m], w.r_hl[m]).correlation, 3))
