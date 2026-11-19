"""ladder-v2 per-instrument harness (template from ladder-v2-nq; runbook Phase 1 + 0.8).

    python scripts/ladder-v2/ladder.py build GOLD      -> analysis/output/ladder-v2-gold/rows_{C,F}.parquet
    python scripts/ladder-v2/ladder.py score GOLD      -> analysis/output/ladder-v2-gold/{results.json, report.txt}

Which sigma keeps an instrument's daily reach ladder (OH/OL/HL/OC p50/75/90, % of the London-midnight open) on target
in every sigma regime, walk-forward, CFD (C) and futures (F)? Rules: forge/LADDER_V2_<SYM>_PREREG.md, which follows
forge/LADDER_V2_NQ_PREREG.md plus the standards from its amendment A2 (3-month blocks; stress windows left out in
turn; data-fault days left out; price-move flags descriptive only). Sessions after 2026-08-21 are never scored.
"""
from __future__ import annotations

import json
import warnings
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
warnings.simplefilter("ignore", pd.errors.PerformanceWarning)
sys.path.insert(0, str(ROOT))
from forge import vol as V  # noqa: E402
from forge.run_combined_range import asof_before, cboe  # noqa: E402
from forge.data_screens import input_hashes  # noqa: E402

LOCK = pd.Timestamp("2026-08-21")
EST = ["yz_10", "ewma_094", "ewma_090", "yz_20", "yz_30", "naive", "har_rv_log"]
# c: OANDA M1 cache; f: NT8 root; iv: CBOE index or None; ref: ladder_candidates d1 name (positive control 1);
# live: live estimator (js/forecastLadderIvAdjParams.js); invert: futures quoted the other way up (6J/6S/6C).
SYMS = {
    "NQ": dict(c="portfolioBacktest/cache/nq_m1.parquet", f="NQ", iv="VXN", ref="NQ", live="yz_10", invert=False),
    "GOLD": dict(c="portfolioBacktest/cache/gold_m1.parquet", f="GC", iv="GVZ", ref="GOLD", live="yz_10", invert=False),
    "SPX500": dict(c="portfolioBacktest/cache/spx500_m1.parquet", f="ES", iv="VIX", ref="SPX500", live="yz_10", invert=False),
    "US30": dict(c="portfolioBacktest/cache/us30_m1.parquet", f="YM", iv="VXD", ref="US30", live="yz_10", invert=False),
    "US2000": dict(c="portfolioBacktest/cache/us2000_m1.parquet", f="RTY", iv="RVX", ref="US2000", live="yz_10", invert=False),
}
SEED, B, BLOCK = 20261118, 2000, 63
QS, TAUS = ("hl", "oc", "oh", "ol"), (50, 75, 90)
TGT = {50: 0.50, 75: 0.25, 90: 0.10}
CELLS = [(q, t) for q in ("hl", "oh", "ol") for t in (75, 90)]
TG6 = np.array([TGT[t] for _, t in CELLS])
TG12 = np.array([TGT[t] for _ in QS for t in TAUS])
YEARS = range(2018, 2027)
EPISODES = {"2018Q4": ("2018-10-01", "2018-12-31"), "covid": ("2020-02-19", "2020-06-30"),
            "bear2022": ("2022-01-01", "2022-12-31"), "tariff2025": ("2025-03-01", "2025-05-31")}
FAULT = {"gap", "frozen", "partial", "missing", "ts_dup", "ts_order", "ts_weekend", "round_trip", "roll_gap",
         "cvf_open"}
LOG: list[str] = []


def say(s=""):
    print(s, flush=True)
    LOG.append(s)


def rel(f):
    f = Path(f)
    return (str(f.relative_to(ROOT)) if f.is_relative_to(ROOT) else str(f)).replace("\\", "/")


def out_dir(sym):
    import os
    return ROOT / os.environ.get("LADDER_OUT", f"analysis/output/ladder-v2-{sym.lower()}")


GARCH = {"G_garch": dict(vol="GARCH", o=0, dist="normal"), "G_garch_t": dict(vol="GARCH", o=0, dist="t"),
         "G_gjr": dict(vol="GARCH", o=1, dist="normal"), "G_egarch": dict(vol="EGARCH", o=1, dist="normal")}
REG = ("R5", "R15", "SHAR", "HARCJ")          # log-RV regressions on 5/15-min data, OLS refit each walk-forward year


def har_col(sym):
    return "A0" if SYMS[sym]["live"] == "har_rv_log" else "E_har_rv_log"


