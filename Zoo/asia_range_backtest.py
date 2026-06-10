"""
Asia Range Deviation Backtest - EURUSD
=======================================
Strategy:
Asia session = 00:00-06:00 UK time (GMT/BST aware)
Range = highest 5m candle body HIGH to lowest 5m candle body LOW during Asia
Deviation levels: 1.5x, 2x, 2.5x ... 10x above and below range
Confluence: current day AND previous day deviation levels within 2 pips -> tradeable level
Entry: price touches level (reversal)
Short: price comes UP to a level
Long:  price comes DOWN to a level
SL: 5 pips | TP: 10 pips
No lookahead bias: all levels calculated only after Asia session closes (06:00 UK)
Trades only during London/NY sessions: 06:00-22:00 UK time

Data:
Provide your own 5-minute EURUSD OHLC CSV.
Expected columns (case-insensitive): datetime, open, high, low, close
datetime format: YYYY-MM-DD HH:MM:SS (UTC or with tz offset)

Usage:
  pip install pandas numpy pytz
  python asia_range_backtest.py --file eurusd_5m.csv --start 2023-01-01 --end 2024-01-01

Or edit CONFIG below and run directly.
"""

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytz

# ──────────────────────────────────────────────────────────────────────────────
# CONFIG  (overridden by CLI args if provided)
# ──────────────────────────────────────────────────────────────────────────────
CONFIG = {
    "file": "eurusd_5m.csv",          # path to your CSV
    "start": "2022-01-01",            # backtest start (inclusive)
    "end":   "2024-01-01",            # backtest end   (exclusive)
    "pip_size": 0.0001,               # 1 pip for EURUSD
    "sl_pips": 5,
    "tp_pips": 10,
    "confluence_pips": 2,             # max distance for level confluence
    "dev_steps": [x / 2 for x in range(3, 21)],  # 1.5, 2.0 … 10.0
    "asia_start_utc": 0,              # UTC hour Asia opens (00:00 UTC = 00:00 UK winter)
    "asia_end_utc": 6,                # UTC hour Asia closes
    # UK offset: +0 Nov-Mar, +1 Apr-Oct  — handled automatically via pytz
}

PIP = CONFIG["pip_size"]
UK_TZ = pytz.timezone("Europe/London")
UTC_TZ = pytz.utc


# ──────────────────────────────────────────────────────────────────────────────
# DATA LOADING
# ──────────────────────────────────────────────────────────────────────────────
def load_data(filepath: str) -> pd.DataFrame:
    """Load and prepare 5m OHLC data with UK timezone conversion."""
    df = pd.read_csv(filepath)
    df.columns = [c.strip().lower() for c in df.columns]

    # Find datetime column
    dt_col = next((c for c in df.columns if "time" in c or "date" in c), df.columns[0])
    df["datetime"] = pd.to_datetime(df[dt_col], utc=True)
    df = df.sort_values("datetime").reset_index(drop=True)

    # Ensure OHLC present
    for col in ["open", "high", "low", "close"]:
        if col not in df.columns:
            raise ValueError(f"Missing column: {col}")
        df[col] = df[col].astype(float)

    # Add UK local time
    df["dt_uk"] = df["datetime"].dt.tz_convert(UK_TZ)
    df["date_uk"] = df["dt_uk"].dt.date
    df["hour_uk"] = df["dt_uk"].dt.hour + df["dt_uk"].dt.minute / 60

    return df


