"""run_horizons — fit the weekly and monthly width multipliers onto an existing
daily vol run, in place.

    python -m forge.run_horizons --report forge/out_vol_v2/vol_report.json

Deliberately NOT a second estimator search. The weekly and monthly exports reuse
the daily sigma scaled by sqrt-time (the convention the page already uses); the
only thing that needs its own fit is the WIDTH, because sqrt-scaling a sigma and
sqrt-scaling a range QUANTILE are different claims — vol mean-reverts inside a
week, so a week's range runs narrower than five independent days imply.

Reuses each pair's frozen final-fold estimator and its train/test boundary, so the
horizon rungs are fit on exactly the data the daily rungs were fit on and scored on
exactly the data the daily rungs were scored on — no new lookahead is introduced.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from forge import vol as V

HORIZONS = ("weekly", "monthly")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--report", default="forge/out_vol_v2/vol_report.json")
    ap.add_argument("--years", type=float, default=10.0)
    ap.add_argument("--data-root", default="VolRangeForecaster/data/m1")
    ap.add_argument("--day-start-hour", type=int, default=0)
    ap.add_argument("--calendar", default="calendar_events.csv")
    args = ap.parse_args(argv)

    path = Path(args.report)
    report = json.loads(path.read_text(encoding="utf-8"))
    universe = V.discover_full_universe(args.data_root)
    tags = None
    if args.calendar:
        try:
            tags = V.load_event_tags(args.calendar)
        except OSError:
            pass

    done = 0
    for pair, rec in sorted(report.items()):
        specs = rec.get("specs") or []
        folds = [f for f in rec.get("folds") or [] if f.get("oos")]
        if not specs or not folds or pair not in universe:
            continue
        spec, last = specs[-1], folds[-1]
        est = spec.get("estimator")
        split = pd.Timestamp(last["train_end"])

        daily = V.load_daily(pair, universe[pair], args.day_start_hour, args.years)
        frame = V.build_forecast_frame(daily, event_tags=tags)

        horizons = {}
        for hz in HORIZONS:
            width = V.fit_horizon_widths(daily, frame, est, hz, train_end=split)
            if not width:
                continue
            oos = V.score_horizon(daily, frame, est, hz, width, test_start=split)
            meta = {k: width.pop(k) for k in ("_n", "_n_effective", "_overlapping") if k in width}
            horizons[hz] = {
                "width_mult": width,
                "n_train": meta.get("_n"),
                "n_effective": meta.get("_n_effective"),
                "overlapping": meta.get("_overlapping"),
                "oos_exceed": oos,
            }
        if horizons:
            spec["horizons"] = horizons
            done += 1
            wk = horizons.get("weekly", {}).get("oos_exceed", {})
            mo = horizons.get("monthly", {}).get("oos_exceed", {})
            print(f"[{pair}] weekly OOS p50/p75/p90 "
                  f"{wk.get('BM_P50')}/{wk.get('BM_P75')}/{wk.get('BM_P90')} | monthly "
                  f"{mo.get('BM_P50')}/{mo.get('BM_P75')}/{mo.get('BM_P90')}", flush=True)

    path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print(f"\nwrote horizon widths for {done} instruments -> {path}")


if __name__ == "__main__":
    main()
