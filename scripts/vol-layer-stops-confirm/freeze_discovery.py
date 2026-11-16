"""vol-layer-stops-confirm: freeze the stop-hit model, bins and power numbers from DISCOVERY data only.

Reads only the stage 2 / stage 3 discovery outputs (sessions 2016-10-24 .. 2022-12-30). Nothing from 2023 onward is
read; every input frame is asserted to end on or before 2022-12-30.

Inputs (from the data checkout, DATA_ROOT, default = this repo):
    analysis/output/vol-layer-deep/execution/wide/{entries.parquet, profiles.json, overshoot.parquet}   (stage 3)
    analysis/output/noise-threshold/entries.parquet                                                     (stage 2)
Output:
    analysis/output/vol-layer-stops-confirm/discovery/frozen_model.json

What it freezes (forge/VOL_LAYER_STOPS_CONFIRM_PREREG.md, appendix A):
    M_full  P(hit) = 2 Phi(-exp(eta)), eta = g0 + g1 ln d + g2 ln sqrt(V) + g3 (spread / d) + g4 W
    M_sigma P(hit) = 2 Phi(-exp(eta)), eta = a_h + b ln d        (knows the stop size and the horizon, nothing else)
    M_rw    P(hit) = 2 Phi(-(d - spread) / sqrt(V))               (no fit; the random-walk benchmark)
  A random walk on the vol clock with the spread paid is g = (0, 1, -1, -1, 0).

    python -X utf8 scripts/vol-layer-stops-confirm/freeze_discovery.py         -> frozen_model.json (~16 min)
    python -X utf8 scripts/vol-layer-stops-confirm/freeze_discovery.py month   -> steady_month.json (cell b, by month)
    (set DATA_ROOT to the checkout that holds analysis/output/ if running from a worktree)
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scipy.stats import genpareto, norm

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.environ.get("DATA_ROOT", ROOT))
EXE = DATA / "analysis/output/vol-layer-deep/execution/wide"
NOISE = DATA / "analysis/output/noise-threshold"
OUT = ROOT / "analysis/output/vol-layer-stops-confirm/discovery"

SEED = 20261116
B, BLOCK = 2000, 20
DISC_END = "2022-12-30"
FIT_START = "2017-01-01"                # stage 3 read 2017-2022; 2016 is a two-month stub
HZ = ["m15", "h1", "h4", "eod", "next", "s5"]
D = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0]
CONFIRM_DATES = 945                     # weekdays 2023-01-02 .. 2026-08-20 with a London session (approx.)
KLASS = {"fx_majors": {"EURUSD", "GBPUSD", "USDJPY", "USDCHF", "USDCAD", "AUDUSD", "NZDUSD"},
         "gold": {"GOLD"}, "indices": {"DE30", "DOW", "NQ", "SPX500", "UK100", "US2000", "US30"}}


def klass(s):
    for k, v in KLASS.items():
        if s in v:
            return k
    return "fx_crosses"


# ------------------------------------------------------------------ bootstrap (stationary, by date)
def boot_weights(n, block=BLOCK, b=B, seed=SEED):
    rng = np.random.default_rng(seed)
    W = np.zeros((b, n), dtype=np.float32)
    p = 1.0 / block
    for r in range(b):
        jumps = rng.random(n) < p
        starts = rng.integers(n, size=n)
        idx = np.empty(n, dtype=np.int64)
        i = rng.integers(n)
        for t in range(n):
            if t and jumps[t]:
                i = starts[t]
            idx[t] = i
            i = (i + 1) % n
        W[r] = np.bincount(idx, minlength=n)
    return W


def ci(point, reps):
    reps = reps[np.isfinite(reps)]
    return {"est": round(float(point), 5), "lo": round(float(np.percentile(reps, 2.5)), 5),
            "hi": round(float(np.percentile(reps, 97.5)), 5), "se": round(float(np.std(reps)), 5)}


# ------------------------------------------------------------------ long frame
def vol_clock(E, profs):
    """V per horizon: share of a 24h day's variance inside the window (as execution_wide.long_form)."""
    V = {h: np.full(len(E), np.nan) for h in HZ}
    for sym, idx in E.groupby("inst").indices.items():
        cum = np.r_[0.0, np.cumsum(profs[sym])]
        cumf = lambda x: np.interp(x, np.arange(289), cum)  # noqa: E731
        g = E.iloc[idx]
        a = (g.minute.to_numpy() + 1) / 5.0
        ca = cumf(a)
        for h in ("m15", "h1", "h4"):
            bx = a + g[f"min_{h}"].to_numpy() / 5.0
            V[h][idx] = np.where(bx <= 288, cumf(np.minimum(bx, 288)) - ca, 1 - ca + cumf(np.clip(bx - 288, 0, 288)))
        V["eod"][idx] = cumf(264) - ca
        V["next"][idx] = 1 - ca + cumf(264)
        V["s5"][idx] = 1 - ca + 4 + cumf(264)
    return V


