"""handoff — does session A's range/direction predict session B's?

Tests every pair of sessions worth asking about: the three adjacent handoffs
(asia->london->overlap->ny), the "skip" relationships (does Asia alone predict
NY, without London in between?), and the overnight link (does today's NY
session set tomorrow's Asia tone?).

Each pair is scored on six metrics — see `_score_pair` for the exact
definitions. Every metric gets both a parametric test AND a circular-shift
null p-value (`stats_util.circular_shift_pvalue`); `run_study.py` pools every
p-value from every metric from every pair into ONE Benjamini-Hochberg
correction, so "how many of these 42-ish cells survive multiple testing" is an
honest count, not a cherry-picked one.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from SessionResearch.stats_util import (binom_p, circular_shift_pvalue, mean_diff_stat,
                                        prop_diff_z, spearman_stat)

# (predecessor, successor, day_offset). day_offset=1 means successor is the
# NEXT trading day (the overnight NY -> Asia link).
PAIRS = [
    ("asia", "london", 0),
    ("london", "overlap", 0),
    ("overlap", "ny", 0),
    ("asia", "overlap", 0),
    ("london", "ny", 0),
    ("asia", "ny", 0),
    ("ny", "asia", 1),
]


def _join_pair(tab: pd.DataFrame, pred: str, succ: str, offset: int) -> pd.DataFrame:
    """One row per day where both `pred` and the offset-shifted `succ` exist."""
    all_days = np.array(sorted(tab["day"].unique()))
    pos = {d: i for i, d in enumerate(all_days)}

    p = tab[tab["session"] == pred].set_index("day")
    s = tab[tab["session"] == succ].set_index("day")

    target = pd.Series({d: all_days[pos[d] + offset] for d in p.index
                        if 0 <= pos[d] + offset < len(all_days)})
    p = p.loc[target.index]
    p["target_day"] = target

    joined = p.join(s, on="target_day", lsuffix="_pred", rsuffix="_succ", how="inner")
    return joined


def _score_pair(pred: str, succ: str, offset: int, j: pd.DataFrame, rng: np.random.Generator,
                n_perm: int) -> list[dict]:
    label = f"{pred}->{succ}" + ("(+1d)" if offset else "")
    n = len(j)
    cells: list[dict] = []

    def add(metric: str, n_obs: int, value: float, p: float, p_perm: float | None = None,
            extra: dict | None = None):
        row = dict(pair=label, pred=pred, succ=succ, day_offset=offset, metric=metric,
                   n=n_obs, value=value, p=p, p_perm=p_perm)
        if extra:
            row.update(extra)
        cells.append(row)

    if n < 60:
        add("insufficient_n", n, float("nan"), float("nan"))
        return cells

    pr, sr = j["range_atr_pred"].to_numpy(), j["range_atr_succ"].to_numpy()
    pd_, sd = j["direction_pred"].to_numpy(), j["direction_succ"].to_numpy()
    pnet = j["net_move_atr_pred"].to_numpy()

    # 1. range_corr: does a wide/quiet predecessor range predict a wide/quiet successor range?
    rho = spearman_stat(pr, sr)
    _, p_perm = circular_shift_pvalue(pr, sr, spearman_stat, n_perm=n_perm, rng=rng)
    add("range_spearman", n, rho, np.nan, p_perm, {"rho": rho})

    # 2. range_tercile: successor's range in predecessor's top vs bottom range tercile.
    diff = mean_diff_stat(pr, sr)
    _, p_perm2 = circular_shift_pvalue(pr, sr, mean_diff_stat, n_perm=n_perm, rng=rng)
    hi_cut, lo_cut = np.nanpercentile(pr, [66.7, 33.3])
    add("range_tercile_hi_minus_lo_atr", n, diff, np.nan, p_perm2,
        {"succ_mean_range_atr_pred_hi": float(np.nanmean(sr[pr >= hi_cut])),
         "succ_mean_range_atr_pred_lo": float(np.nanmean(sr[pr <= lo_cut]))})

    # 3. dir_continuation: P(successor direction == predecessor direction) vs 50/50.
    valid = (pd_ != 0) & (sd != 0)
    if valid.sum() >= 30:
        k = int((pd_[valid] == sd[valid]).sum())
        n_valid = int(valid.sum())
        p = binom_p(k, n_valid, 0.5)
        add("dir_continuation_rate", n_valid, k / n_valid, p, None,
            {"continuation_rate": k / n_valid})

    # 4. dir_continuation_strong_vs_weak: continuation rate when predecessor was a
    #    strong trend session (top tercile |net_move_atr|) vs a weak/choppy one (bottom tercile).
    strong_cut, weak_cut = np.nanpercentile(np.abs(pnet), [66.7, 33.3])
    strong = valid & (np.abs(pnet) >= strong_cut)
    weak = valid & (np.abs(pnet) <= weak_cut)
    if strong.sum() >= 30 and weak.sum() >= 30:
        k1, n1 = int((pd_[strong] == sd[strong]).sum()), int(strong.sum())
        k2, n2 = int((pd_[weak] == sd[weak]).sum()), int(weak.sum())
        z, p = prop_diff_z(k1, n1, k2, n2)
        add("dir_continuation_strong_minus_weak", n1 + n2, k1 / n1 - k2 / n2, p, None,
            {"continuation_rate_strong_pred": k1 / n1, "continuation_rate_weak_pred": k2 / n2})

    # 5/6. break_predicts_dir: predecessor breaking ITS OWN prior session's high/low —
    #      does that momentum carry into the successor's direction?
    for break_col, expect_dir, name in (("broke_prior_high_pred", 1, "break_high"),
                                        ("broke_prior_low_pred", -1, "break_low")):
        if break_col not in j.columns:
            continue
        b = j[break_col].to_numpy()
        bmask = valid & (b == 1)
        base_rate = float((sd[valid] == expect_dir).mean()) if valid.sum() else np.nan
        if bmask.sum() >= 30:
            k = int((sd[bmask] == expect_dir).sum())
            n_b = int(bmask.sum())
            p = binom_p(k, n_b, base_rate if np.isfinite(base_rate) else 0.5)
            add(f"{name}_predicts_succ_dir", n_b, k / n_b, p, None,
                {"rate_given_break": k / n_b, "base_rate": base_rate})

    return cells


def run_handoff_study(tab: pd.DataFrame, n_perm: int = 1000, seed: int = 0) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows: list[dict] = []
    for pred, succ, offset in PAIRS:
        j = _join_pair(tab, pred, succ, offset)
        rows.extend(_score_pair(pred, succ, offset, j, rng, n_perm))
    return pd.DataFrame(rows)
