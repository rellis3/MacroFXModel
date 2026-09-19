#!/usr/bin/env python3
"""motif_features.py — the context features a motif alert carries at entry.

Extracted (2026-09-15) when `motif_alert_backtest.py` became the second
consumer: the confluence study found that some of these -- the H1 swing regime
above all -- genuinely separate winning alerts from losing ones, so they stopped
being study-only scratch work and became fields the backtest itself should
carry. One copy, two callers, per CLAUDE.md's extraction threshold; a second
copy would let the backtest's idea of "with the trend" drift from the study's.

Everything here is CAUSAL. An index `i` reads only bars <= i, and callers
evaluate at a motif's `confirm_idx` while entry is the next bar's open, so a
feature can never see its own trade. Higher-timeframe series go through
`align_htf_causal`, which step-holds by bar CLOSE time -- forward-filling a 4H
or D1 series onto H1 by START time leaks most of an HTF bar into every row and
makes any MTF result look spectacular for purely mechanical reasons.

Bucket boundaries are fixed constants, not fitted: they are round numbers
chosen once so that "quiet/normal/volatile" means the same thing on every pair
and in every year. Tuning them per pair or per period would turn a descriptive
feature into an in-sample optimisation.
"""
from __future__ import annotations

import argparse

import numpy as np
import pandas as pd

from pylego.indicators.vumanchu import align_htf_causal, ema, wave_trend
from pylego.swing_structure import atr as compute_atr, classify_swing_structure, regime_known_at

APPROACH_BARS = 12    # how far back "how price arrived at the level" looks
VOL_LOOKBACK = 500    # bars of trailing history a volatility regime is judged against
HTF_EMA = 50          # EMA period for the higher-timeframe trend read
ATR_PERIOD = 14
PIVOT_N = 5


def _p(args, name: str, default):
    """Feature parameters live HERE, not in each caller's argparse. A caller
    that exposes one as a flag (the study does) overrides it; one that does not
    (the backtest) gets the module default rather than needing to restate it --
    two copies of a default is how the two exports would quietly start
    describing different features."""
    return getattr(args, name, default) if args is not None else default


def _tercile_labels(vals: np.ndarray, x: float, lo_hi: tuple[float, float], names: tuple) -> str:
    lo, hi = lo_hi
    if not np.isfinite(x):
        return "unknown"
    return names[0] if x <= lo else (names[2] if x >= hi else names[1])


