"""upload_bidask_r2.py -- publish the bid/ask history to R2 under `bid-ask/` only.

Two local sources (both the same OANDA feed: spreads and closes agree on every
shared minute, checked 2026-10-20):

  data/m1_bidask/<key>_m1.parquet         -> bid-ask/m1/<key>_m1.parquet
      34 instruments, 2016-10 -> 2026-10, research schema + bid_o..bid_c,
      ask_o..ask_c AFTER `time` (scripts/fetch_m1_oanda.py --price BAM).
      Full bid/ask OHLC: the source for limit/stop fill simulation.
  Oanda Parquet Files/Bid and Ask/<file>   -> bid-ask/oanda-pull/<file>
      spread_open/spread_close per bar (m1 for 9 instruments from 2016-01,
      h1/h4/d1 for ~40 incl. commodities/bonds), plus
      instrument_meta_log.parquet (OANDA financing rates, one snapshot).
  analysis/output/costs/BIDASK_QUALITY.md + bidask_quality.json
                                            -> bid-ask/quality/

Writes bid-ask/manifest.json last (key, bytes, sha256, rows, first/last bar,
columns) so a consumer can verify a download.

SAFETY: every key is asserted to start with `bid-ask/`; nothing under `m1/`
(the research mid cache scripts/r2_download.py reads) is ever touched. An
object already present with the same size is skipped; --force re-uploads.

    railway run python scripts/costs/upload_bidask_r2.py --dry-run
    railway run python scripts/costs/upload_bidask_r2.py
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import boto3
import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parents[2]
R2_ENDPOINT = "https://3e867110ae519cd24afc877c72e5026e.r2.cloudflarestorage.com"
PREFIX = "bid-ask/"
SOURCES = [
    (ROOT / "data" / "m1_bidask", "m1/", "*.parquet"),
    (ROOT / "Oanda Parquet Files" / "Bid and Ask", "oanda-pull/", "*.parquet"),
    (ROOT / "analysis" / "output" / "costs", "quality/", "bidask_quality.json"),
    (ROOT / "analysis" / "output" / "costs", "quality/", "BIDASK_QUALITY.md"),
]
NOTES = {
    "m1/": "Full bid/ask OHLC M1 (OANDA v20 practice pricing, standard spread-only account, no commission). "
           "Columns: research schema + bid_o..bid_c, ask_o..ask_c AFTER `time`. Rows after 2026-08-21 are the "
           "H-A lockbox (forge/LOCKBOX_PROTOCOL.md): truncate before scoring.",
    "oanda-pull/": "spread_open/spread_close per bar (price units) with mid OHLC; instrument_meta_log = OANDA "
                   "instrument specs incl. financing_long/short_rate (annual) - a single as-of snapshot.",
    "quality/": "scripts/costs/check_bidask.py output for m1/.",
}


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def describe(p: Path) -> dict:
    d = {"bytes": p.stat().st_size, "sha256": sha256(p)}
    if p.suffix == ".parquet":
        f = pq.ParquetFile(p)
        d["rows"] = f.metadata.num_rows
        d["columns"] = f.schema_arrow.names
        tcol = next((c for c in ("time", "datetime", "asof") if c in d["columns"]), None)
        if tcol:
            t = f.read(columns=[tcol]).column(0)
            d["first"], d["last"] = str(t[0].as_py()), str(t[len(t) - 1].as_py())
    return d


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    bucket = os.environ.get("R2_BUCKET", "r2-storage")
    s3 = boto3.client("s3", endpoint_url=R2_ENDPOINT, aws_access_key_id=os.environ["R2_ACCESS_KEY"],
                      aws_secret_access_key=os.environ["R2_SECRET_KEY"], region_name="auto")
    existing = {}
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=PREFIX):
        for o in page.get("Contents", []):
            existing[o["Key"]] = o["Size"]

    manifest = {"generated_at": datetime.now(timezone.utc).isoformat(), "bucket": bucket,
                "notes": {PREFIX + k: v for k, v in NOTES.items()}, "files": {}}
    up = skip = total = 0
    for src, sub, pattern in SOURCES:
        if not src.exists():
            print(f"missing source {src}, skipped", flush=True)
            continue
        for p in sorted(src.glob(pattern)):
            key = PREFIX + sub + p.name
            assert key.startswith(PREFIX), key                    # never write outside bid-ask/
            manifest["files"][key] = describe(p)
            size = manifest["files"][key]["bytes"]
            if not a.force and existing.get(key) == size:
                skip += 1
                continue
            total += size
            print(f"{'would upload' if a.dry_run else 'upload'} {key} ({size / 1e6:.1f} MB)", flush=True)
            if not a.dry_run:
                s3.upload_file(str(p), bucket, key)
            up += 1
    print(f"{up} to upload ({total / 1e9:.2f} GB), {skip} already present", flush=True)
    if not a.dry_run:
        s3.put_object(Bucket=bucket, Key=PREFIX + "manifest.json",
                      Body=json.dumps(manifest, indent=1).encode(), ContentType="application/json")
        print("wrote", PREFIX + "manifest.json", flush=True)


if __name__ == "__main__":
    main()
