#!/usr/bin/env python3
"""motif_multi_tf.py — true multi-timeframe analysis for the touch-motif
signal: does the H1 signal behave differently when a higher timeframe shows
the SAME direction (agree) vs the OPPOSITE direction (conflict) vs nothing
recent (none)? This is the literal thing asked for early in this build
("if higher time frames have a bullish pennant and lower time frames have
bearish, what happens") and confirmed absent everywhere in the codebase:
`js/patternEngine.js`'s `annotateHtfAlignment` only checks a single
next-higher timeframe, stores a boolean, and never aggregates it into any
stat; `motif_touch.py`/`motif_scan.py`/`motif_walkforward.py` don't look at
any timeframe but their own at all.

Method (causal -- no lookahead):
  1. Detect touch motifs on H1 (the base signal, unchanged) AND
     INDEPENDENTLY on each higher timeframe (`--htf-list`, default 4h,1D) --
     same detector, same frozen params, just different resampled bars
     (`pattern_scan.load_bars` already supports any pandas resample rule).
     This is the minimal-DOF version: no HTF-specific tuning, so any effect
     found isn't an artifact of cherry-picked HTF parameters.
  2. For every eligible H1 entry at confirm time T: find the most recently
     CONFIRMED HTF motif whose OWN confirm time is <= T (a real, knowable-
     by-T timestamp -- not "the whole HTF history", not a future HTF
     confirmation) and within `--htf-lookback-bars` HTF bars of T (a stale
     motif from 3 years ago doesn't count as "currently showing"). Bucket
     the H1 entry as:
       AGREE    -- HTF motif's direction == H1 entry's direction
       CONFLICT -- HTF motif's direction == the opposite
       NONE     -- no HTF motif confirmed recently enough
  3. Race the H1 SIGNAL entries (SAME frozen sl=20p/tp_r=1.5 grid every
     other AnalogML motif check uses) split by bucket, cost on, calendar-
     year walk-forward same as motif_walkforward.py -- not a single split.

Usage:
  python AnalogML/motif_multi_tf.py --all-pairs
  python AnalogML/motif_multi_tf.py --all-pairs --htf-list 4h,1D
"""
from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from motif_walkforward import build_folds  # noqa: E402
from pattern_scan import load_bars  # noqa: E402
from portfolio_sim import ALL_PAIRS  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from pylego.barrier_race import Entry, race_trades  # noqa: E402
from pylego.costs import default_spread  # noqa: E402
from pylego.instruments import pip_size  # noqa: E402
from pylego.motif_touch import detect_touch_motifs  # noqa: E402
from pylego.swing_structure import atr as compute_atr  # noqa: E402
from pylego.trade_stats import summarize_r  # noqa: E402

DETECT_KW = dict(pivot_n=5, tol_atr_mult=1.2, min_retrace_atr_mult=2.5,
                 min_bars_between_touches=10, breakout_max_bars=40)


def _detect(bars: pd.DataFrame, atr_period: int = 14) -> list:
    atr_arr = compute_atr(bars, period=atr_period)
    return detect_touch_motifs(bars, atr_arr, **DETECT_KW)


def htf_lean_at(htf_confirmed: list[tuple], cutoff_idx_htf: int, lookback_bars: int) -> int | None:
    """Direction of the most recently CONFIRMED HTF motif knowable by
    cutoff_idx_htf (confirm_idx <= cutoff_idx_htf), within lookback_bars HTF
    bars. htf_confirmed: [(confirm_idx, direction), ...] sorted ascending.
    None if nothing qualifies -- 'no recent HTF read', a real, common state,
    not an error."""
    candidates = [c for c in htf_confirmed if c[0] <= cutoff_idx_htf]
    if not candidates:
        return None
    latest_idx, latest_dir = candidates[-1]  # htf_confirmed sorted ascending -> last is latest
    if cutoff_idx_htf - latest_idx > lookback_bars:
        return None
    return latest_dir


