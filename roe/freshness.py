"""FRESHNESS CHECKS (ROE section 10 item 2). Flags travel with every observation (`inputFlags`); a flagged series may
still be observed. Codes:

  MISSING             the series could not be loaded or is empty
  STALE               last public observation older than the series' maximum age (calendar days, per cadence)
  STALE_RUN           >= N identical consecutive values (a frozen feed), daily non-derived series
  FUTURE_TS           the source held points dated after the as-of date (dropped; an unexpected timestamp)
  WEEKEND_STUB        a daily series has a Saturday/Sunday observation date (Sunday-stub fault, data-rules)
  INCOMPLETE_SESSION  a session series whose last date is today's London date before 22:00 London
  REVISED             a macro value differs from what the previous snapshot recorded for the same date (first-print rule)
  LOCKBOX_ADJACENT    set by the item, not here (see watch_config.json lockbox.productionLineNote)
"""
from __future__ import annotations

import datetime as dt

from .util import days_between, is_weekend, london_time

NO_WEEKEND_CHECK = {"BTC"}


def max_age_days(series, cfg: dict) -> int:
    f = cfg["freshness"]
    per = f.get("perSeries", {})
    if series.id in per:
        return per[series.id]
    key = "weekly" if series.cadence == "weekly" else ("session" if series.kind == "session" else "daily")
    return f["maxAgeDays"][key]


def series_flags(series, asof: str, now_utc: dt.datetime, cfg: dict, prior_tail: dict | None = None) -> list:
    """`series` must already be truncated to `asof`. Returns [{'code','detail'}]."""
    f = cfg["freshness"]
    if series is None or not series.dates:
        return [{"code": "MISSING", "detail": "no observations"}]
    out = []
    last_pub = series.known[-1] if series.known else series.dates[-1]
    age = days_between(last_pub, asof)
    lim = max_age_days(series, cfg)
    if age > lim:
        out.append({"code": "STALE", "detail": f"last observation {series.dates[-1]} public {last_pub}, {age}d before {asof} (max {lim}d)"})
    if series.meta.get("droppedAfterTo", 0) > 0:
        out.append({"code": "FUTURE_TS", "detail": f"{series.meta['droppedAfterTo']} point(s) dated after {asof} dropped"})
    if series.cadence == "daily" and not series.meta.get("derived"):
        n = f["stalledRunLength"]
        tail = series.values[-n:]
        if len(tail) >= n and len(set(tail)) == 1 and series.kind != "session":
            out.append({"code": "STALE_RUN", "detail": f"{n} identical consecutive values ({tail[-1]})"})
        if series.id not in NO_WEEKEND_CHECK and any(is_weekend(d) for d in series.dates[-10:]):
            out.append({"code": "WEEKEND_STUB", "detail": "weekend-dated observation in the last 10"})
    if series.kind == "session":
        lt = london_time(now_utc)
        if series.dates[-1] == str(lt.date()) and lt.hour < f["sessionCompleteLondonHour"]:
            out.append({"code": "INCOMPLETE_SESSION", "detail": f"{series.dates[-1]} is today's London date and it is before {f['sessionCompleteLondonHour']}:00 London"})
    if series.kind in f["macroKinds"] and prior_tail:
        diffs = [(d, prior_tail[d], v) for d, v in zip(series.dates[-30:], series.values[-30:]) if d in prior_tail and abs(prior_tail[d] - v) > 1e-9]
        if diffs:
            out.append({"code": "REVISED", "detail": f"{len(diffs)} value(s) differ from the previous snapshot, e.g. {diffs[0]}"})
    return out


def flag_strings(sid: str, flags: list) -> list:
    return [f"{x['code']}:{sid}" for x in flags]
