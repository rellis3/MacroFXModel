import importlib.util, json, sys, warnings
warnings.filterwarnings("ignore")
import numpy as np, pandas as pd
spec = importlib.util.spec_from_file_location("R", sys.argv[1]); R = importlib.util.module_from_spec(spec); spec.loader.exec_module(R)
V3 = pd.read_parquet(sys.argv[2])
w, S = R.load()
d = pd.read_csv("analysis/output/forecast_history/NQ.csv").sort_values("date").reset_index(drop=True)
for q in ("oc", "hl", "oh", "ol"):
    for r in ("50", "75", "90"):
        d[f"tq_{q}{r}"] = d[f"r_{q}"].shift(1).rolling(250, min_periods=250).quantile(int(r) / 100)
w = w.merge(d[["date"] + [c for c in d.columns if c.startswith("tq_")]], on="date").merge(V3.drop(columns=["inst", "oos", "fold", "pit_sig_used"]), on="date")
w = w.reset_index(drop=True); n = len(w)
C, EXIT = R.COST, 21 * 60 + 55
SETS = {"PROD": "P", "v3 chosen (SI)": "SI", "v3 persist (S)": "S"}
L = lambda s, q, r: w[f"{s}_{q}_p{r}"].to_numpy()
atr = w.atr20.to_numpy(); idx = R.blocks(n); dev = (w.date < R.SPLIT).to_numpy()
qq = pd.PeriodIndex(w.date, freq="Q").astype(str).to_numpy(); groups = [np.flatnonzero(qq == g) for g in np.unique(qq)]
rng = np.random.default_rng(R.SEED)
roh, rol, rocs, o = w.r_oh.to_numpy(), w.r_ol.to_numpy(), w.r_ocs.to_numpy(), w.open.to_numpy()
def ci(x):
    bm = x[idx].mean(axis=1); return [float(x.mean()), float(np.percentile(bm, 2.5)), float(np.percentile(bm, 97.5))]
def shuffle(v, K):
    out = np.repeat(v[:, None], K, 1)
    for k in range(K):
        for g in groups: out[g, k] = v[rng.permutation(g)]
    return out
res = {"n": n, "window": [w.date.iat[0], w.date.iat[-1]]}

# ---- A. accuracy: pinball loss per rung, coverage; skill vs PROD, trailing, ATR ----
def pin(y, f, tau):
    u = y - f; return np.maximum(tau * u, (tau - 1) * u)
acc = {}
for q in ("oc", "hl", "oh", "ol"):
    y = w[f"r_{q}"].to_numpy()
    for r in ("50", "75", "90"):
        tau = int(r) / 100; base = {}
        lp = pin(y, L("P", q, r), tau)
        for name, s in SETS.items():
            f = L(s, q, r); ls = pin(y, f, tau)
            k = np.median(f / atr)
            e = {"coverage": float((y > f).mean()), "should": 1 - tau,
                 "skill_vs_trailing": float(1 - ls.mean() / pin(y, w[f"tq_{q}{r}"].to_numpy(), tau).mean()),
                 "skill_vs_atr": float(1 - ls.mean() / pin(y, k * atr, tau).mean())}
            if s != "P":
                x = lp - ls; m, lo, hi = ci(x); e["loss_cut_vs_PROD_pct"] = [100 * m / lp.mean(), 100 * lo / lp.mean(), 100 * hi / lp.mean()]
            acc.setdefault(f"{q}_p{r}", {})[name] = e
res["accuracy"] = acc