def collect_pair(pair: str, args: argparse.Namespace) -> list[dict]:
    h1 = load_bars(pair, args.base_timeframe)
    n_h1 = len(h1)
    last_possible = n_h1 - 1 - args.max_bars_ahead
    h1_motifs = _detect(h1, args.atr_period)
    eligible = [m for m in h1_motifs if m.confirm_idx is not None and m.confirm_idx <= last_possible]

    htf_confirmed_by_tf: dict[str, list[tuple]] = {}
    htf_bars_by_tf: dict[str, pd.DataFrame] = {}
    htf_end_by_tf: dict[str, pd.DatetimeIndex] = {}
    for htf in args.htf_list:
        htf_bars = load_bars(pair, htf)
        htf_bars_by_tf[htf] = htf_bars
        # A resampled bar is labeled by its START (pandas default), so it
        # isn't actually CLOSED/knowable until start+bar_duration -- using
        # the start label directly as a cutoff would let a still-forming
        # HTF bar's high/low/close leak into a decision made mid-bar
        # (lookahead). bar_duration is derived from the index's own regular
        # spacing (resample guarantees this), not hardcoded per timeframe
        # string, so any --htf-list value works without a lookup table.
        bar_duration = htf_bars.index[1] - htf_bars.index[0]
        htf_end_by_tf[htf] = htf_bars.index + bar_duration
        htf_motifs = _detect(htf_bars, args.atr_period)
        confirmed = sorted(
            [(m.confirm_idx, m.direction) for m in htf_motifs if m.confirm_idx is not None],
            key=lambda c: c[0])
        htf_confirmed_by_tf[htf] = confirmed

    pip = pip_size(pair)
    cost_price = default_spread(pair)
    rows = []
    for m in eligible:
        entry_time = h1.index[m.confirm_idx]
        row = {'pair': pair, 'entry_idx': m.confirm_idx + 1, 'direction': m.direction,
              'confirm_time': entry_time, 'pip': pip, 'cost_price': cost_price}
        for htf in args.htf_list:
            # Last HTF bar whose END (not start) is <= entry_time -- the
            # last bar genuinely CLOSED by the moment of this H1 entry.
            cutoff_idx_htf = int(htf_end_by_tf[htf].searchsorted(entry_time, side='right')) - 1
            lean = htf_lean_at(htf_confirmed_by_tf[htf], cutoff_idx_htf, args.htf_lookback_bars)
            if lean is None:
                bucket = 'NONE'
            elif lean == m.direction:
                bucket = 'AGREE'
            else:
                bucket = 'CONFLICT'
            row[f'htf_{htf}'] = bucket
        rows.append(row)
    return rows, h1


