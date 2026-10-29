"""line-touch-limit-unseen (forge/LINE_TOUCH_LIMIT_UNSEEN_PREREG.md).

The wide-scan selector, refit walk-forward on its own 17 instruments, frozen, and applied to 17 FX pairs it never saw.
Fills and exits on real OANDA bid/ask M1: market entry (M), resting limit at mid (L), limit + MAE-rule stop (J).

    node scripts/line-touch-limit-unseen/touches.mjs        # unseen touches (once)
    python scripts/line-touch-limit-unseen/run.py
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from numba import njit
from sklearn.ensemble import HistGradientBoostingRegressor

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/line_touch_wide"))
import build_features as bf  # noqa: E402

WIDE = ROOT / "analysis/output/line_touch_wide_scan"
OUT = ROOT / "analysis/output/line-touch-limit-unseen"
BA = ROOT / "data/m1_bidask_bin"
UNSEEN = ["audcad", "audchf", "audnzd", "cadchf", "eurcad", "eurgbp", "eurjpy", "eurnzd", "gbpaud", "gbpcad",
          "gbpchf", "gbpjpy", "gbpnzd", "nzdcad", "nzdjpy", "nzdusd", "usdcad"]
BA_KEY = {"de30": "dax"}
FAMS = ["dopen", "hl50", "hl75", "hl90", "oh50", "oh75", "oh90"]
FEAT = ["hour", "minsIn", "minsLeft", "weekday", "side", "rung", "fam", "lvl_dist", "abs_lvl", "day_ratio20",
        "prev_ret_s", "prev_rng", "n_prior", "last_prior15", "mv5", "mv15", "mv30", "mv60", "eff15", "eff60",
        "near60", "body1", "wf1", "wb1", "rng1", "body3", "wf3", "wb3", "rng3", "body5", "wf5", "wb5", "rng5",
        "since_counter", "vwap_dist", "vwap_slope", "rsi14", "vol15", "used", "pos", "since_ext"]
SPLIT, HALF = pd.Timestamp("2022-06-24"), pd.Timestamp("2022-01-01")
FIRST, LAST = pd.Timestamp("2017-01-01"), pd.Timestamp("2026-08-20 23:59:59")
PER_WEEK, R_FRAC, LIMIT_BARS, K_CTRL = 2.0, 0.10, 15, 5
D_GRID = [0.05, 0.075, 0.10, 0.125, 0.15, 0.20, 0.25, 0.30, 0.40]
B, BLOCK = 2000, 21
rng = np.random.default_rng(20261028)
LOG = []


def log(*a):
    s = " ".join(str(x) for x in a)
    print(s, flush=True)
    LOG.append(s)


# ── 1. tables ──────────────────────────────────────────────────────────────
def prep(df):
    df = df.copy()
    df["dt"] = pd.to_datetime(df.t, unit="s")
    df["weekday"] = pd.to_datetime(df.date).dt.dayofweek
    df["fam"] = pd.Categorical(df.family, categories=FAMS).codes
    df["abs_lvl"] = df.lvl_dist.abs()
    df["prev_ret_s"] = df.prev_ret * df.side
    df = df.dropna(subset=["R_cont", "R_fade", "ret60"])
    df = df[(df.rng1 <= 0.5) & (df.hour < 20)].reset_index(drop=True)
    df["year"] = df.dt.dt.year
    return df


def unseen_features():
    f = OUT / "features_unseen.parquet"
    if f.exists():
        return pd.read_parquet(f)
    bf.RESP = OUT / "response"
    parts = []
    for p in UNSEEN:
        d = bf.one(p)
        log(f"features {p}: {len(d)} touches, matched {d.matched.mean():.3f}")
        parts.append(d)
    out = pd.concat(parts, ignore_index=True)
    out.to_parquet(f)
    return out


seen = prep(pd.read_parquet(WIDE / "features.parquet"))
uns = prep(unseen_features())
uns = uns[(uns.dt >= FIRST) & (uns.dt <= LAST)].reset_index(drop=True)
log(f"seen eligible touches {len(seen):,}, unseen eligible touches {len(uns):,}")

# ── 2. walk-forward fits on the seen set ───────────────────────────────────
Xs, Xu = seen[FEAT].to_numpy(float), uns[FEAT].to_numpy(float)
Ps = {t: np.full(len(seen), np.nan) for t in ("R_cont", "R_fade")}
Pu = {t: np.full(len(uns), np.nan) for t in ("R_cont", "R_fade")}
nfit = 0
for yr in range(2017, 2027):
    tr = (seen.year < yr).to_numpy()
    if tr.sum() < 5000:
        continue
    te_s, te_u = (seen.year == yr).to_numpy(), (uns.year == yr).to_numpy()
    for t in Ps:
        m = HistGradientBoostingRegressor(max_iter=80, learning_rate=0.08, max_depth=4, min_samples_leaf=500,
                                          l2_regularization=1.0, random_state=1).fit(Xs[tr], seen[t].to_numpy()[tr])
        nfit += 1
        if te_s.any():
            Ps[t][te_s] = m.predict(Xs[te_s])
        if te_u.any():
            Pu[t][te_u] = m.predict(Xu[te_u])
log(f"fits {nfit}")

# D4 reproduction check against the wide scan's own discovery predictions
orig = np.load(WIDE / "preds_discovery.npz")
disc = (seen.dt < SPLIT).to_numpy()
d4 = {}
for t in Ps:
    o = orig[t]
    both = disc & ~np.isnan(o) & ~np.isnan(Ps[t]) if len(o) == len(seen) else None
    d4[t] = {"len_match": bool(len(o) == len(seen)),
             "max_abs_diff": float(np.nanmax(np.abs(o[both] - Ps[t][both]))) if both is not None else None,
             "n_compared": int(both.sum()) if both is not None else 0}
log("D4 reproduction:", json.dumps(d4))


# ── 3. selection and frozen c ──────────────────────────────────────────────
def select(df, P, c):
    ok = ~np.isnan(P["R_cont"])
    sub = df.loc[ok].copy()
    pc, pf = P["R_cont"][ok], P["R_fade"][ok]
    sub["score"], sub["cont"] = np.maximum(pc, pf), pc >= pf
    cand = sub[sub.score >= c].sort_values("t").drop_duplicates(["pair", "date"], keep="first")
    wk = max((sub.dt.max() - sub.dt.min()).days / 7.0, 1.0)
    return cand, wk


lo, hi = -5.0, 5.0
for _ in range(45):
    mid = (lo + hi) / 2
    cand, wk = select(seen, Ps, mid)
    lo, hi = (mid, hi) if len(cand) / wk > PER_WEEK else (lo, mid)
C = (lo + hi) / 2
sel_s, wk_s = select(seen, Ps, C)
log(f"c = {C:.5f}; seen OOF selections {len(sel_s)} ({len(sel_s) / wk_s:.2f}/week), fade share {(~sel_s.cont).mean():.2f}, "
    f"gross R (mid, scan structure) {np.where(sel_s.cont, sel_s.R_cont, sel_s.R_fade).mean():+.3f}")


# ── 4. d* from the seen set (mid M1 cache), before any unseen outcome ──────
def load_mid(pair):
    d = pd.read_parquet(bf.M1 / f"{pair}_m1.parquet")
    if "time" in d.columns:
        d = d.set_index(pd.DatetimeIndex(pd.to_datetime(d["time"], utc=True)))
    if d.index.tz is None:
        d.index = d.index.tz_localize("UTC")
    d = d[~d.index.duplicated()].sort_index()
    tt = np.asarray(d.index.tz_convert("UTC").tz_localize(None), dtype="datetime64[s]").astype("int64")
    return tt, d.high.to_numpy(float), d.low.to_numpy(float), d.close.to_numpy(float)


def exit_time(t, mins_left):
    day0 = (t // 86400) * 86400
    return np.minimum(t + mins_left * 60, day0 + 21 * 3600 + 55 * 60)


@njit(cache=True)
def mae_path(h, l, c, k, e, d, scale):
    """Adverse excursion from k+1 to e and the time-exit return, in scale units."""
    entry = c[k]
    worst = 0.0
    for j in range(k + 1, e + 1):
        adv = (l[j] - entry) * d if d > 0 else (h[j] - entry) * d
        if -adv > worst:
            worst = -adv
    return worst / scale, (c[e] - entry) * d / scale


rows = []
for pair, g in sel_s.groupby("pair"):
    tt, h, l, c = load_mid(pair)
    ks = np.searchsorted(tt, g.t.to_numpy())
    es = np.searchsorted(tt, exit_time(g.t.to_numpy(), g.minsLeft.to_numpy()), side="right") - 1
    dirs = np.where(g.cont, g.side, -g.side).astype(float)
    for k, e, d, s in zip(ks, es, dirs, g.scale.to_numpy()):
        if k < len(tt) and e > k:
            rows.append(mae_path(h, l, c, int(k), int(e), d, s))
mae = np.array(rows)
curve = []
D_STAR = None
for dd in D_GRID:
    hit = mae[:, 0] >= dd
    xbar = float(mae[hit, 1].mean()) if hit.any() else float("nan")
    curve.append({"d": dd, "n_reached": int(hit.sum()), "share_reached": float(hit.mean()), "mean_exit_ret": xbar})
    if D_STAR is None and hit.any() and xbar < -dd:
        D_STAR = dd
if D_STAR is None:
    D_STAR = 0.40
log("MAE curve (seen OOF selections, mid):", json.dumps(curve))
log(f"d* = {D_STAR} (x dayScale); scan stop was {R_FRAC}")
(OUT / "dstar.json").write_text(json.dumps({"c": C, "d_star": D_STAR, "curve": curve, "n_trades": int(len(mae))}, indent=1))


# ── 5. bid/ask execution ───────────────────────────────────────────────────
def load_ba(key):
    raw = open(BA / f"{key}.bin", "rb").read()
    n = int(np.frombuffer(raw, np.int32, 1)[0])
    tt = np.frombuffer(raw, np.int32, n, 4).astype(np.int64)
    cols = np.frombuffer(raw, np.float64, 12 * n, 4 + 4 * n).reshape(12, n)
    return tt, cols


@njit(cache=True)
def run_exits(bo, bh, bl, bc, ao, ah, al, ac, start, e, d, entry, Rp):
    stop = entry - d * Rp
    ext = entry
    trailing = False
    for j in range(start, e + 1):
        if d > 0:
            if bl[j] <= stop:
                return (min(stop, bo[j]) - entry) / Rp
            if bh[j] > ext:
                ext = bh[j]
            if bh[j] > entry + 3.0 * Rp:
                return 3.0
        else:
            if ah[j] >= stop:
                return (entry - max(stop, ao[j])) / Rp
            if al[j] < ext:
                ext = al[j]
            if al[j] < entry - 3.0 * Rp:
                return 3.0
        if (ext - entry) * d >= Rp:
            trailing = True
        if trailing:
            ns = ext - d * Rp
            lock = entry + d * 0.5 * Rp
            if (ns - lock) * d < 0:
                ns = lock
            if (ns - stop) * d > 0:
                stop = ns
    px = bc[e] if d > 0 else ac[e]
    return (px - entry) * d / Rp


@njit(cache=True)
def trade(bo, bh, bl, bc, ao, ah, al, ac, k, e, d, Rp, mode, stress):
    """mode 0 market, 1 limit at mid. Returns (filled, net R, spread at k in R, fill bar offset)."""
    sp_k = (ac[k] - bc[k]) / Rp
    if e <= k:
        return 0, np.nan, sp_k, -1
    if mode == 0:
        entry = ac[k] if d > 0 else bc[k]
        return 1, run_exits(bo, bh, bl, bc, ao, ah, al, ac, k + 1, e, d, entry, Rp), sp_k, 0
    P = 0.5 * (bc[k] + ac[k])
    last = min(k + 15, e)
    for j in range(k + 1, last + 1):
        sp = (ac[j] - bc[j]) if stress else 0.0
        hit = (bh[j] > P + sp) if d < 0 else (al[j] < P - sp)
        if not hit:
            continue
        stop = P - d * Rp
        if d > 0 and bl[j] <= stop:
            return 1, (stop - P) / Rp, sp_k, j - k
        if d < 0 and ah[j] >= stop:
            return 1, (P - stop) / Rp, sp_k, j - k
        if j == e:
            px = bc[e] if d > 0 else ac[e]
            return 1, (px - P) * d / Rp, sp_k, j - k
        return 1, run_exits(bo, bh, bl, bc, ao, ah, al, ac, j + 1, e, d, P, Rp), sp_k, j - k
    return 0, np.nan, sp_k, -1


@njit(cache=True)
def mid_outcome(bo, bh, bl, bc, ao, ah, al, ac, k, e, d, Rp):
    """D1: the scan structure on mid prices, entry at the mid close of k (no spread)."""
    o = 0.5 * (bo + ao)
    h = 0.5 * (bh + ah)
    l = 0.5 * (bl + al)
    c = 0.5 * (bc + ac)
    return run_exits(o, h, l, c, o, h, l, c, k + 1, e, d, c[k], Rp)


def ba_index(tt, t):
    i = np.searchsorted(tt, t)
    ok = (i < len(tt)) & (tt[np.minimum(i, len(tt) - 1)] == t)
    return i, ok


def exit_index(tt, t, mins_left):
    t55 = (t // 86400) * 86400 + 21 * 3600 + 55 * 60
    i55 = np.searchsorted(tt, t55, side="right") - 1
    i59 = np.searchsorted(tt, t55 + 240, side="right") - 1
    i_end = np.searchsorted(tt, t + mins_left * 60, side="right") - 1
    ix = np.where(tt[np.clip(i55, 0, None)] == t55, i55, i59)
    return np.minimum(ix, i_end)


CELLS = {"M": (0, R_FRAC, False), "L": (1, R_FRAC, False), "J": (1, None, False),
         "L_stress": (1, R_FRAC, True), "J_stress": (1, None, True)}


def execute(sel, label):
    """Every cell for every selected signal. Returns one row per signal with each cell's result."""
    out, excl = [], {"no_bidask_bar": 0, "no_bars_after": 0}
    for pair, g in sel.groupby("pair"):
        tt, cols = load_ba(BA_KEY.get(pair, pair))
        bo, bh, bl, bc, ao, ah, al, ac = (np.ascontiguousarray(cols[i]) for i in range(4, 12))
        t = g.t.to_numpy()
        ks, ok = ba_index(tt, t)
        es = exit_index(tt, t, g.minsLeft.to_numpy())
        dirs = np.where(g.cont, g.side, -g.side).astype(float)
        for i, (k, e, d, sc) in enumerate(zip(ks, es, dirs, g.scale.to_numpy())):
            if not ok[i]:
                excl["no_bidask_bar"] += 1
                continue
            if e <= k:
                excl["no_bars_after"] += 1
                continue
            r = {"pair": pair, "date": g.date.iloc[i], "t": int(t[i]), "dir": int(d), "cont": bool(g.cont.iloc[i]),
                 "hour": int(g.hour.iloc[i]), "family": g.family.iloc[i]}
            for name, (mode, frac, stress) in CELLS.items():
                Rp = (frac if frac is not None else D_STAR) * sc
                f, R, spk, off = trade(bo, bh, bl, bc, ao, ah, al, ac, int(k), int(e), d, Rp, mode, stress)
                r[f"{name}_filled"], r[f"{name}_R"] = int(f), R
                if name in ("M", "J"):
                    r[f"{name}_spreadR"] = spk
                if name == "L":
                    r["L_fill_bar"] = off
            r["mid_R"] = mid_outcome(bo, bh, bl, bc, ao, ah, al, ac, int(k), int(e), d, R_FRAC * sc)
            out.append(r)
    log(f"{label}: {len(out)} signals executed, excluded {excl}")
    return pd.DataFrame(out), excl


