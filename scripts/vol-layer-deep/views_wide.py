"""Vol-Layer deep dive, layer 4 'Conditional views': stage 3 GO WIDE (discovery window only, no verdicts).

Stage 2 (views.py) looked at 5 views + an equal-weight combo on 10 instruments, pooled. Here the same views are built
for every instrument in analysis/output/forecast_history (34: 7 USD majors, 21 FX crosses, gold, 6 indices) and judged
the way C.OG says a view should be judged: by IC per bet and by breadth (IR ~ IC x sqrt(breadth)), not by intraday R.

  IC        = Spearman rank correlation of the view (known at the London open) with the next return, computed per
              instrument and pooled as the mean of standardised-rank products (so the pooled IC is the n-weighted
              mean of the per-instrument ICs and can be date-block bootstrapped with LR.Boot).
  outcomes  = f_h = log(open_{t+h}/open_t) / (sigma_t sqrt h), h = 1, 5, 20 sessions (plateau sweep adds 2,3,10,15,30,40)
              London time-of-day buckets (Asia 00-07, London open 07-10, London mid 10-13, overlap 13-16,
              NY afternoon 16-22, Europe/London clock) on M1 mid, in daily sigma.
  regime    = C.OG Lesson 05: rv63 = std of the last 63 open-to-open log returns (past only); turbulent when
              rv63 > 1.25 x its rolling 252-session median (min 63, past only) has held for 21+ consecutive sessions
              (the 21st day onward, point-in-time); otherwise calm. Regime cells are bootstrapped in blocks of the
              median turbulent-episode length. Sigma terciles: today's HAR sigma ranked against its previous 250.
  breadth   = eigenvalues of the correlation matrix of daily view-signed returns sign(view) x z1, per (view, inst):
              N_PR = (sum l)^2 / sum l^2, N_ent = exp(entropy of l/sum l), N_var = eigenvalues for 90% of variance,
              against the Marchenko-Pastur upper edge (1 + sqrt(K/T))^2 and a time-shuffled copy.
  races (R) = the only R in this file: entry at the first M1 bar of the London session (buy at ask, sell at bid),
              stop 0.5 sigma, target 0.5/0.75/1.0/1.5 sigma, touches on the bid (longs) / ask (shorts) path,
              same-bar stop+target = stop, flat at 21:00 London. Net = that; gross = net + one entry spread.

Declared before looking: surprise sign for DE30 = +EU, UK100 = +GB, DOW/US2000/NQ/SPX500 = +US, gold = -US,
crosses = base minus quote. Carry is undefined for gold and indices. No energy or rates instruments exist in
forecast_history, so those classes are skipped.

DISCOVERY WINDOW ONLY: sessions 2016-10-24 .. 2022-12-30. Inputs may use prices from 2016-03-28; no outcome after
2022-12-30 is loaded (hist cut at END, M1 filtered to London dates <= END, all asserted).

    python -X utf8 scripts/vol-layer-deep/views_wide.py  -> backtest-data/vol-layer/views-wide.json
                                                             analysis/output/vol-layer-deep/views/wide/*
"""
from __future__ import annotations

import importlib.util
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts/forecast_history"), str(ROOT / "scripts/vol-layer-deep")]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import line_reaction as LR  # noqa: E402

spec = importlib.util.spec_from_file_location("views_s2", ROOT / "scripts/vol-layer-deep/views.py")
V = importlib.util.module_from_spec(spec)
spec.loader.exec_module(V)

SEED = 20261112
B = 2000
START, END = "2016-10-24", "2022-12-30"
HIST = ROOT / "analysis/output/forecast_history"
BA = ROOT / "data/m1_bidask"
OUTD = ROOT / "analysis/output/vol-layer-deep/views/wide"
OUTJ = ROOT / "backtest-data/vol-layer/views-wide.json"
MAJ = ["EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDJPY", "USDCAD", "USDCHF"]
IDX = {"NQ": "US", "SPX500": "US", "DOW": "US", "US2000": "US", "DE30": "EU", "UK100": "GB"}
M1KEY = {"DE30": "dax", "SPX500": "spx"}
CCY = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"]
VIEWS = ["mom1", "mom3", "mom12", "carry", "surprise", "combo"]
BASE_VIEWS = ["mom1", "mom3", "mom12", "carry", "surprise"]
HZ = [1, 5, 20]
HZ_ALL = [1, 2, 3, 5, 10, 15, 20, 30, 40]
MOM_K = [10, 21, 42, 63, 126, 189, 252]
TOD = [("Asia 00-07", 0, 420), ("London open 07-10", 420, 600), ("London mid 10-13", 600, 780),
       ("Overlap 13-16", 780, 960), ("NY afternoon 16-22", 960, 1320)]
CLOSE = 21 * 60
STOP = 0.5
TGTS = [0.5, 0.75, 1.0, 1.5]
YEARS = [2017, 2018, 2019, 2020, 2021, 2022]
R = lambda x, k=4: None if x is None or not np.isfinite(x) else round(float(x), k)  # noqa: E731

INTRO = None  # written after reading the numbers, see INTRO_LINES at the bottom


def cls_of(sym):
    if sym in MAJ:
        return "FX majors"
    if sym == "GOLD":
        return "metals"
    if sym in IDX:
        return "indices"
    return "FX crosses"


def instruments():
    return sorted(p.stem for p in HIST.glob("*.csv"))


# ------------------------------------------------------------------ build
def regime(d):
    lo = np.log(d.open.to_numpy())
    ret = np.r_[np.nan, np.diff(lo)]                            # ret[t] = log(open_t/open_{t-1}), known at open_t
    rv = pd.Series(ret).rolling(63, min_periods=63).std()
    med = rv.rolling(252, min_periods=63).median().shift(1)    # past only
    cond = (rv > 1.25 * med).to_numpy()
    run = np.zeros(len(d), int)
    for i in range(len(d)):
        run[i] = run[i - 1] + 1 if (cond[i] and i) else (1 if cond[i] else 0)
    lab = np.where(run >= 21, "turbulent", "calm")
    lab = np.where(med.isna().to_numpy(), "nan", lab)
    return lab


def build():
    syms = instruments()
    hists = {}
    for s in syms:
        d = V.load_hist(s)
        assert d.date.max() <= END
        lo = np.log(d.open.to_numpy())
        for h in HZ_ALL:
            if f"f{h}" not in d:
                fut = np.full(len(d), np.nan)
                fut[:-h] = lo[h:] - lo[:-h]
                d[f"f{h}"] = fut / (d.sig * np.sqrt(h))
        for k in MOM_K:
            past = np.full(len(d), np.nan)
            past[k:] = lo[k:] - lo[:-k]
            d[f"momk{k}"] = past / (d.sig * np.sqrt(k))
        d["regime"] = regime(d)
        hists[s] = d
    alld = sorted(set().union(*[set(d.date) for d in hists.values()]))
    t0 = time.time()
    rt = V.rates_for(alld)
    su = V.surprises_for(alld)
    print("rates+surprises", round(time.time() - t0, 1), "s", flush=True)
    pos = {dt: i for i, dt in enumerate(alld)}
    parts, full = [], {}
    for s, d in hists.items():
        ix = np.array([pos[x] for x in d.date])
        us = su["USD"][ix]
        if s == "GOLD":
            d["carry"], d["surprise"] = np.nan, -us
        elif s in IDX:
            d["carry"], d["surprise"] = np.nan, su[{"US": "USD", "EU": "EUR", "GB": "GBP"}[IDX[s]]][ix]
        else:
            b, q = s[:3], s[3:]
            d["carry"] = rt[b][ix] - rt[q][ix]
            sb, sq = su[b][ix], su[q][ix]
            d["surprise"] = np.where(np.isfinite(sb) | np.isfinite(sq), np.nan_to_num(sb) - np.nan_to_num(sq), np.nan)
        sg = np.column_stack([np.sign(d[v]) for v in ["mom3", "mom12", "carry", "surprise"]])
        cnt = np.isfinite(sg).sum(1)
        d["combo"] = np.where(cnt >= 2, np.nansum(sg, 1) / np.maximum(cnt, 1), np.nan)
        for v in VIEWS:                                         # +1 session lag check: view known one session earlier
            d[f"{v}_lag"] = d[v].shift(1)
        full[s] = d[["date", "open", "sig", "carry", "surprise"]].reset_index(drop=True)
        d = d[(d.date >= START) & (d.date <= END)].copy()
        d["inst"], d["cls"] = s, cls_of(s)
        parts.append(d)
    D = pd.concat(parts, ignore_index=True)
    D["year"] = D.date.str[:4].astype(int)
    assert D.date.max() <= END and D.date.min() >= START
    return D, full


