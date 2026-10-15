#!/usr/bin/env python3
"""Build the five NQ GEX surfaces (and the two wall pickers) frozen in RIPPLE_BOOK_PREREG.md.

    S0 day book (shortest-DTE expiry with >=500 contracts within +-3% of spot)   S1 DTE<=3   S2 DTE<=7   S3 DTE<=45   S4 all expiries

Gamma is each contract's own (own time-to-expiry, assumed IV = trailing rv20, multiplier 20) — script 01's formula, unchanged, so S3 and S4 are
the old `near` / `all` surfaces up to the lockbox cut. Window ends 2026-08-21 (lockbox). Writes
    oi_research_book/data/ripple_book_nq.parquet    one row per date: spot, rv20, fwd range, gex_S0..S4, abs_S0..S4, day_dte
    oi_research_book/data/ripple_walls_nq.parquet   one row per date: W_oi_call/put (S1 max OI), W_rip_call/put (S4 max |gamma|), +-2.5% of spot

    .venv/Scripts/python.exe oi_research_book/scripts/22_ripple_surfaces.py
"""
import numpy as np
import pandas as pd
from pathlib import Path
from scipy.stats import norm

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
CUTOFF = pd.Timestamp("2026-08-21")        # lockbox: nothing later is scored
CONTRACT_MULT = 20
NEAR_MONEY, MIN_NM_OI = 0.03, 500.0
WALL_BAND = 0.025


def bs_gamma(spot, strike, sigma, t_years):          # identical to 01_build_daily_dataset.bs_gamma
    t_years = np.maximum(t_years, 1 / 365)
    sigma = np.maximum(sigma, 1e-4)
    d1 = (np.log(spot / strike) + 0.5 * sigma ** 2 * t_years) / (sigma * np.sqrt(t_years))
    return norm.pdf(d1) / (spot * sigma * np.sqrt(t_years))


def main():
    c = pd.read_parquet(DATA / "cache" / "contract_level_ffilled_nas100_usd.parquet")
    dm = pd.read_parquet(DATA / "daily_master_near_nas100_usd.parquet")
    dm["date"] = pd.to_datetime(dm["date"]).dt.tz_localize(None)
    dm = dm[dm["date"] <= CUTOFF][["date", "close", "high", "low", "rv20_ann", "atr14", "fwd_hi_1d", "fwd_lo_1d"]].rename(columns={"close": "spot"})
    n0 = len(c)
    c["date"] = pd.to_datetime(c["date"]).dt.tz_localize(None)
    c = c[(c["date"] <= CUTOFF) & c["effective_oi"].notna() & (c["effective_oi"] > 0)].merge(dm[["date", "spot", "rv20_ann"]], on="date", how="inner")
    print(f"contract rows {n0:,} -> {len(c):,} (<= {CUTOFF.date()}, OI>0, joined to price)")
    c["dte"] = (pd.to_datetime(c["expiry"]).dt.tz_localize(None).dt.normalize() - c["date"]).dt.days
    c = c[c["dte"] >= 0].copy()
    sigma = c["rv20_ann"].fillna(c["rv20_ann"].median())
    c["gamma"] = bs_gamma(c["spot"].values, c["strike"].values, sigma.values, c["dte"].values / 365.0)
    c["gex"] = np.where(c["right"] == "C", 1.0, -1.0) * c["effective_oi"] * c["gamma"] * CONTRACT_MULT * c["spot"]

    # ---- S0: the day book -------------------------------------------------------------------------------------------
    nm = c[(c["strike"] / c["spot"] - 1).abs() <= NEAR_MONEY]
    nm_oi = nm.groupby(["date", "expiry", "dte"], observed=True)["effective_oi"].sum().reset_index()
    nm_oi = nm_oi[nm_oi["effective_oi"] >= MIN_NM_OI]
    day_dte = nm_oi.groupby("date")["dte"].min().rename("day_dte")
    c = c.merge(day_dte, on="date", how="left")
    scopes = {"S0": c["dte"] == c["day_dte"], "S1": c["dte"] <= 3, "S2": c["dte"] <= 7, "S3": c["dte"] <= 45, "S4": c["dte"] >= 0}
    out = dm.set_index("date").copy()
    out["day_dte"] = day_dte
    for k, m in scopes.items():
        g = c[m]
        out[f"gex_{k}"] = g.groupby("date")["gex"].sum()
        out[f"abs_{k}"] = g.assign(a=g["gex"].abs()).groupby("date")["a"].sum()
        out[f"oi_{k}"] = g.groupby("date")["effective_oi"].sum()
    out = out.reset_index()
    out.to_parquet(DATA / "ripple_book_nq.parquet", index=False)
    print("wrote ripple_book_nq.parquet", out.shape, "| day book found on", int(out["day_dte"].notna().sum()), "of", len(out), "days")

    # ---- wall pickers (reachable side, within +-2.5% of spot) -----------------------------------------------------------
    def picks(sub, val, tag):
        sub = sub[(sub["strike"] / sub["spot"] - 1).abs() <= WALL_BAND]
        a = sub.groupby(["date", "strike", "right"], observed=True)[val].sum().reset_index()
        a = a.merge(dm[["date", "spot"]], on="date")
        a["v"] = a[val].abs()
        cl = a[(a["right"] == "C") & (a["strike"] > a["spot"])].sort_values(["date", "v"]).groupby("date").tail(1).set_index("date")["strike"].rename(f"{tag}_call")
        pt = a[(a["right"] == "P") & (a["strike"] < a["spot"])].sort_values(["date", "v"]).groupby("date").tail(1).set_index("date")["strike"].rename(f"{tag}_put")
        return pd.concat([cl, pt], axis=1)
    w = pd.concat([picks(c[scopes["S1"]], "effective_oi", "W_oi"), picks(c[scopes["S4"]], "gex", "W_rip")], axis=1).reset_index()
    w.to_parquet(DATA / "ripple_walls_nq.parquet", index=False)
    print("wrote ripple_walls_nq.parquet", w.shape)
    print(w.describe().round(0).T[["count", "mean"]])
    agree = ((w["W_oi_call"] == w["W_rip_call"]).mean(), (w["W_oi_put"] == w["W_rip_put"]).mean())
    print(f"W_oi and W_ripple pick the SAME strike on {agree[0]:.0%} of days (calls), {agree[1]:.0%} (puts)")


if __name__ == "__main__":
    main()
