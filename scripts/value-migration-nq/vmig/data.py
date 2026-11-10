"""Data layer: load NQ minutes for regular trading hours (RTH), one frame per study.

Two input tiers share one output schema, so every feature and the backtest run unchanged on either:

  Tier P (proxy, what this sandbox has): 1-minute OHLCV. No aggressor side. Delta is estimated from price
         (bulk volume classification, see features.bvc_delta), and the volume profile spreads each minute's
         volume evenly over the ticks it traded through.
  Tier T (true, the owner's laptop store): exchange trades with the aggressor flag (Databento GLBX.MDP3
         `trades`, side B/A) or NT8 ticks classified by the tick rule. Aggregated here to the same minute
         frame plus a per-minute footprint (price-level buy/sell volume), so delta and the profile are exact.

Output schema of `load_minutes()` (one row per RTH minute, sorted):
  day      int     session number (0..n-1), New York calendar date order
  date     str     New York date YYYY-MM-DD
  m        int     minute of the session, 0 = 09:30:00-09:30:59 NY, 389 = 15:59
  open high low close  float  trade prices (points)
  volume   float   contracts
  delta    float   buy - sell volume (NaN on tier P until features.add_delta fills the proxy)

All timestamps in the source are bar START times in UTC (checked 2026-11-10: the 09:30 NY bar carries the
open-auction volume spike, and the Globex open is at 18:00 NY in both winter and summer).
"""
from __future__ import annotations

import glob
import hashlib
import json
import os
from pathlib import Path

import numpy as np
import pandas as pd

REPO = Path(__file__).resolve().parents[3]
DATA_DIR = REPO / "data" / "value-migration-nq"
RTH_OPEN_MIN = 9 * 60 + 30   # 09:30 NY
RTH_MINUTES = 390            # 09:30 .. 15:59
MIN_RTH_BARS = 385           # sessions with fewer minutes (half days, broken stubs) are dropped and counted
TICK = 0.25
POINT_VALUE = 20.0           # USD per NQ point

HF_REPO = "mdelcristo/NQ-F_1min_OHLCV_Parquet"
HF_YEARS = list(range(2015, 2026))


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_raw_m1(data_dir: Path = DATA_DIR) -> pd.DataFrame:
    files = sorted(glob.glob(str(data_dir / "NQ_1min_*.parquet")))
    if not files:
        raise FileNotFoundError(f"no NQ_1min_*.parquet in {data_dir}; run fetch_data.py first")
    d = pd.concat([pd.read_parquet(f) for f in files], ignore_index=True)
    d = d.drop_duplicates("timestamp").sort_values("timestamp").reset_index(drop=True)
    return d


def to_rth(d: pd.DataFrame, start: str | None = None, end: str | None = None, report: dict | None = None) -> pd.DataFrame:
    """UTC start-stamped 1-minute OHLCV -> RTH minute frame in the module schema."""
    ts = pd.to_datetime(d["timestamp"]).dt.tz_localize("UTC").dt.tz_convert("America/New_York")
    mins = ts.dt.hour * 60 + ts.dt.minute - RTH_OPEN_MIN
    keep = (mins >= 0) & (mins < RTH_MINUTES) & (ts.dt.weekday < 5)
    r = pd.DataFrame({
        "date": ts[keep].dt.strftime("%Y-%m-%d").values,
        "m": mins[keep].values.astype(int),
        "open": d.loc[keep, "open"].values.astype(float),
        "high": d.loc[keep, "high"].values.astype(float),
        "low": d.loc[keep, "low"].values.astype(float),
        "close": d.loc[keep, "close"].values.astype(float),
        "volume": d.loc[keep, "volume"].values.astype(float),
    })
    if start:
        r = r[r.date >= start]
    if end:
        r = r[r.date <= end]
    counts = r.groupby("date").size()
    good = counts[counts >= MIN_RTH_BARS].index
    dropped = counts[counts < MIN_RTH_BARS]
    if report is not None:
        report["sessions_seen"] = int(len(counts))
        report["sessions_dropped_short"] = {k: int(v) for k, v in dropped.items()}
    r = r[r.date.isin(good)].copy()
    r = fill_missing_minutes(r)
    r["delta"] = np.nan
    dates = sorted(r.date.unique())
    r["day"] = r.date.map({x: i for i, x in enumerate(dates)}).astype(int)
    return r.sort_values(["day", "m"]).reset_index(drop=True)[
        ["day", "date", "m", "open", "high", "low", "close", "volume", "delta"]]


