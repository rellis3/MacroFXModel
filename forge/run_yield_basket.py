"""run_yield_basket — CLI: cross-sectional rate-differential basket, built on
YieldSpreadBot's validated per-pair engine, restructured as a market-neutral
long/short basket instead of 6 independent single-pair trades.

    FRED_API_KEY=... python -m forge.run_yield_basket --years 8 --folds 6 --null-runs 3

Needs a working `FRED_API_KEY` and network access to `api.stlouisfed.org` —
see `forge/yield_basket.py`'s module docstring (DATA BLOCKER section) if this
fails to fetch. Does not touch or re-implement the live bot
(`YieldSpreadBot/yield_spread_bot.py`) — it consumes the same rate-
differential math (`js/zscoreSpreadEngine.js`) ported to Python, ranked
cross-sectionally instead of traded per-pair.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import numpy as np
import pandas as pd

from forge import residual as R
from forge import yield_basket as YB


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fred-key", default=os.environ.get("FRED_API_KEY") or os.environ.get("FRED_KEY"))
    ap.add_argument("--start", default="2010-01-01", help="FRED fetch start date")
    ap.add_argument("--data-root", default="VolRangeForecaster/data/m1")
    ap.add_argument("--z-window", type=int, default=YB.DEFAULT_Z_WINDOW)
    ap.add_argument("--pub-lag-us-days", type=int, default=YB.DEFAULT_PUB_LAG_US_DAYS)
    ap.add_argument("--pub-lag-foreign-days", type=int, default=YB.DEFAULT_PUB_LAG_FOREIGN_DAYS)
    ap.add_argument("--k-grid", default="3,5")
    ap.add_argument("--h-grid", default="1,5,10,20")
    ap.add_argument("--folds", type=int, default=6)
    ap.add_argument("--null-runs", type=int, default=3)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", default="forge/out_yield_basket")
    args = ap.parse_args(argv)

    if not args.fred_key:
        raise SystemExit(
            "No FRED key found (--fred-key / FRED_API_KEY / FRED_KEY). "
            "See forge/yield_basket.py's DATA BLOCKER note — this study needs live FRED "
            "access (or a local cache of the ~7 short-rate series) to run; refusing to "
            "fabricate results in its absence."
        )

    k_grid = tuple(int(x) for x in args.k_grid.split(","))
    h_grid = tuple(int(x) for x in args.h_grid.split(","))
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    currencies = sorted(YB.CURRENCY_RATE_SERIES)
    print(f"[universe] {len(currencies)} currencies with a confirmed FRED short-rate series: "
          f"{', '.join(currencies)} (NZD excluded — no confirmed series)", flush=True)
    available = R.fx_universe(args.data_root)
    pairs = YB.universe_from_currencies(currencies, available)
    dropped = sorted(set(available) - set(pairs))
    print(f"[universe] {len(pairs)}/{len(available)} on-disk pairs have both legs' rate series covered: "
          f"{', '.join(pairs)}" + (f" | excluded (needs a currency without a confirmed series): "
                                    f"{', '.join(dropped)}" if dropped else ""), flush=True)

    print(f"[fred] fetching {len(currencies)} short-rate series from {args.start}...", flush=True)
    rates = YB.build_currency_rates(args.fred_key, args.start)
    print(f"[fred] {rates.shape[0]:,} days x {rates.shape[1]} currencies, "
          f"{rates.index.min().date()} -> {rates.index.max().date()}", flush=True)

    print(f"\n[panel] building rate-differential z-score panel, z_window={args.z_window}...", flush=True)
    panel = YB.build_yield_score_panel(rates, pairs, args.data_root, args.z_window,
                                       args.pub_lag_us_days, args.pub_lag_foreign_days)
    closes = YB.closes_wide(pairs, args.data_root)
    panel = R.add_forward_returns(panel, closes, h_grid=h_grid)
    print(f"[panel] {len(panel):,} (date, pair) rows, "
          f"{panel['date'].nunique():,} dates, {panel['pair'].nunique()} pairs", flush=True)

    print("\n[diagnostics] per-pair z-score stationarity + half-life "
          "(sanity check on the rate differential itself, not a price residual)", flush=True)
    diag_rows = []
    for p in pairs:
        sub = panel[panel["pair"] == p].set_index("date")["z"]
        if len(sub.dropna()) < 30:
            continue
        adf = R.adf_test(sub)
        hl = R.half_life(sub)
        diag_rows.append({"pair": p, "n": adf["n"], "adf_stat": adf["stat"],
                          "adf_pvalue": adf["pvalue"], "half_life_days": hl})
        hl_s = f"{hl:6.1f}d" if np.isfinite(hl) else "   inf"
        pv_s = f"p={adf['pvalue']:.3f}" if np.isfinite(adf["pvalue"]) else "p=n/a"
        print(f"  {p:8s} n={adf['n']:5d}  ADF={adf['stat']:+7.2f} ({pv_s})  half_life={hl_s}", flush=True)

    print("\n[walk-forward] REAL scores", flush=True)
    real = R.walk_forward(panel, n_folds=args.folds, k_grid=k_grid, h_grid=h_grid, verbose=True)

    nulls = []
    rng = np.random.default_rng(args.seed)
    for r in range(args.null_runs):
        print(f"[walk-forward] NULL run {r + 1}/{args.null_runs} (shuffled z-scores)", flush=True)
        panel_null = R.shuffle_scores(panel, rng)
        res = R.walk_forward(panel_null, n_folds=args.folds, k_grid=k_grid, h_grid=h_grid, verbose=False)
        nulls.append(res)
        print(f"    null OOS: n={res['oos']['n']} mean={res['oos']['mean']:+.5f} "
              f"t={res['oos']['t']:.2f}", flush=True)

    null_ts = np.array([n["oos"]["t"] for n in nulls], dtype=float)
    report = {
        "config": {k: v for k, v in vars(args).items() if k != "fred_key"},
        "universe": pairs, "currencies": currencies, "dropped_no_price_data": dropped,
        "diagnostics": diag_rows,
        "panel": {"rows": int(len(panel)), "dates": int(panel["date"].nunique()),
                 "pairs": int(panel["pair"].nunique())},
        "real": {"folds": real["folds"], "oos": real["oos"], "specs": real["specs"]},
        "null": {"runs": [{"oos": n["oos"]} for n in nulls], "oos_t": null_ts.tolist()},
    }
    (out_dir / "yield_basket_report.json").write_text(json.dumps(report, indent=2, default=str))

    o = real["oos"]
    print("\n" + "=" * 78)
    print("CROSS-SECTIONAL RATE-DIFFERENTIAL BASKET (walk-forward, cost-net)")
    print(f"  REAL   OOS: n={o['n']} mean={o['mean']:+.5f}  t={o['t']:.2f}  "
          f"hit_rate={o['hit_rate']:.1%}  total={o['total']:+.3f}")
    if len(null_ts):
        print(f"  NULL   OOS (shuffled z-scores, {len(null_ts)} runs): best t={np.nanmax(null_ts):.2f}")
        print(f"  -> real t must clear the null's best to mean anything: "
              f"{o['t']:.2f} vs {np.nanmax(null_ts):.2f}")
    print("=" * 78)
    print(f"\nwrote {out_dir / 'yield_basket_report.json'}")
    return report


if __name__ == "__main__":
    main()
