#!/usr/bin/env python3
"""pattern_scan_sweep.py — robustness sweep for the shape-matching idea.

pattern_scan.py's first read (README.md) was ONE parameter setting on 3
pairs — exactly the single-slice result CLAUDE.md's "how we talk about
results" section warns against over-reading. This sweeps `--window` and
`--k` across more pairs, using pattern_scan.scan() directly (not a second
copy of the evaluation loop) so every cell is scored identically to the
CLI tool.

Also runs a NON-OVERLAPPING check per pair (`--stride == --window`, so
consecutive query windows share no bars) as a direct answer to the
autocorrelation caveat in the README: the main sweep's default stride=12
means neighbouring queries share most of their window, so their outcomes
are not independent trials -- report both, don't just report the flattering
one.

Usage:
  python AnalogML/pattern_scan_sweep.py
  python AnalogML/pattern_scan_sweep.py --pairs gbpjpy,eurusd --windows 32,64 --ks 10,20
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pattern_scan import build_parser, scan  # noqa: E402

DEFAULT_PAIRS = ["gbpjpy", "eurusd", "audjpy", "usdjpy"]
DEFAULT_WINDOWS = [32, 64, 96]
DEFAULT_KS = [10, 20]


def _row_at_tp_r(rows: list[dict], tp_r: float) -> dict | None:
    for r in rows:
        if abs(r["tp_r"] - tp_r) < 1e-9:
            return r
    return rows[0] if rows else None


def _run_one(pair: str, window: int, k: int, stride: int, eval_years: float,
            consensus_tp_r: float) -> dict:
    args = build_parser().parse_args([
        "--pair", pair, "--window", str(window), "--k", str(k),
        "--stride", str(stride), "--eval-years", str(eval_years),
        "--consensus-tp-r", str(consensus_tp_r), "--tp-r-grid", str(consensus_tp_r),
    ])
    args.min_gap_bars = window
    result = scan(args, verbose=False)
    sig = _row_at_tp_r(result["signal"], consensus_tp_r)
    base = _row_at_tp_r(result["baseline"], consensus_tp_r)
    return {
        "pair": pair, "window": window, "k": k, "stride": stride,
        "sig_n": sig["n"] if sig else 0, "sig_pf": sig["profit_factor"] if sig else float("nan"),
        "sig_wr": sig["win_rate"] if sig else float("nan"),
        "base_pf": base["profit_factor"] if base else float("nan"),
        "auc": result["auc"],
    }


def _print_row(r: dict) -> None:
    auc_str = f"{r['auc']:.3f}" if r["auc"] is not None else "  n/a"
    print(f"  {r['pair']:<8} win={r['window']:>3} k={r['k']:>3} stride={r['stride']:>3}  "
          f"n={r['sig_n']:>5}  sig_PF={r['sig_pf']:>5.2f}  base_PF={r['base_pf']:>5.2f}  "
          f"WR={r['sig_wr']:>5.1%}  AUC={auc_str}")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pairs", default=",".join(DEFAULT_PAIRS))
    p.add_argument("--windows", default=",".join(str(w) for w in DEFAULT_WINDOWS))
    p.add_argument("--ks", default=",".join(str(k) for k in DEFAULT_KS))
    p.add_argument("--stride", type=int, default=12)
    p.add_argument("--eval-years", type=float, default=2.0)
    p.add_argument("--consensus-tp-r", type=float, default=1.5)
    args = p.parse_args()

    pairs = args.pairs.split(",")
    windows = [int(x) for x in args.windows.split(",")]
    ks = [int(x) for x in args.ks.split(",")]

    print(f"== main sweep: stride={args.stride} (overlapping queries), "
          f"{len(pairs)} pairs x {len(windows)} windows x {len(ks)} k values ==")
    main_rows = []
    for pair in pairs:
        for window in windows:
            for k in ks:
                r = _run_one(pair, window, k, args.stride, args.eval_years, args.consensus_tp_r)
                main_rows.append(r)
                _print_row(r)

    pf_vals = [r["sig_pf"] for r in main_rows if r["sig_pf"] == r["sig_pf"]]  # drop NaN
    hit_rate = sum(1 for v in pf_vals if v > 1.0) / len(pf_vals) if pf_vals else float("nan")
    print(f"\n[summary] {sum(1 for v in pf_vals if v > 1.0)}/{len(pf_vals)} cells had signal PF > 1.0 "
          f"({hit_rate:.0%}) -- overlapping-query trades, NOT independent samples.")

    print(f"\n== non-overlapping check: stride == window (independent query windows), "
          f"default k={ks[len(ks) // 2]} ==")
    nonoverlap_rows = []
    k_mid = ks[len(ks) // 2]
    for pair in pairs:
        for window in windows:
            r = _run_one(pair, window, k_mid, window, args.eval_years, args.consensus_tp_r)
            nonoverlap_rows.append(r)
            _print_row(r)

    pf_vals2 = [r["sig_pf"] for r in nonoverlap_rows if r["sig_pf"] == r["sig_pf"]]
    hit_rate2 = sum(1 for v in pf_vals2 if v > 1.0) / len(pf_vals2) if pf_vals2 else float("nan")
    print(f"\n[summary] {sum(1 for v in pf_vals2 if v > 1.0)}/{len(pf_vals2)} cells had signal PF > 1.0 "
          f"({hit_rate2:.0%}) on INDEPENDENT (non-overlapping) query windows -- far fewer trades per "
          f"cell, so read this as a directional check, not a tight estimate.")


if __name__ == "__main__":
    main()
