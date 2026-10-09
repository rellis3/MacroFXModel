"""T4 intraday + T6 power + the post-hoc big-move check (plans/RATE_DIFF_NQ_LEADLAG_PLAN.md, diagnostic review).

T4: on 15-min bars (1-min data Apr-Oct 2026), does the size / direction of the rate move in bar t forecast Nasdaq's next-hour
    realised volatility, range or direction, beyond Nasdaq's own recent volatility and the time of day?
T6: plant a known one-bar lead into the real data and count how often the lead-lag grid procedure (FDR over the 600-cell
    family, then same sign and |t| > 1.96 in the confirm half) finds it.
Post-hoc: the "rate's largest move sits 1-3 min before Nasdaq's largest moves" pattern, split by half, and whether the
    rate's move direction in that window agrees with Nasdaq's move direction.

    python scripts/rate_diff_nq/intraday_targets_power.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy.stats import norm
from sklearn.metrics import roc_auc_score

D1 = Path("analysis/output/stir_1m")
OUT = Path("analysis/output/rate_diff_nq/diagnostics")
SPLIT = pd.Timestamp("2026-07-01")
rng = np.random.default_rng(7)


def p1(n):
    d = pd.read_parquet(D1 / f"{n}.parquet")
    return pd.Series(d.close.to_numpy(float), index=pd.to_datetime(d.time).dt.tz_localize(None)).sort_index()


def stitch(parts, conv):
    out = []
    for n, a, b in parts:
        s = p1(n)
        if a:
            s = s[s.index >= a]
        if b:
            s = s[s.index < b]
        out.append(conv(s).iloc[1:])
    return pd.concat(out).sort_index()


lr = lambda s: np.log(s).diff() * 100
yb = lambda s: -np.log(s).diff() / 1.9 * 1e4
nq1 = stitch([("CME_NQM6", None, "2026-06-11"), ("CME_NQU6", "2026-06-11", "2026-09-10"), ("CME_NQZ6", "2026-09-10", None)], lr)
nqp = stitch([("CME_NQM6", None, "2026-06-11"), ("CME_NQU6", "2026-06-11", "2026-09-10"), ("CME_NQZ6", "2026-09-10", None)], lambda s: s)
us1 = stitch([("CBOT_ZTU6", None, "2026-08-28"), ("CBOT_ZTZ6", "2026-08-28", None)], yb)
gbs = sorted(D1.glob("EUREX_FGBS*.parquet"))
de1 = stitch([(gbs[0].stem, None, "2026-08-28"), (gbs[-1].stem, "2026-08-28", None)], yb)
sp1 = (us1 - de1).dropna()
res = {}

# ── T4 intraday ─────────────────────────────────────────────────────────────────────────────────────────────────────
grid = pd.date_range(nq1.index[0].ceil("15min"), nq1.index[-1].floor("15min"), freq="15min")
b = lambda s, f: s.resample("15min", label="left", closed="left").agg(f).reindex(grid)
rv = b(nq1, lambda x: np.sqrt((x ** 2).sum()) if len(x) >= 10 else np.nan)          # 15-min realised vol
rng15 = b(nqp, lambda x: np.log(x.max() / x.min()) * 100 if len(x) >= 10 else np.nan)
ret15 = b(nq1, lambda x: x.sum() if len(x) >= 10 else np.nan)
fut_rv = np.sqrt((rv ** 2).rolling(4).sum().shift(-4))                              # next hour
fut_rng = rng15.rolling(4).max().shift(-4)                                           # proxy: largest 15-min range in the next hour
fut_dir = (ret15.rolling(4).sum().shift(-4) > 0).astype(float).where(ret15.rolling(4).sum().shift(-4).notna())
tod = pd.get_dummies(pd.Series(grid.hour, index=grid), prefix="h", drop_first=True).astype(float)
ctrl = pd.DataFrame({"rv0": rv, "rv1h": np.sqrt((rv ** 2).rolling(4).sum()), "rvday": np.sqrt((rv ** 2).rolling(96, min_periods=40).sum()),
                     "rng0": rng15}, index=grid).join(tod)
ex = grid < SPLIT
t4 = {}
for nm, s1 in (("2y spread US-DE", sp1), ("US 2y", us1), ("DE 2y", de1)):
    x = b(s1, lambda v: v.sum() if len(v) >= 5 else np.nan)
    X = ctrl.assign(absx=x.abs(), x=x)
    for tn, y, cols in (("next-hour realised vol", fut_rv, ["absx"]), ("next-hour range", fut_rng, ["absx"])):
        r = {}
        okx = ex & y.notna() & X.notna().all(axis=1)
        okc = ~ex & y.notna() & X.notna().all(axis=1)
        for per, ok in (("explore", okx), ("confirm", okc)):
            m = sm.OLS(y[ok], sm.add_constant(X.loc[ok, list(ctrl.columns) + cols])).fit(cov_type="HAC", cov_kwds={"maxlags": 4})
            r[f"t_{per}"] = round(float(m.tvalues["absx"]), 2)
            r[f"b_{per}"] = round(float(m.params["absx"]), 5)
        full = sm.OLS(y[okx], sm.add_constant(X.loc[okx, list(ctrl.columns) + cols])).fit()
        base = sm.OLS(y[okx], sm.add_constant(X.loc[okx, list(ctrl.columns)])).fit()
        e1 = y[okc] - full.predict(sm.add_constant(X.loc[okc, list(ctrl.columns) + cols], has_constant="add"))
        e0 = y[okc] - base.predict(sm.add_constant(X.loc[okc, list(ctrl.columns)], has_constant="add"))
        r["oos_r2_gain_pct"] = round(float((1 - (e1 ** 2).sum() / (e0 ** 2).sum()) * 100), 3)
        r["n"] = [int(okx.sum()), int(okc.sum())]
        t4[f"{nm} | {tn}"] = r
    # direction: logistic, next-hour sign on the signed rate move
    okx = ex & fut_dir.notna() & X.notna().all(axis=1)
    okc = ~ex & fut_dir.notna() & X.notna().all(axis=1)
    cols0 = ["rv0", "rv1h", "rvday"]
    lw = sm.Logit(fut_dir[okx], sm.add_constant(X.loc[okx, cols0 + ["x"]])).fit(disp=0)
    lo = sm.Logit(fut_dir[okx], sm.add_constant(X.loc[okx, cols0])).fit(disp=0)
    t4[f"{nm} | next-hour direction"] = {"t_explore": round(float(lw.tvalues["x"]), 2),
                                         "auc_confirm_with": round(roc_auc_score(fut_dir[okc], lw.predict(sm.add_constant(X.loc[okc, cols0 + ["x"]], has_constant="add"))), 4),
                                         "auc_confirm_without": round(roc_auc_score(fut_dir[okc], lo.predict(sm.add_constant(X.loc[okc, cols0], has_constant="add"))), 4)}
res["T4_intraday"] = t4
print("T4 done", flush=True)

# ── T6 power: plant a one-bar lead, run the grid rule ───────────────────────────────────────────────────────────────
G = pd.read_csv("analysis/output/rate_diff_nq/full/crosscorr_grid.csv")
other_p = np.asarray(2 * (1 - norm.cdf(G[(G.lag != 0)].t_e.abs().fillna(0).to_numpy())))   # the real family, held fixed


def dayt(x, y, dd):
    ok = np.isfinite(x) & np.isfinite(y)
    x, y, dd = x[ok], y[ok], dd[ok]
    xz, yz = (x - x.mean()) / x.std(), (y - y.mean()) / y.std()
    s = pd.Series(xz * yz).groupby(dd).sum()
    return s.mean() / s.std(ddof=1) * np.sqrt(len(s))


def bh_q_of_first(p0, others):
    p = np.concatenate([[p0], others])
    o = np.argsort(p); q = np.empty(len(p)); run = 1.0
    for i in range(len(p) - 1, -1, -1):
        run = min(run, p[o[i]] * len(p) / (i + 1)); q[o[i]] = run
    return q[0]


power = {}
for tf in (1, 15):
    x = sp1.resample(f"{tf}min", label="left", closed="left").sum(min_count=max(1, int(0.8 * tf)))
    y = nq1.resample(f"{tf}min", label="left", closed="left").sum(min_count=max(1, int(0.8 * tf)))
    J = pd.concat([x.rename("x"), y.rename("y")], axis=1).dropna()
    xl = J.x.shift(1)
    days = J.index.normalize()
    ud = np.unique(days)
    for rho in (0.01, 0.02, 0.03, 0.05):
        bcoef = rho * J.y.std() / J.x.std()
        y2 = J.y + bcoef * xl.fillna(0)
        found = 0
        for rep in range(30):
            pick = rng.choice(ud, len(ud))                                   # day-block bootstrap of the sample
            idx = np.concatenate([np.flatnonzero(days == d) for d in pick])
            xi, yi, di = xl.to_numpy()[idx], y2.to_numpy()[idx], np.repeat(np.arange(len(pick)), [np.sum(days == d) for d in pick])
            exm = np.isin(days.to_numpy()[idx], ud[ud < np.datetime64(SPLIT)])
            te = dayt(np.where(exm, xi, np.nan), yi, di)
            tc = dayt(np.where(~exm, xi, np.nan), yi, di)
            q = bh_q_of_first(2 * (1 - norm.cdf(abs(te))), other_p)
            found += int(q < 0.05 and np.sign(te) == np.sign(tc) and abs(tc) > 1.96)
        power[f"{tf}m, planted corr {rho}"] = round(found / 30, 2)
res["T6_power_detection_rate"] = power
print("T6 done", flush=True)

# ── post-hoc: largest Nasdaq moves, by half; direction agreement ─────────────────────────────────────────────────────
ph = {}
for per, m in (("Apr-Jun", nq1.index < SPLIT), ("Jul-Oct", nq1.index >= SPLIT)):
    big = nq1[m].abs().nlargest(25).index
    offs, agree = [], []
    for t in big:
        w = us1.reindex(pd.date_range(t - pd.Timedelta(minutes=3), t + pd.Timedelta(minutes=3), freq="1min"))
        if w.notna().sum() < 5 or w.abs().max() == 0:
            continue
        k = int((w.abs().idxmax() - t).total_seconds() // 60)
        offs.append(k)
        if k < 0:                                   # rate moved first: same-bar sign is negative (yields up <-> NQ down)
            agree.append(int(np.sign(w.loc[w.abs().idxmax()]) == -np.sign(nq1[t])))
    ph[per] = {"offsets": pd.Series(offs).value_counts().sort_index().to_dict(), "rate_first": int(sum(o < 0 for o in offs)),
               "rate_after": int(sum(o > 0 for o in offs)), "same_minute": int(sum(o == 0 for o in offs)),
               "rate-first cases where the rate's direction matched the usual sign": f"{sum(agree)}/{len(agree)}"}
res["posthoc_big_moves"] = ph
(OUT / "intraday_targets_power.json").write_text(json.dumps(res, indent=1, default=str))
print(json.dumps(res, indent=1, default=str))
