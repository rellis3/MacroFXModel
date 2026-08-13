"""levels — the level zoo: every structural price a price-action trader names,
emitted as records that know *when they became knowable*.

This is layer 1 of the engine, and it is where the domain vocabulary lives.
The engine cannot discover a concept that isn't expressed here — that is the
honest limit of "self-designing": the machine searches a space, and this
module is the space. What it removes is the human's ability to only look at
the levels they already believe in.

Every level carries a `born` timestamp, and the contract is absolute: a level
born at time t may not be used to make a decision before t. Three places
where that is easy to get wrong, and how each is handled:

  * **Daily/weekly anchors** (PDH, pivots, profile) are derived from a
    *completed* prior period, so they are born at the start of the period they
    are used in — never at the timestamp of the bar that made them.
  * **Swing pivots** need `n` bars on each side to be confirmed, so a pivot
    printed at bar i is born at bar i+n, not bar i. Reading it at bar i is
    lookahead dressed up as market structure, and it is the single most common
    way a "support/resistance" backtest lies.
  * **FVGs / order blocks** are born at the close of the bar that confirms
    them, not at the bar that formed the wick.

The third one has a trap in it that cost real debugging time and is worth
naming. `forge.bars.resample` is LEFT-labelled: the H1 bar covering 03:00–04:00
is stamped `03:00`. A fair value gap confirmed by that bar is therefore
tempting to stamp `born = 03:00` — and that is wrong by one whole bar. The
gap's own upper edge IS that bar's low, which is not known until 04:00. Stamp
it 03:00 and an M15 event fires at 03:15 holding a boundary derived from the
next 45 minutes of price, which reads as a spectacular support level and is
pure lookahead. Every bar-derived level here is therefore born at
`next_open(tf, i)` — the timestamp of the FOLLOWING bar on its own timeframe,
which is the first instant the pattern is complete and actionable.

Levels are returned in one long DataFrame so downstream layers can treat every
family identically:

    kind    fine-grained name ('pdh', 'val', 'npoc', 'fvg_bull', 'ob_bear', …)
    family  coarse group ('day_anchor','profile','pivot','imbalance',
            'order_block','swing','round','session_range')
    tf      timeframe the level was derived from
    price   the single reference price (zone midpoint for zones)
    lo, hi  zone bounds (== price for pure lines)
    born    first timestamp the level may be acted on
    expire  last timestamp it stays live (life caps below)
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from pylego.swing_structure import pivot_highs, pivot_lows

from forge.bars import day_key, resample, week_key

LEVEL_COLS = ["kind", "family", "tf", "price", "lo", "hi", "born", "expire"]

# How long a level stays live before the engine stops asking about it. These
# are deliberately generous — the discovery layer buckets by level age, so if
# an old level is worthless the data will say so rather than a cap deciding it.
DEFAULT_LIFE = {
    "day_anchor":    pd.Timedelta(days=5),
    "pivot":         pd.Timedelta(days=1),
    "profile":       pd.Timedelta(days=10),
    "session_range": pd.Timedelta(days=2),
    "imbalance":     pd.Timedelta(days=10),
    "order_block":   pd.Timedelta(days=10),
    "swing":         pd.Timedelta(days=15),
    "round":         pd.Timedelta(days=1),
    "week_anchor":   pd.Timedelta(days=20),
}


def _empty() -> pd.DataFrame:
    return pd.DataFrame(columns=LEVEL_COLS)


def next_open(times: pd.DatetimeIndex, i: int) -> pd.Timestamp | None:
    """The timestamp at which bar `i` has finished — i.e. the open of bar i+1.

    The single most important helper in this module. Any level whose
    definition touches bar i's own high/low/close is not knowable until bar i
    closes, and on a left-labelled index that instant is `times[i+1]`, not
    `times[i]`. Returns None at the end of the data, where the level would
    never be actionable anyway.
    """
    return times[i + 1] if i + 1 < len(times) else None


def _pack(rows: list[dict]) -> pd.DataFrame:
    if not rows:
        return _empty()
    df = pd.DataFrame(rows)
    for c in LEVEL_COLS:
        if c not in df.columns:
            df[c] = np.nan
    return df[LEVEL_COLS]


# ── period aggregation ───────────────────────────────────────────────────────

def period_ohlc(m1: pd.DataFrame, keys: np.ndarray) -> pd.DataFrame:
    """OHLC + first/last timestamp for each period label in `keys`."""
    g = m1.groupby(keys)
    out = pd.DataFrame({
        "open": g["open"].first(),
        "high": g["high"].max(),
        "low": g["low"].min(),
        "close": g["close"].last(),
        "start": g.apply(lambda d: d.index[0], include_groups=False),
        "end": g.apply(lambda d: d.index[-1], include_groups=False),
    })
    return out.sort_index()


# ── daily & weekly anchors ───────────────────────────────────────────────────

def day_anchor_levels(daily: pd.DataFrame, life: pd.Timedelta | None = None) -> pd.DataFrame:
    """Prior-day high/low/close/mid + the current day's open.

    Row i of `daily` is used to build levels that go live at the START of row
    i+1, which is exactly when a trader first knows them.
    """
    life = life or DEFAULT_LIFE["day_anchor"]
    rows = []
    for i in range(1, len(daily)):
        prev, cur = daily.iloc[i - 1], daily.iloc[i]
        born = cur["start"]
        exp = born + life
        mid = (prev["high"] + prev["low"]) / 2.0
        for kind, price in (("pdh", prev["high"]), ("pdl", prev["low"]),
                            ("pdc", prev["close"]), ("pd_mid", mid)):
            rows.append(dict(kind=kind, family="day_anchor", tf="d1", price=price,
                             lo=price, hi=price, born=born, expire=exp))
        # The day's own open is knowable at the open, and is its own reference.
        rows.append(dict(kind="dopen", family="day_anchor", tf="d1", price=cur["open"],
                         lo=cur["open"], hi=cur["open"], born=born, expire=exp))
    return _pack(rows)


def week_anchor_levels(weekly: pd.DataFrame, life: pd.Timedelta | None = None) -> pd.DataFrame:
    life = life or DEFAULT_LIFE["week_anchor"]
    rows = []
    for i in range(1, len(weekly)):
        prev, cur = weekly.iloc[i - 1], weekly.iloc[i]
        born = cur["start"]
        exp = born + life
        mid = (prev["high"] + prev["low"]) / 2.0
        for kind, price in (("pwh", prev["high"]), ("pwl", prev["low"]),
                            ("pwc", prev["close"]), ("pw_mid", mid),
                            ("wopen", cur["open"])):
            rows.append(dict(kind=kind, family="week_anchor", tf="w1", price=price,
                             lo=price, hi=price, born=born, expire=exp))
    return _pack(rows)


def pivot_levels(daily: pd.DataFrame, style: str = "classic",
                 life: pd.Timedelta | None = None, tf: str = "d1") -> pd.DataFrame:
    """Floor-trader pivots from the prior period's HLC.

    Both the classic set and Camarilla are emitted as separate `kind`s rather
    than the engine picking one — which pivot formula gold respects (if any)
    is a question for the data, not a preference to hard-code.
    """
    life = life or DEFAULT_LIFE["pivot"]
    rows = []
    for i in range(1, len(daily)):
        prev, cur = daily.iloc[i - 1], daily.iloc[i]
        h, l, c = prev["high"], prev["low"], prev["close"]
        rng = h - l
        born = cur["start"]
        exp = born + life
        if style == "classic":
            pp = (h + l + c) / 3.0
            vals = {
                "pp": pp, "r1": 2 * pp - l, "s1": 2 * pp - h,
                "r2": pp + rng, "s2": pp - rng,
                "r3": h + 2 * (pp - l), "s3": l - 2 * (h - pp),
            }
        elif style == "camarilla":
            vals = {
                "cam_r4": c + rng * 1.1 / 2, "cam_r3": c + rng * 1.1 / 4,
                "cam_r2": c + rng * 1.1 / 6, "cam_r1": c + rng * 1.1 / 12,
                "cam_s1": c - rng * 1.1 / 12, "cam_s2": c - rng * 1.1 / 6,
                "cam_s3": c - rng * 1.1 / 4, "cam_s4": c - rng * 1.1 / 2,
            }
        else:
            raise ValueError(f"unknown pivot style {style!r}")
        for kind, price in vals.items():
            rows.append(dict(kind=f"{tf}_{kind}", family="pivot", tf=tf, price=price,
                             lo=price, hi=price, born=born, expire=exp))
    return _pack(rows)


# ── volume profile ───────────────────────────────────────────────────────────

def _profile_one(day_bars: pd.DataFrame, n_bins: int = 100,
                 value_area: float = 0.70) -> tuple[float, float, float] | None:
    """POC / VAH / VAL for one period from M1 bars.

    Volume is binned on each M1 bar's typical price. Two honesty notes that
    matter for reading any result built on this:

      * Broker `volume` is TICK COUNT, not traded contracts. It correlates
        with real volume but is not it; a POC from tick volume is a proxy for
        a POC from CME gold futures volume. If the feed has no volume at all
        the profile degrades to a TPO/time profile (every bar weighted 1),
        which is a defensible object in its own right — but a different one.
      * Bin width scales with the period's range, so the resolution means the
        same thing at $1,100 gold and $4,300 gold.
    """
    if len(day_bars) < 10:
        return None
    lo, hi = float(day_bars["low"].min()), float(day_bars["high"].max())
    if not np.isfinite(lo) or not np.isfinite(hi) or hi <= lo:
        return None
    typical = ((day_bars["high"] + day_bars["low"] + day_bars["close"]) / 3.0).to_numpy()
    vol = day_bars["volume"].to_numpy()
    if not np.isfinite(vol).any() or np.nansum(vol) <= 0:
        vol = np.ones(len(day_bars))       # time profile fallback
    vol = np.nan_to_num(vol)

    edges = np.linspace(lo, hi, n_bins + 1)
    hist, _ = np.histogram(typical, bins=edges, weights=vol)
    if hist.sum() <= 0:
        return None
    centers = (edges[:-1] + edges[1:]) / 2.0

    poc_i = int(np.argmax(hist))
    target = hist.sum() * value_area
    lo_i = hi_i = poc_i
    acc = hist[poc_i]
    while acc < target and (lo_i > 0 or hi_i < len(hist) - 1):
        # Standard value-area walk: step to whichever adjacent bin holds more.
        down = hist[lo_i - 1] if lo_i > 0 else -1.0
        up = hist[hi_i + 1] if hi_i < len(hist) - 1 else -1.0
        if up >= down:
            hi_i += 1
            acc += hist[hi_i]
        else:
            lo_i -= 1
            acc += hist[lo_i]
    return float(centers[poc_i]), float(centers[hi_i]), float(centers[lo_i])


def profile_levels(m1: pd.DataFrame, keys: np.ndarray, tf_name: str = "d1",
                   life: pd.Timedelta | None = None,
                   naked_life: pd.Timedelta = pd.Timedelta(days=60)) -> pd.DataFrame:
    """POC / VAH / VAL of each completed period, live during the next one,
    plus **naked POCs** — a prior period's POC that price has not traded back
    through, which stays live until it is finally tagged.

    The naked POC is the one level here whose whole identity is "untouched",
    so it gets its own lifetime rule: born when the next period starts, dies
    the moment price trades through it (or after `naked_life`).
    """
    life = life or DEFAULT_LIFE["profile"]
    period_starts = pd.Series(m1.index).groupby(keys).first()
    rows = []
    pocs: list[tuple[float, pd.Timestamp]] = []   # (price, born) still naked

    grouped = list(m1.groupby(keys))
    for i in range(1, len(grouped)):
        _, prev_bars = grouped[i - 1]
        cur_label, cur_bars = grouped[i]
        prof = _profile_one(prev_bars)
        if prof is None:
            continue
        poc, vah, val = prof
        born = cur_bars.index[0]
        exp = born + life
        for kind, price in (("poc", poc), ("vah", vah), ("val", val)):
            rows.append(dict(kind=f"{tf_name}_{kind}", family="profile", tf=tf_name,
                             price=price, lo=price, hi=price, born=born, expire=exp))

        # Naked-POC bookkeeping: any earlier POC the just-completed period
        # traded through stops being naked — at the MINUTE it was tagged, not
        # at the end of the period. Expiring it at the period end would leave
        # it live for hours after it stopped being naked, and every event
        # fired in that window would be labelled `npoc` while describing a
        # level that had already been traded through. That is not lookahead,
        # it is worse: it silently redefines the concept being measured.
        p_lo, p_hi = float(prev_bars["low"].min()), float(prev_bars["high"].max())
        still = []
        for price, nborn in pocs:
            if p_lo <= price <= p_hi:
                touched = prev_bars[(prev_bars["low"] <= price) & (prev_bars["high"] >= price)]
                died = touched.index[0] if len(touched) else prev_bars.index[-1]
                rows.append(dict(kind=f"{tf_name}_npoc", family="profile", tf=tf_name,
                                 price=price, lo=price, hi=price, born=nborn,
                                 expire=died))
            elif born - nborn > naked_life:
                rows.append(dict(kind=f"{tf_name}_npoc", family="profile", tf=tf_name,
                                 price=price, lo=price, hi=price, born=nborn,
                                 expire=nborn + naked_life))
            else:
                still.append((price, nborn))
        pocs = still + [(poc, born)]

    # POCs still naked at the end of the data stay live to the last bar.
    last = m1.index[-1]
    for price, nborn in pocs:
        rows.append(dict(kind=f"{tf_name}_npoc", family="profile", tf=tf_name,
                         price=price, lo=price, hi=price, born=nborn,
                         expire=min(last, nborn + naked_life)))
    return _pack(rows)


# ── session ranges ───────────────────────────────────────────────────────────

def session_range_levels(m1: pd.DataFrame, days: np.ndarray,
                         window: tuple[int, int] = (0, 7), name: str = "asia",
                         life: pd.Timedelta | None = None) -> pd.DataFrame:
    """High/low/mid of a UTC session window, born the moment that window
    closes (not at the extreme's own timestamp — the range is not known until
    the session is over)."""
    life = life or DEFAULT_LIFE["session_range"]
    lo_h, hi_h = window
    hours = m1.index.hour.to_numpy()
    in_win = (hours >= lo_h) & (hours < hi_h)
    sub = m1[in_win]
    sub_days = days[in_win]
    if len(sub) == 0:
        return _empty()
    g = sub.groupby(sub_days)
    hi = g["high"].max()
    lo = g["low"].min()
    end = g.apply(lambda d: d.index[-1], include_groups=False)
    rows = []
    for label in hi.index:
        # `end` is the last M1 bar INSIDE the window, and its own high/low
        # count toward the range — so the range is complete one minute later.
        born = end.loc[label] + pd.Timedelta(minutes=1)
        exp = born + life
        h, l = float(hi.loc[label]), float(lo.loc[label])
        for kind, price in ((f"{name}_high", h), (f"{name}_low", l),
                            (f"{name}_mid", (h + l) / 2.0)):
            rows.append(dict(kind=kind, family="session_range", tf="m1", price=price,
                             lo=price, hi=price, born=born, expire=exp))
    return _pack(rows)


# ── imbalance (FVG) ──────────────────────────────────────────────────────────

def fvg_levels(bars: pd.DataFrame, tf: str, min_atr: float = 0.25,
               life: pd.Timedelta | None = None) -> pd.DataFrame:
    """Three-bar fair value gaps, born at the close of the third bar and dying
    when price trades back into the gap.

    `min_atr` filters out gaps smaller than a fraction of ATR — without it,
    every other M15 bar on a quiet Asian session prints a technically-valid
    one-cent gap, and the engine ends up measuring rounding noise.
    """
    life = life or DEFAULT_LIFE["imbalance"]
    high = bars["high"].to_numpy()
    low = bars["low"].to_numpy()
    a0 = bars["atr0"].to_numpy()
    times = bars.index
    rows = []
    # bull gap: low[i] > high[i-2]  |  bear gap: high[i] < low[i-2]
    for i in range(2, len(bars)):
        scale = a0[i] if a0[i] > 0 else np.nan
        if not np.isfinite(scale):
            continue
        if low[i] > high[i - 2]:
            g_lo, g_hi, kind = high[i - 2], low[i], "fvg_bull"
        elif high[i] < low[i - 2]:
            g_lo, g_hi, kind = high[i], low[i - 2], "fvg_bear"
        else:
            continue
        if (g_hi - g_lo) < min_atr * scale:
            continue
        # The gap's near edge is bar i's own low (bull) / high (bear), so the
        # gap is not knowable until bar i closes. See the module head.
        born = next_open(times, i)
        if born is None:
            continue
        # Death = first later bar whose range enters the gap. The forward
        # search is capped at the level's lifetime by timestamp (not by a bar
        # count — bar spacing is not uniform across weekends), which keeps this
        # O(life) per gap instead of O(remaining history).
        end_i = int(times.searchsorted(born + life))
        fill = np.flatnonzero((low[i + 1:end_i] <= g_hi) & (high[i + 1:end_i] >= g_lo))
        died = times[i + 1 + int(fill[0])] if fill.size else min(born + life, times[-1])
        rows.append(dict(kind=f"{tf}_{kind}", family="imbalance", tf=tf,
                         price=(g_lo + g_hi) / 2.0, lo=g_lo, hi=g_hi,
                         born=born, expire=died))
    return _pack(rows)


# ── order blocks ─────────────────────────────────────────────────────────────

def order_block_levels(bars: pd.DataFrame, tf: str, disp_atr: float = 1.0,
                       life: pd.Timedelta | None = None) -> pd.DataFrame:
    """The last opposing candle before a displacement leg.

    Definition used (stated explicitly, because "order block" means six things
    to six people): a displacement bar is one whose BODY exceeds `disp_atr` ×
    prior ATR **and** which leaves a fair value gap against the preceding bar.
    The order block is the most recent candle of opposite colour before it;
    the zone is that candle's full high–low. Born at the close of the
    displacement bar — the point at which the pattern is actually identifiable
    — and dies when price closes back through the far side of the zone.
    """
    life = life or DEFAULT_LIFE["order_block"]
    o = bars["open"].to_numpy(); c = bars["close"].to_numpy()
    h = bars["high"].to_numpy(); l = bars["low"].to_numpy()
    a0 = bars["atr0"].to_numpy()
    times = bars.index
    body = c - o
    rows = []
    for i in range(2, len(bars)):
        scale = a0[i]
        if not (scale > 0):
            continue
        if abs(body[i]) < disp_atr * scale:
            continue
        bullish = body[i] > 0
        if bullish and not (l[i] > h[i - 2]):
            continue
        if (not bullish) and not (h[i] < l[i - 2]):
            continue
        # Walk back to the last candle of opposite colour.
        j = i - 1
        while j >= 0 and ((body[j] > 0) == bullish):
            j -= 1
        if j < 0:
            continue
        z_lo, z_hi = float(l[j]), float(h[j])
        # The displacement bar's body/gap is what identifies the block, so the
        # block is not knowable until that bar closes.
        born = next_open(times, i)
        if born is None:
            continue
        kind = "ob_bull" if bullish else "ob_bear"
        # Invalidated on a close through the far side (search capped at the
        # level's lifetime — see the same note in `fvg_levels`).
        end_i = int(times.searchsorted(born + life))
        after = c[i + 1:end_i]
        if bullish:
            bad = np.flatnonzero(after < z_lo)
        else:
            bad = np.flatnonzero(after > z_hi)
        died = times[i + 1 + int(bad[0])] if bad.size else min(born + life, times[-1])
        rows.append(dict(kind=f"{tf}_{kind}", family="order_block", tf=tf,
                         price=(z_lo + z_hi) / 2.0, lo=z_lo, hi=z_hi,
                         born=born, expire=min(died, born + life)))
    return _pack(rows)


# ── swing liquidity ──────────────────────────────────────────────────────────

def swing_levels(bars: pd.DataFrame, tf: str, n: int = 5,
                 life: pd.Timedelta | None = None) -> pd.DataFrame:
    """Confirmed swing highs/lows — the resting-liquidity levels.

    The causality fix that matters: a pivot needs `n` bars on its right to be
    confirmed, so the level is born at bar `idx + n`, NOT at the pivot bar.
    Using the pivot bar's own timestamp lets a backtest "know" a swing high
    while price is still making it, which manufactures perfect fades.
    """
    life = life or DEFAULT_LIFE["swing"]
    times = bars.index
    rows = []
    for pivots, kind in ((pivot_highs(bars, n), "swing_high"),
                         (pivot_lows(bars, n), "swing_low")):
        for p in pivots:
            # A pivot needs n bars to its right; the LAST of those is bar
            # idx+n, so confirmation lands when bar idx+n closes.
            born = next_open(times, p.idx + n)
            if born is None:
                continue
            rows.append(dict(kind=f"{tf}_{kind}", family="swing", tf=tf,
                             price=float(p.price), lo=float(p.price), hi=float(p.price),
                             born=born, expire=min(born + life, times[-1])))
    return _pack(rows)


# ── round numbers ────────────────────────────────────────────────────────────

def round_levels(daily: pd.DataFrame, step: float, kind: str,
                 reach: int = 3, life: pd.Timedelta | None = None) -> pd.DataFrame:
    """Round-number levels within `reach` steps of each day's open."""
    life = life or DEFAULT_LIFE["round"]
    rows = []
    for i in range(len(daily)):
        cur = daily.iloc[i]
        born, exp = cur["start"], cur["start"] + life
        base = np.floor(cur["open"] / step) * step
        for k in range(-reach, reach + 1):
            price = float(base + k * step)
            rows.append(dict(kind=kind, family="round", tf="d1", price=price,
                             lo=price, hi=price, born=born, expire=exp))
    return _pack(rows)


