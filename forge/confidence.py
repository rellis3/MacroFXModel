"""confidence — a small, PRE-REGISTERED confluence score, tested as one
hypothesis instead of a combinatorial search.

The trap this module exists to avoid: "only trade when N things line up"
*sounds* more rigorous than a single condition, but naively implemented it is
the opposite. Five binary confluence factors is not five hypotheses to test —
it is up to 2^5 = 32 combinations, and searching all of them per level kind
per direction per barrier reproduces exactly the "found a pattern" illusion
`discover.py`'s FDR correction and null control exist to prevent, just dressed
up as "5 things lined up".

The discipline that keeps this honest: a FIXED, small set of factors, decided
here — not tuned against results — combined into ONE integer score (how many
fired), and used to define exactly one new hypothesis per level kind: does
`confidence >= threshold` outperform `confidence < threshold`? That is one
comparison, not a search over which subset of factors to require. It still has
to clear the same random-level null as everything else, because a threshold
that merely correlates with the volatility regime (which already explains most
of what earlier runs found) would pass a naive check for the wrong reason.

Four factors, chosen for being at least partially INDEPENDENT of each other and
of the level's own price series — stacking four measurements of the same price
series is weaker evidence than four different views of the market:

  stack     — other levels piled at the same price (same series, geometric view)
  reject    — HOW price arrived: a thrust-and-reject vs a clean break-through
              (same series, a different dimension of it — shape, not location)
  htf_with  — does the higher-timeframe trend agree with the trade direction
              (same series, longer horizon)
  dxy_confirm — does a synthetic dollar basket move the way gold's thesis
              needs it to at the same moment (a GENUINELY different series —
              this is the one factor immune to "it's just gold's own noise
              correlating with itself")
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from forge.bars import load_m1, resample

DXY_LEGS = {
    # weight sign: +1 if USD is the BASE (USD/xxx, dollar strength = pair up),
    # -1 if USD is the QUOTE (xxx/USD, dollar strength = pair down). Matches
    # the classic DXY basket's five most liquid components available here
    # (SEK is not in this dataset's pair list, so it is dropped rather than
    # faked — six components would not be the real DXY either way, so no
    # attempt is made to reproduce its exact weights, only its DIRECTION).
    "eurusd": -1.0, "gbpusd": -1.0, "usdjpy": 1.0, "usdchf": 1.0, "usdcad": 1.0,
}


def build_dollar_basket(tf: str, data_root: str = "VolRangeForecaster/data/m1",
                        index: pd.DatetimeIndex | None = None) -> pd.Series:
    """A synthetic dollar-strength index at `tf`, log-return based.

    Not a DXY replica — no attempt to match its exact weights or base year —
    only its DIRECTION: equal-weighted average of each leg's log return,
    signed so that a rising value means a broadly stronger dollar. That is
    all a *divergence* confirmation needs: "did the dollar move the way this
    gold thesis requires", not "what is the DXY print".

    Returns a cumulative log-index (starts at 0), resampled/reindexed to `tf`
    (or to `index` if given) so it lines up with a gold `bars` frame bar for
    bar. Built once per run and reused — this is NOT gold's own price, so it
    cannot inherit gold's causality bugs, but it has its own: resampling must
    use the same left-labelled, gap-dropping `resample()` as gold's own bars,
    or the two series disagree about which bar is "now".
    """
    logrets = []
    for pair, sign in DXY_LEGS.items():
        m1 = load_m1(pair, data_root)
        bars = resample(m1, tf) if tf != "m1" else m1
        lr = np.log(bars["close"]).diff() * sign
        logrets.append(lr.rename(pair))
    df = pd.concat(logrets, axis=1)
    # Legs can have slightly different M1 coverage at the edges; an outright
    # inner join would silently shrink the sample, so instead average over
    # whichever legs are present per bar and only drop bars with NONE.
    avg = df.mean(axis=1, skipna=True)
    avg = avg[df.notna().any(axis=1)]
    idx = avg.cumsum().rename("dxy_proxy")
    if index is not None:
        # `bars.py`'s frames are left-labelled and share gold's own clock, so
        # an exact reindex (not asof) is correct here — same timeframe, same
        # origin, no offset to bridge.
        idx = idx.reindex(index)
    return idx


CONFIDENCE_FACTORS = ("stack", "reject", "htf_with", "dxy_confirm")


def score_events(ev: pd.DataFrame, dxy: pd.Series | None = None,
                 dxy_window: int = 8, dxy_min_move_sigma: float = 0.5,
                 stack_min: int = 2, reject_min_wick_atr: float = 0.3,
                 reject_max_close_beyond_atr: float = 0.0) -> pd.DataFrame:
    """Attach the four factor flags AND the summed `confidence` score.

    Every flag is defined per (event, direction) — a factor can confirm a long
    and simultaneously fail to confirm the short at the very same event, which
    is correct: confluence is a property of a THESIS (this level, this
    direction), not of the touch in isolation. Returns two new columns per
    factor (`{factor}_long`, `{factor}_short`) plus `confidence_long`/
    `confidence_short`, all appended to a copy of `ev`.
    """
    ev = ev.copy()
    n = len(ev)

    stack = (ev["confluence_n"].to_numpy() >= stack_min)

    # Reject: price pierced beyond the level (a real test) but closed back
    # on the near side without much follow-through — a thrust-and-reject,
    # not a clean break. Direction-specific: this shape only confirms a trade
    # in the direction price REJECTED TOWARD.
    pierced = ev["wick_beyond_atr"].to_numpy() >= reject_min_wick_atr
    rejected = ev["close_beyond_atr"].to_numpy() <= reject_max_close_beyond_atr
    reject_shape = pierced & rejected
    # `side` is already "which way price was approaching FROM"; a reject
    # confirms trading back in that same direction.
    side = ev["side"].to_numpy()
    reject_long = reject_shape & (side > 0)
    reject_short = reject_shape & (side < 0)

    trend_cols = [c for c in ev.columns if c.startswith("trend_")]
    if trend_cols:
        trend = ev[trend_cols[0]].to_numpy()
    else:
        trend = ev.get("trend", pd.Series(["unknown"] * n)).to_numpy()
    htf_with_long = trend == "trend_up"
    htf_with_short = trend == "trend_down"

    if dxy is not None and len(dxy):
        # Momentum of the dollar basket over the `dxy_window` bars ending at
        # feature_time — the same instant gold's own context is measured at,
        # so this cannot see further into the future than any other feature.
        # `dxy` is built on the SAME timeframe/clock as the event frame (see
        # `build_dollar_basket`'s `index=` param), so every feature_time
        # should already be one of its own timestamps; `ffill` (last value AT
        # OR BEFORE) is still used rather than an exact lookup so a bar with
        # no dollar-basket print (a leg briefly missing) degrades to the last
        # known value instead of dropping the event. `ffill` never reaches
        # into the future — unlike `interpolate`, which would use the NEXT
        # known point to fill a gap and quietly leak one bar ahead.
        mom = dxy - dxy.shift(dxy_window)
        sigma = mom.rolling(500, min_periods=50).std()
        z_series = mom / sigma
        z = z_series.reindex(pd.DatetimeIndex(ev["feature_time"]), method="ffill").to_numpy()
        # Gold and the dollar are structurally near-inverse (gold is priced in
        # USD), so a gold-LONG thesis is confirmed by dollar WEAKNESS (z very
        # negative) and a gold-SHORT thesis by dollar STRENGTH (z very
        # positive) — this is the one factor that fails independently of
        # gold's own price action, which is exactly why it is here.
        dxy_confirm_long = z <= -dxy_min_move_sigma
        dxy_confirm_short = z >= dxy_min_move_sigma
    else:
        dxy_confirm_long = np.zeros(n, dtype=bool)
        dxy_confirm_short = np.zeros(n, dtype=bool)

    ev["stack_long"] = stack; ev["stack_short"] = stack
    ev["reject_long"] = reject_long; ev["reject_short"] = reject_short
    ev["htf_with_long"] = htf_with_long; ev["htf_with_short"] = htf_with_short
    ev["dxy_confirm_long"] = dxy_confirm_long; ev["dxy_confirm_short"] = dxy_confirm_short

    for d in ("long", "short"):
        ev[f"confidence_{d}"] = sum(
            ev[f"{f}_{d}"].astype(int) for f in CONFIDENCE_FACTORS
        )
    return ev
