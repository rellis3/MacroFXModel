"""Vol-Layer deep dive, layer 6 (sizing): Black-Litterman, position sizing and the book. Stage 2 build + look.

Nothing here is scored as a trade or given a verdict. It builds the sizing variables on the discovery window and draws them.

Data: analysis/output/forecast_history/<SYM>.csv (one row per London session 00:00-22:00):
  r_ocs  signed open-to-close, % of the open      live_sig_used  the live session sigma known at the open, %
  r_oh / r_ol  open-to-high / open-to-low, %       rv5  5-minute realised variance of the session, %^2
Plus data/m1_bidask/<key>_m1.parquet for the few example-day paths.

Parts
  (b) vol targeting on simple daily holds: unscaled vs trailing-RV20 vs forecast sigma (and 1/sigma^2), at equal ex-post vol
  (c) covariance stability of a 14-leg book (7 USD legs as short-USD, gold, 6 indices): correlation, PC1 share, dollar share
  (a) worked Black-Litterman example on the real 2021-2022 correlation matrix (zero prior)
  (d) sigma-scaled stops: how often a k-sigma stop is touched vs a random walk, and how 1R drifts with the sigma used
  (+) when to cut size: next-20-session book return after drawdowns

DISCOVERY WINDOW ONLY: sessions 2016-10-24 .. 2022-12-30 (pre-window rows are used only to warm up trailing estimates).

    python -X utf8 scripts/vol-layer-deep/sizing.py   -> backtest-data/vol-layer/sizing-look.json  (~1-2 min)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts/forecast_history")]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from scipy.stats import norm  # noqa: E402

import line_reaction as LR  # noqa: E402

HIST = ROOT / "analysis/output/forecast_history"
BA = ROOT / "data/m1_bidask"
OUT = ROOT / "analysis/output/vol-layer-deep/sizing"
WEB = ROOT / "backtest-data/vol-layer/sizing-look.json"
START, END = "2016-10-24", "2022-12-30"
SEED = 20261111
BA_KEY = {"DE30": "dax", "SPX500": "spx", "DOW": "dow", "GOLD": "gold", "NQ": "nq", "UK100": "uk100", "US2000": "us2000"}
# the book: USD legs signed so that +1 = short USD
USD_LEGS = {"EURUSD": 1, "GBPUSD": 1, "AUDUSD": 1, "NZDUSD": 1, "USDJPY": -1, "USDCAD": -1, "USDCHF": -1}
OTHER_LEGS = {"GOLD": 1, "NQ": 1, "SPX500": 1, "DOW": 1, "US2000": 1, "DE30": 1, "UK100": 1}
BOOK = {**USD_LEGS, **OTHER_LEGS}
KS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0]

rng = np.random.default_rng(SEED)


def r4(x, k=4):
    return None if x is None or not np.isfinite(x) else round(float(x), k)


# ── load ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
def load():
    rows = []
    for f in sorted(HIST.glob("*.csv")):
        d = pd.read_csv(f, usecols=["inst", "date", "live_sig_used", "r_ocs", "r_oh", "r_ol", "rv5"])
        d = d[d.date <= END].dropna(subset=["live_sig_used", "r_ocs"]).sort_values("date").reset_index(drop=True)
        d = d[d.live_sig_used > 0]
        # point-in-time trailing estimates (strictly before the session)
        d["rv20"] = np.sqrt((d.r_ocs ** 2).rolling(20, min_periods=15).mean().shift(1))
        d["sig_const"] = d.live_sig_used.rolling(250, min_periods=120).median().shift(1)
        rows.append(d)
    D = pd.concat(rows, ignore_index=True)
    D = D[(D.date >= START) & (D.date <= END)].dropna(subset=["rv20", "sig_const"]).reset_index(drop=True)
    assert D.date.max() <= END and D.date.min() >= START
    D["year"] = D.date.str[:4]
    D["month"] = D.date.str[:7]
    return D


# ── (b) vol targeting per instrument ────────────────────────────────────────────────────────────────────────────────
VARIANTS = {"U": "unscaled (constant notional)", "T20": "trailing realised vol, 20 sessions", "F": "forecast sigma",
            "MM": "1/sigma^2 (Moreira-Muir)"}


def scaled(D):
    S = pd.DataFrame({"inst": D.inst, "date": D.date, "year": D.year, "month": D.month})
    S["U"] = D.r_ocs
    S["T20"] = D.r_ocs / D.rv20
    S["F"] = D.r_ocs / D.live_sig_used
    S["MM"] = D.r_ocs / D.live_sig_used ** 2
    # equal ex-post vol: each instrument's series divided by its own full-window sd (a constant: changes no shape stat,
    # only lets the variants be compared at the same average risk; it is NOT a tradeable scale)
    for v in VARIANTS:
        S[v] = S[v] / S.groupby("inst")[v].transform("std")
    return S


def vov(s, months):
    m = s.groupby(months).std()
    return float(m.std())


def per_instrument(S):
    out = []
    for inst, g in S.groupby("inst"):
        row = {"inst": inst, "n": len(g)}
        for v in VARIANTS:
            x = g[v]
            row[f"vov_{v}"] = vov(x, g.month)
            row[f"kurt_{v}"] = float(x.kurt())
            row[f"p1_{v}"] = float(x.quantile(0.01))
            row[f"p99_{v}"] = float(x.quantile(0.99))
            row[f"worst_{v}"] = float(x.min())
            row[f"exc3_{v}"] = float((x.abs() > 3).mean())
        out.append(row)
    return pd.DataFrame(out)


# ── book ───────────────────────────────────────────────────────────────────────────────────────────────────────────
def book(D):
    B = D[D.inst.isin(BOOK)].copy()
    B["sgn"] = B.inst.map(BOOK)
    B["u_F"] = B.sgn * B.r_ocs / B.live_sig_used
    B["u_T"] = B.sgn * B.r_ocs / B.rv20
    B["u_U"] = B.sgn * B.r_ocs
    piv = {k: B.pivot(index="date", columns="inst", values=k).reindex(columns=list(BOOK)) for k in ("u_F", "u_T", "u_U")}
    return piv


def roll_corr(uF, win=60):
    """Rolling correlation of the forecast-scaled legs, using sessions strictly before t (missing = skipped)."""
    X = uF.fillna(0.0).to_numpy()
    n, k = X.shape
    C = np.full((n, k, k), np.nan)
    for t in range(win, n):
        w = X[t - win:t]
        sd = w.std(0)
        sd[sd == 0] = np.nan
        c = np.corrcoef(w.T) if np.all(np.isfinite(sd)) else np.nan * np.eye(k)
        C[t] = c
    return C


def shrink(c, a=0.3):
    """Shrink a correlation matrix toward its average off-diagonal correlation (constant-correlation target)."""
    k = c.shape[0]
    off = (c.sum() - k) / (k * (k - 1))
    tgt = np.full_like(c, off)
    np.fill_diagonal(tgt, 1.0)
    return (1 - a) * c + a * tgt


def books(piv, C):
    uF, uT, uU = piv["u_F"], piv["u_T"], piv["u_U"]
    k = uF.shape[1]
    w = np.ones(k) / k
    out = pd.DataFrame(index=uF.index)
    out["U"] = uU.fillna(0).mean(1)                      # equal notional
    out["ER_T20"] = uT.fillna(0).mean(1)                 # equal risk, trailing RV20
    out["ER_F"] = uF.fillna(0).mean(1)                   # equal risk, forecast sigma
    # book vol target: scale ER_F by 1 / forecast book vol from the shrunk rolling correlation (sessions < t)
    bv = np.array([np.sqrt(w @ shrink(C[t]) @ w) if np.all(np.isfinite(C[t])) else np.nan for t in range(len(uF))])
    out["bookvol_fc"] = bv
    out["ER_F_BT"] = out.ER_F / bv
    out = out.dropna()
    for c in ("U", "ER_T20", "ER_F", "ER_F_BT"):
        out[c] = out[c] / out[c].std()
    return out


def pc1_share(c):
    ev = np.linalg.eigvalsh(c)
    return float(ev[-1] / ev.sum())


def risk_contrib(c, w):
    s = c @ w
    rc = w * s
    return rc / rc.sum()


# ── (a) Black-Litterman with a zero prior, in sigma units ─────────────────────────────────────────────────────────────
def bl_weights(C, P, q, omega, tau=0.05, delta=1.0):
    """Zero prior (pi = 0). Returns (posterior mean, weights). Meucci's stable form."""
    A = tau * P @ C @ P.T + omega
    mu = tau * C @ P.T @ np.linalg.solve(A, q)
    S_bl = (1 + tau) * C - tau ** 2 * C @ P.T @ np.linalg.solve(A, P @ C)   # Sigma + posterior cov of mu (Woodbury)
    w = np.linalg.solve(delta * S_bl, mu)
    return mu, w


