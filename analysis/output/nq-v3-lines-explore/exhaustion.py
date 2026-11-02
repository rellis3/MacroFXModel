import sys, numpy as np, pandas as pd
V = pd.read_parquet(sys.argv[1]); d = pd.read_csv("analysis/output/forecast_history/NQ.csv").sort_values("date")
d["atr20"] = d.r_hl.shift(1).rolling(20).mean()
w = d.merge(V[["date"] + [c for c in V.columns if c.startswith("SI_")]], on="date"); w = w[w.date < "2026-08-21"]
sig = w.pit_sig_used
def side(name, pre, q, rq, ocs_sign):
    out = {}
    for r in ("50", "75", "90"):
        L = w[f"{pre}{q}_p{r}"] if pre else None
        out[r] = L
    rows = []
    for lo, hi in (("50", "75"), ("75", "90"), ("90", None)):
        L = out[lo]; t = w[rq] >= L
        nxt = (w[rq] >= out[hi])[t].mean() if hi else np.nan
        ext = ((w[rq] - L) / sig)[t]
        back = (ocs_sign * w.r_ocs < L)[t].mean()                  # closed back inside the line
        back_open = (ocs_sign * w.r_ocs < 0)[t].mean()            # closed beyond the open the other way
        rows.append((name, f"p{lo}", f"{t.mean():.1%}", "-" if hi is None else f"{nxt:.1%}", f"{ext.median():.2f}", f"{ext.quantile(.75):.2f}", f"{back:.1%}", f"{back_open:.1%}"))
    return rows
def atrset(q):
    k = {r: np.median(w[f"SI_{q}_p{r}"] / w.atr20) for r in ("50", "75", "90")}
    for r in k: w[f"A_{q}_p{r}"] = k[r] * w.atr20
for q in ("oh", "ol"): atrset(q)
pd.set_option("display.width", 200)
cols = ["lines", "rung", "reached", "then next rung", "further beyond line (sigma, median)", "(75th pct)", "closed back inside line", "closed past the open"]
for q, rq, sg, lab in (("oh", "r_oh", 1, "UPSIDE (O->H)"), ("ol", "r_ol", -1, "DOWNSIDE (O->L)")):
    rows = side("v3", "SI_", q, rq, sg) + side("PROD", "pit_", q, rq, sg) + side("ATR same size", "A_", q, rq, sg)
    print(lab); print(pd.DataFrame(rows, columns=cols).to_string(index=False)); print()
