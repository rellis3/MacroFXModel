#!/usr/bin/env python3
"""expiry-tracker scoring: does an option expiry's book lean mark which side of today's price it settles on?

Implements forge/EXPIRY_TRACKER_PREREG.md exactly (P1 side, P2 build-before-move, P3 hand-over, the trailing-return
control, the all-shift expiry placebo, the strike-shift description, both halves, the mirror, Holm over the three
scored cells, BH over the slices) and amendment A1 (the positive control shuffles outcomes before planting).

Inputs (read-only; never writes to R2):
  --oi DIR      the Databento pulls `OI Data/<PAIR>.csv` (date, expiry, strike, right, settlement, open_interest, ...)
  --prices DIR  New York-close daily closes per instrument, `<KEY>.csv` with columns date,close (the repo's OANDA
                cut: analysis/output/swing-leg-baserates/daily_m15/, extend it past 2026-08-21 for the forward record)

Stages, in the order the prereg requires (each refuses to run if the one before it has not been done on the same rows):
  python oi_research_book/scripts/41_expiry_pull_score.py count    --oi "OI Data" --prices <dir>
      builds the rows (leans, sigma, reads, floors) and the power table from counts, the control SD of R and its
      intra-month correlation. No lean-outcome product is computed.
  python oi_research_book/scripts/41_expiry_pull_score.py controls --oi "OI Data" --prices <dir>
      A1: outcomes shuffled within instrument. Shuffled + planted 0.25 must pass P1's gate; shuffled alone must not.
  python oi_research_book/scripts/41_expiry_pull_score.py run      --oi "OI Data" --prices <dir>
      the real scoring -> analysis/output/expiry-tracker/{results.json, RESULTS.md, rows.csv}
  python oi_research_book/scripts/41_expiry_pull_score.py forward  --track <dir of expiry_track JSON> --prices <dir>
      the forward record from the live capture (descriptive; never changes a verdict)
  python oi_research_book/scripts/41_expiry_pull_score.py --selftest
      synthetic books and prices with and without a planted pull: the whole pipeline end to end, no real data
"""
import argparse
import hashlib
import importlib.util
import json
import math
import os
import sys

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from pair_config import cfg  # noqa: E402

_spec = importlib.util.spec_from_file_location("track40", os.path.join(HERE, "40_expiry_track_history.py"))
track40 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(track40)

SEED = 20261101
LOCKBOX = pd.Timestamp("2026-08-21")
SCORE_FROM = pd.Timestamp("2020-10-01")
HALF_SPLIT = pd.Timestamp("2023-09-01")
OUT = "analysis/output/expiry-tracker"
INSTRUMENTS = {  # prereg §3.1: OI file pair -> price key
    "EUR_USD": "EURUSD", "GBP_USD": "GBPUSD", "AUD_USD": "AUDUSD", "USD_CAD": "USDCAD",
    "USD_CHF": "USDCHF", "USD_JPY": "USDJPY", "NAS100_USD": "NAS100", "SPX500_USD": "SPX500",
}
INDICES = {"NAS100_USD", "SPX500_USD"}
TAIL = 0.35          # §3.5
FLOOR = 0.10         # §3.2
BAL = 0.05           # §3.5 balanced band
AWAY = 0.01          # §3.7 P2 "away from F"
BUILD_MIN = 0.02     # §3.7 P2
H_MAIN, H_SHORT = 20, 10
BAR = 0.25           # §4 pass bar
ALPHA = 0.05
B_BOOT = 2000
PLANT = 0.25         # A1


# ── small stats helpers (normal quantiles without scipy) ────────────────────────────────────────────────────────────
def norm_ppf(p):
    # Acklam's rational approximation, |error| < 1.2e-9
    a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00]
    b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01]
    c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00]
    d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00]
    pl = 0.02425
    if p < pl:
        q = math.sqrt(-2 * math.log(p))
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    if p > 1 - pl:
        return -norm_ppf(1 - p)
    q = p - 0.5
    r = q * q
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)


def mde(sd, n, deff, alpha, power=0.8):
    if n <= 0:
        return float("inf")
    return (norm_ppf(1 - alpha / 2) + norm_ppf(power)) * sd * math.sqrt(deff / n)


def holm(pvals, alpha=ALPHA):
    order = sorted(range(len(pvals)), key=lambda i: pvals[i])
    adj, running = [None] * len(pvals), 0.0
    for rank, i in enumerate(order):
        running = max(running, min(1.0, (len(pvals) - rank) * pvals[i]))
        adj[i] = running
    return adj


def bh(pvals, q=0.10):
    m = len(pvals)
    order = sorted(range(m), key=lambda i: pvals[i])
    passed, kmax = [False] * m, -1
    for rank, i in enumerate(order, 1):
        if pvals[i] <= rank / m * q:
            kmax = rank
    for rank, i in enumerate(order, 1):
        passed[i] = rank <= kmax
    return passed


def bs_gamma(f, k, t, sig):
    t = max(t, 1 / 365)
    d1 = (math.log(f / k) + 0.5 * sig * sig * t) / (sig * math.sqrt(t))
    return math.exp(-0.5 * d1 * d1) / math.sqrt(2 * math.pi) / (f * sig * math.sqrt(t))


# ── data ────────────────────────────────────────────────────────────────────────────────────────────────────────────
def load_forwards(path, inverted):
    """F per (date, expiry) from put-call parity on the settlements, raw CME terms, then OANDA convention (§3.4)."""
    df = pd.read_csv(path, usecols=["date", "expiry", "strike", "right", "settlement"], parse_dates=["date", "expiry"])
    df["date"] = pd.to_datetime(df["date"]).dt.tz_localize(None).dt.normalize()
    exp = pd.to_datetime(df["expiry"])
    if getattr(exp.dt, "tz", None) is not None:
        exp = exp.dt.tz_convert("UTC").dt.tz_localize(None)
    df["expiry"] = exp.dt.normalize()
    df["right"] = df["right"].astype(str).str.upper().str[0]
    df = df[df["settlement"].notna() & df["right"].isin(["C", "P"])]
    w = df.pivot_table(index=["date", "expiry", "strike"], columns="right", values="settlement", aggfunc="first").dropna()
    if w.empty:
        return {}
    w = w.reset_index()
    w["gap"] = (w["C"] - w["P"]).abs()
    best = w.loc[w.groupby(["date", "expiry"])["gap"].idxmin()]
    best = best.assign(F=best["strike"] + best["C"] - best["P"])
    best = best[best["F"] > 0]
    if inverted:
        best = best.assign(F=1.0 / best["F"])
    return {(d, e): f for d, e, f in zip(best["date"], best["expiry"], best["F"])}


