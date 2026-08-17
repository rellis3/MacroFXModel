"""dayflow — "trend the day's" as it actually happens: not session A vs. the
NEXT session, but session A (and B, and C) vs. WHATEVER TIME IS LEFT in the
same trading day.

Three checkpoints, each the instant a session ends and the next one begins —
the natural points where a trader watching the day unfold would ask "given
what's happened so far today, what does the rest of the day look like?":

    post_asia      07:00 UTC   seen: asia                remaining: london, overlap, ny
    post_london    12:00 UTC   seen: asia, london         remaining: overlap, ny
    post_overlap   16:00 UTC   seen: asia, london, overlap  remaining: ny

(There is no `post_ny` checkpoint — after 21:00 UTC only the thin late tail
is left, not enough real trading time to make "the rest of the day" a
meaningful target.)

Every feature at a checkpoint is built ONLY from sessions that have actually
closed by that checkpoint — this is what `forecast.py`'s walk-forward model
trains on, so the no-lookahead discipline here is load-bearing, not academic.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from forge.bars import frame
from SessionResearch.sessions import CYCLE
from SessionResearch.stats_util import circular_shift_pvalue, spearman_stat

CHECKPOINTS = [
    ("post_asia", ["asia"], ["london", "overlap", "ny"]),
    ("post_london", ["asia", "london"], ["overlap", "ny"]),
    ("post_overlap", ["asia", "london", "overlap"], ["ny"]),
]


def _wide_day_table(tab: pd.DataFrame) -> pd.DataFrame:
    """One row per day, only days where all 4 sessions passed the coverage
    filter in `sessions.build_session_table` — a day missing e.g. `ny` can't
    have a "remaining range through the close" target at all."""
    piv = tab.pivot(index="day", columns="session", values=["open", "high", "low", "close"])
    piv.columns = [f"{field}_{sess}" for field, sess in piv.columns]
    need = [f"{f}_{s}" for s in CYCLE for f in ("open", "high", "low", "close")]
    return piv.dropna(subset=need)


def build_day_checkpoints(tab: pd.DataFrame, m1: pd.DataFrame, day_start_hour: int = 0) -> pd.DataFrame:
    """One row per (day, checkpoint). See module docstring for the columns'
    exact meaning; every `*_atr` column is scaled by the PRIOR day's ATR(14)
    (`forge.bars.frame(..., 'd1')['atr0']`), so it means the same thing at
    2016 and 2026 gold prices, same as `sessions.build_session_table`."""
    piv = _wide_day_table(tab)
    daily_atr0 = frame(m1, "d1", day_start_hour=day_start_hour)["atr0"]
    daily_atr0.index = pd.DatetimeIndex(daily_atr0.index).normalize().tz_localize(None)
    atr = daily_atr0.reindex(piv.index).to_numpy()

    days_sorted = pd.DatetimeIndex(np.sort(piv.index.unique()))
    day_pos = {d: i for i, d in enumerate(days_sorted)}
    prev_pos = np.array([day_pos[d] - 1 for d in piv.index])
    has_prev = prev_pos >= 0
    prev_day = days_sorted[np.clip(prev_pos, 0, None)]  # DatetimeIndex; masked below where invalid

    day_open = piv["open_asia"].to_numpy()
    day_high_all = piv[[f"high_{s}" for s in CYCLE]].max(axis=1).to_numpy()
    day_low_all = piv[[f"low_{s}" for s in CYCLE]].min(axis=1).to_numpy()
    day_close = piv["close_ny"].to_numpy()
    total_range_atr = (day_high_all - day_low_all) / atr
    day_dir = np.sign(day_close - day_open)

    prev_range_lookup = pd.Series(total_range_atr, index=piv.index)
    prev_dir_lookup = pd.Series(day_dir, index=piv.index)
    prev_day_range_atr = prev_range_lookup.reindex(prev_day).to_numpy().copy()
    prev_day_dir = prev_dir_lookup.reindex(prev_day).to_numpy().copy()
    prev_day_range_atr[~has_prev] = np.nan
    prev_day_dir[~has_prev] = np.nan

    rows = []
    for cp_name, seen, remaining in CHECKPOINTS:
        seen_high = piv[[f"high_{s}" for s in seen]].max(axis=1).to_numpy()
        seen_low = piv[[f"low_{s}" for s in seen]].min(axis=1).to_numpy()
        checkpoint_close = piv[f"close_{seen[-1]}"].to_numpy()
        rem_high = piv[[f"high_{s}" for s in remaining]].max(axis=1).to_numpy()
        rem_low = piv[[f"low_{s}" for s in remaining]].min(axis=1).to_numpy()

        range_so_far = (seen_high - seen_low) / atr
        net_so_far = (checkpoint_close - day_open) / atr
        with np.errstate(invalid="ignore", divide="ignore"):
            pos_in_range = np.where(seen_high > seen_low, (checkpoint_close - seen_low) / (seen_high - seen_low), 0.5)
            frac_used = np.where(total_range_atr > 0, range_so_far / total_range_atr, np.nan)
        remaining_range = (rem_high - rem_low) / atr
        remaining_net = (day_close - checkpoint_close) / atr

        d = pd.DataFrame({
            "day": piv.index, "checkpoint": cp_name,
            "range_so_far_atr": range_so_far, "net_so_far_atr": net_so_far,
            "pos_in_range_so_far": pos_in_range, "frac_of_day_range_used": frac_used,
            "remaining_range_atr": remaining_range, "remaining_net_atr": remaining_net,
            "total_day_range_atr": total_range_atr,
            "prev_day_range_atr": prev_day_range_atr, "prev_day_dir": prev_day_dir,
            "dow": pd.DatetimeIndex(piv.index).dayofweek,
        })
        for s in CYCLE:
            d[f"{s}_range_atr"] = ((piv[f"high_{s}"] - piv[f"low_{s}"]) / atr).to_numpy() if s in seen else np.nan
            d[f"{s}_dir"] = np.sign(piv[f"close_{s}"] - piv[f"open_{s}"]).to_numpy() if s in seen else np.nan
        rows.append(d)
    return pd.concat(rows, ignore_index=True)


def dayflow_cells(cp: pd.DataFrame, n_perm: int = 1000, seed: int = 2) -> pd.DataFrame:
    """Does the day's morning predict its own afternoon? Two questions per
    checkpoint, same circular-shift-null discipline as handoff.py:

      range: does a big range-so-far mean a big or small remaining range —
             is the day's total range roughly a fixed budget (so_far spent =
             less left) or does a wide morning mean a wide day all the way?
      net:   does the day's move-so-far continue (momentum) or fade
             (mean reversion) into the close?
    """
    rng = np.random.default_rng(seed)
    rows = []
    for cp_name, seen, remaining in CHECKPOINTS:
        sub = cp[cp["checkpoint"] == cp_name]
        n = len(sub)
        if n < 60:
            continue
        for feat, target, tag in (("range_so_far_atr", "remaining_range_atr", "range"),
                                  ("net_so_far_atr", "remaining_net_atr", "net")):
            x, y = sub[feat].to_numpy(), sub[target].to_numpy()
            valid = np.isfinite(x) & np.isfinite(y)
            rho = spearman_stat(x[valid], y[valid])
            _, p_perm = circular_shift_pvalue(x[valid], y[valid], spearman_stat, n_perm=n_perm, rng=rng)
            rows.append(dict(checkpoint=cp_name, metric=f"{tag}_so_far_vs_remaining_spearman",
                             n=int(valid.sum()), value=rho, p=np.nan, p_perm=p_perm))

        rows.append(dict(checkpoint=cp_name, metric="frac_of_day_range_used_median",
                         n=n, value=float(sub["frac_of_day_range_used"].median()), p=np.nan,
                         mean=float(sub["frac_of_day_range_used"].mean())))
    return pd.DataFrame(rows)
