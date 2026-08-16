#!/usr/bin/env python3
"""Read-only audit: fetch motif_trades.json fresh from R2 and list every
trade whose resolved_at falls in the exact window my erroneous local test
run wrote to production (2026-08-15T22:33:55 - 22:34:17Z). This is a
read-only diagnostic, no writes."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from motif_track import _r2_client, R2_BUCKET, R2_LOG_KEY  # noqa: E402

WINDOW_START = "2026-08-15T22:33:55"
WINDOW_END = "2026-08-15T22:34:17"


def main() -> None:
    s3 = _r2_client()
    if s3 is None:
        print("[audit] no R2 client available")
        sys.exit(1)
    obj = s3.get_object(Bucket=R2_BUCKET, Key=R2_LOG_KEY)
    log = json.loads(obj["Body"].read())
    trades = log.get("trades", [])
    print(f"[audit] total trades: {len(trades)}")
    print(f"[audit] R2 object LastModified: {obj['LastModified']}")

    # Broad pass: ANY trade carrying a resolved_at field at all (clean
    # records shouldn't have this field -- it's introduced by the run that
    # resolves open trades against fresh bars).
    all_resolved = [t for t in trades if t.get("resolved_at")]
    resolved_at_values = sorted({t["resolved_at"] for t in all_resolved})
    print(f"[audit] total trades with ANY resolved_at field: {len(all_resolved)}")
    print(f"[audit] distinct resolved_at timestamps: {len(resolved_at_values)}")
    for v in resolved_at_values:
        print(f"   {v}")

    by_pair_all = {}
    for t in all_resolved:
        by_pair_all.setdefault(t.get("pair"), []).append(t)
    print("[audit] resolved_at-bearing trades by pair:")
    for pair, ts in sorted(by_pair_all.items()):
        print(f"  {pair}: {len(ts)}")

    # Cluster pass: group resolved_at-bearing trades by (date, hour, minute)
    # to find the exact burst my bad run produced on 2026-08-15.
    from collections import Counter
    day_clusters = Counter()
    for t in all_resolved:
        ra = t["resolved_at"]
        if ra.startswith("2026-08-15"):
            day_clusters[ra[:16]] += 1  # YYYY-MM-DDTHH:MM
    print("[audit] 2026-08-15 resolved_at clusters (minute-granularity):")
    for k, v in sorted(day_clusters.items()):
        print(f"   {k}: {v}")

    matches = []
    for t in trades:
        ra = t.get("resolved_at")
        if ra and ra.startswith("2026-08-15T22:3"):
            matches.append(t)

    by_pair = {}
    for t in matches:
        by_pair.setdefault(t.get("pair"), []).append(t)

    print(f"[audit] matched {len(matches)} trades in narrow corruption window")
    for pair, ts in sorted(by_pair.items()):
        print(f"  {pair}: {len(ts)}")

    print("[audit] motif_keys (narrow window):")
    for t in matches:
        print(f"  {t.get('motif_key')!r}  pair={t.get('pair')} status={t.get('status')} "
              f"exit_date={t.get('exit_date')} r={t.get('r')}")


if __name__ == "__main__":
    main()