# ---- B. long at open, target open + O->C pXX, else 22:00 ----
tB = {}
B1 = rocs - C
for r in ("75", "90"):
    for name, s in SETS.items():
        t = L(s, "oc", r); p = np.where(roh >= t, t, rocs) - C
        tr_ = w[f"tq_oc{r}"].to_numpy(); ptr = np.where(roh >= tr_, tr_, rocs) - C
        ta = np.median(t / atr) * atr; pa = np.where(roh >= ta, ta, rocs) - C
        T = shuffle(t, 1000); pl = (np.where(roh[:, None] >= T, T, rocs[:, None]) - C).mean(axis=0)
        tB[f"p{r} {name}"] = {"net": ci(p), "hit": float((roh >= t).mean()), "minus_hold": ci(p - B1), "minus_trailing": ci(p - ptr), "minus_atr": ci(p - pa),
                              "placebo_pctile": float((pl < p.mean()).mean()), "dev_val": [float(p[dev].mean()), float(p[~dev].mean())]}
res["hold_open_long"] = {"B1_open_to_22": ci(B1)} | tB

# ---- C. enter at first touch of O->H / O->L line, fade (follow = mirror), exit 21:55 ----
P = []
for r_ in w.itertuples():
    g = S[r_.date]; oo = g.open.iat[0]; m = g.mins.to_numpy(); ex = int(np.searchsorted(m, EXIT) - 1)
    up = (g.high.to_numpy() / oo - 1) * 100; dn = (1 - g.low.to_numpy() / oo) * 100
    P.append(dict(ex=ex, ru=np.maximum.accumulate(up[:ex]), rd=np.maximum.accumulate(dn[:ex]), op=(g.open.to_numpy()[:ex] / oo - 1) * 100, x=(g.close.to_numpy()[ex] / oo - 1) * 100))
def run(du, dd):
    du = du if du.ndim == 2 else du[:, None]; dd = dd if dd.ndim == 2 else dd[:, None]
    out = np.full(du.shape, np.nan); side = np.zeros(du.shape)
    for i, p in enumerate(P):
        Ln = len(p["ru"]); ku = np.searchsorted(p["ru"], du[i]); kd = np.searchsorted(p["rd"], dd[i])
        hu, hd = ku < Ln, kd < Ln; upf = hu & (~hd | (ku < kd)); dnf = hd & (~hu | (kd < ku))
        fu = np.maximum(du[i], p["op"][np.minimum(ku, Ln - 1)]); fd = np.minimum(-dd[i], p["op"][np.minimum(kd, Ln - 1)])
        out[i] = np.where(upf, fu - p["x"], np.where(dnf, p["x"] - fd, np.nan)); side[i] = np.where(upf, 1, np.where(dnf, -1, 0))
    return out, side
def pt(v):   # per-trade mean with block CI
    t = ~np.isnan(v); z = np.where(t, v, 0.0)
    bm = np.array([z[j].sum() / max(t[j].sum(), 1) for j in idx]); return [int(t.sum()), float(z.sum() / t.sum()), float(np.percentile(bm, 2.5)), float(np.percentile(bm, 97.5))]
tC = {}
for r in ("50", "75", "90"):
    for name, s in SETS.items():
        du, dd = L(s, "oh", r), L(s, "ol", r)
        f, side = run(du, dd); f = f[:, 0] - C; side = side[:, 0]
        ftr, _ = run(w[f"tq_oh{r}"].to_numpy(), w[f"tq_ol{r}"].to_numpy())
        fat, _ = run(np.median(du / atr) * atr, np.median(dd / atr) * atr)
        pf, _ = run(shuffle(du, 300), shuffle(dd, 300)); pm = np.nanmean(pf, axis=0) - C
        fade = pt(f)
        tC[f"p{r} {name}"] = {"fade": fade, "follow_mean": -fade[1] - 2 * C, "fade_upper": pt(np.where(side == 1, f, np.nan)), "fade_lower": pt(np.where(side == -1, f, np.nan)),
                              "trailing_fade": pt(ftr[:, 0] - C), "atr_fade": pt(fat[:, 0] - C), "placebo_pctile": float((pm < fade[1]).mean())}
res["touch_hold_to_close"] = tC
print(json.dumps(res, indent=1, default=float))
