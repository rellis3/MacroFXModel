"""Vol-Layer layer 8 (feedback), stage 2: build and look. Nothing is scored as a trade; no verdict words.

C.OG: "you can also use its errors as a feedback loop."  The forecast's daily error is
    e_rv = log(RV5 / (c * sigma^2))      RV5 = 5-minute realised variance of the London day (00:00-22:00)
    e_hl = log(HL / sigma) - its own past median          HL = the day's high-low, % of the open
where sigma is the daily forecast known at the open and c is a past-only calibration (expanding mean of RV5/sigma^2).

Two forecasts:
  plain  = pit_sig_used and pit_* lines from analysis/output/forecast_history (2016-10-24 .. 2022-12-30). Its widths were
           fitted through 2020-08-20 (fold 0), so its line coverage before 2020-08-24 is in-sample. Flagged on every chart.
  chosen = the shipped walk-forward lines (analysis/output/line_reaction/chosen_lines.csv), honest out of sample, only
           2020-08-24 .. 2022-12-30 inside the discovery window. It already contains a feedback term (res1, res5).

DISCOVERY WINDOW ONLY: sessions 2016-10-24 .. 2022-12-30 (asserted). 2023-01-01 .. 2026-08-20 stays unseen.

    python -X utf8 scripts/vol-layer-deep/feedback.py      (about 9 minutes; the conformal loop is most of it)
      -> backtest-data/vol-layer/feedback-look.json, analysis/output/vol-layer-deep/feedback/{numbers.json, intro.json}  (intro.json = the look's intro lines, written after reading the numbers)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts/forecast_history")]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import line_reaction as LR  # noqa: E402
from forecast_record import klass  # noqa: E402

HIST = ROOT / "analysis/output/forecast_history"
CHOSEN = ROOT / "analysis/output/line_reaction/chosen_lines.csv"
BA = ROOT / "data/m1_bidask"
BA_KEY = {"DE30": "dax", "SPX500": "spx", "DOW": "dow", "GOLD": "gold", "NQ": "nq", "UK100": "uk100", "US2000": "us2000"}
OUT = ROOT / "analysis/output/vol-layer-deep/feedback"
WEB = ROOT / "backtest-data/vol-layer/feedback-look.json"
START, END, CHOSEN_FROM = "2016-10-24", "2022-12-30", "2020-08-24"
RACE_FROM = "2021-01-04"                   # first January the chosen-sigma feedback term can be fitted on earlier rows
SEED = 20261111
CHECK = (10, 13, 16)                       # intraday checkpoints, London hour (end of hour h = h:00)
CLS = {"fx_majors": "FX majors", "fx_crosses": "FX crosses", "indices": "Indices", "gold": "Gold"}
RNG = np.random.default_rng(SEED)


def r(x, k=4):
    return None if x is None or not np.isfinite(x) else round(float(x), k)


# ── load ───────────────────────────────────────────────────────────────────────────────────────────────────────────
def load():
    cols = ["inst", "date", "oos", "event", "last_min", "pit_sig_used", "r_hl", "r_oh", "r_ol", "rv5"] + \
           [f"pit_{q}_{k}" for q in ("oh", "ol") for k in ("p50", "p75", "p90")] + \
           [f"{q}_h{h}" for q in ("oh", "ol") for h in CHECK]
    X = pd.concat([pd.read_csv(f, usecols=cols) for f in sorted(HIST.glob("*.csv"))], ignore_index=True)
    X = X[(X.date >= START) & (X.date <= END) & (X.last_min >= 1200)].copy()
    C = pd.read_csv(CHOSEN, usecols=["inst", "date", "sig"] + [f"{q}_{k}" for q in ("oh", "ol") for k in ("p50", "p75", "p90")])
    C = C[(C.date >= START) & (C.date <= END)].rename(columns={"sig": "c_sig", **{f"{q}_{k}": f"c_{q}_{k}" for q in ("oh", "ol") for k in ("p50", "p75", "p90")}})
    X = X.merge(C, on=["inst", "date"], how="left")
    assert X.date.max() <= END and X.date.min() >= START, "window breach"
    X = X[(X.pit_sig_used > 0) & (X.r_hl > 0) & (X.rv5 > 0)].sort_values(["inst", "date"]).reset_index(drop=True)
    X["klass"] = X.inst.map(klass)
    X["year"] = X.date.str[:4]
    return X


def per_inst(X, fn):
    return pd.concat([fn(g) for _, g in X.groupby("inst", sort=True)]).loc[X.index]


def errors(X):
    """Past-only calibrated errors for plain and chosen sigma."""
    def f(g):
        g = g.copy()
        for nm, s, mp in (("p", g.pit_sig_used, 120), ("c", g.c_sig, 40)):   # chosen starts 2020-08-24: shorter burn-in
            h = s ** 2
            ratio = g.rv5 / h
            g[f"cal_{nm}"] = ratio.shift(1).expanding(mp).mean()            # past-only scale c
            g[f"h_{nm}"] = g[f"cal_{nm}"] * h
            g[f"e_{nm}"] = np.log(g.rv5 / g[f"h_{nm}"])
            lhl = np.log(g.r_hl / s)
            g[f"ehl_{nm}"] = lhl - lhl.shift(1).expanding(mp).median()
        # sigma regime: rank of today's sigma among the past 250 sigmas (point-in-time terciles)
        s = g.pit_sig_used
        g["reg_rank"] = s.rolling(251, min_periods=121).apply(lambda a: (a[:-1] < a[-1]).mean(), raw=True)
        g["level"] = np.log(s / s.shift(1).rolling(250, min_periods=120).median())
        return g
    X = per_inst(X, f)
    X["regime"] = pd.cut(X.reg_rank, [-0.01, 1 / 3, 2 / 3, 1.01], labels=["quiet", "normal", "busy"])
    return X


# ── 1. noise floor: how big would the error be if sigma were exactly right? ─────────────────────────────────────────
def noise_floor(n=20000):
    z = RNG.standard_normal((n, 1320)) / np.sqrt(1320)
    p = np.cumsum(z, axis=1)
    hl = np.maximum(p.max(1), 0) - np.minimum(p.min(1), 0)
    r5 = z.reshape(n, 264, 5).sum(2)
    rv = (r5 ** 2).sum(1)
    return float(np.log(hl).std()), float(np.log(rv).std())


# ── 2. coverage of the lines ───────────────────────────────────────────────────────────────────────────────────────
def coverage(X):
    rows = []
    for side in ("oh", "ol"):
        for k in ("p50", "p75", "p90"):
            rows.append(pd.DataFrame({"inst": X.inst, "date": X.date, "year": X.year, "klass": X.klass, "side": side, "rung": k,
                                      "plain": (X[f"r_{side}"] > X[f"pit_{side}_{k}"]).astype(float),
                                      "chosen": np.where(X[f"c_{side}_{k}"].notna(), (X[f"r_{side}"] > X[f"c_{side}_{k}"]).astype(float), np.nan),
                                      "e_prev": X.groupby("inst").e_c.shift(1), "e_prev_p": X.groupby("inst").e_p.shift(1)}))
    return pd.concat(rows, ignore_index=True)


# ── 3. adaptive conformal vs static vs error-feedback bands on OH/OL in sigma units ─────────────────────────────────
def conformal(X, alphas=(0.25, 0.10), gammas=(0.005, 0.02), burn=250):
    out = []
    for inst, g in X.groupby("inst"):
        g = g.sort_values("date")
        s = g.pit_sig_used.to_numpy()
        e = g.e_p.to_numpy()
        # error-feedback scale: EWMA (half-life 10 sessions) of past log errors, half weight (variance -> sd)
        m = pd.Series(e).shift(1).ewm(halflife=10, min_periods=20).mean().fillna(0).to_numpy() / 2
        for side in ("oh", "ol"):
            y = g[f"r_{side}"].to_numpy() / s
            yf = y / np.exp(m)
            for a in alphas:
                at = {gm: a for gm in gammas}
                for i in range(burn, len(g)):
                    past, pastf = y[:i], yf[:i]
                    q_st = np.quantile(past, 1 - a)
                    row = {"inst": inst, "date": g.date.iat[i], "side": side, "alpha": a, "y": y[i], "regime": g.regime.iat[i],
                           "q_static": q_st, "q_fb": np.quantile(pastf, 1 - a) * np.exp(m[i])}
                    for gm in gammas:
                        lvl = min(max(1 - at[gm], 0.0), 1.0)
                        q = np.quantile(past, lvl) if 0 < lvl < 1 else (np.inf if lvl >= 1 else 0.0)
                        row[f"q_aci{gm}"] = q
                        err = float(y[i] > q)
                        at[gm] = at[gm] + gm * (a - err)
                    out.append(row)
    return pd.DataFrame(out)


def pinball(y, q, tau):
    q = np.where(np.isfinite(q), q, np.nanmax(y) * 3)
    d = y - q
    return np.maximum(tau * d, (tau - 1) * d)


# ── 4. QLIKE horse race on the common sample (chosen exists) ─────────────────────────────────────────────────────────
def feedback_fit(X, nm):
    """sigma^2 x exp(b . past errors), b refit every January on all earlier rows (pooled, OLS)."""
    def feats(g):
        e = g[f"e_{nm}"]
        return pd.DataFrame({"l1": e.shift(1), "l5": e.shift(1).rolling(5, min_periods=3).mean(),
                             "l22": e.shift(1).rolling(22, min_periods=10).mean()}, index=g.index)
    F = per_inst(X, feats)
    adj = pd.Series(np.nan, index=X.index)
    betas = {}
    for y in sorted(X.year.unique()):
        tr = X.year < y
        ok = tr & F.notna().all(1) & X[f"e_{nm}"].notna()
        if ok.sum() < 1000:
            continue
        A = np.column_stack([np.ones(ok.sum()), F[ok].to_numpy()])
        b = np.linalg.lstsq(A, X.loc[ok, f"e_{nm}"].to_numpy(), rcond=None)[0]
        betas[y] = [r(v, 3) for v in b]
        te = (X.year == y) & F.notna().all(1)
        adj[te] = F[te].to_numpy() @ b[1:]
    return adj, betas


def qlike(rv, h):
    x = rv / h
    return x - np.log(x) - 1


def horse_race(X):
    X = X.copy()
    adj_p, beta_p = feedback_fit(X, "p")
    adj_c, beta_c = feedback_fit(X, "c")
    X["raw_fbp"] = X.pit_sig_used ** 2 * np.exp(adj_p)
    X["raw_fbc"] = X.c_sig ** 2 * np.exp(adj_c)

    def f(g):
        g = g.copy()
        g["raw_rw"] = g.rv5.shift(1)
        g["raw_m22"] = g.rv5.shift(1).rolling(22, min_periods=15).mean()
        for k in ("fbp", "fbc", "rw", "m22"):
            g[f"h_{k}"] = (g.rv5 / g[f"raw_{k}"]).shift(1).expanding(120).mean() * g[f"raw_{k}"]
        return g
    X = per_inst(X, f)
    cand = {"plain sigma": "h_p", "chosen sigma": "h_c", "plain + error feedback": "h_fbp", "chosen + error feedback": "h_fbc",
            "yesterday's RV (random walk)": "h_rw", "22-day mean RV": "h_m22"}
    S = X[(X.date >= RACE_FROM)].dropna(subset=list(cand.values()))
    bs = LR.Boot(S.date)
    base = qlike(S.rv5, S.h_p).to_numpy()
    res = {}
    for nm, col in cand.items():
        L = qlike(S.rv5, S[col]).to_numpy()
        res[nm] = bs.ratio(S.date, L, S.date, base)[0]
    # MSE on variance (robust too, Patton), same sample
    base2 = ((S.rv5 - S.h_p) ** 2).to_numpy()
    mse = {nm: bs.ratio(S.date, ((S.rv5 - S[col]) ** 2).to_numpy(), S.date, base2)[0] for nm, col in cand.items()}
    return res, mse, {"plain": beta_p, "chosen": beta_c}, int(len(S)), int(S.date.nunique())


# ── 5. intraday: used so far vs what is left ─────────────────────────────────────────────────────────────────────────
def intraday(X):
    rows = []
    for h in CHECK:
        U = (X[f"oh_h{h}"] + X[f"ol_h{h}"]) / X.pit_sig_used
        D = pd.DataFrame({"inst": X.inst, "date": X.date, "klass": X.klass, "h": h, "U": U, "level": X.level,
                          "X": (X.r_hl - X[f"oh_h{h}"] - X[f"ol_h{h}"]) / X.pit_sig_used, "event": X.event})
        D["E"] = D.groupby("inst").U.transform(lambda u: u.shift(1).expanding(120).median())
        D["S"] = np.log(D.U.clip(lower=1e-4) / D.E)
        D["Xbar"] = D.groupby("inst").X.transform(lambda u: u.shift(1).expanding(120).mean())   # clock-only benchmark
        rows.append(D)
    D = pd.concat(rows, ignore_index=True).dropna(subset=["S", "level", "Xbar"])
    return D


def sim_intraday(X, sd_vov, n=20000):
    """Two geometry benchmarks with the data's own clock (share of variance by hour, pooled):
       none = vol exactly the forecast all day (every surprise is noise);  full = today's vol has a lognormal error of
       sd_vov that lasts all day (every surprise is information)."""
    hl2 = (X.r_hl / X.pit_sig_used) ** 2
    share = [float((((X[f"oh_h{h}"] + X[f"ol_h{h}"]) / X.pit_sig_used) ** 2).mean() / hl2.mean()) for h in CHECK]
    # piecewise variance profile: 0..10, 10..13, 13..16, 16..22 (hours)
    cuts = [0, *CHECK, 22]
    sh = [0, *share, 1.0]
    out = {}
    for mode in ("none", "full"):
        m = np.exp(sd_vov * RNG.standard_normal(n)) if mode == "full" else np.ones(n)
        segs = []
        for j in range(4):
            mins = (cuts[j + 1] - cuts[j]) * 60
            var = max(sh[j + 1] - sh[j], 1e-4)
            segs.append(RNG.standard_normal((n, mins)) * np.sqrt(var / mins))
        z = np.concatenate(segs, axis=1) * m[:, None]
        p = np.cumsum(z, axis=1)
        hi_all = np.maximum.accumulate(np.maximum(p, 0), axis=1)
        lo_all = np.minimum.accumulate(np.minimum(p, 0), axis=1)
        HL = hi_all[:, -1] - lo_all[:, -1]
        for h in CHECK:
            U = hi_all[:, h * 60 - 1] - lo_all[:, h * 60 - 1]
            Xr = HL - U
            dec = pd.qcut(np.log(U), 10, labels=False)
            mean = Xr.mean()
            out[(mode, h)] = [float(Xr[dec == d].mean() / mean) for d in range(10)]
    return out, share


# ── 6. CUSUM alarms (governance look) ───────────────────────────────────────────────────────────────────────────────
def cusum_alarms(z, k=0.5, h=5.0):
    up = dn = 0.0
    al = np.zeros(len(z), dtype=np.int8)
    for i, v in enumerate(z):
        if not np.isfinite(v):
            continue
        up, dn = max(0.0, up + v - k), max(0.0, dn - v - k)
        if up > h:
            al[i], up = 1, 0.0
        elif dn > h:
            al[i], dn = -1, 0.0
    return al


def cusum(X, nm, n_shuf=50):
    rows = []
    for inst, g in X.groupby("inst"):
        e = g[f"e_{nm}"]
        z = ((e - e.shift(1).expanding(120).mean()) / e.shift(1).expanding(120).std()).to_numpy()
        ok = np.isfinite(z)
        real = cusum_alarms(z)
        shuf = []
        zz = z[ok]
        for _ in range(n_shuf):
            s = np.full(len(z), np.nan)
            s[ok] = RNG.permutation(zz)
            shuf.append(np.abs(cusum_alarms(s)))
        rows.append(pd.DataFrame({"inst": inst, "year": g.year.to_numpy(), "ok": ok, "up": real == 1, "dn": real == -1,
                                  "shuf": np.mean(shuf, axis=0)}))
    D = pd.concat(rows)
    D = D[D.ok]
    return D


# ── 7. example days with large misses: M1 path in sigma, chosen p90 lines as stop/target marks ───────────────────────
def examples(X, n_over=6, n_under=2):
    C = X[X.date >= CHOSEN_FROM].dropna(subset=["c_sig"]).copy()
    C["ehl"] = np.log(C.r_hl / C.c_sig)
    C = C.sort_values("ehl", ascending=False)
    pick, seen = [], set()
    for _, row in C.iterrows():
        if row.inst in seen or row.date in {p.date for p in pick}:
            continue
        pick.append(row); seen.add(row.inst)
        if len(pick) == n_over:
            break
    for _, row in C.iloc[::-1].iterrows():
        if row.inst in seen:
            continue
        pick.append(row); seen.add(row.inst)
        if len(pick) == n_over + n_under:
            break
    out = []
    for row in pick:
        df = pd.read_parquet(BA / f"{BA_KEY.get(row.inst, row.inst.lower())}_m1.parquet", columns=["time", "close"])
        idx = pd.DatetimeIndex(pd.to_datetime(df["time"], utc=True)).tz_convert("Europe/London").tz_localize(None)
        lo = pd.Timestamp(row.date)
        m = (idx >= lo) & (idx < lo + pd.Timedelta(hours=22))
        c, t = df.close.to_numpy()[m], idx[m]
        if len(c) < 100:
            continue
        mins = ((t - lo).total_seconds() // 60).astype(int)
        s = row.c_sig / 100
        y = np.log(c / c[0]) / s
        keep = np.arange(0, len(c), 10)
        path = [[int(mins[i]), round(float(y[i]), 3)] for i in keep]
        out.append({"inst": row.inst, "date": row.date,
                    "side": f"range {row.r_hl / row.c_sig:.2f}σ vs σ {row.c_sig:.2f}% ({'above' if row.ehl > 0 else 'below'} forecast)",
                    "r": round(float(y[-1]), 2), "unit": "σ at the close",
                    "stop": round(-float(row.c_ol_p90 / row.c_sig), 2), "target": round(float(row.c_oh_p90 / row.c_sig), 2), "path": path})
    return out


# ── main ───────────────────────────────────────────────────────────────────────────────────────────────────────────
def main():
    OUT.mkdir(parents=True, exist_ok=True)
    X = errors(load())
    print("rows", len(X), "instruments", X.inst.nunique(), "dates", X.date.min(), X.date.max(), flush=True)
    N = {}
    charts = []

    # 1. error distribution vs noise floor
    fl_hl, fl_rv = noise_floor()
    Cw = X[X.date >= CHOSEN_FROM].dropna(subset=["ehl_c", "e_c"])
    e = Cw.ehl_c.clip(-2, 2)
    bins = np.arange(-2, 2.01, 0.1)
    cnt, _ = np.histogram(e, bins)
    sd_hl, sd_rv = float(Cw.ehl_c.std()), float(Cw.e_c.std())
    vov = float(np.sqrt(max(sd_hl ** 2 - fl_hl ** 2, 0)))
    N["error_sd"] = {"hl_chosen": r(sd_hl, 3), "hl_floor": r(fl_hl, 3), "rv_chosen": r(sd_rv, 3), "rv_floor": r(fl_rv, 3),
                     "hl_plain": r(float(X[X.date >= CHOSEN_FROM].ehl_p.std()), 3), "rv_plain": r(float(X[X.date >= CHOSEN_FROM].e_p.std()), 3),
                     "vov_from_hl": r(vov, 3), "skew_hl": r(float(Cw.ehl_c.skew()), 3), "share_above_0.5": r(float((Cw.ehl_c > 0.5).mean()), 4),
                     "share_below_-0.5": r(float((Cw.ehl_c < -0.5).mean()), 4)}
    charts.append({"type": "hist", "title": "Daily miss of the chosen forecast: log(range ÷ σ), centred on its own past median",
                   "unit": "log ratio", "bins": [[round(float(b), 2), int(c)] for b, c in zip(bins[:-1], cnt)],
                   "note": f"{len(Cw):,} instrument-days, 2020-08-24 to 2022-12-30 (the chosen lines' honest window). 0 = a typical day for that σ; +0.69 = range twice the typical size. "
                           f"Benchmark: if σ were exactly right every day, the spread of this number from range noise alone would be sd {fl_hl:.2f} (random walk, 1-minute path). "
                           f"Real sd {sd_hl:.2f}. For 5-minute realised variance the floor is {fl_rv:.2f} and the real sd {sd_rv:.2f}: the RV miss is almost all real forecast error, while about {100 * fl_hl ** 2 / sd_hl ** 2:.0f}% of the variance of the range miss is unavoidable range noise. "
                           "(The floors assume constant vol through the day and Gaussian steps, so they are a little low.)"})

    # 2. coverage per instrument and class (chosen, honest window)
    CV = coverage(X)
    p75 = CV[(CV.rung == "p75") & CV.chosen.notna()]
    bs = LR.Boot(p75.date)
    rows = []
    for cls in ["fx_majors", "fx_crosses", "indices", "gold"]:
        g = p75[p75.klass == cls]
        v = bs.mean(g.date, g.chosen.to_numpy() * 100)[0]
        rows.append({"label": CLS[cls], "value": v[0], "lo": v[1], "hi": v[2]})
    inst_rows = []
    for inst, g in p75.groupby("inst"):
        inst_rows.append((inst, float(g.chosen.mean() * 100)))
    inst_rows.sort(key=lambda t: t[1])
    for inst, v in inst_rows:
        rows.append({"label": inst, "value": r(v, 1)})
    allv = bs.mean(p75.date, p75.chosen.to_numpy() * 100)[0]
    N["p75_chosen_all"] = allv
    N["coverage_chosen"] = {k: r(float(CV[(CV.rung == k) & CV.chosen.notna()].chosen.mean() * 100), 2) for k in ("p50", "p75", "p90")}
    N["coverage_plain_oos"] = {k: r(float(CV[(CV.rung == k) & (CV.date >= CHOSEN_FROM)].plain.mean() * 100), 2) for k in ("p50", "p75", "p90")}
    charts.append({"type": "bars", "title": "How often the day goes past the chosen p75 line (OH and OL pooled), by class and instrument",
                   "unit": "% of sides", "ref": 25, "rows": rows,
                   "note": f"Nominal 25% (the reference line). Honest window 2020-08-24 to 2022-12-30. All instruments {allv[0]}% [{allv[1]}, {allv[2]}] (date-block bootstrap). "
                           "Classes carry 95% ranges; single instruments do not (about 600 days each, ±3.5 points of noise). Above 25 = lines too tight; below = too wide."})

    # 3. rolling coverage over time
    daily = CV.groupby(["date", "rung"])[["plain", "chosen"]].mean().unstack("rung")
    roll = daily.rolling(60, min_periods=40).mean() * 100
    dates = roll.index.to_list()
    def pts(col, start=None):
        s = roll[col]
        out = []
        for i in range(0, len(s), 5):
            d = dates[i]
            if start and d < start:
                continue
            if np.isfinite(s.iat[i]):
                out.append([d, round(float(s.iat[i]), 1)])
        return out
    charts.append({"type": "lines", "title": "Rolling 60-session hit rate of the p75 and p90 lines, all instruments", "unit": "% of sides beyond the line", "xlabel": "date",
                   "series": [{"name": "plain p75 (target 25)", "points": pts(("plain", "p75"))}, {"name": "chosen p75 (target 25)", "points": pts(("chosen", "p75"), CHOSEN_FROM)},
                              {"name": "plain p90 (target 10)", "points": pts(("plain", "p90"))}, {"name": "chosen p90 (target 10)", "points": pts(("chosen", "p90"), CHOSEN_FROM)}],
                   "note": "Benchmarks: 25% for p75 and 10% for p90. The plain lines' widths were fitted through 2020-08-20, so before then they are in-sample and should look good. "
                           "Swings of 10+ points last weeks: misses cluster in time across all instruments (one shock hits many pairs at once)."})

    # 4. error autocorrelation vs shuffled and by forecast
    def acf(col, lags=10):
        out = []
        for L in range(1, lags + 1):
            a = X.groupby("inst")[col].shift(L)
            ok = a.notna() & X[col].notna() & (X.date >= "2017-06-01")
            out.append(float(np.corrcoef(X.loc[ok, col], a[ok])[0, 1]))
        return out
    ac_p = acf("e_p")
    Xc = X[X.date >= CHOSEN_FROM]
    def acf_sub(D, col, lags=10):
        out = []
        for L in range(1, lags + 1):
            a = D.groupby("inst")[col].shift(L)
            ok = a.notna() & D[col].notna()
            out.append(float(np.corrcoef(D.loc[ok, col], a[ok])[0, 1]))
        return out
    ac_c, ac_p_same = acf_sub(Xc, "e_c"), acf_sub(Xc, "e_p")
    sh = []
    for _ in range(100):
        Y = Xc[["inst", "e_c"]].dropna().copy()
        Y["e_c"] = Y.groupby("inst").e_c.transform(lambda s: s.sample(frac=1, random_state=int(RNG.integers(1e9))).to_numpy())
        sh.append(acf_sub(Y, "e_c", 3)[0])
    band = float(np.quantile(np.abs(sh), 0.95))
    N["acf"] = {"plain_full": [r(v, 3) for v in ac_p], "plain_2020": [r(v, 3) for v in ac_p_same], "chosen_2020": [r(v, 3) for v in ac_c], "shuffle95": r(band, 3)}
    charts.append({"type": "lines", "title": "Does yesterday's miss predict today's? Autocorrelation of the daily RV miss", "unit": "correlation", "xlabel": "lag (sessions)",
                   "series": [{"name": "plain σ 2017-06..2022", "points": [[i + 1, round(v, 3)] for i, v in enumerate(ac_p)]},
                              {"name": "plain σ 2020-08..2022", "points": [[i + 1, round(v, 3)] for i, v in enumerate(ac_p_same)]},
                              {"name": "chosen σ 2020-08..2022", "points": [[i + 1, round(v, 3)] for i, v in enumerate(ac_c)]},
                              {"name": "shuffled, 95% band", "points": [[i + 1, round(band, 3)] for i in range(10)]}],
                   "note": f"Miss = log(RV ÷ calibrated σ²). Benchmark: the same misses shuffled within each instrument, 100 times: 95% of shuffles stay within ±{band:.3f}. "
                           "A slowly decaying positive line means the forecast keeps missing in the same direction for days: a feedback term could still help. The chosen σ already uses yesterday's and the 5-day miss."})

    # 5. QLIKE horse race
    ql, mse, betas, n_rows, n_dates = horse_race(X)
    N["qlike"], N["mse"], N["fb_betas"], N["race_rows"] = ql, mse, betas, [n_rows, n_dates]
    charts.append({"type": "bars", "title": "Loss of each variance forecast ÷ loss of the plain σ (QLIKE, lower is better)", "unit": "ratio", "ref": 1,
                   "rows": [{"label": k, "value": v[0], "lo": v[1], "hi": v[2]} for k, v in ql.items()],
                   "note": f"{n_rows:,} instrument-days, {n_dates} dates, 2021-01-04 to 2022-12-30 (the chosen σ's feedback term needs a year to fit on). Benchmark = plain σ at 1.0, plus two naive forecasts (yesterday's RV, 22-day mean). "
                           "Every forecast gets the same past-only scale so only its shape is judged. QLIKE is one of the two losses that rank correctly with a noisy proxy (Patton). "
                           "Error feedback = σ² × exp(b × yesterday's, 5-day and 22-day misses), b refit each January on earlier years only."})

    # 6. Mincer-Zarnowitz by year (plain sigma) + bias
    mz_rows, bias_rows = [], []
    for y, g in X[X.e_p.notna()].groupby("year"):
        g = g.copy()
        yv, xv = np.log(g.rv5), np.log(g.pit_sig_used ** 2)
        yv = yv - yv.groupby(g.inst).transform("mean")
        xv = xv - xv.groupby(g.inst).transform("mean")
        b = LR.Boot(g.date)
        v = b.ratio(g.date, (xv * yv).to_numpy(), g.date, (xv * xv).to_numpy())[0]
        mz_rows.append({"label": y, "value": v[0], "lo": v[1], "hi": v[2]})
        bv = b.mean(g.date, g.e_p.to_numpy())[0]
        bias_rows.append({"label": y, "value": bv[0], "lo": bv[1], "hi": bv[2]})
    gc = X[X.e_c.notna()].copy()
    yv, xv = np.log(gc.rv5), np.log(gc.c_sig ** 2)
    yv, xv = yv - yv.groupby(gc.inst).transform("mean"), xv - xv.groupby(gc.inst).transform("mean")
    bc = LR.Boot(gc.date).ratio(gc.date, (xv * yv).to_numpy(), gc.date, (xv * xv).to_numpy())[0]
    mz_rows.append({"label": "chosen σ 2020-08..22", "value": bc[0], "lo": bc[1], "hi": bc[2]})
    N["mz"], N["bias"] = mz_rows, bias_rows
    charts.append({"type": "bars", "title": "Mincer-Zarnowitz slope by year: how much of the forecast's day-to-day move shows up in realised variance", "unit": "slope", "ref": 1,
                   "rows": mz_rows,
                   "note": "log RV regressed on log σ², within each instrument and year. Benchmark 1.0 = the forecast moves exactly as much as realised does. "
                           "Below 1 = the forecast over-reacts (shrink it toward its average); above 1 = it under-reacts. Plain σ by year; the chosen σ in its window as the last bar."})
    charts.append({"type": "bars", "title": "Average miss by year (plain σ): is realised running above or below the past calibration?", "unit": "mean log(RV ÷ calibrated σ²)", "ref": 0,
                   "rows": bias_rows,
                   "note": "Benchmark 0 = no drift. The calibration is an expanding past mean, so a year that sits above 0 is a year when realised ran hotter than everything before it. "
                           "Because log of a mean-one ratio averages below 0 (Jensen), a well-calibrated year sits a little under 0, not at 0."})

    # 7. after a miss: today's line hit rate by yesterday's miss quintile
    p75a = CV[(CV.rung == "p75")].dropna(subset=["e_prev_p"]).copy()
    p75a["q"] = p75a.groupby("inst").e_prev_p.transform(lambda s: pd.qcut(s.rank(method="first"), 5, labels=False))
    grp = []
    labels = ["1 big under", "2 under", "3 middle", "4 over", "5 big over"]
    cc = p75a.dropna(subset=["chosen"])
    for q in range(5):
        a = p75a[(p75a.q == q) & (p75a.date < CHOSEN_FROM)]
        b_ = p75a[(p75a.q == q) & (p75a.date >= CHOSEN_FROM)]
        c_ = cc[cc.q == q]
        grp.append({"label": labels[q], "values": [r(a.plain.mean() * 100, 1), r(b_.plain.mean() * 100, 1), r(c_.chosen.mean() * 100, 1)]})
    N["after_miss"] = grp
    charts.append({"type": "groups", "title": "After yesterday's miss: how often today goes past the p75 line", "names": ["plain lines 2016-20 (in-sample)", "plain lines 2020-22", "chosen lines 2020-22"],
                   "unit": "% of sides", "rows": grp,
                   "note": "Yesterday's RV miss (plain σ) split into fifths per instrument. Benchmark 25% in every row. If a row is above 25 the lines are too tight after that kind of day: "
                           "a stop placed at the line would be hit more than planned. The chosen lines already scale σ by yesterday's miss, so they should be flatter."})

    # 8. conformal vs static vs feedback
    print("conformal ...", flush=True)
    CF = conformal(X)
    CF = CF[CF.date >= "2017-06-01"]
    res_cf = {}
    rows_w, rows_reg = [], []
    for a in (0.25, 0.10):
        g = CF[CF.alpha == a]
        bsd = LR.Boot(g.date)
        tau = 1 - a
        base_pl = pinball(g.y.to_numpy(), g.q_static.to_numpy(), tau)
        for nm, col in (("static", "q_static"), ("error-feedback σ", "q_fb"), ("ACI γ=0.005", "q_aci0.005"), ("ACI γ=0.02", "q_aci0.02")):
            q = g[col].to_numpy()
            hit = (g.y.to_numpy() > q).astype(float)
            cov = bsd.mean(g.date, hit * 100)[0]
            wid = bsd.ratio(g.date, np.where(np.isfinite(q), q, np.nan).clip(0, 50), g.date, g.q_static.to_numpy())[0]
            pl = bsd.ratio(g.date, pinball(g.y.to_numpy(), q, tau), g.date, base_pl)[0]
            byreg = {reg: r(float((g.y[g.regime == reg] > g[col][g.regime == reg]).mean() * 100), 1) for reg in ("quiet", "normal", "busy")}
            byyear = {y: r(float((gg.y > gg[col]).mean() * 100), 1) for y, gg in g.groupby(g.date.str[:4])}
            res_cf[f"{nm}|p{int(tau * 100)}"] = {"cov": cov, "width": wid, "pinball": pl, "regime": byreg, "year": byyear}
            rows_w.append({"label": f"p{int(tau * 100)} {nm}", "value": pl[0], "lo": pl[1], "hi": pl[2]})
        rows_reg += [{"label": f"p{int(tau * 100)} {reg}", "values": [res_cf[f"{nm}|p{int(tau * 100)}"]["regime"][reg] for nm in ("static", "error-feedback σ", "ACI γ=0.02")]}
                     for reg in ("quiet", "normal", "busy")]
    N["conformal"] = res_cf
    charts.append({"type": "groups", "title": "Conditional coverage: share of sides beyond the band in quiet, normal and busy σ regimes",
                   "names": ["static band", "error-feedback σ band", "adaptive conformal (γ=0.02)"], "unit": "% beyond", "rows": rows_reg,
                   "note": "Plain σ, OH and OL in σ units, 2017-06 to 2022 (each band uses past days only). Benchmarks: 25 for p75 rows, 10 for p90 rows. "
                           "Regime = where today's σ ranks among its past 250 values. Adaptive conformal fixes the long-run average by construction, so the test is whether it also fixes each regime, and at what width."})
    charts.append({"type": "bars", "title": "Quantile (pinball) loss of each band ÷ the static band: judges coverage and width together", "unit": "ratio", "ref": 1, "rows": rows_w,
                   "note": "Below 1 = a better band. Static band = past-only quantile of range ÷ σ, the benchmark. Error-feedback σ = σ scaled by an EWMA (half-life 10 days) of past misses. "
                           "ACI = Gibbs-Candès adaptive conformal on top of the static band. Same days, same σ, date-block 95% ranges."})
    cov_rows = []
    for k, v in res_cf.items():
        cov_rows.append({"label": k.replace("|", " "), "value": v["cov"][0], "lo": v["cov"][1], "hi": v["cov"][2]})
    charts.append({"type": "bars", "title": "Overall hit rate of each band (target 25 for p75, 10 for p90)", "unit": "% beyond", "rows": cov_rows,
                   "note": "Unconditional coverage only. All four sit near target, which is why coverage alone cannot pick a band: see the regime and pinball charts. Width ratios are in numbers.json."})

    # 9. intraday: used so far vs left
    print("intraday ...", flush=True)
    D = intraday(X)
    D["dec"] = D.groupby(["h", "inst"]).S.transform(lambda s: pd.qcut(s.rank(method="first"), 10, labels=False))
    sim, share = sim_intraday(X, vov)
    series = []
    intr = {}
    for h in CHECK:
        g = D[D.h == h]
        base = g.X.mean()
        curve = [float(g[g.dec == d].X.mean() / base) for d in range(10)]
        intr[h] = {"curve": [r(v, 3) for v in curve], "mean_left_sigma": r(base, 3), "share_used": r(float((g.U / (g.U + g.X)).median()), 3)}
        series.append({"name": f"{h:02d}:00 real", "points": [[d + 1, round(v, 3)] for d, v in enumerate(curve)]})
    N["intraday"], N["sim_share"] = intr, [r(s, 3) for s in share]
    N["sim"] = {f"{k[0]}_{k[1]}": [r(v, 3) for v in vals] for k, vals in sim.items()}
    charts.append({"type": "lines", "title": "Range still to come after 10:00, 13:00 and 16:00, by how much of the day is used so far", "unit": "× the clock-only average", "xlabel": "surprise so far, decile (1 = least used, 10 = most)",
                   "series": series,
                   "note": "Surprise = log(range so far ÷ the instrument's past median range by that hour). y = range added after the checkpoint, ÷ the average at that hour (benchmark 1 = the clock alone). "
                           "Read the slope: falling = a busy morning leaves less (exhaustion), flat or rising = vol so far carries on. The next chart sets the two random-walk benchmarks beside 13:00."})
    charts.append({"type": "lines", "title": "13:00: real days against two random-walk benchmarks", "unit": "× the 13:00 average", "xlabel": "surprise so far, decile",
                   "series": [{"name": "13:00 real", "points": [[d + 1, v] for d, v in enumerate(intr[13]["curve"])]},
                              {"name": "random walk, vol exactly σ (every surprise is noise)", "points": [[d + 1, round(v, 3)] for d, v in enumerate(sim[("none", 13)])]},
                              {"name": f"random walk, today's vol off by sd {vov:.2f} all day (surprise is information)", "points": [[d + 1, round(v, 3)] for d, v in enumerate(sim[("full", 13)])]}],
                   "note": f"Both benchmarks use the data's own clock (share of the day's variance done by 10:00/13:00/16:00 = {share[0]:.2f}/{share[1]:.2f}/{share[2]:.2f}). "
                           "If σ were exact, a wide morning would leave less to come (geometry: the price is less likely to reach a new extreme). If today's vol is simply higher than σ all day, "
                           "the curve is flat to rising. Where the real line sits between them says how much of the morning's surprise is information."})
    # level x surprise at 13:00
    g = D[D.h == 13].copy()
    g["lev3"] = pd.qcut(g.level.rank(method="first"), 3, labels=["σ low vs its year", "σ middle", "σ high vs its year"])
    g["s5"] = pd.qcut(g.S.rank(method="first"), 5, labels=False)
    base = g.X.mean()
    rows = []
    for q in range(5):
        rows.append({"label": ["least used", "below typical", "typical", "above typical", "most used"][q],
                     "values": [r(float(g[(g.s5 == q) & (g.lev3 == L)].X.mean() / base), 3) for L in ["σ low vs its year", "σ middle", "σ high vs its year"]]})
    # regression: X/sigma on level and surprise, standardised
    gg = g.dropna(subset=["S", "level", "X"])
    A = np.column_stack([np.ones(len(gg)), gg.level, gg.S])
    beta = np.linalg.lstsq(A, gg.X.to_numpy(), rcond=None)[0]
    bsg = LR.Boot(gg.date)
    # bootstrap the surprise slope via ratio of sums on residualised terms (Frisch-Waugh)
    rs = gg.S - np.poly1d(np.polyfit(gg.level, gg.S, 1))(gg.level)
    rl = gg.level - np.poly1d(np.polyfit(gg.S, gg.level, 1))(gg.S)
    sl_s = bsg.ratio(gg.date, (rs * gg.X).to_numpy(), gg.date, (rs * rs).to_numpy())[0]
    sl_l = bsg.ratio(gg.date, (rl * gg.X).to_numpy(), gg.date, (rl * rl).to_numpy())[0]
    N["level_vs_surprise_13"] = {"beta": [r(v, 3) for v in beta], "surprise_slope": sl_s, "level_slope": sl_l,
                                 "sd_S": r(float(gg.S.std()), 3), "sd_level": r(float(gg.level.std()), 3), "mean_left": r(base, 3)}
    charts.append({"type": "groups", "title": "At 13:00: level of σ against surprise so far. Range still to come", "names": ["σ low vs its year", "σ middle", "σ high vs its year"],
                   "unit": "× the 13:00 average", "rows": rows,
                   "note": f"Level = σ against its own past-year median (known at the open). Surprise = range so far against the usual by 13:00. Benchmark 1.0. "
                           f"Both measured in σ units, so a pure level effect would already be in σ: a row that rises left to right means level still adds. "
                           f"Slopes per unit (σ units of range to come): surprise {sl_s[0]} [{sl_s[1]}, {sl_s[2]}], level {sl_l[0]} [{sl_l[1]}, {sl_l[2]}]."})

    # 10. CUSUM alarms by year
    print("cusum ...", flush=True)
    rows = []
    cs = {}
    Dc = cusum(X[X.e_c.notna()], "c")
    cs["chosen 2021-22"] = {"up_per_1000": r(1000 * Dc.up.mean(), 2), "dn_per_1000": r(1000 * Dc.dn.mean(), 2), "shuffled_per_1000": r(1000 * Dc.shuf.mean(), 2), "n": int(len(Dc))}
    for nm, lab in (("p", "plain"),):
        D2 = cusum(X, nm)
        for y, g in D2.groupby("year"):
            n = len(g)
            rows.append({"label": y, "values": [r(1000 * g.up.sum() / n, 1), r(1000 * g.dn.sum() / n, 1), r(1000 * g.shuf.sum() / n, 1)]})
        cs[lab] = {"up_per_1000": r(1000 * D2.up.mean(), 2), "dn_per_1000": r(1000 * D2.dn.mean(), 2), "shuffled_per_1000": r(1000 * D2.shuf.mean(), 2)}
    N["cusum"] = cs
    charts.append({"type": "groups", "title": "CUSUM drift alarms on the plain σ's daily miss, per 1,000 instrument-days", "names": ["alarm: running hot", "alarm: running cold", "shuffled misses (both)"],
                   "unit": "alarms per 1,000 days", "rows": rows,
                   "note": "Textbook CUSUM on the standardised miss (k = 0.5, h = 5, reset after each alarm), each instrument separately. Benchmark: the same misses shuffled in time (50 shuffles), "
                           "which keeps their size but removes runs. Real alarms well above shuffled = misses come in runs, so a drift alarm has something to find. Years with many 'hot' alarms are when σ lagged a vol rise."})

    # 11. example days
    print("examples ...", flush=True)
    ex = examples(X)
    charts.append({"type": "trades", "title": "Biggest misses of the chosen forecast, 2020-08 to 2022 (6 above, 2 below)", "unit": "σ from the open", "trades": ex,
                   "note": "Price path from the London open in σ (chosen σ), 10-minute samples. Dashed lines: the chosen p90 lines (OL below, OH above), which a day should cross about 1 time in 10 per side. "
                           "One per instrument, picked by the size of the miss, not by direction."})

    # worked example: EURUSD 2022-11-10
    w = X[(X.inst == "EURUSD") & (X.date >= "2022-11-07") & (X.date <= "2022-11-11")]
    N["example_eurusd"] = w[["date", "event", "pit_sig_used", "c_sig", "r_hl", "r_oh", "r_ol", "rv5", "e_p", "e_c", "ehl_c", "c_oh_p75", "c_oh_p90", "c_ol_p75", "c_ol_p90",
                             "oh_h10", "ol_h10", "oh_h13", "ol_h13", "oh_h16", "ol_h16", "level"]].round(4).to_dict("records")
    De = D[(D.inst == "EURUSD") & (D.date == "2022-11-10")]
    N["example_eurusd_intraday"] = De[["h", "U", "E", "S", "X", "Xbar"]].round(3).to_dict("records")
    cfe = CF[(CF.inst == "EURUSD") & (CF.date.isin(["2022-11-09", "2022-11-10", "2022-11-11"])) & (CF.alpha == 0.25)]
    N["example_eurusd_bands"] = cfe.round(3).to_dict("records")

    intro = INTRO(N)
    res = {"id": "feedback-look", "window": [START, END], "intro": intro, "charts": charts}
    WEB.write_text(json.dumps(res, ensure_ascii=False, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    (OUT / "numbers.json").write_text(json.dumps(N, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    print(json.dumps({k: N[k] for k in ("error_sd", "coverage_chosen", "coverage_plain_oos", "acf", "qlike", "mz", "cusum", "level_vs_surprise_13", "intraday")}, indent=1, default=str))


def INTRO(N):
    path = OUT / "intro.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return ["(intro written after reading the numbers)"]


if __name__ == "__main__":
    main()
