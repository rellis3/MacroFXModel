#!/usr/bin/env python3
"""Collapse the ~3M-row raw CME EUR/USD option chain into a small, analysis-ready
daily dataset. This is the one expensive pass over the raw file; everything else
in oi_research_book/scripts/1x_analysis_*.py reads its (small) parquet output.

Design decisions (see oi_research_book/RESEARCH_BOOK.md Part 0/1 for why):
  - Canonical contract key is (expiry, strike, right), NOT instrument_id -- the
    audit found 45 instrument_ids that were reused across different contracts.
  - open_interest is NaN whenever a contract wasn't included in that day's
    settlement/statistics report (always coincides with volume==0; rate rises
    from ~43% near-dated to ~95% beyond 1y DTE -- i.e. real sparsity in
    far-dated/illiquid strikes, not a random data hole). CME open interest is a
    persistent stock, not a daily flow, so a short reporting gap should carry
    the last known value forward, not be treated as "no position". We forward
    fill up to FFILL_LIMIT consecutive missing trade dates per contract and
    leave longer gaps as unknown (excluded from that day's surface).
  - open_interest_change (raw) has the same ~65% null rate as OI itself and is
    not used; the flow signal used everywhere in this book is the day-over-day
    diff of our own forward-filled effective OI, computed only across
    consecutive real trading days for that contract.
  - "Near-dated" chain = DTE <= 45 calendar days (covers the two front monthly
    expiries CME EUR/USD options trade most liquidly, and matches where the
    existing oi-dashboard/oi_bot concentrate) is treated as the primary surface
    for wall/gamma/pinning work; "all-expiry" (every listed expiry) is built in
    parallel for comparison. Both are saved.
"""
import sys
import numpy as np
import pandas as pd
from scipy.stats import norm

RAW = sys.argv[1] if len(sys.argv) > 1 else "EUR_USD.csv"
D1 = sys.argv[2] if len(sys.argv) > 2 else "eurusd_d1.parquet"
OUTDIR = "oi_research_book/data"
FFILL_LIMIT = 5          # consecutive missing trade-dates we'll carry OI forward across
NEAR_DTE_MAX = 45        # calendar days
CONTRACT_MULT = 125_000  # EUR/USD CME FX option notional (matches js/oi.js)
RV_WINDOW = 20           # trading days, close-to-close realized vol window


def load_raw():
    print("Loading raw CSV ...", flush=True)
    dtypes = {
        "strike": "float64", "right": "category",
        "settlement": "float64", "open_interest": "float64",
        "volume": "float64", "raw_symbol": "string", "instrument_id": "int64",
    }
    df = pd.read_csv(RAW, usecols=["date", "expiry", "strike", "right", "settlement",
                                    "open_interest", "volume", "raw_symbol"],
                      parse_dates=["date", "expiry"], dtype=dtypes)
    df["date"] = pd.to_datetime(df["date"]).dt.tz_localize(None)
    df["expiry"] = pd.to_datetime(df["expiry"]).dt.tz_convert("UTC").dt.tz_localize(None)
    return df


def forward_fill_oi(df):
    print("Forward-filling OI per (expiry,strike,right) contract ...", flush=True)
    df = df.sort_values(["expiry", "strike", "right", "date"]).reset_index(drop=True)
    key = ["expiry", "strike", "right"]
    g = df.groupby(key, sort=False, observed=True)
    df["effective_oi"] = g["open_interest"].ffill(limit=FFILL_LIMIT)
    # day-over-day diff on effective_oi, only valid where both today's and the
    # immediately preceding row for this contract are non-null
    prev_oi = g["effective_oi"].shift(1)
    df["oi_chg_computed"] = df["effective_oi"] - prev_oi
    df.loc[prev_oi.isna(), "oi_chg_computed"] = np.nan
    return df


