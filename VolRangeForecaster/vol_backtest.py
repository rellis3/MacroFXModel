#!/usr/bin/env python3
"""
Vol & Range Walk-Forward Backtester
====================================

Strategy (from Vol & Range Forecaster reference):
  Each day T, using only data up to T-1:
    1. EWMA(λ=0.94) vol → σ_d → forecast HL_75 and OC_median (% of price)
    2. EMA-slope regime classifier → BULL / BEAR / RANGE
    3. Place limit orders:
         BULL  → SELL at open + HL_75,  TP = open + OC_median, SL = open + HL_75 × sl_mult
         BEAR  → BUY  at open − HL_75,  TP = open − OC_median, SL = open − HL_75 × sl_mult
         RANGE → fade BOTH extremes,   TP = open  (first fill only)
    4. Score: WIN (TP hit), LOSS (SL hit), OPEN (end-of-day at close)

Rationale (from group discussion):
  - HL_75 is where price reaches its intraday extreme (~25% of sessions go further)
  - OC_median is where the day statistically closes (direction set by regime)
  - Fade the extreme → target the statistical close level

Usage:
  python vol_backtest.py                         # all instruments, Drive parquet
  python vol_backtest.py --yahoo                 # use Yahoo Finance instead
  python vol_backtest.py --pair GBPUSD           # single pair
  python vol_backtest.py --from 2022-01-01       # start date
  python vol_backtest.py --sl-mult 2.0           # widen stop
  python vol_backtest.py --no-regime             # always fade both extremes (baseline)
  python vol_backtest.py --save                  # save trade log to CSV
  python vol_backtest.py --extra-pairs           # include all bonus pairs from Drive
"""

import argparse
import io
import json
import math
import os
import warnings
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
import requests

warnings.filterwarnings("ignore")

# ── Constants (identical to vol_range_forecast.py) ───────────────────────────

EWMA_LAMBDA  = 0.94
TRADING_DAYS = 252
BM_RANGE_P50 = 1.572    # HL median (50th pct) multiplier
BM_RANGE_P75 = 2.049    # HL 75th pct multiplier
HALFNORM_P50 = 0.6745   # OC median multiplier

ASSET_PARAMS = {
    "commodity": {"hl_75_corr": 0.989, "oc_corr": 1.163},
    "index":     {"hl_75_corr": 0.950, "oc_corr": 1.111},
    "fx":        {"hl_75_corr": 0.894, "oc_corr": 0.948},
}

# ── Instrument manifest ───────────────────────────────────────────────────────
# drive_id: Google Drive file ID for the D1 parquet (None = Yahoo fallback only)

CORE_INSTRUMENTS = [
    {"name": "EURUSD", "asset_class": "fx",        "yahoo": "EURUSD=X", "drive_id": "1VO_zlJD3_UcQ749NIajopfGF2gE2OCNH"},
    {"name": "GBPUSD", "asset_class": "fx",        "yahoo": "GBPUSD=X", "drive_id": "1BecLuHqBw_dtZAqIuNsSxbAKfsNUXkgh"},
    {"name": "USDJPY", "asset_class": "fx",        "yahoo": "USDJPY=X", "drive_id": "1C7cqHCB9_i17KLX-0rL2IoE1HoBMIXh-"},
    {"name": "AUDUSD", "asset_class": "fx",        "yahoo": "AUDUSD=X", "drive_id": "1YVjra90NWnjHXjSy2EaXYoL_-Cz1PpGP"},
    {"name": "NZDUSD", "asset_class": "fx",        "yahoo": "NZDUSD=X", "drive_id": "1TODebDw2JBw6kia998kRS3L3aFw9HRp8"},
    {"name": "USDCAD", "asset_class": "fx",        "yahoo": "USDCAD=X", "drive_id": "1s2vkg7tR6cA2mrWH_gizRaTDTA1QhLQu"},
    {"name": "USDCHF", "asset_class": "fx",        "yahoo": "USDCHF=X", "drive_id": "1GtUgbrX_NwlOWd9l9zY48egTpxccQqvX"},
    {"name": "GBPJPY", "asset_class": "fx",        "yahoo": "GBPJPY=X", "drive_id": "1tR-biA5-bisd-OpVZJv7EsLGrAVtJbQR"},
    {"name": "GOLD",   "asset_class": "commodity", "yahoo": "GC=F",     "drive_id": None},
    {"name": "NQ",     "asset_class": "index",     "yahoo": "NQ=F",     "drive_id": None},
]

EXTRA_INSTRUMENTS = [
    {"name": "GBPNZD", "asset_class": "fx", "yahoo": "GBPNZD=X", "drive_id": "1GHxhSzf2hVex3A9478J2TbFnSKZ39zTY"},
    {"name": "GBPAUD", "asset_class": "fx", "yahoo": "GBPAUD=X", "drive_id": "1kyWSJnqprqucRF4x7ygdHT30wR-DWbJM"},
    {"name": "GBPCAD", "asset_class": "fx", "yahoo": "GBPCAD=X", "drive_id": "1OFk8PJxCqrPM3U-of-FwrguWUke-THgC"},
    {"name": "GBPCHF", "asset_class": "fx", "yahoo": "GBPCHF=X", "drive_id": "19gHQBdJhmBKtdsd_DXCrEzcsNdAdcHVl"},
    {"name": "EURAUD", "asset_class": "fx", "yahoo": "EURAUD=X", "drive_id": "10ADH3XvdLh6mRsiO8i1Y9d2-yPqLAkcn"},
    {"name": "EURNZD", "asset_class": "fx", "yahoo": "EURNZD=X", "drive_id": "15Yv048Us5GRo_tkqcV_cCbm5vvxPDVzJ"},
    {"name": "EURCAD", "asset_class": "fx", "yahoo": "EURCAD=X", "drive_id": "1LC898R79k8jufYZ3HWI8h_83ek-gjx9-"},
    {"name": "EURCHF", "asset_class": "fx", "yahoo": "EURCHF=X", "drive_id": "1xayD6xXw9GULXbb31g__9B8Ggmt5IL9n"},
    {"name": "EURJPY", "asset_class": "fx", "yahoo": "EURJPY=X", "drive_id": "17qriDGx0hwrEbMhFWP8rTSqkbsCea32x"},
    {"name": "EURGBP", "asset_class": "fx", "yahoo": "EURGBP=X", "drive_id": "1_NyuShsq8aNp1Ux7ZOzRnjbNlSUsZDn9"},
    {"name": "AUDJPY", "asset_class": "fx", "yahoo": "AUDJPY=X", "drive_id": "1iCFKU8Wb0brixv9kRBi6-MpuyA_wtTEX"},
    {"name": "AUDCAD", "asset_class": "fx", "yahoo": "AUDCAD=X", "drive_id": "1VyYI924oIJX8JHO-2fz_RmMfBMIrc8Ce"},
    {"name": "AUDNZD", "asset_class": "fx", "yahoo": "AUDNZD=X", "drive_id": "1I8KFUSnfXNnNFWMbp9IybmuXFSXxQThW"},
    {"name": "CADJPY", "asset_class": "fx", "yahoo": "CADJPY=X", "drive_id": "1yWkHxj0OAhI7diHkLRSMl6vpyfgnxBKa"},
    {"name": "CHFJPY", "asset_class": "fx", "yahoo": "CHFJPY=X", "drive_id": "1JkMmFhDUM0WfXgaFvBJP8ExQ7Ur0qZWn"},
    {"name": "NZDJPY", "asset_class": "fx", "yahoo": "NZDJPY=X", "drive_id": "1R_rL1nPWFyTMjjz46Tjv0hcsp_DQs0bi"},
]

