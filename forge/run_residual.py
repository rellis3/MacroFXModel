"""run_residual — CLI: the currency-network residual go/no-go study.

    python -m forge.run_residual --years 8 --window 60 --folds 6 --null-runs 3

Decomposes each day's cross-section of FX returns into per-currency strength
moves via one least-squares solve (no rolling hedge ratio, no free
parameters — see `forge/residual.py`'s module docstring for why that matters
after two prior single-relationship approaches failed). Reports, per pair,
whether the leftover residual is stationary (ADF) and how fast it reverts
(OU half-life), then walk-forwards a small pre-registered cross-sectional
long/short grid on the residual z-score against a shuffled-score null — the
same discipline `forge.run_xsect` applies to its own score.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from forge import residual as R


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--years", type=float, default=8.0, help="0 = all history")
    ap.add_argument("--data-root", default="VolRangeForecaster/data/m1")
    ap.add_argument("--day-start-hour", type=int, default=0)
    ap.add_argument("--block-days", type=int, default=1,
                    help="decompose on non-overlapping N-day blocks instead of daily (fixed, not rolling)")
    ap.add_argument("--ewma-halflife", type=float, default=0,
                    help="0 = raw daily residual (default). >0 = lag the currency index with this FIXED "
                         "half-life (blocks) instead, so fair value moves slower than price. Mutually "
                         "meaningful with --block-days too (the lag is then in blocks, not raw days).")
    ap.add_argument("--window", type=int, default=60, help="causal z-score standardizing window, blocks")
    ap.add_argument("--k-grid", default="3,5")
    ap.add_argument("--h-grid", default="1,5,10")
    ap.add_argument("--folds", type=int, default=6)
    ap.add_argument("--null-runs", type=int, default=3)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", default="forge/out_residual")
    args = ap.parse_args(argv)

    k_grid = tuple(int(x) for x in args.k_grid.split(","))
    h_grid = tuple(int(x) for x in args.h_grid.split(","))
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    tag = "" if args.block_days <= 1 else f"_block{args.block_days}"
    tag += "" if not args.ewma_halflife else f"_ewma{args.ewma_halflife:g}"
    out_name = f"residual_report{tag}.json" if tag else "residual_report.json"

    pairs = R.fx_universe(args.data_root)
    currencies, A = R.currency_network(pairs)
    print(f"[universe] {len(pairs)} FX pairs -> {len(currencies)} currencies: {', '.join(currencies)} "
          f"| block_days={args.block_days}", flush=True)

    print(f"[data] loading daily closes, {args.years}y...", flush=True)
    closes = R.load_daily_closes(pairs, args.data_root, args.day_start_hour, args.years)
    closes = R.block_resample(closes, args.block_days)
    returns = np.log(closes).diff()
    print(f"[data] {closes.shape[0]:,} dates x {closes.shape[1]} pairs "
          f"({closes.notna().sum().min()}-{closes.notna().sum().max()} obs per pair)", flush=True)

    print("[decompose] per-date least-squares currency-network solve...", flush=True)
    resid, ccy = R.decompose(returns, pairs, currencies, A)
    solved = resid.notna().any(axis=1).sum()
    print(f"[decompose] solved {solved:,}/{len(returns):,} dates", flush=True)

    if args.ewma_halflife:
        print(f"[decompose] lagging currency index with FIXED half-life={args.ewma_halflife:g} "
              f"blocks (fair value now smoothed, not re-fit every date)", flush=True)
        raw_levels = R.residual_levels(resid)
        ccy_lvl = R.currency_levels(ccy)
        levels = R.ewma_residual_levels(raw_levels, ccy_lvl, pairs, args.ewma_halflife)
    else:
        levels = R.residual_levels(resid)

    print("\n[diagnostics] per-pair residual stationarity + half-life", flush=True)
    diag_rows = []
    for p in pairs:
        adf = R.adf_test(levels[p])
        hl_blocks = R.half_life(levels[p])
        hl = hl_blocks * args.block_days
        diag_rows.append({"pair": p, "n": adf["n"], "adf_stat": adf["stat"],
                          "adf_pvalue": adf["pvalue"], "adf_method": adf["method"],
                          "half_life_days": hl})
        hl_s = f"{hl:6.1f}d" if np.isfinite(hl) else "   inf"
        pv_s = f"p={adf['pvalue']:.3f}" if np.isfinite(adf["pvalue"]) else "p=n/a"
        print(f"  {p:8s} n={adf['n']:5d}  ADF={adf['stat']:+7.2f} ({pv_s})  half_life={hl_s}", flush=True)
    diag_df = pd.DataFrame(diag_rows)
    n_stationary_5pct = int((diag_df["adf_pvalue"] < 0.05).sum())
    print(f"\n[diagnostics] {n_stationary_5pct}/{len(pairs)} pairs stationary at 5% "
          f"(ADF p<0.05)", flush=True)

    print(f"\n[panel] building residual z-score panel, window={args.window}...", flush=True)
    panel = R.build_score_panel(levels, closes, pairs, window=args.window)
    panel = R.add_forward_returns(panel, closes, h_grid=h_grid)
    print(f"[panel] {len(panel):,} (date, pair) rows, "
          f"{panel['date'].nunique():,} dates, {panel['pair'].nunique()} pairs", flush=True)

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
        "config": vars(args),
        "universe": pairs, "currencies": currencies,
        "diagnostics": diag_rows,
        "n_stationary_5pct": n_stationary_5pct,
        "panel": {"rows": int(len(panel)), "dates": int(panel["date"].nunique()),
                 "pairs": int(panel["pair"].nunique())},
        "real": {"folds": real["folds"], "oos": real["oos"], "specs": real["specs"]},
        "null": {"runs": [{"oos": n["oos"]} for n in nulls], "oos_t": null_ts.tolist()},
    }
    (out_dir / out_name).write_text(json.dumps(report, indent=2, default=str))

    o = real["oos"]
    print("\n" + "=" * 78)
    print("DIAGNOSTICS")
    print(f"  {n_stationary_5pct}/{len(pairs)} pairs' residuals stationary at 5% (ADF)")
    med_hl = diag_df.loc[np.isfinite(diag_df["half_life_days"]), "half_life_days"].median()
    print(f"  median half-life (finite only): {med_hl:.1f} days")
    print("\nCROSS-SECTIONAL BACKTEST (walk-forward, cost-net)")
    print(f"  REAL   OOS: n={o['n']} mean={o['mean']:+.5f}  t={o['t']:.2f}  "
          f"hit_rate={o['hit_rate']:.1%}  total={o['total']:+.3f}")
    if len(null_ts):
        print(f"  NULL   OOS (shuffled z-scores, {len(null_ts)} runs): best t={np.nanmax(null_ts):.2f}")
        print(f"  -> real t must clear the null's best to mean anything: "
              f"{o['t']:.2f} vs {np.nanmax(null_ts):.2f}")
    print("=" * 78)
    print(f"\nwrote {out_dir / out_name}")
    return report


if __name__ == "__main__":
    main()