# ── 6. bootstrap ───────────────────────────────────────────────────────────
DATES = np.array(sorted(uns.date.unique()))
DPOS = {d: i for i, d in enumerate(DATES)}
nblk = int(np.ceil(len(DATES) / BLOCK))
BOOT_IDX = (rng.integers(0, len(DATES), (B, nblk))[:, :, None] + np.arange(BLOCK)[None, None, :]) % len(DATES)
BOOT_IDX = BOOT_IDX.reshape(B, -1)[:, :len(DATES)]


def boot(dates, r):
    """Mean R per trade with a 21-session moving-block bootstrap over the session-date spine."""
    m = np.isfinite(r)
    dates, r = np.asarray(dates)[m], np.asarray(r, float)[m]
    if len(r) < 2:
        return {"n": int(len(r)), "mean": float(r.mean()) if len(r) else None}
    pos = np.array([DPOS[d] for d in dates])
    s = np.bincount(pos, weights=r, minlength=len(DATES))
    n = np.bincount(pos, minlength=len(DATES)).astype(float)
    bs, bn = s[BOOT_IDX].sum(1), n[BOOT_IDX].sum(1)
    bm = bs / np.where(bn > 0, bn, np.nan)
    se = float(np.nanstd(bm))
    p = float(min(1.0, 2 * min(np.nanmean(bm <= 0), np.nanmean(bm >= 0))))
    return {"n": int(len(r)), "mean": float(r.mean()), "ci": np.nanpercentile(bm, [2.5, 97.5]).tolist(),
            "se": se, "mde": 2.8 * se, "t": float(r.mean() / se) if se > 0 else None, "p": p}


