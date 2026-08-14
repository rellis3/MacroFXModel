#!/usr/bin/env python3
"""motif_combined_backtest_export.py — the standard backtest results card
(house pattern: `backtest_export.py`/`analogml-backtest.html`) for the
combined signal: adaptive per-category SL/TP STACKED WITH HTF-conflict
sizing (`motif_combined_portfolio_sim.py`, validated 26-pair: Sharpe 2.45,
max DD -38.7%, beating either mechanism alone — see AnalogML/README.md).

Pure composition + export layer — reuses `motif_combined_portfolio_sim`'s
causal pipeline (`build_htf_ctx`, `size_mult_for`) and `motif_adaptive`'s
motif collection verbatim, adds nothing but per-trade MAE (same real-bar-
path, capped-at-stop convention as `backtest_export.py`) and the JSON shape
`analogml-backtest.html`-style viewers already know how to render. Neither
`motif_combined_portfolio_sim.py` nor any of its parents is modified.

Every trade carries BOTH r (the combined signal actually traded) and
bench_r (the SAME motif raced through the frozen sl=20p/tp_r=1.5 grid,
uniform sizing) so a viewer can show the delta per-trade, not just in
aggregate.

Usage:
  python AnalogML/motif_combined_backtest_export.py --all-pairs
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from motif_adaptive import collect_pair_motifs  # noqa: E402
from motif_combined_portfolio_sim import build_htf_ctx, size_mult_for  # noqa: E402
from motif_multi_tf import DETECT_KW, htf_lean_at  # noqa: E402
from pattern_scan import load_bars  # noqa: E402
from portfolio_sim import ALL_PAIRS, pairwise_correlation_summary, sharpe_and_dd, simulate_portfolio  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from pylego.barrier_race import Entry, VariableEntry, race_trades, race_trades_variable  # noqa: E402
from pylego.trade_stats import summarize_r  # noqa: E402

IS_OOS_CUTOFF = "2023-01-01"
DATA_DIR = Path(__file__).resolve().parent / "data"


def compute_mae(bars: pd.DataFrame, idx: int, exit_idx: int, direction: int,
                entry_price: float, sl_price: float) -> tuple[float, float]:
    """Same convention as backtest_export.py's compute_mae: real bar-path
    MAE (low-vs-entry for longs, high-vs-entry for shorts), capped at the
    trade's OWN sl_price -- the barrier walker guarantees the position
    never experiences adverse movement beyond its stop."""
    highs = bars["high"].to_numpy()[idx:exit_idx + 1]
    lows = bars["low"].to_numpy()[idx:exit_idx + 1]
    if direction > 0:
        mae_price = entry_price - float(lows.min())
    else:
        mae_price = float(highs.max()) - entry_price
    mae_price = min(max(mae_price, 0.0), sl_price)
    return mae_price / sl_price, mae_price / entry_price * 100.0


def build_trade_row(m: dict, t: dict, b_trade: dict, size_mult: float, bucket: str,
                    bars: pd.DataFrame, account_risk_dollars: float, cutoff: pd.Timestamp) -> dict:
    """One combined-signal trade, in the house export schema
    (backtest_export.py's fields) plus the combination's own columns
    (category, htf_bucket, size_mult, bench_r)."""
    entry_date = bars.index[t["idx"]]
    mae_r, mae_pct = compute_mae(bars, t["idx"], t["exit_idx"], t["direction"], t["entry_price"], t["sl"])
    price_return_pct = t["direction"] * (t["exit_price"] - t["entry_price"]) / t["entry_price"] * 100.0
    risk_dollars = account_risk_dollars * size_mult
    n_touches, is_top = m["category"]
    return {
        "pair": m["pair"],
        "date": entry_date.strftime("%Y-%m-%d"),
        "entry_date": entry_date.isoformat(),
        "exit_date": bars.index[t["exit_idx"]].isoformat(),
        "direction": "BUY" if t["direction"] == 1 else "SELL",
        "category": f"{n_touches}-touch {'top' if is_top else 'bottom'}",
        "htf_bucket": bucket,
        "outcome": t["outcome"],
        "sl_pips": round(t["sl"] / m["pip"], 1),
        "tp_pips": round(t["tp_dist"] / m["pip"], 1),
        "size_mult": size_mult,
        "r": round(t["r"], 4),
        "bench_r": round(b_trade["r"], 4),
        "mae_r": round(mae_r, 4),
        "return_pct": round(price_return_pct, 4),
        "mae_pct": round(mae_pct, 4),
        "pnl_dollars": round(t["r"] * risk_dollars, 2),
        "risk_dollars": round(risk_dollars, 2),
        "is_oos": "OOS" if entry_date >= cutoff else "IS",
    }


def build_trade_log(pairs: list[str], args: argparse.Namespace) -> list[dict]:
    """Full combined-signal trade log across all pairs, on ONE global causal
    timeline (every pair's motifs collected first, then sized+raced in
    confirm-time order across ALL pairs) — same invariant as
    motif_combined_portfolio_sim.build_dated_trades, so this export's
    aggregate numbers match that script's."""
    all_motifs_by_pair = {}
    for pair in pairs:
        m = collect_pair_motifs(pair, args)
        all_motifs_by_pair[pair] = m
        print(f"  {pair:<8} {len(m):>5} eligible motifs")

    order = sorted(
        ((m["confirm_time"], pair, i) for pair, ms in all_motifs_by_pair.items() for i, m in enumerate(ms)),
        key=lambda x: x[0])

    bars_by_pair = {pair: load_bars(pair, args.timeframe) for pair in pairs}
    htf_ctx_by_pair = {pair: build_htf_ctx(pair, args) for pair in pairs}
    cutoff = pd.Timestamp(IS_OOS_CUTOFF, tz=bars_by_pair[pairs[0]].index.tz)
    account_risk_dollars = args.account_size * args.risk_pct

    pool: dict[tuple, list[float]] = defaultdict(list)
    pool_mfe: dict[tuple, list[float]] = defaultdict(list)
    rows: list[dict] = []
    for _, pair, i in order:
        m = all_motifs_by_pair[pair][i]
        cat = m["category"]
        mae_pool, mfe_pool = pool[cat], pool_mfe[cat]
        if len(mae_pool) >= args.min_pool:
            sl_price = float(np.percentile(mae_pool, args.sl_pctile)) * m["entry_atr"]
            tp_dist = float(np.percentile(mfe_pool, args.tp_pctile)) * m["entry_atr"]
            if sl_price > 0 and tp_dist > 0:
                bars = bars_by_pair[pair]
                a_entry = VariableEntry(idx=m["entry_idx"], direction=m["direction"],
                                        sl=sl_price, tp_dist=tp_dist)
                a_trade = race_trades_variable(bars, [a_entry], max_bars_ahead=args.max_bars_ahead,
                                               cost_price=m["cost_price"], min_bars_ahead=args.min_bars_ahead)
                bench_sl = args.bench_sl_pips * m["pip"]
                b_entry = Entry(idx=m["entry_idx"], direction=m["direction"])
                b_trade = race_trades(bars, [b_entry], sl=bench_sl, tp_r=args.bench_tp_r,
                                      max_bars_ahead=args.max_bars_ahead, cost_price=m["cost_price"],
                                      min_bars_ahead=args.min_bars_ahead)
                if a_trade and b_trade:
                    htf_ctx = htf_ctx_by_pair[pair]
                    size_mult = size_mult_for(m, htf_ctx, args)
                    cutoff_idx_htf = int(htf_ctx["htf_end"].searchsorted(m["confirm_time"], side="right")) - 1
                    lean = htf_lean_at(htf_ctx["confirmed"], cutoff_idx_htf, args.htf_lookback_bars)
                    bucket = "NONE" if lean is None else ("AGREE" if lean == m["direction"] else "CONFLICT")
                    rows.append(build_trade_row(m, a_trade[0], b_trade[0], size_mult, bucket,
                                                bars, account_risk_dollars, cutoff))
        # Pool updated AFTER sizing this motif — precedent for later motifs
        # only, same causal invariant as every parent script.
        mae_pool.append(m["mae_atr"])
        mfe_pool.append(m["mfe_atr"])
    return rows


def split_summary(trades: list[dict], key: str = "r") -> dict:
    return {
        "is": summarize_r(t[key] for t in trades if t["is_oos"] == "IS"),
        "oos": summarize_r(t[key] for t in trades if t["is_oos"] == "OOS"),
        "full": summarize_r(t[key] for t in trades),
    }


def portfolio_arm(trades: list[dict], key: str, size_mult_key: str | None,
                  risk_pct: float, max_concurrent_risk_pct: float) -> dict:
    """{pair, entry_date, exit_date, r, size_mult} view of the trade log for
    simulate_portfolio -- reads r from `key` and size_mult from
    `size_mult_key` (None -> forced 1.0), so the same trade rows drive all
    four 2x2 arms without four separate trade lists."""
    port_trades = [{"pair": t["pair"], "entry_date": pd.Timestamp(t["entry_date"]),
                    "exit_date": pd.Timestamp(t["exit_date"]),
                    "r": t[key], "size_mult": t[size_mult_key] if size_mult_key else 1.0} for t in trades]
    port = simulate_portfolio(port_trades, risk_pct, max_concurrent_risk_pct)
    stats = sharpe_and_dd(port["equity_curve"])
    corr = pairwise_correlation_summary(port_trades)
    return {"sharpe": stats["sharpe"], "max_dd": stats["max_dd"], "total_return": stats["total_return"],
            "avg_utilization": port["avg_utilization"], "avg_pairwise_corr": corr, "n": len(port_trades)}


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pairs", default=None)
    p.add_argument("--all-pairs", action="store_true")
    p.add_argument("--timeframe", default="1h")
    p.add_argument("--atr-period", type=int, default=14)
    p.add_argument("--pivot-n", type=int, default=DETECT_KW["pivot_n"])
    p.add_argument("--tol-atr-mult", type=float, default=DETECT_KW["tol_atr_mult"])
    p.add_argument("--min-retrace-atr-mult", type=float, default=DETECT_KW["min_retrace_atr_mult"])
    p.add_argument("--min-bars-between-touches", type=int, default=DETECT_KW["min_bars_between_touches"])
    p.add_argument("--breakout-max-bars", type=int, default=DETECT_KW["breakout_max_bars"])
    p.add_argument("--max-bars-ahead", type=int, default=200)
    p.add_argument("--min-bars-ahead", type=int, default=10)
    p.add_argument("--excursion-bars", type=int, default=40)
    p.add_argument("--sl-pctile", type=float, default=35.0)
    p.add_argument("--tp-pctile", type=float, default=35.0)
    p.add_argument("--min-pool", type=int, default=50)
    p.add_argument("--bench-sl-pips", type=float, default=20.0)
    p.add_argument("--bench-tp-r", type=float, default=1.5)
    p.add_argument("--htf", default="1D")
    p.add_argument("--htf-lookback-bars", type=int, default=20)
    p.add_argument("--conflict-size-mult", type=float, default=0.5)
    p.add_argument("--account-size", type=float, default=10000.0)
    p.add_argument("--risk-pct", type=float, default=0.01)
    p.add_argument("--max-concurrent-risk-pct", type=float, default=0.05)
    p.add_argument("--out", default=str(DATA_DIR / "motif_combined_backtest_export.json"))
    args = p.parse_args()

    frozen = dict(pivot_n=args.pivot_n, tol_atr_mult=args.tol_atr_mult,
                  min_retrace_atr_mult=args.min_retrace_atr_mult,
                  min_bars_between_touches=args.min_bars_between_touches,
                  breakout_max_bars=args.breakout_max_bars)
    if frozen != DETECT_KW:
        print(f"[warn] detector params {frozen} differ from the frozen DETECT_KW {DETECT_KW}")

    pairs = args.pairs.split(",") if args.pairs else (ALL_PAIRS if args.all_pairs else None)
    if not pairs:
        raise SystemExit("pass --pairs <a,b,c> or --all-pairs")

    print(f"[setup] {len(pairs)} pairs, adaptive ({args.sl_pctile:.0f},{args.tp_pctile:.0f}) + "
          f"HTF={args.htf} conflict_size_mult={args.conflict_size_mult}")
    rows = build_trade_log(pairs, args)
    if not rows:
        raise SystemExit("no trades generated")
    n_conflict = sum(1 for r in rows if r["size_mult"] < 1.0)
    print(f"\n[export] {len(rows)} motifs sized+dated, {n_conflict} ({n_conflict / len(rows):.1%}) "
          f"downsized on {args.htf} conflict")

    overall = split_summary(rows, "r")
    overall_bench = split_summary(rows, "bench_r")
    per_pair = [{"pair": pair, **split_summary([r for r in rows if r["pair"] == pair], "r")} for pair in pairs]

    portfolio = {
        "adaptive_htf_sized": portfolio_arm(rows, "r", "size_mult", args.risk_pct, args.max_concurrent_risk_pct),
        "adaptive_uniform": portfolio_arm(rows, "r", None, args.risk_pct, args.max_concurrent_risk_pct),
        "frozen_htf_sized": portfolio_arm(rows, "bench_r", "size_mult", args.risk_pct, args.max_concurrent_risk_pct),
        "frozen_uniform": portfolio_arm(rows, "bench_r", None, args.risk_pct, args.max_concurrent_risk_pct),
    }

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "params": {
            "sl_pctile": args.sl_pctile, "tp_pctile": args.tp_pctile, "min_pool": args.min_pool,
            "htf": args.htf, "htf_lookback_bars": args.htf_lookback_bars,
            "conflict_size_mult": args.conflict_size_mult,
            "bench_sl_pips": args.bench_sl_pips, "bench_tp_r": args.bench_tp_r,
            "timeframe": args.timeframe, "account_size": args.account_size, "risk_pct": args.risk_pct,
            "max_concurrent_risk_pct": args.max_concurrent_risk_pct,
            "is_oos_cutoff": IS_OOS_CUTOFF,
        },
        "caveat": (
            "Combined signal: adaptive per-category MAE/MFE SL/TP (validated (35,35)) stacked with "
            "HTF-conflict-aware position sizing (0.5x on 1D conflict). Full 26-pair portfolio result: "
            "the two mechanisms STACK (Sharpe 2.45, max DD -38.7%, beating either alone) -- see "
            "AnalogML/README.md. This export's per-trade 'r' is the combined signal; 'bench_r' is the "
            "SAME motif raced through the frozen sl=20p/tp_r=1.5 grid at uniform sizing, for comparison. "
            "IS/OOS split is a real calendar split on ALREADY-validated choices (both mechanisms' "
            "percentile/multiplier settings were chosen by inspecting full-history results, not a blind "
            "holdout) -- read as a stability check, not proof of forward performance. Mark-to-close "
            "portfolio sim, no live spread variation. Still not a validated go-live edge -- the entry "
            "signal itself has not been run through forge's null-control validation."
        ),
        "pairs": pairs,
        "summary": {**overall, "bench": overall_bench},
        "portfolio": portfolio,
        "per_pair": per_pair,
        "trades": rows,
    }

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w") as f:
        json.dump(out, f)
    print(f"\n[written] {len(rows)} trades, {len(pairs)} pairs -> {out_path}")
    print(f"[overall] IS n={overall['is']['n']} PF={overall['is']['profit_factor']:.2f}  "
          f"OOS n={overall['oos']['n']} PF={overall['oos']['profit_factor']:.2f}")
    print(f"[portfolio] ADAPTIVE+HTF-SIZED Sharpe={portfolio['adaptive_htf_sized']['sharpe']:.2f} "
          f"max_dd={portfolio['adaptive_htf_sized']['max_dd']:.1%}")


if __name__ == "__main__":
    main()
