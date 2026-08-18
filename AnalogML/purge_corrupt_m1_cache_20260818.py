#!/usr/bin/env python3
"""One-shot corrective script -- deletes the 6 R2 M1 cache objects
(analogml/m1/{pair}_m1.parquet) found corrupted/truncated on 2026-08-18,
which were crashing every hourly motif_track_loop run partway through
the detection loop (before save_log()/save_state() ever get called) --
refresh_m1.py's _load_existing() doesn't catch pd.read_parquet() failures,
and pattern_scan.load_bars() in the main detection loop has no per-pair
try/except at all (unlike the refresh loop, which does).

Deleting these lets the next scheduled run treat them as "missing from
R2" (an already-handled, safe path) and re-backfill just these 6 pairs,
instead of crashing on every attempt. This is the immediate-relief half
of the fix; the code-robustness half (catching corruption instead of
crashing) ships separately.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from motif_track import _r2_client, R2_BUCKET  # noqa: E402

BAD_PAIRS = ["chfjpy", "euraud", "eurjpy", "gbpcad", "gbpjpy", "nzdusd"]


def main() -> None:
    s3 = _r2_client()
    if s3 is None:
        print("[purge] no R2 client available -- aborting")
        sys.exit(1)

    for pair in BAD_PAIRS:
        key = f"analogml/m1/{pair}_m1.parquet"
        try:
            s3.head_object(Bucket=R2_BUCKET, Key=key)
        except Exception as e:
            print(f"[purge] {key}: not present or inaccessible ({e}) -- skipping delete")
            continue
        s3.delete_object(Bucket=R2_BUCKET, Key=key)
        print(f"[purge] deleted {key}")

    print("[purge] done")


if __name__ == "__main__":
    main()