def m1_pass(D):
    """Per instrument (one at a time): time-of-day bucket returns and bid/ask race outcomes for both sides."""
    out, paths = [], {}
    info_all = D.set_index(["inst", "date"])[["sig"]]
    for s in D.inst.unique():
        key = M1KEY.get(s, s.lower())
        lo_t, hi_t = pd.Timestamp(START) - pd.Timedelta(days=2), pd.Timestamp(END) + pd.Timedelta(days=1)
        df = pd.read_parquet(BA / f"{key}_m1.parquet",
                             columns=["time", "open", "close", "bid_o", "bid_h", "bid_l", "bid_c", "ask_o", "ask_h", "ask_l", "ask_c"],
                             filters=[("time", ">=", lo_t), ("time", "<", hi_t)])
        idx = pd.DatetimeIndex(pd.to_datetime(df["time"], utc=True)).tz_convert("Europe/London").tz_localize(None)
        dates = np.asarray(idx.normalize().strftime("%Y-%m-%d"))
        m = (idx.hour * 60 + idx.minute).to_numpy()
        keep = (dates >= START) & (dates <= END) & (m < 1320)
        df, dates, m = df[keep].reset_index(drop=True), dates[keep], m[keep]
        assert dates.max() <= END
        sig = info_all.loc[s]["sig"]
        A = {c: df[c].to_numpy() for c in df.columns if c != "time"}
        del df
        mid_o = (A["bid_o"] + A["ask_o"]) / 2
        mid_c = (A["bid_c"] + A["ask_c"]) / 2
        bnd = np.flatnonzero(np.r_[True, dates[1:] != dates[:-1], True])
        rec = []
        for a, b in zip(bnd[:-1], bnd[1:]):
            dt = dates[a]
            if dt not in sig.index:
                continue
            sg = sig.loc[dt]
            if not (np.isfinite(sg) and sg > 0) or b - a < 300:
                continue
            mm = m[a:b]
            r = {"inst": s, "date": dt, "nbars": int(b - a)}
            for nm, t0, t1 in TOD:
                w = np.flatnonzero((mm >= t0) & (mm < t1))
                r[nm] = np.log(mid_c[a + w[-1]] / mid_o[a + w[0]]) / sg if len(w) >= 30 else np.nan
            # races: entry at the first bar of the session, flat at 21:00 London
            w = np.flatnonzero(mm < CLOSE) + a
            P = mid_o[w[0]]
            risk = STOP * sg * P
            eL, eS = A["ask_o"][w[0]], A["bid_o"][w[0]]
            r["spreadR"] = (eL - eS) / risk
            bl, bh, ah, al = A["bid_l"][w], A["bid_h"][w], A["ask_h"][w], A["ask_l"][w]
            for k in TGTS:
                tgt = k * sg * P
                iS = np.flatnonzero(bl <= eL - risk)
                iT = np.flatnonzero(bh >= eL + tgt)
                fs, ft = (iS[0] if len(iS) else 10 ** 9), (iT[0] if len(iT) else 10 ** 9)
                r[f"L{k}"] = -1.0 if (fs <= ft and fs < 10 ** 9) else (tgt / risk if ft < 10 ** 9 else (A["bid_c"][w[-1]] - eL) / risk)
                iS = np.flatnonzero(ah >= eS + risk)
                iT = np.flatnonzero(al <= eS - tgt)
                fs, ft = (iS[0] if len(iS) else 10 ** 9), (iT[0] if len(iT) else 10 ** 9)
                r[f"S{k}"] = -1.0 if (fs <= ft and fs < 10 ** 9) else (tgt / risk if ft < 10 ** 9 else (eS - A["ask_c"][w[-1]]) / risk)
            rec.append(r)
            if s in MAJ + ["GOLD", "NQ"]:
                keep10 = w[(mm[w - a] % 10) == 0]
                paths[(s, dt)] = (mm[keep10 - a], (np.log((A["bid_c"][keep10] + A["ask_c"][keep10]) / 2 / P) / sg))
        out.append(pd.DataFrame(rec))
        del A
        print(s, len(rec), flush=True)
    return pd.concat(out, ignore_index=True), paths


# ------------------------------------------------------------------ IC machinery
def zrank(sub, col):
    r = sub.groupby("inst")[col].rank()
    g = r.groupby(sub.inst)
    return ((r - g.transform("mean")) / g.transform("std")).to_numpy()


def ic_terms(D, view, out, mask=None, min_n=30):
    sub = D if mask is None else D[mask]
    ok = np.isfinite(sub[view].to_numpy()) & np.isfinite(sub[out].to_numpy())
    sub = sub.loc[ok, ["inst", "date", view, out]]
    n = sub.groupby("inst")[view].transform("size")
    sub = sub[n.to_numpy() >= min_n]
    if len(sub) < min_n:
        return None, None
    x = zrank(sub, view) * zrank(sub, out)
    ok = np.isfinite(x)
    return sub.date.to_numpy()[ok], x[ok]


class BootL:
    """Stationary date-block bootstrap with a chosen mean block length (for regime cells), seed 20261112."""

    def __init__(self, dates, block):
        self.dates = np.sort(pd.unique(dates))
        n = len(self.dates)
        rng = np.random.default_rng(SEED)
        W = np.zeros((B, n))
        p = 1.0 / block
        for b in range(B):
            jumps = rng.random(n) < p
            starts = rng.integers(n, size=n)
            seg = np.cumsum(jumps)
            first = np.r_[0, np.flatnonzero(jumps)]
            st = np.r_[rng.integers(n), starts[jumps]]
            idx = (st[seg] + (np.arange(n) - first[seg])) % n
            W[b] = np.bincount(idx, minlength=n)
        self.W = W
        self.idx = pd.Series(np.arange(n), index=self.dates)

    def reps(self, dates, x):
        a = np.bincount(self.idx[dates].to_numpy(), weights=x, minlength=len(self.dates))
        c = np.bincount(self.idx[dates].to_numpy(), minlength=len(self.dates)).astype(float)
        return (self.W @ a) / (self.W @ c)


def boot_reps(bs, dates, x):
    a, b = bs.sums(dates, x), bs.sums(dates, np.ones(len(x)))
    return (bs.W @ a) / (bs.W @ b)


def summarise(est, reps):
    reps = reps[np.isfinite(reps)]
    lo, hi = np.percentile(reps, [2.5, 97.5])
    se = reps.std()
    p = float(min(1.0, 2 * min((reps <= 0).mean(), (reps >= 0).mean())))
    p = max(p, 1.0 / len(reps))
    return {"ic": R(est), "lo": R(lo), "hi": R(hi), "se": R(se, 5), "p": R(p, 4)}


