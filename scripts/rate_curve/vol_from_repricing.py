"""forge/RATE_CURVE_STRUCTURE_PREREG.md Addendum A: does the SIZE and distribution of repricing across the SOFR / ESTR
curves forecast how much Nasdaq moves (realised vol, |return|), beyond Nasdaq's own recent vol? Unsigned features, small
model, strict chronological OOS. Uses the cached bars (scripts/rate_curve/build_bars.py).
  python scripts/rate_curve/vol_from_repricing.py  -> analysis/output/rate_curve_structure/ADDENDUM_A.md + fig_a_*.png"""
from __future__ import annotations
import warnings; warnings.filterwarnings("ignore")
import numpy as np, pandas as pd
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler
from pathlib import Path

OUT = Path("analysis/output/rate_curve_structure"); B = pd.read_parquet(OUT / "bars15.parquet"); G = B.index
DAY = pd.Series(G.date, index=G); HOUR = G.hour.to_numpy(); rng = np.random.default_rng(20261011)
T = lambda s: pd.Timestamp(s, tz="UTC")
EXPL = np.asarray((G > T("2026-04-13")) & (G <= T("2026-07-18"))); CONF = np.asarray((G > T("2026-07-20")) & (G <= T("2026-10-10")))
Q = ["U6", "Z6", "H7", "M7", "U7"]
US = B[[f"S_{q}" for q in Q]].set_axis(Q, axis=1) * 100; EU = B[[f"E_{q}" for q in Q]].set_axis(Q, axis=1) * 100
NQ = B["NQ"]; r1 = NQ.diff(); EPS = 1e-5

def zprior(x, days=20):
    daily = pd.Series(np.asarray(x) ** 2, index=G).groupby(DAY.values).mean()
    sd = np.sqrt(daily.rolling(days, min_periods=10).mean()).shift(1)
    return pd.Series(np.asarray(x) / DAY.map(sd).to_numpy(), index=G)

# ---------- features ----------
X = pd.DataFrame(index=G)
def curve_feats(C, tag, W):
    d = C - C.shift(W); z = d.apply(zprior); az = z.abs()
    X[f"{tag}_mean_abs_{W}"] = az.mean(1)
    if W == 4:
        for q in Q: X[f"{tag}_{q}_abs"] = az[q]
        front, back = d[["U6", "Z6"]].mean(1).abs(), d[["M7", "U7"]].mean(1).abs()
        X[f"{tag}_front_share"] = front / (front + back)
        sp = pd.DataFrame({f"{a}{b}": d[b] - d[a] for a, b in zip(Q[:-1], Q[1:])}).apply(zprior).abs()
        X[f"{tag}_spread_abs"] = sp.mean(1)
    return z