def weekend_days(E, h):
    """Weekend calendar days (Sat, Sun) inside the hold: 0 for intraday horizons."""
    start = pd.to_datetime(E.date) + pd.to_timedelta(E.minute, unit="m")
    end = start + pd.to_timedelta(E[f"min_{h}"].fillna(0), unit="m")
    s0 = start.dt.normalize().to_numpy().astype("datetime64[D]")
    e0 = end.dt.normalize().to_numpy().astype("datetime64[D]")
    span = (e0 - s0).astype(int)
    bd = np.busday_count(s0 + 1, e0 + 1)
    return (span - bd).astype(np.float32)


def long_frame(E, profs, sigma_col="s"):
    """One row per entry x side x horizon x stop size. Stop distance d is in units of sigma_col."""
    V = vol_clock(E, profs)
    scale = (E.s / E[sigma_col]).to_numpy()            # mae is in units of s; re-express in sigma_col units
    di = E.di.to_numpy()
    sp = E.spread.to_numpy() * scale
    cols = {k: [] for k in ("y", "lnd", "lnsv", "spd", "w", "di", "hz", "d", "inst", "minute", "sp")}
    for h in HZ:
        wk = weekend_days(E, h) / 2.0                    # weekends crossed
        for side in ("L", "S"):
            mae = E[f"{side}_{h}"].to_numpy() * scale
            ok = np.isfinite(mae) & np.isfinite(V[h]) & (V[h] > 0)
            for d in D:
                cols["y"].append((mae[ok] >= d).astype(np.int8))
                cols["lnd"].append(np.full(ok.sum(), np.log(d), np.float32))
                cols["lnsv"].append((0.5 * np.log(V[h][ok])).astype(np.float32))
                cols["spd"].append((sp[ok] / d).astype(np.float32))
                cols["w"].append(wk[ok].astype(np.float32))
                cols["di"].append(di[ok].astype(np.int32))
                cols["hz"].append(np.full(ok.sum(), HZ.index(h), np.int8))
                cols["d"].append(np.full(ok.sum(), d, np.float32))
                cols["inst"].append(E.inst_code.to_numpy()[ok].astype(np.int16))
                cols["minute"].append(E.minute.to_numpy()[ok].astype(np.int16))
                cols["sp"].append(sp[ok].astype(np.float32))
    return {k: np.concatenate(v) for k, v in cols.items()}


# ------------------------------------------------------------------ models
def p_link(eta):
    return np.clip(2 * norm.cdf(-np.exp(eta)), 1e-7, 1 - 1e-7)


def fit(X, y, x0):
    def nll(g):
        eta = X @ g
        z = np.exp(eta)
        p = np.clip(2 * norm.cdf(-z), 1e-9, 1 - 1e-9)
        dp = -2 * norm.pdf(z) * z
        ll = y * np.log(p) + (1 - y) * np.log1p(-p)
        dl = (y / p - (1 - y) / (1 - p)) * dp
        return -ll.mean(), -(X.T @ dl) / len(y)
    r = minimize(nll, x0, jac=True, method="L-BFGS-B")
    return r.x, float(r.fun)


def design_full(F, m=None):
    sl = slice(None) if m is None else m
    n = len(F["y"][sl])
    return np.column_stack([np.ones(n), F["lnd"][sl], F["lnsv"][sl], F["spd"][sl], F["w"][sl]]).astype(np.float64)


def design_sigma(F, m=None):
    sl = slice(None) if m is None else m
    hz = F["hz"][sl]
    X = np.zeros((len(hz), len(HZ) + 1))
    X[np.arange(len(hz)), hz] = 1
    X[:, -1] = F["lnd"][sl]
    return X


