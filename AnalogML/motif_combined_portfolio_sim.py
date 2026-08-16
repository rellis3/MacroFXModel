#!/usr/bin/env python3
"""motif_combined_portfolio_sim.py — the deliberately-deferred combination
test: adaptive per-category MAE/MFE SL/TP (`motif_adaptive.py`, validated at
(35,35)) STACKED WITH HTF-conflict-aware position sizing
(`motif_htf_sized.py`, validated at 0.5x on 1D conflict), as one portfolio.

Both parents were validated in isolation on the same frozen entry signal —
deliberately not combined at the time so neither result confounded the
other (see motif_htf_sized.py's docstring). Each independently improved the
portfolio:
  adaptive (35,35) vs frozen grid ... Sharpe 2.31 vs 1.58, max DD -41.8% vs
                                      -54.5% at matched utilization
  HTF-sized vs uniform (frozen grid). Sharpe 1.80 vs 1.61, max DD -42.9% vs
                                      -55.1%
This answers the question both left open: do the two gains coexist, or does
one absorb the other? Independent mechanisms (one changes the exit geometry
per category, the other scales risk on an orthogonal 1D read), so they
COULD stack — but "could" has been wrong 4 times in this build, hence the
test.

This is a pure COMPOSITION layer — it imports both parents' pipelines and
changes NEITHER:
  * `motif_adaptive.collect_pair_motifs` — the causal MAE/MFE material,
    verbatim.
  * The same global-timeline expanding-pool sizing as
    `motif_adaptive_portfolio_sim.build_dated_trades` (same-category
    precedent strictly before T, min-pool skip, pool updated after sizing).
  * `motif_multi_tf.htf_lean_at` + the same closed-HTF-bar cutoff as
    `motif_htf_sized.build_pair_trades` — the causal 1D-conflict read,
    imported, not re-implemented.
  * `pylego`-shared `simulate_portfolio` / `race_trades(_variable)` — the
    same account simulator and barrier walker as every other check.

Full 2x2 on the SAME motif set (only motifs with an adaptive size available
and both races resolved — identical trade list on every arm, so every delta
isolates exactly one mechanism):
  FROZEN + UNIFORM      the baseline signal (note: this arm covers the
                        min-pool-eligible subset, so it will not exactly
                        reproduce motif_portfolio_sim.py's full-set numbers)
  FROZEN + HTF-SIZED    reproduces motif_htf_sized.py's mechanism on this set
  ADAPTIVE + UNIFORM    reproduces motif_adaptive_portfolio_sim.py's mechanism
  ADAPTIVE + HTF-SIZED  the combination under test

Usage:
  python AnalogML/motif_combined_portfolio_sim.py --all-pairs --risk-pct 0.01
"""
from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from motif_adaptive import collect_pair_motifs  # noqa: E402
from motif_multi_tf import DETECT_KW, htf_lean_at  # noqa: E402
from pattern_scan import load_bars  # noqa: E402
from portfolio_sim import (  # noqa: E402
    ALL_PAIRS,
    pairwise_correlation_summary,
    sharpe_and_dd,
    simulate_portfolio,
)

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from pylego.barrier_race import Entry, VariableEntry, race_trades, race_trades_variable  # noqa: E402
from pylego.motif_touch import detect_touch_motifs  # noqa: E402
from pylego.swing_structure import atr as compute_atr  # noqa: E402


def build_htf_ctx(pair: str, args: argparse.Namespace) -> dict:
    """The causal 1D read for one pair — same construction as
    motif_htf_sized.build_pair_trades: detector with the SAME frozen params
    on resampled HTF bars, and each HTF bar only knowable from its END
    (start + bar_duration), never its start label."""
    htf_bars = load_bars(pair, args.htf)
    bar_duration = htf_bars.index[1] - htf_bars.index[0]
    htf_atr = compute_atr(htf_bars, period=args.atr_period)
    htf_motifs = detect_touch_motifs(htf_bars, htf_atr, **DETECT_KW)
    confirmed = sorted(
        [(m.confirm_idx, m.direction) for m in htf_motifs if m.confirm_idx is not None],
        key=lambda c: c[0])
    return {"htf_end": htf_bars.index + bar_duration, "confirmed": confirmed}


