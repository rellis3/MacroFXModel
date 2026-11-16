"""noise-area-build: 1,440 designs per instrument from the 'Beat the Market' theory, walk-forward plateau choice.

Prereg: forge/NOISE_AREA_BUILD_PREREG.md (seed 20261116). Day matrices, bands, VWAP and daily sigma come from
scripts/noise-area-momentum/engine.py (the parents' code, unchanged). Lockbox: the day caches stop at 2026-08-21.
"""
import itertools
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "noise-area-momentum"))
import engine as E  # noqa: E402

ROOT = E.ROOT
OUT = ROOT / "analysis/output/noise-area-build"
SEED = 20261116
B = 2000
INSTR = ["SPY", "ES", "NQ", "YM", "RTY"]
COST = {"SPY": 0.019, "ES": 0.59, "NQ": 0.725, "YM": 2.9, "RTY": 0.29}

VM = [0.75, 1.0, 1.25, 1.5]
LB = [7, 14, 28]
CK = [15, 30, 60]
EXITS = ["vwap", "band", "trail", "hold", "flip"]
FILTERS = ["none", "vix_hi", "vix_lo", "nr4"]
SIZING = ["1x", "vt"]
SHAPE = (len(VM), len(LB), len(CK), len(EXITS), len(FILTERS), len(SIZING))
NSPEC = int(np.prod(SHAPE))
PAPER = (1, 1, 1, 0, 0, 0)  # 1.0 / 14 / 30 / vwap / none / 1x
VIX_FILE = Path(__file__).resolve().parents[2] / "analysis/output/rangebook/cboe/VIX.csv"
if not VIX_FILE.exists():  # scratch copy of the repo: read from the main checkout
    VIX_FILE = E.DATA / "analysis/output/rangebook/cboe/VIX.csv"
PAPER_END = np.datetime64("2024-04-30")
HOLD_START = np.datetime64("2024-05-01")


def checks_for(step):
    """0-based index of the bars ENDING 10:00 ... last check (15:45 / 15:30 / 15:00)."""
    return np.arange(29, {15: 374, 30: 359, 60: 329}[step] + 1, step)


# ------------------------------------------------------------------------------------------- strategy (generalised)
def positions(C, ub, lb, vw, last, checks, exit_):
    D = C.shape[0]
    P = np.zeros((D, len(checks)))
    s = np.zeros(D)
    for k, c in enumerate(checks):
        live = c < last
        cc, u, l, v = C[:, c], ub[:, c], lb[:, c], vw[:, c]
        band = ~np.isnan(u) & ~np.isnan(l)
        up, dn = band & (cc > u), band & (cc < l)
        if exit_ == "vwap":
            new = np.where(up & (cc > v), 1.0, np.where(dn & (cc < v), -1.0, 0.0))
        elif exit_ == "band":
            new = np.where(up, 1.0, np.where(dn, -1.0, 0.0))
        elif exit_ == "trail":
            hl, hs = (s > 0) & (cc > v), (s < 0) & (cc < v)
            new = np.where(hl | (up & (cc > v)), 1.0, np.where(hs | (dn & (cc < v)), -1.0, 0.0))
        elif exit_ == "hold":
            new = np.where(s != 0, s, np.where(up & (cc > v), 1.0, np.where(dn & (cc < v), -1.0, 0.0)))
        elif exit_ == "flip":
            new = np.where(up, 1.0, np.where(dn, -1.0, s))
        P[:, k] = np.where(live, new, s)
        s = P[:, k]
    return P


def day_pnl(Z, P, checks, cost_pts):
    """1x gross return and cost per day (fractions of the open)."""
    C, O, last, uo = Z["close"], Z["open"], Z["last"], Z["uopen"]
    D = len(O)
    rows = np.arange(D)
    ends = np.concatenate([checks[1:], [E.NBAR - 1]])
    gross = np.zeros(D)
    for k, c in enumerate(checks):
        e = np.minimum(ends[k], last)
        g = np.where(c < e, P[:, k] * (C[rows, e] - C[:, c]) / O, 0.0)
        gross += g
    prevP = np.concatenate([np.zeros((D, 1)), P], axis=1)
    units = np.abs(np.diff(prevP, axis=1)).sum(1) + np.abs(P[:, -1])
    return gross, units * (cost_pts / 2.0) / uo, units


# ------------------------------------------------------------------------------------------- pre-open day filters
def vix_prior(days):
    v = pd.read_csv(VIX_FILE)
    v["d"] = pd.to_datetime(v["DATE"], format="%m/%d/%Y")
    v = v.set_index("d")["CLOSE"].astype(float).sort_index()
    med = v.rolling(252, min_periods=200).median()
    dd = pd.to_datetime(days.astype("datetime64[D]"))
    pos = v.index.searchsorted(dd, side="left") - 1  # last VIX close strictly before the session date
    ok = pos >= 0
    pv = np.where(ok, v.to_numpy()[pos.clip(0)], np.nan)
    pm = np.where(ok, med.to_numpy()[pos.clip(0)], np.nan)
    return pv, pm