def load_prices(prices_dir, key):
    p = pd.read_csv(os.path.join(prices_dir, f"{key}.csv"), parse_dates=["date"])
    p = p[p["date"].dt.dayofweek < 5].drop_duplicates("date", keep="last").sort_values("date").reset_index(drop=True)
    r = np.log(p["close"]).diff()
    p["sigma"] = r.rolling(60, min_periods=40).std()
    p["ret20"] = np.log(p["close"] / p["close"].shift(20))
    p["mean20"] = p["close"].rolling(20).mean()
    return p


class Book:
    """Per (OI trade date, expiry): strikes (OANDA convention), call OI, put OI. Built once from track40.build()."""
    def __init__(self, track):
        self.by = {}
        for (d, e), g in track.groupby(["date", "expiry"], sort=False):
            self.by[(d, e)] = (g["strike"].to_numpy(float), g["call_oi"].to_numpy(float), g["put_oi"].to_numpy(float))
        self.dates = np.array(sorted({d for d, _ in self.by}), dtype="datetime64[ns]")
        self.expiries_on = {}
        for d, e in self.by:
            self.expiries_on.setdefault(d, []).append(e)

    def get(self, d, e):
        return self.by.get((d, e))

    def last_date_before(self, t, max_gap_days=7):
        i = np.searchsorted(self.dates, np.datetime64(t), side="left") - 1
        if i < 0:
            return None
        d = pd.Timestamp(self.dates[i])
        return d if (t - d).days <= max_gap_days else None


def tail_cut(book, f):
    k, c, p = book
    m = np.abs(k / f - 1) <= TAIL
    return k[m], c[m], p[m]


def lean_of(book, f):
    """§3.5 on a tail-cut book in OANDA convention: (pull, shareAbove, L, total)."""
    k, c, p = tail_cut(book, f)
    oi = c + p
    tot = oi.sum()
    if tot <= 0 or len(k) < 2:
        return None
    centre = (k * oi).sum() / tot
    above, below = oi[k > f].sum(), oi[k < f].sum()
    share = above / (above + below) if above + below > 0 else None
    pull = centre / f - 1
    lean = 0 if share is None or abs(share - 0.5) < BAL else int(np.sign(pull))
    return pull, share, lean, tot


# ── rows ────────────────────────────────────────────────────────────────────────────────────────────────────────────
def build_rows(pair, track, fwd, prices, end=LOCKBOX, start=SCORE_FROM):
    c = cfg(pair)
    book = Book(track)
    dates = prices["date"].to_numpy("datetime64[ns]")
    close, sigma = prices["close"].to_numpy(float), prices["sigma"].to_numpy(float)
    ret20, mean20 = prices["ret20"].to_numpy(float), prices["mean20"].to_numpy(float)
    day_total = {}
    for d, exps in book.expiries_on.items():
        tot = 0.0
        for e in exps:
            f = fwd.get((d, e))
            if f:
                k, cc, pp = tail_cut(book.get(d, e), f)
                tot += (cc + pp).sum()
        day_total[d] = tot
    expiries = sorted({e for _, e in book.by})
    rows = []
    for e in expiries:
        if e < start or e > end:
            continue
        iE = np.searchsorted(dates, np.datetime64(e), side="right") - 1
        if iE < 0 or pd.Timestamp(dates[iE]) < e - pd.Timedelta(days=4):
            continue
        for h in (H_MAIN, H_SHORT):
            r = iE - h
            if r < 61 or not np.isfinite(sigma[r]):
                continue
            read = pd.Timestamp(dates[r])
            D = book.last_date_before(read)
            if D is None or book.get(D, e) is None or (D, e) not in fwd:
                continue
            f = fwd[(D, e)]
            le = lean_of(book.get(D, e), f)
            if le is None:
                continue
            pull, share, L, tot = le
            if day_total.get(D, 0) <= 0 or tot < FLOOR * day_total[D]:
                continue
            s0, sE, sg = close[r], close[iE], sigma[r]
            R = math.log(sE / s0) / (sg * math.sqrt(h))
            z20 = ret20[r] / (sg * math.sqrt(20)) if np.isfinite(ret20[r]) else 0.0
            dev20 = (s0 - mean20[r]) / (sg * s0) if np.isfinite(mean20[r]) else 0.0
            shift = math.exp(sg * math.sqrt(h))
            lp = lean_of(book.get(D, e), f * shift)
            lm = lean_of(book.get(D, e), f / shift)
            # gamma regime of this expiry alone at a flat realised vol (slice only); inverted pairs: CME calls are puts
            k, cc, pp = tail_cut(book.get(D, e), f)
            if c["inverted"]:
                cc, pp = pp, cc
            T = max(1, (e - D).days) / 365
            gex = sum((cc[i] - pp[i]) * bs_gamma(f, k[i], T, sg * math.sqrt(252)) for i in range(len(k)))
            row = dict(pair=pair, expiry=e, h=h, D=D, read=read, F=f, s0=s0, sE=sE, sigma=sg, pull=pull, share=share,
                       L=L, R=R, z20=z20, dev20=dev20, tot=tot, Lplus=lp[2] if lp else 0, Lminus=lm[2] if lm else 0,
                       gamma="PIN" if gex > 0 else "BREAKOUT", month=e.strftime("%Y-%m"))
            if h == H_SHORT:
                row.update(build_signal(book, e, D, H_MAIN, iE, dates, fwd))
            rows.append(row)
    out = pd.DataFrame(rows)
    if len(out):
        # expiry type: the month's biggest expiry at its h=20 read is standard (quarterly in Mar/Jun/Sep/Dec), others weekly
        m20 = out[out["h"] == H_MAIN]
        big = m20.loc[m20.groupby("month")["tot"].idxmax(), "expiry"] if len(m20) else []
        std = set(big)
        out["etype"] = [("quarterly" if e.month in (3, 6, 9, 12) else "monthly") if e in std else "weekly" for e in out["expiry"]]
    return out


