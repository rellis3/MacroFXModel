"""S2 coverage variant (forge/RATES_RESIDUAL_PREREG.md Amendment 1)."""
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
ALL = sorted(p.stem for p in M.glob("*.parquet") if p.stem not in ("UK10YB_GBP", "DE10YB_EUR", "DE30_EUR"))
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


res = {}
# ---------- S2 (variant)
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


f = lambda c: f"{c[0]:+.4f} [{c[1]:+.4f}, {c[2]:+.4f}]"
r = res["S2"]
md = ["", f"## S2 variant (Amendment 1: the 14 ~23h instruments): **{'PASS' if r['pass'] else 'FAIL'}**", "",
      f"- b: **{f(r['pooled']['b'])}**; c: {f(r['pooled']['c'])}; n {r['n']}",
      f"- halves b: {r['halves_b'][0]:+.4f} / {r['halves_b'][1]:+.4f}; by target: " + ", ".join(f"{t} {v:+.4f}" for t, v in r["by_target_b"].items()),
      f"- placebo: median {r['placebo']['median']:+.4f}, 95th {r['placebo']['p95']:+.4f}, real beats {r['placebo']['real_beats_pct']}%",
      f"- gap trade: {r['gap_trade']['mean_net_bp']:+.2f} bp/trade, hit {r['gap_trade']['hit'] * 100:.1f}%, n {r['gap_trade']['n']}; " + ", ".join(f"{t} {v:+.2f}" for t, v in r["gap_trade"]["by_target_bp"].items())]
with open(OUT / "RESULTS.md", "a", encoding="utf-8") as fh: fh.write("
".join(md) + "
")
json.dump(r, open(OUT / "s2_variant.json", "w"), indent=1, default=str)
pd.concat({k: v for k, v in gaps2.items()}, names=["tgt", "t"]).to_parquet(OUT / "gaps_S2v.parquet")
print("
".join(md).encode("ascii", "replace").decode())