DATA_DIR = Path(__file__).parent / "data"


# ── Data loading ──────────────────────────────────────────────────────────────

def _drive_download(drive_id: str, dest: Path) -> pd.DataFrame:
    url = f"https://drive.google.com/uc?export=download&id={drive_id}"
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(r.content)
    return pd.read_parquet(dest)


def _yahoo_fetch(ticker: str) -> pd.DataFrame:
    try:
        import yfinance as yf
    except ImportError:
        raise ImportError("pip install yfinance")
    end   = datetime.now(timezone.utc)
    start = end - timedelta(days=4000)
    df = yf.download(ticker, start=start.strftime("%Y-%m-%d"),
                     end=end.strftime("%Y-%m-%d"),
                     auto_adjust=True, progress=False)
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    df.columns = [c.lower() for c in df.columns]
    df.index   = pd.to_datetime(df.index, utc=True)
    return df[["open", "high", "low", "close"]].dropna()


def load_ohlc(cfg: dict, use_yahoo: bool = False) -> pd.DataFrame:
    name     = cfg["name"]
    drive_id = cfg.get("drive_id")

    if not use_yahoo and drive_id:
        local = DATA_DIR / f"{name.lower()}_d1.parquet"
        try:
            if local.exists():
                df = pd.read_parquet(local)
            else:
                print(f"  Downloading {name} from Drive…", flush=True)
                df = _drive_download(drive_id, local)
            df.index = pd.to_datetime(df.index, utc=True)
            df.index.name = "datetime"
            cols = {c.lower(): c.lower() for c in df.columns}
            df.columns = [c.lower() for c in df.columns]
            return df[["open", "high", "low", "close"]].sort_index().dropna()
        except Exception as exc:
            print(f"  Drive failed ({exc}), falling back to Yahoo", flush=True)

    print(f"  Fetching {name} from Yahoo Finance…", flush=True)
    return _yahoo_fetch(cfg["yahoo"])


# ── EWMA volatility (walk-forward safe) ──────────────────────────────────────

def _ewma_variance_series(log_returns: np.ndarray,
                          lam: float = EWMA_LAMBDA) -> np.ndarray:
    n   = len(log_returns)
    var = np.empty(n)
    v   = float(np.var(log_returns[:min(20, n)]))
    if v == 0:
        v = float(log_returns[0] ** 2) or 1e-10
    for i, r in enumerate(log_returns):
        v      = lam * v + (1.0 - lam) * r * r
        var[i] = v
    return var


# ── Regime classifier (walk-forward, daily bars only) ────────────────────────

def classify_regime(closes: np.ndarray, idx: int,
                    ema_span: int = 20,
                    slope_window: int = 5,
                    slope_thresh: float = 0.002,
                    bear_slope_mult: float = 1.0) -> str:
    """
    Classify regime for bar[idx] using closes[0:idx] only (no lookahead).

    EMA(ema_span) slope over slope_window bars, normalised to price.
    > +slope_thresh              → BULL
    < -(slope_thresh × bear_slope_mult) → BEAR  (raise mult to filter noisy bear signals)
    else                         → RANGE

    bear_slope_mult: raise above 1.0 to require a steeper downtrend before
    classifying as BEAR. BEAR is the weakest regime in backtests (PF 2.5–4.2
    vs BULL 3.8–9.7 and RANGE 3.9–6.7), so tighter gating improves quality.
    """
    window = closes[:idx]
    if len(window) < ema_span + slope_window:
        return "RANGE"
    ema   = pd.Series(window).ewm(span=ema_span, adjust=False).mean().to_numpy()
    slope = (ema[-1] - ema[-(slope_window + 1)]) / ema[-1]
    if slope >  slope_thresh:
        return "BULL"
    if slope < -(slope_thresh * bear_slope_mult):
        return "BEAR"
    return "RANGE"


# ── Single-day trade simulator ────────────────────────────────────────────────

