"""close-window-momentum: build the per-day table (anchors, sigma, gamma sign, costs).

Pre-registered in forge/CLOSE_WINDOW_MOMENTUM_PREREG.md. Seed 20261111 (no randomness here).

One row per local trading day per instrument with the prices at the frozen anchor times:
  indices (NQ, ES futures; NQ, SPX500 CFD):  prior 16:00 ET close -> 10:00 ET -> 15:30 ET -> 16:00 ET (America/New_York)
                                             (+ 14:30 / 15:00 ET mid-afternoon mirror and 16:15 ET post-close mirror)
  GOLD (CFD):                                prior 13:30 ET        ->            13:00 ET -> 13:30 ET
  FX majors (CFD):                           prior 16:00 London    ->            15:30 London -> 16:00 London
Price at time T = close of the M1 bar that ends at T (OANDA bars are open-stamped: bar start T-1min; NT8 bars are
end-stamped: label T, so labels are moved back one minute first, faults-log 2026-11-07). If that bar is missing, the
last bar ending in (T-5min, T] is used; otherwise the anchor is missing and the day is dropped (counted).
Sigma: 20-session stdev of New York-close (17:00 NY) daily log returns, ending at the NY close before the day.
Lockbox: days after 2026-08-21 are never written.

Usage: python -I scripts/close-window-momentum/build.py      (env CWM_DATA = checkout holding the gitignored data)
"""
import json
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve()
ROOT = HERE.parents[2]
DATA = Path(os.environ.get("CWM_DATA", ROOT))
OUT = ROOT / "analysis/output/close-window-momentum"
LOCKBOX_END = pd.Timestamp("2026-08-21")
START = pd.Timestamp("2016-01-04")

NY, LDN = "America/New_York", "Europe/London"

SRC = {
    # name: (path, kind, stamp, tz, anchors(local hh:mm), cost model)
    "NQ_FUT": ("analysis/output/nt8/continuous/NQ_1m_ratio.parquet", "nt8", "end", NY, "index", ("fut", 0.725)),
    "ES_FUT": ("analysis/output/nt8/continuous/ES_1m_ratio.parquet", "nt8", "end", NY, "index", ("fut", 0.59)),
    "NQ_CFD": ("data/m1_bidask/nq_m1.parquet", "bidask", "open", NY, "index", ("ba", None)),
    "SPX_CFD": ("data/m1_bidask/spx_m1.parquet", "bidask", "open", NY, "index", ("ba", None)),
    "GOLD": ("data/m1_bidask/gold_m1.parquet", "bidask", "open", NY, "gold", ("ba", None)),
    "EURUSD": ("data/m1_bidask/eurusd_m1.parquet", "bidask", "open", LDN, "fx", ("ba", None)),
    "GBPUSD": ("data/m1_bidask/gbpusd_m1.parquet", "bidask", "open", LDN, "fx", ("ba", None)),
    "USDJPY": ("data/m1_bidask/usdjpy_m1.parquet", "bidask", "open", LDN, "fx", ("ba", None)),
    "AUDUSD": ("data/m1_bidask/audusd_m1.parquet", "bidask", "open", LDN, "fx", ("ba", None)),
}
ANCH = {
    "index": {"prev": "16:00", "fh": "10:00", "w0": "15:30", "w1": "16:00", "w60": "15:00", "m0": "14:30",
              "pc": "16:15"},
    "gold": {"prev": "13:30", "w0": "13:00", "w1": "13:30", "w60": "12:30"},
    "fx": {"prev": "16:00", "w0": "15:30", "w1": "16:00", "w60": "15:00"},
}
MIN_WINDOW_BARS = 25  # of the 30 bars ending in (w0, w1]


def load(name):
    path, kind, stamp, tz, fam, cost = SRC[name]
    if kind == "nt8":
        d = pd.read_parquet(DATA / path, columns=["timestamp", "open", "high", "low", "close", "volume"])
        t = d["timestamp"].dt.tz_convert("UTC").dt.tz_localize(None)
        end = t  # end-stamped: label = bar end
        df = pd.DataFrame({"end": end.values, "close": d["close"].values})
    else:
        d = pd.read_parquet(DATA / path, columns=["time", "close", "bid_c", "ask_c"])
        end = d["time"] + pd.Timedelta(minutes=1)  # open-stamped: bar end = start + 1 min
        df = pd.DataFrame({"end": end.values, "close": d["close"].values,
                           "spr": (d["ask_c"] - d["bid_c"]).values})
    df = df.drop_duplicates("end").sort_values("end").reset_index(drop=True)
    return df


