"""vol-layer-features-confirm: does the dollar / own split of the USD majors hold on unseen 2023-26 data?

Prereg: forge/VOL_LAYER_FEATURES_CONFIRM_PREREG.md (the contract). Four scored cells:
  TOD  dollar share, 13-16 overlap minus 00-07 Asia (USDCAD sign-reversed), mean of 7 pairs      bar +0.10
  SIG  dollar share, high minus low third of sigma known at the open, mean of 7                  bar +0.10
  FR   Forbes-Rigobon corrected rho on loud days (activity deciles 8-10) minus raw rho (1-3)     bar -0.05
  EQ   1h / rest-of-session follow-through, dollar-led minus own-led big 15-min moves, TOST       margins 0.018 / 0.042 sigma

Stages (run in order; `confirm` refuses to run unless step 0 passed):
    python -X utf8 scripts/vol-layer-features-confirm/run.py step0     reproduce discovery to 3 dp + planted control
    python -X utf8 scripts/vol-layer-features-confirm/run.py confirm   score 2023-01-02 .. 2026-08-20 ONCE

Data are read from DATA_ROOT (the main checkout); outputs go to analysis/output/vol-layer-features-confirm/ in this
repo. The 1-minute grid cache goes in .../grid/ (not committed). Nothing after 2026-08-20 is loaded. Seed 20261116.
"""
from __future__ import annotations

import json
import sys
import time
import warnings
from pathlib import Path
from statistics import NormalDist

import numpy as np
import pandas as pd

REPO = Path(__file__).resolve().parents[2]
DATA_ROOT = Path("c:/Users/relli/OneDrive/Documents/Programming/Trading/v2 trading model/MacroFXModel")
BA = DATA_ROOT / "data/m1_bidask"
HIST = DATA_ROOT / "analysis/output/forecast_history"
OUT = REPO / "analysis/output/vol-layer-features-confirm"
GRID = OUT / "grid"

SEED = 20261116
B = 2000
BLOCK = 20
DISC = ("2016-10-24", "2022-12-30")
CONF = ("2023-01-02", "2026-08-20")
HARD_END = "2026-08-20"            # lockbox starts 2026-08-21
WARM = 60                          # last 60 complete sessions of 2022 warm beta / threshold / absorption
NM = 22 * 60
FFILL = 30
MAJ = ["EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF", "USDJPY"]
SIGN = {"EURUSD": -1, "GBPUSD": -1, "AUDUSD": -1, "NZDUSD": -1, "USDCAD": 1, "USDCHF": 1, "USDJPY": 1}
TSIGN = np.array([-1.0 if s == "USDCAD" else 1.0 for s in MAJ])        # TOD predicted sign per pair
TODB = [("Asia 00-07", 0, 420), ("London open 07-10", 420, 600), ("London mid 10-13", 600, 780),
        ("Overlap 13-16", 780, 960), ("NY afternoon 16-22", 960, NM)]
TOD_BASE = ((780, 960), (0, 420))
TOD_NEIGH = {"edges -1h": ((720, 900), (0, 360)), "edges +1h": ((840, 1020), (0, 480))}
TARGET = {"tod": 0.163, "sig": 0.118, "fr": -0.100, "eq_1h": -0.001, "eq_rest": -0.010}   # prereg section 2, 3 dp
BAR = {"tod": 0.10, "sig": 0.10, "fr": -0.05}
MARGIN = {"1h": 0.018, "rest": 0.042}
HZ = {"1h": 60, "rest": None}
YEARS = ["2023", "2024", "2025", "2026"]
Z = NormalDist()


# ----------------------------------------------------------------------------------------------------- small helpers
def r(x, k=4):
    return None if x is None or not np.isfinite(x) else round(float(x), k)


def pct_ci(reps, lo=2.5, hi=97.5):
    v = np.asarray(reps, float)
    v = v[np.isfinite(v)]
    return [r(np.percentile(v, lo)), r(np.percentile(v, hi))] if len(v) else [None, None]


def p_two(reps):
    """line_reaction._p_from_reps: two-sided share of replicates on the far side of 0."""
    v = np.asarray(reps, float)
    v = v[np.isfinite(v)]
    return float(min(1.0, 2 * min((v <= 0).mean(), (v >= 0).mean()))) if len(v) else 1.0


def p_from_ci(est, lo, hi):
    se = (hi - lo) / (2 * Z.inv_cdf(0.975))
    return 2 * (1 - Z.cdf(abs(est) / se))


def mde_from_ci(lo, hi, alpha, power=0.8, two=True):
    se = (hi - lo) / (2 * Z.inv_cdf(0.975))
    return (Z.inv_cdf(1 - (alpha / 2 if two else alpha)) + Z.inv_cdf(power)) * se


def holm(ps):
    ps = np.asarray(ps, float)
    o = np.argsort(ps)
    adj = np.empty(len(ps))
    run = 0.0
    for k, i in enumerate(o):
        run = max(run, min(1.0, (len(ps) - k) * ps[i]))
        adj[i] = run
    return adj


def bh(ps, q=0.10):
    ps = np.asarray(ps, float)
    m = len(ps)
    o = np.argsort(ps)
    ok = ps[o] <= q * np.arange(1, m + 1) / m
    k = int(np.max(np.nonzero(ok)[0]) + 1) if ok.any() else 0
    rej = np.zeros(m, bool)
    rej[o[:k]] = True
    return rej


def chance_baseline(tests, passes, alpha=0.05):
    """preregStats.chanceBaseline: P(X >= passes), X ~ Binomial(tests, alpha)."""
    from math import comb
    tail = sum(comb(tests, k) * alpha ** k * (1 - alpha) ** (tests - k) for k in range(passes, tests + 1))
    return {"tests": tests, "passes": int(passes), "alpha": alpha, "expected": r(tests * alpha, 2), "pAtLeastObserved": r(min(1.0, tail))}


def boot_W(n, b=B, seed=SEED, block=BLOCK):
    """Stationary date-block bootstrap weights [b, n], mean block 20, built with the study seed."""
    rng = np.random.default_rng(seed)
    jump = rng.random((b, n)) < 1 / block
    st = rng.integers(n, size=(b, n))
    i = rng.integers(n, size=b)
    idx = np.empty((b, n), np.int64)
    for t in range(n):
        if t:
            i = np.where(jump[:, t], st[:, t], i)
        idx[:, t] = i
        i = (i + 1) % n
    flat = (idx + np.arange(b)[:, None] * n).ravel()
    return np.bincount(flat, minlength=b * n).reshape(b, n).astype(np.float64)


# ----------------------------------------------------------------------------------------------------- data
def load_pair(sym, days):
    """features.py load(): 1-minute log mid of the bid/ask close, London 00:00-22:00, ffill <= 30 min, minus the open."""
    df = pd.read_parquet(BA / f"{sym.lower()}_m1.parquet", columns=["time", "bid_c", "ask_c"])
    t = pd.to_datetime(df["time"], utc=True).dt.as_unit("ns")          # m1_bidask is datetime64[us]
    idx = pd.DatetimeIndex(t).tz_convert("Europe/London").tz_localize(None)
    codes, uniq = pd.factorize(idx.normalize())
    date = np.asarray(uniq.strftime("%Y-%m-%d"))[codes]
    m = (idx.hour * 60 + idx.minute).to_numpy()
    keep = (date >= days[0]) & (date <= days[-1]) & (m < NM)
    date, m = date[keep], m[keep]
    bid, ask = df.bid_c.to_numpy()[keep], df.ask_c.to_numpy()[keep]
    assert len(date) == 0 or date.max() <= HARD_END
    di = pd.Index(days).get_indexer(date)
    ok = (di >= 0) & (bid > 0) & (ask >= bid)
    mid = np.full((len(days), NM), np.nan)
    hs = np.full((len(days), NM), np.nan, dtype=np.float32)
    mid[di[ok], m[ok]] = np.log((bid[ok] + ask[ok]) / 2)
    hs[di[ok], m[ok]] = (np.log(ask[ok]) - np.log(bid[ok])) / 2
    raw = np.isfinite(mid).sum(1)
    mid = pd.DataFrame(mid).ffill(axis=1, limit=FFILL).to_numpy()
    hs = pd.DataFrame(hs).ffill(axis=1, limit=FFILL).to_numpy(dtype=np.float32)
    first = np.array([row[np.isfinite(row)][0] if np.isfinite(row).any() else np.nan for row in mid])
    return (mid - first[:, None]).astype(np.float32), hs, raw