zU1, zE1 = curve_feats(US, "US", 4), curve_feats(EU, "EU", 4); curve_feats(US, "US", 16); curve_feats(EU, "EU", 16)
X["dispersion"] = pd.concat([zU1.abs(), zE1.abs()], axis=1).std(1)
lu, le = zU1.mean(1), zE1.mean(1); X["comove"] = np.sign(lu) * np.sign(le) * np.minimum(lu.abs(), le.abs())
R_COLS = list(X.columns)
# baseline
rv = lambda n: np.sqrt((r1 ** 2).rolling(n, min_periods=max(2, n // 2)).sum())
X["log_rv_1h"], X["log_rv_4h"], X["log_rv_1d"] = np.log(rv(4) + EPS), np.log(rv(16) + EPS), np.log(rv(96) + EPS)
X["abs_ret_1h"] = (NQ - NQ.shift(4)).abs(); X["hs"], X["hc"] = np.sin(2 * np.pi * HOUR / 24), np.cos(2 * np.pi * HOUR / 24)
X["ldn"] = ((HOUR >= 7) & (HOUR < 13)).astype(float); X["us"] = ((HOUR >= 13) & (HOUR < 21)).astype(float); X["asia"] = (HOUR < 7).astype(float)
BASE = ["log_rv_1h", "log_rv_4h", "log_rv_1d", "abs_ret_1h", "hs", "hc", "ldn", "us", "asia"]
X = X.replace([np.inf, -np.inf], np.nan)
# ---------- targets ----------
def fwd_rv(H): return np.sqrt((r1 ** 2)[::-1].rolling(H, min_periods=H).sum()[::-1].shift(-1))
HS = {"15m": 1, "1h": 4, "2h": 8}
TG = {}
for h, H in HS.items():
    TG[("log_rv", h)] = np.log(fwd_rv(H) + EPS); TG[("log_absret", h)] = np.log((NQ.shift(-H) - NQ).abs() + EPS); TG[("ret", h)] = NQ.shift(-H) - NQ

def fit(cols, y, train, test):
    yv = y.to_numpy(); ok_tr = train & np.isfinite(yv) & X[cols].notna().all(1).to_numpy(); ok_te = test & np.isfinite(yv) & X[cols].notna().all(1).to_numpy()
    sc = StandardScaler().fit(X.loc[ok_tr, cols]); m = Ridge(alpha=10.0).fit(sc.transform(X.loc[ok_tr, cols]), yv[ok_tr])
    return pd.Series(m.predict(sc.transform(X.loc[ok_te, cols])), index=G[ok_te]), pd.Series(yv[ok_te], index=G[ok_te]), yv[ok_tr].mean(), m
def r2(p, y, mu): return 1 - ((y - p) ** 2).sum() / ((y - mu) ** 2).sum()
def gain_ci(pa, pb, y, mu, draws=500):
    days = pd.Series(y.index.date, index=y.index); ud = days.unique(); pos = {d: np.where(days.values == d)[0] for d in ud}; out = []
    for _ in range(draws):
        idx = np.concatenate([pos[d] for d in rng.choice(ud, len(ud))]); out.append(r2(pb.iloc[idx], y.iloc[idx], mu) - r2(pa.iloc[idx], y.iloc[idx], mu))
    return np.percentile(out, [2.5, 97.5])

L = ["# Addendum A — magnitude of repricing → how much Nasdaq moves", "", f"Baseline {len(BASE)} features; rates {len(R_COLS)} unsigned features. Ridge α=10. Explore→confirm and monthly walk-forward.", ""]
rows = []; store = {}
for (t, h), y in TG.items():
    pa, ya, mu, _ = fit(BASE, y, EXPL, CONF); pb, _, _, mb = fit(BASE + R_COLS, y, EXPL, CONF); pb = pb.reindex(pa.index); ok = pb.notna()
    lo, hi = gain_ci(pa[ok], pb[ok], ya[ok], mu)
    # walk-forward
    PA, PB, Y = [], [], []
    for mth in pd.period_range("2026-06", "2026-10", freq="M"):
        tr = np.asarray(G < T(str(mth.start_time.date()))) & np.asarray(G > T("2026-04-13")); te = np.asarray((G >= T(str(mth.start_time.date()))) & (G < T(str((mth + 1).start_time.date()))))
        if te.sum() == 0: continue
        a, yy, _, _ = fit(BASE, y, tr, te); b, _, _, _ = fit(BASE + R_COLS, y, tr, te); PA.append(a); PB.append(b.reindex(a.index)); Y.append(yy)
    PA, PB, Y = pd.concat(PA), pd.concat(PB), pd.concat(Y); okw = PB.notna(); muw = Y.mean()
    wlo, whi = gain_ci(PA[okw], PB[okw], Y[okw], muw)
    rows.append(dict(target=t, H=h, base_R2=r2(pa[ok], ya[ok], mu), with_rates_R2=r2(pb[ok], ya[ok], mu), gain=r2(pb[ok], ya[ok], mu) - r2(pa[ok], ya[ok], mu), gain_95=f"[{lo:+.4f}, {hi:+.4f}]",
                     wf_base=r2(PA[okw], Y[okw], muw), wf_with=r2(PB[okw], Y[okw], muw), wf_gain_95=f"[{wlo:+.4f}, {whi:+.4f}]"))
    store[(t, h)] = (pa, pb, ya, mu, mb)
R = pd.DataFrame(rows); L += ["## Out-of-sample skill (R²), confirm half and walk-forward", "", R.round(4).to_markdown(index=False), ""]
R.to_csv(OUT / "addendum_a_skill.csv", index=False)
# regimes for the vol targets at 1h: gain by trailing-vol tercile and session, confirm half
L += ["## Where the gain sits (confirm half, log realised vol 1h and log |return| 1h): R² gain by regime", ""]
terc = np.nanpercentile(X.loc[EXPL, "log_rv_4h"], [33, 67]); vol_reg = pd.Series(np.where(X.log_rv_4h < terc[0], "low vol", np.where(X.log_rv_4h < terc[1], "mid vol", "high vol")), index=G)
sess = pd.Series(np.where(HOUR < 7, "Asia", np.where(HOUR < 13, "London", np.where(HOUR < 21, "US", "late"))), index=G)
reg_rows = []
for key in (("log_rv", "1h"), ("log_absret", "1h"), ("log_rv", "2h")):
    pa, pb, ya, mu, _ = store[key]; pb = pb.reindex(pa.index); ok = pb.notna()
    for rname, R_ in (("vol tercile", vol_reg), ("session", sess)):
        for v in pd.unique(R_.reindex(pa.index)[ok]):
            if v == "late": continue
            m = ok & (R_.reindex(pa.index) == v); reg_rows.append(dict(target=f"{key[0]} {key[1]}", regime=f"{rname}: {v}", n=int(m.sum()), gain=r2(pb[m], ya[m], mu) - r2(pa[m], ya[m], mu)))
RG = pd.DataFrame(reg_rows); L += [RG.pivot_table(index="regime", columns="target", values="gain").round(4).to_markdown(), ""]
# which rates features carry weight (log_rv 1h model, standardised coefficients)
_, _, _, _, mb = store[("log_rv", "1h")]; coef = pd.Series(mb.coef_, index=BASE + R_COLS).sort_values(key=np.abs, ascending=False)
L += ["## Standardised coefficients, log realised vol 1h model (top 12)", "", coef.head(12).round(4).to_markdown(), ""]
# keep rule
vol_rows = R[R.target.isin(["log_rv", "log_absret"])]
def above0(s): return float(s.strip("[]").split(",")[0]) > 0
keep = [(r.target, r.H) for _, r in vol_rows.iterrows() if above0(r.gain_95) and above0(r.wf_gain_95)]
stab = RG[RG.regime.str.startswith("vol")].groupby("target").gain.apply(lambda s: int((s > 0).sum()))
L += ["## Keep rule", "", f"Cells with the gain interval above zero on BOTH confirm and walk-forward: {keep if keep else 'none'}.", f"Vol-tercile sign agreement (terciles with positive gain, of 3): {stab.to_dict()}.", ""]
fig, ax = plt.subplots(figsize=(10, 4)); R.set_index(R.target + " " + R.H)[["base_R2", "with_rates_R2"]].plot.bar(ax=ax); ax.axhline(0, color="k", lw=0.5); ax.set_ylabel("OOS R² (confirm)"); ax.set_title("Baseline vs baseline + unsigned repricing features")
plt.tight_layout(); plt.savefig(OUT / "fig_a_skill.png", dpi=100); plt.close()
(OUT / "ADDENDUM_A.md").write_text("\n".join(L), encoding="utf-8"); print("written")
