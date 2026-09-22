"""Stage 1: build synchronised daily closes for the 7 USD majors from M1 parquet.

Daily close = last M1 close at or before 17:00 America/New_York (the FX day roll),
so every pair is sampled at the same instant (cross-sectional work needs this).
Only NY weekdays are kept. Output: data/daily_closes.csv (date x pair).
"""
import os
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
M1 = os.path.join(ROOT, "..", "..", "VolRangeForecaster", "data", "m1")
PAIRS = ["eurusd", "gbpusd", "audusd", "nzdusd", "usdjpy", "usdcad", "usdchf"]


def daily_closes(pair):
    df = pd.read_parquet(os.path.join(M1, f"{pair}_m1.parquet"), columns=["close"])
    idx = df.index.tz_convert("America/New_York")
    s = pd.Series(df["close"].values, index=idx).dropna()
    s = s[s > 0]
    # A bar stamped 16:59 NY closes at 17:00 -> belongs to that NY date's close.
    s = s[(s.index.hour < 17)]
    day = s.index.normalize()
    out = s.groupby(day).last()
    out.index = out.index.tz_localize(None)
    return out[out.index.dayofweek < 5]


def main():
    cols = {}
    for p in PAIRS:
        c = daily_closes(p)
        cols[p] = c
        print(f"{p}: {len(c)} days {c.index.min().date()} -> {c.index.max().date()}")
    df = pd.DataFrame(cols)
    before = len(df)
    df = df.dropna()
    print(f"joined: {before} rows, {len(df)} with all 7 pairs present "
          f"({before - len(df)} dropped for a missing pair)")
    df.index.name = "date"
    df.to_csv(os.path.join(ROOT, "data", "daily_closes.csv"), float_format="%.6f")


if __name__ == "__main__":
    main()