def bh(ps, q=0.10):
    ps = np.asarray(ps)
    n = len(ps)
    o = np.argsort(ps)
    thr = q * np.arange(1, n + 1) / n
    passed = ps[o] <= thr
    k = np.flatnonzero(passed).max() + 1 if passed.any() else 0
    res = np.zeros(n, bool)
    res[o[:k]] = True
    return res


# ------------------------------------------------------------------ breadth
def breadth(M):
    """M: T x K matrix of returns (NaN allowed). Pairwise-complete correlation, eigenvalues clipped at 0."""
    C = pd.DataFrame(M).corr(min_periods=200).to_numpy()
    keep = np.isfinite(C).all(0)
    C = C[np.ix_(keep, keep)]
    C = np.where(np.isfinite(C), C, 0)
    lam = np.clip(np.sort(np.linalg.eigvalsh(C))[::-1], 0, None)
    K = len(lam)
    T = int(np.isfinite(M[:, keep]).any(1).sum())
    p = lam / lam.sum()
    pp = p[p > 0]
    mp = (1 + np.sqrt(K / T)) ** 2
    return {"K": K, "T": T, "N_PR": R(lam.sum() ** 2 / (lam ** 2).sum(), 2), "N_ent": R(float(np.exp(-(pp * np.log(pp)).sum())), 2),
            "N_var": int(np.searchsorted(np.cumsum(p), 0.90) + 1), "mp_edge": R(mp, 3), "above_mp": int((lam > mp).sum()),
            "lam": [R(v, 3) for v in lam[:20]]}


def shuffled(M, rng):
    S = M.copy()
    for j in range(S.shape[1]):
        S[:, j] = S[rng.permutation(S.shape[0]), j]
    return S


# ------------------------------------------------------------------ random-walk null (finite-sample / Stambaugh bias)
N_RW = 30


def ic_mean(Dx, view, out, mask=None):
    dt, x = ic_terms(Dx, view, out, mask)
    return np.nan if dt is None else float(np.mean(x))


def rw_null(D, FULL, rng, n=N_RW):
    """Driftless random walks with our own vol path: each session's standardised open-to-open return is shuffled in
    time (one permutation of the union calendar, applied to every instrument, so cross-instrument correlation stays),
    re-scaled by the real sigma of the day, and the price-built views (mom*, combo) and all outcomes are rebuilt.
    Carry and surprise keep their real values (unrelated to the shuffled path). The mean of these ICs is what a
    view with NO timing edge shows in a cell of this size and shape: price-built momentum against overlapping
    future returns is biased negative in short samples (Stambaugh 1999)."""
    syms = list(FULL)
    U = np.array(sorted(set().union(*[set(f.date) for f in FULL.values()])))
    pos = {d: i for i, d in enumerate(U)}
    Z = np.full((len(U), len(syms)), np.nan)
    for j, s in enumerate(syms):
        f = FULL[s]
        lo = np.log(f.open.to_numpy())
        z = np.r_[np.nan, np.diff(lo)] / f.sig.to_numpy()
        Z[[pos[d] for d in f.date], j] = z
    win = {s: ((FULL[s].date >= START) & (FULL[s].date <= END)).to_numpy() for s in syms}
    masks = {"calm": D.regime.to_numpy() == "calm", "turbulent": D.regime.to_numpy() == "turbulent"}
    for t in ["low", "mid", "high"]:
        masks[t] = (D.vstate == t).to_numpy()
    for c in ["FX majors", "FX crosses", "metals", "indices"]:
        masks[c] = (D.cls == c).to_numpy()
    for y in YEARS:
        masks[str(y)] = (D.year == y).to_numpy()
    out = {}
    for b in range(n):
        Zp = Z[rng.permutation(len(U))]
        cols = {}
        for j, s in enumerate(syms):
            f = FULL[s]
            sg = f.sig.to_numpy()
            z = Zp[[pos[d] for d in f.date], j]
            z = np.where(np.isfinite(z), z, 0.0)
            z[0] = 0.0
            lo = np.cumsum(z * np.where(np.isfinite(sg), sg, 0.0))
            c = {}
            for k, nm in ((21, "mom1"), (63, "mom3"), (252, "mom12")):
                pa = np.full(len(lo), np.nan)
                pa[k:] = lo[k:] - lo[:-k]
                c[nm] = pa / (sg * np.sqrt(k))
            for k in MOM_K:
                pa = np.full(len(lo), np.nan)
                pa[k:] = lo[k:] - lo[:-k]
                c[f"momk{k}"] = pa / (sg * np.sqrt(k))
            for h in HZ_ALL:
                fu = np.full(len(lo), np.nan)
                fu[:-h] = lo[h:] - lo[:-h]
                c[f"f{h}"] = fu / (sg * np.sqrt(h))
            c["carry"], c["surprise"] = f.carry.to_numpy(), f.surprise.to_numpy()
            sgn = np.column_stack([np.sign(c[v]) for v in ["mom3", "mom12", "carry", "surprise"]])
            cnt = np.isfinite(sgn).sum(1)
            c["combo"] = np.where(cnt >= 2, np.nansum(sgn, 1) / np.maximum(cnt, 1), np.nan)
            for v in VIEWS:
                c[f"{v}_lag"] = np.r_[np.nan, c[v][:-1]]
            c["_date"] = f.date.to_numpy()
            for k_, v_ in c.items():
                cols.setdefault(k_, []).append(v_[win[s]])
        Ds = D[["inst", "date"]].copy()
        for k_, v_ in cols.items():
            Ds[k_] = np.concatenate(v_)
        assert len(Ds) == len(D) and (Ds["_date"].to_numpy() == D.date.to_numpy()).all()

        def put(key, val):
            out.setdefault(key, []).append(val)
        for v in VIEWS:
            for h in HZ_ALL:
                if h in HZ or v in ("combo", "carry", "mom12"):
                    put(f"pooled|{v}|{h}", ic_mean(Ds, v, f"f{h}"))
            for h in HZ:
                o = f"f{h}"
                put(f"lag|{v}|{h}", ic_mean(Ds, f"{v}_lag", o))
                for g in ["FX majors", "FX crosses", "metals", "indices"]:
                    put(f"class|{v}|{h}|{g}", ic_mean(Ds, v, o, masks[g]))
                for y in YEARS:
                    put(f"year|{v}|{h}|{y}", ic_mean(Ds, v, o, masks[str(y)]))
                for g in ["calm", "turbulent", "low", "mid", "high"]:
                    put(f"{'regime' if g in ('calm', 'turbulent') else 'terc'}|{v}|{h}|{g}", ic_mean(Ds, v, o, masks[g]))
                put(f"diff|{v}|{h}|turb-calm", out[f"regime|{v}|{h}|turbulent"][-1] - out[f"regime|{v}|{h}|calm"][-1])
                put(f"diff|{v}|{h}|high-low", out[f"terc|{v}|{h}|high"][-1] - out[f"terc|{v}|{h}|low"][-1])
        for k in MOM_K:
            for h in [5, 20]:
                put(f"momk|{k}|{h}", ic_mean(Ds, f"momk{k}", f"f{h}"))
        print("rw draw", b, flush=True)
    return {k: [R(np.nanpercentile(v, 5)), R(np.nanmean(v)), R(np.nanpercentile(v, 95))] for k, v in out.items()}


def null_key(c):
    f, v, h, g = c["family"], c["view"], c["h"], c["group"]
    if f in ("pooled", "inst", "plateau_h"):
        return f"pooled|{v}|{h}"
    if f == "class":
        return f"class|{v}|{h}|{g}"
    if f in ("year", "regime", "terc"):
        return f"{f}|{v}|{h}|{g}"
    if f == "cond":
        return f"diff|{v}|{h}|{g}"
    if f == "lag":
        return f"lag|{v}|{h}"
    if f == "plateau_k":
        return f"momk|{v.split('=')[1]}|{h}"
    return None


