"""level-local-gamma, step 1: per-contract books with point-in-time OI, per-strike IV and per-expiry forwards.

Prereg: forge/LEVEL_LOCAL_GAMMA_PREREG.md (section 3, "Point-in-time book"). Reads no price path and no outcome.

    python scripts/level-local-gamma/build_books.py NAS100_USD SPX500_USD XAU_USD EUR_USD ...

Writes analysis/output/level-local-gamma/cache/book_<PAIR>.parquet with one row per (date, expiry, strike):
    date, expiry (UTC naive), strike, call_oi, put_oi (forward-filled <= 3 book dates), iv (OTM smile, interpolated
    in strike within the expiry), F (that expiry's forward from put-call parity), settle_utc (settlement minute, UTC)
All prices in CME-native units (inverted FX pairs are NOT flipped here).
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import norm

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "analysis/output/level-local-gamma/cache"
OUT.mkdir(parents=True, exist_ok=True)

RAW = {
    "NAS100_USD": ROOT / "OI Data/NAS100_USD.csv",
    "SPX500_USD": ROOT / "OI Data/SPX500_USD.csv",
    "XAU_USD": ROOT / "oi_recon/databento_oi/XAU_USD.csv",
}
for _p in ("EUR_USD", "GBP_USD", "AUD_USD", "USD_JPY", "USD_CAD", "USD_CHF"):
    RAW[_p] = ROOT / f"OI Data/{_p}.csv"

# settlement clock (local time, zone): equity index 15:00 Chicago, gold 13:30 New York, FX 14:00 Chicago
SETTLE = {"NAS100_USD": ("15:00", "America/Chicago"), "SPX500_USD": ("15:00", "America/Chicago"),
          "XAU_USD": ("13:30", "America/New_York")}
FFILL_LIMIT = 3


def settle_clock(pair):
    return SETTLE.get(pair, ("14:00", "America/Chicago"))


def black76(F, K, T, sig, is_call):
    s = sig * np.sqrt(T)
    d1 = (np.log(F / K) + 0.5 * s * s) / s
    d2 = d1 - s
    c = F * norm.cdf(d1) - K * norm.cdf(d2)
    return np.where(is_call, c, c - (F - K))


def invert(price, F, K, T, is_call):
    lo = np.full(price.shape, 1e-3)
    hi = np.full(price.shape, 3.0)
    for _ in range(55):
        mid = 0.5 * (lo + hi)
        up = black76(F, K, T, mid, is_call) < price
        lo = np.where(up, mid, lo)
        hi = np.where(up, hi, mid)
    iv = 0.5 * (lo + hi)
    iv[(iv < 2e-3) | (iv > 2.9)] = np.nan
    return iv


def forward(g):
    """Put-call parity on the strikes nearest the money: C - P = D (F - K)."""
    both = g.dropna(subset=["C", "P"])
    both = both[(both["C"] > 0) & (both["P"] > 0)]
    if len(both) < 1:
        return np.nan
    cmp = (both["C"] - both["P"]).to_numpy()
    k = both["strike"].to_numpy()
    o = np.argsort(np.abs(cmp))[:6]
    D = 1.0
    if len(o) >= 3 and len(np.unique(k[o])) >= 3:
        b, a = np.polyfit(k[o], cmp[o], 1)
        D = float(np.clip(-b, 0.90, 1.00))
    F = float(np.median(k[o][:4] + cmp[o][:4] / D))
    return F if np.isfinite(F) and F > 0 else np.nan


def build(pair):
    print(f"[{pair}] reading", flush=True)
    df = pd.read_csv(RAW[pair], usecols=["date", "expiry", "strike", "right", "settlement", "open_interest"])
    df["date"] = pd.to_datetime(df["date"])
    df["expiry"] = pd.to_datetime(df["expiry"], utc=True).dt.tz_localize(None)
    df = df[df["expiry"] > df["date"]]
    # a strike can appear under >1 series on the same expiry: OI summed, settlement median
    g = df.groupby(["date", "expiry", "strike", "right"], sort=False)
    agg = pd.DataFrame({"oi": g["open_interest"].sum(min_count=1), "st": g["settlement"].median()}).reset_index()
    del df, g
    # forward-fill OI per contract over at most FFILL_LIMIT book dates
    dates = np.sort(agg["date"].unique())
    di = {d: i for i, d in enumerate(dates)}
    agg["di"] = agg["date"].map(di)
    agg = agg.sort_values(["expiry", "strike", "right", "di"])
    key = agg.groupby(["expiry", "strike", "right"], sort=False).ngroup()
    last_di = agg["di"].where(agg["oi"].notna())
    last_di = last_di.groupby(key).ffill()
    oi_ff = agg["oi"].groupby(key).ffill()
    ok = agg["oi"].notna() | ((agg["di"] - last_di) <= FFILL_LIMIT)
    agg["oi"] = np.where(ok, oi_ff, np.nan)
    print(f"[{pair}] {len(agg):,} contract-days, {len(dates)} book dates", flush=True)

    wide = agg.pivot_table(index=["date", "expiry", "strike"], columns="right", values=["oi", "st"],
                           aggfunc="first").reset_index()
    wide.columns = ["date", "expiry", "strike"] + [f"{a}_{b}" for a, b in wide.columns[3:]]
    for c in ("oi_C", "oi_P", "st_C", "st_P"):
        if c not in wide:
            wide[c] = np.nan
    hhmm, tz = settle_clock(pair)
    sdt = (pd.to_datetime(wide["date"].dt.strftime("%Y-%m-%d") + " " + hhmm)
           .dt.tz_localize(tz).dt.tz_convert("UTC").dt.tz_localize(None))
    wide["settle_utc"] = sdt
    wide["T"] = (wide["expiry"] - sdt).dt.total_seconds() / (365.25 * 86400)

    # forwards per (date, expiry)
    fw = []
    for (d, e), gg in wide[["date", "expiry", "strike", "st_C", "st_P"]].rename(
            columns={"st_C": "C", "st_P": "P"}).groupby(["date", "expiry"], sort=False):
        fw.append((d, e, forward(gg)))
    fw = pd.DataFrame(fw, columns=["date", "expiry", "F"])
    wide = wide.merge(fw, on=["date", "expiry"], how="left")

    # OTM implied vol per strike, then interpolate within each expiry
    call_side = wide["strike"] >= wide["F"]
    price = np.where(call_side, wide["st_C"], wide["st_P"])
    good = np.isfinite(price) & (price > 0) & np.isfinite(wide["F"]) & (wide["T"] > 1 / 365.25)
    good &= price / wide["F"].to_numpy() >= 2e-5
    iv = np.full(len(wide), np.nan)
    idx = np.where(good)[0]
    iv[idx] = invert(price[idx], wide["F"].to_numpy()[idx], wide["strike"].to_numpy()[idx],
                     wide["T"].to_numpy()[idx], call_side.to_numpy()[idx])
    wide["iv_raw"] = iv
    wide = wide.sort_values(["date", "expiry", "strike"]).reset_index(drop=True)
    out_iv = np.full(len(wide), np.nan)
    atm_front = {}
    for (d, e), gg in wide.groupby(["date", "expiry"], sort=False):
        ii = gg.index.to_numpy()
        v = gg["iv_raw"].to_numpy()
        k = gg["strike"].to_numpy()
        m = np.isfinite(v)
        if m.sum() >= 3:
            out_iv[ii] = np.interp(k, k[m], v[m])
        elif m.sum() >= 1:
            F = gg["F"].iloc[0]
            j = np.argmin(np.abs(k[m] - F)) if np.isfinite(F) else 0
            out_iv[ii] = v[m][j]
    wide["iv"] = out_iv
    # last resort: the date's front ATM IV (nearest expiry with >= 2 days and a valid IV)
    fr = (wide[np.isfinite(wide["iv"]) & (wide["T"] * 365.25 >= 2)]
          .assign(dist=lambda x: (x["strike"] - x["F"]).abs())
          .sort_values(["date", "T", "dist"]).groupby("date").first()["iv"])
    wide["iv"] = wide["iv"].fillna(wide["date"].map(fr))
    keep = wide[(wide["oi_C"].fillna(0) > 0) | (wide["oi_P"].fillna(0) > 0) | np.isfinite(wide["F"])]
    keep = keep.rename(columns={"oi_C": "call_oi", "oi_P": "put_oi"})
    keep = keep[["date", "expiry", "strike", "call_oi", "put_oi", "iv", "iv_raw", "F", "settle_utc"]]
    path = OUT / f"book_{pair}.parquet"
    keep.to_parquet(path, index=False)
    q = keep.groupby("date").agg(n=("strike", "size"), iv_ok=("iv_raw", lambda x: x.notna().mean()),
                                 F_ok=("F", lambda x: x.notna().mean()))
    print(f"[{pair}] -> {path.name}: {len(keep):,} rows; median contracts/day {q['n'].median():.0f}, "
          f"raw-IV share {q['iv_ok'].median():.2f}, F share {q['F_ok'].median():.2f}", flush=True)


if __name__ == "__main__":
    for p in sys.argv[1:]:
        build(p)
