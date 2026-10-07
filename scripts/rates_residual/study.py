"""Rates residual book S1-S3 (forge/RATES_RESIDUAL_PREREG.md).

    python scripts/rates_residual/study.py
"""
import json
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

M = Path("analysis/output/rates_residual/m15")
OUT = Path("analysis/output/rates_residual")
K, H, WIN, B, N_PL, SEED = 16, 16, 20, 2000, 200, 20261008
rng = np.random.default_rng(SEED)
DRIVERS = {"EUR_USD": ["USB02Y_USD", "USB10Y_USD", "DE10YB_EUR"], "GBP_USD": ["USB02Y_USD", "USB10Y_USD", "UK10YB_GBP"],
           "USD_JPY": ["USB02Y_USD", "USB10Y_USD"], "XAU_USD": ["USB02Y_USD", "USB10Y_USD"],
           "NAS100_USD": ["USB02Y_USD", "USB10Y_USD"], "SPX500_USD": ["USB02Y_USD", "USB10Y_USD"]}
COST = {"EUR_USD": 0.008, "GBP_USD": 0.01, "USD_JPY": 0.01, "XAU_USD": 0.02, "NAS100_USD": 0.01, "SPX500_USD": 0.01}  # % round trip
HALF = "2022-05-01"
ALL = sorted(p.stem for p in M.glob("*.parquet"))
S = {n: pd.read_parquet(M / f"{n}.parquet")["close"] for n in ALL}


def frame(cols):
    df = pd.concat([S[c].rename(c) for c in cols], axis=1, join="inner").sort_index()
    ok = (df.index.to_series().diff() == pd.Timedelta(minutes=15)).to_numpy()
    R = np.log(df).diff().to_numpy()
    R[~ok] = np.nan
    return df.index, R


def day_ids(idx):
    d = idx.normalize()
    u, inv = np.unique(d, return_inverse=True)
    return u, inv


def rolling_beta(y, X, inv, nd):
    """beta for each day from OLS (no intercept) on the previous WIN days strictly before it."""
    p = X.shape[1]
    ok = np.isfinite(y) & np.isfinite(X).all(1)
    XtX = np.zeros((nd, p, p)); Xty = np.zeros((nd, p)); yy = np.zeros(nd); yn = np.zeros(nd)
    Xo, yo, io = X[ok], y[ok], inv[ok]
    np.add.at(XtX, io, Xo[:, :, None] * Xo[:, None, :]); np.add.at(Xty, io, Xo * yo[:, None])
    np.add.at(yy, io, yo ** 2); np.add.at(yn, io, 1)
    cXtX, cXty, cyy, cyn = (np.cumsum(a, 0) for a in (XtX, Xty, yy, yn))
    beta = np.full((nd, p), np.nan); sig = np.full(nd, np.nan)
    for k in range(WIN, nd):
        A = cXtX[k - 1] - (cXtX[k - 1 - WIN] if k - 1 - WIN >= 0 else 0)
        b = cXty[k - 1] - (cXty[k - 1 - WIN] if k - 1 - WIN >= 0 else 0)
        n = cyn[k - 1] - (cyn[k - 1 - WIN] if k - 1 - WIN >= 0 else 0)
        s2 = cyy[k - 1] - (cyy[k - 1 - WIN] if k - 1 - WIN >= 0 else 0)
        if n < 500: continue
        try: beta[k] = np.linalg.solve(A + 1e-12 * np.eye(p), b)
        except np.linalg.LinAlgError: continue
        sig[k] = np.sqrt(s2 / n)
    return beta, sig


def rsum(a, k):
    """trailing k-bar sum ending at each row (NaN if any missing)."""
    c = np.concatenate([[0.0], np.cumsum(np.nan_to_num(a))]); m = np.concatenate([[0], np.cumsum(~np.isfinite(a))])
    out = np.full(a.shape, np.nan)
    out[k - 1:] = c[k:] - c[:-k]
    bad = np.zeros(a.shape, bool); bad[k - 1:] = (m[k:] - m[:-k]) > 0; bad[:k - 1] = True
    out[bad] = np.nan
    return out


def gap_series(idx, y, Xd):
    u, inv = day_ids(idx)
    beta, sig = rolling_beta(y, Xd, inv, len(u))
    imp = np.einsum("ij,ij->i", np.nan_to_num(Xd), beta[inv])
    imp[~np.isfinite(Xd).all(1)] = np.nan
    s = sig[inv]
    I = rsum(imp, K) / (s * np.sqrt(K)); O = rsum(y, K) / (s * np.sqrt(K))
    fwd = np.full(y.shape, np.nan); fs = rsum(y, H); fwd[:-H] = fs[H:]
    return I, O, fwd / (s * np.sqrt(H)), fwd, inv


