"""forge/RATE_CURVE_STRUCTURE_PREREG.md -- one run.
  python scripts/rate_curve/curve_structure.py
Input analysis/output/rate_curve_structure/bars15.parquet (scripts/rate_curve/build_bars.py).
Output RESULTS.md + fig_*.png in the same folder."""
from __future__ import annotations
import warnings; warnings.filterwarnings("ignore")
import numpy as np, pandas as pd
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from scipy.stats import norm
from sklearn.linear_model import Ridge, LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import roc_auc_score, log_loss
from pathlib import Path

OUT = Path("analysis/output/rate_curve_structure"); B = pd.read_parquet(OUT / "bars15.parquet"); G = B.index
DAY = pd.Series(G.date, index=G); HOUR = G.hour.to_numpy(); rng = np.random.default_rng(20261011)
T = lambda s: pd.Timestamp(s, tz="UTC")
EXPL = np.asarray((G > T("2026-04-13")) & (G <= T("2026-07-18"))); CONF = np.asarray((G > T("2026-07-20")) & (G <= T("2026-10-10")))
Q = ["U6", "Z6", "H7", "M7", "U7"]; WS = {"1h": 4, "4h": 16}; HS = {"15m": 1, "1h": 4, "2h": 8, "4h": 16}
US = B[[f"S_{q}" for q in Q]].set_axis(Q, axis=1) * 100; EU = B[[f"E_{q}" for q in Q]].set_axis(Q, axis=1) * 100   # bp
NQ = B["NQ"]; L = []

def zprior(x, days=20):
    """x / RMS of x over the previous `days` trading days (the bar's own day excluded)."""
    daily = pd.Series(np.asarray(x) ** 2, index=G).groupby(DAY.values).mean()
    sd = np.sqrt(daily.rolling(days, min_periods=10).mean()).shift(1)
    return pd.Series(np.asarray(x) / DAY.map(sd).to_numpy(), index=G)

# ---------------- factors and move types ----------------
def factors(C, W):
    d = C - C.shift(W)
    f = pd.DataFrame({"level": d.mean(1), "slope": d["U7"] - d["U6"], "curv": 2 * d["H7"] - d["U6"] - d["U7"],
                      "front": d[["U6", "Z6"]].mean(1), "back": d[["M7", "U7"]].mean(1)})
    f["fshare"] = f.front.abs() / (f.front.abs() + f.back.abs())
    d1 = (C - C.shift(4)).mean(1); f["speed"] = (d1 / f.level).where(np.sign(d1) == np.sign(f.level)).clip(0, 1) if W > 4 else 1.0
    return f

CURVES = {"US": US, "EU": EU, "DIFF": US - EU}
F = {(c, w): factors(C, W) for c, C in CURVES.items() for w, W in WS.items()}
Z = {k: f[["level", "slope", "curv", "front", "back"]].apply(zprior) for k, f in F.items()}

def types(k):
    z, f = Z[k], F[k]; out = {}
    out["BROAD"] = np.sign(z.level) * ((z.level.abs() >= 2) & (z.slope.abs() < 1))
    out["FRONT"] = np.sign(z.front) * ((f.fshare >= 0.75) & (z.front.abs() >= 2))
    out["DEFERRED"] = np.sign(z.back) * ((f.fshare <= 0.25) & (z.back.abs() >= 2))
    out["STEEPEN"] = 1.0 * ((z.slope >= 2) & (z.level.abs() < 1)); out["FLATTEN"] = -1.0 * ((z.slope <= -2) & (z.level.abs() < 1))
    out["TWIST"] = np.sign(z.curv) * ((z.curv.abs() >= 2) & (z.level.abs() < 1) & (z.slope.abs() < 1))
    return pd.DataFrame(out).fillna(0.0)
TY = {k: types(k) for k in F}

# ---------------- targets ----------------
r1 = NQ.diff(); fwd = {h: (NQ.shift(-H) - NQ) for h, H in HS.items()}
def fwd_rv(H):
    s = (r1 ** 2)[::-1].rolling(H, min_periods=H).sum()[::-1].shift(-1); return np.sqrt(s)
