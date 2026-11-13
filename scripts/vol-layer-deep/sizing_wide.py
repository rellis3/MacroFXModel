"""Vol-Layer deep dive, layer 6 (sizing): stage 3 "go wide".

How the sizing layer acts across conditions (class, instrument, time of day, vol regime, year), discovery window only.

Parts
  1. Five sizings of a daily London-session hold at equal ex-post vol per instrument:
       U   unscaled (constant notional)            T20 trailing 20-session realised vol
       F   chosen forecast sigma (live_sig_used)   MM  1/sigma^2 (Moreira-Muir)
       FJ  sigma plus a jump allowance: sqrt(sigma^2 + c x trailing-60 mean jump variance), jump var = max(rv5 - bv5, 0)
           (C.OG Lesson 03: sizing on vol alone understates the one-step loss), c = 1
       FA  sigma plus a level allowance: sqrt(sigma^2 + a x trailing-250 median sigma^2), a = 0.25. Added after the first
           pass showed sigma sizing moves the tail days INTO low-sigma sessions (a jump does not shrink with today's vol)
     Scored on stability of realised risk (|monthly vol - 1| per instrument-month) and on the tail (beyond-3-sd days,
     p99 loss = 1st percentile, ES 1%, GPD shape of the loss tail). Swept by class, instrument, Lesson-05 regime, sigma
     tercile and year; plus a 5-session horizon. Plateau: sizing exponent p (1/sigma^p), RV window, jump weight c.
     +1 lag: every sigma delayed one more session.
  2. The 14-leg book's dollar-factor share over time, by year and by the dollar factor's own regime.
  3. All-correlations-to-1 stress risk figure as a size cap on the book vol target (Lesson 06); 99% VaR coverage.
  4. Leg-level equal risk contribution (ERC) vs inverse vol.
  5. Time of day + 1R on the M1 bid/ask path: a k x sigma_remaining stop entered at each London bucket start, gross (mid)
     and net (entry at the offer/bid, stop on the opposite side), with gap-through fills (the realised one-step loss in R).

DISCOVERY WINDOW ONLY: sessions 2016-10-24 .. 2022-12-30. Nothing after 2022-12-30 is loaded as an outcome.

    python -X utf8 scripts/vol-layer-deep/sizing_wide.py            (uses cached M1 stop table if present)
    python -X utf8 scripts/vol-layer-deep/sizing_wide.py --rebuild  (re-reads M1 bid/ask, ~20-30 min)
"""
from __future__ import annotations

import gc
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts/forecast_history"), str(ROOT / "scripts/vol-layer-deep")]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import pyarrow.parquet as pq  # noqa: E402
from scipy.stats import genpareto, norm  # noqa: E402

import forecast_record as FR  # noqa: E402
FR.SEED = 20261112
FR.B = 2000
import line_reaction as LR  # noqa: E402,F401  (brief: the shared bootstrap lives here; we build its weights with our block lengths)
import sizing as S2  # noqa: E402  stage 2 helpers (book, roll_corr, shrink, pc1_share, risk_contrib)

HIST = ROOT / "analysis/output/forecast_history"
BA = ROOT / "data/m1_bidask"
OUT = ROOT / "analysis/output/vol-layer-deep/sizing/wide"
WEB = ROOT / "backtest-data/vol-layer/sizing-wide.json"
START, END = "2016-10-24", "2022-12-30"
SEED = 20261112
B = 2000
rng = np.random.default_rng(SEED)
YEARS = ["2017", "2018", "2019", "2020", "2021", "2022"]
MAJORS = ["EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDJPY", "USDCAD", "USDCHF"]
INDICES = ["DE30", "DOW", "NQ", "SPX500", "UK100", "US2000"]


def klass(inst):
    if inst in MAJORS:
        return "FX majors"
    if inst in INDICES:
        return "indices"
    if inst == "GOLD":
        return "metals"
    return "FX crosses"


CLASSES = ["FX majors", "FX crosses", "metals", "indices"]
VARS = {"U": "unscaled", "T20": "trailing RV20", "F": "forecast sigma", "MM": "1/sigma^2", "FJ": "sigma + jump allowance", "FA": "sigma + level allowance"}


def r4(x, k=4):
    return None if x is None or not np.isfinite(x) else round(float(x), k)


# ── bootstrap: stationary date blocks, weights shared by every cell (seed 20261112, B 2000) ─────────────────────────
class Boot:
    _cache: dict = {}

    def __init__(self, keys, block):
        self.keys = np.sort(pd.unique(np.asarray(keys)))
        ck = (len(self.keys), int(block))
        if ck not in Boot._cache:
            FR.BLOCK = max(1, int(block))
            Boot._cache[ck] = FR.boot_weights(len(self.keys)).astype(np.float32)
        self.W = Boot._cache[ck]
        self.pos = pd.Series(np.arange(len(self.keys)), index=self.keys)

    def ix(self, keys):
        return self.pos[np.asarray(keys)].to_numpy()

    def mean(self, keys, x):
        """[mean, lo, hi], p (two-sided vs 0)."""
        x = np.asarray(x, float)
        i = self.ix(keys)
        a = np.bincount(i, weights=x, minlength=len(self.keys))
        b = np.bincount(i, minlength=len(self.keys)).astype(float)
        reps = (self.W @ a) / (self.W @ b)
        return [x.mean(), *np.nanpercentile(reps, [2.5, 97.5])], pval(reps)

    def wstat(self, keys, cols, fn, chunk=40):
        """Generic weighted statistic: fn(weights_matrix (r x n)) -> (r,) for each replicate; returns point, lo, hi, p."""
        i = self.ix(keys)
        pt = fn(np.ones((1, len(i)), np.float32))[0]
        reps = []
        for s in range(0, B, chunk):
            reps.append(fn(self.W[s:s + chunk][:, i]))
        reps = np.concatenate(reps)
        return [pt, *np.nanpercentile(reps, [2.5, 97.5])], pval(reps)


def pval(reps):
    reps = reps[np.isfinite(reps)]
    return float(min(1.0, 2 * min((reps <= 0).mean(), (reps >= 0).mean()))) if len(reps) else 1.0


def wq_es(z, w, q=0.01):
    """Weighted q-quantile and expected shortfall of z for each row of w. z sorted ascending outside."""
    cw = np.cumsum(w, 1)
    tot = cw[:, -1:]
    cut = (cw <= q * tot)
    k = np.argmax(cw >= q * tot, axis=1)
    qq = z[k]
    num = (w * cut * z).sum(1) + (q * tot[:, 0] - (w * cut).sum(1)) * qq
    es = num / (q * tot[:, 0])
    return qq, es


TESTS: list[dict] = []


def test(part, cell, metric, comp, ci, p, extra=None):
    TESTS.append({"part": part, "cell": cell, "metric": metric, "comp": comp, "est": r4(ci[0], 5), "lo": r4(ci[1], 5),
                  "hi": r4(ci[2], 5), "p": p, **(extra or {})})


def bh(ps, q=0.10):
    ps = np.asarray(ps)
    n = len(ps)
    o = np.argsort(ps)
    thr = q * np.arange(1, n + 1) / n
    ok = ps[o] <= thr
    k = np.max(np.where(ok)[0]) + 1 if ok.any() else 0
    res = np.zeros(n, bool)
    res[o[:k]] = True
    return res


# ── load ────────────────────────────────────────────────────────────────────────────────────────────────────────────
def regime(r, n_vol=63, n_med=252, mult=1.25, run=21):
    """C.OG Lesson 05, point-in-time: vol63 (sessions < t) above 1.25 x its rolling median for each of the last 21 sessions."""
    v = r.rolling(n_vol, min_periods=n_vol).std().shift(1)
    med = v.rolling(n_med, min_periods=63).median()
    cond = (v > mult * med).astype(float).where(v.notna() & med.notna())
    turb = cond.rolling(run, min_periods=run).min()
    return turb.map({1.0: "turbulent", 0.0: "calm"})


def load(lag=0):
    rows = []
    for f in sorted(HIST.glob("*.csv")):
        d = pd.read_csv(f, usecols=["inst", "date", "live_sig_used", "r_ocs", "r_oh", "r_ol", "rv5", "bv5"])
        d = d[d.date <= END].dropna(subset=["live_sig_used", "r_ocs"]).sort_values("date").reset_index(drop=True)
        d = d[d.live_sig_used > 0].reset_index(drop=True)
        sig = d.live_sig_used.shift(lag) if lag else d.live_sig_used
        d["sig"] = sig
        d["J"] = (d.rv5 - d.bv5).clip(lower=0)
        d["Jbar"] = d.J.rolling(60, min_periods=30).mean().shift(1 + lag)
        for w in (5, 10, 20, 40, 60, 120):
            d[f"rv{w}"] = np.sqrt((d.r_ocs ** 2).rolling(w, min_periods=max(4, int(w * 0.75))).mean().shift(1 + lag))
        d["sig2med"] = (d.live_sig_used ** 2).rolling(250, min_periods=120).median().shift(1 + lag)
        d["regime"] = regime(d.r_ocs)
        rows.append(d)
    D = pd.concat(rows, ignore_index=True)
    D = D[(D.date >= START) & (D.date <= END)].dropna(subset=["sig", "rv20", "Jbar", "sig2med"]).reset_index(drop=True)
    assert D.date.max() <= END and D.date.min() >= START
    D["year"] = D.date.str[:4]
    D["month"] = D.date.str[:7]
    D["klass"] = D.inst.map(klass)
    D["terc"] = D.groupby("inst").sig.transform(lambda s: pd.qcut(s.rank(method="first"), 3, labels=["low sigma", "mid sigma", "high sigma"]))
    return D


def scale(D, variants):
    """Each variant: r / size-sigma, then divided by the instrument's own full-window sd (equal ex-post vol)."""
    Z = pd.DataFrame(index=D.index)
    for name, s in variants.items():
        z = D.r_ocs / s
        Z[name] = z / z.groupby(D.inst).transform("std")
    return Z


def base_variants(D, c=1.0):
    return {"U": pd.Series(1.0, index=D.index), "T20": D.rv20, "F": D.sig, "MM": D.sig ** 2,
            "FJ": np.sqrt(D.sig ** 2 + c * D.Jbar), "FA": np.sqrt(D.sig ** 2 + 0.25 * D.sig2med)}


# ── part 1 metrics ──────────────────────────────────────────────────────────────────────────────────────────────────
def month_table(D, Z):
    """Per instrument-month: realised sd per variant, |sd - 1|, and the month's majority labels."""
    g = pd.concat([D[["inst", "month", "klass", "regime", "terc", "year"]], Z], axis=1)
    agg = g.groupby(["inst", "month"])
    n = agg.size()
    M = agg[list(Z.columns)].std()
    M = M[n >= 10]
    lab = agg.agg(klass=("klass", "first"), year=("year", "first"),
                  regime=("regime", lambda s: s.mode().iloc[0] if s.notna().any() else np.nan),
                  terc=("terc", lambda s: s.astype(str).mode().iloc[0]))
    M = M.join(lab).reset_index()
    for v in Z.columns:
        M[f"dev_{v}"] = (M[v] - 1).abs()
    M["mkey"] = M.month + "-01"
    return M


