"""sessions — turns raw M1 bars into one row per (trading day, session).

Session windows are UTC hours, [start, end). The Asia/London split matches
`forge.bars.SESSIONS` exactly (that module is the shared substrate everything
else in the repo should agree with); "ny" is split into the London/NY
**overlap** and the NY-only afternoon because that is the 4-way split this
research asks for, and because the overlap is where liquidity is highest and
mean-reversion/continuation behaviour is least like either session alone.

    asia     00:00-07:00 UTC   Tokyo/Sydney
    london   07:00-12:00 UTC   London morning, pre-NY
    overlap  12:00-16:00 UTC   London/NY overlap
    ny       16:00-21:00 UTC   NY afternoon, post-overlap

21:00-24:00 UTC ("late": thin Pacific liquidity) is excluded from the 4-session
cycle but still summarized, since a spike in that window is the thing sitting
right before the Asia open (see spike_fade.py).

None of these windows crosses UTC midnight, so `day_start_hour=0` keeps every
session inside a single calendar day — there is no session-splitting edge case
to handle at the day boundary the way there is with a 22:00-rolled trading day.

The session cycle repeats as: ...NY(d-1) -> Asia(d) -> London(d) -> Overlap(d)
-> NY(d) -> Asia(d+1)... — `PRIOR_SESSION` encodes exactly that adjacency,
including the cross-day Asia<-NY link, so "prior session" always means the
most recent *liquid* session, not the thin late-Pacific tail.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from forge.bars import day_key, frame

SESSION_WINDOWS = {
    "asia": (0, 7),
    "london": (7, 12),
    "overlap": (12, 16),
    "ny": (16, 21),
    "late": (21, 24),
}

# The 4-session cycle the research question is actually about.
CYCLE = ("asia", "london", "overlap", "ny")

# name -> (prior session name, prior day offset: 0 = same day, -1 = previous day)
PRIOR_SESSION = {
    "asia": ("ny", -1),
    "london": ("asia", 0),
    "overlap": ("london", 0),
    "ny": ("overlap", 0),
}

_MIN_COVERAGE = 0.85  # a session with fewer than this fraction of expected M1 bars is dropped


def _session_ohlc(sub: pd.DataFrame, days: np.ndarray) -> pd.DataFrame:
    """OHLC + extreme timestamps + bar count for one session window, one row per day."""
    g = sub.groupby(days)
    hi_idx = g["high"].idxmax()
    lo_idx = g["low"].idxmin()
    out = pd.DataFrame({
        "open": g["open"].first(),
        "high": g["high"].max(),
        "low": g["low"].min(),
        "close": g["close"].last(),
        "start": g.apply(lambda d: d.index[0], include_groups=False),
        "end": g.apply(lambda d: d.index[-1], include_groups=False),
        "high_time": hi_idx,
        "low_time": lo_idx,
        "n_bars": g.size(),
    })
    return out


def build_session_table(m1: pd.DataFrame, day_start_hour: int = 0) -> pd.DataFrame:
    """One row per (day, session): OHLC, range, direction, and where in the
    session the extreme printed — the base table every analysis in this
    package works from.

    Columns:
      day, session, open, high, low, close, start, end, n_bars, coverage
      range            high - low, in price units
      range_atr        range / prior-day ATR(14) — comparable across gold's
                        2016 (~$1,060) -> 2026 (~$4,300) price-scale change
      net_move, net_move_atr   close - open, signed
      direction         sign(net_move), 0 if exactly flat
      high_frac, low_frac      fraction of the session elapsed when the
                        extreme printed (0 = at the open, 1 = at the close) —
                        "did the range form early or did it grind out late"
      gap_atr           this session's open vs the immediately PRIOR session's
                        close (per PRIOR_SESSION; asia's prior is the previous
                        day's ny), in prior-day-ATR units
      broke_prior_high/low   this session's high/low exceeded the prior
                        session's high/low
    """
    days = day_key(m1.index, day_start_hour)
    hours = m1.index.hour.to_numpy()
    daily_atr0 = frame(m1, "d1", day_start_hour=day_start_hour)["atr0"]
    daily_atr0.index = pd.DatetimeIndex(daily_atr0.index).normalize().tz_localize(None)

    rows = []
    for name, (lo_h, hi_h) in SESSION_WINDOWS.items():
        mask = (hours >= lo_h) & (hours < hi_h)
        sub = m1[mask]
        if len(sub) == 0:
            continue
        t = _session_ohlc(sub, days[mask])
        t["session"] = name
        t["day"] = t.index
        rows.append(t.reset_index(drop=True))
    tab = pd.concat(rows, ignore_index=True)

    expected_bars = {n: (hi - lo) * 60 for n, (lo, hi) in SESSION_WINDOWS.items()}
    tab["coverage"] = tab["n_bars"] / tab["session"].map(expected_bars)
    tab = tab[tab["coverage"] >= _MIN_COVERAGE].copy()

    tab["range"] = tab["high"] - tab["low"]
    tab["net_move"] = tab["close"] - tab["open"]
    tab["direction"] = np.sign(tab["net_move"])

    atr_lookup = daily_atr0.reindex(pd.DatetimeIndex(tab["day"])).to_numpy()
    with np.errstate(invalid="ignore", divide="ignore"):
        tab["range_atr"] = tab["range"] / atr_lookup
        tab["net_move_atr"] = tab["net_move"] / atr_lookup

    session_span = tab["session"].map({n: (hi - lo) * 3600 for n, (lo, hi) in SESSION_WINDOWS.items()})
    dur = (tab["end"] - tab["start"]).dt.total_seconds().clip(lower=60)
    tab["high_frac"] = ((tab["high_time"] - tab["start"]).dt.total_seconds() / dur).clip(0, 1)
    tab["low_frac"] = ((tab["low_time"] - tab["start"]).dt.total_seconds() / dur).clip(0, 1)

    tab = tab.sort_values(["day", "session"]).set_index(["day", "session"])
    tab = _add_handoff_columns(tab, atr_lookup=daily_atr0)
    return tab.reset_index()


def _add_handoff_columns(tab: pd.DataFrame, atr_lookup: pd.Series) -> pd.DataFrame:
    """gap_atr / broke_prior_high / broke_prior_low, using PRIOR_SESSION."""
    tab = tab.copy()
    gap = np.full(len(tab), np.nan)
    broke_hi = np.full(len(tab), np.nan)
    broke_lo = np.full(len(tab), np.nan)

    idx_by_key = {k: i for i, k in enumerate(tab.index)}
    days_sorted = np.sort(tab.index.get_level_values("day").unique())
    day_pos = {d: i for i, d in enumerate(days_sorted)}

    for i, (day, session) in enumerate(tab.index):
        if session not in PRIOR_SESSION:
            continue  # 'late' isn't part of the 4-session cycle (see CYCLE) -- no handoff to compute
        prior_name, offset = PRIOR_SESSION[session]
        prior_day_pos = day_pos[day] + offset
        if prior_day_pos < 0 or prior_day_pos >= len(days_sorted):
            continue
        prior_day = days_sorted[prior_day_pos]
        prior_key = (prior_day, prior_name)
        if prior_key not in idx_by_key:
            continue
        prow = tab.iloc[idx_by_key[prior_key]]
        crow = tab.iloc[i]
        atr = atr_lookup.reindex([pd.Timestamp(day)]).to_numpy()[0]
        if atr and np.isfinite(atr) and atr > 0:
            gap[i] = (crow["open"] - prow["close"]) / atr
        broke_hi[i] = float(crow["high"] > prow["high"])
        broke_lo[i] = float(crow["low"] < prow["low"])

    tab["gap_atr"] = gap
    tab["broke_prior_high"] = broke_hi
    tab["broke_prior_low"] = broke_lo
    return tab
