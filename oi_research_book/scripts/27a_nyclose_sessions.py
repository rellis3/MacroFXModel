"""
New York-close daily sessions from OANDA M1, for gex-range-es (GEX_RANGE_ES_PREREG.md).

Session S(D) runs 17:00 New York on D-1 -> 17:00 New York on D: label = date of
(timestamp in America/New_York + 7h). Weekend labels dropped; a session needs >= 60
M1 bars or it is dropped (counted). This replaces the UTC D1 files (Sunday stubs) the
OI book used for prices -- data rule 2, DATA_SPEC section 5 #11.

Writes a D1-shaped parquet (index 'datetime', open/high/low/close/volume/n) that
01_build_daily_dataset.py can read unchanged.

Usage: python oi_research_book/scripts/27a_nyclose_sessions.py <m1.parquet> <out.parquet>
"""
import sys
import pandas as pd

MIN_BARS = 60


def build(m1_path):
    m = pd.read_parquet(m1_path)
    idx = pd.to_datetime(m.index)
    if idx.tz is None:
        idx = idx.tz_localize("UTC")
    ny = idx.tz_convert("America/New_York")
    label = (ny.tz_localize(None) + pd.Timedelta(hours=7)).normalize()
    m = m.assign(_label=label.values)
    g = m.groupby("_label")
    d = pd.DataFrame({
        "open": g["open"].first(), "high": g["high"].max(), "low": g["low"].min(),
        "close": g["close"].last(), "volume": g["volume"].sum(), "n": g.size(),
    })
    d.index.name = "datetime"
    n0 = len(d)
    wk = d.index.dayofweek < 5
    short = d["n"] < MIN_BARS
    out = d[wk & ~short]
    print(f"{m1_path}: {n0} labels, dropped {int((~wk).sum())} weekend, "
          f"{int((wk & short).sum())} short (<{MIN_BARS} bars) -> {len(out)} sessions "
          f"{out.index.min().date()} .. {out.index.max().date()}")
    return out, {"labels": n0, "weekend_dropped": int((~wk).sum()),
                 "short_dropped": int((wk & short).sum()), "sessions": len(out)}


if __name__ == "__main__":
    out, _ = build(sys.argv[1])
    # the last label is only complete if the M1 file reaches 17:00 New York that day;
    # drop it unconditionally rather than risk a partial final session
    out = out.iloc[:-1]
    out.to_parquet(sys.argv[2])
    print(f"wrote {sys.argv[2]} ({len(out)} sessions, last partial label dropped)")