# ──────────────────────────────────────────────────────────────────────────────
# ASIA RANGE CALCULATION (no lookahead)
# ──────────────────────────────────────────────────────────────────────────────
def calc_asia_ranges(df: pd.DataFrame) -> dict:
    """
    For each UK date, compute Asia range from candles where:
      UK hour >= 0  AND  UK hour < 6
    Returns dict: date -> {"high": float, "low": float, "range": float}

    Candle timestamp = candle OPEN time. A 5m candle labelled 05:55 closes at 06:00.
    We include candles with open time in [00:00, 06:00) — strictly before 06:00.
    This means the range is fully known at 06:00 with zero lookahead.
    """
    asia = df[(df["hour_uk"] >= 0) & (df["hour_uk"] < 6)].copy()

    ranges = {}
    for date, group in asia.groupby("date_uk"):
        if len(group) < 6:          # skip incomplete sessions
            continue
        body_high = group[["open", "close"]].max(axis=1).max()
        body_low  = group[["open", "close"]].min(axis=1).min()
        r = body_high - body_low
        if r <= 0:
            continue
        ranges[date] = {"high": body_high, "low": body_low, "range": r}

    return ranges


def build_deviation_levels(asia_range: dict) -> list:
    """Given a single Asia range dict, return list of (price, direction_bias) tuples.
    direction_bias: 'short' for levels above range, 'long' for levels below."""
    levels = []
    h, l, r = asia_range["high"], asia_range["low"], asia_range["range"]
    for mult in CONFIG["dev_steps"]:
        levels.append((h + mult * r, "short"))
        levels.append((l - mult * r, "long"))
    return levels


# ──────────────────────────────────────────────────────────────────────────────
# CONFLUENCE CHECK
# ──────────────────────────────────────────────────────────────────────────────
def find_confluence_levels(levels_today: list, levels_prev: list,
                           threshold_pips: float) -> list:
    """
    Find levels from today and prev day that are within threshold_pips of each other.
    Returns list of (avg_price, direction) for matched pairs.
    """
    threshold = threshold_pips * PIP
    tradeable = []

    for pt, dt in levels_today:
        for pp, dp in levels_prev:
            if dt != dp:
                continue                    # must be same direction
            if abs(pt - pp) <= threshold:
                avg = (pt + pp) / 2
                tradeable.append((avg, dt))

    # Deduplicate: if multiple pairs cluster, keep unique by rounding to 0.5 pip
    seen = set()
    unique = []
    for price, direction in tradeable:
        key = (round(price / (0.5 * PIP)), direction)
        if key not in seen:
            seen.add(key)
            unique.append((price, direction))

    return unique