def load_price():
    d1 = pd.read_parquet(D1)
    d1 = d1.reset_index().rename(columns={"datetime": "date"})
    d1["date"] = pd.to_datetime(d1["date"]).dt.tz_localize(None)
    d1 = d1.sort_values("date").reset_index(drop=True)
    d1["ret"] = np.log(d1["close"] / d1["close"].shift(1))
    # realized vol as-of date t uses returns up to and including t -> no lookahead
    d1["rv20_ann"] = d1["ret"].rolling(RV_WINDOW).std() * np.sqrt(252)
    d1["atr14"] = (d1["high"] - d1["low"]).rolling(14).mean()
    d1["fwd_ret_1d"] = d1["ret"].shift(-1)  # next trading day's return, for prediction targets
    d1["fwd_hi_1d"] = d1["high"].shift(-1)
    d1["fwd_lo_1d"] = d1["low"].shift(-1)
    return d1[["date", "open", "high", "low", "close", "ret", "rv20_ann", "atr14",
               "fwd_ret_1d", "fwd_hi_1d", "fwd_lo_1d"]]


def bs_gamma(spot, strike, sigma, t_years):
    t_years = np.maximum(t_years, 1 / 365)
    sigma = np.maximum(sigma, 1e-4)
    d1 = (np.log(spot / strike) + 0.5 * sigma ** 2 * t_years) / (sigma * np.sqrt(t_years))
    return norm.pdf(d1) / (spot * sigma * np.sqrt(t_years))


def build_surface(df, d1, near_only, tag):
    print(f"Building {tag} surface ...", flush=True)
    d = df.copy()
    if near_only:
        dte = (d["expiry"] - d["date"]).dt.days
        d = d[dte <= NEAR_DTE_MAX]
    # only keep rows where we actually have an OI estimate
    d = d[d["effective_oi"].notna()]

    d = d.merge(d1[["date", "close", "rv20_ann"]], on="date", how="inner")
    d = d.rename(columns={"close": "spot"})
    t_years = (d["expiry"] - d["date"]).dt.days / 365.0
    sigma = d["rv20_ann"].fillna(d["rv20_ann"].median())
    d["gamma"] = bs_gamma(d["spot"].values, d["strike"].values, sigma.values, t_years.values)
    d["gex"] = np.where(d["right"] == "C", 1, -1) * d["effective_oi"] * d["gamma"] * CONTRACT_MULT * d["spot"]

    # ---- per (date, strike) aggregate across expiries in scope ----
    agg = d.groupby(["date", "strike", "right"], observed=True).agg(
        oi=("effective_oi", "sum"),
        oi_chg=("oi_chg_computed", "sum"),
        volume=("volume", "sum"),
        gex=("gex", "sum"),
    ).reset_index()

    piv_oi = agg.pivot_table(index=["date", "strike"], columns="right",
                              values="oi", fill_value=0.0)
    piv_chg = agg.pivot_table(index=["date", "strike"], columns="right",
                               values="oi_chg", fill_value=0.0)
    piv_vol = agg.pivot_table(index=["date", "strike"], columns="right",
                               values="volume", fill_value=0.0)
    piv_gex = agg.pivot_table(index=["date", "strike"], columns="right",
                               values="gex", fill_value=0.0)

    surf = pd.DataFrame({
        "call_oi": piv_oi.get("C", 0.0), "put_oi": piv_oi.get("P", 0.0),
        "call_oi_chg": piv_chg.get("C", 0.0), "put_oi_chg": piv_chg.get("P", 0.0),
        "call_vol": piv_vol.get("C", 0.0), "put_vol": piv_vol.get("P", 0.0),
        "call_gex": piv_gex.get("C", 0.0), "put_gex": piv_gex.get("P", 0.0),
    }).reset_index()
    surf["total_oi"] = surf["call_oi"] + surf["put_oi"]
    surf["net_gex"] = surf["call_gex"] + surf["put_gex"]  # C is +, P is - by construction above
    surf.to_parquet(f"{OUTDIR}/surface_{tag}.parquet", index=False)
    print(f"  wrote surface_{tag}.parquet: {surf.shape}")
    return surf