def summary(df, cell):
    f = df[df[f"{cell}_filled"] == 1]
    res = boot(f.date, f[f"{cell}_R"].to_numpy())
    res["signals"], res["fill_rate"] = int(len(df)), float(len(f) / len(df)) if len(df) else None
    if len(f):
        dt = pd.to_datetime(f.date)
        res["half1"] = float(f[f"{cell}_R"][dt < HALF].mean())
        res["half2"] = float(f[f"{cell}_R"][dt >= HALF].mean())
        bp = f.groupby("pair")[f"{cell}_R"].agg(["mean", "size"])
        res["pairs_positive"], res["pairs_traded"] = int((bp["mean"] > 0).sum()), int(len(bp))
        res["by_pair"] = bp.round(4).to_dict("index")
        res["by_year"] = f.groupby(dt.dt.year)[f"{cell}_R"].agg(["mean", "size"]).round(4).to_dict("index")
        res["win_rate"] = float((f[f"{cell}_R"] > 0).mean())
        res["full_stop_share"] = float((f[f"{cell}_R"] <= -0.999).mean())
        res["fade_share"] = float((~f.cont).mean())
    return res


# ── 7. unseen pass ─────────────────────────────────────────────────────────
sel_u, wk_u = select(uns, Pu, C)
log(f"unseen selections {len(sel_u)} ({len(sel_u) / wk_u:.2f}/week), fade share {(~sel_u.cont).mean():.2f}, "
    f"gross R (mid cache, scan structure) {np.where(sel_u.cont, sel_u.R_cont, sel_u.R_fade).mean():+.3f}")