def rel(x):
    """x / mean of x at the same hour over the previous 20 trading days."""
    t = pd.DataFrame({"x": x.to_numpy(), "d": DAY.values, "h": HOUR}).dropna()
    dh = t.groupby(["d", "h"]).x.mean().unstack("h"); base = dh.rolling(20, min_periods=10).mean().shift(1)
    m = base.stack(); key = pd.MultiIndex.from_arrays([DAY.values, HOUR]); return pd.Series(x.to_numpy() / m.reindex(key).to_numpy(), index=G)
RV = {h: rel(fwd_rv(H)) for h, H in HS.items()}
hi, lo = B["NQ_hi"], B["NQ_lo"]; phi, plo = hi.rolling(16, min_periods=12).max(), lo.rolling(16, min_periods=12).min()
def brk(H):
    fh = hi[::-1].rolling(H, min_periods=H).max()[::-1].shift(-1); fl = lo[::-1].rolling(H, min_periods=H).min()[::-1].shift(-1)
    return ((fh > phi) | (fl < plo)).astype(float).where(fh.notna() & phi.notna())
BK = {h: brk(H) for h, H in HS.items()}
TARGETS = {"ret": fwd, "relvol": RV, "breakout": BK}

# ---------------- test 1: event study ----------------
def pools(half, tgt):
    v = tgt.to_numpy(); ok = half & np.isfinite(v); return {h: v[ok & (HOUR == h)] for h in range(24)}, ok
def event_study(half, draws=1000, plant=None):
    rows = []
    P = {(t, h): pools(half, TARGETS[t][h]) for t in TARGETS for h in HS}
    for (c, w), ty in TY.items():
        for name in ty.columns:
            s = ty[name].to_numpy()
            for t in TARGETS:
                for h in HS:
                    pool, ok = P[(t, h)]; ev = ok & (s != 0) & half; n = int(ev.sum())
                    if n < 20: rows.append(dict(type=name, curve=c, W=w, target=t, H=h, n=n)); continue
                    v = TARGETS[t][h].to_numpy()[ev]; sg = s[ev] if t == "ret" else np.ones(n)
                    y = sg * v
                    if plant and plant[0] == (name, c, w, t, h): y = y + plant[1] if t != "relvol" else y * plant[1]
                    obs = y.mean(); hrs = HOUR[ev]
                    sim = np.empty((n, draws))
                    for i, (hh, g) in enumerate(zip(hrs, sg)): sim[i] = g * rng.choice(pool[hh], draws)
                    m = sim.mean(0); p = 2 * min((m >= obs).mean(), (m <= obs).mean()) + 1e-3
                    rows.append(dict(type=name, curve=c, W=w, target=t, H=h, n=n, obs=obs, base=np.median(m), lo=np.percentile(m, 2.5), hi=np.percentile(m, 97.5), p=min(p, 1.0)))
    return pd.DataFrame(rows)
def bh(p, q=0.10):
    p = np.asarray(p, float); ok = np.isfinite(p); out = np.zeros(len(p), bool)
    if not ok.any(): return out
    ps = p[ok]; o = np.argsort(ps); m = len(ps); k = np.where(ps[o] <= q * np.arange(1, m + 1) / m)[0]
    if len(k): out[np.where(ok)[0][o[:k.max() + 1]]] = True
    return out

L += ["# RATE-CURVE-STRUCTURE results", "", "Run once per forge/RATE_CURVE_STRUCTURE_PREREG.md. 15-min bars, Apr 13 – Oct 9 2026; explore to Jul 17, confirm from Jul 20.", ""]
# event counts
cnt = pd.DataFrame({f"{c} {w}": {n: int((ty[n] != 0)[EXPL].sum()) for n in ty.columns} for (c, w), ty in TY.items()})
cnt_c = pd.DataFrame({f"{c} {w}": {n: int((ty[n] != 0)[CONF].sum()) for n in ty.columns} for (c, w), ty in TY.items()})
L += ["## How often each repricing type fires (bars; explore / confirm)", "", (cnt.astype(str) + " / " + cnt_c.astype(str)).to_markdown(), ""]
fig, ax = plt.subplots(figsize=(10, 4)); (cnt + cnt_c).T.plot.bar(ax=ax); ax.set_ylabel("bars fired, Apr–Oct"); ax.set_title("Repricing types across curves and windows"); plt.tight_layout(); plt.savefig(OUT / "fig1_type_counts.png", dpi=100); plt.close()

