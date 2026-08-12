#!/usr/bin/env python3
"""motif_walkforward.py — genuine multi-fold walk-forward validation for the
N-touches structural motif signal (`pylego/motif_touch.py`).

What existed before this script (`motif_scan.py` run with a single
`--eval-years`, and the README's "Calendar IS/OOS split" table) was ONE fixed
cutoff (2023-01-01): one pre-2023 block called "IS", one post-2023 block
called "OOS". That is a single train/test split, not a walk-forward — it
proves the edge survived one particular calendar boundary, not that it holds
up repeatedly across different market regimes/years. A method could pass a
single lucky split and still be fold-inconsistent underneath.

This script fixes that: it detects motifs on each pair's FULL history ONCE
(no lookahead risk either way — detect_touch_motifs is already causal, and
this method has no parameters fit to data, so there is nothing to "train" per
fold), then buckets confirmed-and-eligible motifs into consecutive CALENDAR
YEAR folds spanning the whole dataset (2017..2025 for the pairs with a decade
of M1 history; a pair with less history simply has fewer folds — reported,
not padded). Every fold is graded independently: n / win rate / profit
factor / avg R, signal vs the same mechanical both-directions baseline
`motif_scan.py` uses, WITH costs and WITHOUT (CLAUDE.md: "costs and a true
OOS split are non-negotiable" -- and per the explicit ask, cost-on vs
cost-off must be stated side by side, not just implied by "costs are on by
default").

A signal that is real should look like SEVERAL consistent positive folds,
not one big block. A signal that decays or flips sign in most individual
years despite a positive pooled 2-block number is the overfitting/lucky-split
signature this script exists to catch.

Usage:
  python AnalogML/motif_walkforward.py --pair gbpjpy
  python AnalogML/motif_walkforward.py --all-pairs
  python AnalogML/motif_walkforward.py --all-pairs --fold-months 6
"""
from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from pattern_scan import load_bars  # noqa: E402
from portfolio_sim import ALL_PAIRS  # noqa: E402

from pylego.barrier_race import Entry, race_trades  # noqa: E402
from pylego.costs import default_spread  # noqa: E402
from pylego.instruments import pip_size  # noqa: E402
from pylego.motif_touch import detect_touch_motifs  # noqa: E402
from pylego.swing_structure import atr as compute_atr  # noqa: E402
from pylego.trade_stats import summarize_r  # noqa: E402


def build_folds(bars: pd.DataFrame, fold_months: int) -> list[tuple[pd.Timestamp, pd.Timestamp, str]]:
    """Consecutive, non-overlapping calendar folds spanning the bar range,
    aligned to calendar-year/half-year/quarter boundaries (not "N months back
    from the end") so folds are the same real-world periods regardless of a
    pair's exact last-bar timestamp -- comparable across pairs."""
    start = bars.index[0].tz_localize(None) if bars.index[0].tzinfo else bars.index[0]
    end = bars.index[-1].tz_localize(None) if bars.index[-1].tzinfo else bars.index[-1]
    first_edge = pd.Timestamp(year=start.year, month=1, day=1)
    edges = list(pd.date_range(first_edge, end + pd.DateOffset(months=fold_months),
                               freq=f"{fold_months}MS"))
    folds = []
    for a, b in zip(edges[:-1], edges[1:]):
        if b <= start or a >= end:
            continue
        label = str(a.year) if fold_months == 12 else f"{a.year}-{a.month:02d}"
        folds.append((a, b, label))
    return folds


def _summarize(bars: pd.DataFrame, entries: list[Entry], sl_price: float, tp_r: float,
              max_bars_ahead: int, min_bars_ahead: int, cost_price: float) -> dict | None:
    if not entries:
        return None
    trades = race_trades(bars, entries, sl=sl_price, tp_r=tp_r, max_bars_ahead=max_bars_ahead,
                         cost_price=cost_price, min_bars_ahead=min_bars_ahead)
    if not trades:
        return None
    return summarize_r(t["r"] for t in trades)