ex_u, excl_u = execute(sel_u, "unseen")
weeks_u = max((pd.to_datetime(ex_u.date).max() - pd.to_datetime(ex_u.date).min()).days / 7.0, 1.0)
res = {"c": C, "d_star": D_STAR, "mae_curve": curve, "d4_reproduction": d4, "fits": nfit,
       "seen_oof": {"n": int(len(sel_s)), "per_week": float(len(sel_s) / wk_s), "fade_share": float((~sel_s.cont).mean()),
                    "gross_mid_scan": float(np.where(sel_s.cont, sel_s.R_cont, sel_s.R_fade).mean())},
       "unseen": {"selected": int(len(sel_u)), "per_week": float(len(sel_u) / wk_u), "excluded": excl_u,
                  "gross_mid_scan": float(np.where(sel_u.cont, sel_u.R_cont, sel_u.R_fade).mean())},
       "cells": {}}
for cell in CELLS:
    res["cells"][cell] = summary(ex_u, cell)
    s = res["cells"][cell]
    log(f"  {cell:9s} n {s['n']:5d} fill {s['fill_rate']:.3f} mean {s['mean']:+.4f} CI {np.round(s.get('ci', [np.nan] * 2), 4)} "
        f"p {s.get('p', np.nan):.4f} halves {s.get('half1', np.nan):+.3f}/{s.get('half2', np.nan):+.3f} "
        f"pairs+ {s.get('pairs_positive')}/{s.get('pairs_traded')}")

