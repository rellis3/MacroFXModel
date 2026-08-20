#!/usr/bin/env python3
"""MD files/POST_FOMC_DRIFT_TEST.md — is the post-FOMC 5-day USD drift
FOMC-specific, or just the sample period's unconditional dollar drift?

Design FROZEN in the doc before running. One confirmatory cell:
event-mean R5 vs the 95th percentile of 10,000 placebo means drawn from
non-FOMC-adjacent baseline days, plus sign-stability across halves.

Run from repo root: python3 analysis/fomc_event_study/post_fomc_drift_test.py
"""
import math
import os
import random
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pandas as pd

from stage1_event_study import (  # noqa: E402  (same dir when run as script)
    FOMC_DATES, USD_QUOTE, USD_BASE, M1_DIR, load_pair, px_at_or_before,
    next_trading_stamp, et_utc,
)

HERE = os.path.dirname(os.path.abspath(__file__))
random.seed(20260820)  # frozen; date-derived, not tuned


def main():
    pairs = {p: load_pair(p) for p in USD_QUOTE + USD_BASE}

    def basket_r5(date_str):
        t_a = et_utc(date_str, 14, 30)
        t_b = next_trading_stamp(date_str, 5)
        legs = []
        for p, df in pairs.items():
            a, b = px_at_or_before(df, t_a), px_at_or_before(df, t_b)
            if not a or not b:
                return None
            r = math.log(b / a)
            legs.append(-r if p in USD_QUOTE else r)
        return sum(legs) / len(legs)

    # eligible baseline days: Mon-Fri 2016-02 -> 2026-05, not within -1..+5
    # TRADING days of a scheduled decision day
    excluded = set()
    for ds in FOMC_DATES:
        d = datetime.strptime(ds, "%Y-%m-%d")
        cur, back = d, 0
        while back < 1:  # -1 trading day
            cur -= timedelta(days=1)
            if cur.weekday() < 5:
                back += 1
                excluded.add(cur.strftime("%Y-%m-%d"))
        cur, fwd = d, 0
        excluded.add(ds)
        while fwd < 5:  # +5 trading days
            cur += timedelta(days=1)
            if cur.weekday() < 5:
                fwd += 1
                excluded.add(cur.strftime("%Y-%m-%d"))

    base_rows = []
    d = datetime(2016, 2, 1)
    end = datetime(2026, 5, 8)  # last start with a full 5-day window in data
    while d <= end:
        ds = d.strftime("%Y-%m-%d")
        if d.weekday() < 5 and ds not in excluded:
            r = basket_r5(ds)
            if r is not None:
                base_rows.append((ds, r))
        d += timedelta(days=1)
    base = pd.DataFrame(base_rows, columns=["date", "r5"])

    ev = pd.read_csv(os.path.join(HERE, "stage1_events.csv"))
    ev = ev[ev["join_ok"]].dropna(subset=["r5"])

    ev_mean = ev.r5.mean()
    n_ev = len(ev)
    print(f"event windows: N={n_ev}  mean={ev_mean * 1e4:.1f}bp  "
          f"pos={(ev.r5 > 0).mean():.0%}  median={ev.r5.median() * 1e4:.1f}bp")
    print(f"baseline days: N={len(base)}  mean={base.r5.mean() * 1e4:.1f}bp  "
          f"pos={(base.r5 > 0).mean():.0%}  median={base.r5.median() * 1e4:.1f}bp")

    # ── confirmatory cell: placebo resampling ──
    vals = base.r5.tolist()
    draws = 10_000
    placebo_means = [
        sum(random.choices(vals, k=n_ev)) / n_ev for _ in range(draws)
    ]
    placebo_means.sort()
    p95 = placebo_means[int(0.95 * draws)]
    pctl = sum(m < ev_mean for m in placebo_means) / draws
    h1 = ev[ev.date < "2021"].r5.mean()
    h2 = ev[ev.date >= "2021"].r5.mean()
    stable = h1 > 0 and h2 > 0
    print(f"\nCONFIRMATORY CELL: event mean at placebo percentile "
          f"{pctl:.1%}  (95th-pctl bar: {p95 * 1e4:.1f}bp)")
    print(f"  halves: 2016-2020 mean={h1 * 1e4:.1f}bp  "
          f"2021-2026 mean={h2 * 1e4:.1f}bp  both>0: {stable}")
    verdict = ev_mean > p95 and stable
    print(f"  pass bar: mean>95th placebo pctl AND both halves>0 "
          f"-> {'PASS' if verdict else 'FAIL'}")

    # descriptives
    b1 = base[base.date < "2021"].r5.mean()
    b2 = base[base.date >= "2021"].r5.mean()
    print(f"\ndescriptive: baseline halves 2016-2020={b1 * 1e4:.1f}bp  "
          f"2021-2026={b2 * 1e4:.1f}bp")
    print(f"descriptive: event-minus-baseline = "
          f"{(ev_mean - base.r5.mean()) * 1e4:.1f}bp")
    base.to_csv(os.path.join(HERE, "baseline_r5.csv"), index=False)


if __name__ == "__main__":
    main()
