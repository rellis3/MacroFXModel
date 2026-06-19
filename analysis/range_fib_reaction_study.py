#!/usr/bin/env python3
"""
Daily / monthly range Fib reaction study.

Same projection logic as js/asiaRangeEngine.js (price = range.low + range.range * level,
using the same FIB_LEVELS grid), but applied to the *completed daily/monthly* body range
instead of the Asia/Monday session range. For each projected level we find its first touch
in the following day/month and measure which excursion is bigger: the move that continues
through the level, or the move that reverses back through it.

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

MIN_BARS_NEXT_DAY   = 50    # 5-min bars (~4h) — guards against half-days/data gaps
MIN_BARS_NEXT_MONTH = 500   # 5-min bars (~42h)


def ensure_local(pairs):
    missing = [p for p in pairs if not (M1_DIR / f"{p}_m1.parquet").exists()
               or (M1_DIR / f"{p}_m1.parquet").stat().st_size < 10_000]
    if missing:
        print(f"Downloading {len(missing)} missing pair(s) from R2: {missing}")
        subprocess.run([sys.executable, str(DOWNLOADER), *missing], check=True, cwd=ROOT)


def load_pair_5m(pair: str) -> pd.DataFrame:
    df = pd.read_parquet(M1_DIR / f"{pair}_m1.parquet", columns=["open", "high", "low", "close"])
    df.index = pd.to_datetime(df.index, utc=True)
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


def scan_touches(period_ranges: pd.DataFrame, bar_period_key: np.ndarray, bars5: pd.DataFrame,
                  pip_size: float, min_bars_next: int) -> list:
    high = bars5["high"].to_numpy()
    low  = bars5["low"].to_numpy()
    openp = bars5["open"].to_numpy()
    times = bars5.index.to_numpy()

    uniq, first_idx = np.unique(bar_period_key, return_index=True)
    order = np.argsort(first_idx)
    uniq, first_idx = uniq[order], first_idx[order]
    ends = np.append(first_idx[1:], len(bar_period_key))
    bounds = dict(zip(uniq, zip(first_idx, ends)))

    periods   = period_ranges.index.to_numpy()
    lo_arr    = period_ranges["low"].to_numpy()
    range_arr = period_ranges["range"].to_numpy()

    records = []
    for i in range(len(periods) - 1):
        rng = range_arr[i]
        if not np.isfinite(rng) or rng <= 0:
            continue
        nxt = periods[i + 1]
        if nxt not in bounds:
            continue
        s, e = bounds[nxt]
        if e - s < min_bars_next:
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
                rev  = price - l_win[t:].min()
                direction = "from_below"
            else:
                cond = l_win <= price
                if not cond.any():
                    continue
                t = int(np.argmax(cond))
                cont = price - l_win[t:].min()
                rev  = h_win[t:].max() - price
                direction = "from_above"

            cont_pips = cont / pip_size
            rev_pips  = rev / pip_size
            outcome   = "continuation" if cont > rev else "mean_reversion"
            # P&L (pips) of fading the level — long/short into the level, exit at the eventual
            # extreme excursion. Optimistic (assumes the extreme is exit), so use for *ranking*
            # pairs/levels/days/sessions against each other, not as a tradeable expectancy.
            fade_pnl_pips = rev_pips if outcome == "mean_reversion" else -cont_pips
            records.append({
                "period": periods[i], "level": lvl, "is_key": lvl in KEY_LEVELS,
                "direction": direction, "touch_time": times[s + t],
                "continuation_pips": cont_pips, "reversion_pips": rev_pips,
                "outcome": outcome, "fade_pnl_pips": fade_pnl_pips,
            })
    return records


def run_pair(pair: str, timeframe: str) -> dict:
    pip_size = PIP_SIZE[pair]
    bars5 = load_pair_5m(pair)
    if bars5.empty:
        return {}

    out = {}
    if timeframe in ("daily", "both"):
        day_key = bars5.index.tz_convert("UTC").normalize().to_numpy()
        ranges  = body_ranges(bars5, day_key)
        recs    = scan_touches(ranges, day_key, bars5, pip_size, MIN_BARS_NEXT_DAY)
        out["daily"] = recs
    if timeframe in ("monthly", "both"):
        month_key = bars5.index.tz_convert("UTC").to_period("M").to_numpy()
        ranges    = body_ranges(bars5, month_key)
        recs      = scan_touches(ranges, month_key, bars5, pip_size, MIN_BARS_NEXT_MONTH)
        out["monthly"] = recs
    return out


def aggregate(records: list, pair: str) -> pd.DataFrame:
    if not records:
        return pd.DataFrame()
    df = pd.DataFrame(records)
    df["pair"] = pair
    return df


def add_significance(summary: pd.DataFrame, pct_col: str = "pct_mean_reversion") -> pd.DataFrame:
    """Two-sided binomial-proportion z-test of pct_col vs 50%, normal approximation."""
    from scipy.stats import norm
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
    ap.add_argument("--timeframe", choices=["daily", "monthly", "both"], default="both")
    ap.add_argument("--min-touches", type=int, default=30, help="min sample size to print in console summary")
    args = ap.parse_args()

    ensure_local(args.pairs)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    daily_frames, monthly_frames = [], []
    for i, pair in enumerate(args.pairs, 1):
        print(f"[{i}/{len(args.pairs)}] {pair}...")
        result = run_pair(pair, args.timeframe)
        if "daily" in result:
            daily_frames.append(aggregate(result["daily"], pair))
        if "monthly" in result:
            monthly_frames.append(aggregate(result["monthly"], pair))

    for label, frames in (("daily", daily_frames), ("monthly", monthly_frames)):
        if not frames:
            continue
        all_df = pd.concat(frames, ignore_index=True)
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