def sample(idx, I, O, F, Fraw, inv, name):
    pos = np.arange(len(idx))
    m = (pos % H == 0) & np.isfinite(I) & np.isfinite(O) & np.isfinite(F)
    return pd.DataFrame(dict(t=idx[m], day=idx[m].normalize(), I=I[m], O=O[m], F=F[m], Fraw=Fraw[m], tgt=name))


def ols_b(df):
    X = np.column_stack([np.ones(len(df)), df.I, df.O]); return np.linalg.lstsq(X, df.F.to_numpy(), rcond=None)[0]


def boot_b(df):
    """day-block bootstrap of (b, c) via per-day sufficient statistics."""
    X = np.column_stack([np.ones(len(df)), df.I, df.O]); y = df.F.to_numpy()
    u, inv = np.unique(df.day.to_numpy(), return_inverse=True)
    XtX = np.zeros((len(u), 3, 3)); Xty = np.zeros((len(u), 3))
    np.add.at(XtX, inv, X[:, :, None] * X[:, None, :]); np.add.at(Xty, inv, X * y[:, None])
    reps = []
    for _ in range(B):
        w = np.bincount(rng.integers(0, len(u), len(u)), minlength=len(u)).astype(float)
        reps.append(np.linalg.solve(np.tensordot(w, XtX, 1), np.tensordot(w, Xty, 1))[1:])
    reps = np.array(reps); pt = ols_b(df)[1:]
    return {"b": [round(float(pt[0]), 4), *np.round(np.percentile(reps[:, 0], [2.5, 97.5]), 4).tolist()],
            "c": [round(float(pt[1]), 4), *np.round(np.percentile(reps[:, 1], [2.5, 97.5]), 4).tolist()]}


def run_family(name_fn):
    """name_fn(target) -> (idx, y, Xd) ; returns sampled frame + per-target full gap series."""
    rows, gaps = [], {}
    for tgt in DRIVERS:
        idx, y, Xd = name_fn(tgt)
        I, O, F, Fraw, inv = gap_series(idx, y, Xd)
        gaps[tgt] = pd.DataFrame(dict(I=I, O=O), index=idx)
        rows.append(sample(idx, I, O, F, Fraw, inv, tgt))
    return pd.concat(rows, ignore_index=True), gaps


def summarise(df, label):
    r = {"n": int(len(df)), "pooled": boot_b(df)}
    r["halves_b"] = [round(float(ols_b(df[df.t < HALF])[1]), 4), round(float(ols_b(df[df.t >= HALF])[1]), 4)]
    r["by_target_b"] = {t: round(float(ols_b(g)[1]), 4) for t, g in df.groupby("tgt")}
    g = df[(df.I - df.O).abs() > 1.5]
    net = np.sign(g.I - g.O) * g.Fraw - g.tgt.map(COST) / 100
    r["gap_trade"] = {"n": int(len(g)), "mean_net_bp": round(float(net.mean() * 1e4), 2), "hit": round(float((net > 0).mean()), 4),
                      "by_target_bp": {t: round(float(net[g.tgt == t].mean() * 1e4), 2) for t in DRIVERS}}
    return r


# ---------- S1: natural drivers ----------
FR1 = {}
def s1_fn(tgt, shift=0):
    if tgt not in FR1: FR1[tgt] = frame([tgt] + DRIVERS[tgt])
    idx, R = FR1[tgt]
    Xd = R[:, 1:]
    if shift: Xd = np.roll(Xd, shift, axis=0)
    return idx, R[:, 0], Xd

df1, gaps1 = run_family(s1_fn)
res = {"S1": summarise(df1, "S1")}
pl = []
for k in range(N_PL):
    sh = int(rng.integers(20 * 80, 400 * 80))
    d, _ = run_family(lambda t: s1_fn(t, sh))
    pl.append(float(ols_b(d)[1]))
    if (k + 1) % 50 == 0: print("S1 placebo", k + 1, flush=True)
pl = np.array(pl)
r = res["S1"]; r["placebo"] = {"p95": round(float(np.percentile(pl, 95)), 4), "median": round(float(np.median(pl)), 4),
                               "real_beats_pct": round(float((r["pooled"]["b"][0] > pl).mean() * 100), 1)}