# Holm across M, L, J and the gate
ps = {c: res["cells"][c]["p"] for c in ("M", "L", "J")}
order = sorted(ps, key=ps.get)
holm, run_max = {}, 0.0
for i, c in enumerate(order):
    run_max = max(run_max, min(1.0, (3 - i) * ps[c]))
    holm[c] = run_max
gates = {}
for c in ("M", "L", "J"):
    s = res["cells"][c]
    g = {"mean_pos": s["mean"] > 0, "ci_lo_pos": s["ci"][0] > 0, "holm_p<0.05": holm[c] < 0.05,
         "half1_pos": s["half1"] > 0, "half2_pos": s["half2"] > 0,
         "pairs_majority": s["pairs_positive"] > s["pairs_traded"] / 2, "n>=200": s["n"] >= 200}
    if c in ("L", "J"):
        g["stress_pos"] = res["cells"][f"{c}_stress"]["mean"] > 0
    g["PASS"] = all(g.values())
    s["holm_p"] = holm[c]
    gates[c] = g
res["gates"] = gates
any_pass = any(g["PASS"] for g in gates.values())
all_below = all(res["cells"][c]["ci"][1] < 0.05 for c in ("M", "L", "J"))
res["verdict"] = "validated" if any_pass else ("null" if all_below else "underpowered")
log("gates:", json.dumps(gates))
log("VERDICT:", res["verdict"].upper())

