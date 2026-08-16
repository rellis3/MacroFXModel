#!/usr/bin/env python3
"""Stage 1 of MD files/CB_SENTIMENT_PRICE_TEST.md — FOMC event-window join proof
and zero-parameter post-announcement drift test on the dollar basket.

Design is FROZEN in the pre-registration doc; this script implements it verbatim.
No tunable parameters beyond the frozen spec. Run from repo root:

    python3 analysis/fomc_event_study/stage1_event_study.py

Reads VolRangeForecaster/data/m1/<pair>_m1.parquet (UTC index).
Writes stage1_events.csv (per-event rows) and prints the registered cells.
"""
import math
import os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
M1_DIR = os.path.join(HERE, "..", "..", "VolRangeForecaster", "data", "m1")
ET = ZoneInfo("America/New_York")

# Scheduled FOMC decision days (statement 14:00 ET), 2016 → data end 2026-05.
# Written from reference knowledge; verified two ways per the pre-registration:
# (1) the in-data 14:00 ET volatility-spike check below, (2) to be cross-checked
# against federalreserve.gov/monetarypolicy/fomccalendars.htm before Stage 2.
# Intermeeting emergency actions (2020-03-03, 2020-03-15) are EXCLUDED by design.
FOMC_DATES = [
    "2016-01-27", "2016-03-16", "2016-04-27", "2016-06-15",
    "2016-07-27", "2016-09-21", "2016-11-02", "2016-12-14",
    "2017-02-01", "2017-03-15", "2017-05-03", "2017-06-14",
    "2017-07-26", "2017-09-20", "2017-11-01", "2017-12-13",
    "2018-01-31", "2018-03-21", "2018-05-02", "2018-06-13",
    "2018-08-01", "2018-09-26", "2018-11-08", "2018-12-19",
    "2019-01-30", "2019-03-20", "2019-05-01", "2019-06-19",
    "2019-07-31", "2019-09-18", "2019-10-30", "2019-12-11",
    "2020-01-29", "2020-04-29", "2020-06-10", "2020-07-29",
    "2020-09-16", "2020-11-05", "2020-12-16",
    "2021-01-27", "2021-03-17", "2021-04-28", "2021-06-16",
    "2021-07-28", "2021-09-22", "2021-11-03", "2021-12-15",
    "2022-01-26", "2022-03-16", "2022-05-04", "2022-06-15",
    "2022-07-27", "2022-09-21", "2022-11-02", "2022-12-14",
    "2023-02-01", "2023-03-22", "2023-05-03", "2023-06-14",
    "2023-07-26", "2023-09-20", "2023-11-01", "2023-12-13",
    "2024-01-31", "2024-03-20", "2024-05-01", "2024-06-12",
    "2024-07-31", "2024-09-18", "2024-11-07", "2024-12-18",
    "2025-01-29", "2025-03-19", "2025-05-07", "2025-06-18",
    "2025-07-30", "2025-09-17", "2025-10-29", "2025-12-10",
    "2026-01-28", "2026-03-18", "2026-04-29",
]

# Dollar basket per the frozen spec: USD log return legs.
USD_QUOTE = ["eurusd", "gbpusd", "audusd", "nzdusd"]  # pair up => USD down: flip
USD_BASE = ["usdjpy", "usdchf", "usdcad"]             # pair up => USD up

SPIKE_MULT = 2.0      # frozen: event 5-min TR >= 2x baseline median
BASELINE_DAYS = 20    # frozen: prior 20 non-event days, same clock time
REACT_END_MIN = 30    # R0: 13:59 -> 14:30 ET
DRIFT_DAYS_1 = 1      # R1: 14:30 -> next trading day 14:00 ET
DRIFT_DAYS_5 = 5      # R5


def et_utc(date_str, hour, minute):
    d = datetime.strptime(date_str, "%Y-%m-%d")
    return datetime(d.year, d.month, d.day, hour, minute, tzinfo=ET).astimezone(
        ZoneInfo("UTC")
    )


def load_pair(pair):
    df = pd.read_parquet(os.path.join(M1_DIR, f"{pair}_m1.parquet"))
    return df[["open", "high", "low", "close"]]


def px_at_or_before(df, ts, max_lookback_min=120):
    """Close of the last bar at or before ts (weekend/holiday tolerant)."""
    ts = pd.Timestamp(ts)
    win = df.loc[ts - pd.Timedelta(minutes=max_lookback_min): ts]
    if win.empty:
        return None
    return float(win["close"].iloc[-1])


def next_trading_stamp(date_str, days):
    """14:00 ET `days` trading days after the event date (skip Sat/Sun)."""
    d = datetime.strptime(date_str, "%Y-%m-%d")
    step = 0
    while step < days:
        d += timedelta(days=1)
        if d.weekday() < 5:
            step += 1
    return datetime(d.year, d.month, d.day, 14, 0, tzinfo=ET).astimezone(
        ZoneInfo("UTC")
    )


