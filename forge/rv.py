"""Realised-variance targets and NY-close daily bars, built from M1, point-in-time.

Vol-layer L1 (plans/vol-layer/L1_LITERATURE_SPEC.md, vol-layer-system.html tab 1). The σ shootout scores every
forecaster against ONE realised target built from 1-minute bars, so the target and the bars the forecasters read must
come from the same M1 file and must never see the session they are forecasting.

    session_rv(m1)        one row per London session (00:00-22:00 London, weekdays): 5-min realised variance and its
                          relatives (bipower, quarticity, semivariances) plus the overnight return into the session.
    ny_close_daily(m1)    daily OHLC bars ending 17:00 New York, the bar shape the live σ is computed on (data-rules 2).
    bars_before(ny, ...)  the NY bars that had CLOSED before a London session opened: the only bars a forecast for that
                          session may read.

Grid rules (the reason this file exists rather than reusing an older builder):
  - The grid is the London clock, `step` minutes. Each slot takes the LAST M1 close inside it.
  - An EMPTY slot is a hole. A return is only taken between two ADJACENT non-empty slots, so a hole drops the returns
    around it instead of forward-filling a zero return into it (zero returns pull bipower variation down and inflate
    jump counts; scripts/forecast_history/build.mjs and jump_flags_seasonal.py forward-fill).
  - A non-empty slot whose close equals the previous one is a genuine zero return and is kept.
  - Bipower variation uses only pairs of returns that are themselves adjacent on the grid.
  - The overnight return (previous session's last close -> this session's first open) is reported separately, never
    folded into rv.

Every function is causal by construction: a session's row depends only on that session's bars (plus the previous
session's last close for the overnight term), and a NY bar is stamped with the moment it closed. `forge/rv_test.py`
proves prefix invariance: appending future M1 never changes an already-completed row.

LOCKBOX: `LOCKBOX_LAST` (2026-08-21) is the last London session research may score (data-rules 5). `session_rv` and
`ny_close_daily` cut there unless the caller passes `last_date=None` on purpose.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

LOCKBOX_LAST = "2026-08-21"
LONDON = "Europe/London"
NEW_YORK = "America/New_York"
SESSION_END_HOUR = 22          # london22: 00:00-22:00 London
_BV_MU = math.pi / 2           # 1 / mu1^2, mu1 = sqrt(2/pi)


def _cut(m1: pd.DataFrame, last_date: str | None, tz: str) -> pd.DataFrame:
    """Drop M1 after the end of `last_date` in `tz` (inclusive of that whole local day)."""
    if not last_date:
        return m1
    stop = (pd.Timestamp(last_date) + pd.Timedelta(days=1)).tz_localize(tz).tz_convert("UTC")
    return m1[m1.index < stop]


def _grid_returns(slot: np.ndarray, close: np.ndarray):
    """Returns between adjacent non-empty slots. `slot` is sorted slot ids (one per non-empty slot), `close` the last
    close in each. Returns (r, adjacent_pair_mask) where the mask marks r[i] and r[i+1] both on consecutive slots."""
    if slot.size < 2:
        return np.empty(0), np.empty(0, dtype=bool)
    step_ok = np.diff(slot) == 1
    r_all = np.diff(np.log(close))
    r = r_all[step_ok]
    # positions (in slot-gap space) of the kept returns; two kept returns are adjacent if their positions differ by 1
    pos = np.flatnonzero(step_ok)
    pair = np.diff(pos) == 1 if pos.size > 1 else np.empty(0, dtype=bool)
    return r, pair


def _measures(r: np.ndarray, pair: np.ndarray) -> dict:
    n = r.size
    if n == 0:
        return dict(n=0, rv=np.nan, bv=np.nan, rq=np.nan, rs_up=np.nan, rs_dn=np.nan)
    a = np.abs(r)
    prod = a[1:] * a[:-1]
    npairs = int(pair.sum())
    bv = _BV_MU * prod[pair].sum() * (n / npairs) if npairs > 0 else np.nan   # rescale to n returns
    return dict(
        n=int(n),
        rv=float(np.sum(r ** 2)),
        bv=float(bv),
        rq=float(n / 3.0 * np.sum(r ** 4)),
        rs_up=float(np.sum(r[r > 0] ** 2)),
        rs_dn=float(np.sum(r[r < 0] ** 2)),
    )


def session_rv(m1: pd.DataFrame, step: int = 5, last_date: str | None = LOCKBOX_LAST,
               min_returns: int | None = None) -> pd.DataFrame:
    """One row per London session (00:00-22:00 London, Mon-Fri), indexed by the London date string 'YYYY-MM-DD'.

    Columns: open, high, low, close (session OHLC from M1), n (returns used), rv, bv, rq, rs_up, rs_dn, r_on
    (overnight log return from the previous session's last close to this session's first open; NaN for the first
    session), slots (non-empty grid slots). Sessions with fewer than `min_returns` usable returns are dropped;
    default is half the grid (132 at 5 min).
    """
    if not isinstance(m1.index, pd.DatetimeIndex) or m1.index.tz is None:
        raise ValueError("m1 needs a tz-aware DatetimeIndex (forge.bars.load_m1 returns UTC)")
    if 60 % step and step % 60:
        raise ValueError("step must divide the hour")
    slots_per_day = SESSION_END_HOUR * 60 // step
    if min_returns is None:
        min_returns = slots_per_day // 2
    m1 = _cut(m1.sort_index(), last_date, LONDON)
    loc = m1.tz_convert(LONDON)
    keep = (loc.index.hour < SESSION_END_HOUR) & (loc.index.dayofweek < 5)
    loc = loc[keep]
    if loc.empty:
        return pd.DataFrame(columns=["open", "high", "low", "close", "n", "rv", "bv", "rq", "rs_up", "rs_dn", "r_on", "slots"])
    date = loc.index.strftime("%Y-%m-%d")
    minute = loc.index.hour * 60 + loc.index.minute
    frame = pd.DataFrame({"date": date, "slot": minute // step, "open": loc["open"].to_numpy(),
                          "high": loc["high"].to_numpy(), "low": loc["low"].to_numpy(),
                          "close": loc["close"].to_numpy()})
    frame = frame[np.isfinite(frame["close"]) & (frame["close"] > 0)]
    rows, prev_close = {}, None
    for d, g in frame.groupby("date", sort=True):
        last = g.groupby("slot", sort=True)["close"].last()
        r, pair = _grid_returns(last.index.to_numpy(), last.to_numpy())
        rec = _measures(r, pair)
        o = float(g["open"].iloc[0])
        rec.update(open=o, high=float(g["high"].max()), low=float(g["low"].min()), close=float(g["close"].iloc[-1]),
                   r_on=float(np.log(o / prev_close)) if prev_close else np.nan, slots=int(last.size))
        prev_close = rec["close"]
        if rec["n"] >= min_returns:
            rows[d] = rec
    out = pd.DataFrame.from_dict(rows, orient="index")
    out.index.name = "date"
    return out[["open", "high", "low", "close", "n", "rv", "bv", "rq", "rs_up", "rs_dn", "r_on", "slots"]]


def ny_close_daily(m1: pd.DataFrame, min_bars: int = 60, last_date: str | None = LOCKBOX_LAST) -> pd.DataFrame:
    """Daily OHLC bars ending 17:00 New York (OANDA D alignment), indexed by the NY end date 'YYYY-MM-DD'.

    Columns: open, high, low, close, n (M1 bars), end_utc (the moment the bar closed). The Sunday-evening open belongs
    to Monday's bar. Bars with fewer than `min_bars` minutes and weekend end dates are dropped. `last_date` is a London
    date: M1 after the end of that London day is removed first, so no bar can include a lockbox minute.
    """
    m1 = _cut(m1.sort_index(), last_date, LONDON)
    ny = m1.tz_convert(NEW_YORK)
    end_date = (ny.index + pd.Timedelta(hours=7)).normalize()      # 17:00 NY -> next midnight: the bar's end date
    g = ny.groupby(end_date.strftime("%Y-%m-%d"))
    out = pd.DataFrame({"open": g["open"].first(), "high": g["high"].max(), "low": g["low"].min(),
                        "close": g["close"].last(), "n": g["close"].size()})
    idx = pd.DatetimeIndex(out.index)
    out = out[(out["n"] >= min_bars) & (idx.dayofweek < 5)]
    out["end_utc"] = [pd.Timestamp(d + " 17:00").tz_localize(NEW_YORK).tz_convert("UTC") for d in out.index]
    # a bar is only a bar once it has closed: drop a trailing bar whose close is after the last M1 minute we hold
    if len(m1):
        out = out[out["end_utc"] <= m1.index[-1] + pd.Timedelta(minutes=1)]
    out.index.name = "date"
    return out


def london_open_utc(london_date: str) -> pd.Timestamp:
    """00:00 Europe/London on `london_date`, in UTC."""
    return pd.Timestamp(london_date).tz_localize(LONDON).tz_convert("UTC")


def bars_before(ny: pd.DataFrame, london_date: str) -> pd.DataFrame:
    """The NY-close bars that had closed at or before the London open of `london_date`: everything a forecast for
    that session may read."""
    return ny[ny["end_utc"] <= london_open_utc(london_date)]


def last_bar_index_before(ny: pd.DataFrame, london_dates) -> np.ndarray:
    """For each London session date, the integer position in `ny` of the last bar closed before its open (-1 if
    none). Vectorised form of `bars_before` for building forecast frames."""
    # both sides in ns: pandas 3 stores these as microseconds, and .asi8 follows the stored unit while .value is ns
    ends = pd.DatetimeIndex(ny["end_utc"]).tz_convert("UTC").as_unit("ns").asi8
    opens = np.array([london_open_utc(d).as_unit("ns").value for d in london_dates], dtype=np.int64)
    return np.searchsorted(ends, opens, side="right") - 1