def scan_pair(pair: str, args: argparse.Namespace, verbose: bool = True) -> dict:
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

    folds = build_folds(bars, args.fold_months)
    pip = pip_size(pair)
    sl_price = args.sl_pips * pip
    cost_price = default_spread(pair)

    fold_rows = []
    tz = bars.index.tz
    for fold_start, fold_end, label in folds:
        fs = fold_start.tz_localize(tz) if tz is not None else fold_start
        fe = fold_end.tz_localize(tz) if tz is not None else fold_end
        fold_motifs = [m for m in eligible if fs <= bars.index[m.confirm_idx] < fe]
        signal_entries = [Entry(idx=m.confirm_idx + 1, direction=m.direction) for m in fold_motifs]
        baseline_entries = []
        for m in fold_motifs:
            baseline_entries.append(Entry(idx=m.confirm_idx + 1, direction=1))
            baseline_entries.append(Entry(idx=m.confirm_idx + 1, direction=-1))

        sig_on = _summarize(bars, signal_entries, sl_price, args.tp_r, args.max_bars_ahead,
                            args.min_bars_ahead, cost_price)
        sig_off = _summarize(bars, signal_entries, sl_price, args.tp_r, args.max_bars_ahead,
                             args.min_bars_ahead, 0.0)
        base_on = _summarize(bars, baseline_entries, sl_price, args.tp_r, args.max_bars_ahead,
                             args.min_bars_ahead, cost_price)
        fold_rows.append({"pair": pair, "fold": label, "n": len(fold_motifs),
                          "signal_on": sig_on, "signal_off": sig_off, "baseline_on": base_on})

    if verbose:
        print(f"\n[{pair}] {len(eligible)} eligible motifs across {len(folds)} folds "
              f"({folds[0][2] if folds else '—'}..{folds[-1][2] if folds else '—'})")
        print(f"  {'fold':>8}  {'n':>5}  {'sig PF (cost on)':>17}  {'sig PF (no cost)':>17}  "
              f"{'sig avgR':>9}  {'base PF':>8}")
        for r in fold_rows:
            son, soff, bon = r["signal_on"], r["signal_off"], r["baseline_on"]
            son_pf = f"{son['profit_factor']:.2f}" if son else "—"
            soff_pf = f"{soff['profit_factor']:.2f}" if soff else "—"
            son_ar = f"{son['avg_r']:+.3f}" if son else "—"
            bon_pf = f"{bon['profit_factor']:.2f}" if bon else "—"
            print(f"  {r['fold']:>8}  {r['n']:>5}  {son_pf:>17}  {soff_pf:>17}  {son_ar:>9}  {bon_pf:>8}")

    return {"pair": pair, "folds": fold_rows}