def eta_full(F, g, keep=(0, 1, 2, 3, 4)):
    terms = [None, F["lnd"], F["lnsv"], F["spd"], F["w"]]
    eta = np.zeros(len(F["y"]))
    for c, k in zip(g, keep):
        eta += c if k == 0 else c * terms[k].astype(np.float64)
    return eta


def predict(F, gf, gs):
    pf = p_link(eta_full(F, gf))
    ps = p_link(np.asarray(gs[:-1])[F["hz"]] + gs[-1] * F["lnd"].astype(np.float64))
    prw = np.clip(2 * norm.cdf(-np.maximum(np.exp(F["lnd"]) - F["sp"], 0) / np.exp(F["lnsv"])), 1e-7, 1 - 1e-7)
    return pf, ps, prw


# ------------------------------------------------------------------ scored statistics from per-date sums
def date_sums(di, nd, y, pf, ps):
    w = np.ones_like(pf)
    S = {"n": w, "y": y, "p": pf, "pp": pf * pf, "yp": y * pf, "bf": (y - pf) ** 2, "bs": (y - ps) ** 2}
    return {k: np.bincount(di, weights=v, minlength=nd) for k, v in S.items()}


def stats_from(S):
    n, y, p, pp, yp = S["n"], S["y"], S["p"], S["pp"], S["yp"]
    citl = (y - p) / n
    vp = pp / n - (p / n) ** 2
    cyp = yp / n - (y / n) * (p / n)
    slope = cyp / vp
    bss = 1 - S["bf"] / S["bs"]
    return citl, slope, bss


def boot_stats(S, W):
    pt = stats_from({k: v.sum() for k, v in S.items()})
    reps = stats_from({k: W @ v for k, v in S.items()})
    return {"citl_pp": ci(100 * pt[0], 100 * reps[0]), "mz_slope": ci(pt[1], reps[1]), "bss_pct": ci(100 * pt[2], 100 * reps[2])}


def mde(se, scale=1.0):
    return round(float(2.8016 * se * scale), 5)        # (1.96 + 0.8416) x SE: 80% power, two-sided 5%