# ------------------------------------------------------------------ run
def main():
    t_start = time.time()
    OUTD.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    D, FULL = build()
    T, paths = m1_pass(D)
    D = D.merge(T, on=["inst", "date"], how="left")
    assert D.date.max() <= END
    D.drop(columns=[c for c in D.columns if c.startswith("up")], errors="ignore").to_parquet(OUTD / "rows.parquet", index=False)
    print("built", D.shape, round(time.time() - t_start), "s", flush=True)

    bs = LR.Boot(D.date)
    cells = []      # every cell tested

    def cell(family, view, h, group, mask=None, boot=None, extra=None):
        dt, x = ic_terms(D, view, h if isinstance(h, str) else f"f{h}", mask)
        if dt is None:
            return None
        reps = boot_reps(bs, dt, x) if boot is None else boot.reps(dt, x)
        s = summarise(float(np.mean(x)), reps)
        s.update({"family": family, "view": view, "h": h, "group": group, "n": int(len(x))})
        if extra:
            s.update(extra)
        cells.append(s)
        return s

    # 1. IC by view x horizon x {pooled, class, instrument, year}
    S = {"pooled": {}, "class": {}, "inst": {}, "year": {}, "tod": {}, "regime": {}, "terc": {}, "diff": {}}
    for v in VIEWS:
        for h in HZ:
            S["pooled"][f"{v}|{h}"] = cell("pooled", v, h, "all")
            for c in ["FX majors", "FX crosses", "metals", "indices"]:
                r = cell("class", v, h, c, (D.cls == c).to_numpy())
                if r:
                    S["class"][f"{v}|{h}|{c}"] = r
            for s in sorted(D.inst.unique()):
                r = cell("inst", v, h, s, (D.inst == s).to_numpy())
                if r:
                    S["inst"][f"{v}|{h}|{s}"] = r
            for y in YEARS:
                r = cell("year", v, h, str(y), (D.year == y).to_numpy())
                if r:
                    S["year"][f"{v}|{h}|{y}"] = r
    print("ic sweep", len(cells), round(time.time() - t_start), "s", flush=True)

    # 2. time of day
    for v in VIEWS:
        for nm, _, _ in TOD:
            S["tod"][f"{v}|{nm}"] = cell("tod", v, nm, nm)

    # 3. the conditional question: regime (C.OG L05) and sigma terciles
    reg = D.regime.to_numpy()
    eps, lens = 0, []
    for s, g in D.groupby("inst"):
        t = (g.regime == "turbulent").to_numpy().astype(int)
        st = np.flatnonzero(np.diff(np.r_[0, t]) == 1)
        en = np.flatnonzero(np.diff(np.r_[t, 0]) == -1)
        eps += len(st)
        lens += list(en - st + 1)
    blk = float(np.median(lens)) if lens else 20.0
    ep_info = {"episodes": eps, "median_len": R(blk, 1), "turb_share": R(float((reg == "turbulent").mean()), 3),
               "lens_p10_p90": [R(np.percentile(lens, 10), 0), R(np.percentile(lens, 90), 0)] if lens else None}
    # distinct calendar episodes (any instrument turbulent), the honest effective sample
    anyt = D.assign(t=(D.regime == "turbulent")).groupby("date").t.mean().sort_index()
    share = anyt.to_numpy()
    on = share >= 0.25
    ep_info["market_episodes_25pct"] = int((np.diff(np.r_[0, on.astype(int)]) == 1).sum())
    print("regime", ep_info, flush=True)
    bsr = BootL(D.date, max(blk, 5))
    for v in VIEWS:
        for h in HZ:
            a = cell("regime", v, h, "calm", reg == "calm", boot=bsr)
            b = cell("regime", v, h, "turbulent", reg == "turbulent", boot=bsr)
            S["regime"][f"{v}|{h}"] = [a, b]
            for t in ["low", "mid", "high"]:
                S["terc"][f"{v}|{h}|{t}"] = cell("terc", v, h, t, (D.vstate == t).to_numpy())
            # differences turbulent - calm, high - low (regime-length blocks), with label-shift placebo
            for nm, m1_, m2_, bt in (("turb-calm", reg == "turbulent", reg == "calm", bsr),
                                     ("high-low", (D.vstate == "high").to_numpy(), (D.vstate == "low").to_numpy(), bsr)):
                d1, x1 = ic_terms(D, v, f"f{h}", m1_)
                d2, x2 = ic_terms(D, v, f"f{h}", m2_)
                if d1 is None or d2 is None:
                    continue
                rep = bt.reps(d1, x1) - bt.reps(d2, x2)
                est = float(np.mean(x1) - np.mean(x2))
                s_ = summarise(est, rep)                  # percentile interval and percentile-bootstrap p of the difference
                # placebo: shift the state labels within each instrument by a random 1-3 years (keeps episode shape)
                lab = D[["inst"]].copy()
                lab["a"], lab["b"] = m1_, m2_
                pl = []
                for _ in range(40):
                    off = int(rng.integers(250, 750))
                    sa = lab.groupby("inst").a.transform(lambda z: np.roll(z.to_numpy(), off)).to_numpy().astype(bool)
                    sb = lab.groupby("inst").b.transform(lambda z: np.roll(z.to_numpy(), off)).to_numpy().astype(bool)
                    e1, y1 = ic_terms(D, v, f"f{h}", sa)
                    e2, y2 = ic_terms(D, v, f"f{h}", sb)
                    if e1 is not None and e2 is not None:
                        pl.append(float(np.mean(y1) - np.mean(y2)))
                s_.update({"family": "cond", "view": v, "h": h, "group": nm, "n": int(len(x1) + len(x2)),
                           "placebo_p05": R(np.percentile(pl, 5)), "placebo_p95": R(np.percentile(pl, 95))})
                cells.append(s_)
                S["diff"][f"{v}|{h}|{nm}"] = s_
    print("conditional", len(cells), round(time.time() - t_start), "s", flush=True)

    # 4. shifted-view placebo on the pooled IC (view moved 1-3 years within instrument, same offset everywhere)
    placebo = {}
    for v in VIEWS:
        for h in HZ:
            vals = []
            for _ in range(60):
                off = int(rng.integers(250, 750))
                D["_pv"] = D.groupby("inst")[v].transform(lambda z: np.roll(z.to_numpy(), off))
                dt, x = ic_terms(D, "_pv", f"f{h}")
                vals.append(float(np.mean(x)))
            placebo[f"{v}|{h}"] = [R(np.percentile(vals, 5)), R(np.mean(vals)), R(np.percentile(vals, 95))]
    D.drop(columns="_pv", inplace=True)
    print("placebo", round(time.time() - t_start), "s", flush=True)

    # 5. +1 lag and plateau checks (counted as cells)
    for v in VIEWS:
        for h in HZ:
            S.setdefault("lag", {})[f"{v}|{h}"] = cell("lag", f"{v}_lag", h, "all", extra={"view": v})
    for k in MOM_K:
        for h in [5, 20]:
            S.setdefault("momk", {})[f"{k}|{h}"] = cell("plateau_k", f"momk{k}", h, "all", extra={"view": f"mom k={k}"})
    for v in ["combo", "carry", "mom12"]:
        for h in HZ_ALL:
            S.setdefault("hz", {})[f"{v}|{h}"] = (S["pooled"].get(f"{v}|{h}") if h in HZ else
                                                  cell("plateau_h", v, h, "all"))

    # 6. bid/ask races: combo side vs anti side vs always long vs random side (stop 0.5 sigma, targets sweep)
    rc = D[np.isfinite(D.combo) & (D.combo != 0) & np.isfinite(D["L1.0"])].copy()
    rnd = np.random.default_rng(SEED).random(len(rc)) < 0.5
    race = {}
    for k in TGTS:
        L, Sx = rc[f"L{k}"].to_numpy(), rc[f"S{k}"].to_numpy()
        sides = {"combo": np.where(rc.combo > 0, L, Sx), "anti": np.where(rc.combo > 0, Sx, L),
                 "long": L, "random": np.where(rnd, L, Sx)}
        for nm, x in sides.items():
            m = boot_reps(bs, rc.date.to_numpy(), x)
            g = boot_reps(bs, rc.date.to_numpy(), x + rc.spreadR.to_numpy())
            race[f"{nm}|{k}"] = {"net": summarise(float(np.mean(x)), m), "gross": summarise(float(np.mean(x + rc.spreadR)), g)}
        dd = sides["combo"] - sides["random"]
        s_ = summarise(float(np.mean(dd)), boot_reps(bs, rc.date.to_numpy(), dd))
        s_.update({"family": "race", "view": "combo-random", "h": f"T{k}", "group": "all", "n": int(len(dd))})
        cells.append(s_)
        race[f"diff|{k}"] = s_
    race_n = int(len(rc))
    race_excl = int((np.isfinite(D.combo) & (D.combo != 0)).sum() - len(rc))

    # 7. breadth
    piv = {}
    for v in BASE_VIEWS:
        for s, g in D.groupby("inst"):
            x = np.sign(g[v].to_numpy()) * g.z1.to_numpy()
            if np.isfinite(x).sum() > 400:
                piv[f"{v}|{s}"] = pd.Series(x, index=g.date.to_numpy())
    Mv = pd.DataFrame(piv).sort_index().to_numpy()
    Mc = pd.DataFrame({s: pd.Series(np.sign(g.combo.to_numpy()) * g.z1.to_numpy(), index=g.date.to_numpy())
                       for s, g in D.groupby("inst")}).sort_index().to_numpy()
    Mr = pd.DataFrame({s: pd.Series(g.z1.to_numpy(), index=g.date.to_numpy()) for s, g in D.groupby("inst")}).sort_index().to_numpy()
    BR = {"view book": breadth(Mv), "view book shuffled": breadth(shuffled(Mv, rng)),
          "combo, 34 instruments": breadth(Mc), "raw returns, 34 instruments": breadth(Mr)}
    core = [c for c in piv if c.split("|")[1] in MAJ + ["GOLD", "NQ", "SPX500"]]
    BR["view book, stage-2 10 instruments"] = breadth(pd.DataFrame({c: piv[c] for c in core}).sort_index().to_numpy())
    print("breadth", {k: (v["K"], v["N_PR"], v["N_ent"], v["N_var"], v["above_mp"]) for k, v in BR.items()}, flush=True)

    # 8. power: IC needed at our breadth and span vs IC seen
    Tn = D.groupby("inst").size().median()
    power = {}
    for h in [1, 2, 5, 10, 20]:
        c = S["hz"].get(f"combo|{h}") or S["pooled"].get(f"combo|{h}")
        ca = S["hz"].get(f"carry|{h}") or S["pooled"].get(f"carry|{h}")
        power[h] = {"needed_boot": R(2.8 * c["se"]), "needed_one": R(2.8 / np.sqrt(Tn / h)),
                    "needed_book_formula": R(2.8 / np.sqrt(BR["combo, 34 instruments"]["N_PR"] * Tn / h)),
                    "combo": c["ic"], "carry": ca["ic"]}

    # ------------------------------------------------------------------ random-walk null, then multiple testing
    from scipy.stats import norm
    RWN = rw_null(D, FULL, np.random.default_rng(SEED))
    for c in cells:
        nk = null_key(c)
        nl = RWN.get(nk) if nk else None
        c["rw_null"] = nl
        c["p_raw"] = c["p"]
        mu0 = nl[1] if nl and nl[1] is not None else 0.0
        c["ic_adj"] = R(c["ic"] - mu0)
        c["p"] = R(max(2 * norm.sf(abs(c["ic"] - mu0) / max(c["se"], 1e-6)), 1.0 / B), 4)
    for h in power:
        for v in ("combo", "carry"):
            c = S["hz"].get(f"{v}|{h}") or S["pooled"].get(f"{v}|{h}")
            power[h][f"{v}_adj"] = R(abs(c["ic_adj"]))
            power[h][f"{v}_null"] = c["rw_null"][1]
    bh_raw = int(bh(np.array([c["p_raw"] for c in cells], float), 0.10).sum())
    ps = np.array([c["p"] for c in cells], float)
    passed = bh(ps, 0.10)
    for c, p_ in zip(cells, passed):
        c["bh"] = bool(p_)
    n_cells, k_pass = len(cells), int(passed.sum())
    raw05 = int((ps < 0.05).sum())
    print("bh against zero (raw)", bh_raw, flush=True)
    print("cells", n_cells, "bh pass", k_pass, "raw<0.05", raw05, "expected", 0.05 * n_cells, flush=True)
    pd.DataFrame(cells).to_csv(OUTD / "cells.csv", index=False)

    summary = {"S": S, "rw_null": RWN, "bh_raw_vs_zero": bh_raw, "placebo": placebo, "race": race, "race_n": race_n, "race_excluded": race_excl, "breadth": BR,
               "power": power, "regime": ep_info, "cells": n_cells, "bh_pass": k_pass, "raw_p05": raw05,
               "bh_cells": [c for c in cells if c["bh"]], "rows": int(len(D)), "insts": int(D.inst.nunique()),
               "coverage": {v: R(float(np.isfinite(D[v]).mean()), 3) for v in VIEWS}}
    (OUTD / "summary.json").write_text(json.dumps(summary, indent=1, default=str), encoding="utf-8")

    import pickle
    (OUTD / "paths.pkl").write_bytes(pickle.dumps(paths))
    write_out(D, summary, paths, Tn, raw05, t_start)