def arms_for(sym):
    """Gold prereg A2 (pre-results) added the GARCH family, SHAR, HAR-CJ and two 50/50 blends."""
    cfg = SYMS[sym]
    a = ["A0"] + [f"E_{e}" for e in EST if e != cfg["live"]] + ["H8", "R5", "R15", "SHAR", "HARCJ"]
    a += list(GARCH) + ["B_har_garcht"]
    return a + (["V3", "V4", "B_har_iv"] if cfg["iv"] else [])


# ================================================================ build
def m1_paths(sym, track, kind="unadj"):
    cfg = SYMS[sym]
    return ROOT / (cfg["c"] if track == "C" else f"analysis/output/nt8/continuous/{cfg['f']}_1m_{kind}.parquet")


def load_m1(sym, track, kind="unadj"):
    p = m1_paths(sym, track, kind)
    d = pd.read_parquet(p)
    if track == "C":
        d.index = pd.to_datetime(d.index, utc=True)
    else:
        d.index = pd.to_datetime(d.pop("timestamp"), utc=True) - pd.Timedelta(minutes=1)   # NT8 end-stamped
    d = d[~d.index.duplicated()].sort_index()
    d = d[d.index < pd.Timestamp("2026-08-23", tz="UTC")][["open", "high", "low", "close"]].astype(float)
    if track == "F" and SYMS[sym]["invert"]:
        d = pd.DataFrame({"open": 1 / d["open"], "high": 1 / d["low"], "low": 1 / d["high"], "close": 1 / d["close"]})
    return d


def london_sessions(m):
    lt = m.index.tz_convert("Europe/London")
    x = m[(lt.hour < 22) & (lt.dayofweek < 5)].copy()
    x["date"] = x.index.tz_convert("Europe/London").tz_localize(None).normalize()
    g = x.groupby("date")
    s = pd.DataFrame({"o": g["open"].first(), "h": g["high"].max(), "l": g["low"].min(), "c": g["close"].last(),
                      "n": g.size()})
    s = s[(s["n"] >= 600) & (s.index <= LOCK)]
    o = s["o"]
    return pd.DataFrame({"hl": (s["h"] - s["l"]) / o * 100, "oc": (s["c"] - o).abs() / o * 100,
                         "oh": (s["h"] - o) / o * 100, "ol": (o - s["l"]) / o * 100, "n": s["n"]})


def ny_bars(m):
    ny = m.index.tz_convert("America/New_York")
    key = (ny.tz_localize(None) + pd.Timedelta(hours=7)).normalize()
    x = m.assign(d=key)
    g = x.groupby("d")
    b = pd.DataFrame({"open": g["open"].first(), "high": g["high"].max(), "low": g["low"].min(),
                      "close": g["close"].last(), "n": g.size()})
    b = b[(b["n"] >= 60) & (b.index.dayofweek < 5)]
    rv, ext = {}, {}
    for k in (5, 15):
        c = x["close"].resample(f"{k}min", label="left", closed="left").last().dropna()
        dk = (c.index.tz_convert("America/New_York").tz_localize(None) + pd.Timedelta(hours=7)).normalize()
        r = np.log(c).groupby(dk).diff()
        rv[k] = (r ** 2).groupby(dk).sum()
        rv[k] = rv[k][rv[k] > 0].reindex(b.index)
        if k == 5:                                   # semivariances and bipower variation from the same 5-min returns
            ext["rsp"] = (r.clip(lower=0) ** 2).groupby(dk).sum().reindex(b.index)
            ext["rsn"] = (r.clip(upper=0) ** 2).groupby(dk).sum().reindex(b.index)
            ar = r.abs()
            ext["bv"] = (np.pi / 2 * ar * ar.groupby(dk).shift(1)).groupby(dk).sum().reindex(b.index)
    return b, rv[5], rv[15], ext


def garch_sigmas(b):
    """Per walk-forward year Y: fit each GARCH model on NY-close daily % returns of bars before 1 Jan Y, then filter
    the whole series with those fixed parameters. Value at bar t = one-step forecast for bar t+1 made at t (daily %)."""
    from arch import arch_model
    r = (np.log(b["close"]).diff() * 100).dropna()
    out = {}
    for Y in YEARS:
        tr = r[r.index < pd.Timestamp(f"{Y}-01-01")]
        for g, spec in GARCH.items():
            mdl = arch_model(tr, mean="Constant", vol=spec["vol"], p=1, o=spec["o"], q=1, dist=spec["dist"])
            fit = mdl.fit(disp="off", show_warning=False)
            full = arch_model(r, mean="Constant", vol=spec["vol"], p=1, o=spec["o"], q=1, dist=spec["dist"])
            v = full.fix(fit.params).forecast(horizon=1, start=0, reindex=True).variance["h.1"]
            out[f"{g}@{Y}"] = np.sqrt(v)
            out.setdefault("_params", {})[f"{g}@{Y}"] = {k: float(x) for k, x in fit.params.items()}
    params = out.pop("_params")
    return pd.DataFrame(out), params