# power first
L += ["## Power (planted into BROAD / US / 4h / H=1h, explore; detected = survives BH-FDR 10% in its 144-cell family)", "", "| target | planted | detected |", "|---|---|---|"]
base_e = event_study(EXPL, draws=300)
for t, pl in (("ret", 0.0005), ("ret", 0.0010), ("relvol", 1.10), ("breakout", 0.05)):
    df = event_study(EXPL, draws=300, plant=((("BROAD", "US", "4h", t, "1h")), pl))
    fam = df[df.target == t]; det = bh(fam.p)[(fam.type == "BROAD") & (fam.curve == "US") & (fam.W == "4h") & (fam.H == "1h")]
    L.append(f"| {t} | {pl} | {'yes' if det.any() else 'no'} |")
L.append("")

E = event_study(EXPL); C_ = event_study(CONF)
E.to_csv(OUT / "events_explore.csv", index=False); C_.to_csv(OUT / "events_confirm.csv", index=False)
E["fdr"] = False
for t in TARGETS:
    m = E.target == t; E.loc[m, "fdr"] = bh(E.loc[m, "p"])
L += ["## Test 1 — conditional outcomes after each repricing type (event study vs hour-matched random bars)", ""]
surv = []
for t in TARGETS:
    fam = E[(E.target == t) & E.fdr]
    L.append(f"**{t}**: {len(fam)} of {int((E.target == t).sum())} cells pass BH-FDR 10% in explore.")
    for _, r in fam.iterrows():
        c = C_[(C_.type == r.type) & (C_.curve == r.curve) & (C_.W == r.W) & (C_.target == t) & (C_.H == r.H)].iloc[0]
        sign = np.sign(r.obs - r.base); ok = np.isfinite(c.get("obs", np.nan)) and sign * (c.obs - c.base) > 0 and c.p / 2 < 0.05
        surv.append(dict(type=r.type, curve=r.curve, W=r.W, target=t, H=r.H, n_e=r.n, obs_e=r.obs, base_e=r.base, n_c=c.n, obs_c=c.get("obs", np.nan), base_c=c.get("base", np.nan), p_c=c.get("p", np.nan), confirmed=bool(ok)))
L.append("")
S = pd.DataFrame(surv)
if len(S):
    L += ["Explore survivors and their confirm result (sign fixed from explore, one-sided 5%):", "", S.round(4).to_markdown(index=False), ""]
    L.append(f"**Confirmed: {int(S.confirmed.sum())} of {len(S)}.**")
else:
    L.append("No cell survives explore, so nothing is carried to confirm.")
L.append("")
def heat(df, t, h, title, path):
    pv = (df[(df.target == t) & (df.H == h)].assign(d=lambda x: x.obs - x.base).pivot_table(index="type", columns=["curve", "W"], values="d"))
    fig, ax = plt.subplots(figsize=(9, 3.6)); v = np.nanmax(np.abs(pv.to_numpy())) or 1
    im = ax.imshow(pv.to_numpy(), cmap="RdBu_r", vmin=-v, vmax=v, aspect="auto"); ax.set_xticks(range(pv.shape[1])); ax.set_xticklabels([f"{a} {b}" for a, b in pv.columns], rotation=45, fontsize=8)
    ax.set_yticks(range(pv.shape[0])); ax.set_yticklabels(pv.index, fontsize=8)
    for i in range(pv.shape[0]):
        for j in range(pv.shape[1]):
            x = pv.to_numpy()[i, j]
            if np.isfinite(x): ax.text(j, i, f"{x:+.3f}" if t != "breakout" else f"{x:+.2f}", ha="center", va="center", fontsize=7)
    ax.set_title(title, fontsize=9); plt.colorbar(im, ax=ax); plt.tight_layout(); plt.savefig(path, dpi=100); plt.close()
for t, lab in (("ret", "signed Nasdaq return minus baseline"), ("relvol", "relative realised vol minus baseline"), ("breakout", "breakout rate minus baseline")):
    heat(E, t, "1h", f"EXPLORE, H=1h: {lab}", OUT / f"fig2_{t}_explore_1h.png"); heat(C_, t, "1h", f"CONFIRM, H=1h: {lab}", OUT / f"fig2_{t}_confirm_1h.png")
    heat(E, t, "4h", f"EXPLORE, H=4h: {lab}", OUT / f"fig2_{t}_explore_4h.png"); heat(C_, t, "4h", f"CONFIRM, H=4h: {lab}", OUT / f"fig2_{t}_confirm_4h.png")
