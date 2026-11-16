"""vol-layer-feedback-confirm (Vol-Layer layer 8, stage 4): score the feedback layer on its own measures, once, on
unseen 2023-01-01 .. 2026-08-20. Contract: forge/VOL_LAYER_FEEDBACK_CONFIRM_PREREG.md.

Two steps, run in order by `--step all` (default):
  discovery  reproduce stage 3 (scripts/vol-layer-deep/feedback_wide.py) to 3 dp on 2016-10-24 .. 2022-12-30, refit the
             frozen hl=1 slopes and check them (1e-4), check the in-sample frozen ratios (0.696 / 0.903), and freeze the
             neighbour / lag variants -> discovery/{reproduce.json, frozen.json}. Reads no row after 2022-12-30 and no
             M1 bar at or after 2022-12-31 00:00 UTC. On a failed check it writes STEP0_FAILED.md and stops.
  confirm    load through 2026-08-20 (rows by London date; M1 < 2026-08-20 23:00 UTC), score the five cells once
             -> confirm/{cells.csv, numbers.json}, RESULTS.md, results.json.

Data are read from DATA_ROOT (default: the main checkout); outputs go under this repo's analysis/output.

    DATA_ROOT=<main checkout> python -X utf8 scripts/vol-layer-feedback-confirm/run.py [--step discovery|confirm|all]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from math import erf, sqrt
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.environ.get("DATA_ROOT", r"c:/Users/relli/OneDrive/Documents/Programming/Trading/v2 trading model/MacroFXModel"))
sys.path[:0] = [str(ROOT / "scripts/forecast_history")]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import forecast_record as FR  # noqa: E402

SEED = 20261116
FR.SEED = SEED                       # LR.Boot draws its weights from forecast_record.boot_weights
import line_reaction as LR  # noqa: E402
from forecast_record import klass  # noqa: E402

HIST = DATA / "analysis/output/forecast_history"
CHOSEN = DATA / "analysis/output/line_reaction/chosen_lines.csv"
BA = DATA / "data/m1_bidask"
BA_KEY = {"DE30": "dax", "SPX500": "spx", "DOW": "dow", "GOLD": "gold", "NQ": "nq", "UK100": "uk100", "US2000": "us2000"}
OUT = ROOT / "analysis/output/vol-layer-feedback-confirm"
DISC, CONF = OUT / "discovery", OUT / "confirm"
START, END_D, CHOSEN_FROM = "2016-10-24", "2022-12-30", "2020-08-24"
C0, END_C = "2023-01-01", "2026-08-20"
M1_END_D = pd.Timestamp("2022-12-31 00:00")          # UTC, as stage 3
M1_END_C = pd.Timestamp("2026-08-20 23:00")          # UTC: 00:00 London on 2026-08-21 in BST
B = 2000
N_SHUF, N_PERM = 100, 200
YEARS = ["2023", "2024", "2025", "2026"]
CLS = {"fx_majors": "FX majors", "fx_crosses": "FX crosses", "indices": "Indices", "gold": "Gold"}
FROZEN_B1 = {"p": 0.67559, "c": 0.42989}
STAGE3 = {"persist_p": 0.4949, "persist_c": 0.2453, "morning": 0.5637, "plateau_p": 0.7002, "plateau_c": 0.9137, "cov75_c": 25.5866}
INSAMPLE = {"p": 0.696, "c": 0.903}
# registered MDEs (prereg section 5, alpha 0.05, 80% power)
MDE_REG = {"persist_p": 0.070, "persist_c": 0.057, "morning": 0.083, "qlike_p": 0.090, "qlike_c": 0.043, "cov75": 1.34}
EVENTS = ("high", "NFP", "CPI", "FOMC")
T0 = time.time()


def log(*a):
    print(f"[{time.time() - T0:6.0f}s]", *a, flush=True)


def r(x, k=4):
    return None if x is None or not np.isfinite(x) else round(float(x), k)


def ncdf(z):
    return 0.5 * (1 + erf(z / sqrt(2)))


# ── load (stage 2 loader, window as an argument) ──────────────────────────────────────────────────────────────────────
def load(end):
    cols = ["inst", "date", "event", "last_min", "pit_sig_used", "r_hl", "r_oh", "r_ol", "rv5"] + \
           [f"pit_{q}_{k}" for q in ("oh", "ol") for k in ("p50", "p75", "p90")]
    X = pd.concat([pd.read_csv(f, usecols=cols) for f in sorted(HIST.glob("*.csv"))], ignore_index=True)
    X = X[(X.date >= START) & (X.date <= end) & (X.last_min >= 1200)].copy()
    C = pd.read_csv(CHOSEN, usecols=["inst", "date", "sig"] + [f"{q}_{k}" for q in ("oh", "ol") for k in ("p50", "p75", "p90")])
    C = C[(C.date >= START) & (C.date <= end)].rename(columns={"sig": "c_sig", **{f"{q}_{k}": f"c_{q}_{k}" for q in ("oh", "ol") for k in ("p50", "p75", "p90")}})
    X = X.merge(C, on=["inst", "date"], how="left")
    assert X.date.max() <= end and X.date.min() >= START, "window breach"
    X = X[(X.pit_sig_used > 0) & (X.r_hl > 0) & (X.rv5 > 0)].sort_values(["inst", "date"]).reset_index(drop=True)
    X["klass"] = X.inst.map(klass)
    X["year"] = X.date.str[:4]
    X["ym"] = X.date.str[:7]
    return X


def per_inst(X, fn):
    return pd.concat([fn(g) for _, g in X.groupby("inst", sort=True)]).loc[X.index]


def errors(X):
    """Stage 2 definitions (feedback.errors): past-only calibrated misses, and the point-in-time sigma tercile."""
    def f(g):
        g = g.copy()
        for nm, s, mp in (("p", g.pit_sig_used, 120), ("c", g.c_sig, 40)):
            h = s ** 2
            ratio = g.rv5 / h
            g[f"cal_{nm}"] = ratio.shift(1).expanding(mp).mean()
            g[f"h_{nm}"] = g[f"cal_{nm}"] * h
            g[f"e_{nm}"] = np.log(g.rv5 / g[f"h_{nm}"])
        s = g.pit_sig_used
        g["reg_rank"] = s.rolling(251, min_periods=121).apply(lambda a: (a[:-1] < a[-1]).mean(), raw=True)
        return g
    X = per_inst(X, f)
    X["regime"] = pd.cut(X.reg_rank, [-0.01, 1 / 3, 2 / 3, 1.01], labels=["quiet", "normal", "busy"])
    return X


def qlike(rv, h):
    x = rv / h
    return x - np.log(x) - 1


def har(X):
    """log-HAR on London-day RV5, per instrument, refit each January on earlier rows (>= 250), past-only scale."""
    def f(g):
        g = g.copy()
        lr = np.log(g.rv5)
        F = pd.DataFrame({"d": lr.shift(1), "w": lr.shift(1).rolling(5, min_periods=4).mean(), "m": lr.shift(1).rolling(22, min_periods=15).mean()}, index=g.index)
        pred = pd.Series(np.nan, index=g.index)
        for y in sorted(g.year.unique()):
            tr = (g.year < y) & F.notna().all(1)
            if tr.sum() < 250:
                continue
            A = np.column_stack([np.ones(tr.sum()), F[tr].to_numpy()])
            b = np.linalg.lstsq(A, lr[tr].to_numpy(), rcond=None)[0]
            te = (g.year == y) & F.notna().all(1)
            pred[te] = b[0] + F[te].to_numpy() @ b[1:]
        raw = np.exp(pred)
        g["h_har"] = (g.rv5 / raw).shift(1).expanding(120).mean() * raw
        g["e_har"] = np.log(g.rv5 / g.h_har)
        return g
    return per_inst(X, f)


def feats(X, nm, lag=1, hl=None):
    def f(g):
        e = g[f"e_{nm}"].shift(lag)
        if hl is None:
            return pd.DataFrame({"l1": e, "l5": e.rolling(5, min_periods=3).mean(), "l22": e.rolling(22, min_periods=10).mean()}, index=g.index)
        return pd.DataFrame({"ew": e.ewm(halflife=hl, min_periods=5).mean()}, index=g.index)
    return per_inst(X, f)


def scale(X, nm, adj):
    sig = X.pit_sig_used if nm == "p" else X.c_sig
    raw = sig ** 2 * np.exp(adj)
    mp = 120 if nm == "p" else 40
    T = pd.DataFrame({"inst": X.inst, "rv5": X.rv5, "raw": raw})
    return per_inst(T, lambda g: (g.rv5 / g.raw).shift(1).expanding(mp).mean() * g.raw)


def fb_yearly(X, nm, lag=1, hl=None):
    """Stage 3 fb_forecast: b pooled OLS refit each January on earlier years (reproduction only)."""
    F = feats(X, nm, lag, hl)
    adj = pd.Series(np.nan, index=X.index)
    for y in sorted(X.year.unique()):
        ok = (X.year < y) & F.notna().all(1) & X[f"e_{nm}"].notna()
        if ok.sum() < 1000:
            continue
        A = np.column_stack([np.ones(ok.sum()), F[ok].to_numpy()])
        b = np.linalg.lstsq(A, X.loc[ok, f"e_{nm}"].to_numpy(), rcond=None)[0]
        te = (X.year == y) & F.notna().all(1)
        adj[te] = F[te].to_numpy() @ b[1:]
    return scale(X, nm, adj)


def fit_b(X, nm, lag=1, hl=None):
    """Pooled OLS of e on [1, features] over every discovery row (date <= 2022-12-30)."""
    F = feats(X, nm, lag, hl)
    ok = F.notna().all(1) & X[f"e_{nm}"].notna() & (X.date <= END_D)
    A = np.column_stack([np.ones(ok.sum()), F[ok].to_numpy()])
    b = np.linalg.lstsq(A, X.loc[ok, f"e_{nm}"].to_numpy(), rcond=None)[0]
    return [float(v) for v in b], int(ok.sum()), X.loc[ok, "date"].min()


def fb_frozen(X, nm, b, lag=1, hl=1):
    F = feats(X, nm, lag, hl)
    adj = F.to_numpy() @ np.asarray(b[1:])
    return scale(X, nm, pd.Series(adj, index=X.index)), F


# ── hourly RV from M1 (feedback_wide.m1_hours) ────────────────────────────────────────────────────────────────────────
def m1_hours(insts, t0, t1, d0, d1):
    rows = []
    for inst in insts:
        f = BA / f"{BA_KEY.get(inst, inst.lower())}_m1.parquet"
        df = pd.read_parquet(f, columns=["time", "close"], filters=[("time", ">=", t0), ("time", "<", t1)])
        assert df.time.max() < t1
        t = df.time.dt.as_unit("ns")
        lt = pd.DatetimeIndex(t).tz_localize("UTC").tz_convert("Europe/London").tz_localize(None)
        d = pd.DataFrame({"date": lt.strftime("%Y-%m-%d"), "hour": lt.hour, "b5": lt.floor("5min"), "close": df.close.to_numpy()})
        del df, lt
        d = d[(d.hour < 22) & (d.date >= d0) & (d.date <= d1)]
        c5 = d.groupby("b5").agg(close=("close", "last"), date=("date", "first"), hour=("hour", "first"))
        c5["r"] = np.log(c5.close).groupby(c5.date).diff()
        rv = (c5.r ** 2 * 1e4).groupby([c5.date, c5.hour]).sum().unstack("hour").reindex(columns=range(22)).fillna(0.0)
        rv.columns = [f"rv_{h}" for h in range(22)]
        o = rv.reset_index().rename(columns={"index": "date"})
        o.insert(0, "inst", inst)
        rows.append(o)
        log("m1", inst, len(o), o.date.min(), o.date.max())
    return pd.concat(rows, ignore_index=True)


def add_hours(X, H):
    X = X.merge(H, on=["inst", "date"], how="left")
    rv = lambda a, b: X[[f"rv_{h}" for h in range(a, b)]].sum(1, min_count=1)
    for a, b in ((0, 13), (13, 22), (14, 22), (0, 12), (12, 22), (0, 14)):
        X[f"RV_{a}_{b}"] = rv(a, b)
    return X


def bucket_miss(X, col, sig, mp=120):
    def f(g):
        ratio = (g[col] / g[sig] ** 2).where(g[col] > 0)
        cal = ratio.shift(1).expanding(mp).mean()
        return np.log(g[col].where(g[col] > 0) / (cal * g[sig] ** 2))
    return per_inst(X, f)


# ── statistics ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def boot_weights(n, block):
    rng = np.random.default_rng(SEED)
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
    return W


class BootL(LR.Boot):
    def __init__(self, dates, block):
        self.dates = np.sort(pd.unique(dates))
        self.W = boot_weights(len(self.dates), block)
        self.idx = pd.Series(np.arange(len(self.dates)), index=self.dates)


def demean(D, y, x):
    D = D.dropna(subset=[y, x])
    a = D[x] - D[x].groupby(D.inst).transform("mean")
    b = D[y] - D[y].groupby(D.inst).transform("mean")
    return D, a.to_numpy(), b.to_numpy()


def slope(D, y, x, bs):
    D, a, b = demean(D, y, x)
    if len(D) < 50:
        return [None, None, None], np.array([np.nan]), 0
    st, reps = bs.ratio(D.date, a * b, D.date, a * a)
    return st, reps, len(D)


def slope_pt(D, y, x):
    D, a, b = demean(D, y, x)
    return float((a * b).sum() / (a * a).sum()) if len(D) >= 20 else np.nan


def qratio(D, num, den, bs):
    D = D.dropna(subset=[num, den, "rv5"])
    st, reps = bs.ratio(D.date, qlike(D.rv5, D[num]).to_numpy(), D.date, qlike(D.rv5, D[den]).to_numpy())
    return st, reps, len(D)


def qratio_pt(D, num, den):
    D = D.dropna(subset=[num, den, "rv5"])
    return float(qlike(D.rv5, D[num]).sum() / qlike(D.rv5, D[den]).sum()) if len(D) else np.nan


def pval(reps, null):
    reps = reps[np.isfinite(reps)]
    if not len(reps):
        return 1.0
    return float(max(1.0 / B, min(1.0, 2 * min((reps <= null).mean(), (reps >= null).mean()))))


def bh(ps, q=0.10):
    ps = np.asarray(ps, float)
    m = len(ps)
    o = np.argsort(ps)
    passed = np.zeros(m, bool)
    k = 0
    for i, j in enumerate(o):
        if ps[j] <= (i + 1) / m * q:
            k = i + 1
    passed[o[:k]] = True
    return passed


def mde_ci(lo, hi):
    return (2.8016) * (hi - lo) / 3.92 if lo is not None and hi is not None else None


def month_perm(vals, inst, ym, rng):
    """Whole-month permutation within each instrument: the series' month blocks are put in a random order."""
    out = np.empty(len(vals))
    for i in np.unique(inst):
        pos = np.flatnonzero(inst == i)
        months = ym[pos]
        cuts = np.flatnonzero(months[1:] != months[:-1]) + 1
        blocks = np.split(vals[pos], cuts)
        perm = rng.permutation(len(blocks))
        out[pos] = np.concatenate([blocks[k] for k in perm])
    return out


