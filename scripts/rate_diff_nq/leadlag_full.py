"""Full lead-lag investigation: US-EU rate differential vs Nasdaq (owner brief 2026-10-09; plan: plans/RATE_DIFF_NQ_LEADLAG_PLAN.md).

Discovers rather than imposes: every series x timeframe x lag is estimated and reported; nothing is chosen for being the
strongest in-sample. Discipline:
  * autocorrelation: every t-statistic is day-clustered (per-day sums), regressions use Newey-West HAC errors;
  * non-stationarity: levels are tested (ADF); only stationary transforms (changes, deviations from a rolling mean, the
    rolling-beta gap) enter regressions;
  * multiple testing: Benjamini-Hochberg FDR across each family, and a family-wise max-|t| null from day-shifted
    (scrambled) rate series;
  * out-of-sample: estimated on EXPLORE (2026-04-10 .. 06-30), judged on CONFIRM (07-01 .. 10-08) with the same sign.

Series (rate terms, bp; + = higher rates priced): 2y yield spread US - DE (CBOT ZT vs Eurex Schatz futures, smooth) and its
legs; STIR differentials (SOFR Dec'26 - Euribor Dec'26; C.OG's SOFR Sep'26 - ESTR Sep'26 where 1-min data exists).
Nasdaq: NQ futures 1-min mid (front: M6 -> U6 -> Z6).

    python scripts/rate_diff_nq/leadlag_full.py
Output: analysis/output/rate_diff_nq/full/ (RESULTS.md, results.json, heatmap_*.png)
"""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import statsmodels.api as sm  # noqa: E402
from statsmodels.tsa.stattools import adfuller  # noqa: E402

D1 = Path("analysis/output/stir_1m")
OUT = Path("analysis/output/rate_diff_nq/full")
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(20261009)
SPLIT = pd.Timestamp("2026-07-01")
TFS = [1, 5, 15, 30, 60]
LAGS = list(range(-12, 13))
N_SCR = 60


def load(name):
    p = D1 / f"{name}.parquet"
    if not p.exists():
        return None
    d = pd.read_parquet(p)
    return pd.Series(d.close.to_numpy(float), index=pd.to_datetime(d.time).dt.tz_localize(None)).sort_index()


def find(prefix_options, month):
    """Eurex local symbols carry the expiry date ('FGBS 20261208 M'), CME/CBOT ones the month code ('ZTZ6')."""
    tokens = {"U6": ("U6", "202609"), "Z6": ("Z6", "202612")}[month]
    for pre in prefix_options:
        for p in sorted(D1.glob(f"{pre}*.parquet")):
            if any(t in p.stem for t in tokens):
                return p.stem
    return None


# ── grid and series ────────────────────────────────────────────────────────────────────────────────────────────────
nq_parts = [("CME_NQM6", None, "2026-06-11"), ("CME_NQU6", "2026-06-11", "2026-09-10"), ("CME_NQZ6", "2026-09-10", None)]
first = min(load(n).index[0] for n, _, _ in nq_parts if load(n) is not None)
last = max(load(n).index[-1] for n, _, _ in nq_parts if load(n) is not None)
grid = pd.date_range(max(first, pd.Timestamp("2026-04-10")).ceil("1min"), last, freq="1min")
grid = grid[grid.dayofweek < 5]


def stitched(parts, conv):
    """1-min change series stitched across contracts (changes only within one contract)."""
    out = pd.Series(np.nan, index=grid)
    for name, a, b in parts:
        s = load(name) if name else None
        if s is None:
            continue
        x = s.reindex(grid)
        ch = conv(x).where(x.notna() & x.shift(1).notna())
        m = np.ones(len(grid), bool)
        if a:
            m &= grid >= pd.Timestamp(a)
        if b:
            m &= grid < pd.Timestamp(b)
        out[m] = ch[m]
    return out


pct = lambda x: np.log(x).diff() * 100                          # % return
stir_bp = lambda x: -x.diff() * 100                              # STIR futures price -> rate change, bp
bond_bp = lambda x: -np.log(x).diff() / 1.9 * 1e4                # 2y bond futures -> yield change, bp (duration ~1.9)