# full explore / confirm tables at H=1h and 4h for the record
for h in ("1h", "4h"):
    for t in TARGETS:
        pe = E[(E.target == t) & (E.H == h)].assign(d=lambda x: x.obs - x.base).pivot_table(index="type", columns=["curve", "W"], values="d").round(4)
        pc = C_[(C_.target == t) & (C_.H == h)].assign(d=lambda x: x.obs - x.base).pivot_table(index="type", columns=["curve", "W"], values="d").round(4)
        L += [f"<details><summary>{t}, H={h}: effect minus baseline, explore / confirm</summary>", "", pe.to_markdown(), "", pc.to_markdown(), "", "</details>", ""]

# ---------------- test 2: lead times ----------------
def clustered(x, y, half):
    ok = half & np.isfinite(x) & np.isfinite(y)
    if ok.sum() < 200: return np.nan, np.nan
    xs = (x[ok] - x[ok].mean()) / x[ok].std(); ys = (y[ok] - y[ok].mean()) / y[ok].std()
    p = pd.Series(xs * ys, index=DAY.values[ok]).groupby(level=0).sum(); return float(np.mean(xs * ys)), float(p.sum() / np.sqrt((p ** 2).sum()))
L += ["## Test 2 — lead times", "", "Correlation of each factor's 15-min change (bar t) with Nasdaq's 15-min return at bar t+k, day-clustered t in brackets; k=0 is the same bar.", ""]
fig, axs = plt.subplots(3, 3, figsize=(14, 9), sharex=True)
lead_rows = []
for i, c in enumerate(CURVES):
    f1 = factors(CURVES[c], 1)
    for j, fac in enumerate(("level", "slope", "curv")):
        x = f1[fac].to_numpy(); ax = axs[i, j]
        for half, lab, col in ((EXPL, "explore", "tab:blue"), (CONF, "confirm", "tab:orange")):
            cs, ts = [], []
            for k in range(0, 17):
                y = r1.shift(-k).to_numpy(); r_, t_ = clustered(x, y, half); cs.append(r_); ts.append(t_)
            ax.plot(range(17), cs, marker="o", ms=3, color=col, label=lab)
            lead_rows.append(dict(curve=c, factor=fac, half=lab, same_bar=f"{cs[0]:+.3f} [{ts[0]:+.1f}]", **{f"k{k}": f"{cs[k]:+.3f} [{ts[k]:+.1f}]" for k in (1, 2, 4, 8, 16)}))
        ax.axhline(0, color="k", lw=0.5); ax.set_title(f"{c} {fac}", fontsize=9)
axs[0, 0].legend(fontsize=8); axs[2, 1].set_xlabel("lead k (15-min bars)"); plt.suptitle("Factor change at t vs Nasdaq return at t+k"); plt.tight_layout(); plt.savefig(OUT / "fig4_leads.png", dpi=100); plt.close()
L += [pd.DataFrame(lead_rows).to_markdown(index=False), ""]
# event timing: cumulative |move| after BROAD/FRONT/DEFERRED US 4h vs matched baseline
L += ["After an event, when does Nasdaq's cumulative |move| leave its matched baseline? (first of 16 bars where the ratio to baseline is outside the 95% band; '—' = never)", ""]
tim = []
for (c, w), ty in TY.items():
    if w != "4h": continue
    for name in ty.columns:
        s = ty[name].to_numpy()
        for half, lab in ((EXPL, "explore"), (CONF, "confirm")):
            ev = half & (s != 0) & np.isfinite(NQ.to_numpy()); idx = np.where(ev)[0]
            if len(idx) < 30: tim.append(dict(type=name, curve=c, half=lab, n=len(idx), first_bar="n<30")); continue
            nqv = NQ.to_numpy(); cum = np.array([[abs(nqv[i + k] - nqv[i]) if i + k < len(nqv) else np.nan for k in range(1, 17)] for i in idx])
            pool = np.where(half & np.isfinite(nqv))[0]; sims = []
            for _ in range(200):
                js = np.array([rng.choice(pool[HOUR[pool] == HOUR[i]]) for i in idx])
                sims.append(np.nanmean([[abs(nqv[j + k] - nqv[j]) if j + k < len(nqv) else np.nan for k in range(1, 17)] for j in js], 0))
            sims = np.array(sims); o = np.nanmean(cum, 0); lo_, hi_ = np.percentile(sims, 2.5, 0), np.percentile(sims, 97.5, 0)
            out = np.where((o > hi_) | (o < lo_))[0]; tim.append(dict(type=name, curve=c, half=lab, n=len(idx), first_bar=(int(out[0]) + 1) if len(out) else "—", ratio_4h=round(float(o[15] / np.median(sims[:, 15])), 2)))
