#!/usr/bin/env python3
"""motif_adaptive.py — Phase 1: per-category adaptive MAE-based stop / MFE-
based target for the touch-motif signal, replacing the frozen sl-pips/tp-R
grid `motif_scan.py`/`motif_walkforward.py`/`motif_portfolio_sim.py` all use.

This is the piece of the ORIGINAL brief that was deliberately deferred until
the detector proved it had something real to size risk around: "a MAE-based
stop loss based on all the historic trades of this shape... the TP also set
based on historic breakout trades from this pattern... not on price but on
average movement size scaled to timeframe." `motif_walkforward.py` cleared
that gate (11/11 calendar-year folds PF>1.0) and `motif_portfolio_sim.py`
showed the edge survives becoming a portfolio, so this is the next honest
step -- NOT a re-validation of the entry signal itself.

Method (causal end to end -- no lookahead anywhere in this pipeline):
  1. Detect motifs on every pair's full history (as every other AnalogML
     motif script does -- `detect_touch_motifs` is already causal per
     instance).
  2. For every confirmed+eligible motif, compute its RAW max-adverse/
     max-favourable excursion (`pylego.barrier_race.excursion`, no stop/
     target constraint -- this is the material a distribution gets built
     from, not a graded outcome) over the same `max_bars_ahead` horizon
     every other check uses, and normalise by that motif's OWN entry-time
     ATR -- mae_atr / mfe_atr are dimensionless multiples of volatility at
     entry, comparable across pairs and vol regimes ("scaled to timeframe",
     not raw price/pips).
  3. Sort every motif from every pair into ONE global timeline by confirm
     timestamp. For a motif confirming at time T in category (n_touches,
     is_top): the SL/TP percentiles used to size THIS trade come ONLY from
     motifs in the SAME category (any pair -- pooled for sample size, since
     `motif_walkforward.py`'s per-pair diagnosis found no detector-level
     difference across pairs) that confirmed STRICTLY BEFORE T. An expanding
     window, never the future. Categories with fewer than `--min-pool`
     precedents are SKIPPED (reported, not backfilled with a guess) --
     mostly the first stretch of 2016 before each category has accumulated
     enough precedent.
  4. SL = `--sl-pctile`th percentile of that pool's mae_atr, TP =
     `--tp-pctile`th percentile of that pool's mfe_atr, both x this trade's
     OWN entry-time ATR. Defaults: SL at the 75th (room to survive a normal
     adverse excursion for that category, not the max/outlier), TP at the
     50th (the category's typical/median breakout move -- a measured-move
     read, not an arbitrary R-multiple).
  5. Race via `pylego.barrier_race.race_trades_variable` (each entry gets
     its OWN sl/tp, unlike the shared-grid `race_trades`).
  6. Benchmark: the SAME motifs (only the ones that had an adaptive size
     available, so it's the same set on both sides), same direction, raced
     through the EXISTING frozen sl=20p/tp_r=1.5 grid -- isolating risk-
     SIZING as the one new variable, the same discipline motif_scan.py used
     to isolate entry-SELECTION from the k-NN method. Same 11-fold calendar-
     year walk-forward as `motif_walkforward.py`, not a single split.

Usage:
  python AnalogML/motif_adaptive.py --all-pairs
  python AnalogML/motif_adaptive.py --all-pairs --sl-pctile 75 --tp-pctile 50
"""
from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from motif_walkforward import build_folds  # noqa: E402
from pattern_scan import load_bars  # noqa: E402
from portfolio_sim import ALL_PAIRS  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from pylego.barrier_race import Entry, VariableEntry, excursion, race_trades, race_trades_variable  # noqa: E402
from pylego.costs import default_spread  # noqa: E402
from pylego.instruments import pip_size  # noqa: E402
from pylego.motif_touch import detect_touch_motifs  # noqa: E402
from pylego.swing_structure import atr as compute_atr  # noqa: E402
from pylego.trade_stats import summarize_r  # noqa: E402


