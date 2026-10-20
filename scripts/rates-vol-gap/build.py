"""rates-vol-gap: build the daily panel (no outcomes are scored here).

One row per New York-close Nasdaq session (OANDA NAS100 M1 -> 17:00 New York bars, n >= 60):
  Parkinson variance of the session, MOVE and VXN closes as of that session (last print <= date),
  their trailing 252-session percentile ranks, and the scheduled US releases (FOMC decision, CPI, NFP)
  falling on each session.

Prereg: forge/RATES_VOL_GAP_PREREG.md. Output: analysis/output/rates-vol-gap/panel.parquet
"""
import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "analysis" / "output" / "rates-vol-gap"
CACHE = OUT / "cache"
LAST_SESSION = pd.Timestamp("2026-08-20")  # M1 ends 2026-08-20 23:59 UTC; 08-21 is a stub and lockbox anyway
PCT_WIN = 252

sys.path.insert(0, str(ROOT / "scripts" / "calendar"))
from fetch_nasdaq_calendar import load_calendar  # noqa: E402


def ny_close_bars() -> pd.DataFrame:
    m1 = pd.read_parquet(ROOT / "VolRangeForecaster" / "data" / "m1" / "nas100_usd_m1.parquet")
    ny = m1.index.tz_convert("America/New_York")
    # a bar ends at 17:00 New York: minutes from 17:00 on D-1 to 16:59 on D belong to session D
    key = (ny.tz_localize(None) + pd.Timedelta(hours=7)).normalize()
    g = m1.groupby(key)
    d = pd.DataFrame({"open": g["open"].first(), "high": g["high"].max(), "low": g["low"].min(),
                      "close": g["close"].last(), "n": g["open"].size()})
    d.index.name = "date"
    d = d[(d.index.dayofweek < 5) & (d["n"] >= 60) & (d.index <= LAST_SESSION)]
    d["pk"] = np.log(d["high"] / d["low"]) ** 2 / (4 * np.log(2))
    return d


def load_move() -> pd.Series:
    j = json.load(open(CACHE / "move_daily.json"))["chart"]["result"][0]
    ts = pd.to_datetime(j["timestamp"], unit="s").normalize()
    s = pd.Series(j["indicators"]["quote"][0]["close"], index=ts, name="move").dropna()
    return s[~s.index.duplicated(keep="last")]


def load_vxn() -> pd.Series:
    v = pd.read_csv(CACHE / "VXN_History.csv")
    s = pd.Series(v["CLOSE"].to_numpy(), index=pd.to_datetime(v["DATE"], format="%m/%d/%Y"), name="vxn")
    return s.dropna()


def event_days() -> pd.DataFrame:
    cal = load_calendar(countries=("United States",))
    ev = cal["event"].astype(str)
    pats = {
        "fomc": r"Fed Interest Rate Decision|Interest Rate Decision|FOMC.*(Decision|Statement)|Federal Funds",
        "cpi": r"^Inflation Rate Year-over-Year$|^Inflation Rate YoY|^CPI\b|Consumer Price Index",
        "nfp": r"Payroll Jobs Growth|Nonfarm Payrolls|Non Farm Payrolls$|Non-Farm Payrolls",
    }
    out = {}
    for k, p in pats.items():
        m = cal[ev.str.contains(p, case=False, regex=True)]
        m = m[~m["event"].str.contains("Minutes|Revision|Productivity|Private|Real Earnings|Core|Expectations", case=False)]
        out[k] = pd.to_datetime(m["date"]).dt.normalize().drop_duplicates()
    return out


def main():
    bars = ny_close_bars()
    move, vxn = load_move(), load_vxn()
    p = bars[["pk", "n"]].copy()
    p["move"] = move.reindex(p.index.union(move.index)).ffill().reindex(p.index)
    p["vxn"] = vxn.reindex(p.index.union(vxn.index)).ffill().reindex(p.index)
    # staleness guard: last print must be within 5 calendar days
    for name, s in (("move", move), ("vxn", vxn)):
        last = pd.Series(s.index, index=s.index).reindex(p.index.union(s.index)).ffill().reindex(p.index)
        p[f"{name}_age"] = (p.index - last).dt.days
    p["mp"] = p["move"].rolling(PCT_WIN, min_periods=PCT_WIN).rank(pct=True)
    p["vp"] = p["vxn"].rolling(PCT_WIN, min_periods=PCT_WIN).rank(pct=True)
    ev = event_days()
    for k, days in ev.items():
        p[k] = p.index.isin(set(days)).astype(int)
    p.to_parquet(OUT / "panel.parquet")
    cov = {k: [str(v.min().date()), str(v.max().date()), int(len(v))] for k, v in ev.items()}
    print("sessions", len(p), p.index.min().date(), p.index.max().date())
    print("move", move.index.min().date(), move.index.max().date(), "vxn", vxn.index.min().date(), vxn.index.max().date())
    print("stale move>5d", int((p.move_age > 5).sum()), "stale vxn>5d", int((p.vxn_age > 5).sum()))
    print("events (calendar coverage):", cov)
    print("events on panel sessions:", {k: int(p[k].sum()) for k in ev})
    print("per year fomc/cpi/nfp:\n", p[["fomc", "cpi", "nfp"]].groupby(p.index.year).sum().to_string())


if __name__ == "__main__":
    main()