def main():
    t0 = time.time()
    OUT.mkdir(parents=True, exist_ok=True)
    E = pd.read_parquet(EXE / "entries.parquet")
    assert E.date.max() <= DISC_END, "discovery only"
    E = E[(E.date >= FIT_START) & E.s_lag.notna() & E.s_fix.notna()].reset_index(drop=True)
    profs = json.loads((EXE / "profiles.json").read_text(encoding="utf-8"))
    dates = np.sort(E.date.unique())
    dpos = pd.Series(np.arange(len(dates)), index=dates)
    E["di"] = dpos[E.date].to_numpy()
    insts = sorted(E.inst.unique())
    E["inst_code"] = E.inst.map({s: i for i, s in enumerate(insts)})
    nd = len(dates)
    print("entries", len(E), "dates", nd, f"{time.time() - t0:.0f}s", flush=True)
    F = long_frame(E, profs)
    y = F["y"].astype(np.float64)
    print("rows", len(y), f"{time.time() - t0:.0f}s", flush=True)

    # ---- fit on a seeded 25% subsample of entries (coefficients are precise far beyond what matters)
    rng = np.random.default_rng(SEED)
    sub = rng.random(len(y)) < 0.25
    gf, nll_f = fit(design_full(F, sub), y[sub], np.array([0.0, 1.0, -1.0, -1.0, 0.0]))
    gs, nll_s = fit(design_sigma(F, sub), y[sub], np.r_[np.zeros(len(HZ)), 1.0])
    print("full", np.round(gf, 4), nll_f, "sigma", np.round(gs, 4), nll_s, f"{time.time() - t0:.0f}s", flush=True)

    # ---- pseudo-confirm inside discovery: fit 2017-2019, score 2020-2022 (for the power table only)
    split = dpos[dpos.index >= "2020-01-01"].iloc[0]
    early = F["di"] < split
    sub_e = early & sub
    gf_e, _ = fit(design_full(F, sub_e), y[sub_e], gf)
    gs_e, _ = fit(design_sigma(F, sub_e), y[sub_e], gs)

    pf, ps, prw = predict(F, gf, gs)
    W = boot_weights(nd)
    S = date_sums(F["di"], nd, y, pf, ps)
    insample = boot_stats(S, W)
    pf_e, ps_e, _ = predict(F, gf_e, gs_e)
    late = ~early
    di_late = F["di"][late] - split
    nl = nd - split
    W_l = boot_weights(nl)
    pseudo = boot_stats(date_sums(di_late, nl, y[late], pf_e[late], ps_e[late]), W_l)
    print("in-sample", insample, "\npseudo", pseudo, f"{time.time() - t0:.0f}s", flush=True)

    # ---- in-sample calibration by horizon, stop size, class, year (descriptive; shows the model fits each part)
    yr = np.asarray([d[:4] for d in dates])[F["di"]]
    kl = np.asarray([klass(s) for s in insts])[F["inst"]]
    parts = {}
    for name, key in (("hz", np.asarray(HZ)[F["hz"]]), ("d", F["d"].astype(str)), ("class", kl), ("year", yr)):
        for k in np.unique(key):
            m = key == k
            parts[f"{name}:{k}"] = {"n": int(m.sum()), "hit": round(float(y[m].mean()), 4), "p_full": round(float(pf[m].mean()), 4),
                                    "p_sigma": round(float(ps[m].mean()), 4), "p_rw": round(float(prw[m].mean()), 4),
                                    "bss_pct": round(100 * float(1 - ((y[m] - pf[m]) ** 2).sum() / ((y[m] - ps[m]) ** 2).sum()), 3)}
    # probability bins for the reliability chart, frozen
    edges = np.unique(np.round(np.quantile(pf, np.linspace(0, 1, 21)), 6))
    edges[0], edges[-1] = 0.0, 1.0
    # ablations (descriptive): refit without each term
    abl = {}
    for nm, drop in (("no_vol_clock", 2), ("no_spread", 3), ("no_weekend", 4)):
        keep = [i for i in range(5) if i != drop]
        g_, _ = fit(design_full(F, sub)[:, keep], y[sub], gf[keep])
        p_ = p_link(eta_full(F, g_, keep))
        abl[nm] = {"coef": [round(float(x), 5) for x in g_],
                   "brier_vs_full_pct": round(100 * float(((y - p_) ** 2).sum() / ((y - pf) ** 2).sum() - 1), 3)}

    del pf, ps, prw, pf_e, ps_e
    # ---- +1 lag: sigma delayed one session (both models re-scored with the frozen coefficients)
    Fl = long_frame(E, profs, sigma_col="s_lag")
    pfl, psl, _ = predict(Fl, gf, gs)
    lag = boot_stats(date_sums(Fl["di"], nd, Fl["y"].astype(np.float64), pfl, psl), W)
    del Fl


    # ---- cell b: steadiness by calendar quarter (1 sigma stop to 22:00, bid/ask, hit minus random walk)
    Vx = vol_clock(E, profs)["eod"]
    out_b = {}
    q = np.asarray([f"{d[:4]}Q{(int(d[5:7]) - 1) // 3 + 1}" for d in dates])
    qi_codes, q_lab = pd.factorize(q)
    rw = 2 * norm.cdf(-1.0 / np.sqrt(np.clip(Vx, 1e-9, None)))
    okv = np.isfinite(Vx) & E.L_eod.notna().to_numpy()
    di0 = E.di.to_numpy()[okv]
    qd = qi_codes[di0]
    nq = len(q_lab)
    xs = {}
    for nm, mult in (("plain", np.ones(len(E))), ("fixed", (E.s_fix / E.s).to_numpy()), ("lag", (E.s_lag / E.s).to_numpy())):
        tot = 0
        for side in ("L", "S"):
            tot = tot + ((E[f"{side}_eod"].to_numpy()[okv] >= 1.0 * mult[okv]).astype(float) - rw[okv])
        xs[nm] = tot / 2
    sums = {nm: np.bincount(di0, weights=v, minlength=nd) for nm, v in xs.items()}
    cnt = np.bincount(di0, minlength=nd).astype(float)
    Qm = np.zeros((nd, nq), dtype=np.float32)
    Qm[np.arange(nd), qi_codes] = 1

    def qsd(sx, sc):
        num, den = sx @ Qm, sc @ Qm
        r = num / np.maximum(den, 1e-9)
        return np.std(r, axis=-1, ddof=1)

    sd_pt = {nm: float(qsd(sums[nm][None, :], cnt[None, :])[0]) for nm in sums}
    sd_rep = {nm: qsd(W * sums[nm], W * cnt) for nm in sums}
    delta = sd_rep["fixed"] - sd_rep["plain"]
    nq_conf = 14.6
    se_scale_q = float(np.sqrt((nq - 1) / (nq_conf - 1)))
    out_b = {"quarters": int(nq), "sd_pp": {k: round(100 * v, 3) for k, v in sd_pt.items()},
             "delta_fixed_minus_plain_pp": ci(100 * (sd_pt["fixed"] - sd_pt["plain"]), 100 * delta),
             "delta_lag_minus_plain_pp": ci(100 * (sd_pt["lag"] - sd_pt["plain"]), 100 * (sd_rep["lag"] - sd_rep["plain"])),
             "confirm_quarters": nq_conf, "se_scale": round(se_scale_q, 3)}
    per_q = {lab: {nm: round(100 * float(sums[nm][qi_codes == k].sum() / cnt[qi_codes == k].sum()), 3) for nm in sums} for k, lab in enumerate(q_lab)}
    out_b["per_quarter_pp"] = per_q
    print("cell b", out_b["sd_pp"], out_b["delta_fixed_minus_plain_pp"], flush=True)

    # ---- cell c: noise-map excess(d) to 21:00 (mid), pooled, with date-block SE
    N = pd.read_parquet(NOISE / "entries.parquet")
    assert N.date.max() <= DISC_END
    N = N[N.hz == "eod"]
    ndates = np.sort(N.date.unique())
    npos = pd.Series(np.arange(len(ndates)), index=ndates)
    ndi = npos[N.date].to_numpy()
    Wn = boot_weights(len(ndates))
    out_c = {"spread_sigma_median_by_class": N.groupby("klass").spread.median().round(4).to_dict(),
             "spread_sigma_median_pooled": round(float(N.spread.median()), 4), "cells": {}}
    for d in (0.25, 0.5, 1.0):
        m = (N.mae >= d).to_numpy()
        x = (N.final.to_numpy() + d) * m
        a = np.bincount(ndi, weights=x, minlength=len(ndates))
        b = np.bincount(ndi, weights=m.astype(float), minlength=len(ndates))
        pt = a.sum() / b.sum()
        reps = (Wn @ a) / (Wn @ b)
        c = ci(pt, reps)
        se_conf = c["se"] * np.sqrt(len(ndates) / CONFIRM_DATES)
        out_c["cells"][str(d)] = {**c, "hits": int(m.sum()), "se_confirm": round(float(se_conf), 5),
                                  "tost_margin_80pct": round(float((1.6449 + 0.8416) * se_conf), 5)}
    print("cell c", out_c, flush=True)

    # ---- cell d: weekend stop-through (stage 3 overshoot records, plain sigma stops, 1 sigma)
    O = pd.read_parquet(EXE / "overshoot.parquet")
    assert O.date.max() <= DISC_END
    O = O[(O.date >= FIT_START) & (O.scale == "p")]
    O["weekend"] = O.gap_min > 36 * 60
    out_d = {}
    for dd in (0.5, 1.0, 2.0):
        for wk in (False, True):
            part = O[(O.d == dd) & (O.weekend == wk)]
            o = part.over[part.over > 0].to_numpy()
            u = float(np.quantile(o, 0.9))
            xi, _, sc = genpareto.fit(o[o > u] - u, floc=0)
            odates = np.sort(part.date.unique())
            opos = pd.Series(np.arange(len(odates)), index=odates)
            odi = opos[part.date].to_numpy()
            Wo = boot_weights(len(odates), b=500)
            a = np.bincount(odi, weights=part.lossR_net.to_numpy(), minlength=len(odates))
            bb = np.bincount(odi, minlength=len(odates)).astype(float)
            out_d[f"{dd}_{'weekend' if wk else 'weekday'}"] = {
                "hits": int(len(part)), "gap_rate": round(float((part.over > 0).mean()), 4),
                "lossR_net": ci(a.sum() / bb.sum(), (Wo @ a) / (Wo @ bb)),
                "p99_over_sigma": round(float(np.quantile(o, 0.99)), 4), "gpd_u": round(u, 5), "gpd_xi": round(float(xi), 3), "gpd_scale": round(float(sc), 5)}
    print("cell d", out_d, flush=True)

    scale_conf = float(np.sqrt(nd / CONFIRM_DATES))
    scale_pseudo = float(np.sqrt(nl / CONFIRM_DATES))
    res = {
        "slug": "vol-layer-stops-confirm", "seed": SEED, "bootstrap": {"type": "stationary by date", "block": BLOCK, "B": B},
        "fit_window": [FIT_START, DISC_END], "dates": int(nd), "entries": int(len(E)), "rows": int(len(y)), "instruments": insts,
        "horizons": HZ, "d_grid": D,
        "model_full": {"link": "P = 2*Phi(-exp(eta))", "terms": ["1", "ln d", "ln sqrt(V)", "spread/d", "weekends crossed"],
                       "coef": [round(float(x), 6) for x in gf], "nll": round(nll_f, 6)},
        "model_sigma": {"link": "P = 2*Phi(-exp(eta))", "terms": [f"1[h={h}]" for h in HZ] + ["ln d"],
                        "coef": [round(float(x), 6) for x in gs], "nll": round(nll_s, 6)},
        "model_rw": "P = 2*Phi(-max(d - spread, 0) / sqrt(V)), no fit",
        "pseudo_fit_2017_2019": {"full": [round(float(x), 6) for x in gf_e], "sigma": [round(float(x), 6) for x in gs_e]},
        "insample": insample, "pseudo_confirm_2020_2022": pseudo, "pseudo_dates": int(nl),
        "se_scale_to_confirm": {"from_insample": round(scale_conf, 3), "from_pseudo": round(scale_pseudo, 3)},
        "lag": lag, "parts_insample": parts, "ablation": abl, "reliability_bin_edges": [round(float(x), 6) for x in edges],
        "cell_b": out_b, "cell_c": out_c, "cell_d": out_d,
    }
    (OUT / "frozen_model.json").write_text(json.dumps(res, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    print("done", f"{time.time() - t0:.0f}s")


def steady_month():
    """Cell b by calendar month with a whole-month cluster bootstrap (the registered form). -> steady_month.json"""
    E = pd.read_parquet(EXE / "entries.parquet")
    assert E.date.max() <= DISC_END, "discovery only"
    E = E[(E.date >= FIT_START) & E.s_lag.notna() & E.s_fix.notna()].reset_index(drop=True)
    profs = json.loads((EXE / "profiles.json").read_text(encoding="utf-8"))
    Vx = vol_clock(E, profs)["eod"]
    ok = np.isfinite(Vx) & E.L_eod.notna().to_numpy()
    rng = np.random.default_rng(SEED)
    out = {"window": [FIT_START, DISC_END], "confirm_months": 43.7, "cells": {}}
    for d0 in (0.5, 1.0, 1.5):
        rw = 2 * norm.cdf(-d0 / np.sqrt(np.clip(Vx[ok], 1e-9, None)))
        df = pd.DataFrame({"m": E.date.str[:7].to_numpy()[ok]})
        for nm, mult in (("plain", np.ones(len(E))), ("fixed", (E.s_fix / E.s).to_numpy()), ("lag", (E.s_lag / E.s).to_numpy())):
            df[nm] = sum(((E[f"{s_}_eod"].to_numpy()[ok] >= d0 * mult[ok]).astype(float) - rw) for s_ in "LS") / 2
        M = df.groupby("m").mean()
        k = len(M)
        idx = rng.integers(k, size=(B, k))
        sd = {nm: M[nm].to_numpy()[idx].std(axis=1, ddof=1) for nm in ("plain", "fixed", "lag")}
        dl = sd["fixed"] - sd["plain"]
        se_c = float(dl.std() * np.sqrt((k - 1) / (43.7 - 1)))
        out["cells"][str(d0)] = {"months": k, "sd_pp": {nm: round(100 * float(M[nm].std()), 3) for nm in sd},
                                 "delta_pp": ci(100 * (M.fixed.std() - M.plain.std()), 100 * dl),
                                 "delta_fixed_minus_lagplain_pp": round(100 * float(M.fixed.std() - M.lag.std()), 3),
                                 "se_confirm_pp": round(100 * se_c, 3), "mde_pp": round(100 * 2.8016 * se_c, 3)}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "steady_month.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "month":
        steady_month()
    else:
        main()
