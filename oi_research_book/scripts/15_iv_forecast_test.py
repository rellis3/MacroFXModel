#!/usr/bin/env python3
"""Run the frozen tests in oi_research_book/IV_FORECAST_PREREG.md against the
IV histories built by 14_iv_surface.py.

    python oi_research_book/scripts/15_iv_forecast_test.py

Writes oi_research_book/data/results/iv_forecast_results.json
"""
import io
import json
import urllib.request
import numpy as np
import pandas as pd
from scipy.stats import norm, spearmanr
from pair_config import PAIR_CONFIG

PRICE = {
    "EUR_USD": "eurusd", "GBP_USD": "gbpusd", "AUD_USD": "audusd", "USD_CAD": "usdcad",
    "USD_CHF": "usdchf", "USD_JPY": "usdjpy", "NAS100_USD": "nas100_usd",
}
BURN_IN = 500
REFIT = 21


def load_d1(pair):
    d = pd.read_parquet(f"Oanda Parquet Files/{PRICE[pair]}_d1.parquet").reset_index()
    d = d.rename(columns={"datetime": "date"})
    d["date"] = pd.to_datetime(d["date"]).dt.tz_localize(None).dt.normalize()
    d = d.sort_values("date").reset_index(drop=True)
    d["r"] = np.log(d["close"] / d["close"].shift(1))
    d["pk"] = np.log(d["high"] / d["low"]) ** 2 / (4 * np.log(2))       # Parkinson daily variance
    d["har_d"] = np.log(d["pk"] + 1e-12)
    d["har_w"] = np.log(d["pk"].rolling(5).mean() + 1e-12)
    d["har_m"] = np.log(d["pk"].rolling(22).mean() + 1e-12)
    d["rv22"] = np.sqrt(d["r"].pow(2).rolling(22).mean() * 252)
    return d


def alignment(iv, d1):
    """V2: which D1 bar does an option date's settlement belong to?"""
    m = d1[["date", "close"]].reset_index().rename(columns={"index": "bar"})
    x = iv.merge(m, on="date", how="inner")
    same_exp = x["dte_front"].diff() < 0
    dF = np.log(x["F_front"]).diff()
    out = {}
    for s in (-1, 0, 1):
        bars = x["bar"] + s
        ok = (bars >= 1) & (bars < len(d1))
        dc = pd.Series(np.nan, index=x.index)
        dc[ok] = d1["r"].values[bars[ok]]
        v = same_exp & dF.notna() & dc.notna()
        out[s] = float(np.corrcoef(dF[v], dc[v])[0, 1])
    return out


def nw_mean_t(d, lag):
    d = np.asarray(d, float)
    d = d[np.isfinite(d)]
    n, mu = len(d), d.mean()
    e = d - mu
    s = e @ e / n
    for L in range(1, lag + 1):
        s += 2 * (1 - L / (lag + 1)) * (e[L:] @ e[:-L]) / n
    return mu / np.sqrt(s / n), n


def oos(df, ycol, feats_a, feats_c):
    """Expanding-window OLS, refit every REFIT rows after BURN_IN. Returns
    squared errors for model A and model C on the same rows."""
    df = df.dropna(subset=[ycol] + feats_c).reset_index(drop=True)
    ea, ec, eb = [], [], []
    for start in range(BURN_IN, len(df), REFIT):
        tr, te = df.iloc[:start], df.iloc[start:start + REFIT]
        # training rows whose forward window overlaps the test block are dropped
        tr = tr.iloc[:max(0, len(tr) - 21)]
        for feats, sink in ((feats_a, ea), (feats_c, ec), (["log_iv"], eb)):
            X = np.column_stack([np.ones(len(tr))] + [tr[f] for f in feats])
            beta, *_ = np.linalg.lstsq(X, tr[ycol].values, rcond=None)
            Xt = np.column_stack([np.ones(len(te))] + [te[f] for f in feats])
            sink.extend((te[ycol].values - Xt @ beta) ** 2)
    return np.array(ea), np.array(ec), np.array(eb)