def write_out(D, summary, paths, Tn, raw05, t_start):
    S, placebo, race, BR, ep_info = summary["S"], summary["placebo"], summary["race"], summary["breadth"], summary["regime"]
    power = {int(k): v for k, v in summary["power"].items()}
    n_cells, k_pass, race_n, race_excl = summary["cells"], summary["bh_pass"], summary["race_n"], summary["race_excluded"]
    charts = make_charts(D, S, placebo, race, race_n, race_excl, BR, power, ep_info, paths, n_cells, k_pass, Tn)
    holds = make_holds(S, placebo, race, BR, power, ep_info)
    out = {"id": "views-wide", "window": [START, END], "cells_tested": n_cells, "cells_pass_bh": k_pass,
           "cells_expected_by_chance": R(0.05 * n_cells, 1),
           "chance_note": f"Expected by chance = 5% of {n_cells} cells at raw p<0.05 ({raw05} seen). Under a global null BH at q=0.10 passes 0 cells with 90% probability.",
           "intro": INTRO_LINES, "holds": holds, "charts": charts, "rerun_seconds": round(time.time() - t_start) if t_start else json.loads(OUTJ.read_text(encoding="utf-8")).get("rerun_seconds")}
    OUTJ.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print("written", OUTJ, OUTJ.stat().st_size)