def report(all_rows: list[dict], bars_by_pair: dict, args: argparse.Namespace) -> None:
    if not all_rows:
        print("[result] no rows")
        return
    folds = build_folds(next(iter(bars_by_pair.values())), fold_months=12)

    for htf in args.htf_list:
        key = f'htf_{htf}'
        print(f"\n{'='*100}\nH1 SIGNAL SPLIT BY {htf.upper()} STATE (sl={args.bench_sl_pips}p, "
              f"tp_r={args.bench_tp_r}, lookback={args.htf_lookback_bars} {htf} bars)\n{'='*100}")

        by_bucket: dict[str, list[float]] = defaultdict(list)
        for row in all_rows:
            bars = bars_by_pair[row['pair']]
            sl_price = args.bench_sl_pips * row['pip']
            entry = Entry(idx=row['entry_idx'], direction=row['direction'])
            trades = race_trades(bars, [entry], sl=sl_price, tp_r=args.bench_tp_r,
                                 max_bars_ahead=args.max_bars_ahead, cost_price=row['cost_price'],
                                 min_bars_ahead=args.min_bars_ahead)
            if trades:
                by_bucket[row[key]].append(trades[0]['r'])

        print(f"  {'bucket':>10}  {'n':>7}  {'PF':>6}  {'WR':>7}  {'avgR':>8}")
        for bucket in ('AGREE', 'CONFLICT', 'NONE'):
            rs = by_bucket.get(bucket, [])
            if not rs:
                print(f"  {bucket:>10}  {0:>7}  {'—':>6}  {'—':>7}  {'—':>8}")
                continue
            s = summarize_r(rs)
            print(f"  {bucket:>10}  {s['n']:>7}  {s['profit_factor']:>6.2f}  "
                  f"{s['win_rate']:>6.1%}  {s['avg_r']:>+8.3f}")

        agree_pf = summarize_r(by_bucket['AGREE'])['profit_factor'] if by_bucket.get('AGREE') else None
        conflict_pf = summarize_r(by_bucket['CONFLICT'])['profit_factor'] if by_bucket.get('CONFLICT') else None
        if agree_pf is not None and conflict_pf is not None:
            print(f"\n  [read] AGREE PF={agree_pf:.2f} vs CONFLICT PF={conflict_pf:.2f} -- "
                  f"{'HTF agreement looks like real information' if agree_pf > conflict_pf + 0.05 else 'no clear separation, likely not informative at this HTF'}")

        # Calendar-fold consistency check for the AGREE-vs-CONFLICT gap, same
        # discipline motif_walkforward.py uses -- a single pooled number can
        # hide a lucky year.
        print(f"\n  per-fold AGREE vs CONFLICT avgR ({htf}):")
        tz = all_rows[0]['confirm_time'].tzinfo
        n_folds_agree_wins, n_folds_total = 0, 0
        for fold_start, fold_end, label in folds:
            fs = fold_start.tz_localize(tz) if tz is not None else fold_start
            fe = fold_end.tz_localize(tz) if tz is not None else fold_end
            fold_rows = [r for r in all_rows if fs <= r['confirm_time'] < fe]
            if not fold_rows:
                continue
            fold_agree, fold_conflict = [], []
            for row in fold_rows:
                bars = bars_by_pair[row['pair']]
                sl_price = args.bench_sl_pips * row['pip']
                entry = Entry(idx=row['entry_idx'], direction=row['direction'])
                trades = race_trades(bars, [entry], sl=sl_price, tp_r=args.bench_tp_r,
                                     max_bars_ahead=args.max_bars_ahead, cost_price=row['cost_price'],
                                     min_bars_ahead=args.min_bars_ahead)
                if not trades:
                    continue
                if row[key] == 'AGREE':
                    fold_agree.append(trades[0]['r'])
                elif row[key] == 'CONFLICT':
                    fold_conflict.append(trades[0]['r'])
            if not fold_agree or not fold_conflict:
                continue
            n_folds_total += 1
            a_avg = summarize_r(fold_agree)['avg_r']
            c_avg = summarize_r(fold_conflict)['avg_r']
            if a_avg > c_avg:
                n_folds_agree_wins += 1
            print(f"    {label:>8}  AGREE n={len(fold_agree):>4} avgR={a_avg:>+6.3f}  "
                  f"CONFLICT n={len(fold_conflict):>4} avgR={c_avg:>+6.3f}")
        if n_folds_total:
            print(f"  [fold consistency] AGREE beats CONFLICT avgR in {n_folds_agree_wins}/{n_folds_total} folds")

    print("\n[caveat] SAME frozen detector/params reused on the HTF bars, deliberately not re-tuned per "
          "timeframe -- minimal-DOF first read. 'Most recently CONFIRMED HTF motif within lookback' is "
          "one specific definition of 'HTF currently shows a pattern' -- an in-progress/provisional HTF "
          "read (matching motif_track.py's live diagnostic) is a real next variant, not tested here.")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pairs", default=None)
    p.add_argument("--all-pairs", action="store_true")
    p.add_argument("--base-timeframe", default="1h")
    p.add_argument("--htf-list", default="4h,1D")
    p.add_argument("--htf-lookback-bars", type=int, default=20)
    p.add_argument("--atr-period", type=int, default=14)
    p.add_argument("--max-bars-ahead", type=int, default=200)
    p.add_argument("--min-bars-ahead", type=int, default=10)
    p.add_argument("--bench-sl-pips", type=float, default=20.0)
    p.add_argument("--bench-tp-r", type=float, default=1.5)
    args = p.parse_args()
    args.htf_list = args.htf_list.split(",")

    pairs = args.pairs.split(",") if args.pairs else (ALL_PAIRS if args.all_pairs else None)
    if not pairs:
        raise SystemExit("pass --pairs <a,b,c> or --all-pairs")

    print(f"[setup] {len(pairs)} pairs, base={args.base_timeframe}, htf={args.htf_list}, "
          f"lookback={args.htf_lookback_bars} HTF bars")
    all_rows: list[dict] = []
    bars_by_pair: dict[str, pd.DataFrame] = {}
    for pair in pairs:
        rows, h1_bars = collect_pair(pair, args)
        bars_by_pair[pair] = h1_bars
        all_rows.extend(rows)
        counts = defaultdict(int)
        for r in rows:
            for htf in args.htf_list:
                counts[(htf, r[f'htf_{htf}'])] += 1
        print(f"  {pair:<8} {len(rows):>5} H1 entries  " +
              "  ".join(f"{htf}:{counts[(htf,'AGREE')]}A/{counts[(htf,'CONFLICT')]}C/{counts[(htf,'NONE')]}N"
                        for htf in args.htf_list))

    report(all_rows, bars_by_pair, args)


if __name__ == "__main__":
    main()