L += [pd.DataFrame(tim).to_markdown(index=False), ""]

# ---------------- test 3: nested OOS feature sets ----------------
L += ["## Test 3 — does the curve STRUCTURE add out-of-sample skill beyond Nasdaq-only, a single contract and two-contract spreads?", ""]
X = pd.DataFrame(index=G)
X["ret1h"] = NQ - NQ.shift(4); X["ret4h"] = NQ - NQ.shift(16)
X["trv"] = rel(np.sqrt((r1 ** 2).rolling(16).sum())); X["hs"], X["hc"] = np.sin(2 * np.pi * HOUR / 24), np.cos(2 * np.pi * HOUR / 24)
X["sess_ldn"] = ((HOUR >= 7) & (HOUR < 13)).astype(float); X["sess_us"] = ((HOUR >= 13) & (HOUR < 21)).astype(float)
A_COLS = list(X.columns)
single = {f"{c}_{q}_{w}": (CC[q] - CC[q].shift(W)) for c, CC in (("US", US), ("EU", EU)) for q in Q for w, W in WS.items()}
for k, v in single.items(): X[k] = zprior(v)
spread_cols = {}
for w, W in WS.items():
    X[f"pair_{w}"] = zprior((US["U6"] - EU["U6"]) - (US["U6"] - EU["U6"]).shift(W)); X[f"usslope_{w}"] = Z[("US", w)].slope; spread_cols.update({f"pair_{w}": 1, f"usslope_{w}": 1})
D_COLS = []
for (c, w), z in Z.items():
    for fac in ("level", "slope", "curv"): X[f"{c}_{fac}_{w}"] = z[fac]; D_COLS.append(f"{c}_{fac}_{w}")
    X[f"{c}_fshare_{w}"] = F[(c, w)].fshare; D_COLS.append(f"{c}_fshare_{w}")
    if w == "4h": X[f"{c}_speed_{w}"] = F[(c, w)].speed; D_COLS.append(f"{c}_speed_{w}")
    for name in TY[(c, w)].columns: X[f"{c}_{name}_{w}"] = TY[(c, w)][name]; D_COLS.append(f"{c}_{name}_{w}")
X = X.replace([np.inf, -np.inf], np.nan)

def fit_score(cols, target, kind, train, test):
    y = target.to_numpy(); ok_tr = train & np.isfinite(y) & X[cols].notna().all(1).to_numpy(); ok_te = test & np.isfinite(y) & X[cols].notna().all(1).to_numpy()
    sc = StandardScaler().fit(X.loc[ok_tr, cols]); Xtr, Xte = sc.transform(X.loc[ok_tr, cols]), sc.transform(X.loc[ok_te, cols])
    if kind == "ridge":
        m = Ridge(alpha=10.0).fit(Xtr, y[ok_tr]); pred = m.predict(Xte); mu = y[ok_tr].mean()
        return pd.Series(pred, index=G[ok_te]), pd.Series(y[ok_te], index=G[ok_te]), mu
    m = LogisticRegression(C=0.1, max_iter=500).fit(Xtr, y[ok_tr]); pred = m.predict_proba(Xte)[:, 1]
    return pd.Series(pred, index=G[ok_te]), pd.Series(y[ok_te], index=G[ok_te]), y[ok_tr].mean()
def r2(pred, y, mu): return 1 - ((y - pred) ** 2).sum() / ((y - mu) ** 2).sum()
def skill_ci(pa, pd_, y, mu, kind, draws=500):
    days = pd.Series(y.index.date, index=y.index); ud = days.unique(); diffs = []
    for _ in range(draws):
        pick = rng.choice(ud, len(ud)); idx = np.concatenate([np.where(days.values == d)[0] for d in pick])
        if kind == "ridge": diffs.append(r2(pd_.iloc[idx], y.iloc[idx], mu) - r2(pa.iloc[idx], y.iloc[idx], mu))
        else:
            if y.iloc[idx].nunique() < 2: continue
            diffs.append(roc_auc_score(y.iloc[idx], pd_.iloc[idx]) - roc_auc_score(y.iloc[idx], pa.iloc[idx]))
    return np.percentile(diffs, [2.5, 97.5])