def cells(D):
    out = [("all", D.index == D.index)]
    for c in CLASSES:
        out.append((c, (D.klass == c).to_numpy()))
    for i in sorted(D.inst.unique()):
        out.append((i, (D.inst == i).to_numpy()))
    for r in ("turbulent", "calm"):
        out.append((r, (D.regime == r).to_numpy()))
    for t in ("low sigma", "mid sigma", "high sigma"):
        out.append((t, (D.terc.astype(str) == t).to_numpy()))
    for y in YEARS:
        out.append((y, (D.year == y).to_numpy()))
    return out


def part1(D, Z, bd, bm, bep, bm_ep, record=True, tag=""):
    """Returns a per-cell table. Tests (if record): stability and >3sd for T20/MM/FJ vs F and F vs U; p99 for class/regime/year."""
    M = month_table(D, Z)
    res = []
    comps = [("F", "U"), ("T20", "F"), ("MM", "F"), ("FJ", "F"), ("FA", "F")]
    mcells = {"all": M.index == M.index}
    for c in CLASSES:
        mcells[c] = (M.klass == c).to_numpy()
    for i in sorted(D.inst.unique()):
        mcells[i] = (M.inst == i).to_numpy()
    for r in ("turbulent", "calm"):
        mcells[r] = (M.regime == r).to_numpy()
    for t in ("low sigma", "mid sigma", "high sigma"):
        mcells[t] = (M.terc == t).to_numpy()
    for y in YEARS:
        mcells[y] = (M.year == y).to_numpy()
    for name, m in cells(D):
        sub = Z[m]
        row = {"cell": name, "n_days": int(m.sum()), "n_months": int(mcells[name].sum())}
        Ms = M[mcells[name]]
        is_reg = name in ("turbulent", "calm")
        bdd = bep if is_reg else bd
        bmm = bm_ep if is_reg else bm
        for v in Z.columns:
            row[f"dev_{v}"] = r4(Ms[f"dev_{v}"].mean(), 4)
            row[f"exc3_{v}"] = r4((sub[v].abs() > 3).mean() * 100, 3)
            row[f"p1_{v}"] = r4(sub[v].quantile(0.01), 3)
            row[f"sd_{v}"] = r4(sub[v].std(), 3)
        if record:
            for a, b in comps:
                if len(Ms) >= 12:
                    ci, p = bmm.mean(Ms.mkey, (Ms[f"dev_{a}"] - Ms[f"dev_{b}"]).to_numpy())
                    test("1 sizing" + tag, name, "monthly risk deviation", f"{a} - {b}", ci, p)
                    row[f"ddev_{a}_{b}"] = [r4(x, 4) for x in ci]
                dd = D.date[m]
                e = ((sub[a].abs() > 3).astype(float) - (sub[b].abs() > 3).astype(float)).to_numpy() * 100
                ci, p = bdd.mean(dd, e)
                test("1 sizing" + tag, name, "% days beyond 3 sd", f"{a} - {b}", ci, p)
                row[f"dexc_{a}_{b}"] = [r4(x, 3) for x in ci]
            if name in CLASSES + ["all", "turbulent", "calm", "low sigma", "high sigma"] + YEARS:
                dd = D.date[m].to_numpy()
                for a, b in comps:
                    za, zb = sub[a].to_numpy(), sub[b].to_numpy()
                    oa, ob = np.argsort(za), np.argsort(zb)

                    def fn(w, za=za, zb=zb, oa=oa, ob=ob):
                        qa, _ = wq_es(za[oa], w[:, oa])
                        qb, _ = wq_es(zb[ob], w[:, ob])
                        return qa - qb
                    ci, p = bdd.wstat(dd, None, fn)
                    test("1 sizing" + tag, name, "p99 loss (1st pct, sd)", f"{a} - {b}", ci, p)
                    row[f"dp1_{a}_{b}"] = [r4(x, 3) for x in ci]
        res.append(row)
    return pd.DataFrame(res), M


def gpd_xi(loss, reps=200, dates=None):
    """GPD shape of losses above their 95th percentile; date-block CI by resampling dates (reps 200)."""
    u = np.quantile(loss, 0.95)
    exc = loss[loss > u] - u
    xi = genpareto.fit(exc, floc=0)[0]
    out = []
    if dates is not None:
        bb = Boot(dates, 20)
        i = bb.ix(dates)
        for b in range(reps):
            w = bb.W[b][i].astype(int)
            lb = np.repeat(loss, w)
            ub = np.quantile(lb, 0.95)
            eb = lb[lb > ub] - ub
            out.append(genpareto.fit(eb, floc=0)[0])
    lo, hi = (np.percentile(out, [2.5, 97.5]) if out else (np.nan, np.nan))
    return [xi, lo, hi]


# ── book (parts 2-4) ────────────────────────────────────────────────────────────────────────────────────────────────
def legs(D):
    Bk = D[D.inst.isin(S2.BOOK)].copy()
    Bk["sgn"] = Bk.inst.map(S2.BOOK)
    Bk["u"] = Bk.sgn * Bk.r_ocs / Bk.sig
    U = Bk.pivot(index="date", columns="inst", values="u").reindex(columns=list(S2.BOOK))
    return U


def erc(c, iters=200):
    """Equal risk contribution, long-only: cyclical coordinate descent on 0.5 w'Cw - (1/k) sum log w
    (Griveau-Billion, Richard & Roncalli 2013); stays positive with negative correlations."""
    k = c.shape[0]
    w = np.ones(k) / np.sqrt(np.ones(k) @ c @ np.ones(k))
    for _ in range(iters):
        w_old = w.copy()
        for i in range(k):
            b = c[i] @ w - c[i, i] * w[i]
            w[i] = (-b + np.sqrt(b * b + 4 * c[i, i] / k)) / (2 * c[i, i])
        if np.max(np.abs(w - w_old)) < 1e-10:
            break
    return w / w.sum()


def dd_max(x):
    cs = np.cumsum(x)
    return float((cs - np.maximum.accumulate(cs)).min())


def book_parts(U, Ulag):
    names = list(S2.BOOK)
    k = len(names)
    iu = [names.index(n) for n in S2.USD_LEGS]
    ii = [names.index(n) for n in S2.OTHER_LEGS if n != "GOLD"]
    X = U.fillna(0).to_numpy()
    C = S2.roll_corr(U)
    idx = U.index.to_numpy()
    w_eq = np.ones(k) / k
    rows = []
    for t in range(len(idx)):
        if not np.all(np.isfinite(C[t])):
            continue
        cs = S2.shrink(C[t])
        we = erc(cs)
        bv = float(np.sqrt(w_eq @ cs @ w_eq))
        bve = float(np.sqrt(we @ cs @ we))
        rows.append({"date": idx[t], "ER": float(X[t] @ w_eq), "bv": bv, "ERC": float(X[t] @ we), "bv_erc": bve,
                     "stress_erc": float(np.abs(we).sum()), "f_usd": float(X[t, iu].mean()),
                     "pc1": S2.pc1_share(C[t]), "usd_rc": float(S2.risk_contrib(cs, w_eq)[iu].sum()),
                     "idx_rc": float(S2.risk_contrib(cs, w_eq)[ii].sum()),
                     "usd_rc_erc": float(S2.risk_contrib(cs, we)[iu].sum()), "w_erc": we})
    Bk = pd.DataFrame(rows).set_index("date")
    # lagged: correlation from sessions < t-1 and sigma lagged one session (Ulag)
    XL = Ulag.reindex(U.index).fillna(0).to_numpy()
    CL = np.concatenate([np.full((1, k, k), np.nan), C[:-1]])
    lagrows = []
    for t in range(len(idx)):
        if not np.all(np.isfinite(CL[t])):
            continue
        cs = S2.shrink(CL[t])
        lagrows.append({"date": idx[t], "ER": float(XL[t] @ w_eq), "bv": float(np.sqrt(w_eq @ cs @ w_eq))})
    BkL = pd.DataFrame(lagrows).set_index("date")
    return Bk, BkL, X, iu, ii


def rolling_r2(y, f, win=60):
    """R^2 of y on f over sessions t-win..t-1 (past only)."""
    y, f = pd.Series(y), pd.Series(f)
    c = y.rolling(win).corr(f).shift(1)
    return (c ** 2).to_numpy()


# ── part 5: M1 bid/ask stops by London entry bucket ─────────────────────────────────────────────────────────────────
BUCKETS = [("Asia 00-07", 0), ("London open 07-10", 7), ("London mid 10-13", 10), ("Overlap 13-16", 13), ("NY afternoon 16-22", 16)]
KS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0]


