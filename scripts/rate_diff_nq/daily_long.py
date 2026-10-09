"""T3-T5 of the diagnostic review (plans/RATE_DIFF_NQ_LEADLAG_PLAN.md): DAILY US 2y (FRED DGS2) minus German 2y (Bundesbank)
vs the NASDAQ Composite, 1997-2026. Explore 1997-2011, confirm 2012-2026.

T3 transforms x horizons (returns), T4 other targets (absolute return / volatility, direction, range), T5 regimes.
Every predictive model controls for Nasdaq's own recent returns and volatility (HAR: 1, 5, 22 days); HAC errors with
the overlap; the confirm half is scored out of sample (R2 gain vs the controls-only model fitted on explore; AUC for
direction). Levels enter only as the 60-day z-score and through an Engle-Granger cointegration test.

    python scripts/rate_diff_nq/daily_long.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy.stats import norm
from sklearn.metrics import roc_auc_score
from statsmodels.tsa.stattools import coint

OUT = Path("analysis/output/rate_diff_nq/diagnostics")
OUT.mkdir(parents=True, exist_ok=True)
F = Path("analysis/output/ys_long/fred")
SPLIT = pd.Timestamp("2012-01-01")


def fred(n):
    d = pd.read_csv(F / f"{n}.csv")
    d.columns = ["date", "v"]
    return pd.Series(pd.to_numeric(d.v, errors="coerce").to_numpy(), index=pd.to_datetime(d.date)).dropna()


us = fred("DGS2")
de = pd.read_csv("analysis/output/policy_direction/DE2Y.csv")
de = pd.Series(de.value.to_numpy(float), index=pd.to_datetime(de.date))
nq = fred("NASDAQCOM")
df = pd.concat([us.rename("us"), de.rename("de"), nq.rename("nq")], axis=1).dropna()
df = df[df.index >= "1997-08-01"]
df["sp"] = (df.us - df.de) * 100                                   # bp
df["r"] = np.log(df.nq).diff() * 100                               # %
for leg, col in (("spread", "sp"), ("US 2y", "us"), ("DE 2y", "de")):
    x = df[col] * (1 if col == "sp" else 100)
    df[f"{leg}|d1"] = x.diff()
    df[f"{leg}|m5"] = x - x.shift(5)
    df[f"{leg}|m20"] = x - x.shift(20)
    df[f"{leg}|z60"] = (x - x.rolling(60).mean()) / x.rolling(60).std()
# controls (known at the close of day d)
df["c_r1"], df["c_r5"] = df.r, df.r.rolling(5).sum()
df["c_v1"], df["c_v5"], df["c_v22"] = df.r.abs(), df.r.abs().rolling(5).mean(), df.r.abs().rolling(22).mean()
CTRL = ["c_r1", "c_r5", "c_v1", "c_v5", "c_v22"]
# targets (day d+1 onward)
TGT = {"ret 1d": df.r.shift(-1), "ret 5d": df.r.rolling(5).sum().shift(-5), "ret 20d": df.r.rolling(20).sum().shift(-20),
       "abs ret 1d": df.r.abs().shift(-1), "vol 5d": df.r.abs().rolling(5).mean().shift(-5)}
H = {"ret 1d": 1, "ret 5d": 5, "ret 20d": 20, "abs ret 1d": 1, "vol 5d": 5}
PRED = [c for c in df.columns if "|" in c]
ex = df.index < SPLIT
pval = lambda t: float(2 * (1 - norm.cdf(abs(t))))


def fit(y, cols, m, h):
    Z = df[cols].copy()
    ok = m & y.notna() & Z.notna().all(axis=1)
    return sm.OLS(y[ok], sm.add_constant(Z[ok])).fit(cov_type="HAC", cov_kwds={"maxlags": max(h, 5)}), ok


rows = []
for p in PRED:
    for tn, y in TGT.items():
        h = H[tn]
        r = {"predictor": p, "target": tn}
        for per, m in (("explore", ex), ("confirm", ~ex)):
            mod, ok = fit(y, CTRL + [p], m, h)
            r[f"b_{per}"], r[f"t_{per}"], r[f"n_{per}"] = float(mod.params[p]), float(mod.tvalues[p]), int(ok.sum())
        # out of sample: fit on explore, score confirm, vs controls only
        full, okf = fit(y, CTRL + [p], ex, h)
        base, _ = fit(y, CTRL, ex, h)
        okc = ~ex & y.notna() & df[CTRL + [p]].notna().all(axis=1)
        yc = y[okc]
        e1 = yc - full.predict(sm.add_constant(df.loc[okc, CTRL + [p]], has_constant="add"))
        e0 = yc - base.predict(sm.add_constant(df.loc[okc, CTRL], has_constant="add"))
        r["oos_r2_gain_pct"] = float((1 - (e1 ** 2).sum() / (e0 ** 2).sum()) * 100)
        r["p_explore"] = pval(r["t_explore"])
        rows.append(r)
    # direction: logistic, next-day sign, AUC on the confirm half with vs without the predictor
    yb = (df.r.shift(-1) > 0).astype(float).where(df.r.shift(-1).notna())
    okx = ex & yb.notna() & df[CTRL + [p]].notna().all(axis=1)
    okc = ~ex & yb.notna() & df[CTRL + [p]].notna().all(axis=1)
    try:
        lw = sm.Logit(yb[okx], sm.add_constant(df.loc[okx, CTRL + [p]])).fit(disp=0)
        lo = sm.Logit(yb[okx], sm.add_constant(df.loc[okx, CTRL])).fit(disp=0)
        auc_w = roc_auc_score(yb[okc], lw.predict(sm.add_constant(df.loc[okc, CTRL + [p]], has_constant="add")))
        auc_o = roc_auc_score(yb[okc], lo.predict(sm.add_constant(df.loc[okc, CTRL], has_constant="add")))
        rows.append({"predictor": p, "target": "direction 1d", "t_explore": float(lw.tvalues[p]), "p_explore": pval(lw.tvalues[p]),
                     "b_explore": float(lw.params[p]), "auc_confirm_with": round(auc_w, 4), "auc_confirm_without": round(auc_o, 4),
                     "oos_auc_gain": round(auc_w - auc_o, 4), "n_explore": int(okx.sum()), "n_confirm": int(okc.sum())})
    except Exception as e:
        print("logit failed", p, e)
T = pd.DataFrame(rows)


def bh(p):
    p = np.asarray(p, float); o = np.argsort(p); q = np.empty(len(p)); run = 1.0
    for i in range(len(p) - 1, -1, -1):
        run = min(run, p[o[i]] * len(p) / (i + 1)); q[o[i]] = run
    return q


T["q_explore"] = bh(T.p_explore.to_numpy())
T["confirm_same_sign_t2"] = (np.sign(T.get("b_explore")) == np.sign(T.get("b_confirm"))) & (T.get("t_confirm").abs() > 1.96)
T.to_csv(OUT / "daily_models.csv", index=False, float_format="%.5f")

# cointegration of levels: log Nasdaq vs spread (and vs US 2y), full and halves
coint_res = {}
for nm, col in (("spread", "sp"), ("US 2y", "us")):
    for per, m in (("full", np.ones(len(df), bool)), ("explore", ex), ("confirm", ~ex)):
        s = df[m]
        t, p, _ = coint(np.log(s.nq), s[col])
        coint_res[f"{nm} {per}"] = {"t": round(float(t), 3), "p": round(float(p), 4)}

# T5 regimes: key transforms -> next-5-day return, per regime, explore vs confirm
rv22 = df.r.abs().rolling(22).mean()
q1, q2 = rv22[ex].quantile([1 / 3, 2 / 3])
cal = pd.read_csv("calendar_events.csv", encoding="latin-1")
ann = set(cal[(cal.ccy == "USD") & cal.event.str.contains(r"Fed Interest Rate|Inflation Rate Month-over-Month|Non Farm|Nonfarm Payrolls|Headline Unemployment", na=False, regex=True)].date)
sb = df["US 2y|d1"].rolling(60).corr(df.r)                        # stock-rates sign regime (past only)
REG = {"vol low": rv22 <= q1, "vol mid": (rv22 > q1) & (rv22 <= q2), "vol high": rv22 > q2,
       "uptrend (50d)": df.nq.pct_change(50) > 0, "downtrend (50d)": df.nq.pct_change(50) <= 0,
       "rates rising (6m)": df.us.diff(126) > 0, "rates falling (6m)": df.us.diff(126) <= 0,
       "stocks & yields move opposite": sb < 0, "stocks & yields move together": sb >= 0,
       "announcement day (2014+)": pd.Series([str(d.date()) in ann for d in df.index], index=df.index) & (df.index >= "2014-01-01"),
       "other day (2014+)": pd.Series([str(d.date()) not in ann for d in df.index], index=df.index) & (df.index >= "2014-01-01")}
ANN_SPLIT = pd.Timestamp("2020-01-01")
rr = []
for p in ("spread|d1", "spread|m20", "spread|z60", "US 2y|d1", "US 2y|m20", "US 2y|z60"):
    for rn, rm in REG.items():
        split = ANN_SPLIT if "2014+" in rn else SPLIT
        for per, m in (("explore", df.index < split), ("confirm", df.index >= split)):
            mm = (m & rm.fillna(False)).to_numpy()
            if mm.sum() < 150:
                continue
            mod, ok = fit(TGT["ret 5d"], CTRL + [p], mm, 5)
            rr.append({"predictor": p, "regime": rn, "period": per, "b": float(mod.params[p]), "t": float(mod.tvalues[p]), "n": int(ok.sum())})
R = pd.DataFrame(rr)
Rw = R.pivot_table(index=["predictor", "regime"], columns="period", values=["t", "b", "n"]).reset_index()
Rw.columns = ["_".join([c for c in col if c]) for col in Rw.columns]
Rw["p_explore"] = [pval(t) for t in Rw.t_explore]
Rw["q_explore"] = bh(Rw.p_explore.fillna(1).to_numpy())
Rw["replicates"] = (Rw.q_explore < 0.05) & (np.sign(Rw.b_explore) == np.sign(Rw.b_confirm)) & (Rw.t_confirm.abs() > 1.96)
Rw.to_csv(OUT / "daily_regimes.csv", index=False, float_format="%.4f")

# T4 range: OANDA NAS100 daily range from 15m closes (2018-2026), next-day log range vs its 20-day mean
m15 = pd.read_parquet("analysis/output/rates_residual/m15/NAS100_USD.parquet")["close"]
dr = m15.groupby(m15.index.normalize()).agg(lambda s: np.log(s.max() / s.min()) * 100)
dr = dr[dr > 0]
rng_df = pd.concat([dr.rename("range"), df[["spread|d1", "US 2y|d1", "DE 2y|d1"]]], axis=1, join="inner")
rng_df["lr"] = np.log(rng_df.range / rng_df.range.rolling(20).mean().shift(1))
rng_df["y"] = rng_df.lr.shift(-1)
rng_df["c1"], rng_df["c5"] = rng_df.lr, rng_df.lr.rolling(5).mean()
RS = pd.Timestamp("2022-01-01")
rgr = {}
for p in ("spread|d1", "US 2y|d1", "DE 2y|d1"):
    rng_df[f"abs {p}"] = rng_df[p].abs()
    for per, m in (("explore 2018-21", rng_df.index < RS), ("confirm 2022-26", rng_df.index >= RS)):
        Z = rng_df[m][["c1", "c5", f"abs {p}", "y"]].dropna()
        mod = sm.OLS(Z.y, sm.add_constant(Z[["c1", "c5", f"abs {p}"]])).fit(cov_type="HAC", cov_kwds={"maxlags": 5})
        rgr[f"|{p}| -> next-day range, {per}"] = {"b": round(float(mod.params[f"abs {p}"]), 5), "t": round(float(mod.tvalues[f"abs {p}"]), 2), "n": int(len(Z))}

out = {"sample": [str(df.index[0].date()), str(df.index[-1].date()), int(len(df))], "split": str(SPLIT.date()),
       "same_day_corr": {p: {"explore": round(float(df.loc[ex, p].corr(df.loc[ex, "r"])), 3), "confirm": round(float(df.loc[~ex, p].corr(df.loc[~ex, "r"])), 3)}
                         for p in ("spread|d1", "US 2y|d1", "DE 2y|d1")},
       "models": {"n": int(len(T)), "q_lt_0.05_explore": int((T.q_explore < 0.05).sum()), "replicated": int((T.q_explore.lt(0.05) & T.confirm_same_sign_t2).sum()),
                  "share_oos_gain_positive": round(float((T.oos_r2_gain_pct.dropna() > 0).mean()), 3),
                  "top": T.sort_values("p_explore").head(15).round(4).to_dict("records")},
       "direction_auc": T[T.target == "direction 1d"][["predictor", "auc_confirm_with", "auc_confirm_without", "oos_auc_gain"]].to_dict("records"),
       "cointegration": coint_res, "regimes": {"n": int(len(Rw)), "q_lt_0.05": int((Rw.q_explore < 0.05).sum()), "replicated": int(Rw.replicates.sum()),
                                               "replicated_rows": Rw[Rw.replicates].round(3).to_dict("records"),
                                               "top": Rw.sort_values("p_explore").head(12).round(3).to_dict("records")},
       "range": rgr}
(OUT / "daily_long.json").write_text(json.dumps(out, indent=1, default=str))
print(json.dumps(out, indent=1, default=str)[:9000])
