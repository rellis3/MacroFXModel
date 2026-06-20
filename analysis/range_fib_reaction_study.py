#!/usr/bin/env python3
"""
Daily / monthly / Monday range Fib reaction study.

Same projection logic as js/asiaRangeEngine.js (price = range.low + range.range * level,
using the same FIB_LEVELS grid), applied to three completed reference ranges:
  - daily:   day D's body range -> tested against day D+1
  - monthly: month M's body range -> tested against month M+1
  - monday:  Monday's body range -> tested against the REST OF THE SAME WEEK (Tue-Sun),
             mirroring how js/asiaRangeEngine.js actually uses the Monday range live.

For each projected level we find its first touch in the evaluation window and measure which
excursion is bigger: the move that continues through the level, or the move that reverses
back through it. Each touch is also enriched with:
  - vol_regime / trend_regime of the day the touch occurred (trailing-window percentile /
    SMA-relative classification)
  - confluence_bucket / confluence_distance_pips (daily touches only) — how close the daily
    level sits to the nearest Monday-projected level for the same week
  - instrument_class (fx vs gold) — gold uses wider confluence pip thresholds since its pip
    ($1) is far coarser than FX's

Usage:
  python analysis/range_fib_reaction_study.py
  python analysis/range_fib_reaction_study.py --pairs eurusd gbpusd usdjpy --timeframe daily
"""
import argparse
import subprocess
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore", message="Converting to PeriodArray/Index representation will drop timezone information")

import numpy as np
import pandas as pd
from scipy.stats import norm

ROOT       = Path(__file__).resolve().parent.parent
M1_DIR     = ROOT / "VolRangeForecaster" / "data" / "m1"
DOWNLOADER = ROOT / "scripts" / "r2_download.py"
OUT_DIR    = ROOT / "analysis" / "output" / "range_fib_reaction"

FIB_LEVELS = [
    -9.5, -9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5,
    -4.5, -4, -3.5, -3, -2.5, -2, -1.5, -1, -0.5, -0.25,
    0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3,
    3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8,
    8.5, 9, 9.5, 10, 10.5,
]
FIB_LEVELS_ARR = np.array(FIB_LEVELS)
KEY_LEVELS = {0, 0.25, 0.5, 0.75, 1.0}

PIP_SIZE = {
    "eurusd": 0.0001, "gbpusd": 0.0001, "audusd": 0.0001, "nzdusd": 0.0001,
    "usdcad": 0.0001, "usdchf": 0.0001, "eurgbp": 0.0001, "euraud": 0.0001,
    "eurcad": 0.0001, "eurchf": 0.0001, "eurnzd": 0.0001, "audnzd": 0.0001,
    "audcad": 0.0001, "audchf": 0.0001, "gbpaud": 0.0001, "gbpcad": 0.0001,
    "gbpchf": 0.0001, "gbpnzd": 0.0001,
    "usdjpy": 0.01, "eurjpy": 0.01, "gbpjpy": 0.01, "audjpy": 0.01,
    "cadjpy": 0.01, "chfjpy": 0.01, "nzdjpy": 0.01,
    "gold": 1.0,
}
ALL_PAIRS = list(PIP_SIZE.keys())

MIN_BARS_NEXT_DAY     = 50    # 5-min bars (~4h) — guards against half-days/data gaps
MIN_BARS_NEXT_MONTH   = 500   # 5-min bars (~42h)
MIN_BARS_REST_OF_WEEK = 50

# Confluence thresholds (pips) — wider for gold since its pip ($1) is much coarser than FX (0.0001/0.01)
CONFLUENCE_TIGHT_PIPS   = {"fx": 3,  "gold": 30}
CONFLUENCE_REGULAR_PIPS = {"fx": 10, "gold": 100}

VOL_LOOKBACK_DAYS   = 60
TREND_LOOKBACK_DAYS = 20


def ensure_local(pairs):
    missing = [p for p in pairs if not (M1_DIR / f"{p}_m1.parquet").exists()
               or (M1_DIR / f"{p}_m1.parquet").stat().st_size < 10_000]
    if missing:
        print(f"Downloading {len(missing)} missing pair(s) from R2: {missing}")
        subprocess.run([sys.executable, str(DOWNLOADER), *missing], check=True, cwd=ROOT)


