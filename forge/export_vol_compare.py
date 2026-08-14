"""export_vol_compare — write the walk-forward OOS forecast history to a JSON
artifact `vol-forecast-v2.html`'s comparison table can read, alongside the
Old/YZ/HV20/EWMA/Ref/New columns already there.

This is the "how do we see the output to verify" answer: for every date in
the study window, it exports what the walk-forward-selected estimator
predicted for that day (using only data strictly before that day's fold —
`vol.oos_predictions` already enforces this, see its own docstring and
`vol_test.py`'s regression test) AND what actually happened, so the page can
show forecast-vs-reality, not just forecast-vs-COG's-number the way the
existing Old/YZ/HV20/EWMA/Ref/New columns do.

Deliberately a STATIC file, not a live KV write: this sandbox has no
credentials for the live KV store the existing `/api/vol-forecast/compare/
:date` endpoint reads from (`js/volForecastScheduler.js` populates it from a
running server), and shouldn't fabricate that connection. A new, separate,
read-only server.js route (`/api/vol-forecast/compare-forge/:date`) reads
this committed file instead — see that route for how it's served. This keeps
the addition fully independent of the live-KV-backed endpoint: nothing here
can affect its behavior, even if this export is wrong or stale.

    python -m forge.export_vol_compare --years 10 --folds 6
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from forge import vol as V

DEFAULT_OUT = "forge/out_vol/compare_export.json"


def export_one(pair: str, data_root: str, years: float, folds: int,
               day_start_hour: int) -> dict:
    daily = V.load_daily(pair, data_root, day_start_hour, years)
    frame = V.build_forecast_frame(daily)
    oos = V.oos_predictions(frame, n_folds=folds)
    by_date = {}
    for _, row in oos.iterrows():
        date = row["date"].strftime("%Y-%m-%d")
        by_date[date] = {
            "forge_vol": round(float(row["sigma_annual_pct"]), 3),
            "forge_hl": round(float(row["hl_p50"]), 3),
            "forge_hl_75": round(float(row["hl_p75"]), 3),
            "forge_oc": round(float(row["oc_p50"]), 3),
            "forge_oc_75": round(float(row["oc_p75"]), 3),
            "forge_estimator": f"{row['estimator']}+{row['width_source']}",
            "realized_hl": round(float(row["realized_hl_pct"]), 3),
            "realized_oc": round(float(row["realized_oc_pct"]), 3),
        }
    return by_date


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--years", type=float, default=10.0)
    ap.add_argument("--folds", type=int, default=6)
    ap.add_argument("--day-start-hour", type=int, default=0)
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--pairs", default="", help="comma-separated; empty = full universe")
    args = ap.parse_args(argv)

    universe = V.discover_full_universe()
    if args.pairs:
        want = {p.strip() for p in args.pairs.split(",") if p.strip()}
        universe = {p: r for p, r in universe.items() if p in want}
    print(f"[universe] {len(universe)} instruments: {', '.join(sorted(universe))}", flush=True)

    # date -> instrument -> {forge_*, realized_*} — one file, keyed the way
    # the new server.js route needs to look things up by date first (matching
    # how the existing KV-backed endpoint is keyed by date).
    by_date: dict[str, dict] = {}
    for pair, root in sorted(universe.items()):
        print(f"[{pair}] exporting ({root})...", flush=True)
        per_date = export_one(pair, root, args.years, args.folds, args.day_start_hour)
        for date, vals in per_date.items():
            by_date.setdefault(date, {})[pair] = vals
        print(f"[{pair}] {len(per_date)} OOS dates", flush=True)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(by_date, separators=(",", ":")))
    n_dates = len(by_date)
    n_rows = sum(len(v) for v in by_date.values())
    print(f"\nwrote {out_path}: {n_dates:,} dates, {n_rows:,} (date, instrument) rows, "
          f"{out_path.stat().st_size / 1e6:.1f} MB", flush=True)


if __name__ == "__main__":
    main()
