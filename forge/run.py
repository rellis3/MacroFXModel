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

ROUND_STEPS = {"gold": (50.0, 10.0)}


def build_dataset(pair: str, years: float, event_tf: str, data_root: str,
                  day_start_hour: int, sl_grid, tp_grid, horizon: int,
                  cost_mult: float, levels_override=None, verbose: bool = True,
                  entry_mode: str = "market"):
    """Everything up to and including labelled events. Returns (lab, levels, m1)."""
    m1 = B.load_m1(pair, data_root)
    if years:
        cutoff = m1.index[-1] - pd.Timedelta(days=365.25 * years)
        m1 = m1[m1.index >= cutoff]
    if verbose:
        print(f"[data] {pair}: {len(m1):,} M1 bars  {m1.index[0]:%Y-%m-%d} → "
              f"{m1.index[-1]:%Y-%m-%d}  price {m1['close'].iloc[0]:.0f} → "
              f"{m1['close'].iloc[-1]:.0f}", flush=True)

    tfs = sorted({event_tf, "m15", "h1", "h4"})
    frames = {tf: B.frame(m1, tf, day_start_hour=day_start_hour) for tf in tfs}

    if levels_override is None:
        lv = L.build_levels(m1, {k: frames[k] for k in ("m15", "h1")},
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
                          feature_offset=(-1 if entry_mode == "limit" else 0))
    if verbose:
        print(f"[events] {len(ev):,} level interactions", flush=True)

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
    args = ap.parse_args(argv)

    sl_grid = tuple(float(x) for x in args.sl_atr.split(","))
    tp_grid = tuple(float(x) for x in args.tp_r.split(","))
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    lab, lv, m1 = build_dataset(args.pair, args.years, args.event_tf, args.data_root,
                                args.day_start_hour, sl_grid, tp_grid, args.horizon,
                                args.cost_mult, entry_mode=args.entry_mode)

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
                                    entry_mode=args.entry_mode)
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
    print(f"\nwrote {out_dir / f'{args.pair}_report.json'}")
    return report


if __name__ == "__main__":
    main()