def price_at(df, ts_utc, tol_min=5):
    """close of the bar ending at ts (or the last bar ending within tol before it). Returns (price, spread, idx)."""
    e = df["end"].values
    i = np.searchsorted(e, ts_utc.values, side="right") - 1
    ok = (i >= 0)
    ii = np.where(ok, i, 0)
    lag = (ts_utc.values - e[ii]).astype("timedelta64[s]").astype(float)
    ok &= (lag >= 0) & (lag < tol_min * 60)
    px = np.where(ok, df["close"].values[ii], np.nan)
    sp = np.where(ok, df["spr"].values[ii], np.nan) if "spr" in df else np.full(len(ii), np.nan)
    return px, sp, np.where(ok, ii, -1)


def ny_close_sigma(df):
    """20-session stdev of NY-close (17:00 NY) log returns. Index = NY-close session label date."""
    t = pd.to_datetime(df["end"]).dt.tz_localize("UTC").dt.tz_convert(NY)
    lab = (t - pd.Timedelta(minutes=1) + pd.Timedelta(hours=7)).dt.normalize().dt.tz_localize(None)
    s = pd.DataFrame({"lab": lab.values, "close": df["close"].values, "n": 1})
    g = s.groupby("lab").agg(close=("close", "last"), n=("n", "sum"))
    g = g[(g.index.dayofweek < 5) & (g["n"] >= 60)]
    r = np.log(g["close"] / g["close"].shift(1))
    return r.rolling(20).std()  # sigma ending at that session's close


def build(name):
    path, kind, stamp, tz, fam, cost = SRC[name]
    df = load(name)
    a = ANCH[fam]
    t_local = pd.to_datetime(df["end"]).dt.tz_localize("UTC").dt.tz_convert(tz)
    days = pd.DatetimeIndex(sorted(set((t_local - pd.Timedelta(minutes=1)).dt.tz_localize(None).dt.normalize())))
    days = days[(days.dayofweek < 5) & (days >= START) & (days <= LOCKBOX_END)]
    sig = ny_close_sigma(df)

    def utc(day_idx, hhmm):
        h, m = map(int, hhmm.split(":"))
        loc = (day_idx + pd.Timedelta(hours=h, minutes=m)).tz_localize(tz, nonexistent="shift_forward",
                                                                        ambiguous=False)
        return pd.Series(loc.tz_convert("UTC").tz_localize(None))

    out = pd.DataFrame({"day": days})
    for k, hhmm in a.items():
        if k == "prev":
            continue
        px, sp, ix = price_at(df, utc(days, hhmm))
        out[f"p_{k}"] = px
        out[f"s_{k}"] = sp
        out[f"i_{k}"] = ix
    # window bar count: bars ending in (w0, w1]
    e = df["end"].values
    lo = np.searchsorted(e, utc(days, a["w0"]).values, side="right")
    hi = np.searchsorted(e, utc(days, a["w1"]).values, side="right")
    out["n_win"] = hi - lo
    # prior anchor = last price at or before the previous weekday's w1 time (tolerance 20 h, so a holiday's early
    # halt gives its last price); the previous weekday is the previous row in `days`
    prev_days = pd.DatetimeIndex(np.r_[np.datetime64("NaT"), days.values[:-1]])
    ok = prev_days.notna()
    pp = np.full(len(days), np.nan)
    if ok.any():
        px, _, _ = price_at(df, utc(prev_days[ok], a["w1"]), tol_min=20 * 60)
        pp[np.asarray(ok)] = px
    out["p_prev"] = pp
    out["prev_day"] = prev_days
    # next-day anchors for the reversal descriptive
    for h in (1, 2, 3):
        out[f"p_w1_next{h}"] = out["p_w1"].shift(-h)
    # sigma: NY-close session before the day. Session label L covers 17:00 NY of L-1 to 17:00 NY of L;
    # the day's own cash/fix times fall inside session label = day (all anchors before 17:00 NY), so use label day-1.
    prev_lab = days - pd.Timedelta(days=1)
    # last sigma with label <= day-1
    pos = np.searchsorted(sig.index.values, prev_lab.values, side="right") - 1
    out["sigma"] = np.where(pos >= 0, sig.values[np.clip(pos, 0, None)], np.nan)
    out["sigma_lab"] = np.where(pos >= 0, sig.index.values[np.clip(pos, 0, None)], np.datetime64("NaT"))
    out["instrument"] = name
    out["family"] = fam
    out["cost_kind"] = cost[0]
    out["cost_pts"] = cost[1] if cost[1] is not None else np.nan
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    names = sys.argv[1:] or list(SRC)
    meta = {}
    for n in names:
        o = build(n)
        o.to_parquet(OUT / f"days_{n}.parquet", index=False)
        meta[n] = {"rows": len(o), "first": str(o.day.min().date()), "last": str(o.day.max().date()),
                   "w1_present": int(o.p_w1.notna().sum()), "w0_present": int(o.p_w0.notna().sum()),
                   "window_bars_ge_25": int((o.n_win >= MIN_WINDOW_BARS).sum())}
        print(n, meta[n], flush=True)
    (OUT / "build_meta.json").write_text(json.dumps(meta, indent=1))


if __name__ == "__main__":
    main()