def row_shuffle(vals, inst, rng):
    out = vals.copy()
    for i in np.unique(inst):
        pos = np.flatnonzero(inst == i)
        out[pos] = vals[pos][rng.permutation(len(pos))]
    return out


def slope_arr(a, b, inst):
    a = a - pd.Series(a).groupby(inst).transform("mean").to_numpy()
    b = b - pd.Series(b).groupby(inst).transform("mean").to_numpy()
    return float((a * b).sum() / (a * a).sum())


# ── step 0: discovery ──────────────────────────────────────────────────────────────────────────────────────────────────
def discovery():
    DISC.mkdir(parents=True, exist_ok=True)
    X = errors(load(END_D))
    assert X.date.max() <= END_D
    X = har(X)
    insts = sorted(X.inst.unique())
    log("discovery rows", len(X), "insts", len(insts))
    bs = LR.Boot(X.date)
    chk = {}
    for nm in ("p", "c"):
        X[f"e1_{nm}"] = X.groupby("inst")[f"e_{nm}"].shift(1)
    chk["persist_p"] = slope(X[X.date >= "2017-01-01"], "e_p", "e1_p", bs)[0][0]
    chk["persist_c"] = slope(X[X.date >= CHOSEN_FROM], "e_c", "e1_c", bs)[0][0]
    CV = pd.concat([pd.DataFrame({"date": X.date, "hit": (X[f"r_{s}"] > X[f"c_{s}_p75"]).astype(float), "ok": X[f"c_{s}_p75"].notna()}) for s in ("oh", "ol")])
    CV = CV[CV.ok]
    chk["cov75_c"] = bs.mean(CV.date, CV.hit.to_numpy() * 100)[0][0]
    # stage 3 race rows and the hl=1 plateau point (b refit each January)
    X["h_fbp"], X["h_fbp2"] = fb_yearly(X, "p", 1), fb_yearly(X, "p", 2)
    X["h_fbc"], X["h_fbc2"] = fb_yearly(X, "c", 1), fb_yearly(X, "c", 2)
    RP = X[X.date >= "2019-01-01"].dropna(subset=["h_p", "h_fbp", "h_fbp2", "h_har"])
    RC = X[X.date >= "2021-01-04"].dropna(subset=["h_c", "h_fbc", "h_fbc2", "h_p"])
    chk["plateau_p"] = qratio(RP.assign(hx=fb_yearly(X, "p", 1, hl=1).loc[RP.index]), "hx", "h_p", bs)[0][0]
    chk["plateau_c"] = qratio(RC.assign(hx=fb_yearly(X, "c", 1, hl=1).loc[RC.index]), "hx", "h_c", bs)[0][0]
    log("reproduced (no M1)", chk)
    H = m1_hours(insts, pd.Timestamp("2016-10-22"), M1_END_D, START, END_D)
    assert H.date.max() <= END_D
    H.to_parquet(DISC / "m1_hours_discovery.parquet", index=False)
    X = add_hours(X, H)
    X["S_am"] = bucket_miss(X, "RV_0_13", "pit_sig_used")
    X["A_pm"] = bucket_miss(X, "RV_13_22", "pit_sig_used")
    chk["morning"] = slope(X[X.date >= "2017-01-01"], "A_pm", "S_am", bs)[0][0]
    rep = {k: {"stage3": STAGE3[k], "now": chk[k], "ok": bool(round(chk[k], 3) == round(STAGE3[k], 3))} for k in STAGE3}
    # frozen slopes
    frozen = {}
    for nm in ("p", "c"):
        b, n, first = fit_b(X, nm, 1, 1)
        rep[f"b1_{nm}"] = {"prereg": FROZEN_B1[nm], "now": round(b[1], 6), "n_rows": n, "first": first, "ok": bool(abs(b[1] - FROZEN_B1[nm]) <= 1e-4)}
        frozen[f"{nm}_hl1"] = {"b": [b[0], FROZEN_B1[nm]], "n": n, "first": first, "refit_b1": b[1]}
        for tag, lag, hl in (("hl2", 1, 2), ("hl3", 1, 3), ("hl1_lag2", 2, 1)):
            bb, nn, ff = fit_b(X, nm, lag, hl)
            frozen[f"{nm}_{tag}"] = {"b": bb, "n": nn, "first": ff}
        bb, nn, ff = fit_b(X, nm, 1, None)               # stage 2 three-feature rule, frozen (descriptive)
        frozen[f"{nm}_3feat"] = {"b": bb, "n": nn, "first": ff}
    for nm, start in (("p", "2019-01-02"), ("c", "2021-03-01")):
        hx, _ = fb_frozen(X, nm, [0.0, FROZEN_B1[nm]], 1, 1)
        S = X.assign(hx=hx)
        S = S[S.date >= start].dropna(subset=["hx", f"h_{nm}"])
        v = qratio_pt(S, "hx", f"h_{nm}")
        rep[f"insample_{nm}"] = {"prereg": INSAMPLE[nm], "now": round(v, 4), "ok": bool(round(v, 3) == INSAMPLE[nm])}
    ok = all(v["ok"] for v in rep.values())
    json.dump({"ok": ok, "checks": rep, "ranAt": datetime.now(timezone.utc).isoformat(timespec="seconds")}, open(DISC / "reproduce.json", "w"), indent=1)
    json.dump({"seed": SEED, "fit_window": [START, END_D], "frozen": frozen}, open(DISC / "frozen.json", "w"), indent=1, default=str)
    log("reproduce", json.dumps(rep, default=str))
    if not ok:
        bad = {k: v for k, v in rep.items() if not v["ok"]}
        (OUT / "STEP0_FAILED.md").write_text("# vol-layer-feedback-confirm: step 0 failed\n\nThe discovery reproduction did not match. "
                                             "No 2023+ outcome was read.\n\n```json\n" + json.dumps(bad, indent=1, default=str) + "\n```\n", encoding="utf-8")
        log("STEP 0 FAILED", bad)
        return False
    return True


