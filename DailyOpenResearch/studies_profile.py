"""
Study 1 - WHERE IS THE VOLATILITY?  Hour-of-day and minutes-since-open profile.

Before trusting any open-based pattern we need to know whether the open is
special at all: does the first 5/15/30/60 minutes after the daily open carry
more range than a random hour, and how often does the day's eventual HIGH or
LOW get printed inside that window (the "Judas swing" / early extreme idea).
"""
from __future__ import annotations
import numpy as np
import pandas as pd
from zoneinfo import ZoneInfo
from .data import Days, DOW_NAMES
from .stats import summarize, prop_ci


def hourly_profile(df: pd.DataFrame, tz: str = "Europe/London") -> dict:
    """Median 1-minute true range and 60-minute range by local hour of day."""
    local = df.index.tz_convert(ZoneInfo(tz))
    hour = local.hour
    tr = (df.high - df.low).to_numpy()
    out = {}
    # 60-minute range: resample per local hour
    tmp = pd.DataFrame({"h": df.high.to_numpy(), "l": df.low.to_numpy(), "hr": hour,
                        "day": local.tz_localize(None).floor("D").to_numpy()}, index=df.index)
    g = tmp.groupby(["day", "hr"]).agg(h=("h", "max"), l=("l", "min"))
    g["r"] = g.h - g.l
    by_hr = g.groupby(level=1)["r"].median()
    by_hr_mean = g.groupby(level=1)["r"].mean()
    m1 = pd.Series(tr).groupby(hour).median()
    for hr in range(24):
        out[hr] = {"h1_range_median": round(float(by_hr.get(hr, np.nan)), 5),
                   "h1_range_mean": round(float(by_hr_mean.get(hr, np.nan)), 5),
                   "m1_range_median": round(float(m1.get(hr, np.nan)), 5)}
    return out


def minutes_since_open_profile(days: Days, windows=(5, 15, 30, 60, 120, 240)) -> dict:
    """Share of the day's range formed in the first N minutes, and how often the
    day's high or low is set in that window."""
    res = {w: {"range_share": [], "extreme_in_window": 0, "n": 0} for w in windows}
    last60 = {"range_share": [], "extreme_in_window": 0, "n": 0}
    mid60 = {"range_share": [], "extreme_in_window": 0, "n": 0}
    minute_tr = np.zeros(1500); minute_n = np.zeros(1500)
    rng = np.random.default_rng(5); null60 = {"extreme": 0, "n": 0}
    for i in range(days.n):
        if not days.valid(i) or days.is_weekend_day(i):
            continue
        o, h, l, c, v, ms = days.arrays(i)
        dr = h.max() - l.min()
        if dr <= 0:
            continue
        hi_t = ms[h.argmax()]; lo_t = ms[l.argmin()]
        rets = np.diff(c); rng.shuffle(rets); sc = o[0] + np.concatenate([[0.0], np.cumsum(rets)])
        null60["n"] += 1; null60["extreme"] += int(ms[sc.argmax()] < 60 or ms[sc.argmin()] < 60)
        # control windows: the LAST 60 minutes of the day and a 60-minute
        # block starting 6h after the open (a random-ish interior window)
        for ctl, lo_m, hi_m in ((last60, ms[-1] - 59, ms[-1] + 1), (mid60, 360, 420)):
            m = (ms >= lo_m) & (ms < hi_m)
            if m.any():
                ctl["range_share"].append((h[m].max() - l[m].min()) / dr)
                ctl["extreme_in_window"] += int(lo_m <= hi_t < hi_m or lo_m <= lo_t < hi_m)
                ctl["n"] += 1
        for w in windows:
            m = ms < w
            if not m.any():
                continue
            wr = h[m].max() - l[m].min()
            res[w]["range_share"].append(wr / dr)
            res[w]["extreme_in_window"] += int(hi_t < w or lo_t < w)
            res[w]["n"] += 1
        # per-minute true range in ADR units for the first 24h
        adr = days.adr20[i]
        idx = ms[ms < 1500]
        np.add.at(minute_tr, idx, (h - l)[ms < 1500] / adr)
        np.add.at(minute_n, idx, 1)
    out = {"windows": {}}
    for w in windows:
        r = res[w]
        out["windows"][w] = {"range_share": summarize(r["range_share"]),
                             "day_high_or_low_in_window": prop_ci(r["extreme_in_window"], r["n"]),
                             "expected_if_uniform_pct": round(100 * (1 - (1 - w / 1380) ** 2), 1)}
    out["shuffled_returns_null_first60"] = {"day_high_or_low_in_window": prop_ci(null60["extreme"], null60["n"])}
    out["control_last60"] = {"range_share": summarize(last60["range_share"]),
                             "day_high_or_low_in_window": prop_ci(last60["extreme_in_window"], last60["n"])}
    out["control_interior60_at_6h"] = {"range_share": summarize(mid60["range_share"]),
                                       "day_high_or_low_in_window": prop_ci(mid60["extreme_in_window"], mid60["n"])}
    with np.errstate(invalid="ignore", divide="ignore"):
        prof = minute_tr / np.maximum(minute_n, 1)
    # bucket the per-minute profile into 15-minute blocks for the first 8 hours
    blocks = {}
    for b in range(0, 480, 15):
        blocks[b] = round(float(prof[b:b + 15].mean()), 5)
    out["m1_true_range_adr_units_by_15min_block"] = blocks
    return out


def anchor_comparison(df: pd.DataFrame, anchors: list[str]) -> dict:
    """Same first-60-minute statistics across candidate anchors so 'which open
    matters' is answered by data rather than by convention."""
    out = {}
    for a in anchors:
        d = Days(df, a)
        share60 = []; extreme60 = 0; n = 0; first_move_agree = 0
        for i in range(d.n):
            if not d.valid(i) or d.is_weekend_day(i):
                continue
            o, h, l, c, v, ms = d.arrays(i)
            dr = h.max() - l.min()
            if dr <= 0:
                continue
            m = ms < 60
            if not m.any():
                continue
            share60.append((h[m].max() - l[m].min()) / dr)
            extreme60 += int(ms[h.argmax()] < 60 or ms[l.argmin()] < 60)
            # does the first-hour close direction agree with the day close direction?
            fc = c[m][-1] - o[0]; dc = c[-1] - o[0]
            if fc != 0 and dc != 0:
                first_move_agree += int(np.sign(fc) == np.sign(dc))
            n += 1
        out[a] = {"days": n, "first60_range_share": summarize(share60),
                  "day_extreme_in_first60": prop_ci(extreme60, n),
                  "first60_direction_matches_day_close": prop_ci(first_move_agree, n)}
    return out
