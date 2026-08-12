#!/usr/bin/env python3
"""backtest_export.py — the standard backtest results card, for AnalogML.

Runs the FROZEN shape-matching signal (window=64, k=20, non-overlapping
"independent" trades — the setting pattern_scan_sweep.py validated across
26/26 pairs) and exports a JSON with everything a house-standard results
card needs: per-trade R AND MAE from the REAL bar path (never approximated
from close-to-close — CLAUDE.md's backtest discipline), a real calendar
IS/OOS split, cost-on vs cost-off, and a stated account size / R-unit so the
$ P&L export isn't a hidden default.

**On the IS/OOS split, read this before trusting it.** Every individual
trade here only ever used data strictly BEFORE its own entry (the
`exclude_after` guard in pylego.shape_match/analog_signal) — that's always
true regardless of period, a structural no-lookahead guarantee. But the
window=64/k=20 SETTING was chosen by pattern_scan_sweep.py, which looked at
aggregate performance over roughly this same recent-years window. So the
"OOS" split below (2023-01-01 onward, matching the sweep's own eval window)
is a real calendar split and a genuine stability check across two periods —
it is NOT a blind, never-touched holdout the way a proper OOS claim
requires. A truly blind forward test needs NEW data beyond what's in this
sandbox's parquet snapshot (through 2026-05-21) — not available here.
Read the OOS numbers as "did it stay consistent," not "proof it will work
on unseen data."

Usage:
  python AnalogML/backtest_export.py --all-pairs
  python AnalogML/backtest_export.py --pairs gbpjpy,eurusd --account-size 10000 --risk-pct 0.01
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pattern_scan import load_bars, pick_queries  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from pylego.analog_signal import neighbor_consensus  # noqa: E402
from pylego.barrier_race import Entry, race_trades  # noqa: E402
from pylego.costs import default_spread  # noqa: E402
from pylego.instruments import pip_size  # noqa: E402
from pylego.shape_match import rolling_shapes  # noqa: E402
from pylego.trade_stats import summarize_r  # noqa: E402

ALL_PAIRS = [
    "audcad", "audchf", "audjpy", "audnzd", "audusd", "cadjpy", "chfjpy",
    "euraud", "eurcad", "eurchf", "eurgbp", "eurjpy", "eurnzd", "eurusd",
    "gbpaud", "gbpcad", "gbpchf", "gbpjpy", "gbpnzd", "gbpusd", "gold",
    "nzdjpy", "nzdusd", "usdcad", "usdchf", "usdjpy",
]

IS_OOS_CUTOFF = "2023-01-01"
DATA_DIR = Path(__file__).resolve().parent / "data"


def compute_mae(bars: pd.DataFrame, idx: int, exit_idx: int, direction: int,
                entry_price: float, sl_price: float) -> tuple[float, float]:
    """MAE from the REAL bar path between entry and exit (inclusive) --
    Low-vs-entry for longs, High-vs-entry for shorts, never approximated
    from the close-to-close return. Capped at `sl_price`: on an H1 bar, the
    EXIT bar's full high/low range can overshoot the SL price by a lot (a
    big wick continuing past the touch point within that same hour), but
    `race_trades`' fixed-barrier walker means the position closes exactly
    when the SL level is first touched -- it never experiences adverse
    movement beyond that, so an uncapped MAE here would overstate real
    risk. Same discipline as the barrier walker itself: one fixed SL, no
    more, no less."""
    highs = bars["high"].to_numpy()[idx:exit_idx + 1]
    lows = bars["low"].to_numpy()[idx:exit_idx + 1]
    if direction > 0:
        mae_price = entry_price - float(lows.min())
    else:
        mae_price = float(highs.max()) - entry_price
    mae_price = min(max(mae_price, 0.0), sl_price)
    return mae_price / sl_price, mae_price / entry_price * 100.0


def build_pair_trade_log(pair: str, args: argparse.Namespace) -> tuple[list[dict], list[float]]:
    """Full-history (2016 -> end of data) trade log for one pair, plus the
    cost-OFF R for the SAME entries (re-races the identical direction calls
    with cost_price=0 -- cheap, since the expensive shape search isn't
    redone) for the cost-sensitivity comparison."""
    bars = load_bars(pair, args.timeframe)
    n = len(bars)
    closes = bars["close"].to_numpy()
    end_idx, shapes = rolling_shapes(closes, args.window)
    end_idx_set_pos = {int(e): i for i, e in enumerate(end_idx)}
    queries = pick_queries(n, args.window, args.window, 0, args.max_bars_ahead, args.min_candidates)

    pip = pip_size(pair)
    sl_price = args.sl_pips * pip
    cost_price = default_spread(pair)
    account_risk_dollars = args.account_size * args.risk_pct

    entries: list[Entry] = []
    for q in queries:
        pos = end_idx_set_pos.get(q)
        if pos is None:
            continue
        consensus = neighbor_consensus(
            bars, end_idx, shapes, shapes[pos], query_end=q,
            k=args.k, min_gap_bars=args.window,
            sl_price=sl_price, tp_r=args.tp_r, cost_price=cost_price,
            max_bars_ahead=args.max_bars_ahead, min_bars_ahead=args.min_bars_ahead,
        )
        if consensus.direction == 0:
            continue
        entries.append(Entry(idx=q + 1, direction=consensus.direction))

    resolved = race_trades(bars, entries, sl=sl_price, tp_r=args.tp_r,
                           max_bars_ahead=args.max_bars_ahead, cost_price=cost_price,
                           min_bars_ahead=args.min_bars_ahead)
    resolved_nocost = race_trades(bars, entries, sl=sl_price, tp_r=args.tp_r,
                                  max_bars_ahead=args.max_bars_ahead, cost_price=0.0,
                                  min_bars_ahead=args.min_bars_ahead)
    nocost_by_idx = {t["idx"]: t["r"] for t in resolved_nocost}

    cutoff = pd.Timestamp(IS_OOS_CUTOFF, tz=bars.index.tz)
    trades = []
    for t in resolved:
        entry_date = bars.index[t["idx"]]
        mae_r, mae_pct = compute_mae(bars, t["idx"], t["exit_idx"], t["direction"], t["entry_price"], sl_price)
        price_return_pct = t["direction"] * (t["exit_price"] - t["entry_price"]) / t["entry_price"] * 100.0
        trades.append({
            "pair": pair,
            "date": entry_date.strftime("%Y-%m-%d"),
            "entry_date": entry_date.isoformat(),
            "exit_date": bars.index[t["exit_idx"]].isoformat(),
            "direction": "BUY" if t["direction"] == 1 else "SELL",
            "outcome": t["outcome"],
            "r": round(t["r"], 4),
            "mae_r": round(mae_r, 4),
            "return_pct": round(price_return_pct, 4),
            "mae_pct": round(mae_pct, 4),
            "pnl_dollars": round(t["r"] * account_risk_dollars, 2),
            "risk_dollars": round(account_risk_dollars, 2),
            "is_oos": "OOS" if entry_date >= cutoff else "IS",
        })
    nocost_r = [nocost_by_idx[t["idx"]] for t in resolved if t["idx"] in nocost_by_idx]
    return trades, nocost_r


def split_summary(trades: list[dict]) -> dict:
    return {
        "is": summarize_r(t["r"] for t in trades if t["is_oos"] == "IS"),
        "oos": summarize_r(t["r"] for t in trades if t["is_oos"] == "OOS"),
        "full": summarize_r(t["r"] for t in trades),
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pairs", default=None, help="comma-separated; default is --all-pairs")
    p.add_argument("--all-pairs", action="store_true")
    p.add_argument("--timeframe", default="1h")
    p.add_argument("--window", type=int, default=64)
    p.add_argument("--k", type=int, default=20)
    p.add_argument("--sl-pips", type=float, default=20.0)
    p.add_argument("--tp-r", type=float, default=1.5)
    p.add_argument("--max-bars-ahead", type=int, default=200)
    p.add_argument("--min-bars-ahead", type=int, default=10)
    p.add_argument("--min-candidates", type=int, default=2000)
    p.add_argument("--account-size", type=float, default=10000.0)
    p.add_argument("--risk-pct", type=float, default=0.01)
    p.add_argument("--out", default=str(DATA_DIR / "backtest_export.json"))
    args = p.parse_args()

    pairs = args.pairs.split(",") if args.pairs else ALL_PAIRS
    all_trades: list[dict] = []
    all_nocost_r: list[float] = []
    per_pair = []
    for pair in pairs:
        trades, nocost_r = build_pair_trade_log(pair, args)
        all_trades.extend(trades)
        all_nocost_r.extend(nocost_r)
        summary = split_summary(trades)
        per_pair.append({"pair": pair, **summary})
        print(f"  {pair:<8} {len(trades):>4} trades  IS n={summary['is']['n']:<4} PF={summary['is']['profit_factor']:.2f}"
              f"   OOS n={summary['oos']['n']:<4} PF={summary['oos']['profit_factor']:.2f}")

    overall = split_summary(all_trades)
    cost_sensitivity = {
        "with_cost": summarize_r(t["r"] for t in all_trades),
        "without_cost": summarize_r(all_nocost_r),
    }

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "params": {
            "window": args.window, "k": args.k, "sl_pips": args.sl_pips, "tp_r": args.tp_r,
            "timeframe": args.timeframe, "account_size": args.account_size, "risk_pct": args.risk_pct,
            "is_oos_cutoff": IS_OOS_CUTOFF, "non_overlapping": True,
        },
        "caveat": (
            "Frozen shape-matching direction signal (pylego.shape_match + pylego.analog_signal), "
            "scored via the shared pylego.barrier_race walker. window=64/k=20 were chosen by "
            "pattern_scan_sweep.py using aggregate performance over roughly the OOS window shown "
            "here -- this is a real calendar split and stability check, NOT a blind never-touched "
            "holdout. Every trade is individually causal (no lookahead), but the SETTING is not. "
            "Unoptimised beyond that one sweep, no realistic swap/slippage beyond the modeled "
            "spread, no live/paper verification. Not a validated edge -- see AnalogML/README.md."
        ),
        "pairs": pairs,
        "summary": {**overall, "cost_sensitivity": cost_sensitivity},
        "per_pair": per_pair,
        "trades": all_trades,
    }

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w") as f:
        json.dump(out, f)
    print(f"\n[export] {len(all_trades)} trades, {len(pairs)} pairs -> {out_path}")
    print(f"[overall] IS n={overall['is']['n']} PF={overall['is']['profit_factor']:.2f}  "
          f"OOS n={overall['oos']['n']} PF={overall['oos']['profit_factor']:.2f}  "
          f"cost-on PF={cost_sensitivity['with_cost']['profit_factor']:.2f}  "
          f"cost-off PF={cost_sensitivity['without_cost']['profit_factor']:.2f}")


if __name__ == "__main__":
    main()