# (b): single best contract chosen on EXPLORE (in-sample R2 added to (a) for 1h return), then fixed
best, bestv = None, -9
for k in single:
    pa, ya, mu = fit_score(A_COLS + [k], fwd["1h"], "ridge", EXPL, EXPL); v = r2(pa, ya, mu)
    if v > bestv: best, bestv = k, v
B_COLS = A_COLS + [best]; C_COLS = B_COLS + list(spread_cols); DD_COLS = C_COLS + D_COLS
L += [f"Feature sets: (a) Nasdaq-only {len(A_COLS)} features; (b) + single contract **{best}** (best on explore); (c) + pair SOFR U6 − €STR U6 and US slope (1h, 4h); (d) + full curve structure, {len(D_COLS)} more features. Ridge (α=10) for return and log relative vol; logistic (C=0.1) for breakout. Fit on explore, scored on confirm.", ""]
rows = []
for t, kind in (("ret", "ridge"), ("relvol", "ridge"), ("breakout", "logit")):
    for h in ("1h", "4h"):
        tgt = TARGETS[t][h] if t != "relvol" else np.log(TARGETS[t][h])
        res = {}
        for lab, cols in (("a", A_COLS), ("b", B_COLS), ("c", C_COLS), ("d", DD_COLS)):
            res[lab] = fit_score(cols, tgt, kind, EXPL, CONF)
        pa, ya, mu = res["a"]; row = dict(target=t, H=h)
        for lab in "abcd":
            p, y, _ = res[lab]; y = y.reindex(pa.index); p = p.reindex(pa.index); okk = p.notna() & y.notna()
            row[lab] = r2(p[okk], y[okk], mu) if kind == "ridge" else roc_auc_score(y[okk], p[okk])
            if lab != "a": lo_, hi_ = skill_ci(pa[okk], p[okk], y[okk], mu, kind, 300); row[f"{lab}-a 95%"] = f"[{lo_:+.4f}, {hi_:+.4f}]"
        rows.append(row)
SK = pd.DataFrame(rows); L += ["Out-of-sample skill on confirm (R² for return / log relvol, AUC for breakout); intervals = day-block bootstrap of the difference vs (a):", "", SK.round(4).to_markdown(index=False), ""]
SK.to_csv(OUT / "oos_skill.csv", index=False)
fig, ax = plt.subplots(1, 2, figsize=(12, 4))
for i, (kind_t, lab) in enumerate((("ridge", "R² (return, log relvol)"), ("logit", "AUC (breakout)"))):
    sub = SK[SK.target.isin(["ret", "relvol"] if kind_t == "ridge" else ["breakout"])]; sub.set_index(sub.target + " " + sub.H)[list("abcd")].plot.bar(ax=ax[i]); ax[i].set_ylabel(lab); ax[i].axhline(0 if kind_t == "ridge" else 0.5, color="k", lw=0.5)
plt.suptitle("Confirm-half skill by nested feature set: a Nasdaq-only, b +contract, c +spreads, d +curve structure"); plt.tight_layout(); plt.savefig(OUT / "fig5_oos_skill.png", dpi=100); plt.close()
# walk-forward monthly refits (a) vs (d)
wf = []
months = pd.period_range("2026-06", "2026-10", freq="M")
for t, kind in (("ret", "ridge"), ("relvol", "ridge"), ("breakout", "logit")):
    tgt = TARGETS[t]["1h"] if t != "relvol" else np.log(TARGETS[t]["1h"]); PA, PD, Y = [], [], []
    for mth in months:
        tr = np.asarray(G < T(str(mth.start_time.date()))) & np.asarray(G > T("2026-04-13")); te = np.asarray((G >= T(str(mth.start_time.date()))) & (G < T(str((mth + 1).start_time.date()))))
        if te.sum() == 0 or tr.sum() < 500: continue
        pa, ya, mu = fit_score(A_COLS, tgt, kind, tr, te); pdd, _, _ = fit_score(DD_COLS, tgt, kind, tr, te); pdd = pdd.reindex(pa.index)
        PA.append(pa); PD.append(pdd); Y.append(ya)
    PA, PD, Y = pd.concat(PA), pd.concat(PD), pd.concat(Y); okk = PD.notna()
    mu = Y.mean(); wf.append(dict(target=t, H="1h", a=r2(PA[okk], Y[okk], mu) if kind == "ridge" else roc_auc_score(Y[okk], PA[okk]), d=r2(PD[okk], Y[okk], mu) if kind == "ridge" else roc_auc_score(Y[okk], PD[okk]), n=int(okk.sum())))