def har800(sym, name, b):
    d = out_dir(sym) / "d1"
    d.mkdir(parents=True, exist_ok=True)
    rows = [{"d": i.strftime("%Y-%m-%d"), "o": r.open, "h": r.high, "l": r.low, "c": r.close} for i, r in b.iterrows()]
    (d / f"{name}.json").write_text(json.dumps(rows))
    subprocess.run(["node", str(ROOT / "scripts/ladder-v2-nq/har800.mjs"), str(d)], check=True, cwd=ROOT)
    return pd.read_csv(d / f"{name}_har800.csv", parse_dates=["date"]).set_index("date")["sig"]


def build(sym, track):
    cfg, OUT = SYMS[sym], out_dir(sym)
    S = london_sessions(load_m1(sym, track, "unadj"))
    b, rv5, rv15, ext = ny_bars(load_m1(sym, track, "ratio"))
    pc1 = None
    if track == "C":
        ref = pd.DataFrame(json.loads((ROOT / f"analysis/output/ladder_candidates/d1/{cfg['ref']}.json").read_text()))
        ref.index = pd.to_datetime(ref.pop("d"))
        j = b.join(ref, how="inner")
        ok = np.isclose(j["open"], j["o"]) & np.isclose(j["high"], j["h"]) & np.isclose(j["low"], j["l"]) & np.isclose(j["close"], j["c"])
        pc1 = [int(ok.sum()), int(len(j))]
        say(f"positive control 1 ({sym} C bars vs JS nyCloseDailyBars): {ok.sum()}/{len(j)} = {ok.mean():.4f}")
        if ok.mean() < 0.99:
            raise SystemExit("positive control 1 FAILED")
    D = pd.DatetimeIndex(S.index)
    bb = b.reset_index(drop=True)
    for e in EST:
        s = pd.Series(V.ESTIMATORS[e](bb).astype(float), index=b.index)
        S["A0" if e == cfg["live"] else f"E_{e}"] = asof_before(D, s.dropna()) / V.SQRT252
    S["H8"] = asof_before(D, har800(sym, f"{sym}_{track}", b).dropna()) / V.SQRT252
    S["iv"] = asof_before(D, cboe(cfg["iv"])) if cfg["iv"] else np.nan
    if cfg["iv"]:
        S["V4"] = S["iv"] / V.SQRT252
    def lg(x, base):                                   # log with a floor at 1% of RV (a one-sided quiet day)
        return np.log(np.maximum(x, 0.01 * base))
    feats = {}
    for k, rv in ((5, rv5), (15, rv15)):
        lr = np.log(rv)
        feats[f"R{k}"] = (pd.DataFrame({"d1": lr, "d5": np.log(rv.rolling(5, min_periods=5).mean()),
                                        "d22": np.log(rv.rolling(22, min_periods=22).mean())}), lr)
    lr5 = np.log(rv5)
    feats["SHAR"] = (pd.DataFrame({"pos": lg(ext["rsp"], rv5), "neg": lg(ext["rsn"], rv5),
                                   "d5": np.log(rv5.rolling(5, min_periods=5).mean()),
                                   "d22": np.log(rv5.rolling(22, min_periods=22).mean())}), lr5)
    C = np.minimum(rv5, ext["bv"]).where(ext["bv"] > 0, rv5)
    J = (rv5 - C).clip(lower=0)
    feats["HARCJ"] = (pd.DataFrame({"c1": np.log(C), "c5": np.log(C.rolling(5, min_periods=5).mean()),
                                    "c22": np.log(C.rolling(22, min_periods=22).mean()), "j1": np.log1p(J / C)}), lr5)
    for name, (f, y) in feats.items():
        f = f.copy()
        f["y_next"] = y.shift(-1)
        f["next_date"] = pd.Series(b.index, index=b.index).shift(-1)
        f.to_parquet(OUT / f"rvfeat_{track}_{name}.parquet")
        for c in f.columns[:-2]:
            S[f"{name}_{c}"] = asof_before(D, f[c].dropna())
    # reported-only comparison targets: the NY-close day that contains session D (squared % return, GK variance in %^2)
    ret = np.log(b["close"]).diff() * 100
    gk = (0.5 * np.log(b["high"] / b["low"]) ** 2 - (2 * np.log(2) - 1) * np.log(b["close"] / b["open"]) ** 2) * 1e4
    S["r2_d"] = (ret ** 2).reindex(D).to_numpy()
    S["gk_d"] = gk.reindex(D).to_numpy()
    G, gparams = garch_sigmas(b)
    for c in G.columns:
        S[c] = asof_before(D, G[c].dropna())
    (OUT / f"garch_params_{track}.json").write_text(json.dumps(gparams, indent=1))
    S["date"] = S.index
    S = S.reset_index(drop=True)
    say(f"{sym} {track}: {len(S)} sessions {S['date'].min().date()} -> {S['date'].max().date()}")
    return S, pc1


