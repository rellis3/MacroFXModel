"""run_xsect — CLI: the cross-sectional ranking study.

    python -m forge.run_xsect --years 10 --folds 6 --null-runs 3

Builds the weekly-open extension score across every instrument with local M1
data, walk-forwards a small pre-registered (K, holding period, fade/follow)
grid, and compares the result to a null where each date's scores are
shuffled across instruments before ranking — the cross-sectional analogue of
`forge.run`'s random-level control. See `forge/xsect.py`'s module docstring
for why this is a structurally easier question than the single-instrument
directional search the rest of `forge` runs.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from forge import xsect as X


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--years", type=float, default=10.0, help="0 = all history")
    ap.add_argument("--tf", default="d1")
    ap.add_argument("--data-root", default="VolRangeForecaster/data/m1")
    ap.add_argument("--day-start-hour", type=int, default=0)
    ap.add_argument("--k-grid", default="3,5")
    ap.add_argument("--h-grid", default="1,3,5")
    ap.add_argument("--folds", type=int, default=6)
    ap.add_argument("--null-runs", type=int, default=3)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", default="forge/out_xsect")
    args = ap.parse_args(argv)

    k_grid = tuple(int(x) for x in args.k_grid.split(","))
    h_grid = tuple(int(x) for x in args.h_grid.split(","))
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    pairs = X.discover_universe(args.data_root)
    print(f"[universe] {len(pairs)} instruments: {', '.join(pairs)}", flush=True)

    print(f"[panel] building weekly-open extension score, {args.tf}, {args.years}y...",
          flush=True)
    panel = X.build_panel(pairs, tf=args.tf, data_root=args.data_root,
                          day_start_hour=args.day_start_hour, years=args.years)
    panel = X.add_forward_returns(panel, h_grid=h_grid)
    print(f"[panel] {len(panel):,} (date, pair) rows, "
          f"{panel['date'].nunique():,} dates, {panel['pair'].nunique()} pairs", flush=True)

    print("\n[walk-forward] REAL scores", flush=True)
    real = X.walk_forward(panel, n_folds=args.folds, k_grid=k_grid, h_grid=h_grid, verbose=True)

    nulls = []
    rng = np.random.default_rng(args.seed)
    for r in range(args.null_runs):
        print(f"[walk-forward] NULL run {r + 1}/{args.null_runs} (shuffled scores)", flush=True)
        panel_null = X.shuffle_scores(panel, rng)
        res = X.walk_forward(panel_null, n_folds=args.folds, k_grid=k_grid, h_grid=h_grid,
                             verbose=False)
        nulls.append(res)
        print(f"    null OOS: n={res['oos']['n']} mean={res['oos']['mean']:+.4f} "
              f"t={res['oos']['t']:.2f}", flush=True)

    null_ts = np.array([n["oos"]["t"] for n in nulls], dtype=float)

    report = {
        "config": vars(args),
        "universe": pairs,
        "panel": {"rows": int(len(panel)), "dates": int(panel["date"].nunique()),
                 "pairs": int(panel["pair"].nunique())},
        "real": {"folds": real["folds"], "oos": real["oos"], "specs": real["specs"]},
        "null": {"runs": [{"oos": n["oos"]} for n in nulls], "oos_t": null_ts.tolist()},
    }
    (out_dir / "xsect_report.json").write_text(json.dumps(report, indent=2, default=str))

    o = real["oos"]
    print("\n" + "=" * 78)
    print(f"REAL   OOS: n={o['n']} mean={o['mean']:+.4f}  t={o['t']:.2f}  "
          f"hit_rate={o['hit_rate']:.1%}  total={o['total']:+.1f}")
    if len(null_ts):
        print(f"NULL   OOS (shuffled scores, {len(null_ts)} runs): "
              f"best t={np.nanmax(null_ts):.2f}")
        print(f"   → real t must clear the null's best to mean anything: "
              f"{o['t']:.2f} vs {np.nanmax(null_ts):.2f}")
    print("=" * 78)
    print(f"\nwrote {out_dir / 'xsect_report.json'}")
    return report


if __name__ == "__main__":
    main()