def load_pair_5m(pair: str) -> pd.DataFrame:
    raw = pd.read_parquet(M1_DIR / f"{pair}_m1.parquet")
    if isinstance(raw.index, pd.DatetimeIndex):
        df = raw[["open", "high", "low", "close"]].copy()
        df.index = pd.to_datetime(df.index, utc=True)
    else:
        # some pairs (e.g. gold) store time as a plain column with a naive timestamp instead of a tz-aware index
        time_col = "time" if "time" in raw.columns else "datetime"
        df = raw[["open", "high", "low", "close"]].copy()
        df.index = pd.to_datetime(raw[time_col], utc=True)
    df = df.sort_index()
    bars5 = df.resample("5min").agg({"open": "first", "high": "max", "low": "min", "close": "last"}).dropna()
    return bars5


def body_ranges(bars5: pd.DataFrame, period_key: np.ndarray) -> pd.DataFrame:
    body_hi = bars5[["open", "close"]].max(axis=1)
    body_lo = bars5[["open", "close"]].min(axis=1)
    g = pd.DataFrame({"hi": body_hi.to_numpy(), "lo": body_lo.to_numpy()}).groupby(period_key)
    out = g.agg(low=("lo", "min"), high=("hi", "max"))
    out["range"] = out["high"] - out["low"]
    return out


def daily_close_series(bars5: pd.DataFrame) -> pd.DataFrame:
    """One row per calendar day: last close + body range. Backbone for regime classification."""
    day_key = bars5.index.normalize()
    close = bars5["close"].groupby(day_key).last()
    body_hi = bars5[["open", "close"]].max(axis=1).groupby(day_key).max()
    body_lo = bars5[["open", "close"]].min(axis=1).groupby(day_key).min()
    return pd.DataFrame({"close": close, "range": body_hi - body_lo})


def compute_regimes(daily: pd.DataFrame) -> pd.DataFrame:
    """Per-day vol_regime (trailing range percentile, tertiles) and trend_regime (close vs SMA)."""
    vol_pct = daily["range"].rolling(VOL_LOOKBACK_DAYS, min_periods=20).rank(pct=True)
    sma = daily["close"].rolling(TREND_LOOKBACK_DAYS, min_periods=10).mean()
    out = pd.DataFrame(index=daily.index)
    out["vol_regime"] = pd.cut(vol_pct, [0, 1 / 3, 2 / 3, 1.0], labels=["Low", "Mid", "High"])
    out["trend_regime"] = np.where(daily["close"] >= sma, "Up", "Down")
    out.loc[sma.isna(), "trend_regime"] = None
    return out


def scan_touches(period_ranges: pd.DataFrame, eval_keys: np.ndarray, bar_eval_key: np.ndarray,
                  eval_bars: pd.DataFrame, pip_size: float, min_bars: int) -> list:
    """
    period_ranges: indexed by the 'range period' key, columns low/range — the completed range
                   that projects the levels.
    eval_keys:     aligned to period_ranges.index — which bar_eval_key group to test each
                   period's levels against (next period for daily/monthly, same period for
                   monday-vs-rest-of-week).
    bar_eval_key:  aligned to eval_bars, grouping eval_bars into the keys eval_keys refers to.
    """
    high = eval_bars["high"].to_numpy()
    low = eval_bars["low"].to_numpy()
    openp = eval_bars["open"].to_numpy()
    times = eval_bars.index.to_numpy()

    uniq, first_idx = np.unique(bar_eval_key, return_index=True)
    order = np.argsort(first_idx)
    uniq, first_idx = uniq[order], first_idx[order]
    ends = np.append(first_idx[1:], len(bar_eval_key))
    bounds = dict(zip(uniq, zip(first_idx, ends)))

    periods = period_ranges.index.to_numpy()
    lo_arr = period_ranges["low"].to_numpy()
    range_arr = period_ranges["range"].to_numpy()

    records = []
    for i in range(len(periods)):
        rng = range_arr[i]
        if not np.isfinite(rng) or rng <= 0:
            continue
        ek = eval_keys[i]
        if ek not in bounds:
            continue
        s, e = bounds[ek]
        if e - s < min_bars:
            continue
        h_win, l_win = high[s:e], low[s:e]
        lo = lo_arr[i]
        start_price = openp[s]

        for lvl in FIB_LEVELS:
            price = lo + rng * lvl
            if start_price < price:
                cond = h_win >= price
                if not cond.any():
                    continue
                t = int(np.argmax(cond))
                cont = h_win[t:].max() - price
                rev = price - l_win[t:].min()
                direction = "from_below"
            else:
                cond = l_win <= price
                if not cond.any():
                    continue
                t = int(np.argmax(cond))
                cont = price - l_win[t:].min()
                rev = h_win[t:].max() - price
                direction = "from_above"

            cont_pips = cont / pip_size
            rev_pips = rev / pip_size
            outcome = "continuation" if cont > rev else "mean_reversion"
            # P&L (pips) of fading the level — exit at the eventual extreme excursion.
            # Optimistic, so use for *ranking* slices against each other, not as tradeable expectancy.
            fade_pnl_pips = rev_pips if outcome == "mean_reversion" else -cont_pips
            records.append({
                "period": periods[i], "level": lvl, "is_key": lvl in KEY_LEVELS,
                "price": price, "direction": direction, "touch_time": times[s + t],
                "continuation_pips": cont_pips, "reversion_pips": rev_pips,
                "outcome": outcome, "fade_pnl_pips": fade_pnl_pips,
            })
    return records


