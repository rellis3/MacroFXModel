"""Vol-Layer deep dive, layer 3 (features), stage 3 "go wide": how the dollar / own split acts across conditions.

Reuses the stage 2 grid (analysis/output/vol-layer-deep/features/grids.npz, built by features.py): a 1-minute bid/ask
mid grid (London 00:00-22:00) of the 7 USD majors, each signed so + = USD stronger, a LEAVE-OWN-OUT dollar factor
(mean of the other six) and a point-in-time beta (prior 20 sessions only).

Sweeps:
  1. dollar share of 5-minute variance by pair x London time bucket x regime x sigma tercile x year;
  2. THE MARKET QUESTION: after a big 15-minute move, does a dollar-led move behave differently from an own-led one?
     follow-through at 15m / 1h / 4h / rest of session (gross on mid, net of the bid/ask round trip), stop-through
     beyond s x sigma and first-touch R on the M1 bid/ask CLOSE path (buys at the offer, sells at the bid);
  3. correlation vs vol by regime and vol decile with the Forbes-Rigobon CORRECTION rho/sqrt(1+delta(1-rho^2));
  4. a rolling 63-session absorption ratio (top-1, top-2 PC share of the 7x7 correlation) vs a shuffled benchmark;
  5. joint-worst-day counts, dollar part vs each pair's own part, vs 2,000 shuffled re-pairings.
Plus the Lesson 01 checks: every input one session later (+1 lag) and a neighbouring-settings plateau sweep.

Regime (C.OG Lesson 05): turbulent = rolling 63-session FX vol above 1.25 x its rolling (252-session) median, past
data only, for 21+ consecutive sessions; otherwise calm. FX vol = sqrt of the 7-major mean of the session rv5 from
analysis/output/forecast_history (inputs before 2016-10-24 are used only to warm the rolling windows). Regime cells are
bootstrapped by resampling whole regime EPISODES (stratified calm / turbulent); everything else uses the date-block
bootstrap of scripts/forecast_history/line_reaction.Boot (stationary, block 20, 2,000 reps).

Instrument classes: only the 7 USD majors. Crosses are exact combinations of the majors (stage 2 trap: R2 0.99 vs their
own legs), so a cross has no "own vs dollar" split of its own; gold and indices vs the dollar were covered in stage 2.
Next session / 5 sessions horizons are skipped: the split is an intraday construction and stage 2 found the daily share
persistent, which section 1's year / regime cells already describe.

DISCOVERY WINDOW ONLY (2016-10-24 .. 2022-12-30). Seed 20261112.
    python -X utf8 scripts/vol-layer-deep/features_wide.py      -> backtest-data/vol-layer/features-wide.json
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts/forecast_history")]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import line_reaction as LR  # noqa: E402

START, END = "2016-10-24", "2022-12-30"
SEED = 20261112
NM = 22 * 60
SRC = ROOT / "analysis/output/vol-layer-deep/features"
OUT = SRC / "wide"
HIST = ROOT / "analysis/output/forecast_history"
WEB = ROOT / "backtest-data/vol-layer"
MAJ = ["EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF", "USDJPY"]
SIGN = {"EURUSD": -1, "GBPUSD": -1, "AUDUSD": -1, "NZDUSD": -1, "USDCAD": 1, "USDCHF": 1, "USDJPY": 1}
BETA_WIN = 20
TOD = [("Asia 00-07", 0, 420), ("London open 07-10", 420, 600), ("London mid 10-13", 600, 780),
       ("Overlap 13-16", 780, 960), ("NY afternoon 16-22", 960, NM)]
YEARS = [str(y) for y in range(2017, 2023)]
HZ = [("15m", 15), ("1h", 60), ("4h", 240), ("rest", None)]
STOPS = [0.10, 0.15, 0.25, 0.40, 0.60]
MAIN = {"h": 15, "pct": 90, "cut": 0.7}
TRADE_WIN = 240


def r4(x, k=4):
    return None if x is None or not np.isfinite(x) else round(float(x), k)


def tod_of(t):
    t = np.asarray(t)
    out = np.full(t.shape, -1)
    for k, (_, a, b) in enumerate(TOD):
        out[(t >= a) & (t < b)] = k
    return out


# ------------------------------------------------------------------------------------------------ bootstrap helpers
class Reps:
    """Weighted-unit bootstrap: W is [B, n_units]; unit[i] says which unit (session or regime episode) obs i is in."""

    def __init__(self, W):
        self.W = W

    def mean(self, unit, x, den=None):
        n = self.W.shape[1]
        x = np.asarray(x, float)
        den = np.ones(len(x)) if den is None else np.asarray(den, float)
        m = np.isfinite(x) & np.isfinite(den) & (unit >= 0)
        a = np.bincount(unit[m], weights=x[m], minlength=n)
        b = np.bincount(unit[m], weights=den[m], minlength=n)
        if b.sum() <= 0:
            return np.nan, np.full(self.W.shape[0], np.nan), 0
        with np.errstate(invalid="ignore", divide="ignore"):
            reps = (self.W @ a) / (self.W @ b)
        return a.sum() / b.sum(), reps, int(m.sum())


def ci(point, reps):
    r = reps[np.isfinite(reps)]
    if not len(r):
        return [r4(point), None, None]
    lo, hi = np.percentile(r, [2.5, 97.5])
    return [r4(point), r4(lo), r4(hi)]


def pval(reps):
    return LR._p_from_reps(np.asarray(reps, float))


class Cells:
    """Every tested cell, for Benjamini-Hochberg across the whole sweep."""

    def __init__(self):
        self.rows = []

    def add(self, family, label, point, reps, p=None, n=None, extra=None):
        p = pval(reps) if p is None else p
        self.rows.append({"family": family, "cell": label, "est": ci(point, reps) if reps is not None else [r4(point)], "p": p, "n": n,
                          **(extra or {})})
        return self.rows[-1]

    def bh(self, q=0.10):
        ps = np.array([r["p"] for r in self.rows])
        m = len(ps)
        o = np.argsort(ps)
        thr = q * np.arange(1, m + 1) / m
        ok = ps[o] <= thr
        k = int(np.max(np.nonzero(ok)[0]) + 1) if ok.any() else 0
        passed = np.zeros(m, bool)
        passed[o[:k]] = True
        for r, f in zip(self.rows, passed):
            r["bh"] = bool(f)
        return m, k


# ------------------------------------------------------------------------------------------------ data
def load_grid():
    z = np.load(SRC / "grids.npz", allow_pickle=False)
    days = z["days"]
    assert max(days.tolist()) <= END and min(days.tolist()) >= START
    L = z["L"][: len(MAJ)]                       # majors are the first 7 rows (features.py ALL = MAJ + OTHER)
    HS = z["HS"]
    RAW = z["RAW"][: len(MAJ)]
    return days, L, HS, RAW


def sigma(sym, days):
    s = pd.read_csv(HIST / f"{sym}.csv", usecols=["date", "live_sig_used"]).set_index("date").live_sig_used / 100
    return s.reindex(days).to_numpy(float)


def regime(days):
    """C.OG Lesson 05 regime on FX vol (7-major mean rv5), past data only. Returns label (1 turb, 0 calm, -1 unknown),
    episode id per day, and the v63 series."""
    rv = []
    for s in MAJ:
        d = pd.read_csv(HIST / f"{s}.csv", usecols=["date", "rv5"])
        d = d[d.date <= END]
        rv.append(d.set_index("date").rv5)
    rv = pd.concat(rv, axis=1).sort_index()
    assert rv.index.max() <= END
    fx = rv.mean(1)
    v63 = np.sqrt(fx.rolling(63, min_periods=63).mean()).shift(1)            # known at the open
    med = v63.rolling(252, min_periods=63).median()
    flag = (v63 > 1.25 * med).astype(float).where(med.notna())
    run = flag.groupby((flag != flag.shift()).cumsum()).cumcount() + 1
    turb = ((flag == 1) & (run >= 21)).astype(int).where(flag.notna(), -1)
    lab = turb.reindex(days).fillna(-1).astype(int).to_numpy()
    ep = np.full(len(days), -1)
    eid, prev = -1, None
    for k, v in enumerate(lab):
        if v < 0:
            prev = None
            continue
        if v != prev:
            eid += 1
            prev = v
        ep[k] = eid
    return lab, ep, v63.reindex(days).to_numpy(float)


def episode_W(lab, ep, B=2000, seed=SEED):
    n = ep.max() + 1
    typ = np.array([lab[ep == e][0] for e in range(n)])
    rng = np.random.default_rng(seed)
    W = np.zeros((B, n))
    T, C = np.flatnonzero(typ == 1), np.flatnonzero(typ == 0)
    for b in range(B):
        W[b] += np.bincount(rng.choice(T, len(T)), minlength=n) if len(T) else 0
        W[b] += np.bincount(rng.choice(C, len(C)), minlength=n)
    return W, typ


def pit_beta(sxy, sxx, lag=0, win=BETA_WIN):
    a = pd.Series(sxy).rolling(win, min_periods=win // 2).sum().shift(1 + lag)
    b = pd.Series(sxx).rolling(win, min_periods=win // 2).sum().shift(1 + lag)
    return (a / b).to_numpy()


# ------------------------------------------------------------------------------------------------ build
def main():
    t0 = time.time()
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    days, L, HS, RAW = load_grid()
    nD = len(days)
    good = (RAW >= 900).all(0)
    years = np.array([d[:4] for d in days])
    U = np.stack([SIGN[s] * L[k] for k, s in enumerate(MAJ)]).astype(np.float64)
    U[:, ~good] = np.nan
    tot, cnt = np.nansum(U, 0), np.isfinite(U).sum(0)
    D = np.stack([(tot - np.nan_to_num(U[i])) / (cnt - np.isfinite(U[i])) for i in range(len(MAJ))])
    D[:, ~good] = np.nan
    del tot, cnt
    SIG = np.stack([sigma(s, days) for s in MAJ])
    SIGL = np.full_like(SIG, np.nan)
    SIGL[:, 1:] = SIG[:, :-1]                                       # +1 lag: yesterday's sigma
    lab, ep, v63 = regime(days)
    Wep, eptyp = episode_W(lab, ep)
    bs = LR.Boot(days)                                                # date-block weights over every window session
    assert list(bs.dates) == list(days)
    RD, RE = Reps(bs.W), Reps(Wep)
    dayi = np.arange(nD)
    cells = Cells()
    res = {"window": [START, END], "seed": SEED, "sessions": int(good.sum())}
    res["regime"] = {"turb_days": int((lab == 1).sum()), "calm_days": int((lab == 0).sum()), "unknown_days": int((lab < 0).sum()),
                     "turb_episodes": int((eptyp == 1).sum()), "calm_episodes": int((eptyp == 0).sum()),
                     "turb_spans": [[str(days[ep == e][0]), str(days[ep == e][-1])] for e in range(len(eptyp)) if eptyp[e] == 1]}
    print("regime", {k: v for k, v in res["regime"].items() if k != "turb_spans"}, res["regime"]["turb_spans"], flush=True)

    # ---------------- 1. dollar share by pair x TOD x regime x tercile x year (5-minute returns)
    t5 = np.arange(5, NM, 5)
    x5 = U[..., t5] - U[..., t5 - 5]
    d5 = D[..., t5] - D[..., t5 - 5]
    bk5 = tod_of(t5 - 5)
    perm = rng.permutation(nD)
    BETA, BETAL = np.full((7, nD), np.nan), np.full((7, nD), np.nan)
    share = {}
    for i, s in enumerate(MAJ):
        m = np.isfinite(x5[i]) & np.isfinite(d5[i])
        xx, dd = np.where(m, x5[i], 0), np.where(m, d5[i], 0)
        sxy, sxx, syy = (xx * dd).sum(1), (dd * dd).sum(1), (xx * xx).sum(1)
        BETA[i], BETAL[i] = pit_beta(sxy, sxx), pit_beta(sxy, sxx, lag=1)
        ms = np.isfinite(x5[i]) & np.isfinite(d5[i][perm])
        xs, ds = np.where(ms, x5[i], 0), np.where(ms, d5[i][perm], 0)
        per_b = {}
        for kb in range(5):
            sel = bk5 == kb
            a, b_, c_ = (xx[:, sel] * dd[:, sel]).sum(1), (dd[:, sel] ** 2).sum(1), (xx[:, sel] ** 2).sum(1)
            as_, bs_, cs_ = (xs[:, sel] * ds[:, sel]).sum(1), (ds[:, sel] ** 2).sum(1), (xs[:, sel] ** 2).sum(1)
            per_b[kb] = (a, b_, c_, as_, bs_, cs_)
        out = {}
        for lagname, B_ in (("base", BETA[i]), ("lag1", BETAL[i])):
            ok = good & np.isfinite(B_) & (syy > 0)
            num = np.where(ok, 2 * B_ * sxy - B_ ** 2 * sxx, np.nan)
            den = np.where(ok, syy, np.nan)
            pt, rp, n = RD.mean(dayi, num, den)
            out[lagname] = (pt, rp)
            if lagname == "lag1":
                break
            share[s] = {"pooled": ci(pt, rp), "n_days": n}
            # wrong-day factor (benchmark): beta applied to another session's dollar path
            sxy_s, sxx_s, syy_s = (xs * ds).sum(1), (ds ** 2).sum(1), (xs ** 2).sum(1)
            oks = ok & (syy_s > 0)
            share[s]["wrong_day"] = r4(np.nansum((2 * B_ * sxy_s - B_ ** 2 * sxx_s)[oks]) / np.nansum(syy_s[oks]))
            # time of day
            share[s]["tod"] = {}
            for kb in range(5):
                a, b_, c_, as_, bs_, cs_ = per_b[kb]
                okb = ok & (c_ > 0)
                p2, r2, _ = RD.mean(dayi, np.where(okb, 2 * B_ * a - B_ ** 2 * b_, np.nan), np.where(okb, c_, np.nan))
                okw = okb & (cs_ > 0)
                wd = np.nansum((2 * B_ * as_ - B_ ** 2 * bs_)[okw]) / np.nansum(cs_[okw])
                share[s]["tod"][TOD[kb][0]] = ci(p2, r2) + [r4(wd)]
                cells.add("share_tod_vs_pooled", f"{s} {TOD[kb][0]}", p2 - pt, r2 - rp)
            # years
            share[s]["years"] = {}
            for y in YEARS:
                my = ok & (years == y)
                p2, r2, _ = RD.mean(dayi, np.where(my, num, np.nan), np.where(my, den, np.nan))
                share[s]["years"][y] = ci(p2, r2)
                cells.add("share_year_vs_pooled", f"{s} {y}", p2 - pt, r2 - rp)
            # sigma terciles (of the sigma known at the open, cut over the window)
            q = np.nanpercentile(SIG[i][ok], [100 / 3, 200 / 3])
            ter = np.digitize(SIG[i], q)
            share[s]["terciles"] = {}
            tr = {}
            for k, nm in enumerate(["low", "mid", "high"]):
                mt = ok & (ter == k) & np.isfinite(SIG[i])
                p2, r2, _ = RD.mean(dayi, np.where(mt, num, np.nan), np.where(mt, den, np.nan))
                share[s]["terciles"][nm] = ci(p2, r2)
                tr[nm] = (p2, r2)
            cells.add("share_sigma_high_minus_low", s, tr["high"][0] - tr["low"][0], tr["high"][1] - tr["low"][1])
            # regime (episode bootstrap)
            rg = {}
            for k, nm in ((0, "calm"), (1, "turbulent")):
                mr = ok & (lab == k)
                p2, r2, _ = RE.mean(np.where(mr, ep, -1), np.where(mr, num, np.nan), np.where(mr, den, np.nan))
                rg[nm] = (p2, r2)
                share[s][nm] = ci(p2, r2)
            cells.add("share_turb_minus_calm", s, rg["turbulent"][0] - rg["calm"][0], rg["turbulent"][1] - rg["calm"][1])
        share[s]["lag1"] = ci(*out["lag1"])
        cells.add("lag1_share_change", s, out["lag1"][0] - out["base"][0], out["lag1"][1] - out["base"][1])
        print("share", s, share[s]["pooled"], "tod", {k: v[0] for k, v in share[s]["tod"].items()}, f"{time.time() - t0:.0f}s", flush=True)
    res["share"] = share

    # ---------------- 3. correlation vs vol, Forbes-Rigobon correction, by regime / decile; 4. absorption ratio
    allok = np.isfinite(x5).all(0) & good[:, None]
    x0 = np.where(allok[None], x5, 0.0)
    nb = allok.sum(1).astype(float)
    C = np.einsum("idk,jdk->dij", x0, x0)
    act = np.einsum("dii->d", C) / 7 / np.maximum(nb, 1)
    act[~good | (nb < 200)] = np.nan
    okc = np.isfinite(act)
    Cf = np.where(okc[:, None, None], C, 0).reshape(nD, 49)
    nbf = np.where(okc, nb, 0)
    iu = np.triu_indices(7, 1)

    def corr_stats(Cs, ns, Cc, nc):
        """Cs, Cc: [..., 49] summed second moments for the condition and the calm baseline. Returns observed mean corr,
        FR-corrected mean corr, calm mean corr, FR forward prediction (pure heteroskedasticity)."""
        S = (Cs / ns[..., None]).reshape(*Cs.shape[:-1], 7, 7)
        Sc = (Cc / nc[..., None]).reshape(*Cc.shape[:-1], 7, 7)
        dg, dc = np.diagonal(S, axis1=-2, axis2=-1), np.diagonal(Sc, axis1=-2, axis2=-1)
        R = S / np.sqrt(dg[..., :, None] * dg[..., None, :])
        Rc = Sc / np.sqrt(dc[..., :, None] * dc[..., None, :])
        ratio = dg / dc
        delta = (ratio[..., :, None] + ratio[..., None, :]) / 2 - 1
        rho, rc, de = R[..., iu[0], iu[1]], Rc[..., iu[0], iu[1]], delta[..., iu[0], iu[1]]
        corr = rho / np.sqrt(1 + de * (1 - rho ** 2))
        fwd = rc * np.sqrt(1 + de) / np.sqrt(1 + de * rc ** 2)
        return rho.mean(-1), corr.mean(-1), rc.mean(-1), fwd.mean(-1), de.mean(-1)

    def sums(W, unit, mask):
        n = W.shape[1]
        a = np.stack([np.bincount(unit[mask], weights=Cf[mask, j], minlength=n) for j in range(49)], 1)
        b = np.bincount(unit[mask], weights=nbf[mask], minlength=n)
        return a, b

    corr = {}
    # regimes, episode bootstrap
    mT, mC = okc & (lab == 1), okc & (lab == 0)
    aT, bT = sums(Wep, ep, mT)
    aC, bC = sums(Wep, ep, mC)
    pt = corr_stats(aT.sum(0), np.array(bT.sum()), aC.sum(0), np.array(bC.sum()))
    rp = corr_stats(Wep @ aT, Wep @ bT, Wep @ aC, Wep @ bC)
    corr["regime"] = {"calm": r4(pt[2]), "turb_observed": ci(pt[0], rp[0]), "turb_fr_corrected": ci(pt[1], rp[1]), "turb_fr_forward": r4(pt[3]),
                      "delta": r4(pt[4])}
    cells.add("corr_turb_minus_calm_observed", "7 majors", pt[0] - pt[2], rp[0] - rp[2])
    cells.add("corr_turb_minus_calm_fr_corrected", "7 majors", pt[1] - pt[2], rp[1] - rp[2])
    # by year: each year's turbulent vs the window calm (date block) and calm-in-year
    corr["years"] = {}
    for y in YEARS:
        my = okc & (years == y)
        a1, b1 = sums(bs.W, dayi, my)
        a0, b0 = sums(bs.W, dayi, mC)
        p1 = corr_stats(a1.sum(0), np.array(b1.sum()), a0.sum(0), np.array(b0.sum()))
        corr["years"][y] = {"observed": r4(p1[0]), "fr_corrected": r4(p1[1]), "calm": r4(p1[2]), "delta": r4(p1[4]),
                            "turb_days": int(((lab == 1) & (years == y)).sum())}
    # same-day vol deciles within year, baseline = calmest decile
    dec = np.full(nD, -1)
    for y in sorted(set(years)):
        m = (years == y) & okc
        if m.sum() > 20:
            dec[m] = pd.qcut(act[m], 10, labels=False, duplicates="drop")
    prev = pd.Series(act).shift(1).to_numpy()
    decp = np.full(nD, -1)
    for y in sorted(set(years)):
        m = (years == y) & okc & np.isfinite(prev)
        if m.sum() > 20:
            decp[m] = pd.qcut(prev[m], 10, labels=False, duplicates="drop")
    corr["deciles"], corr["deciles_prev"] = [], []
    for dd_, kname, nm in ((dec, "deciles", "same"), (decp, "deciles_prev", "prev")):
        a0, b0 = sums(bs.W, dayi, okc & (dd_ == 0))
        for q in range(10):
            a1, b1 = sums(bs.W, dayi, okc & (dd_ == q))
            p1 = corr_stats(a1.sum(0), np.array(b1.sum()), a0.sum(0), np.array(b0.sum()))
            r1 = corr_stats(bs.W @ a1, bs.W @ b1, bs.W @ a0, bs.W @ b0)
            corr[kname].append(
                {"decile": q + 1, "observed": ci(p1[0], r1[0]), "fr_corrected": ci(p1[1], r1[1]), "calm": r4(p1[2]), "fr_forward": r4(p1[3]), "delta": r4(p1[4])})
            if q > 0:
                cells.add(f"corr_decile_fr_corrected_minus_calm_{nm}", f"decile {q + 1}", p1[1] - p1[2], r1[1] - r1[2])
    res["corr"] = corr
    print("corr regime", corr["regime"], f"{time.time() - t0:.0f}s", flush=True)
    print("corr deciles", [(r["decile"], r["observed"][0], r["fr_corrected"][0], r["fr_forward"]) for r in corr["deciles"]], flush=True)

    # absorption ratio, rolling 63 good sessions (each window ends at the session itself: a description, not a signal)
    gi = np.flatnonzero(okc)
    Cg = C[gi]
    cs = np.cumsum(Cg, 0)
    gperm = [np.arange(len(gi))] + [rng.permutation(len(gi)) for _ in range(6)]
    Xg = x0[:, gi]
    Xs = np.stack([Xg[i][gperm[i]] for i in range(7)])
    Cs_ = np.einsum("idk,jdk->dij", Xs, Xs)
    css = np.cumsum(Cs_, 0)
    ar = []
    for k in range(62, len(gi), 1):
        S = cs[k] - (cs[k - 63] if k >= 63 else 0)
        Ss = css[k] - (css[k - 63] if k >= 63 else 0)
        out = []
        for M in (S, Ss):
            v = np.sqrt(np.diag(M))
            ev = np.sort(np.linalg.eigvalsh(M / np.outer(v, v)))[::-1] / 7
            out += [ev[0], ev[0] + ev[1]]
        ar.append((days[gi[k]], *out, lab[gi[k]]))
    AR = pd.DataFrame(ar, columns=["date", "top1", "top2", "top1_sh", "top2_sh", "lab"])
    AR.to_csv(OUT / "absorption.csv", index=False)
    arT = AR[AR.lab == 1].top1.mean()
    arC = AR[AR.lab == 0].top1.mean()
    # episode bootstrap of turbulent-minus-calm mean AR
    di_ar = pd.Index(days).get_indexer(AR.date)
    pT, rT, _ = RE.mean(np.where(AR.lab.to_numpy() == 1, ep[di_ar], -1), AR.top1.to_numpy())
    pC, rC, _ = RE.mean(np.where(AR.lab.to_numpy() == 0, ep[di_ar], -1), AR.top1.to_numpy())
    cells.add("absorption_top1_turb_minus_calm", "7 majors", pT - pC, rT - rC)
    res["absorption"] = {"top1_mean": r4(AR.top1.mean()), "top2_mean": r4(AR.top2.mean()), "top1_shuffled": r4(AR.top1_sh.mean()),
                         "top2_shuffled": r4(AR.top2_sh.mean()), "top1_turb": r4(arT), "top1_calm": r4(arC),
                         "top1_min": [str(AR.date[AR.top1.idxmin()]), r4(AR.top1.min())], "top1_max": [str(AR.date[AR.top1.idxmax()]), r4(AR.top1.max())],
                         "corr_with_v63": r4(np.corrcoef(AR.top1, v63[di_ar])[0, 1]) if np.isfinite(v63[di_ar]).all() else
                         r4(pd.Series(AR.top1.to_numpy()).corr(pd.Series(v63[di_ar])))}
    print("absorption", res["absorption"], f"{time.time() - t0:.0f}s", flush=True)
    del x5, d5, x0, C, Cg, cs, Xs, Xg, Cs_, css

    # ---------------- 2. THE MARKET QUESTION: dollar-led vs own-led big moves
    def events(h, beta, sig, lag=0, pcts=(80, 90, 95)):
        rows = []
        tt = np.arange(h, NM - 2, h)                               # formation [t-h, t]; entry at t+1 (one minute late)
        for i, s in enumerate(MAJ):
            x = U[i][:, tt] - U[i][:, tt - h]
            dd = D[i][:, tt] - D[i][:, tt - h]
            c = beta[i][:, None] * dd
            e = x - c
            z = x / sig[i][:, None]
            az = np.abs(z)
            ok = np.isfinite(az) & good[:, None]
            thr = {}
            for p in pcts:
                with np.errstate(all="ignore"):
                    dp = np.nanpercentile(np.where(ok, az, np.nan), p, axis=1)
                thr[p] = pd.Series(dp).rolling(60, min_periods=20).mean().shift(1 + lag).to_numpy()
            ev = ok & (az >= thr[min(pcts)][:, None])
            dI, kI = np.nonzero(ev)
            t = tt[kI]
            sg = np.sign(x[dI, kI])
            cc, ee = c[dI, kI], e[dI, kI]
            sh = cc ** 2 / (cc ** 2 + ee ** 2)
            sgi = sig[i][dI]
            ent = U[i][dI, t + 1]
            hs = HS[i].astype(np.float64)
            rec = {"pair": np.full(len(dI), i), "d": dI, "t": t, "z": az[dI, kI], "sh": sh, "csame": np.sign(cc) == sg, "sg": sg}
            for p in pcts:
                rec[f"p{p}"] = az[dI, kI] >= thr[p][dI]
            for nm, H in HZ:
                ex = np.full(len(dI), NM - 1) if H is None else t + 1 + H
                okx = ex <= NM - 1
                exc = np.minimum(ex, NM - 1)
                f = sg * (U[i][dI, exc] - ent) / sgi
                cost = (hs[dI, t + 1] + hs[dI, exc]) / sgi
                rec[f"f_{nm}"] = np.where(okx, f, np.nan)
                rec[f"c_{nm}"] = np.where(okx, cost, np.nan)
            rows.append(pd.DataFrame(rec))
        return pd.concat(rows, ignore_index=True)

    def groups(E, pct, cut):
        b = E[f"p{pct}"].to_numpy() & np.isfinite(E.sh.to_numpy())
        dol = b & (E.sh.to_numpy() >= cut) & E.csame.to_numpy()
        own = b & (E.sh.to_numpy() <= 1 - cut)
        return b, dol, own

    def compare(E, mask, dol, own, col, R=RD, unit=None):
        u = (E.d.to_numpy() if unit is None else unit)
        x = E[col].to_numpy()
        pd_, rd, nd = R.mean(np.where(mask & dol, u, -1), x)
        po, ro, no = R.mean(np.where(mask & own, u, -1), x)
        return (pd_, rd, nd), (po, ro, no)

    t1 = time.time()
    E = events(MAIN["h"], BETA, SIG)
    E.to_parquet(OUT / "events_h15.parquet", index=False)
    big, dol, own = groups(E, MAIN["pct"], MAIN["cut"])
    yrs_e = years[E.d.to_numpy()]
    tod_e = tod_of(E.t.to_numpy())
    lab_e = lab[E.d.to_numpy()]
    ep_e = ep[E.d.to_numpy()]
    sig_e = SIG[E.pair.to_numpy(), E.d.to_numpy()]
    terc = np.full(len(E), -1)
    for i in range(7):
        q = np.nanpercentile(SIG[i][good], [100 / 3, 200 / 3])
        m = E.pair.to_numpy() == i
        terc[m] = np.digitize(sig_e[m], q)
    print("events", len(E), "big", int(big.sum()), "dollar-led", int(dol.sum()), "own-led", int(own.sum()), f"{time.time() - t1:.0f}s", flush=True)

    slices = [("All 7 majors", np.ones(len(E), bool), "date")]
    slices += [(s, E.pair.to_numpy() == i, "date") for i, s in enumerate(MAJ)]
    slices += [(TOD[k][0], tod_e == k, "date") for k in range(5)]
    slices += [("Calm regime", lab_e == 0, "ep"), ("Turbulent regime", lab_e == 1, "ep")]
    slices += [(f"σ {nm} third", terc == k, "date") for k, nm in enumerate(["low", "mid", "high"])]
    slices += [(y, yrs_e == y, "date") for y in YEARS]
    key = {}
    for nm_s, m, bt in slices:
        R, unit = (RE, np.where(m, ep_e, -1)) if bt == "ep" else (RD, None)
        cell = {"n_dollar": int((m & dol).sum()), "n_own": int((m & own).sum())}
        for hn, _ in HZ:
            (pd_, rd, nd), (po, ro, no) = compare(E, m, dol, own, f"f_{hn}", R, unit)
            pall, rall, _ = R.mean(np.where(m & big, E.d.to_numpy() if unit is None else unit, -1), E[f"f_{hn}"].to_numpy())
            pc, _, _ = R.mean(np.where(m & big, E.d.to_numpy() if unit is None else unit, -1), E[f"c_{hn}"].to_numpy())
            cell[hn] = {"dollar": ci(pd_, rd), "own": ci(po, ro), "all_big": ci(pall, rall), "diff": ci(pd_ - po, rd - ro), "cost": r4(pc)}
            cells.add("follow_dollar_led", f"{nm_s} {hn}", pd_, rd, n=nd)
            cells.add("follow_own_led", f"{nm_s} {hn}", po, ro, n=no)
            cells.add("follow_dollar_minus_own", f"{nm_s} {hn}", pd_ - po, rd - ro)
        key[nm_s] = cell
    res["key"] = key
    print("key pooled", {h: key["All 7 majors"][h] for h, _ in HZ}, flush=True)

    # paths on the bid/ask close path: stop-through beyond s sigma and first-touch R, 4h window (cut at 22:00)
    pathrec = []
    Eb = E[big].reset_index()
    for i, s in enumerate(MAJ):
        sub = Eb[Eb.pair == i]
        if not len(sub):
            continue
        P = np.pad(L[i].astype(np.float64), ((0, 0), (0, TRADE_WIN + 1)), constant_values=np.nan)
        H_ = np.pad(HS[i].astype(np.float64), ((0, 0), (0, TRADE_WIN + 1)), constant_values=np.nan)
        P[~good] = np.nan
        d_ = sub.d.to_numpy()
        cols = sub.t.to_numpy()[:, None] + 1 + np.arange(TRADE_WIN + 1)[None]
        Pw, Hw = P[d_[:, None], cols], H_[d_[:, None], cols]
        sgi = SIG[i][d_][:, None]
        k = (sub.sg.to_numpy() * SIGN[s])[:, None]                       # pair-space direction of the move
        gross = k * (Pw - Pw[:, :1]) / sgi                               # follow, on mid
        cst = (Hw + Hw[:, :1]) / sgi
        net_f = gross - cst                                              # follow: bought at the offer, sold at the bid
        net_x = -gross - cst                                             # fade
        rec = {"idx": sub["index"].to_numpy()}
        for sv in STOPS:
            rec[f"st_fade_{sv}"] = (np.nanmin(np.where(np.isfinite(net_x), net_x, np.inf), 1) <= -sv).astype(float)
            rec[f"st_follow_{sv}"] = (np.nanmin(np.where(np.isfinite(net_f), net_f, np.inf), 1) <= -sv).astype(float)
            for nm, ser in (("Rg_follow", gross), ("Rn_follow", net_f), ("Rn_fade", net_x)):
                hit = (ser >= sv) | (ser <= -sv)
                first = np.where(hit.any(1), hit.argmax(1), -1)
                last = np.isfinite(ser).sum(1) - 1
                lastv = ser[np.arange(len(ser)), np.maximum(last, 0)]
                rr = np.where(first >= 0, np.sign(ser[np.arange(len(ser)), np.maximum(first, 0)]), lastv / sv)
                rec[f"{nm}_{sv}"] = np.where(last >= 0, rr, np.nan)
        pathrec.append(pd.DataFrame(rec))
    PR = pd.concat(pathrec).set_index("idx").sort_index()
    for c in PR.columns:
        E.loc[PR.index, c] = PR[c].to_numpy()
    # random-boundary benchmark: random 15-min boundaries (any size), random side, same path rules
    rb = []
    for i, s in enumerate(MAJ):
        P = np.pad(L[i].astype(np.float64), ((0, 0), (0, TRADE_WIN + 1)), constant_values=np.nan)
        H_ = np.pad(HS[i].astype(np.float64), ((0, 0), (0, TRADE_WIN + 1)), constant_values=np.nan)
        gd = np.flatnonzero(good & np.isfinite(SIG[i]))
        d_ = rng.choice(gd, 4000)
        t_ = rng.choice(np.arange(15, NM - 2, 15), 4000)
        cols = t_[:, None] + 1 + np.arange(TRADE_WIN + 1)[None]
        Pw, Hw = P[d_[:, None], cols], H_[d_[:, None], cols]
        k = rng.choice([-1.0, 1.0], 4000)[:, None]
        net = k * (Pw - Pw[:, :1]) / SIG[i][d_][:, None] - (Hw + Hw[:, :1]) / SIG[i][d_][:, None]
        mn = np.nanmin(np.where(np.isfinite(net), net, np.inf), 1)
        rb.append(pd.DataFrame({"d": d_, **{f"st_{sv}": (mn <= -sv).astype(float) for sv in STOPS}}))
    RB = pd.concat(rb, ignore_index=True)
    res["random_stop"] = {str(sv): ci(*RD.mean(RB.d.to_numpy(), RB[f"st_{sv}"].to_numpy())[:2]) for sv in STOPS}
    stop = {}
    for sv in STOPS:
        row = {}
        for nm, g in (("dollar", dol), ("own", own), ("all_big", big)):
            for col in (f"st_fade_{sv}", f"st_follow_{sv}", f"Rg_follow_{sv}", f"Rn_follow_{sv}", f"Rn_fade_{sv}"):
                p_, r_, n_ = RD.mean(np.where(g, E.d.to_numpy(), -1), E[col].to_numpy())
                row[f"{nm}|{col.rsplit('_', 1)[0]}"] = ci(p_, r_)
        stop[str(sv)] = row
    res["stop"] = stop
    # stop-through difference and net R cells by slice at the 0.25 sigma stop
    sv = 0.25
    st_sl = {}
    for nm_s, m, bt in slices:
        R, unit = (RE, np.where(m, ep_e, -1)) if bt == "ep" else (RD, None)
        (pd_, rd, _), (po, ro, _) = compare(E, m, dol, own, f"st_fade_{sv}", R, unit)
        cells.add("stopthrough_dollar_minus_own", nm_s, pd_ - po, rd - ro)
        out = {"st_dollar": ci(pd_, rd), "st_own": ci(po, ro), "st_diff": ci(pd_ - po, rd - ro)}
        for col in ("Rn_follow", "Rn_fade", "Rg_follow"):
            (pd_, rd, _), (po, ro, _) = compare(E, m, dol, own, f"{col}_{sv}", R, unit)
            out[f"{col}_dollar"], out[f"{col}_own"] = ci(pd_, rd), ci(po, ro)
            if col != "Rg_follow":
                cells.add(f"{col}_net_R", f"{nm_s} dollar-led", pd_, rd)
                cells.add(f"{col}_net_R", f"{nm_s} own-led", po, ro)
        st_sl[nm_s] = out
    res["stop_slices"] = st_sl
    print("stop pooled", st_sl["All 7 majors"], f"{time.time() - t0:.0f}s", flush=True)

    # concrete examples (follow trades, net R at 0.25 sigma), picked by seed
    ex = []
    erng = np.random.default_rng(SEED)
    for g, lbl in ((dol, "dollar-led"), (own, "own-led")):
        cand = np.flatnonzero(g & (E.z.to_numpy() >= np.nanpercentile(E.z[big], 97)) & np.isfinite(E[f"Rn_follow_{sv}"].to_numpy()))
        for j in erng.choice(cand, 3, replace=False):
            r = E.iloc[j]
            i, s = int(r.pair), MAJ[int(r.pair)]
            t = int(r.t)
            cols = np.arange(t + 1, min(t + 2 + TRADE_WIN, NM))
            P, H_ = L[i, int(r.d), cols].astype(np.float64), HS[i, int(r.d), cols].astype(np.float64)
            k = r.sg * SIGN[s]
            sg_ = SIG[i, int(r.d)]
            net = (k * (P - P[0]) - (H_ + H_[0])) / sg_ / sv
            hit = np.flatnonzero((net >= 1) | (net <= -1))
            end = hit[0] if len(hit) else len(net) - 1
            ex.append({"inst": s, "date": str(days[int(r.d)]) + f" {t // 60:02d}:{t % 60:02d} London",
                       "side": f"{'buy' if k > 0 else 'sell'} (follow a {lbl} {r.z:.2f}σ 15-min move, dollar share {r.sh:.0%})",
                       "r": r4(float(r[f'Rn_follow_{sv}']), 2), "unit": "R net", "stop": -1, "target": 1,
                       "path": [[int(m_), r4(float(net[m_]), 3)] for m_ in range(0, end + 1, max(1, (end + 1) // 40))] + [[int(end), r4(float(net[end]), 3)]]})
    res["examples"] = ex

    # ---------------- Lesson 01 checks: +1 lag (beta, sigma and threshold one session later) and the plateau sweep
    EL = events(MAIN["h"], BETAL, SIGL, lag=1, pcts=(MAIN["pct"],))
    bL, dL, oL = groups(EL, MAIN["pct"], MAIN["cut"])
    lagk = {}
    for hn, _ in HZ:
        (pd_, rd, _), (po, ro, _) = compare(EL, np.ones(len(EL), bool), dL, oL, f"f_{hn}")
        lagk[hn] = {"dollar": ci(pd_, rd), "own": ci(po, ro), "diff": ci(pd_ - po, rd - ro)}
        cells.add("lag1_follow_dollar_minus_own", hn, pd_ - po, rd - ro)
    res["lag1_key"] = lagk
    del EL
    plateau = []
    for h in (5, 15, 30):
        Eh = E if h == MAIN["h"] else events(h, BETA, SIG)
        for pct in (80, 90, 95):
            for cut in (0.6, 0.7, 0.8):
                b_, d_, o_ = groups(Eh, pct, cut)
                (pd_, rd, nd), (po, ro, no) = compare(Eh, np.ones(len(Eh), bool), d_, o_, "f_1h")
                plateau.append({"h": h, "pct": pct, "cut": cut, "dollar": ci(pd_, rd), "own": ci(po, ro), "diff": ci(pd_ - po, rd - ro),
                                "n_dollar": nd, "n_own": no})
                cells.add("plateau_1h_dollar_minus_own", f"h{h} p{pct} cut{cut}", pd_ - po, rd - ro)
        print("plateau h", h, [(p["pct"], p["cut"], p["diff"][0]) for p in plateau if p["h"] == h], f"{time.time() - t0:.0f}s", flush=True)
        if h != MAIN["h"]:
            del Eh
    res["plateau"] = plateau

    # ---------------- 5. joint worst days: dollar part vs own part of the day's move, vs shuffled re-pairings
    DR = pd.read_parquet(SRC / "days.parquet")
    assert DR.date.max() <= END
    jw = {}
    prng = np.random.default_rng(SEED)
    for s in MAJ:
        g = DR[DR.inst == s].dropna(subset=["common", "own"])
        c, e = g.common.to_numpy(), g.own.to_numpy()
        n = len(c)
        perms = np.stack([prng.permutation(n) for _ in range(2000)])
        jw[s] = {"n_days": n}
        for q in (0.01, 0.025, 0.05, 0.10):
            ca, ea = np.abs(c) >= np.quantile(np.abs(c), 1 - q), np.abs(e) >= np.quantile(np.abs(e), 1 - q)
            cu, eu = c >= np.quantile(c, 1 - q / 2), e >= np.quantile(e, 1 - q / 2)
            cd, ed = c <= np.quantile(c, q / 2), e <= np.quantile(e, q / 2)
            obs_a = int((ca & ea).sum())
            sh_a = (ca[None] & ea[perms]).sum(1)
            obs_s = int((cu & eu).sum() + (cd & ed).sum())
            sh_s = (cu[None] & eu[perms]).sum(1) + (cd[None] & ed[perms]).sum(1)
            obs_o = int((cu & ed).sum() + (cd & eu).sum())
            sh_o = (cu[None] & ed[perms]).sum(1) + (cd[None] & eu[perms]).sum(1)
            jw[s][str(q)] = {"abs": [obs_a, r4(sh_a.mean(), 2), r4(np.percentile(sh_a, 97.5), 1)],
                             "same_dir": [obs_s, r4(sh_s.mean(), 2), r4(np.percentile(sh_s, 97.5), 1)],
                             "opposite": [obs_o, r4(sh_o.mean(), 2), r4(np.percentile(sh_o, 97.5), 1)]}
            for nm, ob, shv in (("abs", obs_a, sh_a), ("same_dir", obs_s, sh_s)):
                p = min(1.0, 2 * min((shv >= ob).mean(), (shv <= ob).mean()))
                cells.add(f"jointworst_{nm}", f"{s} tail {q}", ob - shv.mean(), None, p=max(p, 1 / 2001), extra={"shuffled": r4(shv.mean(), 2)})
    res["joint_worst"] = jw
    print("joint worst 5%", {s: jw[s]["0.05"] for s in MAJ}, flush=True)

    # only 2 turbulent episodes in the window: an episode bootstrap of 2 units cannot test anything, so every cell that
    # leans on the turbulent regime is set to p = 1 (shown, never counted as a pass)
    if res["regime"]["turb_episodes"] < 5:
        for r in cells.rows:
            if r["family"] in ("share_turb_minus_calm", "corr_turb_minus_calm_observed", "corr_turb_minus_calm_fr_corrected",
                               "absorption_top1_turb_minus_calm") or "Turbulent regime" in r["cell"]:
                r["p_boot"], r["p"], r["untestable"] = r["p"], 1.0, "2 turbulent episodes"
    m, k = cells.bh(0.10)
    cost_certain = sum(1 for r in cells.rows if r["bh"] and r["family"] in ("Rn_follow_net_R", "Rn_fade_net_R"))
    raw05 = sum(r["p"] < 0.05 for r in cells.rows)
    res["cells"] = {"tested": m, "pass_bh": k, "pass_bh_cost_certain": cost_certain, "expected_false_among_passes": r4(0.10 * k, 1), "raw_p05": int(raw05), "raw_p05_by_chance": r4(0.05 * m, 1),
                    "by_family": {f: [sum(1 for r in cells.rows if r["family"] == f), sum(1 for r in cells.rows if r["family"] == f and r["bh"])]
                                  for f in dict.fromkeys(r["family"] for r in cells.rows)}}
    res["cell_rows"] = cells.rows
    (OUT / "results.json").write_text(json.dumps(res, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    print("cells", res["cells"], f"built {time.time() - t0:.0f}s", flush=True)
    return res


# ------------------------------------------------------------------------------------------------ look
# Written after reading wide/results.json (2026-11-12); numbers quoted from it.
INTRO = [
    "1,584 London sessions (2016-10-24 to 2022-12-30), 7 USD majors on the 1-minute bid/ask grid of stage 2; dollar = the other six majors (leave-own-out), β from the prior 20 sessions only. 2023 onwards is not looked at.",
    "The dollar share holds across every slice for every pair (all far above the 0.5% a wrong-day dollar explains), but its SIZE moves with the clock: it peaks in the 13:00-16:00 London overlap (EURUSD 62%, AUDUSD 67%, NZDUSD 69%, USDJPY 33%) and is lowest in Asia (USDJPY 12%). USDCAD is the exception: its own news lands at 13:30 with the US data, so its dollar share is highest in Asia and the London open (46%) and falls to 34% in the overlap.",
    "It rises with vol: the high-σ third has 9-19 points more dollar share than the low third in five of seven pairs, and 2021-2022 is the most dollar-driven stretch (GBPUSD 19% in 2019 to 56% in 2022; USDJPY 34% in 2017 to 7% in 2019, back to 27% in 2022). The turbulent regime looks higher still, but C.OG's rule finds only 2 turbulent episodes in the window (Apr-Aug 2020, Jun-Dec 2022), so regime is too noisy to tell apart from year.",
    "THE MARKET QUESTION: a dollar-led big 15-minute move and an own-led one behave the same. Pooled, the follow-through difference is -0.001σ at 1h and -0.010σ to 22:00, against a 0.037σ (1h) to 0.085σ (22:00) round trip; stop-through beyond 0.25σ is 58.4% vs 58.5%. It is not a plateau: 0 of 27 neighbouring settings pass, and the sign flips between them.",
    "The only local pattern: own-led moves in the NY afternoon (16-22 London) give back 0.008σ in 15 minutes and 0.025σ by 22:00, while dollar-led ones do not (difference +0.030σ). As a trade it loses: fading them at a 0.25σ stop/target is about +0.06R gross and negative net once one spread (≈0.15R) is paid.",
    "Forbes-Rigobon: raw correlation of the majors rises from 0.40 on the calmest tenth of days to 0.50-0.54 on the loudest, but corrected for the louder variance it FALLS (0.40 to 0.23 in the top decile): loud days are louder own moves, not a dollar that takes over. Sorted on yesterday's vol the corrected line is flat to falling too (0.41 to 0.32).",
    "The 7-major absorption ratio (top PC share, rolling 63 sessions) runs 0.36-0.74, mean 0.56 vs 0.15 for shuffled re-pairings; it bottomed on 2020-03-11 (the COVID dash split yen, franc and commodity currencies) and ended 2022 at its high, 0.74. Top-2 PCs take 0.71.",
    "Tail risk: the dollar's worst days and a pair's own worst days mostly come apart, as under shuffling, except USDCAD (12 joint top-5% days vs 3.8 shuffled) and GBPUSD same-direction (7 vs 1.8): for those two a dollar shock and an own shock tend to land together, so a hedge built from the dollar factor leaves the tail in.",
    "What it means: the split is a RISK description (where the variance comes from, by hour and by year), not an entry signal. Size books on the dollar share of the hour; do not expect a stop to behave differently because the move that hit it was dollar or own.",
]


def _ci(x):
    return {"value": x[0], "lo": x[1], "hi": x[2]}


def look():
    R = json.loads((OUT / "results.json").read_text(encoding="utf-8"))
    sh, key, ss = R["share"], R["key"], R["stop_slices"]
    charts = []
    four = ("EURUSD", "GBPUSD", "USDCAD", "USDJPY")
    tods = [t[0] for t in TOD]
    other = "; ".join(f"{s} " + "/".join(f"{sh[s]['tod'][t][0]:.2f}" for t in tods) for s in ("AUDUSD", "NZDUSD", "USDCHF"))
    charts.append({"type": "lines", "title": "Dollar share of 5-minute variance by London time of day", "unit": "share of variance", "xlabel": "1 Asia 00-07 · 2 London open 07-10 · 3 London mid 10-13 · 4 Overlap 13-16 · 5 NY afternoon 16-22",
                   "note": f"Each pair's share peaks in the 13:00-16:00 overlap, when US data lands, except USDCAD, whose own data lands at the same time. The other pairs, Asia to NY: {other}. Benchmark: a dollar path from a random other session explains under 0.01 in every bucket.",
                   "series": [{"name": s, "points": [[k + 1, sh[s]["tod"][t][0]] for k, t in enumerate(tods)]} for s in four]})
    charts.append({"type": "groups", "title": "Dollar share by σ third (σ known at the open)", "names": ["Low σ third", "Mid σ third", "High σ third"], "unit": "share of 5-minute variance",
                   "note": "Thirds of the layer-1 σ forecast, cut per pair over the window. Read across: in five of seven pairs the dollar takes 9-19 points more of the variance when σ is high (EURUSD +6, GBPUSD +3). Benchmark: the wrong-day dollar, under 0.01.",
                   "rows": [{"label": s, "values": [sh[s]["terciles"][k][0] for k in ("low", "mid", "high")]} for s in MAJ]})
    rg = R["regime"]
    charts.append({"type": "groups", "title": "Dollar share, calm vs turbulent regime (C.OG Lesson 05)", "names": ["Calm", "Turbulent", "Wrong-day dollar (benchmark)"], "unit": "share of 5-minute variance",
                   "note": f"Turbulent = 63-session FX vol above 1.25x its rolling median for 21+ sessions, past data only: {rg['turb_days']} sessions in only {rg['turb_episodes']} episodes ({', '.join(a + ' to ' + b for a, b in rg['turb_spans'])}) vs {rg['calm_episodes']} calm episodes. Turbulent is higher for every pair, but two episodes are also the two most dollar-driven years, so this is not separable from year; the cells are shown, never counted as passes.",
                   "rows": [{"label": s, "values": [sh[s]["calm"][0], sh[s]["turbulent"][0], sh[s]["wrong_day"]]} for s in MAJ]})
    charts.append({"type": "lines", "title": "Year by year: dollar share of 5-minute variance", "unit": "share of variance", "xlabel": "year",
                   "note": "AUDUSD and NZDUSD track EURUSD (0.38-0.71); USDCHF stays 0.30-0.48. Benchmark: the pooled share (EURUSD 0.56, GBPUSD 0.40, USDCAD 0.37, USDJPY 0.22). Every pair dips in 2019 and climbs to its high in 2021-2022.",
                   "series": [{"name": s, "points": [[int(y), sh[s]["years"][y][0]] for y in YEARS]} for s in four]})
    a = key["All 7 majors"]
    charts.append({"type": "groups", "title": "THE QUESTION: after a big 15-minute move, does dollar-led behave differently from own-led?", "names": ["Dollar-led", "Own-led", "Round-trip spread (cost)"], "unit": "daily σ, signed with the move (+ = continues)",
                   "note": f"Big = |15-min move| above the 90th percentile of the prior 60 sessions. Dollar-led = β×dollar is ≥70% of the move's square and same sign ({a['n_dollar']:,} moves); own-led = ≤30% ({a['n_own']:,}). Entry one minute after the move on the mid; the cost bar is the bid/ask round trip. Both lines sit at 0 against a cost 4-10x larger. All-big-moves benchmark: {a['1h']['all_big'][0]:+.4f}σ at 1h.",
                   "rows": [{"label": h, "values": [a[h]["dollar"][0], a[h]["own"][0], a[h]["cost"]]} for h, _ in HZ]})
    rows = []
    for nm in ["All 7 majors"] + MAJ + tods + ["Calm regime", "Turbulent regime", "σ low third", "σ mid third", "σ high third"] + YEARS:
        rows.append({"label": nm, **_ci(key[nm]["1h"]["diff"])})
    charts.append({"type": "bars", "title": "Dollar-led minus own-led follow-through at 1 hour, every slice", "unit": "daily σ", "ref": 0,
                   "note": "95% date-block intervals (regime rows: episode bootstrap; turbulent has 2 episodes, so its interval is not real). Benchmark 0 = no difference; the 1h round trip is 0.037σ. Only NY afternoon clears 0, and the year rows flip sign (2017 +, 2018 -, 2019 +, 2020 -): no stable edge.",
                   "rows": rows})
    charts.append({"type": "groups", "title": "To 22:00 London, by time of day: dollar-led and own-led follow-through", "names": ["Dollar-led", "Own-led", "Round-trip spread (cost)"], "unit": "daily σ, signed with the move",
                   "note": "Own-led moves in the NY afternoon give back 0.025σ by 22:00 and dollar-led Asian moves give back 0.07σ; both are smaller than the round trip (spreads widen into 22:00). Benchmark: 0 and the cost bar.",
                   "rows": [{"label": t, "values": [key[t]["rest"]["dollar"][0], key[t]["rest"]["own"][0], key[t]["rest"]["cost"]]} for t in tods]})
    st, rb = R["stop"], R["random_stop"]
    charts.append({"type": "groups", "title": "Stop-through: does a fade's stop beyond s·σ get hit within 4 hours?", "names": ["Dollar-led, fade stopped", "Own-led, fade stopped", "Random 15-min boundary (benchmark)"], "unit": "share of moves",
                   "note": "On the M1 bid/ask close path, one spread paid, 4h window cut at 22:00. Dollar-led and own-led stops are hit at the same rate at every stop size; both are hit more often than at a random boundary, because a big move comes with higher vol right then. The follow side's stop is hit at the same rate as the fade's (e.g. 0.59 vs 0.58 at 0.25σ): no direction.",
                   "rows": [{"label": f"stop {sv}σ", "values": [st[str(sv)]["dollar|st_fade"][0], st[str(sv)]["own|st_fade"][0], rb[str(sv)][0]]} for sv in STOPS]})
    p = ss["All 7 majors"]
    ny = ss["NY afternoon 16-22"]
    charts.append({"type": "bars", "title": "In R: follow or fade a big move, stop = target = 0.25σ, 4 hours", "unit": "R (1R = 0.25σ)", "ref": 0,
                   "note": "First touch on the M1 bid/ask close path (buys at the offer, sells at the bid), else exit at 4h/22:00. Gross = on the mid; net = one spread paid (~0.15R). Benchmark 0. Every net bar is negative, including the one local pattern (NY-afternoon own-led fade).",
                   "rows": [{"label": "Dollar-led follow, gross", **_ci(p["Rg_follow_dollar"])}, {"label": "Own-led follow, gross", **_ci(p["Rg_follow_own"])},
                            {"label": "Dollar-led follow, net", **_ci(p["Rn_follow_dollar"])}, {"label": "Own-led follow, net", **_ci(p["Rn_follow_own"])},
                            {"label": "Dollar-led fade, net", **_ci(p["Rn_fade_dollar"])}, {"label": "Own-led fade, net", **_ci(p["Rn_fade_own"])},
                            {"label": "NY afternoon own-led follow, gross", **_ci(ny["Rg_follow_own"])}, {"label": "NY afternoon own-led fade, net", **_ci(ny["Rn_fade_own"])}]})
    cd = R["corr"]["deciles"]
    charts.append({"type": "lines", "title": "Correlation vs vol with the Forbes-Rigobon correction", "unit": "mean pairwise correlation (7 majors, 5-min)", "xlabel": "within-year vol decile (same day)",
                   "note": "Corrected = ρ/√(1+δ(1-ρ²)), δ = this decile's variance ÷ the calmest decile's - 1 (mean of the two pairs). 'Forward map' = what pure heteroskedasticity would produce from the calm ρ (the formula printed in Lesson 06; shown as the benchmark, not used as the correction). Observed rises less than the forward map, so the corrected correlation FALLS on loud days: they are own-move days. Sorted by yesterday's vol: corrected 0.41 to 0.32.",
                   "series": [{"name": "Observed", "points": [[r["decile"], r["observed"][0]] for r in cd]}, {"name": "FR-corrected", "points": [[r["decile"], r["fr_corrected"][0]] for r in cd]},
                              {"name": "Forward map (pure heteroskedasticity)", "points": [[r["decile"], r["fr_forward"]] for r in cd]}, {"name": "Calmest decile (benchmark)", "points": [[r["decile"], r["calm"]] for r in cd]}]})
    cy, cr = R["corr"]["years"], R["corr"]["regime"]
    charts.append({"type": "groups", "title": "Correlation by regime and year, raw and Forbes-Rigobon corrected", "names": ["Observed", "FR-corrected", "Calm-regime baseline"], "unit": "mean pairwise correlation",
                   "note": f"Baseline = all calm-regime sessions ({cr['calm']}). The turbulent regime's raw 0.61 shrinks to 0.49 once its doubled variance (δ = {cr['delta']}) is removed; 2022's 0.59 shrinks to 0.47. 2021 is the year correlation really rose (corrected 0.60 on lower vol). Two turbulent episodes only.",
                   "rows": [{"label": "Turbulent regime", "values": [cr["turb_observed"][0], cr["turb_fr_corrected"][0], cr["calm"]]}] +
                           [{"label": y, "values": [cy[y]["observed"], cy[y]["fr_corrected"], cy[y]["calm"]]} for y in YEARS]})
    AR = pd.read_csv(OUT / "absorption.csv")
    AR = AR.iloc[::5]
    yr = lambda d: round(int(d[:4]) + (pd.Timestamp(d).dayofyear - 1) / 365.25, 3)  # noqa: E731
    ab = R["absorption"]
    charts.append({"type": "lines", "title": "Absorption ratio of the 7 majors, rolling 63 sessions", "unit": "share of total variance (correlation matrix)", "xlabel": "year",
                   "note": f"Top-1 PC = the dollar; top-2 adds the yen/franc vs commodity split. Benchmark: the same windows with each pair's sessions shuffled (0.15 and 0.29, about the 1/7 and 2/7 of no common factor). Low {ab['top1_min'][1]} on {ab['top1_min'][0]}, high {ab['top1_max'][1]} on {ab['top1_max'][0]}; correlation with 63-session FX vol {ab['corr_with_v63']}. A description: each window includes its own end session.",
                   "series": [{"name": "Top-1 PC share", "points": [[yr(d), r4(v, 3)] for d, v in zip(AR.date, AR.top1)]}, {"name": "Top-2 PC share", "points": [[yr(d), r4(v, 3)] for d, v in zip(AR.date, AR.top2)]},
                              {"name": "Top-1, shuffled (benchmark)", "points": [[yr(d), r4(v, 3)] for d, v in zip(AR.date, AR.top1_sh)]}, {"name": "Top-2, shuffled (benchmark)", "points": [[yr(d), r4(v, 3)] for d, v in zip(AR.date, AR.top2_sh)]}]})
    jw = R["joint_worst"]
    rows = []
    for s in MAJ:
        v = jw[s]["0.05"]
        rows.append({"label": f"{s}: both in top 5% by size", "values": [v["abs"][0], v["abs"][1], v["abs"][2]]})
        rows.append({"label": f"{s}: both top 5%, same direction", "values": [v["same_dir"][0], v["same_dir"][1], v["same_dir"][2]]})
    charts.append({"type": "groups", "title": "Joint worst days: the dollar's part and the pair's own part on the same session", "names": ["Observed days", "Shuffled re-pairings, mean", "Shuffled, 97.5th pct"], "unit": "sessions (of ~1,450 per pair)",
                   "note": "Day move split into β×dollar and own (open to 22:00, in σ). Benchmark: 2,000 shuffles of the own part across sessions. Only USDCAD (12 vs 3.8) and GBPUSD same-direction (7 vs 1.8) beat the shuffle; for the others the two tails are independent, as a factor model assumes.",
                   "rows": rows})
    lk = R["lag1_key"]
    rows = []
    for h, _ in HZ:
        rows.append({"label": f"{h}: as built", **_ci(key["All 7 majors"][h]["diff"])})
        rows.append({"label": f"{h}: inputs one session later", **_ci(lk[h]["diff"])})
    lagsh = ", ".join(f"{s} {sh[s]['pooled'][0]:.3f}→{sh[s]['lag1'][0]:.3f}" for s in MAJ)
    charts.append({"type": "bars", "title": "Lesson 01 +1 lag check: every input one session later", "unit": "daily σ, dollar-led minus own-led", "ref": 0,
                   "note": f"β, σ and the big-move threshold all moved one session further back. The difference stays at 0 either way. The dollar share barely moves when β is a session staler ({lagsh}), so it is not an alignment artefact: β is persistent. Benchmark 0.",
                   "rows": rows})
    pl = R["plateau"]
    charts.append({"type": "lines", "title": "Lesson 01 plateau check: dollar-led minus own-led at 1h, neighbouring settings", "unit": "daily σ", "xlabel": "big-move percentile (prior 60 sessions)",
                   "note": "Formation window 5/15/30 minutes, share cut 0.6/0.7/0.8. All 27 settings sit within ±0.007σ of 0 with no consistent sign and none passes BH: a flat zero, not a hidden peak. Benchmark 0; the 1h round trip is 0.037σ.",
                   "series": [{"name": f"{h}-min move, cut 0.7", "points": [[q["pct"], q["diff"][0]] for q in pl if q["h"] == h and q["cut"] == 0.7]} for h in (5, 15, 30)] +
                             [{"name": "15-min move, cut 0.8", "points": [[q["pct"], q["diff"][0]] for q in pl if q["h"] == 15 and q["cut"] == 0.8]}]})
    charts.append({"type": "trades", "title": "Real examples: following big dollar-led and own-led moves", "unit": "R",
                   "note": "Picked by seed among the top 3% of big moves. Path = net P&L in R on the bid/ask close path (stop -1R, target +1R at 0.25σ, entry one minute late). Benchmark: a coin flip less one spread (about -0.15R).",
                   "trades": R["examples"]})
    c = R["cells"]
    holds = [
        {"effect": "Dollar share of variance depends on the hour", "where": "every pair; peak 13-16 London (EURUSD 0.62, AUDUSD 0.67, USDJPY 0.33), low in Asia (USDJPY 0.12); USDCAD reversed (0.46 Asia/London open, 0.34 overlap)",
         "size": "12-21 points between buckets", "benchmark": "pair's pooled share; wrong-day dollar < 0.01"},
        {"effect": "Dollar share rises with σ", "where": "5 of 7 pairs (AUD, NZD, CAD, CHF, JPY; EURUSD +6 and GBPUSD +3 do not pass): high-σ third minus low third", "size": "+9 to +19 points", "benchmark": "low-σ third; wrong-day dollar < 0.01"},
        {"effect": "Dollar share drifts by year", "where": "all; 2019 lowest, 2021-22 highest (GBPUSD 0.19 to 0.56, USDCAD 0.19 to 0.54)", "size": "up to 37 points", "benchmark": "pooled share"},
        {"effect": "Dollar-led vs own-led big moves: no difference", "where": "holds across pairs, hours, σ thirds, years; 27 neighbouring settings; +1 lag", "size": "-0.001σ at 1h, -0.010σ to 22:00; stop-through 58.4% vs 58.5%",
         "benchmark": "0, all-big-moves pool, round trip 0.037-0.085σ"},
        {"effect": "Own-led moves give back a little in the NY afternoon", "where": "local to 16-22 London", "size": "-0.025σ to 22:00 (dollar-led minus own +0.030σ); fade ≈ +0.06R gross, negative net",
         "benchmark": "0 and one spread (~0.15R)"},
        {"effect": "Forbes-Rigobon-corrected correlation does not rise with vol", "where": "same-day vol deciles 6-10; yesterday-sorted too (not significant)", "size": "0.40 calm to 0.23 loudest decile (raw 0.50)",
         "benchmark": "calmest decile; forward heteroskedasticity map 0.70"},
        {"effect": "Absorption ratio well above chance", "where": "all of 2017-2022", "size": "top-1 0.36-0.74 (mean 0.56), top-2 0.71", "benchmark": "shuffled 0.15 / 0.29"},
        {"effect": "Joint worst days of dollar and own part", "where": "local to USDCAD and GBPUSD (same direction)", "size": "USDCAD 12 vs 3.8 days, GBPUSD 7 vs 1.8", "benchmark": "2,000 shuffled re-pairings"},
    ]
    intro = INTRO + [f"Sweep: {c['tested']} cells tested; {c['pass_bh']} pass Benjamini-Hochberg at q = 0.10 (about {c['expected_false_among_passes']} of those expected false). {c['pass_bh_cost_certain']} of the passes are just 'net R is below 0' (the spread), so the informative passes are {c['pass_bh'] - c['pass_bh_cost_certain']}: almost all are the dollar-share-by-hour/year/σ cells; of 96 dollar-minus-own follow cells, {c['by_family'].get('follow_dollar_minus_own', [0, 0])[1]} pass."]
    out = {"id": "features-wide", "window": [START, END], "cells_tested": c["tested"], "cells_pass_bh": c["pass_bh"], "cells_expected_by_chance": c["expected_false_among_passes"],
           "cells_note": f"cells_expected_by_chance = q x passes (expected false discoveries). Raw p<0.05: {c['raw_p05']} vs {c['raw_p05_by_chance']} by chance. {c['pass_bh_cost_certain']} passes are net-R-below-zero cells (the spread). Cells leaning on the turbulent regime (2 episodes) are set to p = 1.",
           "intro": intro, "holds": holds, "charts": charts}
    WEB.mkdir(parents=True, exist_ok=True)
    f = WEB / "features-wide.json"
    f.write_text(json.dumps(out, ensure_ascii=False, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    # checks
    chk = json.loads(f.read_text(encoding="utf-8"))
    need = {"lines": ["title", "unit", "xlabel", "note", "series"], "bars": ["title", "unit", "ref", "note", "rows"], "groups": ["title", "names", "unit", "note", "rows"],
            "hist": ["title", "unit", "note", "bins"], "trades": ["title", "unit", "note", "trades"]}
    for ch in chk["charts"]:
        miss = [k for k in need[ch["type"]] if k not in ch]
        assert not miss, (ch["title"], miss)
        if ch["type"] == "lines":
            assert len(ch["series"]) <= 4, ch["title"]
    import re
    dates = re.findall(r"20\d\d-\d\d-\d\d", f.read_text(encoding="utf-8"))
    assert max(dates) <= END, max(dates)
    print("charts", len(chk["charts"]), "bytes", f.stat().st_size, "max date", max(dates))


if __name__ == "__main__":
    if "--look-only" not in sys.argv:
        main()
    look()