def day_filters(Z):
    pv, pm = vix_prior(Z["days"])
    dh = np.nanmax(Z["high"], axis=1)
    dl = np.nanmin(Z["low"], axis=1)
    rng = (dh - dl) / Z["open"]
    nr4 = np.zeros(len(rng), bool)
    for d in range(4, len(rng)):
        w = rng[d - 4:d]
        nr4[d] = np.all(np.isfinite(w)) and w[-1] <= w.min()
    return {"none": np.ones(len(rng), bool), "vix_hi": np.nan_to_num(pv > pm, nan=0).astype(bool),
            "vix_lo": np.nan_to_num(pv <= pm, nan=0).astype(bool), "nr4": nr4}


# ------------------------------------------------------------------------------------------- the scan
def scan(sym):
    t0 = time.time()
    Z = E.build_days(sym)
    C, O, last = Z["close"], Z["open"], Z["last"]
    D = len(O)
    vw = E.vwap(C, Z["high"], Z["low"], Z["vol"])
    sd, _ = E.daily_sigma(C, last, Z["prev"])
    lev = np.nan_to_num(np.minimum(4.0, 0.02 / sd))
    filt = day_filters(Z)
    hi_ref, lo_ref = np.fmax(O, Z["prev"]), np.fmin(O, Z["prev"])
    NET = np.zeros((NSPEC, D), np.float32)
    UNITS = np.zeros(NSPEC, np.float32)
    UD = np.zeros((NSPEC, D), np.uint8)  # position changes per day (2 = one round trip)
    ctx = dict(vw=vw, lev=lev, filt=filt, hi_ref=hi_ref, lo_ref=lo_ref, sig={})
    ck_arr = {c: checks_for(c) for c in CK}
    for il, lbk in enumerate(LB):
        sig = E.sigma_open(C, O, last, lbk)
        ctx["sig"][lbk] = sig
        for iv, vm in enumerate(VM):
            ub = hi_ref[:, None] * (1 + vm * sig)
            lb = lo_ref[:, None] * (1 - vm * sig)
            for ic, ck in enumerate(CK):
                for ie, ex in enumerate(EXITS):
                    P = positions(C, ub, lb, vw, last, ck_arr[ck], ex)
                    g, c, u = day_pnl(Z, P, ck_arr[ck], COST[sym])
                    n1 = g - c
                    for jf, fn in enumerate(FILTERS):
                        m = filt[fn]
                        for js, sz in enumerate(SIZING):
                            idx = np.ravel_multi_index((iv, il, ic, ie, jf, js), SHAPE)
                            NET[idx] = np.where(m, n1 * (lev if sz == "vt" else 1.0), 0.0)
                            UNITS[idx] = float(np.mean(np.where(m, u, 0.0)))
                            UD[idx] = np.where(m, u, 0).astype(np.uint8)
    print(f"{sym}: {D} days, {NSPEC} designs, {time.time() - t0:.0f}s", flush=True)
    return Z, NET, UNITS, UD, ctx


def spec_trades(Z, ctx, i, rows, cost_pts):
    """Trade list for design i on day indices `rows`: (day, entry bar, exit bar, side, lev, gross bp 1x, net bp on equity)."""
    iv, il, ic, ie, jf, js = np.unravel_index(i, SHAPE)
    C, O, last, uo = Z["close"], Z["open"], Z["last"], Z["uopen"]
    sig = ctx["sig"][LB[il]]
    ub = ctx["hi_ref"][:, None] * (1 + VM[iv] * sig)
    lb = ctx["lo_ref"][:, None] * (1 - VM[iv] * sig)
    ck = checks_for(CK[ic])
    P = positions(C, ub, lb, ctx["vw"], last, ck, EXITS[ie])
    keep = ctx["filt"][FILTERS[jf]]
    lev = ctx["lev"] if SIZING[js] == "vt" else np.ones(len(O))
    out = []
    K = len(ck)
    for d in rows:
        if not keep[d]:
            continue
        row = P[d]
        k = 0
        while k < K:
            if row[k] == 0:
                k += 1
                continue
            side = row[k]
            j = k + 1
            while j < K and row[j] == side and ck[j] < last[d]:
                j += 1
            closed = j < K and ck[j] < last[d]
            ex_bar = int(ck[j]) if closed else int(last[d])
            g = side * (C[d, ex_bar] - C[d, ck[k]]) / O[d] * 1e4
            n = (g - cost_pts / uo[d] * 1e4) * lev[d]
            out.append((int(d), int(ck[k]), ex_bar, int(side), round(float(lev[d]), 2), round(float(g), 2), round(float(n), 2)))
            k = j if closed else K
    return out