def build_signal(book, e, D10, h20, iE, dates, fwd):
    """§3.7 P2: OI built > 1% above vs below F between the h=20 and h=10 reads, / the expiry's OI at the h=20 read."""
    r20 = iE - h20
    if r20 < 0:
        return {"B": None, "LB": 0}
    D20 = book.last_date_before(pd.Timestamp(dates[r20]))
    if D20 is None or book.get(D20, e) is None or (D20, e) not in fwd:
        return {"B": None, "LB": 0}
    base = lean_of(book.get(D20, e), fwd[(D20, e)])
    if base is None:
        return {"B": None, "LB": 0}
    ds = [pd.Timestamp(x) for x in book.dates if D20 <= pd.Timestamp(x) <= D10 and book.get(pd.Timestamp(x), e) is not None]
    above = below = 0.0
    prev = None
    for d in ds:
        k, c, p = book.get(d, e)
        cur = dict(zip(np.round(k, 10), c + p))
        if prev is not None and cur != prev:
            f = fwd.get((d, e))
            if f:
                for kk in set(cur) | set(prev):
                    dOI = cur.get(kk, 0.0) - prev.get(kk, 0.0)
                    if kk > f * (1 + AWAY):
                        above += dOI
                    elif kk < f * (1 - AWAY):
                        below += dOI
        prev = cur
    B = (above - below) / base[3]
    return {"B": B, "LB": int(np.sign(B)) if abs(B) >= BUILD_MIN else 0}


def handover_rows(pair, track, fwd, prices, end=LOCKBOX, start=SCORE_FROM):
    """§3.7 P3: near expiry N 4-10 sessions out (first read at 10), next expiry X within 30 sessions, opposite leans."""
    book = Book(track)
    dates = prices["date"].to_numpy("datetime64[ns]")
    close, sigma = prices["close"].to_numpy(float), prices["sigma"].to_numpy(float)
    day_total = {}
    for d, exps in book.expiries_on.items():
        day_total[d] = sum((lambda b: (b[1] + b[2]).sum())(tail_cut(book.get(d, x), fwd[(d, x)])) for x in exps if (d, x) in fwd)
    exps = sorted({e for _, e in book.by if start <= e <= end})
    idx = {e: np.searchsorted(dates, np.datetime64(e), side="right") - 1 for e in exps}
    rows = []
    for N in exps:
        iN = idx[N]
        for hN in range(10, 3, -1):
            r = iN - hN
            if r < 61 or not np.isfinite(sigma[r]):
                continue
            read = pd.Timestamp(dates[r])
            D = book.last_date_before(read)
            if D is None:
                continue

            def floored(e):
                if book.get(D, e) is None or (D, e) not in fwd:
                    return None
                le = lean_of(book.get(D, e), fwd[(D, e)])
                return le if le and day_total.get(D, 0) > 0 and le[3] >= FLOOR * day_total[D] else None
            lN = floored(N)
            if lN is None:
                continue
            X, lX = None, None
            for e in exps:
                if e <= N or idx[e] - r > 30:
                    continue
                lX = floored(e)
                if lX is not None:
                    X = e
                    break
            if X is None:
                break
            if lN[2] != 0 and lX[2] != 0 and lN[2] != lX[2]:
                sg, iX = sigma[r], idx[X]
                RN = math.log(close[iN] / close[r]) / (sg * math.sqrt(hN))
                RX = math.log(close[iX] / close[iN]) / (sg * math.sqrt(max(1, iX - iN)))
                rows.append(dict(pair=pair, expiry=N, next=X, read=read, hN=hN, LN=lN[2], LX=lX[2], RN=RN, RX=RX,
                                 score=(lN[2] * RN + lX[2] * RX) / math.sqrt(2), month=N.strftime("%Y-%m")))
            break
    return pd.DataFrame(rows)


# ── scoring ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def cluster_boot_mean(x, clusters, rng, B=B_BOOT):
    df = pd.DataFrame({"x": x, "c": clusters})
    g = df.groupby("c")["x"].agg(["sum", "count"])
    s, n = g["sum"].to_numpy(), g["count"].to_numpy()
    pick = rng.integers(0, len(g), size=(B, len(g)))
    means = s[pick].sum(1) / np.maximum(1, n[pick].sum(1))
    est = s.sum() / n.sum()
    lo, hi = np.percentile(means, [2.5, 97.5])
    p = 2 * min((means <= 0).mean(), (means >= 0).mean())
    return est, lo, hi, max(p, 1 / B), means


def cluster_boot_ols(y, X, clusters, rng, B=B_BOOT):
    """OLS y ~ X (X includes the intercept); returns coef of column 1 (L) and its cluster-bootstrap CI."""
    df = pd.DataFrame(X)
    df["y"], df["c"] = y, clusters
    keys = list(df.groupby("c").groups)
    XtX, Xty = [], []
    for _, g in df.groupby("c"):
        xm = g.drop(columns=["y", "c"]).to_numpy(float)
        XtX.append(xm.T @ xm)
        Xty.append(xm.T @ g["y"].to_numpy(float))
    XtX, Xty = np.array(XtX), np.array(Xty)
    beta = np.linalg.lstsq(XtX.sum(0), Xty.sum(0), rcond=None)[0]
    bs = []
    for _ in range(B):
        pick = rng.integers(0, len(keys), len(keys))
        try:
            bs.append(np.linalg.solve(XtX[pick].sum(0), Xty[pick].sum(0))[1])
        except np.linalg.LinAlgError:
            continue
    lo, hi = np.percentile(bs, [2.5, 97.5])
    return beta[1], lo, hi


def expiry_shift_placebo(rows, Lcol, score_of):
    """All circular shifts of the lean within each instrument (prereg §3.8): the pooled mean per shift."""
    groups = [g.sort_values("expiry") for _, g in rows.groupby("pair")]
    kmax = min(len(g) for g in groups) - 1
    out = []
    for k in range(1, max(1, kmax) + 1):
        parts = []
        for g in groups:
            Ls = np.roll(g[Lcol].to_numpy(), k)
            v = score_of(Ls, g)
            parts.append(v[Ls != 0])
        allv = np.concatenate(parts) if parts else np.array([])
        if len(allv):
            out.append(allv.mean())
    return np.array(out)