# ------------------------------------------------------------------ charts
def make_charts(D, S, placebo, race, race_n, race_excl, BR, power, ep, paths, n_cells, k_pass, Tn):
    ch = []
    P = S["pooled"]
    # 1 pooled IC by view x horizon with placebo
    rows = []
    for v in VIEWS:
        for h in HZ:
            c = P[f"{v}|{h}"]
            pl = placebo[f"{v}|{h}"]
            rows.append({"label": f"{v} h={h}{' *BH' if c['bh'] else ''}", "value": c["ic"], "lo": c["lo"], "hi": c["hi"]})
        rows.append({"label": f"{v} h=20 shifted-view placebo 90%", "value": placebo[f"{v}|20"][1], "lo": placebo[f"{v}|20"][0], "hi": placebo[f"{v}|20"][2]})
        nl = P[f"{v}|20"]["rw_null"]
        rows.append({"label": f"{v} h=20 random-walk null 90%", "value": nl[1], "lo": nl[0], "hi": nl[2]})
    ch.append({"type": "bars", "title": "Rank IC of each view with the next 1, 5 and 20 sessions (34 instruments pooled)", "unit": "Spearman IC", "ref": 0,
               "note": "IC = rank correlation of the view at the open with the return over the next h sessions, per instrument, pooled. 95% date-block bootstrap. "
                       "Benchmarks: the shifted-view placebo (view moved 1-3 years, 60 draws) and the random-walk null (our own vol path with the returns shuffled in time, "
                       "views rebuilt, 30 draws). The random-walk null sits BELOW 0 for momentum and the combo: a price-built view against overlapping future returns "
                       "is biased negative in a finite sample, so judge each bar against its random-walk row, not against 0. '*BH' = passes BH at q=0.10 against that null.", "rows": rows})
    # 2 class
    rows = []
    for v in VIEWS:
        for c in ["FX majors", "FX crosses", "metals", "indices"]:
            vals = [S["class"].get(f"{v}|{h}|{c}") for h in HZ]
            if all(x is None for x in vals):
                continue
            rows.append({"label": f"{v} | {c}", "values": [x["ic"] if x else 0 for x in vals]})
    ch.append({"type": "groups", "title": "IC by instrument class", "names": ["h=1", "h=5", "h=20"], "unit": "Spearman IC",
               "note": "Same IC, pooled within each class (7 USD majors, 21 crosses, gold, 6 indices). Benchmark: 0; the 95% half-width is about 0.02 at h=1 for the majors, "
                       "0.05 for gold alone at h=1 and 0.1-0.15 at h=20 (see cells.csv). Look for a sign that holds in every class; carry is undefined for gold and indices (0).", "rows": rows})
    # 3 per instrument, combo h=20 + carry
    rows = []
    for s in sorted(D.inst.unique(), key=lambda z: (cls_of(z), z)):
        c = S["inst"].get(f"combo|20|{s}")
        if c:
            rows.append({"label": f"{s} ({cls_of(s)})", "value": c["ic"], "lo": c["lo"], "hi": c["hi"]})
    pos = sum(1 for r in rows if r["value"] > 0)
    ch.append({"type": "bars", "title": f"Combo IC with the next 20 sessions, per instrument ({pos} of {len(rows)} positive)", "unit": "Spearman IC", "ref": 0,
               "note": f"95% date-block bootstrap per instrument; each holds only about {int(Tn / 20)} independent 20-session windows, so one-instrument intervals are about +/-0.2. "
                       f"Benchmark: 0, and the sign count: {pos} of {len(rows)} positive against 17 expected from coin flips (instruments are correlated, so this is not a clean binomial).", "rows": rows})
    # 5 year by year
    ser = []
    for v in ["mom3", "mom12", "carry", "combo"]:
        ser.append({"name": v, "points": [[y, S["year"][f"{v}|5|{y}"]["ic_adj"]] for y in YEARS if S["year"].get(f"{v}|5|{y}")]})
    ch.append({"type": "lines", "title": "Year by year: IC with the next 5 sessions, minus the random-walk null", "unit": "Spearman IC (bias-adjusted)", "xlabel": "year",
               "note": "Each point pools all instruments for one year and subtracts the random-walk null mean for the same year (one-year momentum ICs are pulled "
                       "below 0 by finite-sample bias alone, more at longer horizons). Benchmark: 0 after adjustment; one year holds about 50 independent weeks, so the 95% band is about +/-0.06. "
                       "A stable view keeps one sign; mom12 starts in March 2017 (needs 252 sessions of history).", "series": ser})
    # 6 time of day
    rows = []
    for nm, _, _ in TOD:
        rows.append({"label": nm, "values": [(S["tod"].get(f"{v}|{nm}") or {"ic": 0})["ic"] for v in ["combo", "carry", "mom12"]]})
    ch.append({"type": "groups", "title": "Time of day: IC of the open's view with each London-time bucket's return", "names": ["combo", "carry", "mom12"], "unit": "Spearman IC",
               "note": "Bucket return = M1 mid from the first to the last bar inside the bucket (Europe/London clock), in daily sigma. Benchmark: 0; each bucket has about 50,000 "
                       "instrument-days, so the 95% band is about +/-0.015. A view that pays intraday should show the same sign in every bucket.", "rows": rows})
    # 7 regime
    rows = []
    for v in VIEWS:
        a, b = S["regime"][f"{v}|5"]
        if a:
            rows.append({"label": f"{v} | calm", "value": a["ic"], "lo": a["lo"], "hi": a["hi"]})
        if b:
            rows.append({"label": f"{v} | turbulent", "value": b["ic"], "lo": b["lo"], "hi": b["hi"]})
            nl = b["rw_null"]
            rows.append({"label": f"{v} | turbulent, random-walk null 90%", "value": nl[1], "lo": nl[0], "hi": nl[2]})
    ch.append({"type": "bars", "title": "Accuracy by vol state (C.OG Lesson 05 regime): IC with the next 5 sessions", "unit": "Spearman IC", "ref": 0,
               "note": f"Turbulent = rolling 63-session vol above 1.25x its own past median for 21+ sessions. {ep['episodes']} turbulent episodes across instruments "
                       f"(median {ep['median_len']} sessions, {int(100 * ep['turb_share'])}% of instrument-days), but only {ep['market_episodes_25pct']} market-wide episodes "
                       f"(a quarter of instruments at once): that, not the day count, is the sample. Bootstrap in blocks of {ep['median_len']} sessions. Benchmark: the calm row and the "
                       "random-walk null for the turbulent cell (short, clustered samples pull price-built views below 0 with no edge at all).", "rows": rows})
    # 8 differences with placebo
    rows = []
    for v in ["mom3", "mom12", "carry", "surprise", "combo"]:
        for nm in ["turb-calm", "high-low"]:
            c = S["diff"].get(f"{v}|5|{nm}")
            if c:
                rows.append({"label": f"{v} {nm}{' *BH' if c.get('bh') else ''}", "value": c["ic"], "lo": c["lo"], "hi": c["hi"]})
                rows.append({"label": f"{v} {nm} label-shift placebo 90%", "value": 0, "lo": c["placebo_p05"], "hi": c["placebo_p95"]})
                nl = c["rw_null"]
                rows.append({"label": f"{v} {nm} random-walk null 90%", "value": nl[1], "lo": nl[0], "hi": nl[2]})
    ch.append({"type": "bars", "title": "Does view accuracy change with vol? IC difference, next 5 sessions", "unit": "IC difference", "ref": 0,
               "note": "turb-calm = IC in turbulent minus calm (Lesson 05 regime); high-low = IC in the top sigma tercile minus the bottom. Bars: 95% bootstrap in regime-length blocks. "
                       "Benchmarks: the label-shift placebo (state labels shifted 1-3 years within each instrument, 40 draws: keeps how long states last, breaks their timing) "
                       "and the random-walk null (no view has any edge; shows the gap finite-sample bias alone makes). '*BH' = passes BH against the random-walk null.", "rows": rows})
    # 9 terciles
    rows = []
    for v in VIEWS:
        rows.append({"label": v, "values": [(S["terc"].get(f"{v}|5|{t}") or {"ic_adj": 0})["ic_adj"] for t in ["low", "mid", "high"]]})
    ch.append({"type": "groups", "title": "IC by sigma tercile, next 5 sessions, minus the random-walk null", "names": ["low sigma", "mid sigma", "high sigma"], "unit": "Spearman IC",
               "note": "Sigma tercile = today's HAR sigma ranked against its own previous 250 sessions. Each value is the IC minus the random-walk null mean for that tercile "
                       "(the high tercile clusters in 2020 and 2022, so its null is the most negative). Benchmark: 0 and the other terciles; one tercile has about "
                       "18,000 instrument-days but only ~100 independent weeks of the market, so the 95% band is about +/-0.04.", "rows": rows})
    # 10 eigen spectrum
    ser = [{"name": "view book (K=%d)" % BR["view book"]["K"], "points": [[i + 1, x] for i, x in enumerate(BR["view book"]["lam"])]},
           {"name": "same, time-shuffled", "points": [[i + 1, x] for i, x in enumerate(BR["view book shuffled"]["lam"])]},
           {"name": "Marchenko-Pastur edge", "points": [[1, BR["view book"]["mp_edge"]], [20, BR["view book"]["mp_edge"]]]},
           {"name": "raw returns, 34 instruments", "points": [[i + 1, x] for i, x in enumerate(BR["raw returns, 34 instruments"]["lam"])]}]
    ch.append({"type": "lines", "title": "Eigenvalues of the view-return correlation matrix against the random-matrix band", "unit": "eigenvalue", "xlabel": "rank",
               "note": f"Daily view-signed returns, one column per (view, instrument). {BR['view book']['above_mp']} eigenvalues sit above the Marchenko-Pastur edge "
                       f"{BR['view book']['mp_edge']} (pure noise would give 0; the time-shuffled copy gives {BR['view book shuffled']['above_mp']}). "
                       "Benchmark: the shuffled spectrum and the MP edge; eigenvalues above it are common factors (mostly the dollar).", "series": ser})
    # 11 breadth numbers
    rows = []
    for k in ["view book", "view book, stage-2 10 instruments", "combo, 34 instruments", "raw returns, 34 instruments", "view book shuffled"]:
        b = BR[k]
        rows.append({"label": f"{k} (K={b['K']})", "values": [b["N_PR"], b["N_ent"], b["N_var"]]})
    ch.append({"type": "groups", "title": "Effective breadth of the view book: how many independent bets?", "names": ["N_PR", "N_ent", "N_var (90%)"], "unit": "effective bets",
               "note": "N_PR = participation ratio, N_ent = exp(eigenvalue entropy), N_var = eigenvalues needed for 90% of the variance. Benchmark: K (the nominal count) "
                       "and the time-shuffled book, which is what K unrelated bets would give.", "rows": rows})
    # 12 power
    hs = sorted(power)
    ser = [{"name": "IC needed (pooled, bootstrap)", "points": [[h, power[h]["needed_boot"]] for h in hs]},
           {"name": "IC needed (one instrument)", "points": [[h, power[h]["needed_one"]] for h in hs]},
           {"name": "|combo IC - random-walk null|", "points": [[h, power[h]["combo_adj"]] for h in hs]},
           {"name": "|carry IC - random-walk null|", "points": [[h, power[h]["carry_adj"]] for h in hs]}]
    ch.append({"type": "lines", "title": "Power: the IC we would need to detect, against the IC we see", "unit": "Spearman IC", "xlabel": "horizon (sessions)",
               "note": f"Needed = 2.8 x standard error (80% power, 5% two-sided). Pooled uses the date-block bootstrap SE of the 34-instrument IC, so cross-instrument "
                       f"correlation is counted; one instrument = 2.8/sqrt({int(Tn)}/h). Seen = distance of the pooled IC from its random-walk null, either sign. Benchmark: a seen line below the 'needed' line cannot be told from no edge in this window.",
               "series": ser})
    # 13 +1 lag
    rows = []
    for v in VIEWS:
        for h in [5, 20]:
            a, b = S["pooled"][f"{v}|{h}"], S["lag"][f"{v}|{h}"]
            rows.append({"label": f"{v} h={h}", "values": [a["ic"], b["ic"], a["rw_null"][1]]})
    ch.append({"type": "groups", "title": "Lesson 01 check: every view delayed by one more session", "names": ["as built", "+1 session lag", "random-walk null"], "unit": "Spearman IC",
               "note": "Same pooled IC with the view taken one session earlier. Slow views (momentum, carry) should barely change; an effect that vanishes with a 1-day delay "
                       "would be an alignment artefact. Benchmark: the as-built bar, and the random-walk null mean (what no edge looks like here).", "rows": rows})
    # 14 plateau: lookback and horizon
    ser = [{"name": "mom lookback k, h=5", "points": [[k, S["momk"][f"{k}|5"]["ic"]] for k in MOM_K]},
           {"name": "mom lookback k, h=20", "points": [[k, S["momk"][f"{k}|20"]["ic"]] for k in MOM_K]},
           {"name": "random-walk null, h=5", "points": [[k, S["momk"][f"{k}|5"]["rw_null"][1]] for k in MOM_K]},
           {"name": "random-walk null, h=20", "points": [[k, S["momk"][f"{k}|20"]["rw_null"][1]] for k in MOM_K]}]
    ch.append({"type": "lines", "title": "Plateau check 1: momentum IC across lookbacks", "unit": "Spearman IC", "xlabel": "lookback (sessions)",
               "note": "Pooled IC of log(open_t/open_t-k)/(sigma sqrt k) for k from 10 to 252. A real effect forms a plateau across neighbours; a lone peak at one k is a "
                       "search artefact. Benchmark: the random-walk null at each k (driftless prices with our vol path, views rebuilt), not 0.", "series": ser})
    ser = [{"name": v, "points": [[h, S["hz"][f"{v}|{h}"]["ic"]] for h in HZ_ALL if S["hz"].get(f"{v}|{h}")]} for v in ["combo", "carry", "mom12"]]
    ser.append({"name": "combo random-walk null", "points": [[h, S["hz"][f"combo|{h}"]["rw_null"][1]] for h in HZ_ALL]})
    ch.append({"type": "lines", "title": "Plateau check 2: IC across horizons 1-40 sessions", "unit": "Spearman IC", "xlabel": "horizon (sessions)",
               "note": "Pooled IC at each horizon. Benchmark: the combo's random-walk null mean (no edge); the IC needed to detect is in the power chart. Overlapping windows: neighbouring "
                       "horizons share most of their data, so a smooth rise is expected even from noise.", "series": ser})
    # 15 races on bid/ask
    rows = []
    for k in TGTS:
        for nm in ["combo", "random", "anti"]:
            for gn in ["net", "gross"]:
                if nm != "combo" and gn == "gross":
                    continue
                c = race[f"{nm}|{k}"][gn]
                rows.append({"label": f"target {k}s | {nm} side {gn}", "value": c["ic"], "lo": c["lo"], "hi": c["hi"]})
    ch.append({"type": "bars", "title": "Picking the side by the combo: open-entry race, stop 0.5 sigma, on the bid/ask path", "unit": "R per trade", "ref": 0,
               "note": f"Entry at the first M1 bar of the London session (buy at ask, sell at bid), stop 0.5 sigma, target 0.5-1.5 sigma, touches on the bid/ask path, flat at 21:00. "
                       f"{race_n:,} instrument-days; {race_excl} combo days dropped for missing M1. Gross = net + one spread. Benchmark: the random-side and anti-combo rows "
                       "(same days, same exits). 95% date-block bootstrap.", "rows": rows})
    # 16 examples
    ex = []
    pick = D[np.isfinite(D.combo) & (D.combo.abs() >= 0.99) & D.inst.isin(["EURUSD", "USDJPY", "AUDUSD", "GOLD", "NQ"]) & np.isfinite(D["L1.0"])]
    pick = pick.sample(n=min(6, len(pick)), random_state=SEED).sort_values("date")
    for _, r in pick.iterrows():
        if (r.inst, r.date) not in paths:
            continue
        m, y = paths[(r.inst, r.date)]
        sgn = 1 if r.combo > 0 else -1
        ex.append({"inst": r.inst, "date": r.date, "side": "long" if sgn > 0 else "short",
                   "r": R(r["L1.0"] if sgn > 0 else r["S1.0"], 2), "unit": "R (1R = the 0.5 sigma stop, so the target is +2R; net)",
                   "stop": -0.5, "target": 1.0, "path": [[int(a), R(sgn * b, 3)] for a, b in zip(m, y)]})
    ch.append({"type": "trades", "title": "Real days where every view agreed: open entry in the combo's direction", "unit": "sigma from the open, view-signed",
               "note": "Six seeded random days with the combo fully long or short. Path = M1 mid from the London open in sigma, flipped so up = the view's way; "
                       "stop -0.5 sigma, target +1 sigma, r measured on the bid/ask path net of the spread. Benchmark: the random-side row of the race chart, about -0.1R.",
               "trades": ex})
    return ch


