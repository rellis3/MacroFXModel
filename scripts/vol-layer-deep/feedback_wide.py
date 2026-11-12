"""Vol-Layer layer 8 (feedback), stage 3: go wide. How the forecaster's own errors behave across conditions.

Reuses the stage 2 loaders (scripts/vol-layer-deep/feedback.py: load, errors, feedback betas idea) and adds:
  - C.OG's Lesson 05 regime: rolling 63-session vol of open-to-open returns above 1.25 x its past rolling median for
    21+ sessions = turbulent, else calm (the spell label is descriptive: a spell is known to be 21+ long only after 21 days);
    plus the stage 2 sigma terciles (point-in-time rank of sigma among its past 250 values).
  - log-HAR on the London-day 5-minute RV (per instrument, refit each January on earlier rows) as a benchmark forecast.
  - hourly 5-minute RV per London hour from data/m1_bidask (mid close), and the median bid/ask spread 07-16 London.
  - error-feedback forecasts with an extra session of delay (+1 lag check) and an EWMA half-life sweep (plateau check).

Nothing is a trade, so no stop/target touches are scored (no R): every number is a forecast error, a hit rate or a slope.
DISCOVERY WINDOW ONLY: sessions 2016-10-24 .. 2022-12-30 (asserted). M1 is read with a filter that ends 2022-12-31 00:00 UTC.

    python -X utf8 scripts/vol-layer-deep/feedback_wide.py
      -> backtest-data/vol-layer/feedback-wide.json, analysis/output/vol-layer-deep/feedback/wide/{numbers.json, cells.csv, m1_hours.parquet}
         intro.json / holds.json in wide/ are written by hand after reading the numbers (the script reads them back).
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

import forecast_record as FR  # noqa: E402

SEED = 20261112
FR.SEED = SEED                                   # LR.Boot draws its weights from forecast_record.boot_weights
import line_reaction as LR  # noqa: E402
import feedback as FB  # noqa: E402

FB.CHECK = tuple(range(1, 23))                   # stage 2 loader, with every hourly OH/OL column
START, END, CHOSEN_FROM = FB.START, FB.END, FB.CHOSEN_FROM
assert (START, END) == ("2016-10-24", "2022-12-30")
OUT = ROOT / "analysis/output/vol-layer-deep/feedback/wide"
WEB = ROOT / "backtest-data/vol-layer/feedback-wide.json"
BA, BA_KEY = FB.BA, FB.BA_KEY
CLS = {"fx_majors": "FX majors", "fx_crosses": "FX crosses", "indices": "Indices", "gold": "Gold"}
BUCKETS = [("Asia 00-07", 0, 7), ("London open 07-10", 7, 10), ("London mid 10-13", 10, 13), ("Overlap 13-16", 13, 16), ("NY afternoon 16-22", 16, 22)]
YEARS = ["2017", "2018", "2019", "2020", "2021", "2022"]
RNG = np.random.default_rng(SEED)
B = 2000
T0 = time.time()


def r(x, k=4):
    return None if x is None or not np.isfinite(x) else round(float(x), k)


def log(*a):
    print(f"[{time.time() - T0:6.0f}s]", *a, flush=True)


# ── bootstrap: LR.Boot (stationary, block 20) and the same with a regime-length block ────────────────────────────────
def weights(n, block):
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
        self.W = weights(len(self.dates), block)
        self.idx = pd.Series(np.arange(len(self.dates)), index=self.dates)


CELLS = []


def pval(reps, null):
    reps = reps[np.isfinite(reps)]
    if not len(reps):
        return 1.0
    return float(max(1.0 / B, min(1.0, 2 * min((reps <= null).mean(), (reps >= null).mean()))))


def cell(group, name, stat, reps, null, n=None):
    CELLS.append({"group": group, "cell": name, "value": stat[0], "lo": stat[1], "hi": stat[2], "null": null, "p": pval(reps, null), "n": n})
    return stat


# ── load and extend ─────────────────────────────────────────────────────────────────────────────────────────────────
def regimes():
    """C.OG Lesson 05 turbulent/calm per instrument from open-to-open returns (past only for vol and median)."""
    out = []
    for f in sorted(FB.HIST.glob("*.csv")):
        g = pd.read_csv(f, usecols=["inst", "date", "open"])
        g = g[g.date <= END].sort_values("date").reset_index(drop=True)
        ret = np.log(g.open / g.open.shift(1))                               # known at today's open
        vol = ret.rolling(63, min_periods=63).std() * np.sqrt(252)
        med = vol.shift(1).rolling(756, min_periods=126).median()
        flag = (vol > 1.25 * med).to_numpy()
        ok = med.notna().to_numpy()
        turb = np.zeros(len(g), dtype=bool)
        onset = np.zeros(len(g), dtype=bool)
        i = 0
        while i < len(g):
            if flag[i] and ok[i]:
                j = i
                while j < len(g) and flag[j]:
                    j += 1
                if j - i >= 21:
                    turb[i:j] = True
                    onset[i] = True
                i = j
            else:
                i += 1
        g["vol63"], g["vmed"] = vol, med
        g["turb"] = np.where(ok, np.where(turb, "turbulent", "calm"), None)
        g["onset"] = onset
        out.append(g[["inst", "date", "vol63", "vmed", "turb", "onset"]])
    R = pd.concat(out, ignore_index=True)
    return R


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
    return FB.per_inst(X, f)


def fb_forecast(X, nm, lag=1, hl=None, tag="x"):
    """sigma^2 x exp(b . past misses), b pooled OLS refit each January on earlier years.  lag = sessions of delay on the
    misses (1 = yesterday's miss, as in stage 2; 2 = the +1 lag check).  hl = None: features yesterday/5-day/22-day mean
    (stage 2); hl = h: one EWMA of past misses with half-life h (plateau sweep)."""
    def feats(g):
        e = g[f"e_{nm}"].shift(lag)
        if hl is None:
            return pd.DataFrame({"l1": e, "l5": e.rolling(5, min_periods=3).mean(), "l22": e.rolling(22, min_periods=10).mean()}, index=g.index)
        return pd.DataFrame({"ew": e.ewm(halflife=hl, min_periods=5).mean()}, index=g.index)
    F = FB.per_inst(X, feats)
    adj = pd.Series(np.nan, index=X.index)
    for y in sorted(X.year.unique()):
        ok = (X.year < y) & F.notna().all(1) & X[f"e_{nm}"].notna()
        if ok.sum() < 1000:
            continue
        A = np.column_stack([np.ones(ok.sum()), F[ok].to_numpy()])
        b = np.linalg.lstsq(A, X.loc[ok, f"e_{nm}"].to_numpy(), rcond=None)[0]
        te = (X.year == y) & F.notna().all(1)
        adj[te] = F[te].to_numpy() @ b[1:]
    sig = X.pit_sig_used if nm == "p" else X.c_sig
    raw = sig ** 2 * np.exp(adj)
    mp = 120 if nm == "p" else 40
    T = pd.DataFrame({"inst": X.inst, "rv5": X.rv5, "raw": raw})
    return FB.per_inst(T, lambda g: (g.rv5 / g.raw).shift(1).expanding(mp).mean() * g.raw)


def m1_hours(insts):
    """Hourly 5-minute RV (mid close, London hours 0..21) and the median spread 07-16 London, per instrument and London date."""
    path = OUT / "m1_hours.parquet"
    if path.exists():
        return pd.read_parquet(path)
    rows = []
    for inst in insts:
        f = BA / f"{BA_KEY.get(inst, inst.lower())}_m1.parquet"
        df = pd.read_parquet(f, columns=["time", "close", "bid_c", "ask_c"],
                             filters=[("time", ">=", pd.Timestamp("2016-10-22")), ("time", "<", pd.Timestamp("2022-12-31"))])
        lt = pd.DatetimeIndex(df.time).tz_localize("UTC").tz_convert("Europe/London").tz_localize(None)
        d = pd.DataFrame({"date": lt.strftime("%Y-%m-%d"), "hour": lt.hour, "b5": lt.floor("5min"), "close": df.close.to_numpy(),
                          "spr": ((df.ask_c - df.bid_c) / df.close * 100).to_numpy()})
        del df, lt
        d = d[(d.hour < 22) & (d.date >= START) & (d.date <= END)]
        c5 = d.groupby("b5").agg(close=("close", "last"), date=("date", "first"), hour=("hour", "first"))
        c5["r"] = np.log(c5.close).groupby(c5.date).diff()
        rv = (c5.r ** 2 * 1e4).groupby([c5.date, c5.hour]).sum().unstack("hour").reindex(columns=range(22)).fillna(0.0)   # %^2
        rv.columns = [f"rv_{h}" for h in range(22)]
        sp = d[(d.hour >= 7) & (d.hour < 16)].groupby("date").spr.median().rename("spread")
        o = rv.join(sp, how="left").reset_index().rename(columns={"index": "date"})
        o.insert(0, "inst", inst)
        rows.append(o)
        del d, c5
        log("m1", inst, len(o))
    H = pd.concat(rows, ignore_index=True)
    H.to_parquet(path, index=False)
    return H


# ── statistics helpers ──────────────────────────────────────────────────────────────────────────────────────────────
def slope(D, y, x, bs, demean=True):
    """Pooled within-instrument OLS slope of y on x, ratio-of-sums bootstrap over dates."""
    D = D.dropna(subset=[y, x])
    if len(D) < 50:
        return [None, None, None], np.array([np.nan])
    a, b = D[x], D[y]
    if demean:
        a = a - a.groupby(D.inst).transform("mean")
        b = b - b.groupby(D.inst).transform("mean")
    return bs.ratio(D.date, (a * b).to_numpy(), D.date, (a * a).to_numpy())


def qratio(D, num, den, bs):
    D = D.dropna(subset=[num, den, "rv5"])
    return bs.ratio(D.date, FB.qlike(D.rv5, D[num]).to_numpy(), D.date, FB.qlike(D.rv5, D[den]).to_numpy()), len(D)


def splits(X):
    """Every conditioning split used across the sweep: (dimension, label, mask, uses regime-length block)."""
    S = [("all", "All", pd.Series(True, index=X.index), False)]
    S += [("regime", "calm", X.turb == "calm", True), ("regime", "turbulent", X.turb == "turbulent", True)]
    S += [("tercile", f"σ {t}", X.regime == t, False) for t in ("quiet", "normal", "busy")]
    S += [("class", CLS[k], X.klass == k, False) for k in CLS]
    return S


# ── main ────────────────────────────────────────────────────────────────────────────────────────────────────────────
def main():
    OUT.mkdir(parents=True, exist_ok=True)
    X = FB.errors(FB.load())
    assert X.date.min() >= START and X.date.max() <= END, "window breach"
    R = regimes()
    X = X.merge(R, on=["inst", "date"], how="left")
    X = har(X)
    log("rows", len(X), "insts", X.inst.nunique())
    N, charts = {}, []
    insts = sorted(X.inst.unique())

    # regime episodes: spells and clusters of onsets across instruments
    sp = X[X.onset].sort_values("date")
    lens = []
    for inst, g in X.groupby("inst"):
        t = (g.turb == "turbulent").to_numpy().astype(int)
        run = 0
        for v in t:
            if v:
                run += 1
            elif run:
                lens.append(run); run = 0
        if run:
            lens.append(run)
    block = int(np.median(lens)) if lens else 40
    clusters, cid, start = [], -1, None
    for d in sp.date:
        if start is None or (pd.Timestamp(d) - pd.Timestamp(start)).days > 60:
            cid += 1; start = d
        clusters.append(cid)
    sp = sp.assign(cluster=clusters)
    N["episodes"] = {"instrument_spells": int(len(lens)), "median_spell_sessions": block, "onsets_in_window": int(len(sp)),
                     "distinct_episodes": int(sp.cluster.nunique()),
                     "episode_starts": sp.groupby("cluster").date.min().tolist(), "turbulent_share": r(float((X.turb == "turbulent").mean()), 3)}
    log("episodes", N["episodes"])

    bs = LR.Boot(X.date)                 # block 20
    bsL = BootL(X.date, block)           # regime-length block
    log("boots ready, regime block", block)

    def B_(isreg):
        return bsL if isreg else bs

    Xc = X[X.date >= CHOSEN_FROM]
    SPL = splits(X)

    # ── 1. miss persistence (slope of today's miss on yesterday's, within instrument) ───────────────────────────────
    for nm in ("p", "c", "har"):
        X[f"e1_{nm}"] = X.groupby("inst")[f"e_{nm}"].shift(1)
    pers = {}
    for nm, lab, D0 in (("p", "plain σ 2017-22", X[X.date >= "2017-01-01"]), ("c", "chosen σ 2020-08..22", X[X.date >= CHOSEN_FROM]), ("har", "log-HAR 2018-22", X[X.date >= "2018-01-01"])):
        for dim, lb, m, isreg in SPL:
            st, reps = slope(D0[m.loc[D0.index]], f"e_{nm}", f"e1_{nm}", B_(isreg))
            if st[0] is not None:
                pers[(lab, lb)] = cell("persistence", f"{lab} | {lb}", st, reps, 0.0)
        for inst in insts:
            st, reps = slope(D0[D0.inst == inst], f"e_{nm}", f"e1_{nm}", bs) if nm != "har" else ([None], None)
            if st[0] is not None:
                pers[(lab, inst)] = cell("persistence inst", f"{lab} | {inst}", st, reps, 0.0)
        yrs = YEARS if nm == "p" else (["2020", "2021", "2022"] if nm == "c" else YEARS[1:])
        for y in yrs:
            st, reps = slope(D0[D0.year == y], f"e_{nm}", f"e1_{nm}", bs)
            if st[0] is not None:
                pers[(lab, y)] = cell("persistence year", f"{lab} | {y}", st, reps, 0.0)
    # horizon: slope on the miss k sessions back
    hz = {}
    for nm, lab, D0 in (("p", "plain", X[X.date >= "2017-01-01"]), ("c", "chosen", X[X.date >= CHOSEN_FROM]), ("har", "log-HAR", X[X.date >= "2018-01-01"])):
        for k in (1, 2, 5, 10):
            D = D0.assign(ek=D0.groupby("inst")[f"e_{nm}"].shift(k))
            st, reps = slope(D, f"e_{nm}", "ek", bs)
            hz[(lab, k)] = cell("persistence horizon", f"{lab} | lag {k}", st, reps, 0.0)
    N["persistence"] = {f"{a} | {b}": v for (a, b), v in pers.items()}
    N["persistence_horizon"] = {f"{a} | lag {k}": v for (a, k), v in hz.items()}
    log("persistence done")

    rows = []
    for lb in ["All", "calm", "turbulent", "σ quiet", "σ normal", "σ busy", *CLS.values(), *insts]:
        a, b = pers.get(("plain σ 2017-22", lb)), pers.get(("chosen σ 2020-08..22", lb))
        if a and b and a[0] is not None and b[0] is not None:
            rows.append({"label": lb, "values": [a[0], b[0]]})
    pa, pc, ph = pers[("plain σ 2017-22", "All")], pers[("chosen σ 2020-08..22", "All")], pers[("log-HAR 2018-22", "All")]
    pt, pcl = pers[("plain σ 2017-22", "turbulent")], pers[("plain σ 2017-22", "calm")]
    charts.append({"type": "groups", "title": "Does yesterday's miss carry into today? Persistence slope by regime, class and instrument", "names": ["plain σ 2017-22", "chosen σ 2020-08..22"],
                   "unit": "slope of today's RV miss on yesterday's", "rows": rows,
                   "note": f"Miss = log(5-minute RV ÷ calibrated σ²). Benchmark 0 = a forecast whose misses are independent (shuffled misses give ±0.02). All instruments: plain {pa[0]} [{pa[1]}, {pa[2]}], "
                           f"chosen {pc[0]} [{pc[1]}, {pc[2]}], log-HAR {ph[0]} [{ph[1]}, {ph[2]}]. Plain in calm {pcl[0]} [{pcl[1]}, {pcl[2]}] vs turbulent {pt[0]} [{pt[1]}, {pt[2]}] "
                           f"(regime ranges use blocks of {block} sessions, the median spell). Look for rows where chosen drops toward 0: the chosen σ's own feedback term works there."})

    # ── 2. coverage of the p75 lines (OH and OL pooled) ─────────────────────────────────────────────────────────────
    CVs = []
    for side in ("oh", "ol"):
        CVs.append(pd.DataFrame({"inst": X.inst, "date": X.date, "year": X.year, "klass": X.klass, "turb": X.turb, "regime": X.regime,
                                 "plain": (X[f"r_{side}"] > X[f"pit_{side}_p75"]).astype(float),
                                 "chosen": np.where(X[f"c_{side}_p75"].notna(), (X[f"r_{side}"] > X[f"c_{side}_p75"]).astype(float), np.nan),
                                 "eprev": X.e1_p}, index=X.index))
    CV = pd.concat(CVs)
    CVc = CV[CV.chosen.notna()]
    CVp = CV[CV.date >= CHOSEN_FROM]
    cov = {}
    def covcell(D, col, lab, m, isreg):
        g = D[m]
        if len(g) < 100:
            return None
        st, reps = B_(isreg).mean(g.date, g[col].to_numpy() * 100)
        return cell("coverage p75", lab, st, reps, 25.0, int(len(g)))
    for dim, lb, _m, isreg in SPL:
        for col, D, nm in (("chosen", CVc, "chosen"), ("plain", CVp, "plain 2020-08..22")):
            if dim == "all":
                m = pd.Series(True, index=range(len(D)))
                m = np.ones(len(D), bool)
            elif dim == "regime":
                m = (D.turb == lb).to_numpy()
            elif dim == "tercile":
                m = (D.regime.astype(str) == lb.split(" ")[1]).to_numpy()
            else:
                m = (D.klass.map(CLS) == lb).to_numpy()
            cov[(nm, lb)] = covcell(D, col, f"{nm} | {lb}", m, isreg)
    for inst in insts:
        cov[("chosen", inst)] = covcell(CVc, "chosen", f"chosen | {inst}", (CVc.inst == inst).to_numpy(), False)
        cov[("plain 2020-08..22", inst)] = covcell(CVp, "plain", f"plain 2020-08..22 | {inst}", (CVp.inst == inst).to_numpy(), False)
    for y in ("2020", "2021", "2022"):
        cov[("chosen", y)] = covcell(CVc, "chosen", f"chosen | {y}", (CVc.year == y).to_numpy(), False)
    N["coverage_p75"] = {f"{a} | {b}": v for (a, b), v in cov.items() if v}
    rows = []
    for lb in ["All", "calm", "turbulent", "σ quiet", "σ normal", "σ busy", *CLS.values(), "2020", "2021", "2022", *insts]:
        a, b = cov.get(("chosen", lb)), cov.get(("plain 2020-08..22", lb))
        if a:
            rows.append({"label": lb, "values": [a[0], b[0] if b else a[0]]})
    ct, cc = cov[("chosen", "turbulent")], cov[("chosen", "calm")]
    charts.append({"type": "groups", "title": "How often the day goes past the p75 line, by regime, tercile, class, year and instrument (2020-08 to 2022)", "names": ["chosen lines", "plain lines (same days)"],
                   "unit": "% of sides beyond p75", "rows": rows,
                   "note": f"Benchmark 25% on every row (the line's own promise). Chosen in calm {cc[0]}% [{cc[1]}, {cc[2]}] vs turbulent {ct[0]}% [{ct[1]}, {ct[2]}] "
                           f"(regime ranges in blocks of {block} sessions; turbulent days in this window come from few episodes). Single instruments are about ±3.5 points of noise. "
                           "Year rows show only the chosen value twice (no plain split). Above 25 = the line is too tight there, so a stop at it is hit more than planned."})
    log("coverage done")

    # ── 3. time of day: hourly RV from M1 ───────────────────────────────────────────────────────────────────────────
    H = m1_hours(insts)
    assert H.date.max() <= END
    X = X.merge(H, on=["inst", "date"], how="left")
    N["rv_check_corr"] = r(float(np.corrcoef(np.log(X.rv5[X.rv_0.notna()]), np.log(X.loc[X.rv_0.notna(), [f"rv_{h}" for h in range(22)]].sum(1).clip(lower=1e-9)))[0, 1]), 3)
    for bl, a, b in BUCKETS:
        X[f"RV_{a}"] = X[[f"rv_{h}" for h in range(a, b)]].sum(1, min_count=1)
    X["RV_am"] = X[[f"rv_{h}" for h in range(0, 13)]].sum(1, min_count=1)
    X["RV_pm"] = X[[f"rv_{h}" for h in range(13, 22)]].sum(1, min_count=1)
    X["RV_1314"] = X["rv_13"]

    def bucket_miss(col, sig, mp=120):
        def f(g):
            ratio = (g[col] / g[sig] ** 2).where(g[col] > 0)
            cal = ratio.shift(1).expanding(mp).mean()
            return np.log(g[col].where(g[col] > 0) / (cal * g[sig] ** 2))
        return FB.per_inst(X, f)
    tod = {}
    for bl, a, b in BUCKETS:
        X[f"eb_{a}"] = bucket_miss(f"RV_{a}", "pit_sig_used")
        X[f"ebc_{a}"] = bucket_miss(f"RV_{a}", "c_sig", 40)
        X[f"eb1_{a}"] = X.groupby("inst")[f"eb_{a}"].shift(1)
        X[f"ebc1_{a}"] = X.groupby("inst")[f"ebc_{a}"].shift(1)
        st, reps = slope(X[X.date >= "2017-01-01"], f"eb_{a}", f"eb1_{a}", bs)
        tod[("plain", bl)] = cell("persistence by time of day", f"plain | {bl}", st, reps, 0.0)
        st, reps = slope(X[X.date >= CHOSEN_FROM], f"ebc_{a}", f"ebc1_{a}", bs)
        tod[("chosen", bl)] = cell("persistence by time of day", f"chosen | {bl}", st, reps, 0.0)
    N["persistence_tod"] = {f"{a} | {b}": v for (a, b), v in tod.items()}
    rows = []
    for nm in ("plain", "chosen"):
        for bl, a, b in BUCKETS:
            v = tod[(nm, bl)]
            rows.append({"label": f"{nm}: {bl}", "value": v[0], "lo": v[1], "hi": v[2]})
    charts.append({"type": "bars", "title": "Persistence of the miss within each London time-of-day bucket (yesterday's same hours → today's)", "unit": "slope", "ref": 0, "rows": rows,
                   "note": "Each bucket's own 5-minute RV against σ² × its past-only share of the day. Benchmark 0 = independent misses. Plain σ 2017-22, chosen σ 2020-08..22, date-block 95% ranges. "
                           "A bucket that sits well above the others is where yesterday's error is most worth feeding back."})

    # first crossing of the chosen p75 by bucket vs a random walk on the data's own clock
    hrs = np.array([X[f"rv_{h}"].mean() for h in range(22)])
    first = []
    for side in ("oh", "ol"):
        M = X[[f"{side}_h{h}" for h in range(1, 23)]].to_numpy()
        for nm, line in (("chosen", X[f"c_{side}_p75"].to_numpy()), ("plain", X[f"pit_{side}_p75"].to_numpy())):
            crossed = M >= line[:, None]
            any_ = crossed.any(1) & np.isfinite(line)
            h = np.where(any_, crossed.argmax(1), -1)            # index 0 = hour 00-01
            first.append(pd.DataFrame({"inst": X.inst, "date": X.date, "klass": X.klass, "nm": nm, "h": h})[any_])
    FC = pd.concat(first)
    FC = FC[(FC.nm == "plain") & (FC.date >= "2017-01-01") | (FC.nm == "chosen")]
    FC["bucket"] = pd.cut(FC.h, [-1, 6, 9, 12, 15, 21], labels=[b[0] for b in BUCKETS])

    def sim_first(prof, n=8000, vov=0.233):
        sh = prof / prof.sum()
        z = RNG.standard_normal((n, 22 * 60)) * np.sqrt(np.repeat(sh, 60) / 60)
        z *= np.exp(vov * RNG.standard_normal(n) - vov ** 2)[:, None]
        p = np.cumsum(z, axis=1)
        hi = np.maximum.accumulate(np.maximum(p, 0), axis=1)
        line = np.quantile(hi[:, -1], 0.75)
        cr = hi >= line
        mins = cr.argmax(1)[cr.any(1)]
        hh = mins // 60
        return np.array([((hh >= a) & (hh < b)).mean() * 100 for _, a, b in BUCKETS])
    simsh = {}
    for k in CLS:
        prof = np.array([X.loc[X.klass == k, f"rv_{h}"].mean() for h in range(22)])
        simsh[k] = sim_first(prof)
    simsh["all"] = sim_first(hrs)
    fc = {}
    rows = []
    for nm in ("chosen",):
        D = FC[FC.nm == nm]
        for bi, (bl, a, b) in enumerate(BUCKETS):
            x = (D.bucket == bl).to_numpy() * 100.0
            # benchmark: class-weighted random-walk share
            w = D.klass.value_counts(normalize=True)
            bench = float(sum(w.get(k, 0) * simsh[k][bi] for k in CLS))
            st, reps = bs.mean(D.date, x)
            fc[(nm, bl)] = cell("first crossing by time of day", f"{nm} | {bl}", st, reps, bench, int(len(D)))
            rows.append({"label": bl, "values": [st[0], r(bench, 2)]})
            for k in CLS:
                Dk = D[D.klass == k]
                stk, repk = bs.mean(Dk.date, (Dk.bucket == bl).to_numpy() * 100.0)
                fc[(k, bl)] = cell("first crossing by time of day", f"{nm} {CLS[k]} | {bl}", stk, repk, float(simsh[k][bi]), int(len(Dk)))
    N["first_crossing"] = {f"{a} | {b}": v for (a, b), v in fc.items()}
    N["first_crossing_sim"] = {k: [r(v, 2) for v in s] for k, s in simsh.items()}
    charts.append({"type": "groups", "title": "When the chosen p75 line is first crossed: share of crossings in each London time bucket", "names": ["real crossings", "random walk on the data's own clock"],
                   "unit": "% of crossings", "rows": rows,
                   "note": "Chosen lines, OH and OL pooled, 2020-08..22. Benchmark: a random walk whose hourly variance follows each class's average hourly RV, with the day's vol off by sd 0.23 (stage 2), "
                           "line set at its own p75; weighted by class. Real above benchmark = misses arrive in that bucket more than the clock alone says (scheduled releases, opens)."})
    log("time of day done")

    # ── 4. big morning → big afternoon (and later horizons) ────────────────────────────────────────────────────────
    X["S_am"] = bucket_miss("RV_am", "pit_sig_used")
    X["S_amc"] = bucket_miss("RV_am", "c_sig", 40)
    for col in ("RV_pm", "RV_1314", "RV_13", "RV_16"):
        X[f"A_{col}"] = bucket_miss(col, "pit_sig_used")
    X["A_pmc"] = bucket_miss("RV_pm", "c_sig", 40)
    X["A_next"] = X.groupby("inst").e_p.shift(-1)          # next session's whole-day miss (outcome, inside the window)
    X.loc[X.date == X.groupby("inst").date.transform("max"), "A_next"] = np.nan
    mo = {}
    D0 = X[X.date >= "2017-01-01"]
    HZ = [("13-14", "A_RV_1314"), ("13-16", "A_RV_13"), ("16-22", "A_RV_16"), ("13-22", "A_RV_pm"), ("next session", "A_next")]
    for hl_, col in HZ:
        for dim, lb, m, isreg in SPL:
            st, reps = slope(D0[m.loc[D0.index]], col, "S_am", B_(isreg))
            mo[(hl_, lb)] = cell("morning→later", f"{hl_} | {lb}", st, reps, 0.0)
    for inst in insts:
        st, reps = slope(D0[D0.inst == inst], "A_RV_pm", "S_am", bs)
        mo[("13-22", inst)] = cell("morning→afternoon inst", f"13-22 | {inst}", st, reps, 0.0)
    for y in YEARS:
        st, reps = slope(D0[D0.year == y], "A_RV_pm", "S_am", bs)
        mo[("13-22", y)] = cell("morning→afternoon year", f"13-22 | {y}", st, reps, 0.0)
    st, reps = slope(X[X.date >= CHOSEN_FROM], "A_pmc", "S_amc", bs)
    mo[("13-22 chosen σ", "All")] = cell("morning→later", "13-22 chosen σ 2020-08..22 | All", st, reps, 0.0)
    # partial slope: morning surprise beyond yesterday's whole-day miss (Frisch-Waugh, within instrument)
    g = D0.dropna(subset=["S_am", "A_RV_pm", "e1_p"]).copy()
    for c_ in ("S_am", "A_RV_pm", "e1_p"):
        g[c_] = g[c_] - g.groupby("inst")[c_].transform("mean")
    bS = np.polyfit(g.e1_p, g.S_am, 1)[0]
    g["S_res"] = g.S_am - bS * g.e1_p
    st, reps = slope(g, "A_RV_pm", "S_res", bs, demean=False)
    mo[("13-22 beyond yesterday", "All")] = cell("morning→later", "13-22 | morning surprise beyond yesterday's miss", st, reps, 0.0)
    N["morning"] = {f"{a} | {b}": v for (a, b), v in mo.items()}
    rows = []
    for k in CLS.values():
        v = mo[("13-22", k)]
        rows.append({"label": k, "value": v[0], "lo": v[1], "hi": v[2]})
    for inst in sorted(insts, key=lambda i: mo[("13-22", i)][0]):
        v = mo[("13-22", inst)]
        rows.append({"label": inst, "value": v[0], "lo": v[1], "hi": v[2]})
    ma, mb = mo[("13-22", "All")], mo[("13-22 beyond yesterday", "All")]
    mcs = mo[("13-22 chosen σ", "All")]
    charts.append({"type": "bars", "title": "Big morning → big afternoon: slope of the 13:00-22:00 RV miss on the 00:00-13:00 miss, by class and instrument", "unit": "slope", "ref": 0, "rows": rows,
                   "note": f"Both misses against the plain σ² × each window's past-only share, 2017-22. Benchmark 0: if σ were right, a random walk's morning and afternoon variance are independent. "
                           f"All instruments {ma[0]} [{ma[1]}, {ma[2]}]; the part of the morning not already in yesterday's miss still gives {mb[0]} [{mb[1]}, {mb[2]}]; against the chosen σ (2020-08..22) {mcs[0]} [{mcs[1]}, {mcs[2]}]. "
                           "Classes and instruments with 95% date-block ranges."})
    rows = []
    for hl_, col in HZ:
        rows.append({"label": hl_, "values": [mo[(hl_, "calm")][0], mo[(hl_, "turbulent")][0]]})
    charts.append({"type": "groups", "title": "Morning surprise against what comes next, by horizon and C.OG regime", "names": ["calm", "turbulent"], "unit": "slope on the 00-13 miss",
                   "rows": rows,
                   "note": "Outcome = the RV miss over 13-14, 13-16, 16-22, 13-22 London, or the whole next session. Benchmark 0 (random walk with σ right). "
                           f"Turbulent rows rest on {N['episodes']['distinct_episodes']} distinct episodes; ranges (numbers.json) use blocks of {block} sessions. "
                           "Look at whether the slope fades with horizon and whether turbulence steepens it."})
    log("morning done")

    # ── 5. error-feedback gain (QLIKE) by regime / class / year, +1 lag, plateau ─────────────────────────────────────
    X["h_fbp"] = fb_forecast(X, "p", 1)
    X["h_fbp2"] = fb_forecast(X, "p", 2)
    X["h_fbc"] = fb_forecast(X, "c", 1)
    X["h_fbc2"] = fb_forecast(X, "c", 2)
    log("fb forecasts done")
    RP = X[(X.date >= "2019-01-01")].dropna(subset=["h_p", "h_fbp", "h_fbp2", "h_har"])
    RC = X[(X.date >= "2021-01-04")].dropna(subset=["h_c", "h_fbc", "h_fbc2", "h_p"])
    SPLp, SPLc = splits(RP), splits(RC)
    gain = {}
    for tag, D, S_, num, den in (("plain+fb ÷ plain", RP, SPLp, "h_fbp", "h_p"), ("plain+fb (+1 lag) ÷ plain", RP, SPLp, "h_fbp2", "h_p"),
                                 ("log-HAR ÷ plain", RP, SPLp, "h_har", "h_p"),
                                 ("chosen+fb ÷ chosen", RC, SPLc, "h_fbc", "h_c"), ("chosen+fb (+1 lag) ÷ chosen", RC, SPLc, "h_fbc2", "h_c"),
                                 ("chosen ÷ plain", RC, SPLc, "h_c", "h_p")):
        for dim, lb, m, isreg in S_:
            (st, reps), n = qratio(D[m], num, den, B_(isreg))
            gain[(tag, lb)] = cell("QLIKE ratio", f"{tag} | {lb}", st, reps, 1.0, n)
        yrs = ["2019", "2020", "2021", "2022"] if D is RP else ["2021", "2022"]
        for y in yrs:
            (st, reps), n = qratio(D[D.year == y], num, den, bs)
            gain[(tag, y)] = cell("QLIKE ratio year", f"{tag} | {y}", st, reps, 1.0, n)
    N["qlike"] = {f"{a} | {b}": v for (a, b), v in gain.items()}
    N["race_rows"] = {"plain": [int(len(RP)), int(RP.date.nunique()), RP.date.min(), RP.date.max()], "chosen": [int(len(RC)), int(RC.date.nunique()), RC.date.min(), RC.date.max()]}
    rows = []
    for tag in ("plain+fb ÷ plain", "chosen+fb ÷ chosen"):
        for lb in ["All", "calm", "turbulent", "σ quiet", "σ normal", "σ busy", *CLS.values()]:
            v = gain[(tag, lb)]
            rows.append({"label": f"{tag.split(' ÷')[0]}: {lb}", "value": v[0], "lo": v[1], "hi": v[2]})
    charts.append({"type": "bars", "title": "Where error feedback pays: QLIKE loss of σ + feedback ÷ the same σ without it", "unit": "loss ratio", "ref": 1, "rows": rows,
                   "note": f"Benchmark 1.0 = the forecast without the feedback term (below 1 = feedback helps). Plain: {RP.date.min()} to 2022 ({len(RP):,} instrument-days). Chosen: 2021-01-04 to 2022 ({len(RC):,}). "
                           f"Feedback = σ² × exp(b × yesterday's, 5-day and 22-day misses), b refit each January on earlier years; same past-only scale for both. Regime rows use blocks of {block} sessions. "
                           f"log-HAR ÷ plain overall: {gain[('log-HAR ÷ plain', 'All')][0]}."})
    rows = []
    for base_, lag2 in (("plain+fb ÷ plain", "plain+fb (+1 lag) ÷ plain"), ("chosen+fb ÷ chosen", "chosen+fb (+1 lag) ÷ chosen")):
        for lb in ["All", "calm", "turbulent", *CLS.values()]:
            rows.append({"label": f"{base_.split('+')[0]}: {lb}", "values": [gain[(base_, lb)][0], gain[(lag2, lb)][0]]})
    lp, lp2 = gain[("plain+fb ÷ plain", "All")], gain[("plain+fb (+1 lag) ÷ plain", "All")]
    lc, lc2 = gain[("chosen+fb ÷ chosen", "All")], gain[("chosen+fb (+1 lag) ÷ chosen", "All")]
    charts.append({"type": "groups", "title": "+1 lag check: the feedback gain with every miss delayed one more session", "names": ["yesterday's miss (as built)", "miss from 2 sessions ago"],
                   "unit": "QLIKE ratio vs no feedback", "rows": rows,
                   "note": f"Benchmark 1.0 = no feedback. Plain: {lp[0]} [{lp[1]}, {lp[2]}] → {lp2[0]} [{lp2[1]}, {lp2[2]}]. Chosen: {lc[0]} [{lc[1]}, {lc[2]}] → {lc2[0]} [{lc2[1]}, {lc2[2]}]. "
                           "An alignment artefact would vanish with the extra delay; real persistence shrinks but stays below 1 because misses decay slowly (lag-2 autocorrelation 0.37 for plain)."})
    # plateau: one EWMA feature, half-life sweep
    plat = {"plain": [], "chosen": []}
    for hl_ in (1, 2, 3, 5, 8, 13, 21, 34, 55):
        hp = fb_forecast(X, "p", 1, hl=hl_)
        hc = fb_forecast(X, "c", 1, hl=hl_)
        D = RP.assign(hx=hp.loc[RP.index])
        (st, reps), _ = qratio(D, "hx", "h_p", bs)
        plat["plain"].append([hl_, st[0]]); cell("plateau", f"plain EWMA hl {hl_}", st, reps, 1.0)
        D = RC.assign(hx=hc.loc[RC.index])
        (st, reps), _ = qratio(D, "hx", "h_c", bs)
        plat["chosen"].append([hl_, st[0]]); cell("plateau", f"chosen EWMA hl {hl_}", st, reps, 1.0)
    N["plateau"] = plat
    charts.append({"type": "lines", "title": "Plateau check: feedback gain against the half-life of the error memory", "unit": "QLIKE ratio vs no feedback", "xlabel": "EWMA half-life of past misses (sessions)",
                   "series": [{"name": "plain σ + EWMA feedback (2019-22)", "points": plat["plain"]}, {"name": "chosen σ + EWMA feedback (2021-22)", "points": plat["chosen"]},
                              {"name": "no feedback (benchmark)", "points": [[1, 1.0], [55, 1.0]]}],
                   "note": "One feature (an EWMA of past misses), b refit each January. Benchmark 1.0. A broad flat bottom = a plateau (the half-life does not need tuning); one sharp dip = a peak (fragile). "
                           "Stage 2 used yesterday + 5-day + 22-day means, which spans roughly half-lives 1 to 15."})
    log("gain/plateau done")

    # ── 6. turning points: event study around turbulent onsets ──────────────────────────────────────────────────────
    ev = []
    for inst, g in X.groupby("inst"):
        g = g.reset_index(drop=True)
        for i in np.flatnonzero(g.onset.to_numpy()):
            if i < 40 or g.date.iat[i] < "2018-09-01":
                continue
            base = g.rv5.iloc[i - 40:i - 20].mean()
            for k in range(-20, 61):
                j = i + k
                if j >= len(g):
                    break
                ev.append({"inst": inst, "onset": g.date.iat[i], "k": k, "rv": np.log(g.rv5.iat[j] / base),
                           "p": np.log(g.h_p.iat[j] / base), "c": np.log(g.h_c.iat[j] / base) if np.isfinite(g.h_c.iat[j]) else np.nan,
                           "har": np.log(g.h_har.iat[j] / base), "fbp": np.log(g.h_fbp.iat[j] / base),
                           "e_p": g.e_p.iat[j], "e_c": g.e_c.iat[j], "e_har": g.e_har.iat[j], "e_fbp": np.log(g.rv5.iat[j] / g.h_fbp.iat[j])})
    E = pd.DataFrame(ev)
    cl = sp.set_index(["inst", "date"]).cluster
    E["cluster"] = [cl.get((a, b), -1) for a, b in zip(E.inst, E.onset)]
    E.to_parquet(OUT / "event_study.parquet", index=False)
    curve = E.groupby("k")[["rv", "p", "har", "fbp", "c"]].mean()
    to_sig = lambda s: [[int(k), round(float(np.exp(v / 2)), 3)] for k, v in s.items() if np.isfinite(v)]
    nE, nC = int(E.groupby(["inst", "onset"]).ngroups), int(E.cluster.nunique())
    Ec = E[E.onset >= "2020-10-01"]
    nEc, nCc = int(Ec.groupby(["inst", "onset"]).ngroups), int(Ec.cluster.nunique())
    charts.append({"type": "lines", "title": "Turning points: forecast σ against realised σ around the start of each turbulent episode", "unit": "σ ÷ the σ of days −40 to −21", "xlabel": "sessions from onset",
                   "series": [{"name": "realised (5-min RV)", "points": to_sig(curve.rv)}, {"name": "plain σ", "points": to_sig(curve.p)},
                              {"name": "log-HAR", "points": to_sig(curve.har)}, {"name": "plain σ + error feedback", "points": to_sig(curve.fbp)}],
                   "note": f"{nE} instrument onsets 2018-09..2022 in {nC} distinct episodes (onsets within 60 days across instruments = one episode). Onset = first day of a C.OG turbulent spell "
                           "(63-session vol > 1.25 × its past median for 21+ sessions). Benchmark: the realised line; the gap between a forecast and it is the lag. "
                           f"The chosen σ exists only from 2020-08: {nEc} of its onsets ({nCc} episodes) are in the bars chart and the worked example."})
    evc = {}
    rows = []
    cids = np.array(sorted(E.cluster.unique()))
    rng = np.random.default_rng(SEED)
    draws = rng.integers(len(cids), size=(B, len(cids)))
    # each forecast's own average miss on calm days (same years): the log of a mean-one ratio sits below 0, so lag = excess over this
    calm = X.turb == "calm"
    basev = {"e_p": float(X.loc[calm & (X.date >= "2018-09-01"), "e_p"].mean()), "e_har": float(X.loc[calm & (X.date >= "2018-09-01"), "e_har"].mean()),
             "e_fbp": float(np.log(X.rv5 / X.h_fbp)[calm & (X.date >= "2018-09-01")].mean()), "e_c": float(X.loc[calm & (X.date >= "2020-10-01"), "e_c"].mean())}
    N["event_calm_baseline"] = {k: r(v, 4) for k, v in basev.items()}
    for win, lo_, hi_ in (("rise: days −10 to +5", -10, 5), ("after: days +6 to +60", 6, 60), ("before: days −20 to −11", -20, -11)):
        for col, lab, D in (("e_p", "plain", E), ("e_har", "log-HAR", E), ("e_fbp", "plain+fb", E), ("e_c", "chosen (2020-10..22 onsets)", Ec)):
            W_ = D[(D.k >= lo_) & (D.k <= hi_)].dropna(subset=[col])
            per = W_.groupby("cluster")[col].agg(["sum", "count"]).reindex(cids).fillna(0)
            s, c = per["sum"].to_numpy() - basev[col] * per["count"].to_numpy(), per["count"].to_numpy()
            if c.sum() == 0:
                continue
            cnt = np.array([c[d].sum() for d in draws])
            reps = np.where(cnt > 0, np.array([s[d].sum() for d in draws]) / np.maximum(cnt, 1), np.nan)
            st = [r(s.sum() / c.sum()), r(np.nanpercentile(reps, 2.5)), r(np.nanpercentile(reps, 97.5))]
            evc[(win, lab)] = cell("event study miss", f"{lab} | {win}", st, reps, 0.0, int(c.sum()))
            rows.append({"label": f"{lab}: {win}", "value": st[0], "lo": st[1], "hi": st[2]})
    N["event_study"] = {f"{a} | {b}": v for (a, b), v in evc.items()}
    N["event_counts"] = {"onsets": nE, "episodes": nC, "chosen_onsets": nEc, "chosen_episodes": nCc}
    charts.append({"type": "bars", "title": "Lag and overshoot at turning points: each forecast's miss around a turbulent onset, beyond its usual calm-day miss", "unit": "excess mean log(RV ÷ forecast variance)", "ref": 0, "rows": rows,
                   "note": "Benchmark 0 = the forecast misses by no more than it does on an ordinary calm day (its own calm-day average is subtracted). Positive = forecast too low (lags the rise); "
                           "negative = forecast too high (overshoots after the spike). Windows: before (−20 to −11), rise (−10 to +5), after (+6 to +60). "
                           f"95% ranges resample whole episodes ({nC} plain-window episodes, {nCc} for chosen), because instruments in one episode move together."})
    log("event study done")

    # ── 7. Lesson 04 decay monitors ─────────────────────────────────────────────────────────────────────────────────
    X["half"] = X.year + np.where(X.date.str[5:7] <= "06", "H1", "H2")
    roll = {"plain+fb ÷ plain": [], "chosen ÷ plain": [], "chosen+fb ÷ chosen": [], "log-HAR ÷ plain": []}
    for hlab in sorted(X.half.unique()):
        D = X[X.half == hlab]
        for tag, num, den in (("plain+fb ÷ plain", "h_fbp", "h_p"), ("chosen ÷ plain", "h_c", "h_p"), ("chosen+fb ÷ chosen", "h_fbc", "h_c"), ("log-HAR ÷ plain", "h_har", "h_p")):
            Dd = D[D.date >= ("2019-01-01" if tag.startswith("plain") or tag.startswith("log") else ("2021-01-04" if "fb" in tag else CHOSEN_FROM))].dropna(subset=[num, den])
            if len(Dd) < 1000:
                continue
            (st, reps), n = qratio(Dd, num, den, bs)
            roll[tag].append([hlab, st[0]])
            cell("decay: rolling skill", f"{tag} | {hlab}", st, reps, 1.0, n)
    N["rolling_skill"] = roll
    charts.append({"type": "lines", "title": "Decay monitor 1: rolling skill by half-year (QLIKE ratio)", "unit": "loss ratio", "xlabel": "half-year",
                   "series": [{"name": k, "points": v} for k, v in roll.items() if v],
                   "note": "Benchmark 1.0 = no better than the denominator. C.OG's Lesson 04: an edge is a wasting asset, so watch whether the gain shrinks toward 1 over time. "
                           "A line drifting up toward 1 is decay; a line that stays put is a stable effect. Half-years with fewer than 1,000 rows are skipped."})
    # slope of response to the same conditioning variable, by year
    gap_y = {}
    P = CV.dropna(subset=["eprev"]).copy()
    P["q"] = P.groupby("inst").eprev.transform(lambda s: pd.qcut(s.rank(method="first"), 5, labels=False))
    for y in YEARS:
        for col, lab in (("plain", "plain lines"), ("chosen", "chosen lines")):
            g = P[(P.year == y) & P[col].notna()]
            if len(g) < 2000:
                continue
            top = np.where(g.q == 4, g[col] * 100, 0.0); bot = np.where(g.q == 0, g[col] * 100, 0.0)
            _, rt = bs.ratio(g.date, top, g.date, (g.q == 4).astype(float).to_numpy())
            _, rb = bs.ratio(g.date, bot, g.date, (g.q == 0).astype(float).to_numpy())
            v = g[g.q == 4][col].mean() * 100 - g[g.q == 0][col].mean() * 100
            reps = rt - rb
            st = [r(v, 2), r(np.nanpercentile(reps, 2.5), 2), r(np.nanpercentile(reps, 97.5), 2)]
            gap_y[(lab, y)] = cell("decay: after-miss hit gap", f"{lab} | {y}", st, reps, 0.0, int(len(g)))
    N["after_miss_gap_year"] = {f"{a} | {b}": v for (a, b), v in gap_y.items()}
    series = [{"name": "persistence, plain σ", "points": [[y, pers[("plain σ 2017-22", y)][0]] for y in YEARS if ("plain σ 2017-22", y) in pers]},
              {"name": "persistence, chosen σ", "points": [[y, pers[("chosen σ 2020-08..22", y)][0]] for y in ("2021", "2022") if ("chosen σ 2020-08..22", y) in pers]},
              {"name": "morning → afternoon, plain σ", "points": [[y, mo[("13-22", y)][0]] for y in YEARS]},
              {"name": "after-miss p75 hit gap ÷ 100, plain lines", "points": [[y, r(gap_y[("plain lines", y)][0] / 100, 4)] for y in YEARS if ("plain lines", y) in gap_y]}]
    charts.append({"type": "lines", "title": "Decay monitor 2: the response to the same conditioning variable, year by year", "unit": "slope (gap ÷ 100)", "xlabel": "year",
                   "series": series,
                   "note": "Benchmark 0 for every line. Persistence = slope of today's miss on yesterday's. Morning → afternoon = slope of the 13-22 miss on the 00-13 miss. "
                           "After-miss gap = p75 hit rate after the top fifth of yesterday's misses minus after the bottom fifth (plain lines in-sample before 2020-08). "
                           "Flat lines across years = a stable response; a falling line = the effect fading. 2020 for chosen is a part-year and is left out."})
    # cost drift: median spread 07-16 London ÷ daily σ
    X["cost"] = X.spread / X.pit_sig_used
    cd = {}
    series = []
    for k in CLS:
        pts = []
        for y in YEARS:
            g = X[(X.klass == k) & (X.year == y)].dropna(subset=["cost"])
            st, reps = bs.mean(g.date, g.cost.to_numpy() * 100)
            cd[(k, y)] = (st, reps)
            pts.append([y, st[0]])
        series.append({"name": CLS[k], "points": pts})
        d = cd[(k, "2022")][1] - cd[(k, "2017")][1]
        v = cd[(k, "2022")][0][0] - cd[(k, "2017")][0][0]
        cell("decay: cost drift", f"{CLS[k]} spread÷σ 2022 − 2017", [r(v), r(np.nanpercentile(d, 2.5)), r(np.nanpercentile(d, 97.5))], d, 0.0)
    N["cost_drift"] = {f"{CLS[k]} | {y}": v[0] for (k, y), v in cd.items()}
    charts.append({"type": "lines", "title": "Decay monitor 3: cost drift. Median bid/ask spread (07-16 London) as % of the day's σ", "unit": "% of σ", "xlabel": "year",
                   "series": series,
                   "note": "From the M1 bid/ask closes, one spread per day. Benchmark: the class's own 2017 level (and the repo's feasibility gate, spread ÷ ATR 0.15, which is roughly 25% of σ). "
                           "A rising line means a stop or target set in σ units costs more of its distance each year; falling = cheaper. σ = plain σ at the open."})
    log("decay done")

    # ── 8. worked example: the chosen-window onset with the biggest early miss ─────────────────────────────────────
    cand = Ec[(Ec.k >= 0) & (Ec.k <= 20)].groupby(["inst", "onset"]).e_c.mean().dropna().sort_values()
    inst_x, on_x = cand.index[-1]
    g = X[X.inst == inst_x].reset_index(drop=True)
    i0 = int(np.flatnonzero(g.date.to_numpy() == on_x)[0])
    w = g.iloc[max(0, i0 - 30):i0 + 45]
    sq = lambda s: [[d, round(float(np.sqrt(v)), 4)] for d, v in zip(w.date, s) if np.isfinite(v)]
    charts.append({"type": "lines", "title": f"Worked example: {inst_x} around the turbulent onset of {on_x}", "unit": "daily σ, % (√ variance)", "xlabel": "date",
                   "series": [{"name": "realised (√ 5-min RV)", "points": sq(w.rv5)}, {"name": "chosen σ (calibrated)", "points": sq(w.h_c)},
                              {"name": "plain σ (calibrated)", "points": sq(w.h_p)}, {"name": "log-HAR", "points": sq(w.h_har)}],
                   "note": f"Picked by rule: the chosen-window onset whose chosen σ ran furthest below realised over its first 20 sessions (mean miss {r(float(cand.iloc[-1]), 3)}). "
                           "Benchmark: the realised line. All forecasts on the same past-only scale. Watch how many sessions each forecast takes to catch the rise, and whether it then overshoots the fall."})
    N["example"] = {"inst": inst_x, "onset": on_x}

    # ── multiple testing ───────────────────────────────────────────────────────────────────────────────────────────
    C = pd.DataFrame(CELLS)
    ps = C.p.to_numpy()
    m = len(ps)
    order = np.argsort(ps)
    thr = 0.10 * np.arange(1, m + 1) / m
    passed = np.zeros(m, bool)
    ok = ps[order] <= thr
    if ok.any():
        kmax = np.max(np.flatnonzero(ok))
        passed[order[:kmax + 1]] = True
    C["bh"] = passed
    C.to_csv(OUT / "cells.csv", index=False)
    N["bh"] = {"cells": m, "pass": int(passed.sum()), "raw_p05": int((ps < 0.05).sum()), "expected_by_chance_p05": r(0.05 * m, 1),
               "by_group": C.groupby("group").agg(n=("p", "size"), bh=("bh", "sum")).astype(int).to_dict("index")}
    log("BH", N["bh"]["cells"], N["bh"]["pass"])

    intro = json.loads((OUT / "intro.json").read_text(encoding="utf-8")) if (OUT / "intro.json").exists() else ["(intro written after reading the numbers)"]
    holds = json.loads((OUT / "holds.json").read_text(encoding="utf-8")) if (OUT / "holds.json").exists() else []
    res = {"id": "feedback-wide", "window": [START, END], "cells_tested": m, "cells_pass_bh": int(passed.sum()),
           "cells_expected_by_chance": r(0.05 * m, 1), "intro": intro, "holds": holds, "charts": charts}
    WEB.write_text(json.dumps(res, ensure_ascii=False, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    (OUT / "numbers.json").write_text(json.dumps(N, indent=1, ensure_ascii=False, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    log("written", WEB, f"{WEB.stat().st_size / 1e3:.0f} kB")


if __name__ == "__main__":
    main()