def fill_missing_minutes(r: pd.DataFrame) -> pd.DataFrame:
    """Every kept session gets all 390 minutes. A missing minute (no trades printed) is a zero-volume bar at
    the previous close. Forward fill only: never reads a later price."""
    out = []
    for date, g in r.groupby("date", sort=True):
        g = g.set_index("m").reindex(range(RTH_MINUTES))
        g["date"] = date
        g["volume"] = g["volume"].fillna(0.0)
        c = g["close"].ffill()
        first_open = g["open"].dropna().iloc[0]
        c = c.fillna(first_open)
        for col in ("open", "high", "low"):
            g[col] = g[col].fillna(c)
        g["close"] = c
        out.append(g.reset_index())
    return pd.concat(out, ignore_index=True)


def load_minutes(start: str | None = None, end: str | None = None, report: dict | None = None) -> pd.DataFrame:
    return to_rth(load_raw_m1(), start=start, end=end, report=report)


# ---------------------------------------------------------------- tier T adapter (true aggressor trades)

def trades_to_minutes(trades: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Exchange trades -> (minute frame, footprint).

    trades columns: ts_utc (datetime64, UTC), price (float), size (float), side ('B' buyer-initiated,
    'A' seller-initiated, 'N' unknown -> split half/half, as the repo's orderflow scripts do).
    Returns the minute frame (delta exact) and a footprint dict {(date, m): (prices ndarray, buy ndarray, sell ndarray)}
    which profile.box_profile accepts in place of the uniform spread.
    """
    t = trades.copy()
    ts = pd.to_datetime(t["ts_utc"], utc=True).dt.tz_convert("America/New_York")
    t["date"] = ts.dt.strftime("%Y-%m-%d")
    t["m"] = ts.dt.hour * 60 + ts.dt.minute - RTH_OPEN_MIN
    t = t[(t.m >= 0) & (t.m < RTH_MINUTES)]
    side = t["side"].astype(str)
    t["buy"] = np.where(side == "B", t["size"], np.where(side == "N", t["size"] / 2, 0.0))
    t["sell"] = np.where(side == "A", t["size"], np.where(side == "N", t["size"] / 2, 0.0))
    g = t.groupby(["date", "m"])
    bars = g.agg(open=("price", "first"), high=("price", "max"), low=("price", "min"), close=("price", "last"),
                 volume=("size", "sum"), buy=("buy", "sum"), sell=("sell", "sum")).reset_index()
    bars["delta"] = bars["buy"] - bars["sell"]
    fp = {}
    for (date, m), gg in t.groupby(["date", "m"]):
        lv = gg.groupby("price")[["buy", "sell"]].sum()
        fp[(date, int(m))] = (lv.index.values.astype(float), lv["buy"].values, lv["sell"].values)
    counts = bars.groupby("date").size()
    bars = bars[bars.date.isin(counts[counts >= MIN_RTH_BARS].index)]
    delta = bars.set_index(["date", "m"])["delta"]
    r = fill_missing_minutes(bars.drop(columns=["buy", "sell", "delta"]))
    r["delta"] = [delta.get((d_, m_), 0.0) for d_, m_ in zip(r.date, r.m)]
    dates = sorted(r.date.unique())
    r["day"] = r.date.map({x: i for i, x in enumerate(dates)}).astype(int)
    return r.sort_values(["day", "m"]).reset_index(drop=True)[
        ["day", "date", "m", "open", "high", "low", "close", "volume", "delta"]], fp


def write_manifest(data_dir: Path = DATA_DIR) -> dict:
    files = sorted(glob.glob(str(data_dir / "NQ_1min_*.parquet")))
    man = {"source": f"https://huggingface.co/datasets/{HF_REPO}", "license": "MIT (per dataset card)",
           "files": {os.path.basename(f): {"sha256": sha256(Path(f)), "bytes": os.path.getsize(f)} for f in files}}
    return man
