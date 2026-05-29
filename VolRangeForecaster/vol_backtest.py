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
                    slope_thresh: float = 0.002) -> str:
    """
    Classify regime for bar[idx] using closes[0:idx] only (no lookahead).

    EMA(ema_span) slope over slope_window bars, normalised to price.
    > +slope_thresh → BULL, < -slope_thresh → BEAR, else → RANGE.
    """
    window = closes[:idx]
    if len(window) < ema_span + slope_window:
        return "RANGE"
    ema   = pd.Series(window).ewm(span=ema_span, adjust=False).mean().to_numpy()
    slope = (ema[-1] - ema[-(slope_window + 1)]) / ema[-1]
    if slope >  slope_thresh:
        return "BULL"
    if slope < -slope_thresh:
        return "BEAR"
    return "RANGE"


# ── Single-day trade simulator ────────────────────────────────────────────────

def simulate_day(open_: float, high: float, low: float, close: float,
                 hl_75_pct: float, oc_median_pct: float,
                 regime: str, sl_mult: float = 1.5) -> dict:
    """
    Simulate one day's limit-order trade given OHLC and forecast levels.

    BULL → SELL LIMIT at open + HL_75 ; TP = open + OC_median ; SL = open + HL_75×sl_mult
    BEAR → BUY  LIMIT at open − HL_75 ; TP = open − OC_median ; SL = open − HL_75×sl_mult
    RANGE→ fade both extremes, TP = open (first fill only)

    All P&L expressed as % of the day's open price.
    """
    hl_d  = open_ * hl_75_pct     / 100.0
    oc_d  = open_ * oc_median_pct / 100.0
    sl_d  = hl_d  * sl_mult

    base = {"regime": regime, "hl_75": hl_75_pct, "oc_median": oc_median_pct}

    def _sell(entry, tp, sl):
        """SELL limit: fill if high >= entry. SL above entry, TP below entry."""
        if high < entry:
            return None
        if high >= sl:
            return {**base, "filled": True, "side": "SELL",
                    "outcome": "loss", "pnl_pct": -((sl - entry) / open_ * 100.0)}
        if low <= tp:
            return {**base, "filled": True, "side": "SELL",
                    "outcome": "win",  "pnl_pct":   (entry - tp)  / open_ * 100.0}
        return    {**base, "filled": True, "side": "SELL",
                   "outcome": "open", "pnl_pct":   (entry - close) / open_ * 100.0}

    def _buy(entry, tp, sl):
        """BUY limit: fill if low <= entry. SL below entry, TP above entry."""
        if low > entry:
            return None
        if low <= sl:
            return {**base, "filled": True, "side": "BUY",
                    "outcome": "loss", "pnl_pct": -((entry - sl) / open_ * 100.0)}
        if high >= tp:
            return {**base, "filled": True, "side": "BUY",
                    "outcome": "win",  "pnl_pct":   (tp - entry)  / open_ * 100.0}
        return    {**base, "filled": True, "side": "BUY",
                   "outcome": "open", "pnl_pct":   (close - entry) / open_ * 100.0}

    no_fill = {**base, "filled": False, "side": "", "outcome": "no_fill", "pnl_pct": 0.0}

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

    # RANGE — fade both extremes, TP at open
    r = _sell(open_ + hl_d, open_, open_ + sl_d)
    if r is not None:
        return r
    r = _buy(open_ - hl_d, open_, open_ - sl_d)
    if r is not None:
        return r
    return no_fill


# ── Walk-forward backtest engine ──────────────────────────────────────────────

def run_backtest(name: str, df: pd.DataFrame, asset_class: str,
                 min_lookback: int = 50,
                 date_from: Optional[str] = None,
                 date_to:   Optional[str] = None,
                 sl_mult:   float = 1.5,
                 slope_thresh: float = 0.002,
                 no_regime: bool = False) -> pd.DataFrame:
    """
    Walk-forward backtest. Returns a DataFrame of per-day trade records.

    min_lookback : bars required before first forecast (vol warmup)
    no_regime    : if True always use RANGE (baseline fade-both-extremes)
    """
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

        sigma_d   = math.sqrt(_ewma_variance_series(log_ret)[-1])
        hl_75     = BM_RANGE_P75 * p["hl_75_corr"] * sigma_d * 100.0
        oc_median = HALFNORM_P50 * p["oc_corr"]    * sigma_d * 100.0

        regime = "RANGE" if no_regime else classify_regime(
            closes, i, slope_thresh=slope_thresh)

        result = simulate_day(
            open_=opens[i], high=highs[i], low=lows[i], close=closes[i],
            hl_75_pct=hl_75, oc_median_pct=oc_median,
            regime=regime, sl_mult=sl_mult,
        )

        records.append({
            "instrument": name,
            "date":       dates[i],
            "regime":     result["regime"],
            "hl_75_pct":  round(hl_75, 4),
            "oc_med_pct": round(oc_median, 4),
            "side":       result.get("side", ""),
            "filled":     result["filled"],
            "outcome":    result["outcome"],
            "pnl_pct":    round(result["pnl_pct"], 5),
            "open":       round(opens[i], 6),
            "high":       round(highs[i], 6),
            "low":        round(lows[i], 6),
            "close":      round(closes[i], 6),
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
                    profit_factor=0.0, max_dd=0.0)

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

    return dict(
        n_days=n_days, n_filled=n_filled,
        fill_rate=round(fill_rate, 1), win_rate=round(win_rate, 1),
        avg_pnl=round(avg_pnl, 4), total_pnl=round(total_pnl, 3),
        sharpe=round(sharpe, 2), profit_factor=round(pf, 2),
        max_dd=round(mdd, 3),
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

    strategy_label = ""
    if args.no_regime:
        strategy_label = "[baseline: no regime filter]"
    if args.sl_mult != 1.5:
        strategy_label += f"  SL×{args.sl_mult}"

    print(f"\nVol & Range Backtester — sl_mult={args.sl_mult}  "
          f"slope_thresh={args.slope_thresh}  "
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
                sl_mult=args.sl_mult,
                slope_thresh=args.slope_thresh,
                no_regime=args.no_regime,
            )
            all_trades.append(trades)
        except Exception as exc:
            print(f"  Error loading {cfg['name']}: {exc}")

    if not all_trades:
        print("No data loaded.")
        return

    combined = pd.concat(all_trades, ignore_index=True)
    print_summary(combined, strategy_label)
    print_regime_breakdown(combined)

    if args.save:
        path = save_results(combined)
        print(f"Trade log saved → {path}\n")


if __name__ == "__main__":
    main()