# ================================================================ walk-forward + scoring
def fit_k(tr):
    x = tr["x"]; mu = x.mean()
    y = np.log(tr["hl"] / tr["A0"]); y = y - y.mean()
    z = x - mu; sd = float(z.std()); zs = z / sd
    return float((zs @ y) / (zs @ zs + 1.0)) / sd, mu


def walk_forward(S, sym, track, arms, years=YEARS, quiet=False):
    S = S.copy()
    if "V3" in arms:
        S["x"] = np.log(S["iv"] / V.SQRT252 / S["A0"])
    out = []
    for Y in years:
        start, end = pd.Timestamp(f"{Y}-01-01"), pd.Timestamp(f"{Y + 1}-01-01")
        W = S.copy()
        for name in [a for a in REG if a in arms]:
            f = pd.read_parquet(out_dir(sym) / f"rvfeat_{track}_{name}.parquet")
            cols = list(f.columns[:-2])
            f = f[np.isfinite(f[cols + ["y_next"]]).all(1) & (f["next_date"] < start)]
            X = np.column_stack([np.ones(len(f))] + [f[c] for c in cols])
            coef, *_ = np.linalg.lstsq(X, f["y_next"].to_numpy(), rcond=None)
            s2 = float(np.var(f["y_next"].to_numpy() - X @ coef))
            Xw = np.column_stack([np.ones(len(W))] + [W[f"{name}_{c}"] for c in cols])
            W[name] = np.sqrt(np.exp(Xw @ coef + s2 / 2)) * 100
        for g in [a for a in GARCH if a in arms]:
            W[g] = W[f"{g}@{Y}"]
        if "B_har_garcht" in arms:
            W["B_har_garcht"] = 0.5 * (W[har_col(sym)] + W["G_garch_t"])
        if "V3" in arms:
            ok = (W["date"] < start) & np.isfinite(W["x"]) & np.isfinite(W["A0"])
            kk, mu = fit_k(W[ok])
            W["V3"] = W["A0"] * np.exp(kk * (W["x"] - mu))
        if "B_har_iv" in arms:
            W["B_har_iv"] = 0.5 * (W[har_col(sym)] + W["V4"])
        tr = W[W["date"] < start]
        te = W[(W["date"] >= start) & (W["date"] < end)].copy()
        te["year"] = Y
        for a in arms:
            good = np.isfinite(tr[a]) & (tr[a] > 0)
            for q in QS:
                for t in TAUS:
                    m = V.fit_width_multiplier(tr.loc[good, a].to_numpy(), tr.loc[good, q].to_numpy(), t / 100)
                    te[f"{a}_{q}_{t}"] = m * te[a]
        out.append(te)
    T = pd.concat(out, ignore_index=True)
    cols = [f"{a}_{q}_{t}" for a in arms for q in QS for t in TAUS]
    n0 = len(T)
    T = T.dropna(subset=cols + ["rel"])
    if not quiet:
        say(f"  {track}: test rows {len(T)} (dropped {n0 - len(T)} with a missing arm or regime)")
    return T


def quintiles(T):
    edges = np.quantile(T["rel"], [0.2, 0.4, 0.6, 0.8])
    return np.searchsorted(edges, T["rel"].to_numpy())


def exceed(T, arms):
    R = np.stack([np.column_stack([(T[q] > T[f"{a}_{q}_{t}"]).to_numpy(float) for q, t in CELLS]) for a in arms], 1)
    U = np.stack([np.column_stack([(T[q] > T[f"{a}_{q}_{t}"]).to_numpy(float) for q in QS for t in TAUS]) for a in arms], 1)
    return R, U


def primary(R, Wq, idx):
    w = Wq[idx]; cnt = w.sum(0)
    rate = np.einsum("nk,nac->akc", w, R[idx]) / np.maximum(cnt, 1)[None, :, None]
    return np.abs(rate - TG6[None, None, :]).mean((1, 2)) * 100