r["pass"] = bool(r["pooled"]["b"][1] > 0 and min(r["halves_b"]) > 0 and sum(v > 0 for v in r["by_target_b"].values()) >= 4
                 and r["placebo"]["real_beats_pct"] >= 95)
print("S1 done", r["pooled"], r["pass"], flush=True)

# ---------- S2: PCA of everything else ----------
FR_ALL = frame(ALL)
idxA, RA = FR_ALL
uA, invA = day_ids(idxA)


def pc_scores(cols_idx):
    """per-bar scores on 3 PCs whose loadings come from the previous WIN days of the other instruments."""
    Xo = RA[:, cols_idx]
    sc = np.full((len(idxA), 3), np.nan)
    starts = np.searchsorted(invA, np.arange(len(uA)))
    ends = np.append(starts[1:], len(invA))
    for k in range(WIN, len(uA)):
        W = Xo[starts[k - WIN]:starts[k]]
        W = W[np.isfinite(W).all(1)]
        if len(W) < 500: continue
        mu, sd = W.mean(0), W.std(0) + 1e-12
        _, _, Vt = np.linalg.svd((W - mu) / sd, full_matrices=False)
        sc[starts[k]:ends[k]] = ((Xo[starts[k]:ends[k]] - mu) / sd) @ Vt[:3].T
    return sc


SC = {}
for tgt in DRIVERS:
    others = [i for i, n in enumerate(ALL) if n != tgt]
    SC[tgt] = pc_scores(others)
    print("PCA scores", tgt, flush=True)


def s2_fn(tgt, shift=0):
    Xd = SC[tgt]
    if shift: Xd = np.roll(Xd, shift, axis=0)
    return idxA, RA[:, ALL.index(tgt)], Xd

df2, gaps2 = run_family(s2_fn)
res["S2"] = summarise(df2, "S2")
pl = []
for k in range(N_PL):
    sh = int(rng.integers(20 * 70, 400 * 70))
    d, _ = run_family(lambda t: s2_fn(t, sh))
    pl.append(float(ols_b(d)[1]))
    if (k + 1) % 50 == 0: print("S2 placebo", k + 1, flush=True)
pl = np.array(pl)
r = res["S2"]; r["placebo"] = {"p95": round(float(np.percentile(pl, 95)), 4), "median": round(float(np.median(pl)), 4),
                               "real_beats_pct": round(float((r["pooled"]["b"][0] > pl).mean() * 100), 1)}
r["pass"] = bool(r["pooled"]["b"][1] > 0 and min(r["halves_b"]) > 0 and sum(v > 0 for v in r["by_target_b"].values()) >= 4
                 and r["placebo"]["real_beats_pct"] >= 95)
print("S2 done", r["pooled"], r["pass"], flush=True)

# ---------- S3: the S1 gap at C.OG's lines ----------
T = pd.read_csv("analysis/output/cog_yield_dir/trades.csv")
LON = ZoneInfo("Europe/London")
tmap = {"EURUSD": "EUR_USD", "GOLD": "XAU_USD", "NQ": "NAS100_USD"}
gs = []
for ins, g in T.groupby("ins"):
    gp = gaps1[tmap[ins]].dropna()
    fill = pd.to_datetime(g.date) + pd.to_timedelta(g.fill_min, unit="m")
    fill_utc = fill.dt.tz_localize(LON, ambiguous="NaT", nonexistent="NaT").dt.tz_convert("UTC").dt.tz_localize(None)
    look = fill_utc - pd.Timedelta(minutes=30)           # last COMPLETED bar: opened at or before fill - 30 min (closed by fill - 15)
    j = np.searchsorted(gp.index.to_numpy(), look.to_numpy(), side="right") - 1
    okj = (j >= 0) & look.notna().to_numpy()
    jj = np.clip(j, 0, len(gp) - 1)
    stale = (look.to_numpy() - gp.index.to_numpy()[jj]) > np.timedelta64(2, "h")
    gap = np.where(okj & ~stale, gp.I.to_numpy()[jj] - gp.O.to_numpy()[jj], np.nan)
    gs.append(g.assign(gap=gap))
T3 = pd.concat(gs)
T3 = T3[T3.gap.notna() & (T3.date >= "2018-02-01")]
T3["month"] = T3.date.str[:7]