# ── step 1: confirm ────────────────────────────────────────────────────────────────────────────────────────────────────
CELLS = []


def add(group, name, st, reps=None, null=None, n=None, extra=None):
    row = {"group": group, "cell": name, "value": st[0], "lo": st[1], "hi": st[2], "n": n,
           "p": pval(reps, null) if reps is not None and null is not None else None}
    if extra:
        row.update(extra)
    CELLS.append(row)
    return row


def confirm():
    CONF.mkdir(parents=True, exist_ok=True)
    rep = json.load(open(DISC / "reproduce.json"))
    assert rep["ok"], "step 0 not passed"
    FZ = json.load(open(DISC / "frozen.json"))["frozen"]
    rng = np.random.default_rng(SEED)
    X = errors(load(END_C))
    assert X.date.max() <= END_C
    X = har(X)
    insts = sorted(X.inst.unique())
    log("rows", len(X), "insts", len(insts))
    # M1 hours: discovery part (step 0) + confirm part
    Hd = pd.read_parquet(DISC / "m1_hours_discovery.parquet")
    hc = CONF / "m1_hours_confirm.parquet"
    if hc.exists():
        Hc = pd.read_parquet(hc)
    else:
        Hc = m1_hours(insts, pd.Timestamp("2022-12-30"), M1_END_C, C0, END_C)
        Hc.to_parquet(hc, index=False)
    assert Hc.date.max() <= END_C and Hc.date.min() >= C0
    X = add_hours(X, pd.concat([Hd, Hc], ignore_index=True))
    log("hours merged; rows with hours", int(X.rv_0.notna().sum()))

    for nm in ("p", "c", "har"):
        for k in (1, 2, 5, 10):
            X[f"e{k}_{nm}"] = X.groupby("inst")[f"e_{nm}"].shift(k)
    # morning misses: plain sigma, each window its own past-only cal
    for a, b in ((0, 13), (13, 22), (14, 22), (0, 12), (12, 22), (0, 14)):
        X[f"m_{a}_{b}"] = bucket_miss(X, f"RV_{a}_{b}", "pit_sig_used")
    X["mc_0_13"] = bucket_miss(X, "RV_0_13", "c_sig", 40)
    X["mc_13_22"] = bucket_miss(X, "RV_13_22", "c_sig", 40)
    # frozen feedback forecasts
    EW = {}
    for nm in ("p", "c"):
        for tag, lag, hl in (("hl1", 1, 1), ("hl2", 1, 2), ("hl3", 1, 3), ("hl1_lag2", 2, 1)):
            X[f"h_{nm}_{tag}"], F = fb_frozen(X, nm, FZ[f"{nm}_{tag}"]["b"], lag, hl)
            if tag == "hl1":
                EW[nm] = F.ew
        X[f"h_{nm}_3feat"], _ = fb_frozen(X, nm, FZ[f"{nm}_3feat"]["b"], 1, None)
    log("frozen forecasts built")

    S = X[X.date >= C0].copy()
    assert S.date.min() >= C0 and S.date.max() <= END_C
    log("scored rows", len(S), "dates", S.date.nunique())
    bs = LR.Boot(S.date)
    bs60 = BootL(S.date, 60)
    N = {"scored_rows": int(len(S)), "scored_dates": int(S.date.nunique()), "window": [S.date.min(), S.date.max()]}
    nonev = S.event == "none"
    isev = S.event.isin(EVENTS)
    # pooled per-date miss for the concentration check
    def drop_top(D, col):
        m = S.groupby("date")[col].mean().abs()
        cut = m.quantile(0.99)
        return D[~D.date.isin(m[m > cut].index)]

    res = {}

    # ── A: persistence ─────────────────────────────────────────────────────────────────────────────────────────────
    for nm, lab in (("p", "plain"), ("c", "chosen")):
        y, x = f"e_{nm}", f"e1_{nm}"
        D = S.dropna(subset=[y, x])
        st, reps, n = slope(D, y, x, bs)
        main = add("A persistence", f"{lab} | All", st, reps, 0.0, n, {"se": float(np.nanstd(reps)), "dates": int(D.date.nunique())})
        g = {"main": main}
        g["block60"] = add("A persistence", f"{lab} | All, block 60", slope(D, y, x, bs60)[0], None, None, n)
        g["lag"] = {k: add("A persistence lag", f"{lab} | lag {k}", *slope(S, y, f"e{k}_{nm}", bs)[:2], 0.0, None) for k in (2, 5, 10)}
        g["years"] = {yr: add("A persistence year", f"{lab} | {yr}", *slope(D[D.year == yr], y, x, bs)[:2], 0.0) for yr in YEARS}
        g["inst"] = {i: slope_pt(D[D.inst == i], y, x) for i in insts}
        g["inst_cells"] = {i: add("A persistence inst", f"{lab} | {i}", *slope(D[D.inst == i], y, x, bs)[:2], 0.0) for i in insts}
        g["class"] = {CLS[k]: add("A persistence class", f"{lab} | {CLS[k]}", *slope(D[D.klass == k], y, x, bs)[:2], 0.0) for k in CLS}
        g["tercile"] = {t: add("A persistence tercile", f"{lab} | σ {t}", *slope(D[D.regime == t], y, x, bs)[:2], 0.0) for t in ("quiet", "normal", "busy")}
        g["event"] = {"event": add("A persistence event", f"{lab} | event days", *slope(D[isev.loc[D.index]], y, x, bs)[:2], 0.0),
                      "none": add("A persistence event", f"{lab} | non-event days", *slope(D[nonev.loc[D.index]], y, x, bs)[:2], 0.0)}
        g["mirror"] = {"above": add("A mirror", f"{lab} | yesterday above forecast", *slope(D[D[x] > 0], y, x, bs)[:2], 0.0),
                       "below": add("A mirror", f"{lab} | yesterday below forecast", *slope(D[D[x] <= 0], y, x, bs)[:2], 0.0)}
        g["conc"] = add("A concentration", f"{lab} | without top 1% dates", slope(drop_top(D, y), y, x, bs)[0], None)
        # shuffles and month placebos
        a, b, ii, ym = D[x].to_numpy(), D[y].to_numpy(), D.inst.to_numpy(), D.ym.to_numpy()
        sh = np.array([slope_arr(row_shuffle(a, ii, rng), b, ii) for _ in range(N_SHUF)])
        pm = np.array([slope_arr(month_perm(a, ii, ym, rng), b, ii) for _ in range(N_PERM)])
        g["shuffle"] = {"max": float(sh.max()), "mean": float(sh.mean()), "sd": float(sh.std()), "beats_all": bool(st[0] > sh.max())}
        g["month"] = {"max": float(pm.max()), "mean": float(pm.mean()), "sd": float(pm.std()), "beats_all": bool(st[0] > pm.max())}
        res[f"A_{nm}"] = g
    S_har = S.dropna(subset=["e_har", "e1_har"])
    res["A_har"] = add("A descriptive", "log-HAR | All", *slope(S_har, "e_har", "e1_har", bs)[:2], 0.0, len(S_har))
    log("A done")

    # ── B: morning -> afternoon ────────────────────────────────────────────────────────────────────────────────────
    D = S.dropna(subset=["m_0_13", "m_13_22"])
    st, reps, n = slope(D, "m_13_22", "m_0_13", bs)
    g = {"main": add("B morning", "plain | 00-13 -> 13-22", st, reps, 0.0, n, {"se": float(np.nanstd(reps)), "dates": int(D.date.nunique())})}
    g["block60"] = add("B morning", "plain | block 60", slope(D, "m_13_22", "m_0_13", bs60)[0], None, None, n)
    g["skip1314"] = add("B lag", "plain | 00-13 -> 14-22", *slope(S, "m_14_22", "m_0_13", bs)[:2], 0.0)
    g["cut12"] = add("B plateau", "plain | 00-12 -> 12-22", *slope(S, "m_12_22", "m_0_12", bs)[:2], 0.0)
    g["cut14"] = add("B plateau", "plain | 00-14 -> 14-22", *slope(S, "m_14_22", "m_0_14", bs)[:2], 0.0)
    g["years"] = {yr: add("B year", f"plain | {yr}", *slope(D[D.year == yr], "m_13_22", "m_0_13", bs)[:2], 0.0) for yr in YEARS}
    g["inst"] = {i: slope_pt(D[D.inst == i], "m_13_22", "m_0_13") for i in insts}
    g["inst_cells"] = {i: add("B inst", f"plain | {i}", *slope(D[D.inst == i], "m_13_22", "m_0_13", bs)[:2], 0.0) for i in insts}
    g["class"] = {CLS[k]: add("B class", f"plain | {CLS[k]}", *slope(D[D.klass == k], "m_13_22", "m_0_13", bs)[:2], 0.0) for k in CLS}
    g["tercile"] = {t: add("B tercile", f"plain | σ {t}", *slope(D[D.regime == t], "m_13_22", "m_0_13", bs)[:2], 0.0) for t in ("quiet", "normal", "busy")}
    g["event"] = {"event": add("B event", "plain | event days", *slope(D[isev.loc[D.index]], "m_13_22", "m_0_13", bs)[:2], 0.0),
                  "none": add("B event", "plain | non-event days", *slope(D[nonev.loc[D.index]], "m_13_22", "m_0_13", bs)[:2], 0.0)}
    med = D.groupby("inst").m_0_13.transform("median")
    g["mirror"] = {"quiet_am": add("B mirror", "plain | below-median mornings", *slope(D[D.m_0_13 <= med], "m_13_22", "m_0_13", bs)[:2], 0.0),
                   "busy_am": add("B mirror", "plain | above-median mornings", *slope(D[D.m_0_13 > med], "m_13_22", "m_0_13", bs)[:2], 0.0)}
    g["conc"] = add("B concentration", "plain | without top 1% dates", slope(drop_top(D, "e_p"), "m_13_22", "m_0_13", bs)[0], None)
    g["chosen"] = add("B descriptive", "chosen σ | 00-13 -> 13-22", *slope(S, "mc_13_22", "mc_0_13", bs)[:2], 0.0)
    a, b, ii, ym = D.m_0_13.to_numpy(), D.m_13_22.to_numpy(), D.inst.to_numpy(), D.ym.to_numpy()
    pm = np.array([slope_arr(month_perm(a, ii, ym, rng), b, ii) for _ in range(N_PERM)])
    g["month"] = {"max": float(pm.max()), "mean": float(pm.mean()), "sd": float(pm.std()), "beats_all": bool(st[0] > pm.max())}
    res["B"] = g
    log("B done")

    # ── C: frozen feedback, QLIKE ratio ────────────────────────────────────────────────────────────────────────────
    for nm, lab in (("p", "plain"), ("c", "chosen")):
        base, fb = f"h_{nm}", f"h_{nm}_hl1"
        D = S.dropna(subset=[base, fb, f"h_{nm}_hl2", f"h_{nm}_hl3", f"h_{nm}_hl1_lag2", "rv5"])
        st, reps, n = qratio(D, fb, base, bs)
        g = {"main": add("C QLIKE", f"{lab} | hl 1 frozen", st, reps, 1.0, n, {"se": float(np.nanstd(reps)), "dates": int(D.date.nunique())})}
        g["block60"] = add("C QLIKE", f"{lab} | block 60", qratio(D, fb, base, bs60)[0], None, None, n)
        g["lag2"] = add("C lag", f"{lab} | misses delayed one more session", *qratio(D, f"h_{nm}_hl1_lag2", base, bs)[:2], 1.0)
        g["hl2"] = add("C plateau", f"{lab} | hl 2", *qratio(D, f"h_{nm}_hl2", base, bs)[:2], 1.0)
        g["hl3"] = add("C plateau", f"{lab} | hl 3", *qratio(D, f"h_{nm}_hl3", base, bs)[:2], 1.0)
        g["years"] = {yr: add("C year", f"{lab} | {yr}", *qratio(D[D.year == yr], fb, base, bs)[:2], 1.0) for yr in YEARS}
        g["inst"] = {i: qratio_pt(D[D.inst == i], fb, base) for i in insts}
        g["inst_cells"] = {i: add("C inst", f"{lab} | {i}", *qratio(D[D.inst == i], fb, base, bs)[:2], 1.0) for i in insts}
        g["class"] = {CLS[k]: add("C class", f"{lab} | {CLS[k]}", *qratio(D[D.klass == k], fb, base, bs)[:2], 1.0) for k in CLS}
        g["tercile"] = {t: add("C tercile", f"{lab} | σ {t}", *qratio(D[D.regime == t], fb, base, bs)[:2], 1.0) for t in ("quiet", "normal", "busy")}
        g["event"] = {"event": add("C event", f"{lab} | event days", *qratio(D[isev.loc[D.index]], fb, base, bs)[:2], 1.0),
                      "none": add("C event", f"{lab} | non-event days", *qratio(D[nonev.loc[D.index]], fb, base, bs)[:2], 1.0)}
        g["conc"] = add("C concentration", f"{lab} | without top 1% dates", qratio(drop_top(D, f"e_{nm}"), fb, base, bs)[0], None)
        g["3feat"] = add("C descriptive", f"{lab} | stage 2 three-feature rule, frozen", *qratio(D.dropna(subset=[f"h_{nm}_3feat"]), f"h_{nm}_3feat", base, bs)[:2], 1.0)
        if nm == "p":
            g["har"] = add("C descriptive", "log-HAR ÷ plain", *qratio(D.dropna(subset=["h_har"]), "h_har", base, bs)[:2], 1.0)
        # frozen-scale sensitivity: cal held at its 2022-12-30 value (per instrument), for both arms
        sig2 = (X.pit_sig_used if nm == "p" else X.c_sig) ** 2
        rawfb = sig2 * np.exp(FZ[f"{nm}_hl1"]["b"][1] * EW[nm])
        last = lambda col: X.assign(v=col).loc[X.date <= END_D].groupby("inst").v.last()
        cal_b = last(X[f"cal_{nm}"])
        cal_f = last(X[fb] / rawfb)
        Z = D.assign(hb=X.loc[D.index, "inst"].map(cal_b) * sig2.loc[D.index], hf=X.loc[D.index, "inst"].map(cal_f) * rawfb.loc[D.index])
        g["frozen_scale"] = add("C descriptive", f"{lab} | scale frozen at 2022-12-30", *qratio(Z, "hf", "hb", bs)[:2], 1.0)
        # month placebo: the EWMA input comes from another month (frozen b1), scale recomputed past-only
        mp = 120 if nm == "p" else 40
        b1 = FZ[f"{nm}_hl1"]["b"][1]
        mask_all = X.index.isin(D.index)
        num_pl = np.zeros(N_PERM)
        den = float(qlike(D.rv5, D[base]).sum())
        num_chk = 0.0
        for i in insts:
            pos = np.flatnonzero((X.inst == i).to_numpy())
            rv = X.rv5.to_numpy()[pos]
            s2 = sig2.to_numpy()[pos]
            ew = EW[nm].to_numpy()[pos]
            conf = X.date.to_numpy()[pos] >= C0
            msk = mask_all[pos]
            ymi = X.ym.to_numpy()[pos]

            def h_of(ewv):
                raw = s2 * np.exp(b1 * ewv)
                ratio = rv / raw
                v = np.where(np.isfinite(ratio), ratio, 0.0)
                c = np.isfinite(ratio).astype(float)
                cs, cc = np.concatenate([[0], np.cumsum(v)[:-1]]), np.concatenate([[0], np.cumsum(c)[:-1]])
                cal = np.where(cc >= mp, cs / np.maximum(cc, 1), np.nan)
                return cal * raw
            hreal = h_of(ew)
            num_chk += float(np.nansum(qlike(rv[msk], hreal[msk])))
            cpos = np.flatnonzero(conf)
            for k in range(N_PERM):
                ewp = ew.copy()
                ewp[cpos] = month_perm(ew[cpos], np.zeros(len(cpos)), ymi[cpos], rng)
                hp = h_of(ewp)
                num_pl[k] += float(np.nansum(qlike(rv[msk], hp[msk])))
        pl = num_pl / den
        g["month"] = {"min": float(pl.min()), "mean": float(pl.mean()), "sd": float(pl.std()), "beats_all": bool(st[0] < pl.min()),
                      "numpy_check": r(num_chk / den, 5)}
        res[f"C_{nm}"] = g
        log("C", nm, "done", st, "placebo min", pl.min(), "check", num_chk / den)

    # ── D: chosen p75 coverage ─────────────────────────────────────────────────────────────────────────────────────
    CVs = []
    for side in ("oh", "ol"):
        for rung in ("p50", "p75", "p90"):
            ok = S[f"c_{side}_{rung}"].notna()
            CVs.append(pd.DataFrame({"inst": S.inst, "date": S.date, "year": S.year, "klass": S.klass, "regime": S.regime, "event": S.event, "side": side, "rung": rung,
                                     "hit": (S[f"r_{side}"] > S[f"c_{side}_{rung}"]).astype(float) * 100, "e_c": S.e_c})[ok])
    CV = pd.concat(CVs, ignore_index=True)
    C75 = CV[CV.rung == "p75"]
    st, reps = bs.mean(C75.date, C75.hit.to_numpy())
    reps_f = reps[np.isfinite(reps)]
    p_tost = float(max(1.0 / B, (reps_f <= 22.5).mean(), (reps_f >= 27.5).mean()))
    g = {"main": add("D coverage", "chosen p75 | All", st, None, None, len(C75), {"p": p_tost, "se": float(np.nanstd(reps)), "dates": int(C75.date.nunique())})}
    g["block60"] = add("D coverage", "chosen p75 | block 60", bs60.mean(C75.date, C75.hit.to_numpy())[0], None, None, len(C75))
    cov = lambda Dd, lab, grp="D slice": add(grp, lab, *bs.mean(Dd.date, Dd.hit.to_numpy())[:1], None, None, len(Dd))
    g["years"] = {yr: cov(C75[C75.year == yr], f"chosen p75 | {yr}", "D year") for yr in YEARS}
    g["tercile"] = {t: cov(C75[C75.regime == t], f"chosen p75 | σ {t}", "D tercile") for t in ("quiet", "normal", "busy")}
    g["class"] = {CLS[k]: cov(C75[C75.klass == k], f"chosen p75 | {CLS[k]}", "D class") for k in CLS}
    g["side"] = {s: cov(C75[C75.side == s], f"chosen p75 | {s.upper()} side", "D mirror") for s in ("oh", "ol")}
    g["event"] = {"event": cov(C75[C75.event.isin(EVENTS)], "chosen p75 | event days", "D event"), "none": cov(C75[C75.event == "none"], "chosen p75 | non-event days", "D event")}
    g["rungs"] = {k: cov(CV[CV.rung == k], f"chosen {k} | All", "D rungs") for k in ("p50", "p90")}
    g["conc"] = cov(drop_top(C75, "e_c"), "chosen p75 | without top 1% dates", "D concentration")
    g["inst"] = {i: float(C75[C75.inst == i].hit.mean()) for i in insts}
    res["D"] = g
    log("D done")

    # ── placebo-SD rule, Holm, gates, verdicts ─────────────────────────────────────────────────────────────────────
    def cell_p(g, null):
        m = g["main"]
        pl = g.get("month")
        p_boot = m["p"]
        use_pl = bool(pl and pl["sd"] > 1.25 * m["se"])
        p = p_boot
        if use_pl:
            z = abs(m["value"] - null) / pl["sd"]
            p = max(1.0 / B, 2 * (1 - ncdf(z)))
        return p, {"p_boot": p_boot, "boot_se": r(m["se"], 5), "placebo_sd": r(pl["sd"], 5) if pl else None, "uses_placebo_sd": use_pl, "p_used": p}

    P = {}
    P["persist"] = {}
    pa = []
    for nm in ("p", "c"):
        p, info = cell_p(res[f"A_{nm}"], 0.0)
        P["persist"][nm] = info
        pa.append(p)
    raw_p = {"persist": max(pa)}
    for key, cell, null in (("morning", "B", 0.0), ("qlike-plain", "C_p", 1.0), ("qlike-chosen", "C_c", 1.0)):
        p, info = cell_p(res[cell], null)
        P[key] = info
        raw_p[key] = p
    raw_p["cov75"] = p_tost
    P["cov75"] = {"p_tost": p_tost}
    keys = ["persist", "morning", "qlike-plain", "qlike-chosen", "cov75"]
    holm = dict(zip(keys, LR.holm(np.array([raw_p[k] for k in keys]))))

    def gates_slope(g, lagcheck, plateau, extra=None):
        m = g["main"]
        G = {"1_holm": None, "2_bar": m["value"] >= 0.10}
        G["3_lag"] = lagcheck
        G["4_plateau"] = plateau
        G["5_years"] = sum(1 for v in g["years"].values() if v["value"] is not None and v["value"] > 0) >= 3
        G["6_breadth"] = sum(1 for v in g["inst"].values() if np.isfinite(v) and v > 0) >= 26
        G["7_placebo"] = g["month"]["beats_all"] and (g["shuffle"]["beats_all"] if "shuffle" in g else True)
        if extra:
            G.update(extra)
        return G

    gates = {}
    for nm in ("p", "c"):
        g = res[f"A_{nm}"]
        lag2 = g["lag"][2]
        l5, l10 = g["lag"][5]["value"], g["lag"][10]["value"]
        gates[f"persist_{nm}"] = gates_slope(g, bool(lag2["value"] > 0 and lag2["lo"] > 0),
                                              bool(g["main"]["value"] > l5 > l10 and min(g["main"]["value"], l5, l10) > 0))
    gB = res["B"]
    bm = gB["main"]["value"]
    half = lambda v: v is not None and np.sign(v) == np.sign(bm) and abs(v) >= 0.5 * abs(bm)
    gates["morning"] = gates_slope(gB, half(gB["skip1314"]["value"]), half(gB["cut12"]["value"]) and half(gB["cut14"]["value"]),
                                   {"8_nonevent": gB["event"]["none"]["value"] >= 0.5 * bm})
    for nm in ("p", "c"):
        g = res[f"C_{nm}"]
        cut = 1 - g["main"]["value"]
        gates[f"qlike_{nm}"] = {"1_holm": None, "2_bar": g["main"]["value"] <= 0.95, "3_lag": g["lag2"]["value"] < 1,
                                "4_plateau": (1 - g["hl2"]["value"]) >= 0.5 * cut and (1 - g["hl3"]["value"]) >= 0.5 * cut,
                                "5_years": sum(1 for v in g["years"].values() if v["value"] is not None and v["value"] < 1) >= 3,
                                "6_breadth": sum(1 for v in g["inst"].values() if np.isfinite(v) and v < 1) >= 26,
                                "7_placebo": g["month"]["beats_all"]}
    gD = res["D"]
    inband = lambda v: v is not None and 22.5 <= v <= 27.5
    gates["cov75"] = {"1_holm": None, "2_bar": gD["main"]["lo"] >= 22.5 and gD["main"]["hi"] <= 27.5,
                      "5_years": sum(1 for v in gD["years"].values() if inband(v["value"])) >= 3,
                      "6_breadth": all(inband(v["value"]) for v in gD["tercile"].values())}
    hk = {"persist_p": "persist", "persist_c": "persist", "morning": "morning", "qlike_p": "qlike-plain", "qlike_c": "qlike-chosen", "cov75": "cov75"}
    for k, G in gates.items():
        G["1_holm"] = bool(holm[hk[k]] < 0.05)
        for kk in G:
            G[kk] = bool(G[kk])

    def verdict(k, m):
        G = gates[k]
        if k == "cov75":
            lo, hi = m["lo"], m["hi"]
            if hi < 22.5 or lo > 27.5:
                return "NULL"
            if all(G.values()):
                return "VALIDATED"
            if lo < 22.5 <= hi or lo <= 27.5 < hi:
                return "UNDERPOWERED"
            return "CONTEXT"
        slope_cell = k.startswith(("persist", "morning"))
        v, lo, hi = m["value"], m["lo"], m["hi"]
        noeff, bar = (0.0, 0.10) if slope_cell else (1.0, 0.95)
        wrong_sig = (hi < noeff) if slope_cell else (lo > noeff)
        excl_bar = (hi < bar) if slope_cell else (lo > bar)
        if wrong_sig or excl_bar:
            return "NULL"
        if all(G.values()):
            return "VALIDATED"
        incl_noeff = lo <= noeff <= hi
        incl_bar = lo <= bar <= hi
        if incl_noeff and incl_bar:
            return "UNDERPOWERED"
        return "CONTEXT"

    V = {k: verdict(k, (res["A_p"] if k == "persist_p" else res["A_c"] if k == "persist_c" else res["B"] if k == "morning" else res["C_p"] if k == "qlike_p" else res["C_c"] if k == "qlike_c" else res["D"])["main"]) for k in gates}
    order = ["NULL", "UNDERPOWERED", "CONTEXT", "VALIDATED"]
    V["persist"] = min(V["persist_p"], V["persist_c"], key=order.index)   # conjunctive: the weaker forecast decides

    # BH over the descriptive slices (class, tercile, year, event, C by instrument)
    groups_bh = ("A persistence class", "A persistence tercile", "A persistence year", "A persistence event", "B class", "B tercile", "B year", "B event",
                 "C class", "C tercile", "C year", "C event", "C inst")
    sl = [c for c in CELLS if c["group"] in groups_bh and c["p"] is not None]
    passed = bh([c["p"] for c in sl], 0.10)
    for c, ok in zip(sl, passed):
        c["bh_q10"] = bool(ok)
    N["bh"] = {"slices": len(sl), "pass": int(passed.sum()), "expected_false_at_q10_if_all_null": round(0.10 * passed.sum(), 1)}

    pd.DataFrame(CELLS).to_csv(CONF / "cells.csv", index=False)
    out = {"N": N, "res": res, "p": P, "raw_p": raw_p, "holm": holm, "gates": gates, "verdicts": V,
           "frozen": FZ, "reproduce": rep["checks"], "ranAt": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    json.dump(out, open(CONF / "numbers.json", "w"), indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o))
    log("verdicts", V)
    log("holm", holm)
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--step", default="all", choices=["discovery", "confirm", "all"])
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    if a.step in ("discovery", "all"):
        if not discovery():
            sys.exit(2)
    if a.step in ("confirm", "all"):
        confirm()
