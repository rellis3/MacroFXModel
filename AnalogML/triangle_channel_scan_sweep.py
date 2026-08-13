#!/usr/bin/env python3
"""triangle_channel_scan_sweep.py — full pair-universe check + calendar
IS/OOS split for triangle/wedge/channel instances, using the shared
`pattern_sweep.run_sweep` core.

Usage:
  python AnalogML/triangle_channel_scan_sweep.py --pairs gbpjpy,eurusd,audjpy,usdjpy
  python AnalogML/triangle_channel_scan_sweep.py --all-pairs
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from pattern_sweep import ALL_PAIRS, run_sweep  # noqa: E402

from pylego.triangle_channel import detect_triangles_channels  # noqa: E402


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--pairs", help="comma-separated pair list")
    g.add_argument("--all-pairs", action="store_true")
    p.add_argument("--timeframe", default="1h")
    p.add_argument("--sl-pips", type=float, default=20.0)
    p.add_argument("--tp-r", type=float, default=1.5)
    p.add_argument("--oos-cutoff", default="2023-01-01")
    p.add_argument("--max-bars-ahead", type=int, default=200)
    p.add_argument("--min-bars-ahead", type=int, default=10)
    p.add_argument("--cost", action="store_true", default=True)
    p.add_argument("--no-cost", dest="cost", action="store_false")
    return p


def main() -> None:
    args = build_parser().parse_args()
    pairs = ALL_PAIRS if args.all_pairs else [p.strip() for p in args.pairs.split(",")]
    run_sweep(pairs, args.timeframe, args.sl_pips, args.tp_r, args.cost,
             args.oos_cutoff, args.max_bars_ahead, args.min_bars_ahead,
             detect_fn=detect_triangles_channels)


if __name__ == "__main__":
    main()