def compute_features(pair: str, bars: pd.DataFrame, args: argparse.Namespace) -> dict:
    """Every per-bar feature the study buckets on, as arrays over `bars`.

    All causal: an index i reads only bars <= i. The caller evaluates them at
    a motif's `confirm_idx`, and entry is i+1's open, so nothing here can see
    its own trade."""
    n = len(bars)
    o, h, l, c = (bars[k].to_numpy(dtype=float) for k in ("open", "high", "low", "close"))
    idx = bars.index
    atr_arr = compute_atr(bars, period=_p(args, 'atr_period', ATR_PERIOD))

    # ── time of day / week ────────────────────────────────────────────────
    hour = idx.hour.to_numpy()
    dow = idx.dayofweek.to_numpy()
    # UTC session boundaries, the same coarse split levelAtlasReport uses.
    session = np.where((hour >= 22) | (hour < 7), "asia",
              np.where(hour < 12, "london",
              np.where(hour < 16, "overlap", "ny")))
    # Position within the current session block (early/mid/late third).
    sess_len = np.where(session == "asia", 9, np.where(session == "london", 5,
               np.where(session == "overlap", 4, 6)))
    sess_start = np.where(session == "asia", np.where(hour >= 22, 22, -2),
                 np.where(session == "london", 7, np.where(session == "overlap", 12, 16)))
    into = (hour - sess_start) % 24
    sess_pos = np.where(into < sess_len / 3, "early",
               np.where(into < 2 * sess_len / 3, "mid", "late"))

    # ── volatility regimes ───────────────────────────────────────────────
    atr_s = pd.Series(atr_arr)
    atr_med = atr_s.rolling(_p(args, 'vol_lookback', VOL_LOOKBACK), min_periods=50).median().to_numpy()
    atr_ratio = np.divide(atr_arr, atr_med, out=np.full(n, np.nan), where=atr_med > 0)
    # Daily realised range vs its own trailing median, held across the day.
    day = pd.Series(idx.date, index=range(n))
    day_range = pd.Series(h - l).groupby(day).transform("sum").to_numpy()
    dr_s = pd.Series(day_range)
    # shift(1) so "today's" comparison band is built only from PRIOR days.
    day_med = dr_s.rolling(_p(args, 'vol_lookback', VOL_LOOKBACK), min_periods=50).median().shift(1).to_numpy()
    day_ratio = np.divide(day_range, day_med, out=np.full(n, np.nan), where=day_med > 0)

    # ── how price arrived at the level (the approach window) ─────────────
    cs = pd.Series(c)
    net = (cs - cs.shift(APPROACH_BARS)).abs().to_numpy()
    steps = cs.diff().abs().rolling(APPROACH_BARS).sum().to_numpy()
    approach_er = np.divide(net, steps, out=np.full(n, np.nan), where=steps > 0)
    approach_vel = np.divide(net, atr_arr, out=np.full(n, np.nan), where=atr_arr > 0)
    # Direction changes in the approach: a one-sided drive vs two-sided churn.
    sgn = np.sign(cs.diff().to_numpy())
    flips = pd.Series((sgn[1:] * sgn[:-1] < 0).astype(float))
    churn_n = np.concatenate([[np.nan], flips.rolling(APPROACH_BARS).sum().to_numpy()])

    # ── the confirm bar itself ───────────────────────────────────────────
    rng = np.maximum(h - l, 1e-12)
    body_frac = np.abs(c - o) / rng
    bar_vs_atr = np.divide(rng, atr_arr, out=np.full(n, np.nan), where=atr_arr > 0)

    # ── indicators ───────────────────────────────────────────────────────
    wt = wave_trend(h, l, c)
    # 4H WaveTrend, step-held causally onto the H1 grid by CLOSE time.
    h4 = bars.resample("4h").agg({"open": "first", "high": "max", "low": "min", "close": "last"}).dropna()
    wt4 = wave_trend(h4["high"].to_numpy(), h4["low"].to_numpy(), h4["close"].to_numpy())
    h1_close_s = (idx.astype("int64") // 10**9) + 3600
    h4_close_s = (h4.index.astype("int64") // 10**9) + 4 * 3600
    wt4_on_h1 = align_htf_causal(h1_close_s, h4_close_s, wt4.wt1)
    ema4 = ema(h4["close"].to_numpy(), _p(args, 'htf_ema', HTF_EMA))
    ema4_on_h1 = align_htf_causal(h1_close_s, h4_close_s, ema4)
    h4_close_on_h1 = align_htf_causal(h1_close_s, h4_close_s, h4["close"].to_numpy())

    # ── trend regime, the structural read ────────────────────────────────
    # 4H EMA direction turned out to be inert on this signal (OOS PF 1.177
    # "with" vs 1.167 "against"), so the trend question is asked structurally
    # instead: classify_swing_structure walks the actual swing highs/lows and
    # labels HH+HL / LH+LL / mixed. A pivot is only knowable pivot_n bars
    # after it prints. Until 2026-09-19 this read used `regime_at`, which
    # looks up by the PIVOT bar -- so the backtest (full history) applied
    # pivots from the 1-4 bars before a confirmation that the live tracker
    # (data ending at the confirm bar) could not see: 21% of confirm bars
    # relabelled, live taking ~13% more trades than the backtest. This
    # feature is read at the confirm bar's CLOSE, where bars <= i are known,
    # so the knowable change-point is the one with pivot + pivot_n <= i --
    # `regime_known_at`. See MD files/MOTIF_REGIME_LOOKAHEAD_PREREG.md.
    swing = classify_swing_structure(bars, pivot_n=_p(args, 'pivot_n', PIVOT_N))
    swing_dir = np.zeros(n)
    for i in range(n):
        rp = regime_known_at(swing, i)
        swing_dir[i] = 0 if (rp is None or rp.dir is None) else rp.dir
    # Daily structure, step-held causally onto H1 by close time.
    d1 = bars.resample("1D").agg({"open": "first", "high": "max", "low": "min", "close": "last"}).dropna()
    d1_close_s = (d1.index.astype("int64") // 10**9) + 86400
    if len(d1) > _p(args, 'pivot_n', PIVOT_N) * 4:
        d1_swing = classify_swing_structure(d1, pivot_n=_p(args, 'pivot_n', PIVOT_N))
        # Same knowability rule on the daily series (a D1 pivot needs pivot_n
        # DAYS after it); align_htf_causal then holds it by D1 close time.
        d1_dir_raw = np.array([(lambda rp: 0 if (rp is None or rp.dir is None) else rp.dir)(regime_known_at(d1_swing, j))
                               for j in range(len(d1))], dtype=float)
    else:
        d1_dir_raw = np.zeros(len(d1))
    d1_dir = align_htf_causal(h1_close_s, d1_close_s, d1_dir_raw)
    d1_ema = align_htf_causal(h1_close_s, d1_close_s, ema(d1["close"].to_numpy(), _p(args, 'htf_ema', HTF_EMA)))
    d1_close_h1 = align_htf_causal(h1_close_s, d1_close_s, d1["close"].to_numpy())

    return {
        "swing_dir": swing_dir, "d1_dir": d1_dir, "d1_ema": d1_ema, "d1_close": d1_close_h1,
        "session": session, "dow": np.array([f"d{d}" for d in dow]), "sess_pos": sess_pos,
        "atr_ratio": atr_ratio, "day_ratio": day_ratio,
        "approach_er": approach_er, "approach_vel": approach_vel, "churn_n": churn_n,
        "body_frac": body_frac, "bar_vs_atr": bar_vs_atr,
        "wt1": wt.wt1, "wt4": wt4_on_h1, "ema4": ema4_on_h1, "h4_close": h4_close_on_h1,
        "atr": atr_arr, "close": c,
    }


def bucket_trade(f: dict, i: int, direction: int, level: float, pip: float) -> dict:
    """The confluence buckets for ONE trade, read at its confirm bar `i`.

    Direction-aware wherever that is the meaningful question: "WaveTrend is
    overbought" means nothing on its own, "overbought AND we are selling"
    does."""
    def num(key):
        v = f[key][i]
        return v if np.isfinite(v) else np.nan

    atr_ratio, day_ratio = num("atr_ratio"), num("day_ratio")
    er, vel, churn = num("approach_er"), num("approach_vel"), num("churn_n")
    body, bar_atr = num("body_frac"), num("bar_vs_atr")
    wt1, wt4 = num("wt1"), num("wt4")
    ema4, h4c, atr, close = num("ema4"), num("h4_close"), num("atr"), num("close")

    b = {
        "session": f["session"][i],
        "dow": f["dow"][i],
        "sess_pos": f["sess_pos"][i],
        "atr_regime": _tercile_labels(None, atr_ratio, (0.85, 1.2), ("quiet", "normal", "volatile")),
        "day_vol": _tercile_labels(None, day_ratio, (0.85, 1.2), ("quiet", "normal", "volatile")),
        "approach_er": _tercile_labels(None, er, (0.25, 0.5), ("choppy", "mixed", "driven")),
        "approach_vel": _tercile_labels(None, vel, (1.0, 2.5), ("slow", "normal", "fast")),
        "churn": _tercile_labels(None, churn, (3, 6), ("one_sided", "mixed", "churned")),
        "confirm_body": _tercile_labels(None, body, (0.35, 0.7), ("wick_heavy", "mixed", "body_heavy")),
        "confirm_size": _tercile_labels(None, bar_atr, (0.8, 1.5), ("small", "normal", "climax")),
    }
    # WaveTrend, oriented to the trade: "with" = the oscillator already leans
    # the way we are about to trade.
    if np.isfinite(wt1):
        stretched = abs(wt1) >= 53  # vumanchu's own overbought/oversold band
        agrees = (wt1 < 0) if direction == 1 else (wt1 > 0)
        b["wt_state"] = ("stretched_with" if agrees else "stretched_against") if stretched else \
                        ("mild_with" if agrees else "mild_against")
    else:
        b["wt_state"] = "unknown"
    if np.isfinite(wt1) and np.isfinite(wt4):
        b["wt_mtf"] = "agree" if (wt1 >= 0) == (wt4 >= 0) else "conflict"
    else:
        b["wt_mtf"] = "unknown"
    # 4H EMA trend vs the trade direction.
    if np.isfinite(ema4) and np.isfinite(h4c):
        htf_up = h4c >= ema4
        b["htf_trend"] = "with" if (htf_up == (direction == 1)) else "against"
    else:
        b["htf_trend"] = "unknown"
    # Structural trend regime vs the trade, on H1 and on D1.
    sd, dd = num("swing_dir"), num("d1_dir")
    b["swing_regime"] = "range" if sd == 0 else ("with" if sd == direction else "against")
    b["d1_regime"] = "range" if (not np.isfinite(dd) or dd == 0) else ("with" if dd == direction else "against")
    d1e, d1c = num("d1_ema"), num("d1_close")
    if np.isfinite(d1e) and np.isfinite(d1c):
        b["d1_trend"] = "with" if ((d1c >= d1e) == (direction == 1)) else "against"
    else:
        b["d1_trend"] = "unknown"
    # Where the level sits relative to a round number, in pips.
    if pip > 0:
        step = pip * 100  # a "00" level on a normal FX quote
        dist = min(level % step, step - (level % step)) / pip
        b["round_num"] = "at_round" if dist <= 5 else ("near_round" if dist <= 15 else "away")
    else:
        b["round_num"] = "unknown"
    return b
