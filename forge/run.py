"""run — CLI: candles in, analysis + a frozen strategy spec out.

    python -m forge.run --pair gold --years 10 --null-runs 3

What it does, in order:

  1. builds the level zoo and every interaction with it (layers 1–2),
  2. prices every interaction against the real forward M1 path (layer 3),
  3. walk-forwards the whole search — design on the past, score on the next
     unseen block (layers 4–5),
  4. repeats step 3 with **randomized level prices** to establish what the
     same search finds in a world where levels mean nothing,
  5. writes a report that leads with the comparison in step 4, because that is
     the number that decides whether anything above it counts.

Nothing here decides a result is good. It reports what happened, including
when what happened is "no edge survived", which is the expected outcome for
most runs and is a finding, not a failure.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from forge import bars as B
from forge import discover as D
from forge import events as E
from forge import label as LB
from forge import levels as L
from forge import validate as V
from forge.confidence import build_dollar_basket, score_events

ROUND_STEPS = {"gold": (50.0, 10.0)}


def build_dataset(pair: str, years: float, event_tf: str, data_root: str,
                  day_start_hour: int, sl_grid, tp_grid, horizon: int,
                  cost_mult: float, levels_override=None, verbose: bool = True,
                  entry_mode: str = "market", level_tfs=("m15", "h1"),
                  atr_rank_window: int = 5000, confidence: bool = False):
    """Everything up to and including labelled events. Returns (lab, levels, m1)."""
    m1 = B.load_m1(pair, data_root)
    if years:
        cutoff = m1.index[-1] - pd.Timedelta(days=365.25 * years)
        m1 = m1[m1.index >= cutoff]
    if verbose:
        print(f"[data] {pair}: {len(m1):,} M1 bars  {m1.index[0]:%Y-%m-%d} → "
              f"{m1.index[-1]:%Y-%m-%d}  price {m1['close'].iloc[0]:.0f} → "
              f"{m1['close'].iloc[-1]:.0f}", flush=True)

    tfs = sorted({event_tf, "h1", "h4", *level_tfs})
    frames = {tf: B.frame(m1, tf, day_start_hour=day_start_hour) for tf in tfs}

    if levels_override is None:
        lv = L.build_levels(m1, {k: frames[k] for k in level_tfs},
                            day_start_hour=day_start_hour,
                            round_steps=ROUND_STEPS.get(pair, ()))
    else:
        lv = levels_override
    if verbose:
        print(f"[levels] {len(lv):,} levels across {lv['kind'].nunique()} kinds, "
              f"{lv['family'].nunique()} families", flush=True)

    # A resting limit fills DURING the touch bar, so its context must describe
    # the bar before — the last moment the order could have been placed.
    ev = E.extract_events(frames[event_tf], lv,
                          trend_frames={"h1": frames["h1"], "h4": frames["h4"]},
                          feature_offset=(-1 if entry_mode == "limit" else 0),
                          atr_rank_window=atr_rank_window)
    if verbose:
        print(f"[events] {len(ev):,} level interactions", flush=True)

    if confidence:
        # The dollar basket is built on gold's own timeframe/clock so the DXY
        # join is an exact reindex, not an asof — see confidence.py.
        dxy = build_dollar_basket(event_tf, data_root, index=frames[event_tf].index)
        ev = score_events(ev, dxy=dxy)
        if verbose:
            hi_l = int((ev["confidence_long"] >= 3).sum())
            hi_s = int((ev["confidence_short"] >= 3).sum())
            print(f"[confidence] scored — {hi_l:,}/{len(ev):,} long, "
                  f"{hi_s:,}/{len(ev):,} short at confidence>=3", flush=True)

    lab = LB.label_grid(ev, m1, sl_atr_grid=sl_grid, tp_r_grid=tp_grid,
                        horizon_bars=horizon, pair=pair, cost_mult=cost_mult,
                        entry_mode=entry_mode, progress=verbose)
    if verbose:
        print(f"[label] {len(lab):,} labelled rows "
              f"({len(sl_grid)}×{len(tp_grid)} barrier cells)", flush=True)
    return lab, lv, m1


def summarize_inventory(lab: pd.DataFrame) -> pd.DataFrame:
    """The 'analysis' half of the output: what the instrument actually did at
    each level family, before any strategy selection."""
    one = lab[(lab["sl_atr"] == lab["sl_atr"].iloc[0]) & (lab["tp_r"] == lab["tp_r"].iloc[0])]
    g = one.groupby("kind")
    return pd.DataFrame({
        "events": g.size(),
        "mean_r_long": g["r_long"].mean(),
        "mean_r_short": g["r_short"].mean(),
        "best_dir_mean_r": np.maximum(g["r_long"].mean(), g["r_short"].mean()),
        "median_wick_atr": g["wick_beyond_atr"].median(),
        "median_conf": g["confluence_n"].median(),
    }).sort_values("events", ascending=False)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pair", default="gold")
    ap.add_argument("--years", type=float, default=10.0, help="0 = all history")
    ap.add_argument("--event-tf", default="m15")
    ap.add_argument("--level-tfs", default="m15,h1",
                    help="timeframes the FVG / order-block / swing levels are built "
                         "from. Should track --event-tf: M15 events off M15/H1 "
                         "structure, H4 events off H1/H4")
    ap.add_argument("--atr-rank-window", type=int, default=5000,
                    help="bars of history the vol-regime percentile ranks against. "
                         "MUST be scaled to the event timeframe — 5000 bars is "
                         "~2.5 months of M15 but ~3.4 YEARS of H4, which would NaN "
                         "out most of the sample")
    ap.add_argument("--data-root", default="VolRangeForecaster/data/m1")
    ap.add_argument("--day-start-hour", type=int, default=0,
                    help="UTC hour the trading day rolls (0=UTC midnight, 22=NY close)")
    ap.add_argument("--sl-atr", default="0.75,1.5")
    ap.add_argument("--tp-r", default="1.0,2.0,3.0")
    ap.add_argument("--horizon", type=int, default=1440, help="M1 bars of runway")
    ap.add_argument("--cost-mult", type=float, default=1.0)
    ap.add_argument("--entry-mode", default="market", choices=("market", "limit"),
                    help="market = buy the next bar's open, stop sl_atr from the fill "
                         "(lands ~0.36 ATR off the level on gold). limit = rest an "
                         "order AT the level, stop beyond the zone — a test of the "
                         "level rather than of momentum near it")
    ap.add_argument("--folds", type=int, default=6)
    ap.add_argument("--fdr-q", type=float, default=0.10)
    ap.add_argument("--top-k", type=int, default=10)
    ap.add_argument("--select-stat", default="t_lift", choices=("t", "t_lift"),
                    help="t = 'cell made money' (picks up instrument drift); "
                         "t_lift = 'cell beat the same trade at any level' (about levels)")
    ap.add_argument("--null-runs", type=int, default=3)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", default="forge/out")
    ap.add_argument("--confidence", action="store_true",
                    help="also run the confidence-gated search: a small, "
                         "pre-registered (stack/reject/htf_with/dxy_confirm) "
                         "confluence score, threshold>=3, tested as ONE hypothesis "
                         "per level kind rather than a combinatorial search over "
                         "which factors to require. Runs alongside, not instead of, "
                         "the base search — see forge/README.md's 'does confluence "
                         "help' section for what the first gold run found "
                         "(answer: no — high confidence scored WORSE than low)")
    ap.add_argument("--confidence-threshold", type=int, default=3)
    args = ap.parse_args(argv)

    level_tfs = tuple(x.strip() for x in args.level_tfs.split(","))
    sl_grid = tuple(float(x) for x in args.sl_atr.split(","))
    tp_grid = tuple(float(x) for x in args.tp_r.split(","))
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    lab, lv, m1 = build_dataset(args.pair, args.years, args.event_tf, args.data_root,
                                args.day_start_hour, sl_grid, tp_grid, args.horizon,
                                args.cost_mult, entry_mode=args.entry_mode,
                                level_tfs=level_tfs, atr_rank_window=args.atr_rank_window,
                                confidence=args.confidence)

    inv = summarize_inventory(lab)
    inv.to_csv(out_dir / f"{args.pair}_inventory.csv")
    print(f"\n[inventory] top level kinds by event count:\n"
          f"{inv.head(12).to_string()}\n", flush=True)

    print("[walk-forward] REAL levels", flush=True)
    real = V.walk_forward(lab, n_folds=args.folds, q=args.fdr_q, top_k=args.top_k,
                          select_stat=args.select_stat)

    nulls = []
    rng = np.random.default_rng(args.seed)
    for r in range(args.null_runs):
        print(f"[walk-forward] NULL run {r + 1}/{args.null_runs} (randomized level prices)",
              flush=True)
        lv_null = D.randomize_levels(lv, m1, rng, args.day_start_hour)
        lab_n, _, _ = build_dataset(args.pair, args.years, args.event_tf, args.data_root,
                                    args.day_start_hour, sl_grid, tp_grid, args.horizon,
                                    args.cost_mult, levels_override=lv_null, verbose=False,
                                    entry_mode=args.entry_mode, level_tfs=level_tfs,
                                    atr_rank_window=args.atr_rank_window)
        res = V.walk_forward(lab_n, n_folds=args.folds, q=args.fdr_q,
                             top_k=args.top_k, select_stat=args.select_stat,
                             verbose=False)
        nulls.append(res)
        print(f"    null OOS: {res['oos'].get('trades', 0)} trades, "
              f"raw {res['oos'].get('mean_r', float('nan')):+.4f}R, "
              f"excess {res['oos'].get('mean_excess', float('nan')):+.4f}R", flush=True)

    null_means = np.array([n["oos"].get("mean_r", np.nan) for n in nulls], dtype=float)
    null_x = np.array([n["oos"].get("mean_excess", np.nan) for n in nulls], dtype=float)
    null_ts = np.array([n["oos"].get("t_excess", np.nan) for n in nulls], dtype=float)

    conf_real = conf_nulls = None
    if args.confidence:
        print("\n[confidence walk-forward] REAL levels "
              f"(threshold>={args.confidence_threshold}, ~40x smaller hypothesis pool)",
              flush=True)
        conf_real = V.confidence_walk_forward(lab, n_folds=args.folds, q=args.fdr_q,
                                              top_k=args.top_k,
                                              threshold=args.confidence_threshold)
        conf_nulls = []
        rng2 = np.random.default_rng(args.seed + 1000)
        for r in range(args.null_runs):
            print(f"[confidence walk-forward] NULL run {r + 1}/{args.null_runs}", flush=True)
            lv_null = D.randomize_levels(lv, m1, rng2, args.day_start_hour)
            lab_n, _, _ = build_dataset(args.pair, args.years, args.event_tf, args.data_root,
                                        args.day_start_hour, sl_grid, tp_grid, args.horizon,
                                        args.cost_mult, levels_override=lv_null, verbose=False,
                                        entry_mode=args.entry_mode, level_tfs=level_tfs,
                                        atr_rank_window=args.atr_rank_window, confidence=True)
            res = V.confidence_walk_forward(lab_n, n_folds=args.folds, q=args.fdr_q,
                                            top_k=args.top_k,
                                            threshold=args.confidence_threshold, verbose=False)
            conf_nulls.append(res)
            print(f"    null OOS: {res['oos'].get('trades', 0)} trades, "
                  f"excess {res['oos'].get('mean_excess', float('nan')):+.4f}R", flush=True)

    report = {
        "pair": args.pair,
        "config": vars(args),
        "data": {"m1_bars": int(len(m1)), "start": str(m1.index[0]), "end": str(m1.index[-1]),
                 "levels": int(len(lv)), "labelled_rows": int(len(lab))},
        "real": {"folds": real["folds"], "oos": real["oos"], "specs": real["specs"]},
        "null": {"runs": [{"oos": n["oos"]} for n in nulls],
                 "oos_mean_r": null_means.tolist(),
                 "oos_mean_excess": null_x.tolist(), "oos_t_excess": null_ts.tolist()},
        "verdict": D.null_reference(real["oos"].get("t_excess", np.nan), null_ts),
    }
    if args.confidence:
        conf_null_ts = np.array([n["oos"].get("t_excess", np.nan) for n in conf_nulls],
                                dtype=float)
        report["confidence"] = {
            "threshold": args.confidence_threshold,
            "real": {"folds": conf_real["folds"], "oos": conf_real["oos"],
                     "specs": conf_real["specs"]},
            "null": {"runs": [{"oos": n["oos"]} for n in conf_nulls]},
            "verdict": D.null_reference(conf_real["oos"].get("t_excess", np.nan), conf_null_ts),
        }
    (out_dir / f"{args.pair}_report.json").write_text(json.dumps(report, indent=2, default=str))
    if len(real["trades"]):
        real["trades"].to_csv(out_dir / f"{args.pair}_oos_trades.csv", index=False)

    o = real["oos"]
    print("\n" + "=" * 78)
    print(f"REAL levels  OOS: {o.get('trades', 0)} trades over {o.get('days', 0)} days")
    print(f"   raw    mean {o.get('mean_r', float('nan')):+.4f}R  "
          f"t={o.get('t', float('nan')):.2f}   (includes whatever the instrument did)")
    print(f"   excess mean {o.get('mean_excess', float('nan')):+.4f}R  "
          f"t={o.get('t_excess', float('nan')):.2f}   (over the same trade at any level "
          f"— THIS is the level edge)")
    if len(null_means):
        print(f"NULL levels  OOS (randomized prices, {len(null_means)} runs): "
              f"raw {np.nanmean(null_means):+.4f}R, excess {np.nanmean(null_x):+.4f}R, "
              f"best t_excess={np.nanmax(null_ts):.2f}")
        print(f"   → real excess t must clear the null's best to mean anything: "
              f"{o.get('t_excess', float('nan')):.2f} vs {np.nanmax(null_ts):.2f}")
    print("=" * 78)

    if args.confidence:
        co = conf_real["oos"]
        print(f"\nCONFIDENCE-GATED (threshold>={args.confidence_threshold})  "
              f"OOS: {co.get('trades', 0)} trades over {co.get('days', 0)} days")
        print(f"   raw    mean {co.get('mean_r', float('nan')):+.4f}R  "
              f"t={co.get('t', float('nan')):.2f}")
        print(f"   excess mean {co.get('mean_excess', float('nan')):+.4f}R  "
              f"t={co.get('t_excess', float('nan')):.2f}")
        cnt = np.array([n["oos"].get("t_excess", np.nan) for n in conf_nulls], dtype=float)
        if len(cnt):
            print(f"   NULL (randomized, {len(cnt)} runs): best t_excess={np.nanmax(cnt):.2f}")
        print("=" * 78)

    print(f"\nwrote {out_dir / f'{args.pair}_report.json'}")
    return report


if __name__ == "__main__":
    main()