# ── (d) stops ──────────────────────────────────────────────────────────────────────────────────────────────────────
def stop_table(D):
    """Long and short: adverse excursion in the session vs k x sigma, for three sigmas. Random-walk theory 2 Phi(-k)."""
    rows = []
    for side, adv in (("long", D.r_ol.abs()), ("short", D.r_oh.abs())):
        for sname, sig in (("F", D.live_sig_used), ("T20", D.rv20), ("C", D.sig_const)):
            z = adv / sig
            for k in KS:
                rows.append(pd.DataFrame({"inst": D.inst, "date": D.date, "year": D.year, "side": side, "sig": sname,
                                          "k": k, "hit": (z >= k).astype(float)}))
    return pd.concat(rows, ignore_index=True)


# ── example paths (M1) ──────────────────────────────────────────────────────────────────────────────────────────────
def m1_path(sym, date, sig, side):
    key = BA_KEY.get(sym, sym.lower())
    df = pd.read_parquet(BA / f"{key}_m1.parquet", columns=["time", "close"])
    idx = pd.DatetimeIndex(pd.to_datetime(df["time"], utc=True)).tz_convert("Europe/London").tz_localize(None)
    df = df.assign(ld=idx)
    day = pd.Timestamp(date)
    g = df[(df.ld >= day) & (df.ld < day + pd.Timedelta(hours=22))]
    if len(g) < 100:
        return None
    o = g.close.iloc[0]
    m = ((g.ld - day).dt.total_seconds() // 60).astype(int).to_numpy()
    y = side * (g.close.to_numpy() / o - 1) * 100 / sig
    keep = np.unique(m // 10, return_index=True)[1]
    return [[int(m[i]), round(float(y[i]), 3)] for i in keep]


# ── main ───────────────────────────────────────────────────────────────────────────────────────────────────────────
def main():
    OUT.mkdir(parents=True, exist_ok=True)
    D = load()
    print("rows", len(D), "instruments", D.inst.nunique(), D.date.min(), D.date.max(), flush=True)
    S = scaled(D)
    PI = per_instrument(S)
    PI.to_csv(OUT / "per_instrument.csv", index=False)

    piv = book(D)
    C = roll_corr(piv["u_F"])
    BK = books(piv, C)
    BK.to_csv(OUT / "books.csv")
    dates_bk = BK.index.to_numpy()
    assert dates_bk.max() <= END

    charts, facts = [], {}

    # 1. per-instrument vol of monthly vol
    PI = PI.sort_values("vov_U")
    charts.append({"type": "groups", "title": "Steadier risk? Spread of monthly vol per instrument, daily hold",
                   "names": ["unscaled", "trailing RV20", "forecast sigma"], "unit": "sd of monthly vol (1 = average vol)",
                   "note": "Each instrument's daily London-session hold, scaled three ways and set to the same average vol. Bar = how much the "
                           "monthly realised vol wanders around that average (0 = perfectly steady risk). Benchmark: the unscaled bar. "
                           "Lower = the sizing keeps risk steadier. Direction is irrelevant here; only size moves.",
                   "rows": [{"label": r.inst, "values": [r4(r.vov_U, 3), r4(r.vov_T20, 3), r4(r.vov_F, 3)]} for r in PI.itertuples()]})
    facts["vov_median"] = {v: r4(PI[f"vov_{v}"].median(), 3) for v in VARIANTS}
    facts["vov_F_lt_U"] = int((PI.vov_F < PI.vov_U).sum())
    facts["vov_F_lt_T"] = int((PI.vov_F < PI.vov_T20).sum())
    facts["n_inst"] = int(len(PI))

    # 2. tails pooled: P(|z| > 3) with date-block CI, ref Gaussian
    bs = LR.Boot(S.date)
    rows = []
    for v in VARIANTS:
        ci = bs.mean(S.date, (S[v].abs() > 3).to_numpy(float))[0]
        rows.append({"label": VARIANTS[v], "value": r4(ci[0] * 100, 3), "lo": r4(ci[1] * 100, 3), "hi": r4(ci[2] * 100, 3)})
    rows.append({"label": "normal distribution", "value": r4(2 * norm.sf(3) * 100, 3)})
    charts.append({"type": "bars", "title": "Tail days: share of sessions beyond 3 sd, all 34 instruments", "unit": "% of sessions",
                   "ref": r4(2 * norm.sf(3) * 100, 3),
                   "note": "Each variant at equal ex-post vol per instrument. A day beyond 3 sd is a day that would blow through a "
                           "3-sd risk limit. Benchmark: a normal distribution gives 0.27%. Intervals: date-block bootstrap, 2,000 draws.",
                   "rows": rows})
    facts["exc3"] = {r["label"]: r["value"] for r in rows}

    # 3. tail shape per variant (medians across instruments)
    met = [("kurt", "excess kurtosis"), ("p1", "1st percentile (sd)"), ("worst", "worst day (sd)"), ("p99", "99th percentile (sd)")]
    _unused = ({"type": "groups", "title": "Tail shape per sizing (median over 34 instruments)",
                   "names": ["unscaled", "trailing RV20", "forecast sigma"], "unit": "sd units (kurtosis: excess)",
                   "note": "Medians across instruments at equal ex-post vol. A normal distribution has excess kurtosis 0, 1st percentile -2.33, "
                           "99th +2.33, and a worst day near -3.4 over ~1,600 sessions. Benchmark: the unscaled column. Closer to normal = the "
                           "sizing removed the fat tails that come from vol clusters.",
                   "rows": [{"label": lab, "values": [r4(PI[f"{m}_{v}"].median(), 2) for v in ("U", "T20", "F")]} for m, lab in met]})
    facts["kurt_med"] = {v: r4(PI[f"kurt_{v}"].median(), 2) for v in VARIANTS}
    facts["worst_med"] = {v: r4(PI[f"worst_{v}"].median(), 2) for v in VARIANTS}

    # 4. year-by-year book realised vol (each book at sd 1 over the window)
    yr = BK.groupby(BK.index.str[:4])
    series = []
    for c, nm in (("U", "equal notional"), ("ER_T20", "equal risk, RV20"), ("ER_F", "equal risk, forecast sigma"),
                  ("ER_F_BT", "equal risk + book vol target")):
        series.append({"name": nm, "points": [[int(y), r4(g[c].std(), 3)] for y, g in yr]})
    charts.append({"type": "lines", "title": "Book realised vol by year (14 legs; 1 = the book's own average)", "unit": "realised sd / average",
                   "xlabel": "year",
                   "note": "Book = 7 USD legs as short-USD, gold, 6 indices, long. Each book set to sd 1 over 2016-10..2022. A steady book "
                           "stays on 1 every year. Benchmark: equal notional (indices dominate, 2020 explodes). The book target uses a "
                           "60-session correlation, shrunk 30% to its average, from sessions before t only.",
                   "series": series})
    facts["book_year_vol"] = {s["name"]: s["points"] for s in series}
    mvv = {c: r4(BK[c].groupby(BK.index.str[:7]).std().std(), 3) for c in ("U", "ER_T20", "ER_F", "ER_F_BT")}
    facts["book_vov"] = mvv

    # 5. book drawdown + tails at equal vol
    def dd(x):
        cs = x.cumsum()
        return float((cs - cs.cummax()).min())
    bm = []
    for lab, f in (("worst day (sd)", lambda x: float(x.min())),
                   ("worst month (sd)", lambda x: float(x.groupby(x.index.str[:7]).sum().min())),
                   ("1st percentile (sd)", lambda x: float(x.quantile(0.01))), ("excess kurtosis", lambda x: float(x.kurt()))):
        bm.append({"label": lab, "values": [r4(f(BK[c]), 2) for c in ("U", "ER_F", "ER_F_BT")]})
    charts.append({"type": "groups", "title": "The book at equal vol: drawdown and tails", "names": ["equal notional", "equal risk (forecast)", "equal risk + book target"],
                   "unit": "daily sd units",
                   "note": "Same 14 legs, same direction, each book at sd 1 over the window, so only the sizing differs. Benchmark: equal "
                           "notional. Drawdown also depends on the book's drift (long risk, short USD), so read it next to the tail rows.",
                   "rows": bm})
    facts["book_tails"] = {r["label"]: r["values"] for r in bm}
    rows = []
    for c, nm in (("U", "equal notional"), ("ER_F", "equal risk (forecast)"), ("ER_F_BT", "equal risk + book target")):
        rows.append({"label": f"{nm}, as traded", "value": r4(dd(BK[c]), 1)})
    for c, nm in (("U", "equal notional"), ("ER_F", "equal risk (forecast)"), ("ER_F_BT", "equal risk + book target")):
        x0 = (BK[c] - BK[c].mean()).to_numpy()
        sims = [float((np.cumsum(p_) - np.maximum.accumulate(np.cumsum(p_))).min()) for p_ in (rng.permutation(x0) for _ in range(300))]
        rows.append({"label": f"{nm}, drift removed", "value": r4(dd(BK[c] - BK[c].mean()), 1),
                     "lo": r4(float(np.percentile(sims, 5)), 1), "hi": r4(float(np.percentile(sims, 95)), 1)})
        facts.setdefault("dd_shuffled_median", {})[c] = r4(float(np.median(sims)), 1)
    charts.append({"type": "bars", "title": "Book max drawdown at equal vol, with and without its drift", "unit": "daily sd", "ref": 0,
                   "note": "As traded, drawdown mixes sizing with the book's drift: equal risk gives the short-USD legs more weight, and "
                           "the dollar rose in 2021-22, so its drawdown is deeper. With each book's own mean removed, only the path shape "
                           "is left. Benchmarks: equal notional, and for the drift-removed rows the whiskers are the 5th-95th percentile of the "
                           "same days in random order (300 shuffles), i.e. what drawdown size is luck of the ordering. A driftless random "
                           "walk of ~1,550 days at sd 1 expects about sqrt(pi/2 x n) = 49 sd.",
                   "rows": rows})
    facts["book_dd"] = {r["label"]: r["value"] for r in rows}

    # 6. concrete days: the 8 worst days of the equal-notional book
    worst = BK.U.nsmallest(8)
    facts["worst_days"] = {d: [r4(BK.loc[d, c], 2) for c in ("U", "ER_F", "ER_F_BT")] for d in worst.index}
    _unused = ({"type": "groups", "title": "The 8 worst days of the equal-notional book, under each sizing",
                   "names": ["equal notional", "equal risk (forecast)", "equal risk + book target"], "unit": "book sd",
                   "note": "Real sessions. Same legs and direction; only size differs. Benchmark: the equal-notional loss. A sizing that "
                           "cuts these is buying insurance on exactly the days that hurt.",
                   "rows": [{"label": d, "values": [r4(BK.loc[d, c], 2) for c in ("U", "ER_F", "ER_F_BT")]} for d in worst.index]})

    # 7. correlation over time: average pairwise corr (USD legs, all legs) and PC1 share
    names = list(BOOK)
    iu = [names.index(n) for n in USD_LEGS]
    ii = [names.index(n) for n in OTHER_LEGS if n != "GOLD"]
    pts_all, pts_usd, pts_pc1, pc1_by_year = [], [], [], {}
    usd_rc = {}
    k = len(names)
    w = np.ones(k) / k
    idx = piv["u_F"].index
    for t in range(60, len(idx), 5):
        c = C[t]
        if not np.all(np.isfinite(c)):
            continue
        x = int(idx[t][:4]) + (int(idx[t][5:7]) - 1) / 12 + int(idx[t][8:10]) / 365
        cu = c[np.ix_(iu, iu)]
        pts_all.append([round(x, 3), r4((c.sum() - k) / (k * (k - 1)), 3)])
        pts_usd.append([round(x, 3), r4((cu.sum() - len(iu)) / (len(iu) * (len(iu) - 1)), 3)])
        p1 = pc1_share(c)
        pts_pc1.append([round(x, 3), r4(p1, 3)])
        pc1_by_year.setdefault(idx[t][:4], []).append(p1)
        rc = risk_contrib(shrink(c), w)
        usd_rc.setdefault(idx[t][:4], []).append([rc[iu].sum(), rc[ii].sum(), rc[names.index("GOLD")]])
    facts["corr_usd_mean"] = r4(float(np.mean([p[1] for p in pts_usd])), 3)
    facts["corr_all_mean"] = r4(float(np.mean([p[1] for p in pts_all])), 3)
    _unused = ({"type": "lines", "title": "How one-bet is the book? Rolling 60-session correlation and PC1 share", "unit": "correlation / share",
                   "xlabel": "date",
                   "note": "Legs in forecast-sigma units. PC1 share = fraction of the 14-leg variance explained by the single biggest common "
                           "factor. Benchmark: 14 independent legs give PC1 ~0.13 (see the shuffled bar in the next chart). The USD legs "
                           "move together far more than the rest: that is the hidden dollar bet.",
                   "series": [{"name": "avg corr, 7 USD legs", "points": pts_usd}, {"name": "avg corr, all 14 legs", "points": pts_all},
                              {"name": "PC1 share", "points": pts_pc1}]})

    # shuffled benchmark for PC1 share
    X = piv["u_F"].fillna(0).to_numpy()
    sh = []
    for _ in range(200):
        t0 = rng.integers(60, len(X))
        Xs = np.column_stack([rng.permutation(X[:, j])[:60] for j in range(k)])
        sh.append(pc1_share(np.corrcoef(Xs.T)))
    rows = [{"label": y, "value": r4(float(np.mean(v)), 3), "lo": r4(float(np.percentile(v, 5)), 3), "hi": r4(float(np.percentile(v, 95)), 3)}
            for y, v in sorted(pc1_by_year.items())]
    rows.append({"label": "shuffled (no correlation)", "value": r4(float(np.mean(sh)), 3), "lo": r4(float(np.percentile(sh, 5)), 3),
                 "hi": r4(float(np.percentile(sh, 95)), 3)})
    charts.append({"type": "bars", "title": "PC1 share of the book's variance by year", "unit": "share of variance", "ref": r4(float(np.mean(sh)), 3),
                   "note": "Mean of the rolling 60-session PC1 share per year; whiskers = 5th-95th percentile of the rolling values within "
                           "the year (spread, not a confidence interval). Benchmark: each leg's history shuffled independently, which keeps "
                           "the vol but removes correlation.",
                   "rows": rows})
    facts["pc1_year"] = {r["label"]: r["value"] for r in rows}
    facts["pc1_gt_half"] = r4(float(np.mean([p[1] > 0.5 for p in pts_pc1])), 3)

    # 8. risk share by group
    rows = [{"label": y, "values": [r4(float(np.mean([a[g] for a in v])) * 100, 1) for g in range(3)]} for y, v in sorted(usd_rc.items())]
    rows.append({"label": "notional share", "values": [50.0, 42.9, 7.1]})
    charts.append({"type": "groups", "title": "Who carries the equal-risk book's risk? Share by group, per year", "names": ["7 USD legs", "6 indices", "gold"],
                   "unit": "% of book variance",
                   "note": "Euler risk contribution (each leg's weight x its covariance with the book) from the shrunk rolling 60-session "
                           "correlation, sessions before t, averaged over the year. Benchmark: the last row, each group's share of legs "
                           "(equal risk per leg, so no correlation = these shares). Each group is one bet inside: USD legs average corr "
                           f"{facts['corr_usd_mean']}, all 14 legs {facts['corr_all_mean']}.",
                   "rows": rows})
    facts["risk_share"] = {r["label"]: r["values"] for r in rows}

    # 9. Black-Litterman worked example on the 2021-2022 correlation (discovery data)
    uF = piv["u_F"]
    sub = uF[(uF.index >= "2021-01-01")].fillna(0)
    Creal = shrink(np.corrcoef(sub.to_numpy().T), 0.2)
    np.save(OUT / "corr_2021_2022.npy", Creal)
    viewed = list(USD_LEGS)
    P = np.zeros((len(viewed), k))
    for i, n in enumerate(viewed):
        P[i, names.index(n)] = 1.0
    q = np.full(len(viewed), 0.10)          # each view: +0.1 sigma tomorrow for short-USD on that leg
    tau = 0.05
    om_hl = np.diag(np.diag(tau * P @ Creal @ P.T))          # He-Litterman: omega = tau x view variance
    mu_hl, w_hl = bl_weights(Creal, P, q, om_hl, tau)
    # signal / sigma: the same BL machine with the correlations set to zero (diagonal), i.e. each view sized alone
    _, w_sig = bl_weights(np.eye(k), P, q, np.diag(np.diag(tau * P @ P.T)), tau)
    om_mix = om_hl.copy()
    for i, n in enumerate(viewed):
        if n in ("EURUSD", "GBPUSD", "USDCHF"):
            om_mix[i, i] *= 4.0
    _, w_mix = bl_weights(Creal, P, q, om_mix, tau)
    def bvol(wv):
        return float(np.sqrt(wv @ Creal @ wv))
    rows = [{"label": n, "values": [r4(w_sig[j], 3), r4(w_hl[j], 3), r4(w_mix[j], 3)]} for j, n in enumerate(names) if j < 9]
    charts.append({"type": "groups", "title": "Black-Litterman, zero prior: same 7 short-USD views, real 2021-22 correlation",
                   "names": ["signal / sigma (ignores correlation)", "BL, He-Litterman omega", "BL, EUR/GBP/CHF views 4x less sure"],
                   "unit": "weight per leg (sigma units, risk aversion 1)",
                   "note": f"Each view: +0.1 sigma tomorrow, short USD on that leg. tau 0.05. Book vol: signal/sigma {bvol(w_sig):.3f}, "
                           f"BL {bvol(w_hl):.3f}, BL mixed {bvol(w_mix):.3f}. Gold and NQ get no view and so get zero weight under BL with a "
                           "zero prior (He-Litterman: weights are a sum of view portfolios). Benchmark: the signal/sigma bar. BL cuts the "
                           "legs that repeat the same dollar bet; USDJPY, the least correlated, keeps the most. Illustrative views, no edge claimed.",
                   "rows": rows})
    facts["bl_bookvol"] = {"sig": r4(bvol(w_sig), 3), "bl": r4(bvol(w_hl), 3), "mix": r4(bvol(w_mix), 3)}
    facts["bl_w"] = {n: [r4(w_sig[j], 3), r4(w_hl[j], 3), r4(w_mix[j], 3)] for j, n in enumerate(names)}
    facts["corr_usd_2122"] = r4(float((Creal[np.ix_(iu, iu)].sum() - 7) / 42), 3)

    # 10. two-view toy: weight on the EURUSD view vs assumed EUR-GBP correlation, and vs omega
    rhos = np.round(np.arange(0, 0.96, 0.05), 2)
    ser = {"signal / sigma": [], "BL omega x0.25 (sure)": [], "BL omega x1 (He-Litterman)": [], "BL omega x4 (unsure)": []}
    for rho in rhos:
        c2 = np.array([[1, rho], [rho, 1]])
        P2, q2 = np.eye(2), np.array([0.1, 0.1])
        _, w0 = bl_weights(np.eye(2), P2, q2, np.eye(2) * tau, tau)
        ser["signal / sigma"].append([float(rho), r4(w0[0], 4)])
        for lab, m in (("BL omega x0.25 (sure)", 0.25), ("BL omega x1 (He-Litterman)", 1.0), ("BL omega x4 (unsure)", 4.0)):
            _, w2 = bl_weights(c2, P2, q2, np.eye(2) * tau * m, tau)
            ser[lab].append([float(rho), r4(w2[0], 4)])
    charts.append({"type": "lines", "title": "Two equal views (EURUSD, GBPUSD): BL weight on EURUSD vs their correlation", "unit": "weight (sigma units)",
                   "xlabel": "assumed correlation", "note": "Zero prior, each view +0.1 sigma. Benchmark: signal/sigma (flat: it ignores that the two "
                   "views are the same bet). With He-Litterman omega BL equals signal/sigma at correlation 0 and cuts the EURUSD leg by 20% at "
                   "0.5 and 32% at 0.95: two correlated views are partly one view counted twice. Confidence moves the line too: omega x0.25 "
                   "starts at 1.6x the benchmark, omega x4 at 0.4x.",
                   "series": [{"name": n, "points": p} for n, p in ser.items()]})

    # 11. stops: touch rate vs k
    ST = stop_table(D)
    ST.to_parquet(OUT / "stops.parquet", index=False)
    g = ST.groupby(["sig", "k"]).hit.mean()
    series = [{"name": "random walk 2 Phi(-k)", "points": [[k_, r4(2 * norm.sf(k_), 4)] for k_ in KS]}]
    for s_, nm in (("F", "forecast sigma"), ("T20", "trailing RV20"), ("C", "constant sigma (250-day median)")):
        series.append({"name": nm, "points": [[k_, r4(g[(s_, k_)], 4)] for k_ in KS]})
    charts.append({"type": "lines", "title": "How often a k-sigma stop is touched in the session (long and short, 34 instruments)",
                   "unit": "share of sessions touched", "xlabel": "stop distance k (sigma)",
                   "note": "Entry at the London open, stop k sigma away, held to 22:00. Benchmark: a driftless random walk whose session sd "
                           "equals sigma touches with probability 2 Phi(-k). Close to the benchmark = 1R means what it says.",
                   "series": series})
    facts["touch"] = {f"{s_}_{k_}": r4(g[(s_, k_)], 4) for s_ in ("F", "T20", "C") for k_ in (0.5, 1.0, 1.5)}
    facts["touch_theory"] = {k_: r4(2 * norm.sf(k_), 4) for k_ in (0.5, 1.0, 1.5)}

    # 12. year-by-year touch rate of a 1-sigma stop (with CI for forecast)
    one = ST[ST.k == 1.0]
    series = [{"name": "random walk", "points": [[int(y), r4(2 * norm.sf(1.0), 4)] for y in sorted(one.year.unique())]}]
    for s_, nm in (("F", "forecast sigma"), ("T20", "trailing RV20"), ("C", "constant sigma")):
        gg = one[one.sig == s_].groupby("year").hit.mean()
        series.append({"name": nm, "points": [[int(y), r4(v, 4)] for y, v in gg.items()]})
    charts.append({"type": "lines", "title": "Does 1R stay 1R? Touch rate of a 1-sigma stop by year", "unit": "share touched", "xlabel": "year",
                   "note": "Same trades as above at k = 1. If the sigma tracks the market, the touch rate is flat across years (benchmark: "
                           "31.7% for a random walk). A constant sigma lets the stop get hit far more in loud years (2020, 2022) and less in "
                           "quiet ones: the same 1R is a different bet.",
                   "series": series})
    facts["touch1_year"] = {s["name"]: s["points"] for s in series[1:]}

    # 13. touch rate by forecast miss (realised/forecast, ex post) - the mechanism of 1R drift
    D2 = D.dropna(subset=["rv5"]).copy()
    D2["ratio"] = np.sqrt(D2.rv5) / D2.live_sig_used
    D2["hitL"] = (D2.r_ol.abs() >= D2.live_sig_used).astype(float)
    D2["hitS"] = (D2.r_oh.abs() >= D2.live_sig_used).astype(float)
    D2["hit"] = (D2.hitL + D2.hitS) / 2
    D2["bk"] = pd.cut(D2.ratio, [0, 0.6, 0.8, 1.0, 1.25, 1.5, 2.0, 99], labels=["<0.6", "0.6-0.8", "0.8-1.0", "1.0-1.25", "1.25-1.5", "1.5-2", ">2"])
    bs2 = LR.Boot(D2.date)
    rows = []
    for b, part in D2.groupby("bk", observed=True):
        ci = bs2.mean(part.date, part.hit.to_numpy(float))[0]
        rows.append({"label": f"{b} ({len(part) / len(D2) * 100:.0f}% of days)", "value": r4(ci[0] * 100, 1), "lo": r4(ci[1] * 100, 1), "hi": r4(ci[2] * 100, 1)})
    charts.append({"type": "bars", "title": "1-sigma stop touch rate by how wrong the sigma was (realised 5-min vol / forecast)", "unit": "% of sessions touched",
                   "ref": r4(2 * norm.sf(1.0) * 100, 1),
                   "note": "Realised/forecast is known only after the day: this shows the mechanism, not a rule. Benchmark: 31.7% for a "
                           "random walk when the sigma is right. Days when vol came in 1.5x the forecast touch a 1-sigma stop most of "
                           "the time: the stop was really a 0.6-sigma stop.",
                   "rows": rows})
    facts["ratio_share_gt15"] = r4(float((D2.ratio > 1.5).mean()), 3)
    facts["ratio_median"] = r4(float(D2.ratio.median()), 3)
    facts["touch_by_ratio"] = {r["label"]: r["value"] for r in rows}

    # 14. when to cut size: next-20-session book return after drawdowns (equal-risk forecast book)
    x = BK.ER_F
    cs = x.cumsum()
    ddv = (cs - cs.rolling(60, min_periods=60).max())
    fwd = x[::-1].rolling(20, min_periods=20).sum()[::-1].shift(-1) / 20
    T = pd.DataFrame({"dd": ddv, "fwd": fwd}).dropna()
    qs = T.dd.quantile([0.2, 0.4, 0.6, 0.8]).to_numpy()
    edges = [-1e9, *qs, 1e-9]
    T["bk"] = pd.cut(T.dd, edges, labels=[(f"below {edges[1]:.1f}" if i == 0 else f"{edges[i]:.1f} to {edges[i + 1]:.1f}") for i in range(5)])
    bs3 = LR.Boot(T.index)
    rows = []
    for b, part in T.groupby("bk", observed=True):
        ci = bs3.mean(part.index.to_numpy(), part.fwd.to_numpy(float))[0]
        rows.append({"label": f"drawdown {b} sd ({len(part)} days)", "value": r4(ci[0], 3), "lo": r4(ci[1], 3), "hi": r4(ci[2], 3)})
    uncond = float(T.fwd.mean())
    rows.append({"label": "all days", "value": r4(uncond, 3)})
    charts.append({"type": "bars", "title": "When to cut size? Next-20-session mean daily return of the book after a drawdown", "unit": "book sd per day",
                   "ref": r4(uncond, 3),
                   "note": "Equal-risk forecast-sigma book, drawdown in daily sd from its highest point of the last 60 sessions, in quintiles. Overlapping 20-session windows, "
                           "date-block bootstrap. Benchmark: the all-days mean. A drawdown throttle only helps if returns after a drawdown "
                           "are worse than average (momentum in P&L, Kaminski-Lo). The book is a long-risk/short-USD drift, not a strategy.",
                   "rows": rows})
    facts["dd_fwd"] = {r["label"]: r["value"] for r in rows}
    facts["book_ac1"] = r4(float(x.autocorr(1)), 3)
    facts["book_ac1_U"] = r4(float(BK.U.autocorr(1)), 3)

    # 15. concrete stop examples: EURUSD / GOLD / NQ days where the realised vol was far above the forecast
    ex = D2[D2.inst.isin(["EURUSD", "GOLD", "NQ", "GBPUSD"])].sort_values("ratio", ascending=False)
    trades = []
    used = set()
    for r in ex.itertuples():
        if r.inst in used or r.date in used:
            continue
        side = -1 if r.r_ocs < 0 else 1          # the side that got stopped: long if the day fell
        side = 1 if abs(r.r_ol) >= abs(r.r_oh) else -1
        path = m1_path(r.inst, r.date, r.live_sig_used, side)
        if path is None:
            continue
        stopped = min(p[1] for p in path) <= -1
        fin = path[-1][1]
        trades.append({"inst": r.inst, "date": r.date, "side": "long" if side == 1 else "short",
                       "r": r4(-1.0 if stopped else fin, 2), "unit": "sigma (forecast)", "stop": -1, "target": None, "path": path})
        used.add(r.inst)
        used.add(r.date)
        if len(trades) == 4:
            break
    charts.append({"type": "trades", "title": "Real days the forecast sigma was far too small (realised 5-min vol >> forecast)", "unit": "forecast sigma",
                   "note": "A position opened at the London open on the losing side with a 1-sigma stop (dashed). Path in forecast-sigma "
                           "units, 10-minute samples. Benchmark: on a day the sigma is right the path wanders about +/-1. These are the "
                           "biggest misses in the window per instrument: the stop is hit early and the move keeps going. Sizing from sigma "
                           "caps the loss at 1R; it does not make the day small.",
                   "trades": trades})
    facts["examples"] = [(t["inst"], t["date"]) for t in trades]

    (OUT / "facts.json").write_text(json.dumps(facts, indent=1, default=str), encoding="utf-8")
    print(json.dumps(facts, indent=1, default=str)[:6000])

    intro = INTRO if INTRO else ["(intro written after reading facts.json)"]
    res = {"id": "sizing-look", "window": [START, END], "intro": intro, "charts": charts}
    s = json.dumps(res, default=lambda o: o.item() if hasattr(o, "item") else str(o))
    assert "2023-" not in s and "2024-" not in s and "2025-" not in s and "2026-" not in s
    WEB.write_text(s, encoding="utf-8")
    print("wrote", WEB, len(s) // 1024, "KB,", len(charts), "charts")


# Written 2026-11-10 after reading analysis/output/vol-layer-deep/sizing/facts.json; numbers quoted from it.
INTRO: list[str] = [
 "Daily London-session holds (00:00-22:00) on 34 instruments, 2016-10 to 2022, about 1,600 sessions each. Only size varies; 2023 onward is not looked at.",
 "Steadier risk: sizing by the forecast sigma made monthly risk steadier in 34 of 34 instruments (spread of monthly vol 0.19 vs 0.31 unscaled, median). A plain trailing 20-session realised vol does the same (0.19); the forecast beats it in only 15 of 34.",
 "Tails shrink but stay fat: excess kurtosis 2.6 -> 1.9, median worst day -6.4 -> -5.0 sd. Days beyond 3 sd: 0.93% [0.77, 1.09] vs 1.06% unscaled; a normal distribution gives 0.27%. One-day jumps are not forecast. 1/sigma^2 sizing (Moreira-Muir) is worse than both: kurtosis 4.1, 1.41% beyond 3 sd.",
 "The 14-leg book (USD legs as short-USD, gold, indices): equal notional swings from 0.41 to 1.53 of its average vol by year; equal risk 0.74-1.20; equal risk plus a book vol target from the rolling correlation 0.91-1.10. Worst day -9.6 -> -4.1 sd (2020-03-12).",
 "But slow drawdowns do not shrink at equal vol: drift removed, max drawdown -41 (notional), -55 (equal risk), -61 sd (book target); the same days in random order give -29 to -66. Vol sizing trades crash days for a steadier grind.",
 "The book is a few bets: the biggest common factor explains 0.37 (2017) to 0.54 (2022) of its variance vs 0.14 if the legs were unrelated. USD legs average correlation 0.48. Each group's share of risk (USD 47-52%) is close to its share of legs, because the indices are just as much one bet.",
 "Black-Litterman with a zero prior on the real 2021-22 correlation: seven equal short-USD views get 0.015-0.030 per leg vs 0.049 for signal/sigma, and the book's vol falls from 0.27 to 0.10, because the seven views are mostly one dollar view. USDJPY, the least correlated, keeps the most. BL adds no leg that has no view.",
 "Stops: a 1-sigma stop from the open is touched in 29.5% of sessions with the forecast sigma (31.7% for a random walk); 27-31% every year. A constant sigma swings from 25% (2017) to 40% (2022). On days vol came in 1.5-2x the forecast (5% of days) the 1-sigma stop was touched 55% of the time.",
]

if __name__ == "__main__":
    main()
