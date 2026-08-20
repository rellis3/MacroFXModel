"""run_vol — CLI: the deferred COG-gap follow-up, finally run.

    python -m forge.run_vol --years 10 --folds 6

For every instrument with local M1 data, walk-forwards a small pre-registered
grid (6 sigma estimators × 2 width sources = 12 configs) selecting by combined
High-Low pinball loss on train, scoring the frozen winner OOS. Reports whether
a faster estimator (or the naive non-adaptive baseline) wins, and whether
gold's documented gap to the incumbent 30-day Yang-Zhang production estimator
survives once width is calibrated to REALIZED range instead of Feller's or
COG's constant. See `forge/vol.py`'s module docstring and
`MD files/COG_GAP_FINDINGS.md` for the question this answers.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from forge import ff_calendar as FF
from forge import vol as V
from forge.xsect import discover_universe


def run_one(pair: str, years: float, folds: int, data_root: str,
           day_start_hour: int, verbose: bool, event_tags: dict | None = None,
           end: str | None = None) -> dict:
    daily = V.load_daily(pair, data_root, day_start_hour, years, end=end)
    frame = V.build_forecast_frame(daily, event_tags=event_tags)
    if verbose:
        print(f"[{pair}] {len(frame):,} daily bars, {frame['date'].min():%Y-%m-%d} → "
              f"{frame['date'].max():%Y-%m-%d}", flush=True)
    result = V.walk_forward_vol(frame, n_folds=folds, verbose=verbose)

    oos_folds = [f for f in result["folds"] if f["oos"] is not None]
    if not oos_folds:
        return {"pair": pair, "n_days": len(frame), "folds": result["folds"], "specs": result["specs"]}

    incumbent_wins = sum(1 for f in oos_folds if f["estimator"] == "yz_30")
    naive_wins = sum(1 for f in oos_folds if f["estimator"] == "naive")
    faster_wins = len(oos_folds) - incumbent_wins - naive_wins
    mean_pinball = float(np.mean([f["oos"]["combined_hl_pinball"] for f in oos_folds]))
    mean_exceed50 = float(np.mean([f["oos"]["exceed_hl_p50"] for f in oos_folds
                                   if np.isfinite(f["oos"]["exceed_hl_p50"])]))
    mean_exceed75 = float(np.mean([f["oos"]["exceed_hl_p75"] for f in oos_folds
                                   if np.isfinite(f["oos"]["exceed_hl_p75"])]))

    return {
        "pair": pair, "n_days": len(frame), "folds": result["folds"], "specs": result["specs"],
        "summary": {
            "n_folds": len(oos_folds),
            "incumbent_yz30_selected": incumbent_wins,
            "naive_selected": naive_wins,
            "faster_estimator_selected": faster_wins,
            "mean_oos_combined_hl_pinball": mean_pinball,
            "mean_oos_exceed_hl_p50": mean_exceed50,
            "mean_oos_exceed_hl_p75": mean_exceed75,
            "calibration_gap_50": mean_exceed50 - 0.50,
            "calibration_gap_75": mean_exceed75 - 0.25,
        },
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pairs", default="", help="comma-separated; empty = full local universe")
    ap.add_argument("--years", type=float, default=10.0)
    ap.add_argument("--folds", type=int, default=6)
    ap.add_argument("--data-root", default="VolRangeForecaster/data/m1")
    ap.add_argument("--day-start-hour", type=int, default=0)
    ap.add_argument("--end", default="", help="truncate price data here (use the calendar's "
                                              "last covered date when fitting the event layer)")
    ap.add_argument("--out", default="forge/out_vol")
    ap.add_argument("--calendar", default="data/calendar/ff_calendar_2007_2025.csv",
                    help="ForexFactory historical calendar (date-repaired by forge.ff_calendar); "
                         "'' disables the event layer")
    ap.add_argument("--verbose-pairs", default="gold",
                    help="comma-separated pairs to print fold-by-fold detail for")
    args = ap.parse_args(argv)

    universe = V.discover_full_universe(args.data_root)
    want = [p.strip() for p in args.pairs.split(",") if p.strip()]
    if want:
        universe = {p: r for p, r in universe.items() if p in want}
    pairs = sorted(universe)
    verbose_set = {p.strip() for p in args.verbose_pairs.split(",") if p.strip()}
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Tags are PER INSTRUMENT now: an AUD pair is graded on AU releases as well as US
    # ones. The heavy parse happens once inside ff_calendar; the per-pair step is a
    # currency filter.
    ff_df = None
    covered = None
    legacy_tags = None
    if args.calendar.endswith("calendar_events.csv"):
        # Control arm: the pre-ForexFactory calendar, US-only, so a run can isolate
        # "did the calendar change help?" from "did the data window change?".
        legacy_tags = V.load_event_tags(args.calendar)
        print(f"[calendar] LEGACY US-only source: {len(legacy_tags)} tagged days", flush=True)
    elif args.calendar:
        try:
            ff_df = FF.load_repaired(args.calendar)
            covered = (ff_df["date"].min(), ff_df["date"].max())
            audit = FF.validate(ff_df)
            scored = audit[audit["n"] > 0]
            print(f"[calendar] {len(ff_df):,} rows {covered[0]} -> {covered[1]} | "
                  f"date audit mean {scored['before'].mean():.3f} -> {scored['after'].mean():.3f} "
                  f"(share on the known release weekday)", flush=True)
        except OSError as e:
            print(f"[calendar] unavailable ({e}) — running without the event layer", flush=True)

    print(f"[universe] {len(pairs)} instruments", flush=True)
    results = {}
    for pair in pairs:
        v = pair in verbose_set
        if v:
            print(f"\n=== {pair} ===", flush=True)
        tags = legacy_tags
        if ff_df is not None:
            inst = V.NAME_FOR_PAIR.get(pair, pair.upper())
            tags = {"tags": FF.event_tags(ff_df, FF.instrument_currencies(inst)),
                    "covered": covered}
        results[pair] = run_one(pair, args.years, args.folds, universe[pair],
                                args.day_start_hour, verbose=v, event_tags=tags,
                                end=args.end or None)
        if not v:
            s = results[pair].get("summary")
            if s:
                print(f"[{pair}] {s['n_folds']} folds | yz30 selected {s['incumbent_yz30_selected']}x, "
                      f"naive {s['naive_selected']}x, faster {s['faster_estimator_selected']}x | "
                      f"exceed50={s['mean_oos_exceed_hl_p50']:.2f} exceed75={s['mean_oos_exceed_hl_p75']:.2f}",
                      flush=True)

    (out_dir / "vol_report.json").write_text(json.dumps(results, indent=2, default=str))

    summaries = {p: r["summary"] for p, r in results.items() if r.get("summary")}
    print("\n" + "=" * 100)
    print(f"{'pair':>8} {'folds':>5} {'yz30':>5} {'naive':>6} {'faster':>7} "
          f"{'pinball':>8} {'exceed50':>9} {'exceed75':>9} {'gap50':>7} {'gap75':>7}")
    for p, s in summaries.items():
        print(f"{p:>8} {s['n_folds']:>5} {s['incumbent_yz30_selected']:>5} "
              f"{s['naive_selected']:>6} {s['faster_estimator_selected']:>7} "
              f"{s['mean_oos_combined_hl_pinball']:>8.4f} {s['mean_oos_exceed_hl_p50']:>9.2f} "
              f"{s['mean_oos_exceed_hl_p75']:>9.2f} {s['calibration_gap_50']:>+7.2f} "
              f"{s['calibration_gap_75']:>+7.2f}")
    print("=" * 100)

    n = len(summaries)
    if n:
        yz30 = sum(s["incumbent_yz30_selected"] for s in summaries.values())
        naive = sum(s["naive_selected"] for s in summaries.values())
        faster = sum(s["faster_estimator_selected"] for s in summaries.values())
        total_folds = yz30 + naive + faster
        print(f"\nAcross {n} instruments, {total_folds} fold-selections: "
              f"incumbent yz_30 chosen {yz30} ({yz30/total_folds:.0%}), "
              f"naive chosen {naive} ({naive/total_folds:.0%}), "
              f"a faster estimator chosen {faster} ({faster/total_folds:.0%})")
        gold = summaries.get("gold")
        if gold:
            others_gap50 = np.mean([s["calibration_gap_50"] for p, s in summaries.items() if p != "gold"])
            print(f"gold calibration_gap_50={gold['calibration_gap_50']:+.2f} vs "
                  f"FX-universe mean={others_gap50:+.2f} "
                  f"(0 = perfectly calibrated; the documented COG gap was gold-specific)")

    print(f"\nwrote {out_dir / 'vol_report.json'}")
    return results


if __name__ == "__main__":
    main()