def score_cell(name, rows, Lcol, Rcol, rng, n_cells=3, power_row=None):
    use = rows[rows[Lcol] != 0].copy()
    if len(use) < 5:
        return {"cell": name, "n": int(len(use)), "verdict": "UNDERPOWERED", "note": "fewer than 5 scored rows"}
    x = use[Lcol].to_numpy() * use[Rcol].to_numpy()
    est, lo, hi, p, _ = cluster_boot_mean(x, use["month"].to_numpy(), rng)
    X = np.column_stack([np.ones(len(use)), use[Lcol].to_numpy(float), use.get("z20", pd.Series(0, index=use.index)).to_numpy(float),
                         use.get("dev20", pd.Series(0, index=use.index)).to_numpy(float)])
    if np.allclose(X[:, 2:], 0):
        X = X[:, :2]
    b, blo, bhi = cluster_boot_ols(use[Rcol].to_numpy(float), X, use["month"].to_numpy(), rng)
    halves = {}
    for tag, m in (("first", use["expiry"] < HALF_SPLIT), ("second", use["expiry"] >= HALF_SPLIT)):
        halves[tag] = float(x[m.to_numpy()].mean()) if m.any() else None
    plc = expiry_shift_placebo(rows, Lcol, lambda Ls, g: Ls * g[Rcol].to_numpy())
    pct = float((plc <= est).mean()) if len(plc) else None
    return {"cell": name, "n": int(len(use)), "n_balanced": int((rows[Lcol] == 0).sum()), "mean": float(est), "ci": [float(lo), float(hi)],
            "p": float(p), "hit": float((x > 0).mean()), "b": float(b), "b_ci": [float(blo), float(bhi)], "halves": halves,
            "placebo_pct": pct, "placebo_shifts": int(len(plc)), "placebo_sd": float(plc.std()) if len(plc) else None,
            "power": power_row}


def score_p3(h, rng, power_row=None):
    """P3 (§3.7): the hand-over score (LN*RN + LX*RX)/sqrt(2), cluster-bootstrapped. Its controls, adapted to two legs:
    the lean coefficient from both legs stacked (each leg's own return on its own lean), and a placebo that shifts the
    (LN, LX) pair across reads within each instrument."""
    x = h["score"].to_numpy(float)
    est, lo, hi, p, _ = cluster_boot_mean(x, h["month"].to_numpy(), rng)
    legs = pd.concat([pd.DataFrame({"y": h["RN"], "L": h["LN"], "c": h["month"]}), pd.DataFrame({"y": h["RX"], "L": h["LX"], "c": h["month"]})], ignore_index=True)
    b, blo, bhi = cluster_boot_ols(legs["y"].to_numpy(float), np.column_stack([np.ones(len(legs)), legs["L"].to_numpy(float)]), legs["c"].to_numpy(), rng)
    halves = {"first": float(x[(h["expiry"] < HALF_SPLIT).to_numpy()].mean()) if (h["expiry"] < HALF_SPLIT).any() else None,
              "second": float(x[(h["expiry"] >= HALF_SPLIT).to_numpy()].mean()) if (h["expiry"] >= HALF_SPLIT).any() else None}
    groups = [g.sort_values("expiry") for _, g in h.groupby("pair")]
    kmax = min(len(g) for g in groups) - 1
    plc = []
    for k in range(1, max(1, kmax) + 1):
        v = np.concatenate([(np.roll(g["LN"].to_numpy(), k) * g["RN"].to_numpy() + np.roll(g["LX"].to_numpy(), k) * g["RX"].to_numpy()) / math.sqrt(2) for g in groups])
        plc.append(v.mean())
    plc = np.array(plc)
    return {"cell": "P3 hand-over", "n": int(len(h)), "n_balanced": 0, "mean": float(est), "ci": [float(lo), float(hi)], "p": float(p),
            "hit": float((x > 0).mean()), "b": float(b), "b_ci": [float(blo), float(bhi)], "halves": halves,
            "placebo_pct": float((plc <= est).mean()) if len(plc) else None, "placebo_shifts": int(len(plc)),
            "placebo_sd": float(plc.std()) if len(plc) else None, "power": power_row}


def decide(cells):
    """Holm over the scored cells, then the conjunctive gate and its mirror (§4), then the verdict word (§5)."""
    ps = [c.get("p", 1.0) for c in cells]
    adj = holm(ps)
    for c, pa in zip(cells, adj):
        c["p_holm"] = pa
        if "mean" not in c:
            continue
        hv = [v for v in c["halves"].values() if v is not None]
        gate = (c["mean"] >= BAR and pa < ALPHA and c["b_ci"][0] > 0 and len(hv) == 2 and all(v > 0 for v in hv)
                and c["placebo_pct"] is not None and c["placebo_pct"] >= 0.975)
        mirror = (c["mean"] <= -BAR and pa < ALPHA and c["b_ci"][1] < 0 and len(hv) == 2 and all(v < 0 for v in hv)
                  and c["placebo_pct"] is not None and c["placebo_pct"] <= 0.025)
        c["gate"], c["mirror"] = bool(gate), bool(mirror)
        mde_v = (c.get("power") or {}).get("mde")
        if gate:
            c["verdict"] = "VALIDATED"
        elif mirror:
            c["verdict"] = "VALIDATED (mirror: price settles against the book)"
        elif mde_v is not None and mde_v > BAR:
            c["verdict"] = "UNDERPOWERED"
        else:
            c["verdict"] = "NULL"
    return cells


def power_table(rows, hrows, n_cells=3):
    """§5 from counts and the control outcome only (R, never L·R)."""
    out = {}

    def one(name, sub, Rcol, sd_scale=1.0):
        R = sub[Rcol].dropna()
        sd = float(R.std()) * sd_scale if len(R) > 2 else 1.0
        g = sub.groupby("month")[Rcol]
        m_bar = float(g.size().mean()) if len(g) else 1.0
        # ICC from the one-way ANOVA of R by expiry month (outcome only, no lean)
        k, N = g.ngroups, len(R)
        if k > 1 and N > k:
            msb = (g.size() * (g.mean() - R.mean()) ** 2).sum() / (k - 1)
            msw = ((sub[Rcol] - g.transform("mean")) ** 2).sum() / (N - k)
            icc = max(0.0, (msb - msw) / (msb + (m_bar - 1) * msw)) if msb + (m_bar - 1) * msw > 0 else 0.0
        else:
            icc = 0.0
        deff = 1 + (m_bar - 1) * icc
        n = int(len(sub))
        v = mde(sd, n, deff, ALPHA / n_cells)
        out[name] = {"n": n, "sd_R_control": sd, "rows_per_month": m_bar, "icc": icc, "deff": deff, "mde": v, "bar": BAR,
                     "verdict": "POWERED" if v <= BAR else "UNDERPOWERED"}
    r20 = rows[(rows["h"] == H_MAIN) & (rows["L"] != 0)]
    r10 = rows[(rows["h"] == H_SHORT) & (rows["LB"] != 0)] if "LB" in rows else rows.iloc[:0]
    one("P1", r20, "R")
    if len(r10):
        one("P2", r10, "R")
    if len(hrows):
        h = hrows.assign(R=(hrows["RN"] + hrows["RX"]) / math.sqrt(2))
        one("P3", h, "R")
    return out