def neighbor_concentration(sub, oi_col):
    """OI at a strike relative to the median OI of its N nearest listed
    neighbours that day (P2-1 in the OI quant review flags the old
    immediate-neighbour version as brittle -- use a wider band here)."""
    s = sub.sort_values("strike").reset_index(drop=True)
    vals = s[oi_col].values
    n = len(vals)
    conc = np.full(n, np.nan)
    band = 6
    for i in range(n):
        lo, hi = max(0, i - band), min(n, i + band + 1)
        neigh = np.delete(vals[lo:hi], i - lo)
        med = np.median(neigh) if len(neigh) else np.nan
        conc[i] = vals[i] / med if med and med > 0 else (np.inf if vals[i] > 0 else np.nan)
    s["_conc"] = conc
    return s


def build_wall_summary(surf, d1, tag):
    print(f"Building wall summary ({tag}) ...", flush=True)
    rows = []
    for date, sub in surf.groupby("date"):
        sub = sub.copy()
        spot_row = d1.loc[d1["date"] == date]
        if spot_row.empty:
            continue
        spot = spot_row["close"].values[0]

        # Definition A: raw max OI
        cw_a = sub.loc[sub["call_oi"].idxmax()] if sub["call_oi"].max() > 0 else None
        pw_a = sub.loc[sub["put_oi"].idxmax()] if sub["put_oi"].max() > 0 else None

        # Definition B: near-spot filtered (+/-2%)
        near = sub[(sub["strike"] >= spot * 0.98) & (sub["strike"] <= spot * 1.02)]
        cw_b = near.loc[near["call_oi"].idxmax()] if len(near) and near["call_oi"].max() > 0 else None
        pw_b = near.loc[near["put_oi"].idxmax()] if len(near) and near["put_oi"].max() > 0 else None

        # Definition C: neighbor-relative concentration among top-10-by-absolute-OI candidates
        cw_c = pw_c = None
        top_c = sub.sort_values("call_oi", ascending=False).head(10)
        if len(top_c) and top_c["call_oi"].max() > 0:
            top_c = neighbor_concentration(sub, "call_oi")
            top_c = top_c[top_c["strike"].isin(sub.sort_values("call_oi", ascending=False).head(10)["strike"])]
            cw_c = top_c.loc[top_c["_conc"].idxmax()] if len(top_c) else None
        top_p = sub.sort_values("put_oi", ascending=False).head(10)
        if len(top_p) and top_p["put_oi"].max() > 0:
            conc_p = neighbor_concentration(sub, "put_oi")
            conc_p = conc_p[conc_p["strike"].isin(top_p["strike"])]
            pw_c = conc_p.loc[conc_p["_conc"].idxmax()] if len(conc_p) else None

        # Definition D: largest positive OI change
        cw_d = sub.loc[sub["call_oi_chg"].idxmax()] if sub["call_oi_chg"].notna().any() and sub["call_oi_chg"].max() > 0 else None
        pw_d = sub.loc[sub["put_oi_chg"].idxmax()] if sub["put_oi_chg"].notna().any() and sub["put_oi_chg"].max() > 0 else None

        # Definition E: gamma-weighted (largest |GEX| contribution)
        cw_e = sub.loc[sub["call_gex"].idxmax()] if sub["call_gex"].max() > 0 else None
        pw_e = sub.loc[sub["put_gex"].idxmin()] if sub["put_gex"].min() < 0 else None

        # Gamma flip: cumulative net GEX from the lowest strike up, walked to
        # find every zero-crossing, then keep the crossing NEAREST TO SPOT.
        # This is still evaluated at the ACTUAL spot's per-strike gamma (not a
        # re-evaluation at hypothetical spot levels the way a "true" zero-gamma
        # level would be -- see book Part 0/6), but taking the cumulative sum
        # and the near-spot crossing (rather than js/oi.js's first-encountered
        # per-strike sign flip) avoids spurious flips in the sparse far-OTM
        # tails that a full historical chain has and a narrow manual-paste
        # window mostly doesn't.
        sub_sorted = sub.sort_values("strike").reset_index(drop=True)
        cum = sub_sorted["net_gex"].cumsum().values
        strikes_arr = sub_sorted["strike"].values
        flip_strike = np.nan
        crossings = []
        for i in range(len(cum) - 1):
            if cum[i] == 0 or (cum[i] < 0) != (cum[i + 1] < 0):
                # linear-interpolate the zero crossing between the two strikes
                if cum[i + 1] != cum[i]:
                    frac = -cum[i] / (cum[i + 1] - cum[i])
                    frac = min(max(frac, 0.0), 1.0)
                else:
                    frac = 0.5
                crossings.append(strikes_arr[i] + frac * (strikes_arr[i + 1] - strikes_arr[i]))
        if crossings:
            crossings = np.array(crossings)
            flip_strike = crossings[np.argmin(np.abs(crossings - spot))]

        rows.append({
            "date": date, "spot": spot,
            "call_wall_a": cw_a["strike"] if cw_a is not None else np.nan,
            "call_wall_a_oi": cw_a["call_oi"] if cw_a is not None else np.nan,
            "put_wall_a": pw_a["strike"] if pw_a is not None else np.nan,
            "put_wall_a_oi": pw_a["put_oi"] if pw_a is not None else np.nan,
            "call_wall_b": cw_b["strike"] if cw_b is not None else np.nan,
            "put_wall_b": pw_b["strike"] if pw_b is not None else np.nan,
            "call_wall_c": cw_c["strike"] if cw_c is not None else np.nan,
            "put_wall_c": pw_c["strike"] if pw_c is not None else np.nan,
            "call_wall_d": cw_d["strike"] if cw_d is not None else np.nan,
            "put_wall_d": pw_d["strike"] if pw_d is not None else np.nan,
            "call_wall_e": cw_e["strike"] if cw_e is not None else np.nan,
            "put_wall_e": pw_e["strike"] if pw_e is not None else np.nan,
            "total_call_oi": sub["call_oi"].sum(), "total_put_oi": sub["put_oi"].sum(),
            "total_call_vol": sub["call_vol"].sum(), "total_put_vol": sub["put_vol"].sum(),
            "net_gex_sum": sub["net_gex"].sum(),
            "gamma_flip": flip_strike,
            "n_strikes": len(sub),
        })
    out = pd.DataFrame(rows).sort_values("date").reset_index(drop=True)
    out["pc_oi_ratio"] = out["total_put_oi"] / out["total_call_oi"].replace(0, np.nan)
    out.to_parquet(f"{OUTDIR}/wall_summary_{tag}.parquet", index=False)
    print(f"  wrote wall_summary_{tag}.parquet: {out.shape}")
    return out


def main():
    import os
    df = load_raw()
    df = forward_fill_oi(df)
    os.makedirs(f"{OUTDIR}/cache", exist_ok=True)
    cache_cols = ["date", "expiry", "strike", "right", "effective_oi", "oi_chg_computed", "volume"]
    df[cache_cols].to_parquet(f"{OUTDIR}/cache/contract_level_ffilled.parquet", index=False)
    print(f"  wrote cache/contract_level_ffilled.parquet: {df[cache_cols].shape} (gitignored, reused by 03_pinning.py)")

    d1 = load_price()

    for near_only, tag in [(True, "near"), (False, "all")]:
        surf = build_surface(df, d1, near_only, tag)
        wall = build_wall_summary(surf, d1, tag)
        merged = wall.merge(d1, on="date", how="left")
        merged.to_parquet(f"{OUTDIR}/daily_master_{tag}.parquet", index=False)
        print(f"  wrote daily_master_{tag}.parquet: {merged.shape}")

    print("Done.")


if __name__ == "__main__":
    main()