def simulate_day(open_: float, high: float, low: float, close: float,
                 hl_75_pct: float, oc_median_pct: float,
                 regime: str, sl_mult: float = 1.5,
                 range_mode: str = "fade_both") -> dict:
    """
    Simulate one day's limit-order trade given OHLC and forecast levels.

    BULL  → SELL LIMIT at open + HL_75 ; TP = open + OC_median ; SL = open + HL_75×sl_mult
    BEAR  → BUY  LIMIT at open − HL_75 ; TP = open − OC_median ; SL = open − HL_75×sl_mult
    RANGE → behaviour controlled by range_mode:
              fade_both   : fade both extremes, TP = open (1:2 R:R, current default)
              skip        : do not trade ranging days
              directional : caller converts RANGE→BULL/BEAR via momentum; treated as BULL/BEAR

    MFE (Maximum Favorable Excursion) is estimated in R multiples using the
    daily low/high as the best-case proxy (conservative for OHLC data).

    All P&L expressed as % of the day's open price.
    """
    hl_d  = open_ * hl_75_pct     / 100.0
    oc_d  = open_ * oc_median_pct / 100.0
    sl_d  = hl_d  * sl_mult

    base = {"regime": regime, "hl_75": hl_75_pct, "oc_median": oc_median_pct}

    def _mfe_r(side: str, entry: float, tp: float) -> float:
        """MFE in R multiples; capped at 3R to suppress outliers."""
        if side == "SELL":
            td = entry - tp
            return round(min(max(entry - low,  0.0) / td, 3.0), 3) if td > 0 else 0.0
        td = tp - entry
        return round(min(max(high  - entry, 0.0) / td, 3.0), 3) if td > 0 else 0.0

    def _sell(entry, tp, sl):
        """SELL limit: fill if high >= entry. SL above entry, TP below entry."""
        if high < entry:
            return None
        mfe = _mfe_r("SELL", entry, tp)
        if high >= sl:
            return {**base, "filled": True, "side": "SELL",
                    "outcome": "loss", "pnl_pct": -((sl - entry) / open_ * 100.0),
                    "mfe_r": mfe}
        if low <= tp:
            return {**base, "filled": True, "side": "SELL",
                    "outcome": "win",  "pnl_pct":   (entry - tp)  / open_ * 100.0,
                    "mfe_r": mfe}
        return    {**base, "filled": True, "side": "SELL",
                   "outcome": "open", "pnl_pct":   (entry - close) / open_ * 100.0,
                   "mfe_r": mfe}

    def _buy(entry, tp, sl):
        """BUY limit: fill if low <= entry. SL below entry, TP above entry."""
        if low > entry:
            return None
        mfe = _mfe_r("BUY", entry, tp)
        if low <= sl:
            return {**base, "filled": True, "side": "BUY",
                    "outcome": "loss", "pnl_pct": -((entry - sl) / open_ * 100.0),
                    "mfe_r": mfe}
        if high >= tp:
            return {**base, "filled": True, "side": "BUY",
                    "outcome": "win",  "pnl_pct":   (tp - entry)  / open_ * 100.0,
                    "mfe_r": mfe}
        return    {**base, "filled": True, "side": "BUY",
                   "outcome": "open", "pnl_pct":   (close - entry) / open_ * 100.0,
                   "mfe_r": mfe}

    no_fill = {**base, "filled": False, "side": "", "outcome": "no_fill",
               "pnl_pct": 0.0, "mfe_r": 0.0}

    if regime == "BULL":
        entry = open_ + hl_d
        tp    = open_ + oc_d
        sl    = open_ + sl_d
        return _sell(entry, tp, sl) or no_fill

    if regime == "BEAR":
        entry = open_ - hl_d
        tp    = open_ - oc_d
        sl    = open_ - sl_d
        return _buy(entry, tp, sl) or no_fill

    # ── RANGE ──────────────────────────────────────────────────────────────────
    if range_mode == "skip":
        return no_fill

    # fade_both (default) — 1:2 R:R, TP at open
    r = _sell(open_ + hl_d, open_, open_ + sl_d)
    if r is not None:
        return r
    r = _buy(open_ - hl_d, open_, open_ - sl_d)
    if r is not None:
        return r
    return no_fill


# ── Dynamic-anchor strategy simulator ────────────────────────────────────────

def simulate_day_dynamic_anchor(open_: float, high: float, low: float, close: float,
                                 hl_median_pct: float, hl_75_pct: float,
                                 anchor_low: float, anchor_high: float) -> dict:
    """
    Dynamic-anchor range fade.

    The HL_median% forecast is applied FROM a PRIOR session extreme that is known
    at order-placement time (the previous day's low/high). Anchoring off the
    *current* day's extreme is lookahead/self-fulfilling, so callers must pass the
    prior bar's low/high as ``anchor_low``/``anchor_high``.

    SELL limit: anchor_low  × (1 + hl_median%)  →  TP = open_,  SL = anchor_low  × (1 + hl_75%)
    BUY  limit: anchor_high × (1 - hl_median%)  →  TP = open_,  SL = anchor_high × (1 - hl_75%)

    Guard: entry must be on the far side of open (sell entry > open_, buy entry < open_).
    This ensures TP at open_ is always in the profitable direction.
    The fill/touch check uses the CURRENT day's high/low to decide whether the
    (prior-anchored) level was actually traded today.
    Both sides live simultaneously; SELL is checked first.
    """
    sell_entry = anchor_low  * (1.0 + hl_median_pct / 100.0)
    sell_tp    = open_
    sell_sl    = anchor_low  * (1.0 + hl_75_pct     / 100.0)

    buy_entry  = anchor_high * (1.0 - hl_median_pct / 100.0)
    buy_tp     = open_
    buy_sl     = anchor_high * (1.0 - hl_75_pct     / 100.0)

    base    = {"regime": "DA", "hl_75": hl_75_pct, "oc_median": 0.0}
    no_fill = {**base, "filled": False, "side": "", "outcome": "no_fill",
               "pnl_pct": 0.0, "mfe_r": 0.0}

    def _mfe_r(side: str, entry: float, tp: float) -> float:
        if side == "SELL":
            td = entry - tp
            return round(min(max(entry - low,  0.0) / td, 3.0), 3) if td > 0 else 0.0
        td = tp - entry
        return round(min(max(high  - entry, 0.0) / td, 3.0), 3) if td > 0 else 0.0

    # SELL: fade the high, anchored from day's low
    if sell_entry > open_ and high >= sell_entry:
        mfe = _mfe_r("SELL", sell_entry, sell_tp)
        if high >= sell_sl:
            return {**base, "filled": True, "side": "SELL", "outcome": "loss",
                    "pnl_pct": -((sell_sl - sell_entry) / open_ * 100.0), "mfe_r": mfe}
        if low <= sell_tp:
            return {**base, "filled": True, "side": "SELL", "outcome": "win",
                    "pnl_pct":  (sell_entry - sell_tp) / open_ * 100.0, "mfe_r": mfe}
        return {**base, "filled": True, "side": "SELL", "outcome": "open",
                "pnl_pct": (sell_entry - close) / open_ * 100.0, "mfe_r": mfe}

    # BUY: fade the low, anchored from day's high
    if buy_entry < open_ and low <= buy_entry:
        mfe = _mfe_r("BUY", buy_entry, buy_tp)
        if low <= buy_sl:
            return {**base, "filled": True, "side": "BUY", "outcome": "loss",
                    "pnl_pct": -((buy_entry - buy_sl) / open_ * 100.0), "mfe_r": mfe}
        if high >= buy_tp:
            return {**base, "filled": True, "side": "BUY", "outcome": "win",
                    "pnl_pct":  (buy_tp - buy_entry) / open_ * 100.0, "mfe_r": mfe}
        return {**base, "filled": True, "side": "BUY", "outcome": "open",
                "pnl_pct": (close - buy_entry) / open_ * 100.0, "mfe_r": mfe}

    return no_fill