def blocks(n, rng, block=BLOCK):
    nb = int(np.ceil(n / block))
    st = rng.integers(0, max(n - block, 1), size=(B, nb))
    return (st[:, :, None] + np.arange(block)[None, None, :]).reshape(B, -1)[:, :n]


def floor_dist(Wq, rng):
    cnt = Wq.sum(0).astype(np.int64)
    d = rng.binomial(cnt[None, :, None].repeat(B, 0).repeat(6, 2), TG6[None, None, :]) / cnt[None, :, None]
    return np.abs(d - TG6[None, None, :]).mean((1, 2)) * 100


def pinball(T, a):
    return sum(V.pinball_loss(T[q].to_numpy(), T[f"{a}_{q}_{t}"].to_numpy(), t / 100).mean()
               for q in ("hl", "oh", "ol") for t in TAUS)


def diff_ci(T, arms, elig, i0, rng, q=None):
    """90% CI of (winner re-selected in each block-bootstrap draw - A0), and the point PRIMARY per arm.
    q: quintile labels to use (halves keep the pooled edges, as registered); None = recut on these rows."""
    q = quintiles(T) if q is None else q
    Wq = np.eye(5)[q]; R, _ = exceed(T, arms)
    BI = blocks(len(T), rng)
    PB = np.array([primary(R, Wq, b) for b in BI])
    sel = np.argmin(PB + np.where(elig, 0, np.inf)[None, :], 1)
    d = PB[np.arange(B), sel] - PB[:, i0]
    return [float(np.quantile(d, 0.05)), float(np.quantile(d, 0.95))], primary(R, Wq, np.arange(len(T))), PB


def top_windows(T, k=4, w=63):
    """k non-overlapping 63-session windows with the highest mean realised HL (data-driven stress windows)."""
    x = T.sort_values("date").reset_index(drop=True)
    roll = x["hl"].rolling(w).mean().to_numpy()
    taken = np.zeros(len(x), bool); out = {}
    for i in np.argsort(-np.nan_to_num(roll, nan=-1)):
        if np.isnan(roll[i]) or taken[i - w + 1:i + 1].any():
            continue
        taken[i - w + 1:i + 1] = True
        a, b = x["date"].iloc[i - w + 1], x["date"].iloc[i]
        out[f"hi{len(out) + 1}_{a:%Y%m}"] = (str(a.date()), str(b.date()))
        if len(out) == k:
            break
    return out