# ── 8. descriptives ────────────────────────────────────────────────────────
# D1 adverse selection
f, nf = ex_u[ex_u.L_filled == 1], ex_u[ex_u.L_filled == 0]
res["D1_adverse_selection"] = {"filled_n": int(len(f)), "unfilled_n": int(len(nf)),
                               "mid_R_filled": float(f.mid_R.mean()) if len(f) else None,
                               "mid_R_unfilled": float(nf.mid_R.mean()) if len(nf) else None,
                               "mid_R_all": float(ex_u.mid_R.mean())}
# D3 spread terciles (M), side, family
q = ex_u.M_spreadR.quantile([1 / 3, 2 / 3]).to_numpy()
ex_u["spread_bin"] = np.digitize(ex_u.M_spreadR, q)
res["D3"] = {"spreadR_terciles": q.tolist(), "median_spreadR_M": float(ex_u.M_spreadR.median()),
             "median_spreadR_J": float(ex_u.J_spreadR.median()), "weeks": weeks_u,
             "by_spread_bin": {int(b): {c: float(g[f"{c}_R"].mean()) for c in ("M", "L", "J")} | {"n": int(len(g))}
                               for b, g in ex_u.groupby("spread_bin")},
             "by_side": {("continue" if k else "fade"): {c: float(g[f"{c}_R"].mean()) for c in ("M", "L", "J")} | {"n": int(len(g))}
                         for k, g in ex_u.groupby("cont")},
             "by_family": {k: {c: float(g[f"{c}_R"].mean()) for c in ("M", "L", "J")} | {"n": int(len(g))}
                           for k, g in ex_u.groupby("family")}}