def rows_hash(rows):
    cols = ["pair", "expiry", "h", "L", "sigma", "s0"]
    return hashlib.sha256(rows[cols].astype(str).to_csv(index=False).encode()).hexdigest()[:16]


def load_all(oi_dir, prices_dir, pairs=None, end=LOCKBOX, start=SCORE_FROM):
    rows, hrows = [], []
    for pair, key in INSTRUMENTS.items():
        if pairs and pair not in pairs:
            continue
        path = os.path.join(oi_dir, f"{pair}.csv")
        if not os.path.exists(path) or not os.path.exists(os.path.join(prices_dir, f"{key}.csv")):
            print(f"  skip {pair}: missing {'OI' if not os.path.exists(path) else 'prices'}", flush=True)
            continue
        c = cfg(pair)
        print(f"  {pair}: loading", flush=True)
        track = track40.build(track40.load_raw(path, c["inverted"]))
        fwd = load_forwards(path, c["inverted"])
        prices = load_prices(prices_dir, key)
        r = build_rows(pair, track, fwd, prices, end, start)
        rows.append(r)
        hrows.append(handover_rows(pair, track, fwd, prices, end, start))
        print(f"  {pair}: {len(r)} rows, {int((r['L'] != 0).sum()) if len(r) else 0} leaning", flush=True)
    rows = pd.concat(rows, ignore_index=True) if rows else pd.DataFrame()
    hrows = pd.concat(hrows, ignore_index=True) if hrows else pd.DataFrame()
    return rows, hrows


def stamp_path():
    return os.path.join(OUT, "stages.json")


def read_stamp():
    try:
        return json.load(open(stamp_path()))
    except Exception:
        return {}


def write_stamp(**kw):
    os.makedirs(OUT, exist_ok=True)
    s = read_stamp()
    s.update(kw)
    json.dump(s, open(stamp_path(), "w"), indent=1, default=str)


def run_controls(rows, rng):
    """A1: shuffle R within instrument (kills any real lean-outcome link), then (a) plant +0.25 and require a pass,
    (b) no plant and require no pass."""
    r20 = rows[rows["h"] == H_MAIN].copy()
    shuf = r20.copy()
    shuf["R"] = shuf.groupby("pair")["R"].transform(lambda s: s.sample(frac=1, random_state=int(rng.integers(1 << 31))).to_numpy())
    planted = shuf.copy()
    planted["R"] = planted["R"] + PLANT * planted["L"]
    pw = power_table(rows, pd.DataFrame())
    b = decide([score_cell("shuffled", shuf, "L", "R", rng, power_row=pw.get("P1"))])[0]
    a = decide([score_cell("plant", planted, "L", "R", rng, power_row=pw.get("P1"))])[0]
    # A2/A3 (prereg amendments): the control proves the pipeline measures correctly; it does not have to pass the gate
    # Recovery is measured against the shuffled copy, not against 0.25 flat: shuffling within an instrument keeps
    # mean(L)*mean(R) (an instrument that trended while its books leaned one way), so the plant adds 0.25 to THAT.
    half = (a["ci"][1] - a["ci"][0]) / 2
    target = b["mean"] + PLANT
    recovered = abs(a["mean"] - target) <= max(0.10, half) and a["ci"][0] <= target <= a["ci"][1]
    powered = (pw.get("P1") or {}).get("verdict") == "POWERED"
    ok_plant = bool(recovered)   # A3: recovery, not a gate pass (a plant at the bar passes gate (a) only ~half the time)
    ok_null = not str(b.get("verdict", "")).startswith("VALIDATED")
    return {"planted": a, "shuffled": b, "plant_recovered": ok_plant, "p1_powered": powered, "null_clean": ok_null, "passed": bool(ok_plant and ok_null)}


def slices(rows, rng):
    r20 = rows[rows["h"] == H_MAIN]
    out = []

    def add(name, sub, Lcol="L"):
        use = sub[sub[Lcol] != 0]
        if len(use) < 10:
            out.append({"slice": name, "n": int(len(use)), "note": "fewer than 10"})
            return
        x = use[Lcol].to_numpy() * use["R"].to_numpy()
        est, lo, hi, p, _ = cluster_boot_mean(x, use["month"].to_numpy(), rng, B=1000)
        out.append({"slice": name, "n": int(len(use)), "mean": float(est), "ci": [float(lo), float(hi)], "p": float(p)})
    add("P1 at h=10", rows[rows["h"] == H_SHORT])
    for pair in sorted(r20["pair"].unique()):
        add(f"P1 {pair}", r20[r20["pair"] == pair])
    add("P1 FX", r20[~r20["pair"].isin(INDICES)])
    add("P1 indices", r20[r20["pair"].isin(INDICES)])
    s = r20.copy()
    s["Lshare"] = [0 if sh is None or abs(sh - 0.5) < BAL else (1 if sh > 0.5 else -1) for sh in s["share"]]
    add("P1 lean by shareAbove", s, "Lshare")
    for et in ("monthly", "quarterly", "weekly"):
        add(f"P1 {et} expiries", r20[r20["etype"] == et])
    for gm in ("PIN", "BREAKOUT"):
        add(f"P1 gamma {gm}", r20[r20["gamma"] == gm])
    lean = r20[r20["L"] != 0]
    if len(lean) >= 30:
        q1, q2 = np.percentile(lean["pull"].abs(), [33.3, 66.7])
        add("P1 |pull| low tercile", lean[lean["pull"].abs() <= q1])
        add("P1 |pull| mid tercile", lean[(lean["pull"].abs() > q1) & (lean["pull"].abs() <= q2)])
        add("P1 |pull| high tercile", lean[lean["pull"].abs() > q2])
    scored = [o for o in out if "p" in o]
    flags = bh([o["p"] for o in scored])
    for o, f in zip(scored, flags):
        o["bh_q10"] = bool(f)
    return out, {"slices_scored": len(scored), "passing_bh": int(sum(flags)), "expected_by_chance_at_5pct": round(0.05 * len(scored), 2)}


