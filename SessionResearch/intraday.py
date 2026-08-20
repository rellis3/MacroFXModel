"""intraday — which UTC hours actually move, not just which sessions.

A session average can hide the fact that all of a session's range comes from
its first 60 minutes (the open) — this module looks one level below the
session bucket, at H1 bars, to answer "do certain hours of certain sessions
have outsized moves" directly, plus a day-of-week breakdown for context.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats as sstats

from forge.bars import frame


def build_hourly_frame(m1: pd.DataFrame, day_start_hour: int = 0) -> pd.DataFrame:
    h1 = frame(m1, "h1", day_start_hour=day_start_hour)
    atr0 = h1["atr0"].replace(0, np.nan)
    h1["range"] = h1["high"] - h1["low"]
    h1["range_atr"] = h1["range"] / atr0
    h1["abs_ret_atr"] = (h1["close"] - h1["open"]).abs() / atr0
    return h1


def hour_of_day_cells(h1: pd.DataFrame) -> pd.DataFrame:
    """For each UTC hour x metric, this-hour's distribution vs every other
    hour pooled (Mann-Whitney U, two-sided) — is this hour's typical move
    outsized relative to the rest of the day?"""
    rows = []
    for metric in ("range_atr", "abs_ret_atr"):
        vals = h1[metric].to_numpy()
        hours = h1["hour"].to_numpy()
        finite = np.isfinite(vals)
        for hr in range(24):
            this = vals[finite & (hours == hr)]
            rest = vals[finite & (hours != hr)]
            if len(this) < 100 or len(rest) < 100:
                continue
            u, p = sstats.mannwhitneyu(this, rest, alternative="two-sided")
            rows.append(dict(hour=hr, metric=metric, n=len(this),
                             value=float(np.mean(this)), median=float(np.median(this)),
                             rest_mean=float(np.mean(rest)), p=float(p)))
    return pd.DataFrame(rows)


def day_of_week_summary(h1: pd.DataFrame) -> pd.DataFrame:
    """Descriptive only (not part of the hypothesis pool / FDR budget) — a
    context table, not a claim."""
    g = h1.groupby("dow")
    out = pd.DataFrame({
        "n": g.size(),
        "mean_range_atr": g["range_atr"].mean(),
        "mean_abs_ret_atr": g["abs_ret_atr"].mean(),
    })
    out.index = out.index.map({0: "Mon", 1: "Tue", 2: "Wed", 3: "Thu", 4: "Fri", 5: "Sat", 6: "Sun"})
    return out.reset_index(names="dow")