def grid():
    f = GRID / "grid.npz"
    if f.exists():
        z = np.load(f, allow_pickle=False)
        return z["days"], z["L"], z["HS"], z["RAW"]
    GRID.mkdir(parents=True, exist_ok=True)
    days = pd.bdate_range(DISC[0], HARD_END).strftime("%Y-%m-%d").to_numpy().astype("U10")
    L = np.full((7, len(days), NM), np.nan, dtype=np.float32)
    HS = np.full((7, len(days), NM), np.nan, dtype=np.float32)
    RAW = np.zeros((7, len(days)), dtype=np.int32)
    for k, s in enumerate(MAJ):
        t0 = time.time()
        L[k], HS[k], RAW[k] = load_pair(s, days)
        print(f"grid {s} {time.time() - t0:.0f}s", flush=True)
    np.savez(f, days=days, L=L, HS=HS, RAW=RAW)
    return days, L, HS, RAW


def sigma_series(sym):
    s = pd.read_csv(HIST / f"{sym}.csv", usecols=["date", "live_sig_used"]).set_index("date").live_sig_used
    return s[s.index <= HARD_END].sort_index() / 100            # daily sigma, log units, known at the open


# ----------------------------------------------------------------------------------------------------- the pipeline
class Win:
    """One analysis window. U: [7, day, minute] USD-signed log levels (NaN on incomplete sessions)."""

    def __init__(self, days, U, good, SIG, SIGL, scored, HS=None, L=None, sig_rank=None):
        self.days, self.U, self.good, self.SIG, self.SIGL, self.HS, self.L = days, U, good, SIG, SIGL, HS, L
        self.nD = len(days)
        self.scored = scored
        self.unit = np.where(scored, np.cumsum(scored) - 1, -1)
        self.nU = int(scored.sum())
        self.years = np.array([d[:4] for d in days])
        self.sig_rank = sig_rank
        tot, cnt = np.nansum(U, 0), np.isfinite(U).sum(0)
        with np.errstate(invalid="ignore", divide="ignore"):
            self.D = np.stack([(tot - np.nan_to_num(U[i])) / (cnt - np.isfinite(U[i])) for i in range(7)])
        self.D[:, ~good] = np.nan
        self.P = {}

    # -- products of h-minute returns, per bar: (Pxd, Pdd, Pxx, bar start minute)
    def prods(self, h):
        if h not in self.P:
            t = np.arange(h, NM, h)
            x = self.U[..., t] - self.U[..., t - h]
            d = self.D[..., t] - self.D[..., t - h]
            m = np.isfinite(x) & np.isfinite(d)
            x, d = np.where(m, x, 0.0), np.where(m, d, 0.0)
            self.P[h] = (x * d, d * d, x * x, t - h)
        return self.P[h]

    @staticmethod
    def pit_beta(Pxd, Pdd, win=20, lag=0):
        sxy, sxx = Pxd.sum(2), Pdd.sum(2)
        a = pd.DataFrame(sxy.T).rolling(win, min_periods=win // 2).sum().shift(1 + lag).to_numpy().T
        b = pd.DataFrame(sxx.T).rolling(win, min_periods=win // 2).sum().shift(1 + lag).to_numpy().T
        with np.errstate(invalid="ignore", divide="ignore"):
            return a / b

    def beta(self, h=5, win=20, lag=0):
        Pxd, Pdd, _, _ = self.prods(h)
        return self.pit_beta(Pxd, Pdd, win, lag)

    def ratio(self, num, den, mask, W):
        m = mask & self.scored & np.isfinite(num) & np.isfinite(den)
        a = np.where(m, num, 0.0)[self.scored]
        b = np.where(m, den, 0.0)[self.scored]
        pt = a.sum() / b.sum() if b.sum() > 0 else np.nan
        if W is None:
            return pt, None
        with np.errstate(invalid="ignore", divide="ignore"):
            return pt, (W @ a) / (W @ b)

    def bucket_share(self, i, beta, a, b, W, extra=None, h=5):
        """Out-of-sample dollar share of pair i over bars with start in [a, b)."""
        Pxd, Pdd, Pxx, st = self.prods(h)
        sel = (st >= a) & (st < b)
        A, Bb, C = Pxd[i][:, sel].sum(1), Pdd[i][:, sel].sum(1), Pxx[i][:, sel].sum(1)
        ok = self.good & np.isfinite(beta[i]) & (Pxx[i].sum(1) > 0) & (C > 0)
        if extra is not None:
            ok &= extra
        num = np.nan_to_num(2 * beta[i] * A - beta[i] ** 2 * Bb)
        return self.ratio(num, C, ok, W)

    # -- cell TOD
    def tod(self, beta, edges=TOD_BASE, W=None, extra=None, h=5):
        (o0, o1), (a0, a1) = edges
        per, reps = [], []
        for i in range(7):
            po, ro = self.bucket_share(i, beta, o0, o1, W, extra, h)
            pa, ra = self.bucket_share(i, beta, a0, a1, W, extra, h)
            per.append(TSIGN[i] * (po - pa))
            if W is not None:
                reps.append(TSIGN[i] * (ro - ra))
        return float(np.mean(per)), (np.mean(np.stack(reps), 0) if W is not None else None), per, reps

    # -- cell SIG
    def sig_groups(self, beta, S, nq, W=None, extra=None, fixed=False):
        """Per pair: share in each sigma group (groups cut over the window's scored complete sessions; fixed=True cuts
        a 0-1 rank at k/nq instead)."""
        Pxd, Pdd, Pxx, _ = self.prods(5)
        out = []
        for i in range(7):
            sxy, sxx, syy = Pxd[i].sum(1), Pdd[i].sum(1), Pxx[i].sum(1)
            ok = self.good & np.isfinite(beta[i]) & (syy > 0) & np.isfinite(S[i])
            cuts = (np.linspace(0, 1, nq + 1)[1:-1] if fixed else
                    np.nanpercentile(S[i][ok & self.scored], np.linspace(0, 100, nq + 1)[1:-1]))
            g = np.digitize(S[i], cuts)
            num = np.nan_to_num(2 * beta[i] * sxy - beta[i] ** 2 * sxx)
            m0 = ok if extra is None else ok & extra
            out.append([self.ratio(num, syy, m0 & (g == k), W) for k in range(nq)])
        return out

    def sig(self, beta, S, nq=3, W=None, extra=None):
        G = self.sig_groups(beta, S, nq, W, extra)
        per = [g[-1][0] - g[0][0] for g in G]
        reps = [g[-1][1] - g[0][1] for g in G] if W is not None else []
        return float(np.mean(per)), (np.mean(np.stack(reps), 0) if W is not None else None), per, reps

    # -- cell FR
    def fr_setup(self):
        Pxd, Pdd, Pxx, _ = self.prods(5)
        t = np.arange(5, NM, 5)
        x5 = self.U[..., t] - self.U[..., t - 5]
        allok = np.isfinite(x5).all(0) & self.good[:, None]
        x0 = np.where(allok[None], x5, 0.0)
        nb = allok.sum(1).astype(float)
        C = np.einsum("idk,jdk->dij", x0, x0)
        act = np.einsum("dii->d", C) / 7 / np.maximum(nb, 1)
        act[~self.good | (nb < 200)] = np.nan
        self.okc = np.isfinite(act)
        self.act = act
        self.Cday = C
        self.Cf = np.where(self.okc[:, None, None], C, 0).reshape(self.nD, 49)
        self.nbf = np.where(self.okc, nb, 0.0)
        self.x0 = x0

    def deciles(self, key):
        dec = np.full(self.nD, -1)
        for y in sorted(set(self.years[self.scored])):
            m = (self.years == y) & self.okc & np.isfinite(key) & self.scored
            if m.sum() > 20:
                dec[m] = pd.qcut(key[m], 10, labels=False, duplicates="drop")
        return dec

    @staticmethod
    def corr_stats(Cs, ns, Cc, nc):
        iu = np.triu_indices(7, 1)
        S = (Cs / ns[..., None]).reshape(*Cs.shape[:-1], 7, 7)
        Sc = (Cc / nc[..., None]).reshape(*Cc.shape[:-1], 7, 7)
        dg, dc = np.diagonal(S, axis1=-2, axis2=-1), np.diagonal(Sc, axis1=-2, axis2=-1)
        R = S / np.sqrt(dg[..., :, None] * dg[..., None, :])
        Rc = Sc / np.sqrt(dc[..., :, None] * dc[..., None, :])
        de = ((dg / dc)[..., :, None] + (dg / dc)[..., None, :]) / 2 - 1
        rho, rc, de = R[..., iu[0], iu[1]], Rc[..., iu[0], iu[1]], de[..., iu[0], iu[1]]
        corr = rho / np.sqrt(1 + de * (1 - rho ** 2))
        fwd = rc * np.sqrt(1 + de) / np.sqrt(1 + de * rc ** 2)
        return {"F": corr.mean(-1) - rc.mean(-1), "raw": rho.mean(-1) - rc.mean(-1), "fwd": fwd.mean(-1) - rc.mean(-1),
                "rho_top": rho.mean(-1), "rho_top_corr": corr.mean(-1), "rho_bot": rc.mean(-1), "fwd_top": fwd.mean(-1),
                "delta": de.mean(-1)}

    def fr(self, dec, k=3, W=None, extra=None):
        top = (dec >= 10 - k) & self.scored
        bot = (dec >= 0) & (dec < k) & self.scored
        if extra is not None:
            top, bot = top & extra, bot & extra
        Cs, Cb = self.Cf[top].sum(0), self.Cf[bot].sum(0)
        pt = self.corr_stats(Cs, np.array(self.nbf[top].sum()), Cb, np.array(self.nbf[bot].sum()))
        if W is None:
            return pt, None
        sc = self.scored
        At, Ab = np.where(top[:, None], self.Cf, 0)[sc], np.where(bot[:, None], self.Cf, 0)[sc]
        rp = self.corr_stats(W @ At, W @ np.where(top, self.nbf, 0)[sc], W @ Ab, W @ np.where(bot, self.nbf, 0)[sc])
        return pt, rp

    # -- cell EQ (features_wide.py events())
    def events(self, h, beta, sig, lag=0, pcts=(80, 90, 95)):
        rows = []
        tt = np.arange(h, NM - 2, h)
        for i in range(7):
            x = self.U[i][:, tt] - self.U[i][:, tt - h]
            dd = self.D[i][:, tt] - self.D[i][:, tt - h]
            c = beta[i][:, None] * dd
            e = x - c
            with np.errstate(invalid="ignore", divide="ignore"):
                az = np.abs(x / sig[i][:, None])
            ok = np.isfinite(az) & self.good[:, None]
            thr = {}
            for p in pcts:
                with np.errstate(all="ignore"), warnings.catch_warnings():
                    warnings.simplefilter("ignore", RuntimeWarning)
                    dp = np.nanpercentile(np.where(ok, az, np.nan), p, axis=1)
                thr[p] = pd.Series(dp).rolling(60, min_periods=20).mean().shift(1 + lag).to_numpy()
            with np.errstate(invalid="ignore"):
                ev = ok & (az >= thr[min(pcts)][:, None])
            dI, kI = np.nonzero(ev)
            t = tt[kI]
            sg = np.sign(x[dI, kI])
            cc, ee = c[dI, kI], e[dI, kI]
            with np.errstate(invalid="ignore", divide="ignore"):
                sh = cc ** 2 / (cc ** 2 + ee ** 2)
            sgi = sig[i][dI]
            ent = self.U[i][dI, t + 1]
            rec = {"pair": np.full(len(dI), i), "d": dI, "t": t, "sh": sh, "csame": np.sign(cc) == sg, "sg": sg}
            for p in pcts:
                rec[f"p{p}"] = az[dI, kI] >= thr[p][dI]
            for nm, H in HZ.items():
                ex = np.full(len(dI), NM - 1) if H is None else t + 1 + H
                okx = ex <= NM - 1
                exc = np.minimum(ex, NM - 1)
                rec[f"f_{nm}"] = np.where(okx, sg * (self.U[i][dI, exc] - ent) / sgi, np.nan)
                if self.HS is not None:
                    hs = self.HS[i]
                    rec[f"c_{nm}"] = np.where(okx, (hs[dI, t + 1].astype(float) + hs[dI, exc]) / sgi, np.nan)
            rows.append(pd.DataFrame(rec))
        E = pd.concat(rows, ignore_index=True)
        return E[self.scored[E.d.to_numpy()]].reset_index(drop=True)

    def emean(self, E, mask, col, W):
        u = self.unit[E.d.to_numpy()]
        x = E[col].to_numpy(float)
        m = mask & np.isfinite(x) & (u >= 0)
        a = np.bincount(u[m], weights=x[m], minlength=self.nU)
        b = np.bincount(u[m], minlength=self.nU).astype(float)
        if b.sum() == 0:
            return np.nan, None, 0
        pt = a.sum() / b.sum()
        if W is None:
            return pt, None, int(m.sum())
        with np.errstate(invalid="ignore", divide="ignore"):
            return pt, (W @ a) / (W @ b), int(m.sum())

    @staticmethod
    def groups(E, pct, cut):
        b = E[f"p{pct}"].to_numpy() & np.isfinite(E.sh.to_numpy())
        dol = b & (E.sh.to_numpy() >= cut) & E.csame.to_numpy()
        own = b & (E.sh.to_numpy() <= 1 - cut)
        return b, dol, own

    def eq(self, E, pct=90, cut=0.7, W=None, extra=None):
        big, dol, own = self.groups(E, pct, cut)
        if extra is not None:
            big, dol, own = big & extra, dol & extra, own & extra
        out = {}
        for hn in HZ:
            pd_, rd, nd = self.emean(E, dol, f"f_{hn}", W)
            po, ro, no = self.emean(E, own, f"f_{hn}", W)
            pa, ra, na = self.emean(E, big, f"f_{hn}", W)
            out[hn] = {"diff": pd_ - po, "reps": None if W is None else rd - ro, "dollar": pd_, "own": po, "all_big": pa,
                       "n_dollar": nd, "n_own": no, "n_big": na, "rd": rd, "ro": ro, "ra": ra}
            if f"c_{hn}" in E:
                out[hn]["cost"] = self.emean(E, big, f"c_{hn}", None)[0]
        return out


def make_window(days_all, L, HS, RAW, start, end, warm):
    """Slice the grid: [warm-up sessions] + [start .. end]; scored = start .. end."""
    good_all = (RAW >= 900).all(0)
    i0 = int(np.searchsorted(days_all, start))
    i1 = int(np.searchsorted(days_all, end, side="right"))
    if warm:
        prev_good = np.flatnonzero(good_all[:i0])
        w0 = int(prev_good[-warm])
    else:
        w0 = i0
    sl = slice(w0, i1)
    days = days_all[sl]
    assert max(days.tolist()) <= HARD_END and days[-1] <= end
    good = good_all[sl]
    U = np.stack([SIGN[s] * L[k, sl] for k, s in enumerate(MAJ)]).astype(np.float64)
    U[:, ~good] = np.nan
    SIG, SIGL, RANK = [], [], []
    for s in MAJ:
        ser = sigma_series(s)
        ser = ser[ser.index <= end]
        SIG.append(ser.reindex(days).to_numpy(float))
        SIGL.append(ser.shift(1).reindex(days).to_numpy(float))
        # point-in-time rank against the previous 252 sessions' sigma (descriptive SIG ladder)
        rk = ser.rolling(253, min_periods=126).apply(lambda v: (v[:-1] < v[-1]).mean(), raw=True)
        RANK.append(rk.reindex(days).to_numpy(float))
    scored = days >= start
    return Win(days, U, good, np.stack(SIG), np.stack(SIGL), scored, HS=HS[:, sl], L=L[:, sl], sig_rank=np.stack(RANK))


# ----------------------------------------------------------------------------------------------------- step 0
def step0():
    t0 = time.time()
    OUT.mkdir(parents=True, exist_ok=True)
    days_all, L, HS, RAW = grid()
    print("grid ready", f"{time.time() - t0:.0f}s", flush=True)
    w = make_window(days_all, L, HS, RAW, DISC[0], DISC[1], warm=0)
    assert max(w.days.tolist()) <= DISC[1]
    print("discovery sessions", w.nD, "complete", int(w.good.sum()), flush=True)
    W = boot_W(w.nU)
    be = w.beta()
    tod, tr, *_ = w.tod(be, W=W)
    sig, sr, *_ = w.sig(be, w.SIG, 3, W=W)
    w.fr_setup()
    pt, rp = w.fr(w.deciles(w.act), 3, W=W)
    E = w.events(15, be, w.SIG)
    eq = w.eq(E, W=W)
    got = {"tod": tod, "sig": sig, "fr": float(pt["F"]), "eq_1h": eq["1h"]["diff"], "eq_rest": eq["rest"]["diff"]}
    se = {"tod": np.nanstd(tr), "sig": np.nanstd(sr), "fr": np.nanstd(rp["F"]), "eq_1h": np.nanstd(eq["1h"]["reps"]),
          "eq_rest": np.nanstd(eq["rest"]["reps"])}
    repro = {k: {"target": TARGET[k], "got": r(got[k], 5), "got_3dp": round(float(got[k]), 3), "se_B2000": r(se[k]),
                 "match": round(float(got[k]), 3) == TARGET[k]} for k in TARGET}
    repro["n_events"] = {"dollar_1h": eq["1h"]["n_dollar"], "own_1h": eq["1h"]["n_own"]}
    print("reproduction", json.dumps(repro), f"{time.time() - t0:.0f}s", flush=True)
    del w, E
    pc = positive_control()
    passed = all(v["match"] for k, v in repro.items() if k in TARGET) and pc["pass"]
    res = {"ranAt": pd.Timestamp.now(tz="UTC").isoformat(), "seed": SEED, "B": B, "window": list(DISC),
           "reproduction": repro, "positive_control": pc, "pass": bool(passed)}
    (OUT / "discovery").mkdir(parents=True, exist_ok=True)
    (OUT / "discovery" / "step0.json").write_text(json.dumps(res, indent=1, default=float), encoding="utf-8")
    print("STEP 0", "PASS" if passed else "FAIL", f"{time.time() - t0:.0f}s", flush=True)
    return res


# ---- planted one-factor model
BETA_P = np.array([1.0, 0.8, 0.9, 0.9, 0.5, 0.9, 0.6])
VE_P = np.array([0.8, 1.5, 1.0, 1.2, 1.0, 1.0, 1.5])


def h_profile():
    m = np.arange(NM)
    h = np.full(NM, 1.0)
    h[m < 420] = 0.4
    h[(m >= 780) & (m < 960)] = 2.0
    h[m >= 960] = 0.8
    g = np.ones((7, NM))
    g[4, (m >= 780) & (m < 960)] = 3.0                       # USDCAD own news in the overlap (as found)
    return h, g


def simulate(nS, seed, loud_frac=0.10, loud_x=3.0, kd_sd=0.3):
    rng = np.random.default_rng(seed)
    h, g = h_profile()
    loud = rng.random(nS) < loud_frac
    kd = np.exp(rng.normal(0, kd_sd, nS)) * np.where(loud, loud_x, 1.0)
    f = rng.standard_normal((nS, NM)) * np.sqrt(kd[:, None] * h[None])
    f[:, 0] = 0
    U = np.empty((7, nS, NM))
    for i in range(7):
        e = rng.standard_normal((nS, NM)) * np.sqrt(VE_P[i] * g[i])[None]
        e[:, 0] = 0
        U[i] = np.cumsum(BETA_P[i] * f + e, 1)
    var_day = np.stack([BETA_P[i] ** 2 * kd * h[1:].sum() + VE_P[i] * g[i, 1:].sum() for i in range(7)])
    return U, kd, loud, np.sqrt(var_day), h, g


def expected_prods(kd, h, g, hstep=5):
    """Population per-bar E[x d], E[d d], E[x x] under the planted model (leave-own-out factor)."""
    t = np.arange(hstep, NM, hstep)
    cs_h = np.concatenate([[0], np.cumsum(h[1:])])            # increments at minutes 1..NM-1
    cs_g = np.concatenate([np.zeros((7, 1)), np.cumsum(g[:, 1:], 1)], 1)
    Hb = cs_h[t] - cs_h[t - hstep]
    Gb = cs_g[:, t] - cs_g[:, t - hstep]
    Vf = kd[:, None] * Hb[None]
    Pxd, Pdd, Pxx = [], [], []
    for i in range(7):
        oth = [j for j in range(7) if j != i]
        mb = BETA_P[oth].mean()
        ve_d = sum(VE_P[j] * Gb[j] for j in oth) / 36
        Pxd.append(BETA_P[i] * mb * Vf)
        Pdd.append(mb ** 2 * Vf + ve_d[None])
        Pxx.append(BETA_P[i] ** 2 * Vf + (VE_P[i] * Gb[i])[None])
    return np.stack(Pxd), np.stack(Pdd), np.stack(Pxx), t - hstep


def positive_control():
    t0 = time.time()
    nS = 800
    U, kd, loud, sd, h, g = simulate(nS, SEED)
    days = pd.bdate_range("2001-01-01", periods=nS).strftime("%Y-%m-%d").to_numpy()
    good = np.ones(nS, bool)
    sim = Win(days, U, good, sd, sd, np.ones(nS, bool))
    pop = Win(days, np.zeros((7, nS, 3)), good, sd, sd, np.ones(nS, bool))
    pop.P[5] = expected_prods(kd, h, g)
    out = {"nS": nS, "planted": {"beta": BETA_P.tolist(), "ve": VE_P.tolist(), "loud_frac": 0.10, "loud_x": 3.0}}
    bs, bp = sim.beta(), pop.beta()
    # share by bucket
    sh = []
    for i in range(7):
        for nm, a, b in TODB:
            s_, p_ = sim.bucket_share(i, bs, a, b, None)[0], pop.bucket_share(i, bp, a, b, None)[0]
            sh.append({"pair": MAJ[i], "bucket": nm, "sim": r(s_), "planted": r(p_), "err": r(s_ - p_)})
    out["share_by_bucket"] = sh
    out["share_max_err"] = r(max(abs(x["err"]) for x in sh))
    ts, tp = sim.tod(bs)[0], pop.tod(bp)[0]
    ss, sp = sim.sig(bs, sd)[0], pop.sig(bp, sd)[0]
    out["tod"] = {"sim": r(ts), "planted": r(tp), "err": r(ts - tp)}
    out["sig"] = {"sim": r(ss), "planted": r(sp), "err": r(ss - sp)}
    # Forbes-Rigobon, literal prereg check: corrected rho on factor-only loud days vs calm days
    sim.fr_setup()
    Cl, Cc = sim.Cf[loud].sum(0), sim.Cf[~loud].sum(0)
    fr_s = Win.corr_stats(Cl, np.array(sim.nbf[loud].sum()), Cc, np.array(sim.nbf[~loud].sum()))
    # population: C_ij = b_i b_j Vf + delta_ij Ve_i (per day, summed over 5-min bars)
    cs_h = h[1:].sum()
    Vf = kd * cs_h
    Ve = np.array([VE_P[i] * g[i, 1:].sum() for i in range(7)])
    Cpop = Vf[:, None, None] * np.outer(BETA_P, BETA_P)[None] + np.diag(Ve)[None]
    Cpf = Cpop.reshape(nS, 49)
    fr_p = Win.corr_stats(Cpf[loud].sum(0), np.array(float(loud.sum())), Cpf[~loud].sum(0), np.array(float((~loud).sum())))
    out["fr_literal"] = {"corrected_loud_minus_calm_sim": r(float(fr_s["F"])), "corrected_loud_minus_calm_population": r(float(fr_p["F"])),
                         "raw_loud_minus_calm_sim": r(float(fr_s["raw"])), "forward_map_minus_calm_population": r(float(fr_p["fwd"])),
                         "pass": bool(abs(float(fr_s["F"])) <= 0.02)}
    # Forbes-Rigobon, the pipeline's own statistic (activity deciles 8-10 vs 1-3): sim vs population value
    dec_s = sim.deciles(sim.act)
    Fs = float(sim.fr(dec_s, 3)[0]["F"])
    act_p = np.einsum("dii->d", Cpop) / 7 / 263
    pw = Win(days, np.zeros((7, nS, 3)), good, sd, sd, np.ones(nS, bool))
    pw.okc, pw.act, pw.Cf, pw.nbf = np.ones(nS, bool), act_p, Cpf, np.full(nS, 263.0)
    Fp = float(pw.fr(pw.deciles(act_p), 3)[0]["F"])
    out["fr_pipeline"] = {"sim": r(Fs), "planted": r(Fp), "err": r(Fs - Fp), "pass": bool(abs(Fs - Fp) <= 0.02)}
    print("control share/tod/sig/fr", out["share_max_err"], out["tod"], out["sig"], out["fr_literal"], out["fr_pipeline"],
          f"{time.time() - t0:.0f}s", flush=True)
    # EQ: no planted difference; the 90% interval must cover 0 in >= 85 of 100 draws
    cover = {"1h": 0, "rest": 0}
    diffs = {"1h": [], "rest": []}
    for k in range(100):
        U2, kd2, _, sd2, _, _ = simulate(300, SEED + 1 + k)
        days2 = pd.bdate_range("2001-01-01", periods=300).strftime("%Y-%m-%d").to_numpy()
        w2 = Win(days2, U2, np.ones(300, bool), sd2, sd2, np.ones(300, bool))
        W2 = boot_W(300, 500, SEED + 1 + k)
        E2 = w2.events(15, w2.beta(), sd2)
        q = w2.eq(E2, W=W2)
        for hn in HZ:
            lo, hi = np.nanpercentile(q[hn]["reps"], [5, 95])
            cover[hn] += int(lo <= 0 <= hi)
            diffs[hn].append(q[hn]["diff"])
    out["eq_coverage"] = {"covers_0_of_100": cover, "mean_diff": {k: r(float(np.mean(v))) for k, v in diffs.items()},
                          "pass": bool(min(cover.values()) >= 85)}
    print("control EQ coverage", out["eq_coverage"], f"{time.time() - t0:.0f}s", flush=True)
    out["checks"] = {"share_by_bucket": out["share_max_err"] <= 0.02, "tod": abs(out["tod"]["err"]) <= 0.02, "sig": abs(out["sig"]["err"]) <= 0.02,
                     "fr_literal": out["fr_literal"]["pass"], "fr_pipeline": out["fr_pipeline"]["pass"], "eq": out["eq_coverage"]["pass"]}
    out["pass"] = bool(all(out["checks"].values()))
    return out


# ----------------------------------------------------------------------------------------------------- confirm
def same_half(base, v):
    """Plateau / lag rule: same sign as the base and at least half its size."""
    return bool(np.sign(v) == np.sign(base) and abs(v) >= abs(base) / 2)


def stop_through(w, E, mask, sv=0.25, win=240):
    """Fade stop-through beyond sv sigma on the M1 bid/ask close path, 4h window cut at 22:00 (descriptive)."""
    out = np.full(len(E), np.nan)
    for i, s in enumerate(MAJ):
        idx = np.flatnonzero(mask & (E.pair.to_numpy() == i))
        if not len(idx):
            continue
        P = np.pad(w.L[i].astype(np.float64), ((0, 0), (0, win + 1)), constant_values=np.nan)
        H = np.pad(w.HS[i].astype(np.float64), ((0, 0), (0, win + 1)), constant_values=np.nan)
        P[~w.good] = np.nan
        d_ = E.d.to_numpy()[idx]
        cols = E.t.to_numpy()[idx][:, None] + 1 + np.arange(win + 1)[None]
        Pw, Hw = P[d_[:, None], cols], H[d_[:, None], cols]
        sg = w.SIG[i][d_][:, None]
        k = (E.sg.to_numpy()[idx] * SIGN[s])[:, None]
        net_x = -k * (Pw - Pw[:, :1]) / sg - (Hw + Hw[:, :1]) / sg
        out[idx] = (np.nanmin(np.where(np.isfinite(net_x), net_x, np.inf), 1) <= -sv).astype(float)
    return out


def confirm(win=CONF, warm=WARM, out=None, years=None):
    """Score the confirm window once. win/out/years are overridden only by the discovery-window smoke test."""
    global YEARS
    t0 = time.time()
    out = OUT if out is None else out
    if years:
        YEARS = years
    if win == CONF:
        s0 = json.loads((OUT / "discovery" / "step0.json").read_text(encoding="utf-8"))
        if not s0.get("pass"):
            sys.exit("step 0 did not pass: the confirm window stays closed")
    days_all, L, HS, RAW = grid()
    w = make_window(days_all, L, HS, RAW, win[0], win[1], warm=warm)
    assert max(w.days.tolist()) <= win[1] <= HARD_END
    W = boot_W(w.nU)
    sc = w.scored
    yr = {y: w.years == y for y in YEARS}
    print("confirm window", w.days[0], w.days[-1], "scored", w.nU, "complete scored", int((w.good & sc).sum()), flush=True)
    res = {"id": "vol-layer-features-confirm", "seed": SEED, "B": B, "window": list(win), "warmup_from": str(w.days[0]),
           "sessions_scored": w.nU, "sessions_complete": int((w.good & sc).sum()),
           "sessions_by_year": {y: int((w.good & sc & yr[y]).sum()) for y in YEARS}}
    be, be10, be40, beL = w.beta(), w.beta(win=10), w.beta(win=40), w.beta(lag=1)
    dis = []                       # disaggregation cells for BH

    def add(fam, lab, est, reps):
        dis.append({"family": fam, "cell": lab, "est": r(est), "ci": pct_ci(reps), "p": p_two(reps)})

    cells = {}
    # ---------------- TOD
    T, Tr, Tper, Trep = w.tod(be, W=W)
    tod = {"est": T, "reps": Tr, "per_pair": {s: r(v) for s, v in zip(MAJ, Tper)}}
    tod["neighbours"] = {"beta10": w.tod(be10)[0], "beta40": w.tod(be40)[0],
                         **{k: w.tod(be, edges=v)[0] for k, v in TOD_NEIGH.items()}}
    tod["lag1"] = w.tod(beL)[0]
    tod["years"] = {y: w.tod(be, extra=yr[y])[0] for y in YEARS}
    tod["per_pair_ok"] = int(sum(v > 0 for v in Tper))
    for i, s in enumerate(MAJ):
        add("TOD per pair", s, Tper[i], Trep[i])
    Pxd, Pdd, Pxx, _ = w.prods(5)
    buck = {}
    for i, s in enumerate(MAJ):
        sxy, sxx, syy = Pxd[i].sum(1), Pdd[i].sum(1), Pxx[i].sum(1)
        ok = w.good & np.isfinite(be[i]) & (syy > 0)
        pp, pr = w.ratio(np.nan_to_num(2 * be[i] * sxy - be[i] ** 2 * sxx), syy, ok, W)
        buck[s] = {"pooled": [r(pp)] + pct_ci(pr)}
        for nm, a, b in TODB:
            bp, br = w.bucket_share(i, be, a, b, W)
            buck[s][nm] = [r(bp)] + pct_ci(br)
            add("share bucket minus pooled", f"{s} {nm}", bp - pp, br - pr)
    res["share_by_pair_bucket_5m"] = buck
    # mirror: wrong-day factor (beta applied to another scored session's dollar path)
    rng = np.random.default_rng(SEED)
    gsc = np.flatnonzero(w.good & sc)
    perm = np.arange(w.nD)
    perm[gsc] = gsc[rng.permutation(len(gsc))]
    t5 = np.arange(5, NM, 5)
    mir = {}
    for i, s in enumerate(MAJ):
        x = w.U[i][:, t5] - w.U[i][:, t5 - 5]
        d = w.D[i][perm][:, t5] - w.D[i][perm][:, t5 - 5]
        m = np.isfinite(x) & np.isfinite(d)
        x, d = np.where(m, x, 0), np.where(m, d, 0)
        sxy, sxx, syy = (x * d).sum(1), (d * d).sum(1), (x * x).sum(1)
        ok = w.good & sc & np.isfinite(be[i]) & (syy > 0) & (sxx > 0)
        mir[s] = {"oos_share": r(np.sum((2 * be[i] * sxy - be[i] ** 2 * sxx)[ok]) / np.sum(syy[ok])),
                  "in_sample_r2": r(np.mean((sxy ** 2 / (sxx * syy))[ok]))}
    tod["mirror_wrong_day"] = mir
    cells["TOD"] = tod
    print("TOD", r(T), pct_ci(Tr), {k: r(v) for k, v in tod["neighbours"].items()}, "lag", r(tod["lag1"]), f"{time.time() - t0:.0f}s", flush=True)

    # ---------------- SIG
    S_, Sr, Sper, Srep = w.sig(be, w.SIG, 3, W=W)
    sig = {"est": S_, "reps": Sr, "per_pair": {s: r(v) for s, v in zip(MAJ, Sper)}}
    sig["neighbours"] = {"quartiles": w.sig(be, w.SIG, 4)[0], "quintiles": w.sig(be, w.SIG, 5)[0],
                         "beta10": w.sig(be10, w.SIG, 3)[0], "beta40": w.sig(be40, w.SIG, 3)[0]}
    sig["lag1"] = w.sig(beL, w.SIGL, 3)[0]
    sig["years"] = {y: w.sig(be, w.SIG, 3, extra=yr[y])[0] for y in YEARS}
    sig["per_pair_ok"] = int(sum(v > 0 for v in Sper))
    lad = {}
    for nq in (3, 5):
        G = w.sig_groups(be, w.SIG, nq)
        lad[f"window_{nq}"] = {"mean_of_7": [r(np.mean([g[k][0] for g in G])) for k in range(nq)],
                               "per_pair": {s: [r(g[k][0]) for k in range(nq)] for s, g in zip(MAJ, G)}}
    G = w.sig_groups(be, w.sig_rank, 3, fixed=True)
    lad["trailing252_rank_thirds"] = {"mean_of_7": [r(np.mean([g[k][0] for g in G])) for k in range(3)],
                                      "high_minus_low": r(np.mean([g[2][0] - g[0][0] for g in G]))}
    sig["ladder"] = lad
    sig["mirror_low_third"] = lad["window_3"]["mean_of_7"][0]
    for i, s in enumerate(MAJ):
        add("SIG per pair", s, Sper[i], Srep[i])
    cells["SIG"] = sig
    print("SIG", r(S_), pct_ci(Sr), {k: r(v) for k, v in sig["neighbours"].items()}, "lag", r(sig["lag1"]), f"{time.time() - t0:.0f}s", flush=True)

    # ---------------- FR
    w.fr_setup()
    dec = w.deciles(w.act)
    pt, rp = w.fr(dec, 3, W=W)
    fr = {"est": float(pt["F"]), "reps": rp["F"], "raw": r(float(pt["raw"])), "raw_ci": pct_ci(rp["raw"]),
          "forward_map": r(float(pt["fwd"])), "rho_bottom": r(float(pt["rho_bot"])), "rho_top_raw": r(float(pt["rho_top"])),
          "rho_top_corrected": r(float(pt["rho_top_corr"])), "rho_top_forward": r(float(pt["fwd_top"])), "delta": r(float(pt["delta"]))}
    fr["neighbours"] = {"top2_vs_bottom2": float(w.fr(dec, 2)[0]["F"]), "top4_vs_bottom4": float(w.fr(dec, 4)[0]["F"])}
    prev = pd.Series(w.act).shift(1).to_numpy()
    lpt, lrp = w.fr(w.deciles(prev), 3, W=W)
    fr["lag1"] = float(lpt["F"])
    fr["lag1_ci"] = pct_ci(lrp["F"])
    fr["years"] = {}
    for y in YEARS:
        ypt, yrp = w.fr(dec, 3, W=W, extra=yr[y])
        fr["years"][y] = float(ypt["F"])
        add("FR per year", y, ypt["F"], yrp["F"])
    ladd = []
    for q in range(10):
        m1, m0 = (dec == q) & sc, (dec == 0) & sc
        st = Win.corr_stats(w.Cf[m1].sum(0), np.array(w.nbf[m1].sum()), w.Cf[m0].sum(0), np.array(w.nbf[m0].sum()))
        ladd.append({"decile": q + 1, "raw": r(float(st["rho_top"])), "corrected": r(float(st["rho_top_corr"])), "forward": r(float(st["fwd_top"]))})
    fr["decile_ladder"] = ladd
    cells["FR"] = fr
    print("FR", r(fr["est"]), pct_ci(rp["F"]), {k: r(v) for k, v in fr["neighbours"].items()}, "lag", r(fr["lag1"]), f"{time.time() - t0:.0f}s", flush=True)

    # (e) absorption ratio: rolling 63 complete sessions ending at t-1, shuffled benchmark, PC1 loading stability
    gi = np.flatnonzero(w.okc)
    cs = np.concatenate([np.zeros((1, 7, 7)), np.cumsum(w.Cday[gi], 0)])
    xg = w.x0[:, gi]
    xs = np.stack([xg[i][rng.permutation(len(gi))] for i in range(7)])
    css = np.concatenate([np.zeros((1, 7, 7)), np.cumsum(np.einsum("idk,jdk->dij", xs, xs), 0)])

    def eig(M):
        v = np.sqrt(np.diag(M))
        lam, vec = np.linalg.eigh(M / np.outer(v, v))
        return lam[::-1], vec[:, -1]
    ab = []
    for t in np.flatnonzero(sc):
        k = int(np.searchsorted(gi, t))               # complete sessions strictly before t
        if k < 63:
            continue
        lam, v1 = eig(cs[k] - cs[k - 63])
        lsh, _ = eig(css[k] - css[k - 63])
        ang = np.nan
        if k >= 126:
            _, v0 = eig(cs[k - 63] - cs[k - 126])
            ang = float(np.degrees(np.arccos(min(1.0, abs(float(v1 @ v0))))))
        ab.append((w.days[t][:4], lam[0] / 7, 49 / (lam ** 2).sum(), lsh[0] / 7, 49 / (lsh ** 2).sum(), ang))
    AB = pd.DataFrame(ab, columns=["year", "top1", "npr", "top1_shuffled", "npr_shuffled", "pc1_angle_deg"])
    res["absorption"] = {"n_days": len(AB), "all": {c: r(AB[c].mean()) for c in AB.columns[1:]},
                         "by_year": {y: {c: r(g[c].mean()) for c in AB.columns[1:]} for y, g in AB.groupby("year")},
                         "top1_range": [r(AB.top1.min()), r(AB.top1.max())], "angle_median": r(AB.pc1_angle_deg.median())}
    del xs, xg

    # ---------------- EQ
    E = w.events(15, be, w.SIG)
    q = w.eq(E, W=W)
    eq = {}
    for hn in HZ:
        rr = q[hn]["reps"]
        fin = rr[np.isfinite(rr)]
        m = MARGIN[hn]
        p_hi, p_lo = float(np.mean(fin >= m)), float(np.mean(fin <= -m))
        eq[hn] = {"est": q[hn]["diff"], "reps": rr, "ci": pct_ci(rr), "ci90": pct_ci(rr, 5, 95), "p_tost": max(p_hi, p_lo),
                  "p_upper": p_hi, "p_lower": p_lo, "p_vs0": p_two(rr), "dollar": [r(q[hn]["dollar"])] + pct_ci(q[hn]["rd"]),
                  "own": [r(q[hn]["own"])] + pct_ci(q[hn]["ro"]), "mirror_all_big": [r(q[hn]["all_big"])] + pct_ci(q[hn]["ra"]),
                  "n_dollar": q[hn]["n_dollar"], "n_own": q[hn]["n_own"], "n_big": q[hn]["n_big"], "round_trip": r(q[hn].get("cost"))}
    eq["p"] = max(eq["1h"]["p_tost"], eq["rest"]["p_tost"])
    EL = w.events(15, beL, w.SIGL, lag=1, pcts=(90,))
    ql = w.eq(EL, 90, 0.7)
    eq["lag1"] = {hn: ql[hn]["diff"] for hn in HZ}
    del EL
    yE = w.years[E.d.to_numpy()]
    eq["years"] = {}
    for y in YEARS:
        qy = w.eq(E, extra=yE == y, W=W)
        eq["years"][y] = {hn: qy[hn]["diff"] for hn in HZ}
        for hn in HZ:
            add(f"EQ {hn} per year", y, qy[hn]["diff"], qy[hn]["reps"])
    for i, s in enumerate(MAJ):
        qp = w.eq(E, extra=E.pair.to_numpy() == i, W=W)
        add("EQ 1h per pair", s, qp["1h"]["diff"], qp["1h"]["reps"])
    big, dol, own = Win.groups(E, 90, 0.7)
    E["st"] = stop_through(w, E, big)
    eq["stop_through_0.25"] = {"dollar": r(w.emean(E, dol, "st", None)[0]), "own": r(w.emean(E, own, "st", None)[0]),
                               "all_big": r(w.emean(E, big, "st", None)[0])}
    plat = []
    for h in (5, 15, 30):
        Eh = E if h == 15 else w.events(h, be, w.SIG)
        for pct in (80, 90, 95):
            for cut in (0.6, 0.7, 0.8):
                if (h, pct, cut) == (15, 90, 0.7):
                    continue
                qn = w.eq(Eh, pct, cut)
                plat.append({"h": h, "pct": pct, "cut": cut, "diff_1h": r(qn["1h"]["diff"], 5), "n_dollar": qn["1h"]["n_dollar"], "n_own": qn["1h"]["n_own"]})
        if h != 15:
            del Eh
    eq["neighbours"] = plat
    cells["EQ"] = eq
    print("EQ", {hn: (r(eq[hn]["est"], 5), eq[hn]["ci"], eq[hn]["p_tost"]) for hn in HZ}, "lag", eq["lag1"], f"{time.time() - t0:.0f}s", flush=True)

    # (d) joint worst days
    prng = np.random.default_rng(SEED)
    jw, jp = {}, []
    for i, s in enumerate(MAJ):
        u_day = w.U[i][:, NM - 1] - w.U[i][:, 0]
        d_day = w.D[i][:, NM - 1] - w.D[i][:, 0]
        c = be[i] * d_day / w.SIG[i]
        e = u_day / w.SIG[i] - c
        ok = w.good & sc & np.isfinite(c) & np.isfinite(e)
        c, e = c[ok], e[ok]
        n = len(c)
        perms = np.stack([prng.permutation(n) for _ in range(2000)])
        jw[s] = {"n_days": n}
        for qq in (0.05, 0.10):
            ca, ea = np.abs(c) >= np.quantile(np.abs(c), 1 - qq), np.abs(e) >= np.quantile(np.abs(e), 1 - qq)
            cu, eu = c >= np.quantile(c, 1 - qq / 2), e >= np.quantile(e, 1 - qq / 2)
            cd, ed = c <= np.quantile(c, qq / 2), e <= np.quantile(e, qq / 2)
            oa, sa = int((ca & ea).sum()), (ca[None] & ea[perms]).sum(1)
            os_, ss_ = int((cu & eu).sum() + (cd & ed).sum()), (cu[None] & eu[perms]).sum(1) + (cd[None] & ed[perms]).sum(1)
            for nm, ob, shv in (("abs", oa, sa), ("same_dir", os_, ss_)):
                p = max(min(1.0, 2 * min((shv >= ob).mean(), (shv <= ob).mean())), 1 / 2001)
                jw[s][f"{nm}_{qq}"] = {"observed": ob, "shuffled_mean": r(shv.mean(), 2), "shuffled_97.5": r(np.percentile(shv, 97.5), 1), "p": r(p)}
                jp.append(p)
    rej = bh(jp)
    k = 0
    for s in MAJ:
        for key in [kk for kk in jw[s] if kk != "n_days"]:
            jw[s][key]["bh"] = bool(rej[k])
            k += 1
    res["joint_worst"] = {"pairs": jw, "bh_pass": int(rej.sum()), "chance": chance_baseline(len(jp), int(sum(p < 0.05 for p in jp)))}

    # proxy spec: share by pair x bucket x year on 15-minute returns, and TOD on 15-minute returns
    be15 = w.beta(h=15)
    px = {}
    for i, s in enumerate(MAJ):
        px[s] = {}
        for nm, a, b in TODB:
            row = {y: r(w.bucket_share(i, be15, a, b, None, extra=yr[y], h=15)[0]) for y in YEARS}
            row["all"] = r(w.bucket_share(i, be15, a, b, None, h=15)[0])
            px[s][nm] = row
    T15, T15r, T15per, T15rep = w.tod(be15, W=W, h=15)
    res["proxy_15m"] = {"share": px, "tod_15m": [r(T15)] + pct_ci(T15r), "tod_15m_per_pair": {s: r(v) for s, v in zip(MAJ, T15per)}}
    for i, s in enumerate(MAJ):
        add("TOD 15m per pair", s, T15per[i], T15rep[i])

    # ---------------- scoring
    ps = [p_two(cells["TOD"]["reps"]), p_two(cells["SIG"]["reps"]), p_two(cells["FR"]["reps"]), cells["EQ"]["p"]]
    hp = holm(ps)
    zq = Z.inv_cdf(1 - 0.0125) + Z.inv_cdf(0.9)
    out_cells = []
    for nm, p, ph in zip(["TOD", "SIG", "FR", "EQ"], ps, hp):
        c = cells[nm]
        if nm != "EQ":
            bar = BAR[nm.lower()]
            sgn = np.sign(bar)
            est = c["est"]
            lo, hi = pct_ci(c["reps"])
            holm_ok = ph < 0.05 and np.sign(est) == sgn
            gate = {"holm": bool(holm_ok), "bar": bool(sgn * est >= abs(bar)),
                    "plateau": all(same_half(est, v) and np.sign(v) == sgn for v in c["neighbours"].values()),
                    "lag1": same_half(est, c["lag1"]) and np.sign(c["lag1"]) == sgn,
                    "years": bool(sum(np.sign(v) == sgn for v in c["years"].values()) >= 3),
                    "per_pair": True if nm == "FR" else bool(c["per_pair_ok"] >= (6 if nm == "TOD" else 5))}
            shi = max(sgn * lo, sgn * hi)
            if all(gate.values()):
                v = "validated"
            elif shi < abs(bar):            # CI wholly on the near side of the bar (or wholly the wrong sign)
                v = "null"
            elif holm_ok:
                v = "context"
            else:
                v = "underpowered"
            out_cells.append({"name": nm, "n": res["sessions_complete"], "est": r(est), "lo": lo, "hi": hi,
                              "mde": r(mde_from_ci(lo, hi, 0.0125)), "mde_a05": r(mde_from_ci(lo, hi, 0.05)), "bar": bar,
                              "p": r(p), "p_holm": r(ph), "p_from_ci": r(p_from_ci(est, lo, hi)), "gate": gate, "verdict": v,
                              "lag1": r(c["lag1"]), "neighbours": {k: r(x) for k, x in c["neighbours"].items()},
                              "years": {k: r(x) for k, x in c["years"].items()}, "per_pair": c.get("per_pair")})
        else:
            hz = {}
            for hn in HZ:
                lo, hi = c[hn]["ci"]
                se = (hi - lo) / (2 * Z.inv_cdf(0.975))
                hz[hn] = {"est": r(c[hn]["est"], 5), "lo": lo, "hi": hi, "ci90": c[hn]["ci90"], "margin": MARGIN[hn], "p_tost": r(c[hn]["p_tost"]),
                          "min_margin_tost": r(zq * se, 5), "inside": bool(abs(c[hn]["est"]) <= MARGIN[hn]),
                          "ci_wholly_outside": bool(lo > MARGIN[hn] or hi < -MARGIN[hn])}
            gate = {"holm": bool(ph < 0.05),
                    "plateau": all(abs(x["diff_1h"]) <= MARGIN["1h"] for x in c["neighbours"]),
                    "lag1": all(abs(c["lag1"][hn]) <= MARGIN[hn] for hn in HZ),
                    "years": bool(sum(all(abs(c["years"][y][hn]) <= MARGIN[hn] for hn in HZ) for y in YEARS) >= 3)}
            if all(gate.values()):
                v = "validated"
            elif any(hz[hn]["ci_wholly_outside"] for hn in HZ):
                v = "null"
            elif gate["holm"]:
                v = "context"
            else:
                v = "underpowered"
            out_cells.append({"name": "EQ", "n": res["sessions_complete"], "horizons": hz, "p": r(p), "p_holm": r(ph), "gate": gate, "verdict": v,
                              "lag1": {k: r(x, 5) for k, x in c["lag1"].items()},
                              "years": {y: {k: r(x, 5) for k, x in d.items()} for y, d in c["years"].items()},
                              "neighbours_outside": [x for x in c["neighbours"] if abs(x["diff_1h"]) > MARGIN["1h"]],
                              "est": r(c["1h"]["est"], 5), "lo": hz["1h"]["lo"], "hi": hz["1h"]["hi"], "mde": hz["1h"]["min_margin_tost"]})
    rej = bh([d["p"] for d in dis])
    for d, f in zip(dis, rej):
        d["bh"] = bool(f)
    res["disaggregation"] = {"cells": dis, "bh_pass": int(rej.sum()), "chance": chance_baseline(len(dis), int(sum(d["p"] < 0.05 for d in dis)))}

    def clean(o):
        if isinstance(o, dict):
            return {k: clean(v) for k, v in o.items() if k not in ("reps", "rd", "ro", "ra")}
        if isinstance(o, (list, tuple)):
            return [clean(v) for v in o]
        if isinstance(o, np.bool_):
            return bool(o)
        if isinstance(o, np.integer):
            return int(o)
        if isinstance(o, (np.floating, float)):
            return r(float(o), 5)
        return o
    res["cells_detail"] = clean(cells)
    res["scored"] = clean(out_cells)
    res["ranAt"] = pd.Timestamp.now(tz="UTC").strftime("%Y-%m-%dT%H:%M:%SZ")
    (out / "confirm").mkdir(parents=True, exist_ok=True)
    (out / "confirm" / "full.json").write_text(json.dumps(clean(res), indent=1), encoding="utf-8")
    slim = {"id": res["id"], "verdict": "split", "ranAt": res["ranAt"], "seed": SEED, "B": B,
            "prereg": "forge/VOL_LAYER_FEATURES_CONFIRM_PREREG.md", "branch": "main", "window": list(win),
            "sessions_complete": res["sessions_complete"],
            "cells": [{"name": f"vol-layer-features-confirm-{c['name'].lower()}", **{k: c[k] for k in ("n", "est", "lo", "hi", "mde", "p", "p_holm", "verdict", "gate")}}
                      for c in res["scored"]]}
    (out / "results.json").write_text(json.dumps(clean(slim), indent=1), encoding="utf-8")
    print("SCORED", json.dumps(clean(res["scored"]))[:5000], f"{time.time() - t0:.0f}s", flush=True)
    return res


if __name__ == "__main__":
    stage = sys.argv[1] if len(sys.argv) > 1 else "step0"
    if stage == "step0":
        step0()
    elif stage == "confirm":
        confirm()
    elif stage == "smoke":      # code check on the DISCOVERY window only (2016-22); never touches 2023+
        confirm(win=("2017-01-02", DISC[1]), warm=40, out=OUT / "smoke_discovery", years=["2019", "2020", "2021", "2022"])