def make_holds(S, placebo, race, BR, power, ep):
    P = S["pooled"]
    out = []
    where = {"combo": "34 instruments pooled; ~0 in every class (too noisy to tell)",
             "carry": "local to FX crosses and 2021-22 (reverses there); 0.00 in USD majors",
             "surprise": "positive in 24/34 instruments, but local to 2022 and gold",
             "mom3": "reverses, mostly FX crosses and the high-sigma tercile; plateau k=21-126"}
    for v in ["combo", "carry", "surprise", "mom3"]:
        c = P[f"{v}|20"]
        out.append({"effect": f"{v} IC with the next 20 sessions", "where": where[v],
                    "size": f"{c['ic']:+.3f} [{c['lo']:+.3f}, {c['hi']:+.3f}]; minus the random-walk null {c['ic_adj']:+.3f} (p {c['p']}, fails BH)",
                    "benchmark": f"random-walk null mean {c['rw_null'][1]:+.3f} (90% {c['rw_null'][0]:+.3f}..{c['rw_null'][2]:+.3f}); IC needed {2.8 * c['se']:.3f}"})
    for v in ["combo", "carry", "mom3"]:
        d = S["diff"].get(f"{v}|5|turb-calm")
        if d:
            out.append({"effect": f"{v}: IC turbulent minus calm (next 5 sessions)", "where": f"Lesson 05 regime, {ep['market_episodes_25pct']} market-wide episodes",
                        "size": f"{d['ic']:+.3f} [{d['lo']:+.3f}, {d['hi']:+.3f}]; minus the random-walk null {d['ic_adj']:+.3f}",
                        "benchmark": f"label-shift placebo 90% {d['placebo_p05']:+.3f}..{d['placebo_p95']:+.3f}; random-walk null mean {d['rw_null'][1]:+.3f}"})
    b = BR["view book"]
    out.append({"effect": "effective breadth of the daily view book", "where": f"{b['K']} (view, instrument) columns",
                "size": f"N_PR {b['N_PR']}, N_ent {b['N_ent']}, N_var {b['N_var']}; {b['above_mp']} eigenvalues above MP",
                "benchmark": f"time-shuffled: N_PR {BR['view book shuffled']['N_PR']}; raw returns N_PR {BR['raw returns, 34 instruments']['N_PR']}"})
    r = race["diff|1.0"]
    out.append({"effect": "combo side minus random side, open race stop 0.5 / target 1.0 sigma", "where": "all instruments, bid/ask path",
                "size": f"{r['ic']:+.3f} R [{r['lo']:+.3f}, {r['hi']:+.3f}]; combo side net {race['combo|1.0']['net']['ic']:+.3f} R",
                "benchmark": f"random side net {race['random|1.0']['net']['ic']:+.3f} R"})
    return out