# ── Dynamic-anchor carry-forward simulator ────────────────────────────────────

def run_backtest_da_carry(name: str, df: pd.DataFrame,
                          min_lookback: int = 50,
                          date_from: Optional[str] = None,
                          date_to:   Optional[str] = None) -> pd.DataFrame:
    """
    Dynamic-anchor backtest where positions are NOT force-closed at EOD.
    Each day's trade is carried forward until TP or SL is hit, possibly on a
    future daily bar.  A new independent trade can also open each day (so
    multiple positions can be alive simultaneously — one per calendar day).

    Carry resolution uses conservative SL-first ordering (same as simulate_day).
    P&L is always expressed as % of the ORIGINAL session open (day of entry).
    Records include 'carry_days' (0 = resolved same day, N = resolved N days later).
    """
    p      = ASSET_PARAMS["fx"]
    closes = df["close"].to_numpy(dtype=float)
    opens  = df["open"].to_numpy(dtype=float)
    highs  = df["high"].to_numpy(dtype=float)
    lows   = df["low"].to_numpy(dtype=float)
    dates  = df.index

    carry: list = []   # list of dicts: {side, entry, tp, sl, orig_open, open_date, ...base fields}
    records: list = []

    for i in range(min_lookback, len(df)):
        date_str = str(dates[i].date())
        if date_from and date_str < date_from:
            continue
        if date_to   and date_str > date_to:
            break

        open_, high, low, close = opens[i], highs[i], lows[i], closes[i]

        # -- Step 1: Resolve carry positions against today's OHLC --------------
        new_carry = []
        for pos in carry:
            side      = pos["side"]
            entry     = pos["entry"]
            tp        = pos["tp"]
            sl        = pos["sl"]
            orig_open = pos["orig_open"]
            cdays     = pos.get("carry_days", 0) + 1

            resolved = None
            if side == "SELL":
                if high >= sl:
                    pnl = -((sl - entry) / orig_open * 100.0)
                    resolved = {**pos, "date": dates[i], "outcome": "loss",
                                "pnl_pct": round(pnl, 5), "carry_days": cdays}
                elif low <= tp:
                    pnl = (entry - tp) / orig_open * 100.0
                    resolved = {**pos, "date": dates[i], "outcome": "win",
                                "pnl_pct": round(pnl, 5), "carry_days": cdays}
            else:  # BUY
                if low <= sl:
                    pnl = -((entry - sl) / orig_open * 100.0)
                    resolved = {**pos, "date": dates[i], "outcome": "loss",
                                "pnl_pct": round(pnl, 5), "carry_days": cdays}
                elif high >= tp:
                    pnl = (tp - entry) / orig_open * 100.0
                    resolved = {**pos, "date": dates[i], "outcome": "win",
                                "pnl_pct": round(pnl, 5), "carry_days": cdays}

            if resolved is not None:
                records.append(resolved)
            else:
                new_carry.append({**pos, "carry_days": cdays})
        carry = new_carry

        # -- Step 2: Compute vol levels for today's session -------------------
        log_ret = np.log(closes[1:i] / closes[:i - 1])
        if len(log_ret) < 20:
            continue

        sigma_d   = math.sqrt(_ewma_variance_series(log_ret)[-1])
        hl_median = BM_RANGE_P50                   * sigma_d * 100.0
        hl_75     = BM_RANGE_P75 * p["hl_75_corr"] * sigma_d * 100.0

        base = {
            "instrument":    name,
            "date":          dates[i],
            "regime":        "DA",
            "eff_regime":    "DA",
            "hl_median_pct": round(hl_median, 4),
            "hl_75_pct":     round(hl_75,     4),
            "oc_med_pct":    0.0,
            "open":          round(open_, 6),
            "high":          round(high,  6),
            "low":           round(low,   6),
            "close":         round(close, 6),
            "carry_days":    0,
        }

        # -- Step 3: Attempt a new position for today -------------------------
        # Anchor entry levels off the PRIOR day's extremes (known at order time);
        # using today's extremes would be lookahead. The touch/fill check below
        # still uses today's high/low.
        anchor_low  = lows[i - 1]
        anchor_high = highs[i - 1]
        sell_entry = anchor_low  * (1.0 + hl_median / 100.0)
        sell_tp    = open_
        sell_sl    = anchor_low  * (1.0 + hl_75     / 100.0)
        buy_entry  = anchor_high * (1.0 - hl_median / 100.0)
        buy_tp     = open_
        buy_sl     = anchor_high * (1.0 - hl_75     / 100.0)

        def _mfe_r(side: str, entry: float, tp: float) -> float:
            if side == "SELL":
                td = entry - tp
                return round(min(max(entry - low,  0.0) / td, 3.0), 3) if td > 0 else 0.0
            td = tp - entry
            return round(min(max(high - entry,  0.0) / td, 3.0), 3) if td > 0 else 0.0

        filled = False
        if sell_entry > open_ and high >= sell_entry:
            filled = True
            mfe = _mfe_r("SELL", sell_entry, sell_tp)
            if high >= sell_sl:
                pnl = -((sell_sl - sell_entry) / open_ * 100.0)
                records.append({**base, "filled": True, "side": "SELL",
                                 "outcome": "loss", "pnl_pct": round(pnl, 5), "mfe_r": mfe})
            elif low <= sell_tp:
                pnl = (sell_entry - sell_tp) / open_ * 100.0
                records.append({**base, "filled": True, "side": "SELL",
                                 "outcome": "win",  "pnl_pct": round(pnl, 5), "mfe_r": mfe})
            else:
                # Carry forward
                carry.append({**base, "filled": True, "side": "SELL",
                               "entry": sell_entry, "tp": sell_tp, "sl": sell_sl,
                               "orig_open": open_, "open_date": dates[i],
                               "outcome": "open", "pnl_pct": 0.0, "mfe_r": mfe})

        elif buy_entry < open_ and low <= buy_entry:
            filled = True
            mfe = _mfe_r("BUY", buy_entry, buy_tp)
            if low <= buy_sl:
                pnl = -((buy_entry - buy_sl) / open_ * 100.0)
                records.append({**base, "filled": True, "side": "BUY",
                                 "outcome": "loss", "pnl_pct": round(pnl, 5), "mfe_r": mfe})
            elif high >= buy_tp:
                pnl = (buy_tp - buy_entry) / open_ * 100.0
                records.append({**base, "filled": True, "side": "BUY",
                                 "outcome": "win",  "pnl_pct": round(pnl, 5), "mfe_r": mfe})
            else:
                carry.append({**base, "filled": True, "side": "BUY",
                               "entry": buy_entry, "tp": buy_tp, "sl": buy_sl,
                               "orig_open": open_, "open_date": dates[i],
                               "outcome": "open", "pnl_pct": 0.0, "mfe_r": mfe})

        if not filled:
            records.append({**base, "filled": False, "side": "",
                             "outcome": "no_fill", "pnl_pct": 0.0, "mfe_r": 0.0})

    # Positions still open at the end of data — close at final close price
    final_close = closes[-1]
    for pos in carry:
        side      = pos["side"]
        entry     = pos["entry"]
        orig_open = pos["orig_open"]
        if side == "SELL":
            pnl = (entry - final_close) / orig_open * 100.0
        else:
            pnl = (final_close - entry) / orig_open * 100.0
        records.append({**pos, "date": dates[-1], "outcome": "open",
                        "pnl_pct": round(pnl, 5)})

    return pd.DataFrame(records)


