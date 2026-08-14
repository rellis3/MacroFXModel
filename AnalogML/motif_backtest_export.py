#!/usr/bin/env python3
"""motif_backtest_export.py — the standard backtest results card, for the
N-touches-of-a-level structural motif signal (`pylego/motif_touch.py`).

Same house format `backtest_export.py` built for the (now-retired) k-NN
shape-matching signal, same discipline: per-trade R AND MAE from the REAL
bar path (never approximated from close-to-close), a real calendar IS/OOS
split, cost-on vs cost-off, and a stated account size / R-unit so the $ P&L
export isn't a hidden default. Shares `pylego.barrier_race.mae_from_path`
verbatim with that script rather than re-deriving MAE a second way.

This is a NEW viewer for an ALREADY validated signal, not a new validation.
The frozen setting raced here (pivot_n=5, tol=1.2xATR, min_retrace=2.5xATR,
min_gap=10 bars, breakout_max_bars=40, sl=20p, tp_r=1.5) is the exact one
`motif_scan.py`/`motif_walkforward.py`/`motif_portfolio_sim.py`/
`motif_track.py` already validated (26-pair sweep, 11/11 calendar-year
walk-forward folds positive, portfolio Sharpe 1.61-1.80 — see
`MD files/LEGO_MODULES.md`'s AnalogML entry). This script exists so that
record can be BROWSED the same way every other AnalogML/vol/regime backtest
is browsed (`touches-backtest.html`'s CSV exports + trade table + per-pair
breakdown) instead of only living in sweep printouts.

Usage:
  python AnalogML/motif_backtest_export.py --all-pairs
  python AnalogML/motif_backtest_export.py --pairs gbpjpy,eurusd --account-size 10000 --risk-pct 0.01
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pattern_scan import load_bars  # noqa: E402
from portfolio_sim import ALL_PAIRS  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from pylego.barrier_race import Entry, mae_from_path, race_trades  # noqa: E402
from pylego.costs import default_spread  # noqa: E402
from pylego.instruments import pip_size  # noqa: E402
from pylego.json_safe import json_safe  # noqa: E402
from pylego.motif_touch import detect_touch_motifs  # noqa: E402
from pylego.swing_structure import atr as compute_atr  # noqa: E402
from pylego.trade_stats import summarize_r  # noqa: E402

IS_OOS_CUTOFF = "2023-01-01"
DATA_DIR = Path(__file__).resolve().parent / "data"


def build_pair_trade_log(pair: str, args: argparse.Namespace) -> tuple[list[dict], list[float]]:
    """Full-history trade log for one pair, plus the cost-OFF R for the SAME
    entries (re-raced with cost_price=0 -- cheap, since the expensive motif
    scan isn't redone) for the cost-sensitivity comparison. Same {pair, date,
    direction, outcome, r, mae_r, return_pct, mae_pct, pnl_dollars,
    risk_dollars, is_oos} shape as backtest_export.py's trade dict, plus
    n_touches/is_top (this signal's own category tags -- see the README's
    "lifecycle disaggregation": doubles carry almost all the edge)."""
    bars = load_bars(pair, args.timeframe)
    n = len(bars)
    atr_arr = compute_atr(bars, period=args.atr_period)
    motifs = detect_touch_motifs(
        bars, atr_arr, pivot_n=args.pivot_n, tol_atr_mult=args.tol_atr_mult,
        min_retrace_atr_mult=args.min_retrace_atr_mult,
        min_bars_between_touches=args.min_bars_between_touches,
        breakout_max_bars=args.breakout_max_bars,
    )
    last_possible = n - 1 - args.max_bars_ahead
    eligible = [m for m in motifs if m.confirm_idx is not None and m.confirm_idx <= last_possible]

    pip = pip_size(pair)
    sl_price = args.sl_pips * pip
    cost_price = default_spread(pair)
    account_risk_dollars = args.account_size * args.risk_pct

    entries = [Entry(idx=m.confirm_idx + 1, direction=m.direction) for m in eligible]
    by_idx = {m.confirm_idx + 1: m for m in eligible}
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
        m = by_idx[t["idx"]]
        entry_date = bars.index[t["idx"]]
        mae_r, mae_pct = mae_from_path(bars, t["idx"], t["exit_idx"], t["direction"], t["entry_price"], sl_price)
        price_return_pct = t["direction"] * (t["exit_price"] - t["entry_price"]) / t["entry_price"] * 100.0
        trades.append({
            "pair": pair,
            "date": entry_date.strftime("%Y-%m-%d"),
            "entry_date": entry_date.isoformat(),
            "exit_date": bars.index[t["exit_idx"]].isoformat(),
            "direction": "BUY" if t["direction"] == 1 else "SELL",
            "outcome": t["outcome"],
            "n_touches": m.n_touches,
            "is_top": bool(m.is_top),
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
    p.add_argument("--atr-period", type=int, default=14)
    p.add_argument("--pivot-n", type=int, default=5)
    p.add_argument("--tol-atr-mult", type=float, default=1.2)
    p.add_argument("--min-retrace-atr-mult", type=float, default=2.5)
    p.add_argument("--min-bars-between-touches", type=int, default=10)
    p.add_argument("--breakout-max-bars", type=int, default=40)
    p.add_argument("--sl-pips", type=float, default=20.0)
    p.add_argument("--tp-r", type=float, default=1.5)
    p.add_argument("--max-bars-ahead", type=int, default=200)
    p.add_argument("--min-bars-ahead", type=int, default=10)
    p.add_argument("--account-size", type=float, default=10000.0)
    p.add_argument("--risk-pct", type=float, default=0.01)
    p.add_argument("--out", default=str(DATA_DIR / "motif_backtest_export.json"))
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
            "pivot_n": args.pivot_n, "tol_atr_mult": args.tol_atr_mult,
            "min_retrace_atr_mult": args.min_retrace_atr_mult,
            "min_bars_between_touches": args.min_bars_between_touches,
            "breakout_max_bars": args.breakout_max_bars,
            "sl_pips": args.sl_pips, "tp_r": args.tp_r,
            "timeframe": args.timeframe, "account_size": args.account_size, "risk_pct": args.risk_pct,
            "is_oos_cutoff": IS_OOS_CUTOFF,
        },
        "caveat": (
            "Frozen N-touches-of-a-level structural motif signal (pylego.motif_touch), scored via "
            "the shared pylego.barrier_race walker -- the SAME setting motif_scan.py / "
            "motif_walkforward.py (11/11 calendar-year folds positive) / motif_portfolio_sim.py "
            "(portfolio Sharpe 1.61) already validated; this export doesn't re-tune anything, it's "
            "a browsable view of that already-validated record. Every trade is individually causal "
            "(no lookahead -- see pylego/motif_touch_test.py's confirmability-lag regression guard). "
            "No live/paper forward verification beyond this local snapshot (through 2026-05-21) -- "
            "see AnalogML/README.md and today.html's live 'structural motif diagnostic' chip for the "
            "forward-tracking mechanism (blocked on OANDA reachability in this sandbox)."
        ),
        "pairs": pairs,
        "summary": {**overall, "cost_sensitivity": cost_sensitivity},
        "per_pair": per_pair,
        "trades": all_trades,
    }

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w") as f:
        json.dump(json_safe(out), f)
    print(f"\n[export] {len(all_trades)} trades, {len(pairs)} pairs -> {out_path}")
    print(f"[overall] IS n={overall['is']['n']} PF={overall['is']['profit_factor']:.2f}  "
          f"OOS n={overall['oos']['n']} PF={overall['oos']['profit_factor']:.2f}  "
          f"cost-on PF={cost_sensitivity['with_cost']['profit_factor']:.2f}  "
          f"cost-off PF={cost_sensitivity['without_cost']['profit_factor']:.2f}")


if __name__ == "__main__":
    main()