def describe(rows):
    r20 = rows[(rows["h"] == H_MAIN)]
    d = {}
    for col, name in (("Lplus", "strike shift +1 sigma*sqrt(h)"), ("Lminus", "strike shift -1 sigma*sqrt(h)")):
        u = r20[r20[col] != 0]
        d[name] = {"n": int(len(u)), "mean": float((u[col] * u["R"]).mean()) if len(u) else None}
    u = r20[r20["L"] != 0]
    if len(u):
        x = u["L"] * u["R"]
        d["by_year"] = {str(y): float(x[u["expiry"].dt.year == y].mean()) for y in sorted(u["expiry"].dt.year.unique())}
        cut = x.abs().quantile(0.99)
        d["without_top_1pct"] = float(x[x.abs() <= cut].mean())
        d["lean_follows_price"] = float(np.corrcoef(u["L"], u["z20"])[0, 1]) if u["z20"].std() > 0 else None
    return d


def write_results(cells, sl, slmeta, desc, pw, ctrl, rows, hrows):
    os.makedirs(OUT, exist_ok=True)
    res = {"study": "expiry-tracker", "prereg": "forge/EXPIRY_TRACKER_PREREG.md", "seed": SEED, "lockbox": str(LOCKBOX.date()),
           "scored_from": str(SCORE_FROM.date()), "bar": BAR, "cells": cells, "power": pw, "controls": ctrl, "slices": sl,
           "slices_meta": slmeta, "description": desc, "rows_hash": rows_hash(rows)}
    json.dump(res, open(os.path.join(OUT, "results.json"), "w"), indent=1, default=str)
    rows.to_csv(os.path.join(OUT, "rows.csv"), index=False)
    if len(hrows):
        hrows.to_csv(os.path.join(OUT, "handover_rows.csv"), index=False)
    L = ["# expiry-tracker: results", "", f"Prereg `forge/EXPIRY_TRACKER_PREREG.md` (A1). Seed {SEED}. Expiries {SCORE_FROM.date()} to {LOCKBOX.date()}. Bar {BAR} sigma*sqrt(h).", "",
         "| Cell | n (balanced) | Mean L*R [95% CI] | Holm p | Hit | Lean beyond momentum b [CI] | Halves | Placebo pct | MDE | Verdict |", "|---|---|---|---|---|---|---|---|---|---|"]
    for c in cells:
        if "mean" not in c:
            L.append(f"| {c['cell']} | {c['n']} | – | – | – | – | – | – | – | {c['verdict']} |")
            continue
        hv = c["halves"]
        L.append(f"| {c['cell']} | {c['n']} ({c['n_balanced']}) | {c['mean']:+.3f} [{c['ci'][0]:+.3f}, {c['ci'][1]:+.3f}] | {c['p_holm']:.3f} | {c['hit']:.1%} | "
                 f"{c['b']:+.3f} [{c['b_ci'][0]:+.3f}, {c['b_ci'][1]:+.3f}] | {hv.get('first') if hv.get('first') is None else round(hv['first'], 3)} / "
                 f"{hv.get('second') if hv.get('second') is None else round(hv['second'], 3)} | {c['placebo_pct'] if c['placebo_pct'] is None else round(c['placebo_pct'], 3)} | "
                 f"{(c.get('power') or {}).get('mde', float('nan')):.3f} | **{c['verdict']}** |")
    L += ["", f"Positive control (A1): planted recovered {ctrl.get('plant_recovered')}, shuffled clean {ctrl.get('null_clean')}.", "",
          f"Slices (BH q=0.10, descriptive): {slmeta['passing_bh']} of {slmeta['slices_scored']} pass; {slmeta['expected_by_chance_at_5pct']} expected by chance at 5%.", "",
          "| Slice | n | Mean [CI] | p | BH |", "|---|---|---|---|---|"]
    for o in sl:
        if "mean" in o:
            L.append(f"| {o['slice']} | {o['n']} | {o['mean']:+.3f} [{o['ci'][0]:+.3f}, {o['ci'][1]:+.3f}] | {o['p']:.3f} | {'yes' if o.get('bh_q10') else ''} |")
        else:
            L.append(f"| {o['slice']} | {o['n']} | – | – | {o.get('note', '')} |")
    L += ["", "Description: " + json.dumps(desc, default=str)]
    open(os.path.join(OUT, "RESULTS.md"), "w").write("\n".join(L) + "\n")


# ── stages ──────────────────────────────────────────────────────────────────────────────────────────────────────────
def stage_count(args):
    rows, hrows = load_all(args.oi, args.prices)
    pw = power_table(rows, hrows)
    write_stamp(count={"rows_hash": rows_hash(rows), "power": pw})
    print(json.dumps(pw, indent=1))
    return rows, hrows, pw


def stage_controls(args, rows=None):
    if rows is None:
        rows, _ = load_all(args.oi, args.prices)
    st = read_stamp()
    if st.get("count", {}).get("rows_hash") != rows_hash(rows):
        sys.exit("run `count` first on these rows")
    ctrl = run_controls(rows, np.random.default_rng(SEED))
    write_stamp(controls={"rows_hash": rows_hash(rows), "passed": ctrl["passed"], "plant_recovered": ctrl["plant_recovered"], "null_clean": ctrl["null_clean"]})
    print(json.dumps({k: ctrl[k] for k in ("plant_recovered", "null_clean", "passed")}))
    return ctrl