L += ["Walk-forward check (refit each month Jun–Oct on all prior data, H=1h):", "", pd.DataFrame(wf).round(4).to_markdown(index=False), ""]

# ---------------- test 4: regimes ----------------
L += ["## Test 4 — stability across regimes (H=1h, W=4h)", ""]
sr = pd.Series((r1 * factors(US, 1).level).groupby(DAY.values).mean(), name="c").rolling(20, min_periods=10).mean().shift(1)
regime_sr = np.where(DAY.map(sr).to_numpy() < 0, "stocks-vs-rates OPPOSITE", "TOGETHER")
tv = X["trv"]; terc = np.nanpercentile(tv[EXPL], [33, 67]); regime_vol = np.where(tv < terc[0], "low vol", np.where(tv < terc[1], "mid vol", "high vol"))
regime_sess = np.where(HOUR < 7, "Asia", np.where(HOUR < 13, "London", np.where(HOUR < 21, "US", "late")))
reg_rows = []
for rname, R in (("stock-rates sign", regime_sr), ("Nasdaq vol tercile", regime_vol), ("session", regime_sess)):
    for rv in pd.unique(R):
        if rv in ("late",): continue
        for (c, w), ty in TY.items():
            if w != "4h": continue
            for name in ty.columns:
                s = ty[name].to_numpy(); out = dict(regime=f"{rname}: {rv}", type=name, curve=c)
                for t in ("ret", "breakout"):
                    for half, lab in ((EXPL, "E"), (CONF, "C")):
                        v = TARGETS[t]["1h"].to_numpy(); ev = half & (R == rv) & (s != 0) & np.isfinite(v)
                        base_ok = half & (R == rv) & np.isfinite(v)
                        if ev.sum() < 15: out[f"{t}_{lab}"] = np.nan; continue
                        val = (s[ev] * v[ev]).mean() if t == "ret" else v[ev].mean() - v[base_ok].mean(); out[f"{t}_{lab}"] = val; out[f"n_{lab}"] = int(ev.sum())
                reg_rows.append(out)
RG = pd.DataFrame(reg_rows)
RG["ret_stable"] = np.sign(RG.ret_E) == np.sign(RG.ret_C); RG["brk_stable"] = np.sign(RG.breakout_E) == np.sign(RG.breakout_C)
RG.to_csv(OUT / "regimes.csv", index=False)
stab = RG.dropna(subset=["ret_E", "ret_C"]).groupby("regime").agg(cells=("type", "size"), ret_same_sign=("ret_stable", "mean"), brk_same_sign=("brk_stable", "mean")).round(2)
L += ["Share of (type × curve) cells whose explore and confirm effects have the SAME sign, by regime (0.5 = coin flip):", "", stab.to_markdown(), ""]
big = RG.dropna(subset=["ret_E", "ret_C"]).assign(absE=lambda d: d.ret_E.abs()).sort_values("absE", ascending=False).head(12)
L += ["Largest explore effects by regime and what confirm did with them (signed 1h return after the event, %):", "", big.assign(ret_E=lambda d: d.ret_E * 100, ret_C=lambda d: d.ret_C * 100)[["regime", "type", "curve", "n_E", "ret_E", "n_C", "ret_C", "ret_stable"]].round(3).to_markdown(index=False), ""]
fig, ax = plt.subplots(figsize=(8, 4)); stab[["ret_same_sign", "brk_same_sign"]].plot.barh(ax=ax); ax.axvline(0.5, color="k", lw=0.5); ax.set_xlim(0, 1); ax.set_title("Sign stability explore→confirm by regime"); plt.tight_layout(); plt.savefig(OUT / "fig6_regimes.png", dpi=100); plt.close()

(OUT / "RESULTS.md").write_text("\n".join(L), encoding="utf-8"); print("written", OUT / "RESULTS.md")   # console is cp1252
