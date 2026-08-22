#!/usr/bin/env python3
"""Convert the CBOE future-market volatility context export (GVZ + VXN) into
js/data/cboeVolIndices.json.

Static data, not a live feed — same status as js/data/cmeCvolEod.json (see
scripts/convertCmeCvol.py). js/impliedVolCore.js's loadCboeVolSeries() reads
the exact shape below; don't change field names without updating both.

Usage:
    python3 scripts/convertCboeVolContext.py <path-to-combined-csv-or-parquet> [--out js/data/cboeVolIndices.json]

Expects the combined `future_market_volatility_context_*` file (columns:
date, target_symbol, source, source_symbol, data_family, open, high, low,
close) — one row per (date, target_symbol), target_symbol in {NAS100 (VXN),
XAUUSD (GVZ)}. GVZ has close only (CBOE doesn't publish OHLC for it); VXN has
full OHLC.
"""
import argparse
import json
import sys
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = REPO_ROOT / "js" / "data" / "cboeVolIndices.json"


def _round(v, ndigits=4):
    if v is None or pd.isna(v):
        return None
    return round(float(v), ndigits)


def convert(src_path: Path, out_path: Path, generated_date: str) -> None:
    df = pd.read_parquet(src_path) if src_path.suffix == ".parquet" else pd.read_csv(src_path)
    df = df.sort_values(["target_symbol", "date"])

    series = {}
    for symbol, g in df.groupby("target_symbol"):
        rows = []
        for _, r in g.iterrows():
            rows.append({
                "date": str(r["date"])[:10],
                "source": r.get("source_symbol"),   # 'GVZ' | 'VXN'
                "open": _round(r.get("open")),
                "high": _round(r.get("high")),
                "low": _round(r.get("low")),
                "close": _round(r.get("close")),
            })
        series[symbol] = rows

    meta = {
        "source": "CBOE",
        "generatedNote": (
            f"Static historical snapshot converted from a CBOE future-market "
            f"volatility context export ({src_path.name}) on {generated_date}. "
            f"Not a live feed — re-run this script against a fresh export to update."
        ),
        "products": sorted(series.keys()),
        "sourceBySymbol": {k: v[0]["source"] if v else None for k, v in series.items()},
        "rowsPerProduct": {k: len(v) for k, v in series.items()},
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump({"meta": meta, "series": series}, f, separators=(",", ":"))

    total = sum(len(v) for v in series.values())
    print(f"wrote {total} rows across {len(series)} products -> {out_path}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("src_path", type=Path)
    p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    p.add_argument("--date", default="2026-08-22", help="Stamp for the generatedNote (YYYY-MM-DD)")
    args = p.parse_args()

    if not args.src_path.exists():
        print(f"error: {args.src_path} not found", file=sys.stderr)
        sys.exit(1)

    convert(args.src_path, args.out, args.date)
