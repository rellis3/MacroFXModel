"""Vol-Layer stage 3, CROSS-LAYER panel ("system"): do the layers interact, or is each one enough alone?

C.OG: every position is the product of all the layers. Stages 1-2 looked at each layer alone. This joins, per instrument
and London session, point-in-time:
  S  sigma position         percentile of today's live sigma among the previous 252 sessions (the over-reaction axis:
                            stage 2 found range/sigma 1.86 on the lowest-sigma decile, 1.41 on the highest)
  E  forecast error         F5 from state.py: EWMA (half-life 10) of log(sqrt(RV5)/sigma) through t-1, minus its own
                            expanding mean (stage 2's strongest field beyond sigma)
  R  turbulent regime       C.OG Lesson 05: 63-session vol (sqrt mean RV5 through t-1) above 1.25 x its rolling 252-session
                            median for 21+ sessions in a row
  P  P(high regime)         F4 (HMM predicted probability), correlation matrix only (stage 2: adds nothing beyond sigma)
  D  dollar share           EWMA (half-life 5) of the share of the pair's 5-min variance explained by the leave-own-out
                            dollar, through t-1 (features.py days.parquet; 7 USD majors only)
  Jo / Jm  recent burst     a burst (jump-after main read, 01:00-21:00, first per session) in the previous session that was
                            own (fewer than 3 instruments burst in that 5-min slot) / market-wide (3 or more)
  L  burst intensity        lam_un from jump-after (EWMA of unscheduled flags), correlation matrix only
Outcomes for session t: log(range/sigma) (mid), mean range/sigma over t..t+4, and the 1-sigma stop from the open on the
M1 bid/ask path (long buys the open ask and is stopped when the bid trades 1 sigma below; short sells the open bid and is
stopped when the ask trades 1 sigma above). The mid touch is shown beside it (gross vs the one-spread version).

DISCOVERY WINDOW ONLY: sessions 2016-10-24 .. 2022-12-30 (asserted); M1 and jump files are cut at load.

    python -X utf8 scripts/vol-layer-deep/system_wide.py build   -> analysis/output/vol-layer-deep/system/wide/ba_sessions.parquet
    python -X utf8 scripts/vol-layer-deep/system_wide.py look    -> backtest-data/vol-layer/system-wide.json
    python -X utf8 scripts/vol-layer-deep/system_wide.py         -> both (build skipped if its file exists)
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts/forecast_history"), str(ROOT / "scripts/vol-layer-deep")]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import line_reaction as LR  # noqa: E402
from forecast_record import klass  # noqa: E402

START, END = "2016-10-24", "2022-12-30"
SEED = 20261112
LON = "Europe/London"
OUT = ROOT / "analysis/output/vol-layer-deep/system/wide"
WEB = ROOT / "backtest-data/vol-layer"
STATE = ROOT / "analysis/output/vol-layer-deep/state/sessions.parquet"
FEAT = ROOT / "analysis/output/vol-layer-deep/features/days.parquet"
JEV = ROOT / "analysis/output/jump-after/events.parquet"
JSE = ROOT / "analysis/output/jump-after/sessions.parquet"
BA = ROOT / "data/m1_bidask"
BA_KEY = {"DE30": "dax", "SPX500": "spx", "DOW": "dow", "GOLD": "gold", "NQ": "nq", "UK100": "uk100", "US2000": "us2000"}
MAJ = ["EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF", "USDJPY"]
KS = [0.5, 0.75, 1.0, 1.25, 1.5]
TOD = [("Asia 00-07", 0, 7), ("London open 07-10", 7, 10), ("London mid 10-13", 10, 13), ("Overlap 13-16", 13, 16),
       ("NY pm 16-22", 16, 22)]
NAME = {"S": "σ position", "E": "forecast error", "R": "turbulent regime", "D": "dollar share", "Jo": "own burst yday",
        "Jm": "market-wide burst yday", "P": "P(high regime)", "L": "burst intensity", "F3": "σ vs long-run"}
PAIR_IN = ["S", "E", "R", "D", "Jo", "Jm"]
N_SHUF = 60


def r4(x, k=4):
    return None if x is None or not np.isfinite(x) else round(float(x), k)


# ================================================================ build: bid/ask session stats (one instrument at a time)
def load_ba(sym):
    cols = ["time", "open", "high", "low", "close", "bid_o", "bid_l", "bid_c", "ask_o", "ask_h", "ask_c"]
    df = pd.read_parquet(BA / f"{BA_KEY.get(sym, sym.lower())}_m1.parquet", columns=cols)
    t = pd.DatetimeIndex(pd.to_datetime(df["time"], utc=True))
    stop = (pd.Timestamp(END) + pd.Timedelta(days=1)).tz_localize(LON).tz_convert("UTC")
    keep = np.asarray((t < stop) & (t >= pd.Timestamp("2016-10-01", tz="UTC")))
    df = df[keep].reset_index(drop=True)
    df.index = t[keep]
    df = df.sort_index()
    assert df.index.max() < stop
    return df


def session_cut(df):
    loc = df.index.tz_convert(LON).tz_localize(None)
    minute = (loc.hour * 60 + loc.minute).to_numpy()
    keep = (minute < 22 * 60) & (loc.dayofweek < 5)
    codes, uniq = pd.factorize(loc[keep].normalize())
    return keep, minute[keep], codes, np.asarray(uniq.strftime("%Y-%m-%d"))


def build_one(sym, sig):
    df = load_ba(sym)
    keep, minute, codes, dates = session_cut(df)
    a = {k: df[k].to_numpy(float)[keep] for k in ["open", "high", "low", "close", "bid_o", "bid_l", "bid_c", "ask_o", "ask_h", "ask_c"]}
    nanb = float(np.isnan(a["bid_l"]).mean())
    a["bid_l"] = np.where(np.isfinite(a["bid_l"]), a["bid_l"], a["low"])
    a["ask_h"] = np.where(np.isfinite(a["ask_h"]), a["ask_h"], a["high"])
    starts = np.flatnonzero(np.r_[True, codes[1:] != codes[:-1]])
    T = pd.DataFrame({"date": dates[codes[starts]], "mid0": a["open"][starts], "bid0": a["bid_o"][starts], "ask0": a["ask_o"][starts],
                      "minbid": np.minimum.reduceat(a["bid_l"], starts), "maxask": np.maximum.reduceat(a["ask_h"], starts),
                      "midlo": np.minimum.reduceat(a["low"], starts), "midhi": np.maximum.reduceat(a["high"], starts),
                      "bidc": a["bid_c"][np.r_[starts[1:] - 1, len(codes) - 1]], "askc": a["ask_c"][np.r_[starts[1:] - 1, len(codes) - 1]]})
    T["sig"] = T.date.map(sig).to_numpy(float)
    S = T.sig.to_numpy() / 100 * T.mid0.to_numpy()                 # 1 sigma in price
    Srow = S[codes]
    # first-touch London minute of the 1-sigma bid/ask stop, long and short
    for side, cond in (("L", a["bid_l"] <= (T.ask0.to_numpy() - S)[codes]), ("S", a["ask_h"] >= (T.bid0.to_numpy() + S)[codes])):
        idx = np.flatnonzero(cond & np.isfinite(Srow))
        ft = np.full(len(T), np.nan)
        if len(idx):
            u, first = np.unique(codes[idx], return_index=True)
            ft[u] = minute[idx[first]]
        T[f"ft{side}"] = ft
    T["inst"] = sym
    T["spread_s"] = (T.ask0 - T.bid0) / S
    return T[T.date.between(START, END)], nanb


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    St = pd.read_parquet(STATE, columns=["inst", "date", "sig"])
    parts = []
    for sym in sorted(St.inst.unique()):
        t0 = time.time()
        sig = St[St.inst == sym].set_index("date").sig
        T, nanb = build_one(sym, sig)
        parts.append(T)
        print(sym, len(T), f"nan bid {nanb:.4f}", f"median open spread {T.spread_s.median():.3f}σ", f"{time.time() - t0:.1f}s", flush=True)
    D = pd.concat(parts, ignore_index=True)
    assert D.date.max() <= END and D.date.min() >= START
    D.to_parquet(OUT / "ba_sessions.parquet", index=False)


# ================================================================ panel
def past_pct(x, w=252, mn=120):
    v = x.to_numpy(float)
    out = np.full(len(v), np.nan)
    for i in range(mn, len(v)):
        h = v[max(0, i - w):i]
        h = h[np.isfinite(h)]
        if len(h) >= mn and np.isfinite(v[i]):
            out[i] = (h < v[i]).mean()
    return out


def turbulent(rv5, thr=1.25, run=21):
    v63 = np.sqrt(rv5.shift(1).rolling(63, min_periods=63).mean())
    med = v63.rolling(252, min_periods=126).median()
    above = (v63 > thr * med).to_numpy()
    ok = med.notna().to_numpy()
    cnt = np.zeros(len(above))
    c = 0
    for i, z in enumerate(above):
        c = c + 1 if z else 0
        cnt[i] = c
    out = (cnt >= run).astype(float)
    out[~ok] = np.nan
    return out


def bursts():
    E = pd.read_parquet(JEV, columns=["inst", "date", "slot", "kind", "ver"])
    E = E[(E.kind == "flag") & (E.ver == "x") & (E.date <= END)]
    co = E.groupby(["date", "slot"]).inst.transform("size")
    E = E.assign(co=co.to_numpy())
    E = E.sort_values(["inst", "date", "slot"]).drop_duplicates(["inst", "date"])
    J = pd.read_parquet(JSE, columns=["inst", "date", "flag", "lam_un"])
    J = J[(J.date <= END) & (J.date >= START)]
    J = J.merge(E[["inst", "date", "co"]], on=["inst", "date"], how="left")
    J["b_own"] = np.where(J.flag.isna(), np.nan, ((J.co < 3) & J.flag.eq(1)).astype(float))
    J["b_mkt"] = np.where(J.flag.isna(), np.nan, ((J.co >= 3) & J.flag.eq(1)).astype(float))
    return J


def panel(lag=0, hl_err=10, look=1, thr=1.25):
    """One row per instrument-session. lag = extra sessions of delay on every input (the +1 lag check)."""
    St = pd.read_parquet(STATE, columns=["inst", "date", "sig", "rv5", "hl_s", "e_raw", "F3", "F4", "F5"])
    St = St[St.date.between(START, END)]
    BAs = pd.read_parquet(OUT / "ba_sessions.parquet")
    D = St.merge(BAs.drop(columns=["sig"]), on=["inst", "date"], how="inner").sort_values(["inst", "date"]).reset_index(drop=True)
    assert D.date.max() <= END and D.date.min() >= START
    F = pd.read_parquet(FEAT, columns=["inst", "date", "share5"])
    D = D.merge(F, on=["inst", "date"], how="left")
    D = D.merge(bursts(), on=["inst", "date"], how="left")
    D["klass"] = D.inst.map(klass)
    D["year"] = D.date.str[:4]
    g = D.groupby("inst", sort=False)
    parts = []
    lam = 0.5 ** (1 / hl_err)
    for sym, x in g:
        x = x.copy()
        x["S"] = past_pct(x.sig)
        e = x.e_raw
        ew = e.ewm(alpha=1 - lam, adjust=True).mean().shift(1)
        x["E"] = ew - e.expanding(20).mean().shift(1)
        x["R"] = turbulent(x.rv5, thr=thr)
        sh = x.share5.clip(0, 1)
        x["D"] = sh.ewm(halflife=5, ignore_na=True).mean().shift(1) if sym in MAJ else np.nan
        for src, dst in (("b_own", "Jo"), ("b_mkt", "Jm")):
            s = x[src]
            x[dst] = s.shift(1).rolling(look, min_periods=look).max()
        x["P"] = x.F4
        x["L"] = x.lam_un              # EWMA through t-1 in jump-after (feature for session t)
        if lag:
            for c in ["S", "E", "R", "D", "Jo", "Jm", "P", "L", "F3"]:
                x[c] = x[c].shift(lag)
        parts.append(x)
    D = pd.concat(parts, ignore_index=True)
    Sx = D.sig / 100 * D.mid0
    D["lhl"] = np.log(D.hl_s)
    for k in KS:
        hl = (D.minbid <= D.ask0 - k * Sx).astype(float)
        hs = (D.maxask >= D.bid0 + k * Sx).astype(float)
        D[f"hit{k}"] = (hl + hs) / 2
        D[f"hitmid{k}"] = (((D.midlo <= D.mid0 - k * Sx).astype(float) + (D.midhi >= D.mid0 + k * Sx).astype(float)) / 2)
    D["hit"] = D["hit1.0"]
    D["hitmid"] = D["hitmid1.0"]
    D["hl5"] = D.groupby("inst").hl_s.transform(lambda s: s[::-1].rolling(5, min_periods=5).mean()[::-1])
    return D


# ================================================================ bootstrap helpers
class BlockBoot:
    """Stationary date-block bootstrap with a chosen mean block length (regime results use episode length)."""

    def __init__(self, dates, block=20, B=2000, seed=SEED):
        self.dates = np.sort(pd.unique(np.asarray(dates)))
        n = len(self.dates)
        rng = np.random.default_rng(seed)
        W = np.zeros((B, n))
        p = 1.0 / block
        for b in range(B):
            jumps = rng.random(n) < p
            starts = rng.integers(n, size=n)
            idx = np.empty(n, dtype=int)
            i = rng.integers(n)
            for t in range(n):
                if t and jumps[t]:
                    i = starts[t]
                idx[t] = i
                i = (i + 1) % n
            W[b] = np.bincount(idx, minlength=n)
        self.W = W
        self.idx = pd.Series(np.arange(n), index=self.dates)

    def sums(self, dates, x):
        return np.bincount(self.idx[np.asarray(dates)].to_numpy(), weights=x, minlength=len(self.dates))


def cells_reps(bs, dates, y, masks):
    """Point and bootstrap reps of the mean of y inside each mask."""
    pts, reps = [], []
    for m in masks:
        a, b = bs.sums(dates[m], y[m]), bs.sums(dates[m], np.ones(m.sum()))
        pts.append(a.sum() / max(b.sum(), 1e-12))
        with np.errstate(invalid="ignore", divide="ignore"):
            reps.append((bs.W @ a) / (bs.W @ b))
    return np.array(pts), np.array(reps)


def p_two(reps):
    reps = reps[np.isfinite(reps)]
    return float(min(1.0, 2 * min((reps <= 0).mean(), (reps >= 0).mean()))) if len(reps) else 1.0


def p_one(reps):
    reps = reps[np.isfinite(reps)]
    return float(min(1.0, 2 * (reps <= 0).mean())) if len(reps) else 1.0


def bh(p, q=0.10):
    p = np.asarray(p, float)
    m = len(p)
    o = np.argsort(p)
    thr = q * np.arange(1, m + 1) / m
    ok = p[o] <= thr
    k = int(np.max(np.flatnonzero(ok)) + 1) if ok.any() else 0
    out = np.zeros(m, bool)
    out[o[:k]] = True
    return out, k


# ================================================================ interaction models
def hi_lo(x, col, frac=1 / 3):
    """Within-instrument high/low flag: binary inputs as they are; continuous inputs top/bottom `frac` of the window."""
    v = x[col]
    if col in ("R", "Jo", "Jm"):
        return v.eq(1), v.eq(0)
    q = v.groupby(x.inst).rank(pct=True)
    return q > 1 - frac, q <= frac


def interaction_contrast(bs, X, a, b, y, frac=1 / 3):
    ah, al = hi_lo(X, a, frac)
    bh_, bl = hi_lo(X, b, frac)
    ms = [(ah & bh_).to_numpy(), (ah & bl).to_numpy(), (al & bh_).to_numpy(), (al & bl).to_numpy()]
    if min(m.sum() for m in ms) < 30:
        return None
    pts, reps = cells_reps(bs, X.date.to_numpy(), X[y].to_numpy(float), ms)
    ic = pts[0] - pts[1] - pts[2] + pts[3]
    icr = reps[0] - reps[1] - reps[2] + reps[3]
    lo, hi = np.nanpercentile(icr, [2.5, 97.5])
    return {"ic": ic, "lo": lo, "hi": hi, "p": p_two(icr), "cells": pts, "n": [int(m.sum()) for m in ms]}


def demean_by(X, cols, train):
    """Subtract per-instrument TRAIN means (instrument fixed effects without looking at the test year)."""
    M = X[train].groupby("inst")[cols].mean()
    return X[cols].to_numpy(float) - M.reindex(X.inst).to_numpy(float)


def wf_losses(X, a, b, y, shuf_b=None):
    """Walk-forward by year (train < year, test = year, 2019-2022). Returns per-row squared errors for the additive
    model (a + b) and the interaction model (a + b + a*b), with instrument fixed effects. shuf_b replaces b in the
    product term only (the shuffled-interaction benchmark)."""
    la, li, dd = [], [], []
    for yr in ["2019", "2020", "2021", "2022"]:
        tr = (X.year < yr).to_numpy()
        te = (X.year == yr).to_numpy()
        if tr.sum() < 500 or te.sum() < 100:
            continue
        A = X[a].to_numpy(float)
        Bv = X[b].to_numpy(float)
        Bp = Bv if shuf_b is None else shuf_b
        mu_a, mu_b = A[tr].mean(), Bv[tr].mean()
        Z = pd.DataFrame({"inst": X.inst.to_numpy(), "a": A - mu_a, "b": Bv - mu_b, "ab": (A - mu_a) * (Bp - mu_b), "y": X[y].to_numpy(float)})
        V = demean_by(Z, ["a", "b", "ab", "y"], tr)
        Xa, Xi, yy = V[:, :2], V[:, :3], V[:, 3]
        ba = np.linalg.lstsq(Xa[tr], yy[tr], rcond=None)[0]
        bi = np.linalg.lstsq(Xi[tr], yy[tr], rcond=None)[0]
        la.append((yy[te] - Xa[te] @ ba) ** 2)
        li.append((yy[te] - Xi[te] @ bi) ** 2)
        dd.append(X.date.to_numpy()[te])
    return np.concatenate(la), np.concatenate(li), np.concatenate(dd)


def circ_shuffle(X, col, rng):
    """Circular shift of a column within each instrument by a random offset: keeps its persistence, breaks its timing."""
    out = np.empty(len(X))
    for _, ix in X.groupby("inst").indices.items():
        v = X[col].to_numpy(float)[ix]
        out[ix] = np.roll(v, rng.integers(60, max(61, len(v) - 60)))
    return out


def gain_cell(bs, X, a, b, y, rng, nshuf=N_SHUF):
    la, li, dd = wf_losses(X, a, b, y)
    sa, si = bs.sums(dd, la), bs.sums(dd, li)
    g = 1 - si.sum() / sa.sum()
    reps = 1 - (bs.W @ si) / (bs.W @ sa)
    lo, hi = np.nanpercentile(reps, [2.5, 97.5])
    sh = []
    for _ in range(nshuf):
        la2, li2, _ = wf_losses(X, a, b, y, shuf_b=circ_shuffle(X, b, rng))
        sh.append(1 - li2.sum() / la2.sum())
    sh = np.array(sh)
    return {"gain": g, "lo": lo, "hi": hi, "p": p_one(reps), "shuf95": float(np.percentile(sh, 95)), "shuf_mean": float(sh.mean()),
            "beats_shuf": float((sh < g).mean()), "n": int(len(la))}


def alone_gain(X, cols, y):
    """OOS gain (2019-2022 walk-forward) of a model with `cols` over instrument means only."""
    l0, l1 = [], []
    for yr in ["2019", "2020", "2021", "2022"]:
        tr = (X.year < yr).to_numpy()
        te = (X.year == yr).to_numpy()
        Z = X[["inst"] + cols + [y]].copy()
        V = demean_by(Z, cols + [y], tr)
        Xv, yy = V[:, :-1], V[:, -1]
        bb = np.linalg.lstsq(Xv[tr], yy[tr], rcond=None)[0]
        l0.append(yy[te] ** 2)
        l1.append((yy[te] - Xv[te] @ bb) ** 2)
    return 1 - np.concatenate(l1).sum() / np.concatenate(l0).sum()


# ================================================================ look
def look():
    t0 = time.time()
    rng = np.random.default_rng(SEED)
    D = panel()
    assert D.date.max() <= END
    base = ["S", "E", "R", "Jo", "Jm"]
    A = D.dropna(subset=base + ["lhl", "hit", "hitmid"]).copy()
    A = A[A.date >= "2017-10-01"].copy()          # every input defined (jump flags need ~250+120 sessions; regime 63+126)
    M = A[A.inst.isin(MAJ)].dropna(subset=["D"]).copy()
    print("panel", len(D), "common", len(A), A.date.min(), A.date.max(), "majors", len(M), f"{time.time() - t0:.0f}s", flush=True)
    bsA = LR.Boot(A.date)
    bsM = LR.Boot(M.date)
    num = {"rows_all": len(A), "rows_majors": len(M), "from": A.date.min(), "to": A.date.max()}
    charts, holds, cells = [], [], []

    # ---------------- Q2 correlation and effective number of inputs
    def corr_block(X, cols):
        Rk = X.groupby("inst")[cols].rank(pct=True)
        Rk = Rk.dropna()
        C = np.corrcoef(Rk.to_numpy().T)
        lam = np.linalg.eigvalsh(C)
        neff = lam.sum() ** 2 / (lam ** 2).sum()
        nyh = 1 + (len(cols) - 1) * (1 - np.var(lam, ddof=1) / len(cols))
        sh = []
        for _ in range(20):
            Z = pd.DataFrame({c: circ_shuffle(X.loc[Rk.index], c, rng) for c in cols}, index=Rk.index)
            Z["inst"] = X.loc[Rk.index, "inst"]
            Zr = Z.groupby("inst")[cols].rank(pct=True).dropna()
            l2 = np.linalg.eigvalsh(np.corrcoef(Zr.to_numpy().T))
            sh.append(l2.sum() ** 2 / (l2 ** 2).sum())
        return C, lam, neff, nyh, float(np.mean(sh)), len(Rk)

    ccols = ["S", "F3", "E", "P", "R", "D", "Jo", "Jm", "L"]
    MC = D[D.inst.isin(MAJ) & (D.date >= "2018-01-01")].dropna(subset=ccols)
    C, lam, neff, nyh, neff_sh, nC = corr_block(MC, ccols)
    acols = ["S", "F3", "E", "P", "R", "Jo", "Jm", "L"]
    AC = D[D.date >= "2018-01-01"].dropna(subset=acols)
    C2, lam2, neff2, nyh2, neff2_sh, nC2 = corr_block(AC, acols)
    num["corr"] = {"cols": ccols, "C": np.round(C, 3).tolist(), "eig": np.round(lam[::-1], 3).tolist(), "neff": neff, "nyholt": nyh,
                   "neff_shuffled": neff_sh, "n": nC, "all34": {"cols": acols, "eig": np.round(lam2[::-1], 3).tolist(), "neff": neff2,
                                                                 "nyholt": nyh2, "neff_shuffled": neff2_sh, "n": nC2}}
    print("neff majors", neff, nyh, neff_sh, "all", neff2, neff2_sh, flush=True)
    charts.append({"type": "groups", "title": "How correlated are the layer outputs? Rank correlation, 7 USD majors, 2018-2022",
                   "names": ["S σ position", "E forecast error", "R turbulent", "D dollar share"], "unit": "correlation",
                   "note": f"Each row is one layer output; the four columns are its correlation with σ position, forecast error, the turbulent regime and the dollar share (ranks within instrument, {nC:,} sessions). Look for anything far from 0 off the diagonal: σ position and σ vs long-run are one thing (0.97), P(high regime) and the turbulent regime lean on σ (0.40-0.69); error, bursts and dollar share sit near 0 with everything. Benchmark: the same columns circularly shifted in time are 0. Effective number of independent inputs (participation ratio of the eigenvalues): {neff:.1f} of 9 here and {neff2:.1f} of 8 on all 34 instruments, against {neff_sh:.1f} and {neff2_sh:.1f} when the columns are shifted out of time with each other, and 1 if they were one thing; Nyholt M_eff {nyh:.1f}.",
                   "rows": [{"label": NAME[c], "values": [r4(C[i, ccols.index(k)], 3) for k in ["S", "E", "R", "D"]]} for i, c in enumerate(ccols)]})
    # ---------------- each alone vs all together (are they separate in the market?)
    alone = {}
    for yv in ["lhl", "hit"]:
        alone[yv] = {c: alone_gain(A, [c], yv) for c in base}
        alone[yv]["all5"] = alone_gain(A, base, yv)
        alone[yv]["sum_alone"] = sum(alone[yv][c] for c in base)
        alone[yv]["M_D"] = alone_gain(M, ["D"], yv)
        alone[yv]["M_all6"] = alone_gain(M, base + ["D"], yv)
        alone[yv]["M_all5"] = alone_gain(M, base, yv)
    num["alone"] = alone
    print("alone", json.dumps({k: {c: round(v, 4) for c, v in d.items()} for k, d in alone.items()}), flush=True)
    charts.append({"type": "groups", "title": "Each layer alone vs all together: out-of-sample gain over instrument means, 2019-2022",
                   "names": ["session range (log range/σ)", "1σ stop hit, bid/ask"], "unit": "% of squared error removed",
                   "note": f"Walk-forward by year (fit on earlier years, score the next). Look at the last two rows: if the layers were one thing measured several ways, 'all together' would be far below the 'sum of alone'; if separate, close to it. Range: all five {100 * alone['lhl']['all5']:.2f}% vs sum alone {100 * alone['lhl']['sum_alone']:.2f}%. Benchmark: instrument means only = 0; a shuffled input scores ≤ 0.",
                   "rows": [{"label": NAME[c], "values": [r4(100 * alone["lhl"][c], 2), r4(100 * alone["hit"][c], 2)]} for c in base]
                   + [{"label": "dollar share (majors)", "values": [r4(100 * alone["lhl"]["M_D"], 2), r4(100 * alone["hit"]["M_D"], 2)]},
                      {"label": "sum of the five alone", "values": [r4(100 * alone["lhl"]["sum_alone"], 2), r4(100 * alone["hit"]["sum_alone"], 2)]},
                      {"label": "all five together", "values": [r4(100 * alone["lhl"]["all5"], 2), r4(100 * alone["hit"]["all5"], 2)]}]})

    # ---------------- Q1 interaction gain, every pair x outcome, pooled and by class
    pairs = [(a, b) for i, a in enumerate(PAIR_IN) for b in PAIR_IN[i + 1:]]
    res = []
    kboot = {kl: LR.Boot(A[A.klass == kl].date) for kl in ["fx_majors", "fx_crosses", "gold", "indices"]}
    for a, b in pairs:
        for yv in ["lhl", "hit"]:
            Xp, bsp, scope = (M, bsM, "majors") if "D" in (a, b) else (A, bsA, "all")
            r = gain_cell(bsp, Xp, a, b, yv, rng)
            r.update({"a": a, "b": b, "y": yv, "scope": scope})
            res.append(r)
            cells.append({"cell": f"gain {a}x{b} {yv} {scope}", "p": r["p"]})
            if "D" not in (a, b):
                for kl in ["fx_majors", "fx_crosses", "gold", "indices"]:
                    Xk = A[A.klass == kl]
                    rk = gain_cell(kboot[kl], Xk, a, b, yv, rng, nshuf=20)
                    rk.update({"a": a, "b": b, "y": yv, "scope": kl})
                    res.append(rk)
                    cells.append({"cell": f"gain {a}x{b} {yv} {kl}", "p": rk["p"]})
        print("pair", a, b, f"{time.time() - t0:.0f}s", flush=True)
    R = pd.DataFrame(res)
    R.to_csv(OUT / "gains.csv", index=False)
    pooled = R[R.scope.isin(["all", "majors"])].copy()
    for yv, ttl in (("lhl", "session range"), ("hit", "1σ stop hit on bid/ask")):
        P_ = pooled[pooled.y == yv].sort_values("gain", ascending=False)
        charts.append({"type": "groups", "title": f"Does the pair interact? Out-of-sample gain of a×b beyond a+b, {ttl}, 2019-2022",
                       "names": ["interaction gain", "shuffled a×b, 95th pct"], "unit": "% of additive model's squared error",
                       "note": "Each row adds the product of two layers to a model that already has both alone (plus instrument means). A real interaction must beat the 95th percentile of the same product with one layer circularly shifted in time (60 draws). Rows with the dollar share are majors only. Values in hundredths of a percent are noise-sized.",
                       "rows": [{"label": f"{NAME[r.a]} × {NAME[r.b]}", "values": [r4(100 * r.gain, 3), r4(100 * r.shuf95, 3)]} for r in P_.itertuples()]})

    # ---------------- headline pair for the stop: largest model-free interaction contrast on the bid/ask stop
    ics = []
    for a, b in pairs:
        Xp, bsp = (M, bsM) if "D" in (a, b) else (A, bsA)
        r = interaction_contrast(bsp, Xp, a, b, "hit")
        if r:
            ics.append({"a": a, "b": b, **{k: r[k] for k in ("ic", "lo", "hi", "p")}, "cells": r["cells"].tolist(), "n": r["n"]})
            cells.append({"cell": f"ic {a}x{b} hit", "p": r["p"]})
    IC = pd.DataFrame(ics)
    IC.to_csv(OUT / "ic_pairs.csv", index=False)
    gh = pooled[pooled.y == "hit"].assign(z=lambda d: d.gain - d.shuf95).sort_values("z", ascending=False).iloc[0]
    ha, hb = gh.a, gh.b
    Xh, bsh = (M, bsM) if "D" in (ha, hb) else (A, bsA)
    print("headline pair", ha, hb, gh.gain, gh.shuf95, flush=True)
    num["headline"] = {"a": ha, "b": hb, "gain": gh.gain, "lo": gh.lo, "hi": gh.hi, "shuf95": gh.shuf95}
    charts.append({"type": "bars", "title": "Model-free check: interaction contrast on the 1σ bid/ask stop, every pair",
                   "unit": "pp of stop-hit rate", "ref": 0,
                   "note": "Contrast = (hit when both high − hit when only a high) − (hit when only b high − hit when both low), top vs bottom third within instrument (binary layers: on vs off). 0 means the two layers simply add. Benchmark is 0; date-block 95% intervals.",
                   "rows": [{"label": f"{NAME[r.a]} × {NAME[r.b]}", "value": r4(100 * r.ic, 2), "lo": r4(100 * r.lo, 2), "hi": r4(100 * r.hi, 2)}
                            for r in IC.sort_values("ic").itertuples()]})

    # ---------------- Q3 grid for the headline pair
    def levels(X, col):
        if col in ("R", "Jo", "Jm"):
            return [("off", X[col].eq(0)), ("on", X[col].eq(1))]
        q = X[col].groupby(X.inst).rank(pct=True)
        return [("low third", q <= 1 / 3), ("middle third", (q > 1 / 3) & (q <= 2 / 3)), ("high third", q > 2 / 3)]

    LA, LB = levels(Xh, ha), levels(Xh, hb)
    grid, grid_mid, grid_add, grid_n = [], [], [], []
    # additive prediction: linear probability with level dummies of a and b (no product), instrument means
    da = pd.get_dummies(pd.Series(np.select([m.to_numpy() for _, m in LA], [n for n, _ in LA], "x"), index=Xh.index), drop_first=True, dtype=float)
    db = pd.get_dummies(pd.Series(np.select([m.to_numpy() for _, m in LB], [n for n, _ in LB], "y"), index=Xh.index), drop_first=True, dtype=float)
    Zd = pd.concat([Xh[["inst", "hit"]], da.add_prefix("a_"), db.add_prefix("b_")], axis=1)
    cols = [c for c in Zd.columns if c.startswith(("a_", "b_"))]
    V = demean_by(Zd, cols + ["hit"], np.ones(len(Zd), bool))
    bb = np.linalg.lstsq(V[:, :-1], V[:, -1], rcond=None)[0]
    pred = Xh.hit.to_numpy() - (V[:, -1] - V[:, :-1] @ bb)
    for na_, ma in LA:
        row, rm, ra, rn = [], [], [], []
        for nb_, mb in LB:
            m = (ma & mb).to_numpy()
            row.append(r4(100 * Xh.hit.to_numpy()[m].mean(), 1))
            rm.append(r4(100 * Xh.hitmid.to_numpy()[m].mean(), 1))
            ra.append(r4(100 * (Xh.hit.to_numpy()[m].mean() - pred[m].mean()), 2))
            rn.append(int(m.sum()))
        grid.append({"label": f"{NAME[ha]}: {na_}", "values": row})
        grid_mid.append(rm)
        grid_add.append({"label": f"{NAME[ha]}: {na_}", "values": ra})
        grid_n.append(rn)
    num["grid"] = {"bidask": grid, "mid": grid_mid, "minus_additive": grid_add, "n": grid_n}
    base_hit, base_mid = Xh.hit.mean(), Xh.hitmid.mean()
    charts.append({"type": "groups", "title": f"Stop-hit grid: 1σ stop from the open on bid/ask, {NAME[ha]} × {NAME[hb]}",
                   "names": [f"{NAME[hb]}: {n}" for n, _ in LB], "unit": "% of long and short stops hit",
                   "note": f"The headline pair (largest out-of-sample interaction gain vs its shuffle on the stop). Read across a row and down a column: if the layers only add, each row has the same shape. Benchmarks: all sessions {100 * base_hit:.1f}% on bid/ask ({100 * base_mid:.1f}% on mid, so the spread adds {100 * (base_hit - base_mid):.1f}pp); a random walk gives 31.7% on mid. Cell counts {grid_n}.",
                   "rows": grid})
    charts.append({"type": "groups", "title": "Same grid minus what the two layers predict when simply added",
                   "names": [f"{NAME[hb]}: {n}" for n, _ in LB], "unit": "pp of stop-hit rate",
                   "note": "Actual hit rate minus the additive model (instrument means + level dummies of each layer, no product). Benchmark 0 everywhere = no interaction; a real interaction shows as opposite-signed corners of a few pp.",
                   "rows": grid_add})

    # ---------------- sweeps of the headline contrast
    def ic_of(X, y="hit", a=ha, b=hb, frac=1 / 3, bs=None):
        if len(X) < 400:
            return None
        return interaction_contrast(bs or LR.Boot(X.date), X, a, b, y, frac)

    # per instrument
    inst_rows = []
    for s, Xs in Xh.groupby("inst"):
        r = ic_of(Xs)
        if r:
            inst_rows.append({"label": s, "value": r4(100 * r["ic"], 2), "lo": r4(100 * r["lo"], 2), "hi": r4(100 * r["hi"], 2)})
            cells.append({"cell": f"ic head inst {s}", "p": r["p"]})
    kl_rows = []
    for kl, Xk in Xh.groupby("klass"):
        r = ic_of(Xk)
        if r:
            kl_rows.append({"label": f"class: {kl}", "value": r4(100 * r["ic"], 2), "lo": r4(100 * r["lo"], 2), "hi": r4(100 * r["hi"], 2)})
            cells.append({"cell": f"ic head class {kl}", "p": r["p"]})
    hr = ic_of(Xh, bs=bsh)
    num["headline_ic"] = {k: (v.tolist() if isinstance(v, np.ndarray) else v) for k, v in hr.items()}
    charts.append({"type": "bars", "title": f"Per instrument: interaction contrast of {NAME[ha]} × {NAME[hb]} on the bid/ask stop",
                   "unit": "pp of stop-hit rate", "ref": 0,
                   "note": f"Pooled {100 * hr['ic']:+.1f}pp [{100 * hr['lo']:+.1f}, {100 * hr['hi']:+.1f}]. Look for the sign holding across instruments versus a few driving it. Benchmark 0 (layers simply add); with 34 noisy cells, about 2 should exclude 0 by chance.",
                   "rows": kl_rows + sorted(inst_rows, key=lambda r: r["value"])})

    # year
    yr_rows = []
    for yr, Xy in Xh.groupby("year"):
        r = ic_of(Xy)
        if r:
            yr_rows.append({"label": yr, "value": r4(100 * r["ic"], 2), "lo": r4(100 * r["lo"], 2), "hi": r4(100 * r["hi"], 2)})
            cells.append({"cell": f"ic head year {yr}", "p": r["p"]})
    gyr = []
    for yr in ["2019", "2020", "2021", "2022"]:
        la, li, dd = wf_losses(Xh[Xh.year <= yr], ha, hb, "hit")
        msk = pd.Series(dd).str[:4].eq(yr).to_numpy()
        gyr.append([yr, 1 - li[msk].sum() / la[msk].sum()])
    charts.append({"type": "bars", "title": f"Year by year: interaction contrast of {NAME[ha]} × {NAME[hb]} on the stop",
                   "unit": "pp of stop-hit rate", "ref": 0,
                   "note": "One bar per year (2017 starts in October, when every layer is defined). Benchmark 0. Out-of-sample interaction gain by scored year: " + ", ".join(f"{y} {100 * g:+.3f}%" for y, g in gyr) + ".",
                   "rows": yr_rows})

    # regime (C.OG Lesson 05) with episode-length blocks
    ep = []
    for s, x in D.groupby("inst"):
        v = x.R.fillna(0).to_numpy()
        st = np.flatnonzero(np.diff(np.r_[0, v]) == 1)
        en = np.flatnonzero(np.diff(np.r_[v, 0]) == -1)
        ep += list(en - st + 1)
    ep = np.array(ep)
    blk = int(max(20, np.median(ep))) if len(ep) else 20
    num["regime"] = {"episodes": int(len(ep)), "median_len": float(np.median(ep)) if len(ep) else None, "share_turb": float(A.R.mean()), "block": blk}
    reg_rows = []
    pairs_reg = [p for p in [(ha, hb), ("E", "Jm"), ("S", "E")] if "R" not in p]
    seen = set()
    for a_, b_ in pairs_reg:
        if (a_, b_) in seen:
            continue
        seen.add((a_, b_))
        Xr0 = (M if "D" in (a_, b_) else A)
        for rv_, lab in ((0.0, "calm"), (1.0, "turbulent")):
            Xr = Xr0[Xr0.R == rv_]
            r = ic_of(Xr, a=a_, b=b_, bs=BlockBoot(Xr.date, block=blk))
            if r:
                reg_rows.append({"label": f"{NAME[a_]} × {NAME[b_]}, {lab}", "value": r4(100 * r["ic"], 2), "lo": r4(100 * r["lo"], 2), "hi": r4(100 * r["hi"], 2)})
                cells.append({"cell": f"ic {a_}x{b_} regime {lab}", "p": r["p"]})
    # plus the alone effects inside each regime: hit when E high vs low
    for rv_, lab in ((0.0, "calm"), (1.0, "turbulent")):
        Xr = A[A.R == rv_]
        q = Xr.E.groupby(Xr.inst).rank(pct=True)
        bsr = BlockBoot(Xr.date, block=blk)
        pts, reps = cells_reps(bsr, Xr.date.to_numpy(), Xr.hit.to_numpy(float), [(q > 2 / 3).to_numpy(), (q <= 1 / 3).to_numpy()])
        d_ = reps[0] - reps[1]
        reg_rows.append({"label": f"forecast error alone (top − bottom third), {lab}", "value": r4(100 * (pts[0] - pts[1]), 2),
                         "lo": r4(100 * np.nanpercentile(d_, 2.5), 2), "hi": r4(100 * np.nanpercentile(d_, 97.5), 2)})
        cells.append({"cell": f"E alone regime {lab}", "p": p_two(d_)})
    charts.append({"type": "bars", "title": "By C.OG's regime (Lesson 05): interaction contrasts and the error alone, on the bid/ask stop",
                   "unit": "pp of stop-hit rate", "ref": 0,
                   "note": f"Turbulent = 63-session vol above 1.25× its 252-session median for 21+ sessions (past data only): {len(ep)} episodes over 34 instruments, median {num['regime']['median_len']:.0f} sessions, {100 * num['regime']['share_turb']:.0f}% of sessions. Intervals use date blocks of {blk} sessions (episode length). Benchmark 0 for contrasts; the error's own effect shows whether the strongest single layer changes with regime.",
                   "rows": reg_rows})

    # time of day: where the 1-sigma bid/ask stop is first touched, by headline condition
    tod_rows = []
    ah, al = hi_lo(Xh, ha)
    bh2, bl2 = hi_lo(Xh, hb)
    conds = [("both high", (ah & bh2).to_numpy()), ("both low", (al & bl2).to_numpy()), ("split", ((ah & bl2) | (al & bh2)).to_numpy())]
    ft = np.c_[Xh.ftL.to_numpy(), Xh.ftS.to_numpy()]
    for lab, lo_h, hi_h in TOD:
        inb = ((ft >= lo_h * 60) & (ft < hi_h * 60)).astype(float).mean(1)
        tod_rows.append({"label": lab, "values": [r4(100 * inb[m].mean(), 2) for _, m in conds] + [r4(100 * inb.mean(), 2)]})
        # contrast cell: both-high minus both-low share in this bucket
        pts, reps = cells_reps(bsh, Xh.date.to_numpy(), inb, [conds[0][1], conds[1][1]])
        cells.append({"cell": f"tod {lab}", "p": p_two(reps[0] - reps[1])})
    charts.append({"type": "groups", "title": f"Time of day: share of 1σ bid/ask stops first touched in each London bucket, by {NAME[ha]} × {NAME[hb]}",
                   "names": ["both high", "both low", "one high one low"], "unit": "% of stops (long and short)",
                   "note": "Europe/London clock. Shows WHEN the extra stops arrive when both layers point loud, against both quiet and the split case. Benchmark: the all-sessions share per bucket is in the table's last column (fourth value). Buckets sum to the session's hit rate.",
                   "rows": [{"label": r["label"], "values": r["values"][:3]} for r in tod_rows]})
    num["tod_all"] = {r["label"]: r["values"][3] for r in tod_rows}

    # horizon: same contrast for range now and 5-session mean range
    hz_rows = []
    for yv, lab in (("hitmid", "stop hit, mid (gross)"), ("hit", "stop hit, bid/ask (net)"), ("lhl", "log range/σ, this session"), ("hl5", "range/σ, mean of 5 sessions")):
        Xv = Xh.dropna(subset=[yv])
        r = interaction_contrast(LR.Boot(Xv.date), Xv, ha, hb, yv)
        sc = 100 if yv.startswith("hit") else 1
        hz_rows.append({"label": lab, "value": r4(sc * r["ic"], 3), "lo": r4(sc * r["lo"], 3), "hi": r4(sc * r["hi"], 3)})
        cells.append({"cell": f"ic head horizon {yv}", "p": r["p"]})
    charts.append({"type": "bars", "title": f"By horizon and price: interaction contrast of {NAME[ha]} × {NAME[hb]}",
                   "unit": "pp (stops) or σ-units (range)", "ref": 0,
                   "note": "Stops in percentage points, ranges in log units (this session) or σ (5-session mean). Gross (mid) vs net (bid/ask, one spread) shows whether the spread changes the picture. Benchmark 0 = the layers add.",
                   "rows": hz_rows})

    # ---------------- +1 lag check and plateau
    t1 = time.time()
    L1 = panel(lag=1)
    L1 = L1.dropna(subset=base + ["lhl", "hit"])
    L1 = L1[L1.date >= "2017-10-01"]
    L1x = L1[L1.inst.isin(MAJ)].dropna(subset=["D"]) if "D" in (ha, hb) else L1
    g1 = gain_cell(LR.Boot(L1x.date), L1x, ha, hb, "hit", rng, nshuf=20)
    ic1 = interaction_contrast(LR.Boot(L1x.date), L1x, ha, hb, "hit")
    e0 = alone_gain(A, ["E"], "lhl")
    e1 = alone_gain(L1, ["E"], "lhl")
    eh0 = alone_gain(A, ["E"], "hit")
    eh1 = alone_gain(L1, ["E"], "hit")
    num["lag1"] = {"gain0": gh.gain, "gain1": g1["gain"], "shuf95_1": g1["shuf95"], "ic0": hr["ic"], "ic1": ic1["ic"], "ic1_lo": ic1["lo"], "ic1_hi": ic1["hi"],
                   "E_range0": e0, "E_range1": e1, "E_hit0": eh0, "E_hit1": eh1}
    print("lag1", num["lag1"], f"{time.time() - t1:.0f}s", flush=True)
    charts.append({"type": "bars", "title": "+1 session lag check: every input delayed one more session",
                   "unit": "% of squared error removed (gains) or pp (contrast)", "ref": 0,
                   "note": "C.OG Lesson 01: an effect that is real should survive a one-session delay with a smaller size, not vanish or flip. Shown for the headline interaction and for the strongest single layer (forecast error alone). Benchmarks: the shuffled interaction's 95th percentile and 0.",
                   "rows": [{"label": "headline a×b gain, on time", "value": r4(100 * gh.gain, 3), "lo": r4(100 * gh.lo, 3), "hi": r4(100 * gh.hi, 3)},
                            {"label": "headline a×b gain, +1 lag", "value": r4(100 * g1["gain"], 3), "lo": r4(100 * g1["lo"], 3), "hi": r4(100 * g1["hi"], 3)},
                            {"label": "shuffled a×b 95th pct, +1 lag", "value": r4(100 * g1["shuf95"], 3)},
                            {"label": "headline contrast (pp), on time", "value": r4(100 * hr["ic"], 2), "lo": r4(100 * hr["lo"], 2), "hi": r4(100 * hr["hi"], 2)},
                            {"label": "headline contrast (pp), +1 lag", "value": r4(100 * ic1["ic"], 2), "lo": r4(100 * ic1["lo"], 2), "hi": r4(100 * ic1["hi"], 2)},
                            {"label": "error alone, range gain, on time", "value": r4(100 * e0, 3)},
                            {"label": "error alone, range gain, +1 lag", "value": r4(100 * e1, 3)},
                            {"label": "error alone, stop gain, on time", "value": r4(100 * eh0, 3)},
                            {"label": "error alone, stop gain, +1 lag", "value": r4(100 * eh1, 3)}]})
    del L1, L1x

    # plateau: stop width k, tercile cut, error half-life, burst look-back, regime threshold
    pl = {}
    pl["k"] = []
    for k in KS:
        r = interaction_contrast(bsh, Xh, ha, hb, f"hit{k}")
        pl["k"].append([k, r4(100 * r["ic"], 2)])
    pl["frac"] = []
    for fr in [0.2, 0.25, 1 / 3, 0.4, 0.5]:
        r = interaction_contrast(bsh, Xh, ha, hb, "hit", frac=fr)
        pl["frac"].append([round(fr, 2), r4(100 * r["ic"], 2)])
    var_rows = {}
    for nm, kw, vals in (("error half-life", "hl_err", [5, 10, 20]), ("burst look-back", "look", [1, 3, 5]), ("regime threshold", "thr", [1.15, 1.25, 1.35])):
        if (nm == "error half-life" and "E" not in (ha, hb)) or (nm == "burst look-back" and not ({"Jo", "Jm"} & {ha, hb})) or (nm == "regime threshold" and "R" not in (ha, hb)):
            continue
        var_rows[nm] = []
        for v in vals:
            if v in (10, 1, 1.25):
                Xv = Xh
            else:
                Pv = panel(**{kw: v}).dropna(subset=base + ["hit"])
                Pv = Pv[Pv.date >= "2017-10-01"]
                Xv = Pv[Pv.inst.isin(MAJ)].dropna(subset=["D"]) if "D" in (ha, hb) else Pv
            r = interaction_contrast(LR.Boot(Xv.date), Xv, ha, hb, "hit")
            var_rows[nm].append([v, r4(100 * r["ic"], 2)])
    pl.update(var_rows)
    num["plateau"] = pl
    series = [{"name": "stop width k (σ)", "points": pl["k"]}, {"name": "high/low cut (share in each tail)", "points": pl["frac"]}]
    for nm, pts in var_rows.items():
        series.append({"name": nm, "points": pts})
    charts.append({"type": "lines", "title": f"Plateau check: the {NAME[ha]} × {NAME[hb]} stop contrast as each setting moves",
                   "unit": "pp of stop-hit rate", "xlabel": "setting value (each line on its own axis values)",
                   "note": "Lesson 01: a real effect is a plateau (similar size over neighbouring settings), an artefact is a lone peak at the chosen value (k=1σ, thirds, half-life 10, look-back 1, threshold 1.25). Benchmark 0.",
                   "series": series[:4]})

    # ---------------- Q4 concrete days: agree vs disagree
    Ez = A.copy()
    cols5 = ["S", "E", "R", "Jo", "Jm"]
    V = demean_by(Ez[["inst"] + cols5 + ["lhl"]], cols5 + ["lhl"], np.ones(len(Ez), bool))
    bb = np.linalg.lstsq(V[:, :-1], V[:, -1], rcond=None)[0]
    contrib = V[:, :-1] * bb
    Ez["c_sum"] = contrib.sum(1)
    sd_c = contrib.std(0)
    zc = contrib / sd_c
    Ez["npos"] = (zc > 0.75).sum(1)
    Ez["nneg"] = (zc < -0.75).sum(1)
    Ez["zmax"], Ez["zmin"] = zc.max(1), zc.min(1)
    for i, c in enumerate(cols5):
        Ez[f"z_{c}"] = zc[:, i]
    num["contrib_coef"] = dict(zip(cols5, np.round(bb, 4).tolist()))
    # agreement statistic across the whole panel: realised range vs agree/disagree
    agree_loud = (Ez.npos >= 3) & (Ez.nneg == 0)
    agree_quiet = (Ez.nneg >= 2) & (Ez.npos == 0)
    disagree = (Ez.zmax > 1.0) & (Ez.zmin < -1.0)
    bsE = bsA
    rows_ag = []
    for lab, m in (("agree: loud", agree_loud), ("agree: quiet", agree_quiet), ("disagree (one loud, one quiet)", disagree), ("all sessions", pd.Series(True, index=Ez.index))):
        mm = m.to_numpy()
        pts, reps = cells_reps(bsE, Ez.date.to_numpy(), Ez.hit.to_numpy(float), [mm])
        rows_ag.append({"label": f"{lab} (n={mm.sum():,})", "value": r4(100 * pts[0], 1), "lo": r4(100 * np.nanpercentile(reps[0], 2.5), 1), "hi": r4(100 * np.nanpercentile(reps[0], 97.5), 1)})
    num["agree_rows"] = rows_ag
    hs_ag = {lab: float(Ez.hl_s[m].mean()) for lab, m in (("loud", agree_loud), ("quiet", agree_quiet), ("dis", disagree))}
    num["agree_hl"] = hs_ag
    charts.append({"type": "bars", "title": "When the layers agree vs disagree: 1σ bid/ask stop hit",
                   "unit": "% of stops hit", "ref": 30,
                   "note": f"Each session's layers are scored by their part of the additive range model (σ position, error, regime, own and market-wide burst). Agree loud = 3+ layers point loud and none quiet; agree quiet = 2+ quiet and none loud; disagree = one strongly loud and one strongly quiet. Mean range/σ: loud {hs_ag['loud']:.2f}, quiet {hs_ag['quiet']:.2f}, disagree {hs_ag['dis']:.2f}. Benchmark: all sessions (last row) and a random walk's 31.7% on mid.",
                   "rows": rows_ag})

    # pick real example days, deterministic: 3 agree-loud, 3 agree-quiet, 4 disagree, distinct instruments where possible
    def pick(mask, n, key, asc=False):
        c = Ez[mask].sort_values(key, ascending=asc)   # chosen by the layer scores only, never by the outcome
        out, used = [], set()
        for r in c.itertuples():
            if r.inst in used:
                continue
            out.append(r)
            used.add(r.inst)
            if len(out) == n:
                break
        return out
    Ez["dis_key"] = np.minimum(Ez.zmax, -Ez.zmin)
    ex = [("all loud", r) for r in pick(agree_loud, 3, "c_sum")] + [("all quiet", r) for r in pick(agree_quiet, 3, "c_sum", asc=True)] \
        + [("disagree", r) for r in pick(disagree, 4, "dis_key")]
    trades = []
    for lab, r in ex:
        df = load_ba(r.inst)
        keep, minute, codes, dates = session_cut(df)
        j = np.flatnonzero(dates == r.date)[0]
        m = codes == j
        mins = minute[m]
        mid = df.close.to_numpy(float)[keep][m]
        bid_l = df.bid_l.to_numpy(float)[keep][m]
        bid_c = df.bid_c.to_numpy(float)[keep][m]
        Sx = r.sig / 100 * r.mid0
        y = (mid - r.mid0) / Sx
        ent = r.ask0
        res_r = None
        bh_ = df.bid_c.to_numpy(float)[keep][m]   # target on bid close (conservative)
        for i in range(len(mins)):
            if bid_l[i] <= ent - Sx:
                res_r = -1.0 - (0 if bid_l[i] >= ent - Sx else 0)
                break
            if bh_[i] >= ent + Sx:
                res_r = (bh_[i] - ent) / Sx
                break
        if res_r is None:
            res_r = (bid_c[-1] - ent) / Sx

        step = max(1, len(mins) // 90)
        path = [[int(mm_), round(float(v), 3)] for mm_, v in zip(mins[::step], y[::step])]
        layers = " ".join(f"{c}{'+' if getattr(r, 'z_' + c) > 0.75 else '−' if getattr(r, 'z_' + c) < -0.75 else '0'}" for c in cols5)
        trades.append({"inst": f"{r.inst} · {lab}", "date": r.date, "side": f"long, 1σ stop/target on bid/ask; layers {layers}; range {r.hl_s:.2f}σ",
                       "r": r4(res_r, 2), "unit": "R net", "stop": -1, "target": 1, "path": path})
        del df
    charts.append({"type": "trades", "title": "Real days: the layers agree (loud or quiet) vs disagree",
                   "unit": "σ from the session open (mid path; x = London minute)",
                   "note": "Layer codes: S σ position, E forecast error, R turbulent regime, Jo own burst yesterday, Jm market-wide burst yesterday; + points loud, − quiet, 0 neutral (by its part of the additive range model). The trade is an illustrative long from the open ask with a 1σ stop and target on the bid (net of the spread). Benchmark: an average session's range is about 1.6σ; agree-loud days should run wider, agree-quiet narrower, disagree in between.",
                   "trades": trades})

    # ---------------- multiple testing
    P = np.array([c["p"] for c in cells])
    passed, k = bh(P)
    for c, ok in zip(cells, passed):
        c["bh"] = bool(ok)
    pd.DataFrame(cells).to_csv(OUT / "cells.csv", index=False)
    m_ = len(cells)
    num["bh"] = {"m": m_, "k": k, "expected_false_among_passed": k * 0.10, "raw_p05": int((P < 0.05).sum()), "raw_p05_expected": m_ * 0.05}
    print("cells", m_, "BH pass", k, "raw p<.05", (P < 0.05).sum(), flush=True)

    # ---------------- holds + intro
    gpool = pooled.set_index(["a", "b", "y"])
    best_l = pooled[pooled.y == "lhl"].sort_values("gain", ascending=False).iloc[0]
    n_beat_l = int(((pooled.y == "lhl") & (pooled.gain > pooled.shuf95)).sum())
    n_beat_h = int(((pooled.y == "hit") & (pooled.gain > pooled.shuf95)).sum())
    num["n_beat"] = {"lhl": n_beat_l, "hit": n_beat_h, "of": int(len(pairs))}
    passed_cells = [c["cell"] for c in cells if c["bh"]]
    num["passed_cells"] = passed_cells
    holds += [
        {"effect": "Layers are mostly separate inputs", "where": "7 majors (9 outputs) and all 34 (8 outputs), 2018-2022",
         "size": f"effective inputs {neff:.1f} of 9 (majors), {neff2:.1f} of 8 (all 34)", "benchmark": f"time-shuffled {neff_sh:.1f} / {neff2_sh:.1f}; one thing = 1"},
        {"effect": "Forecast error is the layer that moves next session's range", "where": "all 34, walk-forward 2019-2022",
         "size": f"{100 * alone['lhl']['E']:.2f}% of squared log-range error alone; all five {100 * alone['lhl']['all5']:.2f}%", "benchmark": "instrument means = 0; sum of the five alone " + f"{100 * alone['lhl']['sum_alone']:.2f}%"},
        {"effect": f"Best pair on the stop: {NAME[ha]} × {NAME[hb]}", "where": "pooled, walk-forward 2019-2022",
         "size": f"interaction gain {100 * gh.gain:+.3f}% [{100 * gh.lo:+.3f}, {100 * gh.hi:+.3f}], contrast {100 * hr['ic']:+.1f}pp [{100 * hr['lo']:+.1f}, {100 * hr['hi']:+.1f}]",
         "benchmark": f"shuffled a×b 95th pct {100 * gh.shuf95:+.3f}%"},
        {"effect": "Best pair on the range", "where": "pooled, walk-forward 2019-2022",
         "size": f"{NAME[best_l.a]} × {NAME[best_l.b]} {100 * best_l.gain:+.3f}% [{100 * best_l.lo:+.3f}, {100 * best_l.hi:+.3f}]", "benchmark": f"shuffled a×b 95th pct {100 * best_l.shuf95:+.3f}%"},
        {"effect": "Agreement of the layers", "where": "all 34, Oct 2017-2022",
         "size": f"stop hit agree-loud {rows_ag[0]['value']}%, agree-quiet {rows_ag[1]['value']}%, disagree {rows_ag[2]['value']}%", "benchmark": f"all sessions {rows_ag[3]['value']}%"},
    ]
    out = {"id": "system-wide", "window": [START, END], "cells_tested": m_, "cells_pass_bh": k, "cells_expected_by_chance": round(k * 0.10, 1),
           "intro": [], "holds": holds, "charts": charts, "numbers": json.loads(json.dumps(num, default=lambda o: o.item() if hasattr(o, "item") else str(o)))}
    (OUT / "numbers.json").write_text(json.dumps(out["numbers"], indent=1, default=str), encoding="utf-8")
    intro_f = OUT / "intro.json"
    if intro_f.exists():
        out["intro"] = json.loads(intro_f.read_text(encoding="utf-8"))
    WEB.mkdir(parents=True, exist_ok=True)
    (WEB / "system-wide.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":"), default=float), encoding="utf-8")
    print("wrote", WEB / "system-wide.json", f"{time.time() - t0:.0f}s")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd in ("build", "all") and (cmd == "build" or not (OUT / "ba_sessions.parquet").exists()):
        build()
    if cmd in ("look", "all"):
        look()