def stage_run(args, rows=None, hrows=None):
    if rows is None:
        rows, hrows = load_all(args.oi, args.prices)
    st = read_stamp()
    h = rows_hash(rows)
    if st.get("count", {}).get("rows_hash") != h:
        sys.exit("run `count` first on these rows")
    if st.get("controls", {}).get("rows_hash") != h or not st["controls"].get("passed"):
        sys.exit("the A1 positive control has not passed on these rows: fix the pipeline before reading a real number")
    rng = np.random.default_rng(SEED)
    pw = st["count"]["power"]
    cells = [score_cell("P1 side (h=20)", rows[rows["h"] == H_MAIN], "L", "R", rng, power_row=pw.get("P1")),
             score_cell("P2 build before move", rows[rows["h"] == H_SHORT], "LB", "R", rng, power_row=pw.get("P2"))]
    if len(hrows):
        c3 = score_p3(hrows, rng, power_row=pw.get("P3"))
    else:
        c3 = {"cell": "P3 hand-over", "n": 0, "p": 1.0, "verdict": "UNDERPOWERED", "note": "no opposite-lean reads"}
    cells = decide(cells + [c3])
    for c in cells:   # §5: P3 is a description when underpowered by design, never NULL
        if c["cell"].startswith("P3") and c["verdict"] == "NULL" and (c.get("power") or {}).get("mde", 9) > BAR:
            c["verdict"] = "UNDERPOWERED"
    sl, meta = slices(rows, rng)
    desc = describe(rows)
    write_results(cells, sl, meta, desc, pw, st.get("controls"), rows, hrows)
    print(open(os.path.join(OUT, "RESULTS.md")).read())
    return cells


def stage_forward(args):
    """Forward record from the live capture (archive/expiry_track/<pair>/<expiry>.json, downloaded read-only)."""
    out = []
    keymap = {"EUR/USD": "EURUSD", "GBP/USD": "GBPUSD", "AUD/USD": "AUDUSD", "USD/CAD": "USDCAD", "USD/CHF": "USDCHF",
              "USD/JPY": "USDJPY", "XAU/USD": "XAUUSD", "NAS100_USD": "NAS100", "SPX500_USD": "SPX500"}
    for root, _, files in os.walk(args.track):
        for fn in files:
            if not fn.endswith(".json") or fn.startswith("_"):
                continue
            s = json.load(open(os.path.join(root, fn)))
            key = keymap.get(s.get("pair"))
            if not key or not os.path.exists(os.path.join(args.prices, f"{key}.csv")):
                continue
            e = pd.Timestamp(s["expiry"])
            if e <= LOCKBOX:
                continue
            prices = load_prices(args.prices, key)
            dates = prices["date"].to_numpy("datetime64[ns]")
            iE = np.searchsorted(dates, np.datetime64(e), side="right") - 1
            r = iE - H_MAIN
            if r < 61 or pd.Timestamp(dates[iE]) < e - pd.Timedelta(days=4):
                continue
            read = pd.Timestamp(dates[r])
            days = [d for d in s["days"] if pd.Timestamp(d["date"]) < read and not d.get("stale")]
            if not days or not days[-1].get("futures"):
                continue
            d = days[-1]
            inv = bool(s.get("inverted"))
            k = np.array([x[0] for x in d["ladder"]], float)
            c = np.array([x[1] for x in d["ladder"]], float)
            p = np.array([x[2] for x in d["ladder"]], float)
            f = float(d["futures"])
            if inv:
                k, f = 1 / k, 1 / f
            le = lean_of((k, c, p), f)
            if not le or le[2] == 0:
                continue
            sg = prices["sigma"].iloc[r]
            R = math.log(prices["close"].iloc[iE] / prices["close"].iloc[r]) / (sg * math.sqrt(H_MAIN))
            out.append(dict(pair=s["pair"], expiry=e.date(), L=le[2], R=R, LR=le[2] * R))
    df = pd.DataFrame(out)
    os.makedirs(OUT, exist_ok=True)
    df.to_csv(os.path.join(OUT, "forward_rows.csv"), index=False)
    msg = f"forward rows: {len(df)}" + (f", mean L*R {df['LR'].mean():+.3f}, hit {(df['LR'] > 0).mean():.1%}" if len(df) else "")
    msg += " (read once at >= 30 rows; descriptive only)"
    print(msg)


# ── self-test on synthetic data ─────────────────────────────────────────────────────────────────────────────────────
def _synthetic(tmp, pull_k, seed=1):
    """Two instruments (one CME-inverted), daily prices with an optional drift toward each live expiry's OI centre,
    weekly and monthly expiries, books centred off price, settlements from Black-76 so parity recovers the forward."""
    rng = np.random.default_rng(seed)
    days = pd.bdate_range("2019-06-03", "2026-08-28")
    os.makedirs(os.path.join(tmp, "oi"), exist_ok=True)
    os.makedirs(os.path.join(tmp, "px"), exist_ok=True)
    for pair, key, s0, inv in (("EUR_USD", "EURUSD", 1.15, False), ("USD_JPY", "USDJPY", 140.0, True)):
        sig = 0.006
        fridays = [d for d in days if d.dayofweek == 4]
        exps = fridays          # weekly expiries (the floor keeps the heavy ones)
        centres = {e: None for e in exps}
        px = np.empty(len(days))
        px[0] = s0
        for i in range(1, len(days)):
            d = days[i]
            drift = 0.0
            live = [e for e in exps if e >= d and (e - d).days <= 45 and centres[e] is not None]
            if pull_k and live:
                e = live[0]
                left = max(1, np.busday_count(d.date(), e.date()))
                drift = pull_k * math.log(centres[e] / px[i - 1]) / left
            px[i] = px[i - 1] * math.exp(drift + sig * rng.standard_normal())
            for e in exps:   # an expiry's book appears 45 days out, centred off price by a random amount
                if centres[e] is None and 0 <= (e - d).days <= 45:
                    centres[e] = px[i] * math.exp(rng.normal(0, 3 * sig * math.sqrt(20)))
        pd.DataFrame({"date": days.strftime("%Y-%m-%d"), "close": px}).to_csv(os.path.join(tmp, "px", f"{key}.csv"), index=False)
        recs = []
        for e in exps:
            if centres[e] is None:
                continue
            for i, d in enumerate(days):
                if d > e or (e - d).days > 45:
                    continue
                f = px[i]
                T = max(1, (e - d).days) / 365
                step = 0.005 if not inv else 0.5           # a fixed CME-style strike grid, not a new one each day
                strikes = np.unique(np.round(f * np.exp(np.linspace(-0.06, 0.06, 13)) / step) * step)
                w = np.exp(-0.5 * ((np.log(strikes / centres[e])) / 0.02) ** 2) * 1000 + 20
                for k, oi in zip(strikes, w):
                    vol = 0.1
                    d1 = (math.log(f / k) + 0.5 * vol * vol * T) / (vol * math.sqrt(T))
                    d2 = d1 - vol * math.sqrt(T)
                    N = lambda x: 0.5 * (1 + math.erf(x / math.sqrt(2)))
                    call = f * N(d1) - k * N(d2)
                    put = call - (f - k)
                    if inv:   # CME quotes the reciprocal: a call on 1/f at strike 1/k
                        fi, ki = 1 / f, 1 / k
                        d1i = (math.log(fi / ki) + 0.5 * vol * vol * T) / (vol * math.sqrt(T))
                        d2i = d1i - vol * math.sqrt(T)
                        calli = fi * N(d1i) - ki * N(d2i)
                        recs += [(d, e, ki, "C", calli, oi / 2), (d, e, ki, "P", calli - (fi - ki), oi / 2)]
                    else:
                        recs += [(d, e, k, "C", call, oi / 2), (d, e, k, "P", put, oi / 2)]
        df = pd.DataFrame(recs, columns=["date", "expiry", "strike", "right", "settlement", "open_interest"])
        df["strike"] = df["strike"].round(10)
        df.to_csv(os.path.join(tmp, "oi", f"{pair}.csv"), index=False)


