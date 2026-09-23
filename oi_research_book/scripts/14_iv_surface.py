#!/usr/bin/env python3
"""Invert the raw CME chains' `settlement` premiums into a daily implied-vol
history (Black-76), one small parquet per instrument. See
oi_research_book/IV_FORECAST_PREREG.md for the frozen construction.

    python oi_research_book/scripts/14_iv_surface.py [PAIR ...]

Reads  OI Data/<PAIR>.csv
Writes oi_research_book/data/iv_daily_<pair>.parquet
  date, F_front, dte_front, iv_front, iv30, iv90, rr25_30, bf25_30, n_exp
"""
import sys
import numpy as np
import pandas as pd
from scipy.stats import norm
from pair_config import PAIR_CONFIG, cfg

RAW_DIR = "OI Data"
OUTDIR = "oi_research_book/data"
MIN_DTE = 5                 # an expiry closer than this is too noisy to read vol from
SETTLE_HOUR_UTC = 20        # CME FX/equity option settlement is ~19:00-20:00 UTC


def black76(F, K, T, sig, is_call):
    s = sig * np.sqrt(T)
    d1 = (np.log(F / K) + 0.5 * s * s) / s
    d2 = d1 - s
    c = F * norm.cdf(d1) - K * norm.cdf(d2)
    return np.where(is_call, c, c - (F - K)), d1


def invert(price, F, K, T, is_call):
    """Vectorised bisection on undiscounted premium. NaN where the price is
    below intrinsic+epsilon or above the no-arbitrage cap."""
    lo = np.full(price.shape, 1e-3)
    hi = np.full(price.shape, 3.0)
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        p, _ = black76(F, K, T, mid, is_call)
        up = p < price
        lo = np.where(up, mid, lo)
        hi = np.where(up, hi, mid)
    iv = 0.5 * (lo + hi)
    iv[(iv < 2e-3) | (iv > 2.9)] = np.nan
    return iv


def per_expiry(g):
    """g: one (date, expiry) slice with columns strike, C, P, T. Returns F, D,
    atm, c25, p25 or None."""
    both = g.dropna(subset=["C", "P"])
    if len(both) < 3:
        return None
    both = both.assign(cmp=both["C"] - both["P"])
    near = both.iloc[np.argsort(np.abs(both["cmp"].values))[:6]]
    if len(near) >= 3 and near["strike"].nunique() >= 3:
        b, a = np.polyfit(near["strike"].values, near["cmp"].values, 1)
        D = float(np.clip(-b, 0.90, 1.00))
    else:
        D = 1.0
    F = float(np.median(near["strike"].values[:4] + near["cmp"].values[:4] / D))
    if not np.isfinite(F) or F <= 0:
        return None
    return F, D


def invert_chain(pair):
    """Per-strike OTM implied vols in CME-NATIVE strike terms (not inverted for
    USDJPY/CAD/CHF). Columns: date, expiry, strike, T, F, D, is_call, iv, delta, k."""
    print(f"[{pair}] loading", flush=True)
    df = pd.read_csv(f"{RAW_DIR}/{pair}.csv", usecols=["date", "expiry", "strike", "right", "settlement"])
    df = df[df["settlement"] > 0]
    df["date"] = pd.to_datetime(df["date"])
    df["expiry"] = pd.to_datetime(df["expiry"], utc=True).dt.tz_localize(None)
    t0 = df["date"] + pd.Timedelta(hours=SETTLE_HOUR_UTC)
    df["T"] = (df["expiry"] - t0).dt.total_seconds() / (365.0 * 86400)
    df = df[(df["T"] * 365 >= MIN_DTE) & (df["T"] <= 1.1)]
    # a strike can appear under >1 series on the same expiry -- median it
    wide = (df.pivot_table(index=["date", "expiry", "strike"], columns="right",
                           values="settlement", aggfunc="median").reset_index())
    wide["T"] = ((wide["expiry"] - (wide["date"] + pd.Timedelta(hours=SETTLE_HOUR_UTC)))
                 .dt.total_seconds() / (365.0 * 86400))
    print(f"[{pair}] {wide[['date','expiry']].drop_duplicates().shape[0]} date-expiry slices", flush=True)

    # 1) forward + discount per slice
    fwd = {}
    for key, g in wide.groupby(["date", "expiry"], sort=False):
        r = per_expiry(g)
        if r:
            fwd[key] = r
    fd = pd.DataFrame([(k[0], k[1], v[0], v[1]) for k, v in fwd.items()],
                      columns=["date", "expiry", "F", "D"])
    w = wide.merge(fd, on=["date", "expiry"])

    # 2) OTM options only, within a generous log-moneyness band
    band = 0.45 if pair == "NAS100_USD" else 0.20
    k = np.log(w["strike"] / w["F"])
    call_side = w["strike"] >= w["F"]
    w["price"] = np.where(call_side, w["C"], w["P"]) / w["D"]
    w["is_call"] = call_side
    w = w[(np.abs(k) <= band) & w["price"].notna()].copy()
    w = w[w["price"] / w["F"] >= 2e-5]           # below this, tick rounding dominates
    w["iv"] = invert(w["price"].values, w["F"].values, w["strike"].values, w["T"].values, w["is_call"].values)
    w = w.dropna(subset=["iv"])
    s = w["iv"] * np.sqrt(w["T"])
    d1 = (np.log(w["F"] / w["strike"]) + 0.5 * s * s) / s
    w["delta"] = np.where(w["is_call"], norm.cdf(d1), norm.cdf(d1) - 1)
    w["k"] = np.log(w["strike"] / w["F"])
    print(f"[{pair}] inverted {len(w):,} OTM options", flush=True)
    return w