# ── Walk-forward backtest engine ──────────────────────────────────────────────

def run_backtest(name: str, df: pd.DataFrame, asset_class: str,
                 min_lookback: int = 50,
                 date_from: Optional[str] = None,
                 date_to:   Optional[str] = None,
                 sl_mult:   float = 1.5,
                 slope_thresh: float = 0.002,
                 bear_slope_mult: float = 1.0,
                 no_regime: bool = False,
                 range_mode: str = "fade_both",
                 strategy: str = "fade_open",
                 eod_mode: str = "close") -> pd.DataFrame:
    """
    Walk-forward backtest. Returns a DataFrame of per-day trade records.

    strategy        : 'fade_open'      — original regime-based strategy (default)
                      'dynamic_anchor' — lesson strategy; all other params ignored
    min_lookback    : bars required before first forecast (vol warmup)
    no_regime       : if True always use RANGE (baseline fade-both-extremes)
    bear_slope_mult : multiply slope_thresh by this for BEAR classification.
                      1.5 requires a steeper downtrend, reducing noisy BEAR trades.
                      Backtest shows BEAR is the weakest regime (PF 2.5–4.2); raising
                      this to 1.25–1.5 improves overall PF at the cost of fewer fills.
    range_mode      : 'fade_both' (default), 'skip' (no RANGE trades),
                      'directional' (short-term momentum picks side in RANGE).
    """
    if strategy == "dynamic_anchor" and eod_mode == "run":
        return run_backtest_da_carry(name, df, min_lookback, date_from, date_to)

    p      = ASSET_PARAMS[asset_class]
    closes = df["close"].to_numpy(dtype=float)
    opens  = df["open"].to_numpy(dtype=float)
    highs  = df["high"].to_numpy(dtype=float)
    lows   = df["low"].to_numpy(dtype=float)
    dates  = df.index

    records = []
    for i in range(min_lookback, len(df)):
        date_str = str(dates[i].date())
        if date_from and date_str < date_from:
            continue
        if date_to   and date_str > date_to:
            continue

        log_ret = np.log(closes[1:i] / closes[:i - 1])
        if len(log_ret) < 20:
            continue

        sigma_d    = math.sqrt(_ewma_variance_series(log_ret)[-1])
        hl_median  = BM_RANGE_P50                * sigma_d * 100.0
        hl_75      = BM_RANGE_P75 * p["hl_75_corr"] * sigma_d * 100.0
        oc_median  = HALFNORM_P50 * p["oc_corr"]    * sigma_d * 100.0

        # ── Dynamic-anchor strategy ───────────────────────────────────────────
        if strategy == "dynamic_anchor":
            result = simulate_day_dynamic_anchor(
                open_=opens[i], high=highs[i], low=lows[i], close=closes[i],
                hl_median_pct=hl_median, hl_75_pct=hl_75,
                anchor_low=lows[i - 1], anchor_high=highs[i - 1],
            )
            records.append({
                "instrument":    name,
                "date":          dates[i],
                "regime":        "DA",
                "eff_regime":    "DA",
                "hl_median_pct": round(hl_median, 4),
                "hl_75_pct":     round(hl_75, 4),
                "oc_med_pct":    round(oc_median, 4),
                "side":          result.get("side", ""),
                "filled":        result["filled"],
                "outcome":       result["outcome"],
                "pnl_pct":       round(result["pnl_pct"], 5),
                "mfe_r":         result.get("mfe_r", 0.0),
                "open":          round(opens[i], 6),
                "high":          round(highs[i], 6),
                "low":           round(lows[i], 6),
                "close":         round(closes[i], 6),
            })
            continue

        # ── Original fade-open strategy ───────────────────────────────────────
        if no_regime:
            regime = "RANGE"
        else:
            regime = classify_regime(closes, i,
                                     slope_thresh=slope_thresh,
                                     bear_slope_mult=bear_slope_mult)

        # ── directional RANGE: use 3-day return as PF/HMM lean proxy ──────────
        effective_regime = regime
        if range_mode == "directional" and regime == "RANGE" and i >= 4:
            recent_ret = closes[i - 1] / closes[i - 4] - 1.0
            effective_regime = "BULL" if recent_ret > 0 else "BEAR"

        result = simulate_day(
            open_=opens[i], high=highs[i], low=lows[i], close=closes[i],
            hl_75_pct=hl_75, oc_median_pct=oc_median,
            regime=effective_regime, sl_mult=sl_mult,
            range_mode=range_mode,
        )

        records.append({
            "instrument":    name,
            "date":          dates[i],
            "regime":        regime,
            "eff_regime":    effective_regime,
            "hl_median_pct": round(hl_median, 4),
            "hl_75_pct":     round(hl_75, 4),
            "oc_med_pct":    round(oc_median, 4),
            "side":          result.get("side", ""),
            "filled":        result["filled"],
            "outcome":       result["outcome"],
            "pnl_pct":       round(result["pnl_pct"], 5),
            "mfe_r":         result.get("mfe_r", 0.0),
            "open":          round(opens[i], 6),
            "high":          round(highs[i], 6),
            "low":           round(lows[i], 6),
            "close":         round(closes[i], 6),
        })

    return pd.DataFrame(records)