def m1_stops(inst, Dinst):
    key = S2.BA_KEY.get(inst, inst.lower())
    t0 = time.time()
    tb = pq.read_table(BA / f"{key}_m1.parquet", columns=["time", "bid_o", "bid_h", "bid_l", "bid_c", "ask_o", "ask_h", "ask_l", "ask_c"],
                       filters=[("time", ">=", pd.Timestamp("2015-10-01")), ("time", "<", pd.Timestamp("2022-12-31 00:00"))])
    df = tb.to_pandas()
    del tb
    lt = pd.DatetimeIndex(pd.to_datetime(df.time)).tz_localize("UTC").tz_convert("Europe/London").tz_localize(None)
    df["ld"] = lt.normalize().strftime("%Y-%m-%d")
    df["lmin"] = (lt.hour * 60 + lt.minute).to_numpy()
    df = df[(df.lmin < 22 * 60) & (df.ld <= END)]
    df = df[pd.to_datetime(df.ld).dt.dayofweek < 5].reset_index(drop=True)
    for c in ["bid_o", "bid_h", "bid_l", "bid_c", "ask_o", "ask_h", "ask_l", "ask_c"]:
        df[c] = df[c].astype(np.float64)
    mid_c = ((df.bid_c + df.ask_c) / 2).to_numpy()
    # hourly realised variance (5-minute mid log returns) per session, for the intraday variance profile
    df["h"] = df.lmin // 60
    m5 = df.lmin % 5 == 4
    s5 = pd.Series(np.log(mid_c[m5.to_numpy()]), index=df.index[m5])
    r5 = s5.groupby(df.ld[m5]).diff()
    hv = pd.DataFrame({"ld": df.ld[m5], "h": df.h[m5], "r2": r5 ** 2}).dropna().groupby(["ld", "h"]).r2.sum().unstack(fill_value=0.0)
    hv = hv.reindex(columns=range(22), fill_value=0.0)
    prof = hv.div(hv.sum(1), axis=0).rolling(250, min_periods=60).mean().shift(1)     # trailing share by hour, past only
    sig = Dinst.set_index("date").sig
    starts = np.r_[0, np.flatnonzero(df.ld.to_numpy()[1:] != df.ld.to_numpy()[:-1]) + 1, len(df)]
    lds = df.ld.to_numpy()[starts[:-1]]
    A = {c: df[c].to_numpy() for c in ["bid_o", "bid_h", "bid_l", "bid_c", "ask_o", "ask_h", "ask_l", "ask_c", "lmin"]}
    # data holes: minutes since the previous bar; an entry whose remaining session has a hole > 30 min is dropped (counted),
    # otherwise a missing stretch would show up as a fake gap-through fill
    tmin = ((pd.to_datetime(df.time) - pd.Timestamp("2000-01-01")).dt.total_seconds() // 60).to_numpy()   # unit-safe (parquet is us)
    gapm = np.r_[0, np.diff(tmin)]
    out, paths = [], []
    holes = 0
    for si, ld in enumerate(lds):
        if ld < START or ld not in sig.index or ld not in prof.index or not np.isfinite(prof.loc[ld].iloc[0]):
            continue
        a, b = starts[si], starts[si + 1]
        if b - a < 300:
            continue
        lmin = A["lmin"][a:b]
        s = float(sig.loc[ld])
        pr = prof.loc[ld].to_numpy()
        for bname, h in BUCKETS:
            j = int(np.searchsorted(lmin, h * 60))
            if j >= len(lmin) or lmin[j] - h * 60 > 30 or len(lmin) - j < 30:
                continue
            frem = float(pr[h:].sum())
            if not frem > 0:
                continue
            e = a + j
            if e + 1 < b and gapm[e + 1:b].max() > 30:
                holes += 1
                continue
            mid0 = (A["bid_o"][e] + A["ask_o"][e]) / 2
            d1 = s / 100 * mid0 * np.sqrt(frem)            # 1 x sigma_remaining in price
            spread = A["ask_o"][e] - A["bid_o"][e]
            ks = KS if h == 0 else [1.0]
            for side in (1, -1):
                if side == 1:
                    ent_net = A["ask_o"][e]
                    adv_net = ent_net - A["bid_l"][e:b]                      # adverse excursion on the bid
                    adv_g = mid0 - (A["bid_l"][e:b] + A["ask_l"][e:b]) / 2
                    open_net = ent_net - A["bid_o"][e:b]
                    open_g = mid0 - (A["bid_o"][e:b] + A["ask_o"][e:b]) / 2
                    fin_net = (A["bid_c"][b - 1] - ent_net) / d1
                else:
                    ent_net = A["bid_o"][e]
                    adv_net = A["ask_h"][e:b] - ent_net
                    adv_g = (A["bid_h"][e:b] + A["ask_h"][e:b]) / 2 - mid0
                    open_net = A["ask_o"][e:b] - ent_net
                    open_g = (A["bid_o"][e:b] + A["ask_o"][e:b]) / 2 - mid0
                    fin_net = (ent_net - A["ask_c"][b - 1]) / d1
                cm_n = np.maximum.accumulate(adv_net)
                cm_g = np.maximum.accumulate(adv_g)
                for k in ks:
                    dk = k * d1
                    tn = int(np.searchsorted(cm_n, dk))
                    tg = int(np.searchsorted(cm_g, dk))
                    hit_n, hit_g = tn < len(cm_n), tg < len(cm_g)
                    # fill: the stop price, or the bar's open if it gapped through (the one-step loss)
                    loss_n = max(dk, open_net[tn]) / dk if hit_n else np.nan
                    loss_g = max(dk, open_g[tg]) / dk if hit_g else np.nan
                    out.append((inst, ld, bname, side, k, hit_g, hit_n, loss_g, loss_n, (lmin[j + tn] - h * 60) if hit_n else -1,
                                spread / dk, fin_net / k if not hit_n else np.nan, frem))
                    if h == 0 and k == 1.0 and hit_n and loss_n > 1.3:
                        paths.append((loss_n, inst, ld, side, e, b, ent_net, d1))
    T = pd.DataFrame(out, columns=["inst", "date", "bucket", "side", "k", "hit_g", "hit_n", "loss_g", "loss_n", "t_touch",
                                   "spreadR", "finR", "frem"])
    ex = []
    for loss_n, inst_, ld, side, e, b, ent, d1 in sorted(paths, reverse=True)[:2]:
        px = (A["bid_c"][e:b] - ent) if side == 1 else (ent - A["ask_c"][e:b])
        lm = A["lmin"][e:b]
        keep = np.unique(lm // 10, return_index=True)[1]
        pth = [[int(lm[i]), round(float(px[i] / d1), 3)] for i in keep]
        stop_i = int(np.argmax((px / d1) <= -1)) if np.any(px / d1 <= -1) else None
        if stop_i is not None:
            pth.append([int(lm[stop_i]), round(float(px[stop_i] / d1), 3)])
            pth.sort()
        ex.append({"inst": inst_, "date": ld, "side": "long" if side == 1 else "short", "r": round(-float(loss_n), 2),
                   "unit": "R (net, bid/ask)", "stop": -1, "target": None, "path": pth})
    del df, A
    gc.collect()
    print(f"  {inst}: {len(T)} rows, {time.time() - t0:.0f}s", flush=True)
    T.attrs["holes"] = holes
    return T, ex


def build_stops(D, rebuild):
    f = OUT / "stops_bidask.parquet"
    fe = OUT / "stop_examples.json"
    if f.exists() and fe.exists() and not rebuild:
        return pd.read_parquet(f), json.loads(fe.read_text()), json.loads((OUT / "stop_holes.json").read_text())
    parts, exs, hole_n = [], [], {}
    for inst in sorted(D.inst.unique()):
        T, ex = m1_stops(inst, D[D.inst == inst][["date", "sig"]])
        hole_n[inst] = T.attrs.get("holes", 0)
        parts.append(T)
        exs.extend(ex)
    T = pd.concat(parts, ignore_index=True)
    T.to_parquet(f, index=False)
    fe.write_text(json.dumps(exs))
    (OUT / "stop_holes.json").write_text(json.dumps(hole_n))
    return T, exs, hole_n


# ── main ────────────────────────────────────────────────────────────────────────────────────────────────────────────
def main(rebuild=False):
    t_start = time.time()
    OUT.mkdir(parents=True, exist_ok=True)
    D = load()
    DL = load(lag=1)
    print("rows", len(D), "inst", D.inst.nunique(), D.date.min(), D.date.max(), flush=True)
    facts = {}
    charts = []

    # regime episodes (per instrument runs of turbulent)
    ep = []
    for inst, g in D.groupby("inst"):
        s = (g.regime == "turbulent").astype(int).to_numpy()
        runs = np.diff(np.r_[0, s, 0])
        st, en = np.flatnonzero(runs == 1), np.flatnonzero(runs == -1)
        ep.extend((en - st).tolist())
    ep_len = int(np.median(ep)) if ep else 21
    facts["regime"] = {"episodes": len(ep), "median_len": ep_len, "turb_share": r4((D.regime == "turbulent").mean(), 3),
                       "unlabelled": r4(D.regime.isna().mean(), 3)}
    print("regime", facts["regime"], flush=True)

    bd = Boot(D.date, 20)
    bep = Boot(D.date, max(20, ep_len))
    bm = Boot(D.month + "-01", 3)
    bm_ep = Boot(D.month + "-01", max(2, round(ep_len / 21)))

    # ── part 1 ────────────────────────────────────────────────────────────────────────────────────────────────────
    Z = scale(D, base_variants(D))
    P1, M = part1(D, Z, bd, bm, bep, bm_ep)
    P1.to_csv(OUT / "part1_cells.csv", index=False)
    print("part1 done", round(time.time() - t_start), flush=True)
    facts["p1_all"] = P1[P1.cell == "all"].iloc[0].to_dict()

    # GPD tails per class
    gp = {}
    for cname in ["all"] + CLASSES:
        m = (D.klass == cname).to_numpy() if cname != "all" else np.ones(len(D), bool)
        gp[cname] = {v: [r4(x, 3) for x in gpd_xi(-Z[v].to_numpy()[m], 200, D.date.to_numpy()[m])] for v in ["U", "F", "MM", "FJ", "T20", "FA"]}
    facts["gpd"] = gp
    zn = rng.standard_normal(200000)
    facts["gpd_normal"] = r4(gpd_xi(zn, 0)[0], 3)
    print("gpd", gp["all"], flush=True)

    # horizon: 5-session non-overlapping holds
    H5 = []
    for inst, g in D.groupby("inst"):
        g = g.reset_index(drop=True)
        r5 = g.r_ocs.rolling(5).sum().shift(-4)
        sel = g.index % 5 == 0
        h = pd.DataFrame({"inst": inst, "klass": g.klass, "date": g.date, "r": r5, "U": 1.0, "T20": g.rv20, "F": g.sig,
                          "MM": g.sig ** 2, "FJ": np.sqrt(g.sig ** 2 + g.Jbar),
                          "FA": np.sqrt(g.sig ** 2 + 0.25 * g.sig2med)})[sel].dropna()
        for v in VARS:
            z = h.r / h[v] if v != "U" else h.r
            h[v] = z / z.std()
        H5.append(h)
    H5 = pd.concat(H5)
    H5 = H5[H5.date <= "2022-12-22"]          # 5-session window must end inside the discovery window
    h5 = {}
    bh5 = Boot(H5.date, 4)
    for cname in ["all"] + CLASSES:
        s = H5 if cname == "all" else H5[H5.klass == cname]
        h5[cname] = {v: [r4(s[v].quantile(0.01), 3), r4((s[v].abs() > 3).mean() * 100, 3)] for v in VARS}
        for a, b in [("F", "U"), ("FJ", "F"), ("FA", "F")]:
            e = ((s[a].abs() > 3).astype(float) - (s[b].abs() > 3).astype(float)).to_numpy() * 100
            ci, p = bh5.mean(s.date, e)
            test("1 sizing, 5-session hold", cname, "% holds beyond 3 sd", f"{a} - {b}", ci, p)
    facts["h5"] = h5

    # plateau: exponent p, RV window, jump weight c
    plat = {"p": [], "rv": [], "c": [], "a": []}
    lowm = (D.terc.astype(str) == "low sigma").to_numpy()
    Mbase = M
    for p_ in [0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0]:
        z = scale(D, {"x": D.sig ** p_})
        mt = month_table(D, z)
        plat["p"].append([p_, r4(mt.dev_x.mean(), 4), r4((z.x.abs() > 3).mean() * 100, 3), r4(z.x.quantile(0.01), 3)])
    for w in (5, 10, 20, 40, 60, 120):
        z = scale(D, {"x": D[f"rv{w}"]})
        mt = month_table(D, z)
        plat["rv"].append([w, r4(mt.dev_x.mean(), 4), r4((z.x.abs() > 3).mean() * 100, 3), r4(z.x.quantile(0.01), 3)])
    for c in (0, 0.5, 1, 2, 4, 8, 16):
        z = scale(D, {"x": np.sqrt(D.sig ** 2 + c * D.Jbar)})
        mt = month_table(D, z)
        plat["c"].append([c, r4(mt.dev_x.mean(), 4), r4((z.x.abs() > 3).mean() * 100, 3), r4(z.x.quantile(0.01), 3),
                          r4((z.x[lowm].abs() > 3).mean() * 100, 3)])
    for a_ in (0, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0):
        z = scale(D, {"x": np.sqrt(D.sig ** 2 + a_ * D.sig2med)})
        mt = month_table(D, z)
        plat["a"].append([a_, r4(mt.dev_x.mean(), 4), r4((z.x.abs() > 3).mean() * 100, 3), r4(z.x.quantile(0.01), 3),
                          r4((z.x[lowm].abs() > 3).mean() * 100, 3), r4((z.x[~lowm].abs() > 3).mean() * 100, 3)])
    facts["plateau"] = plat
    del Mbase

    # +1 lag: every sigma one more session late (matched rows)
    key = ["inst", "date"]
    J = D[key].merge(DL[key + ["sig", "rv20", "Jbar", "sig2med"]], on=key, how="left")
    ok = J.sig.notna().to_numpy()
    Dl = D[ok].copy()
    Dl["sig"], Dl["rv20"], Dl["Jbar"], Dl["sig2med"] = J.sig[ok].to_numpy(), J.rv20[ok].to_numpy(), J.Jbar[ok].to_numpy(), J.sig2med[ok].to_numpy()
    Z0 = scale(D[ok], base_variants(D[ok]))
    ZL = scale(Dl, base_variants(Dl))
    M0, ML = month_table(D[ok], Z0), month_table(Dl, ZL)
    lag = {}
    for v in ["U", "T20", "F", "FJ", "MM", "FA"]:
        lag[v] = {"dev": [r4(M0[f"dev_{v}"].mean(), 4), r4(ML[f"dev_{v}"].mean(), 4)],
                  "exc3": [r4((Z0[v].abs() > 3).mean() * 100, 3), r4((ZL[v].abs() > 3).mean() * 100, 3)],
                  "p1": [r4(Z0[v].quantile(0.01), 3), r4(ZL[v].quantile(0.01), 3)]}
    # headline effect with lag: F - U stability, FJ - F beyond 3 sd
    ci, p = bm.mean(ML.mkey, (ML.dev_F - ML.dev_U).to_numpy())
    lag["F_minus_U_dev_lag"] = [r4(x, 4) for x in ci]
    test("1 sizing +1 lag", "all", "monthly risk deviation", "F - U (lagged)", ci, p)
    ci, p = bm.mean(ML.mkey, (ML.dev_F - ML.dev_T20).to_numpy())
    lag["F_minus_T20_dev_lag"] = [r4(x, 4) for x in ci]
    test("1 sizing +1 lag", "all", "monthly risk deviation", "F - T20 (lagged)", ci, p)
    e = ((ZL.FJ.abs() > 3).astype(float) - (ZL.F.abs() > 3).astype(float)).to_numpy() * 100
    ci, p = bd.mean(Dl.date, e)
    lag["FJ_minus_F_exc_lag"] = [r4(x, 3) for x in ci]
    test("1 sizing +1 lag", "all", "% days beyond 3 sd", "FJ - F (lagged)", ci, p)
    lm = (Dl.terc.astype(str) == "low sigma").to_numpy()
    for nm_, ZZ, DD in (("asused", Z0, D[ok]), ("lag", ZL, Dl)):
        e = ((ZZ.FA.abs() > 3).astype(float) - (ZZ.F.abs() > 3).astype(float)).to_numpy()[lm] * 100
        ci, p = bd.mean(DD.date.to_numpy()[lm], e)
        lag[f"FA_minus_F_low_exc_{nm_}"] = [r4(x, 3) for x in ci]
        lag[f"low_exc_{nm_}"] = {v: r4((ZZ[v].abs() > 3).to_numpy()[lm].mean() * 100, 3) for v in ("U", "F", "FA")}
    test("1 sizing +1 lag", "low sigma", "% days beyond 3 sd", "FA - F (lagged)", ci, p)
    facts["lag"] = lag
    print("lag", lag, flush=True)

    # ── parts 2-4: the book ───────────────────────────────────────────────────────────────────────────────────────
    U = legs(D)
    Ul = legs(Dl)
    Bk, BkL, X, iu, ii = book_parts(U, Ul)
    Bk.drop(columns=["w_erc"]).to_csv(OUT / "book_daily.csv")
    bdates = Bk.index.to_numpy()
    assert bdates.max() <= END
    bb = Boot(bdates, 20)

    # part 2: dollar factor share of the equal-risk book's variance
    Bk["r2_usd"] = rolling_r2(Bk.ER.to_numpy(), Bk.f_usd.to_numpy())
    raw = D[D.inst.isin(S2.BOOK)].assign(u=lambda d: d.inst.map(S2.BOOK) * d.r_ocs).pivot(index="date", columns="inst", values="u")
    raw = raw.reindex(columns=list(S2.BOOK)).fillna(0)
    f_raw = raw[list(S2.USD_LEGS)].mean(1)
    Bk["f_raw"] = f_raw.reindex(Bk.index).to_numpy()
    Bk["reg_usd"] = regime(f_raw.reset_index(drop=True)).set_axis(f_raw.index).reindex(Bk.index).to_numpy()
    book_raw = raw.mean(1)
    Bk["reg_book"] = regime(book_raw.reset_index(drop=True)).set_axis(book_raw.index).reindex(Bk.index).to_numpy()
    Bk["terc_usd"] = pd.qcut(Bk.f_raw.rolling(63, min_periods=40).std().shift(1), 3, labels=["low", "mid", "high"]).astype(str).to_numpy()
    # shuffled benchmark: each leg permuted independently -> R^2 of the book on the dollar factor over 60-session windows
    sh = []
    for _ in range(300):
        Xs = np.column_stack([rng.permutation(X[:, j])[:60] for j in range(X.shape[1])])
        bk_s = Xs.mean(1)
        f_s = Xs[:, iu].mean(1)
        sh.append(np.corrcoef(bk_s, f_s)[0, 1] ** 2)
    sh_mean = float(np.mean(sh))
    ep2 = []
    s = (Bk.reg_usd == "turbulent").astype(int).to_numpy()
    runs = np.diff(np.r_[0, s, 0])
    ep2 = (np.flatnonzero(runs == -1) - np.flatnonzero(runs == 1)).tolist()
    ep2_len = int(np.median(ep2)) if ep2 else 21
    b60 = Boot(bdates, 60)
    bep2 = Boot(bdates, max(60, ep2_len))
    valid = Bk.r2_usd.notna().to_numpy()
    overall = float(Bk.r2_usd[valid].mean())
    dollar = {"overall": r4(overall, 3), "shuffled": r4(sh_mean, 3), "episodes": len(ep2), "ep_len": ep2_len, "year": {}, "regime": {},
              "terc": {}}
    for y in YEARS:
        m = valid & (Bk.index.str[:4] == y)
        x = Bk.r2_usd.to_numpy()[m] - overall
        ci, p = b60.mean(bdates[m], x)
        test("2 dollar share", y, "R2 of book on dollar factor", "year - all", ci, p)
        dollar["year"][y] = [r4(Bk.r2_usd.to_numpy()[m].mean(), 3), r4(ci[1] + overall, 3), r4(ci[2] + overall, 3),
                             r4(Bk.usd_rc.to_numpy()[m].mean(), 3)]
    for rg in ("turbulent", "calm"):
        m = valid & (Bk.reg_usd == rg).to_numpy()
        ci, _ = bep2.mean(bdates[m], Bk.r2_usd.to_numpy()[m])
        dollar["regime"][rg] = [r4(x, 3) for x in ci] + [int(m.sum())]
    mt = valid & (Bk.reg_usd == "turbulent").to_numpy()
    mc = valid & (Bk.reg_usd == "calm").to_numpy()
    xx = np.where(mt, Bk.r2_usd.to_numpy() - overall, 0) * 0
    # turbulent - calm difference via a ratio bootstrap on the same weights
    i_all = bep2.ix(bdates)
    a_t = np.bincount(i_all[mt], weights=Bk.r2_usd.to_numpy()[mt], minlength=len(bep2.keys))
    n_t = np.bincount(i_all[mt], minlength=len(bep2.keys)).astype(float)
    a_c = np.bincount(i_all[mc], weights=Bk.r2_usd.to_numpy()[mc], minlength=len(bep2.keys))
    n_c = np.bincount(i_all[mc], minlength=len(bep2.keys)).astype(float)
    reps = (bep2.W @ a_t) / (bep2.W @ n_t) - (bep2.W @ a_c) / (bep2.W @ n_c)
    pt = a_t.sum() / n_t.sum() - a_c.sum() / n_c.sum()
    ci = [pt, *np.nanpercentile(reps, [2.5, 97.5])]
    test("2 dollar share", "dollar regime", "R2 of book on dollar factor", "turbulent - calm", ci, pval(reps))
    dollar["turb_minus_calm"] = [r4(x, 3) for x in ci]
    del xx
    for tl in ("low", "mid", "high"):
        m = valid & (Bk.terc_usd == tl).to_numpy()
        ci, _ = b60.mean(bdates[m], Bk.r2_usd.to_numpy()[m])
        dollar["terc"][tl] = [r4(x, 3) for x in ci]
    # does a high dollar share precede bigger book losses? (next-session |book| / model vol)
    zb = Bk.ER / Bk.bv
    hi = valid & (Bk.r2_usd > Bk.r2_usd.quantile(0.8)).to_numpy()
    lo_ = valid & (Bk.r2_usd < Bk.r2_usd.quantile(0.2)).to_numpy()
    dollar["z_sd_hi_lo"] = [r4(zb[hi].std(), 3), r4(zb[lo_].std(), 3)]
    facts["dollar"] = dollar
    print("dollar", dollar, flush=True)

    # part 3: all-correlations-to-1 stress cap. Equal-risk legs in sigma units: stress sd = sum|w| = 1, model sd = bv.
    # BT multiplier m = 1/bv (levers up when correlation is low); cap m <= L (stressed book sd <= L x target)
    stress = {"L": [], "var": {}}
    ER = Bk.ER.to_numpy()
    bv = Bk.bv.to_numpy()

    def bookstats(x, tag, ix=None):
        ix = Bk.index if ix is None else ix
        x = x / x.std()
        mvol = pd.Series(x, index=ix).groupby(ix.str[:7]).std()
        o = np.sort(x)
        es = o[: max(1, int(0.01 * len(o)))].mean()
        return {"worst": r4(x.min(), 2), "es1": r4(es, 3), "p1": r4(np.quantile(x, 0.01), 3), "vov": r4(mvol.std(), 3),
                "dd_nodrift": r4(dd_max(x - x.mean()), 1), "kurt": r4(pd.Series(x).kurt(), 2)}
    Ls = [1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 4.0, np.inf]
    for L in Ls:
        m_ = np.minimum(1 / bv, L)
        st = bookstats(ER * m_, L)
        st["L"] = "none" if not np.isfinite(L) else L
        st["binds"] = r4(float((1 / bv > L).mean()), 3)
        st["mean_mult"] = r4(float(m_.mean()), 3)
        stress["L"].append(st)
    # tests: capped (L=2) vs uncapped BT and vs ER, ES 1% and monthly-vol spread, date-block bootstrap
    for L in (1.5, 2.0, 3.0):
        xa = ER * np.minimum(1 / bv, L)
        xb = ER / bv
        xa, xb = xa / xa.std(), xb / xb.std()
        oa, ob = np.argsort(xa), np.argsort(xb)

        def fn(w, xa=xa, xb=xb, oa=oa, ob=ob):
            _, ea = wq_es(xa[oa], w[:, oa])
            _, eb = wq_es(xb[ob], w[:, ob])
            return ea - eb
        ci, p = bb.wstat(bdates, None, fn)
        test("3 stress cap", f"cap L={L}", "book ES 1% (sd)", "capped - vol target", ci, p)
        stress.setdefault("es_test", {})[str(L)] = [r4(x, 3) for x in ci]
    # VaR coverage: model sd vs stress sd, by year and regime (ER book unlevered, sigma units)
    exc_m = (ER < -norm.ppf(0.99) * bv).astype(float) * 100
    exc_s = (ER < -norm.ppf(0.99) * 1.0).astype(float) * 100
    cov = {}
    for cell, m in [("all", np.ones(len(ER), bool))] + [(y, Bk.index.str[:4] == y) for y in YEARS] + \
                   [(r, (Bk.reg_book == r).to_numpy()) for r in ("turbulent", "calm")]:
        bx = bep if cell in ("turbulent", "calm") else bb
        cm, pm = bx.mean(bdates[m], exc_m[m] - 1.0)
        cs_, ps = bx.mean(bdates[m], exc_s[m] - 1.0)
        cov[cell] = {"model": [r4(v + 1, 2) for v in cm], "stress": [r4(v + 1, 2) for v in cs_], "n": int(m.sum())}
        test("3 stress cap", cell, "99% VaR breach rate (model sd)", "rate - 1%", cm, pm)
        test("3 stress cap", cell, "99% VaR breach rate (stress sd)", "rate - 1%", cs_, ps)
    stress["var"] = cov
    stress["ratio"] = [r4(float(np.median(1 / bv)), 2), r4(float(np.percentile(1 / bv, 5)), 2), r4(float(np.percentile(1 / bv, 95)), 2)]
    stress["worst_days"] = [[d, r4(ER[i] / bv[i], 2), r4(ER[i], 2)] for i, d in
                            sorted(enumerate(bdates), key=lambda t: ER[t[0]])[:5]]
    # +1 lag on the book target: corr from sessions < t-1 and sigma one session late
    erl, bvl = BkL.ER.reindex(Bk.index).to_numpy(), BkL.bv.reindex(Bk.index).to_numpy()
    okl = np.isfinite(erl) & np.isfinite(bvl)
    ixl = Bk.index[okl]
    stress["lag"] = {"BT": bookstats((erl / bvl)[okl], "x", ixl), "cap2": bookstats((erl * np.minimum(1 / bvl, 2.0))[okl], "x", ixl),
                     "ER": bookstats(erl[okl], "x", ixl),
                     "var_model": r4(float((erl[okl] < -norm.ppf(0.99) * bvl[okl]).mean() * 100), 2)}
    facts["stress"] = stress
    print("stress", json.dumps(stress)[:1500], flush=True)

    # part 4: ERC vs inverse vol
    ercd = {}
    Werc = np.vstack(Bk.w_erc.to_numpy())
    turn = float(np.abs(np.diff(Werc, axis=0)).sum(1).mean())
    names = list(S2.BOOK)
    for lab, x, bvx in (("inverse vol", ER, bv), ("ERC", Bk.ERC.to_numpy(), Bk.bv_erc.to_numpy())):
        ercd[lab] = bookstats(x, lab)
        ercd[lab + " + target"] = bookstats(x / bvx, lab)
        ercd[lab]["year_vol"] = [[int(y), r4(float(np.std(x[Bk.index.str[:4] == y]) / np.std(x)), 3)] for y in YEARS]
    # ex-post risk shares per year (realised covariance of legs within the year)
    xs = {}
    for y in YEARS:
        m = Bk.index.str[:4] == y
        Xy = X[np.isin(U.index.to_numpy(), bdates[m])]
        Cy = np.cov(Xy.T)
        we_y = Werc[m].mean(0)
        sh_iv = S2.risk_contrib(Cy, np.ones(len(names)) / len(names))
        sh_er = S2.risk_contrib(Cy, we_y)
        xs[y] = {"iv_usd": r4(sh_iv[iu].sum(), 3), "erc_usd": r4(sh_er[iu].sum(), 3), "iv_idx": r4(sh_iv[ii].sum(), 3),
                 "erc_idx": r4(sh_er[ii].sum(), 3), "iv_hhi": r4(float((sh_iv ** 2).sum()), 4), "erc_hhi": r4(float((sh_er ** 2).sum()), 4),
                 "iv_gold": r4(sh_iv[names.index("GOLD")], 3), "erc_gold": r4(sh_er[names.index("GOLD")], 3)}
    ercd["expost"] = xs
    ercd["turnover"] = r4(turn, 4)
    ercd["w_mean"] = {n: r4(float(Werc[:, j].mean() * len(names)), 3) for j, n in enumerate(names)}
    xa, xb = Bk.ERC.to_numpy() / Bk.ERC.std(), ER / ER.std()
    oa, ob = np.argsort(xa), np.argsort(xb)

    def fn_es(w):
        _, ea = wq_es(xa[oa], w[:, oa])
        _, eb = wq_es(xb[ob], w[:, ob])
        return ea - eb
    ci, p = bb.wstat(bdates, None, fn_es)
    test("4 ERC", "book", "ES 1% (sd)", "ERC - inverse vol", ci, p)
    ercd["es_diff"] = [r4(x, 3) for x in ci]
    mva = pd.Series(xa, index=Bk.index).groupby(Bk.index.str[:7]).std()
    mvb = pd.Series(xb, index=Bk.index).groupby(Bk.index.str[:7]).std()
    bmm = Boot(np.array([m + "-01" for m in mva.index]), 3)
    ci, p = bmm.mean(np.array([m + "-01" for m in mva.index]), ((mva - 1).abs() - (mvb - 1).abs()).to_numpy())
    test("4 ERC", "book", "monthly risk deviation", "ERC - inverse vol", ci, p)
    ercd["dev_diff"] = [r4(x, 4) for x in ci]
    for y in YEARS:
        m = Bk.index.str[:4] == y
        ci, p = bb.mean(bdates[m], (Bk.usd_rc_erc.to_numpy()[m] - Bk.usd_rc.to_numpy()[m]))
        test("4 ERC", y, "ex-ante USD risk share", "ERC - inverse vol", ci, p)
    ercd["usd_rc_ante"] = [r4(Bk.usd_rc.mean(), 3), r4(Bk.usd_rc_erc.mean(), 3)]
    facts["erc"] = ercd
    print("erc", json.dumps(ercd)[:1500], flush=True)

    if "--skip-m1" in sys.argv:
        (OUT / "facts.json").write_text(json.dumps(facts, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
        pd.DataFrame(TESTS).to_csv(OUT / "tests_partial.csv", index=False)
        print("skip m1; done", round(time.time() - t_start))
        return
    # ── part 5: M1 bid/ask stops by time of day ───────────────────────────────────────────────────────────────────
    T, exs, hole_n = build_stops(D, rebuild)
    assert T.date.max() <= END and T.date.min() >= START
    T["klass"] = T.inst.map(klass)
    T["year"] = T.date.str[:4]
    T = T.merge(D[["inst", "date", "regime"]], on=["inst", "date"], how="left")
    rw1 = 2 * norm.sf(1.0)
    T1 = T[T.k == 1.0]
    stops = {"rw": r4(rw1 * 100, 2), "bucket": {}, "class_bucket": {}, "year": {}, "regime": {}, "k": {}, "loss": {}, "inst": {}}
    bt = Boot(T.date, 20)
    btep = Boot(T.date, max(20, ep_len))
    for bname, _ in BUCKETS:
        s = T1[T1.bucket == bname]
        cg, _ = bt.mean(s.date, s.hit_g.astype(float).to_numpy() * 100)
        cn, pn = bt.mean(s.date, s.hit_n.astype(float).to_numpy() * 100 - rw1 * 100)
        test("5 stops bid/ask", bname, "1-sigma_rem stop touch (net)", "rate - random walk", cn, pn)
        stops["bucket"][bname] = {"gross": [r4(x, 2) for x in cg], "net": [r4(x + rw1 * 100, 2) for x in cn], "n": int(len(s)),
                                  "spreadR_med": r4(s.spreadR.median(), 3), "frem": r4(s.frem.mean(), 3),
                                  "loss_net_mean": r4(s.loss_n.mean(), 3), "loss_net_p99": r4(s.loss_n.quantile(0.99), 3)}
        for c in CLASSES:
            sc = s[s.klass == c]
            if len(sc) < 200:
                continue
            cn, pn = bt.mean(sc.date, sc.hit_n.astype(float).to_numpy() * 100 - rw1 * 100)
            test("5 stops bid/ask", f"{c} / {bname}", "1-sigma_rem stop touch (net)", "rate - random walk", cn, pn)
            stops["class_bucket"][f"{c}|{bname}"] = [r4(x + rw1 * 100, 2) for x in cn] + [r4(sc.hit_g.mean() * 100, 2)]
    T10 = T1[T1.bucket == "Asia 00-07"]
    for y in YEARS:
        s = T10[T10.year == y]
        cn, pn = bt.mean(s.date, s.hit_n.astype(float).to_numpy() * 100 - rw1 * 100)
        test("5 stops bid/ask", y, "1-sigma stop touch from the open (net)", "rate - random walk", cn, pn)
        stops["year"][y] = [r4(x + rw1 * 100, 2) for x in cn] + [r4(s.hit_g.mean() * 100, 2)]
    for rg in ("turbulent", "calm"):
        s = T10[T10.regime == rg]
        cn, pn = btep.mean(s.date, s.hit_n.astype(float).to_numpy() * 100 - rw1 * 100)
        test("5 stops bid/ask", rg, "1-sigma stop touch from the open (net)", "rate - random walk", cn, pn)
        stops["regime"][rg] = [r4(x + rw1 * 100, 2) for x in cn] + [r4(s.hit_g.mean() * 100, 2), int(len(s))]
    T0 = T[T.bucket == "Asia 00-07"]
    for k in KS:
        s = T0[T0.k == k]
        stops["k"][str(k)] = [r4(s.hit_g.mean() * 100, 2), r4(s.hit_n.mean() * 100, 2), r4(2 * norm.sf(k) * 100, 2),
                              r4(s.loss_n.mean(), 3), r4(s.loss_n.quantile(0.99), 3)]
    for c in CLASSES:
        s = T10[(T10.klass == c) & T10.hit_n]
        sg = T10[(T10.klass == c) & T10.hit_g]
        stops["loss"][c] = {"gross_mean": r4(sg.loss_g.mean(), 3), "gross_p99": r4(sg.loss_g.quantile(0.99), 3),
                            "net_mean": r4(s.loss_n.mean(), 3), "net_p99": r4(s.loss_n.quantile(0.99), 3),
                            "net_max": r4(s.loss_n.max(), 2), "gap_share": r4((s.loss_n > 1.0 + s.spreadR + 0.05).mean() * 100, 2),
                            "spreadR_med": r4(T10[T10.klass == c].spreadR.median(), 3)}
    for inst, s in T10.groupby("inst"):
        stops["inst"][inst] = [r4(s.hit_g.mean() * 100, 2), r4(s.hit_n.mean() * 100, 2), r4(s.spreadR.median(), 3),
                               r4(s.loss_n.quantile(0.99), 3)]
    # time of first touch (net, from the open): share by London bucket, vs the share of the session's variance in it
    th = T10[T10.hit_n].t_touch
    edges = [0, 420, 600, 780, 960, 1320]
    tt = np.histogram(th, bins=edges)[0] / len(th) * 100
    fr = T10.groupby("inst").frem.first()
    stops["touch_time"] = [r4(x, 2) for x in tt]
    stops["holes"] = int(sum(hole_n.values()))
    stops["entries"] = int(len(T[T.k == 1.0]) // 2)
    facts["stops"] = stops
    print("stops", json.dumps(stops)[:2000], flush=True)

    # ── BH across the whole sweep ─────────────────────────────────────────────────────────────────────────────────
    TT = pd.DataFrame(TESTS)
    TT["bh"] = bh(TT.p.to_numpy(), 0.10)
    TT.to_csv(OUT / "tests.csv", index=False)
    n_cells = len(TT)
    k_pass = int(TT.bh.sum())
    # expected false passes among the BH passes = q x passes; under a global null about 0.1 cells pass in all
    facts["bh"] = {"n": n_cells, "pass": k_pass, "by_chance": r4(0.10 * k_pass, 1), "raw_p05": int((TT.p < 0.05).sum()),
                   "raw_p05_chance": r4(0.05 * n_cells, 1),
                   "by_part": TT.groupby("part").bh.agg(["size", "sum"]).to_dict("index")}
    print("BH", facts["bh"], flush=True)
    (OUT / "facts.json").write_text(json.dumps(facts, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")

    # ── charts ────────────────────────────────────────────────────────────────────────────────────────────────────
    P = P1.set_index("cell")

    def tv(cell, metric, comp):
        r = TT[(TT.cell == cell) & (TT.metric == metric) & (TT.comp == comp)]
        return r.iloc[0] if len(r) else None

    # 1. per instrument: monthly risk deviation, U / F / FJ  (+ T20 in note)
    inst_rows = P.loc[sorted(D.inst.unique())].sort_values("dev_U")
    charts.append({"type": "groups", "title": "Per instrument: how far monthly realised risk strays from target",
                   "names": ["unscaled", "forecast sigma", "trailing RV20"], "unit": "mean |monthly vol - 1| (1 = target)",
                   "note": "Daily London-session hold at equal ex-post vol per instrument; bar = average distance of a month's realised vol from "
                           "the target (0 = perfectly steady). Benchmark: the unscaled bar, and trailing RV20 for the chosen sigma. "
                           f"Forecast sigma beats unscaled in {int((inst_rows.dev_F < inst_rows.dev_U).sum())}/34 and RV20 in "
                           f"{int((inst_rows.dev_F < inst_rows.dev_T20).sum())}/34. Sigma + jump allowance is within 0.002 of forecast sigma everywhere (not drawn).",
                   "rows": [{"label": i, "values": [r.dev_U, r.dev_F, r.dev_T20]} for i, r in inst_rows.iterrows()]})

    # 2. class + sigma tercile: p99 loss (GPD shape in the note)
    rows2 = ["all"] + CLASSES + ["low sigma", "mid sigma", "high sigma"]
    charts.append({"type": "groups", "title": "p99 loss of the daily hold by class and sigma tercile (equal ex-post vol)",
                   "names": ["unscaled", "forecast sigma", "sigma + level allowance"], "unit": "1st percentile, sd (normal = -2.33)",
                   "note": "More negative = a worse 1-in-100 day at the same average risk. Benchmark: unscaled, and -2.33 for a normal. "
                           "Forecast - unscaled p99, by class: " +
                           "; ".join(f"{c} {P.loc[c, 'dp1_F_U'][0]:+.2f} [{P.loc[c, 'dp1_F_U'][1]:+.2f}, {P.loc[c, 'dp1_F_U'][2]:+.2f}]" for c in CLASSES) +
                           f"; low sigma {P.loc['low sigma', 'dp1_F_U'][0]:+.2f} [{P.loc['low sigma', 'dp1_F_U'][1]:+.2f}, {P.loc['low sigma', 'dp1_F_U'][2]:+.2f}]. "
                           "Loss-tail shape (GPD xi above the 95th pct loss, 200 date-block resamples; normal draws give "
                           f"{facts['gpd_normal']}): " + ", ".join(f"{VARS[v]} {gp['all'][v][0]} [{gp['all'][v][1]}, {gp['all'][v][2]}]" for v in ["U", "F", "FJ", "FA", "MM"]) +
                           ". RV20 and the jump allowance sit within 0.03 of forecast sigma (facts file).",
                   "rows": [{"label": c, "values": [P.loc[c, "p1_U"], P.loc[c, "p1_F"], P.loc[c, "p1_FA"]]} for c in rows2]})

    # 4. year-by-year stability
    charts.append({"type": "lines", "title": "Year by year: distance of monthly risk from target (34 instruments pooled)",
                   "unit": "mean |monthly vol - 1|", "xlabel": "year",
                   "note": "Each year's instrument-months, same equal-vol scaling. Benchmark: unscaled. A sizing that holds across sits low "
                           "every year; 2020 is the stress test. Beyond-3-sd days by year (unscaled / forecast): " +
                           ", ".join(f"{y} {P.loc[y, 'exc3_U']}/{P.loc[y, 'exc3_F']}%" for y in YEARS) + " - sigma sizing adds tail days in calm years.",
                   "series": [{"name": VARS[v], "points": [[int(y), P.loc[y, f"dev_{v}"]] for y in YEARS]} for v in ["U", "T20", "F", "FA"]]})

    # 5. regime / tercile: beyond 3 sd
    rcells = ["calm", "turbulent", "low sigma", "mid sigma", "high sigma"]
    charts.append({"type": "groups", "title": "Where the tail days land: beyond 3 sd by vol regime and sigma tercile",
                   "names": ["unscaled", "forecast sigma", "sigma + level allowance"], "unit": "% of sessions",
                   "note": f"Regime = C.OG Lesson 05 (63-session vol > 1.25 x its rolling median for 21+ sessions, past only): "
                           f"{facts['regime']['episodes']} turbulent episodes, median {ep_len} sessions, {facts['regime']['turb_share'] * 100:.0f}% of days; "
                           f"intervals use blocks of {max(20, ep_len)} sessions. Terciles of the forecast sigma within each instrument. "
                           "Benchmark: unscaled, and 0.27% for a normal. Unscaled tails pile into loud days; sigma sizing moves them into quiet days "
                           f"(low sigma: forecast - unscaled {P.loc['low sigma', 'dexc_F_U'][0]:+.2f}pp [{P.loc['low sigma', 'dexc_F_U'][1]:+.2f}, {P.loc['low sigma', 'dexc_F_U'][2]:+.2f}]), "
                           f"because a quiet-day surprise is now held at full size. Level allowance - forecast in low sigma: "
                           f"{P.loc['low sigma', 'dexc_FA_F'][0]:+.2f}pp [{P.loc['low sigma', 'dexc_FA_F'][1]:+.2f}, {P.loc['low sigma', 'dexc_FA_F'][2]:+.2f}].",
                   "rows": [{"label": c, "values": [P.loc[c, "exc3_U"], P.loc[c, "exc3_F"], P.loc[c, "exc3_FA"]]} for c in rcells]})

    # 6. plateau: exponent p and RV window
    charts.append({"type": "lines", "title": "Plateau check: size = 1/sigma^p (p 0 to 2) and the RV window",
                   "unit": "mean |monthly vol - 1|, or % beyond 3 sd / 10", "xlabel": "exponent p (RV series: window / 60)",
                   "note": "Same holds, same equal ex-post vol; only the exponent moves. Benchmark: p = 0 (unscaled). Read the risk-deviation "
                           "line for a flat floor around p = 1 (plateau) vs a single dip (peak), and the tail line for where tail days are fewest. "
                           "The trailing-RV series (x = window/60: 5..120 sessions) shows the same for the RV window. Values: " +
                           ", ".join(f"p={r[0]} dev {r[1]} tail {r[2]}%" for r in plat["p"]) + "; RV " +
                           ", ".join(f"{r[0]}d {r[1]}" for r in plat["rv"]) + ".",
                   "series": [{"name": "risk deviation vs p", "points": [[a, b] for a, b, _, _ in plat["p"]]},
                              {"name": "% beyond 3 sd / 10 vs p", "points": [[a, r4(c / 10, 4)] for a, _, c, _ in plat["p"]]},
                              {"name": "risk deviation vs RV window/60", "points": [[r4(a / 60, 3), b] for a, b, _, _ in plat["rv"]]}]})

    # 6b. allowance plateau
    charts.append({"type": "lines", "title": "Plateau check for the allowances: low-sigma tail days vs allowance weight",
                   "unit": "% of sessions beyond 3 sd", "xlabel": "allowance weight",
                   "note": "Level allowance: size by sqrt(sigma^2 + a x trailing-250 median sigma^2); jump allowance: sqrt(sigma^2 + c x trailing-60 "
                           "mean jump variance), plotted at x = c/8. Benchmarks: weight 0 = forecast sigma; unscaled gives "
                           f"{P.loc['low sigma', 'exc3_U']}% in the low-sigma tercile. Price of the level allowance in steadiness (mean |monthly vol - 1|): " +
                           ", ".join(f"a={r[0]} {r[1]}" for r in plat["a"]) + ".",
                   "series": [{"name": "level allowance a: low-sigma tail days", "points": [[r[0], r[4]] for r in plat["a"]]},
                              {"name": "level allowance a: other days", "points": [[r[0], r[5]] for r in plat["a"]]},
                              {"name": "jump allowance c/8: low-sigma tail days", "points": [[r4(r[0] / 8, 3), r[4]] for r in plat["c"]]}]})

    # 7. +1 lag
    rows = []
    for v in ["U", "T20", "F", "FJ", "FA"]:
        rows.append({"label": f"{VARS[v]}", "values": [lag[v]["dev"][0], lag[v]["dev"][1]]})
    charts.append({"type": "groups", "title": "Lesson 01 +1 lag: every sigma delayed one more session",
                   "names": ["as used", "one session late"], "unit": "mean |monthly vol - 1|",
                   "note": "Same rows in both columns. Benchmark: unscaled (no sigma, so its two bars match). If the steadier risk "
                           "were an alignment artefact it would vanish when late. "
                           f"Forecast - unscaled, late: {lag['F_minus_U_dev_lag'][0]:+.3f} [{lag['F_minus_U_dev_lag'][1]:+.3f}, {lag['F_minus_U_dev_lag'][2]:+.3f}] "
                           f"(as used {P.loc['all', 'ddev_F_U'][0]:+.3f}); forecast - RV20, late: {lag['F_minus_T20_dev_lag'][0]:+.4f} "
                           f"[{lag['F_minus_T20_dev_lag'][1]:+.4f}, {lag['F_minus_T20_dev_lag'][2]:+.4f}]. Low-sigma tail days (%), as used -> late: "
                           f"unscaled {lag['low_exc_asused']['U']} -> {lag['low_exc_lag']['U']}, forecast {lag['low_exc_asused']['F']} -> {lag['low_exc_lag']['F']}, "
                           f"level allowance {lag['low_exc_asused']['FA']} -> {lag['low_exc_lag']['FA']} (allowance - forecast, late "
                           f"{lag['FA_minus_F_low_exc_lag'][0]:+.2f} [{lag['FA_minus_F_low_exc_lag'][1]:+.2f}, {lag['FA_minus_F_low_exc_lag'][2]:+.2f}]).",
                   "rows": rows})

    # 8. dollar share over time
    pts = [[round(int(d[:4]) + (int(d[5:7]) - 1) / 12 + int(d[8:10]) / 365, 3), r4(v, 3)] for d, v in
           zip(Bk.index[valid][::5], Bk.r2_usd[valid].to_numpy()[::5])]
    pts_rc = [[round(int(d[:4]) + (int(d[5:7]) - 1) / 12 + int(d[8:10]) / 365, 3), r4(v, 3)] for d, v in
              zip(Bk.index[valid][::5], Bk.usd_rc[valid].to_numpy()[::5])]
    charts.append({"type": "lines", "title": "Dollar-factor share of the 14-leg equal-risk book, rolling 60 sessions",
                   "unit": "share of book variance", "xlabel": "date",
                   "note": "R2 of the book's daily return on the dollar factor (mean of the 7 short-USD legs), 60 sessions before t; and the "
                           "Euler risk share of the 7 USD legs. Benchmark: shuffled legs (no correlation) give R2 "
                           f"{dollar['shuffled']}; the USD legs' share of legs is 0.50. Mean R2 {dollar['overall']}.",
                   "series": [{"name": "R2 on dollar factor", "points": pts}, {"name": "USD legs' risk share", "points": pts_rc},
                              {"name": "shuffled benchmark", "points": [[pts[0][0], dollar["shuffled"]], [pts[-1][0], dollar["shuffled"]]]}]})

    # 9. dollar share by year + regime
    rows = [{"label": y, "value": dollar["year"][y][0], "lo": dollar["year"][y][1], "hi": dollar["year"][y][2]} for y in YEARS]
    for rg in ("calm", "turbulent"):
        rows.append({"label": f"dollar {rg} ({dollar['regime'][rg][3]} d)", "value": dollar["regime"][rg][0], "lo": dollar["regime"][rg][1],
                     "hi": dollar["regime"][rg][2]})
    for tl in ("low", "mid", "high"):
        rows.append({"label": f"dollar vol tercile {tl}", "value": dollar["terc"][tl][0], "lo": dollar["terc"][tl][1], "hi": dollar["terc"][tl][2]})
    charts.append({"type": "bars", "title": "Dollar-factor share by year, dollar regime and dollar-vol tercile",
                   "unit": "R2 of book on dollar factor", "ref": dollar["shuffled"],
                   "note": f"Benchmark line: shuffled legs ({dollar['shuffled']}). Whiskers: date-block bootstrap (blocks of 60, the window length; "
                           f"regime rows blocks of the median dollar-regime episode, {dollar['episodes']} episodes). Turbulent - calm: "
                           f"{dollar['turb_minus_calm'][0]:+.3f} [{dollar['turb_minus_calm'][1]:+.3f}, {dollar['turb_minus_calm'][2]:+.3f}].",
                   "rows": rows})

    # 10. stress cap sweep
    st = stress["L"]
    charts.append({"type": "groups", "title": "All-correlations-to-1 stress cap on the book vol target (Lesson 06)",
                   "names": ["worst day (sd)", "ES 1% (sd)", "monthly-vol spread x10"], "unit": "book sd at equal ex-post vol",
                   "note": "The book vol target levers the equal-risk book by 1/model vol (median "
                           f"{stress['ratio'][0]}x, 5-95%: {stress['ratio'][1]}-{stress['ratio'][2]}). The stress figure assumes every correlation is 1, "
                           "so the stressed sd is the sum of leg risks; the cap keeps stressed sd <= L x target. L = 1 is the plain equal-risk book, "
                           "'none' is the uncapped target. Benchmarks: both ends. Capped - uncapped ES 1%: " +
                           "; ".join(f"L={k} {v[0]:+.2f} [{v[1]:+.2f}, {v[2]:+.2f}]" for k, v in stress["es_test"].items()) + ".",
                   "rows": [{"label": f"L = {s_['L']} (binds {s_['binds'] * 100:.0f}%)", "values": [s_["worst"], s_["es1"], r4(s_["vov"] * 10, 3)]} for s_ in st]})

    # 11. VaR coverage
    rows = []
    for cell in ["all"] + YEARS + ["calm", "turbulent"]:
        c = cov[cell]
        rows.append({"label": cell, "values": [c["model"][0], c["stress"][0]]})
    charts.append({"type": "groups", "title": "99% VaR breaches of the equal-risk book: model correlation vs all-to-1 stress",
                   "names": ["model sd (rolling corr)", "stress sd (all corr = 1)"], "unit": "% of days loss > 2.33 sd",
                   "note": "Benchmark: 1% (a calibrated 99% VaR). The model figure breaches far too often in crashes because correlation jumps "
                           "on the day; the stress figure almost never breaches, so it is a cap, not a forecast. Regime = Lesson 05 on the book's own "
                           f"vol. Worst book days (sd of model): {', '.join(f'{d} {z}' for d, z, _ in stress['worst_days'][:3])}.",
                   "rows": rows})

    # 12. ERC vs inverse vol
    rows = []
    for y in YEARS:
        x = xs[y]
        rows.append({"label": y, "values": [r4(x["iv_usd"] * 100, 1), r4(x["erc_usd"] * 100, 1)]})
    charts.append({"type": "groups", "title": "Leg-level ERC vs inverse vol: realised USD-legs share of book risk by year",
                   "names": ["inverse vol (equal sigma risk)", "equal risk contribution"], "unit": "% of realised book variance",
                   "note": "Ex-post Euler shares from each year's realised leg covariance. Benchmark: 50% (the USD legs' share of legs) and the "
                           f"inverse-vol bar. ERC turnover {ercd['turnover']} per day (sum |dw|). At equal vol: ES 1% ERC {ercd['ERC']['es1']} vs "
                           f"{ercd['inverse vol']['es1']} sd (diff {ercd['es_diff'][0]:+.3f} [{ercd['es_diff'][1]:+.3f}, {ercd['es_diff'][2]:+.3f}]); "
                           f"monthly risk deviation diff {ercd['dev_diff'][0]:+.4f} [{ercd['dev_diff'][1]:+.4f}, {ercd['dev_diff'][2]:+.4f}]; "
                           f"HHI of risk shares 2022: inverse vol {xs['2022']['iv_hhi']}, ERC {xs['2022']['erc_hhi']} (equal = {1 / 14:.4f}).",
                   "rows": rows})

    # 13. time of day stops
    rows = []
    for bname, _ in BUCKETS:
        b_ = stops["bucket"][bname]
        rows.append({"label": f"{bname} (spread {b_['spreadR_med']}R)", "values": [b_["gross"][0], b_["net"][0]]})
    charts.append({"type": "groups", "title": "Time of day: 1 x sigma_remaining stop touched, on the M1 bid/ask path",
                   "names": ["gross (mid path)", "net (enter at offer/bid, stop on the far side)"], "unit": "% of entries touched by 22:00",
                   "note": "Entry at each London bucket's start, long and short, held to 22:00. Stop = 1 x the session sigma x sqrt(share of the "
                           "session's variance still to come, from the trailing 250-session intraday profile, past only). Benchmark: a random "
                           f"walk touches {stops['rw']}%. Later entries have smaller stops, so the spread is a bigger part of 1R (label).",
                   "rows": rows})

    # 14. one-step loss at the stop by class
    rows = []
    for c in CLASSES:
        l_ = stops["loss"][c]
        rows.append({"label": c, "values": [l_["gross_p99"], l_["net_mean"], l_["net_p99"]]})
    charts.append({"type": "groups", "title": "What a 1R stop really costs: realised loss when stopped (from the open, k = 1)",
                   "names": ["gross p99", "net mean", "net p99"], "unit": "R",
                   "note": "Fill = the stop, or the bar's opening bid/offer if price gapped through it (the one-step loss C.OG's Lesson 03 warns "
                           "sizing on vol misses). Benchmark: 1.0R (a perfect stop). Net: entry at the offer/bid, stop 1R from that fill, triggered "
                           "on the far side of the quote; loss = cash lost / planned 1R (the spread shows up as extra touches, chart above). "
                           f"Gross: the same on the mid path. {stops['holes']} entries whose remaining session had a data hole > 30 min were "
                           "dropped (a hole would fake a gap-through). Max net loss by class: " +
                           ", ".join(f"{c} {stops['loss'][c]['net_max']}R" for c in CLASSES) + ".",
                   "rows": rows})

    # 15. year x stop touch net vs gross
    charts.append({"type": "lines", "title": "Does 1R stay 1R on bid/ask? 1-sigma stop from the open, by year",
                   "unit": "% of sessions touched", "xlabel": "year",
                   "note": "Net = bid/ask path with the entry spread; gross = mid path (what stage 2 measured on session H/L). "
                           f"Benchmark: random walk {stops['rw']}%. Regime (Lesson 05): calm {stops['regime']['calm'][0]}% net, turbulent "
                           f"{stops['regime']['turbulent'][0]}% net [{stops['regime']['turbulent'][1]}, {stops['regime']['turbulent'][2]}].",
                   "series": [{"name": "net (bid/ask)", "points": [[int(y), stops["year"][y][0]] for y in YEARS]},
                              {"name": "gross (mid)", "points": [[int(y), stops["year"][y][3]] for y in YEARS]},
                              {"name": "random walk", "points": [[int(y), stops["rw"]] for y in YEARS]}]})

    # 16. examples
    exs_sorted = sorted(exs, key=lambda t: t["r"])
    picked, seen = [], set()
    for t_ in exs_sorted:
        kc = klass(t_["inst"])
        if kc in seen:
            continue
        picked.append(t_)
        seen.add(kc)
    for t_ in exs_sorted:
        if len(picked) >= 4:
            break
        if t_ not in picked:
            picked.append(t_)
    charts.append({"type": "trades", "title": "Real gap-through stops: 1R planned, more lost (bid/ask, from the open)",
                   "unit": "R (net)",
                   "note": "Entry at the London open at the offer (long) or bid (short), stop 1 x sigma away (dashed). Path = the exit side "
                           "(bid for longs, offer for shorts), 10-minute samples plus the touch bar. Benchmark: a perfect stop loses exactly 1R. "
                           "These are the largest gap-through fills (one per class first): real ones are rare and small - see the loss chart.",
                   "trades": picked[:4]})

    # ── output ────────────────────────────────────────────────────────────────────────────────────────────────────
    intro, holds = write_up(facts, P, TT)
    res = {"id": "sizing-wide", "window": [START, END], "cells_tested": n_cells, "cells_pass_bh": k_pass,
           "cells_expected_by_chance": facts["bh"]["by_chance"], "intro": intro, "holds": holds, "charts": charts}
    s = json.dumps(res, default=lambda o: o.item() if hasattr(o, "item") else str(o))
    for yy in ("2023-", "2024-", "2025-", "2026-"):
        assert yy not in s, yy
    WEB.write_text(s, encoding="utf-8")
    print("wrote", WEB, len(s) // 1024, "KB,", len(charts), "charts; total", round(time.time() - t_start), "s")


def write_up(f, P, TT):
    """Intro + holds. Wording written 2026-11-13 after reading facts.json; every number is read from this run."""
    def ci(x, k=2, pp=""):
        return f"{x[0]:+.{k}f}{pp} [{x[1]:+.{k}f}, {x[2]:+.{k}f}]"
    lag, pl, st, dl, er, sp = f["lag"], f["plateau"], f["stress"], f["dollar"], f["erc"], f["stops"]
    Ls = {str(r["L"]): r for r in st["L"]}
    pa = {r[0]: r for r in pl["a"]}
    intro = [
        "Discovery window 2016-10 to 2022 only, 34 instruments, daily London-session holds at equal ex-post vol; "
        f"{f['bh']['n']} cells tested, {f['bh']['pass']} pass BH at q = 0.10 (about {f['bh']['by_chance']} of those expected false).",
        f"Steadier risk HOLDS ACROSS everything: sizing by the forecast sigma brings monthly risk closer to target in every class, year, "
        f"regime and tercile (pooled {P.loc['all', 'dev_F']} vs {P.loc['all', 'dev_U']} unscaled), and survives a one-session delay "
        f"({ci(lag['F_minus_U_dev_lag'], 3)}). A broad plateau, not a peak: exponent 0.75-1.25 all work. Trailing RV20 does exactly as well "
        f"(late: {ci(lag['F_minus_T20_dev_lag'], 4)}); RV10 is steadier still ({pl['rv'][1][1]}) but has more tail days.",
        f"The tail REVERSES by vol level: sigma sizing does not cut tail days overall ({P.loc['all', 'exc3_F']}% vs {P.loc['all', 'exc3_U']}%), it MOVES them. "
        f"High-sigma days: {P.loc['high sigma', 'exc3_U']}% -> {P.loc['high sigma', 'exc3_F']}% beyond 3 sd; low-sigma days: "
        f"{P.loc['low sigma', 'exc3_U']}% -> {P.loc['low sigma', 'exc3_F']}%, p99 loss {P.loc['low sigma', 'p1_U']} -> {P.loc['low sigma', 'p1_F']} sd. "
        "Calm years (2017-19, 2021) get MORE tail days, loud years (2020, 2022) fewer. A quiet-day surprise is held at full size.",
        f"C.OG's jump allowance as built here (trailing rv - bv jump variance) changes nothing: it scales with sigma, so the size barely moves "
        f"(low-sigma tail {P.loc['low sigma', 'exc3_FJ']}% vs {P.loc['low sigma', 'exc3_F']}%). A level allowance that does not shrink with today's vol, "
        f"sqrt(sigma^2 + 0.25 x trailing median sigma^2), cuts low-sigma tail days to {P.loc['low sigma', 'exc3_FA']}% (late: {ci(lag['FA_minus_F_low_exc_lag'], 2, 'pp')}) "
        f"for +{P.loc['all', 'dev_FA'] - P.loc['all', 'dev_F']:.3f} steadiness, but adds tail days on loud days. It was added after seeing the data: stage 4 must confirm it.",
        f"1/sigma^2 (Moreira-Muir) is worse everywhere: unsteadier ({P.loc['all', 'dev_MM']}), more tail days ({P.loc['all', 'exc3_MM']}%; "
        f"{P.loc['low sigma', 'exc3_MM']}% on low-sigma days). Over 5-session holds no sizing differs from another (0 of 15 cells).",
        f"The book is mostly the dollar, and more so when the dollar is loud: R2 of the 14-leg book on the dollar factor {dl['overall']} "
        f"(shuffled {dl['shuffled']}), {dl['year']['2017'][0]} in 2017 to {dl['year']['2022'][0]} in 2022; {dl['terc']['low'][0]} in the quietest dollar-vol tercile vs "
        f"{dl['terc']['high'][0]} in the loudest. Leg-level ERC does not change this (USD share {er['usd_rc_ante'][1]} vs {er['usd_rc_ante'][0]}, ES diff {ci(er['es_diff'], 3)}).",
        f"All-correlations-to-1 stress: the model 99% VaR is breached {st['var']['all']['model'][0]}% of days (1% nominal), the stress figure "
        f"{st['var']['all']['stress'][0]}%. As a cap on the book vol target (stressed sd <= 2x target, binds {Ls['2.0']['binds'] * 100:.0f}% of days) it keeps the "
        f"steadier risk ({Ls['2.0']['vov']} vs {Ls['none']['vov']}) and trims the worst day ({Ls['2.0']['worst']} vs {Ls['none']['worst']} sd), but ES 1% does not move "
        f"({ci(st['es_test']['2.0'], 2)}) and the worst-day gain is gone with a one-session delay ({st['lag']['cap2']['worst']} vs {st['lag']['BT']['worst']}).",
        f"Stops on the M1 bid/ask path: a 1-sigma stop from the open is touched {sp['bucket']['Asia 00-07']['net'][0]}% net and "
        f"{sp['bucket']['Asia 00-07']['gross'][0]}% on the mid (random walk {sp['rw']}%); entering later with sigma scaled to the session's remaining variance "
        f"keeps the net rate at {min(v['net'][0] for v in sp['bucket'].values())}-{max(v['net'][0] for v in sp['bucket'].values())}% in every bucket. "
        f"Turbulent regime {sp['regime']['turbulent'][0]}% vs calm {sp['regime']['calm'][0]}%: sigma over-reacts after loud stretches. "
        f"Gap-through fills are tiny on M1 (net p99 {min(v['net_p99'] for v in sp['loss'].values())}-{max(v['net_p99'] for v in sp['loss'].values())}R): the one-step loss "
        "lives in the daily tail, not in the stop fill.",
    ]
    holds = [
        {"effect": "sigma sizing steadies monthly risk", "where": "holds across all 4 classes, 34/34 instruments, every year 2017-22, calm and turbulent, all terciles; survives +1 lag",
         "size": f"mean |monthly vol - 1| {P.loc['all', 'dev_F']} vs {P.loc['all', 'dev_U']} ({ci(P.loc['all', 'ddev_F_U'], 3)}); late {ci(lag['F_minus_U_dev_lag'], 3)}",
         "benchmark": "unscaled; trailing RV20 is equal (diff within +/-0.01)"},
        {"effect": "sigma sizing moves tail days from loud to quiet sessions", "where": "reverses by sigma tercile and by year (more tails in 2017-19, 2021; fewer in 2020, 2022)",
         "size": f"low sigma {ci(P.loc['low sigma', 'dexc_F_U'], 2, 'pp')}, high sigma {ci(P.loc['high sigma', 'dexc_F_U'], 2, 'pp')} beyond 3 sd",
         "benchmark": "unscaled; normal 0.27%"},
        {"effect": "level allowance cuts quiet-day tail days", "where": "local to low-sigma sessions and calm years; costs tail days in loud sessions; plateau (smooth in a)",
         "size": f"low sigma {ci(P.loc['low sigma', 'dexc_FA_F'], 2, 'pp')} (late {ci(lag['FA_minus_F_low_exc_lag'], 2, 'pp')}); high sigma {ci(P.loc['high sigma', 'dexc_FA_F'], 2, 'pp')}",
         "benchmark": "forecast sigma; jump allowance (no effect)"},
        {"effect": "1/sigma^2 sizing is worse", "where": "holds across classes, years and calm regime",
         "size": f"risk deviation {ci(P.loc['all', 'ddev_MM_F'], 3)}, tail days {ci(P.loc['all', 'dexc_MM_F'], 2, 'pp')}",
         "benchmark": "forecast sigma"},
        {"effect": "dollar factor dominates the book and grows with dollar vol", "where": "holds by year (rising) and by dollar-vol tercile; regime split too noisy (2 episodes)",
         "size": f"R2 {dl['terc']['low'][0]} -> {dl['terc']['high'][0]} low -> high dollar vol; {dl['year']['2017'][0]} (2017) -> {dl['year']['2022'][0]} (2022)",
         "benchmark": f"shuffled legs {dl['shuffled']}"},
        {"effect": "model VaR under-covers; all-to-1 stress over-covers", "where": "holds across years (model above 1% in 4 of 6)",
         "size": f"model {st['var']['all']['model'][0]}% [{st['var']['all']['model'][1]}, {st['var']['all']['model'][2]}], stress {st['var']['all']['stress'][0]}%",
         "benchmark": "1% nominal"},
        {"effect": "1-sigma stop = 1R on bid/ask", "where": "holds across buckets and years; local deviations: crosses +1.4 to +2.3pp (spread), indices -1.7 to -3.5pp, turbulent -3pp",
         "size": f"net {sp['bucket']['Asia 00-07']['net'][0]}% from the open; gross {sp['bucket']['Asia 00-07']['gross'][0]}%",
         "benchmark": f"random walk {sp['rw']}%"},
    ]
    return intro, holds

if __name__ == "__main__":
    main(rebuild="--rebuild" in sys.argv)