def score_track(sym, T, track, arms, rng, flags):
    q = quintiles(T); Wq = np.eye(5)[q]
    R, U = exceed(T, arms); n = len(T)
    i0 = arms.index("A0")
    guard = np.abs(U.mean(0) - TG12[None, :]).mean(1) * 100
    elig = guard <= guard[i0] + 1.0
    pin = np.array([pinball(T, a) for a in arms]); pin = pin / pin[i0]
    ci, prim, PB = diff_ci(T, arms, elig, i0, rng)
    order = [i for i in np.argsort(prim) if elig[i]]
    win, run = order[0], order[1]
    dwr = PB[:, win] - PB[:, run]
    tie = np.quantile(dwr, 0.05) <= 0 <= np.quantile(dwr, 0.95)
    chosen = run if (tie and pin[run] < pin[win]) else win
    fl = floor_dist(Wq, rng)
    checks = {}
    for h, (y0, y1) in {"half 2018-22": (2018, 2022), "half 2023-26": (2023, 2026)}.items():
        m = ((T["year"] >= y0) & (T["year"] <= y1)).to_numpy()
        c, p, _ = diff_ci(T[m].reset_index(drop=True), arms, elig, i0, rng, q=q[m])
        checks[h] = {"n": int(m.sum()), "ci90": c, "chosen": float(p[chosen]), "A0": float(p[i0])}
    eps = dict(EPISODES); eps.update(top_windows(T))
    for e, (a, b) in eps.items():
        m = ((T["date"] >= a) & (T["date"] <= b)).to_numpy()
        c, p, _ = diff_ci(T[~m].reset_index(drop=True), arms, elig, i0, rng)
        checks[f"without {e}"] = {"n": int((~m).sum()), "window": [a, b], "ci90": c, "chosen": float(p[chosen]), "A0": float(p[i0])}
    if flags is not None:
        f = flags[flags["track"].isin([track, "CF"])]
        for lab, scr in (("fault flags out", FAULT), ("any flag out (descriptive)", None)):
            m = T["date"].isin(f["date"] if scr is None else f.loc[f["screen"].isin(scr), "date"]).to_numpy()
            c, p, _ = diff_ci(T[~m].reset_index(drop=True), arms, elig, i0, rng)
            checks[lab] = {"n": int((~m).sum()), "dropped": int(m.sum()), "ci90": c, "chosen": float(p[chosen]), "A0": float(p[i0])}
    reg = [k for k in checks if "descriptive" not in k]
    validated = ci[1] < 0 and all(checks[k]["ci90"][1] < 0 for k in reg)
    verdict = "VALIDATED" if validated else ("NULL" if ci[0] > -0.3 else "UNDERPOWERED")
    res = {"n": n, "dates": [str(T["date"].min().date()), str(T["date"].max().date())],
           "arms": {a: {"primary": float(prim[i]), "guard": float(guard[i]), "eligible": bool(elig[i]),
                        "pinball_vs_A0": float(pin[i])} for i, a in enumerate(arms)},
           "winner": arms[win], "runner_up": arms[run], "tie": bool(tie), "chosen": arms[chosen],
           "chosen_minus_A0_ci90_reselected": ci, "checks": checks,
           "floor_median": float(np.median(fl)), "floor_p90": float(np.quantile(fl, 0.9)),
           "chosen_calibrated_to_noise": bool(prim[chosen] <= np.quantile(fl, 0.9)), "verdict": verdict}
    by_q = {}
    for a in dict.fromkeys(["A0", arms[chosen], arms[win], "H8"]):
        k = arms.index(a)
        by_q[a] = [[float(R[q == j, k, 0].mean() * 100), float(R[q == j, k, 1].mean() * 100)] for j in range(5)]
    res["hl75_hl90_by_quintile"] = by_q
    res["hl75_hl90_by_year"] = {a: {int(y): [float((g["hl"] > g[f"{a}_hl_75"]).mean() * 100),
                                             float((g["hl"] > g[f"{a}_hl_90"]).mean() * 100)] for y, g in T.groupby("year")}
                                for a in by_q}
    sl = {}
    for a in arms:
        x = np.log(T[a]) - np.log(T[a]).mean(); y = np.log(T["hl"]) - np.log(T["hl"]).mean()
        sl[a] = float((x * y).sum() / (x * x).sum())
    res["slope"] = sl
    if "r2_d" in T:                                   # reported, no rule (gold A2): her race's yardsticks
        ok = np.isfinite(T["r2_d"]) & np.isfinite(T["gk_d"])
        qm = {}
        for a in arms:
            h = T.loc[ok, a].to_numpy() ** 2
            ql = float(np.mean(np.log(h) + T.loc[ok, "r2_d"].to_numpy() / h))
            y = T.loc[ok, "gk_d"].to_numpy(); X = np.column_stack([np.ones(len(h)), h])
            c, *_ = np.linalg.lstsq(X, y, rcond=None)
            r2 = float(1 - np.var(y - X @ c) / np.var(y))
            qm[a] = {"qlike": ql, "mz_r2_gk": r2}
        res["qlike_mz"] = qm
        say("  reported only: QLIKE vs squared NY-day return (lower better) / MZ R2 on GK variance (higher better)")
        for a in sorted(qm, key=lambda k: qm[k]["qlike"]):
            say(f"    {a:14} {qm[a]['qlike']:.4f}  {qm[a]['mz_r2_gk']:.3f}")
    say(f"\n== {sym} {track}: {n} test sessions {res['dates'][0]} -> {res['dates'][1]}   noise floor median "
        f"{res['floor_median']:.2f}pp, p90 {res['floor_p90']:.2f}pp   (block {BLOCK})")
    say(f"  {'arm':14} {'PRIMARY':>8} {'GUARD':>7} {'pinball':>8} {'slope':>6}")
    for i in np.argsort(prim):
        a = arms[i]; r = res["arms"][a]
        say(f"  {a:14} {r['primary']:8.2f} {r['guard']:6.2f}{'' if r['eligible'] else '*'} {r['pinball_vs_A0']:8.4f} {sl[a]:6.2f}")
    say(f"  winner {res['winner']}, runner-up {res['runner_up']}, tie={res['tie']}, chosen {res['chosen']}; "
        f"chosen - A0 CI [{ci[0]:+.2f}, {ci[1]:+.2f}]pp; calibrated to noise {res['chosen_calibrated_to_noise']}")
    for k, v in checks.items():
        say(f"    {k:34} n={v['n']:5}  chosen {v['chosen']:.2f} vs A0 {v['A0']:.2f}  CI [{v['ci90'][0]:+.2f},{v['ci90'][1]:+.2f}]"
            f"{'' if 'descriptive' in k or v['ci90'][1] < 0 else '  <-- FAILS'}")
    for a, rows in by_q.items():
        say(f"  HL>p75/p90 by quintile {a:14}: " + "  ".join(f"Q{j + 1} {r[0]:4.1f}/{r[1]:4.1f}" for j, r in enumerate(rows)))
    say(f"  VERDICT {sym} {track}: {verdict}")
    return res