def sharpe_all(NET, mask):
    X = NET[:, mask].astype(np.float64)
    mu, sdv = X.mean(1), X.std(1, ddof=1)
    return np.where(sdv > 0, mu / sdv * np.sqrt(252), 0.0)


def plateau(S):
    A = S.reshape(SHAPE)
    pad = np.pad(A, ((1, 1), (1, 1), (1, 1), (0, 0), (0, 0), (0, 0)), constant_values=np.nan)
    stack = []
    for a, b, c in itertools.product(range(3), repeat=3):
        stack.append(pad[a:a + SHAPE[0], b:b + SHAPE[1], c:c + SHAPE[2]])
    return np.nanmedian(np.stack(stack), axis=0).ravel()


def paper_dist():
    g = np.indices(SHAPE).reshape(len(SHAPE), -1).T
    return np.abs(g - np.array(PAPER)).sum(1)


PDIST = None


def choose(S):
    pl = plateau(S)
    best = np.nanmax(pl)
    cand = np.nonzero(pl >= best - 1e-12)[0]
    return int(cand[np.argmin(PDIST[cand])]), pl


def spec_name(i):
    iv, il, ic, ie, jf, js = np.unravel_index(i, SHAPE)
    return f"{VM[iv]}/{LB[il]}/{CK[ic]}m/{EXITS[ie]}/{FILTERS[jf]}/{SIZING[js]}"


def spec_dict(i):
    iv, il, ic, ie, jf, js = np.unravel_index(i, SHAPE)
    return dict(vm=VM[iv], lb=LB[il], ck=CK[ic], exit=EXITS[ie], filter=FILTERS[jf], sizing=SIZING[js])


# ------------------------------------------------------------------------------------------- statistics
def week_ids(days):
    d = pd.to_datetime(days.astype("datetime64[D]"))
    iso = d.isocalendar()
    return (iso.year.to_numpy() * 100 + iso.week.to_numpy()).astype(int)


def boot(rows, wk, rng, fn):
    """rows: (k, n) daily streams; week-cluster bootstrap of fn(mu, sd) per stream -> (B, k)."""
    u, inv = np.unique(wk, return_inverse=True)
    nw = len(u)
    S = np.zeros((rows.shape[0], nw))
    S2 = np.zeros_like(S)
    N = np.bincount(inv, minlength=nw).astype(float)
    for r in range(rows.shape[0]):
        S[r] = np.bincount(inv, weights=rows[r], minlength=nw)
        S2[r] = np.bincount(inv, weights=rows[r] ** 2, minlength=nw)
    W = rng.multinomial(nw, np.full(nw, 1.0 / nw), size=B).astype(float)
    n = W @ N
    mu = (W @ S.T) / n[:, None]
    var = (W @ S2.T) / n[:, None] - mu ** 2
    var = var * n[:, None] / (n[:, None] - 1)
    return fn(mu, np.sqrt(np.maximum(var, 1e-30)))


def shp(x):
    x = np.asarray(x, float)
    s = x.std(ddof=1)
    return float(x.mean() / s * np.sqrt(252)) if s > 0 else 0.0


def max_dd(x):
    eq = np.cumprod(1 + np.asarray(x, float))
    return float((eq / np.maximum.accumulate(eq) - 1).min())


def cagr(x, n):
    eq = np.prod(1 + np.asarray(x, float))
    return float(eq ** (252 / max(n, 1)) - 1)


def deflated_sharpe(sr_best_d, sr_all_d, n_obs, skew=0.0, kurt=3.0):
    """Bailey & Lopez de Prado DSR with per-day Sharpes. Returns probability the true SR > the expected max of N nulls."""
    from scipy.stats import norm
    N = len(sr_all_d)
    v = np.var(sr_all_d, ddof=1)
    g = 0.5772156649
    sr0 = np.sqrt(v) * ((1 - g) * norm.ppf(1 - 1 / N) + g * norm.ppf(1 - 1 / (N * np.e)))
    z = (sr_best_d - sr0) * np.sqrt(n_obs - 1) / np.sqrt(1 - skew * sr_best_d + (kurt - 1) / 4 * sr_best_d ** 2)
    return float(norm.cdf(z)), float(sr0 * np.sqrt(252))


def bh(p, q=0.10):
    p = np.asarray(p)
    o = np.argsort(p)
    m = len(p)
    thr = q * np.arange(1, m + 1) / m
    ok = p[o] <= thr
    k = np.max(np.nonzero(ok)[0]) + 1 if ok.any() else 0
    res = np.zeros(m, bool)
    res[o[:k]] = True
    return res