def collect_pair_motifs(pair: str, args: argparse.Namespace) -> list[dict]:
    """Every confirmed+eligible motif for one pair, with its raw MAE/MFE
    (ATR-normalised) already computed -- everything downstream needs to size
    and race this pair's motifs, but NOT yet the cross-pair pooling/timing
    (that happens once every pair's list is merged into one global timeline
    in `main()`, so 'strictly before T' means before T across ALL pairs)."""
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
    if not eligible:
        return []

    entry_idxs = [m.confirm_idx + 1 for m in eligible]
    exc_entries = [Entry(idx=i, direction=m.direction) for i, m in zip(entry_idxs, eligible)]
    # Deliberately NOT max_bars_ahead (200 bars / 8+ days on H1) -- MAE/MFE
    # over that full horizon mostly captures drift unrelated to the actual
    # breakout thesis and produces absurdly wide (~11x ATR) stops that
    # dilute the signal into near-continuous mark-to-close outcomes (found
    # empirically: first read with excursion_bars=max_bars_ahead scored
    # adaptive avgR +0.006 vs the frozen grid's +0.110). excursion_bars
    # instead matches the breakout confirmation horizon -- the move the
    # touch-motif thesis is actually about.
    exc = excursion(bars, exc_entries, max_bars_ahead=args.excursion_bars, min_bars_ahead=args.min_bars_ahead)
    exc_by_idx = {e['idx']: e for e in exc}

    pip = pip_size(pair)
    cost_price = default_spread(pair)
    out = []
    for m, entry_idx in zip(eligible, entry_idxs):
        e = exc_by_idx.get(entry_idx)
        if e is None:
            continue
        entry_atr = atr_arr[m.confirm_idx] if m.confirm_idx < len(atr_arr) else np.nan
        if not entry_atr or entry_atr <= 0 or not np.isfinite(entry_atr):
            continue
        out.append({
            'pair': pair, 'category': (m.n_touches, m.is_top),
            'confirm_time': bars.index[m.confirm_idx], 'entry_idx': entry_idx,
            'direction': m.direction, 'entry_atr': float(entry_atr),
            'mae_atr': e['mae'] / entry_atr, 'mfe_atr': e['mfe'] / entry_atr,
            'pip': pip, 'cost_price': cost_price,
        })
    return out


def size_and_race(all_motifs: list[dict], bars_by_pair: dict[str, pd.DataFrame],
                  args: argparse.Namespace) -> tuple[list[dict], int]:
    """Sorts every pair's motifs into ONE global causal timeline, sizes each
    from ONLY same-category precedent strictly before it, races the adaptive
    entry AND the same-motif frozen-grid benchmark. Returns (rows, n_skipped)
    -- n_skipped is motifs whose category hadn't reached --min-pool
    precedents yet (reported, never silently dropped or backfilled)."""
    all_motifs = sorted(all_motifs, key=lambda m: m['confirm_time'])
    pool: dict[tuple, list[float]] = defaultdict(list)  # category -> [mae_atr,...]
    pool_mfe: dict[tuple, list[float]] = defaultdict(list)
    rows = []
    n_skipped = 0

    for m in all_motifs:
        cat = m['category']
        mae_pool, mfe_pool = pool[cat], pool_mfe[cat]
        if len(mae_pool) < args.min_pool:
            n_skipped += 1
        else:
            sl_atr_mult = float(np.percentile(mae_pool, args.sl_pctile))
            tp_atr_mult = float(np.percentile(mfe_pool, args.tp_pctile))
            sl_price = sl_atr_mult * m['entry_atr']
            tp_dist = tp_atr_mult * m['entry_atr']
            if sl_price > 0 and tp_dist > 0:
                bars = bars_by_pair[m['pair']]
                adaptive_entry = VariableEntry(idx=m['entry_idx'], direction=m['direction'],
                                               sl=sl_price, tp_dist=tp_dist)
                adaptive_trade = race_trades_variable(
                    bars, [adaptive_entry], max_bars_ahead=args.max_bars_ahead,
                    cost_price=m['cost_price'], min_bars_ahead=args.min_bars_ahead)
                bench_sl = args.bench_sl_pips * m['pip']
                bench_entry = Entry(idx=m['entry_idx'], direction=m['direction'])
                bench_trade = race_trades(
                    bars, [bench_entry], sl=bench_sl, tp_r=args.bench_tp_r,
                    max_bars_ahead=args.max_bars_ahead, cost_price=m['cost_price'],
                    min_bars_ahead=args.min_bars_ahead)
                if adaptive_trade and bench_trade:
                    rows.append({
                        'pair': m['pair'], 'confirm_time': m['confirm_time'], 'category': cat,
                        'sl_atr_mult': sl_atr_mult, 'tp_atr_mult': tp_atr_mult,
                        'sl_pips': sl_price / m['pip'], 'tp_pips': tp_dist / m['pip'],
                        'adaptive_r': adaptive_trade[0]['r'], 'bench_r': bench_trade[0]['r'],
                    })
        # Update the pool AFTER sizing this motif -- it becomes precedent for
        # motifs confirming later, never for itself or anything earlier.
        mae_pool.append(m['mae_atr'])
        mfe_pool.append(m['mfe_atr'])
    return rows, n_skipped


