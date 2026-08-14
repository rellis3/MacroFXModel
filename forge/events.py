"""events — level interactions as discrete decision points, with causal context.

This is the layer that makes the whole thing tractable, and the reasoning is
worth stating because it is a design choice, not a technicality.

You *could* ask "what happens next?" at every one of 3.6M M1 bars. That is the
wrong question, and it is wrong in a way that quietly destroys the statistics:
almost every bar is a non-event, so the signal you are looking for is diluted
into millions of null samples, and the model spends all its capacity learning
that nothing usually happens. It is also not how any of the concepts in
`levels.py` are actually used — nobody trades "the 10:37 bar", they trade
*price arriving at a level*.

So the engine only asks the question where a discretionary trader would: at a
**level interaction**. Price reaches a named structural price, and at that
moment there is a real decision — fade it, follow through it, or stand aside.
Each interaction becomes one row with a context vector, and the whole
downstream problem becomes "which contexts have an edge", which is a question
with a countable hypothesis space and an answerable sample size.

Every feature here obeys one rule: **computable at the close of the trigger
bar**. The entry the labeller uses is the OPEN of the following bar, so there
is a full bar of separation between the last piece of information used and the
fill price. Anything that needs future bars to compute (a confirmed swing
pivot, a completed session range) is timestamped by when it became knowable,
not when it happened.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from pylego.swing_structure import classify_swing_structure

from forge.bars import percentile_rank

# Context columns produced by `extract_events`, grouped by what they describe.
CONTEXT_NUMERIC = [
    "age_hours", "touch_n", "wick_beyond_atr", "close_beyond_atr",
    "body_atr", "range_atr", "body_frac", "ret5_atr", "ret20_atr",
    "dist_dopen_atr", "pos_in_day_range", "day_range_atr", "atr_pct",
    "confluence_n", "zone_width_atr",
]
CONTEXT_CATEGORICAL = ["kind", "family", "tf", "side", "session", "dow", "hour_bucket",
                       "trend"]


def _trend_series(bars: pd.DataFrame, pivot_n: int = 5) -> pd.Series:
    """Swing-structure regime as a time series that is safe to read at any bar.

    `classify_swing_structure` stamps each regime change at the PIVOT bar. A
    pivot at bar i needs bars i−n … i+n, so it is not confirmed until bar
    **i+n closes** — which on a left-labelled index is the timestamp of bar
    i+n+1. Every change-point is pushed forward by `pivot_n + 1` bars here
    before it is allowed to be read.

    Skipping the shift entirely is a gross lookahead: the backtest knows the
    trend flipped at the exact bar of the high that flipped it. Shifting by
    only `pivot_n` is the subtler version of the same mistake — it hands you
    the open of the confirming bar while that bar's own high and low are part
    of what confirmed it. Both inflate any trend-conditioned result, and
    trend-conditioned results are what this search selects most often.
    """
    pts = classify_swing_structure(bars, pivot_n=pivot_n)
    idx, val = [], []
    n = len(bars)
    for p in pts:
        i = p.idx + pivot_n + 1
        if i >= n:
            continue
        idx.append(bars.index[i])
        val.append(p.regime)
    if not idx:
        return pd.Series(dtype=object)
    s = pd.Series(val, index=pd.DatetimeIndex(idx))
    return s[~s.index.duplicated(keep="last")].sort_index()


def _day_progress(bars: pd.DataFrame) -> pd.DataFrame:
    """Running (causal) day statistics: high/low so far today and the day open."""
    g = bars.groupby("day", sort=False)
    return pd.DataFrame({
        "day_hi_sofar": g["high"].cummax(),
        "day_lo_sofar": g["low"].cummin(),
        "day_open": g["open"].transform("first"),
    }, index=bars.index)


def _confluence_counts(prices: np.ndarray, live_prices: list[np.ndarray],
                       tol: np.ndarray) -> np.ndarray:
    """How many OTHER live levels sit within `tol` of each event price."""
    out = np.zeros(len(prices))
    for i, (p, t, others) in enumerate(zip(prices, tol, live_prices)):
        if others is None or len(others) == 0 or not np.isfinite(t):
            continue
        out[i] = int(np.sum(np.abs(others - p) <= t)) - 1   # exclude itself
    return np.maximum(out, 0)


def extract_events(bars: pd.DataFrame, levels: pd.DataFrame,
                   max_touches: int = 3, cooldown_bars: int = 3,
                   trend_frames: dict[str, pd.DataFrame] | None = None,
                   atr_rank_window: int = 5000,
                   feature_offset: int = 0) -> pd.DataFrame:
    """Every interaction between `bars` and `levels`, with context.

    An *interaction* is a bar whose range intersects the level's zone while the
    previous bar's range did not — a fresh arrival, not each of the twenty bars
    that then sit on top of the level. `cooldown_bars` additionally suppresses
    a re-trigger for a few bars after one fires, so a single choppy visit to a
    level produces one event rather than six near-duplicates that would then be
    counted as six independent trades.

    `max_touches` caps how many separate arrivals at the same level are kept
    (the 1st, 2nd, 3rd touch are genuinely different setups; the 9th is noise).

    `feature_offset` selects WHICH bar the context vector describes, and it
    exists entirely to keep limit-order entries honest:

      ` 0` (default) — context is the trigger bar itself. Correct for a MARKET
            entry, which is placed after that bar has closed.
      `-1` — context is the bar BEFORE the trigger. Required for a LIMIT entry
            resting at the level: that order fills *during* the trigger bar, so
            conditioning on the trigger bar's own shape would be deciding to
            place an order using the bar it already filled in. The last moment
            a resting order could have been placed or cancelled is the close of
            the preceding bar, so that is the bar the features must describe.

    The touch bar itself is always reported as `time`/`bar_idx`; only the
    features move.
    """
    bars = bars.reset_index().rename(columns={bars.index.name or "index": "time"})
    times = pd.DatetimeIndex(bars["time"])
    high = bars["high"].to_numpy(); low = bars["low"].to_numpy()
    close = bars["close"].to_numpy(); opn = bars["open"].to_numpy()
    atr0 = bars["atr0"].to_numpy()
    n = len(bars)

    prog = _day_progress(bars.set_index(times))
    day_hi = prog["day_hi_sofar"].to_numpy()
    day_lo = prog["day_lo_sofar"].to_numpy()
    day_open = prog["day_open"].to_numpy()
    atr_pct = percentile_rank(bars["atr"].to_numpy(), atr_rank_window)

    ret5 = np.full(n, np.nan); ret5[5:] = close[5:] - close[:-5]
    ret20 = np.full(n, np.nan); ret20[20:] = close[20:] - close[:-20]

    born_i = times.searchsorted(pd.DatetimeIndex(levels["born"]), side="left")
    exp_i = times.searchsorted(pd.DatetimeIndex(levels["expire"]), side="right")
    l_price = levels["price"].to_numpy()
    l_lo = levels["lo"].to_numpy(); l_hi = levels["hi"].to_numpy()
    l_kind = levels["kind"].to_numpy(); l_fam = levels["family"].to_numpy()
    l_tf = levels["tf"].to_numpy()

    ev_bar, ev_lvl, ev_touch = [], [], []
    for j in range(len(levels)):
        a, b = int(born_i[j]), int(exp_i[j])
        if b - a < 2:
            continue
        b = min(b, n - 1)                      # need a next bar to enter on
        if b - a < 2:
            continue
        zl, zh = l_lo[j], l_hi[j]
        hit = (low[a:b] <= zh) & (high[a:b] >= zl)
        if not hit.any():
            continue
        # Fresh arrivals only: a hit whose predecessor was not a hit.
        prev = np.empty_like(hit); prev[0] = False; prev[1:] = hit[:-1]
        fresh = np.flatnonzero(hit & ~prev)
        kept, last = [], -10_000
        for f in fresh:
            if f - last < cooldown_bars:
                continue
            kept.append(f)
            last = f
            if len(kept) >= max_touches:
                break
        for t_i, f in enumerate(kept, start=1):
            ev_bar.append(a + int(f))
            ev_lvl.append(j)
            ev_touch.append(t_i)

    if not ev_bar:
        return pd.DataFrame()

    bi = np.asarray(ev_bar)
    li = np.asarray(ev_lvl)
    # `fi` is the bar the CONTEXT describes; `bi` is always the touch bar.
    # They differ only under a limit-entry configuration — see `feature_offset`.
    fi = np.maximum(bi + feature_offset, 0)
    scale = atr0[fi]
    scale = np.where(scale > 0, scale, np.nan)
    price = l_price[li]

    prev_close = close[np.maximum(fi - 1, 0)]
    # +1 = approached from ABOVE (level below prior close) → a support test.
    # -1 = approached from BELOW → a resistance test.
    side = np.where(prev_close >= price, 1, -1)

    # How far past the level the bar pierced, and where it closed relative to
    # it, both signed so that "beyond" always means "through the level in the
    # direction price was travelling".
    pierce = np.where(side > 0, price - low[fi], high[fi] - price)
    close_beyond = np.where(side > 0, price - close[fi], close[fi] - price)

    body = close[fi] - opn[fi]
    rng = high[fi] - low[fi]
    day_rng = day_hi[fi] - day_lo[fi]

    ev = pd.DataFrame({
        "time": times[bi],
        "bar_idx": bi,
        "feature_idx": fi,
        "feature_time": times[fi],
        "entry_idx": bi + 1,
        "entry_time": times[np.minimum(bi + 1, n - 1)],
        # The touch bar's own window, so a limit fill can be resolved inside it.
        "touch_start": times[bi],
        "touch_end": times[np.minimum(bi + 1, n - 1)],
        "kind": l_kind[li],
        "family": l_fam[li],
        "tf": l_tf[li],
        "level_price": price,
        "zone_lo": l_lo[li],
        "zone_hi": l_hi[li],
        "touch_n": np.asarray(ev_touch),
        "side": side,
        "atr0": scale,
        "age_hours": (times[fi] - pd.DatetimeIndex(levels["born"].to_numpy()[li]))
                      .total_seconds() / 3600.0,
        "wick_beyond_atr": pierce / scale,
        "close_beyond_atr": close_beyond / scale,
        "body_atr": body / scale,
        "range_atr": rng / scale,
        "body_frac": np.where(rng > 0, np.abs(body) / rng, np.nan),
        "ret5_atr": ret5[fi] / scale,
        "ret20_atr": ret20[fi] / scale,
        "dist_dopen_atr": (close[fi] - day_open[fi]) / scale,
        "pos_in_day_range": np.where(day_rng > 0, (close[fi] - day_lo[fi]) / day_rng, np.nan),
        "day_range_atr": day_rng / scale,
        "atr_pct": atr_pct[fi],
        "zone_width_atr": (l_hi[li] - l_lo[li]) / scale,
        "session": bars["session"].to_numpy()[fi],
        "dow": bars["dow"].to_numpy()[fi],
        "hour_bucket": (bars["hour"].to_numpy()[fi] // 3) * 3,
    })

    # Sort by time BEFORE the as-of joins below. `pd.merge_asof` requires a
    # time-sorted left frame and returns its result in that sorted order —
    # assigning that result back into a frame still in level-construction order
    # silently scrambles the column, pairing each event with some other
    # event's trend label. Events are generated level-by-level, so the frame
    # is emphatically not time-sorted until here.
    ev = ev.sort_values("time").reset_index(drop=True)

    # Confluence: other live levels near this one at this moment.
    ev["confluence_n"] = _confluence(ev, levels, tol_atr=0.25)

    # Prevailing structure on the higher timeframes, read only where knowable.
    trend_frames = trend_frames or {}
    trend_cols = []
    for name, tf_bars in trend_frames.items():
        s = _trend_series(tf_bars)
        col = f"trend_{name}"
        if s.empty:
            ev[col] = "unknown"
        else:
            right = (s.rename(col).rename_axis("feature_time").reset_index()
                     .sort_values("feature_time").reset_index(drop=True))
            # Joined on `feature_time`, not the touch time: under a limit
            # configuration the decision was made a bar earlier, so the trend
            # read must be the one in force then.
            #
            # `ev` is already sorted by `time`, and `feature_time` is that same
            # bar index shifted by a CONSTANT offset, so it is sorted too — no
            # re-sort here. Re-sorting and assigning the result back
            # positionally is precisely the scrambling bug fixed above, and it
            # would come straight back if this line sorted defensively.
            left = ev[["feature_time"]]
            assert left["feature_time"].is_monotonic_increasing, \
                "feature_time must be sorted before merge_asof — see note above"
            ev[col] = pd.merge_asof(left, right, on="feature_time",
                                    direction="backward")[col].to_numpy()
        trend_cols.append(col)
    ev["trend"] = ev[trend_cols[0]].fillna("unknown") if trend_cols else "unknown"

    return ev


def _confluence(ev: pd.DataFrame, levels: pd.DataFrame, tol_atr: float = 0.25) -> np.ndarray:
    """Count of other levels live at the event time within `tol_atr` × ATR.

    Done as a day-bucketed sweep rather than a full interval join: exact
    interval overlap for 10^5 levels × 10^5 events is a needless quadratic,
    and level lifetimes are measured in days, so bucketing by day gives the
    same answer everywhere it matters.
    """
    born = pd.DatetimeIndex(levels["born"])
    expire = pd.DatetimeIndex(levels["expire"])
    lp = levels["price"].to_numpy()
    ev_day = pd.DatetimeIndex(ev["feature_time"]).floor("D")

    # Bucket each level into every day of its life, carrying its birth time so
    # the count can still exclude levels born LATER on the event's own day —
    # a confluence count that includes a level created three hours in the
    # future is lookahead, even though it is "only" a context feature.
    # Times are carried as int64 nanoseconds throughout — mixing tz-aware
    # Timestamps and numpy datetime64 in the same comparison is a trap.
    born_ns = born.asi8

    by_day: dict[pd.Timestamp, list[tuple[float, int]]] = {}
    for b, e, p, bn in zip(born, expire, lp, born_ns):
        for d in pd.date_range(b.floor("D"), e.ceil("D"), freq="D"):
            by_day.setdefault(d, []).append((p, bn))
    arrs = {d: (np.asarray([x[0] for x in v], dtype=float),
                np.asarray([x[1] for x in v], dtype="int64"))
            for d, v in by_day.items()}

    out = np.zeros(len(ev))
    tol = tol_atr * ev["atr0"].to_numpy()
    prices = ev["level_price"].to_numpy()
    ev_time = pd.DatetimeIndex(ev["feature_time"]).asi8
    for i, (d, p, t, now) in enumerate(zip(ev_day, prices, tol, ev_time)):
        hit = arrs.get(d)
        if hit is None or not np.isfinite(t):
            continue
        arr, arr_born = hit
        out[i] = max(int(np.sum((np.abs(arr - p) <= t) & (arr_born <= now))) - 1, 0)
    return out