def confluence_distance(touches: pd.DataFrame, monday_ranges: pd.DataFrame, pip_size: float) -> np.ndarray:
    """Min pip distance from each daily touch's level price to any of that week's 45 Monday-projected prices."""
    if touches.empty or monday_ranges.empty:
        return np.full(len(touches), np.nan)
    touch_week = (touches["touch_time"] - pd.to_timedelta(touches["touch_time"].dt.dayofweek, unit="D")).dt.normalize()
    lo = monday_ranges["low"].to_numpy()
    rng = monday_ranges["range"].to_numpy()
    monday_prices = lo[:, None] + rng[:, None] * FIB_LEVELS_ARR[None, :]  # (n_weeks, 45)
    week_to_idx = {k: i for i, k in enumerate(monday_ranges.index)}

    prices = touches["price"].to_numpy()
    weeks = touch_week.to_numpy()
    dists = np.full(len(touches), np.nan)
    for i in range(len(touches)):
        idx = week_to_idx.get(weeks[i])
        if idx is None:
            continue
        dists[i] = np.abs(monday_prices[idx] - prices[i]).min() / pip_size
    return dists


def confluence_bucket(dist_pips: np.ndarray, instrument_class: str) -> np.ndarray:
    tight = CONFLUENCE_TIGHT_PIPS[instrument_class]
    reg = CONFLUENCE_REGULAR_PIPS[instrument_class]
    bucket = np.full(len(dist_pips), "no_data", dtype=object)
    has_data = ~np.isnan(dist_pips)
    bucket[has_data] = "none"
    bucket[has_data & (dist_pips <= reg)] = "regular"
    bucket[has_data & (dist_pips <= tight)] = "tight"
    return bucket