def run_pair(pair):
    iv = pd.read_parquet(f"oi_research_book/data/iv_daily_{pair.lower()}.parquet")
    iv["date"] = pd.to_datetime(iv["date"]).dt.normalize()
    d1 = load_d1(pair)
    al = alignment(iv, d1)
    L = max(al, key=al.get)

    m = d1.reset_index().rename(columns={"index": "bar"})
    x = iv.merge(m[["date", "bar"]], on="date", how="inner")
    x["bar"] = x["bar"] + L
    x = x[(x["bar"] >= 0) & (x["bar"] < len(d1))]
    x = x.merge(d1.reset_index().rename(columns={"index": "bar"}).drop(columns="date"), on="bar")
    r = d1["r"].values
    n = len(d1)

    def fwd(b, h, fn):
        return fn(r[b + 1:b + 1 + h]) if b + h < n else np.nan

    x["y21"] = [fwd(b, 21, lambda a: np.log(np.sqrt(252 * np.mean(a ** 2)))) for b in x["bar"]]
    nh, nl, nc = d1["high"].shift(-1).values, d1["low"].shift(-1).values, d1["close"].values
    rng = (nh[x["bar"]] - nl[x["bar"]]) / nc[x["bar"]]
    # a zero-range bar (one NAS100 holiday print) is not a vol observation
    x["y1"] = np.log(np.where(rng > 0, rng, np.nan))
    x["r_next"] = [r[b + 1] if b + 1 < n else np.nan for b in x["bar"]]
    x["ret5_fwd"] = [fwd(b, 5, np.sum) for b in x["bar"]]
    x["ret21_fwd"] = [fwd(b, 21, np.sum) for b in x["bar"]]
    x["log_iv"] = np.log(x["iv30"])
    x["log_ivf"] = np.log(x["iv_front"])
    har = ["har_d", "har_w", "har_m"]

    res = {"pair": pair, "n_days": int(len(x)), "alignment_corr": al, "shift": L,
           "span": [str(x["date"].min().date()), str(x["date"].max().date())]}

    # H1 -- 21-bar forward realized vol
    ea, ec, eb = oos(x, "y21", har, har + ["log_iv"])
    t, nn = nw_mean_t(ea - ec, 21)
    res["H1"] = {"mse_har": float(ea.mean()), "mse_har_iv": float(ec.mean()), "mse_iv_only": float(eb.mean()),
                 "improve_pct": float(100 * (1 - ec.mean() / ea.mean())),
                 "dm_t": float(t), "dm_p_one_sided": float(1 - norm.cdf(t)), "n_oos": int(nn)}

    # H2 -- next-bar log range
    x["log_iv2"] = x["log_ivf"]
    ea, ec, eb = oos(x, "y1", har, har + ["log_iv", "log_iv2"])
    t, nn = nw_mean_t(ea - ec, 1)
    res["H2"] = {"mse_har": float(ea.mean()), "mse_har_iv": float(ec.mean()), "mse_iv_only": float(eb.mean()),
                 "improve_pct": float(100 * (1 - ec.mean() / ea.mean())),
                 "dm_t": float(t), "dm_p_one_sided": float(1 - norm.cdf(t)), "n_oos": int(nn)}

    # H3 -- calibration of a +/-1 sigma IV expected-move line
    sig1 = x["iv30"] / np.sqrt(252)
    v = x["r_next"].notna()
    raw_cov = float((x.loc[v, "r_next"].abs() <= sig1[v]).mean())
    scale = (np.sqrt(x["r"].pow(2).rolling(252).mean()) / sig1.rolling(252).mean()).shift(1)
    vv = v & scale.notna()
    sc_cov = float((x.loc[vv, "r_next"].abs() <= (sig1 * scale)[vv]).mean())
    res["H3"] = {"coverage_raw": raw_cov, "coverage_rescaled": sc_cov,
                 "median_realized_over_implied": float(scale.median()), "target": 0.683}

    # H4 -- direction, expected null. Non-overlapping samples for honest t-stats.
    x["drr5"] = x["rr25_30"] - x["rr25_30"].shift(5)
    s5 = x.iloc[::5].dropna(subset=["drr5", "ret5_fwd"])
    ic5 = spearmanr(s5["drr5"], s5["ret5_fwd"]).correlation
    x["vrp"] = x["iv30"] - x["rv22"]
    s21 = x.iloc[::21].dropna(subset=["vrp", "ret21_fwd"])
    ic21 = spearmanr(s21["vrp"], s21["ret21_fwd"]).correlation
    res["H4"] = {"rr_chg5_ic": float(ic5), "rr_n": int(len(s5)), "rr_t": float(ic5 * np.sqrt(len(s5) - 2) / np.sqrt(1 - ic5 ** 2)),
                 "vrp_ic": float(ic21), "vrp_n": int(len(s21)), "vrp_t": float(ic21 * np.sqrt(len(s21) - 2) / np.sqrt(1 - ic21 ** 2))}

    # descriptive
    res["desc"] = {"iv30_median": float(x["iv30"].median()), "rv22_median": float(x["rv22"].median()),
                   "vrp_positive_share": float((x["vrp"] > 0).mean()),
                   "corr_iv30_y21": float(x[["log_iv", "y21"]].corr().iloc[0, 1]),
                   "corr_harm_y21": float(x[["har_m", "y21"]].corr().iloc[0, 1])}
    return res, x