def build(pair):
    c = cfg(pair)
    w = invert_chain(pair)

    # 3) per-expiry smile summary
    rows = []
    for (date, expiry), g in w.groupby(["date", "expiry"], sort=False):
        g = g.sort_values("k")
        below, above = g[g["k"] < 0], g[g["k"] >= 0]
        if below.empty or above.empty:
            continue
        b, a = below.iloc[-1], above.iloc[0]
        atm = b["iv"] + (a["iv"] - b["iv"]) * (0 - b["k"]) / (a["k"] - b["k"]) if a["k"] != b["k"] else a["iv"]
        calls = g[g["is_call"]].sort_values("delta")          # delta ascending
        puts = g[~g["is_call"]].sort_values("delta")          # -0.5 .. 0 ascending
        c25 = np.interp(0.25, calls["delta"], calls["iv"]) if len(calls) >= 2 and calls["delta"].min() <= 0.25 <= calls["delta"].max() else np.nan
        p25 = np.interp(-0.25, puts["delta"], puts["iv"]) if len(puts) >= 2 and puts["delta"].min() <= -0.25 <= puts["delta"].max() else np.nan
        rows.append((date, expiry, g["T"].iloc[0], g["F"].iloc[0], atm, c25, p25))
    ex = pd.DataFrame(rows, columns=["date", "expiry", "T", "F", "atm", "c25", "p25"])
    ex["rr"] = ex["c25"] - ex["p25"]
    ex["bf"] = 0.5 * (ex["c25"] + ex["p25"]) - ex["atm"]
    if c["inverted"]:
        ex["rr"] = -ex["rr"]           # calls on JPY are puts on USD/JPY
        ex["F"] = 1.0 / ex["F"]

    # 4) constant-maturity per date
    def cm(g, days, col):
        g = g.dropna(subset=[col]).sort_values("T")
        if g.empty:
            return np.nan
        tgt = days / 365.0
        if col == "atm":
            v = g[col] ** 2 * g["T"]                         # total variance
            if tgt <= g["T"].iloc[0]:
                return g[col].iloc[0]
            if tgt >= g["T"].iloc[-1]:
                return g[col].iloc[-1]
            tv = np.interp(tgt, g["T"], v)
            return np.sqrt(tv / tgt)
        return float(np.interp(tgt, g["T"], g[col]))

    out = []
    for date, g in ex.groupby("date"):
        g = g.sort_values("T")
        f = g.iloc[0]
        out.append({
            "date": date, "F_front": f["F"], "dte_front": f["T"] * 365, "iv_front": f["atm"],
            "iv30": cm(g, 30, "atm"), "iv90": cm(g, 90, "atm"),
            "rr25_30": cm(g, 30, "rr"), "bf25_30": cm(g, 30, "bf"), "n_exp": len(g),
        })
    res = pd.DataFrame(out).sort_values("date").reset_index(drop=True)
    path = f"{OUTDIR}/iv_daily_{pair.lower()}.parquet"
    res.to_parquet(path)
    print(f"[{pair}] {len(res)} days -> {path}\n{res.describe().T[['mean','50%','min','max']]}", flush=True)
    return res


if __name__ == "__main__":
    pairs = sys.argv[1:] or list(PAIR_CONFIG)
    for p in pairs:
        build(p)