def run_pair(pair: str, timeframe: str) -> dict:
    pip_size = PIP_SIZE[pair]
    instrument_class = "gold" if pair == "gold" else "fx"
    bars5 = load_pair_5m(pair)
    if bars5.empty:
        return {}

    daily_series = daily_close_series(bars5)
    regimes = compute_regimes(daily_series)

    def enrich(df: pd.DataFrame, tf: str) -> pd.DataFrame:
        if df.empty:
            return df
        df["pair"] = pair
        df["timeframe"] = tf
        df["instrument_class"] = instrument_class
        day = df["touch_time"].dt.normalize()
        df["vol_regime"] = day.map(regimes["vol_regime"])
        df["trend_regime"] = day.map(regimes["trend_regime"])
        return df

    out = {}
    monday_ranges = None
    want = {"daily", "monthly", "monday"} if timeframe == "all" else {timeframe}

    if "monday" in want or "daily" in want:
        week_key = (bars5.index - pd.to_timedelta(bars5.index.dayofweek, unit="D")).normalize().to_numpy()
        is_monday = bars5.index.dayofweek == 0
        monday_ranges = body_ranges(bars5[is_monday], week_key[is_monday])

    if "daily" in want:
        day_key = bars5.index.normalize().to_numpy()
        ranges = body_ranges(bars5, day_key)
        periods = ranges.index.to_numpy()
        eval_keys = np.append(periods[1:], np.array([object()]))
        recs = scan_touches(ranges, eval_keys, day_key, bars5, pip_size, MIN_BARS_NEXT_DAY)
        df = pd.DataFrame(recs)
        if not df.empty:
            df["touch_time"] = pd.to_datetime(df["touch_time"], utc=True)
            dist = confluence_distance(df, monday_ranges, pip_size)
            df["confluence_distance_pips"] = dist
            df["confluence_bucket"] = confluence_bucket(dist, instrument_class)
        out["daily"] = enrich(df, "daily")

    if "monthly" in want:
        month_key = bars5.index.to_period("M").to_numpy()
        ranges = body_ranges(bars5, month_key)
        periods = ranges.index.to_numpy()
        eval_keys = np.append(periods[1:], np.array([object()]))
        recs = scan_touches(ranges, eval_keys, month_key, bars5, pip_size, MIN_BARS_NEXT_MONTH)
        df = pd.DataFrame(recs)
        if not df.empty:
            df["touch_time"] = pd.to_datetime(df["touch_time"], utc=True)
        out["monthly"] = enrich(df, "monthly")

    if "monday" in want:
        is_monday = bars5.index.dayofweek == 0
        week_key = (bars5.index - pd.to_timedelta(bars5.index.dayofweek, unit="D")).normalize().to_numpy()
        rest_bars = bars5[~is_monday]
        rest_key = week_key[~is_monday]
        eval_keys = monday_ranges.index.to_numpy()  # same period — evaluated within the same week
        recs = scan_touches(monday_ranges, eval_keys, rest_key, rest_bars, pip_size, MIN_BARS_REST_OF_WEEK)
        df = pd.DataFrame(recs)
        if not df.empty:
            df["touch_time"] = pd.to_datetime(df["touch_time"], utc=True)
        out["monday"] = enrich(df, "monday")

    return out


def add_significance(summary: pd.DataFrame, pct_col: str = "pct_mean_reversion") -> pd.DataFrame:
    """Two-sided binomial-proportion z-test of pct_col vs 50%, normal approximation."""
    p_hat = summary[pct_col] / 100
    n = summary["n_touches"]
    z = (p_hat - 0.5) / np.sqrt(0.25 / n)
    summary["p_value"] = 2 * (1 - norm.cdf(z.abs()))
    summary["significant"] = summary["p_value"] < 0.05
    return summary


def summarize(df: pd.DataFrame) -> pd.DataFrame:
    g = df.groupby(["level", "is_key"])
    summary = g.agg(
        n_touches=("outcome", "count"),
        pct_continuation=("outcome", lambda s: (s == "continuation").mean() * 100),
        avg_continuation_pips=("continuation_pips", "mean"),
        avg_reversion_pips=("reversion_pips", "mean"),
        avg_fade_pnl_pips=("fade_pnl_pips", "mean"),
    ).reset_index()
    summary["pct_mean_reversion"] = 100 - summary["pct_continuation"]
    summary = add_significance(summary)
    return summary.sort_values("level").reset_index(drop=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--pairs", nargs="+", default=ALL_PAIRS, choices=ALL_PAIRS)
    ap.add_argument("--timeframe", choices=["daily", "monthly", "monday", "all"], default="all")
    ap.add_argument("--min-touches", type=int, default=30, help="min sample size to print in console summary")
    args = ap.parse_args()

    ensure_local(args.pairs)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    frames = {"daily": [], "monthly": [], "monday": []}
    for i, pair in enumerate(args.pairs, 1):
        print(f"[{i}/{len(args.pairs)}] {pair}...")
        result = run_pair(pair, args.timeframe)
        for tf, df in result.items():
            if not df.empty:
                frames[tf].append(df)

    for label, parts in frames.items():
        if not parts:
            continue
        all_df = pd.concat(parts, ignore_index=True)
        all_df.to_csv(OUT_DIR / f"{label}_touches.csv", index=False)

        summary = summarize(all_df)
        summary.to_csv(OUT_DIR / f"{label}_summary.csv", index=False)

        print(f"\n=== {label.upper()} — level reaction summary (min {args.min_touches} touches) ===")
        shown = summary[summary["n_touches"] >= args.min_touches]
        with pd.option_context("display.float_format", "{:.1f}".format, "display.width", 120):
            print(shown.to_string(index=False))

    print(f"\nSaved CSVs to {OUT_DIR}")


if __name__ == "__main__":
    main()