def five_min_tr(df, start_utc):
    win = df.loc[pd.Timestamp(start_utc): pd.Timestamp(start_utc) + pd.Timedelta(minutes=4)]
    if win.empty:
        return None
    return float(win["high"].max() - win["low"].min())


def main():
    pairs = {p: load_pair(p) for p in USD_QUOTE + USD_BASE}
    ref = pairs["eurusd"]
    rows = []
    for ds in FOMC_DATES:
        t_pre = et_utc(ds, 13, 59)
        t_react = et_utc(ds, 14, 30)
        t_spike = et_utc(ds, 14, 0)

        # -- join proof: EURUSD 14:00-14:04 ET TR vs same-clock baseline median --
        ev_tr = five_min_tr(ref, t_spike)
        base_trs = []
        d = datetime.strptime(ds, "%Y-%m-%d")
        back = 0
        while len(base_trs) < BASELINE_DAYS and back < BASELINE_DAYS * 3:
            back += 1
            bd = d - timedelta(days=back)
            bds = bd.strftime("%Y-%m-%d")
            if bd.weekday() >= 5 or bds in FOMC_DATES:
                continue
            tr = five_min_tr(ref, et_utc(bds, 14, 0))
            if tr is not None and tr > 0:
                base_trs.append(tr)
        base_med = pd.Series(base_trs).median() if base_trs else None
        spike_ratio = (ev_tr / base_med) if (ev_tr and base_med) else None
        join_ok = spike_ratio is not None and spike_ratio >= SPIKE_MULT

        # -- basket returns --
        def basket_ret(t_a, t_b):
            legs = []
            for p, df in pairs.items():
                a, b = px_at_or_before(df, t_a), px_at_or_before(df, t_b)
                if not a or not b:
                    return None
                r = math.log(b / a)
                legs.append(-r if p in USD_QUOTE else r)
            return sum(legs) / len(legs)

        r0 = basket_ret(t_pre, t_react)
        r1 = basket_ret(t_react, next_trading_stamp(ds, DRIFT_DAYS_1))
        r5 = basket_ret(t_react, next_trading_stamp(ds, DRIFT_DAYS_5))
        rows.append(
            dict(date=ds, spike_ratio=spike_ratio, join_ok=join_ok,
                 r0=r0, r1=r1, r5=r5)
        )

    ev = pd.DataFrame(rows)
    ev.to_csv(os.path.join(HERE, "stage1_events.csv"), index=False)

    n = len(ev)
    ok = ev["join_ok"].sum()
    print(f"events: {n}   join-proof pass: {ok} ({ok / n:.0%})  [bar: >=90%]")
    bad = ev.loc[~ev["join_ok"], ["date", "spike_ratio"]]
    if len(bad):
        print("failed spike check (excluded from return cells):")
        print(bad.to_string(index=False))

    # per-cell NaN handling: each cell drops only rows missing ITS inputs
    # (e.g. 2024-12-18's R5 window lands on Christmas — absent from the R5
    # cell only, not from the registered R1 cell)
    ev = ev[ev["join_ok"]]
    ev5 = ev.dropna(subset=["r0", "r5"])
    ev = ev.dropna(subset=["r0", "r1"])
    n = len(ev)

    # -- registered drift cell --
    agree = ((ev.r0 > 0) == (ev.r1 > 0)).sum()
    from math import comb
    p_binom = sum(comb(n, k) for k in range(agree, n + 1)) / 2 ** n
    x, y = ev.r0, ev.r1
    beta = ((x - x.mean()) * (y - y.mean())).sum() / ((x - x.mean()) ** 2).sum()
    resid = y - (y.mean() + beta * (x - x.mean()))
    se = math.sqrt((resid ** 2).sum() / (n - 2) / ((x - x.mean()) ** 2).sum())
    t = beta / se
    print(f"\nREGISTERED DRIFT CELL (R1 ~ R0), N={n}")
    print(f"  sign agreement: {agree}/{n} = {agree / n:.1%}  binomial p={p_binom:.3f}")
    print(f"  slope={beta:.3f}  t={t:.2f}   [pass: agree>50% p<0.05 AND slope>0 |t|>=2]")

    # -- descriptive only --
    for col, frame in (("r0", ev), ("r1", ev), ("r5", ev5)):
        s = frame[col]
        print(f"  {col}: mean={s.mean() * 1e4:.1f}bp  sd={s.std() * 1e4:.1f}bp  "
              f"pos={(s > 0).mean():.0%}  N={len(s)}")
    x5, y5 = ev5.r0, ev5.r5
    n5 = len(ev5)
    b5 = ((x5 - x5.mean()) * (y5 - y5.mean())).sum() / ((x5 - x5.mean()) ** 2).sum()
    r5resid = y5 - (y5.mean() + b5 * (x5 - x5.mean()))
    se5 = math.sqrt((r5resid ** 2).sum() / (n5 - 2) / ((x5 - x5.mean()) ** 2).sum())
    print(f"  descriptive R5~R0: slope={b5:.3f} t={b5 / se5:.2f}")


if __name__ == "__main__":
    main()
