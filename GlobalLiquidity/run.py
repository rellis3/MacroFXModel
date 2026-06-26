"""
GlobalLiquidity — CLI.

    python -m GlobalLiquidity.run              # current state + backtest (auto source)
    python -m GlobalLiquidity.run --synthetic  # force offline synthetic data
    python -m GlobalLiquidity.run --wf         # also run walk-forward validation
    python -m GlobalLiquidity.run --json       # machine-readable output

Prints: today's Global Liquidity reading, the regime + risk gate, the target FX
book, and backtest stats (Sharpe, drawdown, est. trades/week, walk-forward).
"""

from __future__ import annotations

import sys
import json
import logging

from . import data, backtest


def _fmt_book(book):
    rows = []
    for pair, w in book:
        side = "LONG " if w > 0 else "SHORT"
        rows.append(f"    {side} {pair:8s} {w:+.3f}")
    return "\n".join(rows) if rows else "    (flat)"


def main(argv=None):
    argv = argv or sys.argv[1:]
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(message)s")

    force_synth = "--synthetic" in argv
    do_wf = "--wf" in argv
    as_json = "--json" in argv

    ds = data.load_synthetic() if force_synth else data.load()
    stats, detail = backtest.run_backtest(ds)
    wf = backtest.walk_forward(ds) if do_wf else None

    if as_json:
        out = {"stats": stats.__dict__, "latest_gli": detail["latest_gli"],
               "latest_regime": detail["latest_regime"],
               "latest_book": detail["latest_book"],
               "regime_counts": detail["regime_counts"],
               "synthetic": detail["synthetic"]}
        if wf:
            out["walk_forward"] = {k: v for k, v in wf.items() if k != "detail"}
        print(json.dumps(out, indent=2))
        return

    src = "SYNTHETIC (offline)" if detail["synthetic"] else "LIVE (FRED)"
    g = detail["latest_gli"]
    r = detail["latest_regime"]

    print("=" * 64)
    print(f"  GLOBAL LIQUIDITY MACRO FX SYSTEM   —   data source: {src}")
    print("=" * 64)
    print(f"\n  As of {g['date']}")
    print(f"  Global Liquidity level (z) : {g['gli_level_z']}")
    print(f"  Liquidity IMPULSE (z)      : {g['gli_impulse_z']}   <- the timing signal")
    print(f"  Cycle position (0=trough)  : {g['cycle_position']}")
    print(f"\n  REGIME                     : {r['regime']}")
    print(f"  Risk tilt (-1..+1)         : {r['risk_tilt']}")
    print(f"  Conviction (0..1)          : {r['conviction']}")
    print(f"  Risk gate tripped          : {r['gate_tripped']}  (gross x{r['gross_mult']})")

    print("\n  Per-currency liquidity impulse (z):")
    for k, v in g["per_ccy_impulse"].items():
        print(f"    {k}: {v}")

    print("\n  TARGET FX BOOK (gross-normalised x leverage):")
    print(_fmt_book(detail["latest_book"]))

    s = stats
    print("\n" + "-" * 64)
    print("  BACKTEST (net of costs)")
    print("-" * 64)
    print(f"  Weeks               : {s.weeks}")
    print(f"  Sharpe              : {s.sharpe}")
    print(f"  Ann. return         : {s.ann_return:.1%}")
    print(f"  Ann. vol            : {s.ann_vol:.1%}  (target 10%)")
    print(f"  Max drawdown        : {s.max_drawdown:.1%}")
    print(f"  Hit rate (weeks)    : {s.hit_rate:.1%}")
    print(f"  Avg gross leverage  : {s.avg_gross}x")
    print(f"  Est. trades / week  : {s.est_trades_per_week}   <- by design ~1-3")
    print(f"  Cost drag (total)   : {s.total_cost_drag:.1%}")
    print(f"  Regime weeks        : {detail['regime_counts']}")
    print(f"  Risk-gate weeks     : {detail['gate_weeks']}")

    if wf:
        print("\n" + "-" * 64)
        print("  WALK-FORWARD VALIDATION")
        print("-" * 64)
        print(f"  Windows             : {wf['windows']}")
        print(f"  IS Sharpe (mean)    : {wf['is_sharpe_mean']}")
        print(f"  OOS Sharpe (mean)   : {wf['oos_sharpe_mean']}")
        print(f"  WFE (OOS/IS)        : {wf['wfe']}   (target >= 0.5)")
        print(f"  OOS windows positive: {wf['oos_positive_share']:.0%}")

    if detail["synthetic"]:
        print("\n  NOTE: synthetic data — numbers validate the PIPELINE, not real edge.")
        print("        Set FRED_API_KEY and attach real FX returns for live signal.")


if __name__ == "__main__":
    main()