NQ = stitched(nq_parts, pct)
ROLL = "2026-08-28"
zt = [("CBOT_ZTU6", None, ROLL), ("CBOT_ZTZ6", ROLL, None)]
gbs_u, gbs_z = find(["EUREX_GBS", "EUREX_FGBS", "EUREX_"], "U6"), find(["EUREX_GBS", "EUREX_FGBS", "EUREX_"], "Z6")
SERIES = {}
us2 = stitched(zt, bond_bp)
de2 = stitched([(gbs_u, None, ROLL), (gbs_z, ROLL, None)], bond_bp) if (gbs_u or gbs_z) else None
if us2.notna().sum() > 1000:
    SERIES["US 2y"] = us2
if de2 is not None and de2.notna().sum() > 1000:
    SERIES["DE 2y"] = de2
    SERIES["2y spread US-DE"] = us2 - de2
sz, iz = stitched([("CME_SR3Z6", None, None)], stir_bp), stitched([("ICEEU_IZ6", None, None)], stir_bp)
SERIES["STIR Dec26 US-EU"] = sz - iz
u6, er = stitched([("CME_SR3U6", None, None)], stir_bp), stitched([("ICEEU_ER3U6", None, None)], stir_bp)
if (u6 - er).notna().sum() > 2000:
    SERIES["C.OG pair U6-ER3"] = u6 - er
PRIMARY = "2y spread US-DE" if "2y spread US-DE" in SERIES else "STIR Dec26 US-EU"

lon = grid.tz_localize("UTC").tz_convert("Europe/London")
hm = (lon.hour * 60 + lon.minute).to_numpy()
day = grid.normalize()
explore = grid < SPLIT