def vxn_gate(x_nq):
    raw = urllib.request.urlopen("https://cdn.cboe.com/api/global/us_indices/daily_prices/VXN_History.csv", timeout=30).read()
    v = pd.read_csv(io.BytesIO(raw))
    v["date"] = pd.to_datetime(v["DATE"], format="%m/%d/%Y")
    j = x_nq.merge(v[["date", "CLOSE"]], on="date")
    lvl = float(np.corrcoef(j["iv30"], j["CLOSE"])[0, 1])
    chg = float(np.corrcoef(j["iv30"].diff().dropna(), j["CLOSE"].diff().dropna())[0, 1])
    return {"n": int(len(j)), "level_corr": lvl, "change_corr": chg,
            "median_ratio_ours_over_vxn": float((100 * j["iv30"] / j["CLOSE"]).median()), "pass": lvl >= 0.85}


if __name__ == "__main__":
    out, frames = {}, {}
    for p in PAIR_CONFIG:
        res, x = run_pair(p)
        out[p], frames[p] = res, x
        h1, h2 = res["H1"], res["H2"]
        print(f"{p:11s} shift={res['shift']:+d} align={res['alignment_corr']} | "
              f"H1 {h1['improve_pct']:+5.1f}% p={h1['dm_p_one_sided']:.3f} | "
              f"H2 {h2['improve_pct']:+5.1f}% p={h2['dm_p_one_sided']:.3f} | "
              f"H3 cov {res['H3']['coverage_raw']:.3f}/{res['H3']['coverage_rescaled']:.3f} | "
              f"H4 rr t={res['H4']['rr_t']:+.2f} vrp t={res['H4']['vrp_t']:+.2f}", flush=True)
    out["V1_vxn"] = vxn_gate(frames["NAS100_USD"])
    print("V1", out["V1_vxn"])
    for h in ("H1", "H2"):
        wins = sum(out[p][h]["improve_pct"] > 0 for p in PAIR_CONFIG)
        sig = sum(out[p][h]["dm_p_one_sided"] < 0.05 for p in PAIR_CONFIG)
        out[f"{h}_verdict"] = {"beats_har": wins, "dm_sig": sig, "PASS": wins >= 5 and sig >= 4}
        print(h, out[f"{h}_verdict"])
    with open("oi_research_book/data/results/iv_forecast_results.json", "w") as f:
        json.dump(out, f, indent=2)