# ── Statistics helpers ────────────────────────────────────────────────────────

def _equity_curve(trades: pd.DataFrame) -> pd.Series:
    return trades["pnl_pct"].cumsum()


def _max_drawdown(equity: pd.Series) -> float:
    peak = equity.cummax()
    dd   = equity - peak
    return float(dd.min())


def _stats(trades: pd.DataFrame) -> dict:
    filled   = trades[trades["filled"]]
    n_days   = len(trades)
    n_filled = len(filled)
    if n_filled == 0:
        return dict(n_days=n_days, n_filled=0, fill_rate=0.0, win_rate=0.0,
                    avg_pnl=0.0, total_pnl=0.0, sharpe=0.0,
                    profit_factor=0.0, max_dd=0.0,
                    avg_mfe_r=0.0, avg_mfe_loss_r=0.0)

    wins   = filled[filled["outcome"] == "win"]
    losses = filled[filled["outcome"] == "loss"]
    opens_ = filled[filled["outcome"] == "open"]

    win_rate  = len(wins) / n_filled * 100.0
    fill_rate = n_filled  / n_days   * 100.0
    avg_pnl   = float(filled["pnl_pct"].mean())
    total_pnl = float(filled["pnl_pct"].sum())

    std    = float(filled["pnl_pct"].std())
    sharpe = (avg_pnl / std * math.sqrt(252.0)) if std > 0 else 0.0

    gross_win  = float(wins["pnl_pct"].sum())
    gross_loss = abs(float(losses["pnl_pct"].sum())) + \
                 abs(float(opens_[opens_["pnl_pct"] < 0]["pnl_pct"].sum()))
    pf = gross_win / gross_loss if gross_loss > 0 else float("inf")

    eq = _equity_curve(filled)
    mdd = _max_drawdown(eq)

    # MFE analysis — how far did trades move in our favour before resolution?
    mfe_col = "mfe_r" if "mfe_r" in filled.columns else None
    avg_mfe_r      = round(float(filled[mfe_col].mean()), 2)      if mfe_col else 0.0
    avg_mfe_loss_r = round(float(losses[mfe_col].mean()), 2)      if (mfe_col and len(losses)) else 0.0

    return dict(
        n_days=n_days, n_filled=n_filled,
        fill_rate=round(fill_rate, 1), win_rate=round(win_rate, 1),
        avg_pnl=round(avg_pnl, 4), total_pnl=round(total_pnl, 3),
        sharpe=round(sharpe, 2), profit_factor=round(pf, 2),
        max_dd=round(mdd, 3),
        avg_mfe_r=avg_mfe_r, avg_mfe_loss_r=avg_mfe_loss_r,
    )


# ── Console output ────────────────────────────────────────────────────────────

def _row(st: dict, label: str, width: int = 10) -> str:
    pf = f"{st['profit_factor']:.2f}" if st['profit_factor'] != float('inf') else "  ∞"
    return (f"  {label:<{width}} {st['n_days']:>6}  {st['n_filled']:>6}  "
            f"{st['fill_rate']:>5.1f}%  {st['win_rate']:>5.1f}%  "
            f"{st['avg_pnl']:>+8.4f}  {st['total_pnl']:>+10.3f}  "
            f"{st['sharpe']:>6.2f}  {pf:>5}  {st['max_dd']:>+8.3f}")


HDR = ("  {:<10} {:>6}  {:>6}  {:>6}  {:>6}  {:>9}  {:>11}  {:>6}  {:>5}  {:>9}".format(
    "Pair", "Days", "Fills", "Fill%", "Win%", "Avg P&L%", "Total P&L%",
    "Sharpe", "PF", "Max DD%"))