def boot_m(a, b=None):
    ms = sorted(set(a.month) | (set(b.month) if b is not None else set()))
    ga = {m: x.R.to_numpy() for m, x in a.groupby("month")}; gb = {m: x.R.to_numpy() for m, x in b.groupby("month")} if b is not None else None
    reps = []
    for _ in range(B):
        pick = rng.choice(ms, len(ms))
        x = np.concatenate([ga.get(m, np.empty(0)) for m in pick]); v = x.mean()
        if gb is not None: v -= np.concatenate([gb.get(m, np.empty(0)) for m in pick]).mean()
        reps.append(v)
    pt = a.R.mean() - (b.R.mean() if b is not None else 0)
    return [round(float(pt), 4), *np.round(np.nanpercentile(reps, [2.5, 97.5]), 4).tolist()]


keep = T3[(np.sign(T3.gap) == T3.side) & (T3.gap.abs() > 0.5)]
opp = T3[(np.sign(T3.gap) == -T3.side) & (T3.gap.abs() > 0.5)]
s3 = {"n_all": int(len(T3)), "n_keep": int(len(keep)), "keep": boot_m(keep), "keep_minus_all": boot_m(keep, T3),
      "opposite": round(float(opp.R.mean()), 4), "all": round(float(T3.R.mean()), 4),
      "halves_keep": [round(float(keep[keep.date < HALF].R.mean()), 4), round(float(keep[keep.date >= HALF].R.mean()), 4)],
      "by_setup_ins": {f"{s}|{i}": [round(float(x.R.mean()), 4), int(len(x))] for (s, i), x in keep.groupby(["setup", "ins"])},
      "by_setup_ins_all": {f"{s}|{i}": round(float(x.R.mean()), 4) for (s, i), x in T3.groupby(["setup", "ins"])}}
s3["pass"] = bool(s3["keep"][1] > 0 and s3["keep_minus_all"][1] > 0 and min(s3["halves_keep"]) > 0)
res["S3"] = s3
for nm, gp in (("S1", gaps1),):
    pd.concat({k: v for k, v in gp.items()}, names=["tgt", "t"]).to_parquet(OUT / f"gaps_{nm}.parquet")
(OUT / "results.json").write_text(json.dumps(res, indent=1, default=str))

f = lambda c: f"{c[0]:+.4f} [{c[1]:+.4f}, {c[2]:+.4f}]"
md = ["# Rates residual book (results)", "", "Pre-registration: `forge/RATES_RESIDUAL_PREREG.md`. OANDA M15 2018-01 → 2026-10. "
      "I = rates-implied 4h move, O = own 4h move, F = next 4h, all in σ units; b = how much of the rates-implied move price "
      "adds over the next 4h (controlling for its own move, c). Sampled every 4h; day-block bootstrap.", ""]
for k, title in (("S1", "S1 — natural drivers (bond CFDs)"), ("S2", "S2 — PCA of every other instrument")):
    r = res[k]
    md += [f"## {title}: **{'PASS' if r['pass'] else 'FAIL'}**", "",
           f"- b (catch-up to the implied move): **{f(r['pooled']['b'])}**; c (own move): {f(r['pooled']['c'])}; n {r['n']}",
           f"- halves b: {r['halves_b'][0]:+.4f} / {r['halves_b'][1]:+.4f}; by target: " + ", ".join(f"{t} {v:+.4f}" for t, v in r["by_target_b"].items()),
           f"- placebo (drivers shifted): median {r['placebo']['median']:+.4f}, 95th {r['placebo']['p95']:+.4f}, real beats {r['placebo']['real_beats_pct']}%",
           f"- gap trade (|I−O| > 1.5, 4h, after costs): {r['gap_trade']['mean_net_bp']:+.2f} bp/trade, hit {r['gap_trade']['hit'] * 100:.1f}%, n {r['gap_trade']['n']}; "
           + ", ".join(f"{t} {v:+.2f}" for t, v in r["gap_trade"]["by_target_bp"].items()), ""]
md += [f"## S3 — the S1 gap as the direction at C.OG's lines: **{'PASS' if s3['pass'] else 'FAIL'}**", "",
       f"- Kept (price behind rates in the trade's direction, |gap| > 0.5): {f(s3['keep'])} R, n {s3['n_keep']} of {s3['n_all']}",
       f"- Kept minus all: {f(s3['keep_minus_all'])}; opposite filter {s3['opposite']:+.4f}; all {s3['all']:+.4f}",
       f"- Halves kept: {s3['halves_keep'][0]:+.4f} / {s3['halves_keep'][1]:+.4f}",
       "- Kept by setup|instrument [R, n] vs all: " + "; ".join(f"{k} {v[0]:+.3f} ({v[1]}) vs {s3['by_setup_ins_all'][k]:+.3f}" for k, v in s3["by_setup_ins"].items())]
(OUT / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
print("\n".join(md).encode("ascii", "replace").decode())