def mirror(sym, S, track, rng, draws=20):
    """Regime-free placebo: each test year's realised (hl, oc, oh, ol) = sigma_A0 x a random day's ratio vector drawn
    from exactly the rows the lines are fitted on (rows before that year, earlier test years already mirrored).
    Repeated `draws` times; A0 should sit near the noise floor and show no quintile tilt."""
    prim, tilt = [], []
    for _ in range(draws):
        P = S.copy()
        for Y in YEARS:
            start, end = pd.Timestamp(f"{Y}-01-01"), pd.Timestamp(f"{Y + 1}-01-01")
            tr = P[(P["date"] < start) & np.isfinite(P["A0"]) & (P["A0"] > 0)]
            ratio = tr[list(QS)].to_numpy() / tr["A0"].to_numpy()[:, None]
            m = ((P["date"] >= start) & (P["date"] < end)).to_numpy()
            P.loc[m, list(QS)] = ratio[rng.integers(0, len(ratio), m.sum())] * P.loc[m, "A0"].to_numpy()[:, None]
        T = walk_forward(P, sym, track, ["A0"], quiet=True)
        q = quintiles(T); Wq = np.eye(5)[q]; R, _ = exceed(T, ["A0"])
        prim.append(float(primary(R, Wq, np.arange(len(T)))[0]))
        tilt.append(float((R[q == 0, 0, 0].mean() - R[q == 4, 0, 0].mean()) * 100))
    fl = floor_dist(Wq, rng)
    out = {"draws": draws, "A0_primary_median": float(np.median(prim)), "A0_primary_range": [min(prim), max(prim)],
           "hl75_q1_minus_q5_median": float(np.median(tilt)), "hl75_q1_minus_q5_range": [min(tilt), max(tilt)],
           "floor_median": float(np.median(fl)), "floor_p90": float(np.quantile(fl, 0.9))}
    say(f"  MIRROR {track} ({draws} draws): A0 primary median {out['A0_primary_median']:.2f}pp "
        f"[{min(prim):.2f}, {max(prim):.2f}] vs floor median {out['floor_median']:.2f} / p90 {out['floor_p90']:.2f}; "
        f"HL>p75 Q1-Q5 median {out['hl75_q1_minus_q5_median']:+.1f}pp [{min(tilt):+.1f}, {max(tilt):+.1f}]")
    return out


def c_vs_f(sym, rng):
    OUT = out_dir(sym)
    C = pd.read_parquet(OUT / "rows_C.parquet").set_index("date")
    F = pd.read_parquet(OUT / "rows_F.parquet").set_index("date")
    J = C[["hl", "oh", "ol"]].join(F[["hl", "oh", "ol"]], lsuffix="_c", rsuffix="_f", how="inner").dropna()
    n = len(J); BI = blocks(n, rng)
    out, same = {}, True
    for qn in ("hl", "oh", "ol"):
        for p in (50, 75):
            f = lambda idx: np.percentile(J[f"{qn}_f"].to_numpy()[idx], p) / np.percentile(J[f"{qn}_c"].to_numpy()[idx], p)
            pt = f(np.arange(n)); bs = np.array([f(b) for b in BI])
            ci = [float(np.quantile(bs, 0.05)), float(np.quantile(bs, 0.95))]
            ok = 0.97 <= pt <= 1.03 and ci[0] >= 0.95 and ci[1] <= 1.05
            same &= ok
            out[f"{qn}_p{p}"] = {"ratio": float(pt), "ci90": ci, "ok": bool(ok)}
    say(f"\n== {sym} C vs F on {n} common London dates: F/C ratio (90% CI)")
    for k, v in out.items():
        say(f"  {k:7} {v['ratio']:.4f} [{v['ci90'][0]:.4f}, {v['ci90'][1]:.4f}] {'ok' if v['ok'] else 'OUTSIDE'}")
    say(f"  -> {'SAME (F reuses the C spec)' if same else 'DIFFERENT (F keeps its own winner)'}")
    return {"n": n, "ratios": out, "same": bool(same)}