# ── the zoo ──────────────────────────────────────────────────────────────────

def build_levels(m1: pd.DataFrame, frames: dict[str, pd.DataFrame],
                 day_start_hour: int = 0, round_steps: tuple[float, ...] = (),
                 include: tuple[str, ...] | None = None) -> pd.DataFrame:
    """Assemble the whole zoo for one instrument.

    `frames` maps timeframe name → the `forge.bars.frame()` output for it
    (needs at least the timeframes used for FVG / order block / swing levels).
    `include` optionally restricts to a set of families.
    """
    days = day_key(m1.index, day_start_hour)
    weeks = week_key(m1.index, day_start_hour)
    daily = period_ohlc(m1, days)
    weekly = period_ohlc(m1, weeks)

    parts: list[pd.DataFrame] = [
        day_anchor_levels(daily),
        week_anchor_levels(weekly),
        pivot_levels(daily, "classic", tf="d1"),
        pivot_levels(daily, "camarilla", tf="d1"),
        pivot_levels(weekly, "classic", tf="w1", life=DEFAULT_LIFE["week_anchor"]),
        profile_levels(m1, days, "d1"),
        profile_levels(m1, weeks, "w1", life=DEFAULT_LIFE["week_anchor"]),
        session_range_levels(m1, days, (0, 7), "asia"),
        session_range_levels(m1, days, (7, 12), "london"),
    ]
    for step in round_steps:
        parts.append(round_levels(daily, step, f"round_{step:g}"))
    for tf, bars in frames.items():
        parts.append(fvg_levels(bars, tf))
        parts.append(order_block_levels(bars, tf))
        parts.append(swing_levels(bars, tf))

    out = pd.concat([p for p in parts if len(p)], ignore_index=True)
    out = out.dropna(subset=["price", "born"])
    if include:
        out = out[out["family"].isin(include)]
    out["born"] = pd.to_datetime(out["born"], utc=True)
    out["expire"] = pd.to_datetime(out["expire"], utc=True)
    out = out[out["expire"] > out["born"]]
    return out.sort_values("born").reset_index(drop=True)