def pooled_scan(pairs: list[str], args: argparse.Namespace) -> None:
    """Second pass: pools every pair's per-trade R values (not summary stats)
    within each fold so the headline table is a genuine pooled PF per fold,
    not an average-of-averages."""
    pooled_on: dict[str, list[float]] = defaultdict(list)
    pooled_off: dict[str, list[float]] = defaultdict(list)
    pooled_base: dict[str, list[float]] = defaultdict(list)
    per_pair_last_fold: dict[str, dict | None] = {}

    for pair in pairs:
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
        folds = build_folds(bars, args.fold_months)
        pip = pip_size(pair)
        sl_price = args.sl_pips * pip
        cost_price = default_spread(pair)
        tz = bars.index.tz

        last_fold_r = None
        for fold_start, fold_end, label in folds:
            fs = fold_start.tz_localize(tz) if tz is not None else fold_start
            fe = fold_end.tz_localize(tz) if tz is not None else fold_end
            fold_motifs = [m for m in eligible if fs <= bars.index[m.confirm_idx] < fe]
            signal_entries = [Entry(idx=m.confirm_idx + 1, direction=m.direction) for m in fold_motifs]
            baseline_entries = []
            for m in fold_motifs:
                baseline_entries.append(Entry(idx=m.confirm_idx + 1, direction=1))
                baseline_entries.append(Entry(idx=m.confirm_idx + 1, direction=-1))

            t_on = race_trades(bars, signal_entries, sl=sl_price, tp_r=args.tp_r,
                               max_bars_ahead=args.max_bars_ahead, cost_price=cost_price,
                               min_bars_ahead=args.min_bars_ahead)
            t_off = race_trades(bars, signal_entries, sl=sl_price, tp_r=args.tp_r,
                                max_bars_ahead=args.max_bars_ahead, cost_price=0.0,
                                min_bars_ahead=args.min_bars_ahead)
            t_base = race_trades(bars, baseline_entries, sl=sl_price, tp_r=args.tp_r,
                                 max_bars_ahead=args.max_bars_ahead, cost_price=cost_price,
                                 min_bars_ahead=args.min_bars_ahead)
            pooled_on[label].extend(t["r"] for t in t_on)
            pooled_off[label].extend(t["r"] for t in t_off)
            pooled_base[label].extend(t["r"] for t in t_base)
            if t_on:
                last_fold_r = (label, summarize_r(t["r"] for t in t_on))
        per_pair_last_fold[pair] = last_fold_r

    print(f"\n{'='*90}\nPOOLED ACROSS {len(pairs)} PAIRS, PER CALENDAR FOLD "
          f"(sl={args.sl_pips}p, tp_r={args.tp_r})\n{'='*90}")
    print(f"  {'fold':>8}  {'n':>6}  {'sig PF (cost on)':>17}  {'sig PF (no cost)':>17}  "
          f"{'sig avgR':>9}  {'sig WR':>7}  {'base PF':>8}")
    labels = sorted(pooled_on.keys())
    n_folds_pf_gt1, n_folds_beats_base = 0, 0
    n_folds_total = 0
    for label in labels:
        rs_on, rs_off, rs_base = pooled_on[label], pooled_off[label], pooled_base[label]
        if not rs_on:
            continue
        n_folds_total += 1
        s_on = summarize_r(rs_on)
        s_off = summarize_r(rs_off) if rs_off else None
        s_base = summarize_r(rs_base) if rs_base else None
        if s_on["profit_factor"] > 1.0:
            n_folds_pf_gt1 += 1
        if s_base and s_on["profit_factor"] > s_base["profit_factor"]:
            n_folds_beats_base += 1
        off_pf = f"{s_off['profit_factor']:.2f}" if s_off else "—"
        base_pf = f"{s_base['profit_factor']:.2f}" if s_base else "—"
        print(f"  {label:>8}  {s_on['n']:>6}  {s_on['profit_factor']:>17.2f}  {off_pf:>17}  "
              f"{s_on['avg_r']:>+9.3f}  {s_on['win_rate']:>6.1%}  {base_pf:>8}")

    print(f"\n[fold consistency] {n_folds_pf_gt1}/{n_folds_total} folds PF>1.0 (cost on), "
          f"{n_folds_beats_base}/{n_folds_total} folds beat the mechanical baseline")
    print("[this is the number that matters, not the single-split headline] -- a real, "
          "non-overfit signal should clear most/all folds, not just win pooled across two "
          "big blocks that could hide a few dominant years.")

    all_on = [r for rs in pooled_on.values() for r in rs]
    all_off = [r for rs in pooled_off.values() for r in rs]
    all_base = [r for rs in pooled_base.values() for r in rs]
    if all_on:
        s_on, s_off = summarize_r(all_on), summarize_r(all_off) if all_off else None
        s_base = summarize_r(all_base) if all_base else None
        print(f"\n[explicit cost sensitivity, ALL folds pooled] "
              f"n={s_on['n']}  PF cost-ON={s_on['profit_factor']:.3f}  "
              f"PF cost-OFF={s_off['profit_factor']:.3f}  "
              f"(cost removes {s_off['profit_factor'] - s_on['profit_factor']:.3f} PF, "
              f"avgR {s_on['avg_r']:+.3f} -> {s_off['avg_r']:+.3f})  "
              f"vs baseline PF={s_base['profit_factor']:.3f}" if s_off and s_base else "")

    print(f"\n{'='*90}\nMOST RECENT FOLD PER PAIR (cost on) -- which pairs are negative "
          f"RIGHT NOW vs which were only negative pooled-over-history\n{'='*90}")
    for pair, res in per_pair_last_fold.items():
        if res is None:
            print(f"  {pair:<8}  (no trades in most recent fold)")
            continue
        label, s = res
        print(f"  {pair:<8}  {label:>8}  n={s['n']:>4}  PF={s['profit_factor']:>5.2f}  "
              f"avgR={s['avg_r']:>+6.3f}  WR={s['win_rate']:>5.1%}")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pair", default=None)
    p.add_argument("--all-pairs", action="store_true")
    p.add_argument("--timeframe", default="1h")
    p.add_argument("--fold-months", type=int, default=12, help="fold length in months (12=yearly)")
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
    return p


def main() -> None:
    args = build_parser().parse_args()
    if args.all_pairs:
        pooled_scan(ALL_PAIRS, args)
    elif args.pair:
        scan_pair(args.pair, args)
        pooled_scan([args.pair], args)
    else:
        raise SystemExit("pass --pair <pair> or --all-pairs")


if __name__ == "__main__":
    main()
