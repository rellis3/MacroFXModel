#!/usr/bin/env python3
"""Convert a CME CVOL EOD parquet export into js/data/cmeCvolEod.json.

Static data, not a live feed. js/impliedVolCore.js (the Node brick that reads
the JSON this script produces) and js/fxVolCarryEngine.js (the VRP backtester
built on top of it) both depend on the exact shape below — don't change field
names without updating both.

Usage:
    python3 scripts/convertCmeCvol.py <path-to-parquet> [--out js/data/cmeCvolEod.json]

Requires pandas + pyarrow (not in requirements.txt — this is a one-off/manual
conversion step, not something server.js runs, so it's deliberately not added
to the root requirements.txt per the Dockerfile note in MD files/CLAUDE.md:
"if a bot's dependencies change, update the root requirements.txt" — this
script isn't a bot, it never runs on Railway).
"""
import argparse
import json
import sys
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = REPO_ROOT / "js" / "data" / "cmeCvolEod.json"


def convert(parquet_path: Path, out_path: Path, generated_date: str) -> None:
    df = pd.read_parquet(parquet_path)
    df = df.sort_values(["product", "timestamp"])

    series = {}
    for product, g in df.groupby("product"):
        rows = []
        for _, r in g.iterrows():
            rows.append({
                "date": r["timestamp"].strftime("%Y-%m-%d"),
                "cvol": _round(r.get("cvol")),
                "atm": _round(r.get("atm")),
                "dnvar": _round(r.get("dnvar")),
                "upvar": _round(r.get("upvar")),
                "skew": _round(r.get("skew")),
                "skewRatio": _round(r.get("skew_ratio")),
                "convexity": _round(r.get("convexity")),
                "underlying": _round(r.get("underlying"), 6),
                "limited": r.get("coverage_status") == "SOURCE_LIMITED",
            })
        series[product] = rows

    meta = {
        "source": "CME_CVOL_EOD_SETTLE",
        "generatedNote": (
            f"Static historical snapshot converted from an uploaded parquet "
            f"({parquet_path.name}) on {generated_date}. Not a live feed — "
            f"re-run this script against a fresh export to update."
        ),
        "products": sorted(series.keys()),
        "rowsPerProduct": {k: len(v) for k, v in series.items()},
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump({"meta": meta, "series": series}, f, separators=(",", ":"))

    total = sum(len(v) for v in series.values())
    print(f"wrote {total} rows across {len(series)} products -> {out_path}")


def _round(v, ndigits=4):
    if v is None or pd.isna(v):
        return None
    return round(float(v), ndigits)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("parquet_path", type=Path)
    p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    p.add_argument("--date", default="2026-08-21", help="Stamp for the generatedNote (YYYY-MM-DD)")
    args = p.parse_args()

    if not args.parquet_path.exists():
        print(f"error: {args.parquet_path} not found", file=sys.stderr)
        sys.exit(1)

    convert(args.parquet_path, args.out, args.date)