def size_mult_for(motif: dict, ctx: dict, args: argparse.Namespace) -> float:
    """0.5x on a knowable-by-entry 1D conflict, 1.0 otherwise — never sized
    UP on agreement (motif_multi_tf.py only validated the conflict-side
    drag; see motif_htf_sized.py)."""
    cutoff_idx_htf = int(ctx["htf_end"].searchsorted(motif["confirm_time"], side="right")) - 1
    lean = htf_lean_at(ctx["confirmed"], cutoff_idx_htf, args.htf_lookback_bars)
    if lean is not None and lean != motif["direction"]:
        return args.conflict_size_mult
    return 1.0


def build_dated_trades(all_motifs: list[dict], bars_by_pair: dict[str, pd.DataFrame],
                       htf_ctx_by_pair: dict[str, dict], args: argparse.Namespace):
    """Same causal global-timeline sizing as
    motif_adaptive_portfolio_sim.build_dated_trades, with ONE addition: each
    emitted trade (both the adaptive and the frozen-grid race of the same
    motif) carries the HTF-conflict size_mult. Returns (adaptive_trades,
    frozen_trades, n_skipped)."""
    all_motifs = sorted(all_motifs, key=lambda m: m["confirm_time"])
    pool: dict[tuple, list[float]] = defaultdict(list)
    pool_mfe: dict[tuple, list[float]] = defaultdict(list)
    adaptive_trades: list[dict] = []
    frozen_trades: list[dict] = []
    n_skipped = 0

    for m in all_motifs:
        cat = m["category"]
        mae_pool, mfe_pool = pool[cat], pool_mfe[cat]
        if len(mae_pool) < args.min_pool:
            n_skipped += 1
        else:
            sl_atr_mult = float(np.percentile(mae_pool, args.sl_pctile))
            tp_atr_mult = float(np.percentile(mfe_pool, args.tp_pctile))
            sl_price = sl_atr_mult * m["entry_atr"]
            tp_dist = tp_atr_mult * m["entry_atr"]
            if sl_price > 0 and tp_dist > 0:
                bars = bars_by_pair[m["pair"]]
                a_entry = VariableEntry(idx=m["entry_idx"], direction=m["direction"],
                                        sl=sl_price, tp_dist=tp_dist)
                a_trade = race_trades_variable(bars, [a_entry], max_bars_ahead=args.max_bars_ahead,
                                               cost_price=m["cost_price"],
                                               min_bars_ahead=args.min_bars_ahead)
                bench_sl = args.bench_sl_pips * m["pip"]
                b_entry = Entry(idx=m["entry_idx"], direction=m["direction"])
                b_trade = race_trades(bars, [b_entry], sl=bench_sl, tp_r=args.bench_tp_r,
                                      max_bars_ahead=args.max_bars_ahead, cost_price=m["cost_price"],
                                      min_bars_ahead=args.min_bars_ahead)
                if a_trade and b_trade:
                    size_mult = size_mult_for(m, htf_ctx_by_pair[m["pair"]], args)
                    at, bt = a_trade[0], b_trade[0]
                    adaptive_trades.append({
                        "pair": m["pair"], "entry_date": bars.index[at["idx"]],
                        "exit_date": bars.index[at["exit_idx"]], "r": at["r"],
                        "size_mult": size_mult})
                    frozen_trades.append({
                        "pair": m["pair"], "entry_date": bars.index[bt["idx"]],
                        "exit_date": bars.index[bt["exit_idx"]], "r": bt["r"],
                        "size_mult": size_mult})
        # Pool updated AFTER sizing this motif — precedent for later motifs
        # only, never for itself (same invariant as both parents).
        mae_pool.append(m["mae_atr"])
        mfe_pool.append(m["mfe_atr"])
    return adaptive_trades, frozen_trades, n_skipped


