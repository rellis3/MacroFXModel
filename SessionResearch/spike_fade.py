"""spike_fade — the pattern behind the user's own description: "you always see
a big candle before the open of a session, and if it's a big move down, it's
always followed by the gap coming back up."

Operationalized directly on M1 bars (not the session table, for minute-level
timing precision) at each of the four session-open boundaries:

  pre_move   = price at the open  - price W minutes before the open
  post_move  = price N minutes after the open  -  price at the open

scaled by the M15 ATR known at that moment (`forge.bars.frame(..., 'm15')`'s
`atr0` — prior-bar, so no lookahead), so "big" means the same thing at $1,100
gold and $4,300 gold. A "spike" is a day whose |pre_move| lands in the
TOP QUARTILE of that boundary's own full-sample distribution — a descriptive
threshold, not a tuned one, and it is fit on the whole sample because this is
a descriptive/inferential research pass, not a walk-forward-safe live rule
(see README "what this is not").

Three questions asked at each boundary x post-window:
  1. Conditional on a spike, does price reverse (retrace) more often than it
     does after an ordinary (non-spike) open? (`spike_reversal_rate`)
  2. Of the spike days, how much of the pre-open move actually comes back?
     (`retrace_fraction`)
  3. Across ALL days (not just spikes), is pre_move correlated with post_move
     at all, and does that correlation survive the circular-shift null?
     (`pre_post_spearman`)
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from forge.bars import day_key, frame
from SessionResearch.stats_util import (circular_shift_pvalue, prop_diff_z, spearman_stat,
                                        spike_reversal_stat)

BOUNDARIES = {"asia": 0, "london": 7, "overlap": 12, "ny": 16}
PRE_WINDOW_MIN = 15
POST_WINDOWS_MIN = (15, 30, 60)
SPIKE_QUANTILE = 0.75


def _price_asof(close: pd.Series, times: pd.DatetimeIndex) -> np.ndarray:
    return close.asof(times).to_numpy()


def _boundary_events(m1: pd.DataFrame, hour: int, day_start_hour: int = 0) -> pd.DataFrame:
    days = np.unique(day_key(m1.index, day_start_hour))
    boundary = pd.DatetimeIndex(days) + pd.Timedelta(hours=hour)
    boundary = boundary.tz_localize("UTC") if boundary.tz is None else boundary

    close = m1["close"]
    m15_atr0 = frame(m1, "m15", day_start_hour=day_start_hour)["atr0"].replace(0, np.nan)
    d1_atr0 = frame(m1, "d1", day_start_hour=day_start_hour)["atr0"]

    p_pre = _price_asof(close, boundary - pd.Timedelta(minutes=PRE_WINDOW_MIN))
    p_open = _price_asof(close, boundary)
    scale = _price_asof(m15_atr0, boundary)
    day_vol = _price_asof(d1_atr0, boundary)  # the day's OWN prior-day ATR — the vol-regime marker

    out = pd.DataFrame({"boundary": boundary, "p_pre": p_pre, "p_open": p_open, "scale": scale,
                        "day_vol": day_vol})
    for n in POST_WINDOWS_MIN:
        out[f"p_post_{n}"] = _price_asof(close, boundary + pd.Timedelta(minutes=n))

    out["pre_move"] = out["p_open"] - out["p_pre"]
    out["pre_move_atr"] = out["pre_move"] / out["scale"]
    for n in POST_WINDOWS_MIN:
        out[f"post_move_{n}"] = out[f"p_post_{n}"] - out["p_open"]
        out[f"post_move_{n}_atr"] = out[f"post_move_{n}"] / out["scale"]
    out = out.dropna(subset=["pre_move_atr"])
    # High/low vol regime, split on THIS boundary's own median day_vol — not gold's overall
    # median, so each boundary is judged against its own history (a boundary run only over a
    # later, structurally wider-ATR sub-sample isn't accidentally called "all high-vol").
    out["vol_regime"] = np.where(out["day_vol"] >= out["day_vol"].median(), "high", "low")
    return out


def run_spike_fade_study(m1: pd.DataFrame, day_start_hour: int = 0,
                         n_perm: int = 1000, seed: int = 1) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows: list[dict] = []

    for name, hour in BOUNDARIES.items():
        ev = _boundary_events(m1, hour, day_start_hour)
        if len(ev) < 200:
            continue
        pre = ev["pre_move_atr"].to_numpy()
        cut = float(np.nanpercentile(np.abs(pre), SPIKE_QUANTILE * 100))
        spike = np.abs(pre) >= cut

        for n in POST_WINDOWS_MIN:
            post = ev[f"post_move_{n}_atr"].to_numpy()
            valid = np.isfinite(pre) & np.isfinite(post)

            # 1. reversal rate: spike days vs non-spike days
            v_spike = valid & spike
            v_non = valid & ~spike
            if v_spike.sum() >= 30 and v_non.sum() >= 30:
                rev_spike = np.sign(post[v_spike]) != np.sign(pre[v_spike])
                rev_non = np.sign(post[v_non]) != np.sign(pre[v_non])
                k1, n1 = int(rev_spike.sum()), int(v_spike.sum())
                k2, n2 = int(rev_non.sum()), int(v_non.sum())
                z, p = prop_diff_z(k1, n1, k2, n2)
                # The proportion test alone is vulnerable to gold's decade-long secular
                # uptrend: if "up" is simply the more common sign throughout the sample,
                # non-spike days will show elevated same-direction continuation for that
                # reason alone, and the effect shrinks toward 50/50 for LARGER |pre_move|
                # purely because a fixed drift matters relatively less against a bigger
                # move — a regression-to-the-mean artifact, not evidence of reversion.
                # The circular-shift null controls for exactly this (see stats_util).
                _, p_perm = circular_shift_pvalue(pre[valid], post[valid], spike_reversal_stat,
                                                  n_perm=n_perm, rng=rng)
                rows.append(dict(boundary=name, post_min=n, metric="spike_reversal_rate",
                                 n=n1 + n2, value=k1 / n1 - k2 / n2, p=p, p_perm=p_perm,
                                 reversal_rate_spike=k1 / n1, reversal_rate_nonspike=k2 / n2,
                                 spike_threshold_atr=cut))

            # 1b. robustness check (one representative window): is the reversal effect
            # concentrated in one volatility regime, or does it hold in both? A finding that
            # only shows up in, say, the 2020/2025-26 high-vol stretch is a period effect
            # wearing a session-effect costume, not the general pattern it's reported as.
            if n == 30:
                regime = ev["vol_regime"].to_numpy()
                for label in ("high", "low"):
                    m = valid & (regime == label)
                    if m.sum() < 100:
                        continue
                    stat_val = spike_reversal_stat(pre[m], post[m], SPIKE_QUANTILE)
                    _, p_perm_r = circular_shift_pvalue(pre[m], post[m], spike_reversal_stat,
                                                        n_perm=max(200, n_perm // 3), rng=rng)
                    rows.append(dict(boundary=name, post_min=n, metric="spike_reversal_rate_by_regime",
                                     n=int(m.sum()), value=stat_val, p=np.nan, p_perm=p_perm_r,
                                     vol_regime=label))

            # 2. how much of the spike actually comes back
            if v_spike.sum() >= 30:
                retrace = -post[v_spike] / pre[v_spike]
                mean_r, med_r = float(np.mean(retrace)), float(np.median(retrace))
                frac_any_retrace = float((retrace > 0).mean())
                rows.append(dict(boundary=name, post_min=n, metric="retrace_fraction",
                                 n=int(v_spike.sum()), value=mean_r, p=np.nan,
                                 median_retrace_fraction=med_r,
                                 frac_days_with_any_retrace=frac_any_retrace))

            # 3. does pre_move predict post_move at all, across every day (not just spikes)?
            if valid.sum() >= 200:
                rho = spearman_stat(pre[valid], post[valid])
                _, p_perm = circular_shift_pvalue(pre[valid], post[valid], spearman_stat,
                                                  n_perm=n_perm, rng=rng)
                rows.append(dict(boundary=name, post_min=n, metric="pre_post_spearman",
                                 n=int(valid.sum()), value=rho, p=np.nan, p_perm=p_perm))

    return pd.DataFrame(rows)
