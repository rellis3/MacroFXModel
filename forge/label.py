"""label — what actually happened after each event, priced honestly.

An event is only a hypothesis until it has an outcome attached, and how you
attach it decides most of the answer. Four choices, each made deliberately:

  1. **Entry is the NEXT bar's open.** Every context feature is computed at
     the close of the trigger bar; the fill is the open of the bar after it.
     No feature can touch the bar it is filled on.

  2. **Barriers scale with ATR, not dollars.** Gold ran $1,063 → $4,328 across
     this dataset and its daily range went with it. A fixed $10 stop is a
     3-sigma stop in 2016 and a scratch in 2026, so a fixed-dollar grid would
     be silently testing a different strategy in each half of the data. Every
     stop here is `sl_atr × ATR-at-decision-time`.

  3. **Outcomes resolve on the real M1 path**, not on the event timeframe's
     OHLC. Whether the stop or the target came first inside a 15-minute bar is
     exactly the question, and only M1 can answer it. Even M1 is an
     approximation: when both barriers fall inside the same minute, the bar
     cannot say which came first. This module passes `pessimistic_ties=True`
     into the shared walker so those resolve as STOPS. With sub-ATR stops and
     a 1:1 target the same-bar case is a few percent of all trades and it is
     entirely one-directional — awarding it to the target manufactures a small
     permanent edge exactly where the search is most likely to go looking.

  4. **Cost is charged at a defensible retail level and then stress-tested.**
     `pylego.costs` puts gold's default spread at $0.30. That is a tight
     quote, not a typical fill: real XAUUSD retail spreads widen around news
     and the rollover, and market orders slip. Every run should be read at
     `--cost-mult 2` as well as 1, because at a 0.75×M15-ATR stop (~$1.50)
     one extra $0.30 of cost is another 0.2R off every single trade, and that
     is the difference between most of these cells working and none of them.

  5. **Both directions are always raced.** The engine is not told which way to
     trade a level; long and short outcomes are both recorded and the
     discovery layer decides. Racing only the "obvious" direction bakes the
     answer in.

The forward-path walk itself is `pylego.barrier_race` — the same walker every
other SL/TP study in this repo uses. Not a copy of it.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from pylego.barrier_race import Entry, race_trades
from pylego.costs import default_spread

# Stop distances are bucketed onto a 1%-relative log grid before racing, so
# events with near-identical stops share one call into the walker. The
# resulting stop is within 0.5% of the exact ATR-scaled distance — immaterial
# next to spread, and it keeps the labelling to a few hundred vectorized calls
# instead of a few million single-entry ones.
SL_BUCKET_REL = 0.01


def _bucket(sl_price: np.ndarray) -> np.ndarray:
    with np.errstate(divide="ignore", invalid="ignore"):
        k = np.round(np.log(sl_price) / np.log(1.0 + SL_BUCKET_REL))
    return np.where(np.isfinite(sl_price) & (sl_price > 0), k, np.nan)


def label_events(ev: pd.DataFrame, m1: pd.DataFrame, sl_atr: float = 1.0,
                 tp_r: float = 2.0, horizon_bars: int = 1440,
                 cost_price: float | None = None, pair: str = "gold",
                 cost_mult: float = 1.0) -> pd.DataFrame:
    """Attach `r_long` / `r_short` (net of cost, in R) to every event.

    `horizon_bars` is in M1 bars — 1440 is one 24h session, i.e. "this idea
    either works today or it is closed". An event that runs out of forward data
    is dropped rather than assumed flat.

    Returns a copy of `ev` with `sl_price`, `r_long`, `r_short`, `out_long`,
    `out_short`, `bars_long`, `bars_short` added, restricted to events that
    resolved.
    """
    if cost_price is None:
        cost_price = default_spread(pair) * cost_mult

    ev = ev.copy()
    ev["sl_price"] = sl_atr * ev["atr0"]
    entry_i = m1.index.searchsorted(pd.DatetimeIndex(ev["entry_time"]), side="left")
    ev["m1_idx"] = entry_i

    ok = (ev["sl_price"] > 0) & np.isfinite(ev["sl_price"]) & (entry_i < len(m1) - 10)
    ev = ev[ok].copy()
    if ev.empty:
        return ev

    buckets = _bucket(ev["sl_price"].to_numpy())
    ev["_bucket"] = buckets

    results = {d: {} for d in (1, -1)}
    for b, grp in ev.groupby("_bucket", sort=False):
        sl_b = float((1.0 + SL_BUCKET_REL) ** b)
        idxs = grp.index.to_numpy()
        m1i = grp["m1_idx"].to_numpy()
        for direction in (1, -1):
            entries = [Entry(idx=int(i), direction=direction) for i in m1i]
            recs = race_trades(m1, entries, sl=sl_b, tp_r=tp_r,
                               max_bars_ahead=horizon_bars, cost_price=cost_price,
                               pessimistic_ties=True)
            # race_trades drops entries without runway; align on its own idx.
            by_idx: dict[int, dict] = {}
            for r in recs:
                by_idx.setdefault(r["idx"], r)
            for row_id, mi in zip(idxs, m1i):
                r = by_idx.get(int(mi))
                if r is not None:
                    results[direction][row_id] = (r["r"], r["outcome"], r["bars_held"])

    for direction, tag in ((1, "long"), (-1, "short")):
        got = results[direction]
        ev[f"r_{tag}"] = [got.get(i, (np.nan,))[0] for i in ev.index]
        ev[f"out_{tag}"] = [got.get(i, (np.nan, None))[1] if i in got else None for i in ev.index]
        ev[f"bars_{tag}"] = [got.get(i, (np.nan, None, np.nan))[2] if i in got else np.nan
                             for i in ev.index]

    ev = ev.dropna(subset=["r_long", "r_short"]).drop(columns=["_bucket"])
    ev["sl_atr"] = sl_atr
    ev["tp_r"] = tp_r
    return ev.reset_index(drop=True)


def label_grid(ev: pd.DataFrame, m1: pd.DataFrame, sl_atr_grid=(0.75, 1.5),
               tp_r_grid=(1.0, 2.0, 3.0), horizon_bars: int = 1440,
               pair: str = "gold", cost_mult: float = 1.0,
               progress: bool = False) -> pd.DataFrame:
    """`label_events` across a barrier grid, stacked long.

    The grid is part of the hypothesis space, not a tuning step done after the
    fact — a level that only works at one exact stop distance is a level that
    doesn't work, and the discovery layer needs to see every cell it was
    offered in order to charge for having looked at them all.
    """
    out = []
    for sl_atr in sl_atr_grid:
        for tp_r in tp_r_grid:
            lab = label_events(ev, m1, sl_atr=sl_atr, tp_r=tp_r,
                               horizon_bars=horizon_bars, pair=pair, cost_mult=cost_mult)
            if progress:
                print(f"  labelled sl={sl_atr} tp_r={tp_r}: {len(lab)} events", flush=True)
            out.append(lab)
    return pd.concat(out, ignore_index=True) if out else pd.DataFrame()