def _report_one(label: str, trades: list[dict], args: argparse.Namespace) -> dict:
    port = simulate_portfolio(trades, args.risk_pct, args.max_concurrent_risk_pct)
    stats = sharpe_and_dd(port["equity_curve"])
    corr = pairwise_correlation_summary(trades)
    print(f"\n== {label} == n={len(trades)}")
    print(f"  taken={port['taken']}  skipped(risk cap)={port['skipped']}  "
          f"total_return={stats['total_return']:.1%}  max_dd={stats['max_dd']:.1%}  "
          f"Sharpe={stats['sharpe']:.2f}  avg_utilization={port['avg_utilization']:.1%}")
    if corr is not None:
        print(f"  avg pairwise weekly-return correlation: {corr:+.3f}")
    return {"port": port, "stats": stats}


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pairs", default=None)
    p.add_argument("--all-pairs", action="store_true")
    p.add_argument("--timeframe", default="1h")
    # Detector params — collect_pair_motifs reads these from args; defaults
    # MUST equal motif_multi_tf.DETECT_KW (asserted below) so the H1 and HTF
    # detections stay on the same frozen params as both parents.
    p.add_argument("--atr-period", type=int, default=14)
    p.add_argument("--pivot-n", type=int, default=5)
    p.add_argument("--tol-atr-mult", type=float, default=1.2)
    p.add_argument("--min-retrace-atr-mult", type=float, default=2.5)
    p.add_argument("--min-bars-between-touches", type=int, default=10)
    p.add_argument("--breakout-max-bars", type=int, default=40)
    p.add_argument("--max-bars-ahead", type=int, default=200)
    p.add_argument("--min-bars-ahead", type=int, default=10)
    # Adaptive-layer params (motif_adaptive.py's validated defaults)
    p.add_argument("--excursion-bars", type=int, default=40)
    p.add_argument("--sl-pctile", type=float, default=35.0)
    p.add_argument("--tp-pctile", type=float, default=35.0)
    p.add_argument("--min-pool", type=int, default=50)
    p.add_argument("--bench-sl-pips", type=float, default=20.0)
    p.add_argument("--bench-tp-r", type=float, default=1.5)
    # HTF-sizing-layer params (motif_htf_sized.py's validated defaults)
    p.add_argument("--htf", default="1D")
    p.add_argument("--htf-lookback-bars", type=int, default=20)
    p.add_argument("--conflict-size-mult", type=float, default=0.5)
    # Portfolio params
    p.add_argument("--risk-pct", type=float, default=0.01)
    p.add_argument("--max-concurrent-risk-pct", type=float, default=0.05)
    args = p.parse_args()

    frozen = dict(pivot_n=args.pivot_n, tol_atr_mult=args.tol_atr_mult,
                  min_retrace_atr_mult=args.min_retrace_atr_mult,
                  min_bars_between_touches=args.min_bars_between_touches,
                  breakout_max_bars=args.breakout_max_bars)
    if frozen != DETECT_KW:
        print(f"[warn] detector params {frozen} differ from the frozen DETECT_KW {DETECT_KW} — "
              f"this is no longer the validated-parents comparison")

    pairs = args.pairs.split(",") if args.pairs else (ALL_PAIRS if args.all_pairs else None)
    if not pairs:
        raise SystemExit("pass --pairs <a,b,c> or --all-pairs")

    print(f"[setup] {len(pairs)} pairs, adaptive ({args.sl_pctile:.0f},{args.tp_pctile:.0f}) + "
          f"HTF={args.htf} conflict_size_mult={args.conflict_size_mult}, "
          f"risk={args.risk_pct:.2%}/trade")
    all_motifs: list[dict] = []
    bars_by_pair: dict[str, pd.DataFrame] = {}
    htf_ctx_by_pair: dict[str, dict] = {}
    for pair in pairs:
        bars_by_pair[pair] = load_bars(pair, args.timeframe)
        htf_ctx_by_pair[pair] = build_htf_ctx(pair, args)
        m = collect_pair_motifs(pair, args)
        all_motifs.extend(m)
        print(f"  {pair:<8} {len(m):>5} eligible motifs, "
              f"{len(htf_ctx_by_pair[pair]['confirmed']):>4} confirmed {args.htf} motifs")

    adaptive_trades, frozen_trades, n_skipped = build_dated_trades(
        all_motifs, bars_by_pair, htf_ctx_by_pair, args)
    if not adaptive_trades:
        raise SystemExit("no trades generated")
    n_conflict = sum(1 for t in adaptive_trades if t["size_mult"] < 1.0)
    print(f"\n[sizing] {len(adaptive_trades)} motifs sized+dated (SAME set on all four arms), "
          f"{n_skipped} skipped (category below {args.min_pool} precedents), "
          f"{n_conflict} ({n_conflict / len(adaptive_trades):.1%}) downsized on {args.htf} conflict")

    uniform = {"size_mult": 1.0}
    arms = [
        ("FROZEN + UNIFORM (baseline)", [{**t, **uniform} for t in frozen_trades]),
        ("FROZEN + HTF-SIZED", frozen_trades),
        ("ADAPTIVE + UNIFORM", [{**t, **uniform} for t in adaptive_trades]),
        ("ADAPTIVE + HTF-SIZED (the combination)", adaptive_trades),
    ]
    results = {}
    for label, trades in arms:
        results[label] = _report_one(label, trades, args)

    print(f"\n{'=' * 100}\n2x2 SUMMARY — same {len(adaptive_trades)} trades on every arm\n{'=' * 100}")
    print(f"  {'arm':<42}  {'Sharpe':>7}  {'max DD':>8}  {'total ret':>10}  {'util':>6}")
    for label, _ in arms:
        r = results[label]
        print(f"  {label:<42}  {r['stats']['sharpe']:>7.2f}  {r['stats']['max_dd']:>8.1%}  "
              f"{r['stats']['total_return']:>10.1%}  {r['port']['avg_utilization']:>6.1%}")

    combo = results["ADAPTIVE + HTF-SIZED (the combination)"]["stats"]
    best_single = max(
        (results["ADAPTIVE + UNIFORM"]["stats"], results["FROZEN + HTF-SIZED"]["stats"]),
        key=lambda s: s["sharpe"])
    if combo["sharpe"] > best_single["sharpe"] and combo["max_dd"] > best_single["max_dd"]:
        verdict = "the gains STACK — combination beats the best single mechanism on Sharpe AND max DD"
    elif combo["sharpe"] > best_single["sharpe"]:
        verdict = "partial stack — combination wins on Sharpe but not max DD vs the best single mechanism"
    elif combo["max_dd"] > best_single["max_dd"]:
        verdict = "partial stack — combination wins on max DD but not Sharpe vs the best single mechanism"
    else:
        verdict = "NO stack — one mechanism absorbs the other; prefer the simpler single-mechanism arm"
    print(f"\n  [read] {verdict}")

    print("\n[caveat] Same-set discipline means the FROZEN+UNIFORM arm covers only the min-pool-eligible "
          "subset — it will not exactly reproduce motif_portfolio_sim.py's full-set Sharpe 1.61, and the "
          "parents' headline numbers quoted in the docstring came from their own (larger) trade sets. "
          "Deltas WITHIN this table are the comparison that means anything. Same mark-to-close, fixed "
          "risk-%% sizing, no live spread variation as every portfolio_sim.py caller. This tests whether "
          "two separately-validated mechanisms coexist — it does not re-validate either mechanism, and "
          "small-sample reads have been overturned at 26-pair scale 4 times in this build: run --all-pairs "
          "before believing anything.")


if __name__ == "__main__":
    main()