INTRO_LINES = [  # written after reading the numbers
 "Nothing passes. 993 cells were tested across 34 instruments, 3 horizons, classes, years, regimes, terciles and time of day. Against the right benchmark (a random walk with our own vol path, views rebuilt), 0 pass Benjamini-Hochberg at q=0.10. 75 sit at raw p<0.05, against about 50 expected by chance, and the cells are heavily correlated.",
 "The benchmark matters more than any effect. Measured against 0, 11 cells passed, all of them momentum or the combo, negative, in single years or the high-sigma tercile. A driftless random walk produces the same numbers: the one-year momentum IC at 20 sessions is about -0.20 from finite-sample bias alone. That was an artefact, not a reversal.",
 "Combo: 0.00 to +0.01 after the bias adjustment at every horizon from 1 to 40 sessions, in every class. The stage 2 +0.016 sigma a session was the indices' upward drift (always-long earned the same). It is not timing.",
 "Macro-surprise momentum is the only view that is positive almost everywhere. It runs +0.05 at 20 sessions (p 0.03 alone), 24 of 34 instruments are positive after adjustment, and gold is +0.16. But the pooled result is local to 2022 (+0.11, other years about 0), so it is too noisy to tell.",
 "Carry reverses in the FX crosses (IC -0.08 at 20 sessions) and in 2021-22 (-0.15, -0.23), when rate hikes upended the differentials. In the USD majors it is 0.00. Nothing here supports the published carry premium at a daily grain.",
 "Accuracy by vol state: after the bias adjustment, no view reads differently in turbulent versus calm (Lesson 05 regime, 113 per-instrument episodes but only 4 market-wide). 3-month momentum reverses harder in the top sigma tercile (adjusted high-low -0.08, p 0.006), on a plateau across lookbacks of 21-126, but fails BH. Surprise is +0.06 in calm and -0.06 in turbulent, too noisy to tell.",
 "Breadth is real: 163 (view, instrument) bets act like about 51 (N_PR; N_ent 82), and the combo across 34 instruments like 18, while the raw returns act like only 6.5. 27 eigenvalues sit above the Marchenko-Pastur edge, against 1 when shuffled. At an IC of 0.02, IR ~ IC sqrt(breadth) would be about 0.3, but no IC here is distinguishable from 0.",
 "Power: detecting an effect at 20 sessions needs a pooled IC of 0.08 (0.31 for one instrument). What we see is 0.01 for the combo and 0.06 for carry, against the sign we wanted. A published-size view (IC about 0.02-0.05 a month) cannot be confirmed or ruled out with 6 years of data.",
 "As a trade, taking the combo's side at the open (stop 0.5 sigma, on the bid/ask path) beats a random side by +0.008 R [-0.013, +0.027]. Every side loses about 0.09 R net; gross is about +0.01 R. The view is not an entry, a stop or a sizing input on this evidence.",
]

def charts_only():
    """Rebuild the JSON (charts, intro, holds) from the cached intermediates, without recomputing."""
    import pickle
    t0 = time.time()
    D = pd.read_parquet(OUTD / "rows.parquet")
    summary = json.loads((OUTD / "summary.json").read_text(encoding="utf-8"))
    paths = pickle.loads((OUTD / "paths.pkl").read_bytes())
    write_out(D, summary, paths, D.groupby("inst").size().median(), summary["raw_p05"], None)


if __name__ == "__main__":
    charts_only() if "--charts" in sys.argv else main()