# C1 selector vs random eligible touch (same pair, year, hour; same fade/continue choice), L and J rules
uns_ok = uns.loc[~np.isnan(Pu["R_cont"])]
cells_idx = uns_ok.groupby(["pair", "year", "hour"]).indices
draws = []
for _, s in sel_u.iterrows():
    ix = cells_idx.get((s.pair, s.year, s.hour))
    if ix is None or len(ix) < 2:
        continue
    pick = uns_ok.iloc[rng.choice(ix, size=min(K_CTRL, len(ix)), replace=False)].copy()
    pick["cont"] = s.cont
    draws.append(pick)
ctrl = pd.concat(draws, ignore_index=True)
ex_c, _ = execute(ctrl, "control C1")
res["C1_control"] = {}
for c in ("M", "L", "J"):
    cs = ex_c[ex_c[f"{c}_filled"] == 1][f"{c}_R"]
    real = res["cells"][c]["mean"]
    # real - control, bootstrapped jointly on the date spine
    fr = ex_u[ex_u[f"{c}_filled"] == 1]
    fc = ex_c[ex_c[f"{c}_filled"] == 1]
    pr = np.array([DPOS[d] for d in fr.date]); pc = np.array([DPOS[d] for d in fc.date])
    sr, nr = np.bincount(pr, fr[f"{c}_R"], len(DATES)), np.bincount(pr, minlength=len(DATES)).astype(float)
    sc_, nc = np.bincount(pc, fc[f"{c}_R"], len(DATES)), np.bincount(pc, minlength=len(DATES)).astype(float)
    diff = sr[BOOT_IDX].sum(1) / nr[BOOT_IDX].sum(1) - sc_[BOOT_IDX].sum(1) / nc[BOOT_IDX].sum(1)
    res["C1_control"][c] = {"control_n": int(len(cs)), "control_mean": float(cs.mean()), "real_minus_control": float(real - cs.mean()),
                            "ci": np.nanpercentile(diff, [2.5, 97.5]).tolist()}
log("C1 control:", json.dumps(res["C1_control"]))

# D2 seen holdout re-priced (fifth read, description only)
hold_sel = sel_s[sel_s.dt >= SPLIT]
ex_h, excl_h = execute(hold_sel, "seen holdout (D2)")
res["D2_seen_holdout"] = {"selected": int(len(hold_sel)), "excluded": excl_h,
                          "gross_mid_scan": float(np.where(hold_sel.cont, hold_sel.R_cont, hold_sel.R_fade).mean()),
                          **{c: {"n": int((ex_h[f"{c}_filled"] == 1).sum()), "mean": float(ex_h[ex_h[f"{c}_filled"] == 1][f"{c}_R"].mean())}
                             for c in CELLS},
                          "median_spreadR_M": float(ex_h.M_spreadR.median())}
log("D2 seen holdout:", json.dumps(res["D2_seen_holdout"]))

(OUT / "results.json").write_text(json.dumps(res, indent=1, default=float))
ex_u.to_csv(OUT / "trades.csv", index=False)
(OUT / "run.log").write_text("\n".join(LOG) + "\n")
log("wrote", OUT / "results.json")