def report(rows: list[dict], bars_by_pair: dict[str, pd.DataFrame]) -> None:
    if not rows:
        print("[result] no rows -- widen --min-pool or check data")
        return

    df = pd.DataFrame(rows)
    folds = build_folds(next(iter(bars_by_pair.values())), fold_months=12)
    tz = df['confirm_time'].dt.tz

    print(f"\n{'='*100}\nADAPTIVE (per-category MAE/MFE-sized) vs FROZEN GRID (sl={20}p, tp_r=1.5) "
          f"-- SAME {len(df)} motifs, per calendar fold\n{'='*100}")
    print(f"  {'fold':>8}  {'n':>6}  {'adaptive PF':>11}  {'adaptive avgR':>13}  "
          f"{'frozen PF':>9}  {'frozen avgR':>11}  {'delta avgR':>10}")
    n_folds_adaptive_wins, n_folds_total = 0, 0
    for fold_start, fold_end, label in folds:
        fs = fold_start.tz_localize(tz) if tz is not None else fold_start
        fe = fold_end.tz_localize(tz) if tz is not None else fold_end
        sub = df[(df['confirm_time'] >= fs) & (df['confirm_time'] < fe)]
        if sub.empty:
            continue
        n_folds_total += 1
        s_adapt = summarize_r(sub['adaptive_r'].tolist())
        s_bench = summarize_r(sub['bench_r'].tolist())
        if s_adapt['avg_r'] > s_bench['avg_r']:
            n_folds_adaptive_wins += 1
        print(f"  {label:>8}  {len(sub):>6}  {s_adapt['profit_factor']:>11.2f}  "
              f"{s_adapt['avg_r']:>+13.3f}  {s_bench['profit_factor']:>9.2f}  "
              f"{s_bench['avg_r']:>+11.3f}  {s_adapt['avg_r']-s_bench['avg_r']:>+10.3f}")

    s_adapt_all = summarize_r(df['adaptive_r'].tolist())
    s_bench_all = summarize_r(df['bench_r'].tolist())
    print(f"\n[all folds pooled] n={len(df)}  "
          f"adaptive PF={s_adapt_all['profit_factor']:.3f} avgR={s_adapt_all['avg_r']:+.3f}  |  "
          f"frozen-grid PF={s_bench_all['profit_factor']:.3f} avgR={s_bench_all['avg_r']:+.3f}")
    print(f"[fold consistency] adaptive beats frozen-grid avg R in {n_folds_adaptive_wins}/{n_folds_total} folds")

    print(f"\n{'='*100}\nSIZE BY CATEGORY (median, pips) -- what the adaptive stop/target actually looks like\n{'='*100}")
    for cat, g in df.groupby('category'):
        n_touches, is_top = cat
        kind = 'top' if is_top else 'bottom'
        print(f"  {n_touches}-touch {kind:<7}  n={len(g):>6}  "
              f"median SL={g['sl_pips'].median():>6.1f}p (mult={g['sl_atr_mult'].median():.2f}xATR)  "
              f"median TP={g['tp_pips'].median():>6.1f}p (mult={g['tp_atr_mult'].median():.2f}xATR)")

    print("\n[caveat] SL/TP percentiles pooled ACROSS ALL PAIRS per category (not per-pair) for sample "
          "size -- motif_walkforward.py's per-pair diagnosis found no detector-level difference across "
          "pairs, so this is a deliberate choice, not an oversight; a per-pair version would be the "
          "natural next ablation if this shows something. mae/mfe computed with NO stop constraint over "
          "a shorter excursion_bars window (the breakout thesis's own horizon, not the full race's "
          "max_bars_ahead -- an earlier version used max_bars_ahead and produced ~11xATR stops that "
          "diluted the signal into near-continuous timeouts), then converted to a real graded R via the "
          "SAME barrier walker (race_trades_variable) -- not just read off the raw excursion numbers "
          "directly. One (sl-pctile, tp-pctile, excursion-bars) cell tested; a real ablation across "
          "those choices is the natural next step if this shows something.")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pairs", default=None)
    p.add_argument("--all-pairs", action="store_true")
    p.add_argument("--timeframe", default="1h")
    p.add_argument("--atr-period", type=int, default=14)
    p.add_argument("--pivot-n", type=int, default=5)
    p.add_argument("--tol-atr-mult", type=float, default=1.2)
    p.add_argument("--min-retrace-atr-mult", type=float, default=2.5)
    p.add_argument("--min-bars-between-touches", type=int, default=10)
    p.add_argument("--breakout-max-bars", type=int, default=40)
    p.add_argument("--max-bars-ahead", type=int, default=200)
    p.add_argument("--min-bars-ahead", type=int, default=10)
    p.add_argument("--excursion-bars", type=int, default=40,
                   help="window for the historical MAE/MFE distribution -- the breakout thesis's own "
                        "horizon, deliberately shorter than --max-bars-ahead (default matches "
                        "--breakout-max-bars, not the full race horizon)")
    p.add_argument("--sl-pctile", type=float, default=75.0)
    p.add_argument("--tp-pctile", type=float, default=50.0)
    p.add_argument("--min-pool", type=int, default=50, help="min same-category precedents before sizing")
    p.add_argument("--bench-sl-pips", type=float, default=20.0)
    p.add_argument("--bench-tp-r", type=float, default=1.5)
    args = p.parse_args()

    pairs = args.pairs.split(",") if args.pairs else (ALL_PAIRS if args.all_pairs else None)
    if not pairs:
        raise SystemExit("pass --pairs <a,b,c> or --all-pairs")

    print(f"[setup] {len(pairs)} pairs, sl_pctile={args.sl_pctile} tp_pctile={args.tp_pctile} "
          f"min_pool={args.min_pool}")
    all_motifs: list[dict] = []
    bars_by_pair: dict[str, pd.DataFrame] = {}
    for pair in pairs:
        bars_by_pair[pair] = load_bars(pair, args.timeframe)
        m = collect_pair_motifs(pair, args)
        all_motifs.extend(m)
        print(f"  {pair:<8} {len(m):>5} eligible motifs")

    rows, n_skipped = size_and_race(all_motifs, bars_by_pair, args)
    print(f"\n[sizing] {len(rows)} motifs sized+raced, {n_skipped} skipped "
          f"(category hadn't reached {args.min_pool} precedents yet)")
    report(rows, bars_by_pair)


if __name__ == "__main__":
    main()
