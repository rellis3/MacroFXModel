"""
RegimeV2 — Backtester V3

Two-phase backtester that:
  1. Loads M1 parquet files, resamples to M5, computes all signals vectorised.
  2. Runs trade-loop(s) per pair: V3 logic, optionally V2 for comparison.

V3 key changes vs V2
---------------------
Entry
  - 13 hard gates → 4 hard gates + composite score ≥ 65
  - BOCPD (previously exit-only) now penalises score at entry
  - entry_score_min raised 55 → 65

Exit
  - X3/X4 (conf slope/drop) suppressed when MFE ≥ 1R
  - X8 consensus threshold lowered: exit only when consensus < 1 (all disagree)

Usage
-----
  python RegimeV2/backtest_v3.py
  python RegimeV2/backtest_v3.py --compare-v2
  python RegimeV2/backtest_v3.py --pairs eurusd gbpusd usdjpy --from 2022-01-01
  python RegimeV2/backtest_v3.py --compare-v2 --oos-days 180 --output results.json
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import warnings
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=RuntimeWarning)

# ── Path so bocpd.py is importable whether run from repo root or RegimeV2/ ─────
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from bocpd import BOCPDetector  # noqa: E402  (after sys.path patch)

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

DATA_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "VolRangeForecaster", "data", "m1"
)

# Canonical pair name → parquet filename stem
PAIR_FILES: Dict[str, str] = {
    "EUR/USD": "eurusd_m1",
    "GBP/USD": "gbpusd_m1",
    "USD/JPY": "usdjpy_m1",
    "AUD/USD": "audusd_m1",
    "NZD/USD": "nzdusd_m1",
    "USD/CAD": "usdcad_m1",
    "USD/CHF": "usdchf_m1",
    "GBP/JPY": "gbpjpy_m1",
    "EUR/GBP": "eurgbp_m1",
    "EUR/JPY": "eurjpy_m1",
    "EUR/CHF": "eurchf_m1",
    "GBP/CHF": "gbpchf_m1",
    "AUD/JPY": "audjpy_m1",
    "CAD/JPY": "cadjpy_m1",
    "NZD/JPY": "nzdjpy_m1",
    "AUD/CHF": "audchf_m1",
    "AUD/CAD": "audcad_m1",
    "AUD/NZD": "audnzd_m1",
    "GBP/AUD": "gbpaud_m1",
    "GBP/CAD": "gbpcad_m1",
    "GBP/NZD": "gbpnzd_m1",
    "EUR/AUD": "euraud_m1",
    "EUR/CAD": "eurcad_m1",
    "EUR/NZD": "eurnzd_m1",
    "CHF/JPY": "chfjpy_m1",
    "XAU/USD": "gold_m1",
}

PIP_SIZES: Dict[str, float] = {
    "EUR/USD": 0.0001, "GBP/USD": 0.0001, "USD/JPY": 0.01,
    "AUD/USD": 0.0001, "NZD/USD": 0.0001, "USD/CAD": 0.0001,
    "USD/CHF": 0.0001, "GBP/JPY": 0.01,  "EUR/GBP": 0.0001,
    "EUR/JPY": 0.01,   "EUR/CHF": 0.0001, "GBP/CHF": 0.0001,
    "AUD/JPY": 0.01,   "CAD/JPY": 0.01,  "NZD/JPY": 0.01,
    "AUD/CHF": 0.0001, "AUD/CAD": 0.0001, "AUD/NZD": 0.0001,
    "GBP/AUD": 0.0001, "GBP/CAD": 0.0001, "GBP/NZD": 0.0001,
    "EUR/AUD": 0.0001, "EUR/CAD": 0.0001, "EUR/NZD": 0.0001,
    "CHF/JPY": 0.01,   "XAU/USD": 1.0,
}

DEFAULT_SPREADS: Dict[str, float] = {
    "GBP/JPY": 2.5, "XAU/USD": 30.0,
}
DEFAULT_SPREAD = 1.5  # pips

# Whether USD is the quote currency (True) vs base (False) vs cross/gold (None)
_DXY_USD_BULL: Dict[str, Optional[bool]] = {
    "EUR/USD": False, "GBP/USD": False, "USD/JPY": True,
    "AUD/USD": False, "NZD/USD": False, "USD/CAD": True,
    "USD/CHF": True,  "GBP/JPY": None, "EUR/GBP": None,
    "EUR/JPY": None,  "EUR/CHF": None, "GBP/CHF": None,
    "AUD/JPY": None,  "CAD/JPY": None, "NZD/JPY": None,
    "AUD/CHF": None,  "AUD/CAD": None, "AUD/NZD": None,
    "GBP/AUD": None,  "GBP/CAD": None, "GBP/NZD": None,
    "EUR/AUD": None,  "EUR/CAD": None, "EUR/NZD": None,
    "CHF/JPY": None,  "XAU/USD": False,
}

DEFAULT_PAIRS = [
    "EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD",
    "USD/CAD", "GBP/JPY", "EUR/GBP", "EUR/JPY", "AUD/JPY",
]

SL_ATR_MULT = 1.8

# Trade window (UTC hour range, inclusive start, exclusive end)
TRADE_WINDOW_START = 7   # 07:00
TRADE_WINDOW_END   = 20  # 20:00

# ─────────────────────────────────────────────────────────────────────────────
# Session labelling
# ─────────────────────────────────────────────────────────────────────────────

def session_label(hour_utc: int) -> str:
    if 7 <= hour_utc < 12:
        return "London"
    if 12 <= hour_utc < 17:
        return "NY"
    if 17 <= hour_utc < 22:
        return "Late"
    return "Asian"


def session_multiplier(hour_utc: int) -> float:
    label = session_label(hour_utc)
    return {"London": 1.00, "NY": 0.95, "Late": 0.85, "Asian": 0.75}[label]


# ─────────────────────────────────────────────────────────────────────────────
# OLS slope helper
# ─────────────────────────────────────────────────────────────────────────────

def _ols_slope(values: List[float]) -> float:
    n = len(values)
    if n < 2:
        return 0.0
    xm = (n - 1) / 2.0
    ym = sum(values) / n
    sxy = sum((i - xm) * (v - ym) for i, v in enumerate(values))
    sx2 = sum((i - xm) ** 2 for i in range(n))
    return sxy / sx2 if sx2 > 0 else 0.0


# ─────────────────────────────────────────────────────────────────────────────
# ATR (Wilder, vectorised)
# ─────────────────────────────────────────────────────────────────────────────

def _compute_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """Wilder ATR on a DataFrame with columns high/low/close."""
    hi   = df["high"]
    lo   = df["low"]
    prev = df["close"].shift(1)
    tr   = pd.concat([hi - lo, (hi - prev).abs(), (lo - prev).abs()], axis=1).max(axis=1)
    atr  = tr.ewm(alpha=1.0 / period, adjust=False, min_periods=period).mean()
    return atr


# ─────────────────────────────────────────────────────────────────────────────
# Regime simulation (vectorised on M5 bars)
# ─────────────────────────────────────────────────────────────────────────────

def compute_signals(df5: pd.DataFrame) -> pd.DataFrame:
    """
    Given M5 OHLCV DataFrame, compute all signals needed for backtesting.
    Returns a copy of df5 with extra columns:
        ema_fast, ema_slow, atr14, separation,
        regime, confidence,
        ema96, ema252, sep1h, regime_1h,
        session, sess_mult,
        vol_z (ATR rolling z-score)
    All computed causally (no look-ahead).
    """
    c = df5["close"].copy()

    # ── M5 EMA signals ───────────────────────────────────────────────────────
    ema_fast = c.ewm(span=8,  adjust=False).mean()
    ema_slow = c.ewm(span=21, adjust=False).mean()
    atr14    = _compute_atr(df5, 14)

    separation = (ema_fast - ema_slow) / atr14.replace(0, np.nan)
    separation = separation.fillna(0.0)

    # Regime label
    regime = pd.Series("RANGE", index=df5.index)
    regime[separation >  0.5] = "BULL"
    regime[separation < -0.5] = "BEAR"

    # Confidence: directional regimes 60 + |sep|*20 capped 100; RANGE = 60 - |sep|*20 floor 30
    abs_sep = separation.abs()
    conf_dir   = (60.0 + abs_sep * 20.0).clip(upper=100.0)
    conf_range = (60.0 - abs_sep * 20.0).clip(lower=30.0)
    confidence = pd.Series(np.where(regime == "RANGE", conf_range, conf_dir), index=df5.index)

    # ── 1H regime approximation via long-window EMAs ──────────────────────────
    ema96  = c.ewm(span=96,  adjust=False).mean()   # ≈ 1H EMA-8
    ema252 = c.ewm(span=252, adjust=False).mean()   # ≈ 1H EMA-21
    sep1h  = (ema96 - ema252) / atr14.replace(0, np.nan)
    sep1h  = sep1h.fillna(0.0)

    regime_1h = pd.Series("RANGE", index=df5.index)
    regime_1h[sep1h >  0.3] = "BULL"
    regime_1h[sep1h < -0.3] = "BEAR"

    # ── Session ───────────────────────────────────────────────────────────────
    hours     = df5.index.hour  # type: ignore[union-attr]
    sess_lbl  = pd.Series([session_label(h) for h in hours], index=df5.index)
    sess_mult = pd.Series([session_multiplier(h) for h in hours], index=df5.index)

    # ── ATR z-score proxy for vol_z ───────────────────────────────────────────
    atr_roll_mean = atr14.rolling(100, min_periods=20).mean()
    atr_roll_std  = atr14.rolling(100, min_periods=20).std().replace(0, np.nan)
    vol_z         = ((atr14 - atr_roll_mean) / atr_roll_std).fillna(0.0).clip(-4, 4)

    out = df5.copy()
    out["ema_fast"]   = ema_fast
    out["ema_slow"]   = ema_slow
    out["atr14"]      = atr14
    out["separation"] = separation
    out["regime"]     = regime
    out["confidence"] = confidence
    out["ema96"]      = ema96
    out["ema252"]     = ema252
    out["sep1h"]      = sep1h
    out["regime_1h"]  = regime_1h
    out["session"]    = sess_lbl
    out["sess_mult"]  = sess_mult
    out["vol_z"]      = vol_z
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Composite score (backtester-local version, mirrors regime_score.py weights)
# ─────────────────────────────────────────────────────────────────────────────

def _atr_regime_score(atr: float, price: float) -> float:
    """ATR % of price → 0–100 score."""
    if price <= 0 or atr <= 0:
        return 50.0
    pct = atr / price * 100.0
    if pct < 0.005:
        return 30.0
    if pct < 0.04:
        return 90.0
    if pct < 0.10:
        return 70.0
    return 30.0


def _dxy_score(pair: str, regime: str) -> float:
    """Simplified DXY score: neutral 50 for crosses; USD pairs use regime direction."""
    rel = _DXY_USD_BULL.get(pair)
    if rel is None:
        return 50.0
    is_bull = regime == "BULL"
    is_bear = regime == "BEAR"
    if not (is_bull or is_bear):
        return 50.0
    # Without live DXY feed we assume a slight drift neutral → slight trend
    # USD-quote pairs in BULL align with USD strength → modest boost
    # This matches the live bot's dxy_trend_pct=0.0 assumption (neutral = 50)
    return 50.0


def compute_score_v3(
    pair: str,
    regime: str,
    confidence: float,
    bocpd_prob: float,
    bocpd_trend: float,
    sess_mult: float,
    consensus: int,
    consensus_total: int,
    atr: float,
    price: float,
    entry_score_min: float = 65.0,
) -> Tuple[float, bool]:
    """
    V3 composite score. Weights:
        HMM 35%, BOCPD 20%, session 15%, DXY 10%, consensus 10%, ATR-regime 10%

    BOCPD penalty at entry:
        bocpd_s = max(0, 100 - bocpd_prob)
        if bocpd_trend > 10: bocpd_s -= bocpd_trend

    Returns (total_score, entry_allowed).
    """
    # HMM component
    hmm_s = max(0.0, min(100.0, (confidence - 65.0) / 35.0 * 100.0))

    # BOCPD stability with rising-trend penalty
    bocpd_s = max(0.0, 100.0 - bocpd_prob)
    if bocpd_trend > 10.0:
        bocpd_s = max(0.0, bocpd_s - bocpd_trend)

    # Session quality
    sess_s = max(0.0, min(100.0, (sess_mult - 0.70) / 0.30 * 100.0))

    # DXY alignment (neutral in backtest)
    dxy_s = _dxy_score(pair, regime)

    # Consensus
    if consensus_total <= 1:
        cons_s = 50.0
    else:
        cons_s = min(100.0, consensus / max(1, consensus_total - 1) * 100.0)

    # ATR-regime proxy
    atr_s = _atr_regime_score(atr, price)

    # Weighted total (V3 weights — no vol/credit from live macro feed)
    total = (
        hmm_s   * 0.35 +
        bocpd_s * 0.20 +
        sess_s  * 0.15 +
        dxy_s   * 0.10 +
        cons_s  * 0.10 +
        atr_s   * 0.10
    )
    total = round(total, 1)
    return total, total >= entry_score_min


def compute_score_v2(
    pair: str,
    regime: str,
    confidence: float,
    bocpd_prob: float,
    sess_mult: float,
    consensus: int,
    consensus_total: int,
    entry_score_min: float = 55.0,
) -> Tuple[float, bool]:
    """
    V2 composite score — same weights as regime_score.py but without
    live vol/credit feeds (they use neutral/assumed values).
    """
    hmm_s  = max(0.0, min(100.0, (confidence - 65.0) / 35.0 * 100.0))
    bocpd_s = max(0.0, 100.0 - bocpd_prob)
    sess_s  = max(0.0, min(100.0, (sess_mult - 0.70) / 0.30 * 100.0))
    dxy_s   = _dxy_score(pair, regime)

    if consensus_total <= 1:
        cons_s = 50.0
    else:
        cons_s = min(100.0, consensus / max(1, consensus_total - 1) * 100.0)

    vol_s    = 75.0   # neutral when no live vol data
    credit_s = 50.0   # neutral

    total = (
        hmm_s    * 0.35 +
        bocpd_s  * 0.20 +
        sess_s   * 0.15 +
        dxy_s    * 0.10 +
        cons_s   * 0.10 +
        vol_s    * 0.05 +
        credit_s * 0.05
    )
    total = round(total, 1)
    return total, total >= entry_score_min


# ─────────────────────────────────────────────────────────────────────────────
# Trade dataclass
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class Trade:
    pair:            str
    direction:       str        # LONG | SHORT
    entry_time:      pd.Timestamp
    entry_price:     float
    sl:              float
    atr_at_entry:    float
    pip:             float
    session:         str
    score_at_entry:  float                 = 0.0
    size_pct:        float                 = 100.0  # 50–100 based on score (same as live bot)
    exit_time:       Optional[pd.Timestamp] = None
    exit_price:      Optional[float]        = None
    exit_reason:     str                    = ""
    mfe:             float                  = 0.0   # in price units (same direction as trade)
    r_multiple:      Optional[float]        = None
    r_weighted:      Optional[float]        = None  # r_multiple × size_pct / 100


def _finalise_trade(t: Trade) -> None:
    """Compute R-multiple and size-weighted R once exit_price is set."""
    if t.exit_price is None or t.atr_at_entry <= 0:
        t.r_multiple = None
        t.r_weighted = None
        return
    sign     = 1 if t.direction == "LONG" else -1
    sl_dist  = abs(t.entry_price - t.sl)
    pnl      = (t.exit_price - t.entry_price) * sign
    t.r_multiple = pnl / sl_dist if sl_dist > 0 else 0.0
    t.r_weighted = t.r_multiple * t.size_pct / 100.0


# ─────────────────────────────────────────────────────────────────────────────
# Data loading
# ─────────────────────────────────────────────────────────────────────────────

def load_pair_m5(pair: str, from_date: Optional[str] = None) -> Optional[pd.DataFrame]:
    """
    Load M1 parquet for 'pair', resample to M5 OHLCV, apply date filter.
    Returns None if file not found.
    """
    stem = PAIR_FILES.get(pair)
    if not stem:
        print(f"  WARNING: no file mapping for {pair}")
        return None

    path = os.path.join(DATA_DIR, f"{stem}.parquet")
    if not os.path.exists(path):
        print(f"  WARNING: file not found: {path}")
        return None

    try:
        df = pd.read_parquet(path)
    except Exception as exc:
        print(f"  ERROR reading {path}: {exc}")
        return None

    # Ensure UTC tz-aware index
    if df.index.tz is None:
        df.index = df.index.tz_localize("UTC")
    else:
        df.index = df.index.tz_convert("UTC")

    # Normalise column names to lowercase
    df.columns = [c.lower() for c in df.columns]
    required = {"open", "high", "low", "close"}
    missing  = required - set(df.columns)
    if missing:
        print(f"  ERROR: {pair} parquet missing columns: {missing}")
        return None

    if from_date:
        cutoff = pd.Timestamp(from_date, tz="UTC")
        df = df[df.index >= cutoff]

    if df.empty:
        print(f"  WARNING: {pair} has no data after {from_date}")
        return None

    # Resample M1 → M5
    df5 = df.resample("5min").agg({
        "open":   "first",
        "high":   "max",
        "low":    "min",
        "close":  "last",
        "volume": "sum" if "volume" in df.columns else lambda x: 0,
    }).dropna(subset=["open", "close"])

    return df5


# ─────────────────────────────────────────────────────────────────────────────
# Consensus pre-computation
# ─────────────────────────────────────────────────────────────────────────────

def build_consensus(
    signals: Dict[str, pd.DataFrame]
) -> Dict[str, pd.Series]:
    """
    For each pair, return a Series indexed by common M5 timestamps giving the
    count of *other* pairs with the same regime label at that timestamp.
    """
    # Collect regime Series for all pairs
    regime_map: Dict[str, pd.Series] = {}
    for pair, df in signals.items():
        regime_map[pair] = df["regime"]

    # Build common index
    all_indices = [s.index for s in regime_map.values()]
    common_idx  = all_indices[0]
    for idx in all_indices[1:]:
        common_idx = common_idx.intersection(idx)

    # Align all to common index
    aligned: Dict[str, pd.Series] = {
        p: s.reindex(common_idx) for p, s in regime_map.items()
    }

    consensus: Dict[str, pd.Series] = {}
    pairs_list = list(aligned.keys())
    n          = len(pairs_list)
    total      = n  # total other pairs is n-1 per pair, but we store n for display

    for pair in pairs_list:
        own = aligned[pair]
        # Count other pairs with same regime at each timestamp
        others = [aligned[p] for p in pairs_list if p != pair]
        if not others:
            consensus[pair] = pd.Series(0, index=common_idx)
            continue
        # Stack others and count matching
        stacked = pd.concat(others, axis=1)
        count   = stacked.apply(lambda row: (row == own.reindex(row.index)).sum()
                                if False else 0, axis=1)
        # Vectorised comparison
        count   = sum((other == own).astype(int).reindex(common_idx, fill_value=0)
                      for other in others)
        consensus[pair] = count

    return consensus


# ─────────────────────────────────────────────────────────────────────────────
# BOCPD computation (sequential per-bar, per-pair)
# ─────────────────────────────────────────────────────────────────────────────

def compute_bocpd_series(df: pd.DataFrame) -> Tuple[pd.Series, pd.Series]:
    """
    Run BOCPD sequentially over the confidence column.
    Auto-reset detector when regime changes.
    Returns (bocpd_prob, bocpd_trend) Series indexed like df.

    bocpd_trend = slope over last 3 BOCPD values (used for V3 entry penalty).
    """
    detector   = BOCPDetector(expected_run_length=150)
    last_regime = None
    probs       = []
    buf3        = []   # rolling last-3 prob values for trend

    conf_arr   = df["confidence"].values
    regime_arr = df["regime"].values

    for i in range(len(df)):
        reg  = regime_arr[i]
        conf = float(conf_arr[i])

        if last_regime is not None and reg != last_regime:
            detector.reset()
        last_regime = reg

        prob = detector.update(conf)
        probs.append(prob)

        buf3.append(prob)
        if len(buf3) > 3:
            buf3.pop(0)

    # Convert to Series
    prob_s  = pd.Series(probs, index=df.index, name="bocpd_prob")

    # Trend: slope of last-3 BOCPD values (compute via rolling)
    trend_s = prob_s.rolling(3, min_periods=2).apply(
        lambda w: _ols_slope(list(w)), raw=True
    ).fillna(0.0).rename("bocpd_trend")

    return prob_s, trend_s


# ─────────────────────────────────────────────────────────────────────────────
# Core trade engine — shared for V2 and V3 with a mode flag
# ─────────────────────────────────────────────────────────────────────────────

def run_pair_backtest(
    pair:      str,
    df:        pd.DataFrame,
    consensus: pd.Series,
    cons_total:int,
    version:   str,          # "v3" | "v2"
    oos_cutoff:Optional[pd.Timestamp] = None,
) -> List[Trade]:
    """
    Run the trade loop for a single pair.

    df must have all signal columns (output of compute_signals + bocpd).
    consensus is a Series of same-regime-other-pair counts, indexed as df.

    Returns list of completed Trade objects.
    """
    trades: List[Trade] = []
    pip    = PIP_SIZES.get(pair, 0.0001)
    spread_pips = DEFAULT_SPREADS.get(pair, DEFAULT_SPREAD)
    spread_price = spread_pips * pip

    # Entry-score minimum
    entry_score_min = 65.0 if version == "v3" else 55.0

    # X8 consensus exit threshold
    x8_min = 1 if version == "v3" else 2   # V3: exit only when < 1; V2: exit when < 2

    # ── State variables ───────────────────────────────────────────────────────
    in_trade:       bool                     = False
    position:       Optional[dict]           = None
    conf_hist:      List[float]              = []   # rolling last-10 confidence values
    debounce_buf:   List[Tuple[str, float]]  = []   # for hold debounce (regime, conf)
    bocpd_high_ctr: int                      = 0    # consecutive bars BOCPD ≥ 70%
    score_low_ctr:  int                      = 0    # consecutive bars score < hold_min (40)

    # Get numpy arrays for speed
    idx_arr    = df.index
    open_arr   = df["open"].values
    high_arr   = df["high"].values
    low_arr    = df["low"].values
    close_arr  = df["close"].values
    atr_arr    = df["atr14"].values
    regime_arr = df["regime"].values
    conf_arr   = df["confidence"].values
    r1h_arr    = df["regime_1h"].values
    sess_arr   = df["session"].values
    smul_arr   = df["sess_mult"].values
    volz_arr   = df["vol_z"].values
    bprob_arr  = df["bocpd_prob"].values
    btrnd_arr  = df["bocpd_trend"].values

    # Reindex consensus to match df (fill missing with 0)
    cons_aligned = consensus.reindex(idx_arr, fill_value=0).values

    n = len(df)

    for i in range(30, n):   # skip first 30 bars for indicator warmup
        ts        = idx_arr[i]
        hour_utc  = ts.hour
        regime    = regime_arr[i]
        conf      = float(conf_arr[i])
        r1h       = r1h_arr[i]
        sess      = sess_arr[i]
        s_mult    = float(smul_arr[i])
        vol_z     = float(volz_arr[i])
        bocpd_p   = float(bprob_arr[i])
        bocpd_t   = float(btrnd_arr[i])
        atr       = float(atr_arr[i])
        cl        = float(close_arr[i])
        hi        = float(high_arr[i])
        lo        = float(low_arr[i])
        cons_cnt  = int(cons_aligned[i])

        # Update confidence history
        conf_hist.append(conf)
        if len(conf_hist) > 10:
            conf_hist.pop(0)

        # Trade window gate
        in_window = TRADE_WINDOW_START <= hour_utc < TRADE_WINDOW_END

        # ── Manage open position ─────────────────────────────────────────────
        if in_trade and position is not None:
            entry_r   = position["entry_regime"]
            ep        = position["entry_price"]
            sl        = position["sl"]
            direction = position["direction"]
            atr_ent   = position["atr_at_entry"]
            sl_dist   = abs(ep - sl)
            sign      = 1 if direction == "LONG" else -1

            # Live MFE tracking
            fav = (cl - ep) * sign
            if fav > position["mfe"]:
                position["mfe"] = fav
            mfe_r = position["mfe"] / sl_dist if sl_dist > 0 else 0.0

            # ── SL hit check (X5) ────────────────────────────────────────────
            sl_hit = (direction == "LONG"  and lo <= sl) or \
                     (direction == "SHORT" and hi >= sl)
            if sl_hit:
                exit_px = sl
                t = position["trade"]
                t.exit_time   = ts
                t.exit_price  = exit_px
                t.exit_reason = "X5_sl"
                t.mfe         = position["mfe"]
                _finalise_trade(t)
                trades.append(t)
                in_trade  = False
                position  = None
                conf_hist = []
                debounce_buf = []
                bocpd_high_ctr = 0
                score_low_ctr  = 0
                continue

            # ── Update BOCPD high counter ────────────────────────────────────
            if bocpd_p >= 70.0:
                bocpd_high_ctr += 1
            else:
                bocpd_high_ctr = 0

            # ── Compute score for hold gate ───────────────────────────────────
            if version == "v3":
                hold_score, _ = compute_score_v3(
                    pair, regime, conf, bocpd_p, bocpd_t, s_mult,
                    cons_cnt, cons_total, atr, cl, entry_score_min=65.0
                )
            else:
                hold_score, _ = compute_score_v2(
                    pair, regime, conf, bocpd_p, s_mult, cons_cnt, cons_total,
                    entry_score_min=55.0
                )

            if hold_score < 40.0:
                score_low_ctr += 1
            else:
                score_low_ctr = 0

            close_reason = ""

            # X1 — regime flipped (allow 2-bar grace for RANGE)
            if regime != entry_r:
                position["range_ctr"] = position.get("range_ctr", 0)
                if regime != "RANGE":
                    close_reason = "X1_regime"
                else:
                    position["range_ctr"] += 1
                    if position["range_ctr"] >= 2:
                        close_reason = "X1_regime"
            else:
                position["range_ctr"] = 0

            # X2 — confidence floor
            if not close_reason and conf < 45.0:
                close_reason = "X2_conf_floor"

            # X3 — confidence slope deterioration (suppressed when MFE ≥ 1R in V3)
            if not close_reason and len(conf_hist) >= 3:
                suppress_x3 = (version == "v3" and mfe_r >= 1.0)
                if not suppress_x3:
                    recent_diffs = [
                        conf_hist[j] - conf_hist[j - 1]
                        for j in range(max(1, len(conf_hist) - 3), len(conf_hist))
                    ]
                    if recent_diffs and all(d < -5.0 for d in recent_diffs):
                        close_reason = "X3_slope"

            # X4 — single-bar drop (suppressed when MFE ≥ 1R in V3)
            if not close_reason and len(conf_hist) >= 2:
                suppress_x4 = (version == "v3" and mfe_r >= 1.0)
                if not suppress_x4:
                    drop = conf_hist[-2] - conf_hist[-1]
                    if drop > 15.0:
                        close_reason = "X4_drop"

            # X6 — BOCPD sustained high (≥ 70% for 2 consecutive bars)
            if not close_reason and bocpd_high_ctr >= 2:
                close_reason = "X6_bocpd"

            # X7 — 1H regime opposed
            if not close_reason:
                opp1h = {"BULL": "BEAR", "BEAR": "BULL"}
                if r1h == opp1h.get(entry_r, ""):
                    close_reason = "X7_1h"

            # X8 — consensus collapsed
            if not close_reason:
                if cons_total > 1 and cons_cnt < x8_min:
                    close_reason = "X8_consensus"

            # X11 — score sustained below hold min
            if not close_reason and score_low_ctr >= 2:
                close_reason = "X11_score"

            # Outside trade window → close
            if not close_reason and not in_window:
                close_reason = "window"

            if close_reason:
                # LONG exit → sell at bid (cl − half-spread); SHORT exit → buy at ask (cl + half-spread)
                exit_px = cl - (spread_price / 2) if direction == "LONG" else cl + (spread_price / 2)
                t = position["trade"]
                t.exit_time   = ts
                t.exit_price  = exit_px
                t.exit_reason = close_reason
                t.mfe         = position["mfe"]
                _finalise_trade(t)
                trades.append(t)
                in_trade  = False
                position  = None
                conf_hist = []
                debounce_buf = []
                bocpd_high_ctr = 0
                score_low_ctr  = 0
                continue

            continue   # position being held — no entry logic this bar

        # ── Entry logic ───────────────────────────────────────────────────────
        if not in_window:
            debounce_buf = []
            continue

        if regime not in ("BULL", "BEAR"):
            debounce_buf = []
            continue

        # ── Gate checks ───────────────────────────────────────────────────────
        eff_conf = conf * s_mult

        if version == "v3":
            # V3 hard gates (4 only)
            # G1: effective confidence ≥ 70%
            if eff_conf < 70.0:
                debounce_buf = []
                continue

            # G2: debounce (2 bars) — handled below by debounce_buf

            # G3: consensus ≥ 2 pairs (2 other pairs with same regime)
            if cons_total > 1 and cons_cnt < 2:
                debounce_buf = []
                continue

            # G4: 1H not opposed
            opp = {"BULL": "BEAR", "BEAR": "BULL"}
            if r1h == opp.get(regime, ""):
                debounce_buf = []
                continue

        else:
            # V2 hard gates (all 13 mapped to available simulated data)
            # E2: effective confidence ≥ 70%
            if eff_conf < 70.0:
                debounce_buf = []
                continue

            # E3: confidence rising (last 2 bars)
            if len(conf_hist) >= 2 and conf_hist[-1] <= conf_hist[-2]:
                if conf < 85.0:   # bypass if very high confidence
                    debounce_buf = []
                    continue

            # E4: vol_z ≤ 2.5
            if vol_z > 2.5:
                debounce_buf = []
                continue

            # E6: decay proxy — BOCPD + conf trend below 0.25
            # Simulated: skip if BOCPD > 25 and bocpd rising (trend > 5)
            decay_proxy = 0.0
            if bocpd_p > 25.0 and bocpd_t > 5.0:
                decay_proxy = min(1.0, bocpd_p / 100.0 + bocpd_t / 100.0)
            if decay_proxy >= 0.25:
                debounce_buf = []
                continue

            # E7: 1H not opposed
            opp = {"BULL": "BEAR", "BEAR": "BULL"}
            if r1h == opp.get(regime, ""):
                debounce_buf = []
                continue

            # E8: consensus ≥ 2 pairs
            if cons_total > 1 and cons_cnt < 2:
                debounce_buf = []
                continue

            # E12: volume exhaustion proxy — skip if vol_z was elevated and now < -0.5
            # (simplified: use vol_z < -0.5 with prior high as proxy)
            # We skip this gate as vol exhaustion needs the full VolExhaustionDetector
            # state across bars — the simpler vol_z proxy is already captured by E4.

        # ── Composite score gate ──────────────────────────────────────────────
        if version == "v3":
            score, entry_ok = compute_score_v3(
                pair, regime, conf, bocpd_p, bocpd_t, s_mult,
                cons_cnt, cons_total, atr, cl, entry_score_min=entry_score_min
            )
        else:
            score, entry_ok = compute_score_v2(
                pair, regime, conf, bocpd_p, s_mult,
                cons_cnt, cons_total, entry_score_min=entry_score_min
            )

        if not entry_ok:
            debounce_buf = []
            continue

        # ── Debounce: 2 consecutive bars same regime + conf ≥ entry_conf_adj ──
        debounce_buf.append((regime, eff_conf))
        # Trim to last 2
        if len(debounce_buf) > 2:
            debounce_buf = debounce_buf[-2:]

        if len(debounce_buf) < 2:
            continue

        # Check both last 2 bars agree
        if debounce_buf[-1][0] != debounce_buf[-2][0]:
            debounce_buf = debounce_buf[-1:]
            continue
        if debounce_buf[-1][1] < 70.0 or debounce_buf[-2][1] < 70.0:
            debounce_buf = []
            continue

        # ── Open position ─────────────────────────────────────────────────────
        direction  = "LONG" if regime == "BULL" else "SHORT"
        # LONG entry → buy at ask (cl + half-spread); SHORT entry → sell at bid (cl − half-spread)
        entry_px   = cl + (spread_price / 2) if direction == "LONG" else cl - (spread_price / 2)
        sl_dist    = atr * SL_ATR_MULT if atr > 0 else 20 * pip
        sl         = (entry_px - sl_dist) if direction == "LONG" else (entry_px + sl_dist)

        # Score-based position sizing (mirrors live bot: 50% at entry_score_min, 100% at 100)
        esm = entry_score_min
        size_pct_val = round(min(100.0, max(0.0, 50.0 + (score - esm) / max(1.0, 100.0 - esm) * 50.0)), 1)

        trade = Trade(
            pair           = pair,
            direction      = direction,
            entry_time     = ts,
            entry_price    = entry_px,
            sl             = sl,
            atr_at_entry   = atr,
            pip            = pip,
            session        = sess,
            score_at_entry = round(score, 1),
            size_pct       = size_pct_val,
        )

        position = {
            "trade":        trade,
            "entry_regime": regime,
            "entry_price":  entry_px,
            "direction":    direction,
            "sl":           sl,
            "atr_at_entry": atr,
            "mfe":          0.0,
            "range_ctr":    0,
        }
        in_trade       = True
        bocpd_high_ctr = 0
        score_low_ctr  = 0
        conf_hist      = [conf]
        debounce_buf   = []

    # ── Force-close any open position at end of data ──────────────────────────
    if in_trade and position is not None:
        t = position["trade"]
        last_idx = idx_arr[-1]
        t.exit_time   = last_idx
        t.exit_price  = float(close_arr[-1])
        t.exit_reason = "end_of_data"
        t.mfe         = position["mfe"]
        _finalise_trade(t)
        trades.append(t)

    return trades


# ─────────────────────────────────────────────────────────────────────────────
# Statistics
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class Stats:
    n:                int   = 0
    wins:             int   = 0
    losses:           int   = 0
    gross_win:        float = 0.0
    gross_loss:       float = 0.0
    total_r:          float = 0.0   # equal-weight R sum
    weighted_total_r: float = 0.0   # size_pct-weighted R sum (realistic lot scaling)
    r_values:         List[float] = field(default_factory=list)
    max_dd:           float = 0.0   # in R units (equal-weight)
    avg_score:        float = 0.0

    @property
    def win_rate(self) -> float:
        return self.wins / self.n * 100.0 if self.n > 0 else 0.0

    @property
    def profit_factor(self) -> float:
        return self.gross_win / self.gross_loss if self.gross_loss > 0 else float("inf")

    @property
    def avg_r(self) -> float:
        return self.total_r / self.n if self.n > 0 else 0.0

    @property
    def weighted_avg_r(self) -> float:
        return self.weighted_total_r / self.n if self.n > 0 else 0.0

    def to_dict(self) -> dict:
        return {
            "n":                self.n,
            "wins":             self.wins,
            "losses":           self.losses,
            "win_rate":         round(self.win_rate, 1),
            "pf":               round(self.profit_factor, 3),
            "avg_r":            round(self.avg_r, 4),
            "total_r":          round(self.total_r, 3),
            "weighted_avg_r":   round(self.weighted_avg_r, 4),
            "weighted_total_r": round(self.weighted_total_r, 3),
            "max_dd":           round(self.max_dd, 3),
            "avg_score":        round(self.avg_score, 1),
        }


def _compute_max_dd_r(r_values: List[float]) -> float:
    """Maximum drawdown measured in R units."""
    peak = 0.0
    eq   = 0.0
    dd   = 0.0
    for r in r_values:
        eq += r
        if eq > peak:
            peak = eq
        drawdown = peak - eq
        if drawdown > dd:
            dd = drawdown
    return dd


def compute_stats(trades: List[Trade]) -> Stats:
    s = Stats()
    s.n = len(trades)
    scores = []
    for t in trades:
        r  = t.r_multiple if t.r_multiple is not None else 0.0
        rw = t.r_weighted  if t.r_weighted  is not None else 0.0
        s.r_values.append(r)
        s.total_r          += r
        s.weighted_total_r += rw
        scores.append(t.score_at_entry)
        if r > 0:
            s.wins += 1
            s.gross_win += r
        else:
            s.losses += 1
            s.gross_loss += abs(r)
    s.max_dd    = _compute_max_dd_r(s.r_values)
    s.avg_score = sum(scores) / len(scores) if scores else 0.0
    return s


def split_by_oos(
    trades: List[Trade], oos_cutoff: pd.Timestamp
) -> Tuple[List[Trade], List[Trade]]:
    """Split trades into in-sample and out-of-sample."""
    is_trades  = [t for t in trades if t.entry_time < oos_cutoff]
    oos_trades = [t for t in trades if t.entry_time >= oos_cutoff]
    return is_trades, oos_trades


# ─────────────────────────────────────────────────────────────────────────────
# Results formatting
# ─────────────────────────────────────────────────────────────────────────────

def _fmt_stats(s: Stats, label: str = "All") -> str:
    pf = f"{s.profit_factor:.2f}" if s.profit_factor < 999 else "∞"
    return (
        f"  {label:<6} n={s.n:<4}  WR={s.win_rate:5.1f}%  "
        f"PF={pf}  avgR={s.avg_r:+.3f}  wAvgR={s.weighted_avg_r:+.3f}  "
        f"totalR={s.total_r:+.2f}  maxDD={s.max_dd:.2f}R  score={s.avg_score:.0f}"
    )


def print_results(
    v3_trades:   List[Trade],
    v2_trades:   Optional[List[Trade]],
    oos_cutoff:  pd.Timestamp,
    version_label: str = "V3",
) -> None:
    v3_is, v3_oos = split_by_oos(v3_trades, oos_cutoff)
    s3_all = compute_stats(v3_trades)
    s3_is  = compute_stats(v3_is)
    s3_oos = compute_stats(v3_oos)

    print("\n" + "=" * 48)
    print("RESULTS")
    print("=" * 48)

    print(f"\n── {version_label} ──")
    print(_fmt_stats(s3_all, "All"))
    print(_fmt_stats(s3_is,  "IS "))
    print(_fmt_stats(s3_oos, "OOS"))

    if v2_trades is not None:
        v2_is, v2_oos = split_by_oos(v2_trades, oos_cutoff)
        s2_all = compute_stats(v2_trades)
        s2_is  = compute_stats(v2_is)
        s2_oos = compute_stats(v2_oos)

        print(f"\n── V2 (comparison) ──")
        print(_fmt_stats(s2_all, "All"))
        print(_fmt_stats(s2_is,  "IS "))
        print(_fmt_stats(s2_oos, "OOS"))

        print(f"\n── {version_label} vs V2 delta ──")
        dwr = s3_all.win_rate - s2_all.win_rate
        dpf = s3_all.profit_factor - s2_all.profit_factor if s2_all.profit_factor < 999 else 0.0
        dar = s3_all.avg_r - s2_all.avg_r
        print(f"  Win rate : V2={s2_all.win_rate:.1f}%  {version_label}={s3_all.win_rate:.1f}%  Δ={dwr:+.1f}pp")
        pf2_s = f"{s2_all.profit_factor:.2f}" if s2_all.profit_factor < 999 else "∞"
        pf3_s = f"{s3_all.profit_factor:.2f}" if s3_all.profit_factor < 999 else "∞"
        print(f"  PF       : V2={pf2_s}  {version_label}={pf3_s}  Δ={dpf:+.2f}")
        print(f"  avg R    : V2={s2_all.avg_r:+.3f}  {version_label}={s3_all.avg_r:+.3f}  Δ={dar:+.3f}")
        print(f"  total R  : V2={s2_all.total_r:+.2f}  {version_label}={s3_all.total_r:+.2f}  "
              f"Δ={s3_all.total_r - s2_all.total_r:+.2f}")
        print(f"  trades   : V2={s2_all.n}  {version_label}={s3_all.n}  Δ={s3_all.n - s2_all.n:+d}")

    # ── By pair ───────────────────────────────────────────────────────────────
    print(f"\n── {version_label} by pair ──")
    pairs_seen: Dict[str, List[Trade]] = defaultdict(list)
    for t in v3_trades:
        pairs_seen[t.pair].append(t)
    for pair in sorted(pairs_seen):
        ps = compute_stats(pairs_seen[pair])
        pf_s = f"{ps.profit_factor:.2f}" if ps.profit_factor < 999 else "∞"
        print(f"  {pair:<10}  n={ps.n:<4}  WR={ps.win_rate:5.1f}%  "
              f"PF={pf_s}  avgR={ps.avg_r:+.3f}")

    # ── Exit reasons ──────────────────────────────────────────────────────────
    print(f"\n── {version_label} exit reasons ──")
    reasons: Dict[str, List[Trade]] = defaultdict(list)
    for t in v3_trades:
        reasons[t.exit_reason].append(t)
    for reason in sorted(reasons, key=lambda r: -len(reasons[r])):
        rs = compute_stats(reasons[reason])
        print(f"  {reason:<18}  n={rs.n:<4}  WR={rs.win_rate:.1f}%")

    # ── By session ────────────────────────────────────────────────────────────
    print(f"\n── {version_label} by session ──")
    sessions: Dict[str, List[Trade]] = defaultdict(list)
    for t in v3_trades:
        sessions[t.session].append(t)
    for sess in ["London", "NY", "Late", "Asian"]:
        if sess not in sessions:
            continue
        ss = compute_stats(sessions[sess])
        pf_s = f"{ss.profit_factor:.2f}" if ss.profit_factor < 999 else "∞"
        print(f"  {sess:<8}  n={ss.n:<4}  WR={ss.win_rate:5.1f}%  "
              f"PF={pf_s}  avgR={ss.avg_r:+.3f}")

    print()


# ─────────────────────────────────────────────────────────────────────────────
# Main entry point
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="RegimeV2 backtester — V3 vs V2 comparison"
    )
    parser.add_argument(
        "--pairs", nargs="+", default=None,
        help="Space-separated pair slugs e.g. eurusd gbpusd usdjpy. "
             "Defaults to 9-pair core set."
    )
    parser.add_argument(
        "--from", dest="from_date", default="2018-01-01",
        help="Start date YYYY-MM-DD (default: 2018-01-01)"
    )
    parser.add_argument(
        "--oos-days", type=int, default=180,
        help="Last N days are out-of-sample (default: 180)"
    )
    parser.add_argument(
        "--compare-v2", action="store_true",
        help="Also run V2 trade logic for comparison"
    )
    parser.add_argument(
        "--output", default=None,
        help="Optional path to write JSON results"
    )
    args = parser.parse_args()

    # ── Resolve pair list ─────────────────────────────────────────────────────
    if args.pairs:
        # Accept both slug form (eurusd) and slash form (EUR/USD)
        slug_to_pair = {p.replace("/", "").lower(): p for p in PAIR_FILES}
        resolved: List[str] = []
        for s in args.pairs:
            key = s.lower().replace("/", "")
            if key in slug_to_pair:
                resolved.append(slug_to_pair[key])
            else:
                print(f"WARNING: unknown pair '{s}' — skipping")
        if not resolved:
            print("ERROR: no valid pairs specified")
            sys.exit(1)
        pairs = resolved
    else:
        pairs = DEFAULT_PAIRS

    # ── Load and compute signals ───────────────────────────────────────────────
    print(f"\nLoading M5 data for {len(pairs)} pairs...")
    signals:   Dict[str, pd.DataFrame] = {}
    all_dates: List[pd.Timestamp]      = []

    for pair in pairs:
        df5 = load_pair_m5(pair, from_date=args.from_date)
        if df5 is None:
            continue
        df_sig = compute_signals(df5)
        # Add BOCPD series (sequential — must be done before consensus)
        bocpd_p, bocpd_t = compute_bocpd_series(df_sig)
        df_sig["bocpd_prob"]  = bocpd_p
        df_sig["bocpd_trend"] = bocpd_t
        signals[pair] = df_sig

        first = df_sig.index[0]
        last  = df_sig.index[-1]
        all_dates.extend([first, last])
        print(f"  {pair}: {len(df_sig):,} M5 bars "
              f"({first.strftime('%Y-%m-%d')} → {last.strftime('%Y-%m-%d')})")

    if not signals:
        print("ERROR: no data loaded — check parquet files in", DATA_DIR)
        sys.exit(1)

    # ── Determine OOS cutoff ──────────────────────────────────────────────────
    data_end    = max(all_dates)
    oos_cutoff  = data_end - pd.Timedelta(days=args.oos_days)
    print(f"\nOOS split: {oos_cutoff.strftime('%Y-%m-%d')} → {data_end.strftime('%Y-%m-%d')} "
          f"({args.oos_days} days)")

    # ── Build consensus ───────────────────────────────────────────────────────
    print("Building consensus alignment...")
    consensus_map = build_consensus(signals)
    cons_total    = len(signals)  # number of pairs loaded

    # ── Run V3 backtest ───────────────────────────────────────────────────────
    print("\nRunning V3 backtest...")
    v3_trades: List[Trade] = []
    for pair, df in signals.items():
        cons = consensus_map.get(pair, pd.Series(0, index=df.index))
        pair_trades = run_pair_backtest(
            pair, df, cons, cons_total, version="v3", oos_cutoff=oos_cutoff
        )
        v3_trades.extend(pair_trades)
        if pair_trades:
            ps = compute_stats(pair_trades)
            pf_s = f"{ps.profit_factor:.2f}" if ps.profit_factor < 999 else "∞"
            print(f"  {pair}: {ps.n} trades  WR={ps.win_rate:.1f}%  PF={pf_s}  avgR={ps.avg_r:+.3f}")

    # ── Run V2 backtest (optional) ─────────────────────────────────────────────
    v2_trades: Optional[List[Trade]] = None
    if args.compare_v2:
        print("\nRunning V2 backtest (comparison)...")
        v2_trades = []
        for pair, df in signals.items():
            cons = consensus_map.get(pair, pd.Series(0, index=df.index))
            pair_trades = run_pair_backtest(
                pair, df, cons, cons_total, version="v2", oos_cutoff=oos_cutoff
            )
            v2_trades.extend(pair_trades)
            if pair_trades:
                ps = compute_stats(pair_trades)
                pf_s = f"{ps.profit_factor:.2f}" if ps.profit_factor < 999 else "∞"
                print(f"  {pair}: {ps.n} trades  WR={ps.win_rate:.1f}%  PF={pf_s}  avgR={ps.avg_r:+.3f}")

    # ── Sort trades chronologically for max-DD accuracy ───────────────────────
    v3_trades.sort(key=lambda t: t.entry_time)
    if v2_trades:
        v2_trades.sort(key=lambda t: t.entry_time)

    # ── Print formatted results ───────────────────────────────────────────────
    print_results(v3_trades, v2_trades, oos_cutoff)

    # ── JSON output ───────────────────────────────────────────────────────────
    if args.output:
        v3_is, v3_oos = split_by_oos(v3_trades, oos_cutoff)

        def _trades_dict(trades: List[Trade]) -> List[dict]:
            out = []
            for t in trades:
                out.append({
                    "pair":           t.pair,
                    "direction":      t.direction,
                    "entry_time":     str(t.entry_time),
                    "exit_time":      str(t.exit_time) if t.exit_time else None,
                    "entry_price":    t.entry_price,
                    "exit_price":     t.exit_price,
                    "exit_reason":    t.exit_reason,
                    "r_multiple":     round(t.r_multiple, 4) if t.r_multiple is not None else None,
                    "r_weighted":     round(t.r_weighted,  4) if t.r_weighted  is not None else None,
                    "mfe":            round(t.mfe, 6),
                    "session":        t.session,
                    "score_at_entry": t.score_at_entry,
                    "size_pct":       t.size_pct,
                })
            return out

        result = {
            "run_date":   datetime.now(timezone.utc).isoformat(),
            "from_date":  args.from_date,
            "oos_cutoff": str(oos_cutoff.date()),
            "oos_days":   args.oos_days,
            "pairs":      pairs,
            "v3": {
                "all":  compute_stats(v3_trades).to_dict(),
                "is":   compute_stats(v3_is).to_dict(),
                "oos":  compute_stats(v3_oos).to_dict(),
            },
        }

        if v2_trades:
            v2_is, v2_oos = split_by_oos(v2_trades, oos_cutoff)
            result["v2"] = {
                "all": compute_stats(v2_trades).to_dict(),
                "is":  compute_stats(v2_is).to_dict(),
                "oos": compute_stats(v2_oos).to_dict(),
            }

        result["v3_trades"] = _trades_dict(v3_trades)
        if v2_trades:
            result["v2_trades"] = _trades_dict(v2_trades)

        with open(args.output, "w", encoding="utf-8") as fh:
            json.dump(result, fh, indent=2)
        print(f"Results written to: {args.output}")


if __name__ == "__main__":
    main()
