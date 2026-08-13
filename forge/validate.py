"""validate — walk-forward the *designer*, not the design.

The subtle failure mode this module exists to prevent: you run the search over
ten years, find the twelve best cells, then "validate" them on the last two
years. Those twelve cells were chosen partly *because* of how they did in
those last two years — the split happened after the search, so the search saw
everything. The result is an out-of-sample test that isn't one, and it will
look good.

The fix is to make the unit of testing the **procedure**. In each fold the
engine re-runs the entire pipeline — fit the tercile cuts, scan all ~40,000
cells, apply FDR, pick the survivors — using only data available at that point
in time, freezes the resulting spec, and is then scored on the *next* block of
data, which nothing in that fold has touched. Concatenating those frozen-spec
results across folds answers the only question that matters:

    "If I had run this engine at the end of every year and traded what it
     designed, what would have happened?"

That number can be bad while every individual fold's in-sample number is
excellent. When it is, the honest conclusion is that the *engine* doesn't
work, not that this year's parameters need another sweep.

`pylego.walkforward` supplies the calendar-aligned fold boundaries, so folds
here are cut the same way as every other walk-forward in the repo.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from forge.discover import (add_pvalues, add_split_columns, scan_cells,
                            tercile_cuts)

CELL_KEYS = ["key", "side", "split", "split_value", "sl_atr", "tp_r", "direction"]


@dataclass
class StrategySpec:
    """A frozen, human-readable strategy: the thing the engine designs.

    Deliberately not a model object. Every field is something you could read
    out loud to another trader and they could execute it by hand, which is the
    point — a spec you cannot argue with is a spec you cannot debug.
    """
    cells: list[dict]
    cuts: dict
    trained_through: str
    n_hypotheses: int
    fold: int = 0
    meta: dict = field(default_factory=dict)

    def describe(self) -> list[str]:
        out = []
        for c in self.cells:
            d = "LONG" if c["direction"] > 0 else "SHORT"
            approach = "from above (support test)" if c["side"] > 0 else "from below (resistance test)"
            cond = "" if c["split"] == "none" else f", {c['split']}={c['split_value']}"
            out.append(
                f"{d} on touch of {c['key']} {approach}{cond} "
                f"| stop {c['sl_atr']}×ATR, target {c['tp_r']}R "
                f"| train n={c['n']}, mean {c['mean_r']:+.3f}R, t={c['t']:.2f}"
            )
        return out

    def to_dict(self) -> dict:
        return {"trained_through": self.trained_through, "fold": self.fold,
                "n_hypotheses": self.n_hypotheses, "cuts": self.cuts,
                "cells": self.cells, "meta": self.meta,
                "human": self.describe()}


def design(train: pd.DataFrame, q: float = 0.10, top_k: int = 10,
           min_mean_r: float = 0.0, key: str = "kind",
           select_stat: str = "t_lift") -> tuple[StrategySpec, pd.DataFrame]:
    """Run the full search on one training block and freeze what survives.

    `select_stat` decides what the engine is allowed to call an edge:

      `t`       — "this cell made money". On a strongly trending instrument
                  this selects the drift: every long cell looks brilliant
                  because the instrument went up, and the level did nothing.
      `t_lift`  — "this cell beat the same trade taken at a random moment in
                  the same barrier cell and direction". This is the one that
                  is actually about levels, and it is the default.

    Both are computed and reported either way, so a run can be read both ways.
    """
    cuts = tercile_cuts(train)
    tr = add_split_columns(train, cuts)
    cells = scan_cells(tr, key=key)
    cells = add_pvalues(cells, q=q, stat=select_stat)
    if cells.empty:
        return StrategySpec([], cuts, "", 0), cells
    value_col = "lift" if select_stat == "t_lift" else "mean_r"
    keep = cells[cells["bh_pass"] & (cells[value_col] > min_mean_r)]
    keep = keep.sort_values(select_stat, ascending=False).head(top_k)
    spec = StrategySpec(
        cells=keep[CELL_KEYS + ["n", "n_days", "mean_r", "t", "p", "lift", "t_lift",
                                "win_rate"]].to_dict("records"),
        cuts=cuts,
        trained_through=str(train["time"].max()),
        n_hypotheses=int(cells["n_hypotheses"].iloc[0]),
        meta={"select_stat": select_stat},
    )
    return spec, cells


def apply_spec(spec: StrategySpec, test: pd.DataFrame) -> pd.DataFrame:
    """Trades the frozen spec would have taken on unseen events.

    Uses the spec's OWN tercile cuts — the test block is bucketed by the
    training distribution, never by its own.
    """
    if not spec.cells:
        return pd.DataFrame()
    te = add_split_columns(test, spec.cuts)
    out = []
    for c in spec.cells:
        m = ((te["kind"] == c["key"]) & (te["side"] == c["side"]) &
             (te["sl_atr"] == c["sl_atr"]) & (te["tp_r"] == c["tp_r"]))
        if c["split"] != "none":
            m &= te[c["split"]].astype(str) == str(c["split_value"])
        sel = te[m]
        if sel.empty:
            continue
        r = sel["r_long"] if c["direction"] > 0 else sel["r_short"]
        out.append(pd.DataFrame({
            "time": sel["time"].to_numpy(),
            "entry_time": sel["entry_time"].to_numpy(),
            "day": sel["day"].to_numpy(),
            "r": r.to_numpy(),
            "direction": c["direction"],
            "sl_atr": c["sl_atr"], "tp_r": c["tp_r"],
            "cell": f"{c['key']}|side{c['side']}|{c['split']}={c['split_value']}|"
                    f"sl{c['sl_atr']}|tp{c['tp_r']}|d{c['direction']}",
        }))
    if not out:
        return pd.DataFrame()
    trades = pd.concat(out, ignore_index=True)
    # One fill per (bar, direction, barrier cell): two selected cells firing on
    # the same bar in the same direction is one trade, not two.
    trades = trades.drop_duplicates(subset=["entry_time", "direction", "sl_atr", "tp_r"])

    # Benchmark-relative outcome: what the SAME trade (same direction, same
    # barrier cell, same test block) earned on average across every level
    # interaction, not just the selected ones. `r_excess` is the part of the
    # result the spec is responsible for; `r` includes whatever the instrument
    # was doing anyway. On a market that rose 85% over the test period, `r`
    # flatters every long spec ever written and `r_excess` does not.
    bench = {}
    for (sl, tp), grp in test.groupby(["sl_atr", "tp_r"], sort=False):
        bench[(sl, tp, 1)] = float(grp["r_long"].mean())
        bench[(sl, tp, -1)] = float(grp["r_short"].mean())
    trades["r_bench"] = [bench.get((sl, tp, d), np.nan) for sl, tp, d
                         in zip(trades["sl_atr"], trades["tp_r"], trades["direction"])]
    trades["r_excess"] = trades["r"] - trades["r_bench"]
    return trades


def fold_bounds(times: pd.Series, n_folds: int, min_train_frac: float = 0.4) -> list[tuple]:
    """Expanding-window fold boundaries over the event timeline."""
    t = pd.DatetimeIndex(times).sort_values()
    start, end = t[0], t[-1]
    span = end - start
    first = start + span * min_train_frac
    edges = pd.date_range(first, end, periods=n_folds + 1)
    return [(start, edges[i], edges[i + 1]) for i in range(n_folds)]


def walk_forward(lab: pd.DataFrame, n_folds: int = 6, q: float = 0.10,
                 top_k: int = 10, key: str = "kind", select_stat: str = "t_lift",
                 verbose: bool = True) -> dict:
    """Design → freeze → score, fold by fold. Returns the aggregate OOS result."""
    lab = lab.copy()
    lab["day"] = pd.DatetimeIndex(lab["time"]).floor("D")
    specs, all_trades, fold_rows = [], [], []

    for i, (tr_start, split, te_end) in enumerate(fold_bounds(lab["time"], n_folds)):
        train = lab[(lab["time"] >= tr_start) & (lab["time"] < split)]
        test = lab[(lab["time"] >= split) & (lab["time"] < te_end)]
        if len(train) < 1000 or test.empty:
            continue
        spec, cells = design(train, q=q, top_k=top_k, key=key, select_stat=select_stat)
        spec.fold = i
        trades = apply_spec(spec, test)
        n_tr = len(trades)
        mean_r = float(trades["r"].mean()) if n_tr else np.nan
        mean_x = float(trades["r_excess"].mean()) if n_tr else np.nan
        fold_rows.append(dict(
            fold=i, train_end=str(split), test_end=str(te_end),
            train_events=len(train), test_events=len(test),
            n_hypotheses=spec.n_hypotheses, n_cells_selected=len(spec.cells),
            train_best_t=float(cells[select_stat].max()) if not cells.empty else np.nan,
            oos_trades=n_tr, oos_mean_r=mean_r, oos_mean_excess=mean_x,
            oos_total_r=float(trades["r"].sum()) if n_tr else 0.0,
            oos_win_rate=float((trades["r"] > 0).mean()) if n_tr else np.nan,
        ))
        specs.append(spec)
        if n_tr:
            trades = trades.assign(fold=i)
            all_trades.append(trades)
        if verbose:
            print(f"  fold {i}: train→{split:%Y-%m-%d} | {spec.n_hypotheses} hypotheses, "
                  f"{len(spec.cells)} selected | OOS {n_tr} trades, "
                  f"raw {mean_r:+.4f}R, excess {mean_x:+.4f}R", flush=True)

    trades = pd.concat(all_trades, ignore_index=True) if all_trades else pd.DataFrame()
    agg = {"folds": fold_rows, "specs": [s.to_dict() for s in specs]}
    if len(trades):
        from forge.discover import _cluster_stats
        codes = pd.factorize(trades["day"])[0]
        mean, se, ndays = _cluster_stats(trades["r"].to_numpy(float), codes)
        xmean, xse, _ = _cluster_stats(trades["r_excess"].to_numpy(float), codes)
        agg["oos"] = {
            "trades": int(len(trades)), "days": ndays,
            "mean_r": mean, "se": se, "t": mean / se if se > 0 else np.nan,
            "mean_excess": xmean, "se_excess": xse,
            "t_excess": xmean / xse if xse > 0 else np.nan,
            "total_r": float(trades["r"].sum()),
            "win_rate": float((trades["r"] > 0).mean()),
        }
    else:
        agg["oos"] = {"trades": 0}
    agg["trades"] = trades
    return agg