def print_summary(all_trades: pd.DataFrame, strategy_label: str = "") -> None:
    label = f"  Vol-Range Fade Strategy — Backtest Results  {strategy_label}"
    bar   = "═" * 80
    print(f"\n{bar}")
    print(label)
    print(bar)

    # ── Per instrument ─────────────────────────────────────────────────────
    print("\n  PER INSTRUMENT")
    print(HDR)
    print("  " + "-" * 78)
    for inst in sorted(all_trades["instrument"].unique()):
        t = all_trades[all_trades["instrument"] == inst]
        print(_row(_stats(t), inst))

    # ── Per regime ─────────────────────────────────────────────────────────
    print("\n  PER REGIME  (all instruments)")
    print(HDR)
    print("  " + "-" * 78)
    for regime in ["BULL", "BEAR", "RANGE"]:
        t = all_trades[all_trades["regime"] == regime]
        if len(t) == 0:
            continue
        print(_row(_stats(t), regime))

    # ── Regime distribution ────────────────────────────────────────────────
    regime_dist = all_trades["regime"].value_counts(normalize=True) * 100
    print(f"\n  Regime distribution: " +
          "  ".join(f"{r}: {v:.1f}%" for r, v in regime_dist.items()))

    # ── Overall ────────────────────────────────────────────────────────────
    print("\n  OVERALL")
    print(HDR)
    print("  " + "-" * 78)
    print(_row(_stats(all_trades), "ALL"))

    # ── R:R summary ────────────────────────────────────────────────────────
    filled = all_trades[all_trades["filled"]]
    if len(filled):
        wins   = filled[filled["outcome"] == "win"]["pnl_pct"].mean()
        losses = filled[filled["outcome"] == "loss"]["pnl_pct"].mean()
        if not np.isnan(losses) and losses < 0:
            rr = abs(wins / losses)
            print(f"\n  Avg win: {wins:+.4f}%  |  Avg loss: {losses:+.4f}%  |  R:R = {rr:.2f}")
        date_range = f"{all_trades['date'].min().date()} → {all_trades['date'].max().date()}"
        print(f"  Date range: {date_range}  |  Instruments: {all_trades['instrument'].nunique()}")

    # ── MFE analysis ───────────────────────────────────────────────────────
    if "mfe_r" in all_trades.columns and len(filled):
        print("\n  MFE ANALYSIS  (Maximum Favorable Excursion, losing trades)")
        print(f"  {'Regime':<8}  {'Losses':>6}  {'Avg MFE on losses':>18}  Note")
        print("  " + "-" * 68)
        for regime in ["BULL", "BEAR", "RANGE"]:
            t = filled[(filled["regime"] == regime) & (filled["outcome"] == "loss")]
            if len(t) < 3:
                continue
            avg = t["mfe_r"].mean()
            note = ""
            if avg >= 0.60:
                note = "<- >60% to TP before reversing; Chandelier exit could save these"
            elif avg >= 0.35:
                note = "<- moderate excursion; tighter TP or trailing stop worth testing"
            print(f"  {regime:<8}  {len(t):>6}  {avg:>18.2f}R  {note}")

    # ── Weak-regime advisory ───────────────────────────────────────────────
    print("\n  REGIME QUALITY ADVISORY")
    for regime in ["BULL", "BEAR", "RANGE"]:
        t = all_trades[all_trades["regime"] == regime]
        if len(t) == 0:
            continue
        st = _stats(t)
        pf = st["profit_factor"]
        if pf < 2.5:
            tag = "  WEAK     -- try --bear-mult 1.5 to reduce noisy BEAR signals"
        elif pf < 3.5:
            tag = "  MARGINAL -- tighter entry filter recommended"
        else:
            tag = "  SOLID"
        print(f"  {regime:<6}  PF={pf:.2f}  WR={st['win_rate']:.1f}%  fills={st['n_filled']}{tag}")
    print()


def save_results(all_trades: pd.DataFrame, path: Optional[Path] = None) -> Path:
    if path is None:
        ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
        path = DATA_DIR / f"backtest_{ts}.csv"
    path.parent.mkdir(parents=True, exist_ok=True)
    all_trades.to_csv(path, index=False)
    return path


def print_regime_breakdown(all_trades: pd.DataFrame) -> None:
    """Print win rate per regime per instrument — the key research output."""
    print("\n  WIN RATE BY REGIME × INSTRUMENT  (filled trades only)")
    filled = all_trades[all_trades["filled"]]

    instruments = sorted(all_trades["instrument"].unique())
    regimes     = ["BULL", "BEAR", "RANGE"]
    col_w       = 12

    header = f"  {'Instrument':<12}" + "".join(f"  {r:>{col_w}}" for r in regimes)
    print(header)
    print("  " + "-" * (12 + (col_w + 2) * 3))

    for inst in instruments:
        row = f"  {inst:<12}"
        for regime in regimes:
            t = filled[(filled["instrument"] == inst) & (filled["regime"] == regime)]
            if len(t) < 5:
                row += f"  {'—':>{col_w}}"
            else:
                wr = len(t[t["outcome"] == "win"]) / len(t) * 100
                row += f"  {wr:>{col_w - 2}.1f}%  ({len(t):3d})"
        print(row)
    print()