def positive_control(rng):
    """Synthetic GARCH(1,1) with known sigma (NQ prereg A1). True sigma within the floor; rv10 tilt Q1-Q5 >= 5pp."""
    n, (om, al, be) = 2600, (0.02, 0.08, 0.90)
    var = np.empty(n); r = np.empty(n); var[0] = om / (1 - al - be)
    for i in range(n):
        if i:
            var[i] = om + al * r[i - 1] ** 2 + be * var[i - 1]
        r[i] = np.sqrt(var[i]) * rng.standard_normal()
    sig = np.sqrt(var)
    hl, oh, ol, oc = (np.empty(n) for _ in range(4))
    for i in range(n):
        p = np.concatenate([[0], np.cumsum(rng.standard_normal(1320)) * sig[i] / np.sqrt(1320)])
        hl[i], oh[i], ol[i], oc[i] = p.max() - p.min(), p.max(), -p.min(), abs(p[-1])
    dates = pd.bdate_range("2016-01-04", periods=n)
    S = pd.DataFrame({"date": dates, "hl": hl, "oc": oc, "oh": oh, "ol": ol, "TRUE": sig,
                      "A0": pd.Series(r).rolling(10).std().shift(1).to_numpy()})
    S["rel"] = S["A0"] / S["A0"].rolling(250, min_periods=60).median().shift(1)
    T = walk_forward(S, "PC2", "PC2", ["A0", "TRUE"], years=range(2018, int(dates[-1].year) + 1))
    q = quintiles(T); Wq = np.eye(5)[q]; R, _ = exceed(T, ["A0", "TRUE"])
    p = primary(R, Wq, np.arange(len(T))); fl = np.quantile(floor_dist(Wq, rng), 0.9)
    a0q = [R[q == j, 0, 0].mean() * 100 for j in range(5)]
    ok = p[1] <= fl and a0q[0] - a0q[4] >= 5
    say(f"positive control 2: TRUE {p[1]:.2f}pp vs floor p90 {fl:.2f}; rv10 Q1-Q5 {a0q[0] - a0q[4]:+.1f}pp -> {'ok' if ok else 'FAIL'}")
    return {"true_primary": float(p[1]), "floor_p90": float(fl), "rv10_q1_minus_q5": float(a0q[0] - a0q[4]), "pass": bool(ok)}


# ================================================================ main
def cmd_build(sym):
    OUT = out_dir(sym); OUT.mkdir(parents=True, exist_ok=True)
    pcs = {}
    for t in ("C", "F"):
        S, pc1 = build(sym, t)
        S.to_parquet(OUT / f"rows_{t}.parquet")
        if pc1:
            pcs["positive_control_1"] = pc1
    (OUT / "build.json").write_text(json.dumps(pcs))
    (OUT / "build.txt").write_text("\n".join(LOG) + "\n")


def cmd_score(sym):
    OUT = out_dir(sym); rng = np.random.default_rng(SEED); arms = arms_for(sym)
    flags_p = ROOT / f"analysis/output/data_screens/{sym}/flags.csv"
    flags = pd.read_csv(flags_p, parse_dates=["date"]) if flags_p.exists() else None
    say(f"{sym}: arms {arms}; flags {'from ' + str(flags_p.relative_to(ROOT)) if flags is not None else 'MISSING'}")
    pc = positive_control(rng)
    if not pc["pass"]:
        raise SystemExit("positive control 2 FAILED: nothing scored")
    files = [m1_paths(sym, "C"), m1_paths(sym, "F", "unadj"), m1_paths(sym, "F", "ratio"),
             OUT / "rows_C.parquet", OUT / "rows_F.parquet"] + ([flags_p] if flags is not None else [])
    res = {"symbol": sym, "seed": SEED, "B": B, "block": BLOCK, "arms": arms, "positive_control_2": pc,
           "build": json.loads((OUT / "build.json").read_text()),
           "input_sha256": input_hashes([rel(f) for f in files])}
    for track in ("C", "F"):
        S = pd.read_parquet(OUT / f"rows_{track}.parquet")
        S["rel"] = S["A0"] / S["A0"].rolling(250, min_periods=60).median().shift(1)
        T = walk_forward(S, sym, track, arms)
        T.to_parquet(OUT / f"test_{track}.parquet")
        res[track] = score_track(sym, T, track, arms, rng, flags)
        res[track]["mirror"] = mirror(sym, S, track, rng)
    res["c_vs_f"] = c_vs_f(sym, rng)
    res["same_winner_both_tracks"] = res["C"]["chosen"] == res["F"]["chosen"]
    (OUT / "results.json").write_text(json.dumps(res, indent=1))
    (OUT / "report.txt").write_text("\n".join(LOG) + "\n")


if __name__ == "__main__":
    {"build": cmd_build, "score": cmd_score}[sys.argv[1]](sys.argv[2].upper())