# ──────────────────────────────────────────────────────────────────────────────
# TRADE SIMULATION (strict no-lookahead)
# ──────────────────────────────────────────────────────────────────────────────
def simulate_day_trades(day_candles: pd.DataFrame,
                        tradeable_levels: list,
                        sl_pips: float,
                        tp_pips: float) -> list:
    """
    Walk candles bar-by-bar (06:00–22:00 UK). On each bar:
      - Check if any ACTIVE level is touched by High (short entry) or Low (long entry)
      - Once entered, manage SL/TP on subsequent bars
      - One trade per level (level consumed after entry)
    Returns list of trade result dicts.
    """
    sl = sl_pips * PIP
    tp = tp_pips * PIP
    trades = []

    # Filter to trading window (after Asia close)
    candles = day_candles[(day_candles["hour_uk"] >= 6) &
                          (day_candles["hour_uk"] < 22)].copy()
    if candles.empty:
        return trades

    # Active levels: {level_price: direction}  — consumed on touch
    active = {price: direction for price, direction in tradeable_levels}
    open_trades = []  # list of {entry, sl_price, tp_price, direction}

    for _, bar in candles.iterrows():
        bar_high  = bar["high"]
        bar_low   = bar["low"]
        bar_open  = bar["open"]
        bar_close = bar["close"]

        # ── Manage open trades first (no lookahead: we use this bar's range) ──
        still_open = []
        for trade in open_trades:
            hit_sl = (trade["direction"] == "long"  and bar_low  <= trade["sl_price"]) or \
                     (trade["direction"] == "short" and bar_high >= trade["sl_price"])
            hit_tp = (trade["direction"] == "long"  and bar_high >= trade["tp_price"]) or \
                     (trade["direction"] == "short" and bar_low  <= trade["tp_price"])

            if hit_tp and hit_sl:
                # Both hit same bar — conservative: whichever is closer to open
                dist_sl = abs(bar_open - trade["sl_price"])
                dist_tp = abs(bar_open - trade["tp_price"])
                outcome = "tp" if dist_tp <= dist_sl else "sl"
            elif hit_tp:
                outcome = "tp"
            elif hit_sl:
                outcome = "sl"
            else:
                still_open.append(trade)
                continue

            pnl_pips = tp_pips if outcome == "tp" else -sl_pips
            trades.append({
                "entry_price": trade["entry"],
                "direction":   trade["direction"],
                "outcome":     outcome,
                "pnl_pips":    pnl_pips,
                "level":       trade["level"],
                "bar_dt":      bar["dt_uk"],
            })

        open_trades = still_open

        # ── Check level touches for new entries ──
        triggered = []
        for price, direction in list(active.items()):
            if direction == "short" and bar_high >= price:
                # Price came UP to level -> short entry at level price
                triggered.append((price, direction))
            elif direction == "long" and bar_low <= price:
                # Price came DOWN to level -> long entry at level price
                triggered.append((price, direction))

        for price, direction in triggered:
            del active[price]
            entry = price
            if direction == "short":
                sl_price = entry + sl
                tp_price = entry - tp
            else:
                sl_price = entry - sl
                tp_price = entry + tp

            open_trades.append({
                "entry":     entry,
                "sl_price":  sl_price,
                "tp_price":  tp_price,
                "direction": direction,
                "level":     price,
            })

    # Close any trades still open at end of day (at last bar close)
    last_close = candles.iloc[-1]["close"] if not candles.empty else None
    for trade in open_trades:
        pnl_pips = (last_close - trade["entry"]) / PIP if trade["direction"] == "long" \
               else (trade["entry"] - last_close) / PIP
        trades.append({
            "entry_price": trade["entry"],
            "direction":   trade["direction"],
            "outcome":     "eod_close",
            "pnl_pips":    round(pnl_pips, 1),
            "level":       trade["level"],
            "bar_dt":      candles.iloc[-1]["dt_uk"],
        })

    return trades


# ──────────────────────────────────────────────────────────────────────────────
# MAIN BACKTEST LOOP
# ──────────────────────────────────────────────────────────────────────────────
def run_backtest(df: pd.DataFrame, start: str, end: str) -> pd.DataFrame:
    """Execute backtest across date range."""
    start_dt = pd.Timestamp(start).date()
    end_dt   = pd.Timestamp(end).date()

    df = df[(df["date_uk"] >= start_dt) & (df["date_uk"] < end_dt)]

    asia_ranges = calc_asia_ranges(df)
    all_dates   = sorted(asia_ranges.keys())

    all_trades = []

    for i, today in enumerate(all_dates):
        if i == 0:
            continue  # Need a previous day

        prev_day = all_dates[i - 1]

        # Safety: skip if prev_day gap > 5 calendar days (weekend/holiday gap ok, but large gap = data issue)
        gap = (pd.Timestamp(today) - pd.Timestamp(prev_day)).days
        if gap > 5:
            continue

        levels_today = build_deviation_levels(asia_ranges[today])
        levels_prev  = build_deviation_levels(asia_ranges[prev_day])
        tradeable    = find_confluence_levels(levels_today, levels_prev,
                                              CONFIG["confluence_pips"])

        if not tradeable:
            continue

        # Candles for today (post-Asia)
        day_candles = df[df["date_uk"] == today]

        day_trades = simulate_day_trades(
            day_candles, tradeable,
            CONFIG["sl_pips"], CONFIG["tp_pips"]
        )

        for t in day_trades:
            t["date"] = today
        all_trades.extend(day_trades)

    return pd.DataFrame(all_trades)