def agg(s, k):
    if k == 1:
        return s
    g = pd.Series(s.to_numpy(), index=np.arange(len(s)) // k)
    tot = g.groupby(level=0).sum(min_count=max(1, int(0.8 * k)))
    return pd.Series(tot.to_numpy(), index=grid[::k][:len(tot)])


def lagged(x, k):
    """x shifted so position t holds x[t-k] (k>0: the past; rates-first when x is the rate)."""
    v = np.roll(x, k).astype(float)
    if k > 0:
        v[:k] = np.nan
    elif k < 0:
        v[k:] = np.nan
    return v


def day_t(x, y, dy):
    """correlation and day-clustered t of corr(x, y)."""
    ok = np.isfinite(x) & np.isfinite(y)
    if ok.sum() < 200:
        return np.nan, np.nan, int(ok.sum())
    x, y, dy = x[ok], y[ok], dy[ok]
    xz, yz = (x - x.mean()) / x.std(), (y - y.mean()) / y.std()
    s = pd.Series(xz * yz).groupby(dy).sum()
    nd = len(s)
    t = s.mean() / s.std(ddof=1) * np.sqrt(nd) if nd > 5 else np.nan
    return float((xz * yz).mean()), float(t), int(ok.sum())


def bh(p):
    p = np.asarray(p, float)
    o = np.argsort(p)
    q = np.empty(len(p))
    run = 1.0
    for i in range(len(p) - 1, -1, -1):
        run = min(run, p[o[i]] * len(p) / (i + 1))
        q[o[i]] = run
    return q


from scipy.stats import norm  # noqa: E402
pval = lambda t: 2 * (1 - norm.cdf(abs(t))) if np.isfinite(t) else 1.0

res = {"grid": [str(grid[0]), str(grid[-1])], "split": str(SPLIT.date()), "series": list(SERIES), "primary": PRIMARY,
       "minutes_with_data": {k: int(v.notna().sum()) for k, v in SERIES.items()} | {"NQ": int(NQ.notna().sum())},
       "share_minutes_rate_moved": {k: round(float((v[v.notna()] != 0).mean()), 3) for k, v in SERIES.items()}}

# ── A. cross-correlogram grid: series x timeframe x lag, explore and confirm ─────────────────────────────────────────
rows = []
cache = {}
for sname, s in SERIES.items():
    for k in TFS:
        x, y = agg(s, k), agg(NQ, k)
        cache[(sname, k)] = (x, y)
        dd = x.index.normalize().to_numpy()
        ex = x.index < SPLIT
        for L in LAGS:
            xl = lagged(x.to_numpy(float), L)
            for per, m in (("explore", ex), ("confirm", ~ex)):
                c, t, n = day_t(np.where(m, xl, np.nan), y.to_numpy(float), dd)
                rows.append({"series": sname, "tf": k, "lag": L, "period": per, "corr": c, "t": t, "n": n, "p": pval(t)})
    print("A done", sname, flush=True)
A = pd.DataFrame(rows)
for per in ("explore", "confirm"):
    m = A.period == per
    A.loc[m, "q"] = bh(A.loc[m, "p"].to_numpy())

# family-wise null for the explore grid (lags != 0): day-shift every rate series, max |t|
scr = []
for i in range(N_SCR):
    mx = 0.0
    for (sname, k), (x, y) in cache.items():
        nd = len(np.unique(x.index.normalize()))
        per_day = int(round(len(x) / nd))
        xs = np.roll(x.to_numpy(float), int(rng.integers(3, max(nd - 3, 4))) * per_day)
        dd = x.index.normalize().to_numpy()
        ex = (x.index < SPLIT)
        for L in [l for l in LAGS if l != 0]:
            _, t, _ = day_t(np.where(ex, lagged(xs, L), np.nan), y.to_numpy(float), dd)
            if np.isfinite(t):
                mx = max(mx, abs(t))
    scr.append(mx)
FW = float(np.percentile(scr, 95))
res["A_familywise_t95"] = round(FW, 2)

E = A[A.period == "explore"].set_index(["series", "tf", "lag"])
C = A[A.period == "confirm"].set_index(["series", "tf", "lag"])
J = E[["corr", "t", "n", "q"]].join(C[["corr", "t", "n", "q"]], lsuffix="_e", rsuffix="_c")
J["fdr_explore"] = J.q_e < 0.05
J["fw_explore"] = J.t_e.abs() > FW
J["replicates"] = J.fdr_explore & (np.sign(J.corr_e) == np.sign(J.corr_c)) & (J.t_c.abs() > 1.96)
J.reset_index().to_csv(OUT / "crosscorr_grid.csv", index=False, float_format="%.4f")
nonzero = J.reset_index()
nonzero = nonzero[nonzero.lag != 0]
res["A_summary"] = {"cells_nonzero_lag": int(len(nonzero)), "fdr_sig_explore": int(nonzero.fdr_explore.sum()),
                    "beyond_familywise": int(nonzero.fw_explore.sum()), "replicated_in_confirm": int(nonzero.replicates.sum()),
                    "replicated_cells": nonzero[nonzero.replicates][["series", "tf", "lag", "corr_e", "corr_c", "t_e", "t_c"]].round(4).to_dict("records")}
print("A summary", res["A_summary"]["fdr_sig_explore"], res["A_summary"]["replicated_in_confirm"], flush=True)

# ── heatmaps ────────────────────────────────────────────────────────────────────────────────────────────────────────
for sname in SERIES:
    fig, axes = plt.subplots(1, 2, figsize=(15, 3.6), sharey=True)
    for ax, per in zip(axes, ("explore", "confirm")):
        sub = A[(A.series == sname) & (A.period == per)].pivot(index="tf", columns="lag", values="corr").reindex(TFS)
        tt = A[(A.series == sname) & (A.period == per)].pivot(index="tf", columns="lag", values="t").reindex(TFS)
        nn = A[(A.series == sname) & (A.period == per) & (A.lag == 0)].set_index("tf").n.reindex(TFS)
        lim = max(0.05, np.nanmax(np.abs(sub.drop(columns=0).to_numpy())) * 1.1)
        im = ax.imshow(sub.to_numpy(), cmap="RdBu_r", vmin=-lim, vmax=lim, aspect="auto")
        for i in range(len(TFS)):
            for j, L in enumerate(sub.columns):
                t = tt.iloc[i, j]
                if L == 0:
                    ax.text(j, i, f"{sub.iloc[i, j]:+.2f}", ha="center", va="center", fontsize=6, color="black")
                elif np.isfinite(t) and abs(t) > 1.96:
                    ax.text(j, i, "*" if abs(t) < FW else "**", ha="center", va="center", fontsize=9, color="black")
        ax.set_xticks(range(len(sub.columns)), [str(c) for c in sub.columns], fontsize=7)
        ax.set_yticks(range(len(TFS)), [f"{k}m (n {int(nn.get(k, 0)):,})" for k in TFS], fontsize=7)
        ax.set_title(f"{sname} — {per} ({'Apr-Jun' if per == 'explore' else 'Jul-Oct'}). Lag > 0: rate moved first", fontsize=8)
        ax.axvline(list(sub.columns).index(0), color="k", lw=0.5)
        fig.colorbar(im, ax=ax, fraction=0.025, pad=0.01).ax.tick_params(labelsize=6)
    fig.text(0.01, 0.01, f"Cell = corr(rate change at t-lag, NQ return at t). * |t|>1.96 day-clustered; ** beyond the family-wise scrambled-day 95% (|t|>{FW:.2f}). Lag-0 colour scale clipped: same-bar value printed.", fontsize=6)
    fig.tight_layout(rect=(0, 0.04, 1, 1))
    fig.savefig(OUT / f"heatmap_{sname.replace(' ', '_').replace('/', '-')}.png", dpi=130)
    plt.close(fig)

# ── B. distributed-lag predictive regressions (both directions), HAC, in-sample F and out-of-sample R2 ───────────────
def dl_test(x, y, p, h, direction):
    """direction 'rate->nq': future h-bar NQ return on p lags of rate changes + p lags of NQ (Granger-type, multi-horizon).
    'nq->rate': future h-bar rate change on p lags of NQ + own lags. Fit on explore, OOS R2 on confirm vs own-lags only."""
    dep, oth = (y, x) if direction == "rate->nq" else (x, y)
    fut = pd.Series(dep.to_numpy(float)).rolling(h).sum().shift(-h).to_numpy()
    cols = {f"own{i}": lagged(dep.to_numpy(float), i - 1) for i in range(1, p + 1)}
    cols |= {f"oth{i}": lagged(oth.to_numpy(float), i - 1) for i in range(1, p + 1)}
    X = pd.DataFrame(cols, index=dep.index)
    ok = np.isfinite(fut) & X.notna().all(axis=1).to_numpy()
    ex = (dep.index < SPLIT)
    r = {"n_explore": int((ok & ex).sum()), "n_confirm": int((ok & ~ex).sum())}
    if r["n_explore"] < 300 or r["n_confirm"] < 300:
        return r
    Xe, ye = sm.add_constant(X[ok & ex]), fut[ok & ex]
    full = sm.OLS(ye, Xe).fit(cov_type="HAC", cov_kwds={"maxlags": max(h, p)})
    w = full.wald_test(" = 0, ".join(f"oth{i}" for i in range(1, p + 1)) + " = 0", scalar=True)
    r["F_explore"], r["p_explore"] = round(float(w.statistic), 3), float(w.pvalue)
    r["coef_sum"] = round(float(sum(full.params[f"oth{i}"] for i in range(1, p + 1))), 5)
    own = sm.OLS(ye, sm.add_constant(X[ok & ex][[f"own{i}" for i in range(1, p + 1)]])).fit()
    Xc = sm.add_constant(X[ok & ~ex], has_constant="add")
    yc = fut[ok & ~ex]
    e_full = yc - full.predict(Xc)
    e_own = yc - own.predict(sm.add_constant(X[ok & ~ex][[f"own{i}" for i in range(1, p + 1)]], has_constant="add"))
    r["oos_r2_gain_pct"] = round(float((1 - (e_full ** 2).sum() / (e_own ** 2).sum()) * 100), 4)
    return r


B = []
for sname in SERIES:
    for k in (1, 5, 15, 60):
        x, y = cache[(sname, k)]
        for h in (1, 3, 6, 12):
            for d in ("rate->nq", "nq->rate"):
                r = dl_test(x, y, 6, h, d)
                B.append({"series": sname, "tf": k, "h": h, "direction": d, **r})
    print("B done", sname, flush=True)
B = pd.DataFrame(B)
if "p_explore" in B:
    B["q_explore"] = np.nan
    m = B.p_explore.notna()
    B.loc[m, "q_explore"] = bh(B.loc[m, "p_explore"].to_numpy())
B.to_csv(OUT / "distributed_lag.csv", index=False, float_format="%.5f")

# ── C. levels: non-stationarity, and the rolling-beta gap (error-correction) ─────────────────────────────────────────
Cres = {}
for sname in SERIES:
    x15, y15 = cache[(sname, 15)]
    lvx, lvy = x15.fillna(0).cumsum(), y15.fillna(0).cumsum()
    dl = pd.DataFrame({"x": lvx, "y": lvy})[x15.notna() | y15.notna()]
    Cres[sname] = {"adf_p_rate_level": round(float(adfuller(dl.x.to_numpy()[::4], maxlag=10)[1]), 4),
                   "adf_p_nq_level": round(float(adfuller(dl.y.to_numpy()[::4], maxlag=10)[1]), 4)}
    # rolling 5-day beta of NQ level on rate level, gap = NQ - beta * rate (de-meaned in the window); does the gap
    # predict the next 1h / 4h of NQ, or of the rate (which side closes it)?
    W = 5 * 96
    cov = dl.x.rolling(W).cov(dl.y).shift(1)
    var = dl.x.rolling(W).var().shift(1)
    beta = cov / var
    gap = (dl.y - dl.y.rolling(W).mean().shift(1)) - beta * (dl.x - dl.x.rolling(W).mean().shift(1))
    gz = (gap - gap.rolling(W).mean().shift(1)) / gap.rolling(W).std().shift(1)
    Cres[sname]["adf_p_gap"] = round(float(adfuller(gap.dropna().to_numpy()[::4], maxlag=10)[1]), 4)
    for hz, hh in (("1h", 4), ("4h", 16)):
        fy = dl.y.shift(-hh) - dl.y
        fx = dl.x.shift(-hh) - dl.x
        dd = dl.index.normalize().to_numpy()
        for per, m in (("explore", dl.index < SPLIT), ("confirm", dl.index >= SPLIT)):
            for tgt, f in (("nq", fy), ("rate", fx)):
                c, t, n = day_t(np.where(m, gz.to_numpy(), np.nan), f.to_numpy(float), dd)
                Cres[sname][f"gap->{tgt} {hz} {per}"] = {"corr": round(c, 4) if np.isfinite(c) else None, "t": round(t, 2) if np.isfinite(t) else None, "n": n}
res["C_levels"] = Cres

# ── D. nonlinear, asymmetric, conditional (primary series, 5m and 15m; predictor = rate change over the last bar) ──────
Dres = []
for k in (5, 15):
    x, y = cache[(PRIMARY, k)]
    xv, yv = x.to_numpy(float), y.to_numpy(float)
    xl1 = lagged(xv, 1)
    fut3 = pd.Series(yv).rolling(3).sum().shift(-2).to_numpy()            # NQ over bars t .. t+2 after the rate bar t-1
    idx = x.index
    lonk = idx.tz_localize("UTC").tz_convert("Europe/London")
    hmk = (lonk.hour * 60 + lonk.minute).to_numpy()
    rv = pd.Series(np.abs(yv)).rolling(12).mean().shift(1).to_numpy()
    q1, q2 = np.nanpercentile(rv[idx < SPLIT], [33.3, 66.7])
    xsd = np.nanstd(xl1[idx < SPLIT])
    cond = {"all": np.ones(len(idx), bool),
            "rate up": xl1 > 0, "rate down": xl1 < 0, "large move |z|>2": np.abs(xl1) > 2 * xsd, "small move": (np.abs(xl1) <= 2 * xsd) & (xl1 != 0),
            "NQ vol low": rv <= q1, "NQ vol mid": (rv > q1) & (rv <= q2), "NQ vol high": rv > q2,
            "Asia 00-07": hmk < 420, "London 07-12:30": (hmk >= 420) & (hmk < 750), "US data+open 12:30-16": (hmk >= 750) & (hmk < 960), "US pm 16-21": (hmk >= 960) & (hmk < 1260)}
    dd = idx.normalize().to_numpy()
    for nm, cm in cond.items():
        for per, pm in (("explore", idx < SPLIT), ("confirm", idx >= SPLIT)):
            m = cm & pm
            c, t, n = day_t(np.where(m, xl1, np.nan), fut3, dd)
            Dres.append({"tf": k, "condition": nm, "period": per, "corr": c, "t": t, "n": n, "p": pval(t)})
    # decile shape (explore): mean next-3-bar NQ return by decile of the lagged rate change (non-zero changes only)
D = pd.DataFrame(Dres)
D.loc[D.period == "explore", "q"] = bh(D.loc[D.period == "explore", "p"].to_numpy())
D.to_csv(OUT / "conditional.csv", index=False, float_format="%.4f")
x5, y5 = cache[(PRIMARY, 5)]
xl = lagged(x5.to_numpy(float), 1)
f3 = pd.Series(y5.to_numpy(float)).rolling(3).sum().shift(-2).to_numpy()
mm = np.isfinite(xl) & np.isfinite(f3) & (xl != 0)
dec = pd.qcut(xl[mm], 10, labels=False, duplicates="drop")
res["D_decile_5m"] = pd.DataFrame({"d": dec, "f": f3[mm], "x": xl[mm]}).groupby("d").agg(rate_bp=("x", "mean"), next15m_nq_pct=("f", "mean"), n=("f", "size")).round(4).reset_index().to_dict("records")

# ── E. rolling 20-day correlations (primary, 15m): same bar, rate-first 1 bar, NQ-first 1 bar ───────────────────────
x15, y15 = cache[(PRIMARY, 15)]
ud = np.unique(x15.index.normalize())
roll = []
for i in range(20, len(ud) + 1, 5):
    w = np.isin(x15.index.normalize(), ud[i - 20:i])
    dd = x15.index.normalize().to_numpy()
    r0 = day_t(np.where(w, x15.to_numpy(float), np.nan), y15.to_numpy(float), dd)[0]
    r1 = day_t(np.where(w, lagged(x15.to_numpy(float), 1), np.nan), y15.to_numpy(float), dd)[0]
    rm = day_t(np.where(w, lagged(x15.to_numpy(float), -1), np.nan), y15.to_numpy(float), dd)[0]
    roll.append({"end": str(pd.Timestamp(ud[i - 1]).date()), "same": round(r0, 3), "rate_first": round(r1, 3), "nq_first": round(rm, 3)})
res["E_rolling_15m"] = roll
fig, ax = plt.subplots(figsize=(10, 3))
xs_ = [pd.Timestamp(r["end"]) for r in roll]
ax.plot(xs_, [r["same"] for r in roll], label="same bar", lw=2)
ax.plot(xs_, [r["rate_first"] for r in roll], label="rate first (1 bar)")
ax.plot(xs_, [r["nq_first"] for r in roll], label="Nasdaq first (1 bar)")
ax.axhline(0, color="k", lw=0.5)
ax.axhline(2 / np.sqrt(20 * 80), color="grey", ls=":", lw=0.8)
ax.axhline(-2 / np.sqrt(20 * 80), color="grey", ls=":", lw=0.8)
ax.set_title(f"{PRIMARY}: rolling 20-day correlation of 15-min moves with Nasdaq (dotted: rough noise band)", fontsize=9)
ax.legend(fontsize=7)
fig.tight_layout()
fig.savefig(OUT / "rolling_15m.png", dpi=130)
plt.close(fig)

(OUT / "results.json").write_text(json.dumps(res | {"B_rows": B.to_dict("records"), "D_rows": D.to_dict("records")}, indent=1, default=str))
print("written", OUT, flush=True)
