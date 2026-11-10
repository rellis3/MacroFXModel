"""Study plumbing shared by run_study.py, run_grid.py and the dashboard builder."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .data import load_minutes
from .features import Params, session_sigma1, add_delta_proxy, build_boxes, states, box_scales
from .stats import add_outcomes, minute_matrix
from .backtest import Market

IS_END = "2019-12-31"
OOS_START = "2020-01-01"
SAMPLE_END = "2025-07-24"
STRAT_MODELS = ["A", "B", "C_", "D_"]
ENTRIES = ["pull", "cont"]
EXITS = ["r1", "r2", "trail"]


class Sample:
    """Everything that depends on the data but not on the parameters, built once."""

    def __init__(self, report=None):
        self.report = {} if report is None else report
        self.mins = load_minutes(end=SAMPLE_END, report=self.report)
        self.sigma1 = session_sigma1(self.mins)
        self.mins = add_delta_proxy(self.mins, self.sigma1)
        self.O = minute_matrix(self.mins, "open")
        self.C = minute_matrix(self.mins, "close")
        self.day_index = np.arange(self.mins.day.max() + 1)
        self.date_of = self.mins.groupby("day")["date"].first()
        self._boxes = {}
        self._mk = {}

    def boxes(self, B):
        if B not in self._boxes:
            self._boxes[B] = build_boxes(self.mins, B)
        return self._boxes[B]

    def market(self, B):
        if B not in self._mk:
            bx = self.boxes(B)
            self._mk[B] = Market(self.mins, bx, B, box_scales(bx)["sigma_b"].to_dict())
        return self._mk[B]

    def features(self, p: Params, outcomes=True):
        f = states(self.boxes(p.B), self.sigma1, p)
        f["date"] = f["day"].map(self.date_of)
        if outcomes:
            f = add_outcomes(f, self.O, self.C, p.B, self.day_index)
        return f

    def scored_days(self, f):
        return np.sort(f["day"].unique())


def shift_states(f: pd.DataFrame, cols, shift=1) -> pd.DataFrame:
    """Control: give session d the states of session d+shift (same box index). Outcomes stay with session d."""
    days = np.sort(f["day"].unique())
    nxt = {d: days[(i + shift) % len(days)] for i, d in enumerate(days)}
    src = f.set_index(["day", "k"])[cols]
    g = f.copy()
    keys = list(zip(g["day"].map(nxt), g["k"]))
    vals = src.reindex(keys)
    for c in cols:
        g[c] = vals[c].fillna(0).values.astype(int)
    return g


def regimes(sample: Sample) -> pd.DataFrame:
    """Per-session regime labels.
    ex-ante vol (tradeable): mean RTH range/open over the previous 20 sessions, cut at the 33rd/67th percentile of
        all earlier values of the same quantity (expanding, >= 60 sessions).
    ex-post (hindsight, description only): efficiency |close - open| / (high - low) of the RTH session, terciles over
        the full sample (trend = top, consolidating = bottom); volatility = session range relative to the previous
        20 sessions' mean range, terciles over the full sample (high / low)."""
    g = sample.mins.groupby("day")
    o, h, l, c = g["open"].first(), g["high"].max(), g["low"].min(), g["close"].last()
    rng = (h - l) / o
    prior = rng.rolling(20, min_periods=20).mean().shift(1)
    lab = []
    vals = prior.values
    for i, x in enumerate(vals):
        hist = vals[:i][np.isfinite(vals[:i])]
        if not np.isfinite(x) or len(hist) < 60:
            lab.append("na")
            continue
        q1, q2 = np.percentile(hist, [33.3, 66.7])
        lab.append("low" if x <= q1 else ("high" if x > q2 else "mid"))
    eff = (c - o).abs() / (h - l)
    e1, e2 = np.nanpercentile(eff, [33.3, 66.7])
    rel = rng / prior
    v1, v2 = np.nanpercentile(rel.dropna(), [33.3, 66.7])
    out = pd.DataFrame({
        "vol_exante": lab,
        "daytype_expost": np.where(eff >= e2, "trend", np.where(eff <= e1, "consolidating", "mixed")),
        "vol_expost": np.where(rel >= v2, "high", np.where(rel <= v1, "low", "mid")),
        "eff": eff, "rng": rng, "rel": rel,
    }, index=o.index)
    out.loc[~np.isfinite(rel), "vol_expost"] = "na"
    return out