def print_summary_dynamic_anchor(all_trades: pd.DataFrame) -> None:
    bar = "═" * 80
    print(f"\n{bar}")
    print(f"  Dynamic-Anchor Range Fade — Backtest Results")
    print(f"  Entry : extreme × (1 ± HL_median%)  |  guard: entry must cross open")
    print(f"  TP    : open                         |  SL: extreme × (1 ± HL_75%)")
    print(bar)

    print("\n  PER INSTRUMENT")
    print(HDR)
    print("  " + "-" * 78)
    for inst in sorted(all_trades["instrument"].unique()):
        t = all_trades[all_trades["instrument"] == inst]
        print(_row(_stats(t), inst))

    print("\n  PER SIDE  (all instruments, filled trades)")
    print(HDR)
    print("  " + "-" * 78)
    for side in ["SELL", "BUY"]:
        t = all_trades[all_trades["side"] == side]
        if len(t):
            print(_row(_stats(t), side))

    print("\n  OVERALL")
    print(HDR)
    print("  " + "-" * 78)
    print(_row(_stats(all_trades), "ALL"))

    filled = all_trades[all_trades["filled"]]
    if len(filled):
        wins   = filled[filled["outcome"] == "win"]["pnl_pct"].mean()
        losses = filled[filled["outcome"] == "loss"]["pnl_pct"].mean()
        if not np.isnan(losses) and losses < 0:
            rr = abs(wins / losses)
            print(f"\n  Avg win: {wins:+.4f}%  |  Avg loss: {losses:+.4f}%  |  R:R = {rr:.2f}")
        date_range = f"{all_trades['date'].min().date()} → {all_trades['date'].max().date()}"
        print(f"  Date range: {date_range}  |  Instruments: {all_trades['instrument'].nunique()}")

    if "mfe_r" in all_trades.columns and len(filled):
        losses_df = filled[filled["outcome"] == "loss"]
        if len(losses_df) >= 3:
            avg = losses_df["mfe_r"].mean()
            note = ""
            if avg >= 0.60:
                note = "  <- >60% to TP before reversing; Chandelier exit worth testing"
            elif avg >= 0.35:
                note = "  <- moderate excursion; trailing stop worth testing"
            print(f"\n  MFE on losses: {avg:.2f}R avg{note}")

    if "carry_days" in all_trades.columns:
        carried = filled[filled["carry_days"] > 0]
        if len(carried):
            avg_days = carried["carry_days"].mean()
            max_days = carried["carry_days"].max()
            c_wins   = len(carried[carried["outcome"] == "win"])
            c_loss   = len(carried[carried["outcome"] == "loss"])
            c_wr     = c_wins / len(carried) * 100 if len(carried) else 0
            print(f"\n  CARRY ANALYSIS  ({len(carried)} trades resolved after EOD)")
            print(f"  Avg carry days: {avg_days:.1f}  |  Max: {max_days}  |  "
                  f"Win rate on carried: {c_wr:.1f}%  ({c_wins}W / {c_loss}L)")
    print()


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Vol & Range Walk-Forward Backtester",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--pair",         help="Single instrument name, e.g. GBPUSD")
    parser.add_argument("--from",         dest="date_from", metavar="YYYY-MM-DD",
                        help="Backtest start date")
    parser.add_argument("--to",           dest="date_to",   metavar="YYYY-MM-DD",
                        help="Backtest end date")
    parser.add_argument("--yahoo",        action="store_true",
                        help="Use Yahoo Finance instead of Drive parquet files")
    parser.add_argument("--extra-pairs",  action="store_true",
                        help="Include all 16 bonus pairs from Drive")
    parser.add_argument("--sl-mult",      type=float, default=1.5,
                        help="SL distance = HL_75 × sl_mult (default 1.5)")
    parser.add_argument("--slope-thresh", type=float, default=0.002,
                        help="EMA20 slope threshold for BULL/BEAR (default 0.002)")
    parser.add_argument("--no-regime",    action="store_true",
                        help="Ignore regime; always fade both extremes (baseline)")
    parser.add_argument("--bear-mult",    type=float, default=1.0,
                        metavar="X",
                        help="Multiply slope_thresh by X for BEAR classification. "
                             "1.25–1.5 reduces noisy BEAR trades (weakest regime). "
                             "Default 1.0 (symmetric).")
    parser.add_argument("--range-mode",  choices=["fade_both", "skip", "directional"],
                        default="fade_both",
                        help="How to handle RANGE-regime days: "
                             "'fade_both' (default, 1:2 R:R, TP=open), "
                             "'skip' (no trade on flat days), "
                             "'directional' (3-day momentum picks side, proxy for HMM lean).")
    parser.add_argument("--strategy",     choices=["fade-open", "dynamic-anchor"],
                        default="fade-open",
                        help="fade-open: original regime-based strategy (default). "
                             "dynamic-anchor: lesson strategy — anchors from session "
                             "extreme, TP at open, SL at HL_75 level. "
                             "Ignores --sl-mult, --no-regime, --bear-mult, "
                             "--range-mode, --slope-thresh.")
    parser.add_argument("--eod-mode",    choices=["close", "run"], default="close",
                        dest="eod_mode",
                        help="close (default): resolve open positions at EOD using close price. "
                             "run: carry positions forward until TP/SL is hit, even across days. "
                             "Only applies to --strategy dynamic-anchor.")
    parser.add_argument("--save",         action="store_true",
                        help="Save full trade log to CSV in data/")
    parser.add_argument("--lookback",     type=int, default=50,
                        help="Min bars before first forecast (default 50)")
    args = parser.parse_args()

    instruments = CORE_INSTRUMENTS.copy()
    if args.extra_pairs:
        instruments += EXTRA_INSTRUMENTS

    if args.pair:
        instruments = [i for i in instruments
                       if i["name"].upper() == args.pair.upper()]
        if not instruments:
            print(f"Unknown pair '{args.pair}'. Available: " +
                  ", ".join(i["name"] for i in CORE_INSTRUMENTS + EXTRA_INSTRUMENTS))
            return

    use_dynamic = args.strategy == "dynamic-anchor"

    if use_dynamic:
        eod_label = "carry (no EOD close)" if args.eod_mode == "run" else "close at EOD"
        print(f"\nVol & Range Backtester — DYNAMIC-ANCHOR strategy  "
              f"{'Yahoo' if args.yahoo else 'Drive/Parquet'}  EOD={eod_label}")
        print(f"  Entry: extreme × (1 ± HL_median%)  |  TP: open  |  SL: extreme × (1 ± HL_75%)")
        if args.eod_mode == "run":
            print(f"  Carry mode: positions held until TP/SL hit; multiple positions per pair possible")
        print(f"  [--sl-mult, --no-regime, --bear-mult, --range-mode, --slope-thresh are ignored]")
    else:
        strategy_label = ""
        if args.no_regime:
            strategy_label = "[baseline: no regime filter]"
        if args.sl_mult != 1.5:
            strategy_label += f"  SL×{args.sl_mult}"
        if args.bear_mult != 1.0:
            strategy_label += f"  bear_mult×{args.bear_mult}"
        if args.range_mode != "fade_both":
            strategy_label += f"  range={args.range_mode}"
        print(f"\nVol & Range Backtester — sl_mult={args.sl_mult}  "
              f"slope_thresh={args.slope_thresh}  bear_mult={args.bear_mult}  "
              f"range_mode={args.range_mode}  "
              f"{'Yahoo' if args.yahoo else 'Drive/Parquet'}")

    if args.date_from or args.date_to:
        print(f"Date range: {args.date_from or 'earliest'} → {args.date_to or 'latest'}")
    print()

    all_trades = []
    for cfg in instruments:
        print(f"Loading {cfg['name']}…", flush=True)
        try:
            df = load_ohlc(cfg, use_yahoo=args.yahoo)
            if len(df) < args.lookback + 20:
                print(f"  Insufficient data ({len(df)} rows), skipping")
                continue
            print(f"  {len(df)} daily bars  "
                  f"({df.index.min().date()} → {df.index.max().date()})")
            trades = run_backtest(
                name=cfg["name"], df=df,
                asset_class=cfg["asset_class"],
                min_lookback=args.lookback,
                date_from=args.date_from,
                date_to=args.date_to,
                strategy="dynamic_anchor" if use_dynamic else "fade_open",
                sl_mult=args.sl_mult,
                slope_thresh=args.slope_thresh,
                bear_slope_mult=args.bear_mult,
                no_regime=args.no_regime,
                range_mode=args.range_mode,
                eod_mode=args.eod_mode,
            )
            all_trades.append(trades)
        except Exception as exc:
            print(f"  Error loading {cfg['name']}: {exc}")

    if not all_trades:
        print("No data loaded.")
        return

    combined = pd.concat(all_trades, ignore_index=True)
    if use_dynamic:
        print_summary_dynamic_anchor(combined)
    else:
        print_summary(combined, strategy_label)
        print_regime_breakdown(combined)

    if args.save:
        path = save_results(combined)
        print(f"Trade log saved → {path}\n")


if __name__ == "__main__":
    main()