def selftest():
    import tempfile
    fails = 0

    def ok(name, cond, extra=""):
        nonlocal fails
        print(f"  {'ok ' if cond else 'FAIL'} {name}{('  -> ' + str(extra)) if extra else ''}")
        fails += 0 if cond else 1
    global OUT, INSTRUMENTS
    keep_out, keep_inst = OUT, INSTRUMENTS
    INSTRUMENTS = {"EUR_USD": "EURUSD", "USD_JPY": "USDJPY"}
    try:
        for label, k in (("planted pull", 0.6), ("no pull", 0.0)):
            with tempfile.TemporaryDirectory() as tmp:
                _synthetic(tmp, k)
                OUT = os.path.join(tmp, "out")
                a = argparse.Namespace(oi=os.path.join(tmp, "oi"), prices=os.path.join(tmp, "px"))
                rows, hrows = load_all(a.oi, a.prices)
                if label == "planted pull":
                    fx = load_forwards(os.path.join(tmp, "oi", "EUR_USD.csv"), False)
                    pxe = pd.read_csv(os.path.join(tmp, "px", "EURUSD.csv"), parse_dates=["date"]).set_index("date")["close"]
                    errs = [abs(f / pxe.get(d, np.nan) - 1) for (d, _), f in list(fx.items())[:200] if d in pxe.index]
                    ok("parity forward recovers the price", np.nanmax(errs) < 1e-6, f"max err {np.nanmax(errs):.2e}")
                    fj = load_forwards(os.path.join(tmp, "oi", "USD_JPY.csv"), True)
                    pxj = pd.read_csv(os.path.join(tmp, "px", "USDJPY.csv"), parse_dates=["date"]).set_index("date")["close"]
                    errj = [abs(f / pxj.get(d, np.nan) - 1) for (d, _), f in list(fj.items())[:200] if d in pxj.index]
                    ok("inverted pair: forward back in OANDA terms", np.nanmax(errj) < 1e-6, f"max err {np.nanmax(errj):.2e}")
                    ok("rows built for both instruments at h=20 and h=10", set(rows["pair"]) == {"EUR_USD", "USD_JPY"} and set(rows["h"]) == {10, 20}, len(rows))
                    ok("leans on both sides", (rows["L"] == 1).any() and (rows["L"] == -1).any())
                    ok("no row past the lockbox", rows["expiry"].max() <= LOCKBOX)
                stage_count(a)
                ctrl = stage_controls(a, rows)
                ok(f"{label}: A1 control passes (plant recovered, shuffled clean)", ctrl["passed"], {k2: ctrl[k2] for k2 in ("plant_recovered", "null_clean")})
                cells = stage_run(a, rows, hrows)
                p1 = cells[0]
                if label == "planted pull":
                    ok("planted pull: P1 mean clearly positive and the lean adds beyond momentum", p1["mean"] > 0.25 and p1["b_ci"][0] > 0, f"{p1['mean']:.3f} b {p1['b']:.3f}")
                    ok("planted pull: placebo puts the real mean at the top", p1["placebo_pct"] >= 0.975, p1["placebo_pct"])
                else:
                    ok("no pull: P1 does not validate", not p1["verdict"].startswith("VALIDATED"), f"{p1['verdict']} mean {p1['mean']:+.3f}")
                    ok("no pull: P1 CI covers zero", p1["ci"][0] <= 0 <= p1["ci"][1], p1["ci"])
                ok(f"{label}: results written", os.path.exists(os.path.join(OUT, "RESULTS.md")))
        with tempfile.TemporaryDirectory() as tmp:   # the stage guard
            _synthetic(tmp, 0.0, seed=2)
            OUT = os.path.join(tmp, "out")
            a = argparse.Namespace(oi=os.path.join(tmp, "oi"), prices=os.path.join(tmp, "px"))
            rows, hrows = load_all(a.oi, a.prices)
            try:
                stage_run(a, rows, hrows)
                ok("run refuses before count/controls", False)
            except SystemExit:
                ok("run refuses before count/controls", True)
        ok("holm", [round(x, 3) for x in holm([0.01, 0.04, 0.03])] == [0.03, 0.06, 0.06])
        ok("mde matches the prereg table", abs(mde(1, 567, 3.45, 0.05 / 3) - 0.252) < 0.002, round(mde(1, 567, 3.45, 0.05 / 3), 4))
    finally:
        OUT, INSTRUMENTS = keep_out, keep_inst
    print("all passed" if not fails else f"{fails} FAILED")
    return fails


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("stage", nargs="?", choices=["count", "controls", "run", "forward"])
    ap.add_argument("--oi", default="OI Data")
    ap.add_argument("--prices", default="analysis/output/swing-leg-baserates/daily_m15")
    ap.add_argument("--track", default="expiry_track")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        sys.exit(1 if selftest() else 0)
    if a.stage == "count":
        stage_count(a)
    elif a.stage == "controls":
        stage_controls(a)
    elif a.stage == "run":
        stage_run(a)
    elif a.stage == "forward":
        stage_forward(a)
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