# ──────────────────────────────────────────────────────────────────────────────
# REPORTING
# ──────────────────────────────────────────────────────────────────────────────
def report(trades: pd.DataFrame):
    """Generate comprehensive backtest report."""
    if trades.empty:
        print("No trades generated. Check your data file and date range.")
        return

    total   = len(trades)
    wins    = (trades["outcome"] == "tp").sum()
    losses  = (trades["outcome"] == "sl").sum()
    eod     = (trades["outcome"] == "eod_close").sum()
    win_rate = wins / (wins + losses) * 100 if (wins + losses) > 0 else 0
    net_pips = trades["pnl_pips"].sum()
    avg_pips = trades["pnl_pips"].mean()
    max_dd   = (trades["pnl_pips"].cumsum() - trades["pnl_pips"].cumsum().cummax()).min()

    print("\n" + "═" * 52)
    print("  ASIA RANGE DEVIATION BACKTEST — EURUSD 5M")
    print("═" * 52)
    print(f"  Period          : {trades['date'].min()} → {trades['date'].max()}")
    print(f"  Total trades    : {total}")
    print(f"  TP hits         : {wins}  ({win_rate:.1f}%)")
    print(f"  SL hits         : {losses}")
    print(f"  EOD closes      : {eod}")
    print(f"  Net pips        : {net_pips:+.1f}")
    print(f"  Avg pips/trade  : {avg_pips:+.2f}")
    print(f"  Max drawdown    : {max_dd:.1f} pips")
    print("─" * 52)

    # Breakdown by direction
    for d in ["long", "short"]:
        sub = trades[trades["direction"] == d]
        if sub.empty:
            continue
        w = (sub["outcome"] == "tp").sum()
        l = (sub["outcome"] == "sl").sum()
        wr = w / (w + l) * 100 if (w + l) > 0 else 0
        print(f"  {d.upper():<6}  trades={len(sub):>4}  WR={wr:.1f}%  "
              f"net={sub['pnl_pips'].sum():+.1f} pips")

    print("═" * 52 + "\n")

    # Monthly breakdown
    trades["month"] = pd.to_datetime(trades["date"]).dt.to_period("M")
    monthly = trades.groupby("month")["pnl_pips"].sum()
    print("  Monthly P&L (pips):")
    for period, pnl in monthly.items():
        bar = "█" * int(abs(pnl) / 5) if abs(pnl) >= 5 else "·"
        sign = "+" if pnl >= 0 else ""
        print(f"    {period}  {sign}{pnl:6.1f}  {bar}")
    print()

    # Save detailed results
    out_path = Path("asia_backtest_results.csv")
    trades.to_csv(out_path, index=False)
    print(f"  Full results saved to: {out_path}\n")


# ──────────────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ──────────────────────────────────────────────────────────────────────────────
def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="Asia Range Deviation Backtest")
    parser.add_argument("--file",  default=CONFIG["file"],  help="Path to 5m OHLC CSV")
    parser.add_argument("--start", default=CONFIG["start"], help="Start date YYYY-MM-DD")
    parser.add_argument("--end",   default=CONFIG["end"],   help="End date YYYY-MM-DD")
    return parser.parse_args()


def main():
    """Main execution function."""
    args = parse_args()

    filepath = Path(args.file)
    if not filepath.exists():
        print(f"\n  ERROR: File not found: {filepath}")
        print("  Provide a 5-minute EURUSD CSV with columns: datetime, open, high, low, close")
        print("  Example:  python asia_range_backtest.py --file eurusd_5m.csv\n")
        sys.exit(1)

    print(f"\n  Loading data from: {filepath}")
    df = load_data(str(filepath))
    print(f"  Loaded {len(df):,} candles from {df['date_uk'].min()} to {df['date_uk'].max()}")

    print(f"  Running backtest: {args.start} → {args.end}")
    trades = run_backtest(df, args.start, args.end)

    report(trades)


if __name__ == "__main__":
    main()
